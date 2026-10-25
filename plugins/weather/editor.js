/* Weather plugin: its card in the web editor's Settings (the place to show the weather for). */
TVHOME_EDITOR.plugin({
  id: 'weather',
  card: function (ctx) {
    var h = ctx.h, s = ctx.settings, markDirty = ctx.markDirty, toast = ctx.toast, api = ctx.api;
    var wxOut = h('div', { class: 'cal-out', id: 'wx-out' });
    var wxNow = h('p', { class: 'hint', id: 'wx-place', text: s.place ? 'Showing the weather for ' + s.place + '.' : 'Weather is off.' });
    function wxMsg(t, err) { wxOut.innerHTML = ''; wxOut.appendChild(h('p', { class: 'hint' + (err ? ' err' : ''), text: t })); }
    var wxQ = h('input', { type: 'search', id: 'f-wx', placeholder: 'Town or postcode area, e.g. Leeds', autocapitalize: 'words', enterkeyhint: 'search',
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); findWx(); } } });
    function findWx() {
      var q = wxQ.value.trim();
      if (q.length < 2) { toast('Type a town first', true); return; }
      wxMsg('Searching\u2026');
      api('find?q=' + encodeURIComponent(q)).then(function (r) {
        if (!r.ok) { wxMsg(r.error, true); return; }
        if (!r.places.length) { wxMsg('Nothing found. Try a nearby town.', true); return; }
        wxOut.innerHTML = '';
        var ul = h('ul', { class: 'cal-list wx-pick' });
        r.places.forEach(function (pl) {
          ul.appendChild(h('li', {}, h('button', { type: 'button', class: 'wx-btn', onclick: function () {
            s.place = pl.name; s.lat = pl.lat; s.lon = pl.lon; markDirty();
            wxNow.textContent = 'Showing the weather for ' + pl.name + ' once you save.';
            wxOut.innerHTML = ''; wxQ.value = '';
          } }, h('span', { class: 'cal-what', text: pl.name }), h('span', { class: 'cal-when', text: pl.area }))));
        });
        wxOut.appendChild(ul);
      }, function (e) { wxMsg(e.message, true); });
    }
    return h('div', { class: 'card' },
      h('h3', { text: 'Weather' }),
      h('p', { class: 'hint', text: 'Shows the weather now and for the next two hours in the clock bar (from Open-Meteo, no account needed).' }),
      wxNow,
      h('div', { class: 'field' }, h('label', { for: 'f-wx', text: 'Find your town' }), wxQ),
      h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px' },
        h('button', { class: 'btn ghost', type: 'button', text: 'Search', onclick: findWx }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Turn off', onclick: function () {
          s.place = ''; s.lat = null; s.lon = null; markDirty();
          wxNow.textContent = 'Weather will be off once you save.'; wxOut.innerHTML = '';
        } })),
      wxOut);
  }
});
