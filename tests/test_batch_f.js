// ─────────────────────────────────────────────────────────────────────
//  ชุด F (ก.ย. 2569) — ปิด 7 กลุ่มที่ Codex เจอหลังชุด E
//
//  E-F01 สิทธิ์คืนบิลจาก backup เป็นข้อยกเว้นถาวร  → restoredAt + เทียบลำดับกับ void
//  E-F02 ทะเบียน tombstone เต็ม/พังแล้วเงียบ        → ตัดตามขนาด + ยืนยันการเขียน + ไม่ fail-open
//  E-F03 คำขอเก่าที่ timeout ทับข้อมูลใหม่          → รหัสรุ่นของชีตสรุป (เจ้าของเลือก: กันเฉพาะสรุป)
//  E-F04 restore ข้ามงวดที่มีแต่ค่าใช้จ่าย           → collect งวดจากค่าใช้จ่าย/กะด้วย
//  E-F05 restore ทิ้งบิลหลัง backup ไว้บนชีต        → เครื่องมือ reconcile (เจ้าของเลือก: ไม่ลบอัตโนมัติ)
//  E-F06 ประวัติกะขาด startCash ผ่านว่า clean       → audit นับ + sanitize บังคับ + renderer กัน
//  E-F07 เกลี่ยส่วนลดผิดหนึ่งสตางค์                  → ใช้ allocateSatang ตัวเดียวกับ VAT/ค่าคอม
// ─────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const h = require('./harness.js');
const app = h.ctx.app;
const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const GAS = fs.readFileSync(path.join(root, 'google_apps_script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const t = (n, f) => {
  try {
    const r = f();
    if (r instanceof Promise) return r.then(() => { pass++; console.log('  PASS', n); },
                                            e => { fail++; console.log('  FAIL', n, '->', e.message); });
    pass++; console.log('  PASS', n);
  } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

app.showToast = () => {}; app.vibrateDevice = () => {};
['renderCart','renderDashboard','renderQueueScreen','renderEveryScreen','filterReports','closeModal','openModal','updateSyncBadgeStatus']
  .forEach(k => { app[k] = () => {}; });
app.currentRole = 'owner';
app.currentUser = { id: '__owner__', name: 'Owner' };
app.googleSheetsUrl = 'https://example.invalid/f-tests';
app.googleSheetsApiToken = 'a'.repeat(32);

// ── ชีตจำลองที่ "เขียนจริง" (ต้องใช้ตรวจ list_bills / รหัสรุ่นสรุป) ────────────
function sheet(headers, rows) {
  const grid = [headers.slice(), ...(rows || []).map(r => r.slice())];
  return {
    grid,
    getLastColumn: () => grid[0].length, getLastRow: () => grid.length,
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const get = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (grid[r - 1 + i] || [])[c - 1 + j] ?? ''));
      const range = {
        getValues: get, getDisplayValues: () => get().map(x => x.map(String)),
        setValue(v) { return range.setValues([[v]]); },
        setValues(vals) { vals.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; }); }); return range; }
      };
      ['setNumberFormat','setBackground','setFontColor','setFontWeight','setHorizontalAlignment','setFontSize','merge','setWrap','setBorder','setFontFamily','setVerticalAlignment']
        .forEach(m => { range[m] = () => range; });
      return range;
    },
    appendRow: r => grid.push(r.slice()), deleteRow: r => grid.splice(r - 1, 1),
    insertColumnBefore() {}, autoResizeColumns() {}, setFrozenRows() {}, setColumnWidth() {},
    getMaxColumns: () => Math.max(10, grid[0].length), deleteColumns() {}, clear() { grid.length = 0; },
    getCharts: () => [], setTabColor() {}
  };
}
// GAS context จำลอง — Script Properties อยู่ข้ามการรันเหมือนของจริง
// opts.maxValueBytes = เพดาน 9 KB ต่อค่าตามที่ Google ประกาศ · opts.readError/writeError = จำลองบริการล่ม
function gas(store, opts) {
  opts = opts || {};
  const props = {
    // อ่านทะเบียนไม่ได้ (ทั้งรูปแบบเก่าและใหม่) — จำลองบริการ Properties ล่มเฉพาะส่วนทะเบียน
    getProperty(k) { if (opts.readError && (k === 'POS_VOIDED_BILLS' || String(k).startsWith('POSVB_'))) throw new Error('read failed'); return store[k] ?? null; },
    setProperty(k, v) {
      v = String(v);
      if (opts.writeError) throw new Error('write failed');
      if (opts.maxValueBytes && Buffer.byteLength(v, 'utf8') > opts.maxValueBytes) throw new Error('Property value exceeds size limit');
      store[k] = v; return props;
    },
    deleteProperty(k) { delete store[k]; return props; },
    getProperties() { return { ...store }; }
  };
  const g = {
    console: { log() {}, warn() {}, error() {} }, Date, Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    Utilities: { formatDate: () => '2026-09-06 12:00:00', getUuid: () => 'uuid-1' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: x => ({ setMimeType: () => x }) },
    SpreadsheetApp: { flush() {} },
    PropertiesService: { getScriptProperties: () => props }
  };
  vm.createContext(g);
  vm.runInContext(GAS, g, { filename: 'google_apps_script.js' });
  // ปิดการลบแท็บสรุปรายวันที่เก่ากว่า 62 วัน — เทสต์ใช้วันที่ตายตัว (2026-09-06) ถ้าไม่ปิด
  // ตั้งแต่ 8 พ.ย. 2569 แท็บที่เพิ่งเขียนถูกลบทันที เทสต์ล้มเอง และ deploy.bat หยุด (รอบตรวจ 5 · ดู tests/gas_env.js)
  vm.runInContext('DAILY_SHEET_RETENTION_DAYS = 0', g);
  return g;
}
// อ่านทะเบียนยกเลิก/กู้คืนของบิลหนึ่งใบ เป็นค่าแบบเดิม (บวก = ยกเลิกเมื่อ · ลบ = กู้คืนเมื่อ · 0 = ไม่มี)
// ⚠️ ก.ย. 2569 ทะเบียนย้ายจาก property ค่าเดียว (POS_VOIDED_BILLS) ไปเป็นบิลละ property (POSVB_<id>)
// เพื่อไม่ต้องตัดหลักฐานทิ้งตอนใกล้เต็ม 9 KB — เทสต์จึงอ่านผ่านตัวนี้แทนการแกะ JSON ก้อนเดิม
const reg = (store, id) => {
  const raw = store['POSVB_' + id];
  if (!raw) { const legacy = store.POS_VOIDED_BILLS ? JSON.parse(store.POS_VOIDED_BILLS) : {}; return Number(legacy[id]) || 0; }
  const o = JSON.parse(raw); return o.v > o.r ? o.v : (o.r > o.v ? -o.r : 0);
};
const bill = over => ({ id: 'TX-AUDIT-0001', date: Date.parse('2026-09-06T12:00:00+07:00'), monthKey: '09-2026',
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', services: ['Cut'], staffNames: ['A'], ...over });

(async () => {

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F07: เกลี่ยส่วนลดต้องลงตัวเป๊ะทุกกรณี ---');
// ══════════════════════════════════════════════════════════════════
await t('เคสที่ Codex เจอ: 5×100 ส่วนลด 499.97 ต้องเหลือ 0.03 พอดี', () => {
  const nets = app.distributeDiscount([100,100,100,100,100], 500, 499.97);
  eq(Math.round(nets.reduce((a,b)=>a+b,0)*100), 3);
  ok(nets.every(n => n >= 0), 'มีบรรทัดติดลบ');
});
await t('กวาดทุกส่วนลดระดับสตางค์: ผลรวมบรรทัด = ราคารวม−ส่วนลด เสมอ', () => {
  const sets = [[100,100,100,100,100],[60,60,60,60],[350,150],[100,200,300],[500],[90,90,100,150,120]];
  let bad = 0;
  sets.forEach(prices => {
    const sub = prices.reduce((a,b)=>a+b,0);
    for (let cents = 0; cents <= sub*100; cents += 1) {
      if (cents < sub*100 - 400 && cents % 97 !== 0) continue;   // สแกนละเอียดเฉพาะช่วงใกล้เต็มยอด
      const d = cents/100;
      const nets = app.distributeDiscount(prices, sub, d);
      const want = Math.round(Math.max(0, sub - d) * 100);
      const got  = nets.reduce((a,n)=>a+Math.round(n*100),0);
      if (want !== got) bad++;
    }
  });
  eq(bad, 0);
});
await t('ส่วนลด 0 ต้องได้ราคาเดิมทุกบรรทัด', () => eq(app.distributeDiscount([100,250,90], 440, 0), [100,250,90]));
await t('ส่วนลดเต็มยอดต้องได้ 0 ทุกบรรทัด', () => eq(app.distributeDiscount([100,250,90], 440, 440), [0,0,0]));
await t('กฎ: distributeDiscount ต้องใช้ allocateSatang ไม่ใช่ปัดทีละบรรทัดเอง', () => {
  const m = SRC.match(/\n  distributeDiscount\(prices, subtotal, discount\) \{[\s\S]*?\n  \}/);
  ok(m, 'ไม่พบ distributeDiscount');
  ok(/allocateSatang/.test(m[0]), 'ไม่ได้ใช้ allocateSatang');
  ok(!/Math\.max\(0, nets\[idx\]/.test(m[0]), 'ยังเหลือการยัดเศษลงบรรทัดเดียว');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F06: ประวัติกะที่ขาด startCash ---');
// ══════════════════════════════════════════════════════════════════
const shiftFile = () => ({
  services: [], staff: [], customers: [], queue: [], transactions: [],
  shift: { active: false, startCash: 0, expenses: [], history: [
    { startTime: Date.parse('2026-09-05T11:00:00+07:00'), endTime: Date.parse('2026-09-06T03:00:00+07:00'), expenses: [] }
  ] }
});
await t('audit ต้องไม่บอกว่า clean เมื่อ startCash ของประวัติกะหายไป', () => {
  const a = app.auditBackupData(shiftFile());
  eq(a.badShifts, 1);
  eq(a.clean, false);
});
await t('ข้อความเตือนต้องบอกเจ้าของว่าเลข 0 นั้นไม่ใช่ยอดจริง', () => {
  const msg = app.describeBackupAudit(app.auditBackupData(shiftFile()));
  ok(/เงินเปิดร้าน/.test(msg), 'ไม่มีคำอธิบายเรื่องเงินเปิดร้าน');
});
await t('sanitize เติม startCash ให้เป็นตัวเลขเสมอ', () => {
  const f = shiftFile();
  app.sanitizeBackupData(f);
  eq(f.shift.history[0].startCash, 0);
});
await t('กฎ: renderer ห้ามเรียก .toLocaleString บน startCash โดยไม่มีตัวกัน', () => {
  const bad = [];
  SRC.split('\n').forEach((l, i) => {
    if (/\$\{\s*[a-zA-Z_$][\w.]*\.startCash\.toLocaleString/.test(l)) bad.push(i + 1);
  });
  eq(bad, []);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F04: restore ต้องรีเฟรชงวดที่มีแต่ค่าใช้จ่าย/กะ ---');
// ══════════════════════════════════════════════════════════════════
await t('งวดที่มีแต่ค่าใช้จ่าย (ไม่มีบิลสักใบ) ต้องมีงานสรุปออกมา', async () => {
  // รอบตรวจ 6 ข้อ 2: สรุปรายวันหลังกู้ส่งเฉพาะวันที่ไม่เก่ากว่า 64 วัน — ใช้วันที่นับจากวันนี้ (เดิมตายตัว 15 ก.ค. 2569)
  const day = Date.now() - 10 * 86400000;
  const dayKey = app.getBusinessISODate(day), monthKey = app.getBusinessMonthKey(day);
  app.state.transactions = []; app.state.cloudOutbox = [];
  app.state.shift = { active: false, startCash: 0, expenses: [], history: [] };
  const file = {
    services: [], staff: [], customers: [], queue: [], transactions: [],
    shift: { active: false, startCash: 0, expenses: [], history: [
      { startTime: day, endTime: day + 3600e3, startCash: 0, expenses: [{ id: 'e1', amount: 300, note: 'ค่าน้ำ', time: day }] }
    ] }
  };
  await app.applyBackupData(file, { checkIds: false });
  const jobs = app.state.cloudOutbox.filter(x => x.needSummary);
  ok(jobs.length, 'ไม่มีงานสรุปเลย');
  const dks = [].concat(...jobs.map(j => j.dateKeys || [])), mks = [].concat(...jobs.map(j => j.monthKeys || []));
  ok(dks.includes(dayKey), 'ขาดงวดวันของค่าใช้จ่าย ' + JSON.stringify(dks));
  ok(mks.includes(monthKey), 'ขาดงวดเดือนของค่าใช้จ่าย ' + JSON.stringify(mks));
});
await t('งวดค่าใช้จ่ายของ "ข้อมูลเดิมก่อนกู้" ก็ต้องถูกรีเฟรชด้วย', async () => {
  const oldDay = Date.parse('2026-06-10T14:00:00+07:00');
  app.state.transactions = []; app.state.cloudOutbox = [];
  app.state.shift = { active: false, startCash: 0, expenses: [], history: [
    { startTime: oldDay, endTime: oldDay + 3600e3, startCash: 0, expenses: [{ id: 'e0', amount: 500, note: 'เก่า', time: oldDay }] }
  ] };
  await app.applyBackupData({ services: [], staff: [], customers: [], queue: [], transactions: [],
    shift: { active: false, startCash: 0, expenses: [], history: [] } }, { checkIds: false });
  const mks = [].concat(...app.state.cloudOutbox.filter(x => x.needSummary).map(j => j.monthKeys || []));
  ok(mks.includes('06-2026'), 'ขาดงวดของข้อมูลเดิมก่อนกู้ ' + JSON.stringify(mks));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F01: สิทธิ์คืนบิลต้องพิสูจน์ลำดับเวลาได้ ---');
// ══════════════════════════════════════════════════════════════════
await t('กู้ข้อมูลติด restoredAt (ตัวเลข) แทนธง boolean ถาวร', async () => {
  app.state.transactions = []; app.state.cloudOutbox = [];
  await app.applyBackupData({ services: [], staff: [], customers: [], queue: [],
    transactions: [{ id: 'TX-AUDIT-0001', date: Date.now(), total: 300, subtotal: 300, discount: 0,
                     paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'synced' }],
    shift: { active: false, startCash: 0, expenses: [], history: [] } }, { checkIds: false });
  const tx = app.state.transactions[0];
  ok(Number(tx.restoredAt) > 0, 'ไม่มี restoredAt');
  eq(tx.restoredFromBackup, undefined);
});
await t('payload ของบิลต้องแนบ restoredAt ไปให้ปลายทางตัดสิน', async () => {
  let body = null;
  app.fetchWithTimeout = async (_u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ status: 'success' }) }; };
  await app.syncSingleTransaction(app.state.transactions[0]);
  ok(Number(body.restoredAt) > 0, 'ไม่ได้ส่ง restoredAt');
  eq(body.allowVoidedRestore, true);
});
await t('ซิงก์สำเร็จแล้วต้องปลดสิทธิ์ทิ้ง ไม่พกติดตัวตลอดไป', async () => {
  // ตั้งค่าให้ชัดเจนในเทสต์นี้เอง ไม่พึ่งผลของเทสต์ก่อนหน้า
  app.state.transactions = [{ id: 'TX-AUDIT-0002', date: Date.now(), total: 300, subtotal: 300, discount: 0,
    paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'pending',
    restoredAt: Date.now(), restoredFromBackup: true }];
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'success' }) });
  await app.syncPendingTransactions(true);
  eq(app.state.transactions[0].syncStatus, 'synced');
  eq(app.state.transactions[0].restoredAt, undefined, 'ยังพกสิทธิ์คืนบิลติดตัวหลังขึ้นชีตแล้ว');
});
await t('GAS: ธงคืนบิลที่ไม่มี restoredAt ต้องถูกปฏิเสธ', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  const r = JSON.parse(gas(store).handleTransaction(bill({ allowVoidedRestore: true }), ss));
  eq(r.code, 'ALREADY_VOIDED');
  eq(s.grid.length - 1, 0);
});
await t('GAS: restoredAt ใหม่กว่าเวลายกเลิก = คืนบิลได้ และทะเบียนบันทึกว่ากู้คืนแล้ว', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  const r = JSON.parse(gas(store).handleTransaction(bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss));
  eq(r.status, 'success');
  eq(s.grid.length - 1, 1);
  // ไม่ลบทะเบียนทิ้ง แต่บันทึกเวลาที่กู้ไว้เป็นค่าติดลบ (ดู FG-02)
  eq(reg(store, 'TX-AUDIT-0001'), -2000);
  // และการแก้บิลใบนี้ครั้งถัดไป (ไม่มี restoredAt) ต้องไม่ถูกปฏิเสธ
  eq(JSON.parse(gas(store).handleTransaction(bill({ total: 350, subtotal: 350 }), ss)).status, 'success');
});
// ⚠️ ก.ย. 2569 (ข้อ 8): เดิมแอป "ยืนยันคืนบิลเอง" อัตโนมัติ ซึ่งแยกไม่ออกจากกรณีที่บิลถูกยกเลิกจริงหลังการกู้
// ตอนนี้ต้องเป็นเจ้าของที่เลือก "คืนบิลนี้ขึ้นชีต" เท่านั้น — ทางออกจากทางตันยังมีอยู่ แต่ต้องมีเจตนาชัดเจน
await t('นาฬิกาเครื่องตั้งย้อนหลัง: บิลที่กู้มาต้องยังคืนขึ้นชีตได้ (ไม่ตัน) — เมื่อเจ้าของยืนยัน', async () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 9000 }), ss);
  app.state.transactions = [{ id: 'TX-AUDIT-0001', date: Date.parse('2026-09-06T12:00:00+07:00'),
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', services: ['Cut'], staffNames: ['A'],
    details: [], syncStatus: 'pending', restoredAt: 5000 }];
  app.fetchWithTimeout = async (_u, o) =>
    ({ ok: true, json: async () => JSON.parse(gas(store).handleTransaction(JSON.parse(o.body), ss)) });
  await app.syncPendingTransactions(true);
  eq(app.state.transactions[0].syncStatus, 'conflict', 'ต้องรอให้เจ้าของตัดสินใจ ไม่คืนบิลเอง');
  eq(app.state.transactions[0].syncIssue.code, 'ALREADY_VOIDED');
  eq(s.grid.length - 1, 0, 'คืนบิลขึ้นชีตเองโดยไม่มีคนยืนยัน');
  const role = app.currentRole, user = app.currentUser;
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  await app.resolveBillConflict('TX-AUDIT-0001', 'restore-cloud');
  await app.syncPendingTransactions(true);
  app.currentRole = role; app.currentUser = user;
  ok(app.state.transactions[0].restoredAt === undefined, 'สิทธิ์คืนบิลต้องถูกปลดหลังขึ้นชีตแล้ว');
  eq(app.state.transactions[0].syncStatus, 'synced');
  eq(s.grid.length - 1, 1);
});
await t('บิลที่ไม่ได้มาจากการกู้ข้อมูล ห้ามได้สิทธิ์ยืนยันนี้', async () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 9000 }), ss);
  app.state.transactions = [{ id: 'TX-AUDIT-0001', date: Date.parse('2026-09-06T12:00:00+07:00'),
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', services: ['Cut'], staffNames: ['A'],
    details: [], syncStatus: 'pending' }];
  app.fetchWithTimeout = async (_u, o) =>
    ({ ok: true, json: async () => JSON.parse(gas(store).handleTransaction(JSON.parse(o.body), ss)) });
  await app.syncPendingTransactions(true);
  eq(s.grid.length - 1, 0, 'บิลที่ถูกยกเลิกกลับขึ้นชีตได้');
  // ⚠️ ก.ย. 2569 (ข้อ 8): เดิมคาดว่า 'synced' — ผิด เพราะชีตไม่มีบิลนี้แต่ในเครื่องยังนับยอด
  // ตอนนี้ต้องเป็น conflict (ไม่วน retry เหมือนเดิม แต่ไม่โกหกว่าตรงกัน)
  eq(app.state.transactions[0].syncStatus, 'conflict', 'ต้องจบแบบรอตัดสิน ไม่ใช่ synced');
  let calls = 0; const f0 = app.fetchWithTimeout; app.fetchWithTimeout = async (...a) => { calls++; return f0(...a); };
  await app.syncPendingTransactions(true);
  app.fetchWithTimeout = f0;
  eq(calls, 0, 'ต้องไม่วน retry ตลอดไป');
});
await t('คำสั่งลบแถวต้องแนบ voidedAt จากนาฬิกาเครื่องเดียวกัน', () => {
  ok(/voidedAt: Date\.now\(\)/.test(SRC), 'enqueueVoidCloudOps ไม่ได้เก็บ voidedAt');
  ok(/voidedAt: Number\(v\.voidedAt\) \|\| 0/.test(SRC), 'postVoidDelete ไม่ได้ส่ง voidedAt');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F02: ทะเบียนบิลที่ยกเลิกต้องไม่พังเงียบ ---');
// ══════════════════════════════════════════════════════════════════
await t('void 400 ใบติดกันภายใต้เพดาน 9 KB ต่อค่า ต้องยังกันคำขอเก่าได้ทุกใบที่ตอบว่าสำเร็จ', () => {
  const store = {}, cap = { maxValueBytes: 9 * 1024 };
  const g0 = gas(store, cap), s = sheet(Array.from(g0.BILL_HEADERS)), ss = { getSheetByName: () => s };
  let admitted = 0;
  for (let i = 0; i < 400; i++) {
    const b = bill({ id: `TX-${1788700000000 + i}-${String(i).padStart(8, '0')}`, voidedAt: 1788700000000 + i });
    const res = JSON.parse(gas(store, cap).handleVoidTransaction(b, ss));
    const acknowledged = res.status === 'success' || res.code === 'NOT_FOUND';
    if (!acknowledged) continue;                        // ปฏิเสธชัดเจน = แอปเก็บงานไว้ retry ไม่ใช่ผิดเงียบ
    const late = JSON.parse(gas(store, cap).handleTransaction(b, ss));
    if (late.status === 'success') admitted++;          // ← ผิดเงียบ: ตอบว่ายกเลิกแล้วแต่ยังรับบิลกลับ
  }
  eq(admitted, 0);
  eq(s.grid.length - 1, 0);
});
await t('ทะเบียนต้องอยู่ในงบขนาด และยังเขียนใบล่าสุดลงได้เสมอ', () => {
  const store = {}, cap = { maxValueBytes: 9 * 1024 };
  const g0 = gas(store, cap), s = sheet(Array.from(g0.BILL_HEADERS)), ss = { getSheetByName: () => s };
  let lastId = '';
  for (let i = 0; i < 400; i++) {
    lastId = `TX-${1788700000000 + i}-${String(i).padStart(8, '0')}`;
    gas(store, cap).handleVoidTransaction(bill({ id: lastId, voidedAt: 1788700000000 + i }), ss);
  }
  // ⚠️ ก.ย. 2569: ทะเบียนแยก "บิลละ property" — ไม่มีค่าไหนใกล้เพดาน 9 KB และไม่ต้องตัดของที่ยังไม่หมดอายุทิ้ง
  const keys = Object.keys(store).filter(k => k.startsWith('POSVB_'));
  ok(keys.every(k => Buffer.byteLength(store[k], 'utf8') <= 9 * 1024), 'ทะเบียนเกินเพดานของ Google');
  ok(reg(store, lastId) > 0, 'ใบล่าสุดไม่ได้ถูกลงทะเบียน (ทะเบียนตันแล้วเงียบ)');
  eq(keys.length, 400, 'ต้องเก็บครบทุกใบที่ยังไม่หมดอายุ — ไม่ตัดหลักฐานทิ้งเพื่อบีบขนาด');
});
await t('เขียนทะเบียนไม่สำเร็จ = ห้ามลบแถวและห้ามตอบว่าสำเร็จ', () => {
  const store = {}, g = gas(store), headers = Array.from(g.BILL_HEADERS);
  const s = sheet(headers, [['TX-AUDIT-0001','2026-09-06 12:00:00','ลูกค้า','Cut','เงินสด',300,0,300,0,0,0,300,'A']]);
  const ss = { getSheetByName: () => s };
  const r = JSON.parse(gas(store, { writeError: true }).handleVoidTransaction(bill(), ss));
  eq(r.status, 'error');
  eq(r.code, 'VOID_REGISTRY_FAILED');
  eq(s.grid.length - 1, 1, 'ลบแถวทั้งที่ยืนยันทะเบียนไม่ได้');
});
await t('อ่านทะเบียนไม่ได้ = ต้องปฏิเสธบิล ไม่ใช่รับเข้าเงียบ ๆ', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  const r = JSON.parse(gas(store, { readError: true }).handleTransaction(bill(), ss));
  eq(r.code, 'REGISTRY_UNAVAILABLE');
  eq(s.grid.length - 1, 0);
});
await t('แอปต้องถือ REGISTRY_UNAVAILABLE เป็นของชั่วคราว (บิลค้าง pending เพื่อ retry)', async () => {
  app.state.transactions = [{ id: 'TX-AUDIT-0009', date: Date.now(), total: 100, subtotal: 100, discount: 0,
    paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'pending' }];
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'error', code: 'REGISTRY_UNAVAILABLE', message: 'x' }) });
  await app.syncPendingTransactions(true);
  eq(app.state.transactions[0].syncStatus, 'pending');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F03: รหัสรุ่นของชีตสรุป กันยอดเก่าทับยอดใหม่ ---');
