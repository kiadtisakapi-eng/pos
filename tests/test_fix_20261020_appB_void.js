// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) — ข้อ 1: ป้ายตัวเลือก "เงินของบิลนี้" ตอนยกเลิกบิล
//  เดิมป้าย "ไม่มีเงินเคลื่อนไหว (บิลออกผิด/ซ้ำ…)" พาพนักงานเลือกผิดเมื่อบิลซ้ำ/ออกบิลใหม่แทนในกะเดียวกัน
//  → เงินสดของบิลที่ยกเลิกยังนับในยอดที่ควรมี แล้วบิลใหม่นับซ้ำ → ปิดกะขาดเท่าเงินสดของบิลนั้น (สูตรถูก ป้ายผิด)
//  ตรวจ: ป้ายใน index.html · ป้าย/คำใบ้ที่แอปเขียนตอนเปิดบิล · ถามย้ำเมื่อเหตุผลบอกว่าซ้ำแต่เลือก "ยังอยู่ที่ร้าน"
//        · ยอดปิดกะจริงเมื่อทำตามป้าย (บิลซ้ำ 300 · แบ่งจ่ายออกใหม่) = ตรงพอดี · บิลซ้ำของกะก่อน = ข้อสอง ตรงพอดี
//  โค้ดจริง (app.js บน IndexedDB จริง + Apps Script จริงในชีตจำลอง)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<v65>/app.js node tests/test_fix_20261020_appB_void.js → ต้องตก
//  (ป้ายใน index.html อ่านจากโฟลเดอร์เดียวกับ app.js ที่ทดสอบ)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const { makeRunner, eq, ok, makeEl } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- fix 20 ต.ค. (appB) ข้อ 1: ป้ายยกเลิกบิล "เอาเงินออกจากยอดที่ควรมี / ยังอยู่ที่ร้าน" + ยอดปิดกะ ---');
const t = R.t;

const APP_DIR = path.dirname(process.env.POS_APP_SRC || path.join(__dirname, '..', 'app.js'));
const HTML = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
const LABEL_REFUNDED = 'เอาเงินของบิลนี้ออกจากยอดที่ควรมี (คืนเงินสดแล้ว · บิลซ้ำ · จะออกบิลใหม่แทน)';
const LABEL_NONE = 'เงินของบิลนี้ยังอยู่ที่ร้าน (ไม่ได้คืนเงินสด / คืนทางโอน)';
const CUT = [{ id: 's1', name: 'ตัดผม', price: 300 }];
const MASSAGE_CUT = [{ id: 's2', name: 'นวดไทย', price: 500 }, { id: 's1', name: 'ตัดผม', price: 300 }];

async function shop() {
  const cash = { 1000: 1 };
  const s = await makeShop({ cash, role: 'owner' });
  s.cash = cash;
  s.app.cashCounterMode = 'open';
  await s.app.confirmCashCount(); await settle(20);
  if (!s.app.state.shift.active) throw new Error('เปิดกะไม่ได้: ' + JSON.stringify(s.toasts.slice(-2)));
  // ป้ายตัวเลือก refunded ที่แอปเขียนตอนเปิดบิล (DOM จำลองไม่มี querySelector — ใส่ตัวเลือกให้)
  s.opt = makeEl('opt-refunded');
  s.env.document.getElementById('void-money-outcome').querySelector = (q) => (/refunded/.test(q) ? s.opt : null);
  return s;
}
async function sell(s, items, pay, extra) {
  const { env, app } = s;
  loginAs(app, 'staff');
  readyCheckout(env, items, pay, (extra && extra.received) || 100000);
  if (pay === 'split') env.document.getElementById('split-cash-amount').value = String(extra.cashPart);
  const n0 = app.state.transactions.length;
  await app.processCheckout(); await settle(30);
  if (app.state.transactions.length !== n0 + 1) throw new Error('ขายไม่สำเร็จ: ' + JSON.stringify(s.toasts.slice(-2)));
  return app.state.transactions[app.state.transactions.length - 1];
}
function openBill(s, id) {
  loginAs(s.app, 'manager');
  s.app.openTransactionEdit(id);
  return { hint: s.env.document.getElementById('void-money-hint').innerText, label: s.opt.textContent };
}
async function voidBill(s, id, outcome, reason, answer) {
  const { env, app } = s;
  const asks = [];
  app.askConfirm = async (m) => { asks.push(m); return answer === undefined ? true : answer; };
  openBill(s, id);
  env.document.getElementById('void-money-outcome').value = outcome;
  env.document.getElementById('void-note').value = reason;
  app._confirmP = null;
  await app.voidTransaction();
  if (app._confirmP) await app._confirmP;
  await settle(30);
  return { asks, voided: !app.state.transactions.some(t => t.id === id), confirm: app._lastConfirmMsg || '' };
}
// ปิดกะด้วยเงินที่นับได้จริง (จำนวนแบงก์ 1000 + เหรียญ 1 บาท) ผ่าน confirmCashCount ตัวจริง
async function closeWith(s, amount) {
  for (const k of Object.keys(s.cash)) delete s.cash[k];
  s.cash[1000] = Math.floor(amount / 1000); s.cash[1] = amount % 1000;
  loginAs(s.app, 'manager');
  s.app.cashCounterMode = 'close';
  const n0 = s.app.state.shift.history.length;
  await s.app.confirmCashCount(); await settle(30);
  const h = s.app.state.shift.history;
  if (h.length !== n0 + 1) throw new Error('ปิดกะไม่สำเร็จ: ' + JSON.stringify(s.toasts.slice(-3)));
  return h[h.length - 1];
}

