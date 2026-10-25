/* The sections and their apps, and the settings that go with them.
   config.js holds the defaults; once you change things (in Settings on the TV or in the
   web editor) the TV keeps your copy in local storage and uses that instead. */
'use strict';

var CFG = window.TVHOME_CONFIG || { categories: [] };
var HA = CFG.homeAssistant || {};

/* The sections and their apps: config.js holds the defaults; once you change them in
   Settings, the TV keeps your version in its local storage and uses that instead. */
var STORE = 'tvhome.layout.v1';
var DEFAULT_CATS = JSON.parse(JSON.stringify(CFG.categories || []));
/* LG Home is the way back to LG's own home screen (this app can't take over the
   Home button), so it must always be on the screen. If a layout doesn't have it,
   it's put back at the end of the last section. */
var LG_HOME = 'com.webos.app.home';
// Is this the LG Home tile (which can't be removed)?
function isLocked(t) { return !!(t && t.app === LG_HOME); }
// Make sure some tile opens LG Home; if none does, add one to the last section. Returns list.
function ensureHome(list) {
  if (!list || !list.length) { return list; }
  for (var i = 0; i < list.length; i++) {
    var tiles = list[i].tiles || [];
    for (var j = 0; j < tiles.length; j++) { if (isLocked(tiles[j])) { return list; } }
  }
  var last = list[list.length - 1];
  if (!last.tiles) { last.tiles = []; }
  last.tiles.push({ name: 'LG Home', symbol: 'house', app: LG_HOME });
  return list;
}

// Settings that can be changed from the phone/laptop editor (they override config.js).
function applySettings(st) {
  if (!st) { return; }
  if (st.maxVisible != null) { CFG.maxVisible = st.maxVisible; }
  if (st.idleDimMinutes != null) { CFG.idleDimMinutes = st.idleDimMinutes; }
  if (st.background !== undefined) { CFG.background = st.background; }
  if (typeof st.useTvIcons === 'boolean') { CFG.useTvIcons = st.useTvIcons; }
  if (st.haUrl) { HA.url = st.haUrl; }
  if (st.haAppsList) { HA.appsList = st.haAppsList; }
  if (st.textStyle) { CFG.textStyle = st.textStyle; }
  if (typeof st.shade === 'boolean') { CFG.shade = st.shade; }
  if (st.bgTone !== undefined) { CFG.bgTone = st.bgTone; }
  if (st.bgFit) { CFG.bgFit = st.bgFit; }
  if (st.bgEdge) { CFG.bgEdge = st.bgEdge; }
  if (st.bgColour) { CFG.bgColour = st.bgColour; }
}
var savedSettings = null;     // settings that came from the editor, kept with the layout
// Read the saved layout (and editor settings) from local storage. null if there isn't one.
function loadLayout() {
  try {
    var j = window.localStorage.getItem(STORE);
    if (j) {
      var l = JSON.parse(j);
      if (l && l.settings) { savedSettings = l.settings; applySettings(l.settings); }
      if (l && l.categories && l.categories.length) { return ensureHome(l.categories); }
    }
  } catch (e) { /* storage unavailable: use the defaults */ }
  return null;
}
// Save the current layout to local storage. false if storage isn't available.
function storeLocal() {
  try { window.localStorage.setItem(STORE, JSON.stringify({ v: 1, categories: CFG.categories, settings: savedSettings })); } catch (e) { return false; }
  return true;
}
// Use a new layout (from Settings on the TV): keep it locally and send it to the service.
function saveLayout(list) {
  ensureHome(list);
  CFG.categories = list;
  var ok = storeLocal();
  pushToService();
  return ok;
}
// Go back to the sections in config.js.
function resetLayout() {
  CFG.categories = ensureHome(JSON.parse(JSON.stringify(DEFAULT_CATS)));
  storeLocal();
  pushToService();
}
(function () { var saved = loadLayout(); CFG.categories = saved || ensureHome(CFG.categories || []); })();
