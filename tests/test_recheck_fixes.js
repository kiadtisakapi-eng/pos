// Real app/Dexie + real GAS source on isolated mocks. No live Google requests.
// POS_APP_SRC/POS_GAS_SRC allow the same regressions to run against the pre-fix snapshot.
const assert = require('assert/strict');
const { makeShop, createGasEnv, readyCheckout, settle, loginAs } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.stack); } }
async function until(fn) { const end = Date.now() + 2500; while (!fn()) { if (Date.now() > end) throw Error('condition timeout'); await settle(5); } }
async function shop(opts) { const s = await makeShop(Object.assign({ onLine: false, noInit: true }, opts)); Object.assign(s, s.env); s.app.scheduleCloudRetry = () => {}; s.app.resumePendingCloudWork = () => {}; return s; }
async function sale(s) { readyCheckout(s); assert.equal(await s.app.processCheckout(), true); await s.app._cloudChain; return s.app.state.transactions.at(-1); }
const DEV_B = 'dev-' + 'b'.repeat(32);
const bill = over => Object.assign({ action: 'transaction', id: 'TX-RECHECK', date: Date.parse('2026-10-07T12:00:00+07:00'),
  monthKey: '10-2026', dateTimeStr: '2026-10-07 12:00:00', customerName: 'Walk-in', services: ['Cut'], staffNames: ['A'],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0 }, over);
function switchConnection(app) { app._connectionGeneration = (app._connectionGeneration || 0) + 1; app.cloudBackendId = 'sheet:B'; app.googleSheetsUrl = 'https://script.google.com/macros/s/B/exec'; app.primaryStatus = null; app.backupStatus = null; }
async function blockQueue(app) { let release; const pending = app.withMutation('test hold', () => new Promise(r => { release = r; })); await until(() => release); return { release, pending }; }
function summaryRequests(s) { return s.gas.requests.filter(x => x.action === 'summary_day' || x.action === 'summary_month'); }

