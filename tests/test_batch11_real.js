// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 11 (2 ต.ค. 2569) — แก้จากผลตรวจรอบ 5 (รายงาน 30 ก.ย. 2569) ตามที่เจ้าของเลือก
//   [1A] ยกเลิกบิล / แก้บิล / บันทึกเงินส่วนต่าง → สำรองขึ้น Drive ตามหลัง (รวมรอบ 2 นาที · ปิดกะส่งทันที)
//   [1B] กู้ไฟล์สำรอง: บิลที่ถูกยกเลิก/แก้บนชีต "หลังไฟล์นั้น" ไม่ถูกย้อนเงียบ ๆ → เข้า "บิลรอตรวจ" ให้เจ้าของเลือก
//        (กรณีแก้บิลหลังไฟล์ ดูชุด 3 หัวข้อ [7.3] / [7.3b] / [7.3c] ด้วย)
//   [2]  รหัสเชื่อมต่อไม่ตรง: หยุดรอบทันที · เว้นระยะลองใหม่ · บอกสาเหตุ (เดิมยิงซ้ำทุกบิลทุกนาที ไม่บอกอะไร)
//   [3]  งานคลาวด์ที่ส่งไม่ผ่านเก็บ "สาเหตุ" (Telegram / ลบแถว / สรุป / สำรอง) ให้เจ้าของเห็น
//   [4]  แตะบันทึกค่าใช้จ่ายซ้ำ = รายการเดียว · รายการถัดไปที่พิมพ์ระหว่างรอยังบันทึกได้
//   [5]  หลังกู้: ชื่อร้าน/ธีม/โลโก้บนจอเปลี่ยนทันที + บอกบัญชีผู้จัดการที่ต้องตั้ง PIN ใหม่
//   [6]  บิลลงเครื่องแล้วแต่หน้าจอพัง → ไม่ขึ้น "ชำระเงินล้มเหลว" (กันเก็บเงินซ้ำ)
//   [7]  ข้อความตรงสาเหตุ: หน้าตรวจความตรงกัน · ไฟล์สำรองจากแอปรุ่นใหม่กว่า
//   [8]  ตัวกรองพนักงานในรายงานมีคนที่ถูกลบไปแล้ว
//   [9]  deploy.ps1 บวกเลขแคชเฉพาะเมื่อไฟล์ของแอปเปลี่ยน (ตรวจโครงสคริปต์)
//   [T]  ชุดทดสอบต้องไม่ล้มเองตามวันที่ (เจอระหว่างแก้: เทสต์ที่ใช้วันที่ตายตัวเริ่มล้มเมื่อปฏิทินเดินไป → deploy.bat หยุด)
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ใน vm)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> POS_GAS_SRC=<GAS ก่อนแก้> node tests/test_batch11_real.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 11: ผลตรวจรอบ 5 (สำรองหลังเปลี่ยนแปลง · กู้ไฟล์ให้เจ้าของเลือก · หยุดยิงวน · บอกสาเหตุ) ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const HOUR = 3600e3;

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
function sheetRow(gas, monthKey, id) {
  const sh = gas.sheet(monthKey); if (!sh) return null;
  const g = sh._grid, h = g[0];
  const rows = g.slice(1).filter(r => String(r[0]).trim() === id);
  if (rows.length !== 1) return rows.length ? { dup: rows.length } : null;
  const col = (name) => h.findIndex(x => String(x).trim() === name);
  return { total: rows[0][col('ยอดสุทธิ (฿)')] };
}
const monthOf = (app, tx) => app.getBusinessMonthKey(tx.date);
async function flushSync(app) { await settle(30); await app.syncPendingTransactions(true); await settle(30); }
async function sell(env) {
  readyCheckout(env);
  await env.app.processCheckout();
  await settle(50);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}
