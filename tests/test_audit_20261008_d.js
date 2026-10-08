// Regression ของรายงานตรวจ Claude 8 ต.ค. 2569 — หมวด D (เรื่องนโยบาย) ตามที่เจ้าของตัดสินทีละข้อ 8 ต.ค. 2569
//   แก้: D1 ค่าใช้จ่ายลง/ลบได้เฉพาะผู้จัดการ/เจ้าของ ไม่มีเพดาน ไม่ถาม PIN · D2 ประวัติการลบเก็บผู้อนุมัติ
//        D3 บิล 0 บาท = เงินสดเท่านั้น · D5 โฟลเดอร์สำรองในถังขยะ = error · D6 แท็บเดือนคอลัมน์เต็ม = เพิ่มคอลัมน์ให้
//        D7 ล็อกชุดช่องของ hash บิล + เทสต์เฝ้า · เรื่องเล็ก: ลบแถวชีตบน Safari · ย้อนกู้บอกจำนวนบิลหลังกู้ · ชื่อ "May 5"
//   คงเดิม (เจ้าของเลือก): D4 · D8 · D9 · D10 · กรองชนิดไฟล์ในรายการสำรอง — ไม่มีเทสต์ในไฟล์นี้
// ฐานข้อมูลจริง (Dexie + fake-indexeddb) + Apps Script ตัวจริงบน Google จำลอง · เรียกผ่านทางที่ปุ่มบนจอเรียกจริง
// ทุกข้อ (ยกเว้นเทสต์เฝ้า hash ที่ตั้งใจให้ผ่านทั้งก่อน/หลัง) พิสูจน์แล้วว่า "ตก" กับโค้ดก่อนแก้
//   (audit/fixes-20261008/before-D · POS_APP_SRC / POS_GAS_SRC)
const assert = require('assert/strict');
const vm = require('vm');
const { createEnv } = require('./harness_db');
const { seed, quiet, loginAs, makeShop, readyCheckout, settle, createGasEnv } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '->', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
}
const clone = o => JSON.parse(JSON.stringify(o));
// เครื่องขายออฟไลน์ (คำขอทุกตัวล้ม) — แบบเดียวกับ test_audit_20261008.js
async function shop(o) {
  o = o || {};
  const gas = o.gas || createGasEnv();
  const offline = async () => { throw new TypeError('Failed to fetch (ออฟไลน์ในเทสต์)'); };
  const env = createEnv({ fetch: offline, onLine: false });
  const toasts = quiet(env.app);
  await seed(env, Object.assign({ googleSheetsApiToken: gas.token, primaryStatus: { isPrimary: true, checkedAt: Date.now() } }, o.rows || {}));
  await env.app.loadState(); loginAs(env.app, o.role || 'owner');
  env.app.scheduleCloudRetry = () => {}; env.app.resumePendingCloudWork = () => {};
  return Object.assign(env, { gas, toasts });
}
async function sale(s, items, pay) {
  readyCheckout(s, items, pay);
  assert.equal(await s.app.processCheckout(), true, 'เงื่อนไขเทสต์: ขายได้');
  await settle(40);
  return s.app.state.transactions.at(-1);
}
const fillExpense = (s, amount, note, source) => {
  const E = id => s.document.getElementById(id);
  E('expense-type').value = 'other'; E('expense-amount').value = String(amount);
  E('expense-note').value = note || 'x'; E('expense-source').value = source || 'drawer';
};
// ตะกร้ายอด 0 บาท (ตัดผม 300 ลด 300 · หมวดไม่คิด VAT) แล้วเปิดรอบชำระเงินใหม่ตามยอดนั้น
const zeroCart = (s) => {
  readyCheckout(s, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 0);
  s.document.getElementById('cart-discount').value = '300';
  s.document.getElementById('cash-received').value = '';
  s.app.beginCheckoutAttempt();
};

