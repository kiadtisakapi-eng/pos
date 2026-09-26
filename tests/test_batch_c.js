// ─────────────────────────────────────────────────────────────────────
//  ชุดทดสอบ "รอบแก้ชุด C" (ก.ย. 2569)
//    ข้อ 5 ไฟล์สำรองต้องพา "งานคลาวด์ที่ค้าง" ไปด้วย และกู้กลับมาได้
//    ข้อ 2 หน้าต่างที่สองต้องเขียนทับยอดขายไม่ได้
//
//  ⚠️ ทุกข้อต้อง "ไม่ผ่าน" เมื่อรันกับโค้ดก่อนแก้ (ดู pos-testing-traps)
// ─────────────────────────────────────────────────────────────────────
const h = require('./harness.js');
const app = h.ctx.app;
let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r instanceof Promise) return r.then(()=>{pass++;console.log('  PASS',n)},e=>{fail++;console.log('  FAIL',n,'->',e.message)}); pass++; console.log('  PASS', n); } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

const toasts = [];
app.showToast = (m, ty) => toasts.push({ m, ty });
app.vibrateDevice = () => {};
app.renderEveryScreen = () => {};

const BILL_ID = 'TX-1757000000000-AAAAAAAA';
const voidJob = (id) => ({
  id: 'cob-1', createdAt: Date.now(), dateKeys: ['2026-09-01'], monthKeys: ['09-2026'],
  needVoidDelete: true,
  voidDelete: { id: id || BILL_ID, date: '2026-09-01T14:00:00+07:00', monthKey: '09-2026', voidedBy: 'เอ' },
  needSummary: true, needTelegram: true, telegramMessage: 'ยกเลิกบิลเมื่อวาน', tries: 0
});
const baseState = () => {
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของ' };   // กู้ข้อมูล = งานของเจ้าของ
  app.state.services = [{ id: 's1', name: 'ตัดผม', price: 300 }];
  app.state.staff = [{ id: 'st-1', name: 'เอ' }];
  app.state.transactions = [];
  app.state.categories = [{ id: 'barber', name: 'ตัดผมชาย' }];
  app.state.customers = []; app.state.queue = [];
  app.state.voidLog = []; app.state.expenseLog = [];
  app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
  app.state.cloudOutbox = [];
  app.loadFailed = false;
  app.isReadOnlyWindow = false;
};

