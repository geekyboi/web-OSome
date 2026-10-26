/* Yamaha MusicCast: what the amplifier is playing, from its local HTTP API
   (http://<amp>/YamahaExtendedControl/v1/...), and play/pause. Main zone. */
var http = require('http');

var BASE = '/YamahaExtendedControl/v1/';
// Inputs that report through netusb/getPlayInfo (streaming services, network, USB, Bluetooth...)
var NETUSB = /^(net_radio|napster|spotify|juke|qobuz|tidal|deezer|amazon_music|alexa|airplay|bluetooth|server|usb|pandora|siriusxm|rhapsody|mc_link|radiko|tunein|pc|ipod|soundcloud|apple_music)$/;
var NICE = {
  net_radio: 'Net Radio', spotify: 'Spotify', tidal: 'TIDAL', deezer: 'Deezer', qobuz: 'Qobuz', napster: 'Napster',
  amazon_music: 'Amazon Music', alexa: 'Alexa', airplay: 'AirPlay', bluetooth: 'Bluetooth', server: 'Server',
  usb: 'USB', pandora: 'Pandora', siriusxm: 'SiriusXM', mc_link: 'MusicCast Link', tuner: 'Tuner', cd: 'CD',
  tunein: 'TuneIn', soundcloud: 'SoundCloud', apple_music: 'Apple Music'
};

function cleanHost(h) {
  h = String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /^[a-z0-9.\-]{1,253}(:\d{1,5})?$/i.test(h) ? h : '';
}

function get(host, path, cb) {
  var done = false;
  function end(err, j) { if (!done) { done = true; cb(err, j); } }
  var hp = host.split(':');
  var req = http.get({ host: hp[0], port: hp[1] ? +hp[1] : 80, path: BASE + path, headers: { 'X-AppName': 'MusicCast/1.0(TVHome)' } }, function (res) {
    var chunks = [], size = 0;
    res.on('data', function (c) { size += c.length; if (size > 512 * 1024) { req.abort(); end(new Error('Reply too large')); return; } chunks.push(c); });
    res.on('end', function () {
      if (res.statusCode !== 200) { end(new Error('The amplifier answered ' + res.statusCode + '. Is it a MusicCast device?')); return; }
      var j;
      try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { end(new Error('That isn’t a MusicCast device (unexpected reply).')); return; }
      if (j.response_code !== 0 && j.response_code !== undefined) { end(new Error('The amplifier refused the request (code ' + j.response_code + ').')); return; }
      end(null, j);
    });
  });
  req.on('error', function (e) { end(new Error(e.code === 'EHOSTUNREACH' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ? 'Can’t reach the amplifier at ' + host + '.' : e.message)); });
  req.setTimeout(4000, function () { req.abort(); end(new Error('The amplifier at ' + host + ' didn’t answer.')); });
}

var nameCache = {};          // host -> { at, names: { input id -> name set on the amp } }
function inputNames(host, cb) {
  var c = nameCache[host];
  if (c && Date.now() - c.at < 10 * 60 * 1000) { cb(c.names); return; }
  get(host, 'system/getNameText', function (err, j) {
    var names = {};
    if (!err && j && j.input_list) { j.input_list.forEach(function (x) { if (x && x.id && x.text) { names[x.id] = x.text; } }); }
    nameCache[host] = { at: Date.now(), names: names };
    cb(names);
  });
}

