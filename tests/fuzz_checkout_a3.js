// a3 audit: property/fuzz test of the REAL checkout path (cart -> payment modal -> processCheckout -> IndexedDB -> GAS sheet)
// Run: cd /home/claude/w/a3 && TZ=Asia/Bangkok node tests/fuzz_checkout_a3.js [iterations] [seed]
const fs = require('fs'), vm = require('vm'), path = require('path');
const { makeShop, settle } = require('./fixtures_db.js');

const N = Number(process.argv[2] || 400);
let SEED = Number(process.argv[3] || 12345);
const rnd = () => { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const sat = v => Math.round(Number(v) * 100);

const CATS = [
  { id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false },
  { id: 'massage', name: 'นวด', icon: 'fa-spa', vat: true },
  { id: 'drinks', name: 'เครื่องดื่ม', icon: 'fa-mug-hot', vat: true },
  { id: 'retail', name: 'ของขาย', icon: 'fa-store', vat: false }
];
function makeServices() {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const product = rnd() < 0.45;
    const fixed = rnd() < 0.4;
    const price = product ? pick([0, 1, 7, 15, 20, 25, 33, 59, 99, 150, 333, 1299]) : pick([1, 99, 150, 299, 300, 450, 555, 999, 1000, 1999, 3333, 12345]);
    let commission = fixed ? Math.min(price, pick([0, 0, 1, 5, 20, 50, 100, 300])) : pick([0, 0, 5, 10, 15, 33, 50]);
    out.push({ id: 'z' + i, name: (product ? 'P' : 'S') + i, price, type: product ? 'product' : 'service',
      duration: product ? 0 : pick([15, 30, 60]), category: pick(CATS).id, commission,
      commissionType: fixed ? 'fixed' : 'percent', cost: product && rnd() < 0.5 ? ri(0, price) : undefined });
  }
  return out;
}

