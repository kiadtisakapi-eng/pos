// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 4 (ข้อ 10, 12, 13, 14 + 18) — ตรวจเงินฝั่ง Apps Script · เผยแพร่สรุปแบบกู้ต่อได้
//  · เส้นตายครอบการอ่านเนื้อคำตอบ · คิวงานคลาวด์ถาวรแยกบริการ + ตัวปลุก · ฐานยอดรายบริการ
//  โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ใน vm)
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 4: ตรวจเงิน · เผยแพร่สรุป · timeout · คิวงานคลาวด์ ---');
const t = R.t;
// หัวข้อที่ค้าง (เช่นโค้ดรุ่นก่อนแก้ที่รอเนื้อคำตอบตลอดไป) ต้องนับเป็นไม่ผ่านภายในเวลา ไม่ใช่ทำให้ทั้งไฟล์ค้าง
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
const d = (s) => new Date(s).getTime();
const TX = (o) => Object.assign({ action: 'transaction', id: 'TX-1757600000000-VALIDATE', date: d('2026-09-10T12:00:00+07:00'),
  monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00', customerName: 'x', services: ['a'], staffNames: ['A'],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0 }, o || {});

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[10.1] Apps Script ตรวจเงินเป็นสตางค์ · ชนิดข้อมูล · ช่วงค่า · วันปฏิทินจริง · กติกาบิลรุ่นเก่า');
// ═══════════════════════════════════════════════════════════════════════════
await section('[10.1]', async () => {
  const gas = createGasEnv();
  const code = (o) => gas.post(TX(o)).code || 'OK';
  const cases = [
    ['บิลรุ่นเก่า ราคารวม 100 แต่ยอดสุทธิ 999', { subtotal: 100, total: 999 }, 'INVALID_AMOUNT'],
    ['ยอดเป็นข้อความ "300"', { total: '300', subtotal: '300' }, 'INVALID_AMOUNT'],
    ['ยอดติดลบ', { total: -5, subtotal: -5 }, 'INVALID_AMOUNT'],
    ['ยอดละเอียดเกินสตางค์', { total: 300.001, subtotal: 300.001 }, 'INVALID_AMOUNT'],
    ['ยอดเกินเพดาน 10 ล้าน', { total: 20000000, subtotal: 20000000 }, 'INVALID_AMOUNT'],
    ['ส่วนลดเกินราคา (บิล VAT)', { subtotal: 300, discount: 400, nonVatBase: 0, vatableBase: 0, vatAmount: 0, rounding: 0, total: 0 }, 'INVALID_AMOUNT'],
    ['VAT: 4 ช่องไม่ครบ', { nonVatBase: 300 }, 'INVALID_AMOUNT'],
    ['VAT: ฐานไม่ตรง ราคารวม−ส่วนลด', { nonVatBase: 200, vatableBase: 0, vatAmount: 0, rounding: 0 }, 'INVALID_AMOUNT'],
    ['VAT: ยอดไม่เป็นบาทเต็ม', { subtotal: 300.5, nonVatBase: 300.5, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300.5 }, 'INVALID_AMOUNT'],
    ['VAT: ภาษีไม่ตรงอัตรา', { subtotal: 100, nonVatBase: 0, vatableBase: 100, vatAmount: 9, rounding: 0, vatRate: 7, total: 109 }, 'INVALID_AMOUNT'],
    ['รายการย่อยรวมไม่เท่าราคารวม', { lines: [{ price: 200, netPrice: 200 }] }, 'INVALID_AMOUNT'],
    ['รายการคิด VAT ไม่เท่าฐานภาษี', { subtotal: 100, nonVatBase: 0, vatableBase: 100, vatAmount: 7, rounding: 0, vatRate: 7, total: 107,
      lines: [{ price: 100, netPrice: 100, vatable: false }] }, 'INVALID_AMOUNT'],
    ['ช่องทางจ่ายที่ไม่รู้จัก', { paymentMethod: 'bitcoin' }, 'INVALID_PAYMENT'],
    ['วันที่ไม่มีในปฏิทิน (30 ก.พ.)', { dateTimeStr: '2026-02-30 12:00:00', monthKey: '02-2026' }, 'INVALID_DATE'],
    ['เดือนทำการไม่ตรงวันที่', { monthKey: '08-2026' }, 'INVALID_DATE'],
    ['ตี 3 ของวันที่ 1 ต.ค. ต้องเป็นเดือน 09 ไม่ใช่ 10', { dateTimeStr: '2026-10-01 03:00:00', monthKey: '10-2026', date: d('2026-10-01T03:00:00+07:00') }, 'INVALID_DATE'],
  ];
  for (const [label, o, want] of cases) await t(`${label} → ${want}`, () => eq(code(o), want));
  const okCases = [
    ['บิลรุ่นเก่าปกติ', { id: 'TX-1757600000000-LEGACYOK' }],
    ['บิลรุ่นแรก ส่วนลดเกินราคา ยอด 0 (สูตรเดิม)', { id: 'TX-1757600000000-FREEFREE', subtotal: 300, discount: 500, total: 0 }],
    ['บิลรุ่นแรก ปัดราคาหลังส่วนลดทีละบรรทัด (200.01)', { id: 'TX-1757600000000-ROUNDLIN', subtotal: 300, discount: 100, total: 200,
      lines: [1, 2, 3].map(() => ({ price: 100, netPrice: 66.67 })) }],
    ['ไม่มีช่องทางจ่าย (= เงินสด)', { id: 'TX-1757600000000-NOPAYMNT', paymentMethod: undefined }],
    ['ตี 3 ของวันที่ 1 ต.ค. อยู่เดือน 09 ถูกต้อง', { id: 'TX-1757600000000-CUTOFFOK', dateTimeStr: '2026-10-01 03:00:00', monthKey: '09-2026', date: d('2026-10-01T03:00:00+07:00') }],
    ['แอปรุ่นเก่าไม่ส่ง dateTimeStr/monthKey (คิดเวลาไทยจาก date)', { id: 'TX-1757600000000-OLDCLIEN', dateTimeStr: undefined, monthKey: undefined }],
    ['บิล VAT ครบถ้วน', { id: 'TX-1757600000000-VATVATOK', subtotal: 320, nonVatBase: 300, vatableBase: 20, vatAmount: 1.4, rounding: 0.6, vatRate: 7, total: 322,
      lines: [{ price: 300, netPrice: 300, vatable: false }, { price: 20, netPrice: 20, vatable: true }] }],
  ];
  for (const [label, o] of okCases) await t(`${label} → รับ`, () => eq(code(o), 'OK'));
});

console.log('\n[10.2] บิลจริงจากแอป (สุ่ม 60 ใบ: VAT/ส่วนลด/ช่องทาง/หลายรายการ) ต้องผ่านด่านของ Apps Script ทุกใบ');
await section('[10.2]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const items = [{ id: 's1', name: 'ตัดผม', price: 300, category: 'barber' }, { id: 'd1', name: 'น้ำ', price: 20, category: 'drinks', commission: 0 },
    { id: 's2', name: 'นวด', price: 450, category: 'barber' }, { id: 'd2', name: 'กาแฟ', price: 55, category: 'drinks', commission: 0 }]   // กติกาตัวเลข: ราคา/ส่วนลดเป็นบาทเต็ม;
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 60; i++) {
    const cart = Array.from({ length: 1 + rnd(4) }, () => items[rnd(items.length)]);
    readyCheckout(env, cart, ['cash', 'promptpay', 'credit'][rnd(3)]);
    env.document.getElementById('cart-discount').value = String([0, 0, 10, 33, 99][rnd(5)]);
    if (app.beginCheckoutAttempt) app.beginCheckoutAttempt();
    await app.processCheckout();
  }
  await settle(100); await app.syncPendingTransactions(true); await settle(100);
  const txs = await env.raw('transactions');
  const bad = txs.filter(x => x.syncStatus !== 'synced').map(x => `${x.id}:${x.syncStatus}:${JSON.stringify(x.syncIssue || '')}`);
  await t(`ออกบิลได้ ${txs.length} ใบ และชีตรับครบทุกใบ (ไม่มีใบไหนถูกปฏิเสธผิด ๆ)`, () => { ok(txs.length >= 55, 'บิล ' + txs.length); eq(bad, []); });
  const rejects = gas.requests.filter(r => r && r.action === 'transaction').length - txs.length;
  await t('ไม่มีคำขอที่ถูกปฏิเสธแล้วต้องส่งซ้ำ', () => ok(rejects <= 0, 'ส่งเกิน ' + rejects));
  // สรุปวันจากบิลชุดเดียวกัน ต้องผ่านด่านสรุปของ Apps Script
  const dk = app.getBusinessISODate(txs[0].date);
  const okDay = await app.syncDailySummary(dk, app.state.transactions.filter(x => app.getBusinessISODate(x.date) === dk), [], true);
  await t('สรุปรายวันจากบิลจริง ผ่านด่านตรวจสมการของ Apps Script', () => eq(okDay, true));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[10.3] Apps Script ตรวจสรุป: ช่องทางจ่ายรวม = รายได้ · 4 ช่อง VAT = รายได้ · ค่าใช้จ่ายรวม = รายการ · ชนิดตัวเลข');
// ═══════════════════════════════════════════════════════════════════════════
const SUM = (o) => Object.assign({ action: 'summary_day', dateKey: '2026-09-10', generatedAt: Date.now(),
  totalRevenue: 100, cashRevenue: 100, qrRevenue: 0, creditRevenue: 0, billCount: 1, avgBill: 100,
  totalExpenses: 0, netIncome: 100, cashVariance: 0, shiftCount: 0, shiftCash: [],
  nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
  services: [{ name: 'ตัดผม', count: 1, revenue: 100 }], expenses: [], staffCommissions: [] }, o || {});
await section('[10.3]', async () => {
  const gas = createGasEnv();
  const st = (o) => gas.post(SUM(o)).status;
  await t('รายได้ 100 แต่ช่องทางจ่ายรวม 2,997 → ปฏิเสธ', () => eq(st({ cashRevenue: 999, qrRevenue: 999, creditRevenue: 999 }), 'error'));
  await t('4 ช่อง VAT รวมไม่เท่ารายได้ → ปฏิเสธ', () => eq(st({ nonVatBase: 50 }), 'error'));
  await t('ค่าใช้จ่ายรวมไม่เท่ารายการ → ปฏิเสธ', () => eq(st({ totalExpenses: 500, expenses: [{ note: 'x', amount: 200 }] }), 'error'));
  await t('ตัวเลขเป็นข้อความ → ปฏิเสธ', () => eq(st({ totalRevenue: '100' }), 'error'));
  await t('วันที่ไม่มีจริง (2026-02-30) → ปฏิเสธ', () => eq(st({ dateKey: '2026-02-30' }), 'error'));
  await t('รายการบริการรวมไม่เท่ายอดก่อน VAT → ปฏิเสธ', () => eq(st({ services: [{ name: 'x', count: 1, revenue: 60 }] }), 'error'));
  await t('สรุปที่สอดคล้องกันครบ → รับ', () => eq(st({}), 'success'));
  await t('แท็บสรุปใหม่ไม่มีการเขียนจากคำขอที่ถูกปฏิเสธ (มีแท็บเดียว)', () => eq(gas.sheetNames().filter(n => n === 'สรุป-2026-09-10').length, 1));
});

console.log('\n[10.4 / 18] บิลรุ่นเก่าไม่มีช่องทางจ่าย = เงินสด · ตารางรายบริการรวม = ยอดก่อน VAT แล้วแยก VAT/ปัดเศษ → ยอดรับรวม');
await section('[10.4]', async () => {
  const legacy = { id: 'TX-1757000000000-LEGACYNP', date: d('2026-09-10T12:00:00+07:00'), customerName: 'x', services: ['ตัดผม'],
    subtotal: 200, discount: 0, total: 200, syncStatus: 'synced' };   // ไม่มีช่องทางจ่าย ไม่มีรายการย่อย
  const vatBill = { id: 'TX-1757000000001-VATBILLX', date: d('2026-09-10T13:00:00+07:00'), customerName: 'y', services: ['ตัดผม', 'น้ำ'],
    details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ', commissionAmount: 30, vatable: false, category: 'barber' },
              { name: 'น้ำ', price: 20, netPrice: 20, staffId: 'st-1', staffName: 'เอ', commissionAmount: 0, vatable: true, category: 'drinks' }],
    subtotal: 320, discount: 0, vatRate: 7, nonVatBase: 300, vatableBase: 20, vatAmount: 1.4, rounding: 0.6, total: 322,
    paymentMethod: 'promptpay', staffNames: ['เอ'], syncStatus: 'synced' };
  const { env, app, gas } = await makeShop({ rows: { transactions: [legacy, vatBill] } });
  await settle();
  const p = app.buildSummaryPayload(app.state.transactions, [], 'day', '2026-09-10');
  await t('บิลไม่มีช่องทางจ่ายนับเป็นเงินสด → เงินสด+โอน+บัตร = รายได้รวม', () => {
    eq(p.cashRevenue, 200); eq(p.qrRevenue, 322); eq(p.cashRevenue + p.qrRevenue + p.creditRevenue, p.totalRevenue); });
  const svcSum = p.services.reduce((a, s) => a + s.revenue, 0);
  await t('รายการบริการรวม (ก่อน VAT) = ไม่คิดVAT + คิดVAT', () => eq(Math.round(svcSum * 100), Math.round((p.nonVatBase + p.vatableBase) * 100)));
  const okDay = await app.syncDailySummary('2026-09-10', app.state.transactions, [], true);
  await t('ชีตรับสรุปนี้', () => eq(okDay, true));
  const g = gas.sheet('สรุป-2026-09-10')._grid;
  const rowOf = (label) => g.find(r => String(r[1]) === label);
  await t('แถว "รวมรายการ (ก่อน VAT)" = 520 (ไม่ใช่ 522)', () => eq(rowOf('รวมรายการ (ก่อน VAT)')[3], 520));
  await t('แยกแถว VAT 1.40 และเงินปัดเศษ 0.60 ก่อนยอดรับรวม', () => { eq(rowOf('ภาษีมูลค่าเพิ่ม (VAT)')[3], 1.4); eq(rowOf('เงินปัดเศษ (ปัดขึ้นเต็มบาท)')[3], 0.6); });
  await t('ยอดรับรวม = 522 = รายได้รวม', () => eq(rowOf('ยอดรับรวม')[3], 522));
  // หน้ารายงานในแอปใช้ฐานเดียวกัน
  const bd = app.buildServiceBreakdown(app.summaryBillsOf(app.state.transactions).bills);
  await t('หน้ารายงานในแอป: รวมรายการ 520 · VAT 1.40 · ปัดเศษ 0.60 · ยอดรับรวม 522', () => {
    eq([bd.servicesTotal, bd.vatAmount, bd.rounding, bd.grandTotal], [520, 1.4, 0.6, 522]); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[12] เผยแพร่สรุป: ล้มขั้นไหนก็ได้ แท็บสรุปกับ master ต้องเป็นรุ่นเดียวกันเสมอ');
// ═══════════════════════════════════════════════════════════════════════════
// ค่าในช่อง KPI "รายได้รวม" ของแท็บสรุป (หาจากป้าย ไม่เดาตำแหน่ง)
const kpiOf = (gas) => { const sh = gas.sheet('สรุป-2026-09-10'); if (!sh) return null;
  const i = sh._grid.findIndex(r => r && r[0] === 'รายได้รวม'); return i >= 0 ? sh._grid[i + 1][0] : null; };
const masterRev = (gas) => { const m = gas.sheet('สรุปรายเดือน'); if (!m) return null; const h = m._grid[0]; const c = h.indexOf('รายได้รวม (฿)');
  const r = m._grid.find(x => String(x[h.indexOf('ช่วงเวลา')]) === '2026-09-10'); return r ? r[c] : null; };
const leftovers = (gas) => gas.sheetNames().filter(n => /^__POS_(TMP|OLD)_/.test(n));
async function publishScenario(label, arm, expectPublished) {
  const gas = createGasEnv();
  eq(gas.post(SUM({ generatedAt: 1000 })).status, 'success');           // รุ่นแรก: 100
  const before = { kpi: kpiOf(gas), master: masterRev(gas) };
  arm(gas);
  const r = gas.post(SUM({ generatedAt: 2000, totalRevenue: 250, cashRevenue: 250, nonVatBase: 250, avgBill: 250,
    services: [{ name: 'ตัดผม', count: 1, revenue: 250 }] }));
  Object.keys(gas.faults).forEach(k => delete gas.faults[k]);
  const after = { kpi: kpiOf(gas), master: masterRev(gas) };
  await t(`${label} → ${expectPublished ? 'เผยแพร่ครบ' : 'ไม่เปลี่ยนอะไร'} · แท็บกับ master รุ่นเดียวกัน`, () => {
    eq([before.kpi, before.master], ['฿100.00', 100], 'สภาพก่อนเริ่ม');
    if (expectPublished) { eq(r.status, 'success'); eq([after.kpi, after.master], ['฿250.00', 250]); }
    else { eq(r.status, 'error'); eq(after, before); }
    eq(leftovers(gas), []); ok(!gas.props.POS_SUMMARY_PUBLISH, 'journal ค้าง');
  });
  return gas;
}
await section('[12]', async () => {
  const base = await publishScenario('ไม่มีอะไรพัง (ตัวควบคุม)', () => {}, true);
  await t('(ตัวควบคุม) ก่อนเผยแพร่ แท็บกับ master เป็นรุ่นแรก 100 จริง — การเทียบข้างล่างมีความหมาย', () => ok(base));
  await publishScenario('เขียนแท็บชั่วคราวพัง', (g) => { g.faults.setValue = 40; }, false);
  await publishScenario('เขียน/อ่านรหัสรุ่นพัง', (g) => { g.faults.setValues = 1; }, false);
  await publishScenario('จดบันทึกงาน (journal) ไม่ได้', (g) => { g.faults['setProperty:POS_SUMMARY_PUBLISH'] = true; }, false);
  await publishScenario('เปลี่ยนชื่อแท็บเดิมไม่ได้', (g) => { g.faults.setName = 1; }, false);
  await publishScenario('เปลี่ยนชื่อแท็บใหม่ไม่ได้', (g) => { g.faults.setName = 2; }, false);
  await publishScenario('master โครงเพี้ยน (หัวคอลัมน์ซ้ำ) → ย้อนแท็บกลับ', (g) => {
    const m = g.sheet('สรุปรายเดือน'); m._grid[0].push('รายได้รวม (฿)'); }, false);
  // execution ตายหลังสลับแท็บ ก่อน master เสร็จ และย้อนกลับไม่ได้ → รอบหน้าต้องทำต่อให้จบ
  const gas = createGasEnv();
  gas.post(SUM({ generatedAt: 1000 }));
  gas.sheet('สรุปรายเดือน')._grid[0].push('รายได้รวม (฿)');   // master พัง
  gas.faults.setName = 3;                                       // และสลับแท็บกลับไม่ได้
  const r = gas.post(SUM({ generatedAt: 2000, totalRevenue: 250, cashRevenue: 250, nonVatBase: 250, avgBill: 250, services: [{ name: 'ตัดผม', count: 1, revenue: 250 }] }));
  delete gas.faults.setName;
  await t('(เงื่อนไข) ล้มกลางทางและย้อนไม่ครบ → เหลือบันทึกงานค้างไว้ให้กู้ต่อ', () => { eq(r.status, 'error'); ok(gas.props.POS_SUMMARY_PUBLISH); });
  gas.sheet('สรุปรายเดือน')._grid[0].pop();                     // เจ้าของแก้หัวตารางแล้ว
  const r2 = gas.post(SUM({ generatedAt: 3000, dateKey: '2026-09-11', services: [{ name: 'ตัดผม', count: 1, revenue: 100 }] }));
  await t('คำขอสรุปครั้งถัดไป: กู้งานค้างให้จบก่อน แล้วค่อยทำงานใหม่ → แท็บกับ master ตรงกัน', () => {
    eq(r2.status, 'success'); eq(masterRev(gas), Number(String(kpiOf(gas)).replace(/[฿,]/g, ''))); eq(leftovers(gas), []); ok(!gas.props.POS_SUMMARY_PUBLISH); });
  // รหัสรุ่นบนแท็บอ่านไม่ได้ → หยุด ไม่ทับ
  const g2 = createGasEnv();
  g2.post(SUM({ generatedAt: 1000 }));
  g2.sheet('สรุป-2026-09-10')._grid[0][25] = 'เสีย';
  const r3 = g2.post(SUM({ generatedAt: 2000, totalRevenue: 250, cashRevenue: 250, nonVatBase: 250, avgBill: 250, services: [{ name: 'ตัดผม', count: 1, revenue: 250 }] }));
  await t('รหัสรุ่นของแท็บอ่านไม่ได้ → SUMMARY_VERSION_UNAVAILABLE ไม่เขียนทับ', () => { eq(r3.code, 'SUMMARY_VERSION_UNAVAILABLE'); eq(kpiOf(g2), '฿100.00'); });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[13] เส้นตายต้องครอบถึงตอนอ่านเนื้อคำตอบเสร็จ — เนื้อคำตอบค้างต้องไม่บล็อกคิวคลาวด์');
// ═══════════════════════════════════════════════════════════════════════════
await section('[13]', async () => {
  let calls = 0;
  const hangingFetch = async () => { calls++; return { ok: true, status: 200, headers: {}, json: () => new Promise(() => {}), text: () => new Promise(() => {}) }; };
  const { env, app } = await makeShop();
  await settle();
  env.ctx.fetch = hangingFetch;
  app.cloudTimeoutMs = 80;
  const t0 = Date.now();
  let err = null;
  try { const r = await app.fetchWithTimeout('https://x', {}); await r.json(); } catch (e) { err = e; }
  await t('json() ค้าง → ล้มด้วย "หมดเวลา" ภายในเส้นตาย', () => { ok(err && /หมดเวลา/.test(err.message), err && err.message); ok(Date.now() - t0 < 2000); });
  readyCheckout(env); await app.processCheckout();
  await app.syncPendingTransactions(true);
  await t('รอบซิงก์ที่เนื้อคำตอบค้าง จบได้ และคืนธง isSyncing', () => eq(app.isSyncing, false));
  let ran = false;
  await app.runCloudTask(async () => { ran = true; });
  await t('คิวคลาวด์ไม่ค้าง — งานถัดไปได้ทำ', () => ok(ran));
  await t('บิลยังรอส่ง (ไม่ถูกนับว่าสำเร็จ)', async () => ok((await env.raw('transactions'))[0].syncStatus !== 'synced'));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[14] คิวงานคลาวด์: สำรองหลังปิดกะลองใหม่ได้ · Telegram อย่างเดียวก็ส่งค้างได้ · ตัวนับแยกบริการ · มีตัวปลุก');
// ═══════════════════════════════════════════════════════════════════════════
await section('[14.1]', async () => {
  const { env, app, gas } = await makeShop({ role: 'manager' });
  await settle();
  gas.faults.createFile = true;                                   // Drive ล่มตอนปิดกะ
  app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(150);
  let raw = await env.rawAll();
  await t('ปิดกะแล้ว Drive ล่ม → มีงาน "สำรองข้อมูล" ค้างในคิว (ลงเครื่องจริง)', () => ok(raw.cloudOutbox.some(it => it.needBackup), JSON.stringify(raw.cloudOutbox)));
  await t('สถานะสำรองล่าสุด = ล้มเหลว (บอกตามจริง)', () => eq(raw.backupStatus && raw.backupStatus.lastOk, false));
  delete gas.faults.createFile;
  // ครบเวลาเว้นระยะ → ตัวปลุกเรียกงานต่อ (จำลองเวลาผ่านไปด้วยการเลื่อน nextAt)
  app.state.cloudOutbox.forEach(it => { if (it.retry) Object.values(it.retry).forEach(r => { r.nextAt = Date.now() - 1; }); });
  await app.flushCloudOutbox(); await settle(80);
  raw = await env.rawAll();
  await t('ลองใหม่แล้วสำเร็จ → งานสำรองหายจากคิว และสถานะล่าสุด = สำเร็จ (ตรวจอ่านกลับแล้ว)', () => {
    ok(!raw.cloudOutbox.some(it => it.needBackup)); eq(raw.backupStatus.lastOk, true); eq(raw.backupStatus.lastVerified, true); });
  env.dispose();
});
await section('[14.2]', async () => {
  const sent = [];
  const gas = createGasEnv();
  const fetchTg = (url, init) => /api\.telegram\.org/.test(url)
    ? (sent.push(JSON.parse(init.body).text), Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    : gas.fetch(url, init);
  const { env, app } = await makeShop({ gas, noInit: true, rows: { googleSheetsUrl: '', googleSheetsApiToken: '', telegramToken: '123:ABC', telegramChatId: '-100',
    cloudOutbox: [{ id: 'cob-tg', createdAt: 1, dateKeys: [], monthKeys: [], needSummary: false, needTelegram: true, telegramMessage: 'ปิดกะเมื่อคืน', tries: 0 }] } });
  env.ctx.fetch = fetchTg;
  await app.resumePendingCloudWork(); await settle(80);
  await t('ตั้งเฉพาะ Telegram: ข้อความค้างถูกส่ง (เดิมออกจากงานก่อนถึง Telegram)', () => eq(sent, ['ปิดกะเมื่อคืน']));
  await t('ส่งแล้วงานหายจากคิวในเครื่อง', async () => eq((await env.raw('cloudOutbox')).length, 0));
  env.dispose();
});
await section('[14.3]', async () => {
  let tgCalls = 0;
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas, noInit: true, rows: { telegramToken: '123:ABC', telegramChatId: '-100',
    cloudOutbox: [{ id: 'cob-mix', createdAt: 1, dateKeys: ['2026-09-10'], monthKeys: [], needSummary: true, needTelegram: true, telegramMessage: 'x', tries: 0 }] } });
  env.ctx.fetch = (url, init) => /api\.telegram\.org/.test(url) ? (tgCalls++, Promise.reject(new TypeError('telegram down'))) : gas.fetch(url, init);
  loginAs(app, 'owner');
  const delays = []; const realST = env.ctx.setTimeout;
  env.ctx.setTimeout = (f, ms) => { delays.push(ms); return realST(() => {}, 0); };   // จับเวลาปลุก (ไม่รอจริง)
  await app.flushCloudOutbox(); await settle(60);
  let item = app.state.cloudOutbox[0];
  await t('Telegram ล้ม แต่สรุปส่งสำเร็จในรอบเดียวกัน (ไม่ถูกหน่วงตาม)', () => { eq(item.needSummary, false); eq(item.needTelegram, true); });
  await t('ตัวนับลองใหม่ของ Telegram แยกเก็บ พร้อมเวลาถัดไป', () => { eq(item.retry.telegram.tries, 1); ok(item.retry.telegram.nextAt > Date.now()); });
  await t('ตั้งตัวปลุกไว้ตามเวลาถัดไป (~30 วินาที)', () => ok(delays.some(ms => ms >= 20000 && ms <= 31000), JSON.stringify(delays)));
  await app.flushCloudOutbox(); await settle(30);
  await t('ยังไม่ถึงเวลา → ไม่ยิง Telegram ซ้ำ', () => eq(tgCalls, 1));
  item.retry.telegram.nextAt = Date.now() - 1;
  await app.flushCloudOutbox(); await settle(30);
  await t('ถึงเวลาแล้ว → ลองใหม่', () => eq(tgCalls, 2));
  await t('ตัวนับลงเครื่องจริง (ปิดแอปแล้วไม่เริ่มนับใหม่)', async () => eq((await env.raw('cloudOutbox'))[0].retry.telegram.tries, 2));
  env.ctx.setTimeout = realST;
  env.dispose();
});

// ตัวปลุกต้อง "ทำงานเอง" จริง — ข้อ [14.3] ดูแค่ว่ามีการตั้งเวลา ~30 วิ ซึ่งตัวจับเวลาอื่น (เช่นเส้นตายของ fetch 20 วิ)
// ก็ทำให้ผ่านได้ (พิสูจน์ด้วยการทดสอบกลายพันธุ์: ปิดตัวปลุกทิ้งแล้ว [14.3] ยังผ่าน) — ข้อนี้รอให้ตัวปลุกเรียกงานเองโดยไม่มีใครกดอะไร
await section('[14.4]', async () => {
  let tgCalls = 0;
  const gas = createGasEnv();
  const { env, app } = await makeShop({ gas, noInit: true, rows: { telegramToken: '123:ABC', telegramChatId: '-100',
    cloudOutbox: [{ id: 'cob-wake', createdAt: 1, dateKeys: [], monthKeys: [], needSummary: false, needTelegram: true, telegramMessage: 'x', tries: 0 }] } });
  env.ctx.fetch = (url, init) => /api\.telegram\.org/.test(url)
    ? (tgCalls++, tgCalls === 1 ? Promise.reject(new TypeError('telegram down')) : Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    : gas.fetch(url, init);
  app.cloudRetryDelayMs = () => 1200;   // นโยบายเว้นระยะ (ย่อให้เทสต์ไม่ต้องรอ 30 วิ) — กลไกตั้งเวลาปลุกเป็นของจริง
  await app.flushCloudOutbox(); await settle(50);
  await t('(เงื่อนไข) รอบแรกล้ม งานยังค้าง', () => { eq(tgCalls, 1); eq(app.state.cloudOutbox[0].needTelegram, true); });
  await settle(2600);                   // ไม่มีใครเรียกอะไร — มีแต่ตัวปลุก
  await t('ครบเวลาแล้วตัวปลุกเรียกงานต่อเอง → ส่งสำเร็จ งานหายจากคิวในเครื่อง', async () => {
    eq(tgCalls, 2); eq((await env.raw('cloudOutbox')).length, 0); });
  env.dispose();
});

R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
