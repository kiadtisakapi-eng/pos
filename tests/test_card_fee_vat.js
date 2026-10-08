// F รวม VAT ในตัว: ทดสอบทางขายจริง → IndexedDB → Apps Script → กู้ข้อมูล/แก้บิล/ยกเลิก/รายงาน
// ไม่มี request ออกเน็ตหรือแตะข้อมูลร้านจริง; POS_APP_SRC ใช้ตรวจซ้ำกับโค้ดก่อนแก้ได้
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ค่าธรรมเนียมรวม VAT: ขายจริงและทางเดินทั้งระบบ ---');
const t = R.t;
const CUT = { id: 's1', name: 'ตัดผม', price: 1000 };
const TAX = { id: 'd1', name: 'บริการคิด VAT', price: 1000, category: 'drinks', commission: 10 };
const clone = x => JSON.parse(JSON.stringify(x));
const sat = n => Math.round(n * 100);
const fatal = (app, tx) => app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code);
async function sell(env, items, method, cash, rate, discount) {
  readyCheckout(env, items, method);
  if (discount) { env.document.getElementById('cart-discount').value = String(discount); env.app.beginCheckoutAttempt(); }
  if (cash !== undefined) env.document.getElementById('split-cash-amount').value = String(cash);
  if (rate !== undefined) env.app.selectCardFeeRate(rate);
  const before = env.app.state.transactions.length;
  const res = await env.app.processCheckout(); await settle(40);
  return { res, tx: env.app.state.transactions.length > before ? env.app.state.transactions.at(-1) : null };
}
async function flush(app) { await settle(30); await app.syncPendingTransactions(true); await settle(50); }
function sheetRow(gas, app, tx) {
  const sh = gas.sheet(app.getBusinessMonthKey(tx.date)); if (!sh) return null;
  const row = sh._grid.slice(1).find(r => String(r[0]).trim() === tx.id); if (!row) return null;
  return Object.fromEntries(sh._grid[0].map((h, i) => [String(h).trim(), row[i]]));
}
// อ่านตัวเลขจากคู่ป้าย/ยอดที่ใบเสร็จแสดงจริง (ไม่ใช้ tx.total มายืนยันตัวเอง)
function receiptMoney(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp('<span>' + escaped + '</span>\\s*<span>([^<]+)</span>'));
  ok(m, 'ไม่มีบรรทัด ' + label);
  return Number(m[1].replace(/[฿,]/g, ''));
}

