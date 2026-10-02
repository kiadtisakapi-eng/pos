// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 2 (ข้อ 4–6) — ทดสอบบน IndexedDB จริง (fake-indexeddb + Dexie ของแอป)
//  และ Apps Script ตัวจริงที่รันใน vm (tests/gas_env.js) ต่อกันผ่าน fetch จำลอง
//
//  ข้อ 4: สิทธิ์ต้องบังคับที่ตัวทำงาน ไม่ใช่ที่ปุ่ม · คำสั่งสำคัญฝั่งเซิร์ฟเวอร์ใช้รหัสเจ้าของ
//  ข้อ 5: กู้/นำเข้า/ย้อน ต้องไม่ทำให้ข้อมูลที่เกิดระหว่างรอหายไป · งานคลาวด์ของชุดเก่าต้องหยุด
//  ข้อ 6: ข้อมูลเงินที่เชื่อไม่ได้ → แยกตรวจ (เก็บต้นฉบับ) ไม่ใช่ 0 · ไม่ส่งขึ้นคลาวด์ · ไฟล์สำรองต้องตรวจก่อนนับ
//
//  สิ่งที่ stub: เฉพาะงานวาดหน้าจอ/หน้าต่างยืนยัน/ช่องกรอกรหัส (UI) — ไม่ stub ฟังก์ชันที่กำลังพิสูจน์
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 2: สิทธิ์ · กู้ข้อมูล · ตรวจข้อมูลเงิน (ฐานข้อมูลจริง + Apps Script จริง) ---');
const t = R.t;

// ทั้งหัวข้อล้มกลางทาง (เช่นรันกับโค้ดรุ่นก่อนแก้ที่ยังไม่มีฟังก์ชันนั้น) → นับเป็นไม่ผ่าน แล้วทำหัวข้อถัดไปต่อ
// หัวข้อที่ค้าง (เช่นโค้ดรุ่นก่อนแก้ที่รอเนื้อคำตอบตลอดไป) ต้องนับเป็นไม่ผ่านภายในเวลา ไม่ใช่ทำให้ทั้งไฟล์ค้าง
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const snapshotDb = async (env) => { const all = await env.rawAll(); delete all.session; return JSON.stringify(all); };
const d = (s) => new Date(s).getTime();

