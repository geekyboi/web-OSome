/* The TV's own app icons, borrowed via the Homebrew Channel (rooted TVs only). */
'use strict';

/* ---------------------------------------------------------------
   The TV's own app icons (rooted TVs with the Homebrew Channel).
   A web app can't read other apps' files, but the Homebrew Channel's service runs
   shell commands as root for apps that ask. We use it for two fixed jobs: list the
   launcher's apps, and read each icon file as base64. Icon paths come from the TV's
   own list; any path that isn't a plain absolute path is skipped, the rest are
   shell-quoted, and app IDs never reach the shell. Icons are kept in local storage
   (by app ID) so they show instantly, and refreshed in the background once a day.
   Same approach as webos-launcher / Hearth.
---------------------------------------------------------------- */
var HB_EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
var LIST_CMD = "luna-send -n 1 luna://com.webos.applicationManager/listLaunchPoints '{}'";
var SAFE_PATH = /^\/[A-Za-z0-9._\/+@-]+$/;
var ICON_STORE = 'tvhome.icons.v1';
var ICON_BATCH = 8;           // icons per root command, to keep each reply small

var tvIcons = (function () {
  try { var o = JSON.parse(window.localStorage.getItem(ICON_STORE) || 'null'); if (o && o.apps) { return o; } } catch (e) { /* ignore */ }
  return { at: 0, apps: {} };   // apps: { appId: { p: iconPath, src: dataURI, c: '#rrggbb' } }
})();
// Keep the icons in local storage.
function saveIcons() {
  try { window.localStorage.setItem(ICON_STORE, JSON.stringify(tvIcons)); }
  catch (e) { /* storage full: icons are fetched again next time */ }
}

// Run a shell command as root through the Homebrew Channel. cb(err, stdout).
function hbExec(command, cb, timeoutMs) {
  luna(HB_EXEC, { command: command }, function (r) {
    if (r && r.returnValue !== false && !r.noReply && !r.preview && typeof r.stdoutString === 'string') { cb(null, r.stdoutString); }
    else { cb((r && r.errorText) || 'no answer'); }
  }, timeoutMs || 8000);
}
// Quote a value for the shell.
function shellQuote(v) { return "'" + String(v).replace(/'/g, "'\\''") + "'"; }

// The colour of an icon, for the glow when it's selected.
function iconColour(src, cb) {
  var img = new Image();
  img.onload = function () {
    try {
      var cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
      var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, 24, 24);
      var d = ctx.getImageData(0, 0, 24, 24).data, r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) { continue; }
        var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        var k = 0.15 + (mx ? (mx - mn) / mx : 0) * (mx / 255);   // favour vivid pixels over black/white
        r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k;
      }
      if (!w) { cb(null); return; }
      r = Math.round(r / w); g = Math.round(g / w); b = Math.round(b / w);
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < 28) { cb(null); return; }  // too dark to glow
      cb('#' + [r, g, b].map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''));
    } catch (e) { cb(null); }
  };
  img.onerror = function () { cb(null); };
  img.src = src;
}

/* Fetch icons for these launch points (from listLaunchPoints) that we don't have yet.
   cb(changed) once done. */
function fetchIcons(points, cb) {
  var todo = [];
  (points || []).forEach(function (pt) {
    var path = pt && (pt.largeIcon || pt.icon);
    if (!pt || !pt.id || !path || !SAFE_PATH.test(path)) { return; }
    var have = tvIcons.apps[pt.id];
    if (have && have.p === path && have.src) { return; }
    todo.push({ id: pt.id, path: path });
  });
  var changed = false;
  tvIcons.at = Date.now();
  function batch(start) {
    if (start >= todo.length) { saveIcons(); cb(changed); return; }
    var part = todo.slice(start, start + ICON_BATCH);
    // one line per icon: "<index> <base64>" (busybox base64 has no -w, so strip newlines)
    var script = part.map(function (m, i) {
      return "printf '%d ' " + i + '; base64 ' + shellQuote(m.path) + " 2>/dev/null | tr -d '\\n'; echo";
    }).join('; ');
    hbExec(script, function (err, out) {
      if (err) { saveIcons(); cb(changed); return; }
      var pending = 0, lines = out.split('\n');
      lines.forEach(function (line) {
        var m = /^(\d+) ([A-Za-z0-9+\/=]+)$/.exec(line);
        var entry = m && part[Number(m[1])];
        if (!entry) { return; }
        var src = 'data:image/png;base64,' + m[2];
        var rec = { p: entry.path, src: src, c: null };
        tvIcons.apps[entry.id] = rec;
        changed = true;
        pending++;
        iconColour(src, function (c) { rec.c = c; if (--pending === 0) { batch(start + ICON_BATCH); } });
      });
      if (!pending) { batch(start + ICON_BATCH); }
    }, 15000);
  }
  batch(0);
}

// Ask the TV for its launcher list via the Homebrew Channel. cb(err, launchPoints)
function hbLaunchPoints(cb) {
  hbExec(LIST_CMD, function (err, out) {
    if (err) { cb(err); return; }
    var list = null;
    try { list = JSON.parse(out).launchPoints; } catch (e) { list = null; }
    if (list && list.length) { cb(null, list); } else { cb('no launch points'); }
  });
}

// Background refresh at start (at most once a day), then redraw icons in place.
function syncIcons(force) {
  if (CFG.useTvIcons === false || typeof window.PalmServiceBridge === 'undefined') { return; }
  if (!force && Date.now() - (tvIcons.at || 0) < 24 * 3600 * 1000) { return; }
  hbLaunchPoints(function (err, list) {
    if (err) { return; }
    fetchIcons(list, function (changed) { if (changed) { refreshArt(); } });
  });
}

/* The TV icon for a tile, found from the app it opens: its app: or, for a list of
   steps (e.g. a webhook and then an app), the last app in the list. Not for HDMI
   inputs or Live TV, and not for tiles with their own image. */
function tvIconFor(t) {
  if (!t || CFG.useTvIcons === false || t.icon || t.noTvIcon) { return null; }
  var id = t.app;
  if (!id && t.actions) {
    for (var i = t.actions.length - 1; i >= 0 && !id; i--) { if (t.actions[i] && t.actions[i].app) { id = t.actions[i].app; } }
  }
  if (!id || /^com\.webos\.app\.(hdmi\d|livetv)$/.test(id)) { return null; }
  var rec = tvIcons.apps[id];
  return rec && rec.src ? rec : null;
}
