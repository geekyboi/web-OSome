/* TV Home: a small QR code generator (byte mode, error correction level M, versions 1-10,
   i.e. up to 213 bytes, plenty for a URL with a password). Plain ES5, no dependencies.
     var q = TVQR.encode('http://192.168.1.50:8419/?key=ABCD2345');
     q.size            modules per side (21..57)
     q.dark(x, y)      true for a dark module
     TVQR.draw(canvas, text, pixelsPerModule)   renders with a 4-module quiet zone */
(function (root) {
  'use strict';

  // ---- Galois field GF(256), polynomial 0x11D ----
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) { x ^= 0x11D; }
    }
    for (i = 255; i < 512; i++) { EXP[i] = EXP[i - 255]; }
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenerator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1);
      for (var j = 0; j < next.length; j++) { next[j] = 0; }
      for (j = 0; j < g.length; j++) {
        next[j] ^= g[j];                       // * x
        next[j + 1] ^= gmul(g[j], EXP[i]);     // * alpha^i
      }
      g = next;
    }
    return g;                                  // highest degree first, g[0] = 1
  }
  function rsRemainder(data, n) {
    var gen = rsGenerator(n);
    var rem = new Array(n);
    for (var i = 0; i < n; i++) { rem[i] = 0; }
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      for (var j = 0; j < n; j++) { rem[j] ^= gmul(gen[j + 1], factor); }
    }
    return rem;
  }

  // ---- Level M block structure, versions 1-10: [ec codewords per block, [blocks, data codewords]...] ----
  var BLOCKS_M = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function dataCapacity(v) {
    var b = BLOCKS_M[v], n = 0;
    for (var i = 1; i < b.length; i++) { n += b[i][0] * b[i][1]; }
    return n;
  }

  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        c = 0x10000 + ((c - 0xD800) << 10) + (str.charCodeAt(++i) - 0xDC00);
      }
      if (c < 0x80) { out.push(c); }
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c < 0x10000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
      else { out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }

  function codewords(bytes, v) {
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) { bits.push((val >> i) & 1); } }
    put(4, 4);                                  // byte mode
    put(bytes.length, v < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) { put(bytes[i], 8); }
    var cap = dataCapacity(v) * 8;
    put(0, Math.min(4, cap - bits.length));     // terminator
    while (bits.length % 8) { bits.push(0); }
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) { b = (b << 1) | bits[i + j]; }
      data.push(b);
    }
    for (var pad = 0; data.length < cap / 8; pad++) { data.push(pad % 2 ? 0x11 : 0xEC); }

    // split into blocks, add error correction, interleave
    var spec = BLOCKS_M[v], ecLen = spec[0], blocks = [], ecs = [], k = 0, maxLen = 0;
    for (i = 1; i < spec.length; i++) {
      for (j = 0; j < spec[i][0]; j++) {
        var blk = data.slice(k, k + spec[i][1]);
        k += spec[i][1];
        blocks.push(blk);
        ecs.push(rsRemainder(blk, ecLen));
        maxLen = Math.max(maxLen, blk.length);
      }
    }
    var out = [];
    for (i = 0; i < maxLen; i++) { for (j = 0; j < blocks.length; j++) { if (i < blocks[j].length) { out.push(blocks[j][i]); } } }
    for (i = 0; i < ecLen; i++) { for (j = 0; j < ecs.length; j++) { out.push(ecs[j][i]); } }
    return out;
  }

  function bch(value, poly, polyDegree) {
    var v = value << polyDegree;
    var top = 1 << polyDegree;
    for (var d = 31; d >= polyDegree; d--) { if (v & (1 << d)) { v ^= poly << (d - polyDegree); } }
    return (value << polyDegree) | v;
  }

  function Matrix(v) {
    this.v = v;
    this.size = 17 + 4 * v;
    this.m = []; this.fn = [];
    for (var i = 0; i < this.size; i++) {
      this.m.push(new Array(this.size)); this.fn.push(new Array(this.size));
      for (var j = 0; j < this.size; j++) { this.m[i][j] = false; this.fn[i][j] = false; }
    }
  }
  Matrix.prototype.set = function (x, y, dark) { this.m[y][x] = !!dark; this.fn[y][x] = true; };

  function buildFunction(M) {
    var n = M.size, v = M.v, i, j, x, y;
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) { continue; }
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          M.set(xx, yy, d !== 2 && d !== 4);
        }
      }
    }
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    for (i = 8; i < n - 8; i++) { M.set(i, 6, i % 2 === 0); M.set(6, i, i % 2 === 0); }   // timing
    var al = ALIGN[v];
    for (i = 0; i < al.length; i++) {
      for (j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) { continue; }
        for (y = -2; y <= 2; y++) {
          for (x = -2; x <= 2; x++) { M.set(al[i] + x, al[j] + y, Math.max(Math.abs(x), Math.abs(y)) !== 1); }
        }
      }
    }
    // reserve format areas (filled in later) and the dark module
    for (i = 0; i < 9; i++) { if (!M.fn[8][i]) { M.set(i, 8, false); } if (!M.fn[i][8]) { M.set(8, i, false); } }
    for (i = 0; i < 8; i++) { M.set(n - 1 - i, 8, false); M.set(8, n - 1 - i, false); }
    M.set(8, n - 8, true);
    if (v >= 7) {
      var vi = bch(v, 0x1F25, 12);
      for (i = 0; i < 18; i++) {
        var bit = (vi >> i) & 1, a = n - 11 + (i % 3), b = Math.floor(i / 3);
        M.set(a, b, bit); M.set(b, a, bit);
      }
    }
  }

  function drawFormat(M, mask) {
    var n = M.size;
    var f = bch((0 << 3) | mask, 0x537, 10) ^ 0x5412;      // level M = 00
    function bit(i) { return ((f >> i) & 1) === 1; }
    for (var i = 0; i <= 5; i++) { M.set(8, i, bit(i)); }
    M.set(8, 7, bit(6)); M.set(8, 8, bit(7)); M.set(7, 8, bit(8));
    for (i = 9; i < 15; i++) { M.set(14 - i, 8, bit(i)); }
    for (i = 0; i < 8; i++) { M.set(n - 1 - i, 8, bit(i)); }
    for (i = 8; i < 15; i++) { M.set(8, n - 15 + i, bit(i)); }
    M.set(8, n - 8, true);
  }

  function placeData(M, cw) {
    var n = M.size, k = 0, total = cw.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) { right = 5; }
      for (var vert = 0; vert < n; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? n - 1 - vert : vert;
          if (M.fn[y][x]) { continue; }
          var dark = k < total ? ((cw[k >> 3] >> (7 - (k & 7))) & 1) === 1 : false;
          M.m[y][x] = dark;
          k++;
        }
      }
    }
  }

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
    function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
    function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; }
  ];
  function applyMask(M, mask) {
    for (var y = 0; y < M.size; y++) {
      for (var x = 0; x < M.size; x++) {
        if (!M.fn[y][x] && MASKS[mask](x, y)) { M.m[y][x] = !M.m[y][x]; }
      }
    }
  }

  function penalty(M) {
    var n = M.size, m = M.m, p = 0, x, y, run, i;
    for (y = 0; y < n; y++) {                       // rule 1: runs of 5+ in rows and columns
      for (var dir = 0; dir < 2; dir++) {
        run = 1;
        for (x = 1; x < n; x++) {
          var a = dir ? m[x][y] : m[y][x], b = dir ? m[x - 1][y] : m[y][x - 1];
          if (a === b) { run++; } else { if (run >= 5) { p += run - 2; } run = 1; }
        }
        if (run >= 5) { p += run - 2; }
      }
    }
    for (y = 0; y < n - 1; y++) {                   // rule 2: 2x2 blocks
      for (x = 0; x < n - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) { p += 3; }
      }
    }
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (y = 0; y < n; y++) {                       // rule 3: finder-like patterns
      for (x = 0; x <= n - 11; x++) {
        for (var d = 0; d < 2; d++) {
          var ok1 = true, ok2 = true;
          for (i = 0; i < 11; i++) {
            var v = (d ? m[x + i][y] : m[y][x + i]) ? 1 : 0;
            if (v !== pat1[i]) { ok1 = false; }
            if (v !== pat2[i]) { ok2 = false; }
          }
          if (ok1) { p += 40; }
          if (ok2) { p += 40; }
        }
      }
    }
    var darkCount = 0;                              // rule 4: balance
    for (y = 0; y < n; y++) { for (x = 0; x < n; x++) { if (m[y][x]) { darkCount++; } } }
    p += Math.floor(Math.abs(darkCount * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  function encode(text) {
    var bytes = utf8(String(text));
    var v = 1;
    while (v <= 10 && dataCapacity(v) < bytes.length + 2 + (v < 10 ? 0 : 1)) { v++; }
    if (v > 10) { throw new Error('Text too long for a QR code here'); }
    var cw = codewords(bytes, v);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var M = new Matrix(v);
      buildFunction(M);
      placeData(M, cw);
      applyMask(M, mask);
      drawFormat(M, mask);
      var s = penalty(M);
      if (s < bestScore) { bestScore = s; best = M; }
    }
    return {
      size: best.size,
      version: v,
      dark: function (x, y) { return best.m[y][x]; }
    };
  }

  function draw(canvas, text, scale) {
    var q = encode(text), quiet = 4, s = scale || 8, total = (q.size + quiet * 2) * s;
    canvas.width = total; canvas.height = total;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = '#000000';
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.dark(x, y)) { ctx.fillRect((x + quiet) * s, (y + quiet) * s, s, s); }
      }
    }
    return q;
  }

  var api = { encode: encode, draw: draw };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.TVQR = api;
})(typeof window !== 'undefined' ? window : this);
