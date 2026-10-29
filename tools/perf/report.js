#!/usr/bin/env node
/* TV Home: sum up the perf logger's files (tools/perf/tvperf.sh) into best, worst and typical
   cases: RAM and CPU for each situation (TV Home in front, LG's home, each app, TV off),
   start-up times, the biggest processes and any benchmark runs.

   Usage: node tools/perf/report.js <folder with the CSV files>   (pull.sh does this for you)
   Plain ES5 and Node's built-in modules only, like the rest of the repo. */
'use strict';

var fs = require('fs');
var path = require('path');

var dir = process.argv[2];
if (!dir) { console.log('Usage: node report.js <folder with samples.csv, events.csv, top.csv, bench.csv>'); process.exit(1); }

var OFF = /^(Active Standby|Suspend|Power Off|Off|Standby)$/;
var APP = 'net.local.tvhome';
var LG = 'com.webos.app.home';

// Read a CSV file and its rotated copy (name.1.csv, older) as a list of objects.
function readCsv(name) {
  var rows = [];
  [name + '.1.csv', name + '.csv'].forEach(function (f) {
    var text;
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return; }
    var lines = text.split('\n'), head = null;
    lines.forEach(function (l) {
      if (!l) { return; }
      var cells = l.split(',');
      if (cells[0] === 'time') { head = cells; return; }
      if (!head) { return; }
      var row = {};
      head.forEach(function (h, i) { row[h] = cells[i] === undefined ? '' : cells[i]; });
      rows.push(row);
    });
  });
  return rows;
}
// A number from a cell, or null if it's empty.
function num(v) { return v === '' || v === undefined ? null : parseFloat(v); }
// min, avg, median, p95 and max of a list of numbers (nulls skipped).
function stats(list) {
  var a = list.filter(function (v) { return v !== null && !isNaN(v); }).sort(function (x, y) { return x - y; });
  if (!a.length) { return null; }
  var sum = a.reduce(function (s, v) { return s + v; }, 0);
  // The value p of the way through the sorted list.
  function at(p) { return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }
  return { n: a.length, min: a[0], avg: sum / a.length, med: at(0.5), p95: at(0.95), max: a[a.length - 1] };
}
// A number rounded for the table.
function fmt(v, dp) { return v === null || v === undefined ? '-' : v.toFixed(dp || 0); }
// Pad text to a width (left-aligned) or right-align it with right = true.
function pad(s, w, right) { s = String(s); while (s.length < w) { s = right ? ' ' + s : s + ' '; } return s; }
// Print a table: rows of cells, the first row is the heading.
function table(rows) {
  var widths = rows[0].map(function (_, i) { return Math.max.apply(null, rows.map(function (r) { return String(r[i]).length; })); });
  rows.forEach(function (r, ri) {
    console.log('  ' + r.map(function (c, i) { return pad(c, widths[i], i > 0); }).join('  '));
    if (ri === 0) { console.log('  ' + widths.map(function (w) { return new Array(w + 1).join('-'); }).join('  ')); }
  });
}
// kB to MB.
function mb(kb) { return kb === null ? null : kb / 1024; }
// Print a heading.
function heading(t) { console.log('\n' + t + '\n' + new Array(t.length + 1).join('=')); }

// What was going on in a sample: TV off, TV Home, LG's home, live TV / inputs, or an app.
function scenario(s) {
  if (OFF.test(s.power)) { return 'TV off / standby'; }
  if (s.power === 'Screen Saver') { return 'Screen saver'; }
  if (s.power === 'Screen Off') { return 'Screen off (sound only)'; }
  if (s.front === APP) { return 'TV Home in front'; }
  if (s.front === LG) { return "LG's home in front"; }
  if (/^com\.webos\.app\.(livetv|hdmi)/.test(s.front)) { return 'Live TV / HDMI'; }
  return s.front ? 'App: ' + s.front : 'Unknown';
}

var samples = readCsv('samples'), events = readCsv('events'), top = readCsv('top'), bench = readCsv('bench');
if (!samples.length && !events.length && !bench.length) { console.log('No data in ' + dir); process.exit(1); }

/* ---------------------------------------------------------------
   Coverage
---------------------------------------------------------------- */
heading('What was measured');
var boots = events.filter(function (e) { return e.kind === 'start'; }).length;
if (samples.length) {
  console.log('  ' + samples.length + ' samples from ' + samples[0].time + ' to ' + samples[samples.length - 1].time +
    ' (logger started ' + boots + ' time' + (boots === 1 ? '' : 's') + ')');
  console.log('  TV RAM: ' + fmt(mb(num(samples[samples.length - 1].mem_total_kb))) + ' MB. CPU % is of the whole TV (all cores), RAM used = total - available.');
}

