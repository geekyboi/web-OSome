/* TV Home service: finds the plugins in plugins/ and runs their service.js parts. */
'use strict';
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var config = require('./config');
var APP_DIR = config.APP_DIR;
var DOC_FILE = config.DOC_FILE;
var log = config.log;
var readJson = config.readJson;
var writeAtomic = config.writeAtomic;
var ha = require('./homeassistant');
var layout = require('./layout');
var luna = require('./luna');
var power = require('./power');
var web = require('./http');

/* ---------------------------------------------------------------
   Plugins: each tile is a folder in the app's plugins/ folder (see plugins/README.md).
   A plugin with a service.js runs its part here: fetching the calendar, the weather, the
   bins, asking the amplifier. The folder is looked at again every 30 seconds (and when the
   TV app or the editor asks), so adding, removing or changing a plugin takes effect
   without restarting anything: new ones start, removed ones stop, changed ones restart.
---------------------------------------------------------------- */
var PLUGIN_DIR = path.join(APP_DIR, 'plugins');
var PLUGIN_ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
var pluginList = [];          // what the TV app and the editor are told: [{ id, name, description, version, order, rev, tile, editor, service }]
var pluginMods = {};          // id -> { rev, mod, inst, timers: [], topics: {}, methods: {}, routes: [] }
var pluginsSubs = {};

function fileRev(dir, names) {
  // a short fingerprint of the plugin's files, so a changed file reloads it
  var h = crypto.createHash('sha1');
  names.forEach(function (n) {
    try { var st = fs.statSync(path.join(dir, n)); if (st.isFile()) { h.update(n + ':' + st.size + ':' + st.mtime.getTime() + ';'); } } catch (e) { /* gone */ }
  });
  return h.digest('hex').slice(0, 12);
}
// Read the plugins folder: one entry per plugin, from its plugin.json and the files it has.
// null if the folder can't be read right now.
function scanPlugins() {
  var out = [];
  var ids = [];
  try { ids = fs.readdirSync(PLUGIN_DIR); }
  catch (e) { if (e.code === 'ENOENT') { return []; } log('plugins folder', e.code || e.message); return null; }   // can't read it now: keep what's running
  ids.sort().forEach(function (id) {
    if (!PLUGIN_ID.test(id)) { return; }
    var dir = path.join(PLUGIN_DIR, id), names;
    try { if (!fs.statSync(dir).isDirectory()) { return; } names = fs.readdirSync(dir).sort(); } catch (e) { return; }
    var j = readJson(path.join(dir, 'plugin.json'), {}) || {};
    function has(n) { return names.indexOf(n) >= 0; }
    function part(field, script, style) {
      var spec = j[field];
      if (spec === false) { return null; }
      var sc = (spec && spec.script) || script, sy = (spec && spec.style) || style;
      sc = has(sc) ? sc : null; sy = has(sy) ? sy : null;
      return sc || sy ? { script: sc, style: sy } : null;
    }
    var serviceFile = j.service === false ? null : (typeof j.service === 'string' ? j.service : 'service.js');
    var meta = {
      id: id,
      name: typeof j.name === 'string' ? j.name.slice(0, 60) : id,
      description: typeof j.description === 'string' ? j.description.slice(0, 300) : '',
      version: typeof j.version === 'string' ? j.version.slice(0, 20) : '',
      order: typeof j.order === 'number' ? j.order : undefined,
      rev: fileRev(dir, names),
      tile: part('tile', 'tile.js', 'tile.css'),
      editor: part('editor', 'editor.js', 'editor.css'),
      service: !!(serviceFile && has(serviceFile) && /^[A-Za-z0-9._-]+\.js$/.test(serviceFile))
    };
    if (meta.service) { meta._serviceFile = serviceFile; }
    if (meta.tile || meta.editor || meta.service) { out.push(meta); }
  });
  return out;
}
// The plugin list as the TV app and the editor see it.
function publicList() {
  return pluginList.map(function (m) {
    var o = {};
    Object.keys(m).forEach(function (k) { if (k.charAt(0) !== '_') { o[k] = m[k]; } });
    return o;
  });
}
// A key for the whole plugin list; changes when any plugin is added, removed or changed.
function pluginsRev() { return pluginList.map(function (m) { return m.id + '@' + m.rev; }).join(','); }

