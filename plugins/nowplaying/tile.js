/* Now playing plugin: what the amplifier is playing (Yamaha MusicCast, read by this plugin's
   service.js). Asked every 3 s while the home screen is showing (8 s when nothing is playing).
   A slim glass bar in the right-hand column: the album art as a disc, the song, artist and album, and the source.
   Right from the last app of a row selects it: play/pause and next take the source's place, the
   focus on play/pause; Right moves to next, and OK presses the lit one (streaming, USB,
   Bluetooth and CD; not the radio). */
(function () {
  'use strict';
  var api = null;
  var np = null, npTimer = null, npArt = '', npSong = '';
  var CTL = ['play', 'next'], ctl = 0;   // the lit button while the bar has the focus
  var MUTE = '<svg class="npmute" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Muted"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"></path><path d="m22 9-6 6M16 9l6 6"></path></svg>';
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
      renderNow();
      clearTimeout(npTimer);
      npTimer = setTimeout(pollNow, npShowing(np) && np.playback === 'play' ? 3000 : 8000);
    }, 6000);
  }
  // Can the amp play, pause and skip what's on? (The radio can't.)
  function canControl() { return npShowing(np) && (np.source === 'netusb' || np.source === 'cd') && api.service.ready(); }
  function renderNow() {
    var box = api.root;
    if (!npShowing(np)) { npSong = ''; api.show(false); return; }
    var song = [np.track, np.artist, np.album].join('|');
    if (song !== npSong) { setTitles(np.track || np.artist, np.track ? np.artist : '', np.album || '', !!npSong && box.classList.contains('show')); }
    npSong = song;
    box.classList.toggle('paused', np.playback === 'pause');
    box.classList.toggle('muted', !!np.mute);
    box.classList.toggle('nocontrol', !canControl());
    // the source; the buttons take its place while the bar is selected
    setText(box.querySelector('.npsrc'), np.inputName || '');
    if (np.art !== npArt) {
      npArt = np.art;
      var img = api.$('npimg');
      if (np.art) {
        // through the TV Home service first (it fetches it from the amp), then straight from the amp
        var tries = np.artPath ? [api.service.url('art/' + np.artPath), np.art] : [np.art];
        var want = np.art;
        (function next(i) {
          if (i >= tries.length || npArt !== want) { if (npArt === want) { box.classList.remove('hasart'); } return; }
          var pre = new Image();
          pre.onload = function () {
            if (npArt !== want) { return; }
            // the disc turns once and the new art goes on while it's moving
            var flip = box.querySelector('.npflip');
            if (box.classList.contains('show') && box.classList.contains('hasart') && !document.hidden) {
              flip.classList.remove('go'); void flip.offsetWidth; flip.classList.add('go');
              clearTimeout(flip.flipTimer);
              flip.flipTimer = setTimeout(function () { flip.classList.remove('go'); }, 800);
              setTimeout(function () { if (npArt === want) { img.src = tries[i]; } }, 260);
            } else { img.src = tries[i]; }
            box.classList.add('hasart');
          };
          pre.onerror = function () { next(i + 1); };
          pre.src = tries[i];
        })(0);
      } else { img.removeAttribute('src'); box.classList.remove('hasart'); }
    }
    api.show(true);
  }
  function setText(n, t) { if (n && n.textContent !== t) { n.textContent = t; } }
  // Song, artist (with the mute icon before it) and album. animate: the old lines slide up and out, the new ones in.
  function setTitles(t1, t2, t3, animate) {
    var host = api.root.querySelector('.nptitles');
    var old = host.querySelector('.nptl:not(.out)');
    var tl = api.util.el('div', 'nptl');
    tl.appendChild(api.util.el('div', 'nptrack', t1));
    var artist = api.util.el('div', 'npartist');
    artist.innerHTML = MUTE;
    artist.appendChild(document.createTextNode(t2));
    tl.appendChild(artist);
    if (t3) { tl.appendChild(api.util.el('div', 'npalbum', t3)); }
    if (old && animate && !document.hidden) {
      old.classList.add('out');
      setTimeout(function () { if (old.parentNode) { old.parentNode.removeChild(old); } }, 420);
      tl.classList.add('in');
    } else if (old) { host.removeChild(old); }
    host.appendChild(tl);
  }
  // Light up button i (0 play/pause, 1 next).
  function setCtl(i) {
    ctl = Math.max(0, Math.min(CTL.length - 1, i));
    Array.prototype.forEach.call(api.root.querySelectorAll('.npb'), function (b, j) { b.classList.toggle('on', j === ctl); });
  }
  // OK on the lit button. Play/pause swaps its icon straight away; then the amp is asked again to confirm.
  function press() {
    if (!canControl()) { return; }
    var want = CTL[ctl];
    if (want === 'play') {
      want = np.playback === 'pause' ? 'play' : 'pause';
      np.playback = want;
      renderNow();
    }
    var btn = api.root.querySelectorAll('.npb')[ctl];
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

  var ICON_NEXT = '<svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor" aria-hidden="true"><path d="M2.5 6.2v11.6a.8.8 0 0 0 1.27.65l7.93-5.8a.8.8 0 0 0 0-1.3L3.77 5.55a.8.8 0 0 0-1.27.65z"></path><path d="M12.5 6.2v11.6a.8.8 0 0 0 1.27.65l7.93-5.8a.8.8 0 0 0 0-1.3l-7.93-5.8a.8.8 0 0 0-1.27.65z"></path></svg>';
  var ICON_PLAY = '<svg class="ic-pause" viewBox="0 0 24 24" width="36" height="36" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>' +
    '<svg class="ic-play" viewBox="0 0 24 24" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.3-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"></path></svg>';
  // One of the buttons.
  function button(cls, label, icon) {
    return '<div class="npb ' + cls + '" role="button" aria-label="' + label + '"><span class="lit"></span>' + icon + '</div>';
  }

  TVHOME.plugin({
    id: 'nowplaying',
    region: 'right',
    tag: 'section',
    attrs: { id: 'nowplaying', 'aria-label': 'Now playing' },
    glass: true,
    tone: 'music',
    html: '<div class="npdisc"><div class="npflip">' +
        '<svg class="npnote" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle></svg>' +
        '<img id="npimg" alt="">' +
      '</div></div>' +
      '<div class="nptitles"></div>' +
      '<div class="npright"><div class="npsrc"></div>' +
        '<div class="npctl">' + button('play', 'Play or pause', ICON_PLAY) + button('next', 'Next song', ICON_NEXT) + '</div>' +
      '</div>',

    // the setting saved before plugins (musiccastHost)
    migrate: function (s) { return s.musiccastHost !== undefined ? { host: s.musiccastHost || '' } : null; },

    start: function (a) {
      api = a;
      // Magic Remote pointer: the button under it lights up (the click is OK)
      Array.prototype.forEach.call(api.root.querySelectorAll('.npb'), function (b, i) {
        b.addEventListener('mouseenter', function () { setCtl(i); });
      });
      setCtl(0);
      pollNow();
    },
    stop: function () { clearTimeout(npTimer); api = null; },
    onReady: function () { pollNow(); },          // the service has just connected
    onShow: function () { pollNow(); },           // back on screen: ask straight away
    onSettings: function () { pollNow(); },
    canFocus: function () { return canControl(); },   // the radio: nothing to select
    // lands on play/pause (or, with the pointer, the button it's over)
    onFocus: function (on) {
      if (!on) { return; }
      var over = api.root.querySelector('.npb:hover');
      setCtl(over ? Array.prototype.indexOf.call(api.root.querySelectorAll('.npb'), over) : 0);
    },
    onKey: function (k) {
      if (k === TVHOME.KEY.LEFT && ctl > 0) { setCtl(ctl - 1); return true; }
      if (k === TVHOME.KEY.RIGHT) { if (ctl < CTL.length - 1) { setCtl(ctl + 1); } return true; }
      return false;                               // Left from play/pause: back to the apps
    },
    onOk: function () { press(); }
  });
})();
