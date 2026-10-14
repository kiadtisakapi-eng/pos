// Independent regression: legacy VAT edits must retain tax and the original cash tender.
// Uses only the in-memory Google simulator; no real shop data or external requests.
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db');
const R = makeRunner('--- Codex independent review 14 Oct 2026 ---');

async function oldVatBill(mixed, missingFlags) {
  const shop = await makeShop();
  const { env, app } = shop;
  readyCheckout(env, [{ id: 'd1', name: 'VAT test', price: 1000, category: 'drinks' },
    ...(mixed ? [{ id: 's1', name: 'Non-VAT test', price: 1000, category: 'barber' }] : [])], 'cash', 3000);
  await app.processCheckout(); await settle(30);
  const tx = app.state.transactions.at(-1);
  delete tx.vatRate; delete tx.tender;
  if (missingFlags) tx.details.forEach(d => delete d.vatable);
  await app.withMutation('test fixture', () => app.saveState());
  return { ...shop, tx };
}

async function discount(shop, amount) {
  shop.app.openTransactionEdit(shop.tx.id);
  shop.env.document.getElementById('edit-tx-discount').value = String(amount);
  await shop.app.saveTransactionEdit(); await settle(30);
}

(async () => {
  for (const mixed of [false, true]) {
    await R.t(`legacy VAT with line flags: discount keeps 7% tax (${mixed ? 'mixed' : 'all taxable'})`, async () => {
      const shop = await oldVatBill(mixed, false);
      try {
        await discount(shop, mixed ? 200 : 100);
        eq(shop.tx.vatAmount, 63);
        eq(shop.tx.total, mixed ? 1863 : 963);
        ok(shop.app.tenderOf(shop.tx).valid, 'original tender rejected');
        eq(shop.app.computeShiftDrawer(shop.app.state.shift).expected, mixed ? 3070 : 2070);
        eq(shop.app.validateBillRecord(shop.tx).filter(p => p.fatal), []);
        ok(await shop.app.recordBillSettlement(shop.tx.id, 'moved', 'cash'), 'refund blocked');
        eq(shop.app.computeShiftDrawer(shop.app.state.shift).expected, mixed ? 2863 : 1963);
      } finally { shop.env.dispose(); }
    });
  }
  await R.t('legacy VAT without line flags: all-taxable bill remains editable', async () => {
    const shop = await oldVatBill(false, true);
    try {
      await discount(shop, 100);
      eq(shop.tx.vatAmount, 63); eq(shop.tx.total, 963);
      ok(shop.app.tenderOf(shop.tx).valid);
      await discount(shop, 200);
      eq(shop.tx.vatAmount, 56); eq(shop.tx.total, 856);
      ok(shop.app.tenderOf(shop.tx).valid);
    } finally { shop.env.dispose(); }
  });
  await R.t('legacy mixed VAT without line flags: refuses an unknowable tax split without changing the bill', async () => {
    const shop = await oldVatBill(true, true);
    try {
      const before = JSON.stringify(shop.tx);
      await discount(shop, 200);
      eq(JSON.stringify(shop.tx), before, 'bill changed despite missing tax classification');
      ok(shop.toasts.some(t => /VAT/.test(t.m) && /ราย|แยก/.test(t.m)), 'missing explanation');
    } finally { shop.env.dispose(); }
  });
  await R.t('legacy VAT cap does not shrink with the current discount', async () => {
    const { env, app, tx } = await oldVatBill(false, false);
    try {
      tx.tender = { method: 'cash', amount: 1070, at: tx.date, shiftStart: app.state.shift.startTime };
      tx.discount = 500; tx.vatableBase = 500; tx.vatAmount = 35; tx.total = 535;
      tx.details[0].netPrice = 500; tx.details[0].commissionAmount = 50;
      delete tx.details[0].vatable;
      eq(app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code), []);
      ok(app.tenderOf(tx).valid, 'legitimate original VAT tender exceeds a shrinking cap');
      ok(!app.settlementWithinCap(tx, 50000), 'oversized settlement accepted');
      delete tx.subtotal;
      ok(app.tenderOf(tx).valid, 'no-subtotal legacy fallback changed');
    } finally { env.dispose(); }
  });
  await R.t('legacy VAT with boolean line flags passes both app and GAS validation', async () => {
    const { env, app, gas, tx } = await oldVatBill(true, false);
    try {
      eq(app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code), []);
      const result = gas.ctx.validateBillPayload_(JSON.parse(JSON.stringify(app.buildBillPayload(tx))));
      ok(result.ok, result.code + ': ' + result.message);
    } finally { env.dispose(); }
  });
  await R.t('GAS independently accepts a valid 7% legacy VAT payload with line flags', async () => {
    const { env, app, gas, tx } = await oldVatBill(true, false);
    try {
      const result = gas.ctx.validateBillPayload_(JSON.parse(JSON.stringify(app.buildBillPayload(tx))));
      ok(result.ok, result.code + ': ' + result.message);
    } finally { env.dispose(); }
  });
  await R.t('a missing VAT flag on a formerly zero-net line cannot be inferred when its price becomes payable', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = { subtotal: 10000, discount: 9999, vatRate: 7, nonVatBase: 0, vatableBase: 1, vatAmount: 0.07, rounding: 0.93, total: 2 };
      const details = [{ price: 9999, netPrice: 1, vatable: true }, { price: 1, netPrice: 0 }];
      ok(!app.computeEditTotals(tx, details, 0).ok, 'invented a tax classification for a zero-net line');
    } finally { env.dispose(); }
  });
  for (const action of ['close', 'restore', 'clear']) {
    await R.t(`failed ${action} restores the cart discount together with its items`, async () => {
      const { env, app, gas } = await makeShop();
      let removeFault;
      try {
        await settle(50); gas.networkDown = true;
        readyCheckout(env, null, 'cash', 300);
        const input = env.document.getElementById('cart-discount'); input.value = '100';
        const cart = JSON.stringify(app.state.cart);
        const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));
        removeFault = failPutForKeys(['transactions']);
        if (action === 'close') {
          app.cashCounterMode = 'close'; await app.confirmCashCount();
        } else if (action === 'restore') {
          try { await app.applyBackupData(file, { acceptUnsynced: true }); } catch (e) { /* expected write failure */ }
        } else {
          env.ctx.prompt = () => 'ล้างยอดขาย';
          app.autoBackupToGoogleDrive = async () => true;
          eq(await app.clearSalesData(), false);
        }
        eq(JSON.stringify(app.state.cart), cart, 'cart items lost');
        eq(input.value, '100', 'discount lost after rollback');
        ok(app.state.shift.active, 'shift closed despite database failure');
      } finally { if (removeFault) removeFault(); env.dispose(); }
    });
  }
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
