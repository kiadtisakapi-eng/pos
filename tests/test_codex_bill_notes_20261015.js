// Real app + Dexie, real Apps Script source, in-memory Sheets only.
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- Codex bill note sync review 15 Oct 2026 ---');
const clone = v => JSON.parse(JSON.stringify(v));

async function bill(note) {
  const shop = await makeShop({ noInit: true });
  const { env, app } = shop;
  app.scheduleCloudRetry = () => {};
  app.resumePendingCloudWork = () => {};
  readyCheckout(env, undefined, 'cash', 1000);
  env.document.getElementById('checkout-bill-note').value = note;
  ok(await app.processCheckout(), 'checkout failed');
  await settle(30);
  shop.tx = app.state.transactions.at(-1);
  await app.syncPendingTransactions(true);
  shop.month = app.getBusinessMonthKey(shop.tx.date);
  shop.sheet = shop.gas.sheet(shop.month);
  return shop;
}
const payload = s => clone(s.app.buildBillPayload(s.tx));
const noteOnSheet = s => {
  const col = s.gas.ctx.billNoteColumn_(s.sheet);
  return col > 0 ? String(s.sheet._grid.find(r => r[0] === s.tx.id)[col - 1] || '') : '';
};
async function editNote(s, note) {
  s.app.openTransactionEdit(s.tx.id);
  s.env.document.getElementById('edit-tx-note').value = note;
  await s.app.saveTransactionEdit();
  await s.app.syncPendingTransactions(true);
  await settle(30);
}