// What a plugin's service.js gets to work with.
function pluginApi(id, rec) {
  function track(t) { rec.timers.push(t); return t; }
  return {
    id: id,
    dir: path.join(PLUGIN_DIR, id),
    log: function () { log.apply(null, ['[' + id + ']'].concat(Array.prototype.slice.call(arguments))); },
    // this plugin's settings (settings.plugins[id] in the layout)
    settings: function () { var s = (layout.doc && layout.doc.settings && layout.doc.settings.plugins) || {}; return s[id] || {}; },
    allSettings: function () { return (layout.doc && layout.doc.settings) || {}; },
    haBase: function () { return ha.haBase(); },
    haToken: function () { return ha.haToken(); },
    tvOn: function () { return power.tvOn; },
    stale: power.stale,
    // something the TV app subscribes to (api.service.subscribe(name) in tile.js): payloadFn() gives the current value
    topic: function (name, payloadFn) { rec.topics[name] = { fn: payloadFn, subs: {} }; },
    publish: function (name) { var t = rec.topics[name]; if (t) { luna.notify(t.subs, t.fn()); } },
    // a one-off request from the TV app (api.service.call(name) in tile.js): fn(params, reply)
    method: function (name, fn) { rec.methods[name] = fn; },
    // HTTP for the editor: /api/p/<id>/<path> (signed in). local: true also serves it to the TV
    // itself at /p/<id>/<path> (e.g. pictures the TV app shows). fn(req, res, query, rest)
    route: function (verb, sub, fn, opts) { rec.routes.push({ verb: verb, sub: sub, fn: fn, local: !!(opts && opts.local) }); },
    every: function (ms, fn) { return track(setInterval(power.whileOn(safe(id, fn)), ms)); },   // paused while the TV is off or another app is in front
    after: function (ms, fn) { return track(setTimeout(safe(id, fn), ms)); },
    readBody: web.readBody,
    readJson: function (req, limit, cb) {
      web.readBody(req, limit, function (err, body) {
        var j = null;
        if (!err) { try { j = JSON.parse(body.toString('utf8')); } catch (e) { j = null; } }
        cb(j || {});
      });
    },
    sendJson: web.sendJson,
    send: web.send
  };
}
// Wrap a plugin's callback so an error is logged instead of stopping the service.
function safe(id, fn) {
  return function () { try { return fn.apply(this, arguments); } catch (e) { log('[' + id + '] error', e.stack || e.message); } };
}
// Call a plugin's service function by name (e.g. 'powerOn'), safely.
function hook(id, name, args) {
  var rec = pluginMods[id];
  if (!rec || !rec.inst || typeof rec.inst[name] !== 'function') { return undefined; }
  try { return rec.inst[name].apply(rec.inst, args || []); } catch (e) { log('[' + id + '] ' + name + ' failed', e.stack || e.message); return undefined; }
}
// Call a function by name on every plugin's service part.
function eachPluginHook(name, args) { Object.keys(pluginMods).forEach(function (id) { hook(id, name, args); }); }

// Stop a plugin's service part, clear its timers and forget its code.
function stopPluginService(id) {
  var rec = pluginMods[id];
  if (!rec) { return; }
  hook(id, 'stop');
  rec.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
  delete pluginMods[id];
  // forget its code, so a changed file is read again
  var dir = path.join(PLUGIN_DIR, id) + path.sep;
  Object.keys(require.cache).forEach(function (k) { if (k.indexOf(dir) === 0) { delete require.cache[k]; } });
  log('plugin stopped', id);
}
// Load a plugin's service.js and start it with its api (see plugins/README.md).
function startPluginService(meta) {
  var rec = { rev: meta.rev, mod: null, inst: null, timers: [], topics: {}, methods: {}, routes: [] };
  try {
    rec.mod = require(path.join(PLUGIN_DIR, meta.id, meta._serviceFile));
  } catch (e) { log('plugin', meta.id, 'failed to load:', e.stack || e.message); return; }
  pluginMods[meta.id] = rec;
  if (rec.mod && typeof rec.mod.start === 'function') {
    try { rec.inst = rec.mod.start(pluginApi(meta.id, rec)) || {}; }
    catch (e) { log('plugin', meta.id, 'failed to start:', e.stack || e.message); }
  }
  log('plugin started', meta.id, meta.rev);
}
// Look in the folder; start, stop and restart plugins to match. Returns true if anything changed.
function refreshPlugins() {
  var next = scanPlugins();
  if (!next) { return false; }
  var before = pluginsRev();
  var want = {};
  next.forEach(function (m) { if (m.service) { want[m.id] = m; } });
  Object.keys(pluginMods).forEach(function (id) {
    if (!want[id] || want[id].rev !== pluginMods[id].rev) { stopPluginService(id); }
  });
  pluginList = next;
  var started = false;
  next.forEach(function (m) { if (m.service && !pluginMods[m.id]) { startPluginService(m); started = true; } });
  // settings saved before this plugin was installed, in the older flat form: carry them over
  if (started && layout.doc && layout.doc.settings) { migrateDoc(); }
  var changed = pluginsRev() !== before;
  if (changed) {
    log('plugins:', pluginList.map(function (m) { return m.id; }).join(', ') || 'none');
    luna.notify(pluginsSubs, { returnValue: true, plugins: publicList() });
  }
  return changed;
}

/* Settings: each plugin's live under settings.plugins[id]. A plugin's service.js can clean
   them (settings.clean) and carry over settings saved before plugins (settings.migrate,
   which reads the old flat settings; settings.legacy lists the old keys). Plugins without a
   cleaner, and plugins that have been removed, keep what they had (within reason), so
   removing a plugin and adding it back keeps its settings. */