(async () => {
  // ── ป้ายใน index.html ─────────────────────────────────────────────────────
  await t('index.html: ป้ายตัวเลือก refunded/none ตามที่เจ้าของอนุมัติ (ค่า refunded/none เหมือนเดิม)', () => {
    const r = (HTML.match(/<option value="refunded">([^<]*)<\/option>/) || [])[1];
    const n = (HTML.match(/<option value="none">([^<]*)<\/option>/) || [])[1];
    eq(r, LABEL_REFUNDED, 'ป้าย refunded');
    eq(n, LABEL_NONE, 'ป้าย none');
  });
  await t('index.html: ไม่มีป้ายเดิมที่บอกให้บิลซ้ำ/ออกผิดเลือก "ไม่มีเงินเคลื่อนไหว"', () => {
    ok(!/บิลออกผิด\/ซ้ำ/.test(HTML), 'ยังมีป้ายเดิม');
  });

  // ── A. บิลเงินสดซ้ำในกะเดียวกัน (ลูกค้าจ่าย 300 ครั้งเดียว แต่กดขายสองรอบ) ──────────
  for (const outcome of ['refunded', 'none']) {
    const s = await shop();
    try {
      await sell(s, CUT, 'cash', { received: 300 });
      const dup = await sell(s, CUT, 'cash', { received: 300 });
      const shown = openBill(s, dup.id);
      if (outcome === 'refunded') {
        await t('A. บิลกะนี้มีเงินสด: ป้ายข้อแรกตามที่อนุมัติ', () => eq(shown.label, LABEL_REFUNDED));
        await t('A. คำใบ้: "บิลซ้ำ/ออกบิลใหม่แทน → เลือกข้อแรก ไม่งั้นปิดกะขาด ฿300.00"', () =>
          ok(shown.hint.includes('บิลซ้ำ/ออกบิลใหม่แทน → เลือกข้อแรก ไม่งั้นปิดกะขาด ฿300.00'), shown.hint));
      }
      const v = await voidBill(s, dup.id, outcome, 'ออกบิลซ้ำ');
      await t(`A. (${outcome}) ยกเลิกสำเร็จ`, () => ok(v.voided, JSON.stringify(s.toasts.slice(-2))));
      if (outcome === 'refunded') {
        await t('A. (refunded) ไม่ถามย้ำ · กล่องยืนยันใช้คำใหม่ "เอาออกจากยอดที่ควรมี"', () => {
          eq(v.asks.length, 0, 'ถามย้ำทั้งที่เลือกถูก');
          ok(/เงิน: เอาออกจากยอดที่ควรมี/.test(v.confirm), v.confirm);
        });
      } else {
        await t('A. (none + เหตุผล "ออกบิลซ้ำ") ถามย้ำหนึ่งครั้ง พร้อมยอดที่จะขาด ฿300.00', () => {
          eq(v.asks.length, 1, 'ไม่ได้ถามย้ำ');
          ok(/ปิดกะจะขาด ฿300\.00/.test(v.asks[0]) && /เอาเงินของบิลนี้ออกจากยอดที่ควรมี/.test(v.asks[0]), v.asks[0]);
          ok(/เงิน: ยังอยู่ที่ร้าน/.test(v.confirm), v.confirm);
        });
      }
      const log = await closeWith(s, 1000 + 300);   // ลิ้นชักจริง: เงินตั้งต้น 1000 + ลูกค้าจ่าย 300 ครั้งเดียว
      if (outcome === 'refunded') {
        await t('A. ทำตามป้าย (ข้อแรก) → ปิดกะตรงพอดี (ผลต่าง 0)', () => eq(log.difference, 0));
      } else {
        await t('A. เลือกข้อสองทั้งที่เป็นบิลซ้ำ → ปิดกะขาด −300 (สูตรเงินเดิม ไม่เปลี่ยน — ถามย้ำแล้วตามที่บอกไว้)', () => eq(log.difference, -300));
      }
    } finally { s.env.dispose(); }
  }

  // ── A2. ตอบ "ยกเลิก" ในกล่องถามย้ำ = ไม่ยกเลิกบิล ไม่แตะลิ้นชัก ──────────────
  {
    const s = await shop();
    try {
      const a = await sell(s, CUT, 'cash', { received: 300 });
      const before = s.app.computeShiftDrawer(s.app.state.shift).expected;
      const v = await voidBill(s, a.id, 'none', 'คิดเงินผิด จะออกบิลใหม่', false);
      await t('A2. ตอบไม่ยืนยันในกล่องถามย้ำ → บิลยังอยู่ · ไม่มีประวัติยกเลิก · ลิ้นชักเท่าเดิม', () => {
        eq(v.asks.length, 1, 'ไม่ได้ถามย้ำ');
        ok(!v.voided, 'บิลถูกยกเลิกทั้งที่ตอบไม่');
        eq((s.app.state.voidLog || []).length, 0);
        eq(s.app.computeShiftDrawer(s.app.state.shift).expected, before);
      });
      const v2 = await voidBill(s, a.id, 'none', 'ลูกค้าเปลี่ยนใจ ไม่ได้คืนเงิน');
      await t('A2. เหตุผลอื่น (ไม่ใช่ซ้ำ/ออกใหม่) + ข้อสอง → ไม่ถามย้ำ ยกเลิกได้', () => {
        eq(v2.asks.length, 0); ok(v2.voided);
      });
    } finally { s.env.dispose(); }
  }

  // ── B. บิลแบ่งจ่ายผิด → ยกเลิกแล้วออกใหม่ (กติกาเจ้าของ) · ลูกค้าให้เงินสด 400 แล้วเพิ่มอีก 100 ──────────
  {
    const s = await shop();
    try {
      const wrong = await sell(s, MASSAGE_CUT, 'split', { cashPart: 400 });
      const shown = openBill(s, wrong.id);
      await t('B. บิลแบ่งจ่าย: ป้ายข้อแรกบอกส่วนบัตรคืนทางเดิม · คำใบ้บอกยอดที่จะขาด ฿400.00', () => {
        ok(shown.label.startsWith(LABEL_REFUNDED) && /ส่วนบัตร\/โอนคืนทางเดิม/.test(shown.label), shown.label);
        ok(shown.hint.includes('เลือกข้อแรก ไม่งั้นปิดกะขาด ฿400.00'), shown.hint);
      });
      const v = await voidBill(s, wrong.id, 'refunded', 'คิดเงินผิด ออกบิลใหม่');
      await t('B. ยกเลิกบิลผิดด้วยข้อแรก (ไม่ถามย้ำ)', () => { ok(v.voided); eq(v.asks.length, 0); });
      await sell(s, MASSAGE_CUT, 'split', { cashPart: 500 });
      const log = await closeWith(s, 1000 + 500);
      await t('B. ออกบิลใหม่แล้วปิดกะ → ตรงพอดี (เดิมตามป้ายเก่าขาด −400)', () => eq(log.difference, 0));
    } finally { s.env.dispose(); }
  }

  // ── C. บิลซ้ำของกะก่อน → ข้อสอง (ไม่กระทบลิ้นชักกะนี้) ─────────────────────
  {
    const s = await shop();
    try {
      await sell(s, CUT, 'cash', { received: 300 });
      const dup = await sell(s, CUT, 'cash', { received: 300 });
      await closeWith(s, 1000 + 600);              // กะก่อนนับตามยอดในระบบ (ยังไม่รู้ว่าซ้ำ)
      s.cash[1000] = 1; s.cash[1] = 0;
      loginAs(s.app, 'owner');
      s.app.cashCounterMode = 'open';
      await s.app.confirmCashCount(); await settle(20);
      const shown = openBill(s, dup.id);
      await t('C. คำใบ้บิลกะก่อน: "บิลซ้ำของกะก่อน → เลือกข้อสอง (ไม่กระทบลิ้นชักกะนี้)"', () =>
        ok(shown.hint.includes('บิลซ้ำของกะก่อน → เลือกข้อสอง (ไม่กระทบลิ้นชักกะนี้)'), shown.hint));
      loginAs(s.app, 'owner');
      const v = await voidBill(s, dup.id, 'none', 'ออกบิลซ้ำ (เมื่อวาน)');
      await t('C. บิลกะก่อน + ข้อสอง → ไม่ถามย้ำ (ไม่มีเงินสดของบิลในลิ้นชักกะนี้)', () => { ok(v.voided); eq(v.asks.length, 0); });
      const log = await closeWith(s, 1000);
      await t('C. กะนี้ปิดตรงพอดี', () => eq(log.difference, 0));
    } finally { s.env.dispose(); }
  }

  // ── D. บิลบัตร: ป้ายข้อแรกบอกว่าไม่กระทบลิ้นชัก ───────────────────────────
  {
    const s = await shop();
    try {
      const card = await sell(s, CUT, 'credit');
      const shown = openBill(s, card.id);
      await t('D. บิลบัตร: ป้ายข้อแรกบอก "ไม่กระทบลิ้นชัก" (ไม่ใช่ "ออกจากลิ้นชัก")', () =>
        ok(/ไม่กระทบลิ้นชัก/.test(shown.label) && !/ออกจากลิ้นชัก/.test(shown.label), shown.label));
    } finally { s.env.dispose(); }
  }

  R.done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
