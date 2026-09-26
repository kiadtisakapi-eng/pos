// ─────────────────────────────────────────────────────────────────────
//  ชุดทดสอบ "รอบแก้ชุด A" (ก.ย. 2569)
//  ครอบ 6 เรื่องที่แก้ในรอบนี้:
//    1) รหัส (ID) จากไฟล์นำเข้าต้องแทรกโค้ดเข้า onclick ไม่ได้
//    2) ราคาบริการที่เป็นข้อความต้องไม่ทำให้ยอดตะกร้าต่อสตริงแทนการบวก
//    3) เพิ่มค่าใช้จ่ายแล้วบันทึกไม่สำเร็จ ต้องถอนรายการและไม่ล้างฟอร์ม
//    4) ส่งบิลค้างต้องจบก่อนยิง outbox (กันบิลที่ยกเลิกแล้วกลับมาบนชีต)
//    5) Apps Script ต้องปฏิเสธคำสั่งที่ไม่รู้จัก แทนที่จะตกไปบันทึกเป็นบิล
//    6) Apps Script ต้องปฏิเสธเลขที่บิลผิดรูปแบบก่อนแตะชีต
//
//  ⚠️ ทุกข้อในไฟล์นี้ต้อง "ไม่ผ่าน" เมื่อรันกับโค้ดก่อนแก้
//     ถ้าเอาไปรันกับของเก่าแล้วผ่านหมด แปลว่าเทสต์ไม่ได้ตรวจอะไรเลย (ดู pos-testing-traps)
// ─────────────────────────────────────────────────────────────────────
const fs = require('fs'), vm = require('vm'), path = require('path');
const h = require('./harness.js');
const app = h.ctx.app;

let pass = 0, fail = 0;
const t = (name, fn) => {
  try {
    const r = fn();
    if (r instanceof Promise) return r.then(() => { pass++; console.log('  PASS', name); },
                                            e => { fail++; console.log('  FAIL', name, '->', e.message); });
    pass++; console.log('  PASS', name);
  } catch (e) { fail++; console.log('  FAIL', name, '->', e.message); }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

const toasts = [];
app.showToast = (m, ty) => toasts.push({ m, ty });
app.vibrateDevice = () => {};

// สตริงโจมตีจริงที่รายงานผลตรวจใช้ — ปิดสตริงของ onclick แล้วต่อโค้ดของตัวเอง
const EVIL_ID = "x');window.__auditMarker=1;//";

(async () => {

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 1) รหัสจากไฟล์นำเข้าแทรกโค้ดไม่ได้ ---');
// ══════════════════════════════════════════════════════════════════
const baseFile = () => ({
  services: [{ id: 's1', name: 'ตัดผม', price: 300, category: 'barber' }],
  staff: [{ id: 'st-1', name: 'เอ' }],
  transactions: [],
  categories: [{ id: 'barber', name: 'ตัดผมชาย' }],
  customers: [], queue: []
});

t('ไฟล์ปกติยังผ่านเหมือนเดิม', () => ok(app.isValidBackupObject(baseFile())));

t('รหัสของเริ่มต้น (s1 / barber / premium) ยังผ่าน', () => {
  const f = baseFile();
  f.categories = [{ id: 'barber' }, { id: 'massage' }, { id: 'premium' }];
  f.services = [{ id: 's9', price: 100, category: 'premium' }];
  ok(app.isValidBackupObject(f));
});

t('รหัสที่ระบบสร้างเอง (cat-…/s-…/st-…/c-…/q-…) ยังผ่าน', () => {
  const f = baseFile();
  f.categories = [{ id: 'cat-1757000000000-ab12cd' }];
  f.services   = [{ id: 's-1757000000000-xy99zz', price: 1, category: 'cat-1757000000000-ab12cd' }];
  f.staff      = [{ id: 'st-1757000000000-qq11ww' }];
  f.customers  = [{ id: 'c-1757000000000-ee22rr' }];
  f.queue      = [{ id: 'q-1757000000000-tt33' }];
  ok(app.isValidBackupObject(f));
});

t('ไฟล์เก่าที่ id เป็นตัวเลข ยังกู้ได้', () => {
  const f = baseFile();
  f.services = [{ id: 1, name: 'ตัดผม', price: 200 }];
  f.staff = [{ id: 2, name: 'บี' }];
  delete f.categories;
  ok(app.isValidBackupObject(f));
});

t('หมวดที่มีรหัสแทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.categories = [{ id: EVIL_ID, name: 'หมวดปลอม' }];
  eq(app.isValidBackupObject(f), false);
});
t('บริการที่มีรหัสแทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.services = [{ id: EVIL_ID, name: 'บริการปลอม', price: 1 }];
  eq(app.isValidBackupObject(f), false);
});
t('พนักงานที่มีรหัสแทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.staff = [{ id: EVIL_ID, name: 'พนักงานปลอม' }];
  eq(app.isValidBackupObject(f), false);
});
t('ลูกค้าที่มีรหัสแทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.customers = [{ id: EVIL_ID }];
  eq(app.isValidBackupObject(f), false);
});
t('คิวที่มีรหัสแทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.queue = [{ id: EVIL_ID }];
  eq(app.isValidBackupObject(f), false);
});
t('หมวดของบริการที่แทรกโค้ด -> ปฏิเสธทั้งไฟล์', () => {
  const f = baseFile(); f.services = [{ id: 's1', price: 1, category: EVIL_ID }];
  eq(app.isValidBackupObject(f), false);
});
t('รหัสที่มีอัญประกาศเดี่ยวเฉย ๆ ก็ไม่รับ', () => {
  const f = baseFile(); f.categories = [{ id: "a'b" }];
  eq(app.isValidBackupObject(f), false);
});
t('รหัสยาวเกิน 64 ตัว -> ไม่รับ', () => {
  const f = baseFile(); f.categories = [{ id: 'a'.repeat(65) }];
  eq(app.isValidBackupObject(f), false);
});
t('รหัสว่าง / หายไป -> ไม่รับ', () => {
  const f = baseFile(); f.categories = [{ name: 'ไม่มี id' }];
  eq(app.isValidBackupObject(f), false);
});
t('ปฏิเสธแล้วต้องบอกได้ว่าติดตรงไหน (กู้ข้อมูลฉุกเฉินต้องไม่มืดแปดด้าน)', () => {
  const f = baseFile(); f.staff = [{ id: EVIL_ID }];
  app.isValidBackupObject(f);
  ok(/staff/.test(app._lastBackupRejectReason || ''), app._lastBackupRejectReason);
});
t('ไฟล์ที่ผ่าน -> ไม่มีเหตุผลปฏิเสธค้างจากรอบก่อน', () => {
  app.isValidBackupObject(baseFile());
  eq(app._lastBackupRejectReason, '');
});

