/* TV Home service: the web editor's HTTP server (pages, sign-in and the /api it uses). */
'use strict';
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var pkg = require('../package.json');
var urlmod = require('url');
var config = require('./config');
var APP_DIR = config.APP_DIR;
var FILES = config.FILES;
var MAX_DOC = config.MAX_DOC;
var MAX_UPLOAD = config.MAX_UPLOAD;
var PORT = config.PORT;
var WEB = config.WEB;
var log = config.log;
var toBuffer = config.toBuffer;
var auth = require('./auth');
var ha = require('./homeassistant');
var layout = require('./layout');
var luna = require('./luna');
var plugins = require('./plugins');

/* ---------------------------------------------------------------
   HTTP
---------------------------------------------------------------- */
var TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon' };

// Send a reply: status code, body (string or Buffer), content type and extra headers.
function send(res, code, body, type, extra) {
  var headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (type) { headers['Content-Type'] = type; }
  if (extra) { Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; }); }
  var buf = body == null ? null : (Buffer.isBuffer(body) ? body : toBuffer(String(body)));
  if (buf) { headers['Content-Length'] = buf.length; }
  res.writeHead(code, headers);
  res.end(buf || undefined);
}
// Send obj as JSON (never cached).
function sendJson(res, code, obj, extra) {
  var h = { 'Cache-Control': 'no-store' };
  if (extra) { Object.keys(extra).forEach(function (k) { h[k] = extra[k]; }); }
  send(res, code, JSON.stringify(obj), TYPES.json, h);
}
// Send a file from disk, with its content type (cacheable: cache for a year, cors: let the TV app read it).
function sendFile(res, file, cacheable, cors) {
  fs.readFile(file, function (err, data) {
    if (err) { send(res, 404, 'Not found', 'text/plain'); return; }
    var ext = path.extname(file).slice(1).toLowerCase();
    var h = { 'Cache-Control': cacheable ? 'max-age=31536000, immutable' : 'no-cache' };
    if (cors) { h['Access-Control-Allow-Origin'] = '*'; }   // pictures: lets the TV app measure their brightness
    send(res, 200, data, TYPES[ext] || 'application/octet-stream', h);
  });
}
// Read a request's body, up to limit bytes. cb(err, buffer).
function readBody(req, limit, cb) {
  var chunks = [], size = 0, failed = false;
  req.on('data', function (c) {
    if (failed) { return; }
    size += c.length;
    if (size > limit) { failed = true; cb(new Error('too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', function () { if (!failed) { cb(null, Buffer.concat(chunks)); } });
  req.on('error', function (e) { if (!failed) { failed = true; cb(e); } });
}
// The request's cookies as { name: value }.
function cookies(req) {
  var out = {};
  String(req.headers.cookie || '').split(';').forEach(function (p) {
    var i = p.indexOf('=');
    if (i > 0) { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  });
  return out;
}
// The IP address the request came from.
function clientIP(req) { return String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''); }
// Did the request come from the TV itself?
function isLocal(req) { var ip = clientIP(req); return ip === '127.0.0.1' || ip === '::1'; }
// Is the request signed in (session cookie, or the password as a Bearer token)?
function authed(req) {
  var header = String(req.headers.authorization || '');
  if (/^Bearer /i.test(header) && auth.checkPassword(header.slice(7))) { return true; }
  return auth.same(cookies(req).tvh, auth.sessionToken());
}
// The Set-Cookie header that signs a browser in.
function sessionCookie() { return 'tvh=' + auth.sessionToken() + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'; }
// Paths inside a base folder only.
function safeJoin(base, rel) {
  var p = path.resolve(base, '.' + path.sep + rel);
  return (p === base || p.indexOf(base + path.sep) === 0) ? p : null;
}
// What kind of picture this is from its first bytes: 'png', 'jpg', 'webp', 'gif' or null.
function imageType(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) { return 'png'; }
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) { return 'jpg'; }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') { return 'webp'; }
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') { return 'gif'; }
  return null;
}

// Where an uploaded picture is used in the saved layout (so it isn't deleted from under it).
function usedBy(filePath) {
  var out = [];
  if (!layout.doc) { return out; }
  if (layout.doc.settings && layout.doc.settings.background === filePath) { out.push('the background'); }
  (layout.doc.categories || []).forEach(function (c) {
    (c.tiles || []).forEach(function (t) { if (t.icon === filePath) { out.push('"' + t.name + '"'); } });
  });
  return out;
}

var appsCache = { at: 0, data: null };
// The TV's apps and inputs, for the editor's "Add an app". Cached for a minute.
function getApps(cb) {
  if (appsCache.data && Date.now() - appsCache.at < 60000) { cb(appsCache.data); return; }
  luna.lunaCall('luna://com.webos.applicationManager/listLaunchPoints', {}, function (r) {
    var points = (r.launchPoints || []).filter(function (p) { return p && p.id && p.id !== 'net.local.tvhome'; });
    luna.lunaCall('luna://com.webos.service.eim/getAllInputStatus', {}, function (e) {
      var inputs = (e.devices || []).filter(function (d) { return d.appId && d.label; })
        .sort(function (a, b) { return (a.port || 0) - (b.port || 0); })
        .map(function (d) { return { name: d.label, app: d.appId }; });
      var data = {
        apps: points.map(function (p) { return { id: p.id, title: p.title || p.id, icon: !!(p.largeIcon || p.icon), _icon: p.largeIcon || p.icon }; })
          .sort(function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; }),
        inputs: [{ name: 'Live TV', app: 'com.webos.app.livetv' }].concat(inputs.length ? inputs :
          [1, 2, 3].map(function (n) { return { name: 'HDMI ' + n, app: 'com.webos.app.hdmi' + n }; })),
        error: r.returnValue === false ? (r.errorText || 'could not list apps') : null
      };
      appsCache = { at: Date.now(), data: data };
      cb(data);
    });
  });
}

// Send the sign-in page, with an optional message.
function loginPage(res, message) {
  fs.readFile(path.join(WEB, 'login.html'), 'utf8', function (err, html) {
    if (err) { send(res, 500, 'Missing login page', 'text/plain'); return; }
    send(res, 200, html.replace('<!--MSG-->', message ? '<p class="err">' + message + '</p>' : ''), TYPES.html, { 'Cache-Control': 'no-store' });
  });
}

// Every HTTP request comes here: sign-in, the editor's files, pictures, plugins and /api/...
function handle(req, res) {
  var u = urlmod.parse(req.url, true), p = u.pathname || '/', ip = clientIP(req);

  // log in with the link from the QR code (/?key=...) or the form
  if ((p === '/' || p === '/login') && u.query.key != null && req.method === 'GET') {
    if (auth.tooManyFailures(ip)) { loginPage(res, 'Too many tries. Wait a few minutes.'); return; }
    if (auth.checkPassword(u.query.key)) { send(res, 302, null, null, { 'Set-Cookie': sessionCookie(), Location: '/' }); return; }
    auth.noteFailure(ip); loginPage(res, 'That password didn’t work. Check the one shown on the TV.'); return;
  }
  if (p === '/login' && req.method === 'POST') {
    readBody(req, 4096, function (err, body) {
      var key = err ? '' : (urlmod.parse('/?' + body.toString('utf8'), true).query.key || '');
      if (auth.tooManyFailures(ip)) { loginPage(res, 'Too many tries. Wait a few minutes.'); return; }
      if (auth.checkPassword(key)) { send(res, 302, null, null, { 'Set-Cookie': sessionCookie(), Location: '/' }); return; }
      auth.noteFailure(ip); loginPage(res, 'That password didn’t work. Check the one shown on the TV.');
    });
    return;
  }
  if (p === '/logout') { send(res, 302, null, null, { 'Set-Cookie': 'tvh=; Path=/; Max-Age=0', Location: '/' }); return; }

  // the editor's own files (no secrets in them)
  if (req.method === 'GET' && /^\/(editor\.css|editor\/[a-z-]+\.js|qr\.js|bgdraw\.js|favicon\.ico)$/.test(p)) {
    if (p === '/qr.js' || p === '/bgdraw.js') { sendFile(res, path.join(APP_DIR, 'js', p.slice(1))); return; }
    sendFile(res, path.join(WEB, p.slice(1))); return;
  }
  if (p === '/' && req.method === 'GET') {
    if (!authed(req)) { loginPage(res, ''); return; }
    sendFile(res, path.join(WEB, 'index.html')); return;
  }

  // pictures: uploaded files and the app's own assets (the TV app itself loads these from 127.0.0.1)
  if (req.method === 'GET' && p.indexOf('/files/') === 0) {
    if (!authed(req) && !isLocal(req)) { send(res, 401, 'Log in first', 'text/plain'); return; }
    var f = /^\/files\/([A-Za-z0-9._-]+)$/.exec(p);
    if (!f) { send(res, 404, 'Not found', 'text/plain'); return; }
    sendFile(res, path.join(FILES, f[1]), true, true); return;
  }
  if (req.method === 'GET' && p.indexOf('/app/assets/') === 0) {
    if (!authed(req) && !isLocal(req)) { send(res, 401, 'Log in first', 'text/plain'); return; }
    var a = safeJoin(path.join(APP_DIR, 'assets'), decodeURIComponent(p.slice('/app/assets/'.length)));
    if (!a) { send(res, 404, 'Not found', 'text/plain'); return; }
    sendFile(res, a, false, true); return;
  }

  // plugins: their editor files (no secrets in them), and what they serve to the TV app (e.g. album art)
  var pf = /^\/plugins\/([a-z0-9][a-z0-9_-]{0,40})\/([A-Za-z0-9._\/-]+)$/.exec(p);
  if (pf && req.method === 'GET') {
    var pm = null;
    plugins.pluginList.forEach(function (m) { if (m.id === pf[1]) { pm = m; } });
    var okFile = pm && pm.editor && (pf[2] === pm.editor.script || pf[2] === pm.editor.style || /^assets\/[A-Za-z0-9._-]+\.(png|jpg|svg|webp|gif)$/.test(pf[2]));
    if (!okFile || pf[2].indexOf('..') >= 0) { send(res, 404, 'Not found', 'text/plain'); return; }
    sendFile(res, path.join(plugins.PLUGIN_DIR, pf[1], pf[2])); return;
  }
  if (p.indexOf('/p/') === 0) {
    if (!authed(req) && !isLocal(req)) { send(res, 401, 'Log in first', 'text/plain'); return; }
    if (!plugins.pluginRoute(req, res, u, true)) { send(res, 404, 'Not found', 'text/plain'); }
    return;
  }

  if (p.indexOf('/api/') !== 0) { send(res, 404, 'Not found', 'text/plain'); return; }
  if (!authed(req)) { sendJson(res, 401, { error: 'Log in first.' }); return; }

  if (p === '/api/state' && req.method === 'GET') { sendJson(res, 200, { doc: layout.doc, plugins: plugins.pluginsRev(), info: { ip: auth.localIP(), port: PORT, version: pkg.version } }); return; }
  if (p === '/api/plugins' && req.method === 'GET') { plugins.refreshPlugins(); sendJson(res, 200, { plugins: plugins.publicList(), rev: plugins.pluginsRev() }); return; }
  if (p.indexOf('/api/p/') === 0) {
    if (!plugins.pluginRoute(req, res, u, false)) { sendJson(res, 404, { error: 'Not found.' }); }
    return;
  }
  if (p === '/api/state' && req.method === 'PUT') {
    readBody(req, MAX_DOC, function (err, body) {
      if (err) { sendJson(res, 413, { error: 'Too large.' }); return; }
      var input;
      try { input = JSON.parse(body.toString('utf8')); } catch (e) { sendJson(res, 400, { error: 'Not valid JSON.' }); return; }
      var current = layout.doc ? layout.doc.rev : 0;
      if (input.baseRev !== current) { sendJson(res, 409, { error: 'Changed on the TV since you loaded it.', doc: layout.doc }); return; }
      try { var saved = layout.saveDoc(layout.cleanDoc(input.doc), 'web ' + ip); sendJson(res, 200, { doc: saved }); }
      catch (e) { sendJson(res, 400, { error: e.message }); }
    });
    return;
  }
  if (p === '/api/apps' && req.method === 'GET') {
    getApps(function (d) {
      sendJson(res, 200, { apps: d.apps.map(function (x) { return { id: x.id, title: x.title, icon: x.icon }; }), inputs: d.inputs, error: d.error });
    });
    return;
  }
  var ti = /^\/api\/tvicon\/([A-Za-z0-9._-]+)$/.exec(p);
  if (ti && req.method === 'GET') {
    getApps(function (d) {
      var hit = null;
      d.apps.forEach(function (x) { if (x.id === ti[1]) { hit = x; } });
      if (!hit || !hit._icon || !/^\/[A-Za-z0-9._\/+@-]+$/.test(hit._icon)) { send(res, 404, 'No icon', 'text/plain'); return; }
      sendFile(res, hit._icon, false);
    });
    return;
  }
  if (p === '/api/upload' && req.method === 'POST') {
    var kind = /^(icon|background)$/.test(u.query.kind) ? u.query.kind : 'icon';
    readBody(req, MAX_UPLOAD, function (err, body) {
      if (err) { sendJson(res, 413, { error: 'Pictures can be up to 8 MB.' }); return; }
      var t = imageType(body);
      if (!t) { sendJson(res, 415, { error: 'Use a PNG, JPEG, WebP or GIF picture.' }); return; }
      var name = kind + '-' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '.' + t;
      try { fs.writeFileSync(path.join(FILES, name), body); } catch (e) { sendJson(res, 500, { error: 'Couldn’t save: ' + e.message }); return; }
      log('upload', name, body.length);
      sendJson(res, 200, { path: 'files/' + name });
    });
    return;
  }
  if (p === '/api/files' && req.method === 'GET') {
    var list = [];
    try {
      fs.readdirSync(FILES).forEach(function (n) {
        if (!/^(icon|background)-[a-f0-9]+\.(png|jpg|webp|gif)$/.test(n)) { return; }
        list.push({ path: 'files/' + n, kind: n.split('-')[0], size: fs.statSync(path.join(FILES, n)).size });
      });
    } catch (e) { /* none */ }
    sendJson(res, 200, { files: list });
    return;
  }
  var del = /^\/api\/files\/((icon|background)-[a-f0-9]+\.(png|jpg|webp|gif))$/.exec(p);
  if (del && req.method === 'DELETE') {
    var where = usedBy('files/' + del[1]);
    if (where.length) { sendJson(res, 409, { error: 'Still in use: ' + where.join(', ') + '. Change that and save first.' }); return; }
    fs.unlink(path.join(FILES, del[1]), function (err) {
      if (err && err.code !== 'ENOENT') { sendJson(res, 500, { error: 'Couldn\u2019t delete: ' + err.code }); return; }
      log('deleted', del[1]);
      sendJson(res, 200, { ok: true });
    });
    return;
  }
  if (p === '/api/ha/status' && req.method === 'GET') { sendJson(res, 200, { hasToken: !!ha.haToken(), url: ha.haBase() }); return; }
  if (p === '/api/ha/token' && req.method === 'POST') {
    readBody(req, 4096, function (err, body) {
      var t = '';
      try { t = JSON.parse(body.toString('utf8')).token || ''; } catch (e) { /* ignore */ }
      if (t && !/^[A-Za-z0-9._\-]{20,2000}$/.test(String(t).trim())) { sendJson(res, 400, { error: 'That doesn\u2019t look like a Home Assistant token.' }); return; }
      ha.setHaToken(t);
      plugins.eachPluginHook('settingsChanged');
      sendJson(res, 200, { ok: true, hasToken: !!ha.haToken() });
    });
    return;
  }
  if (p === '/api/launch' && req.method === 'POST') {
    readBody(req, 4096, function (err, body) {
      var id = '';
      try { id = JSON.parse(body.toString('utf8')).app; } catch (e) { /* ignore */ }
      if (!/^[A-Za-z0-9._-]+$/.test(id || '')) { sendJson(res, 400, { error: 'Which app?' }); return; }
      luna.lunaCall('luna://com.webos.applicationManager/launch', { id: id }, function (r) {
        sendJson(res, r.returnValue === false ? 502 : 200, r.returnValue === false ? { error: r.errorText || 'Couldn’t open it' } : { ok: true });
      });
    });
    return;
  }
  if (p === '/api/password' && req.method === 'POST') {
    luna.changePassword();
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie() });   // this browser stays signed in
    return;
  }
  sendJson(res, 404, { error: 'Not found.' });
}

// used by the other files
exports.handle = handle;
exports.readBody = readBody;
exports.send = send;
exports.sendJson = sendJson;
