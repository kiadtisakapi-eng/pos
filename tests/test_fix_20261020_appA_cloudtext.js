// ตรวจ 19 ต.ค. 2569 ข้อ 2 (ฝั่งแอป) · 21 · 53 — ข้อความคลาวด์ที่เจ้าของ/พนักงานเห็น + รหัสเจ้าของหลังออกจากระบบ
// เดินทางจริงของแอป (สำรองขึ้น Drive · cloudPost · หน้ารายการไฟล์สำรอง · รายงานปิดกะ) กับ Apps Script จำลอง/คำตอบจำลอง
//   ข้อ 2: เตือนขนาดไฟล์สำรองตามเพดานจริง (Apps Script ใหม่ส่ง limitBytes → 60% · รุ่นเก่า → 4 MB) และบอกว่า "จะหยุด"
//          งานสำรองที่ถูกหยุดแล้ว → "การสำรองขึ้น Drive หยุดแล้ว — กด ลองใหม่ ที่ ตั้งค่า → งานคลาวด์ที่หยุดส่ง"
//   ข้อ 21: ข้อความ Safari/Google ภาษาอังกฤษดิบ → ภาษาไทยที่บอกว่าต้องทำอะไร · ข้อความที่ไม่รู้จักยังส่งผ่านตามเดิม
//   ข้อ 53: รหัสเจ้าของที่พิมพ์ไว้ ไม่ถูกจำต่อให้คนที่ล็อกอินหลังเจ้าของออกจากระบบระหว่างรอคำตอบ
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_cloudtext.js
process.env.TZ = 'Asia/Bangkok';
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, settle, createGasEnv, loginAs } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 2 · 21 · 53: ข้อความคลาวด์ ---');
const ENGLISH_RAW = /Load failed|Failed to fetch|did not match the expected pattern|JSON Parse error|NetworkError|appears to be offline|connection was lost|storage quota/;

const jsonResponse = (obj) => ({ ok: true, status: 200, headers: { get: () => 'application/json' },
  json: async () => obj, text: async () => JSON.stringify(obj) });
const brokenJsonResponse = (msg, name) => ({ ok: true, status: 200, headers: { get: () => 'text/html' },
  json: async () => { const e = new Error(msg); e.name = name || 'SyntaxError'; throw e; }, text: async () => '<!doctype html>' });

async function backupWith(s, fetchImpl) {
  s.env.ctx.fetch = fetchImpl;
  s.toasts.length = 0;
  const r = await s.app.autoBackupToGoogleDrive();
  await settle(30);
  return { r, toast: s.toasts.filter(t => t.ty === 'error').map(t => t.m).join(' | '), status: s.app.backupStatus };
}

