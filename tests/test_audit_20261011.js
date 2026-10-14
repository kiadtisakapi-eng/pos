// ─────────────────────────────────────────────────────────────────────────────
//  ตรวจ 11 ต.ค. 2569 (Claude) — แก้ครบ 14 ข้อ · ทุกหัวข้อเดินผ่านทางจริงของแอป (IndexedDB จริง + Apps Script ในชีตจำลอง)
//  ไม่ stub ฟังก์ชันที่กำลังพิสูจน์ — ที่แทนมีแค่ "หน้าจอ" (toast/วาดหน้า/กล่องยืนยัน)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC ชี้ไปโค้ดก่อนแก้ → ต้องตก (ดู tests/README.md)
//   [12] เงินส่วนต่างหลังแก้บิลหลายรอบ   [13] นาฬิกาย้อนหลังระหว่างกะ   [14] ป้ายสถานะเมื่อชีตไม่รับสรุป
//   [1] จำนวนงานไม่นับสินค้า   [2] บิลเก่าไม่ถูกเดาเป็นสินค้า   [3] บิลสินค้าล้วนไม่จดรหัสลูกค้า
//   [5] ค่าคอมบาทเกินราคา   [6] ใบเสร็จ   [7] ชื่อซ้ำ   [8] ชื่อเป็นตัวเลข   [9] การ์ดสินค้า   [10] ข้อความบนจอ
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ตรวจ 11 ต.ค. 2569: แก้ 14 ข้อ ---');
const t = R.t;
const clone = x => JSON.parse(JSON.stringify(x));
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 120000) / 1000) + ' วินาที')), ms || 120000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const expected = (app) => app.computeShiftDrawer(app.state.shift).expected;
const H500 = [{ id: 's1', name: 'ตัดผม', price: 500 }];

async function checkout(env, items, pay, received) {
  readyCheckout(env, items, pay, received);
  await env.app.processCheckout();
  await settle(30);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}
async function editBill(env, txId, o) {
  const app = env.app;
  app.openTransactionEdit(txId);
  if (o.payment !== undefined) env.document.getElementById('edit-tx-payment').value = o.payment;
  if (o.discount !== undefined) env.document.getElementById('edit-tx-discount').value = String(o.discount);
  await app.saveTransactionEdit();
  await settle(30);
}
async function closeShift(app, env) {
  app.cashCounterMode = 'close';
  await app.confirmCashCount();
  await settle(60);
  const sh = await env.raw('shift');   // อ่านจากฐานข้อมูลจริง (สิ่งที่บันทึกลงเครื่อง)
  return sh.history[sh.history.length - 1];
}
const LINE = (o) => Object.assign({ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ',
  commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber', vatable: false }, o || {});
const BILL = (id, date, total, o) => Object.assign({ id, date, customerName: 'x', services: ['ตัดผม'],
  details: [LINE({ price: total, netPrice: total, commissionAmount: Math.round(total * 10) / 100 })],
  subtotal: total, discount: 0, vatRate: 7, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total,
  cashReceived: total, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' }, o || {});

// ร้านที่มีสินค้า (หมวด drinks คิด VAT 7%)
const OLD_ID_TS = Date.now() - 400 * 864e5;   // รายการที่สร้างมานานแล้ว (รหัส s-<เวลา>-…)
const SERVICES = [
  { id: 's1', type: 'service', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 'p1', type: 'product', name: 'น้ำเปล่า', price: 20, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed', cost: 8 },
  { id: 'p2', type: 'product', name: 'เบียร์', price: 100, duration: 0, category: 'barber', commission: 10, commissionType: 'fixed', cost: 40 },
  { id: `s-${OLD_ID_TS}-wax001`, type: 'service', name: 'แว็กซ์', price: 150, duration: 5, category: 'barber', commission: 10, commissionType: 'percent' }
];
const shopWith = (o) => {
  o = o || {};
  return makeShop(Object.assign({}, o, { rows: Object.assign({ services: clone(SERVICES),
    customers: [{ id: 'c-1', name: 'ลูกค้าทอง', phone: '0811111111', visitCount: 5, tier: 'ทอง (Gold)' }] }, o.rows || {}) }));
};
async function sell(shop, ids, o) {
  o = o || {};
  const { env, app, toasts } = shop;
  app.state.cart = [];
  ids.forEach(id => app.addToCart(id));
  app.state.cart.forEach(it => { const s = o.staff && o.staff[it.id]; if (s) app.changeItemStaff(it.uniqueCartId, s); });
  app.state.selectedPaymentMethod = o.pay || 'cash';
  env.document.getElementById('cash-received').value = '100000';
  env.document.getElementById('cart-discount').value = String(o.discount || 0);
  env.document.getElementById('cart-customer-select').value = o.customer || '';
  app.beginCheckoutAttempt();
  const n0 = app.state.transactions.length, t0 = toasts.length;
  await app.processCheckout(); await settle(40);
  const txs = app.state.transactions;
  return { tx: txs.length > n0 ? txs[txs.length - 1] : null, toasts: toasts.slice(t0).map(x => x.m) };
}
function reportsScreen(shop, dateKey, staffId) {
  const { env, app } = shop; const P = Object.getPrototypeOf(app), d = env.document;
  app.filterReports = P.filterReports.bind(app); app.renderReportsChart = P.renderReportsChart.bind(app);
  d.getElementById('report-date-input').value = dateKey;
  d.getElementById('report-staff-filter').value = staffId || 'all';
  app.state.selectedReportType = 'daily';
  app.filterReports();
  return { count: String(d.getElementById('report-kpi-count').innerText || ''),
    popular: String(d.getElementById('report-kpi-popular').innerText || ''),
    commission: String(d.getElementById('report-commission-body').innerHTML || ''),
    products: String(d.getElementById('report-products-body').innerHTML || ''),
    note: String(d.getElementById('report-products-note').innerHTML || '') };
}
const fillForm = (d, v) => {
  d.getElementById('serv-type').value = v.type; d.getElementById('serv-name').value = v.name;
  d.getElementById('serv-price').value = v.price; d.getElementById('serv-duration').value = v.duration == null ? '' : v.duration;
  d.getElementById('serv-cost').value = v.cost == null ? '' : v.cost; d.getElementById('serv-category').value = v.cat || 'barber';
  d.getElementById('serv-commission').value = v.comm == null ? '0' : v.comm; d.getElementById('serv-commission-type').value = v.ctype || 'fixed';
};

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[12] เงินส่วนต่างหลังแก้บิลหลายรอบ — ลิ้นชักต้องเท่าเงินจริงไม่ว่าทำลำดับไหน');
// ═══════════════════════════════════════════════════════════════════════════
await section('[12.1] ลำดับ A', async () => {
  // ลูกค้าสแกน QR 500 แต่พนักงานกด "เงินสด" · เจ้าของลด 100 (ร้านเก็บไว้) แล้วค่อยแก้ช่องทางเป็นโอน
  const { env, app } = await makeShop({ cash: { 1000: 1 } });   // ลิ้นชักจริง 1,000 (ไม่มีเงินสดจากบิลนี้)
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'บันทึก "ไม่มีเงินเคลื่อนไหว" ไม่สำเร็จ');
  await editBill(env, tx.id, { payment: 'promptpay' });
  await t('แก้ช่องทางหลังกด "ไม่มีเงินเคลื่อนไหว": รายการเดิมหมดผล → ส่วนต่างคิดจากเงินจริง (เงินสด −500 · โอน +400)', () => {
    const st = app.billMoneyStatus(tx);
    eq(st.diffs, [{ method: 'cash', amount: -500 }, { method: 'promptpay', amount: 400 }]);
    eq(st.inactive.length, 1);
  });
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'บันทึก "ตอนขายบันทึกผิด" ไม่สำเร็จ');
  await t('กล่องยืนยัน "ตอนขายบันทึกรับเงินผิด" บอกยอดที่ย้ายจริง ฿500 และส่วนต่างที่ยังเหลือ', () => {
    ok(/ย้าย ฿500\.00/.test(app._lastAskMsg) && /หลังบันทึกยังเหลือส่วนต่าง/.test(app._lastAskMsg), app._lastAskMsg);
  });
  await t('ย้ายเงินสดที่บันทึกตอนขายทั้งก้อน: ลิ้นชักคาด 1,000 · เหลือส่วนต่างโอน −100 ให้บันทึกต่อ', () => {
    eq(expected(app), 1000);
    eq(app.billMoneyStatus(tx).diffs, [{ method: 'promptpay', amount: -100 }]);
  });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'บันทึกส่วนต่างที่เหลือไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('ปิดกะ: ควรมี 1,000 · นับได้ 1,000 · ขาด/เกิน 0 (เดิมขาด 100)', () => {
    ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === tx.id)).settled, 'บิลยังค้างส่วนต่าง');
    eq([h.expectedCash, h.countedCash, h.difference], [1000, 1000, 0]);
  });
  env.dispose();
});

await section('[12.2] ลำดับ B', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1 } });
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { payment: 'promptpay' });
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'correction ไม่สำเร็จ');
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('ทำสลับลำดับ (แก้ช่องทางก่อน) ได้ผลเท่ากัน: ขาด/เกิน 0', () => eq([h.expectedCash, h.difference], [1000, 0]));
  env.dispose();
});

