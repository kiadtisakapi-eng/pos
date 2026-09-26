// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 7 (24 ก.ย. 2569) — แก้จากผลตรวจทั้งระบบรอบ 24 ก.ย. + สิ่งที่เจ้าของเลือก
//   [V] ยกเลิกบิล "ของกะก่อน" ที่เคยบันทึกคืน/เก็บส่วนต่างไว้ในกะนี้ — ลิ้นชักต้องคิดถูก (เดิมขาด/เกินผิด ๆ)
//   [M] ผู้จัดการบันทึกเงินส่วนต่างได้จากหน้าจอ (สิทธิ์เปิดไว้แล้วแต่ปุ่มโชว์เฉพาะเจ้าของ)
//   [E] ค่าใช้จ่าย "จ่ายจาก" ลิ้นชัก/ทางอื่น · ค่าใช้จ่ายจากลิ้นชักเกินเงินในลิ้นชัก = เงินขาด
//   [P] PIN เจ้าของค่าเริ่มต้น 123456 ต้องถูกบังคับเปลี่ยนก่อนได้สิทธิ์เจ้าของ
//   [S] ส่งบิลค้างจำนวนมาก: บันทึกความคืบหน้าระหว่างทาง · เน็ตล้มติดกันต้องหยุดรอบ
//   [R] หน้าตรวจความตรงกัน: บิลที่แยกไว้ตรวจสอบห้ามมีปุ่มลบแถวบนชีต
//   [C] ค่าคอมแบบ % ห้ามเกิน 100
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ใน vm)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> POS_GAS_SRC=<GAS ก่อนแก้> แล้วรันไฟล์นี้ → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const nodeCrypto = require('crypto');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 7: ลิ้นชักตอนยกเลิกบิลข้ามกะ · สิทธิ์ผู้จัดการ · ค่าใช้จ่ายจ่ายจากไหน · PIN เริ่มต้น · ส่งบิลค้าง · ตรวจกับชีต ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const pinHash = (pin) => nodeCrypto.createHash('sha256').update('jahn_pos_v2_' + pin).digest('hex');
const HOUR = 3600e3;

async function checkout(env, items, pay, received) {
  readyCheckout(env, items, pay, received);
  await env.app.processCheckout();
  await settle(30);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}
