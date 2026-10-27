// Claude ตรวจซ้ำงานแก้ Codex (C1–C6) 14 ต.ค. 2569 — เทสต์ที่ตกกับโค้ดก่อนแก้รอบนี้
// ใช้แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จริงในชีตจำลอง (ไม่ stub ตัวบันทึกเงิน)
const vm = require('vm');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db');
const R = makeRunner('--- Claude recheck of Codex fixes 14 Oct 2026 ---');
const copy = x => JSON.parse(JSON.stringify(x));
const monthRows = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => gas.sheet(n)._grid.slice(1));
const wait = ms => new Promise(r => setTimeout(r, ms));
// จำนวน/ยอดบิลยกเลิกที่รายงานปิดกะ (Telegram) จะบอก — ตัวที่เจ้าของอ่านจริง
const shiftVoidLine = app => {
  const m = app.buildShiftReportMessage(Object.assign({}, app.state.shift, { endTime: Date.now() + 1000 }));
  const r = /บิลที่ถูกยกเลิกในกะ: (\d+) ใบ \(([^)]*)\)/.exec(m);
  return r ? `${r[1]} ใบ ${r[2]}` : 'ไม่มี';
};
// จำนวนบิลยกเลิกบนหน้ารายงาน (เจ้าของ · วันนี้)
const reportVoidCount = (env, app) => {
  app.renderAuditTrail('daily', app.getBusinessISODate(Date.now()));
  return env.document.getElementById('report-voids-count').innerText || 'ไม่มี';
};
async function sale(env, amount = 500) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], 'cash', amount);
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
// ขายออนไลน์ (ขึ้นชีต) → สำรอง → เน็ตหลุด → ยกเลิก (คำสั่งลบค้าง)
async function syncedSaleThenOfflineVoid() {
  const shop = await makeShop();
  const { env, app, gas } = shop;
  await settle();
  const preSale = copy(app.buildBackupPayload());
  preSale.createdAt = new Date(Date.now() - 1000).toISOString();
  await wait(5);
  const tx = await sale(env);
  await app.syncPendingTransactions(true); await settle(30);
  ok(monthRows(gas).some(r => r[0] === tx.id), 'control: bill reached the sheet');
  const preVoid = copy(app.buildBackupPayload());
  preVoid.createdAt = new Date(Date.now()).toISOString();
  await wait(5);
  env.ctx.navigator.onLine = false;
  const realFetch = env.ctx.fetch;
  env.ctx.fetch = async () => { throw new Error('test offline'); };
  await voidBill(env, tx);
  ok(app.state.cloudOutbox.some(j => j.needVoidDelete && j.voidDelete && j.voidDelete.id === tx.id), 'control: delete queued');
  const goOnline = async () => {
    env.ctx.navigator.onLine = true; env.ctx.fetch = realFetch;
    await app.flushCloudOutbox(); await settle(40);
  };
  return Object.assign(shop, { tx, preSale, preVoid, goOnline });
}

