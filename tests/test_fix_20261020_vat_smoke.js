// ตรวจทั้งระบบ 19 ต.ค. 2569 ข้อ 69 — เดินร้านแบบเปิด VAT ข้ามหลายวัน (รอบสั้น 3 seed)
// แอปจริง (Dexie จริง) ต่อ Apps Script จริง + นาฬิกาจำลอง: ขาย/แก้/ยกเลิกบิล · สลับ VAT · ค่าธรรมเนียมบัตร · ปิด-เปิดกะ ·
// ค่าใช้จ่าย แล้วเทียบทุกบิล/แถวชีต/แท็บสรุป/สรุปรายเดือน/รายงานในแอป/Telegram กับตัวคำนวณอิสระ (tests/vat_e2e_oracle.js)
// รอบเต็ม (หลาย seed): TZ=Asia/Bangkok node tests/fuzz_vat_e2e.js 1 80
// พบปัญหาแม้ข้อเดียว = exit 1 · POS_APP_SRC / POS_GAS_SRC ใช้ได้เหมือนเทสต์อื่น (ลองใส่บั๊กแล้วต้องตก)
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { runSeed } = require('./fuzz_vat_e2e.js');
const SEEDS = (process.env.VAT_SMOKE_SEEDS || '1,2,3').split(',').map(Number).filter(Number.isFinite);

(async () => {
  let passed = 0, failed = 0;
  const started = Date.now();
  for (const seed of SEEDS) {
    let res;
    try { res = await runSeed(seed); }
    catch (e) { res = { problems: [{ kind: 'crash', msg: (e && e.stack) || String(e) }] }; }
    const probs = res.problems || [];
    if (probs.length) {
      failed++;
      console.log(`  FAIL seed ${seed}: ${probs.length} ปัญหา`);
      probs.slice(0, 8).forEach(p => console.log('     - ' + p.kind + ': ' + String(p.msg).slice(0, 300)));
    } else { passed++; console.log(`  PASS seed ${seed}: ตัวเลขทุกจุดตรงกับตัวคำนวณอิสระ`); }
  }
  console.log(`  (${SEEDS.length} seed ใช้เวลา ${((Date.now() - started) / 1000).toFixed(1)} วินาที)`);
  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); console.log('\n=== ผ่าน 0 · ไม่ผ่าน 1 ==='); process.exit(1); });