function validBackup(bills, extra) {
  return Object.assign({
    backupSchemaVersion: 3, createdAt: new Date().toISOString(),
    services: [{ id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }],
    categories: [{ id: 'barber', name: 'ตัดผม', vat: false }],
    staff: [{ id: 'st-1', name: 'เอ', accessLevel: 'staff' }],
    customers: [], queue: [], voidLog: [], expenseLog: [], editLog: [],
    transactions: bills || [],
    shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] }
  }, extra || {});
}
// บิลรุ่นปัจจุบันที่ยอดลงตัว (ไม่มี VAT)
function bill(id, date, total, over) {
  return Object.assign({ id, date, customerName: 'ลูกค้า', services: ['ตัดผม'],
    details: [{ name: 'ตัดผม', price: total, netPrice: total, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: total / 10, category: 'barber', vatable: false }],
    subtotal: total, discount: 0, vatRate: 7, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total,
    cashReceived: total, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' }, over || {});
}

// ข้อมูลร้านสำหรับเทสต์สิทธิ์: มีบิล 1 ใบ + หมวดว่าง 1 หมวด (ลบได้จริงถ้ามีสิทธิ์)
const authRows = () => ({
  shopLogo: 'data:image/png;base64,iVBORw0KGgo=',
  transactions: [bill('TX-1757000000000-AAAAAAAA', Date.now() - 60e3, 300)],
  categories: [{ id: 'barber', name: 'ตัดผม', vat: false }, { id: 'drinks', name: 'เครื่องดื่ม', vat: true }, { id: 'spare', name: 'ว่าง', vat: false }]
});

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4.1] คำสั่งเปลี่ยนข้อมูลที่ต้องใช้สิทธิ์สูง — เรียกตรงจากบทบาทที่ไม่มีสิทธิ์ ต้องไม่เปลี่ยนอะไรในเครื่อง');
// ═══════════════════════════════════════════════════════════════════════════
const attempts = [
  ['บันทึกค่าตั้งค่าร้าน (saveShopSettings)', ['staff', 'manager', null], async (app, env) => {
    env.document.getElementById('shop-name-input').value = 'ร้านถูกแก้';
    await app.saveShopSettings(); }],
  ['เปิด/ปิด VAT (saveVatSettings)', ['staff', 'manager', null], async (app, env) => {
    env.document.getElementById('vat-enabled').checked = false; env.document.getElementById('vat-rate').value = '7';
    await app.saveVatSettings(); }],
  ['เพิ่มบริการ (addService)', ['staff', 'manager', null], async (app, env) => {
    const v = { 'serv-name': 'แอบเพิ่ม', 'serv-price': '1', 'serv-duration': '1', 'serv-category': 'barber', 'serv-commission': '90', 'serv-commission-type': 'percent' };
    Object.keys(v).forEach(k => { env.document.getElementById(k).value = v[k]; });
    await app.addService(); }],
  ['ลบบริการ (deleteService)', ['staff', 'manager', null], async (app) => { app.deleteService('s1'); await app._confirmP; }],
  ['ลบพนักงาน (deleteStaff)', ['staff', 'manager', null], async (app) => { app.deleteStaff('st-1'); await app._confirmP; }],
  ['ลบหมวด (deleteCategory)', ['staff', 'manager', null], async (app) => { app.deleteCategory('spare'); await app._confirmP; }],
  ['ลบโลโก้ (removeLogo)', ['staff', 'manager', null], async (app) => { await app.removeLogo(); }],
  ['ล้างยอดขาย (clearSalesData)', ['staff', 'manager', null], async (app, env) => {
    env.ctx.prompt = () => 'ล้างยอดขาย';   // รอบตรวจ 6 ข้อ 1: ต้องพิมพ์คำยืนยัน (+ สำรองขึ้น Drive จำลองก่อนล้าง)
    await app.clearSalesData(); await app._confirmP; }],
  ['แทนข้อมูลทั้งร้าน (applyBackupData)', ['staff', 'manager', null], async (app) => {
    await app.applyBackupData(validBackup([])).catch(() => {}); }],
  ['แก้บิล (saveTransactionEdit)', ['staff', 'manager', null], async (app, env) => {
    env.document.getElementById('edit-tx-id').value = 'TX-1757000000000-AAAAAAAA';
    // ฟอร์มต้องมีค่าเหมือนหน้าจอจริง (ช่องทางจ่ายเลือกไว้เสมอ) — ตั้งแต่ข้อ 16/17 ช่องทางว่าง = ปฏิเสธ
    // และกดบันทึกโดยไม่เปลี่ยนอะไร = ไม่แก้บิล จึงต้องเปลี่ยนชื่อลูกค้าให้เป็นการแก้จริง
    env.document.getElementById('edit-tx-customer').value = 'ชื่อที่แก้';
    env.document.getElementById('edit-tx-payment').value = 'cash';
    app._editTxDraft = { txId: 'TX-1757000000000-AAAAAAAA', details: [] };
    await app.saveTransactionEdit(); }],
  ['ยกเลิกบิล (voidTransaction)', ['staff', null], async (app, env) => {
    env.document.getElementById('edit-tx-id').value = 'TX-1757000000000-AAAAAAAA';
    env.document.getElementById('void-money-outcome').value = 'refunded';   // ข้อ 16: ต้องระบุก่อนว่าเงินเคลื่อนไหวจริงไหม
    await app.voidTransaction(); await app._confirmP; }],
  ['ปิดกะ (confirmCashCount close)', ['staff', null], async (app) => { app.cashCounterMode = 'close'; await app.confirmCashCount(); }],
];
for (const [label, roles, run] of attempts) {
  for (const role of roles) {
    const { env, app } = await makeShop({ rows: authRows() });
    await settle();
    loginAs(app, role);
    const before = await snapshotDb(env);
    try { await run(app, env); } catch (e) { /* ปฏิเสธด้วย error ก็ได้ ขอแค่ไม่เขียน */ }
    await settle(30);
    await t(`${label} โดย ${role || 'ยังไม่ล็อกอิน'} → ข้อมูลในเครื่องไม่เปลี่ยน`, async () => eq(await snapshotDb(env), before));
    env.dispose();
  }
}

// ตัวควบคุมฝั่งบวก: เรียกแบบเดียวกันด้วยเจ้าของร้าน "ต้องเปลี่ยนข้อมูลจริง"
// (ถ้าไม่เปลี่ยน แปลว่าเทสต์ข้างบนไม่ได้แตะทางเขียนจริง — ผ่านแบบไร้ความหมาย)
for (const [label, , run] of attempts) {
  const { env, app } = await makeShop({ rows: authRows() });
  await settle();
  loginAs(app, 'owner');
  const before = await snapshotDb(env);
  try { await run(app, env); } catch (e) { /* ไม่สน */ }
  await settle(30);
  await t(`(ตัวควบคุม) ${label} โดยเจ้าของร้าน → ข้อมูลในเครื่องเปลี่ยนจริง`, async () => ok((await snapshotDb(env)) !== before, 'เรียกแล้วไม่มีอะไรเปลี่ยน — เทสต์ไม่ได้แตะทางเขียนจริง'));
  env.dispose();
}

console.log('\n[4.2] บทบาทที่มีสิทธิ์ยังทำงานได้ตามเดิม (ด่านสิทธิ์ต้องไม่บล็อกงานจริง)');
await section('[4.2]', async () => {
  const { env, app } = await makeShop({ rows: { transactions: [bill('TX-1757000000000-AAAAAAAA', Date.now() - 60e3, 300)] } });
  await settle();
  loginAs(app, 'manager');
  env.document.getElementById('edit-tx-id').value = 'TX-1757000000000-AAAAAAAA';
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(30);
  await t('ผู้จัดการยกเลิกบิลได้ (ลงเครื่องจริง)', async () => eq((await env.raw('transactions')).length, 0));
  await t('ประวัติการยกเลิกบันทึกชื่อผู้จัดการ', async () => eq((await env.raw('voidLog'))[0].by, 'บี'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4.3] Apps Script: คำสั่งที่เปิดข้อมูลทั้งร้านต้องใช้รหัสเจ้าของ — ไม่เชื่อ role ที่ client ส่งมา');
// ═══════════════════════════════════════════════════════════════════════════
await section('[4.3]', async () => {
  const gas = createGasEnv();
  const noKey = gas.post({ action: 'list_backups' });
  await t('ยังไม่ได้ตั้งรหัสเจ้าของ → ปฏิเสธ (fail-closed) และบอกวิธีตั้ง', () => {
    eq(noKey.code, 'OWNER_KEY_NOT_CONFIGURED'); ok(/setupPosOwnerKey/.test(noKey.message)); });
  const key = gas.setupOwnerKey();
  for (const action of ['list_backups', 'get_backup', 'list_bills']) {
    const r = gas.post({ action, role: 'owner', isOwner: true, currentRole: 'owner', fileId: 'x', monthKey: '09-2026' });
    await t(`${action}: ส่ง role:'owner' มาเองแต่ไม่มีรหัส → ปฏิเสธ`, () => eq(r.code, 'OWNER_KEY_REQUIRED'));
  }
  await t('รหัสผิด → OWNER_KEY_INVALID', () => eq(gas.post({ action: 'list_backups', ownerKey: 'AAAA-BBBB' }).code, 'OWNER_KEY_INVALID'));
  await t('รหัสถูก (พิมพ์ตัวเล็ก/ไม่มีขีดก็ได้) → ผ่าน', () =>
    eq(gas.post({ action: 'list_backups', ownerKey: key.toLowerCase().replace(/-/g, '') }).status, 'success'));
  for (let i = 0; i < 5; i++) gas.post({ action: 'list_backups', ownerKey: 'WRONG-' + i });
  await t('ผิดติดกัน 5 ครั้ง → ต้องรอสักครู่ แม้รอบถัดไปใส่รหัสถูก', () => eq(gas.post({ action: 'list_backups', ownerKey: key }).code, 'OWNER_KEY_LOCKED'));
  await t('ช่วงรอไม่เกิน 1 นาที (ไม่ล็อกยาว 15 นาทีแบบเดิม)', () => {
    const f = JSON.parse(gas.props.POS_OWNER_KEY_FAILS); ok(Number(f.until) - Date.now() <= 60 * 1000, JSON.stringify(f)); });
  const fails = JSON.parse(gas.props.POS_OWNER_KEY_FAILS); fails.until = Date.now() - 1; gas.props.POS_OWNER_KEY_FAILS = JSON.stringify(fails);
  await t('พ้นช่วงรอ → รหัสถูกใช้ได้อีกครั้ง', () => eq(gas.post({ action: 'list_backups', ownerKey: key }).status, 'success'));
  const key2 = gas.ctx.rotatePosOwnerKey();
  await t('ออกรหัสใหม่ → รหัสเก่าใช้ไม่ได้ทันที', () => eq(gas.post({ action: 'list_backups', ownerKey: key }).code, 'OWNER_KEY_INVALID'));
  await t('รหัสใหม่ใช้ได้', () => eq(gas.post({ action: 'list_backups', ownerKey: key2 }).status, 'success'));
  await t('รหัสเจ้าของไม่ถูกเก็บเป็นข้อความตรง ๆ ใน Script Properties', () =>
    ok(!Object.values(gas.props).some(v => String(v).replace(/-/g, '').includes(key2.replace(/-/g, ''))), 'พบรหัสในที่เก็บ'));
  await t('คำสั่งขายบิล (ใช้รหัสเชื่อมต่ออย่างเดียว) ยังทำงานได้โดยไม่ต้องใช้รหัสเจ้าของ', () => {
    const r = gas.post({ action: 'transaction', id: 'TX-1757000000000-BBBBBBBB', date: d('2026-09-10T12:00:00+07:00'),
      monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00', customerName: 'x', services: ['ตัดผม'],
      subtotal: 300, discount: 0, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300, paymentMethod: 'cash', staffNames: ['เอ'] });
    eq(r.status, 'success', JSON.stringify(r)); });
});

console.log('\n[4.4] แอป ↔ Apps Script: ถามรหัสเจ้าของเมื่อจำเป็น · จำไว้แค่รอบล็อกอินนี้ · ออกจากระบบแล้วลืมทันที');
await section('[4.4]', async () => {
  const { env, app, gas } = await makeShop();
  const key = gas.setupOwnerKey();
  let asked = 0;
  app.askOwnerKey = async () => { asked++; return key; };   // ช่องกรอกรหัสบนหน้าจอ (UI) — ตอบแทนเจ้าของ
  const r1 = await app.cloudPost('list_backups', {}, 5000, { owner: true });
  await t('ครั้งแรก: ถูกถามรหัส 1 ครั้ง แล้วสำเร็จ', () => { eq(r1.status, 'success'); eq(asked, 1); });
  const r2 = await app.cloudPost('list_backups', {}, 5000, { owner: true });
  await t('ครั้งถัดไปในรอบล็อกอินเดียวกัน: ไม่ถามซ้ำ', () => { eq(r2.status, 'success'); eq(asked, 1); });
  await t('รหัสเจ้าของไม่ถูกเขียนลงฐานข้อมูลในเครื่อง', async () => ok(!JSON.stringify(await env.rawAll()).includes(key), 'พบรหัสใน IndexedDB'));
  app.requireLogin();
  loginAs(app, 'owner');
  await app.cloudPost('list_backups', {}, 5000, { owner: true });
  await t('ออกจากระบบแล้วล็อกอินใหม่ → ต้องกรอกรหัสใหม่', () => eq(asked, 2));
  app.askOwnerKey = async () => null;   // กดยกเลิก
  app.requireLogin(); loginAs(app, 'owner');
  let err = null; try { await app.cloudPost('list_backups', {}, 5000, { owner: true }); } catch (e) { err = e; }
  await t('กดยกเลิกช่องกรอกรหัส → คำสั่งไม่ทำงาน และบอกเหตุผล', () => ok(err && /รหัสเจ้าของ/.test(err.message), err && err.message));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5.1] ขายระหว่างรอดาวน์โหลดไฟล์สำรอง → บิลนั้นต้องอยู่ในสำเนาก่อนกู้ และย้อนกลับได้');
// ═══════════════════════════════════════════════════════════════════════════
const B1 = 'TX-1756000000000-BACKUPAA', B2 = 'TX-1756000000000-BACKUPBB';
const backupTwo = () => validBackup([bill(B1, d('2026-09-01T12:00:00+07:00'), 300), bill(B2, d('2026-09-01T13:00:00+07:00'), 500)]);
async function ownerKeyReady(app, gas) {
  if (typeof app.cloudPost !== 'function') { gas.ctx.OWNER_KEY_ACTIONS = {}; return; }   // โค้ดรุ่นก่อนแก้ (ใช้พิสูจน์บั๊ก)
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;
}
await section('[5.1]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  await ownerKeyReady(app, gas);
  const up = gas.post({ action: 'backup', backupData: backupTwo() });
  const hold = gas.hold(b => b && b.action === 'get_backup');
  app.restoreFromDriveBackup(up.details.fileId, 'ทดสอบ');
  const restoreP = app._confirmP;
  await settle(40);
  await t('(เงื่อนไขเทสต์) คำขอดาวน์โหลดไฟล์ถูกกักไว้จริง', () => eq(hold.count, 1));
  readyCheckout(env);
  await app.processCheckout();
  const sale = app.state.transactions.find(x => x.id !== B1 && x.id !== B2);
  await t('บิลที่ขายระหว่างรอ ลงเครื่องแล้ว', async () => ok(sale && (await env.raw('transactions')).some(x => x.id === sale.id)));
  hold.releaseAll();
  await restoreP; await settle(60);
  const raw = await env.rawAll();
  await t('หลังกู้: บิลในเครื่อง = บิลในไฟล์สำรอง', () => eq(raw.transactions.map(x => x.id).sort(), [B1, B2]));
  await t('สำเนาก่อนกู้ (ในเครื่อง) มีบิลที่ขายระหว่างรอดาวน์โหลด', () =>
    ok(raw.preRestoreSnapshot && raw.preRestoreSnapshot.data.transactions.some(x => x.id === sale.id), 'บิลหายจากสำเนา = หายถาวร'));
  await app.undoLastRestore(); await app._confirmP; await settle(60);
  await t('กดย้อนกลับ → บิลที่ขายระหว่างรอกลับมาอยู่ในเครื่อง', async () =>
    ok((await env.raw('transactions')).some(x => x.id === sale.id)));
  env.dispose();
});

console.log('\n[5.2] นำเข้าไฟล์พร้อมกับการขายที่ยังบันทึกไม่เสร็จ → บิลต้องไม่หายจากทั้งข้อมูลและสำเนา');
await section('[5.2]', async () => {
  const { env, app } = await makeShop();
  await settle();
  env.ctx.FileReader = class { readAsText(f) { setTimeout(() => this.onload({ target: { result: f._text } }), 0); } };
  readyCheckout(env);
  const pSale = app.processCheckout();            // ยังไม่รอ — งานบันทึกค้างอยู่
  app.importData({ target: { files: [{ _text: JSON.stringify(backupTwo()) }], value: 'x' } });
  await pSale; await settle(30); await app._confirmP; await settle(60);
  const raw = await env.rawAll();
  const saleIds = (raw.preRestoreSnapshot ? raw.preRestoreSnapshot.data.transactions : []).map(x => x.id)
    .concat(raw.transactions.map(x => x.id)).filter(id => id !== B1 && id !== B2);
  await t('บิลที่ขายอยู่ในข้อมูลหรือในสำเนาก่อนนำเข้า (ไม่หายทั้งสองที่)', () => eq(saleIds.length, 1));
  env.dispose();
});

console.log('\n[5.3] งานคลาวด์ที่กำลังส่งตอนกู้ข้อมูล → งานของข้อมูลชุดเก่าต้องหยุด ไม่ยิงต่อหลังกู้');
await section('[5.3]', async () => {
  const V1 = 'TX-1755000000000-VOIDVOD1', V2 = 'TX-1755000000000-VOIDVOD2';
  const vd = (id) => ({ id: 'cob-' + id, createdAt: Date.now(), dateKeys: [], monthKeys: [], needVoidDelete: true,
    voidDelete: { id, monthKey: '09-2026', date: d('2026-09-01T12:00:00+07:00'), clientTs: Date.now() - 1000 },
    needSummary: false, needTelegram: false, telegramMessage: '', tries: 0, rev: 0 });
  const { env, app, gas } = await makeShop({ noInit: true, rows: { cloudOutbox: [vd(V1), vd(V2)] } });
  loginAs(app, 'owner');
  const hold = gas.hold(b => b && b.action === 'void_transaction' && b.id === V1);
  const flushP = app.flushCloudOutbox();
  await settle(40);
  await t('(เงื่อนไขเทสต์) คำสั่งลบบิลใบแรกค้างอยู่ระหว่างทาง', () => eq(hold.count, 1));
  // กู้ไฟล์ที่ V2 ยังเป็นบิลใช้งานอยู่
  await app.applyBackupData(validBackup([bill(V2, d('2026-09-01T12:00:00+07:00'), 300)]));
  hold.releaseAll();
  await flushP; await settle(80);
  const sentV2Delete = gas.requests.some(r => r && r.action === 'void_transaction' && r.id === V2);
  await t('คำสั่งลบบิลของข้อมูลชุดเก่า (V2) ไม่ถูกส่งหลังกู้ข้อมูลที่ V2 ยังใช้งานอยู่', () => ok(!sentV2Delete, 'ส่งคำสั่งลบบิลที่ข้อมูลชุดใหม่ยังใช้อยู่'));
  await t('บิล V2 ในข้อมูลชุดใหม่ยังอยู่ในเครื่อง', async () => ok((await env.raw('transactions')).some(x => x.id === V2)));
  env.dispose();
});

console.log('\n[5.4] หลังกู้ข้อมูล ระบบส่งบิลของข้อมูลชุดใหม่ขึ้นชีตเอง (ไม่ต้องรอเปิดแอปใหม่)');
await section('[5.4]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  await app.applyBackupData(validBackup([bill(B1, d('2026-09-01T12:00:00+07:00'), 300)]));
  await settle(150);
  const tab = gas.sheet('09-2026');
  await t('บิลที่กู้มาขึ้นแท็บเดือนบนชีตแล้ว', () => ok(tab && tab._grid.some(r => r[0] === B1), gas.sheetNames().join(',')));
  await t('สถานะในเครื่องเป็น synced', async () => eq((await env.raw('transactions')).find(x => x.id === B1).syncStatus, 'synced'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6.1] กู้ไฟล์ที่มีบิลเสีย → แยกไว้ตรวจ (เก็บต้นฉบับครบ) ไม่ใช่ 0 · บิลรุ่นเก่าที่ถูกต้องตามกติกาเดิมต้องไม่ถูกแยก');
// ═══════════════════════════════════════════════════════════════════════════
const D0 = d('2026-07-01T12:00:00+07:00');
const badBills = [
  { id: 'TX-1751000000000-NEGATIVE', date: D0, subtotal: -50, discount: 0, total: -50, paymentMethod: 'cash' },
  bill('TX-1751000000000-BITCOINN', D0, 300, { paymentMethod: 'bitcoin' }),
  { id: 'TX-1751000000000-LEGACY99', date: D0, subtotal: 100, discount: 0, total: 999, paymentMethod: 'cash' },
  bill('TX-1751000000000-VATWRONG', D0, 300, { vatAmount: 5 }),
  bill('TX-1751000000000-DETAILSX', D0, 300, { details: [{ name: 'ตัดผม', price: 200, netPrice: 200, staffId: 'st-1', staffName: 'เอ', commissionAmount: 20 }] }),
  { id: 'TX-1751000000000-NOTOTALX', date: D0, subtotal: 300, discount: 0, paymentMethod: 'cash' }
];
const goodLegacy = [
  // รุ่น 21 มิ.ย. 2569: ส่วนลดไม่ถูกจำกัด → ส่วนลดเกินราคา ยอด 0 (สูตรเดิม max(0, รวม − ลด))
  { id: 'TX-1750500000000-FREEBILL', date: D0, subtotal: 300, discount: 500, total: 0, paymentMethod: 'cash',
    details: [{ name: 'ตัดผม', price: 300, netPrice: 0, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 0 }] },
  // รุ่นแรกปัดราคาหลังส่วนลดทีละบรรทัด: 66.67 × 3 = 200.01 (ยอดบิล 200 ถูกต้อง)
  { id: 'TX-1750500000000-ROUNDING', date: D0, subtotal: 300, discount: 100, total: 200, paymentMethod: 'cash',
    details: [1, 2, 3].map(i => ({ name: 'บริการ' + i, price: 100, netPrice: 66.67, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 6.67 })) },
  // รุ่นเก่ามากไม่มีช่องทางจ่าย = เงินสด
  { id: 'TX-1750500000000-NOPAYMNT', date: D0, subtotal: 200, discount: 0, total: 200 },
  // ตัวเลขเป็นข้อความ = แปลงได้โดยไม่เสียข้อมูล
  bill('TX-1750500000000-STRINGNM', D0, 600, { total: '600', subtotal: '600', nonVatBase: '600' })
];
await section('[6.1]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  await ownerKeyReady(app, gas);
  const file = validBackup(badBills.concat(goodLegacy));
  const originalCopy = JSON.parse(JSON.stringify(file.transactions));
  const up = gas.post({ action: 'backup', backupData: file });
  await t('(เงื่อนไขเทสต์) Apps Script รับไฟล์นี้ (โครงถูก แม้บางบิลเสีย)', () => eq(up.status, 'success', JSON.stringify(up)));
  app.restoreFromDriveBackup(up.details.fileId, 'ไฟล์มีบิลเสีย');
  await app._confirmP; await settle(150);
  const raw = await env.rawAll();
  const keptIds = raw.transactions.map(x => x.id).sort();
  await t('บิลที่เชื่อไม่ได้ทั้ง 6 ใบไม่อยู่ในรายการบิล (ไม่นับในยอด)', () => ok(badBills.every(b => !keptIds.includes(b.id)), keptIds.join(',')));
  await t('บิลรุ่นเก่าที่ถูกต้องตามกติกาเดิมอยู่ครบ 4 ใบ', () => eq(keptIds, goodLegacy.map(b => b.id).sort()));
  const q = (raw.quarantine || []).filter(r => r.kind === 'transaction');
  await t('ทั้ง 6 ใบอยู่ในรายการแยกตรวจสอบในเครื่อง', () => eq(q.map(r => r.id).sort(), badBills.map(b => b.id).sort()));
  await t('ค่าต้นฉบับในรายการแยกตรวจ ตรงกับไฟล์ทุกตัวอักษร (ไม่ถูกซ่อมไปครึ่งทาง)', () => {
    for (const b of badBills) eq(q.find(r => r.id === b.id).original, originalCopy.find(x => x.id === b.id), b.id);
  });
  await t('ไม่มีบิลไหนถูกแปลงยอดเป็น 0 (ยอด 0 มีเฉพาะบิลที่ยอดจริงเป็น 0)', () =>
    eq(raw.transactions.filter(x => x.total === 0).map(x => x.id), ['TX-1750500000000-FREEBILL']));
  await t('ยอดรวมในเครื่อง = ผลรวมบิลที่เชื่อได้เท่านั้น (0 + 200 + 200 + 600)', () =>
    eq(raw.transactions.reduce((a, x) => a + x.total, 0), 1000));
  await t('ข้อความที่ให้เจ้าของดูก่อนกดยืนยัน บอกว่าจะแยกไว้ตรวจสอบและเก็บต้นฉบับ', () =>
    ok(/แยกไว้ตรวจสอบ/.test(app._lastAskMsg || '') && /ต้นฉบับ/.test(app._lastAskMsg || ''), app._lastAskMsg));
  const sentIds = gas.requests.filter(r => r && r.action === 'transaction').map(r => r.id);
  await t('บิลที่แยกตรวจไม่ถูกส่งขึ้นชีตอัตโนมัติ', () => ok(badBills.every(b => !sentIds.includes(b.id)), sentIds.join(',')));
  await t('บิลที่เชื่อได้ถูกส่งขึ้นชีต และชีตรับครบ (กติกาบิลเก่าตรงกันสองฝั่ง)', async () => {
    const tx = await env.raw('transactions');
    eq(tx.filter(x => x.syncStatus !== 'synced').map(x => x.id + ':' + JSON.stringify(x.syncIssue || x.syncStatus)), []);
  });
  env.dispose();
});

console.log('\n[6.2] บิลเสียที่อยู่ในเครื่องอยู่แล้ว → ไม่ส่งขึ้นชีต · สถานะ "รอตรวจ" ลงเครื่องจริง · ไม่วนส่งซ้ำ');
await section('[6.2]', async () => {
  const good = bill('TX-1757100000000-GOODGOOD', d('2026-09-10T12:00:00+07:00'), 300, { syncStatus: 'pending' });
  const bad = bill('TX-1757100000000-BADBADBA', d('2026-09-10T13:00:00+07:00'), 300, { syncStatus: 'pending', total: -5 });
  const { env, app, gas } = await makeShop({ rows: { transactions: [good, bad] } });
  let badge = null; app.updateSyncBadgeStatus = (st, n) => { badge = [st, n]; };
  await settle(150);
  const tx = await env.raw('transactions');
  const sent = gas.requests.filter(r => r && r.action === 'transaction').map(r => r.id);
  await t('บิลดีถูกส่งและ synced', () => { ok(sent.includes(good.id)); eq(tx.find(x => x.id === good.id).syncStatus, 'synced'); });
  await t('บิลเสียไม่ถูกส่งขึ้นชีต', () => ok(!sent.includes(bad.id)));
  await t('บิลเสียถูกตั้งสถานะ conflict พร้อมเหตุผล ลงเครื่องจริง', () => {
    const b = tx.find(x => x.id === bad.id); eq(b.syncStatus, 'conflict'); eq(b.syncIssue.kind, 'invalid'); ok(/เชื่อไม่ได้/.test(b.syncIssue.message)); });
  await app.syncPendingTransactions(true); await settle(40);
  await t('รอบซิงก์ถัดไปไม่วนส่งบิลที่รอตรวจ', () => eq(gas.requests.filter(r => r && r.action === 'transaction' && r.id === bad.id).length, 0));
  app.checkSyncStatus();
  await t('แถบสถานะไม่ขึ้นว่า "ตรงกัน" — ขึ้นว่ามีบิลรอตรวจ', () => eq(badge, ['conflict', 1]));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6.3] Apps Script: ไฟล์สำรองต้องกู้กลับได้ และต้องอ่านกลับตรวจก่อนนับว่าสำเร็จ/ก่อนลบไฟล์เก่า');
// ═══════════════════════════════════════════════════════════════════════════
await section('[6.3]', async () => {
  const gas = createGasEnv();
  const key = gas.setupOwnerKey();
  const count = () => { const f = gas.DriveApp._folders.Erotica_POS_Backups; return f ? f._files.filter(x => !x._trashed).length : 0; };
  const r1 = gas.post({ action: 'backup', backupData: { transactions: [] } });
  await t('ไฟล์ที่ไม่มีรายการบริการ/พนักงาน (กู้กลับไม่ได้) → ปฏิเสธ ไม่สร้างไฟล์', () => { eq(r1.code, 'BACKUP_INVALID'); eq(count(), 0); });
  const inj = validBackup([]); inj.services[0].id = "x');alert(1)//";
  await t('ไฟล์ที่รหัสบริการผิดรูปแบบ (แอปจะปฏิเสธตอนกู้) → ปฏิเสธ', () => eq(gas.post({ action: 'backup', backupData: inj }).code, 'BACKUP_INVALID'));
  const ok1 = gas.post({ action: 'backup', backupData: backupTwo() });
  await t('ไฟล์ปกติ → สำเร็จพร้อม verified:true', () => { eq(ok1.status, 'success'); eq(ok1.details.verified, true); eq(ok1.details.txCount, 2); });
  gas.faults.truncateNextFile = true;
  const r2 = gas.post({ action: 'backup', backupData: backupTwo() });
  await t('Drive เขียนไฟล์ไม่ครบ → BACKUP_VERIFY_FAILED และไม่เหลือไฟล์เสียในโฟลเดอร์', () => { eq(r2.code, 'BACKUP_VERIFY_FAILED'); eq(count(), 1); });
  gas.faults.readFile = 1;
  const r3 = gas.post({ action: 'backup', backupData: backupTwo() });
  await t('อ่านไฟล์กลับไม่ได้ → BACKUP_VERIFY_FAILED', () => { eq(r3.code, 'BACKUP_VERIFY_FAILED'); eq(count(), 1); });
  const got = gas.post({ action: 'get_backup', fileId: ok1.details.fileId, ownerKey: key });
  await t('ไฟล์ที่สำรองสำเร็จ ดึงกลับมาได้และผ่านด่านตรวจของแอปจริง', async () => {
    eq(got.status, 'success');
    const { env } = await makeShop({ noInit: true });
    ok(env.app.isValidBackupObject(got.details.backupData), env.app._lastBackupRejectReason);
    env.dispose();
  });
  // retention: ไฟล์เก่า 12 ไฟล์ (เกิน 90 วัน)
  const folder = gas.DriveApp._folders.Erotica_POS_Backups;
  const old = [];
  for (let i = 0; i < 12; i++) {
    const f = folder.createFile('pos_backup_2026-01-' + String(i + 1).padStart(2, '0') + '.json', JSON.stringify(backupTwo()), 'text/plain');
    const created = new Date(Date.now() - (200 + i) * 86400e3); f.getDateCreated = () => created; old.push(f);
  }
  gas.faults.truncateNextFile = true;
  gas.post({ action: 'backup', backupData: backupTwo() });
  await t('ไฟล์ใหม่ตรวจไม่ผ่าน → ไม่ลบไฟล์เก่าแม้แต่ไฟล์เดียว', () => eq(old.filter(f => f._trashed).length, 0));
  const r4 = gas.post({ action: 'backup', backupData: backupTwo() });
  await t('ไฟล์ใหม่ตรวจผ่าน → ลบไฟล์เก่าเกินอายุ แต่เหลือไฟล์ล่าสุดอย่างน้อย 10 ไฟล์เสมอ', () => {
    eq(r4.status, 'success'); eq(count(), 10); ok(old.filter(f => f._trashed).length === 4, 'ลบ ' + old.filter(f => f._trashed).length); });
});

console.log('\n[6.4] แอป: สถานะสำรองล่าสุดตามจริง (ลงเครื่อง) · ไม่ส่งไฟล์ที่กู้กลับไม่ได้');
await section('[6.4]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  await app.autoBackupToGoogleDrive(); await settle(30);
  const st1 = await env.raw('backupStatus');
  await t('สำรองสำเร็จ → บันทึก lastOk + ตรวจอ่านกลับแล้ว', () => { ok(st1 && st1.lastOk === true && st1.lastVerified === true, JSON.stringify(st1)); });
  gas.faults.truncateNextFile = true;
  const r = await app.autoBackupToGoogleDrive(); await settle(30);
  const st2 = await env.raw('backupStatus');
  await t('Apps Script ตรวจไฟล์ไม่ผ่าน → แอปถือว่าล้มเหลว (ไม่ขึ้นว่าสำเร็จ)', () => { eq(r, false); eq(st2.lastOk, false); ok(/ตรวจ/.test(st2.lastMessage), st2.lastMessage); });
  await t('ยังจำเวลาที่สำรองสำเร็จครั้งล่าสุดไว้ (บอกได้ว่าไฟล์ดีล่าสุดคือเมื่อไร)', () => eq(st2.lastSuccessAt, st1.lastSuccessAt));
  // ข้อมูลในเครื่องสร้างไฟล์ที่กู้กลับไม่ได้ → ไม่ส่งเลย
  app.state.services.push({ id: "bad'id", name: 'x', price: 1 });
  const before = gas.requests.length;
  const r2 = await app.autoBackupToGoogleDrive(); await settle(30);
  await t('ไฟล์ที่จะกู้กลับไม่ได้ → ไม่ส่งขึ้น Drive และบันทึกเหตุผล', async () => {
    eq(r2, false); eq(gas.requests.length, before);
    ok(/กู้กลับไม่ได้/.test((await env.raw('backupStatus')).lastMessage)); });
  env.dispose();
});

console.log('\n[6.5] รายการแยกตรวจติดไปกับไฟล์สำรอง/สำเนาก่อนกู้ · ราคาบริการเสีย = ขายไม่ได้ ไม่ใช่ขายฟรี');
await section('[6.5]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const f = validBackup([badBills[0]]);
  f.services.push({ id: 's9', name: 'บริการราคาเสีย', price: 'N/A', duration: 10, category: 'barber', commission: 0, commissionType: 'percent' });
  await app.applyBackupData(f); await settle(40);
  await t('ไฟล์สำรองที่สร้างจากเครื่องนี้มีรายการแยกตรวจติดไปด้วย', () => eq(app.buildBackupPayload().quarantine.length, 2));
  app.addToCart('s9');
  await t('ใส่บริการที่ราคาเสียลงตะกร้าไม่ได้', () => eq(app.state.cart.length, 0));
  // กู้อีกไฟล์ (สะอาด) แล้วย้อนกลับ → รายการแยกตรวจเดิมต้องกลับมา
  await app.applyBackupData(validBackup([]), undefined);
  await t('กู้ไฟล์สะอาด → รายการแยกตรวจเป็นของไฟล์ใหม่ (ว่าง)', async () => eq((await env.raw('quarantine')).length, 0));
  env.dispose();
});

R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
