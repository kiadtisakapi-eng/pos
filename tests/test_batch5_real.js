// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 5 (ข้อ 15, 16, 17, 19) — ตรวจความตรงกันกับชีตครบทุกช่อง · เงินที่รับจริงกับส่วนต่างหลังแก้บิล
//  · แก้บิลเก่าโดยไม่สร้างค่าคอมจากกติกาปัจจุบัน · เครื่องหลักเครื่องเดียว (บังคับที่ Apps Script)
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ใน vm)
//  ไม่ stub ฟังก์ชันที่กำลังพิสูจน์ — ที่แทนมีแค่ "หน้าจอ" (toast/วาดหน้า/กล่องยืนยัน/ช่องกรอกรหัสเจ้าของ)
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, failPutForKeys, createEnv } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv, quiet } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 5: ตรวจกับชีตครบช่อง · เงินรับจริง/ส่วนต่าง · แก้บิลเก่า · เครื่องหลัก ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const d = (s) => new Date(s).getTime();
const snapshotDb = async (env) => { const all = await env.rawAll(); delete all.session; return JSON.stringify(all); };
const rawTx = async (env, id) => (await env.raw('transactions')).find(x => x.id === id);
const expected = (app) => app.computeShiftDrawer(app.state.shift).expected;

// ออกบิลผ่านหน้าชำระเงินจริง (ตะกร้า → เปิดหน้าชำระ → ยืนยัน)
async function checkout(env, items, pay, received, discount) {
  readyCheckout(env, items, pay, received);
  if (discount != null) {
    env.document.getElementById('cart-discount').value = String(discount);
    if (env.app.beginCheckoutAttempt) env.app.beginCheckoutAttempt();
  }
  await env.app.processCheckout();
  await settle(30);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}

// หน้าต่างแก้บิล: เปิด → กรอกช่อง → (เลือกผู้ให้บริการ) → กดบันทึก
async function editBill(env, txId, o) {
  const app = env.app;
  app.openTransactionEdit(txId);
  if (o.customer !== undefined) env.document.getElementById('edit-tx-customer').value = o.customer;
  if (o.payment !== undefined) env.document.getElementById('edit-tx-payment').value = o.payment;
  if (o.discount !== undefined) env.document.getElementById('edit-tx-discount').value = String(o.discount);
  const staff = o.staff || {};
  const orig = env.document.querySelectorAll;
  env.document.querySelectorAll = (sel) => /edit-tx-service-staff-select/.test(String(sel))
    ? Object.keys(staff).map(i => ({ value: staff[i], getAttribute: (k) => (k === 'data-index' ? String(i) : null) }))
    : orig(sel);
  try { await app.saveTransactionEdit(); } finally { env.document.querySelectorAll = orig; }
  await settle(30);
}

// เปิดแอปใหม่บนเครื่องเดิม (ฐานข้อมูลเดิม ไม่ seed ทับ)
async function reopen(shop) {
  shop.env.dispose();
  const env = createEnv({ fetch: shop.gas.fetch, factory: shop.env.factory });
  quiet(env.app);
  await env.app.init();
  loginAs(env.app, 'owner');
  return { env, app: env.app, gas: shop.gas };
}

