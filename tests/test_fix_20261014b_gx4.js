// ตรวจ 14 ต.ค. 2569 รอบ 2 (gx4) — เจ้าของตัดสินแล้ว
//  ก. ค่าใช้จ่าย "จ่ายจากลิ้นชัก" เกินเพดาน (1,000 บาทตั้งแต่ 27 ต.ค. 2569 · เดิม 500) ต้องใส่ PIN ของคนที่ลง (ผ่านฟอร์มจริง → addExpense)
//  ข. ผู้จัดการไม่เห็นแถวบิลที่ไม่ใช่วันทำการนี้ในตาราง "แก้บิลย้อนหลัง" / "บิลที่ถูกยกเลิก"
//  ป้ายบนชีต: ยอดเกินลิ้นชักจากเงินคืน ต้องไม่ขึ้นว่า "ค่าใช้จ่ายเกินลิ้นชัก" · Apps Script รุ่นเก่าต้องไม่พังกับ payload ใหม่
// แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จริงในชีตจำลอง
const path = require('path');
const { execFileSync } = require('child_process');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');

const OLD_GAS_CHILD = process.env.GX4_OLD_GAS_CHILD === '1';
const R = makeRunner(OLD_GAS_CHILD ? '' : '--- gx4: expense PIN > 500 · manager audit rows · overspend cause on sheet ---');
const textOf = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function sale(env, amount) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], 'cash', amount);
  const n = env.app.state.transactions.length;
  await env.app.processCheckout(); await settle(30);
  ok(env.app.state.transactions.length === n + 1, 'ขายไม่สำเร็จ');
  return env.app.state.transactions.at(-1);
}
// กรอกฟอร์มค่าใช้จ่ายแล้วกดบันทึก (onsubmit="app.addExpense(event)")
function fillExpense(env, amount, source, note) {
  const d = env.document;
  d.getElementById('expense-type').value = 'other';
  d.getElementById('expense-amount').value = String(amount);
  d.getElementById('expense-source').value = source || 'drawer';
  d.getElementById('expense-note').value = note || 'ซื้อของ';
  d.getElementById('expense-staff-id').value = '';
}
const submitExpense = (app) => app.addExpense({ preventDefault() {} });
// ใช้ด่าน PIN ตัวจริง + กล่องใส่ PIN จำลอง (ตอบตามที่เทสต์กำหนด)
function realStepUp(app, answer) {
  app.confirmPinStepUp = app._realConfirmPinStepUp;
  const asked = [];
  app.askSecret = async (msg) => { asked.push(msg); return typeof answer === 'function' ? answer(msg) : answer; };
  return asked;
}
const expAmounts = app => (app.state.shift.expenses || []).map(e => e.amount);

// ยกเลิกบิลกะก่อนแบบคืนเงินจนเกินเงินในลิ้นชัก → ปิดกะ → ส่งสรุปขึ้นชีต · คืนข้อความทั้งแท็บสรุปของวันนั้น
async function refundOverspendDay(opts) {
  const cash = { 1000: 1 };
  const shop = await makeShop({ cash });
  const { env, app, gas } = shop;
  await settle();
  const a = await sale(env, 800);
  for (const k in cash) delete cash[k]; cash[1000] = 1; cash[1] = 800;
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(30);
  for (const k in cash) delete cash[k]; cash[100] = 3;
  app.cashCounterMode = 'open'; await app.confirmCashCount(); await settle(30);
  app.openTransactionEdit(a.id);
  env.document.getElementById('void-money-outcome').value = 'refunded';
  env.document.getElementById('edit-tx-id').value = a.id;
  await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle(30);
  if (opts && opts.expense) { fillExpense(env, 200, 'drawer'); await submitExpense(app); await settle(20); }
  for (const k in cash) delete cash[k]; cash[1] = 0;
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(30);
  const h = app.state.shift.history.at(-1);
  if (opts && opts.legacy) delete h.overspendCause;   // กะที่ปิดด้วยแอปรุ่นก่อนมีช่องนี้
  await settle(120);
  if (opts && opts.legacy) app.enqueueSummaryRefresh(app.shiftAnchorTime(h));   // ส่งสรุปของวันนั้นใหม่ด้วยกะแบบเก่า
  const day = app.getBusinessISODate(app.shiftAnchorTime(h));
  await app.flushCloudOutbox(); await settle(120);
  const tab = gas.sheet('สรุป-' + day);
  const cells = tab ? [].concat(...tab._grid).map(String) : [];
  const summary = app.buildShiftCashSummary('day', day);
  return { env, app, gas, h, day, cells, summary, over: summary.shifts.find(x => x.overspend > 0) || {} };
}

