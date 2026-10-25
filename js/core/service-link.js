/* The link to the TV Home service (service/service.js), which stores the layout on the TV
   and runs the web editor. Everything here is optional: without the service the app
   just uses local storage. */
'use strict';

/* ---------------------------------------------------------------
   TV Home service: keeps the layout in a file on the TV and runs the web editor for
   phones and laptops (rooted TVs). The app works without it, from local storage.
     - At start: ask for its info; if it isn't running as root, have the Homebrew
       Channel elevate it (needed again after each reinstall), then ask again.
     - Subscribe to the layout: if the file is empty, give it ours; otherwise use it,
       and follow later changes made in the editor.
     - Changes made in Settings on the TV are sent to it.
---------------------------------------------------------------- */
// state: 'checking' | 'none' (not installed / not answering) | 'notroot' | 'ok'
var svc = { ready: false, following: false, info: null, rev: 0, pending: null, infoCbs: [], state: 'checking', error: '' };
// Record how the service is doing and tell anyone listening (the Phone & laptop screen).
function svcState(st, err) {
  svc.state = st; svc.error = err || '';
  if (st === 'none' || st === 'notroot') { scanPluginFolder(); }   // no service: find the plugins in the folder
  svc.infoCbs.forEach(function (f) { try { f(svc.info); } catch (e) { /* ignore */ } });
}
var ELEVATE = '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service net.local.tvhome.service';
var subs = [];   // keep subscription bridges alive

// Subscribe to a Luna method: onMsg is called with every reply. Returns the bridge (or null).
function lunaSub(uri, params, onMsg) {
  if (typeof window.PalmServiceBridge === 'undefined') { return null; }
  try {
    var b = new window.PalmServiceBridge();
    b.onservicecallback = function (msg) {
      var r; try { r = JSON.parse(msg); } catch (e) { return; }
      onMsg(r);
    };
    params.subscribe = true;
    b.call(uri, JSON.stringify(params));
    subs.push(b);
    return b;
  } catch (e) { return null; /* no service */ }
}

// The layout and settings as the service stores them: { categories, settings }.
function currentDoc() {
  // Start from the settings last saved, so ones only the web editor sets (the plugins'
  // settings, e.g. the calendar link or the bin calendars) aren't wiped when the TV saves.
  var settings = {}, keep = savedSettings || {};
  Object.keys(keep).forEach(function (k) { settings[k] = keep[k]; });
  var mine = {
      maxVisible: vis(),
      idleDimMinutes: CFG.idleDimMinutes || 0,
      background: CFG.background || null,
      useTvIcons: CFG.useTvIcons !== false,
      haUrl: HA.url || '',
      haAppsList: HA.appsList || '/local/tvhome-apps.js',
      textStyle: CFG.textStyle || 'auto',
      shade: !!CFG.shade,
      bgTone: CFG.bgTone || null,
      bgFit: bgOpts().fit,
      bgEdge: bgOpts().edge,
      bgColour: bgOpts().colour
  };
  Object.keys(mine).forEach(function (k) { settings[k] = mine[k]; });
  return { categories: CFG.categories, settings: settings };
}

// Send the current layout to the service (if it's connected).
function pushToService() {
  if (!svc.ready) { return; }
  luna(SVC + 'setLayout', { doc: currentDoc() }, function (r) {
    if (r && r.returnValue !== false && r.rev) { svc.rev = r.rev; }
  }, 5000);
}

// A layout arrived from the service (e.g. saved in the web editor): use it and redraw.
function applyDoc(d) {
  if (!d || !d.categories || !d.categories.length) { return; }
  svc.rev = d.rev;
  // our own change coming back, or nothing new: nothing to redraw
  if (JSON.stringify([d.categories, d.settings || null]) === JSON.stringify([CFG.categories, savedSettings])) { return; }
  if (settingsOpen()) { svc.pending = d; return; }         // don't change things under someone using Settings
  var bgBefore = bgKey();
  CFG.categories = ensureHome(d.categories);
  savedSettings = d.settings || null;
  applySettings(savedSettings);
  storeLocal();
  rerender();
  eachPlugin('onSettings');                // e.g. how many events to show changed
  if (bgKey() !== bgBefore) { loadBackground(); } else { applyTone(); }
  wake();
}

// Ask the service for its info: cb(info) or cb(null, why).
function svcInfo(cb) {
  luna(SVC + 'getInfo', {}, function (r) {
    var ok = r && r.returnValue !== false && !r.preview && !r.noReply && r.port;
    cb(ok ? r : null, r && (r.errorText || (r.noReply ? 'no answer' : '')));
  }, 6000);
}

// At start: find the service, get it root via the Homebrew Channel if needed, then follow().
function connectService() {
  if (typeof window.PalmServiceBridge === 'undefined') { svcState('none', 'not on a TV'); return; }
  svcInfo(function (info, err) {
    if (!info) { svcState('none', err); return; }          // not installed / not running: the app works without it
    if (info.root) { follow(); return; }
    // Not root yet (e.g. just reinstalled): the Homebrew Channel can grant it. Root only
    // applies to a freshly started service, so then restart it and ask again.
    svcState('notroot', 'elevating');
    hbExec(ELEVATE, function (hbErr) {
      luna(SVC + 'restart', {}, function () {
        setTimeout(function () {
          svcInfo(function (again, err2) {
            if (again && again.root) { follow(); }
            else { svcState('notroot', hbErr ? 'Homebrew Channel: ' + hbErr : (err2 || 'still not root after restarting')); }
          });
        }, 2000);
      }, 4000);
    }, 15000);
  });
}

// Subscribe to the service's info, layout and plugin list, and keep up with changes.
function follow() {
  lunaSub(SVC + 'getInfo', {}, function (r) {
    if (r && r.returnValue !== false && r.port) {
      svc.info = r;
      svcState('ok');
    }
  });
  lunaSub(SVC + 'getLayout', {}, function (r) {
    if (!r || r.returnValue === false) { return; }
    var first = !svc.ready;
    svc.ready = true;
    if (!r.doc) { if (first) { pushToService(); } return; }   // empty file: share ours
    if (r.doc.rev !== svc.rev) { applyDoc(r.doc); }
  });
  // the plugins in the folder, now and whenever they change
  lunaSub(SVC + 'getPlugins', {}, function (r) {
    if (r && r.returnValue !== false && r.plugins) { setPlugins(r.plugins); }
  });
  // volume / mute keys: the system UI takes them, so keydown never sees them
  lunaSub(SVC + 'activity', {}, function (r) {
    if (r && r.cause) { wake(); }
  });
  svc.following = true;
  pluginsServiceReady();
}
