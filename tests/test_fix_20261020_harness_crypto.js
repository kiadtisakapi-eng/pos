// ตรวจ 20 ต.ค. 2569 — สภาพทดสอบ harness_db: crypto ของเบราว์เซอร์จำลองต้องไม่ทำให้ Dexie commit ก่อนเวลาแบบสุ่ม
// อาการเดิม: test_batch6_real P6 ("เปิดแอปแล้วรู้ทันทีว่าไม่ใช่เครื่องหลัก") ตกนาน ๆ ครั้ง (ตอนเครื่องหนักราว 5%)
// สาเหตุ: Dexie ตอนโหลดเรียก crypto.subtle.digest เพื่อได้ promise ดั้งเดิมไว้คุม transaction ที่มี await ข้างใน
//   harness เดิมส่ง webcrypto ของ Node (คิดใน thread pool) — เสร็จช้าตอนเครื่องหนัก → transaction แรกที่มี await ข้างใน
//   commit ก่อนเวลา (PrematureCommitError) → saveState ล้ม → แอปทำงานเหมือนบันทึกไม่ได้
// ไฟล์นี้หน่วง webcrypto ของ Node 50ms ทุกครั้ง แล้วยืนยันว่าการบันทึกครั้งแรกหลังเปิดแอปยังผ่าน (harness เดิม = ตกทุกครั้ง)
const vm = require('vm');
const nodeCrypto = require('crypto');
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  PASS ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + ((e && e.message) || e)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

// หน่วง webcrypto ของ Node (เลียนแบบเครื่องหนัก) ก่อนโหลด harness
const wc = nodeCrypto.webcrypto;
const origDigest = wc.subtle.digest.bind(wc.subtle);
Object.defineProperty(wc.subtle, 'digest', {
  configurable: true,
  value: (...a) => new Promise(r => setTimeout(r, 50)).then(() => origDigest(...a))
});
const { createEnv } = require('./harness_db.js');
const settle = (ms) => new Promise(r => setTimeout(r, ms == null ? 20 : ms));

(async () => {
  console.log('\n[H1] crypto ของ harness_db: ผลถูกต้อง และเป็น promise ของหน้าเว็บจำลองที่เสร็จทันที');
  {
    const env = createEnv({});
    const P = vm.runInContext('Promise', env.ctx);
    const pr = vm.runInContext('crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"))', env.ctx);
    await t('digest คืน promise ของหน้าเว็บจำลอง (realm เดียวกับแอป)', () => ok(pr instanceof P, 'ได้ promise ของ Node แทน'));
    const buf = await pr;
    await t('SHA-256 ตรงกับ Node createHash', () => ok(Buffer.from(buf).toString('hex') === nodeCrypto.createHash('sha256').update('abc').digest('hex')));
    const b512 = await vm.runInContext('crypto.subtle.digest("SHA-512", new Uint8Array([0]))', env.ctx);
    await t('SHA-512 (ตัวที่ Dexie ใช้ตอนโหลด) ตรงกับ Node createHash', () => ok(Buffer.from(b512).toString('hex') === nodeCrypto.createHash('sha512').update(Buffer.from([0])).digest('hex')));
    let settled = false; pr.then(() => { settled = true; });
    await Promise.resolve(); await Promise.resolve();
    await t('promise เสร็จภายในไม่กี่ microtask (ไม่ต้องรอ thread pool)', () => ok(settled));
    const h = await env.app.hashPin('246810');
    // ค่าเดียวกับที่แอปคำนวณด้วย webcrypto จริง (SHA-256 ของ 'jahn_pos_v2_' + PIN) — PIN ที่บันทึกไว้แล้วยังตรงกันทุกตัว
    await t('hashPin ได้ค่าเดิม (SHA-256 ของ jahn_pos_v2_ + PIN)', () =>
      ok(h === nodeCrypto.createHash('sha256').update('jahn_pos_v2_246810').digest('hex'), String(h)));
    env.dispose();
  }

  console.log('\n[H2] webcrypto ของ Node ช้า 50ms → การบันทึกครั้งแรกหลังเปิดแอป (transaction ที่มี await ข้างใน) ต้องไม่ล้ม');
  for (let i = 0; i < 5; i++) {
    const env = createEnv({});
    const errors = [];
    env.ctx.console = { log() {}, info() {}, debug() {}, warn() {}, error: (...m) => errors.push(m.map(String).join(' ')) };
    // เขียนทันทีหลังโหลด (เหมือนแอปบันทึกครั้งแรกตอนบูต) — ผ่าน writeStateRowsCAS ตัวจริง
    let res, err = null;
    try { res = await env.app.writeStateRowsCAS([{ key: 'probeKey', value: i }]); } catch (e) { err = e; }
    const raw = await env.raw('probeKey');
    await t(`รอบ ${i + 1}: บันทึกสำเร็จ ไม่มี PrematureCommitError`, () => ok(!err && res === true && raw === i,
      err ? (err.name + ' ' + err.message) : ('res=' + res + ' raw=' + raw)));
    env.dispose();
    await settle(5);
  }

  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL ' + (e && e.stack || e)); console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail + 1} ===`); process.exit(1); });
