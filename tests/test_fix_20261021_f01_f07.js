// แก้ตามผลตรวจซ้ำ 20–21 ต.ค. 2569 (Codex F01–F09 → Claude → Codex ทักท้วง) — ข้อ F01 · F02 · F03 · F05 · F06 · F07
// app.js จริง + IndexedDB จริง (fake-indexeddb) + Apps Script จริงในตัวจำลอง
//   F01: หน้าต่าง/เครื่องที่ออกบิลไม่ได้ ห้ามเปิดหน้าชำระเงิน/วาด QR · หน้าชำระเงินที่เปิดค้างต้องปิดเมื่อสถานะเปลี่ยน
//   F02: ส่วนยกเลิกบิล (ป้าย/คำแนะนำ) วาดใหม่หลังบันทึกเงินส่วนต่าง · คืนบางส่วน (waiveRest) = ครบแล้ว ไม่เตือนค้าง
//   F03: หน้าต่างที่ข้อมูลเก่า (ไม่มี Web Locks) ห้ามล้างข้อมูล/ส่งสำเนาสำรองของตัวเอง · ทางสำรองตอนพื้นที่ในเครื่องหายยังใช้ได้
//   F05: รหัสบริการ/พนักงานซ้ำในไฟล์สำรอง → ซ่อมตั้งแต่รับไฟล์ + ผลตรวจไฟล์ไม่สะอาด
//   F06: กะที่เปิดอยู่ไม่มีเงินเปิดกะ → ไม่ทราบ (ติดธง) · ปิดกะได้แต่ต้องกรอกหมายเหตุ · ประวัติกะ/Telegram บอกว่าไม่ทราบ
//   F07: ยอดคืน/เก็บส่วนต่างเกินเพดานหรือต่ำกว่าสตางค์ = ข้อมูลเสีย (ทั้งตอนกู้และในตัวคำนวณลิ้นชัก) · เงินคืนติดลบปกติผ่าน
//   R1–R3 (Codex ตรวจงานแก้ 21 ต.ค.): เครื่องที่ยังไม่ยืนยันเครื่องหลักต้องยืนยันก่อนเปิดหน้ารับเงิน · กลายเป็นเครื่องรอง/อ่านอย่างเดียว
//     ระหว่างงานขายรอคิว = ไม่มีบิล และหน้ารับเงินปิดหลังจบ · รหัสเลข 7 กับข้อความ "7" ในไฟล์สำรองนับว่าซ้ำ
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261021_f01_f07.js
// ตรวจกับโค้ดก่อนแก้: POS_APP_SRC=<app.js เดิม> node tests/test_fix_20261021_f01_f07.js (ต้องตก)
process.env.TZ = 'Asia/Bangkok';
const { makeRunner, eq, ok, createEnv } = require('./harness_db.js');
const { makeShop, readyCheckout, settle, quiet, loginAs } = require('./fixtures_db.js');

const R = makeRunner('--- แก้ตามผลตรวจซ้ำ 20–21 ต.ค. 2569: F01 · F02 · F03 · F05 · F06 · F07 ---');
const OFFLINE = { googleSheetsUrl: '', googleSheetsApiToken: '' };
const proto = (app, k) => Object.getPrototypeOf(app)[k].bind(app);

// หน้าต่างเปิด/ปิดจริงตามคลาส active (quiet() ปิด openModal/closeModal ไว้)
function trackModals(shop) {
  const { app, env } = shop;
  const log = { opened: [], closed: [] };
  app.openModal = (id) => { log.opened.push(id); env.document.getElementById(id).classList.add('active'); };
  app.closeModal = (id) => { log.closed.push(id); env.document.getElementById(id).classList.remove('active'); };
  return log;
}
async function checkout(env, items, pay, received) {
  readyCheckout(env, items, pay, received);
  await env.app.processCheckout();
  await settle(30);
  return env.app.state.transactions[env.app.state.transactions.length - 1];
}
async function editBill(env, txId, discount) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-discount').value = String(discount);
  await env.app.saveTransactionEdit();
  await settle(20);
}
const hint = (env) => String(env.document.getElementById('void-money-hint').innerText || '');
const PENDING_RE = /ต้องบันทึกส่วนต่าง/;

