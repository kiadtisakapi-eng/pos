// ตรวจ 19 ต.ค. 2569 ข้อ 5 + 54 — ข้อมูลในเครื่องหาย/เสียระหว่างใช้งาน (app.js จริง + IndexedDB จริง)
//   ข้อ 5: ที่เก็บข้อมูลถูกล้างขณะแอปเปิดอยู่ → บิลถัดไปต้องขายได้ และเขียนข้อมูลทั้งร้านจากหน้าจอกลับลงเครื่อง
//          (ไม่ใช่พักเป็นอ่านอย่างเดียว แล้วปุ่มแดงโหลดฐานว่างทับ) · สั่งสำรองขึ้น Drive · การล้างจริงจากอีกหน้าต่างยังถูกปฏิเสธ
//   ข้อ 54: แถวผิดชนิดต้องไม่ทำให้แอปค้างก่อนหน้าล็อกอิน · บิลผิดชนิด = จอโหลดไม่สำเร็จ · PIN เจ้าของที่เสียต้องไม่ถูกเขียนทับ
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_storage.js
process.env.TZ = 'Asia/Bangkok';
const { createEnv, makeRunner, eq, ok, fidb } = require('./harness_db.js');
const { makeShop, seed, quiet, loginAs, readyCheckout, settle } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 5 + 54: ข้อมูลในเครื่องหาย/เสีย ---');
const NO_CLOUD = { googleSheetsUrl: '', googleSheetsApiToken: '' };

async function sell(s, price) {
  s.app.vatEnabled = false;
  readyCheckout(s.env, [{ id: 's1', name: 'Synthetic', price }], 'cash', price);
  const r = await s.app.processCheckout(); await settle(40); return r;
}
async function evict(s) {
  // Safari ตัดการเชื่อมต่อ IndexedDB แล้วล้างข้อมูลของเว็บ → Dexie เปิดฐานใหม่ที่ว่างเปล่าเอง
  s.env.db.backendDB().close();
  const req = s.env.factory.deleteDatabase('EroticaPosDatabase');
  return new Promise(res => { req.onsuccess = () => res('deleted'); req.onerror = () => res('error'); req.onblocked = () => res('blocked'); });
}