// บิลรุ่นเก่า (ก่อนระบบ VAT/รายการย่อย) และบิลที่มีรายการย่อย สำหรับเตรียมข้อมูลในเครื่อง
const LINE = (o) => Object.assign({ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ',
  commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber', vatable: false }, o || {});
const VATBILL = (id, total, o) => Object.assign({ id, date: Date.now() - 5 * 3600e3, customerName: 'x', services: ['ตัดผม'],
  details: [LINE({ price: total, netPrice: total, commissionAmount: Math.round(total * 10) / 100 })],
  subtotal: total, discount: 0, vatRate: 7, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total,
  cashReceived: total, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' }, o || {});

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[15.1] ตรวจความตรงกัน: เทียบทุกช่อง (ลูกค้า/ช่องทาง/พนักงาน/…) ไม่ใช่แค่เลขที่บิล+ยอด');
// ═══════════════════════════════════════════════════════════════════════════
await section('[15.1-15.2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;   // ช่องกรอกรหัสเจ้าของบนหน้าจอ — ตอบแทนเจ้าของ
  const tx = await checkout(env, null, 'cash', 300);
  await app.syncPendingTransactions(true); await settle(60);
  const mk = app.getBusinessMonthKey(tx.date);
  const grid = gas.sheet(mk)._grid;
  const ri = grid.findIndex(r => String(r[0]).replace(/^'/, '') === tx.id);
  await t('(เงื่อนไข) บิลขึ้นชีตแล้ว', () => ok(ri > 0, 'ไม่พบแถวบิลบนชีต'));
  await app.runCloudReconcile();
  await t('(ตัวควบคุม) ยังไม่มีใครแก้อะไร → ไม่พบความต่าง', () => { eq(app._reconcile.mismatch.length, 0); eq(app._reconcile.extra.length, 0); });

  grid[ri][2] = 'คนอื่น'; grid[ri][4] = 'Scan (QR)'; grid[ri][12] = 'บี';   // มีคนแก้แถวในชีตด้วยมือ — ยอดเท่าเดิม
  await app.runCloudReconcile();
  const m = app._reconcile.mismatch.find(x => x.id === tx.id);
  await t('ยอดเท่ากันแต่ลูกค้า/ช่องทางจ่าย/พนักงานต่าง → รายงานเป็นความต่างรายช่อง (เดิมถือว่าตรงกัน)', () => {
    ok(m, 'ไม่ถูกรายงาน'); eq(m.fields.map(x => x.field).sort(), ['customer', 'payment', 'staff']); });

  console.log('\n[15.2] แถวซ้ำของบิลเดียวกันบนชีต ต้องถูกแจ้ง ไม่ถูกกลบเหลือแถวเดียว');
  grid[ri][2] = 'ลูกค้าทั่วไป (Walk-in)'; grid[ri][4] = 'เงินสด'; grid[ri][12] = 'เอ';
  grid.push(grid[ri].slice());     // แถวซ้ำ (เช่นคัดลอกด้วยมือ/คำขอซ้ำก่อนมีระบบกันซ้ำ)
  await app.runCloudReconcile();
  const dup = (app._reconcile.duplicates || []).find(x => x.id === tx.id);
  await t('แถวซ้ำถูกแจ้งครบทั้ง 2 แถว', () => { ok(dup, 'ไม่ถูกแจ้ง'); eq(dup.rows.length, 2); });
  await t('แถวซ้ำไม่ถูกเสนอเป็น "บิลเกิน/ยอดต่าง" ที่มีปุ่มลบ/ส่งทับ', () => {
    ok(!app._reconcile.extra.some(x => x.id === tx.id)); ok(!app._reconcile.mismatch.some(x => x.id === tx.id)); });
  await t('ผลตรวจบนหน้าจอไม่ขึ้นว่า "ตรงกัน"', () =>
    ok(!/ข้อมูลในเครื่องกับบนชีตตรงกัน/.test(env.els['reconcile-body'].innerHTML), env.els['reconcile-body'].innerHTML.slice(0, 300)));
  env.dispose();
});

console.log('\n[15.3] เดือนที่มีบิล "เฉพาะบนชีต" (ไม่มีในเครื่อง) ต้องถูกตรวจด้วย');
await section('[15.3-15.4]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;
  const JUL = 'TX-1751600000000-CLOUDJUL';
  const r = gas.post({ action: 'transaction', id: JUL, date: d('2026-07-05T12:00:00+07:00'), monthKey: '07-2026',
    dateTimeStr: '2026-07-05 12:00:00', customerName: 'x', services: ['ตัดผม'], subtotal: 300, discount: 0,
    nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, revEpoch: 0 });
  await t('(เงื่อนไข) ชีตมีบิลเดือน 07-2026 ที่เครื่องนี้ไม่มี', () => eq(r.status, 'success', JSON.stringify(r)));
  await app.runCloudReconcile();
  const res = app._reconcile;
  await t('เดือนที่มีเฉพาะบนชีตถูกรวมในการตรวจ และบิลในเดือนนั้นถูกแจ้งเป็นบิลเกินบนชีต', () => {
    ok(res.cloudOnlyMonths.includes('07-2026'), JSON.stringify(res.cloudOnlyMonths));
    ok(res.months.includes('07-2026')); ok(res.extra.some(x => x.id === JUL)); });
  await t('หน้าจอบอกขอบเขตที่ตรวจ รวมเดือนที่มีเฉพาะบนชีต', () =>
    ok(/เดือนที่มีเฉพาะบนชีต[^<]*07-2026/.test(env.els['reconcile-body'].innerHTML), env.els['reconcile-body'].innerHTML.slice(0, 400)));

  console.log('\n[15.4] เดือนที่แถวเกินที่อ่านได้ในรอบเดียว → บอกว่าอ่านได้กี่แถวจากเท่าไร และไม่สรุปว่าตรงกัน');
  const a = await checkout(env, null, 'cash', 300);
  await checkout(env, null, 'cash', 300);
  await app.syncPendingTransactions(true); await settle(60);
  gas.ctx.LIST_BILLS_MAX = 1;     // จำลองเดือนที่มีแถวมากกว่าที่อ่านได้ในรอบเดียว
  await app.runCloudReconcile();
  const mk = app.getBusinessMonthKey(a.date);
  const sc = app._reconcile.scope.find(x => x.monthKey === mk);
  await t('ขอบเขตตามจริง: อ่าน 1 จาก 2 แถว (ติดธงอ่านไม่ครบ)', () => { ok(sc, 'ไม่มีขอบเขตของเดือนนี้'); eq([sc.read, sc.total, sc.truncated], [1, 2, true]); });
  await t('หน้าจอบอก "อ่าน 1 จาก 2 แถว" และไม่ขึ้นว่าข้อมูลตรงกัน', () => {
    const html = env.els['reconcile-body'].innerHTML;
    ok(/อ่าน 1 จาก 2 แถว/.test(html), html.slice(0, 300)); ok(!/ข้อมูลในเครื่องกับบนชีตตรงกัน/.test(html)); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[16.0] (ทางเดียวกับผู้ใช้) แก้ส่วนลดบิลเงินสดย้อนหลังแล้วปิดกะ: ยอดที่ควรมี = เงินที่รับจริง ไม่ใช่ยอดหลังแก้');
// ═══════════════════════════════════════════════════════════════════════════
// ใช้แค่ทางที่มีในทุกรุ่น (ออกบิล → หน้าต่างแก้บิล → ปิดกะ) — พิสูจน์พฤติกรรมเดิมกับโค้ดก่อนแก้ได้ตรง ๆ
await section('[16.0]', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1, 100: 3 } });   // นับได้จริง 1,300 = ตั้งต้น 1,000 + รับ 300 (ไม่มีใครคืนเงิน)
  await settle();
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { discount: 100 });   // เจ้าของแก้ส่วนลดย้อนหลัง — ลูกค้าไปแล้ว ไม่ได้คืนเงิน
  app.cashCounterMode = 'close';
  await app.confirmCashCount(); await settle(60);
  const log = (await env.raw('shift')).history.slice(-1)[0];
  await t('ยอดที่ควรมี 1,300 · ผลต่าง 0 (เดิมคิด 1,200 แล้วฟ้อง "เงินเกิน 100" ทั้งที่ไม่มีการคืนเงิน)', () =>
    eq([log.expectedCash, log.difference], [1300, 0]));
  await t('ข้อความสรุปปิดกะเตือนว่ามีบิลที่แก้แล้วยังไม่บันทึกคืน/เก็บเงิน', () =>
    ok(/ยังไม่บันทึกคืน\/เก็บเงิน: 1 ใบ/.test(app.buildShiftReportMessage(log))));
  env.dispose();
});

console.log('\n[16.1] ออกบิล: เก็บ "เงินที่รับจริงตอนขาย" แยกจากยอดบิล');
// ═══════════════════════════════════════════════════════════════════════════
await section('[16.1-16.3]', async () => {
  const { env, app } = await makeShop();      // กะเปิดอยู่ เงินตั้งต้น 1,000
  await settle();
  const base = expected(app);
  const tx = await checkout(env, null, 'cash', 500);          // ยอด 300 รับ 500 ทอน 200
  const raw0 = await rawTx(env, tx.id);
  await t('ในเครื่องบันทึกเงินรับจริง: เงินสด 300 (รับ 500 ทอน 200)', () => {
    ok(raw0.tender, 'ไม่มีข้อมูลเงินรับจริง');
    eq([raw0.tender.method, raw0.tender.amount, raw0.tender.received, raw0.tender.change], ['cash', 300, 500, 200]); });
  await t('ลิ้นชักที่ควรมี = ตั้งต้น + 300', () => eq(expected(app), base + 300));

  console.log('\n[16.2] แก้ส่วนลดหลังรับเงิน (300 → 200): ระบบต้องไม่ถือเองว่าคืนเงินแล้ว');
  await editBill(env, tx.id, { discount: 100 });
  const raw1 = await rawTx(env, tx.id);
  await t('(เงื่อนไข) บิลถูกแก้เป็น 200 จริงในเครื่อง', () => eq(raw1.total, 200));
  await t('เงินที่ควรมีในลิ้นชักไม่ลดเอง (ยังนับ 300 ที่รับจริง — เดิมหักเหลือ 200 เหมือนคืนเงินแล้ว)', () => eq(expected(app), base + 300));
  await t('เงินรับจริงตอนขายไม่ถูกเขียนทับ (ยัง 300 · รับ 500 · ทอน 200)', () => {
    eq([raw1.tender.amount, raw1.tender.received, raw1.tender.change, raw1.cashReceived, raw1.cashChange], [300, 500, 200, 500, 200]); });
  await t('บิลอยู่ในรายการ "ส่วนต่างรอบันทึก": ร้านถือเงินเกินบิล 100 (เงินสด)', () => {
    const u = app.listUnsettledBills().find(x => x.billId === tx.id);
    ok(u, 'ไม่อยู่ในรายการ'); eq(u.diffs, [{ method: 'cash', amount: -100 }]); });
  Object.getPrototypeOf(app).showThermalReceipt.call(app, app.state.transactions.find(x => x.id === tx.id));
  const html = env.els['thermal-receipt-preview'].innerHTML;
  await t('ใบเสร็จพิมพ์ซ้ำ: บอกยอดชำระตอนขาย · เงินรับ/ทอนของตอนขาย · ส่วนต่างที่ยังค้าง', () => {
    ok(/ชำระตอนขาย/.test(html) && /เงินรับมา \(ตอนขาย\)/.test(html) && /ส่วนต่างที่ยังไม่ได้คืน\/เก็บ/.test(html), 'ใบเสร็จไม่บอก'); });

  console.log('\n[16.3] บันทึกว่าคืนเงินจริงตอนนี้ → เงินออกจากลิ้นชักของกะที่เปิดอยู่ (และมีร่องรอย)');
  loginAs(app, 'staff');
  const before = await snapshotDb(env);
  const r0 = await app.recordBillSettlement(tx.id, 'moved');
  await t('พนักงานบันทึกไม่ได้ · ข้อมูลในเครื่องไม่เปลี่ยน', async () => { eq(r0, false); eq(await snapshotDb(env), before); });
  loginAs(app, 'manager');   // เจ้าของสั่ง 23 ก.ย. 2569: ผู้จัดการบันทึกได้ (ยกเลิกบิลได้อยู่แล้ว)
  const r1 = await app.recordBillSettlement(tx.id, 'moved');
  await settle(20);
  const raw2 = await rawTx(env, tx.id);
  const sh2 = await env.raw('shift');
  await t('ผู้จัดการบันทึกสำเร็จ: บิลมีรายการ "คืนเงิน" เงินสด −100 ผูกกับกะที่เปิดอยู่', () => {
    eq(r1, true); eq(raw2.settlements.length, 1);
    const s = raw2.settlements[0]; eq([s.kind, s.method, s.amount, s.shiftStart], ['refund', 'cash', -100, sh2.startTime]); });
  await t('ลิ้นชักของกะนี้ลด 100 ตามเงินที่ออกจริง (บันทึกไว้ในกะด้วย ไม่ใช่แค่ในบิล)', () => {
    eq(sh2.cashAdjustments.map(a => [a.billId, a.amount]), [[tx.id, -100]]); eq(expected(app), base + 200); });
  await t('บิลไม่ค้างส่วนต่างแล้ว', () => ok(!app.listUnsettledBills().some(x => x.billId === tx.id)));
  await t('ประวัติการแก้บิลมีแถว "บันทึกเงินส่วนต่าง" พร้อมชื่อผู้ทำ (ผู้จัดการ)', async () => {
    const log = (await env.raw('editLog')).filter(e => e.billId === tx.id && e.kind === 'settlement');
    eq(log.length, 1); eq(log[0].by, 'บี'); });
  const r2 = await app.recordBillSettlement(tx.id, 'moved');
  await t('กดซ้ำ → ไม่บันทึกซ้ำ (ไม่มีส่วนต่างเหลือ)', async () => { eq(r2, false); eq((await rawTx(env, tx.id)).settlements.length, 1); });
  env.dispose();
});

console.log('\n[16.4] บันทึกส่วนต่างแล้วเขียนลงเครื่องไม่สำเร็จ → ไม่มีอะไรเปลี่ยน (ทั้งบิล ทั้งกะ)');
await section('[16.4]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { discount: 50 });
  const before = await snapshotDb(env);
  const undo = failPutForKeys(['transactions']);
  let r;
  try { r = await app.recordBillSettlement(tx.id, 'moved'); } finally { undo(); }
  await settle(20);
  await t('ในเครื่องไม่เปลี่ยน และในหน่วยความจำคืนค่าเดิม (ไม่มีเงินคืนค้างแบบครึ่ง ๆ)', async () => {
    eq(r, false); eq(await snapshotDb(env), before);
    eq(app.state.transactions.find(x => x.id === tx.id).settlements, undefined); eq(app.state.shift.cashAdjustments, undefined); });
  await t('ส่วนต่างยังค้างอยู่ให้บันทึกใหม่ได้', () => ok(app.listUnsettledBills().some(x => x.billId === tx.id)));
  env.dispose();
});

console.log('\n[16.5] ยืนยันค้างอยู่แล้วบิลถูกแก้อีกรอบ → ไม่บันทึกตัวเลขที่ไม่ตรงกับบิลแล้ว');
await section('[16.5]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { discount: 100 });              // ส่วนต่าง −100
  let release;
  app.askConfirm = () => new Promise(res => { release = res; });
  const p = app.recordBillSettlement(tx.id, 'moved');          // กล่องยืนยัน "คืน 100" ค้างอยู่
  await settle(10);
  await editBill(env, tx.id, { discount: 50 });               // ระหว่างนั้นแก้บิลอีกรอบ → ส่วนต่างเหลือ −50
  release(true);
  const r = await p;
  await t('ไม่บันทึกคืน 100 ทั้งที่ส่วนต่างเหลือ 50', async () => {
    eq(r, false); eq((await rawTx(env, tx.id)).settlements, undefined);
    eq(app.listUnsettledBills().find(x => x.billId === tx.id).diffs, [{ method: 'cash', amount: -50 }]); });
  env.dispose();
});

console.log('\n[16.6] ตอนขายกดเงินสดผิด (จริง ๆ สแกนจ่าย): แก้ช่องทาง + ยืนยัน "บันทึกผิด" → ลิ้นชักกะที่ขายไม่นับ');
await section('[16.6]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const base = expected(app);
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { payment: 'promptpay' });
  await t('แก้ช่องทางอย่างเดียว: ลิ้นชักยังนับ 300 (ระบบไม่เดาว่าเงินสดไม่เคยเข้า)', () => eq(expected(app), base + 300));
  await t('ส่วนต่างแยกช่องทาง: เงินสด −300 · โอน +300', () =>
    eq(app.listUnsettledBills().find(x => x.billId === tx.id).diffs, [{ method: 'cash', amount: -300 }, { method: 'promptpay', amount: 300 }]));
  const r = await app.recordBillSettlement(tx.id, 'correction');
  await t('ยืนยัน "ตอนขายบันทึกผิด" → ลิ้นชักกะนี้ (กะที่ขายบิล) ไม่นับ 300', () => { eq(r, true); eq(expected(app), base); });
  await t('บันทึกสองรายการตามช่องทาง และบิลไม่ค้างส่วนต่าง', async () => {
    const raw = await rawTx(env, tx.id);
    eq(raw.settlements.map(s => [s.kind, s.method, s.amount]), [['correction', 'cash', -300], ['correction', 'promptpay', 300]]);
    ok(!app.listUnsettledBills().some(x => x.billId === tx.id)); });
  env.dispose();
});

