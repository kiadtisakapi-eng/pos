// แก้ตามรายงานตรวจ 14 ต.ค. 2569 ข้อ 6 + ข้อ 11 (Apps Script) — แอปจริง + Dexie จริง + Apps Script จริงในชีตจำลอง
//   ข้อ 6: ยกเลิกบิลที่แถวอยู่คนละแท็บกับเดือนทำการ (Apps Script รุ่นก่อน monthKey เขียนตามเดือนปฏิทิน)
//          เดิมชีตตอบ NOT_FOUND → แอปถือว่าลบแล้ว แถวค้างถาวร · checkBillIndexUpgrade นับแถวแบบนี้ให้เจ้าของเห็น
//   ข้อ 11: ทะเบียนยกเลิกเสีย (แท็บ _POS_VOID_ARCHIVE หัวคอลัมน์เพี้ยน / ค่าของบิลเดียวเสีย)
//          เดิมตอบ REGISTRY_UNAVAILABLE "ชั่วคราว ระบบจะลองใหม่เอง" ตลอดไป — ตอนนี้ REGISTRY_CORRUPT พร้อมสาเหตุ
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- แก้ตามรายงาน 14 ต.ค. 2569 ข้อ 6 / ข้อ 11 (fx7) ---');
const t = R.t;

async function sale(env, amount = 500) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], 'cash', amount);
  await env.app.processCheckout();
  await settle(25);
  return env.app.state.transactions.at(-1);
}
async function voidBill(env, tx) {
  env.document.getElementById('edit-tx-id').value = tx.id;
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await env.app.voidTransaction();
  await (env.app._confirmP || Promise.resolve());
  await settle(40);
  await env.app.flushCloudOutbox(); await settle(40);
}
const nextMonth = (mk) => { const [m, y] = mk.split('-').map(Number); return m === 12 ? '01-' + (y + 1) : String(m + 1).padStart(2, '0') + '-' + y; };
const rowsOf = (gas, name, id) => (gas.sheet(name) ? gas.sheet(name)._grid.slice(1).filter(r => String(r[0]).trim() === id) : []);
// ย้ายแถวบิลไปแท็บเดือนอื่น (สภาพที่ Apps Script รุ่นก่อน monthKey ทิ้งไว้) · index: 'move' = ทะเบียนจดเดือนใหม่ · 'drop' = ไม่มีในทะเบียน
function moveRow(gas, id, from, to, index) {
  const src = gas.sheet(from), head = src._grid[0].slice();
  let dst = gas.sheet(to);
  if (!dst) { dst = gas.ss.insertSheet(to); dst.appendRow(head); }
  const i = src._grid.findIndex((r, k) => k > 0 && String(r[0]).trim() === id);
  const row = src._grid.splice(i, 1)[0];
  dst._grid.push(row);
  const ix = gas.sheet('_POS_BILL_INDEX')._grid;
  const k = ix.findIndex(r => r[0] === id);
  if (index === 'move') ix[k][1] = to; else if (index === 'drop') ix.splice(k, 1);
}

