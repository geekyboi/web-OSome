/* Web editor: the Home screen tab, the sections and their apps. */
'use strict';

/* ---------- Home screen tab ---------- */
function renderHome() {
  var host = $('#tab-home');
  host.innerHTML = '';
  if (!draft) {
    host.appendChild(h('div', { class: 'card' },
      h('h3', { text: 'Waiting for the TV' }),
      h('p', { class: 'muted', text: 'Open TV Home on the TV once, so it can share its home screen with this page. It will appear here automatically.' })));
    return;
  }
  var cats = draft.categories;
  var anyPrimary = cats.some(function (c) { return c.primary; });
  cats.forEach(function (c, ci) {
    var lockedSection = c.tiles.some(isLastHome);
    var head = h('div', { class: 'section-head' },
      h('input', { type: 'text', value: c.label, maxLength: 40, 'aria-label': 'Section name',
        oninput: function (e) { c.label = e.target.value; markDirty(); } }),
      h('button', { class: 'icon-btn', type: 'button', html: UI.up, 'aria-label': 'Move section up', disabled: ci === 0,
        onclick: function () { move(cats, ci, -1); markDirty(); render(); } }),
      h('button', { class: 'icon-btn', type: 'button', html: UI.down, 'aria-label': 'Move section down', disabled: ci === cats.length - 1,
        onclick: function () { move(cats, ci, 1); markDirty(); render(); } }),
      h('button', { class: 'icon-btn', type: 'button', html: UI.trash, 'aria-label': 'Delete section', disabled: cats.length === 1 || lockedSection,
        title: lockedSection ? 'This section has LG Home, which must stay' : '',
        onclick: function () {
          if (c.tiles.length && !confirm('Delete "' + c.label + '" and its ' + c.tiles.length + ' apps?')) { return; }
          cats.splice(ci, 1); markDirty(); render();
        } }));
    var sub = h('div', { class: 'section-sub' },
      h('label', null, h('input', { type: 'radio', name: 'primary', checked: c.primary || (!anyPrimary && ci === 0),
        onchange: function () { cats.forEach(function (x) { delete x.primary; }); c.primary = true; markDirty(); } }),
        'Open this section first'));
    var list = h('ul', { class: 'tiles' });
    if (!c.tiles.length) { list.appendChild(h('li', { class: 'empty', text: 'No apps yet. A section with no apps is hidden on the TV.' })); }
    c.tiles.forEach(function (t, ti) {
      var moveSel = h('select', { 'aria-label': 'Move to section', class: 'wide-only', style: 'width:auto;min-height:40px;padding:6px 8px',
        onchange: function (e) {
          var to = parseInt(e.target.value, 10);
          if (isNaN(to)) { return; }
          cats[to].tiles.push(c.tiles.splice(ti, 1)[0]);
          markDirty(); render(); toast('Moved to ' + cats[to].label);
        } }, h('option', { value: '', text: 'Move…' }));
      cats.forEach(function (o, oi) { if (oi !== ci) { moveSel.appendChild(h('option', { value: String(oi), text: o.label })); } });
      list.appendChild(h('li', { class: 'tile-row' },
        ico(t, 52),
        h('div', { class: 'tile-text', onclick: function () { editTile(ci, ti); } },
          h('div', { class: 'tile-name' }, t.name, isLastHome(t) ? h('span', { class: 'lock-badge', html: UI.lock, title: 'Always kept' }) : null),
          h('div', { class: 'tile-sub', text: describe(t) })),
        h('div', { class: 'tile-actions' },
          h('button', { class: 'icon-btn', type: 'button', html: UI.up, 'aria-label': 'Move ' + t.name + ' earlier', disabled: ti === 0,
            onclick: function () { move(c.tiles, ti, -1); markDirty(); render(); } }),
          h('button', { class: 'icon-btn', type: 'button', html: UI.down, 'aria-label': 'Move ' + t.name + ' later', disabled: ti === c.tiles.length - 1,
            onclick: function () { move(c.tiles, ti, 1); markDirty(); render(); } }),
          cats.length > 1 ? moveSel : null,
          h('button', { class: 'icon-btn', type: 'button', html: UI.edit, 'aria-label': 'Edit ' + t.name, onclick: function () { editTile(ci, ti); } }),
          isLastHome(t)
            ? h('span', { class: 'lock wide-only', html: UI.lock, title: 'LG Home can’t be removed: it’s the way back to LG’s home screen' })
            : h('button', { class: 'icon-btn wide-only', type: 'button', html: UI.trash, 'aria-label': 'Remove ' + t.name,
                onclick: function () { c.tiles.splice(ti, 1); markDirty(); render(); toast('Removed ' + t.name); } }))));
    });
    host.appendChild(h('div', { class: 'section' }, head, sub, list,
      h('div', { class: 'add-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: function () { pickApps(ci); } },
        h('span', { html: UI.plus, style: 'display:inline-flex' }), 'Add an app'))));
  });
  host.appendChild(h('button', { class: 'btn ghost wide', type: 'button', disabled: cats.length >= 12,
    onclick: function () {
      cats.push({ id: '', label: 'New section', tiles: [] });
      markDirty(); render();
      var inputs = document.querySelectorAll('.section-head input');
      var last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    } }, h('span', { html: UI.plus, style: 'display:inline-flex' }), 'Add a section'));
}
// Swap list[i] with its neighbour (dir -1 or 1).
function move(list, i, dir) { var j = i + dir; if (j < 0 || j >= list.length) { return; } var t = list[i]; list[i] = list[j]; list[j] = t; }
