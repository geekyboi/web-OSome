/* Weather from Open-Meteo (free, no key): now, and the next few hours. */
var https = require('https');
var http = require('http');
// (overridable for testing)
var FORECAST = process.env.TVHOME_WX_FORECAST || 'https://api.open-meteo.com/v1/forecast';
var GEOCODE = process.env.TVHOME_WX_GEOCODE || 'https://geocoding-api.open-meteo.com/v1/search';

function getJson(url, cb) {
  var done = false;
  function end(e, j) { if (!done) { done = true; cb(e, j); } }
  var req = (/^https:/.test(url) ? https : http).get(url, { headers: { 'User-Agent': 'TVHome/1.0' } }, function (res) {
    var chunks = [], size = 0;
    res.on('data', function (c) { size += c.length; if (size > 1024 * 1024) { req.abort(); end(new Error('Reply too large')); return; } chunks.push(c); });
    res.on('end', function () {
      var j;
      try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { end(new Error('Unexpected reply from the weather service')); return; }
      if (res.statusCode !== 200) { end(new Error((j && j.reason) || ('Weather service answered ' + res.statusCode))); return; }
      end(null, j);
    });
  });
  req.on('error', function (e) { end(new Error('Can’t reach the weather service (' + (e.code || e.message) + ')')); });
  req.setTimeout(15000, function () { req.abort(); end(new Error('The weather service didn’t answer')); });
}

function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

/* -> { now: { temp, code, day }, hours: [{ t (ms), temp, code, day, rain (%)}...] } */
function forecast(lat, lon, cb) {
  var url = FORECAST + '?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
    '&current=temperature_2m,weather_code,is_day' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
    '&forecast_days=2&timezone=auto&timeformat=unixtime';
  getJson(url, function (err, j) {
    if (err) { cb(err); return; }
    var c = j.current || {}, h = j.hourly || {};
    if (num(c.temperature_2m) === null || !h.time) { cb(new Error('Unexpected reply from the weather service')); return; }
    var hours = [];
    for (var i = 0; i < h.time.length; i++) {
      hours.push({ t: h.time[i] * 1000, temp: num((h.temperature_2m || [])[i]), code: num((h.weather_code || [])[i]),
        day: (h.is_day || [])[i] !== 0, rain: num((h.precipitation_probability || [])[i]) });
    }
    cb(null, { now: { temp: c.temperature_2m, code: num(c.weather_code), day: c.is_day !== 0 }, hours: hours });
  });
}

function findPlace(q, cb) {
  q = String(q || '').trim().slice(0, 80);
  if (q.length < 2) { cb(null, []); return; }
  getJson(GEOCODE + '?count=8&language=en&format=json&name=' + encodeURIComponent(q), function (err, j) {
    if (err) { cb(err); return; }
    cb(null, (j.results || []).map(function (r) {
      return { name: r.name, area: [r.admin2 !== r.name ? r.admin2 : '', r.admin1, r.country].filter(Boolean).join(', '),
        lat: r.latitude, lon: r.longitude };
    }));
  });
}

module.exports = { forecast: forecast, findPlace: findPlace };
