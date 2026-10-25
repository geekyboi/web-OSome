/* The background picture and the frosted "glass" panels painted from it. */
'use strict';

/* ---------------------------------------------------------------
   Liquid glass without backdrop-filter.
   The scene behind the UI (the background picture) is drawn once onto a
   tiny canvas. Every glass surface copies the patch of it that sits behind
   that surface, and CSS scaling the patch up is the blur.
---------------------------------------------------------------- */
var SCENE_W = 240, SCENE_H = 135, SCALE = 1920 / SCENE_W; // 8
var scene = null;
var bgImg = null;

// Background layout options (Settings > Background in the editor) and a key for one look.
function bgSettings() { return { background: CFG.background, bgFit: CFG.bgFit, bgEdge: CFG.bgEdge, bgColour: CFG.bgColour }; }
// The background layout options, with defaults filled in (see bgdraw.js).
function bgOpts() { return window.TVBG.opts(bgSettings()); }
// A short key for how the background looks; changes when the picture or layout changes.
function bgKey() { return window.TVBG.key(bgSettings()); }
// The background as laid out on screen, at any size (W x H stands for 1920 x 1080).
function composeBg(W, H) {
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  if (ctx) { window.TVBG.draw(ctx, W, H, bgImg, bgOpts()); }
  return cv;
}

// The small blurred, darkened copy of the background that every glass panel is cut from.
function buildScene() {
  var cv = document.createElement('canvas');
  cv.width = SCENE_W; cv.height = SCENE_H;
  var ctx = cv.getContext('2d');
  if (!ctx) { return null; }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // a darkened copy, so the glass stays legible over bright skies as well as dark pictures
  try { ctx.filter = 'blur(1px) saturate(1.3) brightness(0.7)'; } catch (e) { /* optional */ }
  ctx.drawImage(composeBg(SCENE_W, SCENE_H), 0, 0);
  try { ctx.filter = 'none'; } catch (e2) { /* optional */ }
  return cv;
}

// Position of an element on the 1920x1080 stage, ignoring transforms.
function stagePos(node) {
  var stage = $('stage');
  var x = 0, y = 0, n = node;
  while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x, y: y };
}

// Paint glass canvas cv with the patch of the scene behind node (lighter for .ink panels).
function paintOne(cv, node) {
  var w = node.offsetWidth, h = node.offsetHeight;
  var p = stagePos(node);
  var cw = Math.max(8, Math.round(w / 4)), ch = Math.max(8, Math.round(h / 4));
  if (cv.width !== cw) { cv.width = cw; }
  if (cv.height !== ch) { cv.height = ch; }
  var ctx = cv.getContext('2d');
  if (!ctx) { return; }
  ctx.clearRect(0, 0, cw, ch);
  if (!scene) { return; }
  ctx.drawImage(scene, p.x / SCALE, p.y / SCALE, w / SCALE, h / SCALE, 0, 0, cw, ch);
  // light glass (.ink): frost the blurred copy itself, so the blur still shows through the white
  if (node.classList.contains('ink')) {
    var g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    g.addColorStop(0.45, 'rgba(255, 255, 255, 0.5)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
}

// Repaint every glass panel: the clock capsule, the gear and the plugins' tiles.
function paintGlass() {
  if ($('status').offsetWidth) { paintOne($('statusglass'), $('status')); }
  if ($('gearglass')) { paintOne($('gearglass'), $('gear')); }
  // plugins with glass: the ones showing
  Object.keys(plugins).forEach(function (k) {
    var p = plugins[k];
    if (p.state === 'on' && p.glass && p.root.offsetWidth) { paintOne(p.glass, p.root); }
  });
}

// Draw the visible background (a canvas 4 px bigger each side, for the OLED pixel shift).
function paintBg() {
  var bgEl = $('bg');
  var ctx = bgEl.getContext && bgEl.getContext('2d');
  if (!ctx) { return; }
  window.TVBG.draw(ctx, bgEl.width, bgEl.height, bgImg, bgOpts());
  bgEl.setAttribute('data-src', bgImg ? bgImg.src : '');
  bgEl.setAttribute('data-fit', bgOpts().fit);
}
var bgLoading = 0, bgReady = false;
// Load CFG.background and redraw everything that depends on it (picture, glass, text tone).
// Uploaded pictures come from the service, so it keeps retrying for a minute while that starts.
function loadBackground() {
  var mine = ++bgLoading;
  bgImg = null;
  measuredTone = null;
  paintBg();             // the colour straight away; the picture is added when it loads
  scene = buildScene(); paintGlass();
  function done() { scene = buildScene(); paintGlass(); measuredTone = measureTone(); applyTone(); bgReady = true; }
  if (!CFG.background) { done(); return; }
  var src = asset(CFG.background);
  var img = new Image();
  if (/^https?:/.test(src)) { img.crossOrigin = 'anonymous'; }   // so its brightness can be measured (the service allows it)
  img.onload = function () { if (mine !== bgLoading) { return; } bgImg = img; paintBg(); done(); };
  var tries = 0;
  img.onerror = function () {
    if (mine !== bgLoading) { return; }
    if (!tries) { paintBg(); done(); }   // show the colour meanwhile
    // Uploaded pictures come from the service, which may still be starting (TV start-up,
    // after an update): keep trying for a minute instead of leaving the picture out.
    if (/^files\//.test(CFG.background) && ++tries <= 30) {
      setTimeout(function () { if (mine === bgLoading) { img.src = src + '?t=' + tries; } }, 2000);
    }
  };
  img.src = src;
  applyTone();
}
