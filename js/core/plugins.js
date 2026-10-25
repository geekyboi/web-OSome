/* Plugins: loads the tiles in plugins/ and places them on screen. See plugins/README.md. */
'use strict';

/* ---------------------------------------------------------------
   Plugins: the tiles around the dock (clock, greeting, weather, calendar, bins, now
   playing...). Each one is a folder in plugins/ with its own code and styling (see
   plugins/README.md). Adding or removing a folder is all it takes: the list comes from
   the TV Home service, which looks in the folder (and keeps looking, so changes show
   up while TV Home is open), or, without the service, from the folder itself. The last
   list is kept, so the tiles are there straight away at the next start.
---------------------------------------------------------------- */
var PLUGIN_STORE = 'tvhome.plugins.v1';
var PLUGIN_ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
var plugins = {};             // id -> { meta, def, api, root, glass, region, link, script, subs, state }
var pluginsKnown = false;     // a list has arrived (from the cache, the service or the folder)
var pluginsScanned = false;

// Where a plugin goes in its region: plugin.json's order, then tile.js's, else 50.
function pluginOrder(p) { return p.meta.order != null ? p.meta.order : (p.def && p.def.order != null ? p.def.order : 50); }
// The running plugins in a region ('status', 'right' or 'stage'), in order.
function pluginsIn(region) {
  return Object.keys(plugins).map(function (k) { return plugins[k]; })
    .filter(function (p) { return p.state === 'on' && p.region === region; })
    .sort(function (a, b) { return pluginOrder(a) - pluginOrder(b) || (a.meta.id < b.meta.id ? -1 : 1); });
}
// Call one of a plugin's functions; a broken plugin mustn't take the home screen down with it.
function pluginCall(p, fn, args) {
  if (!p.def || typeof p.def[fn] !== 'function') { return undefined; }
  try { return p.def[fn].apply(p.def, args || []); }
  catch (e) { if (window.console) { console.error('Plugin ' + p.meta.id + ' (' + fn + '):', e); } return undefined; }
}
// Call function fn (e.g. 'onMinute') on every running plugin.
function eachPlugin(fn, args) {
  Object.keys(plugins).forEach(function (k) { if (plugins[k].state === 'on') { pluginCall(plugins[k], fn, args); } });
}

// A plugin's settings: saved by the web editor under settings.plugins[id]; before that,
// its older settings (plugin.migrate), or defaults from config.js (plugins: { id: {...} }).
function pluginSettings(p) {
  var all = savedSettings && savedSettings.plugins;
  if (all && all[p.meta.id]) { return all[p.meta.id]; }
  var old = savedSettings ? pluginCall(p, 'migrate', [savedSettings]) : null;
  return old || (CFG.plugins && CFG.plugins[p.meta.id]) || {};
}

// Subscriptions to the plugin's part of the service (its service.js), made once the
// service is connected and cancelled when the plugin is removed.
function pluginSubscribe(p, s) {
  if (!svc.following || s.bridge || p.state !== 'on') { return; }
  s.bridge = lunaSub(SVC + 'plugin', { id: p.meta.id, topic: s.topic }, function (r) {
    if (p.state !== 'on') { return; }
    try { s.cb(r); } catch (e) { if (window.console) { console.error('Plugin ' + p.meta.id + ' (' + s.topic + '):', e); } }
  });
}
// The service is connected: tell the plugins, and make their subscriptions.
function pluginsServiceReady() {
  eachPlugin('onReady');
  Object.keys(plugins).forEach(function (k) { var p = plugins[k]; p.subs.forEach(function (s) { pluginSubscribe(p, s); }); });
}

// Build the api object a plugin's tile.js gets in start(api) (see plugins/README.md).
function makeApi(p) {
  var id = p.meta.id, root = p.root;
  return {
    id: id,
    root: root,                                   // the plugin's element
    region: p.region === 'status' ? $('status') : $('shift'),
    $: function (x) { return root.querySelector('[id="' + x + '"]'); },
    settings: function () { return pluginSettings(p); },
    // show or hide the tile (class "show"); returns true if that changed anything
    show: function (on) {
      on = !!on;
      if (root.classList.contains('show') === on) { return false; }
      root.classList.toggle('show', on);
      layoutRegion(p.region);
      return true;
    },
    layout: function () { layoutRegion(p.region); },   // its size changed
    service: {
      ready: function () { return !!svc.following; },
      subscribe: function (topic, cb) { var s = { topic: topic, cb: cb, bridge: null }; p.subs.push(s); pluginSubscribe(p, s); },
      call: function (method, params, cb, timeoutMs) {
        luna(SVC + 'pluginCall', { id: id, method: method, params: params || {} }, cb || function () {}, timeoutMs || 5000);
      },
      url: function (rest) { return SVC_HTTP + 'p/' + id + '/' + rest; }   // its HTTP routes, from this TV
    },
    util: { pad: pad, esc: esc, el: el, svg: svg },
    luna: luna, toast: toast, asset: asset
  };
}

