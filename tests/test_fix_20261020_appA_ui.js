// ตรวจ 19 ต.ค. 2569 ข้อ 12 · 18 · 24 · 33 · 35 · 61 — หน้าขาย/แดชบอร์ด/ตั้งค่า (app.js จริง + IndexedDB จริง · DOM จำลอง)
//   ข้อ 12: ลูกค้าที่เลือกไว้ต้องไม่ติดไปบิลของคนถัดไป (ล้างตะกร้า · ลบรายการสุดท้าย · สลับผู้ใช้ · เพิ่มลูกค้าจากหน้าลูกค้า)
//   ข้อ 18: ตั้งวันที่ iPad ย้อนหลัง → แดชบอร์ดยังเป็นวันทำการจริง (ไม่โชว์ยอด/ชื่อลูกค้าของวันเก่า)
//   ข้อ 24: ราคา/ต้นทุน ≤ BILL_MAX_BAHT · ระยะเวลา ≤ 1440 นาที (ตรวจเฉพาะค่าที่กำลังบันทึก)
//   ข้อ 33: กล่องยืนยันลบพนักงาน/ลูกค้า/คิว บอกว่าจะลบใคร
//   ข้อ 35: "เทียบเมื่อวาน" เทียบช่วงเวลาเดียวกัน (นับจาก 06:00)
//   ข้อ 61: ช่องตัวเลขในฟอร์มบริการ/พนักงานหายจากหน้าจอ → หยุดพร้อมป้ายแดง (ไม่ล้มกลางทาง)
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_ui.js
process.env.TZ = 'Asia/Bangkok';
const vm = require('vm');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 12 · 18 · 24 · 33 · 35 · 61 ---');
const CUST = [{ id: 'c-1', name: 'คุณสมชาย', phone: '0811111111', visitCount: 4, tier: 'ทั่วไป (General)', note: '' }];
const real = (app, name) => Object.getPrototypeOf(app)[name].bind(app);
const sel = (env) => env.document.getElementById('cart-customer-select');
async function sellWalkIn(shop) {
  const { env, app } = shop;
  app.state.cart = [{ uniqueCartId: 'u-w', id: 's1', name: 'ตัดผม', price: 300, duration: 30, commission: 10, commissionType: 'percent',
    category: 'barber', staffId: 'st-1', staffName: 'เอ' }];
  app.state.selectedPaymentMethod = 'cash';
  env.document.getElementById('cash-received').value = '100000';
  env.document.getElementById('cart-discount').value = '0';
  app.beginCheckoutAttempt();
  const r = await app.processCheckout(); await settle(20);
  return r ? app.state.transactions[app.state.transactions.length - 1] : null;
}
const BKK = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 7, mi || 0);

