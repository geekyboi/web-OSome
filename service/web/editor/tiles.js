/* Web editor: describing and drawing one app (tile). */
'use strict';

/* ---------- tiles ---------- */
function appOf(t) {
  if (t.app) { return t.app; }
  if (t.actions) { for (var i = t.actions.length - 1; i >= 0; i--) { if (t.actions[i].app) { return t.actions[i].app; } } }
  return null;
}
// Does the TV have an icon for the app this tile opens?
function tvIconAvailable(t) {
  var id = appOf(t);
  if (!id || /^com\.webos\.app\.(hdmi\d|livetv)$/.test(id)) { return false; }
  return apps.apps.some(function (a) { return a.id === id && a.icon; });
}
// Will this tile show the TV's icon?
function usesTvIcon(t) {
  return !t.icon && !t.noTvIcon && draft.settings.useTvIcons !== false && tvIconAvailable(t);
}
// The address of a picture as this page sees it.
function asset(p) {
  if (!p) { return ''; }
  if (/^files\//.test(p)) { return '/' + p; }
  if (/^assets\//.test(p)) { return '/app/' + p; }
  return p;
}
// A short line saying what a tile does, e.g. "webhook tv_on → com.webos.app.hdmi2".
function describe(t) {
  function step(a) { return a.app ? a.app : a.webhook ? 'webhook ' + a.webhook : a.url ? a.url : a.delay != null ? 'wait ' + a.delay + ' ms' : ''; }
  if (t.actions && t.actions.length) { return t.actions.map(step).filter(Boolean).join(' → '); }
  return [t.webhook && 'webhook ' + t.webhook, t.url, t.app].filter(Boolean).join(' → ');
}
// How many tiles open LG Home.
function homeCount() {
  var n = 0;
  draft.categories.forEach(function (c) { c.tiles.forEach(function (t) { if (t.app === LG_HOME) { n++; } }); });
  return n;
}
// Is this the last LG Home tile (which can't be removed)?
function isLastHome(t) { return t.app === LG_HOME && homeCount() <= 1; }

// The icon as the TV draws it. size in px; sel = as when selected.
function ico(t, size, sel) {
  var cls = 'ico' + (size > 60 ? ' big' : '') + (sel === false ? ' dim' : '') + (sel ? ' sel' : '');
  var e = h('span', { class: cls });
  if (t.color) { e.style.background = t.color; e.style.setProperty('--glow', t.color + '99'); }
  if (usesTvIcon(t)) {
    e.className += ' art';
    e.appendChild(h('img', { src: '/api/tvicon/' + encodeURIComponent(appOf(t)), alt: '' }));
  } else if (t.icon) {
    e.appendChild(h('img', { src: asset(t.icon), alt: '', class: t.colorIcon ? '' : 'mono' }));
  } else if (t.symbol && SYM[t.symbol]) {
    e.innerHTML = SYM[t.symbol];
  } else {
    var txt = h('span', { text: t.glyph || (t.name || '?').charAt(0).toUpperCase() });
    var k = (size || 52) / 132;
    txt.style.fontSize = Math.round((t.fs || 48) * k) + 'px';
    e.appendChild(txt);
  }
  return e;
}