var MAX_PLUGIN_SETTINGS = 16 * 1024;
// v as plain JSON data (an object, not too big), or null.
function plainJson(v) {
  try { var j = JSON.stringify(v); return j && j.length <= MAX_PLUGIN_SETTINGS && v && typeof v === 'object' && !Array.isArray(v) ? JSON.parse(j) : null; }
  catch (e) { return null; }
}
// A plugin's settings rules from its service.js (clean, migrate, legacy).
function pluginSettingsSpec(id) {
  var rec = pluginMods[id];
  return (rec && rec.mod && rec.mod.settings) || {};
}
// Check every plugin's settings (settings.plugins) with that plugin's own rules.
function cleanPluginSettings(input) {
  var given = input.plugins && typeof input.plugins === 'object' ? input.plugins : {};
  var out = {};
  Object.keys(given).slice(0, 40).forEach(function (id) {
    if (!PLUGIN_ID.test(id)) { return; }
    var spec = pluginSettingsSpec(id), v = given[id];
    if (typeof spec.clean === 'function') {
      try { v = spec.clean(v && typeof v === 'object' ? v : {}); } catch (e) { log('[' + id + '] settings', e.message); v = null; }
    }
    v = plainJson(v);
    if (v) { out[id] = v; }
  });
  // older flat settings (calendarUrl...) for plugins that don't have settings yet
  Object.keys(pluginMods).forEach(function (id) {
    var spec = pluginSettingsSpec(id);
    if (out[id] || typeof spec.migrate !== 'function') { return; }
    var v = null;
    try { v = spec.migrate(input); if (v && typeof spec.clean === 'function') { v = spec.clean(v); } } catch (e) { v = null; }
    v = plainJson(v);
    if (v) { out[id] = v; }
  });
  return out;
}
// The saved layout, in the older flat form: move what the plugins understand under settings.plugins.
function migrateDoc() {
  var s = layout.doc.settings, keys = [];
  Object.keys(pluginMods).forEach(function (id) { keys = keys.concat(pluginSettingsSpec(id).legacy || []); });
  var has = keys.some(function (k) { return s[k] !== undefined; });
  if (!has) { return; }
  var plugins = cleanPluginSettings(s);
  layout.doc.settings.plugins = plugins;
  keys.forEach(function (k) { delete layout.doc.settings[k]; });
  try { writeAtomic(DOC_FILE, JSON.stringify(layout.doc)); log('settings moved to the plugins:', Object.keys(plugins).join(', ')); }
  catch (e) { log('could not save the moved settings', e.message); }
}

// Run a plugin's method (api.method in its service.js) and reply.
function pluginCall(id, method, params, reply) {
  var rec = pluginMods[id];
  var fn = rec && rec.methods[method];
  if (!fn) { reply({ returnValue: false, errorText: 'No such plugin method: ' + id + '/' + method }); return; }
  try { fn(params || {}, reply); } catch (e) { log('[' + id + '] ' + method, e.stack || e.message); reply({ returnValue: false, errorText: e.message }); }
}
// A plugin's topic (api.topic in its service.js), for subscribing to its data.
function pluginTopic(id, topic) {
  var rec = pluginMods[id];
  return rec && rec.topics[topic];
}
// HTTP: /api/p/<id>/<rest> (signed in) or /p/<id>/<rest> (signed in, or the TV itself)
function pluginRoute(req, res, u, local) {
  var m = /^\/(?:api\/)?p\/([a-z0-9][a-z0-9_-]{0,40})\/(.*)$/.exec(u.pathname || '');
  var rec = m && pluginMods[m[1]];
  if (!rec) { return false; }
  var rest = m[2], hit = null;
  rec.routes.forEach(function (r) {
    if (hit || r.verb !== req.method || (local && !r.local)) { return; }
    if (r.sub === rest || (/\/$/.test(r.sub) && rest.indexOf(r.sub) === 0)) { hit = r; }   // 'art/' matches art/<anything>
  });
  if (!hit) { return false; }
  try { hit.fn(req, res, u.query, rest.slice(hit.sub.length)); }
  catch (e) { log('[' + m[1] + '] ' + rest, e.stack || e.message); web.sendJson(res, 500, { error: 'Something went wrong.' }); }
  return true;
}

// used by the other files
exports.PLUGIN_DIR = PLUGIN_DIR;
exports.cleanPluginSettings = cleanPluginSettings;
exports.eachPluginHook = eachPluginHook;
exports.pluginCall = pluginCall;
Object.defineProperty(exports, 'pluginList', { get: function () { return pluginList; } });
exports.pluginRoute = pluginRoute;
exports.pluginTopic = pluginTopic;
exports.pluginsRev = pluginsRev;
exports.pluginsSubs = pluginsSubs;
exports.publicList = publicList;
exports.refreshPlugins = refreshPlugins;
