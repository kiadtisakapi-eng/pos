// ─────────────────────────────────────────────────────────────────────────────
//  แบ่งจ่าย (เงินสด + บัตร) + ค่าธรรมเนียมบัตร — เจ้าของสั่ง 6 ต.ค. 2569
//   กติกาที่เจ้าของเลือก:
//    · ค่าธรรมเนียม 10% ของยอดส่วนที่รูดบัตร (ก่อนบวกค่าธรรมเนียม) ปัดขึ้นเป็นบาทเต็ม · ทุกบัตรที่รูดผ่านเครื่อง
//    · แบ่งจ่าย = บิลเดียวหลายก้อน · คิดค่าธรรมเนียมเฉพาะส่วนที่จ่ายบัตร
//    · F รวม VAT ในตัว: ยอดบิล = ราคาเงินสด + F · ยอดรูด = ส่วนบัตร + F
//      cardFee.amount = F บาทเต็ม · cardFee.net/บรรทัดค่าธรรมเนียม = ฐานก่อน VAT ถึงสตางค์
//      [1] ตรวจตารางเจ้าของและกวาดราคา 1–3,000 × 1/5/10/30% × บัตร/แบ่งจ่าย ทั้งเปิดและปิด VAT
//    · ลดค่าธรรมเนียมได้ (ปุ่ม 10% / 5% / ไม่คิด หรือกรอก % เอง ไม่เกินอัตราของร้าน) ไม่ต้องใส่ PIN
//      แต่บันทึกชื่อคนลดในบิล และแจ้งใน Telegram ปิดกะ
//    · บิลบัตร/แบ่งจ่าย แก้ยอด/ส่วนลด/ช่องทางไม่ได้ → ยกเลิกแล้วออกใหม่ · บิลปกติเปลี่ยนเป็นบัตรไม่ได้
//   โค้ดจริงทั้งสองฝั่ง (app.js บน IndexedDB จริง + google_apps_script.js ในชีตจำลอง)
//   พิสูจน์ว่าจับของจริง: POS_APP_SRC/POS_GAS_SRC ชี้ไปโค้ดก่อนแก้ → ต้องตก (ดู tests/README.md)
//   ⚠️ วันที่ทั้งหมดนับจาก "วันนี้" (ไม่ผูกกับวันที่ตายตัว — ดูกับดักตามปฏิทินใน tests/README.md)
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db.js');
const R = makeRunner('--- แบ่งจ่าย + ค่าธรรมเนียมบัตร (6 ต.ค. 2569) ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 120000) / 1000) + ' วินาที')), ms || 120000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};

const CUT = [{ id: 's1', name: 'ตัดผม', price: 1000 }];                       // หมวด barber (ไม่คิด VAT)
const DRINKS = [{ id: 'd1', name: 'น้ำ', price: 20, category: 'drinks', commission: 0 },
                { id: 'd1', name: 'น้ำ', price: 20, category: 'drinks', commission: 0 }];   // หมวด drinks (คิด VAT 7%)
const TAX1000 = [{ id: 'd1', name: 'บริการคิด VAT', price: 1000, category: 'drinks', commission: 0 }];

// ขายหนึ่งบิลผ่านทางเดินจริง (processCheckout) · opts: { items, pay, cash, rate, custom, received }
async function sell(env, opts) {
  const o = opts || {};
  const app = env.app;
  readyCheckout(env, o.items || CUT, o.pay || 'cash', o.received);
  if (o.rate !== undefined) app.selectCardFeeRate(o.rate);
  if (o.custom !== undefined) env.document.getElementById('card-fee-custom').value = String(o.custom);
  if (o.cash !== undefined) env.document.getElementById('split-cash-amount').value = String(o.cash);
  const before = app.state.transactions.length;
  const res = await app.processCheckout();
  await settle(40);
  const after = app.state.transactions;
  return { res, tx: after.length > before ? after[after.length - 1] : null };
}
async function flushSync(app) { await settle(30); await app.syncPendingTransactions(true); await settle(60); }
// แถวบิลบนชีต → อ็อบเจกต์ตามหัวตาราง
function sheetRow(gas, app, tx) {
  const sh = gas.sheet(app.getBusinessMonthKey(tx.date));
  if (!sh) return null;
  const head = sh._grid[0].map(h => String(h).trim());
  const row = sh._grid.slice(1).find(r => String(r[0]).trim() === tx.id);
  if (!row) return null;
  const o = {}; head.forEach((h, i) => { o[h] = row[i]; }); return o;
}
const fatalCodes = (app, tx) => app.validateBillRecord(tx).filter(p => p.fatal).map(p => p.code);

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] สูตรค่าธรรมเนียม + แผนเก็บเงิน (ตัวเดียวกับหน้าชำระเงินและตอนบันทึก)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[1]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const fee = env.ctx.cardFeeFor;
  await t('10% ของ 1,000 = 100 · ปัดขึ้นเป็นบาทเต็ม (651 → 66 · 601 → 61 · 999 → 100 · 1 → 1 — ไม่ใช่ปัดปกติ)', () => {
    eq([fee(1000, 10), fee(651, 10), fee(601, 10), fee(655, 10), fee(999, 10), fee(1, 10), fee(600, 5), fee(0, 10), fee(1000, 0)],
       [100, 66, 61, 66, 100, 1, 30, 0, 0]);
  });
  await t('เครื่องที่ยังไม่เคยตั้งค่า = 10% ตามที่เจ้าของสั่ง', () => eq(app.cardFeeRate, 10));

  readyCheckout(env, CUT, 'credit');
  const pc = app.buildCheckoutPlan('credit', {});
  await t('จ่ายบัตรทั้งบิล 1,000 → ค่าธรรมเนียม 100 · รูด 1,100 · บิล 1,100', () => {
    eq([pc.ok, pc.fee.base, pc.fee.amount, pc.cardAmount, pc.totals.total], [true, 1000, 100, 1100, 1100]);
    eq(pc.parts, [{ method: 'credit', amount: 1100 }]);
  });
  const ps = app.buildCheckoutPlan('split', { cashPart: 400 });
  await t('แบ่งจ่าย เงินสด 400 → ส่วนบัตร 600 + 10% = รูด 660 · บิล 1,060 (ค่าธรรมเนียมเฉพาะส่วนบัตร)', () => {
    eq([ps.ok, ps.fee.base, ps.fee.amount, ps.cardAmount, ps.totals.total], [true, 600, 60, 660, 1060]);
    eq(ps.parts, [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 660 }]);
  });
  await t('แบ่งจ่าย: เงินสดครบยอด/เกินยอด/0/ทศนิยม → แผนไม่ผ่าน (ไม่เดา)', () => {
    [1000, 1500, 0, 1.5, -5, null].forEach(c => ok(!app.buildCheckoutPlan('split', { cashPart: c }).ok, 'ผ่านทั้งที่เงินสด = ' + c));
  });
  await t('ลดอัตรา: 5% → 50 · 0 → ไม่มีค่าธรรมเนียม (บิล 1,000) · สูงกว่าอัตราร้าน/ทศนิยม → ไม่ผ่าน', () => {
    eq(app.buildCheckoutPlan('credit', { feeRate: 5 }).fee.amount, 50);
    const z = app.buildCheckoutPlan('credit', { feeRate: 0 });
    eq([z.ok, z.fee.amount, z.totals.total, z.fee.fullAmount], [true, 0, 1000, 100]);
    ok(!app.buildCheckoutPlan('credit', { feeRate: 11 }).ok);
    ok(!app.buildCheckoutPlan('credit', { feeRate: 2.5 }).ok);
    ok(!app.buildCheckoutPlan('credit', { feeRate: NaN }).ok);
  });
  await t('เงินสด/โอน: ไม่มีค่าธรรมเนียม ยอดเท่าเดิม', () => {
    eq(app.buildCheckoutPlan('cash', {}).totals.total, 1000); eq(app.buildCheckoutPlan('promptpay', {}).fee, null);
  });

  // VAT (เครื่องจำลองเปิด VAT 7% และหมวด drinks คิด VAT)
  readyCheckout(env, DRINKS, 'credit');
  const pv = app.buildCheckoutPlan('credit', {});
  await t('น้ำ 2×20: ราคาเงินสด 43 + F 5 รวม VAT → ฐาน 44.67 · VAT 3.13 · ปัดเศษ .20 · รวม 48', () => {
    eq([pv.base.total, pv.fee.base, pv.fee.amount, pv.fee.vatable], [43, 43, 5, true]);
    eq([pv.fee.net, pv.totals.vatableBase, pv.totals.vatAmount, pv.totals.rounding, pv.totals.total, pv.cardAmount], [4.67, 44.67, 3.13, .20, 48, 48]);
  });
  readyCheckout(env, [CUT[0], DRINKS[0]], 'credit');
  const pm = app.buildCheckoutPlan('credit', {});
  await t('บิลที่ปนกัน (คิด/ไม่คิด VAT): ค่าธรรมเนียมไม่คิด VAT (หลัก "เก็บภาษีเกินแก้ยากกว่าเก็บขาด")', () => {
    eq(pm.fee.vatable, false);
    eq(Math.round((pm.totals.nonVatBase + pm.totals.vatableBase + pm.totals.vatAmount + pm.totals.rounding) * 100), Math.round(pm.totals.total * 100));
  });
  const cases = [
    ['1,000 คิด VAT บัตร 10%', TAX1000, true, 'credit', {}, [1070, 107, 100, 0, 1100, 77, 0, 1177, 1177]],
    ['1,000 คิด VAT แบ่งจ่ายเงินสด 470', TAX1000, true, 'split', { cashPart: 470 }, [1070, 60, 56.07, 0, 1056.07, 73.92, .01, 1130, 660]],
    ['1,000 คิด VAT ลดเหลือ 5%', TAX1000, true, 'credit', { feeRate: 5 }, [1070, 54, 50.47, 0, 1050.47, 73.53, 0, 1124, 1124]],
    ['น้ำ 2×20 คิด VAT', DRINKS, true, 'credit', {}, [43, 5, 4.67, 0, 44.67, 3.13, .20, 48, 48]],
    ['VAT ปิด 1,000', TAX1000, false, 'credit', {}, [1000, 100, 100, 1100, 0, 0, 0, 1100, 1100]],
    ['หมวดไม่คิด VAT 1,000', CUT, true, 'credit', {}, [1000, 100, 100, 1100, 0, 0, 0, 1100, 1100]],
    ['ปนกัน ไม่คิด VAT 1,000 + คิด VAT 100', [CUT[0], { ...TAX1000[0], price: 100 }], true, 'credit', {}, [1107, 111, 111, 1111, 100, 7, 0, 1218, 1218]]
  ];
  for (const [name, items, enabled, method, opts, expected] of cases) {
    app.vatEnabled = enabled; readyCheckout(env, items, method);
    await t(`ตารางเจ้าของ: ${name}`, () => {
      const p = app.buildCheckoutPlan(method, opts);
      ok(p.ok, p.error);
      eq([p.base.total, p.fee.amount, p.fee.net, p.totals.nonVatBase, p.totals.vatableBase, p.totals.vatAmount,
        p.totals.rounding, p.totals.total, p.cardAmount], expected);
    });
  }
  app.cardFeeRate = 30;
  for (const enabled of [true, false]) {
    app.vatEnabled = enabled;
    await t(`กวาดราคา 1–3,000 × 1/5/10/30% × บัตรทั้งบิล/แบ่งจ่ายครึ่ง (VAT ${enabled ? 'เปิด' : 'ปิด'})`, () => {
      let count = 0;
      for (let price = 1; price <= 3000; price++) {
        readyCheckout(env, [{ ...TAX1000[0], price }], 'credit');
        const cashTotal = app.getCartBillTotals().total;
        for (const rate of [1, 5, 10, 30]) for (const method of ['credit', 'split']) {
          const cashPart = method === 'split' ? Math.floor(cashTotal / 2) : 0;
          const p = app.buildCheckoutPlan(method, { feeRate: rate, cashPart });
          if (method === 'split' && cashPart === 0) { ok(!p.ok, 'แบ่งจ่ายเงินสด 0 ต้องไม่ผ่าน'); continue; }
          const why = `${price}/${rate}/${method}`;
          ok(p.ok, why + ': ' + p.error);
          const cardBase = cashTotal - cashPart;
          const F = Math.ceil(cardBase * rate / 100);
          eq([p.totals.total, p.cardAmount, p.fee.amount], [cashTotal + F, cardBase + F, F], why);
          eq(p.parts.reduce((s, x) => s + Math.round(x.amount * 100), 0), Math.round(p.totals.total * 100), why);
          const rebuilt = app.computeTotalsAtRate(app.getCartLines().concat([{ netPrice: p.fee.net, vatable: p.fee.vatable }]), enabled ? 7 : 0);
          eq(rebuilt, p.totals, why);
          if (!enabled) eq(p.fee.net, F, why);
          count++;
        }
      }
      eq(count, enabled ? 24000 : 23996);
    });
  }
  app.cardFeeRate = 10; app.vatEnabled = true;
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] ขายจ่ายบัตรทั้งบิล → บิล · ค่าคอม · ชีต');
// ═══════════════════════════════════════════════════════════════════════════
let shared = null;   // ร้านเดียวกันใช้ต่อในข้อ 3–6
await section('[2]', async () => {
  shared = await makeShop();
  const { env, app, gas } = shared;
  await settle();
  const { res, tx } = await sell(env, { pay: 'credit' });
  await t('บันทึกบิลได้', () => { eq(res, true); ok(tx, 'ไม่มีบิล'); });
  await t('ยอดบิล 1,100 · ราคารวม 1,100 (บริการ 1,000 + ค่าธรรมเนียม 100) · สมการ VAT บวกลงตัว', () => {
    eq([tx.total, tx.subtotal, tx.discount, tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding], [1100, 1100, 0, 1100, 0, 0, 0]);
  });
  await t('บรรทัดค่าธรรมเนียม: ไม่มีผู้ให้บริการ ไม่มีค่าคอม · บรรทัดบริการค่าคอมเท่าเดิม (10% ของ 1,000)', () => {
    eq(tx.details.length, 2);
    const f = tx.details[1];
    eq([f.kind, f.name, f.price, f.netPrice, f.staffId, f.commissionAmount], ['card_fee', 'ค่าธรรมเนียมบัตร', 100, 100, '', 0]);
    eq(tx.details[0].commissionAmount, 100);
  });
  await t('ข้อมูลค่าธรรมเนียมที่ล็อกไว้ในบิล (อัตรา 10 · ยอดรูดก่อนค่าธรรมเนียม 1,000) · ไม่มีชื่อคนลด', () => {
    eq(tx.cardFee, { rate: 10, baseRate: 10, base: 1000, amount: 100, net: 100, fullAmount: 100 });
  });
  await t('รายการบริการ/พนักงานของบิลไม่ปนค่าธรรมเนียม · เงินที่รับตอนขาย = บัตร 1,100', () => {
    eq(tx.services, ['ตัดผม']); eq(tx.staffNames, ['เอ']); eq([tx.tender.method, tx.tender.amount], ['credit', 1100]);
  });
  await t('ตัวตรวจบิลของแอป: ไม่มีข้อเสีย', () => eq(fatalCodes(app, tx), []));
  await flushSync(app);
  const row = sheetRow(gas, app, tx);
  await t('ขึ้นชีตแล้ว: ช่องทาง "Credit Card" · รายการบริการต่อท้าย "ค่าธรรมเนียมบัตร 10%" · ราคารวม/ยอดสุทธิ 1,100', () => {
    ok(row, 'ไม่มีแถวบนชีต'); eq(tx.syncStatus, 'synced');
    eq([row['ช่องทางชำระเงิน'], row['รายการบริการ'], row['ราคารวม (฿)'], row['ยอดสุทธิ (฿)'], row['พนักงาน']],
       ['Credit Card', 'ตัดผม, ค่าธรรมเนียมบัตร 10%', 1100, 1100, 'เอ']);
  });
  shared.creditTx = tx;
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] แบ่งจ่าย เงินสด 400 + บัตร → บิล · ลิ้นชัก · ชีต · สรุป · Telegram');
// ═══════════════════════════════════════════════════════════════════════════
await section('[3]', async () => {
  const { env, app, gas } = shared;
  const drawer0 = app.computeShiftDrawer(app.state.shift);
  const { res, tx } = await sell(env, { pay: 'split', cash: 400 });
  await t('บันทึกบิลแบ่งจ่ายได้', () => { eq(res, true); ok(tx, 'ไม่มีบิล'); });
  await t('บิล: ยอด 1,060 · ก้อนเงินตามบิล = เงินสด 400 + บัตร 660 · เงินที่รับตอนขายตรงกัน', () => {
    eq([tx.paymentMethod, tx.total, tx.subtotal], ['split', 1060, 1060]);
    eq(tx.payments, [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 660 }]);
    eq(tx.tender.parts, tx.payments); eq(tx.tender.amount, 1060);
    eq(tx.cardFee, { rate: 10, baseRate: 10, base: 600, amount: 60, net: 60, fullAmount: 60 });
  });
  await t('ตัวตรวจบิลของแอป: ไม่มีข้อเสีย · เงินส่วนต่างไม่มีค้าง', () => {
    eq(fatalCodes(app, tx), []); eq(app.billMoneyStatus(tx).settled, true);
  });
  const drawer1 = app.computeShiftDrawer(app.state.shift);
  await t('ลิ้นชัก: เงินที่ควรมีเพิ่มแค่ 400 (ส่วนเงินสด) ไม่ใช่ 1,060 — และบิลบัตรล้วนไม่เพิ่มเลย', () => {
    eq(Math.round((drawer1.expected - drawer0.expected) * 100), 40000);
    eq(Math.round((drawer1.cashSales - drawer0.cashSales) * 100), 40000);
    eq(drawer1.invalidBills, []);
  });
  await flushSync(app);
  const row = sheetRow(gas, app, tx);
  await t('ชีต: ช่องทาง "เงินสด 400 + Credit Card 660" · ยอดสุทธิ 1,060', () => {
    ok(row, 'ไม่มีแถวบนชีต'); eq(tx.syncStatus, 'synced');
    eq([row['ช่องทางชำระเงิน'], row['ยอดสุทธิ (฿)'], row['รายการบริการ']], ['เงินสด 400 + Credit Card 660', 1060, 'ตัดผม, ค่าธรรมเนียมบัตร 10%']);
  });

  const dk = app.getBusinessISODate(tx.date);
  const dayBills = app.state.transactions.filter(x => app.getBusinessISODate(x.date) === dk);
  const payload = app.buildSummaryPayload(dayBills, [], 'day', dk);
  await t('สรุปวัน: เงินสด 400 · บัตร 1,760 (1,100 + 660) · รวม 2,160 — ช่องทางรวมกันเท่ารายได้', () => {
    eq([payload.cashRevenue, payload.qrRevenue, payload.creditRevenue, payload.totalRevenue], [400, 0, 1760, 2160]);
  });
  await t('สรุปวัน: ค่าคอมไม่มีแถว "ไม่ระบุ" · ตารางรายการมีแถว "ค่าธรรมเนียมบัตร" 160', () => {
    eq(payload.staffCommissions.map(s => s.name), ['เอ']);
    eq(payload.staffCommissions[0].salesSum, 2000); eq(payload.staffCommissions[0].commission, 200);
    const f = payload.services.find(s => s.name === 'ค่าธรรมเนียมบัตร');
    ok(f, 'ไม่มีแถวค่าธรรมเนียมบัตร'); eq([f.count, f.revenue], [2, 160]);
  });
  const okDay = await app.syncDailySummary(dk, dayBills, [], true);
  await t('Apps Script รับสรุปวัน (ตรวจสมการช่องทาง/VAT/รายการผ่าน)', () => eq(okDay, true));

  const now = Date.now();
  const msg = app.buildShiftReportMessage({ startTime: Number(app.state.shift.startTime), endTime: now, startCash: 1000,
    expensesTotal: 0, expectedCash: drawer1.expected, countedCash: drawer1.expected, difference: 0, cashSales: drawer1.cashSales });
  await t('Telegram ปิดกะ: เงินสด ฿400 · บัตร ฿1,760 · ค่าธรรมเนียมที่เก็บ ฿160 (2 บิล) · บิลแบ่งจ่าย 1 บิล', () => {
    ok(msg.includes('💵 เงินสด: ฿400\n'), msg); ok(msg.includes('💳 เครดิตการ์ด: ฿1,760'), msg);
    ok(msg.includes('ค่าธรรมเนียมบัตรที่เก็บ (รวมอยู่ในยอดบัตร): ฿160 (2 บิล)'), msg);
    ok(msg.includes('บิลแบ่งจ่าย (เงินสด+บัตร): 1 บิล'), msg);
    ok(!msg.includes('ลด/ไม่คิดค่าธรรมเนียม'), 'ยังไม่มีใครลด แต่ข้อความบอกว่ามี');
  });
  shared.splitTx = tx;
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] ลดค่าธรรมเนียม (ปุ่ม 5% / ไม่คิด / กรอก % เอง) — ไม่ใส่ PIN แต่บันทึกชื่อ + แจ้ง Telegram');
// ═══════════════════════════════════════════════════════════════════════════
await section('[4]', async () => {
  const { env, app, toasts } = shared;
  loginAs(app, 'manager');
  const a = await sell(env, { pay: 'credit', rate: 5 });
  await t('ปุ่ม 5%: ค่าธรรมเนียม 50 · บิล 1,050 · บันทึกชื่อคนลด (ผู้จัดการ "บี")', () => {
    eq([a.tx.total, a.tx.cardFee.rate, a.tx.cardFee.amount, a.tx.cardFee.fullAmount, a.tx.cardFee.reducedBy], [1050, 5, 50, 100, 'บี']);
  });
  const b = await sell(env, { pay: 'split', cash: 400, rate: 0 });
  await t('ปุ่มไม่คิด (แบ่งจ่าย): ไม่มีบรรทัดค่าธรรมเนียม · บิล 1,000 = เงินสด 400 + บัตร 600 · ยังบันทึกว่าลด', () => {
    eq([b.tx.total, b.tx.details.length], [1000, 1]);
    eq(b.tx.payments, [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 600 }]);
    eq([b.tx.cardFee.rate, b.tx.cardFee.amount, b.tx.cardFee.fullAmount, b.tx.cardFee.reducedBy], [0, 0, 60, 'บี']);
    eq(fatalCodes(app, b.tx), []);
  });
  const c = await sell(env, { pay: 'credit', custom: '3' });
  await t('กรอกเอง 3% → ค่าธรรมเนียม 30 · บิล 1,030', () => eq([c.tx.total, c.tx.cardFee.rate, c.tx.cardFee.amount], [1030, 3, 30]));
  const n0 = app.state.transactions.length;
  const d1 = await sell(env, { pay: 'credit', custom: '2.5' });
  const d2 = await sell(env, { pay: 'credit', custom: '11' });
  await t('กรอกเองผิดกติกา (2.5 / สูงกว่าอัตราร้าน 11) → ไม่ออกบิล และบอกเหตุผล (ไม่ถอยไปใช้อัตราอื่นเงียบ ๆ)', () => {
    eq([d1.res, d2.res, app.state.transactions.length], [false, false, n0]);
    ok(toasts.some(x => /อัตราค่าธรรมเนียมบัตรต้องเป็นจำนวนเต็ม/.test(x.m)), JSON.stringify(toasts.slice(-3)));
    ok(toasts.some(x => /สูงกว่าอัตราของร้าน/.test(x.m)), JSON.stringify(toasts.slice(-3)));
  });
  await t('รอบชำระเงินใหม่เริ่มที่อัตราของร้านเสมอ (อัตราที่ลดไม่ค้างไปบิลถัดไป)', async () => {
    const e = await sell(env, { pay: 'credit' });
    eq([e.tx.cardFee.rate, e.tx.total], [10, 1100]); ok(!('reducedBy' in e.tx.cardFee));
  });
  const msg = app.buildShiftReportMessage({ startTime: Number(app.state.shift.startTime), endTime: Date.now(), startCash: 1000 });
  await t('Telegram: "ลด/ไม่คิดค่าธรรมเนียมบัตร: 3 บิล (ลดไป ฿180) — โดย บี"', () => {
    ok(msg.includes('↘️ ลด/ไม่คิดค่าธรรมเนียมบัตร: 3 บิล (ลดไป ฿180) — โดย บี'), msg);
  });
  loginAs(app, 'owner');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] หน้าแก้บิล: บิลบัตร/แบ่งจ่าย แก้ยอด/ช่องทางไม่ได้ · บิลปกติเปลี่ยนเป็นบัตรไม่ได้');
// ═══════════════════════════════════════════════════════════════════════════
await section('[5]', async () => {
  const { env, app, toasts } = shared;
  const doc = env.document;
  const edit = async (tx, set) => {
    app.openTransactionEdit(tx.id);
    Object.keys(set).forEach(k => { doc.getElementById(k).value = set[k]; });
    await app.saveTransactionEdit();
    await settle(20);
  };
  const cr = shared.creditTx, sp = shared.splitTx;
  const cr0 = JSON.stringify(cr), sp0 = JSON.stringify(sp);
  await edit(cr, { 'edit-tx-discount': '100' });
  await t('บิลบัตร: แก้ส่วนลด → ไม่บันทึก · บิลไม่เปลี่ยน · บอกให้ยกเลิกแล้วออกใหม่', () => {
    eq(JSON.stringify(cr), cr0); ok(toasts.some(x => /แก้ยอด ส่วนลด หรือช่องทางไม่ได้/.test(x.m)), JSON.stringify(toasts.slice(-2)));
  });
  await edit(cr, { 'edit-tx-payment': 'cash' });
  await t('บิลบัตร: เปลี่ยนเป็นเงินสด → ไม่บันทึก', () => eq(JSON.stringify(cr), cr0));
  await edit(sp, { 'edit-tx-discount': '0', 'edit-tx-payment': 'credit' });
  await t('บิลแบ่งจ่าย: เปลี่ยนช่องทาง → ไม่บันทึก', () => eq(JSON.stringify(sp), sp0));
  await edit(sp, { 'edit-tx-customer': 'คุณใหม่' });
  await flushSync(app);
  await t('บิลแบ่งจ่าย: แก้ชื่อลูกค้าได้ · ก้อนเงิน/ยอด/ช่องทางคงเดิม · ขึ้นชีตรุ่นใหม่ (ป้ายช่องทางเดิม)', () => {
    eq([sp.customerName, sp.paymentMethod, sp.total, sp.rev], ['คุณใหม่', 'split', 1060, 2]);
    eq(sp.payments, [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 660 }]);
    const row = sheetRow(shared.gas, app, sp);
    eq([sp.syncStatus, row['ลูกค้า'], row['ช่องทางชำระเงิน']], ['synced', 'คุณใหม่', 'เงินสด 400 + Credit Card 660']);
  });
  await t('ตอนเปิดหน้าแก้บิลบัตร: ช่องส่วนลด/ช่องทางถูกล็อก · ชื่อลูกค้าแก้ได้', () => {
    app.openTransactionEdit(cr.id);
    eq([doc.getElementById('edit-tx-discount').disabled, doc.getElementById('edit-tx-payment').disabled, doc.getElementById('edit-tx-customer').disabled], [true, true, false]);
  });
  const { tx: cash } = await sell(env, { pay: 'cash' });
  const cash0 = JSON.stringify(cash);
  await edit(cash, { 'edit-tx-payment': 'credit' });
  await t('บิลเงินสด: เปลี่ยนเป็นบัตร → ไม่บันทึก (ต้องคิดค่าธรรมเนียม = ยกเลิกแล้วออกใหม่)', () => {
    eq(JSON.stringify(cash), cash0); ok(toasts.some(x => /เปลี่ยนบิลเป็น "บัตร" ไม่ได้/.test(x.m)));
  });
  await edit(cash, { 'edit-tx-payment': 'promptpay' });
  await t('บิลเงินสด: เปลี่ยนเป็นโอน/QR ยังทำได้ตามเดิม', () => eq(cash.paymentMethod, 'promptpay'));
  await flushSync(app);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] ยกเลิกบิลแบ่งจ่าย: ลิ้นชักคืนเฉพาะเงินสด · บอกให้ยกเลิกที่เครื่องรูดบัตร');
// ═══════════════════════════════════════════════════════════════════════════
await section('[6]', async () => {
  const { env, app } = shared;
  const { tx } = await sell(env, { pay: 'split', cash: 300 });   // บัตร 700 + 70 = 770
  const before = app.computeShiftDrawer(app.state.shift).expected;
  app.openTransactionEdit(tx.id);
  env.document.getElementById('void-money-outcome').value = 'refunded';
  await app.voidTransaction(); await app._confirmP; await settle(30);
  const after = app.computeShiftDrawer(app.state.shift).expected;
  await t('ยกเลิกแล้ว · เงินที่ควรมีในลิ้นชักลดแค่ 300 (ส่วนเงินสด)', () => {
    ok(!app.state.transactions.includes(tx), 'บิลยังอยู่'); eq(Math.round((before - after) * 100), 30000);
  });
  const v = app.state.voidLog[app.state.voidLog.length - 1];
  await t('ประวัติยกเลิก + ข้อความยืนยัน + แจ้ง Telegram บอกส่วนที่รูดบัตร 770 ต้องยกเลิกที่เครื่องรูด', () => {
    eq([v.billId, v.cardRefund, v.cashEffect], [tx.id, 770, -300]);
    ok(/ส่วนที่รูดบัตร ฿770\.00 ต้องยกเลิกรายการที่เครื่องรูดบัตร/.test(app._lastConfirmMsg), app._lastConfirmMsg);
    ok(app.buildVoidAlertMessage(v).includes('💳 ส่วนที่รูดบัตร: ฿770 — ต้องยกเลิกรายการที่เครื่องรูดบัตร'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7] ใบเสร็จ · ใบแจ้งยอด · หน้ารายงาน · หน้าชำระเงิน (โค้ดหน้าจอจริง)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[7]', async () => {
  const { env, app } = shared;
  const P = Object.getPrototypeOf(app);
  const doc = env.document;
  P.showThermalReceipt.call(app, shared.splitTx);
  const rc = doc.getElementById('thermal-receipt-preview').innerHTML;
  await t('ใบเสร็จแบ่งจ่าย: รวมค่าบริการ 1,000 · ค่าธรรมเนียม 10% คิดจากส่วนบัตร 600 ฿60 · แจกแจงเงินสด/บัตร', () => {
    ok(/รวมค่าบริการ:<\/span>\s*<span>฿1,000</.test(rc), 'รวมค่าบริการไม่ใช่ 1,000');
    ok(rc.includes('ค่าธรรมเนียมบัตร 10% (คิดจากส่วนที่จ่ายบัตร ฿600.00):'), 'ไม่มีบรรทัดค่าธรรมเนียม');
    ok(rc.includes('แบ่งจ่าย') && rc.includes('• เงินสด:') && rc.includes('฿400.00') && rc.includes('• Credit Card:') && rc.includes('฿660.00'), 'ไม่แจกแจงก้อนเงิน');
    eq((rc.match(/ผู้ดูแล:/g) || []).length, 1);   // บรรทัดค่าธรรมเนียมไม่ขึ้นเป็นรายการบริการ
  });

  readyCheckout(env, CUT, 'cash');
  P.showQuotePreview.call(app);
  const q = doc.getElementById('quote-preview').innerHTML;
  await t('ใบแจ้งยอดก่อนชำระ: บอกราคาถ้าจ่ายบัตร (+10%) = ฿1,100', () => ok(q.includes('ถ้าชำระด้วยบัตร (+10%):') && q.includes('฿1,100'), q.slice(-600)));

  app.state.selectedReportType = 'daily';
  doc.getElementById('report-date-input').value = app.currentBusinessDateKey();
  doc.getElementById('report-staff-filter').value = 'all';
  P.filterReports.call(app);
  await t('หน้ารายงาน: ตารางค่าคอมไม่มีแถวว่าง/ไม่ระบุ · ตารางรายการมี "ค่าธรรมเนียมบัตร" · ตารางบิลบอกเงินสด+บัตร', () => {
    const comm = doc.getElementById('report-commission-body').innerHTML;
    ok(!/ไม่ได้ระบุ/.test(comm), comm.slice(0, 400));
    ok(doc.getElementById('report-services-breakdown-body').innerHTML.includes('ค่าธรรมเนียมบัตร'));
    ok(doc.getElementById('report-transactions-body').innerHTML.includes('เงินสด 400 + บัตร 660')   /* ป้ายไทย (ตรวจ 13 ต.ค. 2569 ข้อ 21) */);
    eq(doc.getElementById('report-kpi-popular').innerText, 'ตัดผม');
  });

  // หน้าชำระเงิน: กล่องแบ่งจ่ายใช้แผนเดียวกับตอนบันทึก
  readyCheckout(env, CUT, 'cash');
  P.selectPaymentMethod.call(app, 'split');
  await t('เลือกแบ่งจ่าย: ช่องเงินสดเริ่มว่าง · ปุ่มยืนยันยังกดไม่ได้ · คำแนะนำไม่ใช่สีแดง', () => {
    eq(doc.getElementById('split-cash-amount').value, '');
    eq(doc.getElementById('btn-complete-checkout').disabled, true);
    ok(/กรอกเงินสดที่ลูกค้าจ่าย/.test(doc.getElementById('card-fee-error').innerText));
    eq(doc.getElementById('card-fee-error').style.color, 'var(--text-muted)');
  });
  doc.getElementById('split-cash-amount').value = '400';
  const pl = app.renderCardPaymentPanel();
  await t('กรอกเงินสด 400: จอบอกยอดรูด ฿660.00 · รวมบิล ฿1,060.00 · ปุ่มยืนยันกดได้', () => {
    eq([pl.ok, doc.getElementById('card-swipe-total-label').innerText, doc.getElementById('split-bill-total-label').innerText,
      doc.getElementById('btn-complete-checkout').disabled], [true, '฿660.00', '฿1,060.00', false]);
    ok(doc.getElementById('card-fee-options').innerHTML.includes('onclick="app.selectCardFeeRate(5)"'));
  });
  doc.getElementById('split-cash-amount').value = '1000';
  await t('กรอกเงินสดครบยอด: ปุ่มยืนยันกดไม่ได้ + บอกให้ใช้ปุ่มเงินสด', () => {
    const p2 = app.renderCardPaymentPanel();
    eq([p2.ok, doc.getElementById('btn-complete-checkout').disabled], [false, true]);
    ok(/ใช้ปุ่ม "เงินสด" แทน/.test(doc.getElementById('card-fee-error').innerText));
  });
  P.selectPaymentMethod.call(app, 'credit');
  await t('เลือกบัตร: จอบอกยอดรูด ฿1,100.00 (รวมค่าธรรมเนียม)', () => eq(doc.getElementById('credit-total-label').innerText, '฿1,100.00'));
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[8] หน้าตรวจความตรงกันกับชีต: บิลบัตร/แบ่งจ่ายต้องไม่ฟ้องว่าไม่ตรง');
// ═══════════════════════════════════════════════════════════════════════════
await section('[8]', async () => {
  const { app, gas } = shared;
  await flushSync(app);
  const key = gas.setupOwnerKey(); app.askOwnerKey = async () => key;
  const mk = app.getBusinessMonthKey(shared.splitTx.date);
  const cloud = await app.fetchCloudBills(mk);
  const mine = app.state.transactions.filter(x => app.getBusinessMonthKey(x.date) === mk);
  const diffs = mine.map(tx => { const b = cloud.bills.find(x => x.id === tx.id); return b ? app.reconcileFieldDiffs(tx, b) : ['ไม่พบบนชีต']; })
    .filter(d => d.length);
  await t(`บิลทุกใบของเดือน (${mine.length} ใบ) ตรงกับชีตทุกช่อง รวมป้าย "เงินสด 400 + Credit Card 660"`, () => eq(diffs, []));
  await t('ตัวเลขในป้ายช่องทาง: แอปกับ Apps Script เขียนเหมือนกันทุกตัวอักษร', () => {
    [0, 1, 400, 660, 1060.5, 1234.56, 99999, 0.01].forEach(n => eq(shared.env.ctx.sheetMoneyText(n), gas.ctx.moneyText_(n), String(n)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[9] ไฟล์สำรอง: บิลบัตร/แบ่งจ่าย + อัตราค่าธรรมเนียม ไปกลับครบ');
// ═══════════════════════════════════════════════════════════════════════════
await section('[9]', async () => {
  const { env, app } = shared;
  env.document.getElementById('card-fee-rate').value = '7';
  await t('(เงื่อนไข) เจ้าของตั้งอัตราเป็น 7%', async () => eq(await app.saveCardFeeSettings(), true));
  const file = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  const nBills = file.transactions.length;
  const other = await makeShop();
  await settle();
  const p = JSON.parse(JSON.stringify(file));
  ok(other.app.isValidBackupObject(p), other.app._lastBackupRejectReason);
  other.app.sanitizeBackupData(p);
  const q = (other.app._lastSanitizeQuarantine || []).filter(x => x.kind === 'transaction');
  // ตรวจ 19 ต.ค. 2569 ข้อ 3: เครื่องที่มีข้อมูลอยู่แล้วคงตั้งค่าเงินของเครื่องเป็นค่าเริ่มต้น — เทสต์นี้ตรวจว่า "อัตราในไฟล์ไปกลับครบ"
  // จึงเลือกใช้ตั้งค่าเงินจากไฟล์ (แบบที่เจ้าของพิมพ์ยืนยัน "ใช้ค่าในไฟล์")
  await other.app.applyBackupData(p, { moneySettings: 'file' });
  await settle(30);
  await t('กู้ลงเครื่องอื่น: บิลครบทุกใบ ไม่มีใบไหนถูกแยกไปตรวจ', () => { eq(q, []); eq(other.app.state.transactions.length, nBills); });
  await t('บิลแบ่งจ่าย/ค่าธรรมเนียมกลับมาเหมือนเดิม · อัตรา 7% ตามไฟล์ · ลงฐานข้อมูลจริง', async () => {
    const s = other.app.state.transactions.find(x => x.id === shared.splitTx.id);
    eq([s.paymentMethod, s.payments, s.cardFee.amount], ['split', shared.splitTx.payments, 60]);
    eq(other.app.cardFeeRate, 7); eq(await other.env.raw('cardFeeRate'), 7);
  });
  const bad = JSON.parse(JSON.stringify(file)); bad.cardFeeRate = 2.5;
  const other2 = await makeShop(); await settle();
  other2.app.sanitizeBackupData(bad);
  await t('อัตราในไฟล์ผิดกติกา (2.5) → แยกไว้ตรวจ · คงอัตราของเครื่อง (10)', async () => {
    ok((other2.app._lastSanitizeQuarantine || []).some(x => x.id === 'cardFeeRate'));
    await other2.app.applyBackupData(bad); await settle(30);
    eq(other2.app.cardFeeRate, 10);
  });
  other.env.dispose(); other2.env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[10] ตัวตรวจบิล: ก้อนเงิน/ค่าธรรมเนียมที่ไม่ลงตัว = ข้อมูลเงินเชื่อไม่ได้');
// ═══════════════════════════════════════════════════════════════════════════
await section('[10]', async () => {
  const { app } = shared;
  const base = JSON.parse(JSON.stringify(shared.splitTx));
  const mut = (f) => { const x = JSON.parse(JSON.stringify(base)); f(x); return x; };
  await t('ก้อนเงินรวมไม่เท่ายอดบิล → bad-split', () => ok(fatalCodes(app, mut(x => { x.payments[0].amount = 300; })).includes('bad-split')));
  await t('ช่องทางที่ไม่รู้จักในก้อนเงิน → bad-split', () => ok(fatalCodes(app, mut(x => { x.payments[1].method = 'bitcoin'; })).includes('bad-split')));
  await t('ก้อนเดียว / ไม่มีก้อนเงิน → bad-split', () => {
    ok(fatalCodes(app, mut(x => { x.payments = [{ method: 'cash', amount: 1060 }]; })).includes('bad-split'));
    ok(fatalCodes(app, mut(x => { delete x.payments; })).includes('bad-split'));
  });
  await t('ค่าธรรมเนียมในรายการไม่ตรงข้อมูลค่าธรรมเนียม / ไม่มีข้อมูล → card-fee-mismatch', () => {
    ok(fatalCodes(app, mut(x => { x.cardFee.amount = 61; })).includes('card-fee-mismatch'));
    ok(fatalCodes(app, mut(x => { delete x.cardFee; })).includes('card-fee-mismatch'));
  });
  await t('บรรทัดค่าธรรมเนียม 2 บรรทัด → card-fee-dup', () => ok(fatalCodes(app, mut(x => { x.details.push(Object.assign({}, x.details[1])); })).includes('card-fee-dup')));
  await t('บิลเงินสดที่มีค่าธรรมเนียมบัตร → card-fee-no-card', () => ok(fatalCodes(app, mut(x => {
    x.paymentMethod = 'cash'; delete x.payments; x.tender = { method: 'cash', amount: x.total }; })).includes('card-fee-no-card')));
  const brokenTender = mut(x => { x.tender.parts[0].amount = 999; });
  await t('ก้อนเงินที่รับตอนขายเสีย → เตือน (ไม่ใช่ยอดขายเสีย) · ลิ้นชักไม่นับและบอกว่าบิลไหน', () => {
    eq(fatalCodes(app, brokenTender), []);
    ok(app.validateBillRecord(brokenTender).some(p => p.code === 'bad-tender'));
    eq(app.tenderOf(brokenTender).valid, false); eq(app.tenderCashSat(app.tenderOf(brokenTender)), 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[11] Apps Script: ตรวจบิลแบ่งจ่ายเอง (ไม่เชื่อแอป) · บิลแบบเดิมไม่เปลี่ยน');
// ═══════════════════════════════════════════════════════════════════════════
await section('[11]', async () => {
  const gas = createGasEnv();
  const mk = (() => { const d = new Date(); const m = d.getHours() < 6 ? new Date(d.getTime() - 86400e3) : d; return String(m.getMonth() + 1).padStart(2, '0') + '-' + m.getFullYear(); })();
  let seq = 0;
  const bill = (o) => {
    seq++;
    const date = Date.now() - 60e3;
    const d = new Date(date), p2 = n => String(n).padStart(2, '0');
    return Object.assign({ action: 'transaction', id: `TX-${1757000000000 + seq}-SPLIT${String(seq).padStart(3, '0')}`, date, monthKey: mk,
      dateTimeStr: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`,
      customerName: 'x', services: ['ตัดผม', 'ค่าธรรมเนียมบัตร 10%'], subtotal: 1060, discount: 0,
      nonVatBase: 1060, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 7, total: 1060,
      paymentMethod: 'split', payments: [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 660 }],
      staffNames: ['เอ'], rev: 1, revEpoch: 0,
      lines: [{ price: 1000, netPrice: 1000, vatable: false }, { price: 60, netPrice: 60, vatable: false }] }, o || {});
  };
  const r1 = gas.post(bill());
  await t('บิลแบ่งจ่ายที่ลงตัว → รับ · ป้าย "เงินสด 400 + Credit Card 660"', () => {
    eq(r1.status, 'success', JSON.stringify(r1));
    const row = gas.sheet(mk)._grid.find(r => String(r[0]).startsWith('TX-') && String(r[4]).includes('+'));
    eq(row && row[4], 'เงินสด 400 + Credit Card 660');
  });
  const rej = (o) => gas.post(bill(o));
  await t('ก้อนเงินรวมไม่เท่ายอด → INVALID_PAYMENT (ไม่เขียนแถว)', () => eq(rej({ payments: [{ method: 'cash', amount: 400 }, { method: 'credit', amount: 600 }] }).code, 'INVALID_PAYMENT'));
  await t('ช่องทางไม่รู้จัก / ช่องทางว่าง → INVALID_PAYMENT', () => {
    eq(rej({ payments: [{ method: 'cash', amount: 400 }, { method: 'bitcoin', amount: 660 }] }).code, 'INVALID_PAYMENT');
    eq(rej({ payments: [{ method: '', amount: 400 }, { method: 'credit', amount: 660 }] }).code, 'INVALID_PAYMENT');
  });
  await t('ก้อนเดียว / ไม่ส่งก้อนเงิน / ยอดเป็นข้อความ / ติดลบ → INVALID_PAYMENT', () => {
    eq(rej({ payments: [{ method: 'credit', amount: 1060 }] }).code, 'INVALID_PAYMENT');
    eq(rej({ payments: undefined }).code, 'INVALID_PAYMENT');
    eq(rej({ payments: [{ method: 'cash', amount: '400' }, { method: 'credit', amount: 660 }] }).code, 'INVALID_PAYMENT');
    eq(rej({ payments: [{ method: 'cash', amount: -100 }, { method: 'credit', amount: 1160 }] }).code, 'INVALID_PAYMENT');
  });
  await t('ถูกปฏิเสธแล้วไม่มีแถวงอก (มีแค่บิลที่รับ 1 ใบ)', () => eq(gas.sheet(mk)._grid.slice(1).filter(r => String(r[0]).startsWith('TX-')).length, 1));
  const r2 = gas.post(bill({ paymentMethod: 'credit', payments: undefined }));
  await t('บิลบัตรแบบเดิม (ไม่มีก้อนเงิน) → ป้าย "Credit Card" เหมือนเดิม', () => {
    eq(r2.status, 'success'); ok(gas.sheet(mk)._grid.some(r => r[4] === 'Credit Card'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[12] ลืมวาง Apps Script ใหม่: บิลแบ่งจ่ายถูกปฏิเสธ → บอกทางแก้ที่ถูก · วางแล้วกด "ส่งใหม่" ได้');
// ═══════════════════════════════════════════════════════════════════════════
await section('[12]', async () => {
  const { env, app, gas } = await makeShop();
  await settle();
  const realFetch = env.ctx.fetch;
  // จำลอง Apps Script รุ่นก่อน 6 ต.ค. 2569: ไม่รู้จัก 'split' → INVALID_PAYMENT "ช่องทางชำระเงินไม่ถูกต้อง (split)"
  env.ctx.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'transaction' && body.paymentMethod === 'split') {
      const text = JSON.stringify({ status: 'error', code: 'INVALID_PAYMENT', message: 'ช่องทางชำระเงินไม่ถูกต้อง (split)' });
      return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
    }
    return realFetch(url, init);
  };
  const { tx } = await sell(env, { pay: 'split', cash: 400 });
  await flushSync(app);
  await t('บิลค้างเป็น "รอตรวจ" (ไม่หาย · ไม่วนส่งซ้ำ) · ข้อความบอกให้วาง Apps Script ใหม่แล้วกดส่งใหม่', () => {
    eq(tx.syncStatus, 'conflict');
    ok(/Apps Script ที่วางอยู่ยังเป็นรุ่นก่อนมี "แบ่งจ่าย"/.test(tx.syncIssue.message), tx.syncIssue.message);
    eq(app.conflictActionsFor(tx), ['edit', 'retry']);
  });
  env.ctx.fetch = realFetch;   // วาง Apps Script รุ่นใหม่แล้ว
  const done = await app.resolveBillConflict(tx.id, 'retry');
  await settle(40); await flushSync(app);
  await t('กด "ส่งใหม่" → ขึ้นชีตสำเร็จ', () => { eq(done, true); eq(tx.syncStatus, 'synced'); ok(sheetRow(gas, app, tx)); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[13] หน้าตั้งค่า: อัตราค่าธรรมเนียม (เจ้าของเท่านั้น · จำนวนเต็ม 0–30)');
// ═══════════════════════════════════════════════════════════════════════════
await section('[13]', async () => {
  const { env, app, toasts } = await makeShop();
  await settle();
  const el = env.document.getElementById('card-fee-rate');
  loginAs(app, 'manager'); el.value = '5';
  await t('ผู้จัดการบันทึกไม่ได้', async () => { eq(await app.saveCardFeeSettings(), false); eq(app.cardFeeRate, 10); });
  loginAs(app, 'owner');
  for (const bad of ['2.5', '31', '-1', 'abc', '']) {
    el.value = bad;
    await t(`ค่า "${bad}" → ไม่บันทึก · อัตราเดิม`, async () => { eq(await app.saveCardFeeSettings(), false); eq(app.cardFeeRate, 10); });
  }
  el.value = '0';
  await t('ใส่ 0 = ปิดค่าธรรมเนียม → จ่ายบัตรไม่มีบรรทัดค่าธรรมเนียม', async () => {
    eq(await app.saveCardFeeSettings(), true); eq(await env.raw('cardFeeRate'), 0);
    const { tx } = await sell(env, { pay: 'credit' });
    eq([tx.total, tx.details.length, tx.cardFee.amount, tx.cardFee.baseRate], [1000, 1, 0, 0]);
    ok(!('reducedBy' in tx.cardFee), 'อัตราร้าน 0 ไม่ใช่การลด');
  });
  el.value = '10';
  await t('ตั้งกลับ 10 → บันทึกลงเครื่อง', async () => { eq(await app.saveCardFeeSettings(), true); eq(await env.raw('cardFeeRate'), 10); });
  ok(toasts.length > 0);
  env.dispose();
});

if (shared) shared.env.dispose();
R.done();
})();
