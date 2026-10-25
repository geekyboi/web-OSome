/* TV Home: reads an iCalendar (.ics) feed, e.g. an iCloud "Public Calendar" link
   (webcal://pNN-caldav.icloud.com/published/2/...), and works out the next events.

   Handles: all-day and timed events, UTC / floating / TZID times, repeating events
   (RRULE: DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT, UNTIL, BYDAY incl. 1MO /
   -1FR, BYMONTHDAY, BYMONTH), skipped dates (EXDATE), moved or changed single
   occurrences (RECURRENCE-ID) and cancelled events.
   Times in another time zone are converted when the Node build has time-zone data;
   otherwise they're read as local time (fine when the calendar and TV share a zone).
   Plain ES5. */
'use strict';

var http = require('http');
var https = require('https');
var urlmod = require('url');

var MAX_BYTES = 5 * 1024 * 1024;
var DAY = 86400000;

/* ---------------- fetching ---------------- */
function fetchText(u, cb, hops) {
  hops = hops || 0;
  u = String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) { cb(new Error('Use the calendar’s link (webcal:// or https://).')); return; }
  var mod = /^https:/i.test(u) ? https : http;
  var done = false;
  function finish(err, text) { if (!done) { done = true; cb(err, text); } }
  var req = mod.get(u, { headers: { 'User-Agent': 'TVHome/1.0', 'Accept': 'text/calendar, */*' } }, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
      res.resume();
      fetchText(urlmod.resolve(u, res.headers.location), cb, hops + 1);
      done = true;
      return;
    }
    if (res.statusCode !== 200) { res.resume(); finish(new Error('The calendar server answered ' + res.statusCode + (res.statusCode === 404 ? ' (is the calendar still public?)' : ''))); return; }
    var chunks = [], size = 0;
    res.on('data', function (c) {
      size += c.length;
      if (size > MAX_BYTES) { req.abort(); finish(new Error('The calendar is too large.')); return; }
      chunks.push(c);
    });
    res.on('end', function () { finish(null, Buffer.concat(chunks).toString('utf8')); });
  });
  req.setTimeout(20000, function () { req.abort(); finish(new Error('The calendar server didn’t answer.')); });
  req.on('error', function (e) { finish(new Error('Couldn’t reach the calendar (' + (e.code || e.message) + ').')); });
}

/* ---------------- parsing ---------------- */
function unescapeText(v) {
  return String(v).replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

// [{ name, params: {}, value }] for each content line, after unfolding
function lines(text) {
  var raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  var out = [];
  raw.forEach(function (l) {
    if (!l) { return; }
    var colon = -1, inQ = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l.charAt(i);
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ':' && !inQ) { colon = i; break; }
    }
    if (colon < 0) { return; }
    var head = l.slice(0, colon).split(';'), params = {};
    head.slice(1).forEach(function (p) {
      var eq = p.indexOf('=');
      if (eq > 0) { params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ''); }
    });
    out.push({ name: head[0].toUpperCase(), params: params, value: l.slice(colon + 1) });
  });
  return out;
}

/* Local wall-clock time in a time zone -> Date. */
var LOCAL_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
function tzOffsetMs(tz, utcMs) {
  // how far ahead of UTC the zone is at that instant (null if unknown)
  try {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var parts = {};
    f.formatToParts(new Date(utcMs)).forEach(function (p) { parts[p.type] = p.value; });
    var asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return asUtc - utcMs;
  } catch (e) { return null; }
}
function zoned(y, mo, d, h, mi, s, tz) {
  if (!tz || tz === LOCAL_TZ || !/\//.test(tz)) { return new Date(y, mo - 1, d, h, mi, s); }
  var guess = Date.UTC(y, mo - 1, d, h, mi, s);
  var off = tzOffsetMs(tz, guess);
  if (off === null) { return new Date(y, mo - 1, d, h, mi, s); }       // no zone data: treat as local
  var t = guess - off;
  var off2 = tzOffsetMs(tz, t);
  if (off2 !== null && off2 !== off) { t = guess - off2; }
  return new Date(t);
}

// DTSTART-like value -> { date: Date, allDay, wall: {y,mo,d,h,mi,s}, tz, utc }
function parseDate(value, params) {
  var v = String(value).trim();
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) { return null; }
  var y = +m[1], mo = +m[2], d = +m[3];
  if (!m[4] || (params && params.VALUE === 'DATE')) {
    return { date: new Date(y, mo - 1, d), allDay: true, wall: { y: y, mo: mo, d: d, h: 0, mi: 0, s: 0 }, tz: null, utc: false };
  }
  var h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (m[7]) {
    var dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    // repeat in local wall-clock time
    return { date: dt, allDay: false, wall: { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes(), s: dt.getSeconds() }, tz: null, utc: true };
  }
  var tz = params && params.TZID ? params.TZID : null;
  return { date: zoned(y, mo, d, h, mi, s, tz), allDay: false, wall: { y: y, mo: mo, d: d, h: h, mi: mi, s: s }, tz: tz, utc: false };
}

