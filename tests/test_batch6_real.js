// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 6 (23 ก.ย. 2569) — ปิด 2 รูที่เหลือหลังรอบ 1.7.0
//   [P] เครื่องที่ไม่ใช่เครื่องหลัก: งานสรุป/สำรองถูกพัก "โดยตั้งใจ" แต่เดิมไม่มีอะไรฟ้องบนหน้าหลัก
//       (ป้ายขึ้น "ตรงกัน ✓") และรู้ตัวก็ต่อเมื่อปิดกะแล้วส่งไฟล์สำรองไม่ผ่าน
//   [S] Google Sheets แปลงข้อความเป็นตัวเลข/วันที่ตอนเขียน — หน้าตรวจความตรงกันฟ้อง "วันเวลาไม่ตรง" ทุกบิล
//       และชื่อลูกค้าที่เป็นเบอร์โทร / บันทึกค่าใช้จ่าย "12/9" ถูกเปลี่ยนค่า
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ใน vm บนชีตจำลองที่แปลงชนิดเหมือนของจริง)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js เก่า> / POS_GAS_SRC=<GAS เก่า> แล้วรันไฟล์นี้ → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, createEnv } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv, quiet } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 6: เครื่องหลักถูกพักต้องฟ้อง · ข้อความบนชีตต้องไม่ถูก Sheets แปลงค่า ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const DAY = 86400e3;

// ป้ายสถานะคลาวด์ของจริง (quiet() ปิดไว้) — คืนข้อความบนป้ายหน้าหลัก + กล่องรายละเอียดหน้าตั้งค่า
function badge(env) {
  const app = env.app;
  const saved = app.updateSyncBadgeStatus;
  delete app.updateSyncBadgeStatus;          // ใช้ตัวจริงจาก prototype
  try { app.checkSyncStatus(); }
  finally { app.updateSyncBadgeStatus = saved; }
  return { text: env.document.getElementById('mobile-sync-text').innerText,
    side: env.document.getElementById('sidebar-sync-text').innerText,
    detail: env.document.getElementById('sync-status-details').innerText,
    warn: env.document.getElementById('mobile-sync-status').classList.contains('sync-warning') };
}
const backupLabel = (env) => { env.app.renderBackupStatus(); return env.document.getElementById('backup-status-label').innerText; };
const telegramOf = async (env) => ((await env.raw('cloudOutbox')) || []).filter(it => it.telegramMessage).map(it => it.telegramMessage).slice(-1)[0] || '';
const TG = { telegramToken: '123456:TESTTOKEN', telegramChatId: '1' };

// ออกบิลผ่านหน้าชำระเงินจริง
async function checkout(env, items, pay, received) {
  readyCheckout(env, items, pay, received);
  await env.app.processCheckout();
  await settle(30);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}
