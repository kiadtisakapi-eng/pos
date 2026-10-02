// ─────────────────────────────────────────────────────────────────────────────
//  Apps Script จำลองแบบ "ทั้งระบบ" — โหลด google_apps_script.js ตัวจริงลง vm
//  พร้อม Spreadsheet / Drive / Script Properties / Lock ปลอมที่เก็บข้อมูลจริง
//  และ fetch() ที่ส่งคำขอเข้า doPost() ของสคริปต์ = ใช้ต่อกับ app.js ใน harness_db ได้
//
//  ใช้ทำอะไร:
//    · ทดสอบ "แอป ↔ Apps Script" ด้วยโค้ดจริงทั้งสองฝั่ง (ไม่ stub ฝั่งใดฝั่งหนึ่ง)
//    · จำลองคำขอมาถึงผิดลำดับ: env.hold(pred) กักคำขอที่ตรงเงื่อนไขไว้ แล้วปล่อยทีหลัง
//    · จำลองล้มกลางทาง: env.faults.<ชื่อ> = n → จุดนั้นโยน error ครั้งที่ n (ครั้งเดียว)
//      หรือ env.faults.<ชื่อ> = true → โยนทุกครั้ง
//
//  การแปลงชนิดของ Google Sheets (จำลองตั้งแต่ 23 ก.ย. 2569 — ปิดได้ด้วย createGasEnv({ coerce: false })):
//    เขียนสตริงลงช่อง = เหมือนคนพิมพ์ → "0812" กลายเป็นตัวเลข 812 · "2026-09-10 21:30:00" กลายเป็นวันที่ (Date)
//    · "TRUE" กลายเป็น true · ขึ้นต้นด้วย = กลายเป็นสูตรเสีย (#ERROR!) · ขึ้นต้นด้วย ' = เก็บเป็นข้อความ (ตัด ' ออก)
//    · ช่องที่ตั้งรูปแบบ "@" เก็บตามที่เขียน · ช่องวันที่ getDisplayValues() คืนข้อความตามที่พิมพ์ (เหมือนของจริง)
//    ⚠️ เดิมไม่จำลองข้อนี้ — ทำให้บั๊ก "หน้าตรวจความตรงกันฟ้องวันเวลาไม่ตรงทุกบิล" ผ่านเทสต์ทั้งชุดได้
//    จำลองเฉพาะรูปแบบที่มั่นใจว่า Sheets แปลงจริง (ไม่เดารูปแบบที่ขึ้นกับ locale ของไฟล์)
//  ข้อจำกัด: Script Properties จำกัด 9KB ต่อค่าเหมือนของจริง แต่ไม่จำลองโควตารวม 500KB · ไม่มีเครือข่ายจริง
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
// POS_GAS_SRC = ชี้ไปไฟล์ Apps Script รุ่นอื่น (ใช้พิสูจน์ว่าเทสต์ใหม่ "ตก" กับโค้ดก่อนแก้ — ดู tests/README.md)
const SRC = fs.readFileSync(process.env.POS_GAS_SRC || path.join(__dirname, '..', 'google_apps_script.js'), 'utf8');

