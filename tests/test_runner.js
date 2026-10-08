// ตรวจ "ด่านของ deploy" เอง (ตรวจ 8 ต.ค. 2569 ข้อ 7/17) — run-all.js / run-all-ui.js ต้องไม่นับไฟล์ที่ไม่ได้ตรวจจริงว่าผ่าน
// สร้างไฟล์เทสต์หลอกในโฟลเดอร์ชั่วคราว แล้ว spawn ตัวรันจริงด้วย --only (ไม่แตะรายการไฟล์ของ deploy)
//   ว่างเปล่า · รอ promise ที่ไม่มีวันตอบแล้ว Node ออกเอง (exit 0 ไม่มีสรุป) · ค้างตลอดไป · FAIL ลง stderr แต่ exit 0
//   · สรุปบอกไม่ผ่านแต่ exit 0  → ต้องได้ exit 1 ทุกตัว
//   ไฟล์ที่ดี (สรุปทั้งสองรูปแบบ) → exit 0  (กันตัวรันที่ "ไม่ผ่านทุกอย่าง" ซึ่งก็ไม่ได้ตรวจอะไรเหมือนกัน)
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS', name); } catch (e) { fail++; console.log('  FAIL', name, '->', e.message); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-runner-'));
const FAKE = {
  'fake_empty.js': '// ไม่พิมพ์อะไร exit 0\n',
  'fake_stalled.js': "(async () => { console.log('PASS ข้อแรก'); await new Promise(() => {}); console.log('=== ผ่าน 2 · ไม่ผ่าน 0 ==='); })();\n",
  'fake_hang.js': "console.log('PASS ข้อแรก'); setInterval(() => {}, 1000);\n",
  'fake_stderr_fail.js': "console.error('FAIL เขียนลง stderr'); console.log('=== ผ่าน 3 · ไม่ผ่าน 0 ===');\n",
  'fake_summary_bad.js': "console.log('=== ผ่าน 3 · ไม่ผ่าน 1 ===');\n",
  'fake_good.js': "console.log('PASS ตรวจว่าเมื่อ FAIL แล้วต้องไม่ผ่าน'); console.log('   FAILSAFE'); console.log('=== ผ่าน 2 · ไม่ผ่าน 0 ===');\n",
  'fake_good2.js': "console.log('ผ่าน 5 / ล้มเหลว 0');\n"
};
Object.keys(FAKE).forEach(f => fs.writeFileSync(path.join(dir, f), FAKE[f]));
const runner = (script, files) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), '--only=' + files.map(f => path.join(dir, f)).join(','), '--timeout-ms=4000'],
    { encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: Object.assign({}, process.env, { TZ: 'Asia/Bangkok' }), windowsHide: true });
  return { status: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
};
try {
  for (const script of ['run-all.js', 'run-all-ui.js']) {
    console.log('\n  · ' + script);
    for (const [f, why] of [['fake_empty.js', 'ไม่มีบรรทัดสรุป'], ['fake_stalled.js', 'ไม่มีบรรทัดสรุป'], ['fake_hang.js', 'ค้างเกิน'],
      ['fake_stderr_fail.js', 'มีเทสต์ล้ม'], ['fake_summary_bad.js', 'มีเทสต์ล้ม']]) {
      const r = runner(script, [f]);
      t(`${script} ${f} → exit 1 (${why})`, () => {
        if (r.status !== 1) throw new Error('exit ' + r.status + ' :: ' + r.out.slice(-300));
        if (!r.out.includes(f)) throw new Error('ตัวรันไม่ได้รันไฟล์ที่ระบุ :: ' + r.out.slice(-300));
        if (!r.out.includes(why)) throw new Error('ไม่บอกเหตุผล "' + why + '" :: ' + r.out.slice(-300));
      });
    }
    const g = runner(script, ['fake_good.js', 'fake_good2.js']);
    t(`${script} ไฟล์ที่ดี (สรุปทั้งสองแบบ · ชื่อเทสต์มีคำว่า FAIL) → exit 0`, () => {
      if (g.status !== 0) throw new Error('exit ' + g.status + ' :: ' + g.out.slice(-400));
      if (!g.out.includes('fake_good2.js')) throw new Error('ตัวรันไม่ได้รันไฟล์ที่ระบุ');
    });
    const mix = runner(script, ['fake_good.js', 'fake_stalled.js']);
    t(`${script} ดี 1 + ค้างเงียบ 1 → exit 1 (ไฟล์เดียวพอให้ทั้งชุดไม่ผ่าน)`, () => { if (mix.status !== 1) throw new Error('exit ' + mix.status); });
  }
  const src = fs.readFileSync(path.join(__dirname, 'run-all.js'), 'utf8');
  t('run-all.js มีไฟล์เทสต์นี้ในชุดของ deploy', () => { if (!/'test_runner\.js'/.test(src)) throw new Error('ไม่อยู่ในรายการ'); });
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* โฟลเดอร์ชั่วคราว */ }
}
console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
