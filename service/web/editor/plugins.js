/* Web editor: plugin cards. Each plugin's editor.js adds its own card to Settings. */
'use strict';

/* ---------- plugins: each one's card comes from its editor.js ---------- */
var pluginMeta = [];      // from /api/plugins: [{ id, name, description, version, order, rev, tile, editor, service }]
var pluginDefs = {};      // id -> what its editor.js registered
var pluginsRev = '';
var pluginLoading = {};   // id -> id@rev being loaded
// The installed plugins, in their order.
function pluginsInOrder() {
  return pluginMeta.slice().sort(function (a, b) { return (a.order != null ? a.order : 50) - (b.order != null ? b.order : 50) || (a.id < b.id ? -1 : 1); });
}
// editor.js calls TVHOME_EDITOR.plugin({ id, card: function (ctx) { return element; } })
function registerPlugin(def) {
  if (!def || !pluginLoading[def.id]) { return; }
  def._key = pluginLoading[def.id];
  pluginDefs[def.id] = def;
}
// What a plugin's card(ctx) gets: its settings, helpers, and api() for its own routes.
function pluginCtx(id) {
  var all = draft.settings.plugins || (draft.settings.plugins = {});
  return {
    id: id,
    settings: all[id] || (all[id] = {}),          // this plugin's settings (change them, then markDirty)
    allSettings: draft.settings,
    markDirty: markDirty, rerender: renderSettings, toast: toast, h: h, UI: UI, SYM: SYM,
    api: function (path, opts) { return api('/api/p/' + id + '/' + String(path).replace(/^\//, ''), opts); },   // its own routes
    coreApi: api,
    hasHaToken: function () { return haTokenSaved; }
  };
}
// Ask the TV which plugins there are, and load the editor.js of any that are new or changed.
function loadPlugins() {
  return api('/api/plugins').then(function (r) {
    pluginMeta = r.plugins || [];
    pluginsRev = r.rev || '';
    var want = {};
    var loads = pluginMeta.filter(function (m) { return m.editor; }).map(function (m) {
      want[m.id] = true;
      var key = m.id + '@' + m.rev;
      if (pluginDefs[m.id] && pluginDefs[m.id]._key === key) { return null; }
      delete pluginDefs[m.id];
      pluginLoading[m.id] = key;
      var base = '/plugins/' + m.id + '/', q = '?v=' + encodeURIComponent(m.rev);
      var old = document.getElementById('pcss-' + m.id);
      if (old) { old.parentNode.removeChild(old); }
      if (m.editor.style) { document.head.appendChild(h('link', { rel: 'stylesheet', id: 'pcss-' + m.id, href: base + m.editor.style + q })); }
      if (!m.editor.script) { return null; }
      return new Promise(function (resolve) {
        var sc = document.createElement('script');
        sc.onload = sc.onerror = function () { resolve(); };
        sc.src = base + m.editor.script + q;
        document.body.appendChild(sc);
      });
    });
    Object.keys(pluginDefs).forEach(function (id) { if (!want[id]) { delete pluginDefs[id]; } });
    return Promise.all(loads);
  }, function () { pluginMeta = []; });
}
