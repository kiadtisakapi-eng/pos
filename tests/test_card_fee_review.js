// ─────────────────────────────────────────────────────────────────────────────
//  ตรวจซ้ำงาน Codex (Claude · 6 ต.ค. 2569) — ค่าธรรมเนียมบัตร "รวม VAT ในตัว"
//   [1] ด่านตัวตรวจบิลที่ mutation test พบว่ายังไม่มีเทสต์ไหนยืนยัน (ปลดด่านแล้วชุดเดิมยังผ่าน)
//       · บรรทัดค่าธรรมเนียมคิด VAT แต่ net = F (สูตรเก่าที่บวก VAT ซ้ำ) ทั้งที่ยอดบิล = ราคาเงินสด + F พอดี
//       · บรรทัดค่าธรรมเนียมไม่คิด VAT แต่ net ≠ F (ซ่อนเศษไว้ในเงินปัดเศษ)
//       · F ไม่ตรงสูตร cardFeeFor(ฐาน, อัตรา) ทั้งที่ ฐาน + F = ก้อนบัตร
//       แต่ละเคสสร้างจากบิลที่ขายจริงแล้วแก้ให้ "ทุกสมการอื่นยังลงตัว" → ต้องติดเฉพาะ card-fee-mismatch
//   [2] เพดานบิลตอนวางแผนรูดบัตรเมื่อ VAT ทำให้ยอดเกิน แต่ราคาก่อน VAT ยังไม่เกิน (ปุ่มยืนยันต้องปิดตั้งแต่หน้าจอ)
//   [3] ทางเดินจริงของบิล VAT: ชีต 8 ช่อง · สรุปวัน/เดือน · แก้ชื่อ/ผู้ให้บริการบิลส่วนลดหลายรายการ ·
//       แก้ส่วนลดถูกปฏิเสธ · เขียนไม่สำเร็จแล้วย้อนครบ (แก้บิล/ยกเลิก) · กู้บนเครื่องใหม่ได้สรุป/Telegram เดิม · ปิดกะ
//   พิสูจน์ว่าจับของจริง: ปลดด่านทีละจุดใน app.js แล้วรันผ่าน POS_APP_SRC → [1]/[2] ต้องตก (ดูรายงานตรวจ)
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ตรวจซ้ำค่าธรรมเนียมบัตรรวม VAT (Claude) ---');
const t = R.t;
const sat = n => Math.round(Number(n) * 100);
const clone = x => JSON.parse(JSON.stringify(x));
const fatal = (app, tx) => app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code);
const TAX = { id: 'd1', name: 'บริการคิด VAT', price: 1000, category: 'drinks', commission: 10, commissionType: 'percent' };
const CUT = { id: 's1', name: 'ตัดผม', price: 1000 };
const DRINK = { ...TAX, name: 'น้ำ', price: 20, commission: 0 };

