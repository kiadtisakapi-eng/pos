// ตรวจ 14 ต.ค. 2569 รอบ 2 (gx3) — ค่าคอมผิดรูปของบริการ/สินค้าที่ "อยู่ในเครื่องอยู่แล้ว" ต้องเจอตั้งแต่เปิดแอป
//   เดิม (หลังรอบ fx3): ด่านอยู่ที่กู้ไฟล์กับตอนกดชำระเงิน — ข้อมูลรุ่นก่อนมีด่านไปติดตอนลูกค้ายืนรอจ่าย
//   [1] เปิดแอป → รายการค่าคอมผิดรูปถูกติดธงห้ามขาย + แยกไว้ตรวจ + เตือนบนจอ · รายการปกติไม่โดน
//   [2] loadState เองไม่เขียนฐานข้อมูล — บันทึกผ่าน persistLoadRepairs เท่านั้น
//   [3] หยิบใส่ตะกร้าไม่ได้ ข้อความบอกให้เจ้าของแก้ · หน้าตั้งค่าบอกรายการที่ต้องแก้
//   [4] เปิดแอปซ้ำ → ไม่แยกไว้ตรวจซ้ำ · เจ้าของแก้แล้วขายได้
//   [5] ร้านที่ข้อมูลปกติ → ไม่มีการซ่อม/บันทึกตอนเปิดแอป · ไฟล์สำรองจริง (ถ้ามีในเครื่อง) ไม่มีรายการโดนธง
const fs = require('fs');
const { makeShop, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- ตรวจ 14 ต.ค. 2569 รอบ 2 (gx3): ค่าคอมผิดรูปในเครื่อง ---');
const t = R.t;
// ไฟล์สำรองจริงของร้าน (audit/ ไม่ขึ้น repo): POS_REAL_BACKUP หรือไฟล์ pos_backup_*.json ใหม่สุดใน audit/ — ไม่เขียนชื่อไฟล์จริงไว้ (ผลตรวจ 19 ต.ค. 2569 ข้อ 71)
const REAL = process.env.POS_REAL_BACKUP || (() => {
  const dir = require('path').join(__dirname, '..', 'audit');
  try { const f = require('fs').readdirSync(dir).filter(n => /^pos_backup_.*\.json$/.test(n)).sort().pop(); return f ? require('path').join(dir, f) : ''; } catch (e) { return ''; }
})();   // ไม่มีไฟล์ = ข้าม

const SVCS = [
  { id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's2', name: 'นวดพิเศษ', price: 500, duration: 60, category: 'barber', commission: 150, commissionType: 'percent' },
  { id: 's3', name: 'สระ', price: 200, duration: 20, category: 'barber', commission: 7.5, commissionType: 'percent' },
  { id: 's4', name: 'แพ็กเกจ', price: 500, duration: 60, category: 'barber', commission: 700, commissionType: 'fixed' },
  { id: 's5', name: 'เต็มร้อย', price: 100, duration: 10, category: 'barber', commission: 100, commissionType: 'percent' },
  { id: 's6', name: 'ทรีตเมนต์', price: 400, duration: 30, category: 'barber', commission: 12.5, commissionType: 'fixed' },
  { id: 's7', name: 'บริการเก่า', price: 250, duration: 30, category: 'barber' },   // ไม่มีช่องค่าคอม = 0 (กติกาเดิม)
  { id: 'd1', name: 'น้ำ', price: 20, duration: 0, type: 'product', category: 'drinks', commission: 0, commissionType: 'fixed' }
];
const BAD = ['s2', 's3', 's6'];
const proto = (app, k) => Object.getPrototypeOf(app)[k].bind(app);

(async () => {
  // ═══ [2] loadState ไม่เขียน · [1] persistLoadRepairs บันทึก ═══
  {
    const { env, app } = await makeShop({ noInit: true, rows: { services: JSON.parse(JSON.stringify(SVCS)) } });
    const svc = id => app.state.services.find(s => s.id === id);
    await t('[1.1] ค่าคอม 150% · 7.5% · บาท 12.5 → ติดธงห้ามขายตั้งแต่เปิดแอป', () => ok(BAD.every(id => svc(id).priceInvalid === true),
      JSON.stringify(BAD.map(id => svc(id)))));
    await t('[1.2] ค่าปกติ (10% · 100% · บาท 700 เกินราคา · ไม่มีช่องค่าคอม · สินค้า 0) ไม่โดน', () =>
      ok(['s1', 's4', 's5', 's7', 'd1'].every(id => svc(id).priceInvalid !== true)));
    await t('[1.3] แยกไว้ตรวจ 3 รายการ พร้อมค่าต้นฉบับ', () => {
      const q = app.state.quarantine.filter(r => r.kind === 'service' && (r.reasons || []).includes('bad-commission'));
      eq(q.map(r => r.id).sort(), BAD.slice().sort());
      ok(q.find(r => r.id === 's2').original.commission === 150);
    });
    await t('[2.1] loadState เองไม่เขียนฐานข้อมูล (ยังไม่มีธงในเครื่อง)', async () => {
      const raw = await env.raw('services');
      ok(raw.every(s => s.priceInvalid !== true), 'มีธงในฐานข้อมูลก่อน persistLoadRepairs');
      eq((await env.raw('quarantine')).length, 0);
    });
    const saved = await app.persistLoadRepairs();
    await t('[2.2] บันทึกผ่าน persistLoadRepairs', async () => {
      ok(saved === true);
      const raw = await env.raw('services');
      eq(raw.filter(s => s.priceInvalid === true).map(s => s.id).sort(), BAD.slice().sort());
      eq((await env.raw('quarantine')).length, 3);
    });
    env.dispose();
  }

  // ═══ [1]/[3]/[4] ทางที่ผู้ใช้เดินจริง: เปิดแอป → เตือน → หยิบไม่ได้ → หน้าตั้งค่า → แก้ → ขายได้ ═══
  {
    const fidb = require('./vendor/fake-indexeddb.cjs');
    const factory = new fidb.IDBFactory();
    const { env, app, toasts } = await makeShop({ factory, rows: { services: JSON.parse(JSON.stringify(SVCS)) } });
    await settle(700);
    await t('[1.4] เปิดแอปแล้วมีคำเตือนบนจอ บอกจำนวนและที่ที่ต้องแก้', () => ok(toasts.some(x => /3 รายการ/.test(x.m) && /ค่าคอม/.test(x.m) && /ตั้งค่า/.test(x.m)),
      JSON.stringify(toasts)));
    app.state.cart = [];
    app.addToCart('s2');
    await t('[3.1] หยิบรายการค่าคอมผิดรูปใส่ตะกร้าไม่ได้ · ข้อความบอกให้เจ้าของแก้ที่หน้าตั้งค่า', () =>
      ok(app.state.cart.length === 0 && toasts.some(x => /นวดพิเศษ/.test(x.m) && /เจ้าของ/.test(x.m) && /ตั้งค่า/.test(x.m)), JSON.stringify(toasts.slice(-1))));
    app.addToCart('s1');
    await t('[3.2] รายการปกติยังหยิบได้', () => eq(app.state.cart.length, 1));
    proto(app, 'renderSettingsLists')();
    const listHtml = env.document.getElementById('settings-services-list').innerHTML;
    await t('[3.3] หน้าตั้งค่า: รายการที่ต้องแก้มีป้าย "ขายไม่ได้" ครบ 3 รายการ (รายการอื่นไม่มี)', () =>
      eq((listHtml.match(/svc-invalid-note/g) || []).length, 3));
    await t('[3.4] กล่อง "แยกไว้ตรวจสอบ" ในหน้าตั้งค่าแสดงขึ้น', () => {
      const box = env.document.getElementById('quarantine-box');
      ok(box.style.display === 'block' && /ค่าคอม/.test(env.document.getElementById('quarantine-label').innerText),
        env.document.getElementById('quarantine-label').innerText);
    });
    env.dispose();
  }
  {
    // เปิดแอปซ้ำบนเครื่องเดิม (ฐานข้อมูลเดิมที่มีธงแล้ว — ไม่ seed ทับ)
    const fidb = require('./vendor/fake-indexeddb.cjs');
    const factory = new fidb.IDBFactory();
    const a = await makeShop({ factory, rows: { services: JSON.parse(JSON.stringify(SVCS)) } });
    await settle(50);
    const q1 = (await a.env.raw('quarantine')).length;
    a.env.dispose();
    const { createEnv } = require('./harness_db');
    const { quiet, loginAs } = require('./fixtures_db');
    const env = createEnv({ factory });
    const toasts = quiet(env.app);
    await env.app.init(); await settle(700);
    loginAs(env.app, 'owner');
    const app = env.app;
    await t('[4.1] เปิดแอปซ้ำ → ไม่แยกไว้ตรวจซ้ำ · ไม่เตือนซ้ำ', async () => {
      eq(q1, 3); eq((await env.raw('quarantine')).length, 3); eq(app.state.quarantine.length, 3);
      ok(!toasts.some(x => /ค่าคอมใช้ไม่ได้/.test(x.m)), JSON.stringify(toasts));
    });
    // เจ้าของแก้ค่าคอมในหน้าตั้งค่า
    app.editService('s3');
    env.document.getElementById('serv-type').value = 'service';
    env.document.getElementById('serv-commission').value = '8';
    env.document.getElementById('serv-commission-type').value = 'percent';
    env.document.getElementById('serv-duration').value = '20';
    await app.addService(); await settle(30);
    const s3 = app.state.services.find(s => s.id === 's3');
    await t('[4.2] เจ้าของแก้ค่าคอมแล้วธงหาย (บันทึกลงเครื่อง)', async () => {
      ok(s3.priceInvalid !== true && s3.commission === 8, JSON.stringify(s3));
      ok((await env.raw('services')).find(s => s.id === 's3').priceInvalid !== true);
    });
    app.state.cart = []; app.addToCart('s3');
    await t('[4.3] หยิบใส่ตะกร้าได้อีกครั้ง', () => eq(app.state.cart.length, 1));
    env.dispose();
  }

  // ═══ [5] ข้อมูลปกติ = ไม่มีการซ่อม · ไฟล์จริงไม่มีรายการโดนธง ═══
  {
    const { env, app } = await makeShop({ noInit: true });
    await t('[5.1] ร้านข้อมูลปกติ → ไม่มีรายการซ่อมตอนเปิดแอป · ไม่มีธง', () =>
      ok(app._loadRepairs.length === 0 && app.state.services.every(s => s.priceInvalid !== true) && app.state.quarantine.length === 0,
        JSON.stringify(app._loadRepairs)));
    env.dispose();
  }
  if (REAL && fs.existsSync(REAL)) {
    const file = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    const { env, app } = await makeShop({ noInit: true, rows: { services: file.services, categories: file.categories } });
    const n = (file.services || []).length;
    await t(`[5.2] ไฟล์สำรองจริง: บริการ ${n} รายการ ไม่มีรายการโดนธง ไม่มีรายการแยกไว้ตรวจ`, () =>
      ok(n > 0 && app.state.services.filter(s => s && s.priceInvalid === true).length === 0 && app.state.quarantine.length === 0 &&
        !app._loadRepairs.some(r => /ค่าคอม/.test(r)), `flagged=${app.state.services.filter(s => s && s.priceInvalid === true).length}`));
    env.dispose();
  } else {
    console.log('  (ข้าม [5.2] — ไม่มีไฟล์สำรองจริงในเครื่องนี้)');
  }
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
