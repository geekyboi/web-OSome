/* Readable text on any background: dark text where the picture is light. */
'use strict';

/* ---------------------------------------------------------------
   Readable text on any background.
   The brightness behind each text area is measured (greeting, sections, clock). Where
   the picture is light, that area switches to dark text and light glass. textStyle in
   the settings can force 'light' or 'dark' text; 'auto' (default) uses the measurement.
   The editor also measures uploaded backgrounds and saves the result (bgTone), used
   when the TV can't read the picture's pixels.
---------------------------------------------------------------- */
var measuredTone = null;   // { greet, dock, status: 'light' | 'dark' } (the background's tone)
var TONE_AREAS = {          // in 1920x1080 pixels: where each text area sits
  greet:  [60, 50, 860, 160],
  dock:   [60, 400, 1000, 980],
  status: [1260, 50, 1840, 160],
  agenda: [1260, 170, 1830, 620],
  music:  [1260, 600, 1830, 1000]
};
// Measure the background behind each text area: { greet: 'light' | 'dark', ..., busy: {...} }.
// null if the picture's pixels can't be read.
function measureTone() {
  try {
    var W = 192, H = 108, cv = composeBg(W, H);
    var ctx = cv.getContext('2d');
    var data = ctx.getImageData(0, 0, W, H).data, out = {}, busy = {};
    Object.keys(TONE_AREAS).forEach(function (k) {
      var a = TONE_AREAS[k], sum = 0, n = 0, ps = 0, ps2 = 0;
      for (var y = Math.floor(a[1] / 10); y < Math.ceil(a[3] / 10); y++) {
        for (var x = Math.floor(a[0] / 10); x < Math.ceil(a[2] / 10); x++) {
          var i = (y * W + x) * 4;
          var Y = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
          var P = Math.pow(Y, 1 / 2.2);               // closer to how bright it looks
          sum += Y; ps += P; ps2 += P * P; n++;
        }
      }
      // white text reads better below this luminance, dark text above it
      out[k] = sum / n > 0.2 ? 'light' : 'dark';
      // a lot of light/dark variation (snow and trees, clouds): text needs extra help
      var sd = Math.sqrt(Math.max(0, ps2 / n - (ps / n) * (ps / n)));
      busy[k] = sd > 0.1;
    });
    out.busy = busy;
    return out;
  } catch (e) {
    return null;   // pixels can't be read (e.g. a picture from another origin)
  }
}
// An sRGB channel (0-255) as linear light (0-1).
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

var toneInk = function () { return false; }, toneBusy = function () { return false; };
// A plugin's tile follows the tone of the area it says it's in (tone: 'agenda' etc.):
// dark text (.ink) where the picture is light, and .busy over busy pictures if it asks (busy: true).
function toneOne(p) {
  var d = p.def;
  if (p.state !== 'on' || !d.tone) { return; }
  p.root.classList.toggle('ink', toneInk(d.tone));
  if (d.busy) { p.root.classList.toggle('busy', toneBusy(d.tone)); }
}
// Switch each area to dark or light text (and plain or busy styling) to suit the background.
function applyTone() {
  var style = CFG.textStyle || 'auto', tone = null;
  if (style === 'auto') {
    if (measuredTone) { tone = measuredTone; }               // (also a plain colour, with no picture)
    else if (CFG.background && CFG.bgTone && CFG.bgTone.src === bgKey()) { tone = CFG.bgTone; }
  }
  function ink(area) {                       // dark text for this area?
    if (style === 'dark') { return true; }
    if (style === 'light') { return false; }
    return !!(tone && tone[area] === 'light');
  }
  // busy picture behind it: heavier text with a halo (whatever its colour)
  var busySrc = (measuredTone && measuredTone.busy) || (CFG.bgTone && CFG.bgTone.src === bgKey() && CFG.bgTone.busy) || null;
  function busy(area) { return !!(CFG.background && busySrc && busySrc[area]); }
  toneInk = ink; toneBusy = busy;
  $('dock').classList.toggle('busy', busy('dock'));
  $('dock').classList.toggle('ink', ink('dock'));
  $('status').classList.toggle('ink', ink('status'));
  $('gear').classList.toggle('ink', ink('status'));
  Object.keys(plugins).forEach(function (k) { toneOne(plugins[k]); });
  var sh = $('shade');
  if (sh) {
    sh.className = CFG.shade ? (ink('dock') ? 'on ink' : 'on') : '';
  }
  paintGlass();   // light and dark glass are painted differently
}
