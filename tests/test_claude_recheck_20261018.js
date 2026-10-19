// ตรวจซ้ำผลตรวจทั้งระบบของ Codex 18 ต.ค. 2569 — เทสต์ของข้อที่ Claude แก้ (F01–F03, F05–F11)
// ทุกข้อรันกับโค้ดก่อนแก้แล้ว "ตก" (ดู audit/claude-recheck-20261018/) · F04 อยู่ในไฟล์นี้ด้วยแต่ข้ามเมื่อไม่มี PowerShell
// ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ไม่มีข้อมูลร้านจริง
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { makeShop, readyCheckout, settle, quiet, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok, createEnv } = require('./harness_db');
const { createGasEnv } = require('./gas_env');
const R = makeRunner('--- Claude ตรวจซ้ำผลตรวจ Codex 18 ต.ค. 2569 ---');
const ROOT = path.resolve(__dirname, '..');
const NO_CLOUD = { googleSheetsUrl: '', googleSheetsApiToken: '' };

async function shop(o, fn) { const s = await makeShop(o); try { await fn(s); } finally { s.env.dispose(); } }
async function sell(s, price, pay) {
  s.app.vatEnabled = false;
  readyCheckout(s.env, [{ id: 's1', name: 'Synthetic', price }], pay || 'cash', price);
  return s.app.processCheckout();
}
// บิลเงินสด 500 แก้ส่วนลด 100 → รอคืน 100
async function pendingRefundBill(s) {
  await sell(s, 500, 'cash');
  const tx = s.app.state.transactions.at(-1);
  s.app.openTransactionEdit(tx.id);
  s.env.document.getElementById('edit-tx-discount').value = '100';
  await s.app.saveTransactionEdit();
  await s.app._mutationChain;
  ok(!s.app.billMoneyStatus(tx).settled, 'ต้องมีส่วนต่างค้างก่อน');
  return tx;
}

