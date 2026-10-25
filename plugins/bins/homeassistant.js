/* Bin collections from a Home Assistant calendar (e.g. from the Waste Collection Schedule
   integration). Uses HA's REST API with a long-lived access token. */
var http = require('http');
var https = require('https');
var urlmod = require('url');

function haGet(base, token, pth, cb, maxBytes) {
  var limit = maxBytes || 2 * 1024 * 1024;
  var done = false;
  function end(e, j) { if (!done) { done = true; cb(e, j); } }
  var u;
  try { u = urlmod.parse(String(base || '').replace(/\/+$/, '') + pth); } catch (e) { end(new Error('Check the Home Assistant address')); return; }
  if (!/^https?:$/.test(u.protocol || '')) { end(new Error('Set the Home Assistant address first (Settings → Home Assistant)')); return; }
  var req = (u.protocol === 'https:' ? https : http).get({
    hostname: u.hostname, port: u.port, path: u.path,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  }, function (res) {
    var chunks = [], size = 0;
    res.on('data', function (c) { size += c.length; if (size > limit) { req.abort(); end(new Error('Reply too large')); return; } chunks.push(c); });
    res.on('end', function () {
      var text = Buffer.concat(chunks).toString('utf8'), msg = '';
      try { msg = (JSON.parse(text) || {}).message || ''; } catch (e0) { msg = text.slice(0, 200); }
      if (res.statusCode === 401) { end(new Error('Home Assistant refused the token. Make a new long-lived access token and paste it again.')); return; }
      if (res.statusCode === 404) { end(new Error('Home Assistant doesn\u2019t know that calendar' + (msg ? ' (' + msg + ')' : '') + '.')); return; }
      // say exactly what Home Assistant said, so problems can be traced
      if (res.statusCode !== 200) { end(new Error('Home Assistant answered ' + res.statusCode + (msg ? ': ' + msg : ''))); return; }
      try { end(null, JSON.parse(text)); } catch (e) { end(new Error('Unexpected reply from Home Assistant')); }
    });
  });
  req.on('error', function (e) { end(new Error('Can’t reach Home Assistant at ' + base + ' (' + (e.code || e.message) + ')')); });
  req.setTimeout(10000, function () { req.abort(); end(new Error('Home Assistant didn’t answer')); });
}

