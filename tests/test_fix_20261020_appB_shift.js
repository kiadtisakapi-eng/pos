// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) — เปิด/ปิดกะ
//   ข้อ 23 ช่องนับธนบัตรห้ามแก้ค่าที่พิมพ์เอง ("1.5"→1 · "-3"→0 · "150000"→99,999 · "2e3"→2) — ช่องแดง + บอก + ไม่ให้ยืนยัน
//   ข้อ 59 คนที่นับเงินตั้งต้น (openedBy) ต้องอยู่ในแถวประวัติกะ (เดิมถูกลบตอนปิดกะ) — แต่ไม่ส่งขึ้นชีต
//   ข้อ 60 แถวประวัติกะเก็บ "จำนวน" บิลค้างบันทึกส่วนต่าง + รายการเฉพาะบิลที่ใหม่ตั้งแต่ปิดกะก่อน (เดิมคัดลอกทั้งร้านทุกคืน)
//  โค้ดจริง (app.js บน IndexedDB จริง + Apps Script จริงในชีตจำลอง)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<v65>/app.js node tests/test_fix_20261020_appB_shift.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok, makeEl } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- fix 20 ต.ค. (appB) ข้อ 23 · 59 · 60: ช่องนับธนบัตร · คนเปิดกะ · บิลค้างส่วนต่างในประวัติกะ ---');
const t = R.t;
const CUT = [{ id: 's1', name: 'ตัดผม', price: 300 }];

async function newShop() {
  const cash = { 1000: 1 };
  const s = await makeShop({ cash, role: 'owner',
    rows: { shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } } });
  s.cash = cash;
  return s;
}
function setCash(s, counts) { for (const k of Object.keys(s.cash)) delete s.cash[k]; Object.assign(s.cash, counts); }
async function open(s, who, counts) {
  setCash(s, counts || { 1000: 1 });
  loginAs(s.app, who || 'manager');
  s.app.cashCounterMode = 'open';
  await s.app.confirmCashCount(); await settle(20);
  return s.app.state.shift.active === true;
}
async function close(s, counts) {
  setCash(s, counts);
  loginAs(s.app, 'manager');
  s.app.cashCounterMode = 'close';
  const n0 = s.app.state.shift.history.length;
  await s.app.confirmCashCount(); await settle(30);
  const h = s.app.state.shift.history;
  return h.length === n0 + 1 ? h[h.length - 1] : null;
}
async function sell(s) {
  loginAs(s.app, 'staff');
  readyCheckout(s.env, CUT, 'cash', 300);
  const n0 = s.app.state.transactions.length;
  await s.app.processCheckout(); await settle(30);
  if (s.app.state.transactions.length !== n0 + 1) throw new Error('ขายไม่สำเร็จ ' + JSON.stringify(s.toasts.slice(-2)));
  return s.app.state.transactions[s.app.state.transactions.length - 1];
}
async function editDiscount(s, id, d) {
  loginAs(s.app, 'owner');
  s.app.openTransactionEdit(id);
  s.env.document.getElementById('edit-tx-discount').value = String(d);
  await s.app.saveTransactionEdit(); await settle(30);
}

