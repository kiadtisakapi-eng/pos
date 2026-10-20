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
//
//  เพิ่ม 20 ต.ค. 2569 (ตรวจทั้งระบบ 19 ต.ค. ข้อ 69 — ของที่ตัวจำลองเดิม "ไม่มี" จนบั๊กผ่านเทสต์ได้):
//    · Drive: createFile(ชื่อ, เนื้อหา, ชนิด) แบบ 3 ช่อง โยน error เมื่อเนื้อหาเกิน 10 MB (คู่มือ Google)
//      createFile(blob) โยน error เมื่อเกิน 50 MB · Utilities.newBlob() · env.purgeFolder(ชื่อ) = โฟลเดอร์ถูกลบถาวร
//      (getFolderById โยน "No item with the given ID could be found" เหมือนของจริง) — ปิดเพดานได้ด้วย { driveLimits: false }
//    · Script Properties: env.propCalls นับทุกครั้งที่เรียก (get/getAll/set/delete · แยกว่าเรียกตอนถือล็อกหรือไม่)
//      { propQuota: n } = ครบ n ครั้งแล้วโยน error โควตารายวันแบบของจริง
//    · ล็อก: env.lockLog บันทึก waitLock/releaseLock ตามลำดับ · env.lockHeld บอกว่ากำลังถือล็อกอยู่ไหม
//    · CacheService (ScriptCache) + env.cacheCalls · ⚠️ เทสต์ที่แก้ env.props ตรง ๆ = เหมือนเจ้าของรันฟังก์ชันตั้งค่า
//      ในตัวแก้ไข → cache ถูกล้างให้ (ของจริง: setupPosApiToken/rotatePosApiToken ล้าง/เติม cache เอง)
//    · Range.createTextFinder() — ค้นจาก "ค่าที่โชว์" ทีละช่อง (ค่าเริ่มต้นแบบ Sheets: ไม่สนตัวพิมพ์ · หาบางส่วนของช่อง)
//      + env.finderCalls นับจำนวนครั้ง · Range.getRow()/getColumn()
//    · การแปลงชนิดเพิ่ม: ".5" → 0.5 (Sheets แปลงแน่นอน) · "1 1/2" → 1.5 เปิดเฉพาะเทสต์ที่ขอ ({ coerceFractions: true })
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
    // ".5" / "-.25" / ".5%" — Sheets อ่านเป็นตัวเลข (ตรวจ 19 ต.ค. ข้อ 42)
    if (/^[-+]?\.\d+$/.test(s)) return Number(s);
    if (/^[-+]?\.\d+%$/.test(s)) return Number(s.slice(0, -1)) / 100;
    // เศษส่วนคละ "1 1/2" → 1.5 — ยังไม่ได้ลองกับชีตจริงของร้าน จึงเปิดเฉพาะเทสต์ที่ขอ
    const fr = opts.coerceFractions ? /^(\d+)\s+(\d+)\/(\d+)$/.exec(s) : null;
    if (fr && Number(fr[3]) > 0 && Number(fr[2]) < Number(fr[3])) return Number(fr[1]) + Number(fr[2]) / Number(fr[3]);
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
    // ชื่อเดือนอังกฤษ + วัน เช่น "May 5" / "5 May" (ตรวจหมวด D เรื่องเล็ก) — Sheets ภาษาอังกฤษแปลงเป็นวันที่ปีปัจจุบัน
    // locale ไทยยังไม่ยืนยัน จึงเปิดเฉพาะเทสต์ที่ขอ (opts.coerceMonthNames)
    const MONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const MON_RE = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?$/i;
    const parts = opts.coerceMonthNames ? s.split(/\s+/) : [];
    if (parts.length === 2) {
      let mon = null, day = 0;
      if (MON_RE.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) { mon = parts[0]; day = Number(parts[1]); }
      else if (/^\d{1,2}$/.test(parts[0]) && MON_RE.test(parts[1])) { mon = parts[1]; day = Number(parts[0]); }
      if (mon && day >= 1 && day <= 31) {
        const dt = new Date(Date.UTC(new Date().getUTCFullYear(), MONS.indexOf(mon.toLowerCase().slice(0, 3)), day) - TZ_MS);
        Object.defineProperty(dt, '_shown', { value: s });
        return dt;
      }
    }
    // "MM-yyyy" (เช่น "10-2026") — ยังไม่ยืนยันกับ Sheets จริงว่าแปลงทุก locale จึงเปิดเฉพาะเทสต์ที่ขอ (opts.coerceMonthYear)
    // ใช้พิสูจน์ว่าทะเบียนระบบ (_POS_BILL_INDEX) ไม่พังถ้า Sheets แปลงช่องเดือนเป็นวันที่ (ตรวจรอบ Claude 7 ต.ค. 2569)
    const my = opts.coerceMonthYear ? /^(\d{1,2})-(\d{4})$/.exec(s) : null;
    if (my && Number(my[1]) >= 1 && Number(my[1]) <= 12) {
      const dt = new Date(Date.UTC(Number(my[2]), Number(my[1]) - 1, 1) - TZ_MS);
      Object.defineProperty(dt, '_shown', { value: s });
      return dt;
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
    // จำนวนคอลัมน์จริงของแท็บ (ตรวจหมวด D ข้อ 6) — null = แบบเดิม (ขยายเองไม่จำกัด)
    // เทสต์ตั้งด้วย _setMaxColumns(n) เพื่อจำลองแท็บที่คอลัมน์เต็มพอดี: เขียนเกิน n = โยน error แบบชีตจริง
    let maxColsOverride = null;
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
      getMaxColumns: () => maxColsOverride !== null ? maxColsOverride : Math.max(26, grid.reduce((m, r) => Math.max(m, r.length), 0)),
      _setMaxColumns: (n) => { maxColsOverride = n; },
      insertColumnsAfter: (after, n) => {
        hit('insertColumnsAfter');
        [grid, fmts].forEach(g => g.forEach(row => { if (row.length > after) row.splice(after, 0, ...new Array(n).fill('')); }));
        if (maxColsOverride !== null) maxColsOverride += n;
      },
      insertColumnAfter: (after) => api.insertColumnsAfter(after, 1),
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        if (maxColsOverride !== null && c + nc - 1 > maxColsOverride) throw new Error('Exception: Those columns are out of bounds.');
        const cell = {
          getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc, getSheet: () => api,
          // TextFinder แบบ Sheets: ค้นจากค่าที่โชว์ · ค่าเริ่มต้นไม่สนตัวพิมพ์และหา "บางส่วนของช่อง" (ต้องสั่ง matchCase/matchEntireCell เอง)
          createTextFinder: (text) => {
            env.finderCalls++;
            const o = { caseOn: false, whole: false, regex: false, pos: 0 };
            const all = () => {
              const out = [], want = String(text);
              for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
                const s = shown((grid[r - 1 + i] && grid[r - 1 + i][c - 1 + j]) ?? '', fmtAt(r + i, c + j));
                const a = o.caseOn ? s : s.toLowerCase(), b = o.caseOn ? want : want.toLowerCase();
                const hitCell = o.regex ? new RegExp(o.whole ? '^(?:' + want + ')$' : want, o.caseOn ? '' : 'i').test(s)
                  : (o.whole ? a === b : (b !== '' && a.indexOf(b) >= 0));
                if (hitCell) out.push(api.getRange(r + i, c + j));
              }
              return out;
            };
            const f = {
              matchCase: (b) => { o.caseOn = !!b; return f; }, matchEntireCell: (b) => { o.whole = !!b; return f; },
              useRegularExpression: (b) => { o.regex = !!b; return f; }, ignoreDiacritics: () => f, matchFormulaText: () => f,
              findAll: () => { hit('textFinder'); return all(); },
              findNext: () => { hit('textFinder'); const a = all(); return o.pos < a.length ? a[o.pos++] : null; }
            };
            return f;
          },
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
      insertColumnBefore: (c) => { [grid, fmts].forEach(g => g.forEach(row => { while (row.length < c - 1) row.push(''); row.splice(c - 1, 0, ''); }));
        if (maxColsOverride !== null) maxColsOverride += 1; },
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
      // ถังขยะของโฟลเดอร์ (ตรวจหมวด D ข้อ 5) — เหมือน Drive: ไฟล์ในโฟลเดอร์ที่ถูกทิ้งนับว่าอยู่ในถังขยะด้วย
      _files: files, _trashed: false, getId: () => id, getName: () => name,
      isTrashed: () => folder._trashed, setTrashed: (v) => { folder._trashed = !!v; return folder; },
      createFile: (fn, content, mime) => {
        hit('createFile');
        // createFile(blob) — ชื่อและชนิดมากับ blob · เพดาน 50 MB · แบบ 3 ช่อง (ข้อความ) เพดาน 10 MB (คู่มือ Google: drive.d.ts)
        if (fn && typeof fn === 'object' && typeof fn.getDataAsString === 'function') {
          const blob = fn;
          if (opts.driveLimits !== false && blob.getBytes().length > 50 * 1024 * 1024) throw new Error('Exception: Blob object must have non-null content and be smaller than 50MB.');
          fn = blob.getName(); mime = blob.getContentType(); content = blob.getDataAsString();
        } else if (opts.driveLimits !== false && Buffer.byteLength(String(content), 'utf8') > 10 * 1024 * 1024) {
          throw new Error('Exception: File content is larger than 10MB — content is larger than 10MB (createFile(name, content, mimeType))');
        }
        const fid = 'file-' + (++fileSeq);
        let stored = String(content);
        if (faults.truncateNextFile) { stored = stored.slice(0, Math.floor(stored.length / 2)); delete faults.truncateNextFile; }
        const created = new Date(opts.now ? opts.now() : Date.now());
        const f = { _trashed: false, _content: stored, getId: () => fid, getName: () => fn, getMimeType: () => mime,
          getSize: () => Buffer.byteLength(f._content, 'utf8'), getDateCreated: () => created,
          getBlob: () => ({ getDataAsString: () => { hit('readFile'); return f._content; } }),
          setTrashed: (v) => { f._trashed = !!v; }, isTrashed: () => f._trashed || folder._trashed };
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
    // โฟลเดอร์ถูกลบออกจากถังขยะ (ครบ 30 วัน) = หายถาวร: ค้นด้วยชื่อ/ID ไม่เจออีก (ไฟล์ข้างในหายด้วย)
    _purge: (name) => { const f = folders[name]; if (!f) return false; delete folders[name]; f._files.forEach(x => { delete allFiles[x.getId()]; }); return true; },
    getFoldersByName: (n) => { const a = folders[n] ? [folders[n]] : []; let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; },
    getFolderById: (id) => { const f = Object.values(folders).find(x => x.getId() === id); if (!f) throw new Error('No item with the given ID could be found'); return f; },
    createFolder: (n) => { const f = makeFolder(n); folders[n] = f; return f; },
    getFileById: (id) => { if (!allFiles[id]) throw new Error('not found'); return allFiles[id]; }
  };

  // ── Script Properties (จำกัด 9KB ต่อค่าเหมือนของจริง) ──
  // rawProps = ที่เก็บจริง (สคริปต์อ่าน/เขียนผ่าน PropertiesService) · props = ทางที่เทสต์แก้ตรง ๆ (ล้าง cache ให้ — ดูหัวไฟล์)
  const rawProps = {};
  const cacheStore = new Map();
  const props = new Proxy(rawProps, {
    set(t, k, v) { t[k] = v; cacheStore.clear(); return true; },
    deleteProperty(t, k) { delete t[k]; cacheStore.clear(); return true; }
  });
  // นับการเรียก Script Properties (โควตา Google บัญชี gmail = 50,000 ครั้ง/วัน) · แยกว่าเกิดตอนถือล็อกหรือก่อนถือ
  const propCalls = { get: 0, getAll: 0, set: 0, del: 0, total: 0, underLock: 0, outsideLock: 0, keys: {} };
  const countProp = (kind, k) => {
    propCalls[kind]++; propCalls.total++;
    if (env.lockHeld) propCalls.underLock++; else propCalls.outsideLock++;
    if (k) propCalls.keys[k] = (propCalls.keys[k] || 0) + 1;
    if (opts.propQuota && propCalls.total > opts.propQuota) throw new Error('Service invoked too many times for one day: properties.');
  };
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => { countProp('get', k); hit('getProperty'); hit('getProperty:' + k); return Object.prototype.hasOwnProperty.call(rawProps, k) ? rawProps[k] : null; },
    getProperties: () => { countProp('getAll'); hit('getProperties'); return Object.assign({}, rawProps); },
    getKeys: () => { countProp('getAll'); hit('getProperties'); return Object.keys(rawProps); },
    setProperty: (k, v) => {
      countProp('set', k);
      hit('setProperty'); hit('setProperty:' + k);
      const s = String(v);
      if (Buffer.byteLength(s, 'utf8') > 9 * 1024) throw new Error('Argument too large: value');
      rawProps[k] = s; return this;
    },
    setProperties: (o) => { countProp('set'); hit('setProperty'); Object.keys(o).forEach(k => { const s = String(o[k]); if (Buffer.byteLength(s, 'utf8') > 9 * 1024) throw new Error('Argument too large: value'); }); Object.keys(o).forEach(k => { rawProps[k] = String(o[k]); }); },
    deleteProperty: (k) => { countProp('del', k); hit('deleteProperty'); delete rawProps[k]; }
  }) };

  // ── CacheService (ScriptCache) — หมดอายุตามเวลาจริงของสภาพทดสอบ (opts.now) · เพดานเวลา 6 ชม. แบบของจริง ──
  const cacheCalls = { get: 0, put: 0, remove: 0 };
  const cacheNow = () => (opts.now ? opts.now() : Date.now());
  const scriptCache = {
    get: (k) => { cacheCalls.get++; hit('cacheGet'); const e = cacheStore.get(String(k)); if (!e) return null; if (cacheNow() >= e.exp) { cacheStore.delete(String(k)); return null; } return e.v; },
    put: (k, v, ttl) => { cacheCalls.put++; hit('cachePut'); const sec = Math.min(Number(ttl) || 600, 21600); cacheStore.set(String(k), { v: String(v), exp: cacheNow() + sec * 1000 }); },
    remove: (k) => { cacheCalls.remove++; cacheStore.delete(String(k)); }
  };
  const CacheService = { getScriptCache: () => scriptCache };

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
    sleep: () => {},
    // Blob แบบที่ Drive รับ — เก็บเป็นข้อความ UTF-8 (พอสำหรับไฟล์สำรอง JSON)
    newBlob: (data, contentType, name) => {
      let text = typeof data === 'string' ? data : Buffer.from(data || []).toString('utf8');
      let bytes = null;
      const b = {
        getDataAsString: () => text, getBytes: () => (bytes || (bytes = Buffer.from(text, 'utf8'))),
        getContentType: () => contentType || null, setContentType: (t) => { contentType = t; return b; },
        getName: () => name || null, setName: (n) => { name = n; return b; },
        setDataFromString: (s) => { text = String(s); bytes = null; return b; }, copyBlob: () => Utilities.newBlob(text, contentType, name)
      };
      return b;
    }
  };

  const logs = [];
  const ctx = {
    console: opts.console || { log() {}, warn() {}, error() {}, info() {} },
    Date: opts.DateCtor || Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    SpreadsheetApp: { flush: () => { hit('flush'); }, getActiveSpreadsheet: () => ss },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => s, getContent: () => s }), MimeType: { JSON: 'json', TEXT: 'text' } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities, Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    // ล็อกที่สังเกตได้: env.lockLog เก็บลำดับ waitLock/releaseLock · env.lockHeld = ถืออยู่ตอนนี้ไหม
    LockService: { getScriptLock: () => ({
      waitLock(ms) { env.lockLog.push('waitLock'); hit('waitLock'); env.lockHeld = true; },
      tryLock() { env.lockHeld = true; return true; },
      releaseLock() { if (env.lockHeld) env.lockLog.push('releaseLock'); env.lockHeld = false; }
    }) },
    Logger: { log: (m) => logs.push(String(m)) },
    PropertiesService, DriveApp, CacheService
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
    // e.postData.length = จำนวนไบต์ของ body (ของจริงมีให้เสมอ — ใช้ปฏิเสธคำขอใหญ่เกินก่อนแยกอ่าน)
    const out = ctx.doPost({ postData: { contents: body, length: Buffer.byteLength(String(body == null ? '' : body), 'utf8'), type: 'text/plain' } });
    return typeof out === 'string' ? out : String(out);
  }
  const env = {
    ctx, ss, DriveApp, props, faults, logs, requests,
    propCalls, cacheCalls, lockLog: [], lockHeld: false, finderCalls: 0,
    // โฟลเดอร์สำรองถูกลบถาวร (ล้างถังขยะแล้ว) — ค่า POS_BACKUP_FOLDER_ID ที่จำไว้ยังชี้ไป ID เดิม
    purgeFolder(name) { return DriveApp._purge(name); },
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
    post(obj) {
      // Direct test requests act as the current primary device unless the test explicitly supplies an ID.
      const action = obj.action == null ? 'transaction' : obj.action;
      let primary = null;
      try { primary = ctx.readPrimaryDevice_(); } catch (e) { /* malformed registry must be reported by doPost itself */ }
      const device = ['transaction', 'void_transaction', 'backup', 'summary_day', 'summary_month'].includes(action)
        ? { deviceId: (primary && primary.id) || env.fetch.fixtureDeviceId || ('dev-' + 'a'.repeat(32)) } : {};
      return JSON.parse(process(JSON.stringify(Object.assign({ secret: env.token }, device, obj))));
    },
    setupToken() { props.POS_API_TOKEN = env.token; return env.token; },
    setupOwnerKey() { return typeof ctx.rotatePosOwnerKey === 'function' ? ctx.rotatePosOwnerKey() : null; },
    sheet(name) { return ss.getSheetByName(name); },
    sheetNames() { return ss._sheets.map(s => s.getName()); }
  };
  env.setupToken();
  return env;
}

module.exports = { createGasEnv };
