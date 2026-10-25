/* Bins plugin, the service part: the next collections, from Home Assistant (a calendar per
   bin, one calendar naming the bins, or a sensor with every bin's date). Uses the Home
   Assistant address and token that TV Home keeps (api.haBase / api.haToken); the token is
   never sent to the TV app or the editor. Checked every 30 minutes.
   Settings: { calendars: [{ id, name }], from, until, colours: { bin name: '#rrggbb' } }. Plain ES5. */
'use strict';
var bins = require('./homeassistant.js');

function int(v, lo, hi, dflt) { v = parseInt(v, 10); return isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v)); }

module.exports = {
  settings: {
    legacy: ['binsCalendars', 'binsCalendar', 'binsFrom', 'binsUntil', 'binColours'],
    migrate: function (s) {
      var cals = Array.isArray(s.binsCalendars) ? s.binsCalendars
        : (typeof s.binsCalendar === 'string' && s.binsCalendar ? [{ id: s.binsCalendar }] : null);   // (older single setting)
      if (!cals && s.binsFrom == null && s.binsUntil == null && !s.binColours) { return null; }
      return { calendars: cals || [], from: s.binsFrom, until: s.binsUntil, colours: s.binColours || {} };
    },
    clean: function (s) {
      var o = { calendars: [], from: int(s.from, 12, 23, 16), until: int(s.until, 0, 14, 9), colours: {} };
      (Array.isArray(s.calendars) ? s.calendars : []).slice(0, 8).forEach(function (c) {
        if (c && /^(calendar|sensor)\.[a-z0-9_]+$/.test(c.id || '') && !o.calendars.some(function (x) { return x.id === c.id; })) {
          o.calendars.push({ id: c.id, name: (typeof c.name === 'string' ? c.name.slice(0, 40) : '').trim() });
        }
      });
      if (s.colours && typeof s.colours === 'object') {
        Object.keys(s.colours).slice(0, 16).forEach(function (k) {
          if (k.length <= 60 && /^#[0-9a-fA-F]{6}$/.test(s.colours[k] || '')) { o.colours[k] = s.colours[k].toLowerCase(); }
        });
      }
      return o;
    }
  },

  start: function (api) {
    var bn = { key: '', list: [], error: null, errors: [], at: 0 };
    function binCals() { return api.settings().calendars || []; }
    function binsPayload() {
      var s = api.settings();
      return { returnValue: true, configured: !!(binCals().length && api.haToken()), next: bn.list.slice(0, 3), error: bn.error, errors: bn.errors || [], at: bn.at,
        from: s.from != null ? s.from : 16, until: s.until != null ? s.until : 9, colours: s.colours || {} };
    }
    function binsKey() { var tok = api.haToken(); return JSON.stringify(binCals()) + '|' + api.haBase() + '|' + (tok ? tok.length : 0); }
    function refreshBins() {
      var tok = api.haToken(), key = binsKey();
      bn.key = key;
      if (!binCals().length || !tok) { bn.list = []; bn.error = null; bn.errors = []; api.publish('bins'); return; }
      bins.collections(api.haBase(), tok, binCals(), function (err, list, errors) {
        if (bn.key !== key) { return; }
        if (err) { bn.error = err.message; api.log(err.message); }      // keep the last list we had
        else {
          bn.list = list; bn.error = null; bn.errors = errors || []; bn.at = Date.now();
          bn.errors.forEach(function (x) { api.log(x.id, x.error); });
        }
        api.publish('bins');
      });
    }

    // the TV app: { configured, next: [{ date: 'YYYY-MM-DD', bins: [names] }], from, until, colours, error }
    api.topic('bins', binsPayload);
    api.every(30 * 60 * 1000, refreshBins);
    api.after(2000, refreshBins);

    // the editor
    api.route('GET', 'next', function (req, res) { api.sendJson(res, 200, binsPayload()); });
    api.route('GET', 'calendars', function (req, res) {
      if (!api.haToken()) { api.sendJson(res, 200, { ok: false, error: 'Save a Home Assistant token first.' }); return; }
      bins.calendars(api.haBase(), api.haToken(), function (err, list) {
        if (err) { api.sendJson(res, 200, { ok: false, error: err.message }); return; }
        api.sendJson(res, 200, { ok: true, calendars: list });
      });
    });
    api.route('POST', 'check', function (req, res) {
      api.readJson(req, 8192, function (j) {
        var cals = Array.isArray(j.calendars) ? j.calendars.slice(0, 8) : [];
        if (!api.haToken()) { api.sendJson(res, 200, { ok: false, error: 'Save a Home Assistant token first.' }); return; }
        bins.collections(api.haBase(), api.haToken(), cals, function (e2, list, errors, empty, far) {
          if (e2) { api.sendJson(res, 200, { ok: false, error: e2.message }); return; }
          api.sendJson(res, 200, { ok: true, next: list.slice(0, 5), errors: errors || [], empty: empty || [], far: far || [] });
        });
      });
    });

    return {
      // the settings, the Home Assistant address or the token changed
      settingsChanged: function () {
        if (binsKey() !== bn.key) { bn.list = []; bn.error = null; refreshBins(); } else { api.publish('bins'); }
      },
      powerOn: function () { if (api.stale(bn.at, 30 * 60 * 1000)) { refreshBins(); } }
    };
  }
};
