/* TV Home service: the Luna methods the TV app calls (luna://net.local.tvhome.service/...). */
'use strict';
var fs = require('fs');
var path = require('path');
var pkg = require('../package.json');
var config = require('./config');
var IS_ROOT = config.IS_ROOT;
var PORT = config.PORT;
var log = config.log;
var auth = require('./auth');
var layout = require('./layout');
var plugins = require('./plugins');
var power = require('./power');

/* ---------------------------------------------------------------
   Luna (the TV app talks to the service this way)
---------------------------------------------------------------- */
var service = null, layoutSubs = {}, infoSubs = {}, activitySubs = {};
// Send payload to every subscriber in subs.
function notify(subs, payload) {
  Object.keys(subs).forEach(function (k) { try { subs[k].respond(payload); } catch (e) { delete subs[k]; } });
}
// What getInfo returns: root?, IP, port, the password and the QR code link.
function infoPayload() {
  return { returnValue: true, root: IS_ROOT, ip: auth.localIP(), port: PORT, password: auth.password, url: auth.loginUrl(), version: pkg.version };
}
// Call another service on the TV. cb(reply), with a timeout.
function lunaCall(uri, params, cb) {
  if (!service) { cb({ returnValue: false, errorText: 'no luna' }); return; }
  var done = false;
  var t = setTimeout(function () { if (!done) { done = true; cb({ returnValue: false, errorText: 'timeout' }); } }, 8000);
  service.call(uri, params, function (m) { if (!done) { done = true; clearTimeout(t); cb(m.payload || {}); } });
}

