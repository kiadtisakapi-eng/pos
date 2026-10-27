// VAT-ON end-to-end scenario fuzzer (ย้ายจากผู้ตรวจ M รอบตรวจ 19 ต.ค. 2569 เข้าชุดเทสต์ · ข้อ 69 — รอบสั้น 3 seed: test_fix_20261020_vat_smoke.js)
// Drives the REAL app.js through the methods the buttons call (IndexedDB = real Dexie on fake-indexeddb) connected to the
// REAL google_apps_script.js (fetch -> doPost), with a simulated clock, a physical-drawer truth model and an independent
// oracle for every bill, every sheet row, every summary tab, the master row, the in-app reports and Telegram.
// Usage: TZ=Asia/Bangkok node tests/fuzz_vat_e2e.js <firstSeed> <runs> [--verbose] [--no-chaos]
'use strict';
const { H, MIN, settle, bkk, makeShopM, login, SERVICES, CATS } = require('./vat_e2e_env.js');
const O = require('./vat_e2e_oracle.js');
const { sat, fmtB } = O;

const SEED0 = Number(process.argv[2] || 1), RUNS = Number(process.argv[3] || 5);
const VERBOSE = process.argv.includes('--verbose');
const CHAOS = !process.argv.includes('--no-chaos');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);   // comma list of check groups to keep (debug)

