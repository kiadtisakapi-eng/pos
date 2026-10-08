// รันเทสต์ทุกไฟล์รวดเดียว — ใช้ก่อน deploy ทุกครั้ง
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
const files = ['test_audit_fixes.js','test_claude_review.js','test_claude_recheck.js','test_deploy_safety.js','test_db_state.js','test_batch2_real.js','test_batch3_real.js','test_batch4_real.js','test_batch5_real.js','test_batch6_real.js','test_batch7_real.js','test_batch8_real.js','test_batch9_real.js','test_batch10_real.js','test_batch11_real.js','test_batch12_real.js','test_card_fee_split.js','test_card_fee_vat.js','test_card_fee_regressions.js','test_card_fee_review.js','test_tool_dryrun.js','test_app.js','test_batch_a.js','test_batch_b.js','test_vat_sheet.js','test_batch_c.js','test_batch_d.js','test_tombstone.js','test_batch_e.js','test_batch_f.js','test_batch_g.js','test_batch_h.js','test_gas.js','test_gas_summary.js','test_shift_variance.js','test_update_flow.js','test_vat.js','test_edge.js','test_e2e.js','test_calc.js','test_promptpay.js','test_flows.js','test_datekey.js','test_quote.js','test_fullday.js','test_print.js','test_perf.js','test_roles.js','test_core.js','verify.js'];

let bad = 0;
files.unshift('test_recheck_fixes.js');
files.push('test_audit_20261008.js', 'test_audit_20261008_d.js', 'test_runner.js');
// ตัวตัดสินผ่าน/ไม่ผ่านอยู่ใน runner_judge.js (ใช้ร่วมกับ run-all-ui.js) — ต้องมีบรรทัดสรุป · อ่าน stderr · ค้างเกิน 5 นาที = ไม่ผ่าน
const { runTestFile, parseArgs } = require('./runner_judge');
const args = parseArgs((process.argv || []).slice(2));
const list = args.only || files;
if (args.only) console.log(`(รันเฉพาะ ${list.length} ไฟล์ตาม --only — ไม่ใช่ชุดเต็มของ deploy)`);
const run = (f) => {
  process.stdout.write(path.basename(f).padEnd(26));
  const r = runTestFile(nodeRuntime, path.resolve(__dirname, f), childEnv, args.timeoutMs);
  if (!r.ok) {
    bad++;
    console.log('ไม่ผ่าน (' + r.why + ')');
    r.failLines.slice(0, 8).forEach(l => console.log('   ' + l.trim()));
    if (!r.failLines.length) r.out.trim().split('\n').slice(-4).forEach(l => l.trim() && console.log('   ' + l.trim()));
    return;
  }
  console.log(r.lastLine);
};

list.forEach(run);

// เทสต์หน้าจอ (เปิดเบราว์เซอร์จริง) แยกไปอยู่ run-all-ui.js
// ตั้งใจไม่รวมไว้ที่นี่: มันใช้เวลาหลายนาที ถ้าผูกกับ deploy จะต้องรอทุกครั้งที่แก้อะไรนิดเดียว
// ให้รันเองเมื่อแก้ CSS หรือโครงหน้าจอ:  node tests/run-all-ui.js
console.log(bad ? `\nมี ${bad} ไฟล์ไม่ผ่าน — อย่าเพิ่ง deploy` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