// Register the Luna methods listed at the top of service.js. Without webos-service (e.g.
// running on a computer) only the HTTP side works.
function startLuna() {
  var Service;
  try { Service = require('webos-service'); } catch (e) { log('webos-service not available: HTTP only'); return; }
  service = new Service(pkg.name);
  // Keep running: without an activity webOS stops idle services after a few seconds.
  try { service.activityManager.create('keepAlive', function () {}); } catch (e) { log('keepAlive failed', e.message); }
  try {
    service.subscribe('luna://com.webos.service.tvpower/power/getPowerState', { subscribe: true })
      .on('response', function (m) { var st = m.payload && m.payload.state; if (st) { power.powerChanged(st); } });
  } catch (e) { log('power state not available', e.message); }
  try {
    var lastFront = '';
    service.subscribe('luna://com.webos.applicationManager/getForegroundAppInfo', { subscribe: true })
      .on('response', function (m) {
        var app = m.payload && m.payload.appId;
        // Back out of an app: webOS falls back to LG's home, so open TV Home instead
        // (not when coming from TV Home itself, an input or LG's home).
        if (app === 'com.webos.app.home' && lastFront && lastFront !== 'net.local.tvhome' &&
            !/^com\.webos\.app\.(hdmi|home|livetv)/.test(lastFront)) {
          log('front', lastFront + ' closed to LG home: opening TV Home');
          lunaCall('luna://com.webos.applicationManager/launch', { id: 'net.local.tvhome' }, function () {});
        }
        if (app) { lastFront = app; }
        power.foregroundChanged(app, 'net.local.tvhome');
      });
  } catch (e) { log('foreground app not available', e.message); }
  // Volume and mute keys go to the system UI, not the TV app, so pass them on (activity)
  // to undim it. The first reply (no cause) is just the current volume.
  try {
    var lastMute = null;
    service.subscribe('luna://com.webos.service.audio/master/getVolume', { subscribe: true })
      .on('response', function (m) {
        var p = m.payload || {}, vs = p.volumeStatus || {}, cause = p.cause || vs.cause || '';
        var mute = typeof vs.muteStatus === 'boolean' ? vs.muteStatus : p.muteStatus;
        var muteChanged = lastMute !== null && typeof mute === 'boolean' && mute !== lastMute;
        if (typeof mute === 'boolean') { lastMute = mute; }
        if (cause === 'volumeUp' || cause === 'volumeDown' || /mute/i.test(cause) || muteChanged) {
          notify(activitySubs, { returnValue: true, cause: cause || 'mute' });
        }
      });
  } catch (e) { log('volume not available', e.message); }

  service.register('start', function (m) { m.respond({ returnValue: true, started: true, root: IS_ROOT }); });

  // Exit, so the next call starts a fresh copy. Needed after elevate-service: root only
  // applies to a newly started service, and this one otherwise keeps running.
  service.register('restart', function (m) {
    m.respond({ returnValue: true, restarting: true });
    log('restart requested');
    setTimeout(function () { process.exit(0); }, 200);
  });

  service.register('getInfo', function (m) {   // not 'info': webos-service has its own /info
    if (m.isSubscription) { infoSubs[m.uniqueToken] = m; }
    m.respond(infoPayload());
  }, function (m) { delete infoSubs[m.uniqueToken]; });

  service.register('activity', function (m) {
    if (m.isSubscription) { activitySubs[m.uniqueToken] = m; }
    m.respond({ returnValue: true });
  }, function (m) { delete activitySubs[m.uniqueToken]; });

  service.register('getLayout', function (m) {
    if (m.isSubscription) { layoutSubs[m.uniqueToken] = m; }
    m.respond({ returnValue: true, doc: layout.doc });
  }, function (m) { delete layoutSubs[m.uniqueToken]; });

  service.register('getPlugins', function (m) {
    if (m.isSubscription) { plugins.pluginsSubs[m.uniqueToken] = m; }
    plugins.refreshPlugins();     // (tells subscribers itself if anything changed)
    m.respond({ returnValue: true, plugins: plugins.publicList() });
  }, function (m) { delete plugins.pluginsSubs[m.uniqueToken]; });

  // a plugin's data, e.g. { id: 'calendar', topic: 'events' }
  var topicSubs = {};   // uniqueToken -> the topic's subs, to cancel
  service.register('plugin', function (m) {
    var p = m.payload || {}, t = plugins.pluginTopic(p.id, p.topic);
    if (!t) { m.respond({ returnValue: false, errorText: 'No such plugin topic: ' + p.id + '/' + p.topic }); return; }
    if (m.isSubscription) { t.subs[m.uniqueToken] = m; topicSubs[m.uniqueToken] = t.subs; }
    m.respond(t.fn());
  }, function (m) { var subs = topicSubs[m.uniqueToken]; if (subs) { delete subs[m.uniqueToken]; } delete topicSubs[m.uniqueToken]; });

  service.register('pluginCall', function (m) {
    var p = m.payload || {};
    plugins.pluginCall(p.id, p.method, p.params, function (r) { m.respond(r); });
  });

  service.register('setLayout', function (m) {
    try {
      var saved = layout.saveDoc(layout.cleanDoc((m.payload || {}).doc), 'tv');
      m.respond({ returnValue: true, rev: saved.rev });
    } catch (e) {
      m.respond({ returnValue: false, errorText: e.message });
    }
  });

  // TV Home's start-up time, for tools/perf: { name, ms }
  service.register('perfMark', function (m) {
    var p = m.payload || {};
    perfMark(String(p.name || 'mark').replace(/[^\w-]/g, ''), parseInt(p.ms, 10) || 0);
    m.respond({ returnValue: true });
  });

  service.register('newPassword', function (m) {
    changePassword();
    m.respond(infoPayload());
  });
}
// Add a mark to the perf logger's events.csv, only if it's installed (its folder exists).
function perfMark(name, ms) {
  var file = path.join(config.PERF_DIR, 'events.csv');
  if (!fs.existsSync(config.PERF_DIR)) { return; }
  var d = new Date(), up = '';
  // Two digits.
  function two(n) { return (n < 10 ? '0' : '') + n; }
  try { up = fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]; } catch (e) { /* not Linux */ }
  var ts = d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  try {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, 'time,uptime,kind,app,detail\n'); }
    fs.appendFileSync(file, ts + ',' + up + ',mark,net.local.tvhome,' + name + ' ' + ms + '\n');
  } catch (e) { log('perfMark', e.message); }
}
// Make a new password and show it on the TV.
function changePassword() {
  auth.setNewPassword();
  log('new password');
  notify(infoSubs, infoPayload());
}

// used by the other files
exports.changePassword = changePassword;
exports.layoutSubs = layoutSubs;
exports.lunaCall = lunaCall;
exports.notify = notify;
exports.startLuna = startLuna;
