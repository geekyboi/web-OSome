/* How the background picture is laid out. Shared by the TV (the screen itself, the glass
   behind the panels, and the text-brightness check) and the web editor (its preview), so
   they always agree. ES5.

   opts: { fit: 'fill' | 'fit' | 'stretch' | 'center' | 'tile',
           edge: 'colour' | 'blur'   (what shows around a picture that doesn't cover the screen)
           colour: '#rrggbb' }       (that colour, and the whole background when there's no picture) */
(function () {
  var FITS = ['fill', 'fit', 'stretch', 'center', 'tile'];

  function opts(s) {
    s = s || {};
    return {
      fit: FITS.indexOf(s.bgFit) >= 0 ? s.bgFit : 'fill',
      edge: s.bgEdge === 'blur' ? 'blur' : 'colour',
      colour: /^#[0-9a-f]{6}$/i.test(s.bgColour || '') ? s.bgColour : '#000000'
    };
  }

  // Identifies one look (picture + layout), e.g. to know a saved brightness check still applies.
  function key(s) {
    var o = opts(s);
    return (s && s.background || '') + '|' + o.fit + '|' + (o.fit === 'fit' || o.fit === 'center' || o.fit === 'tile' ? o.edge + o.colour : '');
  }

  // Draw the background into a W x H area that stands for the 1920 x 1080 screen.
  function draw(ctx, W, H, img, o) {
    o = o || opts();
    var k = W / 1920;                                   // screen pixels -> this canvas
    ctx.save();
    ctx.fillStyle = o.colour;
    ctx.fillRect(0, 0, W, H);
    var iw = img && (img.naturalWidth || img.width), ih = img && (img.naturalHeight || img.height);
    if (!iw || !ih) { ctx.restore(); return; }

    function centred(s) {
      var w = iw * s, hh = ih * s;
      ctx.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh);
      return w < W - 0.5 || hh < H - 0.5;               // leaves an edge showing?
    }
    // A soft, darkened copy of the picture covering the screen. Done by shrinking it to a few
    // dozen pixels and scaling it back up smoothly: canvas blur filters aren't supported
    // everywhere (Safari on iPhone ignores them), and this looks the same on the TV and phone.
    function blurredEdge() {
      var sw = 40, sh = Math.max(4, Math.round(40 * H / W));
      var small = document.createElement('canvas');
      small.width = sw; small.height = sh;
      var sc = small.getContext('2d');
      if (!sc) { return; }
      sc.imageSmoothingEnabled = true;
      try { sc.imageSmoothingQuality = 'high'; } catch (e) { /* optional */ }
      var s = Math.max(sw / iw, sh / ih) * 1.1;         // cover, a little bigger so edges aren't hard
      sc.drawImage(img, (sw - iw * s) / 2, (sh - ih * s) / 2, iw * s, ih * s);
      // a second, smaller pass makes the blur smoother
      var tiny = document.createElement('canvas');
      tiny.width = Math.max(2, Math.round(sw / 2)); tiny.height = Math.max(2, Math.round(sh / 2));
      var tc = tiny.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.drawImage(small, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch (e2) { /* optional */ }
      ctx.drawImage(tiny, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';             // darker, so the real picture stands out
      ctx.fillRect(0, 0, W, H);
    }

    if (o.fit === 'stretch') {
      ctx.drawImage(img, 0, 0, W, H);
    } else if (o.fit === 'fit' || o.fit === 'center') {
      var s = o.fit === 'fit' ? Math.min(W / iw, H / ih) : k;   // centre = the picture's own size
      var w = iw * s, hh = ih * s;
      if (o.edge === 'blur' && (w < W - 0.5 || hh < H - 0.5)) { blurredEdge(); }
      centred(s);
    } else if (o.fit === 'tile') {
      // own size, but shrunk to fit the screen if it's bigger; repeated from the centre outwards
      var ts = Math.min(k, W / iw, H / ih);
      var tw = Math.max(2, iw * ts), th = Math.max(2, ih * ts);
      var x0 = (W - tw) / 2, y0 = (H - th) / 2;
      x0 -= Math.ceil(x0 / tw) * tw; y0 -= Math.ceil(y0 / th) * th;
      for (var y = y0; y < H; y += th) {
        for (var x = x0; x < W; x += tw) { ctx.drawImage(img, x, y, tw, th); }
      }
    } else {                                              // fill: cover the screen, cropping the overflow
      centred(Math.max(W / iw, H / ih));
    }
    ctx.restore();
  }

  window.TVBG = { opts: opts, key: key, draw: draw, FITS: FITS };
})();
