// ตรวจ 14 ต.ค. 2569 รอบแก้ fx6 — ข้อ 1 (กู้/ย้อนการกู้หลังยกเลิกออนไลน์) · ข้อ 8 (งวดสรุปที่ค้างข้ามการกู้)
// ข้อ 13 (ลบแถวในหน้าตรวจความตรงกันซ้ำ) · ข้อ 20 (cardFeeRate ในการตรวจไฟล์ก่อนกู้)
// แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จริงในชีตจำลอง · ต้องตกกับโค้ดก่อนแก้
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- fix 14 Oct 2026 (fx6) ---');
const copy = x => JSON.parse(JSON.stringify(x));
const wait = ms => new Promise(r => setTimeout(r, ms));
const monthRows = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => gas.sheet(n)._grid.slice(1));
const onSheet = (gas, id) => monthRows(gas).some(r => r[0] === id);
async function sale(env, amount = 500) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], 'cash', amount);
  await env.app.processCheckout(); await settle(25);
  return env.app.state.transactions.at(-1);
}
async function voidBill(env, tx, outcome = 'refunded') {
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = outcome;
  await env.app.voidTransaction(); await env.app._confirmP; await settle(30);
}
async function drain(app) { for (let i = 0; i < 4; i++) { await app.syncPendingTransactions(true); await app.flushCloudOutbox(); await settle(20); } }
const activeVoids = (app, id) => app.state.voidLog.filter(v => v.billId === id && !v.supersededBy);
const shiftVoidLine = app => {
  const m = app.buildShiftReportMessage(Object.assign({}, app.state.shift, { endTime: Date.now() + 1000 }));
  const r = /บิลที่ถูกยกเลิกในกะ: (\d+) ใบ \(([^)]*)\)/.exec(m);
  return r ? `${r[1]} ใบ ${r[2]}` : 'ไม่มี';
};