// independent oracle (does not reuse app code)
function oracle(cartItems, discount, vatOn, vatRate) {
  const prices = cartItems.map(c => c.price);
  const subtotal = prices.reduce((a, b) => a + b, 0);
  const remain = (subtotal - discount) * 100;
  // largest remainder
  const nets = prices.map(p => Math.floor(remain * p / subtotal));
  let left = remain - nets.reduce((a, b) => a + b, 0);
  const fr = prices.map((p, i) => ({ i, f: remain * p / subtotal - Math.floor(remain * p / subtotal) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) nets[fr[k % fr.length].i]++;
  const rate = vatOn ? vatRate : 0;
  const vatable = cartItems.map(c => vatOn && CATS.find(x => x.id === c.category).vat);
  let vb = 0, nb = 0;
  nets.forEach((n, i) => { if (vatable[i] && rate > 0) vb += n; else nb += n; });
  const vat = Math.round(vb * rate / 100);
  const raw = vb + nb + vat;
  const total = Math.ceil(raw / 100) * 100;
  return { nets, vatable, vb, nb, vat, total, subtotal, rate };
}

(async () => {
  const shop = await makeShop({ role: 'staff' });
  const { env, app } = shop;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'promptpay-qr.js'), 'utf8'), env.ctx);
  const doc = env.document;
  app.state.categories = CATS;
  app.state.staff.push({ id: 'st-2', name: 'ซี', role: 'หมอนวด', accessLevel: 'staff' });
  const failures = [];
  const stats = { sold: 0, rejected: 0, planFail: 0, byMethod: {}, vatOnSold: 0, feeVat: 0 };
  const fail = (it, msg, extra) => { failures.push({ it, msg, extra }); };
  const receiptFn = Object.getPrototypeOf(app).showThermalReceipt;

  for (let it = 0; it < N; it++) {
    app.state.services = makeServices();
    if (rnd() < 0.35) app.state.services.forEach(x => { x.category = pick(['massage', 'drinks']); });
    const vatOn = rnd() < 0.8;
    const vatRate = pick([7, 7, 7, 10, 0, 3]);
    app.vatEnabled = vatOn; app.vatRate = vatRate;
    app.cardFeeRate = pick([10, 10, 10, 5, 0, 3, 30, 7]);
    app.clearCart();
    const nItems = ri(1, 8);
    for (let k = 0; k < nItems; k++) {
      const s = pick(app.state.services);
      app.addToCart(s.id);
    }
    // choose staff for non-front-counter lines (sometimes also for front-counter lines)
    for (const c of app.state.cart) {
      if (!app.isFrontCounterLine(c) || rnd() < 0.2) app.changeItemStaff(c.uniqueCartId, pick(['st-1', 'st-2', 'mg-1']));
    }
    const cartCopy = JSON.parse(JSON.stringify(app.state.cart));
    const subtotal = cartCopy.reduce((a, c) => a + c.price, 0);
    let discount = 0;
    const dr = rnd();
    if (dr < 0.4 && subtotal > 1) discount = ri(1, subtotal - 1);
    else if (dr < 0.45) discount = subtotal + ri(0, 3);  // must be rejected
    doc.getElementById('cart-discount').value = String(discount);
    const exp = subtotal > 0 && discount < subtotal ? oracle(cartCopy, discount, vatOn, vatRate) : null;

    const before = app.state.transactions.length;
    app._checkoutAttempt = null;
    app.state.selectedPaymentMethod = null;
    app.openCheckoutModal();
    if (!app._checkoutAttempt) {
      if (exp && exp.total > 0) fail(it, 'checkout modal did not open for valid cart', { cartCopy, discount });
      stats.rejected++; continue;
    }
    if (!exp || exp.total <= 0) { fail(it, 'modal opened for zero/invalid bill', { subtotal, discount }); continue; }
    if (sat(app._checkoutAttempt.total) !== exp.total) fail(it, 'attempt total != oracle', { a: app._checkoutAttempt.total, exp: exp.total });

    const method = pick(['cash', 'cash', 'promptpay', 'credit', 'credit', 'split', 'split']);
    app.selectPaymentMethod(method);
    const total0 = exp.total / 100;
    let cashPart = null, received = null, feeRateUsed = app.cardFeeRate, shownPlan = null;
    if (method === 'cash') {
      received = total0 + pick([0, 0, 1, 20, 100, 1000]);
      doc.getElementById('cash-received').value = String(received);
      app.recalcCashChange();
    }
    if (method === 'credit' || method === 'split') {
      const fr = rnd();
      if (fr < 0.2 && app.cardFeeRate > 5) { app.selectCardFeeRate(5); feeRateUsed = 5; }
      else if (fr < 0.3 && app.cardFeeRate > 0) { app.selectCardFeeRate(0); feeRateUsed = 0; }
      else if (fr < 0.4 && app.cardFeeRate > 1) { const c = ri(1, app.cardFeeRate - 1); doc.getElementById('card-fee-custom').value = String(c); feeRateUsed = c; }
      if (method === 'split') {
        if (total0 < 2) { cashPart = 1; } else cashPart = ri(1, total0 - 1);
        doc.getElementById('split-cash-amount').value = String(cashPart);
      }
      shownPlan = app.renderCardPaymentPanel();
      if (!shownPlan || !shownPlan.ok) {
        if (!(method === 'split' && total0 < 2)) { stats.planFail++; fail(it, 'plan failed for valid input', { err: shownPlan && shownPlan.error, method, feeRateUsed, cartCopy, discount, vatOn, vatRate }); }
        continue;
      }
    }
    const btnDisabled = doc.getElementById('btn-complete-checkout').disabled;
    if (btnDisabled) fail(it, 'confirm button disabled on valid input', { method });
    const res = await app.processCheckout();
    await settle(5);
    if (res !== true || app.state.transactions.length !== before + 1) {
      fail(it, 'checkout failed', { res, method, toasts: shop.toasts.slice(-2) });
      continue;
    }
    stats.sold++; stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
    const tx = app.state.transactions.at(-1);
    // ---- invariants ----
    const svc = tx.details.filter(d => d.kind !== 'card_fee');
    const fee = tx.details.find(d => d.kind === 'card_fee');
    const intSat = v => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    ['subtotal', 'discount', 'nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'total'].forEach(k => {
      if (!intSat(tx[k])) fail(it, 'non-satang field ' + k, tx[k]);
    });
    if (sat(tx.total) % 100 !== 0) fail(it, 'total not whole baht', tx.total);
    if (sat(tx.subtotal) - sat(tx.discount) !== sat(tx.nonVatBase) + sat(tx.vatableBase)) fail(it, 'subtotal-discount != bases', tx);
    if (sat(tx.nonVatBase) + sat(tx.vatableBase) + sat(tx.vatAmount) + sat(tx.rounding) !== sat(tx.total)) fail(it, 'bases+vat+rnd != total');
    if (sat(tx.rounding) < 0 || sat(tx.rounding) > 99) fail(it, 'rounding out of range', tx.rounding);
    if (sat(tx.vatAmount) !== Math.round(sat(tx.vatableBase) * tx.vatRate / 100)) fail(it, 'vat != base*rate', tx);
    const vatLinesSum = tx.details.filter(d => d.vatable && tx.vatRate > 0).reduce((a, d) => a + sat(d.netPrice), 0);
    if (vatLinesSum !== sat(tx.vatableBase)) fail(it, 'vatable lines sum != vatableBase');
    const netSum = svc.reduce((a, d) => a + sat(d.netPrice), 0);
    if (netSum !== exp.subtotal * 100 - discount * 100) fail(it, 'service net sum != subtotal-discount');
    svc.forEach((d, i) => {
      if (sat(d.netPrice) !== exp.nets[i]) fail(it, 'line net != oracle', { i, got: d.netPrice, exp: exp.nets[i] });
      if (d.netPrice < 0 || d.netPrice > d.price) fail(it, 'line net out of [0,price]', d);
      if (!!d.vatable !== !!exp.vatable[i]) fail(it, 'line vatable flag != oracle', d);
      const c = cartCopy[i];
      const expComm = c.commissionType === 'fixed' ? c.commission : Math.round(exp.nets[i] * c.commission / 10000);
      if (d.commissionAmount !== expComm) fail(it, 'commission != oracle', { d, expComm });
      if (!Number.isInteger(d.commissionAmount)) fail(it, 'commission not whole baht', d.commissionAmount);
      if (d.commissionType === 'fixed' && d.commissionAmount > d.netPrice + 1e-9 && d.netPrice < d.price)
        stats.fixedCommOverNet = (stats.fixedCommOverNet || 0) + 1;
      if (d.isProduct !== (c.isProduct === true)) fail(it, 'isProduct mismatch');
    });
    let feeAmt = 0;
    if (method === 'credit' || method === 'split') {
      const cardBase = method === 'split' ? total0 - cashPart : total0;
      feeAmt = feeRateUsed > 0 ? Math.ceil(cardBase * feeRateUsed / 100 - 1e-9) : 0;
      if (!tx.cardFee || tx.cardFee.amount !== feeAmt || tx.cardFee.base !== cardBase || tx.cardFee.rate !== feeRateUsed)
        fail(it, 'card fee mismatch', { cardFee: tx.cardFee, feeAmt, cardBase, feeRateUsed });
      if ((feeAmt > 0) !== !!fee) fail(it, 'fee line presence mismatch');
      if (fee) {
        const allVat = exp.vatable.every(Boolean) && exp.rate > 0;
        if (!!fee.vatable !== allVat) fail(it, 'fee vatable flag wrong', { fee, allVat });
        if (fee.vatable) stats.feeVat++;
        if (!fee.vatable && sat(fee.netPrice) !== feeAmt * 100) fail(it, 'non-vat fee net != amount');
        if (fee.vatable && !(sat(fee.netPrice) < feeAmt * 100)) fail(it, 'vat fee net !< amount');
        if (fee.commissionAmount !== 0 || fee.staffId) fail(it, 'fee line has commission/staff');
      }
      if (feeRateUsed < app.cardFeeRate && tx.cardFee && tx.cardFee.reducedBy !== 'เอ') fail(it, 'reducedBy missing', tx.cardFee);
      if (shownPlan && sat(shownPlan.totals.total) !== sat(tx.total)) fail(it, 'shown plan total != stored total');
      if (shownPlan && sat(shownPlan.cardAmount) !== sat(cardBase + feeAmt)) fail(it, 'shown card amount != base+fee');
    }
    if (sat(tx.total) !== exp.total + feeAmt * 100) fail(it, 'total != cash price + F', { total: tx.total, exp: exp.total, feeAmt });
    // tender
    const parts = app.paymentPartsOf(tx);
    if (!parts || parts.reduce((a, p) => a + sat(p.amount), 0) !== sat(tx.total)) fail(it, 'payments sum != total', parts);
    const tnd = app.tenderOf(tx);
    if (!tnd.valid || tnd.parts.reduce((a, p) => a + sat(p.amount), 0) !== sat(tx.total)) fail(it, 'tender sum != total', tx.tender);
    if (method === 'split') {
      const cp = tnd.parts.find(p => p.method === 'cash'), kp = tnd.parts.find(p => p.method === 'credit');
      if (!cp || cp.amount !== cashPart || !kp || sat(kp.amount) !== sat(total0 - cashPart + feeAmt)) fail(it, 'split parts wrong', tnd.parts);
    }
    if (method === 'cash') {
      if (sat(tx.cashReceived) - sat(tx.cashChange) !== sat(tx.total) || tx.cashReceived !== received) fail(it, 'cash change wrong', tx);
    }
    const st = app.billMoneyStatus(tx);
    if (!st.settled) fail(it, 'billMoneyStatus not settled', st);
    const problems = app.validateBillRecord(tx);
    if (problems.some(p => p.fatal)) fail(it, 'validateBillRecord fatal', problems);
    // commission totals sanity
    const comm = svc.reduce((a, d) => a + d.commissionAmount, 0);
    if (comm < 0) fail(it, 'negative commission');
    // receipt numbers == stored numbers
    receiptFn.call(app, tx);
    const html = doc.getElementById('thermal-receipt-preview').innerHTML;
    const grab = label => { const m = html.match(new RegExp('<span>' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>\\s*<span>([^<]+)</span>')); return m ? Number(m[1].replace(/[฿,+]/g, '')) : null; };
    const rTotal = grab('รวมทั้งสิ้น:');
    if (rTotal === null || sat(rTotal) !== sat(tx.total)) fail(it, 'receipt total != tx.total', { rTotal, total: tx.total });
    const subLabel = app.receiptSubtotalLabel(svc);
    const rSub = grab(subLabel);
    if (rSub === null || sat(rSub) !== exp.subtotal * 100) fail(it, 'receipt subtotal wrong', { rSub, subLabel });
    // receipt item prices sum == receipt subtotal
    const itemPrices = [...html.matchAll(/receipt-item-details">\s*<span>[^<]*<\/span>\s*<span>฿([^<]+)<\/span>/g)].map(m => Number(m[1].replace(/,/g, '')));
    if (itemPrices.reduce((a, b) => a + b, 0) !== exp.subtotal) fail(it, 'receipt item prices do not add up', { itemPrices, sub: exp.subtotal });
    if (/ต้องตรวจสอบ|ยังไม่ได้คืน|ชำระตอนขาย/.test(html)) fail(it, 'receipt shows money-problem text for a fresh bill');
    if (tx.vatAmount > 0) {
      const rv = grab(`VAT ${tx.vatRate}%:`);
      if (rv === null || sat(rv) !== sat(tx.vatAmount)) fail(it, 'receipt VAT wrong', { rv });
    }
    if (method === 'split') {
      const splitRows = [...html.matchAll(/•\s*(เงินสด|Credit Card):<\/span><span>฿([^<]+)</g)].map(m => Number(m[2].replace(/,/g, '')));
      if (splitRows.reduce((a, b) => a + b, 0) * 100 !== sat(tx.total)) fail(it, 'receipt split rows != total', splitRows);
    }
    if (vatOn && tx.vatAmount > 0) stats.vatOnSold++;
    if (it % 40 === 39) {
      await settle(20); await app.syncPendingTransactions(true); await settle(60);
    }
  }
  await settle(20); await app.syncPendingTransactions(true); await settle(80);
  const notSynced = app.state.transactions.filter(t => t.syncStatus !== 'synced');
  notSynced.slice(0, 5).forEach(t => fail('sync', 'bill not synced to sheet', { id: t.id, issue: t.syncIssue, status: t.syncStatus, total: t.total, pm: t.paymentMethod }));
  console.log('stats', JSON.stringify(stats), 'notSynced', notSynced.length, 'of', app.state.transactions.length);
  const byMsg = {};
  failures.forEach(f => { (byMsg[f.msg] = byMsg[f.msg] || []).push(f); });
  Object.keys(byMsg).forEach(m => console.log('FAIL x' + byMsg[m].length + ': ' + m, JSON.stringify(byMsg[m][0]).slice(0, 900)));
  console.log(failures.length ? 'FAILURES ' + failures.length : 'ALL INVARIANTS HOLD');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
