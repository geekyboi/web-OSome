/* Calendar plugin: its card in the web editor's Settings (the calendar link and how many events). */
TVHOME_EDITOR.plugin({
  id: 'calendar',
  card: function (ctx) {
    var h = ctx.h, s = ctx.settings, markDirty = ctx.markDirty, toast = ctx.toast, api = ctx.api;
    var calOut = h('div', { class: 'cal-out', id: 'cal-out' });
    function showEvents(list) {
      calOut.innerHTML = '';
      if (!list.length) { calOut.appendChild(h('p', { class: 'hint', text: 'The calendar works, but has nothing in the next 60 days.' })); return; }
      var ul = h('ul', { class: 'cal-list' });
      list.forEach(function (e) {
        var when = e.allDay
          ? new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' \u00b7 All day'
          : new Date(e.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
        ul.appendChild(h('li', {}, h('span', { class: 'cal-when', text: when }), h('span', { class: 'cal-what', text: e.title })));
      });
      calOut.appendChild(ul);
    }
    var countSel = h('select', { id: 'f-caln', onchange: function (e) { s.count = parseInt(e.target.value, 10); markDirty(); } });
    [1, 2, 3, 4, 5, 6].forEach(function (n) { countSel.appendChild(h('option', { value: String(n), text: String(n), selected: (s.count || 3) === n })); });
    return h('div', { class: 'card' },
      h('h3', { text: 'Calendar' }),
      h('p', { class: 'hint', text: 'Shows the next events from a shared calendar on the right of the home screen. Leave the link empty to hide it.' }),
      h('div', { class: 'field' }, h('label', { for: 'f-cal', text: 'Calendar link' }),
        h('input', { type: 'url', id: 'f-cal', value: s.url || '', placeholder: 'webcal://p123-caldav.icloud.com/published/2/…', autocapitalize: 'off', spellcheck: 'false',
          oninput: function (e) { s.url = e.target.value.trim(); markDirty(); } })),
      h('div', { class: 'field' }, h('label', { for: 'f-caln', text: 'Events to show' }), countSel),
      h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px' },
        h('button', { class: 'btn ghost', type: 'button', text: 'Check the link', onclick: function () {
          var url = (s.url || '').trim();
          if (!url) { toast('Paste the calendar link first', true); return; }
          calOut.innerHTML = '';
          calOut.appendChild(h('p', { class: 'hint', text: 'Checking\u2026' }));
          api('test', { method: 'POST', json: { url: url } }).then(function (r) {
            if (!r.ok) { calOut.innerHTML = ''; calOut.appendChild(h('p', { class: 'hint err', text: r.error })); return; }
            showEvents(r.events || []);
          }, function (e) { calOut.innerHTML = ''; calOut.appendChild(h('p', { class: 'hint err', text: e.message })); });
        } })),
      calOut,
      h('details', { class: 'howto' }, h('summary', { text: 'Getting the link for an iCloud calendar' }),
        h('ol', {},
          h('li', { text: 'On the iPhone of whoever created the shared calendar, open Calendar and tap Calendars.' }),
          h('li', { text: 'Tap the \u24d8 next to the shared calendar.' }),
          h('li', { text: 'Turn on Public Calendar, tap Share Link\u2026 and Copy.' }),
          h('li', { text: 'Paste it above (it starts webcal://), tap Check the link, then Save.' })),
        h('p', { class: 'hint', text: 'Only the calendar\u2019s owner sees the Public Calendar switch. Anyone with the link can read the calendar, so keep it private. On a Mac: Calendar \u2192 right-click the calendar \u2192 Share Calendar \u2192 Public Calendar.' })));
  }
});