// A sensor holding every bin's next date, e.g. UK Bin Collection Data's "Raw JSON" sensor:
// state '{"Green Bin": "30/10/2026", ...}' and/or attribute raw_data { "Green Bin": "2026-10-30" }.
function sensorBins(st) {
  if (!st) { return null; }
  var a = st.attributes || {}, map = null;
  if (a.raw_data && typeof a.raw_data === 'object' && !Array.isArray(a.raw_data)) { map = a.raw_data; }
  else if (typeof st.state === 'string' && st.state.charAt(0) === '{') {
    try { var j = JSON.parse(st.state); if (j && typeof j === 'object' && !Array.isArray(j)) { map = j; } } catch (e) { /* not JSON */ }
  }
  if (!map) { return null; }
  var out = [];
  Object.keys(map).forEach(function (k) {
    var d = toYmd(map[k]);
    if (d && String(k).trim()) { out.push({ name: String(k).trim().slice(0, 40), date: d }); }
  });
  return out.length ? out : null;
}
// '2026-10-30', '30/10/2026' or '30-10-2026' (UK day-first) -> '2026-10-30'
function toYmd(v) {
  v = String(v == null ? '' : v).trim();
  var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(v);
  if (m) { return m[1] + '-' + m[2] + '-' + m[3]; }
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(v);
  if (m) { return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  return '';
}

// The calendars, plus any sensors that hold bin dates, for the editor's list.
function calendars(base, token, cb) {
  haGet(base, token, '/api/calendars', function (err, list) {
    if (err) { cb(err); return; }
    var cals = (Array.isArray(list) ? list : []).map(function (c) { return { id: c.entity_id, name: c.name || c.entity_id, kind: 'calendar' }; })
      .filter(function (c) { return /^calendar\.[a-z0-9_]+$/.test(c.id || ''); });
    haGet(base, token, '/api/states', function (e2, states) {
      (Array.isArray(states) ? states : []).forEach(function (st) {
        if (!/^sensor\.[a-z0-9_]+$/.test(st.entity_id || '')) { return; }
        var b = sensorBins(st);
        if (b) { cals.push({ id: st.entity_id, name: (st.attributes && st.attributes.friendly_name) || st.entity_id, kind: 'sensor', bins: b.map(function (x) { return x.name; }) }); }
      });
      cb(null, cals);
    }, 16 * 1024 * 1024);
  });
}

function now0() { return new Date(); }
function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

// Collections from one or more HA calendars (e.g. one calendar per bin), merged by day.
// cals: [{ id: 'calendar.blue_bin', name: 'Blue bin' }]. With a name, every event in that
// calendar is that bin; without one, the event titles name the bins ("Refuse, Recycling" = two).
// -> cb(null, [{ date: 'YYYY-MM-DD', bins: [...] }], [{ id, error }]): soonest first, plus any
// calendars that couldn't be read (the others still count), plus ones with nothing coming up. A calendar with nothing coming
// up (e.g. just collected today) is fine: it simply adds nothing.
function collections(base, token, cals, cb) {
  cals = (cals || []).filter(function (c) { return c && /^(calendar|sensor)\.[a-z0-9_]+$/.test(c.id || ''); });
  if (!cals.length) { cb(new Error('Choose the bin calendars')); return; }
  var endDay = ymd(new Date(now0().getFullYear(), now0().getMonth(), now0().getDate() + 56));
  var now = now0();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end = new Date(start.getTime() + 56 * 86400000);          // 8 weeks (some bins go monthly in winter)
  var range = '?start=' + encodeURIComponent(start.toISOString()) + '&end=' + encodeURIComponent(end.toISOString());
  var byDay = {}, errors = [], empty = [], far = [], left = cals.length, okCount = 0;
  var today = ymd(now);
  function add(day, n) {
    var list = byDay[day] = byDay[day] || [];
    if (list.indexOf(n) < 0) { list.push(n); }
  }
  cals.forEach(function (c) {
    if (/^sensor\./.test(c.id)) {
      // a sensor with every bin's next date: each bin is named by the sensor
      haGet(base, token, '/api/states/' + c.id, function (err, st) {
        if (err) { errors.push({ id: c.id, error: err.message }); finish(); return; }
        var b = sensorBins(st);
        if (!b) { errors.push({ id: c.id, error: 'This sensor doesn\u2019t hold bin dates (expected e.g. {"Green Bin": "30/10/2026"}).' }); finish(); return; }
        okCount++;
        var got = 0;
        b.forEach(function (x) { if (x.date >= today && x.date <= endDay) { add(x.date, x.name); got++; } });
        if (!got) { empty.push({ id: c.id }); }
        b.forEach(function (x) { if (x.date > endDay) { far.push({ id: c.id, bin: x.name, date: x.date }); } });
        finish();
      });
      return;
    }
    haGet(base, token, '/api/calendars/' + c.id + range, function (err, events) {
      if (err) { errors.push({ id: c.id, error: err.message }); finish(); return; }
      okCount++;
      var got = 0;
      (Array.isArray(events) ? events : []).forEach(function (e) {
        var s = e.start || {};
        var day = s.date || (s.dateTime ? ymd(new Date(s.dateTime)) : null);
        if (!day || !/^\d{4}-\d\d-\d\d$/.test(day) || day < today) { return; }
        got++;
        addEvent(c, day, e.summary);
      });
      if (got) { finish(); return; }
      // Nothing from the date-range query. Some bin integrations only show their next
      // collection on the calendar's own state (start_time / message), so try that.
      haGet(base, token, '/api/states/' + c.id, function (e3, st) {
        var a = (!e3 && st && st.attributes) || {};
        var day = typeof a.start_time === 'string' ? a.start_time.slice(0, 10) : '';
        if (/^\d{4}-\d\d-\d\d$/.test(day) && day >= today) { addEvent(c, day, a.message); }
        else { empty.push({ id: c.id }); }
        finish();
      });
    });
  });
  function addEvent(c, day, summary) {
    if (c.name) { add(day, c.name); return; }
    String(summary || '').split(/\s*(?:,|&|\+|\band\b)\s*/i).forEach(function (n) {
      n = n.replace(/\s+collection$/i, '').trim();
      if (n) { add(day, n); }
    });
  }
  function finish() {
    if (--left) { return; }
    if (!okCount) { cb(new Error(errors.map(function (x) { return x.id + ': ' + x.error; }).join(' \u00b7 '))); return; }
    var order = cals.map(function (x) { return x.name; });
    cb(null, Object.keys(byDay).sort().map(function (d) {
      return { date: d, bins: byDay[d].sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }) };
    }), errors, empty, far);
  }
}

module.exports = { calendars: calendars, collections: collections, sensorBins: sensorBins, toYmd: toYmd };
