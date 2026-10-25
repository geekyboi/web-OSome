/* TV Home: where Settings finds apps to add. Three sources:
     - TV inputs       the HDMI ports and Live TV, with the names set on the TV
     - TV apps         the TV's launcher list (asked directly, via the Homebrew Channel,
                       from launchpoints.json, or by checking a list of known apps)
     - Home Assistant  a list file you keep in Home Assistant's www folder
   Each source is { id, label, load(cb) } and load calls cb({ items: [tiles], note, error }).
   Shared with settings.js as window.TVHOME_SOURCES. Plain ES5. */
(function () {
  'use strict';

  var T = window.TVHOME;
  if (!T) { return; }
  var HA = (window.TVHOME_CONFIG || {}).homeAssistant || {};
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------------------------------------------------------
     Sources of apps
  ---------------------------------------------------------------- */
  // Used if the TV won't say which inputs it has. (The OLED55A2 has three HDMI ports.)
  var INPUTS = [
    { name: 'Live TV', app: 'com.webos.app.livetv', symbol: 'tv' },
    { name: 'HDMI 1', app: 'com.webos.app.hdmi1', symbol: 'input' },
    { name: 'HDMI 2', app: 'com.webos.app.hdmi2', symbol: 'input' },
    { name: 'HDMI 3', app: 'com.webos.app.hdmi3', symbol: 'input' }
  ];

  // Nicer icons and selected colours for apps we recognise.
  var KNOWN = {
    'netflix': { glyph: 'N', fs: 60, color: '#e50914' },
    'youtube.leanback.v4': { symbol: 'play', color: '#ff1f3d' },
    'amazon': { glyph: 'P', fs: 56, color: '#0a9fd8' },
    'com.disney.disneyplus-prod': { glyph: 'D+', fs: 46, color: '#1b3fd0' },
    'com.apple.appletv': { glyph: 'tv', fs: 48, color: '#3b3b43' },
    'spotify-beehive': { color: '#1db954' },
    'com.wbd.stream': { color: '#002be7' },
    'bbc.iplayer.3.0': { color: '#ff4c98' },
    'com.webos.app.livetv': { symbol: 'tv' },
    'com.webos.app.home': { symbol: 'house' }
  };

  /* Apps to look for when the TV won't list its apps. A web app may ask whether one
     particular app is installed (getAppLoadStatus), so only installed ones are shown.
     App IDs from the catalogue in partridgeworks/webos-launcher (MIT licence,
     (c) 2026 webos-launcher contributors), plus Live TV and LG Home. */
  var CATALOGUE = [
    ['youtube.leanback.v4', 'YouTube'], ['netflix', 'Netflix'], ['amazon', 'Prime Video'],
    ['com.disney.disneyplus-prod', 'Disney+'], ['com.apple.appletv', 'Apple TV'], ['com.wbd.stream', 'Max'],
    ['cdp-30', 'Plex'], ['spotify-beehive', 'Spotify'], ['tv.twitch.tv.starshot.lg', 'Twitch'],
    ['bbc.iplayer.3.0', 'BBC iPlayer'], ['bbc.sounds.1.0', 'BBC Sounds'], ['com.fvp.itv', 'ITVX'],
    ['com.fvp.ch4', 'Channel 4'], ['demand5', 'Channel 5'], ['com.fvp.uktv', 'UKTV Play'], ['now.tv', 'NOW'],
    ['hulu', 'Hulu'], ['youtube.leanback.ytv.v1', 'YouTube TV'], ['com.plutotv.app', 'Pluto TV'],
    ['com.tubitv.ott.tubi', 'Tubi'], ['com.espn.espnplus-prod', 'ESPN'], ['vudu', 'Fandango at Home'],
    ['com.webos.app.browser', 'Web Browser'], ['com.webos.app.mediadiscovery', 'Media Player'],
    ['com.webos.app.igallery', 'Art Gallery'], ['com.webos.app.homeconnect', 'Home Dashboard'],
    ['amazon.alexa.view', 'Alexa'], ['com.palm.app.settings', 'LG Settings'],
    ['org.webosbrew.hbchannel', 'Homebrew Channel'], ['org.jellyfin.webos', 'Jellyfin'],
    ['com.webos.app.livetv', 'Live TV'], ['com.webos.app.home', 'LG Home'],
    // seen on this TV's own app list (OLED55A2, webOS 23)
    ['com.discovery.dplus.emea', 'discovery+'], ['airplay', 'AirPlay'], ['com.webos.app.lgchannels', 'LG Channels']
  ];

  // Shown only in a desktop browser preview, where there is no TV to ask.
  var PREVIEW_APPS = [
    { id: 'netflix', title: 'Netflix' }, { id: 'youtube.leanback.v4', title: 'YouTube' },
    { id: 'amazon', title: 'Prime Video' }, { id: 'com.webos.app.browser', title: 'Web Browser' },
    { id: 'com.webos.app.hdmi1', title: 'HDMI 1' }
  ];

  var SELF_ID = 'net.local.tvhome';
  // Apps LG lists that make no sense as tiles.
  var HIDDEN = [SELF_ID, 'google.assistant.promo', 'com.webos.app.discovery'];

  function tileFromApp(id, title) {
    var t = { name: title || id, app: id };
    var k = KNOWN[id];
    if (!k && /^com\.webos\.app\.hdmi\d$/.test(id)) { k = { symbol: 'input' }; }
    if (k) { for (var p in k) { if (Object.prototype.hasOwnProperty.call(k, p)) { t[p] = k[p]; } } }
    return t;
  }

  function appsToTiles(list) {
    var out = [];
    (list || []).forEach(function (a) {
      if (!a || !a.id || HIDDEN.indexOf(a.id) >= 0) { return; }
      out.push(tileFromApp(a.id, a.title || a.name));
    });
    out.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return out;
  }

  // Read a file that sits inside the app folder. fetch() can't read file:// URLs; XHR can.
  function readLocalJson(path, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', path, true);
      x.onload = function () {
        if (x.status !== 0 && x.status !== 200) { cb(new Error('HTTP ' + x.status)); return; }
        try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); }
      };
      x.onerror = function () { cb(new Error('not found')); };
      x.send();
    } catch (e) { cb(e); }
  }

  /* TV inputs, with the names set in the TV's input settings (External Input Manager).
     Falls back to a fixed list if the TV won't say. */
  function loadInputs(cb) {
    T.luna('luna://com.webos.service.eim/getAllInputStatus', {}, function (res) {
      var devs = (res && res.returnValue !== false && res.devices) || [];
      devs = devs.filter(function (d) { return d && d.appId && d.label; })
        .sort(function (a, b) { return (a.port || 0) - (b.port || 0); });
      if (!devs.length) {
        cb(null, INPUTS.map(clone), res && res.preview ? '' : 'The TV didn’t list its inputs, so these are the standard ones.');
        return;
      }
      var out = [clone(INPUTS[0])];
      devs.forEach(function (d) {
        out.push({ name: d.label, app: d.appId, symbol: 'input' });
      });
      cb(null, out, 'Names from your TV’s input settings.');
    });
  }

  /* TV apps. In order:
     1. ask the launcher directly (LG refuses this for most third-party apps);
     2. on a rooted TV, have the Homebrew Channel's service run the same request as root
        (a fixed command: nothing from the app or the user is put into it);
     3. launchpoints.json in the app folder, if you made one (see README);
     4. the catalogue above, checking which of those apps are installed. */

  function loadTvApps(cb) {
    T.luna('luna://com.webos.applicationManager/listLaunchPoints', {}, function (res) {
      if (res && res.preview) {
        cb(null, appsToTiles(PREVIEW_APPS), 'Desktop preview: a sample list. On the TV this shows your apps.');
        return;
      }
      if (res && res.returnValue !== false && res.launchPoints && res.launchPoints.length) {
        cb(null, appsToTiles(res.launchPoints), 'From the TV’s launcher.');
        return;
      }
      viaHomebrew(cb);
    });
  }

  function viaHomebrew(cb) {
    T.hbLaunchPoints(function (err, list) {
      if (err) { viaFile(cb); return; }
      cb(null, appsToTiles(list), 'From the TV\u2019s launcher, via the Homebrew Channel.');
      // then fetch the apps' own icons (shown here and on the home screen as they arrive)
      T.fetchIcons(list, function (changed) { if (changed) { T.refreshArt(); } });
    });
  }

  function viaFile(cb) {
    readLocalJson('launchpoints.json', function (err, data) {
      var list = data && (data.launchPoints || data.apps);
      if (!err && list && list.length) {
        cb(null, appsToTiles(list), 'From launchpoints.json.');
        return;
      }
      viaCatalogue(cb);
    });
  }

  function viaCatalogue(cb) {
    var left = CATALOGUE.length, found = [], answered = 0;
    CATALOGUE.forEach(function (c) {
      T.luna('luna://com.webos.applicationManager/getAppLoadStatus', { appId: c[0] }, function (res) {
        if (res && res.returnValue !== false && !res.noReply) {
          answered++;
          if (res.exist === true) { found.push({ id: c[0], title: c[1] }); }
        }
        if (--left === 0) {
          if (!answered) {
            cb('The TV wouldn’t list its apps or say which are installed. See “TV apps list” in the README.');
          } else {
            cb(null, appsToTiles(found), 'Known apps installed on this TV. Others: install the Homebrew Channel (rooted TVs) or see the README.');
          }
        }
      });
    });
  }

  var TILE_FIELDS = ['name', 'app', 'params', 'webhook', 'url', 'method', 'data', 'actions', 'delay', 'noTvIcon',
    'color', 'glyph', 'fs', 'symbol', 'icon', 'colorIcon'];

  function cleanTile(t) {
    if (!t || typeof t !== 'object' || !t.name) { return null; }
    if (!(t.app || t.webhook || t.url || (t.actions && t.actions.length))) { return null; }
    var out = {};
    TILE_FIELDS.forEach(function (f) { if (t[f] != null) { out[f] = t[f]; } });
    out.name = String(out.name);
    return out;
  }

  function haListUrl() {
    var path = HA.appsList || '/local/tvhome-apps.js';
    if (/^https?:\/\//i.test(path)) { return path; }
    return String(HA.url || '').replace(/\/+$/, '') + (path.charAt(0) === '/' ? '' : '/') + path;
  }

  /* The Home Assistant list is loaded as a script (window.TVHOME_APPS = [...]).
     A script tag isn't subject to CORS, so Home Assistant needs no extra settings.
     A .json URL is fetched instead, which does need CORS allowed in Home Assistant. */
  function loadHaApps(cb) {
    var url = haListUrl();
    var bust = (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    function done(list) {
      if (list && !Array.isArray(list) && list.apps) { list = list.apps; }
      if (!Array.isArray(list)) { cb('The list at ' + url + ' isn’t an array of apps.'); return; }
      var out = [];
      list.forEach(function (t) { var c = cleanTile(t); if (c) { out.push(c); } });
      if (!out.length) { cb('The list at ' + url + ' has no usable entries (each needs a name and an app, webhook or actions).'); return; }
      cb(null, out, 'From Home Assistant (' + (HA.appsList || '/local/tvhome-apps.js') + ')');
    }
    if (/\.json(\?|$)/i.test(url)) {
      fetch(url + bust, { mode: 'cors', cache: 'no-store' })
        .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
        .then(done, function (e) { cb('Couldn’t read ' + url + ' (' + e.message + '). A .json list needs CORS; a .js list doesn’t.'); });
      return;
    }
    try { delete window.TVHOME_APPS; } catch (e) { window.TVHOME_APPS = undefined; }
    var s = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () { finish('Timed out loading ' + url); }, 6000);
    function finish(err) {
      if (finished) { return; }
      finished = true;
      clearTimeout(timer);
      if (s.parentNode) { s.parentNode.removeChild(s); }
      if (err) { cb(err); return; }
      var list = window.TVHOME_APPS;
      try { delete window.TVHOME_APPS; } catch (e) { window.TVHOME_APPS = undefined; }
      done(list);
    }
    s.onload = function () { finish(null); };
    s.onerror = function () { finish('Couldn’t load ' + url + '. Check the file is in Home Assistant’s www folder.'); };
    s.src = url + bust;
    document.head.appendChild(s);
  }

  var SOURCES = [
    { id: 'inputs', label: 'TV inputs', load: loadInputs },
    { id: 'tv', label: 'TV apps', load: loadTvApps },
    { id: 'ha', label: 'Home Assistant', load: loadHaApps }
  ];

  window.TVHOME_SOURCES = SOURCES;
})();
