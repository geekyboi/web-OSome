/* Web editor: small helpers (building elements, icons, toasts, calling the TV's API).
   The editor's files are plain scripts sharing one scope, loaded in the order index.html
   lists them. It runs in the phone / laptop browser and talks to the service on the TV. */
'use strict';

/* ---------- small helpers ---------- */
function $(s) { return document.querySelector(s); }
// Build elements without innerHTML for anything that isn't a fixed icon string.
function h(tag, attrs) {
  var e = document.createElement(tag);
  var kids = Array.prototype.slice.call(arguments, 2);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) { return; }
      if (k === 'class') { e.className = v; }
      else if (k === 'text') { e.textContent = v; }
      else if (k === 'html') { e.innerHTML = v; }       // fixed SVG strings only
      else if (k.indexOf('on') === 0) { e.addEventListener(k.slice(2), v); }
      else if (k === 'style') { e.setAttribute('style', v); }
      else if (k in e && typeof v !== 'string') { e[k] = v; }
      else { e.setAttribute(k, v === true ? '' : v); }
    });
  }
  kids.forEach(function (c) {
    if (c == null || c === false) { return; }
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}
// A deep copy of plain data.
function clone(o) { return JSON.parse(JSON.stringify(o)); }
// A line icon: inner SVG markup in a 24x24 box, drawn at size px.
function svg(inner, size) {
  return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
var SYM = {
  play: svg('<rect x="3" y="5.5" width="18" height="13" rx="4"></rect><polygon points="10.3,9.3 15.3,12 10.3,14.7" fill="currentColor" stroke="none"></polygon>'),
  tv: svg('<rect x="3" y="5" width="18" height="12" rx="3"></rect><path d="M8 20.5h8M12 17v3.5"></path>'),
  film: svg('<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8.5 4v16M15.5 4v16M4 9h4.5M4 15h4.5M15.5 9H20M15.5 15H20"></path>'),
  note: svg('<path d="M9.2 17.6V6.4l9.6-2v11.2"></path><circle cx="7" cy="17.8" r="2.2"></circle><circle cx="16.6" cy="15.8" r="2.2"></circle>'),
  power: svg('<path d="M12 3.5v8"></path><path d="M6.9 6.8a8 8 0 1 0 10.2 0"></path>'),
  house: svg('<path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"></path>'),
  speaker: svg('<rect x="6.5" y="3.5" width="11" height="17" rx="3"></rect><circle cx="12" cy="9" r="1.8"></circle><circle cx="12" cy="15.2" r="3.2"></circle>'),
  input: svg('<path d="M3 8.5h18v4.2l-2.2 2.8H5.2L3 12.7z"></path><path d="M7 11.5h10"></path>')
};
var UI = {
  up: svg('<path d="M6 14.5 12 8.5l6 6"></path>'),
  down: svg('<path d="M6 9.5l6 6 6-6"></path>'),
  edit: svg('<path d="M15.5 4.5l4 4L8 20H4v-4z"></path><path d="M13 7l4 4"></path>'),
  trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"></path>'),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path>'),
  plus: svg('<path d="M12 5.5v13M5.5 12h13"></path>')
};
var LG_HOME = 'com.webos.app.home';

var toastTimer = null;
// Show a short message at the bottom (err makes it red).
function toast(msg, err) {
  var t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2600);
}

// Call the TV's API: api('/api/state', { method, json | body, type }) → a promise of the JSON reply.
// A failed request rejects with an Error that has .status and .body.
function api(path, opts) {
  opts = opts || {};
  var o = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
  if (opts.json !== undefined) { o.body = JSON.stringify(opts.json); o.headers['Content-Type'] = 'application/json'; }
  if (opts.body) { o.body = opts.body; o.headers['Content-Type'] = opts.type || 'application/octet-stream'; }
  return fetch(path, o).then(function (r) {
    if (r.status === 401) { location.href = '/'; throw new Error('Signed out'); }
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; e.body = j; throw e; }
      return j;
    });
  });
}
