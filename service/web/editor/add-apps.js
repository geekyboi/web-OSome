/* Web editor: adding apps to a section (TV apps, inputs, Home Assistant list, custom). */
'use strict';

/* ---------- adding apps ---------- */
function sameAction(a, b) { return JSON.stringify([a.app, a.webhook, a.url, a.actions]) === JSON.stringify([b.app, b.webhook, b.url, b.actions]); }
// The "Add an app" sheet for section ci: pick from the TV's apps, its inputs, the Home
// Assistant list, or make a custom one.
function pickApps(ci) {
  var c = draft.categories[ci], mode = 'tv';
  var body = h('div');
  var seg = h('div', { class: 'seg', role: 'tablist' });
  var content = h('div', { style: 'margin-top:12px' });
  var modes = [['tv', 'TV apps'], ['inputs', 'Inputs'], ['ha', 'Home Assistant'], ['custom', 'Custom']];
  modes.forEach(function (m) {
    seg.appendChild(h('button', { type: 'button', class: m[0] === mode ? 'on' : '', text: m[1], onclick: function () { mode = m[0]; draw(); } }));
  });
  body.appendChild(seg); body.appendChild(content);

  function add(t) {
    if (c.tiles.some(function (x) { return sameAction(x, t); })) { toast(t.name + ' is already in ' + c.label); return; }
    c.tiles.push(t); markDirty(); render(); draw();
    toast('Added ' + t.name + ' to ' + c.label);
  }
  function row(t, sub, added, onclick) {
    return h('li', { class: added ? 'added' : '', onclick: onclick }, ico(t, 44),
      h('div', { class: 'tile-text' }, h('div', { class: 'tile-name', text: t.name }), h('div', { class: 'tile-sub', text: sub })),
      h('span', { class: 'muted small', text: added ? 'Added' : 'Add' }));
  }
  function draw() {
    Array.prototype.forEach.call(seg.children, function (b, i) { b.className = modes[i][0] === mode ? 'on' : ''; });
    content.innerHTML = '';
    if (mode === 'tv') {
      if (apps.error && !apps.apps.length) { content.appendChild(h('p', { class: 'muted', text: 'The TV didn’t share its app list (' + apps.error + ').' })); }
      var q = h('input', { type: 'text', class: 'search', placeholder: 'Search apps', 'aria-label': 'Search apps' });
      var ul = h('ul', { class: 'pick-list' });
      function fill() {
        ul.innerHTML = '';
        var term = q.value.trim().toLowerCase();
        apps.apps.filter(function (a) { return !term || a.title.toLowerCase().indexOf(term) >= 0 || a.id.toLowerCase().indexOf(term) >= 0; })
          .forEach(function (a) {
            var t = { name: a.title, app: a.id };
            ul.appendChild(row(t, a.id, c.tiles.some(function (x) { return sameAction(x, t); }), function () { add(t); }));
          });
        if (!ul.children.length) { ul.appendChild(h('li', { class: 'muted', text: 'Nothing matches.' })); }
      }
      q.addEventListener('input', fill);
      content.appendChild(q); content.appendChild(ul); fill();
    } else if (mode === 'inputs') {
      var ul2 = h('ul', { class: 'pick-list' });
      apps.inputs.forEach(function (i) {
        var t = { name: i.name, app: i.app, symbol: /livetv/.test(i.app) ? 'tv' : 'input' };
        ul2.appendChild(row(t, i.app, c.tiles.some(function (x) { return sameAction(x, t); }), function () { add(t); }));
      });
      content.appendChild(h('p', { class: 'muted small', text: 'Names are the ones set in the TV’s input settings.' }));
      content.appendChild(ul2);
    } else if (mode === 'ha') {
      if (haApps === null && !haError) {
        content.appendChild(h('p', { class: 'muted', text: 'Loading the list from Home Assistant…' }));
        loadHa(draw);
        return;
      }
      if (haError) { content.appendChild(h('p', { class: 'muted', text: haError })); }
      var ul3 = h('ul', { class: 'pick-list' });
      (haApps || []).forEach(function (t) {
        ul3.appendChild(row(t, describe(t), c.tiles.some(function (x) { return sameAction(x, t); }), function () { add(clone(t)); }));
      });
      content.appendChild(ul3);
      content.appendChild(h('button', { class: 'btn ghost', type: 'button', text: 'Reload the list', onclick: function () { haApps = null; haError = null; draw(); } }));
    } else {
      content.appendChild(h('p', { class: 'muted', text: 'Make an app that opens any app ID, calls a Home Assistant webhook, or both.' }));
      content.appendChild(h('button', { class: 'btn primary', type: 'button', text: 'Create a custom app',
        onclick: function () { editTile(ci, -1, { name: '', app: '' }); } }));
    }
  }
  draw();
  openSheet('Add to ' + c.label, body, [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: 'Done', onclick: closeSheet })]);
}

// The Home Assistant list is a script (window.TVHOME_APPS = [...]), like on the TV.
function haListUrl() {
  var s = draft.settings, path = s.haAppsList || '/local/tvhome-apps.js';
  if (/^https?:\/\//i.test(path)) { return path; }
  return String(s.haUrl || '').replace(/\/+$/, '') + (path.charAt(0) === '/' ? '' : '/') + path;
}
// Load the Home Assistant list file (window.TVHOME_APPS = [...]). done() once it's in haApps / haError.
function loadHa(done) {
  var url = haListUrl();
  if (!/^https?:\/\//.test(url)) { haError = 'Set the Home Assistant address in Settings first.'; done(); return; }
  try { delete window.TVHOME_APPS; } catch (e) { window.TVHOME_APPS = undefined; }
  var s = document.createElement('script'), finished = false;
  var timer = setTimeout(function () { end('Timed out loading ' + url); }, 6000);
  function end(err) {
    if (finished) { return; }
    finished = true; clearTimeout(timer);
    if (s.parentNode) { s.parentNode.removeChild(s); }
    var list = window.TVHOME_APPS;
    if (err || !Array.isArray(list)) { haError = err || ('No list found at ' + url); haApps = []; }
    else { haApps = list.filter(function (t) { return t && t.name && (t.app || t.webhook || t.url || (t.actions && t.actions.length)); }); haError = null; }
    done();
  }
  s.onload = function () { end(null); };
  s.onerror = function () { end('Couldn’t load ' + url + '. This page is http, so the list must be too.'); };
  s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
  document.head.appendChild(s);
}
