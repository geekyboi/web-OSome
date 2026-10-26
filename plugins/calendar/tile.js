/* Calendar plugin: the next few events, fetched by this plugin's service.js from the
   calendar's link. A glass panel in the right-hand column; when the column is too full,
   it shows fewer events (shrink). */
(function () {
  'use strict';
  var api = null;
  var agenda = null;        // { configured, events, error } from the service
  var shown = null;         // the events on screen, by title and start (to spot new ones)
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fromYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayName(d, now) {
    var diff = Math.round((dayStart(d) - dayStart(now)) / 86400000);
    if (diff === 0) { return 'Today'; }
    if (diff === 1) { return 'Tomorrow'; }
    return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()];
  }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function whenText(e, now) {
    if (e.allDay) {
      var s = e.startDay ? fromYmd(e.startDay) : dayStart(new Date(e.start));
      var last = e.endDay ? fromYmd(e.endDay) : dayStart(new Date(e.end));
      last.setDate(last.getDate() - 1);                       // the end is the day after
      if (dayStart(last) <= dayStart(s)) { return dayName(s, now) + ' \u00b7 All day'; }
      if (s <= now) { return 'Until ' + dayName(last, now); }
      return dayName(s, now) + ' \u2013 ' + dayName(last, now);
    }
    var st = new Date(e.start), en = new Date(e.end);
    if (st <= now && now < en) { return 'Now \u00b7 until ' + (dayStart(en) > dayStart(now) ? dayName(en, now) + ' ' : '') + hm(en); }
    return dayName(st, now) + ' \u00b7 ' + hm(st);
  }
  function count() { return api.settings().count || 3; }
  function renderAgenda() {
    var box = api.root, list = api.$('events'), esc = api.util.esc;
    if (!agenda || !agenda.configured) { shown = null; api.show(false); return; }
    var now = new Date(), html = '';
    var evs = (agenda.events || []).filter(function (e) { return e.end > now.getTime(); });   // drop ones that just finished
    evs = evs.slice(0, count());
    if (!evs.length) {
      html = '<li class="none">' + (agenda.error && !agenda.at ? 'Calendar not available' : 'Nothing coming up') + '</li>';
    } else {
      evs.forEach(function (e) {
        var isNow = !e.allDay && e.start <= now.getTime();
        html += '<li' + (isNow ? ' class="now"' : '') + '><div class="when">' + esc(whenText(e, now)) + '</div>' +
          '<div class="what">' + esc(e.title) + '</div>' +
          (e.location ? '<div class="where">' + esc(e.location.split('\n')[0]) + '</div>' : '') + '</li>';
      });
    }
    var changed = list.innerHTML !== html;
    if (changed) {
      list.innerHTML = html;
      // events that weren't there before fade up (not when the panel itself is just appearing)
      var keys = evs.map(function (e) { return e.title + '|' + e.start; });
      if (shown && box.classList.contains('show')) {
        keys.forEach(function (k, i) { if (shown.indexOf(k) < 0) { api.animateIn(list.children[i]); } });
      }
      shown = keys;
    }
    if (!api.show(true) && changed) { api.layout(); }
  }

  TVHOME.plugin({
    id: 'calendar',
    region: 'right',
    tag: 'aside',
    attrs: { id: 'agenda', 'aria-label': 'Coming up' },
    glass: true,
    tone: 'agenda',
    busy: true,
    html: '<div class="ahead">Coming up</div><ol id="events"></ol>',

    // settings saved before plugins (calendarUrl / calendarCount)
    migrate: function (s) { return s.calendarUrl !== undefined || s.calendarCount != null ? { url: s.calendarUrl || '', count: s.calendarCount || 3 } : null; },

    start: function (a) {
      api = a;
      api.service.subscribe('events', function (r) {
        if (!r || r.returnValue === false) { return; }
        agenda = r;
        renderAgenda();
      });
    },
    onMinute: function () { renderAgenda(); },
    onSettings: function () { renderAgenda(); },     // e.g. how many events to show changed
    // the column is too full: hide the last event (keeping at least one)
    shrink: function () {
      var items = api.root.querySelectorAll('#events li:not(.none):not(.cut)');
      if (items.length <= 1) { return false; }
      items[items.length - 1].classList.add('cut');
      return true;
    },
    unshrink: function () {
      Array.prototype.forEach.call(api.root.querySelectorAll('li.cut'), function (li) { li.classList.remove('cut'); });
    }
  });
})();
