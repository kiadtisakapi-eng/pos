// แก้ตามผลตรวจของ Codex ต่องาน 1.12.3 — 27 ต.ค. 2569 (audit/codex_review_1.12.3_20261027/)
//   [F01] PIN ค่าใช้จ่ายสะสม: รายการรุ่นเก่าที่ไม่มี byId ต้องถูกนับ (เดิมถูกทิ้ง → ลงเกินเพดานได้โดยไม่มี PIN)
//   [F02] ประวัติยกเลิก/แก้บิล: แถวที่ไม่มีรหัสกะ ห้ามใช้เวลาบิลอย่างเดียวให้ผู้จัดการเห็น
//         + บิลที่ไม่มีรหัสกะ ห้ามนับเป็น "บิลของกะที่เปิดอยู่" (ชนิดเดียวกัน — สิทธิ์จากเวลาอย่างเดียว)
// เกณฑ์เพดานคงเดิม: 1,000 พอดีไม่ถาม · เกิน 1,000 ถาม (เจ้าของสั่ง 27 ต.ค. 2569)
// ข้อมูลสมมติทั้งหมด · พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js 1.12.3 ก่อนแก้รอบนี้> node tests/test_fix_20261027_codex.js → ต้องตก
process.env.TZ = 'Asia/Bangkok';
const vm = require('vm');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- แก้ 27 ต.ค. 2569: ผลตรวจ Codex ต่อ 1.12.3 (F01 · F02) ---');

const el = (s, id) => s.env.document.getElementById(id);
const fill = (s, amount, note, source) => {
  el(s, 'expense-type').value = 'other'; el(s, 'expense-amount').value = String(amount);
  el(s, 'expense-note').value = note || ('ค่าของ ' + amount); el(s, 'expense-source').value = source || 'drawer';
};
const addExp = async (s, amount, note, source) => { fill(s, amount, note, source); await s.app.addExpense(null); await settle(10); };
let legacySeq = 0;
// รายการรุ่นก่อนเก็บรหัสบัญชี — ไม่มี byId / pinVerified (รูปเดียวกับที่ไฟล์สำรองเก่าผ่านด่านนำเข้าได้)
const legacy = (amount, by, extra) => Object.assign({ id: 'exp_legacy_' + (++legacySeq), type: 'other', amount, note: 'รายการเก่า ' + amount,
  by: by === undefined ? 'บี' : by, time: Date.now() - 60000, paidFrom: 'drawer' }, extra || {});
const LIMIT_OF = (s) => vm.runInContext('EXPENSE_DRAWER_PIN_OVER', s.env.ctx);
// ยอดจ่ายจากลิ้นชักที่ไม่ผ่าน PIN นับตามลำดับที่บันทึก (ของทุกบัญชีที่ไม่ใช่เจ้าของ — ตรวจแบบเข้มกว่าตัวแอป)
const unverifiedTail = (exps) => {
  let acc = 0;
  exps.forEach(e => { if (!e || e.paidFrom === 'other') return; acc = e.pinVerified ? 0 : acc + e.amount; });
  return acc;
};
const asManager = (s, id, name) => { s.app.currentRole = 'manager'; s.app.currentUser = { id, name }; };

function freezeClock(env, clock) {
  const BaseDate = vm.runInContext('Date', env.ctx);
  env.ctx.Date = class extends BaseDate {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  };
}