console.log('\n[16.7] บิลของกะก่อน (ขายก่อนมีระบบเงินรับจริง): แก้ครั้งแรกเก็บเงินรับจากยอดเดิม · แก้บันทึกไม่กระทบกะนี้');
await section('[16.7]', async () => {
  const OLD = 'TX-1790000000000-OLDSHIFT';
  const oldBill = VATBILL(OLD, 400);                        // ขายก่อนเปิดกะนี้ · ไม่มี tender (รุ่นก่อน)
  const { env, app } = await makeShop({ rows: { transactions: [oldBill] } });
  await settle();
  const base = expected(app);
  await t('(เงื่อนไข) บิลกะก่อนไม่อยู่ในลิ้นชักกะนี้', () => eq(base, 1000));
  await editBill(env, OLD, { payment: 'promptpay' });
  const raw = await rawTx(env, OLD);
  await t('แก้ครั้งแรก: เก็บเงินรับจริงจาก "ยอด/ช่องทางก่อนแก้" (เงินสด 400) ติดธงว่ามาจากบิลเดิม', () => {
    eq([raw.tender.method, raw.tender.amount, raw.tender.inferred], ['cash', 400, true]); eq(raw.paymentMethod, 'promptpay'); });
  const r = await app.recordBillSettlement(OLD, 'correction');
  const raw2 = await rawTx(env, OLD);
  await t('แก้บันทึกของบิลกะที่ปิดไปแล้ว → ไม่กระทบลิ้นชักกะนี้ (ไม่ผูกกะ)', () => {
    eq(r, true); eq(expected(app), base); ok(raw2.settlements.every(s => s.shiftStart === null)); eq(app.state.shift.cashAdjustments, undefined); });
  env.dispose();
});