// A plugin's code and styling have loaded: create its element, put it in place and start it.
function mountPlugin(p) {
  var d = p.def, m = p.meta;
  var root = el(d.tag || 'section', 'plugin plugin-' + m.id + (d.className ? ' ' + d.className : ''));
  Object.keys(d.attrs || {}).forEach(function (k) { root.setAttribute(k, d.attrs[k]); });
  if (d.glass) { root.innerHTML = '<canvas class="gcv"></canvas><span class="sheen"></span>'; }
  if (d.html) { root.insertAdjacentHTML('beforeend', d.html); }
  p.root = root;
  p.glass = d.glass ? root.querySelector('canvas.gcv') : null;
  p.region = d.region === 'status' || d.region === 'right' ? d.region : 'stage';
  // in its region, in order
  var after = pluginsIn(p.region).filter(function (q) { return pluginOrder(q) > pluginOrder(p); })[0];
  var host = p.region === 'status' ? $('status') : $('shift');
  host.insertBefore(root, after ? after.root : (p.region === 'status' ? null : $('gear')));
  p.state = 'on';
  p.api = d.api = makeApi(p);
  pluginCall(p, 'start', [p.api]);
  var now = new Date();
  pluginCall(p, 'onMinute', [now]);
  pluginCall(p, 'onSecond', [now]);
  toneOne(p);
  layoutRegion(p.region);
}

// Stop a plugin and remove everything it added (element, styling, script, subscriptions).
function unloadPlugin(id) {
  var p = plugins[id];
  if (!p) { return; }
  delete plugins[id];
  if (p.state === 'on') { pluginCall(p, 'stop'); }
  p.state = 'off';
  p.subs.forEach(function (s) { if (s.bridge) { try { s.bridge.cancel(); } catch (e) { /* gone */ } } });
  subs = subs.filter(function (b) { return !p.subs.some(function (s) { return s.bridge === b; }); });
  [p.root, p.link, p.script].forEach(function (n) { if (n && n.parentNode) { n.parentNode.removeChild(n); } });
  if (p.region) { layoutRegion(p.region); }
}

// Start loading a plugin's tile.css and tile.js. m = { id, rev, tile: { script, style } }.
function loadPlugin(m) {
  var p = plugins[m.id] = { meta: m, def: null, subs: [], state: 'loading', cssReady: !m.tile.style };
  var base = 'plugins/' + m.id + '/';
  var q = /^https?:$/.test(location.protocol) && m.rev ? '?v=' + encodeURIComponent(m.rev) : '';   // (file:// on the TV: no query)
  function ready() { if (p.state === 'loading' && p.def && p.cssReady) { mountPlugin(p); } }
  if (m.tile.style) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.onload = link.onerror = function () { p.cssReady = true; ready(); };
    setTimeout(link.onload, 2000);                 // never wait on the styling for long
    link.href = base + m.tile.style + q;
    document.head.appendChild(link);
    p.link = link;
  }
  if (!m.tile.script) { p.state = 'failed'; return; }
  p.ready = ready;
  var s = document.createElement('script');
  s.onload = function () { if (p.state === 'loading' && !p.def) { p.state = 'failed'; } };   // ran, but didn't register
  s.onerror = function () { if (p.state === 'loading') { p.state = 'failed'; } };
  s.src = base + m.tile.script + q;
  document.body.appendChild(s);
  p.script = s;
}

// A plugin's tile.js calls TVHOME.plugin({ id, ... }) when it loads.
function registerPlugin(def) {
  var p = def && plugins[def.id];
  if (!p || p.state !== 'loading' || p.def) { return; }   // not one we're loading (removed meanwhile)
  p.def = def;
  p.ready();
}

/* The list of plugins: [{ id, rev, order, tile: { script, style } }]. Loads new ones,
   removes ones that have gone, and reloads ones whose files changed (rev). */
function setPlugins(list) {
  list = (list || []).filter(function (m) { return m && PLUGIN_ID.test(m.id) && m.tile; });
  pluginsKnown = true;
  var want = {};
  list.forEach(function (m) { want[m.id] = m; });
  Object.keys(plugins).forEach(function (id) {
    var m = want[id];
    if (!m || (m.rev || '') !== (plugins[id].meta.rev || '')) { unloadPlugin(id); }
  });
  list.forEach(function (m) { if (!plugins[m.id]) { loadPlugin(m); } });
  try { window.localStorage.setItem(PLUGIN_STORE, JSON.stringify(list)); } catch (e) { /* the list is found again next time */ }
}

