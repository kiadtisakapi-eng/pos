// เทสต์สิทธิ์ตามตำแหน่ง + ประวัติการแก้ไขย้อนหลัง (เพิ่ม ส.ค. 2569)
// ทั้งสองเรื่องคุมทางที่ "เงินหายจากระบบโดยไม่มีบิลรองรับ" จึงต้องมีเทสต์กันถอยหลัง
const h = require('./harness.js');
const app = h.ctx.app;
let pass = 0, fail = 0;
// t() เป็นแบบ sync — ถ้าส่งฟังก์ชัน async เข้ามาจะผ่านทันทีโดยไม่ตรวจอะไร จึงดักไว้ให้ FAIL
const t = (n, f) => { try { const r = f();
  if (r && typeof r.then === 'function') { fail++; console.log('  FAIL', n, '-> ฟังก์ชันทดสอบคืน Promise แต่ t() ไม่รอ async ให้ await ผลไว้ข้างนอกก่อน'); return; }
  pass++; console.log('  PASS', n); } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m||'') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

app.showToast = () => {}; app.vibrateDevice = () => {}; app.renderAll = () => {};
app.renderDashboard = () => {}; app.renderPos = () => {}; app.renderQueueScreen = () => {};
app.renderCustomerTable = () => {}; app.renderSettingsLists = () => {}; app.closeModal = () => {};
app.showConfirm = (m, cb) => { app._p = cb(); };
const el = id => h.document.getElementById(id);