(async () => {
  // ═══ ข้อ 23 ══════════════════════════════════════════════════════════════
  for (const bad of ['1.5', '-3', '150000', '2e3']) {
    const s = await newShop();
    try {
      s.toasts.length = 0;
      const opened = await open(s, 'manager', { 1000: bad });
      await t(`23. เปิดกะด้วยช่องนับ "${bad}" → ไม่เปิดกะ + บอกว่าต้องเป็นจำนวนเต็ม 0–99,999 (เดิมแก้ค่าให้เองแล้วเปิดกะ)`, () => {
        ok(!opened, 'เปิดกะไปแล้ว ด้วยเงินตั้งต้น ' + s.app.state.shift.startCash);
        ok(s.toasts.some(x => /จำนวนเต็ม 0–99,999/.test(x.m) && /1000 บาท/.test(x.m)), JSON.stringify(s.toasts.slice(-2)));
      });
    } finally { s.env.dispose(); }
  }
  {
    const s = await newShop();
    try {
      ok(await open(s, 'manager', { 1000: 1 }), 'เปิดกะไม่ได้');
      await sell(s);
      const h0 = s.app.state.shift.history.length;
      const log = await close(s, { 1000: 1, 100: '3.0' });
      await t('23. ปิดกะด้วยช่องนับ "3.0" → ไม่ปิดกะ · กะยังเปิด · ไม่มีแถวประวัติใหม่', () => {
        ok(!log, 'ปิดกะไปแล้ว');
        ok(s.app.state.shift.active); eq(s.app.state.shift.history.length, h0);
      });
      const log2 = await close(s, { 1000: 1, 100: '3' });
      await t('23. แก้เป็น "3" แล้วปิดกะได้ ยอดนับ 1,300 ผลต่าง 0', () => { ok(log2, 'ปิดกะไม่ได้'); eq([log2.countedCash, log2.difference], [1300, 0]); });
    } finally { s.env.dispose(); }
  }
  {
    // หน้าจอ: ช่องแดง + ค่าไม่ถูกเขียนทับ + บอกครั้งเดียวต่อชุดช่องที่ผิด
    const s = await newShop();
    try {
      const mk = (d, v) => { const el = makeEl('q' + d, { value: v }); el.setAttribute('data-denom', String(d)); el.removeAttribute = (k) => { delete el._attrs[k]; }; return el; };
      const inputs = [mk(1000, '2'), mk(100, '1.5'), mk(1, '-3')];
      s.env.document.querySelectorAll = (q) => (/cash-qty-input/.test(String(q)) ? inputs : []);
      s.app.cashCounterMode = 'open';
      s.toasts.length = 0;
      s.app.updateCashSum();
      s.app.updateCashSum();   // พิมพ์ต่ออีกตัว (ชุดช่องผิดเดิม) — ไม่ขึ้นซ้ำ
      await t('23. หน้าจอ: ช่องที่ผิดเป็นสีแดง (input-invalid + aria-invalid) · ช่องที่ถูกไม่แดง', () => {
        eq(inputs.map(i => i.classList.contains('input-invalid')), [false, true, true]);
        eq(inputs.map(i => i.getAttribute('aria-invalid')), [null, 'true', 'true']);
      });
      await t('23. หน้าจอ: ค่าที่พิมพ์ไม่ถูกเขียนทับ ("1.5" "-3" คงเดิม) · ยอดรวมนับเฉพาะช่องที่ถูก (2,000)', () => {
        eq(inputs.map(i => i.value), ['2', '1.5', '-3']);
        ok(/2,000\.00/.test(s.env.document.getElementById('cash-counter-total').innerText), s.env.document.getElementById('cash-counter-total').innerText);
      });
      await t('23. หน้าจอ: บอกครั้งเดียว (ไม่ท่วมจอทุกตัวอักษร) และบอกช่องที่ผิด', () => {
        const w = s.toasts.filter(x => /จำนวนเต็ม 0–99,999/.test(x.m));
        eq(w.length, 1, JSON.stringify(s.toasts)); ok(/100 บาท/.test(w[0].m) && /1 บาท/.test(w[0].m), w[0].m);
      });
      inputs[1].value = '1'; inputs[2].value = '0';
      s.app.updateCashSum();
      await t('23. แก้ครบแล้ว → ช่องหายแดง', () => eq(inputs.map(i => i.classList.contains('input-invalid')), [false, false, false]));
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 59 + 60 ══════════════════════════════════════════════════════════
  {
    const s = await newShop();
    try {
      ok(await open(s, 'manager', { 1000: 1 }), 'เปิดกะไม่ได้');   // ผู้จัดการ "บี" นับเงินตั้งต้น
      const a = await sell(s);
      await editDiscount(s, a.id, 100);                             // บิลค้างบันทึกส่วนต่าง (ร้านถือเงินเกินบิล 100)
      const log1 = await close(s, { 1000: 1, 100: 3 });
      await t('59. แถวประวัติกะมีชื่อคนนับเงินตั้งต้น (openedBy = "บี")', () => { ok(log1, 'ปิดกะไม่ได้'); eq(log1.openedBy, 'บี'); });
      await t('59. สถานะกะหลังปิดไม่มี openedBy ค้าง (กะใหม่ต้องได้ชื่อใหม่)', () => ok(!('openedBy' in s.app.state.shift)));
      await t('59. ไม่ส่ง openedBy ขึ้นชีต (สรุปการนับเงินของวัน)', () => {
        const dk = s.app.getBusinessISODate(s.app.shiftAnchorTime(log1));   // วันทำการที่กะถูกจัดเข้า (กะที่เปิด 03:00–06:00 = วันใหม่)
        const c = s.app.buildShiftCashSummary('day', dk);
        eq(c.shiftCount, 1);
        ok(!JSON.stringify(c).includes('openedBy'), JSON.stringify(c.shifts[0]));
        const pl = s.app.buildSummaryPayload(s.app.state.transactions, [], 'day', dk);
        ok(!JSON.stringify(pl).includes('openedBy'), 'payload สรุปวันมี openedBy');
      });
      await t('60. กะแรก: จำนวนค้าง 1 ใบ + รายการมีบิลนั้น', () => {
        eq(log1.unsettledCount, 1); eq((log1.unsettledAdjustments || []).map(u => u.billId), [a.id]);
      });

      ok(await open(s, 'owner', { 1000: 1 }), 'เปิดกะ 2 ไม่ได้');
      const log2 = await close(s, { 1000: 1 });
      await t('59. กะที่สองเปิดโดยเจ้าของ → openedBy = "เจ้าของร้าน"', () => eq(log2 && log2.openedBy, 'เจ้าของร้าน'));
      await t('60. กะที่สอง: ยังค้าง 1 ใบ (จำนวน) แต่ไม่คัดลอกรายการเดิมซ้ำ', () => {
        eq(log2.unsettledCount, 1); ok(!('unsettledAdjustments' in log2), JSON.stringify(log2.unsettledAdjustments));
      });

      ok(await open(s, 'manager', { 1000: 1 }), 'เปิดกะ 3 ไม่ได้');
      const b = await sell(s);
      await editDiscount(s, b.id, 50);
      const log3 = await close(s, { 1000: 1, 100: 3 });
      await t('60. กะที่สาม: ค้างรวม 2 ใบ · รายการเฉพาะบิลใหม่ของกะนี้', () => {
        eq(log3.unsettledCount, 2); eq((log3.unsettledAdjustments || []).map(u => u.billId), [b.id]);
      });
      await t('60. รายงานปิดกะ (Telegram) ยังบอกจำนวนค้างทั้งหมด 2 ใบ', () =>
        ok(/ยังไม่บันทึกคืน\/เก็บเงิน: 2 ใบ/.test(s.app.buildShiftReportMessage(log3)), s.app.buildShiftReportMessage(log3)));
    } finally { s.env.dispose(); }
  }

  R.done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
