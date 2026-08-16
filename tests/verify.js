// ชุดทดสอบตรรกะหลัก — รันด้วย: node verify.js
// ⚠️ ต้องตั้ง timezone ก่อนแตะ Date ตัวแรก เทสต์หลายข้อวัดเรื่อง "วันทำการตัดตี 6"
// ถ้าเครื่องตั้ง timezone อื่น (เช่นเซิร์ฟเวอร์ CI ที่เป็น UTC) ผลจะเพี้ยนทั้งชุด
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
// จำลอง browser แบบบางที่สุดที่ app.js ต้องใช้ตอน "โหลดไฟล์" เท่านั้น
const fs = require('fs');

class FakeTable {
  constructor() { this.rows = new Map(); }
  async get(k) { return this.rows.has(k) ? { key: k, value: this.rows.get(k) } : undefined; }
  async put(o) { this.rows.set(o.key, o.value); }
  async bulkPut(list) { list.forEach(o => this.rows.set(o.key, o.value)); }
  async delete(k) { this.rows.delete(k); }
  async clear() { this.rows.clear(); }
}
class Dexie {
  constructor() { this.state = new FakeTable(); }
  version() { return { stores: () => ({}) }; }
}

const els = new Map();
function el(id) {
  if (!els.has(id)) els.set(id, { id, value: '', innerText: '', innerHTML: '', style: {}, classList: { add(){}, remove(){}, toggle(){} }, getAttribute(){ return null; }, focus(){}, remove(){}, appendChild(){} });
  return els.get(id);
}
const doc = {
  getElementById: (id) => els.has(id) ? els.get(id) : null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute(){}, click(){}, remove(){}, appendChild(){}, getContext(){ return null; } }),
  addEventListener() {}, head: { appendChild(){} }, body: { appendChild(){} }, hidden: false,
  documentElement: { setAttribute(){} }, readyState: 'complete', title: ''
};
global.document = doc;
global.window = { addEventListener() {}, PromptPayQR: null, prompt: () => null, confirm: () => false };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.navigator = { onLine: true, vibrate() {}, storage: null, serviceWorker: undefined };
global.Dexie = Dexie;
global.crypto = require('crypto').webcrypto;
global.Blob = class { constructor(parts) { this.parts = parts; this.size = String(parts[0]).length; } };
global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
global.setTimeout = (fn, ms) => 0;
global.setInterval = (fn, ms) => 0;

const src = fs.readFileSync(require('path').resolve(__dirname, '..', 'app.js'), 'utf8');
// const ใน app.js ไม่หลุดออกมาถึง scope นี้ — ต่อท้ายเพื่อส่งของที่ต้องใช้ทดสอบออกมา
const _mod = new Function(src + '\n; return { app, OWNER_IDLE_TIMEOUT_MS, SESSION_TTL_HOURS, BUSINESS_DAY_CUTOFF_HOUR };')();
const app = _mod.app;

// ── โครงร่างข้อมูลทดสอบ ────────────────────────────────────────────────
app.loadFailed = false;
app.currentRole = 'owner';
app.currentUser = { id: 'x', name: 'เจ้าของร้าน' };
app.state.staff = [
  { id: 'st-1', name: 'เอ', role: 'ช่าง', active: true },
  { id: 'st-2', name: 'บี', role: 'ช่าง', active: true }
];
app.state.services = [
  { id: 's1', name: 'ตัดผม',  price: 400, duration: 45, category: 'barber',  commission: 10, commissionType: 'percent' },
  { id: 's2', name: 'นวดไทย', price: 600, duration: 60, category: 'massage', commission: 10, commissionType: 'percent' }
];
app.state.categories = [
  { id: 'barber', name: 'ตัดผม', vat: false },
  { id: 'massage', name: 'นวด',  vat: false }
];
app.clearDateKeyCache();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
const near = (a, b, tol = 0.005) => Math.abs(a - b) < tol;

