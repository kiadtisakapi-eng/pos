// หมายเหตุบิล + หมายเหตุปิดกะ (เจ้าของสั่ง 14 ต.ค. 2569)
//  ตัดสินแล้ว: 1) ไม่พิมพ์บนใบเสร็จลูกค้า  2) ปิดกะแบบเงินขาด/เกินต้องกรอกหมายเหตุ (ตรงพอดีไม่บังคับ)
//             3) แก้หมายเหตุบิลย้อนหลังได้ตามสิทธิ์แก้บิลเดิม  4) ใช้ภายใน ให้เจ้าของดู (ไม่ขึ้นการ์ดคิว)
//  สิ่งที่ต้องเป็นจริง:
//   · หมายเหตุไม่แตะตัวเลขเงินเลย · ช่องหมายเหตุหาย = ทำงานต่อได้ (ไม่ใช่ช่องเงิน)
//   · ชีต: คอลัมน์ "หมายเหตุ (POS)" ท้ายแท็บบิล หาจากชื่อหัว · 13 คอลัมน์หลักไม่ขยับ · ไม่อยู่ในลายนิ้วมือบิล
//   · Apps Script รุ่นก่อน + แอปใหม่ ต้องไม่พัง (หมายเหตุหายเงียบได้ แต่บิล/สรุปต้องขึ้นชีต)
// แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จริงในชีตจำลอง
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db');

const OLD_GAS_CHILD = process.env.NOTES_OLD_GAS_CHILD === '1';
const R = makeRunner(OLD_GAS_CHILD ? '' : '--- หมายเหตุบิล + หมายเหตุปิดกะ (14 ต.ค. 2569) ---');
const textOf = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NOTE_HEADER = 'หมายเหตุ (POS)';

async function sale(env, amount, note, pay) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], pay || 'cash', amount);
  if (note !== undefined) env.document.getElementById('checkout-bill-note').value = note;
  const n = env.app.state.transactions.length;
  await env.app.processCheckout(); await settle(30);
  ok(env.app.state.transactions.length === n + 1, 'ขายไม่สำเร็จ');
  return env.app.state.transactions.at(-1);
}
const setCash = (cash, counts) => { for (const k in cash) delete cash[k]; Object.assign(cash, counts); };
async function closeShift(app) { app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(30); }
const payloadOf = (app, tx) => JSON.parse(JSON.stringify(app.buildBillPayload(tx)));
// แถวบิลบนชีต (แท็บเดือน) — คืน { headers, row, noteCol }
function sheetRow(gas, app, tx) {
  const tab = gas.sheet(app.getBusinessMonthKey(tx.date));
  if (!tab) return { headers: [], row: null, noteCol: 0 };
  const headers = (tab._grid[0] || []).map(String);
  const row = tab._grid.find(r => String(r[0]) === tx.id) || null;
  return { tab, headers, row, noteCol: headers.indexOf(NOTE_HEADER) + 1 };
}
async function syncAll(app) { await app.syncPendingTransactions(true); await settle(60); }
function openEditAs(app, tx, role) { loginAs(app, role); app.openTransactionEdit(tx.id); }