// ── ด่านที่สอง: ต่อให้ข้อมูลแบบนั้นอยู่ในเครื่องแล้ว ก็ต้องไม่กลายเป็นโค้ดตอนแสดงผล ──
console.log('\n  · ด่านที่สอง — ตรวจผ่าน "ทางที่ผู้ใช้เดินจริง" (HTML ที่ขึ้นจอ)');
t('safeId() คืนค่าว่างให้รหัสอันตราย และคืนค่าเดิมให้รหัสปกติ', () => {
  eq(h.ctx.safeId(EVIL_ID), '');
  eq(h.ctx.safeId('cat-1757000000000-ab12cd'), 'cat-1757000000000-ab12cd');
  eq(h.ctx.safeId('barber'), 'barber');
});

t('renderPos(): รหัสอันตรายต้องไม่โผล่ใน onclick ที่ขึ้นจอ', () => {
  app.state.categories = [{ id: EVIL_ID, name: 'หมวดปลอม', icon: 'fa-tag' }];
  app.state.services = [];
  app.state.selectedCategory = 'all';
  app.renderPos();
  const html = h.document.getElementById('category-tabs').innerHTML;
  ok(!html.includes('__auditMarker'), 'โค้ดที่แนบมาหลุดเข้า HTML: ' + html.slice(0, 200));
  ok(!html.includes("');"), "สตริงใน onclick ถูกปิดก่อนกำหนด: " + html.slice(0, 200));
});

t('renderPos(): หมวดปกติยังผูกปุ่มได้เหมือนเดิม', () => {
  app.state.categories = [{ id: 'barber', name: 'ตัดผมชาย', icon: 'fa-scissors' }];
  app.renderPos();
  const html = h.document.getElementById('category-tabs').innerHTML;
  ok(html.includes("app.selectPosCategory('barber')"), html.slice(0, 200));
});

