// ─────────────────────────────────────────────────────────────────────────────
//  ระบบขายสินค้า — เจ้าของสั่ง 8–9 ต.ค. 2569
//   กติกาที่เจ้าของเลือก:
//    · สินค้า = รายการในหน้า "บริการ" ชนิด 'product' (ข้อมูลเก่า: ระยะเวลา 0 นาที = สินค้า) — ทางคิดเงินเดียวกับบริการ
//    · ไม่มีสต็อก (นับมือ) · อยากรู้ว่าขายได้กี่ชิ้น · คิดกำไรต่อชิ้นได้ · บางชิ้นมีค่าคอม บางชิ้นไม่มี
//    · สินค้าค่าคอม 0 = ขายหน้าร้าน ไม่ต้องเลือกพนักงาน · สินค้ามีค่าคอม/บริการทุกชนิด ยังต้องเลือกคนเสมอ
//    · ผู้จัดการไม่เห็นต้นทุน/กำไร · ต้นทุนเป็นบาทเต็ม · ส่วนลดถูกเฉลี่ยไปที่สินค้าด้วย (ฐานเดียวกับค่าคอม)
//    · ต้นทุนจดลงบรรทัดบิล ณ ตอนขาย · ไม่ส่งขึ้นชีต (ลายนิ้วมือบิลไม่เปลี่ยน) · ต้นทุนแปลกไม่ทำให้บิลเสีย
//   ทุกหัวข้อขายผ่านทางเดินจริง (addToCart → processCheckout) บน IndexedDB จริง + Apps Script ในชีตจำลอง
//   พิสูจน์ว่าจับของจริง: POS_APP_SRC ชี้ไปโค้ดก่อนแก้ → ต้องตก (ดู tests/README.md)
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, loginAs, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ระบบขายสินค้า (8–9 ต.ค. 2569) ---');
const t = R.t;
const sat = n => Math.round(Number(n) * 100);
const clone = x => JSON.parse(JSON.stringify(x));
const fatal = (app, tx) => app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code);
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 120000) / 1000) + ' วินาที')), ms || 120000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};

// ร้านที่มีทั้งบริการและสินค้า (หมวด drinks คิด VAT 7% ตาม seed · barber ไม่คิด)
const SERVICES = [
  { id: 's1', type: 'service', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's0', type: 'service', name: 'นวดเจ้าของจ่ายเอง', price: 500, duration: 60, category: 'barber', commission: 0, commissionType: 'percent' },
  { id: 'p1', type: 'product', name: 'น้ำเปล่า', price: 20, duration: 0, category: 'barber', commission: 0, commissionType: 'percent', cost: 8 },
  { id: 'p2', type: 'product', name: 'เบียร์', price: 100, duration: 0, category: 'barber', commission: 10, commissionType: 'fixed', cost: 40 },
  { id: 'p3', type: 'product', name: 'ขนม', price: 50, duration: 0, category: 'barber', commission: 0, commissionType: 'percent', cost: null },
  // ข้อมูลเก่าก่อนมีช่องชนิด: 0 นาที = สินค้า
  { id: 'd1', name: 'น้ำ', price: 20, duration: 0, category: 'drinks', commission: 0, commissionType: 'percent' }
];

// ขายหนึ่งบิลผ่านทางเดินจริง · staff = { serviceId: staffId } · คืน { tx, queueAdded, toasts }
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
  const n0 = app.state.transactions.length, q0 = app.state.queue.length, t0 = toasts.length;
  await app.processCheckout(); await settle(40);
  const txs = app.state.transactions;
  return { tx: txs.length > n0 ? txs[txs.length - 1] : null, queueAdded: app.state.queue.length - q0,
    toasts: toasts.slice(t0).map(x => x.m) };
}
const shopWith = (o) => makeShop(Object.assign({ rows: { services: clone(SERVICES) } }, o || {}));
function sheetRow(gas, app, tx) {
  const sh = gas.sheet(app.getBusinessMonthKey(tx.date));
  if (!sh) return null;
  const head = sh._grid[0].map(h => String(h).trim());
  const row = sh._grid.slice(1).find(r => String(r[0]).trim() === tx.id);
  if (!row) return null;
  const out = {}; head.forEach((h, i) => { out[h] = row[i]; }); return out;
}