function rng(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

async function runSeed(seed) {
  const R = rng(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const chance = p => R() < p;
  const S = await makeShopM({ start: bkk(2026, 10, 29, 9, 0) });
  const { app, gas, clock, d, P, ui } = S;
  const log = [], problems = [];
  const note = (m) => { log.push(`[${new Date(clock.now + 7 * H).toISOString().slice(5, 16).replace('T', ' ')}] ${m}`); };
  const problem = (kind, m) => { problems.push({ kind, msg: m, at: log.length }); note('!!! ' + kind + ': ' + m); };
  const keep = k => !ONLY || ONLY.split(',').includes(k);

  // ── independent records of what the shop owner configured (NOT read back from the app) ──
  const cfg = { vatOn: false, rate: 7, catVat: Object.fromEntries(CATS.map(c => [c.id, c.vat])), feeRate: 10 };
  // ── truth model ──
  const M = { physical: 0, shift: null, bills: new Map(), voidAlerts: [], shiftReports: [], expenses: new Map() };
  // bill model: { id, soldShift, method, mis (satang recorded cash − true cash, null when resolved), truePaid {cash,promptpay,credit} satang,
  //               voided, cardLocked, pendingNote }
  const shiftActive = () => !!(app.state.shift && app.state.shift.active);
  const curShift = () => shiftActive() ? Number(app.state.shift.startTime) : null;
  const misInShift = () => [...M.bills.values()].filter(b => b.mis && b.soldShift === curShift()).reduce((a, b) => a + b.mis, 0);

  const checkDrawer = (tag) => {
    if (!keep('a') || !shiftActive()) return;
    const calc = app.computeShiftDrawer(app.state.shift);
    const exp = sat(calc.expected) - sat(calc.overspend);
    const want = M.physical * 100 + misInShift();
    if (exp !== want) {
      problem('drawer', `${tag}: app expected ${fmtB(exp)} vs physical ${M.physical} + unresolved mis ${fmtB(misInShift())}`);
      M.physical = (exp - misInShift()) / 100;   // resync so later steps are judged independently
    }
  };
  const staffIds = new Set(['st-1', 'st-2', 'mg-1']);
  const checkBills = (tag) => {
    if (!keep('b')) return;
    app.state.transactions.forEach(tx => {
      O.billProblems(tx, staffIds).forEach(m => problem('bill-eq', `${tag}: ${m}`));
      const fat = app.validateBillRecord(tx).filter(p => p.fatal);
      if (fat.length) problem('bill-invalid', `${tag}: ${tx.id} ${fat.map(f => f.code).join(',')}`);
    });
  };

  const sellable = SERVICES.map(s => s.id);
  const svc = id => SERVICES.find(s => s.id === id);
  const staffFor = () => pick(['st-1', 'st-2', 'mg-1']);
  const whoSells = () => pick(['staff', 'staff2', 'manager', 'owner']);

  // ═════════════════ actions (each = what a person taps) ═════════════════
  async function doOpenShift(who) {
    login(app, who);
    setCash(M.physical);
    app.openCashCounter('open'); app.cashCounterMode = 'open';
    await app.confirmCashCount(); await settle();
    if (!shiftActive()) { problem('shift', `open failed (${who}) ${lastToast()}`); return; }
    M.shift = curShift();
    if (Number(app.state.shift.startCash) !== M.physical) problem('shift', `startCash ${app.state.shift.startCash} != counted ${M.physical}`);
    note(`OPEN by ${who} start ${M.physical}`);
    checkDrawer('open');
  }
  async function doCloseShift(who) {
    login(app, who);
    setCash(M.physical);
    const start = curShift();
    const wantDiff = -misInShift();
    app.openCashCounter('close');
    const nHist = app.state.shift.history.length;
    await app.confirmCashCount(); await settle();
    if (shiftActive()) { problem('shift', `close failed (${who}) ${lastToast()}`); return; }
    const h = app.state.shift.history[app.state.shift.history.length - 1];
    if (app.state.shift.history.length !== nHist + 1) problem('shift', 'no history row after close');
    if (keep('a') && sat(h.difference) !== wantDiff) problem('drawer', `close diff ${h.difference} vs expected ${fmtB(wantDiff)} (counted ${h.countedCash} expected ${h.expectedCash})`);
    // mis-recorded bills of that shift are realised as its difference
    [...M.bills.values()].forEach(b => { if (b.soldShift === start && b.mis) b.misClosed = true, b.mis = null; });
    // expectations for its Telegram report (built from the state right now)
    M.shiftReports.push(expectShiftReport(h));
    note(`CLOSE by ${who} counted ${h.countedCash} expected ${h.expectedCash} diff ${h.difference}`);
    M.shift = null;
  }
  function setCash(baht) {
    const out = {}; let r = Math.round(baht);
    [1000, 500, 100, 50, 20, 10, 5, 2, 1].forEach(dn => { const k = Math.floor(r / dn); if (k) out[dn] = k; r -= k * dn; });
    if (!Object.keys(out).length) out[1] = 0;
    ui.cash = out;
  }
  const lastToast = () => { const t = S.toasts[S.toasts.length - 1]; return t ? t.m.slice(0, 140) : ''; };

  // sale: items [{sid, staff}] · method cash|promptpay|credit|split · truth (for cash/promptpay mis-records)
  async function doSale(spec) {
    login(app, spec.who);
    app.clearCart();
    spec.items.forEach(it => app.addToCart(it.sid));
    if (app.state.cart.length !== spec.items.length) { problem('sale', `addToCart failed ${lastToast()}`); return null; }
    app.state.cart.forEach((c, i) => { if (spec.items[i].staff) app.changeItemStaff(c.uniqueCartId, spec.items[i].staff); });
    d.getElementById('cart-discount').value = String(spec.discount);
    d.getElementById('cart-customer-select').value = spec.cust || '';
    d.getElementById('checkout-bill-note').value = spec.note || '';
    if (spec.beforeOpen) await spec.beforeOpen();
    // oracle at the moment of payment (uses MY record of the VAT settings, not the app's)
    const items = spec.items.map(it => { const s = svc(it.sid); return { price: s.price, vatable: cfg.vatOn && cfg.catVat[s.category] === true,
      commission: s.commission, commissionType: s.commissionType, isProduct: s.type === 'product', category: s.category, name: s.name, staff: it.staff || '' }; });
    const rate = cfg.vatOn ? cfg.rate : 0;
    const feeRate = spec.method === 'credit' || spec.method === 'split' ? spec.feeRate : null;
    let E = O.expectSale(items, spec.discount, rate, spec.method, feeRate, spec.cashPart);
    if (spec.method === 'split' && (spec.cashPart <= 0 || spec.cashPart * 100 >= E.total)) { spec.cashPart = Math.max(1, Math.floor(E.total / 200)); E = O.expectSale(items, spec.discount, rate, spec.method, feeRate, spec.cashPart); }
    app._checkoutAttempt = null;
    app.openCheckoutModal(); await settle(2);
    if (!app._checkoutAttempt) { problem('sale', `checkout modal did not open ${lastToast()}`); return null; }
    if (spec.afterOpen) await spec.afterOpen();
    app.selectPaymentMethod(spec.method);
    if (spec.method === 'cash') {
      const total = E.total / 100;
      d.getElementById('cash-received').value = String(total + spec.extraCash);
      app.recalcCashChange();
    } else if (spec.method === 'credit' || spec.method === 'split') {
      if (spec.method === 'split') d.getElementById('split-cash-amount').value = String(spec.cashPart);
      if (spec.feeUi === 'quick') app.selectCardFeeRate(spec.feeRate);
      else if (spec.feeUi === 'custom') { d.getElementById('card-fee-custom').value = String(spec.feeRate); app.onCardFeeCustomInput(); }
      else if (spec.feeUi === 'zero') app.selectCardFeeRate(0);
      const plan = app.renderCardPaymentPanel();
      if (spec.expectRefuse) { /* stale screen: the panel already shows post-switch numbers — only the confirm must be refused */ }
      else if (!plan || !plan.ok) { problem('sale', `card plan failed: ${plan && plan.error} items=${JSON.stringify(items.map(i => [i.price, i.vatable]))} disc=${spec.discount} rate=${rate} fee=${feeRate} cash=${spec.cashPart}`); return null; }
      else if (sat(plan.totals.total) !== E.fee.target) problem('sale', `shown card total ${plan.totals.total} vs oracle ${fmtB(E.fee.target)}`);
    }
    if (!spec.expectRefuse && d.getElementById('btn-complete-checkout').disabled) { problem('sale', `confirm button disabled (${spec.method}) ${lastToast()}`); return null; }
    const n0 = app.state.transactions.length;
    const ok = await app.processCheckout(); await settle();
    if (spec.expectRefuse) {
      if (ok || app.state.transactions.length !== n0) problem('sale', 'stale checkout attempt was accepted after VAT change');
      return 'refused';
    }
    if (ok !== true || app.state.transactions.length !== n0 + 1) { problem('sale', `checkout failed ${spec.method}: ${lastToast()}`); return null; }
    const tx = app.state.transactions[app.state.transactions.length - 1];
    checkSaleAgainstOracle(tx, spec, items, E, rate, feeRate);
    // physical drawer truth
    const b = { id: tx.id, soldShift: curShift(), method: spec.method, mis: null, truePaid: { cash: 0, promptpay: 0, credit: 0 },
      voided: false, cardLocked: spec.method === 'credit' || spec.method === 'split', items, note: spec.note || '' };
    const T = sat(tx.total);
    if (spec.method === 'cash' || spec.method === 'promptpay') {
      const truth = spec.truth || spec.method;
      b.truePaid[truth] += T;
      if (truth === 'cash') M.physical += T / 100;
      if (truth !== spec.method) b.mis = (spec.method === 'cash' ? T : 0) - (truth === 'cash' ? T : 0);
      b.truth = truth;
    } else if (spec.method === 'credit') b.truePaid.credit += T;
    else { b.truePaid.cash += spec.cashPart * 100; b.truePaid.credit += T - spec.cashPart * 100; M.physical += spec.cashPart; }
    M.bills.set(tx.id, b);
    note(`SALE ${tx.id.slice(-6)} by ${spec.who} ${spec.method}${spec.truth && spec.truth !== spec.method ? '(truth ' + spec.truth + ')' : ''} ` +
      `items=${spec.items.map(i => i.sid).join('+')} disc=${spec.discount} vat=${rate}% total=${tx.total}` + (tx.cardFee ? ` fee=${tx.cardFee.amount}@${tx.cardFee.rate}% net=${tx.cardFee.net}` : '') +
      (spec.method === 'split' ? ` cash=${spec.cashPart}` : '') + (spec.note ? ' note' : ''));
    return tx;
  }

  function checkSaleAgainstOracle(tx, spec, items, E, rate, feeRate) {
    if (!keep('b')) return;
    const p = m => problem('sale-oracle', `${tx.id.slice(-8)}: ${m}`);
    const svcLines = tx.details.filter(x => x.kind !== 'card_fee');
    if (svcLines.length !== items.length) { p('line count'); return; }
    svcLines.forEach((dl, i) => {
      if (sat(dl.netPrice) !== E.nets[i]) p(`line ${i} net ${dl.netPrice} vs ${fmtB(E.nets[i])}`);
      if (!!dl.vatable !== !!items[i].vatable) p(`line ${i} vatable ${dl.vatable} vs ${items[i].vatable}`);
      if (dl.commissionAmount !== E.comm[i]) p(`line ${i} commission ${dl.commissionAmount} vs ${E.comm[i]}`);
      if ((dl.isProduct === true) !== items[i].isProduct) p(`line ${i} isProduct`);
    });
    const fee = E.fee && E.fee.amount > 0 ? E.fee : null;
    const feeNet = fee ? sat(tx.cardFee && tx.cardFee.net) : 0;
    if (sat(tx.vatAmount) !== (fee && fee.vatable ? Math.round((E.V + feeNet) * rate / 100) : E.vat)) p(`vat ${tx.vatAmount} vs oracle`);
    const wantV = E.V + (fee && fee.vatable ? feeNet : 0), wantN = E.N + (fee && !fee.vatable ? feeNet : 0);
    if (sat(tx.vatableBase) !== wantV || sat(tx.nonVatBase) !== wantN) p(`bases N${tx.nonVatBase}/V${tx.vatableBase} vs N${fmtB(wantN)}/V${fmtB(wantV)}`);
    if (sat(tx.subtotal) !== E.subSat + feeNet) p(`subtotal ${tx.subtotal} vs ${fmtB(E.subSat + feeNet)}`);
    if (Number(tx.vatRate) !== rate) p(`vatRate ${tx.vatRate} vs ${rate}`);
    if (sat(tx.total) !== (fee ? fee.target : E.total)) p(`total ${tx.total} vs ${fmtB(fee ? fee.target : E.total)}`);
    if (sat(tx.discount) !== spec.discount * 100) p('discount');
    if (fee) {
      const cf = tx.cardFee;
      if (!cf) { p('no cardFee'); return; }
      if (cf.amount !== fee.amount || cf.base !== fee.base || cf.rate !== feeRate || cf.baseRate !== cfg.feeRate) p(`cardFee ${JSON.stringify(cf)} vs base ${fee.base} amt ${fee.amount} rate ${feeRate}`);
      if (!fee.okNets.includes(feeNet)) p(`fee net ${cf.net} not a valid VAT split (ok ${fee.okNets.map(x => x / 100)})`);
      if (Math.abs(feeNet - fee.ideal) > 1.0001) p(`fee net ${cf.net} more than 1 satang from F/(1+r) = ${(fee.ideal / 100).toFixed(4)}`);
      const fl = tx.details.find(x => x.kind === 'card_fee');
      if (!fl || !!fl.vatable !== !!fee.vatable) p(`fee line vatable ${fl && fl.vatable} vs ${fee.vatable}`);
      if (feeRate < cfg.feeRate && cf.reducedBy !== app.currentUser.name) p(`reducedBy ${cf.reducedBy}`);
      if (feeRate >= cfg.feeRate && cf.reducedBy) p('reducedBy set without reduction');
    } else if (tx.cardFee && tx.cardFee.amount > 0) p('unexpected card fee');
    // receipt: numbers + bill note must never be printed
    P.showThermalReceipt.call(app, tx);
    const html = String(d.getElementById('thermal-receipt-preview').innerHTML || '');
    if (spec.note && html.includes(spec.note)) problem('note-leak', `${tx.id}: bill note printed on receipt`);
    const m = html.match(/<span>รวมทั้งสิ้น:<\/span>\s*<span>฿([^<]+)<\/span>/);
    if (!m || sat(Number(m[1].replace(/,/g, ''))) !== sat(tx.total)) p(`receipt total ${m && m[1]} vs ${tx.total}`);
    if (sat(tx.vatAmount) > 0) {
      const v = html.match(/<span>VAT (\d+)%:<\/span>\s*<span>฿([^<]+)<\/span>/);
      if (!v || Number(v[1]) !== rate || sat(Number(v[2].replace(/,/g, ''))) !== sat(tx.vatAmount)) p(`receipt VAT line ${v && v[0]}`);
    }
    if (spec.note) {
      P.renderQueueScreen.call(app);
      const q = String(d.getElementById('queue-waiting-list').innerHTML || '') + String(d.getElementById('queue-serving-list').innerHTML || '');
      if (q.includes(spec.note)) problem('note-leak', `${tx.id}: bill note on queue card`);
    }
  }

  // owner edits the discount (non-card bill) → then records what really happened
  async function doEditDiscount(b, newDisc, settleHow) {
    const tx = app.state.transactions.find(t => t.id === b.id);
    if (!tx) return;
    login(app, 'owner');
    const before = { total: sat(tx.total) };
    const E = O.expectEdit(tx, newDisc);
    app.openTransactionEdit(tx.id);
    d.getElementById('edit-tx-discount').value = String(newDisc);
    ui.staffSelects = [];
    await app.saveTransactionEdit(); await settle();
    const t2 = app.state.transactions.find(t => t.id === b.id);
    if (sat(t2.discount) !== newDisc * 100) { problem('edit', `discount not saved ${t2.discount} vs ${newDisc} ${lastToast()}`); return; }
    if (keep('b')) {
      if (sat(t2.total) !== E.total) problem('edit-oracle', `${b.id.slice(-8)} total ${t2.total} vs ${fmtB(E.total)}`);
      if (sat(t2.vatAmount) !== E.vat || sat(t2.vatableBase) !== E.V || sat(t2.nonVatBase) !== E.N || sat(t2.rounding) !== E.rnd)
        problem('edit-oracle', `${b.id.slice(-8)} VAT split N${t2.nonVatBase}/V${t2.vatableBase}/vat${t2.vatAmount}/r${t2.rounding} vs N${fmtB(E.N)}/V${fmtB(E.V)}/vat${fmtB(E.vat)}/r${fmtB(E.rnd)}`);
      t2.details.forEach((dl, i) => {
        if (sat(dl.netPrice) !== E.nets[i]) problem('edit-oracle', `${b.id.slice(-8)} line ${i} net ${dl.netPrice} vs ${fmtB(E.nets[i])}`);
        if (dl.commissionAmount !== E.comm[i]) problem('edit-oracle', `${b.id.slice(-8)} line ${i} commission ${dl.commissionAmount} vs ${E.comm[i]}`);
      });
    }
    if (sat(t2.total) !== before.total) b.waived = 0;   // a money edit supersedes earlier "no money moved" records
    note(`EDIT ${b.id.slice(-6)} disc→${newDisc} total ${fmtB(before.total)}→${t2.total} (vat ${t2.vatRate}%)`);
    await settleMoney(b, settleHow);
  }

  // record the difference truthfully: owed = due − truePaid (net)
  async function settleMoney(b, how) {
    const tx = app.state.transactions.find(t => t.id === b.id);
    if (!tx) return;
    const st = app.billMoneyStatus(tx);
    const truePaidNet = b.truePaid.cash + b.truePaid.promptpay + b.truePaid.credit;
    const owed = sat(tx.total) - truePaidNet - (b.waived || 0);   // waived = difference accepted with "ไม่มีเงินเคลื่อนไหว" (until the next money edit)
    if (st.invalid) { problem('settle', `${b.id}: money status invalid`); return; }
    const appNet = st.diffs.reduce((a, x) => a + sat(x.amount), 0);
    if (keep('g') && appNet !== owed) problem('settle', `${b.id.slice(-8)}: app net diff ${fmtB(appNet)} vs truth owed ${fmtB(owed)} diffs=${JSON.stringify(st.diffs)}`);
    if (st.settled) { if (owed !== 0 && keep('g')) problem('settle', `${b.id}: app says settled but owed ${fmtB(owed)}`); return; }
    if (!app.isPendingSettlementBill(tx)) problem('settle', `${b.id}: unsettled but not pending`);
    const who = pick(['owner', 'owner', 'manager']);
    login(app, who);
    if (who === 'manager' && app.billAccessFor(tx) === 'none') login(app, 'owner');
    const chan = b.truth || b.method;
    if (how === 'waive' || owed === 0) {
      const ok = await app.recordBillSettlement(tx.id, 'waive');
      note(`  WAIVE ${b.id.slice(-6)} owed ${fmtB(owed)} ok=${ok}`);
      if (!ok) problem('settle', `waive refused ${lastToast()}`); else b.waived = (b.waived || 0) + owed;
    } else {
      let via = how === 'cross' ? (chan === 'cash' ? 'promptpay' : 'cash') : chan;
      if (via === 'cash' && !shiftActive()) via = 'promptpay';
      if (via === 'cash' && owed < 0 && -owed > M.physical * 100) via = 'promptpay';   // not enough cash in the drawer to refund
      let partial;
      if (how === 'partial' && Math.abs(owed) >= 200) partial = Math.floor(Math.abs(owed) / 200);
      const ok = await app.recordBillSettlement(tx.id, 'moved', via, partial);
      note(`  MOVED ${b.id.slice(-6)} ${owed < 0 ? 'refund' : 'collect'} ${fmtB(Math.abs(owed))} via ${via}${partial ? ' partial ' + partial : ''} ok=${ok}`);
      if (!ok) { problem('settle', `moved refused (${via}) ${lastToast()}`); return; }
      const moved = partial ? Math.sign(owed) * partial * 100 : owed;
      b.truePaid[via] += moved;
      if (partial) b.waived = (b.waived || 0) + (owed - moved);   // the part not refunded/collected is recorded as "no money moved"
      if (via === 'cash') M.physical += moved / 100;
    }
    await settle();
    const t2 = app.state.transactions.find(t => t.id === b.id);
    if (keep('g') && (app.isPendingSettlementBill(t2) || !app.billMoneyStatus(t2).settled)) problem('settle', `${b.id}: still pending after recording (${JSON.stringify(app.billMoneyStatus(t2).diffs)})`);
    checkDrawer('settle');
  }

  // owner fixes a mis-recorded channel: edit payment method to the truth, then "ตอนขายบันทึกรับเงินผิด"
  async function doFixChannel(b) {
    const tx = app.state.transactions.find(t => t.id === b.id);
    if (!tx || !b.truth || b.truth === b.method) return;
    login(app, 'owner');
    app.openTransactionEdit(tx.id);
    d.getElementById('edit-tx-payment').value = b.truth;
    ui.staffSelects = [];
    await app.saveTransactionEdit(); await settle();
    const t2 = app.state.transactions.find(t => t.id === b.id);
    if (t2.paymentMethod !== b.truth) { problem('edit', `payment edit not saved ${lastToast()}`); return; }
    const ok = await app.recordBillSettlement(tx.id, 'correction'); await settle();
    note(`FIXCH ${b.id.slice(-6)} ${b.method}→${b.truth} correction ok=${ok}${b.soldShift === curShift() ? '' : ' (bill of closed shift)'}`);
    if (!ok) problem('settle', `correction refused ${lastToast()}`);
    if (b.mis && b.soldShift === curShift()) b.mis = null;     // resolved inside the shift that still holds the cash
    b.method = b.truth;
    const t3 = app.state.transactions.find(t => t.id === b.id);
    if (keep('g') && app.isPendingSettlementBill(t3)) problem('settle', `${b.id}: pending after correction ${JSON.stringify(app.billMoneyStatus(t3).diffs)}`);
    checkDrawer('fixch');
  }

  async function doEditStaff(b) {
    const tx = app.state.transactions.find(t => t.id === b.id); if (!tx) return;
    const idx = tx.details.findIndex(x => x.kind !== 'card_fee' && !O.isFrontCounter(x));
    if (idx < 0) return;
    const to = ['st-1', 'st-2', 'mg-1'].find(s => s !== tx.details[idx].staffId);
    login(app, 'owner');
    app.openTransactionEdit(tx.id);
    ui.staffSelects = [{ value: to, getAttribute: k => (k === 'data-index' ? String(idx) : null) }];
    const comm = tx.details[idx].commissionAmount;
    await app.saveTransactionEdit(); await settle();
    ui.staffSelects = [];
    const t2 = app.state.transactions.find(t => t.id === b.id);
    if (t2.details[idx].staffId !== to || t2.details[idx].commissionAmount !== comm) problem('edit', `staff move failed/changed commission ${lastToast()}`);
    note(`EDIT-STAFF ${b.id.slice(-6)} line ${idx} → ${to}`);
  }
  async function doEditNote(b) {
    const tx = app.state.transactions.find(t => t.id === b.id); if (!tx) return;
    login(app, 'owner');
    const txt = 'โน้ตแก้ ' + ri(100, 999);
    app.openTransactionEdit(tx.id);
    d.getElementById('edit-tx-note').value = txt;
    d.getElementById('edit-tx-customer').value = 'ลูกค้า ' + ri(1, 9);
    ui.staffSelects = [];
    await app.saveTransactionEdit(); await settle();
    const t2 = app.state.transactions.find(t => t.id === b.id);
    if (t2.billNote !== txt) problem('edit', `note edit failed ${lastToast()}`);
    b.note = txt;
    P.showThermalReceipt.call(app, t2);
    if (String(d.getElementById('thermal-receipt-preview').innerHTML || '').includes(txt)) problem('note-leak', `${b.id}: edited note printed on receipt`);
    note(`EDIT-NOTE ${b.id.slice(-6)}`);
  }

  async function doVoid(b, who, outcome) {
    const tx = app.state.transactions.find(t => t.id === b.id); if (!tx) return;
    login(app, who);
    const access = app.billAccessFor(tx);
    if (access !== 'full') { note(`(void ${b.id.slice(-6)} by ${who} not allowed: ${access})`); return; }
    const pendingBefore = app.isPendingSettlementBill(tx);
    const reason = pick(['ออกบิลซ้ำ', 'กดบริการผิด', 'ลูกค้าเปลี่ยนใจ', 'คิดเงินผิด <ทดสอบ> & "quote"']) + ' #' + ri(10, 99);
    app.openTransactionEdit(tx.id);
    d.getElementById('void-money-outcome').value = outcome;
    d.getElementById('void-note').value = reason;
    app._confirmP = null;
    // truth: refunded = customer gets the net they paid back through the bill's channels (cash part leaves the drawer now)
    const due = O.partsOf(tx), net = b.truePaid.cash + b.truePaid.promptpay + b.truePaid.credit;
    let cashOut = 0;
    if (outcome === 'refunded') {
      const w = due.map(x => Math.max(0, sat(x.amount))), tw = w.reduce((a, x) => a + x, 0);
      if (net > 0 && tw > 0) { const sh = O.lrSplit(net, w); cashOut = due.reduce((a, x, i) => a + (x.method === 'cash' ? sh[i] : 0), 0); }
      else if (due.every(x => x.method === 'cash')) cashOut = Math.max(0, net);
    }
    if (cashOut > M.physical * 100) { note(`(void ${b.id.slice(-6)} refund ${fmtB(cashOut)} exceeds drawer ${M.physical} — skipped)`); return; }
    const n0 = app.state.transactions.length;
    await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle();
    const gone = !app.state.transactions.some(t => t.id === b.id);
    if (pendingBefore) { if (gone) problem('void', `${b.id}: voided while settlement pending`); else note(`VOID ${b.id.slice(-6)} refused (pending settlement) ✓`); return; }
    if (!gone) { problem('void', `${b.id}: void failed by ${who}: ${lastToast()}`); return; }
    b.voided = true; M.physical -= cashOut / 100;
    const v = app.state.voidLog[app.state.voidLog.length - 1];
    M.voidAlerts.push({ billId: b.id, reason, amount: tx.total, cardRefund: v.cardRefund || 0, at: clock.now, outcome });
    note(`VOID ${b.id.slice(-6)} by ${who} ${outcome} total ${tx.total} cashOut ${fmtB(cashOut)} (bill ${b.soldShift === curShift() ? 'this' : 'other'} shift) reason="${reason}"`);
    checkDrawer('void');
  }

  async function doExpense(who) {
    login(app, who);
    const amt = pick([45, 120, 300, 500, 501, 800, 1000, 1001, 1500]);
    let src = chance(0.7) ? 'drawer' : 'other';
    if (src === 'drawer' && amt > M.physical - 50) src = 'other';
    d.getElementById('expense-type').value = pick(['supply', 'other', 'staff']);
    d.getElementById('expense-amount').value = String(amt);
    d.getElementById('expense-source').value = src;
    d.getElementById('expense-note').value = 'ค่าของ ' + ri(1, 99);
    d.getElementById('expense-staff-id').value = 'st-2';
    const s0 = (app._stepUps || []).length, n0 = app.state.shift.expenses.length;
    await app.addExpense(); await settle();
    if (app.state.shift.expenses.length !== n0 + 1) { problem('expense', `not saved ${lastToast()}`); return; }
    const pinAsked = (app._stepUps || []).length - s0;
    // 26 ต.ค. 2569 ข้อ 2: PIN เมื่อรายการเดียวเกิน 500 หรือยอดลิ้นชักสะสมของบัญชีเดียวกันในกะนี้ (นับจากรายการที่ผ่าน PIN ล่าสุด) เกิน 500
    // ตัวคำนวณอิสระ: ไล่จาก M.expLedger ที่เทสต์จดเอง (ไม่อ่านธงในแอป)
    const uid = app.currentUser && app.currentUser.id;
    const sh = curShift();
    M.expLedger = M.expLedger || [];
    let acc = 0;
    M.expLedger.filter(x => !x.deleted && x.drawer && x.uid === uid && x.shift === sh).forEach(x => { acc = x.verified ? 0 : acc + x.amt; });
    const LIM = 1000;   // เพดาน PIN (เจ้าของปรับ 500 → 1,000 · 27 ต.ค. 2569)
    const wantPin = src === 'drawer' && (amt > LIM || acc + amt > LIM) ? 1 : 0;
    if (pinAsked !== wantPin) problem('expense-pin', `PIN step-up ${pinAsked} for ${amt} from ${src} (want ${wantPin})`);
    if (src === 'drawer') M.physical -= amt;
    const e = app.state.shift.expenses[app.state.shift.expenses.length - 1];
    M.expenses.set(e.id, { amt, src });
    M.expLedger.push({ id: e.id, uid, amt, drawer: src === 'drawer', verified: wantPin === 1, shift: sh, deleted: false });
    note(`EXPENSE ${amt} ${src} by ${who}`);
    checkDrawer('expense');
  }
  async function doDeleteExpense() {
    const ex = app.state.shift.expenses; if (!ex.length) return;
    const e = pick(ex);
    login(app, pick(['manager', 'owner']));
    app._confirmP = null;
    await app.deleteExpense(e.id); if (app._confirmP) await app._confirmP; await settle();
    if (app.state.shift.expenses.some(x => x.id === e.id)) { problem('expense', 'delete failed'); return; }
    if (e.paidFrom !== 'other') M.physical += Number(e.amount);   // entered by mistake — the cash goes back
    (M.expLedger || []).forEach(x => { if (x.id === e.id) x.deleted = true; });
    note(`DEL-EXPENSE ${e.amount} ${e.paidFrom}`);
    checkDrawer('delexp');
  }

  async function setVat(on, rate) {
    login(app, 'owner');
    d.getElementById('vat-enabled').checked = on; d.getElementById('vat-rate').value = String(rate);
    await app.saveVatSettings(); await settle();
    if (app.vatEnabled !== on || app.vatRate !== rate) problem('settings', `VAT setting not applied ${lastToast()}`);
    cfg.vatOn = on; cfg.rate = rate;
    note(`VAT ${on ? 'ON' : 'OFF'} ${rate}%`);
  }
  async function setCatVat(catId, flag) {
    login(app, 'owner');
    app.openCategoryModal(catId);
    d.getElementById('cat-vat').checked = flag;
    await app.addCategory(); await settle();
    const c = app.state.categories.find(x => x.id === catId);
    if (!c || c.vat !== flag) problem('settings', `category flag not applied ${lastToast()}`);
    cfg.catVat[catId] = flag;
    note(`CATEGORY ${catId} vat=${flag}`);
  }

  // ── cloud chaos ──
  const chaosState = { until: 0, lost: [] };
  function chaos() {
    if (!CHAOS) return;
    if (gas.networkDown && R() < 0.5) { gas.networkDown = false; note('net up'); }
    if (gas.dropResponses) { gas.dropResponses = false; }
    Object.keys(gas.faults).forEach(k => { delete gas.faults[k]; });
    const r = R();
    if (r < 0.05) { gas.networkDown = true; note('net DOWN'); }
    else if (r < 0.09) { gas.dropResponses = true; note('responses lost (server processed)'); }
    else if (r < 0.13) { const f = pick(['appendRow', 'setValues', 'deleteRow', 'insertSheet', 'setName', 'setProperty']); gas.faults[f] = true; note('GAS fault ' + f); }
    else if (r < 0.18) {
      const act = pick(['transaction', 'summary_day', 'summary_month', 'void_transaction']);
      let n = 0; const rule = gas.lose(bd => bd && bd.action === act && n++ < 1);
      chaosState.lost.push({ rule, deliverAt: log.length + ri(2, 15), act }); note('next ' + act + ' arrives late');
    }
    if (R() < 0.04) { S.net.telegramFailNext = 1; }
    chaosState.lost = chaosState.lost.filter(x => {
      if (log.length >= x.deliverAt) { const res = x.rule.deliver(); if (res.length) note(`late ${x.act} delivered: ${res.map(z => z.code || z.status).join(',')}`); else x.rule.stop(); return false; }
      return true;
    });
  }
  function calmCloud() {
    gas.networkDown = false; gas.dropResponses = false; Object.keys(gas.faults).forEach(k => { delete gas.faults[k]; });
    chaosState.lost.forEach(x => { const res = x.rule.deliver(); if (res.length) note(`late ${x.act} delivered: ${res.map(z => z.code || z.status).join(',')}`); });
    chaosState.lost = [];
  }

  async function flushAll(maxAdvanceMs) {
    calmCloud();
    const limit = clock.now + (maxAdvanceMs || 0);
    for (let i = 0; i < 60; i++) {
      await settle(4);
      await app.syncPendingTransactions(true);
      await app.flushCloudOutbox();
      await settle(4);
      const pend = app.state.transactions.filter(t => app.isBillAwaitingSync(t)).length;
      const ob = (app.state.cloudOutbox || []).filter(it => it.needVoidDelete || it.needSummary || it.needTelegram || it.needBackup);
      if (!pend && !ob.length) return true;
      // let retry back-offs / change-backup delays elapse (only while the shop is closed)
      let next = Infinity;
      ob.forEach(it => Object.values(it.retry || {}).forEach(r => { if (r && r.nextAt) next = Math.min(next, r.nextAt); }));
      const step = Math.max(next === Infinity ? 0 : next - clock.now + 1000, 31e3);
      if (clock.now + step > limit) { if (i > 30) break; continue; }
      clock.now += step;
    }
    const pend = app.state.transactions.filter(t => app.isBillAwaitingSync(t));
    const ob = (app.state.cloudOutbox || []).filter(it => it.needVoidDelete || it.needSummary || it.needTelegram || it.needBackup);
    problem('cloud', `not flushed: ${pend.length} bills pending (${pend.slice(0, 3).map(t => t.syncStatus + ':' + JSON.stringify(t.syncIssue || '')).join(' | ')}) · outbox ${ob.length} ${JSON.stringify(ob.slice(0, 2).map(x => ({ v: x.needVoidDelete, s: x.needSummary, t: x.needTelegram, b: x.needBackup, r: x.retry })))}`);
    return false;
  }

  // ═════════════════ checkpoint checks (shop closed + cloud flushed) ═════════════════
  function expectShiftReport(h) {
    const inS = tx => app.billSoldInShift(tx, h.startTime, h.endTime);
    const bills = app.state.transactions.filter(inS);
    const reduced = bills.filter(tx => tx.cardFee && tx.cardFee.rate < tx.cardFee.baseRate);
    const lost = reduced.reduce((a, tx) => a + sat(tx.cardFee.fullAmount - tx.cardFee.amount), 0);
    const voids = app.state.voidLog.filter(v => v && !v.supersededBy && v.date >= h.startTime && v.date <= h.endTime);
    const total = bills.reduce((a, tx) => a + sat(tx.total), 0);
    return { start: h.startTime, end: h.endTime, reducedN: reduced.length, lost, by: [...new Set(reduced.map(tx => tx.cardFee.reducedBy))],
      voids: voids.map(v => ({ reason: app.voidReasonText(v), amount: v.amount })), total, bills: bills.length };
  }
  function checkTelegram() {
    if (!keep('h')) return;
    const sent = S.telegram.filter(t => t.ok);
    M.voidAlerts.forEach(v => {
      const msgs = sent.filter(t => t.text.includes('มีการยกเลิกบิล') && t.text.includes(v.billId));
      if (msgs.length !== 1) { problem('telegram', `void alert for ${v.billId} sent ${msgs.length}×`); return; }
      const txt = msgs[0].text;
      const want = v.reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (!txt.includes('📝 เหตุผล: ' + want)) problem('telegram', `void alert ${v.billId} lacks reason "${v.reason}"`);
      if (!txt.includes(`💰 ยอด: ฿${Number(v.amount).toLocaleString('th-TH')}`)) problem('telegram', `void alert ${v.billId} amount`);
      if (v.outcome === 'refunded' && v.cardRefund > 0 && !txt.includes('ส่วนที่รูดบัตร')) problem('telegram', `void alert ${v.billId} lacks card refund line`);
    });
    M.shiftReports.forEach(sr => {
      const key = '📅 <b>เวลาเริ่มกะ:</b> ' + new Date(sr.start).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const msgs = sent.filter(t => t.text.includes('รายงานสรุปปิดกะ') && t.text.includes(key));
      if (msgs.length !== 1) { problem('telegram', `shift report ${new Date(sr.start + 7 * H).toISOString().slice(0, 16)} sent ${msgs.length}×`); return; }
      const txt = msgs[0].text;
      if (!txt.includes(`• ยอดขายรวม (สุทธิ): ฿${(sr.total / 100).toLocaleString('th-TH')}`)) problem('telegram', `shift report total ≠ ${fmtB(sr.total)}`);
      if (sr.reducedN) {
        const line = `↘️ ลด/ไม่คิดค่าธรรมเนียมบัตร: ${sr.reducedN} บิล (ลดไป ฿${(sr.lost / 100).toLocaleString('th-TH')})`;
        if (!txt.includes(line)) problem('telegram', `shift report lacks reduced-fee line "${line}"`);
        sr.by.forEach(n => { if (!txt.includes(n)) problem('telegram', `shift report lacks reducer name ${n}`); });
      } else if (txt.includes('↘️ ลด/ไม่คิดค่าธรรมเนียมบัตร')) problem('telegram', 'shift report shows reduced fees but none expected');
      if (sr.voids.length) {
        if (!txt.includes(`🧾 บิลที่ถูกยกเลิกในกะ: ${sr.voids.length} ใบ`)) problem('telegram', `shift report void count ≠ ${sr.voids.length}`);
        sr.voids.slice(0, 10).forEach(v => {
          const r = v.reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (!txt.includes(r.slice(0, 40))) problem('telegram', `shift report lacks void reason "${v.reason}"`);
        });
      }
    });
  }

  function checkSheetBills() {
    if (!keep('c')) return;
    const months = new Set(app.state.transactions.map(tx => O.bizMonth(tx.date)));
    gas.sheetNames().filter(n => /^\d{2}-\d{4}$/.test(n)).forEach(n => months.add(n));
    const seen = new Set();
    months.forEach(mk => {
      const tab = O.readBillTab(gas, mk);
      const appBills = app.state.transactions.filter(tx => O.bizMonth(tx.date) === mk);
      if (!tab) { if (appBills.length) problem('sheet-bills', `tab ${mk} missing (${appBills.length} bills)`); return; }
      const byId = new Map();
      tab.rows.forEach(r => { if (byId.has(r.id)) problem('sheet-bills', `${mk}: duplicate row ${r.id}`); byId.set(r.id, r); seen.add(r.id); });
      if (byId.size !== appBills.length) problem('sheet-bills', `${mk}: ${byId.size} rows vs ${appBills.length} bills (extra: ${[...byId.keys()].filter(id => !appBills.some(t => t.id === id)).join(',')} missing: ${appBills.filter(t => !byId.has(t.id)).map(t => t.id).join(',')})`);
      appBills.forEach(tx => {
        const r = byId.get(tx.id); if (!r) return;
        const p = m => problem('sheet-bills', `${mk} ${tx.id.slice(-8)}: ${m}`);
        const legacy = O.isLegacy(tx);
        const sub = tx.subtotal == null ? sat(tx.total) : sat(tx.subtotal);
        if (r.subtotal !== sub) p(`subtotal ${fmtB(r.subtotal)} vs ${fmtB(sub)}`);
        if (r.discount !== sat(tx.discount || 0)) p(`discount ${fmtB(r.discount)}`);
        if (r.total !== sat(tx.total)) p(`total ${fmtB(r.total)} vs ${tx.total}`);
        const N = legacy ? sat(tx.total) : sat(tx.nonVatBase), V = legacy ? 0 : sat(tx.vatableBase), vat = legacy ? 0 : sat(tx.vatAmount), rnd = legacy ? 0 : sat(tx.rounding);
        if (r.N !== N || r.V !== V || r.vat !== vat || r.rnd !== rnd) p(`VAT cols ${[r.N, r.V, r.vat, r.rnd].map(fmtB)} vs ${[N, V, vat, rnd].map(fmtB)}`);
        if (r.pay !== app.sheetPaymentLabel(tx)) p(`payment label "${r.pay}" vs "${app.sheetPaymentLabel(tx)}"`);
        const wantSvc = app.sheetServicesOf(tx).join(', ');
        if (r.services !== wantSvc) p(`services "${r.services}" vs "${wantSvc}"`);
        const wantNote = typeof tx.billNote === 'string' ? tx.billNote : '';
        if ((r.note || '') !== wantNote) p(`note column "${r.note}" vs "${wantNote}"`);
        if (tx.syncStatus !== 'synced') p(`app syncStatus ${tx.syncStatus}`);
        const want = String(tx.customerName || '');
        if (r.customer !== want) p(`customer "${r.customer}" vs "${want}"`);
      });
    });
    [...M.bills.values()].filter(b => b.voided).forEach(b => { if (seen.has(b.id)) problem('sheet-bills', `voided bill ${b.id} still on sheet`); });
  }

  function checkSummaries(days, months) {
    if (!keep('d')) return;
    days.forEach(k => O.comparePeriod(gas, O.expectPeriod(app.state, 'day', k), 'day', k).forEach(m => problem('summary', m)));
    months.forEach(k => O.comparePeriod(gas, O.expectPeriod(app.state, 'month', k), 'month', k).forEach(m => problem('summary', m)));
  }

  function checkReports(days, months) {
    if (!keep('e')) return;
    login(app, 'owner');
    const run = (type, key) => {
      app.state.selectedReportType = type;
      if (type === 'daily') d.getElementById('report-date-input').value = key; else d.getElementById('report-month-input').value = key;
      d.getElementById('report-staff-filter').value = 'all';
      P.filterReports.call(app);
      const E = O.expectPeriod(app.state, type === 'daily' ? 'day' : 'month', type === 'daily' ? key : key.slice(5) + '-' + key.slice(0, 4));
      const p = m => problem('report', `[${type} ${key}] ${m}`);
      const total = O.money(d.getElementById('report-kpi-total').innerText);
      if (total !== E.rev) p(`KPI total ${fmtB(total)} vs ${fmtB(E.rev)}`);
      if (parseInt(d.getElementById('report-kpi-count').innerText, 10) !== E.bills) p(`KPI count ${d.getElementById('report-kpi-count').innerText} vs ${E.bills}`);
      const bd = String(d.getElementById('report-services-breakdown-body').innerHTML || '');
      const foot = label => { const m = new RegExp(label.replace(/[()]/g, '\\$&') + '</td>\\s*<td[^>]*>฿([^<]+)</td>').exec(bd); return m ? O.money(m[1]) : null; };
      const items = [...E.services.values()].reduce((a, x) => a + x.rev, 0);
      if (E.services.size === 0) { if (!/ไม่มีรายการขายในรอบการค้นหา/.test(bd)) p('empty breakdown expected'); }
      else if (foot('รวมรายการ (ก่อน VAT)') !== items) p(`breakdown items ${fmtB(foot('รวมรายการ (ก่อน VAT)'))} vs ${fmtB(items)}`);
      if (E.services.size && foot('ภาษีมูลค่าเพิ่ม (VAT)') !== E.vat) p(`breakdown VAT ${fmtB(foot('ภาษีมูลค่าเพิ่ม (VAT)'))} vs ${fmtB(E.vat)}`);
      if (E.services.size && foot('เงินปัดเศษ (ปัดขึ้นเต็มบาท)') !== E.rnd) p(`breakdown rounding vs ${fmtB(E.rnd)}`);
      if (E.services.size && foot('ยอดรับรวม') !== E.rev) p(`breakdown total vs ${fmtB(E.rev)}`);
      // ตรวจ 19 ต.ค. ข้อ 32: บิลที่ไม่มีรายการรายคน (บิลรุ่นเก่า/บิลจากชีต) ไม่นับในตารางพนักงานแล้ว — ตรงกับสรุปในชีต
      const cb = String(d.getElementById('report-commission-body').innerHTML || '');
      const rows = [...cb.matchAll(/<td><strong>([^<]*)<\/strong><\/td>\s*<td>[^<]*<\/td>\s*<td>(\d+) งาน(?: · (\d+) สินค้า)?<\/td>\s*<td>฿([^<]+)<\/td>\s*<td[^>]*>฿([^<]+)<\/td>/g)]
        .map(m => ({ name: m[1], count: Number(m[2]), prod: Number(m[3] || 0), sales: O.money(m[4]), comm: O.money(m[5]) }));
      E.staff.forEach(s => {
        const g = rows.find(r => r.name === s.name);
        if (!g) { p(`commission row ${s.name} missing`); return; }
        if (g.count !== s.count || g.prod !== s.productCount || g.sales !== s.sales || g.comm !== s.comm)
          p(`commission ${s.name}: ${g.count}/${g.prod}/${fmtB(g.sales)}/${fmtB(g.comm)} vs ${s.count}/${s.productCount}/${fmtB(s.sales)}/${fmtB(s.comm)}`);
      });
      rows.forEach(r => { if (![...E.staff.values()].some(s => s.name === r.name) && (r.count || r.prod || r.sales || r.comm)) p(`unexpected commission row ${r.name}`); });
      const sb = String(d.getElementById('report-shifts-body').innerHTML || '');
      const nShift = (sb.match(/<tr>/g) || []).length - (/ไม่มีข้อมูลการเปิด-ปิดร้าน/.test(sb) ? 1 : 0);
      if (nShift !== E.shifts.length) p(`shift rows ${nShift} vs ${E.shifts.length}`);
    };
    days.forEach(k => run('daily', k));
    months.forEach(k => run('monthly', k.slice(3) + '-' + k.slice(0, 2)));
  }

  function touchedPeriods() {
    const days = new Set(), months = new Set();
    const simStart = bkk(2026, 10, 29, 6, 0);
    app.state.transactions.forEach(tx => { if (tx.date >= simStart) { days.add(O.bizDate(tx.date)); } months.add(O.bizMonth(tx.date)); });
    (app.state.shift.history || []).forEach(sh => { const a = O.anchorOf(sh); days.add(O.bizDate(a)); months.add(O.bizMonth(a));
      (sh.expenses || []).forEach(e => { days.add(O.bizDate(e.time)); months.add(O.bizMonth(e.time)); }); });
    app.state.voidLog.forEach(v => { if (v.billDate >= simStart) days.add(O.bizDate(v.billDate)); months.add(O.bizMonth(v.billDate)); });
    return { days: [...days].sort(), months: [...months].sort() };
  }

  async function checkpoint(tag, advanceMs) {
    await flushAll(advanceMs);
    if (!keep('cloud') && !ONLY) {}
    const conflicts = app.state.transactions.filter(t => t.syncStatus === 'conflict');
    if (conflicts.length) problem('cloud', `${conflicts.length} bills in conflict: ${conflicts.slice(0, 3).map(t => t.id + ':' + JSON.stringify(t.syncIssue)).join(' | ')}`);
    const { days, months } = touchedPeriods();
    checkSheetBills();
    checkSummaries(days, months);
    checkReports(days, months);
    checkTelegram();
    checkBills('checkpoint ' + tag);
    const un = app.listUnsettledBills();
    if (keep('g') && un.length) problem('settle', `unsettled bills at checkpoint: ${un.map(u => u.billId.slice(-6) + JSON.stringify(u.diffs)).join(' ')}`);
    note(`CHECKPOINT ${tag}: days ${days.join(',')} months ${months.join(',')} · problems so far ${problems.length}`);
  }

  // ═════════════════ the scenario ═════════════════
  const DAYS = [[2026, 10, 29], [2026, 10, 30], [2026, 10, 31], [2026, 11, 1], [2026, 11, 2]];
  const vatOnDay = pick([1, 1, 2]);              // VAT switched on during this day (mid-day, open cart)
  const rate10Day = chance(0.6) ? pick([2, 3]) : -1;
  const massageVatDay = chance(0.5) ? pick([2, 3, 4]) : -1;
  const offAgainDay = chance(0.25) ? 4 : -1;
  const randomItems = () => {
    const n = ri(1, 4), items = [];
    for (let i = 0; i < n; i++) {
      const sid = pick(sellable);
      const s = svc(sid);
      const front = s.type === 'product' && Number(s.commission) === 0;
      items.push({ sid, staff: front && chance(0.8) ? '' : staffFor() });
    }
    return items;
  };
  const randomSaleSpec = (who) => {
    const items = randomItems();
    const subtotal = items.reduce((a, it) => a + svc(it.sid).price, 0);
    const discount = chance(0.35) && subtotal > 2 ? ri(1, Math.min(subtotal - 1, Math.max(1, Math.floor(subtotal * 0.3)))) : 0;
    const method = pick(['cash', 'cash', 'cash', 'promptpay', 'promptpay', 'credit', 'credit', 'split']);
    const spec = { who: who || whoSells(), items, discount, method, cust: pick(['', '', 'c-1', 'c-2', 'google', 'returning']),
      note: chance(0.2) ? 'โน้ตลับ' + ri(1000, 9999) : '', extraCash: pick([0, 0, 1, 20, 100, 1000]) };
    if (method === 'credit' || method === 'split') {
      const f = R();
      if (f < 0.55) { spec.feeRate = cfg.feeRate; spec.feeUi = 'none'; }
      else if (f < 0.75) { spec.feeRate = 5; spec.feeUi = 'quick'; }
      else if (f < 0.92) { spec.feeRate = ri(1, cfg.feeRate - 1); spec.feeUi = 'custom'; }
      else { spec.feeRate = 0; spec.feeUi = 'zero'; }
      if (method === 'split') spec.cashPart = ri(1, Math.max(1, subtotal - discount - 1));
    }
    if ((method === 'cash' || method === 'promptpay') && chance(0.08)) spec.truth = method === 'cash' ? 'promptpay' : 'cash';
    return spec;
  };

  // random owner/manager activity between sales
  async function maybeActivity(dayIdx) {
    const live = [...M.bills.values()].filter(b => !b.voided && app.state.transactions.some(t => t.id === b.id));
    const r = R();
    if (r < 0.10) {
      const cand = live.filter(b => !b.cardLocked && !b.mis && !(b.truth && b.truth !== b.method));
      if (cand.length) {
        const b = pick(cand); const tx = app.state.transactions.find(t => t.id === b.id);
        const sub = sat(tx.subtotal) / 100, cur = Number(tx.discount) || 0;
        let nd = chance(0.6) ? cur + ri(1, Math.max(1, Math.floor(sub * 0.2))) : Math.max(0, cur - ri(1, 80));
        if (nd >= sub) nd = sub - 1;
        if (nd !== cur && nd >= 0) await doEditDiscount(b, nd, pick(['same', 'same', 'cross', 'partial', 'waive']));
      }
    } else if (r < 0.14) {
      const cand = live.filter(b => b.truth && b.truth !== b.method);
      if (cand.length) await doFixChannel(pick(cand));
    } else if (r < 0.17) {
      if (live.length) await doEditStaff(pick(live));
    } else if (r < 0.19) {
      if (live.length) await doEditNote(pick(live));
    } else if (r < 0.27) {
      const cand = live.filter(b => !(b.truth && b.truth !== b.method));
      if (cand.length) { const b = pick(cand); await doVoid(b, chance(0.5) ? 'manager' : 'owner', pick(['refunded', 'refunded', 'none'])); }
    } else if (r < 0.35) {
      if (shiftActive()) await doExpense(pick(['manager', 'owner']));
    } else if (r < 0.37) {
      if (shiftActive()) await doDeleteExpense();
    }
  }

  const at = (di, hh, mm) => { const [y, mo, dd] = DAYS[di]; return bkk(y, mo, dd, 0, 0) + hh * H + (mm || 0) * MIN; };
  const advanceTo = ts => { if (ts > clock.now) clock.now = ts; else clock.now += 30e3; };

  for (let di = 0; di < DAYS.length; di++) {
    // morning: shop closed — flush & verify everything so far
    advanceTo(at(di, 6, 45));
    if (di > 0) await checkpoint(`day${di} morning`, 3 * H);
    advanceTo(at(di, 9, 50 + ri(0, 9)));
    await doOpenShift(pick(['staff', 'manager']));
    const plan = [];   // sale/event times for the day
    for (let k = 0; k < ri(8, 14); k++) plan.push({ t: at(di, 10, 15) + Math.floor(R() * (13.5 * H)), kind: 'sale' });
    plan.push({ t: at(di, 23, 59), kind: 'sale' }, { t: at(di, 24, 30), kind: 'sale' });
    if (di === vatOnDay) plan.push({ t: at(di, 15, 0) + ri(0, 120) * MIN, kind: 'vatOn' });
    if (di === rate10Day) plan.push({ t: at(di, 19, 0), kind: 'rate10' }, { t: at(di, 22, 0), kind: 'rate7' });
    if (di === massageVatDay) plan.push({ t: at(di, 20, 30), kind: 'massageVat' });
    if (di === offAgainDay) plan.push({ t: at(di, 12, 0), kind: 'vatOff' }, { t: at(di, 16, 0), kind: 'vatOn7' });
    const style = di === 2 ? 'across6' : pick(['normal', 'normal', 'twoShifts', 'across6', 'early']);   // month-end night always crosses 06:00
    if (style === 'twoShifts') plan.push({ t: at(di, 17, 0), kind: 'swap' });
    plan.sort((a, b) => a.t - b.t);
    for (const ev of plan) {
      advanceTo(ev.t);
      chaos();
      if (ev.kind === 'sale') {
        const spec = randomSaleSpec();
        await doSale(spec);
      } else if (ev.kind === 'vatOn') {
        // open cart during the switch: owner rings a mixed cart, opens the payment screen, goes to settings, switches VAT on
        const spec = randomSaleSpec('owner'); spec.items.push({ sid: 'p1', staff: '' }); spec.method = pick(['cash', 'promptpay', 'credit']);
        if (spec.method === 'credit') { spec.feeRate = cfg.feeRate; spec.feeUi = 'none'; }
        delete spec.truth;
        if (chance(0.5)) {
          spec.expectRefuse = true; spec.afterOpen = async () => { await setVat(true, 7); };
          // the payment screen was opened before the switch: confirming that stale screen must be refused …
          const r1 = await doSaleStale(spec);
          // … then the owner re-opens checkout and pays the new (VAT) total
          delete spec.expectRefuse; delete spec.afterOpen;
          await doSale(spec);
        } else {
          spec.beforeOpen = async () => { await setVat(true, 7); };
          await doSale(spec);
        }
      } else if (ev.kind === 'rate10') await setVat(true, 10);
      else if (ev.kind === 'rate7') await setVat(true, 7);
      else if (ev.kind === 'vatOff') await setVat(false, cfg.rate);
      else if (ev.kind === 'vatOn7') await setVat(true, 7);
      else if (ev.kind === 'massageVat') await setCatVat('massage', true);
      else if (ev.kind === 'swap') { await doCloseShift(pick(['manager', 'owner'])); advanceTo(clock.now + 3 * MIN); await doOpenShift(pick(['staff', 'manager'])); }
      checkDrawer('after ' + ev.kind);
      for (let a = 0; a < 2; a++) { await maybeActivity(di); }
      checkBills('after ' + ev.kind);
    }
    // night end
    if (style === 'across6') {
      for (const [hh, mm] of [[29, 59], [30, 0], [30, 20]]) { advanceTo(at(di, hh, mm)); chaos(); await doSale(randomSaleSpec()); await maybeActivity(di); }
      advanceTo(at(di, 30, 40));
      if (chance(0.5)) await doExpense('manager');
      await doCloseShift(pick(['manager', 'owner']));
    } else {
      advanceTo(at(di, 26, 50)); chaos(); await doSale(randomSaleSpec());
      advanceTo(at(di, 27, 0) + ri(0, 15) * MIN);
      await doCloseShift(pick(['manager', 'owner']));
      if (style === 'early') {          // shift opened 03:30–05:59 belongs to the NEW business day; its 04:00 sale belongs to the old one
        advanceTo(at(di, 27, 35)); await doOpenShift('manager');
        advanceTo(at(di, 28, 0)); await doSale(randomSaleSpec('manager'));
        if (chance(0.5)) { advanceTo(at(di, 28, 10)); await doExpense('manager'); }
        advanceTo(at(di, 29, 0)); await doCloseShift('manager');
      }
    }
    // owner works between shifts on yesterday's bills (previous business day voids/edits after close)
    advanceTo(at(di, 31, 0));
    for (let a = 0; a < 2; a++) {
      const live = [...M.bills.values()].filter(b => !b.voided && app.state.transactions.some(t => t.id === b.id) && !(b.truth && b.truth !== b.method));
      if (!live.length) break;
      const b = pick(live);
      if (chance(0.5)) await doVoid(b, 'owner', pick(['refunded', 'none']));
      else if (!b.cardLocked) { const tx = app.state.transactions.find(t => t.id === b.id);
        const nd = tx ? Math.min(sat(tx.subtotal) / 100 - 1, (Number(tx.discount) || 0) + ri(1, 40)) : null;
        if (tx && nd !== (Number(tx.discount) || 0)) await doEditDiscount(b, nd, pick(['same', 'waive', 'cross'])); }
    }
  }
  // final
  advanceTo(clock.now + 2 * H);
  await checkpoint('final', 12 * H);
  S.env.dispose();
  return { problems, log };

  // stale attempt: payment screen opened, VAT switched, confirm pressed on the old screen → must be refused
  async function doSaleStale(spec) { return doSale(spec); }
}

// ใช้เป็นโมดูลได้ (test_fix_20261020_vat_smoke.js เรียก runSeed เอง) — รันตรง ๆ = ตัวสุ่มเต็มรูปแบบตามเดิม
module.exports = { runSeed };
if (require.main === module) (async () => {
  const kinds = {};
  let bad = 0;
  const failing = [];
  const tally = {};
  const bump = k => { tally[k] = (tally[k] || 0) + 1; };
  const count = (log) => log.forEach(l => {
    let m;
    if ((m = l.match(/\] SALE \S+ by \S+ (\w+)(\(truth \w+\))?.* vat=(\d+)%/))) {
      bump('sale'); bump('sale vat=' + m[3] + '%'); bump('sale ' + m[1]); if (m[2]) bump('sale recorded with wrong channel');
      const f = l.match(/fee=([\d.]+)@(\d+)%/); if (f) { bump('card fee @' + f[2] + '%'); }
      if (/ note$/.test(l)) bump('sale with note');
      if (/disc=[1-9]/.test(l)) bump('sale with discount');
    }
    else if ((m = l.match(/\] VOID \S+ refused/))) bump('void refused (pending settlement)');
    else if ((m = l.match(/\] VOID \S+ by (\w+) (\w+) .*\(bill (\w+) shift\)/))) { bump('void'); bump('void ' + m[2] + ' / ' + m[3] + ' shift'); }
    else if (/\] EDIT \S+ disc/.test(l)) { bump('edit discount'); if (/vat (7|10)%/.test(l)) bump('edit discount on VAT bill'); }
    else if (/WAIVE/.test(l)) bump('settle: waive');
    else if ((m = l.match(/MOVED \S+ (\w+) .* via (\w+)( partial)?/))) { bump('settle: ' + m[1] + ' via ' + m[2] + (m[3] ? ' (partial+waive rest)' : '')); }
    else if (/\] FIXCH/.test(l)) bump('payment channel corrected');
    else if (/\] EDIT-STAFF/.test(l)) bump('edit line staff');
    else if (/\] EDIT-NOTE/.test(l)) bump('edit note');
    else if ((m = l.match(/\] EXPENSE (\d+) (\S+)/))) { bump('expense ' + m[2]); if (Number(m[1]) > 1000 && m[2] === 'drawer') bump('expense drawer >1000 (PIN)'); }
    else if (/\] DEL/.test(l)) bump('expense deleted');
    else if ((m = l.match(/\] VAT (ON|OFF) (\d+)%/))) bump('VAT switch ' + m[1] + ' ' + m[2] + '%');
    else if (/\] CATEGORY/.test(l)) bump('category VAT flag changed');
    else if (/\] OPEN/.test(l)) bump('shift open');
    else if (/\] CLOSE/.test(l)) bump('shift close');
    else if (/\] CHECKPOINT/.test(l)) bump('full checkpoint (sheet+summaries+master+reports+telegram)');
  });
  for (let s = SEED0; s < SEED0 + RUNS; s++) {
    let res;
    try { res = await runSeed(s); }
    catch (e) { res = { problems: [{ kind: 'crash', msg: (e && e.stack) || String(e) }], log: [] }; }
    const n = res.problems.length;
    count(res.log || []);
    if (n) {
      bad++; failing.push(s);
      res.problems.forEach(p => { const k = p.kind + ': ' + p.msg.replace(/TX-\d+-[A-Z0-9]+/g, 'TX').replace(/[0-9A-Z]{6,8}:/g, '#:').replace(/-?\d[\d,.]*/g, 'N').slice(0, 90); kinds[k] = (kinds[k] || 0) + 1; });
      console.log(`seed ${s}: ${n} problems`);
      if (VERBOSE) { console.log(res.log.join('\n')); }
      res.problems.slice(0, 12).forEach(p => console.log('   - ' + p.kind + ': ' + p.msg.slice(0, 400)));
    } else console.log(`seed ${s}: OK`);
  }
  console.log(`\n${RUNS} seeds, ${bad} with problems${failing.length ? ' (' + failing.join(',') + ')' : ''}`);
  Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(String(v).padStart(5) + '  ' + k));
  if (process.argv.includes('--tally')) { console.log('\ncoverage tally:'); Object.keys(tally).sort().forEach(k => console.log(String(tally[k]).padStart(6) + '  ' + k)); }
  process.exit(bad ? 1 : 0);
})();
