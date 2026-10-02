// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 12 (2 ต.ค. 2569) — แก้จากผลตรวจรอบ 6 ตามที่เจ้าของเลือก ("ถอดปุ่ม" · รวมขึ้นเว็บรอบเดียวกับ 1.8.2)
//   [1] ปุ่ม "ล้างประวัติยอดขาย" ถอดออก · คำสั่งข้างหลังต้องผ่านด่าน (เจ้าของ → ไม่มีบิลค้างนอกชีต → พิมพ์คำยืนยัน → สำรองขึ้น Drive ก่อน)
//   [2] งานส่งสรุปหลังกู้ข้อมูล: งานละ 1 เดือน · ส่งทีละเดือนต่อรอบ · พลาดเดือนไหนส่งซ้ำแค่เดือนนั้น · สรุปรายวันเฉพาะ 64 วันล่าสุด
//   [4] เพดานค่าใช้จ่ายจากลิ้นชัก 300 บาท: ตรวจซ้ำ ณ จุดบันทึก (กดสองรายการติดกันเร็ว ๆ ต้องไม่หลุดเพดาน)
//   [5] หน้ากู้จาก Drive บอกว่ารายชื่อตัดที่ 50 ไฟล์ล่าสุด และไฟล์เก่ากว่านั้นอยู่ที่ไหน
//   [6] เอกสาร/ข้อความ: ลำดับอัปเดต = Apps Script ก่อน · ข้อความในแอปตรงกับที่ระบบทำจริง
//   [7] เทสต์หน้าจอ responsive/modaltest ต้องส่งผล "ล้มเหลว" ได้จริง
//  (ข้อ 3 การพิมพ์ใบเสร็จ: test_print.js + e2e_batch12.js)
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ในชีตจำลอง)
//  พิสูจน์ว่าจับของจริง: คัดลอกไฟล์นี้ไปรันกับโปรเจกต์ก่อนแก้ (รอบตรวจ 6) → ต้องตก
//  ⚠️ วันที่ในชุดนี้นับจาก "วันนี้" ทั้งหมด (ไม่ผูกกับวันที่ตายตัว — ดู tests/README กับดักตามปฏิทิน)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 12: ผลตรวจรอบ 6 (ปุ่มล้างยอดขาย · สรุปหลังกู้ทีละเดือน · เพดานค่าใช้จ่าย · หน้ากู้ข้อมูล · เอกสาร) ---');
const t = R.t;
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 120000) / 1000) + ' วินาที')), ms || 120000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const DAY = 86400e3;

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
async function sell(env) {
  readyCheckout(env);
  await env.app.processCheckout();
  await settle(50);
  const txs = env.app.state.transactions;
  return txs[txs.length - 1];
}
async function flushSync(app) { await settle(30); await app.syncPendingTransactions(true); await settle(30); }
const driveFiles = (gas) => Object.values(gas.DriveApp._folders).flatMap(f => f._files.filter(x => !x._trashed));
const latestDriveBackup = (gas) => { const a = driveFiles(gas); return a.length ? JSON.parse(a[a.length - 1]._content) : null; };
// บิลที่ผ่านด่านตรวจเงินของแอป/ชีต (รูปแบบเดียวกับ test_batch2_real)
let seq = 0;
function bill(date, total, over) {
  seq++;
  const id = `TX-${String(1757000000000 + seq)}-${String(seq).padStart(8, 'R')}`;
  return Object.assign({ id, date, customerName: 'ลูกค้า', services: ['ตัดผม'],
    details: [{ name: 'ตัดผม', price: total, netPrice: total, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: total / 10, category: 'barber', vatable: false }],
    subtotal: total, discount: 0, vatRate: 7, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total,
    cashReceived: total, cashChange: 0, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, syncStatus: 'synced' }, over || {});
}
const at14 = (daysAgo) => { const d = new Date(Date.now() - daysAgo * DAY); d.setHours(14, 0, 0, 0); return d.getTime(); };
const summaryReqs = (reqs) => reqs.filter(r => r && /^summary_/.test(r.action));
const monthOfReq = (r) => r.monthKey || (r.dateKey && (r.dateKey.slice(5, 7) + '-' + r.dateKey.slice(0, 4)));

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] ปุ่ม "ล้างประวัติยอดขาย" ถอดออก · คำสั่งข้างหลังต้องผ่านด่าน');
// ═══════════════════════════════════════════════════════════════════════════
await t('index.html ไม่มีปุ่มล้างประวัติยอดขาย (เจ้าของเลือกถอดออก)', () => {
  const html = read('index.html');
  ok(!/id="btn-clear-sales"/.test(html), 'ยังมีปุ่ม id="btn-clear-sales"');
  ok(!/onclick="app\.clearSalesData\(\)"/.test(html), 'ยังมีปุ่มที่เรียก app.clearSalesData()');
});
await t('ปุ่ม "ล้างข้อมูลทั้งหมด" (มี 3 ด่าน) ยังอยู่', () => ok(/id="btn-reset-data"/.test(read('index.html'))));

