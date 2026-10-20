// ตรวจทั้งระบบ 19 ต.ค. 2569 — งานแก้ฝั่ง Apps Script (implementer gas · 20 ต.ค. 2569)
// ข้อ 2 (ไฟล์สำรองผ่าน blob) · 17 (ตรวจรหัสก่อนล็อก + cache) · 21 (journal เสีย) · 40 (โฟลเดอร์สำรองถูกลบถาวร)
// ข้อ 41 (ทะเบียนเลขบิลแถวว่าง/ซ้ำ) · 42 (ข้อความที่ Sheets แปลงชนิด) · 67 (โค้ดค้าง) · 68 (เศษเล็ก) · 69 (ตัวจำลอง)
// Apps Script ตัวจริงบน gas_env (ไม่มีคำขอไป Google จริง) · POS_GAS_SRC=<v65> = ต้องตก (ยกเว้นข้อที่ติดป้าย "ควบคุม")
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const assert = require('assert/strict');
const vm = require('vm');
const { createGasEnv } = require('./gas_env');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '->', e && e.message ? String(e.message).split('\n')[0].slice(0, 300) : e); }
}
const DEV_A = 'dev-' + 'a'.repeat(32), DEV_B = 'dev-' + 'b'.repeat(32);
const raw = (g, body) => JSON.parse(g.ctx.doPost({ postData: { contents: body, length: Buffer.byteLength(body, 'utf8') } }));
const bkkText = (ms) => { const t = new Date(ms + 7 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`; };
const monthOf = (ms) => { const t = new Date(ms + 7 * 3600e3 - 6 * 3600e3); return String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + t.getUTCFullYear(); };
function bill(id, ms, over) {
  return Object.assign({ action: 'transaction', id, date: ms, dateTimeStr: bkkText(ms), monthKey: monthOf(ms), customerName: 'ลูกค้า',
    services: ['ตัดผม'], staffNames: ['เอ'], subtotal: 300, discount: 0, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 7,
    total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0, lines: [{ price: 300, netPrice: 300, vatable: false }] }, over || {});
}
const T0 = Date.parse('2026-10-05T12:00:00+07:00');
function bigBackup(nTx) {
  const note = 'ก'.repeat(700);   // 2,100 ไบต์ต่อบิล (ภาษาไทย 3 ไบต์/ตัว)
  const transactions = [];
  for (let i = 0; i < nTx; i++) transactions.push({ id: 'TX-' + (1790000000000 + i), total: 300, note });
  return { backupSchemaVersion: 3, services: [], staff: [], transactions };
}
function clockEnv(extra) {
  const clock = { now: Date.parse('2026-10-20T10:00:00+07:00') };
  const RD = Date;
  class D extends RD { constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); } static now() { return clock.now; } }
  const g = createGasEnv(Object.assign({ DateCtor: D, now: () => clock.now }, extra || {}));
  g.clock = clock;
  return g;
}

(async () => {
  console.log('\n--- ข้อ 2: ไฟล์สำรองเขียนผ่าน blob (เพดาน 50 MB แทน 10 MB) ---');
  await test('ตัวจำลอง (ข้อ 69): createFile แบบ 3 ช่องเกิน 10 MB โยน error · แบบ blob ผ่าน (ควบคุม)', async () => {
    const g = createGasEnv(); const f = g.DriveApp.createFolder('x'), big = 'x'.repeat(11 * 1024 * 1024);
    assert.throws(() => f.createFile('a.json', big, 'text/plain'), /larger than 10MB/);
    const file = f.createFile(g.ctx.Utilities.newBlob(big, 'text/plain', 'b.json'));
    assert.equal(file.getName(), 'b.json'); assert.equal(file.getMimeType(), 'text/plain'); assert.equal(file.getSize(), big.length);
  });
  await test('สำรอง 13 MB (ราว 6,000 บิล) สำเร็จ · ไฟล์เป็น JSON ไม่จัดหน้า · ชนิด text/plain · บอกขนาด/เพดานกลับมา', async () => {
    const g = createGasEnv(); g.post({ action: 'register_primary', deviceId: DEV_A });
    const data = bigBackup(6000), compact = JSON.stringify(data);
    assert.ok(Buffer.byteLength(compact) > 12 * 1024 * 1024, 'payload > 12 MB');
    const r = g.post({ action: 'backup', backupData: data });
    assert.equal(r.status, 'success', r.code + ' ' + String(r.message).slice(0, 120));
    const file = g.DriveApp.getFileById(r.details.fileId);
    assert.equal(file.getMimeType(), 'text/plain');
    assert.equal(file._content, compact, 'compact JSON (not pretty-printed)');
    assert.equal(r.details.sizeBytes, Buffer.byteLength(compact, 'utf8'));
    assert.equal(r.details.limitBytes, 30 * 1024 * 1024, 'effective limit = min(Drive blob 50 MB, request cap 30 MB)');
    assert.equal(r.details.verified, true); assert.equal(r.details.txCount, 6000);
  });
  await test('ไฟล์เก่าแบบจัดหน้า (รุ่นก่อน) ยังกู้ได้ · ไฟล์ใหม่ก็กู้ได้ (ควบคุม)', async () => {
    const g = createGasEnv(); const key = g.setupOwnerKey(); g.post({ action: 'register_primary', deviceId: DEV_A });
    const data = bigBackup(3);
    const r = g.post({ action: 'backup', backupData: data }); assert.equal(r.status, 'success');
    const folder = g.DriveApp.getFolderById(g.props.POS_BACKUP_FOLDER_ID);
    const old = folder.createFile('pos_backup_2026-09-01_10-00-00.json', JSON.stringify(data, null, 2), 'text/plain');
    for (const id of [old.getId(), r.details.fileId]) {
      const got = g.post({ action: 'get_backup', fileId: id, ownerKey: key });
      assert.equal(got.status, 'success', got.message); assert.deepEqual(got.details.backupData, data);
    }
  });
  await test('ลบไฟล์สำรองเก่าเกิน 90 วันยังหาไฟล์เจอ (ไฟล์ที่เขียนผ่าน blob เป็น text/plain · ควบคุม)', async () => {
    let fake = Date.now() - 200 * 86400e3;
    const g = createGasEnv({ now: () => fake }); g.post({ action: 'register_primary', deviceId: DEV_A });
    for (let i = 0; i < 12; i++) assert.equal(g.post({ action: 'backup', backupData: bigBackup(1) }).status, 'success');
    fake = Date.now();
    const r = g.post({ action: 'backup', backupData: bigBackup(1) });
    assert.equal(r.status, 'success');
    assert.ok(r.details.trashedOld >= 2, 'old files trashed: ' + r.details.trashedOld);
  });
  await test('ไฟล์ใหญ่เกินเพดาน → ข้อความไทยบอกว่าหยุดแล้วและต้องทำอะไร (รหัสเดิม BACKUP_WRITE_FAILED + tooLarge)', async () => {
    const g = createGasEnv(); g.post({ action: 'register_primary', deviceId: DEV_A });
    vm.runInContext('BACKUP_BLOB_LIMIT_BYTES_ = 2000', g.ctx);
    const r = g.post({ action: 'backup', backupData: bigBackup(3) });
    assert.equal(r.code, 'BACKUP_WRITE_FAILED'); assert.equal(r.details && r.details.tooLarge, true);
    assert.match(r.message, /ใหญ่เกิน/); assert.match(r.message, /หยุดแล้ว/);
    assert.equal(g.DriveApp._folders.Erotica_POS_Backups, undefined, 'nothing written');
  });

  console.log('\n--- ข้อ 17: ตรวจรหัสเชื่อมต่อก่อนรอล็อก · รหัสใน CacheService ---');
  await test('รหัสผิด → ไม่แตะล็อก · ไม่อ่าน Script Properties เกินการหารหัส (ครั้งต่อไปใน 1 นาทีไม่อ่านเลย)', async () => {
    const g = createGasEnv();
    assert.equal(g.post({ action: 'primary_status' }).status, 'success');   // เติม cache
    g.lockLog.length = 0; const p0 = g.propCalls.total;
    for (const action of ['transaction', 'backup', 'list_backups', 'claim_primary', 'primary_status']) {
      const r = raw(g, JSON.stringify({ action, secret: 'wrong', ownerKey: 'AAAA' }));
      assert.equal(JSON.stringify(r), JSON.stringify({ status: 'error', message: 'ไม่ได้รับอนุญาต (unauthorized)', code: 'UNAUTHORIZED' }));
    }
    assert.equal(g.lockLog.length, 0, 'waitLock calls: ' + g.lockLog.join(','));
    assert.equal(g.propCalls.total - p0, 0, 'Script Properties calls: ' + (g.propCalls.total - p0));
  });
  await test('cache ว่าง: รหัสผิดอ่าน Script Properties แค่ค่ารหัส 1 ครั้ง · ไม่มีอะไรเกิดตอนถือล็อก', async () => {
    const g = createGasEnv(); g.lockLog.length = 0; const p0 = g.propCalls.total, k0 = g.propCalls.keys.POS_API_TOKEN || 0;
    const r = raw(g, JSON.stringify({ action: 'transaction', secret: 'x'.repeat(32) }));
    assert.equal(r.code, 'UNAUTHORIZED'); assert.equal(g.lockLog.length, 0);
    assert.equal(g.propCalls.total - p0, 1); assert.equal((g.propCalls.keys.POS_API_TOKEN || 0) - k0, 1);
    assert.equal(g.propCalls.underLock, 0);
  });
  await test('ข้อความ/รหัส TOKEN_NOT_SET และ BUSY เหมือนเดิมทุกตัวอักษร (ควบคุม)', async () => {
    const g = createGasEnv(); delete g.props.POS_API_TOKEN;
    assert.equal(JSON.stringify(raw(g, JSON.stringify({ secret: g.token, action: 'primary_status' }))),
      JSON.stringify({ status: 'error', message: 'ยังไม่ได้ตั้งรหัสเชื่อมต่อ POS — ให้รัน setupPosApiToken() ใน Apps Script ก่อน', code: 'TOKEN_NOT_SET' }));
    g.setupToken(); g.faults.waitLock = true;
    assert.equal(JSON.stringify(raw(g, JSON.stringify({ secret: g.token, action: 'primary_status' }))),
      JSON.stringify({ status: 'error', message: 'ระบบหนาแน่น กรุณาลองใหม่', code: 'BUSY' }));
    delete g.faults.waitLock;
    const bad = raw(g, '{"secret": "x", ');
    assert.equal(bad.code, 'SERVER_ERROR'); assert.match(bad.message, /^ข้อผิดพลาด: SyntaxError/);
    assert.equal(JSON.stringify(raw(g, JSON.stringify({ secret: g.token, action: 'nope' })).code), '"INVALID_ACTION"');
  });
  await test('body เกิน 30 MB → ปฏิเสธก่อนแยกอ่าน (REQUEST_TOO_LARGE · ไม่แตะล็อก/Script Properties)', async () => {
    const g = createGasEnv(); g.lockLog.length = 0; const p0 = g.propCalls.total;
    const body = JSON.stringify({ secret: 'wrong', pad: 'x'.repeat(31 * 1024 * 1024) });
    const r = raw(g, body);
    assert.equal(r.code, 'REQUEST_TOO_LARGE'); assert.match(r.message, /ใหญ่เกิน 30 MB/);
    assert.equal(g.lockLog.length, 0); assert.equal(g.propCalls.total - p0, 0);
  });
  await test('rotatePosApiToken: รหัสใหม่ใช้ได้ทันที รหัสเก่าใช้ไม่ได้ทันที · setupPosApiToken เติม cache', async () => {
    const g = createGasEnv(); const old = g.token;
    assert.equal(g.post({ action: 'primary_status' }).status, 'success');
    const fresh = g.ctx.rotatePosApiToken();
    assert.equal(raw(g, JSON.stringify({ secret: old, action: 'primary_status' })).code, 'UNAUTHORIZED');
    assert.equal(raw(g, JSON.stringify({ secret: fresh, action: 'primary_status' })).status, 'success');
    assert.equal(g.ctx.setupPosApiToken(), fresh);
    const k0 = g.propCalls.keys.POS_API_TOKEN || 0;
    assert.equal(raw(g, JSON.stringify({ secret: fresh, action: 'primary_status' })).status, 'success');
    assert.equal((g.propCalls.keys.POS_API_TOKEN || 0) - k0, 0, 'token served from the cache');
  });
  await test('เจ้าของแก้รหัสใน Script properties เอง (ไม่ได้รัน rotate) → รหัสใหม่ใช้ได้ภายใน 1 นาที', async () => {
    const g = clockEnv();
    assert.equal(g.post({ action: 'primary_status' }).status, 'success');
    const manual = 'M'.repeat(40);
    g.ctx.PropertiesService.getScriptProperties().setProperty('POS_API_TOKEN', manual);   // ผ่านหน้า Script properties (ไม่ล้าง cache)
    assert.equal(raw(g, JSON.stringify({ secret: manual, action: 'primary_status' })).code, 'UNAUTHORIZED', 'within the 60 s window');
    g.clock.now += 61 * 1000;
    assert.equal(raw(g, JSON.stringify({ secret: manual, action: 'primary_status' })).status, 'success');
    assert.equal(raw(g, JSON.stringify({ secret: g.token, action: 'primary_status' })).code, 'UNAUTHORIZED', 'old token stops after the re-read');
  });

  console.log('\n--- ข้อ 21: บันทึกงานเผยแพร่สรุปที่อ่านไม่ได้ ---');
  const dayPayload = (dateKey, gen, rev) => ({ action: 'summary_day', dateKey, generatedAt: gen, totalRevenue: rev, totalExpenses: 0, billCount: 1,
    cashRevenue: rev, qrRevenue: 0, creditRevenue: 0, nonVatBase: rev, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0,
    shiftCount: 0, cashVariance: 0, shiftCash: [], services: [{ name: 'ตัดผม', count: 1, revenue: rev }], expenses: [], staffCommissions: [] });
  await test('journal เสีย → สรุปยังส่งได้ (ไม่วน SERVER_ERROR) + จดใน Logger', async () => {
    const g = createGasEnv(); g.post({ action: 'register_primary', deviceId: DEV_A });
    g.props.POS_SUMMARY_PUBLISH = '{"v":1,"sheetName":';
    const r = g.post(dayPayload('2026-10-19', 1000, 300));
    assert.equal(r.status, 'success', r.code + ' ' + r.message);
    assert.ok(g.logs.some(l => /อ่านไม่ได้/.test(l)), 'logged');
    assert.equal(g.props.POS_SUMMARY_PUBLISH, undefined, 'journal cleared after the publish');
  });

  console.log('\n--- ข้อ 40: โฟลเดอร์สำรองถูกลบถาวร ---');
  await test('ล้างถังขยะแล้ว → BACKUP_FOLDER_MISSING + บอกให้รัน resetPosBackupFolder · รันแล้วสำรองครั้งถัดไปสร้างโฟลเดอร์ใหม่', async () => {
    const g = createGasEnv(); const key = g.setupOwnerKey(); g.post({ action: 'register_primary', deviceId: DEV_A });
    assert.equal(g.post({ action: 'backup', backupData: bigBackup(1) }).status, 'success');
    const firstId = g.props.POS_BACKUP_FOLDER_ID;
    assert.equal(g.ctx.resetPosBackupFolder().includes('ยังใช้ได้'), true, 'healthy folder is kept');
    assert.equal(g.props.POS_BACKUP_FOLDER_ID, firstId);
    assert.equal(g.purgeFolder('Erotica_POS_Backups'), true);
    const r = g.post({ action: 'backup', backupData: bigBackup(1) });
    assert.equal(r.code, 'BACKUP_FOLDER_MISSING'); assert.match(r.message, /resetPosBackupFolder/); assert.match(r.message, /ลบถาวร/);
    assert.equal(g.post({ action: 'list_backups', ownerKey: key }).code, 'BACKUP_FOLDER_MISSING');
    assert.equal(g.ctx.resetPosBackupFolder.length, 0, 'no argument (Run button in the editor)');
    assert.match(g.ctx.resetPosBackupFolder(), /ล้างค่า/);
    assert.equal(g.props.POS_BACKUP_FOLDER_ID, undefined);
    const again = g.post({ action: 'backup', backupData: bigBackup(1) });
    assert.equal(again.status, 'success'); assert.notEqual(g.props.POS_BACKUP_FOLDER_ID, firstId);
  });
  await test('Drive ล่มชั่วคราว (ไม่ใช่หาไม่เจอ) → ไม่บอกให้รีเซ็ต (ข้อความเดิม · ควบคุม)', async () => {
    const g = createGasEnv(); g.post({ action: 'register_primary', deviceId: DEV_A });
    assert.equal(g.post({ action: 'backup', backupData: bigBackup(1) }).status, 'success');
    const real = g.DriveApp.getFolderById; g.DriveApp.getFolderById = () => { throw new Error('Service error: Drive'); };
    const r = g.post({ action: 'backup', backupData: bigBackup(1) });
    g.DriveApp.getFolderById = real;
    assert.equal(r.code, 'BACKUP_WRITE_FAILED'); assert.match(r.message, /เปิดโฟลเดอร์สำรองที่ตั้งไว้ไม่ได้/);
  });

  console.log('\n--- ข้อ 41: ทะเบียนเลขบิล (_POS_BILL_INDEX) แถวว่าง / เลขซ้ำ ---');
  const fourBills = () => [0, 1, 2, 3].map(i => bill('TX-IDX-' + i + '-ABCDEF', T0 + i * 3600e3));
  await test('แถวทะเบียนว่าง 2 แถว ไม่ขวางการย้ายเครื่องหลัก', async () => {
    const g = createGasEnv(); const key = g.setupOwnerKey(); const bs = fourBills();
    bs.forEach(b => assert.equal(g.post(Object.assign({}, b, { deviceId: DEV_A })).status, 'success'));
    const idx = g.sheet('_POS_BILL_INDEX'); idx._grid[1] = idx._grid[1].map(() => ''); idx._grid[2] = idx._grid[2].map(() => '');
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: bs.map(b => Object.assign({}, b, { action: undefined })) });
    assert.equal(r.status, 'success', r.code + ' ' + r.message);
  });
  await test('เลขซ้ำจริงในทะเบียน → REGISTRY_CORRUPT บอกเลขบิล (ย้ายเครื่อง + ส่งบิลซ้ำ) ไม่ใช่ SERVER_ERROR', async () => {
    const g = createGasEnv(); const key = g.setupOwnerKey(); const bs = fourBills();
    bs.forEach(b => g.post(Object.assign({}, b, { deviceId: DEV_A })));
    const idx = g.sheet('_POS_BILL_INDEX'); idx._grid.push(idx._grid[2].slice());
    const dupId = idx._grid[2][0];
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: bs });
    assert.equal(r.code, 'REGISTRY_CORRUPT'); assert.equal(r.details.billId, dupId); assert.match(r.message, /ทะเบียนเลขบิล/);
    assert.equal(g.ctx.readPrimaryDevice_().id, DEV_A, 'primary unchanged');
    const t = g.post(Object.assign({}, bs.find(b => b.id === dupId), { deviceId: DEV_A }));
    assert.equal(t.code, 'REGISTRY_CORRUPT'); assert.equal(t.details.scope, 'bill'); assert.equal(t.details.billId, dupId);
    assert.match(t.message, /_POS_BILL_INDEX/);
  });

  console.log('\n--- ข้อ 42: ข้อความที่ Sheets แปลงชนิด ---');
  await test('safeCell เติม \' ให้ ".5" "10-2026" "1 1/2" "#N/A" "-.25" "3/2026" (ข้อความธรรมดาไม่แตะ)', async () => {
    const g = createGasEnv();
    for (const s of ['.5', '10-2026', '1 1/2', '#N/A', '#REF!', '-.25', '3/2026', '.5%']) assert.equal(g.ctx.safeCell(s), "'" + s, s);
    for (const s of ['ตัดผม', 'คุณ 5', 'A.5', '10-20 นาที']) assert.equal(g.ctx.safeCell(s), s, s);
  });
  await test('ชื่อลูกค้า/บริการแบบนั้นกลับมาจากชีตเป็นข้อความเดิม (list_bills · ตัวจำลองแปลงชนิดแบบ Sheets)', async () => {
    const g = createGasEnv({ coerceMonthYear: true, coerceFractions: true }); const key = g.setupOwnerKey();
    const names = ['.5', '10-2026', '1 1/2', '#N/A'];
    names.forEach((n, i) => assert.equal(g.post(Object.assign(bill('TX-NAME-' + i + '-ABCDEF', T0 + i * 60e3, { customerName: n, services: [n] }),
      { deviceId: DEV_A })).status, 'success'));
    const r = g.post({ action: 'list_bills', monthKey: '10-2026', ownerKey: key });
    assert.equal(r.status, 'success', r.message);
    names.forEach((n, i) => { const b = r.details.bills.find(x => x.id === 'TX-NAME-' + i + '-ABCDEF');
      assert.equal(b.customer, n, 'customer ' + n); assert.equal(b.services, n, 'services ' + n); });
  });

  console.log('\n--- ข้อ 67 / 68: โค้ดค้างและเศษเล็ก ---');
  await test('billSheetHasVatColumns_ ถูกลบ (ไม่มีใครเรียก/ไม่มีเทสต์ใช้)', async () => {
    const g = createGasEnv(); assert.equal(typeof g.ctx.billSheetHasVatColumns_, 'undefined');
  });
  await test('ยกเลิกบิลที่เดือนไม่ถูกต้อง → มีรหัส INVALID_MONTH (ข้อความเดิม)', async () => {
    const g = createGasEnv(); g.post({ action: 'register_primary', deviceId: DEV_A });
    const r = g.post({ action: 'void_transaction', id: 'TX-OLD-ABCDEF', monthKey: '01-1970', voidedAt: Date.now() });
    assert.equal(r.code, 'INVALID_MONTH'); assert.equal(r.message, 'เดือนของบิลไม่ถูกต้อง (01-1970) — ตรวจสอบวันที่ของบิลใบนี้');
  });
  await test('exportVoidRegistryForRollback รวมทะเบียนในแท็บ _POS_VOID_ARCHIVE และล้างธงย้ายทะเบียน', async () => {
    const g = createGasEnv();
    g.props['POSVB_TX-HOT-ABCDEF'] = JSON.stringify({ v: 1790000000000, r: 0, w: Date.now() });
    const arch = g.ss.insertSheet('_POS_VOID_ARCHIVE'); arch.appendRow(['id', 'voidedAt', 'restoredAt']);
    arch.appendRow(['TX-ARCHIVED-ABCDEF', 1780000000000, 0]); arch.appendRow(['TX-RESTORED-ABCDEF', 1780000000000, 1780000001000]);
    g.props.POS_VOIDED_MIGRATED_V2 = '1';
    g.ctx.exportVoidRegistryForRollback();
    const map = JSON.parse(g.props.POS_VOIDED_BILLS);
    assert.equal(map['TX-HOT-ABCDEF'], 1790000000000); assert.equal(map['TX-ARCHIVED-ABCDEF'], 1780000000000);
    assert.equal(map['TX-RESTORED-ABCDEF'], -1780000001000);
    assert.equal(g.props.POS_VOIDED_MIGRATED_V2, undefined);
  });
  await test('รหัสรุ่นสรุปใน Script Properties ที่เก่าเกิน 400 วันถูกลบ · ที่ยังใหม่อยู่ครบและยังกันคำขอเก่าได้', async () => {
    const g = createGasEnv({ keepDailyRetention: true }); g.post({ action: 'register_primary', deviceId: DEV_A });
    const now = Date.now(), day = 86400e3;
    g.props['POS_SUMSTAMP_สรุป-2024-01-05'] = String(now - 500 * day);
    g.props['POS_SUMSTAMP_สรุป-2025-08-01'] = String(now - 100 * day);
    g.props['POS_SUMSTAMP_สรุป-2024-02-01'] = 'อ่านไม่ได้';
    g.props['POS_SUMSTAMP_สรุป-2024-03-01'] = String(now - 10 * day);   // วันเก่า แต่เพิ่งแก้บิลวันนั้น → ยังกันคำขอเก่า
    g.props['POS_SUMSTAMP_สรุป-2026-08-01'] = '500';                    // วันยังไม่ถึง 400 วัน → ไม่ลบไม่ว่าค่าเป็นอะไร
    const old = new Date(now - 70 * day), key = old.toISOString().slice(0, 10);
    const r = g.post(dayPayload(key, now, 500));
    assert.equal(r.status, 'success', r.message);
    assert.equal(g.props['POS_SUMSTAMP_สรุป-2024-01-05'], undefined, 'pruned');
    assert.ok(g.props['POS_SUMSTAMP_สรุป-2025-08-01'], 'kept'); assert.equal(g.props['POS_SUMSTAMP_สรุป-2024-02-01'], 'อ่านไม่ได้', 'evidence kept');
    assert.ok(g.props['POS_SUMSTAMP_สรุป-2024-03-01'], 'recent stamp of an old day kept'); assert.equal(g.props['POS_SUMSTAMP_สรุป-2026-08-01'], '500');
    assert.equal(g.props['POS_SUMSTAMP_สรุป-' + key], String(now));
    const stale = g.post(dayPayload(key, now - 1000, 400));
    assert.equal(stale.code, 'STALE_SUMMARY');
  });

  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); console.log('\n=== ผ่าน 0 · ไม่ผ่าน 1 ==='); process.exit(1); });
