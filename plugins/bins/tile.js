/* Bins plugin: a reminder from the evening before collection (from 16:00 by default) until
   the morning of it (09:00), from Home Assistant via this plugin's service.js. A glass card
   at the top of the right-hand column. */
(function () {
  'use strict';
  var api = null;
  var binData = null;
  function fromYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var BIN_KINDS = [
    [/garden|green|grass/i, '#3fae5a'],
    [/food|caddy|brown|compost|organic/i, '#8a5a3c'],
    [/glass/i, '#8e5bd0'],
    [/recycl|blue|paper|card|plastic|tin|can|mixed|dry/i, '#2f7fe0'],
    [/general|refuse|rubbish|residual|landfill|black|grey|gray|household|domestic|waste/i, '#3b4048']
  ];
  function binColour(name) {
    var own = binData && binData.colours && binData.colours[name];
    if (own) { return own; }
    for (var i = 0; i < BIN_KINDS.length; i++) { if (BIN_KINDS[i][0].test(name)) { return BIN_KINDS[i][1]; } }
    return '#8a929c';
  }
  // UK wheelie bin, front view, flat colour with a bold outline (food caddies drawn as the small bin)
  function binIcon(colour, caddy) {
    var o = '#16181b';
    var body = caddy ? 'M9.5 34h29l-2.2 21.2a2.6 2.6 0 0 1-2.6 2.3H14.3a2.6 2.6 0 0 1-2.6-2.3z'
                     : 'M8 17h32l-1.8 37.4a2.8 2.8 0 0 1-2.8 2.8H12.6a2.8 2.8 0 0 1-2.8-2.8z';
    var lidY = caddy ? 28 : 11, lidH = caddy ? 6.5 : 7;
    var lid = 'M5.5 ' + (lidY + 2.4) + 'q0-2.4 2.4-2.4h32.2q2.4 0 2.4 2.4v' + (lidH - 3.4) + 'q0 1-1 1H6.5q-1 0-1-1z';
    var hy = lidY - 4.2;                              // handle bar across the back of the lid
    var handle = caddy ? 'M18 ' + (lidY + 0.2) + 'v-2.6q0-1.6 1.6-1.6h8.8q1.6 0 1.6 1.6v2.6'
                       : 'M11 ' + (lidY + 0.2) + 'V' + (hy + 1.6) + 'q0-1.6 1.6-1.6h22.8q1.6 0 1.6 1.6V' + (lidY + 0.2);
    var top = caddy ? 34 : 17, bot = caddy ? 57.5 : 57.2;
    var panel = caddy ? 'M17 39.5h14v8.5H17z' : 'M16 25h16v14.5H16z';
    return '<svg viewBox="0 0 48 60" width="57" height="72" aria-hidden="true">' +
      '<path d="' + handle + '" fill="none" stroke="' + o + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + body + '" fill="' + colour + '"/>' +
      '<path d="M' + (caddy ? 27 : 29) + ' ' + top + 'h' + (caddy ? 11.5 : 11) + 'l-' + (caddy ? 3 : 2) + ' ' + (bot - top) + 'H' + (caddy ? 27 : 29) + 'z" fill="rgba(0,0,0,0.13)"/>' +   // shaded right side
      '<path d="M' + (caddy ? 12.4 : 11.2) + ' ' + (top + 1.5) + 'l' + (caddy ? 1.6 : 2.4) + ' ' + (bot - top - 4) + '" stroke="rgba(255,255,255,0.35)" stroke-width="2.2" stroke-linecap="round"/>' +   // highlight
      '<path d="' + panel + '" fill="rgba(255,255,255,0.1)" stroke="rgba(0,0,0,0.22)" stroke-width="0.9" stroke-linejoin="round"/>' +   // embossed panel
      '<path d="' + body + '" fill="none" stroke="' + o + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="' + lid + '" fill="' + colour + '"/>' +
      '<path d="' + lid + '" fill="rgba(0,0,0,0.14)"/>' +
      '<path d="M8 ' + (lidY + 1.6) + 'h32" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="' + lid + '" fill="none" stroke="' + o + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '</svg>';
  }
  // The collection to remind about right now, if any: { day: Date, bins: [...], today: bool }
  function binsDue(now) {
    if (!binData || !binData.configured || !binData.next) { return null; }
    var from = binData.from != null ? binData.from : 16, until = binData.until != null ? binData.until : 9;
    for (var i = 0; i < binData.next.length; i++) {
      var c = binData.next[i], d = fromYmd(c.date);
      var start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, from);
      var end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), until);
      if (now >= end) { continue; }                    // that one's been and gone
      if (now >= start && c.bins && c.bins.length) { return { day: d, bins: c.bins, today: now >= d }; }
      return null;                                     // the next one isn't due yet
    }
    return null;
  }
  function renderBins() {
    var due = binsDue(new Date());
    if (!due) { api.show(false); return; }
    var names = due.bins.slice(0, 4);
    var icons = names.slice(0, 3).map(function (n) { return binIcon(binColour(n), /food|caddy/i.test(n)); }).join('');
    var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0];
    var title = due.today ? 'Bin day today' : 'Bins out tonight';
    var sub = list;
    var changed = api.$('binicons').innerHTML !== icons || api.$('bintitle').textContent !== title || api.$('binsub').textContent !== sub;
    if (changed) {
      if (api.root.classList.contains('show')) { api.animateIn(api.root.querySelector('.bintext')); }   // e.g. tonight becomes today
      api.$('binicons').innerHTML = icons;
      api.$('bintitle').textContent = title;
      api.$('binsub').textContent = sub;
      api.root.classList.toggle('today', due.today);
    }
    if (!api.show(true) && changed) { api.layout(); }
  }

  TVHOME.plugin({
    id: 'bins',
    region: 'right',
    tag: 'section',
    attrs: { id: 'bins', 'aria-label': 'Bins' },
    glass: true,
    tone: 'agenda',
    html: '<div class="binicons" id="binicons"></div><div class="bintext"><div class="bintitle" id="bintitle"></div><div class="binsub" id="binsub"></div></div>',

    start: function (a) {
      api = a;
      api.service.subscribe('bins', function (r) {
        if (!r || r.returnValue === false) { return; }
        binData = r;
        renderBins();
      });
    },
    onMinute: function () { renderBins(); }     // the reminder starts in the evening
  });
})();
