/* Web editor: the tabs, and start-up. Loaded last. */
'use strict';

/* ---------- tabs and start ---------- */
var tab = 'home';
Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
  b.addEventListener('click', function () {
    tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) {
      var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#tab-home').hidden = tab !== 'home';
    $('#tab-settings').hidden = tab !== 'settings';
  });
});
$('#save').addEventListener('click', function () { save(); });
window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// Redraw both tabs and the save status.
function render() { renderHome(); renderSettings(); showStatus(); }

window.TVHOME_EDITOR = { plugin: registerPlugin, get draft() { return draft; }, get dirty() { return dirty; } };   // (draft, dirty: for tests)

Promise.all([
  api('/api/state'),
  api('/api/apps').catch(function () { return { apps: [], inputs: [], error: 'unavailable' }; }),
  refreshFiles(),
  loadPlugins(),
  refreshTok()
]).then(function (r) {
  server = r[0].doc; apps = r[1]; setDraftFrom(server);
  render();
  setInterval(poll, 5000);
}, function (e) { toast(e.message, true); });
