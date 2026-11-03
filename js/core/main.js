/* Start-up, the once-a-second tick, idle dimming, remote / pointer input and the
   holding screen. Loaded last: init() runs at the bottom. */
'use strict';

/* ---------------------------------------------------------------
   Every second: the plugins' onSecond (and onMinute when the minute changes), and the
   slow pixel shift to spare the OLED. Then idle dim.
---------------------------------------------------------------- */
// The whole screen moves together by at most 2 px, a 1 px step every 5 minutes on screen, so no
// pixel stays lit in exactly one place. It jumps rather than glides: a glide redraws the screen every frame.
// It counts steps rather than following the clock: back from an app it carries on from where it
// was, instead of snapping to wherever the clock says (up to 4 px at once).
var SHIFT = [[0, 0], [1, 1], [2, 0], [1, -1], [0, -2], [-1, -1], [-2, 0], [-1, 1], [0, 2], [1, 1]];
var lastMinute = -1;
var shiftStep = 0, lastSlot = -1;   // lastSlot: the 5-minute slot of the last step (-1: catch up without stepping)

// Runs every second: the plugins' onSecond, and once a minute their onMinute and the pixel shift.
function tickClock() {
  var d = new Date();
  var m = d.getMinutes();
  if (m === lastMinute) { eachPlugin('onSecond', [d]); return; }
  lastMinute = m;
  var slot = Math.floor((d.getHours() * 60 + m) / 5);
  if (lastSlot !== -1 && slot !== lastSlot) { shiftStep = (shiftStep + 1) % SHIFT.length; }
  lastSlot = slot;
  var s = SHIFT[shiftStep];
  var sh = $('shift');
  if (sh) {
    var tr = 'translate(' + s[0] + 'px,' + s[1] + 'px)';
    if (sh.style.transform !== tr) { sh.style.transform = tr; }
  }
  eachPlugin('onMinute', [d]);
  eachPlugin('onSecond', [d]);
  placeGear();
}

var idleTimer = null;
// Something happened (a key, the pointer): undim the screen and restart the idle timer.
function wake() {
  var stage = $('stage');
  if (stage.classList.contains('dim')) { stage.classList.remove('dim'); }
  clearTimeout(idleTimer);
  var mins = CFG.idleDimMinutes;
  if (mins > 0) {
    idleTimer = setTimeout(function () { stage.classList.add('dim'); }, mins * 60 * 1000);
  }
}

// On the TV the viewport is 1920x1080 so this does nothing; it lets a desktop browser preview fit.
function fit() {
  var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  var stage = $('stage');
  if (Math.abs(s - 1) < 0.001) { stage.style.transform = ''; return; }
  stage.style.transform = 'scale(' + s + ')';
  document.documentElement.style.width = window.innerWidth + 'px';
  document.documentElement.style.height = window.innerHeight + 'px';
  document.body.style.width = window.innerWidth + 'px';
  document.body.style.height = window.innerHeight + 'px';
}

/* ---------------------------------------------------------------
   Input
---------------------------------------------------------------- */
// A held arrow repeats faster than a busy TV can draw (just after switch-on). Repeats that arrive
// before the last move has reached the screen are dropped, so the focus stops where you let go
// instead of carrying on for up to a second. Single presses are never dropped.
var moveShown = true;
document.addEventListener('keydown', function (e) {
  var k = e.keyCode;
  if (k >= KEY.LEFT && k <= KEY.DOWN) {
    if (e.repeat && !moveShown) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    moveShown = false;
    requestAnimationFrame(function () { moveShown = true; });
  }
}, true);
document.addEventListener('keydown', function (e) {
  wake();
  var k = e.keyCode;
  if (settingsOpen()) { window.TVHOME_SETTINGS.onKey(e); return; }
  if (k === KEY.RED) { e.preventDefault(); openSettings(); return; }
  if (onGear) {
    if (k === KEY.DOWN) { e.preventDefault(); setGear(false); if (cur.c < 0 && cats.length) { select(homeCat, 0); } }
    else if (k === KEY.ENTER) { e.preventDefault(); openSettings(); }
    else if (k === KEY.RIGHT) { e.preventDefault(); focusPluginTile(0); }
    else if (k === KEY.LEFT || k === KEY.UP || k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); }
    return;
  }
  if (tileFocus) { if (tileKey(k)) { e.preventDefault(); } return; }
  if (!cats.length) { if (k === KEY.UP) { e.preventDefault(); setGear(true); } return; }
  if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) {
    e.preventDefault();
    move(k);
  } else if (k === KEY.ENTER) {
    e.preventDefault();
    activate(cur.c, cur.i);
  } else if (k === KEY.BACK || k === KEY.ESC) {
    // This is the home screen: Back stays put. (LG's own Home is a tile.)
    e.preventDefault();
  }
});
/* Hover only steers focus while the pointer is actually in use. When the remote's arrow
   keys scroll a row, icons slide under a parked pointer; that mustn't steal focus. */
