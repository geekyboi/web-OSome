/* Little helpers used everywhere: remote key codes, DOM shortcuts and the built-in icons.
   All the files in js/core/ are plain scripts that share one global scope, loaded in the
   order index.html lists them. Plain ES5 (no build step) so it runs on webOS 23's Chromium 94. */
'use strict';

var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, RED: 403 };

// Pictures uploaded from the editor are kept by the TV Home service and served on this TV only.
var SVC = 'luna://net.local.tvhome.service/';
var SVC_HTTP = 'http://127.0.0.1:8419/';
// The address to load a picture from: uploaded ones ('files/...') come from the service.
function asset(p) { return (typeof p === 'string' && /^files\//.test(p)) ? SVC_HTTP + p : p; }

// document.getElementById, shorter.
function $(id) { return document.getElementById(id); }
// Make an element: el('div', 'class names', 'text'). Text is set as text, never as HTML.
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (text != null) { e.textContent = text; }
  return e;
}
// Two digits: pad(7) is '07'.
function pad(n) { return n < 10 ? '0' + n : '' + n; }
// Escape text for use inside HTML.
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ---------------------------------------------------------------
   Built-in line icons (fixed strings, no user data)
---------------------------------------------------------------- */
function svg(inner, size) {
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
var ICONS = {
  play:    svg('<rect x="3" y="5.5" width="18" height="13" rx="4"></rect><polygon points="10.3,9.3 15.3,12 10.3,14.7" fill="currentColor" stroke="none"></polygon>', 56),
  power:   svg('<path d="M12 3.5v8"></path><path d="M6.9 6.8a8 8 0 1 0 10.2 0"></path>', 54),
  film:    svg('<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8.5 4v16M15.5 4v16M4 9h4.5M4 15h4.5M15.5 9H20M15.5 15H20"></path>', 54),
  note:    svg('<path d="M9.2 17.6V6.4l9.6-2v11.2"></path><circle cx="7" cy="17.8" r="2.2"></circle><circle cx="16.6" cy="15.8" r="2.2"></circle>', 54),
  tv:      svg('<rect x="3" y="5" width="18" height="12" rx="3"></rect><path d="M8 20.5h8M12 17v3.5"></path>', 54),
  house:   svg('<path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"></path>', 54),
  speaker: svg('<rect x="6.5" y="3.5" width="11" height="17" rx="3"></rect><circle cx="12" cy="9" r="1.8"></circle><circle cx="12" cy="15.2" r="3.2"></circle>', 54),
  input:   svg('<path d="M3 8.5h18v4.2l-2.2 2.8H5.2L3 12.7z"></path><path d="M7 11.5h10"></path>', 54),
  gear:    svg('<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>', 32)
};