console.log('\n[16.8] ไม่ได้คืนเงิน (ลูกค้าไปแล้ว): บันทึก "ไม่มีเงินเคลื่อนไหว" → ลิ้นชักไม่เปลี่ยน · ใบเสร็จบอกตามจริง');
await section('[16.8]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const base = expected(app);
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { discount: 100 });
  const r = await app.recordBillSettlement(tx.id, 'waive');
  await t('บันทึกได้ · ไม่ค้างส่วนต่าง · ลิ้นชักยังนับ 300 ที่รับจริง', () => {
    eq(r, true); ok(!app.listUnsettledBills().some(x => x.billId === tx.id)); eq(expected(app), base + 300); });
  Object.getPrototypeOf(app).showThermalReceipt.call(app, app.state.transactions.find(x => x.id === tx.id));
  await t('ใบเสร็จบอก "ส่วนต่างที่ไม่ได้คืน ฿100"', () => ok(/ส่วนต่างที่ไม่ได้คืน:[\s\S]*100\.00/.test(env.els['thermal-receipt-preview'].innerHTML)));
  env.dispose();
});

console.log('\n[16.9] ไม่มีกะเปิดอยู่: คืน/เก็บเงินสด "ตอนนี้" บันทึกไม่ได้ (เงินต้องเข้า/ออกลิ้นชักของกะ)');
await section('[16.9]', async () => {
  const E = 'TX-1790000000000-EDITEDAA';
  const edited = VATBILL(E, 200, { subtotal: 300, discount: 100, nonVatBase: 200, total: 200,
    details: [LINE({ price: 300, netPrice: 200, commissionAmount: 20 })],
    tender: { method: 'cash', amount: 300, received: 300, change: 0, at: Date.now() - 5 * 3600e3 } });
  const { env, app } = await makeShop({ rows: { transactions: [edited],
    shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } } });
  await settle();
  const before = await snapshotDb(env);
  const r0 = await app.recordBillSettlement(E, 'moved');
  await t('ไม่มีกะ → ปฏิเสธ และไม่มีอะไรเปลี่ยน', async () => { eq(r0, false); eq(await snapshotDb(env), before); });
  const r1 = await app.recordBillSettlement(E, 'waive');
  await t('"ไม่มีเงินเคลื่อนไหว" บันทึกได้แม้ไม่มีกะ (ไม่แตะลิ้นชัก)', async () => { eq(r1, true); eq((await rawTx(env, E)).settlements.length, 1); });
  env.dispose();
});

console.log('\n[16.10] ปิดกะ: ยอดที่ควรมี = รับจริง + คืน/เก็บที่บันทึก − ค่าใช้จ่าย · ประวัติกะ/ข้อความสรุปบอกส่วนต่าง');
await section('[16.10]', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1, 500: 1 } });   // นับได้จริง 1,500
  await settle();
  const a = await checkout(env, null, 'cash', 300);
  const b = await checkout(env, null, 'cash', 300);
  await editBill(env, a.id, { discount: 100 });     // a → 200
  await app.recordBillSettlement(a.id, 'moved');    // คืนเงินสด 100 จริง
  await editBill(env, b.id, { discount: 50 });      // b → 250 (ยังไม่บันทึกว่าคืนหรือไม่)
  app.cashCounterMode = 'close';
  await app.confirmCashCount();
  await settle(60);
  const sh = await env.raw('shift');
  const log = sh.history[sh.history.length - 1];
  await t('ประวัติกะ: ขายสด (รับจริง) 600 · คืนส่วนต่าง −100 · ควรมี 1,500 · นับได้ 1,500 · ผลต่าง 0', () => {
    eq([log.cashSales, log.cashAdjustTotal, log.expectedCash, log.countedCash, log.difference], [600, -100, 1500, 1500, 0]); });
  await t('ประวัติกะเก็บรายการคืนเงิน + บิลที่ยังค้างส่วนต่าง', () => {
    eq(log.cashAdjustments.map(x => x.billId), [a.id]); eq(log.unsettledCount, 1); eq(log.unsettledAdjustments[0].billId, b.id); });
  await t('ปิดกะแล้ว รายการคืนเงินของกะเก่าไม่ติดไปกะใหม่', () => eq(sh.cashAdjustments, undefined));
  const msg = app.buildShiftReportMessage(log);
  await t('ข้อความสรุปปิดกะบอกเงินคืนส่วนต่างและบิลที่ยังค้าง', () => {
    ok(/คืน\/เก็บเงินส่วนต่างที่บันทึกในกะ: -฿100/.test(msg), msg); ok(/ยังไม่บันทึกคืน\/เก็บเงิน: 1 ใบ/.test(msg), msg); });
  env.dispose();
});