var lastMove = 0, lastKey = 0;
// Has the pointer moved since the last key press?
function pointerActive() { return lastMove >= lastKey; }
// mouseenter fires before the mousemove that caused it, so decide a moment later.
function onHover(node, fn) {
  node.addEventListener('mouseenter', function () {
    var t = Date.now();
    setTimeout(function () { if (lastMove >= t && lastMove >= lastKey) { fn(); } }, 0);
  });
}
document.addEventListener('keydown', function () { lastKey = Date.now(); }, true);
document.addEventListener('mousemove', function () { lastMove = Date.now(); }, true);
document.addEventListener('mousemove', wake);
document.addEventListener('click', wake);

var returnedAt = 0;
// Brought back to the front (Home pressed again, or returning from an app). toStart: Home was
// pressed while TV Home was already in front, which goes back to the home row's first app.
function onReturn(toStart) {
  var again = Date.now() - returnedAt < 500;   // webOSRelaunch and visibilitychange both fire on a return
  returnedAt = Date.now();
  if (again && toStart !== true) { return; }
  lastMinute = -1;
  lastSlot = -1;   // time spent behind another app doesn't move the screen
  tickClock();
  wake();
  if (!settingsOpen()) {
    if (toStart === true) { focusTile(homeCat, 0); }
    else { focusTile(cur.c, cur.i); }   // back from an app: where you left it
  }
  setTimeout(checkHA, 500);   // after the screen is back, so it doesn't hold up the first frame
  try { if (window.PalmSystem && window.PalmSystem.activate) { window.PalmSystem.activate(); } } catch (e) { /* ignore */ }
}
var shownAt = 0;   // when TV Home last came back to the front
document.addEventListener('webOSRelaunch', function () {
  onReturn(!document.hidden && Date.now() - shownAt > 1500);   // already in front: Home pressed on the home screen
});
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) {
    shownAt = Date.now();
    onReturn(); eachPlugin('onShow');
    if (introPending) { introTiles(); }   // right away, so the first visible frame already has them hidden; its 250 ms lead-in covers the screen waking
  }
});
window.addEventListener('resize', fit);

