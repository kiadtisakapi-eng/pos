// Read-only review probes. All Sheets/Drive/Telegram services are simulated locally.
const fs = require('fs'), cp = require('child_process'), path = require('path'), os = require('os'), vm = require('vm');
if (process.argv.includes('--app-v63') || process.argv.includes('--gas-v63')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-v63-code-'));
  const name = process.argv.includes('--app-v63') ? 'app.js' : 'google_apps_script.js';
  const file = path.join(dir, name);
  fs.writeFileSync(file, cp.execFileSync('git', ['show', 'HEAD:' + name], { maxBuffer: 4e6 }));
  process.env[name === 'app.js' ? 'POS_APP_SRC' : 'POS_GAS_SRC'] = file;
}
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- Independent workflow probes ---');
async function sale(env) {
  readyCheckout(env, null, 'cash', 300);
  await env.app.processCheckout(); await settle(30);
  await env.app.syncPendingTransactions(true); await settle(30);
  const tx = env.app.state.transactions.at(-1); ok(tx, 'checkout rejected');
  return tx;
}
function countReads(gas) {
  let n = 0;
  for (const sh of gas.ss.getSheets()) {
    const getRange = sh.getRange.bind(sh);
    sh.getRange = (...args) => {
      const r = getRange(...args);
      for (const method of ['getValues', 'getDisplayValues', 'getValue', 'getDisplayValue']) {
        if (typeof r[method] === 'function') {
          const original = r[method].bind(r);
          r[method] = (...a) => { n++; return original(...a); };
        }
      }
      return r;
    };
  }
  return () => n;
}
(async () => {
  if (process.argv.includes('--real-backup')) {
    await R.t('real backup restores without losing revenue and repeated simulated sync creates no duplicate rows', async () => {
      const file = path.join(__dirname, '..', 'audit', 'pos_backup_2026-09-25_21-38-31.json');
      if (!fs.existsSync(file)) throw new Error('real backup unavailable');
      const { env, app, gas } = await makeShop();
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const before = data.transactions.reduce((s, t) => s + Math.round(t.total * 100), 0);
        const fatal = data.transactions.filter(t => app.validateBillRecord(t).some(p => p.fatal)).length;
        eq(fatal, 0, 'valid historical bills rejected');
        await app.applyBackupData(data, { acceptUnsynced: true });
        for (let i = 0; i < 20; i++) { await app.syncPendingTransactions(true); await settle(10); }
        eq(app.state.transactions.length, 746);
        eq(app.state.transactions.reduce((s, t) => s + Math.round(t.total * 100), 0), before);
        const rows = () => gas.ss.getSheets().filter(s => /^\d\d-\d{4}$/.test(s.getName())).flatMap(s => s._grid.slice(1));
        eq(rows().length, 746); eq(new Set(rows().map(r => r[0])).size, 746);
        for (const tx of app.state.transactions) tx.syncStatus = 'pending';
        for (let i = 0; i < 20; i++) { await app.syncPendingTransactions(true); await settle(10); }
        eq(rows().length, 746);
        console.log(JSON.stringify({ bills: 746, revenue: before / 100, rejected: fatal, sheetRowsAfterReplay: rows().length }));
      } finally { env.dispose(); }
    });
    return R.done();
  }
  await R.t('checkout -> edit -> settle -> void works across selected app/GAS versions', async () => {
    const { env, app, gas } = await makeShop();
    try {
      const tx = await sale(env); eq(tx.syncStatus, 'synced');
      app.openTransactionEdit(tx.id); env.document.getElementById('edit-tx-discount').value = '30';
      await app.saveTransactionEdit(); await settle(30); eq(tx.total, 270);
      ok(await app.recordBillSettlement(tx.id, 'moved', 'cash'));
      eq(app.computeShiftDrawer(app.state.shift).expected, 1270);
      env.document.getElementById('edit-tx-id').value = tx.id;
      env.document.getElementById('void-money-outcome').value = 'refunded';
      await app.voidTransaction(); await app._confirmP; await settle(30);
      await app.flushCloudOutbox();
      eq(app.state.transactions.length, 0); eq(app.computeShiftDrawer(app.state.shift).expected, 1000);
      ok(!gas.ss.getSheets().filter(s => /^\d\d-\d{4}$/.test(s.getName())).some(s => s._grid.slice(1).some(r => r[0] === tx.id)));
    } finally { env.dispose(); }
  });
  if (process.argv.includes('--app-v63') || process.argv.includes('--gas-v63')) return R.done();
  await R.t('restoring twice without createdAt preserves one online-void decision and one evidence row', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env);
      const file = JSON.parse(JSON.stringify(app.buildBackupPayload())); delete file.createdAt;
      env.document.getElementById('edit-tx-id').value = tx.id;
      env.document.getElementById('void-money-outcome').value = 'refunded';
      await app.voidTransaction(); await app._confirmP; await settle(30); await app.flushCloudOutbox();
      for (let n = 0; n < 2; n++) {
        await app.applyBackupData(JSON.parse(JSON.stringify(file)), { acceptUnsynced: true });
        const held = app.state.transactions.find(t => t.id === tx.id);
        ok(held && held.syncStatus === 'conflict' && held.syncIssue.localVoidSynced);
        eq(app.state.voidLog.filter(v => v.billId === tx.id && !v.supersededBy).length, 1);
      }
      ok(await app.resolveBillConflict(tx.id, 'void-local') !== false);
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000);
    } finally { env.dispose(); }
  });
  await R.t('expense PIN rejection, exception and changed form do not leave a blocked pending flag', async () => {
    const { env, app } = await makeShop({ role: 'manager' });
    try {
      const input = id => env.document.getElementById(id);
      input('expense-type').value = 'supply'; input('expense-source').value = 'drawer'; input('expense-amount').value = '501';
      input('expense-note').value = 'Test';
      app.confirmPinStepUp = async () => false;
      await app.addExpense(); eq(app.state.shift.expenses.length, 0); eq(app._expensePinPending, false);
      app.confirmPinStepUp = async () => { throw new Error('simulated prompt failure'); };
      try { await app.addExpense(); } catch (e) { /* expected */ }
      eq(app._expensePinPending, false);
      let finish;
      app.confirmPinStepUp = () => new Promise(r => { finish = r; });
      const pending = app.addExpense(); await settle();
      input('expense-amount').value = '900';
      await app.addExpense(); eq(app.state.shift.expenses.length, 0);
      finish(true); await pending;
      eq(app.state.shift.expenses.map(e => e.amount), [501]); eq(app._expensePinPending, false);
    } finally { env.dispose(); }
  });
  await R.t('manager past-bill exception remains limited to pending settlements', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env);
      tx.date -= 86400000; tx.customerName = 'Synthetic past customer';
      tx.discount = 30; tx.nonVatBase = 270; tx.total = 270; tx.details[0].netPrice = 270;
      loginAs(app, 'manager');
      eq(app.billAccessFor(tx), 'settle-only'); app.openTransactionEdit(tx.id);
      eq(env.document.getElementById('edit-tx-customer').value, 'Synthetic past customer');
      tx.settlements = [{ method: 'cash', amount: -30, kind: 'refund', at: Date.now() }];
      eq(app.billAccessFor(tx), 'none');
      console.log('Manager can see a past pending bill/customer under the existing settlement exception.');
    } finally { env.dispose(); }
  });
  await R.t('void read count and ten-year monthly-index scan use bounded sheet reads', async () => {
    const { env, app, gas } = await makeShop();
    try {
      const tx = await sale(env), mk = app.getBusinessMonthKey(tx.date);
      const source = gas.sheet(mk), header = source._grid[0].slice(), row = source._grid[1].slice();
      const parts = mk.split('-').map(Number);
      for (const offset of [-1, 1]) {
        const d = new Date(Date.UTC(parts[1], parts[0] - 1 + offset, 15));
        const name = String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
        const neighbor = gas.ss.insertSheet(name); neighbor.appendRow(header);
        const unrelated = row.slice(); unrelated[0] = 'TX-' + (Date.now() + offset) + '-ADJACENT';
        neighbor._grid.push(unrelated);
      }
      const reads = countReads(gas);
      const start = performance.now();
      const response = gas.post({ action: 'void_transaction', id: tx.id, monthKey: mk, voidedAt: Date.now() });
      eq(response.status, 'success');
      console.log(JSON.stringify({ voidReads: reads(), simulatorMs: +(performance.now() - start).toFixed(2) }));
      source._grid.push(row.slice());
      const old = fs.readFileSync(path.join(__dirname, '..', 'backup', 'ก่อนแก้_claude_20261014b', 'google_apps_script.js'), 'utf8');
      const from = old.indexOf('function handleVoidTransaction('), to = old.indexOf('\nfunction ', from + 1);
      vm.runInContext(old.slice(from, to), gas.ctx);
      const beforeOld = reads();
      eq(gas.post({ action: 'void_transaction', id: tx.id, monthKey: mk, voidedAt: Date.now() + 1 }).status, 'success');
      console.log(JSON.stringify({ beforeFixVoidReads: reads() - beforeOld }));
      for (const sheet of gas.ss.getSheets()) if (/^\d\d-\d{4}$/.test(sheet.getName())) sheet._grid.length = 1;
      for (let y = 2020; y < 2030; y++) for (let m = 1; m <= 12; m++) {
        const name = String(m).padStart(2, '0') + '-' + y;
        const sheet = gas.ss.getSheetByName(name) || gas.ss.insertSheet(name);
        if (!sheet._grid.length) sheet.appendRow(header);
        for (let i = 0; i < 300; i++) {
          const r = row.slice(); r[0] = 'TX-' + (Date.UTC(y, m - 1, 15, 7) + i) + '-CODEX000';
          r[1] = new Date(Date.UTC(y, m - 1, 15, 7)); sheet._grid.push(r);
        }
      }
      const scanReads = countReads(gas), scanStart = performance.now();
      const scan = gas.ctx.checkBillIndexUpgrade();
      console.log(JSON.stringify({ scanBills: scan.bills, scanTabs: scan.tabs, scanReads: scanReads(), simulatorMs: +(performance.now() - scanStart).toFixed(2) }));
      eq(scan.bills, 36000); eq(scan.monthMismatchCount, 0); ok(scanReads() < 1000);
    } finally { env.dispose(); }
  });
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
