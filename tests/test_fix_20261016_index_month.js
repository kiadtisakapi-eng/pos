// แก้ 16 ต.ค. 2569 — ช่อง "เดือน" ของ _POS_BILL_INDEX ที่ชีตจริงแปลงเป็นวันที่ (B899 = 01/10/2026)
// เดิม: ส่งบิลซ้ำ/แก้บิลย้อนหลัง → CROSS_MONTH_BILL_ID "เลขบิลนี้ผูกกับเดือนอื่นแล้ว" ทั้งที่อยู่เดือนเดียวกัน (บิลค้างรอตรวจถาวร)
// ตอนนี้: อ่านช่องนั้นเป็น "MM-yyyy" ด้วยเขตเวลาของไฟล์ชีตเสมอ
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- แก้ 16 ต.ค. 2569: เดือนในทะเบียนเลขบิลถูกชีตแปลงเป็นวันที่ ---');
const t = R.t;

async function sale(env, amount = 750) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], 'cash', amount);
  await env.app.processCheckout();
  await settle(25);
  return env.app.state.transactions.at(-1);
}
// แปลงช่องเดือนในทะเบียนเป็น Date แบบที่ชีตจริงทำ (วันที่ 1 ของเดือน 00:00 เวลาไทย)
function dateifyIndexMonth(gas, id) {
  const ix = gas.sheet('_POS_BILL_INDEX')._grid;
  const k = ix.findIndex(r => r[0] === id);
  const [m, y] = String(ix[k][1]).split('-').map(Number);
  ix[k][1] = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600e3);
  return ix[k][1];
}

(async () => {
  await t('[1] ส่งบิลเดิมซ้ำหลังช่องเดือนถูกแปลงเป็นวันที่ → ไม่ขึ้น "ผูกกับเดือนอื่น" · บิลกลับเป็นซิงก์แล้ว', async () => {
    const { env, app, gas } = await makeShop();
    try {
      await settle();
      const tx = await sale(env); await app.syncPendingTransactions(true); await settle(40);
      eq(tx.syncStatus, 'synced', 'control: first upload');
      ok(dateifyIndexMonth(gas, tx.id) instanceof Date, 'control: cell is Date');
      tx.syncStatus = 'pending'; await app.saveState();
      await app.syncPendingTransactions(true); await settle(40);
      const issue = (app.state.syncIssues || {})[tx.id] || tx.syncIssue;
      ok(!(issue && issue.code === 'CROSS_MONTH_BILL_ID'), 'got CROSS_MONTH_BILL_ID: ' + JSON.stringify(issue));
      eq(tx.syncStatus, 'synced', 'bill should be synced again');
    } finally { env.dispose && env.dispose(); }
  });
  await t('[2] อ่านเดือนจากช่องวันที่ได้ "MM-yyyy" ตรงตัว ทั้งข้อความและ Date', async () => {
    const { env, gas } = await makeShop();
    try {
      const f = gas.ctx.billIndexMonth_;
      eq(f('10-2026', gas.ss), '10-2026', 'text');
      eq(f(new Date(Date.UTC(2026, 9, 1) - 7 * 3600e3), gas.ss), '10-2026', 'Date Oct');
      eq(f(new Date(Date.UTC(2026, 0, 1) - 7 * 3600e3), gas.ss), '01-2026', 'Date Jan (ขอบปี)');
    } finally { env.dispose && env.dispose(); }
  });
  R.done && R.done();
})();
