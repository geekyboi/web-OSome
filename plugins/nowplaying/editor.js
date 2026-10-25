/* Now playing plugin: its card in the web editor's Settings (the amplifier's address). */
TVHOME_EDITOR.plugin({
  id: 'nowplaying',
  card: function (ctx) {
    var h = ctx.h, s = ctx.settings, markDirty = ctx.markDirty, toast = ctx.toast, api = ctx.api;
    var ampOut = h('div', { class: 'cal-out', id: 'amp-out' });
    function ampMsg(t, err) { ampOut.innerHTML = ''; ampOut.appendChild(h('p', { class: 'hint' + (err ? ' err' : ''), text: t })); }
    return h('div', { class: 'card' },
      h('h3', { text: 'Now playing (Yamaha MusicCast)' }),
      h('p', { class: 'hint', text: 'Shows what your amplifier is playing (Spotify, AirPlay, radio, CD\u2026) with the artwork, under the calendar. Nothing shows while it\u2019s off, stopped, or on the TV or another HDMI input. Leave empty to turn it off.' }),
      h('div', { class: 'field' }, h('label', { for: 'f-amp', text: 'Amplifier IP address' }),
        h('input', { type: 'text', id: 'f-amp', value: s.host || '', placeholder: '192.168.1.20', inputmode: 'decimal', autocapitalize: 'off', spellcheck: 'false',
          oninput: function (e) {
            var v = e.target.value.trim();
            s.host = v; markDirty();
            var ok = !v || /^(https?:\/\/)?[a-z0-9.\-]{1,253}(:\d{1,5})?\/?$/i.test(v);
            e.target.setCustomValidity(ok ? '' : 'Use an IP address like 192.168.1.20');
            if (!ok) { ampMsg('That doesn\u2019t look like an IP address, so it won\u2019t be saved.', true); } else if (ampOut.textContent.indexOf('look like') >= 0) { ampOut.innerHTML = ''; }
          } }),
        h('div', { class: 'hint', text: 'In the MusicCast app: Settings \u2192 your amplifier \u2192 Network (or check your router). Giving it a fixed IP in the router helps.' })),
      h('div', { class: 'row', style: 'justify-content:flex-start;gap:10px' },
        h('button', { class: 'btn ghost', type: 'button', text: 'Check the amplifier', onclick: function () {
          var hst = (s.host || '').trim();
          if (!hst) { toast('Enter the amplifier\u2019s IP address first', true); return; }
          ampMsg('Checking\u2026');
          api('test', { method: 'POST', json: { host: hst } }).then(function (r) {
            if (!r.ok) { ampMsg(r.error, true); return; }
            var n = r.now, what = '';
            if (!n) { what = ''; }
            else if (n.power !== 'on') { what = 'It\u2019s in standby.'; }
            else if (n.track || n.artist) { what = (n.playback === 'pause' ? 'Paused: ' : 'Playing: ') + [n.track, n.artist].filter(Boolean).join(' \u2014 ') + ' (' + n.inputName + ')'; }
            else { what = 'On, input: ' + (n.inputName || n.input) + '. Nothing to show right now.'; }
            ampMsg('Found ' + r.model + '. ' + what);
          }, function (e) { ampMsg(e.message, true); });
        } })),
      ampOut);
  }
});