async function editDiscount(env, txId, discount) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-discount').value = String(discount);
  await env.app.saveTransactionEdit();
  await settle(30);
}
async function voidBill(env, txId, outcome) {
  env.document.getElementById('edit-tx-id').value = txId;
  env.document.getElementById('void-money-outcome').value = outcome || 'refunded';
  await env.app.voidTransaction();
  await env.app._confirmP;
  await settle(60);
}
const backupJobs = (app) => (Array.isArray(app.state.cloudOutbox) ? app.state.cloudOutbox : []).filter(j => j && j.needBackup);
const driveFiles = (gas) => Object.values(gas.DriveApp._folders).flatMap(f => f._files.filter(x => !x._trashed));
const latestDriveBackup = (gas) => { const a = driveFiles(gas); return a.length ? JSON.parse(a[a.length - 1]._content) : null; };
const ownerKeyReady = (app, gas) => { const key = gas.setupOwnerKey(); app.askOwnerKey = async () => key; return key; };
// ตอบแทน Apps Script ด้วยเนื้อ JSON ที่กำหนด (ใช้จำลอง Telegram / Apps Script รุ่นก่อน)
const jsonReply = (body, status) => Promise.resolve({ ok: (status || 200) >= 200 && (status || 200) < 300, status: status || 200,
  headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const manyBills = (n) => {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `TX-${now - i * 1000}-C${String(i).padStart(4, '0')}`, date: now - HOUR - i * 1000, customerName: 'ลูกค้า', services: ['ตัดผม'],
    staffNames: ['เอ'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, syncStatus: 'pending'
  }));
};
const sentBills = (gas) => gas.requests.filter(r => r && (r.action || 'transaction') === 'transaction').length;

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1A] ยกเลิก/แก้บิล/บันทึกเงินส่วนต่าง → สำรองขึ้น Drive ตามหลัง (ทาง ก)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[1A]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const b1 = await sell(env), b2 = await sell(env);
  await sell(env);
  await app._cloudChain; await settle(60);
  const filesBefore = driveFiles(gas).length;
  await t('(เงื่อนไข) ขาย 3 บิล ยังไม่ถึงรอบสำรองระหว่างกะ — ไม่มีงานสำรองค้าง', () => eq(backupJobs(app).length, 0));
  const delays = [];
  const realST = env.ctx.setTimeout;
  env.ctx.setTimeout = (f, ms, ...a) => { delays.push(ms); return realST(f, ms, ...a); };
  await voidBill(env, b1.id, 'refunded'); await app._cloudChain; await settle(60);
  let jobs = backupJobs(app);
  await t('ยกเลิกบิล → มีงานสำรองขึ้น Drive 1 งาน ชนิด "การเปลี่ยนแปลง" (เดิมไม่มีเลย)', () => {
    eq(jobs.length, 1); eq(jobs[0].reason, 'change'); eq(jobs[0].changeKinds, ['void']); });
  await t('…รอรวมรอบราว 2 นาที (ยกเลิก/แก้หลายใบติดกัน = ไฟล์เดียว ไม่เปลือง Drive)', () => {
    const wait = jobs[0].retry.backup.nextAt - Date.now();
    ok(wait > 60e3 && wait <= 120e3, 'nextAt ห่าง ' + wait);
  });
  await t('งานสำรองลงเครื่องพร้อมการยกเลิก (ปิดแอปทันทีก็ไม่หาย)', async () =>
    ok((await env.raw('cloudOutbox')).some(j => j && j.needBackup && j.reason === 'change')));
  await t('ตั้งตัวปลุกไว้ส่งเองเมื่อครบเวลา (ไม่ต้องรอเหตุการณ์อื่น)', () => ok(delays.some(ms => ms > 60e3 && ms <= 120e3), JSON.stringify(delays)));
  await t('ยังไม่ส่งไฟล์ทันที (รอรวมรอบ)', () => eq(driveFiles(gas).length, filesBefore));
  env.ctx.setTimeout = realST;

  await editDiscount(env, b2.id, 50); await app._cloudChain; await settle(40);
  await app.recordBillSettlement(b2.id, 'moved'); await settle(40);
  jobs = backupJobs(app);
  await t('แก้บิล + บันทึกเงินส่วนต่างต่อ → ยังเป็นงานเดียว แต่จำว่ามีการเปลี่ยนเพิ่ม', () => {
    eq(jobs.length, 1); eq(jobs[0].changeKinds, ['void', 'edit', 'settlement']); ok(jobs[0].backupRev >= 2, String(jobs[0].backupRev)); });
  jobs[0].retry.backup.nextAt = Date.now() - 1;   // ครบเวลารวมรอบ
  await app.flushCloudOutbox(); await settle(80);
  const file = latestDriveBackup(gas);
  await t('ครบเวลา → ไฟล์สำรองใหม่ขึ้น Drive 1 ไฟล์', () => eq(driveFiles(gas).length, filesBefore + 1));
  await t('ไฟล์ล่าสุดไม่มีบิลที่ยกเลิก และมีประวัติการยกเลิกบิลนั้น', () => {
    ok(!file.transactions.some(x => x.id === b1.id), 'บิลที่ยกเลิกยังอยู่ในไฟล์');
    ok(file.voidLog.some(v => v && v.billId === b1.id), 'ไม่มีประวัติยกเลิก'); });
  await t('ไฟล์ล่าสุดมีบิลที่แก้แล้ว (ยอด 250) และการบันทึกเงินส่วนต่าง', () => {
    const x = file.transactions.find(y => y.id === b2.id);
    eq(x.total, 250); ok(Array.isArray(x.settlements) && x.settlements.length > 0, 'ไม่มีการบันทึกเงินส่วนต่าง'); });
  await t('งานสำรองหมดจากคิว', () => eq(backupJobs(app).length, 0));
  env.dispose();
});

console.log('\n[1A-2] มีการเปลี่ยนระหว่างไฟล์สำรองกำลังขึ้น → ไฟล์สุดท้ายต้องมีการเปลี่ยนนั้น (ไม่ตกหล่น)');
await section('[1A-2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const b1 = await sell(env), b2 = await sell(env);
  await app._cloudChain; await settle(40);
  await voidBill(env, b1.id); await app._cloudChain; await settle(40);
  backupJobs(app)[0].retry.backup.nextAt = Date.now() - 1;
  const hold = gas.hold(b => b && b.action === 'backup');
  const flushP = app.flushCloudOutbox();
  await settle(60);
  await t('(เงื่อนไข) ไฟล์สำรองกำลังขึ้น (ถูกกักไว้กลางทาง)', () => eq(hold.count, 1));
  await editDiscount(env, b2.id, 50);                       // แก้บิลระหว่างไฟล์กำลังขึ้น
  hold.releaseAll(); await flushP; await settle(80); await app._cloudChain; await settle(80);
  const left = backupJobs(app);
  if (left.length) { left[0].retry && left[0].retry.backup && (left[0].retry.backup.nextAt = Date.now() - 1); await app.flushCloudOutbox(); await settle(80); }
  const file = latestDriveBackup(gas);
  await t('ไฟล์ที่ขึ้นระหว่างแก้ไม่ถูกนับว่า "ล่าสุดแล้ว" → ส่งอีกไฟล์ (รวม 2 ไฟล์)', () => eq(driveFiles(gas).length, 2));
  await t('ไฟล์ล่าสุดมีบิลที่แก้ระหว่างอัปโหลด (ยอด 250) · งานสำรองหมดจากคิว', () => {
    eq(file.transactions.find(x => x.id === b2.id).total, 250); eq(backupJobs(app).length, 0); });
  env.dispose();
});

console.log('\n[1A-3] ปิดกะ → งานสำรองที่รอรวมรอบส่งทันที และไม่มีงานสำรองซ้ำ');
await section('[1A-3]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const b1 = await sell(env); await sell(env);
  await app._cloudChain; await settle(40);
  await voidBill(env, b1.id); await app._cloudChain; await settle(40);
  await t('(เงื่อนไข) งานสำรองของการยกเลิกยังรอรวมรอบ', () => ok(backupJobs(app)[0].retry.backup.nextAt > Date.now() + 60e3));
  const filesBefore = driveFiles(gas).length;
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(150); await app._cloudChain; await settle(80);
  await t('ปิดกะ (ตีสามแล้วปิดแอป) → ไฟล์สำรองขึ้นทันที 1 ไฟล์ ไม่รอ 2 นาที และไม่ซ้ำสองไฟล์', () => eq(driveFiles(gas).length, filesBefore + 1));
  await t('ไฟล์นั้นไม่มีบิลที่ยกเลิก · ไม่มีงานสำรองค้าง', () => {
    ok(!latestDriveBackup(gas).transactions.some(x => x.id === b1.id)); eq(backupJobs(app).length, 0); });
  env.dispose();
});

