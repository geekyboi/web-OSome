/* TV Home service: is the TV on? Plugin checks sleep while it's off. */
'use strict';
var config = require('./config');
var log = config.log;
var plugins = require('./plugins');

/* ---------------------------------------------------------------
   Standby: while the TV is off (or in standby with Quick Start+), the plugins' checks
   (api.every) sleep. When it comes back on, they catch up (their powerOn).
   If the power state can't be read, tvOn stays true and the checks run as before.
---------------------------------------------------------------- */
var tvOn = true;
// fn, but only run while the TV is on (for timers).
function whileOn(fn) { return function () { if (tvOn) { fn(); } }; }
// Is a time (ms) more than ms old?
function stale(at, ms) { return Date.now() - at > ms; }
// The TV's power state changed: pause or resume, and let the plugins catch up when it's back on.
function powerChanged(state) {
  // the same 'off' states as startup/autostart.sh; Screen Off (music playing) counts as on
  var on = !/^(Active Standby|Suspend|Power Off|Off|Standby)$/.test(state);
  if (on === tvOn) { return; }
  tvOn = on;
  log('tv', on ? 'on: checks resume' : 'off: checks paused', '(' + state + ')');
  if (!on) { return; }
  plugins.eachPluginHook('powerOn');
}

// used by the other files
exports.powerChanged = powerChanged;
exports.stale = stale;
Object.defineProperty(exports, 'tvOn', { get: function () { return tvOn; } });
exports.whileOn = whileOn;
