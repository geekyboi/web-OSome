/* TV Home service: the layout document (sections, apps, settings), checked and saved to a file. */
'use strict';
var config = require('./config');
var DATA = config.DATA;
var DOC_FILE = config.DOC_FILE;
var LG_HOME = config.LG_HOME;
var MAX_DOC = config.MAX_DOC;
var log = config.log;
var mkdirp = config.mkdirp;
var readJson = config.readJson;
var writeAtomic = config.writeAtomic;
var luna = require('./luna');
var plugins = require('./plugins');

/* ---------------------------------------------------------------
   The layout document
---------------------------------------------------------------- */
var doc = readJson(DOC_FILE, null);   // { v, rev, updated, categories, settings } or null

var SYMBOLS = ['play', 'tv', 'film', 'note', 'power', 'house', 'speaker', 'input'];
// v if it's a string (cut to max characters), else undefined.
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : undefined; }
// Check one action step ({ app }, { webhook }, { url }, { delay }...), keeping only known fields.
function cleanStep(a) {
  if (!a || typeof a !== 'object') { return null; }
  var o = {};
  if (typeof a.delay === 'number') { o.delay = Math.max(0, Math.min(30000, Math.round(a.delay))); }
  if (str(a.app, 200) && /^[A-Za-z0-9._-]+$/.test(a.app)) { o.app = a.app; }
  if (a.params && typeof a.params === 'object') { o.params = a.params; }
  if (str(a.webhook, 200)) { o.webhook = a.webhook.trim(); }
  if (str(a.url, 500) && /^https?:\/\//i.test(a.url)) { o.url = a.url; }
  if (a.method && /^(GET|POST|PUT)$/i.test(a.method)) { o.method = String(a.method).toUpperCase(); }
  if (a.data && typeof a.data === 'object') {
    o.data = {};
    Object.keys(a.data).slice(0, 20).forEach(function (k) { o.data[String(k).slice(0, 60)] = String(a.data[k]).slice(0, 500); });
  }
  return (o.app || o.webhook || o.url || o.delay != null) ? o : null;
}
// Check one tile, keeping only known fields with sensible values.
function cleanTile(t) {
  if (!t || typeof t !== 'object') { throw new Error('An app entry is not valid.'); }
  var o = cleanStep(t) || {};
  delete o.delay;
  var name = str(t.name, 60);
  if (!name || !name.trim()) { throw new Error('Every app needs a name.'); }
  o.name = name.trim();
  if (Array.isArray(t.actions) && t.actions.length) {
    o.actions = t.actions.slice(0, 10).map(cleanStep).filter(Boolean);
    if (!o.actions.length) { delete o.actions; }
  }
  if (!(o.app || o.webhook || o.url || o.actions)) { throw new Error('"' + o.name + '" needs an app, a webhook or some steps.'); }
  if (str(t.color, 7) && /^#[0-9a-fA-F]{6}$/.test(t.color)) { o.color = t.color.toLowerCase(); }
  if (str(t.glyph, 6)) { o.glyph = t.glyph; }
  if (typeof t.fs === 'number') { o.fs = Math.max(12, Math.min(80, Math.round(t.fs))); }
  if (SYMBOLS.indexOf(t.symbol) >= 0) { o.symbol = t.symbol; }
  if (str(t.icon, 300) && /^(files\/[A-Za-z0-9._-]+|assets\/[A-Za-z0-9._\/-]+|https?:\/\/\S+)$/.test(t.icon) && t.icon.indexOf('..') < 0) { o.icon = t.icon; }
  if (t.colorIcon === true) { o.colorIcon = true; }
  if (t.noTvIcon === true) { o.noTvIcon = true; }
  return o;
}
// Check the settings, keeping only known ones (plugins' settings are checked by the plugins).
function cleanSettings(s) {
  var o = {};
  if (!s || typeof s !== 'object') { return o; }
  function int(v, lo, hi) { v = parseInt(v, 10); return isNaN(v) ? undefined : Math.max(lo, Math.min(hi, v)); }
  if (s.maxVisible != null) { o.maxVisible = int(s.maxVisible, 1, 10); }
  if (s.idleDimMinutes != null) { o.idleDimMinutes = int(s.idleDimMinutes, 0, 240); }
  if (s.background === null) { o.background = null; }
  else if (str(s.background, 300) && /^(files\/[A-Za-z0-9._-]+|assets\/[A-Za-z0-9._\/-]+)$/.test(s.background) && s.background.indexOf('..') < 0) { o.background = s.background; }
  if (typeof s.useTvIcons === 'boolean') { o.useTvIcons = s.useTvIcons; }
  if (str(s.haUrl, 200) && /^https?:\/\/[^\s]+$/i.test(s.haUrl)) { o.haUrl = s.haUrl.replace(/\/+$/, ''); }
  if (str(s.haAppsList, 300)) { o.haAppsList = s.haAppsList; }
  if (/^(auto|light|dark)$/.test(s.textStyle || '')) { o.textStyle = s.textStyle; }
  if (typeof s.shade === 'boolean') { o.shade = s.shade; }
  o.plugins = plugins.cleanPluginSettings(s);   // each plugin's own settings (plugins section below)
  if (/^(fill|fit|stretch|center|tile)$/.test(s.bgFit || '')) { o.bgFit = s.bgFit; }
  if (/^(colour|blur)$/.test(s.bgEdge || '')) { o.bgEdge = s.bgEdge; }
  if (/^#[0-9a-fA-F]{6}$/.test(s.bgColour || '')) { o.bgColour = s.bgColour.toLowerCase(); }
  if (s.bgTone === null) { o.bgTone = null; }
  else if (s.bgTone && typeof s.bgTone === 'object' && str(s.bgTone.src, 300)) {
    var t = { src: s.bgTone.src };
    ['greet', 'dock', 'status', 'agenda', 'music'].forEach(function (k) { if (/^(light|dark)$/.test(s.bgTone[k] || '')) { t[k] = s.bgTone[k]; } });
    if (s.bgTone.busy && typeof s.bgTone.busy === 'object') {
      t.busy = {};
      ['greet', 'dock', 'status', 'agenda', 'music'].forEach(function (k) { if (typeof s.bgTone.busy[k] === 'boolean') { t.busy[k] = s.bgTone.busy[k]; } });
    }
    o.bgTone = t;
  }
  Object.keys(o).forEach(function (k) { if (o[k] === undefined) { delete o[k]; } });
  return o;
}
// Check a whole layout from the TV or the editor before it's saved. Throws if it's unusable.
function cleanDoc(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.categories)) { throw new Error('Expected { categories: [...] }.'); }
  if (!input.categories.length) { throw new Error('Keep at least one section.'); }
  if (input.categories.length > 12) { throw new Error('At most 12 sections.'); }
  var ids = {};
  var cats = input.categories.map(function (c, i) {
    if (!c || typeof c !== 'object') { throw new Error('A section is not valid.'); }
    var label = str(c.label, 40);
    if (!label || !label.trim()) { throw new Error('Every section needs a name.'); }
    var id = str(c.id, 40) && /^[A-Za-z0-9_-]+$/.test(c.id) ? c.id : label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('section-' + (i + 1));
    while (ids[id]) { id += '-' + (i + 1); }
    ids[id] = true;
    var tiles = Array.isArray(c.tiles) ? c.tiles.slice(0, 60).map(cleanTile) : [];
    var o = { id: id, label: label.trim(), tiles: tiles };
    if (c.primary === true) { o.primary = true; }
    return o;
  });
  // LG Home is the way back to LG's own home screen: always keep one.
  var hasHome = cats.some(function (c) { return c.tiles.some(function (t) { return t.app === LG_HOME; }); });
  if (!hasHome) { cats[cats.length - 1].tiles.push({ name: 'LG Home', symbol: 'house', app: LG_HOME }); }
  return { categories: cats, settings: cleanSettings(input.settings) };
}
// Save a checked layout as the next revision and tell the TV app and the plugins.
function saveDoc(clean, source) {
  var next = { v: 1, rev: (doc ? doc.rev : 0) + 1, updated: Date.now(), categories: clean.categories, settings: clean.settings };
  var json = JSON.stringify(next);
  if (json.length > MAX_DOC) { throw new Error('The layout is too large.'); }
  mkdirp(DATA);
  writeAtomic(DOC_FILE, json);
  doc = next;
  log('saved rev', doc.rev, 'from', source);
  luna.notify(luna.layoutSubs, { returnValue: true, doc: doc });
  plugins.eachPluginHook('settingsChanged');
  return doc;
}

// used by the other files
exports.cleanDoc = cleanDoc;
Object.defineProperty(exports, 'doc', { get: function () { return doc; } });
exports.saveDoc = saveDoc;
