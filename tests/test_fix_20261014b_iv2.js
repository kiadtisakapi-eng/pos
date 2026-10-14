// ตรวจ 14 ต.ค. 2569 รอบ 2 — ผู้ตรวจอิสระ L2: กู้ไฟล์สำรองเดิมซ้ำ รายการ "แยกไว้ตรวจ" ต้องไม่นับเพิ่มทีละรอบ
const { makeShop, settle } = require(__dirname + '/fixtures_db');
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); } };
(async () => {
  const services = [{ id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
    { id: 's2', name: 'นวดพิเศษ', price: 500, duration: 60, category: 'barber', commission: 150, commissionType: 'percent' }];
  const { env, app } = await makeShop({ rows: { services } });
  await settle(700);
  const q = () => app.state.quarantine.filter(r => r.kind === 'service').map(r => r.id + ':' + r.reasons);
  t('เปิดแอป: แยกตรวจ 1 รายการ (s2 ค่าคอม 150%)', JSON.stringify(q()) === JSON.stringify(['s2:bad-commission']), JSON.stringify(q()));
  for (let i = 1; i <= 2; i++) {
    const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));
    await app.applyBackupData(file, { acceptUnsynced: true }); await settle(50);
    t(`กู้ไฟล์เดิมรอบที่ ${i}: ยังเป็น 1 รายการ`, q().length === 1, JSON.stringify(q()));
  }
  const s2 = app.state.services.find(s => s.id === 's2');
  t('บริการยังติดธงห้ามขาย', s2 && s2.priceInvalid === true);
  env.dispose();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