await section('[1-1]', async () => {
  const { env, app, gas, toasts } = await makeShop();
  await settle();
  const b1 = await sell(env), b2 = await sell(env);
  await flushSync(app);
  await t('(เงื่อนไข) ขาย 2 บิลและขึ้นชีตครบแล้ว', () => eq(app.state.transactions.filter(x => x.syncStatus === 'synced').length, 2));
  let prompts = 0, answer = null;
  env.ctx.prompt = () => { prompts++; return answer; };

  answer = null;
  eq(await app.clearSalesData(), false);
  await t('กดยกเลิกช่องพิมพ์ยืนยัน → ไม่ล้าง', async () => eq((await env.raw('transactions')).length, 2));

  answer = 'ลบทั้งหมด';
  eq(await app.clearSalesData(), false);
  await t('พิมพ์คำยืนยันไม่ตรง → ไม่ล้าง · บอกเหตุผล', async () => {
    eq((await env.raw('transactions')).length, 2); ok(toasts.some(x => /ข้อความยืนยันไม่ตรง/.test(x.m))); });

  answer = 'ล้างยอดขาย';
  gas.networkDown = true;
  const r0 = await app.clearSalesData();
  gas.networkDown = false;
  await t('สำรองขึ้น Drive ไม่สำเร็จ → ยกเลิกการล้างทั้งหมด (เดิมไม่สำรองเลย)', async () => {
    eq(r0, false); eq((await env.raw('transactions')).length, 2); ok(toasts.some(x => /สำรองข้อมูลไม่สำเร็จ — ยกเลิกการล้างยอดขาย/.test(x.m))); });

  const filesBefore = driveFiles(gas).length;
  app.openCashCounter = () => {};
  const r1 = await app.clearSalesData(); await settle(40);
  await t('ผ่านทุกด่าน → ล้างยอดขายในเครื่อง (บันทึกลงเครื่องจริง)', async () => {
    eq(r1, true); eq((await env.raw('transactions')).length, 0); eq(((await env.raw('shift')) || {}).history || [], []); });
  await t('ก่อนล้างมีไฟล์สำรองใหม่บน Drive ที่มีบิลครบ (กู้กลับได้)', () => {
    eq(driveFiles(gas).length, filesBefore + 1);
    const f = latestDriveBackup(gas);
    ok([b1.id, b2.id].every(id => f.transactions.some(x => x.id === id)), 'ไฟล์ก่อนล้างไม่มีบิลครบ');
  });
  await t('บิลบนชีตไม่ถูกลบ (ล้างเฉพาะในเครื่อง)', () => {
    const sh = gas.sheet(app.getBusinessMonthKey(b1.date));
    ok(sh && sh._grid.slice(1).some(r => String(r[0]).trim() === b1.id), 'แถวบิลบนชีตหาย');
  });
  env.dispose();
});

