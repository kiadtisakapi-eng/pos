// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 3 (ข้อ 7–9 + 11) — รุ่นของบิลบนชีต · สถานะขัดแย้ง · ทะเบียนยกเลิก/กู้คืน · ตรวจโครงก่อนลบ
//  ทดสอบด้วย app.js จริงบน IndexedDB จริง ต่อกับ google_apps_script.js จริง (tests/gas_env.js)
//  คำขอมาถึงผิดลำดับจำลองด้วย gas.lose(): แอปได้ error ทันที แต่เซิร์ฟเวอร์ได้รับคำขอนั้น "ทีหลัง"
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, createEnv } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv, quiet } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 3: รุ่นบิล · ขัดแย้ง · ทะเบียนยกเลิก (ฐานข้อมูลจริง + Apps Script จริง) ---');
const t = R.t;
// หัวข้อที่ค้าง (เช่นโค้ดรุ่นก่อนแก้ที่รอเนื้อคำตอบตลอดไป) ต้องนับเป็นไม่ผ่านภายในเวลา ไม่ใช่ทำให้ทั้งไฟล์ค้าง
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const d = (s) => new Date(s).getTime();

// แถวของบิลบนชีต (หาจากหัวตาราง ไม่เดาตำแหน่ง)
function sheetRow(gas, monthKey, id) {
  const sh = gas.sheet(monthKey); if (!sh) return null;
  const g = sh._grid, h = g[0];
  const rows = g.slice(1).filter(r => String(r[0]).trim() === id);
  if (rows.length !== 1) return rows.length ? { dup: rows.length } : null;
  const col = (name) => h.findIndex(x => String(x).trim() === name);
  const r = rows[0];
  return { total: r[col('ยอดสุทธิ (฿)')], version: col('รุ่นบิล (ระบบ)') >= 0 ? r[col('รุ่นบิล (ระบบ)')] : '' };
}
const monthOf = (app, tx) => app.getBusinessMonthKey(tx.date);
async function flushSync(app) { await settle(30); await app.syncPendingTransactions(true); await settle(30); }

// แก้บิลผ่านหน้าต่างแก้ไขตัวจริง (ส่วนลดใหม่)
async function editDiscount(env, txId, discount) {
  const app = env.app;
  app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-discount').value = String(discount);
  await app.saveTransactionEdit();
}

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7.1] คำขอเก่า (300) มาถึงหลังคำขอใหม่ (200) → ชีตต้องคงยอดใหม่');
// ═══════════════════════════════════════════════════════════════════════════
await section('[7.1]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const lost = gas.lose(b => b && b.action === 'transaction');   // ส่งครั้งแรกหมดเวลา (แต่ไปถึงทีหลัง)
  readyCheckout(env); await app.processCheckout(); await settle(60);
  const tx = app.state.transactions[0];
  await t('(เงื่อนไข) คำขอบันทึกรุ่นแรกหลุดระหว่างทาง แอปเก็บบิลไว้ส่งใหม่', () => { eq(lost.count >= 1, true); ok(tx.syncStatus !== 'synced'); });
  lost.stop();
  await editDiscount(env, tx.id, 100);                     // รุ่นใหม่ ยอด 200
  await flushSync(app);
  await t('รุ่นใหม่ขึ้นชีตแล้ว (200)', () => eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 200));
  const late = lost.deliver();                             // คำขอรุ่นแรก (300) เพิ่งมาถึง
  await t('คำขอรุ่นเก่าที่มาถึงทีหลังถูกปฏิเสธ (STALE_REVISION)', () => ok(late.length >= 1 && late.every(r => r.code === 'STALE_REVISION'), JSON.stringify(late)));
  await t('ชีตยังเป็นยอดล่าสุด 200 ไม่ถอยกลับเป็น 300', () => eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 200));
  await t('ในเครื่อง: synced · รุ่น 2', async () => { const b = (await env.raw('transactions'))[0]; eq(b.syncStatus, 'synced'); eq(b.rev, 2); });
  env.dispose();
});

