/* TV Home service: settings from the environment, file locations, and small file helpers. */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var PORT = parseInt(process.env.TVHOME_PORT || '8419', 10);
var IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
var DATA = process.env.TVHOME_DATA || (IS_ROOT ? '/home/root/.config/tvhome' : path.join(os.tmpdir(), 'tvhome-data'));
var FILES = path.join(DATA, 'files');
var DOC_FILE = path.join(DATA, 'layout.json');
var PASS_FILE = path.join(DATA, 'password');
var SERVICE_DIR = path.resolve(__dirname, '..');   // service/
var WEB = path.join(SERVICE_DIR, 'web');
// the app's folder (plugins, assets): next to the services folder on the TV, or the folder above when run from the app folder
var APP_DIR = process.env.TVHOME_APP_DIR || (function () {
  var tv = path.resolve(SERVICE_DIR, '../../applications/net.local.tvhome');
  return fs.existsSync(tv) ? tv : path.resolve(SERVICE_DIR, '..');
})();
var LOG_FILE = process.env.TVHOME_LOG || '/tmp/tvhome-service.log';
var PERF_DIR = process.env.TVPERF_DIR || '/home/root/tvperf';   // tools/perf/tvperf.sh's files, if it's installed
var LG_HOME = 'com.webos.app.home';
var MAX_UPLOAD = 8 * 1024 * 1024;
var MAX_DOC = 512 * 1024;

// Add a line to the log file (/tmp/tvhome-service.log on the TV).
function log() {
  var line = new Date().toISOString() + ' ' + Array.prototype.join.call(arguments, ' ') + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore */ }
}
// Make a folder and any missing parents.
function mkdirp(dir) {
  if (fs.existsSync(dir)) { return; }
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir);
}
// Read a JSON file, or return fallback if it's missing or broken.
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
// Write a file in one go (to a temporary file, then renamed), so it's never half-written.
function writeAtomic(file, data) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
// A string as a Buffer (old Node versions too).
function toBuffer(s) { return Buffer.from ? Buffer.from(s) : new Buffer(s); }

mkdirp(FILES);

// used by the other files
exports.APP_DIR = APP_DIR;
exports.DATA = DATA;
exports.DOC_FILE = DOC_FILE;
exports.FILES = FILES;
exports.IS_ROOT = IS_ROOT;
exports.LG_HOME = LG_HOME;
exports.MAX_DOC = MAX_DOC;
exports.MAX_UPLOAD = MAX_UPLOAD;
exports.PASS_FILE = PASS_FILE;
exports.PERF_DIR = PERF_DIR;
exports.PORT = PORT;
exports.WEB = WEB;
exports.log = log;
exports.mkdirp = mkdirp;
exports.readJson = readJson;
exports.toBuffer = toBuffer;
exports.writeAtomic = writeAtomic;
