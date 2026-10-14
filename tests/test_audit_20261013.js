// ─────────────────────────────────────────────────────────────────────────────
//  ตรวจ 13 ต.ค. 2569 (Claude) — แก้ 22 ข้อ · ทุกหัวข้อเดินผ่านทางจริงของแอป (IndexedDB จริง + Apps Script ในชีตจำลอง)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC / POS_GAS_SRC ชี้ไปโค้ดก่อนแก้ → ต้องตก (ดู tests/README.md)
//   [1] Enter ในช่องนับเงิน/ค่าใช้จ่าย   [2] กู้ไฟล์แล้วบิลที่ยกเลิกค้างส่งกลับมา   [3] รอบซิงก์อ่านบิลที่ยังบันทึกไม่เสร็จ
//   [4] ปิดกะแล้วออกจากระบบ + ปุ่มเปลี่ยนผู้ใช้   [5] นาฬิกาเครื่อง   [6] คืนเงินบางส่วน   [7] Telegram ส่งซ้ำ
//   [8] สรุปค้างหลังงานลบ   [9] สรุปวันเก่ากว่า 62 วัน   [10] PIN หลังย้อนกู้   [13] รหัสลูกค้า   [14] ไฟล์นำเข้า
//   [15] ทะเบียนกู้บิล   [16] Telegram ข้ามการกู้   [17] คืนค่าคิวตอนยกเลิกล้ม   [18] บิลจากชีต+ค่าธรรมเนียม
//   [19] หน้านับเงินไม่คำนวณทุกตัวอักษร   [20] ชื่อขึ้นต้น '   [21] ข้อความบนจอ   [22] ชีต: ชื่อร้าน/จำนวนสินค้า
//   ([11] ตัวเลขถูกตัดบนจอ · [1] ในเบราว์เซอร์จริง → tests/e2e_audit_20261013.js · [12] deploy → หัวข้อท้ายไฟล์นี้)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const { makeRunner, eq, ok, failPutForKeys, createEnv } = require('./harness_db.js');
const { makeShop, seed, quiet, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const { createGasEnv } = require('./gas_env.js');
const R = makeRunner('--- ตรวจ 13 ต.ค. 2569: แก้ 22 ข้อ ---');
const t = R.t;
const clone = x => JSON.parse(JSON.stringify(x));
const ROOT = path.resolve(__dirname, '..');
const APP_SRC = process.env.POS_APP_SRC || path.join(ROOT, 'app.js');
const HTML_SRC = process.env.POS_HTML_SRC || path.join(ROOT, 'index.html');
const CSS_SRC = process.env.POS_CSS_SRC || path.join(ROOT, 'style_v2.css');
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 120000) / 1000) + ' วินาที')), ms || 120000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const monthRows = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => gas.sheet(n)._grid.slice(1));
const proto = (app, k) => Object.getPrototypeOf(app)[k].bind(app);
async function checkout(env, items, pay, received) {
  readyCheckout(env, items, pay, received);
  await env.app.processCheckout();
  await settle(30);
  return env.app.state.transactions[env.app.state.transactions.length - 1];
}
async function editBill(env, txId, discount) {
  env.app.openTransactionEdit(txId);
  env.document.getElementById('edit-tx-discount').value = String(discount);
  await env.app.saveTransactionEdit();
  await settle(20);
}

(async () => {

// ═══ [1] Enter ในช่องนับธนบัตร = ไปช่องถัดไป ไม่ใช่ยืนยันยอด · ค่าใช้จ่ายจ่ายรายวันต้องเลือกพนักงาน ═══
await section('[1]', async () => {
  const html = fs.readFileSync(HTML_SRC, 'utf8');
  const form = (html.match(/<form id="form-cash-counter"[^>]*>/) || [''])[0];
  await t('[1.1] ฟอร์มนับเงินไม่ผูก confirmCashCount กับการส่งฟอร์ม (กด return ไม่ยืนยันยอด)', () => ok(form && !/confirmCashCount/.test(form), form));
  const btn = (html.match(/<button[^>]*id="btn-confirm-cash-counter"[^>]*>/) || [''])[0];
  await t('[1.2] ปุ่มยืนยันนับเงินเป็น type="button" + onclick', () => ok(/type="button"/.test(btn) && /onclick="app\.confirmCashCount\(\)"/.test(btn), btn));
  const qty = html.match(/class="form-input cash-qty-input"[^>]*>/g) || [];
  await t('[1.3] ช่องนับธนบัตรทั้ง 9 ช่องจับปุ่ม Enter', () => ok(qty.length === 9 && qty.every(x => /onkeydown="app\.onCashQtyKeydown\(event\)"/.test(x)), String(qty.length)));

  const { env, app } = await makeShop();
  await settle();
  let focused = null, prevented = false, confirmed = 0;
  const inputs = [0, 1, 2].map(i => ({ i, focus() { focused = i; }, select() {}, blur() { focused = 'blur'; } }));
  env.document.querySelectorAll = (sel) => (/cash-qty-input/.test(sel) ? inputs : []);
  app.confirmCashCount = async () => { confirmed++; };
  const fn = Object.getPrototypeOf(app).onCashQtyKeydown;
  if (typeof fn === 'function') {
    fn.call(app, { key: 'Enter', target: inputs[0], preventDefault() { prevented = true; } });
    await t('[1.4] Enter ช่องแรก → โฟกัสช่องถัดไป · ไม่ยืนยันยอด', () => ok(prevented && focused === 1 && confirmed === 0, JSON.stringify({ prevented, focused, confirmed })));
    fn.call(app, { key: 'Enter', target: inputs[2], preventDefault() {} });
    await t('[1.5] Enter ช่องสุดท้าย → ปิดคีย์บอร์ดเฉย ๆ', () => ok(focused === 'blur' && confirmed === 0));
  } else {
    await t('[1.4] มีตัวจับ Enter ของช่องนับธนบัตร', () => ok(false, 'ไม่มี onCashQtyKeydown'));
  }
  // ค่าใช้จ่ายจ่ายรายวัน: ไม่เลือกพนักงาน = ไม่บันทึก (เดิมลงชื่อพนักงานคนแรก/"ไม่ระบุ")
  loginAs(app, 'manager');
  const d = env.document;
  d.getElementById('expense-type').value = 'staff';
  d.getElementById('expense-amount').value = '200';
  d.getElementById('expense-source').value = 'drawer';
  d.getElementById('expense-staff-id').value = '';
  const n0 = app.state.shift.expenses.length;
  await app.addExpense({ preventDefault() {} }); await settle(20);
  await t('[1.6] จ่ายเงินรายวันโดยไม่เลือกพนักงาน → ไม่บันทึก', () => eq(app.state.shift.expenses.length, n0));
  d.getElementById('expense-staff-id').value = 'st-1';
  await app.addExpense({ preventDefault() {} }); await settle(20);
  await t('[1.7] เลือกพนักงานแล้ว → บันทึกในชื่อคนนั้น', () => ok(app.state.shift.expenses.length === n0 + 1 && /เอ/.test(app.state.shift.expenses[n0].note)));
  app.state.shift.expenses = [];
  proto(app, 'renderDashboard')();
  await t('[1.8] ตัวเลือกแรกของพนักงานคือ "— เลือกพนักงาน —"', () => ok(/^<option value="">— เลือกพนักงาน —<\/option>/.test(d.getElementById('expense-staff-id').innerHTML), d.getElementById('expense-staff-id').innerHTML.slice(0, 120)));
  env.dispose();
});

// ═══ [2] กู้ไฟล์สำรองแล้ว บิลที่ยกเลิกในเครื่องหลังไฟล์ (คำสั่งลบยังไม่ถึงชีต) ต้องไม่กลับมาเงียบ ๆ ═══
await section('[2]', async () => {
  const { env, app, gas, toasts } = await makeShop();
  await settle();
  const X = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
  await app.syncPendingTransactions(true); await settle(30);
  const file = clone(app.buildBackupPayload());
  file.createdAt = new Date(Date.now() - 1000).toISOString();
  await new Promise(r => setTimeout(r, 5));
  // เน็ตหลุด → ยกเลิกบิล X แบบคืนเงินแล้ว (คำสั่งลบค้างในคิว)
  env.ctx.navigator.onLine = false;
  env.document.getElementById('edit-tx-id').value = X.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(40);
  await t('[2.0] (ก่อนกู้) บิลถูกยกเลิก · คำสั่งลบค้างในคิว', () => ok(!app.state.transactions.some(t => t.id === X.id) &&
    app.state.cloudOutbox.some(j => j.needVoidDelete && j.voidDelete && j.voidDelete.id === X.id)));
  await app.applyBackupData(clone(file), { acceptUnsynced: true }); await settle(30);
  const back = app.state.transactions.find(t => t.id === X.id);
  await t('[2.1] บิลที่ยกเลิกหลังไฟล์ → เป็น "บิลรอตรวจ" ไม่ใช่รอส่งขึ้นชีต', () => ok(back && back.syncStatus === 'conflict' &&
    back.syncIssue && back.syncIssue.code === 'ALREADY_VOIDED' && back.syncIssue.localVoidPending === true, JSON.stringify(back && { s: back.syncStatus, i: back.syncIssue })));
  await t('[2.2] แจ้งเจ้าของทันทีหลังกู้', () => ok(toasts.some(x => /ถูกยกเลิกในเครื่องนี้หลังไฟล์สำรอง/.test(x.m))));
  env.ctx.navigator.onLine = true;
  await app.syncPendingTransactions(true); await settle(30);
  await t('[2.3] เน็ตกลับมา: ไม่ส่งบิลนี้ขึ้นชีตเอง (ยังรอเจ้าของเลือก)', () => eq(back.syncStatus, 'conflict'));
  // เจ้าของเลือก "ยกเลิกในเครื่องตามชีต" → ใช้ผลเงินที่บันทึกไว้ตอนยกเลิก (คืนเงินแล้ว) + ส่งคำสั่งลบใหม่
  await app.resolveBillConflict(X.id, 'void-local'); await settle(40);
  await app.flushCloudOutbox(); await settle(40);
  await t('[2.4] เลือกยกเลิกตามเดิม → บิลหายจากเครื่อง · แถวบนชีตถูกลบ · ประวัติยกเลิกบันทึกว่าคืนเงินแล้ว', () => ok(
    !app.state.transactions.some(t => t.id === X.id) && !monthRows(gas).some(r => r[0] === X.id) &&
    app.state.voidLog.some(v => v.billId === X.id && v.moneyOutcome === 'refunded'), JSON.stringify(app.state.voidLog.slice(-1))));
  env.dispose();
});

// ═══ [3] รอบซิงก์ต้องไม่ส่งค่าที่ยังบันทึกไม่เสร็จ (บันทึกล้มเหลว = ชีตต้องไม่มีของนั้น) ═══
await section('[3]', async () => {
  {
    const { env, app, gas } = await makeShop();
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
    await app.syncPendingTransactions(true); await settle(40);
    app.openTransactionEdit(tx.id);
    env.document.getElementById('edit-tx-discount').value = '200';
    const restore = failPutForKeys(['transactions'], 'async');
    const pEdit = app.saveTransactionEdit();
    const pSync = app.syncPendingTransactions(true);
    await pEdit; await pSync; await settle(80); restore();
    const row = monthRows(gas).find(r => r[0] === tx.id);
    await t('[3.1] แก้บิลแล้วบันทึกล้มเหลวระหว่างรอบซิงก์ → ชีตยังเป็นยอดเดิม 500', () => ok(tx.total === 500 && row && row[11] === 500, JSON.stringify({ local: tx.total, sheet: row && row[11] })));
    env.dispose();
  }
  {
    const { env, app, gas } = await makeShop();
    await settle();
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 700 }], 'cash', 700);
    const restore = failPutForKeys(['transactions'], 'async');
    const pCo = app.processCheckout();
    let pSync = null;
    for (let i = 0; i < 200 && !pSync; i++) {
      await new Promise(r => setImmediate(r));
      if (app.state.transactions.some(t => t.total === 700)) pSync = app.syncPendingTransactions(true);
    }
    await pCo; if (pSync) await pSync; await settle(80); restore();
    await t('[3.2] ออกบิลแล้วบันทึกล้มเหลวระหว่างรอบซิงก์ → ชีตไม่มีบิลผี', () => ok(!!pSync && app.state.transactions.length === 0 &&
      !monthRows(gas).some(r => r[11] === 700), JSON.stringify(monthRows(gas).map(r => [r[0], r[11]]))));
    env.dispose();
  }
});