console.log('\n[7.2] ส่งรุ่นเดิมซ้ำ (คำตอบหาย) → ชีตรับซ้ำได้ ผลเหมือนเดิม ไม่เกิดแถวซ้ำ');
await section('[7.2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  gas.dropResponses = true;                                 // เซิร์ฟเวอร์ทำแล้ว แต่คำตอบไม่ถึงแอป
  readyCheckout(env); await app.processCheckout(); await settle(60);
  gas.dropResponses = false;
  const tx = app.state.transactions[0];
  await t('(เงื่อนไข) ชีตมีแถวแล้ว แต่แอปยังไม่รู้ (รอส่งใหม่)', () => { ok(sheetRow(gas, monthOf(app, tx), tx.id)); ok(tx.syncStatus !== 'synced'); });
  await flushSync(app);
  await t('ส่งรุ่นเดิมซ้ำ → สำเร็จ และ synced', async () => eq((await env.raw('transactions'))[0].syncStatus, 'synced'));
  await t('ชีตยังมีบิลนี้แถวเดียว', () => { const r = sheetRow(gas, monthOf(app, tx), tx.id); ok(r && !r.dup, JSON.stringify(r)); });
  env.dispose();
});

// รอบตรวจ 5 ข้อ 1 (เจ้าของเลือก 2 ต.ค. 2569): เดิมการกู้ "ชนะเสมอ" แม้บิลถูกแก้บนชีตหลังไฟล์สำรองถูกสร้าง
// (การแก้หลังไฟล์หายเงียบ ๆ) — ตอนนี้ชีตไม่เขียนทับ แต่ส่งบิลเข้า "บิลรอตรวจ" ให้เจ้าของเลือก
// เจ้าของเลือก "ใช้ข้อมูลในเครื่องทับชีต" แล้ว = ข้อมูลที่กู้ชนะ และคำขอเก่าจากก่อนกู้ยังต้องแพ้เหมือนเดิม
console.log('\n[7.3] กู้ไฟล์ที่เก่ากว่าการแก้บนชีต → ไม่ทับเงียบ ๆ ให้เจ้าของเลือก · เลือกใช้ข้อมูลที่กู้แล้ว คำขอเก่าจากก่อนกู้ต้องแพ้');
await section('[7.3]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  readyCheckout(env); await app.processCheckout(); await flushSync(app);
  const tx = app.state.transactions[0];
  const backup = JSON.parse(JSON.stringify(app.buildBackupPayload()));   // สำรองตอนยอด 300 (รุ่น 1) — คัดลอกทันทีเหมือนตอนเขียนไฟล์จริง
  const lost = gas.lose(b => b && b.action === 'transaction');
  await editDiscount(env, tx.id, 100);                      // รุ่น 2 = 200 (คำขอหลุดไป ไปถึงทีหลัง)
  lost.stop();
  await editDiscount(env, tx.id, 50);                       // รุ่น 3 = 250 ขึ้นชีต
  await flushSync(app);
  await t('(เงื่อนไข) ชีตเป็นรุ่น 3 = 250', () => eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 250));
  await app.applyBackupData(JSON.parse(JSON.stringify(backup)));   // กู้กลับไปตอนยอด 300
  await flushSync(app);
  const b1 = app.state.transactions.find(x => x.id === tx.id);
  await t('หลังกู้: ชีตถูกแก้หลังไฟล์สำรอง → ไม่เขียนทับเงียบ ๆ (ชีตยัง 250) และบิลเข้า "บิลรอตรวจ"', () => {
    eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 250);
    eq(b1.syncStatus, 'conflict'); eq(b1.syncIssue.code, 'STALE_REVISION'); eq(b1.syncIssue.fromRestore, true);
  });
  await t('ทางเลือกของเจ้าของ = แก้บิลให้ตรงชีต / ใช้ข้อมูลในเครื่องทับชีต', () => eq(app.conflictActionsFor(b1), ['edit', 'push-local']));
  loginAs(app, 'owner');
  await app.resolveBillConflict(tx.id, 'push-local'); await flushSync(app);
  await t('เจ้าของเลือกใช้ข้อมูลที่กู้ → ชีตเป็นยอดของข้อมูลที่กู้ (300) แม้เลขรุ่นในไฟล์ต่ำกว่า', () => eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 300));
  lost.deliver();                                           // คำขอรุ่น 2 (200) จากก่อนกู้ เพิ่งมาถึง
  await t('คำขอเก่าจากก่อนกู้ไม่ทับข้อมูลที่กู้', () => eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 300));
  await t('บิลในเครื่อง synced และไม่เหลือร่องรอยการเทียบกับไฟล์สำรอง', async () => {
    const r = (await env.raw('transactions')).find(x => x.id === tx.id);
    eq(r.syncStatus, 'synced'); eq(r.restoreBase, undefined);
  });
  env.dispose();
});

