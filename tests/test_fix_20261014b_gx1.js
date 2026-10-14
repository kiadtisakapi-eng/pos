// งานแก้รอบ 2 ตรวจ 14 ต.ค. 2569 (gx1) — หน้าต่างรองได้สิทธิ์หน้าต่างหลักทีหลัง (takeOverAsWriter)
// ต้องทำงานระบบหลังโหลดให้ครบเท่า init: อ่าน clockAck ใหม่ · ย้ายบัญชีพนักงานรุ่นเก่า · ย้าย PIN เจ้าของ · วาดชื่อร้าน/ธีม/ป้าย
// ใช้แอปจริง + Dexie จริงบน fake-indexeddb (ฐานข้อมูลเดียวกันสองหน้าต่าง) + Web Locks จำลองที่ปล่อยล็อกเมื่อปิดหน้าต่าง
const { seed, quiet, loginAs, settle } = require('./fixtures_db');
const { createEnv, makeRunner, eq, ok, fidb } = require('./harness_db');
const R = makeRunner('--- fix 14 Oct 2026 round 2 (gx1): takeOverAsWriter ทำงานหลังโหลดครบเท่า init ---');
const t = R.t;

// Web Locks ของ origin เดียว: หน้าต่างแรกที่ขอได้ล็อก · คนที่รอ (ไม่ใช่ ifAvailable) ได้ต่อเมื่อเจ้าของปิดหน้าต่าง
function lockManager() {
  let holder = null; const waiters = [];
  const grant = (who, cb) => { holder = who; return Promise.resolve(cb({ name: 'jahn-pos-writer' })); };
  return {
    for(who) {
      return { request(name, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        if (!holder) return grant(who, cb);
        if (opts && opts.ifAvailable) return Promise.resolve(cb(null));
        return new Promise((res, rej) => waiters.push({ who, cb, res, rej }));
      } };
    },
    close(who) {   // ปิดหน้าต่าง = เบราว์เซอร์ปล่อยล็อกให้คนที่รอ
      if (holder !== who) return;
      holder = null;
      const w = waiters.shift();
      if (w) grant(w.who, w.cb).then(w.res, w.rej);
    },
    get holder() { return holder; }
  };
}

