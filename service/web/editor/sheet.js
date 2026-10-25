/* Web editor: the pop-up sheet used for adding and editing apps. */
'use strict';

/* ---------- sheet (dialog) ---------- */
var sheetOnClose = null;
// Open the pop-up sheet: a title, the body element, footer buttons, and onClose (optional).
function openSheet(title, body, foot, onClose) {
  $('#sheet-title').textContent = title;
  var b = $('#sheet-body'), f = $('#sheet-foot');
  b.innerHTML = ''; f.innerHTML = '';
  b.appendChild(body);
  (foot || []).forEach(function (x) { if (x) { f.appendChild(x); } });
  f.hidden = !(foot && foot.length);
  sheetOnClose = onClose || null;
  $('#sheet').hidden = false;
  b.scrollTop = 0;
}
// Close the sheet.
function closeSheet() {
  $('#sheet').hidden = true;
  var cb = sheetOnClose; sheetOnClose = null;
  if (cb) { cb(); }
}
document.addEventListener('click', function (e) { if (e.target.hasAttribute && e.target.hasAttribute('data-close')) { closeSheet(); } });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); } });
