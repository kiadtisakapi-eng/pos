// งานแก้ตรวจ 14 ต.ค. 2569 (fx1) — ข้อ 10 · 16 · 17
// ใช้แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จำลอง · เดินทางเดียวกับที่ผู้ใช้กดจริง
const { makeShop, readyCheckout, settle, loginAs, quiet, seed } = require('./fixtures_db');
const { createEnv, makeRunner, eq, ok } = require('./harness_db');
const { createGasEnv } = require('./gas_env');
const R = makeRunner('--- fix 14 Oct 2026 (fx1): ข้อ 10 · 16 · 17 ---');
const t = R.t;

// ช่องถามค่าของจริงมี removeAttribute (ตัวจำลองไม่มี) — เติมให้เหมือนเบราว์เซอร์
function promptInput(env) {
  const el = env.document.getElementById('prompt-modal-input');
  el.removeAttribute = function (k) { delete this._attrs[k]; };
  return el;
}
const submitPrompt = (env, value) => {
  env.document.getElementById('prompt-modal-input').value = value;
  env.document.getElementById('form-prompt').onsubmit({ preventDefault() {} });
};

(async () => {
  // ═══ ข้อ 10: หน้าต่างรหัสซ้อนกันสองอัน ═══════════════════════════════════════
  console.log('\n[ข้อ 10] ผู้จัดการกด "ยกเลิกบิล" ซ้ำสองที → หน้าต่าง PIN ซ้อนกัน');
  {
    const shop = await makeShop({ role: 'owner' });
    const { env, app } = shop;
    const input = promptInput(env);
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await app.processCheckout(); await settle(30);
    const tx = app.state.transactions.at(-1);
    ok(tx && !tx.voided, '(เงื่อนไข) มีบิลให้ยกเลิก');
    loginAs(app, 'manager');
    app.confirmPinStepUp = app._realConfirmPinStepUp;   // ใช้ด่าน PIN ตัวจริง
    env.document.getElementById('edit-tx-id').value = tx.id;
    env.document.getElementById('void-money-outcome').value = 'none';
    const v1 = app.voidTransaction();
    const v2 = app.voidTransaction();
    await settle(30);
    await t('หน้าต่าง PIN อันที่สอง (ที่เปิดอยู่) ยังเป็นช่องรหัส — PIN ไม่โชว์เป็นตัวอักษร', () =>
      eq([input.type, input.getAttribute('inputmode')], ['password', 'numeric']));
    submitPrompt(env, '222222');
    await v1; await v2; await app._confirmP; await settle(30);
    await t('(เงื่อนไข) ยกเลิกบิลสำเร็จครั้งเดียว', () => {
      ok(!app.state.transactions.some(x => x && x.id === tx.id && !x.voided), 'บิลยังไม่ถูกยกเลิก');
      eq(app.state.voidLog.filter(r => r && r.billId === tx.id).length, 1); });
    await t('หลังจบ ช่องกลับเป็นช่องข้อความธรรมดา (ไม่ค้าง password/แป้นตัวเลข)', () =>
      eq([input.type, input.getAttribute('inputmode')], ['text', null]));
    app.state.customers = [{ id: 'c-1', name: 'ลูกค้า', note: '' }];
    app.editCustomerNote('c-1');
    await t('หน้าต่าง "แก้โน้ตลูกค้า" ที่เปิดทีหลังพิมพ์ภาษาไทยได้ตามปกติ', () =>
      eq([input.type, input.getAttribute('inputmode')], ['text', null]));
    app.closeModal('modal-prompt');
    env.dispose();
  }

  console.log('\n[ข้อ 10] คำสั่งที่ต้องใช้ Owner key ถูกกดสองครั้ง → หน้าต่าง Owner key ซ้อนกัน');
  {
    let calls = 0;
    const env = createEnv({ fetch: async (url, o) => {
      calls++;
      const body = JSON.parse(o.body);
      const r = body.ownerKey ? { status: 'success', details: { files: [] } } : { status: 'error', code: 'OWNER_KEY_REQUIRED' };
      return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) };
    } });
    quiet(env.app);
    await seed(env, { googleSheetsUrl: 'https://script.google.com/macros/s/X/exec' });
    await env.app.init();
    loginAs(env.app, 'owner');
    const input = promptInput(env);
    const p1 = env.app.cloudPost('list_backups', {}, 5000, { owner: true }).catch(e => 'ERR');
    const p2 = env.app.cloudPost('list_backups', {}, 5000, { owner: true }).catch(e => 'ERR');
    await settle(40);
    await t('หน้าต่าง Owner key อันที่สองเป็นช่องรหัส (รหัสไม่โชว์)', () => eq(input.type, 'password'));
    submitPrompt(env, 'OWNERKEY-1234567890');
    await p1; const r2 = await p2;
    await t('(เงื่อนไข) คำขอที่ใส่รหัสสำเร็จ', () => eq(r2 && r2.status, 'success'));
    await t('หลังจบ ช่องถามค่ากลับเป็นช่องข้อความ', () => eq(input.type, 'text'));
    env.dispose();
  }

  // ═══ ข้อ 16: ตั้งเครื่องหลักตอนรหัสเครื่องยังไม่ได้บันทึก ═══════════════════════════
  console.log('\n[ข้อ 16] iPad ใหม่ได้สิทธิ์หน้าต่างหลักช้ากว่า 3 วิ แล้วเจ้าของกด "ตั้งเครื่องนี้เป็นเครื่องหลัก"');
  {
    const gas = createGasEnv();
    let held = false;
    // Web Locks จำลอง: ตอบช้า 3.3 วิ (เกินเส้นตาย 3 วิของ init) แล้วให้ล็อก
    const locks = { request(name, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      return new Promise((res, rej) => setTimeout(() => {
        const lock = held ? null : { name }; if (lock) held = true;
        Promise.resolve(cb(lock)).then(res, rej);
      }, 3300));
    } };
    const env = createEnv({ fetch: gas.fetch, locks });
    quiet(env.app);
    await seed(env, { googleSheetsApiToken: gas.token, deviceId: null, primaryStatus: null });   // เครื่องใหม่: ยังไม่มีรหัสเครื่อง
    await env.app.init();
    await t('(เงื่อนไข) เปิดแอปแบบอ่านอย่างเดียวไปก่อน (ได้สิทธิ์ช้า)', () => eq(env.app.isReadOnlyWindow, true));
    await settle(800);
    await t('(เงื่อนไข) ได้สิทธิ์หน้าต่างหลักแล้ว', () => eq(env.app.isReadOnlyWindow, false));
    await t('รับสิทธิ์แล้วบันทึกรหัสเครื่องลงเครื่องทันที', async () => {
      eq(env.app._deviceIdUnsaved, false); eq(await env.raw('deviceId'), env.app.deviceId); });
    const key = gas.setupOwnerKey();
    env.app.askOwnerKey = async () => key;
    loginAs(env.app, 'owner');
    const okClaim = await env.app.claimPrimaryDevice();
    await settle(100);
    await t('ตั้งเครื่องนี้เป็นเครื่องหลักได้', () => eq(okClaim, true));
    await t('สถานะเครื่องหลัก = เครื่องนี้', () => eq(!!(env.app.primaryStatus && env.app.primaryStatus.isPrimary), true));
    env.dispose();
  }

  console.log('\n[ข้อ 16] รหัสเครื่องยังไม่ได้บันทึกตอนกดตั้งเครื่องหลัก (คำสั่งอยู่ในช่วงดูแลข้อมูล) → ไม่ค้าง ไม่ขึ้นว่าหน้าต่างซ้ำ');
  {
    const shop = await makeShop({ unknownPrimary: true });
    const { env, app, gas, toasts } = shop;
    app._deviceIdUnsaved = true;
    app.deviceId = app.generateDeviceId();
    const key = gas.setupOwnerKey();
    app.askOwnerKey = async () => key;
    const res = await Promise.race([app.claimPrimaryDevice(), new Promise(r => setTimeout(() => r('ค้าง'), 8000))]);
    await settle(100);
    await t('ตั้งเครื่องหลักสำเร็จ (ไม่ค้างในคิว)', () => eq(res, true));
    await t('ไม่มีข้อความหลอกว่า "หน้าต่างเปิดซ้ำ"', () => ok(!toasts.some(x => /เปิดซ้ำ/.test(x.m)), JSON.stringify(toasts)));
    await t('รหัสเครื่องที่ใช้ลงทะเบียนถูกบันทึกในเครื่อง', async () => {
      eq(app._deviceIdUnsaved, false); eq(await env.raw('deviceId'), app.deviceId); });
    env.dispose();
  }

  // ═══ ข้อ 17: ลบหมวดหมดแล้วเปิดแอปใหม่ ═══════════════════════════════════════
  console.log('\n[ข้อ 17] เจ้าของลบหมวดตัวอย่างทีละหมวดจนหมด แล้วเปิดแอปใหม่');
  {
    const gas = createGasEnv();
    const shop = await makeShop({ gas, rows: { services: [], categories: [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false },
      { id: 'drinks', name: 'เครื่องดื่ม', icon: 'fa-mug-hot', vat: true }] } });
    const { env, app } = shop;
    app.deleteCategory('barber'); await app._confirmP; await settle(30);
    app.deleteCategory('drinks'); await app._confirmP; await settle(30);
    await t('(เงื่อนไข) ในเครื่องไม่มีหมวดเหลือ', async () => eq(await env.raw('categories'), []));
    env.dispose();
    const env2 = createEnv({ factory: env.factory, fetch: gas.fetch }); quiet(env2.app);
    await env2.app.init();
    await t('เปิดใหม่แล้วหมวดตัวอย่าง (รวมเครื่องดื่มที่ติด VAT) ไม่กลับมาเอง', () => eq(env2.app.state.categories, []));
    // กู้ไฟล์สำรองที่สร้างตอนไม่มีหมวด → ต้องได้ไม่มีหมวดเหมือนกัน
    const payload = JSON.parse(JSON.stringify(env2.app.buildBackupPayload()));
    env2.app.state.categories = [{ id: 'x1', name: 'ค้างจากเครื่อง', icon: 'fa-tag', vat: true }];
    loginAs(env2.app, 'owner');
    await env2.app.applyBackupData(payload, { acceptUnsynced: true });
    await t('กู้ไฟล์สำรองที่ไม่มีหมวด → หมวดในเครื่องตรงกับไฟล์ (ไม่มีหมวด)', () => eq(env2.app.state.categories, []));
    env2.dispose();
  }
  console.log('\n[ข้อ 17] เครื่องใหม่จริง (ไม่มีคีย์ categories เลย) ยังได้หมวดตัวอย่าง');
  {
    const env = createEnv(); quiet(env.app);
    await env.app.init();
    await t('เครื่องใหม่ได้หมวดตัวอย่าง 4 หมวด', () => eq(env.app.state.categories.map(c => c.id), ['barber', 'massage', 'premium', 'drinks']));
    env.dispose();
  }
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