(async () => {
  // ═══════════════════════════════ [F01] PIN สะสม + รายการรุ่นเก่า ═══════════════════════════════
  await R.t('[F01-] เพดานยังเป็น 1,000 บาท', async () => {
    const s = await makeShop({ role: 'manager' });
    try { eq(LIMIT_OF(s), 1000); } finally { s.env.dispose(); }
  });

  await R.t('[F01a] เจ้าของกู้ไฟล์ที่มีค่าใช้จ่าย 500 + 500 ไม่มี byId → ผู้จัดการลง 1,000 ต้องถูกถาม PIN (กล่อง PIN จริง) · ยกเลิก = ไม่บันทึก · ใส่ถูก = บันทึกแล้วนับใหม่', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      s.app.resumePendingCloudWork = () => {};
      const file = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      file.shift.startCash = 5000;
      file.shift.expenses = [legacy(500), legacy(500)];
      eq(s.app.auditBackupData(file).badExpenses, 0, '(เงื่อนไข) ไฟล์ผ่านด่านนำเข้า');
      await s.app.applyBackupData(file, { acceptUnsynced: true });
      loginAs(s.app, 'manager');
      eq(s.app.unverifiedDrawerExpenseOf(s.app.currentUser), 1000, 'ยอดค้างต้องเห็น 1,000 ของรายการเก่า');
      // กล่อง PIN ตัวจริง — กดยกเลิก
      let asked = 0;
      s.app.confirmPinStepUp = s.app._realConfirmPinStepUp;
      s.app.askSecret = async () => { asked++; return null; };
      await addExp(s, 1000, 'รายการใหม่');
      eq(asked, 1, 'ต้องถาม PIN');
      let stored = (await s.env.raw('shift')).expenses;
      eq(stored.reduce((a, e) => a + e.amount, 0), 1000, 'ยกเลิก PIN แล้วยอดในเครื่องต้องยังเป็น 1,000');
      eq(s.app.computeShiftDrawer(s.app.state.shift).expected, 4000, 'ลิ้นชักควรมีเท่าเดิม');
      // ใส่ PIN ผู้จัดการถูก → บันทึก + ติดธงผ่าน PIN → นับใหม่จาก 0
      s.app.askSecret = async () => { asked++; return '222222'; };
      await addExp(s, 1000, 'รายการใหม่');
      eq(asked, 2, 'ถาม PIN อีกครั้ง');
      stored = (await s.env.raw('shift')).expenses;
      eq(stored.length, 3, 'ใส่ PIN ถูกต้องบันทึกได้');
      eq(stored[2].pinVerified, true, 'รายการที่ผ่าน PIN ติดธง');
      await addExp(s, 1000, 'หลัง PIN');
      eq(asked, 2, 'หลังผ่าน PIN นับใหม่ — 1,000 พอดีไม่ถาม');
      await addExp(s, 1, 'เกิน');
      eq(asked, 3, '1,000 + 1 เกินเพดาน ต้องถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01b] รายการเก่าที่ชื่อไม่ตรง (เปลี่ยนชื่อ / ไม่ระบุผู้ลง / ชื่อคนอื่น) ก็ต้องนับ · 1,000 พอดีไม่ถาม · เกินถาม', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(legacy(400, 'บีชื่อเก่า'), legacy(200, ''), legacy(100, 'เอ'));
      await addExp(s, 300);
      eq(s.app._stepUps.length, 0, '700 + 300 = 1,000 พอดี ไม่ถาม');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 1, 'เกิน 1,000 ต้องถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01c] ชื่อซ้ำ + สลับบัญชี: รายการเก่าไม่มี byId นับให้ทุกบัญชี · รายการที่มี byId ของอีกบัญชีไม่นับ', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app.state.staff.push({ id: 'mg-2', name: 'บี', role: 'ผู้จัดการ', accessLevel: 'manager', pin: s.app.state.staff.find(x => x.id === 'mg-1').pin });
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(legacy(600, 'บี'),
        { id: 'exp_mg2', type: 'other', amount: 300, note: 'ของ mg-2', by: 'บี', byId: 'mg-2', time: Date.now() - 1000, paidFrom: 'drawer' });
      await addExp(s, 400);
      eq(s.app._stepUps.length, 0, 'mg-1: เก่า 600 + 400 = 1,000 ไม่ถาม (300 ของ mg-2 ไม่นับ)');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 1, 'mg-1: เกิน 1,000 ถาม');
      asManager(s, 'mg-2', 'บี');
      eq(s.app.unverifiedDrawerExpenseOf(s.app.currentUser), 900, 'mg-2: เก่า 600 + ของตัวเอง 300 (ไม่รวมของ mg-1)');
      await addExp(s, 100);
      eq(s.app._stepUps.length, 1, 'mg-2: 900 + 100 = 1,000 ไม่ถาม');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 2, 'mg-2: เกิน 1,000 ถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01d] ลบรายการเก่าแล้วลงใหม่ → ยอดค้างที่ไม่ผ่าน PIN ไม่เกิน 1,000', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      const a = legacy(500), b = legacy(500);
      s.app.state.shift.expenses.push(a, b);
      s.app.deleteExpense(a.id); if (s.app._confirmP) await s.app._confirmP; await settle(20);
      eq(s.app.state.shift.expenses.some(e => e.id === a.id), false, '(เงื่อนไข) ลบสำเร็จ');
      await addExp(s, 500);
      eq(s.app._stepUps.length, 0, 'เก่า 500 + ใหม่ 500 = 1,000 ไม่ถาม');
      await addExp(s, 500);
      eq(s.app._stepUps.length, 1, 'ลงเพิ่มจนเกิน 1,000 ต้องถาม');
      ok(unverifiedTail(s.app.state.shift.expenses) <= LIMIT_OF(s), 'ยอดค้าง got ' + unverifiedTail(s.app.state.shift.expenses));
    } finally { s.env.dispose(); }
  });

  await R.t('[F01e] รายการเก่า "จ่ายทางอื่น" ไม่นับ · รายการเก่าจ่ายจากลิ้นชักนับ', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(legacy(900, 'บี', { paidFrom: 'other' }), legacy(100));
      await addExp(s, 900);
      eq(s.app._stepUps.length, 0, '100 + 900 = 1,000 ไม่ถาม (900 จ่ายทางอื่นไม่นับ)');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 1, 'เกินต้องถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01f] นาฬิกา: รายการเก่าลงเวลาอนาคต + ตั้งนาฬิกาย้อน 20 นาที → ยังนับตามลำดับที่บันทึก', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(legacy(600, 'บี', { time: Date.now() + 2 * 3600e3 }));
      const D = vm.runInContext('Date', s.env.ctx), real = D.now.bind(D);
      D.now = () => real() - 20 * 60e3;
      try { await addExp(s, 500); } finally { D.now = real; }
      eq(s.app._stepUps.length, 1, '600 + 500 เกินเพดาน ต้องถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01g] รายการเก่า 400 + กด 400 สองรายการติดกัน (คิวยังไม่ว่าง) → ยอดค้างไม่เกิน 1,000', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(legacy(400));
      fill(s, 400, 'A'); const p1 = s.app.addExpense(null);
      fill(s, 400, 'B'); const p2 = s.app.addExpense(null);
      await Promise.all([p1, p2]); await settle(30);
      const stored = (await s.env.raw('shift')).expenses;
      ok(unverifiedTail(stored) <= LIMIT_OF(s), 'ยอดค้างในเครื่อง got ' + unverifiedTail(stored) + ' prompts ' + s.app._stepUps.length);
    } finally { s.env.dispose(); }
  });

  await R.t('[F01j] รายการไม่รู้ผู้ลงที่ติด pinVerified หรือเกิน 1,000 ห้ามล้างยอดค้างของบัญชีนี้ (บวกเข้าอย่างเดียว)', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const mine = (amount, extra) => Object.assign({ id: 'exp_mine_' + (++legacySeq), type: 'other', amount, note: 'ของ บี',
        by: 'บี', byId: 'mg-1', time: Date.now() - 30000, paidFrom: 'drawer' }, extra || {});
      s.app._stepUps = [];
      s.app.state.shift.expenses.push(mine(900), legacy(1500));
      await addExp(s, 1000);
      eq(s.app._stepUps.length, 1, 'ของตัวเอง 900 + ไม่รู้ผู้ลง 1,500 + 1,000 → ต้องถาม');
      s.app.state.shift.expenses = [mine(900), legacy(1, 'บี', { pinVerified: true })];
      s.app._stepUps = [];
      await addExp(s, 1000);
      eq(s.app._stepUps.length, 1, 'ไม่รู้ผู้ลงติดธง pinVerified → ไม่ใช่จุดนับใหม่ของบัญชีนี้ ต้องถาม');
      s.app.state.shift.expenses = [legacy(900), mine(1001, { pinVerified: true })];
      s.app._stepUps = [];
      await addExp(s, 1000);
      eq(s.app._stepUps.length, 0, '(ตัวควบคุม) รายการผ่าน PIN ของบัญชีนี้เองยังเป็นจุดนับใหม่ — 1,000 พอดีไม่ถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01k] byId ที่ไม่ตรงบัญชีใดในเครื่อง (บัญชีถูกลบ/ค่าแปลกจากไฟล์) = ไม่รู้ผู้ลง → นับให้ทุกบัญชี', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      for (const odd of ['mg-deleted', 'mg-1 ', [], true, 0]) {
        s.app.state.shift.expenses = [legacy(500, 'บี', { byId: odd }), legacy(500, 'บี', { byId: odd })];
        s.app._stepUps = [];
        await addExp(s, 1000);
        eq(s.app._stepUps.length, 1, 'byId ' + JSON.stringify(odd) + ': 500 + 500 + 1,000 ต้องถาม');
      }
      s.app.state.shift.expenses = [legacy(900, 'เอ', { byId: 'st-1' })];
      s.app._stepUps = [];
      await addExp(s, 1000);
      eq(s.app._stepUps.length, 0, '(ตัวควบคุม) byId ของบัญชีอื่นที่มีอยู่จริง ไม่นับ');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01h] เจ้าของ: มีรายการเก่า 900 แล้วลง 500 → ไม่ถูกถาม PIN (กล่องจริง) และบันทึกได้', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      let asked = 0;
      s.app.confirmPinStepUp = s.app._realConfirmPinStepUp;
      s.app.askSecret = async () => { asked++; return null; };
      s.app.state.shift.expenses.push(legacy(900));
      await addExp(s, 500);
      eq(asked, 0, 'เจ้าของไม่ถูกถาม');
      eq((await s.env.raw('shift')).expenses.length, 2, 'บันทึกแล้ว');
    } finally { s.env.dispose(); }
  });

  await R.t('[F01i] หน้าต่างอ่านอย่างเดียว (เปิดซ้ำ) + รายการเก่า → ลงค่าใช้จ่ายไม่ได้ ข้อมูลในเครื่องไม่เปลี่ยน', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app.state.shift.expenses.push(legacy(500), legacy(500));
      await s.app.saveStateOrThrow('t');
      s.app.isReadOnlyWindow = true;
      s.app._stepUps = [];
      await addExp(s, 1000);
      eq((await s.env.raw('shift')).expenses.length, 2, 'ไม่มีรายการใหม่ลงเครื่อง');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [F02] สิทธิ์อ่านประวัติ: กะที่เปิดอยู่ต้องมีหลักฐานรหัสกะ ═══════════════════════════════
  // ทางเดินจริง: ขาย → ตั้งนาฬิกาถอย → เจ้าของปิดกะ → รับทราบนาฬิกา → เปิดกะใหม่ → ขายก่อน 06:00 → แก้/ยกเลิกหลัง 06:00
  const buildClockBackDay = async () => {
    const cash = { 1000: 1, 100: 6 };
    const s = await makeShop({ role: 'owner', cash, rows: { customers: [
      { id: 'c1', name: 'ลูกค้ากะเก่า', phone: '0811111111', visitCount: 0 },
      { id: 'c2', name: 'ลูกค้ากะนี้', phone: '0822222222', visitCount: 0 }] } });
    const clock = { now: Date.parse('2026-10-27T05:30:00+07:00') };
    freezeClock(s.env, clock);
    s.app.state.shift.startTime = Date.parse('2026-10-27T01:00:00+07:00');
    s.app.flushCloudOutbox = async () => {};
    s.app.resumePendingCloudWork = () => {};
    const sell = async (cust) => {
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      el(s, 'cart-customer-select').value = cust;
      await s.app.processCheckout(); await settle(20);
      return s.app.state.transactions[s.app.state.transactions.length - 1];
    };
    const A = await sell('c1'), B = await sell('c1');   // กะเก่า (01:00)
    clock.now = Date.parse('2026-10-27T04:00:00+07:00');   // ตั้งนาฬิกาถอย แล้วปิดกะ
    s.app.cashCounterMode = 'close'; await s.app.confirmCashCount(); await settle(20);
    clock.now = Date.parse('2026-10-27T04:01:00+07:00');
    await s.app.acknowledgeClock();
    delete cash[100];
    s.app.cashCounterMode = 'open'; await s.app.confirmCashCount(); await settle(20);
    const shOpen = s.app.state.shift.startTime;
    clock.now = Date.parse('2026-10-27T05:45:00+07:00'); const C = await sell('c2');   // กะนี้ ก่อน 06:00
    clock.now = Date.parse('2026-10-27T05:50:00+07:00'); const D = await sell('c2');
    const editNote = async (tx, note) => {
      s.app.openTransactionEdit(tx.id); el(s, 'edit-tx-note').value = note;
      await s.app.saveTransactionEdit(); await settle(20);
    };
    clock.now = Date.parse('2026-10-27T06:35:00+07:00');
    await editNote(A, 'NOTE_กะเก่า'); await editNote(C, 'NOTE_กะนี้');
    clock.now = Date.parse('2026-10-27T06:36:00+07:00');
    s.app.openTransactionEdit(B.id); el(s, 'void-money-outcome').value = 'none';
    await s.app.voidTransaction(); if (s.app._confirmP) await s.app._confirmP; await settle(20);
    // ผู้จัดการยกเลิกบิลของกะนี้ที่ขายก่อน 06:00 ด้วยทางจริง
    clock.now = Date.parse('2026-10-27T06:40:00+07:00');
    loginAs(s.app, 'manager');
    s.app.openTransactionEdit(D.id); el(s, 'void-money-outcome').value = 'none';
    await s.app.voidTransaction(); if (s.app._confirmP) await s.app._confirmP; await settle(20);
    return { s, A, B, C, D, shOpen, oldStart: Date.parse('2026-10-27T01:00:00+07:00') };
  };
  const trail = (s) => {
    Object.getPrototypeOf(s.app).renderAuditTrail.call(s.app, 'daily', s.app.currentBusinessDateKey(), '');
    return { edits: String(el(s, 'report-bill-edits-body').innerHTML), voids: String(el(s, 'report-voids-body').innerHTML) };
  };

  await R.t('[F02a] ทางจริง: นาฬิกาถอยระหว่างเปลี่ยนกะ → ผู้จัดการเห็นเฉพาะแถวของกะนี้ ทั้งแถวรุ่นใหม่ (มีรหัสกะ) และรุ่น v67 (ไม่มีรหัสกะ)', async () => {
    const { s, A, B, C, D, shOpen, oldStart } = await buildClockBackDay();
    try {
      // เงื่อนไขของเหตุการณ์
      eq(s.app.currentBusinessDateKey(), '2026-10-27', '(เงื่อนไข) วันรายงาน');
      eq(s.app.getBusinessISODate(A.date), '2026-10-26', '(เงื่อนไข) บิลกะเก่าเป็นวันทำการก่อน');
      eq(A.tender.shiftStart, oldStart, '(เงื่อนไข) บิลกะเก่าติดรหัสกะ 01:00');
      ok(new Date(A.date).getTime() > shOpen, '(เงื่อนไข) เวลาบิลกะเก่าอยู่หลังเวลาเปิดกะใหม่');
      eq(s.app.state.voidLog.length, 2, '(เงื่อนไข) ยกเลิก 2 ใบ (เจ้าของ B · ผู้จัดการ D)');
      eq(s.app.billAccessFor(A), 'none', 'บิลกะเก่า: ผู้จัดการไม่มีสิทธิ์');
      eq(s.app.billAccessFor(C), 'full', 'บิลกะนี้ที่ขายก่อน 06:00: ผู้จัดการเปิดได้เต็ม');

      let t = trail(s);
      ok(!t.edits.includes(A.id) && !t.edits.includes('NOTE_กะเก่า'), 'แถวรุ่นใหม่: แก้บิลกะเก่าต้องซ่อน');
      ok(!t.voids.includes(B.id) && !t.voids.includes('ลูกค้ากะเก่า'), 'แถวรุ่นใหม่: ยกเลิกบิลกะเก่าต้องซ่อน');
      ok(t.edits.includes(C.id) && t.edits.includes('NOTE_กะนี้'), 'แถวรุ่นใหม่: แก้บิลกะนี้ต้องเห็น');
      ok(t.voids.includes(D.id), 'แถวรุ่นใหม่: ผู้จัดการยกเลิกบิลกะนี้เอง ต้องเห็น');

      // แถวรูปแบบ v67 (ไม่มี billShiftStart — ต่างจากแถวรุ่นใหม่แค่ช่องนี้)
      [...s.app.state.voidLog, ...s.app.state.editLog].forEach(r => { delete r.billShiftStart; });
      t = trail(s);
      ok(!t.edits.includes(A.id) && !t.edits.includes('NOTE_กะเก่า'), 'แถว v67: แก้บิลกะเก่าต้องซ่อน (เดิมเห็น)');
      ok(!t.voids.includes(B.id) && !t.voids.includes('ลูกค้ากะเก่า'), 'แถว v67: ยกเลิกบิลกะเก่า + ชื่อลูกค้าต้องซ่อน (เดิมเห็น)');
      ok(t.edits.includes(C.id) && t.edits.includes('NOTE_กะนี้'), 'แถว v67: แก้บิลกะนี้ (บิลยังอยู่ · รหัสกะในบิลตรง) ต้องเห็น');
      ok(!t.voids.includes(D.id), 'แถว v67: ยกเลิกแล้วไม่มีตัวบิลให้ยืนยัน = ซ่อน (เหมือน v67 · เจ้าของยังเห็น)');

      loginAs(s.app, 'owner');
      t = trail(s);
      ok([A.id, C.id].every(id => t.edits.includes(id)) && [B.id, D.id].every(id => t.voids.includes(id)), 'เจ้าของเห็นครบทุกแถว');
    } finally { s.env.dispose(); }
  });

  await R.t('[F02b] บิลไม่มีรหัสกะ (รุ่นก่อน v60) เวลาอยู่หลังเปิดกะ → ไม่ใช่บิลของกะนี้: ผู้จัดการเปิดไม่ได้ · ไม่ขึ้นกล่อง · แถวประวัติซ่อน', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const start = Date.now() - 30 * 3600e3; s.app.state.shift.startTime = start;
      const at = new Date(Date.now() - 26 * 3600e3).toISOString();
      const noTender = { id: 'TX-LEGACY-NOTAG', date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'] };
      const tenderNoShift = { id: 'TX-LEGACY-NOSHIFT', date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at } };
      const tagged = { id: 'TX-TAGGED', date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at, shiftStart: start } };
      ok(!s.app.isCurrentBusinessDayBill(noTender), '(เงื่อนไข) วันทำการก่อน');
      eq(s.app.billAccessFor(noTender), 'none', 'ไม่มี tender');
      eq(s.app.billAccessFor(tenderNoShift), 'none', 'tender ไม่มีรหัสกะ');
      eq(s.app.billAccessFor(tagged), 'full', '(ตัวควบคุม) บิลติดรหัสกะนี้ยังเปิดได้');
      s.app.state.transactions.push(noTender, tenderNoShift, tagged);
      Object.getPrototypeOf(s.app).renderPendingSettleBox.call(s.app);
      const box = String(el(s, 'report-pending-settle-box').innerHTML);
      ok(box.includes('TX-TAGGED') && !box.includes('TX-LEGACY-NOTAG') && !box.includes('TX-LEGACY-NOSHIFT'), 'กล่องมีเฉพาะบิลติดรหัสกะนี้');
      s.app.state.editLog = ['TX-LEGACY-NOTAG', 'TX-LEGACY-NOSHIFT', 'TX-TAGGED'].map(id =>
        ({ billId: id, billDate: at, at: Date.now(), date: Date.now(), by: 'เจ้าของร้าน', changes: { note: { from: '', to: 'N_' + id } } }));
      const t = trail(s);
      ok(t.edits.includes('TX-TAGGED') && !t.edits.includes('TX-LEGACY-NOTAG') && !t.edits.includes('TX-LEGACY-NOSHIFT'), 'แถวประวัติ: เห็นเฉพาะบิลติดรหัสกะนี้');
    } finally { s.env.dispose(); }
  });

  await R.t('[F02c] เลขบิลซ้ำ (ใบหนึ่งกะนี้ อีกใบกะอื่น) + แถวไม่มีรหัสกะ → ซ่อน (ไม่รู้ว่าเป็นของใบไหน)', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const start = Date.now() - 30 * 3600e3; s.app.state.shift.startTime = start;
      const at = new Date(Date.now() - 26 * 3600e3).toISOString();
      const mk = (shiftStart) => ({ id: 'TX-DUP', date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at, shiftStart } });
      s.app.state.transactions.push(mk(start), mk(start - 5 * 3600e3));
      s.app.state.editLog = [{ billId: 'TX-DUP', billDate: at, at: Date.now(), date: Date.now(), by: 'เจ้าของร้าน', changes: {} }];
      ok(!trail(s).edits.includes('TX-DUP'), 'ต้องซ่อน');
    } finally { s.env.dispose(); }
  });

  R.done();
})();
