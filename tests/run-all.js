// รันเทสต์ทุกไฟล์รวดเดียว — ใช้ก่อน deploy ทุกครั้ง
const { execFileSync } = require('child_process');
const path = require('path');
// ใช้ runtime ตัวเดียวกับที่เริ่มชุดทดสอบ ไม่พึ่งคำว่า "node" ใน PATH
// สำคัญกับ Windows หลังเพิ่งติดตั้ง Node แต่หน้าต่าง PowerShell เดิมยังไม่รับ PATH ใหม่
const nodeRuntime = process.execPath;
const files = ['test_app.js','test_gas.js','test_gas_summary.js','test_shift_variance.js','test_update_flow.js','test_vat.js','test_edge.js','test_e2e.js','test_calc.js','test_promptpay.js','test_flows.js','test_datekey.js','test_quote.js','test_fullday.js','test_print.js','test_perf.js'];
let bad = 0;
files.forEach(f => {
  process.stdout.write(f.padEnd(26));
  try {
    const out = execFileSync(nodeRuntime, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    console.log((out.trim().split('\n').pop() || '').trim());
  } catch (e) {
    bad++;
    console.log('ไม่ผ่าน');
    const out = String((e.stdout || '') + (e.stderr || ''));
    out.split('\n').filter(l => l.includes('FAIL')).slice(0, 8).forEach(l => console.log('   ' + l.trim()));
  }
});
console.log(bad ? `\nมี ${bad} ไฟล์ไม่ผ่าน — อย่าเพิ่ง deploy` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