async function editDiscount(env, txId, discount) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-discount').value = String(discount);
  await env.app.saveTransactionEdit();
  await settle(20);
}
// ย้ายไปกะใหม่ (บิลที่ขายไปแล้วกลายเป็น "บิลของกะก่อน")
function newShift(app, startCash) {
  app.state.shift.history.push({ startTime: app.state.shift.startTime, endTime: Date.now(), startCash: 0, countedCash: 0, expectedCash: 0, difference: 0, expenses: [] });
  app.state.shift = Object.assign({}, app.state.shift, { active: true, startTime: Date.now() + 5, startCash, expenses: [] });
  delete app.state.shift.cashAdjustments;
}
async function voidBill(env, txId, outcome) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('void-money-outcome').value = outcome;
  await env.app.voidTransaction();
  await env.app._confirmP; await settle(30);
}
const expected = (app) => app.computeShiftDrawer(app.state.shift).expected;

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[V1] บิลของกะก่อน · แก้ส่วนลด 300→200 · คืน 100 ในกะนี้ · แล้วยกเลิกบิลทั้งใบ');
// ═══════════════════════════════════════════════════════════════════════════
await section('[V1]', async () => {
  for (const outcome of ['refunded', 'none']) {
    const { env, app } = await makeShop({ role: 'owner', rows: { vatEnabled: false } });
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await new Promise(r => setTimeout(r, 10));
    newShift(app, 1000);
    await settle(10);
    await editDiscount(env, tx.id, 100);
    await app.recordBillSettlement(tx.id, 'moved');
    await t(`(เงื่อนไข ${outcome}) คืน 100 ลงลิ้นชักกะนี้แล้ว → ควรมี 900`, () => eq(expected(app), 900));
    app.openTransactionEdit(tx.id);
    const hint = env.document.getElementById('void-money-hint').innerText;
    await t(`(${outcome}) ข้อความใต้ช่องเลือกบอกว่าเป็นบิลของกะก่อน (เดิมบอกว่า "มีเงินสด ฿100 นับอยู่ในลิ้นชักกะนี้")`, () => ok(/กะก่อน/.test(hint), hint));
    await voidBill(env, tx.id, outcome);
    const vl = app.state.voidLog[app.state.voidLog.length - 1];
    if (outcome === 'refunded') {
      await t('คืนเงินแล้ว: หักเงินที่คืนจริงอีก 200 → ควรมี 700 (เดิมค้าง 900 = ปิดกะขาด 200 ทั้งที่ไม่มีใครทำเงินหาย)', () => eq(expected(app), 700));
      await t('กล่องยืนยันบอกยอดที่จะหักจริง ฿200 (เดิมบอก "เงินสด ฿100 ออกจากลิ้นชัก")', () => ok(/฿200\.00/.test(app._lastConfirmMsg) && /กะก่อน/.test(app._lastConfirmMsg), app._lastConfirmMsg));
      await t('ประวัติการยกเลิกบันทึกผลต่อลิ้นชัก −200 (เดิม +100)', () => eq(vl.cashEffect, -200));
    } else {
      await t('ไม่มีเงินเคลื่อนไหว: ลิ้นชักไม่เปลี่ยน ควรมียังเป็น 900 (เดิมหักรายการคืนซ้ำเป็น 800)', () => eq(expected(app), 900));
      await t('ไม่มีรายการเงินออก/เข้าใหม่ในกะนี้ และรายการคืนเดิมไม่ถูกกลับรายการ', () => {
        const adj = app.state.shift.cashAdjustments || [];
        eq(adj.length, 1); ok(!adj[0].reversedByVoid);
      });
      await t('ประวัติการยกเลิก: ผลต่อลิ้นชัก 0', () => eq(vl.cashEffect, 0));
    }
    env.dispose();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[V2] กันถอยหลัง: บิลของกะนี้ (คืนบางส่วนแล้วยกเลิก) ยังคิดถูกเหมือนเดิม');
// ═══════════════════════════════════════════════════════════════════════════
await section('[V2]', async () => {
  for (const [outcome, want] of [['refunded', 1000], ['none', 1200]]) {
    const { env, app } = await makeShop({ role: 'owner', rows: { vatEnabled: false } });
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await editDiscount(env, tx.id, 100);
    await app.recordBillSettlement(tx.id, 'moved');
    await t(`(เงื่อนไข ${outcome}) 1000 + 300 − คืน 100 = 1200`, () => eq(expected(app), 1200));
    await voidBill(env, tx.id, outcome);
    await t(`${outcome}: ควรมี ${want}`, () => eq(expected(app), want));
    env.dispose();
  }
  // บิลของกะก่อน รับเงินสด ไม่มีส่วนต่าง → ยกเลิกแบบคืนเงิน = เงินออกจากกะนี้เต็มจำนวน (พฤติกรรมเดิม)
  const { env, app } = await makeShop({ role: 'owner', rows: { vatEnabled: false } });
  const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
  await new Promise(r => setTimeout(r, 10));
  newShift(app, 1000);
  await voidBill(env, tx.id, 'refunded');
  await t('บิลกะก่อน ไม่มีส่วนต่าง · คืนเงินแล้ว → ควรมี 700', () => eq(expected(app), 700));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[M] ผู้จัดการ (ตารางสิทธิ์ bill.settle) ต้องบันทึกเงินส่วนต่างได้จากหน้าจอ');
// ═══════════════════════════════════════════════════════════════════════════
await section('[M]', async () => {
  const { env, app } = await makeShop({ role: 'owner', rows: { vatEnabled: false } });
  const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
  const tx2 = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
  await editDiscount(env, tx.id, 100);
  await editDiscount(env, tx2.id, 100);
  const box = (id) => { app.openTransactionEdit(id); return env.document.getElementById('edit-tx-money-box').innerHTML; };
  loginAs(app, 'staff');
  await t('พนักงาน: ไม่เห็นปุ่มบันทึกส่วนต่าง (ตารางสิทธิ์ไม่อนุญาต)', () => ok(!/recordBillSettlement/.test(box(tx2.id))));
  loginAs(app, 'manager');
  await t('ผู้จัดการ: เห็นปุ่มบันทึกส่วนต่าง (เดิมเห็นแค่ "(เจ้าของร้านเป็นคนบันทึก)")', () => ok(/recordBillSettlement/.test(box(tx.id))));
  await app.recordBillSettlement(tx.id, 'moved');
  await t('ผู้จัดการบันทึกคืนเงินได้จริง → บิลไม่มีส่วนต่างค้าง', () => ok(app.billMoneyStatus(tx).settled));
  await t('ข้อความหน้าปิดกะบอกว่าผู้จัดการบันทึกได้ด้วย', () => {
    app.renderClosingMoneyNotes(app.computeShiftDrawer(app.state.shift));
    ok(/ผู้จัดการบันทึกได้/.test(env.document.getElementById('closing-money-notes').innerHTML));
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[E1] ค่าใช้จ่ายจากลิ้นชักเกินเงินในลิ้นชัก = เงินขาด (ข้อมูลจริง: ควรมี −300 นับได้ 0 → เดิมขึ้น "เกิน 300")');
// ═══════════════════════════════════════════════════════════════════════════
const addExpense = async (env, amount, source, note) => {
  env.document.getElementById('expense-type').value = 'other';
  env.document.getElementById('expense-amount').value = String(amount);
  env.document.getElementById('expense-note').value = note || 'ค่าไฟ';
  env.document.getElementById('expense-source').value = source;
  await env.app.addExpense();
  await settle(10);
};
// วันของกะ = ตัวจัดกะเข้าวัน (กะที่เปิด 03:00–06:00 เป็นวันใหม่ — ข้อ 3 รอบ 26 ก.ย. 2569)
// เดิมใช้วันของเวลาเปิดกะ → รันเทสต์ช่วง 04:00–07:00 แล้วตก (เจอด้วยการเลื่อนนาฬิกาทดสอบหลายช่วงเวลา)
const shiftDayOf = (app, log) => app.getBusinessISODate(app.shiftAnchorTime ? app.shiftAnchorTime(log) : log.startTime);
const SHIFT1300 = () => ({ active: true, startTime: Date.now() - HOUR, startCash: 1300, startDetails: {}, expenses: [], history: [] });
await section('[E1]', async () => {
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas, role: 'manager', cash: { 1000: 0 }, rows: { vatEnabled: false, shift: SHIFT1300() } });
  await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 400 }], 'cash', 400);
  await addExpense(env, 2000, 'drawer');
  const c = app.computeShiftDrawer(app.state.shift);
  await t('ควรมีในลิ้นชักติดลบไม่ได้ → 0 · ส่วนที่เกิน 300 แยกไว้', () => { eq(c.expected, 0); eq(c.overspend, 300); });
  app.openCashCounter('close');
  await t('หน้าปิดกะโชว์บรรทัด "ค่าใช้จ่ายเกินเงินในลิ้นชัก (นับเป็นเงินขาด)"', () => eq(env.document.getElementById('closing-overspend-row').style.display, 'flex'));
  app.updateCashSum();
  await t('หน้าปิดกะ: นับได้ 0 → ผลต่างขึ้น "เงินขาด" 300 (เดิมขึ้นเงินเกิน 300)', () => ok(/฿-300\.00 \(เงินขาด\)/.test(env.document.getElementById('closing-diff-amount').innerText), env.document.getElementById('closing-diff-amount').innerText));
  app.cashCounterMode = 'close';
  await app.confirmCashCount(); await settle(40);
  const log = app.state.shift.history[app.state.shift.history.length - 1];
  await t('ประวัติกะ: ควรมี 0 · นับได้ 0 · ผลต่าง −300 · overspend 300', () => { eq(log.expectedCash, 0); eq(log.countedCash, 0); eq(log.difference, -300); eq(log.overspend, 300); });
  const sum = app.buildShiftCashSummary('day', shiftDayOf(app, log));
  await t('สรุปส่งขึ้นชีต: เงินขาด/เกินของวัน −300', () => { eq(sum.cashVariance, -300); eq(sum.shifts[0].overspend, 300); });
  await t('ข้อความ Telegram บอก "ค่าใช้จ่ายจากลิ้นชักเกินเงินในลิ้นชัก ฿300 (นับเป็นเงินขาด)"', () => ok(/เกินเงินในลิ้นชัก: ฿300 \(นับเป็นเงินขาด\)/.test(app.buildShiftReportMessage(log))));
  await app.flushCloudOutbox(); await settle(80);
  const tab = gas.sheet('สรุป-' + shiftDayOf(app, log));
  const cells = tab ? [].concat(...tab._grid).map(String) : [];
  await t('แท็บสรุปบนชีตมีหมายเหตุ "ค่าใช้จ่ายเกินลิ้นชัก 300.00 (นับเป็นเงินขาด)"', () => ok(cells.some(x => /ค่าใช้จ่ายเกินลิ้นชัก 300\.00 \(นับเป็นเงินขาด\)/.test(x)), gas.sheetNames().join(',')));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[E2] ค่าใช้จ่ายที่ "จ่ายทางอื่น" (โอน/เงินเจ้าของ) ไม่หักจากลิ้นชัก แต่ยังเป็นค่าใช้จ่ายในสรุป');
// ═══════════════════════════════════════════════════════════════════════════
await section('[E2]', async () => {
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas, role: 'staff', cash: { 1000: 1, 500: 1, 100: 2 }, rows: { vatEnabled: false, shift: SHIFT1300() } });
  await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 400 }], 'cash', 400);
  await addExpense(env, 2000, 'other', 'ค่าเช่า');
  await addExpense(env, 100, 'drawer', 'น้ำแข็ง');
  const e = app.state.shift.expenses;
  await t('บันทึกช่องทางจ่ายติดรายการ (other / drawer)', () => eq(e.map(x => x.paidFrom), ['other', 'drawer']));
  await t('ช่อง "จ่ายจาก" กลับเป็นลิ้นชักหลังบันทึก (กันค้างไปติดรายการถัดไป)', () => eq(env.document.getElementById('expense-source').value, 'drawer'));
  const c = app.computeShiftDrawer(app.state.shift);
  await t('ควรมี = 1300 + 400 − 100 = 1600 (ค่าเช่า 2000 ที่โอนจ่ายไม่ถูกหัก)', () => { eq(c.expected, 1600); eq(c.overspend, 0); eq(c.otherExpensesTotal, 2000); eq(c.expensesTotal, 2100); });
  const day = app.getBusinessISODate(Date.now());
  const payload = app.buildSummaryPayload(app.state.transactions, app.getExpensesForDate(day), 'day', day);
  await t('สรุปวัน: ค่าใช้จ่ายรวมยังเป็น 2,100 (กำไรถูก) และรายการที่จ่ายทางอื่นมีป้ายบอก', () => {
    eq(payload.totalExpenses, 2100); ok(payload.expenses.some(x => x.note === 'ค่าเช่า (จ่ายทางอื่น)'));
  });
  await t('รายการที่ลงด้วยช่องทางแปลก ๆ ถูกปฏิเสธ ไม่เดาเอง', async () => {
    const before = app.state.shift.expenses.length;
    await addExpense(env, 50, 'hack', 'x');
    eq(app.state.shift.expenses.length, before);
  });
  loginAs(app, 'manager');
  app.cashCounterMode = 'close';
  await app.confirmCashCount(); await settle(40);   // นับได้ 1000+500+200 = 1700
  const log = app.state.shift.history[app.state.shift.history.length - 1];
  await t('ปิดกะ: นับได้ 1,700 · ควรมี 1,600 → เกิน 100 · เก็บยอดจ่ายทางอื่นไว้ในประวัติกะ', () => {
    eq(log.countedCash, 1700); eq(log.expectedCash, 1600); eq(log.difference, 100); eq(log.otherExpensesTotal, 2000); eq(log.drawerExpensesTotal, 100);
  });
  const sum = app.buildShiftCashSummary('day', shiftDayOf(app, log));
  await t('ตารางนับเงินบนชีต: ค่าใช้จ่าย = เฉพาะจากลิ้นชัก 100 · จ่ายทางอื่น 2,000 แยกช่อง', () => { eq(sum.shifts[0].expenses, 100); eq(sum.shifts[0].expensesOther, 2000); });
  await t('กะเก่าที่ไม่มีช่อง "จ่ายจาก" = ถือว่าจ่ายจากลิ้นชักทั้งหมด (ไม่ตีความประวัติใหม่)', () => {
    const old = app.computeShiftDrawer({ startCash: 500, startTime: Date.now() + HOUR, expenses: [{ amount: 200 }] });
    eq(old.expected, 300);
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P] PIN เจ้าของค่าเริ่มต้น 123456 → ต้องตั้ง PIN ใหม่ก่อนได้สิทธิ์เจ้าของ');
// ═══════════════════════════════════════════════════════════════════════════
const loginOwner = async (env, pin, answers) => {
  const app = env.app;
  const asked = [];
  app.showPromptModal = (msg, def, cb, onCancel) => { asked.push(msg); const a = answers.length ? answers.shift() : null; if (a === null) onCancel && onCancel(); else cb(a); };
  app.currentRole = null; app.currentUser = null;
  app.loginSelectedId = '__owner__';
  env.document.getElementById('login-pin-input').value = pin;
  await app.doLogin(); await settle(20);
  return asked;
};
await section('[P]', async () => {
  let shop = await makeShop({ role: null, rows: { ownerPin: pinHash('123456') } });
  let asked = await loginOwner(shop.env, '123456', [null]);
  await t('ล็อกอินด้วย 123456 → ถูกถามให้ตั้ง PIN ใหม่ (เดิมเข้าได้เลย)', () => ok(asked.length >= 1 && /ค่าเริ่มต้น/.test(asked[0]), JSON.stringify(asked)));
  await t('กดยกเลิก → ยังไม่ได้สิทธิ์เจ้าของ', () => eq(shop.app.currentRole, null));
  asked = await loginOwner(shop.env, '123456', ['123456', '654321', '000000', null]);
  await t('ตั้งเป็น 123456 ซ้ำ / ยืนยันไม่ตรง → ไม่ผ่าน ยังไม่ได้สิทธิ์', async () => { eq(shop.app.currentRole, null); eq(await shop.env.raw('ownerPin'), pinHash('123456')); });
  asked = await loginOwner(shop.env, '123456', ['654321', '654321']);
  await t('ตั้ง PIN ใหม่ 2 ครั้งตรงกัน → ได้สิทธิ์เจ้าของ และ PIN ใหม่ลงเครื่องจริง', async () => {
    eq(shop.app.currentRole, 'owner'); eq(await shop.env.raw('ownerPin'), pinHash('654321'));
  });
  asked = await loginOwner(shop.env, '654321', []);
  await t('ล็อกอินด้วย PIN ใหม่ → ไม่ถูกถามอีก', () => { eq(asked.length, 0); eq(shop.app.currentRole, 'owner'); });
  shop.env.dispose();

  shop = await makeShop({ role: null, noInit: true, rows: { ownerPin: pinHash('123456') } });
  await shop.env.db.state.put({ key: 'session', value: { uid: '__owner__', name: 'เจ้าของร้าน', role: 'owner', ts: Date.now() } });
  await t('เซสชันเจ้าของที่ค้างอยู่ + PIN ยังเป็นค่าเริ่มต้น → ต้องผ่านหน้าล็อกอินใหม่', async () => eq(await shop.app.tryRestoreSession(), false));
  shop.env.dispose();

  shop = await makeShop({ role: 'owner' });
  shop.env.document.getElementById('shop-owner-pin').value = '123456';
  await shop.app.saveShopSettings(); await settle(30);
  await t('หน้าตั้งค่าไม่ยอมตั้ง PIN เจ้าของเป็น 123456', async () => ok(shop.app.ownerPin !== pinHash('123456') && (await shop.env.raw('ownerPin')) !== pinHash('123456')));
  shop.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[S] ส่งบิลค้างจำนวนมาก (เช่นหลังกู้ข้อมูล): บันทึกความคืบหน้าระหว่างทาง · เน็ตล้มติดกันต้องหยุดรอบ');
// ═══════════════════════════════════════════════════════════════════════════
const manyBills = (n) => {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `TX-${now - i * 1000}-B${String(i).padStart(4, '0')}`, date: now - HOUR - i * 1000, customerName: 'ลูกค้า', services: ['ตัดผม'],
    staffNames: ['เอ'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, syncStatus: 'pending'
  }));
};
await section('[S1]', async () => {
  const gas = createGasEnv();
  let calls = 0, snapshot = null, envRef = null;
  const real = gas.fetch;
  gas.fetch = async (url, init) => {
    const p = JSON.parse(init.body);
    if (p.action === 'transaction' && ++calls === 40) {
      snapshot = ((await envRef.raw('transactions')) || []).filter(x => x.syncStatus === 'synced').length;
    }
    return real(url, init);
  };
  const shop = await makeShop({ gas, noInit: true, rows: { transactions: manyBills(60) } });
  envRef = shop.env;
  await shop.app.syncPendingTransactions(true); await settle(50);
  await t('ส่งครบ 60 ใบ', () => eq(shop.app.state.transactions.filter(x => x.syncStatus === 'synced').length, 60));
  await t('ระหว่างส่งใบที่ 40 ความคืบหน้าอย่างน้อย 25 ใบลงเครื่องแล้ว (เดิม 0 จนจบรอบ — แอปถูกปิดกลางทาง = เริ่มใหม่ทั้งหมด)', () => ok(snapshot >= 25, String(snapshot)));
  shop.env.dispose();
}, 120000);
await section('[S2]', async () => {
  const gas = createGasEnv();
  let calls = 0;
  const real = gas.fetch;
  gas.fetch = (url, init) => { if (JSON.parse(init.body).action === 'transaction') calls++; return real(url, init); };
  gas.networkDown = true;
  const shop = await makeShop({ gas, noInit: true, rows: { transactions: manyBills(60) } });
  await shop.app.syncPendingTransactions(true); await settle(30);
  await t('เน็ตล่ม: หยุดรอบหลังล้มติดกัน 3 ใบ (เดิมไล่ยิงทั้ง 60 ใบ ใบละ 20 วินาทีถ้าเน็ตค้าง)', () => ok(calls <= 3, String(calls)));
  await t('บิลที่ยังไม่ได้ส่งยังค้างรอส่งครบทุกใบ (ไม่มีอะไรหาย)', () => eq(shop.app.state.transactions.filter(x => x.syncStatus === 'pending').length, 60));
  gas.networkDown = false; calls = 0;
  let busy = 0;
  gas.fetch = (url, init) => {
    if (JSON.parse(init.body).action === 'transaction') {
      calls++;
      if (busy < 5) { busy++; return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ status: 'error', message: 'ระบบหนาแน่น กรุณาลองใหม่' }), text: async () => '' }); }
    }
    return real(url, init);
  };
  const shop2 = await makeShop({ gas, noInit: true, rows: { transactions: manyBills(20) } });
  await shop2.app.syncPendingTransactions(true); await settle(30);
  await t('ชีตตอบ error เฉพาะใบ (ไม่ใช่เน็ตล่ม) → ไม่หยุดรอบ ส่งใบที่เหลือต่อจนครบ', () => { eq(calls, 20); eq(shop2.app.state.transactions.filter(x => x.syncStatus === 'synced').length, 15); });
  shop.env.dispose(); shop2.env.dispose();
}, 120000);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[R] หน้าตรวจความตรงกัน: บิลที่แยกไว้ตรวจสอบ ห้ามมีปุ่มลบแถวบนชีต');
// ═══════════════════════════════════════════════════════════════════════════
await section('[R]', async () => {
  const { env, app, gas } = await makeShop({ rows: { vatEnabled: false } });
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;
  const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
  await app.syncPendingTransactions(true); await settle(60);
  // จำลอง: กู้ไฟล์ที่บิลใบนี้ตัวเลขเสีย → ถูกแยกไว้ตรวจสอบ (ไม่อยู่ในรายการบิล) แต่แถวบนชีตยังอยู่
  app.state.quarantine = [{ kind: 'transaction', id: tx.id, reasons: ['bad-total'], message: 'ยอดเสีย', original: Object.assign({}, tx), quarantinedAt: Date.now() }];
  app.state.transactions = app.state.transactions.filter(x => x.id !== tx.id);
  await app.runCloudReconcile(); await settle(30);
  await t('แถวของบิลที่แยกไว้ตรวจสอบอยู่กลุ่มของตัวเอง ไม่อยู่ในกลุ่ม "มีบนชีตแต่ไม่มีในเครื่อง" (ที่มีปุ่มลบ)', () => {
    eq(app._reconcile.extra.map(x => x.id), []); eq(app._reconcile.quarantined.map(x => x.id), [tx.id]);
  });
  const html = env.document.getElementById('reconcile-body').innerHTML;
  await t('หน้าจอไม่มีปุ่มลบให้บิลใบนี้', () => ok(!new RegExp("reconcileDeleteSheetBill\\('" + tx.id).test(html) && /แยกไว้ตรวจสอบ/.test(html)));
  const before = (app.state.cloudOutbox || []).length;
  app._reconcile.extra.push({ monthKey: app.getBusinessMonthKey(tx.date), id: tx.id, total: 300, when: '' });
  app.reconcileDeleteSheetBill(tx.id); await settle(30);
  await t('แม้เรียกตัวลบตรง ๆ ก็ไม่สร้างคำสั่งลบแถว', () => eq((app.state.cloudOutbox || []).length, before));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[C] ค่าคอมแบบ % ห้ามเกิน 100');
// ═══════════════════════════════════════════════════════════════════════════
await section('[C]', async () => {
  const { env, app } = await makeShop({ role: 'owner' });
  const fill = (comm, type) => {
    const d = env.document;
    d.getElementById('serv-name').value = 'นวดทดสอบ'; d.getElementById('serv-price').value = '500';
    d.getElementById('serv-duration').value = '60'; d.getElementById('serv-category').value = 'barber';
    d.getElementById('serv-commission').value = String(comm); d.getElementById('serv-commission-type').value = type;
  };
  const n0 = app.state.services.length;
  app.state.editingServiceId = null;
  fill(150, 'percent'); await app.addService(); await settle(20);
  await t('150% ถูกปฏิเสธ', () => eq(app.state.services.length, n0));
  fill(150, 'fixed'); await app.addService(); await settle(20);
  await t('แบบจำนวนเงิน ฿150 ใช้ได้ตามเดิม', () => eq(app.state.services.length, n0 + 1));
  env.dispose();
});

R.done();
})().catch(e => { console.error(e); process.exit(1); });