(async () => {
  await R.t('ข้อ 5 ที่เก็บข้อมูลหายระหว่างเปิดแอป → บิลถัดไปขายได้ · ข้อมูลทั้งร้านกลับลงเครื่องครบ · มีงานสำรองขึ้น Drive · เตือนดัง', async () => {
    const s = await makeShop({});
    try {
      eq(await sell(s, 300), true); eq(await sell(s, 400), true);
      s.gas.networkDown = true;
      eq(await sell(s, 450), true);
      const pinBefore = s.app.ownerPin;
      eq(await evict(s), 'deleted');
      eq(await sell(s, 500), true, 'บิลถัดไปต้องขายได้');
      eq(!!s.app.isReadOnlyWindow, false, 'ต้องไม่ถูกพักเป็นอ่านอย่างเดียว');
      eq(((await s.env.raw('transactions')) || []).map(t => t.total), [300, 400, 450, 500], 'บิลทั้งหมดต้องกลับลงเครื่อง');
      eq((await s.env.raw('staff') || []).length, 2, 'พนักงานกลับลงเครื่อง');
      eq(await s.env.raw('shopName'), 'ร้านจริง');
      eq(await s.env.raw('googleSheetsUrl'), s.app.googleSheetsUrl, 'URL ชีตกลับลงเครื่อง');
      eq(await s.env.raw('ownerPin'), pinBefore, 'PIN เจ้าของไม่กลับเป็นค่าเริ่มต้น');
      eq(!!(await s.env.raw('shift') || {}).active, true, 'กะที่เปิดอยู่กลับลงเครื่อง');
      eq(await s.env.raw('db_migrated'), true);
      ok(((await s.env.raw('stateRevision')) || {}).rev >= 1, 'มีเลขรุ่นใหม่');
      const ob = (await s.env.raw('cloudOutbox')) || [];
      ok(ob.some(j => j && j.needBackup && (j.changeKinds || []).includes('storage-loss')) ||
         ob.some(j => j && j.needBackup), 'ต้องมีงานสำรองขึ้น Drive ในคิวที่ลงเครื่องแล้ว: ' + JSON.stringify(ob.map(j => j.reason)));
      ok(s.toasts.some(t => t.ty === 'error' && /ข้อมูลร้านในเครื่องหายไป/.test(t.m) && /Drive/.test(t.m)), 'ต้องเตือนดัง ๆ');
      // บันทึกครั้งถัดไปเป็นปกติ (ไม่เตือนซ้ำ)
      const n = s.toasts.length;
      eq(await sell(s, 600), true);
      ok(!s.toasts.slice(n).some(t => /หายไประหว่างเปิดแอป/.test(t.m)), 'ไม่เตือนซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 5 ไม่ได้ต่อชีต: เขียนกลับได้เหมือนกัน และบอกให้ส่งออกไฟล์สำรอง', async () => {
    const s = await makeShop({ rows: NO_CLOUD });
    try {
      eq(await sell(s, 300), true);
      eq(await evict(s), 'deleted');
      eq(await sell(s, 200), true);
      eq(((await s.env.raw('transactions')) || []).map(t => t.total), [300, 200]);
      ok(s.toasts.some(t => /ส่งออกข้อมูลสำรอง/.test(t.m)), 'ต้องบอกให้ส่งออกไฟล์สำรอง');
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 5 saveKeys (เช่นเปลี่ยนธีม) ตอนที่เก็บหาย → เขียนทั้งร้านกลับ + ค่าใหม่ของคีย์นั้นชนะ', async () => {
    const s = await makeShop({ rows: NO_CLOUD });
    try {
      eq(await sell(s, 300), true);
      eq(await evict(s), 'deleted');
      eq(await s.app.saveKeys([{ key: 'theme', value: 'dark' }]), true);
      eq(await s.env.raw('theme'), 'dark');
      eq(((await s.env.raw('transactions')) || []).map(t => t.total), [300]);
      eq(await s.env.raw('ownerPin'), s.app.ownerPin);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 5 การล้างข้อมูลจริงจากอีกหน้าต่าง: หน้าต่างที่ถือข้อมูลเก่ายังถูกปฏิเสธ (ไม่เขียนข้อมูลเก่าทับการล้าง)', async () => {
    const factory = new fidb.IDBFactory();
    const A = await makeShop({ factory, rows: NO_CLOUD });
    const B = createEnv({ factory });
    const bt = quiet(B.app);
    await B.app.init(); loginAs(B.app, 'owner');
    try {
      eq(await sell(A, 300), true);
      // หน้าต่าง B (โหลดข้อมูลล่าสุด) ล้างข้อมูลทั้งหมด
      await B.app.loadState();
      B.ctx.prompt = () => 'ลบทั้งหมด'; B.ctx.confirm = () => true;
      eq(await B.app.resetData(), true, 'B ล้างข้อมูลได้');
      eq(((await A.env.raw('transactions')) || []).length, 0, 'ล้างแล้วไม่มีบิล');
      eq(await sell(A, 999), false, 'A ต้องถูกปฏิเสธ');
      eq(!!A.app.isReadOnlyWindow, true);
      eq(((await A.env.raw('transactions')) || []).length, 0, 'บิลเก่าของ A ต้องไม่กลับมาทับการล้าง');
      ok(!A.toasts.some(t => /หายไประหว่างเปิดแอป/.test(t.m)), 'ไม่ใช่กรณีข้อมูลหาย');
    } finally { A.env.dispose(); B.dispose(); }
  });

  // ── ข้อ 54 ──
  async function boot(extra) {
    const env = createEnv({});
    const toasts = quiet(env.app);
    let loginShown = 0, fatalCalls = 0;
    env.app.requireLogin = () => { loginShown++; };
    const realFatal = env.app.showFatalLoadError.bind(env.app);
    env.app.showFatalLoadError = (e) => { fatalCalls++; return realFatal(e); };
    await seed(env, Object.assign({}, NO_CLOUD, extra));
    let initErr = null;
    try { await env.app.init(); } catch (e) { initErr = e.message; }
    await settle(30);
    const fatal = fatalCalls > 0;
    return { env, app: env.app, toasts, loginShown, initErr, fatal };
  }
  for (const [name, extra, key] of [['staff = {}', { staff: {} }, 'staff'], ['staff = null', { staff: null }, 'staff'],
      ['services = {}', { services: {} }, 'services'], ['customers = "x"', { customers: 'x' }, 'customers'], ['queue = 5', { queue: 5 }, 'queue']]) {
    await R.t(`ข้อ 54 ${name}: เปิดถึงหน้าล็อกอิน · ใช้รายการว่าง · ค่าเดิมเก็บไว้ในรายการแยกตรวจ (ลงเครื่องแล้ว)`, async () => {
      const r = await boot(extra);
      try {
        eq(r.initErr, null, 'init ต้องไม่ล้ม');
        ok(r.loginShown > 0, 'ต้องถึงหน้าล็อกอิน');
        eq(r.fatal, false); eq(!!r.app.loadFailed, false);
        eq(Array.isArray(r.app.state[key]) && r.app.state[key].length, 0);
        const q = (await r.env.raw('quarantine')) || [];
        const item = q.find(x => x && x.kind === 'load-list' && x.id === key);
        ok(item, 'ต้องมีรายการแยกตรวจในเครื่อง');
        eq(item.original, extra[key], 'เก็บค่าเดิมไว้');
        eq(await r.env.raw(key), [], 'แถวในเครื่องเป็นรายการว่างแล้ว (ค่าเดิมอยู่ในรายการแยกตรวจ)');
      } finally { r.env.dispose(); }
    });
  }
  for (const [name, extra] of [['transactions = {}', { transactions: {} }], ['transactions = null', { transactions: null }]]) {
    await R.t(`ข้อ 54 ${name}: จอ "โหลดข้อมูลร้านไม่สำเร็จ" · ไม่บันทึกทับ · ยังถึงหน้าล็อกอิน`, async () => {
      const r = await boot(extra);
      try {
        eq(r.initErr, null, 'init ต้องไม่ล้ม');
        eq(r.fatal, true, 'ต้องขึ้นจอโหลดไม่สำเร็จ');
        eq(!!r.app.loadFailed, true);
        ok(r.loginShown > 0, 'ต้องถึงหน้าล็อกอิน');
        eq(await r.env.raw('transactions'), extra.transactions, 'ไม่เขียนทับแถวบิลเดิม');
        eq(await r.app.saveState(), false, 'บันทึกถูกปิด');
      } finally { r.env.dispose(); }
    });
  }
  await R.t('ข้อ 54 PIN เจ้าของเสีย ("abc"): ใช้ 123456 ชั่วคราว แต่ขายบิลแล้ว PIN เดิมในเครื่องไม่ถูกเขียนทับ · เจ้าของตั้งใหม่แล้วจึงเปลี่ยน', async () => {
    const r = await boot({ ownerPin: 'abc' });
    try {
      eq(await r.app.isDefaultOwnerPin(), true, 'ในหน่วยความจำใช้ PIN เริ่มต้นชั่วคราว');
      eq(await r.env.raw('ownerPin'), 'abc', 'หลังเปิดแอปยังเป็นค่าเดิม');
      loginAs(r.app, 'staff');
      eq(await sell({ env: r.env, app: r.app }, 300), true);
      eq(await r.env.raw('ownerPin'), 'abc', 'ขายบิลแล้วต้องยังเป็นค่าเดิม (เดิมถูกเขียนทับด้วย 123456)');
      // เจ้าของตั้ง PIN ใหม่ (ค่าในหน่วยความจำเปลี่ยน) → บันทึกครั้งต่อไปเขียนค่าใหม่
      const newHash = await r.app.hashPin('135790');
      eq(await r.app.saveKeys([{ key: 'ownerPin', value: newHash }]), true);
      r.app.ownerPin = newHash;
      eq(await sell({ env: r.env, app: r.app }, 200), true);
      eq(await r.env.raw('ownerPin'), newHash, 'PIN ใหม่ต้องอยู่');
    } finally { r.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
