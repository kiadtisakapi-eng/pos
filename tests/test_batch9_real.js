// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 9 (26 ก.ย. 2569) — แก้จากผลตรวจรอบ 3 ตามที่เจ้าของสั่ง
//   [N] กติกาตัวเลข: ราคา/ส่วนลด/เงินรับ/ค่าใช้จ่าย/VAT เป็นจำนวนเต็มเท่านั้น · ค่าคอมปัดเป็นบาทเต็ม · บิล 0 บาทจ่ายเงินสดได้ (ข้อ 2, 12)
//   [S] ตะกร้าไม่ใส่ผู้ให้บริการให้เอง (ข้อ 5)
//   [D] กะที่เปิดหลังร้านปิด (03:00–06:00) = วันทำการใหม่ · ปิดกะแล้วไม่เด้งเปิดกะใหม่ (ข้อ 3)
//   [B] สำรองขึ้น Drive ระหว่างกะทุก 5 บิล (ข้อ 4)
//   [Q] ยกเลิกบิลแล้วคิวงานของบิลนั้นออกจากคิว (ข้อ 11)
//   [P] PIN: บัญชีเจ้าของ/ผู้จัดการ 6 หลัก · ด่านกันเดาเพิ่มเวลา · ถาม PIN ซ้ำก่อนรายการเสี่ยง ·
//       ไฟล์สำรองไม่มี PIN ผู้จัดการ/เจ้าของ · เปลี่ยน PIN เจ้าของต้องใส่ 2 รอบ (ข้อ 7, 8, 9, 10)
//   [R] ล้างข้อมูลทั้งหมดแล้วรหัสเครื่องเดิมยังอยู่ (ข้อ 13)
//   [K] สรุปปิดกะ Telegram: ไม่นับบิลรอตรวจ · แจกแจงค่าใช้จ่าย/คนลง · บิลที่ยกเลิก (ข้อ 14, 15)
//   [J] งานคลาวด์ที่ล้มเกิน 7 วันหยุดยิง · ลองใหม่/ทิ้งได้ (ข้อ 16)
//   [Z] ไฟล์สำรองวัดขนาด · เตือนเมื่อใหญ่เกิน (ข้อ 17)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> node tests/test_batch9_real.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const { createEnv, makeRunner, eq, ok } = require('./harness_db.js');
const { seed, quiet, makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 9: ตัวเลขจำนวนเต็ม · ผู้ให้บริการ · วันของกะ · สำรองระหว่างกะ · PIN · งานคลาวด์ ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const DAY = 86400e3;
const bkk = (s) => new Date(s + '+07:00').getTime();
const checkout = async (env, items, pay, received, discount) => {
  readyCheckout(env, items, pay, received);
  if (discount !== undefined) {
    env.document.getElementById('cart-discount').value = String(discount);
    if (env.app.beginCheckoutAttempt) env.app.beginCheckoutAttempt();
  }
  return env.app.processCheckout();
};

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[N] กติกาตัวเลข: ทุกตัวเลขเงินเป็นจำนวนเต็ม (ข้อ 2 · ข้อ 12)');
await section('[N]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const n0 = app.state.transactions.length;
  await checkout(env, null, 'cash', 1000, '33.333');
  await t('ส่วนลด 33.333 → ไม่ออกบิล (เดิมออกบิลได้แล้วบิลหายจากสรุป/ชีต)', () => eq(app.state.transactions.length, n0));
  await checkout(env, null, 'cash', 1000, '10.5');
  await t('ส่วนลด 10.5 → ไม่ออกบิล', () => eq(app.state.transactions.length, n0));
  await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 99.999 }], 'cash', 1000);
  await t('ราคาในตะกร้ามีทศนิยม (99.999) → ไม่ออกบิล', () => eq(app.state.transactions.length, n0));
  await checkout(env, null, 'cash', '400.5');
  await t('เงินที่รับมา 400.5 → ไม่ออกบิล', () => eq(app.state.transactions.length, n0));
  await checkout(env, null, 'cash', 1000, '30');
  const tx = app.state.transactions[app.state.transactions.length - 1];
  await t('ส่วนลดจำนวนเต็ม 30 → ออกบิลได้ ยอด 270', () => { eq(app.state.transactions.length, n0 + 1); eq(tx.total, 270); });
  await t('ค่าคอม 10% ของ 270 = 27 (บาทเต็ม)', () => eq(tx.details[0].commissionAmount, 27));
  // 15% ของ 270 = 40.50 → ปัดเป็น 41
  await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300, commission: 15 }], 'cash', 1000, '30');
  const tx15 = app.state.transactions[app.state.transactions.length - 1];
  await t('ค่าคอม 15% ของ 270 = 40.50 → ปัดเป็น 41 (ค่าคอมเป็นบาทเต็ม)', () => eq(tx15.details[0].commissionAmount, 41));
  await t('ตัวคิดค่าคอม: ปัดครึ่งขึ้น · แบบคงที่ไม่ปัด', () => {
    eq(app.state.transactions.every(x => (x.details || []).every(d => Number.isInteger(d.commissionAmount))), true);
  });
  // บิล 0 บาท (ลด 100%) จ่ายเงินสด ช่องรับเงินว่าง → ออกบิลได้
  const n1 = app.state.transactions.length;
  await checkout(env, null, 'cash', '', '300');
  const tx0 = app.state.transactions[app.state.transactions.length - 1];
  await t('บิล 0 บาท (ลด 100%) ปิดด้วยเงินสดได้ แม้ช่องรับเงินว่าง (ข้อ 12)', () => { eq(app.state.transactions.length, n1 + 1); eq(tx0.total, 0); eq(tx0.cashReceived, 0); });
  // หน้าจอเงินทอน: บิล 0 บาทต้องเปิดปุ่มยืนยัน
  readyCheckout(env, null, 'cash', '');
  env.document.getElementById('cart-discount').value = '300';
  const btn = env.document.getElementById('btn-complete-checkout'); btn.disabled = true;
  app.recalcCashChange();
  await t('หน้าชำระเงิน: บิล 0 บาท ปุ่มยืนยันเปิด', () => eq(btn.disabled, false));
  env.document.getElementById('cart-discount').value = '0';
  env.document.getElementById('cash-received').value = '300.5';
  app.recalcCashChange();
  await t('หน้าชำระเงิน: เงินรับ 300.5 → ปุ่มปิด + บอกว่าต้องเป็นจำนวนเต็ม', () => {
    eq(btn.disabled, true); ok(/จำนวนเต็ม/.test(env.document.getElementById('cash-change').innerText), env.document.getElementById('cash-change').innerText);
  });
  // แก้บิลย้อนหลัง
  await t('แก้บิล: ส่วนลด 10.5 ถูกปฏิเสธ', () => { const r = app.computeEditTotals(tx, tx.details, '10.5'); eq(r.ok, false); ok(/จำนวนเต็ม/.test(r.error), r.error); });
  await t('แก้บิล: ส่วนลด "1e1" ถูกปฏิเสธ (ต้องเป็นตัวเลขล้วน)', () => eq(app.computeEditTotals(tx, tx.details, '1e1').ok, false));
  // เพิ่มบริการ
  const setSvc = (price, dur, comm) => {
    env.document.getElementById('serv-name').value = 'ทดสอบ';
    env.document.getElementById('serv-price').value = price;
    env.document.getElementById('serv-duration').value = dur;
    env.document.getElementById('serv-category').value = 'barber';
    env.document.getElementById('serv-commission').value = comm;
    env.document.getElementById('serv-commission-type').value = 'percent';
  };
  const s0 = app.state.services.length;
  setSvc('99.5', '30', '10'); await app.addService();
  await t('เพิ่มบริการราคา 99.5 → ไม่บันทึก', () => eq(app.state.services.length, s0));
  setSvc('100', '30', '12.5'); await app.addService();
  await t('เพิ่มบริการค่าคอม 12.5 → ไม่บันทึก', () => eq(app.state.services.length, s0));
  setSvc('100', '30', '10'); await app.addService(); await settle();
  await t('เพิ่มบริการจำนวนเต็ม → บันทึก', () => eq(app.state.services.length, s0 + 1));
  // ค่าใช้จ่าย
  env.document.getElementById('expense-type').value = 'other';
  env.document.getElementById('expense-note').value = 'น้ำแข็ง';
  env.document.getElementById('expense-amount').value = '100.5';
  const e0 = app.state.shift.expenses.length;
  await app.addExpense(); await settle();
  await t('ค่าใช้จ่าย 100.5 → ไม่บันทึก', () => eq(app.state.shift.expenses.length, e0));
  env.document.getElementById('expense-amount').value = '100';
  await app.addExpense(); await settle();
  await t('ค่าใช้จ่าย 100 → บันทึก', () => eq(app.state.shift.expenses.length, e0 + 1));
  // VAT
  env.document.getElementById('vat-enabled').checked = true;
  env.document.getElementById('vat-rate').value = '7.5';
  const rate0 = app.vatRate;
  await app.saveVatSettings(); await settle();
  await t('อัตรา VAT 7.5 → ไม่บันทึก', () => eq(app.vatRate, rate0));
  // เข้าตะกร้าด้วยราคาเก่าที่มีทศนิยม
  app.state.services.push({ id: 'old1', name: 'ราคาเก่า', price: 150.5, duration: 30, category: 'barber', commission: 0, commissionType: 'percent' });
  app.state.cart = [];
  app.addToCart('old1');
  await t('บริการราคาเก่ามีทศนิยม → ไม่เข้าตะกร้า', () => eq(app.state.cart.length, 0));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[S] ตะกร้าไม่ใส่ผู้ให้บริการให้เอง (ข้อ 5)');