await section('[1-2]', async () => {
  const { env, app, gas, toasts } = await makeShop();
  await settle();
  gas.networkDown = true;                 // ขายตอนเน็ตหลุด — บิลค้างอยู่ในเครื่องที่เดียว
  await sell(env); await settle(40);
  gas.networkDown = false;
  let prompts = 0;
  env.ctx.prompt = () => { prompts++; return 'ล้างยอดขาย'; };
  const r = await app.clearSalesData();
  await t('มีบิลที่ยังไม่ขึ้นชีต → ไม่ล้าง และไม่ถามต่อ (บิลพวกนี้มีอยู่ในเครื่องที่เดียว)', async () => {
    eq(r, false); eq(prompts, 0); eq((await env.raw('transactions')).length, 1);
    ok(toasts.some(x => /ยังไม่ขึ้นชีต/.test(x.m)), JSON.stringify(toasts.slice(-2)));
  });
  // ระหว่างรอสำรองขึ้น Drive มีบิลใหม่ที่ยังไม่ขึ้นชีต → ด่าน ณ จุดล้างต้องจับได้
  await flushSync(app);
  app.autoBackupToGoogleDrive = async () => {
    app.state.transactions.push(Object.assign(bill(Date.now(), 300), { syncStatus: 'pending' }));
    return true;
  };
  const r2 = await app.clearSalesData();
  await t('มีบิลใหม่ที่ยังไม่ขึ้นชีตเกิดระหว่างสำรอง → ไม่ล้าง (ตรวจซ้ำ ณ จุดล้างจริง)', async () => {
    eq(r2, false); eq((await env.raw('transactions')).length, 1); });
  env.dispose();
});

await section('[1-3]', async () => {
  const { env, app } = await makeShop({ rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } });
  await settle();
  await sell(env);
  env.ctx.prompt = () => 'ล้างยอดขาย';
  let confirms = 0;
  env.ctx.confirm = () => { confirms++; return false; };
  const r = await app.clearSalesData();
  await t('ร้านที่ไม่ได้ต่อชีต: ถามยืนยันอีกชั้นว่าไม่มีสำเนา · ตอบไม่ = ไม่ล้าง', async () => {
    eq(r, false); eq(confirms, 1); eq((await env.raw('transactions')).length, 1); });
  env.ctx.confirm = () => true;
  app.openCashCounter = () => {};
  const r2 = await app.clearSalesData();
  await t('ตอบยืนยัน = ล้างได้', async () => { eq(r2, true); eq((await env.raw('transactions')).length, 0); });
  env.dispose();
});