// ══════════════════════════════════════════════════════════════════
console.log('\n[1] บิลเก่า: เปิดหน้าแก้ไขแล้วปิด ต้องไม่แตะข้อมูลบิลเลย');
// บิลเก่า: ยอดรวม 800 ลด 80 → จ่ายจริง 720 (ไม่ได้เก็บราคารายชิ้นไว้)
// ราคาวันนี้ขึ้นเป็น 400/600 แล้ว
const legacy = {
  id: 'TX-OLD-1', date: Date.now() - 86400000 * 200,
  customerName: 'คุณเก่า', services: ['ตัดผม', 'นวดไทย'],
  subtotal: 800, discount: 80, total: 720,
  paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced'
};
app.state.transactions = [legacy];
const before = JSON.stringify(legacy);

['edit-tx-id','edit-tx-id-display','edit-tx-customer','edit-tx-payment','edit-tx-discount','edit-tx-total','edit-tx-services-list',
 'report-date-input','report-month-input','report-transactions-body','css-bar-chart','css-bar-chart-labels',
 'report-kpi-total','report-kpi-count','report-kpi-average','report-kpi-popular']
  .forEach(id => el(id));
el('report-date-input').value = '2026-08-16';
el('report-month-input').value = '2026-08';
app.openTransactionEdit('TX-OLD-1');
app.closeModal('modal-edit-transaction');

check('บิลไม่ถูกแก้แม้แต่ฟิลด์เดียว', JSON.stringify(legacy) === before,
      'ก่อน=' + before + '\n     หลัง=' + JSON.stringify(legacy));
check('ไม่มีการยัด details ลงบิล', legacy.details === undefined);
check('ร่างถูกล้างหลังปิดหน้าต่าง', app._editTxDraft === null);

console.log('\n[2] บิลเก่า: ราคารายชิ้นที่เดาให้ ต้องรวมได้เท่ายอดเดิมเป๊ะ');
const draft = app.buildEditableDetails(legacy);
const sumPrice = draft.reduce((s, d) => s + d.price, 0);
const sumNet   = draft.reduce((s, d) => s + d.netPrice, 0);
check('ผลรวมราคารายชิ้น = subtotal เดิม (800)', near(sumPrice, 800), 'ได้ ' + sumPrice);
check('ผลรวมราคาหลังส่วนลด = 800-80 = 720', near(sumNet, 720), 'ได้ ' + sumNet);
check('แบ่งตามสัดส่วนราคาวันนี้ 400:600 → 320/480', near(draft[0].price, 320) && near(draft[1].price, 480),
      JSON.stringify(draft.map(d => d.price)));
check('ทุกรายการมี netPrice ติดมาด้วย', draft.every(d => typeof d.netPrice === 'number'));
check('ไม่ติ๊ก VAT ย้อนหลังให้บิลเก่า', draft.every(d => d.vatable === false));
// ตัดผมราคาเกลี่ยได้ 320, หักส่วนลดตามสัดส่วน (80 × 320/800 = 32) → net 288, คอม 10% = 28.80
check('ค่าคอมคิดจากยอดหลังหักส่วนลด (10% ของ 288)', near(draft[0].commissionAmount, 28.8), 'ได้ ' + draft[0].commissionAmount);

console.log('\n[3] บิลเก่า: กดบันทึกโดยไม่แก้อะไร ยอดต้องไม่ขยับ');
app.openTransactionEdit('TX-OLD-1');
el('edit-tx-customer').value = 'คุณเก่า';
el('edit-tx-payment').value = 'cash';
el('edit-tx-discount').value = '80';
doc.querySelectorAll = () => [];   // ไม่แตะ dropdown พนักงาน

