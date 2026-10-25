/* Weather plugin, the service part: Open-Meteo, fetched every 15 minutes for the place chosen
   in the editor. Settings: { place, lat, lon }. Plain ES5. */
'use strict';
var weather = require('./openmeteo.js');

module.exports = {
  settings: {
    legacy: ['weatherPlace', 'weatherLat', 'weatherLon'],
    migrate: function (s) {
      if (s.weatherPlace === undefined) { return null; }
      return { place: s.weatherPlace || '', lat: s.weatherLat, lon: s.weatherLon };
    },
    clean: function (s) {
      if (typeof s.place === 'string' && s.place && s.place.length <= 120 && typeof s.lat === 'number' && typeof s.lon === 'number' &&
          Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180) {
        return { place: s.place, lat: s.lat, lon: s.lon };
      }
      return { place: '', lat: null, lon: null };
    }
  },

  start: function (api) {
    var wx = { key: '', data: null, error: null, at: 0 };
    function wxPlace() {
      var s = api.settings();
      return (s.place && typeof s.lat === 'number') ? { name: s.place, lat: s.lat, lon: s.lon } : null;
    }
    function wxPayload() {
      var pl = wxPlace();
      return { returnValue: true, configured: !!pl, place: pl ? pl.name : '', now: wx.data && wx.data.now, hours: wx.data ? wx.data.hours.filter(function (h) { return h.t > Date.now() - 3600000; }).slice(0, 8) : [], error: wx.error, at: wx.at };
    }
    function refreshWeather() {
      var pl = wxPlace();
      var key = pl ? pl.lat + ',' + pl.lon : '';
      wx.key = key;
      if (!pl) { wx.data = null; wx.error = null; api.publish('weather'); return; }
      weather.forecast(pl.lat, pl.lon, function (err, d) {
        if (wx.key !== key) { return; }
        if (err) { wx.error = err.message; api.log(err.message); }
        else { wx.data = d; wx.error = null; wx.at = Date.now(); }
        api.publish('weather');
      });
    }

    api.topic('weather', wxPayload);    // the TV app: { configured, place, now: { temp, code, day }, hours: [{ t, temp, code, day, rain }], error }
    api.every(15 * 60 * 1000, refreshWeather);
    api.after(1500, refreshWeather);

    // the editor
    api.route('GET', 'now', function (req, res) { api.sendJson(res, 200, wxPayload()); });
    api.route('GET', 'find', function (req, res, q) {
      weather.findPlace(q.q, function (err, list) {
        if (err) { api.sendJson(res, 200, { ok: false, error: err.message }); return; }
        api.sendJson(res, 200, { ok: true, places: list });
      });
    });

    return {
      settingsChanged: function () {
        var pl = wxPlace(), key = pl ? pl.lat + ',' + pl.lon : '';
        if (key !== wx.key) { wx.data = null; wx.error = null; refreshWeather(); }
      },
      powerOn: function () { if (api.stale(wx.at, 15 * 60 * 1000)) { refreshWeather(); } }
    };
  }
};