function parseDuration(v) {
  var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
  if (!m) { return null; }
  var ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 * 3600 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseICS(text) {
  var events = [], cur = null, depth = 0;
  lines(text).forEach(function (l) {
    if (l.name === 'BEGIN') {
      if (l.value.toUpperCase() === 'VEVENT' && !cur) { cur = { exdates: [] }; depth = 0; }
      else if (cur) { depth++; }
      return;
    }
    if (l.name === 'END') {
      if (cur && depth > 0) { depth--; return; }
      if (cur && l.value.toUpperCase() === 'VEVENT') { events.push(cur); cur = null; }
      return;
    }
    if (!cur || depth > 0) { return; }          // skip VALARM etc.
    switch (l.name) {
      case 'UID': cur.uid = l.value; break;
      case 'SUMMARY': cur.title = unescapeText(l.value); break;
      case 'LOCATION': cur.location = unescapeText(l.value); break;
      case 'STATUS': cur.status = l.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDate(l.value, l.params); break;
      case 'DTEND': cur.end = parseDate(l.value, l.params); break;
      case 'DURATION': cur.duration = parseDuration(l.value); break;
      case 'RRULE': cur.rrule = l.value; break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(l.value, l.params); break;
      case 'EXDATE':
        l.value.split(',').forEach(function (v) { var d = parseDate(v, l.params); if (d) { cur.exdates.push(d); } });
        break;
    }
  });
  return events.filter(function (e) { return e.start; });
}

/* ---------------- repeating events ---------------- */
var DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRule(r) {
  var o = {};
  String(r).split(';').forEach(function (p) { var kv = p.split('='); if (kv.length === 2) { o[kv[0].toUpperCase()] = kv[1]; } });
  return o;
}
function daysInMonth(y, mo) { return new Date(y, mo, 0).getDate(); }   // mo 1-12
// dates in a month matching BYDAY entries like MO, 2TU, -1FR
function monthByDay(y, mo, list) {
  var out = [], n = daysInMonth(y, mo);
  list.forEach(function (spec) {
    var m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(spec);
    if (!m) { return; }
    var wd = DAYS[m[2]], all = [];
    for (var d = 1; d <= n; d++) { if (new Date(y, mo - 1, d).getDay() === wd) { all.push(d); } }
    if (m[1]) {
      var k = +m[1], pick = k > 0 ? all[k - 1] : all[all.length + k];
      if (pick) { out.push(pick); }
    } else { out = out.concat(all); }
  });
  return out.sort(function (a, b) { return a - b; });
}

/* Start times (as wall-clock {y,mo,d}) of a repeating event, from its first one, until
   `until` (ms) or the rule ends. Each start keeps the event's time of day. */
function occurrences(ev, windowEnd) {
  var rule = parseRule(ev.rrule), freq = rule.FREQ, interval = Math.max(1, +(rule.INTERVAL || 1));
  var count = rule.COUNT ? +rule.COUNT : Infinity;
  var until = rule.UNTIL ? parseDate(rule.UNTIL, {}) : null;
  var untilMs = until ? (until.allDay ? until.date.getTime() + DAY - 1 : until.date.getTime()) : Infinity;
  var w = ev.start.wall, out = [], made = 0, guard = 0;
  var byday = rule.BYDAY ? rule.BYDAY.split(',') : null;
  var bymd = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  var bymonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : null;
  var startMs = ev.start.date.getTime();

  function emit(y, mo, d) {
    var dt = ev.start.allDay ? new Date(y, mo - 1, d) : zoned(y, mo, d, w.h, w.mi, w.s, ev.start.tz);
    var t = dt.getTime();
    if (t < startMs) { return true; }                       // before the first one
    if (t > untilMs || made >= count) { return false; }
    made++;
    out.push(dt);
    return t <= windowEnd;
  }

  if (!/^(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(freq || '')) { return [ev.start.date]; }
  var base = new Date(w.y, w.mo - 1, w.d);
  var going = true;
  if (freq === 'DAILY') {
    for (var i = 0; going && guard < 5000; i += interval, guard++) {
      var dd = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      if (bymonth && bymonth.indexOf(dd.getMonth() + 1) < 0) { continue; }
      going = emit(dd.getFullYear(), dd.getMonth() + 1, dd.getDate());
    }
  } else if (freq === 'WEEKLY') {
    var wds = byday ? byday.map(function (s) { return DAYS[s.slice(-2)]; }).filter(function (x) { return x != null; }) : [base.getDay()];
    // weeks start on Monday (WKST=MO, the default)
    var monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
    var order = wds.map(function (x) { return (x + 6) % 7; }).sort(function (a, b) { return a - b; });
    for (var wk = 0; going && guard < 3000; wk += interval, guard++) {
      for (var j = 0; j < order.length && going; j++) {
        var day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + wk * 7 + order[j]);
        going = emit(day.getFullYear(), day.getMonth() + 1, day.getDate());
      }
    }
  } else if (freq === 'MONTHLY') {
    for (var mm = 0; going && guard < 1200; mm += interval, guard++) {
      var first = new Date(base.getFullYear(), base.getMonth() + mm, 1);
      var y = first.getFullYear(), mo = first.getMonth() + 1, n = daysInMonth(y, mo);
      if (bymonth && bymonth.indexOf(mo) < 0) { continue; }
      var ds = byday ? monthByDay(y, mo, byday)
        : (bymd ? bymd.map(function (x) { return x < 0 ? n + 1 + x : x; }) : [w.d]);
      ds = ds.filter(function (x) { return x >= 1 && x <= n; }).sort(function (a, b) { return a - b; });
      for (var k = 0; k < ds.length && going; k++) { going = emit(y, mo, ds[k]); }
    }
  } else if (freq === 'YEARLY') {
    for (var yy = 0; going && guard < 200; yy += interval, guard++) {
      var year = base.getFullYear() + yy;
      var months = bymonth || [w.mo];
      for (var q = 0; q < months.length && going; q++) {
        var mon = months[q], nn = daysInMonth(year, mon);
        var dl = byday ? monthByDay(year, mon, byday) : (bymd ? bymd.map(function (x) { return x < 0 ? nn + 1 + x : x; }) : [w.d]);
        dl = dl.filter(function (x) { return x >= 1 && x <= nn; });
        for (var r = 0; r < dl.length && going; r++) { going = emit(year, mon, dl[r]); }
      }
    }
  }
  return out;
}

/* The next `max` events that haven't finished by `now`, looking `days` ahead. */
function upcoming(text, now, max, days) {
  now = now || Date.now();
  max = max || 3;
  var horizon = now + (days || 60) * DAY;
  var all = parseICS(text), list = [], overrides = {};

  all.forEach(function (e) {
    if (e.recurrenceId) { overrides[e.uid + '|' + e.recurrenceId.date.getTime()] = true; }
  });

  all.forEach(function (e) {
    var dur = 0;
    if (e.end) { dur = e.end.date.getTime() - e.start.date.getTime(); }
    else if (e.duration != null) { dur = e.duration; }
    else if (e.start.allDay) { dur = DAY; }
    if (dur < 0) { dur = 0; }
    function add(startDate) {
      var s = startDate.getTime(), en = s + dur;
      if (e.start.allDay && e.end) {
        // all-day: keep whole days, even across a clock change
        var days = Math.round(dur / DAY);
        en = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + Math.max(1, days)).getTime();
      }
      if (en <= now || s > horizon) { return; }
      if (e.status === 'CANCELLED') { return; }
      var item = { title: e.title || '(No title)', location: e.location || '', start: s, end: en, allDay: !!e.start.allDay };
      if (item.allDay) { item.startDay = ymd(new Date(s)); item.endDay = ymd(new Date(en)); }   // calendar days (end is the day after)
      list.push(item);
    }
    if (e.rrule && !e.recurrenceId) {
      var ex = {};
      e.exdates.forEach(function (d) { ex[d.allDay ? 'D' + d.date.toDateString() : 'T' + d.date.getTime()] = true; });
      occurrences(e, horizon).forEach(function (d) {
        if (ex['T' + d.getTime()] || ex['D' + d.toDateString()]) { return; }
        if (overrides[e.uid + '|' + d.getTime()]) { return; }            // replaced by its own entry
        add(d);
      });
    } else {
      add(e.start.date);
    }
  });

  list.sort(function (a, b) { return a.start - b.start || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0); });
  return list.slice(0, max);
}

function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

module.exports = { fetchText: fetchText, parseICS: parseICS, upcoming: upcoming };