(async () => {
  const factory = new fidb.IDBFactory();
  const storage = {};
  const locks = lockManager();
  const NOW = Date.now();

  // ── หน้าต่าง A (เปิดก่อน = หน้าต่างหลัก) ──
  const A = createEnv({ factory, storage, locks: locks.for('A') });
  const toastsA = quiet(A.app);
  await seed(A, {
    googleSheetsUrl: '', googleSheetsApiToken: '',   // ไม่ต่อคลาวด์ (เทสต์นี้ไม่เกี่ยวกับชีต)
    shopName: 'ชื่อร้านเดิม', theme: 'dark',
    // บิลที่ลงตอนนาฬิกาเครื่องเดินเร็ว 3 ชม. → เวลาเครื่องตอนนี้ "ย้อนไปก่อนรายการล่าสุด"
    transactions: [{ id: 'TX-FAST', date: NOW + 3 * 3600e3, total: 300, subtotal: 300, discount: 0, paymentMethod: 'cash',
      services: ['ตัดผม'], details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ',
        commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber' }], syncStatus: 'pending' }]
  });
  await A.app.init();
  await t('(เงื่อนไข) A เป็นหน้าต่างหลัก', () => { eq(A.app.isReadOnlyWindow, false); eq(locks.holder, 'A'); });

  // ── หน้าต่าง B (เปิดซ้ำทีหลัง = อ่านอย่างเดียว รอสิทธิ์) ──
  const B = createEnv({ factory, storage, locks: locks.for('B') });
  const toastsB = quiet(B.app);
  let shopNameDrawn = null, themeDrawn = null;
  B.app.applyShopName = () => { shopNameDrawn = B.app.shopName; };
  B.app.applyTheme = () => { themeDrawn = B.app.theme; };
  await B.app.init();
  await t('(เงื่อนไข) B เปิดแบบอ่านอย่างเดียว', () => eq(B.app.isReadOnlyWindow, true));
  await t('(เงื่อนไข) B ตอนเปิด: เวลาเครื่องย้อนไปก่อนบิลล่าสุด → ผู้จัดการถูกล็อก', () => ok(B.app.clockBehindProblem()));

  // ── ที่หน้าต่าง A: เจ้าของยืนยันเวลาเครื่อง · กู้ไฟล์สำรองรุ่นเก่า (บัญชีพนักงานยังไม่มีระบบสิทธิ์) · เปลี่ยนชื่อร้าน/ธีม ──
  loginAs(A.app, 'owner');
  await t('(เงื่อนไข) A: เจ้าของยืนยันเวลาเครื่องสำเร็จ', async () => eq(await A.app.acknowledgeClock(), true));
  const oldFile = JSON.parse(JSON.stringify(A.app.buildBackupPayload()));
  oldFile.staff = [{ id: 'st-old', name: 'ช่างรุ่นเก่า', role: 'ช่าง' }];   // ไฟล์ก่อนมีบัญชีสิทธิ์ (ไม่มี accessLevel/pin)
  oldFile.shopName = 'ชื่อร้านใหม่'; oldFile.theme = 'light';
  await A.app.applyBackupData(oldFile, { acceptUnsynced: true, exactSettings: true });
  await settle(30);
  await t('(เงื่อนไข) ในฐานข้อมูลมีบัญชีรุ่นเก่า (ไม่มี accessLevel)', async () => {
    const st = (await A.raw('staff')).find(s => s.id === 'st-old');
    ok(st && !('accessLevel' in st), JSON.stringify(st)); });
  await t('(เงื่อนไข) ในฐานข้อมูลมีการยืนยันเวลาของเจ้าของ', async () => ok(await A.raw('clockAck')));

  // ── ปิดหน้าต่าง A → B ได้สิทธิ์หน้าต่างหลัก ──
  locks.close('A'); A.dispose();
  await settle(300);
  await t('(เงื่อนไข) B กลายเป็นหน้าต่างหลัก', () => eq(B.app.isReadOnlyWindow, false));
  await t('(เงื่อนไข) B โหลดบิลล่าสุดของ A แล้ว', () => ok(B.app.state.transactions.some(x => x.id === 'TX-FAST')));

  await t('B เห็นการยืนยันเวลาที่เจ้าของทำที่ A (อ่าน clockAck ใหม่)', async () => eq(B.app.clockAck, await B.raw('clockAck')));
  await t('B ไม่ฟ้อง "เวลาเครื่องย้อน" อีก', () => eq(B.app.clockBehindProblem(), null));
  loginAs(B.app, 'manager');
  await t('ผู้จัดการที่ B ยกเลิก/แก้บิลได้ (ไม่ถูกล็อกด้วยเวลาที่เจ้าของยืนยันแล้ว)', () => eq(B.app.refuseOnClockProblem('ยกเลิกบิล'), false));
  loginAs(B.app, null);

  await t('บัญชีรุ่นเก่าถูกเติม accessLevel/pin ในหน่วยความจำของ B', () => {
    const st = B.app.state.staff.find(s => s.id === 'st-old');
    eq([st.accessLevel, st.pin], ['staff', null]); });
  await t('และบันทึกลงเครื่องแล้ว (ไม่หายเมื่อเปิดแอปใหม่)', async () => {
    const st = (await B.raw('staff')).find(s => s.id === 'st-old');
    eq([st.accessLevel, st.pin], ['staff', null]); });
  await t('B วาดชื่อร้าน/ธีมของข้อมูลชุดใหม่', () => eq([shopNameDrawn, themeDrawn], ['ชื่อร้านใหม่', 'light']));
  await t('ไม่มีข้อความผิดพลาดระหว่างรับสิทธิ์', () => ok(!toastsB.some(x => x.ty === 'error'), JSON.stringify(toastsB)));

  // ── PIN เจ้าของแบบเก่า (ยังไม่ได้แฮช) ที่หน้าต่างหลักเดิมเขียนไว้ ──
  console.log('\n[PIN เจ้าของรุ่นเก่า] หน้าต่างรองได้สิทธิ์ แล้วฐานข้อมูลมี PIN เจ้าของที่ยังไม่ได้แฮช');
  {
    const factory2 = new fidb.IDBFactory(); const locks2 = lockManager();
    const C = createEnv({ factory: factory2, locks: locks2.for('C') }); quiet(C.app);
    await seed(C, { googleSheetsUrl: '', googleSheetsApiToken: '' });
    await C.app.init();
    const D = createEnv({ factory: factory2, locks: locks2.for('D') }); quiet(D.app);
    await D.app.init();
    // ค่าที่ isHashed ไม่รับ (64 ตัวแต่ตัวพิมพ์ใหญ่) — loadState ไม่ซ่อม แต่ migratePinIfNeeded ของ init ซ่อม
    const weird = 'A'.repeat(64);
    await C.db.state.put({ key: 'ownerPin', value: weird });
    locks2.close('C'); C.dispose();
    await settle(300);
    await t('(เงื่อนไข) D เป็นหน้าต่างหลักแล้ว', () => eq(D.app.isReadOnlyWindow, false));
    await t('PIN เจ้าของถูกแปลงเป็นแบบแฮชและบันทึก เหมือนตอนเปิดแอปปกติ', async () => {
      ok(D.app.isHashed(D.app.ownerPin)); eq(await D.raw('ownerPin'), D.app.ownerPin); });
    D.dispose();
  }

  B.dispose();
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
