// รันเทสต์ทุกไฟล์รวดเดียว — ใช้ก่อน deploy ทุกครั้ง
const { execFileSync } = require('child_process');
const path = require('path');
// ใช้ runtime ตัวเดียวกับที่เริ่มชุดทดสอบ ไม่พึ่งคำว่า "node" ใน PATH
// สำคัญกับ Windows หลังเพิ่งติดตั้ง Node แต่หน้าต่าง PowerShell เดิมยังไม่รับ PATH ใหม่
const nodeRuntime = process.execPath;

// ⚠️ บังคับ timezone ให้ทุกเทสต์ที่รันต่อจากนี้
// เทสต์หลายไฟล์วัดเรื่อง "วันทำการตัดตี 6" ซึ่งผลลัพธ์เปลี่ยนตาม timezone ของเครื่อง
// เครื่องที่ร้าน (Windows ไทย) ผ่านอยู่แล้ว แต่ถ้าไปรันบนเครื่องที่ตั้งเป็น UTC จะไม่ผ่านทันที
// ตรึงไว้ที่เวลาไทยเสมอ เพราะระบบนี้ใช้ที่ร้านในไทยที่เดียว
const childEnv = Object.assign({}, process.env, { TZ: process.env.TZ || 'Asia/Bangkok' });

// ── เทสต์ตรรกะล้วน ไม่ต้องลงอะไรเพิ่ม รันได้เสมอ ──────────────────────────
const files = ['test_app.js','test_gas.js','test_gas_summary.js','test_shift_variance.js','test_update_flow.js','test_vat.js','test_edge.js','test_e2e.js','test_calc.js','test_promptpay.js','test_flows.js','test_datekey.js','test_quote.js','test_fullday.js','test_print.js','test_perf.js','test_roles.js','test_core.js','verify.js'];

let bad = 0;
const run = (f) => {
  process.stdout.write(f.padEnd(26));
  try {
    const out = execFileSync(nodeRuntime, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: childEnv });
    console.log((out.trim().split('\n').pop() || '').trim());
  } catch (e) {
    bad++;
    console.log('ไม่ผ่าน');
    const out = String((e.stdout || '') + (e.stderr || ''));
    out.split('\n').filter(l => l.includes('FAIL') || l.includes('❌')).slice(0, 8).forEach(l => console.log('   ' + l.trim()));
  }
};

files.forEach(run);

// เทสต์หน้าจอ (เปิดเบราว์เซอร์จริง) แยกไปอยู่ run-all-ui.js
// ตั้งใจไม่รวมไว้ที่นี่: มันใช้เวลาหลายนาที ถ้าผูกกับ deploy จะต้องรอทุกครั้งที่แก้อะไรนิดเดียว
// ให้รันเองเมื่อแก้ CSS หรือโครงหน้าจอ:  node tests/run-all-ui.js
console.log(bad ? `\nมี ${bad} ไฟล์ไม่ผ่าน — อย่าเพิ่ง deploy` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
