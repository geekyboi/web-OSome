/* TV Home service: the editor's password, sign-in sessions, and the address shown on the TV. */
'use strict';
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var config = require('./config');
var PASS_FILE = config.PASS_FILE;
var PORT = config.PORT;
var toBuffer = config.toBuffer;
var writeAtomic = config.writeAtomic;

/* ---------------------------------------------------------------
   Password and sessions
---------------------------------------------------------------- */
var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I, so it's easy to type
// A new random 8-character password.
function newPasswordValue() {
  var bytes = crypto.randomBytes(8), out = '';
  for (var i = 0; i < 8; i++) { out += ALPHABET[bytes[i] % ALPHABET.length]; }
  return out;
}
var password = (function () {
  try { var p = fs.readFileSync(PASS_FILE, 'utf8').trim(); if (/^[A-Z2-9]{8}$/.test(p)) { return p; } } catch (e) { /* new */ }
  var fresh = newPasswordValue();
  writeAtomic(PASS_FILE, fresh);
  return fresh;
})();
// The session cookie is derived from the password, so a new password signs everyone out.
function sessionToken() {
  return crypto.createHash('sha256').update('tvhome-session:' + password).digest('hex').slice(0, 40);
}
// Compare two strings in constant time (so timing doesn't give the password away).
function same(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) { return false; }
  if (crypto.timingSafeEqual) { return crypto.timingSafeEqual(toBuffer(a), toBuffer(b)); }
  var r = 0;
  for (var i = 0; i < a.length; i++) { r |= a.charCodeAt(i) ^ b.charCodeAt(i); }
  return r === 0;
}
// Is this the password? (Case and spaces don't matter.)
function checkPassword(given) { return same(String(given || '').toUpperCase().replace(/\s+/g, ''), password); }

var failures = {};   // ip -> [timestamps], to slow down guessing
// Has this IP got the password wrong 10 times in the last 10 minutes?
function tooManyFailures(ip) {
  var now = Date.now(), list = (failures[ip] || []).filter(function (t) { return now - t < 10 * 60 * 1000; });
  failures[ip] = list;
  return list.length >= 10;
}
// Count a wrong password from this IP.
function noteFailure(ip) { (failures[ip] = failures[ip] || []).push(Date.now()); }

/* ---------------------------------------------------------------
   Network address (for the link and the QR code)
---------------------------------------------------------------- */
function localIP() {
  var ifs = os.networkInterfaces(), best = null;
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (a) {
      var fam = a.family === 4 ? 'IPv4' : a.family;
      if (fam !== 'IPv4' || a.internal) { return; }
      if (!best || /^(wlan|eth|en|wl)/.test(name)) { best = a.address; }
    });
  });
  return best || '127.0.0.1';
}
// The editor's address, e.g. http://<tv-ip>:8419/
function baseUrl() { return 'http://' + localIP() + ':' + PORT + '/'; }
// The editor's address with the password in it (for the QR code).
function loginUrl() { return baseUrl() + '?key=' + password; }
// a fresh password (the caller tells the TV app)
function setNewPassword() {
  password = newPasswordValue();
  writeAtomic(PASS_FILE, password);
}

// used by the other files
exports.checkPassword = checkPassword;
exports.localIP = localIP;
exports.loginUrl = loginUrl;
exports.newPasswordValue = newPasswordValue;
exports.noteFailure = noteFailure;
Object.defineProperty(exports, 'password', { get: function () { return password; } });
exports.same = same;
exports.sessionToken = sessionToken;
exports.setNewPassword = setNewPassword;
exports.tooManyFailures = tooManyFailures;
