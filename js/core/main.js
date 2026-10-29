/* Start-up, the once-a-second tick, idle dimming, remote / pointer input and the
   holding screen. Loaded last: init() runs at the bottom. */
'use strict';

/* ---------------------------------------------------------------
   Every second: the plugins' onSecond (and onMinute when the minute changes), and the
   slow pixel shift to spare the OLED. Then idle dim.
---------------------------------------------------------------- */
// The whole screen moves together by at most 2 px, a 1 px step every 5 minutes, so no pixel
// stays lit in exactly one place. It jumps rather than glides: a glide redraws the screen every frame.
var SHIFT = [[0, 0], [1, 1], [2, 0], [1, -1], [0, -2], [-1, -1], [-2, 0], [-1, 1], [0, 2], [1, 1]];
var lastMinute = -1;

// Runs every second: the plugins' onSecond, and once a minute their onMinute and the pixel shift.
function tickClock() {
  var d = new Date();
  var m = d.getMinutes();
  if (m === lastMinute) { eachPlugin('onSecond', [d]); return; }
  lastMinute = m;
  var h = d.getHours();
  var s = SHIFT[Math.floor((h * 60 + m) / 5) % SHIFT.length];
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

// Brought back to the front (Home pressed again, or returning from an app). toStart: Home was
// pressed while TV Home was already in front, which goes back to the home row's first app.
function onReturn(toStart) {
  lastMinute = -1;
  tickClock();
  wake();
  if (!settingsOpen()) {
    if (toStart === true) { focusTile(homeCat, 0); }
    else { focusTile(cur.c, cur.i); }   // back from an app: where you left it
  }
  checkHA();
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
var perfMarked = {};
// Tell the service how long start-up took, in ms since the page began loading (for tools/perf). Once per name.
function perfMark(name) {
  if (perfMarked[name]) { return; }
  perfMarked[name] = true;
  if (!window.performance || !performance.now) { return; }
  luna(SVC + 'perfMark', { name: name, ms: Math.round(performance.now()) }, function () {});
}
// Fade out the holding screen once everything is ready (or after 4 seconds at most).
function liftHold() {
  var hold = $('hold'), t0 = Date.now();
  if (!hold) { return; }
  (function check() {
    var layout = svc.ready || svc.state === 'none' || svc.state === 'notroot';
    var tiles = pluginsKnown && !pluginsLoading();       // the plugins' tiles are in place
    var icons = Array.prototype.every.call($('dock').getElementsByTagName('img'), function (i) { return i.complete; });
    // how long each part took, for tools/perf
    if (bgReady) { perfMark('bg'); }
    if (layout) { perfMark('layout'); }
    if (tiles) { perfMark('tiles'); }
    if (icons) { perfMark('icons'); }
    if (!(bgReady && layout && tiles && icons) && Date.now() - t0 < 4000) { setTimeout(check, 80); return; }
    perfMark(document.hidden ? 'ready-hidden' : 'ready');
    // preloaded in the background: nothing to see, so it's simply gone when TV Home is opened
    if (document.hidden) { hold.style.display = 'none'; introPending = true; return; }
    // two frames, so the finished screen has been painted underneath before it's revealed
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      hold.classList.add('out');
      introTiles();
      setTimeout(function () { hold.style.display = 'none'; }, 800);   // not transitionend: it may run while hidden (preloaded)
    }); });
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
  checkHA();
  setInterval(function () { if (!document.hidden) { checkHA(); } }, 60000);
  setTimeout(function () { syncIcons(false); }, 1500);
  discoverPlugins();
  connectService();
  liftHold();
  setTimeout(registerInput, 3000);   // after start-up, so it doesn't slow the first paint
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
