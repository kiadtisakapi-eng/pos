// ─────────────────────────────────────────────────────────────────────
//  ชุด G (8 ก.ย. 2569) — ผลตรวจทั้งระบบรอบเต็ม
//
//  G01 กะที่คร่อมหลายวัน คิวสรุปแค่วันเปิดกับวันปิด → วันตรงกลางไม่มีสรุปบนชีต
//  G02 แก้บิลย้อนหลังไม่เหลือร่องรอยว่าใครแก้ จากเท่าไรเป็นเท่าไร
//  G03 ธง _restoreConfirmed ค้างข้ามการกู้ข้อมูล → ทางออกฉุกเฉินถูกปิดตาย 90 วัน
//  G04 ข้อความ Telegram ใช้ตัวแปลงของหน้าเว็บ (&#39;) ซึ่ง Telegram ปฏิเสธทั้งข้อความ
//  G05 หน้าต่างรองเขียนทับเซสชันของหน้าต่างหลักได้ (saveSession ไม่ผ่านด่าน)
//  G06 ปุ่ม "แก้ไข" โชว์ให้พนักงานทั้งที่กดแล้วโดนปฏิเสธเสมอ
//  G07 แถบสถานะ iPad ทับหัวแอป (black-translucent โดยไม่มี safe-area)
// ─────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const h = require('./harness.js');
const app = h.ctx.app;
const doc = h.ctx.document;
const root = path.resolve(__dirname, '..');
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
const E = id => doc.getElementById(id);
// เรียก "ตัวจริง" ไม่ใช่ stub ที่ไฟล์อื่นทิ้งไว้ (ดู tests/README + กับดักข้อ 1)
const real = name => Object.getPrototypeOf(app)[name].bind(app);

app.showToast = () => {}; app.vibrateDevice = () => {};
['renderCart','renderDashboard','renderQueueScreen','renderEveryScreen','closeModal','openModal',
 'updateSyncBadgeStatus','checkSyncStatus','renderReportsChart','renderPos'].forEach(k => { app[k] = () => {}; });
app.loadFailed = false;
app.isReadOnlyWindow = false;
app.currentRole = 'owner';
app.currentUser = { id: '__owner__', name: 'เจ้าของ' };
app.googleSheetsUrl = 'https://example.invalid/g-tests';
app.googleSheetsApiToken = 'g'.repeat(32);

const ts = (y, m, d, hh) => new Date(y, m - 1, d, hh || 12, 0, 0).getTime();

(async () => {

// ═══════════════════════════════════════════════════════════════
// G01 — กะที่คร่อมหลายวันทำการ ต้องคิวสรุป "ทุกวัน" ไม่ใช่แค่หัวกับท้าย
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G01 กะคร่อมหลายวัน ---');
t('มีตัวไล่วันทำการระหว่างสองเวลา', () => ok(typeof app.businessPeriodKeysBetween === 'function'));

t('กะปกติในวันเดียว -> ได้วันเดียว', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 9, 1, 20), ts(2026, 9, 1, 23));
  eq(r.dateKeys, ['2026-09-01']);
});

t('กะข้ามเที่ยงคืนแต่ปิดก่อนตี 6 -> ยังเป็นวันทำการเดียว', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 9, 1, 20), ts(2026, 9, 2, 3));
  eq(r.dateKeys, ['2026-09-01']);
});

t('ลืมปิดกะ เปิดวันที่ 1 ปิดวันที่ 4 -> ต้องได้ครบ 4 วัน (วันตรงกลางห้ามหาย)', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 9, 1, 20), ts(2026, 9, 4, 20));
  eq(r.dateKeys, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
});

t('สลับหัวท้าย (ปิดก่อนเปิด) -> ยังได้ชุดเดิม ไม่พังและไม่ว่าง', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 9, 4, 20), ts(2026, 9, 1, 20));
  eq(r.dateKeys, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
});

t('กะคร่อมสิ้นเดือน -> ได้ทั้งสองเดือน', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 9, 30, 20), ts(2026, 10, 2, 20));
  eq(r.dateKeys, ['2026-09-30', '2026-10-01', '2026-10-02']);
  eq(r.monthKeys, ['09-2026', '10-2026']);
});

t('ช่วงเวลายาวผิดปกติ (เกิน 62 วัน) -> ถอยไปเก็บแค่หัวท้าย ไม่ยิงเป็นร้อยครั้ง', () => {
  const r = app.businessPeriodKeysBetween(ts(2026, 1, 1, 20), ts(2026, 9, 1, 20));
  eq(r.dateKeys, ['2026-01-01', '2026-09-01']);
});

