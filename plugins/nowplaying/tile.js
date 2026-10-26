/* Now playing plugin: what the amplifier is playing (Yamaha MusicCast, read by this plugin's
   service.js). Asked every 3 s while the home screen is showing (8 s when nothing is playing).
   A glass card in the right-hand column, above the calendar. Right from the last app of a row
   selects it, and OK plays or pauses (streaming, USB, Bluetooth and CD; not the radio). */
(function () {
  'use strict';
  var api = null;
  var np = null, npAt = 0, npTimer = null, npArt = '', npSong = '';
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function npShowing(n) {
    return !!(n && n.power === 'on' && n.source !== 'other' && n.playback !== 'stop' && (n.track || n.artist));
  }
  function pollNow() {
    clearTimeout(npTimer);
    if (!api) { return; }
    if (!api.service.ready() || !api.settings().host) { np = null; renderNow(); npTimer = setTimeout(pollNow, 5000); return; }
    if (document.hidden) { npTimer = setTimeout(pollNow, 5000); return; }
    api.service.call('now', {}, function (r) {
      if (!api) { return; }      // removed meanwhile
      np = (r && r.returnValue !== false && r.configured && r.now) ? r.now : null;
      npAt = Date.now();
      renderNow();
      clearTimeout(npTimer);
      npTimer = setTimeout(pollNow, npShowing(np) && np.playback === 'play' ? 3000 : 8000);
    }, 6000);
  }
  function mmss(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + pad(t % 60); }
  function renderNow() {
    var box = api.root;
    if (!npShowing(np)) { npSong = ''; api.show(false); return; }
    var paused = np.playback === 'pause';
    // a new song while the card is up: its text fades up
    var song = [np.track, np.artist, np.album].join('|');
    if (song !== npSong && npSong && box.classList.contains('show')) { api.animateIn(box.querySelector('.nptext')); }
    npSong = song;
    var src = np.inputName || '';
    if (paused) { src += (src ? ' · ' : '') + 'Paused'; }
    setText('npsrc', src);
    setText('nptrack', np.track || np.artist);
    setText('npartist', np.track ? [np.artist, np.album].filter(Boolean).join(' — ') : '');
    box.classList.toggle('paused', paused);
    box.classList.toggle('radio', np.source === 'tuner' || !np.totalTime || np.playTime == null);
    box.classList.toggle('nocontrol', !canControl());
    if (np.art !== npArt) {
      npArt = np.art;
      var img = api.$('npimg');
      box.classList.remove('hasart');
      if (np.art) {
        // through the TV Home service first (it fetches it from the amp), then straight from the amp
        var tries = np.artPath ? [api.service.url('art/' + np.artPath), np.art] : [np.art];
        var want = np.art;
        (function next(i) {
          if (i >= tries.length || npArt !== want) { return; }
          var pre = new Image();
          pre.onload = function () { if (npArt === want) { img.src = tries[i]; box.classList.add('hasart'); api.animateIn(img); } };
          pre.onerror = function () { next(i + 1); };
          pre.src = tries[i];
        })(0);
      } else { img.removeAttribute('src'); }
    }
    updateNpBar();
    api.show(true);
  }
  function setText(id, t) { var n = api.$(id); if (n && n.textContent !== t) { n.textContent = t; } }
  // Time played (counted on between the amp's updates), with the length and a bar when the amp gives one.
  function updateNpBar() {
    // no position from the amp (it sends play_time -60000, e.g. Spotify Connect): show no time rather than a guess
    if (!npShowing(np) || np.source === 'tuner' || np.playTime == null) { setText('nptime', ''); return; }
    var t = np.playTime + (np.playback === 'play' ? (Date.now() - npAt) / 1000 : 0);
    if (np.totalTime) {
      t = Math.min(t, np.totalTime);
      api.$('npfill').style.transform = 'scaleX(' + (t / np.totalTime).toFixed(4) + ')';
      setText('nptime', mmss(t) + ' / ' + mmss(np.totalTime));
    } else {
      setText('nptime', mmss(t));
    }
  }

  // Can the amp play and pause what's on? (The radio can't.)
  function canControl() { return npShowing(np) && (np.source === 'netusb' || np.source === 'cd') && api.service.ready(); }
  // OK on the tile: play or pause. The icon swaps straight away, then the amp is asked again to confirm.
  function playPause() {
    if (!canControl()) { return; }
    var want = np.playback === 'pause' ? 'play' : 'pause';
    np.playback = want;
    renderNow();
    var btn = api.root.querySelector('.npbtn');
    btn.classList.remove('fire'); void btn.offsetWidth; btn.classList.add('fire');
    clearTimeout(btn.fireTimer);
    btn.fireTimer = setTimeout(function () { btn.classList.remove('fire'); }, 450);
    api.service.call('playback', { playback: want }, function (r) {
      if (!api) { return; }
      if (!r || r.returnValue === false) { api.toast((r && r.errorText) || 'The amplifier didn’t answer.', true); }
      clearTimeout(npTimer);
      npTimer = setTimeout(pollNow, 800);          // what the amp says now (or put it back)
    }, 6000);
  }

  TVHOME.plugin({
    id: 'nowplaying',
    region: 'right',
    tag: 'section',
    attrs: { id: 'nowplaying', 'aria-label': 'Now playing' },
    glass: true,
    tone: 'music',
    html: '<div class="npart">' +
        '<svg class="npnote" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle></svg>' +
        '<img id="npimg" alt="">' +
      '</div>' +
      '<div class="nptext">' +
        '<div class="npsrc"><span id="npsrc"></span><span id="nptime"></span></div>' +
        '<div class="nptrack" id="nptrack"></div>' +
        '<div class="npartist" id="npartist"></div>' +
        '<div class="npbar" id="npbar"><i id="npfill"></i></div>' +
      '</div>' +
      // play/pause: only shows while the card has the focus
      '<div class="npbtn" role="button" aria-label="Play or pause"><span class="sheen"></span>' +
        '<svg class="ic-pause" viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>' +
        '<svg class="ic-play" viewBox="0 0 24 24" width="36" height="36" fill="currentColor" aria-hidden="true"><path d="M8 4.8v14.4a1 1 0 0 0 1.5.86l11.3-7.2a1 1 0 0 0 0-1.72L9.5 3.94A1 1 0 0 0 8 4.8z"></path></svg>' +
      '</div>',

    // the setting saved before plugins (musiccastHost)
    migrate: function (s) { return s.musiccastHost !== undefined ? { host: s.musiccastHost || '' } : null; },

    start: function (a) { api = a; pollNow(); },
    stop: function () { clearTimeout(npTimer); api = null; },
    onReady: function () { pollNow(); },          // the service has just connected
    onShow: function () { pollNow(); },           // back on screen: ask straight away
    onSettings: function () { pollNow(); },
    onSecond: function () { updateNpBar(); },
    canFocus: function () { return canControl(); },   // the radio: nothing to select
    onOk: function () { playPause(); }
  });
})();