await section('[12.3] คืนเงินสดจริงแล้วค่อยแก้ช่องทาง', async () => {
  const { env, app } = await makeShop({ cash: { 500: 1, 100: 4 } });   // ลิ้นชักจริง 900 (คืนเงินสด 100 จากลิ้นชัก)
  await settle();
  const P = Object.getPrototypeOf(app);
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'moved'), 'บันทึกคืนเงินไม่สำเร็จ');
  await editBill(env, tx.id, { payment: 'promptpay' });
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'correction ไม่สำเร็จ');
  await t('ลิ้นชักคาด 900 (เดิม 1,000 = ขาด 100)', () => eq(expected(app), 900));
  P.renderEditMoneyBox.call(app, app.state.transactions.find(x => x.id === tx.id));
  await t('ส่วนต่างที่เหลือต่างกันแค่ช่องทาง → หน้าบิลบอกว่ายอดรวมครบแล้ว ให้กด "ไม่มีเงินเคลื่อนไหว"', () => {
    eq(app.billMoneyStatus(tx).diffs, [{ method: 'cash', amount: 100 }, { method: 'promptpay', amount: -100 }]);
    ok(/ยอดรวมครบแล้ว ต่างกันแค่ช่องทาง/.test(env.document.getElementById('edit-tx-money-box').innerHTML), 'ไม่มีคำอธิบาย');
  });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('ปิดกะ: ควรมี 900 · นับได้ 900 · ขาด/เกิน 0', () => eq([h.expectedCash, h.countedCash, h.difference], [900, 900, 0]));
  env.dispose();
});

await section('[12.4] ใส่ส่วนลดผิดแล้วแก้กลับ', async () => {
  const { env, app } = await makeShop();
  await settle();
  const P = Object.getPrototypeOf(app);
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  await editBill(env, tx.id, { discount: 0 });
  await t('แก้กลับเป็น 500: ไม่มีส่วนต่างค้าง (เดิมบอกให้เก็บเงินลูกค้าเพิ่ม 100) · ลิ้นชักคาดตามเงินจริง', () => {
    ok(app.billMoneyStatus(tx).settled, JSON.stringify(app.billMoneyStatus(tx).diffs));
    ok(!app.listUnsettledBills().some(x => x.billId === tx.id), 'ยังขึ้นในรายการค้างบันทึก');
    eq(expected(app), 1500);
  });
  P.renderEditMoneyBox.call(app, app.state.transactions.find(x => x.id === tx.id));
  await t('ประวัติยังเห็นรายการ "ไม่มีเงินเคลื่อนไหว" เดิม พร้อมป้ายว่าหมดผล', () =>
    ok(/หมดผล — บิลถูกแก้ยอด\/ช่องทางหลังบันทึก/.test(env.document.getElementById('edit-tx-money-box').innerHTML), 'ไม่มีป้ายหมดผล'));
  await editBill(env, tx.id, { discount: 100 });
  await t('แก้กลับไปยอดเดียวกับตอนกด (400) — รายการเดิมไม่กลับมามีผล (หมดผลถาวร) ต้องบันทึกใหม่ตามที่เกิดจริง', () =>
    eq(app.billMoneyStatus(tx).diffs, [{ method: 'cash', amount: -100 }]));
  env.dispose();
});

await section('[12.6] ไม่มีเงินเคลื่อนไหว → คืนเงินจริง → แก้กลับ (ผู้ตรวจอิสระ)', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1, 100: 4 } });   // ลิ้นชักจริง 1,400 (รับ 500 · คืน 200 · เก็บเพิ่ม 100)
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  await editBill(env, tx.id, { discount: 200 });
  ok(await app.recordBillSettlement(tx.id, 'moved'), 'คืนเงินไม่สำเร็จ');       // คืนเงินสด 200 จริง
  await editBill(env, tx.id, { discount: 100 });
  await t('ลูกค้าจ่าย 500 ได้คืน 200 บิลเป็น 400 → ต้องเก็บเพิ่ม 100 (เดิมรายการ "ไม่มีเงินเคลื่อนไหว" กลับมามีผล บอกว่าค้าง 200)', () =>
    eq(app.billMoneyStatus(tx).diffs, [{ method: 'cash', amount: 100 }]));
  ok(await app.recordBillSettlement(tx.id, 'moved'), 'เก็บเงินเพิ่มไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('ปิดกะ: ควรมี 1,400 · นับได้ 1,400 · ขาด/เกิน 0', () => eq([h.expectedCash, h.countedCash, h.difference], [1400, 1400, 0]));
  env.dispose();
});

await section('[12.7] เปลี่ยนเป็นโอนแล้วคืนเงินสดจริง → ลดราคา → "บันทึกผิด" ต้องไม่ย้ายเงินสดซ้ำ (ผู้ตรวจอิสระ)', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1 } });
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { payment: 'promptpay' });
  ok(await app.recordBillSettlement(tx.id, 'moved'), 'บันทึกคืนเงินสด/รับโอนไม่สำเร็จ');   // คืนเงินสด 500 · ลูกค้าสแกนจ่าย 500
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'correction ไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('ไม่ย้ายเงินสด 500 ออกจากลิ้นชักซ้ำ: ควรมี 1,000 · ขาด/เกิน 0', () => eq([h.expectedCash, h.difference], [1000, 0]));
  env.dispose();
});

await section('[12.8] คำแนะนำบนหน้าบิลชี้ปุ่มที่ถูก', async () => {
  const { env, app } = await makeShop();
  await settle();
  const P = Object.getPrototypeOf(app);
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { payment: 'promptpay' });
  P.renderEditMoneyBox.call(app, app.state.transactions.find(x => x.id === tx.id));
  const box = env.document.getElementById('edit-tx-money-box').innerHTML;
  await t('กดเงินสดแต่ลูกค้าสแกนจ่าย: แนะนำ "ตอนขายบันทึกรับเงินผิด" ไม่ใช่ "ไม่มีเงินเคลื่อนไหว" (กดผิด = ลิ้นชักเพี้ยนทั้งบิล)', () => {
    ok(/ให้กด "ตอนขายบันทึกรับเงินผิด"/.test(box) && !/ยอดรวมครบแล้ว ต่างกันแค่ช่องทาง/.test(box), box.replace(/\s+/g, ' ').slice(0, 700));
  });
  env.dispose();
});

await section('[12.9] บันทึกผิดของบิลที่ติดรหัสกะนี้ แม้เวลาบิลอยู่ก่อนเปิดกะ → ปรับลิ้นชักกะนี้', async () => {
  const S = Date.now() - 3600e3;
  const A = BILL('TX-1790000000013-TAGGEDCR', S - 60e3, 300, { tender: { method: 'cash', amount: 300, received: 300, change: 0, at: S - 60e3, shiftStart: S } });
  const { env, app } = await makeShop({ rows: { transactions: [A], shift: { active: true, startTime: S, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  eq(expected(app), 1300);
  await editBill(env, A.id, { payment: 'promptpay' });
  ok(await app.recordBillSettlement(A.id, 'correction'), 'correction ไม่สำเร็จ');
  await t('ลิ้นชักกะนี้ไม่นับเงินสด 300 ของบิลนี้แล้ว = 1,000', () => eq(expected(app), 1000));
  await t('กล่องยืนยันบอกว่าปรับลิ้นชักของกะนี้ (ไม่ใช่ "กะที่ขายบิลปิดไปแล้ว")', () => ok(/ปรับยอดที่ควรมีในลิ้นชักของกะนี้/.test(app._lastAskMsg), app._lastAskMsg));
  env.dispose();
});

await section('[12.10] ตอนขายทั้งช่องทางและยอดผิด: บันทึกผิดสองรอบ → ย้ายเงินสดครั้งเดียว', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1 } });
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { payment: 'promptpay', discount: 100 });   // จริง ๆ ลูกค้าสแกนจ่ายแค่ 400
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'correction รอบแรกไม่สำเร็จ');
  await t('รอบแรก: ย้ายเงินสด 500 ไปโอน · เหลือโอน −100', () => eq(app.billMoneyStatus(tx).diffs, [{ method: 'promptpay', amount: -100 }]));
  ok(await app.recordBillSettlement(tx.id, 'correction'), 'correction รอบสองไม่สำเร็จ');
  const h = await closeShift(app, env);
  await t('รอบสอง (ตอนขายรับโอนแค่ 400): ไม่ย้ายเงินสดซ้ำ · บิลครบ · ลิ้นชัก 1,000 ขาด/เกิน 0', () => {
    ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === tx.id)).settled, 'ยังค้าง');
    eq([h.expectedCash, h.difference], [1000, 0]);
  });
  env.dispose();
});

await section('[12.4b] แก้บิลแล้วบันทึกลงเครื่องไม่สำเร็จ → "ไม่มีเงินเคลื่อนไหว" ไม่หมดผลค้างในหน่วยความจำ', async () => {
  const { env, app } = await makeShop();
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  const undo = failPutForKeys(['transactions'], 'sync');
  try { await editBill(env, tx.id, { discount: 0 }); } finally { undo(); }
  const cur = app.state.transactions.find(x => x.id === tx.id);
  await t('บิลกลับเป็นค่าเดิม (400) และรายการ "ไม่มีเงินเคลื่อนไหว" ยังมีผล (ไม่มีตราหมดผลค้าง)', () => {
    eq(cur.total, 400); ok(cur.settlements.every(x => !x.supersededAt), JSON.stringify(cur.settlements)); ok(app.billMoneyStatus(cur).settled);
  });
  env.dispose();
});