/* ---------------------------------------------------------------
   Holding screen (index.html): fades out once the background is drawn, the layout is
   final (the service's copy, or it isn't there) and the dock's icons have loaded.
   Never longer than 4 seconds.
---------------------------------------------------------------- */
// the open row's icons fade and rise in one after another, once per launch
var introPending = false;
// The icons of the open row fade and rise in one after another (once, at start-up).
function introTiles() {
  introPending = false;
  var dock = $('dock');
  var open = dock.querySelector('.cat.open');
  if (!open) { return; }
  var discs = open.querySelectorAll('.disc');
  // starts as the holding screen is half faded, 120 ms apart, each taking 0.6 s
  Array.prototype.forEach.call(discs, function (d, i) { d.style.animationDelay = (250 + i * 120) + 'ms'; });
  dock.classList.add('intro');
  setTimeout(function () {                   // later re-renders and row changes don't replay it
    dock.classList.remove('intro');
    Array.prototype.forEach.call(discs, function (d) { d.style.animationDelay = ''; });
  }, 250 + discs.length * 120 + 700);
}
// diag:start  timing marks for tools/perf (tools/lean/build.sh leaves this out)
var perfMarked = {};
// Tell the service how long something took, for tools/perf: ms, or by default ms since the page
// began loading (start-up). Start-up marks are sent once per name.
function perfMark(name, ms) {
  if (ms == null && perfMarked[name]) { return; }
  perfMarked[name] = true;
  if (!window.performance || !performance.now) { return; }
  luna(SVC + 'perfMark', { name: name, ms: ms == null ? Math.round(performance.now()) : ms }, function () {});
}
// How long each remote press takes to show on screen (from the key to just after the next frame).
var KEY_NAMES = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 461: 'back' };
document.addEventListener('keydown', function (e) {
  var name = KEY_NAMES[e.keyCode], t0 = e.timeStamp;
  if (!name || !t0 || !window.performance || !window.requestAnimationFrame) { return; }
  requestAnimationFrame(function () {
    setTimeout(function () { perfMark('key-' + name, Math.round(performance.now() - t0)); }, 0);
  });
}, true);
// diag:end
// Fade out the holding screen once everything is ready (or after 4 seconds at most).
function liftHold() {
  var hold = $('hold'), t0 = Date.now();
  if (!hold) { return; }
  (function check() {
    // the saved copy is the last layout the service sent, so don't wait for the service to start (it rarely differs)
    var layout = hadLocalLayout || svc.ready || svc.state === 'none' || svc.state === 'notroot';
    var tiles = pluginsKnown && !pluginsLoading();       // the plugins' tiles are in place (after a full start waitCalm also waits for their data)
    var icons = Array.prototype.every.call($('dock').getElementsByTagName('img'), function (i) { return i.complete; });
    // how long each part took, for tools/perf   // diag
    if (bgReady) { perfMark('bg'); }   // diag
    if (layout) { perfMark('layout'); }   // diag
    if (tiles) { perfMark('tiles'); }   // diag
    if (icons) { perfMark('icons'); }   // diag
    // never reveal a half-built screen (just after switch-on this takes ~6 s); 15 s is only a safety net
    if (!(bgReady && layout && tiles && icons) && Date.now() - t0 < 15000) { setTimeout(check, 80); return; }
    perfMark(document.hidden ? 'ready-hidden' : 'ready');   // diag
    // preloaded in the background: nothing to see, so it's simply gone when TV Home is opened
    if (document.hidden) { hold.style.display = 'none'; introPending = true; return; }
    waitCalm(function () {
      perfMark('shown');   // diag
      // two frames, so the finished screen has been painted underneath before it's revealed
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        hold.classList.add('out');
        introTiles();
        setTimeout(function () { hold.style.display = 'none'; }, 800);   // not transitionend: it may run while hidden (preloaded)
      }); });
    });
  })();
}
// Just after a full start the TV is flat out for a while and the remote feels uneven, so keep the
// loading screen up until HOLD_UNTIL seconds after power-on (just after the Homebrew Channel's
// start-up scripts, ~53-55 s, all run at once), the tiles have their data and the TV calms down
// (under 60% busy three times running), for at most 25 s. Any other start goes straight on: the
// TV has been on a while, or there's no service to ask.
var HOLD_UNTIL = 57;
function waitCalm(fn) {
  var t0 = Date.now(), calm = 0;
  (function ask() {
    luna(SVC + 'busy', {}, function (r) {
      var known = r && r.returnValue !== false && r.uptime > 0 && r.cpu != null;
      var busy = known && r.uptime < 120 && r.cpu >= 60;
      calm = busy || pluginsAwaitingData() ? 0 : calm + 1;   // the tiles' data may still be on its way
      // no answer yet: just after a full start the service may still be restarting with root, so try
      // again for a few seconds, unless the page already knows there's no service to ask
      if (!known && !(r && r.uptime >= 120) && svc.state !== 'none' && svc.state !== 'notroot' && Date.now() - t0 < 12000) {
        setTimeout(ask, 300); return;
      }
      var early = known && r.uptime < HOLD_UNTIL;
      if (!known || r.uptime >= 120 || (calm >= 3 && !early) || Date.now() - t0 > 25000) {
        if (!known) { perfMark('hold-noanswer'); }   // diag
        fn(); return;
      }
      ask();
    }, 3000);   // on a TV this busy the answer can take over a second
  })();
}

