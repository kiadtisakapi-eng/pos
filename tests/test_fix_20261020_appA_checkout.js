// ตรวจ 19 ต.ค. 2569 ข้อ 50 + 51 — การชำระเงิน (app.js จริง + IndexedDB จริง)
//   ข้อ 50: ขั้นใดก็ตามหลัง "นับครั้งลูกค้า +1" โยน error (ไม่ใช่แค่ขั้นบันทึก) → คืนบิล/คิว/งานสำรอง/จำนวนครั้งลูกค้าครบ
//           ไม่มีบิลครึ่ง ๆ ค้างในหน่วยความจำไปลงเครื่องกับงานถัดไป · รอบชำระเงินยังใช้ต่อได้ (กดใหม่ได้บิลเดียว)
//   ข้อ 51: ด่าน "ตะกร้าเปลี่ยนหลังเปิดหน้าชำระ" · "ยอดเปลี่ยนหลังลูกค้าเห็น/สแกน QR" · "รอบชำระเงินที่ใช้ไปแล้ว" มีเทสต์คุม
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_checkout.js
process.env.TZ = 'Asia/Bangkok';
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 50 + 51: การชำระเงิน ---');
const ITEMS = [{ id: 's1', name: 'ตัดผม', price: 300 },
  { id: 'd1', name: 'น้ำ', price: 20, category: 'drinks', isProduct: true, commission: 0, commissionType: 'fixed', staffId: '', staffName: '' }];

async function freshShop() {
  return makeShop({ rows: {
    customers: [{ id: 'c-1', name: 'ลูกค้าประจำ', phone: '0812345678', visitCount: 4, tier: 'ทั่วไป (General)', note: '' }],
    backupStatus: { lastSuccessAt: 1 }          // บิลที่ 5 หลังสำรองครั้งล่าสุด = มีงานสำรองระหว่างกะ
  } });
}
async function sell(shop, items, opts) {
  const o = opts || {};
  readyCheckout(shop.env, items, 'cash');
  if (o.customer !== undefined) shop.env.document.getElementById('cart-customer-select').value = o.customer;
  shop.app.beginCheckoutAttempt();
  const r = await shop.app.processCheckout();
  await settle(10);
  return r;
}
async function snap(shop) {
  const { app, env } = shop;
  const raw = await env.rawAll();
  return { memTx: app.state.transactions.length, memQueue: (app.state.queue || []).length,
    memVisit: app.state.customers[0].visitCount, memTier: app.state.customers[0].tier,
    memOutbox: (app.state.cloudOutbox || []).length, dbTx: raw.transactions.length, dbVisit: raw.customers[0].visitCount };
}