// ═══ [4] ผู้จัดการปิดกะ → ออกจากระบบ · หน้าเปิดกะมีปุ่มเปลี่ยนผู้ใช้/ดูรายงาน ═══
await section('[4]', async () => {
  const { env, app } = await makeShop({ role: 'manager', cash: { 1000: 1 } });
  await settle();
  app.saveSession(); await settle(10);
  let loggedOut = 0; const realLogout = proto(app, 'logout');
  app.logout = (...a) => { loggedOut++; return realLogout(...a); };
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(40);
  await t('[4.1] ผู้จัดการปิดกะ → ออกจากระบบทันที', () => ok(!app.state.shift.active && loggedOut === 1 && app.currentRole === null));
  const rec = await env.db.state.get('session');
  await t('[4.2] เซสชันที่จำไว้ถูกลบ (เปิดแอปตอนเช้าต้องใส่ PIN)', () => ok(!rec || !rec.value, JSON.stringify(rec)));
  loginAs(app, 'manager');
  app.openCashCounter('open');
  const sw = env.document.getElementById('btn-switch-user-cash-counter');
  const cancel = env.document.getElementById('btn-cancel-cash-counter');
  await t('[4.3] หน้าเปิดกะ: มีปุ่มเปลี่ยนผู้ใช้ (ทุกบทบาท)', () => eq(sw.style.display, 'block'));
  await t('[4.4] หน้าเปิดกะของผู้จัดการ: มีปุ่มดูรายงาน', () => ok(cancel.style.display === 'block' && /ดูรายงาน/.test(cancel.innerHTML)));
  loginAs(app, 'staff'); app.openCashCounter('open');
  await t('[4.5] พนักงาน: ไม่มีปุ่มดูรายงาน แต่มีปุ่มเปลี่ยนผู้ใช้', () => ok(cancel.style.display === 'none' && sw.style.display === 'block'));
  env.dispose();
});