async function sell(env, items, method, o) {
  o = o || {};
  const app = env.app;
  readyCheckout(env, items, method);
  if (o.discount) { env.document.getElementById('cart-discount').value = String(o.discount); app.beginCheckoutAttempt(); }
  if (o.rate !== undefined) app.selectCardFeeRate(o.rate);
  if (o.cash !== undefined) env.document.getElementById('split-cash-amount').value = String(o.cash);
  const base = app.getCartBillTotals();
  const before = app.state.transactions.length;
  const res = await app.processCheckout(); await settle(40);
  return { res, base, tx: app.state.transactions.length > before ? app.state.transactions.at(-1) : null };
}
// สมการที่ตัวตรวจบิลใช้ — ใช้ยืนยันว่าบิลที่แก้ขึ้นมา "ลงตัวทุกด่านอื่น" จริง ไม่ได้ตกเพราะด่านอื่น
function balanced(tx) {
  const fee = tx.details.filter(d => d.kind === 'card_fee');
  return sat(tx.subtotal) - sat(tx.discount) === sat(tx.nonVatBase) + sat(tx.vatableBase) &&
    sat(tx.nonVatBase) + sat(tx.vatableBase) + sat(tx.vatAmount) + sat(tx.rounding) === sat(tx.total) &&
    Math.round(sat(tx.vatableBase) * (Number(tx.vatRate) || 0) / 100) === sat(tx.vatAmount) &&
    tx.details.reduce((s, d) => s + sat(d.price), 0) === sat(tx.subtotal) &&
    fee.length === 1 && sat(fee[0].price) === sat(tx.cardFee.net);
}
const rowsOf = (gas, key) => {
  const sh = gas.sheet(key); if (!sh) return [];
  const h = sh._grid[0].map(x => String(x).trim());
  return sh._grid.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
};

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] ตัวตรวจบิล: ข้อมูลค่าธรรมเนียมผิด แต่สมการเงิน/VAT ทั้งบิลยังลงตัว');
// ═══════════════════════════════════════════════════════════════════════════
{
  const { env, app } = await makeShop();
  await settle();
  // ขายจริง: น้ำ 2×20 คิด VAT · ลดเหลือ 3% → ราคาเงินสด 43 · F = 2 (รวม VAT) · net 1.87
  const vat = await sell(env, [DRINK, { ...DRINK, uniqueCartId: 'w2' }], 'credit', { rate: 3 });
  await t('(เงื่อนไข) บิลจริง: น้ำ 2×20 · 3% → F 2 รวม VAT · net 1.87 · ยอด 45 · ไม่มีข้อเสีย', () => {
    eq(vat.res, true);
    eq([vat.base.total, vat.tx.cardFee.amount, vat.tx.cardFee.net, vat.tx.vatableBase, vat.tx.vatAmount, vat.tx.rounding, vat.tx.total],
       [43, 2, 1.87, 41.87, 2.93, 0.2, 45]);
    eq(fatal(app, vat.tx), []);
  });
  await t('บรรทัดคิด VAT แต่ net = F (สูตรเก่า บวก VAT บน F) — ยอด 45 = 43 + 2 พอดี → ต้องติด card-fee-mismatch เท่านั้น', () => {
    const tx = clone(vat.tx);
    const fl = tx.details.find(d => d.kind === 'card_fee');
    fl.price = fl.netPrice = 2; tx.cardFee.net = 2;
    tx.subtotal = 42; tx.vatableBase = 42; tx.vatAmount = 2.94; tx.rounding = 0.06;   // 42 × 7% = 2.94 → 44.94 ปัดเป็น 45
    ok(balanced(tx), 'บิลที่แก้ขึ้นมาไม่ลงตัวเอง — เทสต์ไม่ได้พิสูจน์ด่านนี้');
    eq(fatal(app, tx), ['card-fee-mismatch']);
    ok(!app.isBillUsable(tx));
  });
  const off = await sell(env, [CUT], 'credit');   // หมวดไม่คิด VAT → F 100 ไม่คิด VAT
  await t('บรรทัดไม่คิด VAT แต่ net ≠ F (ซ่อน 0.01 ไว้ในเงินปัดเศษ) → ต้องติด card-fee-mismatch เท่านั้น', () => {
    eq([off.res, off.tx.cardFee.amount, off.tx.cardFee.net, off.tx.total], [true, 100, 100, 1100]);
    const tx = clone(off.tx);
    const fl = tx.details.find(d => d.kind === 'card_fee');
    fl.price = fl.netPrice = 99.99; tx.cardFee.net = 99.99;
    tx.subtotal = 1099.99; tx.nonVatBase = 1099.99; tx.rounding = 0.01;               // ยอดสุทธิยัง 1,100
    ok(balanced(tx), 'บิลที่แก้ขึ้นมาไม่ลงตัวเอง — เทสต์ไม่ได้พิสูจน์ด่านนี้');
    eq(fatal(app, tx), ['card-fee-mismatch']);
  });
  await t('F ไม่ตรงสูตร (10% ของ 1,000 ต้อง 100 แต่บันทึก 99) ทั้งที่ ฐาน + F = ก้อนบัตร → ต้องติด card-fee-mismatch เท่านั้น', () => {
    const tx = clone(off.tx);
    const fl = tx.details.find(d => d.kind === 'card_fee');
    fl.price = fl.netPrice = 99; tx.cardFee.amount = 99; tx.cardFee.net = 99;
    tx.subtotal = tx.nonVatBase = tx.total = tx.tender.amount = 1099;
    ok(balanced(tx), 'บิลที่แก้ขึ้นมาไม่ลงตัวเอง — เทสต์ไม่ได้พิสูจน์ด่านนี้');
    eq(app.paymentPartsOf(tx), [{ method: 'credit', amount: 1099 }]);
    eq(fatal(app, tx), ['card-fee-mismatch']);
  });
  env.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] เพดานบิล: VAT + F ทำให้ยอดเกิน 10,000,000 แต่ราคาก่อน VAT ยังไม่เกิน');
