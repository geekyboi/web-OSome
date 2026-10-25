/* Bins plugin: its card in the web editor's Settings (which Home Assistant calendars or sensor, the times, the colours). */
TVHOME_EDITOR.plugin({
  id: 'bins',
  card: function (ctx) {
    var h = ctx.h, s = ctx.settings, markDirty = ctx.markDirty, toast = ctx.toast, api = ctx.api;
    var BIN_COLS = [['', 'Automatic'], ['#3b4048', 'Black / grey'], ['#2f7fe0', 'Blue'], ['#3fae5a', 'Green'], ['#8a5a3c', 'Brown'],
                    ['#8e5bd0', 'Purple'], ['#d64545', 'Red'], ['#e6b422', 'Yellow'], ['#e8e8e8', 'White']];
    var binOut = h('div', { class: 'cal-out', id: 'bins-out' });
    function binMsg(t, err) { binOut.innerHTML = ''; binOut.appendChild(h('p', { class: 'hint' + (err ? ' err' : ''), text: t })); }
    // bin calendars: tick each one (one calendar per bin is usual); its name is the bin's name
    var calList = h('div', { class: 'bincals', id: 'bincals' }), haCals = null;
    function drawCals() {
      calList.innerHTML = '';
      var sel = s.calendars || [];
      var rows = haCals || sel.map(function (c) { return { id: c.id, name: c.name || c.id }; });
      if (!rows.length) { calList.appendChild(h('p', { class: 'hint', text: 'Load your calendars from Home Assistant, then tick the bin ones.' })); return; }
      rows.forEach(function (c) {
        var cur = null;
        sel.forEach(function (x) { if (x.id === c.id) { cur = x; } });
        if (/^sensor\./.test(c.id)) {          // a sensor with every bin's date: the sensor names the bins
          var sbox = h('input', { type: 'checkbox', checked: !!cur, 'aria-label': 'Use ' + c.id, onchange: function (e) {
            s.calendars = (s.calendars || []).filter(function (x) { return x.id !== c.id; });
            if (e.target.checked) { s.calendars.push({ id: c.id, name: '' }); }
            markDirty(); drawCals();
          } });
          calList.appendChild(h('div', { class: 'bincal' + (cur ? ' on' : '') }, sbox,
            h('div', { class: 'bincal-text' }, h('span', { class: 'cal-what', text: c.name }),
              h('span', { class: 'cal-when', text: (c.bins ? 'Sensor with ' + c.bins.join(', ') : 'Sensor') + ' \u00b7 ' + c.id }))));
          return;
        }
        var nameIn = h('input', { type: 'text', class: 'bincal-name', value: cur ? (cur.name || '') : c.name, placeholder: 'Bin name (from the event titles if empty)',
          'aria-label': 'Bin name for ' + c.id, disabled: !cur, oninput: function (e) { if (cur) { cur.name = e.target.value; markDirty(); } } });
        var box = h('input', { type: 'checkbox', checked: !!cur, 'aria-label': 'Use ' + c.id, onchange: function (e) {
          s.calendars = (s.calendars || []).filter(function (x) { return x.id !== c.id; });
          if (e.target.checked) { s.calendars.push({ id: c.id, name: nameIn.value.trim() || c.name }); }
          markDirty(); drawCals();
        } });
        calList.appendChild(h('div', { class: 'bincal' + (cur ? ' on' : '') }, box,
          h('div', { class: 'bincal-text' }, nameIn, h('span', { class: 'cal-when', text: c.id }))));
      });
    }
    drawCals();
    function hourSel(id, lo, hi, cur, set) {
      var sel = h('select', { id: id, onchange: function (e) { set(parseInt(e.target.value, 10)); markDirty(); } });
      for (var i = lo; i <= hi; i++) { sel.appendChild(h('option', { value: String(i), text: (i < 10 ? '0' : '') + i + ':00', selected: i === cur })); }
      return sel;
    }
    function autoColour(n) {
      var K = [[/garden|green|grass/i, '#3fae5a'], [/food|caddy|brown|compost|organic/i, '#8a5a3c'], [/glass/i, '#8e5bd0'],
               [/recycl|blue|paper|card|plastic|tin|can|mixed|dry/i, '#2f7fe0'], [/general|refuse|rubbish|residual|landfill|black|grey|gray|household|domestic|waste/i, '#3b4048']];
      for (var i = 0; i < K.length; i++) { if (K[i][0].test(n)) { return K[i][1]; } }
      return '#8a929c';
    }
    function showBins(next, errors, empty, far) {
      binOut.innerHTML = '';
      (far || []).forEach(function (x) {
        var d = new Date(x.date + 'T12:00:00');
        binOut.appendChild(h('p', { class: 'hint', text: x.bin + ': next date given as ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
          ', more than 8 weeks away, so it\u2019s left out. If that looks wrong (e.g. a year out), the bin integration hasn\u2019t got the real next date yet; it usually corrects itself once the council\u2019s website updates.' }));
      });
      (errors || []).forEach(function (x) { binOut.appendChild(h('p', { class: 'hint err', text: x.id + ': ' + x.error })); });
      (empty || []).forEach(function (x) {
        binOut.appendChild(h('p', { class: 'hint', text: x.id + ': nothing in the next 8 weeks (Home Assistant has no upcoming event for it). It\u2019ll show once Home Assistant adds the next date.' }));
      });
      if (!next.length) { binOut.appendChild(h('p', { class: 'hint', text: 'No collections coming up in the next 8 weeks.' })); return; }
      var ul = h('ul', { class: 'cal-list' }), names = [];
      next.forEach(function (c) {
        var d = new Date(c.date + 'T12:00:00');
        ul.appendChild(h('li', {}, h('span', { class: 'cal-when', text: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) }),
          h('span', { class: 'cal-what', text: c.bins.join(', ') })));
        c.bins.forEach(function (n) { if (names.indexOf(n) < 0) { names.push(n); } });
      });
      binOut.appendChild(ul);
      binOut.appendChild(h('p', { class: 'hint', text: 'Bin colours on the TV:' }));
      names.forEach(function (n) {
        var dot = h('span', { class: 'bin-dot' });
        function paint() { dot.style.background = (s.colours && s.colours[n]) || autoColour(n); }
        var sel = h('select', { 'aria-label': 'Colour for ' + n, onchange: function (e) {
          s.colours = s.colours || {};
          if (e.target.value) { s.colours[n] = e.target.value; } else { delete s.colours[n]; }
          markDirty(); paint();
        } });
        BIN_COLS.forEach(function (c) { sel.appendChild(h('option', { value: c[0], text: c[1], selected: ((s.colours || {})[n] || '') === c[0] })); });
        paint();
        binOut.appendChild(h('div', { class: 'bin-row' }, dot, h('span', { class: 'bin-name', text: n }), sel));
      });
    }
    return h('div', { class: 'card' },
      h('h3', { text: 'Bins' }),
      h('p', { class: 'hint', text: 'Shows which bins go out, from the evening before collection until the next morning. The dates come from Home Assistant: a calendar per bin, one calendar for all bins, or a sensor with every bin\u2019s date (e.g. UK Bin Collection Data\u2019s Raw JSON sensor).' }),
      ctx.hasHaToken() ? null : h('p', { class: 'hint err', text: 'Save a Home Assistant token first, under Home Assistant above.' }),
      h('div', { class: 'field' }, h('label', { text: 'Bin calendars' }), calList,
        h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px;margin-top:8px' },
          h('button', { class: 'btn ghost', type: 'button', text: 'Load calendars', onclick: function () {
            binMsg('Loading\u2026');
            api('calendars').then(function (r) {
              if (!r.ok) { binMsg(r.error, true); return; }
              haCals = r.calendars; drawCals(); binOut.innerHTML = '';
              if (!r.calendars.length) { binMsg('Home Assistant has no calendars.', true); }
            }, function (e) { binMsg(e.message, true); });
          } }),
          h('button', { class: 'btn ghost', type: 'button', text: 'Show next collections', onclick: function () {
            if (!(s.calendars || []).length) { toast('Tick the bin calendars first', true); return; }
            binMsg('Checking\u2026');
            api('check', { method: 'POST', json: { calendars: s.calendars } }).then(function (r) {
              if (!r.ok) { binMsg(r.error, true); return; }
              showBins(r.next, r.errors, r.empty, r.far);
            }, function (e) { binMsg(e.message, true); });
          } }),
          (s.calendars || []).length ? h('button', { class: 'btn ghost', type: 'button', text: 'Turn off', onclick: function () { s.calendars = []; markDirty(); drawCals(); binOut.innerHTML = ''; toast('Bins reminder off once you save'); } }) : null)),
      h('div', { class: 'row', style: 'gap:12px;justify-content:flex-start;flex-wrap:wrap' },
        h('div', { class: 'field', style: 'flex:1;min-width:130px' }, h('label', { for: 'f-binfrom', text: 'Remind from (evening before)' }),
          hourSel('f-binfrom', 12, 23, s.from != null ? s.from : 16, function (v) { s.from = v; })),
        h('div', { class: 'field', style: 'flex:1;min-width:130px' }, h('label', { for: 'f-binuntil', text: 'Until (collection day)' }),
          hourSel('f-binuntil', 0, 14, s.until != null ? s.until : 9, function (v) { s.until = v; }))),
      binOut);
  }
});