console.log('\n[1A-4] บันทึกการยกเลิก/แก้/เงินส่วนต่างไม่สำเร็จ → ไม่มีงานสำรองค้าง · ร้านที่ไม่ได้ต่อชีต → ไม่สร้างงาน');
await section('[1A-4]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const b1 = await sell(env); await app._cloudChain; await settle(40);
  let undo = failPutForKeys(['transactions'], 'sync');
  try { await voidBill(env, b1.id); } finally { undo(); }
  await t('(เงื่อนไข) ยกเลิกบิลบันทึกไม่ผ่าน → บิลยังอยู่', () => ok(app.state.transactions.some(x => x.id === b1.id)));
  await t('ยกเลิกไม่สำเร็จ → ไม่มีงานสำรองค้าง (ทั้งในหน่วยความจำและในเครื่อง)', async () => {
    eq(backupJobs(app).length, 0); eq(((await env.raw('cloudOutbox')) || []).filter(j => j && j.needBackup).length, 0); });
  undo = failPutForKeys(['transactions'], 'sync');
  try { await editDiscount(env, b1.id, 50); } finally { undo(); }
  await t('แก้บิลไม่สำเร็จ → ไม่มีงานสำรองค้าง', () => { eq(app.state.transactions.find(x => x.id === b1.id).total, 300); eq(backupJobs(app).length, 0); });
  await editDiscount(env, b1.id, 50); await app._cloudChain; await settle(40);
  app.state.cloudOutbox = app.state.cloudOutbox.filter(j => !j.needBackup);   // เริ่มนับเฉพาะงานของการบันทึกเงินส่วนต่าง
  await app.saveState();
  undo = failPutForKeys(['transactions'], 'sync');
  try { await app.recordBillSettlement(b1.id, 'moved'); } finally { undo(); }
  await t('บันทึกเงินส่วนต่างไม่สำเร็จ → ไม่มีงานสำรองค้าง', () => eq(backupJobs(app).length, 0));
  env.dispose();

  const off = await makeShop({ rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
  await settle();
  const b = await sell(off.env);
  await voidBill(off.env, b.id);
  await t('ร้านที่ยังไม่ได้ต่อ Google Sheets → ยกเลิกบิลไม่สร้างงานสำรอง (ไม่มีปลายทางให้ส่ง)', () => eq(backupJobs(off.app).length, 0));
  off.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1B-1] กู้ไฟล์ที่สร้าง "ก่อน" การยกเลิกบิล → บิลนั้นไม่กลับขึ้นชีตเงียบ ๆ แต่เข้า "บิลรอตรวจ" (ทาง ข)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[1B-1]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const b1 = await sell(env), b2 = await sell(env), b3 = await sell(env);
  await flushSync(app);
  const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));   // ไฟล์สำรองก่อนยกเลิก
  await settle(5);
  await voidBill(env, b1.id, 'refunded'); await app._cloudChain; await settle(40);
  await voidBill(env, b3.id, 'none'); await app._cloudChain; await settle(40);
  const mk = monthOf(app, b1);
  await t('(เงื่อนไข) ยกเลิกแล้ว 2 ใบ: แถวหายจากชีต', () => { eq(sheetRow(gas, mk, b1.id), null); eq(sheetRow(gas, mk, b3.id), null); });
  await app.applyBackupData(JSON.parse(JSON.stringify(file))); await flushSync(app);
  const x1 = app.state.transactions.find(y => y.id === b1.id);
  await t('หลังกู้: บิลที่ยกเลิก/คืนเงินไปแล้ว ไม่กลับขึ้นชีตเอง (เดิมกลับขึ้นเงียบ ๆ)', () => { eq(sheetRow(gas, mk, b1.id), null); eq(sheetRow(gas, mk, b3.id), null); });
  await t('ทะเบียนบนชีตยังเป็น "ยกเลิก" (ไม่ถูกเปลี่ยนเป็นกู้คืนเอง)', () => {
    const reg = JSON.parse(gas.props['POSVB_' + b1.id]);
    ok(reg.v > 0 && !(Number(reg.r) > Number(reg.v)), JSON.stringify(reg)); });
  await t('บิลนั้นอยู่ใน "บิลรอตรวจ" พร้อมเหตุผลตรงเหตุการณ์ (ยกเลิกหลังไฟล์สำรอง)', () => {
    eq(x1.syncStatus, 'conflict'); eq(x1.syncIssue.code, 'ALREADY_VOIDED'); ok(/หลังไฟล์สำรอง/.test(x1.syncIssue.message), x1.syncIssue.message); });
  await t('ทางเลือกของเจ้าของ = คืนบิลขึ้นชีต / ยกเลิกในเครื่องตามชีต', () => eq(app.conflictActionsFor(x1), ['restore-cloud', 'void-local']));
  await t('บิลอื่นในไฟล์ขึ้นชีตตามปกติ (ไม่ต้องถาม)', () => eq(app.state.transactions.find(y => y.id === b2.id).syncStatus, 'synced'));
  loginAs(app, 'owner');
  await app.resolveBillConflict(b1.id, 'void-local'); await settle(80); await app._cloudChain; await settle(40);
  await t('เลือก "ยกเลิกในเครื่องตามชีต" → บิลหายจากเครื่อง · ลงประวัติยกเลิกพร้อมเหตุผล · ชีตยังไม่มีแถว', async () => {
    ok(!(await env.raw('transactions')).some(y => y.id === b1.id), 'บิลยังอยู่ในเครื่อง');
    ok(app.state.voidLog.some(v => v.billId === b1.id && /ตามสถานะบนชีต/.test(v.reason || '')), 'ไม่มีประวัติยกเลิก');
    eq(sheetRow(gas, mk, b1.id), null);
  });
  await app.resolveBillConflict(b3.id, 'restore-cloud'); await flushSync(app);
  await t('เลือก "คืนบิลนี้ขึ้นชีต" (ยกเลิกผิด) → แถวกลับขึ้นชีต · ขึ้นชีตแล้ว', () => {
    ok(sheetRow(gas, mk, b3.id), 'ไม่มีแถว'); eq(app.state.transactions.find(y => y.id === b3.id).syncStatus, 'synced'); });
  env.dispose();
});