console.log('\n[7.3b] กู้ไฟล์เดิม → เจ้าของเลือก "แก้บิล" ให้ตรงกับชีต → ระบบส่งขึ้นเองโดยไม่ถามซ้ำ');
await section('[7.3b]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  readyCheckout(env); await app.processCheckout(); await flushSync(app);
  const tx = app.state.transactions[0];
  const backup = JSON.parse(JSON.stringify(app.buildBackupPayload()));   // ยอด 300
  await editDiscount(env, tx.id, 50); await flushSync(app);              // ชีต 250 (แก้หลังไฟล์)
  await app.applyBackupData(JSON.parse(JSON.stringify(backup)));
  await flushSync(app);
  await t('(เงื่อนไข) บิลรอตรวจ · ชีตยัง 250', () => {
    eq(app.state.transactions.find(x => x.id === tx.id).syncStatus, 'conflict'); eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 250); });
  loginAs(app, 'owner');
  await editDiscount(env, tx.id, 50); await flushSync(app);              // แก้ในเครื่องให้ตรงกับชีต
  const r = (await env.raw('transactions')).find(x => x.id === tx.id);
  await t('แก้ให้ตรงกับชีตแล้ว → ขึ้นชีตได้เอง (synced) ยอด 250', () => { eq(r.syncStatus, 'synced'); eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 250); });
  env.dispose();
});

console.log('\n[7.3c] กู้ไฟล์ที่ "ตรงกับชีตอยู่แล้ว" → ไม่ถามเจ้าของ (กู้ไฟล์เดียวกันซ้ำ / ชีตไม่ได้ถูกแก้หลังไฟล์)');
await section('[7.3c]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  readyCheckout(env); await app.processCheckout(); await flushSync(app);
  const tx = app.state.transactions[0];
  const backup = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  await app.applyBackupData(JSON.parse(JSON.stringify(backup))); await flushSync(app);
  await t('กู้ครั้งแรก: synced ไม่มีบิลรอตรวจ', () => eq(app.state.transactions.find(x => x.id === tx.id).syncStatus, 'synced'));
  await app.applyBackupData(JSON.parse(JSON.stringify(backup))); await flushSync(app);
  await t('กู้ไฟล์เดิมซ้ำ (ชีตถูกเขียนโดยการกู้ครั้งก่อน แต่ค่าเหมือนกัน): synced ไม่ถาม', () => {
    eq(app.state.transactions.find(x => x.id === tx.id).syncStatus, 'synced'); eq(sheetRow(gas, monthOf(app, tx), tx.id).total, 300); });
  env.dispose();
});

