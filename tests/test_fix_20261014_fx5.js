// ตรวจ 14 ต.ค. 2569 — งานแก้ fx5: ข้อ 2 (ยกเลิกบิลที่มีส่วนต่างค้าง) · ข้อ 9 (คืนคิวคลาวด์ตอนบันทึกล้ม) · ข้อ 12 (ตัวตรวจบิล)
// แอปจริง + Dexie จริงบน fake-indexeddb + Apps Script จริงในชีตจำลอง · POS_APP_SRC/POS_GAS_SRC ชี้โค้ดก่อนแก้ → ต้องตก
const fs = require('fs');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok, failPutForKeys } = require('./harness_db');
const { createGasEnv } = require('./gas_env');
const R = makeRunner('--- ตรวจ 14 ต.ค. 2569: fx5 (ข้อ 2 · 9 · 12) ---');
const copy = x => JSON.parse(JSON.stringify(x));
// ไฟล์สำรองจริงของร้าน (อยู่ใน audit/ ที่ไม่ขึ้น repo): POS_REAL_BACKUP หรือไฟล์ pos_backup_*.json ใหม่สุดใน audit/ · ไม่มี = ข้ามข้อนี้
// ผลตรวจ 19 ต.ค. 2569 ข้อ 71: ไม่เขียนชื่อไฟล์/จำนวนบิลจริงของร้านไว้ในไฟล์นี้ (repo สาธารณะ)
const REAL = process.env.POS_REAL_BACKUP || (() => {
  const dir = require('path').join(__dirname, '..', 'audit');
  try { const f = fs.readdirSync(dir).filter(n => /^pos_backup_.*\.json$/.test(n)).sort().pop(); return f ? require('path').join(dir, f) : ''; } catch (e) { return ''; }
})();

async function sale(env, method, amount = 300) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], method, method === 'cash' ? amount : undefined);
  await env.app.processCheckout(); await settle(30);
  return env.app.state.transactions.at(-1);
}
async function editPayment(env, tx, method) {
  env.app.openTransactionEdit(tx.id);
  env.document.getElementById('edit-tx-payment').value = method;
  await env.app.saveTransactionEdit(); await settle(30);
}
async function voidBill(env, tx, outcome) {
  env.app._confirmP = null;
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = outcome;
  await env.app.voidTransaction(); await (env.app._confirmP || settle()); await settle(30);
}
const expected = app => app.computeShiftDrawer(app.state.shift).expected;
const optLabel = (env, app, tx) => {
  const opt = { textContent: '' };
  env.document.getElementById('void-money-outcome').querySelector = (sel) => (/refunded/.test(sel) ? opt : null);
  app.openTransactionEdit(tx.id);
  return opt.textContent;
};