console.log('\n[1B-2] กดย้อนกลับไปก่อนกู้ = เอาข้อมูลเดิมทั้งชุด ไม่ถามรายบิล');
await section('[1B-2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  ownerKeyReady(app, gas);
  const b1 = await sell(env); await flushSync(app);
  const up = gas.post({ action: 'backup', backupData: JSON.parse(JSON.stringify(app.buildBackupPayload())) });   // ไฟล์ยอด 300
  await editDiscount(env, b1.id, 50); await flushSync(app);                                                     // ชีต 250 (แก้หลังไฟล์)
  app.restoreFromDriveBackup(up.details.fileId, 'ทดสอบ'); await app._confirmP; await settle(80); await flushSync(app);
  await t('(เงื่อนไข) หลังกู้ บิลนั้นรอเจ้าของเลือก (ชีตถูกแก้หลังไฟล์)', () => eq(app.state.transactions.find(y => y.id === b1.id).syncStatus, 'conflict'));
  await app.resolveBillConflict(b1.id, 'push-local'); await flushSync(app);
  await t('(เงื่อนไข) เจ้าของเลือกใช้ข้อมูลที่กู้ → ชีต 300', () => eq(sheetRow(gas, monthOf(app, b1), b1.id).total, 300));
  await app.undoLastRestore(); await app._confirmP; await settle(80); await flushSync(app);
  const y = app.state.transactions.find(z => z.id === b1.id);
  await t('กดย้อนกลับ → ข้อมูลก่อนกู้ (250) ขึ้นชีตทันที ไม่เข้า "บิลรอตรวจ"', () => {
    eq(y.total, 250); eq(y.syncStatus, 'synced'); eq(sheetRow(gas, monthOf(app, b1), b1.id).total, 250); });
  env.dispose();
});

console.log('\n[1B-3] ไฟล์สำรองรุ่นเก่ามาก (ไม่มีเวลาสร้าง) → ใช้กติกาเดิม: ข้อมูลที่กู้ชนะ ไม่ค้าง');
await section('[1B-3]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const b1 = await sell(env); await flushSync(app);
  const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  delete file.createdAt;
  await editDiscount(env, b1.id, 50); await flushSync(app);
  await app.applyBackupData(file); await flushSync(app);
  await t('ไม่รู้ว่าไฟล์รู้เรื่องถึงเมื่อไร → ไม่ถาม · ชีตเป็นยอดของไฟล์ (300)', () => {
    eq(app.state.transactions.find(y => y.id === b1.id).syncStatus, 'synced'); eq(sheetRow(gas, monthOf(app, b1), b1.id).total, 300); });
  env.dispose();
});