console.log('\n[7.4] รุ่นของบิลอยู่รอดข้ามการปิด/เปิดแอป');
await section('[7.4]', async () => {
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas });
  await settle();
  gas.networkDown = true;
  readyCheckout(env); await app.processCheckout(); await settle(40);
  const id = app.state.transactions[0].id;
  await editDiscount(env, id, 100); await settle(40);
  env.dispose();
  gas.networkDown = false;
  const env2 = createEnv({ fetch: gas.fetch, factory: env.factory }); quiet(env2.app);
  await env2.app.init(); await settle(120);
  const b = (await env2.raw('transactions')).find(x => x.id === id);
  await t('เปิดแอปใหม่: บิลยังเป็นรุ่น 2 และส่งขึ้นชีตเป็นรุ่น 2', () => {
    eq(b.rev, 2); eq(b.syncStatus, 'synced'); eq(sheetRow(gas, env2.app.getBusinessMonthKey(b.date), id).version, 'v1:0:2'); });
  env2.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[8.1] ชีตบอกว่าบิลถูกยกเลิกแล้ว (ALREADY_VOIDED) → ไม่นับว่า synced · ไม่ลบในเครื่องเอง · ไม่คืนบนชีตเอง');
// ═══════════════════════════════════════════════════════════════════════════
const BILL = (id, total) => ({ id, date: d('2026-09-10T12:00:00+07:00'), customerName: 'x', services: ['ตัดผม'],
  details: [{ name: 'ตัดผม', price: total, netPrice: total, staffId: 'st-1', staffName: 'เอ', commission: 0, commissionType: 'percent', commissionAmount: 0, category: 'barber', vatable: false }],
  subtotal: total, discount: 0, vatRate: 7, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total,
  cashReceived: total, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'pending' });
await section('[8.1]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-VOIDEDAA';
  gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: d('2026-09-10T12:00:00+07:00'), voidedAt: Date.now() });
  const { env, app } = await makeShop({ gas, rows: { transactions: [BILL(ID, 300)] } });
  let badge = null; app.updateSyncBadgeStatus = (st, n) => { badge = [st, n]; };
  await settle(120);
  let b = (await env.raw('transactions'))[0];
  await t('สถานะในเครื่องเป็น conflict (ไม่ใช่ synced) พร้อมรหัส ALREADY_VOIDED', () => { eq(b.syncStatus, 'conflict'); eq(b.syncIssue.code, 'ALREADY_VOIDED'); });
  await t('บิลยังอยู่ในเครื่อง (ไม่ถูกลบเอง) และชีตยังไม่มีบิลนี้ (ไม่คืนเอง)', () => { ok(b); eq(sheetRow(gas, '09-2026', ID), null); });
  app.checkSyncStatus();
  await t('แถบสถานะขึ้นว่า "บิลรอตรวจ" ไม่ใช่ "ตรงกัน"', () => eq(badge, ['conflict', 1]));
  const n0 = gas.requests.filter(r => r && r.action === 'transaction').length;
  await app.syncPendingTransactions(true); await settle(30);
  await t('ไม่วนส่งซ้ำเอง', () => eq(gas.requests.filter(r => r && r.action === 'transaction').length, n0));
  loginAs(app, 'manager');
  await app.resolveBillConflict(ID, 'restore-cloud'); await settle(30);
  await t('ผู้จัดการเลือกทางแก้ไม่ได้ (ต้องเป็นเจ้าของ) — ข้อมูลไม่เปลี่ยน', async () => eq((await env.raw('transactions'))[0].syncStatus, 'conflict'));
  loginAs(app, 'owner');
  await app.resolveBillConflict(ID, 'restore-cloud'); await flushSync(app);
  b = (await env.raw('transactions'))[0];
  await t('เจ้าของเลือก "คืนบิลนี้ขึ้นชีต" → ชีตมีบิล · synced', () => { eq(b.syncStatus, 'synced'); ok(sheetRow(gas, '09-2026', ID)); });
  env.dispose();
});
await section('[8.1b]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-VOIDEDBB';
  gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: d('2026-09-10T12:00:00+07:00'), voidedAt: Date.now() });
  const { env, app } = await makeShop({ gas, rows: { transactions: [BILL(ID, 300)] } });
  await settle(120);
  loginAs(app, 'owner');
  await app.resolveBillConflict(ID, 'void-local'); await settle(80);
  const raw = await env.rawAll();
  await t('เจ้าของเลือก "ยกเลิกในเครื่องตามชีต" → บิลออกจากยอดในเครื่อง', () => eq(raw.transactions.length, 0));
  await t('มีประวัติการยกเลิกพร้อมเหตุผลและชื่อผู้สั่ง', () => { const v = raw.voidLog[0]; eq(v.billId, ID); ok(/ตามสถานะบนชีต/.test(v.reason)); eq(v.by, 'เจ้าของร้าน'); });
  env.dispose();
});