(async () => {
  // ── ข้อ 12 ──
  for (const [name, act] of [
    ['ล้างตะกร้า', (app) => real(app, 'clearCart')()],
    ['ลบรายการสุดท้ายในตะกร้า', (app) => real(app, 'removeFromCart')(app.state.cart[0].uniqueCartId)],
    ['สลับผู้ใช้ (หน้าล็อกอิน)', (app) => { real(app, 'requireLogin')(); loginAs(app, 'staff'); }],
  ]) {
    await R.t(`ข้อ 12 เลือกลูกค้าสมาชิกแล้ว${name} → ช่องลูกค้ากลับเป็น Walk-in · บิล walk-in ถัดไปไม่ลงชื่อ/ไม่นับครั้งให้สมาชิก`, async () => {
      const shop = await makeShop({ role: 'staff', rows: { customers: JSON.parse(JSON.stringify(CUST)), vatEnabled: false } });
      try {
        const { env, app } = shop;
        sel(env).value = 'c-1';
        app.state.cart = [{ uniqueCartId: 'u1', id: 's1', name: 'ตัดผม', price: 300, duration: 30, commission: 10, commissionType: 'percent', category: 'barber', staffId: 'st-1', staffName: 'เอ' }];
        act(app);
        eq(sel(env).value, '', 'ช่องลูกค้าต้องว่าง');
        const tx = await sellWalkIn(shop);
        ok(tx, 'ขายได้');
        eq(tx.customerName, 'ลูกค้าทั่วไป (Walk-in)');
        eq((await env.raw('customers'))[0].visitCount, 4, 'จำนวนครั้งของสมาชิกไม่เพิ่ม');
      } finally { shop.env.dispose(); }
    });
  }
  await R.t('ข้อ 12 งานที่ล้างตะกร้าแล้วบันทึกไม่สำเร็จ → คืนลูกค้าที่เลือกไว้ด้วย (snapshotCartDiscountForRollback)', async () => {
    const shop = await makeShop({ rows: { customers: JSON.parse(JSON.stringify(CUST)) } });
    try {
      const { env, app } = shop;
      sel(env).value = 'c-1';
      const restore = app.snapshotCartDiscountForRollback();
      app.resetCartState();
      eq(sel(env).value, '');
      restore();
      eq(sel(env).value, 'c-1');
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 12 เพิ่มลูกค้าจากหน้าลูกค้า → ไม่ถูกเลือกในตะกร้า · จากปุ่มลงทะเบียนด่วนในตะกร้า → ถูกเลือก', async () => {
    const shop = await makeShop({ rows: { customers: [] } });
    try {
      const { env, app } = shop;
      const fill = (n, p) => { env.document.getElementById('cust-name').value = n; env.document.getElementById('cust-phone').value = p; env.document.getElementById('cust-note').value = ''; };
      sel(env).value = '';
      app._customerModalForCart = false;            // ปุ่ม "+ เพิ่มลูกค้า" หน้าลูกค้า
      fill('คุณใหม่', '0822222222'); await app.addCustomer();
      eq(app.state.customers.length, 1); eq(sel(env).value, '', 'ต้องไม่ถูกเลือกในตะกร้า');
      app._customerModalForCart = true;             // ปุ่มลงทะเบียนด่วนในตะกร้า
      fill('คุณด่วน', '0833333333'); await app.addCustomer();
      const quick = app.state.customers.find(c => c.name === 'คุณด่วน');
      eq(sel(env).value, quick.id, 'ลงทะเบียนด่วนต้องถูกเลือกให้เลย');
    } finally { shop.env.dispose(); }
  });

  // ── ข้อ 18 / 35 ──
  const T = BKK(2026, 10, 21, 12, 30);               // "วันนี้" 12:30 (วันทำการ 21 ต.ค.)
  async function dashShop(role, bills, nowMs) {
    const shop = await makeShop({ role, rows: { vatEnabled: false,
      shift: { active: true, startTime: T - 3 * 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] },
      transactions: bills } });
    vm.runInContext(`Date.now = () => ${nowMs};`, shop.env.ctx);
    shop.app._clockFloorCache = null;
    real(shop.app, 'renderDashboard')();
    return shop;
  }
  const bill = (id, at, total, customerName) => ({ id, date: at, total, subtotal: total, discount: 0, customerName: customerName || 'ลูกค้าทั่วไป (Walk-in)',
    services: ['ตัดผม'], details: [{ name: 'ตัดผม', price: total, netPrice: total, staffId: 'st-1', staffName: 'เอ', commission: 0, commissionType: 'percent', commissionAmount: 0, category: 'barber', vatable: false }],
    paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced', vatRate: 0, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0,
    tender: { method: 'cash', amount: total, received: total, change: 0, at, shiftStart: at } });
  await R.t('ข้อ 18 ผู้จัดการ · iPad ถูกตั้งวันที่ย้อนไป 3 วัน → แดชบอร์ดยังเป็นยอดวันนี้ ไม่โชว์บิล/ชื่อลูกค้าของวันเก่า', async () => {
    const old = T - 3 * 86400e3;
    const shop = await dashShop('manager', [bill('TX-OLD', old - 3600e3, 300, 'ลูกค้าวันเก่า'), bill('TX-NOW', T - 3600e3, 500, 'ลูกค้าวันนี้')], old);
    try {
      const E = id => shop.env.document.getElementById(id);
      ok(/500\.00/.test(E('kpi-revenue').innerText) && !/300\.00/.test(E('kpi-revenue').innerText), 'ยอดวันนี้: ' + E('kpi-revenue').innerText);
      ok(!/ลูกค้าวันเก่า/.test(E('recent-sales-list').innerHTML), 'ต้องไม่โชว์บิล/ชื่อลูกค้าวันเก่า');
      ok(/21 ตุลาคม/.test(E('dashboard-date').innerText), 'วันที่บนแดชบอร์ด: ' + E('dashboard-date').innerText);
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 35 เจ้าของ · เมื่อวานขาย 300 ก่อนเที่ยง + 5,000 ตอนดึก · วันนี้ถึง 12:30 ขาย 400 → ↑33% เทียบเมื่อวานช่วงเวลาเดียวกัน (ไม่ใช่ ↓92%)', async () => {
    const Y = T - 86400e3;
    const shop = await dashShop('owner', [bill('TX-YDAY1', Y - 2.5 * 3600e3, 300), bill('TX-YDAY2', Y + 10.5 * 3600e3, 5000), bill('TX-TODAY1', T - 1800e3, 400)], T);
    try {
      const el = shop.env.document.getElementById('kpi-revenue-trend');
      ok(/fa-arrow-up/.test(el.innerHTML) && /33% เทียบเมื่อวานช่วงเวลาเดียวกัน/.test(el.innerHTML), JSON.stringify([el.innerHTML, el.className, shop.env.document.getElementById('kpi-revenue').innerText, shop.app.currentRole]));
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 35 เมื่อวานช่วงเวลานี้ยังไม่มียอด (ขายตอนดึกอย่างเดียว) → ป้ายบอกตรง ๆ ไม่ขึ้นลูกศรแดง', async () => {
    const Y = T - 86400e3;
    const shop = await dashShop('owner', [bill('TX-YDAY2', Y + 10.5 * 3600e3, 5000), bill('TX-TODAY1', T - 1800e3, 400)], T);
    try {
      const el = shop.env.document.getElementById('kpi-revenue-trend');
      ok(/เมื่อวานช่วงเวลานี้ยังไม่มียอด/.test(el.innerHTML) && !/fa-arrow-down/.test(el.innerHTML), el.innerHTML);
    } finally { shop.env.dispose(); }
  });

  // ── ข้อ 24 ──
  const svcForm = (env, o) => {
    const v = Object.assign({ name: 'บริการทดสอบ', price: '500', duration: '60', category: 'barber', commission: '10', commType: 'percent', type: 'service', cost: '' }, o);
    const set = (id, val) => { env.document.getElementById(id).value = val; };
    set('serv-name', v.name); set('serv-price', v.price); set('serv-duration', v.duration); set('serv-category', v.category);
    set('serv-commission', v.commission); set('serv-commission-type', v.commType); set('serv-type', v.type); set('serv-cost', v.cost);
  };
  for (const [label, o, msgRe] of [
    ['ราคา 99,999,999', { price: '99999999' }, /ราคาต้องไม่เกิน ฿10,000,000/],
    ['ระยะเวลา 1,441 นาที', { duration: '1441' }, /ระยะเวลาต้องไม่เกิน 1,440 นาที/],
    ['ต้นทุนสินค้า 10,000,001', { type: 'product', duration: '0', category: 'drinks', commission: '0', commType: 'fixed', cost: '10000001' }, /ต้นทุนต้องไม่เกิน ฿10,000,000/],
  ]) {
    await R.t(`ข้อ 24 ${label} → ไม่บันทึก + บอกเพดาน`, async () => {
      const shop = await makeShop({});
      try {
        const n = shop.app.state.services.length;
        svcForm(shop.env, o); shop.app.state.editingServiceId = null;
        await shop.app.addService();
        eq(shop.app.state.services.length, n, 'ไม่เพิ่มรายการ');
        ok(shop.toasts.some(t => msgRe.test(t.m)), shop.toasts.map(t => t.m).join(' | '));
      } finally { shop.env.dispose(); }
    });
  }
  await R.t('ข้อ 24 ค่าที่เพดานพอดี (ราคา 10,000,000 · 1,440 นาที) บันทึกได้ · ช่องต้นทุนที่ค้าง (ซ่อนอยู่) ของบริการไม่ถูกตรวจ', async () => {
    const shop = await makeShop({});
    try {
      svcForm(shop.env, { name: 'แพ็กเกจเต็มวัน', price: '10000000', duration: '1440', cost: '99999999' }); shop.app.state.editingServiceId = null;
      await shop.app.addService();
      ok(shop.app.state.services.some(s => s.name === 'แพ็กเกจเต็มวัน' && s.price === 10000000 && s.duration === 1440), 'บันทึกได้');
      eq((await shop.env.raw('services')).some(s => s.name === 'แพ็กเกจเต็มวัน'), true);
    } finally { shop.env.dispose(); }
  });

  // ── ข้อ 33 ──
  await R.t('ข้อ 33 กล่องยืนยันลบพนักงาน/ลูกค้า/คิว บอกชื่อเป้าหมาย (และบอกว่าบิลยังอยู่)', async () => {
    const shop = await makeShop({ rows: { customers: JSON.parse(JSON.stringify(CUST)),
      queue: [{ id: 'q-1', customerName: 'คุณคิว', services: [{ name: 'ตัดผม' }, { name: 'สระ' }], status: 'waiting', startTime: null, totalDuration: 30, totalAmount: 300, txId: 'TX-1' }] } });
    try {
      const app = shop.app;
      let msg = null;
      app.showConfirm = (m) => { msg = m; };          // ดูข้อความอย่างเดียว ไม่กดยืนยัน
      app.deleteStaff('st-1');
      ok(/"เอ"/.test(msg) && /ช่าง/.test(msg) && /สิทธิ์พนักงาน/.test(msg), msg);
      app.deleteCustomer('c-1');
      ok(/"คุณสมชาย"/.test(msg) && /0811111111/.test(msg) && /มาแล้ว 4 ครั้ง/.test(msg), msg);
      app.removeQueue('q-1');
      ok(/"คุณคิว"/.test(msg) && /ตัดผม, สระ/.test(msg) && /บิลที่ชำระแล้วยังอยู่/.test(msg), msg);
    } finally { shop.env.dispose(); }
  });

  // ── ข้อ 61 ──
  await R.t('ข้อ 61 ช่องราคาบริการหายจากหน้าจอ → หยุดพร้อมป้ายแดง ไม่ล้มกลางทาง ไม่บันทึก', async () => {
    const shop = await makeShop({});
    try {
      const { env, app } = shop;
      svcForm(env, {});
      const orig = env.document.getElementById;
      env.document.getElementById = (id) => id === 'serv-price' ? null : orig.call(env.document, id);
      const n = app.state.services.length;
      let threw = null;
      try { await app.addService(); } catch (e) { threw = e.message; }
      env.document.getElementById = orig;
      eq(threw, null, 'ต้องไม่ล้มด้วย error');
      eq(app.state.services.length, n);
      ok((app._uiContractBroken || []).some(w => /serv-price/.test(w)), 'ป้ายแดงบอกช่องที่หาย');
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 61 ช่อง PIN พนักงานหายจากหน้าจอ → หยุดพร้อมป้ายแดง (ไม่สร้างบัญชีผู้จัดการที่ไม่มี PIN)', async () => {
    const shop = await makeShop({});
    try {
      const { env, app } = shop;
      env.document.getElementById('staff-name').value = 'ผู้จัดการใหม่';
      env.document.getElementById('staff-role').value = 'ผู้จัดการ';
      env.document.getElementById('staff-access-level').value = 'manager';
      const orig = env.document.getElementById;
      env.document.getElementById = (id) => id === 'staff-pin' ? null : orig.call(env.document, id);
      const n = app.state.staff.length;
      app.state.editingStaffId = null;
      let threw = null;
      try { await app.addStaff(); } catch (e) { threw = e.message; }
      env.document.getElementById = orig;
      eq(threw, null);
      eq(app.state.staff.length, n, 'ไม่เพิ่มบัญชี');
      ok((app._uiContractBroken || []).some(w => /staff-pin/.test(w)), 'ป้ายแดงบอกช่องที่หาย');
    } finally { shop.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