// ── ตัวช่วยของหัวข้อ [G] (ตรวจ 11 ต.ค. 2569 ข้อ 4): ขับหน้ารายงานจริง (filterReports) บนหน้าจอจำลอง ──
function reportsScreen(shop, dateKey, staffId) {      // drive the real reports screen (filterReports) on the fake DOM
  const { env, app } = shop; const P = Object.getPrototypeOf(app), d = env.document;
  app.filterReports = P.filterReports.bind(app); app.renderReportsChart = P.renderReportsChart.bind(app);
  d.getElementById('report-date-input').value = dateKey;
  d.getElementById('report-staff-filter').value = staffId || 'all';
  app.state.selectedReportType = 'daily';
  app.filterReports();
  const h = id => String(d.getElementById(id).innerHTML || ''), txt = id => String(d.getElementById(id).innerText || '');
  return { popular: txt('report-kpi-popular'), commission: h('report-commission-body'), products: h('report-products-body') };
}
const qtyOf = (html, name) => { const m = new RegExp(name + '</strong></td>\\s*<td>(\\d+) ชิ้น').exec(html); return m ? Number(m[1]) : 0; };

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[A] หน้าตั้งค่า: ชนิด บริการ/สินค้า + ต้นทุนต่อชิ้น');
// ═══════════════════════════════════════════════════════════════════════════
await section('[A]', async () => {
  const shop = await shopWith();
  const { env, app, toasts } = shop;
  const d = env.document;
  const fill = (v) => {
    d.getElementById('serv-type').value = v.type;
    d.getElementById('serv-name').value = v.name; d.getElementById('serv-price').value = v.price;
    d.getElementById('serv-duration').value = v.duration == null ? '' : v.duration;
    d.getElementById('serv-cost').value = v.cost == null ? '' : v.cost;
    d.getElementById('serv-category').value = 'barber';
    d.getElementById('serv-commission').value = v.comm == null ? '0' : v.comm;
    d.getElementById('serv-commission-type').value = v.ctype || 'percent';
  };
  const add = async (v) => { app.state.editingServiceId = null; fill(v); const n = app.state.services.length; await app.addService(); await settle(30); return app.state.services.length > n ? app.state.services[app.state.services.length - 1] : null; };

  const a1 = await add({ type: 'product', name: 'โค้ก', price: '25', duration: '45', cost: '12' });
  await t('เพิ่มสินค้า: ชนิด product · ต้นทุน 12 · ระยะเวลาเก็บเป็น 0 เสมอ (ไม่อ่านค่าที่ค้างในช่องที่ซ่อน)', () => {
    ok(a1, 'ไม่ได้บันทึก'); eq([a1.type, a1.cost, a1.duration, a1.price], ['product', 12, 0, 25]);
    ok(app.isProductService(a1));
  });
  const a2 = await add({ type: 'product', name: 'ลูกอม', price: '10', cost: '' });
  await t('ต้นทุนว่าง = ยังไม่ทราบ (null) — ไม่ใช่ 0', () => { ok(a2); eq(a2.cost, null); eq(app.productCostOf(a2.cost), null); });
  for (const bad of ['7.5', '-1', 'abc', '1e1']) {
    const t0 = toasts.length;
    const r = await add({ type: 'product', name: 'ผิด' + bad, price: '10', cost: bad });
    await t(`ต้นทุน "${bad}" ถูกปฏิเสธ (กติกาจำนวนเต็มบาท) พร้อมบอกว่าเป็นที่ช่องต้นทุน`, () => {
      eq(r, null); ok(toasts.slice(t0).some(x => /ต้นทุนต้องเป็นจำนวนเต็ม/.test(x.m)), JSON.stringify(toasts.slice(t0)));
    });
  }
  const s0 = await add({ type: 'service', name: 'บริการ 0 นาที', price: '100', duration: '0', comm: '10' });
  await t('ชนิดบริการแต่ระยะเวลา 0 → ไม่บันทึก + บอกให้เลือกชนิด "สินค้า"', () => {
    eq(s0, null); ok(toasts.some(x => /เลือกชนิด "สินค้า"/.test(x.m)), JSON.stringify(toasts.slice(-2)));
  });
  const s1 = await add({ type: 'service', name: 'นวดใหม่', price: '400', duration: '60', comm: '10' });
  await t('เพิ่มบริการตามเดิมได้ · ไม่มีช่องต้นทุน', () => { ok(s1); eq([s1.type, s1.duration, 'cost' in s1], ['service', 60, false]); });
  const legacy = await add({ type: '', name: 'ฟอร์มรุ่นเก่า', price: '30', duration: '0', comm: '0' });
  await t('ฟอร์มที่ไม่มีค่าชนิด (รุ่นเก่า) → อนุมานแบบเดิม: 0 นาที = สินค้า', () => { ok(legacy); eq(legacy.type, 'product'); });

  // แก้สินค้าเป็นบริการ → ต้นทุนหาย · แก้กลับเป็นสินค้า → ต้นทุนใหม่
  app.editService(a1.id);
  await t('เปิดแก้สินค้า: ฟอร์มขึ้นชนิดสินค้า + ต้นทุนเดิม · ช่องระยะเวลาว่าง', () =>
    eq([d.getElementById('serv-type').value, d.getElementById('serv-cost').value, d.getElementById('serv-duration').value], ['product', '12', '']));
  d.getElementById('serv-type').value = 'service'; d.getElementById('serv-duration').value = '15';
  await app.addService(); await settle(30);
  const a1b = app.state.services.find(s => s.id === a1.id);
  await t('เปลี่ยนสินค้าเป็นบริการ → ไม่เหลือช่องต้นทุน · ระยะเวลา 15', () => eq([a1b.type, 'cost' in a1b, a1b.duration], ['service', false, 15]));
  app.editService('d1');
  await t('รายการเก่า 0 นาที (ไม่มีช่องชนิด) เปิดแก้แล้วขึ้นเป็นสินค้า', () => eq(d.getElementById('serv-type').value, 'product'));
  app.state.editingServiceId = null;
  // ฟอร์มหายช่อง (HTML กับ JS ไม่ตรงกัน) = หยุด ไม่เดาชนิด
  const realGet = d.getElementById.bind(d);
  const n0 = app.state.services.length;
  fill({ type: 'product', name: 'หาช่องไม่เจอ', price: '10' });
  d.getElementById = id => (id === 'serv-type' ? null : realGet(id));
  try { await app.addService(); await settle(20); }
  finally { d.getElementById = realGet; }
  await t('หาช่องชนิดไม่เจอ → ไม่บันทึก + ป้ายแดงหน้าจอไม่ครบ', () => {
    eq(app.state.services.length, n0); ok((app._uiContractBroken || []).some(x => /serv-type/.test(x)));
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[B] ขาย: ขายหน้าร้านไม่ต้องเลือกพนักงาน · สินค้ามีคอม/บริการยังต้องเลือก');
// ═══════════════════════════════════════════════════════════════════════════
await section('[B]', async () => {
  const shop = await shopWith();
  const { env, app, gas } = shop;

  const r1 = await sell(shop, ['p1', 'p1']);
  await t('น้ำเปล่า 2 ขวด (คอม 0) ไม่เลือกพนักงาน → ขายได้', () => { ok(r1.tx, JSON.stringify(r1.toasts)); eq(r1.tx.total, 40); });
  await t('บรรทัดบิลจด serviceId · isProduct · ต้นทุน ณ ตอนขาย · ไม่มีผู้ให้บริการ · ค่าคอม 0', () => {
    eq(r1.tx.details.map(x => [x.serviceId, x.isProduct, x.unitCost, x.staffId, x.commissionAmount]),
       [['p1', true, 8, '', 0], ['p1', true, 8, '', 0]]);
  });
  await t('บิลสินค้าล้วน: ไม่เข้าคิว · ช่องพนักงานว่าง (ไม่ใช่ชื่อว่าง "")', () => { eq(r1.queueAdded, 0); eq(r1.tx.staffNames, []); });
  await t('ตัวตรวจบิลผ่าน (บิลใช้ได้ทุกที่)', () => { eq(fatal(app, r1.tx), []); ok(app.isBillUsable(r1.tx)); });

  const r2 = await sell(shop, ['p2']);
  await t('เบียร์ (มีค่าคอม) ไม่เลือกคนขาย → ไม่ออกบิล + บอกว่าต้องเลือกคนขาย', () => {
    eq(r2.tx, null); ok(r2.toasts.some(m => /คนขาย/.test(m)), JSON.stringify(r2.toasts));
  });
  const r3 = await sell(shop, ['p2'], { staff: { p2: 'st-1' } });
  await t('เลือกคนขายแล้ว → ขายได้ · ค่าคอม ฿10 เข้าคนขาย', () => {
    ok(r3.tx, JSON.stringify(r3.toasts)); eq(r3.tx.details.map(x => [x.staffId, x.commissionAmount, x.unitCost]), [['st-1', 10, 40]]);
    eq(r3.tx.staffNames, ['เอ']); eq(r3.queueAdded, 0);
  });
  const r4 = await sell(shop, ['s0']);
  await t('ควบคุม: บริการค่าคอม 0 ยังต้องเลือกผู้ให้บริการ (ข้อยกเว้นมีแค่สินค้า)', () => {
    eq(r4.tx, null); ok(r4.toasts.some(m => /ผู้ให้บริการ/.test(m)), JSON.stringify(r4.toasts));
  });
  const r5 = await sell(shop, ['s1']);
  await t('ควบคุม: บริการปกติไม่เลือกผู้ให้บริการ → ไม่ออกบิลเหมือนเดิม', () => eq(r5.tx, null));
  const r6 = await sell(shop, ['d1']);
  await t('รายการเก่า 0 นาที (ไม่มีช่องชนิด · คอม 0) = สินค้าขายหน้าร้าน · ไม่ทราบต้นทุน (ไม่ใส่ unitCost)', () => {
    ok(r6.tx, JSON.stringify(r6.toasts)); eq([r6.tx.details[0].isProduct, 'unitCost' in r6.tx.details[0], r6.queueAdded], [true, false, 0]);
  });
  const r7 = await sell(shop, ['s1', 'p1'], { staff: { s1: 'st-1' } });
  await t('บิลผสม (ตัดผม + น้ำ): คิวมีเฉพาะตัดผม · พนักงานของบิล = เอ คนเดียว', () => {
    ok(r7.tx, JSON.stringify(r7.toasts)); eq(r7.queueAdded, 1);
    const q = app.state.queue.find(x => x.txId === r7.tx.id);
    eq([q.services.map(s => s.name), q.totalDuration], [['ตัดผม'], 30]);
    eq(r7.tx.staffNames, ['เอ']);
    eq(r7.tx.details.map(x => [x.serviceId, x.isProduct]), [['s1', false], ['p1', true]]);
  });

  // หน้าชำระเงิน (ปุ่มเปิดหน้าต่าง) ใช้กติกาเดียวกับด่านจริง
  const tc = shop.toasts.length;
  app.state.cart = []; app.addToCart('p1'); app.openCheckoutModal();
  await t('ปุ่มชำระเงิน: ตะกร้ามีแต่สินค้าขายหน้าร้าน → ไม่ฟ้อง "เลือกผู้ให้บริการให้ครบ"', () =>
    ok(!shop.toasts.slice(tc).some(x => /เลือกผู้ให้บริการให้ครบ/.test(x.m)), JSON.stringify(shop.toasts.slice(tc))));
  const tc2 = shop.toasts.length;
  app.state.cart = []; app.addToCart('p2'); app.openCheckoutModal();
  await t('ปุ่มชำระเงิน: สินค้ามีคอมที่ยังไม่เลือกคนขาย → ฟ้อง', () =>
    ok(shop.toasts.slice(tc2).some(x => /เลือกผู้ให้บริการให้ครบ/.test(x.m)), JSON.stringify(shop.toasts.slice(tc2))));
  app.state.cart = [];

  // บันทึกไม่สำเร็จ → ไม่เหลืออะไรค้าง (บิลสินค้าล้วนไม่มีคิวให้ถอย)
  app.state.customers = [{ id: 'c-1', name: 'คุณประจำ', phone: '0800000000', visitCount: 3, tier: 'ทั่วไป' }];
  const tx0 = app.state.transactions.length, q0 = clone(app.state.queue), disk0 = clone(await env.raw('transactions'));
  const out0 = clone(app.state.cloudOutbox || []);
  const undo = failPutForKeys(['transactions'], 'sync');
  let failed;
  try { failed = await sell(shop, ['p1'], { customer: 'c-1' }); } finally { undo(); }
  await t('บิลสินค้าล้วนเขียนฐานข้อมูลไม่สำเร็จ → ไม่มีบิล · คิว/คิวคลาวด์/จำนวนครั้งลูกค้าเท่าเดิม · ในเครื่องเท่าเดิม · บอกสาเหตุจริง', async () => {
    eq(failed.tx, null); eq(app.state.transactions.length, tx0); eq(clone(app.state.queue), q0);
    eq(clone(app.state.cloudOutbox || []), out0);
    eq(app.state.customers[0].visitCount, 3);
    ok(!failed.toasts.some(m => /Cannot read|of null|undefined/.test(m)), JSON.stringify(failed.toasts));
    eq(clone(await env.raw('transactions')), disk0);
  });

  // ขึ้นชีต: ไม่ส่งต้นทุน · ยอดตรง · ช่องพนักงานว่าง
  await app.syncPendingTransactions(true); await settle(80);
  await t('ขึ้นชีตครบ: บิลสินค้าล้วน synced · ยอดสุทธิตรง · ช่องพนักงานว่าง', () => {
    eq(r1.tx.syncStatus, 'synced');
    const row = sheetRow(gas, app, r1.tx); ok(row, 'ไม่มีแถว');
    eq([row['ยอดสุทธิ (฿)'], String(row['พนักงาน'] == null ? '' : row['พนักงาน'])], [40, '']);
    eq(r7.tx.syncStatus, 'synced'); eq(sheetRow(gas, app, r7.tx)['พนักงาน'], 'เอ');
  });
  await t('คำขอที่ส่งชีต: รายการย่อยมีแค่ price/netPrice/vatable (ต้นทุน/รหัสไม่ออกนอกเครื่อง · ลายนิ้วมือบิลเดิม)', () => {
    const p = app.buildBillPayload(r7.tx);
    p.lines.forEach(l => eq(Object.keys(l).sort(), ['netPrice', 'price', 'vatable']));
    ok(!JSON.stringify(p).includes('unitCost') && !JSON.stringify(p).includes('isProduct'));
  });

  // สรุปขึ้นชีต: ไม่มีแถว "ไม่ระบุ" ในตารางค่าคอม · รายการ/รายได้ยังครบ · Apps Script รับ
  for (const kind of ['day', 'month']) {
    await t(`สรุป${kind === 'day' ? 'วัน' : 'เดือน'}: ตารางค่าคอมไม่มีแถวว่าง · ค่าคอมรวม = ผลรวมบรรทัด · รายการรวมกลับเป็นรายได้ · ชีตรับ`, () => {
      const key = kind === 'day' ? app.currentBusinessDateKey() : app.getBusinessMonthKey(Date.now());
      const p = app.buildSummaryPayload(app.state.transactions, [], kind, key);
      ok(!p.staffCommissions.some(s => s.name === 'ไม่ระบุ'), JSON.stringify(p.staffCommissions));
      const lineComm = app.state.transactions.reduce((s, x) => s + x.details.reduce((a, l) => a + sat(l.commissionAmount || 0), 0), 0);
      eq(p.staffCommissions.reduce((s, x) => s + sat(x.commission), 0), lineComm);
      eq(p.services.reduce((s, x) => s + sat(x.revenue), 0) + sat(p.vatAmount) + sat(p.rounding), sat(p.totalRevenue));
      ok(p.services.some(x => x.name === 'น้ำเปล่า' && x.count === 3), JSON.stringify(p.services));
      eq(gas.post(p).status, 'success');
    });
  }
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[C] รายงานสินค้า: จำนวนชิ้น · ยอดขาย · ต้นทุน · ค่าคอม · กำไร');
// ═══════════════════════════════════════════════════════════════════════════
await section('[C]', async () => {
  const shop = await shopWith();
  const { env, app } = shop;
  const b1 = await sell(shop, ['s1', 'p1'], { staff: { s1: 'st-1' }, discount: 32 });   // ลด 10% → ตัดผม 270 · น้ำ 18
  const b2 = await sell(shop, ['p2', 'p2'], { staff: { p2: 'mg-1' } });
  const b3 = await sell(shop, ['p3']);
  const b4 = await sell(shop, ['p1']);
  ok(b1.tx && b2.tx && b3.tx && b4.tx, 'ขายไม่ครบ');
  const bills = () => app.summaryBillsOf(app.state.transactions).bills;
  const row = (rep, name) => rep.rows.find(r => r.name === name);
  const rep = app.buildProductReport(bills());
  await t('น้ำเปล่า 2 ขวด: ยอด 18 + 20 = 38 (ส่วนลดเฉลี่ยมาที่สินค้าด้วย) · ต้นทุน 16 · กำไร 22 · ต่อชิ้น 11', () => {
    const r = row(rep, 'น้ำเปล่า');
    eq([r.qty, r.revenue, r.cost, r.commission, r.profit, r.profitPerUnit, r.unknownQty], [2, 38, 16, 0, 22, 11, 0]);
  });
  await t('เบียร์ 2 ขวด (คอม ฿10/ชิ้น): ยอด 200 − ต้นทุน 80 − คอม 20 = กำไร 100', () => {
    const r = row(rep, 'เบียร์'); eq([r.qty, r.revenue, r.cost, r.commission, r.profit, r.profitPerUnit], [2, 200, 80, 20, 100, 50]);
  });
  await t('ขนม (ไม่ทราบต้นทุน): กำไร "—" (null) ไม่ใช่โชว์เท่ายอดขาย', () => {
    const r = row(rep, 'ขนม'); eq([r.qty, r.revenue, r.cost, r.unknownQty, r.profit], [1, 50, null, 1, null]);
  });
  await t('บริการไม่อยู่ในรายงานสินค้า · รวมทั้งหมดกำไร null เพราะมีชิ้นที่ไม่ทราบต้นทุน', () => {
    ok(!row(rep, 'ตัดผม')); eq([rep.totals.qty, rep.totals.revenue, rep.totals.profit, rep.totals.unknownQty], [5, 288, null, 1]);
  });
  await t('ยอดสินค้า + ยอดบริการ = ยอดรายการก่อน VAT ของบิลชุดเดียวกัน (กระทบยอดได้)', () => {
    const bd = app.buildServiceBreakdown(bills());
    const svcSat = bd.rows.filter(r => !rep.rows.some(p => p.name === r.name)).reduce((s, r) => s + sat(r.revenue), 0);
    eq(svcSat + sat(rep.totals.revenue), sat(bd.servicesTotal));
  });
  await t('กรองตามคนขาย: บี เห็นแค่เบียร์ของตัวเอง · เอ ไม่มีสินค้า (ตัดผมไม่ใช่สินค้า)', () => {
    eq(app.buildProductReport(bills(), { staffId: 'mg-1' }).rows.map(r => [r.name, r.qty]), [['เบียร์', 2]]);
    eq(app.buildProductReport(bills(), { staffId: 'st-1' }).rows, []);
  });

  // แก้ต้นทุนทีหลัง: บิลเก่าใช้ต้นทุน ณ ตอนขาย · ใส่ต้นทุนให้สินค้าที่ไม่เคยมี → บิลเก่าใช้ต้นทุนปัจจุบัน (ติด "ประมาณ")
  app.state.services.find(s => s.id === 'p1').cost = 15;
  app.state.services.find(s => s.id === 'p3').cost = 20;
  const rep2 = app.buildProductReport(bills());
  await t('เปลี่ยนต้นทุนน้ำเปล่าเป็น 15 → บิลที่ขายไปแล้วยังใช้ 8 (กำไร 22 เท่าเดิม)', () => eq(row(rep2, 'น้ำเปล่า').profit, 22));
  await t('ใส่ต้นทุนขนมทีหลัง (20) → บิลเก่าใช้ต้นทุนปัจจุบัน ติดธงประมาณ · กำไร 30', () => {
    const r = row(rep2, 'ขนม'); eq([r.cost, r.estimatedQty, r.unknownQty, r.profit], [20, 1, 0, 30]);
  });

  // เปลี่ยนชื่อสินค้า: จัดกลุ่มตามรหัส → แถวเดียว ชื่อล่าสุด
  app.state.services.find(s => s.id === 'p1').name = 'น้ำดื่ม';
  const renamed = await sell(shop, ['p1']);   // ขายหลังเปลี่ยนชื่อ — บรรทัดใหม่ชื่อ "น้ำดื่ม" รหัสเดิม
  await t('เปลี่ยนชื่อน้ำเปล่า → น้ำดื่ม แล้วขายต่อ: รายงานรวมเป็นแถวเดียว 3 ชิ้น ชื่อล่าสุด (จัดกลุ่มด้วยรหัสสินค้า)', () => {
    ok(renamed.tx); const r3 = app.buildProductReport(bills());
    eq([row(r3, 'น้ำดื่ม') && row(r3, 'น้ำดื่ม').qty, !!row(r3, 'น้ำเปล่า')], [3, false]);
  });
  app.state.services.find(s => s.id === 'p1').name = 'น้ำเปล่า';
  // คืนสภาพบิลชุดเดิมให้หัวข้อถัดไป (ยกเลิกบิลที่ขายเพิ่มออกจากชุดที่ตรวจ)
  app.state.transactions = app.state.transactions.filter(x => x.id !== renamed.tx.id);

  // บิลรุ่นก่อนมีระบบสินค้า (ไม่มี isProduct/serviceId/unitCost) → อนุมานจากชื่อ ใช้ต้นทุนปัจจุบัน
  const legacy = clone(b4.tx); legacy.id = 'TX-LEGACY-1';
  legacy.details.forEach(l => { delete l.isProduct; delete l.serviceId; delete l.unitCost; });
  const notProduct = clone(b4.tx); notProduct.id = 'TX-NOTPRODUCT-1';
  notProduct.details.forEach(l => { l.isProduct = false; delete l.unitCost; });
  await t('บิลรุ่นเก่าที่ชื่อตรงกับสินค้า → นับเป็นสินค้า · ต้นทุนปัจจุบัน (ประมาณ)', () => {
    const r = app.buildProductReport([legacy]).rows; eq(r.map(x => [x.name, x.qty, x.cost, x.estimatedQty]), [['น้ำเปล่า', 1, 15, 1]]);
  });
  await t('บรรทัดที่จดไว้ว่า isProduct: false → ไม่ถูกเดาเป็นสินค้าแม้ชื่อตรง', () => eq(app.buildProductReport([notProduct]).rows, []));

  // ต้นทุนในบรรทัดเพี้ยน (ไฟล์นำเข้า/แก้มือ) → ไม่ทำให้บิลเสีย แค่ไม่ทราบต้นทุน
  for (const bad of ['abc', -5, 7.5, null]) {
    const x = clone(b4.tx); x.id = 'TX-BADCOST-' + String(bad).replace(/\./g, '_'); x.details[0].unitCost = bad;
    app.state.services.find(s => s.id === 'p1').cost = null;
    await t(`ต้นทุนในบรรทัด = ${JSON.stringify(bad)} → บิลไม่เสีย · รายงานขึ้นไม่ทราบต้นทุน`, () => {
      eq(fatal(app, x), []); ok(app.isBillUsable(x));
      const r = app.buildProductReport([x]).rows[0]; eq([r.unknownQty, r.profit], [1, null]);
    });
  }
  app.state.services.find(s => s.id === 'p1').cost = 15;

  // ตารางบนจอ: เจ้าของเห็นต้นทุน/กำไร · ผู้จัดการไม่เห็น
  loginAs(app, 'owner'); app.renderProductReport(bills(), 'all');
  const head = () => env.document.getElementById('report-products-head').innerHTML;
  const body = () => env.document.getElementById('report-products-body').innerHTML;
  await t('เจ้าของ: ตารางสินค้ามีคอลัมน์ต้นทุน/กำไร/กำไรต่อชิ้น · แสดงการ์ด', () => {
    ok(/ต้นทุน/.test(head()) && /กำไร\/ชิ้น/.test(head()), head());
    ok(/เบียร์/.test(body()) && /2 ชิ้น/.test(body()), body());
    eq(env.document.getElementById('report-products-card').style.display, '');
  });
  await t('เจ้าของ: หมายเหตุเตือนว่ากำไรในตารางห้ามเอาไปหักซ้ำกับกำไรบนชีต (ค่าซื้อสินค้าลงเป็นค่าใช้จ่ายแล้ว · เจ้าของเลือก 10 ต.ค. 2569)', () =>
    ok(/ห้ามเอากำไรในตารางนี้ไปหักซ้ำ/.test(env.document.getElementById('report-products-note').innerHTML), env.document.getElementById('report-products-note').innerHTML));
  loginAs(app, 'manager'); app.renderProductReport(bills(), 'all');
  await t('ผู้จัดการ: ไม่มีคอลัมน์ต้นทุน/กำไร และไม่มีตัวเลขต้นทุนหลุดในตาราง/หมายเหตุ', () => {
    ok(!/ต้นทุน|กำไร/.test(head()), head()); ok(/ขายได้/.test(head()));
    ok(!/ต้นทุน|กำไร/.test(env.document.getElementById('report-products-note').innerHTML));
    ok(!/฿80\.00/.test(body()), body());   // ต้นทุนรวมเบียร์ 80
  });
  loginAs(app, 'owner');
  app.state.services = app.state.services.filter(s => !app.isProductService(s));
  app.renderProductReport([], 'all');
  await t('ร้านที่ไม่มีสินค้าและไม่มีการขายสินค้า → ซ่อนการ์ด (หน้ารายงานเหมือนเดิม)', () =>
    eq(env.document.getElementById('report-products-card').style.display, 'none'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[D] แก้บิล · ยกเลิกบิล · ไฟล์สำรอง');
// ═══════════════════════════════════════════════════════════════════════════
await section('[D]', async () => {
  const shop = await shopWith();
  const { env, app, gas } = shop;
  const mixed = (await sell(shop, ['s1', 'p1', 'p2'], { staff: { s1: 'st-1', p2: 'mg-1' } })).tx;
  const only = (await sell(shop, ['p1'])).tx;
  ok(mixed && only, 'ขายไม่ครบ');

  // หน้าแก้บิล: บรรทัดขายหน้าร้านไม่มีช่องเลือกพนักงาน (ไม่ขึ้น "(ไม่อยู่ในระบบแล้ว)")
  app.openTransactionEdit(mixed.id);
  const list = env.document.getElementById('edit-tx-services-list').innerHTML;
  await t('หน้าแก้บิล: น้ำเปล่าขึ้น "ขายหน้าร้าน" · ไม่ขึ้นป้ายพนักงานหายจากระบบ · เบียร์/ตัดผมยังมีช่องเลือก', () => {
    ok(/ขายหน้าร้าน/.test(list), list.slice(0, 400)); ok(!/ไม่อยู่ในระบบแล้ว/.test(list));
    eq((list.match(/edit-tx-service-staff-select/g) || []).length, 2);
  });
  env.document.getElementById('edit-tx-discount').value = '42';   // ลด 10% ของ 420
  await app.saveTransactionEdit(); await settle(40);
  await t('แก้ส่วนลดบิลผสม: ช่องสินค้า (serviceId/isProduct/unitCost) ยังอยู่ · ยอดใหม่เกลี่ยถูก · พนักงานของบิลไม่มีชื่อว่าง', () => {
    eq(mixed.discount, 42);
    eq(mixed.details.map(l => [l.serviceId, l.isProduct, l.unitCost === undefined ? null : l.unitCost, l.netPrice]),
       [['s1', false, null, 270], ['p1', true, 8, 18], ['p2', true, 40, 90]]);
    eq(mixed.staffNames.slice().sort(), ['บี', 'เอ'].sort());
    eq(fatal(app, mixed), []);
  });
  await t('รายงานหลังแก้: น้ำเปล่ากำไร 10 + 12 · เบียร์ 90 − 40 − 10 = 40', () => {
    const rep = app.buildProductReport(app.summaryBillsOf(app.state.transactions).bills);
    eq(rep.rows.find(r => r.name === 'น้ำเปล่า').profit, 22); eq(rep.rows.find(r => r.name === 'เบียร์').profit, 40);
  });

  // ยกเลิกบิลสินค้าล้วน (ไม่มีคิวผูกอยู่) → ยกเลิกได้ · หายจากรายงาน
  app.openTransactionEdit(only.id); env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('ยกเลิกบิลสินค้าล้วน: ยกเลิกได้ (ไม่มีคิวให้ลบ) · หายจากรายงานสินค้า', () => {
    ok(!app.state.transactions.some(x => x.id === only.id));
    const rep = app.buildProductReport(app.summaryBillsOf(app.state.transactions).bills);
    eq(rep.rows.find(r => r.name === 'น้ำเปล่า').qty, 1);
  });

  // ไฟล์สำรอง → กู้บนเครื่องใหม่: ชนิด/ต้นทุนของสินค้า + ช่องสินค้าในบิลมาครบ · Apps Script รับโครงไฟล์
  const backup = clone(app.buildBackupPayload());
  await t('Apps Script รับโครงไฟล์สำรองที่มีสินค้า', () => eq(gas.ctx.validateBackupStructure_(backup), ''));
  const other = await makeShop({ onLine: false });
  try {
    ok(other.app.isValidBackupObject(backup), other.app._lastBackupRejectReason);
    other.app.sanitizeBackupData(backup);
    await other.app.applyBackupData(backup, { acceptUnsynced: true }); await settle(40);
    await t('กู้แล้ว: สินค้ายังเป็นสินค้า ต้นทุนเดิม · รายงานสินค้าเหมือนต้นทางทุกตัวเลข', () => {
      const p1 = other.app.state.services.find(s => s.id === 'p1');
      eq([p1.type, p1.cost], ['product', 8]);
      const a = app.buildProductReport(app.summaryBillsOf(app.state.transactions).bills);
      const b = other.app.buildProductReport(other.app.summaryBillsOf(other.app.state.transactions).bills);
      eq(b, a);
    });
  } finally { other.env.dispose(); }

  // ไฟล์สำรองเก่า/เสียที่บริการไม่มีระยะเวลา (หรืออ่านไม่ได้) — กู้แล้วต้องยังเป็น "บริการ" ที่ต้องเลือกพนักงาน (ผู้ตรวจแยก 9 ต.ค. 2569)
  // เดิมตัวซ่อมไฟล์ตั้งระยะเวลาเป็น 0 แล้วระบบอนุมานว่าเป็นสินค้าขายหน้าร้าน (ค่าคอม 0) → ขายได้โดยไม่มีเจ้าของงาน
  const old = clone(app.buildBackupPayload());
  old.services = [
    { id: 'x1', name: 'นวดไม่มีเวลา', price: 500, category: 'barber', commission: 0, commissionType: 'percent' },
    { id: 'x2', name: 'นวดเวลาเสีย', price: 500, duration: 'abc', category: 'barber', commission: 0, commissionType: 'percent' },
    { id: 'x3', name: 'นวดเวลาติดลบ', price: 500, duration: -5, category: 'barber', commission: 0, commissionType: 'percent' },
    { id: 'x4', name: 'น้ำรุ่นเก่า', price: 20, duration: 0, category: 'barber', commission: 0, commissionType: 'percent' }];
  const third = await makeShop({ onLine: false });
  try {
    third.app.sanitizeBackupData(old);
    await third.app.applyBackupData(old, { acceptUnsynced: true }); await settle(40);
    await t('กู้ไฟล์ที่บริการไม่มี/อ่านระยะเวลาไม่ได้ → ยังเป็นบริการ (ต้องเลือกพนักงาน) · 0 นาทีจริงยังเป็นสินค้า', () => {
      const s = id => third.app.state.services.find(x => x.id === id);
      eq(['x1', 'x2', 'x3', 'x4'].map(id => third.app.isProductService(s(id))), [false, false, false, true]);
    });
    third.app.state.cart = []; third.app.addToCart('x1');
    await t('บริการนั้นใส่ตะกร้าแล้วไม่ใช่ "ขายหน้าร้าน"', () => eq(third.app.isFrontCounterLine(third.app.state.cart[0]), false));
  } finally { third.env.dispose(); }
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[E] หน้าขายแยก "บริการ | สินค้า" + หมวดของแต่ละฝั่ง · หน้าตั้งค่าแบ่งกลุ่ม (เจ้าของสั่ง 9 ต.ค. 2569)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[E]', async () => {
  const shop = await shopWith();
  const { env, app } = shop;
  const P = Object.getPrototypeOf(app);
  const render = () => P.renderPos.call(app);
  const html = id => env.document.getElementById(id).innerHTML;
  const tabs = () => (html('category-tabs').match(/selectPosCategory\('([^']+)'\)/g) || []).map(x => x.slice(19, -2));
  const grid = () => html('services-grid');
  app.state.selectedCategory = 'all'; app.state.posKind = 'service'; app.state.serviceSearch = '';
  render();
  await t('ร้านมีสินค้า → แถบ บริการ/สินค้า แสดง พร้อมจำนวน (บริการ 2 · สินค้า 4)', () => {
    eq(env.document.getElementById('pos-kind-tabs').style.display, '');
    ok(/บริการ <span class="tab-count">2<\/span>/.test(html('pos-kind-tabs')) && /สินค้า <span class="tab-count">4<\/span>/.test(html('pos-kind-tabs')), html('pos-kind-tabs'));
  });
  await t('ฝั่งบริการ: แท็บ "บริการทั้งหมด" + เฉพาะหมวดที่มีบริการ · ตารางมีแต่บริการ', () => {
    ok(/บริการทั้งหมด/.test(html('category-tabs'))); eq(tabs(), ['all', 'barber']);
    ok(/ตัดผม/.test(grid()) && !/น้ำเปล่า/.test(grid()) && !/เบียร์/.test(grid()), grid().slice(0, 300));
  });
  P.selectPosKind.call(app, 'product'); render();
  await t('ฝั่งสินค้า: แท็บ "สินค้าทั้งหมด" + หมวดที่มีสินค้า (barber · drinks) · ตารางมีแต่สินค้า · จำนวนนับเฉพาะสินค้า', () => {
    ok(/สินค้าทั้งหมด/.test(html('category-tabs'))); eq(tabs(), ['all', 'barber', 'drinks']);
    ok(/น้ำเปล่า/.test(grid()) && /เบียร์/.test(grid()) && !/ตัดผม/.test(grid()), grid().slice(0, 300));
    ok(/>\s*<i class="fa-solid fa-bag-shopping"><\/i> สินค้าทั้งหมด <span class="tab-count">4<\/span>/.test(html('category-tabs')), html('category-tabs').slice(0, 300));
  });
  app.state.selectedCategory = 'drinks'; render();
  await t('เลือกหมวด drinks ฝั่งสินค้า → เหลือ "น้ำ" รายการเดียว', () => { ok(/น้ำ/.test(grid()) && !/เบียร์/.test(grid())); });
  P.selectPosKind.call(app, 'service'); render();
  await t('สลับกลับฝั่งบริการ → กลับแท็บ "ทั้งหมด" ของฝั่งบริการ (หมวด drinks ไม่มีบริการ)', () => eq(app.state.selectedCategory, 'all'));
  app.state.selectedCategory = 'drinks'; app.state.posKind = 'service'; render();
  await t('หมวดที่ไม่มีรายการของฝั่งนั้นค้างอยู่ (ค่าเก่า) → ถอยไป "ทั้งหมด" เอง ไม่ขึ้นตารางว่าง', () => { eq(app.state.selectedCategory, 'all'); ok(/ตัดผม/.test(grid())); });
  app.state.serviceSearch = 'เบียร์'; render();
  await t('ค้นหา "เบียร์" ขณะอยู่ฝั่งบริการ → เจอสินค้า (ค้นทุกรายการทุกหมวด) + บอกว่าค้นจากทุกหมวด', () => {
    ok(/เบียร์/.test(grid()) && !/ตัดผม/.test(grid()), grid().slice(0, 300)); ok(/จากทุกหมวด · 1 รายการ/.test(grid()));
  });
  app.state.serviceSearch = '';
  // ร้านที่ยังไม่มีสินค้า: เหมือนเดิมทุกอย่าง
  const saved = app.state.services;
  app.state.services = saved.filter(x => !app.isProductService(x));
  app.state.selectedCategory = 'barber'; render();
  await t('ร้านที่ยังไม่มีสินค้า: ไม่มีแถบ บริการ/สินค้า · แท็บ "ทั้งหมด" + ทุกหมวดแบบเดิม (รวมหมวดว่าง)', () => {
    eq(env.document.getElementById('pos-kind-tabs').style.display, 'none');
    ok(/> ทั้งหมด <span/.test(html('category-tabs')) && !/บริการทั้งหมด/.test(html('category-tabs')));
    eq(tabs(), ['all', ...app.state.categories.map(c => c.id)]);
  });
  app.state.serviceSearch = 'นวด'; render();
  await t('ร้านที่ยังไม่มีสินค้า: ค้นหาในหมวดที่เลือกเหมือนเดิม (ไม่มีข้อความค้นทุกหมวด)', () => ok(!/จากทุกหมวด/.test(grid())));
  app.state.serviceSearch = ''; app.state.services = saved;

  // หน้าตั้งค่า: แบ่งกลุ่ม
  P.renderSettingsLists.call(app);
  const list = html('settings-services-list');
  await t('หน้าตั้งค่า: กลุ่ม "บริการ (2)" ก่อน แล้ว "สินค้า · หมวด (n)" · ทุกรายการยังมีปุ่มแก้ไข/ลบ', () => {
    ok(/บริการ \(2\)/.test(list) && /สินค้า · ตัดผม \(3\)/.test(list) && /สินค้า · เครื่องดื่ม \(1\)/.test(list), list.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
    ok(list.indexOf('บริการ (2)') < list.indexOf('สินค้า ·'));
    eq((list.match(/app\.editService\(/g) || []).length, app.state.services.length);
  });
  app.state.services = saved.filter(x => !app.isProductService(x));
  P.renderSettingsLists.call(app);
  await t('หน้าตั้งค่า (ร้านไม่มีสินค้า): ไม่มีหัวกลุ่ม · รายการเดิม', () => ok(!/settings-group-title/.test(html('settings-services-list'))));
  app.state.services = saved;
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[F] แก้ตามผลตรวจก่อนขึ้นจริง (9–10 ต.ค. 2569)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[F]', async () => {
  const shop = await shopWith();
  const { env, app, toasts } = shop;
  const d = env.document;
  const P = Object.getPrototypeOf(app);
  const html = id => d.getElementById(id).innerHTML;

  // F1 ชื่อสินค้าซ้ำกับบริการ: บิลเก่า (ไม่มีธง isProduct) ห้ามถูกนับเป็นสินค้า
  const oldSvcLine = { name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 30 };
  const oldWaterLine = { name: 'น้ำเปล่า', price: 20, netPrice: 20, staffId: 'st-1', staffName: 'เอ', commission: 0, commissionType: 'percent', commissionAmount: 0 };
  app.state.services.push({ id: 'px', type: 'product', name: 'ตัดผม', price: 99, duration: 0, category: 'barber', commission: 0, commissionType: 'fixed', cost: 50 });
  await t('สินค้าชื่อเดียวกับบริการ (ข้อมูลที่หลุดเข้ามา) → บรรทัดบิลเก่า "ตัดผม" ยังเป็นบริการ ไม่ถูกนับเป็นสินค้า', () =>
    eq(app.productLineInfo(oldSvcLine).isProduct, false));
  await t('ตัวควบคุม: บรรทัดเก่า "น้ำเปล่า" (ชื่อเป็นของสินค้าอย่างเดียว) ยังนับเป็นสินค้า + ใช้ต้นทุนปัจจุบัน', () => {
    const i = app.productLineInfo(oldWaterLine); eq([i.isProduct, i.unitCost, i.costSource], [true, 8, 'current']);
  });
  await t('บรรทัดใหม่ที่จดธงไว้ (isProduct + serviceId) ไม่ถูกกระทบ', () =>
    eq(app.productLineInfo(Object.assign({}, oldSvcLine, { isProduct: true, serviceId: 'px', unitCost: 50 })).isProduct, true));
  app.state.services = app.state.services.filter(s => s.id !== 'px');

  // F2 ชื่อซ้ำ: ห้ามบันทึกใหม่ · แก้รายการเดิมโดยไม่เปลี่ยนชื่อยังได้
  const fill = (v) => {
    d.getElementById('serv-type').value = v.type; d.getElementById('serv-name').value = v.name;
    d.getElementById('serv-price').value = v.price; d.getElementById('serv-duration').value = v.duration == null ? '' : v.duration;
    d.getElementById('serv-cost').value = v.cost == null ? '' : v.cost;
    d.getElementById('serv-category').value = v.cat == null ? 'barber' : v.cat;
    d.getElementById('serv-commission').value = v.comm == null ? '0' : v.comm;
    d.getElementById('serv-commission-type').value = v.ctype || 'fixed';
  };
  const n0 = app.state.services.length, t0 = toasts.length;
  app.state.editingServiceId = null; fill({ type: 'product', name: '  ตัดผม ', price: '50' });
  await app.addService(); await settle(20);
  await t('เพิ่มสินค้าชื่อ " ตัดผม " (ซ้ำบริการ · ช่องว่างไม่นับ) → ไม่บันทึก + บอกว่าชื่อซ้ำกับบริการ', () => {
    eq(app.state.services.length, n0); ok(toasts.slice(t0).some(x => /มีอยู่แล้ว \(บริการ\)/.test(x.m)), JSON.stringify(toasts.slice(t0)));
  });
  // ระยะเวลา '0' (ตรวจ 11 ต.ค. 2569 ข้อ 4): ให้ทุกช่องอื่นผ่าน — ข้อนี้ต้องตกเพราะ "ชื่อซ้ำ" เท่านั้น
  // (เดิมเว้นระยะเวลาว่าง รุ่นเก่าปฏิเสธที่ช่องระยะเวลาแทน เทสต์จึงผ่านกับโค้ดเก่าด้วยเหตุผลผิด)
  app.state.editingServiceId = null; fill({ type: 'product', name: 'น้ำเปล่า', price: '15', cost: '5', duration: '0' });
  await app.addService(); await settle(20);
  await t('เพิ่มสินค้าชื่อซ้ำสินค้าเดิม → ไม่บันทึก', () => eq(app.state.services.length, n0));
  app.editService('p1'); d.getElementById('serv-price').value = '25'; d.getElementById('serv-category').value = 'barber';
  await app.addService(); await settle(20);
  await t('แก้ราคาน้ำเปล่า (ชื่อเดิม) → บันทึกได้ ไม่ติดกฎชื่อซ้ำ', () => eq(app.state.services.find(s => s.id === 'p1').price, 25));
  app.editService('p1'); d.getElementById('serv-name').value = 'เบียร์'; d.getElementById('serv-category').value = 'barber';
  await app.addService(); await settle(20);
  await t('แก้ชื่อน้ำเปล่าเป็น "เบียร์" (ชื่อที่มีอยู่) → ไม่บันทึก', () => eq(app.state.services.find(s => s.id === 'p1').name, 'น้ำเปล่า'));
  app.state.editingServiceId = null;

  // F3 ฟอร์ม: ค่าตั้งต้นตามชนิด · ไม่ทับค่าที่เจ้าของพิมพ์เอง · สินค้าต้องเลือกหมวดเอง
  const open = () => {   // เลียนแบบปุ่ม "เพิ่มบริการ/สินค้า" (form.reset() ในฟอร์มจริงคืนค่า 10 % และชนิดบริการ)
    app.state.editingServiceId = null; app._servCommTouched = false; app._servCatTouched = false;
    d.getElementById('serv-type').value = 'service'; d.getElementById('serv-commission').value = '10';
    d.getElementById('serv-commission-type').value = 'percent'; d.getElementById('serv-category').value = '';
    app.populateServiceCategorySelect(); app.applyServiceTypeUI();
  };
  const setType = v => { d.getElementById('serv-type').value = v; app.applyServiceTypeUI(); };
  const formVals = () => ['serv-commission', 'serv-commission-type', 'serv-category'].map(id => String(d.getElementById(id).value));
  open();
  await t('เปิดฟอร์มใหม่ (บริการ): ค่าคอม 10 % · หมวดแรก (ตัดผม) แบบเดิม · ไม่มีตัวเลือกว่าง', () => {
    eq(formVals(), ['10', 'percent', 'barber']); ok(!/เลือกหมวดของสินค้า/.test(html('serv-category')));
  });
  setType('product');
  await t('เลือกชนิดสินค้า: ค่าคอม 0 บาทต่อชิ้น · หมวดว่าง "— เลือกหมวดของสินค้า —"', () => {
    eq(formVals(), ['0', 'fixed', '']); ok(/<option value="">— เลือกหมวดของสินค้า —<\/option>/.test(html('serv-category')), html('serv-category'));
  });
  await t('ร้านเปิด VAT: หมวดที่คิด VAT มีป้าย "· คิด VAT" · หมวดที่ไม่คิดไม่มี', () => {
    ok(/>เครื่องดื่ม · คิด VAT</.test(html('serv-category')) && />ตัดผม</.test(html('serv-category')), html('serv-category'));
  });
  setType('service');
  await t('สลับกลับเป็นบริการ (ยังไม่แตะช่อง): ค่าคอมกลับ 10 % · หมวดแรก', () => eq(formVals(), ['10', 'percent', 'barber']));
  open(); d.getElementById('serv-commission').value = '15'; app._servCommTouched = true; setType('product');
  await t('เจ้าของพิมพ์ค่าคอม 15 เองก่อนเลือกชนิดสินค้า → ไม่ถูกเปลี่ยนเป็น 0 (เดิมเปลี่ยนเงียบ ๆ)', () => eq(formVals().slice(0, 2), ['15', 'percent']));
  open(); setType('product'); d.getElementById('serv-commission').value = '0'; app._servCommTouched = true; setType('service');
  await t('เลือกสินค้า ยืนยันค่าคอม 0 เอง แล้วสลับเป็นบริการ → ค่าคอมยัง 0 (เดิมกลายเป็น 10 เงียบ ๆ)', () => eq(formVals()[0], '0'));
  open(); d.getElementById('serv-category').value = 'drinks'; app._servCatTouched = true; setType('product');
  await t('เลือกหมวดเองก่อน แล้วเลือกชนิดสินค้า → หมวดเดิมคงอยู่', () => eq(formVals()[2], 'drinks'));
  open(); setType('product');
  d.getElementById('serv-name').value = 'สบู่'; d.getElementById('serv-price').value = '60'; d.getElementById('serv-cost').value = '30';
  const t1 = toasts.length, n1 = app.state.services.length;
  await app.addService(); await settle(20);
  await t('สินค้าใหม่ไม่ได้เลือกหมวด → ไม่บันทึก + บอกว่าหมวดกำหนด VAT', () => {
    eq(app.state.services.length, n1); ok(toasts.slice(t1).some(x => /เลือกหมวดของสินค้าก่อน/.test(x.m)), JSON.stringify(toasts.slice(t1)));
  });
  d.getElementById('serv-category').value = 'drinks';
  await app.addService(); await settle(20);
  const soap = app.state.services[app.state.services.length - 1];
  await t('เลือกหมวดแล้วบันทึก → สินค้า สบู่ หมวด drinks · ค่าคอม 0 แบบบาท (ขายหน้าร้าน)', () =>
    eq([soap.name, soap.type, soap.category, soap.commission, soap.commissionType], ['สบู่', 'product', 'drinks', 0, 'fixed']));
  app.state.editingServiceId = null;
  app.editService('p2');
  await t('เปิดแก้สินค้าเดิม: ไม่มีการเปลี่ยนค่าคอม/หมวดอัตโนมัติ (เบียร์ ฿10 คงเดิม)', () => eq(formVals(), ['10', 'fixed', 'barber']));
  app.state.editingServiceId = null;

  // F4 ค้นหา + แท็บ: กดแท็บแล้วล้างคำค้น · ข้อความไม่พบถูกต้อง · มีปุ่มล้างค้นหา
  const render = () => P.renderPos.call(app);
  d.getElementById('pos-service-search').value = 'เบียร์'; app.state.serviceSearch = 'เบียร์'; app.state.posKind = 'service'; render();
  await t('ผลค้นหามีปุ่ม "ล้างค้นหา"', () => ok(/app\.clearPosSearch\(\)/.test(html('services-grid')) && /ล้างค้นหา/.test(html('services-grid'))));
  app.renderPos = render; P.selectPosCategory.call(app, 'drinks');
  await t('ร้านมีสินค้า: กดแท็บหมวดระหว่างค้นหา → ล้างคำค้น (ทั้งค่าที่จำและช่องพิมพ์) แล้วแสดงหมวดนั้น', () => {
    eq([app.state.serviceSearch, d.getElementById('pos-service-search').value], ['', '']);
  });
  app.state.serviceSearch = 'เบียร์'; d.getElementById('pos-service-search').value = 'เบียร์';
  P.selectPosKind.call(app, 'product');
  await t('กดปุ่ม บริการ/สินค้า ระหว่างค้นหา → ล้างคำค้น', () => eq([app.state.serviceSearch, d.getElementById('pos-service-search').value], ['', '']));
  app.state.serviceSearch = 'ไม่มีของนี้'; render();
  await t('ค้นหาไม่เจอ → บอกว่าไม่พบในบริการและสินค้าทุกหมวด (ไม่ใช่ "ในหมวดหมู่นี้")', () =>
    ok(/ไม่พบ &quot;ไม่มีของนี้&quot; ในบริการและสินค้าทุกหมวด|ไม่พบ "ไม่มีของนี้" ในบริการและสินค้าทุกหมวด/.test(html('services-grid')), html('services-grid')));
  const saved = app.state.services;
  app.state.services = saved.filter(x => !app.isProductService(x));
  app.state.serviceSearch = 'นวด'; d.getElementById('pos-service-search').value = 'นวด';
  P.selectPosCategory.call(app, 'barber');
  await t('ร้านที่ยังไม่มีสินค้า: กดแท็บหมวดไม่ล้างคำค้น (ค้นในหมวดแบบเดิม)', () => eq(app.state.serviceSearch, 'นวด'));
  app.state.services = saved; app.state.serviceSearch = ''; d.getElementById('pos-service-search').value = '';

  // F5 ลูกค้า: ซื้อสินค้าอย่างเดียวไม่นับครั้ง · ยกเลิกบิลใช้กติกาเดียวกัน
  app.state.customers = [{ id: 'c-9', name: 'ลูกค้าทดสอบ', phone: '0811111111', visitCount: 4, tier: 'ทั่วไป (General)' }];
  const onlyWater = await sell(shop, ['p1'], { customer: 'c-9' });
  await t('ซื้อน้ำอย่างเดียว → จำนวนครั้งลูกค้า 4 เท่าเดิม · ระดับไม่ขยับ', () => {
    ok(onlyWater.tx); eq([app.state.customers[0].visitCount, app.state.customers[0].tier], [4, 'ทั่วไป (General)']);
  });
  const mixed = await sell(shop, ['s1', 'p1'], { customer: 'c-9', staff: { s1: 'st-1' } });
  await t('ตัดผม + น้ำ → นับ 1 ครั้ง (4 → 5) · ขึ้นระดับทอง', () => {
    ok(mixed.tx); eq([app.state.customers[0].visitCount, app.state.customers[0].tier], [5, 'ทอง (Gold)']);
  });
  loginAs(app, 'owner');
  app.openTransactionEdit(onlyWater.tx.id); d.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('ยกเลิกบิลน้ำอย่างเดียว → จำนวนครั้งยัง 5 (ตอนขายไม่ได้นับ จึงไม่ลด)', () => {
    ok(!app.state.transactions.some(x => x.id === onlyWater.tx.id), 'ยกเลิกไม่สำเร็จ'); eq(app.state.customers[0].visitCount, 5);
  });
  app.openTransactionEdit(mixed.tx.id); d.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(40);
  await t('ยกเลิกบิลตัดผม + น้ำ → ลดคืนเป็น 4 · ระดับกลับเป็นทั่วไป', () => {
    ok(!app.state.transactions.some(x => x.id === mixed.tx.id), 'ยกเลิกไม่สำเร็จ');
    eq([app.state.customers[0].visitCount, app.state.customers[0].tier], [4, 'ทั่วไป (General)']);
  });
  await t('บิลรุ่นเก่า (บรรทัดไม่มีธง) / บิลไม่มีรายละเอียด → นับเป็นการมาใช้บริการเหมือนเดิม', () => {
    eq(app.billCountsAsVisit([oldWaterLine]), true); eq(app.billCountsAsVisit([]), true); eq(app.billCountsAsVisit(undefined), true);
  });

  // F6 แดชบอร์ด + Telegram: สินค้าไม่นับเป็นงานบริการ
  const dashA = await sell(shop, ['s1', 'p1', 'p1', 'p2'], { staff: { s1: 'st-1', p2: 'st-1' } });
  ok(dashA.tx, 'ขายบิลแดชบอร์ดไม่สำเร็จ');
  app.state.transactions = app.state.transactions.filter(x => x.id === dashA.tx.id);
  P.renderDashboard.call(app);
  await t('แดชบอร์ด: "บริการที่ขายวันนี้" = 1 งาน (ไม่นับน้ำ 2 + เบียร์ 1) · รายการขายล่าสุดบอก 1 บริการ · 3 สินค้า', () => {
    eq(d.getElementById('kpi-completed').innerText, '1 งาน');
    ok(/1 บริการ · 3 สินค้า/.test(html('recent-sales-list')), html('recent-sales-list'));
  });
  await t('แดชบอร์ด: บริการยอดนิยมมีแต่ตัดผม (น้ำ/เบียร์ไม่ขึ้นอันดับ)', () => {
    const pop = html('dashboard-popular-services'); ok(/ตัดผม/.test(pop) && !/น้ำเปล่า/.test(pop) && !/เบียร์/.test(pop), pop.slice(0, 300));
  });
  await t('บิลไม่มีรายละเอียดรายการ (กู้จากชีต) → นับทุกชื่อเป็นบริการแบบเดิม', () =>
    eq(app.billUnitSplit({ services: ['ก', 'ข'], details: [] }), { services: 2, products: 0, serviceNames: ['ก', 'ข'], productNames: [] }));
  // ตรวจ 11 ต.ค. 2569 ข้อ 13: บิลอยู่กะไหนตัดสินจากรหัสกะในบิล (tender.shiftStart) — รายงานต้องเป็นของกะที่ขายบิลจริง
  const msg = app.buildShiftReportMessage({ startTime: app.state.shift.startTime, endTime: Date.now() + 1000, closedBy: 'เจ้าของร้าน',
    startCash: 0, expenses: [], cashCounted: 0 });
  const msgText = typeof msg === 'string' ? msg : JSON.stringify(msg);
  await t('Telegram ปิดกะ: "จำนวนบริการทั้งหมด: 1 รายการ" + บรรทัด "สินค้าที่ขาย: 3 ชิ้น"', () => {
    ok(/จำนวนบริการทั้งหมด: 1 รายการ/.test(msgText) && /สินค้าที่ขาย: 3 ชิ้น/.test(msgText), msgText.slice(0, 600));
  });

  // F7 ตารางยอดขายแยกตามรายการ: ชื่อหมวดจากหมวดของร้าน (ไม่ขึ้นรหัส)
  app.filterReports = P.filterReports.bind(app); app.renderReportsChart = P.renderReportsChart.bind(app);
  d.getElementById('report-date-input').value = app.getBusinessISODate(dashA.tx.date);
  d.getElementById('report-staff-filter').value = 'all';
  app.state.selectedReportType = 'daily';
  app.state.transactions = app.state.transactions.concat([]);
  await sell(shop, ['d1'], {});
  app.filterReports();
  await t('ตารางแยกตามรายการ: หมวดของ "น้ำ" ขึ้นเป็น "เครื่องดื่ม" ไม่ใช่รหัส drinks', () => {
    const body = html('report-services-breakdown-body');
    ok(/เครื่องดื่ม/.test(body) && !/>drinks</.test(body), body.replace(/\s+/g, ' ').slice(0, 600));
  });

  // F8 ตะกร้า: ขายหน้าร้านเป็นแถวเตี้ย (คลาสแยก) · สินค้ามีคอม/บริการแถวเดิม
  app.state.cart = []; app.addToCart('p1'); app.addToCart('p2'); app.addToCart('s1');
  P.renderCart.call(app);
  await t('ตะกร้า: น้ำเปล่ามีคลาสแถวเตี้ย cart-item--counter · เบียร์/ตัดผมไม่มี', () => {
    const items = html('cart-items-list').match(/<div class="cart-item(?: cart-item--counter)?">/g) || [];
    eq(items.map(x => /cart-item--counter/.test(x)), [true, false, false]);
  });
  app.state.cart = [];
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[G] อุดช่องที่เทสต์ยังไม่ครอบ (ตรวจ 11 ต.ค. 2569 ข้อ 4 — ทำโค้ดพังทีละจุดแล้วชุดเทสต์เดิมยังเขียว)');
// แต่ละข้อติดชื่อ mutation ที่มันจับ [ee] [f1] … — ผ่านกับโค้ดจริง และตกเมื่อปลดด่านนั้น
// ═══════════════════════════════════════════════════════════════════════════
await section('[G]', async () => {
  // ── reports screen: บริการฮิต / staff table / product card wiring ──
    {
      const shop = await shopWith(); const { app } = shop;
      const a = await sell(shop, ['s1'], { staff: { s1: 'st-1' } });
      const b = await sell(shop, ['p1', 'p1', 'p1']);                       // flagged products, more units than the service
      const c = await sell(shop, ['p2'], { staff: { p2: 'mg-1' } });
      ok(a.tx && b.tx && c.tx, 'ขายไม่ครบ ' + JSON.stringify([a.toasts, b.toasts, c.toasts]));
      const today = app.getBusinessISODate(a.tx.date);
      loginAs(app, 'owner');
      let r = reportsScreen(shop, today, 'all');
      await t('[f1] หน้ารายงาน "บริการฮิตที่สุด" = ตัดผม ไม่ใช่น้ำเปล่า (สินค้าขายได้ 3 ชิ้น)', () => eq(r.popular, 'ตัดผม'));
      await t('[f3] ตารางค่าคอมหน้ารายงานไม่มีแถว "ไม่ได้ระบุ" จากสินค้าขายหน้าร้าน', () => ok(!/ไม่ได้ระบุ/.test(r.commission), r.commission.replace(/\s+/g, ' ').slice(0, 300)));
      // a bill from yesterday must not leak into today's product card
      const y = clone(b.tx); y.id = 'TX-YESTERDAY-1'; y.date = new Date(new Date(b.tx.date).getTime() - 24 * 3600e3).toISOString();
      if (y.tender && y.tender.at) y.tender.at = new Date(y.tender.at).getTime() - 24 * 3600e3;
      app.state.transactions.push(y);
      // a quarantined (รอตรวจ) product bill today must not be counted
      const q = clone(b.tx); q.id = 'TX-BROKEN-1'; q.total = Number(q.total) + 7;
      app.state.transactions.push(q);
      ok(app.isBillUsable(y) && !app.isBillUsable(q), 'เตรียมบิลไม่ได้ตามแผน');
      r = reportsScreen(shop, today, 'all');
      await t('[ee] การ์ดสินค้าของ "วันนี้" ไม่รวมบิลเมื่อวาน · [ee3] ไม่รวมบิลรอตรวจ (น้ำเปล่า = 3 ชิ้น)', () => eq(qtyOf(r.products, 'น้ำเปล่า'), 3));
      r = reportsScreen(shop, today, 'mg-1');
      await t('[ee2] เลือกพนักงาน "บี" → การ์ดสินค้าเหลือเบียร์ของบี ไม่มีน้ำเปล่า (ขายหน้าร้าน)', () => {
        eq(qtyOf(r.products, 'เบียร์'), 1); eq(qtyOf(r.products, 'น้ำเปล่า'), 0);
      });
      shop.env.dispose();
    }
    {
      // legacy product lines (no isProduct flag — sold before the feature) must not win บริการฮิต either
      const shop = await shopWith(); const { app } = shop;
      const a = await sell(shop, ['s1'], { staff: { s1: 'st-1' } });
      const w = await sell(shop, ['d1', 'd1', 'd1']);
      ok(a.tx && w.tx, 'ขายไม่ครบ');
      w.tx.details.forEach(l => { delete l.isProduct; delete l.serviceId; delete l.unitCost; });
      const r = reportsScreen(shop, app.getBusinessISODate(a.tx.date), 'all');
      await t('[f4] บิลรุ่นเก่า (บรรทัดไม่มีธง) ของสินค้า "น้ำ" ×3 ไม่ขึ้นเป็นบริการฮิต', () => eq(r.popular, 'ตัดผม'));
      shop.env.dispose();
    }
    // ── card-paid bills: fee line must not count as a visit or a service job ──
    {
      const shop = await shopWith(); const { env, app } = shop; const P = Object.getPrototypeOf(app);
      app.state.customers = [{ id: 'c-9', name: 'ลูกค้า', phone: '0811111111', visitCount: 4, tier: 'ทั่วไป (General)' }];
      const card = await sell(shop, ['p1'], { pay: 'credit', customer: 'c-9' });
      ok(card.tx, 'ขายบัตรไม่สำเร็จ ' + JSON.stringify(card.toasts));
      ok(card.tx.details.some(l => app.isCardFeeLine(l)), 'บิลบัตรไม่มีบรรทัดค่าธรรมเนียม');
      await t('บิลบัตรสินค้าล้วน: ตอนขายไม่นับครั้งลูกค้า (4)', () => eq(app.state.customers[0].visitCount, 4));
      loginAs(app, 'owner');
      app.openTransactionEdit(card.tx.id); env.document.getElementById('void-money-outcome').value = 'refunded';
      await app.voidTransaction(); await app._confirmP; await settle(40);
      await t('[g4] ยกเลิกบิลบัตรสินค้าล้วน → จำนวนครั้งลูกค้ายัง 4 (บรรทัดค่าธรรมเนียมไม่ใช่บริการ)', () => {
        ok(!app.state.transactions.some(x => x.id === card.tx.id), 'ยกเลิกไม่สำเร็จ'); eq(app.state.customers[0].visitCount, 4);
      });
      const svcCard = await sell(shop, ['s1'], { pay: 'credit', staff: { s1: 'st-1' } });
      ok(svcCard.tx, 'ขายบริการด้วยบัตรไม่สำเร็จ');
      app.state.transactions = app.state.transactions.filter(x => x.id === svcCard.tx.id);
      P.renderDashboard.call(app);
      await t('[x] แดชบอร์ด: บิลบัตรตัดผม 1 รายการ = "1 งาน" (ไม่นับบรรทัดค่าธรรมเนียม)', () => eq(env.document.getElementById('kpi-completed').innerText, '1 งาน'));
      shop.env.dispose();
    }
    // ── receipt + quote: no "ผู้ดูแล" line for front-counter items ──
    {
      const shop = await shopWith(); const { env, app } = shop; const P = Object.getPrototypeOf(app);
      const m = await sell(shop, ['s1', 'p1'], { staff: { s1: 'st-1' } });
      ok(m.tx, 'ขายไม่สำเร็จ');
      P.showThermalReceipt.call(app, m.tx);
      const rc = String(env.document.getElementById('thermal-receipt-preview').innerHTML);
      await t('[v] ใบเสร็จ: "ผู้ดูแล" 1 บรรทัด (ตัดผม) ไม่มีของน้ำเปล่า', () => eq((rc.match(/ผู้ดูแล/g) || []).length, 1));
      app.state.cart = []; app.addToCart('s1'); app.addToCart('p1'); app.changeItemStaff(app.state.cart[0].uniqueCartId, 'st-1');
      env.document.getElementById('cart-discount').value = '0';
      P.showQuotePreview.call(app);
      const qp = String(env.document.getElementById('quote-preview').innerHTML);
      await t('[v2] ใบแจ้งยอด: "ผู้ดูแล" 1 บรรทัด (ตัดผม) ไม่มีของน้ำเปล่า', () => eq((qp.match(/ผู้ดูแล/g) || []).length, 1));
      app.state.cart = [];
      shop.env.dispose();
    }
    // ── settings form: duplicate names (case/space) · missing fields stop · hidden field disabled ──
    {
      const shop = await shopWith(); const { env, app, toasts } = shop; const d = env.document;
      const fill = (v) => {
        d.getElementById('serv-type').value = v.type; d.getElementById('serv-name').value = v.name;
        d.getElementById('serv-price').value = v.price; d.getElementById('serv-duration').value = v.duration == null ? '' : v.duration;
        d.getElementById('serv-cost').value = v.cost == null ? '' : v.cost; d.getElementById('serv-category').value = 'barber';
        d.getElementById('serv-commission').value = '0'; d.getElementById('serv-commission-type').value = 'fixed';
      };
      const add = async (v) => { app.state.editingServiceId = null; fill(v); const n = app.state.services.length; await app.addService(); await settle(20); return app.state.services.length - n; };
      eq(await add({ type: 'product', name: 'Coke', price: '25', cost: '12' }), 1);
      await t('[o2] "coke" (ตัวพิมพ์ต่าง) ซ้ำกับ "Coke" → ไม่บันทึก', async () => eq(await add({ type: 'product', name: 'coke', price: '25' }), 0));
      eq(await add({ type: 'product', name: 'น้ำ แร่', price: '25' }), 1);
      await t('[o2] "น้ำ  แร่" (เว้นวรรคสองช่อง) ซ้ำกับ "น้ำ แร่" → ไม่บันทึก', async () => eq(await add({ type: 'product', name: 'น้ำ  แร่', price: '25' }), 0));
      const realGet = d.getElementById.bind(d);
      let added;
      fill({ type: 'service', name: 'นวดหาช่องไม่เจอ', price: '400', duration: '60' });
      d.getElementById = id => (id === 'serv-type' ? null : realGet(id));
      try { const n = app.state.services.length; await app.addService(); await settle(20); added = app.state.services.length - n; } finally { d.getElementById = realGet; }
      await t('[bb] หาช่องชนิดไม่เจอ (ช่องอื่นกรอกครบ ระยะเวลา 60) → ไม่บันทึก', () => eq(added, 0));
      d.getElementById('serv-type').value = 'service'; app.applyServiceTypeUI();
      await t('[hh] ชนิดบริการ: ช่องต้นทุนถูกปิด (disabled) · ช่องระยะเวลาเปิด', () => eq([d.getElementById('serv-cost').disabled, d.getElementById('serv-duration').disabled], [true, false]));
      shop.env.dispose();
    }
});

R.done();
})();
