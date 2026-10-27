// แก้ตามผลตรวจทั้งระบบ 26 ต.ค. 2569 — 10 ข้อ (แอป 9 ข้อ + Apps Script 1 ข้อ)
//   [1]  ไฟล์สำรองที่ถูกแก้ห้ามตั้งปลายทางคลาวด์ (URL ชีต / แชท Telegram) ของเครื่องนี้
//   [2]  PIN ค่าใช้จ่ายจากลิ้นชักนับยอดสะสมของบัญชีในกะ — แบ่งลงก้อนเล็กต้องถูกถาม PIN · เพดาน 1,000 (เจ้าของปรับ 27 ต.ค.)
//   [3]  ผู้จัดการเปิด/ยกเลิกบิลของกะที่ยังเปิดอยู่ได้แม้เลย 06:00 (วันทำการใหม่)
//   [4]  ร่างค่าใช้จ่ายถูกล้างเมื่อออกจากระบบ/สลับคน และหลังปิดกะ
//   [5]  ปิดกะ → สำรองขึ้น Drive ทันทีแม้งานสำรองเคยล้มระหว่างกะ
//   [6]  ไม่ย้อนกลับไปสำเนาก่อนกู้ที่เป็นเครื่องเปล่า (ได้ร้านว่าง)
//   [7]  บันทึก "Telegram ส่งแล้ว" ล้มต่อเนื่อง → ลองซ้ำทุก 30 วินาที ไม่ใช่ทุก 1 วินาที
//   [8]  กด "ภายหลัง" ที่แถบอัปเดต → แถบกลับมาเองเมื่อเกิน 30 นาที
//   [9]  ผู้จัดการยกเลิกบิลแบบคืนเงินสดตอนไม่มีกะเปิดไม่ได้ (เจ้าของยังทำได้)
//   [10] Apps Script: setupPosApiToken แทนรหัสที่ผิดรูปแบบด้วยรหัสใหม่
// ข้อมูลสมมติทั้งหมด · พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> POS_GAS_SRC=<gas ก่อนแก้> node tests/test_fix_20261026.js → ต้องตก
process.env.TZ = 'Asia/Bangkok';
const { makeShop, readyCheckout, settle, createGasEnv } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- แก้ 26 ต.ค. 2569: ผลตรวจทั้งระบบ 10 ข้อ ---');

const sell = async (s, price) => { readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price); await s.app.processCheckout(); await settle(15); };
const el = (s, id) => s.env.document.getElementById(id);
const addExp = async (s, amount, note) => {
  el(s, 'expense-type').value = 'other'; el(s, 'expense-amount').value = String(amount);
  el(s, 'expense-note').value = note || ('ค่าของ ' + amount); el(s, 'expense-source').value = 'drawer';
  await s.app.addExpense(null); await settle(10);
};

