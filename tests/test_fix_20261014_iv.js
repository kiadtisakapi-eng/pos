// ตรวจ 14 ต.ค. 2569 — 2 ข้อที่ผู้ตรวจอิสระเจอหลังรวมชุดแก้
// R1: เพดานเงินของบิล (ข้อ 12) ต้องไม่ตีบิล VAT รุ่นแรก (ไม่มี vatRate · ภาษี 7%) ว่าเงินรับเสีย หลังแก้ช่องทาง
// R2: ด่านตรวจบิลตอนชำระเงิน (ข้อ 4) ปฏิเสธแล้ว ต้องคืนจำนวนครั้ง/ระดับของลูกค้า
const T = __dirname + '/';
const { makeShop, readyCheckout, settle } = require(T + 'fixtures_db');
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); } };

(async () => {
  {
    const { env, app } = await makeShop();
    readyCheckout(env, [{ id: 'd1', name: 'น้ำ', price: 1000, category: 'drinks' }], 'cash', 2000);
    await app.processCheckout(); await settle(30);
    const tx = app.state.transactions.at(-1);
    delete tx.vatRate; delete tx.tender; tx.details.forEach(d => delete d.vatable);
    await app.withMutation('t', async () => { await app.saveState(); return true; });
    const before = app.computeShiftDrawer(app.state.shift).expected;
    app.openTransactionEdit(tx.id); env.document.getElementById('edit-tx-payment').value = 'promptpay';
    await app.saveTransactionEdit(); await settle(30);
    const d = app.computeShiftDrawer(app.state.shift);
    t('R1 บิล VAT รุ่นแรกแก้ช่องทางแล้ว เงินรับตอนขายยังใช้ได้', app.tenderOf(tx).valid === true);
    t('R1 ลิ้นชักยังนับเงินสดของบิล (ไม่หายทั้งก้อน)', d.expected === before && (d.invalidBills || []).length === 0, `expected ${d.expected} before ${before}`);
    t('R1 บันทึกส่วนต่างได้', (await app.recordBillSettlement(tx.id, 'correction')) === true);
    env.dispose();
  }
  {
    const { env, app } = await makeShop();
    app.state.customers = [{ id: 'c-1', name: 'ลูกค้าทดสอบ', phone: '0800000000', visitCount: 4 }];
    const realValidate = app.validateBillRecord;
    app.validateBillRecord = function (tx, o) { const p = realValidate.call(this, tx, o); return tx && tx.checkoutAttemptId ? p.concat([{ code: 'x', msg: 'จำลองข้อมูลเสีย', fatal: true }]) : p; };
    for (let i = 0; i < 2; i++) {
      readyCheckout(env, null, 'cash', 300);
      env.document.getElementById('cart-customer-select').value = 'c-1';
      await app.processCheckout(); await settle(30);
    }
    t('R2 ถูกปฏิเสธ 2 รอบ ไม่มีบิล และจำนวนครั้งไม่ขยับ', app.state.transactions.length === 0 && app.state.customers[0].visitCount === 4 && !app.state.customers[0].tier,
      `bills ${app.state.transactions.length} visit ${app.state.customers[0].visitCount}`);
    app.validateBillRecord = realValidate;
    readyCheckout(env, null, 'cash', 300); env.document.getElementById('cart-customer-select').value = 'c-1';
    await app.processCheckout(); await settle(30);
    const db = (await env.raw('customers'))[0];
    t('R2 ขายจริง 1 บิลแล้วในฐานข้อมูล = 5 ครั้ง', db.visitCount === 5, 'got ' + db.visitCount);
    env.dispose();
  }
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