(async () => {
  // ═══════════════════════════ D1: ค่าใช้จ่าย = ผู้จัดการ/เจ้าของเท่านั้น ═══════════════════════════
  await test('D1 ตารางสิทธิ์กลาง: ลง/ลบค่าใช้จ่ายได้เฉพาะผู้จัดการและเจ้าของ', async () => {
    const s = await shop();
    try {
      const can = (role, action) => { loginAs(s.app, role); return s.app.authorize(action, 'x', { quiet: true }); };
      assert.deepEqual(['owner', 'manager', 'staff'].map(r => can(r, 'expense.add')), [true, true, false]);
      assert.deepEqual(['owner', 'manager', 'staff'].map(r => can(r, 'expense.delete')), [true, true, false]);
    } finally { s.dispose(); }
  });

  await test('D1 พนักงานกดเพิ่มค่าใช้จ่าย (ทางฟอร์มจริง) → ไม่บันทึก ไม่ลงเครื่อง บอกให้ผู้จัดการลง · ไม่ถาม PIN', async () => {
    const s = await shop({ role: 'staff' });
    try {
      let asked = 0; s.app.askSecret = async () => { asked++; return '222222'; };
      fillExpense(s, 50, 'น้ำแข็ง');
      await s.app.addExpense(); await settle();
      assert.equal(s.app.state.shift.expenses.length, 0);
      assert.equal(((await s.raw('shift')) || {}).expenses.length, 0);
      assert.equal(asked, 0);
      assert.ok(s.toasts.some(t => /ทำได้เฉพาะผู้จัดการ/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.dispose(); }
  });

  await test('D1 ผู้จัดการลง 400 + 5,000 จากลิ้นชัก → บันทึกลงเครื่องทันที ไม่มีเพดาน ไม่ถาม PIN ไม่มีผู้อนุมัติ', async () => {
    const s = await shop({ role: 'manager' });
    try {
      let asked = 0; s.app.askSecret = async () => { asked++; return null; };
      s.app.confirmPinStepUp = async () => { asked++; return false; };
      fillExpense(s, 400, 'ค่าไฟ'); await s.app.addExpense(); await settle();
      fillExpense(s, 5000, 'ค่าซ่อม'); await s.app.addExpense(); await settle();
      const raw = (await s.raw('shift')).expenses;
      assert.deepEqual(raw.map(e => [e.amount, e.byId, e.paidFrom, e.approvedBy]), [[400, 'mg-1', 'drawer', undefined], [5000, 'mg-1', 'drawer', undefined]]);
      assert.equal(asked, 0);
    } finally { s.dispose(); }
  });

  await test('D1 ลบ: พนักงานลบไม่ได้ (แม้ของตัวเอง) · ผู้จัดการลบรายการของเจ้าของได้ไม่ถาม PIN', async () => {
    const s = await shop({ role: 'owner' });
    try {
      let asked = 0; s.app.confirmPinStepUp = async () => { asked++; return false; };
      fillExpense(s, 120, 'ของเจ้าของ'); await s.app.addExpense(); await settle();
      const own = s.app.state.shift.expenses[0];
      s.app.state.shift.expenses.push({ id: 'exp_staff_1', type: 'other', amount: 30, note: 'พนักงานลง (เก่า)', time: Date.now(), by: 'เอ', byId: 'st-1', paidFrom: 'drawer' });
      await s.app.saveState();
      loginAs(s.app, 'staff'); s.toasts.length = 0;
      await s.app.deleteExpense('exp_staff_1'); await (s.app._confirmP || null); await settle();
      assert.equal(s.app.state.shift.expenses.length, 2, 'พนักงานลบของตัวเองไม่ได้แล้ว');
      loginAs(s.app, 'manager'); s.app._confirmP = null;
      await s.app.deleteExpense(own.id); await s.app._confirmP; await settle();
      assert.deepEqual((await s.raw('shift')).expenses.map(e => e.id), ['exp_staff_1']);
      assert.equal(asked, 0, 'ไม่ถาม PIN ซ้ำ');
    } finally { s.dispose(); }
  });

  await test('D1 เปลี่ยนผู้ใช้ (updateUserRoleUI ตัวจริง) → ฟอร์มค่าใช้จ่ายซ่อน/แสดงตามสิทธิ์ทันที ไม่ค้างสถานะของคนก่อน', async () => {
    const s = await shop({ role: 'manager' });
    try {
      const P = Object.getPrototypeOf(s.app);
      const view = () => [s.document.getElementById('form-add-expense').style.display, s.document.getElementById('expense-role-note').style.display];
      P.updateUserRoleUI.call(s.app);
      assert.deepEqual(view(), ['flex', 'none']);
      loginAs(s.app, 'staff'); P.updateUserRoleUI.call(s.app);
      assert.deepEqual(view(), ['none', 'block']);
      loginAs(s.app, 'owner'); P.updateUserRoleUI.call(s.app);
      assert.deepEqual(view(), ['flex', 'none']);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ D2: ประวัติการลบเก็บผู้อนุมัติ ═══════════════════════════
  await test('D2 ลบค่าใช้จ่ายที่เคยอนุมัติ → expenseLog (ลงเครื่อง) มีชื่อ/รหัสผู้อนุมัติ และหน้ารายงานแสดง', async () => {
    const s = await shop({ role: 'manager' });
    try {
      s.app.state.shift.expenses.push({ id: 'exp_ok_1', type: 'other', amount: 350, note: 'ของใช้ร้าน', time: Date.now(), by: 'เอ', byId: 'st-1',
        paidFrom: 'drawer', approvedBy: 'บี', approvedById: 'mg-1' });
      await s.app.saveState();
      s.app._confirmP = null; await s.app.deleteExpense('exp_ok_1'); await s.app._confirmP; await settle();
      const log = (await s.raw('expenseLog')).find(x => x.expenseId === 'exp_ok_1');
      assert.ok(log, 'ต้องมีประวัติการลบ');
      assert.equal(log.approvedBy, 'บี'); assert.equal(log.approvedById, 'mg-1'); assert.equal(log.addedBy, 'เอ');
      Object.getPrototypeOf(s.app).renderAuditTrail.call(s.app, 'daily', s.app.getBusinessISODate(Date.now()), '');
      assert.match(s.document.getElementById('report-expense-deletions-body').innerHTML, /อนุมัติโดย บี/);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ กติกาใหม่ (แทน D3): ยอดบิลต้องมากกว่า 0 บาท ═══════════════════════════
  // เจ้าของตัดสิน 8 ต.ค. 2569: "ลดบิลเหลือ 0 ไม่ได้ — จุดนี้ไม่เกิดขึ้นจริง" (แทน "บิล 0 บาท = เงินสดเท่านั้น")
  await test('Z ส่วนลดเท่ายอดพอดี (ทางปุ่มชำระเงินจริง) → ไม่เปิดหน้าชำระเงิน บอกเหตุผล · ยอดในตะกร้าบอก "ส่วนลดต้องน้อยกว่าราคารวม"', async () => {
    const s = await shop();
    try {
      zeroCart(s);
      let opened = 0; s.app.openModal = (id) => { if (id === 'modal-payment') opened++; };
      s.toasts.length = 0;
      s.app.openCheckoutModal();
      assert.equal(opened, 0, 'ต้องไม่เปิดหน้าชำระเงิน');
      assert.ok(s.toasts.some(t => /มากกว่า 0 บาท/.test(t.m)), JSON.stringify(s.toasts));
      Object.getPrototypeOf(s.app).updateCartTotals.call(s.app);
      assert.equal(s.document.getElementById('summary-total').innerText, 'ส่วนลดต้องน้อยกว่าราคารวม');
      s.document.getElementById('cart-discount').value = '299';
      s.app.openCheckoutModal();
      assert.equal(opened, 1, 'ลดน้อยกว่ายอด 1 บาท ต้องเปิดได้ตามปกติ');
    } finally { s.dispose(); }
  });

  await test('Z ส่วนลดเท่ายอด/เกินยอด ข้ามหน้าจอไปกดบันทึกตรง ๆ ทุกช่องทาง (เงินสด/บัตร/QR/แบ่งจ่าย) → ปฏิเสธ ไม่มีบิลลงเครื่อง', async () => {
    const s = await shop();
    try {
      for (const [m, disc] of [['cash', '300'], ['credit', '300'], ['promptpay', '300'], ['split', '300'], ['cash', '500']]) {
        zeroCart(s);
        s.document.getElementById('cart-discount').value = disc;
        s.document.getElementById('cash-received').value = '0';
        if (m === 'split') s.document.getElementById('split-cash-amount').value = '1';
        s.app.state.selectedPaymentMethod = m;
        s.toasts.length = 0;
        assert.equal(await s.app.processCheckout(), false, m + ' ' + disc);
        assert.ok(s.toasts.some(t => /มากกว่า 0 บาท/.test(t.m)), m + ' ' + JSON.stringify(s.toasts));
      }
      assert.equal((await s.raw('transactions')).length, 0);
    } finally { s.dispose(); }
  });

  await test('Z ตะกร้าที่ยอด 0 จากรายการราคา 0 ที่หลุดมา (ไม่มีส่วนลด) → เปิดหน้าชำระเงินไม่ได้ · บันทึกไม่ได้ · แผนบัตรไม่ผ่าน', async () => {
    const s = await shop();
    try {
      readyCheckout(s, [{ id: 's1', name: 'ตัดผม', price: 0 }], 'cash', 0);
      let opened = 0; s.app.openModal = (id) => { if (id === 'modal-payment') opened++; };
      s.app.openCheckoutModal();
      assert.equal(opened, 0);
      assert.equal(s.app.buildCheckoutPlan('credit', { feeRate: 0 }).ok, false);
      assert.equal(s.app.buildCheckoutPlan('cash', {}).ok, false);
      s.app.beginCheckoutAttempt();
      s.toasts.length = 0;
      assert.equal(await s.app.processCheckout(), false);
      assert.ok(s.toasts.some(t => /มากกว่า 0 บาท/.test(t.m)), JSON.stringify(s.toasts));
      assert.equal((await s.raw('transactions')).length, 0);
    } finally { s.dispose(); }
  });

  await test('Z ส่วนลดน้อยกว่ายอด 1 บาท → ยอด 1 บาท ออกบิลได้ (เงินสด/บัตร) — กติกาไม่ไปกันบิลปกติ', async () => {
    const s = await shop();
    try {
      readyCheckout(s, null, 'cash', 1);
      s.document.getElementById('cart-discount').value = '299'; s.app.beginCheckoutAttempt();
      assert.equal(await s.app.processCheckout(), true);
      assert.equal(s.app.state.transactions.at(-1).total, 1);
      await settle(40);
      readyCheckout(s, null, 'credit');
      s.document.getElementById('cart-discount').value = '299'; s.app.beginCheckoutAttempt();
      assert.equal(await s.app.processCheckout(), true);
      const c = s.app.state.transactions.at(-1);
      assert.equal(c.paymentMethod, 'credit'); assert.ok(c.total > 0);
    } finally { s.dispose(); }
  });

  await test('Z หน้าแก้บิล (ทางจริง): แก้ส่วนลดจนยอดเหลือ 0 ไม่ได้ ทั้งบิลเงินสดและบิลโอน · ตัวอย่างยอดในหน้าแก้บิลบอกเหตุผล · ลดเหลือ 1 บาทได้', async () => {
    const { env, app } = await makeShop();
    try {
      await settle();
      const toasts = []; app.showToast = (m) => toasts.push(String(m));
      const fill = (tx, discount, pay) => {
        app.openTransactionEdit(tx.id);
        env.document.getElementById('edit-tx-customer').value = tx.customerName;
        env.document.getElementById('edit-tx-payment').value = pay;
        env.document.getElementById('edit-tx-discount').value = String(discount);
        const selects = (tx.details || []).map((d, i) => ({ value: d.staffId, getAttribute: () => String(i) }));
        env.document.querySelectorAll = (sel) => /edit-tx-service-staff-select/.test(sel) ? selects : [];
      };
      const edit = async (tx, discount, pay) => { fill(tx, discount, pay); await app.saveTransactionEdit(); await settle(30); };
      const rawTx = async (id) => (await env.raw('transactions')).find(t => t.id === id);
      readyCheckout(env, null, 'cash'); assert.equal(await app.processCheckout(), true); await settle(40);
      const c = app.state.transactions.at(-1);
      fill(c, 300, 'cash'); app.recalculateEditTxTotal();
      assert.equal(env.document.getElementById('edit-tx-total').value, '—', 'ตัวอย่างยอดต้องไม่โชว์ ฿0');
      assert.match(env.document.getElementById('edit-tx-hint').innerText, /มากกว่า 0 บาท/);
      toasts.length = 0;
      await edit(c, 300, 'cash');
      let r = await rawTx(c.id);
      assert.deepEqual([r.total, r.discount], [300, 0], 'ลดจนเหลือ 0 ต้องไม่บันทึก');
      assert.ok(toasts.some(m => /มากกว่า 0 บาท/.test(m)), JSON.stringify(toasts));
      await edit(c, 300, 'promptpay');
      r = await rawTx(c.id);
      assert.deepEqual([r.total, r.paymentMethod], [300, 'cash'], 'ลดจนเหลือ 0 พร้อมเปลี่ยนเป็นโอนต้องไม่บันทึก');
      readyCheckout(env, null, 'promptpay'); assert.equal(await app.processCheckout(), true); await settle(40);
      const q = app.state.transactions.at(-1);
      toasts.length = 0;
      await edit(q, 300, 'promptpay');
      r = await rawTx(q.id);
      assert.deepEqual([r.total, r.paymentMethod], [300, 'promptpay'], 'บิลโอนลดจนเหลือ 0 ต้องไม่บันทึก (ไม่เก็บเงินจริง = ยกเลิกบิล)');
      assert.ok(toasts.some(m => /มากกว่า 0 บาท/.test(m)), JSON.stringify(toasts));
      await edit(c, 299, 'cash');
      r = await rawTx(c.id);
      assert.deepEqual([r.total, r.discount], [1, 299], 'ลดเหลือ 1 บาทต้องบันทึกได้');
    } finally { env.dispose(); }
  });

  await test('Z บิล 0 บาทเก่า (มีก่อนกติกานี้): แก้ชื่อลูกค้าได้ตามปกติ · เปลี่ยนช่องทางเป็นโอนไม่ได้', async () => {
    const { env, app } = await makeShop();
    try {
      await settle();
      const toasts = []; app.showToast = (m) => toasts.push(String(m));
      readyCheckout(env, null, 'cash'); assert.equal(await app.processCheckout(), true); await settle(40);
      const tx = app.state.transactions.at(-1);
      // จำลองบิลที่ออกก่อนกติกา (ลด 100% เงินสด): ตัวเลขทุกช่องลงตัวแบบที่แอปรุ่นก่อนเขียน
      Object.assign(tx, { discount: 300, nonVatBase: 0, vatableBase: 0, vatAmount: 0, rounding: 0, total: 0, cashReceived: 0, cashChange: 0,
        tender: Object.assign({}, tx.tender, { amount: 0, received: 0, change: 0 }) });
      tx.details = tx.details.map(d => Object.assign({}, d, { netPrice: 0, commissionAmount: 0 }));
      await app.saveStateOrThrow('seed legacy zero bill');
      const edit = async (name, pay) => {
        app.openTransactionEdit(tx.id);
        env.document.getElementById('edit-tx-customer').value = name;
        env.document.getElementById('edit-tx-payment').value = pay;
        env.document.getElementById('edit-tx-discount').value = '300';
        const selects = (tx.details || []).map((d, i) => ({ value: d.staffId, getAttribute: () => String(i) }));
        env.document.querySelectorAll = (sel) => /edit-tx-service-staff-select/.test(sel) ? selects : [];
        await app.saveTransactionEdit(); await settle(30);
      };
      const rawTx = async () => (await env.raw('transactions')).find(t => t.id === tx.id);
      await edit('ลูกค้าใหม่', 'promptpay');
      let r = await rawTx();
      assert.deepEqual([r.customerName, r.paymentMethod], [tx.customerName, 'cash'], 'เปลี่ยนเป็นโอนต้องไม่บันทึกทั้งก้อน');
      assert.ok(toasts.some(m => /เปลี่ยนช่องทางเป็นโอนไม่ได้/.test(m)), JSON.stringify(toasts));
      await edit('ลูกค้าใหม่', 'cash');
      r = await rawTx();
      assert.deepEqual([r.customerName, r.total, r.paymentMethod], ['ลูกค้าใหม่', 0, 'cash'], 'แก้ชื่อต้องบันทึกได้');
    } finally { env.dispose(); }
  });

  await test('Z หน้าแก้บิล: ตัวคำนวณยอด (ตัวเดียวกับตัวอย่างยอดในหน้าแก้บิล) ปฏิเสธส่วนลดเท่ายอด บอกเหตุผล', async () => {
    const s = await shop();
    try {
      const tx = await sale(s);
      const r = s.app.computeEditTotals(tx, tx.details, '300');
      assert.equal(r.ok, false); assert.match(r.error, /มากกว่า 0 บาท/);
      assert.equal(s.app.computeEditTotals(tx, tx.details, '299').ok, true);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ D5: โฟลเดอร์สำรองอยู่ในถังขยะ ═══════════════════════════
  await test('D5 โฟลเดอร์สำรองถูกทิ้งลงถังขยะ → backup ตอบ error BACKUP_FOLDER_TRASHED ไม่สร้างไฟล์ · list บอกเหตุ · กู้โฟลเดอร์คืนแล้วสำรองได้', async () => {
    const { env, app, gas } = await makeShop();
    try {
      const data = clone(app.buildBackupPayload());
      const first = gas.post({ action: 'backup', backupData: data });
      assert.equal(first.status, 'success', JSON.stringify(first));
      const folder = gas.DriveApp._folders[gas.ctx.BACKUP_FOLDER_NAME];
      folder.setTrashed(true);
      const nFiles = folder._files.length;
      const r = gas.post({ action: 'backup', backupData: data });
      assert.equal(r.status, 'error', JSON.stringify(r));
      assert.equal(r.code, 'BACKUP_FOLDER_TRASHED');
      assert.match(r.message, /ถังขยะ/); assert.match(r.message, /กู้คืนโฟลเดอร์/);
      assert.equal(folder._files.length, nFiles, 'ห้ามเขียนไฟล์ลงโฟลเดอร์ในถังขยะ');
      const ownerKey = gas.setupOwnerKey();
      const list = gas.post({ action: 'list_backups', ownerKey });
      assert.equal(list.status, 'error', JSON.stringify(list)); assert.match(list.message, /ถังขยะ/);
      folder.setTrashed(false);
      assert.equal(gas.post({ action: 'backup', backupData: data }).status, 'success');
      assert.equal(gas.post({ action: 'list_backups', ownerKey }).details.files.length, 2);
    } finally { env.dispose(); }
  });

  await test('D5 ไม่มี Folder ID ที่จำไว้ + โฟลเดอร์ชื่อนี้อยู่ในถังขยะ → error และไม่จำ ID ของโฟลเดอร์ในถังขยะ · ตั้ง Folder ID เป็นโฟลเดอร์ในถังขยะไม่ได้', async () => {
    const gas = createGasEnv();
    const folder = gas.DriveApp.createFolder(gas.ctx.BACKUP_FOLDER_NAME);
    folder.setTrashed(true);
    assert.throws(() => gas.ctx.getBackupFolder_(true), /ถังขยะ/);
    assert.equal(gas.props[gas.ctx.POS_BACKUP_FOLDER_ID_PROPERTY], undefined);
    assert.throws(() => gas.ctx.setPosBackupFolderId(folder.getId()), /ถังขยะ/);
    assert.equal(gas.props[gas.ctx.POS_BACKUP_FOLDER_ID_PROPERTY], undefined);
  });

  // ผู้ตรวจอิสระ: ทิ้งโฟลเดอร์เก่าลงถังขยะแล้วสร้างใหม่ชื่อเดิม (ยังไม่เคยจำ ID) → เดิมขึ้น "มีมากกว่า 1 โฟลเดอร์"
  await test('D5 ชื่อซ้ำ: โฟลเดอร์เก่าในถังขยะ + โฟลเดอร์ใหม่ชื่อเดิม → ใช้อันใหม่และจำ ID อันใหม่ (ไม่ใช่ error "มากกว่า 1 โฟลเดอร์")', async () => {
    const gas = createGasEnv();
    const NAME = gas.ctx.BACKUP_FOLDER_NAME;
    const old = gas.DriveApp.createFolder(NAME); old.setTrashed(true);
    const live = gas.DriveApp.createFolder(NAME);
    // ชีตจำลองเก็บได้ชื่อละโฟลเดอร์ — จำลอง Drive จริงที่คืนทั้งสองอัน (รวมอันในถังขยะ)
    gas.DriveApp.getFoldersByName = (n) => { const a = n === NAME ? [old, live] : []; let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    assert.equal(gas.ctx.getBackupFolder_(true).getId(), live.getId());
    assert.equal(gas.props[gas.ctx.POS_BACKUP_FOLDER_ID_PROPERTY], live.getId());
  });

  // ผู้ตรวจอิสระ: ทาง list_backups (ไม่สร้างโฟลเดอร์) ไม่เคยมีเทสต์ — ปลดด่านเฉพาะทางนี้แล้วเทสต์เดิมยังเขียว
  await test('D5 รายการสำรอง (ทาง HTTP · ยังไม่เคยจำ Folder ID) + โฟลเดอร์ชื่อนี้อยู่ในถังขยะ → error บอกถังขยะ และไม่จำ ID', async () => {
    const gas = createGasEnv();
    const ownerKey = gas.setupOwnerKey();
    gas.DriveApp.createFolder(gas.ctx.BACKUP_FOLDER_NAME).setTrashed(true);
    const list = gas.post({ action: 'list_backups', ownerKey });
    assert.equal(list.status, 'error', JSON.stringify(list));
    assert.match(list.message, /ถังขยะ/);
    assert.equal(gas.props[gas.ctx.POS_BACKUP_FOLDER_ID_PROPERTY], undefined);
  });

  // ═══════════════════════════ D6: แท็บเดือนคอลัมน์เต็มพอดี ═══════════════════════════
  await test('D6 แท็บเดือนที่คอลัมน์เต็มพอดี (13 คอลัมน์) → ขายแล้วบิลขึ้นชีตได้ · เพิ่มคอลัมน์รุ่นบิลท้ายตาราง (ซ่อน) ไม่ขยับข้อมูลเดิม', async () => {
    const gas = createGasEnv();
    const { env, app } = await makeShop({ gas });
    try {
      const mk = app.getBusinessMonthKey(Date.now());
      const H = Array.from(gas.ctx.BILL_HEADERS);
      const sh = gas.ss.insertSheet(mk);
      sh.getRange(1, 1, 1, H.length).setValues([H]);
      sh._setMaxColumns(H.length);
      readyCheckout(env); assert.equal(await app.processCheckout(), true);
      await settle(60); await app.syncPendingTransactions(true); await settle(40);
      const tx = app.state.transactions.at(-1);
      assert.equal(tx.syncStatus, 'synced', 'บิลต้องขึ้นชีตได้ (เดิม SERVER_ERROR ทุกใบของเดือนนั้น)');
      assert.equal(sh.getMaxColumns(), H.length + 1);
      assert.deepEqual(sh._grid[0].slice(0, H.length), H, 'หัวตารางเดิมไม่ขยับ');
      assert.equal(sh._grid[0][H.length], gas.ctx.BILL_REV_HEADER);
      assert.ok(sh._hiddenCols.has(H.length + 1), 'คอลัมน์รุ่นบิลซ่อนไว้');
      assert.ok(sh._grid.some(r => r[0] === tx.id), 'มีแถวบิล');
    } finally { env.dispose(); }
  });

  // ═══════════════════════════ D7: ล็อกชุดช่องของ hash บิล ═══════════════════════════
  const BASE = { id: 'TX-1791470164084-Q6453ED4', date: 1791470164084, monthKey: '10-2026', dateTimeStr: '2026-10-08 21:36:04',
    customerName: 'ลูกค้าทั่วไป (Walk-in)', services: ['ตัดผม', 'น้ำ'], subtotal: 320, discount: 0, nonVatBase: 300, vatableBase: 20,
    vatAmount: 1.4, rounding: 0.6, vatRate: 7, total: 322, paymentMethod: 'cash', staffNames: ['เอ', 'บี'],
    lines: [{ price: 300, netPrice: 300, vatable: false }, { price: 20, netPrice: 20, vatable: true }] };
  const SPLIT = Object.assign({}, BASE, { paymentMethod: 'split', payments: [{ method: 'cash', amount: 100 }, { method: 'credit', amount: 222 }] });
  const hashOf = (gas, p) => { const v = gas.ctx.validateBillPayload_(clone(p)); assert.ok(v.ok, v.message); return gas.ctx.canonicalBillHash_(clone(p), v); };

  await test('D7 เทสต์เฝ้า: hash ของบิลรูปแบบปัจจุบัน = ค่าเดิมที่จดไว้ (ห้ามเปลี่ยน — บิลบนชีตทุกใบใช้ค่านี้)', async () => {
    const gas = createGasEnv();
    // ค่าคำนวณจาก Apps Script ก่อนแก้ D7 (audit/fixes-20261008/before-D) — ผลต้องเท่าเดิมทุกตัว
    assert.equal(hashOf(gas, BASE), 'aca178d2e82d7e44e8ba08b6caf4bb8c4b656f168951831d5062a6cf3de45947');
    assert.equal(hashOf(gas, SPLIT), '46f40d7765fa659373ff1cdf6b6ceb3b3e7bc6b141522405c002bda21f8f0b20');
  });

  // หมายเหตุ (ผู้ตรวจอิสระ): ส่วน "ก้อนเงิน" ผ่านทุกกรณีอยู่แล้ว เพราะ readSplitPayments_ สร้าง payments ใหม่เป็น {method, amount}
  //   ก่อนถึง hash — ตัวกรอง BILL_HASH_PAYMENT_FIELDS_ เป็นด่านสำรองเผื่อวันหน้ามีคนแก้ readSplitPayments_ · ส่วนรายการย่อยตรวจจริง
  await test('D7 แอปส่งช่องใหม่ในรายการย่อย/ก้อนเงินมาเพิ่ม → hash ไม่เปลี่ยน', async () => {
    const gas = createGasEnv();
    const more = clone(SPLIT);
    more.lines = more.lines.map(l => Object.assign({ staffId: 'st-1', kind: 'service' }, l));
    more.payments = more.payments.map(p => Object.assign({ ref: 'x' }, p));
    assert.equal(hashOf(gas, more), hashOf(gas, SPLIT));
  });

  await test('D7 เทสต์เฝ้า: ช่องที่ buildBillPayload ส่งในรายการย่อย/ก้อนเงิน ต้องอยู่ในชุดช่องของ hash (ชุดล็อกไว้ตายตัว)', async () => {
    const gas = createGasEnv();
    const pinned = (name) => Array.from(vm.runInContext(name, gas.ctx) || []);
    assert.deepEqual(pinned('BILL_HASH_LINE_FIELDS_'), ['price', 'netPrice', 'vatable'],
      'แก้ชุดช่องของ hash = บิลเก่าทุกใบ hash ไม่ตรง (different:detail / REVISION_CONFLICT) — ต้องทำ hash รุ่นใหม่ที่อ่านรุ่นเก่าได้ก่อน');
    assert.deepEqual(pinned('BILL_HASH_PAYMENT_FIELDS_'), ['method', 'amount']);
    const s = await shop();
    try {
      readyCheckout(s, null, 'split');
      s.document.getElementById('split-cash-amount').value = '100';
      assert.equal(await s.app.processCheckout(), true, 'เงื่อนไขเทสต์: ขายแบบแบ่งจ่ายได้ ' + JSON.stringify(s.toasts.slice(-2)));
      await settle(40);
      const tx = s.app.state.transactions.at(-1);
      assert.equal(tx.paymentMethod, 'split');
      const p = s.app.buildBillPayload(tx);
      const lineKeys = [...new Set(p.lines.flatMap(l => Object.keys(l)))];
      const payKeys = [...new Set(p.payments.flatMap(x => Object.keys(x)))];
      const extraL = lineKeys.filter(k => !pinned('BILL_HASH_LINE_FIELDS_').includes(k));
      const extraP = payKeys.filter(k => !pinned('BILL_HASH_PAYMENT_FIELDS_').includes(k));
      assert.deepEqual(extraL, [], 'app.js ส่งช่องใหม่ในรายการย่อย — ตัดสินก่อนว่าต้องเข้า hash ไหม (ไม่เข้า = ไม่ต้องทำอะไร แค่เพิ่มในรายการยกเว้นของเทสต์นี้)');
      assert.deepEqual(extraP, [], 'app.js ส่งช่องใหม่ในก้อนเงิน — ตัดสินก่อนว่าต้องเข้า hash ไหม');
    } finally { s.dispose(); }
  });

  await test('D7 ทางจริง: บิลขึ้นชีตแล้ว → แอปรุ่นใหม่ส่งบิลเดิม (รุ่นเดิม) ที่มีช่องเพิ่มในรายการย่อย → ชีตรับ ไม่ใช่ REVISION_CONFLICT', async () => {
    const gas = createGasEnv();
    const { env, app } = await makeShop({ gas });
    try {
      readyCheckout(env); assert.equal(await app.processCheckout(), true);
      await settle(60); await app.syncPendingTransactions(true); await settle(40);
      const tx = app.state.transactions.at(-1);
      assert.equal(tx.syncStatus, 'synced', 'เงื่อนไขเทสต์: บิลขึ้นชีตแล้ว');
      const p = app.buildBillPayload(tx);
      p.lines = p.lines.map(l => Object.assign({}, l, { staffId: 'st-1' }));   // จำลองแอปรุ่นหน้าเพิ่มช่อง
      const r = gas.post(p);
      assert.equal(r.status, 'success', JSON.stringify(r));
    } finally { env.dispose(); }
  });

  // ═══════════════════════════ เรื่องเล็ก: ลบแถวชีตบน Safari ═══════════════════════════
  await test('เล็ก-1 ลบแถวบนชีตจากหน้าตรวจความตรงกัน บน Safari (Date.parse อ่าน "yyyy-MM-dd HH:mm:ss" ไม่ออก) → สั่งคำนวณสรุปวันของบิล ไม่ใช่วันนี้', async () => {
    const s = await shop();
    try {
      vm.runInContext("(() => { const p = Date.parse; Date.parse = (x) => /^\\d{4}-\\d{2}-\\d{2} \\d/.test(String(x)) ? NaN : p(x); })()", s.ctx);
      assert.ok(Number.isNaN(vm.runInContext("Date.parse('2026-09-10 21:30:00')", s.ctx)), 'เงื่อนไขเทสต์: จำลอง Safari');
      s.app._reconcile = { extra: [{ id: 'TX-1789000000000-SAFARI01', monthKey: '09-2026', when: '2026-09-10 21:30:00', total: 450, customer: 'ก' }] };
      s.app.renderReconcileStale = () => {};
      s.app.reconcileDeleteSheetBill('TX-1789000000000-SAFARI01'); await s.app._confirmP; await settle(40);
      const job = (await s.raw('cloudOutbox')).find(j => j.voidDelete && j.voidDelete.id === 'TX-1789000000000-SAFARI01');
      assert.ok(job, 'ต้องมีงานลบแถว');
      assert.deepEqual(job.dateKeys, ['2026-09-10']);
      assert.equal(job.voidDelete.date, Date.parse('2026-09-10T21:30:00+07:00'));
      const log = (await s.raw('voidLog')).find(v => v.billId === 'TX-1789000000000-SAFARI01');
      assert.equal(log.billDate, Date.parse('2026-09-10T21:30:00+07:00'));
    } finally { s.dispose(); }
  });

  // ผู้ตรวจอิสระ: ข้อความวันเวลาที่ตัวอ่านแถวชีตไม่รู้จักแต่ Date.parse อ่านได้ (เช่น ISO) เดิมใช้ได้ — ห้ามถอยไปเป็น "วันนี้"
  await test('เล็ก-1 ช่องวันเวลาแบบ ISO (พิมพ์เองในชีต) → ยังได้วันของบิล ไม่ถอยไปเป็นวันนี้', async () => {
    const s = await shop();
    try {
      vm.runInContext("(() => { const p = Date.parse; Date.parse = (x) => /^\\d{4}-\\d{2}-\\d{2} \\d/.test(String(x)) ? NaN : p(x); })()", s.ctx);
      s.app._reconcile = { extra: [{ id: 'TX-1789000000000-ISOWHEN1', monthKey: '09-2026', when: '2026-09-10T14:30:00.000Z', total: 450, customer: 'ก' }] };
      s.app.renderReconcileStale = () => {};
      s.app.reconcileDeleteSheetBill('TX-1789000000000-ISOWHEN1'); await s.app._confirmP; await settle(40);
      const job = (await s.raw('cloudOutbox')).find(j => j.voidDelete && j.voidDelete.id === 'TX-1789000000000-ISOWHEN1');
      assert.ok(job, 'ต้องมีงานลบแถว');
      assert.deepEqual(job.dateKeys, ['2026-09-10']);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ เรื่องเล็ก: ย้อนการกู้บอกจำนวนบิลหลังกู้ ═══════════════════════════
  await test('เล็ก-2 ย้อนข้อมูล (ทางจริง): กล่องยืนยันบอกจำนวนบิลที่ขายหลังกู้ · ไม่มีบิลหลังกู้ = ไม่ขึ้นข้อความนี้', async () => {
    const s = await shop();
    try {
      const a = await sale(s); a.syncStatus = 'synced'; await s.app.saveState();
      const file = clone(s.app.buildBackupPayload());
      s.app.cloudPost = async () => ({ status: 'success', details: { backupData: clone(file) } });
      s.app.downloadExportFile = () => true;
      s.app.askTypedConfirm = async () => false;
      s.app.restoreFromDriveBackup('FILE-1', '8/10/2569'); await s.app._confirmP;
      await settle(5);
      await s.app.undoLastRestore(); await s.app._confirmP;
      assert.doesNotMatch(s.app._lastConfirmMsg, /ขายหลังกู้/);
      await sale(s); await sale(s);
      await s.app.undoLastRestore(); await s.app._confirmP;
      assert.match(s.app._lastConfirmMsg, /บิลที่ขายหลังกู้ข้อมูล 2 ใบ/);
    } finally { s.dispose(); }
  });

  // ผู้ตรวจอิสระ: เทสต์ข้างบนกู้ไฟล์ที่เหมือนข้อมูลในเครื่อง — ตัวกรองทั้งสองของการนับไม่เคยถูกใช้ (ปลดแล้วยังเขียว)
  await test('เล็ก-2 ย้อนข้อมูล: กู้ไฟล์จากอีกเครื่องที่มีบิลเก่า → นับเฉพาะบิลที่ขายหลังกู้ · บิลที่อยู่ในสำเนาไม่ถูกนับแม้เวลาบิลใหม่กว่าสำเนา', async () => {
    const restore = async (s, file) => {
      s.app.cloudPost = async () => ({ status: 'success', details: { backupData: clone(file) } });
      s.app.downloadExportFile = () => true;
      s.app.askTypedConfirm = async () => true;
      s.app._confirmP = null;
      s.app.restoreFromDriveBackup('FILE-X', '8/10/2569'); await s.app._confirmP; await settle(20);
    };
    const a = await shop(), b = await shop(), c = await shop();
    try {
      await sale(a); await sale(a);                     // เครื่อง A มีบิลเก่า 2 ใบ
      const fileA = clone(a.app.buildBackupPayload());
      await restore(b, fileA);                          // เครื่อง B (ว่าง) กู้ไฟล์ของ A
      assert.equal(b.app.state.transactions.length, 2, 'เงื่อนไขเทสต์: กู้มาแล้ว 2 ใบ');
      await sale(b);                                    // ขายหลังกู้ 1 ใบ
      b.app.askTypedConfirm = async () => false;
      await b.app.undoLastRestore(); await b.app._confirmP;
      assert.match(b.app._lastConfirmMsg, /บิลที่ขายหลังกู้ข้อมูล 1 ใบ/, 'บิลเก่าจากไฟล์ (ไม่อยู่ในสำเนา แต่เก่ากว่าสำเนา) ต้องไม่ถูกนับ');
      // เครื่อง C: บิลที่เวลาเดินเร็ว (ใหม่กว่าเวลาสำเนา) แต่มีอยู่แล้วก่อนกู้ → อยู่ในสำเนา ย้อนแล้วไม่หาย = ไม่นับ
      const x = await sale(c);
      x.date = Date.now() + 3600e3; x.syncStatus = 'synced'; await c.app.saveState();
      await restore(c, clone(c.app.buildBackupPayload()));
      c.app.askTypedConfirm = async () => false;
      await c.app.undoLastRestore(); await c.app._confirmP;
      assert.doesNotMatch(c.app._lastConfirmMsg, /ขายหลังกู้/);
    } finally { a.dispose(); b.dispose(); c.dispose(); }
  });

  // ═══════════════════════════ เรื่องเล็ก: ชื่อ "May 5" ═══════════════════════════
  await test('เล็ก-3 ชื่อลูกค้า "May 5" (ทางจริง: ขายแล้วขึ้นชีต) → ช่องลูกค้าบนชีตยังเป็นข้อความ ไม่กลายเป็นวันที่', async () => {
    const gas = createGasEnv({ coerceMonthNames: true });
    const { env, app } = await makeShop({ gas });
    try {
      app.state.customers.push({ id: 'c-may', name: 'May 5', phone: '', note: '' });
      readyCheckout(env);
      env.document.getElementById('cart-customer-select').value = 'c-may';
      assert.equal(await app.processCheckout(), true);
      await settle(60); await app.syncPendingTransactions(true); await settle(40);
      const tx = app.state.transactions.at(-1);
      assert.equal(tx.customerName, 'May 5', 'เงื่อนไขเทสต์: บิลมีชื่อลูกค้านี้');
      assert.equal(tx.syncStatus, 'synced');
      const row = gas.sheet(app.getBusinessMonthKey(Date.now()))._grid.find(r => r[0] === tx.id);
      assert.equal(typeof row[2], 'string', 'ช่องลูกค้าต้องเป็นข้อความ');
      assert.equal(row[2], 'May 5');
    } finally { env.dispose(); }
  });

  await test('เล็ก-3 looksCoercible_: วันที่แบบชื่อเดือนอังกฤษถูกกัน · ข้อความทั่วไปไม่โดน', async () => {
    const gas = createGasEnv();
    const f = gas.ctx.looksCoercible_;
    ['May 5', '5 May', 'Sep-10', 'Jan 5, 2026', 'December 25 2026 10:30 pm'].forEach(x => assert.equal(f(x), true, x));
    ['Mayo 5', 'May', 'May 5 ร้านกาแฟ', 'คุณ May 5', 'สมชาย'].forEach(x => assert.equal(f(x), false, x));
  });

  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); console.log('\n=== ผ่าน 0 · ไม่ผ่าน 1 ==='); process.exit(1); });
