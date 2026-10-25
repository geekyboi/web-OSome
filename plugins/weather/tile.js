/* Weather plugin: the weather now, then the next two hours, in the clock bar (Open-Meteo,
   fetched by this plugin's service.js). With weather on, the settings button and the bar are
   as wide as the panels under them. */
(function () {
  'use strict';
  var api = null;
  var wxData = null;

  // WMO weather codes -> a simple line icon
  function wxKind(code) {
    if (code === 0) { return 'clear'; }
    if (code === 1 || code === 2) { return 'part'; }
    if (code === 3) { return 'cloud'; }
    if (code === 45 || code === 48) { return 'fog'; }
    if (code >= 51 && code <= 57) { return 'drizzle'; }
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { return 'rain'; }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) { return 'snow'; }
    if (code >= 95) { return 'storm'; }
    return 'cloud';
  }
  var CLOUD = '<path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .6-7.45 5.5 5.5 0 0 0-10.6 1.2A3.15 3.15 0 0 0 7.5 18.5z"/>';
  var CLOUD_HI = '<path d="M7.5 14.5h9.25a3.75 3.75 0 0 0 .6-7.45 5.5 5.5 0 0 0-10.6 1.2A3.15 3.15 0 0 0 7.5 14.5z"/>';
  function wxIcon(code, day, size, live) {
    var k = wxKind(code), g;
    var sun = '<g class="sun"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"/></g>';
    var moon = '<path class="moon" d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>';
    if (k === 'clear') { g = day ? sun : moon; }
    else if (k === 'part') {
      g = (day ? '<g class="sun"><circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 1.8v1.6M1.8 8.5h1.6M3.75 3.75l1.1 1.1M13.25 3.75l-1.1 1.1"/></g>'
               : '<path class="moon" d="M12.6 9.6A5 5 0 0 1 6.4 3.4a5 5 0 1 0 6.2 6.2z"/>') +
          '<path d="M9.5 20h8.25a3.5 3.5 0 0 0 .55-6.95 5.1 5.1 0 0 0-9.85 1.1A2.95 2.95 0 0 0 9.5 20z"/>';
    }
    else if (k === 'cloud') { g = CLOUD; }
    else if (k === 'fog') { g = CLOUD_HI + '<path d="M4.5 18h15M6.5 21h11"/>'; }
    else if (k === 'drizzle') { g = CLOUD_HI + '<g class="drop"><path d="M8.5 18.2v.6M12 19.2v.6M15.5 18.2v.6"/></g>'; }
    else if (k === 'rain') { g = CLOUD_HI + '<g class="drop"><path d="M8.6 17.5l-1 3M12.1 17.5l-1 3M15.6 17.5l-1 3"/></g>'; }
    else if (k === 'snow') { g = CLOUD_HI + '<g class="flake"><path d="M8.5 17.6v.1M12 19.6v.1M15.5 17.6v.1M10.2 21.4v.1M13.8 21.4v.1"/></g>'; }
    else { g = CLOUD_HI + '<path class="bolt" d="M12.8 15.2l-2.4 3.6h3l-2.2 3.4"/>'; }
    if (live) { g = wxLive(k, day) || g; }
    return '<svg class="wi-' + k + (day ? '' : ' night') + '" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + g + '</svg>';
  }
  // The current weather's icon, with moving parts (animated by css, .wxnow .a-*): same drawing,
  // split into groups so the rays turn, drops fall, clouds drift and so on.
  function wxLive(k, day) {
    var SUN_RAYS = '<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"/>';
    var stars = '<g class="moon"><path class="a-tw" d="M18.6 3.2v1.6M17.8 4h1.6"/><path class="a-tw t2" d="M21.6 8.2v1.2M21 8.8h1.2"/><path class="a-tw t3" d="M15.2 1.6v1M14.7 2.1h1"/></g>';
    function drops(list, cls, anim) {
      return '<g class="' + cls + '">' + list.map(function (d, i) { return '<path class="' + anim + ' f' + i + '" d="' + d + '"/>'; }).join('') + '</g>';
    }
    if (k === 'clear') {
      return day ? '<g class="sun"><circle cx="12" cy="12" r="4.2"/><g class="a-rays">' + SUN_RAYS + '</g></g>'
                 : '<path class="moon" d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>' + stars;
    }
    if (k === 'part') {
      return (day ? '<g class="sun"><circle cx="8.5" cy="8.5" r="3.2"/><g class="a-rays"><path d="M8.5 1.8v1.6M1.8 8.5h1.6M3.75 3.75l1.1 1.1M13.25 3.75l-1.1 1.1M8.5 13.6v1.6M15.2 8.5h-1.6"/></g></g>'
                  : '<path class="moon" d="M12.6 9.6A5 5 0 0 1 6.4 3.4a5 5 0 1 0 6.2 6.2z"/>') +
             '<g class="a-drift"><path d="M9.5 20h8.25a3.5 3.5 0 0 0 .55-6.95 5.1 5.1 0 0 0-9.85 1.1A2.95 2.95 0 0 0 9.5 20z"/></g>';
    }
    if (k === 'cloud') {
      return '<g class="a-back"><path d="M14.9 8.4a3.1 3.1 0 0 1 5.6 .9 2.4 2.4 0 0 1 1.6 4.3"/></g>' +
             '<g class="a-front">' + CLOUD + '</g>';
    }
    if (k === 'fog') {
      return '<g class="a-front">' + CLOUD_HI + '</g><path class="a-fog" d="M4.5 18h15"/><path class="a-fog f1" d="M6.5 21h11"/>';
    }
    if (k === 'drizzle') { return CLOUD_HI + drops(['M8.5 17.6v.8', 'M12 17.6v.8', 'M15.5 17.6v.8'], 'drop', 'a-fall'); }
    if (k === 'rain') { return CLOUD_HI + drops(['M8.6 17.3l-.7 2', 'M12.1 17.3l-.7 2', 'M15.6 17.3l-.7 2'], 'drop', 'a-fall'); }
    if (k === 'snow') { return CLOUD_HI + drops(['M8.5 17.4v.1', 'M12 17.4v.1', 'M15.5 17.4v.1', 'M10.2 17.4v.1', 'M13.8 17.4v.1'], 'flake', 'a-snow'); }
    if (k === 'storm') {
      return CLOUD_HI + drops(['M7.8 17.3l-.7 2', 'M16.4 17.3l-.7 2'], 'drop', 'a-fall') +
             '<path class="bolt a-bolt" d="M12.8 15.2l-2.4 3.6h3l-2.2 3.4"/>';
    }
    return '';
  }  var wxHtml = '', wxFade = null;
  function deg(t) { return t == null ? '–' : Math.round(t) + '°'; }
  function renderWeather() {
    var box = api.root, pad = api.util.pad;
    var html = '';
    if (wxData && wxData.configured && wxData.now) {
      var now = Date.now();
      var next = (wxData.hours || []).filter(function (h) { return h.t > now; }).slice(0, 2);
      html = '<span class="wxnow">' + wxIcon(wxData.now.code, wxData.now.day, 35, true) + '<b>' + deg(wxData.now.temp) + '</b></span>';
      if (next.length) {
        html += '<i class="wxsep"></i>';
        next.forEach(function (h) {
          var d = new Date(h.t);
          html += '<span class="wxh"><small>' + pad(d.getHours()) + ':00</small><span>' + wxIcon(h.code, h.day, 22) + '<span class="t">' + deg(h.temp) + '</span></span></span>';
        });
      }
    }
    if (html === wxHtml) { return; }   // (not box.innerHTML: the browser rewrites the svg, so that never matched)
    var first = !wxHtml || !html;
    wxHtml = html;
    // content changed: fade out, swap, fade back in (the first weather just appears)
    clearTimeout(wxFade);
    if (first) { box.classList.remove('out'); showWeather(); return; }
    box.classList.add('out');
    wxFade = setTimeout(function () { showWeather(); box.classList.remove('out'); }, 400);
  }
  function showWeather() {
    var st = api.region;
    api.root.innerHTML = wxHtml;
    st.classList.toggle('wide', !!wxHtml);
    st.title = wxData && wxData.place ? wxData.place : '';
    api.layout();
  }

  TVHOME.plugin({
    id: 'weather',
    region: 'status',
    tag: 'span',
    attrs: { id: 'wx' },

    start: function (a) {
      api = a;
      api.service.subscribe('weather', function (r) {
        if (!r || r.returnValue === false) { return; }
        wxData = r;
        renderWeather();
      });
    },
    stop: function () {
      clearTimeout(wxFade);
      api.region.classList.remove('wide');
      api.region.title = '';
    },
    onMinute: function () { renderWeather(); },     // the next hours move on
    onSettings: function () { renderWeather(); }
  });
})();
