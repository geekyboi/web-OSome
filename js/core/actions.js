/* What a tile does when you press OK: launch apps and call Home Assistant webhooks. */
'use strict';

/* ---------------------------------------------------------------
   Home Assistant webhooks
   mode:'no-cors' lets the request leave the TV without HA having to
   send CORS headers. The trade-off: the response is opaque, so we can
   tell "request sent" from "couldn't reach HA", but not HTTP 404/200.
   The body (if any) is form-encoded, which HA exposes as trigger.data.
---------------------------------------------------------------- */
function webhookUrl(a) {
  if (a.url) { return a.url; }
  var base = String(HA.url || '').replace(/\/+$/, '');
  return base + '/api/webhook/' + encodeURIComponent(a.webhook);
}

// Send one webhook step ({ webhook } or { url }, optional method and data). cb(true) if it left the TV,
// cb(false) if Home Assistant couldn't be reached (we can't see the HTTP status, see above).
function sendWebhook(a, cb) {
  var url = webhookUrl(a);
  var method = String(a.method || 'POST').toUpperCase();
  var opts = { method: method, mode: 'no-cors', cache: 'no-store' };

  if (method !== 'GET' && a.data) {
    var body = new URLSearchParams();
    for (var k in a.data) {
      if (Object.prototype.hasOwnProperty.call(a.data, k)) { body.append(k, String(a.data[k])); }
    }
    opts.body = body;
  }

  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (ctl) { opts.signal = ctl.signal; }
  var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, HA.timeoutMs || 4000);

  fetch(url, opts).then(
    function () { clearTimeout(timer); cb(true); },
    function () { clearTimeout(timer); cb(false); }
  );
}

// The dot in the status capsule: can the TV reach Home Assistant at all?
function checkHA() {
  var dot = $('hadot');
  if (!HA.url) { dot.className = ''; dot.parentNode.classList.remove('bad'); return; }
  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, 3000);
  var opts = { method: 'GET', mode: 'no-cors', cache: 'no-store' };
  if (ctl) { opts.signal = ctl.signal; }
  fetch(String(HA.url).replace(/\/+$/, '') + '/api/', opts).then(
    function () { clearTimeout(timer); dot.className = 'ok'; dot.parentNode.classList.remove('bad'); $('status').title = 'Home Assistant reachable'; layoutRegion('status'); },
    function () { clearTimeout(timer); dot.className = 'bad'; dot.parentNode.classList.add('bad'); $('status').title = 'Home Assistant not reachable'; layoutRegion('status'); }
  );
}

/* ---------------------------------------------------------------
   Actions
---------------------------------------------------------------- */
function actionsFor(tile) {
  if (tile.actions && tile.actions.length) { return tile.actions; }
  var list = [];
  if (tile.webhook) { list.push({ webhook: tile.webhook }); }
  if (tile.app) { list.push({ app: tile.app, params: tile.params }); }
  return list;
}

var toastTimer = null;
// Show a short message at the bottom of the screen. isError makes it red and keeps it up longer.
function toast(msg, isError) {
  var t = $('toast');
  t.textContent = msg;
  t.className = (isError ? 'error ' : '') + 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = isError ? 'error' : ''; }, isError ? 4500 : 2200);
}

// Do everything a tile asks for, in order: webhooks are fired without waiting, apps are
// launched, { delay } waits. Shows one toast at the end (an error, a preview note or "Sent").
function runActions(tile) {
  var list = actionsFor(tile);
  var i = 0;
  var sentWebhooks = 0;
  var errors = [];
  var launched = false;
  var previewNote = null;

  function finish() {
    if (errors.length) { toast(errors[0], true); return; }
    if (previewNote) { toast(previewNote, false); return; }
    if (!launched && sentWebhooks) { toast('Sent · ' + tile.name, false); }
  }

  function next() {
    if (i >= list.length) {
      // Webhook results arrive asynchronously; give failures a moment to surface.
      if (sentWebhooks && !launched) { setTimeout(finish, 450); } else { finish(); }
      return;
    }
    var a = list[i++];

    if (a.delay) { setTimeout(next, a.delay); return; }

    if (a.webhook || a.url) {
      sentWebhooks++;
      sendWebhook(a, function (ok) {
        if (!ok) {
          errors.push('Couldn’t reach Home Assistant');
          if (launched) { toast(errors[0], true); }
        }
      });
      next(); // fire and move on; do not hold up the launch
      return;
    }

    if (a.app) {
      var go = function () {
        launchApp(a.app, a.params, function (res) {
          launched = true;
          if (res.preview) {
            previewNote = 'Preview: would launch ' + a.app;
          } else if (res.returnValue === false) {
            errors.push('Couldn’t launch ' + tile.name + (res.errorText ? ' (' + res.errorText + ')' : ''));
          }
          next();
        });
      };
      // Let any webhook request leave the TV before the app goes to the background.
      if (sentWebhooks) { setTimeout(go, 250); } else { go(); }
      return;
    }

    next();
  }

  next();
}