/* ---------------------------------------------------------------
   Go
---------------------------------------------------------------- */
// List TV Home as one of the TV's inputs (if it isn't already), so with Start-up set to
// "Last source" the TV switches on straight to it, without LG's home first.
function registerInput() {
  luna('luna://com.webos.service.eim/getAllInputStatus', {}, function (res) {
    var listed = ((res && res.devices) || []).some(function (d) { return d && d.appId === 'net.local.tvhome'; });
    if (listed || (res && res.preview)) { return; }
    luna('luna://com.webos.service.eim/addDevice', {
      appId: 'net.local.tvhome', pigImage: '', mvpdIcon: '', showPopup: false,
      label: 'TV Home', description: 'TV Home'
    }, function (r) { if (r && r.returnValue === false) { console.log('input not added', r.errorText); } });
  });
}
function init() {
  render();
  fit();
  tickClock();
  // timers sleep while another app is in front; onReturn() catches everything up
  setInterval(function () { if (!document.hidden) { tickClock(); } }, 1000);
  focusTile(homeCat, 0);   // a fresh start: the home row's first app
  var g = $('gear');
  // same glass as the clock capsule: blurred copy of the picture, sheen, icon
  g.innerHTML = '<canvas class="gcv" id="gearglass"></canvas><span class="sheen"></span>' + ICONS.gear;
  onHover(g, function () { setGear(true); });
  g.addEventListener('click', openSettings);
  placeGear();
  wake();
  loadBackground();
  setInterval(function () { if (!document.hidden) { checkHA(); } }, 60000);
  discoverPlugins();
  connectService();
  liftHold();
  // Extras wait until the TV has calmed down: just after switch-on LG's own start-up keeps it busy
  // for a minute or so, and these would only compete with the screen and the remote.
  whenQuiet(function () { checkHA(); syncIcons(false); registerInput(); });
}

// Run fn once the screen has drawn smoothly (no frame over 60 ms apart) for a second, or after a minute.
function whenQuiet(fn) {
  var start = Date.now(), calm = Date.now(), last = 0, done = false;
  // Run fn, once.
  function go() { if (!done) { done = true; fn(); } }
  setTimeout(go, 60000);   // also covers a preloaded (hidden) start, when frames don't run
  // Check the gap since the last frame.
  function frame(t) {
    if (done) { return; }
    if (last && t - last > 60) { calm = Date.now(); }
    last = t;
    if (Date.now() - calm >= 1000 && Date.now() - start >= 1500) { go(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

init();

// Exposed for tests and the desktop preview.
window.TVHOME = {
  webhookUrl: webhookUrl, actionsFor: actionsFor, select: select, move: move, KEY: KEY, paintGlass: paintGlass,
  // used by settings.js
  ICONS: ICONS, luna: luna, toast: toast, svg: svg, onHover: function (n, f) { onHover(n, f); },
  getLayout: function () { return JSON.parse(JSON.stringify(CFG.categories || [])); },
  saveLayout: saveLayout, resetLayout: resetLayout, isLocked: isLocked, rerender: rerender, openSettings: openSettings,
  hbLaunchPoints: hbLaunchPoints, fetchIcons: fetchIcons, tvIconFor: tvIconFor, refreshArt: refreshArt,
  asset: asset,
  // plugins (tile.js calls this; see plugins/README.md)
  plugin: registerPlugin,
  plugins: function () { return Object.keys(plugins).filter(function (k) { return plugins[k].state === 'on'; }); },
  tone: function () { return { measured: measuredTone, busyGreet: !!($('greeting') && $('greeting').classList.contains('busy')), busyDock: $('dock').classList.contains('busy'), dock: $('dock').classList.contains('ink'), greet: !!($('greeting') && $('greeting').classList.contains('ink')), status: $('status').classList.contains('ink') }; },
  // the phone/laptop editor
  service: function () { return svc.info; },
  serviceState: function () { return { state: svc.state, error: svc.error }; },
  reconnectService: function () { svcState('checking'); connectService(); },
  onServiceInfo: function (f) { svc.infoCbs.push(f); },
  newPassword: function (cb) { luna(SVC + 'newPassword', {}, function (r) { if (r && r.port) { svc.info = r; } cb(r); }, 5000); }
};
