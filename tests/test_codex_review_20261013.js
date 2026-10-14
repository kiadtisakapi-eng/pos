// Independent regression proofs. All financial mutations use the real app and Dexie.
const vm = require('vm');
const { makeShop, readyCheckout, settle, loginAs, quiet } = require('./fixtures_db');
const { makeRunner, eq, ok, createEnv } = require('./harness_db');
const { createGasEnv } = require('./gas_env');
const R = makeRunner('--- Codex review 13 Oct 2026 ---');
const copy = x => JSON.parse(JSON.stringify(x));
async function offlineShop() {
  const shop = await makeShop();
  shop.env.ctx.navigator.onLine = false;
  shop.env.ctx.fetch = async () => { throw new Error('test offline'); };
  return shop;
}
async function sale(env, method = 'cash', amount = 500) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], method, amount);
  await env.app.processCheckout();
  await settle(25);
  return env.app.state.transactions.at(-1);
}
async function voidBill(env, tx, outcome = 'refunded') {
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = outcome;
  await env.app.voidTransaction();
  await env.app._confirmP;
  await settle(25);
}
(async () => {
  for (const outcome of ['refunded', 'none']) for (const dated of [true, false]) {
    await R.t(`Repeated restore preserves the local void decision (${outcome}, createdAt=${dated})`, async () => {
      const { env, app } = await offlineShop();
      try {
        const tx = await sale(env);
        const file = copy(app.buildBackupPayload());
        file.createdAt = new Date(Date.now() - 1000).toISOString();
        if (!dated) delete file.createdAt;
        await voidBill(env, tx, outcome);
        await app.applyBackupData(copy(file), { acceptUnsynced: true });
        const first = app.state.transactions.find(t => t.id === tx.id);
        ok(first.syncStatus === 'conflict' && first.syncIssue.localVoidPending, 'first restore control');
        // Reload the saved state, then restore the original pre-void file again.
        await app.loadState();
        await app.applyBackupData(copy(file), { acceptUnsynced: true });
        const again = app.state.transactions.find(t => t.id === tx.id);
        ok(again.syncStatus === 'conflict' && again.syncIssue.localVoidPending,
          `second restore resurrected bill: ${again.syncStatus}`);
        eq(again.syncIssue.moneyOutcome, outcome);
        await app.resolveBillConflict(tx.id, 'void-local');
        eq(app.computeShiftDrawer(app.state.shift).expected, outcome === 'none' ? 1500 : 1000);
        eq((await env.raw('transactions')).length, 0);
      } finally { env.dispose(); }
    });
  }
  await R.t('Restore retains original void evidence without duplicating it', async () => {
    const { env, app } = await offlineShop();
    try {
      const tx = await sale(env);
      const file = copy(app.buildBackupPayload());
      file.createdAt = new Date(Date.now() - 1000).toISOString();
      await voidBill(env, tx);
      const record = copy(app.state.voidLog.find(v => v.billId === tx.id));
      await app.applyBackupData(copy(file), { acceptUnsynced: true });
      eq(app.state.voidLog.filter(v => v.billId === tx.id && v.date === record.date).length, 1);
      await app.applyBackupData(copy(file), { acceptUnsynced: true });
      eq((await env.raw('voidLog')).filter(v => v.billId === tx.id && v.date === record.date).length, 1);
    } finally { env.dispose(); }
  });
  await R.t('Undo restore holds a bill voided after the snapshot for the owner (forceWin)', async () => {
    const { env, app } = await offlineShop();
    try {
      const tx = await sale(env);
      await app.savePreRestoreSnapshot();
      await settle(5);
      await voidBill(env, tx);
      app.askTypedConfirm = async () => true;
      await app.undoLastRestore();
      await app._confirmP;
      // เจ้าของเลือก 14 ต.ค. 2569 (Claude ตรวจซ้ำ C2): บิลที่ยกเลิกหลังเก็บสำเนา ต้องเข้ากล่องบิลรอตรวจ ไม่คืนเงียบ ๆ
      const back = app.state.transactions.find(t => t.id === tx.id);
      ok(back && back.syncStatus === 'conflict' && back.syncIssue && back.syncIssue.localVoidPending,
        `undo silently resurrected a bill voided after the snapshot: ${back && back.syncStatus}`);
      eq(back.syncIssue.moneyOutcome, 'refunded');
      eq(app.state.voidLog.filter(v => v.billId === tx.id).length, 1, 'void evidence kept');
      await app.resolveBillConflict(tx.id, 'void-local');
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000, 'refund applied once after choosing void-local');
    } finally { env.dispose(); }
  });
  await R.t('Manager void rechecks clock after PIN confirmation', async () => {
    const { env, app } = await offlineShop();
    try {
      const tx = await sale(env);
      loginAs(app, 'manager');
      const D = vm.runInContext('Date', env.ctx), before = D.now();
      const expected = app.computeShiftDrawer(app.state.shift).expected;
      app.confirmPinStepUp = async () => { D.now = () => before - 600000; return true; };
      await voidBill(env, tx);
      ok(app.state.transactions.some(t => t.id === tx.id), 'clock rollback allowed void after confirmation');
      eq(app.computeShiftDrawer(app.state.shift).expected, expected);
      eq((await env.raw('transactions')).length, 1);
    } finally { env.dispose(); }
  });
  await R.t('Manager settlement rechecks clock after confirmation', async () => {
    const { env, app } = await offlineShop();
    try {
      const tx = await sale(env);
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-discount').value = '100';
      await app.saveTransactionEdit();
      loginAs(app, 'manager');
      const D = vm.runInContext('Date', env.ctx), before = D.now();
      app.askConfirm = async () => { D.now = () => before - 600000; return true; };
      eq(await app.recordBillSettlement(tx.id, 'moved', 'cash'), false);
      eq((tx.settlements || []).length, 0);
      eq(app.computeShiftDrawer(app.state.shift).expected, 1500);
      eq(((await env.raw('transactions'))[0].settlements || []).length, 0);
    } finally { env.dispose(); }
  });
  await R.t('Clock floor is recomputed when restore replaces equal-sized data', async () => {
    const { env, app } = await offlineShop();
    try {
      const D = vm.runInContext('Date', env.ctx), now = D.now();
      D.now = () => now + 3600000;
      const first = await sale(env);
      D.now = () => now;
      await sale(env);
      eq(app.clockFloorTs(), now + 3600000);
      const file = copy(app.buildBackupPayload());
      file.transactions.find(t => t.id === first.id).date = now - 600000;
      await app.applyBackupData(file, { acceptUnsynced: true });
      loginAs(app, 'manager');
      eq(app.clockFloorTs(), now, 'cached floor from the replaced data');
      eq(app.clockBehindProblem(), null);
    } finally { env.dispose(); }
  });
  await R.t('Clock acknowledgement ignores old bad events but tracks new sales', async () => {
    const { env, app } = await offlineShop();
    try {
      const D = vm.runInContext('Date', env.ctx), now = D.now();
      D.now = () => now + 7200000;
      await sale(env);
      D.now = () => now;
      await app.acknowledgeClock();
      eq(app.clockFloorTs(), now, 'old future bill should be ignored');
      D.now = () => now + 1800000;
      await sale(env);
      eq(app.clockFloorTs(), now + 1800000, 'new correct sale must advance the floor');
      D.now = () => now + 300000;
      loginAs(app, 'manager');
      ok(app.refuseOnClockProblem('ยกเลิกบิล'), 'new sale was hidden by the previous acknowledgement');
      const factory = env.factory;
      env.dispose();
      const reopened = createEnv({ factory });
      try {
        quiet(reopened.app);
        await reopened.app.init();
        const RD = vm.runInContext('Date', reopened.ctx);
        RD.now = () => now + 300000;
        loginAs(reopened.app, 'manager');
        eq(reopened.app.clockFloorTs(), now + 1800000);
        ok(reopened.app.refuseOnClockProblem('ยกเลิกบิล'));
        // A persisted acknowledgement from the unsafe range format must require
        // owner confirmation again, rather than ignoring subsequent valid sales.
        reopened.app.clockAck = { at: now, ignoreAbove: now + 7200000, by: 'owner' };
        eq(reopened.app.clockFloorTs(), now + 7200000);
      } finally { reopened.dispose(); }
    } finally { env.dispose(); }
  });
  await R.t('GAS pruning keeps a sheet whose version stamp cannot be read', async () => {
    const gas = createGasEnv({ keepDailyRetention: true });
    const dt = new Date(); dt.setDate(dt.getDate() - 70);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const name = 'สรุป-' + key;
    const sheet = gas.ss.insertSheet(name);
    sheet.getRange(1, 26).setValue('unreadable');
    gas.ctx.pruneOldDailySheets(gas.ss, 62);
    ok(gas.sheet(name), 'prune deleted unreadable stamp; stale requests now see version 0');
    eq(JSON.parse(String(gas.ctx.checkSummaryStale_(gas.ss, name, { generatedAt: 1 }))).code, 'SUMMARY_VERSION_UNAVAILABLE');
    // A valid stamp survives property failure, then moves before deletion on retry.
    sheet.getRange(1, 26).setValue(500);
    gas.faults['setProperty:POS_SUMSTAMP_' + name] = true;
    gas.ctx.pruneOldDailySheets(gas.ss, 62);
    ok(gas.sheet(name), 'property failure lost the only version stamp');
    delete gas.faults['setProperty:POS_SUMSTAMP_' + name];
    gas.ctx.pruneOldDailySheets(gas.ss, 62);
    ok(!gas.sheet(name));
    eq(gas.props['POS_SUMSTAMP_' + name], '500');
    eq(JSON.parse(String(gas.ctx.checkSummaryStale_(gas.ss, name, { generatedAt: 400 }))).code, 'STALE_SUMMARY');
  });
  await R.t('Legacy tender and split-payment voids preserve physical cash in both shifts', () => {
    const env = createEnv(), app = env.app;
    let cases = 0;
    try {
      const payments = [
        [{ method: 'cash', amount: 500 }], [{ method: 'promptpay', amount: 500 }], [{ method: 'credit', amount: 500 }],
        [{ method: 'cash', amount: 200 }, { method: 'credit', amount: 300 }],
        [{ method: 'cash', amount: 100 }, { method: 'credit', amount: 250 }, { method: 'promptpay', amount: 150 }],
        [{ method: 'credit', amount: 250 }, { method: 'promptpay', amount: 250 }]
      ];
      for (const parts of payments) for (const legacy of [false, true])
      for (const cross of [false, true]) for (const outcome of ['refunded', 'none']) {
        const start = Date.now() - 60000;
        const method = parts.length > 1 ? 'split' : parts[0].method;
        const cash = parts.filter(p => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
        const tx = { id: 'TX-SPLIT-MODEL', date: start + 1000, total: 500, paymentMethod: method, payments: parts };
        if (!legacy) tx.tender = { method, amount: 500, parts, shiftStart: start };
        app.state.transactions = [tx];
        app.state.shift = { active: true, startTime: cross ? start + 2000 : start,
          startCash: cross ? 1000 + cash : 1000, expenses: [], history: [], cashAdjustments: [] };
        eq(app.computeShiftDrawer(app.state.shift).expected, 1000 + cash);
        eq(app.billVoidCashRefundSat(tx), cash * 100);
        const plan = app.planVoidCash(tx, outcome);
        app.state.transactions = [];
        if (plan.push) app.state.shift.cashAdjustments.push(plan.push);
        eq(app.computeShiftDrawer(app.state.shift).expected, 1000 + (outcome === 'none' ? cash : 0));
        cases++;
      }
      console.log(`  legacy/split drawer cases: ${cases}`);
    } finally { env.dispose(); }
  });
  // Pure drawer model, independent of the app's refund planner: cash = opening
  // + physical tender + cash movements - refund allocated to the bill's channels.
  await R.t('Drawer matches physical cash across full/partial/waive/edit/void and shifts', async () => {
    const env = createEnv(), app = env.app;
    let cases = 0;
    try {
      const methods = ['cash', 'promptpay', 'credit'];
      for (const sold of methods) for (const via of methods)
      for (const delta of [-200, 200]) for (const moved of [0, 100, 200])
      for (const editAgain of [false, true]) for (const crossShift of [false, true])
      for (const outcome of ['refunded', 'none']) for (const legacy of [false, true]) {
        const start = Date.now() - 60000;
        const tx = { id: 'TX-MODEL', date: start + 1000, shiftStart: start,
          paymentMethod: sold, total: 500, settlements: [] };
        if (!legacy) tx.tender = { method: sold, amount: 500, shiftStart: start };
        // Legacy bills gain their tender snapshot when first edited.
        if (legacy) tx.tender = copy(app.tenderOf(tx));
        tx.total += delta;
        let physical = 1000 + (sold === 'cash' ? 500 : 0);
        app.state.shift = { active: true, startTime: start, startCash: 1000, expenses: [], history: [], cashAdjustments: [] };
        app.state.transactions = [tx];
        const st = app.billMoneyStatus(tx);
        const plan = moved ? app.planSettlementEntries(tx, st, 'moved', via, moved) : app.planSettlementEntries(tx, st, 'waive');
        ok(plan, 'settlement plan missing');
        const add = (p, kind, flags = {}) => p.forEach(e => {
          tx.settlements.push({ ...e, kind, shiftStart: kind === 'waive' ? null : start, due: [{ method: sold, amount: tx.total }], ...flags });
          if (e.method === 'cash' && kind !== 'waive') app.state.shift.cashAdjustments.push({ billId: tx.id, kind, amount: e.amount });
        });
        add(plan.entries, moved ? (delta < 0 ? 'refund' : 'collect') : 'waive');
        add(plan.swap, 'waive', { swap: true });
        add(plan.waiveRest || [], 'waive', { partialRest: true });
        if (moved && via === 'cash') physical += Math.sign(delta) * moved;
        if (editAgain) {
          tx.total += 100;
          tx.settlements.filter(s => s.kind === 'waive').forEach(s => { s.supersededAt = start + 2000; });
          const again = app.billMoneyStatus(tx);
          add(again.diffs, 'waive');
        }
        eq(app.computeShiftDrawer(app.state.shift).expected, physical, 'before void');
        if (crossShift) {
          app.state.shift = { active: true, startTime: start + 3000, startCash: physical, expenses: [], history: [], cashAdjustments: [] };
        }
        const netPaid = 500 + Math.sign(delta) * moved;
        const refund = outcome === 'refunded' && sold === 'cash' ? netPaid : 0;
        const voidPlan = app.planVoidCash(tx, outcome);
        app.state.transactions = [];
        if (voidPlan.reverseAdjustments) app.state.shift.cashAdjustments.forEach(a => { a.reversedByVoid = start + 4000; });
        if (voidPlan.push) app.state.shift.cashAdjustments.push(voidPlan.push);
        eq(app.computeShiftDrawer(app.state.shift).expected, physical - refund, `case ${JSON.stringify({ sold, via, delta, moved, editAgain, crossShift, outcome, legacy })}`);
        cases++;
      }
      console.log(`  physical drawer cases: ${cases}`);
    } finally { env.dispose(); }
  });
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