(async () => {
  await app.saveTransactionEdit();
  check('subtotal คงเดิม 800', legacy.subtotal === 800, 'ได้ ' + legacy.subtotal);
  check('discount คงเดิม 80',  legacy.discount === 80,  'ได้ ' + legacy.discount);
  check('total คงเดิม 720 (ไม่ถูกปัดขึ้นเต็มบาทตามกฎใหม่)', legacy.total === 720, 'ได้ ' + legacy.total);
  check('ยังเป็นบิลรุ่นเก่า ไม่มีฟิลด์ VAT งอกมา', legacy.vatAmount === undefined && legacy.rounding === undefined);
  check('details ถูกบันทึกพร้อม netPrice', Array.isArray(legacy.details) && near(legacy.details.reduce((s,d)=>s+d.netPrice,0), 720));
  check('ถูกตั้ง pending เพื่อซิงก์ใหม่', legacy.syncStatus === 'pending');

  // ── บิลรุ่นใหม่ที่มี VAT ต้องยังคิด VAT + ปัดเศษเหมือนเดิม ────────────
  console.log('\n[4] บิลรุ่นใหม่ที่มี VAT: แก้ไขแล้วต้องยังคิด VAT ด้วยอัตราของบิลใบนั้น');
  const modern = {
    id: 'TX-NEW-1', date: Date.now(), customerName: 'คุณใหม่',
    services: ['ตัดผม', 'นวดไทย'],
    details: [
      { name: 'ตัดผม',  price: 400, netPrice: 400, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 40, category: 'barber',  vatable: false },
      { name: 'นวดไทย', price: 600, netPrice: 600, staffId: 'st-2', staffName: 'บี', commission: 10, commissionType: 'percent', commissionAmount: 60, category: 'massage', vatable: true  }
    ],
    subtotal: 1000, discount: 0,
    vatRate: 7, nonVatBase: 400, vatableBase: 600, vatAmount: 42, rounding: 0, total: 1042,
    paymentMethod: 'cash', staffNames: ['เอ','บี'], syncStatus: 'synced'
  };
  app.state.transactions = [modern];
  app.openTransactionEdit('TX-NEW-1');
  el('edit-tx-customer').value = 'คุณใหม่';
  el('edit-tx-payment').value = 'cash';
  el('edit-tx-discount').value = '100';   // ใส่ส่วนลด 100
  await app.saveTransactionEdit();
  // subtotal 1000 ลด 100 → net 360/540 ; VAT 7% ของ 540 = 37.80 ; รวม 937.80 → ปัดขึ้น 938
  check('subtotal 1000', modern.subtotal === 1000, 'ได้ ' + modern.subtotal);
  check('ฐาน VAT = 540', near(modern.vatableBase, 540), 'ได้ ' + modern.vatableBase);
  check('VAT = 37.80', near(modern.vatAmount, 37.8), 'ได้ ' + modern.vatAmount);
  check('รวม = 938 (ปัดขึ้นเต็มบาท)', modern.total === 938, 'ได้ ' + modern.total);
  check('4 ช่องบวกกันแล้วเท่ายอดรวม',
    near(modern.nonVatBase + modern.vatableBase + modern.vatAmount + modern.rounding, modern.total),
    `${modern.nonVatBase}+${modern.vatableBase}+${modern.vatAmount}+${modern.rounding}`);
  check('ค่าคอมคิดจากยอดหลังส่วนลด (ก่อน VAT)', near(modern.details[0].commissionAmount, 36), 'ได้ ' + modern.details[0].commissionAmount);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n[5] ค่าใช้จ่าย: กะลากยาวข้ามตี 6 ต้องแยกวันตามเวลาที่จ่ายจริง');
  // เวลาตัดวัน 06:00 → รายการก่อน 06:00 นับเป็นเมื่อวาน
  const d = (iso) => new Date(iso + '+07:00').getTime();
  app.state.shift = {
    active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [],
    history: [{
      startTime: d('2026-08-10T11:00:00'),
      endTime:   d('2026-08-11T07:30:00'),   // ปิด 07:30 = วันทำการ 11 ส.ค. (ข้ามเวลาตัดวัน)
      expenses: [
        { id: 'e1', amount: 500,  note: 'ซื้อของ',    time: d('2026-08-10T20:00:00') }, // วันทำการ 10
        { id: 'e2', amount: 1000, note: 'จ่ายพนักงาน', time: d('2026-08-11T02:00:00') }, // ตี 2 → ยังวันทำการ 10
        { id: 'e3', amount: 300,  note: 'กาแฟเช้า',    time: d('2026-08-11T07:00:00') }  // 7 โมง → วันทำการ 11
      ]
    }]
  };
  app.clearDateKeyCache();
  const day10 = app.getExpensesForDate('2026-08-10').reduce((s, e) => s + e.amount, 0);
  const day11 = app.getExpensesForDate('2026-08-11').reduce((s, e) => s + e.amount, 0);
  check('วันที่ 10 ได้ 1,500 (ซื้อของ + จ่ายพนักงานตี 2)', day10 === 1500, 'ได้ ' + day10);
  check('วันที่ 11 ได้ 300 (เฉพาะกาแฟ 7 โมง)', day11 === 300, 'ได้ ' + day11);
  check('ยอดรวมสองวัน = ยอดทั้งกะ 1,800 ไม่หายไปไหน', day10 + day11 === 1800);

  console.log('\n[6] ค่าใช้จ่าย: กะปกติปิดตี 3 ต้องอยู่วันเดียวกันทั้งหมดเหมือนเดิม');
  app.state.shift.history = [{
    startTime: d('2026-08-12T11:00:00'),
    endTime:   d('2026-08-13T03:00:00'),
    expenses: [
      { id: 'f1', amount: 200, time: d('2026-08-12T13:00:00') },
      { id: 'f2', amount: 800, time: d('2026-08-13T01:30:00') }
    ]
  }];
  app.clearDateKeyCache();
  const n12 = app.getExpensesForDate('2026-08-12').reduce((s, e) => s + e.amount, 0);
  const n13 = app.getExpensesForDate('2026-08-13').reduce((s, e) => s + e.amount, 0);
  check('รวมอยู่วันที่ 12 ทั้งหมด (1,000)', n12 === 1000, 'ได้ ' + n12);
  check('วันที่ 13 ไม่มีอะไร', n13 === 0, 'ได้ ' + n13);

  console.log('\n[7] ค่าใช้จ่าย: รายการเก่าที่ไม่มีเวลา ต้องไม่หายไปจากรายงาน');
  app.state.shift.history = [{
    startTime: d('2026-08-14T11:00:00'), endTime: d('2026-08-15T02:00:00'),
    expenses: [{ id: 'g1', amount: 999 }]   // ไม่มี time
  }];
  app.clearDateKeyCache();
  const n14 = app.getExpensesForDate('2026-08-14').reduce((s, e) => s + e.amount, 0);
  check('ตกไปอยู่วันทำการของกะ (14) แทนที่จะหาย', n14 === 999, 'ได้ ' + n14);

  console.log('\n[8] ค่าใช้จ่ายรายเดือน: คืนคาบเกี่ยวสิ้นเดือนต้องแยกถูก');
  app.state.shift.history = [{
    startTime: d('2026-08-31T11:00:00'), endTime: d('2026-09-01T08:00:00'),
    expenses: [
      { id: 'h1', amount: 700, time: d('2026-09-01T01:00:00') },  // ตี 1 ของ 1 ก.ย. → เดือนทำการ 08-2026
      { id: 'h2', amount: 400, time: d('2026-09-01T07:30:00') }   // 7 โมงครึ่ง → เดือนทำการ 09-2026
    ]
  }];
  app.clearDateKeyCache();
  const m8 = app.collectExpenses('month', '08-2026').reduce((s, e) => s + e.amount, 0);
  const m9 = app.collectExpenses('month', '09-2026').reduce((s, e) => s + e.amount, 0);
  check('เดือน 08 ได้ 700', m8 === 700, 'ได้ ' + m8);
  check('เดือน 09 ได้ 400', m9 === 400, 'ได้ ' + m9);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n[9] ส่งออกไฟล์: ต้องใช้ Blob และไม่ตายเมื่อข้อมูลใหญ่');
  app.state.transactions = [];
  for (let i = 0; i < 12000; i++) {
    app.state.transactions.push({
      id: 'TX-' + i, date: Date.now(), customerName: 'ลูกค้า ' + i,
      services: ['ตัดผม'], subtotal: 400, discount: 0, total: 400,
      details: [{ name: 'ตัดผม', price: 400, netPrice: 400, staffId: 'st-1', staffName: 'เอ', commissionAmount: 40 }],
      paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced'
    });
  }
  const payload = JSON.stringify(app.buildBackupPayload(), null, 2);
  const mb = (payload.length / 1024 / 1024).toFixed(2);
  const okExport = app.exportData();
  check(`ส่งออกสำเร็จที่ข้อมูล ${mb} MB (เกินเพดาน data: URL เดิม 2 MB)`, okExport === true);
  check('ขนาดข้อมูลเกิน 2 MB จริง (พิสูจน์ว่าเคสนี้เคยพัง)', payload.length > 2 * 1024 * 1024, mb + ' MB');

  console.log('\n[10] สำเนาก่อนกู้ข้อมูล: เก็บลงเครื่องแล้วอ่านกลับได้');
  await app.savePreRestoreSnapshot();
  const snap = await app.readPreRestoreSnapshot();
  check('อ่านสำเนากลับมาได้', !!snap);
  check('สำเนามีบิลครบ 12,000 ใบ', snap && snap.data.transactions.length === 12000,
        snap ? snap.data.transactions.length : 'null');
  check('สำเนาผ่านด่านตรวจไฟล์สำรอง', snap && app.isValidBackupObject(snap.data));
  check('ไม่มีรหัส PIN / โทเค็นติดไปในสำเนา',
        snap && snap.data.ownerPin === undefined && snap.data.googleSheetsApiToken === undefined && snap.data.telegramToken === undefined);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n[11] เขียนลงเครื่องไม่สำเร็จ: บิลต้องกลับเป็นค่าเดิมทุกฟิลด์');
  const guard = {
    id: 'TX-OLD-2', date: Date.now() - 864e5 * 100, customerName: 'คุณเดิม',
    services: ['ตัดผม', 'นวดไทย'], subtotal: 800, discount: 80, total: 720,
    paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced'
  };
  app.state.transactions = [guard];
  app.state.cloudOutbox = [];
  const guardBefore = JSON.stringify(guard);
  app.openTransactionEdit('TX-OLD-2');
  el('edit-tx-customer').value = 'ชื่อใหม่ที่ไม่ควรติด';
  el('edit-tx-payment').value = 'promptpay';
  el('edit-tx-discount').value = '300';
  const realSave = app.saveState.bind(app);
  app.saveState = async () => false;            // จำลอง IndexedDB เขียนพลาด
  await app.saveTransactionEdit();
  app.saveState = realSave;
  check('บิลกลับเป็นค่าเดิมเป๊ะทุกฟิลด์', JSON.stringify(guard) === guardBefore,
        'ก่อน=' + guardBefore + '\n     หลัง=' + JSON.stringify(guard));
  check('ไม่มี details ค้างจากการแก้ที่ล้มเหลว', guard.details === undefined);
  check('ไม่มีฟิลด์ VAT ค้าง (undefined ไม่ใช่ค่าขยะ)', guard.vatAmount === undefined && guard.rounding === undefined);
  check('ไม่มีงานค้างขึ้นชีตงอกมา', app.state.cloudOutbox.length === 0, JSON.stringify(app.state.cloudOutbox));

  console.log('\n[12] พนักงานเจ้าของงานถูกลบไปแล้ว: ค่าคอมต้องไม่โดนโยนให้คนอื่น');
  const orphan = {
    id: 'TX-ORPH', date: Date.now(), customerName: 'ค',
    services: ['ตัดผม'],
    details: [{ name: 'ตัดผม', price: 400, netPrice: 400, staffId: 'st-ลบแล้ว', staffName: 'ซี (ลาออก)',
                commission: 10, commissionType: 'percent', commissionAmount: 40, category: 'barber', vatable: false }],
    subtotal: 400, discount: 0, vatRate: 0, nonVatBase: 400, vatableBase: 0, vatAmount: 0, rounding: 0,
    total: 400, paymentMethod: 'cash', staffNames: ['ซี (ลาออก)'], syncStatus: 'synced'
  };
  app.state.transactions = [orphan];
  app.openTransactionEdit('TX-ORPH');
  check('หน้าจอมีตัวเลือก "คงพนักงานเดิม" ให้', el('edit-tx-services-list').innerHTML.includes('ไม่อยู่ในระบบแล้ว'));
  el('edit-tx-customer').value = 'ค';
  el('edit-tx-payment').value = 'cash';
  el('edit-tx-discount').value = '0';
  doc.querySelectorAll = () => [{ getAttribute: () => '0', value: '__keep__' }];
  await app.saveTransactionEdit();
  doc.querySelectorAll = () => [];
  check('ค่าคอมยังเป็นของพนักงานคนเดิม', orphan.details[0].staffName === 'ซี (ลาออก)' && orphan.details[0].staffId === 'st-ลบแล้ว',
        orphan.details[0].staffName + ' / ' + orphan.details[0].staffId);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n[13] กะต้องถูกจัดเป็น "คืนของวันที่เปิดร้าน" ไม่ว่าจะปิดกี่โมง');
  const mkShift = (openIso, closeIso) => ({
    startTime: d(openIso), endTime: d(closeIso),
    startCash: 2000, cashSales: 5000, expensesTotal: 1000, expectedCash: 6000,
    countedCash: 6000, difference: 0, closedBy: 'เอ',
    expenses: [{ id: 'k1', amount: 1000, time: d(openIso.slice(0,10) + 'T21:00:00') }]
  });
  const shiftDay = (sh, key) => {
    app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [sh] };
    app.clearDateKeyCache();
    return app.getClosedShiftsForPeriod('day', key).length;
  };
  const shiftMonth = (sh, key) => {
    app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [sh] };
    app.clearDateKeyCache();
    return app.getClosedShiftsForPeriod('month', key).length;
  };
  const early = mkShift('2026-08-10T11:00:00', '2026-08-11T03:00:00');
  const late  = mkShift('2026-08-10T11:00:00', '2026-08-11T06:30:00');
  check('ปิดตี 3 → อยู่วันที่ 10 (เหมือนเดิม)', shiftDay(early, '2026-08-10') === 1 && shiftDay(early, '2026-08-11') === 0);
  check('ปิด 06:30 → ยังอยู่วันที่ 10 (ไม่กระโดดไปวันที่ 11)', shiftDay(late, '2026-08-10') === 1 && shiftDay(late, '2026-08-11') === 0);

  const eom = mkShift('2026-08-31T11:00:00', '2026-09-01T07:00:00');
  check('คืนสิ้นเดือนปิดสาย → ยังอยู่เดือน 08 ไม่ข้ามไป 09',
        shiftMonth(eom, '08-2026') === 1 && shiftMonth(eom, '09-2026') === 0);

  console.log('\n[14] สรุปวันของกะที่ปิดช้า: บิลขาย / ค่าใช้จ่าย / ตารางนับเงิน ต้องอยู่วันเดียวกัน');
  app.state.transactions = [
    { id: 'TX-A', date: d('2026-08-10T22:00:00'), customerName: 'ก', services: ['ตัดผม'],
      details: [{ name: 'ตัดผม', price: 400, netPrice: 400, staffId: 'st-1', staffName: 'เอ', commissionAmount: 40 }],
      subtotal: 400, discount: 0, total: 400, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' },
    { id: 'TX-B', date: d('2026-08-11T02:00:00'), customerName: 'ข', services: ['ตัดผม'],
      details: [{ name: 'ตัดผม', price: 400, netPrice: 400, staffId: 'st-1', staffName: 'เอ', commissionAmount: 40 }],
      subtotal: 400, discount: 0, total: 400, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' }
  ];
  app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [],
    history: [mkShift('2026-08-10T11:00:00', '2026-08-11T06:30:00')] };
  app.clearDateKeyCache();
  const bills10 = app.state.transactions.filter(t => app.getBusinessISODate(t.date) === '2026-08-10').length;
  const exp10   = app.getExpensesForDate('2026-08-10').reduce((s, e) => s + e.amount, 0);
  const cash10  = app.buildShiftCashSummary('day', '2026-08-10').shiftCount;
  const bills11 = app.state.transactions.filter(t => app.getBusinessISODate(t.date) === '2026-08-11').length;
  const exp11   = app.getExpensesForDate('2026-08-11').reduce((s, e) => s + e.amount, 0);
  const cash11  = app.buildShiftCashSummary('day', '2026-08-11').shiftCount;
  check(`วันที่ 10 ครบทั้ง 3 บล็อก (บิล ${bills10} · ค่าใช้จ่าย ${exp10} · กะ ${cash10})`,
        bills10 === 2 && exp10 === 1000 && cash10 === 1);
  check(`วันที่ 11 ว่างทั้ง 3 บล็อก (บิล ${bills11} · ค่าใช้จ่าย ${exp11} · กะ ${cash11})`,
        bills11 === 0 && exp11 === 0 && cash11 === 0);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n[15] ช่องนับเงิน: ค่าติดลบ/เศษ/เกินจริง ต้องถูกกันไว้');
  const mkInput = (v) => ({ value: String(v) });
  check('พิมพ์ -5 → กลายเป็น 0 และเขียนกลับลงช่องให้เห็น', (() => {
    const i = mkInput(-5); return app.readCashQty(i) === 0 && i.value === '0';
  })());
  check('พิมพ์ 12.9 → ตัดเป็น 12', app.readCashQty(mkInput(12.9)) === 12);
  check('ช่องว่าง → 0 ไม่ใช่ NaN', app.readCashQty(mkInput('')) === 0);
  check('พิมพ์ตัวอักษร → 0', app.readCashQty(mkInput('abc')) === 0);
  check('เกิน 99999 → ถูก clamp', app.readCashQty(mkInput(999999)) === 99999);
  check('ค่าปกติ 25 ผ่านตามเดิม ไม่ถูกแตะ', (() => {
    const i = mkInput(25); return app.readCashQty(i) === 25 && i.value === '25';
  })());

  console.log('\n[16] ตรวจไฟล์สำรองที่เสียบางส่วน');
  const damaged = {
    backupSchemaVersion: 2, services: [{ id: 's1', name: 'ตัดผม', price: 400 }], staff: [{ id: 'st-1', name: 'เอ' }],
    transactions: [
      { id: 'TX-1', date: d('2026-08-10T20:00:00'), total: 400, subtotal: 400, discount: 0, services: ['ตัดผม'] }, // ดี
      { id: 'TX-2', date: d('2026-08-10T21:00:00'), total: 'หาย', subtotal: 500, discount: 0, services: ['ตัดผม'] }, // ยอดพัง
      { id: 'TX-3', date: 'ไม่ใช่วันที่', total: 300, subtotal: 300, discount: 0, services: ['ตัดผม'] },            // วันที่พัง
      { id: '',     date: d('2026-08-10T22:00:00'), total: 200, subtotal: 200, discount: 0, services: ['ตัดผม'] }, // ไม่มีเลขบิล
      { id: 'TX-1', date: d('2026-08-10T23:00:00'), total: 100, subtotal: 100, discount: 0, services: ['ตัดผม'] }, // ซ้ำ
      { id: 'TX-5', date: d('2026-08-10T23:30:00'), total: '600', subtotal: '600', discount: 0, services: ['ตัดผม'] } // ตัวเลขเป็นข้อความ (ซ่อมได้)
    ],
    shift: { active: false, expenses: [], history: [{ startTime: d('2026-08-10T11:00:00'), endTime: d('2026-08-11T02:00:00'),
      expenses: [{ id: 'e1', amount: 500, time: d('2026-08-10T20:00:00') }, { id: 'e2', amount: null, time: d('2026-08-10T21:00:00') }] }] }
  };
  check('ผ่านด่านโครงสร้างเดิมได้ (นี่คือเหตุที่ต้องตรวจลึกเพิ่ม)', app.isValidBackupObject(damaged) === true);
  const au = app.auditBackupData(damaged);
  check(`จับยอดเงินพัง 1 ใบ (ได้ ${au.badMoney})`, au.badMoney === 1);
  check(`จับวันที่พัง 1 ใบ (ได้ ${au.badDate})`, au.badDate === 1);
  check(`จับบิลไม่มีเลขที่ 1 ใบ (ได้ ${au.noId})`, au.noId === 1);
  check(`จับเลขที่ซ้ำ 1 ใบ (ได้ ${au.dupId})`, au.dupId === 1);
  check(`จับค่าใช้จ่ายพัง 1 รายการ (ได้ ${au.badExpenses})`, au.badExpenses === 1);
  check('สรุปเป็นข้อความให้คนอ่านได้', app.describeBackupAudit(au).includes('ยอดเงินหาย'));

  const fixedCount = app.sanitizeBackupData(damaged);
  check(`ซ่อมตัวเลข ${fixedCount} จุด`, fixedCount >= 3);
  check('ยอดที่พังกลายเป็น 0 ไม่ใช่ NaN', damaged.transactions[1].total === 0);
  check('ตัวเลขที่เป็นข้อความ "600" ถูกแปลงเป็น 600 (ไม่เสียข้อมูล)', damaged.transactions[5].total === 600);
  check('ค่าใช้จ่ายที่พังกลายเป็น 0', damaged.shift.history[0].expenses[1].amount === 0);
  const sumAll = damaged.transactions.reduce((s, t) => s + t.total, 0);
  check(`รวมยอดได้เป็นตัวเลขจริง ไม่ใช่ NaN (ได้ ${sumAll})`, Number.isFinite(sumAll) && sumAll === 1600);
  check('ไฟล์สะอาดต้องรายงานว่าสะอาด', app.auditBackupData({
    transactions: [{ id: 'A', date: Date.now(), total: 100, subtotal: 100, discount: 0 }], shift: {}
  }).clean === true);
  check('บิลโอน (cashReceived เป็น null) ต้องไม่ถูกยัด 0 จนใบเสร็จโชว์ช่องเงินทอน', (() => {
    const q = { transactions: [{ id: 'Q', date: Date.now(), total: 100, subtotal: 100, discount: 0, cashReceived: null, cashChange: null }], shift: {} };
    app.sanitizeBackupData(q);
    return q.transactions[0].cashReceived === null;
  })());

  console.log('\n[17] ล็อกอินเจ้าของร้าน: ออกจากระบบเมื่อวางทิ้งครบ 5 นาที');
  check('ค่าที่ตั้งไว้คือ 5 นาที', _mod.OWNER_IDLE_TIMEOUT_MS === 5 * 60 * 1000);
  check('พนักงาน/ผู้จัดการยังเป็น 20 ชม. ตามเดิม', _mod.SESSION_TTL_HOURS === 20);
  check('เวลาตัดวันทำการยังเป็น 06:00', _mod.BUSINESS_DAY_CUTOFF_HOUR === 6);
  let loggedOutMsg = null, preselected = null;
  const realRequire = app.requireLogin.bind(app);
  app.requireLogin = (uid) => { preselected = uid; };
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };

  app._lastActivityTs = Date.now() - 4 * 60 * 1000;   // ผ่านไป 4 นาที
  app.checkIdleTimeout();
  check('ผ่านไป 4 นาที → ยังอยู่ในระบบ', preselected === null);

  app._lastActivityTs = Date.now() - 6 * 60 * 1000;   // ผ่านไป 6 นาที
  app.checkIdleTimeout();
  check('ผ่านไป 6 นาที → ถูกออกจากระบบ', preselected === '__owner__');
  check('เลือกผู้ใช้คนเดิมไว้ให้ ไม่ต้องเลือกใหม่', preselected === '__owner__');

  preselected = null;
  app.currentRole = 'staff'; app.currentUser = { id: 'st-1', name: 'เอ' };
  app._lastActivityTs = Date.now() - 60 * 60 * 1000;  // พนักงานวางทิ้ง 1 ชม.
  app.checkIdleTimeout();
  check('พนักงานวางทิ้ง 1 ชม. → ไม่โดนเตะออก (ใช้ TTL 20 ชม. ตามเดิม)', preselected === null);

  preselected = null;
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  app._lastActivityTs = Date.now() - 6 * 60 * 1000;
  app.markActivity();                                  // แตะจอ
  app.checkIdleTimeout();
  check('แตะจอแล้วนาฬิกาเริ่มนับใหม่ → ไม่โดนเตะ', preselected === null);
  app.requireLogin = realRequire;
  app.currentRole = 'owner';

  console.log(`\n${'─'.repeat(52)}\nผ่าน ${pass} / ล้มเหลว ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