// ═══════════════════════════════════════════════════════════════════════════
{
  const { env, app, toasts } = await makeShop();
  await settle();
  readyCheckout(env, [{ ...TAX, price: 9000000 }], 'credit');
  await t('(เงื่อนไข) ราคาเงินสด 9,630,000 + F 963,000 = 10,593,000 เกินเพดาน · แต่ราคา 9,000,000 + ฐาน F 900,000 ไม่เกิน', () => {
    eq(app.getCartBillTotals().total, 9630000);
    ok(9630000 + 963000 > 10000000 && 9000000 + 900000 <= 10000000);
  });
  const before = clone(await env.rawAll());
  await t('แผนรูดบัตรไม่ผ่านตั้งแต่หน้าจอ (ปุ่มยืนยันปิด) · กดยืนยันก็ไม่เกิดบิล/ไม่แตะฐานข้อมูล', async () => {
    const p = app.buildCheckoutPlan('credit', {});
    eq(p.ok, false); ok(/เพดาน/.test(p.error), p.error);
    eq(app.renderCardPaymentPanel().ok, false);
    eq(env.document.getElementById('btn-complete-checkout').disabled, true);
    eq(await app.processCheckout(), false);
    eq(app.state.transactions.length, 0); eq(await env.rawAll(), before);
    ok(toasts.some(x => /เพดาน/.test(x.m)), JSON.stringify(toasts));
  });
  env.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] ทางเดินจริงของบิล VAT: ชีต · สรุป · แก้บิล · ย้อนค่า · ยกเลิก · กู้ข้อมูล · ปิดกะ');