for (const role of ['staff', 'manager']) {
  await section('[1-4 ' + role + ']', async () => {
    const { env, app } = await makeShop({ role });
    await settle();
    env.ctx.prompt = () => 'ล้างยอดขาย';
    await t(`${role} เรียกคำสั่งล้างยอดขายตรง ๆ → ไม่ได้`, async () => { eq(await app.clearSalesData(), false); });
    env.dispose();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] เพดานค่าใช้จ่ายจากลิ้นชัก 300 บาท/คน/กะ — ตรวจซ้ำ ณ จุดบันทึก');
// ═══════════════════════════════════════════════════════════════════════════
await section('[4-1]', async () => {
  const { env, app, toasts } = await makeShop({ role: 'staff' });
  await settle();
  const doc = env.document;
  const setForm = (amt, note) => {
    doc.getElementById('expense-type').value = 'other';
    doc.getElementById('expense-amount').value = String(amt);
    doc.getElementById('expense-source').value = 'drawer';
    doc.getElementById('expense-staff-id').value = '';
    doc.getElementById('expense-note').value = note;
  };
  const mineTotal = (list) => (list || []).filter(e => e.byId === 'st-1' && (e.paidFrom || 'drawer') === 'drawer').reduce((s, e) => s + e.amount, 0);
  setForm(250, 'ของใช้ 1'); await app.addExpense(); await settle(30);
  let asked = 0;
  app.approveDrawerExpense = async () => { asked++; return null; };   // ถามแล้วไม่มีใครอนุมัติ
  setForm(40, 'ของใช้ 2'); const p1 = app.addExpense();
  setForm(45, 'ของใช้ 3'); const p2 = app.addExpense();                // พิมพ์รายการถัดไปแล้วกดทันที
  await Promise.all([p1, p2]); await settle(40);
  await t('กดสองรายการ (คนละยอด) ติดกันเร็ว ๆ → ไม่หลุดเพดาน (เดิมได้ 335 โดยไม่มีใครอนุมัติ)', async () => {
    eq(mineTotal(app.state.shift.expenses), 290);
    eq(mineTotal(((await env.raw('shift')) || {}).expenses), 290);
  });
  await t('รายการที่สองบอกเหตุผล และค่าในช่องยังอยู่ให้กดใหม่ (ทั้งยอดและรายละเอียด)', () => {
    ok(toasts.some(x => /เกินเพดานแล้ว/.test(x.m)), JSON.stringify(toasts.slice(-3)));
    eq(doc.getElementById('expense-amount').value, '45');
    // เดิมรายการแรกบันทึกเสร็จแล้วล้างช่องรายละเอียดทิ้งเสมอ — กดใหม่ได้ "ค่าใช้จ่ายอื่นๆ" แทนสิ่งที่พิมพ์ไว้
    eq(doc.getElementById('expense-note').value, 'ของใช้ 3');
  });
  await app.addExpense(); await settle(30);
  await t('กดบันทึกอีกครั้ง → ถามอนุมัติตามปกติ (ไม่อนุมัติ = ไม่บันทึก)', () => { eq(asked, 1); eq(mineTotal(app.state.shift.expenses), 290); });
  app.approveDrawerExpense = async () => { asked++; return { id: 'mg-1', name: 'บี' }; };
  await app.addExpense(); await settle(30);
  await t('ผู้จัดการอนุมัติ → บันทึกได้ พร้อมชื่อผู้อนุมัติและรายละเอียดที่พิมพ์ไว้', () => {
    const e = app.state.shift.expenses.find(x => x.amount === 45);
    ok(e && e.approvedBy === 'บี' && e.note === 'ของใช้ 3', JSON.stringify(e));
  });
  await t('บันทึกสำเร็จแล้วฟอร์มว่างตามปกติ', () => {
    eq(doc.getElementById('expense-amount').value, ''); eq(doc.getElementById('expense-note').value, '');
  });
  // กดรายการเดียวตามปกติ (ไม่มีอะไรซ้อน) → ฟอร์มว่างหลังบันทึกเหมือนเดิม · ยอดเท่ากันแต่รายละเอียดต่าง = รายการถัดไป ไม่ล้างทับ
  app.approveDrawerExpense = async () => ({ id: 'mg-1', name: 'บี' });
  setForm(20, 'ก'); const q1 = app.addExpense();
  setForm(20, 'ข'); await q1; await settle(30);
  await t('ระหว่างบันทึก พิมพ์รายการถัดไปยอดเท่ากันแต่รายละเอียดต่าง → ไม่ถูกล้างทับ', () => {
    eq(doc.getElementById('expense-amount').value, '20'); eq(doc.getElementById('expense-note').value, 'ข');
  });
  env.dispose();
});

await section('[4-2]', async () => {
  const { env, app } = await makeShop({ role: 'owner' });
  await settle();
  const doc = env.document;
  const setForm = (amt, note) => {
    doc.getElementById('expense-type').value = 'other';
    doc.getElementById('expense-amount').value = String(amt);
    doc.getElementById('expense-source').value = 'drawer';
    doc.getElementById('expense-note').value = note;
  };
  setForm(280, 'ก'); const p1 = app.addExpense();
  setForm(290, 'ข'); const p2 = app.addExpense();
  await Promise.all([p1, p2]); await settle(40);
  await t('เจ้าของไม่มีเพดาน — กดติดกันสองรายการได้ครบ (ด่านใหม่ไม่บล็อกงานปกติ)', () => eq(app.state.shift.expenses.length, 2));
  setForm(500, 'ค'); doc.getElementById('expense-source').value = 'other';
  await app.addExpense(); await settle(30);
  await t('ค่าใช้จ่าย "จ่ายทางอื่น" ไม่นับเพดาน (เหมือนเดิม)', () => eq(app.state.shift.expenses.length, 3));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] สรุปหลังกู้ข้อมูล — งานละ 1 เดือน · ส่งทีละเดือน · พลาดเดือนไหนส่งซ้ำแค่เดือนนั้น');
// ═══════════════════════════════════════════════════════════════════════════
await section('[2-1]', async () => {
  // ร้านเปิดมาราว 100 วัน: มีบิลทั้งช่วงใหม่ (ไม่เกิน 64 วัน) และช่วงเก่า
  const daysAgo = [1, 3, 12, 25, 40, 55, 63, 70, 85, 99];
  const bills = daysAgo.map(d => bill(at14(d), 300));
  const src = await makeShop({ rows: { transactions: bills } });
  await settle();
  const file = JSON.parse(JSON.stringify(src.app.buildBackupPayload()));
  // งานสรุปที่ค้างมากับไฟล์ (เช่นงานก้อนใหญ่ของการกู้รอบก่อน) + วันที่ไม่มีบิล (ยกเลิกบิลเดียวของวันไปแล้ว)
  const emptyDay = src.app.getBusinessISODate(at14(2));
  file.pendingCloudWork = { voidDeletes: [],
    summaryDateKeys: bills.map(b => src.app.getBusinessISODate(b.date)).concat([emptyDay]),
    summaryMonthKeys: [...new Set(bills.map(b => src.app.getBusinessMonthKey(b.date)))] };
  src.env.dispose();

  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas });
  await settle();
  const realFlush = Object.getPrototypeOf(app).flushCloudOutbox.bind(app);
  app.resumePendingCloudWork = () => {};
  app.flushCloudOutbox = async () => {};
  await app.applyBackupData(file); await settle(60);
  const jobs = app.state.cloudOutbox.filter(j => j.needSummary);
  const months = [...new Set(bills.map(b => app.getBusinessMonthKey(b.date)))];
  const cutKey = app.getBusinessISODate(Date.now() - 64 * DAY);
  const allDays = [...new Set(bills.map(b => app.getBusinessISODate(b.date)).concat([emptyDay]))];
  const recentDays = allDays.filter(d => d >= cutKey).sort();

  await t('งานสรุปหลังกู้ = งานละ 1 เดือน ครบทุกเดือน (เดิมงานเดียวรวมทุกวัน)', () => {
    ok(jobs.every(j => j.reason === 'restore' && j.monthKeys.length === 1), JSON.stringify(jobs.map(j => j.monthKeys)));
    eq(jobs.map(j => j.monthKeys[0]).sort(), months.slice().sort());
  });
  await t('งานที่ค้างมากับไฟล์ถูกรวมเข้ามา (ไม่เหลือเป็นงานก้อนใหญ่ซ้ำ) · วันที่ไม่มีบิลก็ถูกส่ง', () => {
    eq(app.state.cloudOutbox.filter(j => j.needSummary && j.reason !== 'restore').length, 0);
    ok([].concat(...jobs.map(j => j.dateKeys)).includes(emptyDay), 'ขาดวันที่ค้างมากับไฟล์');
  });
  await t('สรุปรายวันเฉพาะ 64 วันล่าสุด (เก่ากว่านั้นชีตลบแท็บรายวันทิ้งอยู่แล้ว)', () =>
    eq([].concat(...jobs.map(j => j.dateKeys)).sort(), recentDays));
  await t('เรียงเดือนล่าสุดก่อน', () => {
    const ord = mk => mk.slice(3) + mk.slice(0, 2);
    const seen = jobs.map(j => ord(j.monthKeys[0]));
    eq(seen, seen.slice().sort().reverse());
  });

  for (let i = 0; i < 5 && app.state.transactions.some(x => app.isBillAwaitingSync(x)); i++) await flushSync(app);
  const firstMonth = jobs[0].monthKeys[0];
  let b0 = gas.requests.length;
  await realFlush(); await settle(60);
  let sent = summaryReqs(gas.requests.slice(b0));
  await t('รอบแรกส่งแค่เดือนเดียว (เดือนล่าสุด) แล้วปล่อยคิว', () => {
    eq([...new Set(sent.map(monthOfReq))], [firstMonth]);
    eq(sent.length, jobs[0].dateKeys.length + 1);
  });
  await t('ตั้งตัวปลุกไว้ส่งเดือนถัดไปเอง', () => ok(app._cloudRetryTimer, 'ไม่มีตัวปลุก'));

  // ระหว่างนี้ขายบิลใหม่ → ส่งขึ้นชีตได้ทันที ไม่ต้องรอสรุปครบทุกเดือน
  const nb = await sell(env); await flushSync(app);
  await t('บิลที่ขายระหว่างส่งสรุปหลังกู้ ขึ้นชีตได้ก่อนสรุปเดือนที่เหลือ', () => {
    eq(app.state.transactions.find(x => x.id === nb.id).syncStatus, 'synced');
    ok(app.state.cloudOutbox.some(j => j.reason === 'restore' && j.needSummary), 'สรุปส่งหมดแล้ว — เทสต์ไม่ได้พิสูจน์อะไร');
  });

  // เดือนที่สองส่งไม่ผ่าน 1 วัน → รอบถัดไปเดือนอื่นยังเดินต่อ · เดือนนั้นส่งซ้ำแค่เดือนเดียว
  const pending = () => app.state.cloudOutbox.filter(j => j.reason === 'restore' && j.needSummary);
  const second = pending()[0];
  const failDay = second.dateKeys[0];
  const lost = failDay ? gas.lose(b => b && b.action === 'summary_day' && b.dateKey === failDay) : null;
  b0 = gas.requests.length;
  await realFlush(); await settle(60);
  if (lost) lost.stop();
  await t('(เงื่อนไข) เดือนที่สองส่งไม่ผ่าน 1 วัน → เดือนนั้นค้างรอลองใหม่', () => {
    ok(failDay, 'เดือนที่สองไม่มีสรุปรายวัน — ข้อมูลทดสอบผิด');
    ok(second.needSummary && second.retry && second.retry.summary && second.retry.summary.tries === 1, JSON.stringify(second.retry));
  });
  b0 = gas.requests.length;
  await realFlush(); await settle(60);
  sent = summaryReqs(gas.requests.slice(b0));
  await t('รอบถัดไป (เดือนที่พลาดยังไม่ถึงเวลาลองใหม่) → ส่งเดือนอื่นต่อ ไม่ติดอยู่หลังเดือนที่พลาด', () =>
    ok(sent.length > 0 && !sent.some(r => monthOfReq(r) === second.monthKeys[0]), JSON.stringify(sent.map(monthOfReq))));
  // ส่งเดือนอื่นให้หมดก่อน (เดือนที่พลาดยังไม่ถึงเวลาลองใหม่) แล้วค่อยถึงเวลาของเดือนที่พลาด
  for (let i = 0; i < 6 && pending().length; i++) {
    const remaining = pending();
    if (remaining.length === 1 && remaining[0] === second) break;
    await realFlush(); await settle(60);
  }
  await t('(เงื่อนไข) เหลือเฉพาะเดือนที่พลาด', () => { eq(pending().length, 1); eq(pending()[0], second); });
  b0 = gas.requests.length;
  second.retry.summary.nextAt = Date.now() - 1;
  await realFlush(); await settle(60);
  sent = summaryReqs(gas.requests.slice(b0));
  await t('ลองใหม่เดือนที่พลาด = ส่งซ้ำแค่เดือนนั้น (เดิมส่งใหม่ทุกวันตั้งแต่เปิดร้าน)', () => {
    eq([...new Set(sent.map(monthOfReq))], [second.monthKeys[0]]);
    eq(sent.length, second.dateKeys.length + 1);
  });
  for (let i = 0; i < 8 && pending().length; i++) {
    pending().forEach(j => { if (j.retry && j.retry.summary) j.retry.summary.nextAt = Date.now() - 1; });
    await realFlush(); await settle(60);
  }
  await t('ครบทุกเดือนในที่สุด ไม่มีงานค้าง', () => eq(pending().length, 0));
  await t('แท็บสรุปของวันล่าสุดขึ้นชีตแล้ว', () => {
    const dk = app.getBusinessISODate(bills[0].date);
    const sh = gas.sheet('สรุป-' + dk);
    ok(sh, 'ไม่มีแท็บสรุปของวันล่าสุด');
  });
  env.dispose();
});

await section('[2-2]', async () => {
  // ปุ่มย้อนกลับไปก่อนกู้ ก็ใช้งานสรุปแบบรายเดือนเหมือนกัน (ส่งยอดเดิมกลับขึ้นชีต)
  const { env, app, gas } = await makeShop({ rows: { transactions: [bill(at14(2), 300), bill(at14(35), 300)] } });
  await settle();
  const key = gas.setupOwnerKey(); app.askOwnerKey = async () => key;
  app.resumePendingCloudWork = () => {};
  app.flushCloudOutbox = async () => {};
  const older = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  older.transactions = older.transactions.slice(0, 1);   // ไฟล์ที่มีบิลไม่ครบ
  const up = gas.post({ action: 'backup', backupData: older });
  app.restoreFromDriveBackup(up.details.fileId, 'ทดสอบ'); await app._confirmP; await settle(80);   // ทางจริง (ถ่ายสำเนาก่อนกู้)
  await t('(เงื่อนไข) กู้ไฟล์ที่บิลไม่ครบแล้ว เหลือ 1 บิล', () => eq(app.state.transactions.length, 1));
  app.state.cloudOutbox = [];
  await app.saveState();
  await app.undoLastRestore(); await app._confirmP; await settle(80);
  const jobs = app.state.cloudOutbox.filter(j => j.needSummary);
  await t('ย้อนกลับไปก่อนกู้ → มีงานส่งสรุปแบบรายเดือนของงวดที่กระทบ (สรุปบนชีตกลับเป็นยอดเดิมได้)', () => {
    ok(jobs.length >= 1 && jobs.every(j => j.reason === 'restore' && j.monthKeys.length === 1), JSON.stringify(jobs));
    ok([].concat(...jobs.map(j => j.dateKeys)).includes(app.getBusinessISODate(at14(35))), 'ขาดวันของบิลที่หายไปตอนกู้ไฟล์เก่า');
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] หน้ากู้จาก Drive บอกว่ารายชื่อตัดที่ 50 ไฟล์ล่าสุด');
// ═══════════════════════════════════════════════════════════════════════════
await section('[5]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const files = (n) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, name: `pos_backup_${i}.json`, createdAt: Date.now() - i * 3600e3, sizeKB: 900 }));
  app.cloudPost = async () => ({ status: 'success', details: { files: files(50) } });
  await app.loadDriveBackups();
  let html = env.document.getElementById('restore-list').innerHTML;
  await t('ครบ 50 ไฟล์ → บอกว่าแสดงแค่ไฟล์ล่าสุด และไฟล์เก่ากว่านั้นอยู่ที่ไหน', () => {
    ok(/แสดงไฟล์ล่าสุด 50 ไฟล์/.test(html), html.slice(0, 300)); ok(/Erotica_POS_Backups/.test(html)); ok(/นำเข้าข้อมูลสำรอง/.test(html)); });
  await t('รายการไฟล์ยังแสดงครบ 50 ปุ่ม', () => eq((html.match(/class="btn-small secondary restore-item"/g) || []).length, 50));
  app.cloudPost = async () => ({ status: 'success', details: { files: files(3) } });
  await app.loadDriveBackups();
  html = env.document.getElementById('restore-list').innerHTML;
  await t('ไม่ถึง 50 ไฟล์ → ไม่ขึ้นข้อความนี้ (แสดงครบทุกไฟล์อยู่แล้ว)', () => ok(!/แสดงไฟล์ล่าสุด/.test(html)));
  env.dispose();
});
await t('ข้อความหน้าตั้งค่าไม่สัญญาเกินจริง (บอก 50 ไฟล์ ~2 สัปดาห์ + สำรองหลังยกเลิก/แก้บิล)', () => {
  const html = read('index.html');
  ok(!/ปุ่ม "กู้ข้อมูล" ใช้ดึงไฟล์เหล่านั้นกลับมาได้เลย/.test(html), 'ยังมีข้อความเดิมที่สัญญาว่าดึงได้ทุกไฟล์ 90 วัน');
  ok(/แสดงไฟล์ล่าสุด 50 ไฟล์/.test(html), 'ไม่บอกว่าแสดง 50 ไฟล์');
  ok(/2 นาทีหลังยกเลิก\/แก้บิล/.test(html), 'ไม่บอกเรื่องสำรองหลังยกเลิก/แก้บิล');
  ok(!/ระบบจะดาวน์โหลดสำเนาข้อมูลปัจจุบันเก็บไว้ให้ก่อนเสมอ/.test(html), 'กล่องกู้ข้อมูลยังสัญญาว่าดาวน์โหลดสำเนาเสมอ');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] เอกสาร: ลำดับอัปเดต = Apps Script ก่อน (ทุกฉบับตรงกัน)');
// ═══════════════════════════════════════════════════════════════════════════
await t('SYSTEM_OVERVIEW: ลำดับอัปเดต = วาง Apps Script ก่อน แล้วค่อย deploy.bat', () => {
  const s = read('SYSTEM_OVERVIEW.md');
  ok(!/หน้าเว็บก่อน แล้วค่อย Apps Script/.test(s), 'ยังเขียนว่าหน้าเว็บก่อน');
  ok(/วาง Apps Script ก่อน แล้วค่อย `deploy\.bat`/.test(s));
});
await t('หัวไฟล์ Apps Script บอกลำดับปัจจุบัน (หัวข้อรุ่น 1.7 เป็นประวัติ)', () => {
  const g = read('google_apps_script.js').slice(0, 6000);
  ok(/ลำดับอัปเดตปกติ[^\n]*วางโค้ดนี้ใน Apps Script ก่อน/.test(g)); ok(/\(ประวัติ\) อัปเกรดเป็นรุ่น 1\.7/.test(g));
});
await t('คู่มือเริ่มใช้งาน: วาง Apps Script ก่อน deploy (เหมือนเดิม)', () => ok(/ทำ <b>ก่อน<\/b> deploy/.test(read('คู่มือเริ่มใช้งาน.html'))));
await t('SYSTEM_OVERVIEW: กติกาลบค่าใช้จ่ายตรงกับที่เจ้าของเลือก (เดิม "ลบได้ทุกตำแหน่ง")', () => {
  const s = read('SYSTEM_OVERVIEW.md');
  ok(!/ลบได้ทุกตำแหน่ง/.test(s)); ok(/พนักงานลบได้เฉพาะรายการที่ตัวเองลง/.test(s));
});
await t('คู่มือฉุกเฉิน: บอกผลของการกู้ไฟล์ที่เก่ากว่าข้อมูลบนชีต', () => ok(/กู้ไฟล์ที่เก่ากว่าข้อมูลบนชีต/.test(read('วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md'))));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7] เทสต์หน้าจอต้องส่งผลล้มเหลวได้จริง');
// ═══════════════════════════════════════════════════════════════════════════
for (const f of ['responsive.js', 'modaltest.js']) {
  await t(`tests/${f} ส่ง exit 1 เมื่อตารางฟ้อง (เดิมพิมพ์ตารางอย่างเดียว — run-all-ui ขึ้นผ่านเสมอ)`, () => {
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
    ok(/process\.exit\(1\)/.test(s), 'ไม่มีทางออกแบบล้มเหลว');
  });
}

R.done();
})();