console.log('\n[8.2] ชีตมีรุ่นใหม่กว่าเครื่อง (STALE_REVISION) → รอตรวจ · เจ้าของสั่งให้เครื่องชนะได้');
await section('[8.2]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-STALEAAA';
  const newer = Object.assign(BILL(ID, 500), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00', rev: 5, revEpoch: 0 });
  delete newer.syncStatus; delete newer.details; delete newer.cashReceived; delete newer.cashChange;
  eq(gas.post(newer).status, 'success');
  const { env, app } = await makeShop({ gas, rows: { transactions: [BILL(ID, 300)] } });   // เครื่องนี้มีรุ่น 1
  await settle(120);
  let b = (await env.raw('transactions'))[0];
  await t('เครื่องที่ข้อมูลเก่ากว่า → conflict STALE_REVISION และไม่ทับชีต', () => { eq(b.syncIssue.code, 'STALE_REVISION'); eq(sheetRow(gas, '09-2026', ID).total, 500); });
  loginAs(app, 'owner');
  await app.resolveBillConflict(ID, 'push-local'); await flushSync(app);
  b = (await env.raw('transactions'))[0];
  await t('เจ้าของสั่ง "ใช้ข้อมูลในเครื่องทับชีต" → ชีตเป็น 300 · synced', () => { eq(b.syncStatus, 'synced'); eq(sheetRow(gas, '09-2026', ID).total, 300); });
  env.dispose();
});