console.log('\n  · เส้นทางย้อนกลับ "สำเนาก่อนกู้ข้อมูล" ต้องไม่ตันเพราะกฎ ID');
t('สำเนาของแอปเอง (checkIds:false) ต้องอ่านได้แม้มี ID แปลก', () => {
  const f = baseFile(); f.categories = [{ id: EVIL_ID, name: 'ข้อมูลเก่าที่เคยนำเข้ามา' }];
  eq(app.isValidBackupObject(f, { checkIds: false }), true);
  eq(app.isValidBackupObject(f), false);   // ไฟล์จากภายนอกยังต้องถูกปฏิเสธเหมือนเดิม
});
t('checkIds:false ยังตรวจโครงสร้างอยู่ ไม่ได้ปล่อยผ่านทุกอย่าง', () => {
  eq(app.isValidBackupObject({ services: 'ไม่ใช่อาเรย์' }, { checkIds: false }), false);
});
await t('เดินทางจริง: เซฟสำเนาตอนข้อมูลในเครื่องมี ID แปลก แล้วต้องยังอ่านกลับได้', async () => {
  const keep = { services: app.state.services, staff: app.state.staff, transactions: app.state.transactions, categories: app.state.categories };
  app.state.services     = [{ id: 's1', name: 'ตัดผม', price: 300 }];
  app.state.staff        = [{ id: 'st-1', name: 'เอ' }];
  app.state.transactions = [];
  // จำลองข้อมูลที่ค้างมาจากก่อนมีด่านนี้ (เคยนำเข้าไฟล์แบบนั้นไปแล้ว)
  app.state.categories   = [{ id: EVIL_ID, name: 'หมวดที่ค้างมาแต่เดิม' }];
  await app.savePreRestoreSnapshot();
  const snap = await app.readPreRestoreSnapshot();
  ok(snap !== null, 'ปุ่มย้อนกลับหายไปทั้งที่สำเนายังอยู่ในเครื่อง');
  Object.assign(app.state, keep);
});

