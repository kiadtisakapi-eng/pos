const { makeShop, readyCheckout, settle } = require('./fixtures_db');
(async () => {
  const { env, app, gas } = await makeShop();
  try {
    readyCheckout(env, [
      { id: 's1', name: 'ตัดผม', price: 300 },
      { id: 'd1', name: 'สินค้า', price: 20, duration: 0, isProduct: true, category: 'drinks' }
    ], 'cash', 1000);
    await app.processCheckout(); await settle(25);
    await app.syncPendingTransactions(true);
    const tx = app.state.transactions[0];
    if (!tx || tx.syncStatus !== 'synced') throw new Error('Bill compatibility failed');
    const key = app.getBusinessISODate(tx.date);
    const payload = app.buildSummaryPayload(app.state.transactions, [], 'day', key);
    const result = gas.post({ ...payload, action: 'summary_day', dateKey: key, generatedAt: Date.now() + 1000 });
    if (result.status !== 'success') throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({ bill: tx.syncStatus, total: tx.total, summary: result.status,
      shopName: payload.shopName || null, productCount: payload.staffCommissions.map(s => s.productCount ?? null) }));
  } finally { env.dispose(); }
})().catch(e => { console.error(e); process.exit(1); });
