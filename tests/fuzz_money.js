// a6 fuzzer: random sequences of sell / edit+settle / fix channel / void / close+reopen
// Model of where cash physically is vs app's computeShiftDrawer().expected and shift-close difference.
const path = require('path');
const T = path.join(__dirname, '..', 'tests');
const { makeShop, readyCheckout, settle } = require(path.join(T, 'fixtures_db.js'));

const SEED0 = Number(process.argv[2] || 1), RUNS = Number(process.argv[3] || 20), OPS = Number(process.argv[4] || 30);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const notes = (amt) => { const n = {}; let r = amt; [1000, 500, 100].forEach(d => { const k = Math.floor(r / d); if (k) n[d] = k; r -= k * d; }); if (r) n[1] = r; return n; };

async function run(seed) {
  const R = rng(seed); const pick = a => a[Math.floor(R() * a.length)];
  const O = { cash: { 1000: 1 }, rows: { googleSheetsUrl: '', googleSheetsApiToken: '' } };
  const { env, app } = await makeShop(O);
  await settle();
  const d = env.document;
  const log = [], problems = [];
  let physical = 1000;                 // cash physically in the drawer of the current shift
  let shiftId = app.state.shift.startTime;
  const bills = new Map();             // id -> { soldShift, misCash (recordedCash - truthCash at sale), truth, waived }
  const expected = () => app.computeShiftDrawer(app.state.shift).expected;
  const misInShift = () => [...bills.values()].filter(b => b.soldShift === shiftId && b.mis).reduce((a, b) => a + b.misCash, 0);
  const check = (tag) => {
    if (!app.state.shift.active) return;
    const e = expected(), want = physical + misInShift();
    if (Math.round(e * 100) !== Math.round(want * 100)) problems.push(`${tag}: expected=${e} model=${want} (physical ${physical}, unresolved mis ${misInShift()})`);
  };
  const editBill = async (id, o) => {
    app.openTransactionEdit(id);
    if (o.payment !== undefined) d.getElementById('edit-tx-payment').value = o.payment;
    if (o.discount !== undefined) d.getElementById('edit-tx-discount').value = String(o.discount);
    await app.saveTransactionEdit(); await settle(5);
  };
  // truthful user resolves outstanding diff: pending = real money moved now { method, amount } or null
  const resolve = async (id, pending, tag) => {
    for (let i = 0; i < 5; i++) {
      const tx = app.state.transactions.find(x => x.id === id);
      const st = app.billMoneyStatus(tx);
      if (st.invalid) { problems.push(`${tag}: bill money status invalid`); return; }
      if (st.settled) { if (pending) problems.push(`${tag}: bill settled but real move ${JSON.stringify(pending)} never recorded`); return; }
      const net = st.diffs.reduce((a, x) => a + Math.round(x.amount * 100), 0) / 100;
      const corr = app.planSettlementEntries(tx, st, 'correction');
      let ok;
      if (pending && net === pending.amount) { ok = await app.recordBillSettlement(id, 'moved', pending.method); log.push(`  moved ${pending.method} ${pending.amount}`); pending = null; }
      else if (corr.moved) { ok = await app.recordBillSettlement(id, 'correction'); log.push('  correction'); }
      else if (!pending) { ok = await app.recordBillSettlement(id, 'waive'); log.push(`  waive ${JSON.stringify(st.diffs)}`); }
      else { problems.push(`${tag}: UNRECORDABLE real move ${JSON.stringify(pending)} vs diffs ${JSON.stringify(st.diffs)}`); return 'stuck'; }
      if (!ok) { problems.push(`${tag}: settlement call refused`); return 'stuck'; }
    }
    problems.push(`${tag}: not settled after 5 steps`);
  };
  for (let k = 0; k < OPS; k++) {
    await settle(2);
    const live = app.state.transactions.filter(t => bills.has(t.id));
    const settledLive = live.filter(t => app.billMoneyStatus(t).settled);
    const r = R();
    if (!app.state.shift.active) {
      // reopen
      O.cash = notes(physical);
      app.cashCounterMode = 'open'; await app.confirmCashCount(); await settle(5);
      shiftId = app.state.shift.startTime; log.push(`OPEN start ${physical}`); check('open'); continue;
    }
    if (r < 0.28 || live.length === 0) {
      const amt = pick([300, 500]); const rec = pick(['cash', 'promptpay']); const truth = R() < 0.25 ? (rec === 'cash' ? 'promptpay' : 'cash') : rec;
      readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amt }], rec, amt);
      await app.processCheckout(); await settle(5);
      const tx = app.state.transactions[app.state.transactions.length - 1];
      if (truth === 'cash') physical += amt;
      bills.set(tx.id, { soldShift: shiftId, mis: rec !== truth, misCash: (rec === 'cash' ? amt : 0) - (truth === 'cash' ? amt : 0), truth, waived: false });
      log.push(`SELL ${tx.id.slice(-4)} ${amt} rec=${rec} truth=${truth}`); check('sell');
    } else if (r < 0.62 && settledLive.length) {
      const tx = pick(settledLive); const b = bills.get(tx.id);
      const kind = pick(['refund', 'collect', 'waive']); const via = pick(['cash', 'promptpay', 'credit']);
      const disc = Number(tx.discount) || 0;
      let nd;
      if (kind === 'collect') { if (disc < 100) continue; nd = disc - 100; } else { if (tx.total <= 100) continue; nd = disc + 100; }
      log.push(`EDIT ${tx.id.slice(-4)} ${kind} via=${via} disc ${disc}->${nd}${b.waived ? ' (bill had waive)' : ''}`);
      if (kind === 'refund' && (b.over || 0) > 0 && !process.env.ALLOW_PARTIAL) { log.pop(); continue; }
      await editBill(tx.id, { discount: nd });
      let pending = null;
      b.over = b.over || 0;
      if (kind === 'refund' && b.over > 0 && !process.env.ALLOW_PARTIAL) { log.pop(); continue; }
      if (kind === 'refund') { pending = { method: via, amount: -100 }; if (via === 'cash') physical -= 100; }
      if (kind === 'collect' && b.over > 0) { b.over -= 100; }   // customer had overpaid (waived) — removing discount moves no money
      else if (kind === 'collect') { pending = { method: via, amount: 100 }; if (via === 'cash') physical += 100; }
      if (kind === 'waive') { b.waived = true; b.over += 100; }
      const res = await resolve(tx.id, pending, `edit ${kind} ${tx.id.slice(-4)}${b.waived && kind !== 'waive' ? ' after waive' : ''}`);
      if (res === 'stuck') { // force the real move via moved anyway (what the user would end up pressing) to continue
        await app.recordBillSettlement(tx.id, 'moved', via);
        const st = app.billMoneyStatus(app.state.transactions.find(x => x.id === tx.id));
        if (!st.settled) await app.recordBillSettlement(tx.id, 'waive');
        physical += 0; // physical already moved 100; system recorded the larger amount → drift; resync model to app to continue
        log.push('  (forced moved; resync)'); physical = expected() - misInShift();
      }
      check('edit');
    } else if (r < 0.72) {
      const mis = live.filter(t => bills.get(t.id).mis);
      if (!mis.length) continue;
      const tx = pick(mis); const b = bills.get(tx.id);
      log.push(`FIXCH ${tx.id.slice(-4)} -> ${b.truth}${b.soldShift === shiftId ? '' : ' (prev shift)'}`);
      await editBill(tx.id, { payment: b.truth });
      await resolve(tx.id, null, `fix ${tx.id.slice(-4)}`);
      b.mis = false; check('fix');
    } else if (r < 0.85 && settledLive.length) {
      const cand = settledLive.filter(t => !bills.get(t.id).mis);
      if (!cand.length) continue;
      const tx = pick(cand); const outcome = pick(['refunded', 'none']);
      d.getElementById('edit-tx-id').value = tx.id; d.getElementById('void-money-outcome').value = outcome;
      const plan = app.planVoidCash(tx, outcome);
      const e0 = expected();
      await app.voidTransaction(); await (app._confirmP || settle(5)); await settle(5);
      if (app.state.transactions.find(x => x.id === tx.id)) { problems.push('void did not happen'); continue; }
      const b = bills.get(tx.id); bills.delete(tx.id);
      if (outcome === 'refunded') physical += plan.cashEffect;
      // bill was in this shift & mis? excluded above. The bill’s own cash leaves the count when removed.
      const de = Math.round((expected() - e0) * 100) / 100;
      log.push(`VOID ${tx.id.slice(-4)} ${outcome} inShift=${plan.inShift} cashEffect=${plan.cashEffect} dExpected=${de}`);
      if (Math.round(de * 100) !== Math.round((outcome === 'refunded' ? plan.cashEffect : 0) * 100))
        problems.push(`void ${outcome}: declared cash effect ${plan.cashEffect} but expected moved ${de}`);
      check('void');
    } else if (r < 0.92) {
      const want = physical + misInShift();
      O.cash = notes(physical);
      app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(5);
      const h = app.state.shift.history[app.state.shift.history.length - 1];
      log.push(`CLOSE expected=${h.expectedCash} counted=${h.countedCash} diff=${h.difference} (model mis ${misInShift()})`);
      if (Math.round((h.difference + misInShift()) * 100) !== 0) problems.push(`close: difference ${h.difference} but unresolved mis ${misInShift()} (want expected ${want})`);
    }
  }
  env.dispose();
  return { problems, log };
}

(async () => {
  let bad = 0;
  const kinds = {};
  for (let s = SEED0; s < SEED0 + RUNS; s++) {
    const { problems, log } = await run(s);
    if (problems.length) {
      bad++;
      problems.forEach(p => { const k = p.replace(/[0-9A-Z]{4}\b/g, '#').replace(/-?\d+(\.\d+)?/g, 'N').slice(0, 70); kinds[k] = (kinds[k] || 0) + 1; });
      if (bad <= 3) { console.log(`--- seed ${s}`); console.log(log.join('\n')); console.log('PROBLEMS:\n ' + problems.join('\n ')); }
    }
  }
  console.log(`\n${RUNS} runs, ${bad} with problems`);
  console.log(kinds);
  process.exit(bad ? 1 : 0);
})();
