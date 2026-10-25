/* Calendar plugin, the service part: the next few events from a shared calendar's .ics link
   (e.g. an iCloud Public Calendar). Fetched every 15 minutes; the list is re-worked out every
   few minutes, so finished events drop off without waiting for the next fetch.
   Settings: { url, count }. Plain ES5. */
'use strict';
var calendar = require('./ics.js');

module.exports = {
  settings: {
    legacy: ['calendarUrl', 'calendarCount'],
    migrate: function (s) {
      if (s.calendarUrl === undefined && s.calendarCount == null) { return null; }
      return { url: s.calendarUrl || '', count: s.calendarCount || 3 };
    },
    clean: function (s) {
      var o = {};
      if (typeof s.url === 'string' && s.url.length <= 1000 && /^(webcal|https?):\/\/[^\s]+$/i.test(s.url.trim())) { o.url = s.url.trim(); }
      else { o.url = ''; }
      var n = parseInt(s.count, 10);
      o.count = isNaN(n) ? 3 : Math.max(1, Math.min(6, n));
      return o;
    }
  },

  start: function (api) {
    var cal = { url: '', text: null, events: [], error: null, at: 0 };
    function calSettings() {
      var s = api.settings();
      return { url: s.url || '', count: s.count || 3 };
    }
    function calPayload() {
      var c = calSettings();
      return { returnValue: true, configured: !!c.url, events: cal.events.slice(0, c.count), error: cal.error, at: cal.at };
    }
    function recomputeCalendar() {
      if (cal.text) {
        try { cal.events = calendar.upcoming(cal.text, Date.now(), 6, 60); cal.error = null; }
        catch (e) { cal.error = 'Couldn’t read the calendar: ' + e.message; }
      } else if (!cal.url) { cal.events = []; cal.error = null; }
      api.publish('events');
    }
    function refreshCalendar() {
      var url = calSettings().url;
      cal.url = url;
      if (!url) { cal.text = null; recomputeCalendar(); return; }
      calendar.fetchText(url, function (err, text) {
        if (url !== calSettings().url) { return; }            // changed meanwhile
        if (err) { cal.error = err.message; api.log(err.message); api.publish('events'); return; }
        if (!/BEGIN:VCALENDAR/i.test(text)) { cal.error = 'That link didn’t return a calendar.'; api.publish('events'); return; }
        cal.text = text; cal.at = Date.now();
        recomputeCalendar();
      });
    }

    api.topic('events', calPayload);     // the TV app: { configured, events: [{ title, location, start, end, allDay }], error }
    api.every(15 * 60 * 1000, refreshCalendar);
    api.every(5 * 60 * 1000, recomputeCalendar);
    api.after(1000, refreshCalendar);

    // the editor
    api.route('GET', 'events', function (req, res) { api.sendJson(res, 200, calPayload()); });
    api.route('POST', 'test', function (req, res) {
      api.readJson(req, 4096, function (j) {
        calendar.fetchText(j.url, function (e2, text) {
          if (e2) { api.sendJson(res, 200, { ok: false, error: e2.message }); return; }
          if (!/BEGIN:VCALENDAR/i.test(text)) { api.sendJson(res, 200, { ok: false, error: 'That link didn’t return a calendar.' }); return; }
          try { api.sendJson(res, 200, { ok: true, events: calendar.upcoming(text, Date.now(), 5, 60) }); }
          catch (e3) { api.sendJson(res, 200, { ok: false, error: 'Couldn’t read the calendar: ' + e3.message }); }
        });
      });
    });

    return {
      settingsChanged: function () {
        if (calSettings().url !== cal.url) { cal.text = null; cal.events = []; cal.error = null; refreshCalendar(); }
        else { api.publish('events'); }                // e.g. how many to show changed
      },
      powerOn: function () {
        if (api.stale(cal.at, 15 * 60 * 1000)) { refreshCalendar(); } else { recomputeCalendar(); }
      }
    };
  }
};
