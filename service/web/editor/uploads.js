/* Web editor: uploaded pictures, and the Home Assistant token. */
'use strict';

/* ---------- pictures ---------- */
// Icons are scaled to fit 256 px (PNG keeps transparency); backgrounds are cropped to 1920x1080.
function upload(file, kind) {
  return new Promise(function (resolve, reject) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var cv = document.createElement('canvas'), ctx = cv.getContext('2d'), w = img.naturalWidth, hh = img.naturalHeight;
      var png = false;
      if (kind === 'background') {
        // keep the picture's shape (for Fit, Centre and Tile); only make it smaller, to about
        // what covers the screen, and never more than 3840 on its long side
        var s = Math.min(1, Math.max(1920 / w, 1080 / hh), 3840 / Math.max(w, hh));
        cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(hh * s));
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        png = /png|gif|webp/i.test(file.type) && cv.width * cv.height <= 1000000;   // small patterns stay crisp
      } else {
        var k = Math.min(1, 256 / Math.max(w, hh));
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(hh * k));
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
      }
      cv.toBlob(function (blob) {
        if (!blob) { reject(new Error('Couldn’t read that picture')); return; }
        toast('Uploading…');
        api('/api/upload?kind=' + kind, { method: 'POST', body: blob, type: blob.type }).then(function (r) {
          return refreshFiles().then(function () { resolve(r.path); });
        }, reject);
      }, kind === 'background' && !png ? 'image/jpeg' : 'image/png', 0.88);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file isn’t a picture this browser can read')); };
    img.src = url;
  });
}
// Where a picture is used in what you're editing now (saved or not).
function usedIn(p) {
  var out = [];
  if (!draft) { return out; }
  if (draft.settings.background === p) { out.push('the background'); }
  draft.categories.forEach(function (c) { c.tiles.forEach(function (t) { if (t.icon === p) { out.push(t.name); } }); });
  return out;
}
// Reload the list of uploaded pictures.
function refreshFiles() { return api('/api/files').then(function (r) { files = r.files || []; }, function () { files = []; }); }

/* ---------- Home Assistant token (for plugins that read from Home Assistant, e.g. the bins) ---------- */
var haTokenSaved = false;
// Ask the TV whether a Home Assistant token is saved.
function refreshTok() {
  return api('/api/ha/status').then(function (r) {
    var was = haTokenSaved;
    haTokenSaved = !!r.hasToken;
    if (was !== haTokenSaved) { renderSettings(); }
  }, function () { /* try again later */ });
}
// The token box under Settings → Home Assistant, with Save and Remove.
function haTokenField() {
  var tokIn = h('input', { type: 'password', id: 'f-hatok', placeholder: 'Paste a long-lived access token', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  return h('div', { class: 'field' }, h('label', { for: 'f-hatok', text: 'Access token' }), tokIn,
    h('p', { class: 'hint' + (haTokenSaved ? ' ok' : ''), id: 'ha-tok-state', text: haTokenSaved ? 'A Home Assistant token is saved on the TV.' : 'No Home Assistant token saved yet. Plugins that read from Home Assistant (e.g. the bins) need one.' }),
    h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px;margin-top:8px' },
      h('button', { class: 'btn ghost', type: 'button', text: 'Save token', onclick: function () {
        var t = tokIn.value.trim();
        if (!t) { toast('Paste the token first', true); return; }
        api('/api/ha/token', { method: 'POST', json: { token: t } }).then(function () { tokIn.value = ''; refreshTok(); toast('Token saved on the TV'); }, function (e) { toast(e.message, true); });
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Remove token', onclick: function () {
        api('/api/ha/token', { method: 'POST', json: { token: '' } }).then(function () { refreshTok(); toast('Token removed'); }, function (e) { toast(e.message, true); });
      } })),
    h('details', { class: 'howto' }, h('summary', { text: 'Making a token' }),
      h('ol', {},
        h('li', { text: 'In Home Assistant, click your name (bottom left) and open the Security tab.' }),
        h('li', { text: 'Under Long-lived access tokens, choose Create token, name it \u201cTV Home\u201d and copy it.' }),
        h('li', { text: 'Paste it above and tap Save token. It\u2019s kept on the TV only and isn\u2019t shown again.' }))));
}