await section('[S]', async () => {
  const { env, app } = await makeShop();
  await settle();
  app.state.cart = [];
  app.addToCart('s1');
  await t('กดบริการเข้าตะกร้า → ยังไม่มีผู้ให้บริการ (เดิมใส่คนแรกในรายชื่อให้)', () => eq(app.state.cart[0].staffId, ''));
  const n0 = app.state.transactions.length;
  app.state.selectedPaymentMethod = 'cash';
  env.document.getElementById('cash-received').value = '1000';
  env.document.getElementById('cart-discount').value = '0';
  app.beginCheckoutAttempt();
  await app.processCheckout();
  await t('ยังไม่เลือกผู้ให้บริการ → ชำระเงินไม่ได้', () => eq(app.state.transactions.length, n0));
  app.changeItemStaff(app.state.cart[0].uniqueCartId, 'mg-1');
  app.beginCheckoutAttempt();
  await app.processCheckout();
  await t('เลือกแล้ว → ออกบิลได้ และค่าคอมเป็นของคนที่เลือก', () => {
    eq(app.state.transactions.length, n0 + 1);
    eq(app.state.transactions[app.state.transactions.length - 1].details[0].staffId, 'mg-1');
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[D] วันของกะ: ร้านเปิด 10:00 ปิด 03:00 — กะที่เปิด 03:00–06:00 เป็นของวันใหม่ (ข้อ 3)');
await section('[D]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const early = { startTime: bkk('2026-09-21T03:05:00'), endTime: bkk('2026-09-22T02:40:00'), startCash: 1000, countedCash: 800, expectedCash: 1000, difference: -200, cashSales: 0, expenses: [] };
  const night = { startTime: bkk('2026-09-20T11:00:00'), endTime: bkk('2026-09-21T02:50:00'), startCash: 1000, countedCash: 1000, expectedCash: 1000, difference: 0, cashSales: 0, expenses: [] };
  const reopen = { startTime: bkk('2026-09-22T01:00:00'), endTime: bkk('2026-09-22T02:55:00'), startCash: 500, countedCash: 500, expectedCash: 500, difference: 0, cashSales: 0, expenses: [] };
  app.state.shift.history = [night, early, reopen];
  const day = (k) => app.getClosedShiftsForPeriod('day', k).map(s => s.startTime);
  await t('กะเปิด 21 ก.ย. 03:05 → วันที่ 21 (เดิมไปลงวันที่ 20)', () => { ok(day('2026-09-21').includes(early.startTime)); ok(!day('2026-09-20').includes(early.startTime)); });
  await t('กะปกติ 20 ก.ย. 11:00 → วันที่ 20', () => ok(day('2026-09-20').includes(night.startTime)));
  await t('กะเปิดตี 1 (ยังอยู่ในเวลาขายของคืนนั้น) → วันก่อนหน้า (21)', () => ok(day('2026-09-21').includes(reopen.startTime)));
  await t('สรุปนับเงินวันที่ 20 มีเฉพาะกะของวันที่ 20 (เงินขาด 200 ไม่ไปปนวันที่ 20)', () => {
    const rows = app.buildShiftCashSummary('day', '2026-09-20').rows || app.buildShiftCashSummary('day', '2026-09-20');
    const list = Array.isArray(rows) ? rows : (rows.rows || []);
    ok(list.every(r => r.startTime !== early.startTime), JSON.stringify(list.map(r => r.startTime)));
  });
  // เดือน: กะเปิด 1 ต.ค. 03:30 → เดือน 10
  const monthEdge = { startTime: bkk('2026-10-01T03:30:00'), endTime: bkk('2026-10-02T02:30:00'), startCash: 0, expenses: [] };
  app.state.shift.history.push(monthEdge);
  await t('กะเปิด 1 ต.ค. 03:30 → อยู่เดือน 10 (เดิมไปเดือน 09)', () => {
    ok(app.getClosedShiftsForPeriod('month', '10-2026').includes(monthEdge));
    ok(!app.getClosedShiftsForPeriod('month', '09-2026').includes(monthEdge));
  });
  // ค่าใช้จ่ายไม่มีเวลา → ยึดวันของกะ
  const noTime = { startTime: bkk('2026-09-23T03:10:00'), endTime: bkk('2026-09-23T05:00:00'), startCash: 0, expenses: [{ id: 'x1', amount: 50, note: 'ไม่มีเวลา' }] };
  app.state.shift.history.push(noTime);
  await t('ค่าใช้จ่ายที่ไม่มีเวลา ในกะที่เปิด 03:10 → นับเป็นวันที่ 23', () => ok(app.getExpensesForDate('2026-09-23').some(e => e.id === 'x1')));
  // คิวสรุปตอนปิดกะต้องมีวันของกะ
  app.state.cloudOutbox = [];
  app.enqueueShiftCloseCloudOps({ startTime: bkk('2026-09-24T03:05:00'), endTime: bkk('2026-09-24T05:30:00'), expenses: [], countedCash: 0, expectedCash: 0, difference: 0 });
  await t('ปิดกะที่เปิด 03:05 ปิด 05:30 → คิวสรุปวันที่ 24 ด้วย', () => ok((app.state.cloudOutbox[0] || {}).dateKeys.includes('2026-09-24'), JSON.stringify(app.state.cloudOutbox[0])));
  // ปิดกะจริง → ไม่เด้งหน้าต่างเปิดกะ
  const opened = [];
  const orig = app.openCashCounter.bind(app);
  app.openCashCounter = (mode) => { opened.push(mode); return orig(mode); };
  app.cashCounterMode = 'close';
  await app.confirmCashCount(); await settle(900);
  await t('ปิดกะสำเร็จ', () => eq(app.state.shift.active, false));
  await t('ปิดกะแล้วไม่เด้งหน้าต่างเปิดกะใหม่ทันที (เดิมเด้ง → คนนับเงินเปิดกะตอนตี 3)', () => ok(!opened.includes('open'), JSON.stringify(opened)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[B] สำรองขึ้น Drive ระหว่างกะ ทุก 5 บิล (ข้อ 4)');
await section('[B]', async () => {
  const { env, app, gas, toasts } = await makeShop();
  await settle();
  const backups = () => gas.requests.filter(r => r && r.action === 'backup').length;
  for (let i = 0; i < 4; i++) { await checkout(env, null, 'cash', 1000); await settle(60); }
  await t('ขาย 4 บิล → ยังไม่สำรอง', () => eq(backups(), 0));
  await checkout(env, null, 'cash', 1000); await settle(400);
  await t('บิลที่ 5 → สำรองขึ้น Drive 1 ครั้ง (เดิมสำรองเฉพาะตอนปิดกะ)', () => eq(backups(), 1));
  await t('สำรองสำเร็จ บันทึกสถานะ + ขนาดไฟล์ (ข้อ 17)', () => { ok(app.backupStatus && app.backupStatus.lastOk); ok(app.backupStatus.lastSizeBytes > 0); });
  await t('สำรองเบื้องหลังไม่ขึ้นข้อความรบกวน', () => ok(!toasts.some(x => /สำรองข้อมูลขึ้น Google Drive สำเร็จ|ส่งสรุป\/แจ้งเตือนที่ค้างไว้สำเร็จ/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));
  for (let i = 0; i < 4; i++) { await checkout(env, null, 'cash', 1000); await settle(60); }
  await settle(200);
  await t('ขายต่ออีก 4 บิล → ยังไม่สำรองซ้ำ', () => eq(backups(), 1));
  await t('งานสำรองไม่ค้างในคิว', () => eq((app.state.cloudOutbox || []).filter(x => x.needBackup).length, 0));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Q] ยกเลิกบิลแล้ว คิวงานของบิลนั้นต้องออกจากคิว (ข้อ 11)');
await section('[Q]', async () => {
  const { env, app } = await makeShop();
  await settle();
  app.state.queue = [];
  await checkout(env, null, 'cash', 1000);
  await checkout(env, null, 'cash', 1000);
  const [a, b] = app.state.transactions.slice(-2);
  await t('ขาย 2 บิล → คิว 2 งาน ผูกเลขบิล', () => { eq(app.state.queue.length, 2); eq(app.state.queue.map(q => q.txId), [a.id, b.id]); });
  env.document.getElementById('edit-tx-id').value = a.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(60);
  await t('ยกเลิกบิลแรก → คิวของบิลนั้นหาย เหลือคิวบิลที่สอง', () => eq(app.state.queue.map(q => q.txId), [b.id]));
  await t('คิวในเครื่อง (IndexedDB) ตรงกัน', async () => eq((await env.raw('queue')).map(q => q.txId), [b.id]));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P] PIN ผู้จัดการ/เจ้าของ (ข้อ 7 · 8 · 9 · 10)');
await section('[P7]', async () => {
  const { env, app } = await makeShop();
  const env2 = env; // alias
  const h = async (p) => app.hashPin(p);
  app.state.staff.push({ id: 'mg-2', name: 'ซี', role: 'ผู้จัดการ', accessLevel: 'manager', pin: await h('2222') });
  await app.saveStateOrThrow('เตรียมเทสต์');
  // เพิ่มผู้จัดการด้วย PIN 4 หลัก → ไม่ได้
  const setStaff = (name, level, pin) => {
    env2.document.getElementById('staff-name').value = name;
    env2.document.getElementById('staff-role').value = 'ผู้จัดการ';
    env2.document.getElementById('staff-access-level').value = level;
    env2.document.getElementById('staff-pin').value = pin;
  };
  const c0 = app.state.staff.length;
  app.state.editingStaffId = null;
  setStaff('ดี', 'manager', '1234'); await app.addStaff(); await settle();
  await t('เพิ่มผู้จัดการ PIN 4 หลัก → ไม่บันทึก (เดิมบันทึกได้)', () => eq(app.state.staff.length, c0));
  setStaff('ดี', 'owner', '12345'); await app.addStaff(); await settle();
  await t('เพิ่มบัญชีเจ้าของสำรอง PIN 5 หลัก → ไม่บันทึก', () => eq(app.state.staff.length, c0));
  setStaff('ดี', 'staff', '1234'); await app.addStaff(); await settle();
  await t('พนักงานทั่วไป PIN 4 หลัก → ได้ตามเดิม', () => eq(app.state.staff.length, c0 + 1));
  const newbie = app.state.staff[app.state.staff.length - 1];
  app.state.editingStaffId = newbie.id;
  setStaff('ดี', 'manager', ''); await app.addStaff(); await settle();
  await t('เลื่อนพนักงาน (PIN 4 หลัก) เป็นผู้จัดการโดยไม่ตั้ง PIN ใหม่ → ไม่ได้', () => eq(app.state.staff.find(s => s.id === newbie.id).accessLevel, 'staff'));
  app.state.editingStaffId = null;

  // ล็อกอินผู้จัดการที่ PIN เดิม 4 หลัก → ต้องตั้ง 6 หลักใหม่ก่อนเข้า
  app.currentUser = null; app.currentRole = null;
  const answers = ['654321', '654321'];
  app.askSecret = async () => answers.shift();
  app.loginSelectedId = 'mg-2';
  env.document.getElementById('login-pin-input').value = '2222';
  await app.doLogin(); await settle(60);
  await t('ผู้จัดการ PIN 4 หลักล็อกอิน → ถูกให้ตั้ง PIN 6 หลักใหม่ แล้วเข้าได้', () => { eq(app.currentRole, 'manager'); eq(answers.length, 0); });
  await t('PIN ใหม่ถูกบันทึกลงเครื่อง', async () => eq((await env.raw('staff')).find(s => s.id === 'mg-2').pin, await h('654321')));

  // ด่านกันเดา: ผิดต่อเนื่อง → รอเพิ่มเป็นเท่าตัว
  app.currentUser = null; app.currentRole = null;
  try { env.ctx.localStorage.removeItem('epos_login_guard'); } catch (e) {}
  app._loginGuardLoaded = false;
  const tryWrong = async () => { app.loginSelectedId = 'st-1'; env.document.getElementById('login-pin-input').value = '999999'; await app.doLogin(); };
  for (let i = 0; i < 5; i++) await tryWrong();
  const g = () => app._loginGuard['st-1'];                         // ตัวนับรายบัญชี (รอบตรวจ 4 ข้อ A2)
  const lock1 = g().lockUntil - Date.now();
  g().lockUntil = Date.now() - 1; await tryWrong();                 // พ้นช่วงรอแล้วผิดอีก
  const lock2 = g().lockUntil - Date.now();
  g().lockUntil = Date.now() - 1; await tryWrong();
  const lock3 = g().lockUntil - Date.now();
  await t('ผิดครบ 5 → รอ 30 วิ · ผิดต่อ → 60 วิ → 120 วิ (เดิมรอ 30 วิแล้วนับใหม่ทุกรอบ)', () => {
    ok(Math.abs(lock1 - 30e3) < 1500, 'lock1 ' + lock1); ok(Math.abs(lock2 - 60e3) < 1500, 'lock2 ' + lock2); ok(Math.abs(lock3 - 120e3) < 1500, 'lock3 ' + lock3);
  });
  env.dispose();
});

await section('[P8]', async () => {
  const { env, app } = await makeShop({ role: 'manager' });
  await settle();
  app.confirmPinStepUp = app._realConfirmPinStepUp;   // ใช้ด่านจริง
  await checkout(env, null, 'cash', 1000);
  const tx = app.state.transactions[app.state.transactions.length - 1];
  let asked = 0;
  app.askSecret = async () => { asked++; return '000000'; };
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(60);
  await t('ผู้จัดการยกเลิกบิลโดยใส่ PIN ผิด → บิลยังอยู่ (เดิมไม่ถาม PIN ยกเลิกได้เลย)', () => { eq(asked, 1); ok(app.state.transactions.some(x => x.id === tx.id)); });
  app.askSecret = async () => { asked++; return '222222'; };
  app._confirmP = null;
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(60);
  await t('ใส่ PIN ถูก → ยกเลิกได้', () => ok(!app.state.transactions.some(x => x.id === tx.id)));
  // ปิดกะ
  app.askSecret = async () => '111111';
  app.cashCounterMode = 'close';
  await app.confirmCashCount(); await settle(100);
  await t('ผู้จัดการปิดกะโดยใส่ PIN ผิด → กะยังเปิด', () => eq(app.state.shift.active, true));
  app.askSecret = async () => '222222';
  await app.confirmCashCount(); await settle(100);
  await t('ใส่ PIN ถูก → ปิดกะได้', () => eq(app.state.shift.active, false));
  // เจ้าของไม่ถูกถามซ้ำ (มีตัดเมื่อไม่แตะจอ 5 นาทีอยู่แล้ว)
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  let askedOwner = 0; app.askSecret = async () => { askedOwner++; return ''; };
  await t('เจ้าของ: ไม่ถาม PIN ซ้ำ', async () => { eq(await app.confirmPinStepUp('ทดสอบ'), true); eq(askedOwner, 0); });
  env.dispose();
});

await section('[P9]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const payload = app.buildBackupPayload();
  await t('ไฟล์สำรอง: PIN ผู้จัดการไม่ติดไป (เดิมติดไป ถอดกลับได้ในไม่ถึงวินาที)', () => eq(payload.staff.find(s => s.id === 'mg-1').pin, null));
  await t('ไฟล์สำรอง: PIN พนักงานทั่วไปยังอยู่ (กู้แล้วขายต่อได้ทันที)', () => ok(payload.staff.find(s => s.id === 'st-1').pin));
  await t('ในเครื่องไม่ถูกแตะ', () => ok(app.state.staff.find(s => s.id === 'mg-1').pin));
  await t('ไฟล์สำรองยังผ่านด่านตรวจของตัวกู้', () => eq(app.isValidBackupObject(payload), true));
  env.dispose();
});

await section('[P10]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const before = app.ownerPin;
  // ช่องเดิมในหน้าตั้งค่าไม่เปลี่ยน PIN แล้ว
  env.document.getElementById('shop-owner-pin').value = '999999';
  await app.saveShopSettings(); await settle(60);
  await t('พิมพ์ในช่อง PIN แล้วออกจากช่อง → ไม่เปลี่ยน PIN (เดิมบันทึกทันทีไม่ถามซ้ำ)', () => eq(app.ownerPin, before));
  let ans = ['246810', '135790', '135791'];
  app.askSecret = async () => ans.shift();
  await app.changeOwnerPin();
  await t('ใส่ PIN ใหม่สองครั้งไม่ตรงกัน → ไม่เปลี่ยน', () => eq(app.ownerPin, before));
  ans = ['000000'];
  app.askSecret = async () => ans.shift();
  await app.changeOwnerPin();
  await t('PIN ปัจจุบันผิด → ไม่เปลี่ยน', () => eq(app.ownerPin, before));
  app.loginGuardReset('__owner__');
  ans = ['246810', '135790', '135790'];
  app.askSecret = async () => ans.shift();
  await app.changeOwnerPin(); await settle();
  await t('PIN เดิมถูก + ใหม่ตรงกันสองครั้ง → เปลี่ยน และลงเครื่อง', async () => {
    eq(app.ownerPin, await app.hashPin('135790')); eq(await env.raw('ownerPin'), await app.hashPin('135790'));
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[R] ล้างข้อมูลทั้งหมด → รหัสเครื่องเดิมยังอยู่ (ข้อ 13)');
await section('[R]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const dev = app.deviceId;
  await app.saveKeys([{ key: 'primaryStatus', value: { isPrimary: true, checkedAt: Date.now() } }]);
  env.ctx.prompt = () => 'ลบทั้งหมด';
  await app.resetData(); await settle(200);
  await t('ข้อมูลร้านถูกล้างแล้ว', () => eq(app.state.transactions.length, 0));
  await t('รหัสเครื่องเดิม (เดิมได้รหัสใหม่ → ชีตปฏิเสธ NOT_PRIMARY)', async () => { eq(app.deviceId, dev); eq(await env.raw('deviceId'), dev); });
  await t('สถานะเครื่องหลักยังอยู่', async () => ok((await env.raw('primaryStatus') || {}).isPrimary === true));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[K] ข้อความปิดกะ Telegram (ข้อ 14 · 15)');
await section('[K]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const start = app.state.shift.startTime;
  await checkout(env, null, 'cash', 1000);
  // บิลรอตรวจ (ตัวเลขเงินเชื่อไม่ได้) ในกะ
  app.state.transactions.push(Object.assign({}, app.state.transactions[0], { id: 'TX-BAD-1', discount: 33.333, total: 266.667, date: new Date().toISOString() }));
  app.state.shift.expenses.push({ id: 'e1', type: 'other', amount: 120, note: 'ซื้อของอื่นๆ: น้ำแข็ง', time: Date.now(), by: 'เอ', paidFrom: 'drawer' });
  app.state.voidLog = [{ billId: 'TX-V', date: Date.now(), by: 'บี', amount: 150 }];
  app.state.expenseLog = [{ expenseId: 'e0', amount: 80, note: 'x', date: Date.now(), by: 'เอ' }];
  const msg = app.buildShiftReportMessage({ startTime: start, endTime: Date.now() + 1000, expenses: app.state.shift.expenses, expensesTotal: 120, startCash: 1000, cashSales: 300, expectedCash: 1180, countedCash: 1180, difference: 0 });
  await t('ยอดขายไม่นับบิลรอตรวจ (300 ไม่ใช่ 566.67)', () => ok(/ยอดขายรวม \(สุทธิ\): ฿300\b/.test(msg), msg));
  await t('บอกจำนวนบิลรอตรวจแยก', () => ok(/บิลรอตรวจ.*1 ใบ/.test(msg)));
  await t('แจกแจงค่าใช้จ่าย: ยอด · รายการ · คนลง', () => ok(/฿120 · ซื้อของอื่นๆ: น้ำแข็ง · ลงโดย เอ/.test(msg), msg));
  await t('บอกบิลที่ถูกยกเลิกในกะ + คนยกเลิก', () => ok(/บิลที่ถูกยกเลิกในกะ: 1 ใบ \(฿150\) — โดย บี/.test(msg)));
  await t('บอกค่าใช้จ่ายที่ถูกลบในกะ', () => ok(/ค่าใช้จ่ายที่ถูกลบในกะ: 1 รายการ \(฿80\)/.test(msg)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[J] งานคลาวด์ที่ล้มเหลวเกิน 7 วัน (ข้อ 16)');
await section('[J]', async () => {
  const calls = [];
  const fetch = async (url, opts) => { calls.push(String(opts && opts.body || '')); return { ok: true, status: 200, json: async () => ({ ok: false, description: 'chat not found' }) }; };
  const env = createEnv({ fetch });
  const toasts = quiet(env.app);
  await seed(env, { googleSheetsUrl: '', googleSheetsApiToken: '', telegramToken: '1:x', telegramChatId: '-1',
    cloudOutbox: [
      { id: 'cob-old', createdAt: Date.now() - 20 * DAY, dateKeys: [], monthKeys: [], needTelegram: true, telegramMessage: 'เก่า', tries: 40,
        retry: { telegram: { tries: 40, lastTry: Date.now() - 3600e3, nextAt: Date.now() - 1, firstFailAt: Date.now() - 8 * DAY } } },
      { id: 'cob-new', createdAt: Date.now() - 2 * DAY, dateKeys: [], monthKeys: [], needTelegram: true, telegramMessage: 'ใหม่', tries: 3,
        retry: { telegram: { tries: 3, lastTry: Date.now() - 3600e3, nextAt: Date.now() - 1, firstFailAt: Date.now() - 2 * DAY } } }
    ] });
  const app = env.app;
  await app.init(); await settle(50);
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  await app.flushCloudOutbox(); await settle(50);
  const sentOld = () => calls.filter(b => b.includes('เก่า')).length;
  await t('งานที่ล้มเกิน 7 วัน ไม่ถูกยิงซ้ำ (เดิมยิงทุก 30 นาทีตลอดไป) · งานที่ยังไม่ครบ 7 วันยังยิง', () => { eq(sentOld(), 0); ok(calls.some(b => b.includes('ใหม่'))); });
  await t('หน้าตั้งค่าเห็นงานที่หยุดแล้ว 1 งาน', () => { eq(app.expiredCloudJobs().map(x => x.item.id), ['cob-old']); ok(/หยุดส่งแล้ว 1 งาน/.test(env.document.getElementById('cloud-expired-jobs-box').innerHTML)); });
  await app.retryExpiredCloudJob('cob-old'); await settle(80);
  await t('กด "ลองใหม่" → ยิงงานนั้นอีกครั้ง', () => eq(sentOld(), 1));
  // ทำให้หมดอายุอีกครั้งแล้วทิ้ง
  const old = app.state.cloudOutbox.find(x => x.id === 'cob-old');
  old.retry.telegram.firstFailAt = Date.now() - 9 * DAY;
  await app.discardExpiredCloudJob('cob-old'); await settle(50);
  await t('กด "ทิ้งงานนี้" (ยืนยันแล้ว) → งานหายจากคิวและจากเครื่อง · งานอื่นยังอยู่', async () => {
    eq(app.state.cloudOutbox.map(x => x.id), ['cob-new']);
    eq((await env.raw('cloudOutbox')).map(x => x.id), ['cob-new']);
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Z] ไฟล์สำรองใหญ่เกินเกณฑ์ต้องเตือน (ข้อ 17)');
await section('[Z]', async () => {
  const { env, app } = await makeShop();
  await settle();
  app.backupStatus = { lastAttemptAt: Date.now(), lastOk: true, lastSuccessAt: Date.now(), lastVerified: true, lastSizeBytes: 6 * 1024 * 1024 };
  await t('เกิน 5 MB → ข้อความปิดกะเตือน', () => ok(/ไฟล์สำรองใหญ่ 6\.0 MB/.test(app.backupHealthWarning(Date.now())), app.backupHealthWarning(Date.now())));
  app.renderBackupStatus();
  await t('หน้าตั้งค่าบอกขนาดไฟล์และเตือน', () => ok(/ขนาดไฟล์ 6\.0 MB ⚠️/.test(env.document.getElementById('backup-status-label').innerText)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[V] ผู้จัดการดูได้เฉพาะยอดของวันทำการนี้ — ดูย้อนหลังได้เฉพาะเจ้าของ (เจ้าของสั่ง 26 ก.ย. 2569)');
await section('[V]', async () => {
  const { env, app, toasts } = await makeShop({ role: 'manager' });
  await settle();
  const real = (name) => app.constructor.prototype[name].bind(app);
  const E = (id) => env.document.getElementById(id);
  app.confirmPinStepUp = async () => true;
  await checkout(env, null, 'cash', 1000);
  const today = app.state.transactions[app.state.transactions.length - 1];
  const oldDate = new Date(Date.now() - 3 * DAY).toISOString();
  // บิลเก่าธรรมดา + บิลเก่าที่เจ้าของแก้ยอดแล้ว (รับเงินสด 300 แต่ยอดใหม่ 200) ยังค้างบันทึกคืนเงิน
  const oldPlain = Object.assign(JSON.parse(JSON.stringify(today)), { id: 'TX-1790000000000-OLDPLAIN', date: oldDate });
  const oldPending = Object.assign(JSON.parse(JSON.stringify(today)), { id: 'TX-1790000000000-OLDPENDG', date: oldDate, total: 200, discount: 100 });
  app.state.transactions.push(oldPlain, oldPending);
  await app.saveStateOrThrow('เตรียมเทสต์');
  const oldKey = app.getBusinessISODate(oldDate);

  // หน้ารายงาน: ตั้งช่องวันเป็นวันเก่า แล้ววาดใหม่ในฐานะผู้จัดการ
  app.state.selectedReportType = 'daily';
  E('report-date-input').value = oldKey;
  E('report-staff-filter').value = 'all';
  real('filterReports')();
  const body = E('report-transactions-body').innerHTML;
  await t('ผู้จัดการ: ช่องวันถูกบังคับเป็นวันนี้และล็อกไว้', () => { eq(E('report-date-input').value, app.getBusinessISODate(Date.now())); eq(E('report-date-input').disabled, true); });
  await t('ผู้จัดการ: ตารางรายงานมีเฉพาะบิลของวันนี้ (ไม่เห็นบิลเก่า)', () => { ok(body.includes(today.id), 'ต้องเห็นบิลวันนี้'); ok(!body.includes(oldPlain.id) && !body.includes(oldPending.id), 'ต้องไม่เห็นบิลเก่า'); });
  const box = E('report-pending-settle-box').innerHTML;
  await t('ผู้จัดการ: กล่องบิลวันก่อนที่ค้างคืนเงินโชว์เฉพาะใบที่ค้าง', () => { ok(box.includes(oldPending.id)); ok(!box.includes(oldPlain.id)); ok(!box.includes(today.id)); });

  // ใบเสร็จ / เปิดบิลเก่า / ยกเลิกบิลเก่า
  let receipts = 0; app.showThermalReceipt = () => { receipts++; };
  app.viewHistoricalReceipt(oldPlain.id);
  await t('ผู้จัดการ: เปิดใบเสร็จบิลเก่าไม่ได้', () => eq(receipts, 0));
  app.viewHistoricalReceipt(today.id);
  await t('ผู้จัดการ: เปิดใบเสร็จบิลวันนี้ได้', () => eq(receipts, 1));
  E('edit-tx-id').value = '';
  app.openTransactionEdit(oldPlain.id);
  await t('ผู้จัดการ: เปิดบิลเก่าธรรมดาไม่ได้', () => eq(E('edit-tx-id').value, ''));
  E('edit-tx-id').value = oldPlain.id;
  E('void-money-outcome').value = 'none';
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(40);
  await t('ผู้จัดการ: ยกเลิกบิลเก่าไม่ได้ (แม้เรียกตรง ๆ)', () => ok(app.state.transactions.some(x => x.id === oldPlain.id)));

  // ข้อยกเว้น: บิลเก่าที่ค้างคืนเงิน → เปิดได้แบบบันทึกเงินอย่างเดียว
  app.openTransactionEdit(oldPending.id);
  await t('ผู้จัดการ: เปิดบิลเก่าที่ค้างคืนเงินได้ แบบ "บันทึกเงินอย่างเดียว"', () => {
    eq(E('edit-tx-id').value, oldPending.id);
    eq(E('edit-tx-void-section').style.display, 'none'); eq(E('btn-save-tx-edit').style.display, 'none');
    eq(E('edit-tx-customer').disabled, true); eq(E('edit-tx-discount').disabled, true);
    eq(E('edit-tx-modal-title').innerText, 'บันทึกเงินส่วนต่างของบิล');
    ok(/recordBillSettlement/.test(E('edit-tx-money-box').innerHTML), 'ต้องมีปุ่มบันทึกเงินส่วนต่าง');
    eq(E('edit-tx-access-note').style.display, 'block');
  });
  E('void-money-outcome').value = 'none';
  app._confirmP = null;
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(40);
  await t('ผู้จัดการ: บิลเก่าที่ค้างคืนเงิน ก็ยกเลิกไม่ได้', () => ok(app.state.transactions.some(x => x.id === oldPending.id)));
  await app.recordBillSettlement(oldPending.id, 'waive'); await settle(40);
  await t('ผู้จัดการ: บันทึกเงินส่วนต่างของบิลเก่าได้ (ข้อยกเว้นที่เจ้าของเลือก)', () => ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === oldPending.id)).settled));
  E('edit-tx-id').value = '';
  app.openTransactionEdit(oldPending.id);
  await t('บันทึกครบแล้ว → บิลเก่าใบนั้นกลับเป็นเปิดไม่ได้', () => eq(E('edit-tx-id').value, ''));

  // ส่งสรุปด้วยมือ: ผู้จัดการได้เฉพาะวันนี้
  const sent = [];
  app.syncDailySummary = async (d) => { sent.push(d); return true; };
  app.googleSheetsUrl = app.googleSheetsUrl || 'https://x/exec';
  E('report-date-input').value = oldKey;
  await app.syncSummaryNow(); await settle(40);
  await t('ผู้จัดการ: ส่งสรุปด้วยมือได้เฉพาะวันนี้', () => eq(sent, [app.getBusinessISODate(Date.now())]));

  // แดชบอร์ด: ไม่โชว์ "เทียบเมื่อวาน"
  E('kpi-revenue-trend').innerHTML = 'x';
  real('renderDashboard')();
  await t('ผู้จัดการ: แดชบอร์ดไม่โชว์ % เทียบเมื่อวาน', () => eq(E('kpi-revenue-trend').innerHTML, ''));

  // เจ้าของ: ดูย้อนหลังได้ตามเดิม
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  app.applyReportDateLock();
  E('report-date-input').value = oldKey;
  real('filterReports')();
  await t('เจ้าของ: ช่องวันเลือกได้ และเห็นบิลเก่า', () => { eq(E('report-date-input').disabled, false); ok(E('report-transactions-body').innerHTML.includes(oldPlain.id)); });
  app.openTransactionEdit(oldPlain.id);
  await t('เจ้าของ: เปิดบิลเก่าได้เต็มรูปแบบ (ปุ่มยกเลิก/บันทึกกลับมา)', () => {
    eq(E('edit-tx-id').value, oldPlain.id); eq(E('edit-tx-void-section').style.display, ''); eq(E('btn-save-tx-edit').style.display, ''); eq(E('edit-tx-customer').disabled, false);
  });
  env.dispose();
});

R.done();
})();
