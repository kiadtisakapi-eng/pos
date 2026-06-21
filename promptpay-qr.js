/**
 * promptpay-qr.js — Standalone PromptPay (EMVCo) + QR Code (ISO/IEC 18004) generator
 * No dependencies. Exposes window.PromptPayQR
 *   - buildPayload(target, amount)  -> EMVCo payload string (scannable by Thai banking apps)
 *   - generateMatrix(text, ecLevel) -> { size, modules:boolean[][], version }
 *   - svg(text, opts)               -> SVG string
 *   - crc16(str)                    -> CRC16-CCITT-FALSE (hex)
 */
(function (global) {
  'use strict';

  // ---------------- GF(256) ----------------
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenPoly(deg) {
    var g = [1];
    for (var i = 0; i < deg; i++) {
      var ng = new Array(g.length + 1); for (var k = 0; k < ng.length; k++) ng[k] = 0;
      for (var j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= gmul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function rsEncode(data, ecLen) {
    var gen = rsGenPoly(ecLen);
    var res = new Array(data.length + ecLen); for (var i = 0; i < res.length; i++) res[i] = 0;
    for (var i = 0; i < data.length; i++) res[i] = data[i];
    for (var i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef !== 0) for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
    }
    return res.slice(data.length);
  }

  // EC block table: per version -> [nBlk1, dataPerBlk1, nBlk2, dataPerBlk2, ecPerBlk]
  var EC = {
    L: [[1,19,0,0,7],[1,34,0,0,10],[1,55,0,0,15],[1,80,0,0,20],[1,108,0,0,26],
        [2,68,0,0,18],[2,78,0,0,20],[2,97,0,0,24],[2,116,0,0,30],[2,68,2,69,18]],
    M: [[1,16,0,0,10],[1,28,0,0,16],[1,44,0,0,26],[2,32,0,0,18],[2,43,0,0,24],
        [4,27,0,0,16],[4,31,0,0,18],[2,38,2,39,22],[3,36,2,37,22],[4,43,1,44,26]]
  };
  var ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

  function dataCapacity(ver, lvl) { var t = EC[lvl][ver - 1]; return t[0]*t[1] + t[2]*t[3]; }

  // ---------------- BCH ----------------
  function bchFormat(ecBits, mask) {
    var d = ((ecBits << 3) | mask) & 0x1f;
    var rem = d << 10;
    for (var i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
    return ((d << 10) | rem) ^ 0x5412;
  }
  function bchVersion(ver) {
    var rem = ver << 12;
    for (var i = 17; i >= 12; i--) if (rem & (1 << i)) rem ^= 0x1f25 << (i - 12);
    return (ver << 12) | rem;
  }
  var EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // ---------------- bit buffer / data codewords ----------------
  function buildDataCodewords(bytes, ver, lvl) {
    var cap = dataCapacity(ver, lvl);
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(0b0100, 4);                 // byte mode
    push(bytes.length, ver <= 9 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    // terminator
    var capBits = cap * 8;
    for (var t = 0; t < 4 && bits.length < capBits; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
    var pad = [0xEC, 0x11], pi = 0;
    while (cw.length < cap) { cw.push(pad[pi]); pi ^= 1; }
    return cw;
  }

  function interleave(cw, ver, lvl) {
    var t = EC[lvl][ver - 1];
    var blocks = [], ecs = [], idx = 0;
    var specs = [];
    for (var b = 0; b < t[0]; b++) specs.push(t[1]);
    for (var b = 0; b < t[2]; b++) specs.push(t[3]);
    for (var s = 0; s < specs.length; s++) {
      var d = cw.slice(idx, idx + specs[s]); idx += specs[s];
      blocks.push(d); ecs.push(rsEncode(d, t[4]));
    }
    var out = [];
    var maxD = Math.max.apply(null, specs);
    for (var i = 0; i < maxD; i++) for (var b = 0; b < blocks.length; b++) if (i < blocks[b].length) out.push(blocks[b][i]);
    for (var i = 0; i < t[4]; i++) for (var b = 0; b < ecs.length; b++) out.push(ecs[b][i]);
    return out;
  }

  // ---------------- matrix ----------------
  function newMat(size, v) { var m = []; for (var r = 0; r < size; r++) { m.push(new Array(size).fill(v)); } return m; }

  function placeFunction(mat, resv, size, ver) {
    function finder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                 (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        mat[rr][cc] = on ? 1 : 0; resv[rr][cc] = true;
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    // timing
    for (var i = 8; i < size - 8; i++) { var b = (i % 2 === 0) ? 1 : 0; mat[6][i] = b; resv[6][i] = true; mat[i][6] = b; resv[i][6] = true; }
    // alignment
    var pos = ALIGN[ver - 1];
    for (var a = 0; a < pos.length; a++) for (var bb = 0; bb < pos.length; bb++) {
      var ar = pos[a], ac = pos[bb];
      if (resv[ar][ac]) continue; // skip overlap with finders
      for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
        var rr = ar + dr, cc = ac + dc;
        var on = (Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        mat[rr][cc] = on ? 1 : 0; resv[rr][cc] = true;
      }
    }
    // dark module
    mat[size - 8][8] = 1; resv[size - 8][8] = true;
    // reserve format info
    for (var i = 0; i < 9; i++) { if (!resv[8][i]) { resv[8][i] = true; } if (!resv[i][8]) { resv[i][8] = true; } }
    for (var i = 0; i < 8; i++) { resv[8][size - 1 - i] = true; resv[size - 1 - i][8] = true; }
    // reserve version info
    if (ver >= 7) {
      for (var i = 0; i < 18; i++) { var a2 = Math.floor(i / 3), b2 = i % 3; resv[b2][size - 11 + a2] = true; resv[size - 11 + a2][b2] = true; }
    }
  }

  function placeData(mat, resv, codewords) {
    var size = mat.length;
    var bits = [];
    for (var i = 0; i < codewords.length; i++) for (var j = 7; j >= 0; j--) bits.push((codewords[i] >> j) & 1);
    var bi = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col = 5;
      for (var k = 0; k < size; k++) {
        var row = up ? size - 1 - k : k;
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (!resv[row][cc]) { mat[row][cc] = (bi < bits.length) ? bits[bi++] : 0; }
        }
      }
      up = !up;
    }
  }

  function maskFn(m, r, c) {
    switch (m) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function applyFormat(mat, resv, size, ecLvl, mask) {
    var fmt = bchFormat(EC_BITS[ecLvl], mask);
    for (var i = 0; i < 15; i++) {
      var bit = (fmt >> i) & 1;
      // copy 1
      if (i < 6) mat[8][i] = bit;
      else if (i === 6) mat[8][7] = bit;
      else if (i === 7) mat[8][8] = bit;
      else if (i === 8) mat[7][8] = bit;
      else mat[14 - i][8] = bit;
      // copy 2
      if (i < 7) mat[size - 1 - i][8] = bit;
      else mat[8][size - 15 + i] = bit;
    }
    mat[size - 8][8] = 1;
  }

  function applyVersion(mat, size, ver) {
    if (ver < 7) return;
    var vi = bchVersion(ver);
    for (var i = 0; i < 18; i++) {
      var bit = (vi >> i) & 1, a = Math.floor(i / 3), b = i % 3;
      mat[b][size - 11 + a] = bit;
      mat[size - 11 + a][b] = bit;
    }
  }

  function penalty(mat) {
    var size = mat.length, p = 0, r, c, i;
    // rule 1: runs
    for (r = 0; r < size; r++) { var run = 1; for (c = 1; c < size; c++) { if (mat[r][c] === mat[r][c-1]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; } } if (run >= 5) p += 3 + (run - 5); }
    for (c = 0; c < size; c++) { var run = 1; for (r = 1; r < size; r++) { if (mat[r][c] === mat[r-1][c]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; } } if (run >= 5) p += 3 + (run - 5); }
    // rule 2: 2x2 blocks
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) { var v = mat[r][c]; if (v === mat[r][c+1] && v === mat[r+1][c] && v === mat[r+1][c+1]) p += 3; }
    // rule 3: finder-like pattern 1011101 0000 or reverse
    var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    function match(arr, get) { for (var k = 0; k < 11; k++) if (get(k) !== arr[k]) return false; return true; }
    for (r = 0; r < size; r++) for (c = 0; c <= size - 11; c++) { if (match(pat1, k => mat[r][c+k]) || match(pat2, k => mat[r][c+k])) p += 40; }
    for (c = 0; c < size; c++) for (r = 0; r <= size - 11; r++) { if (match(pat1, k => mat[r+k][c]) || match(pat2, k => mat[r+k][c])) p += 40; }
    // rule 4: dark ratio
    var dark = 0; for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += mat[r][c];
    var pct = dark * 100 / (size * size);
    var dev = Math.floor(Math.abs(pct - 50) / 5) * 10; p += dev;
    return p;
  }

  function chooseVersion(len, lvl) {
    for (var v = 1; v <= 10; v++) {
      var cap = dataCapacity(v, lvl);
      var headerBytes = 1 + (v <= 9 ? 1 : 2); // mode(4b)+count -> approx; compute precisely below
      // precise bit count: 4 + (v<=9?8:16) + len*8 ; need <= cap*8
      var needBits = 4 + (v <= 9 ? 8 : 16) + len * 8;
      if (needBits <= cap * 8) return v;
    }
    throw new Error('data too long for v<=10');
  }

  function toBytes(str) {
    // UTF-8 (PromptPay is ASCII, but be safe)
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return out;
  }

  function generateMatrix(text, ecLevel) {
    ecLevel = ecLevel || 'L';
    var bytes = toBytes(text);
    var ver = chooseVersion(bytes.length, ecLevel);
    var size = 17 + 4 * ver;
    var cw = buildDataCodewords(bytes, ver, ecLevel);
    var full = interleave(cw, ver, ecLevel);

    // base matrix with function patterns + data (unmasked)
    var base = newMat(size, 0), resv = newMat(size, false);
    placeFunction(base, resv, size, ver);
    placeData(base, resv, full);

    // try masks
    var best = null, bestPen = Infinity, bestMask = 0;
    for (var m = 0; m < 8; m++) {
      var mat = []; for (var r = 0; r < size; r++) mat.push(base[r].slice());
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (!resv[r][c] && maskFn(m, r, c)) mat[r][c] ^= 1;
      applyFormat(mat, resv, size, ecLevel, m);
      applyVersion(mat, size, ver);
      var pen = penalty(mat);
      if (pen < bestPen) { bestPen = pen; best = mat; bestMask = m; }
    }
    var modules = []; for (var r = 0; r < size; r++) { modules.push(best[r].map(function (x) { return x === 1; })); }
    return { size: size, modules: modules, version: ver, mask: bestMask, ecLevel: ecLevel };
  }

  function svg(text, opts) {
    opts = opts || {};
    var ec = opts.ecLevel || 'L';
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var dark = opts.dark || '#111827';
    var light = opts.light || '#ffffff';
    var r = generateMatrix(text, ec);
    var n = r.size, dim = n + quiet * 2;
    var rects = '';
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (r.modules[y][x]) {
          var w = 1; while (x + w < n && r.modules[y][x + w]) w++;
          rects += '<rect x="' + (x + quiet) + '" y="' + (y + quiet) + '" width="' + w + '" height="1" shape-rendering="crispEdges"/>';
          x += w;
        } else x++;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="100%" height="100%">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
      '<g fill="' + dark + '">' + rects + '</g></svg>';
  }

  // ---------------- CRC16-CCITT-FALSE ----------------
  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  // ---------------- PromptPay EMVCo payload ----------------
  function tlv(id, val) { return id + String(val.length).padStart(2, '0') + val; }

  function buildPayload(target, amount) {
    var clean = String(target).replace(/[^0-9]/g, '');
    var acc;
    if (clean.length >= 15) {
      acc = tlv('03', clean.slice(0, 15));               // e-Wallet ID (15)
    } else if (clean.length === 13) {
      acc = tlv('02', clean);                            // National ID / Tax ID (13)
    } else {
      // mobile: drop leading 0, prepend 0066
      var phone = clean.replace(/^0/, '');
      acc = tlv('01', '0066' + phone.padStart(9, '0'));  // 13 chars
    }
    var merchant = tlv('29', tlv('00', 'A000000677010111') + acc);
    var hasAmt = amount != null && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
    // ลำดับฟิลด์ตามที่ผู้ให้บริการ/ไลบรารีมาตรฐานใช้กัน: 53 (สกุลเงิน) → 54 (จำนวนเงิน) → 58 (ประเทศ)
    var payload =
      tlv('00', '01') +
      tlv('01', hasAmt ? '12' : '11') +
      merchant +
      tlv('53', '764') +
      (hasAmt ? tlv('54', parseFloat(amount).toFixed(2)) : '') +
      tlv('58', 'TH');
    payload += '6304';
    return payload + crc16(payload);
  }

  global.PromptPayQR = { buildPayload: buildPayload, generateMatrix: generateMatrix, svg: svg, crc16: crc16 };
})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : this).PromptPayQR;
// end of promptpay-qr.js