t('เวลาของกะใช้ไม่ได้ -> ไม่โยน error และไม่สร้างคีย์ขยะ', () => {
  const r = app.businessPeriodKeysBetween(null, undefined);
  eq(r.dateKeys, []); eq(r.monthKeys, []);
});

t('ปิดกะจริง: outbox ต้องมีงานสรุปครบทุกวันของกะที่ลืมปิด', () => {
  app.state.cloudOutbox = [];
  app.state.transactions = [];
  app.telegramToken = ''; app.telegramChatId = '';
  real('enqueueShiftCloseCloudOps')({
    startTime: ts(2026, 9, 1, 20), endTime: ts(2026, 9, 4, 20),
    startCash: 1000, cashSales: 0, expensesTotal: 0, expectedCash: 1000,
    countedCash: 1000, difference: 0, expenses: [], closedBy: 'เจ้าของ'
  });
  const job = app.state.cloudOutbox[app.state.cloudOutbox.length - 1];
  ok(job && job.needSummary, 'ต้องมีงานสรุปในคิว');
  eq(job.dateKeys, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
});

// ═══════════════════════════════════════════════════════════════
// G02 — ร่องรอยการแก้บิลย้อนหลัง
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G02 ร่องรอยการแก้บิล ---');

app.syncPendingTransactions = async () => {};
app.flushCloudOutbox = async () => {};
app.filterReports = () => {};
doc.querySelectorAll = () => [];

const mkBill = (id) => ({
  id, date: ts(2026, 9, 5, 20), customerName: 'ลูกค้า ก',
  services: ['นวดไทย'], details: [{ name: 'นวดไทย', price: 350, netPrice: 350, staffId: 'st1',
    staffName: 'A', commission: 10, commissionType: 'percent', commissionAmount: 35, category: 'massage', vatable: false }],
  subtotal: 350, discount: 0, vatRate: 7, nonVatBase: 350, vatableBase: 0, vatAmount: 0, rounding: 0,
  total: 350, paymentMethod: 'cash', staffNames: ['A'], syncStatus: 'synced'
});

const openEdit = (tx, discount, customer) => {
  app.state.transactions = [tx];
  app.state.staff = [{ id: 'st1', name: 'A', accessLevel: 'staff' }];
  real('openTransactionEdit')(tx.id);
  E('edit-tx-id').value = tx.id;
  E('edit-tx-discount').value = String(discount);
  E('edit-tx-customer').value = customer;
  E('edit-tx-payment').value = tx.paymentMethod;
};

await t('แก้ส่วนลด -> ต้องมีแถวในทะเบียนพร้อมชื่อคนแก้และยอดเดิม/ยอดใหม่', async () => {
  app.state.editLog = [];
  const tx = mkBill('TX-EDIT-1');
  openEdit(tx, 100, 'ลูกค้า ก');
  await real('saveTransactionEdit')();
  eq(app.state.editLog.length, 1, 'จำนวนแถวในทะเบียน');
  const e = app.state.editLog[0];
  eq(e.billId, 'TX-EDIT-1');
  eq(e.by, 'เจ้าของ');
  eq(e.before.total, 350);
  eq(e.after.total, 250);
  ok(e.fields.indexOf('total') > -1 && e.fields.indexOf('discount') > -1, 'ต้องบอกว่าอะไรเปลี่ยน: ' + JSON.stringify(e.fields));
  ok(Number(e.date) > 0 && Number(e.billDate) > 0, 'ต้องมีทั้งเวลาที่แก้และวันของบิล');
});

await t('กดเปิดดูแล้วบันทึกโดยไม่เปลี่ยนอะไร -> ไม่ต้องมีแถวขยะ', async () => {
  app.state.editLog = [];
  const tx = mkBill('TX-EDIT-2');
  openEdit(tx, 0, 'ลูกค้า ก');
  await real('saveTransactionEdit')();
  eq(app.state.editLog.length, 0);
});

await t('เขียนเครื่องไม่สำเร็จ -> ทะเบียนต้องถูกคืนค่าเดิม ไม่เหลือแถวของการแก้ที่ไม่ได้บันทึก', async () => {
  app.state.editLog = [{ billId: 'OLD', date: 1, by: 'x', fields: ['total'], before: {}, after: {} }];
  const tx = mkBill('TX-EDIT-3');
  openEdit(tx, 50, 'ลูกค้าใหม่');
  const realSave = app.saveState;
  app.saveState = async () => false;          // จำลอง IndexedDB เขียนไม่ผ่าน
  await real('saveTransactionEdit')();
  app.saveState = realSave;
  eq(app.state.editLog.length, 1, 'ต้องเหลือแถวเดิมแถวเดียว');
  eq(app.state.editLog[0].billId, 'OLD');
  eq(app.state.transactions[0].total, 350, 'ยอดบิลต้องถูกคืนด้วย');
});

t('ทะเบียนการแก้บิลติดไปกับไฟล์สำรอง', () => {
  app.state.editLog = [{ billId: 'TX-1', date: 2, by: 'เจ้าของ', fields: ['total'], before: { total: 1 }, after: { total: 2 } }];
  const b = real('buildBackupPayload')();
  ok(Array.isArray(b.editLog) && b.editLog.length === 1, 'ไฟล์สำรองต้องมี editLog');
});

t('ไฟล์สำรองที่ editLog ผิดรูป -> ไม่รับ', () => {
  const base = real('buildBackupPayload')();
  ok(real('isValidBackupObject')(Object.assign({}, base, { editLog: [] })) === true, 'อาเรย์ว่างต้องผ่าน');
  ok(real('isValidBackupObject')(Object.assign({}, base, { editLog: ['x'] })) === false, 'สมาชิกที่ไม่ใช่อ็อบเจกต์ต้องไม่ผ่าน');
});

t('ล้างยอดขาย -> ล้างทะเบียนการแก้บิลไปด้วย (เป็นของยอดเก่า)', () => {
  app.state.editLog = [{ billId: 'TX-1', date: 2 }];
  app.state.transactions = [];
  let done = null;
  app.showConfirm = (msg, cb) => { done = cb(); };
  real('clearSalesData')();
  return Promise.resolve(done).then(() => eq(app.state.editLog, []));
});

t('หน้ารายงานแสดงตารางบิลที่ถูกแก้ (ดูจากที่ขึ้นจอจริง)', () => {
  const day = app.getBusinessISODate(ts(2026, 9, 5, 20));
  app.state.editLog = [{
    billId: 'TX-SHOW-1', date: ts(2026, 9, 5, 21), billDate: ts(2026, 9, 5, 20), by: 'เจ้าของ',
    fields: ['discount', 'total'], before: { total: 350, discount: 0 }, after: { total: 250, discount: 100 }
  }];
  real('renderAuditTrail')('daily', day, '2026-09');
  const html = E('report-bill-edits-body').innerHTML || '';
  ok(/TX-SHOW-1/.test(html), 'ต้องเห็นเลขที่บิล');
  ok(/เจ้าของ/.test(html), 'ต้องเห็นชื่อคนแก้');
  ok(/350/.test(html) && /250/.test(html), 'ต้องเห็นยอดเดิมและยอดใหม่: ' + html.slice(0, 200));
});

t('index.html มีที่สำหรับตารางบิลที่ถูกแก้', () =>
  ok(/id="report-bill-edits-body"/.test(HTML) && /id="report-bill-edits-count"/.test(HTML)));

// ═══════════════════════════════════════════════════════════════
// G03 — ธงยืนยันคืนบิลต้องไม่ค้างข้ามการกู้ข้อมูล
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G03 ธงยืนยันคืนบิล ---');

await t('กู้ข้อมูลรอบใหม่ -> ล้างธง _restoreConfirmed ที่ติดมากับไฟล์', async () => {
  app.state.transactions = [];
  app.state.staff = [{ id: 'st1', name: 'A', accessLevel: 'staff' }];
  const withFlag = mkBill('TX-RC-1');
  withFlag._restoreConfirmed = true;
  withFlag.restoredAt = 111;
  const file = {
    backupSchemaVersion: 3, services: [{ id: 's1', name: 'x', price: 1 }],
    staff: [{ id: 'st1', name: 'A' }], transactions: [withFlag],
    shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] }
  };
  await real('applyBackupData')(file, { checkIds: true });
  const tx = app.state.transactions.find(x => x.id === 'TX-RC-1');
  ok(tx, 'บิลต้องถูกกู้เข้ามา');
  ok(tx._restoreConfirmed === undefined, 'ธงต้องถูกล้าง ไม่งั้นทางออกฉุกเฉินถูกปิดตาย');
  ok(Number(tx.restoredAt) > 111, 'restoredAt ต้องเป็นเวลาของการกู้รอบนี้');
});

