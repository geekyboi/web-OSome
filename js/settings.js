/* TV Home: Settings.
   Add, remove, rename and reorder the apps in each section. Apps come from three places:
     - TV inputs   (HDMI ports and Live TV; a fixed list)
     - TV apps     (the TV's own launcher list, or launchpoints.json if the TV won't share it)
     - Home Assistant (a list file you keep in Home Assistant's www folder)
   Changes are saved on the TV straight away and the dock is rebuilt when Settings closes.
   Plain ES5, like js/core/. */
(function () {
  'use strict';

  var T = window.TVHOME;
  if (!T) { return; }
  var KEY = T.KEY;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var SMALL = {
    pencil: T.svg('<path d="M15.5 4.5l4 4L8 20H4v-4z"></path><path d="M13 7l4 4"></path>', 26),
    up:     T.svg('<path d="M6 14.5 12 8.5l6 6"></path>', 26),
    down:   T.svg('<path d="M6 9.5l6 6 6-6"></path>', 26),
    remove: T.svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"></path>', 26),
    plus:   T.svg('<path d="M12 5.5v13M5.5 12h13"></path>', 26),
    check:  T.svg('<path d="M5.5 12.5l4.2 4.2 8.8-9.2"></path>', 26),
    lock:   T.svg('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path>', 24)
  };

  // Where apps come from: TV inputs, TV apps and Home Assistant (settings-sources.js)
  var SOURCES = window.TVHOME_SOURCES || [];

  /* ---------------------------------------------------------------
     State
  ---------------------------------------------------------------- */
  var S = {
    open: false,
    layout: [],
    cat: 0,
    src: 'inputs',
    cache: {},          // source id -> { loading, items, note, error }
    focus: null,
    renaming: -1,
    resetArmed: false
  };
  var root = null;

  function tileKey(t) {
    return JSON.stringify([t.app || '', t.webhook || '', t.url || '', t.actions || '']);
  }
  function inSection(t) {
    var k = tileKey(t);
    var tiles = (S.layout[S.cat] && S.layout[S.cat].tiles) || [];
    for (var i = 0; i < tiles.length; i++) { if (tileKey(tiles[i]) === k) { return true; } }
    return false;
  }
  function describe(t) {
    if (t.actions && t.actions.length) {
      return t.actions.map(function (a) {
        return a.app ? a.app : a.webhook ? 'webhook ' + a.webhook : a.url ? a.url : a.delay ? 'wait ' + a.delay + 'ms' : '';
      }).filter(Boolean).join(' → ');
    }
    var bits = [];
    if (t.webhook) { bits.push('webhook ' + t.webhook); }
    if (t.url) { bits.push(t.url); }
    if (t.app) { bits.push(t.app); }
    return bits.join(' → ');
  }

  function save() {
    if (!T.saveLayout(clone(S.layout))) { T.toast('Couldn’t save settings on this TV', true); }
  }

  /* ---------------------------------------------------------------
     Building the screen
  ---------------------------------------------------------------- */
  function icon(t) {
    var box = el('span', 's-ico');
    var art = T.tvIconFor(t);
    if (art) {
      box.className = 's-ico art';
      var a = el('img', 'color');
      a.src = art.src;
      a.alt = '';
      box.appendChild(a);
      return box;
    }
    if (t.color) { box.style.background = t.color; }
    if (t.icon) {
      var img = el('img', t.colorIcon ? 'color' : '');
      img.src = T.asset(t.icon);
      img.alt = '';
      box.appendChild(img);
    } else if (t.symbol && T.ICONS[t.symbol]) {
      box.innerHTML = T.ICONS[t.symbol];
    } else {
      box.appendChild(el('span', 's-txt', t.glyph || (t.name || '?').charAt(0).toUpperCase()));
    }
    return box;
  }

  // A focusable control. k is a stable key so focus can be restored after a re-render.
  function control(tag, cls, k, act, label) {
    var e = el(tag, 'sf ' + cls);
    e.setAttribute('data-k', k);
    e.setAttribute('role', 'button');
    if (label) { e.setAttribute('aria-label', label); }
    e._act = act;
    T.onHover(e, function () { if (S.open && root.contains(e) && S.renaming < 0 && (!phone || phone.contains(e))) { setFocus(e); } });
    e.addEventListener('click', function (ev) { ev.stopPropagation(); setFocus(e); act(); });
    return e;
  }

  function build() {
    root = $('settings');
    root.innerHTML = '';
    root.appendChild(el('div', 's-title', 'Settings'));

    var top = el('div', 's-top');
    top.appendChild(control('div', 's-btn s-phone', 'phone', openPhone, 'Edit from a phone or laptop'));
    top.appendChild(control('div', 's-btn s-reset', 'reset', onReset, 'Reset to defaults'));
    top.appendChild(control('div', 's-btn s-done', 'done', close, 'Done'));
    root.appendChild(top);

    root.appendChild(el('div', 's-tabs', null)).id = 's-cats';

    var left = el('section', 's-panel s-left');
    left.appendChild(el('div', 's-h', '')).id = 's-lh';
    left.appendChild(el('div', 's-list', null)).id = 's-list';
    root.appendChild(left);

    var right = el('section', 's-panel s-right');
    right.appendChild(el('div', 's-h', 'Add apps'));
    right.appendChild(el('div', 's-tabs s-srcs', null)).id = 's-srcs';
    right.appendChild(el('div', 's-msg', '')).id = 's-msg';
    right.appendChild(el('div', 's-list', null)).id = 's-src';
    root.appendChild(right);
  }

  function renderTop() {
    var r = root.querySelector('.s-reset');
    r.textContent = S.resetArmed ? 'Press again to reset' : 'Reset to defaults';
    r.classList.toggle('armed', S.resetArmed);
    root.querySelector('.s-done').textContent = 'Done';
    root.querySelector('.s-phone').textContent = 'Phone & laptop';
  }

  /* ---------------------------------------------------------------
     Phone & laptop: the QR code (with the password in it) for the web editor
  ---------------------------------------------------------------- */
  var phone = null;      // the panel while it's open
  function openPhone() {
    if (phone) { return; }
    phone = el('div', 's-phonepanel');
    phone.setAttribute('role', 'dialog');
    phone.setAttribute('aria-label', 'Edit from a phone or laptop');
    root.appendChild(phone);
    drawPhone();
  }
  function drawPhone() {
    if (!phone) { return; }
    var info = T.service();
    phone.innerHTML = '';
    var card = el('div', 's-phonecard');
    phone.appendChild(card);
    if (!info) {
      var st = T.serviceState();
      card.appendChild(el('div', 's-ph-title', 'Edit from a phone or laptop'));
      var col = el('div', 's-ph-side');
      col.style.maxWidth = '1300px';
      card.appendChild(col);
      if (st.state === 'checking') {
        col.appendChild(el('p', 's-ph-text', 'Connecting to the editor service\u2026'));
      } else if (st.state === 'notroot') {
        col.appendChild(el('p', 's-ph-text', 'The editor service is running, but doesn\u2019t have root yet' +
          (st.error && st.error !== 'elevating' ? ' (' + st.error + ')' : '') + '. In webOS Dev Manager \u2192 Terminal, run:'));
        col.appendChild(el('p', 's-ph-code', '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service net.local.tvhome.service'));
        col.appendChild(el('p', 's-ph-code', 'pkill -f net.local.tvhome.service'));
        col.appendChild(el('p', 's-ph-text', 'then choose Try again.'));
      } else {
        col.appendChild(el('p', 's-ph-text', 'The editor service isn\u2019t answering' + (st.error ? ' (' + st.error + ')' : '') +
          '. It needs a rooted TV with the Homebrew Channel. If it isn\u2019t installed, package it with the app:'));
        col.appendChild(el('p', 's-ph-code', 'ares-package tvhome tvhome/service'));
        col.appendChild(el('p', 's-ph-text', 'reinstall, then in Dev Manager \u2192 Terminal run:'));
        col.appendChild(el('p', 's-ph-code', 'sh /media/developer/apps/usr/palm/applications/net.local.tvhome/startup/install.sh'));
      }
    } else {
      var qr = el('canvas', 's-qr');
      try { window.TVQR.draw(qr, info.url, 10); } catch (e) { /* too long: the address below still works */ }
      card.appendChild(qr);
      var side = el('div', 's-ph-side');
      side.appendChild(el('div', 's-ph-title', 'Edit from a phone or laptop'));
      side.appendChild(el('p', 's-ph-text', 'Scan the code with your phone\u2019s camera. It signs you in.'));
      side.appendChild(el('p', 's-ph-text', 'Or open this address on the same network:'));
      side.appendChild(el('p', 's-ph-url', 'http://' + info.ip + ':' + info.port));
      side.appendChild(el('p', 's-ph-text', 'and enter the password'));
      side.appendChild(el('p', 's-ph-pass', info.password));
      card.appendChild(side);
    }
    var buttons = el('div', 's-ph-buttons');
    if (info) {
      buttons.appendChild(control('div', 's-btn', 'ph-new', function () {
        T.newPassword(function () { drawPhone(); restoreFocus('ph-new'); T.toast('New password: other devices are signed out', false); });
      }, 'New password')).textContent = 'New password';
    }
    if (!info && T.serviceState().state !== 'checking') {
      buttons.appendChild(control('div', 's-btn', 'ph-retry', function () { T.reconnectService(); drawPhone(); }, 'Try again')).textContent = 'Try again';
    }
    buttons.appendChild(control('div', 's-btn', 'ph-close', closePhone, 'Close')).textContent = 'Close';
    phone.appendChild(buttons);
    restoreFocus('ph-close');
  }
  function closePhone() {
    if (!phone) { return; }
    phone.parentNode.removeChild(phone);
    phone = null;
    restoreFocus('phone');
  }
  T.onServiceInfo(function () { if (phone) { var k = S.focus && S.focus.getAttribute('data-k'); drawPhone(); if (k) { restoreFocus(k); } } });

  function renderCats() {
    var host = $('s-cats');
    host.innerHTML = '';
    S.layout.forEach(function (c, i) {
      var b = control('div', 's-tab' + (i === S.cat ? ' on' : ''), 'cat:' + i, function () {
        if (S.cat === i) { return; }
        S.cat = i;
        renderAll('cat:' + i);
      }, c.label);
      b.textContent = c.label || ('Section ' + (i + 1));
      host.appendChild(b);
    });
  }

  function renderList() {
    var c = S.layout[S.cat];
    $('s-lh').textContent = 'In ' + (c ? c.label : '') + ' (' + ((c && c.tiles.length) || 0) + ')';
    var host = $('s-list');
    host.innerHTML = '';
    if (!c || !c.tiles.length) {
      host.appendChild(el('div', 's-empty', 'No apps here yet. Add some from the list on the right.'));
      return;
    }
    c.tiles.forEach(function (t, i) {
      var row = el('div', 's-row');
      row.appendChild(icon(t));
      var txt = el('div', 's-txtcol');
      if (S.renaming === i) {
        var inp = el('input', 'sf s-input');
        inp.type = 'text';
        inp.value = t.name || '';
        inp.maxLength = 40;
        inp.setAttribute('data-k', 'row:' + i + ':input');
        inp.setAttribute('aria-label', 'New name');
        inp._act = function () { commitRename(); };
        inp.addEventListener('blur', function () { if (S.renaming === i) { commitRename(true); } });
        txt.appendChild(inp);
      } else {
        txt.appendChild(el('div', 's-name', t.name));
        txt.appendChild(el('div', 's-sub', describe(t)));
      }
      row.appendChild(txt);

      var b;
      b = control('div', 's-ib', 'row:' + i + ':rename', function () { startRename(i); }, 'Rename ' + t.name);
      b.innerHTML = SMALL.pencil; row.appendChild(b);
      b = control('div', 's-ib' + (i === 0 ? ' off' : ''), 'row:' + i + ':up', function () { moveTile(i, -1); }, 'Move ' + t.name + ' earlier');
      b.innerHTML = SMALL.up; row.appendChild(b);
      b = control('div', 's-ib' + (i === c.tiles.length - 1 ? ' off' : ''), 'row:' + i + ':down', function () { moveTile(i, 1); }, 'Move ' + t.name + ' later');
      b.innerHTML = SMALL.down; row.appendChild(b);
      if (lockedAt(S.cat, i)) {
        // LG Home is the way back to LG's home screen, so it can't be removed (it can be renamed and moved)
        b = el('span', 's-ib s-lock');
        b.setAttribute('aria-label', t.name + ' can\u2019t be removed');
        b.title = 'Always kept: the way back to LG\u2019s home screen';
        b.innerHTML = SMALL.lock;
      } else {
        b = control('div', 's-ib s-del', 'row:' + i + ':remove', function () { removeTile(i); }, 'Remove ' + t.name);
        b.innerHTML = SMALL.remove;
      }
      row.appendChild(b);
      host.appendChild(row);
    });
  }

  function renderSources() {
    var host = $('s-srcs');
    host.innerHTML = '';
    SOURCES.forEach(function (src) {
      var b = control('div', 's-tab' + (src.id === S.src ? ' on' : ''), 'src:' + src.id, function () {
        S.src = src.id;
        delete S.cache[src.id]; // re-read the TV / Home Assistant each time the tab is picked
        renderAll('src:' + src.id);
      }, src.label);
      b.textContent = src.label;
      host.appendChild(b);
    });
    renderSourceList();
  }

  function renderSourceList() {
    var src = null;
    SOURCES.forEach(function (s) { if (s.id === S.src) { src = s; } });
    var entry = S.cache[S.src];
    var msg = $('s-msg');
    var host = $('s-src');
    host.innerHTML = '';

    if (!entry) {
      entry = S.cache[S.src] = { loading: true };
      var which = S.src;
      src.load(function (err, items, note) {
        S.cache[which] = { items: items || [], error: err || null, note: note || '' };
        if (S.open && S.src === which) {
          var k = S.focus && S.focus.getAttribute('data-k');
          renderSourceList();
          if (k) { restoreFocus(k); }
        }
      });
      if (S.cache[which] !== entry) { return; } // answered straight away: already drawn above
    }

    msg.className = 's-msg' + (entry.error ? ' err' : '');
    if (entry.loading) { msg.textContent = 'Loading…'; return; }
    if (entry.error) { msg.textContent = entry.error; return; }
    var target = S.layout[S.cat] ? S.layout[S.cat].label : '';
    msg.textContent = (entry.note ? entry.note + '\n' : '') + 'Press OK to add to ' + target + '.';

    entry.items.forEach(function (t, i) {
      var added = inSection(t);
      var row = control('div', 's-item' + (added ? ' added' : ''), 'item:' + S.src + ':' + i, function () { addTile(t); },
        (added ? t.name + ', already added' : 'Add ' + t.name));
      row.appendChild(icon(t));
      var txt = el('div', 's-txtcol');
      txt.appendChild(el('div', 's-name', t.name));
      txt.appendChild(el('div', 's-sub', describe(t)));
      row.appendChild(txt);
      var tag = el('span', 's-add');
      tag.innerHTML = added ? SMALL.check : SMALL.plus;
      tag.appendChild(el('span', '', added ? 'Added' : 'Add'));
      row.appendChild(tag);
      host.appendChild(row);
    });
    if (!entry.items.length) { host.appendChild(el('div', 's-empty', 'Nothing to show.')); }
  }

  function renderAll(focusKey) {
    renderTop();
    renderCats();
    renderList();
    renderSources();
    restoreFocus(focusKey);
  }

  /* ---------------------------------------------------------------
     Editing
  ---------------------------------------------------------------- */
  function addTile(t) {
    var c = S.layout[S.cat];
    if (!c) { return; }
    if (inSection(t)) { T.toast(t.name + ' is already in ' + c.label, false); return; }
    c.tiles.push(clone(t));
    save();
    var k = S.focus && S.focus.getAttribute('data-k');
    renderList();
    renderSourceList();
    restoreFocus(k);
    T.toast('Added ' + t.name + ' to ' + c.label, false);
  }

  /* At least one tile must open LG Home (the way back to LG's home screen), so the last
     one can't be removed. If several tiles use LG Home's app ID, any but the last can go. */
  function lockedAt(ci, i) {
    var t = S.layout[ci] && S.layout[ci].tiles[i];
    if (!T.isLocked(t)) { return false; }
    var n = 0;
    S.layout.forEach(function (c) { (c.tiles || []).forEach(function (x) { if (T.isLocked(x)) { n++; } }); });
    return n <= 1;
  }

  function removeTile(i) {
    var c = S.layout[S.cat];
    if (lockedAt(S.cat, i)) { T.toast(c.tiles[i].name + ' can\u2019t be removed', true); return; }
    var t = c.tiles.splice(i, 1)[0];
    save();
    renderList();
    renderSourceList();
    var n = c.tiles.length;
    restoreFocus(n ? 'row:' + Math.min(i, n - 1) + ':remove' : 'cat:' + S.cat);
    T.toast('Removed ' + t.name, false);
  }

  function moveTile(i, dir) {
    var c = S.layout[S.cat];
    var j = i + dir;
    if (j < 0 || j >= c.tiles.length) { return; }
    var t = c.tiles[i];
    c.tiles[i] = c.tiles[j];
    c.tiles[j] = t;
    save();
    renderList();
    restoreFocus('row:' + j + ':' + (dir < 0 ? 'up' : 'down'));
  }

  function startRename(i) {
    S.renaming = i;
    renderList();
    var inp = root.querySelector('.s-input');
    if (inp) {
      setFocus(inp);
      inp.focus();             // brings up the TV's on-screen keyboard
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ignore */ }
    }
  }

  function commitRename(fromBlur) {
    var i = S.renaming;
    if (i < 0) { return; }
    var inp = root.querySelector('.s-input');
    var v = inp ? inp.value.replace(/\s+/g, ' ').replace(/^\s|\s$/g, '') : '';
    S.renaming = -1;
    var t = S.layout[S.cat].tiles[i];
    if (v && t && v !== t.name) { t.name = v; save(); }
    renderList();
    if (!fromBlur) { restoreFocus('row:' + i + ':rename'); }
  }

  function cancelRename() {
    var i = S.renaming;
    S.renaming = -1;
    renderList();
    restoreFocus('row:' + i + ':rename');
  }

  var resetTimer = null;
  function onReset() {
    if (!S.resetArmed) {
      S.resetArmed = true;
      renderTop();
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { S.resetArmed = false; if (root) { renderTop(); } }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    S.resetArmed = false;
    T.resetLayout();
    S.layout = T.getLayout();
    S.cat = Math.min(S.cat, S.layout.length - 1);
    renderAll('reset');
    T.toast('Back to the default apps', false);
  }

  /* ---------------------------------------------------------------
     Focus and remote navigation
  ---------------------------------------------------------------- */
  function focusables() {
    var all = (phone || root).querySelectorAll('.sf');      // only the panel's buttons while it's open
    var out = [];
    for (var i = 0; i < all.length; i++) { if (all[i].offsetParent !== null) { out.push(all[i]); } }
    return out;
  }

  function setFocus(e) {
    if (S.focus === e) { return; }
    if (S.focus) { S.focus.classList.remove('sfocus'); }
    S.focus = e || null;
    if (!e) { return; }
    e.classList.add('sfocus');
    keepVisible(e);
  }

  function restoreFocus(k) {
    var e = k ? root.querySelector('[data-k="' + k + '"]') : null;
    if (!e || e.offsetParent === null) {
      // fall back to a sensible neighbour, then to the section tab
      var m = k && /^item:([^:]+):(\d+)$/.exec(k);
      if (m) {
        var n = parseInt(m[2], 10);
        while (n > 0 && !e) { n--; e = root.querySelector('[data-k="item:' + m[1] + ':' + n + '"]'); }
        if (!e) { e = root.querySelector('[data-k="src:' + m[1] + '"]'); }
      }
      var r = k && /^row:(\d+):/.exec(k);
      if (r && !e) { e = root.querySelector('[data-k="row:' + r[1] + ':rename"]'); }   // e.g. a locked row has no remove button
    }
    if (!e || e.offsetParent === null) { e = root.querySelector('[data-k="cat:' + S.cat + '"]'); }
    // clear every highlight (the old control may still be on screen), then set the new one
    var lit = root.querySelectorAll('.sfocus');
    for (var i = 0; i < lit.length; i++) { lit[i].classList.remove('sfocus'); }
    S.focus = null;
    setFocus(e);
  }

  // Scroll a list so the focused control is in view (without scrolling the stage itself).
  function keepVisible(e) {
    var list = e.parentNode;
    while (list && list !== root && !(list.classList && list.classList.contains('s-list'))) { list = list.parentNode; }
    if (!list || list === root) { return; }
    var lr = list.getBoundingClientRect(), er = e.getBoundingClientRect();
    var scale = list.offsetHeight ? lr.height / list.offsetHeight : 1;
    var top = (er.top - lr.top) / scale, bottom = (er.bottom - lr.top) / scale;
    if (top < 8) { list.scrollTop += top - 8; }
    else if (bottom > list.clientHeight - 8) { list.scrollTop += bottom - list.clientHeight + 8; }
  }

  // Move focus to the nearest control in the pressed direction.
  function navigate(key) {
    var cur = S.focus;
    var all = focusables();
    if (!cur || all.indexOf(cur) < 0) { setFocus(all[0]); return; }
    var r = cur.getBoundingClientRect();
    var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    var best = null, bestScore = Infinity;
    // Left/Right between the two lists stays in the lists (rather than jumping to the tabs above).
    var ck = cur.getAttribute('data-k') || '';
    if ((key === KEY.LEFT || key === KEY.RIGHT) && /^(row|item):/.test(ck)) {
      var inLists = all.filter(function (e) {
        if (!/^(row|item):/.test(e.getAttribute('data-k') || '')) { return false; }
        var q = e.getBoundingClientRect();
        return key === KEY.LEFT ? q.right <= r.left + 2 : q.left >= r.right - 2;
      });
      if (inLists.length) { all = inLists.concat([cur]); }
    }
    all.forEach(function (e) {
      if (e === cur) { return; }
      var q = e.getBoundingClientRect();
      var ex = (q.left + q.right) / 2, ey = (q.top + q.bottom) / 2;
      var along, across;
      if (key === KEY.LEFT)  { if (q.right > r.left + 2)  { return; } along = cx - ex; across = Math.abs(ey - cy); }
      if (key === KEY.RIGHT) { if (q.left < r.right - 2)  { return; } along = ex - cx; across = Math.abs(ey - cy); }
      if (key === KEY.UP)    { if (q.bottom > r.top + 2)  { return; } along = cy - ey; across = Math.abs(ex - cx); }
      if (key === KEY.DOWN)  { if (q.top < r.bottom - 2)  { return; } along = ey - cy; across = Math.abs(ex - cx); }
      var score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = e; }
    });
    if (best) { setFocus(best); }
  }

  function onKey(e) {
    var k = e.keyCode;
    var typing = document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('s-input');

    if (typing) {
      if (k === KEY.ENTER) { e.preventDefault(); commitRename(); }
      else if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); cancelRename(); }
      else if (k === KEY.UP || k === KEY.DOWN) { e.preventDefault(); commitRename(); navigate(k); }
      // Left/Right move the text cursor; other keys type.
      return;
    }
    if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) {
      e.preventDefault();
      navigate(k);
    } else if (k === KEY.ENTER) {
      e.preventDefault();
      if (S.focus && S.focus._act) { S.focus._act(); }
    } else if (k === KEY.BACK || k === KEY.ESC || k === KEY.RED) {
      e.preventDefault();
      if (phone) { closePhone(); } else { close(); }
    }
  }

  /* ---------------------------------------------------------------
     Open / close
  ---------------------------------------------------------------- */
  function open(catIndex) {
    if (!root) { build(); }
    S.open = true;
    S.layout = T.getLayout();
    S.layout.forEach(function (c) { if (!c.tiles) { c.tiles = []; } });
    S.cat = Math.max(0, Math.min(catIndex || 0, S.layout.length - 1));
    S.renaming = -1;
    S.resetArmed = false;
    S.cache = {};
    S.focus = null;
    root.classList.add('show');
    renderAll('cat:' + S.cat);
  }

  function close() {
    if (phone) { phone.parentNode.removeChild(phone); phone = null; }
    if (!S.open) { return; }
    if (S.renaming >= 0) { commitRename(true); }
    S.open = false;
    root.classList.remove('show');
    if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
    T.rerender();
  }

  // Icons arrived in the background: redraw the lists, keeping focus (and any rename in progress).
  function iconsChanged() {
    if (!S.open) { return; }
    var k = S.focus && S.focus.getAttribute('data-k');
    if (S.renaming < 0) { renderList(); }
    renderSourceList();
    if (k && S.renaming < 0) { restoreFocus(k); }
  }

  window.TVHOME_SETTINGS = {
    iconsChanged: iconsChanged,
    open: open,
    close: close,
    onKey: onKey,
    isOpen: function () { return S.open; }
  };
})();
