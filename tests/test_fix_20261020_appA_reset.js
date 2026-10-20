// ตรวจ 19 ต.ค. 2569 ข้อ 11 · 38 · 57 — ล้างข้อมูลทั้งหมด / ล้างยอดขาย กับงานที่ค้างส่งขึ้นชีต
// app.js จริง + IndexedDB จริง + Apps Script จริงในตัวจำลอง (ทำให้ชีตลบแถว/เขียนบิลไม่ผ่านด้วย gas.faults)
//   ข้อ 11: ต่อชีตไว้ + มีบิลยังไม่ขึ้นชีต/คำสั่งลบแถวค้าง → ล้างข้อมูลทั้งหมดต้องปฏิเสธ (เดิมล้างเงียบ ชีตเพี้ยนถาวร)
//   ข้อ 38: สำรองก่อนล้างไม่ผ่าน → บอกเหตุจริง (เครื่องรอง / ตั้งค่าไม่ครบ / เน็ต) ไม่ใช่ "ลองใหม่เมื่อเน็ตพร้อม" ทุกครั้ง
//   ข้อ 57: ล้างยอดขายตอนมีคำสั่งลบแถวค้าง → ปฏิเสธ · บันทึกล้มแล้วคืนคิวงานคลาวด์ด้วยตัวเดิม (ไม่ใช่สำเนาลึก)
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_reset.js
process.env.TZ = 'Asia/Bangkok';
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, createGasEnv, readyCheckout, settle } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 11 · 38 · 57: ล้างข้อมูลกับงานค้างส่ง ---');

async function shop(gas, opts) {
  const s = await makeShop(Object.assign({ gas, onLine: true, noInit: true }, opts));
  s.app.scheduleCloudRetry = () => {};          // งานรอในคิว (เหมือนช่วงรอลองใหม่)
  s.app.resumePendingCloudWork = () => {};
  return s;
}
async function sale(s, price) {
  readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price);
  const r = await s.app.processCheckout(); await settle(30); await s.app._cloudChain;
  return r ? s.app.state.transactions[s.app.state.transactions.length - 1] : null;
}
async function voidBill(s, tx) {
  s.env.document.getElementById('edit-tx-id').value = tx.id;
  s.env.document.getElementById('void-money-outcome').value = 'refunded';
  await s.app.voidTransaction(); await s.app._confirmP; await settle(30);
}
const driveFiles = (g) => Object.values(g.DriveApp._folders).reduce((n, f) => n + f._files.length, 0);

