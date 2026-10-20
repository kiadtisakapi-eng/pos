// Regression ของรายงานตรวจ Claude 8 ต.ค. 2569 (audit/claude-audit-20261008) — หมวด B ข้อ 3–6, 8 และหมวด C ข้อ 9–16
// ข้อ 1 อยู่ใน test_deploy_safety.js · ข้อ 2 อยู่ใน test_gas.js · ข้อ 7/17 อยู่ใน test_runner.js
// ฐานข้อมูลจริง (Dexie + fake-indexeddb) + Apps Script ตัวจริงบน Google จำลอง · เรียกผ่านทางที่ปุ่มบนจอเรียกจริง
// ทุกข้อพิสูจน์แล้วว่า "ตก" เมื่อรันกับโค้ดก่อนแก้ (audit/fixes-20261008/before · POS_APP_SRC / POS_GAS_SRC)
const assert = require('assert/strict');
const { createEnv } = require('./harness_db');
const { seed, quiet, loginAs, makeShop, readyCheckout, settle, createGasEnv, SHEETS_URL } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '->', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
}
const clone = o => JSON.parse(JSON.stringify(o));
// เครื่องขายที่เน็ตล่มจริง (คำขอทุกตัวล้ม → บิลใหม่ = ยังไม่ขึ้นชีต) และไม่ปลุกงานคลาวด์เอง
// ⚠️ ส่ง gas.fetch ไม่ได้: งานส่งบิลเบื้องหลังวิ่งถึง Apps Script จำลองแม้ navigator.onLine = false แล้วบิลกลายเป็น synced
//    ระหว่างเทสต์ (เจอตอนเขียนเทสต์ข้อ 3 — ผลขึ้นกับจังหวะเวลา)
async function shop(o) {
  o = o || {};
  const gas = o.gas || createGasEnv();
  const offline = async () => { throw new TypeError('Failed to fetch (ออฟไลน์ในเทสต์)'); };
  const env = createEnv({ fetch: o.online ? gas.fetch : offline, onLine: !!o.online, querySelectorAll: o.qsa });
  const toasts = quiet(env.app);
  // เครื่องหลักที่ยืนยันแล้ว (ขายออฟไลน์ได้ตามกติกา) — เครื่องที่ยังไม่รู้สถานะขายไม่ได้ถ้าไม่มีเน็ต
  await seed(env, Object.assign({ googleSheetsApiToken: gas.token, primaryStatus: { isPrimary: true, checkedAt: Date.now() } }, o.rows || {}));
  await env.app.loadState(); loginAs(env.app, o.role || 'owner');
  env.app.scheduleCloudRetry = () => {}; env.app.resumePendingCloudWork = () => {};
  return Object.assign(env, { gas, toasts });
}
async function sale(s, items, pay) {
  readyCheckout(s, items, pay);
  assert.equal(await s.app.processCheckout(), true, 'เงื่อนไขเทสต์: ขายได้');
  await settle(40);   // ให้งานส่งบิลเบื้องหลัง (ล้มเพราะออฟไลน์) จบก่อน — ไม่งั้นมันเขียนสถานะทับที่เทสต์ตั้งเอง
  return s.app.state.transactions.at(-1);
}
async function waitConfirm(app) { for (let i = 0; i < 100 && !app._confirmP; i++) await settle(5); await app._confirmP; }

