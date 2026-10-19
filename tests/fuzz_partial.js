// reviewer fuzzer: sell / edit (+ full or PARTIAL real refund/collect, any channel) / waive / void / close+reopen
// truth model of physical drawer cash; void 'refunded' = customer gets back their net CASH (if positive) in cash,
// everything else through the original non-cash channel (the app's own rule for swap bills).
const path = require('path');
const T = path.join(__dirname, '..', 'tests');
const { makeShop, readyCheckout, settle } = require(path.join(T, 'fixtures_db.js'));
const SEED0 = Number(process.argv[2] || 1), RUNS = Number(process.argv[3] || 20), OPS = Number(process.argv[4] || 30);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const notes = (amt) => { const n = {}; let r = amt; [1000, 500, 100].forEach(d => { const k = Math.floor(r / d); if (k) n[d] = k; r -= k * d; }); if (r) n[1] = r; return n; };
async function run(seed) {
  const R = rng(seed); const pick = a => a[Math.floor(R() * a.length)];
  const O = { cash: { 1000: 1 }, rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } };
  const { env, app } = await makeShop(O); await settle();
  const d = env.document; const log = [], problems = [];
  let physical = 1000;
  const bills = new Map();   // id -> { cashNet }
  const expected = () => app.computeShiftDrawer(app.state.shift).expected;
  const check = (tag) => { if (!app.state.shift.active) return; const e = expected(); if (Math.round(e * 100) !== Math.round(physical * 100)) problems.push(`${tag}: expected=${e} physical=${physical}`); };
  const editBill = async (id, disc) => { app.openTransactionEdit(id); d.getElementById('edit-tx-discount').value = String(disc); await app.saveTransactionEdit(); await settle(5); };
  for (let k = 0; k < OPS; k++) {
    await settle(2);
    const live = app.state.transactions.filter(t => bills.has(t.id));
    const settledLive = live.filter(t => app.billMoneyStatus(t).settled);
    const r = R();
    if (!app.state.shift.active) { O.cash = notes(physical); app.cashCounterMode = 'open'; await app.confirmCashCount(); await settle(5); log.push(`OPEN ${physical}`); check('open'); continue; }
    if (r < 0.3 || !live.length) {
      const amt = pick([300, 500, 700]); const m = pick(['cash', 'promptpay', 'credit']);
      readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amt }], m, amt); await app.processCheckout(); await settle(5);
      const tx = app.state.transactions[app.state.transactions.length - 1];
      if (m === 'cash') physical += amt;
      bills.set(tx.id, { cashNet: m === 'cash' ? amt : 0, net: tx.total, m });
      log.push(`SELL ${tx.id.slice(-4)} ${amt} ${m} (total ${tx.total})`); check('sell');
    } else if (r < 0.65 && settledLive.length) {
      const tx = pick(settledLive); const b = bills.get(tx.id);
      const disc = Number(tx.discount) || 0;
      const up = R() < 0.6;   // discount up = refund owed
      const step = pick([100, 200]);
      let nd = up ? disc + step : disc - step;
      if (nd < 0 || (Number(tx.subtotal) || 0) - nd < 100) continue;
      await editBill(tx.id, nd);
      const st = app.billMoneyStatus(tx);
      if (st.settled) continue;
      const net = st.diffs.reduce((a, x) => a + Math.round(x.amount * 100), 0) / 100;
      const choice = R();
      let via = pick(['cash', 'promptpay', 'credit']); if (process.env.SAMECH) via = b.m;
      if (net === 0 || choice < 0.25) {
        await app.recordBillSettlement(tx.id, 'waive'); log.push(`EDIT ${tx.id.slice(-4)} disc ${disc}->${nd} WAIVE ${JSON.stringify(st.diffs)}`);
      } else {
        const full = Math.abs(net);
        const amt = (choice < 0.6 || process.env.NOPARTIAL) ? full : Math.max(1, Math.round(full * pick([0.25, 0.5, 0.75])));
        const ok = await app.recordBillSettlement(tx.id, 'moved', via, amt < full ? amt : undefined);
        log.push(`EDIT ${tx.id.slice(-4)} disc ${disc}->${nd} diffs ${JSON.stringify(st.diffs)} MOVED ${via} ${Math.sign(net) * amt}${amt < full ? ' (partial)' : ''} ok=${ok}`);
        if (ok) { b.net += Math.sign(net) * amt; if (via === 'cash') { physical += Math.sign(net) * amt; b.cashNet += Math.sign(net) * amt; } }
        else problems.push(`moved refused diffs=${JSON.stringify(st.diffs)} via=${via} amt=${amt}`);
      }
      const st2 = app.billMoneyStatus(tx);
      if (!st2.settled) { await app.recordBillSettlement(tx.id, 'waive'); log.push(`  leftover waive ${JSON.stringify(st2.diffs)}`); }
      const finalStatus = app.billMoneyStatus(tx);
      if (finalStatus.invalid) problems.push('invalid money history (ข้อมูลเงินเสีย)');
      else if (!finalStatus.settled) problems.push(`pending money difference (ส่วนต่างค้าง) ${JSON.stringify(finalStatus.diffs)}`);
      check('edit');
    } else if (r < 0.85 && settledLive.length) {
      const tx = pick(settledLive); const outcome = pick(['refunded', 'none']); const b = bills.get(tx.id);
      d.getElementById('edit-tx-id').value = tx.id; d.getElementById('void-money-outcome').value = outcome;
      const plan = app.planVoidCash(tx, outcome);
      await app.voidTransaction(); await (app._confirmP || settle(5)); await settle(5);
      if (app.state.transactions.find(x => x.id === tx.id)) { problems.push('void did not happen'); continue; }
      bills.delete(tx.id);
      const truth = outcome === 'refunded' ? (b.m === 'cash' ? -b.net : 0) : 0;
      physical += truth;
      log.push(`VOID ${tx.id.slice(-4)} ${outcome} app cashEffect=${plan.cashEffect} truth=${truth} cashNet=${b.cashNet} stl=${JSON.stringify((tx.settlements||[]).map(s=>[s.kind.slice(0,3),s.method.slice(0,3),s.amount,s.swap?'S':s.partialRest?'P':'',s.supersededAt?'x':'']))}`);
      check('void');
    } else if (r < 0.93) {
      O.cash = notes(physical); app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(5);
      const h = app.state.shift.history[app.state.shift.history.length - 1];
      log.push(`CLOSE expected=${h.expectedCash} counted=${h.countedCash} diff=${h.difference}`);
      if (h.difference !== 0) problems.push(`close diff ${h.difference}`);
    }
  }
  env.dispose(); return { problems, log };
}
(async () => {
  let bad = 0; const kinds = {};
  for (let s = SEED0; s < SEED0 + RUNS; s++) {
    const { problems, log } = await run(s);
    if (problems.length) { bad++; problems.forEach(p => { const k = p.replace(/-?\d+(\.\d+)?/g, 'N').slice(0, 60); kinds[k] = (kinds[k] || 0) + 1; });
      if (bad <= 2) { console.log(`--- seed ${s}`); console.log(log.join('\n')); console.log('PROBLEMS:\n ' + problems.join('\n ')); } }
  }
  console.log(`\n${RUNS} runs, ${bad} with problems`); console.log(kinds); process.exit(bad ? 1 : 0);
})();