console.log('\n[8.3] แก้บิลที่รอตรวจ → ล้างสถานะขัดแย้งแล้วส่งรุ่นใหม่ให้ชีตตัดสินใหม่');
await section('[8.3]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-STALEBBB';
  const newer = Object.assign(BILL(ID, 500), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00', rev: 1, revEpoch: 0 });
  delete newer.syncStatus; delete newer.details; delete newer.cashReceived; delete newer.cashChange;
  gas.post(newer);
  const { env, app } = await makeShop({ gas, rows: { transactions: [Object.assign(BILL(ID, 300), { rev: 0 })] } });
  await settle(120);
  await t('(เงื่อนไข) รอตรวจเพราะชีตรุ่นใหม่กว่า', async () => eq((await env.raw('transactions'))[0].syncStatus, 'conflict'));
  loginAs(app, 'owner');
  // ต้องเป็นการแก้จริง — ตั้งแต่ข้อ 17 กดบันทึกโดยไม่เปลี่ยนอะไรไม่ถือว่าแก้บิล (ไม่เขียนทับบิล/ไม่ล้างสถานะ)
  await editDiscount(env, ID, 50); await flushSync(app);
  const b = (await env.raw('transactions'))[0];
  await t('หลังแก้บิล: syncIssue ถูกล้าง และส่งรุ่นใหม่ (rev 1 = เท่ากับบนชีต → เขียนทับได้)', () => {
    eq(b.syncIssue, undefined); eq(b.syncStatus, 'synced'); eq(b.total, 250); eq(sheetRow(gas, '09-2026', ID).total, 250); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[9.1] ทะเบียนยกเลิกไม่ถอยหลัง: คำสั่งยกเลิกเก่าที่มาถึงทีหลังไม่ลดเวลายกเลิก');
// ═══════════════════════════════════════════════════════════════════════════
await section('[9.1]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-MONOTONE';
  const vd = (at) => gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: d('2026-09-10T12:00:00+07:00'), voidedAt: at });
  vd(3000); vd(1000);                                       // ยกเลิกล่าสุด 3000 · คำสั่งเก่า 1000 มาถึงทีหลัง
  const tr = Object.assign(BILL(ID, 300), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00', allowVoidedRestore: true, restoredAt: 2000 });
  delete tr.syncStatus;
  const r = gas.post(tr);                                   // กู้คืนที่ 2000 (เก่ากว่ายกเลิกล่าสุด 3000)
  await t('กู้คืนที่เวลาเก่ากว่าการยกเลิกล่าสุดถูกปฏิเสธ (เดิม void เก่าทับเวลา → รับได้ผิด ๆ)', () => eq(r.code, 'ALREADY_VOIDED'));
  await t('ชีตไม่มีบิลนี้', () => eq(sheetRow(gas, '09-2026', ID), null));
});

console.log('\n[9.2] อ่านทะเบียนไม่ได้ชั่วคราว → หยุดทั้งการลบและการบันทึก (ไม่ถือว่า "ไม่มีทะเบียน")');
await section('[9.2]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757500000000-REGFAILX';
  const tr = Object.assign(BILL(ID, 300), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00' });
  delete tr.syncStatus;
  gas.post(tr);
  gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: tr.date, voidedAt: 1000 });
  gas.post(Object.assign({}, tr, { allowVoidedRestore: true, restoredAt: 2000 }));   // กู้คืนแล้ว (บิลอยู่บนชีต)
  await t('(เงื่อนไข) บิลกลับมาอยู่บนชีตหลังกู้คืน', () => ok(sheetRow(gas, '09-2026', ID)));
  gas.faults['getProperty:POSVB_' + ID] = true;              // บริการ Properties อ่านไม่ได้ชั่วคราว
  const v = gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: tr.date, voidedAt: 1000 });
  await t('คำสั่งยกเลิกเก่าตอนอ่านทะเบียนไม่ได้ → REGISTRY_UNAVAILABLE และไม่ลบแถว', () => { eq(v.code, 'REGISTRY_UNAVAILABLE'); ok(sheetRow(gas, '09-2026', ID)); });
  const u = gas.post(Object.assign({}, tr, { rev: 2 }));
  await t('บันทึกบิลตอนอ่านทะเบียนไม่ได้ → REGISTRY_UNAVAILABLE (ลองใหม่ได้)', () => eq(u.code, 'REGISTRY_UNAVAILABLE'));
  delete gas.faults['getProperty:POSVB_' + ID];
  const v2 = gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: tr.date, voidedAt: 1000 });
  await t('อ่านได้แล้ว: คำสั่งยกเลิกเก่ายังแพ้การกู้คืน (ไม่ลบแถว)', () => { eq(v2.code, 'VOID_SUPERSEDED_BY_RESTORE'); ok(sheetRow(gas, '09-2026', ID)); });
});