// ══════════════════════════════════════════════════════════════════
await t('รหัสรุ่นต้องเพิ่มขึ้นเข้มทุกครั้ง แม้เรียกรัว ๆ ในมิลลิวินาทีเดียวกัน', () => {
  const seq = [];
  for (let i = 0; i < 50; i++) seq.push(app.nextSummaryStamp());
  for (let i = 1; i < seq.length; i++) ok(seq[i] > seq[i-1], 'รหัสรุ่นไม่เพิ่มขึ้นที่ตำแหน่ง ' + i);
});
await t('payload สรุปต้องแนบ generatedAt', () => {
  const p = app.buildSummaryPayload([], [], 'day', '2026-09-06');
  ok(Number(p.generatedAt) > 0, 'ไม่มี generatedAt');
});
await t('GAS: คำขอสรุปที่เก่ากว่ารุ่นบนชีต ต้องถูกปฏิเสธและไม่เขียนทับ', () => {
  const summarySrc = fs.readFileSync(path.join(root, 'tests/test_gas_summary.js'), 'utf8');
  const { FakeSS } = new Function(summarySrc.slice(summarySrc.indexOf('function FakeSheet('), summarySrc.indexOf('const ctx=')) + '\nreturn { FakeSS };')();
  const ss = FakeSS(), g = gas({});
  const payload = over => Object.assign({
    action: 'summary_day', dateKey: '2026-09-06',
    totalRevenue: 400, cashRevenue: 400, qrRevenue: 0, creditRevenue: 0,
    billCount: 1, avgBill: 400, totalExpenses: 0, netIncome: 400,
    cashVariance: 0, shiftCount: 0, shiftCash: [],
    nonVatBase: 400, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0,
    vatCategories: [], services: [], expenses: [], staffCommissions: []
  }, over);
  eq(JSON.parse(g.handleDailySummary(payload({ generatedAt: 2000 }), ss)).status, 'success');
  const stale = JSON.parse(g.handleDailySummary(payload({ generatedAt: 1000, totalRevenue: 300, cashRevenue: 300, nonVatBase: 300, avgBill: 300 }), ss));
  eq(stale.code, 'STALE_SUMMARY');
  const kpi = ss.getSheetByName('สรุป-2026-09-06').getRange(5, 1, 1, 1).getValues()[0][0];
  eq(kpi, '฿400.00', 'ยอดเก่าทับยอดใหม่บนชีต');
  // รุ่นใหม่กว่าต้องเขียนได้ตามปกติ
  eq(JSON.parse(g.handleDailySummary(payload({ generatedAt: 3000, totalRevenue: 500, cashRevenue: 500, nonVatBase: 500, avgBill: 500 }), ss)).status, 'success');
});
await t('แอปยกพื้นรหัสรุ่นเมื่อปลายทางบอกว่าชีตใหม่กว่า (กันสรุปส่งไม่ขึ้นถาวรตอนนาฬิกาเพี้ยน)', () => {
  const far = Date.now() + 5 * 24 * 3600e3;
  app.noteSummaryStampFloor({ storedAt: far });
  ok(app.nextSummaryStamp() > far, 'ไม่ได้ยกพื้นรหัสรุ่น');
  app._summaryStampFloor = 0; app._lastSummaryStamp = 0;
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- E-F05: reconcile — แสดงความต่าง ไม่ลบให้เอง ---');
// ══════════════════════════════════════════════════════════════════
await t('GAS: list_bills อ่านรายการบิลของแท็บเดือนได้', () => {
  const g = gas({});
  const s = sheet(Array.from(g.BILL_HEADERS), [
    ['TX-A','2026-09-06 12:00:00','ลูกค้า A','Cut','เงินสด',300,0,300,0,0,0,300,'A'],
    ['TX-B','2026-09-06 13:00:00','ลูกค้า B','Cut','เงินสด',200,0,200,0,0,0,200,'B']
  ]);
  const r = JSON.parse(g.handleListBills({ monthKey: '09-2026' }, { getSheetByName: () => s }));
  eq(r.status, 'success');
  eq(r.details.bills.map(b => b.id), ['TX-A','TX-B']);
  eq(r.details.bills.map(b => b.total), [300, 200]);
});
await t('GAS: list_bills ต้องอยู่ในรายการคำสั่งที่อนุญาต และเดือนผิดถูกปฏิเสธ', () => {
  ok(/"list_bills":/.test(GAS), 'ไม่ได้ลงทะเบียนใน ACTION_HANDLERS');
  eq(JSON.parse(gas({}).handleListBills({ monthKey: 'ขยะ' }, { getSheetByName: () => null })).code, 'INVALID_MONTH');
});
// ชีตจำลองที่ตอบ "ตามเดือนที่ขอ" (รอบตรวจ 5 · 2 ต.ค. 2569)
// เดิมตอบแถวชุดเดียวกันทุกคำขอ — พอขึ้นเดือนใหม่ (1 ต.ค. 2569) ตัวตรวจขอทั้งเดือน ก.ย. และ "เดือนปัจจุบัน"
// บิลเดียวกันจึงถูกนับสองครั้ง = เทสต์ล้มเองทั้งที่โค้ดไม่ได้เปลี่ยน และ deploy.bat หยุดทุกครั้ง (รันเทสต์ก่อนปล่อย)
const sheetByMonth = (byMonth) => async (_u, o) => {
  const body = JSON.parse(o.body);
  if (body.action === 'list_bill_months') {
    return { ok: true, json: async () => ({ status: 'success', details: { months: Object.keys(byMonth).map(monthKey => ({ monthKey })) } }) };
  }
  const mk = body.monthKey;
  return { ok: true, json: async () => ({ status: 'success', details: { sheet: mk, exists: !!byMonth[mk], truncated: false, bills: byMonth[mk] || [] } }) };
};
await t('reconcile จับได้ว่ามีบิลบนชีตที่ไม่มีในเครื่อง (เคส E-F05)', async () => {
  const day = Date.parse('2026-09-06T12:00:00+07:00');
  app.state.transactions = [{ id: 'TX-A', date: day, total: 300, subtotal: 300, discount: 0,
    paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'synced', customerName: 'A' }];
  app.fetchWithTimeout = sheetByMonth({ '09-2026': [{ id: 'TX-A', when: '2026-09-06 12:00:00', customer: 'A', total: 300 },
                                                    { id: 'TX-B', when: '2026-09-06 13:00:00', customer: 'B', total: 200 }] });
  await app.runCloudReconcile();
  const r = app._reconcile;
  eq(r.extra.map(x => x.id), ['TX-B']);
  eq(r.missing.length, 0);
  eq(r.mismatch.length, 0);
});
await t('reconcile จับยอดไม่ตรงกันได้ (เคส E-F03 ฝั่งแถวบิล)', async () => {
  app.fetchWithTimeout = sheetByMonth({ '09-2026': [{ id: 'TX-A', when: '2026-09-06 12:00:00', customer: 'A', total: 250 }] });
  await app.runCloudReconcile();
  eq(app._reconcile.mismatch.map(x => [x.id, x.localTotal, x.cloudTotal]), [['TX-A', 300, 250]]);
});
await t('บิลที่ยังไม่ได้ซิงก์ต้องไม่ถูกรายงานว่า "หายจากชีต"', async () => {
  app.state.transactions[0].syncStatus = 'pending';
  app.fetchWithTimeout = sheetByMonth({ '09-2026': [] });
  await app.runCloudReconcile();
  eq(app._reconcile.missing.map(x => x.pending), [true]);
  app.state.transactions[0].syncStatus = 'synced';
});
await t('บิลที่ยังมีในเครื่องแต่แถวไปอยู่ผิดแท็บเดือน ต้องไม่ถูกเสนอให้ลบ', async () => {
  const sep = Date.parse('2026-09-06T12:00:00+07:00'), aug = Date.parse('2026-08-06T12:00:00+07:00');
  app.state.transactions = [
    { id: 'TX-1788700000000-AAAAAAAA', date: sep, total: 300, subtotal: 300, discount: 0,
      paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'synced', customerName: 'A' },
    { id: 'TX-1788600000000-BBBBBBBB', date: aug, total: 200, subtotal: 200, discount: 0,
      paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'synced', customerName: 'B' }
  ];
  // แท็บ 09-2026 มีแถวของบิลเดือน ส.ค. ปนอยู่ (บิลใบนั้นยังมีชีวิตอยู่ในเครื่อง)
  app.fetchWithTimeout = sheetByMonth({
    '09-2026': [{ id: 'TX-1788700000000-AAAAAAAA', when: '', customer: 'A', total: 300, idOk: true },
                { id: 'TX-1788600000000-BBBBBBBB', when: '', customer: 'B', total: 200, idOk: true }],
    '08-2026': [{ id: 'TX-1788600000000-BBBBBBBB', when: '', customer: 'B', total: 200, idOk: true }]
  });
  await app.runCloudReconcile();
  eq(app._reconcile.extra.length, 0, 'จัดบิลที่ยังมีชีวิตเป็น "ลบได้"');
  eq(app._reconcile.wrongTab.map(x => x.id), ['TX-1788600000000-BBBBBBBB']);
  app.renderReconcileResult();
  const html = h.document.getElementById('reconcile-body').innerHTML;
  ok(/อยู่คนละแท็บเดือน/.test(html), 'ไม่ได้แยกกลุ่มให้เห็น');
  ok(!/reconcileDeleteSheetBill/.test(html), 'ยังเสนอปุ่มลบให้บิลที่ยังมีชีวิต');
});
await t('รายการเยอะเกินไปต้องไม่วาดทั้งหมด (กัน iPad ค้าง)', () => {
  app._reconcile = { months: ['09-2026'], errors: [], truncated: false, at: Date.now(), missing: [], mismatch: [], wrongTab: [],
    extra: Array.from({ length: 250 }, (_, i) => ({ monthKey: '09-2026', id: `TX-17887000000${String(i).padStart(2,'0')}-AAAAAAAA`,
      when: '', customer: 'x', total: 100, idOk: true })) };
  app.renderReconcileResult();
  const html = h.document.getElementById('reconcile-body').innerHTML;
  eq((html.match(/reconcileDeleteSheetBill/g) || []).length, 200);
  ok(/จากทั้งหมด 250 รายการ/.test(html), 'ไม่ได้บอกว่ามีอีกกี่รายการ');
});
await t('งานคลาวด์ที่ค้างเกิน 3 ครั้ง ต้องขึ้นเตือน ไม่ใช่โชว์ว่า "ตรงกัน"', () => {
  const seen = [];
  const real = app.updateSyncBadgeStatus;
  app.updateSyncBadgeStatus = (st, n) => seen.push([st, n]);
  app.state.transactions = [{ id: 'TX-1788700000000-AAAAAAAA', date: Date.now(), total: 100, syncStatus: 'synced' }];
  app.state.cloudOutbox = [{ id: 'cob-1', needVoidDelete: true, voidDelete: { id: 'x' }, tries: 4 }];
  app.checkSyncStatus();
  eq(seen.at(-1), ['stuck', 1]);
  app.state.cloudOutbox = [];
  app.checkSyncStatus();
  eq(seen.at(-1), ['synced', 0]);
  app.updateSyncBadgeStatus = real;
});
await t('กฎ: การกู้ข้อมูลต้องไม่สั่งลบบิลบนชีตเองโดยอัตโนมัติ', () => {
  // ตัวแทนข้อมูลจริงอยู่ที่ _applyBackupDataLocked (applyBackupData เป็นแค่ทางเข้าที่เข้าคิวงานบันทึก)
  const m = SRC.match(/\n  async _applyBackupDataLocked\(parsed, opts, extra\) \{[\s\S]*?\n  \}\n/);
  ok(m, 'ไม่พบ _applyBackupDataLocked');
  ok(!/needVoidDelete:\s*true/.test(m[0]), 'applyBackupData สั่งลบแถวเอง');
});
await t('ลบแถวบนชีตต้องผ่านการยืนยันของเจ้าของเท่านั้น', async () => {
  app._reconcile = { extra: [{ monthKey: '09-2026', id: 'TX-B', when: '2026-09-06 13:00:00', customer: 'B', total: 200 }],
                     missing: [], mismatch: [], months: ['09-2026'], errors: [], truncated: false, at: Date.now() };
  app.state.cloudOutbox = []; app.state.voidLog = [];
  let asked = null;
  app.showConfirm = (msg) => { asked = msg; };            // ผู้ใช้ยังไม่กดยืนยัน
  app.reconcileDeleteSheetBill('TX-B');
  ok(asked && /TX-B/.test(asked), 'ไม่ได้ถามก่อนลบ');
  eq(app.state.cloudOutbox.length, 0, 'สั่งลบทั้งที่ยังไม่ยืนยัน');
});
await t('เมื่อเจ้าของยืนยัน จึงเข้าคิวลบแถวและบันทึกไว้ในประวัติการแก้ไข', async () => {
  let run = null;
  app.showConfirm = (_m, cb) => { run = cb(); };
  app.flushCloudOutbox = async () => {};
  app.reconcileDeleteSheetBill('TX-B');
  await run;
  const job = app.state.cloudOutbox.find(x => x.needVoidDelete);
  ok(job, 'ไม่มีงานลบแถวในคิว');
  eq(job.voidDelete.id, 'TX-B');
  eq(job.voidDelete.monthKey, '09-2026');
  ok(Number(job.voidDelete.voidedAt) > 0, 'ไม่มี voidedAt');
  eq(app.state.voidLog.map(v => v.billId), ['TX-B']);
});
await t('กฎ: ทุก ID ที่ต่อเข้า onclick ต้องผ่าน safeId() ไม่ใช่ escapeHtml()', () => {
  // ⚠️ กฎนี้เคยล็อกไว้แค่ที่ renderPos() ของชุด A จึงไม่จับตอนโค้ดใหม่ทำผิดซ้ำ
  // escapeHtml กันตรงนี้ไม่ได้: &#39; ถูกถอดกลับเป็น ' ก่อนเบราว์เซอร์รันโค้ดใน onclick
  const bad = [];
  SRC.split('\n').forEach((l, i) => {
    const re = /on[a-z]+\s*=\s*"[^"]*?'\$\{([^}]*)\}'/g;
    let m;
    while ((m = re.exec(l))) {
      const expr = m[1].trim();
      if (!/^safeId\(/.test(expr)) bad.push(`${i + 1}: \${${expr}}`);
    }
  });
  eq(bad, []);
});
await t('เลขที่บิลบนชีตที่ผิดรูปแบบ ต้องแสดงให้เห็นแต่ไม่มีปุ่มสั่งงาน', async () => {
  const day = Date.parse('2026-09-06T12:00:00+07:00');
  app.state.transactions = [{ id: 'TX-A', date: day, total: 300, subtotal: 300, discount: 0,
    paymentMethod: 'cash', services: [], staffNames: [], details: [], syncStatus: 'synced', customerName: 'A' }];
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'success', details: { sheet: '09-2026', exists: true, truncated: false,
    bills: [{ id: 'TX-A', when: '2026-09-06 12:00:00', customer: 'A', total: 250, idOk: true },
            { id: "x'); alert(1); ('", when: '2026-09-06 13:00:00', customer: 'B', total: 200, idOk: false }] } }) });
  await app.runCloudReconcile();
  const el = h.document.getElementById('reconcile-body');
  ok(/เลขที่บิลผิดรูปแบบ/.test(el.innerHTML), 'ไม่ได้บอกว่าเลขที่บิลใช้ไม่ได้');
  ok(!/onclick="app\.reconcile[A-Za-z]+\('[^']*(alert|;)/.test(el.innerHTML), 'ID อันตรายหลุดเข้า onclick');
  ok(/onclick="app\.reconcileResendBill\('TX-A'\)/.test(el.innerHTML), 'บิลปกติต้องยังมีปุ่ม');
});
await t('GAS: list_bills ต้องบอกว่าเลขที่บิลแถวไหนผิดรูปแบบ', () => {
  const g = gas({});
  const s = sheet(Array.from(g.BILL_HEADERS), [
    ['TX-1788700000000-AAAAAAAA','2026-09-06 12:00:00','A','Cut','เงินสด',300,0,300,0,0,0,300,'A'],
    ["x'); alert(1); ('",'2026-09-06 13:00:00','B','Cut','เงินสด',200,0,200,0,0,0,200,'B']
  ]);
  const r = JSON.parse(g.handleListBills({ monthKey: '09-2026' }, { getSheetByName: () => s }));
  eq(r.details.bills.map(b => b.idOk), [true, false]);
});
console.log('\n--- FG-01/FG-02: สองเส้นทางที่ลบบิลผิดบนชีต ---');
await t('FG-01: ผลตรวจเก่า + บิลกลับมาอยู่ในเครื่องแล้ว = ห้ามสั่งลบ', async () => {
  app._reconcile = { months: ['09-2026'], errors: [], truncated: false, at: Date.now(),
    missing: [], mismatch: [], wrongTab: [],
    extra: [{ monthKey: '09-2026', id: 'TX-1788700000000-AAAAAAAA', when: '2026-09-06 12:00:00',
              customer: 'A', total: 300, idOk: true }] };
  // สภาพหลังรับสิทธิ์จากอีกหน้าต่าง: โหลดข้อมูลใหม่แล้วมีบิลใบนั้นอยู่จริง
  app.state.transactions = [{ id: 'TX-1788700000000-AAAAAAAA', date: Date.parse('2026-09-06T12:00:00+07:00'),
    total: 300, subtotal: 300, discount: 0, paymentMethod: 'cash', services: [], staffNames: [],
    details: [], syncStatus: 'synced' }];
  app.state.cloudOutbox = []; app.state.voidLog = [];
  let asked = null; app.showConfirm = (m, cb) => { asked = m; return cb(); };
  app.flushCloudOutbox = async () => {};
  app.reconcileDeleteSheetBill('TX-1788700000000-AAAAAAAA');
  eq(asked, null, 'ยังถามเพื่อจะลบทั้งที่บิลอยู่ในเครื่องแล้ว');
  eq(app.state.cloudOutbox.length, 0, 'สั่งลบบิลที่ยังมีอยู่ในเครื่อง');
  eq(app._reconcile, null, 'ไม่ได้ทิ้งผลตรวจที่เก่าแล้ว');
});
await t('FG-01: รับสิทธิ์เป็นหน้าต่างหลัก / กู้ข้อมูล ต้องทิ้งผลตรวจเดิมทันที', () => {
  const fake = { months: [], errors: [], truncated: false, at: 1, missing: [], mismatch: [], wrongTab: [], extra: [] };
  app._reconcile = fake; app.invalidateReconcile('ทดสอบ'); eq(app._reconcile, null);
  // ล็อกที่ระดับกฎ: ทั้งสองเส้นทางต้องเรียกจริง
  ok(/this\.invalidateReconcile\('รับสิทธิ์เป็นหน้าต่างหลัก/.test(SRC), 'takeOverAsWriter ไม่ทิ้งผลตรวจ');
  ok(/this\.invalidateReconcile\('กู้\/นำเข้าข้อมูลชุดใหม่'\)/.test(SRC), 'applyBackupData ไม่ทิ้งผลตรวจ');
});
await t('FG-02: คำสั่งยกเลิกเก่าที่ส่งซ้ำหลังกู้บิล ต้องไม่ลบแถว', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleTransaction(bill(), ss);
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  eq(s.grid.length - 1, 0, 'ยกเลิกครั้งแรกต้องลบแถวได้');
  eq(JSON.parse(gas(store).handleTransaction(bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss)).status, 'success');
  eq(s.grid.length - 1, 1);
  const replay = JSON.parse(gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss));
  eq(replay.code, 'VOID_SUPERSEDED_BY_RESTORE');
  eq(s.grid.length - 1, 1, 'บิลที่เพิ่งกู้คืนถูกคำสั่งเก่าลบทิ้ง');
});
await t('FG-02: ยกเลิก "ใหม่" หลังกู้คืน ต้องยังทำได้ตามปกติ', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleTransaction(bill(), ss);
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  gas(store).handleTransaction(bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss);
  eq(JSON.parse(gas(store).handleVoidTransaction(bill({ voidedAt: 3000 }), ss)).status, 'success');
  eq(s.grid.length - 1, 0);
  ok(reg(store, 'TX-AUDIT-0001') > 0, 'ทะเบียนต้องกลับเป็นสถานะยกเลิก');
});
await t('FG-02: แอปต้องเลิกวนคำสั่งลบที่ถูกข้าม (ไม่ค้างในคิวตลอดไป)', async () => {
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'error', code: 'VOID_SUPERSEDED_BY_RESTORE', message: 'x' }) });
  eq(await app.postVoidDelete({ id: 'TX-1788700000000-AAAAAAAA', date: Date.now(), monthKey: '09-2026' }), true);
});
console.log('\n--- รอบตรวจซ้ำ: รูที่เหลือของ FG-02 + สิทธิ์ของเครื่องมือ reconcile ---');
await t('งานลบที่ไม่มี voidedAt (ค้างมาจากก่อนอัปเดต) ต้องไม่ลบบิลที่กู้คืนแล้ว', () => {
  const store = {}, g = gas(store), s = sheet(Array.from(g.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleTransaction(bill(), ss);
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  gas(store).handleTransaction(bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss);
  eq(s.grid.length - 1, 1);
  // งานที่ rebuildCloudOutboxFromBackup สร้างขึ้นก่อนอัปเดตจะได้ voidedAt = 0
  const r = JSON.parse(gas(store).handleVoidTransaction(bill({ voidedAt: 0 }), ss));
  eq(r.code, 'VOID_SUPERSEDED_BY_RESTORE');
  eq(s.grid.length - 1, 1, 'งานเก่าที่ไม่มีเวลา ยังลบบิลที่กู้คืนได้');
  // ไม่มีฟิลด์เลยก็ต้องกันเหมือนกัน
  const noField = bill(); delete noField.voidedAt;
  eq(JSON.parse(gas(store).handleVoidTransaction(noField, ss)).code, 'VOID_SUPERSEDED_BY_RESTORE');
  eq(s.grid.length - 1, 1);
});
await t('แอปห้ามปรับเวลาของงานลบเก่าแล้วส่งซ้ำ (client ห้ามล้มคำตัดสินของปลายทาง)', async () => {
  const job = { id: 'TX-1788700000000-AAAAAAAA', date: Date.now(), monthKey: '09-2026', voidedAt: 500 };
  let calls = 0;
  app.fetchWithTimeout = async () => { calls++; return { ok: true, json: async () =>
    ({ status: 'error', code: 'VOID_SUPERSEDED_BY_RESTORE', message: 'x', details: { restoredAt: 9000 } }) }; };
  eq(await app.postVoidDelete(job), true, 'ต้องทิ้งงาน ไม่ใช่เก็บไว้ยิงใหม่');
  eq(job.voidedAt, 500, 'ไปแก้เวลาของงานเองแล้วส่งซ้ำ');
  eq(calls, 1, 'ยิงซ้ำทั้งที่ปลายทางปฏิเสธไปแล้ว');
});
await t('เส้นทางจริงของการกู้ข้อมูล: งานลบที่ค้างของบิลที่กลับมามีชีวิต ต้องถูกทิ้ง', async () => {
  // ⚠️ ต้องเดินผ่าน applyBackupData ตัวจริง ไม่ใช่ยัด state เอง
  // เพราะการกู้ข้อมูล "สร้างคิวคลาวด์ใหม่จากเจตนาในไฟล์สำรอง" แล้วทิ้งคิวเดิมของเครื่องทั้งชุด
  // ด่านนี้ (alive.has) คือสิ่งที่กันไม่ให้คำสั่งลบเก่าไปลบบิลที่กู้กลับมา
  app.state.transactions = []; app.state.cloudOutbox = [{ id: 'cob-stale', createdAt: 1,
    dateKeys: [], monthKeys: ['09-2026'], needVoidDelete: true,
    voidDelete: { id: 'TX-AUDIT-0001', date: bill().date, monthKey: '09-2026', voidedBy: '', voidedAt: 500 },
    needSummary: false, needTelegram: false, telegramMessage: '', tries: 0, rev: 0 }];
  const file = {
    services: [], staff: [], customers: [], queue: [],
    transactions: [{ ...bill(), details: [], syncStatus: 'synced' }],
    shift: { active: false, startCash: 0, expenses: [], history: [] },
    pendingCloudWork: { schemaVersion: 1, voidDeletes: [
      { id: 'TX-AUDIT-0001', date: bill().date, monthKey: '09-2026', voidedBy: '', voidedAt: 500 }
    ], summaryDateKeys: [], summaryMonthKeys: [] }
  };
  await app.applyBackupData(file, { checkIds: false });
  eq(app.state.cloudOutbox.filter(x => x.needVoidDelete).length, 0,
     'คำสั่งลบของบิลที่กู้กลับมามีชีวิตยังค้างอยู่ในคิว');
  ok(app.state.transactions.some(t => t.id === 'TX-AUDIT-0001'), 'บิลไม่ได้กลับมาในเครื่อง');
});
await t('เคสของ Codex: ยกเลิกถึงชีตแล้ว → กู้คืน → คำสั่งเดิมถูกส่งซ้ำ บิลต้องอยู่ครบ', async () => {
  const store = {}, g0 = gas(store), s = sheet(Array.from(g0.BILL_HEADERS)), ss = { getSheetByName: () => s };
  const post = b2 => JSON.parse(b2.action === 'void_transaction'
    ? gas(store).handleVoidTransaction(b2, ss) : gas(store).handleTransaction(b2, ss));
  gas(store).handleTransaction(bill(), ss);
  gas(store).handleVoidTransaction(bill({ voidedAt: 500 }), ss);       // ยกเลิกถึงปลายทางแล้ว
  eq(s.grid.length - 1, 0);

  app.state.transactions = [{ ...bill(), details: [], syncStatus: 'pending', restoredAt: 9000 }];
  app.state.voidLog = [];
  app.state.cloudOutbox = [{ id: 'cob-old', createdAt: 500, dateKeys: [], monthKeys: ['09-2026'],
    needVoidDelete: true,
    voidDelete: { id: 'TX-AUDIT-0001', date: bill().date, monthKey: '09-2026', voidedBy: '', voidedAt: 500 },
    needSummary: false, needTelegram: false, telegramMessage: '', tries: 0, rev: 0 }];
  app.fetchWithTimeout = async (_u, o) => ({ ok: true, json: async () => post(JSON.parse(o.body)) });
  await app.syncPendingTransactions(true);
  eq(s.grid.length - 1, 1, 'กู้บิลกลับขึ้นชีตไม่สำเร็จ');
  ok(reg(store, 'TX-AUDIT-0001') < 0, 'ทะเบียนไม่ได้บันทึกการกู้คืน');

  app.syncDailySummary = app.syncMonthlySummary = async () => true;
  // ⚠️ เรียกเมธอดจริงจาก prototype — เทสต์ก่อนหน้าในไฟล์นี้ stub flushCloudOutbox ไว้ที่ instance
  const realFlush = Object.getPrototypeOf(app).flushCloudOutbox;
  await realFlush.call(app);
  await realFlush.call(app);   // รอบสอง: ถ้ามีกลไก "ปรับเวลาแล้วส่งซ้ำ" ความเสียหายจะโผล่ตรงนี้
  eq(s.grid.length - 1, 1, 'คำสั่งยกเลิกเก่าลบบิลที่เพิ่งกู้คืนทิ้ง');
  eq(app.state.cloudOutbox.filter(x => x.needVoidDelete).length, 0, 'งานลบต้องถูกทิ้ง ไม่ค้างวนซ้ำ');
});
await t('ยกเลิก "ใหม่" หลังกู้คืนยังต้องลบได้จริง (ด่านต้องไม่ล็อกของที่ควรผ่าน)', () => {
  const store = {}, g0 = gas(store), s = sheet(Array.from(g0.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleTransaction(bill(), ss);
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  gas(store).handleTransaction(bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss);
  eq(JSON.parse(gas(store).handleVoidTransaction(bill({ voidedAt: 3000 }), ss)).status, 'success');
  eq(s.grid.length - 1, 0);
});
await t('บันทึกสถานะกู้คืนไม่ได้ = ห้ามเขียนแถวและห้ามตอบว่าสำเร็จ', async () => {
  const store = {}, g0 = gas(store), s = sheet(Array.from(g0.BILL_HEADERS)), ss = { getSheetByName: () => s };
  gas(store).handleVoidTransaction(bill({ voidedAt: 1000 }), ss);
  const r = JSON.parse(gas(store, { writeError: true }).handleTransaction(
    bill({ allowVoidedRestore: true, restoredAt: 2000 }), ss));
  eq(r.status, 'error');
  eq(r.code, 'RESTORE_REGISTRY_FAILED');
  eq(s.grid.length - 1, 0, 'เขียนแถวทั้งที่ยืนยันทะเบียนไม่ได้');
  eq(reg(store, 'TX-AUDIT-0001') > 0, true, 'ทะเบียนต้องยังเป็นสถานะยกเลิก');
});
await t('แอปต้องถือ RESTORE_REGISTRY_FAILED เป็นของชั่วคราว (บิลค้าง pending เพื่อ retry)', async () => {
  app.state.transactions = [{ ...bill(), details: [], syncStatus: 'pending', restoredAt: 2000 }];
  app.fetchWithTimeout = async () => ({ ok: true, json: async () =>
    ({ status: 'error', code: 'RESTORE_REGISTRY_FAILED', message: 'x' }) });
  await app.syncPendingTransactions(true);
  eq(app.state.transactions[0].syncStatus, 'pending');
  ok(Number(app.state.transactions[0].restoredAt) > 0, 'สิทธิ์คืนบิลหายไปทั้งที่ยังส่งไม่สำเร็จ');
});
await t('พนักงานต้องใช้เครื่องมือตรวจความตรงกันไม่ได้เลย', async () => {
  const prevRole = app.currentRole;
  app.currentRole = 'staff';
  app.state.cloudOutbox = []; app.state.voidLog = [];
  app._reconcile = { months: ['09-2026'], errors: [], truncated: false, at: Date.now(), missing: [], mismatch: [], wrongTab: [],
    extra: [{ monthKey: '09-2026', id: 'TX-1788700000000-BBBBBBBB', when: '', customer: 'B', total: 200, idOk: true }] };
  app.state.transactions = [];
  let asked = null; app.showConfirm = (m, cb) => { asked = m; return cb(); };
  let fetched = 0; app.fetchWithTimeout = async () => { fetched++; return { ok: true, json: async () => ({ status: 'success', details: { bills: [] } }) }; };
  app.reconcileDeleteSheetBill('TX-1788700000000-BBBBBBBB');
  eq(asked, null, 'พนักงานสั่งลบแถวบนชีตได้');
  eq(app.state.cloudOutbox.length, 0);
  await app.runCloudReconcile();
  eq(fetched, 0, 'พนักงานอ่านรายการบิลย้อนหลังจากชีตได้');
  app.currentRole = prevRole;
});
await t('เจ้าของยังใช้ได้ตามปกติ (ด่านสิทธิ์ต้องไม่ล็อกคนที่ควรใช้ได้)', async () => {
  app.currentRole = 'owner';
  app.state.transactions = [];
  let fetched = 0;
  app.fetchWithTimeout = async () => { fetched++; return { ok: true, json: async () =>
    ({ status: 'success', details: { sheet: '09-2026', exists: true, truncated: false, bills: [] } }) }; };
  await app.runCloudReconcile();
  ok(fetched > 0, 'เจ้าของถูกล็อกไปด้วย');
  ok(app._reconcile && app._reconcile.months.length > 0);
});
await t('อ่านชีตไม่สำเร็จ ต้องไม่ขึ้นว่า "ตรงกัน"', () => {
  app.currentRole = 'owner';
  const base = { months: [], errors: [], truncated: false, at: Date.now(), extra: [], missing: [], mismatch: [], wrongTab: [] };
  const html = () => { app.renderReconcileResult(); return h.document.getElementById('reconcile-body').innerHTML; };

  app._reconcile = { ...base, errors: [{ monthKey: '09-2026', message: 'เครือข่ายขัดข้อง' }] };
  ok(/ยังสรุปไม่ได้ว่าตรงกัน/.test(html()), 'อ่านไม่ได้เลยแต่ขึ้นว่าตรงกัน');
  ok(!/ตรงกัน<\/b>/.test(html()) || !/circle-check/.test(html()), 'ยังขึ้นเครื่องหมายถูกสีเขียว');

  app._reconcile = { ...base, months: ['09-2026'], errors: [{ monthKey: '08-2026', message: 'x' }] };
  ok(/ยังสรุปไม่ได้ว่าตรงกัน/.test(html()), 'อ่านไม่ครบทุกเดือนแต่ขึ้นว่าตรงกัน');

  app._reconcile = { ...base, months: ['09-2026'], truncated: true };
  ok(/ยังสรุปไม่ได้ว่าตรงกัน/.test(html()), 'อ่านบิลไม่ครบแต่ขึ้นว่าตรงกัน');

  // อ่านครบและไม่พบความต่างจริง ๆ จึงจะขึ้นเขียวได้
  app._reconcile = { ...base, months: ['09-2026'] };
  ok(/circle-check/.test(html()), 'อ่านครบแล้วแต่ไม่ยอมบอกว่าตรงกัน');
});
await t('หน้าตั้งค่ามีปุ่มเข้าเครื่องมือนี้จริง', () => {
  ok(/app\.openReconcileModal\(\)/.test(HTML), 'ไม่มีปุ่มในหน้าตั้งค่า');
  ok(/id="modal-reconcile"/.test(HTML), 'ไม่มี modal');
  ok(/id="reconcile-body"/.test(HTML), 'ไม่มีที่วางผลตรวจ');
});
await t('กู้ข้อมูลเสร็จแล้วต้องชวนตรวจความตรงกัน', () => {
  ok(/suggestReconcileAfterRestore\(\)/.test(SRC));
  // ทั้งสามทางที่เปลี่ยนข้อมูลทั้งก้อน: นำเข้าไฟล์ · กู้จาก Drive · ย้อนกลับไปก่อนกู้
  eq((SRC.match(/this\.suggestReconcileAfterRestore\(\);/g) || []).length, 3);
  // ต้องไม่ยิงคำขออ่านชีตเอง — เปิดหน้าให้เจ้าของกดเริ่มตรวจเท่านั้น
  const fn = SRC.match(/  suggestReconcileAfterRestore\(\) \{[\s\S]*?\n  \}/)[0];
  ok(!/runCloudReconcile\(/.test(fn), 'ยิงคำขออ่านชีตเองอัตโนมัติ');
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