// ═══════════════════════════════════════════════════════════════════════════
{
  const { env, app, gas } = await makeShop();
  await settle();
  const sold = [];
  const plan = [
    ['บัตร 1,177', [TAX], 'credit', {}, [1177, 107, 1177]],
    ['แบ่งจ่าย 470 → รูด 660 · บิล 1,130', [TAX], 'split', { cash: 470 }, [1130, 60, 660]],
    ['บัตรลด 5% → 1,124', [TAX], 'credit', { rate: 5 }, [1124, 54, 1124]],
    ['น้ำ 2×20 → 48', [DRINK, { ...DRINK, uniqueCartId: 'w2' }], 'credit', {}, [48, 5, 48]],
    ['สองรายการ + ส่วนลด 101 + แบ่งจ่าย 200 + 5%', [TAX, { ...TAX, price: 13, uniqueCartId: 'z' }], 'split', { cash: 200, discount: 101, rate: 5 }, null],
    ['บิลปนกัน (F ไม่คิด VAT ตามกติกาเดิม)', [CUT, { ...TAX, price: 100, uniqueCartId: 'm' }], 'credit', {}, [1218, 111, 1218]],
  ];
  for (const [name, items, method, o, exp] of plan) {
    const { res, base, tx } = await sell(env, items, method, o);
    await t(`ขาย ${name}: สมการ/VAT ลงตัว · ยอดบิล = ราคาเงินสด + F · ยอดรูด = ส่วนบัตร + F`, () => {
      eq(res, true); ok(tx, 'ไม่มีบิล'); sold.push(tx);
      const cf = tx.cardFee, fl = app.cardFeeLineOf(tx);
      eq(fatal(app, tx), []); ok(balanced(tx), 'สมการเงิน/VAT ไม่ลงตัว');
      eq(sat(tx.total), sat(base.total) + cf.amount * 100);
      const card = app.paymentPartsOf(tx).filter(p => p.method === 'credit').reduce((s, p) => s + sat(p.amount), 0);
      eq(card, sat(cf.base) + cf.amount * 100);
      eq(cf.amount, Math.ceil(cf.base * cf.rate / 100));
      ok(fl.vatable ? sat(cf.net) < cf.amount * 100 : sat(cf.net) === cf.amount * 100, 'net/F');
      if (exp) eq([tx.total, cf.amount, card / 100], exp);
    });
  }
  await app.syncPendingTransactions(true); await settle(80);
  const key = app.getBusinessMonthKey(sold[0].date);
  await t('ชีตเดือน: ทุกบิล synced · 8 ช่องเงิน + ป้ายช่องทางตรงกับในเครื่องทุกสตางค์', () => {
    const rows = rowsOf(gas, key);
    sold.forEach(tx => {
      eq(tx.syncStatus, 'synced', tx.id);
      const r = rows.find(x => String(x['เลขที่บิล']).trim() === tx.id); ok(r, 'ไม่มีแถว ' + tx.id);
      eq([r['ราคารวม (฿)'], r['ส่วนลด (฿)'], r['ไม่คิด VAT (฿)'], r['คิด VAT (฿)'], r['VAT (฿)'], r['ปัดเศษ (฿)'], r['ยอดสุทธิ (฿)'], r['ช่องทางชำระเงิน']],
         [tx.subtotal, tx.discount, tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding, tx.total, app.sheetPaymentLabel(tx)], tx.id);
    });
  });
  for (const kind of ['day', 'month']) {
    await t(`สรุป${kind === 'day' ? 'วัน' : 'เดือน'}: เงินสดเฉพาะก้อนเงินสด · ช่องทาง/VAT/บริการรวมกลับเป็นรายได้ · Apps Script รับ`, () => {
      const p = app.buildSummaryPayload(app.state.transactions, [], kind, kind === 'day' ? app.currentBusinessDateKey() : key);
      const totalSat = sold.reduce((s, x) => s + sat(x.total), 0);
      eq(sat(p.totalRevenue), totalSat);
      eq(sat(p.cashRevenue) + sat(p.qrRevenue) + sat(p.creditRevenue), totalSat);
      eq(sat(p.cashRevenue), (470 + 200) * 100);
      eq(sat(p.vatAmount), sold.reduce((s, x) => s + sat(x.vatAmount), 0));
      eq(p.vatCategories.reduce((s, x) => s + sat(x.vat), 0), sat(p.vatAmount));
      eq(p.services.reduce((s, x) => s + sat(x.revenue), 0) + sat(p.vatAmount) + sat(p.rounding), totalSat);
      eq(p.excludedInvalid, 0);
      eq(gas.post(p).status, 'success');
    });
  }
  const multi = sold[4];
  await t('แก้ชื่อลูกค้า + ย้ายผู้ให้บริการ (บิลส่วนลด/หลายรายการ/แบ่งจ่าย/VAT): เงินทุกช่องคงเดิม · ขึ้นชีตรุ่น 2', async () => {
    const before = clone(multi);
    app.openTransactionEdit(multi.id);
    env.document.getElementById('edit-tx-customer').value = 'คุณแก้ชื่อ';
    const q = env.document.querySelectorAll;
    env.document.querySelectorAll = sel => sel === '.edit-tx-service-staff-select'
      ? [{ value: 'mg-1', getAttribute: k => k === 'data-index' ? '1' : null }] : q.call(env.document, sel);
    try { await app.saveTransactionEdit(); } finally { env.document.querySelectorAll = q; }
    await settle(40); await app.syncPendingTransactions(true); await settle(60);
    eq([multi.customerName, multi.details[1].staffId, multi.rev, multi.syncStatus], ['คุณแก้ชื่อ', 'mg-1', 2, 'synced']);
    for (const k of ['subtotal', 'discount', 'nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'total', 'cardFee', 'payments', 'tender']) eq(multi[k], before[k], k);
    eq(multi.details.map(d => [d.price, d.netPrice, d.commissionAmount]), before.details.map(d => [d.price, d.netPrice, d.commissionAmount]));
    eq(fatal(app, multi), []);
  });
  await t('แก้ส่วนลดของบิลบัตร VAT → ถูกปฏิเสธ บิลไม่เปลี่ยนแม้แต่ช่องเดียว', async () => {
    const before = clone(sold[0]);
    app.openTransactionEdit(sold[0].id);
    env.document.getElementById('edit-tx-discount').value = '10';
    await app.saveTransactionEdit(); await settle(30);
    eq(clone(sold[0]), before);
  });
  await t('แก้ชื่อบิลแบ่งจ่าย VAT แต่เขียนฐานข้อมูลไม่สำเร็จ → บิล/ทะเบียนแก้/คิวคลาวด์/ในเครื่องย้อนครบ', async () => {
    const tx = sold[1]; const before = clone(tx);
    const log0 = clone(app.state.editLog || []), out0 = clone(app.state.cloudOutbox || []);
    const disk0 = clone(await env.raw('transactions'));
    app.openTransactionEdit(tx.id);
    env.document.getElementById('edit-tx-customer').value = 'ห้ามติด';
    const undo = failPutForKeys(['transactions'], 'sync');
    try { await app.saveTransactionEdit(); } catch (e) { /* ทางบันทึกฟ้องเองแล้ว */ } finally { undo(); }
    await settle(40);
    eq(clone(tx), before); eq(clone(app.state.editLog || []), log0); eq(clone(app.state.cloudOutbox || []), out0);
    eq(clone(await env.raw('transactions')), disk0);
  });
  await t('ยกเลิกบิลแบ่งจ่าย VAT แต่เขียนไม่สำเร็จ → บิลยังอยู่ · ลิ้นชัก/ทะเบียนยกเลิกเท่าเดิม', async () => {
    const tx = sold[1];
    const drawer0 = app.computeShiftDrawer(app.state.shift).expected, void0 = (app.state.voidLog || []).length;
    app.openTransactionEdit(tx.id); env.document.getElementById('void-money-outcome').value = 'refunded';
    const undo = failPutForKeys(['transactions'], 'sync');
    try { await app.voidTransaction(); await app._confirmP; } catch (e) { /* ทางยกเลิกฟ้องเองแล้ว */ } finally { undo(); }
    await settle(40);
    ok(app.state.transactions.some(x => x.id === tx.id));
    eq(app.computeShiftDrawer(app.state.shift).expected, drawer0); eq((app.state.voidLog || []).length, void0);
    ok((await env.raw('transactions')).some(x => x.id === tx.id));
  });
  await t('ไฟล์สำรอง → กู้บนเครื่องใหม่: บิลไม่ติดด่าน · สรุปวัน/Telegram/ลิ้นชักเหมือนต้นทางทุกตัวอักษร', async () => {
    const backup = clone(app.buildBackupPayload());
    const other = await makeShop({ onLine: false });
    try {
      ok(other.app.isValidBackupObject(backup), other.app._lastBackupRejectReason);
      other.app.sanitizeBackupData(backup);
      await other.app.applyBackupData(backup); await settle(40);
      eq(other.app.state.transactions.length, app.state.transactions.length);
      other.app.state.transactions.forEach(x => eq(fatal(other.app, x), []));
      const strip = p => { const c = clone(p); delete c.deviceId; delete c.deviceLabel; delete c.generatedAt; return c; };   // ต่างเครื่อง/ต่างเวลาสร้าง
      const k = app.currentBusinessDateKey();
      eq(strip(other.app.buildSummaryPayload(other.app.state.transactions, [], 'day', k)), strip(app.buildSummaryPayload(app.state.transactions, [], 'day', k)));
      const shiftArg = { startTime: app.state.shift.startTime, endTime: Date.now(), startCash: 1000 };
      eq(other.app.buildShiftReportMessage(shiftArg), app.buildShiftReportMessage(shiftArg));
      eq(other.app.computeShiftDrawer(other.app.state.shift).cashSales, app.computeShiftDrawer(app.state.shift).cashSales);
    } finally { other.env.dispose(); }
  });
  await t('ปิดกะ: ลิ้นชักนับเฉพาะก้อนเงินสด · Telegram บอก F รวม VAT / จำนวนบิลแบ่งจ่าย / ยอดที่ลดพร้อมจำนวนบิล', async () => {
    eq(app.computeShiftDrawer(app.state.shift).cashSales, 470 + 200);
    const msg = app.buildShiftReportMessage({ startTime: app.state.shift.startTime, endTime: Date.now(), startCash: 1000 });
    const fSum = sold.reduce((s, x) => s + (app.cardFeeLineOf(x) ? x.cardFee.amount : 0), 0);
    ok(msg.includes(`ค่าธรรมเนียมบัตรที่เก็บ (รวมอยู่ในยอดบัตร): ฿${fSum.toLocaleString('th-TH')} (${sold.length} บิล)`), msg);
    ok(/บิลแบ่งจ่าย \(เงินสด\+บัตร\): 2 บิล/.test(msg), msg);
    const lost = sold.filter(x => x.cardFee.rate < x.cardFee.baseRate).reduce((s, x) => s + x.cardFee.fullAmount - x.cardFee.amount, 0);
    ok(msg.includes(`ลด/ไม่คิดค่าธรรมเนียมบัตร: 2 บิล (ลดไป ฿${lost.toLocaleString('th-TH')})`), msg);
    app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(150);
    ok(!(app.state.shift && app.state.shift.active), 'ปิดกะไม่สำเร็จ');
  });
  env.dispose();
}
R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
