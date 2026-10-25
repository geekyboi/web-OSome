/* Web editor: what's being edited (the draft) and the save status in the header. */
'use strict';

/* ---------- state ---------- */
var server = null;      // last saved document from the TV
var draft = null;       // { categories, settings } being edited
var dirty = false, saving = false;
var apps = { apps: [], inputs: [], error: null };
var files = [];
var haApps = null, haError = null;

// Start editing a copy of document d (from the TV).
function setDraftFrom(d) {
  draft = d ? { categories: clone(d.categories), settings: clone(d.settings || {}) } : null;
  if (draft && !draft.settings.plugins) { draft.settings.plugins = {}; }
  dirty = false;
  if (draft) { measureBg(true); }
}

/* How light the background is behind each text area (same areas and rule as the TV).
   Saved with the settings, so the TV can use it even if it can't read the picture. */
var TONE_AREAS = { greet: [60, 50, 860, 160], dock: [60, 400, 1000, 980], status: [1260, 50, 1840, 160], agenda: [1260, 170, 1830, 620], music: [1260, 600, 1830, 1000] };
// An sRGB channel (0-255) as linear light (0-1).
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
// Pictures used as the background, loaded once (for measuring and the preview).
var bgCache = {};
// Load a background picture once; cb(img), or cb(null) if it won't load.
function bgImage(p, cb) {
  var c = bgCache[p];
  if (c && c.img) { cb(c.img); return; }
  if (c) { c.waiting.push(cb); return; }
  c = bgCache[p] = { img: null, waiting: [cb] };
  var img = new Image();
  img.onload = function () { c.img = img; var w = c.waiting; c.waiting = []; w.forEach(function (f) { f(img); }); };
  img.onerror = function () { delete bgCache[p]; c.waiting.forEach(function (f) { f(null); }); };
  img.src = asset(p);
}
// Measure the background's tone and save it with the settings (silent: don't mark as changed).
function measureBg(silent) {
  var s = draft.settings, p = s.background;
  if (!p) { if (s.bgTone) { s.bgTone = null; if (!silent) { markDirty(); } } return; }
  var key = window.TVBG.key(s);
  if (s.bgTone && s.bgTone.src === key) { return; }
  bgImage(p, function (img) {
    if (!img || window.TVBG.key(draft.settings) !== key) { return; }
    var W = 192, H = 108, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'); window.TVBG.draw(ctx, W, H, img, window.TVBG.opts(draft.settings));
    var d = ctx.getImageData(0, 0, W, H).data, t = { src: key, busy: {} };
    Object.keys(TONE_AREAS).forEach(function (k) {
      var a = TONE_AREAS[k], sum = 0, n = 0, ps = 0, ps2 = 0;
      for (var y = Math.floor(a[1] / 10); y < Math.ceil(a[3] / 10); y++) {
        for (var x = Math.floor(a[0] / 10); x < Math.ceil(a[2] / 10); x++) {
          var i = (y * W + x) * 4;
          var Y = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]), P = Math.pow(Y, 1 / 2.2);
          sum += Y; ps += P; ps2 += P * P; n++;
        }
      }
      t[k] = sum / n > 0.2 ? 'light' : 'dark';
      t.busy[k] = Math.sqrt(Math.max(0, ps2 / n - (ps / n) * (ps / n))) > 0.1;
    });
    draft.settings.bgTone = t;
    if (!silent) { markDirty(); }
    renderSettings();   // (even if hidden, so it's current when the tab is opened)
  });
}
// Something was changed: enable Save.
function markDirty() { dirty = true; showStatus(); }
// Update "Saved" / "Unsaved changes" / "Saving…" in the header, and the Save button.
function showStatus() {
  var s = $('#status');
  s.className = 'status' + (dirty ? ' dirty' : '');
  s.textContent = saving ? 'Saving…' : dirty ? 'Unsaved changes' : (server ? 'Saved' : '');
  $('#save').disabled = !dirty || saving || !draft;
}
