// งานแก้ตรวจ 14 ต.ค. 2569 (fx2) — ข้อ 3 ส่วนลดค้างไปบิลถัดไป · ข้อ 18 หมวดรหัสตัวเลข · ข้อ 19 แถว VAT ค้างในตะกร้า
// ใช้แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จำลอง · ขายผ่าน processCheckout จริง
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- fix 14 Oct 2026 (fx2): cart discount / numeric category ids / stale VAT row ---');
const copy = x => JSON.parse(JSON.stringify(x));
const proto = app => Object.getPrototypeOf(app);   // ตัวจริงของฟังก์ชันที่ quiet() ปิดไว้ (วาดจอ)

// ขายบิลถัดไปแบบที่พนักงานทำจริง: แตะบริการ → เลือกช่าง → เงินสด → ชำระ (ไม่แตะช่องส่วนลด)
async function nextSale(env) {
  const app = env.app, d = env.document;
  app.addToCart('s1');
  const it = app.state.cart.at(-1); it.staffId = 'st-1'; it.staffName = 'เอ';
  app.state.selectedPaymentMethod = 'cash';
  d.getElementById('cash-received').value = '1000';
  app.beginCheckoutAttempt();
  const before = app.state.transactions.length;
  await app.processCheckout(); await settle(30);
  return app.state.transactions.length > before ? app.state.transactions.at(-1) : null;
}
// พนักงาน A หยิบบริการ 300 และใส่ส่วนลด 100 ให้ลูกค้าคนนี้ (ยังไม่ชำระ)
function startDiscountedCart(env) {
  env.app.addToCart('s1');
  env.document.getElementById('cart-discount').value = '100';
}

