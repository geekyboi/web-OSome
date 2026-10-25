/* Web editor: saving to the TV, and noticing changes made on the TV meanwhile. */
'use strict';

/* ---------- saving and syncing ---------- */
function save(overwriteRev) {
  if (!draft || saving) { return; }
  saving = true; showStatus();
  var base = overwriteRev != null ? overwriteRev : (server ? server.rev : 0);
  api('/api/state', { method: 'PUT', json: { doc: draft, baseRev: base } }).then(function (r) {
    saving = false; server = r.doc; setDraftFrom(server); hideBanner(); render();
    toast('Saved. The TV has updated.');
  }, function (e) {
    saving = false; showStatus();
    if (e.status === 409) { conflict(e.body.doc); return; }
    toast(e.message, true);
  });
}
// The TV saved too: offer to use its version or keep ours.
function conflict(tvDoc) {
  showBanner('This home screen was changed on the TV while you were editing.', [
    ['Use the TV’s version', function () { server = tvDoc; setDraftFrom(server); hideBanner(); render(); }],
    ['Keep mine', function () { hideBanner(); save(tvDoc ? tvDoc.rev : 0); }]
  ]);
}
// A banner at the top with a message and buttons: [[label, onclick], ...].
function showBanner(msg, buttons) {
  var b = $('#banner');
  b.innerHTML = '';
  b.appendChild(h('span', { text: msg, style: 'flex:1;min-width:200px' }));
  buttons.forEach(function (x) { b.appendChild(h('button', { class: 'btn', type: 'button', text: x[0], onclick: x[1] })); });
  b.hidden = false;
}
// Hide the banner.
function hideBanner() { $('#banner').hidden = true; }

// Every few seconds: pick up changes made on the TV, and plugins being added or removed.
function poll() {
  if (saving || document.hidden) { return; }
  api('/api/state').then(function (r) {
    if (r.plugins != null && r.plugins !== pluginsRev) {      // a plugin was added, removed or changed
      pluginsRev = r.plugins;
      loadPlugins().then(function () { renderSettings(); });
    }
    var d = r.doc;
    if (!d || (server && d.rev === server.rev)) { return; }
    if (!dirty) { server = d; setDraftFrom(d); render(); toast('Updated from the TV'); }
    else { conflict(d); }
  }, function () { /* TV asleep or offline: try again later */ });
}