(async () => {
  const shop = await makeShop(); const { env, app, gas } = shop; await settle();
  const saved = [];
  const cases = [
    ['บัตร VAT 7%', [TAX], true, 'credit', undefined, 10, [1000, 1070, 107, 100, 1100, 0, 1100, 77, 0, 1177, 1177]],
    ['แบ่งจ่ายเงินสด 470', [TAX], true, 'split', 470, 10, [1000, 600, 60, 56.07, 1056.07, 0, 1056.07, 73.92, .01, 1130, 660]],
    ['ลดอัตรา 5%', [TAX], true, 'credit', undefined, 5, [1000, 1070, 54, 50.47, 1050.47, 0, 1050.47, 73.53, 0, 1124, 1124]],
    ['น้ำ 2×20', [{ ...TAX, name: 'น้ำ', price: 20, commission: 0 }, { ...TAX, name: 'น้ำ', price: 20, commission: 0 }], true, 'credit', undefined, 10,
      [40, 43, 5, 4.67, 44.67, 0, 44.67, 3.13, .20, 48, 48]],
    ['VAT ปิด', [TAX], false, 'credit', undefined, 10, [1000, 1000, 100, 100, 1100, 1100, 0, 0, 0, 1100, 1100]],
    ['หมวดไม่คิด VAT', [CUT], true, 'credit', undefined, 10, [1000, 1000, 100, 100, 1100, 1100, 0, 0, 0, 1100, 1100]],
    ['บิลปนกัน 1,000 + 100', [CUT, { ...TAX, price: 100 }], true, 'credit', undefined, 10,
      [1100, 1107, 111, 111, 1211, 1111, 100, 7, 0, 1218, 1218]]
  ];
  for (const [name, items, enabled, method, cash, rate, expected] of cases) {
    await t(`ขายจริง + ชีต: ${name} ลงตัวทุกสตางค์และไม่ค้างรอตรวจ`, async () => {
      app.vatEnabled = enabled;
      const { res, tx } = await sell(env, items, method, cash, rate);
      eq(res, true); ok(tx, 'ไม่มีบิล'); saved.push(tx);
      const f = app.cardFeeLineOf(tx);
      eq([tx.details.filter(d => d.kind !== 'card_fee').reduce((s, d) => s + d.price, 0), tx.cardFee.base, tx.cardFee.amount, tx.cardFee.net,
        tx.subtotal, tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding, tx.total,
        app.paymentPartsOf(tx).filter(p => p.method === 'credit').reduce((s, p) => s + p.amount, 0)], expected);
      eq([f.price, f.netPrice, f.staffId, f.commissionAmount], [expected[3], expected[3], '', 0]);
      eq(fatal(app, tx), []); eq(app.billMoneyStatus(tx).settled, true);
      const disk = (await env.raw('transactions')).find(x => x.id === tx.id);
      eq(disk.cardFee, tx.cardFee);
      await flush(app); eq(tx.syncStatus, 'synced', JSON.stringify(tx.syncIssue));
      const row = sheetRow(gas, app, tx); ok(row, 'ไม่มีแถวบนชีต');
      eq([row['ราคารวม (฿)'], row['ยอดสุทธิ (฿)']], [tx.subtotal, tx.total]);
      eq(row['ช่องทางชำระเงิน'], app.sheetPaymentLabel(tx));
    });
  }
  await t('ใบเสร็จ VAT: ตัวเลขที่แสดงบวกลงตัว และบอก F ที่ลูกค้าจ่ายรวม VAT + ฐานส่วนบัตร', () => {
    ok(saved.length >= 4, 'ขายเคสตั้งต้นไม่ครบ');
    for (const tx of saved.slice(0, 4)) {
      Object.getPrototypeOf(app).showThermalReceipt.call(app, tx);
      const html = env.document.getElementById('thermal-receipt-preview').innerHTML;
      const feeLabel = `ค่าธรรมเนียมบัตร ${tx.cardFee.rate}% ก่อน VAT:`;
      const sub = receiptMoney(html, 'รวมค่าบริการ:');
      const disc = receiptMoney(html, 'ส่วนลดพิเศษ:'); // แสดงเครื่องหมายลบอยู่แล้ว
      const net = receiptMoney(html, feeLabel);
      const base = receiptMoney(html, 'ยอดคิด VAT:');
      const vat = receiptMoney(html, 'VAT 7%:');
      const rnd = tx.rounding ? receiptMoney(html, 'ปัดเศษ:') : 0;
      const total = receiptMoney(html, 'รวมทั้งสิ้น:');
      eq(sat(sub) + sat(disc) + sat(net), sat(base)); eq(sat(base) + sat(vat) + sat(rnd), sat(total));
      eq(net, tx.cardFee.net); eq(total, tx.total);
      ok(html.includes(`ค่าธรรมเนียมที่ชำระ ฿${tx.cardFee.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} รวม VAT`), html);
      ok(html.includes(`คิดจากส่วนที่จ่ายบัตร ฿${tx.cardFee.base.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`), html);
      ok(!html.includes('(ยอดรูด ฿'), html);
    }
  });
  await t('หน้าชำระเงิน/ใบแจ้งยอด/แก้บิล/รายงาน: แยก F รวม VAT ออกจากฐานก่อน VAT', () => {
    app.vatEnabled = true; readyCheckout(env, [TAX], 'credit');
    const panel = app.renderCardPaymentPanel(); eq(panel.ok, true);
    eq(env.document.getElementById('card-fee-amount-label').innerText, '฿107.00 (10%) รวม VAT');
    eq(env.document.getElementById('credit-total-label').innerText, '฿1,177.00');
    Object.getPrototypeOf(app).showQuotePreview.call(app);
    const quote = env.document.getElementById('quote-preview').innerHTML;
    ok(quote.includes('฿1,177') && quote.includes('ค่าธรรมเนียม ฿107.00 รวม VAT'), quote);
    app.openTransactionEdit(saved[0].id);
    const edit = env.document.getElementById('edit-tx-services-list').innerHTML;
    ok(edit.includes('฿107.00 รวม VAT · ก่อน VAT ฿100.00'), edit);
    app.state.selectedReportType = 'daily';
    env.document.getElementById('report-date-input').value = app.currentBusinessDateKey();
    env.document.getElementById('report-staff-filter').value = 'all';
    Object.getPrototypeOf(app).filterReports.call(app);
    const rows = env.document.getElementById('report-services-breakdown-body').innerHTML;
    ok(rows.includes('ค่าธรรมเนียมบัตร (ก่อน VAT)'), rows);
    eq(app.buildServiceBreakdown([saved[0]]).rows.find(r => r.name.includes('ค่าธรรมเนียม')).revenue, 100);
  });
  await t('วัน/เดือน/Telegram/ชีต: ช่องทางและ VAT รวมกลับเป็นรายได้ · F รวมจาก amount', async () => {
    ok(saved.length === 7, 'ขายเคสตั้งต้นไม่ครบ');
    for (const kind of ['day', 'month']) {
      const key = kind === 'day' ? app.currentBusinessDateKey() : app.getBusinessMonthKey(saved[0].date);
      const payload = app.buildSummaryPayload(saved, [], kind, key);
      eq(sat(payload.cashRevenue) + sat(payload.qrRevenue) + sat(payload.creditRevenue), sat(payload.totalRevenue));
      eq(sat(payload.nonVatBase) + sat(payload.vatableBase) + sat(payload.vatAmount) + sat(payload.rounding), sat(payload.totalRevenue));
      eq(payload.services.reduce((s, x) => s + sat(x.revenue), 0) + sat(payload.vatAmount) + sat(payload.rounding), sat(payload.totalRevenue));
      eq(payload.vatCategories.reduce((s, x) => s + sat(x.vat), 0), sat(payload.vatAmount));
      eq(payload.excludedInvalid, 0);
      eq(gas.post(payload).status, 'success');
    }
    const msg = app.buildShiftReportMessage({ startTime: app.state.shift.startTime, endTime: Date.now(), startCash: 1000 });
    ok(msg.includes('ค่าธรรมเนียมบัตรที่เก็บ (รวมอยู่ในยอดบัตร): ฿537 (7 บิล)'), msg);
    eq(app.computeShiftDrawer(app.state.shift).cashSales, 470);
    const ownerKey = gas.setupOwnerKey(); app.askOwnerKey = async () => ownerKey;
    const cloud = await app.fetchCloudBills(app.getBusinessMonthKey(saved[0].date));
    saved.forEach(tx => eq(app.reconcileFieldDiffs(tx, cloud.bills.find(b => b.id === tx.id)), []));
  });
  await t('แก้ชื่อลูกค้า/ผู้ให้บริการแล้ว VAT/ค่าธรรมเนียม/ก้อนเงินคงเดิม แม้ร้านปิด VAT ไปแล้ว', async () => {
    const tx = saved[1]; const before = clone(tx);
    app.vatEnabled = false; app.vatRate = 10; app.cardFeeRate = 3;
    app.openTransactionEdit(tx.id);
    env.document.getElementById('edit-tx-customer').value = 'ชื่อลูกค้าใหม่';
    const query = env.document.querySelectorAll;
    env.document.querySelectorAll = sel => sel === '.edit-tx-service-staff-select'
      ? [{ value: 'mg-1', getAttribute: k => k === 'data-index' ? '0' : null }] : query.call(env.document, sel);
    await app.saveTransactionEdit(); await settle(40); await flush(app);
    env.document.querySelectorAll = query;
    eq(tx.customerName, 'ชื่อลูกค้าใหม่'); eq(tx.details[0].staffId, 'mg-1');
    for (const k of ['subtotal', 'discount', 'total', 'vatRate', 'vatAmount', 'rounding', 'vatableBase', 'nonVatBase', 'cardFee', 'payments', 'tender']) eq(tx[k], before[k], k);
    eq(tx.syncStatus, 'synced'); eq(fatal(app, tx), []);
    eq(app.state.queue.filter(q => q.txId === tx.id)[0].services.length, 1);
  });
  await t('ไฟล์สำรอง VAT/แบ่งจ่าย: net ที่เป็นข้อความกลับเป็นตัวเลข · กู้บนเครื่องอื่นแล้วสมการ/ลิ้นชักถูก', async () => {
    const backup = clone(app.buildBackupPayload());
    backup.transactions.forEach(tx => { tx.cardFee.net = tx.cardFee.net.toFixed(2); });
    const other = await makeShop({ onLine: false });
    try {
      ok(other.app.isValidBackupObject(backup), other.app._lastBackupRejectReason);
      other.app.sanitizeBackupData(backup);
      eq((other.app._lastSanitizeQuarantine || []).filter(q => q.kind === 'transaction'), []);
      await other.app.applyBackupData(backup); await settle(30);
      eq(other.app.state.transactions.length, saved.length);
      other.app.state.transactions.forEach(tx => { eq(fatal(other.app, tx), []); eq(typeof tx.cardFee.net, 'number'); });
      eq(other.app.computeShiftDrawer(other.app.state.shift).cashSales, 470);
      eq((await other.env.raw('transactions')).find(tx => tx.id === saved[1].id).cardFee, saved[1].cardFee);
    } finally { other.env.dispose(); }
  });
  await t('validator/net/cache: ฐานผิดหรือไม่แยก VAT ต้องไม่ผ่าน · ไม่มี net แบบเก่าเฉพาะไม่คิด VAT ยังอ่านได้', () => {
    const tx = clone(saved[0]); ok(app.isBillUsable(tx));
    tx.cardFee.net = 99.99; eq(app.isBillUsable(tx), false);
    tx.cardFee.net = 100; eq(app.isBillUsable(tx), true);
    const off = clone(saved[4]); delete off.cardFee.net; eq(fatal(app, off), []);
    for (const value of [null, 'bad', 107, 108]) {
      const bad = clone(saved[0]); bad.cardFee.net = value; ok(fatal(app, bad).includes('card-fee-mismatch'));
    }
    const bad = clone(saved[4]); bad.cardFee.net = 99.99; ok(fatal(app, bad).includes('card-fee-mismatch'));
  });
  env.dispose();

  await t('VAT 0 / F 0 / ส่วนลด / สตางค์จากหลายรายการ / อัตรา VAT 1–100: ยอดเงินคงกติกา', async () => {
    const { env, app } = await makeShop({ onLine: false });
    try {
      app.vatRate = 0;
      const zeroVat = await sell(env, [TAX], 'credit'); ok(zeroVat.tx); eq(fatal(app, zeroVat.tx), []);
      eq([zeroVat.tx.total, zeroVat.tx.cardFee.net, app.cardFeeLineOf(zeroVat.tx).vatable], [1100, 100, false]);
      app.vatRate = 7;
      const noFee = await sell(env, [TAX], 'split', 470, 0); ok(noFee.tx); eq(fatal(app, noFee.tx), []);
      eq([noFee.tx.total, noFee.tx.cardFee.net, noFee.tx.details.length], [1070, 0, 1]);
      const discounted = await sell(env, [TAX, { ...TAX, price: 13 }], 'split', 200, 5, 101);
      ok(discounted.tx); eq(fatal(app, discounted.tx), []);
      eq(discounted.tx.discount, 101); eq(discounted.tx.details[0].commissionAmount + discounted.tx.details[1].commissionAmount, 91);
      app.cardFeeRate = 30;
      for (const vatRate of [1, 5, 7, 10, 20, 100]) for (let price = 1; price <= 200; price++) {
        app.vatRate = vatRate;
        readyCheckout(env, [{ ...TAX, price }], 'credit');
        for (const feeRate of [1, 5, 10, 30]) {
          const p = app.buildCheckoutPlan('credit', { feeRate });
          ok(p.ok, `${vatRate}/${price}/${feeRate}: ${p.error}`);
          eq(p.totals.total, p.base.total + Math.ceil(p.base.total * feeRate / 100));
        }
      }
      app.vatRate = 7; readyCheckout(env, [TAX], 'credit');
      const real = app.computeTotalsAtRate;
      app.computeTotalsAtRate = function(lines, rate) {
        const totals = real.call(this, lines, rate);
        if (lines.length > 1) totals.total += 2; return totals;
      };
      eq(app.buildCheckoutPlan('credit', {}).ok, false, 'หา net ไม่ลงตัวต้องหยุด ไม่เดา');
    } finally { env.dispose(); }
  });
  for (const method of ['credit', 'split']) for (const outcome of ['refunded', 'none']) {
    await t(`ยกเลิก ${method} VAT (${outcome}): ลิ้นชัก/ก้อนบัตร/คิว/ทะเบียนยกเลิกตรงกัน`, async () => {
      const { env, app, gas } = await makeShop();
      try {
        const { tx } = await sell(env, [TAX], method, method === 'split' ? 470 : undefined);
        ok(tx); await flush(app);
        const before = app.computeShiftDrawer(app.state.shift).expected;
        app.openTransactionEdit(tx.id); env.document.getElementById('void-money-outcome').value = outcome;
        await app.voidTransaction(); await app._confirmP; await settle(40);
        ok(!app.state.transactions.some(x => x.id === tx.id)); ok(!app.state.queue.some(q => q.txId === tx.id));
        const v = app.state.voidLog.at(-1);
        eq(v.cashEffect, method === 'split' && outcome === 'refunded' ? -470 : 0);
        eq(before - app.computeShiftDrawer(app.state.shift).expected, -v.cashEffect);
        if (outcome === 'refunded') eq(v.cardRefund, method === 'split' ? 660 : 1177);
        await app.flushCloudOutbox(); await settle(50);
        ok(!sheetRow(gas, app, tx), 'แถวบิลที่ยกเลิกยังอยู่บนชีต');
      } finally { env.dispose(); }
    });
  }
  await t('เขียนฐานข้อมูลล้มเหลวตอนขายแบ่งจ่าย VAT → rollback บิล/คิว/ลูกค้า/งานคลาวด์ และลองใหม่ได้', async () => {
    const { env, app } = await makeShop({ onLine: false });
    try {
      app.state.customers = [{ id: 'c-1', name: 'ลูกค้า', visitCount: 4, tier: 'เดิม' }]; await app.saveStateOrThrow();
      readyCheckout(env, [TAX], 'split'); env.document.getElementById('split-cash-amount').value = '470';
      env.document.getElementById('cart-customer-select').value = 'c-1';
      const before = clone(await env.rawAll());
      const undo = failPutForKeys(['transactions']);
      try { eq(await app.processCheckout(), false); } finally { undo(); }
      eq(await env.rawAll(), before); eq(app.state.transactions.length, 0); eq(app.state.queue.length, 0);
      eq([app.state.customers[0].visitCount, app.state.customers[0].tier], [4, 'เดิม']);
      eq(await app.processCheckout(), true); eq(app.state.transactions.length, 1); eq(app.state.customers[0].visitCount, 5);
    } finally { env.dispose(); }
  });
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