(async () => {
  // ═══════════════════════════════ [1] ปลายทางคลาวด์จากไฟล์สำรอง ═══════════════════════════════
  await R.t('[1a] เครื่องที่ยังไม่ตั้ง URL นำเข้าไฟล์ที่ชี้ URL/แชทอื่น → ไม่รับทั้งสองค่า', async () => {
    const s = await makeShop({ role: 'owner', rows: { googleSheetsUrl: '', googleSheetsApiToken: '', telegramChatId: '' } });
    try {
      const file = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      file.googleSheetsUrl = 'https://script.google.com/macros/s/ATTACKER-DEPLOYMENT/exec';
      file.telegramChatId = '-100999';
      await s.app.applyBackupData(file, {});
      eq(s.app.googleSheetsUrl, '', 'URL ชีตต้องยังว่าง');
      eq(s.app.telegramChatId, '', 'แชท Telegram ต้องยังว่าง');
      eq(await s.env.raw('googleSheetsUrl'), '', 'ค่าที่ลงเครื่องต้องยังว่าง');
      ok(Array.isArray(s.app._restoreIgnoredCloudTargets) && s.app._restoreIgnoredCloudTargets.length === 2, 'ต้องจำไว้บอกเจ้าของว่าไม่นำมาใช้');
    } finally { s.env.dispose(); }
  });

  await R.t('[1b] เครื่องที่ตั้ง URL ไว้แล้ว นำเข้าไฟล์ → URL เดิมของเครื่องคงอยู่', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      const mine = s.app.googleSheetsUrl;
      const file = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      file.googleSheetsUrl = 'https://evil.example.com/collect';
      await s.app.applyBackupData(file, {});
      eq(s.app.googleSheetsUrl, mine);
    } finally { s.env.dispose(); }
  });

  await R.t('[1c] ย้อนการกู้ (exactSettings) ด้วยสำเนาที่ URL ไม่ใช่ Apps Script → ไม่รับ URL นั้น · URL ว่างยังคืนได้', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      const mine = s.app.googleSheetsUrl;
      const bad = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      bad.googleSheetsUrl = 'https://evil.example.com/collect';
      await s.app.withMutation('t', () => s.app._applyBackupDataLocked(bad, { checkIds: false, exactSettings: true, forceWin: true }));
      eq(s.app.googleSheetsUrl, mine, 'URL นอก Apps Script ต้องไม่ถูกรับ');
      const empty = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      empty.googleSheetsUrl = '';
      await s.app.withMutation('t', () => s.app._applyBackupDataLocked(empty, { checkIds: false, exactSettings: true, forceWin: true }));
      eq(s.app.googleSheetsUrl, '', 'สำเนาที่ไม่มี URL (เครื่องตอนนั้นยังไม่ตั้ง) ต้องคืนเป็นว่างได้ตามเดิม');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [2] PIN ค่าใช้จ่ายแบบสะสม ═══════════════════════════════
  // เพดาน: เจ้าของปรับจาก 500 → 1,000 บาท (27 ต.ค. 2569) — ใช้ทั้งรายการเดี่ยวและยอดสะสมในกะ
  const LIMIT_OF = (s) => require('vm').runInContext('EXPENSE_DRAWER_PIN_OVER', s.env.ctx);
  await R.t('[2-] เพดาน PIN ค่าใช้จ่ายจากลิ้นชัก = 1,000 บาท (เจ้าของสั่ง 27 ต.ค. 2569)', async () => {
    const s = await makeShop({ role: 'manager' });
    try { eq(LIMIT_OF(s), 1000); } finally { s.env.dispose(); }
  });

  await R.t('[2a] ผู้จัดการลง 500 × 6 จากลิ้นชัก → ถูกถาม PIN ทุกครั้งที่ยอดสะสมเกิน 1,000', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      for (let i = 0; i < 6; i++) await addExp(s, 500, 'ค่าของ ' + i);
      eq(s.app.state.shift.expenses.length, 6, '(เงื่อนไข) บันทึกครบ 6 รายการ');
      eq(s.app._stepUps.length, 2, 'รายการที่ 3 และ 6 ต้องถาม PIN (500+500+500 เกิน 1,000 · ใส่แล้วนับใหม่)');
    } finally { s.env.dispose(); }
  });

  await R.t('[2b] ยอดสะสมไม่เกิน 1,000 ไม่ถาม · รายการเดี่ยว 1,001 ถาม · ของคนอื่น/จ่ายทางอื่นไม่นับรวม', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      s.app.state.shift.expenses.push({ id: 'exp_other', type: 'other', amount: 900, note: 'x', time: Date.now() - 1000, by: 'เอ', byId: 'st-1', paidFrom: 'drawer' });
      await addExp(s, 400); await addExp(s, 600);
      eq(s.app._stepUps.length, 0, '400 + 600 = 1,000 ไม่เกิน · ของบัญชีอื่น 900 ไม่นับ');
      el(s, 'expense-type').value = 'other'; el(s, 'expense-amount').value = '1500'; el(s, 'expense-note').value = 'โอน'; el(s, 'expense-source').value = 'other';
      await s.app.addExpense(null); await settle(10);
      eq(s.app._stepUps.length, 0, 'จ่ายทางอื่นไม่ถาม/ไม่นับ');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 1, '1,000 + 1 เกินเพดาน ต้องถาม');
      await addExp(s, 1001);
      eq(s.app._stepUps.length, 2, 'รายการเดียวเกิน 1,000 ถาม');
      await addExp(s, 1);
      eq(s.app._stepUps.length, 2, 'หลังรายการที่ผ่าน PIN นับใหม่จาก 0 — รายการ 1 บาทไม่ต้องถาม');
    } finally { s.env.dispose(); }
  });

  await R.t('[2c] กดสองรายการ 600 ติดกัน (ยังไม่ทันบันทึกรายการแรก) → ห้ามผ่านทั้งคู่โดยไม่มี PIN', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      const fill = (n) => { el(s, 'expense-type').value = 'other'; el(s, 'expense-amount').value = '600'; el(s, 'expense-note').value = n; el(s, 'expense-source').value = 'drawer'; };
      fill('A'); const p1 = s.app.addExpense(null);
      fill('B'); const p2 = s.app.addExpense(null);
      await Promise.all([p1, p2]); await settle(30);
      const drawer = s.app.state.shift.expenses.filter(e => e.paidFrom === 'drawer');
      const unverified = drawer.filter(e => !e.pinVerified).reduce((a, e) => a + e.amount, 0);
      ok(unverified <= LIMIT_OF(s), 'ยอดที่ไม่ผ่าน PIN ต้องไม่เกินเพดาน got ' + unverified + ' prompts ' + s.app._stepUps.length);
    } finally { s.env.dispose(); }
  });

  await R.t('[2d] ใส่ PIN กับรายการ 1,001 แล้วตั้งนาฬิกา iPad ย้อน 20 นาที → แบ่งลง 500 × 6 ยังต้องถูกถาม PIN', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      s.app._stepUps = [];
      await addExp(s, 1001, 'มี PIN');
      const vm = require('vm'); const D = vm.runInContext('Date', s.env.ctx), real = D.now.bind(D);
      D.now = () => real() - 20 * 60e3;
      try { for (let i = 0; i < 6; i++) await addExp(s, 500, 'แบ่ง ' + i); } finally { D.now = real; }
      ok(s.app._stepUps.length >= 3, 'ต้องถาม PIN ที่ 1,001 + ทุกครั้งที่ 500 สะสมเกิน 1,000 got ' + s.app._stepUps.length);
      let acc = 0; s.app.state.shift.expenses.forEach(e => { acc = e.pinVerified ? 0 : acc + e.amount; });
      ok(acc <= LIMIT_OF(s), 'ยอดค้างที่ไม่ผ่าน PIN ต้องไม่เกินเพดาน got ' + acc);
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [3] บิลของกะที่ยังเปิดหลัง 06:00 ═══════════════════════════════
  await R.t('[3] ผู้จัดการ: บิลในกะที่เปิดอยู่แต่เป็นวันทำการก่อน → เปิดได้เต็ม · บิลของกะก่อนยังเปิดไม่ได้', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const start = Date.now() - 30 * 3600e3;   // เปิดกะเมื่อวานซืน/เมื่อวาน (ลืมปิด/ลากยาว)
      s.app.state.shift.startTime = start;
      const at = new Date(Date.now() - 26 * 3600e3).toISOString();
      const mk = (id, shiftStart) => ({ id, date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at, shiftStart } });
      const inShift = mk('TX-OPEN-SHIFT', start), oldShift = mk('TX-OLD-SHIFT', start - 3600e3);
      ok(!s.app.isCurrentBusinessDayBill(inShift), '(เงื่อนไข) บิลต้องเป็นวันทำการก่อน');
      eq(s.app.billAccessFor(inShift), 'full', 'บิลของกะที่ยังเปิดอยู่');
      eq(s.app.billAccessFor(oldShift), 'none', 'บิลของกะอื่นวันก่อน ยังเป็นของเจ้าของ');
      // ไม่ขยายช่องเลือกวันของรายงาน (จะเห็นบิล/กะอื่นทั้งวัน) — ใช้กล่องรายการบิลของกะนี้แทน
      eq(s.app.reportDateValue(), s.app.currentBusinessDateKey(), 'รายงานยังล็อกวันนี้');
      s.app.state.transactions.push(inShift, oldShift);
      const realBox = Object.getPrototypeOf(s.app).renderPendingSettleBox.bind(s.app);
      realBox();
      const html = el(s, 'report-pending-settle-box').innerHTML;
      ok(html.includes('TX-OPEN-SHIFT') && !html.includes('TX-OLD-SHIFT'), 'กล่องต้องมีบิลของกะนี้เท่านั้น');
    } finally { s.env.dispose(); }
  });

  await R.t('[3b] ผู้จัดการยกเลิกบิลของกะที่เปิดอยู่ (ขายก่อน 06:00) → แถวยกเลิกขึ้นในตารางของวันนี้', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const start = Date.now() - 30 * 3600e3;
      s.app.state.shift.startTime = start;
      const billAt = new Date(Date.now() - 26 * 3600e3).toISOString();
      // แถวที่ 1.12.3 ขึ้นไปเขียน: ติดรหัสกะของบิล (หลักฐานว่าเป็นบิลของกะนี้) — ทางยกเลิกจริงทั้งเส้นอยู่ที่ test_fix_20261027_codex [F02a]
      // แถวที่ 2: รูปแบบ v67 ไม่มีรหัสกะ และไม่มีตัวบิลให้ยืนยัน — เวลาบิลอยู่หลังเปิดกะก็ห้ามขึ้น (Codex ตรวจ 1.12.3 · F02)
      s.app.state.voidLog = [{ id: 'void-1', billId: 'TX-OPEN-SHIFT-V', billDate: billAt, billShiftStart: start, date: Date.now(), at: Date.now(),
        by: 'บี', total: 500, paymentMethod: 'cash', note: 'บิลซ้ำ' },
        { id: 'void-2', billId: 'TX-V67-NOTAG', billDate: billAt, date: Date.now(), at: Date.now(),
          by: 'เจ้าของร้าน', total: 500, paymentMethod: 'cash', customer: 'ลูกค้ากะอื่น', note: 'x' }];
      const today = s.app.currentBusinessDateKey();
      ok(s.app.getBusinessISODate(billAt) !== today, '(เงื่อนไข) บิลเป็นวันทำการก่อน');
      Object.getPrototypeOf(s.app).renderAuditTrail.call(s.app, 'daily', today, '');
      ok(String(el(s, 'report-voids-body').innerHTML).includes('TX-OPEN-SHIFT-V'), 'แถวยกเลิกของผู้จัดการเองต้องเห็น');
      ok(!String(el(s, 'report-voids-body').innerHTML).includes('TX-V67-NOTAG') && !String(el(s, 'report-voids-body').innerHTML).includes('ลูกค้ากะอื่น'),
        'แถวรุ่นเก่าที่ไม่มีรหัสกะและไม่มีตัวบิล ต้องซ่อน (ไม่ใช้เวลาอย่างเดียว)');
      s.app.state.shift.active = false;   // กะปิดแล้ว = บิลวันก่อน กลับเป็นของเจ้าของ
      Object.getPrototypeOf(s.app).renderAuditTrail.call(s.app, 'daily', today, '');
      ok(!String(el(s, 'report-voids-body').innerHTML).includes('TX-OPEN-SHIFT-V'), 'กะปิดแล้วต้องไม่เห็น');
    } finally { s.env.dispose(); }
  });

  await R.t('[3c] เจ้าของ: บิลค้างบันทึกเงินส่วนต่างของกะที่เปิดอยู่ (ขายก่อน 06:00) ยังขึ้นในกล่องเหมือนเดิม', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      const start = Date.now() - 30 * 3600e3; s.app.state.shift.startTime = start;
      const at = new Date(Date.now() - 26 * 3600e3).toISOString();
      const tx = { id: 'TX-OWN-PENDING', date: at, total: 400, subtotal: 500, discount: 100, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at, shiftStart: start } };
      s.app.state.transactions.push(tx);
      s.app.isPendingSettlementBill = (t) => t && t.id === 'TX-OWN-PENDING';
      Object.getPrototypeOf(s.app).renderPendingSettleBox.call(s.app);
      ok(String(el(s, 'report-pending-settle-box').innerHTML).includes('TX-OWN-PENDING'), 'เจ้าของต้องเห็นบิลค้างบันทึกเงิน');
    } finally { s.env.dispose(); }
  });

  await R.t('[3d] แถวยกเลิกที่ติดรหัสกะอื่น ไม่ขึ้นให้ผู้จัดการ แม้เวลาบิลจะหลังเปิดกะ (นาฬิกาเคยเดินเร็ว)', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const start = Date.now() - 30 * 3600e3; s.app.state.shift.startTime = start;
      const billAt = new Date(Date.now() - 26 * 3600e3).toISOString();
      s.app.state.voidLog = [
        { billId: 'TX-OTHER-SHIFT', billDate: billAt, billShiftStart: start - 5 * 3600e3, date: Date.now(), by: 'เอ', amount: 300 },
        { billId: 'TX-THIS-SHIFT', billDate: billAt, billShiftStart: start, date: Date.now(), by: 'บี', amount: 300 }];
      Object.getPrototypeOf(s.app).renderAuditTrail.call(s.app, 'daily', s.app.currentBusinessDateKey(), '');
      const h = String(el(s, 'report-voids-body').innerHTML);
      ok(h.includes('TX-THIS-SHIFT') && !h.includes('TX-OTHER-SHIFT'), 'เห็นเฉพาะแถวของกะที่เปิดอยู่');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [4] ร่างค่าใช้จ่ายค้าง ═══════════════════════════════
  await R.t('[4] ร่างค่าใช้จ่าย "จ่ายทางอื่น 700" ค้าง → ออกจากระบบ → ฟอร์มกลับค่าเริ่มต้น (จ่ายจากลิ้นชัก)', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      el(s, 'expense-amount').value = '700'; el(s, 'expense-note').value = 'ค่าซ่อมแอร์ เจ้าของโอนเอง';
      el(s, 'expense-source').value = 'other'; el(s, 'expense-staff-id').value = 'st-1';
      s.app.requireLogin();
      eq([el(s, 'expense-amount').value, el(s, 'expense-note').value, el(s, 'expense-source').value, el(s, 'expense-staff-id').value],
        ['', '', 'drawer', '']);
    } finally { s.env.dispose(); }
  });

  await R.t('[4b] เจ้าของหลักปิดกะ (ไม่ถูกออกจากระบบ) → ร่างค่าใช้จ่ายที่ค้างถูกล้างด้วย', async () => {
    const s = await makeShop({ role: 'owner', cash: { 1000: 1 } });
    try {
      el(s, 'expense-amount').value = '700'; el(s, 'expense-note').value = 'ค่าซ่อมแอร์'; el(s, 'expense-source').value = 'other';
      s.app.cashCounterMode = 'close'; await s.app.confirmCashCount(); await settle(30);
      eq(s.app.state.shift.active, false, '(เงื่อนไข) ปิดกะสำเร็จ');
      eq([el(s, 'expense-amount').value, el(s, 'expense-note').value, el(s, 'expense-source').value], ['', '', 'drawer']);
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [5] สำรองตอนปิดกะ ═══════════════════════════════
  await R.t('[5] งานสำรองที่เคยล้ม 3 ครั้ง (นัดอีก 30 นาที) → ปิดกะแล้วนัดเป็น "ตอนนี้" · ตัวนับไม่ถูกล้าง', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      const job = { id: 'cob-bk', createdAt: Date.now() - 3600e3, dateKeys: [], monthKeys: [], needSummary: false, needTelegram: false,
        needBackup: true, backupRev: 1, retry: { backup: { tries: 3, nextAt: Date.now() + 30 * 60e3 } }, tries: 0 };
      s.app.state.cloudOutbox = [job];
      const before = Date.now();
      s.app.enqueueShiftCloseCloudOps({ startTime: Date.now() - 3600e3, endTime: Date.now() });
      ok(job.retry.backup.nextAt <= Date.now() && job.retry.backup.nextAt >= before, 'ต้องนัดสำรองทันที');
      eq(job.retry.backup.tries, 3, 'ตัวนับครั้งที่ล้มคงไว้');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [6] ย้อนไปสำเนาเครื่องเปล่า ═══════════════════════════════
  await R.t('[6] สำเนาก่อนกู้เป็นเครื่องเปล่า + เครื่องมีบิลแล้ว → ไม่ย้อน · บิลยังอยู่ · กล่องปุ่มถูกซ่อน', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      await sell(s, 300);
      const snap = s.app.buildPreRestoreSnapshot();
      snap.data.transactions = []; snap.data.voidLog = []; snap.data.staff = [];
      snap.data.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
      await s.env.db.state.put({ key: 'preRestoreSnapshot', value: snap });
      ok(await s.app.readPreRestoreSnapshot(), '(เงื่อนไข) สำเนาต้องอ่านได้');
      const n = s.app.state.transactions.length;
      await s.app.undoLastRestore(); await (s.app._confirmP || Promise.resolve()); await settle(30);
      eq(s.app.state.transactions.length, n, 'บิลต้องไม่หาย');
      await s.app.refreshPreRestoreUI();
      eq(el(s, 'pre-restore-box').style.display, 'none', 'ไม่แสดงปุ่มย้อนกลับ');
      // เครื่องที่ตั้งพนักงานไว้แล้วแต่ยังไม่ขาย ไม่ใช่เครื่องเปล่า — ย้อนได้ตามเดิม
      const snap2 = JSON.parse(JSON.stringify(snap)); snap2.data.staff = [{ id: 'st-9', name: 'ซี', role: 'ช่าง', accessLevel: 'staff' }];
      ok(!s.app.isEmptyShopSnapshotOverData(snap2), 'มีพนักงานแล้ว = ไม่ใช่เครื่องเปล่า');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [7] ตัวปลุกบันทึก Telegram ═══════════════════════════════
  await R.t('[7] ออฟไลน์ + งานสรุปเลยเวลานัด + บันทึก "ส่งแล้ว" ล้มต่อเนื่อง → ไม่ตั้งปลุกต่ำกว่า 30 วินาที', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-sum', createdAt: Date.now() - 600e3, dateKeys: [s.app.currentBusinessDateKey()], monthKeys: [],
        needSummary: true, needTelegram: false, needBackup: false, retry: { summary: { tries: 1, nextAt: Date.now() - 1000 } }, tries: 0 }];
      s.env.ctx.navigator.onLine = false;
      s.app._telegramSentUnsaved = true;
      s.app._retryTelegramSentSave = async () => false;   // ที่เก็บข้อมูลยังเขียนไม่ได้
      const delays = []; const origST = s.env.ctx.setTimeout;
      s.env.ctx.setTimeout = (f, ms, ...a) => { delays.push(Number(ms) || 0); return origST(f, ms, ...a); };
      s.app.kickTelegramSentSave(); await settle(50);
      s.env.ctx.setTimeout = origST;
      const wake = delays.filter(d => d >= 500);   // ตัดงาน setTimeout(…, 0) ภายในแอปออก
      ok(wake.length >= 1, '(เงื่อนไข) ต้องตั้งปลุกลองบันทึกใหม่');
      ok(Math.min(...wake) >= 30000, 'ตัวปลุกต้องไม่ต่ำกว่า 30 วินาที got ' + JSON.stringify(wake));
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [8] แถบอัปเดตหลังกด "ภายหลัง" ═══════════════════════════════
  await R.t('[8] มีรุ่นใหม่รออยู่ + กดภายหลังเกิน 30 นาที → แสดงแถบอีก · เพิ่งกด → ยังไม่แสดง', async () => {
    const s = await makeShop({ role: 'owner' });
    try {
      s.env.ctx.navigator.serviceWorker = { controller: {} };
      const waiting = { postMessage() {} };
      s.app._swReg = { waiting };
      const gid = s.env.document.getElementById.bind(s.env.document);
      s.env.document.getElementById = (id) => (id === 'app-update-bar' ? null : gid(id));
      s.app._updateLaterAt = Date.now() - 5 * 60e3;
      eq(s.app.recheckWaitingUpdate(), false, 'เพิ่งกดภายหลัง 5 นาที');
      s.app._updateLaterAt = Date.now() - 31 * 60e3;
      eq(s.app.recheckWaitingUpdate(), true, 'เกิน 30 นาทีต้องแสดงอีก');
      ok(s.app._pendingWorker === waiting, 'แถบต้องชี้ตัวที่รออยู่');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [9] ยกเลิกคืนเงินนอกกะ ═══════════════════════════════
  await R.t('[9] ไม่มีกะเปิด: ผู้จัดการคืนเงินสด → ถูกกัน · "เงินยังอยู่ที่ร้าน" ทำได้ · เจ้าของคืนได้ตามเดิม', async () => {
    const s = await makeShop({ role: 'manager' });
    try {
      const at = new Date(Date.now() - 3600e3).toISOString(), st = Date.now() - 5 * 3600e3;
      const tx = { id: 'TX-AFTER-CLOSE', date: at, total: 500, subtotal: 500, discount: 0, paymentMethod: 'cash', details: [], services: ['x'],
        tender: { method: 'cash', amount: 500, received: 500, change: 0, at, shiftStart: st } };
      s.app.state.shift.active = false; s.app.state.shift.startTime = null;
      const p = s.app.planVoidCash(tx, 'refunded');
      ok(p.blocked === true, 'ผู้จัดการต้องถูกกัน');
      ok(!s.app.planVoidCash(tx, 'none').blocked, 'เงินยังอยู่ที่ร้าน ยกเลิกได้');
      s.app.currentRole = 'owner'; s.app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
      const po = s.app.planVoidCash(tx, 'refunded');
      ok(!po.blocked && po.unattributed === 500, 'เจ้าของยังคืนได้และมีบันทึกเงินคืนนอกกะ');
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [10] Apps Script: รหัสผิดรูปแบบ ═══════════════════════════════
  await R.t('[10] รหัสใน Script Properties ผิดรูปแบบ → setupPosApiToken สร้างรหัสใหม่ที่ใช้งานได้ · รหัสถูกอยู่แล้วไม่เปลี่ยน', async () => {
    const g = createGasEnv();
    g.props.POS_API_TOKEN = 'my shop token 2026';
    const tok = g.ctx.setupPosApiToken();
    ok(/^[A-Za-z0-9_-]{24,200}$/.test(tok), 'ต้องได้รหัสรูปแบบถูก got ' + tok);
    const r = JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify({ secret: tok, action: 'primary_status' }), length: 10 } }));
    ok(r.code !== 'TOKEN_NOT_SET', 'รหัสใหม่ต้องผ่านด่านรหัส got ' + r.code);
    eq(g.ctx.setupPosApiToken(), tok, 'รันซ้ำต้องคืนรหัสเดิม (ไม่หมุนรหัสเอง)');
  });

  R.done();
})();
