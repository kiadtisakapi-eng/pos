// ตัวตัดสิน "ไฟล์เทสต์นี้ผ่านไหม" ของ run-all.js และ run-all-ui.js (ใช้ตัวเดียวกัน — แยกกันเมื่อไหร่ แก้ที่หนึ่งแล้วลืมอีกที่)
// ตรวจ 8 ต.ค. 2569 ข้อ 7/17:
//   · เดิมตัดสิน "ผ่าน" จากการ "ไม่พบ" บรรทัด FAIL เท่านั้น — ไฟล์ที่ไปรอ promise ที่ไม่มีวันตอบ (stub DB/Web Lock ไม่ resolve)
//     Node ออกเงียบ ๆ ด้วย exit 0 ก่อนถึงบรรทัดสรุป → นับว่าผ่าน ทั้งที่เทสต์ครึ่งไฟล์ไม่ได้รัน · ไฟล์ว่างก็นับผ่าน
//     → ตอนนี้ "ต้องมี" บรรทัดสรุป ( === ผ่าน N · ไม่ผ่าน M ===  หรือ  ผ่าน N / ล้มเหลว M ) ไม่มี = ไม่ผ่าน
//   · เดิมทางสำเร็จอ่านแค่ stdout — FAIL ที่พิมพ์ลง stderr หลุด → ตอนนี้อ่านทั้งสองทาง
//   · เดิมไม่มีเวลาจำกัด — เทสต์ค้าง = หน้าต่าง deploy นิ่งที่ "[2/6] running tests" ตลอดไปโดยไม่บอกว่าไฟล์ไหน
//     → ตัดที่ 5 นาทีต่อไฟล์ (ไฟล์ตรรกะที่ช้าสุด ~10 วิ) แล้วบอกชื่อไฟล์ที่ค้าง
const { spawnSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = 300000;
const SUMMARY_RE = /===\s*ผ่าน\s*\d+\s*·\s*ไม่ผ่าน\s*\d+\s*===|ผ่าน\s*\d+\s*\/\s*ล้มเหลว\s*\d+/;
const SUMMARY_BAD_RE = /===\s*ผ่าน\s*\d+\s*·\s*ไม่ผ่าน\s*[1-9]\d*\s*===|ผ่าน\s*\d+\s*\/\s*ล้มเหลว\s*[1-9]\d*/;

// คืน { ok, why, out, failLines, lastLine }
function runTestFile(nodeRuntime, file, env, timeoutMs) {
  const r = spawnSync(nodeRuntime, [file], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env,
    timeout: timeoutMs || DEFAULT_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  const stdout = String(r.stdout || ''), stderr = String(r.stderr || '');
  const out = stdout + (stderr ? '\n' + stderr : '');
  const failLines = out.split('\n').filter(l => /^\s*FAIL\b/.test(l) || l.includes('❌'));
  const lastLine = (stdout.trim().split('\n').pop() || '').trim();
  const res = (ok, why) => ({ ok, why, out, failLines, lastLine });
  const mins = Math.round((timeoutMs || DEFAULT_TIMEOUT_MS) / 60000 * 10) / 10;
  if ((r.error && r.error.code === 'ETIMEDOUT') || r.signal === 'SIGKILL') return res(false, `ค้างเกิน ${mins} นาที — ถูกหยุด`);
  if (r.error) return res(false, 'เริ่มไฟล์ไม่ได้: ' + (r.error.message || r.error));
  if (r.status !== 0) return res(false, `ออกด้วย exit code ${r.status === null ? r.signal : r.status}`);
  if (failLines.length || SUMMARY_BAD_RE.test(out)) return res(false, 'exit code 0 แต่มีเทสต์ล้ม');
  if (!SUMMARY_RE.test(out)) return res(false, 'ไม่มีบรรทัดสรุป — เทสต์จบก่อนเวลา? (รอ promise ที่ไม่มีวันตอบ/ไฟล์ว่าง)');
  return res(true, '');
}

// อ่านตัวเลือกจากบรรทัดคำสั่ง (ไม่ใช้ตัวแปรสภาพแวดล้อม — ค่าที่ค้างในเครื่องต้องไม่ทำให้ด่าน deploy รันไม่ครบเงียบ ๆ)
//   --only=a.js,b.js   รันเฉพาะไฟล์ที่ระบุ (ใช้ใน tests/test_runner.js)
//   --timeout-ms=N     เวลาจำกัดต่อไฟล์
function parseArgs(argv) {
  const o = { only: null, timeoutMs: DEFAULT_TIMEOUT_MS };
  (argv || []).forEach(a => {
    let m = /^--only=(.+)$/.exec(a);
    if (m) o.only = m[1].split(',').map(s => s.trim()).filter(Boolean);
    m = /^--timeout-ms=(\d+)$/.exec(a);
    if (m && Number(m[1]) > 0) o.timeoutMs = Number(m[1]);
  });
  return o;
}

module.exports = { runTestFile, parseArgs, DEFAULT_TIMEOUT_MS, SUMMARY_RE, SUMMARY_BAD_RE };