(async () => {
  if (OLD_GAS_CHILD) {
    // ── รันในโปรเซสลูก: Apps Script รุ่นก่อนแก้ (POS_GAS_SRC) + แอปใหม่ ──
    await R.t('Apps Script รุ่นเก่า + แอปใหม่ (มี overspendCause): สรุปขึ้นชีตได้ ใช้ป้ายเดิม', async () => {
      const r = await refundOverspendDay();
      try {
        eq(r.over.overspendCause, 'refund', 'แอปไม่ส่งต้นเหตุ');
        ok(r.cells.some(x => /ค่าใช้จ่ายเกินลิ้นชัก 500\.00 \(นับเป็นเงินขาด\)/.test(x)), 'ชีตรุ่นเก่าเขียนสรุปไม่สำเร็จ: ' + r.gas.sheetNames().join(','));
        ok(!r.app.state.cloudOutbox.some(j => j && j.needSummary), 'งานสรุปค้าง (ชีตรุ่นเก่าปฏิเสธ payload ใหม่)');
      } finally { r.env.dispose(); }
    });
    return R.done();
  }

  // ═══ ก. PIN ค่าใช้จ่ายจากลิ้นชักเกินเพดาน (500 → 1,000 เจ้าของปรับ 27 ต.ค. 2569) ═══
  await R.t('ก: ผู้จัดการลงจ่ายจากลิ้นชัก 1,200 → ถาม PIN ของตัวเอง · PIN ถูก = บันทึก', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle(); loginAs(app, 'manager');
      const asked = realStepUp(app, '222222');
      fillExpense(env, 1200); await submitExpense(app); await settle(20);
      eq(asked.length, 1, 'ไม่ถาม PIN');
      ok(/บี/.test(asked[0]), 'ไม่ได้ถาม PIN ของคนที่ลง: ' + asked[0]);
      eq(expAmounts(app), [1200], 'ไม่บันทึก');
      eq(env.document.getElementById('expense-amount').value, '', 'ฟอร์มไม่ล้างหลังบันทึก');
    } finally { env.dispose(); }
  });

  await R.t('ก: ยกเลิกกล่อง PIN = ไม่บันทึก และฟอร์มยังอยู่ครบ', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle(); loginAs(app, 'manager');
      const asked = realStepUp(app, null);
      fillExpense(env, 1200, 'drawer', 'ค่าน้ำแข็ง'); await submitExpense(app); await settle(20);
      eq(asked.length, 1, 'ไม่ถาม PIN');
      eq(expAmounts(app), [], 'บันทึกทั้งที่ยกเลิก PIN');
      eq([env.document.getElementById('expense-amount').value, env.document.getElementById('expense-note').value], ['1200', 'ค่าน้ำแข็ง'], 'ฟอร์มถูกล้าง');
    } finally { env.dispose(); }
  });

  await R.t('ก: PIN ผิด = ไม่บันทึก', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle(); loginAs(app, 'manager');
      realStepUp(app, '999999');
      fillExpense(env, 1200); await submitExpense(app); await settle(20);
      eq(expAmounts(app), [], 'บันทึกทั้งที่ PIN ผิด');
    } finally { env.dispose(); }
  });

  await R.t('ก: 1,000 พอดี (จากลิ้นชัก) และ 1,200 จ่ายทางอื่น ไม่ถาม PIN', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle(); loginAs(app, 'manager');
      const asked = realStepUp(app, '222222');
      fillExpense(env, 1000, 'drawer'); await submitExpense(app); await settle(20);
      fillExpense(env, 1200, 'other', 'โอน'); await submitExpense(app); await settle(20);
      eq(asked.length, 0, 'ถาม PIN ทั้งที่ไม่ถึงเกณฑ์/จ่ายทางอื่น');
      eq(expAmounts(app), [1000, 1200]);
    } finally { env.dispose(); }
  });

  await R.t('ก: เจ้าของลง 1,200 จากลิ้นชัก — ตามด่าน PIN ซ้ำเดิม (เจ้าของไม่ถูกถาม) บันทึกได้', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle(); loginAs(app, 'owner');
      const asked = realStepUp(app, '246810');
      fillExpense(env, 1200); await submitExpense(app); await settle(20);
      eq(asked.length, 0);
      eq(expAmounts(app), [1200]);
    } finally { env.dispose(); }
  });

  await R.t('ก: กดบันทึกซ้ำ/กดรายการอื่นระหว่างรอ PIN — ไม่มีกล่อง PIN ซ้อน ไม่ลงซ้ำ', async () => {
    const { env, app, toasts } = await makeShop({});
    try {
      await settle(); loginAs(app, 'manager');
      let release; const gate = new Promise(r => { release = r; });
      const asked = realStepUp(app, async () => { await gate; return '222222'; });
      fillExpense(env, 1200);
      const p1 = submitExpense(app); await settle(10);
      const p2 = submitExpense(app); await settle(10);              // แตะซ้ำ ฟอร์มเดิม
      fillExpense(env, 1300, 'drawer', 'อีกรายการ');
      const p3 = submitExpense(app); await settle(10);              // รายการอื่นระหว่างกล่อง PIN เปิดอยู่
      eq(asked.length, 1, 'เปิดกล่อง PIN ซ้อน');
      release(); await Promise.all([p1, p2, p3]); await settle(30);
      eq(expAmounts(app), [1200], 'ลงซ้ำ/ลงรายการที่ไม่ได้ใส่ PIN');
      eq(env.document.getElementById('expense-amount').value, '1300', 'ฟอร์มรายการที่สองหาย');
      ok(toasts.some(x => /PIN/.test(x.m) && /ก่อน/.test(x.m)), 'ไม่บอกว่าต้องทำรายการแรกให้จบก่อน');
    } finally { env.dispose(); }
  });

  // ═══ ข. ผู้จัดการเห็นเฉพาะแถวของบิลวันนี้ในตารางแก้/ยกเลิกย้อนหลัง ═══
  await R.t('ข: เจ้าของแก้/ยกเลิกบิลวันก่อนวันนี้ — ผู้จัดการไม่เห็นแถวนั้น · เห็นแถวบิลวันนี้ · เจ้าของเห็นครบ', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const P = Object.getPrototypeOf(app);
      const d = env.document;
      const oldEdit = await sale(env, 500), oldVoid = await sale(env, 600), today = await sale(env, 700);
      const past = new Date(Date.now() - 10 * 86400e3).toISOString();
      [oldEdit, oldVoid].forEach(tx => { tx.date = past; if (tx.tender) tx.tender.at = past; });
      loginAs(app, 'owner');
      for (const tx of [oldEdit, today]) {
        app.openTransactionEdit(tx.id);
        d.getElementById('edit-tx-customer').value = 'ลูกค้า ' + tx.id;
        d.getElementById('edit-tx-discount').value = '100';
        await app.saveTransactionEdit(); await settle(30);
      }
      app.openTransactionEdit(oldVoid.id);
      d.getElementById('void-money-outcome').value = 'none';
      d.getElementById('edit-tx-id').value = oldVoid.id;
      await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle(30);
      eq(app.state.editLog.length, 2, 'แก้บิลไม่สำเร็จ'); ok(app.state.voidLog.some(v => v.billId === oldVoid.id), 'ยกเลิกไม่สำเร็จ');
      const view = role => {
        loginAs(app, role); app.state.selectedReportType = 'daily';
        d.getElementById('report-date-input').value = app.currentBusinessDateKey();
        P.filterReports.call(app);
        return { edits: d.getElementById('report-bill-edits-body').innerHTML, editCount: d.getElementById('report-bill-edits-count').innerText,
          voids: d.getElementById('report-voids-body').innerHTML, voidCount: d.getElementById('report-voids-count').innerText };
      };
      const m = view('manager');
      ok(!m.edits.includes(oldEdit.id), 'ผู้จัดการเห็นแถวแก้บิลของวันก่อน');
      ok(!m.voids.includes(oldVoid.id), 'ผู้จัดการเห็นแถวยกเลิกบิลของวันก่อน');
      ok(m.edits.includes(today.id), 'ผู้จัดการไม่เห็นแถวแก้บิลของวันนี้');
      ok(/^1 ครั้ง/.test(m.editCount), 'ตัวนับแก้บิลยังนับบิลวันก่อน: ' + m.editCount);
      eq(m.voidCount, '', 'ตัวนับยกเลิกยังนับบิลวันก่อน');
      const o = view('owner');
      ok(o.edits.includes(oldEdit.id) && o.edits.includes(today.id) && o.voids.includes(oldVoid.id), 'เจ้าของไม่เห็นครบ');
    } finally { env.dispose(); }
  });

  // ═══ ป้ายบนชีต: ยอดเกินลิ้นชักตามต้นเหตุ ═══
  await R.t('ชีต: ยอดเกินจากเงินคืนลูกค้า → ป้าย "เงินคืนลูกค้าเกินลิ้นชัก" ไม่ใช่ "ค่าใช้จ่ายเกินลิ้นชัก"', async () => {
    const r = await refundOverspendDay();
    try {
      eq(r.over.overspendCause, 'refund', 'payload สรุปไม่มีต้นเหตุ');
      ok(r.cells.some(x => /เงินคืนลูกค้าเกินลิ้นชัก 500\.00 \(นับเป็นเงินขาด\)/.test(x)), 'ไม่มีป้ายเงินคืน: ' + r.cells.filter(x => /เกิน/.test(x)).join(' | '));
      ok(!r.cells.some(x => /ค่าใช้จ่ายเกินลิ้นชัก/.test(x)), 'ยังขึ้นว่าค่าใช้จ่ายเกินลิ้นชัก');
    } finally { r.env.dispose(); }
  });

  await R.t('ชีต: ค่าใช้จ่าย + เงินคืน → ป้ายรวมทั้งสองอย่าง', async () => {
    const r = await refundOverspendDay({ expense: true });
    try {
      eq(r.over.overspendCause, 'mixed');
      ok(r.cells.some(x => /ค่าใช้จ่าย\+เงินคืนเกินลิ้นชัก 700\.00/.test(x)), 'ไม่มีป้ายรวม');
    } finally { r.env.dispose(); }
  });

  await R.t('ชีต (ควรคงเดิม): กะเก่าไม่มีต้นเหตุ → ป้ายเดิม "ค่าใช้จ่ายเกินลิ้นชัก"', async () => {
    const r = await refundOverspendDay({ legacy: true });
    try {
      ok(!('overspendCause' in JSON.parse(JSON.stringify(r.over))), 'ส่งต้นเหตุทั้งที่กะไม่มี');
      ok(r.cells.some(x => /ค่าใช้จ่ายเกินลิ้นชัก 500\.00 \(นับเป็นเงินขาด\)/.test(x)), 'กะเก่าไม่ได้ป้ายเดิม: ' + r.cells.filter(x => /เกิน|รวม/.test(x)).join(' | ') + ' tabs ' + r.gas.sheetNames().join(','));
    } finally { r.env.dispose(); }
  });

  await R.t('ชีตรุ่นเก่า (base2) + แอปใหม่: ไม่พัง ใช้ป้ายเดิม', async () => {
    // Apps Script รุ่นก่อนรอบนี้ (สำเนาใน backup\ — ไม่ขึ้น repo) · ไม่มีไฟล์ = ข้ามข้อนี้
    const oldGas = process.env.GX4_OLD_GAS || require('path').join(__dirname, '..', 'backup', 'ก่อนแก้_claude_20261014b', 'google_apps_script.js');
    if (!require('fs').existsSync(oldGas)) { console.log('  (ข้าม: ไม่มี ' + oldGas + ')'); return; }
    const out = execFileSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { GX4_OLD_GAS_CHILD: '1', POS_GAS_SRC: oldGas }), encoding: 'utf8', timeout: 240000
    });
    ok(/ผ่าน 1 · ไม่ผ่าน 0/.test(out), out.split('\n').filter(l => /PASS|FAIL|===/.test(l)).join(' | '));
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