(async () => {
  // ═══════════════════════════ ข้อ 3: กู้/นำเข้า/ย้อน ทับบิลที่ยังไม่ขึ้นชีต ═══════════════════════════
  await test('ข้อ3 applyBackupData ทับบิลที่ยังไม่ขึ้นชีตโดยไม่ยอมรับ → ปฏิเสธ ข้อมูลในเครื่อง/ในฐานข้อมูลไม่เปลี่ยน', async () => {
    const s = await shop();
    try {
      const file = clone(s.app.buildBackupPayload());           // ไฟล์ที่ทำก่อนขาย (ไม่มีบิล)
      const tx = await sale(s);
      assert.equal(s.app.isBillAwaitingSync(tx), true, 'เงื่อนไขเทสต์: บิลยังไม่ขึ้นชีต');
      await assert.rejects(s.app.applyBackupData(clone(file)), /ยังไม่ขึ้นชีต/);
      assert.deepEqual(s.app.state.transactions.map(t => t.id), [tx.id]);
      assert.deepEqual((await s.raw('transactions')).map(t => t.id), [tx.id]);
      // ยืนยันไว้ 0 ใบ แต่ตอนแทนข้อมูลมี 1 ใบ (เช่นงานขายในคิวจบระหว่างรอยืนยัน) → ปฏิเสธ
      await assert.rejects(s.app.applyBackupData(clone(file), { acceptUnsynced: true, acceptUnsyncedMax: 0 }), /เพิ่มเป็น 1 ใบ/);
      assert.equal(s.app.state.transactions.length, 1);
      await s.app.applyBackupData(clone(file), { acceptUnsynced: true });
      assert.equal(s.app.state.transactions.length, 0);
    } finally { s.dispose(); }
  });

  await test('ข้อ3 กู้จาก Drive (ทางจริง): กล่องยืนยันบอกจำนวนบิลที่ยังไม่ขึ้นชีต · ไม่พิมพ์ "ยอมรับ" = ไม่แตะข้อมูล · พิมพ์แล้วกู้ได้และบิลอยู่ในสำเนาก่อนกู้', async () => {
    const s = await shop();
    try {
      const file = clone(s.app.buildBackupPayload());
      const tx = await sale(s);
      s.app.cloudPost = async (action) => { assert.equal(action, 'get_backup'); return { status: 'success', details: { backupData: clone(file) } }; };
      s.app.downloadExportFile = () => true;
      const asked = []; s.app.askTypedConfirm = async (m, kw) => { asked.push({ m, kw }); return false; };
      s.toasts.length = 0;
      s.app.restoreFromDriveBackup('FILE-1', '8/10/2569'); await s.app._confirmP;
      assert.match(s.app._lastConfirmMsg, /บิล 1 ใบที่ยังไม่ขึ้นชีต/);
      assert.equal(asked.length, 1, 'ต้องถามพิมพ์ยืนยัน');
      assert.equal(asked[0].kw, 'ยอมรับ'); assert.match(asked[0].m, /1 ใบ/);
      assert.deepEqual(s.app.state.transactions.map(t => t.id), [tx.id]);
      assert.deepEqual((await s.raw('transactions')).map(t => t.id), [tx.id]);
      assert.ok(s.toasts.some(t => /ยกเลิกการกู้ข้อมูล/.test(t.m)), JSON.stringify(s.toasts));
      assert.equal(s.toasts.some(t => /สำเร็จแล้ว/.test(t.m)), false);
      s.app.askTypedConfirm = async () => true;
      s.app.restoreFromDriveBackup('FILE-1', '8/10/2569'); await s.app._confirmP;
      assert.equal(s.app.state.transactions.length, 0);
      const snap = await s.raw('preRestoreSnapshot');
      assert.ok(snap && snap.data.transactions.some(t => t.id === tx.id), 'บิลต้องอยู่ในสำเนาก่อนกู้');
    } finally { s.dispose(); }
  });

  await test('ข้อ3 นำเข้าไฟล์ .json (ทางจริง): เตือน + ถามพิมพ์ยืนยัน · ไม่ยอมรับ = ไม่แตะข้อมูล', async () => {
    const s = await shop();
    try {
      const file = clone(s.app.buildBackupPayload());
      const tx = await sale(s);
      s.ctx.FileReader = class { readAsText(f) { setTimeout(() => this.onload({ target: { result: f._text } }), 0); } };
      const asked = []; s.app.askTypedConfirm = async (m, kw) => { asked.push({ m, kw }); return false; };
      s.app._confirmP = null;
      s.app.importData({ target: { files: [{ _text: JSON.stringify(file) }], value: 'x' } }); await waitConfirm(s.app);
      assert.match(s.app._lastConfirmMsg, /บิล 1 ใบที่ยังไม่ขึ้นชีต/);
      assert.equal(asked.length, 1); assert.equal(asked[0].kw, 'ยอมรับ');
      assert.deepEqual((await s.raw('transactions')).map(t => t.id), [tx.id]);
      s.app.askTypedConfirm = async () => true; s.app._confirmP = null;
      s.app.importData({ target: { files: [{ _text: JSON.stringify(file) }], value: 'x' } }); await waitConfirm(s.app);
      assert.equal((await s.raw('transactions')).length, 0);
    } finally { s.dispose(); }
  });

  await test('ข้อ3 ย้อนข้อมูล (ทางจริง): บิลรอส่งซ้ำหลังกู้ + บิลขายใหม่ → ถามพิมพ์ยืนยัน · ไม่มีบิลค้าง = ไม่ถาม', async () => {
    const s = await shop();
    try {
      const a = await sale(s); a.syncStatus = 'synced'; await s.app.saveState();
      const file = clone(s.app.buildBackupPayload());           // ไฟล์มีบิล A ที่ขึ้นชีตแล้ว
      s.app.cloudPost = async () => ({ status: 'success', details: { backupData: clone(file) } });
      s.app.downloadExportFile = () => true;
      const asked = []; s.app.askTypedConfirm = async (m, kw) => { asked.push({ m, kw }); return true; };
      s.app.restoreFromDriveBackup('FILE-1', '8/10/2569'); await s.app._confirmP;
      assert.equal(asked.length, 0, 'บิลทุกใบขึ้นชีตแล้ว — ไม่ต้องถาม');
      assert.equal(s.app.state.transactions[0].syncStatus, 'pending', 'เงื่อนไขเทสต์: หลังกู้บิลรอส่งซ้ำ');
      const b = await sale(s);
      s.app.askTypedConfirm = async (m, kw) => { asked.push({ m, kw }); return false; };
      await s.app.undoLastRestore(); await s.app._confirmP;
      assert.match(s.app._lastConfirmMsg, /บิล 2 ใบที่ยังไม่ขึ้นชีต \(ค้างส่ง\/รอตรวจ\/รอส่งซ้ำหลังการกู้ครั้งก่อน\)/);
      assert.equal(asked.length, 1); assert.equal(asked[0].kw, 'ยอมรับ');
      assert.ok((await s.raw('transactions')).some(t => t.id === b.id), 'ไม่ยอมรับ = บิลใหม่ยังอยู่');
      s.app.askTypedConfirm = async () => true;
      await s.app.undoLastRestore(); await s.app._confirmP;
      const raw = await s.rawAll();
      assert.deepEqual(raw.transactions.map(t => t.id), [a.id]);
      assert.ok(raw.preRestoreSnapshot.data.transactions.some(t => t.id === b.id), 'บิลใหม่สลับไปอยู่ในสำเนา');
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 4: กู้แล้วทิ้งคำสั่งลบแถวบิลที่ยกเลิก ═══════════════════════════
  await test('ข้อ4 กู้ไฟล์ที่ไม่มีบิลที่ยกเลิก → คำสั่งลบแถวที่ค้างในเครื่องยังอยู่ (งานเดียว ไม่ซ้ำ) · ไฟล์ที่มีบิลนั้น → ไม่สั่งลบ', async () => {
    const s = await shop();
    try {
      const fileBefore = clone(s.app.buildBackupPayload());     // ก่อนขาย X
      const x = await sale(s); x.syncStatus = 'synced'; await s.app.saveState();
      const fileWithX = clone(s.app.buildBackupPayload());       // X ยังอยู่
      s.document.getElementById('edit-tx-id').value = x.id;
      s.document.getElementById('void-money-outcome').value = 'refunded';
      await s.app.voidTransaction(); await s.app._confirmP; await settle(30);   // ยกเลิกตอนเน็ตล่ม (ทางจริง)
      const jobs = () => s.app.state.cloudOutbox.filter(j => j && j.needVoidDelete && j.voidDelete && j.voidDelete.id === x.id);
      assert.equal(jobs().length, 1, 'เงื่อนไขเทสต์: คำสั่งลบค้างในคิว');
      const mk = jobs()[0].voidDelete.monthKey;
      s.toasts.length = 0;
      await s.app.applyBackupData(clone(fileBefore));
      assert.equal(jobs().length, 1, 'คำสั่งลบหายไปกับการกู้');
      assert.equal(jobs()[0].voidDelete.monthKey, mk);
      assert.ok((await s.raw('cloudOutbox')).some(j => j.needVoidDelete && j.voidDelete.id === x.id), 'ต้องลงเครื่องด้วย');
      assert.ok(s.toasts.some(t => /คงคำสั่งลบแถวบิลที่ยกเลิก.*1 รายการ/.test(t.m)), JSON.stringify(s.toasts));
      // ไฟล์มีคำสั่งลบเดียวกันติดมา → ยังเป็นงานเดียว
      const f2 = clone(fileBefore);
      f2.pendingCloudWork = { voidDeletes: [clone(jobs()[0].voidDelete)], summaryDateKeys: [], summaryMonthKeys: [] };
      await s.app.applyBackupData(f2);
      assert.equal(jobs().length, 1, 'ซ้ำ');
      // ไฟล์รุ่นเก่า (ไม่มีงานค้าง) → คำสั่งของเครื่องยังอยู่
      const f3 = clone(fileBefore); delete f3.pendingCloudWork;
      await s.app.applyBackupData(f3);
      assert.equal(jobs().length, 1, 'ไฟล์รุ่นเก่า');
      // ไฟล์ที่ X ยังอยู่ → ห้ามสั่งลบบิลที่ยังใช้งาน
      await s.app.applyBackupData(clone(fileWithX), { acceptUnsynced: true });
      assert.equal(jobs().length, 0, 'สั่งลบบิลที่ยังอยู่ในไฟล์ที่กู้');
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 5: ช่อง URL Apps Script ═══════════════════════════
  const GOOD = SHEETS_URL;
  async function urlShop() {
    const s = await shop();
    await sale(s); await sale(s);
    s.app.state.transactions.forEach(t => { t.syncStatus = 'synced'; t.syncedBackendId = 'ss:REAL'; });
    s.app.cloudBackendId = 'ss:REAL'; s.app.primaryStatus = { isPrimary: true, checkedAt: Date.now() };
    s.app.state.cloudOutbox = [];
    await s.app.saveState();
    s.calls = [];
    s.backends = { [GOOD]: 'ss:REAL' };
    s.app.cloudPost = async (action) => {
      s.calls.push([action, s.app.googleSheetsUrl]);
      const id = s.backends[s.app.googleSheetsUrl];
      if (!id) throw new Error('fetch failed');
      return { status: 'success', details: { backendId: id, registered: true, isThisDevice: true } };
    };
    // ตรวจ 19 ต.ค. 2569 ข้อ 46: ตัวตนชีตของ URL ใหม่ถูกถาม "ก่อนเข้าคิวงานบันทึก" ด้วย probeCloudBackendId(url, token)
    // (ยังไม่ได้ตั้งค่าในเครื่อง จึงไม่ผ่าน cloudPost) — จำลองชีตปลายทางชุดเดียวกัน
    s.app.probeCloudBackendId = async (url) => { s.calls.push(['primary_status', url]); return s.backends[url] || ''; };
    s.setUrl = (url) => {
      const v = (id, val) => { s.document.getElementById(id).value = val; };
      v('shop-name-input', s.app.shopName); v('shop-tagline-input', s.app.shopTagline); v('shop-address-input', s.app.shopAddress || '');
      v('shop-phone-input', s.app.shopPhone || ''); v('shop-promptpay-id', s.app.shopPromptPayId || '');
      v('shop-sheets-api-token', s.app.googleSheetsApiToken); v('shop-telegram-token', s.app.telegramToken || '');
      v('shop-telegram-chatid', s.app.telegramChatId || ''); v('shop-sheets-sync-url', url);
    };
    s.pending = () => s.app.state.transactions.filter(t => t.syncStatus === 'pending').length;
    return s;
  }
  for (const [label, bad] of [['พิมพ์เกินตัวเดียว', GOOD + 'x'], ['วางลิงก์ของชีต', 'https://docs.google.com/spreadsheets/d/1abcDEF/edit'],
    ['โดเมนอื่น', 'https://script.google.com.evil.example/macros/s/AKfy/exec'], ['ลิงก์ทดสอบ /dev', 'https://script.google.com/macros/s/AKfy/dev']]) {
    await test(`ข้อ5 URL ผิดรูปแบบ (${label}) → ไม่บันทึก · คืนค่าเดิมในช่อง · บิลไม่กลับเป็นรอส่ง · ไม่ยิงคำขอไปที่นั่น`, async () => {
      const s = await urlShop();
      try {
        s.toasts.length = 0; s.setUrl(bad);
        await s.app.saveShopSettings();
        assert.equal(s.app.googleSheetsUrl, GOOD);
        assert.equal(s.document.getElementById('shop-sheets-sync-url').value, GOOD);
        assert.equal((await s.raw('googleSheetsUrl')), GOOD);
        assert.equal(s.pending(), 0); assert.equal(s.app.state.cloudOutbox.length, 0);
        assert.ok(s.app.primaryStatus && s.app.primaryStatus.isPrimary, 'สถานะเครื่องหลักต้องคงอยู่');
        assert.equal(s.calls.length, 0, 'ไม่ส่งรหัสเชื่อมต่อไป URL ที่ผิดรูปแบบ');
        assert.ok(s.toasts.some(t => /ลิงก์ Web App ของ Apps Script/.test(t.m)), JSON.stringify(s.toasts));
      } finally { s.dispose(); }
    });
  }
  await test('ข้อ5 URL ใหม่รูปแบบถูกแต่ตรวจชีตไม่ได้ → ถามก่อน · ยกเลิก = คง URL/การผูก/เครื่องหลักเดิม', async () => {
    const s = await urlShop();
    try {
      const asked = []; s.app.askConfirm = async m => { asked.push(m); return false; };
      s.toasts.length = 0; s.setUrl('https://script.google.com/macros/s/AKfyOTHER_deploy-2/exec');
      await s.app.saveShopSettings();
      assert.equal(asked.length, 1); assert.match(asked[0], /บิล 2 ใบจะถูกส่งขึ้นชีตใหม่/);
      assert.equal(s.app.googleSheetsUrl, GOOD); assert.equal(await s.raw('googleSheetsUrl'), GOOD);
      assert.equal(s.document.getElementById('shop-sheets-sync-url').value, GOOD);
      assert.equal(s.pending(), 0); assert.equal(s.app.cloudBackendId, 'ss:REAL');
      assert.ok(s.app.primaryStatus && s.app.primaryStatus.isPrimary);
      assert.ok(s.toasts.some(t => /คง URL เดิม/.test(t.m)));
    } finally { s.dispose(); }
  });
  await test('ข้อ5 ยืนยันย้ายปลายทาง → บิลทั้งร้านรอส่ง + toast บอกจำนวนบิล', async () => {
    const s = await urlShop();
    try {
      s.app.askConfirm = async () => true;
      s.toasts.length = 0; s.setUrl('https://script.google.com/macros/s/AKfyOTHER_deploy-2/exec');
      await s.app.saveShopSettings();
      assert.equal(s.app.googleSheetsUrl, 'https://script.google.com/macros/s/AKfyOTHER_deploy-2/exec');
      assert.equal(s.pending(), 2);
      assert.ok(s.toasts.some(t => /ย้ายปลายทางชีตแล้ว — บิล 2 ใบจะถูกส่งขึ้นชีตใหม่/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.dispose(); }
  });
  await test('ข้อ5 (ควบคุม) URL ใหม่ของชีตเดิม (ตรวจตัวตนได้) → ไม่ถาม ไม่ตีบิล ไม่ขึ้น toast ย้ายปลายทาง', async () => {
    const s = await urlShop();
    try {
      const NEW = 'https://script.google.com/macros/s/AKfySAME_SHEET/exec'; s.backends[NEW] = 'ss:REAL';
      const asked = []; s.app.askConfirm = async m => { asked.push(m); return true; };
      s.toasts.length = 0; s.setUrl(NEW);
      await s.app.saveShopSettings();
      assert.equal(s.app.googleSheetsUrl, NEW); assert.equal(asked.length, 0); assert.equal(s.pending(), 0);
      assert.equal(s.toasts.some(t => /ย้ายปลายทาง/.test(t.m)), false);
    } finally { s.dispose(); }
  });
  await test('ข้อ5 ชีตบอกตัวตนใหม่ตอนถามสถานะเครื่องหลัก (refreshPrimaryStatus) → toast ย้ายปลายทาง', async () => {
    const s = await urlShop();
    try {
      s.backends[GOOD] = 'ss:OTHER';
      s.toasts.length = 0;
      await s.app.refreshPrimaryStatus();
      assert.equal(s.app.cloudBackendId, 'ss:OTHER'); assert.equal(s.pending(), 2);
      assert.ok(s.toasts.some(t => /ย้ายปลายทางชีตแล้ว — บิล 2 ใบ/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 6: ย้ายค่าคอมรายบรรทัดต้องลง editLog ═══════════════════════════
  await test('ข้อ6 บิล เอ,ซี,เอ → เปลี่ยนบรรทัด 3 เป็นซี → editLog +1 พร้อม from/to/ค่าคอม และขึ้นในหน้ารายงาน', async () => {
    const { env, app } = await makeShop();
    try {
      await settle();
      app.state.staff.push({ id: 'st-2', name: 'ซี', role: 'ช่าง', accessLevel: 'staff', pin: await app.hashPin('333333') });
      await app.saveStateOrThrow('seed');
      readyCheckout(env, [
        { id: 's1', name: 'ตัดผม', price: 300, staffId: 'st-1', staffName: 'เอ' },
        { id: 's1', name: 'สระ', price: 200, staffId: 'st-2', staffName: 'ซี' },
        { id: 's1', name: 'โกน', price: 500, staffId: 'st-1', staffName: 'เอ' }], 'cash');
      assert.equal(await app.processCheckout(), true); await settle(30);
      const tx = app.state.transactions.at(-1);
      const comm3 = tx.details[2].commissionAmount;
      assert.ok(comm3 > 0, 'เงื่อนไขเทสต์: บรรทัด 3 มีค่าคอม');
      app.openTransactionEdit(tx.id);
      env.document.getElementById('edit-tx-customer').value = tx.customerName;
      env.document.getElementById('edit-tx-payment').value = 'cash';
      env.document.getElementById('edit-tx-discount').value = '0';
      const selects = [0, 1, 2].map(i => ({ value: i === 2 ? 'st-2' : tx.details[i].staffId, getAttribute: () => String(i) }));
      env.document.querySelectorAll = (sel) => /edit-tx-service-staff-select/.test(sel) ? selects : [];
      const before = (app.state.editLog || []).length;
      await app.saveTransactionEdit(); await settle(30);
      assert.equal(tx.details[2].staffName, 'ซี', 'เงื่อนไขเทสต์: ย้ายจริง');
      assert.equal(app.state.editLog.length, before + 1, 'ต้องมีประวัติ 1 แถว');
      const e = app.state.editLog.at(-1);
      assert.equal(e.billId, tx.id); assert.ok(e.by); assert.ok(e.fields.includes('lines'));
      assert.deepEqual(clone(e.lines), [{ idx: 2, name: 'โกน', from: 'เอ', to: 'ซี', commissionAmount: comm3 }]);
      assert.ok((await env.raw('editLog')).some(x => x.billId === tx.id && Array.isArray(x.lines)), 'ลงเครื่องแล้ว');
      Object.getPrototypeOf(app).renderAuditTrail.call(app, 'daily', app.getBusinessISODate(Date.now()));
      const html = env.document.getElementById('report-bill-edits-body').innerHTML;
      assert.match(html, /โกน: เอ → ซี/); assert.match(html, /ย้ายค่าคอม/);
    } finally { env.dispose(); }
  });

  // ═══════════════════════════ ข้อ 8: สรุปที่ข้อมูลไม่ผ่านกติกา ═══════════════════════════
  await test('ข้อ8 Apps Script: สรุปวัน/เดือนที่ข้อมูลไม่ผ่านกติกาตอบ code INVALID_SUMMARY ทุกจุด', async () => {
    const gas = createGasEnv();
    const DEV = 'dev-' + 'a'.repeat(32);
    const t0 = Date.UTC(2026, 9, 1, 5);
    const dts = new Date(t0 + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
    const r0 = gas.post({ action: 'transaction', deviceId: DEV, id: 'TX-R8-000001', date: new Date(t0).toISOString(), dateTimeStr: dts, monthKey: '10-2026',
      customerName: 'ก', services: ['นวด'], staffNames: ['เอ'], subtotal: 100, discount: 0, total: 100, paymentMethod: 'cash', rev: 1, revEpoch: 0,
      nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0 });
    assert.equal(r0.status, 'success', JSON.stringify(r0));
    const base = { action: 'summary_day', deviceId: DEV, dateKey: '2026-10-01', generatedAt: Date.now(), totalRevenue: 100, totalExpenses: 0, billCount: 1,
      cashRevenue: 100, qrRevenue: 0, creditRevenue: 0, nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0, services: [{ name: 'นวด', count: 1, revenue: 100 }] };
    assert.equal(gas.post(base).status, 'success', 'ควบคุม: สรุปที่ถูกต้องผ่าน');
    for (const [label, body] of [['วันที่ไม่จริง', { dateKey: '2026-02-31' }], ['ยอดช่องทาง ≠ รายได้', { cashRevenue: 50 }],
      ['บริการ ≠ ยอด', { services: [{ name: 'นวด', count: 1, revenue: 90 }] }], ['เดือนไม่จริง', { action: 'summary_month', monthKey: '13-2026' }],
      ['สรุปเดือนข้อมูลเสีย', { action: 'summary_month', monthKey: '10-2026', cashRevenue: 50 }]]) {
      const r = gas.post(Object.assign({}, base, { generatedAt: Date.now() }, body));
      assert.equal(r.status, 'error', label); assert.equal(r.code, 'INVALID_SUMMARY', label + ' ' + JSON.stringify(r));
    }
  });

  await test('ข้อ8 แอป: งานสรุปที่ชีตตอบ INVALID_SUMMARY → หยุดลองซ้ำทันที + แจ้งเจ้าของ + โชว์ในกล่องงานที่หยุดส่ง · กด "ลองใหม่" หลังแก้แล้วส่งผ่าน', async () => {
    const { env, app, gas, toasts } = await makeShop({ onLine: true });
    try {
      app.scheduleCloudRetry = () => {};
      readyCheckout(env); assert.equal(await app.processCheckout(), true); await settle(30);
      await app.syncPendingTransactions(true); await settle(30);
      // ทำให้ข้อมูลสรุปไม่ผ่านกติกาของชีตจริง (ยอดเงินสด ≠ รายได้) — ชีตตัวจริงเป็นคนปฏิเสธ
      const realBuild = Object.getPrototypeOf(app).buildSummaryPayload;
      let broken = true;
      app.buildSummaryPayload = function (...a) { const p = realBuild.apply(this, a); if (broken) p.cashRevenue = (Number(p.cashRevenue) || 0) + 1; return p; };
      app.enqueueSummaryRefresh(Date.now()); await app.saveState();
      const job = () => app.state.cloudOutbox.find(j => j && j.needSummary);
      assert.ok(job(), 'เงื่อนไขเทสต์: มีงานสรุป');
      let sent = 0; const realFetch = env.ctx.fetch;
      env.ctx.fetch = async (url, opts) => { try { const b = JSON.parse(opts.body); if (/^summary_/.test(b.action)) sent++; } catch (e) {} return realFetch(url, opts); };
      toasts.length = 0;
      await app.flushCloudOutbox(); await settle(30);
      assert.ok(sent > 0, 'เงื่อนไขเทสต์: ส่งสรุปแล้ว');
      const j = job();
      assert.ok(j, 'งานต้องยังอยู่ (ไม่ทิ้งเงียบ)');
      assert.equal(j.retry.summary.stopped, 'INVALID_SUMMARY');
      assert.equal(app.isCloudJobExpired(j, 'summary', Date.now()), true);
      assert.ok(app.expiredCloudJobs().some(x => x.item.id === j.id), 'ต้องอยู่ในกล่องงานที่หยุดส่ง');
      assert.ok(toasts.some(t => t.ty === 'error' && /หยุดส่งซ้ำแล้ว/.test(t.m)), JSON.stringify(toasts));
      Object.getPrototypeOf(app).renderExpiredCloudJobs.call(app);
      assert.match(env.document.getElementById('cloud-expired-jobs-box').innerHTML, /INVALID_SUMMARY/);
      const sentBefore = sent;
      await app.flushCloudOutbox(); await settle(30);
      assert.equal(sent, sentBefore, 'หยุดแล้วต้องไม่ยิงซ้ำ');
      broken = false;
      await app.retryExpiredCloudJob(j.id); await settle(60); await app.flushCloudOutbox(); await settle(60);
      assert.equal(app.state.cloudOutbox.some(x => x && x.needSummary), false, 'ลองใหม่หลังแก้ → ส่งผ่าน งานหายจากคิว');
    } finally { env.dispose(); }
  });

  // ═══════════════════════════ ข้อ 9: เวลาที่แสดงบนจอ/Telegram เป็นเวลาไทยแม้เครื่องตั้งเขตเวลาอื่น ═══════════════════════════
  await test('ข้อ9 เครื่องตั้งเขตเวลา UTC: ป้ายวันที่แดชบอร์ด · Telegram ปิดกะ · ป้ายไฟล์สำรอง ใช้เวลาไทย (รันในโปรเซสลูก TZ=UTC)', async () => {
    const { spawnSync } = require('child_process');
    const code = `
      (async () => {
        const vm = require('vm');
        const { createEnv } = require('./harness_db');
        const { seed, quiet, loginAs } = require('./fixtures_db');
        const env = createEnv({ onLine: false });
        quiet(env.app);
        const NOW = Date.parse('2026-10-08T10:00:00+07:00');          // 03:00 UTC — วันที่ UTC ของ "เวลาทำการ" ต่างจากไทย
        // ตรวจ 19 ต.ค. 2569 ข้อ 18: แดชบอร์ดใช้ "เวลาล่าสุดที่เคยเห็น" (กะ/บิลที่บันทึกไว้) — กะตั้งต้นของ seed ต้องเปิดก่อน NOW
        // (เดิม seed เปิดกะตามนาฬิกาจริง = เหมือนตั้งนาฬิกาย้อนหลัง ซึ่งตอนนี้แดชบอร์ดไม่ยอมย้อนตามแล้ว)
        await seed(env, { shift: { active: true, startTime: NOW - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] } });
        await env.app.loadState(); loginAs(env.app, 'owner');
        vm.runInContext('Date.now = () => ' + NOW, env.ctx);
        const real = Object.getPrototypeOf(env.app);
        try { real.renderDashboard.call(env.app); } catch (e) { /* ส่วนอื่นของแดชบอร์ดไม่เกี่ยว */ }
        const label = env.document.getElementById('dashboard-date').innerText;
        const start = Date.parse('2026-10-08T10:00:00+07:00'), end = Date.parse('2026-10-09T03:00:00+07:00');
        const msg = env.app.buildShiftReportMessage({ startTime: start, endTime: end, startCash: 0, expenses: [], closedBy: 'เอ' });
        const bk = env.app.formatBackupLabel({ created: new Date(start).toISOString(), name: 'x' });
        const fmt = (t, o) => new Date(t).toLocaleString('th-TH', Object.assign({ timeZone: 'Asia/Bangkok' }, o || {}));
        const wantDate = new Date(NOW - 6 * 3600e3).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        console.log(JSON.stringify({ tz: process.env.TZ, offset: new Date(NOW).getTimezoneOffset(), label, wantDate, msgStart: msg.includes(fmt(start)), msgEnd: msg.includes(fmt(end)), bk }));
        env.dispose(); process.exit(0);
      })().catch(e => { console.log(JSON.stringify({ err: String(e && e.stack || e) })); process.exit(0); });`;
    const r = spawnSync(process.execPath, ['-e', code], { cwd: __dirname, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { TZ: 'UTC' }) });
    const line = String(r.stdout || '').trim().split('\n').filter(l => l.startsWith('{')).pop();
    assert.ok(line, 'โปรเซสลูกไม่ตอบ: ' + r.stdout + r.stderr);
    const o = JSON.parse(line);
    assert.equal(o.err, undefined, o.err);
    assert.equal(o.offset, 0, 'เงื่อนไขเทสต์: โปรเซสลูกต้องเป็นเขตเวลา UTC');
    assert.ok(o.label.startsWith(o.wantDate), `ป้ายวันที่ "${o.label}" ต้องเป็น "${o.wantDate}"`);
    assert.equal(/หลังเที่ยงคืน/.test(o.label), false, '10 โมงเช้าเวลาไทย ต้องไม่ขึ้น (หลังเที่ยงคืน…)');
    assert.equal(o.msgStart, true, 'Telegram: เวลาเปิดกะต้องเป็นเวลาไทย');
    assert.equal(o.msgEnd, true, 'Telegram: เวลาปิดกะต้องเป็นเวลาไทย');
    assert.equal(o.bk, '8/10/2569 10:00 น.');
  });
  await test('ข้อ9 (กันถอยหลัง) app.js ไม่มีการแสดงวันที่ด้วย toLocale*String ที่ไม่ผ่าน fmtBkk', async () => {
    const src = require('fs').readFileSync(process.env.POS_APP_SRC || require('path').join(__dirname, '..', 'app.js'), 'utf8');
    const bad = [];
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (/^function fmtBkk/.test(l)) return;
      if (/\.toLocale(Date|Time)String\(/.test(l)) bad.push(i + 1);
    });
    // new Date(…).toLocaleString( — ไล่วงเล็บให้ครบ (เช่น new Date(Number(ts)))
    let k = 0;
    while ((k = src.indexOf('new Date(', k)) >= 0) {
      let d = 0, j = k + 8;
      for (; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')') { d--; if (!d) break; } }
      if (src.startsWith('.toLocaleString(', j + 1)) {
        const ln = src.slice(0, k).split('\n').length;
        if (!/^function fmtBkk/.test(lines[ln - 1])) bad.push(ln);
      }
      k = j;
    }
    assert.deepEqual(bad, [], 'บรรทัดที่ยังใช้เขตเวลาของเครื่อง: ' + bad.join(', '));
  });

  // ═══════════════════════════ ข้อ 10: Telegram ปิดกะ — ตัดข้อความ/ความยาว ═══════════════════════════
  await test('ข้อ10 Telegram ปิดกะ: ไม่ตัดกลางอีโมจิ · ชื่อคนลงยาวถูกย่อ · กรณีสุดโต่งยาวไม่เกิน 4000 และยังมีตัวเลขสรุปเงินครบ', async () => {
    const s = await shop();
    try {
      const app = s.app;
      const start = Date.parse('2026-11-02T10:00:00+07:00'), end = Date.parse('2026-11-03T02:30:00+07:00');
      const base = { startTime: start, endTime: end, startCash: 1000, cashSales: 0, expectedCash: 1000, countedCash: 1000, difference: 0 };
      const m1 = app.buildShiftReportMessage(Object.assign({}, base, { expenses: [{ amount: 1, note: 'x'.repeat(58) + '😀' + 'yyy', by: 'ก'.repeat(80) }] }));
      assert.equal(m1.isWellFormed(), true, 'มี lone surrogate (ตัดกลางอีโมจิ)');
      assert.ok(m1.includes('😀…') || m1.includes('x…'), 'ต้องตัดที่ขอบตัวอักษร');
      assert.equal(m1.includes('ก'.repeat(31)), false, 'ชื่อคนลงต้องถูกย่อ (30 ตัว)');
      const name30 = 'ชื่อยาวสามสิบตัวอักษรพอดีเลยนะ';
      const note = 'ซื้อของเข้าร้าน <a> & "b" ' + '๐๑๒๓๔๕๖๗๘๙'.repeat(6);
      const exps = Array.from({ length: 40 }, (_, i) => ({ id: 'e' + i, type: 'other', amount: 99999, note, time: start + i * 60000, by: name30 + i, paidFrom: 'other', approvedBy: name30 }));
      app.state.voidLog = Array.from({ length: 30 }, (_, i) => ({ billId: 'V' + i, amount: 500, date: start + 1000 * i, by: name30 + i }));
      app.state.expenseLog = Array.from({ length: 10 }, () => ({ amount: 100, date: start + 1000, by: name30 }));
      const m2 = app.buildShiftReportMessage(Object.assign({}, base, { expenses: exps, expensesTotal: 99999 * 40, otherExpensesTotal: 99999 * 40,
        drawerExpensesTotal: 0, closedBy: name30.repeat(4), unsettledCount: 3, invalidBills: ['a'] }));
      assert.ok(m2.length <= 4000, 'ยาว ' + m2.length);
      assert.equal(m2.isWellFormed(), true);
      for (const must of ['ยอดขายรวม', 'เงินสดที่ควรมีในลิ้นชัก', 'เงินสดที่นับได้จริง', 'ส่วนต่าง (ขาด/เกิน)', 'รวมค่าใช้จ่าย']) assert.ok(m2.includes(must), 'ขาด ' + must);
      assert.match(m2, /และอีก \d+ รายการ \(ดูในหน้ารายงาน\)/);
      // โน้ต/ชื่อที่เต็มไปด้วย < & > (escape แล้วยาวขึ้นราว 4 เท่า) — 15 รายการเกินเพดานแน่ ต้องลดจำนวนที่แจกแจงลง
      const heavy = Array.from({ length: 40 }, () => ({ amount: 99999, note: '<&>'.repeat(20), by: '<&>'.repeat(10), approvedBy: '<&>'.repeat(10), paidFrom: 'other' }));
      const m4 = app.buildShiftReportMessage(Object.assign({}, base, { expenses: heavy, expensesTotal: 99999 * 40, closedBy: 'เอ' }));
      assert.ok(m4.length <= 4000, 'ยาว ' + m4.length);
      const shown = (m4.match(/ลงโดย/g) || []).length;
      assert.ok(shown > 0 && shown < 15, 'ต้องลดจำนวนรายการที่แจกแจง (แสดง ' + shown + ')');
      assert.match(m4, new RegExp('และอีก ' + (40 - shown) + ' รายการ'));
      assert.ok(m4.includes('ส่วนต่าง (ขาด/เกิน)'), 'ตัวเลขสรุปเงินต้องอยู่ครบ');
      // กรณีปกติ (ค่าใช้จ่าย 15 รายการสั้น ๆ) ยังแจกแจงครบ 15
      const m3 = app.buildShiftReportMessage(Object.assign({}, base, { expenses: Array.from({ length: 15 }, (_, i) => ({ amount: 10, note: 'น้ำแข็ง', by: 'เอ' })) }));
      assert.equal((m3.match(/ลงโดย/g) || []).length, 15);
    } finally { s.dispose(); }
  });
  await test('ข้อ10 Telegram ตอบ "message is too long" → สาเหตุที่เจ้าของเห็นเป็นภาษาคน (ทางส่งจริง postTelegram)', async () => {
    const s = await shop();
    try {
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100123';
      s.app.fetchWithTimeout = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: message is too long' }) });
      s.app._cloudFailReason = '';
      assert.equal(await s.app.postTelegram('x'), false);
      assert.match(s.app._cloudFailReason, /ยาวเกินที่ Telegram รับ/);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 11: บิลวันที่ในอนาคตในไฟล์สำรอง ═══════════════════════════
  await test('ข้อ11 ไฟล์สำรองมีบิลวันที่ในอนาคต (+400 วัน) → แยกไว้ตรวจสอบ ไม่สร้างงานสรุปเดือนอนาคต · กล่องยืนยันเตือน · สำรองระหว่างกะไม่นับ', async () => {
    const s = await shop();
    try {
      const file = clone(s.app.buildBackupPayload());
      const fut = Date.now() + 400 * 86400e3, ok1 = Date.now() - 3600e3;
      const mk = (id, t) => ({ id, date: t, customerName: 'c', services: ['ตัดผม'], staffNames: ['เอ'], subtotal: 300, discount: 0, total: 300,
        paymentMethod: 'cash', syncStatus: 'synced', rev: 1, details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commissionAmount: 30, commission: 10, commissionType: 'percent' }] });
      file.transactions = [mk('TX-1791400000000-OKOKOKOK', ok1), mk('TX-1791400000000-FUTUREAA', fut)];
      const audit = s.app.auditBackupData(clone(file));
      assert.equal(audit.badDate, 1, 'ตัวตรวจไฟล์ต้องนับบิลวันที่ในอนาคต');
      assert.match(s.app.describeBackupAudit(audit), /วันที่ใช้ไม่ได้/);
      await s.app.applyBackupData(clone(file));
      assert.deepEqual(clone(s.app.state.transactions.map(t => t.id)), ['TX-1791400000000-OKOKOKOK']);
      assert.ok(s.app.state.quarantine.some(q => q.id === 'TX-1791400000000-FUTUREAA' && q.reasons.includes('future-date')), JSON.stringify(s.app.state.quarantine));
      const futMonth = s.app.getBusinessMonthKey(fut);
      assert.equal(s.app.state.cloudOutbox.some(j => j && j.needSummary && (j.monthKeys || []).includes(futMonth)), false, 'สร้างงานสรุปของเดือนอนาคต');
      // บิลที่ขายจริงในเครื่องวันนี้ยังผ่านตัวตรวจปกติ (กติกาใช้เฉพาะข้อมูลที่นำเข้า)
      assert.equal(s.app.validateBillRecord(mk('TX-1791400000000-NOWNOWNO', Date.now())).some(p => p.fatal), false);
      // สำรองระหว่างกะ: บิลวันที่อนาคตไม่ใช่ "บิลใหม่หลังสำรองล่าสุด"
      s.app.backupStatus = { lastSuccessAt: Date.now() - 1000 }; s.app.state.cloudOutbox = [];
      s.app.state.transactions.push(...Array.from({ length: 4 }, (_, i) => mk('TX-17914000000' + i + '0-NEWNEW0' + i, Date.now())), mk('TX-1791400000000-FUTUREBB', fut));
      assert.equal(s.app.planMidShiftBackup(), null, 'บิลใหม่จริง 4 ใบ + บิลอนาคต 1 ใบ ต้องยังไม่ถึงเกณฑ์ 5');
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 12–13: หน้าต่างรอง (อ่านอย่างเดียว) ═══════════════════════════
  await test('ข้อ12 หน้าต่างรองส่งออกไฟล์ .json ไม่ได้ (ข้อมูลเก่าตอนเปิดหน้าต่าง)', async () => {
    const s = await shop();
    try {
      let downloads = 0; s.app.downloadExportFile = () => { downloads++; return true; };
      s.app.isReadOnlyWindow = true;
      assert.equal(s.app.exportData({ downloadOnly: true, quiet: true }), false);
      assert.equal(downloads, 0);
      s.app.isReadOnlyWindow = false;
      assert.notEqual(s.app.exportData({ downloadOnly: true, quiet: true }), false, 'ควบคุม: หน้าต่างหลักส่งออกได้');
      assert.equal(downloads, 1);
    } finally { s.app.isReadOnlyWindow = false; s.dispose(); }
  });
  await test('ข้อ13 หน้าต่างรองของเครื่องใหม่ (รหัสเครื่องชั่วคราว) ไม่ยิง register_primary · cloudPost ปฏิเสธคำสั่งเขียนเมื่อบันทึกรหัสเครื่องไม่ได้', async () => {
    const s = await shop({ rows: { primaryStatus: null } });
    try {
      const sent = [];
      s.ctx.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body).action); return { ok: true, status: 200, json: async () => ({ status: 'success', details: {} }) }; };
      s.app.isReadOnlyWindow = true; s.app.primaryStatus = null;
      s.app._deviceIdUnsaved = true; s.app.deviceId = 'dev-' + 'f'.repeat(32);
      assert.equal(!!(await s.app.ensurePrimaryForFinancialMutation('ยกเลิกบิล')), false);
      await assert.rejects(s.app.cloudPost('register_primary', {}, 5000), /รหัสเครื่องยังไม่ได้บันทึก/);
      assert.deepEqual(sent, [], 'ส่งคำขอขึ้นชีตจากหน้าต่างรอง');
      // หน้าต่างรองของเครื่องที่บันทึกรหัสเครื่องแล้ว (ด่าน cloudPost ไม่เกี่ยว) — ensurePrimaryForFinancialMutation ต้องไม่ลงทะเบียนเอง
      s.app._deviceIdUnsaved = false;
      assert.equal(!!(await s.app.ensurePrimaryForFinancialMutation('ยกเลิกบิล')), false);
      assert.deepEqual(sent, [], 'หน้าต่างรองลงทะเบียนเครื่องหลักแทนหน้าต่างหลัก');
      s.app._deviceIdUnsaved = true;
      // ควบคุม: หน้าต่างหลักบันทึกรหัสเครื่องให้ก่อนแล้วส่งต่อได้
      s.app.isReadOnlyWindow = false;
      await s.app.cloudPost('register_primary', {}, 5000);
      assert.deepEqual(sent, ['register_primary']);
      assert.equal(s.app._deviceIdUnsaved, false); assert.equal(await s.raw('deviceId'), 'dev-' + 'f'.repeat(32));
    } finally { s.app.isReadOnlyWindow = false; s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 14: ออกจากระบบแล้วงานของคนก่อนต้องไม่ค้าง ═══════════════════════════
  await test('ข้อ14 ออกจากระบบ/สลับผู้ใช้ → ตะกร้า คิวที่เลือก ร่างแก้บิล รอบชำระเงิน ถูกล้าง และปุ่มอัปเดตแอปกดได้', async () => {
    const s = await shop({ role: 'staff' });
    try {
      readyCheckout(s);
      s.app.state.selectedQueueIds = ['q-1'];
      s.app._editTxDraft = { txId: 'TX-1', details: [] };
      assert.ok(s.app._checkoutAttempt, 'เงื่อนไขเทสต์: เปิดรอบชำระเงินไว้');
      assert.equal(s.app.canApplyAppUpdate(), false, 'เงื่อนไขเทสต์: ตะกร้าค้างกันอัปเดต');
      s.app.logout();
      assert.equal(s.app.state.cart.length, 0); assert.equal((s.app.state.selectedQueueIds || []).length, 0);
      assert.equal(s.app._editTxDraft, null); assert.equal(s.app._checkoutAttempt, null);
      assert.equal(s.app.canApplyAppUpdate(), true);
      // คนถัดไปล็อกอินแล้วกดชำระเงินทันที → ไม่มีบิลของตะกร้าคนก่อน
      loginAs(s.app, 'staff');
      const before = s.app.state.transactions.length;
      try { await s.app.processCheckout(); } catch (e) { /* ปฏิเสธได้ */ }
      assert.equal(s.app.state.transactions.length, before);
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 15: ใบแจ้งยอดกับส่วนลดผิดกติกา ═══════════════════════════
  await test('ข้อ15 ปุ่ม "ใบแจ้งยอด" เมื่อส่วนลดมีทศนิยม/ติดลบ → เตือนบนจอ ไม่ใช่ error เงียบ ๆ', async () => {
    const s = await shop();
    try {
      for (const v of ['12.5', '-5']) {
        readyCheckout(s); s.document.getElementById('cart-discount').value = v;
        s.document.getElementById('quote-preview').innerHTML = '';
        s.toasts.length = 0;
        let threw = null; try { s.app.showQuotePreview(); } catch (e) { threw = e; }
        assert.equal(threw, null, 'โยน error ออกจากปุ่ม: ' + (threw && threw.message));
        assert.ok(s.toasts.some(t => t.ty === 'warning' && /ส่วนลด/.test(t.m)), JSON.stringify(s.toasts));
        assert.equal(s.document.getElementById('quote-preview').innerHTML, '', 'ห้ามออกใบแจ้งยอดด้วยส่วนลดที่ผิด');
      }
      readyCheckout(s); s.document.getElementById('cart-discount').value = '10';
      s.app.showQuotePreview();
      assert.match(s.document.getElementById('quote-preview').innerHTML, /฿/, 'ควบคุม: ส่วนลดถูกต้องออกใบแจ้งยอดได้');
    } finally { s.dispose(); }
  });

  // ═══════════════════════════ ข้อ 16: ชื่อเครื่องที่ขึ้นต้นด้วย + - = @ หรือตัวเลข ═══════════════════════════
  await test('ข้อ16 Apps Script: ชื่อเครื่อง "+66 iPad" / "0812" กลับมาตามเดิม (ไม่มี \' นำหน้า) · จุดที่ลงชีตยังผ่าน safeCell', async () => {
    const gas = createGasEnv();
    const DEV = 'dev-' + 'a'.repeat(32), DEV2 = 'dev-' + 'b'.repeat(32);
    const t0 = Date.UTC(2026, 9, 1, 5);
    const bill = (id, extra) => Object.assign({ action: 'transaction', deviceId: DEV, id, date: new Date(t0).toISOString(),
      dateTimeStr: new Date(t0 + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19), monthKey: '10-2026',
      customerName: 'ก', services: ['นวด'], staffNames: ['เอ'], subtotal: 100, discount: 0, total: 100, paymentMethod: 'cash', rev: 1, revEpoch: 0,
      nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0 }, extra || {});
    assert.equal(gas.post(bill('TX-R16-000001', { deviceLabel: '+66 iPad หน้าร้าน' })).status, 'success');
    let r = gas.post({ action: 'primary_status', deviceId: DEV2 });
    assert.equal(r.details.primary.label, '+66 iPad หน้าร้าน');
    r = gas.post(bill('TX-R16-000002', { deviceId: DEV2 }));
    assert.equal(r.code, 'NOT_PRIMARY_DEVICE'); assert.ok(r.message.includes('(+66 iPad หน้าร้าน)'), r.message);
    assert.equal(gas.ctx.cleanDeviceLabel_('0812'), '0812');
    assert.equal(gas.ctx.cleanDeviceLabel_('  =SUM(A1)\n'), '=SUM(A1)');
    const src = require('fs').readFileSync(process.env.POS_GAS_SRC || require('path').join(__dirname, '..', 'google_apps_script.js'), 'utf8');
    assert.equal((src.match(/safeCell\(cleanDeviceLabel_\(data\.deviceLabel\)\)/g) || []).length, 2, 'แถวหลักฐานบนแท็บ _POS_RECOVERY_ACCEPTED ต้องผ่าน safeCell');
  });

  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL ไฟล์เทสต์ล้มกลางทาง ->', e && e.stack); process.exit(1); });