console.log('\n[16.11] ยกเลิกบิลที่คืนส่วนต่างไปแล้วในกะเดียวกัน → หักลิ้นชักแค่ที่ยังค้าง (ไม่หักซ้ำ)');
await section('[16.11]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const base = expected(app);
  const tx = await checkout(env, null, 'cash', 300);
  await editBill(env, tx.id, { discount: 100 });
  await app.recordBillSettlement(tx.id, 'moved');       // คืน 100 แล้ว → ควรมี base+200
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';   // คืนเงินส่วนที่เหลือให้ลูกค้าแล้ว
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('(เงื่อนไข) บิลถูกยกเลิกจริง', async () => ok(!(await env.raw('transactions')).some(x => x.id === tx.id)));
  await t('ลิ้นชักกลับเป็นยอดตั้งต้น (จ่าย 300 − คืน 100 − คืนตอนยกเลิก 200 = 0) ไม่ติดลบ 100', () => eq(expected(app), base));
  await t('รายการคืน 100 ยังอยู่เป็นหลักฐาน (ติดธงกลับรายการเพราะยกเลิก)', async () => {
    const adj = (await env.raw('shift')).cashAdjustments; eq(adj.length, 1); ok(adj[0].reversedByVoid > 0); });
  env.dispose();
});

console.log('\n[16.12] กู้ไฟล์สำรองที่รายการคืนเงินของกะเสีย → แยกไปตรวจพร้อมค่าต้นฉบับ (ไม่นับเป็น 0)');
await section('[16.12]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const backup = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  backup.shift.cashAdjustments = [
    { id: 'stl-1', billId: 'TX-1790000000000-AAAAAAAA', kind: 'refund', amount: 'abc' },
    { id: 'stl-2', billId: 'TX-1790000000000-BBBBBBBB', kind: 'refund', amount: -50 }];
  await app.applyBackupData(backup);
  await settle(40);
  const q = (await env.raw('quarantine')).filter(x => x.reasons && x.reasons.includes('bad-cashAdjustment'));
  await t('รายการที่จำนวนเงินเสียถูกแยกไปตรวจพร้อมค่าต้นฉบับ', () => { eq(q.length, 1); eq(q[0].original.amount, 'abc'); });
  await t('รายการที่ดียังนับตามจริง (−50) ไม่ถูกทิ้งไปด้วย', async () => {
    eq((await env.raw('shift')).cashAdjustments.map(a => a.amount), [-50]); eq(app.computeShiftDrawer(app.state.shift).cashAdjustTotal, -50); });
  env.dispose();
});

console.log('\n[16.13] ยกเลิกบิล: ต้องระบุก่อนว่าเงินเคลื่อนไหวจริงไหม — ระบบไม่ถือเองว่าคืนเงินแล้ว');
await section('[16.13]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const base = expected(app);
  const a = await checkout(env, null, 'cash', 300);
  env.document.getElementById('edit-tx-id').value = a.id;
  env.document.getElementById('void-money-outcome').value = '';
  const snap = await snapshotDb(env);
  await app.voidTransaction(); await app._confirmP; await settle(30);
  await t('ยังไม่เลือกว่าเงินเคลื่อนไหวไหม → ไม่ยกเลิกให้ และไม่มีอะไรเปลี่ยน', async () => {
    eq(await snapshotDb(env), snap); eq(app.state.transactions.length, 1); });

  env.document.getElementById('void-money-outcome').value = 'none';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('เลือก "ไม่มีเงินเคลื่อนไหว" (บิลออกผิด/ซ้ำ) → บิลหาย แต่เงินสด 300 ยังนับอยู่ในลิ้นชัก', async () => {
    ok(!(await env.raw('transactions')).some(x => x.id === a.id));
    eq(expected(app), base + 300); });
  await t('ประวัติการยกเลิกบันทึกว่าเงินไม่ได้เคลื่อนไหว + ผลต่อลิ้นชัก', async () => {
    const v = (await env.raw('voidLog')).find(x => x.billId === a.id);
    eq([v.moneyOutcome, v.cashEffect], ['none', 0]);
    eq((await env.raw('shift')).cashAdjustments.filter(x => x.kind === 'void-keep').map(x => x.amount), [300]); });

  const b = await checkout(env, null, 'cash', 300);
  env.document.getElementById('edit-tx-id').value = b.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('เลือก "คืนเงินแล้ว" → เงินสด 300 ออกจากลิ้นชักตามจริง', () => eq(expected(app), base + 300));
  env.dispose();
});

console.log('\n[16.14] ยกเลิกบิลของกะที่ปิดไปแล้ว: คืนเงินวันนี้ = เงินออกจากลิ้นชักกะนี้ · ไม่คืน = ไม่กระทบ');
await section('[16.14]', async () => {
  const OLD1 = 'TX-1790000000000-VOIDOLD1', OLD2 = 'TX-1790000000000-VOIDOLD2';
  const { env, app } = await makeShop({ rows: { transactions: [VATBILL(OLD1, 400), VATBILL(OLD2, 500)] } });
  await settle();
  const base = expected(app);
  await t('(เงื่อนไข) บิลของกะก่อนไม่อยู่ในลิ้นชักกะนี้', () => eq(base, 1000));
  env.document.getElementById('edit-tx-id').value = OLD1;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('คืนเงินสด 400 ให้บิลของกะก่อน → ลิ้นชักกะนี้ลด 400 (เดิมไม่นับเลย)', async () => {
    eq(expected(app), base - 400);
    const adj = (await env.raw('shift')).cashAdjustments.filter(x => x.kind === 'void-refund');
    eq(adj.map(x => [x.billId, x.amount]), [[OLD1, -400]]); });
  env.document.getElementById('edit-tx-id').value = OLD2;
  env.document.getElementById('void-money-outcome').value = 'none';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('ยกเลิกอีกใบแบบไม่มีเงินเคลื่อนไหว → ลิ้นชักไม่เปลี่ยนเพิ่ม', () => eq(expected(app), base - 400));
  env.dispose();
});