await t('ส่งบิลขึ้นชีตสำเร็จ -> ล้างธงทิ้ง ไม่ให้ติดไปกับไฟล์สำรองรอบหน้า', async () => {
  const tx = mkBill('TX-RC-2');
  tx.syncStatus = 'pending'; tx.restoredAt = 222; tx._restoreConfirmed = true;
  app.state.transactions = [tx];
  app.isSyncing = false;
  app.fetchWithTimeout = async () => ({ ok: true, json: async () => ({ status: 'success' }) });
  await real('_doSyncPendingTransactions')(true);
  eq(tx.syncStatus, 'synced');
  ok(tx.restoredAt === undefined, 'restoredAt ต้องถูกล้าง');
  ok(tx._restoreConfirmed === undefined, '_restoreConfirmed ต้องถูกล้างด้วย');
});

// ═══════════════════════════════════════════════════════════════
// G04 — ข้อความ Telegram
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G04 ข้อความ Telegram ---');

t('ตัวแปลงของ Telegram แปลงเฉพาะ & < > (เอนทิตีอื่นทำให้ข้อความส่งไม่ออก)', () => {
  ok(typeof h.ctx.escapeTelegram === 'function', 'ต้องมี escapeTelegram');
  eq(h.ctx.escapeTelegram(`A & <b> "q" 'x'`), `A &amp; &lt;b&gt; "q" 'x'`);
});