// Without the service: look in the plugins folder. (A file:// or http.server folder listing;
// failing that, plugins/index.json: ["clock", "weather", ...].)
function readLocal(path, cb) {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', path, true);
    x.onload = function () { if (x.status !== 0 && x.status !== 200) { cb(new Error('HTTP ' + x.status)); } else { cb(null, x.responseText || ''); } };
    x.onerror = function () { cb(new Error('not found')); };
    x.send();
  } catch (e) { cb(e); }
}
// No service: find the plugins by reading the plugins/ folder ourselves.
function scanPluginFolder() {
  if (pluginsScanned || svc.following) { return; }
  pluginsScanned = true;
  function found(ids) {
    var list = [], left = ids.length;
    if (!left) { setPlugins([]); return; }
    ids.forEach(function (id, i) {
      readLocal('plugins/' + id + '/plugin.json', function (err, text) {
        var j = {};
        try { j = err ? {} : JSON.parse(text); } catch (e) { j = {}; }
        var tile = j.tile === false ? null : { script: (j.tile && j.tile.script) || 'tile.js', style: (j.tile && j.tile.style) || 'tile.css' };
        list[i] = { id: id, order: j.order, rev: j.version || '', tile: tile };
        if (--left === 0 && !svc.following) { setPlugins(list); }
      });
    });
  }
  readLocal('plugins/', function (err, html) {
    var ids = [], m, re = /href="(?:\.\/)?([a-z0-9][a-z0-9_-]*)\/"|addRow\("([a-z0-9][a-z0-9_-]*)",\s*"[^"]*",\s*1/gi;
    while (!err && (m = re.exec(html))) { var id = (m[1] || m[2]).toLowerCase(); if (ids.indexOf(id) < 0 && PLUGIN_ID.test(id)) { ids.push(id); } }
    if (ids.length) { found(ids); return; }
    readLocal('plugins/index.json', function (err2, text) {
      var list2 = [];
      try { list2 = err2 ? [] : JSON.parse(text); } catch (e) { list2 = []; }
      found((Array.isArray(list2) ? list2 : []).filter(function (x) { return PLUGIN_ID.test(x); }));
    });
  });
}
// At start: put up the plugins from last time straight away.
function discoverPlugins() {
  var cached = null;
  try { cached = JSON.parse(window.localStorage.getItem(PLUGIN_STORE) || 'null'); } catch (e) { cached = null; }
  if (cached && cached.length) { setPlugins(cached); }
  // the service's list arrives in follow(); scanPluginFolder() runs if there's no service
}
// Is any plugin still loading?
function pluginsLoading() {
  return Object.keys(plugins).some(function (k) { return plugins[k].state === 'loading'; });
}

/* Where the tiles go.
   status: inside the capsule at the top right, in order (clock, weather...)
   right:  the column under it, stacked in order with 24px between; if they don't all fit,
           plugins with shrink() give up some space (the calendar shows fewer events)
   stage:  anywhere on the screen; the plugin's CSS places it (the greeting) */
var COL_TOP = 176, COL_BOTTOM = 1030, COL_GAP = 24;
// Stack the right-hand column's tiles; if they don't fit, ask plugins to shrink().
function layoutColumn() {
  var list = pluginsIn('right').filter(function (p) { return p.root.classList.contains('show'); });
  pluginsIn('right').forEach(function (p) { pluginCall(p, 'unshrink'); });
  function place() {
    var y = COL_TOP;
    list.forEach(function (p) { p.root.style.top = y + 'px'; y += p.root.offsetHeight + COL_GAP; });
    return y - COL_GAP;
  }
  var bottom = place(), guard = 0;
  while (bottom > COL_BOTTOM && guard++ < 40) {
    if (!list.some(function (p) { return pluginCall(p, 'shrink') === true; })) { break; }
    bottom = place();
  }
  paintGlass();
}
// Something in a region changed size: lay it out again and repaint the glass.
function layoutRegion(region) {
  if (region === 'right') { layoutColumn(); }
  else if (region === 'status') { if (placeGear()) { paintGlass(); } }
  else { paintGlass(); }
}

// Settings closed: apply anything that arrived from the editor meanwhile.
function afterSettings() {
  if (svc.pending) { var d = svc.pending; svc.pending = null; svc.rev = 0; applyDoc(d); }
}