(async () => {
  await R.t('ข้อ 11 บิลยังไม่ขึ้นชีต + คำสั่งลบแถวบิลที่ยกเลิกค้าง → ไม่ล้าง ไม่ถามยืนยัน ไม่สำรอง · บอกว่าค้างอะไร/ทำอะไร', async () => {
    const g = createGasEnv();
    const s = await shop(g, { rows: { vatEnabled: false } });
    try {
      const x = await sale(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      g.faults.deleteRow = true;
      await voidBill(s, x); await s.app.flushCloudOutbox(); await settle(30);
      g.faults.appendRow = true;
      const y = await sale(s, 500); await s.app.syncPendingTransactions(true); await settle(30);
      delete g.faults.deleteRow; delete g.faults.appendRow;
      eq(y.syncStatus === 'synced', false, '(เงื่อนไข) บิล Y ยังไม่ขึ้นชีต');
      ok(s.app.state.cloudOutbox.some(j => j.needVoidDelete), '(เงื่อนไข) คำสั่งลบแถวค้าง');
      let prompts = 0; s.env.ctx.prompt = () => { prompts++; return 'ลบทั้งหมด'; };
      const files = driveFiles(g);
      s.toasts.length = 0;
      await s.app.resetData(); await settle(30);
      eq(prompts, 0, 'ไม่ถามยืนยัน');
      eq(driveFiles(g), files, 'ไม่สำรอง');
      eq(((await s.env.raw('transactions')) || []).map(t => t.total), [500], 'ข้อมูลยังอยู่');
      ok(s.app.state.cloudOutbox.some(j => j.needVoidDelete), 'คำสั่งลบแถวยังอยู่');
      const msg = s.toasts.map(t => t.m).join(' | ');
      ok(/บิล 1 ใบที่ยังไม่ขึ้นชีต/.test(msg) && /คำสั่งลบแถวบิลที่ยกเลิก 1 รายการ/.test(msg) && /ป้ายสถานะคลาวด์/.test(msg), msg);
      // ส่งงานค้างครบแล้ว → ล้างได้ตามเดิม
      s.app.state.cloudOutbox.forEach(j => { delete j.retry; });
      await s.app.flushCloudOutbox(); await s.app.syncPendingTransactions(true); await settle(50);
      eq(s.app.state.transactions.every(t => t.syncStatus === 'synced'), true, '(เงื่อนไข) ส่งครบ');
      eq(s.app.state.cloudOutbox.some(j => j.needVoidDelete), false);
      eq(await s.app.resetData(), true, 'ส่งครบแล้วล้างได้');
      eq(((await s.env.raw('transactions')) || []).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 11 ร้านที่ไม่ได้ต่อชีต: ด่านงานค้างไม่ขวาง (ไม่มีอะไรต้องส่ง) — ล้างได้ตามขั้นเดิม', async () => {
    const s = await shop(createGasEnv(), { rows: { vatEnabled: false, googleSheetsUrl: '', googleSheetsApiToken: '' } });
    try {
      await sale(s, 300);
      s.env.ctx.prompt = () => 'ลบทั้งหมด'; s.env.ctx.confirm = () => true;
      eq(await s.app.resetData(), true);
      eq(((await s.env.raw('transactions')) || []).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 38 เครื่องรอง: สำรองถูกปฏิเสธ → ข้อความล้างข้อมูลบอกว่า "ไม่ใช่เครื่องหลัก" ไม่ใช่ "ลองใหม่เมื่อเน็ตพร้อม"', async () => {
    const g = createGasEnv();
    const A = await makeShop({ gas: g });
    const B = await makeShop({ gas: g });
    try {
      eq(!!(B.app.primaryStatus && B.app.primaryStatus.isPrimary), false, '(เงื่อนไข) B เป็นเครื่องรอง');
      B.env.ctx.prompt = () => 'ลบทั้งหมด';
      await B.app.resetData(); await settle(30);
      const t = B.toasts.filter(x => /ยกเลิกการรีเซ็ต/.test(x.m)).map(x => x.m).join('');
      ok(/สาเหตุ: เครื่องนี้ไม่ใช่เครื่องหลัก/.test(t) && !/ลองใหม่เมื่อเน็ตพร้อม/.test(t), t);
    } finally { A.env.dispose(); B.env.dispose(); }
  });
  await R.t('ข้อ 38 ใส่ URL ชีตแต่ยังไม่ใส่รหัสเชื่อมต่อ → บอกให้กรอกรหัสเชื่อมต่อ', async () => {
    const C = await makeShop({ gas: createGasEnv(), rows: { googleSheetsApiToken: '' }, unknownPrimary: true });
    try {
      C.env.ctx.prompt = () => 'ลบทั้งหมด';
      await C.app.resetData(); await settle(30);
      const t = C.toasts.filter(x => /ยกเลิกการรีเซ็ต/.test(x.m)).map(x => x.m).join('');
      ok(/สาเหตุ: .*รหัสเชื่อมต่อ/.test(t) && !/ลองใหม่เมื่อเน็ตพร้อม/.test(t), t);
    } finally { C.env.dispose(); }
  });
  await R.t('ข้อ 38 เน็ตหลุดตอนสำรองก่อนล้างยอดขาย → "สาเหตุ: ต่อเน็ตไม่ได้"', async () => {
    const g = createGasEnv();
    const s = await shop(g, { rows: { vatEnabled: false } });
    try {
      await sale(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      s.env.ctx.prompt = () => 'ล้างยอดขาย';
      g.networkDown = true;
      eq(await s.app.clearSalesData(), false);
      g.networkDown = false;
      const t = s.toasts.filter(x => /ยกเลิกการล้างยอดขาย/.test(x.m)).map(x => x.m).join('');
      ok(/สาเหตุ: ต่อเน็ตไม่ได้/.test(t), t);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 57 ล้างยอดขายตอนคำสั่งลบแถวบิลที่ยกเลิกยังค้าง → ปฏิเสธ (เดิมล้างแล้วตัดงานส่งสรุปทิ้ง สรุปบนชีตยังนับบิลที่ลบ)', async () => {
    const g = createGasEnv();
    const s = await shop(g, { rows: { vatEnabled: false } });
    try {
      const x = await sale(s, 300); await sale(s, 200);
      await s.app.syncPendingTransactions(true); await settle(30);
      g.faults.deleteRow = true;
      await voidBill(s, x); await s.app.flushCloudOutbox(); await settle(30);
      delete g.faults.deleteRow;
      ok(s.app.state.cloudOutbox.some(j => j.needVoidDelete), '(เงื่อนไข) คำสั่งลบแถวค้าง');
      let prompts = 0; s.env.ctx.prompt = () => { prompts++; return 'ล้างยอดขาย'; };
      eq(await s.app.clearSalesData(), false);
      eq(prompts, 0);
      eq(((await s.env.raw('transactions')) || []).map(t => t.total), [200]);
      ok(s.app.state.cloudOutbox.some(j => j.needVoidDelete && j.needSummary), 'งานลบแถว + ส่งสรุปใหม่ยังอยู่ครบ');
      ok(s.toasts.some(t => /คำสั่งลบแถวบิลที่ยกเลิก 1 รายการ/.test(t.m)));
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ 57/26 ล้างยอดขายแล้วบันทึกลงเครื่องไม่สำเร็จ → คืนคิวงานคลาวด์ "ตัวเดิม" (ผลที่รอบส่งเขียนระหว่างนั้นไม่หาย · Telegram ไม่ส่งซ้ำ)', async () => {
    const g = createGasEnv();
    const s = await shop(g, { rows: { vatEnabled: false } });
    try {
      await sale(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const job = { id: 'cob-tg', createdAt: Date.now(), dateKeys: [], monthKeys: [], needSummary: false, needBackup: false,
        needTelegram: true, telegramMessage: 'รายงานปิดกะ', tries: 0 };
      s.app.state.cloudOutbox = [job];
      s.env.ctx.prompt = () => 'ล้างยอดขาย';
      // ระหว่างบันทึก: รอบส่งที่วิ่งอยู่ส่ง Telegram สำเร็จแล้วเขียนผลลงงานตัวเดิม · จากนั้นเขียนเครื่องล้ม
      const P = Object.getPrototypeOf(s.app);
      // (สำรองก่อนล้างใช้ saveKeys — ไม่โดนตัวจำลองนี้ · การล้างยอดขายใช้ saveState)
      let saves = 0;
      s.app.saveState = async function () { saves++; job.needTelegram = false; return false; };
      eq(await s.app.clearSalesData(), false);
      s.app.saveState = P.saveState;
      eq(saves, 1, '(เงื่อนไข) ถึงขั้นบันทึกการล้างจริง');
      eq(s.app.state.transactions.length, 1, 'ยอดขายคืนครบ');
      ok(s.app.state.cloudOutbox[0] === job, 'คิวงานต้องเป็นงานตัวเดิม (ไม่ใช่สำเนาลึก)');
      eq(s.app.state.cloudOutbox[0].needTelegram, false, 'ผลส่ง Telegram ต้องไม่ถูกคืนเป็น "ยังไม่ส่ง" (ไม่งั้นส่งซ้ำ)');
    } finally { s.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