console.log('\n  · ผลตรวจไฟล์ต้องเตือนเรื่องราคาบริการด้วย');
t('ราคาบริการเสีย -> audit ไม่ clean และมีข้อความบอก', () => {
  const a = app.auditBackupData({ transactions: [], services: [{ id: 's1', price: 'พัง' }] });
  eq(a.badServices, 1); eq(a.clean, false);
  ok(/ราคาใช้ไม่ได้/.test(app.describeBackupAudit(a)), app.describeBackupAudit(a));
});
t('ไฟล์ปกติ -> ยังนับว่า clean เหมือนเดิม', () => {
  const a = app.auditBackupData({ transactions: [], services: [{ id: 's1', price: 300 }] });
  eq(a.badServices, 0); eq(a.clean, true);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 2) ราคาบริการที่เป็นข้อความ ---');
// ══════════════════════════════════════════════════════════════════
t('sanitizeBackupData แปลงราคา "300" เป็นตัวเลข 300', () => {
  const f = { services: [{ id: 's1', name: 'ตัดผม', price: '300', duration: '45', commission: '10', commissionType: 'percent' }] };
  app.sanitizeBackupData(f);
  eq(f.services[0].price, 300); eq(f.services[0].duration, 45); eq(f.services[0].commission, 10);
});
t('ราคาติดลบ -> ปัดเป็น 0 (ไม่ปล่อยให้แจกเงิน)', () => {
  const f = { services: [{ id: 's1', price: -50, duration: 30, commission: 10 }] };
  app.sanitizeBackupData(f); eq(f.services[0].price, 0);
});
t('ราคาที่แปลงเป็นตัวเลขไม่ได้ -> 0', () => {
  const f = { services: [{ id: 's1', price: 'สามร้อย', duration: 30, commission: 10 }] };
  app.sanitizeBackupData(f); eq(f.services[0].price, 0);
});
t('ชนิดค่าคอมที่ไม่รู้จัก -> กลับเป็น percent', () => {
  const f = { services: [{ id: 's1', price: 100, commissionType: 'อะไรก็ไม่รู้' }] };
  app.sanitizeBackupData(f); eq(f.services[0].commissionType, 'percent');
});

console.log('\n  · ทางจริง — หยิบใส่ตะกร้าแล้วยอดต้องบวกกัน ไม่ใช่ต่อสตริง');
t('ราคา "300" สองรายการ ต้องได้ 600 ไม่ใช่ "0300300"', () => {
  app.state.staff = [{ id: 'st-1', name: 'เอ' }];
  app.state.services = [{ id: 's1', name: 'ตัดผม', price: '300', duration: 30, commission: 10, commissionType: 'percent', category: 'barber' }];
  app.state.cart = [];
  app.renderCart = () => {};
  app.addToCart('s1'); app.addToCart('s1');
  const sub = app.getCartSubtotal();
  eq(sub, 600);
  eq(typeof sub, 'number');
});
t('ราคาที่ใช้คิดเงินไม่ได้ -> ไม่ยอมใส่ตะกร้า และเตือนผู้ใช้', () => {
  app.state.services = [{ id: 's-bad', name: 'บริการพัง', price: 'ไม่ใช่ตัวเลข', duration: 30 }];
  app.state.cart = [];
  toasts.length = 0;
  app.addToCart('s-bad');
  eq(app.state.cart.length, 0);
  ok(toasts.some(x => x.ty === 'error'), JSON.stringify(toasts));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 3) เพิ่มค่าใช้จ่ายแล้วบันทึกไม่สำเร็จ ---');
// ══════════════════════════════════════════════════════════════════
const setupExpense = (amount) => {
  app.state.shift = { active: true, startTime: Date.now(), startCash: 0, expenses: [], history: [] };
  app.currentUser = { name: 'เอ' };
  // ตั้งแต่ ก.ย. 2569 addExpense ตรวจสิทธิ์เอง — ต้องมีตำแหน่งที่ล็อกอินอยู่จริง
  // (ถ้าไม่ตั้ง เทสต์ข้างล่างจะ "ผ่าน" เพราะถูกปฏิเสธที่ด่านสิทธิ์ ไม่ได้ตรวจการบันทึกเลย)
  app.currentRole = 'staff';
  app.renderDashboard = () => {};
  h.document.getElementById('expense-type').value = 'other';
  h.document.getElementById('expense-amount').value = String(amount);
  h.document.getElementById('expense-note').value = 'ค่าน้ำแข็ง';
};

await t('บันทึกไม่สำเร็จ -> ไม่มีรายการค้างในหน่วยความจำ', async () => {
  setupExpense(250);
  app.saveState = async () => false;          // จำลอง IndexedDB เขียนไม่ผ่าน
  toasts.length = 0;
  await app.addExpense(null);
  eq(app.state.shift.expenses.length, 0);
});
t('บันทึกไม่สำเร็จ -> ฟอร์มยังมีข้อมูลเดิม (กดซ้ำได้ไม่ต้องพิมพ์ใหม่)', () => {
  eq(h.document.getElementById('expense-amount').value, '250');
  eq(h.document.getElementById('expense-note').value, 'ค่าน้ำแข็ง');
});
t('บันทึกไม่สำเร็จ -> เตือนผู้ใช้ ไม่เงียบ', () =>
  ok(toasts.some(x => x.ty === 'error'), JSON.stringify(toasts)));
await t('กดซ้ำหลังบันทึกไม่สำเร็จ ต้องไม่เกิดรายการซ้ำ', async () => {
  await app.addExpense(null);
  eq(app.state.shift.expenses.length, 0);
});
await t('บันทึกสำเร็จ -> ได้รายการ 1 รายการ และฟอร์มถูกล้าง', async () => {
  setupExpense(250);
  app.saveState = async () => true;
  await app.addExpense(null);
  eq(app.state.shift.expenses.length, 1);
  eq(app.state.shift.expenses[0].amount, 250);
  eq(h.document.getElementById('expense-amount').value, '');
  eq(h.document.getElementById('expense-note').value, '');
});

console.log('\n  · เคสขอบของ safeId ที่เกิดได้จริงในแอป');
t('uniqueCartId ที่แอปสร้างเอง ต้องไม่ถูก safeId ตัดทิ้ง', () => {
  for (let i = 0; i < 300; i++) {
    const uid = Date.now() + Math.random().toString(36).substr(2, 5);
    eq(h.ctx.safeId(uid), String(uid), 'รอบที่ ' + i);
  }
});
t('รหัสบิลรูปแบบจริง (TX-…) ผ่าน safeId', () => {
  const id = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
  eq(h.ctx.safeId(id), id);
});
t('รหัสค่าใช้จ่ายรูปแบบจริง (exp_…) ผ่าน safeId', () => {
  const id = 'exp_' + Date.now();
  eq(h.ctx.safeId(id), id);
});
t('safeId รับตัวเลขได้ (ข้อมูลเก่า)', () => eq(h.ctx.safeId(1), '1'));
t('กฎที่ต้องเป็นจริงเสมอ: ผ่านด่านนำเข้า => safeId ต้องไม่ตัดทิ้ง', () => {
  const cases = ['barber', 's1', 'cat-1757000000000-ab12cd', 'exp_1757000000000', 'TX-1-ABCDEFGH',
                 1, 0, -1, 1.5, 1e21, NaN, Infinity, '', 'a'.repeat(65), "a'b", 'ก', 'a b', null, undefined, {}];
  cases.forEach(v => {
    if (h.ctx.isSafeEntityId(v)) ok(h.ctx.safeId(v) !== '', `ผ่านด่านแต่ safeId ตัดทิ้ง: ${String(v)}`);
  });
  // เคสที่เคยไม่ตรงกัน — ต้องถูกปฏิเสธทั้งสองฝั่ง
  eq(h.ctx.isSafeEntityId(1.5), false);
  eq(h.ctx.isSafeEntityId(1e21), false);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 4) ลำดับงานคลาวด์: บิลก่อน outbox ---');
// ══════════════════════════════════════════════════════════════════
await t('ส่งบิลให้จบก่อนค่อยยิง outbox', async () => {
  app.googleSheetsUrl = 'https://gas/exec';
  app.googleSheetsApiToken = 'A'.repeat(24);
  const order = [];
  app.syncPendingTransactions = async () => { await new Promise(r => setTimeout(r, 5)); order.push('tx'); };
  app.flushCloudOutbox = async () => { order.push('outbox'); };
  await app.resumePendingCloudWork();
  eq(order, ['tx', 'outbox']);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 5+6) ด่านฝั่ง Apps Script ---');
// ══════════════════════════════════════════════════════════════════
const gctx = { console: { log(){}, warn(){}, error(){} }, Date, JSON, String, Number, Math, Array, Object, isNaN, isFinite, parseInt, parseFloat };
gctx.ContentService = { createTextOutput: s => ({ setMimeType: () => s }), MimeType: { JSON: 'json', TEXT: 'text' } };
gctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
gctx.Utilities = { formatDate: () => '2026-09-07 12:00', getUuid: () => 'uuid' };
gctx.Session = { getScriptTimeZone: () => 'Asia/Bangkok' };
gctx.Logger = { log() {} };
const props = { POS_API_TOKEN: 'T'.repeat(32) };
gctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) };
gctx.SpreadsheetApp = { flush() {}, getActiveSpreadsheet: () => fakeSS };
vm.createContext(gctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google_apps_script.js'), 'utf8'), gctx, { filename: 'gas.js' });

// ชีตปลอมแบบย่อ พอสำหรับตรวจว่า "แตะข้อมูลหรือเปล่า"
function FakeSheet(headers, rows) {
  const grid = [headers.slice(), ...(rows || []).map(r => r.slice())];
  return {
    _grid: grid,
    getLastColumn: () => grid[0].length,
    getLastRow: () => grid.length,
    getRange: (r, c, nr, nc) => ({
      getDisplayValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) row.push(String((grid[r - 1 + i] || [])[c - 1 + j] ?? '')); o.push(row); } return o; },
      getValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) row.push((grid[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
      setValue: () => {}, setValues: () => {}, setBackground(){return this;}, setFontColor(){return this;},
      setFontWeight(){return this;}, setNumberFormat(){return this;}, setHorizontalAlignment(){return this;}
    }),
    appendRow: r => grid.push(r.slice()),
    deleteRow: r => grid.splice(r - 1, 1),
    insertColumnBefore: () => {}, autoResizeColumns: () => {}, setFrozenRows: () => {}
  };
}
const HEAD = gctx.BILL_HEADERS;
let billSheet, fakeSS;
const resetSheets = () => {
  billSheet = FakeSheet(HEAD, [
    ['TX-1757000000000-AAAAAAAA', '2026-09-01 12:00', 'ลูกค้า', 'ตัดผม', 'เงินสด', 300, 0, 300, 0, 0, 0, 300, 'เอ'],
    ['', '2026-09-01 13:00', 'แถวที่เลขบิลว่าง', 'นวด', 'เงินสด', 500, 0, 500, 0, 0, 0, 500, 'บี']
  ]);
  fakeSS = { getSheetByName: n => (n === '09-2026' ? billSheet : null), getSheets: () => [billSheet], insertSheet: () => billSheet };
};
const post = body => JSON.parse(gctx.doPost({ postData: { contents: JSON.stringify(body) } }));
const SECRET = 'T'.repeat(32);

console.log('\n  · คำสั่งที่ไม่รู้จัก');
resetSheets();
let r = post({ secret: SECRET, action: 'summary_monthh', id: 'TX-1757000000000-BBBBBBBB', total: 500, subtotal: 500, discount: 0, monthKey: '09-2026', date: '2026-09-01T12:00:00+07:00' });
t('คำสั่งพิมพ์ผิด -> INVALID_ACTION', () => { eq(r.status, 'error'); eq(r.code, 'INVALID_ACTION'); });
t('คำสั่งพิมพ์ผิด -> ต้องไม่แอบบันทึกเป็นบิล', () => eq(billSheet._grid.length, 3));

resetSheets();
r = post({ secret: SECRET, action: '__proto__' });
t('ชื่อคำสั่งที่เป็นสมบัติของ Object -> ยังปฏิเสธ', () => eq(r.code, 'INVALID_ACTION'));

resetSheets();
r = post({ secret: SECRET, id: 'TX-1757000000000-CCCCCCCC', total: 400, subtotal: 400, discount: 0, monthKey: '09-2026', date: '2026-09-01T14:00:00+07:00' });
t('client รุ่นเก่าที่ไม่ส่ง action -> ยังบันทึกบิลได้ตามเดิม', () => { eq(r.status, 'success'); eq(billSheet._grid.length, 4); });

console.log('\n  · เลขที่บิลตอนสั่งยกเลิก');
resetSheets();
r = post({ secret: SECRET, action: 'void_transaction', id: '', monthKey: '09-2026', date: '2026-09-01T12:00:00+07:00' });
t('เลขที่บิลว่าง -> INVALID_BILL_ID', () => eq(r.code, 'INVALID_BILL_ID'));
t('เลขที่บิลว่าง -> ต้องไม่ลบแถวที่ช่องเลขบิลว่างทิ้ง', () => { eq(billSheet._grid.length, 3); eq(billSheet._grid[2][2], 'แถวที่เลขบิลว่าง'); });

resetSheets();
r = post({ secret: SECRET, action: 'void_transaction', monthKey: '09-2026', date: '2026-09-01T12:00:00+07:00' });
t('ไม่ส่งเลขที่บิลมาเลย -> INVALID_BILL_ID และไม่ลบอะไร', () => { eq(r.code, 'INVALID_BILL_ID'); eq(billSheet._grid.length, 3); });

resetSheets();
r = post({ secret: SECRET, action: 'void_transaction', id: "TX-1');DROP", monthKey: '09-2026', date: '2026-09-01T12:00:00+07:00' });
t('เลขที่บิลผิดรูปแบบ -> INVALID_BILL_ID และไม่ลบอะไร', () => { eq(r.code, 'INVALID_BILL_ID'); eq(billSheet._grid.length, 3); });

resetSheets();
r = post({ secret: SECRET, action: 'void_transaction', id: 'TX-1757000000000-AAAAAAAA', monthKey: '09-2026', date: '2026-09-01T12:00:00+07:00' });
t('เลขที่บิลถูกต้อง -> ยังลบได้ตามปกติ', () => { eq(r.status, 'success'); eq(billSheet._grid.length, 2); });

console.log('\n  · ฝั่งแอปต้องไม่วน retry กับเลขที่บิลที่ปลายทางไม่มีวันรับ');
await t('postVoidDelete เจอ INVALID_BILL_ID -> เลิกลอง และเตือนเจ้าของ', async () => {
  app.googleSheetsUrl = 'https://gas/exec'; app.googleSheetsApiToken = 'A'.repeat(24);
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'error', code: 'INVALID_BILL_ID', message: 'เลขที่บิลไม่ถูกต้อง' }) });
  toasts.length = 0;
  const res = await app.postVoidDelete({ id: 'พัง', date: Date.now() });
  eq(res, true);
  ok(toasts.some(x => x.ty === 'warning'), JSON.stringify(toasts));
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- 7) กันรายงานผลตรวจหลุดขึ้น repo สาธารณะ ---');
// ══════════════════════════════════════════════════════════════════
t('.gitignore กันโฟลเดอร์ audit/ ไว้แล้ว', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  ok(/^audit\/\s*$/m.test(gi), 'ไม่พบบรรทัด audit/ ใน .gitignore');
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
