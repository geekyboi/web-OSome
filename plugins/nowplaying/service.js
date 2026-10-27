/* Now playing plugin, the service part: what a Yamaha MusicCast amplifier is playing. The TV
   asks every few seconds while the home screen is showing; answers are shared for a moment
   so the TV and editors don't each hit the amplifier. Also passes the album art through
   (the TV app loads it from here), and plays or pauses for the TV. Settings: { host }. Plain ES5. */
'use strict';
var musiccast = require('./musiccast.js');

module.exports = {
  settings: {
    legacy: ['musiccastHost'],
    migrate: function (s) { return s.musiccastHost !== undefined ? { host: s.musiccastHost || '' } : null; },
    clean: function (s) { return { host: typeof s.host === 'string' ? musiccast.cleanHost(s.host) : '' }; }
  },

  start: function (api) {
    var amp = { host: '', at: 0, result: null, waiting: [] };
    function ampNow(cb) {
      var host = api.settings().host || '';
      if (!host) { cb({ returnValue: true, configured: false }); return; }
      if (amp.host === host && amp.result && Date.now() - amp.at < 1500) { cb(amp.result); return; }
      amp.waiting.push(cb);
      if (amp.waiting.length > 1) { return; }
      musiccast.nowPlaying(host, function (err, np) {
        var r = err ? { returnValue: true, configured: true, error: err.message }
                    : { returnValue: true, configured: true, now: np, at: Date.now() };
        amp.host = host; amp.at = Date.now(); amp.result = r;
        var w = amp.waiting; amp.waiting = [];
        w.forEach(function (f) { f(r); });
      });
    }

    // the TV app: { configured, now: { power, inputName, source, playback, track, artist, album, art, playTime, totalTime }, error }
    api.method('now', function (params, reply) { ampNow(reply); });
    // the TV app's buttons: { playback: 'play' | 'pause' | 'next' | 'previous' }
    api.method('playback', function (params, reply) {
      var host = api.settings().host || '';
      var now = amp.host === host && amp.result && amp.result.now;
      musiccast.setPlayback(host, now && now.source === 'cd' ? 'cd' : 'netusb', params.playback, function (err) {
        amp.at = 0;                                // the next 'now' asks the amp again
        reply(err ? { returnValue: false, errorText: err.message } : { returnValue: true });
      });
    });
    // album art from the amplifier, for the TV app (and the editor)
    api.route('GET', 'art/', function (req, res, q, rest) {
      musiccast.pipeArt(api.settings().host || '', rest, res);
    }, { local: true });

    // the editor
    api.route('GET', 'now', function (req, res) { ampNow(function (r) { api.sendJson(res, 200, r); }); });
    api.route('POST', 'test', function (req, res) {
      api.readJson(req, 1024, function (j) {
        musiccast.deviceInfo(j.host, function (e2, info) {
          if (e2) { api.sendJson(res, 200, { ok: false, error: e2.message }); return; }
          musiccast.nowPlaying(j.host, function (e3, np) {
            api.sendJson(res, 200, { ok: true, model: info.model, now: e3 ? null : np });
          });
        });
      });
    });

    return {};
  }
};