(async () => {
  // ── ข้อ 50 ──
  const injections = [
    ['ตัวตรวจบิลโยน error (ไม่ใช่คืนผล)', (shop) => { const a = shop.app; const real = a.validateBillRecord; let armed = true;
      a.validateBillRecord = function (tx, o) { if (armed && tx && tx.checkoutAttemptId) { armed = false; throw new Error('จำลอง: ตัวตรวจบิลพัง'); } return real.call(this, tx, o); };
      return () => { a.validateBillRecord = real; }; }],
    ['ตั้งงานสำรองระหว่างกะโยน error (หลังใส่บิล+คิวแล้ว)', (shop) => { const a = shop.app; const real = a.planMidShiftBackup; let armed = true;
      a.planMidShiftBackup = function () { if (armed) { armed = false; throw new Error('จำลอง: ตั้งงานสำรองพัง'); } return real.apply(this, arguments); };
      return () => { a.planMidShiftBackup = real; }; }],
    ['คิวในหน่วยความจำเสีย (queue.push โยน error หลังใส่บิลแล้ว)', (shop) => { const a = shop.app; const prev = a.state.queue; a.state.queue = null;
      return () => { if (a.state.queue === null) a.state.queue = prev; }; }],
    ['IndexedDB เขียนแถวบิลไม่สำเร็จ (ตัวควบคุม — v65 คืนค่าได้อยู่แล้ว)', () => failPutForKeys(['transactions'], 'async')],
  ];
  for (const [name, setup] of injections) {
    await R.t(`ข้อ 50 ${name} → ไม่มีบิลค้าง · จำนวนครั้งลูกค้าคืน · คิว/งานสำรองคืน · กดใหม่ได้บิลเดียว`, async () => {
      const shop = await freshShop();
      try {
        for (let i = 0; i < 4; i++) eq(await sell(shop, ITEMS), true);
        const before = await snap(shop);
        readyCheckout(shop.env, ITEMS, 'cash');
        shop.env.document.getElementById('cart-customer-select').value = 'c-1';
        shop.app.beginCheckoutAttempt();
        const undo = setup(shop);
        const r = await shop.app.processCheckout();
        await settle(10);
        if (undo) undo();
        const mid = await snap(shop);
        eq(r, false, 'ต้องรายงานว่าไม่สำเร็จ');
        eq(mid.memTx, before.memTx, 'ไม่มีบิลค้างในหน่วยความจำ');
        eq(mid.memVisit, before.memVisit, 'จำนวนครั้งลูกค้าคืนแล้ว');
        eq(mid.memTier, before.memTier);
        eq(mid.memQueue, before.memQueue, 'คิวไม่เพิ่ม');
        eq(mid.memOutbox, before.memOutbox, 'งานสำรองไม่ค้าง');
        eq(shop.app.state.cart.length, 2, 'ตะกร้ายังอยู่ให้กดใหม่');
        // งานอื่นที่บันทึกทีหลัง (เช่นกดคิว/ค่าใช้จ่าย) ต้องไม่พาบิลครึ่ง ๆ ลงเครื่อง
        await shop.app.withMutation('probe', () => shop.app.saveStateOrThrow('probe'));
        const later = await snap(shop);
        eq(later.dbTx, before.dbTx, 'ไม่มีบิลผีลงเครื่อง');
        eq(later.dbVisit, before.dbVisit, 'จำนวนครั้งในเครื่องไม่เพิ่ม');
        // กดยืนยันใหม่ (รอบชำระเงินเดิมยังใช้ได้)
        ok(shop.app._checkoutAttempt, 'รอบชำระเงินยังอยู่');
        shop.env.document.getElementById('cash-received').value = '100000';
        eq(await shop.app.processCheckout(), true, 'กดใหม่แล้วขายได้');
        await settle(10);
        const fin = await snap(shop);
        eq(fin.dbTx, before.dbTx + 1, 'ได้บิลเดียว');
        eq(fin.dbVisit, before.dbVisit + 1, 'จำนวนครั้ง +1 ครั้งเดียว');
      } finally { shop.env.dispose(); }
    });
  }

  // ── ข้อ 51 ──
  await R.t('ข้อ 51 ตะกร้าเปลี่ยนหลังเปิดหน้าชำระเงิน → ไม่ออกบิล (ฐานข้อมูลจริง) · เปิดหน้าชำระใหม่แล้วขายได้', async () => {
    const shop = await freshShop();
    try {
      readyCheckout(shop.env, [ITEMS[0]], 'cash');
      shop.app.beginCheckoutAttempt();
      // ระหว่างลูกค้ากำลังจ่าย มีคนหยิบของเพิ่มลงตะกร้า
      shop.app.state.cart.push(Object.assign({ uniqueCartId: 'u-extra', duration: 0, commission: 0, commissionType: 'fixed', staffId: '', staffName: '' }, ITEMS[1]));
      eq(await shop.app.processCheckout(), false);
      eq(((await shop.env.raw('transactions')) || []).length, 0, 'ไม่มีบิลลงเครื่อง');
      ok(shop.toasts.some(t => /ตะกร้าเปลี่ยนหลังเปิดหน้าชำระเงิน/.test(t.m)), 'บอกเหตุผล');
      shop.app.beginCheckoutAttempt();
      eq(await shop.app.processCheckout(), true, 'เปิดใหม่แล้วขายได้');
      eq(((await shop.env.raw('transactions')) || []).length, 1, 'ได้บิลเดียว (ตะกร้าใหม่ 2 รายการ)');
      eq(((await shop.env.raw('transactions'))[0].services || []).length, 2);
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 51 ยอดเปลี่ยนหลังลูกค้าเห็นยอด/สแกน QR (เช่นใส่ส่วนลดเพิ่ม) → ไม่ออกบิล · เปิดใหม่แล้วได้ยอดใหม่', async () => {
    const shop = await freshShop();
    try {
      shop.app.vatEnabled = false;
      readyCheckout(shop.env, [ITEMS[0]], 'cash');
      shop.app.beginCheckoutAttempt();
      eq(shop.app._checkoutAttempt.total, 300);
      shop.env.document.getElementById('cart-discount').value = '50';
      eq(await shop.app.processCheckout(), false);
      eq(((await shop.env.raw('transactions')) || []).length, 0, 'ไม่มีบิลลงเครื่อง');
      ok(shop.toasts.some(t => /ยอดเปลี่ยนจาก ฿300 เป็น ฿250/.test(t.m)), shop.toasts.map(t => t.m).join(' | '));
      shop.app.beginCheckoutAttempt();
      eq(await shop.app.processCheckout(), true);
      eq(((await shop.env.raw('transactions')) || []).map(t => t.total), [250]);
    } finally { shop.env.dispose(); }
  });
  await R.t('ข้อ 51 รอบชำระเงินที่ใช้ไปแล้ว (บิลของรอบนี้ลงเครื่องแล้ว) → ไม่ออกซ้ำ แม้ตะกร้าเดิมยังอยู่', async () => {
    const shop = await freshShop();
    try {
      shop.app.vatEnabled = false;
      readyCheckout(shop.env, [ITEMS[0]], 'cash');
      shop.app.beginCheckoutAttempt();
      const attempt = shop.app._checkoutAttempt;
      const cart = shop.app.state.cart.slice();
      eq(await shop.app.processCheckout(), true);
      // จำลองแตะซ้ำที่มาถึงพร้อมรอบชำระเงินเดิม (ตะกร้าเดิม) — เช่นหน้าจอค้างแล้วกดซ้ำ
      shop.app.state.cart = cart; shop.app._checkoutAttempt = attempt;
      shop.env.document.getElementById('cash-received').value = '100000';
      eq(await shop.app.processCheckout(), false, 'ต้องไม่ออกบิลที่สอง');
      eq(((await shop.env.raw('transactions')) || []).length, 1, 'ในเครื่องมีบิลเดียว');
      ok(shop.toasts.some(t => /ถูกบันทึกไปแล้ว — ไม่ออกซ้ำ/.test(t.m)), 'บอกว่าไม่ออกซ้ำ');
      eq(shop.app._checkoutAttempt, null, 'รอบชำระเงินถูกปิด');
    } finally { shop.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