(async () => {
  await test('R1 failed sale never appears in a daily/monthly summary or drains its repair job', async () => {
    const s = await shop(); let rejectWrite, pendingSale, flush;
    const bulk = s.db.state.bulkPut.bind(s.db.state);
    try {
      const tx = await sale(s), day = s.app.getBusinessISODate(tx.date), month = s.app.getBusinessMonthKey(tx.date);
      s.app.state.cloudOutbox = [{ id: 'summary-test', dateKeys: [day], monthKeys: [month], needSummary: true, rev: 1 }]; await s.app.saveState();
      s.db.state.bulkPut = rows => rows.some(x => x.key === 'transactions' && x.value.length === 2)
        ? new Promise((_, reject) => { rejectWrite = reject; }) : bulk(rows);
      readyCheckout(s); pendingSale = s.app.processCheckout(); await until(() => rejectWrite);
      s.ctx.navigator.onLine = true; flush = s.app.flushCloudOutbox(); await settle(35);
      rejectWrite(Error('simulated transaction failure')); assert.equal(await pendingSale, false); await flush;
      const sent = summaryRequests(s); assert.equal(sent.length, 2);
      sent.forEach(x => { assert.equal(x.totalRevenue, 300); assert.equal(x.billCount, 1); });
      assert.equal((await s.raw('transactions')).length, 1);
      assert.equal((await s.raw('cloudOutbox')).filter(x => x.needSummary).length, 0);
    } finally { s.db.state.bulkPut = bulk; if (rejectWrite) rejectWrite(Error('cleanup')); await Promise.allSettled([pendingSale, flush]); s.dispose(); }
  });

  await test('R1 summary revision changed while sending remains queued for the new committed data', async () => {
    const s = await shop(); let flush; const held = s.gas.hold(x => x.action === 'summary_day');
    try {
      const tx = await sale(s), day = s.app.getBusinessISODate(tx.date);
      s.app.state.cloudOutbox = [{ id: 'summary-test', dateKeys: [day], monthKeys: [], needSummary: true, rev: 1 }]; await s.app.saveState();
      s.ctx.navigator.onLine = true; flush = s.app.flushCloudOutbox(); await until(() => held.count);
      await s.app.withMutation('committed edit', async () => { const job = s.app.state.cloudOutbox[0]; job.rev++; await s.app.saveState(); });
      held.releaseAll(); await flush;
      assert.equal((await s.raw('cloudOutbox'))[0].needSummary, true);
    } finally { held.releaseAll(); await flush; s.dispose(); }
  });

  for (const type of ['day', 'month']) await test('R2 old ' + type + ' response cannot promote the new backend or change its summary floor', async () => {
    const s = await shop(); let pending; const held = s.gas.hold(x => x.action === 'summary_' + type);
    try {
      const tx = await sale(s); s.app.primaryStatus = null;
      pending = type === 'day' ? s.app.syncDailySummary(s.app.getBusinessISODate(tx.date), s.app.state.transactions, []) : s.app.syncMonthlySummary(s.app.getBusinessMonthKey(tx.date));
      await until(() => held.count); switchConnection(s.app);
      await s.app.notePrimaryStatus(false, { label: 'B-primary' }); const floor = s.app._summaryStampFloor;
      held.releaseAll(); assert.equal(await pending, false);
      assert.equal(s.app.primaryStatus.isPrimary, false); assert.equal((await s.raw('primaryStatus')).primaryLabel, 'B-primary');
      assert.equal(s.app._summaryStampFloor, floor);
      readyCheckout(s); assert.equal(await s.app.processCheckout(), false);
    } finally { held.releaseAll(); await pending; s.dispose(); }
  });

  await test('R2 queued primary and backup status cannot write behind a backend change', async () => {
    const s = await shop(); let queue;
    try {
      queue = await blockQueue(s.app);
      const context = s.app.cloudContext ? s.app.cloudContext() : undefined;
      const change = s.app.withMutation('switch backend', async () => { switchConnection(s.app); await s.app.saveState(); });
      const primary = s.app.notePrimaryStatus(false, { label: 'A-primary' }, context);
      const backup = s.app.recordBackupStatus({ ok: true, verified: true, fileName: 'A.json', txCount: 6 }, context);
      queue.release(); await Promise.all([queue.pending, change, primary, backup]);
      assert.equal(s.app.primaryStatus, null); assert.equal(await s.raw('primaryStatus'), null);
      assert.equal(s.app.backupStatus, null); assert.equal(await s.raw('backupStatus'), null);
    } finally { if (queue) queue.release(); s.dispose(); }
  });

  await test('R2 a backup that waits for queued status after backend change reports false', async () => {
    const s = await shop(); let queue, pending; const held = s.gas.hold(x => x.action === 'backup');
    try {
      await sale(s); pending = s.app.autoBackupToGoogleDrive({ silent: true }); await until(() => held.count);
      queue = await blockQueue(s.app);
      const change = s.app.withMutation('switch backend', async () => { switchConnection(s.app); await s.app.saveState(); });
      held.releaseAll(); await settle(25); queue.release(); await change;
      assert.equal(await pending, false); assert.equal(await s.raw('backupStatus'), null);
    } finally { held.releaseAll(); if (queue) queue.release(); await pending; s.dispose(); }
  });

  for (const operation of ['edit', 'void']) await test('R3 an unknown secondary cannot ' + operation + ' a restored bill', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); s.app.primaryStatus = null;
      s.gas.props.POS_PRIMARY_DEVICE = JSON.stringify({ id: DEV_B, label: 'Other', claimedAt: Date.now() });
      s.document.getElementById('edit-tx-id').value = tx.id;
      if (operation === 'edit') { s.app.openTransactionEdit(tx.id); s.document.getElementById('edit-tx-discount').value = '50'; await s.app.saveTransactionEdit(); }
      else { s.document.getElementById('void-money-outcome').value = 'refunded'; await s.app.voidTransaction(); await s.app._confirmP; }
      assert.equal((await s.raw('transactions')).length, 1); assert.equal((await s.raw('transactions'))[0].total, 300);
      assert.equal(s.app.primaryStatus.isPrimary, false); assert.equal((await s.raw('voidLog')).length, 0);
    } finally { s.dispose(); }
  });

  await test('R3 unknown primary offline fails closed; a verified primary still edits offline', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); s.app.primaryStatus = null; s.gas.networkDown = true;
      s.app.openTransactionEdit(tx.id); s.document.getElementById('edit-tx-discount').value = '50';
      await s.app.saveTransactionEdit(); assert.equal((await s.raw('transactions'))[0].total, 300);
      await s.app.notePrimaryStatus(true, null); await s.app.saveTransactionEdit();
      assert.equal((await s.raw('transactions'))[0].total, 250);
    } finally { s.dispose(); }
  });

  await test('R4 clearSalesData stops remaining day/month sends and preserves the cloud month total', async () => {
    const s = await shop(); let flush; const held = s.gas.hold(x => x.action === 'summary_day');
    try {
      const tx = await sale(s); const tx2 = JSON.parse(JSON.stringify(tx)); tx2.id += '-second'; tx2.date -= 86400000;
      s.app.state.transactions.push(tx2); await s.app.saveState();
      s.ctx.navigator.onLine = true; await s.app.syncPendingTransactions(true); s.ctx.window.prompt = () => 'ล้างยอดขาย';
      const month = s.app.getBusinessMonthKey(tx.date); await s.app.syncMonthlySummary(month);
      s.app.state.cloudOutbox = [{ id: 'clear-test', dateKeys: [s.app.getBusinessISODate(tx.date), s.app.getBusinessISODate(tx2.date)], monthKeys: [month], needSummary: true }]; await s.app.saveState();
      s.ctx.navigator.onLine = true; flush = s.app.flushCloudOutbox(); await until(() => held.count);
      assert.equal(await s.app.clearSalesData(), true);
      held.releaseAll(); await flush;
      assert.equal(summaryRequests(s).filter(x => x.action === 'summary_month').length, 1);
      assert.equal(summaryRequests(s).filter(x => x.action === 'summary_day').length, 1);
      const master = s.gas.sheet('สรุปรายเดือน'), map = s.gas.ctx.masterColumnMap_(master);
      assert.equal(Number(master._grid.find(r => String(r[map.periodCol - 1]).replace(/^'/, '') === month)[map.netCol - 1]), 600);
    } finally { held.releaseAll(); await flush; s.dispose(); }
  });

  for (const cause of ['restore', 'backend']) await test('R4 ' + cause + ' cancels a multi-period job after the first awaited send', async () => {
    const s = await shop(); let pending; const held = s.gas.hold(x => x.action === 'summary_day');
    try {
      const tx = await sale(s), dk = s.app.getBusinessISODate(tx.date);
      s.app.state.cloudOutbox = [{ id: 'old-job', dateKeys: [dk, '2026-10-01'], monthKeys: ['10-2026'], needSummary: true }]; await s.app.saveState();
      s.ctx.navigator.onLine = true; pending = s.app.flushCloudOutbox(); await until(() => held.count);
      await s.app.withMutation('replace context', async () => { if (cause === 'backend') switchConnection(s.app); else s.app._dataGeneration++; s.app.state.cloudOutbox = []; await s.app.saveState(); });
      held.releaseAll(); await pending; assert.equal(summaryRequests(s).length, 1); assert.equal((await s.raw('cloudOutbox')).length, 0);
    } finally { held.releaseAll(); await pending; s.dispose(); }
  });

  await test('R5 a pre-index bill cannot be reused several months later and legacy adoption rejects changed equal revisions', async () => {
    const g = createGasEnv(), june = bill({ date: Date.parse('2026-06-07T12:00:00+07:00'), monthKey: '06-2026', dateTimeStr: '2026-06-07 12:00:00' });
    assert.equal(g.post(june).status, 'success'); g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
    const reply = g.post(bill()); assert.equal(reply.code, 'CROSS_MONTH_BILL_ID');
    const changed = g.post(Object.assign({}, june, { subtotal: 400, total: 400 })); assert.equal(changed.code, 'REVISION_CONFLICT');
    assert.equal(g.post(june).status, 'success'); assert.match(String(g.sheet('_POS_BILL_INDEX')._grid[1][3]), /^[a-f0-9]{64}$/);
  });

  // Contract changed in Claude recheck round 3 (owner-approved D2): a legacy duplicate blocks only that bill ID,
  // never every other bill; cleaning the duplicate row lets the same ID through and repairs its ledger entry.
  await test('R5 migration detects legacy duplicates, preserves rows, isolates the duplicated ID and repairs it after cleanup', async () => {
    const g = createGasEnv(); assert.equal(g.post(bill()).status, 'success');
    const source = g.sheet('10-2026'), duplicate = g.ss.insertSheet('06-2026'); source._grid.forEach(row => duplicate.appendRow(row.slice()));
    g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
    assert.equal(g.post(bill({ id: 'NEW-ENTRY' })).status, 'success'); assert.ok(g.props.POS_BILL_INDEX_GLOBAL_V1);
    assert.equal(g.post(bill()).code, 'DUPLICATE_BILL_ID');
    assert.equal(source._grid.length, 3); assert.equal(duplicate._grid.length, 2);   // header + original (+ NEW-ENTRY in 10-2026)
    g.ss.deleteSheet(duplicate); const retry = g.post(bill()); assert.equal(retry.status, 'success', JSON.stringify(retry));
    assert.equal(g.sheet('_POS_BILL_INDEX')._grid.length, 3);
    assert.match(String(g.sheet('_POS_BILL_INDEX')._grid.find(r => r[0] === 'TX-RECHECK')[3]), /^[a-f0-9]{64}$/);
  });

  await test('R5 completed migration does not open every old monthly sheet on each new bill', async () => {
    const g = createGasEnv(); assert.equal(g.post(bill()).status, 'success');
    let scanned = 0; const all = g.ss.getSheets.bind(g.ss); g.ss.getSheets = () => { scanned++; return all(); };
    assert.equal(g.post(bill({ id: 'NEW-FAST' })).status, 'success'); assert.equal(scanned, 0);
  });

  for (const bad of [{ v: 'corrupted', r: 0 }, { v: null, r: 0 }, { v: 5, r: 5 }, { v: -1, r: 0 }, { v: 5, r: 0, w: 'bad' }]) {
    await test('R6 malformed event remains blocked and preserved through prune: ' + JSON.stringify(bad), async () => {
      const g = createGasEnv(); assert.equal(g.post(bill()).status, 'success');
      assert.equal(g.post({ action: 'void_transaction', id: 'TX-RECHECK', monthKey: '10-2026', voidedAt: Date.now() }).status, 'success');
      const raw = JSON.stringify(Object.assign({ w: Date.now() - 120 * 86400000 }, bad)); g.props['POSVB_TX-RECHECK'] = raw;
      assert.throws(() => g.ctx.readBillRegistryStrict_('TX-RECHECK'));
      g.ctx.pruneBillRegistry_(); assert.equal(g.props['POSVB_TX-RECHECK'], raw);
      assert.equal(g.post(bill()).code, 'REGISTRY_UNAVAILABLE'); assert.equal(g.sheet('10-2026')._grid.length, 1);
    });
  }

  await test('R6 malformed archive is fail closed; valid legacy numeric events and other pruning still work', async () => {
    const g = createGasEnv(); g.ctx.archiveVoidEvent_('BAD', { v: 123, r: 0 }); g.sheet('_POS_VOID_ARCHIVE')._grid[1][1] = null;
    assert.throws(() => g.ctx.readBillRegistryStrict_('BAD'));
    g.props.POS_VOIDED_BILLS = JSON.stringify({ 'TX-GOOD': 123 }); delete g.props.POS_VOIDED_MIGRATED_V2;
    assert.equal(g.ctx.readBillRegistryStrict_('TX-GOOD').v, 123);
    g.props.POSVB_VALID = JSON.stringify({ v: 123, r: 0, w: Date.now() - 120 * 86400000 });
    g.props.POSVB_INVALID = JSON.stringify({ v: 'bad', r: 0 }); g.ctx.pruneBillRegistry_();
    assert.equal(g.props.POSVB_VALID, undefined); assert.ok(g.props.POSVB_INVALID); assert.equal(g.ctx.readBillRegistryStrict_('VALID').v, 123);
  });

  await test('E1 owner emergency transfer accepts new sales, blocks destructive cloud writes, and requires full recovery to release', async () => {
    const g = createGasEnv(), ownerKey = g.setupOwnerKey(); const s = await shop({ gas: g });
    try {
      const first = await sale(s); await s.app.syncPendingTransactions(true); const partial = s.app.buildBackupPayload();
      const missing = bill({ id: 'MISSING-LATEST' }); assert.equal(g.post(missing).status, 'success');
      s.app.deviceId = DEV_B; g.fetch.fixtureDeviceId = DEV_B; s.app.primaryStatus = null;
      // Mock the owner-key input only; production owner authentication still executes in GAS.
      s.app.askOwnerKey = async () => ownerKey;
      assert.equal(await s.app.claimPrimaryDevice(), true); assert.ok(s.app.primaryStatus.recovery); assert.ok((await s.raw('primaryStatus')).recovery);
      const status = g.post({ action: 'primary_status', deviceId: DEV_B }); assert.ok(status.details.primary.recovery);
      assert.equal(g.post({ action: 'summary_day', deviceId: DEV_B }).code, 'INCOMPLETE_RECOVERY');
      assert.equal(g.post({ action: 'backup', deviceId: DEV_B, backupData: partial }).code, 'INCOMPLETE_RECOVERY');
      assert.equal(g.post({ action: 'void_transaction', deviceId: DEV_B, id: first.id, monthKey: '10-2026' }).code, 'INCOMPLETE_RECOVERY');
      assert.equal(g.post(Object.assign({}, missing, { deviceId: DEV_B, rev: 2, total: 500, subtotal: 500 })).code, 'RECOVERY_BILL_PROTECTED');
      assert.equal(g.post(Object.assign({}, missing, { deviceId: DEV_B })).status, 'success');
      assert.equal(await s.app.autoBackupToGoogleDrive({ silent: true }), false);
      first.syncStatus = 'pending'; first.restoredAt = Date.now(); await s.app.saveState();
      const historicalRequests = g.requests.filter(x => x.action === 'transaction' && x.id === first.id).length;
      const emergencySale = await sale(s); assert.equal(emergencySale.emergencySale, true); await s.app.syncPendingTransactions(true);
      assert.equal(g.requests.filter(x => x.action === 'transaction' && x.id === first.id).length, historicalRequests);
      assert.equal(g.sheet('10-2026')._grid.length, 4);
      await assert.rejects(s.app.applyBackupData ? s.app.applyBackupData(partial) : s.app.applyBackupSnapshot(partial));
      const local = s.app.state.transactions.map(tx => { const b = s.app.buildBillPayload(tx); return b; });
      assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey, bills: local }).code, 'RECOVERY_CONFIRMATION_REQUIRED');
      assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey, recoveryConfirmed: true, bills: local }).code, 'PRIMARY_TRANSFER_INCOMPLETE');
      local.push(missing); assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey, recoveryConfirmed: true, bills: local }).status, 'success');
      await s.app.refreshPrimaryStatus(); assert.equal(s.app.primaryStatus.recovery, null);
      assert.equal(g.post(Object.assign({}, bill({ id: 'OLD-A' }), { deviceId: first.deviceId || 'dev-' + 'a'.repeat(32) })).code, 'NOT_PRIMARY_DEVICE');
    } finally { s.dispose(); }
  });

  await test('E1 emergency claim is unavailable without the owner key', async () => {
    const g = createGasEnv(); g.setupOwnerKey(); g.post(bill());
    const reply = g.post({ action: 'claim_primary', deviceId: DEV_B, emergency: true }); assert.notEqual(reply.status, 'success');
    assert.notEqual(g.ctx.readPrimaryDevice_().id, DEV_B);
  });

  await test('R2 a data replacement invalidates status callbacks already waiting in the mutation queue', async () => {
    const s = await shop(); let queue;
    try {
      queue = await blockQueue(s.app); const context = s.app.cloudContext ? s.app.cloudContext() : undefined;
      const replace = s.app.withMutation('restore generation', async () => { s.app._dataGeneration++; s.app.primaryStatus = null; s.app.backupStatus = null; await s.app.saveState(); });
      const status = s.app.notePrimaryStatus(false, { label: 'old-data' }, context);
      const backup = s.app.recordBackupStatus({ ok: true, verified: true }, context);
      queue.release(); await Promise.all([queue.pending, replace, status, backup]);
      assert.equal(await s.raw('primaryStatus'), null); assert.equal(await s.raw('backupStatus'), null);
    } finally { if (queue) queue.release(); s.dispose(); }
  });

  await test('R2 a rejected device is stopped in memory even when its status cannot be persisted', async () => {
    const s = await shop(), bulk = s.db.state.bulkPut.bind(s.db.state);
    try {
      s.db.state.bulkPut = rows => rows.some(x => x.key === 'primaryStatus') ? Promise.reject(Error('status write failed')) : bulk(rows);
      await s.app.notePrimaryStatus(false, { label: 'Other' });
      assert.equal(s.app.primaryStatus.isPrimary, false); readyCheckout(s); assert.equal(await s.app.processCheckout(), false);
    } finally { s.db.state.bulkPut = bulk; s.dispose(); }
  });

  await test('R3 unknown status on the actual primary is verified then permits a financial edit', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); s.app.primaryStatus = null;
      s.app.openTransactionEdit(tx.id); s.document.getElementById('edit-tx-discount').value = '50';
      await s.app.saveTransactionEdit(); assert.equal((await s.raw('transactions'))[0].total, 250);
      assert.equal((await s.raw('primaryStatus')).isPrimary, true);
    } finally { s.dispose(); }
  });

  await test('R5 a failed migration flush leaves no completed marker and a retry cannot duplicate index rows', async () => {
    const g = createGasEnv(); assert.equal(g.post(bill()).status, 'success');
    g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
    g.faults.flush = 1; assert.equal(g.post(bill({ id: 'NEXT-ID' })).code, 'BILL_INDEX_MIGRATION_REQUIRED');
    assert.equal(g.props.POS_BILL_INDEX_GLOBAL_V1, undefined);
    assert.equal(g.post(bill({ id: 'NEXT-ID' })).status, 'success'); assert.equal(g.sheet('_POS_BILL_INDEX')._grid.length, 3);
  });

  await test('R6 ambiguous old registry values are preserved and block only the affected bill', async () => {
    const g = createGasEnv(); g.props.POS_VOIDED_BILLS = JSON.stringify({ 'TX-BROKEN': 'bad', 'TX-VALID': -200 });
    assert.throws(() => g.ctx.readBillRegistryStrict_('TX-BROKEN')); assert.equal(g.ctx.readBillRegistryStrict_('TX-VALID').r, 200);
    const raw = g.props['POSVB_TX-BROKEN']; g.ctx.pruneBillRegistry_(); assert.equal(g.props['POSVB_TX-BROKEN'], raw);
  });

  await test('E1 local edits, voids and restoring changed emergency commissions are blocked', async () => {
    const s = await shop();
    try {
      await s.app.notePrimaryStatus(true, { recovery: { incomplete: true, startedAt: Date.now() - 1000 } });
      const tx = await sale(s); s.app.openTransactionEdit(tx.id); s.document.getElementById('edit-tx-discount').value = '50'; await s.app.saveTransactionEdit();
      s.document.getElementById('void-money-outcome').value = 'refunded'; await s.app.voidTransaction(); await s.app._confirmP;
      assert.equal((await s.raw('transactions')).length, 1); assert.equal((await s.raw('transactions'))[0].total, 300);
      s.app.state.shift.active = false; await s.app.saveState(); const combined = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      assert.equal(combined.recoveryStatus.incomplete, true); combined.transactions[0].details[0].commissionAmount++;
      await assert.rejects(s.app.applyBackupData(combined), /ขาดบิลที่ขายระหว่างฉุกเฉิน/);
      assert.equal((await s.raw('transactions'))[0].details[0].commissionAmount, 30);
    } finally { s.dispose(); }
  });

  await test('E1 full transfer cannot release when a local bill was voided on the server', async () => {
    const g = createGasEnv(), ownerKey = g.setupOwnerKey(); assert.equal(g.post(bill()).status, 'success');
    assert.equal(g.post({ action: 'void_transaction', id: 'TX-RECHECK', monthKey: '10-2026', voidedAt: Date.now() }).status, 'success');
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey, emergency: true }).status, 'success');
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey, recoveryConfirmed: true, bills: [bill()] }).code, 'PRIMARY_TRANSFER_INCOMPLETE');
    assert.ok(g.ctx.readPrimaryDevice_().recovery);
  });
  for (const cause of ['backend', 'data']) await test('R2 an owner-key prompt cannot dispatch an old privileged command after ' + cause + ' changes', async () => {
    const g = createGasEnv(), ownerKey = g.setupOwnerKey(), s = await shop({ gas: g });
    try {
      s.app.askOwnerKey = async () => { if (cause === 'backend') switchConnection(s.app); else s.app._dataGeneration++; return ownerKey; };
      await assert.rejects(s.app.cloudPost('claim_primary', { emergency: true }, 15000, { owner: true }));
      assert.equal(g.requests.filter(x => x.action === 'claim_primary').length, 1); assert.equal(g.ctx.readPrimaryDevice_().recovery, undefined);
    } finally { s.dispose(); }
  });
  await test('R2 changing the resolved backend ID on the same URL cannot acknowledge a bill from the previous backend', async () => {
    const s = await shop(); let pending, held;
    try {
      const tx = await sale(s); tx.syncStatus = 'pending'; await s.app.saveState();
      held = s.gas.hold(x => x.action === 'transaction'); pending = s.app.syncPendingTransactions(true); await until(() => held.count);
      const connection = s.app._connectionGeneration || 0;
      await s.app.withMutation('identify changed backend', async () => { s.app.bindCloudBackend('sheet:B', true); await s.app.saveState(); });
      assert.equal(s.app._connectionGeneration || 0, connection); held.releaseAll(); await pending;
      assert.equal((await s.raw('transactions'))[0].syncStatus, 'pending'); assert.equal(s.app.state.transactions[0].syncStatus, 'pending');
    } finally { if (held) held.releaseAll(); await pending; s.dispose(); }
  });
  console.log('=== ผ่าน ' + passed + ' · ไม่ผ่าน ' + failed + ' ==='); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
