// a5 audit: randomized drawer simulation — real flows (checkout/edit/settle/void/expense/close/open)
// compares computeShiftDrawer / shift history expectedCash with a hand model of real cash in the drawer
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const SEEDS = Number(process.env.SEEDS || 6), SHIFTS = Number(process.env.SHIFTS || 3), OPS = Number(process.env.OPS || 18);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

async function editBill(env, txId, o) {
  const app = env.app;
  app.openTransactionEdit(txId);
  if (o.payment !== undefined) env.document.getElementById('edit-tx-payment').value = o.payment;
  if (o.discount !== undefined) env.document.getElementById('edit-tx-discount').value = String(o.discount);
  await app.saveTransactionEdit();
  await settle(15);
}
const setCount = (cashObj, amt) => { for (const k in cashObj) delete cashObj[k]; cashObj[1000] = Math.floor(amt / 1000); cashObj[1] = amt % 1000; };

(async () => {
  const problems = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const R = rng(seed * 7919);
    const pick = a => a[Math.floor(R() * a.length)];
    const cashObj = { 1000: 1 };
    const { env, app, toasts } = await makeShop({ cash: cashObj });
    await settle();
    // seeded shift: startCash 1000, real drawer 1000
    let real = 1000;
    // per-bill truth: real cash net paid by customer for this bill (for refund) + shift tag
    const truth = {}; // id -> { cash, pp, card, shift, recorded, actual, discount, price, voided }
    const log = [];
    for (let s = 0; s < SHIFTS; s++) {
      const shiftStart = Number(app.state.shift.startTime);
      for (let op = 0; op < OPS; op++) {
        const r = R();
        const live = app.state.transactions.filter(t => truth[t.id]);
        if (r < 0.45 || live.length === 0) {
          // SALE
          const method = pick(['cash', 'cash', 'promptpay', 'credit', 'split']);
          const price = 100 * (1 + Math.floor(R() * 12));
          const disc = (method === 'cash' || method === 'promptpay') && price > 100 ? pick([0, 0, 50, 100]) : 0;
          // wrong-channel at sale (cash<->promptpay) 15%
          let actual = method;
          if ((method === 'cash' || method === 'promptpay') && R() < 0.15) actual = method === 'cash' ? 'promptpay' : 'cash';
          readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price }], method, method === 'cash' ? price + pick([0, 20, 500]) : undefined);
          env.document.getElementById('cart-discount').value = String(disc);
          let cashPart = 0;
          if (method === 'split') { cashPart = 1 + Math.floor(R() * (price - 1)); env.document.getElementById('split-cash-amount').value = String(cashPart); }
          app.beginCheckoutAttempt();
          if (method === 'split') env.document.getElementById('split-cash-amount').value = String(cashPart);
          const n0 = app.state.transactions.length;
          await app.processCheckout(); await settle(15);
          if (app.state.transactions.length === n0) { problems.push(`seed${seed} sale failed ${method} ${price} ${toasts.slice(-2).map(x => x.m).join('|')}`); continue; }
          const tx = app.state.transactions[app.state.transactions.length - 1];
          const total = tx.total;
          const cashIn = method === 'cash' ? (actual === 'cash' ? total : 0) : method === 'promptpay' ? (actual === 'cash' ? total : 0) : method === 'split' ? cashPart : 0;
          real += cashIn;
          truth[tx.id] = { cash: cashIn, shift: shiftStart, recorded: method, actual, total, wrongOffset: actual !== method ? ((method === 'cash' ? total : 0) - cashIn) : 0 };
          log.push(`S${s} sale ${tx.id.slice(-4)} ${method}${actual !== method ? '(real ' + actual + ')' : ''} total=${total} cashIn=${cashIn}`);
        } else if (r < 0.65) {
          // EDIT discount / fix channel and record what really happened
          const cand = live.filter(t => (t.paymentMethod === 'cash' || t.paymentMethod === 'promptpay'));
          if (!cand.length) continue;
          const tx = pick(cand); const T = truth[tx.id];
          if (T.actual !== tx.paymentMethod) {
            // fix channel to the truth, then follow hints (correction / waive)
            await editBill(env, tx.id, { payment: T.actual });
            const cur = app.state.transactions.find(x => x.id === tx.id);
            const st = app.billMoneyStatus(cur);
            if (!st.settled) {
              const ok = await app.recordBillSettlement(tx.id, 'correction');
              if (ok) T.wrongOffset = 0;
              log.push(`S${s} fixchannel ${tx.id.slice(-4)} -> ${T.actual} correction=${ok}`);
            }
          } else {
            const curDisc = Number(tx.discount) || 0;
            const sub = Number(tx.subtotal);
            const newDisc = pick([0, 50, 100, 150].filter(d => d !== curDisc && d < sub));
            if (newDisc === undefined) continue;
            const before = tx.total;
            const st0 = app.billMoneyStatus(tx);
            const tainted = !st0.settled || st0.settlements.some(x => x.kind === 'waive');   // earlier unrecorded/waived diff gets folded into the next diff
            await editBill(env, tx.id, { discount: newDisc });
            const cur = app.state.transactions.find(x => x.id === tx.id);
            const delta = cur.total - before; // + collect / - refund
            if (delta === 0) continue;
            const what = tainted && !process.env.ALLOW_TAINT ? pick(['waive', 'leave']) : pick(['moved', 'moved', 'waive', 'leave']);
            if (what === 'leave') { log.push(`S${s} edit ${tx.id.slice(-4)} disc ${curDisc}->${newDisc} unsettled`); continue; }
            const st = app.billMoneyStatus(cur);
            if (st.settled) continue;
            const ok = await app.recordBillSettlement(tx.id, what);
            if (ok && what === 'moved' && T.actual === 'cash') { real += delta; T.cash += delta; }
            log.push(`S${s} edit ${tx.id.slice(-4)} disc ${curDisc}->${newDisc} ${what} ok=${ok} delta=${delta}`);
          }
        } else if (r < 0.78) {
          // VOID (skip uncorrected wrong-channel bills — real refund channel ambiguous)
          const cand = live.filter(t => truth[t.id].actual === t.paymentMethod || t.paymentMethod === 'split' || t.paymentMethod === 'credit');
          if (!cand.length) continue;
          const tx = pick(cand); const T = truth[tx.id];
          const outcome = pick(['refunded', 'none']);
          // ตรวจ 14 ต.ค. ข้อ 2: บิลที่มีส่วนต่างค้าง ระบบต้องไม่ยอมให้ยกเลิก (ต้องบันทึกส่วนต่างก่อน)
          const pendingBefore = app.isPendingSettlementBill(tx);
          app.openTransactionEdit(tx.id);
          env.document.getElementById('void-money-outcome').value = outcome;
          env.document.getElementById('edit-tx-id').value = tx.id;
          await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle(15);
          if (pendingBefore) { if (!app.state.transactions.some(x => x.id === tx.id)) problems.push(`seed${seed} voided a bill with pending settlement`); else log.push(`S${s} void ${tx.id.slice(-4)} blocked (pending settlement) ok`); continue; }
          if (app.state.transactions.some(x => x.id === tx.id)) { problems.push(`seed${seed} void failed ${toasts.slice(-1).map(x => x.m)}`); continue; }
          if (outcome === 'refunded') real -= T.cash;
          log.push(`S${s} void ${tx.id.slice(-4)} ${outcome} realCashOut=${outcome === 'refunded' ? T.cash : 0} (billShift ${T.shift === shiftStart ? 'this' : 'prev'})`);
          delete truth[tx.id];
        } else if (r < 0.93) {
          // EXPENSE
          const amt = 10 * (1 + Math.floor(R() * 40));
          const src = pick(['drawer', 'drawer', 'other']);
          const d = env.document;
          d.getElementById('expense-type').value = pick(['staff', 'supply', 'other']);
          d.getElementById('expense-amount').value = String(amt);
          d.getElementById('expense-source').value = src;
          d.getElementById('expense-note').value = 'n' + op;
          d.getElementById('expense-staff-id').value = 'st-1';
          const n0 = app.state.shift.expenses.length;
          await app.addExpense(); await settle(10);
          if (app.state.shift.expenses.length === n0) { problems.push(`seed${seed} expense failed`); continue; }
          if (src === 'drawer') real -= amt;
          log.push(`S${s} expense ${amt} ${src}`);
        } else {
          // DELETE an expense (entered by mistake — money never left)
          const ex = app.state.shift.expenses;
          if (!ex.length) continue;
          const e = pick(ex);
          await app.deleteExpense(e.id); if (app._confirmP) await app._confirmP; await settle(10);
          if (app.state.shift.expenses.some(x => x.id === e.id)) { problems.push(`seed${seed} expense delete failed`); continue; }
          if (e.paidFrom !== 'other') real += e.amount;
          log.push(`S${s} delexp ${e.amount} ${e.paidFrom}`);
        }
        const calc = app.computeShiftDrawer(app.state.shift);
        const exp = Math.round((calc.expected - calc.overspend) * 100) / 100;
        const offset = Object.values(truth).reduce((a, T) => a + (T.wrongOffset || 0), 0);
        if (exp !== real + offset) {
          problems.push(`seed${seed} S${s} after op#${op} [${log[log.length - 1]}]: system expected ${exp} vs real+offset ${real + offset}`);
          real = exp - offset; // resync so later ops are checked independently
        }
      }
      // CLOSE: count = real
      setCount(cashObj, Math.max(0, real));
      app.cashCounterMode = 'close';
      await app.confirmCashCount(); await settle(30);
      const h = app.state.shift.history[app.state.shift.history.length - 1];
      const offC = Object.values(truth).reduce((a, T) => a + (T.wrongOffset || 0), 0);
      Object.values(truth).forEach(T => { T.wrongOffset = 0; });   // realized as this shift's difference
      if (!h || Math.round(h.difference * 100) !== Math.round(-offC * 100) || h.countedCash !== real) problems.push(`seed${seed} close S${s}: counted ${h && h.countedCash} expected ${h && h.expectedCash} diff ${h && h.difference} real ${real} wantDiff ${-offC}`);
      // OPEN next shift with the real drawer
      await settle(5);
      setCount(cashObj, Math.max(0, real));
      app.cashCounterMode = 'open';
      await app.confirmCashCount(); await settle(10);
      if (!app.state.shift.active) problems.push(`seed${seed} open failed`);
    }
    env.dispose && env.dispose();
    console.log(`seed ${seed}: ${log.length} ops`);
    if (process.env.VERBOSE) console.log(log.join('\n'));
  }
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'NO MISMATCH');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