await section('[12.5] ข้อมูลรุ่นก่อน', async () => {
  const id = 'TX-1790000000000-LEGACYWV';
  const legacy = BILL(id, Date.now() - 600e3, 200, { subtotal: 300, discount: 100, nonVatBase: 200,
    details: [LINE({ price: 300, netPrice: 200, commissionAmount: 20 })],
    tender: { method: 'cash', amount: 300, received: 300, change: 0, at: Date.now() - 600e3 },
    settlements: [{ id: 'stl-old', kind: 'waive', method: 'cash', amount: -100, at: Date.now() - 500e3, by: 'x', shiftStart: null }] });
  const bad = BILL('TX-1790000000001-BADDUEAA', Date.now() - 600e3, 200, { subtotal: 300, discount: 100, nonVatBase: 200,
    details: [LINE({ price: 300, netPrice: 200, commissionAmount: 20 })],
    tender: { method: 'cash', amount: 300, received: 300, change: 0, at: Date.now() - 600e3 },
    settlements: [{ id: 'stl-bad', kind: 'waive', method: 'cash', amount: -100, at: 1, by: 'x', shiftStart: null, due: 'เสีย' }] });
  const { env, app } = await makeShop({ rows: { transactions: [legacy, bad] } });
  await settle();
  await t('"ไม่มีเงินเคลื่อนไหว" รุ่นก่อน (ไม่มีช่อง due) ยังมีผลแบบเดิม — ไม่ตีความประวัติเก่าใหม่', () =>
    ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === id)).settled));
  await t('หลักฐาน due เสีย = ข้อมูลรับเงินต้องตรวจ (ไม่เดาว่ายังมีผล)', () =>
    ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === bad.id)).invalid));
  env.dispose();
});

await section('[12.12] คืน/เก็บเงินจริง "ทางไหน" (เงินสด/โอน) — ทำลำดับไหนก็ได้ กดตามคำแนะนำบนหน้าบิล → บิลครบ · ปิดกะตรง', async () => {
  // เดิม (ข้อจำกัดที่ค้างจากข้อ 12): ปุ่มเดียว บันทึกตามช่องทางของบิล → บิลโอนที่ทอนส่วนลดเป็นเงินสด บิลขึ้น "ครบ" แต่ปิดกะขาด 100
  // (คู่มือรอบแรกแก้ด้วยการเรียงลำดับ — ถูกแค่ 2 ใน 4 แบบ) · เจ้าของเลือกแบบ ก: ให้ถามว่าเงินไปทางไหนจริง
  const TH = { cash: 'เงินสด', promptpay: 'โอน' };
  const notesOf = (amt) => { const n = {}; let r = amt; [1000, 500, 100].forEach(d => { const k = Math.floor(r / d); if (k) n[d] = k; r -= k * d; }); return n; };
  // กดตาม "คำแนะนำบนหน้าบิลจริง" (อ่านจาก renderEditMoneyBox) จนไม่มีคำแนะนำ
  const followHints = async (env, app, txId, log) => {
    const P = Object.getPrototypeOf(app);
    for (let i = 0; i < 3; i++) {
      const cur = app.state.transactions.find(x => x.id === txId);
      if (app.billMoneyStatus(cur).settled) return;
      P.renderEditMoneyBox.call(app, cur);
      const html = env.document.getElementById('edit-tx-money-box').innerHTML;
      if (/ให้กด "ตอนขายบันทึกรับเงินผิด"/.test(html)) { ok(await app.recordBillSettlement(txId, 'correction'), 'บันทึกผิดไม่สำเร็จ'); log.push('บันทึกผิด'); }
      else if (/ให้กด "ไม่มีเงินเคลื่อนไหว"/.test(html)) { ok(await app.recordBillSettlement(txId, 'waive'), 'waive ไม่สำเร็จ'); log.push('ไม่มีเงินเคลื่อนไหว'); }
      else return;
    }
  };
  const results = [];
  for (const kind of ['refund', 'collect'])
  for (const [recorded, truth] of [['cash', 'cash'], ['promptpay', 'promptpay'], ['cash', 'promptpay'], ['promptpay', 'cash']])
  for (const via of ['cash', 'promptpay'])
  for (const order of (recorded === truth ? ['money'] : ['channelFirst', 'moneyFirst', 'together'])) {
    // คืน: ขาย 500 → ลด 100 คืน 100 · เก็บเพิ่ม: ขาย 400 (ลด 100) → เอาส่วนลดออก เก็บเพิ่ม 100
    const paid = kind === 'refund' ? 500 : 400;
    const real = 1000 + (truth === 'cash' ? paid : 0) + (via === 'cash' ? (kind === 'refund' ? -100 : 100) : 0);
    const { env, app } = await makeShop({ cash: notesOf(real) });
    await settle();
    readyCheckout(env, H500, recorded, paid);
    if (kind === 'collect') { env.document.getElementById('cart-discount').value = '100'; app.beginCheckoutAttempt(); }
    await app.processCheckout(); await settle(30);
    const tx = app.state.transactions[app.state.transactions.length - 1];
    const newDiscount = kind === 'refund' ? 100 : 0;
    const log = [];
    const fixChannel = async () => { if (recorded !== truth) { await editBill(env, tx.id, { payment: truth }); log.push('แก้ช่องทาง'); await followHints(env, app, tx.id, log); } };
    const money = async () => {
      ok(await app.recordBillSettlement(tx.id, 'moved', via), `${kind} ทาง${via} ไม่สำเร็จ`); log.push((kind === 'refund' ? 'คืนทาง' : 'เก็บทาง') + TH[via]);
      await followHints(env, app, tx.id, log);
    };
    if (order === 'together') { await editBill(env, tx.id, { payment: truth, discount: newDiscount }); log.push('แก้พร้อมกัน'); await money(); }
    else if (order === 'channelFirst') { await fixChannel(); await editBill(env, tx.id, { discount: newDiscount }); await money(); }
    else { await editBill(env, tx.id, { discount: newDiscount }); await money(); await fixChannel(); }
    const cur = app.state.transactions.find(x => x.id === tx.id);
    const realMoves = (cur.settlements || []).filter(x => x.kind === 'refund' || x.kind === 'collect');
    const h = await closeShift(app, env);
    results.push({ name: `${kind === 'refund' ? 'คืน' : 'เก็บเพิ่ม'} · กด${TH[recorded]} จ่ายจริง${TH[truth]} · เงินไปทาง${TH[via]} · ${order}`, log: log.join('→'),
      ok: app.billMoneyStatus(cur).settled && h.difference === 0 && h.expectedCash === real &&
        realMoves.length === 1 && realMoves[0].method === via && realMoves[0].amount === (kind === 'refund' ? -100 : 100),
      got: [h.expectedCash, h.countedCash, h.difference, JSON.stringify(realMoves.map(x => [x.method, x.amount]))] });
    env.dispose();
  }
  await t(`ครบ ${results.length} แบบ (คืน/เก็บเพิ่ม × ช่องทางที่กดตอนขาย × ทางที่ลูกค้าจ่ายจริง × ทางที่เงินไป × ลำดับ): บิลครบ · ปิดกะขาด/เกิน 0 · บันทึกเงินจริงทางที่เลือก 1 รายการ`, () => {
    const bad = results.filter(r => !r.ok);
    ok(!bad.length, bad.map(r => `${r.name} | ${r.log} | ${r.got.join(' ')}`).join('\n'));
    eq(results.length, 32);
  });
}, 600000);