function createGasEnv(opts) {
  opts = opts || {};
  const faults = {};
  const faultCount = {};
  const hit = (name) => {
    const f = faults[name];
    if (!f) return;
    faultCount[name] = (faultCount[name] || 0) + 1;
    if (f === true || f === faultCount[name]) {
      if (f !== true) delete faults[name];
      const e = new Error('จำลองล้มเหลว: ' + name);
      e.simulated = true;
      throw e;
    }
  };

  // ── การแปลงชนิดตอนเขียน (ดูหัวไฟล์) ──
  const TZ_MS = 7 * 3600e3;   // ไฟล์ชีตของร้านตั้งเขตเวลาไทย
  function coerce(v, fmt) {
    if (typeof v !== 'string' || opts.coerce === false || fmt === '@') return v;
    if (v.charAt(0) === "'") return v.slice(1);
    if (v.charAt(0) === '=') return '#ERROR!';            // สคริปต์นี้ไม่เคยตั้งใจเขียนสูตร — ขึ้นต้นด้วย = คือป้ายที่พัง
    const s = v.trim();
    if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
    if (/^[-+]?(\d+)(\.\d+)?%$/.test(s)) return Number(s.slice(0, -1)) / 100;
    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) {
      const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0].map(Number);
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= dim && h <= 23 && mi <= 59 && se <= 59) {
        const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, se) - TZ_MS);
        Object.defineProperty(dt, '_shown', { value: s });   // Sheets โชว์ตามรูปแบบที่พิมพ์
        return dt;
      }
    }
    // วัน/เดือนสั้น ๆ "12/9" หรือ "12/9/2026" — Sheets แปลงเป็นวันที่ทุก locale (ตีความวัน/เดือนต่างกันตาม locale
    // แต่ "ไม่เป็นข้อความเดิมแล้ว" เหมือนกันหมด) · จำลองแบบวัน/เดือน (locale ไทย) ปีปัจจุบันถ้าไม่ระบุ
    const sm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(s);
    if (sm) {
      const dd = Number(sm[1]), mm = Number(sm[2]);
      let yy = sm[3] ? Number(sm[3]) : new Date().getFullYear();
      if (yy < 100) yy += 2000;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= new Date(Date.UTC(yy, mm, 0)).getUTCDate()) {
        const dt = new Date(Date.UTC(yy, mm - 1, dd) - TZ_MS);
        Object.defineProperty(dt, '_shown', { value: s });
        return dt;
      }
    }
    return v;
  }
  function shown(v, fmt) {
    if (v == null) return '';
    if (v instanceof Date) {
      if (v._shown) return v._shown;
      const t = new Date(v.getTime() + TZ_MS), p2 = (n) => String(n).padStart(2, '0');
      return `${t.getUTCMonth() + 1}/${t.getUTCDate()}/${t.getUTCFullYear()} ${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())}`;
    }
    if (typeof v === 'number' && fmt && /#,##0\.00/.test(fmt)) {
      const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (/^\+/.test(fmt)) return v > 0 ? '+' + body : (v < 0 ? '-' + body : '0.00');
      return (v < 0 ? '-' : '') + body;
    }
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  // ── Spreadsheet ──
  function FakeSheet(name, ss) {
    const grid = [];
    const fmts = [];   // รูปแบบตัวเลขของแต่ละช่อง (ขนานกับ grid) — ใช้ตัดสินการแปลงชนิด/ค่าที่โชว์
    const fmtAt = (r, c) => (fmts[r - 1] && fmts[r - 1][c - 1]) || '';
    let _name = name;
    const api = {
      _grid: grid, _ss: ss, _hiddenCols: new Set(),
      getName: () => _name,
      setName: (n) => {
        hit('setName');
        if (ss._sheets.some(s => s !== api && s.getName() === n)) throw new Error('A sheet with the name "' + n + '" already exists.');
        _name = n; return api;
      },
      getLastColumn: () => { let w = 0; grid.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { w = Math.max(w, j + 1); break; } }); return w; },
      getLastRow: () => { for (let i = grid.length - 1; i >= 0; i--) if (grid[i].some(v => v !== '' && v != null)) return i + 1; return 0; },
      getMaxColumns: () => Math.max(26, grid.reduce((m, r) => Math.max(m, r.length), 0)),
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        const cell = {
          getDisplayValue: () => shown((grid[r - 1] && grid[r - 1][c - 1]) ?? '', fmtAt(r, c)),
          getDisplayValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(shown((grid[r - 1 + i] && grid[r - 1 + i][c - 1 + j]) ?? '', fmtAt(r + i, c + j))); o.push(row); } return o; },
          getValue: () => (grid[r - 1] && grid[r - 1][c - 1]) ?? '',
          getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((grid[r - 1 + i] && grid[r - 1 + i][c - 1 + j]) ?? ''); o.push(row); } return o; },
          setValue: (v) => { hit('setValue'); while (grid.length < r) grid.push([]); const row = grid[r - 1]; while (row.length < c) row.push(''); row[c - 1] = coerce(v, fmtAt(r, c)); return cell; },
          setValues: (vals) => { hit('setValues'); vals.forEach((rv, i) => { while (grid.length < r + i) grid.push([]); const row = grid[r - 1 + i]; rv.forEach((v, j) => { while (row.length < c + j) row.push(''); row[c - 1 + j] = coerce(v, fmtAt(r + i, c + j)); }); }); return cell; },
          clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (grid[r - 1 + i]) grid[r - 1 + i][c - 1 + j] = ''; return cell; },
          setNumberFormat: (f) => { for (let i = 0; i < nr; i++) { while (fmts.length < r + i) fmts.push([]); const fr = fmts[r - 1 + i]; for (let j = 0; j < nc; j++) { while (fr.length < c + j) fr.push(''); fr[c - 1 + j] = String(f); } } return cell; },
          setBackground: () => cell, setFontColor: () => cell, setFontWeight: () => cell,
          setHorizontalAlignment: () => cell, setFontSize: () => cell, merge: () => cell, setWrap: () => cell,
          setBorder: () => cell, setFontFamily: () => cell, setVerticalAlignment: () => cell, setNote: () => cell
        };
        return cell;
      },
      insertColumnBefore: (c) => { [grid, fmts].forEach(g => g.forEach(row => { while (row.length < c - 1) row.push(''); row.splice(c - 1, 0, ''); })); },
      autoResizeColumns: () => {}, setFrozenRows: () => {}, setColumnWidth: () => {}, setTabColor: () => {},
      hideColumns: (c, n) => { for (let i = 0; i < (n || 1); i++) api._hiddenCols.add(c + i); },
      appendRow: (r) => { hit('appendRow'); const at = api.getLastRow() + 1; while (grid.length < at - 1) grid.push([]);
        grid.splice(at - 1, 0, r.map((v, j) => coerce(v, fmtAt(at, j + 1)))); },
      deleteRow: (r) => { hit('deleteRow'); grid.splice(r - 1, 1); fmts.splice(r - 1, 1); },
      deleteColumns: () => {}, clear: () => { grid.length = 0; fmts.length = 0; }, getCharts: () => []
    };
    return api;
  }
  const ss = {
    _sheets: [],
    getSpreadsheetTimeZone: () => 'Asia/Bangkok',
    getSheets: () => ss._sheets.slice(),
    getSheetByName: (n) => ss._sheets.find(s => s.getName() === n) || null,
    insertSheet: (n, pos) => {
      hit('insertSheet');
      if (ss._sheets.some(s => s.getName() === n)) throw new Error('A sheet with the name "' + n + '" already exists.');
      const s = FakeSheet(n, ss);
      if (pos === 0) ss._sheets.unshift(s); else ss._sheets.push(s);
      return s;
    },
    deleteSheet: (s) => { hit('deleteSheet'); const i = ss._sheets.indexOf(s); if (i < 0) throw new Error('not found'); ss._sheets.splice(i, 1); }
  };

  // ── Drive ──
  let fileSeq = 0, folderSeq = 0;
  const allFiles = {};
  function makeFolder(name) {
    const id = 'folder-' + (++folderSeq);
    const files = [];
    const folder = {
      _files: files, getId: () => id, getName: () => name,
      createFile: (fn, content, mime) => {
        hit('createFile');
        const fid = 'file-' + (++fileSeq);
        let stored = String(content);
        if (faults.truncateNextFile) { stored = stored.slice(0, Math.floor(stored.length / 2)); delete faults.truncateNextFile; }
        const created = new Date(opts.now ? opts.now() : Date.now());
        const f = { _trashed: false, _content: stored, getId: () => fid, getName: () => fn, getMimeType: () => mime,
          getSize: () => Buffer.byteLength(f._content, 'utf8'), getDateCreated: () => created,
          getBlob: () => ({ getDataAsString: () => { hit('readFile'); return f._content; } }),
          setTrashed: (v) => { f._trashed = !!v; }, isTrashed: () => f._trashed };
        files.push(f); allFiles[fid] = f; return f;
      },
      // เหมือน Drive จริง: getFiles() คืนไฟล์ในถังขยะมาด้วย (โค้ดต้องกรองเองด้วย isTrashed())
      getFiles: () => { const a = files.slice(); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; },
      getFilesByType: () => folder.getFiles()
    };
    return folder;
  }
  const folders = {};
  const DriveApp = {
    _folders: folders,
    getFoldersByName: (n) => { const a = folders[n] ? [folders[n]] : []; let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; },
    getFolderById: (id) => { const f = Object.values(folders).find(x => x.getId() === id); if (!f) throw new Error('No item with the given ID could be found'); return f; },
    createFolder: (n) => { const f = makeFolder(n); folders[n] = f; return f; },
    getFileById: (id) => { if (!allFiles[id]) throw new Error('not found'); return allFiles[id]; }
  };

  // ── Script Properties (จำกัด 9KB ต่อค่าเหมือนของจริง) ──
  const props = {};
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => { hit('getProperty'); hit('getProperty:' + k); return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
    getProperties: () => { hit('getProperties'); return Object.assign({}, props); },
    getKeys: () => { hit('getProperties'); return Object.keys(props); },
    setProperty: (k, v) => {
      hit('setProperty'); hit('setProperty:' + k);
      const s = String(v);
      if (Buffer.byteLength(s, 'utf8') > 9 * 1024) throw new Error('Argument too large: value');
      props[k] = s; return this;
    },
    setProperties: (o) => { hit('setProperty'); Object.keys(o).forEach(k => { const s = String(o[k]); if (Buffer.byteLength(s, 'utf8') > 9 * 1024) throw new Error('Argument too large: value'); }); Object.keys(o).forEach(k => { props[k] = String(o[k]); }); },
    deleteProperty: (k) => { hit('deleteProperty'); delete props[k]; }
  }) };

  let uuidN = 0;
  const pad = (n) => String(n).padStart(2, '0');
  const Utilities = {
    getUuid: () => crypto.randomUUID ? crypto.randomUUID() : ('00000000-0000-4000-8000-' + String(++uuidN).padStart(12, '0')),
    // จัดรูปแบบเวลาเป็นเวลาไทย (UTC+7) — พอสำหรับรูปแบบที่สคริปต์ใช้
    formatDate: (d, tz, pattern) => {
      const t = new Date(new Date(d).getTime() + 7 * 3600e3);
      const map = { yyyy: t.getUTCFullYear(), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()) };
      return String(pattern || 'yyyy-MM-dd HH:mm').replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
    },
    computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(String(str), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    sleep: () => {}
  };

  const logs = [];
  const ctx = {
    console: opts.console || { log() {}, warn() {}, error() {}, info() {} },
    Date: opts.DateCtor || Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    SpreadsheetApp: { flush: () => { hit('flush'); }, getActiveSpreadsheet: () => ss },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => s, getContent: () => s }), MimeType: { JSON: 'json', TEXT: 'text' } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities, Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    LockService: { getScriptLock: () => ({ waitLock() { hit('waitLock'); }, tryLock() { return true; }, releaseLock() {} }) },
    Logger: { log: (m) => logs.push(String(m)) },
    PropertiesService, DriveApp
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'google_apps_script.js' });
  // ⚠️ แท็บสรุปรายวันที่เก่ากว่า DAILY_SHEET_RETENTION_DAYS (62 วัน) ถูกลบทันทีหลังเขียน (pruneOldDailySheets)
  //    เทสต์ส่วนใหญ่ใช้วันที่ตายตัว (เช่น 2026-09-05) — พอวันจริงเลยไป 62 วัน แท็บที่เทสต์เพิ่งเขียนจะหายเอง
  //    แล้วเทสต์ล้มทั้งที่โค้ดไม่ได้เปลี่ยน = deploy.bat หยุดทุกครั้ง (เจอตอนรอบตรวจ 5 · 2 ต.ค. 2569)
  //    จึงปิดการลบแท็บเก่าเป็นค่าเริ่มต้นของสภาพทดสอบ · เทสต์ของการลบแท็บเองส่ง { keepDailyRetention: true }
  if (!opts.keepDailyRetention) vm.runInContext('DAILY_SHEET_RETENTION_DAYS = 0', ctx);

  // ── ทางเข้า HTTP ──
  const held = [];      // คำขอที่ถูกกักไว้ { match, resolve }
  const holdRules = [];
  const loseRules = [];
  const requests = [];  // บันทึกทุกคำขอ (action + body) ตามลำดับที่ "เซิร์ฟเวอร์ประมวลผล"
  function process(body) {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) {}
    requests.push(parsed);
    const out = ctx.doPost({ postData: { contents: body } });
    return typeof out === 'string' ? out : String(out);
  }
  const env = {
    ctx, ss, DriveApp, props, faults, logs, requests,
    token: 'T'.repeat(32),
    // ขังคำขอที่ตรงเงื่อนไขไว้ (ยังไม่ส่งถึงเซิร์ฟเวอร์) — คืนตัวควบคุม
    hold(pred) {
      const rule = { pred, queue: [] };
      holdRules.push(rule);
      return {
        get count() { return rule.queue.length; },
        releaseAll() { holdRules.splice(holdRules.indexOf(rule), 1); const q = rule.queue.splice(0); q.forEach(fn => fn()); },
        releaseOne() { const fn = rule.queue.shift(); if (fn) fn(); },
        stop() { const i = holdRules.indexOf(rule); if (i >= 0) holdRules.splice(i, 1); }
      };
    },
    // คำขอที่ "ฝั่งแอปหมดเวลารอไปแล้ว" แต่ยังเดินทางไปถึงเซิร์ฟเวอร์ทีหลัง (ของจริงเกิดเมื่อ GAS ช้า/คิวล็อกยาว)
    // แอปได้ error ทันที · เซิร์ฟเวอร์ประมวลผลเมื่อเรียก deliver() — ใช้พิสูจน์ "คำขอเก่ามาถึงทีหลัง"
    lose(pred) {
      const rule = { pred, queue: [] };
      loseRules.push(rule);
      return {
        get count() { return rule.queue.length; },
        deliver() { const i = loseRules.indexOf(rule); if (i >= 0) loseRules.splice(i, 1);
          return rule.queue.splice(0).map(body => JSON.parse(process(body))); },
        stop() { const i = loseRules.indexOf(rule); if (i >= 0) loseRules.splice(i, 1); }
      };
    },
    // fetch แบบที่ app.js เรียก — ตอบกลับหลังเซิร์ฟเวอร์ประมวลผลเสร็จ
    fetch: (url, init) => {
      const body = init && init.body;
      let parsed = null; try { parsed = JSON.parse(body); } catch (e) {}
      const lost = loseRules.find(r => { try { return r.pred(parsed); } catch (e) { return false; } });
      if (lost) { lost.queue.push(body); return Promise.reject(new TypeError('Failed to fetch (timeout — ยังไปถึงเซิร์ฟเวอร์ทีหลัง)')); }
      const rule = holdRules.find(r => { try { return r.pred(parsed); } catch (e) { return false; } });
      const run = () => {
        if (env.networkDown) return Promise.reject(new TypeError('Failed to fetch'));
        const text = process(body);
        if (env.dropResponses) return Promise.reject(new TypeError('Failed to fetch (response lost)'));
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' },
          json: async () => JSON.parse(text), text: async () => text });
      };
      if (!rule) return run();
      return new Promise((resolve, reject) => { rule.queue.push(() => run().then(resolve, reject)); });
    },
    post(obj) { return JSON.parse(process(JSON.stringify(Object.assign({ secret: env.token }, obj)))); },
    setupToken() { props.POS_API_TOKEN = env.token; return env.token; },
    setupOwnerKey() { return typeof ctx.rotatePosOwnerKey === 'function' ? ctx.rotatePosOwnerKey() : null; },
    sheet(name) { return ss.getSheetByName(name); },
    sheetNames() { return ss._sheets.map(s => s.getName()); }
  };
  env.setupToken();
  return env;
}

module.exports = { createGasEnv };
