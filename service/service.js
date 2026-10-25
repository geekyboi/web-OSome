/* TV Home service: stores the layout in a file on the TV and serves a web editor, so
   the home screen can be edited from a phone or laptop on the same network.

   Runs as a webOS JavaScript service inside the TV Home package. It needs root, which
   the Homebrew Channel grants with its elevate-service tool (startup/install.sh and the
   TV app both do this). Same pattern as LG Input Hook.

   For the TV app (luna://net.local.tvhome.service/...):
     start                  wake the service up (used at boot)
     getInfo     (sub)      { root, ip, port, password, url }   (not 'info': webos-service owns /info)  url includes the password, for the QR code
     getLayout   (sub)      { doc }   doc = { rev, categories, settings } or null
     setLayout              { doc: { categories, settings } }  -> { rev }
     newPassword            -> { password, url }
     restart                exit, so the next call starts it again (with root, after elevating)
     getPlugins  (sub)      { plugins: [{ id, name, description, version, order, rev, tile, editor, service }] }
     plugin      (sub)      { id, topic }   a plugin's data, e.g. the calendar's events (its service.js: api.topic)
     pluginCall             { id, method, params }   a one-off request to a plugin (its service.js: api.method)
     activity    (sub)      { cause }   a volume or mute key was pressed (the system UI takes those keys, so the app never sees them)

   The tiles (clock, weather, calendar, bins, now playing...) are plugins: folders in the
   app's plugins/ folder. Their service parts (service.js) run inside this service; see
   plugins/README.md.

   Over HTTP (port 8419), everything under /api needs the password: either the cookie set
   by opening the QR code link (/?key=PASSWORD) or the login form.
   Plain ES5, so it runs on the Node versions found on webOS. */
'use strict';

var http = require('http');
var config = require('./lib/config');
var DATA = config.DATA;
var IS_ROOT = config.IS_ROOT;
var PORT = config.PORT;
var log = config.log;
var auth = require('./lib/auth');
var layout = require('./lib/layout');
var luna = require('./lib/luna');
var plugins = require('./lib/plugins');
var web = require('./lib/http');

var server = http.createServer(function (req, res) {
  try { web.handle(req, res); } catch (e) { log('error', e.stack); try { web.sendJson(res, 500, { error: 'Something went wrong.' }); } catch (e2) { /* ignore */ } }
});
server.on('error', function (e) { log('server error', e.code || e.message); });
server.listen(PORT, function () { log('listening on', PORT, 'root=' + IS_ROOT, 'data=' + DATA); });

// the plugins: now, and every 30 seconds in case some were added, removed or changed
plugins.refreshPlugins();
setInterval(function () { try { plugins.refreshPlugins(); } catch (e) { log('plugins', e.stack || e.message); } }, 30 * 1000);

luna.startLuna();

module.exports = { server: server, _test: { cleanDoc: layout.cleanDoc, password: function () { return auth.password; }, refreshPlugins: plugins.refreshPlugins, plugins: function () { return plugins.publicList(); }, doc: function () { return layout.doc; } } };