await section('[12.13] หน้าบิลถามว่าเงินไปทางไหน · ส่วนต่างช่องทางบันทึกให้ในคราวเดียว · กรณีขอบ', async () => {
  const P0 = (app) => Object.getPrototypeOf(app);
  const box = (env, app, id) => { P0(app).renderEditMoneyBox.call(app, app.state.transactions.find(x => x.id === id)); return env.document.getElementById('edit-tx-money-box').innerHTML; };
  const { env, app, toasts } = await makeShop({ cash: { 500: 1, 100: 4 } });   // ลิ้นชักจริง 900 (ลูกค้าโอน 500 · ทอนส่วนลด 100 เป็นเงินสด)
  await settle();
  const tx = await checkout(env, H500, 'promptpay', 500);
  await editBill(env, tx.id, { discount: 100 });
  const h1 = box(env, app, tx.id);
  await t('ถาม "คืนทางไหน?" พร้อมปุ่ม เงินสด/โอน/บัตร (ไม่มีปุ่มที่เดาช่องทางให้) · ส่วนต่างช่องทางเดียวไม่มีปุ่มแยกช่องทาง', () => {
    ok(/คืนเงินให้ลูกค้าจริงตอนนี้ ฿100\.00 — คืนทางไหน\?/.test(h1), h1);
    eq((h1.match(/data-settle="moved-[a-z]+"/g) || []).join(','), 'data-settle="moved-cash",data-settle="moved-promptpay",data-settle="moved-credit"');
    ok(/recordBillSettlement(FromBox)?\('[^']+','moved','cash'\)/.test(h1), 'ปุ่มเงินสดไม่ส่งทางที่เลือก');   // ตรวจ 13 ต.ค. 2569 ข้อ 6: ปุ่มอ่านยอดจากช่องก่อน
    ok(!/data-settle="moved"/.test(h1) && !/คืน\/เก็บเงินจริงตอนนี้/.test(h1), 'ยังมีปุ่มแบบเดิมที่บันทึกตามช่องทางของบิล');
  });
  const msg = app.describeSettlementPlan(tx, app.billMoneyStatus(tx), 'moved', 'cash');
  await t('กล่องยืนยัน: คืนเงินสด ฿100 · คืนคนละทางกับบิล (โอน/QR) บันทึกส่วนต่างช่องทางให้ · เงินสดออกจากลิ้นชัก', () => {
    ok(/คืนเงินให้ลูกค้าแล้ว ฿100\.00 \(เงินสด\)/.test(msg), msg);
    ok(/คืนคนละทางกับช่องทางของบิล — ระบบบันทึกส่วนต่างระหว่างช่องทาง \(เงินสด \+฿100\.00 · โอน\/QR −฿100\.00\)/.test(msg), msg);
    ok(/เงินสด ฿100\.00 ออกจากลิ้นชักของกะที่เปิดอยู่ตอนนี้/.test(msg), msg);
  });
  ok(await app.recordBillSettlement(tx.id, 'moved', 'cash'), 'คืนเงินสดไม่สำเร็จ');
  const cur = app.state.transactions.find(x => x.id === tx.id);
  const raw = (await env.raw('transactions')).find(x => x.id === tx.id);
  await t('ลงเครื่อง: คืนเงินสด −100 (กะนี้) + ส่วนต่างช่องทาง (waive · swap · via=cash · จดยอดตอนกด) · บิลครบ · ลิ้นชักคาด 900', () => {
    eq(raw.settlements.map(x => [x.kind, x.method, x.amount, !!x.swap]), [['refund', 'cash', -100, false], ['waive', 'cash', 100, true], ['waive', 'promptpay', -100, true]]);
    ok(raw.settlements.filter(x => x.swap).every(x => x.via === 'cash' && JSON.stringify(x.due) === JSON.stringify([{ method: 'promptpay', amount: 400 }])), JSON.stringify(raw.settlements));
    ok(app.billMoneyStatus(cur).settled); eq(expected(app), 900);
  });
  const h2 = box(env, app, tx.id);
  await t('ประวัติบนหน้าบิล: คืนเงินสด + "ส่วนต่างระหว่างช่องทาง · เงินสด +100 · โอน/QR −100" บรรทัดเดียว', () => {
    ok(/คืนเงิน · เงินสด -฿100\.00/.test(h2), h2);
    ok(/ส่วนต่างระหว่างช่องทาง \(คืน\/เก็บคนละทางกับบิล — ไม่มีเงินเคลื่อนไหวเพิ่ม\) · เงินสด \+฿100\.00 · โอน\/QR -฿100\.00/.test(h2), h2);
    eq((h2.match(/ส่วนต่างระหว่างช่องทาง/g) || []).length, 1);
  });
  P0(app).showThermalReceipt.call(app, cur);
  const rc = String(env.document.getElementById('thermal-receipt-preview').innerHTML);
  await t('ใบเสร็จพิมพ์ซ้ำ: มีบรรทัด "คืนเงิน (เงินสด)" · ไม่มีบรรทัดส่วนต่างช่องทาง (เรื่องบัญชีภายใน)', () => {
    ok(/คืนเงิน \(เงินสด\)/.test(rc), rc); ok(!/ส่วนต่างที่ไม่ได้/.test(rc), rc);
  });
  const log = app.state.editLog[app.state.editLog.length - 1];
  await t('ประวัติแก้บิล (editLog): จดทางที่เลือก + ติดป้ายส่วนต่างช่องทาง', () => {
    eq(log.via, 'cash'); eq(log.settlements.map(x => !!x.swap), [false, true, true]);
  });
  // แก้บิลอีกรอบหลังคืนคนละทาง → ส่วนต่างช่องทางหมดผล (เหมือน waive) · เงินที่คืนจริงยังอยู่
  await editBill(env, tx.id, { discount: 0 });
  await t('แก้บิลอีกรอบ (เอาส่วนลดออก): ส่วนต่างช่องทางหมดผล · คืนเงินสดจริงยังนับ · ส่วนต่างคิดใหม่จากเงินจริง', () => {
    const st = app.billMoneyStatus(app.state.transactions.find(x => x.id === tx.id));
    eq(st.inactive.length, 2); eq(st.settlements.map(x => x.kind), ['refund']);
    eq(st.diffs, [{ method: 'cash', amount: 100 }]);   // บิล 500 โอน · ได้โอน 500 · คืนเงินสดไป 100 → ลูกค้าต้องคืนเงินสด 100 (หรือบันทึกตามจริง)
  });
  env.dispose();

  // ไม่มีกะเปิด: คืนทางเงินสด = ต้องเปิดกะก่อน · คืนทางโอน = ได้ (ไม่แตะลิ้นชัก) แม้ส่วนต่างของบิลเป็นเงินสด
  const S = Date.now() - 7200e3;
  const A = BILL('TX-1790000000021-NOSHIFTV', S, 300, { tender: { method: 'cash', amount: 300, received: 300, change: 0, at: S, shiftStart: S } });
  const B = BILL('TX-1790000000022-ZERONETV', S, 300, { tender: { method: 'cash', amount: 300, received: 300, change: 0, at: S, shiftStart: S } });
  const s2 = await makeShop({ rows: { transactions: [A, B], shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  await editBill(s2.env, A.id, { discount: 100 });
  await editBill(s2.env, B.id, { payment: 'promptpay' });
  const t0 = s2.toasts.length;
  const rCash = await s2.app.recordBillSettlement(A.id, 'moved', 'cash');
  await t('ไม่มีกะเปิด: คืนทางเงินสด → ไม่บันทึก + บอกให้เปิดกะก่อน', () => {
    eq(rCash, false); ok(s2.toasts.slice(t0).some(x => /ต้องเปิดกะก่อน/.test(x.m)), JSON.stringify(s2.toasts.slice(t0)));
    ok(!s2.app.billMoneyStatus(s2.app.state.transactions.find(x => x.id === A.id)).settled);
  });
  const rPP = await s2.app.recordBillSettlement(A.id, 'moved', 'promptpay');
  await t('ไม่มีกะเปิด: คืนทางโอน (ส่วนต่างของบิลเป็นเงินสด) → บันทึกได้ · บิลครบ · ไม่มีรายการลิ้นชัก', async () => {
    eq(rPP, true); ok(s2.app.billMoneyStatus(s2.app.state.transactions.find(x => x.id === A.id)).settled);
    const sh = await s2.env.raw('shift'); ok(!sh.cashAdjustments || !sh.cashAdjustments.length, JSON.stringify(sh.cashAdjustments));
  });
  const t1 = s2.toasts.length;
  const h3 = box(s2.env, s2.app, B.id);
  const rZero = await s2.app.recordBillSettlement(B.id, 'moved', 'cash');
  await t('ยอดรวมครบแล้ว ต่างแค่ช่องทาง (แก้เงินสด→โอน): ไม่มีคำถาม "ทางไหน" · ไม่มีปุ่มแยกช่องทาง (บิลช่องทางเดียว) · กดเลือกทางไม่บันทึก + บอกปุ่มที่ใช้ได้', () => {
    ok(!/ทางไหน\?/.test(h3), h3); ok(!/data-settle="moved"/.test(h3), h3); ok(/data-settle="correction"/.test(h3) && /data-settle="waive"/.test(h3), h3);
    eq(rZero, false); ok(s2.toasts.slice(t1).some(x => /ต่างกันแค่ช่องทาง/.test(x.m)), JSON.stringify(s2.toasts.slice(t1)));
    eq((s2.app.state.transactions.find(x => x.id === B.id).settlements || []).length, 0);
  });
  // ระหว่างกล่องยืนยันค้างอยู่ กะถูกปิด (เครื่องเดียวกัน อีกหน้าต่าง) → ด่านจริงในตัวบันทึกต้องปฏิเสธคืนทางเงินสด
  {
    const s3 = await makeShop();
    await settle();
    const c = await checkout(s3.env, H500, 'promptpay', 500);
    await editBill(s3.env, c.id, { discount: 100 });
    const ask = s3.app.askConfirm;
    s3.app.askConfirm = async (m) => { s3.app.state.shift.active = false; return true; };
    const r = await s3.app.recordBillSettlement(c.id, 'moved', 'cash');
    s3.app.askConfirm = ask;
    await t('กะถูกปิดระหว่างรอยืนยัน → คืนทางเงินสดไม่ถูกบันทึก (ด่านในตัวบันทึก)', () => {
      eq(r, false); eq((s3.app.state.transactions.find(x => x.id === c.id).settlements || []).length, 0);
    });
    s3.env.dispose();
  }
  await t('ช่องทางที่ไม่รู้จัก / ส่งทางให้ปุ่มอื่น → ไม่บันทึก', async () => {
    eq(await s2.app.recordBillSettlement(B.id, 'moved', 'split'), false);
    eq(await s2.app.recordBillSettlement(B.id, 'waive', 'cash'), false);
    eq((s2.app.state.transactions.find(x => x.id === B.id).settlements || []).length, 0);
  });
  s2.env.dispose();
});

await section('[12.14] ผู้ตรวจอิสระ (ตัวเลือกทาง): ยกเลิกบิลที่คืนคนละทางไว้ · แก้บิลอีกรอบหลังคืนคนละทาง', async () => {
  const run = async (o) => {
    const { env, app } = await makeShop(o.shop || {});
    await settle();
    const tx = await checkout(env, H500, o.pay, 500);
    await editBill(env, tx.id, { discount: 100 });
    ok(await app.recordBillSettlement(tx.id, 'moved', o.via), 'คืนไม่สำเร็จ');
    if (o.closeAndReopen) {   // บิลขายในกะก่อน → ปิดกะ (นับเงินตรง) แล้วเปิดกะใหม่
      await closeShift(app, env);
      app.state.shift = Object.assign({}, app.state.shift, { active: true, startTime: Date.now(), startCash: 1000, expenses: [] });
      delete app.state.shift.cashAdjustments;
    }
    const before = expected(app);
    const text = app.planVoidCash(app.state.transactions.find(x => x.id === tx.id), 'refunded').text;
    env.document.getElementById('edit-tx-id').value = tx.id;
    env.document.getElementById('void-money-outcome').value = 'refunded';
    await app.voidTransaction(); await app._confirmP; await settle(40);
    const r = { gone: !app.state.transactions.some(x => x.id === tx.id), delta: expected(app) - before, text };
    env.dispose();
    return r;
  };
  // V1: ลูกค้าโอน 500 · ทอนส่วนลดเงินสด 100 · ยกเลิก "คืนเงินแล้ว" = โอนคืน 400 → ลิ้นชักไม่เปลี่ยนอีก (เดิม: ถือว่าเงินสด 100 กลับเข้าลิ้นชัก → ขาด 100)
  const v1 = await run({ pay: 'promptpay', via: 'cash', shop: { cash: { 500: 1, 100: 4 } } });
  await t('V1 บิลโอนที่ทอนเงินสดไปแล้ว ยกเลิก "คืนเงินแล้ว": ลิ้นชักไม่เปลี่ยน (คืนลูกค้าตามยอด/ช่องทางของบิล) · กล่องยืนยันบอกตรง', () => {
    ok(v1.gone); eq(v1.delta, 0); ok(/ไม่กระทบลิ้นชัก \(บิลนี้คืน\/เก็บคนละทางไว้แล้ว — คืนลูกค้าตามยอดและช่องทางของบิล\)/.test(v1.text), v1.text);
  });
  // V2: ลูกค้าจ่ายเงินสด 500 · คืนส่วนลดทางโอน 100 · ยกเลิก = คืนเงินสด 400 (เดิม: หักเงินสด 500 → เกิน 100)
  const v2 = await run({ pay: 'cash', via: 'promptpay' });
  await t('V2 บิลเงินสดที่คืนส่วนลดทางโอนไปแล้ว ยกเลิก "คืนเงินแล้ว": เงินสดออก 400 (ไม่ใช่ 500)', () => {
    ok(v2.gone); eq(v2.delta, -400); ok(/เงินสด ฿400\.00 ออกจากลิ้นชัก/.test(v2.text), v2.text);
  });
  // V3: เหมือน V2 แต่บิลขายในกะก่อน (เดิม: −500)
  const v3 = await run({ pay: 'cash', via: 'promptpay', closeAndReopen: true });
  await t('V3 บิลกะก่อน (เงินสด · คืนส่วนลดทางโอนแล้ว) ยกเลิก "คืนเงินแล้ว": เงินสดออก 400 ในกะนี้', () => {
    ok(v3.gone); eq(v3.delta, -400); ok(/บันทึกเงินสดคืน ฿400\.00/.test(v3.text), v3.text);
  });
  // แก้บิลอีกรอบหลังคืนคนละทาง: บิลโอน 500 ทอนเงินสด 100 แล้วเพิ่มส่วนลดเป็น 200 → ร้านต้องคืนอีก 100 (สุทธิ)
  {
    const { env, app } = await makeShop({ cash: { 500: 1, 100: 3 } });   // ลิ้นชักจริง 800 (ทอนเงินสด 100 + อีก 100)
    await settle();
    const tx = await checkout(env, H500, 'promptpay', 500);
    await editBill(env, tx.id, { discount: 100 });
    ok(await app.recordBillSettlement(tx.id, 'moved', 'cash'), 'คืนรอบแรกไม่สำเร็จ');
    await editBill(env, tx.id, { discount: 200 });
    const cur = app.state.transactions.find(x => x.id === tx.id);
    Object.getPrototypeOf(app).renderEditMoneyBox.call(app, cur);
    const html = env.document.getElementById('edit-tx-money-box').innerHTML;
    await t('ข้อความส่วนต่างบอกยอดสุทธิก่อน: "สุทธิ ร้านต้องคืนลูกค้า ฿100" · ไม่มีปุ่มแยกช่องทาง (กดตามตัวเลขรายช่องทาง = ลิ้นชักผิด 200) · ถาม "คืนทางไหน" ฿100', () => {
      ok(/สุทธิ ร้านต้องคืนลูกค้า ฿100\.00 — แยกตามช่องทาง:/.test(html), html);
      ok(!/data-settle="moved"/.test(html), html);
      ok(/คืนเงินให้ลูกค้าจริงตอนนี้ ฿100\.00 — คืนทางไหน\?/.test(html), html);
      ok(/^สุทธิ ร้านต้องคืนลูกค้า ฿100\.00/.test(app.describeMoneyDiffs(app.billMoneyStatus(cur).diffs)));
    });
    ok(await app.recordBillSettlement(tx.id, 'moved', 'cash'), 'คืนรอบสองไม่สำเร็จ');
    const h = await closeShift(app, env);
    await t('คืนเงินสดอีก 100 → บิลครบ · ปิดกะ ควรมี 800 · ขาด/เกิน 0', () => {
      ok(app.billMoneyStatus(app.state.transactions.find(x => x.id === tx.id)).settled);
      eq([h.expectedCash, h.countedCash, h.difference], [800, 800, 0]);
    });
    env.dispose();
  }
});

await section('[12.11] บิลถูกแก้กลับด้วยรุ่นเก่า (ช่วงถอยรุ่น) → "ไม่มีเงินเคลื่อนไหว" หมดผลจากยอดที่จดไว้ตอนกด (due)', async () => {
  // รุ่นเก่าไม่รู้จักตราหมดผล (supersededAt) — แก้บิลแล้วรายการส่วนต่างติดมาเดิม · ด่านเดียวที่เหลือคือ due
  // (ลองกับโค้ด v63 จริงแล้ว: ถอยไปแก้ส่วนลดกลับ → กลับมารุ่นใหม่ บิลต้อง "ครบ" ไม่ใช่ "เก็บเพิ่ม 100")
  const { env, app } = await makeShop({ cash: { 1000: 1, 500: 1 } });   // ลิ้นชักจริง 1,500 (ไม่มีเงินเคลื่อนไหวจริง)
  await settle();
  const tx = await checkout(env, H500, 'cash', 500);
  const sold = clone(app.state.transactions.find(x => x.id === tx.id));
  await editBill(env, tx.id, { discount: 100 });
  ok(await app.recordBillSettlement(tx.id, 'waive'), 'waive ไม่สำเร็จ');
  const cur = app.state.transactions.find(x => x.id === tx.id);
  // แบบที่รุ่นเก่าแก้ส่วนลดกลับเป็น 0: เงินของบิลกลับเป็นแบบตอนขาย · รายการส่วนต่างเดิมติดมา ไม่มีตราหมดผล
  const byOld = Object.assign(clone(sold), { settlements: clone(cur.settlements), rev: (Number(cur.rev) || 1) + 1 });
  app.state.transactions = app.state.transactions.map(x => (x.id === tx.id ? byOld : x));
  const w = byOld.settlements[0];
  await t('รายการ "ไม่มีเงินเคลื่อนไหว" ที่กดในรุ่นใหม่จดยอดตอนกดไว้ (due ฿400) และยังไม่มีตราหมดผล', () =>
    ok(w.kind === 'waive' && !(Number(w.supersededAt) > 0) && JSON.stringify(w.due) === JSON.stringify([{ method: 'cash', amount: 400 }]), JSON.stringify(w)));
  await t('บิลกลับเป็น 500 → รายการเดิมหมดผล · บิลครบ · ไม่ขึ้นในรายการค้างบันทึก (ถ้าไม่มีด่านนี้ จะบอกให้เก็บเงินลูกค้าเพิ่ม 100)', () => {
    const st = app.billMoneyStatus(byOld);
    ok(st.settled, JSON.stringify(st.diffs)); eq(st.inactive.length, 1);
    ok(!app.listUnsettledBills().some(x => x.billId === tx.id), 'ยังขึ้นในรายการค้างบันทึก');
  });
  const h = await closeShift(app, env);
  await t('ปิดกะ: ควรมี 1,500 · นับได้ 1,500 · ขาด/เกิน 0', () => eq([h.expectedCash, h.countedCash, h.difference], [1500, 1500, 0]));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[13] นาฬิกาเครื่องย้อนหลังระหว่างกะ');
// ═══════════════════════════════════════════════════════════════════════════
await section('[13.1] ออกบิลไม่ได้เมื่อเวลาเครื่องอยู่ก่อนเวลาเปิดกะ', async () => {
  const start = Date.now() + 10 * 60e3;   // = เครื่องถูกตั้งเวลาย้อนไป 10 นาทีก่อนเวลาเปิดกะ
  const { env, app, toasts } = await makeShop({ rows: { shift: { active: true, startTime: start, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  readyCheckout(env, null, 'cash', 300);
  const n0 = app.state.transactions.length, t0 = toasts.length;
  await app.processCheckout(); await settle(30);
  await t('ด่านจริง (processCheckout): ไม่ออกบิล + บอกให้ตั้งเวลาเครื่อง', () => {
    eq(app.state.transactions.length, n0);
    ok(toasts.slice(t0).some(x => /เวลาของเครื่องย้อนไปก่อนเวลาเปิดกะ/.test(x.m)), JSON.stringify(toasts.slice(t0)));
  });
  app.state.cart = [{ uniqueCartId: 'u0', id: 's1', name: 'ตัดผม', price: 300, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', category: 'barber' }];
  const t1 = toasts.length;
  app.openCheckoutModal();
  await t('ปุ่มชำระเงิน: ไม่เปิดหน้าชำระเงิน + ข้อความเดียวกัน', () =>
    ok(toasts.slice(t1).some(x => /เวลาของเครื่องย้อนไปก่อนเวลาเปิดกะ/.test(x.m)), JSON.stringify(toasts.slice(t1))));
  app.state.cart = [];
  env.dispose();
});

await section('[13.2] ยอม 2 นาที (เครื่องปรับเวลาอัตโนมัติ)', async () => {
  const start = Date.now() + 60e3;
  const { env, app } = await makeShop({ rows: { shift: { active: true, startTime: start, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  const tx = await checkout(env, null, 'cash', 300);
  await t('เวลาเครื่องช้ากว่าเวลาเปิดกะ 1 นาที → ขายได้ และนับเข้าลิ้นชักกะนี้', () => {
    ok(tx && Number(tx.tender.shiftStart) === start, 'ไม่ได้บิล'); eq(expected(app), 1300);
  });
  env.dispose();
});

await section('[13.3] บิลอยู่กะไหน = รหัสกะในบิล (ไม่ใช่เวลาของบิล)', async () => {
  const S = Date.now() - 3600e3;
  const A = BILL('TX-1790000000010-CLOCKBKA', S - 20 * 60e3, 300, { tender: { method: 'cash', amount: 300, received: 300, change: 0, at: S - 20 * 60e3, shiftStart: S } });
  const B = BILL('TX-1790000000011-OTHERSHB', S + 10 * 60e3, 200, { tender: { method: 'cash', amount: 200, received: 200, change: 0, at: S + 10 * 60e3, shiftStart: S - 864e5 } });
  const C = BILL('TX-1790000000012-LEGACYCC', S + 5 * 60e3, 100);   // บิลรุ่นก่อน (ไม่มีรหัสกะ) = ใช้เวลาของบิล
  const { env, app } = await makeShop({ rows: { transactions: [A, B, C],
    shift: { active: true, startTime: S, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  await t('ลิ้นชัก: นับบิลที่รหัสกะตรง (A 300 แม้เวลาบิลอยู่ก่อนเปิดกะ) + บิลรุ่นก่อนตามเวลา (C 100) · ไม่นับบิลของกะอื่น (B 200) = 1,400', () =>
    eq(expected(app), 1400));
  const msg = app.buildShiftReportMessage({ startTime: S, endTime: Date.now(), closedBy: 'เจ้าของร้าน', startCash: 1000, expenses: [], cashCounted: 1400 });
  await t('Telegram ปิดกะ: ยอดขาย ฿400 (บิล A + C · ไม่ใช่ B)', () => ok(/ยอดขายรวม \(สุทธิ\): ฿400/.test(msg), msg.slice(0, 500)));
  await t('ยกเลิกบิล A: นับว่าเป็นบิลของกะนี้ (เงินสด 300 ออกจากลิ้นชัก) · บิล B ไม่ใช่', () => {
    const pa = app.planVoidCash(app.state.transactions.find(x => x.id === A.id), 'refunded');
    const pb = app.planVoidCash(app.state.transactions.find(x => x.id === B.id), 'refunded');
    eq([pa.inShift, pa.cashEffect, pb.inShift], [true, -300, false]);
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[14] ชีตไม่รับสรุป (งานถูกหยุดส่ง) → ป้ายห้ามขึ้น "ตรงกัน"');
// ═══════════════════════════════════════════════════════════════════════════
await section('[14]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const seen = [];
  app.updateSyncBadgeStatus = (status, n) => seen.push([status, n]);
  app.state.cloudOutbox = [{ id: 'job-sum-1', kind: 'summary_refresh', dateKey: app.getBusinessISODate(Date.now()), tries: 1,
    retry: { summary: { tries: 1, lastTry: Date.now(), firstFailAt: Date.now(), nextAt: Date.now() + 30e3, lastError: 'ข้อมูลสรุปไม่ถูกต้อง', stopped: 'INVALID_SUMMARY' } } }];
  app.checkSyncStatus();
  await t('งานสรุปที่ถูกหยุดส่งนับเป็นงานค้าง → ป้าย "stuck" ไม่ใช่ "synced"', () => eq(seen[seen.length - 1], ['stuck', 1]));
  app.state.cloudOutbox = [];
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] จำนวนงานของพนักงานไม่นับสินค้า (หน้ารายงาน · ตารางพนักงาน · ชีต)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[1]', async () => {
  const shop = await shopWith();
  const { app } = shop;
  const a = await sell(shop, ['s1', 'p2', 'p2', 'p2', 'p2', 'p2'], { staff: { s1: 'st-1', p2: 'st-1' } });
  const b = await sell(shop, ['p2'], { staff: { p2: 'mg-1' } });   // คนที่ขายแต่สินค้า
  ok(a.tx && b.tx, 'ขายไม่ครบ ' + JSON.stringify([a.toasts, b.toasts]));
  const key = app.getBusinessISODate(a.tx.date);
  const p = app.buildSummaryPayload(app.state.transactions, [], 'day', key);
  const row = n => p.staffCommissions.find(x => x.name === n);
  await t('ชีต: เอ "จำนวนงาน" 1 (ไม่ใช่ 6) · ค่าคอมยังรวมเบียร์ 30 + 50 = 80', () => eq([row('เอ').count, row('เอ').commission], [1, 80]));
  await t('ชีต: บี ขายแต่สินค้า ยังอยู่ในตาราง (งาน 0 · ค่าคอม 10) — ค่าคอมไม่หาย', () => ok(row('บี') && row('บี').count === 0 && row('บี').commission === 10, JSON.stringify(p.staffCommissions)));
  // ตรวจ 13 ต.ค. 2569 ข้อ 22: เพิ่ม productCount (Apps Script รุ่นเก่าไม่อ่านช่องนี้ — สร้างแถวจากช่องที่รู้จักเท่านั้น)
  await t('ชีต: โครงข้อมูล = ช่องเดิม + productCount (ตรวจ 13 ต.ค. 2569)', () => eq(Object.keys(row('เอ')).sort(), ['commission', 'count', 'name', 'productCount', 'role', 'salesSum']));
  loginAs(app, 'owner');
  let r = reportsScreen(shop, key, 'st-1');
  await t('หน้ารายงานเลือก เอ: "1 งาน · 5 สินค้า"', () => eq(r.count, '1 งาน · 5 สินค้า'));
  r = reportsScreen(shop, key, 'all');
  await t('ตารางพนักงาน: เอ "1 งาน · 5 สินค้า" · บี "0 งาน · 1 สินค้า"', () => {
    const flat = r.commission.replace(/\s+/g, ' ');
    ok(/เอ[\s\S]*?1 งาน · 5 สินค้า/.test(flat) && /บี[\s\S]*?0 งาน · 1 สินค้า/.test(flat), flat.slice(0, 600));
  });
  shop.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] บิลรุ่นก่อนมีธงสินค้า: เดาเป็นสินค้าได้เฉพาะรายการที่เป็นสินค้าอยู่แล้วตอนขาย');
// ═══════════════════════════════════════════════════════════════════════════
await section('[2.1] ตั้งสินค้าชื่อตรงกับบริการเก่าที่เปลี่ยนชื่อไปแล้ว', async () => {
  const old = Date.now() - 20 * 864e5;
  const oldBill = BILL('TX-1790000000020-KASAIOLD', old, 1500, { services: ['Kasai'],
    details: [LINE({ name: 'Kasai', price: 1500, netPrice: 1500, commission: 0, commissionAmount: 0 })] });
  const shop = await shopWith({ rows: { transactions: [oldBill] } });
  const { env, app } = shop; const d = env.document;
  app.state.editingServiceId = null;
  fillForm(d, { type: 'product', name: 'Kasai', price: '50', cost: '20' });
  await app.addService(); await settle(20);
  const prod = app.state.services.find(s => s.name === 'Kasai');
  ok(prod && Number(prod.productSince) > old, 'เพิ่มสินค้าไม่สำเร็จ/ไม่จดเวลาเริ่มเป็นสินค้า');
  const tx = app.state.transactions.find(x => x.id === oldBill.id);
  await t('บิลบริการเก่า "Kasai" ไม่ขึ้นในการ์ดสินค้า · ตัวนับงานยังนับเป็นบริการ', () => {
    eq(app.buildProductReport([tx]).rows.length, 0);
    eq([app.billUnitSplit(tx).services, app.billUnitSplit(tx).products], [1, 0]);
  });
  // บิลที่ขายระหว่างถอยไปใช้รุ่นก่อน (ไม่มีธง) หลังจากสร้างสินค้าแล้ว — ยังนับเป็นสินค้า
  const later = BILL('TX-1790000000021-ROLLBACK', Date.now(), 50, { services: ['Kasai'],
    details: [LINE({ name: 'Kasai', price: 50, netPrice: 50, staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] });
  await t('บิลไม่มีธงที่ขายหลังสร้างสินค้า (เช่นช่วงถอยรุ่น) ยังนับเป็นสินค้า', () => eq(app.buildProductReport([later]).rows.map(x => x.qty), [1]));
  loginAs(app, 'owner');
  const rk = reportsScreen(shop, app.getBusinessISODate(tx.date), 'all');
  await t('หน้ารายงานวันเก่า: บริการฮิต = Kasai (ไม่ถูกตัดออกเพราะคิดว่าเป็นสินค้า)', () => eq(rk.popular, 'Kasai'));
  await t('สรุปที่ส่งขึ้นชีตของวันเก่า: งาน "Kasai" ยังนับเป็นงานบริการของพนักงาน (1 งาน)', () => {
    const p = app.buildSummaryPayload([tx], [], 'day', app.getBusinessISODate(tx.date));
    eq(p.staffCommissions.filter(x => x.name === 'เอ').map(x => x.count), [1]);
  });
  const isoOld = Object.assign(clone(oldBill), { id: 'TX-1790000000023-KASAIISO', date: new Date(old).toISOString() });
  await t('วันที่บิลเป็นข้อความ ISO ก็ตัดสินแบบเดียวกัน (ไม่ใช่สินค้า)', () => eq(app.buildProductReport([isoOld]).rows.length, 0));
  env.dispose();
});

await section('[2.2] เปลี่ยนบริการเป็นสินค้าทีหลัง', async () => {
  const waxId = SERVICES[3].id;
  const oldWax = BILL('TX-1790000000022-WAXOLDXX', Date.now() - 30 * 864e5, 150, { services: ['แว็กซ์'],
    details: [LINE({ name: 'แว็กซ์', price: 150, netPrice: 150, commissionAmount: 15 })] });
  const shop = await shopWith({ rows: { transactions: [oldWax] } });
  const { env, app } = shop; const d = env.document;
  const mid = await sell(shop, [waxId], { staff: { [waxId]: 'st-1' } });   // ขายตอนยังเป็นบริการ (ธง isProduct:false)
  ok(mid.tx, 'ขายแว็กซ์ไม่สำเร็จ');
  // เจ้าของเปลี่ยนเป็นสินค้า — ต้องถามยืนยันก่อน (เคยขายแล้ว 2 รายการ)
  app.askConfirm = async (m) => { app._lastAskMsg = m; return false; };
  app.editService(waxId); d.getElementById('serv-type').value = 'product'; app.applyServiceTypeUI();
  d.getElementById('serv-category').value = 'barber'; d.getElementById('serv-commission').value = '0';
  await app.addService(); await settle(20);
  await t('กดยกเลิกที่กล่องยืนยัน → ไม่เปลี่ยนชนิด · ข้อความบอกว่าเคยขาย 2 รายการ', () => {
    eq(app.state.services.find(s => s.id === waxId).type, 'service');
    ok(/เคยขายไปแล้ว 2 รายการ/.test(app._lastAskMsg), app._lastAskMsg);
  });
  app.askConfirm = async (m) => { app._lastAskMsg = m; return true; };
  app.editService(waxId); d.getElementById('serv-type').value = 'product'; app.applyServiceTypeUI();
  d.getElementById('serv-category').value = 'barber'; d.getElementById('serv-commission').value = '0';
  await app.addService(); await settle(20);
  const wax = app.state.services.find(s => s.id === waxId);
  ok(wax.type === 'product' && Number(wax.productSince) > 0, 'เปลี่ยนชนิดไม่สำเร็จ');
  const after = await sell(shop, [waxId]);
  ok(after.tx, 'ขายหลังเปลี่ยนไม่สำเร็จ');
  const txs = [oldWax.id, mid.tx.id, after.tx.id].map(id => app.state.transactions.find(x => x.id === id));
  await t('ประวัติไม่ขาดช่วง: ก่อนเปลี่ยน (บิลเก่าไม่มีธง + บิลที่ติดธงบริการ) = บริการ · หลังเปลี่ยน = สินค้า 1 ชิ้น', () => {
    eq(app.buildProductReport(txs).rows.map(x => [x.name, x.qty]), [['แว็กซ์', 1]]);
    eq(txs.map(x => app.billUnitSplit(x).products), [0, 0, 1]);
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] บิลที่ไม่นับเป็นการมาใช้บริการ ไม่จดรหัสลูกค้า (ถอยรุ่นแล้วยกเลิกบิลไม่ทำให้จำนวนครั้งลด)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[3]', async () => {
  const shop = await shopWith();
  const { app } = shop;
  const water = await sell(shop, ['p1'], { customer: 'c-1' });
  const mixed = await sell(shop, ['s1', 'p1'], { customer: 'c-1', staff: { s1: 'st-1' } });
  ok(water.tx && mixed.tx, 'ขายไม่ครบ');
  await t('บิลน้ำล้วน: ไม่มีรหัสลูกค้า แต่ชื่อลูกค้ายังอยู่ · จำนวนครั้งไม่เพิ่ม', () =>
    eq([water.tx.customerId, water.tx.customerName], [null, 'ลูกค้าทอง']));
  await t('บิลที่มีบริการ: จดรหัสลูกค้า · นับครั้ง (5 → 6)', () =>
    eq([mixed.tx.customerId, app.state.customers[0].visitCount], ['c-1', 6]));
  shop.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] ค่าคอมแบบบาทต่อชิ้นห้ามเกินราคา');
// ═══════════════════════════════════════════════════════════════════════════
await section('[5]', async () => {
  const shop = await shopWith();
  const { env, app, toasts } = shop; const d = env.document;
  const add = async (v) => { app.state.editingServiceId = null; fillForm(d, v); const n = app.state.services.length, t0 = toasts.length; await app.addService(); await settle(20); return { n: app.state.services.length - n, msgs: toasts.slice(t0).map(x => x.m) }; };
  const r1 = await add({ type: 'product', name: 'ลูกอม', price: '5', comm: '10', ctype: 'fixed' });
  await t('ลูกอม 5 บาท ค่าคอม 10 บาท/ชิ้น → ไม่บันทึก + บอกเหตุ', () => { eq(r1.n, 0); ok(r1.msgs.some(m => /มากกว่าราคา/.test(m)), JSON.stringify(r1.msgs)); });
  await t('ค่าคอมเท่าราคาพอดี → บันทึกได้', async () => eq((await add({ type: 'product', name: 'ลูกอมใหญ่', price: '10', comm: '10', ctype: 'fixed' })).n, 1));
  await t('แบบ % ไม่ติดกฎนี้ (10% ของ 5 บาท)', async () => eq((await add({ type: 'product', name: 'ลูกอมเล็ก', price: '5', comm: '10', ctype: 'percent' })).n, 1));
  await t('บริการก็ใช้กฎเดียวกัน (ค่าคอม 500 บาท กับราคา 300)', async () => eq((await add({ type: 'service', name: 'นวดสั้น', price: '300', duration: '30', comm: '500', ctype: 'fixed' })).n, 0));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] ใบเสร็จ: * ที่รายการคิด VAT · ป้ายรวมตามชนิด · "คนขาย" ของสินค้า');
// ═══════════════════════════════════════════════════════════════════════════
await section('[6]', async () => {
  const shop = await shopWith();
  const { env, app } = shop; const P = Object.getPrototypeOf(app);
  const m = await sell(shop, ['s1', 'p1', 'p2'], { staff: { s1: 'st-1', p2: 'st-1' } });
  ok(m.tx && m.tx.vatAmount > 0, 'ไม่ได้บิลที่มี VAT');
  P.showThermalReceipt.call(app, m.tx);
  const rc = String(env.document.getElementById('thermal-receipt-preview').innerHTML);
  await t('ใบเสร็จ: น้ำเปล่า (หมวดคิด VAT) มี * · ตัดผม/เบียร์ไม่มี · มีหมายเหตุ "* = รายการที่คิด VAT"', () => {
    ok(/น้ำเปล่า \*/.test(rc) && !/ตัดผม \*/.test(rc) && !/เบียร์ \*/.test(rc) && /\* = รายการที่คิด VAT/.test(rc), rc.replace(/\s+/g, ' ').slice(0, 700));
  });
  await t('ใบเสร็จ: ป้าย "รวมค่าบริการ/สินค้า:" · เบียร์ขึ้น "คนขาย:" · ตัดผม "ผู้ดูแล:"', () => {
    ok(/รวมค่าบริการ\/สินค้า:/.test(rc) && (rc.match(/คนขาย:/g) || []).length === 1 && (rc.match(/ผู้ดูแล:/g) || []).length === 1, rc.replace(/\s+/g, ' ').slice(0, 700));
  });
  const w = await sell(shop, ['p1']);
  P.showThermalReceipt.call(app, w.tx);
  const rw = String(env.document.getElementById('thermal-receipt-preview').innerHTML);
  await t('บิลสินค้าล้วน: "รวมค่าสินค้า:"', () => ok(/รวมค่าสินค้า:/.test(rw), rw.replace(/\s+/g, ' ').slice(0, 400)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7] ชื่อซ้ำ: สระอำ/วรรณยุกต์สลับลำดับ · อักษรล่องหน · แตะบันทึกสองครั้ง');
// ═══════════════════════════════════════════════════════════════════════════
await section('[7]', async () => {
  const shop = await shopWith({ onLine: false });
  const { env, app } = shop; const d = env.document;
  const add = async (name) => { app.state.editingServiceId = null; fillForm(d, { type: 'product', name, price: '25', cat: 'drinks' }); const n = app.state.services.length; await app.addService(); await settle(20); return app.state.services.length - n; };
  await t('"น" + "ำ" + "้" + "เปล่า" (หน้าตาเหมือน "น้ำเปล่า") → ซ้ำ ไม่บันทึก', async () => eq(await add('น\u0E33\u0E49เปล่า'), 0));
  await t('สระอำแยกสองตัว (นิคหิต + สระอา) → ซ้ำ ไม่บันทึก', async () => eq(await add('น\u0E49\u0E4D\u0E32เปล่า'), 0));
  await t('มีอักษรล่องหนต่อท้าย → ซ้ำ ไม่บันทึก', async () => eq(await add('น้ำเปล่า\u200B'), 0));
  app.state.services.push({ id: 'zw1', type: 'product', name: 'ชาเย็น\u200B', price: 30, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed' });
  await t('ชื่อเดิมในเครื่องมีอักษรล่องหน (ข้อมูลเก่า) แล้วพิมพ์ชื่อเดียวกันแบบปกติ → ซ้ำ ไม่บันทึก', async () => eq(await add('ชาเย็น'), 0));
  await t('ชื่อใหม่ที่มีอักษรล่องหน → บันทึกโดยตัดอักษรล่องหนออก', async () => {
    eq(await add('โซดา\u200B'), 1); ok(app.state.services.some(s => s.name === 'โซดา'), 'ชื่อที่บันทึกยังมีอักษรล่องหน');
  });
  // แตะ "บันทึก" สองครั้ง ขณะคิวงานบันทึกยังไม่ว่าง
  app.state.editingServiceId = null; fillForm(d, { type: 'product', name: 'น้ำแร่', price: '25', cat: 'drinks' });
  let release;
  app.withMutation('งานเบื้องหลังจำลอง', () => new Promise(r => { release = r; }));
  const p1 = app.addService();
  await settle(5);
  fillForm(d, { type: 'product', name: 'น้ำแร่', price: '25', cat: 'drinks' });
  const p2 = app.addService();
  setTimeout(() => release(true), 30);
  await Promise.all([p1, p2]); await settle(40);
  await t('แตะบันทึกสองครั้งตอนคิวไม่ว่าง → ได้ "น้ำแร่" รายการเดียว', () => eq(app.state.services.filter(s => s.name === 'น้ำแร่').length, 1));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[8] ชื่อรายการเป็นตัวเลข (ไฟล์นำเข้าที่ถูกแก้มือ) ต้องไม่ทำให้หน้าพัง');
// ═══════════════════════════════════════════════════════════════════════════
await section('[8]', async () => {
  const shop = await shopWith();
  const { env, app } = shop; const P = Object.getPrototypeOf(app);
  const parsed = clone(app.buildBackupPayload ? app.buildBackupPayload() : { services: app.state.services });
  (parsed.services || []).push({ id: 'n7', type: 'product', name: 7, price: 10, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed' });
  app.sanitizeBackupData(parsed);
  await t('ไฟล์นำเข้า: ชื่อ 7 ถูกแปลงเป็นข้อความ "7"', () => eq(parsed.services.find(s => s.id === 'n7').name, '7'));
  // รายการในเครื่องที่ชื่อเป็นตัวเลข (ยังไม่ผ่านตัวล้างข้อมูล) + บรรทัดบิลของมัน — เรียงแถวการ์ดต้องไม่พัง
  app.state.services.push({ id: 'n7', type: 'product', name: 7, price: 10, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed' },
    { id: 'n8', type: 'product', name: 8, price: 10, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed' });
  const lines = [LINE({ name: 7, price: 10, netPrice: 10, isProduct: true, serviceId: 'n7', staffId: '', staffName: '', commission: 0, commissionAmount: 0 }),
    LINE({ name: 8, price: 10, netPrice: 10, isProduct: true, serviceId: 'n8', staffId: '', staffName: '', commission: 0, commissionAmount: 0 })];
  let err = null;
  try { app.buildProductReport([BILL('TX-1790000000030-NUMNAMEX', Date.now(), 20, { details: lines })]); } catch (e) { err = e; }
  await t('การ์ดสินค้า: บรรทัดชื่อตัวเลขไม่ทำให้พัง', () => eq(err, null));
  app.state.services.push({ id: 'n9', type: 'product', name: 9, price: 10, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed' });
  app.state.serviceSearch = '9';
  err = null;
  try { P.renderPos.call(app); } catch (e) { err = e; }
  await t('ช่องค้นหาหน้าขาย: รายการชื่อตัวเลขไม่ทำให้พัง', () => eq(err, null));
  app.state.serviceSearch = '';
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[9] การ์ดสินค้า: * ที่กำไรประมาณ · สินค้าที่ไม่อยู่ในรายการแล้ว · แถวชื่อซ้ำ');
// ═══════════════════════════════════════════════════════════════════════════
await section('[9]', async () => {
  const shop = await shopWith();
  const { app } = shop;
  const est = BILL('TX-1790000000040-ESTCOSTX', Date.now(), 20, { details: [LINE({ name: 'น้ำเปล่า', price: 20, netPrice: 20, isProduct: true, serviceId: 'p1', staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] });
  const gone = BILL('TX-1790000000041-GONEPROD', Date.now(), 10, { details: [LINE({ name: 'หมากฝรั่ง', price: 10, netPrice: 10, isProduct: true, serviceId: 'deleted-1', staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] });
  const dupA = BILL('TX-1790000000042-DUPCOKEA', Date.now(), 30, { details: [LINE({ name: 'โค้ก', price: 30, netPrice: 30, isProduct: true, serviceId: 'k1', unitCost: 12, staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] });
  const dupB = BILL('TX-1790000000043-DUPCOKEB', Date.now(), 25, { details: [LINE({ name: 'โค้ก', price: 25, netPrice: 25, isProduct: true, serviceId: 'k2', unitCost: 10, staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] });
  app.state.services.push({ id: 'k1', type: 'product', name: 'โค้ก', price: 30, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed', cost: 12 },
    { id: 'k2', type: 'product', name: 'โค้ก', price: 25, duration: 0, category: 'barber', commission: 0, commissionType: 'fixed', cost: 10 });
  app.state.transactions.push(est, gone, dupA, dupB);
  loginAs(app, 'owner');
  const r = reportsScreen(shop, app.getBusinessISODate(Date.now()), 'all');
  const flat = r.products.replace(/\s+/g, ' ');
  await t('แถวที่ใช้ต้นทุนประมาณ: ช่องกำไรมี * ด้วย', () => ok(/น้ำเปล่า[\s\S]*?฿8\.00\*[\s\S]*?฿12\.00\*/.test(flat), flat.slice(0, 900)));
  await t('สินค้าที่ไม่อยู่ในรายการแล้ว: ชื่อแถวบอกชัด · หมายเหตุบอกว่าใส่ต้นทุนย้อนหลังไม่ได้ (ไม่สั่งให้ไปใส่)', () => {
    ok(/หมากฝรั่ง · ไม่อยู่ในรายการสินค้าแล้ว/.test(flat), flat.slice(0, 900));
    ok(/ใส่ย้อนหลังไม่ได้/.test(r.note) && !/ไม่ทราบต้นทุน 1 ชิ้น — ใส่ต้นทุนที่หน้าตั้งค่า/.test(r.note), r.note);
  });
  await t('สินค้าชื่อซ้ำจากข้อมูลเก่า: ต่อท้ายชื่อหมวดให้แยกได้', () => ok(/โค้ก \(เครื่องดื่ม\)/.test(flat) && /โค้ก \(ตัดผม\)/.test(flat), flat.slice(0, 900)));
  // ชื่อและหมวดเดียวกันด้วย (ผู้ตรวจอิสระ) → ต่อราคา
  app.state.services.push({ id: 'k3', type: 'product', name: 'โค้ก', price: 40, duration: 0, category: 'drinks', commission: 0, commissionType: 'fixed', cost: 15 });
  app.state.transactions.push(BILL('TX-1790000000044-DUPCOKEC', Date.now(), 40, { details: [LINE({ name: 'โค้ก', price: 40, netPrice: 40, isProduct: true, serviceId: 'k3', unitCost: 15, staffId: '', staffName: '', commission: 0, commissionAmount: 0 })] }));
  const r2 = reportsScreen(shop, app.getBusinessISODate(Date.now()), 'all');
  const flat2 = r2.products.replace(/\s+/g, ' ');
  await t('ชื่อและหมวดชนกันด้วย: ต่อท้ายราคาให้แยกได้', () => ok(/โค้ก \(เครื่องดื่ม · ฿30\)/.test(flat2) && /โค้ก \(เครื่องดื่ม · ฿40\)/.test(flat2), flat2.slice(0, 900)));
  shop.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[10] ข้อความบนจอเรียกสินค้าให้ถูก');
// ═══════════════════════════════════════════════════════════════════════════
await section('[10]', async () => {
  const shop = await shopWith();
  const { env, app } = shop; const d = env.document; const P = Object.getPrototypeOf(app);
  app.editService('p1');
  await t('หน้าต่างแก้ไขสินค้า: หัวเป็น "แก้ไขข้อมูลสินค้า"', () => eq(d.getElementById('service-modal-title').innerText, 'แก้ไขข้อมูลสินค้า'));
  d.getElementById('serv-type').value = 'service'; app.applyServiceTypeUI();
  await t('สลับเป็นบริการตอนแก้ → หัวเปลี่ยนเป็น "แก้ไขข้อมูลบริการ"', () => eq(d.getElementById('service-modal-title').innerText, 'แก้ไขข้อมูลบริการ'));
  app.state.editingServiceId = null;
  P.renderCategoryList.call(app);
  await t('รายการหมวด: นับบริการกับสินค้าแยกกัน (ตัดผม: 2 บริการ · 1 สินค้า)', () => ok(/2 บริการ · 1 สินค้าในหมวดนี้/.test(d.getElementById('settings-categories-list').innerHTML.replace(/\s+/g, ' ')),
    d.getElementById('settings-categories-list').innerHTML.replace(/\s+/g, ' ').slice(0, 500)));
  app.showConfirm = (msg) => { app._lastConfirmMsg = msg; };
  app.deleteService('p1');
  await t('ยืนยันลบ: เรียกเป็น "สินค้า" พร้อมชื่อ', () => eq(app._lastConfirmMsg, 'ยืนยันการลบสินค้า "น้ำเปล่า" ออกจากระบบใช่หรือไม่?'));
  env.dispose();
});

R.done();
})();