/* ---------------------------------------------------------------
   RAM and CPU by situation
---------------------------------------------------------------- */
if (samples.length) {
  // each sample counts for the time until the next one (so the 2 s bursts after a launch don't skew averages)
  var groups = {}, order = [];
  samples.forEach(function (s, i) {
    var k = scenario(s), next = samples[i + 1];
    var w = next && num(next.uptime) > num(s.uptime) ? Math.min(num(next.uptime) - num(s.uptime), 600) : 30;
    if (!groups[k]) { groups[k] = { rows: [], time: 0 }; order.push(k); }
    groups[k].rows.push(s); groups[k].time += w; s.w = w;
  });
  order.sort(function (a, b) { return groups[b].time - groups[a].time; });
  // Time-weighted average of a column in rows.
  var wavg = function (rows, f) {
    var t = 0, sum = 0;
    rows.forEach(function (r) { var v = f(r); if (v !== null && !isNaN(v)) { t += r.w; sum += v * r.w; } });
    return t ? sum / t : null;
  };
  var used = function (r) { return mb(num(r.mem_total_kb) - num(r.mem_avail_kb)); };
  var cpu = function (r) { return num(r.cpu_busy_pct); };

  heading('RAM and CPU by situation (best / typical / worst)');
  var rows = [['situation', 'time (h)', 'RAM used MB min', 'avg', 'p95', 'max', 'CPU % avg', 'p95', 'max', 'load max', 'apps open max']];
  order.forEach(function (k) {
    var g = groups[k], ru = stats(g.rows.map(used)), c = stats(g.rows.map(cpu)), l = stats(g.rows.map(function (r) { return num(r.load1); }));
    var ap = stats(g.rows.map(function (r) { return num(r.apps_running); }));
    rows.push([k, fmt(g.time / 3600, 1), fmt(ru && ru.min), fmt(wavg(g.rows, used)), fmt(ru && ru.p95), fmt(ru && ru.max),
      fmt(wavg(g.rows, cpu), 1), fmt(c && c.p95, 1), fmt(c && c.max, 1), fmt(l && l.max, 2), fmt(ap && ap.max)]);
  });
  table(rows);

  heading("TV Home's own share, and LG's home");
  rows = [['situation', 'TV Home app MB avg', 'max', 'CPU % avg', 'max', 'service MB avg', 'max', 'CPU % avg', 'max', 'LG home MB avg', 'max', 'CPU % avg']];
  order.forEach(function (k) {
    var g = groups[k];
    // avg and max of a column, as two table cells.
    var am = function (col, toMb) {
      var f = function (r) { var v = num(r[col]); return toMb ? mb(v) : v; };
      var s = stats(g.rows.map(f));
      return [fmt(wavg(g.rows, f), toMb ? 0 : 1), fmt(s && s.max, toMb ? 0 : 1)];
    };
    rows.push([k].concat(am('tvhome_rss_kb', true), am('tvhome_cpu_pct'), am('svc_rss_kb', true), am('svc_cpu_pct'),
      am('lghome_rss_kb', true), [am('lghome_cpu_pct')[0]]));
  });
  table(rows);
  console.log('  ("-" = not running. The app figures are its web page process; WebAppMgr itself is shared by all web apps.)');

  heading('Worst moments');
  // The n samples with the highest f, as table rows.
  var worst = function (title, f, unit) {
    var list = samples.filter(function (s) { return f(s) !== null && !isNaN(f(s)); }).sort(function (a, b) { return f(b) - f(a); }).slice(0, 5);
    console.log('  ' + title + ':');
    list.forEach(function (s) { console.log('    ' + pad(fmt(f(s), 1) + unit, 10, true) + '  ' + s.time + '  ' + scenario(s) + '  (' + s.apps_running + ' apps open)'); });
  };
  worst('Most RAM used', used, ' MB');
  worst('Busiest CPU', cpu, ' %');
}

