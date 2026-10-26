/* TV Home service: is the TV on, and is TV Home in front? Plugin checks sleep otherwise. */
'use strict';
var config = require('./config');
var log = config.log;
var plugins = require('./plugins');

/* ---------------------------------------------------------------
   Standby: while the TV is off (or in standby with Quick Start+), or another app or input
   is in front, the plugins' checks (api.every) sleep. When TV Home is back, they catch up
   (their powerOn). If either can't be read, the checks run as before.
---------------------------------------------------------------- */
var tvOn = true, away = false;
// fn, but only run while the TV is on and TV Home is in front (for timers).
function whileOn(fn) { return function () { if (tvOn && !away) { fn(); } }; }
// Is a time (ms) more than ms old?
function stale(at, ms) { return Date.now() - at > ms; }
// The TV's power state changed: pause or resume, and let the plugins catch up when it's back on.
function powerChanged(state) {
  // the same 'off' states as startup/autostart.sh; Screen Off (music playing) counts as on
  var on = !/^(Active Standby|Suspend|Power Off|Off|Standby)$/.test(state);
  if (on === tvOn) { return; }
  tvOn = on;
  log('tv', on ? (away ? 'on (another app in front)' : 'on: checks resume') : 'off: checks paused', '(' + state + ')');
  if (!on || away) { return; }
  plugins.eachPluginHook('powerOn');
}
// The app in front changed: pause while it's another app or input, catch up when TV Home is back.
function foregroundChanged(appId, ours) {
  if (!appId) { return; }   // nothing in front (starting up, switching): no change
  var nowAway = appId !== ours;
  if (nowAway === away) { return; }
  away = nowAway;
  log('front', appId + (away ? ': checks paused' : ': checks resume'));
  if (away || !tvOn) { return; }
  plugins.eachPluginHook('powerOn');
}

// used by the other files
exports.powerChanged = powerChanged;
exports.foregroundChanged = foregroundChanged;
exports.stale = stale;
Object.defineProperty(exports, 'tvOn', { get: function () { return tvOn; } });
exports.whileOn = whileOn;
