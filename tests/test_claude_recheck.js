// ตรวจรอบ Claude 7 ต.ค. 2569 (รอบ 3 · หลัง Codex แก้ R1–R6 + E1) — ข้อ D1–D14 และ S1–S2 ใน
// audit/fixes-20261007/CLAUDE_RECHECK_REVIEW.md · นโยบาย D4/D5/D9 เจ้าของเลือกแล้ว (7 ต.ค. 2569)
// แอป/Dexie ตัวจริง + Apps Script ตัวจริงบน mock — ไม่มีคำขอไป Google จริง
// POS_APP_SRC / POS_GAS_SRC = ใช้รันกับโค้ดก่อนแก้ (ทุกข้อยกเว้นข้อควบคุมต้องตก)
const assert = require('assert/strict');
const { makeShop, createGasEnv, readyCheckout, settle } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e); } }
async function shop(gas, opts) {
  const s = await makeShop(Object.assign({ gas, onLine: true, noInit: true }, opts));
  Object.assign(s, s.env); s.app.scheduleCloudRetry = () => {}; s.app.resumePendingCloudWork = () => {};
  return s;
}
async function sale(s, pay) { readyCheckout(s, null, pay); assert.equal(await s.app.processCheckout(), true); await s.app._cloudChain; return s.app.state.transactions.at(-1); }
async function voidBill(s, tx) {
  s.document.getElementById('edit-tx-id').value = tx.id; s.document.getElementById('void-money-outcome').value = 'refunded';
  await s.app.voidTransaction(); await s.app._confirmP;
}
const clone = o => JSON.parse(JSON.stringify(o));
const onSheet = (g, month, id) => { const sh = g.sheet(month); return !!sh && sh._grid.some(r => String(r[0]).replace(/^'/, '') === id); };
const DEV_A = 'dev-' + 'a'.repeat(32), DEV_B = 'dev-' + 'b'.repeat(32);
const bill = over => Object.assign({ action: 'transaction', id: 'TX-CLAUDE1', date: Date.parse('2026-10-07T12:00:00+07:00'),
  monthKey: '10-2026', dateTimeStr: '2026-10-07 12:00:00', customerName: 'Walk-in', services: ['Cut'], staffNames: ['A'],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0 }, over);
// ชีตที่มีบิลก่อนมีทะเบียน (เหมือนชีตจริงตอนอัปเกรด): เขียนบิลแล้วลบทะเบียน + เครื่องหมาย
function legacySheet(g, bills) {
  bills.forEach(b => g.post(Object.assign({}, b, { deviceId: DEV_A })));
  g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
}
// A ขาย n ใบขึ้นชีต · คืนไฟล์สำรองตอนมีบิลแรก keep ใบ
async function lostPrimary(g, n, keep) {
  const A = await shop(g); const bills = [];
  for (let i = 0; i < n; i++) bills.push(await sale(A));
  await A.app.syncPendingTransactions(true);
  const full = clone(A.app.buildBackupPayload());
  const partial = clone(full); partial.transactions = partial.transactions.slice(0, keep);
  return { A, bills, full, partial };
}
async function emergencyDevice(g, key, file) {
  const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async () => true;
  B.app.askTypedConfirm = async () => false;
  await B.app.applyBackupData(file); assert.equal(await B.app.claimPrimaryDevice(), true); assert.ok(B.app.isRecoveryIncomplete());
  return B;
}

(async () => {
  // ── D1 ─────────────────────────────────────────────────────────────────────
  await test('D1 a restored bill voided on the sheet after the backup becomes an owner decision, then the transfer succeeds (void-local)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const backup = clone(A.app.buildBackupPayload());
    await voidBill(A, x); await A.app.flushCloudOutbox(); assert.equal(onSheet(g, '10-2026', x.id) || onSheet(g, A.app.getBusinessMonthKey(x.date), x.id), false);
    const B = await shop(g); B.app.askOwnerKey = async () => key; let offeredEmergency = false;
    B.app.askConfirm = async m => { if (/ฉุกเฉิน/.test(m)) { offeredEmergency = true; return false; } return true; };
    await B.app.applyBackupData(backup);
    assert.equal(await B.app.claimPrimaryDevice(), false);
    assert.equal(offeredEmergency, false, 'a complete file must not be pushed into emergency mode');
    const bx = B.app.state.transactions.find(t => t.id === x.id);
    assert.equal(bx.syncStatus, 'conflict'); assert.equal(JSON.stringify(B.app.conflictActionsFor(bx)), JSON.stringify(['restore-cloud', 'void-local']));
    assert.equal((await B.raw('transactions')).find(t => t.id === x.id).syncStatus, 'conflict');
    assert.equal(await B.app.resolveBillConflict(x.id, 'void-local'), true);
    assert.equal(await B.app.claimPrimaryDevice(), true);
    assert.equal(g.ctx.readPrimaryDevice_().id, B.app.deviceId);
    B.dispose(); A.dispose();
  });

  await test('D1 choosing "คืนบิลนี้ขึ้นชีต" also lets the transfer through and the bill is restored on the sheet', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const backup = clone(A.app.buildBackupPayload()); const month = A.app.getBusinessMonthKey(x.date);
    await voidBill(A, x); await A.app.flushCloudOutbox();
    const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await B.app.applyBackupData(backup); assert.equal(await B.app.claimPrimaryDevice(), false);
    assert.equal(await B.app.resolveBillConflict(x.id, 'restore-cloud'), true);
    assert.equal(await B.app.claimPrimaryDevice(), true);
    await B.app.syncPendingTransactions(true);
    assert.equal(onSheet(g, month, x.id), true);
    B.dispose(); A.dispose();
  });

  // ── D2 ─────────────────────────────────────────────────────────────────────
  for (const kind of ['owner total row', 'owner note row', 'duplicate across months', 'duplicate in one tab', 'edited old header']) {
    await test('D2 upgrade with ' + kind + ' blocks only the affected bill/month, never every new bill', async () => {
      const g = createGasEnv();
      const sep = bill({ id: 'SEP-000001', date: Date.parse('2026-09-07T12:00:00+07:00'), monthKey: '09-2026', dateTimeStr: '2026-09-07 12:00:00' });
      legacySheet(g, [sep, bill({ id: 'SEP-000002', date: sep.date + 60000, monthKey: '09-2026', dateTimeStr: '2026-09-07 12:01:00' })]);
      const tab = g.sheet('09-2026');
      if (kind === 'owner total row') tab.appendRow(['รวม', '', '', '', '', 600]);
      if (kind === 'owner note row') tab.appendRow(['หมายเหตุ: ปิดร้านวันพ่อ']);
      if (kind === 'duplicate across months') { const t = g.ss.insertSheet('08-2026'); t.appendRow(tab._grid[0].slice()); t.appendRow(tab._grid[1].slice()); }
      if (kind === 'duplicate in one tab') tab.appendRow(tab._grid[1].slice());
      if (kind === 'edited old header') tab._grid[0][2] = 'ลูกค้า (แก้เอง)';
      const fresh = g.post(Object.assign(bill({ id: 'OCT-000001' }), { deviceId: DEV_A }));
      assert.equal(fresh.status, 'success', JSON.stringify(fresh));
      const same = g.post(Object.assign({}, sep, { deviceId: DEV_A }));
      if (kind.startsWith('duplicate')) assert.equal(same.code, 'DUPLICATE_BILL_ID');
      else if (kind === 'edited old header') assert.equal(same.code, 'SCHEMA_MISMATCH');
      else assert.equal(same.status, 'success');
      const report = JSON.parse(g.props.POS_BILL_INDEX_PROBLEMS);
      if (kind.startsWith('owner')) assert.equal(report.nonBillRows, 1);
      if (kind === 'edited old header') assert.equal(JSON.stringify(report.badTabs), JSON.stringify(['09-2026']));
    });
  }

  await test('D2 emergency takeover and transfer validation ignore owner-typed non-bill rows', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); await sale(A); await A.app.syncPendingTransactions(true);
    const full = clone(A.app.buildBackupPayload());
    g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
    g.sheet(A.app.getBusinessMonthKey(A.app.state.transactions[0].date)).appendRow(['รวม', '', '', '', '', 300]);
    const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await B.app.applyBackupData(full);
    assert.equal(await B.app.claimPrimaryDevice(), true, 'a complete file must transfer even with a "รวม" row on the sheet');
    const g2 = createGasEnv(), key2 = g2.setupOwnerKey(); legacySheet(g2, [bill({ id: 'DUP-000001' })]);
    const t2 = g2.sheet('10-2026'); t2.appendRow(t2._grid[1].slice());
    g2.props.POS_PRIMARY_DEVICE = JSON.stringify({ id: DEV_A, label: 'A', claimedAt: Date.now(), how: 'owner' });
    assert.equal(g2.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key2, emergency: true }).status, 'success');
    B.dispose(); A.dispose();
  });

  await test('D2 a month skipped for a bad header is indexed once the header is fixed', async () => {
    const g = createGasEnv();
    const jun = bill({ id: 'JUN-000001', date: Date.parse('2026-06-07T12:00:00+07:00'), monthKey: '06-2026', dateTimeStr: '2026-06-07 12:00:00' });
    legacySheet(g, [jun]);
    const header = g.sheet('06-2026')._grid[0][2]; g.sheet('06-2026')._grid[0][2] = 'แก้เอง';
    assert.equal(g.post(Object.assign(bill({ id: 'OCT-000001' }), { deviceId: DEV_A })).status, 'success');
    assert.equal(JSON.stringify(JSON.parse(g.props.POS_BILL_INDEX_GLOBAL_V1).skip), JSON.stringify(['06-2026']));
    g.sheet('06-2026')._grid[0][2] = header;
    const reuse = g.post(Object.assign(bill({ id: 'JUN-000001' }), { deviceId: DEV_A }));
    assert.equal(reuse.code, 'CROSS_MONTH_BILL_ID');
    assert.equal(JSON.stringify(JSON.parse(g.props.POS_BILL_INDEX_GLOBAL_V1).skip), '[]');
  });

  // ── D3 ─────────────────────────────────────────────────────────────────────
  await test('D3 while the emergency device is down, a third device with a complete combined file can take over and release', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { full, partial, A } = await lostPrimary(g, 2, 1);
    const B = await emergencyDevice(g, key, partial);
    await sale(B); await B.app.syncPendingTransactions(true);
    B.app.cashCounterMode = 'close'; await B.app.confirmCashCount(); await settle(60); await B.app._cloudChain;
    const exportB = clone(B.app.buildBackupPayload());
    const merged = clone(full); merged.transactions = full.transactions.concat(exportB.transactions.filter(t => t.emergencySale));
    merged.shift = clone(exportB.shift);
    const C = await shop(g); C.app.askOwnerKey = async () => key; const asked = [];
    C.app.askConfirm = async m => { asked.push(m); return true; }; C.app.askTypedConfirm = async () => false;
    await C.app.applyBackupData(merged);
    assert.equal(await C.app.claimPrimaryDevice(), true);
    assert.ok(asked.some(m => /อยู่ระหว่างรับช่วงฉุกเฉิน/.test(m)));
    const p = g.ctx.readPrimaryDevice_(); assert.equal(p.id, C.app.deviceId); assert.equal(p.recovery, null);
    A.dispose(); B.dispose(); C.dispose();
  });

  await test('D3 a third device with an incomplete file can continue the emergency (same recovery start)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, A } = await lostPrimary(g, 2, 1);
    const B = await emergencyDevice(g, key, partial); const started = g.ctx.readPrimaryDevice_().recovery.startedAt;
    const C = await shop(g); C.app.askOwnerKey = async () => key; C.app.askConfirm = async () => true; C.app.askTypedConfirm = async () => false;
    await C.app.applyBackupData(partial);
    assert.equal(await C.app.claimPrimaryDevice(), true);
    const p = g.ctx.readPrimaryDevice_(); assert.equal(p.id, C.app.deviceId); assert.equal(p.recovery.startedAt, started);
    assert.ok(C.app.isRecoveryIncomplete());
    A.dispose(); B.dispose(); C.dispose();
  });

  // ── D4 ─────────────────────────────────────────────────────────────────────
  await test('D4 owner accepts permanently lost details: sheet-only bills, evidence on the sheet, recovery released, paused work resumes', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, bills, A } = await lostPrimary(g, 2, 1); const lost = bills[1];
    const B = await emergencyDevice(g, key, partial);
    const e = await sale(B); await B.app.syncPendingTransactions(true);
    let typedAsk = '';
    B.app.askTypedConfirm = async (m, kw) => { typedAsk = m + '|' + kw; return true; };
    assert.equal(await B.app.claimPrimaryDevice(), true);
    assert.match(typedAsk, /ยอมรับข้อมูลหาย/); assert.match(typedAsk, new RegExp(lost.id));
    assert.equal(g.ctx.readPrimaryDevice_().recovery, null); assert.equal(B.app.isRecoveryIncomplete(), false);
    const ledger = g.sheet('_POS_RECOVERY_ACCEPTED'); assert.ok(ledger && ledger._grid.some(r => r[0] === lost.id));
    const ph = B.app.state.transactions.find(t => t.id === lost.id);
    assert.ok(ph && ph.sheetOnly); assert.equal(ph.total, lost.total); assert.equal(ph.details, undefined);
    assert.equal(B.app.isBillAwaitingSync(ph), false);
    assert.ok((await B.raw('transactions')).some(t => t.id === lost.id && t.sheetOnly));
    const sent = () => g.requests.filter(r => r && r.action === 'transaction' && r.id === lost.id).length, before = sent();
    await B.app.syncPendingTransactions(true); await B.app.flushCloudOutbox(); await B.app.flushCloudOutbox();
    assert.equal(sent(), before, 'sheet-only bills are never re-sent');
    const day = g.requests.filter(r => r && r.action === 'summary_day').at(-1);
    assert.ok(day, 'summaries resume after release'); assert.equal(day.billCount, 3); assert.equal(day.totalRevenue, 900);
    assert.ok(g.requests.some(r => r && r.action === 'backup'), 'a Drive backup follows the release');
    // read-only locally
    B.app.openTransactionEdit(lost.id); assert.match(B.toasts.at(-1).m, /บิลจากชีต/);
    B.document.getElementById('edit-tx-id').value = lost.id; await B.app.voidTransaction();
    assert.ok(B.app.state.transactions.some(t => t.id === lost.id));
    // a later device with the same data can still become primary normally
    const D = await shop(g); D.app.askOwnerKey = async () => key; D.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await D.app.applyBackupData(clone(B.app.buildBackupPayload()));
    assert.equal(await D.app.claimPrimaryDevice(), true);
    void e; A.dispose(); B.dispose(); D.dispose();
  });

  await test('D4 declining the loss keeps the pause and explains why (no repeated emergency question)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, A } = await lostPrimary(g, 2, 1);
    const B = await emergencyDevice(g, key, partial); const asked = [];
    B.app.askConfirm = async m => { asked.push(m); return true; }; B.app.askTypedConfirm = async () => false;
    assert.equal(await B.app.claimPrimaryDevice(), false);
    assert.ok(B.app.isRecoveryIncomplete()); assert.ok(g.ctx.readPrimaryDevice_().recovery);
    assert.equal(asked.filter(m => /รับช่วงขายฉุกเฉินหรือไม่/.test(m)).length, 0);
    assert.match(B.toasts.at(-1).m, /ยังปลดพักไม่ได้/);
    assert.equal(B.app.state.transactions.filter(t => t.sheetOnly).length, 0);
    A.dispose(); B.dispose();
  });

  await test('D4 the server only accepts a loss during an emergency release that names every missing bill', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'KEEP-00001' }), { deviceId: DEV_A })); g.post(Object.assign(bill({ id: 'LOST-00001' }), { deviceId: DEV_A }));
    const keep = bill({ id: 'KEEP-00001' });
    const normal = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: [keep], acceptMissing: true, acceptIds: ['LOST-00001'] });
    assert.equal(normal.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(normal.details.acceptable, false);
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true }).status, 'success');
    const partial = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [keep], acceptMissing: true, acceptIds: [] });
    assert.equal(partial.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(partial.details.acceptable, true);
    assert.equal(partial.details.missing[0].id, 'LOST-00001'); assert.equal(partial.details.missing[0].total, 300);
    assert.ok(g.ctx.readPrimaryDevice_().recovery);
    const ok = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [keep], acceptMissing: true, acceptIds: ['LOST-00001'] });
    assert.equal(ok.status, 'success'); assert.equal(ok.details.accepted, 1); assert.equal(g.ctx.readPrimaryDevice_().recovery, null);
    assert.equal(onSheet(g, '10-2026', 'LOST-00001'), true, 'the sheet row is evidence and stays');
  });

  // ── D5 ─────────────────────────────────────────────────────────────────────
  await test('D5 a void intent carried by the backup is applied by the transfer instead of blocking it', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const month = A.app.getBusinessMonthKey(x.date);
    const lost = g.lose(b => b && b.action === 'void_transaction');
    await voidBill(A, x); await A.app.flushCloudOutbox(); lost.stop();
    const backup = clone(A.app.buildBackupPayload()); assert.equal(onSheet(g, month, x.id), true);
    const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await B.app.applyBackupData(backup);
    assert.equal(await B.app.claimPrimaryDevice(), true);
    assert.equal(onSheet(g, month, x.id), false); assert.ok(g.ctx.readBillRegistryStrict_(x.id).v > 0);
    await B.app.flushCloudOutbox();
    assert.equal(B.app.state.cloudOutbox.filter(j => j.needVoidDelete).length, 0, 'the queued void finishes as already done');
    A.dispose(); B.dispose();
  });

  await test('D5 during an emergency release only voids made before the takeover are applied; later ones wait in the queue (not "missing")', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'KEEP-00001' }), { deviceId: DEV_A }));
    g.post(Object.assign(bill({ id: 'OLD-VOID01' }), { deviceId: DEV_A }));
    g.post(Object.assign(bill({ id: 'NEW-VOID01' }), { deviceId: DEV_A }));
    g.post(Object.assign(bill({ id: 'LOST-00001' }), { deviceId: DEV_A }));
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true }).status, 'success');
    const started = g.ctx.readPrimaryDevice_().recovery.startedAt;
    const intents = [{ id: 'OLD-VOID01', voidedAt: started - 5000 }, { id: 'NEW-VOID01', voidedAt: started + 5000 }];
    // ยังมีบิลที่หายจริงอีกใบ → ปฏิเสธทั้งคำขอ ไม่มีอะไรถูกลบ · คำสั่งที่สั่งหลังเริ่มพักไม่ถูกนับเป็น "บิลที่หาย"
    const refused = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [bill({ id: 'KEEP-00001' })], voidIntents: intents });
    assert.equal(refused.code, 'PRIMARY_TRANSFER_INCOMPLETE');
    assert.equal(JSON.stringify(refused.details.missing.map(m => m.id)), JSON.stringify(['LOST-00001']));
    assert.equal(JSON.stringify(refused.details.pendingVoid.map(m => m.id)), JSON.stringify(['NEW-VOID01']));
    assert.equal(onSheet(g, '10-2026', 'OLD-VOID01'), true, 'nothing is applied while the transfer is refused');
    const ok = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true,
      bills: [bill({ id: 'KEEP-00001' }), bill({ id: 'LOST-00001' })], voidIntents: intents });
    assert.equal(ok.status, 'success', JSON.stringify(ok));
    assert.equal(onSheet(g, '10-2026', 'OLD-VOID01'), false, 'a void made before the takeover is applied by the release');
    assert.equal(onSheet(g, '10-2026', 'NEW-VOID01'), true, 'a void made during the pause is not applied by the release');
    assert.equal(g.post({ action: 'void_transaction', deviceId: DEV_B, id: 'NEW-VOID01', monthKey: '10-2026', voidedAt: started + 5000 }).status, 'success');
    assert.equal(onSheet(g, '10-2026', 'NEW-VOID01'), false, 'the queued void goes through after the release');
  });

  // ── D6 ─────────────────────────────────────────────────────────────────────
  await test('D6 an emergency sale whose first write stopped after reserving the ledger is repaired on retry', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'OLD-000001' }), { deviceId: DEV_A }));
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true }).status, 'success');
    g.faults.appendRow = 2;   // 1st appendRow = ledger row (reserved + flushed), 2nd = bill row
    assert.equal(g.post(Object.assign(bill({ id: 'EMG-000001' }), { deviceId: DEV_B })).code, 'SERVER_ERROR');
    const retry = g.post(Object.assign(bill({ id: 'EMG-000001' }), { deviceId: DEV_B }));
    assert.equal(retry.status, 'success', JSON.stringify(retry)); assert.equal(onSheet(g, '10-2026', 'EMG-000001'), true);
    assert.equal(g.post(Object.assign(bill({ id: 'EMG-000001', rev: 2, subtotal: 100, total: 100 }), { deviceId: DEV_B })).code, 'RECOVERY_BILL_PROTECTED');
  });

  // ── D7 ─────────────────────────────────────────────────────────────────────
  await test('D7 a Drive backup is queued and sent right after a normal release', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { full, partial, A } = await lostPrimary(g, 2, 1);
    const B = await emergencyDevice(g, key, partial);
    await sale(B); await B.app.syncPendingTransactions(true);
    B.app.cashCounterMode = 'close'; await B.app.confirmCashCount(); await settle(60); await B.app._cloudChain;
    const exportB = clone(B.app.buildBackupPayload());
    const merged = clone(full); merged.transactions = full.transactions.concat(exportB.transactions.filter(t => t.emergencySale)); merged.shift = clone(exportB.shift);
    await B.app.applyBackupData(merged, { acceptUnsynced: true });   // ตรวจ 8 ต.ค. 2569 ข้อ 3: ไฟล์ที่รวมแล้วมีบิลฉุกเฉินครบ — เจ้าของยืนยันกู้ทับ
    const backups = () => g.requests.filter(r => r && r.action === 'backup').length, before = backups();
    assert.equal(await B.app.claimPrimaryDevice(), true); await B.app._cloudChain; await B.app.flushCloudOutbox();
    assert.ok(backups() > before); assert.equal(B.app.backupStatus && B.app.backupStatus.lastOk, true);
    A.dispose(); B.dispose();
  });

  // ── D8 ─────────────────────────────────────────────────────────────────────
  await test('D8 deleted ledger rows are rebuilt and un-indexed history stays protected during an emergency', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const jun = bill({ id: 'JUN-000001', date: Date.parse('2026-06-07T12:00:00+07:00'), monthKey: '06-2026', dateTimeStr: '2026-06-07 12:00:00' });
    g.post(Object.assign({}, jun, { deviceId: DEV_A })); g.post(Object.assign(bill({ id: 'OCT-000001' }), { deviceId: DEV_A }));
    const idx = g.sheet('_POS_BILL_INDEX'); idx._grid.splice(idx._grid.findIndex(r => r[0] === 'JUN-000001'), 1);
    assert.equal(g.post(Object.assign(bill({ id: 'JUN-000001' }), { deviceId: DEV_A })).code, 'CROSS_MONTH_BILL_ID');
    // a row pasted onto the sheet by hand (never indexed) during an emergency
    g.sheet('10-2026').appendRow(g.sheet('10-2026')._grid[1].map((v, i) => i === 0 ? 'PASTED-0001' : v));
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true }).status, 'success');
    const over = g.post(Object.assign(bill({ id: 'PASTED-0001', rev: 9, subtotal: 100, total: 100 }), { deviceId: DEV_B }));
    assert.equal(over.code, 'RECOVERY_BILL_PROTECTED');
  });

  // ── D9 ─────────────────────────────────────────────────────────────────────
  await test('D9 reports and commission show the incomplete-data label; emergency shifts are marked', async () => {
    const g = createGasEnv(); const s = await shop(g);
    s.app.filterReports = Object.getPrototypeOf(s.app).filterReports;   // fixtures ปิดการวาดหน้ารายงานไว้ — เทสต์นี้ใช้ตัวจริง
    const tx = await sale(s); const day = s.app.getBusinessISODate(tx.date);
    s.document.getElementById('report-date-input').value = day; s.app.state.selectedReportType = 'daily';
    s.app.filterReports(); assert.equal(s.document.getElementById('report-data-notice').innerText, '');
    await s.app.notePrimaryStatus(true, { recovery: { incomplete: true, startedAt: Date.now() - 1000 } });
    s.app.state.shift.history.push({ startTime: tx.date - 1000, endTime: tx.date + 1000, startCash: 0, countedCash: 0, emergencyRecovery: true });
    s.app.filterReports();
    assert.match(s.document.getElementById('report-data-notice').innerText, /รับช่วงฉุกเฉิน/);
    assert.match(s.document.getElementById('report-commission-body').innerHTML, /⚠️/);
    assert.match(s.document.getElementById('report-shifts-body').innerHTML, /ปิดระหว่างรับช่วงฉุกเฉิน/);
    await s.app.notePrimaryStatus(true, { recovery: null });
    s.app.state.transactions.push(Object.assign(clone(tx), { id: 'SHEETONLY1', details: undefined, sheetOnly: { acceptedAt: Date.now(), month: s.app.getBusinessMonthKey(tx.date) } }));
    s.app.filterReports();
    assert.match(s.document.getElementById('report-data-notice').innerText, /บิลจากชีต 1 ใบ/);
    s.dispose();
  });

  // ── D10 / D12 / D14 ───────────────────────────────────────────────────────
  await test('D10 the owner key is typed once for the emergency route', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, A } = await lostPrimary(g, 2, 1);
    const B = await shop(g); let asked = 0; B.app.askOwnerKey = async () => { asked++; return key; }; B.app.askConfirm = async () => true;
    await B.app.applyBackupData(partial);
    assert.equal(await B.app.claimPrimaryDevice(), true); assert.equal(asked, 1);
    A.dispose(); B.dispose();
  });

  await test('D12 another device\'s emergency flag is never inherited by this device', async () => {
    const g = createGasEnv(); const s = await shop(g);
    await s.app.notePrimaryStatus(false, { label: 'Other', recovery: { incomplete: true, startedAt: Date.now() } });
    await s.app.notePrimaryStatus(true, null);
    assert.equal(s.app.isRecoveryIncomplete(), false);
    s.dispose();
  });

  await test('D14 a combined file that drops the card-fee evidence of an emergency sale is refused', async () => {
    const g = createGasEnv(); const s = await shop(g);
    await s.app.notePrimaryStatus(true, { recovery: { incomplete: true, startedAt: Date.now() - 1000 } });
    const tx = await sale(s); tx.cardFee = { rate: 3, baseRate: 5, base: 300, amount: 9, net: 9, fullAmount: 15, reducedBy: 'บี' }; await s.app.saveState();
    s.app.state.shift.active = false; await s.app.saveState();
    const file = clone(s.app.buildBackupPayload()); delete file.transactions.find(t => t.id === tx.id).cardFee;
    await assert.rejects(s.app.applyBackupData(file), /ขาดบิลที่ขายระหว่างฉุกเฉิน/);
    s.dispose();
  });

  // ── S1 / S2 ───────────────────────────────────────────────────────────────
  await test('S1 the one-time ledger upgrade writes in bulk, not one row at a time', async () => {
    const g = createGasEnv(); const list = [];
    for (let i = 0; i < 200; i++) {
      const d = String(1 + (i % 28)).padStart(2, '0'), ds = `2026-09-${d} 12:${String(i % 60).padStart(2, '0')}:00`;
      list.push(bill({ id: 'LEG-' + String(i).padStart(6, '0'), date: Date.parse(ds.replace(' ', 'T') + '+07:00'), monthKey: '09-2026', dateTimeStr: ds }));
    }
    legacySheet(g, list);
    let appends = 0, writes = 0; const orig = g.ss.insertSheet.bind(g.ss);
    g.ss.insertSheet = name => { const sh = orig(name); const ap = sh.appendRow; sh.appendRow = r => { appends++; return ap(r); };
      const gr = sh.getRange; sh.getRange = function () { const c = gr.apply(this, arguments); const sv = c.setValues; c.setValues = v => { writes++; return sv(v); }; return c; }; return sh; };
    assert.equal(g.post(Object.assign(bill({ id: 'OCT-000001' }), { deviceId: DEV_A })).status, 'success');
    assert.equal(g.sheet('_POS_BILL_INDEX')._grid.length, 202);
    assert.ok(appends + writes <= 6, `ledger writes ${appends} appendRow + ${writes} setValues`);
  });

  await test('S2 transfer validation reads the void archive once, not once per local bill', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.ctx.archiveVoidEvent_('ARCH-00001', { v: 123, r: 0 });
    g.props.POS_PRIMARY_DEVICE = JSON.stringify({ id: DEV_A, label: 'A', claimedAt: Date.now(), how: 'owner' });
    const archive = g.sheet('_POS_VOID_ARCHIVE'); let reads = 0; const gr = archive.getRange;
    archive.getRange = function () { const c = gr.apply(this, arguments); const gv = c.getValues; c.getValues = () => { reads++; return gv(); }; return c; };
    const locals = []; for (let i = 0; i < 150; i++) locals.push(bill({ id: 'LOCAL-' + String(i).padStart(5, '0') }));
    const res = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: locals });
    assert.equal(res.status, 'success', JSON.stringify(res).slice(0, 200)); assert.ok(reads <= 3, 'archive reads ' + reads);
  });

  // ── ข้อควบคุม: ของเดิมยังทำงาน ─────────────────────────────────────────────
  await test('control: a plain emergency takeover and complete release still work end to end', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { full, partial, A } = await lostPrimary(g, 2, 1);
    const B = await emergencyDevice(g, key, partial);
    B.app.state.shift.active = false; await B.app.saveState();
    await B.app.applyBackupData(clone(full), { acceptUnsynced: true });   // ตรวจ 8 ต.ค. 2569 ข้อ 3: เจ้าของยืนยันกู้ทับบิลที่ยังไม่ขึ้นชีต
    assert.equal(await B.app.claimPrimaryDevice(), true); assert.equal(g.ctx.readPrimaryDevice_().recovery, null);
    A.dispose(); B.dispose();
  });

  // ── ผู้ตรวจแยกตรวจงานแก้รอบนี้ (V1–V13) — ข้อบกพร่องของงานแก้เอง ก่อนส่งให้เจ้าของ ─────────────────────
  await test('V1 a lost reply to the accept-loss release keeps the sheet-only bills; retry completes; summary and reconcile stay whole', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, bills, A } = await lostPrimary(g, 2, 1); const lost = bills[1];
    const B = await emergencyDevice(g, key, partial);
    await sale(B); await B.app.syncPendingTransactions(true);
    B.app.askTypedConfirm = async () => true;
    const orig = B.app.fetchWithTimeout.bind(B.app);
    B.app.fetchWithTimeout = async (url, init, t) => {
      const res = await orig(url, init, t);
      if (/"acceptMissing":true/.test(init && init.body)) throw new TypeError('Failed to fetch (response lost)');
      return res;
    };
    assert.equal(await B.app.claimPrimaryDevice(), false);
    B.app.fetchWithTimeout = orig;
    assert.equal(g.ctx.readPrimaryDevice_().recovery, null, 'the server did release');
    assert.ok(B.app.state.transactions.some(t => t.id === lost.id && t.sheetOnly), 'unknown outcome keeps the placeholders');
    assert.match(B.toasts.at(-1).m, /ไม่แน่ใจ/);
    assert.equal(await B.app.claimPrimaryDevice(), true);
    await B.app._cloudChain; await B.app.flushCloudOutbox(); await B.app.flushCloudOutbox();
    const day = g.requests.filter(r => r && r.action === 'summary_day').at(-1);
    assert.equal(day.billCount, 3); assert.equal(day.totalRevenue, 900);
    await B.app.runCloudReconcile();
    assert.ok(!B.app._reconcile.extra.some(x => x.id === lost.id), 'no "delete row" offer for an accepted bill');
    A.dispose(); B.dispose();
  });

  await test('V2 the accepted-loss ledger exempts only a device that holds the sheet-only bill: an old file imports them first', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, bills, A } = await lostPrimary(g, 2, 1); const lost = bills[1];
    const oldFile = clone(partial); const B = await emergencyDevice(g, key, clone(partial));
    B.app.askTypedConfirm = async () => true;
    assert.equal(await B.app.claimPrimaryDevice(), true);
    // raw API: a device that declares nothing is not exempt any more
    const raw = g.post({ action: 'claim_primary', deviceId: 'dev-' + 'd'.repeat(32), ownerKey: key, bills: [] });
    assert.equal(raw.code, 'PRIMARY_TRANSFER_INCOMPLETE');
    assert.ok(raw.details.missing.some(m => m.id === lost.id && m.accepted === true));
    const D = await shop(g); D.app.askOwnerKey = async () => key; let asked = '';
    D.app.askConfirm = async m => { asked += m; return !/ฉุกเฉิน/.test(m); };
    await D.app.applyBackupData(oldFile);
    assert.equal(await D.app.claimPrimaryDevice(), true);
    assert.match(asked, /เคยยอมรับว่ารายละเอียดหายถาวรแล้ว/);
    assert.ok(D.app.state.transactions.some(t => t.id === lost.id && t.sheetOnly));
    await D.app._cloudChain; await D.app.flushCloudOutbox(); await D.app.flushCloudOutbox();
    const day = g.requests.filter(r => r && r.action === 'summary_day').at(-1);
    assert.equal(day.billCount, 2); assert.equal(day.totalRevenue, 600);
    A.dispose(); B.dispose(); D.dispose();
  });

  await test('V2 a "different" bill accepted at release is never exempt later: a device with the old copy cannot overwrite the sheet', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const f = clone(A.app.buildBackupPayload());
    const p = A.app.buildBillPayload(x); Object.assign(p, { rev: 2, discount: 50, total: 250, nonVatBase: 250, lines: undefined });
    assert.equal(g.post(p).status, 'success');
    const month = A.app.getBusinessMonthKey(x.date), total = () => g.sheet(month)._grid.find(r => r[0] === x.id)[11];
    const B = await emergencyDevice(g, key, f); B.app.askTypedConfirm = async () => true;
    assert.equal(await B.app.claimPrimaryDevice(), true);
    await B.app.syncPendingTransactions(true);
    const D = await shop(g); D.app.askOwnerKey = async () => key; D.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await D.app.applyBackupData(clone(B.app.buildBackupPayload()));
    assert.equal(await D.app.claimPrimaryDevice(), false);
    await D.app.syncPendingTransactions(true);
    assert.equal(total(), 250, 'the newer sheet value is kept');
    A.dispose(); B.dispose(); D.dispose();
  });

  await test('V3 a backup taken while an ALREADY_VOIDED decision is pending keeps it pending; only "คืนบิลนี้ขึ้นชีต" lets the bill back', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const month = A.app.getBusinessMonthKey(x.date);
    const f0 = clone(A.app.buildBackupPayload()); await settle(5);
    await voidBill(A, x); await A.app.flushCloudOutbox(); await settle(5);
    await A.app.applyBackupData(clone(f0)); await A.app.syncPendingTransactions(true);
    assert.equal(A.app.state.transactions.find(t => t.id === x.id).syncStatus, 'conflict');
    await settle(5); const f1 = clone(A.app.buildBackupPayload());
    const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async m => !/ฉุกเฉิน/.test(m);
    await B.app.applyBackupData(f1);
    const bx = () => B.app.state.transactions.find(t => t.id === x.id);
    assert.equal(bx().syncStatus, 'conflict'); assert.equal(bx().syncIssue.code, 'ALREADY_VOIDED');
    assert.equal(await B.app.claimPrimaryDevice(), false);
    await B.app.syncPendingTransactions(true);
    assert.equal(onSheet(g, month, x.id), false, 'the voided bill does not come back by itself');
    assert.equal(await B.app.resolveBillConflict(x.id, 'restore-cloud'), true);
    assert.equal(await B.app.claimPrimaryDevice(), true);
    await B.app.syncPendingTransactions(true);
    assert.equal(onSheet(g, month, x.id), true, 'the owner\'s explicit choice restores it');
    A.dispose(); B.dispose();
  });

  await test('V4 a void queued during the pause is neither "missing" nor imported as a sheet-only bill', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, bills, A } = await lostPrimary(g, 3, 1); const lost = bills[1], voided = bills[2];
    const B = await emergencyDevice(g, key, partial);
    const started = g.ctx.readPrimaryDevice_().recovery.startedAt;
    const month = B.app.getBusinessMonthKey(voided.date);
    B.app.state.cloudOutbox.push({ id: 'cob-x', createdAt: started + 1000, dateKeys: [], monthKeys: [month], needVoidDelete: true,
      voidDelete: { id: voided.id, date: voided.date, monthKey: month, voidedBy: 'A', voidedAt: started + 1000 }, needSummary: true, needTelegram: false, telegramMessage: '', tries: 0, rev: 0 });
    await B.app.saveState();
    let asked = ''; B.app.askTypedConfirm = async m => { asked = m; return true; };
    assert.equal(await B.app.claimPrimaryDevice(), true);
    assert.ok(asked.includes(lost.id)); assert.ok(!asked.includes(voided.id));
    assert.ok(!B.app.state.transactions.some(t => t.id === voided.id));
    await B.app.flushCloudOutbox(); await B.app.flushCloudOutbox();
    assert.equal(onSheet(g, month, voided.id), false, 'the queued void is sent after the release');
    const day = g.requests.filter(r => r && r.action === 'summary_day').at(-1);
    assert.equal(day.billCount, 2); assert.equal(day.totalRevenue, 600);
    A.dispose(); B.dispose();
  });

  await test('V5 summaries re-published after accepting a loss flag the missing commission on the sheet itself', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, A } = await lostPrimary(g, 3, 1);
    const B = await emergencyDevice(g, key, partial); B.app.askTypedConfirm = async () => true;
    assert.equal(await B.app.claimPrimaryDevice(), true);
    await B.app._cloudChain; await B.app.flushCloudOutbox(); await B.app.flushCloudOutbox();
    const day = g.requests.filter(r => r && r.action === 'summary_day').at(-1);
    assert.equal(day.sheetOnlyBills, 2);
    const sh = g.ss._sheets.find(x => x.getName().includes(day.dateKey));
    assert.match(JSON.stringify(sh._grid), /บิลจากชีต 2 ใบ/);
    A.dispose(); B.dispose();
  });

  await test('V6/V7/V8 sheet rows become faithful sheet-only bills (VAT rate, card-fee label, legacy rows, text dates); unknown labels are refused, not guessed', async () => {
    const g = createGasEnv(); const s = await shop(g);
    const base = { id: 'ROW-000001', month: '10-2026', version: 'v1:0:1', when: '2026-10-05 14:00:00', customer: 'x', services: 'ตัดผม, ค่าธรรมเนียมบัตร 10%',
      staff: 'เอ', payment: 'เงินสด', subtotal: 300, discount: 0, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300 };
    const t = over => s.app.sheetOnlyBillFromRow(Object.assign({}, base, over), 1);
    const vat = t({ subtotal: 1000, nonVatBase: 0, vatableBase: 1000, vatAmount: 70, rounding: 0, total: 1070 }).tx;
    assert.equal(vat.vatRate, 7); assert.equal(JSON.stringify(vat.services), JSON.stringify(['ตัดผม']));
    assert.ok(t({ subtotal: 287.5, nonVatBase: 287.5, total: 287.5 }).tx, 'legacy satang bill on a VAT tab');
    assert.ok(t({ subtotal: 100, discount: 120, nonVatBase: 0, total: 0 }).tx, 'legacy discount-over bill');
    assert.equal(new Date(t({ when: '5/10/2569 14:00' }).tx.date).toISOString(), '2026-10-05T07:00:00.000Z');
    assert.equal(new Date(t({ when: '10/5/2026 14:00:00' }).tx.date).toISOString(), '2026-10-05T07:00:00.000Z');
    assert.match(t({ payment: 'โอน' }).error, /ไม่รู้จัก/);
    // reconcile "resend" does not leave a sheet-only bill pending forever; the drawer never counts it
    const r = t({}).tx; s.app.state.transactions.push(r); await s.app.saveState();
    await s.app.reconcileResendBill(r.id);
    assert.equal(s.app.state.transactions.find(x => x.id === r.id).syncStatus, 'synced');
    const cash = s.app.computeShiftDrawer({ startTime: 0, startCash: 0, expenses: [] }).cashSales;
    assert.equal(cash, 0);
    s.dispose();
  });

  await test('V7 more than 500 lost bills can still be accepted', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey(); const ids = [];
    for (let i = 0; i < 501; i++) { const id = 'LOST-' + String(i).padStart(5, '0'); ids.push(id);
      const ds = `2026-10-0${1 + (i % 6)} 1${i % 10}:${String(i % 60).padStart(2, '0')}:00`;
      g.post(Object.assign(bill({ id, date: Date.parse(ds.replace(' ', 'T') + '+07:00'), dateTimeStr: ds }), { deviceId: DEV_A })); }
    g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [], acceptMissing: true, acceptIds: ids });
    assert.equal(r.status, 'success', r.code); assert.equal(r.details.accepted, 501);
  });

  await test('V9 ledger upgrade edge cases: old plain marker rebuilds a deleted ledger, a cleared row blocks nothing, a late duplicate is closed', async () => {
    const sept = bill({ id: 'SEP-000001', date: Date.parse('2026-09-07T12:00:00+07:00'), monthKey: '09-2026', dateTimeStr: '2026-09-07 12:00:00' });
    { const g = createGasEnv(); g.post(Object.assign({}, sept, { deviceId: DEV_A }));
      g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); g.props.POS_BILL_INDEX_GLOBAL_V1 = g.ctx.backendId_();
      assert.equal(g.post(Object.assign(bill({ id: 'NEW-000001' }), { deviceId: DEV_A })).status, 'success');
      assert.ok(g.sheet('_POS_BILL_INDEX')._grid.some(r => r[0] === 'SEP-000001'), 'rebuilt'); }
    { const g = createGasEnv(); g.post(Object.assign({}, sept, { deviceId: DEV_A })); g.post(Object.assign(bill({ id: 'OCT-000001' }), { deviceId: DEV_A }));
      const idx = g.sheet('_POS_BILL_INDEX'); idx._grid[1] = idx._grid[1].map(() => '');
      idx._grid.pop(); // also force a re-upgrade (row count dropped)
      assert.equal(g.post(Object.assign(bill({ id: 'NEW-000002' }), { deviceId: DEV_A })).status, 'success'); }
    { const g = createGasEnv(); g.post(Object.assign({}, sept, { deviceId: DEV_A }));
      const copy = g.ss.insertSheet('06-2026'); g.sheet('09-2026')._grid.forEach(r => copy.appendRow(r.slice())); copy._grid[0][2] = 'แก้หัว';
      g.ss.deleteSheet(g.sheet('_POS_BILL_INDEX')); delete g.props.POS_BILL_INDEX_GLOBAL_V1;
      g.post(Object.assign(bill({ id: 'NEW-000003' }), { deviceId: DEV_A }));
      copy._grid[0][2] = g.sheet('09-2026')._grid[0][2];   // header fixed → re-upgrade finds the duplicate
      g.post(Object.assign(bill({ id: 'NEW-000004' }), { deviceId: DEV_A }));
      assert.equal(g.post(Object.assign({}, sept, { rev: 2, deviceId: DEV_A })).code, 'DUPLICATE_BILL_ID'); }
  });

  await test('V10 a mistyped owner key is not remembered when the retry is answered before the key is checked (BUSY)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey(); const s = await shop(g);
    let asks = 0; s.app.askOwnerKey = async () => { asks++; return asks === 1 ? 'WRONG-WRONG-WRONG-WRONG' : key; };
    let n = 0; const orig = s.app.fetchWithTimeout.bind(s.app);
    s.app.fetchWithTimeout = async (u, init, t) => { n++; if (n === 2) g.faults.waitLock = true; try { return await orig(u, init, t); } finally { delete g.faults.waitLock; } };
    const d = await s.app.cloudPost('list_bill_months', {}, 15000, { owner: true });
    assert.equal(d.code, 'BUSY'); assert.notEqual(s.app._ownerKey, 'WRONG-WRONG-WRONG-WRONG');
    s.dispose();
  });

  await test('V13 a void stamped ahead of the server clock does not block a normal transfer', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'KEEP-00001' }), { deviceId: DEV_A })); g.post(Object.assign(bill({ id: 'VOIDED-001' }), { deviceId: DEV_A }));
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: [bill({ id: 'KEEP-00001' })],
      voidIntents: [{ id: 'VOIDED-001', voidedAt: Date.now() + 8 * 60000 }] });
    assert.equal(r.status, 'success', JSON.stringify(r.details || r.code));
  });

  await test('V14 an unreadable accepted-loss ledger does not break reconcile, and no sheet row can be deleted while it is unreadable', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const { partial, bills, A } = await lostPrimary(g, 2, 1); const lost = bills[1];
    const B = await emergencyDevice(g, key, partial); B.app.askTypedConfirm = async () => true;
    assert.equal(await B.app.claimPrimaryDevice(), true);
    g.sheet('_POS_RECOVERY_ACCEPTED')._grid[0][0] = 'แก้หัว';
    const month = B.app.getBusinessMonthKey(lost.date);
    const raw = g.post({ action: 'list_bills', ownerKey: key, monthKey: month });
    assert.equal(raw.status, 'success', raw.message); assert.ok(raw.details.acceptedLedgerError);
    B.app.state.transactions = B.app.state.transactions.filter(t => t.id !== lost.id); await B.app.saveState();
    await B.app.runCloudReconcile();
    const item = B.app._reconcile.extra.find(x => x.id === lost.id);
    assert.ok(item && item.acceptedUnknown, 'the row is listed but protected');
    let confirmed = false; B.app.showConfirm = () => { confirmed = true; };
    B.app.reconcileDeleteSheetBill(lost.id);
    assert.equal(confirmed, false, 'no delete offered'); assert.equal(onSheet(g, month, lost.id), true);
    A.dispose(); B.dispose();
  });

  // ── ผู้ตรวจแยกรอบ 2 (หลังแก้ V1–V14) ─────────────────────────────────────────
  await test('V15 a bill pasted twice on the sheet is a duplicate to clean up, never a "lost" bill to accept (app and raw API)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
    const month = A.app.getBusinessMonthKey(x.date), tab = g.sheet(month);
    tab.appendRow(tab._grid.find(r => String(r[0]).replace(/^'/, '') === x.id).slice());
    const partial = clone(A.app.buildBackupPayload()); partial.transactions = partial.transactions.filter(t => t.id === x.id);
    const B = await emergencyDevice(g, key, partial);
    let prompt = ''; B.app.askTypedConfirm = async m => { prompt = m; return true; };
    assert.equal(await B.app.claimPrimaryDevice(), false);
    assert.equal(prompt, '', 'no accept-loss prompt'); assert.match(B.toasts.at(-1).m, /หลายแถวบนชีต/);
    assert.ok(g.ctx.readPrimaryDevice_().recovery); assert.equal(g.sheet('_POS_RECOVERY_ACCEPTED'), null);
    const raw = g.post({ action: 'claim_primary', deviceId: B.app.deviceId, ownerKey: key, recoveryConfirmed: true,
      bills: B.app.transferBillsPayload(), acceptMissing: true, acceptIds: [x.id] });
    assert.equal(raw.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(raw.details.acceptable, false);
    // the owner deletes the pasted row → the normal release path works again
    tab._grid.splice(tab._grid.length - 1, 1);
    assert.equal(await B.app.claimPrimaryDevice(), true); assert.ok(prompt.length > 0, 'the really missing bill is still offered');
    A.dispose(); B.dispose();
  });

  await test('V16 an emergency release that leaves voids pending writes evidence for them (also via the raw API)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'KEEP-00001' }), { deviceId: DEV_A }));
    g.post(Object.assign(bill({ id: 'LOST-00001', total: 5000, subtotal: 5000 }), { deviceId: DEV_A }));
    g.post(Object.assign(bill({ id: 'LOST-00002', total: 7000, subtotal: 7000 }), { deviceId: DEV_A }));
    g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
    const started = g.ctx.readPrimaryDevice_().recovery.startedAt;
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [bill({ id: 'KEEP-00001' })],
      voidIntents: [{ id: 'LOST-00001', voidedAt: 0 }, { id: 'LOST-00002', voidedAt: started + 1 }] });
    assert.equal(r.status, 'success'); assert.equal(r.details.pendingVoidRecorded, 2);
    const rows = g.sheet('_POS_RECOVERY_ACCEPTED')._grid.slice(1).map(x => [x[0], x[3], x[4]]);
    assert.deepEqual(rows, [['LOST-00001', 5000, 'pendingVoid'], ['LOST-00002', 7000, 'pendingVoid']]);
    // evidence rows never act as an exemption for a later transfer
    const n = g.post({ action: 'claim_primary', deviceId: 'dev-' + 'c'.repeat(32), ownerKey: key, bills: [bill({ id: 'KEEP-00001' })],
      sheetOnly: [{ id: 'LOST-00001', month: '10-2026', version: 'v1:0:1', total: 5000 }] });
    assert.equal(n.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.ok(n.details.missing.some(m => m.id === 'LOST-00001' && !m.accepted));
  });

  await test('V17 an edited header on _POS_RECOVERY_ACCEPTED does not block a device with complete data; acceptance is refused while it is unreadable', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    g.post(Object.assign(bill({ id: 'KEEP-00001' }), { deviceId: DEV_A })); g.post(Object.assign(bill({ id: 'LOST-00001' }), { deviceId: DEV_A }));
    g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
    assert.equal(g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [bill({ id: 'KEEP-00001' })],
      acceptMissing: true, acceptIds: ['LOST-00001'] }).status, 'success');
    g.sheet('_POS_RECOVERY_ACCEPTED')._grid[0][1] = 'เดือน (แก้เอง)';
    const full = g.post({ action: 'claim_primary', deviceId: 'dev-' + 'c'.repeat(32), ownerKey: key, bills: [bill({ id: 'KEEP-00001' }), bill({ id: 'LOST-00001' })] });
    assert.equal(full.status, 'success', full.message);
    g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
    const acc = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [bill({ id: 'KEEP-00001' })],
      acceptMissing: true, acceptIds: ['LOST-00001'] });
    assert.equal(acc.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(acc.details.acceptable, false);
    assert.ok(acc.details.acceptedLedgerError); assert.match(acc.message, /_POS_RECOVERY_ACCEPTED/);
  });

  console.log('=== ผ่าน ' + passed + ' · ไม่ผ่าน ' + failed + ' ===');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