(async () => {
  // ═══ ข้อ 6 ═══
  await t('[6.1] ยกเลิกบิลที่แถวอยู่แท็บเดือนอื่น (ทะเบียนจดเดือนจริง) → แถวถูกลบจากแท็บนั้น ไม่ค้าง', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(tx.date), other = nextMonth(mk);
      eq(rowsOf(gas, mk, tx.id).length, 1, 'control: row uploaded');
      moveRow(gas, tx.id, mk, other, 'move');
      await voidBill(env, tx);
      eq(rowsOf(gas, other, tx.id).length, 0, 'voided bill row still on sheet in ' + other);
      ok(!app.state.cloudOutbox.some(j => j.needVoidDelete), 'void job left');
    } finally { env.dispose && env.dispose(); }
  });
  await t('[6.2] ไม่มีในทะเบียน → ไล่หาเดือนข้างเคียงแล้วลบได้', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(tx.date), other = nextMonth(mk);
      moveRow(gas, tx.id, mk, other, 'drop');
      await voidBill(env, tx);
      eq(rowsOf(gas, other, tx.id).length, 0, 'row still in adjacent month');
    } finally { env.dispose && env.dispose(); }
  });
  await t('[6.3] เลขบิลมีแถวสองแท็บ → DUPLICATE_BILL_ID ไม่ลบแถวใด · แอปเก็บงานลบไว้', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(tx.date), other = nextMonth(mk);
      const copyRow = gas.sheet(mk)._grid.find(r => String(r[0]).trim() === tx.id).slice();
      const dst = gas.ss.insertSheet(other); dst.appendRow(gas.sheet(mk)._grid[0].slice()); dst._grid.push(copyRow);
      const r = gas.post({ action: 'void_transaction', id: tx.id, monthKey: mk, voidedAt: Date.now() });
      eq(r.code, 'DUPLICATE_BILL_ID', JSON.stringify(r));
      eq([rowsOf(gas, mk, tx.id).length, rowsOf(gas, other, tx.id).length], [1, 1], 'a row was deleted');
    } finally { env.dispose && env.dispose(); }
  });
  await t('[6.4] แท็บตามทะเบียนหัวตารางผิด → SCHEMA_MISMATCH (ไม่ลบ) · แท็บข้างเคียงหัวผิดที่ไม่เกี่ยว ไม่ขวางการลบปกติ', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const a = await sale(env), b = await sale(env, 300);
      await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(a.date), other = nextMonth(mk);
      moveRow(gas, a.id, mk, other, 'move');
      gas.sheet(other)._grid[0][3] = 'แก้หัวเอง';
      const r1 = gas.post({ action: 'void_transaction', id: a.id, monthKey: mk, voidedAt: Date.now() });
      eq([r1.code, rowsOf(gas, other, a.id).length], ['SCHEMA_MISMATCH', 1], JSON.stringify(r1));
      const r2 = gas.post({ action: 'void_transaction', id: b.id, monthKey: mk, voidedAt: Date.now() });
      eq([r2.status, rowsOf(gas, mk, b.id).length], ['success', 0], JSON.stringify(r2));
    } finally { env.dispose && env.dispose(); }
  });
  await t('[6.5] checkBillIndexUpgrade นับแถวที่อยู่คนละแท็บกับเดือนทำการ (ข้อความไทยใน Logger)', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await sale(env, 200); await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(tx.date), other = nextMonth(mk);
      moveRow(gas, tx.id, mk, other, 'move');
      const before = gas.logs.length;
      const out = gas.ctx.checkBillIndexUpgrade();
      eq(out.monthMismatchCount, 1, JSON.stringify(out.monthMismatch));
      const text = gas.logs.slice(before).join('\n');
      ok(/แถวบิลที่อยู่คนละแท็บกับเดือนทำการ \(ตัดวันตี 6\): 1 แถว/.test(text) && text.includes(tx.id) && text.includes('ควรเป็น ' + mk), text);
    } finally { env.dispose && env.dispose(); }
  });

  // ═══ ข้อ 11 ═══
  await t('[11.1] แท็บ _POS_VOID_ARCHIVE หัวคอลัมน์เพี้ยน → ชีตตอบ REGISTRY_CORRUPT · แอปหยุดรอบและบอกสาเหตุจริง (ไม่ใช่ "ชั่วคราว")', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const a = gas.ss.insertSheet('_POS_VOID_ARCHIVE'); a.appendRow(['id', 'voidedAt', 'restoredAt ']);
      await sale(env); await sale(env, 300); await sale(env, 200);
      const n0 = gas.requests.length;
      await app.syncPendingTransactions(true); await settle(40);
      const sent = gas.requests.slice(n0).filter(q => q && q.action === 'transaction');
      eq(sent.length, 1, 'config-level error should stop the round after the first bill');
      ok(app.state.transactions.every(x => x.syncStatus !== 'synced'), 'bill marked synced');
      const e = app._lastSyncError || {};
      ok(e.config === true && /ทะเบียนบิลที่ยกเลิกบนชีตเสีย/.test(e.message) && /_POS_VOID_ARCHIVE/.test(e.message) && !/ชั่วคราว/.test(e.message), JSON.stringify(e));
    } finally { env.dispose && env.dispose(); }
  });
  await t('[11.2] ค่าทะเบียนของบิลเดียวเสีย → REGISTRY_CORRUPT scope=bill · บิลอื่นส่งต่อได้ · บิลนั้นค้างพร้อมเหตุผล', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      gas.networkDown = true;   // ขายตอนเน็ตหลุด — บิลค้างรอส่ง
      const bad = await sale(env), good1 = await sale(env, 300), good2 = await sale(env, 200);
      gas.props['POSVB_' + bad.id] = JSON.stringify({ invalidLegacy: 'abc', v: null, r: null });
      gas.networkDown = false;
      await app.syncPendingTransactions(true); await settle(40);
      eq([bad.syncStatus, good1.syncStatus, good2.syncStatus], ['pending', 'synced', 'synced']);
      const real = JSON.parse(JSON.stringify(app.buildBillPayload(bad)));
      const r2 = gas.post(real);
      eq([r2.code, r2.details && r2.details.scope], ['REGISTRY_CORRUPT', 'bill'], JSON.stringify(r2));
      ok(/ทะเบียนบิลที่ยกเลิกบนชีตเสีย/.test(String(app._lastSyncError && app._lastSyncError.message)), JSON.stringify(app._lastSyncError));
    } finally { env.dispose && env.dispose(); }
  });
  await t('[11.3] Apps Script รุ่นเก่าที่ตอบ REGISTRY_UNAVAILABLE ยังเป็น "ชั่วคราว" เหมือนเดิม', async () => {
    const { env, app } = await makeShop();
    try {
      eq(app.cloudErrorLevel({ status: 'error', code: 'REGISTRY_UNAVAILABLE', message: 'ตรวจทะเบียนบิลที่ยกเลิกไม่ได้ชั่วคราว' }), 'transient');
      eq(app.cloudErrorLevel({ status: 'error', code: 'REGISTRY_CORRUPT', message: 'x', details: { scope: 'all' } }), 'config');
      eq(app.cloudErrorLevel({ status: 'error', code: 'REGISTRY_CORRUPT', message: 'x', details: { scope: 'bill' } }), '');
    } finally { env.dispose && env.dispose(); }
  });
  await t('[11.4] ยกเลิกบิลตอนทะเบียนเสีย → REGISTRY_CORRUPT (ไม่ลบแถว) · ทะเบียนชั่วคราวล่มยังได้ REGISTRY_UNAVAILABLE', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await app.syncPendingTransactions(true); await settle(40);
      const mk = app.getBusinessMonthKey(tx.date);
      const a = gas.ss.insertSheet('_POS_VOID_ARCHIVE'); a.appendRow(['id', 'voidedAt']);
      const r = gas.post({ action: 'void_transaction', id: tx.id, monthKey: mk, voidedAt: Date.now() });
      eq([r.code, r.details && r.details.scope, rowsOf(gas, mk, tx.id).length], ['REGISTRY_CORRUPT', 'all', 1], JSON.stringify(r));
      gas.ss.deleteSheet(a);
      gas.faults['getProperty:POSVB_' + tx.id] = 1;
      const r2 = gas.post({ action: 'void_transaction', id: tx.id, monthKey: mk, voidedAt: Date.now() });
      eq(r2.code, 'REGISTRY_UNAVAILABLE', JSON.stringify(r2));
    } finally { env.dispose && env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
