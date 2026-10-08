// บั๊กที่ตรวจพบรอบ Codex 6 ต.ค. 2569: แต่ละเคสเรียกตัวจริงบน IndexedDB และต้องตกกับ POS_APP_SRC ก่อนแก้
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ด่านเงินค่าธรรมเนียมบัตร: regression ---');
const t = R.t;
const CUT = [{ id: 's1', name: 'ตัดผม', price: 1000 }];
const clone = x => JSON.parse(JSON.stringify(x));
const fatal = (app, tx) => app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code);

(async () => {
  // fixture บิลที่โค้ด v1.9.0 ก่อนแก้ออกได้จริง (ไม่มี cardFee.net; หมวดไม่คิด VAT)
  const { env, app } = await makeShop();
  await settle();
  readyCheckout(env, CUT, 'credit');
  ok(await app.processCheckout(), 'ขายตั้งต้นไม่ผ่าน'); await settle(40);
  const original = clone(app.state.transactions[0]);
  delete original.cardFee.net;
  await t('บิลก่อนมี net ที่ไม่คิด VAT ยังอ่านได้', () => eq(fatal(app, original), []));
  const mutate = f => { const tx = clone(original); f(tx); return tx; };
  await t('ลบบรรทัดค่าธรรมเนียม แต่คง cardFee.amount > 0 → ห้ามสรุป/กู้เป็นบิลดี', () => {
    const tx = mutate(x => {
      x.details = x.details.filter(d => d.kind !== 'card_fee');
      x.subtotal = x.nonVatBase = x.total = x.tender.amount = 1000;
    });
    ok(fatal(app, tx).includes('card-fee-mismatch'), JSON.stringify(fatal(app, tx)));
    ok(!app.isBillUsable(tx));
    const backup = app.buildBackupPayload(); backup.transactions = [tx];
    app.sanitizeBackupData(backup);
    eq(backup.transactions.length, 0);
    ok(app._lastSanitizeQuarantine.some(q => q.id === tx.id && q.reasons.includes('card-fee-mismatch')));
  });
  await t('อัตราทศนิยม/สูงกว่าอัตราร้าน/เกินเพดาน/ฐานที่ผิด → ไม่ให้ข้อมูลบัตรเสียผ่าน', () => {
    for (const f of [x => { x.cardFee.rate = 2.5; }, x => { x.cardFee.baseRate = 5; },
      x => { x.cardFee.baseRate = 31; }, x => { x.cardFee.base = 900; }, x => { x.cardFee.fullAmount = 99; }]) {
      const tx = mutate(f); ok(fatal(app, tx).includes('card-fee-mismatch'), JSON.stringify(tx.cardFee));
    }
  });
  await t('ฐาน + F ต้องตรงก้อนบัตร แม้สูตรปัดค่าธรรมเนียมยังได้ 100', () => {
    const tx = mutate(x => { x.cardFee.base = 999; });
    ok(fatal(app, tx).includes('card-fee-mismatch'), JSON.stringify(fatal(app, tx)));
  });
  await t('ค่าธรรมเนียม 0 ต้องไม่มีบรรทัดพิเศษ', () => {
    const tx = mutate(x => {
      x.cardFee.rate = x.cardFee.amount = 0;
      x.details[1].price = x.details[1].netPrice = 0;
      x.subtotal = x.nonVatBase = x.total = x.tender.amount = 1000;
    });
    ok(fatal(app, tx).includes('card-fee-mismatch'), JSON.stringify(fatal(app, tx)));
  });
  await t('cache ของบิลต้องตรวจใหม่เมื่อ baseRate/fullAmount เปลี่ยน', () => {
    for (const key of ['baseRate', 'fullAmount']) {
      const tx = clone(original); ok(app.isBillUsable(tx));
      tx.cardFee[key] = key === 'baseRate' ? 5 : 99;
      eq(app.isBillUsable(tx), false, key);
      eq(app.buildSummaryPayload([tx], [], 'day', app.currentBusinessDateKey()).excludedInvalid, 1);
    }
  });
  await t('cache ของบิลต้องตรวจใหม่เมื่อค่าคอมกลายเป็นข้อมูลเสีย (ทุกช่องทาง)', () => {
    for (const pay of ['credit', 'cash']) {
      const tx = clone(original);
      if (pay === 'cash') {
        delete tx.cardFee; tx.details.pop(); tx.paymentMethod = tx.tender.method = 'cash';
        tx.total = tx.subtotal = tx.nonVatBase = tx.tender.amount = 1000;
      }
      ok(app.isBillUsable(tx)); tx.details[0].commissionAmount = 'bad';
      ok(fatal(app, tx).includes('bad-details')); eq(app.isBillUsable(tx), false);
    }
  });
  env.dispose();

  for (const pay of ['credit', 'split']) {
    const shop = await makeShop(); const { env, app, toasts } = shop; await settle();
    readyCheckout(env, CUT, pay);
    if (pay === 'split') env.document.getElementById('split-cash-amount').value = '400';
    const before = clone(await env.rawAll());
    const get = env.document.getElementById.bind(env.document);
    env.document.getElementById = id => id === 'card-fee-custom' ? null : get(id);
    await t(`ช่องอัตราค่าธรรมเนียมหาย (${pay}) → ไม่ออกบิล/ไม่เดาอัตราร้าน · จอปิดปุ่มและบอกเหตุผล`, async () => {
      const panel = app.renderCardPaymentPanel();
      eq(panel.ok, false); ok(/ช่อง.*ค่าธรรมเนียม/.test(panel.error), panel.error);
      eq(get('btn-complete-checkout').disabled, true);
      eq(await app.processCheckout(), false);
      eq(app.state.transactions.length, 0); eq(app.state.queue.length, 0);
      eq(await env.rawAll(), before);
      ok(toasts.some(x => /ช่อง.*ค่าธรรมเนียม/.test(x.m)), JSON.stringify(toasts));
    });
    env.dispose();
  }

  for (const [name, price, pay, taxable] of [
    ['บัตร: F ทำให้ยอดเกินเพดานเดิมของตัวตรวจบิล', 10000000, 'credit', false],
    ['เงินสด: VAT ทำให้ยอดเกินเพดานเดิมของตัวตรวจบิล', 10000000, 'cash', true],
    ['บัตร: ราคาบริการเกินเพดานแต่ลดเหลือยอดเล็ก', 10000001, 'credit', false]
  ]) {
    const { env, app, toasts } = await makeShop(); await settle();
    readyCheckout(env, [{ ...CUT[0], price, category: taxable ? 'drinks' : 'barber' }], pay);
    if (price > 10000000) {
      env.document.getElementById('cart-discount').value = '10000000'; app.beginCheckoutAttempt();
    }
    const before = clone(await env.rawAll());
    await t(`${name} → หยุดก่อนบันทึก ไม่สร้างบิลรอตรวจ`, async () => {
      eq(await app.processCheckout(), false);
      if (pay === 'credit') ok(!app.buildCheckoutPlan(pay, {}).ok, 'แผนยังรับยอดเกินเพดาน');
      eq(app.state.transactions.length, 0); eq(app.state.queue.length, 0);
      eq(await env.rawAll(), before);
      ok(toasts.some(x => /ยอด|ราคา|เพดาน/.test(x.m)), JSON.stringify(toasts));
    });
    env.dispose();
  }
  for (const pay of ['credit', 'promptpay']) {
    const { env, app } = await makeShop(); await settle();
    const items = pay === 'credit' ? Array.from({ length: 500 }, () => ({ ...CUT[0], price: 1 }))
      : [{ ...CUT[0], price: 10000000, category: 'drinks' }];
    readyCheckout(env, items, pay);
    const before = clone(await env.rawAll());
    await t(`${pay === 'credit' ? '500 บริการ + บรรทัดค่าธรรมเนียม' : 'โอน/QR: VAT ทำให้ยอดเกินเพดาน'} → หยุดก่อนเกิดบิลที่ Apps Script จะปฏิเสธ`, async () => {
      eq(await app.processCheckout(), false);
      eq(app.state.transactions.length, 0); eq(app.state.queue.length, 0); eq(await env.rawAll(), before);
    });
    env.dispose();
  }
  for (const items of [[{ ...CUT[0], price: 10000000 }], Array.from({ length: 500 }, () => ({ ...CUT[0], price: 1 }))]) {
    const { env, app } = await makeShop(); await settle();
    readyCheckout(env, items, 'credit'); app.selectCardFeeRate(0);
    await t(`ขอบเขตที่ยังรับได้: ${items.length === 500 ? '500 บรรทัด' : '10,000,000 บาท'} เมื่อไม่คิดค่าธรรมเนียม`, async () => {
      eq(await app.processCheckout(), true); await settle(40);
      const tx = app.state.transactions.at(-1); eq(fatal(app, tx), []);
      await app.syncPendingTransactions(true); await settle(40);
      eq(tx.syncStatus, 'synced', JSON.stringify(tx.syncIssue));
    });
    env.dispose();
  }
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