(async () => {
  // ── N1: กู้ไฟล์ก่อนยกเลิก (บิลรอตรวจ) แล้วกู้ไฟล์อื่นที่ไม่มีบิลนั้น → เจตนายกเลิก/คำสั่งลบแถวบนชีตหายเงียบ ──
  await R.t('N1 control: restoring a file without the voided bill keeps the sheet delete', async () => {
    const s = await syncedSaleThenOfflineVoid();
    try {
      await s.app.applyBackupData(copy(s.preSale), { acceptUnsynced: true });
      await s.goOnline();
      ok(!monthRows(s.gas).some(r => r[0] === s.tx.id), 'voided bill row still on sheet');
    } finally { s.env.dispose(); }
  });
  await R.t('N1 restore pre-void file, then a file without the bill: void intent still deletes the sheet row', async () => {
    const s = await syncedSaleThenOfflineVoid();
    try {
      await s.app.applyBackupData(copy(s.preVoid), { acceptUnsynced: true });
      const held = s.app.state.transactions.find(t => t.id === s.tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.localVoidPending, 'first restore control');
      await s.app.applyBackupData(copy(s.preSale), { acceptUnsynced: true });
      ok(!s.app.state.transactions.some(t => t.id === s.tx.id), 'bill not in the second file');
      ok(s.app.state.cloudOutbox.some(j => j.needVoidDelete && j.voidDelete && j.voidDelete.id === s.tx.id),
        'delete for the locally voided bill was dropped');
      eq(s.app.state.voidLog.filter(v => v.billId === s.tx.id).length, 1, 'void evidence lost');
      await s.goOnline();
      ok(!monthRows(s.gas).some(r => r[0] === s.tx.id), 'voided bill stays on the sheet (sales overstated)');
    } finally { s.env.dispose(); }
  });

  // ── N2: เลือก "ยกเลิกในเครื่องตามชีต" หลัง C1 → ประวัติยกเลิกของบิลเดียวมี 2 แถว (รายงาน/Telegram นับซ้ำ) ──
  await R.t('N2 void-local after restore records one void per bill (report counts once)', async () => {
    const s = await syncedSaleThenOfflineVoid();
    try {
      await s.app.applyBackupData(copy(s.preVoid), { acceptUnsynced: true });
      eq(s.app.state.voidLog.filter(v => v.billId === s.tx.id).length, 1, 'C1 carry control');
      await s.app.resolveBillConflict(s.tx.id, 'void-local');
      await settle(30);
      ok(!s.app.state.transactions.some(t => t.id === s.tx.id));
      eq(s.app.computeShiftDrawer(s.app.state.shift).expected, 1000, 'drawer refund applied once');
      const counted = s.app.state.voidLog.filter(v => v.billId === s.tx.id && !v.supersededBy);
      eq(counted.length, 1, `void rows counted for one bill: ${counted.length} (sum ${counted.reduce((a, v) => a + v.amount, 0)})`);
      const rec = counted[0];
      eq(rec.moneyOutcome, 'refunded');
      // หลักฐานการยกเลิกครั้งแรก (ใคร/เมื่อไร) ยังอยู่
      ok(s.app.state.voidLog.some(v => v.billId === s.tx.id && v.supersededBy), 'original void evidence removed');
      eq(shiftVoidLine(s.app), '1 ใบ ฿500', 'shift report counts the bill twice');
      eq(reportVoidCount(s.env, s.app), '1 ใบ · รวม ฿500.00', 'report page counts the bill twice');
      await s.goOnline();
      ok(!monthRows(s.gas).some(r => r[0] === s.tx.id));
    } finally { s.env.dispose(); }
  });

  // ── N4: เลือก "คืนบิลนี้ขึ้นชีต" หลัง C1 → บิลกลับมาขาย แต่ประวัติยกเลิกที่พกมายังถูกนับเป็นบิลยกเลิก ──
  await R.t('N4 restore-cloud after restore: the carried void no longer counts as a void', async () => {
    const s = await syncedSaleThenOfflineVoid();
    try {
      await s.app.applyBackupData(copy(s.preVoid), { acceptUnsynced: true });
      await s.app.resolveBillConflict(s.tx.id, 'restore-cloud');
      await settle(30);
      const b = s.app.state.transactions.find(t => t.id === s.tx.id);
      ok(b && b.syncStatus === 'pending', 'control: bill back');
      eq(s.app.computeShiftDrawer(s.app.state.shift).expected, 1500, 'control: drawer follows the restored file');
      eq(shiftVoidLine(s.app), 'ไม่มี', 'alive bill still reported as voided in the shift report');
      eq(reportVoidCount(s.env, s.app), 'ไม่มี', 'alive bill still reported as voided on the report page');
      ok(s.app.state.voidLog.some(v => v.billId === s.tx.id && v.supersededBy), 'original void evidence removed');
      eq((await s.env.raw('voidLog')).filter(v => v.billId === s.tx.id && !v.supersededBy).length, 0, 'not persisted');
    } finally { s.env.dispose(); }
  });

  // ── N5: กู้ไฟล์ที่ทำระหว่างบิลรอตรวจ หลังเลือก "ยกเลิกในเครื่องตามชีต" → ป้าย "ถูกแทน" ต้องไม่หาย (ไม่นับซ้ำ 2 ใบ) ──
  await R.t('N5 restoring a mid-conflict file after void-local keeps the superseded mark', async () => {
    const s = await syncedSaleThenOfflineVoid();
    try {
      await s.app.applyBackupData(copy(s.preVoid), { acceptUnsynced: true });
      const mid = copy(s.app.buildBackupPayload());
      mid.createdAt = new Date(Date.now()).toISOString();
      await wait(5);
      await s.app.resolveBillConflict(s.tx.id, 'void-local'); await settle(30);
      eq(shiftVoidLine(s.app), '1 ใบ ฿500', 'control');
      await s.app.applyBackupData(copy(mid), { acceptUnsynced: true }); await settle(20);
      const held = s.app.state.transactions.find(t => t.id === s.tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.localVoidPending, 'control: held again');
      eq(shiftVoidLine(s.app), '1 ใบ ฿500', 'one bill counted twice after restoring the mid file');
      eq(reportVoidCount(s.env, s.app), '1 ใบ · รวม ฿500.00');
    } finally { s.env.dispose(); }
  });

  // ── C2 (เจ้าของเลือก 14 ต.ค.): กู้ → ยกเลิก+คืนเงิน → ย้อนกลับไปก่อนกู้ → บิลต้องเข้ากล่องรอตรวจ · ย้อนซ้ำกลับได้ครบ ──
  await R.t('C2 undo after a post-restore refund void holds the bill; undo again restores the void and the sheet delete', async () => {
    const shop = await makeShop();
    const { env, app, gas } = shop;
    try {
      await settle();
      const tx = await sale(env);
      await app.syncPendingTransactions(true); await settle(30);
      const F = copy(app.buildBackupPayload()); F.createdAt = new Date(Date.now() - 1000).toISOString();
      await wait(5);
      await app.savePreRestoreSnapshot();
      await app.applyBackupData(copy(F), { acceptUnsynced: true }); await settle(30);
      await wait(5);
      env.ctx.navigator.onLine = false; const rf = env.ctx.fetch; env.ctx.fetch = async () => { throw new Error('test offline'); };
      await voidBill(env, tx);
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000, 'control: refund paid');
      app.askTypedConfirm = async () => true;
      await app.undoLastRestore(); await app._confirmP; await settle(30);
      const held = app.state.transactions.find(t => t.id === tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.localVoidPending, `undo resurrected the refunded bill: ${held && held.syncStatus}`);
      eq(app.state.voidLog.filter(v => v.billId === tx.id && !v.supersededBy).length, 1, 'void evidence lost');
      // ย้อนอีกครั้ง = กลับไปชุดที่ยกเลิกแล้ว: บิลไม่อยู่ · คำสั่งลบแถวยังอยู่ (ครั้งเดียว) · ลิ้นชักตามเงินจริง
      await app.undoLastRestore(); await app._confirmP; await settle(30);
      ok(!app.state.transactions.some(t => t.id === tx.id), 'bill back after the second undo');
      eq(app.state.cloudOutbox.filter(j => j.needVoidDelete && j.voidDelete && j.voidDelete.id === tx.id).length, 1, 'sheet delete');
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000);
      eq(shiftVoidLine(app), '1 ใบ ฿500');
      env.ctx.navigator.onLine = true; env.ctx.fetch = rf;
      await app.flushCloudOutbox(); await settle(40);
      ok(!monthRows(gas).some(r => r[0] === tx.id), 'voided bill row still on the sheet');
    } finally { env.dispose(); }
  });

  // ── N2/N4: บันทึกล้มเหลว → ประวัติยกเลิกในหน่วยความจำต้องคืนเหมือนเดิม (ไม่มีป้าย "ถูกแทน" ค้าง) ──
  for (const action of ['void-local', 'restore-cloud']) {
    await R.t(`N2/N4 ${action}: failed save leaves the void history untouched`, async () => {
      const s = await syncedSaleThenOfflineVoid();
      try {
        await s.app.applyBackupData(copy(s.preVoid), { acceptUnsynced: true });
        const before = JSON.stringify(s.app.state.voidLog);
        const undo = failPutForKeys(['transactions', 'voidLog'], 'async');
        try { await s.app.resolveBillConflict(s.tx.id, action); await settle(30); } finally { undo(); }
        eq(JSON.stringify(s.app.state.voidLog), before, 'void history changed after a failed save');
        const held = s.app.state.transactions.find(t => t.id === s.tx.id);
        ok(held && held.syncStatus === 'conflict', 'bill left the review box after a failed save');
      } finally { s.env.dispose(); }
    });
  }

  // ── N3: แก้บิลของผู้จัดการ — ด่านเวลา/วันทำการต้องตรวจซ้ำ ณ จุดเขียน (ช่องว่างแบบเดียวกับ C3) ──
  await R.t('N3 manager bill edit rechecks the clock after the await before writing', async () => {
    const { env, app } = await makeShop();
    try {
      env.ctx.navigator.onLine = false;
      const tx = await sale(env);
      loginAs(app, 'manager');
      const D = vm.runInContext('Date', env.ctx), before = D.now();
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-discount').value = '100';
      const real = app.ensurePrimaryForFinancialMutation.bind(app);
      app.ensurePrimaryForFinancialMutation = async (l) => { D.now = () => before - 600000; return real(l); };
      await app.saveTransactionEdit(); await settle(20);
      eq(tx.total, 500, 'clock rolled back during the await but the edit was written');
      eq((await env.raw('transactions'))[0].total, 500);
    } finally { env.dispose(); }
  });
  await R.t('N3 manager edit started before 06:00 cannot write after the bill became a past-day bill', async () => {
    const { env, app } = await makeShop();
    try {
      env.ctx.navigator.onLine = false;
      const tx = await sale(env);
      loginAs(app, 'manager');
      const D = vm.runInContext('Date', env.ctx), before = D.now();
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-discount').value = '100';
      D.now = () => before + 24 * 3600e3;   // ยืนยันหลังเลยรอบวันทำการ (เวลาเดินหน้า ไม่ใช่นาฬิกาถอย)
      // 26 ต.ค. 2569 ข้อ 3: บิลของกะที่ "ยังเปิดอยู่" ผู้จัดการแก้ได้แม้เลย 06:00 — ด่านนี้เป็นของบิลวันก่อนที่กะปิดไปแล้ว
      app.state.shift.active = false;
      eq(app.billAccessFor(tx), 'none', 'control: bill is now a past-day bill for the manager');
      await app.saveTransactionEdit(); await settle(20);
      eq(tx.total, 500, 'manager edited a past-day bill');
      eq((await env.raw('transactions'))[0].total, 500);
    } finally { env.dispose(); }
  });
  await R.t('N3 manager with settle-only access cannot change a past-day bill through the edit form', async () => {
    const { env, app } = await makeShop();
    try {
      env.ctx.navigator.onLine = false;
      const tx = await sale(env);
      // เจ้าของแก้ส่วนลด → ค้างบันทึกคืนเงิน (settle-only ให้ผู้จัดการวันถัดไป)
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-discount').value = '100';
      await app.saveTransactionEdit(); await settle(20);
      eq(tx.total, 400, 'control: owner edit');
      const D = vm.runInContext('Date', env.ctx), before = D.now();
      D.now = () => before + 24 * 3600e3;
      app.state.shift.active = false;   // 26 ต.ค. ข้อ 3: กะของบิลนี้ปิดไปแล้ว (บิลของกะที่ยังเปิดอยู่ผู้จัดการแก้ได้)
      loginAs(app, 'manager');
      eq(app.billAccessFor(tx), 'settle-only', 'control: settle-only access');
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-discount').value = '300';
      await app.saveTransactionEdit(); await settle(20);
      eq(tx.total, 400, 'settle-only manager changed the discount of a past-day bill');
    } finally { env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