(async () => {
  // ── ข้อ 1: กู้ → ยกเลิก+คืนเงินตอนออนไลน์ (ลบแถวถึงชีต) → ย้อนการกู้ → ต้องเข้ากล่องรอตรวจ ไม่ใช่คืนบิลเงียบ ๆ ──
  await R.t('ข้อ 1 ย้อนการกู้หลังยกเลิกออนไลน์: บิลเข้ากล่องรอตรวจ · แถวไม่กลับขึ้นชีต · ยกเลิกตามเดิมแล้วลิ้นชักถูก', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await drain(app);
      const F = copy(app.buildBackupPayload()); F.createdAt = new Date(Date.now() - 1000).toISOString();
      await wait(5);
      await app.savePreRestoreSnapshot();
      await app.applyBackupData(copy(F), { acceptUnsynced: true }); await drain(app);
      await wait(5);
      await voidBill(env, tx); await drain(app);
      ok(!onSheet(gas, tx.id) && !app.state.cloudOutbox.some(j => j.needVoidDelete), 'control: delete reached the sheet');
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000, 'control: refund paid');
      app.askTypedConfirm = async () => true;
      await app.undoLastRestore(); await app._confirmP; await drain(app);
      const held = app.state.transactions.find(t => t.id === tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.code === 'ALREADY_VOIDED' && held.syncIssue.localVoidPending,
        `undo resurrected the refunded bill: ${held && held.syncStatus}`);
      ok(held.syncIssue.localVoidSynced === true && !/ยังไม่ถึงชีต/.test(held.syncIssue.message) && /ถูกลบไปแล้ว/.test(held.syncIssue.message), held.syncIssue.message);
      ok(!onSheet(gas, tx.id), 'refunded bill row came back on the sheet');
      eq(activeVoids(app, tx.id).length, 1, 'void evidence lost');
      await app.resolveBillConflict(tx.id, 'void-local'); await drain(app);
      ok(!app.state.transactions.some(t => t.id === tx.id), 'bill still in device');
      const v = activeVoids(app, tx.id);
      ok(v.length === 1 && v[0].moneyOutcome === 'refunded' && /ถูกลบไปแล้ว/.test(v[0].reason || ''), JSON.stringify(v.map(x => [x.reason, x.moneyOutcome])));
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000, 'drawer');
      eq(shiftVoidLine(app), '1 ใบ ฿500');
      ok(!onSheet(gas, tx.id));
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 1 กู้ไฟล์ที่สร้างก่อนการยกเลิกออนไลน์: ประวัติ "คืนเงินแล้ว" ไม่หาย · ยกเลิกในเครื่องตามชีตแล้วลิ้นชักถูก', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await drain(app);
      const F = copy(app.buildBackupPayload()); F.createdAt = new Date(Date.now() - 1000).toISOString();
      await wait(5);
      await voidBill(env, tx); await drain(app);
      await app.applyBackupData(copy(F), { acceptUnsynced: true }); await drain(app);
      const held = app.state.transactions.find(t => t.id === tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.code === 'ALREADY_VOIDED', 'not held');
      eq(activeVoids(app, tx.id).length, 1, 'void evidence lost by restore');
      ok(/เอาเงินของบิลออกจากยอดที่ควรมี/.test(held.syncIssue.message || ''), held.syncIssue.message);
      await app.resolveBillConflict(tx.id, 'void-local'); await drain(app);
      eq(activeVoids(app, tx.id).map(v => v.moneyOutcome), ['refunded']);
      eq(app.computeShiftDrawer(app.state.shift).expected, 1000, 'drawer still expects the refunded cash');
      ok(!onSheet(gas, tx.id));
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 1 คงพฤติกรรม C2: ยกเลิกตอนออฟไลน์ → ข้อความยังบอกว่าคำสั่งลบยังไม่ถึงชีต (ไม่ติดธงถึงชีตแล้ว)', async () => {
    const { env, app } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await drain(app);
      const F = copy(app.buildBackupPayload()); F.createdAt = new Date(Date.now() - 1000).toISOString();
      await wait(5);
      await app.savePreRestoreSnapshot();
      await app.applyBackupData(copy(F), { acceptUnsynced: true }); await drain(app);
      await wait(5);
      env.ctx.navigator.onLine = false; const rf = env.ctx.fetch; env.ctx.fetch = async () => { throw new Error('test offline'); };
      await voidBill(env, tx);
      app.askTypedConfirm = async () => true;
      await app.undoLastRestore(); await app._confirmP; await settle(30);
      const held = app.state.transactions.find(t => t.id === tx.id);
      ok(held && held.syncStatus === 'conflict' && held.syncIssue.localVoidPending && !held.syncIssue.localVoidSynced, 'C2 behaviour changed');
      ok(/ยังไม่ถึงชีต/.test(held.syncIssue.message), held.syncIssue.message);
      env.ctx.navigator.onLine = true; env.ctx.fetch = rf;
    } finally { env.dispose(); }
  });

  await R.t('ข้อ 1 ยกเลิกก่อนไฟล์ถูกสร้าง (ไฟล์รู้แล้ว) = ไม่ถาม', async () => {
    const { env, app } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await drain(app);
      const F = copy(app.buildBackupPayload());   // ไฟล์มีบิลนี้ แต่ "รู้เรื่องถึง" หลังการยกเลิก
      await wait(5);
      await voidBill(env, tx); await drain(app);
      await wait(5);
      F.createdAt = new Date(Date.now()).toISOString();
      await app.withMutation('t', async () => { const snap = app.buildPreRestoreSnapshot(); await app._applyBackupDataLocked(copy(F), { acceptUnsynced: true }, { preRestoreSnapshot: snap }); return true; });
      const x = app.state.transactions.find(t => t.id === tx.id);
      ok(x && !(x.syncIssue && x.syncIssue.localVoidPending), 'held although the file was created after the void');
    } finally { env.dispose(); }
  });

  // ── ข้อ 8: งานสรุปที่ค้างของข้อมูลชุดเดิม ต้องพกงวดข้ามการกู้ (สรุปวัน + สรุปเดือน) ──
  await R.t('ข้อ 8 สรุปวัน/เดือนบนชีตไม่ค้างยอดบิลที่ยกเลิก หลังกู้ไฟล์ที่ไม่มีบิลงวดนั้น', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const F = copy(app.buildBackupPayload()); F.createdAt = new Date(Date.now() - 1000).toISOString();   // ก่อนขาย
      const tx = await sale(env); await drain(app);
      const dk = app.getBusinessISODate(tx.date), mk = app.getBusinessMonthKey(tx.date);
      await app.syncDailySummary(dk, null, null, true); await app.syncMonthlySummary(mk, true); await settle(20);
      const row = (type, key) => { const g = gas.sheet('สรุปรายเดือน')._grid; const h = g[0];
        const r = g.find(x => x[0] === type && x[1] === key); return r ? `${r[2]}/${r[h.indexOf('รายได้รวม (฿)')]}` : 'none'; };
      eq([row('รายวัน', dk), row('รายเดือน', mk)], ['1/500', '1/500'], 'control');
      const rf = env.ctx.fetch;
      env.ctx.fetch = async (u, init) => { const b = JSON.parse(init.body); if (/^summary/.test(b.action)) throw new Error('summary down'); return rf(u, init); };
      await voidBill(env, tx); await app.flushCloudOutbox(); await settle(30);
      ok(!onSheet(gas, tx.id) && app.state.cloudOutbox.some(j => j.needSummary), 'control: row deleted, summary pending');
      env.ctx.fetch = rf;
      await app.applyBackupData(copy(F), { acceptUnsynced: true }); await drain(app); await drain(app);
      const day = row('รายวัน', dk), month = row('รายเดือน', mk);
      ok(day === 'none' || /^0\//.test(day), 'daily summary still counts the voided bill: ' + day);
      ok(month === 'none' || /^0\//.test(month), 'monthly summary still counts the voided bill: ' + month);
    } finally { env.dispose(); }
  });

  // ── ข้อ 13: กด "ลบแถวบนชีต" ซ้ำในผลตรวจชุดเดิม ──
  await R.t('ข้อ 13 ลบแถวบนชีตซ้ำ (ปุ่มค้าง/กล่องยืนยันซ้อน) ไม่ลงประวัติยกเลิกซ้ำ', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      gas.post({ action: 'transaction', id: 'TX-1760000000000-ABCDEFGH', date: Date.now() - 3600e3, total: 300, subtotal: 300, discount: 0,
        paymentMethod: 'cash', customerName: 'x', services: ['ตัดผม'], staffNames: ['เอ'], details: [{ name: 'ตัดผม', price: 300, netPrice: 300 }] });
      app._ownerKey = gas.setupOwnerKey();
      await app.runCloudReconcile(); await settle(20);
      eq(app._reconcile.extra.length, 1, 'control');
      const id = app._reconcile.extra[0].id;
      // กล่องยืนยันสองกล่องเปิดซ้อน (ยังไม่ได้ส่งออก — เน็ตหลุด) แล้วกดยืนยันทั้งคู่
      env.ctx.navigator.onLine = false;
      const cbs = []; const sc = app.showConfirm; app.showConfirm = (m, cb) => { cbs.push(cb); };
      app.reconcileDeleteSheetBill(id); app.reconcileDeleteSheetBill(id);
      app.showConfirm = sc;
      for (const cb of cbs) { await cb(); await settle(20); }
      env.ctx.navigator.onLine = true;
      await app.flushCloudOutbox(); await settle(30);
      // ปุ่มเดิมที่ยังค้างบนจอ
      app.reconcileDeleteSheetBill(id); await app._confirmP; await settle(30);
      eq(app.state.voidLog.filter(v => v.billId === id).length, 1, 'void log duplicated');
      eq(shiftVoidLine(app), '1 ใบ ฿300');
      ok(!onSheet(gas, id));
    } finally { env.dispose(); }
  });

  // ── ข้อ 20: อัตราค่าธรรมเนียมบัตรเสียในไฟล์ต้องถูกเตือนก่อนกู้ ──
  await R.t('ข้อ 20 ไฟล์ที่ cardFeeRate เสีย: ตรวจก่อนกู้ไม่ขึ้นว่า "สะอาด" และบอกในข้อความยืนยัน', async () => {
    const { app } = await makeShop();
    await settle();
    const f = copy(app.buildBackupPayload()); f.cardFeeRate = 700;
    const a = app.auditBackupData(f);
    ok(!a.clean && a.badSettings === 1, JSON.stringify({ clean: a.clean, badSettings: a.badSettings }));
    ok(/ค่าตั้งค่าที่ผิดช่วง/.test(app.describeBackupAudit(a)));
  });

  R.done();
})();