/* ---------------------------------------------------------------
   Start-up times, from the app life-cycle events
---------------------------------------------------------------- */
if (events.length) {
  heading('Start-up times (seen while you used the TV)');
  var launches = {}, pending = {}, lastOff = null, waitHome = null, powerOn = [], ready = {}, lastUp = -1;
  events.forEach(function (e) {
    var up = num(e.uptime);
    if (up < lastUp || e.kind === 'start') { pending = {}; waitHome = null; }   // a restart: times don't carry over
    lastUp = up;
    if (e.kind === 'power') {
      if (OFF.test(e.detail)) { lastOff = up; } else if (e.detail === 'Active' && lastOff !== null) { waitHome = up; lastOff = null; }
    } else if (e.kind === 'life') {
      // launching = it wasn't running (cold), relaunching = it was, in the background (warm)
      if (e.detail === 'launching' || e.detail === 'launch') { pending[e.app] = { up: up, kind: 'cold' }; }
      if (e.detail === 'relaunching') { pending[e.app] = { up: up, kind: 'warm' }; }
      if (e.detail === 'foreground') {
        var pd = pending[e.app], lk = e.app + ' (' + (pd && pd.kind) + ')';
        if (pd && up - pd.up < 60) { (launches[lk] = launches[lk] || []).push((up - pd.up) * 1000); }
        delete pending[e.app];
        if (e.app === APP && waitHome !== null && up - waitHome < 120) { powerOn.push((up - waitHome) * 1000); }
        waitHome = null;
      }
    } else if (e.kind === 'mark') {
      var m = /^(\S+) (\d+)/.exec(e.detail);
      if (m) { (ready[m[1]] = ready[m[1]] || []).push(parseInt(m[2], 10)); }
    }
  });
  var rows2 = [['what', 'times', 'min ms', 'median', 'avg', 'p95', 'max']];
  // Add a row of timing stats.
  var timing = function (label, list) {
    var s = stats(list);
    if (s) { rows2.push([label, s.n, fmt(s.min), fmt(s.med), fmt(s.avg), fmt(s.p95), fmt(s.max)]); }
  };
  timing('Switch on -> TV Home in front', powerOn);
  // TV Home's own marks, in ms from its page starting to load: each part, then the whole screen
  ['bg', 'layout', 'tiles', 'icons', 'ready', 'ready-hidden'].concat(Object.keys(ready)).forEach(function (k, i, all) {
    if (all.indexOf(k) !== i || !ready[k]) { return; }
    timing('TV Home page load -> ' + ({ bg: 'background drawn', layout: 'layout loaded', tiles: 'tiles placed', icons: 'icons loaded', ready: 'ready', 'ready-hidden': 'ready (preloaded)' }[k] || k), ready[k]);
  });
  Object.keys(launches).sort(function (a, b) { return launches[b].length - launches[a].length; }).forEach(function (a) {
    timing('Open ' + a, launches[a]);
  });
  if (rows2.length > 1) { table(rows2); } else { console.log('  None yet.'); }
}

/* ---------------------------------------------------------------
   The biggest processes (top.csv)
---------------------------------------------------------------- */
if (top.length) {
  heading('Biggest processes (5-minute snapshots)');
  var procs = {}, prevTicks = {};
  top.forEach(function (t) {
    var name = t.name, up = num(t.uptime), key = t.pid + ' ' + name, p = prevTicks[key];
    var pr = procs[name] = procs[name] || { rss: [], cpu: [] };
    pr.rss.push(mb(num(t.rss_kb)));
    if (p && up > p.up) { pr.cpu.push((num(t.cpu_ticks) - p.ticks) / (up - p.up)); }   // ticks are 1/100 s: = % of one core
    prevTicks[key] = { up: up, ticks: num(t.cpu_ticks) };
  });
  var snaps = {};
  top.forEach(function (t) { snaps[t.uptime + t.time] = 1; });
  var nsnaps = Object.keys(snaps).length;
  var list = Object.keys(procs).map(function (n) { var s = stats(procs[n].rss); return { name: n, s: s, c: stats(procs[n].cpu) }; })
    .sort(function (a, b) { return b.s.avg * b.s.n - a.s.avg * a.s.n; }).slice(0, 20);
  var rows3 = [['process', 'seen in % of snapshots', 'MB avg', 'max', 'CPU % of a core avg', 'max']];
  list.forEach(function (p) {
    rows3.push([p.name, fmt(100 * Math.min(1, p.s.n / nsnaps)), fmt(p.s.avg), fmt(p.s.max), fmt(p.c && p.c.avg, 1), fmt(p.c && p.c.max, 1)]);
  });
  table(rows3);
}

/* ---------------------------------------------------------------
   Benchmark runs (tvperf-bench.sh)
---------------------------------------------------------------- */
if (bench.length) {
  heading('Benchmark: opening apps (tvperf-bench.sh)');
  var b = {}, korder = [];
  bench.forEach(function (r) {
    var k = r.app + ' ' + r.mode;
    if (!b[k]) { b[k] = []; korder.push(k); }
    b[k].push(r);
  });
  var rows4 = [['app', 'mode', 'runs', 'front ms min', 'avg', 'max', 'ready ms avg', 'settled ms min', 'avg', 'max', 'peak CPU % max', 'RAM taken MB avg']];
  korder.forEach(function (k) {
    var rs = b[k], col = function (c) { return stats(rs.map(function (r) { return num(r[c]); })); };
    var f = col('front_ms'), rd = col('ready_ms'), st = col('settle_ms'), pk = col('peak_cpu_pct');
    var ram = stats(rs.map(function (r) { return mb(num(r.avail_before_kb) - num(r.avail_after_kb)); }));
    rows4.push([rs[0].app, rs[0].mode, rs.length, fmt(f && f.min), fmt(f && f.avg), fmt(f && f.max), fmt(rd && rd.avg),
      fmt(st && st.min), fmt(st && st.avg), fmt(st && st.max), fmt(pk && pk.max), fmt(ram && ram.avg)]);
  });
  table(rows4);
}
console.log('');