(async () => {

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 5.1 ไฟล์สำรองต้องพางานค้างไปด้วย ---');
// ══════════════════════════════════════════════════════════════════
baseState();
app.state.cloudOutbox = [voidJob()];
let payload = app.buildBackupPayload();

t('ไฟล์สำรองมีส่วน pendingCloudWork', () => ok(payload.pendingCloudWork, JSON.stringify(Object.keys(payload))));
t('เก็บคำสั่งลบบิลไว้ครบ พร้อมเดือนเดิมของบิล', () => {
  eq(payload.pendingCloudWork.voidDeletes.length, 1);
  eq(payload.pendingCloudWork.voidDeletes[0].id, BILL_ID);
  eq(payload.pendingCloudWork.voidDeletes[0].monthKey, '09-2026');
});
t('เก็บงวดที่ต้องรีเฟรชสรุป', () => {
  eq(payload.pendingCloudWork.summaryDateKeys, ['2026-09-01']);
  eq(payload.pendingCloudWork.summaryMonthKeys, ['09-2026']);
});
t('⚠️ ต้องไม่เก็บข้อความ Telegram (กันแจ้งเตือนเก่าย้อนหลังทั้งกอง)', () =>
  ok(!JSON.stringify(payload.pendingCloudWork).includes('ยกเลิกบิลเมื่อวาน'), JSON.stringify(payload.pendingCloudWork)));
t('⚠️ ต้องไม่เก็บ token ใด ๆ', () => {
  const s = JSON.stringify(payload);
  ok(!/telegramToken|googleSheetsApiToken|ownerPin/.test(s), 'มี token หลุดในไฟล์สำรอง');
});
t('เวอร์ชันไฟล์สำรองถูกบวกเป็น 3', () => eq(payload.backupSchemaVersion, 3));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 5.2 กู้แล้วต้องได้งานลบคืนมา ---');
// ══════════════════════════════════════════════════════════════════
baseState();
app.saveState = async () => true;
await app.applyBackupData(JSON.parse(JSON.stringify(payload)));

t('outbox หลังกู้มีคำสั่งลบบิลกลับมา', () => {
  const jobs = app.state.cloudOutbox.filter(x => x.needVoidDelete);
  eq(jobs.length, 1); eq(jobs[0].voidDelete.id, BILL_ID); eq(jobs[0].voidDelete.monthKey, '09-2026');
});
t('งานรีเฟรชสรุปกลับมาด้วย', () => {
  const s = app.state.cloudOutbox.filter(x => x.needSummary);
  eq(s.length, 1); eq(s[0].dateKeys, ['2026-09-01']); eq(s[0].monthKeys, ['09-2026']);
});
t('⚠️ ห้ามมีงาน Telegram หลงมาแม้แต่งานเดียว', () =>
  eq(app.state.cloudOutbox.filter(x => x.needTelegram).length, 0));
t('บอกเจ้าของว่ากู้งานค้างคืนมาด้วย', () =>
  ok(toasts.some(x => /ค้างส่งขึ้นชีต/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 5.3 กันลบบิลที่ยังมีชีวิตอยู่ ---');
// ══════════════════════════════════════════════════════════════════
baseState(); toasts.length = 0;
const dangerous = JSON.parse(JSON.stringify(payload));
dangerous.transactions = [{ id: BILL_ID, date: '2026-09-01T14:00:00+07:00', total: 300 }];  // บิลใบนี้ "ยังอยู่"
await app.applyBackupData(dangerous);
t('บิลที่ยังอยู่ในข้อมูลที่กู้มา -> ต้องไม่สร้างคำสั่งลบ', () =>
  eq(app.state.cloudOutbox.filter(x => x.needVoidDelete).length, 0));
t('และต้องเตือนว่าข้ามไป ไม่ใช่เงียบ', () =>
  ok(toasts.some(x => /ข้ามคำสั่งลบบิล/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 5.4 ข้อมูลเสีย/ไฟล์รุ่นเก่า ---');
// ══════════════════════════════════════════════════════════════════
baseState(); toasts.length = 0;
const old = JSON.parse(JSON.stringify(payload));
delete old.pendingCloudWork; old.backupSchemaVersion = 2;
old.voidLog = [{ billId: BILL_ID, date: Date.now(), by: 'เอ' }];
await app.applyBackupData(old);
t('ไฟล์รุ่นเก่าที่เคยมีการยกเลิกบิล -> เตือนว่าอาจมีแถวค้างบนชีต', () =>
  ok(toasts.some(x => x.ty === 'warning' && /ค้างอยู่บนชีต/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));
t('ไฟล์รุ่นเก่ายังกู้ได้ตามปกติ ไม่ล้ม', () => eq(app.state.services.length, 1));

baseState();
const junk = JSON.parse(JSON.stringify(payload));
junk.pendingCloudWork = { voidDeletes: [{ id: "x');alert(1)//", monthKey: '09-2026' }, { id: BILL_ID, monthKey: 'ไม่ใช่เดือน' }] };
await app.applyBackupData(junk);
t('รหัสบิลผิดรูป / เดือนผิดรูป -> ไม่สร้างงานลบ', () =>
  eq(app.state.cloudOutbox.filter(x => x.needVoidDelete).length, 0));

t('pendingCloudWork ที่ไม่ใช่อ็อบเจกต์ -> ปฏิเสธไฟล์', () => {
  const bad = JSON.parse(JSON.stringify(payload)); bad.pendingCloudWork = 'พัง';
  eq(app.isValidBackupObject(bad), false);
});
t('voidDeletes ที่ไม่ใช่อาเรย์ -> ปฏิเสธไฟล์', () => {
  const bad = JSON.parse(JSON.stringify(payload)); bad.pendingCloudWork = { voidDeletes: 'พัง' };
  eq(app.isValidBackupObject(bad), false);
});
t('ไฟล์ v3 ปกติยังผ่าน validation', () => eq(app.isValidBackupObject(JSON.parse(JSON.stringify(payload))), true));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 5.5 voidLog ต้องจำวัน/เดือนเดิมของบิล ---');
// ══════════════════════════════════════════════════════════════════
baseState();
app.currentRole = 'owner';
app.currentUser = { name: 'เจ้าของ' };
app.state.transactions = [{ id: BILL_ID, date: '2026-09-01T14:00:00+07:00', total: 300, services: [], details: [], syncStatus: 'synced' }];
app.showConfirm = (m, cb) => { app._p = cb(); return app._p; };
app.hasCloudSetupStarted = () => false;
app.renderAll = () => {};
app.saveState = async () => true;
// ⚠️ voidTransaction() อ่านเลขที่บิลจากช่องในหน้าต่างแก้ไข ไม่ใช่จากพารามิเตอร์
h.document.getElementById('edit-tx-id').value = BILL_ID;
app.state.shift = app.state.shift || {};
h.document._els['void-money-outcome'] = { value: 'refunded' };   // ข้อ 16: ต้องระบุก่อนว่าเงินเคลื่อนไหวจริงไหม
await app.voidTransaction();
await app._p;
t('voidLog เก็บวันของบิลเดิม ไม่ใช่แค่เวลาที่กดยกเลิก', () => {
  const v = app.state.voidLog[0];
  ok(v, 'ไม่มี voidLog');
  eq(v.billMonthKey, '09-2026');
  ok(v.billDate, 'ไม่มี billDate');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- ข้อ 2 หน้าต่างที่สองต้องเขียนไม่ได้ ---');
// ══════════════════════════════════════════════════════════════════
baseState();
delete app.saveState;                                    // ใช้ตัวจริง
const realSave = Object.getPrototypeOf(app).saveState.bind(app);
app.isReadOnlyWindow = false;
await t('หน้าต่างหลัก: saveState ทำงานปกติ', async () => eq(await realSave(), true));

app.isReadOnlyWindow = true;
toasts.length = 0;
await t('หน้าต่างอ่านอย่างเดียว: saveState ถูกปฏิเสธ', async () => eq(await realSave(), false));
t('และเตือนผู้ใช้ ไม่เงียบ', () => ok(toasts.some(x => x.ty === 'error' && /เปิดซ้ำ/.test(x.m)), JSON.stringify(toasts)));

await t('saveStateOrThrow โยน error -> ทางเดินเงินจะ rollback ให้เอง', async () => {
  let threw = false;
  try { await app.saveStateOrThrow('การขาย'); } catch (e) { threw = true; }
  ok(threw, 'ไม่โยน error = บิลจะถูกบันทึกลงจอทั้งที่ไม่ได้ลงเครื่อง');
});

await t('เตือนซ้ำถูกเว้นระยะ ไม่ขึ้นรัวจนบังหน้าจอ', async () => {
  app._roWarnAt = 0;          // รีเซ็ตตัวจับเวลา ให้รอบนี้เตือนได้หนึ่งครั้ง
  toasts.length = 0;
  await realSave(); await realSave(); await realSave();
  eq(toasts.length, 1, 'กดสามครั้งติดต้องเตือนครั้งเดียว');
});

app._roWarnAt = 0; app.isReadOnlyWindow = false;
await t('กลับเป็นหน้าต่างหลักแล้ว บันทึกได้อีกครั้ง', async () => eq(await realSave(), true));

// ── ทางเดินเงินจริง: เพิ่มค่าใช้จ่ายจากหน้าต่างอ่านอย่างเดียว ──
console.log('\n  · ทางที่ผู้ใช้เดินจริง');
app.isReadOnlyWindow = true; app._roWarnAt = 0;
app.state.shift = { active: true, startTime: Date.now(), startCash: 0, expenses: [], history: [] };
app.renderDashboard = () => {};
h.document.getElementById('expense-type').value = 'other';
h.document.getElementById('expense-amount').value = '250';
h.document.getElementById('expense-note').value = 'ค่าน้ำแข็ง';
await app.addExpense(null);
t('เพิ่มค่าใช้จ่ายจากหน้าต่างซ้ำ -> ไม่มีรายการค้างในหน่วยความจำ', () => eq(app.state.shift.expenses.length, 0));
t('เพิ่มค่าใช้จ่ายจากหน้าต่างซ้ำ -> ฟอร์มยังมีข้อมูล กดใหม่ที่หน้าต่างหลักได้', () =>
  eq(h.document.getElementById('expense-amount').value, '250'));

// ── ธงที่ต้องไม่ทำให้แอปตายถ้าเบราว์เซอร์ไม่รองรับ ──
console.log('\n  · เบราว์เซอร์ที่ไม่มี Web Locks ต้องใช้งานได้ตามเดิม');
app.isReadOnlyWindow = true;
const savedNav = h.ctx.navigator;
h.ctx.navigator = { onLine: true };                      // ไม่มี navigator.locks
app.claimWriterLock();
t('ไม่มี Web Locks -> เขียนได้ตามเดิม ไม่ล็อกร้านออกจากระบบ', () => eq(app.isReadOnlyWindow, false));
h.ctx.navigator = savedNav;

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