// ═══ [5] นาฬิกาเครื่องตั้งย้อน/เดินหน้า ═══
await section('[5]', async () => {
  // (ก) เซสชันเจ้าของไม่ถูกคืนข้ามการเปิดแอป แม้ตั้งนาฬิกาย้อนไปช่วงที่เจ้าของเพิ่งใช้
  {
    const env = createEnv({});
    quiet(env.app); env.app.openCashCounter = () => {}; env.app.switchTab = () => {};
    const T_LAST = Date.parse('2026-10-12T15:00:00+07:00');
    // กะเปิดก่อนเวลาที่เจ้าของใช้ล่าสุด — วัดเฉพาะกติกา "ไม่คืนเซสชันเจ้าของ" (ไม่ให้ด่านเวลาล่าสุดช่วยบัง)
    const rows = await seed(env, { googleSheetsUrl: '', googleSheetsApiToken: '',
      shift: { active: true, startTime: T_LAST - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] } });
    await env.db.state.put({ key: 'session', value: { uid: '__owner__', name: 'เจ้าของร้าน', role: 'owner', credential: rows.ownerPin, ts: T_LAST } });
    vm.runInContext('Date', env.ctx).now = () => T_LAST + 3 * 60000;
    await env.app.init(); await settle(30);
    await t('[5.1] เปิดแอปใหม่ + นาฬิกาย้อนไปช่วงที่เจ้าของเพิ่งใช้ → ไม่ได้สิทธิ์เจ้าของ', () => ok(env.app.currentRole !== 'owner', String(env.app.currentRole)));
    env.dispose();
  }
  // (ก) เจ้าของเปิดแอปค้าง แล้วนาฬิกาถูกตั้งย้อน → หมดเวลา
  {
    const { env, app } = await makeShop();
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    let out = null; app.logout = (r) => { out = r; app.currentRole = null; };
    D.now = () => Date.parse('2026-10-12T15:00:00+07:00'); proto(app, 'markActivity')();
    D.now = () => Date.parse('2026-10-12T14:00:00+07:00'); proto(app, 'checkIdleTimeout')();
    await t('[5.2] เวลาไม่ใช้งานติดลบ (นาฬิกาถอย) → ออกจากระบบเจ้าของ', () => ok(out !== null && app.currentRole === null));
    loginAs(app, 'owner'); out = null;
    D.now = () => Date.parse('2026-10-12T15:00:00+07:00');
    const vis = Object.getPrototypeOf(app).onAppVisibilityChange;
    if (vis) {
      vis.call(app, true);
      D.now = () => Date.parse('2026-10-12T15:00:30+07:00'); vis.call(app, false);
      await t('[5.3] เจ้าของสลับแอปแป๊บเดียว (30 วิ) → ยังอยู่ในระบบ', () => ok(out === null && app.currentRole === 'owner'));
      vis.call(app, true);
      D.now = () => Date.parse('2026-10-12T15:05:00+07:00'); vis.call(app, false);
      await t('[5.4] เจ้าของสลับออกจากแอปเกิน 1 นาที → ออกจากระบบ', () => ok(out !== null));
    } else await t('[5.3] มีตัวจับการสลับแอปของเจ้าของ', () => ok(false));
    D.now = realNow;
    env.dispose();
  }
  // (ข) ผู้จัดการตั้งนาฬิกาเป็นเมื่อวาน แล้วยกเลิกบิลเงินสดของเมื่อวาน
  {
    const T_SHIFT = Date.parse('2026-10-13T10:00:00+07:00');
    const T_BILL = Date.parse('2026-10-12T21:30:00+07:00');
    const bill = { id: 'TX-1760279400000-ABCDE', date: T_BILL, customerName: 'x', services: ['ตัดผม'],
      details: [{ name: 'ตัดผม', price: 900, netPrice: 900, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent',
        commissionAmount: 90, category: 'barber', vatable: false }],
      subtotal: 900, discount: 0, vatRate: 7, nonVatBase: 900, vatableBase: 0, vatAmount: 0, rounding: 0, total: 900,
      cashReceived: 900, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' };
    const { env, app } = await makeShop({ role: 'manager', rows: { transactions: [bill],
      shift: { active: true, startTime: T_SHIFT, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    D.now = () => Date.parse('2026-10-12T23:00:00+07:00');
    env.document.getElementById('edit-tx-id').value = bill.id;
    env.document.getElementById('void-money-outcome').value = 'refunded';
    await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(60);
    await t('[5.5] ผู้จัดการตั้งนาฬิกาเป็นเมื่อวาน → ยกเลิกบิลเมื่อวานไม่ได้', () => ok(app.state.transactions.some(t => t.id === bill.id)));
    await t('[5.6] "วันนี้" ของผู้จัดการไม่ถอยตามนาฬิกาเครื่อง', () => eq(app.currentBusinessDateKey(), '2026-10-13'));
    D.now = realNow;
    env.dispose();
  }
  // (ค) กะเปิดนานผิดปกติ → ถามก่อนขาย (ครั้งเดียวต่อกะ)
  {
    const { env, app } = await makeShop({ rows: { shift: { active: true, startTime: Date.now() - 26 * 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
    await settle();
    const asks = []; app.askConfirm = async (m) => { asks.push(m); return false; };
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    const r1 = await app.processCheckout(); await settle(20);
    await t('[5.7] กะเปิดมา 26 ชม. → ถามก่อน · ตอบไม่ = ไม่ออกบิล', () => ok(!r1 && app.state.transactions.length === 0 && asks.some(m => /ชั่วโมงแล้ว/.test(m)), JSON.stringify(asks)));
    app.askConfirm = async (m) => { asks.push(m); return true; };
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await app.processCheckout(); await settle(20);
    const n = asks.length;
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await app.processCheckout(); await settle(20);
    await t('[5.8] ตอบขายต่อแล้ว ไม่ถามซ้ำทุกบิลในกะเดิม', () => ok(app.state.transactions.length === 2 && asks.length === n));
    env.dispose();
  }
});

// ═══ [6] คืนเงินบางส่วน (หลัง "ไม่มีเงินเคลื่อนไหว" แล้วแก้บิลอีกรอบ) — ลิ้นชักต้องตรงเงินจริง ═══
await section('[6]', async () => {
  const { env, app } = await makeShop({ cash: { 1000: 1, 100: 4 }, rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });   // เงินจริงตอนปิด 1,400
  await settle();
  const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
  await editBill(env, tx.id, 100);
  await app.recordBillSettlement(tx.id, 'waive'); await settle(10);   // ลูกค้าไม่เอาเงินคืน
  await editBill(env, tx.id, 200);                                       // ลดเพิ่ม 100 และคืนเงินสด 100 จริง
  await t('[6.1] หลังแก้รอบสอง ระบบแสดงส่วนต่าง −200 (รวมของเดิม)', () => eq(JSON.stringify(app.billMoneyStatus(tx).diffs), JSON.stringify([{ method: 'cash', amount: -200 }])));
  const r = await app.recordBillSettlement(tx.id, 'moved', 'cash', 100); await settle(10);
  await t('[6.2] บันทึก "คืนเงินสดจริง 100" ได้ · บิลขึ้นครบ', () => ok(r === true && app.billMoneyStatus(tx).settled, JSON.stringify(app.billMoneyStatus(tx).diffs)));
  await t('[6.3] ส่วนที่ไม่ได้คืน 100 บันทึกเป็น "ไม่มีเงินเคลื่อนไหว" ในคราวเดียว', () => ok(tx.settlements.some(s => s.kind === 'waive' && s.partialRest === true && s.amount === -100)));
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(10);
  const h = app.state.shift.history[app.state.shift.history.length - 1];
  await t('[6.4] ปิดกะ: ควรมี 1,400 = นับได้ 1,400 · ขาด/เกิน 0', () => ok(h.expectedCash === 1400 && h.difference === 0, JSON.stringify({ e: h.expectedCash, d: h.difference })));
  await t('[6.5] ยอดที่ใส่เกินส่วนต่างสุทธิ = ไม่บันทึก', async () => {
    const t2 = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'promptpay');
    await editBill(env, t2.id, 50);
    const r2 = await app.recordBillSettlement(t2.id, 'moved', 'promptpay', 60);
    ok(r2 === false && !app.billMoneyStatus(t2).settled);
  });
  // ปุ่มบนหน้าบิลอ่านยอดจากช่อง (ว่าง = ทั้งก้อน)
  await t('[6.6] หน้าบิลมีช่องใส่ยอดที่คืน/เก็บจริง', () => {
    const t3 = app.state.transactions[app.state.transactions.length - 1];
    app.openTransactionEdit(t3.id);
    ok(/id="edit-settle-amount"/.test(env.document.getElementById('edit-tx-money-box').innerHTML));
  });
  env.dispose();
});

// ═══ [7] รายงานปิดกะใน Telegram ต้องไม่ส่งซ้ำ ถ้าแอปถูกปิดระหว่างอัปโหลดไฟล์สำรอง ═══
await section('[7]', async () => {
  let tgPosts = 0, hang = true;
  const { env, app } = await makeShop({ rows: { telegramToken: '123:abc', telegramChatId: '-100' } });
  const gasFetch = env.ctx.fetch;
  const fetchFn = async (url, init) => {
    if (/api\.telegram\.org/.test(url)) { tgPosts++; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    if (hang && /"action":"backup"/.test(String(init && init.body || ''))) return new Promise(() => {});
    return gasFetch(url, init);
  };
  env.ctx.fetch = fetchFn;
  await app.withMutation('t', async () => {
    app.enqueueShiftCloseCloudOps({ startTime: Date.now() - 5 * 3600e3, endTime: Date.now(), startCash: 1000, countedCash: 1000,
      expectedCash: 1000, cashSales: 0, expenses: [], expensesTotal: 0, difference: 0, closedBy: 'บี' });
    await app.saveState();
  });
  const job = app.state.cloudOutbox.find(j => j.needTelegram);
  app.flushCloudOutbox();
  await settle(400);
  const raw = (await env.raw('cloudOutbox')).find(j => j.id === job.id);
  await t('[7.1] ส่ง Telegram แล้ว → บันทึก "ส่งแล้ว" ลงเครื่องทันที (ไม่รอไฟล์สำรอง)', () => ok(tgPosts === 1 && raw && raw.needTelegram === false, JSON.stringify({ tgPosts, raw: raw && raw.needTelegram })));
  env.dispose();
  const env2 = createEnv({ factory: env.factory, storage: env.storage, fetch: fetchFn });
  quiet(env2.app); await env2.app.init(); loginAs(env2.app, 'owner');
  hang = false;
  await env2.app.flushCloudOutbox(); await settle(200);
  await t('[7.2] เปิดแอปใหม่ → ไม่ส่งรายงานปิดกะซ้ำ', () => eq(tgPosts, 1));
  env2.dispose();
});

// ═══ [8] สรุปของวันที่แก้บิล ต้องไม่ค้างหลังงานลบแถวที่ชีตปฏิเสธ ═══
await section('[8]', async () => {
  const { env, app } = await makeShop();
  const day = Date.now() - 2 * 86400e3;
  const dk = app.getBusinessISODate(day), mk = app.getBusinessMonthKey(day);
  await app.withMutation('t', async () => {
    app.state.cloudOutbox.push({ id: 'cob-void', createdAt: Date.now(), dateKeys: [dk], monthKeys: [mk], needVoidDelete: true,
      voidDelete: { id: 'TX-1790000000000-AAAAAAAA', date: day, monthKey: mk, voidedBy: 'บี', voidedAt: Date.now() },
      needSummary: true, needTelegram: false, telegramMessage: '', tries: 0 });
    app.enqueueSummaryRefresh(day);
    await app.saveState();
  });
  await t('[8.1] งานสรุปจากการแก้บิล ไม่ถูกรวมเข้างานลบแถว', () => ok(app.state.cloudOutbox.some(j => j.id !== 'cob-void' && j.needSummary && !j.needVoidDelete)));
  app.postVoidDelete = async () => { app._cloudFailReason = 'DUPLICATE_BILL_ID'; return false; };
  const sent = []; const orig = app.syncDailySummary.bind(app);
  app.syncDailySummary = async (k, ...a) => { sent.push(k); return orig(k, ...a); };
  await app.flushCloudOutbox(); await settle(30);
  await t('[8.2] สรุปของวันนั้นถูกส่งแม้งานลบแถวยังติด', () => ok(sent.includes(dk), JSON.stringify(sent)));
  env.dispose();
});

// ═══ [9] (Apps Script) สรุปของวันที่เก่ากว่า 62 วัน — คำขอเก่าที่มาถึงทีหลังต้องถูกปฏิเสธ ═══
await section('[9]', async () => {
  const dkAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const SUM = (dateKey, rev, gen) => ({ action: 'summary_day', dateKey, generatedAt: gen,
    totalRevenue: rev, cashRevenue: rev, qrRevenue: 0, creditRevenue: 0, billCount: 1, avgBill: rev,
    totalExpenses: 0, netIncome: rev, cashVariance: 0, shiftCount: 0, shiftCash: [],
    nonVatBase: rev, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
    services: [{ name: 'ตัดผม', count: 1, revenue: rev }], expenses: [], staffCommissions: [] });
  const gas = createGasEnv({ keepDailyRetention: true });
  const key = dkAgo(70), t0 = Date.now();
  const newer = gas.post(SUM(key, 300, t0 + 2000));
  const older = gas.post(SUM(key, 400, t0 + 1000));
  const m = gas.sheet('สรุปรายเดือน')._grid; const h = m[0];
  const row = m.find(r => r[h.indexOf('ช่วงเวลา')] === key);
  await t('[9.1] วันอายุ 70 วัน: คำขอเก่าที่มาถึงทีหลัง → STALE_SUMMARY', () => ok(newer.status === 'success' && older.code === 'STALE_SUMMARY', JSON.stringify(older)));
  await t('[9.2] แถวของวันนั้นในสรุปรายเดือนยังเป็นยอดใหม่ 300', () => eq(row && row[h.indexOf('รายได้รวม (฿)')], 300));
  await t('[9.3] แท็บที่เพิ่งเขียนยังอยู่ (ไม่ถูกลบในคำขอเดียวกัน)', () => ok(!!gas.sheet('สรุป-' + key)));
});

// ═══ [10] ย้อนกลับไปก่อนกู้ → PIN ผู้จัดการต้องกลับมา · ไฟล์ภายนอกห้ามใส่ PIN สิทธิ์สูง ═══
await section('[10]', async () => {
  for (const [label, mut] of [['ไฟล์ไม่มีบัญชีผู้จัดการ', f => { f.staff = f.staff.filter(s => s.id !== 'mg-1'); }],
                             ['ไฟล์รุ่นเก่ามี PIN ผู้จัดการเก่า', (f, old) => { f.staff.find(s => s.id === 'mg-1').pin = old; }]]) {
    const { env, app } = await makeShop();
    await settle();
    const cur = await app.hashPin('222222'), old = await app.hashPin('999999');
    const pin = () => { const m = app.state.staff.find(s => s.id === 'mg-1'); return m ? m.pin : undefined; };
    const file = clone(app.buildBackupPayload()); mut(file, old);
    await app.withMutation('นำเข้าข้อมูล', async () => { const snap = app.buildPreRestoreSnapshot(); await app._applyBackupDataLocked(file, { acceptUnsynced: true }, { preRestoreSnapshot: snap }); return true; });
    await settle(20);
    if (label.includes('เก่า')) await t(`[10.1] ${label}: กู้แล้ว PIN เก่าจากไฟล์ใช้ไม่ได้ (คง PIN ปัจจุบัน)`, () => eq(pin(), cur));
    app.confirmUnsyncedReplace = async () => ({ acceptUnsynced: true });
    await app.undoLastRestore(); await (app._confirmP || Promise.resolve()); await settle(60);
    await t(`[10.2] ${label}: ย้อนกลับแล้ว ผู้จัดการได้ PIN ปัจจุบันคืน`, () => eq(pin(), cur));
    env.dispose();
  }
});

// ═══ [13] [14] ไฟล์นำเข้าที่ถูกแก้/เสีย ═══
await section('[13-14]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const data = { customers: [{ id: '<img src=x onerror=alert(1)>', name: 'a', phone: '1', visitCount: 0 }] };
  app.sanitizeBackupData(data);
  app.state.customers = data.customers;
  proto(app, 'renderCustomerTable')('');
  await t('[13.1] รหัสลูกค้าจากไฟล์ไม่กลายเป็นโค้ดบนหน้าลูกค้า', () => ok(!/<img src=x onerror/i.test(env.document.getElementById('customer-table-body').innerHTML)));
  app.state.customers = [];
  const now = Date.now(), base = clone(app.buildBackupPayload());
  const mk = (id) => ({ id, date: now - 600000, customerName: 'c', services: ['ตัดผม'],
    details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber', vatable: false }],
    subtotal: 300, discount: 0, vatRate: 7, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300, cashReceived: 300, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1 });
  const t1 = mk('TX-1760000000001-AAAAAAAA'); t1.details[0].commissionAmount = 99999;
  const t2 = mk('TX-1760000000002-AAAAAAAA');
  base.transactions = [t1, t2];
  base.shift = { active: true, startTime: now - 3600e3, startCash: -5000, startDetails: {}, history: [],
    expenses: [{ id: 'e1', amount: 1e9, note: 'huge', time: now - 1000, by: 'x' }, { id: 'e2', amount: 12.345, note: 'dec', time: now - 1000, by: 'x' }, { id: 'e3', amount: 50, note: 'ok', time: now - 1000, by: 'x' }] };
  base.categories.push({ id: 'cat-x', icon: 'fa-tag', vat: false });
  base.shopName = 12345;
  await app.applyBackupData(base, { acceptUnsynced: true }); await settle(30);
  await t('[14.1] ค่าคอม % เกินราคาบรรทัด (99,999 ในบิล 300) → แยกไว้ตรวจ', () => ok(!app.state.transactions.some(t => t.id === t1.id) && app.state.transactions.some(t => t.id === t2.id)));
  await t('[14.2] ค่าใช้จ่ายพันล้าน / 12.345 → แยกไว้ตรวจ · 50 ยังอยู่', () => eq(JSON.stringify(app.state.shift.expenses.map(e => e.amount)), '[50]'));
  await t('[14.3] เงินตั้งต้นกะติดลบ → ไม่ใช้เป็นเงินจริง (0 + ติดธง)', () => ok(app.state.shift.startCash === 0 && app.state.shift.startCashInvalid === true));
  env.document.getElementById('cat-name').value = 'หมวดใหม่';
  let err = null; try { await app.addCategory(); } catch (e) { err = e.message; }
  await t('[14.4] หมวดไม่มีชื่อจากไฟล์ → เพิ่มหมวดใหม่ได้ไม่พัง', () => ok(err === null, err));
  let e2 = null; try { proto(app, 'applyShopName')(); } catch (e) { e2 = e.message; }
  await t('[14.5] ชื่อร้านเป็นตัวเลขในไฟล์ → ไม่รับ · แถบข้างไม่พัง', () => ok(e2 === null && typeof app.shopName === 'string', e2));
  env.dispose();
});

// ═══ [15] [20] [22] Apps Script ═══
await section('[15-22 GAS]', async () => {
  const p2 = n => String(n).padStart(2, '0');
  const T = Date.UTC(2026, 9, 5, 12, 0);
  const bill = (extra) => { const d = new Date(T + 7 * 3600e3);
    return Object.assign({ action: 'transaction', id: 'TX-RESTORE1', date: T, monthKey: '10-2026',
      dateTimeStr: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`,
      customerName: 'c', services: ['ตัดผม'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, revEpoch: 0 }, extra || {}); };
  const g = createGasEnv();
  g.post(bill()); g.post(bill({ rev: 2, subtotal: 200, total: 200 }));
  const sh = g.sheet('10-2026'); sh._grid.push(sh._grid[1].slice());
  const V = T + 60000;
  g.post({ action: 'void_transaction', id: 'TX-RESTORE1', monthKey: '10-2026', voidedAt: V });
  sh._grid.pop();
  const rs = g.post(bill({ rev: 1, revEpoch: T + 120000, allowVoidedRestore: true, restoredAt: V + 1000, restoreBase: { epoch: 0, rev: 1 } }));
  const rv = g.post({ action: 'void_transaction', id: 'TX-RESTORE1', monthKey: '10-2026', voidedAt: V });
  await t('[15.1] คำขอกู้บิลที่ถูกปฏิเสธ (STALE_REVISION) ไม่ทิ้งทะเบียน "กู้แล้ว" → คำสั่งยกเลิกที่ค้างลบแถวได้', () =>
    ok(rs.code === 'STALE_REVISION' && rv.status === 'success' && sh._grid.length === 1, JSON.stringify({ rs: rs.code, rv: rv.code, rows: sh._grid.length - 1 })));
  // [20] ชื่อขึ้นต้นด้วย ' ต้องคงไว้
  const g2 = createGasEnv();
  g2.post(bill({ id: 'TX-APOS0001', customerName: "'Tom", staffNames: ["'Jane"] }));
  const row = g2.sheet('10-2026')._grid.find(r => r[0] === 'TX-APOS0001') || [];
  await t("[20.1] ชื่อลูกค้า/พนักงานที่ขึ้นต้นด้วย ' ไม่ถูกกิน '", () => ok(row.includes("''Tom") || row.includes("'Tom"), JSON.stringify(row)));
  const safeCell = g2.ctx.safeCell;
  await t("[20.2] safeCell: ' นำหน้า และช่องว่างนำหน้าสูตร ถูกกันเป็นข้อความ", () => ok(safeCell("'Tom") === "''Tom" && safeCell(' =1+1') === "' =1+1"));
  {
    const stored = row.slice();                                   // ค่าที่ชีตเก็บจริง (' ตัวแรกถูกกิน)
    const writing = row.map(v => (typeof v === 'string' && /^'/.test(v)) ? "'" + v : v);   // ค่าที่ safeCell จะส่งไปเขียนซ้ำ
    const ch = g2.ctx.billRowChanges_(stored, writing, row.length >= 13);
    await t("[20.3] บิลเดิมที่ชื่อขึ้นต้นด้วย ' ส่งซ้ำ → ไม่ฟ้องว่าข้อมูลต่าง (ไม่เกิด REVISION_CONFLICT ผิด ๆ)", () => ok(Array.isArray(ch) && ch.length === 0, JSON.stringify(ch)));
  }
  // [22] ชื่อร้าน + จำนวนสินค้าในตารางค่าคอม
  const g3 = createGasEnv();
  const dk = (() => { const d = new Date(); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  const r3 = g3.post({ action: 'summary_day', dateKey: dk, generatedAt: Date.now(), shopName: 'ร้านทดสอบ',
    totalRevenue: 500, cashRevenue: 500, qrRevenue: 0, creditRevenue: 0, billCount: 1, avgBill: 500, totalExpenses: 0, netIncome: 500,
    cashVariance: 0, shiftCount: 0, shiftCash: [], nonVatBase: 500, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
    services: [{ name: 'ตัดผม', count: 1, revenue: 300 }, { name: 'แชมพู', count: 2, revenue: 200 }], expenses: [],
    staffCommissions: [{ name: 'เอ', role: 'ช่าง', count: 1, productCount: 2, salesSum: 500, commission: 50 }] });
  const tab = g3.sheet('สรุป-' + dk);
  const cells = tab ? tab._grid.flat().map(String) : [];
  await t('[22.1] หัวแท็บสรุปใช้ชื่อร้านจาก payload', () => ok(r3.status === 'success' && cells.some(c => /ร้านทดสอบ POS/.test(c)), JSON.stringify(r3)));
  await t('[22.2] ตารางค่าคอมแสดง "1 งาน · 2 สินค้า"', () => ok(cells.some(c => /1 งาน · 2 สินค้า/.test(c))));
});

// ═══ [16] [17] [18] [19] [21] [22-app] ═══
await section('[16-22 app]', async () => {
  {
    const { env, app } = await makeShop({ rows: { telegramToken: '123:abc', telegramChatId: '-100' } });
    const file = clone(app.buildBackupPayload());
    await app.withMutation('t', async () => {
      app.enqueueShiftCloseCloudOps({ startTime: Date.now() - 5 * 3600e3, endTime: Date.now(), startCash: 1000, countedCash: 900,
        expectedCash: 1000, cashSales: 0, expenses: [], expensesTotal: 0, difference: -100, closedBy: 'บี' });
      await app.saveState();
    });
    await app.applyBackupData(clone(file), { acceptUnsynced: true }); await settle(20);
    await t('[16.1] กู้ไฟล์แล้ว ข้อความ Telegram ปิดกะที่ยังส่งไม่ออกยังอยู่ในคิว', () => ok(app.state.cloudOutbox.some(j => j.needTelegram && /-?100/.test(j.telegramMessage || ''))));
    env.dispose();
  }
  {
    const { env, app } = await makeShop();
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await app.withMutation('t', async () => { app.planChangeBackup('edit'); await app.saveState(); });
    const before = JSON.stringify(app.state.cloudOutbox);
    const restore = failPutForKeys(['transactions'], 'async');
    env.document.getElementById('edit-tx-id').value = tx.id;
    env.document.getElementById('void-money-outcome').value = 'refunded';
    await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(40); restore();
    await t('[17.1] ยกเลิกบิลแล้วบันทึกล้มเหลว → คิวงานคลาวด์กลับเป็นเหมือนเดิมทุกช่อง', () => ok(app.state.transactions.includes(tx) && JSON.stringify(app.state.cloudOutbox) === before));
    env.dispose();
  }
  {
    const { env, app } = await makeShop();
    const bills = [{ id: 'TX-SHEET0001', date: Date.now(), total: 1100, nonVatBase: 1100, vatableBase: 0, vatAmount: 0, rounding: 0,
      services: ['ตัดผม'], sheetOnly: { cardFeeLabel: 'ค่าธรรมเนียมบัตร 10%' } }];
    const b = proto(app, 'buildServiceBreakdown')(bills);
    await t('[18.1] บิลจากชีตที่มีค่าธรรมเนียมบัตร → ไม่นับค่าธรรมเนียมเป็นรายได้ของบริการ', () => ok(!b.rows.some(r => r.name === 'ตัดผม') && b.rows.some(r => /บิลจากชีต/.test(r.name)), JSON.stringify(b.rows)));
    env.dispose();
  }
  {
    const { env, app } = await makeShop({ cash: { 1000: 1 } });
    await settle();
    let calls = 0; const real = proto(app, 'computeShiftDrawer');
    app.computeShiftDrawer = (...a) => { calls++; return real(...a); };
    app.openCashCounter('close');
    const c0 = calls;
    for (let i = 0; i < 5; i++) app.updateCashSum();
    await t('[19.1] พิมพ์ในหน้านับเงินปิดกะ → ไม่คำนวณลิ้นชักทั้งร้านใหม่ทุกตัวอักษร', () => ok(calls - c0 === 0, `${calls - c0} ครั้ง`));
    env.dispose();
  }
  {
    const { env, app } = await makeShop();
    await settle();
    await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }, { id: 'd1', name: 'น้ำ', price: 20 }, { id: 'd1', name: 'น้ำ', price: 20 }], 'cash', 340);
    await checkout(env, [{ id: 'd1', name: 'น้ำ', price: 20 }], 'promptpay');
    app.state.selectedReportType = 'daily';
    env.document.getElementById('report-date-input').value = app.getBusinessISODate(Date.now());
    proto(app, 'filterReports')();
    const avg = env.document.getElementById('report-kpi-average').innerText;
    await t('[21.1] ยอดเฉลี่ยต่อบิลแสดงทศนิยมไม่เกิน 2 ตำแหน่ง', () => ok(/^฿[\d,]+\.\d{2}$/.test(avg), avg));
    const tb = env.document.getElementById('report-transactions-body').innerHTML;
    await t('[21.2] ป้ายช่องทางในตารางบิลเป็นภาษาไทย (ไม่มี Scan/Credit ตัวพิมพ์ใหญ่)', () => ok(/โอน\/QR/.test(tb) && !/text-transform: uppercase/.test(tb) && !/>Scan</.test(tb), tb.slice(0, 300)));
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    D.now = () => Date.parse('2026-10-13T01:25:00+07:00');
    try { proto(app, 'renderDashboard')(); } catch (e) {}
    D.now = realNow;
    await t('[21.3] ตี 1 ทักทายว่า "ตอนดึก" (ไม่ใช่ตอนเย็น)', () => ok(/ตอนดึก/.test(env.document.getElementById('dashboard-greeting').innerText)));
    // ชื่อพนักงานซ้ำ → ถามก่อน
    const asks = []; app.askConfirm = async (m) => { asks.push(m); return false; };
    env.document.getElementById('staff-name').value = 'เอ';
    env.document.getElementById('staff-access-level').value = 'staff';
    env.document.getElementById('staff-pin').value = '';
    const n0 = app.state.staff.length;
    await app.addStaff(); await settle(10);
    await t('[21.4] เพิ่มพนักงานชื่อซ้ำ → ถามก่อน · ตอบไม่ = ไม่เพิ่ม', () => ok(app.state.staff.length === n0 && asks.some(m => /ชื่อ "เอ" อยู่แล้ว/.test(m))));
    // ยอดที่ต้องชำระบนหน้าเงินสด
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 500);
    try { proto(app, 'recalcCashChange')(); } catch (e) {}
    await t('[21.5] หน้าเงินสดแสดงยอดที่ต้องชำระ', () => eq(env.document.getElementById('cash-amount-due').innerText, '฿300.00'));
    // [22] payload ส่ง productCount + ชื่อร้าน
    const p = app.buildSummaryPayload(app.state.transactions, [], 'day', app.getBusinessISODate(Date.now()));
    await t('[22.3] สรุปที่ส่งชีตมีชื่อร้านและจำนวนสินค้าของพนักงาน', () => ok(p.shopName === 'ร้านจริง' && p.staffCommissions.every(s => Number.isInteger(s.productCount)), JSON.stringify(p.staffCommissions)));
    env.dispose();
  }
  await t('[11.1] การ์ดตัวเลข: min-width:0 + ตัวเลขบรรทัดเดียว (ไม่ถูกตัด/ไม่หักกลางตัวเลข)', () => {
    const css = fs.readFileSync(CSS_SRC, 'utf8');
    ok(/\.kpi-info\s*\{[^}]*min-width:\s*0/.test(css) && /\.kpi-info h3\s*\{[^}]*white-space:\s*nowrap/.test(css));
  });
  await t('[21.6] ปุ่มที่กดไม่ได้หน้าตาต่างจากปุ่มที่กดได้', () => ok(/\.btn-small:disabled[^{]*\{[^}]*opacity/.test(fs.readFileSync(CSS_SRC, 'utf8'))));
});

// ═══ [12] deploy: commit ที่ค้าง push แตะไฟล์แอปแต่ไม่บวกเลขแคช → บวกให้ก่อน push ═══
await section('[12]', async () => {
  // โฟลเดอร์ชั่วคราวนอกโปรเจกต์ — ลบทิ้งทุกครั้งหลังรัน (ไม่ทิ้งของไว้ในรีโป)
  const base = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pos-deploy-safety-'));
  process.on('exit', () => { try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {} });
  const run = (script, settings) => {
    const dir = fs.mkdtempSync(path.join(base, script.replace(/\W/g, '') + '-'));
    fs.mkdirSync(path.join(dir, 'tests')); fs.mkdirSync(path.join(dir, '.git'));
    const src = process.env.POS_SCRIPT_DIR || ROOT;
    for (const f of [script, 'sw.js']) fs.copyFileSync(path.join(src === ROOT ? ROOT : src, f), path.join(dir, f));
    fs.copyFileSync(APP_SRC, path.join(dir, 'app.js'));
    fs.writeFileSync(path.join(dir, 'tests/run-all.js'), 'process.exit(0);');
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
    fs.writeFileSync(path.join(dir, 'invoke.ps1'), `
$ErrorActionPreference = 'Stop'
$global:cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
$global:trace = Join-Path $PSScriptRoot 'trace.jsonl'
$global:staged = @()
function git {
    $items = @($args | ForEach-Object { [string]$_ })
    Add-Content -LiteralPath $global:trace -Value (ConvertTo-Json -Compress -InputObject $items)
    $global:LASTEXITCODE = 0
    if ($items[0] -eq '-c') { $items = @($items | Select-Object -Skip 2) }
    switch ($items[0]) {
      'status' { return $global:cfg.status }
      'diff' {
        if ($items -contains '--stat') { return '' }
        if ($items -contains '--cached') { return (($global:staged | Where-Object { $_ }) -join [char]0) + [char]0 }
        if (($items | Where-Object { $_ -like '*..HEAD' }).Count -gt 0) { return (($global:cfg.ahead | Where-Object { $_ }) -join [char]0) + [char]0 }
        return [string][char]0
      }
      'rev-list' { return '2' }
      'symbolic-ref' { return 'main' }
      'rev-parse' { return 'origin/main' }
      'fetch' { return }
      'log' { return }
      'branch' { return }
      'add' { $global:staged = @('sw.js'); return }
      'commit' { return }
      'push' { return }
      'rebase' { return }
      default { throw ('Unmocked Git command: ' + ($items -join ' ')) }
    }
}
function Read-Host { return 'y' }
& (Join-Path $PSScriptRoot '${script}')
exit $LASTEXITCODE
`);
    let r = spawnSync('pwsh', ['-NoProfile', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    if (r.error && r.error.code === 'ENOENT') r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    if (r.error) throw r.error;
    const cmds = fs.existsSync(path.join(dir, 'trace.jsonl')) ? fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s.replace(/^﻿/, ''))) : [];
    const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
    const swBefore = fs.readFileSync(path.join(src, 'sw.js'), 'utf8');
    const ver = s => Number((/jahn-pos-v(\d+)/.exec(s) || [])[1]);
    const res = { status: r.status, out: (r.stdout || '') + (r.stderr || ''), cmds, bumped: ver(sw) === ver(swBefore) + 1 };
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    return res;
  };
  const d1 = run('deploy.ps1', { status: [], ahead: ['app.js'] });
  await t('[12.1] deploy.bat: commit ค้าง push แก้ app.js แต่ไม่แตะ sw.js → บวกเลขแคช + commit ก่อน push', () =>
    ok(d1.status === 0 && d1.bumped && d1.cmds.some(c => c[0] === 'commit') && d1.cmds.findIndex(c => c[0] === 'commit') < d1.cmds.findIndex(c => c[0] === 'push'), d1.out.slice(-600)));
  const d2 = run('deploy.ps1', { status: [], ahead: ['app.js', 'sw.js'] });
  await t('[12.2] deploy.bat: commit ค้างมี sw.js อยู่แล้ว (เช่นถอยรุ่นด้วย git revert) → ไม่บวกซ้ำ', () => ok(d2.status === 0 && !d2.bumped && !d2.cmds.some(c => c[0] === 'commit'), d2.out.slice(-400)));
  const f1 = run('fix-push.ps1', { status: [], ahead: ['app.js'] });
  await t('[12.3] fix-push.bat: ส่ง app.js โดยไม่ได้บวกเลขแคช → บวกให้ก่อน push', () => ok(f1.status === 0 && f1.bumped && f1.cmds.findIndex(c => c[0] === 'commit') < f1.cmds.findIndex(c => c[0] === 'push'), f1.out.slice(-600)));
  const d3 = run('deploy.ps1', { status: [' M README.md'], ahead: ['app.js'] });
  await t('[12.5] deploy.bat: มีเอกสารแก้ + commit ค้าง push แก้ app.js → ยังบวกเลขแคช', () => ok(d3.status === 0 && d3.bumped, d3.out.slice(-600)));
  const fx = fs.readFileSync(path.join(process.env.POS_SCRIPT_DIR || ROOT, 'fix-push.ps1'), 'utf8');
  await t('[12.4] fix-push.bat รันชุดเทสต์ก่อน commit', () => ok(/run-all\.js/.test(fx) && fx.indexOf('run-all.js') < fx.indexOf("git commit")));
}, 180000);

// ═══ [R] จุดที่ผู้ตรวจอิสระเจอหลังแก้รอบแรก (13 ต.ค. 2569) ═══
await section('[R]', async () => {
  const voidBill = async (env, id, outcome) => {
    env.document.getElementById('edit-tx-id').value = id;
    env.document.getElementById('void-money-outcome').value = outcome;
    await env.app.voidTransaction(); await (env.app._confirmP || Promise.resolve()); await settle(40);
  };
  const exp = (app) => app.computeShiftDrawer(app.state.shift).expected;
  // R1: คืนบางส่วนคนละทางกับบิล แล้วยกเลิกบิลแบบคืนเงินแล้ว
  for (const [label, method, via, truth] of [['บิลเงินสด 500→300 คืนโอน 100', 'cash', 'promptpay', -400], ['บิลโอน 500→300 คืนเงินสด 100', 'promptpay', 'cash', 0]]) {
    const { env, app } = await makeShop({ rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], method, 500);
    await editBill(env, tx.id, 200);
    await app.recordBillSettlement(tx.id, 'moved', via, 100); await settle(10);
    await t(`[R1] ${label}: บันทึกแล้วบิลขึ้นครบ (ส่วนต่างช่องทางบันทึกให้ในคราวเดียว)`, () => ok(app.billMoneyStatus(tx).settled, JSON.stringify(app.billMoneyStatus(tx).diffs)));
    const before = exp(app);
    await voidBill(env, tx.id, 'refunded');
    await t(`[R1] ${label} แล้วยกเลิก "คืนเงินแล้ว" → ลิ้นชักเปลี่ยน ${truth}`, () => ok(!app.state.transactions.includes(tx) && exp(app) - before === truth, `${exp(app) - before}`));
    env.dispose();
  }
  // R1b: ส่วนต่างช่องทางหมดผลเพราะแก้บิลอีกรอบ แล้วกด "ไม่มีเงินเคลื่อนไหว" กับส่วนที่เหลือคนละช่องทาง → ยกเลิกแบบคืนเงินแล้ว
  {
    const { env, app } = await makeShop({ rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 700 }], 'promptpay');
    await editBill(env, tx.id, 200);
    await app.recordBillSettlement(tx.id, 'moved', 'cash'); await settle(10);   // คืนส่วนลดเป็นเงินสด 200
    await editBill(env, tx.id, 300);                                              // ลดเพิ่ม ลูกค้าไม่เอาคืน
    await app.recordBillSettlement(tx.id, 'waive'); await settle(10);
    const before = exp(app);
    await voidBill(env, tx.id, 'refunded');
    await t('[R1b] บิลโอนที่คืนเงินสดไปแล้ว + แก้บิลอีกรอบ + ไม่มีเงินเคลื่อนไหว → ยกเลิก "คืนเงินแล้ว" ไม่ทำให้เงินสดเพิ่มในลิ้นชัก', () => eq(exp(app) - before, 0));
    env.dispose();
  }
  // R2: นาฬิกาเคยเดินเร็ว → เจ้าของยืนยันเวลา → ผู้จัดการทำงานได้ตามปกติ
  {
    const T_NOW = Date.parse('2026-10-13T14:00:00+07:00');
    const fut = { id: 'TX-1760432400000-FUTUREAA', date: Date.parse('2026-10-14T20:00:00+07:00'), customerName: 'x', services: ['ตัดผม'],
      details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber', vatable: false }],
      subtotal: 300, discount: 0, vatRate: 7, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300, cashReceived: 300, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' };
    const { env, app } = await makeShop({ role: 'owner', rows: { transactions: [fut],
      shift: { active: true, startTime: Date.parse('2026-10-13T10:00:00+07:00'), startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    D.now = () => T_NOW;
    loginAs(app, 'manager');
    await t('[R2.1] (ก่อนยืนยัน) ผู้จัดการถูกล็อกเพราะบิลที่ออกตอนนาฬิกาเดินเร็ว', () => eq(app.currentBusinessDateKey(), '2026-10-14'));
    loginAs(app, 'owner');
    app.askConfirm = async () => true;
    await app.promptClockAckIfNeeded(); await settle(10);
    loginAs(app, 'manager');
    await t('[R2.2] เจ้าของยืนยันเวลาแล้ว → "วันนี้" ของผู้จัดการกลับเป็นวันจริง · ไม่ถูกปฏิเสธ', () => ok(app.currentBusinessDateKey() === '2026-10-13' && !app.clockBehindProblem()));
    const ack = await env.db.state.get('clockAck');
    await t('[R2.3] การยืนยันเวลาบันทึกในเครื่อง (เปิดแอปใหม่ยังจำ)', () => ok(ack && ack.value && ack.value.at === T_NOW));
    D.now = () => Date.parse('2026-10-13T13:00:00+07:00');
    await t('[R2.4] ยืนยันแล้ว แต่ตั้งนาฬิกาย้อนไปก่อนเวลาที่ยืนยัน → ยังถูกจับ', () => ok(!!app.clockBehindProblem()));
    D.now = realNow;
    env.dispose();
  }
  // R2b: ผู้จัดการ — นาฬิกาย้อนแต่ยังวันเดียวกัน → ยกเลิกบิลไม่ได้ (ด่าน refuseOnClockProblem เอง ไม่ใช่ด่านวัน)
  {
    const T_BILL = Date.parse('2026-10-13T20:00:00+07:00');
    const bill = { id: 'TX-1760360400000-SAMEDAYA', date: T_BILL, customerName: 'x', services: ['ตัดผม'],
      details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 30, category: 'barber', vatable: false }],
      subtotal: 300, discount: 0, vatRate: 7, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300, cashReceived: 300, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' };
    const { env, app } = await makeShop({ role: 'manager', rows: { transactions: [bill],
      shift: { active: true, startTime: Date.parse('2026-10-13T10:00:00+07:00'), startCash: 1000, startDetails: {}, expenses: [], history: [] } } });
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    D.now = () => Date.parse('2026-10-13T15:00:00+07:00');
    await voidBill(env, bill.id, 'refunded');
    await t('[R2b] ผู้จัดการ: นาฬิกาย้อนก่อนบิลล่าสุด (วันเดียวกัน) → ยกเลิกบิลไม่ได้', () => ok(app.state.transactions.some(t => t.id === bill.id)));
    D.now = realNow;
    env.dispose();
  }
  // R3: เจ้าของถูกออกจากระบบอัตโนมัติระหว่างขาย → ตะกร้ากลับมาเมื่อเจ้าของเข้าระบบใหม่ (คนอื่นเข้า = ไม่ได้)
  {
    const { env, app } = await makeShop();
    await settle();
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'promptpay');
    const n = app.state.cart.length;
    const D = vm.runInContext('Date', env.ctx), realNow = D.now;
    app.logout = function (r, uid) { this.requireLogin = this.requireLogin || (() => {}); proto(this, 'requireLogin')(uid); };
    const vis = proto(app, 'onAppVisibilityChange');
    const t0 = Date.now(); D.now = () => t0; vis(true); D.now = () => t0 + 120000; vis(false);
    D.now = realNow;
    await t('[R3.1] ออกจากแอปนาน → ออกจากระบบ (ตะกร้าบนจอว่าง)', () => ok(app.currentRole === null && app.state.cart.length === 0));
    loginAs(app, 'owner'); app.afterLogin = () => {}; proto(app, 'completeLogin')();
    await t('[R3.2] เจ้าของเข้าระบบใหม่ → ได้ตะกร้าเดิมคืน', () => eq(app.state.cart.length, n));
    app.state.cart = []; app._heldCart = { uid: '__owner__', cart: [{ x: 1 }], at: Date.now() };
    loginAs(app, 'staff'); proto(app, 'restoreHeldCart')();
    await t('[R3.3] คนอื่นเข้าระบบ → ไม่ได้ตะกร้าของเจ้าของ', () => ok(app.state.cart.length === 0 && !app._heldCart));
    env.dispose();
  }
  // R4: ค่าใช้จ่ายจ่ายรายวัน — บันทึกเสร็จแล้วล้างพนักงานที่เลือก
  {
    const { env, app } = await makeShop({ role: 'manager' });
    await settle();
    const d = env.document;
    d.getElementById('expense-type').value = 'staff'; d.getElementById('expense-amount').value = '400';
    d.getElementById('expense-source').value = 'drawer'; d.getElementById('expense-staff-id').value = 'st-1';
    await app.addExpense({ preventDefault() {} }); await settle(20);
    await t('[R4] บันทึกจ่ายรายวันแล้ว → ช่องพนักงานกลับเป็นยังไม่เลือก', () => ok(app.state.shift.expenses.length === 1 && d.getElementById('expense-staff-id').value === ''));
    env.dispose();
  }
  // R5: ใส่ยอดในช่อง "คืน/เก็บจริงไม่ครบ" แล้วกดปุ่มที่ไม่ใช่ทางคืน → ไม่บันทึกเงียบ ๆ
  {
    const { env, app } = await makeShop({ rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 500 }], 'cash', 500);
    await editBill(env, tx.id, 100);
    env.document.getElementById('edit-settle-amount').value = '50';
    const r = await app.recordBillSettlementFromBox(tx.id, 'waive');
    await t('[R5] ใส่ยอดแล้วกด "ไม่มีเงินเคลื่อนไหว" → ไม่บันทึก (บอกให้ล้างช่องก่อน)', () => ok(r === false && !app.billMoneyStatus(tx).settled));
    env.dispose();
  }
  // R6: ยกเลิกบิลล้มเหลวระหว่างที่รอบส่ง Telegram เขียนสถานะ → ไม่ย้อนสถานะ "ส่งแล้ว"
  {
    const { env, app } = await makeShop();
    await settle();
    const tx = await checkout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
    await app.withMutation('t', async () => {
      app.state.cloudOutbox.push({ id: 'cob-tg', createdAt: Date.now(), dateKeys: [], monthKeys: [], needTelegram: true, telegramMessage: 'x', needSummary: false, tries: 0 });
      await app.saveState();
    });
    const job = app.state.cloudOutbox.find(j => j.id === 'cob-tg');
    const restore = failPutForKeys(['transactions'], 'async');
    env.document.getElementById('edit-tx-id').value = tx.id;
    env.document.getElementById('void-money-outcome').value = 'refunded';
    const pv = app.voidTransaction();
    job.needTelegram = false;   // รอบส่งงานคลาวด์เขียนผลลงงานตัวเดิมระหว่างที่การยกเลิกรอบันทึก
    await pv; await (app._confirmP || Promise.resolve()); await settle(40); restore();
    const now = app.state.cloudOutbox.find(j => j.id === 'cob-tg');
    await t('[R6] ยกเลิกบิลล้มเหลว → งาน Telegram ยังเป็นตัวเดิม สถานะ "ส่งแล้ว" ไม่ถูกย้อน', () => ok(app.state.transactions.includes(tx) && now === job && now.needTelegram === false));
    env.dispose();
  }
  // R7: ไฟล์ภายนอกที่มีบัญชีผู้จัดการใหม่ (ไม่มีในเครื่อง) พร้อม PIN → ไม่รับ PIN จากไฟล์
  {
    const { env, app } = await makeShop();
    await settle();
    const file = clone(app.buildBackupPayload());
    file.staff.push({ id: 'mg-9', name: 'ใหม่', role: 'ผู้จัดการ', accessLevel: 'manager', pin: await app.hashPin('777777') });
    await app.applyBackupData(file, { acceptUnsynced: true }); await settle(20);
    const m = app.state.staff.find(s => s.id === 'mg-9');
    await t('[R7] บัญชีผู้จัดการจากไฟล์ (ไม่มีในเครื่อง) → ไม่มี PIN (ต้องตั้งใหม่)', () => ok(m && !m.pin));
    env.dispose();
  }
  // R8 (Apps Script): แท็บวันเก่าถูกลบไปแล้ว → คำขอรุ่นเก่ายังถูกปฏิเสธจากรหัสที่เก็บไว้
  {
    const dkAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const SUM = (dateKey, rev, gen) => ({ action: 'summary_day', dateKey, generatedAt: gen,
      totalRevenue: rev, cashRevenue: rev, qrRevenue: 0, creditRevenue: 0, billCount: 1, avgBill: rev, totalExpenses: 0, netIncome: rev,
      cashVariance: 0, shiftCount: 0, shiftCash: [], nonVatBase: rev, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
      services: [{ name: '=Spa', count: 1, revenue: rev }], expenses: [], staffCommissions: [{ name: '+Bob', role: '-', count: 1, salesSum: rev, commission: 0 }] });
    const gas = createGasEnv({ keepDailyRetention: true });
    const key = dkAgo(70), t0 = Date.now();
    gas.post(SUM(key, 300, t0 + 2000));
    gas.ctx.SpreadsheetApp.getActiveSpreadsheet().deleteSheet(gas.sheet('สรุป-' + key));
    const older = gas.post(SUM(key, 400, t0 + 1000));
    await t('[R8.1] แท็บวันเก่าถูกลบแล้ว → คำขอรุ่นเก่ายัง STALE_SUMMARY', () => eq(older.code, 'STALE_SUMMARY'));
    // วันที่เขียนตอนอายุ 62 วันพอดี (ยังไม่เลยระยะเก็บ) แล้ววันรุ่งขึ้นแท็บถูกลบ → รหัสรุ่นต้องถูกย้ายไปเก็บก่อนลบ
    const gB = createGasEnv({ keepDailyRetention: true }); const keyB = dkAgo(62);
    gB.post(SUM(keyB, 300, t0 + 2000));
    vm.runInContext('DAILY_SHEET_RETENTION_DAYS = 61', gB.ctx);
    gB.post(SUM(dkAgo(1), 50, t0 + 2100));
    const staleB = gB.post(SUM(keyB, 400, t0 + 1000));
    await t('[R8.3] แท็บถูกลบตามรอบ (เขียนตอนยังไม่เลยระยะ) → รหัสรุ่นถูกเก็บก่อนลบ คำขอเก่ายังถูกปฏิเสธ', () => ok(!gB.sheet('สรุป-' + keyB) && staleB.code === 'STALE_SUMMARY', JSON.stringify(staleB)));
    const g2 = createGasEnv();
    const dk = dkAgo(0);
    g2.post(SUM(dk, 300, Date.now()));
    const cells = g2.sheet('สรุป-' + dk)._grid.flat().map(String);
    await t("[R8.2] ชื่อในตารางสรุป (+Bob / - / =Spa) ไม่มี ' ซ้อนบนชีต", () => ok(cells.includes('+Bob') && cells.includes('=Spa') && !cells.some(c => /^'/.test(c)), JSON.stringify(cells.filter(c => /Bob|Spa|^'/.test(c)))));
  }
}, 240000);

R.done();
})();