(async () => {
  if (OLD_GAS_CHILD) {
    // ── โปรเซสลูก: Apps Script รุ่นก่อนมีหมายเหตุ (POS_GAS_SRC) + แอปใหม่ ──
    await R.t('Apps Script รุ่นก่อน + แอปใหม่: บิลมีหมายเหตุขึ้นชีตได้ · สรุปปิดกะที่มีหมายเหตุขึ้นชีตได้', async () => {
      const cash = { 1000: 1 };
      const { env, app, gas } = await makeShop({ cash });
      try {
        await settle();
        const tx = await sale(env, 300, 'ลูกค้าขอเปลี่ยนหมอ');
        await syncAll(app);
        eq(app.state.transactions.find(t => t.id === tx.id).syncStatus, 'synced', 'บิลไม่ขึ้นชีตรุ่นเก่า');
        const { row } = sheetRow(gas, app, tx);
        ok(row && Number(row[11]) === 300, 'แถวบิลบนชีตรุ่นเก่าผิด');
        env.document.getElementById('closing-note').value = 'ทอนผิด';
        await closeShift(app);
        ok(app.state.shift.active === false, 'ปิดกะไม่สำเร็จ');
        await settle(120); await app.flushCloudOutbox(); await settle(150);
        ok(!app.state.cloudOutbox.some(j => j && j.needSummary), 'งานสรุปค้าง (ชีตรุ่นเก่าปฏิเสธ payload ที่มีหมายเหตุ)');
      } finally { env.dispose(); }
    });
    return R.done();
  }

  // ═══ ตัวทำความสะอาดข้อความ ═══
  await R.t('normalizeNote: ไม่ใช่ข้อความ = ว่าง · ขึ้นบรรทัด/แท็บ → ช่องว่าง · ตัด 200 ตัวอักษรโดยไม่ตัดกลางอีโมจิ', async () => {
    const { env, app } = await makeShop({});
    try {
      eq([app.normalizeNote(null), app.normalizeNote(123), app.normalizeNote({ a: 1 }), app.normalizeNote('  ')], ['', '', '', '']);
      eq(app.normalizeNote(' ก\n\tข\r\n  ค  ง '), 'ก ข ค ง');
      const long = '😀'.repeat(250);
      const out = app.normalizeNote(long);
      eq(Array.from(out).length, 200, 'ไม่ตัดที่ 200 ตัวอักษร');
      ok(!/[\uD800-\uDBFF]$/.test(out), 'ตัดกลางอีโมจิ (เหลือครึ่งตัว)');
    } finally { env.dispose(); }
  });

  // ═══ หมายเหตุบิลตอนขาย ═══
  await R.t('ขายพร้อมหมายเหตุ: เก็บในบิล · ส่งขึ้นชีต · ล้างช่องหลังขาย · ตัวเลขเงินเท่ากับบิลไม่มีหมายเหตุ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, '  ลูกค้าขอเปลี่ยนหมอ\nแถม 15 นาที ');
      const b = await sale(env, 300);
      eq(a.billNote, 'ลูกค้าขอเปลี่ยนหมอ แถม 15 นาที', 'หมายเหตุในบิลผิด');
      ok(!Object.prototype.hasOwnProperty.call(b, 'billNote'), 'บิลไม่มีหมายเหตุ ต้องไม่มีช่อง billNote เลย');
      eq(env.document.getElementById('checkout-bill-note').value, '', 'ช่องหมายเหตุไม่ถูกล้างหลังขาย');
      const money = t => [t.subtotal, t.discount, t.total, t.nonVatBase, t.vatableBase, t.vatAmount, t.rounding, JSON.stringify(t.details), JSON.stringify(t.tender && { ...t.tender, at: 0 })];
      eq(money(a), money(b), 'หมายเหตุทำให้ตัวเลขเงินของบิลต่างไป');
      eq(payloadOf(app, a).billNote, 'ลูกค้าขอเปลี่ยนหมอ แถม 15 นาที');
      ok(!('billNote' in payloadOf(app, b)), 'payload ของบิลไม่มีหมายเหตุ ต้องไม่ส่งช่อง billNote');
      await syncAll(app);
      const ra = sheetRow(gas, app, a), rb = sheetRow(gas, app, b);
      ok(ra.noteCol > 13, 'ไม่มีคอลัมน์หมายเหตุท้ายตาราง: ' + ra.headers.join('|'));
      eq(String(ra.row[ra.noteCol - 1]), 'ลูกค้าขอเปลี่ยนหมอ แถม 15 นาที', 'หมายเหตุบนชีตผิด');
      eq(String(rb.row[ra.noteCol - 1] || ''), '', 'บิลไม่มีหมายเหตุได้ข้อความบนชีต');
      eq([a, b].map(t => app.state.transactions.find(x => x.id === t.id).syncStatus), ['synced', 'synced']);
    } finally { env.dispose(); }
  });

  await R.t('หาช่องหมายเหตุบนจอไม่เจอ = ขายต่อได้ (ไม่ใช่ช่องเงิน) และบิลไม่มีหมายเหตุ', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const orig = env.document.getElementById.bind(env.document);
      env.document.getElementById = (id) => (id === 'checkout-bill-note' ? null : orig(id));
      const a = await sale(env, 300);
      ok(!('billNote' in a), 'บิลได้หมายเหตุทั้งที่ไม่มีช่อง');
    } finally { env.dispose(); }
  });

  await R.t('ไม่พิมพ์บนใบเสร็จลูกค้า (ใบเสร็จจริง showThermalReceipt) แต่เห็นในตารางประวัติบิล (escape แล้ว)', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const evil = 'แถมนวดคอ <img src=x onerror=alert(1)>';
      const a = await sale(env, 300, evil);
      const P = Object.getPrototypeOf(app);
      P.showThermalReceipt.call(app, a);
      const receipt = env.document.getElementById('thermal-receipt-preview').innerHTML;
      ok(receipt.includes(a.id) || receipt.length > 50, 'ใบเสร็จไม่ถูกวาด (เทสต์ไม่ได้ตรวจของจริง)');
      ok(!receipt.includes('แถมนวดคอ'), 'หมายเหตุไปโผล่บนใบเสร็จลูกค้า');
      app.state.selectedReportType = 'daily';
      env.document.getElementById('report-date-input').value = app.getBusinessISODate(a.date);
      env.document.getElementById('report-staff-filter').value = 'all';
      P.filterReports.call(app);
      const html = env.document.getElementById('report-transactions-body').innerHTML;
      ok(html.includes('แถมนวดคอ'), 'ตารางประวัติบิลไม่แสดงหมายเหตุ');
      ok(!html.includes('<img') && html.includes('&lt;img'), 'หมายเหตุไม่ถูก escape (ข้อความกลายเป็นโค้ด)');
    } finally { env.dispose(); }
  });

  // ═══ แก้หมายเหตุย้อนหลัง ═══
  await R.t('เจ้าของแก้หมายเหตุอย่างเดียว: รุ่นบิล +1 · ลงประวัติแก้บิล · ไม่ส่งสรุปใหม่ · ชีตอัปเดตช่องหมายเหตุ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'เดิม');
      await syncAll(app);
      const rev0 = a.rev;
      let summaryRefresh = 0;
      app.enqueueSummaryRefresh = () => { summaryRefresh++; };
      openEditAs(app, a, 'owner');
      eq(env.document.getElementById('edit-tx-note').value, 'เดิม', 'หน้าต่างแก้บิลไม่โชว์หมายเหตุเดิม');
      eq(env.document.getElementById('edit-tx-note').disabled, false, 'เจ้าของแก้หมายเหตุไม่ได้');
      env.document.getElementById('edit-tx-note').value = 'ใหม่: ลูกค้าประจำ';
      await app.saveTransactionEdit(); await settle(30);
      const tx = app.state.transactions.find(t => t.id === a.id);
      eq([tx.billNote, tx.rev, tx.total], ['ใหม่: ลูกค้าประจำ', rev0 + 1, 300]);
      const log = app.state.editLog.at(-1);
      eq([log.billId, log.fields, log.before.note, log.after.note], [a.id, ['note'], 'เดิม', 'ใหม่: ลูกค้าประจำ']);
      eq(summaryRefresh, 0, 'แก้แค่หมายเหตุแต่ส่งสรุปใหม่ (หมายเหตุไม่อยู่ในสรุป)');
      await syncAll(app);
      const r = sheetRow(gas, app, a);
      eq(String(r.row[r.noteCol - 1]), 'ใหม่: ลูกค้าประจำ', 'ชีตไม่อัปเดตหมายเหตุ');
      eq(Number(r.row[11]), 300);
      // ตารางประวัติแก้บิลบอกว่าแก้หมายเหตุจากอะไรเป็นอะไร
      app.state.selectedReportType = 'daily';
      env.document.getElementById('report-date-input').value = app.getBusinessISODate(a.date);
      env.document.getElementById('report-staff-filter').value = 'all';
      Object.getPrototypeOf(app).filterReports.call(app);
      const audit = textOf(env.document.getElementById('report-bill-edits-body').innerHTML);
      ok(/หมายเหตุ/.test(audit) && audit.includes('เดิม') && audit.includes('ใหม่: ลูกค้าประจำ'), 'ประวัติแก้บิลไม่บอกการแก้หมายเหตุ: ' + audit);
    } finally { env.dispose(); }
  });

  await R.t('ลบหมายเหตุทิ้ง: บิลเก็บเป็นค่าว่าง → ชีตล้างช่อง · ส่งบิลซ้ำแบบไม่มีช่อง billNote = ชีตไม่แตะช่อง', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'จะลบ');
      const b = await sale(env, 300, 'คงไว้');
      await syncAll(app);
      openEditAs(app, a, 'owner');
      env.document.getElementById('edit-tx-note').value = '   ';
      await app.saveTransactionEdit(); await settle(30);
      const tx = app.state.transactions.find(t => t.id === a.id);
      eq(tx.billNote, '', 'ลบหมายเหตุแล้วช่องหายไป (ชีตจะไม่รู้ว่าต้องล้าง)');
      eq(payloadOf(app, tx).billNote, '');
      await syncAll(app);
      const r = sheetRow(gas, app, a);
      eq(String(r.row[r.noteCol - 1]), '', 'ชีตไม่ล้างหมายเหตุ');
      // แอปรุ่นก่อน (ไม่รู้จัก billNote) ส่งบิล b ซ้ำด้วยรุ่นใหม่กว่า → ช่องหมายเหตุบนชีตต้องคงเดิม
      const bp = payloadOf(app, b); delete bp.billNote; delete bp.secret; bp.rev = (b.rev || 1) + 1;
      const res = gas.post(bp);
      eq(res.status, 'success', JSON.stringify(res));
      const rb = sheetRow(gas, app, b);
      eq(String(rb.row[rb.noteCol - 1]), 'คงไว้', 'ส่งบิลแบบไม่มีหมายเหตุแล้วหมายเหตุบนชีตหาย');
    } finally { env.dispose(); }
  });

  await R.t('ผู้จัดการ: ช่องหมายเหตุในหน้าต่างบิลถูกล็อก และบันทึกการแก้ไม่ได้ (สิทธิ์แก้บิลเดิม = เจ้าของ)', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'เดิม');
      openEditAs(app, a, 'manager');
      eq(env.document.getElementById('edit-tx-note').disabled, true, 'ผู้จัดการแก้หมายเหตุได้');
      env.document.getElementById('edit-tx-note').value = 'ผู้จัดการแก้';
      await app.saveTransactionEdit(); await settle(30);
      eq(app.state.transactions.find(t => t.id === a.id).billNote, 'เดิม', 'ผู้จัดการแก้หมายเหตุสำเร็จ');
    } finally { env.dispose(); }
  });

  await R.t('บิลบัตร (ล็อกยอด/ช่องทาง): เจ้าของแก้หมายเหตุได้เหมือนชื่อลูกค้า', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'รูดบัตร', 'credit');
      ok(app.isCardLockedBill(a), 'บิลเทสต์ไม่ใช่บิลบัตร (เทสต์ไม่ได้ตรวจของจริง)');
      openEditAs(app, a, 'owner');
      eq([env.document.getElementById('edit-tx-note').disabled, env.document.getElementById('edit-tx-discount').disabled], [false, true]);
      env.document.getElementById('edit-tx-note').value = 'รูดบัตร · ลูกค้าขอใบกำกับ';
      const total0 = a.total;
      await app.saveTransactionEdit(); await settle(30);
      const tx = app.state.transactions.find(t => t.id === a.id);
      eq([tx.billNote, tx.total], ['รูดบัตร · ลูกค้าขอใบกำกับ', total0]);
    } finally { env.dispose(); }
  });

  await R.t('แก้หมายเหตุแล้วบันทึกลงเครื่องไม่สำเร็จ: คืนหมายเหตุเดิม · ไม่มีแถวประวัติแก้บิลค้าง', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'เดิม');
      const logs0 = app.state.editLog.length;
      openEditAs(app, a, 'owner');
      env.document.getElementById('edit-tx-note').value = 'ใหม่';
      const undo = failPutForKeys(['transactions'], 'sync');
      try { await app.saveTransactionEdit(); await settle(30); } finally { undo(); }
      const tx = app.state.transactions.find(t => t.id === a.id);
      eq([tx.billNote, tx.rev, app.state.editLog.length], ['เดิม', a.rev, logs0], 'ไม่คืนค่าเดิม');
    } finally { env.dispose(); }
  });

  // ═══ หมายเหตุปิดกะ ═══
  await R.t('ปิดกะเงินขาด + ไม่กรอกหมายเหตุ = ปิดไม่ได้ (ไม่ถาม PIN ก่อน) · กรอกแล้วปิดได้ · เก็บในประวัติกะ', async () => {
    const cash = { 1000: 1 };
    const { env, app, toasts } = await makeShop({ cash, role: 'manager' });
    try {
      await settle();
      await sale(env, 300);                       // ควรมี 1,300 · นับได้ 1,000 → ขาด 300
      app.openCashCounter('close');
      const tag = env.document.getElementById('closing-note-required').innerText;
      ok(/ต้องกรอก/.test(tag), 'ป้ายบนจอไม่บอกว่าต้องกรอก: ' + tag);
      env.document.getElementById('closing-note').value = '   ';
      app._stepUps = [];
      await closeShift(app);
      ok(app.state.shift.active === true, 'ปิดกะได้ทั้งที่ไม่มีหมายเหตุ');
      eq(app._stepUps.length, 0, 'ถาม PIN ก่อนบอกว่าต้องกรอกหมายเหตุ');
      ok(toasts.some(x => /หมายเหตุปิดกะ/.test(x.m)), 'ไม่บอกผู้ใช้ว่าต้องกรอกหมายเหตุ');
      env.document.getElementById('closing-note').value = 'ทอนเงินผิดให้ลูกค้า 300';
      await closeShift(app);
      ok(app.state.shift.active === false, 'กรอกหมายเหตุแล้วยังปิดกะไม่ได้');
      const h = app.state.shift.history.at(-1);
      eq([h.difference, h.closeNote], [-300, 'ทอนเงินผิดให้ลูกค้า 300']);
    } finally { env.dispose(); }
  });

  await R.t('ปิดกะตรงพอดี: ไม่กรอกหมายเหตุก็ปิดได้ · ไม่มีช่อง closeNote ในประวัติกะ/สรุปชีต', async () => {
    const cash = { 1000: 1, 100: 3 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const s = await sale(env, 300);
      app.openCashCounter('close');
      ok(/ไม่บังคับ/.test(env.document.getElementById('closing-note-required').innerText), 'ตรงพอดีแต่ป้ายบอกว่าบังคับ');
      env.document.getElementById('closing-note').value = '';
      await closeShift(app);
      ok(app.state.shift.active === false, 'ตรงพอดีแต่ปิดกะไม่ได้');
      const h = app.state.shift.history.at(-1);
      eq(h.difference, 0);
      ok(!('closeNote' in h), 'กะไม่มีหมายเหตุแต่มีช่อง closeNote');
      const day = app.getBusinessISODate(app.shiftAnchorTime(h));
      ok(!('closeNote' in app.buildShiftCashSummary('day', day).shifts[0]), 'สรุปส่งช่อง closeNote ทั้งที่ไม่มีหมายเหตุ');
      ok(!/หมายเหตุปิดกะ/.test(app.buildShiftReportMessage(h)), 'Telegram มีบรรทัดหมายเหตุปิดกะทั้งที่ไม่มี');
      void s;
    } finally { env.dispose(); }
  });

  await R.t('หาช่องหมายเหตุปิดกะไม่เจอ = ไม่บังคับ (ร้านต้องปิดกะได้เสมอ)', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300);
      const orig = env.document.getElementById.bind(env.document);
      env.document.getElementById = (id) => (id === 'closing-note' ? null : orig(id));
      await closeShift(app);
      ok(app.state.shift.active === false, 'ช่องหมายเหตุหาย แล้วปิดกะไม่ได้');
      ok(!('closeNote' in app.state.shift.history.at(-1)));
    } finally { env.dispose(); }
  });

  await R.t('ด่านซ้ำในคิวบันทึก: จอคิดว่าตรงพอดี (ตัวเลขเก่า) แต่ยอดจริงขาด → ไม่ปิดกะ ไม่ปิดหน้าต่าง', async () => {
    const cash = { 1000: 1 };
    const { env, app, toasts } = await makeShop({ cash });
    try {
      await settle();
      app.openCashCounter('close');               // ควรมี 1,000 = นับได้ 1,000 (จำตัวเลขชุดนี้ไว้บนจอ)
      env.document.getElementById('closing-note').value = '';
      // ขายเงินสดหลังเปิดหน้านับเงิน — ตัวเลขบนจอยังเป็นชุดเก่า (ไม่คิดใหม่ทุกตัวอักษร)
      readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      await app.processCheckout(); await settle(30);
      let closed = 0; app.closeModal = (id) => { if (id === 'modal-cash-counter') closed++; };
      await closeShift(app);
      ok(app.state.shift.active === true, 'ปิดกะด้วยเงินขาด 300 โดยไม่มีหมายเหตุ');
      eq(closed, 0, 'ปิดหน้าต่างนับเงินทิ้ง (ผู้ใช้ต้องกรอกต่อได้)');
      ok(toasts.some(x => /หมายเหตุปิดกะ/.test(x.m)), 'ไม่บอกว่าต้องกรอกหมายเหตุ');
    } finally { env.dispose(); }
  });

  await R.t('หมายเหตุปิดกะ: Telegram · ตารางประวัติกะ · ตารางนับเงินบนชีต (แถวใต้กะ · ข้อความขึ้นต้น = ไม่กลายเป็นสูตร)', async () => {
    const cash = { 1000: 1 };
    const { env, app, gas } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300, 'บิลนี้ลูกค้าจ่ายเกิน');
      env.document.getElementById('closing-note').value = '=ลืมลงค่าน้ำแข็ง 300 <b>';
      await closeShift(app);
      const h = app.state.shift.history.at(-1);
      eq(h.closeNote, '=ลืมลงค่าน้ำแข็ง 300 <b>');
      const msg = app.buildShiftReportMessage(h);
      ok(msg.includes('หมายเหตุปิดกะ:</b> =ลืมลงค่าน้ำแข็ง 300 &lt;b&gt;'), 'Telegram ไม่มีหมายเหตุปิดกะ (หรือไม่ escape): ' + msg.split('\n').filter(l => /หมายเหตุ/.test(l)).join(' | '));
      ok(/หมายเหตุบิล \(1 ใบ\)/.test(msg) && msg.includes('บิลนี้ลูกค้าจ่ายเกิน'), 'Telegram ไม่มีหมายเหตุบิลของกะ');
      // ตารางประวัติกะในแอป
      app.state.selectedReportType = 'daily';
      env.document.getElementById('report-date-input').value = app.getBusinessISODate(app.shiftAnchorTime(h));
      env.document.getElementById('report-staff-filter').value = 'all';
      Object.getPrototypeOf(app).filterReports.call(app);
      const shifts = env.document.getElementById('report-shifts-body').innerHTML;
      ok(shifts.includes('=ลืมลงค่าน้ำแข็ง 300 &lt;b&gt;'), 'ตารางประวัติกะไม่แสดงหมายเหตุ (หรือไม่ escape)');
      // ชีตสรุปรายวัน
      const day = app.getBusinessISODate(app.shiftAnchorTime(h));
      eq(app.buildShiftCashSummary('day', day).shifts[0].closeNote, '=ลืมลงค่าน้ำแข็ง 300 <b>');
      await settle(120); await app.flushCloudOutbox(); await settle(150);
      const tab = gas.sheet('สรุป-' + day);
      const cells = tab ? [].concat(...tab._grid).map(String) : [];
      ok(cells.some(x => x === '📝 หมายเหตุปิดกะ: =ลืมลงค่าน้ำแข็ง 300 <b>'), 'แท็บสรุปไม่มีแถวหมายเหตุปิดกะ: ' + gas.sheetNames().join(','));
      ok(!cells.some(x => x === '#ERROR!'), 'มีช่อง #ERROR! บนแท็บสรุป');
      ok(cells.some(x => /^รวม · เงินตั้งต้น/.test(x)), 'แถวรวมของตารางนับเงินหาย');
    } finally { env.dispose(); }
  });

  await R.t('Telegram: หมายเหตุบิลยาวและเยอะ + ค่าใช้จ่ายเยอะ → ข้อความไม่เกินเพดาน · ตัวเลขเงินครบ · หมายเหตุปิดกะอยู่ครบ', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      for (let i = 0; i < 14; i++) await sale(env, 100, `บิลที่ ${i + 1} ` + '😀ยาวมาก'.repeat(40));
      const sh = app.state.shift;
      for (let i = 0; i < 20; i++) sh.expenses.push({ id: 'e' + i, type: 'other', note: 'ค่าใช้จ่ายยาว ' + 'ก'.repeat(70), amount: 1, date: Date.now(), by: 'ผู้จัดการคนที่มีชื่อยาวมาก ๆ', paidFrom: 'other' });
      await app.saveStateOrThrow('เตรียมเทสต์');
      env.document.getElementById('closing-note').value = 'ข'.repeat(300);
      await closeShift(app);
      const h = app.state.shift.history.at(-1);
      const msg = app.buildShiftReportMessage(h);
      ok(msg.length <= 4000, 'ข้อความยาวเกินเพดาน: ' + msg.length);
      ok(msg.includes('ข'.repeat(200)), 'หมายเหตุปิดกะถูกตัดออกจากข้อความ');
      ok(/หมายเหตุบิล \(14 ใบ\)/.test(msg), 'ไม่บอกจำนวนบิลที่มีหมายเหตุ');
      ok(/ส่วนต่าง \(ขาด\/เกิน\)/.test(msg) && /ยอดขายรวม/.test(msg), 'ตัวเลขเงินหายจากข้อความ');
      ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(msg), 'มีอีโมจิขาดครึ่งตัว (Telegram จะปฏิเสธทั้งข้อความ)');
    } finally { env.dispose(); }
  });

  await R.t('ไฟล์สำรอง: ส่งออกแล้วกู้กลับ หมายเหตุบิลและหมายเหตุปิดกะอยู่ครบ', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const a = await sale(env, 300, 'หมายเหตุบิลในไฟล์สำรอง');
      env.document.getElementById('closing-note').value = 'หมายเหตุกะในไฟล์สำรอง';
      await closeShift(app);
      const backup = JSON.parse(JSON.stringify(app.buildBackupPayload()));
      eq(backup.transactions.find(t => t.id === a.id).billNote, 'หมายเหตุบิลในไฟล์สำรอง');
      eq(backup.shift.history.at(-1).closeNote, 'หมายเหตุกะในไฟล์สำรอง');
      ok(app.isValidBackupObject(backup), 'ไฟล์สำรองที่มีหมายเหตุไม่ผ่านการตรวจ');
    } finally { env.dispose(); }
  });

  // ═══ เหตุผลที่ยกเลิกบิล (บังคับทุกครั้ง) ═══
  // ช่อง #void-note ใน harness คืนค่าเริ่มต้นเมื่อถูกล้าง (เทสต์เดิม) — ข้อในชุดนี้ตั้ง _noDefault ให้ว่างจริง
  const voidNoteEl = (env) => { const el = env.document.getElementById('void-note'); el._noDefault = true; return el; };
  async function tryVoid(env, tx, outcome, reason) {
    env.app.openTransactionEdit(tx.id);
    env.document.getElementById('void-money-outcome').value = outcome || 'none';
    env.document.getElementById('edit-tx-id').value = tx.id;
    if (reason !== undefined) voidNoteEl(env).value = reason;
    env.app._confirmP = null;
    await env.app.voidTransaction(); if (env.app._confirmP) await env.app._confirmP; await settle(30);
    return !env.app.state.transactions.some(t => t.id === tx.id);
  }

  await R.t('ยกเลิกบิลไม่กรอกเหตุผล = ยกเลิกไม่ได้ (ไม่ถาม PIN ก่อน) · กรอกแล้วยกเลิกได้ · เก็บในประวัติการยกเลิก', async () => {
    const { env, app, toasts } = await makeShop({ role: 'manager' });
    try {
      await settle();
      const a = await sale(env, 300);
      app._stepUps = [];
      eq(await tryVoid(env, a, 'none', '   '), false, 'ยกเลิกได้ทั้งที่ไม่มีเหตุผล');
      eq(app._stepUps.length, 0, 'ถาม PIN ก่อนบอกว่าต้องกรอกเหตุผล');
      ok(toasts.some(x => /เหตุผลที่ยกเลิก/.test(x.m)), 'ไม่บอกผู้ใช้ว่าต้องกรอกเหตุผล');
      eq(await tryVoid(env, a, 'none', 'ออกบิลซ้ำ\nกดสองครั้ง'), true, 'กรอกเหตุผลแล้วยังยกเลิกไม่ได้');
      const v = app.state.voidLog.at(-1);
      eq([v.billId, v.note, v.by], [a.id, 'ออกบิลซ้ำ กดสองครั้ง', 'บี']);
      ok(!('reason' in v), 'เหตุผลที่คนพิมพ์ไปปนกับช่อง reason ของระบบ');
      ok(/เหตุผล: ออกบิลซ้ำ กดสองครั้ง/.test(app._lastConfirmMsg || ''), 'กล่องยืนยันไม่บอกเหตุผล: ' + app._lastConfirmMsg);
    } finally { env.dispose(); }
  });

  await R.t('เปิดบิลใบใหม่ = ช่องเหตุผลว่าง (เหตุผลของบิลใบก่อนไม่ติดไป)', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300), b = await sale(env, 300);
      app.openTransactionEdit(a.id);
      voidNoteEl(env).value = 'เหตุผลของบิล A';
      app.openTransactionEdit(b.id);
      eq(voidNoteEl(env).value, '', 'เหตุผลค้างจากบิลใบก่อน');
    } finally { env.dispose(); }
  });

  await R.t('หาช่องเหตุผลไม่เจอ = ไม่บังคับ (หน้าจอพังต้องไม่ทำให้ยกเลิกบิลไม่ได้)', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300);
      const orig = env.document.getElementById.bind(env.document);
      env.document.getElementById = (id) => (id === 'void-note' ? null : orig(id));
      eq(await tryVoid(env, a, 'none'), true, 'ช่องเหตุผลหาย แล้วยกเลิกบิลไม่ได้');
      ok(!('note' in app.state.voidLog.at(-1)));
    } finally { env.dispose(); }
  });

  await R.t('เหตุผลที่ยกเลิก: Telegram แจ้งยกเลิก · ตาราง "บิลที่ถูกยกเลิก" · รายงานปิดกะ (escape ครบ)', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const a = await sale(env, 300);
      eq(await tryVoid(env, a, 'refunded', 'ลูกค้าเปลี่ยนใจ <i>'), true);
      const v = app.state.voidLog.at(-1);
      const alert = app.buildVoidAlertMessage(v);
      ok(alert.includes('📝 เหตุผล: ลูกค้าเปลี่ยนใจ &lt;i&gt;'), 'Telegram แจ้งยกเลิกไม่มีเหตุผล (หรือไม่ escape): ' + alert);
      app.state.selectedReportType = 'daily';
      env.document.getElementById('report-date-input').value = app.getBusinessISODate(v.date);
      env.document.getElementById('report-staff-filter').value = 'all';
      Object.getPrototypeOf(app).filterReports.call(app);
      const html = env.document.getElementById('report-voids-body').innerHTML;
      ok(html.includes('ลูกค้าเปลี่ยนใจ &lt;i&gt;') && !html.includes('<i>'), 'ตารางบิลที่ถูกยกเลิกไม่แสดงเหตุผล (หรือไม่ escape)');
      env.document.getElementById('closing-note').value = 'ยกเลิกบิลคืนเงิน';
      await closeShift(app);
      const msg = app.buildShiftReportMessage(app.state.shift.history.at(-1));
      ok(/บิลที่ถูกยกเลิกในกะ: 1 ใบ/.test(msg) && msg.includes('ลูกค้าเปลี่ยนใจ &lt;i&gt;'), 'รายงานปิดกะไม่แจกแจงเหตุผลที่ยกเลิก: ' + msg.split('\n').filter(l => /ยกเลิก/.test(l)).join(' | '));
    } finally { env.dispose(); }
  });

  await R.t('ยกเลิกตามสถานะบนชีต (ระบบยกเลิกเอง): ไม่ต้องมีคนกรอก · แสดงเหตุผลของระบบแทน', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300);
      await app.withMutation('เทสต์', () => app._voidBillLocked(a, { reason: 'ยกเลิกตามสถานะบนชีต (บิลถูกยกเลิกบนชีตไปแล้ว)' }));
      const v = app.state.voidLog.at(-1);
      ok(!('note' in v), 'ระบบยกเลิกเองแต่มีช่อง note');
      ok(app.buildVoidAlertMessage(v).includes('📝 เหตุผล: ยกเลิกตามสถานะบนชีต'), 'ไม่แสดงเหตุผลของระบบ');
    } finally { env.dispose(); }
  });

  await R.t('รายงานปิดกะ: ยกเลิกบิล 25 ใบ เหตุผลยาว + ค่าใช้จ่าย/หมายเหตุเยอะ → ไม่เกินเพดาน · จำนวน/ยอดรวมบิลที่ยกเลิกอยู่ครบ', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const sh = app.state.shift;
      for (let i = 0; i < 14; i++) await sale(env, 100, 'หมายเหตุ ' + 'ค'.repeat(150));
      for (let i = 0; i < 25; i++) app.state.voidLog.push({ billId: 'TX-1790000000000-V' + String(i).padStart(7, '0'), date: Date.now(), by: 'ผู้จัดการชื่อยาวมาก',
        amount: 100, moneyOutcome: 'none', cashEffect: 0, note: '😀 เหตุผลยาว ' + 'ง'.repeat(190) });
      for (let i = 0; i < 20; i++) sh.expenses.push({ id: 'e' + i, type: 'other', note: 'ค่าใช้จ่าย ' + 'ก'.repeat(70), amount: 1, date: Date.now(), by: 'ผู้จัดการ', paidFrom: 'other' });
      await app.saveStateOrThrow('เตรียมเทสต์');
      env.document.getElementById('closing-note').value = 'ข'.repeat(200);
      await closeShift(app);
      const msg = app.buildShiftReportMessage(app.state.shift.history.at(-1));
      ok(msg.length <= 4000, 'ข้อความยาวเกินเพดาน: ' + msg.length);
      ok(/บิลที่ถูกยกเลิกในกะ: 25 ใบ \(฿2,500\)/.test(msg), 'จำนวน/ยอดรวมบิลที่ยกเลิกหาย');
      ok(msg.includes('ข'.repeat(200)), 'หมายเหตุปิดกะหาย');
      ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(msg), 'มีอีโมจิขาดครึ่งตัว');
    } finally { env.dispose(); }
  });

  await R.t('รายงานปิดกะ: ส่วนหัวยาวมาก → ลดรายชื่อบิลที่ยกเลิกลงจนไม่เกินเพดาน (ยอดรวมยังอยู่)', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      for (let i = 0; i < 10; i++) app.state.voidLog.push({ billId: 'TX-1790000000000-W' + String(i).padStart(7, '0'), date: Date.now(), by: 'ผู้จัดการชื่อยาวมากคนที่ ' + i,
        amount: 100, moneyOutcome: 'none', cashEffect: 0, note: 'เหตุผลยาว ' + 'ง'.repeat(190) });
      await app.saveStateOrThrow('เตรียมเทสต์');
      env.document.getElementById('closing-note').value = 'ทดสอบ';
      await closeShift(app);
      app.backupHealthWarning = () => 'ว'.repeat(1900);   // คำเตือนไฟล์สำรองยาว = ส่วนหัวของข้อความใหญ่ขึ้น
      const msg = app.buildShiftReportMessage(app.state.shift.history.at(-1));
      ok(msg.length <= 4000, 'ไม่ลดรายชื่อบิลที่ยกเลิก ข้อความยาวเกินเพดาน: ' + msg.length);
      ok(/บิลที่ถูกยกเลิกในกะ: 10 ใบ \(฿1,000\)/.test(msg), 'จำนวน/ยอดรวมบิลที่ยกเลิกหาย');
      ok(/…และอีก \d+ ใบ/.test(msg), 'ไม่บอกว่ามีบิลที่ยกเลิกเหลืออีกกี่ใบ');
    } finally { env.dispose(); }
  });

  // ═══ Apps Script ═══
  await R.t('ชีต: บิลไม่มีหมายเหตุทั้งเดือน = แท็บไม่มีคอลัมน์หมายเหตุ · 13 คอลัมน์หลักไม่ขยับ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300);
      await syncAll(app);
      const r = sheetRow(gas, app, a);
      eq(r.noteCol, 0, 'สร้างคอลัมน์หมายเหตุทั้งที่ไม่มีบิลไหนมีหมายเหตุ');
      eq(r.headers.slice(0, 13), gas.ctx.BILL_HEADERS.slice(), 'หัวตาราง 13 ช่องเปลี่ยน');
      const b = await sale(env, 300, 'ใบแรกที่มีหมายเหตุ');
      await syncAll(app);
      const r2 = sheetRow(gas, app, b);
      eq(r2.headers.slice(0, 13), gas.ctx.BILL_HEADERS.slice(), 'หัวตาราง 13 ช่องขยับหลังเพิ่มคอลัมน์หมายเหตุ');
      ok(r2.noteCol > gas.ctx.billRevColumn_(r2.tab), 'คอลัมน์หมายเหตุไม่ได้อยู่ท้ายตาราง');
      eq(gas.ctx.billSheetSchema_(r2.tab), 'vat', 'แท็บที่มีคอลัมน์หมายเหตุถูกมองว่าโครงสร้างผิด');
      const list = gas.post({ action: 'list_bills', monthKey: app.getBusinessMonthKey(b.date), ownerKey: gas.setupOwnerKey() });
      eq(list.status, 'success', JSON.stringify(list));
      eq(list.details.bills.map(x => [x.id, x.total]), [[a.id, 300], [b.id, 300]], 'หน้าตรวจความตรงกันอ่านแท็บผิด');
    } finally { env.dispose(); }
  });

  await R.t('ชีต: หมายเหตุไม่อยู่ในลายนิ้วมือบิล — บิลเก่าที่ขึ้นชีตแล้ว ส่งซ้ำรุ่นเดิมพร้อมหมายเหตุ ไม่ถูกปฏิเสธ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300);
      await syncAll(app);
      const p = payloadOf(app, a); delete p.secret;
      const v = gas.ctx.validateBillPayload_(p);
      eq(gas.ctx.canonicalBillHash_(Object.assign({}, p, { billNote: 'อะไรก็ได้' }), v), gas.ctx.canonicalBillHash_(p, v), 'หมายเหตุเปลี่ยนลายนิ้วมือบิล');
      const res = gas.post(Object.assign({}, p, { billNote: 'เติมทีหลัง' }));
      eq(res.status, 'success', 'ส่งซ้ำรุ่นเดิมพร้อมหมายเหตุถูกปฏิเสธ: ' + JSON.stringify(res));
    } finally { env.dispose(); }
  });

  await R.t('ชีต: หมายเหตุขึ้นต้นด้วย = + - @ หรือเป็นตัวเลข เก็บเป็นข้อความตามที่พิมพ์', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const notes = ['=SUM(A1:A9)', '+66812345678', '-ลดให้ 50', '@หมอแอน', '0812345678'];
      const bills = [];
      for (const n of notes) bills.push(await sale(env, 300, n));
      await syncAll(app);
      bills.forEach((b, i) => {
        const r = sheetRow(gas, app, b);
        eq(String(r.row[r.noteCol - 1]), notes[i], 'หมายเหตุบนชีตเพี้ยน');
      });
    } finally { env.dispose(); }
  });

  await R.t('ชีต: หัว "หมายเหตุ (POS)" ซ้ำ → บิลที่มีหมายเหตุหยุด (SCHEMA_MISMATCH ไม่เงียบ) · บิลไม่มีหมายเหตุผ่านตามปกติ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300, 'ใบแรก');
      await syncAll(app);
      const r = sheetRow(gas, app, a);
      r.tab.getRange(1, r.noteCol + 1).setValue(NOTE_HEADER);   // มีคนคัดลอกคอลัมน์หมายเหตุ
      const b = await sale(env, 300, 'ใบสอง');
      const c = await sale(env, 300);
      await syncAll(app);
      const st = id => app.state.transactions.find(t => t.id === id);
      eq(st(c.id).syncStatus, 'synced', 'บิลไม่มีหมายเหตุติดด่านหัวคอลัมน์หมายเหตุ');
      ok(st(b.id).syncStatus !== 'synced', 'บิลที่มีหมายเหตุถูกเขียนทั้งที่หัวคอลัมน์ซ้ำ');
      const bp = payloadOf(app, b); delete bp.secret;
      const res = gas.post(bp);
      eq(res.code, 'SCHEMA_MISMATCH', JSON.stringify(res));
    } finally { env.dispose(); }
  });

  await R.t('ชีต: คอลัมน์ "หมายเหตุ" ที่เจ้าของเติมเอง (ไม่มี POS) ไม่ถูกแตะ', async () => {
    const { env, app, gas } = await makeShop({});
    try {
      await settle();
      const a = await sale(env, 300);
      await syncAll(app);
      const r = sheetRow(gas, app, a);
      const manualCol = r.tab.getLastColumn() + 1;
      r.tab.getRange(1, manualCol).setValue('หมายเหตุ');
      const rowIdx = r.tab._grid.findIndex(x => String(x[0]) === a.id) + 1;
      r.tab.getRange(rowIdx, manualCol).setValue('เจ้าของพิมพ์เอง');
      openEditAs(app, a, 'owner');
      env.document.getElementById('edit-tx-note').value = 'จากแอป';
      await app.saveTransactionEdit(); await settle(30);
      await syncAll(app);
      const r2 = sheetRow(gas, app, a);
      eq(String(r2.row[manualCol - 1]), 'เจ้าของพิมพ์เอง', 'เขียนทับคอลัมน์ที่เจ้าของพิมพ์เอง');
      ok(r2.noteCol > manualCol, 'ไม่ได้สร้างคอลัมน์ของระบบแยก');
      eq(String(r2.row[r2.noteCol - 1]), 'จากแอป');
    } finally { env.dispose(); }
  });

  await R.t('Apps Script รุ่นก่อน + แอปใหม่: ไม่พัง (บิล/สรุปขึ้นชีต)', async () => {
    // Apps Script ก่อนเพิ่มหมายเหตุ (สำเนาใน backup\ — ไม่ขึ้น repo) · ไม่มีไฟล์ = ข้ามข้อนี้
    const oldGas = process.env.NOTES_OLD_GAS || path.join(__dirname, '..', 'backup', 'ก่อนแก้_claude_20261014d_หมายเหตุ', 'google_apps_script.js');
    if (!fs.existsSync(oldGas)) { console.log('  (ข้าม: ไม่มี ' + oldGas + ')'); return; }
    const out = execFileSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { NOTES_OLD_GAS_CHILD: '1', POS_GAS_SRC: oldGas }), encoding: 'utf8', timeout: 240000
    });
    ok(/ผ่าน 1 · ไม่ผ่าน 0/.test(out), out.split('\n').filter(l => /PASS|FAIL|===|✅|❌/.test(l)).join(' | '));
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