(async () => {
  // ═══ F01 ═══════════════════════════════════════════════════════════════════════════════
  const BLOCKS = [
    ['หน้าต่างอ่านอย่างเดียว', (a) => { a.isReadOnlyWindow = true; }, /เปิดซ้ำ/],
    ['เครื่องรอง', (a) => { a.primaryStatus = { isPrimary: false, checkedAt: Date.now() }; }, /เครื่องรอง/],
    ['ระหว่างสำรอง/ล้างข้อมูล (maintenance)', (a) => { a._maintenance = {}; }, /สำรอง\/ล้างข้อมูล/],
    ['โหลดข้อมูลร้านไม่สำเร็จ', (a) => { a.loadFailed = true; }, /โหลดข้อมูล/],
    ['ไม่ได้เข้าสู่ระบบ', (a) => { loginAs(a, null); }, /เข้าสู่ระบบ/],
  ];
  await R.t('F01 ควบคุม: สภาพปกติ กด "ไปที่หน้าชำระเงิน" แล้วหน้าชำระเงินเปิด', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      s.app.openCheckoutModal();
      ok(log.opened.includes('modal-payment'), JSON.stringify(log));
    } finally { s.env.dispose(); }
  });
  for (const [name, apply, re] of BLOCKS) {
    await R.t(`F01 ${name}: ไม่เปิดหน้าชำระเงิน · บอกเหตุ · ตะกร้ายังอยู่`, async () => {
      const s = await makeShop({ rows: OFFLINE });
      try {
        const log = trackModals(s);
        readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
        apply(s.app);
        s.toasts.length = 0;
        s.app.openCheckoutModal();
        eq(log.opened.includes('modal-payment'), false, 'หน้าชำระเงินต้องไม่เปิด');
        ok(s.toasts.some(t => re.test(t.m)), JSON.stringify(s.toasts));
        eq(s.app.state.cart.length, 1, 'ตะกร้าคงไว้');
      } finally { s.env.dispose(); }
    });
  }
  await R.t('F01 ยอดตะกร้าเกินเพดานบิล: ไม่เปิดหน้าชำระเงิน (เดิมเปิดและวาด QR ได้)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 10000001 }], null);
      s.toasts.length = 0;
      s.app.openCheckoutModal();
      eq(log.opened.includes('modal-payment'), false);
      ok(s.toasts.some(t => /เพดาน/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.env.dispose(); }
  });
  await R.t('F01 เลือก Scan ในหน้าชำระเงินที่ออกบิลไม่ได้แล้ว: ไม่วาด QR · ปิดหน้าชำระเงิน · รอบชำระเงินใช้ต่อไม่ได้', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      s.app.openCheckoutModal();
      ok(log.opened.includes('modal-payment'), '(เงื่อนไข) เปิดได้ตอนปกติ');
      let qr = 0; s.app.generatePromptPayQR = () => { qr++; return true; };
      s.app.isReadOnlyWindow = true;          // ล็อกเปลี่ยนมือโดยยังไม่ผ่าน setReadOnlyWindow (กรณีเลวสุด)
      s.app.selectPaymentMethod('promptpay');
      eq(qr, 0, 'ไม่วาด QR');
      ok(log.closed.includes('modal-payment'), 'ปิดหน้าชำระเงิน');
      eq(s.app._checkoutAttempt, null, 'รอบชำระเงินถูกยกเลิก');
      eq(s.app.state.cart.length, 1, 'ตะกร้าคงไว้');
    } finally { s.env.dispose(); }
  });
  await R.t('F01 หน้าชำระเงินเปิดค้างแล้วหน้าต่างกลายเป็นอ่านอย่างเดียว (setReadOnlyWindow) → ปิดหน้าชำระเงินทันที', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      s.app.openCheckoutModal();
      s.toasts.length = 0;
      s.app.setReadOnlyWindow(true);
      ok(log.closed.includes('modal-payment'), JSON.stringify(log));
      ok(s.toasts.some(t => /เปิดซ้ำ/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.env.dispose(); }
  });
  await R.t('F01 หน้าชำระเงินเปิดค้างแล้วเริ่มงานสำรอง/ล้างข้อมูล (withMaintenance) → ปิดหน้าชำระเงิน', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      s.app.openCheckoutModal();
      let seenOpen = null;
      await s.app.withMaintenance('ทดสอบ', async () => { seenOpen = s.app.isCheckoutModalOpen(); return true; });
      eq(seenOpen, false, 'ระหว่างงานดูแลข้อมูล หน้าชำระเงินต้องปิดแล้ว');
    } finally { s.env.dispose(); }
  });
  await R.t('F01 หน้าชำระเงินเปิดค้างแล้วรู้ว่าเป็นเครื่องรอง (notePrimaryStatus false) → ปิดหน้าชำระเงิน', async () => {
    const s = await makeShop();
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      s.app.openCheckoutModal();
      ok(log.opened.includes('modal-payment'), '(เงื่อนไข) เครื่องหลักเปิดได้');
      await s.app.notePrimaryStatus(false, { label: 'อีกเครื่อง' });
      ok(log.closed.includes('modal-payment'), JSON.stringify(log));
    } finally { s.env.dispose(); }
  });
  await R.t('F01 กดยืนยันในหน้าต่างอ่านอย่างเดียว → ไม่มีบิล (ด่านตอนบันทึกยังทำงาน)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'promptpay');
      s.app.isReadOnlyWindow = true;
      const r = await s.app.processCheckout(); await settle(20);
      eq(r, false); eq(s.app.state.transactions.length, 0);
      eq(((await s.env.raw('transactions')) || []).length, 0);
    } finally { s.env.dispose(); }
  });
  await R.t('F01 ควบคุม: หน้าต่างหลักขายได้ทั้งเงินสดและ QR', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const a = await checkout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      const b = await checkout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'promptpay');
      ok(a && b && a.id !== b.id, 'ขายได้สองบิล');
      eq(((await s.env.raw('transactions')) || []).length, 2);
    } finally { s.env.dispose(); }
  });

  // ═══ F02 ═══════════════════════════════════════════════════════════════════════════════
  await R.t('F02 คืนเงินเต็มจำนวนแล้ว ส่วนยกเลิกบิลอัปเดตทันที (ยอดใหม่ · ไม่เตือนค้าง) · ค่าที่เลือก/พิมพ์ไว้ยังอยู่', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { env, app } = s;
      const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
      await editBill(env, tx.id, 100);                       // 500 → 400 · ร้านถือเงินเกิน 100
      app.openTransactionEdit(tx.id);
      ok(PENDING_RE.test(hint(env)) && /฿500\.00/.test(hint(env)), '(เงื่อนไข) ก่อนบันทึก: เตือนค้าง · ' + hint(env));
      env.document.getElementById('void-money-outcome').value = 'refunded';
      env.document.getElementById('void-note').value = 'ลูกค้าเปลี่ยนใจ';
      const r = await app.recordBillSettlement(tx.id, 'moved', 'cash'); await settle(20);
      eq(r, true, 'บันทึกคืนเงินได้');
      const h = hint(env);
      ok(!PENDING_RE.test(h), 'ไม่เตือนค้างแล้ว · ' + h);
      ok(/฿400\.00/.test(h), 'ยอดเงินสดใหม่ ฿400 · ' + h);
      eq(env.document.getElementById('void-money-outcome').value, 'refunded', 'ตัวเลือกที่เลือกไว้ยังอยู่');
      eq(env.document.getElementById('void-note').value, 'ลูกค้าเปลี่ยนใจ', 'เหตุผลที่พิมพ์ไว้ยังอยู่');
    } finally { s.env.dispose(); }
  });
  await R.t('F02 คืนบางส่วน (ส่วนที่เหลือ = ไม่มีเงินเคลื่อนไหว · waiveRest) = ครบแล้ว ไม่เตือนค้าง · ยอดเงินสดตามเงินที่คืนจริง', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { env, app } = s;
      const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
      await editBill(env, tx.id, 100);
      app.openTransactionEdit(tx.id);
      const r = await app.recordBillSettlement(tx.id, 'moved', 'cash', 50); await settle(20);
      eq(r, true);
      ok(app.billMoneyStatus(tx).settled, '(เงื่อนไข) บิลบันทึกครบตามกติกา waiveRest');
      const h = hint(env);
      ok(!PENDING_RE.test(h), 'ไม่เตือนค้าง · ' + h);
      ok(/฿450\.00/.test(h), 'เงินสดที่ยังอยู่ในลิ้นชัก 500 − คืน 50 = ฿450 · ' + h);
    } finally { s.env.dispose(); }
  });

  // ═══ F03 ═══════════════════════════════════════════════════════════════════════════════
  await R.t('F03 ไม่มี Web Locks + ไม่ต่อคลาวด์: หน้าต่างข้อมูลเก่ากดล้างข้อมูล → ไม่ถามยืนยัน ไม่ล้าง · กลายเป็นอ่านอย่างเดียว', async () => {
    const a = await makeShop({ rows: OFFLINE });
    let b;
    try {
      await a.app.withMutation('t', () => a.app.saveState());
      b = createEnv({ factory: a.env.factory });
      const bt = quiet(b.app); await b.app.init(); loginAs(b.app, 'owner');
      eq(b.app.isReadOnlyWindow, false, '(เงื่อนไข) ไม่มี Web Locks = ทุกหน้าต่างเขียนได้');
      await checkout(a.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      eq(((await a.env.raw('transactions')) || []).length, 1, '(เงื่อนไข) A ขายแล้ว');
      let prompts = 0; b.ctx.prompt = () => { prompts++; return 'ลบทั้งหมด'; }; b.ctx.confirm = () => true;
      const r = await b.app.resetData(); await settle(20);
      ok(r !== true, 'ไม่ล้าง');
      eq(prompts, 0, 'ไม่ถามยืนยันด้วยข้อมูลเก่า');
      eq(((await a.env.raw('transactions')) || []).length, 1, 'บิลของ A ยังอยู่');
      eq(b.app.isReadOnlyWindow, true);
      ok(bt.some(t => /เก่ากว่าในเครื่อง/.test(t.m)), JSON.stringify(bt));
    } finally { a.env.dispose(); if (b) b.dispose(); }
  });
  await R.t('F03 ล้างยอดขายจากหน้าต่างข้อมูลเก่า → ไม่ถามยืนยัน ไม่ล้าง', async () => {
    const a = await makeShop({ rows: OFFLINE });
    let b;
    try {
      await a.app.withMutation('t', () => a.app.saveState());
      b = createEnv({ factory: a.env.factory });
      quiet(b.app); await b.app.init(); loginAs(b.app, 'owner');
      await checkout(a.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      let prompts = 0; b.ctx.prompt = () => { prompts++; return 'ล้างยอดขาย'; }; b.ctx.confirm = () => true;
      const r = await b.app.clearSalesData(); await settle(20);
      ok(r !== true); eq(prompts, 0);
      eq(((await a.env.raw('transactions')) || []).length, 1);
    } finally { a.env.dispose(); if (b) b.dispose(); }
  });
  await R.t('F03 ต่อคลาวด์: หน้าต่างข้อมูลเก่ากดล้างข้อมูล → ไม่มีไฟล์สำรองที่ขาดบิลใหม่ถูกส่งขึ้น Drive (เดิมส่ง 0 บิลสำเร็จ)', async () => {
    const a = await makeShop();
    let b;
    try {
      await a.app.withMutation('t', () => a.app.saveState());
      b = createEnv({ factory: a.env.factory, fetch: a.gas.fetch });
      quiet(b.app); await b.app.init(); loginAs(b.app, 'owner'); await settle(10);
      await a.app.loadState(); loginAs(a.app, 'owner');
      await checkout(a.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      await a.app.syncPendingTransactions(true); await settle(20);
      const start = a.gas.requests.length;
      b.ctx.prompt = () => 'ลบทั้งหมด'; b.ctx.confirm = () => true;
      await b.app.resetData(); await settle(30);
      const backups = a.gas.requests.slice(start).filter(x => x.action === 'backup');
      eq(backups.length, 0, 'ไม่ส่งคำขอสำรองจากหน้าต่างข้อมูลเก่า');
      eq(((await a.env.raw('transactions')) || []).length, 1);
    } finally { a.env.dispose(); if (b) b.dispose(); }
  });
  await R.t('F03 สำรองขึ้น Drive จากหน้าต่างข้อมูลเก่า (งานสำรองทั่วไป) → ไม่ส่ง · บอกเหตุ · หน้าต่างกลายเป็นอ่านอย่างเดียว', async () => {
    const a = await makeShop();
    let b;
    try {
      await a.app.withMutation('t', () => a.app.saveState());
      b = createEnv({ factory: a.env.factory, fetch: a.gas.fetch });
      quiet(b.app); await b.app.init(); loginAs(b.app, 'owner'); await settle(10);
      await a.app.loadState(); loginAs(a.app, 'owner');
      await checkout(a.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      const start = a.gas.requests.length;
      const okB = await b.app._doBackupToGoogleDrive({ silent: true }); await settle(20);
      eq(okB, false);
      eq(a.gas.requests.slice(start).filter(x => x.action === 'backup').length, 0);
      ok(/เก่ากว่าในเครื่อง/.test(b.app._cloudFailReason || ''), b.app._cloudFailReason);
      eq(b.app.isReadOnlyWindow, true);
      // ควบคุม: หน้าต่างที่ข้อมูลล่าสุด (A) สำรองได้
      eq(await a.app._doBackupToGoogleDrive({ silent: true }), true, 'หน้าต่างหลักยังสำรองได้');
    } finally { a.env.dispose(); if (b) b.dispose(); }
  });
  await R.t('F03 ที่เก็บข้อมูลในเครื่องหายเอง (iPad ล้างพื้นที่) → ยังสำรองข้อมูลจากหน้าจอขึ้น Drive ได้ (หน่วยความจำคือสำเนาเดียว)', async () => {
    const s = await makeShop();
    try {
      await s.app.withMutation('t', () => s.app.saveState());
      ok(s.app._stateRev && s.app._stateRev.rev > 0, '(เงื่อนไข) หน้าต่างนี้เคยเห็นรุ่นข้อมูล');
      await s.env.db.state.clear();
      const start = s.gas.requests.length;
      await s.app._doBackupToGoogleDrive({ silent: true }); await settle(20);
      eq(s.gas.requests.slice(start).filter(x => x.action === 'backup').length, 1, 'ส่งคำขอสำรอง');
      eq(s.app.isReadOnlyWindow, false);
    } finally { s.env.dispose(); }
  });

  // ═══ F05 ═══════════════════════════════════════════════════════════════════════════════
  await R.t('F05 ไฟล์ที่รหัสบริการ/พนักงานซ้ำ: ผลตรวจไม่สะอาด + บอกในกล่องยืนยัน · นำเข้าแล้วกดรายการ ฿900 ได้ ฿900 ทันที (ไม่ต้องรีโหลด)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { app } = s;
      const payload = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      payload.services.push(Object.assign({}, payload.services.find(x => x.id === 's1'), { name: 'ตัดผม VIP', price: 900 }));
      payload.staff.push(Object.assign({}, payload.staff.find(x => x.id === 'st-1'), { name: 'เอ (ซ้ำ)' }));
      const audit = app.auditBackupData(payload);
      eq(audit.clean, false, 'ผลตรวจต้องไม่สะอาด');
      eq(audit.dupEntityIds, 2);
      ok(/รหัสซ้ำ/.test(app.describeBackupAudit(audit)), app.describeBackupAudit(audit));
      ok(app.isValidBackupObject(payload), 'ไม่ปฏิเสธทั้งไฟล์');
      await app.applyBackupData(payload); await settle(20);
      const ids = app.state.services.map(x => x.id);
      eq(new Set(ids).size, ids.length, 'รหัสบริการไม่ซ้ำแล้ว');
      eq(new Set(app.state.staff.map(x => x.id)).size, app.state.staff.length, 'รหัสพนักงานไม่ซ้ำแล้ว');
      const vip = app.state.services.find(x => x.name === 'ตัดผม VIP');
      ok(vip && vip.id !== 's1', JSON.stringify(vip));
      app.state.cart = [];
      app.addToCart(vip.id);
      eq(app.state.cart.map(i => i.price), [900], 'กดรายการ ฿900 ได้ ฿900');
      app.state.cart = [];
      app.addToCart('s1');
      eq(app.state.cart.map(i => i.price), [300], 'รายการเดิมยังเป็น ฿300');
      const saved = await s.env.raw('services');
      eq(new Set(saved.map(x => x.id)).size, saved.length, 'บันทึกลงเครื่องแบบไม่ซ้ำ');
    } finally { s.env.dispose(); }
  });
  await R.t('F05 ควบคุม: ไฟล์ปกติยังสะอาด', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const payload = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      const audit = s.app.auditBackupData(payload);
      eq(audit.clean, true, JSON.stringify(audit));
      eq(audit.dupEntityIds, 0);
    } finally { s.env.dispose(); }
  });

  // ═══ F06 ═══════════════════════════════════════════════════════════════════════════════
  await R.t('F06 ไฟล์ที่กะเปิดอยู่ไม่มีเงินเปิดกะ → ผลตรวจไม่สะอาด · แยกไว้ตรวจ · ติดธงไม่ทราบ (เดิม 0 เงียบ)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { app } = s;
      const payload = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      delete payload.shift.startCash;
      const audit = app.auditBackupData(payload);
      eq(audit.clean, false); eq(audit.badShifts, 1);
      await app.applyBackupData(payload); await settle(20);
      eq(app.state.shift.active, true);
      eq(app.state.shift.startCashInvalid, true, 'ติดธงเงินเปิดกะไม่ทราบ');
      ok((app.state.quarantine || []).some(q => q.kind === 'shift' && (q.reasons || []).includes('bad-startCash')), JSON.stringify(app.state.quarantine));
    } finally { s.env.dispose(); }
  });
  await R.t('F06 ควบคุม: กะที่ปิดแล้วไม่มีเงินเปิดกะ = 0 ตามเดิม ไม่ติดธง ไม่แยกตรวจ', async () => {
    const s = await makeShop({ rows: Object.assign({}, OFFLINE, { shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } }) });
    try {
      const payload = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      delete payload.shift.startCash;
      const audit = s.app.auditBackupData(payload);
      eq(audit.badShifts, 0); eq(audit.clean, true, JSON.stringify(audit));
    } finally { s.env.dispose(); }
  });
  await R.t('F06 แบบ ก: ปิดกะได้ แต่ต้องกรอกหมายเหตุ · หน้าปิดกะเตือน · ประวัติกะติดธง · Telegram บอกว่าไม่ทราบ · กะถัดไปไม่ติดธง', async () => {
    const s = await makeShop({ rows: Object.assign({}, OFFLINE, { telegramToken: '123:abc', telegramChatId: '-100' }) });
    try {
      const { app, env } = s;
      const payload = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      delete payload.shift.startCash;
      await app.applyBackupData(payload); await settle(20);
      ok(app.state.shift.startCashInvalid === true, '(เงื่อนไข)');
      eq(app.closeNoteRequired(0), true, 'ผลต่าง 0 ก็ต้องกรอกหมายเหตุ');
      // หน้าปิดกะ: กล่องคำเตือน
      const calc = app.computeShiftDrawer(app.state.shift);
      proto(app, 'renderClosingMoneyNotes')(calc);
      ok(/เงินเปิดกะของกะนี้ไม่ทราบ/.test(env.document.getElementById('closing-money-notes').innerHTML),
        env.document.getElementById('closing-money-notes').innerHTML);
      // ไม่กรอกหมายเหตุ = ไม่ปิด
      const noteEl = env.document.getElementById('closing-note');
      noteEl.value = '';
      app.cashCounterMode = 'close';
      s.toasts.length = 0;
      await app.confirmCashCount(); await settle(20);
      eq(app.state.shift.active, true, 'ยังไม่ปิดเมื่อไม่มีหมายเหตุ');
      ok(s.toasts.some(t => /เงินเปิดกะของกะนี้ไม่ทราบ/.test(t.m)), JSON.stringify(s.toasts));
      noteEl.value = 'เงินเปิดกะจริงไม่ทราบ';
      await app.confirmCashCount(); await settle(20);
      eq(app.state.shift.active, false, 'ปิดกะได้');
      const h = app.state.shift.history[app.state.shift.history.length - 1];
      eq(h.startCashInvalid, true, 'ประวัติกะติดธง');
      eq(app.state.shift.startCashInvalid, undefined, 'ธงไม่ติดไปกะถัดไป');
      const saved = await env.raw('shift');
      eq(saved.history[saved.history.length - 1].startCashInvalid, true, 'ธงลงเครื่อง');
      const job = (app.state.cloudOutbox || []).find(j => j && j.telegramMessage);
      ok(job && /ไม่ทราบ — เงินเปิดกะไม่ทราบ/.test(job.telegramMessage), job ? job.telegramMessage.slice(0, 600) : 'ไม่มีงาน Telegram');
    } finally { s.env.dispose(); }
  });

  // ═══ F07 ═══════════════════════════════════════════════════════════════════════════════
  for (const amount of [1e20, 0.001, -1e20]) {
    await R.t(`F07 ไฟล์ที่รายการคืน/เก็บส่วนต่าง = ${amount} → ผลตรวจไม่สะอาด · แยกไว้ตรวจ · ไม่นับในลิ้นชัก`, async () => {
      const s = await makeShop({ rows: OFFLINE });
      try {
        const { app } = s;
        const payload = JSON.parse(JSON.stringify(app.buildBackupPayload()));
        payload.shift.cashAdjustments = [{ id: 'adj-x', billId: 'TX-1700000000000-NOTEXIST', kind: 'collect', amount, at: Date.now() }];
        const audit = app.auditBackupData(payload);
        eq(audit.clean, false, JSON.stringify(audit));
        await app.applyBackupData(payload); await settle(20);
        const d = app.computeShiftDrawer(app.state.shift);
        eq(d.expected, 1000, 'ยอดที่ควรมี = เงินเปิดกะ (ไม่นับรายการเสีย)');
        ok((app.state.quarantine || []).some(q => (q.reasons || []).includes('bad-cashAdjustment')), JSON.stringify(app.state.quarantine));
      } finally { s.env.dispose(); }
    });
  }
  await R.t('F07 ตัวคำนวณลิ้นชักไม่นับยอดเสียที่อยู่ในเครื่องแล้ว (ไม่ผ่านการกู้)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const sh = Object.assign({}, s.app.state.shift, { cashAdjustments: [{ amount: 1e20 }, { amount: 0.001 }, { amount: -100 }] });
      const d = s.app.computeShiftDrawer(sh);
      eq(d.invalidAdjustments, 2); eq(d.expected, 900);
    } finally { s.env.dispose(); }
  });
  await R.t('F07 ควบคุม: เงินคืน −100 · เก็บเพิ่ม 100 · −0.50 (ลงตัวที่สตางค์) ผ่านและนับครบ', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { app } = s;
      const payload = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      payload.shift.cashAdjustments = [-100, 100, -0.5].map((amount, i) => ({ id: 'adj-' + i, billId: 'TX-1700000000000-NOTEXIST', kind: amount < 0 ? 'refund' : 'collect', amount, at: Date.now() }));
      const audit = app.auditBackupData(payload);
      eq(audit.clean, true, JSON.stringify(audit));
      await app.applyBackupData(payload); await settle(20);
      const d = app.computeShiftDrawer(app.state.shift);
      eq(d.invalidAdjustments, 0); eq(d.expected, 999.5);
    } finally { s.env.dispose(); }
  });

  // ═══ R1 · R2 · R3 (Codex ตรวจงานแก้ 21 ต.ค. 2569) ════════════════════════════════════════
  const qrCounter = (app) => { const c = { n: 0 }; app.generatePromptPayQR = () => { c.n++; return true; }; return c; };
  await R.t('R1 ต่อคลาวด์ + ยังไม่ยืนยันเครื่องหลัก + มีเครื่องหลักอื่นอยู่แล้ว → ไม่เปิดหน้ารับเงิน ไม่มี QR · รู้ว่าเป็นเครื่องรอง', async () => {
    const a = await makeShop();
    const b = await makeShop({ gas: a.gas, unknownPrimary: true, rows: { deviceId: 'dev-' + 'b'.repeat(32) } });
    try {
      const log = trackModals(b); const qr = qrCounter(b.app);
      eq(b.app.primaryStatus, null, '(เงื่อนไข) ยังไม่รู้สถานะ');
      readyCheckout(b.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      await b.app.openCheckoutModal(); await settle(20);
      eq(log.opened.includes('modal-payment'), false, 'หน้ารับเงินต้องไม่เปิด');
      eq(b.app.primaryStatus && b.app.primaryStatus.isPrimary, false, 'รู้แล้วว่าเป็นเครื่องรอง');
      ok(b.toasts.some(t => /เครื่องรอง/.test(t.m)), JSON.stringify(b.toasts));
      b.app.selectPaymentMethod('promptpay');
      eq(qr.n, 0, 'ไม่วาด QR');
      eq(((await b.env.raw('transactions')) || []).length, 0);
    } finally { a.env.dispose(); b.env.dispose(); }
  });
  await R.t('R1 ร้านใหม่ยังไม่มีเครื่องหลัก → ยืนยันเป็นเครื่องหลักก่อน แล้วเปิดหน้ารับเงิน (สถานะลงเครื่อง)', async () => {
    const s = await makeShop({ unknownPrimary: true });
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      await s.app.openCheckoutModal(); await settle(20);
      ok(log.opened.includes('modal-payment'), JSON.stringify(log));
      eq(s.app.primaryStatus && s.app.primaryStatus.isPrimary, true);
      const saved = await s.env.raw('primaryStatus');
      eq(saved && saved.isPrimary, true, 'บันทึกสถานะลงเครื่อง');
      const tx = await (async () => { s.app.state.selectedPaymentMethod = 'cash'; s.env.document.getElementById('cash-received').value = '300'; await s.app.processCheckout(); await settle(20); return (await s.env.raw('transactions')) || []; })();
      eq(tx.length, 1, 'ขายต่อได้');
    } finally { s.env.dispose(); }
  });
  await R.t('R1 ยังไม่ยืนยันเครื่องหลัก + ต่อชีตไม่ได้ (เน็ตหลุด) → ไม่เปิดหน้ารับเงิน · เลือก Scan ก็ไม่วาด QR', async () => {
    const s = await makeShop({ unknownPrimary: true });
    try {
      const log = trackModals(s); const qr = qrCounter(s.app);
      s.app.cloudPost = async () => { throw new Error('Failed to fetch'); };
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      await s.app.openCheckoutModal(); await settle(20);
      eq(log.opened.includes('modal-payment'), false);
      eq(s.app.primaryStatus, null);
      s.app.selectPaymentMethod('promptpay');
      eq(qr.n, 0);
    } finally { s.env.dispose(); }
  });
  await R.t('R1 ควบคุม: เครื่องหลักที่ยืนยันแล้วแต่ออฟไลน์ · ร้านไม่ต่อคลาวด์ → เปิดหน้ารับเงินได้ทันที', async () => {
    const s1 = await makeShop(); const s2 = await makeShop({ rows: OFFLINE });
    try {
      for (const s of [s1, s2]) {
        const log = trackModals(s);
        s.app.cloudPost = async () => { throw new Error('ไม่ควรเรียกคลาวด์ตอนเปิดหน้ารับเงิน'); };
        readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
        await s.app.openCheckoutModal();
        ok(log.opened.includes('modal-payment'), JSON.stringify(log));
      }
    } finally { s1.env.dispose(); s2.env.dispose(); }
  });
  await R.t('R1 ยืนยันเครื่องหลักไม่สำเร็จตอนกดยืนยัน (หน้ารับเงินเปิดค้าง) → พ้นงานบันทึกแล้วปิดหน้ารับเงิน/ซ่อน QR', async () => {
    const a = await makeShop();
    const b = await makeShop({ gas: a.gas, rows: { deviceId: 'dev-' + 'c'.repeat(32), primaryStatus: { isPrimary: true, checkedAt: Date.now() } }, unknownPrimary: true });
    try {
      const log = trackModals(b);
      readyCheckout(b.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      await b.app.openCheckoutModal();
      ok(log.opened.includes('modal-payment'), '(เงื่อนไข) เปิดได้ตอนสถานะเดิมเป็นเครื่องหลัก');
      b.app.primaryStatus = null;                 // สถานะหาย (เช่นเปลี่ยนปลายทางคลาวด์) ระหว่างหน้ารับเงินเปิดค้าง
      b.app.state.selectedPaymentMethod = 'cash'; b.env.document.getElementById('cash-received').value = '300';
      const done = await b.app.processCheckout(); await settle(20);
      eq(done, false);
      eq(((await b.env.raw('transactions')) || []).length, 0);
      ok(log.closed.includes('modal-payment'), 'ปิดหน้ารับเงินหลังขายไม่สำเร็จ · ' + JSON.stringify(log));
    } finally { a.env.dispose(); b.env.dispose(); }
  });
  await R.t('R1 เซิร์ฟเวอร์ตอบว่าเป็นเครื่องรองตอนยืนยันก่อนรับเงิน → จดสถานะเครื่องรองทันที (ไม่รอซิงก์รอบอื่น)', async () => {
    const s = await makeShop({ unknownPrimary: true });
    try {
      const calls = [];
      s.app.cloudPost = async (action) => { calls.push(action); return { status: 'error', code: 'NOT_PRIMARY_DEVICE', message: 'not primary', details: { primary: { label: 'อีกเครื่อง' } } }; };
      const okResult = await s.app.confirmPrimaryBeforeCheckout();
      eq(okResult, false);
      eq(calls, ['register_primary']);
      eq(s.app.primaryStatus && s.app.primaryStatus.isPrimary, false, 'จดว่าเป็นเครื่องรอง');
      eq(s.app.checkoutBlockReason() !== null, true, 'ด่านปกติรู้ว่าเครื่องรอง');
    } finally { s.env.dispose(); }
  });
  for (let i = 1; i <= 3; i++) {
    await R.t(`R2 รอบ ${i}: รู้ว่าเป็นเครื่องรองระหว่างงานขายรอคิว → ไม่มีบิล · หน้ารับเงินปิด (เดิมบิลลงเครื่องได้ 3/3)`, async () => {
      const s = await makeShop();
      try {
        const log = trackModals(s);
        readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
        await s.app.openCheckoutModal();
        s.app.selectPaymentMethod('cash'); s.env.document.getElementById('cash-received').value = '300';
        let release, entered; const started = new Promise(r => { entered = r; });
        const pending = s.app.withMutation('งานก่อนหน้าที่ช้า', () => new Promise(r => { release = () => r(true); entered(); }));
        await started;
        const checkout = s.app.processCheckout();
        const reject = s.app.notePrimaryStatus(false, { label: 'อีกเครื่อง' });
        release(); await pending; await reject;
        const done = await checkout; await settle(20);
        eq(done, false, 'ขายต้องไม่สำเร็จ');
        eq(((await s.env.raw('transactions')) || []).length, 0, 'ไม่มีบิลในเครื่อง');
        eq(s.app.isCheckoutModalOpen(), false, 'หน้ารับเงินปิด');
      } finally { s.env.dispose(); }
    });
  }
  await R.t('R2 กลายเป็นอ่านอย่างเดียวระหว่างรอยืนยันเครื่องหลัก (busy) → ไม่มีบิล · พ้น busy แล้วหน้ารับเงินปิด/QR หาย', async () => {
    const s = await makeShop();
    try {
      const log = trackModals(s);
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], null);
      await s.app.openCheckoutModal();
      s.app.generatePromptPayQR = () => true;
      s.app.selectPaymentMethod('promptpay');
      s.app.primaryStatus = null;                 // ให้ processCheckout เดินขั้นลงทะเบียนเครื่องหลัก (จุดที่รอเน็ต)
      let release, started; const begun = new Promise(r => { started = r; });
      const original = s.app.cloudPost.bind(s.app);
      s.app.cloudPost = (action, ...args) => action === 'register_primary'
        ? new Promise(r => { release = () => r({ status: 'success', details: { primary: {} } }); started(); }) : original(action, ...args);
      const work = s.app.processCheckout();
      await begun;
      s.app.setReadOnlyWindow(true);
      eq(s.app.isCheckoutModalOpen(), true, '(เงื่อนไข) ระหว่าง busy ยังไม่ปิด');
      release();
      const done = await work; await settle(20);
      eq(done, false);
      eq(((await s.env.raw('transactions')) || []).length, 0);
      eq(s.app._checkoutBusy, false);
      eq(s.app.isCheckoutModalOpen(), false, 'หน้ารับเงินปิดหลังพ้น busy · ' + JSON.stringify(log));
    } finally { s.env.dispose(); }
  });
  await R.t('R3 ไฟล์ที่รหัสบริการเลข 7 กับข้อความ "7" และพนักงาน 9 กับ "9" → ผลตรวจไม่สะอาด · เตือนเรื่องบิลของพนักงานรหัสซ้ำ · กด ฿900 ได้ ฿900 ทันที', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const { app } = s;
      const p = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      p.services[0].id = 7; p.services[0].name = 'Basic';
      p.services.push(Object.assign({}, p.services[0], { id: '7', name: 'VIP', price: 900 }));
      p.staff[0].id = 9;
      p.staff.push(Object.assign({}, p.staff[0], { id: '9', name: 'คนที่สอง' }));
      p.customers = [{ id: 5, name: 'ลูกค้าก', phone: '', visitCount: 1, tier: 'ทั่วไป (General)' },
                     { id: '5', name: 'ลูกค้าข', phone: '', visitCount: 2, tier: 'ทั่วไป (General)' }];
      const audit = app.auditBackupData(p);
      eq(audit.clean, false, 'ผลตรวจต้องไม่สะอาด');
      eq(audit.dupEntityIds, 3); eq(audit.dupStaffIds, 1); eq(audit.dupCustomerIds, 1);
      const text = app.describeBackupAudit(audit);
      ok(/รหัสซ้ำ/.test(text) && /พนักงานรหัสซ้ำ/.test(text) && /นับเป็นของคนแรก/.test(text) && /ลูกค้ารหัสซ้ำ 1 คน/.test(text), text);
      ok(app.isValidBackupObject(p));
      await app.applyBackupData(p); await settle(20);
      const sv = app.state.services.map(x => String(x.id));
      eq(new Set(sv).size, sv.length, 'รหัสบริการไม่ซ้ำ (หลังแปลงชนิด)');
      const st = app.state.staff.map(x => String(x.id));
      eq(new Set(st).size, st.length, 'รหัสพนักงานไม่ซ้ำ');
      const cu = app.state.customers.map(x => String(x.id));
      eq(cu.length, 2); eq(new Set(cu).size, 2, 'รหัสลูกค้าไม่ซ้ำ');
      const vip = app.state.services.find(x => x.name === 'VIP');
      app.state.cart = []; app.addToCart(String(vip.id));
      eq(app.state.cart.map(i => i.price), [900], 'กดการ์ด ฿900 ได้ ฿900');
      app.state.cart = []; app.addToCart('7');
      eq(app.state.cart.map(i => i.name), ['Basic'], 'รหัส 7 คือ Basic');
      const before = app.state.services.map(x => x.id + ':' + x.price).join(',');
      await app.loadState();
      eq(app.state.services.map(x => x.id + ':' + x.price).join(','), before, 'เปิดแอปใหม่แล้วความหมายรหัสเหมือนเดิม');
    } finally { s.env.dispose(); }
  });

  await R.t('R3 ข้อมูลในเครื่องที่เก็บรหัสเป็นเลข 7 ปนกับข้อความ "7" → เปิดแอปแล้วซ่อมเป็นรหัสไม่ซ้ำ (ทางเปิดแอป ไม่ผ่านการแปลงชนิด)', async () => {
    const s = await makeShop({ rows: OFFLINE });
    try {
      const sv = JSON.parse(JSON.stringify(s.app.state.services));
      sv[0].id = 7; sv[0].name = 'Basic';
      sv.push(Object.assign({}, sv[0], { id: '7', name: 'VIP', price: 900 }));
      await s.env.db.state.put({ key: 'services', value: sv });
      await s.app.loadState();
      const ids = s.app.state.services.map(x => String(x.id));
      eq(new Set(ids).size, ids.length, 'รหัสไม่ซ้ำหลังเปิดแอป · ' + ids.join(','));
      const vip = s.app.state.services.find(x => x.name === 'VIP');
      s.app.state.cart = []; s.app.addToCart(String(vip.id));
      eq(s.app.state.cart.map(i => i.price), [900]);
    } finally { s.env.dispose(); }
  });

  R.done();
})();
