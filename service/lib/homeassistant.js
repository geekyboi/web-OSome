/* TV Home service: Home Assistant's address and access token. */
'use strict';
var fs = require('fs');
var path = require('path');
var config = require('./config');
var DATA = config.DATA;
var writeAtomic = config.writeAtomic;
var layout = require('./layout');

/* ---------------------------------------------------------------
   Home Assistant: its address is in the settings; a long-lived access token (for plugins
   that read from Home Assistant, e.g. the bins) is kept in its own file and never sent to
   the TV app or the editor. Plugins get it with api.haToken().
---------------------------------------------------------------- */
var HA_TOKEN_FILE = path.join(DATA, 'ha-token');
// The saved Home Assistant token, or ''.
function haToken() { try { return fs.readFileSync(HA_TOKEN_FILE, 'utf8').trim(); } catch (e) { return ''; } }
// Save the token (only readable by root), or remove it when t is empty.
function setHaToken(t) {
  t = String(t || '').trim();
  if (!t) { try { fs.unlinkSync(HA_TOKEN_FILE); } catch (e) { /* none */ } return; }
  writeAtomic(HA_TOKEN_FILE, t);
  try { fs.chmodSync(HA_TOKEN_FILE, 384); } catch (e2) { /* 0600 */ }
}
// Home Assistant's address from the settings, e.g. http://homeassistant.local:8123
function haBase() { return ((layout.doc && layout.doc.settings) || {}).haUrl || ''; }

// used by the other files
exports.haBase = haBase;
exports.haToken = haToken;
exports.setHaToken = setHaToken;
