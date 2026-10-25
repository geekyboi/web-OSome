/* Web editor: editing one app: its name, what it does, its icon and its colour. */
'use strict';

/* ---------- editing one app ---------- */
function actionMode(t) {
  if (t.actions && t.actions.length) {
    var a = t.actions;
    if (a.length === 2 && a[0].webhook && !a[0].app && a[1].app && !a[1].webhook && Object.keys(a[0]).length === 1 && Object.keys(a[1]).length === 1) { return 'both'; }
    if (a.length === 1 && a[0].app && Object.keys(a[0]).length === 1) { return 'app'; }
    return 'steps';
  }
  if (t.app && t.webhook) { return 'both'; }
  if (t.url) { return 'steps'; }
  if (t.webhook && !t.app) { return 'webhook'; }
  return 'app';
}
// Which kind of icon a tile has: 'picture', 'tv', 'symbol' or 'text'.
function iconMode(t) {
  if (t.icon) { return 'picture'; }
  if (!t.noTvIcon && tvIconAvailable(t) && draft.settings.useTvIcons !== false) { return 'tv'; }
  if (t.symbol) { return 'symbol'; }
  return 'text';
}

// The edit sheet for tile ti of section ci (ti = -1 and fresh = a new tile: adding one).
function editTile(ci, ti, fresh) {
  var c = draft.categories[ci];
  var orig = ti >= 0 ? c.tiles[ti] : fresh;
  var t = clone(orig);
  var mode = actionMode(t), imode = iconMode(t);
  var appId = mode === 'both' ? (t.app || (t.actions && t.actions[1].app)) : (t.app || (t.actions && t.actions[0] && t.actions[0].app) || '');
  var hook = mode === 'both' ? (t.webhook || (t.actions && t.actions[0].webhook)) : (t.webhook || '');
  var steps = t.actions ? JSON.stringify(t.actions, null, 2) : '[\n  { "webhook": "my_webhook" },\n  { "delay": 500 },\n  { "app": "netflix" }\n]';
  var glyph = t.glyph || '', fsz = t.fs || 48, symbol = t.symbol || 'play', picture = t.icon || '', keepColours = !!t.colorIcon;
  var hasColour = !!t.color, colour = t.color || '#8b5cff';

  var body = h('div');
  var preview = h('div', { class: 'previews' });
  function current() {
    var o = { name: nameIn.value.trim() };
    if (mode === 'app') { o.app = appId; }
    else if (mode === 'webhook') { o.webhook = hook; }
    else if (mode === 'both') { o.actions = [{ webhook: hook }, { app: appId }]; }
    else { try { o.actions = JSON.parse(stepsIn.value); } catch (e) { o.actions = null; } }
    if (hasColour) { o.color = colour; }
    if (imode === 'symbol') { o.symbol = symbol; o.noTvIcon = true; }
    else if (imode === 'text') { if (glyph) { o.glyph = glyph; } o.fs = fsz; o.noTvIcon = true; }
    else if (imode === 'picture' && picture) { o.icon = picture; if (keepColours) { o.colorIcon = true; } }
    return o;
  }
  function drawPreview() {
    var o = current();
    if (!o.name) { o.name = '?'; }
    preview.innerHTML = '';
    preview.appendChild(h('figure', null, ico(o, 112, false), h('figcaption', { text: 'Not selected' })));
    preview.appendChild(h('figure', null, ico(o, 112, true), h('figcaption', { text: 'Selected' })));
  }

  // name
  var nameIn = h('input', { type: 'text', id: 'f-name', value: t.name || '', maxLength: 60, oninput: drawPreview });
  body.appendChild(preview);
  body.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-name', text: 'Name' }), nameIn));

  // what it does
  var actHost = h('div');
  var stepsIn = h('textarea', { id: 'f-steps', spellcheck: false, oninput: drawPreview });
  stepsIn.value = steps;
  function appPicker() {
    var sel = h('select', { id: 'f-app' });
    var known = false;
    var g1 = h('optgroup', { label: 'Inputs' }), g2 = h('optgroup', { label: 'TV apps' });
    apps.inputs.forEach(function (i) { g1.appendChild(h('option', { value: i.app, text: i.name, selected: i.app === appId })); if (i.app === appId) { known = true; } });
    apps.apps.forEach(function (a) { g2.appendChild(h('option', { value: a.id, text: a.title, selected: a.id === appId })); if (a.id === appId) { known = true; } });
    sel.appendChild(h('option', { value: '', text: 'Choose…', selected: !appId }));
    sel.appendChild(g1); sel.appendChild(g2);
    sel.appendChild(h('option', { value: '__other', text: 'Another app ID…', selected: !!appId && !known }));
    var other = h('input', { type: 'text', placeholder: 'e.g. com.example.app', value: known ? '' : appId, hidden: !(appId && !known),
      oninput: function (e) { appId = e.target.value.trim(); drawPreview(); } });
    sel.addEventListener('change', function () {
      if (sel.value === '__other') { other.hidden = false; other.focus(); appId = other.value.trim(); }
      else { other.hidden = true; appId = sel.value; if (!nameIn.value.trim() && sel.selectedOptions[0]) { nameIn.value = sel.selectedOptions[0].textContent; } }
      drawPreview(); drawIcon();
    });
    var test = h('button', { class: 'btn ghost', type: 'button', text: 'Open on TV', onclick: function () {
      if (!appId) { toast('Choose an app first', true); return; }
      api('/api/launch', { method: 'POST', json: { app: appId } }).then(function () { toast('Opened on the TV'); }, function (e) { toast(e.message, true); });
    } });
    return h('div', { class: 'field' }, h('label', { for: 'f-app', text: 'App or input' }), h('div', { class: 'row' }, sel, h('span', { style: 'flex:0 0 auto' }, test)), other);
  }
  function hookField() {
    return h('div', { class: 'field' }, h('label', { for: 'f-hook', text: 'Home Assistant webhook ID' }),
      h('input', { type: 'text', id: 'f-hook', value: hook || '', placeholder: 'e.g. tv_ps5_on', autocapitalize: 'off', spellcheck: false,
        oninput: function (e) { hook = e.target.value.trim(); } }),
      h('div', { class: 'hint', text: 'Calls ' + (String(draft.settings.haUrl || 'http://homeassistant') + '/api/webhook/<id>') }));
  }
  var actSeg = h('div', { class: 'seg' });
  var amodes = [['app', 'Open an app'], ['webhook', 'Webhook'], ['both', 'Webhook, then app'], ['steps', 'Steps']];
  amodes.forEach(function (m) { actSeg.appendChild(h('button', { type: 'button', text: m[1], onclick: function () { mode = m[0]; drawAction(); drawPreview(); drawIcon(); } })); });
  function drawAction() {
    Array.prototype.forEach.call(actSeg.children, function (b, i) { b.className = amodes[i][0] === mode ? 'on' : ''; });
    actHost.innerHTML = '';
    if (mode === 'app') { actHost.appendChild(appPicker()); }
    else if (mode === 'webhook') { actHost.appendChild(hookField()); }
    else if (mode === 'both') { actHost.appendChild(hookField()); actHost.appendChild(appPicker()); }
    else {
      actHost.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-steps', text: 'Steps, in order (JSON)' }), stepsIn,
        h('div', { class: 'hint', text: 'Each step is { "app": "id" }, { "webhook": "id" }, { "url": "http://..." } or { "delay": ms }.' })));
    }
  }
  body.appendChild(h('div', { class: 'field' }, h('div', { class: 'label', text: 'What it does' }), actSeg));
  body.appendChild(actHost);

  // icon
  var iconHost = h('div');
  var iconSeg = h('div', { class: 'seg' });
  var imodes = [['tv', 'TV’s icon'], ['symbol', 'Symbol'], ['text', 'Text'], ['picture', 'Picture']];
  imodes.forEach(function (m) { iconSeg.appendChild(h('button', { type: 'button', text: m[1], onclick: function () { imode = m[0]; drawIcon(); drawPreview(); } })); });
  function drawIcon() {
    var tvOk = tvIconAvailable(current()) && draft.settings.useTvIcons !== false;
    if (imode === 'tv' && !tvOk) { imode = t.symbol ? 'symbol' : 'text'; }
    Array.prototype.forEach.call(iconSeg.children, function (b, i) {
      b.className = imodes[i][0] === imode ? 'on' : '';
      b.hidden = imodes[i][0] === 'tv' && !tvOk;
    });
    iconHost.innerHTML = '';
    if (imode === 'tv') {
      iconHost.appendChild(h('p', { class: 'hint', text: 'Uses the app’s own icon from the TV (rooted TVs with the Homebrew Channel).' }));
    } else if (imode === 'symbol') {
      var grid = h('div', { class: 'symbols' });
      Object.keys(SYM).forEach(function (k) {
        grid.appendChild(h('button', { type: 'button', class: k === symbol ? 'on' : '', html: SYM[k], 'aria-label': k,
          onclick: function () { symbol = k; drawIcon(); drawPreview(); } }));
      });
      iconHost.appendChild(grid);
    } else if (imode === 'text') {
      iconHost.appendChild(h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: 'f-glyph', text: 'Text (up to 6 characters)' }),
          h('input', { type: 'text', id: 'f-glyph', maxLength: 6, value: glyph, placeholder: (nameIn.value || '?').charAt(0).toUpperCase(),
            oninput: function (e) { glyph = e.target.value; drawPreview(); } })),
        h('div', { class: 'field' }, h('label', { for: 'f-fs', text: 'Size' }),
          h('input', { type: 'range', id: 'f-fs', min: 24, max: 72, value: fsz, oninput: function (e) { fsz = parseInt(e.target.value, 10); drawPreview(); } }))));
    } else {
      var fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true,
        onchange: function () {
          var f = fileIn.files && fileIn.files[0];
          if (!f) { return; }
          upload(f, 'icon').then(function (p) { picture = p; drawIcon(); drawPreview(); }, function (e) { toast(e.message, true); });
        } });
      var pics = h('div', { class: 'pics' });
      files.filter(function (f) { return f.kind === 'icon'; }).forEach(function (f) {
        pics.appendChild(h('button', { type: 'button', class: f.path === picture ? 'on' : '', style: 'background-image:url(/' + f.path + ')', 'aria-label': 'Use this picture',
          onclick: function () { picture = f.path; drawIcon(); drawPreview(); } }));
      });
      iconHost.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', text: 'Upload a picture', onclick: function () { fileIn.click(); } }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: keepColours, onchange: function (e) { keepColours = e.target.checked; drawPreview(); } }), 'Keep its colours')));
      iconHost.appendChild(fileIn);
      iconHost.appendChild(h('div', { class: 'hint', text: 'Without “keep its colours” the picture is shown in white, so use one with a transparent background.' }));
      if (pics.children.length) { iconHost.appendChild(pics); }
    }
  }
  body.appendChild(h('div', { class: 'field' }, h('div', { class: 'label', text: 'Icon' }), iconSeg));
  body.appendChild(iconHost);

  // colour: swatches, a hex box, and the browser's own picker for anything else
  var SWATCHES = ['#e50914', '#ff1f3d', '#e60012', '#ff6f59', '#f5a623', '#e1cb5e', '#1db954', '#107c10',
    '#0a9fd8', '#0070d1', '#1b3fd0', '#002d62', '#8b5cff', '#ff4c98', '#3b3b43', '#0f2323'];
  var colourHost = h('div');
  // Built once and updated in place: replacing the colour input while the phone's own
  // picker is open closes that picker (iOS), so it must never be redrawn.
  var hexIn = h('input', { type: 'text', value: hasColour ? colour : '', placeholder: '#rrggbb', maxLength: 7, 'aria-label': 'Colour as hex, e.g. #e50914',
    autocapitalize: 'off', spellcheck: false, style: 'width:120px;flex:0 0 auto;font-family:ui-monospace,Menlo,monospace',
    oninput: function (e) {
      var v = e.target.value.trim(); if (v && v.charAt(0) !== '#') { v = '#' + v; }
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { colour = v.toLowerCase(); hasColour = true; syncColour('hex'); drawPreview(); }
    } });
  var colourIn = h('input', { type: 'color', value: colour, 'aria-label': 'Pick any colour',
    oninput: function (e) { colour = e.target.value; hasColour = true; syncColour('picker'); drawPreview(); },
    onchange: function (e) { colour = e.target.value; hasColour = true; syncColour('picker'); drawPreview(); } });
  var noneHint = h('span', { class: 'hint', style: 'margin:0' });
  var grid = h('div', { class: 'swatches' });
  var noneBtn = h('button', { type: 'button', class: 'swatch none', 'aria-label': 'No colour (gradient)', title: 'No colour: the violet-pink gradient',
    onclick: function () { hasColour = false; syncColour(); drawPreview(); } });
  grid.appendChild(noneBtn);
  var swatchBtns = SWATCHES.map(function (c) {
    var btn = h('button', { type: 'button', class: 'swatch', style: 'background:' + c, 'aria-label': c,
      onclick: function () { colour = c; hasColour = true; syncColour(); drawPreview(); } });
    grid.appendChild(btn);
    return btn;
  });
  colourHost.appendChild(grid);
  colourHost.appendChild(h('div', { class: 'row', style: 'justify-content:flex-start;margin-top:10px' }, hexIn, colourIn, noneHint));
  function syncColour(from) {
    noneBtn.classList.toggle('on', !hasColour);
    swatchBtns.forEach(function (btn, i) { btn.classList.toggle('on', hasColour && SWATCHES[i] === colour); });
    if (from !== 'hex') { hexIn.value = hasColour ? colour : ''; }
    if (from !== 'picker' && colourIn.value !== colour) { colourIn.value = colour; }
    noneHint.textContent = hasColour ? '' : 'No colour';
  }
  function drawColour() { syncColour(); }
  drawColour();
  body.appendChild(h('div', { class: 'field' }, h('div', { class: 'label', text: 'Colour' }), colourHost,
    h('div', { class: 'hint', text: 'Without one, the tile uses the violet-pink gradient (or a colour taken from the TV\u2019s icon).' })));

  // section (moving to another one)
  var target = ci;
  if (draft.categories.length > 1) {
    var secSel = h('select', { id: 'f-sec', onchange: function (e) { target = parseInt(e.target.value, 10); } });
    draft.categories.forEach(function (o, oi) { secSel.appendChild(h('option', { value: String(oi), text: o.label, selected: oi === ci })); });
    body.appendChild(h('div', { class: 'field' }, h('label', { for: 'f-sec', text: 'Section' }), secSel));
  }
  if (ti >= 0 && isLastHome(orig)) {
    body.appendChild(h('p', { class: 'hint', text: 'This is the way back to LG’s own home screen, so it can’t be removed. You can rename or move it.' }));
  }

  drawAction(); drawIcon(); drawPreview();

  function done() {
    var o = current();
    if (!o.name) { toast('Give it a name', true); nameIn.focus(); return; }
    if (mode === 'app' && !o.app) { toast('Choose the app to open', true); return; }
    if ((mode === 'webhook' || mode === 'both') && !hook) { toast('Enter the webhook ID', true); return; }
    if (mode === 'both' && !appId) { toast('Choose the app to open', true); return; }
    if (mode === 'steps' && (!Array.isArray(o.actions) || !o.actions.length)) { toast('The steps aren’t valid JSON (a list of steps)', true); return; }
    if (ti >= 0) { c.tiles[ti] = o; } else { c.tiles.push(o); }
    if (target !== ci) {
      var at = ti >= 0 ? ti : c.tiles.length - 1;
      draft.categories[target].tiles.push(c.tiles.splice(at, 1)[0]);
      toast('Moved to ' + draft.categories[target].label);
    }
    markDirty(); closeSheet(); render();
  }
  var foot = [
    ti >= 0 && !isLastHome(orig) ? h('button', { class: 'btn danger', type: 'button', text: 'Remove', onclick: function () { c.tiles.splice(ti, 1); markDirty(); closeSheet(); render(); } }) : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: closeSheet }),
    h('button', { class: 'btn primary', type: 'button', text: ti >= 0 ? 'Done' : 'Add', onclick: done })
  ];
  openSheet(ti >= 0 ? 'Edit ' + (t.name || 'app') : 'New app in ' + c.label, body, foot);
}