console.log('\n[16.15] ยกเลิกตามสถานะบนชีต (ระบบสั่งเอง): เงินยังนับอยู่ในลิ้นชัก + ขึ้นเตือนตอนปิดกะ');
await section('[16.15]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-VOIDEDCL';
  gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: d('2026-09-10T12:00:00+07:00'), voidedAt: Date.now() });
  const bill = VATBILL(ID, 300, { date: Date.now() - 600e3, syncStatus: 'pending' });   // ขายในกะนี้
  const { env, app } = await makeShop({ gas, rows: { transactions: [bill] } });
  await settle(120);
  const base = 1000;
  await t('(เงื่อนไข) ชีตแจ้งว่าบิลถูกยกเลิกแล้ว → บิลรอตรวจ', async () => eq((await rawTx(env, ID)).syncStatus, 'conflict'));
  loginAs(app, 'owner');
  await app.resolveBillConflict(ID, 'void-local'); await settle(60);
  await t('ยกเลิกในเครื่องตามชีต → เงินสด 300 ยังนับอยู่ในลิ้นชัก (ไม่ถือเองว่าคืนเงินแล้ว)', async () => {
    ok(!(await env.raw('transactions')).some(x => x.id === ID));
    eq(expected(app), base + 300);
    eq((await env.raw('voidLog')).find(x => x.billId === ID).moneyOutcome, 'unknown'); });
  app.cashCounterMode = 'close';
  const calc = app.computeShiftDrawer(app.state.shift);
  app.renderClosingMoneyNotes(calc);
  await t('หน้าปิดกะเตือนว่ายังไม่ระบุว่าคืนเงินหรือไม่', () =>
    ok(/ยกเลิกตามสถานะบนชีต[\s\S]*ยังไม่ระบุ/.test(env.els['closing-money-notes'].innerHTML), env.els['closing-money-notes'].innerHTML.slice(0, 200)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[17.1] บิลเก่าไม่มีรายการย่อย: แก้ชื่อลูกค้า → ไม่สร้างรายการ/ราคา/ค่าคอมจากกติกาปัจจุบัน');
// ═══════════════════════════════════════════════════════════════════════════
await section('[17.1-17.2]', async () => {
  const L = 'TX-1750000000000-LEGACYNO';
  const legacy = { id: L, date: d('2026-07-10T12:00:00+07:00'), customerName: 'คุณเก่า', services: ['ตัดผม', 'น้ำ'],
    subtotal: 320, discount: 20, total: 300, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' };
  const { env, app } = await makeShop({ rows: { transactions: [legacy] } });
  await settle();
  await editBill(env, L, { customer: 'คุณเก่า (แก้ชื่อ)' });
  const raw = await rawTx(env, L);
  await t('ชื่อลูกค้าเปลี่ยน · ราคารวม/ส่วนลด/ยอดคงเดิม', () => { eq(raw.customerName, 'คุณเก่า (แก้ชื่อ)'); eq([raw.subtotal, raw.discount, raw.total], [320, 20, 300]); });
  await t('ไม่มีรายการย่อยที่สร้างเองถูกบันทึก (เดิม: ราคาวันนี้ + ค่าคอม 10% ถูกยัดลงบิลเก่า)', () => eq(raw.details, undefined));
  await t('แก้ข้อมูลทั่วไปไม่แตะเรื่องเงิน → ไม่มีเงินรับ/ส่วนต่างงอกมา', () => { eq(raw.tender, undefined); eq(raw.settlements, undefined); });

  console.log('\n[17.2] บิลเก่าไม่มีรายการย่อย: แก้ส่วนลด → คิดที่ระดับบิล (ราคารวม − ส่วนลด) ไม่สร้างรายการ');
  await editBill(env, L, { discount: 50 });
  const raw2 = await rawTx(env, L);
  await t('ยอดใหม่ 270 = 320 − 50 · ยังไม่มีรายการย่อย · ยังเป็นบิลรุ่นเก่า (ไม่มีช่อง VAT)', () => {
    eq([raw2.subtotal, raw2.discount, raw2.total], [320, 50, 270]); eq(raw2.details, undefined); eq(raw2.vatAmount, undefined); });
  await t('เงินรับจริงเก็บจากยอดก่อนแก้ (300) → ส่วนต่าง −30 รอบันทึก', () => {
    eq(raw2.tender.amount, 300); eq(app.listUnsettledBills().find(x => x.billId === L).diffs, [{ method: 'cash', amount: -30 }]); });
  env.dispose();
});

console.log('\n[17.3] บิลรุ่นแรกที่ปัดเศษรายบรรทัด: แก้ชื่อลูกค้า → รายการย่อย/ค่าคอมไม่ถูกคิดใหม่');
await section('[17.3]', async () => {
  const RL = 'TX-1751000000000-ROUNDLIN';
  const lines = [1, 2, 3].map(i => LINE({ name: 'a' + i, price: 100, netPrice: 66.67, commissionAmount: 6.67 }));
  const bill = { id: RL, date: d('2026-06-25T12:00:00+07:00'), customerName: 'x', services: ['a1', 'a2', 'a3'], details: lines,
    subtotal: 300, discount: 100, total: 200, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' };
  const { env } = await makeShop({ rows: { transactions: [bill] } });
  await settle();
  await editBill(env, RL, { customer: 'y' });
  const raw = await rawTx(env, RL);
  await t('(เงื่อนไข) ชื่อลูกค้าถูกแก้', () => eq(raw.customerName, 'y'));
  await t('รายการย่อยเหมือนเดิมทุกช่อง (เดิมเกลี่ยใหม่เป็น 66.67/66.67/66.66 และคิดค่าคอมใหม่)', () => eq(raw.details, lines));
  env.dispose();
});

console.log('\n[17.4] รายการที่ไม่ทราบอัตราค่าคอม: แก้ส่วนลด = ปฏิเสธ (ไม่คิดค่าคอมเป็น 0 เงียบ ๆ) · ย้ายผู้ให้บริการได้');
await section('[17.4]', async () => {
  const NR = 'TX-1752000000000-NORATEAA';
  const line = { name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commissionAmount: 45, category: 'barber' };
  const bill = { id: NR, date: d('2026-07-15T12:00:00+07:00'), customerName: 'x', services: ['ตัดผม'], details: [line],
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' };
  const { env, toasts } = await makeShop({ rows: { transactions: [bill] } });
  await settle();
  const before = await snapshotDb(env);
  await editBill(env, NR, { discount: 30 });
  await t('แก้ส่วนลดถูกปฏิเสธ · บิลไม่เปลี่ยน (ค่าคอม 45 ไม่กลายเป็น 0)', async () => {
    eq(await snapshotDb(env), before); ok(toasts.some(x => /ไม่ทราบอัตราค่าคอม/.test(x.m)), 'ไม่บอกเหตุผล'); });
  await editBill(env, NR, { staff: { 0: 'mg-1' } });
  const raw = await rawTx(env, NR);
  await t('ย้ายผู้ให้บริการได้ · ค่าคอม 45 และราคาหลังส่วนลดย้ายตามรายการไปทั้งจำนวน', () => {
    eq([raw.details[0].staffId, raw.details[0].staffName, raw.details[0].commissionAmount, raw.details[0].netPrice], ['mg-1', 'บี', 45, 300]);
    eq(raw.staffNames, ['บี']); });
  env.dispose();
});

console.log('\n[17.5] แก้ส่วนลดบิลเก่า: ค่าคอมใช้อัตราที่บิลล็อกไว้ (15%) ไม่ใช่อัตราปัจจุบัน (10%)');
await section('[17.5]', async () => {
  const OR = 'TX-1753000000000-OLDRATEA';
  const bill = VATBILL(OR, 300, { details: [LINE({ commission: 15, commissionAmount: 45 })] });
  const { env } = await makeShop({ rows: { transactions: [bill] } });
  await settle();
  await editBill(env, OR, { discount: 30 });
  const raw = await rawTx(env, OR);
  await t('ราคาหลังส่วนลด 270 · ค่าคอม 15% = 40.50 → ปัดเป็น 41 บาท (กติกาตัวเลข: ค่าคอมเป็นบาทเต็ม)', () => { eq(raw.total, 270); eq([raw.details[0].netPrice, raw.details[0].commissionAmount], [270, 41]); });
  env.dispose();
});

console.log('\n[17.6] บิลรุ่น VAT ที่ไม่มีรายการย่อย: แก้ส่วนลดไม่ได้ (คิดฐานภาษีใหม่ต้องเดา)');
await section('[17.6]', async () => {
  const VN = 'TX-1754000000000-VATNODET';
  const bill = VATBILL(VN, 300); delete bill.details;
  const { env } = await makeShop({ rows: { transactions: [bill] } });
  await settle();
  const before = await snapshotDb(env);
  await editBill(env, VN, { discount: 50 });
  await t('ปฏิเสธ · บิลไม่เปลี่ยน · ไม่มีรายการย่อยงอก', async () => eq(await snapshotDb(env), before));
  env.dispose();
});

console.log('\n[17.7] ส่วนลดที่ใช้ไม่ได้ (เกินราคา/ติดลบ/ไม่ใช่ตัวเลข) → ปฏิเสธ ไม่ปัดเป็นค่าอื่นเงียบ ๆ');
await section('[17.7]', async () => {
  const IV = 'TX-1755000000000-INVALIDD';
  const { env } = await makeShop({ rows: { transactions: [VATBILL(IV, 300)] } });
  await settle();
  const before = await snapshotDb(env);
  for (const v of ['400', '-50', 'abc']) {
    await editBill(env, IV, { discount: v });
    await t(`ส่วนลด "${v}" → บิลไม่เปลี่ยน (เดิม "400" ถูกปัดเป็นเต็มจำนวน ยอดบิลกลายเป็น 0)`, async () => eq(await snapshotDb(env), before));
  }
  env.dispose();
});

console.log('\n[17.8] กดบันทึกโดยไม่เปลี่ยนอะไร → ไม่แตะบิล (ไม่เพิ่มรุ่น ไม่ส่งซ้ำ ไม่มีประวัติการแก้ปลอม)');
await section('[17.8]', async () => {
  const NC = 'TX-1756000000000-NOCHANGE';
  const { env } = await makeShop({ rows: { transactions: [VATBILL(NC, 300)] } });
  await settle();
  const before = await snapshotDb(env);
  await editBill(env, NC, {});
  await t('ข้อมูลในเครื่องเหมือนเดิมทุกไบต์', async () => eq(await snapshotDb(env), before));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[19.1] สองเครื่องต่อชีตเดียวกัน: สรุปรับจากเครื่องหลักเท่านั้น · บิลรายใบส่งได้ทุกเครื่อง');
// ═══════════════════════════════════════════════════════════════════════════
await section('[19.1-19.3]', async () => {
  const gas = createGasEnv();
  const A = await makeShop({ gas });
  const B = await makeShop({ gas });
  await settle();
  await t('(เงื่อนไข) สองเครื่องมีรหัสเครื่องของตัวเอง', () => { ok(A.app.deviceId && B.app.deviceId); ok(A.app.deviceId !== B.app.deviceId); });
  const ta = await checkout(A.env, null, 'cash', 300);
  A.app.enqueueSummaryRefresh(ta.date); await A.app.flushCloudOutbox(); await settle(60);
  const day = A.app.getBusinessISODate(ta.date);
  const summaryName = 'สรุป-' + day;
  await t('เครื่องแรกที่ส่งสรุปได้เป็นเครื่องหลัก (ลงทะเบียนที่ Apps Script)', () => {
    const p = JSON.parse(gas.props.POS_PRIMARY_DEVICE); eq(p.id, A.app.deviceId); ok(/^auto:/.test(p.how)); ok(gas.sheet(summaryName)); });
  const snap = JSON.stringify(gas.sheet(summaryName)._grid);

  const tb = await checkout(B.env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
  B.app.enqueueSummaryRefresh(tb.date); await B.app.flushCloudOutbox(); await settle(60);
  await t('สรุปจากเครื่อง B (เห็นแค่บิลของตัวเอง) ถูกปฏิเสธ — แท็บสรุปไม่ถูกทับ', () => {
    eq(JSON.stringify(gas.sheet(summaryName)._grid), snap);
    ok(gas.requests.some(r => r && r.action === 'summary_day' && r.deviceId === B.app.deviceId), '(เงื่อนไข) B ไม่ได้ส่งจริง'); });
  await t('บิลรายใบของเครื่อง B ยังขึ้นชีตตามปกติ', async () => eq((await rawTx(B.env, tb.id)).syncStatus, 'synced'));
  await t('เครื่อง B รู้ตัว (บันทึกในเครื่อง) และพักงานสรุปไว้ในคิว ไม่ทิ้ง', async () => {
    eq((await B.env.raw('primaryStatus')).isPrimary, false); ok((await B.env.raw('cloudOutbox')).some(it => it.needSummary)); });
  const n0 = gas.requests.filter(r => r && r.action === 'summary_day').length;
  await B.app.flushCloudOutbox(); await B.app.flushCloudOutbox(); await settle(30);
  await t('งานที่พักไว้ไม่ถูกยิงซ้ำให้ถูกปฏิเสธเปล่า ๆ', () => eq(gas.requests.filter(r => r && r.action === 'summary_day').length, n0));

  console.log('\n[19.2] ไฟล์สำรองจากเครื่องที่ไม่ใช่เครื่องหลัก → ปฏิเสธ (ไม่ไปเบียดไฟล์ของเครื่องหลักตามกติกาเก็บไฟล์ล่าสุด)');
  const files = () => Object.values(gas.DriveApp._folders).reduce((n, f) => n + f._files.filter(x => !x._trashed).length, 0);
  const okA = await A.app.autoBackupToGoogleDrive({ silent: true });
  const f0 = files();
  const okB = await B.app.autoBackupToGoogleDrive({ silent: true });
  await t('(ตัวควบคุม) เครื่องหลักสำรองได้', () => { eq(okA, true); ok(f0 >= 1); });
  await t('เครื่อง B สำรองไม่ได้ · ไฟล์บน Drive ไม่เพิ่ม · สถานะสำรองบอกเหตุผลตามจริง', () => {
    eq(okB, false); eq(files(), f0); ok(/เครื่องหลัก/.test(B.app.backupStatus.lastMessage), B.app.backupStatus.lastMessage); });

  console.log('\n[19.3] ย้ายเครื่องหลักต้องใช้รหัสเจ้าของ (ตัดสินที่ Apps Script ไม่เชื่อ role ที่ส่งมา)');
  const key = gas.setupOwnerKey();
  const forged = gas.post({ action: 'claim_primary', deviceId: B.app.deviceId, role: 'owner', isOwner: true });
  await t('ส่งคำขอตรงพร้อมอ้างว่าเป็นเจ้าของ แต่ไม่มีรหัส → OWNER_KEY_REQUIRED · เครื่องหลักไม่เปลี่ยน', () => {
    eq(forged.code, 'OWNER_KEY_REQUIRED'); eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, A.app.deviceId); });
  B.app.askOwnerKey = async () => null;               // เจ้าของกดยกเลิกช่องกรอกรหัส
  const c0 = await B.app.claimPrimaryDevice();
  await t('กดยกเลิกช่องกรอกรหัส → ไม่ย้าย', () => { eq(c0, false); eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, A.app.deviceId); });
  loginAs(B.app, 'manager');
  const c1 = await B.app.claimPrimaryDevice();
  await t('ผู้จัดการกดตั้งเครื่องหลักไม่ได้ (สิทธิ์เจ้าของ)', () => { eq(c1, false); eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, A.app.deviceId); });
  loginAs(B.app, 'owner');
  B.app.askOwnerKey = async () => key;
  const c2 = await B.app.claimPrimaryDevice();
  await settle(80);
  await t('เจ้าของยืนยันด้วยรหัส → B เป็นเครื่องหลัก · งานสรุปที่พักไว้ถูกส่งทันที', async () => {
    eq(c2, true); eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, B.app.deviceId);
    ok(!(await B.env.raw('cloudOutbox')).some(it => it.needSummary), 'งานสรุปยังค้าง');
    ok(JSON.stringify(gas.sheet(summaryName)._grid) !== snap, 'แท็บสรุปไม่ถูกอัปเดต'); });
  A.app.enqueueSummaryRefresh(ta.date); await A.app.flushCloudOutbox(); await settle(60);
  await t('เครื่องหลักเดิม (A) ส่งสรุปไม่ได้แล้ว และรู้ตัว', () => eq(A.app.primaryStatus.isPrimary, false));
  A.env.dispose(); B.env.dispose();
});

console.log('\n[19.4] แอปรุ่นเก่า (ไม่ส่งรหัสเครื่อง): ยอมเฉพาะตอนยังไม่มีเครื่องหลัก · ข้อมูลเครื่องหลักเสีย = ปิดไว้ก่อน');
await section('[19.4]', async () => {
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas });
  await settle();
  const legacyPayload = () => { const p = app.buildSummaryPayload([], [], 'day', '2026-09-10'); delete p.deviceId; delete p.deviceLabel; delete p.secret; return p; };
  const r0 = gas.post(legacyPayload());
  await t('ยังไม่มีเครื่องหลัก → คำขอแบบเก่ายังรับ (ช่วงอัปเกรด) และไม่ลงทะเบียนใครเป็นเครื่องหลัก', () => {
    eq(r0.status, 'success', JSON.stringify(r0)); eq(gas.props.POS_PRIMARY_DEVICE, undefined); });
  app.enqueueSummaryRefresh(Date.now()); await app.flushCloudOutbox(); await settle(60);
  const r1 = gas.post(legacyPayload());
  await t('มีเครื่องหลักแล้ว → คำขอที่ไม่บอกรหัสเครื่องถูกปฏิเสธ NOT_PRIMARY_DEVICE', () => eq(r1.code, 'NOT_PRIMARY_DEVICE'));
  gas.props.POS_PRIMARY_DEVICE = '{เสีย';
  const r2 = gas.post(Object.assign(legacyPayload(), { deviceId: app.deviceId }));
  await t('ข้อมูลเครื่องหลักเสีย → ปฏิเสธทุกเครื่อง (ไม่เดาว่าใครเป็นเครื่องหลัก) และบอกวิธีแก้', () => {
    eq(r2.status, 'error'); ok(/POS_PRIMARY_DEVICE/.test(r2.message), r2.message); });
  const key = gas.setupOwnerKey();
  const r3 = gas.post({ action: 'claim_primary', deviceId: app.deviceId, deviceLabel: 'POS-TEST', ownerKey: key });
  const r4 = gas.post(Object.assign(legacyPayload(), { deviceId: app.deviceId }));
  await t('เจ้าของตั้งเครื่องหลักใหม่ด้วยรหัส → กลับมาส่งได้', () => { eq(r3.status, 'success', JSON.stringify(r3)); eq(r4.status, 'success', JSON.stringify(r4)); });
  env.dispose();
});

console.log('\n[19.5] รหัสเครื่องไม่อยู่ในไฟล์สำรอง: กู้ไฟล์ของเครื่องหลักลงอีกเครื่อง ไม่ได้สิทธิ์เครื่องหลักติดไปด้วย');
await section('[19.5]', async () => {
  const gas = createGasEnv();
  const A = await makeShop({ gas });
  const B = await makeShop({ gas });
  await settle();
  const payload = A.app.buildBackupPayload();
  await t('ไฟล์สำรองไม่มีรหัสเครื่อง', () => { ok(!JSON.stringify(payload).includes(A.app.deviceId)); eq(payload.deviceId, undefined); });
  const idB = B.app.deviceId;
  await B.app.applyBackupData(JSON.parse(JSON.stringify(payload)));
  await settle(40);
  await t('เครื่อง B หลังกู้ไฟล์ของ A ยังใช้รหัสเครื่องของ B (ในหน่วยความจำและในเครื่อง)', async () => {
    eq(B.app.deviceId, idB); eq(await B.env.raw('deviceId'), idB); });
  A.env.dispose(); B.env.dispose();
});

console.log('\n[19.6] เครื่องที่ถูกพักงานสรุป: เปิดแอปใหม่แล้วถามสถานะใหม่ — ถ้าไม่มีเครื่องหลักแล้วต้องกลับมาส่งได้เอง');
await section('[19.6]', async () => {
  const gas = createGasEnv();
  const A = await makeShop({ gas });
  let B = await makeShop({ gas });
  await settle();
  A.app.enqueueSummaryRefresh(Date.now()); await A.app.flushCloudOutbox(); await settle(60);
  B.app.enqueueSummaryRefresh(Date.now()); await B.app.flushCloudOutbox(); await settle(60);
  await t('(เงื่อนไข) B ถูกพักงานสรุป', () => eq(B.app.primaryStatus && B.app.primaryStatus.isPrimary, false));
  const idB = B.app.deviceId;
  delete gas.props.POS_PRIMARY_DEVICE;          // เจ้าของล้างการตั้งค่าเครื่องหลักบน Apps Script
  B = await reopen(B);
  await settle(150);
  await t('เปิดแอปใหม่: รหัสเครื่องเดิม · ถามสถานะแล้วปลดการพัก · ส่งสรุปที่ค้างสำเร็จ และได้เป็นเครื่องหลัก', async () => {
    eq(B.app.deviceId, idB); eq(B.app.primaryStatus.isPrimary, true);
    ok(!(await B.env.raw('cloudOutbox')).some(it => it.needSummary), 'งานสรุปยังค้าง');
    eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, idB); });
  A.env.dispose(); B.env.dispose();
});

R.done();
})();