(async () => {
  for (const oldNote of ['old reason', '']) {
    await R.t(`restore older backup cannot overwrite a newer reason (${oldNote || 'previously empty'})`, async () => {
      const s = await bill(oldNote);
      try {
        const old = payload(s);
        await editNote(s, 'new reason');
        eq(noteOnSheet(s), 'new reason');
        old.restoreBase = { epoch: old.revEpoch, rev: old.rev };
        old.revEpoch = Date.now() + 1000;
        old.billNote = oldNote;
        const response = s.gas.post(old);
        eq(response.code, 'STALE_REVISION', JSON.stringify(response));
        ok(response.details.changes.some(c => c.field === 'หมายเหตุบิล'), 'missing note conflict detail');
        eq(noteOnSheet(s), 'new reason', 'backup overwrote newer reason');
        delete old.restoreBase; // Owner explicitly chooses the restored copy.
        eq(s.gas.post(old).status, 'success');
        eq(noteOnSheet(s), oldNote);
      } finally { s.env.dispose(); }
    });
  }

  await R.t('reconciliation reads and compares the reason, including a missing note column', async () => {
    const s = await bill("'customer reason");
    try {
      const read = () => s.gas.post({ action: 'list_bills', monthKey: s.month, ownerKey: s.gas.setupOwnerKey() }).details.bills[0];
      const b = read();
      eq(b.billNote, "'customer reason");
      eq(s.app.reconcileFieldDiffs(s.tx, b), []);
      const col = s.gas.ctx.billNoteColumn_(s.sheet);
      s.sheet.getRange(2, col).setValue('changed on sheet');
      const diff = s.app.reconcileFieldDiffs(s.tx, read());
      ok(diff.some(d => d.field === 'billNote' && d.local === "'customer reason" && d.cloud === 'changed on sheet'), 'note discrepancy missed');
      s.sheet.getRange(1, col).setValue('owner column');
      eq(read().billNote, '', 'missing column should mean no note saved');
      ok(s.app.reconcileFieldDiffs(s.tx, read()).some(d => d.field === 'billNote'), 'missing note column missed');
      const oldServer = read(); delete oldServer.billNote;
      ok(!s.app.reconcileFieldDiffs(s.tx, oldServer).some(d => d.field === 'billNote'), 'old server should remain compatible');
    } finally { s.env.dispose(); }
  });

  await R.t('primary transfer detects a reason different from the restored copy', async () => {
    const s = await bill('current reason');
    try {
      const p = payload(s); p.billNote = 'older reason';
      const result = s.gas.ctx.validatePrimaryTransfer_([p]);
      eq(result.ok, false, 'transfer accepted a different reason');
      eq(result.counts.different, 1);
      eq(result.different[0].reason, 'note');
      eq(s.gas.ctx.validatePrimaryTransfer_([payload(s)]).ok, true);
      delete p.billNote; // Older app never sends or overwrites a reason.
      eq(s.gas.ctx.validatePrimaryTransfer_([p]).ok, true);
    } finally { s.env.dispose(); }
  });

  await R.t('restoring through the app exposes a note conflict and lets the owner choose the copy', async () => {
    const s = await bill('backup reason');
    try {
      const backup = clone(s.app.buildBackupPayload());
      await editNote(s, 'newer reason');
      await s.app.applyBackupData(backup);
      await s.app.syncPendingTransactions(true);
      await settle(50);
      const restored = s.app.state.transactions.find(t => t.id === s.tx.id);
      eq(restored.syncStatus, 'conflict');
      eq(restored.syncIssue.code, 'STALE_REVISION');
      ok(s.app.conflictActionsFor(restored).includes('push-local'), 'owner has no way to resolve the conflict');
      eq(noteOnSheet(s), 'newer reason');
      ok(await s.app.resolveBillConflict(restored.id, 'push-local'));
      await s.app.syncPendingTransactions(true);
      await settle(50);
      eq(restored.syncStatus, 'synced');
      eq(noteOnSheet(s), 'backup reason');
    } finally { s.env.dispose(); }
  });

  await R.t('interrupted note write retries safely, without duplicating the bill or changing money', async () => {
    const s = await bill('before failure');
    const originalRange = s.sheet.getRange;
    try {
      const noteCol = s.gas.ctx.billNoteColumn_(s.sheet);
      let failures = 0;
      s.sheet.getRange = (row, col, ...rest) => {
        const range = originalRange(row, col, ...rest);
        if (row > 1 && col === noteCol && failures === 0) {
          range.setValue = () => { failures++; throw new Error('simulated note write failure'); };
        }
        return range;
      };
      const p = payload(s); p.rev++; p.billNote = 'after retry';
      eq(s.gas.post(p).status, 'error');
      eq(failures, 1, 'fault did not reach note write');
      eq(noteOnSheet(s), 'before failure');
      eq(s.gas.post(p).status, 'success');
      eq(noteOnSheet(s), 'after retry');
      eq(s.sheet._grid.filter(r => r[0] === s.tx.id).length, 1);
      eq(Number(s.sheet._grid.find(r => r[0] === s.tx.id)[11]), s.tx.total);
      const stale = payload(s);
      eq(s.gas.post(stale).code, 'STALE_REVISION');
      eq(noteOnSheet(s), 'after retry');
    } finally { s.sheet.getRange = originalRange; s.env.dispose(); }
  });

  await R.t('emergency recovery does not acknowledge a changed reason as synced', async () => {
    const s = await bill('protected reason');
    try {
      const primary = s.gas.ctx.readPrimaryDevice_();
      primary.recovery = { startedAt: Date.now() };
      s.gas.props.POS_PRIMARY_DEVICE = JSON.stringify(primary);
      const p = payload(s); p.rev++; p.billNote = 'changed while protected';
      eq(s.gas.post(p).code, 'RECOVERY_BILL_PROTECTED');
      eq(noteOnSheet(s), 'protected reason');
      eq(s.gas.post(payload(s)).status, 'success');
    } finally { s.env.dispose(); }
  });

  await R.t('duplicate note headers are reported during reconciliation and transfer', async () => {
    const s = await bill('reason');
    try {
      s.sheet.getRange(1, s.sheet.getLastColumn() + 1).setValue(s.gas.ctx.BILL_NOTE_HEADER);
      const list = s.gas.post({ action: 'list_bills', monthKey: s.month, ownerKey: s.gas.setupOwnerKey() });
      eq(list.code, 'SCHEMA_MISMATCH');
      const transfer = s.gas.ctx.validatePrimaryTransfer_([payload(s)]);
      eq(transfer.ok, false);
      eq(transfer.structural, true);
    } finally { s.env.dispose(); }
  });

  await R.t('lost upload acknowledgement retries the same reason without duplicate bills', async () => {
    const s = await bill('initial reason');
    try {
      s.gas.dropResponses = true;
      await editNote(s, 'saved before response was lost');
      eq(noteOnSheet(s), 'saved before response was lost');
      ok(s.tx.syncStatus !== 'synced', 'unacknowledged upload marked synced');
      s.gas.dropResponses = false;
      await s.app.syncPendingTransactions(true);
      eq(s.tx.syncStatus, 'synced');
      eq(noteOnSheet(s), 'saved before response was lost');
      eq(s.sheet._grid.filter(r => r[0] === s.tx.id).length, 1);
    } finally { s.env.dispose(); }
  });

  await R.t('older backup without billNote preserves the reason already on Sheets', async () => {
    const s = await bill('reason from newer app');
    try {
      const p = payload(s);
      p.restoreBase = { epoch: p.revEpoch, rev: 0 };
      p.revEpoch = Date.now() + 1000;
      delete p.billNote;
      eq(s.gas.post(p).status, 'success');
      eq(noteOnSheet(s), 'reason from newer app');
      const b = s.gas.post({ action: 'list_bills', monthKey: s.month, ownerKey: s.gas.setupOwnerKey() }).details.bills[0];
      const local = clone(s.tx); delete local.billNote;
      ok(!s.app.reconcileFieldDiffs(local, b).some(d => d.field === 'billNote'));
    } finally { s.env.dispose(); }
  });

  await R.t('first reason expands a full sheet and VAT migration preserves the note column', async () => {
    const s = await bill('');
    try {
      s.sheet._setMaxColumns(s.sheet.getLastColumn());
      await editNote(s, 'reason in added column');
      eq(s.tx.syncStatus, 'synced');
      eq(noteOnSheet(s), 'reason in added column');
      const noteCol = s.gas.ctx.billNoteColumn_(s.sheet);
      ok(!s.sheet._hiddenCols.has(noteCol), 'reason column is hidden');
      // Reconstruct a pre-VAT monthly tab while retaining the system columns.
      s.sheet._grid.forEach(row => row.splice(7, 4));
      eq(s.gas.ctx.billSheetSchema_(s.sheet), 'legacy');
      const p = payload(s); p.rev++;
      eq(s.gas.post(p).status, 'success');
      eq(s.gas.ctx.billSheetSchema_(s.sheet), 'vat');
      eq(noteOnSheet(s), 'reason in added column');
      eq(Number(s.sheet._grid.find(r => r[0] === s.tx.id)[11]), s.tx.total);
    } finally { s.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
