// เทสต์หน้าจอ — เปิดเบราว์เซอร์จริง ใช้เวลาหลายนาที
// รันเองเมื่อแก้ CSS หรือโครงหน้าจอ (ไม่ได้ผูกกับ deploy เพราะจะหน่วงทุกครั้งที่แก้อะไรนิดเดียว)
//
//   ครั้งแรกต้องลงเครื่องมือก่อน:  npm i -D playwright
//   แล้วสั่ง:                      node tests/run-all-ui.js
//   อยากได้ภาพหน้าจอด้วย:          SHOT=pos node tests/responsive.js   (ภาพลงโฟลเดอร์ shots/)
const { execFileSync } = require('child_process');
const path = require('path');
const nodeRuntime = process.execPath;
const childEnv = Object.assign({}, process.env, { TZ: process.env.TZ || 'Asia/Bangkok' });

try { require.resolve('playwright'); }
catch (e) {
  console.log('ยังไม่ได้ลง Playwright — สั่ง  npm i -D playwright  ก่อน แล้วรันใหม่');
  process.exit(0);
}

const files = [
  ['browsertest.js', 'ไม่มีคำขอวิ่งออกนอกเครื่อง + ไอคอนขึ้นจริง'],
  ['offlinetest.js', 'ตัดเน็ตแล้วไอคอน/ฟอนต์ไทยยังขึ้น'],
  ['responsive.js',  '13 ขนาดหน้าจอ x 6 หน้า — ต้องไม่มีอะไรล้นออกนอกจอ'],
  ['modaltest.js',   '7 หน้าต่างป๊อปอัป x 6 ขนาด — ต้องกดปุ่มยืนยันถึงทุกช่อง'],
  ['uiguard.js',     'กันบั๊กเก่ากลับมา: ล็อกอินซ้อนใต้หน้าต่าง / ใบเสร็จถูกตัดตอนพิมพ์'],
  ['e2e_boot.js',    'ช่วงเปิดแอป + ปุ่มแจ้งเตือน/อัปเดต/ล็อก'],
  ['e2e_browser.js', 'เดินทั้งวันของร้าน: ล็อกอิน → เปิดกะ → ขาย → ค่าใช้จ่าย → ยกเลิกบิล → ปิดกะ'],
  ['e2e_settings.js','หลังร้าน: บริการ/หมวด/พนักงาน, QR พร้อมเพย์, สำรอง-นำเข้าข้อมูล'],
];
let bad = 0;
files.forEach(([f, what]) => {
  console.log('\n── ' + f + ' — ' + what);
  try {
    const out = execFileSync(nodeRuntime, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: childEnv });
    console.log(out.trimEnd());
  } catch (e) {
    bad++;
    console.log(String((e.stdout || '') + (e.stderr || '')).trimEnd());
    console.log('   ^^^ ไม่ผ่าน');
  }
});
console.log(bad ? `\nมี ${bad} ไฟล์ไม่ผ่าน` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
