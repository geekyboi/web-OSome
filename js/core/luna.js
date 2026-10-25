/* Talking to the TV: webOS's Luna service bus (what LG's webOSTV.js wraps). */
'use strict';

/* ---------------------------------------------------------------
   Luna service bridge (what webOSTV.js wraps). Absent in a desktop
   browser, where we fall back to a preview message.
---------------------------------------------------------------- */
function luna(uri, params, cb, timeoutMs) {
  if (typeof window.PalmServiceBridge === 'undefined') {
    cb({ returnValue: true, preview: true });
    return;
  }
  var done = false;
  try {
    var bridge = new window.PalmServiceBridge();
    bridge.onservicecallback = function (msg) {
      if (done) { return; }
      done = true;
      var res;
      try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false, errorText: 'Bad response' }; }
      cb(res);
    };
    bridge.call(uri, JSON.stringify(params));
    // Some calls never answer once the app is backgrounded; do not hang on that.
    setTimeout(function () {
      if (!done) { done = true; cb({ returnValue: true, noReply: true }); }
    }, timeoutMs || 3000);
  } catch (err) {
    done = true;
    cb({ returnValue: false, errorText: String(err) });
  }
}

// Launch a TV app or input by its id, e.g. launchApp('netflix') or launchApp('com.webos.app.hdmi2').
function launchApp(id, params, cb) {
  luna('luna://com.webos.applicationManager/launch', { id: id, params: params || {} }, cb);
}