(async () => {
  // ═══ ข้อ 2: ยกเลิกบิลที่แก้ช่องทางแล้ว แต่ยังไม่บันทึกส่วนต่าง ═══
  await R.t('[2.1] บิลโอน→แก้เป็นเงินสด (ส่วนต่างค้าง): ผู้จัดการกดยกเลิก "คืนเงินแล้ว" → ระบบไม่ยอม บิล/ลิ้นชัก/ป้ายค้างอยู่ครบ', async () => {
    const { env, app, toasts } = await makeShop();
    try {
      const tx = await sale(env, 'promptpay');
      await editPayment(env, tx, 'cash');
      eq(app.listUnsettledBills().length, 1, 'control: มีส่วนต่างค้าง');
      loginAs(app, 'manager');
      await voidBill(env, tx, 'refunded');
      ok(app.state.transactions.includes(tx), 'บิลถูกยกเลิกทั้งที่ส่วนต่างยังไม่บันทึก');
      eq(expected(app), 1000);
      eq(app.listUnsettledBills().length, 1, 'ป้ายส่วนต่างค้างหายไป');
      ok(toasts.some(t => /ยังไม่ได้บันทึกส่วนต่าง/.test(t.m)), JSON.stringify(toasts.slice(-2)));
      ok(/ต้องบันทึกส่วนต่าง/.test(env.document.getElementById('void-money-hint').innerText), 'หน้าต่างบิลไม่บอกว่าต้องบันทึกส่วนต่างก่อน');
    } finally { env.dispose(); }
  });

  await R.t('[2.2] ผู้จัดการเดินจบผ่านหน้าจอได้: กดปุ่ม "ตอนขายบันทึกรับเงินผิด" ในกล่องเงินของบิล → ยกเลิก "คืนเงินแล้ว" → ลิ้นชักตรงเงินจริง', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env, 'promptpay');
      await editPayment(env, tx, 'cash');
      loginAs(app, 'manager');
      app.openTransactionEdit(tx.id);
      const box = env.document.getElementById('edit-tx-money-box').innerHTML;
      const call = `app.recordBillSettlementFromBox('${tx.id}','correction')`;
      ok(box.includes(call), 'ไม่มีปุ่ม "ตอนขายบันทึกรับเงินผิด" ให้ผู้จัดการ');
      env.document.getElementById('edit-settle-amount').value = '';
      ok(await app.recordBillSettlementFromBox(tx.id, 'correction'), 'บันทึกส่วนต่างไม่สำเร็จ');
      eq(expected(app), 1300, 'หลังแก้บันทึกตอนขาย ลิ้นชักควรมีเงินสด 300 ของบิลนี้');
      await voidBill(env, tx, 'refunded');
      ok(!app.state.transactions.includes(tx), 'ยกเลิกไม่สำเร็จหลังบันทึกส่วนต่างแล้ว');
      eq(expected(app), 1000, 'คืนเงินสด 300 จริง → ลิ้นชักต้องเหลือ 1000');
    } finally { env.dispose(); }
  });

  await R.t('[2.3] บิลเงินสด→แก้เป็นโอน (ค้าง): ยกเลิกแบบ "ไม่มีเงินเคลื่อนไหว" ก็ไม่ยอม (ลิ้นชักต้องไม่ถูกตัดสินแทนคน)', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env, 'cash');
      await editPayment(env, tx, 'promptpay');
      await voidBill(env, tx, 'none');
      ok(app.state.transactions.includes(tx), 'บิลถูกยกเลิก');
      eq(app.state.shift.cashAdjustments === undefined ? 0 : app.state.shift.cashAdjustments.length, 0, 'มีรายการปรับลิ้นชักเกิดขึ้น');
    } finally { env.dispose(); }
  });

  await R.t('[2.4] ป้ายตัวเลือก "คืนเงิน" ตรงกับกล่องยืนยัน (planVoidCash) · "คืน/เก็บคนละทางไว้แล้ว" ขึ้นเฉพาะบิลที่คืนคนละทางจริง', async () => {
    const { env, app } = await makeShop();
    try {
      // บิลเงินสด → แก้เป็นโอน: กล่องยืนยันบอกไม่กระทบลิ้นชัก → ป้ายต้องไม่บอกว่าเงินออกจากลิ้นชัก
      const a = await sale(env, 'cash');
      await editPayment(env, a, 'promptpay');
      const la = optLabel(env, app, a);
      ok(!/เงินออกจากลิ้นชัก/.test(la), 'ป้ายขัดกับกล่องยืนยัน: ' + la);
      ok(!/คนละทางไว้แล้ว/.test(app.planVoidCash(a, 'refunded').text), 'ข้อความอ้างว่าคืนคนละทางไว้แล้วทั้งที่ไม่เคยบันทึก');
      // บิลเงินสดปกติ
      const b = await sale(env, 'cash');
      // ตรวจ 19 ต.ค. 2569 ข้อ 1: ป้ายใหม่ของบิลเงินสด = "เอาเงินของบิลนี้ออกจากยอดที่ควรมี" (เดิม "…เงินออกจากลิ้นชัก")
      ok(/ออกจากยอดที่ควรมี/.test(optLabel(env, app, b)) && !/ไม่กระทบลิ้นชัก/.test(optLabel(env, app, b)), 'บิลเงินสดปกติ');
      // บิลโอน 500 ลดเป็น 400 แล้วทอนคืนเป็นเงินสด 100 (คนละทางจริง) → ยกเลิกยังบอกว่าคืนคนละทางไว้แล้ว
      const c = await sale(env, 'promptpay', 500);
      app.openTransactionEdit(c.id); env.document.getElementById('edit-tx-discount').value = '100';
      await app.saveTransactionEdit(); await settle(30);
      ok(await app.recordBillSettlement(c.id, 'moved', 'cash'), 'บันทึกคืนเงินสดไม่สำเร็จ');
      ok(/ไม่กระทบลิ้นชัก/.test(optLabel(env, app, c)), 'ป้ายบิลคืนคนละทาง');
      await voidBill(env, c, 'refunded');
      ok(!app.state.transactions.includes(c), 'ยกเลิกบิลที่บันทึกส่วนต่างครบแล้วไม่ได้');
      ok(/คนละทางไว้แล้ว/.test(app._lastConfirmMsg || ''), app._lastConfirmMsg);
    } finally { env.dispose(); }
  });

  // ═══ ข้อ 9: บันทึกล้มระหว่างรอบส่ง Telegram กำลังวิ่ง → ห้ามส่งรายงานปิดกะซ้ำ ═══
  const tgDup = async (which) => {
    let tg = 0, release;
    const gate = new Promise(r => { release = r; });
    const { env, app } = await makeShop({ rows: { telegramToken: '123:abc', telegramChatId: '-100' } });
    try {
      const gasFetch = env.ctx.fetch;
      env.ctx.fetch = async (url, init) => {
        if (/api\.telegram\.org/.test(url)) { tg++; if (tg === 1) await gate; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
        return gasFetch(url, init);
      };
      const tx = await sale(env, 'cash');
      if (which === 'settle') {
        app.openTransactionEdit(tx.id); env.document.getElementById('edit-tx-discount').value = '100';
        await app.saveTransactionEdit(); await settle(50);
        await app.flushCloudOutbox(); await settle(50);
      }
      await app.withMutation('t', async () => {
        app.enqueueShiftCloseCloudOps({ startTime: Date.now() - 5 * 3600e3, endTime: Date.now(), startCash: 1000, countedCash: 1000,
          expectedCash: 1000, cashSales: 0, expenses: [], expensesTotal: 0, difference: 0, closedBy: 'บี' });
        await app.saveState();
      });
      const p = app.flushCloudOutbox();
      await settle(300);
      const before = copy({ name: tx.customerName, s: tx.settlements, outbox: app.state.cloudOutbox.length, shop: app.shopName });
      const restore = failPutForKeys(['transactions'], 'async');
      if (which === 'edit') {
        app.openTransactionEdit(tx.id); env.document.getElementById('edit-tx-customer').value = 'ลูกค้าใหม่';
        await app.saveTransactionEdit();
      } else if (which === 'settle') {
        await app.recordBillSettlement(tx.id, 'waive');
      } else {
        // ช่องอื่นในหน้าตั้งค่า = ค่าปัจจุบัน (เหมือนหน้าจอจริง) · เปลี่ยนแค่ชื่อร้าน
        const set = (id, v) => { env.document.getElementById(id).value = v || ''; };
        set('shop-sheets-sync-url', app.googleSheetsUrl); set('shop-sheets-api-token', app.googleSheetsApiToken);
        set('shop-telegram-token', app.telegramToken); set('shop-telegram-chatid', app.telegramChatId);
        set('shop-promptpay-id', app.shopPromptPayId); set('shop-tagline-input', app.shopTagline);
        set('shop-address-input', app.shopAddress); set('shop-phone-input', app.shopPhone);
        env.document.getElementById('shop-name-input').value = 'ชื่อใหม่';
        await app.saveShopSettings();
      }
      await settle(50); restore();
      eq(JSON.stringify({ name: tx.customerName, s: tx.settlements, outbox: app.state.cloudOutbox.length, shop: app.shopName }), JSON.stringify(before), 'คืนค่าไม่ครบ');
      release(); await p; await settle(200);
      await app.flushCloudOutbox(); await settle(200);
      eq(tg, 1, 'Telegram ปิดกะส่งซ้ำ');
    } finally { release(); env.dispose(); }
  };
  await R.t('[9.1] แก้บิลบันทึกล้ม → คืนคิวลงตัวเดิม · Telegram ไม่ส่งซ้ำ', () => tgDup('edit'));
  await R.t('[9.2] บันทึกเงินส่วนต่างล้ม → คืนคิวลงตัวเดิม · Telegram ไม่ส่งซ้ำ', () => tgDup('settle'));
  await R.t('[9.3] บันทึกการตั้งค่าล้ม → คืนคิวลงตัวเดิม · Telegram ไม่ส่งซ้ำ', () => tgDup('settings'));

  // ═══ ข้อ 12: ตัวตรวจบิลต้องจับบิลผิดรูปจากไฟล์ ═══
  const vatBill = (extra) => Object.assign({ id: 'TX-1790000000000-AAAAAAAA', date: Date.now() - 3600e3, services: ['ตัดผม'], staffNames: ['เอ'],
    subtotal: 100, discount: 0, nonVatBase: 0, vatableBase: 100, vatAmount: 50, rounding: 0, total: 150, paymentMethod: 'cash', syncStatus: 'pending' }, extra || {});
  await R.t('[12.1] กู้ไฟล์ที่มีบิล "มีภาษีขายแต่ไม่มีอัตรา VAT" → บิลถูกแยกไว้ตรวจ ไม่เข้ายอด · ภาษี 0 ไม่มีอัตรายังรับ', async () => {
    const { env, app } = await makeShop();
    try {
      const file = copy(app.buildBackupPayload());
      file.transactions = [vatBill(), vatBill({ id: 'TX-1790000000000-BBBBBBBB', nonVatBase: 100, vatableBase: 0, vatAmount: 0, total: 100 })];
      await app.applyBackupData(file, { acceptUnsynced: true }); await settle(30);
      ok(!app.state.transactions.some(t => t.id === 'TX-1790000000000-AAAAAAAA'), 'บิลภาษีมั่วเข้ายอด');
      ok(app.state.quarantine.some(q => q.id === 'TX-1790000000000-AAAAAAAA'), 'ไม่ถูกแยกไว้ตรวจ');
      ok(app.state.transactions.some(t => t.id === 'TX-1790000000000-BBBBBBBB'), 'บิลภาษี 0 ถูกปฏิเสธ');
    } finally { env.dispose(); }
  });
  await R.t('[12.2] Apps Script ปฏิเสธบิลแบบเดียวกัน (ตรงกับแอป)', async () => {
    const gas = createGasEnv();
    const { env, app } = await makeShop({ gas });
    try {
      const v = gas.ctx.validateBillPayload_(copy(app.buildBillPayload(vatBill())));
      ok(!v.ok, 'ชีตรับบิลภาษีไม่มีอัตรา');
      const v0 = gas.ctx.validateBillPayload_(copy(app.buildBillPayload(vatBill({ nonVatBase: 100, vatableBase: 0, vatAmount: 0, total: 100 }))));
      ok(v0.ok, 'ชีตปฏิเสธบิลภาษี 0: ' + v0.message);
    } finally { env.dispose(); }
  });
  await R.t('[12.3] กู้ไฟล์ที่บิลมีเงินรับตอนขาย 99,999 บนบิล 300 → ลิ้นชักไม่นับ (แจ้งเป็นบิลข้อมูลเสีย)', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env, 'cash');
      const file = copy(app.buildBackupPayload());
      const ft = file.transactions.find(t => t.id === tx.id);
      ft.tender.amount = 99999; ft.tender.received = 99999;
      await app.applyBackupData(file, { acceptUnsynced: true }); await settle(30);
      const d = app.computeShiftDrawer(app.state.shift);
      ok(d.expected < 2000, 'ลิ้นชักคาด ' + d.expected);
      ok(d.invalidBills.includes(tx.id), 'ไม่แจ้งบิลข้อมูลเสีย');
    } finally { env.dispose(); }
  });
  await R.t('[12.4] กู้ไฟล์ที่บิลมีส่วนต่าง "เก็บเงินสด 50,000" → ยกเลิกบิลไม่บันทึกเงินคืนหลักหมื่น · ตัวตรวจแจ้งข้อมูลเสีย', async () => {
    const { env, app } = await makeShop();
    try {
      const tx = await sale(env, 'cash');
      const file = copy(app.buildBackupPayload());
      const ft = file.transactions.find(t => t.id === tx.id);
      ft.date = Date.now() - 2 * 3600e3; ft.tender.shiftStart = 1;   // ขายในกะก่อน
      ft.settlements = [{ id: 'stl-x', kind: 'collect', method: 'cash', amount: 50000, at: Date.now(), by: 'x', shiftStart: null }];
      await app.applyBackupData(file, { acceptUnsynced: true }); await settle(30);
      const cur = app.state.transactions.find(t => t.id === tx.id);
      ok(app.validateBillRecord(cur).some(p => p.code === 'bad-settlement'), 'ตัวตรวจไม่แจ้ง');
      await voidBill(env, cur, 'refunded');
      const adj = (app.state.shift.cashAdjustments || []).filter(a => a.billId === tx.id);
      ok(!adj.some(a => Math.abs(a.amount) > 300), 'บันทึกเงินคืน ' + JSON.stringify(adj));
    } finally { env.dispose(); }
  });
  await R.t('[12.5] ไฟล์สำรองจริงของร้าน (ถ้ามีในเครื่อง) → กฎใหม่ไม่ทำให้บิลจริงใบไหนเสีย/มีข้อสังเกตเพิ่ม', async () => {
    if (!REAL || !fs.existsSync(REAL)) { console.log('    (ข้าม — ไม่มีไฟล์จริงในเครื่องนี้)'); return; }
    const { env, app } = await makeShop();
    try {
      const raw = JSON.parse(fs.readFileSync(REAL, 'utf8'));
      const NEW = ['vat-rate-missing', 'bad-tender', 'bad-settlement'];
      const hit = raw.transactions.filter(t => app.validateBillRecord(t, { rejectFuture: true }).some(p => NEW.includes(p.code)));
      ok(Array.isArray(raw.transactions) && raw.transactions.length > 0, 'ไฟล์จริงไม่มีบิล');
      eq(hit.length, 0, 'บิลจริงโดนกฎใหม่');
      const audit = app.auditBackupData(copy(raw));
      eq(audit.badMoney, 0, 'บิลจริงถูกนับเป็นเงินเสีย');
    } finally { env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