console.log('\n[9.3] ยกเลิกบิลจำนวนมากในรอบ 90 วัน → ทะเบียนต้องเก็บครบ (ไม่ตัดทิ้งเพื่อบีบขนาด)');
await section('[9.3]', async () => {
  const gas = createGasEnv();
  const base = Date.now() - 10 * 86400e3;
  const ids = [];
  for (let i = 0; i < 600; i++) {
    const id = `TX-${1757000000000 + i}-${String(i).padStart(8, 'A')}`;
    ids.push(id);
    gas.post({ action: 'void_transaction', id, monthKey: '09-2026', date: d('2026-09-10T12:00:00+07:00'), voidedAt: base + i * 1000 });
  }
  const first = Object.assign(BILL(ids[0], 300), { id: ids[0], action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00' });
  delete first.syncStatus;
  const r = gas.post(first);                                // คำขอบันทึกของใบแรกสุดมาถึงทีหลัง
  await t('ใบแรกสุด (ยังไม่หมดอายุ) ยังถูกกัน — ALREADY_VOIDED', () => eq(r.code, 'ALREADY_VOIDED'));
  await t('ทะเบียนครบ 600 ใบ ไม่มีค่าไหนเกิน 9 KB', () => {
    const keys = Object.keys(gas.props).filter(k => k.startsWith('POSVB_'));
    eq(keys.length, 600); ok(keys.every(k => Buffer.byteLength(gas.props[k]) < 9 * 1024)); });
});

console.log('\n[9.4] ลบเฉพาะรายการที่หมดอายุ · ที่เก็บเต็ม = ปฏิเสธ ไม่ใช่ทิ้งหลักฐานเงียบ ๆ');
await section('[9.4]', async () => {
  const gas = createGasEnv();
  const now = Date.now();
  // อายุการเก็บวัดจาก "เวลาที่เซิร์ฟเวอร์เขียน" (w) — รายการที่เพิ่งเขียนเก็บไว้ครบ 90 วันเสมอ
  // (เดิมวัดจากเวลาเครื่องขาย: เครื่องที่นาฬิกาเพี้ยนทำให้ทะเบียนทั้งหมดหายได้ ดู test_batch8_real [G1])
  gas.post({ action: 'void_transaction', id: 'TX-1757000000000-OLDOLDOL', monthKey: '09-2026', date: now, voidedAt: now - 120 * 86400e3 });
  await t('รายการที่เพิ่งเขียน (แม้เวลายกเลิกจากเครื่องขายเก่า 120 วัน) ยังถูกเก็บ', () => ok(gas.props['POSVB_TX-1757000000000-OLDOLDOL']));
  gas.props['POSVB_TX-1757000000000-OLDOLDOL'] = JSON.stringify({ v: now - 120 * 86400e3, r: 0, w: now - 120 * 86400e3 });
  gas.props['POSVB_TX-1757000000000-LEGACYOL'] = JSON.stringify({ v: now - 120 * 86400e3, r: 0 });   // รุ่นเก่าไม่มี w
  gas.post({ action: 'void_transaction', id: 'TX-1757000000000-NEWNEWNE', monthKey: '09-2026', date: now, voidedAt: now });
  await t('รายการที่เซิร์ฟเวอร์เขียนไว้เกิน 90 วัน (และรายการรุ่นเก่าที่เกิน 90 วัน) ถูกลบ · รายการใหม่อยู่ครบ', () => {
    eq(gas.props['POSVB_TX-1757000000000-OLDOLDOL'], undefined);
    eq(gas.props['POSVB_TX-1757000000000-LEGACYOL'], undefined);
    ok(gas.props['POSVB_TX-1757000000000-NEWNEWNE']); });
  gas.faults['setProperty:POSVB_TX-1757000000000-FULLFULL'] = true;   // ที่เก็บเต็ม/เขียนไม่ได้
  const sh = gas.sheet('09-2026');
  const r = gas.post({ action: 'void_transaction', id: 'TX-1757000000000-FULLFULL', monthKey: '09-2026', date: now, voidedAt: now });
  await t('เขียนทะเบียนไม่ได้ → VOID_REGISTRY_FAILED (แอปเก็บงานไว้ลองใหม่) ไม่ตอบว่าสำเร็จ', () => eq(r.code, 'VOID_REGISTRY_FAILED'));
});

console.log('\n[9.5] อัปเกรดจากทะเบียนรุ่นเก่า (POS_VOIDED_BILLS) → ย้ายครบ · ของเดิมยังอยู่ให้ย้อนรุ่นได้');
await section('[9.5]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757000000000-LEGACYVD';
  gas.props.POS_VOIDED_BILLS = JSON.stringify({ [ID]: 5000, 'TX-1757000000000-LEGACYRS': -7000 });
  const tr = Object.assign(BILL(ID, 300), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00' });
  delete tr.syncStatus;
  await t('บิลที่ยกเลิกในทะเบียนรุ่นเก่า ยังถูกกันหลังอัปเกรด', () => eq(gas.post(tr).code, 'ALREADY_VOIDED'));
  await t('ทะเบียนรุ่นเก่ายังอยู่ (ย้อนรุ่นได้) และถูกย้ายเข้ารูปแบบใหม่', () => {
    ok(gas.props.POS_VOIDED_BILLS); eq(JSON.parse(gas.props['POSVB_' + ID]), { v: 5000, r: 0 });
    eq(JSON.parse(gas.props['POSVB_TX-1757000000000-LEGACYRS']), { v: 0, r: 7000 }); });
  const msg = gas.ctx.exportVoidRegistryForRollback();
  await t('ฟังก์ชันเตรียมย้อนรุ่นเขียนทะเบียนกลับเป็นรูปแบบเดิมได้', () => { ok(/2 จาก 2/.test(msg), msg); eq(JSON.parse(gas.props.POS_VOIDED_BILLS)[ID], 5000); });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[11] ลบบิลต้องตรวจโครงแท็บก่อน · เลขที่บิลซ้ำ = หยุด ไม่เดาแถว');
// ═══════════════════════════════════════════════════════════════════════════
await section('[11]', async () => {
  const gas = createGasEnv();
  const ID = 'TX-1757000000000-DUPDUPDU';
  const tr = Object.assign(BILL(ID, 300), { action: 'transaction', monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00' });
  delete tr.syncStatus;
  gas.post(tr);
  const sh = gas.sheet('09-2026');
  sh._grid.push(sh._grid[1].slice());                         // มีคนคัดลอกแถวซ้ำในชีต
  const before = JSON.stringify(sh._grid);
  const v = gas.post({ action: 'void_transaction', id: ID, monthKey: '09-2026', date: tr.date, voidedAt: Date.now() });
  await t('เลขที่บิลซ้ำ 2 แถว → ยกเลิกไม่ลบแถวใด (DUPLICATE_BILL_ID)', () => { eq(v.code, 'DUPLICATE_BILL_ID'); eq(JSON.stringify(sh._grid), before); });
  const u = gas.post(Object.assign({}, tr, { rev: 2, allowVoidedRestore: true, restoredAt: Date.now() + 5 }));
  await t('เลขที่บิลซ้ำ → บันทึกก็ไม่เขียนทับแถวใด (DUPLICATE_BILL_ID)', () => { eq(u.code, 'DUPLICATE_BILL_ID'); });
  // แท็บที่หัวตารางถูกสลับคอลัมน์
  const tab = gas.ss.insertSheet('08-2026');
  tab._grid.push(['วันที่-เวลา', 'เลขที่บิล', 'ลูกค้า'], ['TX-1757000000000-SWAPPEDX', 'TX-1757000000000-SWAPPEDX', 'x']);
  const before2 = JSON.stringify(tab._grid);
  const v2 = gas.post({ action: 'void_transaction', id: 'TX-1757000000000-SWAPPEDX', monthKey: '08-2026', date: d('2026-08-10T12:00:00+07:00'), voidedAt: Date.now() });
  await t('แท็บที่โครงไม่ตรง → ไม่ลบอะไร (SCHEMA_MISMATCH) ไม่เดาคอลัมน์แรก', () => { eq(v2.code, 'SCHEMA_MISMATCH'); eq(JSON.stringify(tab._grid), before2); });
  // ฝั่งแอป: งานลบค้างไว้ลองใหม่ + เตือนเจ้าของ
  const { env, app } = await makeShop({ gas, noInit: true });
  const toasts = [];
  app.showToast = (m) => toasts.push(String(m));
  const okDel = await app.postVoidDelete({ id: ID, date: tr.date, monthKey: '09-2026', voidedAt: Date.now() });
  await t('แอป: งานลบถูกเก็บไว้ลองใหม่ (ไม่ถือว่าลบแล้ว) และเตือนเจ้าของ', () => { eq(okDel, false); ok(toasts.some(m => /ซ้ำ/.test(m)), toasts.join('|')); });
  env.dispose();
});

R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
