/* The dock: the rows of app icons, moving the focus around them, and the settings button. */
'use strict';

/* ---------------------------------------------------------------
   Rendering
---------------------------------------------------------------- */
var cats = [];            // [{ cfg, section, discs:[{cfg,node,canvas}], last }]
var cur = { c: -1, i: 0 };
var homeCat = 0;
var lastFire = 0;

// Make the element for one tile (the rounded icon and its label). Returns { cfg, node, glyph }.
function buildDisc(t) {
  var node = el('div', 'disc');
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', t.name || '');

  node.appendChild(el('span', 'bodyon'));
  node.appendChild(el('span', 'sheen2'));
  node.appendChild(el('span', 'caustic'));
  var glyph = el('span', 'glyph');
  node.appendChild(glyph);
  node.appendChild(el('span', 'label', t.name));
  var d = { cfg: t, node: node, glyph: glyph };
  drawGlyph(d);
  return d;
}

// Set the colour a tile fills with when selected (and its glow), or clear it.
function setColour(node, c) {
  if (c) {
    // colour used when the icon is selected (plain 6-digit hex gets a matching glow)
    node.style.setProperty('--c', c);
    node.style.setProperty('--g', /^#[0-9a-f]{6}$/i.test(c) ? c + '99' : c);
  } else {
    node.style.removeProperty('--c');
    node.style.removeProperty('--g');
  }
}

// Draw what's inside a tile: the TV's own icon, your picture, a built-in symbol or text.
function drawGlyph(d) {
  var t = d.cfg, glyph = d.glyph, node = d.node;
  var art = tvIconFor(t);
  glyph.innerHTML = '';
  node.classList.toggle('art', !!art);
  setColour(node, t.color || (art && art.c) || null);
  if (art) {
    var a = el('img', 'glyph-img color');
    a.src = art.src;
    a.alt = '';
    glyph.appendChild(a);
  } else if (t.icon) {
    var img = el('img', 'glyph-img' + (t.colorIcon ? ' color' : ''));
    img.src = asset(t.icon);
    img.alt = '';
    glyph.appendChild(img);
  } else if (t.symbol && ICONS[t.symbol]) {
    glyph.innerHTML = ICONS[t.symbol];
  } else {
    var txt = el('span', 'txt', t.glyph || (t.name || '?').charAt(0).toUpperCase());
    if (t.fs) { txt.style.fontSize = t.fs + 'px'; }
    glyph.appendChild(txt);
  }
}

// New icons arrived: redraw the tiles in place (keeps focus and scroll position).
function refreshArt() {
  cats.forEach(function (c) { c.discs.forEach(drawGlyph); });
  if (window.TVHOME_SETTINGS && window.TVHOME_SETTINGS.isOpen() && window.TVHOME_SETTINGS.iconsChanged) {
    window.TVHOME_SETTINGS.iconsChanged();
  }
}

var CHEV_L = svg('<path d="M14.5 5.5 8 12l6.5 6.5"></path>', 30);
var CHEV_R = svg('<path d="M9.5 5.5 16 12l-6.5 6.5"></path>', 30);

// At most VIS icons of a row are shown; the arrows page through the rest.
function vis() { return Math.max(1, CFG.maxVisible || 4); }

// Show only the tiles of a row that fit (from obj.start), and the arrows if there are more.
function applyWindow(obj) {
  var n = obj.discs.length, v = vis();
  if (obj.tiles) { obj.tiles.classList.add('jump'); }
  obj.start = Math.max(0, Math.min(obj.start, Math.max(0, n - v)));
  obj.discs.forEach(function (d, i) {
    d.node.style.display = (i >= obj.start && i < obj.start + v) ? '' : 'none';
  });
  obj.prev.style.display = obj.start > 0 ? 'flex' : 'none';
  obj.next.style.display = obj.start + v < n ? 'flex' : 'none';
  // Icons change slot when the row scrolls: commit that without transitions so the
  // icon that was focused doesn't visibly shrink/fade at its new position (a flash).
  if (obj.tiles) { void obj.tiles.offsetWidth; obj.tiles.classList.remove('jump'); }
}

// Scroll a row, if needed, so tile ti is on screen.
function ensureVisible(obj, ti) {
  var v = vis(), was = obj.start;
  if (ti < obj.start) { obj.start = ti; }
  else if (ti >= obj.start + v) { obj.start = ti - v + 1; }
  if (obj.start !== was) { applyWindow(obj); } // only touch the row when it actually scrolls
}

// The arrows at the ends of a row: scroll it by one (dir -1 or 1) and keep the focus in the same slot.
function page(ci, dir) {
  var obj = cats[ci], v = vis();
  if (!obj) { return; }
  var old = cats[cur.c] && cats[cur.c].discs[cur.i];
  if (old) { old.node.classList.remove('focus'); }
  obj.start += dir;
  applyWindow(obj);
  // Keep the focus in the same on-screen slot: it moves with the row, so paging
  // forward lands on the next app instead of appearing to jump back one.
  var from = (cur.c === ci) ? cur.i : obj.last;
  select(ci, Math.max(obj.start, Math.min(obj.start + v - 1, from + dir)));
}

// Build the dock from CFG.categories: one section per category, one tile per app.
function render() {
  var host = $('dock');
  host.innerHTML = '';
  cats = [];
  var primary = -1;

  (CFG.categories || []).forEach(function (c) {
    if (!c.tiles || !c.tiles.length) { return; }
    var ci = cats.length;
    var section = el('section', 'cat');
    var head = el('div', 'head', c.label || '');
    head.setAttribute('role', 'button');
    section.appendChild(head);
    var row = el('div', 'row');
    var tiles = el('div', 'tiles');
    var prevBtn = el('div', 'arrow prev', '');
    prevBtn.innerHTML = CHEV_L;
    prevBtn.setAttribute('role', 'button');
    prevBtn.setAttribute('aria-label', 'Previous apps');
    var nextBtn = el('div', 'arrow next', '');
    nextBtn.innerHTML = CHEV_R;
    nextBtn.setAttribute('role', 'button');
    nextBtn.setAttribute('aria-label', 'More apps');
    tiles.appendChild(prevBtn);
    row.appendChild(tiles);
    section.appendChild(row);
    host.appendChild(section);

    var obj = { cfg: c, section: section, discs: [], last: 0, start: 0, prev: prevBtn, next: nextBtn, tiles: tiles };
    if (c.primary && primary < 0) { primary = ci; }

    head.addEventListener('click', function () { select(ci, 0); });
    prevBtn.addEventListener('click', function () { page(ci, -1); });
    nextBtn.addEventListener('click', function () { page(ci, 1); });

    c.tiles.forEach(function (t, ti) {
      var d = buildDisc(t);
      tiles.appendChild(d.node);
      obj.discs.push(d);
      // Magic Remote pointer: hover focuses, click activates.
      onHover(d.node, function () { select(ci, ti); });
      d.node.addEventListener('click', function () { activate(ci, ti); });
    });
    tiles.appendChild(nextBtn);
    applyWindow(obj);

    cats.push(obj);
  });

  homeCat = primary < 0 ? 0 : primary;
}

/* ---------------------------------------------------------------
   Selection / focus
---------------------------------------------------------------- */
var paintTimer = null;
// Repaint the glass once the row has finished growing.
function schedulePaint() {
  clearTimeout(paintTimer);
  // wait for the row to finish expanding so positions are final
  paintTimer = setTimeout(paintGlass, 400);
}

// Focus tile ti in category ci (opening that category). ti left out: the one it had last time.
function select(ci, ti) {
  var next = cats[ci];
  if (!next) { return; }
  if (ti == null) { ti = next.last; }
  ti = Math.max(0, Math.min(next.discs.length - 1, ti));
  // Already selected (e.g. the pointer resting on it): leave it alone. Re-selecting would
  // briefly shrink the icon, its edge would slip out from under the pointer and back in,
  // and the selection animation would loop.
  if (ci === cur.c && ti === cur.i && !onGear) { return; }
  setGear(false);

  var prev = cats[cur.c];
  if (prev) {
    var old = prev.discs[cur.i];
    if (old) { old.node.classList.remove('focus'); }
    if (cur.c !== ci) { prev.section.classList.remove('open'); }
  }
  ensureVisible(next, ti); // after the old focus is cleared, so the scroll commits that instantly
  if (cur.c !== ci) {
    next.section.classList.add('open');
  }
  cur.c = ci;
  cur.i = ti;
  next.last = ti;
  next.discs[ti].node.classList.add('focus');
}

// Arrow keys: left/right along the row, up/down between categories, up from the top to the gear.
function move(key) {
  var cat = cats[cur.c];
  if (key === KEY.LEFT && cur.i > 0) { select(cur.c, cur.i - 1); }
  else if (key === KEY.RIGHT && cur.i < cat.discs.length - 1) { select(cur.c, cur.i + 1); }
  else if (key === KEY.UP && cur.c > 0) { select(cur.c - 1, 0); }
  else if (key === KEY.UP && cur.c <= 0) { setGear(true); }
  else if (key === KEY.DOWN && cur.c < cats.length - 1) { select(cur.c + 1, 0); }
}

// OK (or a click) on a tile: play the press animation and run its actions.
function activate(ci, ti) {
  var now = Date.now();
  if (now - lastFire < 500) { return; } // ignore remote key-repeat / double clicks
  lastFire = now;
  var d = cats[ci] && cats[ci].discs[ti];
  if (!d) { return; }
  var node = d.node;
  node.classList.remove('fire');
  void node.offsetWidth; // restart the animation
  node.classList.add('fire');
  // Take it off once it has played: left on, it replays every time the row is shown again
  // (the icon grows, then snaps back).
  clearTimeout(node.fireTimer);
  node.fireTimer = setTimeout(function () { node.classList.remove('fire'); }, 450);
  runActions(d.cfg);
}

/* ---------------------------------------------------------------
   Coming back from an app, the focus goes back to the app you were on instead of the
   first app of the home row.
---------------------------------------------------------------- */
// Focus tile i of row c if it's still there (and still the app called name, if given), else the home row's first app.
function focusTile(c, i, name) {
  setGear(false);
  if (!cats.length) { return; }
  var obj = cats[c];
  if (!obj || !obj.discs[i] || (name != null && (obj.discs[i].cfg.name || '') !== name)) { c = homeCat; i = 0; }
  select(c, i);
}

/* ---------------------------------------------------------------
   Settings button (top right, left of the clock). Up from the top
   section reaches it; the red button on the remote opens Settings too.
---------------------------------------------------------------- */
var onGear = false;
// Move the focus onto the settings button (on = true) or back to the tiles.
function setGear(on) {
  onGear = !!on;
  var g = $('gear');
  if (g) { g.classList.toggle('focus', onGear); }
  var d = cats[cur.c] && cats[cur.c].discs[cur.i];
  if (d) { d.node.classList.toggle('focus', !onGear); }
}
// Next to the status capsule; the capsule hides when no plugin is in it (and Home
// Assistant is fine). Returns true if anything moved.
function placeGear() {
  var g = $('gear'), st = $('status');
  var empty = !pluginsIn('status').length && !st.querySelector('.house.bad');
  if (st.classList.contains('empty') !== empty) { st.classList.toggle('empty', empty); }
  var right = (empty ? 96 : 96 + st.offsetWidth + 20) + 'px';
  if (!g || g.style.right === right) { return false; }
  g.style.right = right;
  return true;
}
// Is the TV's Settings screen open?
function settingsOpen() { return !!(window.TVHOME_SETTINGS && window.TVHOME_SETTINGS.isOpen()); }
// Open the TV's Settings screen (js/settings.js) at the current category.
function openSettings() {
  if (!window.TVHOME_SETTINGS) { return; }
  setGear(false);
  window.TVHOME_SETTINGS.open(cur.c < 0 ? 0 : cur.c);
}
// Called by Settings when it closes: rebuild the dock from the (possibly edited) layout.
function rerender() {
  if (svc && svc.pending && !settingsOpen()) { var d = svc.pending; svc.pending = null; applyDoc(d); return; }
  var was = cur, d = cats[cur.c] && cats[cur.c].discs[cur.i], name = d ? (d.cfg.name || '') : null;
  render();
  cur = { c: -1, i: 0 };
  onGear = false;
  focusTile(was.c, was.i, name);   // stay on the same app if the new layout still has it there
}
