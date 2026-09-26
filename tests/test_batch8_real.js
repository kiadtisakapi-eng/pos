// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 8 (25 ก.ย. 2569) — แก้จากผลตรวจรอบ 2 (ส่วนที่รอบแรกยังไม่ได้อ่าน)
//   [M] เปิดแอปครั้งแรกแบบอ่านอย่างเดียวแล้วรับสิทธิ์ทีหลัง → ครั้งถัดไปข้อมูลร้านต้องไม่ถูกล้าง
//   [Q] QR พร้อมเพย์ต้องถอดรหัสได้ด้วยเครื่องอ่านมาตรฐาน (jsQR)
//   [I] เจ้าของทิ้งเครื่องไว้ตอนกู้ข้อมูลค้างที่หน้าต่างถาม → ต้องถูกออกจากระบบตามเวลา
//   [U] ย้อนกลับการกู้ข้อมูล → คืนค่าพร้อมเพย์/แชท Telegram ที่เดิมว่างให้ว่างด้วย
//   [B] ไฟล์สำรองค่าผิดรูป: VAT นอกช่วง · กะเปิดไม่มีเวลาเริ่ม · log ข้างในเสีย (ห้ามแจ้ง "ไม่สำเร็จ" หลังบันทึกแล้ว)
//   [T] กู้ข้อมูลแล้วแชท Telegram ของเครื่องต้องไม่ถูกแทน
//   [W] หน้าต่างรอง: ออกจากระบบไม่ลบ session ของหน้าต่างหลัก · รับสิทธิ์แล้วส่งงานคลาวด์ที่ค้างต่อ
//   [G] Apps Script: ทะเบียนบิลยกเลิกไม่พังเพราะนาฬิกาเครื่องขาย · รหัสเจ้าของหน่วงเวลาแทนล็อกยาว
//       · กู้งานสลับแท็บก่อนตรวจรุ่น · คืนแถว master ไม่ลงผิดช่อง · ไฟล์สำรองในถังขยะไม่โผล่
//   [C] หมวดที่มีบิลใช้ลบไม่ได้ · กราฟรายงานตรงกับตัวเลขสรุป · ใบเสร็จบิลเก่าเกลี่ยราคาถูก
//       · ตะกร้าที่ผูกพนักงานที่ถูกลบเลือกคนใหม่ได้ · เลขพร้อมเพย์ 13 หลักตรวจหลักสุดท้าย
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> POS_GAS_SRC=<GAS ก่อนแก้> แล้วรันไฟล์นี้ → ต้องตก
//  (ส่วน [Q] ใช้ไฟล์ promptpay-qr.js ตาม POS_QR_SRC ถ้าตั้งไว้)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv, fidb, makeRunner, eq, ok } = require('./harness_db.js');
const { seed, quiet, makeShop, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const jsQR = require('./vendor/jsqr.js');
const R = makeRunner('--- ชุด 8: ย้ายข้อมูล · QR · กู้/ย้อนข้อมูล · หน้าต่างรอง · Apps Script · รายงาน/ตะกร้า ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const DAY = 86400e3;
const withFileReader = (env) => { env.ctx.FileReader = class { readAsText(f) { setTimeout(() => this.onload({ target: { result: f.text } }), 0); } }; };
const importFile = async (env, obj) => {
  env.app.importData({ target: { files: [{ text: JSON.stringify(obj) }], value: 'x' } });
  await settle(30); await env.app._confirmP; await settle(80);
};

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[M] เครื่องใหม่: เปิดครั้งแรกแบบอ่านอย่างเดียว (ขอสิทธิ์ช้า) แล้วรับสิทธิ์ทีหลัง → เปิดครั้งถัดไปข้อมูลต้องอยู่ครบ');
await section('[M]', async () => {
  const factory = new fidb.IDBFactory(); const storage = {};
  const slowLocks = { request(name, opts, cb) { if (typeof opts === 'function') { cb = opts; opts = {}; }
    return new Promise(res => setTimeout(() => res(cb({ name })), 3500)); } };
  const A = createEnv({ factory, storage, locks: slowLocks }); quiet(A.app);
  await A.app.init();
  await settle(4000);
  await t('ครั้งแรก: รับสิทธิ์หน้าต่างหลักได้หลังขอสิทธิ์ช้า', () => eq(A.app.isReadOnlyWindow, false));
  const app = A.app;
  await app.withMutation('t', async () => {
    app.state.staff = [{ id: 'st-1', name: 'เอ', accessLevel: 'staff', pin: await app.hashPin('111111') }];
    app.state.transactions = [{ id: 'TX-1757000000000-AAAAAAAA', date: Date.now(), total: 500, services: ['ตัดผม'] }];
    app.googleSheetsUrl = 'https://script.google.com/macros/s/X/exec';
    app.ownerPin = await app.hashPin('975310');
    return app.saveState();
  });
  await t('บันทึกข้อมูลร้านแล้วมีธง db_migrated ลงเครื่องด้วย', async () => eq(await A.raw('db_migrated'), true));
  A.dispose();
  const fast = { request(name, opts, cb) { if (typeof opts === 'function') { cb = opts; opts = {}; } return Promise.resolve(cb({ name })); } };
  const B = createEnv({ factory, storage, locks: fast }); quiet(B.app);
  await B.app.init(); await settle(50);
  await t('เปิดครั้งถัดไป: บิล/พนักงาน/ลิงก์ชีตยังอยู่ (เดิมถูกค่าเริ่มต้นทับหมด)', async () => {
    eq((await B.raw('transactions')).length, 1); eq((await B.raw('staff')).length, 1);
    eq(await B.raw('googleSheetsUrl'), 'https://script.google.com/macros/s/X/exec'); });
  await t('PIN เจ้าของไม่ถูกรีเซ็ตกลับเป็น 123456', async () => eq(await B.raw('ownerPin'), await B.app.hashPin('975310')));
  B.dispose();

  // ธงหายแต่ในฐานมีข้อมูลร้าน (เช่นข้อมูลจากรุ่นที่มีบั๊ก) → ต้องตั้งธงอย่างเดียว ไม่ย้ายทับ
  const f2 = new fidb.IDBFactory(); const st2 = { jahn_pos_transactions: JSON.stringify([]) };
  const C = createEnv({ factory: f2, storage: st2 }); quiet(C.app);
  await seed(C, { transactions: [{ id: 'TX-1757000000000-BBBBBBBB', date: Date.now(), total: 300, services: ['ตัดผม'] }] });
  await C.db.state.delete('db_migrated');
  await C.app.init(); await settle(50);
  await t('ธงหายแต่มีข้อมูลร้านอยู่ → ไม่ย้ายข้อมูลเก่าทับ (บิลยังอยู่) และตั้งธงให้', async () => {
    eq((await C.raw('transactions')).length, 1); eq(await C.raw('db_migrated'), true); });
  C.dispose();

  // เส้นทางย้ายข้อมูลจริงยังทำงาน: ฐานว่าง + มีข้อมูลใน localStorage รุ่นเก่า
  const f3 = new fidb.IDBFactory();
  const st3 = { jahn_pos_transactions: JSON.stringify([{ id: 'TX-1757000000000-CCCCCCCC', date: Date.now(), total: 200, services: ['ตัดผม'] }]) };
  const D = createEnv({ factory: f3, storage: st3 }); quiet(D.app);
  await D.app.init(); await settle(50);
  await t('ฐานว่าง + ข้อมูลรุ่นเก่าใน localStorage → ยังย้ายเข้ามาได้ตามเดิม', async () => {
    const tx = await D.raw('transactions'); ok(Array.isArray(tx) && tx.length === 1 && tx[0].id === 'TX-1757000000000-CCCCCCCC', JSON.stringify(tx)); });
  D.dispose();
}, 60000);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Q] QR พร้อมเพย์: ภาพที่แอปวาดต้องอ่านออกด้วยเครื่องอ่านมาตรฐาน');
await section('[Q]', async () => {
  const src = fs.readFileSync(process.env.POS_QR_SRC || path.join(__dirname, '..', 'promptpay-qr.js'), 'utf8');
  const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(src, ctx);
  const PP = ctx.window.PromptPayQR;
  const toImg = (mat) => { const n = mat.length, q = 4, s = 6, W = (n + 2 * q) * s; const d = new Uint8ClampedArray(W * W * 4).fill(255);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (mat[r][c])
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const i = (((r + q) * s + y) * W + ((c + q) * s + x)) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    return { d, W }; };
  let okCount = 0, n = 0; const failed = [];
  for (const id of ['0812345678', '0899999999', '0107536000102', '004999000288505'])
    for (const amt of [null, 1, 100, 350.5, 1234.25])
      for (const ec of ['M', 'L']) {
        n++;
        const payload = PP.buildPayload(id, amt);
        const m = PP.generateMatrix(payload, ec);
        const { d, W } = toImg(m.modules);
        const r = jsQR(d, W, W, { inversionAttempts: 'dontInvert' });
        if (r && r.data === payload) okCount++; else if (failed.length < 3) failed.push(`${id}/${amt}/${ec}`);
      }
  await t(`ถอดรหัสภาพ QR ได้ครบทุกแบบ (${n} แบบ: เบอร์โทร/เลขนิติบุคคล/e-Wallet × ยอดเงิน × ระดับกู้ข้อมูล M,L)`, () => eq(okCount, n, 'ไม่ผ่าน: ' + failed.join(', ')));
  // ภาพ SVG (ทางสำรองตอน canvas ใช้ไม่ได้) ใช้ matrix เดียวกัน — ตรวจว่าวาดตามแถว/คอลัมน์เดียวกัน
  const svg = PP.svg(PP.buildPayload('0812345678', 100), { ecLevel: 'M', quiet: 4 });
  const m1 = PP.generateMatrix(PP.buildPayload('0812345678', 100), 'M').modules;
  const firstRun = /<rect x="(\d+)" y="(\d+)"/.exec(svg);
  await t('SVG วางโมดูลตาม modules[แถว][คอลัมน์] เหมือน canvas', () => { ok(firstRun, svg.slice(0, 200));
    ok(m1[Number(firstRun[2]) - 4][Number(firstRun[1]) - 4], 'จุดแรกใน SVG ไม่ตรงกับ matrix'); });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[I] เจ้าของทิ้งเครื่องตอนกู้ข้อมูลค้างที่หน้าต่างถาม → ออกจากระบบตามเวลา และหน้าต่างที่ค้างถูกยกเลิก');
await section('[I]', async () => {
  const { env, app } = await makeShop({ role: 'owner' });
  delete app.showConfirm; delete app.askConfirm;   // ใช้หน้าต่างยืนยันจริง (quiet() กดยืนยันให้อัตโนมัติ)
  const bad = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  bad.transactions.push({ id: 'TX-BAD', date: Date.now(), total: -5, subtotal: -5, discount: 0, paymentMethod: 'cash', services: [], staffNames: [] });
  app.cloudPost = async () => ({ status: 'success', details: { backupData: bad } });
  app.restoreFromDriveBackup('file-1', '1/1/2569');
  env.document.getElementById('btn-confirm-yes').onclick();
  await settle(50);
  await t('กำลังรอคำตอบ "จะกู้ไฟล์ที่เสียต่อไหม"', () => { eq(app.restoreBusy, true); ok(app.isAwaitingUserAnswer()); });
  app._lastActivityTs = Date.now() - 2 * 3600e3; app.checkIdleTimeout();
  await settle(30);
  await t('ทิ้งไว้ 2 ชม. → ออกจากระบบเจ้าของแล้ว (เดิมยังเป็นเจ้าของ)', () => eq(app.currentRole, null));
  await t('หน้าต่างที่ค้างถูกยกเลิก · งานกู้จบ (restoreBusy คืนค่า)', () => { eq(app.isAwaitingUserAnswer(), false); eq(app.restoreBusy, false); });
  await t('คนที่มาเจอเครื่องทีหลังไม่ได้สิทธิ์เจ้าของ', () => eq(app.requireOwnerForDataAction('x'), false));
  env.dispose();

  // ถามรหัสเจ้าของค้างไว้ (ขั้นแรกของการกู้จาก Drive)
  const s2 = await makeShop({ role: 'owner' });
  const a2 = s2.app;
  a2.fetchWithTimeout = async () => ({ ok: true, status: 200, json: async () => ({ status: 'error', code: 'OWNER_KEY_REQUIRED', message: 'need key' }), release() {} });
  a2.restoreFromDriveBackup('FILE1', '2026-09-20');
  await settle(50);
  a2._lastActivityTs = Date.now() - 3 * 3600e3; a2.checkIdleTimeout();
  await settle(50);
  await t('ค้างที่ช่องถามรหัสเจ้าของ 3 ชม. → ออกจากระบบ และงานกู้จบ', () => { eq(a2.currentRole, null); eq(a2.restoreBusy, false); });
  s2.env.dispose();

  // ระหว่างดาวน์โหลด/แทนข้อมูล (ไม่มีหน้าต่างรอคน) ยังต้องไม่ถูกเตะกลางคันเหมือนเดิม
  const s3 = await makeShop({ role: 'owner' });
  s3.app.restoreBusy = true; s3.app._lastActivityTs = Date.now() - 3600e3; s3.app.checkIdleTimeout();
  await t('กำลังกู้ (ไม่มีหน้าต่างรอคำตอบ) → ยังไม่เตะออก', () => eq(s3.app.currentRole, 'owner'));
  s3.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[U] นำเข้าไฟล์ผิด แล้วกด "ย้อนกลับไปก่อนกู้ข้อมูล" → ค่าที่เดิมว่างต้องกลับเป็นว่าง');
await section('[U]', async () => {
  const { env, app } = await makeShop({ role: 'owner', rows: { shopPromptPayId: '', telegramChatId: '' } });
  withFileReader(env);
  const wrong = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  wrong.shopPromptPayId = '0899999999'; wrong.telegramChatId = '777OTHERCHAT'; wrong.shopName = 'ร้านอื่น';
  await importFile(env, wrong);
  await t('หลังนำเข้า: ได้ค่าจากไฟล์ (เครื่องว่างอยู่)', () => { eq(app.shopPromptPayId, '0899999999'); eq(app.telegramChatId, '777OTHERCHAT'); });
  await app.undoLastRestore(); await app._confirmP; await settle(50);
  await t('หลังย้อน: พร้อมเพย์กลับเป็นว่าง (QR ไม่ชี้ไปบัญชีของไฟล์ผิด)', async () => {
    eq(app.shopPromptPayId, ''); eq(await env.raw('shopPromptPayId'), ''); });
  await t('หลังย้อน: แชท Telegram กลับเป็นว่าง', async () => { eq(app.telegramChatId, ''); eq(await env.raw('telegramChatId'), ''); });
  await t('หลังย้อน: ชื่อร้านกลับเป็นของเดิม', () => eq(app.shopName, 'ร้านจริง'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[B] ไฟล์สำรองค่าผิดรูปที่เดิมผ่านด่านตรวจ');
await section('[B]', async () => {
  const { env, app } = await makeShop({ role: 'owner' });
  const base = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  const oldBills = [];
  for (let i = 1; i <= 20; i++) oldBills.push({ id: 'TX-OLD-' + i, date: Date.now() - (i + 2) * DAY, total: 500, subtotal: 500, discount: 0,
    paymentMethod: 'cash', services: ['ตัดผม'], staffNames: ['เอ'] });
  const file = Object.assign(base, { transactions: oldBills, vatRate: 700,
    shift: { active: true, startCash: 1000, expenses: [], history: [] } });
  const audit = app.auditBackupData(JSON.parse(JSON.stringify(file)));
  await t('ผลตรวจก่อนกู้ไม่บอกว่า "สะอาด" และอธิบายเรื่อง VAT/กะ', () => {
    eq(audit.clean, false); const txt = app.describeBackupAudit(audit); ok(/อัตรา VAT/.test(txt) && /เวลาเริ่ม/.test(txt), txt); });
  await app.applyBackupData(file); await settle(30);
  await t('อัตรา VAT 700% ไม่ถูกรับ — คงอัตราเดิมของเครื่อง (7%)', async () => { eq(app.vatRate, 7); eq(await env.raw('vatRate'), 7); });
  await t('กะที่ไม่มีเวลาเริ่มถูกปิดไว้ (ไม่เอาเงินสดย้อนหลัง 20 ใบมานับเป็นยอดกะ)', () => eq(app.state.shift.active, false));
  await t('ค่าเดิมของกะและ VAT ถูกแยกเก็บไว้ตรวจสอบ', () => {
    const rs = (app.state.quarantine || []).map(q => (q.reasons || []).join(','));
    ok(rs.includes('bad-startTime') && rs.includes('bad-vatRate'), JSON.stringify(rs)); });
  env.dispose();

  // log ข้างในเสีย → เดิมหน้ารายงานพังหลังบันทึกแล้วแจ้งว่า "ไม่สำเร็จ ข้อมูลเดิมอยู่ครบ"
  const s2 = await makeShop({ role: 'owner' });
  const { env: e2, app: a2, toasts } = s2;
  withFileReader(e2);
  ['renderEveryScreen', 'renderReports', 'filterReports'].forEach(k => delete a2[k]);
  a2.renderReportsChart = () => {};
  a2.state.selectedReportType = 'daily';
  e2.document.getElementById('report-date-input').value = a2.getBusinessISODate(Date.now());
  const f2 = JSON.parse(JSON.stringify(a2.buildBackupPayload()));
  f2.transactions = [{ id: 'TX-NEW', date: Date.now(), total: 300, subtotal: 300, discount: 0, paymentMethod: 'cash', services: ['ตัดผม'], staffNames: ['เอ'] }];
  f2.editLog = [{ billId: 'TX-NEW', date: Date.now(), kind: 'settlement', fields: ['settlement'], settlements: [null], by: 'x' }];
  await importFile(e2, f2);
  await t('นำเข้าสำเร็จ ไม่มีข้อความ "ไม่สำเร็จ … ข้อมูลเดิมอยู่ครบ" (ซึ่งไม่จริง)', () => {
    ok(!toasts.some(x => /ไม่สำเร็จ/.test(x.m) && /ข้อมูลเดิม/.test(x.m)), JSON.stringify(toasts.map(x => x.m.slice(0, 60)))); });
  await t('ข้อมูลใหม่ลงเครื่อง และรายการย่อยที่เสียถูกล้างออก', async () => {
    eq((await e2.raw('transactions')).map(x => x.id).join(), 'TX-NEW');
    eq((await e2.raw('editLog'))[0].settlements.length, 0); });
  e2.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[T] กู้ข้อมูล: แชท Telegram ของเครื่องต้องไม่ถูกแทนด้วยของในไฟล์');
await section('[T]', async () => {
  const { env, app } = await makeShop({ role: 'owner', rows: { telegramToken: '123:TOKEN', telegramChatId: '-100NEWGROUP' } });
  const f = JSON.parse(JSON.stringify(app.buildBackupPayload())); f.telegramChatId = '555OLDMANAGER';
  await app.applyBackupData(f); await settle(30);
  await t('เครื่องตั้งแชทไว้แล้ว → ยึดของเครื่อง', async () => { eq(app.telegramChatId, '-100NEWGROUP'); eq(await env.raw('telegramChatId'), '-100NEWGROUP'); });
  env.dispose();
  const s2 = await makeShop({ role: 'owner', rows: { telegramChatId: '' } });
  const f2 = JSON.parse(JSON.stringify(s2.app.buildBackupPayload())); f2.telegramChatId = '-100SHOP';
  await s2.app.applyBackupData(f2); await settle(30);
  await t('เครื่องยังไม่ได้ตั้ง → ใช้ของในไฟล์', () => eq(s2.app.telegramChatId, '-100SHOP'));
  s2.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[W] หน้าต่างรอง (เปิดแอปซ้ำ)');
await section('[W]', async () => {
  function lockManager() {
    let held = false; const queue = [];
    return {
      request(name, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        if (!held) { held = true; return Promise.resolve(cb({ name })); }
        if (opts.ifAvailable) return Promise.resolve(cb(null));
        return new Promise(res => queue.push(() => { held = true; res(cb({ name })); }));
      },
      closeHolder() { held = false; const n = queue.shift(); if (n) n(); }
    };
  }
  // W1: ออกจากระบบในหน้าต่างรองต้องไม่ลบ session ของหน้าต่างหลัก
  {
    const factory = new fidb.IDBFactory(); const locks = lockManager(); const storage = {};
    const A = createEnv({ factory, locks, storage }); quiet(A.app); await seed(A); await A.app.init();
    const B = createEnv({ factory, locks, storage }); quiet(B.app); await B.app.init();
    await t('A หลัก · B อ่านอย่างเดียว', () => { eq(A.app.isReadOnlyWindow, false); eq(B.app.isReadOnlyWindow, true); });
    A.app.currentUser = { id: 'st-1', name: 'เอ' }; A.app.currentRole = 'staff'; A.app.saveSession();
    await settle(30);
    B.app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' }; B.app.currentRole = 'owner';
    B.app.logout('idle'); await settle(30);
    await t('หน้าต่างรองออกจากระบบ → session ของหน้าต่างหลักยังอยู่', async () => { const s = await A.raw('session'); ok(s && s.uid === 'st-1', JSON.stringify(s)); });
    A.dispose(); B.dispose();
  }
  // W2: รับสิทธิ์หน้าต่างหลักแล้วต้องส่งงานคลาวด์ที่ค้างต่อ
  {
    const factory = new fidb.IDBFactory(); const locks = lockManager(); const storage = {};
    const calls = []; let failing = true;
    const fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: !failing }) }; };
    const A = createEnv({ factory, locks, storage, fetch }); quiet(A.app);
    await seed(A, { googleSheetsUrl: '', googleSheetsApiToken: '', telegramToken: '1:x', telegramChatId: '-1',
      cloudOutbox: [{ id: 'cob-1', createdAt: 1, dateKeys: [], monthKeys: [], needSummary: false, needTelegram: true,
        telegramMessage: 'ปิดกะ', tries: 1, retry: { telegram: { tries: 1, lastTry: Date.now() - 60e3, nextAt: Date.now() - 1 } } }] });
    const B = createEnv({ factory, locks, storage, fetch }); quiet(B.app);
    await A.app.init(); await B.app.init(); await settle(50);
    calls.length = 0; failing = false;
    A.dispose(); locks.closeHolder();
    await settle(300);
    await t('B รับสิทธิ์แล้ว', () => eq(B.app.isReadOnlyWindow, false));
    await t('B ส่งงาน Telegram ที่ค้างต่อทันที (เดิมค้างจนมีการขาย/เน็ตกลับ)', () =>
      ok(calls.length > 0 || !!B.app._cloudRetryTimer, 'ไม่ส่งและไม่ได้ตั้งเวลาลองใหม่'));
    B.dispose();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[G] Apps Script');
await section('[G]', async () => {
  // G1: เครื่องที่นาฬิกาเดินหน้า 100 วันยกเลิกบิล → ทะเบียนของบิลอื่นต้องไม่หาย
  {
    const gas = createGasEnv();
    const now = Date.parse('2026-09-10T12:00:00+07:00');
    const bill = (id) => ({ action: 'transaction', id, date: now, monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00',
      customerName: 'c', services: ['cut'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', staffNames: ['A'], rev: 1, revEpoch: 0 });
    const A = 'TX-1757480400000-AAAA0001', B = 'TX-1766120400000-BBBB0002', C = 'TX-1757480500000-CCCC0003';
    gas.post(bill(A));
    gas.post({ action: 'void_transaction', id: A, monthKey: '09-2026', date: now, voidedAt: now + 60000 });
    gas.post({ action: 'void_transaction', id: B, monthKey: '09-2026', date: now, voidedAt: now + 100 * DAY });
    await t('หลังเครื่องนาฬิกาเพี้ยนยกเลิกบิล: ทะเบียนของบิลอื่นยังอยู่', () => ok(gas.props['POSVB_' + A]));
    await t('คำขอบันทึกบิลที่ยกเลิกไปแล้วมาช้า → ยังถูกกัน (ALREADY_VOIDED)', () => eq(gas.post(bill(A)).code, 'ALREADY_VOIDED'));
    gas.post(bill(C));
    gas.post({ action: 'void_transaction', id: C, monthKey: '09-2026', date: now, voidedAt: now + 120000 });
    await t('ยกเลิกบิลใหม่หลังจากนั้น → ทะเบียนลงจริงและกันการส่งซ้ำได้', () => { ok(gas.props['POSVB_' + C]); eq(gas.post(bill(C)).code, 'ALREADY_VOIDED'); });
  }
  // G2: รหัสเจ้าของ — หน่วงเวลา ไม่ล็อกยาว
  {
    const gas = createGasEnv(); const key = gas.setupOwnerKey();
    for (let i = 0; i < 5; i++) gas.post({ action: 'list_backups', ownerKey: 'WRONG-' + i });
    const f = JSON.parse(gas.props.POS_OWNER_KEY_FAILS);
    await t('ผิด 5 ครั้งติด → รอไม่เกิน 1 นาที (เดิมล็อก 15 นาที)', () => ok(Number(f.until) - Date.now() <= 60e3, JSON.stringify(f)));
    await t('กดระหว่างช่วงรอไม่ทำให้ต้องรอนานขึ้น', () => { gas.post({ action: 'list_backups', ownerKey: 'WRONG-X' });
      eq(JSON.parse(gas.props.POS_OWNER_KEY_FAILS).until, f.until); });
    f.until = Date.now() - 1; gas.props.POS_OWNER_KEY_FAILS = JSON.stringify(f);
    await t('พ้นช่วงรอ → รหัสถูกเข้าได้ทันที และล้างตัวนับ', () => {
      eq(gas.post({ action: 'list_backups', ownerKey: key }).status, 'success'); eq(gas.props.POS_OWNER_KEY_FAILS, undefined); });
    for (let i = 0; i < 12; i++) {
      const cur = gas.props.POS_OWNER_KEY_FAILS ? JSON.parse(gas.props.POS_OWNER_KEY_FAILS) : null;
      if (cur && cur.until) { cur.until = Date.now() - 1; gas.props.POS_OWNER_KEY_FAILS = JSON.stringify(cur); }
      gas.post({ action: 'list_backups', ownerKey: 'WRONG-' + i });
    }
    const f2 = JSON.parse(gas.props.POS_OWNER_KEY_FAILS);
    await t('ผิดต่อเนื่องหลายสิบครั้ง ช่วงรอยังสูงสุด 1 นาที', () => ok(Number(f2.until) - Date.now() <= 60e3 && Number(f2.until) - Date.now() > 30e3, JSON.stringify(f2)));
  }
  // G3: งานสลับแท็บค้าง → ต้องกู้ก่อนตรวจรุ่น
  {
    const gas = createGasEnv();
    const day = (over) => Object.assign({ action: 'summary_day', dateKey: '2026-09-05', totalRevenue: 5000, cashRevenue: 5000, qrRevenue: 0,
      creditRevenue: 0, billCount: 12, totalExpenses: 0, cashVariance: 0, shiftCount: 1, shiftCash: [], nonVatBase: 5000, vatableBase: 0,
      vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [], services: [], expenses: [], staffCommissions: [] }, over || {});
    const SN = 'สรุป-2026-09-05';
    const masterRev = () => { const m = gas.sheet('สรุปรายเดือน'); const h = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
      return m.getRange(2, h.indexOf('รายได้รวม (฿)') + 1).getValue(); };
    gas.post(day({ generatedAt: 2000 }));
    const ts = Date.now() + '_1';
    gas.sheet(SN).setName('__POS_OLD_' + ts);
    gas.ss.insertSheet('__POS_TMP_' + ts);
    gas.props.POS_SUMMARY_PUBLISH = JSON.stringify({ v: 1, sheetName: SN, stagingName: '__POS_TMP_' + ts, oldName: '__POS_OLD_' + ts,
      periodType: 'day', periodKey: '2026-09-05', stamp: 3000, master: { totalRevenue: 5000, totalExpenses: 0, billCount: 12 } });
    const r = gas.post(day({ generatedAt: 1000, totalRevenue: 100, cashRevenue: 100, nonVatBase: 100 }));
    await t('ข้อมูลเก่ากว่ามาถึงช่วงที่งานสลับแท็บค้าง → ปฏิเสธ STALE_SUMMARY (เดิมเขียนทับของใหม่)', () => eq(r.code, 'STALE_SUMMARY', JSON.stringify(r)));
    await t('ยอดใน master ยังเป็นของรุ่นใหม่ (5,000)', () => eq(masterRev(), 5000));
  }
  // G4: เขียน master พังหลังเพิ่มคอลัมน์ → คืนแถวต้องไม่ลงผิดช่อง
  {
    const gas = createGasEnv();
    const m = gas.ss.insertSheet('สรุปรายเดือน', 0);
    const H = ['ประเภท', 'ช่วงเวลา', 'บิล', 'รายได้รวม (฿)', 'ค่าใช้จ่าย (฿)', 'กำไรสุทธิ (฿)', 'เงินขาด/เกิน (฿)', 'อัปเดตล่าสุด'];
    m.getRange(1, 1, 1, H.length).setValues([H]);
    m.getRange(2, 2).setNumberFormat('@');
    m.getRange(2, 1, 1, 8).setValues([['รายวัน', '2026-09-05', 10, 1000, 100, 900, 0, "'2026-09-05 23:00"]]);
    gas.faults.flush = 2;   // Sheets ล้มหลังเพิ่มคอลัมน์ (flush ครั้งที่ 2 = ใน updateMasterSummarySheet)
    gas.post({ action: 'summary_day', dateKey: '2026-09-05', generatedAt: 5000, totalRevenue: 5000, cashRevenue: 5000, qrRevenue: 0,
      creditRevenue: 0, billCount: 12, totalExpenses: 0, cashVariance: 0, shiftCount: 1, shiftCash: [], nonVatBase: 5000, vatableBase: 0,
      vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [], services: [], expenses: [], staffCommissions: [] });
    const w = m.getLastColumn(); const h = m.getRange(1, 1, 1, w).getValues()[0]; const v = m.getRange(2, 1, 1, w).getValues()[0];
    const col = (name) => v[h.indexOf(name)];
    await t('แถวที่คืนมาอยู่ถูกช่อง: รายได้ 1,000 · กำไร 900 · ช่อง VAT ไม่มีตัวเลขแปลกปลอม', () => {
      eq(col('รายได้รวม (฿)'), 1000); eq(col('กำไรสุทธิ (฿)'), 900); ok(!(Number(col('VAT (฿)')) > 0), 'VAT=' + col('VAT (฿)')); });
  }
  // G5: ไฟล์สำรองในถังขยะต้องไม่โผล่ในรายการ และเปิดไม่ได้
  {
    const gas = createGasEnv(); const key = gas.setupOwnerKey();
    const folder = gas.ctx.getBackupFolder_(true);
    const good = folder.createFile('pos_backup_2026-09-20.json', '{}', 'text/plain');
    const bad = folder.createFile('pos_backup_2026-09-21.json', '{"broken":', 'text/plain');
    bad.setTrashed(true);
    const list = gas.post({ action: 'list_backups', ownerKey: key });
    await t('รายการไฟล์สำรองไม่มีไฟล์ที่อยู่ในถังขยะ', () => {
      const ids = ((list.details && list.details.files) || []).map(f => f.id);
      ok(ids.includes(good.getId()) && !ids.includes(bad.getId()), JSON.stringify(list)); });
    const g = gas.post({ action: 'get_backup', ownerKey: key, fileId: bad.getId() });
    await t('ขอเปิดไฟล์ในถังขยะโดยตรง → ไม่พบไฟล์', () => eq(g.status, 'error'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[C] หมวด/รายงาน/ใบเสร็จ/ตะกร้า/เลขพร้อมเพย์');
await section('[C]', async () => {
  const { env, app } = await makeShop({ role: 'owner' });
  const P = Object.getPrototypeOf(app);
  app.syncPendingTransactions = async () => {};
  app.state.categories.push({ id: 'cat-1700000000000-abc123', name: 'เบียร์', icon: 'fa-tag', vat: true });
  readyCheckout(env, [{ id: 'b1', name: 'Beer', price: 100, category: 'cat-1700000000000-abc123', staffId: 'st-1', staffName: 'เอ' },
                      { id: 's1', name: 'ตัดผม', price: 300, category: 'barber', staffId: 'mg-1', staffName: 'บี' }], 'cash', 1000);
  await app.processCheckout(); await settle(30);
  const tx = app.state.transactions[app.state.transactions.length - 1];
  await app.deleteCategory('cat-1700000000000-abc123'); await app._confirmP; await settle();
  await t('หมวดที่มีบิลขายแล้วลบไม่ได้ (สรุป VAT ยังได้ชื่อ "เบียร์")', () => {
    ok(app.state.categories.some(c => c.id === 'cat-1700000000000-abc123'));
    eq(app.buildVatSummary(app.state.transactions).categories[0].name, 'เบียร์'); });
  app.state.categories = app.state.categories.filter(c => c.id !== 'cat-1700000000000-abc123');   // ข้อมูลเก่าที่ถูกลบไปก่อนมีการกัน
  await t('หมวดที่หายไปแล้ว → สรุป VAT ไม่ส่งรหัสภายในไปโผล่ในชีตภาษี', () =>
    ok(!/cat-17/.test(JSON.stringify(app.buildVatSummary(app.state.transactions).categories))));

  // กราฟ = ตัวเลขสรุป
  app.filterReports = P.filterReports.bind(app); app.renderReportsChart = P.renderReportsChart.bind(app);
  const d = env.document;
  d.getElementById('report-date-input').value = app.getBusinessISODate(tx.date);
  app.state.selectedReportType = 'daily';
  const bars = () => [...d.getElementById('css-bar-chart').innerHTML.matchAll(/chart-bar-tooltip">([^<]*)</g)].map(m => m[1]).filter(x => x !== '฿0');
  d.getElementById('report-staff-filter').value = 'st-1';
  app.filterReports();
  await t('เลือกพนักงานรายคน: กราฟเท่ากับยอดงานของคนนั้น (฿100) ไม่ใช่ยอดทั้งบิล', () => eq(bars().join(), '฿100'));
  d.getElementById('report-staff-filter').value = 'all';
  const bad = JSON.parse(JSON.stringify(tx)); bad.id = 'TX-BAD-1'; bad.vatAmount = 99;
  app.state.transactions.push(bad);
  app.filterReports();
  await t('ทั้งร้าน + มีบิลรอตรวจ: กราฟไม่นับบิลรอตรวจ (เท่ากับตัวเลขสรุป ฿407)', () => eq(bars().join(), '฿' + (407).toLocaleString()));
  app.state.transactions.pop();

  // ใบเสร็จบิลเก่า
  app.showThermalReceipt = P.showThermalReceipt.bind(app);
  const receipt = (bill) => { app.showThermalReceipt(bill); const h = d.getElementById('thermal-receipt-preview').innerHTML;
    return { items: [...h.matchAll(/receipt-item-details">\s*<span>[^<]*<\/span>\s*<span>฿([^<]*)</g)].map(m => Number(m[1].replace(/,/g, ''))),
      sub: (/รวมค่าบริการ:<\/span>\s*<span>฿([^<]*)</.exec(h) || [])[1] }; };
  const r1 = receipt({ id: 'TX-1', date: Date.now(), customerName: 'x', services: ['A', 'B', 'C'], staffNames: ['เอ'], subtotal: 100, discount: 0, total: 100, paymentMethod: 'cash' });
  await t('บิลเก่า 3 รายการ ยอด 100: ราคาต่อรายการรวมกันได้ 100 พอดี (เดิม 33×3 = 99)', () =>
    eq(Math.round(r1.items.reduce((a, b) => a + b, 0) * 100), 10000, JSON.stringify(r1)));
  const r2 = receipt({ id: 'TX-2', date: Date.now(), customerName: 'x', services: ['A', 'B'], staffNames: ['เอ'], total: 500, paymentMethod: 'cash' });
  await t('บิลเก่าที่มีแต่ยอดรวม 500: รวมค่าบริการ 500 และรายการละ 250 (เดิม 0)', () => { eq(r2.sub, '500'); eq(r2.items.join(), '250,250'); });

  // ตะกร้าที่ผูกพนักงานที่ถูกลบ
  const s2 = await makeShop({ role: 'owner' });
  const a2 = s2.app; const P2 = Object.getPrototypeOf(a2);
  a2.syncPendingTransactions = async () => {};
  readyCheckout(s2.env, [{ id: 's1', name: 'ตัดผม', price: 300, staffId: 'mg-1', staffName: 'บี' }], 'cash', 1000);
  await a2.deleteStaff('mg-1'); await a2._confirmP; await settle();
  a2.renderCart = P2.renderCart.bind(a2); a2.updateCartTotals = () => {};
  a2.renderCart();
  const html = s2.env.document.getElementById('cart-items-list').innerHTML;
  await t('ตะกร้าแสดงตัวเลือก "เลือกผู้ให้บริการใหม่" ที่ถูกเลือกไว้ (ไม่แสร้งโชว์ชื่อคนแรก)', () =>
    ok(/<option value="" selected disabled>/.test(html), html.slice(0, 400)));
  a2.changeItemStaff(a2.state.cart[0].uniqueCartId, 'st-1');
  await t('เลือกคนใหม่แล้วรายการผูกกับคนนั้นจริง', () => eq(a2.state.cart[0].staffId, 'st-1'));
  s2.env.dispose();

  // เลขพร้อมเพย์ 13 หลัก
  const valid = env.ctx.isValidThaiId13;
  await t('ตรวจหลักสุดท้ายของเลข 13 หลักถูกต้อง (เลขนิติบุคคลจริง 2 ตัว + ตัวที่พิมพ์ผิด)', () => {
    ok(typeof valid === 'function', 'ไม่พบฟังก์ชันตรวจ');
    eq(valid('0107536000102'), true); eq(valid('0107544000108'), true); eq(valid('0107536000103'), false); });
  const ppInput = d.getElementById('shop-promptpay-id');
  ppInput.value = '0107536000103';
  await app.saveShopSettings(); await settle(30);
  await t('บันทึกเลข 13 หลักที่หลักตรวจสอบผิด → ไม่รับ (คงเลขเดิม)', () => eq(app.shopPromptPayId, '0812345678'));
  ppInput.value = '0107536000102';
  await app.saveShopSettings(); await settle(30);
  await t('เลข 13 หลักที่ถูกต้อง → บันทึกได้', () => eq(app.shopPromptPayId, '0107536000102'));
  env.dispose();
});

R.done();
})().catch(e => { console.error(e); process.exit(1); });