async function editCustomer(env, txId, name) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-customer').value = name;
  await env.app.saveTransactionEdit();
  await settle(30);
}
// เครื่องหลัก: ส่งสรุปครั้งแรก → ได้สิทธิ์เครื่องหลักอัตโนมัติ
async function becomePrimary(shop) {
  shop.app.enqueueSummaryRefresh(Date.now()); await shop.app.flushCloudOutbox(); await settle(60);
}

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P1] เครื่องที่ไม่ใช่เครื่องหลัก: ป้ายหน้าหลักต้องฟ้อง ไม่ใช่ "ตรงกัน ✓"');
// ═══════════════════════════════════════════════════════════════════════════
await section('[P1]', async () => {
  const gas = createGasEnv();
  const A = await makeShop({ gas });
  await settle();
  await becomePrimary(A);
  await t('(เงื่อนไข) A เป็นเครื่องหลัก', () => eq(JSON.parse(gas.props.POS_PRIMARY_DEVICE).id, A.app.deviceId));
  const bA = badge(A.env);
  await t('(ตัวควบคุม) เครื่องหลัก ไม่มีงานค้าง → ป้ายขึ้น "ตรงกัน" ไม่ใช่คำเตือน', () => { ok(/ตรงกัน/.test(bA.text), bA.text); eq(bA.warn, false); });

  const B = await makeShop({ gas, rows: TG });
  await settle(120);
  await t('เครื่องใหม่ที่ยังไม่รู้สถานะ ถามเครื่องหลักตอนเปิดแอปเอง — รู้ตัวทันทีโดยไม่ต้องรอปิดกะ', () => {
    ok(gas.requests.some(r => r && r.action === 'primary_status' && r.deviceId === B.app.deviceId), 'ไม่ได้ถาม primary_status');
    ok(B.app.primaryStatus && B.app.primaryStatus.isPrimary === false, JSON.stringify(B.app.primaryStatus)); });
  await t('ไม่มีการส่งสรุป/ไฟล์สำรองเกิดขึ้นเลยระหว่างนั้น (รู้จากการถามอย่างเดียว)', () =>
    ok(!gas.requests.some(r => r && /^(summary_day|summary_month|backup)$/.test(r.action) && r.deviceId === B.app.deviceId)));
  const bB = badge(B.env);
  await t('ป้ายหน้าหลัก + แถบข้าง = "ไม่ได้สำรอง: ไม่ใช่เครื่องหลัก" สีเตือน', () => {
    ok(/ไม่ใช่เครื่องหลัก/.test(bB.text), bB.text); eq(bB.side, bB.text); eq(bB.warn, true); });
  await t('กล่องรายละเอียดหน้าตั้งค่าบอกทั้งเหตุและวิธีแก้ (ปุ่ม "ตั้งเครื่องนี้เป็นเครื่องหลัก")', () => {
    ok(/ไม่ใช่เครื่องหลัก/.test(bB.detail) && /ตั้งเครื่องนี้เป็นเครื่องหลัก/.test(bB.detail), bB.detail); });
  await t('สถานะสำรองในหน้าตั้งค่าบอกว่า "พักการสำรอง" ไม่ใช่โชว์ความสำเร็จครั้งเก่าเฉย ๆ', () => ok(/พักการสำรอง/.test(backupLabel(B.env)), backupLabel(B.env)));

  console.log('\n[P2] กดป้ายสถานะเอง: ห้ามตอบว่า "ตรงกันแล้ว"');
  B.toasts.length = 0;
  await B.app.syncPendingTransactions(false); await settle(20);
  await t('ข้อความบอกว่าบิลขึ้นครบ แต่ไฟล์สำรอง/สรุปถูกพัก (สีเตือน)', () => {
    const m = B.toasts.find(x => /ไม่ใช่เครื่องหลัก/.test(x.m));
    ok(m, JSON.stringify(B.toasts)); eq(m.ty, 'warning');
    ok(!B.toasts.some(x => /ตรงกันกับ Google Sheets แล้ว/.test(x.m)), 'ยังขึ้นว่าตรงกัน'); });

  console.log('\n[P3] ปิดกะบนเครื่องที่ถูกพัก: บอกบนจอทันที + ข้อความ Telegram ถึงเจ้าของ');
  B.toasts.length = 0;
  B.app.cashCounterMode = 'close'; await B.app.confirmCashCount(); await settle(120);
  await t('(เงื่อนไข) ปิดกะสำเร็จ', async () => ok(!(await B.env.raw('shift')).active));
  await t('จอขึ้นคำเตือนว่าไฟล์สำรองของกะนี้จะไม่ถูกส่ง', () => ok(B.toasts.some(x => x.ty === 'warning' && /ปิดกะแล้ว แต่/.test(x.m) && /ไม่ใช่เครื่องหลัก/.test(x.m)), JSON.stringify(B.toasts)));
  const msgB = await telegramOf(B.env);
  await t('ข้อความปิดกะ Telegram มีบรรทัด "ไฟล์สำรอง" บอกว่าเครื่องนี้ถูกพัก + วิธีแก้', () => {
    ok(/ไฟล์สำรอง:/.test(msgB) && /ไม่ใช่เครื่องหลัก/.test(msgB) && /ตั้งเครื่องนี้เป็นเครื่องหลัก/.test(msgB), msgB); });
  await t('ข้อความ Telegram ไม่มีเอนทิตีที่ Telegram ปฏิเสธ (&#39; / &quot;)', () => ok(!/&#39;|&quot;/.test(msgB), msgB));
  await t('งานสรุป/สำรองของกะนี้ยังอยู่ในคิว (พักไว้ ไม่ทิ้ง)', async () => ok((await B.env.raw('cloudOutbox')).some(it => it.needBackup || it.needSummary)));
  const bB2 = badge(B.env);
  await t('ป้ายนับงานที่พักไว้ในรายละเอียด', () => ok(/งานที่พักไว้ \d+ รายการ/.test(bB2.detail), bB2.detail));

  console.log('\n[P4] เจ้าของตั้งเครื่องหลัก → คำเตือนหายเอง งานที่พักถูกส่ง');
  const key = gas.setupOwnerKey();
  B.app.askOwnerKey = async () => key;
  loginAs(B.app, 'owner');
  eq(await B.app.claimPrimaryDevice(), true);
  await settle(200);
  const bB3 = badge(B.env);
  await t('ป้ายกลับมาไม่เตือนเรื่องเครื่องหลัก', () => ok(!/ไม่ใช่เครื่องหลัก/.test(bB3.text), bB3.text));
  await t('ไฟล์สำรองของกะที่พักไว้ขึ้น Drive แล้ว · สถานะสำรองไม่ขึ้น "พัก"', async () => {
    ok(!(await B.env.raw('cloudOutbox')).some(it => it.needBackup), 'งานสำรองยังค้าง'); ok(!/พักการสำรอง/.test(backupLabel(B.env))); });

  console.log('\n[P5] เครื่องหลักตัวจริง (ตัวควบคุม): ปิดกะแล้วไม่มีคำเตือนเกิน');
  const C = await makeShop({ gas: createGasEnv(), rows: TG });
  await settle(60);
  await becomePrimary(C);
  C.toasts.length = 0;
  C.app.cashCounterMode = 'close'; await C.app.confirmCashCount(); await settle(150);
  await t('ไม่มีคำเตือนเรื่องเครื่องหลักบนจอ', () => ok(!C.toasts.some(x => /ไม่ใช่เครื่องหลัก/.test(x.m)), JSON.stringify(C.toasts)));
  await t('ข้อความ Telegram ไม่มีบรรทัดเตือนไฟล์สำรอง (สำรองสำเร็จตามปกติ)', async () => {
    const m = await telegramOf(C.env);
    ok(m === '' || !/ไฟล์สำรอง:/.test(m), m); });
  A.env.dispose(); B.env.dispose(); C.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P6] กู้ข้อมูลลงเครื่องใหม่ (รหัสเครื่องใหม่) → เปิดแอปครั้งถัดไปรู้ตัวทันที');
// ═══════════════════════════════════════════════════════════════════════════
await section('[P6]', async () => {
  const gas = createGasEnv();
  const A = await makeShop({ gas });
  await settle();
  await becomePrimary(A);
  const payload = JSON.parse(JSON.stringify(A.app.buildBackupPayload()));
  A.env.dispose();                                    // เครื่องหลักพัง/หาย
  // เครื่องใหม่: ยังไม่ตั้ง Google Sheets ตอนเปิดครั้งแรก (เหมือนเพิ่งติดตั้ง) แล้วค่อยใส่ URL/รหัส + กู้ไฟล์
  const N = await makeShop({ gas, rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
  await settle();
  await N.app.applyBackupData(payload); await settle(60);
  N.app.googleSheetsUrl = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
  N.app.googleSheetsApiToken = gas.token;
  await N.app.saveKeys([{ key: 'googleSheetsUrl', value: N.app.googleSheetsUrl }, { key: 'googleSheetsApiToken', value: gas.token }]);
  // เปิดแอปครั้งถัดไป
  N.env.dispose();
  const env = createEnv({ fetch: gas.fetch, factory: N.env.factory });
  quiet(env.app);
  await env.app.init(); loginAs(env.app, 'owner');
  await settle(150);
  await t('เปิดแอปแล้วรู้ทันทีว่าไม่ใช่เครื่องหลัก (ก่อนปิดกะใด ๆ)', () => ok(env.app.primaryStatus && env.app.primaryStatus.isPrimary === false, JSON.stringify(env.app.primaryStatus)));
  const b = badge(env);
  await t('ป้ายหน้าหลักฟ้อง "ไม่ใช่เครื่องหลัก"', () => ok(/ไม่ใช่เครื่องหลัก/.test(b.text), b.text));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P7] ไฟล์สำรองล้มเหลว/ขาดช่วง (ทุกสาเหตุ) → ข้อความปิดกะเตือน');
// ═══════════════════════════════════════════════════════════════════════════
await section('[P7]', async () => {
  const { env, app } = await makeShop({ rows: TG });
  await settle();
  const now = Date.now();
  app.primaryStatus = { isPrimary: true };
  app.backupStatus = null;
  await t('(ตัวควบคุม) ยังไม่เคยสำรองจากเครื่องนี้ → ไม่เตือน (กันเสียงดังตอนเพิ่งอัปเดต)', () => eq(app.backupHealthWarning(now), ''));
  app.backupStatus = { lastAttemptAt: now - DAY, lastOk: true, lastSuccessAt: now - DAY };
  await t('(ตัวควบคุม) สำรองสำเร็จเมื่อวาน → ไม่เตือน', () => eq(app.backupHealthWarning(now), ''));
  app.backupStatus = { lastAttemptAt: now - 3600e3, lastOk: false, lastMessage: 'Drive ล่ม', lastSuccessAt: now - 2 * DAY };
  await t('ครั้งล่าสุดล้มเหลว → เตือนพร้อมเวลาที่สำเร็จครั้งล่าสุด', () => ok(/ล้มเหลว/.test(app.backupHealthWarning(now)) && /สำเร็จครั้งล่าสุด/.test(app.backupHealthWarning(now))));
  app.backupStatus = { lastAttemptAt: now - 8 * DAY, lastOk: true, lastSuccessAt: now - 8 * DAY };
  await t('สำเร็จครั้งล่าสุดเกิน 7 วัน → เตือนว่าขาดช่วงกี่วัน', () => ok(/มา 8 วัน/.test(app.backupHealthWarning(now)), app.backupHealthWarning(now)));
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(60);
  const msg = await telegramOf(env);
  await t('ปิดกะจริง → คำเตือนติดไปกับข้อความ Telegram', () => ok(/ไฟล์สำรอง:/.test(msg) && /มา \d+ วัน|ล้มเหลว/.test(msg), msg));
  app.googleSheetsUrl = '';
  await t('ร้านที่ไม่ได้ตั้ง Google Sheets (Telegram อย่างเดียว) → ไม่เตือนเรื่องไฟล์สำรอง', () => eq(app.backupHealthWarning(now), ''));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P8] คำตอบ "ไม่ใช่เครื่องหลัก" จากชีต → ป้ายหน้าหลักเปลี่ยนทันที (ไม่ต้องรอรอบวาดหน้าจอถัดไป)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[P8]', async () => {
  const { env, app } = await makeShop();
  await settle(60);
  delete app.updateSyncBadgeStatus;                         // ใช้ป้ายของจริง
  app.checkSyncStatus();
  const before = env.document.getElementById('mobile-sync-text').innerText;
  await t('(ตัวควบคุม) ก่อนรู้ว่าถูกพัก ป้ายไม่ได้เตือนเรื่องเครื่องหลัก', () => ok(!/ไม่ใช่เครื่องหลัก/.test(before), before));
  await app.notePrimaryStatus(false, { label: 'POS-ABCD', claimedAt: Date.now() });
  const after = env.document.getElementById('mobile-sync-text').innerText;
  await t('ป้ายเปลี่ยนเป็นคำเตือนทันทีที่รู้', () => ok(/ไม่ใช่เครื่องหลัก/.test(after), after));
  await t('ข้อความบอกชื่อเครื่องหลักตัวจริง (POS-ABCD) ให้เจ้าของรู้ว่าเครื่องไหน', () =>
    ok(/POS-ABCD/.test(env.document.getElementById('sync-status-details').innerText)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[S1] ชีตจำลองต้องแปลงชนิดเหมือน Google Sheets จริง (กันชีตจำลองถูกแก้จนกลับไปหลอกตา)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[S1]', async () => {
  const gas = createGasEnv();
  const sh = gas.ss.insertSheet('ทดสอบ');
  sh.getRange(1, 1, 1, 6).setValues([['2026-09-10 21:30:00', '0812345678', "'0812345678", '= กำไรสุทธิ', 'TRUE', 'สมชาย']]);
  const v = sh.getRange(1, 1, 1, 6).getValues()[0], dv = sh.getRange(1, 1, 1, 6).getDisplayValues()[0];
  await t('ข้อความวันเวลา → Date (โชว์ตามที่พิมพ์)', () => { ok(v[0] instanceof Date); eq(dv[0], '2026-09-10 21:30:00'); eq(v[0].toISOString(), '2026-09-10T14:30:00.000Z'); });
  await t('ตัวเลขล้วน → number (เลข 0 นำหน้าหาย) · มี \' นำหน้า → ข้อความเดิม', () => { eq(v[1], 812345678); eq(v[2], '0812345678'); });
  await t('ขึ้นต้นด้วย = → #ERROR! · TRUE → boolean · ข้อความธรรมดาไม่แตะ', () => { eq(v[3], '#ERROR!'); eq(v[4], true); eq(v[5], 'สมชาย'); });
  sh.getRange(2, 1).setNumberFormat('@').setValue('06-2026');
  sh.getRange(2, 2).setNumberFormat('@').setValue('2026-09-10');
  await t('ช่องรูปแบบ "@" เก็บตามที่เขียน', () => eq(sh.getRange(2, 1, 1, 2).getValues()[0], ['06-2026', '2026-09-10']));
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[S2] หน้าตรวจความตรงกัน: บิลที่ไม่มีใครแตะ ต้อง "ตรงกัน" บนชีตที่แปลงวันเวลาเป็นวันที่');
// ═══════════════════════════════════════════════════════════════════════════
await section('[S2-S3]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;
  const tx = await checkout(env, null, 'cash', 300);
  await app.syncPendingTransactions(true); await settle(60);
  const mk = app.getBusinessMonthKey(tx.date);
  const sh = gas.sheet(mk);
  const ri = sh._grid.findIndex(r => r[0] === tx.id);
  await t('(เงื่อนไข) บิลขึ้นชีตแล้ว', () => ok(ri > 0));
  await t('ช่องวันที่-เวลาบนชีตยังเป็น "ค่าวันที่" (เรียง/กรองในชีตได้) — ไม่ได้เปลี่ยนเป็นข้อความ', () => ok(sh._grid[ri][1] instanceof Date, typeof sh._grid[ri][1]));
  const list = gas.post({ action: 'list_bills', monthKey: mk, ownerKey: key });
  const row = (list.details && list.details.bills || []).find(b => b.id === tx.id);
  const d = new Date(tx.date), p2 = (n) => String(n).padStart(2, '0');
  const want = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  await t('list_bills คืนวันเวลาในรูปแบบเดิม "ปปปป-ดด-วว ชช:นน:วว" ไม่ใช่ข้อความ Date ของ JavaScript', () => { ok(row); eq(row.when, want); });
  await app.runCloudReconcile();
  await t('ตรวจความตรงกัน: บิลที่ไม่มีใครแตะ → ไม่พบความต่าง (เดิมฟ้อง "วันเวลาไม่ตรง" ทุกบิล)', () => {
    eq(app._reconcile.mismatch.map(m => m.fields.map(f => f.field).join('+')), []); eq(app._reconcile.extra.length, 0); });

  console.log('\n[S3] ข้อความของผู้ใช้ที่หน้าตาเหมือนตัวเลข/วันที่ ต้องขึ้นชีตเป็นข้อความเดิม');
  await editCustomer(env, tx.id, '0812345678');
  await app.syncPendingTransactions(true); await settle(60);
  await t('ชื่อลูกค้าที่เป็นเบอร์โทร → บนชีตเป็นข้อความ "0812345678" (เดิมกลายเป็นตัวเลข 812345678)', () => eq(sh._grid[ri][2], '0812345678'));
  await app.runCloudReconcile();
  await t('ตรวจความตรงกันหลังแก้ชื่อลูกค้า → ยังตรงกัน', () => eq(app._reconcile.mismatch.map(m => m.fields.map(f => f.field).join('+')), []));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[S4] บันทึกค่าใช้จ่าย "12/9" ในแท็บสรุป ต้องเป็นข้อความเดิม ไม่ใช่วันที่');
// ═══════════════════════════════════════════════════════════════════════════
await section('[S4]', async () => {
  const { env, app, gas } = await makeShop({ role: 'manager' });
  await settle();
  env.document.getElementById('expense-type').value = 'other';
  env.document.getElementById('expense-amount').value = '120';
  env.document.getElementById('expense-note').value = '12/9';
  await app.addExpense(null); await settle(30);
  await t('(เงื่อนไข) ค่าใช้จ่ายถูกบันทึก', () => ok(app.state.shift.expenses.some(e => e.note === '12/9'), JSON.stringify(app.state.shift.expenses)));
  app.enqueueSummaryRefresh(Date.now()); await app.flushCloudOutbox(); await settle(80);
  const tab = gas.sheet('สรุป-' + app.getBusinessISODate(Date.now()));
  await t('(เงื่อนไข) แท็บสรุปรายวันถูกเขียน', () => ok(tab, gas.sheetNames().join(',')));
  const cells = [].concat(...tab._grid);
  await t('บนแท็บสรุปมีข้อความ "12/9" ตรงตัว และไม่มีช่องไหนกลายเป็นวันที่', () => {
    ok(cells.includes('12/9'), 'ไม่พบข้อความ 12/9');
    ok(!cells.some(v => v instanceof Date), 'มีช่องที่กลายเป็นวันที่'); });
  await t('ไม่มีช่องไหนบนแท็บสรุปขึ้น #ERROR!', () => ok(!cells.includes('#ERROR!')));
  env.dispose();
});

R.done();
})();
