/* Web editor: the Settings tab (background, text, apps per row, Home Assistant, plugins). */
'use strict';

/* ---------- Settings tab ---------- */
function renderSettings() {
  var host = $('#tab-settings');
  host.innerHTML = '';
  if (!draft) { return; }
  var s = draft.settings;

  var bgs = h('div', { class: 'bgs' });
  function bgButton(path, label) {
    return h('button', { type: 'button', class: (s.background || null) === path ? 'on' : '', text: label || '',
      style: path ? 'background-image:url(' + asset(path) + ')' : '', 'aria-label': label || 'Background',
      onclick: function () { s.background = path; markDirty(); measureBg(); renderSettings(); } });
  }
  bgs.appendChild(bgButton(null, 'None (plain colour)'));
  var seen = {};
  if (s.background && /^assets\//.test(s.background)) { bgs.appendChild(bgButton(s.background)); seen[s.background] = 1; }
  files.filter(function (f) { return f.kind === 'background'; }).forEach(function (f) { if (!seen[f.path]) { bgs.appendChild(bgButton(f.path)); } });
  var bgFile = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: function () {
    var f = bgFile.files && bgFile.files[0];
    if (!f) { return; }
    upload(f, 'background').then(function (p) { s.background = p; markDirty(); measureBg(); renderSettings(); toast('Uploaded. Save to show it on the TV.'); }, function (e) { toast(e.message, true); });
  } });
  // How the picture is laid out, with a preview of the whole screen
  var o = window.TVBG.opts(s);
  var prev = h('canvas', { class: 'bg-preview', width: 480, height: 270, 'aria-label': 'Preview of the TV background' });
  function drawPreview() {
    var ctx = prev.getContext('2d'), oo = window.TVBG.opts(s);
    if (!s.background) { window.TVBG.draw(ctx, 480, 270, null, oo); return; }
    bgImage(s.background, function (img) { window.TVBG.draw(ctx, 480, 270, img, window.TVBG.opts(s)); });
  }
  function segOf(list, cur, set) {
    var g = h('div', { class: 'seg' });
    list.forEach(function (x) {
      g.appendChild(h('button', { type: 'button', class: x[0] === cur ? 'on' : '', text: x[1], title: x[2] || '',
        onclick: function () { set(x[0]); markDirty(); measureBg(); renderSettings(); } }));
    });
    return g;
  }
  var FITS = [['fill', 'Fill', 'Covers the screen; the edges that don\u2019t fit are cropped'],
              ['fit', 'Fit', 'The whole picture, with edges where its shape differs from the TV'],
              ['stretch', 'Stretch', 'Squashed or stretched to the screen\u2019s shape'],
              ['center', 'Centre', 'At its own size in the middle'],
              ['tile', 'Tile', 'Shrunk to fit if needed, then repeated']];
  var showEdge = s.background && (o.fit === 'fit' || o.fit === 'center');
  var showColour = !s.background || o.fit === 'tile' || (showEdge && o.edge === 'colour');
  // colour: swatches + picker, updated in place (re-drawing the picker closes it on iPhone)
  var BGSW = ['#000000', '#101418', '#1c2433', '#2b1d3a', '#3a2a1f', '#203a2c', '#f2efe9', '#ffffff'];
  var colIn = h('input', { type: 'color', id: 'f-bgc', value: o.colour, 'aria-label': 'Colour',
    oninput: function (e) { s.bgColour = e.target.value; markDirty(); syncBgSw(); drawPreview(); },
    onchange: function (e) { s.bgColour = e.target.value; markDirty(); syncBgSw(); drawPreview(); measureBg(); } });
  var swBtns = BGSW.map(function (c) {
    return h('button', { type: 'button', class: 'swatch', style: 'background:' + c, 'aria-label': c,
      onclick: function () { s.bgColour = c; colIn.value = c; markDirty(); syncBgSw(); drawPreview(); measureBg(); } });
  });
  function syncBgSw() { var cur = window.TVBG.opts(s).colour.toLowerCase(); swBtns.forEach(function (b, i) { b.classList.toggle('on', BGSW[i] === cur); }); }
  syncBgSw();
  var hint = !s.background ? 'No picture: the whole background is this colour.'
    : o.fit === 'fill' ? 'Covers the screen (16:9); edges that don\u2019t fit are cropped. Keep the left side darker so the text stays readable.'
    : o.fit === 'stretch' ? 'Squashed or stretched to the 16:9 screen.'
    : o.fit === 'tile' ? 'Repeated across the screen from the middle. Pictures bigger than the screen are shrunk to fit first; small patterns keep their own size.'
    : o.fit === 'center' ? 'At the picture\u2019s own size, in the middle of the screen.'
    : 'The whole picture shows, with edges where its shape differs from the TV\u2019s.';
  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Background' }),
    bgs,
    h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', text: 'Upload a picture', onclick: function () { bgFile.click(); } }), bgFile),
    prev,
    s.background ? h('div', { class: 'field' }, h('label', { text: 'Layout' }),
      segOf(FITS, o.fit, function (v) { s.bgFit = v; })) : null,
    showEdge ? h('div', { class: 'field' }, h('label', { text: 'Edges' }),
      segOf([['colour', 'Plain colour'], ['blur', 'Blurred picture']], o.edge, function (v) { s.bgEdge = v; })) : null,
    showColour ? h('div', { class: 'field' }, h('label', { for: 'f-bgc', text: 'Colour' }),
      (function () { var g = h('div', { class: 'swatches bg-sw' }); swBtns.forEach(function (b) { g.appendChild(b); }); g.appendChild(colIn); return g; })()) : null,
    h('p', { class: 'hint', text: hint })));
  drawPreview();

  // text colour over the picture
  var style = s.textStyle || 'auto';
  var styles = [['auto', 'Automatic'], ['light', 'Light text'], ['dark', 'Dark text']];
  var seg = h('div', { class: 'seg' });
  styles.forEach(function (x) {
    seg.appendChild(h('button', { type: 'button', class: x[0] === style ? 'on' : '', text: x[1],
      onclick: function () { s.textStyle = x[0]; markDirty(); renderSettings(); } }));
  });
  var t = s.background && s.bgTone && s.bgTone.src === window.TVBG.key(s) ? s.bgTone : null;
  function word(v) { return v === 'light' ? 'dark text' : 'light text'; }
  var autoNote = !s.background ? 'With no picture, the text suits the colour (dark text on a light colour).'
    : t ? 'For this picture: ' + word(t.greet) + ' for the greeting, ' + word(t.dock) + ' for the sections, ' + word(t.status) + ' for the clock.'
    : 'Measuring this picture\u2026';
  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Text' }),
    h('p', { class: 'hint', text: 'Automatic picks light or dark text for each part of the screen, from how light the picture is behind it.' }),
    seg,
    style === 'auto' ? h('p', { class: 'hint', text: autoNote }) : null,
    h('label', { class: 'check', style: 'margin-top:8px' }, h('input', { type: 'checkbox', checked: !!s.shade,
      onchange: function (e) { s.shade = e.target.checked; markDirty(); } }), 'Soft shade behind the text'),
    h('div', { class: 'hint', text: 'Darkens (or, with dark text, lightens) the left of the picture a little. Useful for busy pictures.' })));

  // uploaded pictures: see where each is used, delete the ones you don't need
  var pics = h('div', { class: 'uploads' });
  files.forEach(function (f) {
    var where = usedIn(f.path);
    pics.appendChild(h('div', { class: 'upload' + (f.kind === 'background' ? ' bg' : '') },
      h('div', { class: 'upload-pic', style: 'background-image:url(/' + f.path + ')', role: 'img', 'aria-label': f.kind === 'background' ? 'Background picture' : 'Icon picture' }),
      h('div', { class: 'upload-text' },
        h('div', { text: (f.kind === 'background' ? 'Background' : 'Icon') + ' \u00b7 ' + Math.max(1, Math.round(f.size / 1024)) + ' KB' }),
        h('div', { class: 'hint', style: 'margin:0', text: where.length ? 'Used by ' + where.join(', ') : 'Not used' })),
      where.length
        ? h('span', { class: 'lock', html: UI.lock, title: 'In use: change that first' })
        : h('button', { class: 'icon-btn', type: 'button', html: UI.trash, 'aria-label': 'Delete this ' + f.kind + ' picture',
            onclick: function () {
              if (!confirm('Delete this picture? This can\u2019t be undone.')) { return; }
              api('/api/files/' + f.path.split('/')[1], { method: 'DELETE' }).then(function () {
                return refreshFiles().then(function () { renderSettings(); toast('Picture deleted'); });
              }, function (e) { toast(e.message, true); });
            } })));
  });
  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Uploaded pictures' }),
    files.length ? h('p', { class: 'hint', text: 'Pictures in use (as the background or on an app) can\u2019t be deleted. Change that and save first.' }) : null,
    files.length ? pics : h('p', { class: 'hint', text: 'Nothing uploaded yet.' })));

  function num(id, label, key, lo, hi, hint) {
    return h('div', { class: 'field' }, h('label', { for: id, text: label }),
      h('input', { type: 'number', id: id, min: lo, max: hi, value: s[key] != null ? s[key] : '', inputmode: 'numeric',
        oninput: function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v)) { s[key] = Math.max(lo, Math.min(hi, v)); markDirty(); } } }),
      hint ? h('div', { class: 'hint', text: hint }) : null);
  }
  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Home screen' }),
    num('f-max', 'Apps shown per row', 'maxVisible', 1, 10, 'Arrows appear when a section has more.'),
    num('f-dim', 'Dim the screen after (minutes)', 'idleDimMinutes', 0, 240, '0 = never. Dimming protects the OLED panel.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.useTvIcons !== false,
      onchange: function (e) { s.useTvIcons = e.target.checked; markDirty(); render(); } }), 'Use the apps’ own icons from the TV (rooted TVs)')));

  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Home Assistant' }),
    h('div', { class: 'field' }, h('label', { for: 'f-ha', text: 'Address' }),
      h('input', { type: 'url', id: 'f-ha', value: s.haUrl || '', placeholder: 'http://192.168.1.10:8123', autocapitalize: 'off',
        oninput: function (e) { s.haUrl = e.target.value.trim(); haApps = null; haError = null; markDirty(); } }),
      h('div', { class: 'hint', text: 'Use the IP address: the TV can’t look up .local names.' })),
    h('div', { class: 'field' }, h('label', { for: 'f-hal', text: 'App list file' }),
      h('input', { type: 'text', id: 'f-hal', value: s.haAppsList || '', placeholder: '/local/tvhome-apps.js', autocapitalize: 'off',
        oninput: function (e) { s.haAppsList = e.target.value.trim(); haApps = null; haError = null; markDirty(); } })),
    haTokenField()));

  // the plugins' own cards (their editor.js), in order
  pluginsInOrder().forEach(function (m) {
    var def = pluginDefs[m.id];
    if (!def || typeof def.card !== 'function') { return; }
    var card = null;
    try { card = def.card(pluginCtx(m.id)); }
    catch (e) { card = h('div', { class: 'card' }, h('h3', { text: m.name }), h('p', { class: 'hint err', text: 'This plugin\u2019s settings couldn\u2019t be shown: ' + e.message })); }
    if (card) { host.appendChild(card); }
  });

  // which plugins are installed (a folder each in the app's plugins folder)
  var plist = h('ul', { class: 'cal-list plugin-list' });
  pluginMeta.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; }).forEach(function (m) {
    plist.appendChild(h('li', {}, h('span', { class: 'cal-what', text: m.name + (m.version ? ' ' + m.version : '') }),
      h('span', { class: 'cal-when', text: (m.description ? m.description + ' ' : '') + '(folder: plugins/' + m.id + ')' })));
  });
  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Plugins' }),
    h('p', { class: 'hint', text: 'Each tile is a plugin: a folder in the app\u2019s plugins folder. Add or remove a folder and the TV and this page pick it up within half a minute.' }),
    pluginMeta.length ? plist : h('p', { class: 'hint', text: 'No plugins installed.' })));

  host.appendChild(h('div', { class: 'card' },
    h('h3', { text: 'Access' }),
    h('p', { class: 'hint', text: 'A new password signs out every phone and laptop except this one. The TV shows the new QR code.' }),
    h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px;flex-wrap:wrap' },
      h('button', { class: 'btn', type: 'button', text: 'New password', onclick: function () {
        if (!confirm('Make a new password? Other devices will need to scan the QR code again.')) { return; }
        api('/api/password', { method: 'POST' }).then(function () { toast('New password set. See it on the TV.'); }, function (e) { toast(e.message, true); });
      } }),
      h('a', { class: 'btn ghost', href: '/logout', text: 'Sign out' }))));
}