function artUrl(host, u) {
  if (!u || typeof u !== 'string') { return ''; }
  if (/^https?:\/\//i.test(u)) { return u; }
  return 'http://' + host + (u.charAt(0) === '/' ? '' : '/') + u;
}
function freq(kHz, band) {
  if (!kHz) { return ''; }
  return band === 'am' ? kHz + ' kHz AM' : (kHz / 1000).toFixed(kHz % 100 ? 2 : 1) + ' FM';
}

/* -> { power, input, inputName, source: 'netusb'|'tuner'|'cd'|'other', playback, track, artist, album, art, playTime, totalTime } */
function nowPlaying(host, cb) {
  host = cleanHost(host);
  if (!host) { cb(new Error('Enter the amplifier’s IP address.')); return; }
  get(host, 'main/getStatus', function (err, st) {
    if (err) { cb(err); return; }
    var out = { power: st.power || 'unknown', input: st.input || '', volume: st.volume, mute: !!st.mute,
      source: 'other', playback: 'stop', track: '', artist: '', album: '', art: '', playTime: 0, totalTime: 0 };
    if (out.power !== 'on') { cb(null, out); return; }
    inputNames(host, function (names) {
      out.inputName = names[out.input] || NICE[out.input] || out.input;
      var inp = out.input;
      if (NETUSB.test(inp)) {
        get(host, 'netusb/getPlayInfo', function (e2, p) {
          if (e2) { cb(null, out); return; }
          out.source = 'netusb';
          out.playback = p.playback || 'stop';
          out.track = p.track || ''; out.artist = p.artist || ''; out.album = p.album || '';
          // e.g. "/YamahaRemoteControl/AlbumART/AlbumART3888.jpg" on the amp. Used exactly as given:
          // the amp's web server won't serve it with anything added (the number changes per track).
          out.art = artUrl(host, p.albumart_url);
          var m = /^\/?YamahaRemoteControl\/([A-Za-z0-9_\/.\-]+)$/.exec(p.albumart_url || '');
          out.artPath = m && m[1].indexOf('..') < 0 ? m[1] : '';
          out.playTime = p.play_time >= 0 ? p.play_time : null;    // -60000 = the amp doesn't know (e.g. Spotify Connect)
          out.totalTime = p.total_time > 0 ? p.total_time : 0;
          if (inp === 'net_radio' && !out.album && out.artist && !out.track) { out.track = out.artist; out.artist = ''; }
          cb(null, out);
        });
      } else if (inp === 'tuner') {
        get(host, 'tuner/getPlayInfo', function (e2, p) {
          if (e2) { cb(null, out); return; }
          out.source = 'tuner'; out.playback = 'play';
          var band = p.band || 'fm';
          if (band === 'dab' && p.dab) {
            out.track = p.dab.service_label || p.dab.ensemble_label || 'DAB';
            out.artist = p.dab.dls || '';
          } else {
            var b = p[band] || {};
            var rds = p.rds || {};
            out.track = (band === 'fm' && rds.program_service ? rds.program_service.trim() : '') || freq(b.freq, band);
            out.artist = band === 'fm' ? (rds.radio_text_a || rds.radio_text_b || '').trim() : '';
            out.album = out.track !== freq(b.freq, band) ? freq(b.freq, band) : '';
          }
          cb(null, out);
        });
      } else if (inp === 'cd') {
        get(host, 'cd/getPlayInfo', function (e2, p) {
          if (e2) { cb(null, out); return; }
          out.source = 'cd';
          out.playback = p.playback || 'stop';
          out.track = p.track || (p.play_track ? 'Track ' + p.play_track : '');
          out.artist = p.artist || ''; out.album = p.album || '';
          out.playTime = p.play_time >= 0 ? p.play_time : null;    // -60000 = the amp doesn't know (e.g. Spotify Connect)
          out.totalTime = p.total_time > 0 ? p.total_time : 0;
          cb(null, out);
        });
      } else {
        cb(null, out);                 // HDMI, TV, optical...: nothing to show
      }
    });
  });
}

// Artwork through the service: http://127.0.0.1:8419/p/nowplaying/art/AlbumART/AlbumART3888.jpg
// -> http://<amp>/YamahaRemoteControl/AlbumART/AlbumART3888.jpg
function pipeArt(host, rel, res) {
  host = cleanHost(host);
  if (!host || !/^[A-Za-z0-9_\/.\-]+$/.test(rel) || rel.indexOf('..') >= 0) { res.writeHead(404); res.end(); return; }
  var hp = host.split(':');
  var req = http.get({ host: hp[0], port: hp[1] ? +hp[1] : 80, path: '/YamahaRemoteControl/' + rel }, function (r) {
    var type = r.headers['content-type'] || 'image/jpeg';
    if (r.statusCode !== 200 || !/^image\//i.test(type)) { r.resume(); res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600', 'Access-Control-Allow-Origin': '*' });
    r.pipe(res);
  });
  req.on('error', function () { if (!res.headersSent) { res.writeHead(502); } res.end(); });
  req.setTimeout(5000, function () { req.abort(); });
}

// Play or pause (playback 'play' or 'pause') what the amp is playing: source 'netusb' or 'cd'.
function setPlayback(host, source, playback, cb) {
  host = cleanHost(host);
  if (!host) { cb(new Error('Enter the amplifier’s IP address.')); return; }
  if (!/^(play|pause)$/.test(playback) || !/^(netusb|cd)$/.test(source)) { cb(new Error('Can’t do that.')); return; }
  get(host, source + '/setPlayback?playback=' + playback, function (err) { cb(err || null); });
}

function deviceInfo(host, cb) {
  host = cleanHost(host);
  if (!host) { cb(new Error('Enter the amplifier’s IP address.')); return; }
  get(host, 'system/getDeviceInfo', function (err, j) {
    if (err) { cb(err); return; }
    cb(null, { model: j.model_name || 'MusicCast device' });
  });
}

module.exports = { cleanHost: cleanHost, nowPlaying: nowPlaying, setPlayback: setPlayback, deviceInfo: deviceInfo, pipeArt: pipeArt };