(async () => {
  const s = await makeShop({});
  const realFetch = s.env.ctx.fetch;

  // ── ข้อ 21: เน็ตหลุด (ข้อความของแต่ละเบราว์เซอร์) ──
  for (const raw of ['Load failed', 'Failed to fetch', 'The Internet connection appears to be offline.',
                     'The network connection was lost.', 'NetworkError when attempting to fetch resource.']) {
    await R.t(`ข้อ 21 เน็ตหลุด "${raw}" → สำรองขึ้น Drive: ข้อความไทย "ต่อเน็ตไม่ได้ — ข้อมูลในเครื่องปลอดภัย…"`, async () => {
      const b = await backupWith(s, async () => { throw new TypeError(raw); });
      eq(b.r, false);
      ok(/ต่อเน็ตไม่ได้ — ข้อมูลในเครื่องปลอดภัย ระบบจะส่งเองเมื่อเน็ตกลับมา/.test(b.toast), b.toast);
      ok(!ENGLISH_RAW.test(b.toast), 'ไม่มีข้อความอังกฤษดิบ: ' + b.toast);
      ok(/ต่อเน็ตไม่ได้/.test(b.status.lastMessage), 'สถานะในหน้าตั้งค่าเป็นภาษาไทย: ' + b.status.lastMessage);
      let e1 = null; try { await s.app.cloudPost('primary_status', {}, 5000); } catch (e) { e1 = e.message; }
      ok(/ต่อเน็ตไม่ได้/.test(e1), 'cloudPost: ' + e1);
    });
  }

  // ── ข้อ 21: อ่านคำตอบเป็น JSON ไม่ได้ (ข้อความต่างกันทุกเบราว์เซอร์) ──
  for (const raw of ['The string did not match the expected pattern.', "JSON Parse error: Unrecognized token '<'", 'อะไรก็ได้ที่ไม่รู้จัก']) {
    await R.t(`ข้อ 21 res.json() ล้ม "${raw.slice(0, 40)}" → กรณี "ไม่ใช่ข้อมูล" ทั้ง cloudPost และสำรองขึ้น Drive`, async () => {
      s.env.ctx.fetch = async () => brokenJsonResponse(raw);
      let e1 = null; try { await s.app.cloudPost('primary_status', {}, 5000); } catch (e) { e1 = e.message; }
      ok(/ชีตตอบกลับมาไม่ใช่ข้อมูล/.test(e1), 'cloudPost: ' + e1);
      ok(!ENGLISH_RAW.test(e1) && !e1.includes(raw), e1);
      const b = await backupWith(s, async () => brokenJsonResponse(raw));
      ok(/ชีตตอบกลับมาไม่ใช่ข้อมูล/.test(b.toast), b.toast);
    });
  }
  await R.t('ข้อ 21 res.json() หมดเวลา (ตัวจับเวลาของแอป) → ยังเป็นข้อความหมดเวลา ไม่ใช่ "ไม่ใช่ข้อมูล"', async () => {
    s.env.ctx.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: () => new Promise(() => {}), text: () => new Promise(() => {}) });
    let e1 = null; try { await s.app.cloudPost('primary_status', {}, 300); } catch (e) { e1 = e.message; }
    ok(/หมดเวลารอ/.test(e1) && !/ไม่ใช่ข้อมูล/.test(e1), e1);
  });

  // ── ข้อ 21: ข้อความจาก Apps Script ──
  const gasError = (obj) => async () => jsonResponse(Object.assign({ status: 'error' }, obj));
  await R.t('ข้อ 21 "ข้อผิดพลาด: …" (Apps Script จับ error ของ Google ได้) → "ฝั่ง Google ขัดข้องชั่วคราว" + เก็บรายละเอียด', async () => {
    const b = await backupWith(s, gasError({ code: 'SERVER_ERROR', message: 'ข้อผิดพลาด: Exception: Service Spreadsheets timed out while accessing document with id 1AbC.' }));
    ok(/^สำรองข้อมูลขึ้น Google Drive ล้มเหลว: ฝั่ง Google ขัดข้องชั่วคราว/.test(b.toast), b.toast);
    ok(/Service Spreadsheets timed out/.test(b.toast), 'เก็บรายละเอียดไว้: ' + b.toast);
  });
  await R.t('ข้อ 21 "ข้อผิดพลาด: SyntaxError … not valid JSON" (JSON เสียฝั่ง Google) → ไม่ถูกแปลผิดเป็น "ตั้ง Who has access"', async () => {
    const b = await backupWith(s, gasError({ code: 'SERVER_ERROR', message: 'ข้อผิดพลาด: SyntaxError: Unexpected token \'x\', "x{" is not valid JSON' }));
    ok(/ฝั่ง Google ขัดข้องชั่วคราว/.test(b.toast) && !/Who has access/.test(b.toast), b.toast);
  });
  await R.t('ข้อ 21 Drive เต็ม (storage quota) → "พื้นที่ Google Drive … เต็ม"', async () => {
    const b = await backupWith(s, gasError({ code: 'BACKUP_WRITE_FAILED', message: "การสำรองข้อมูลล้มเหลว: Exception: The user's Drive storage quota has been exceeded." }));
    ok(/พื้นที่ Google Drive ของบัญชีร้านเต็ม/.test(b.toast) && !ENGLISH_RAW.test(b.toast), b.toast);
  });
  await R.t('ข้อ 21 BACKUP_FOLDER_MISSING (Apps Script ใหม่) → บอกวิธี resetPosBackupFolder / ลบ POS_BACKUP_FOLDER_ID', async () => {
    const b = await backupWith(s, gasError({ code: 'BACKUP_FOLDER_MISSING', message: 'การสำรองข้อมูลล้มเหลว: โฟลเดอร์สำรองที่ตั้งไว้ถูกลบถาวรจาก Google Drive แล้ว (หาไม่เจอ)' }));
    ok(/resetPosBackupFolder/.test(b.toast) && /POS_BACKUP_FOLDER_ID/.test(b.toast), b.toast);
  });
  await R.t('ข้อ 21 INVALID_ACTION (Apps Script เก่ากว่าแอป · คำตอบจริงของ Apps Script) → หน้ารายการไฟล์สำรองบอกให้วางโค้ดล่าสุด + New version', async () => {
    // ส่งคำสั่งที่ Apps Script ไม่รู้จักผ่าน Apps Script จำลองตัวจริง (เหมือนแอปใหม่คุยกับ Apps Script รุ่นเก่า)
    s.env.ctx.fetch = (url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === 'list_backups') body.action = 'list_backups_from_newer_app';
      return realFetch(url, Object.assign({}, init, { body: JSON.stringify(body) }));
    };
    await s.app.loadDriveBackups();
    const html = s.env.document.getElementById('restore-list').innerHTML;
    ok(/Apps Script ที่วางไว้เป็นรุ่นเก่ากว่าแอป/.test(html) && /New version/.test(html) && /google_apps_script\.js/.test(html), html);
  });
  await R.t('ข้อ 21 ข้อความที่ไม่รู้จักยังส่งผ่านตามเดิม (ไม่เดา)', async () => {
    const b = await backupWith(s, gasError({ code: 'SOMETHING_NEW', message: 'ข้อความใหม่จาก Apps Script ที่แอปยังไม่รู้จัก' }));
    ok(/ล้มเหลว: ข้อความใหม่จาก Apps Script ที่แอปยังไม่รู้จัก$/.test(b.toast), b.toast);
    eq(s.app.explainCloudError('Zzz unknown'), 'Zzz unknown');
  });

  // ── ข้อ 2: เพดานขนาดไฟล์สำรอง ──
  const okBackup = (details) => async (url, init) => jsonResponse({ status: 'success', message: 'ok',
    details: Object.assign({ verified: true, fileName: 'pos_backup_test.json' }, details) });
  await R.t('ข้อ 2 Apps Script ใหม่ตอบ limitBytes → จำไว้ในสถานะการสำรอง · รุ่นเก่า (ไม่มี limitBytes) → ลบทิ้ง', async () => {
    let b = await backupWith(s, okBackup({ limitBytes: 30 * 1048576 }));
    eq(b.r, true); eq(s.app.backupStatus.lastLimitBytes, 30 * 1048576);
    eq((await s.env.raw('backupStatus')).lastLimitBytes, 30 * 1048576, 'ลงเครื่องแล้ว');
    b = await backupWith(s, okBackup({}));
    eq(b.r, true); eq(s.app.backupStatus.lastLimitBytes, undefined);
    // คำตอบล้มเหลวที่บอกเพดานมา (ไฟล์ใหญ่เกิน) ก็จำไว้
    b = await backupWith(s, gasError({ code: 'BACKUP_WRITE_FAILED', message: 'ไฟล์สำรองใหญ่เกิน', details: { sizeBytes: 5, limitBytes: 30 * 1048576, tooLarge: true } }));
    eq(s.app.backupStatus.lastLimitBytes, 30 * 1048576);
    ok(!('backupStatus' in s.app.buildBackupPayload()), 'สถานะการสำรองไม่อยู่ในไฟล์สำรอง');
    ok(s.app.isValidBackupObject(s.app.buildBackupPayload()), 'ไฟล์สำรองยังผ่านด่านตรวจ');
  });
  const MB = 1048576, now = Date.now();
  const st = (o) => Object.assign({ lastAttemptAt: now, lastOk: true, lastSuccessAt: now, lastVerified: true }, o);
  await R.t('ข้อ 2 Apps Script รุ่นเก่า: ไฟล์ 4.5 MB → เตือนว่า "การสำรองขึ้น Drive จะหยุด" + ให้วาง google_apps_script.js รุ่นล่าสุด', async () => {
    s.app.state.cloudOutbox = [];
    s.app.backupStatus = st({ lastSizeBytes: 4.5 * MB });
    const w = s.app.backupHealthWarning(now);
    ok(/ไฟล์สำรองใหญ่ 4\.5 MB/.test(w) && /การสำรองขึ้น Drive จะหยุด/.test(w) && /google_apps_script\.js/.test(w), w);
    s.app.renderBackupStatus();
    const label = s.env.document.getElementById('backup-status-label').innerText;
    ok(/ขนาดไฟล์ 4\.5 MB ⚠️/.test(label) && /จะหยุด/.test(label), label);
    s.app.backupStatus = st({ lastSizeBytes: 3.5 * MB });
    eq(s.app.backupHealthWarning(now), '', 'ต่ำกว่า 4 MB ไม่เตือน');
  });
  await R.t('ข้อ 2 Apps Script ใหม่ (เพดาน 30 MB): 6 MB ไม่เตือนแล้ว · 19 MB (≥ 60%) เตือนพร้อมเพดานจริง', async () => {
    s.app.backupStatus = st({ lastSizeBytes: 6 * MB, lastLimitBytes: 30 * MB });
    eq(s.app.backupHealthWarning(now), '', '6 MB จาก 30 MB ยังไม่ต้องเตือน');
    s.app.backupStatus = st({ lastSizeBytes: 19 * MB, lastLimitBytes: 30 * MB });
    const w = s.app.backupHealthWarning(now);
    ok(/ไฟล์สำรองใหญ่ 19\.0 MB/.test(w) && /เพดาน 30 MB/.test(w) && /การสำรองขึ้น Drive จะหยุด/.test(w), w);
  });
  await R.t('ข้อ 2 งานสำรองถูกหยุดแล้ว (ล้มเกิน 7 วัน) → รายงานปิดกะบอก "หยุดแล้ว — กด ลองใหม่ ที่ ตั้งค่า → งานคลาวด์ที่หยุดส่ง"', async () => {
    s.app.backupStatus = st({ lastOk: false, lastSuccessAt: now - 9 * 86400e3, lastSizeBytes: 1 * MB });
    s.app.state.cloudOutbox = [{ id: 'cob-stopped', createdAt: now - 9 * 86400e3, dateKeys: [], monthKeys: [], needSummary: false,
      needTelegram: false, needBackup: true, reason: 'change', retry: { backup: { tries: 12, firstFailAt: now - 8 * 86400e3, nextAt: now } }, tries: 12 }];
    const w = s.app.backupHealthWarning(now);
    ok(/^การสำรองขึ้น Drive หยุดแล้ว — กด ลองใหม่ ที่ ตั้งค่า → งานคลาวด์ที่หยุดส่ง/.test(w), w);
    const msg = s.app.buildShiftReportMessage({ startTime: now - 3600e3, endTime: now, startCash: 0, expected: 0, counted: 0, difference: 0,
      cashSales: 0, expenses: 0, transactions: [], expenseItems: [] });
    ok(/การสำรองขึ้น Drive หยุดแล้ว/.test(msg), 'Telegram ปิดกะต้องบอกว่าหยุดแล้ว');
    // ยังไม่ถึงเกณฑ์หยุด → ข้อความเดิม "ครั้งล่าสุดล้มเหลว"
    s.app.state.cloudOutbox[0].retry.backup = { tries: 2, firstFailAt: now - 3600e3, nextAt: now };
    ok(/ครั้งล่าสุดล้มเหลว/.test(s.app.backupHealthWarning(now)), s.app.backupHealthWarning(now));
    s.app.state.cloudOutbox = [];
  });
  s.env.ctx.fetch = realFetch;
  s.env.dispose();

  // ── ข้อ 53 ──
  await R.t('ข้อ 53 เจ้าของออกจากระบบระหว่างรอคำตอบ (คำขอที่ใช้รหัสเจ้าของ) → ผู้จัดการที่เข้าต่อไม่ได้รหัสเจ้าของไปด้วย', async () => {
    const gas = createGasEnv();
    const ownerKey = gas.setupOwnerKey();
    const s2 = await makeShop({ gas });
    try {
      const app = s2.app;
      app.requireLogin = Object.getPrototypeOf(app).requireLogin.bind(app);
      app.askOwnerKey = async () => ownerKey;
      const held = gas.hold(p => p && p.action === 'list_backups' && p.ownerKey);
      const p = app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true });
      for (let i = 0; i < 100 && held.count === 0; i++) await settle(10);
      eq(held.count, 1, 'คำขอที่มีรหัสกำลังเดินทาง');
      app.requireLogin();                        // เจ้าของกดล็อก / ออกอัตโนมัติ
      loginAs(app, 'manager');
      held.releaseAll();
      const d = await p; await settle(20);
      eq(d.status, 'success');
      eq(app._ownerKey || null, null, 'ต้องไม่จำรหัสเจ้าของไว้ให้ผู้จัดการ');
      let asked = 0; app.askOwnerKey = async () => { asked++; return null; };
      let err = null; try { await app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true }); } catch (e) { err = e.message; }
      eq(asked, 1, 'ผู้จัดการต้องถูกถามรหัสเอง');
      ok(/Owner key/.test(err || ''), err);
    } finally { s2.env.dispose(); }
  });
  await R.t('ข้อ 53 (ตัวควบคุม) เจ้าของยังอยู่ → จำรหัสไว้ใช้ต่อในรอบล็อกอินนี้ตามเดิม', async () => {
    const gas = createGasEnv();
    const ownerKey = gas.setupOwnerKey();
    const s2 = await makeShop({ gas });
    try {
      s2.app.askOwnerKey = async () => ownerKey;
      const d = await s2.app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true });
      eq(d.status, 'success'); eq(s2.app._ownerKey, ownerKey);
    } finally { s2.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