t('ชื่อที่มีเครื่องหมาย \' ต้องไม่กลายเป็น &#39; ในข้อความแจ้งยกเลิกบิล', () => {
  const msg = real('buildVoidAlertMessage')({ billId: 'TX-9', date: Date.now(), by: "O'Brien", amount: 100, customer: "L'or & <b>" });
  ok(!/&#39;/.test(msg) && !/&quot;/.test(msg), 'ห้ามมีเอนทิตีที่ Telegram ไม่รู้จัก: ' + msg);
  ok(/O'Brien/.test(msg), 'ชื่อต้องยังอ่านออก');
  ok(/&amp;/.test(msg) && /&lt;b&gt;/.test(msg), 'ยังต้องกัน & < > เหมือนเดิม');
});

t('รายงานปิดกะก็ใช้ตัวแปลงเดียวกัน', () => {
  app.state.transactions = [];
  const msg = real('buildShiftReportMessage')({
    startTime: ts(2026, 9, 5, 20), endTime: ts(2026, 9, 6, 2), startCash: 0,
    expensesTotal: 0, expectedCash: 0, countedCash: 0, difference: 0, closedBy: "O'Brien"
  });
  ok(!/&#39;/.test(msg), 'ห้ามมี &#39; : ' + msg.slice(0, 120));
});

// ═══════════════════════════════════════════════════════════════
// G05 — หน้าต่างรองห้ามเขียนทับเซสชัน
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G05 เซสชันกับหน้าต่างรอง ---');

app.updateUserRoleUI = () => {};
const settle = () => new Promise(r => setTimeout(r, 0));

await t('หน้าต่างรองห้ามเขียนทับเซสชันของหน้าต่างหลัก (ดูจากผลที่กู้เซสชันได้จริง)', async () => {
  app.state.staff = [{ id: 'st1', name: 'A', accessLevel: 'staff', pin: 'a'.repeat(64) }];

  // หน้าต่างหลักล็อกอินเป็นเจ้าของ แล้วจำเซสชันไว้
  app.isReadOnlyWindow = false;
  app.currentUser = { id: '__owner__', name: 'เจ้าของ' };
  app.currentRole = 'owner';
  real('saveSession')();
  await settle();

  // หน้าต่างรอง (อ่านอย่างเดียว) ล็อกอินเป็นพนักงาน แล้วเรียกจำเซสชัน
  app.isReadOnlyWindow = true;
  app.currentUser = { id: 'st1', name: 'A' };
  app.currentRole = 'staff';
  real('saveSession')();
  await settle();

  // เปิดแอปใหม่ต้องได้เซสชันของหน้าต่างหลัก ไม่ใช่ของหน้าต่างรอง
  app.isReadOnlyWindow = false;
  app.currentUser = null; app.currentRole = null;
  const okRestore = await real('tryRestoreSession')();
  ok(okRestore, 'ต้องยังมีเซสชันให้กู้');
  eq(app.currentUser.id, '__owner__', 'เซสชันของหน้าต่างหลักต้องไม่ถูกทับ');
  eq(app.currentRole, 'owner');
});
app.isReadOnlyWindow = false;

// ═══════════════════════════════════════════════════════════════
// G06 — ปุ่มแก้ไขในตารางรายงาน
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G06 ปุ่มแก้ไขตามสิทธิ์ ---');

const renderTableAs = (role) => {
  app.currentRole = role;
  app.currentUser = { id: 'u', name: role };
  app.state.selectedReportType = 'daily';
  // บิลของวันนี้ — ผู้จัดการดูได้เฉพาะวันทำการปัจจุบัน (เจ้าของสั่ง 26 ก.ย. 2569) เทสต์นี้วัดเรื่องปุ่ม ไม่ใช่เรื่องวัน
  app.state.transactions = [Object.assign(mkBill('TX-BTN-1'), { date: Date.now() })];
  app.state.staff = [{ id: 'st1', name: 'A', accessLevel: 'staff' }];
  app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
  E('report-date-input').value = app.getBusinessISODate(Date.now());
  E('report-month-input').value = '2026-09';
  E('report-staff-filter').value = 'all';
  E('report-transactions-body').innerHTML = '';
  real('filterReports')();
  return E('report-transactions-body').innerHTML || '';
};

t('เจ้าของเห็นปุ่มแก้ไข', () => ok(/openTransactionEdit/.test(renderTableAs('owner'))));
t('ผู้จัดการเห็นปุ่มแก้ไข (ต้องใช้ยกเลิกบิล)', () => ok(/openTransactionEdit/.test(renderTableAs('manager'))));
t('พนักงานไม่เห็นปุ่มแก้ไข แต่ยังดูบิลได้', () => {
  const html = renderTableAs('staff');
  ok(!/openTransactionEdit/.test(html), 'พนักงานต้องไม่เห็นปุ่มที่กดแล้วโดนปฏิเสธเสมอ');
  ok(/viewHistoricalReceipt/.test(html), 'ปุ่มดูบิลต้องยังอยู่');
});
app.currentRole = 'owner';
app.currentUser = { id: '__owner__', name: 'เจ้าของ' };

// ═══════════════════════════════════════════════════════════════
// G07 — แถบสถานะ iPad
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G07 แถบสถานะ iPad ---');

t('ห้ามใช้ black-translucent ถ้าไม่มีที่เผื่อขอบจอ (หัวแอปจะโดนแถบสถานะทับ)', () => {
  const m = HTML.match(/apple-mobile-web-app-status-bar-style"\s+content="([^"]+)"/);
  ok(m, 'ต้องมี meta แถบสถานะ');
  const hasSafeArea = /viewport-fit=cover/.test(HTML) &&
    (/env\(safe-area-inset/.test(HTML) || /env\(safe-area-inset/.test(fs.readFileSync(path.join(root, 'style_v2.css'), 'utf8')));
  ok(m[1] !== 'black-translucent' || hasSafeArea,
     'black-translucent ใช้ได้ต่อเมื่อมี viewport-fit=cover + env(safe-area-inset-*)');
});

// ═══════════════════════════════════════════════════════════════
// G08 — ป้ายข้อความบนชีตห้ามขึ้นต้นด้วย = + @ (Sheets จะตีความเป็นสูตร)
// ═══════════════════════════════════════════════════════════════
console.log('\n--- G08 ป้ายที่กลายเป็นสูตร ---');
const GASRC = fs.readFileSync(path.join(root, 'google_apps_script.js'), 'utf8');

t('ป้าย "กำไรสุทธิ" ต้องมีช่องว่างนำหน้า = (เคยขึ้น #ERROR! บนชีตสรุปทุกใบ)', () => {
  ok(/\[" = กำไรสุทธิ"/.test(GASRC), 'ต้องเป็น [" = กำไรสุทธิ" ไม่ใช่ ["= กำไรสุทธิ"');
  ok(!/\["= /.test(GASRC), 'ยังมีป้ายที่ขึ้นต้นด้วย = อยู่');
});

t('ไม่มีป้ายอื่นในไฟล์ที่ขึ้นต้นด้วย = + @ (กวาดทั้งชนิด ไม่ใช่แก้จุดเดียว)', () => {
  // ดูเฉพาะ "ป้ายในอาเรย์" กับค่าที่ส่งเข้า setValue โดยตรง
  // ไม่รวมรูปแบบตัวเลข (setNumberFormat) ซึ่งขึ้นต้นด้วย + หรือ @ ได้ตามปกติ
  const hits = [];
  GASRC.split('\n').forEach((line, i) => {
    if (/setNumberFormat/.test(line)) return;
    const m = line.match(/(\[|setValue\(|,\s)"[=+@][^"]*"/g);
    if (m) hits.push((i + 1) + ': ' + m.join(' · '));
  });
  ok(hits.length === 0, 'พบป้ายที่ Sheets จะอ่านเป็นสูตร:\n' + hits.join('\n'));
});

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