(async () => {
  // ── F01: สองหน้าต่างเขียนได้ทั้งคู่ (ไม่มี Web Locks) — หน้าต่างที่ถือข้อมูลเก่าต้องเขียนทับไม่ได้ ──
  await R.t('F01 ไม่มี Web Locks: หน้าต่าง B (ข้อมูลเก่า) ขายหลัง A → ถูกปฏิเสธ บิลของ A ยังอยู่ในเครื่อง', async () => {
    const A = await makeShop({ rows: NO_CLOUD });
    const envB = createEnv({ factory: A.env.factory });
    try {
      quiet(envB.app); await envB.app.loadState(); loginAs(envB.app, 'owner');
      const B = { app: envB.app, env: envB };
      eq(!!A.app.isReadOnlyWindow, false); eq(!!B.app.isReadOnlyWindow, false);   // เงื่อนไขของบั๊ก: ทั้งคู่เป็นผู้เขียน
      await sell(A, 300);
      eq((await A.env.raw('transactions')).map(t => t.total), [300]);
      const r = await sell(B, 500);
      const saved = (await A.env.raw('transactions')).map(t => t.total);
      ok(saved.includes(300), 'บิล 300 ของหน้าต่าง A หายจากเครื่อง: ' + JSON.stringify(saved));
      ok(!saved.includes(500), 'หน้าต่าง B เขียนข้อมูลเก่าทับได้: ' + JSON.stringify(saved));
      ok(r !== true, 'B ต้องไม่ขึ้นขายสำเร็จ');
      eq(B.app.state.transactions.some(t => t.total === 500), false, 'B ต้องคืนค่าในหน่วยความจำ (rollback)');
      eq(B.app.isReadOnlyWindow, true, 'B ต้องถูกพักเป็นอ่านอย่างเดียว');
      // A ยังขายต่อได้ (เป็นผู้เขียนล่าสุด)
      await sell(A, 200);
      eq((await A.env.raw('transactions')).map(t => t.total), [300, 200]);
      // B รับสิทธิ์ใหม่ = โหลดข้อมูลล่าสุดก่อน แล้วขายได้โดยไม่ทับของ A
      await B.app.takeOverAsWriter();
      eq(!!B.app.isReadOnlyWindow, false);
      await sell(B, 500);
      eq((await A.env.raw('transactions')).map(t => t.total), [300, 200, 500]);
    } finally { envB.dispose(); A.env.dispose(); }
  });
  await R.t('F01 หน้าต่างเดียว: บันทึกซ้อนกันหลายครั้ง + เปิดแอปใหม่ ไม่ถูกปฏิเสธผิด ๆ', () => shop({ rows: NO_CLOUD }, async s => {
    await Promise.all([s.app.saveState(), s.app.saveState(), s.app.saveState()]);
    await sell(s, 300); await sell(s, 400);
    eq(s.app.isReadOnlyWindow, false);
    await s.app.loadState(); await sell(s, 100);
    eq((await s.env.raw('transactions')).map(t => t.total), [300, 400, 100]);
    const rev = await s.env.raw('stateRevision');
    ok(rev && Number.isSafeInteger(rev.rev) && rev.rev >= 5, 'ต้องมีเลขรุ่นในเครื่อง: ' + JSON.stringify(rev));
  }));
  await R.t('F01 เครื่องที่อัปเดตจากรุ่นก่อน (ยังไม่มีเลขรุ่น) บันทึกครั้งแรกได้ · ฐานข้อมูลถูกล้างโดยอีกหน้าต่าง = ห้ามเขียนข้อมูลเก่ากลับ', () => shop({ rows: NO_CLOUD }, async s => {
    await s.env.db.state.delete('stateRevision');
    await s.app.loadState();
    eq(await s.app.saveState(), true);
    // อีกหน้าต่างล้างฐานข้อมูล (ไม่มีเลขรุ่นแล้ว) — หน้าต่างนี้เคยเห็นรุ่น > 0
    await s.env.db.state.delete('stateRevision');
    eq(await s.app.saveState(), false);
    eq(s.app.isReadOnlyWindow, true);
  }));

  // ── F02: บันทึกคืน/เก็บเงินส่วนต่างต้องผ่านด่านเครื่องหลัก ──
  for (const mode of ['secondary', 'recovery']) {
    await R.t(`F02 ${mode}: บันทึกคืนเงินส่วนต่างไม่ได้ · ลิ้นชักไม่เปลี่ยน · ไม่มี settlement ในเครื่อง`, () => shop({}, async s => {
      const tx = await pendingRefundBill(s);
      s.app.primaryStatus = mode === 'secondary' ? { isPrimary: false, registered: true }
        : { isPrimary: true, registered: true, recovery: { incomplete: true, startedAt: Date.now() } };
      const before = s.app.computeShiftDrawer(s.app.state.shift).expected;
      eq(await s.app.recordBillSettlement(tx.id, 'moved', 'cash'), false);
      eq(s.app.computeShiftDrawer(s.app.state.shift).expected, before);
      const raw = (await s.env.raw('transactions')).find(t => t.id === tx.id);
      eq((raw.settlements || []).length, 0, JSON.stringify(raw.settlements));
    }));
  }
  await R.t('F02 ยังไม่รู้สถานะ + ติดต่อชีตไม่ได้: ปฏิเสธ (ต้องยืนยันเครื่องหลักก่อน)', () => shop({}, async s => {
    const tx = await pendingRefundBill(s);
    s.app.primaryStatus = null;
    s.app.cloudPost = async () => { throw new Error('offline'); };
    eq(await s.app.recordBillSettlement(tx.id, 'moved', 'cash'), false);
    eq(s.app.billMoneyStatus(tx).settled, false);
  }));
  await R.t('F02 สถานะเปลี่ยนเป็นเครื่องรองระหว่างรอยืนยัน: หยุด ไม่บันทึก', () => shop({}, async s => {
    const tx = await pendingRefundBill(s);
    s.app.askConfirm = async () => { s.app.primaryStatus = { isPrimary: false, registered: true }; return true; };
    eq(await s.app.recordBillSettlement(tx.id, 'moved', 'cash'), false);
    eq(s.app.billMoneyStatus(tx).settled, false);
  }));
  await R.t('F02 control: เครื่องหลัก (ออฟไลน์ได้) และร้านที่ไม่ได้ตั้งชีต ยังบันทึกได้', async () => {
    await shop({}, async s => {
      const tx = await pendingRefundBill(s);
      s.app.cloudPost = async () => { throw new Error('offline'); };   // ยืนยันแล้ว ไม่ต้องใช้เน็ต
      const before = s.app.computeShiftDrawer(s.app.state.shift).expected;
      eq(await s.app.recordBillSettlement(tx.id, 'moved', 'cash'), true);
      eq(s.app.computeShiftDrawer(s.app.state.shift).expected, before - 100);
    });
    await shop({ rows: NO_CLOUD }, async s => {
      const tx = await pendingRefundBill(s);
      eq(await s.app.recordBillSettlement(tx.id, 'waive'), true);
      eq(s.app.billMoneyStatus(tx).settled, true);
    });
  });

  // ── F03: ร่างค่าใช้จ่ายรายการถัดไปต้องไม่ถูกเปลี่ยน "จ่ายจาก" ──
  await R.t('F03 ระหว่างรายการแรกรอบันทึก เลือก "จ่ายทางอื่น" ให้ร่างถัดไป → ยังเป็น other และบันทึกเป็น other', () => shop({ rows: NO_CLOUD }, async s => {
    const d = s.env.document, set = (id, v) => { d.getElementById(id).value = v; };
    set('expense-type', 'supply'); set('expense-source', 'drawer'); set('expense-amount', '50'); set('expense-note', 'first');
    const p = s.app.addExpense();                 // อ่านค่าตอนกดแล้ว รอคิวบันทึก
    set('expense-amount', '200'); set('expense-source', 'other'); set('expense-note', 'next transfer');
    await p;
    eq(d.getElementById('expense-source').value, 'other');
    eq(d.getElementById('expense-amount').value, '200');
    eq(d.getElementById('expense-note').value, 'next transfer');
    await s.app.addExpense();
    const ex = s.app.state.shift.expenses.map(e => [e.amount, e.paidFrom]);
    eq(ex, [[50, 'drawer'], [200, 'other']]);
    // ไม่ได้พิมพ์ร่างใหม่ = ล้างกลับค่าเริ่มต้นตามเดิม
    eq(d.getElementById('expense-source').value, 'drawer'); eq(d.getElementById('expense-amount').value, '');
  }));
  await R.t('F03 เปลี่ยนแค่พนักงานของร่างถัดไป (จ่ายเงินรายวัน) → ไม่ถูกล้าง', () => shop({ rows: NO_CLOUD }, async s => {
    const d = s.env.document, set = (id, v) => { d.getElementById(id).value = v; };
    set('expense-type', 'staff'); set('expense-source', 'drawer'); set('expense-amount', '100'); set('expense-staff-id', 'st-1'); set('expense-note', '');
    const p = s.app.addExpense();
    set('expense-staff-id', 'mg-1');
    await p;
    eq(d.getElementById('expense-staff-id').value, 'mg-1');
    eq(d.getElementById('expense-amount').value, '100');
  }));

  // ── F05: Apps Script ปฏิเสธสรุปที่ตัวเลขขัดกันเอง ──
  const base = () => ({ action: 'summary_day', dateKey: '2026-10-18', generatedAt: Date.now(), totalRevenue: 100, totalExpenses: 0,
    billCount: 1, cashRevenue: 100, qrRevenue: 0, creditRevenue: 0 });
  const VAT = { nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0 };
  const shiftRow = (diff) => ({ startTime: Date.now() - 10000, endTime: Date.now(), expected: 100, counted: 100 + diff, difference: diff, startCash: 100, cashSales: 0, expenses: 0 });
  const post = (p) => createGasEnv().post(p);
  await R.t('F05 VAT ส่งมาไม่ครบทุก combination (1–3 ช่อง) → INVALID_SUMMARY', () => {
    const keys = Object.keys(VAT);
    for (let mask = 1; mask < 15; mask++) {
      const p = base(); keys.forEach((k, i) => { if (mask & (1 << i)) p[k] = VAT[k]; });
      const r = post(p);
      eq([mask, r.status, r.code], [mask, 'error', 'INVALID_SUMMARY'], r.message);
    }
  });
  await R.t('F05 control: VAT ครบ / ไม่มีเลย (แอปรุ่นก่อน VAT) ยังผ่าน', () => {
    eq(post(Object.assign(base(), VAT)).status, 'success');
    eq(post(base()).status, 'success');
  });
  await R.t('F05 กะขาด/เกิน −999 แต่ cashVariance 0 → ปฏิเสธ · shiftCount ไม่ตรง → ปฏิเสธ · ชนิดผิด → ปฏิเสธ', () => {
    eq(post(Object.assign(base(), VAT, { shiftCount: 1, cashVariance: 0, shiftCash: [shiftRow(-999)] })).code, 'INVALID_SUMMARY');
    eq(post(Object.assign(base(), VAT, { shiftCount: 2, cashVariance: 0, shiftCash: [shiftRow(0)] })).code, 'INVALID_SUMMARY');
    const bad = shiftRow(0); bad.counted = '100';
    eq(post(Object.assign(base(), VAT, { shiftCount: 1, cashVariance: 0, shiftCash: [bad] })).code, 'INVALID_SUMMARY');
  });
  await R.t('F05 control: กะที่ overspend (ผลต่าง ≠ นับได้−ควรมี) แต่รวมตรง cashVariance ยังผ่าน', () => {
    const over = Object.assign(shiftRow(-50), { expected: 0, counted: 0, overspend: 50 });
    eq(post(Object.assign(base(), VAT, { shiftCount: 2, cashVariance: -49.5, shiftCash: [over, shiftRow(0.5)] })).status, 'success');
  });
  await R.t('F05 แอปจริง: สรุปวันที่มีกะปิดแล้ว (ขาด 20) ผ่าน Apps Script ปัจจุบัน', () => shop({ rows: NO_CLOUD }, async s => {
    await sell(s, 300);
    const sh = s.app.state.shift;
    sh.history.push({ active: false, startTime: sh.startTime, endTime: Date.now(), startCash: 1000, cashSales: 300, expensesTotal: 0,
      drawerExpensesTotal: 0, expectedCash: 1300, countedCash: 1280, difference: -20, closedBy: 'x' });
    const cash = s.app.buildShiftCashSummary('day', s.app.currentBusinessDateKey());
    eq(cash.cashVariance, -20);
    const p = Object.assign(base(), { totalRevenue: 300, cashRevenue: 300, billCount: 1, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0,
      shiftCount: cash.shiftCount, cashVariance: cash.cashVariance, shiftCash: cash.shifts });
    eq(post(p).status, 'success');
  }));

  // ── F06: ล้างช่องวันที่/เดือน ──
  await R.t('F06 ล้างช่องวันที่ → คืนวันที่เดิม ตัวเลขตรงกับวันที่ที่เห็น · ล้างช่องเดือนก็เช่นกัน', () => shop({ rows: NO_CLOUD }, async s => {
    const P = Object.getPrototypeOf(s.app), d = s.env.document;
    s.app.filterReports = P.filterReports.bind(s.app); s.app.renderReportsChart = P.renderReportsChart.bind(s.app);
    await sell(s, 300);
    const today = s.app.currentBusinessDateKey();
    d.getElementById('report-date-input').value = today; s.app.state.selectedReportType = 'daily';
    s.app.filterReports();
    eq(d.getElementById('report-kpi-total').innerText, '฿300.00');
    d.getElementById('report-date-input').value = '';
    s.app.filterReports();
    eq(d.getElementById('report-date-input').value, today, 'ช่องวันที่ต้องไม่ว่างขณะยังแสดงยอด');
    ok(/ว่างไม่ได้/.test(s.toasts.map(x => x.m).join('|')), 'ต้องบอกผู้ใช้');
    d.getElementById('report-month-input').value = s.app.getBusinessISOMonth(new Date()); s.app.state.selectedReportType = 'monthly';
    s.app.filterReports();
    const month = d.getElementById('report-month-input').value;
    d.getElementById('report-month-input').value = '';
    s.app.filterReports();
    eq(d.getElementById('report-month-input').value, month);
  }));

  // ── F07: ป้ายการ์ดค่าใช้จ่าย ──
  await R.t('F07 การ์ดค่าใช้จ่ายบนแดชบอร์ดเขียนว่า "กะนี้" (ยอดมาจากกะปัจจุบันเท่านั้น)', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok(!/<span>รายการวันนี้<\/span>/.test(html), 'ยังเป็นป้าย "รายการวันนี้"');
    ok(/<span>ค่าใช้จ่ายกะนี้<\/span>/.test(html));
  });

  // ── F08: คีย์บอร์ดไม่หลุดออกจาก modal ──
  await R.t('F08 Tab วนอยู่ใน modal บนสุด · Enter ที่ปุ่มด้านหลังไม่ทำงาน', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const vm = require('vm');
    const mk = (inModal) => { const el = { inModal, disabled: false, tabIndex: 0, type: 'button', focused: false,
      getClientRects: () => [1], focus() { ctx.document.activeElement = el; }, blur() { ctx.document.activeElement = ctx.document.body; } }; return el; };
    const a = mk(true), b = mk(true), behind = mk(false);
    const modal = { contains: (el) => !!(el && el.inModal), querySelectorAll: () => [a, b] };
    let handler = null;
    const ctx = { window: {}, document: { body: {}, activeElement: null, querySelectorAll: () => [modal], addEventListener: (ty, fn) => { if (ty === 'keydown') handler = fn; } } };
    ctx.window.getComputedStyle = () => ({ zIndex: '10' });
    // ดึงเฉพาะท่อนตัวจัดการ focus ออกมารัน (ไม่รันทั้งแอป)
    const start = src.indexOf('function topOpenModal()'), end = src.indexOf('// เริ่มต้นแอปพลิเคชัน');
    ok(start > 0 && end > start, 'ไม่พบตัวจัดการ focus ของ modal');
    vm.createContext(ctx); vm.runInContext(src.slice(start, end), ctx);
    ok(typeof handler === 'function', 'ต้องติดตั้งตัวดักคีย์บอร์ด');
    const press = (key, shiftKey) => { const e = { key, shiftKey: !!shiftKey, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; handler(e); return e; };
    ctx.document.activeElement = b; eq(press('Tab').prevented, true); eq(ctx.document.activeElement, a);
    ctx.document.activeElement = a; eq(press('Tab', true).prevented, true); eq(ctx.document.activeElement, b);
    ctx.document.activeElement = behind; eq(press('Tab').prevented, true); eq(ctx.document.activeElement, a);
    ctx.document.activeElement = behind; eq(press('Enter').prevented, true); eq(ctx.document.activeElement, ctx.document.body);
    ctx.document.activeElement = a; eq(press('Enter').prevented, false);
  });

  // ── F09 / F10: ใบเสร็จ ──
  await R.t('F09 บิลรุ่นเก่า 2 บริการ ยอด 101: ไม่พิมพ์ราคา 50.5 ที่เดาเอง · ไม่จับคู่ผู้ดูแลเอง · บอกว่าไม่มีรายละเอียด · ยอดรวมเดิม', () => shop({ rows: NO_CLOUD }, async s => {
    const P = Object.getPrototypeOf(s.app);
    P.showThermalReceipt.call(s.app, { id: 'TX-LEGACY-SYNTH', date: Date.now(), services: ['Legacy A', 'Legacy B'], staffNames: ['Staff A', 'Staff B'],
      subtotal: 101, discount: 0, total: 101, paymentMethod: 'cash', customerName: 'Synthetic' });
    const h = s.env.document.getElementById('thermal-receipt-preview').innerHTML;
    ok(!/50\.5/.test(h), 'ยังพิมพ์ราคาเฉลี่ย 50.5');
    ok(!/ผู้ดูแล: Staff A<\/div>/.test(h) && !/ผู้ดูแล: Staff B<\/div>/.test(h), 'ยังจับคู่ผู้ดูแลรายบรรทัดเอง');
    ok(/ผู้ดูแล: Staff A, Staff B/.test(h));
    ok(/ไม่มีรายละเอียดราคาและผู้ดูแลแยกรายบริการ/.test(h));
    ok(/รวมค่าบริการ:<\/span>\s*<span>฿101</.test(h), 'ยอดรวมต้องคงเดิม');
  }));
  await R.t('F10 เปลี่ยนช่องทาง ยอดเท่าเดิม แล้วกด "ไม่มีเงินเคลื่อนไหว": ใบเสร็จไม่พิมพ์ "ไม่ได้คืน/ไม่ได้เก็บ ฿300" คู่กัน', () => shop({ rows: NO_CLOUD }, async s => {
    await sell(s, 300, 'cash');
    const tx = s.app.state.transactions.at(-1);
    s.app.openTransactionEdit(tx.id); s.env.document.getElementById('edit-tx-payment').value = 'promptpay';
    await s.app.saveTransactionEdit();
    eq(await s.app.recordBillSettlement(tx.id, 'waive'), true);
    Object.getPrototypeOf(s.app).showThermalReceipt.call(s.app, tx);
    const h = s.env.document.getElementById('thermal-receipt-preview').innerHTML;
    ok(!/ส่วนต่างที่ไม่ได้คืน/.test(h) && !/ส่วนต่างที่ไม่ได้เก็บเพิ่ม/.test(h), 'ยังพิมพ์ส่วนต่างสองฝั่ง');
    ok(/ปรับช่องทางชำระ:<\/span><span>เงินสด → Scan \(QR\)/.test(h), h.slice(h.indexOf('ชำระ'), h.indexOf('ชำระ') + 400));
    ok(/ไม่มีเงินเคลื่อนไหว/.test(h));
  }));
  await R.t('F10 control: waive ที่ไม่ได้คืนเงินจริง (ยอดลด) ยังพิมพ์ "ส่วนต่างที่ไม่ได้คืน"', () => shop({ rows: NO_CLOUD }, async s => {
    const tx = await pendingRefundBill(s);
    eq(await s.app.recordBillSettlement(tx.id, 'waive'), true);
    Object.getPrototypeOf(s.app).showThermalReceipt.call(s.app, tx);
    ok(/ส่วนต่างที่ไม่ได้คืน:<\/span><span>฿100\.00/.test(s.env.document.getElementById('thermal-receipt-preview').innerHTML));
  }));

  // ── R01: เพิ่ม/ลบค่าใช้จ่ายสั่งสำรองขึ้น Drive ──
  await R.t('R01 เพิ่มค่าใช้จ่าย → มีงานสำรองในคิว (ลงเครื่องพร้อมรายการ) · ลบค่าใช้จ่าย → เช่นกัน', () => shop({}, async s => {
    const d = s.env.document, set = (id, v) => { d.getElementById(id).value = v; };
    s.app.flushCloudOutbox = async () => {};   // ไม่ส่งจริง ดูแค่คิว
    set('expense-type', 'supply'); set('expense-source', 'drawer'); set('expense-amount', '40'); set('expense-note', 'x');
    await s.app.addExpense();
    const jobs = (await s.env.raw('cloudOutbox')).filter(j => j && j.needBackup);
    eq(jobs.length, 1, JSON.stringify(await s.env.raw('cloudOutbox')));
    ok(jobs[0].changeKinds.includes('expense'));
    s.app.state.cloudOutbox = []; await s.app.saveState();
    await s.app.deleteExpense(s.app.state.shift.expenses[0].id); await s.app._confirmP;
    eq((await s.env.raw('cloudOutbox')).filter(j => j && j.needBackup).length, 1);
  }));
  await R.t('R01 บันทึกค่าใช้จ่ายล้ม → ไม่มีรายการ และคิวสำรองถูกคืน', () => shop({}, async s => {
    const d = s.env.document, set = (id, v) => { d.getElementById(id).value = v; };
    s.app.flushCloudOutbox = async () => {};
    const before = JSON.stringify(s.app.state.cloudOutbox);
    s.app.saveStateOrThrow = async () => { throw new Error('disk full'); };
    set('expense-type', 'supply'); set('expense-source', 'drawer'); set('expense-amount', '40'); set('expense-note', 'x');
    await s.app.addExpense();
    eq(s.app.state.shift.expenses.length, 0);
    eq(JSON.stringify(s.app.state.cloudOutbox), before);
  }));

  // ── F11 ──
  await R.t('F11 sim_drawer_a5.js: ปกติ exit 0 · ฉีดความต่างเงินสด +1 บาทจริง → รายงาน PROBLEMS และ exit 1', () => {
    // ฉีด fault ผ่าน -r: ห่อ makeShop ให้ computeShiftDrawer คืนยอดควรมี +1 บาท (ไม่แตะไฟล์แอป)
    const faultDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pos-f11-'));
    const fault = path.join(faultDir, 'fault.js');
    fs.writeFileSync(fault, `const fx = require(${JSON.stringify(path.join(__dirname, 'fixtures_db.js'))});
const orig = fx.makeShop;
fx.makeShop = async (o) => { const s = await orig(o); const P = Object.getPrototypeOf(s.app);
  s.app.computeShiftDrawer = function () { const r = P.computeShiftDrawer.apply(this, arguments); if (r && typeof r.expected === 'number') r.expected += 1; return r; };
  return s; };\n`);
    const env = Object.assign({}, process.env, { TZ: 'Asia/Bangkok', SEEDS: '1', SHIFTS: '1', OPS: '3' });
    try {
      const normal = spawnSync(process.execPath, [path.join(__dirname, 'sim_drawer_a5.js')], { encoding: 'utf8', env, timeout: 300000 });
      eq(normal.status, 0, (normal.stdout || '') + (normal.stderr || ''));
      ok(/NO MISMATCH/.test(normal.stdout));
      const bad = spawnSync(process.execPath, ['-r', fault, path.join(__dirname, 'sim_drawer_a5.js')], { encoding: 'utf8', env, timeout: 300000 });
      ok(/PROBLEMS/.test(bad.stdout), 'fault ต้องถูกจับ: ' + (bad.stdout || '').slice(-300));
      eq(bad.status, 1);
    } finally { fs.rmSync(faultDir, { recursive: true, force: true }); }
  });

  // ── F04: commit ที่ค้าง push ต้องถูกตรวจ (ใช้ Git จำลอง ไม่มี Git จริง) ──
  const shells = (process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh'])
    .filter(sh => { const p = spawnSync(sh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8', timeout: 30000, windowsHide: true }); return !p.error; });
  if (!shells.length) console.log('  SKIP F04: ไม่มี PowerShell ในเครื่องนี้');
  const runPs = (shell, script, cfg) => {
    const dir = fs.mkdtempSync(path.join(__dirname, 'codex-ps-'));
    try {
      fs.mkdirSync(path.join(dir, 'tests')); fs.mkdirSync(path.join(dir, '.git'));
      for (const f of [script, 'sw.js', 'app.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
      fs.writeFileSync(path.join(dir, 'tests/run-all.js'), 'process.exit(0)\n');
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(cfg));
      fs.writeFileSync(path.join(dir, 'invoke.ps1'), `
$ErrorActionPreference = 'Stop'
$global:cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
$global:trace = Join-Path $PSScriptRoot 'trace.txt'
function git {
  $a = @($args | ForEach-Object { [string]$_ })
  Add-Content -LiteralPath $global:trace -Value ($a -join ' ')
  $global:LASTEXITCODE = 0
  if ($a[0] -eq '-c') { $a = @($a | Select-Object -Skip 2) }
  switch ($a[0]) {
    'status' { return @($global:cfg.status) }
    'diff' {
      if ($a -contains '--stat') { return '' }
      if ($a -contains '--cached') { return [string][char]0 }
      if (($a | Where-Object { $_ -like '*..HEAD' }).Count -gt 0) { return (@($global:cfg.net) -join [char]0) + [char]0 }
      return [string][char]0
    }
    'log' {
      if ($a -contains '--name-only') { return (@($global:cfg.hist) -join [char]0) + [char]0 }
      if ($a -contains '-p') { return @($global:cfg.patch) }
      return
    }
    'rev-list' { return '1' }
    'symbolic-ref' { return 'main' }
    'rev-parse' { return 'origin/main' }
    'fetch' { return }
    'branch' { return }
    'add' { return }
    'commit' { return }
    'rebase' { return }
    'push' { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'pushed.txt') -Value 'pushed'; return }
    default { throw ('Unmocked: ' + ($a -join ' ')) }
  }
}
function Read-Host { return 'y' }
& (Join-Path $PSScriptRoot '${script}')
exit $LASTEXITCODE
`);
      const proc = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', timeout: 90000, windowsHide: true });
      return { status: proc.status, out: (proc.stdout || '') + (proc.stderr || ''), pushed: fs.existsSync(path.join(dir, 'pushed.txt')) };
    } finally {
      const resolved = path.resolve(dir);
      if (path.dirname(resolved) === path.resolve(__dirname) && path.basename(resolved).startsWith('codex-ps-')) fs.rmSync(resolved, { recursive: true, force: true });
    }
  };
  for (const shell of shells) for (const script of ['deploy.ps1', 'fix-push.ps1']) {
    const clean = { status: [], net: [], hist: [], patch: [] };
    await R.t(`F04 ${shell} ${script}: commit ค้างที่แตะ audit/ (ผลต่างสุทธิ) → หยุดก่อน push`, () => {
      const r = runPs(shell, script, Object.assign({}, clean, { net: ['audit/synthetic-private-export.json'], hist: ['audit/synthetic-private-export.json'] }));
      eq([r.status !== 0, r.pushed], [true, false], r.out.slice(-600));
    });
    await R.t(`F04 ${shell} ${script}: เพิ่มไฟล์ส่วนตัวแล้วลบใน commit ถัดไป (ผลต่างสุทธิว่าง) → หยุด`, () => {
      const r = runPs(shell, script, Object.assign({}, clean, { status: [' M README.md'], hist: ['README.md', 'private-export.json', 'private-export.json'] }));
      eq([r.status !== 0, r.pushed], [true, false], r.out.slice(-600));
    });
    await R.t(`F04 ${shell} ${script}: บรรทัดที่เพิ่มมี Telegram bot token สมมติ → หยุด`, () => {
      const fake = '+const t = "' + '1234567890' + ':' + 'A'.repeat(35) + '";';
      const r = runPs(shell, script, Object.assign({}, clean, { hist: ['tests/x.js'], net: ['tests/x.js'], patch: ['+++ b/tests/x.js', fake] }));
      eq([r.status !== 0, r.pushed], [true, false], r.out.slice(-600));
    });
    await R.t(`F04 ${shell} ${script}: control — commit ที่มีแต่ไฟล์ในรายการอนุญาต ยัง push ได้`, () => {
      const r = runPs(shell, script, Object.assign({}, clean, { net: ['app.js', 'sw.js'], hist: ['app.js', 'sw.js'], patch: ['+++ b/app.js', '+const x = 1;'] }));
      eq([r.status, r.pushed], [0, true], r.out.slice(-600));
    });
  }

  R.done();
})();