(async () => {

// ══════ 1. ค่าใช้จ่าย: ต้องรู้ว่าใครเพิ่ม ใครลบ ══════
// ค่าใช้จ่าย 1 บาท = "เงินที่ควรมีในลิ้นชัก" ลดลง 1 บาท
// ใครหยิบเงินออกแล้วกดเพิ่มค่าใช้จ่ายเท่ากัน ลิ้นชักจะลงตัวพอดี จึงต้องมีชื่อติดไว้เสมอ
console.log('\n--- ค่าใช้จ่าย: ติดชื่อคนเพิ่ม/คนลบ ---');
app.state.shift = { active:true, startTime:Date.now()-3600e3, startCash:1000, startDetails:{}, expenses:[], history:[] };
app.state.expenseLog = [];
app.currentUser = { id:'st-1', name:'สมชาย ใจดี' }; app.currentRole = 'staff';
app.saveState = async () => true;
el('expense-type').value = 'supply';
el('expense-amount').value = '500';
el('expense-note').value = 'น้ำยาสระผม';
await app.addExpense(null);

t('เพิ่มค่าใช้จ่ายแล้วมี 1 รายการ', () => eq(app.state.shift.expenses.length, 1));
t('บันทึกชื่อคนเพิ่มไว้', () => eq(app.state.shift.expenses[0].by, 'สมชาย ใจดี'));
t('ยอดเงินถูกต้อง', () => eq(app.state.shift.expenses[0].amount, 500));

const expId = app.state.shift.expenses[0].id;
app.currentUser = { id:'st-3', name:'ประสิทธิ์ มือทอง' }; app.currentRole = 'manager';
await app.deleteExpense(expId); await app._p;

t('ลบแล้วรายการหายออกจากกะจริง', () => eq(app.state.shift.expenses.length, 0));
t('มีบันทึกการลบ 1 รายการ', () => eq(app.state.expenseLog.length, 1));
t('บันทึกว่าใครลบ', () => eq(app.state.expenseLog[0].by, 'ประสิทธิ์ มือทอง'));
t('บันทึกว่าเดิมใครเป็นคนเพิ่ม', () => eq(app.state.expenseLog[0].addedBy, 'สมชาย ใจดี'));
t('บันทึกยอดเงินที่หายไป', () => eq(app.state.expenseLog[0].amount, 500));
t('บันทึกชื่อรายการไว้ด้วย', () => ok(/น้ำยาสระผม/.test(app.state.expenseLog[0].note)));

console.log('\n--- ลบค่าใช้จ่ายตอนเครื่องเขียนข้อมูลไม่ได้ ---');
app.state.shift.expenses = [{ id:'exp_x', type:'supply', amount:300, note:'ทดสอบ', time:Date.now(), by:'สมชาย ใจดี' }];
const logBefore = app.state.expenseLog.length;
app.saveState = async () => false;                 // จำลอง IndexedDB ล้มเหลว
await app.deleteExpense('exp_x'); await app._p;
t('เขียนไม่สำเร็จ: รายการต้องยังอยู่', () => eq(app.state.shift.expenses.length, 1));
t('เขียนไม่สำเร็จ: ห้ามมีบันทึกการลบค้าง', () => eq(app.state.expenseLog.length, logBefore));
app.saveState = async () => true;

console.log('\n--- ประวัติต้องติดไปกับไฟล์สำรอง ---');
app.state.expenseLog = [{ expenseId:'exp_1', amount:500, note:'x', addedBy:'ก', addedAt:1, by:'ข', date:2 }];
t('buildBackupPayload มี expenseLog', () => eq(app.buildBackupPayload().expenseLog.length, 1));
t('ไฟล์สำรองรุ่นเก่าที่ไม่มี expenseLog ต้องกลายเป็นอาเรย์ว่าง ไม่ใช่ undefined', () => {
  const old = { services:[], staff:[], transactions:[], shift:{} };
  eq(Array.isArray(old.expenseLog ? old.expenseLog : []), true);
});

// ══════ 2. สรุปรายเดือน = เจ้าของร้านเท่านั้น ══════
console.log('\n--- สิทธิ์ดูสรุปรายเดือน ---');
app.filterReports = () => { app._filtered = app.state.selectedReportType; };
const trySelect = (role, type) => { app.currentRole = role; app.selectReportType(type); return app.state.selectedReportType; };

t('เจ้าของร้านเลือกรายเดือนได้', () => eq(trySelect('owner','monthly'), 'monthly'));
t('เจ้าของร้านเลือกรายวันได้', () => eq(trySelect('owner','daily'), 'daily'));
t('ผู้จัดการเลือกรายเดือนไม่ได้ → ตกกลับเป็นรายวัน', () => eq(trySelect('manager','monthly'), 'daily'));
t('พนักงานเลือกรายเดือนไม่ได้ → ตกกลับเป็นรายวัน', () => eq(trySelect('staff','monthly'), 'daily'));
t('ยังไม่ล็อกอินก็เลือกรายเดือนไม่ได้', () => eq(trySelect(null,'monthly'), 'daily'));
t('ตำแหน่งแปลกที่ยังไม่มีในระบบก็ต้องถูกปิดไว้ก่อน (allowlist ไม่ใช่ denylist)',
  () => eq(trySelect('supervisor','monthly'), 'daily'));

console.log('\n--- ค่าที่ค้างจากเซสชันก่อนหน้าต้องถูกสลับกลับ ---');
app.currentRole = 'owner'; app.selectReportType('monthly');
app.currentRole = 'manager';
app.updateUserRoleUI();
t('ผู้จัดการล็อกอินต่อจากเจ้าของ → ค่าถูกสลับกลับเป็นรายวัน', () => eq(app.state.selectedReportType, 'daily'));
t('แท็บรายเดือนถูกซ่อนสำหรับผู้จัดการ', () => eq(el('report-tab-monthly').style.display, 'none'));
app.currentRole = 'owner'; app.updateUserRoleUI();
t('เจ้าของร้านยังเห็นแท็บรายเดือน', () => ok(el('report-tab-monthly').style.display !== 'none'));

// ══════ 3. ตารางประวัติในหน้ารายงาน ══════
console.log('\n--- ตารางบิลที่ถูกยกเลิก / ค่าใช้จ่ายที่ถูกลบ ---');
// วันทำการตัดตี 6 — บิลตี 2 ของวันที่ 11 ยังนับเป็นวันที่ 10
const d10 = new Date('2026-08-10T14:00:00+07:00').getTime();  // บ่ายวันที่ 10
const d11 = new Date('2026-08-11T02:00:00+07:00').getTime();  // ตี 2 วันที่ 11 → ยังเป็นวันทำการที่ 10
const d12 = new Date('2026-08-12T14:00:00+07:00').getTime();  // คนละวัน
app.state.voidLog = [
  { billId:'TX-A', date:d10, by:'ผู้จัดการ ก', amount:500, customer:'ลูกค้า ก', services:[] },
  { billId:'TX-B', date:d11, by:'ผู้จัดการ ข', amount:300, customer:'ลูกค้า ข', services:[] },
  { billId:'TX-C', date:d12, by:'ผู้จัดการ ค', amount:900, customer:'ลูกค้า ค', services:[] }
];
app.state.expenseLog = [
  { expenseId:'e1', amount:250, note:'ซื้อของอื่นๆ: น้ำแข็ง', addedBy:'สมชาย', addedAt:d10, by:'ประสิทธิ์', date:d10 },
  { expenseId:'e2', amount:800, note:'จ่ายเงินรายวัน: มาลี',  addedBy:'มาลี',   addedAt:d12, by:'ประสิทธิ์', date:d12 }
];
app.renderAuditTrail('daily', '2026-08-10', '2026-08');
const voidHtml = el('report-voids-body').innerHTML;
const expHtml  = el('report-expense-deletions-body').innerHTML;

t('บิลที่ยกเลิกในวันทำการนั้นขึ้นครบ', () => ok(/TX-A/.test(voidHtml) && /TX-B/.test(voidHtml)));
t('บิลตี 2 ของวันถัดไปนับเป็นวันทำการเดิม', () => ok(/TX-B/.test(voidHtml)));
t('บิลของวันอื่นต้องไม่ขึ้น', () => ok(!/TX-C/.test(voidHtml)));
t('แสดงชื่อคนที่ยกเลิก', () => ok(/ผู้จัดการ ก/.test(voidHtml)));
t('สรุปจำนวน+ยอดรวมของบิลที่ยกเลิก', () => ok(/2 ใบ/.test(el('report-voids-count').innerText)));
t('ค่าใช้จ่ายที่ถูกลบในวันนั้นขึ้น', () => ok(/น้ำแข็ง/.test(expHtml)));
t('ค่าใช้จ่ายที่ถูกลบของวันอื่นต้องไม่ขึ้น', () => ok(!/มาลี/.test(expHtml)));
t('แสดงทั้งคนเพิ่มเดิมและคนลบ', () => ok(/สมชาย/.test(expHtml) && /ประสิทธิ์/.test(expHtml)));

app.renderAuditTrail('monthly', '2026-08-10', '2026-08');
t('มุมมองรายเดือนเห็นครบทั้งเดือน', () => {
  const html = el('report-voids-body').innerHTML;
  ok(/TX-A/.test(html) && /TX-B/.test(html) && /TX-C/.test(html));
});

app.state.voidLog = []; app.state.expenseLog = [];
app.renderAuditTrail('daily', '2026-08-10', '2026-08');
t('ไม่มีข้อมูลต้องขึ้นข้อความว่าง ไม่ใช่ตารางเปล่า', () => ok(/ไม่มีการยกเลิกบิล/.test(el('report-voids-body').innerHTML)));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