console.log('\n[1B-4] แอปรุ่นใหม่ + Apps Script รุ่นก่อน (ยังไม่ได้วางโค้ดใหม่): ยกเลิกหลังไฟล์ยังกันได้ · ไม่มีอะไรค้าง');
await section('[1B-4]', async () => {
  const gas = createGasEnv();
  const real = gas.fetch;
  // Apps Script รุ่นก่อนไม่รู้จัก restoreBase — จำลองด้วยการตัดช่องนี้ทิ้งก่อนถึงสคริปต์
  gas.fetch = (u, init) => {
    try {
      const b = JSON.parse(init.body);
      if (b && b.restoreBase) { delete b.restoreBase; init = Object.assign({}, init, { body: JSON.stringify(b) }); }
    } catch (e) { /* ไม่ใช่ JSON */ }
    return real(u, init);
  };
  const { env, app } = await makeShop({ gas });
  await settle();
  const b1 = await sell(env), b2 = await sell(env); await flushSync(app);
  const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  await settle(5);
  await editDiscount(env, b2.id, 50); await voidBill(env, b1.id); await app._cloudChain; await flushSync(app);
  await app.applyBackupData(JSON.parse(JSON.stringify(file))); await flushSync(app);
  await t('บิลที่ยกเลิกหลังไฟล์ → ยังเข้า "บิลรอตรวจ" (ใช้เวลาของไฟล์ ซึ่ง Apps Script รุ่นก่อนเข้าใจอยู่แล้ว)', () => {
    const x = app.state.transactions.find(y => y.id === b1.id); eq(x.syncStatus, 'conflict'); eq(x.syncIssue.code, 'ALREADY_VOIDED'); });
  await t('บิลที่แก้หลังไฟล์ → Apps Script รุ่นก่อนตรวจไม่ได้ ใช้กติกาเดิม (ข้อมูลที่กู้ชนะ) แต่ไม่ค้าง/ไม่พัง', () => {
    eq(app.state.transactions.find(y => y.id === b2.id).syncStatus, 'synced'); eq(sheetRow(gas, monthOf(app, b2), b2.id).total, 300); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2-1] รหัสเชื่อมต่อไม่ตรง → หยุดรอบทันที · บอกสาเหตุ · เว้นระยะลองใหม่');
// ═══════════════════════════════════════════════════════════════════════════
await section('[2-1]', async () => {
  const gas = createGasEnv();
  const { env, app, toasts } = await makeShop({ gas, noInit: true, rows: { transactions: manyBills(30), googleSheetsApiToken: 'W'.repeat(40) } });
  await app.syncPendingTransactions(true); await settle(40);
  await t('บิลค้าง 30 ใบ + รหัสไม่ตรง → รอบเดียวยิง 1 คำขอ (เดิมยิงครบ 30 ใบทุกรอบ)', () => eq(sentBills(gas), 1));
  await t('บิลยังค้างรอส่งครบ 30 ใบ (ไม่หาย · ไม่ถูกตัดเป็นบิลรอตรวจ)', () => eq(app.state.transactions.filter(x => x.syncStatus === 'pending').length, 30));
  const warn = () => toasts.filter(x => /ส่งบิลขึ้นชีตไม่ได้/.test(x.m));
  await t('ซิงก์เบื้องหลังก็บอกเจ้าของพร้อมวิธีแก้ (เดิมเงียบ เห็นแค่ "ค้างซิงก์")', () => { eq(warn().length, 1); ok(/รหัสเชื่อมต่อไม่ตรง/.test(warn()[0].m), warn()[0].m); });
  await app.syncPendingTransactions(true); await settle(40);
  await t('รอบเบื้องหลังถัดไป: ยิงอีก 1 คำขอ และไม่เด้งเตือนซ้ำ', () => { eq(sentBills(gas), 2); eq(warn().length, 1); });
  await app.syncPendingTransactions(false); await settle(40);
  await t('กดซิงก์เอง → ข้อความมีสาเหตุ (เดิมบอกแค่ "ล้มเหลว N รายการ")', () =>
    ok(toasts.some(x => /ล้มเหลว/.test(x.m) && /สาเหตุ: รหัสเชื่อมต่อไม่ตรง/.test(x.m)), JSON.stringify(toasts.slice(-2))));
  app.updateSyncBadgeStatus = Object.getPrototypeOf(app).updateSyncBadgeStatus;   // ตัวจริง (เทสต์ทั่วไปปิดไว้)
  app.checkSyncStatus();
  await t('หน้าตั้งค่า "สถานะบิลค้างซิงก์" บอกสาเหตุล่าสุด', () => {
    const s = env.document.getElementById('sync-status-details').innerText; ok(/สาเหตุล่าสุด: รหัสเชื่อมต่อไม่ตรง/.test(s), s); });
  await t('เว้นระยะรอบถัดไป 1 → 2 → 5 → 10 → 30 นาที ตามจำนวนรอบที่ไม่ผ่านเลยติดกัน', () => {
    const keep = app._billRetryStreak;
    const mins = [1, 2, 3, 4, 5, 9].map(n => { app._billRetryStreak = n; return app.billRetryDelayMs() / 60e3; });
    app._billRetryStreak = keep;
    eq(mins, [1, 2, 5, 10, 30, 30]);
  });
  const delays = [];
  const realST = env.ctx.setTimeout;
  env.ctx.setTimeout = (f, ms, ...a) => { delays.push(ms); return realST(f, ms, ...a); };
  await app.syncPendingTransactions(true); await settle(40);   // รอบที่ 4 ที่ไม่ผ่านเลย
  env.ctx.setTimeout = realST;
  await t('หลังไม่ผ่าน 4 รอบติดกัน ตัวปลุกตั้งไว้ 10 นาที (เดิมทุก 1 นาทีตายตัว)', () => ok(delays.includes(600e3), JSON.stringify(delays)));
  app.googleSheetsApiToken = gas.token;                          // เจ้าของแก้รหัสให้ถูก
  await app.syncPendingTransactions(true); await settle(60);
  await t('แก้รหัสถูกแล้ว → ส่งครบ 30 ใบ · ล้างสาเหตุและตัวนับเว้นระยะ', () => {
    eq(app.state.transactions.filter(x => x.syncStatus === 'synced').length, 30); eq(app._billRetryStreak, 0); eq(app._lastSyncError, null); });
  env.dispose();
});

console.log('\n[2-2] Apps Script รุ่นก่อน (ยังไม่ได้วางโค้ดใหม่ — ไม่มีรหัส error) ก็หยุดรอบทันทีเหมือนกัน');
await section('[2-2]', async () => {
  const gas = createGasEnv();
  const real = gas.fetch;
  gas.fetch = async (u, init) => { const r = await real(u, init); const j = await r.json(); delete j.code; return jsonReply(j); };
  const { app } = await makeShop({ gas, noInit: true, rows: { transactions: manyBills(20), googleSheetsApiToken: 'W'.repeat(40) } });
  await app.syncPendingTransactions(true); await settle(40);
  await t('รหัสไม่ตรง (ข้อความแบบเดิม) → 1 คำขอต่อรอบ', () => eq(sentBills(gas), 1));
  delete gas.props.POS_API_TOKEN;
  await app.syncPendingTransactions(true); await settle(40);
  await t('Apps Script ยังไม่ได้ตั้งรหัส → 1 คำขอต่อรอบ และบอกให้รัน setupPosApiToken', () => {
    eq(sentBills(gas), 2); ok(/setupPosApiToken/.test(app._lastSyncError && app._lastSyncError.message), JSON.stringify(app._lastSyncError)); });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] งานคลาวด์ที่ส่งไม่ผ่านเก็บ "สาเหตุ" ไว้ให้เจ้าของเห็น');
// ═══════════════════════════════════════════════════════════════════════════
await section('[3]', async () => {
  const gas = createGasEnv();
  const real = gas.fetch;
  let tg = { ok: false, error_code: 400, description: 'Bad Request: chat not found' }, tgStatus = 400;
  gas.fetch = (u, init) => (/api\.telegram\.org/.test(String(u)) ? jsonReply(tg, tgStatus) : real(u, init));
  const { env, app } = await makeShop({ gas, rows: { telegramToken: '123:abc', telegramChatId: '-100123' } });
  await settle();
  const job = (id) => app.state.cloudOutbox.find(x => x.id === id);
  const due = (id, svc) => { const r = job(id).retry && job(id).retry[svc]; if (r) r.nextAt = 0; };
  app.state.cloudOutbox.push({ id: 'cob-tg', createdAt: Date.now(), dateKeys: [], monthKeys: [], needTelegram: true, telegramMessage: 'ทดสอบ', tries: 0 });
  await app.flushCloudOutbox(); await settle(30);
  await t('Telegram "chat not found" → เก็บสาเหตุพร้อมวิธีแก้ (เดิมว่างเปล่า)', () =>
    ok(/หาแชทไม่เจอ/.test(job('cob-tg').retry.telegram.lastError), job('cob-tg').retry.telegram.lastError));
  tg = { ok: false, error_code: 400, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -1001234567890 } };
  due('cob-tg', 'telegram'); await app.flushCloudOutbox(); await settle(30);
  await t('กลุ่มถูกอัปเกรดเป็น supergroup → บอก Chat ID ใหม่ให้เลย', () => ok(/-1001234567890/.test(job('cob-tg').retry.telegram.lastError), job('cob-tg').retry.telegram.lastError));
  tg = { ok: false, error_code: 401, description: 'Unauthorized' }; tgStatus = 401;
  due('cob-tg', 'telegram'); await app.flushCloudOutbox(); await settle(30);
  await t('Token ผิด/ถูกยกเลิก → บอกให้วาง Token ใหม่', () => ok(/Token ใช้ไม่ได้/.test(job('cob-tg').retry.telegram.lastError), job('cob-tg').retry.telegram.lastError));

  app.googleSheetsApiToken = 'W'.repeat(40);                     // รหัสเชื่อมต่อบน Apps Script ถูกเปลี่ยน
  const now = Date.now();
  app.state.cloudOutbox.push(
    { id: 'cob-vd', createdAt: now, dateKeys: [], monthKeys: [], needVoidDelete: true,
      voidDelete: { id: 'TX-1790000000000-AAAAAAAA', date: now, monthKey: app.getBusinessMonthKey(now), voidedBy: 'x', voidedAt: now }, tries: 0 },
    { id: 'cob-sum', createdAt: now, dateKeys: [app.getBusinessISODate(now)], monthKeys: [], needSummary: true, tries: 0 },
    { id: 'cob-bk', createdAt: now, dateKeys: [], monthKeys: [], needBackup: true, tries: 0 });
  await app.flushCloudOutbox(); await settle(40);
  await t('คำสั่งลบแถวบิลที่ยกเลิก → เก็บสาเหตุ "รหัสเชื่อมต่อไม่ตรง"', () => ok(/รหัสเชื่อมต่อไม่ตรง/.test(job('cob-vd').retry.voidDelete.lastError), job('cob-vd').retry.voidDelete.lastError));
  await t('สรุปวัน → เก็บสาเหตุพร้อมบอกว่าเป็นสรุปของวันไหน', () => ok(/^สรุปวัน \d{4}-\d{2}-\d{2}: .*รหัสเชื่อมต่อไม่ตรง/.test(job('cob-sum').retry.summary.lastError), job('cob-sum').retry.summary.lastError));
  await t('ไฟล์สำรอง → เก็บสาเหตุ', () => ok(/รหัสเชื่อมต่อไม่ตรง/.test(job('cob-bk').retry.backup.lastError), job('cob-bk').retry.backup.lastError));
  const latest = app.latestCloudJobError();
  await t('สาเหตุล่าสุดของงานคลาวด์หาได้ทันที (ไม่ต้องรอครบ 7 วัน)', () => ok(latest && latest.message && latest.label, JSON.stringify(latest)));
  ['cob-vd', 'cob-sum', 'cob-bk', 'cob-tg'].forEach(id => { job(id).tries = 3; });
  app.updateSyncBadgeStatus = Object.getPrototypeOf(app).updateSyncBadgeStatus;
  app.checkSyncStatus();
  await t('หน้าตั้งค่า "งานคลาวด์ค้าง" บอกสาเหตุล่าสุดพร้อมชื่องาน', () => {
    const s = env.document.getElementById('sync-status-details').innerText; ok(/สาเหตุล่าสุด \(.+\): /.test(s), s); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] แตะบันทึกค่าใช้จ่ายซ้ำ = รายการเดียว · รายการถัดไปที่พิมพ์ระหว่างรอยังบันทึกได้');
// ═══════════════════════════════════════════════════════════════════════════
await section('[4]', async () => {
  const { env, app, toasts } = await makeShop();
  await settle();
  const E = (id) => env.document.getElementById(id);
  const fill = (amount, note) => { E('expense-type').value = 'supply'; E('expense-amount').value = String(amount); E('expense-note').value = note; E('expense-source').value = 'drawer'; };
  const amounts = async () => ((await env.raw('shift')).expenses || []).map(e => e.amount).sort((a, b) => a - b);
  const realSave = app.saveStateOrThrow;
  app.saveStateOrThrow = async function (...a) { await settle(150); return realSave.apply(this, a); };   // เครื่องบันทึกช้า (ข้อมูลร้านใหญ่)
  fill(80, 'น้ำแข็ง');
  const p1 = app.addExpense(); await settle(30); const p2 = app.addExpense();   // นิ้วแตะซ้ำห่าง 30 ms
  await Promise.all([p1, p2]); await settle(20);
  await t('แตะบันทึกซ้ำระหว่างกำลังบันทึก → ค่าใช้จ่ายรายการเดียว (เดิมได้ 2 รายการ)', async () => eq(await amounts(), [80]));
  await t('บอกว่ากำลังบันทึกรายการนี้อยู่', () => ok(toasts.some(x => /กำลังบันทึกอยู่/.test(x.m)), JSON.stringify(toasts.slice(-3))));
  fill(50, 'A'); const pA = app.addExpense(); await settle(30);
  fill(70, 'B'); const pB = app.addExpense();                  // พิมพ์รายการถัดไประหว่างรายการแรกยังบันทึกอยู่
  await Promise.all([pA, pB]); await settle(20);
  await t('รายการถัดไป (คนละยอด) ที่กดระหว่างรอ → บันทึกครบทั้งสองรายการ', async () => eq(await amounts(), [50, 70, 80]));
  app.saveStateOrThrow = async function () { throw new Error('จำลองเขียนไม่สำเร็จ'); };
  fill(90, 'C'); await app.addExpense(); await settle(20);
  app.saveStateOrThrow = realSave;
  await app.addExpense(); await settle(20);                    // ช่องกรอกยังเป็นค่าเดิม (ไม่ถูกล้างเมื่อบันทึกไม่ผ่าน)
  await t('บันทึกไม่ผ่านแล้วกดใหม่ด้วยค่าเดิม → บันทึกได้ 1 รายการ (ด่านกันซ้ำไม่ค้าง)', async () => eq(await amounts(), [50, 70, 80, 90]));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] หลังกู้/นำเข้า: หน้าจอส่วนหัวเปลี่ยนทันที + บอกบัญชีที่ต้องตั้ง PIN ใหม่');
// ═══════════════════════════════════════════════════════════════════════════
await section('[5]', async () => {
  const A = await makeShop();
  await settle();
  await sell(A.env);
  const file = JSON.parse(JSON.stringify(A.app.buildBackupPayload()));
  file.shopName = 'ร้านที่กู้มา'; file.theme = 'dark';
  A.env.dispose();
  const B = await makeShop();
  await settle();
  B.app.state.staff = B.app.state.staff.filter(s => s.id !== 'mg-1');   // เครื่องใหม่: ยังไม่มีบัญชีผู้จัดการคนนี้
  const calls = [];
  B.app.applyShopName = () => calls.push('name'); B.app.applyTheme = () => calls.push('theme'); B.app.updateLogoPreview = () => calls.push('logo');
  B.toasts.length = 0;
  await B.app.applyBackupData(JSON.parse(JSON.stringify(file))); await settle(30);
  await t('หลังกู้: วาดชื่อร้าน/ธีม/โลโก้ใหม่ทันที (เดิมค้างค่าเก่าจนปิดเปิดแอป)', () => ok(['name', 'theme', 'logo'].every(k => calls.includes(k)), JSON.stringify(calls)));
  await t('บอกว่าบัญชีผู้จัดการยังไม่มี PIN ในเครื่องนี้ ต้องตั้งใหม่ก่อนเข้าระบบ', () =>
    ok(B.toasts.some(x => /บี \(ผู้จัดการ\)/.test(x.m) && /PIN/.test(x.m)), JSON.stringify(B.toasts.map(x => x.m))));
  B.env.dispose();
  const C = await makeShop();
  await settle();
  C.toasts.length = 0;
  await C.app.applyBackupData(JSON.parse(JSON.stringify(file))); await settle(30);
  await t('กู้บนเครื่องเดิมที่มีบัญชีนั้นพร้อม PIN อยู่แล้ว → ไม่เตือน (ใช้ PIN เดิมได้เลย)', () => ok(!C.toasts.some(x => /ยังไม่มี PIN/.test(x.m)), JSON.stringify(C.toasts.map(x => x.m))));
  C.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] บิลลงเครื่องแล้ว แต่หน้าจอหลังบันทึกพัง → ไม่ขึ้น "ชำระเงินล้มเหลว"');
// ═══════════════════════════════════════════════════════════════════════════
await section('[6]', async () => {
  const { env, app, toasts } = await makeShop();
  await settle();
  app.showThermalReceipt = () => { throw new TypeError('จำลองหน้าจอพัง'); };
  readyCheckout(env);
  const r = await app.processCheckout(); await settle(60);
  const raw = await env.raw('transactions');
  await t('บิลลงเครื่องแล้ว 1 ใบ และการชำระเงินถือว่าสำเร็จ', () => { eq(raw.length, 1); eq(r, true); });
  await t('ไม่ขึ้น "การชำระเงินล้มเหลว" (พนักงานจะเก็บเงินลูกค้าซ้ำ)', () => ok(!toasts.some(x => /ชำระเงินล้มเหลว/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));
  await t('บอกตรง ๆ ว่าบันทึกบิลเลขไหนแล้ว + ห้ามเก็บเงินซ้ำ', () =>
    ok(toasts.some(x => x.ty === 'warning' && x.m.includes(raw[0].id) && /ห้ามเก็บเงินลูกค้าซ้ำ/.test(x.m)), JSON.stringify(toasts.map(x => x.m))));
  await t('ตะกร้าว่าง (กดชำระซ้ำไม่ได้บิลที่สองจากของชุดเดิม)', () => eq(app.state.cart.length, 0));
  await app.processCheckout(); await settle(40);
  await t('กดยืนยันชำระซ้ำหลังจากนั้น → ไม่มีบิลที่สอง', async () => eq((await env.raw('transactions')).length, 1));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7] ข้อความตรงสาเหตุ: หน้าตรวจความตรงกัน · ไฟล์สำรองจากแอปรุ่นใหม่กว่า');
// ═══════════════════════════════════════════════════════════════════════════
await section('[7A]', async () => {
  const { env, app } = await makeShop();
  await settle();
  await sell(env); await flushSync(app);
  // บิลของเดือนก่อน — ให้มีเดือนต้องตรวจ 2 เดือน
  const last = Date.now() - 40 * 24 * HOUR;
  app.state.transactions.push({ id: `TX-${last}-LASTMNTH`, date: last, customerName: 'x', services: ['ตัดผม'], staffNames: ['เอ'],
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, syncStatus: 'synced' });
  const body = () => env.document.getElementById('reconcile-body').innerHTML;
  await app.runCloudReconcile(); await settle(20);
  await t('Apps Script ยังไม่ได้ตั้งรหัสเจ้าของ → ไม่โทษว่า "Apps Script รุ่นเก่า" แต่บอกสาเหตุจริง', () =>
    ok(!/รุ่นเก่า/.test(body()) && /รหัสเจ้าของ/.test(body()), body().replace(/<[^>]+>/g, ' ').slice(0, 400)));
  const realPost = app.cloudPost.bind(app);
  app.cloudPost = (action, ...rest) => (action === 'list_bill_months'
    ? Promise.resolve({ status: 'error', code: 'INVALID_ACTION', message: 'คำสั่งที่ไม่รู้จัก (list_bill_months)' })
    : realPost(action, ...rest));
  await app.runCloudReconcile(); await settle(20);
  await t('ชีตไม่รู้จักคำสั่งจริง (INVALID_ACTION) → จึงบอกว่า Apps Script รุ่นเก่า', () => ok(/Apps Script รุ่นเก่า/.test(body()), body().replace(/<[^>]+>/g, ' ').slice(0, 300)));
  app.cloudPost = realPost;
  env.dispose();
});
await section('[7A-2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  gas.setupOwnerKey();                                        // ตั้งรหัสเจ้าของบน Apps Script แล้ว
  await sell(env); await flushSync(app);
  const last = Date.now() - 40 * 24 * HOUR;
  app.state.transactions.push({ id: `TX-${last}-LASTMNTH`, date: last, customerName: 'x', services: ['ตัดผม'], staffNames: ['เอ'],
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, syncStatus: 'synced' });
  let asked = 0;
  app._ownerKey = null;
  app.askOwnerKey = async () => { asked++; return null; };   // เจ้าของกดยกเลิกช่องรหัส
  await app.runCloudReconcile(); await settle(20);
  const html = env.document.getElementById('reconcile-body').innerHTML;
  await t('กดยกเลิกช่องรหัสเจ้าของ → ถามครั้งเดียว ไม่เด้งถามซ้ำทุกเดือน', () => eq(asked, 1));
  await t('…และบอกว่าเดือนที่ไม่ได้ตรวจ ต้องใส่รหัสเจ้าของก่อน (ไม่ใช่ "รุ่นเก่า")', () =>
    ok(/ต้องใส่รหัสเจ้าของร้าน/.test(html) && !/รุ่นเก่า/.test(html), html.replace(/<[^>]+>/g, ' ').slice(0, 400)));
  env.dispose();
});
await section('[7B]', async () => {
  const { env, app, toasts } = await makeShop();
  await settle();
  await sell(env);
  const n0 = app.state.transactions.length;
  const newer = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  newer.backupSchemaVersion = 99;
  await t('ด่านตรวจไฟล์บอกตรง ๆ ว่าไฟล์มาจากแอปรุ่นใหม่กว่า (เดิมคืน false เฉย ๆ)', () => {
    eq(app.isValidBackupObject(newer), false); ok(/แอปรุ่นใหม่กว่า/.test(app._lastBackupRejectReason || ''), app._lastBackupRejectReason); });
  const realPost = app.cloudPost.bind(app);
  let serve = newer;
  app.cloudPost = (action, ...rest) => (action === 'get_backup'
    ? Promise.resolve({ status: 'success', details: { backupData: serve } }) : realPost(action, ...rest));
  toasts.length = 0;
  app.restoreFromDriveBackup('file-x', 'วันนี้'); await app._confirmP; await settle(30);
  let m = toasts.find(x => /กู้ข้อมูลไม่สำเร็จ/.test(x.m));
  await t('กู้จาก Drive: บอกให้อัปเดตแอปก่อน ไม่ชวนลองไฟล์วันอื่น (ลองกี่ไฟล์ก็ไม่ผ่าน)', () =>
    ok(m && /อัปเดตแอป/.test(m.m) && !/ลองเลือกไฟล์วันอื่น/.test(m.m), m && m.m));
  await t('ข้อมูลเดิมในเครื่องยังอยู่ครบ', () => eq(app.state.transactions.length, n0));
  serve = JSON.parse(JSON.stringify(app.buildBackupPayload())); delete serve.services;
  toasts.length = 0;
  app.restoreFromDriveBackup('file-y', 'วันนี้'); await app._confirmP; await settle(30);
  m = toasts.find(x => /กู้ข้อมูลไม่สำเร็จ/.test(x.m));
  await t('ไฟล์เสียแบบอื่น → บอกว่าขาดอะไร และยังชวนลองไฟล์วันอื่นตามเดิม', () =>
    ok(m && /ไม่พบรายการบริการ/.test(m.m) && /ลองเลือกไฟล์วันอื่น/.test(m.m), m && m.m));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[8] ตัวกรองพนักงานในหน้ารายงานมีคนที่ถูกลบไปแล้ว');
// ═══════════════════════════════════════════════════════════════════════════
await section('[8]', async () => {
  const { env, app } = await makeShop();
  await settle();
  app.state.transactions.push({ id: 'TX-1790000000000-OLDSTAFF', date: Date.now() - HOUR, customerName: 'x', services: ['ตัดผม'],
    details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-old', staffName: 'ช่างเก่า', commission: 10, commissionType: 'percent',
      commissionAmount: 30, category: 'barber', vatable: false }],
    subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', staffNames: ['ช่างเก่า'], rev: 1, syncStatus: 'synced' });
  const renderReports = Object.getPrototypeOf(app).renderReports;
  renderReports.call(app);
  const sel = env.document.getElementById('report-staff-filter');
  await t('ตัวเลือกมีพนักงานที่ถูกลบไปแล้ว พร้อมป้าย "(ลบแล้ว)" (เดิมไม่มี — ดูยอดรายคนของคนที่ลาออกไม่ได้)', () =>
    ok(/value="st-old">ช่างเก่า \(ลบแล้ว\)/.test(sel.innerHTML), sel.innerHTML));
  await t('พนักงานที่ยังอยู่ไม่ถูกติดป้าย "(ลบแล้ว)"', () => ok(!/>เอ \(ลบแล้ว\)/.test(sel.innerHTML), sel.innerHTML));
  sel.value = 'st-old';
  renderReports.call(app);
  await t('เลือกคนที่ลบแล้วไว้ → วาดหน้ารายงานใหม่ยังเลือกคนเดิม', () => eq(sel.value, 'st-old'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[9] deploy.ps1 บวกเลขแคชเฉพาะเมื่อไฟล์ของแอปเปลี่ยน');
// ═══════════════════════════════════════════════════════════════════════════
{
  const ps = fs.readFileSync(path.join(__dirname, '..', 'deploy.ps1'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  await t('รายการไฟล์ของแอป ($appPaths) มีไฟล์ที่แอปโหลดจริง และไม่มีเอกสาร/เทสต์/เครื่องมือ/Apps Script', () => {
    const m = ps.match(/\$appPaths\s*=\s*@\(([\s\S]*?)\)/);
    ok(m, 'ไม่พบ $appPaths');
    const list = (m[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));
    ['index.html', 'app.js', 'style_v2.css', 'sw.js', 'manifest.json', 'promptpay-qr.js', 'dexie.min.js', 'vendor']
      .forEach(f => ok(list.includes(f), 'ขาด ' + f));
    ['README.md', 'SYSTEM_OVERVIEW.md', 'tests', 'tools', 'google_apps_script.js', 'deploy.ps1']
      .forEach(f => ok(!list.includes(f), 'ไม่ควรมี ' + f));
  });
  await t('บวกเลขแคชแทนเฉพาะ "ที่แรก" ในไฟล์ (ไม่แก้คอมเมนต์ประวัติใน sw.js)', () => ok(/\.Replace\(\$content,\s*"jahn-pos-v\$new",\s*1\)/.test(ps)));
  await t('ประทับวันที่เวอร์ชันแอปเฉพาะรอบที่บวกเลขแคช', () => ok(/if \(\$new -and \(Test-Path \$appPath\)\)/.test(ps)));
  await t('sw.js: ชื่อแคชตัวแรกในไฟล์คือ CACHE_NAME (ตัวที่สคริปต์บวกเลข)', () => {
    const first = sw.match(/jahn-pos-v\d+[\w-]*/)[0];
    const cn = sw.match(/const CACHE_NAME = '([^']+)'/)[1];
    eq(first, cn);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[T] ชุดทดสอบต้องไม่ล้มเองตามวันที่ (เจอระหว่างแก้รอบนี้ — deploy.bat หยุดตั้งแต่ 1 ต.ค. 2569)');
// ═══════════════════════════════════════════════════════════════════════════
{
  const dk = (daysAgo) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const SUM = (dateKey) => ({ action: 'summary_day', dateKey, generatedAt: Date.now(),
    totalRevenue: 100, cashRevenue: 100, qrRevenue: 0, creditRevenue: 0, billCount: 1, avgBill: 100,
    totalExpenses: 0, netIncome: 100, cashVariance: 0, shiftCount: 0, shiftCash: [],
    nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
    services: [{ name: 'ตัดผม', count: 1, revenue: 100 }], expenses: [], staffCommissions: [] });
  const gas = createGasEnv({ keepDailyRetention: true });
  const r1 = gas.post(SUM(dk(70))), r2 = gas.post(SUM(dk(10)));
  await t('Apps Script ยังลบแท็บสรุปรายวันที่เก่ากว่า 62 วันตามเดิม (สภาพทดสอบอื่นปิดไว้เพราะใช้วันที่ตายตัว)', () => {
    eq([r1.status, r2.status], ['success', 'success']);
    ok(!gas.sheet('สรุป-' + dk(70)), 'แท็บเก่าไม่ถูกลบ'); ok(gas.sheet('สรุป-' + dk(10)), 'แท็บใหม่หาย'); });
  const plain = createGasEnv();
  plain.post(SUM('2026-08-05'));
  await t('สภาพทดสอบปกติไม่ลบแท็บของวันที่ตายตัว → เทสต์ไม่ล้มเองเมื่อเวลาผ่านไป', () => ok(plain.sheet('สรุป-2026-08-05')));
}

R.done();
})().catch(e => { console.error(e); process.exit(1); });