(async () => {
  // ═══ ข้อ 3 ═══
  await R.t('ข้อ 3: ออกจากระบบกลางตะกร้าที่มีส่วนลด → คนถัดไปขายเต็มราคา (เดิมโดนลด 100 เงียบ ๆ)', async () => {
    const { env, app } = await makeShop({ role: 'staff' }); await settle();
    try {
      startDiscountedCart(env);
      app.logout();
      loginAs(app, 'manager');
      eq(env.document.getElementById('cart-discount').value, 0, 'ช่องส่วนลดหลังออกจากระบบ');
      const tx = await nextSale(env);
      ok(tx, 'ไม่มีบิล');
      eq([tx.subtotal, tx.discount, tx.total], [300, 0, 300]);
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 3: หมดเวลา (เก็บตะกร้าไว้) แล้ว "คนอื่น" เข้าระบบ → ไม่ได้ทั้งตะกร้าและส่วนลด', async () => {
    const { env, app } = await makeShop({ role: 'staff' }); await settle();
    try {
      startDiscountedCart(env);
      app.holdCartForReturn('st-1'); app.logout('หมดเวลา', 'st-1');
      loginAs(app, 'manager'); app.restoreHeldCart();   // ตัวเดียวกับที่ completeLogin เรียก
      eq(app.state.cart.length, 0, 'ตะกร้าของคนก่อน');
      const tx = await nextSale(env);
      eq([tx.subtotal, tx.discount, tx.total], [300, 0, 300]);
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 3: หมดเวลาแล้ว "คนเดิม" เข้าระบบ → ได้ตะกร้าคืนพร้อมส่วนลดเดิม', async () => {
    const { env, app } = await makeShop({ role: 'staff' }); await settle();
    try {
      startDiscountedCart(env);
      app.state.cart[0].staffId = 'st-1'; app.state.cart[0].staffName = 'เอ';
      app.holdCartForReturn('st-1'); app.logout('หมดเวลา', 'st-1');
      loginAs(app, 'staff'); app.restoreHeldCart();
      eq(app.state.cart.length, 1, 'ตะกร้าคืน');
      eq(String(env.document.getElementById('cart-discount').value), '100', 'ส่วนลดคืน');
      app.state.selectedPaymentMethod = 'cash';
      env.document.getElementById('cash-received').value = '1000';
      app.beginCheckoutAttempt();
      await app.processCheckout(); await settle(30);
      const tx = app.state.transactions.at(-1);
      eq([tx.subtotal, tx.discount, tx.total], [300, 100, 200]);
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 3: ลบรายการทีละชิ้นจนตะกร้าว่าง → ส่วนลดล้างด้วย บิลถัดไปไม่โดนลด', async () => {
    const { env, app } = await makeShop({ role: 'staff' }); await settle();
    try {
      startDiscountedCart(env);
      app.removeFromCart(app.state.cart[0].uniqueCartId);
      const tx = await nextSale(env);
      eq([tx.subtotal, tx.discount, tx.total], [300, 0, 300]);
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 3: เจ้าของล้างยอดขาย (ปุ่มที่ถอดแล้ว แต่คำสั่งยังอยู่) → บิลแรกหลังเปิดกะไม่โดนลด', async () => {
    const { env, app } = await makeShop({ role: 'owner', rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } }); await settle();
    try {
      startDiscountedCart(env);
      env.ctx.prompt = () => 'ล้างยอดขาย'; env.ctx.confirm = () => true; app.openCashCounter = () => {};
      eq(await app.clearSalesData(), true, 'control: ล้างสำเร็จ');
      app.state.shift.active = true; app.state.shift.startTime = Date.now() - 1000;   // เปิดกะใหม่
      const tx = await nextSale(env);
      eq([tx.subtotal, tx.discount, tx.total], [300, 0, 300]);
    } finally { env.dispose(); }
  });

  // ═══ ข้อ 18 ═══
  // ข้อมูลที่อยู่ในเครื่องมาก่อนมีด่านแปลงรหัส (ทางกู้ไฟล์แปลงให้แล้ว — ทางเปิดแอป/loadState ยังไม่แปลง):
  // หมวดเครื่องดื่ม (คิด VAT) รหัสตัวเลข 5 · บริการและบิลเก่าอ้างหมวด 5 → เปิดแอปใหม่
  async function restoreNumericCategoryFile() {
    const shop = await makeShop(); const { env, app } = shop; await settle();
    readyCheckout(env, [{ id: 'd1', name: 'น้ำ', price: 100, category: 'drinks', commission: 0, isProduct: true, staffId: '', staffName: '' }], 'cash');
    await app.processCheckout(); await settle(30);
    const put = async (key, fn) => { const r = await env.db.state.get(key); fn(r.value); await env.db.state.put(r); };
    await put('categories', v => v.forEach(c => { if (c.id === 'drinks') c.id = 5; }));
    await put('services', v => v.forEach(s => { if (s.category === 'drinks') s.category = 5; }));
    await put('transactions', v => v.forEach(tx => (tx.details || []).forEach(dd => { if (dd.category === 'drinks') dd.category = 5; })));
    await app.loadState(); await settle(20);
    eq((await env.db.state.get('transactions')).value[0].details[0].category, 5, 'control: บิลเก่าในเครื่องอ้างหมวดตัวเลข');
    return shop;
  }

  await R.t('ข้อ 18: เปิดแอปกับข้อมูลหมวดรหัสตัวเลข → กดแท็บหมวดนั้นในหน้าขายแล้วเห็นสินค้า (เดิมว่าง)', async () => {
    const { env, app } = await restoreNumericCategoryFile();
    try {
      const drinks = app.state.categories.find(c => c.name === 'เครื่องดื่ม');
      ok(drinks, 'ไม่มีหมวดเครื่องดื่มหลังกู้');
      app.selectPosKind('product'); proto(app).renderPos.call(app);   // ร้านมีสินค้า → ฝั่ง "สินค้า"
      const m = /selectPosCategory\('([^']*)'\)"[^>]*>\s*<i class="fa-solid [^"]*"><\/i> เครื่องดื่ม/.exec(env.document.getElementById('category-tabs').innerHTML);
      ok(m, 'ไม่มีแท็บเครื่องดื่ม');
      app.selectPosCategory(m[1]);          // ค่าที่ปุ่มส่งจริง (ข้อความ)
      proto(app).renderPos.call(app);
      ok(env.document.getElementById('services-grid').innerHTML.includes('น้ำ'), 'แท็บหมวดว่าง');
      // ต้องอยู่แท็บที่กดจริง (เดิมแท็บหมวดถูกเด้งกลับไป "ทั้งหมด" เพราะเทียบ '5' กับ 5 ไม่ตรง)
      eq(app.state.selectedCategory, m[1], 'แท็บที่เลือกถูกเด้งกลับ');
      ok(/class="tab-btn active[^"]*" onclick="app\.selectPosCategory\('[^']*'\)">\s*<i class="fa-solid [^"]*"><\/i> เครื่องดื่ม/.test(env.document.getElementById('category-tabs').innerHTML), 'แท็บเครื่องดื่มไม่สว่าง');
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 18: ลบหมวดรหัสตัวเลขที่ยังมีสินค้า → ถูกกันไว้ (เดิมขึ้น "ลบหมวดหมู่แล้ว" แต่ไม่ได้ลบ)', async () => {
    const { env, app, toasts } = await restoreNumericCategoryFile();
    try {
      const drinks = app.state.categories.find(c => c.name === 'เครื่องดื่ม');
      toasts.length = 0;
      app.deleteCategory(String(drinks.id));   // ปุ่มส่งเป็นข้อความเสมอ
      await app._confirmP; await settle(20);
      ok(!toasts.some(x => x.m === 'ลบหมวดหมู่แล้ว'), 'ขึ้นว่าลบแล้ว ทั้งที่ยังมีสินค้า: ' + JSON.stringify(toasts));
      ok(app.state.categories.some(c => c.name === 'เครื่องดื่ม'), 'หมวดหายไป');
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 18: แก้ชื่อหมวดรหัสตัวเลขผ่านฟอร์ม → ชื่อเปลี่ยนจริง (เดิมขึ้นบันทึกแล้วแต่ไม่เปลี่ยน)', async () => {
    const { env, app } = await restoreNumericCategoryFile();
    try {
      const drinks = app.state.categories.find(c => c.name === 'เครื่องดื่ม');
      app.editCategory(String(drinks.id));
      eq(env.document.getElementById('cat-name').value, 'เครื่องดื่ม', 'ฟอร์มแก้ไขว่าง');
      env.document.getElementById('cat-name').value = 'เครื่องดื่มเย็น';
      await app.addCategory(); await settle(20);
      ok(app.state.categories.some(c => c.name === 'เครื่องดื่มเย็น'), 'ชื่อไม่เปลี่ยน');
      eq(app.state.categories.filter(c => /เครื่องดื่ม/.test(c.name)).length, 1, 'เกิดหมวดซ้ำ');
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 18: บิลเก่าที่อ้างหมวดตัวเลข สรุป VAT รายหมวดยังขึ้นชื่อหมวด · บิลใหม่รวมแถวเดียวกัน', async () => {
    const { env, app } = await restoreNumericCategoryFile();
    try {
      readyCheckout(env, [{ id: 'd1', name: 'น้ำ', price: 100, category: app.state.services.find(s => s.id === 'd1').category, commission: 0, isProduct: true, staffId: '', staffName: '' }], 'cash');
      await app.processCheckout(); await settle(30);
      eq(app.state.transactions.length, 2, 'control: บิลเก่า + บิลใหม่');
      const vs = app.buildVatSummary(app.state.transactions);
      eq(vs.categories.map(c => [c.name, c.base, c.vat]), [['เครื่องดื่ม', 200, 14]]);
    } finally { env.dispose(); }
  });

  // ═══ ข้อ 19 ═══
  await R.t('ข้อ 19: ส่วนลดผิดกติกา → แถว VAT/ปัดเศษถูกซ่อน และยอดรวมก่อนลดตรงตะกร้าปัจจุบัน', async () => {
    const { env, app } = await makeShop({ role: 'staff' }); await settle();
    try {
      const d = env.document, upd = () => proto(app).updateCartTotals.call(app);
      app.state.cart = [{ uniqueCartId: 'u1', id: 'd1', name: 'น้ำ', price: 99, category: 'drinks', isProduct: true, commission: 0, staffId: '' }];
      d.getElementById('cart-discount').value = '0';
      upd();
      eq(d.getElementById('summary-vat-row').style.display, '', 'control: แถว VAT แสดง');
      eq(d.getElementById('summary-rounding-row').style.display, '', 'control: แถวปัดเศษแสดง');
      app.state.cart.push({ uniqueCartId: 'u2', id: 's1', name: 'ตัดผม', price: 300, category: 'barber', commission: 10, staffId: 'st-1' });
      d.getElementById('cart-discount').value = '10.5';
      upd();
      eq(d.getElementById('summary-vat-row').style.display, 'none', 'แถว VAT ค้าง');
      eq(d.getElementById('summary-rounding-row').style.display, 'none', 'แถวปัดเศษค้าง');
      ok(/399/.test(d.getElementById('summary-subtotal').innerText), 'ยอดรวมก่อนลดไม่อัปเดต: ' + d.getElementById('summary-subtotal').innerText);
    } finally { env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
