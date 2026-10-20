// VAT-ON end-to-end fuzzer (ย้ายจากผู้ตรวจ M · 19 ต.ค. 2569) — independent oracle (does not call app.js helpers) + sheet parsers for the fake Google Sheet.
'use strict';
const H = 3600e3;
const sat = v => Math.round(Number(v) * 100);
const fmtB = s => (s / 100).toFixed(2);

// ── business calendar (cutoff 06:00 Bangkok; shifts opened 03:00–05:59 belong to the new day) ──
function bizDate(ts) { return new Date(Number(ts) + 1 * H).toISOString().slice(0, 10); }           // (ts+7h)-6h
function bizMonth(ts) { const d = new Date(Number(ts) + 1 * H); return String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear(); }
function bkkHour(ts) { return new Date(Number(ts) + 7 * H).getUTCHours(); }
function anchorOf(sh) {
  const s = Number(sh.startTime);
  if (s > 0) {
    const h = bkkHour(s);
    if (h >= 3 && h < 6) { const d = new Date(s + 7 * H); d.setUTCHours(12, 0, 0, 0); return d.getTime() - 7 * H; }
    return s;
  }
  return Number(sh.endTime) || null;
}

// largest-remainder split of an integer total by weights
function lrSplit(total, weights) {
  const n = weights.length, out = new Array(n).fill(0);
  total = Math.round(total);
  if (!n || !(total > 0)) return out;
  const w = weights.map(x => (typeof x === 'number' && isFinite(x) && x > 0) ? x : 0);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) { out[0] = total; return out; }
  const fr = []; let used = 0;
  for (let i = 0; i < n; i++) { const ex = total * w[i] / sum; out[i] = Math.floor(ex); used += out[i]; fr.push({ i, f: ex - out[i] }); }
  fr.sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0, left = total - used; left > 0; k++, left--) out[fr[k % n].i]++;
  return out;
}

function commissionOf(netSat, type, rate) { return type === 'fixed' ? Number(rate) : Math.round(netSat * Number(rate) / 10000); }
function cardFee(baseBaht, rate) { return (baseBaht > 0 && rate > 0) ? Math.ceil(baseBaht * rate / 100 - 1e-9) : 0; }

// ── expected numbers of a freshly sold bill (independent recomputation from what was in the cart) ──
//  items: [{ price, vatable, commission, commissionType }] · vatable already decided from VAT switch + category flags at sale time
function expectSale(items, discount, rate, method, feeRate, cashPart) {
  const prices = items.map(i => sat(i.price));
  const subSat = prices.reduce((a, b) => a + b, 0);
  const nets = lrSplit(subSat - sat(discount), prices);
  let V = 0, N = 0;
  items.forEach((it, i) => { if (it.vatable && rate > 0) V += nets[i]; else N += nets[i]; });
  const vat = Math.round(V * rate / 100);
  const raw = N + V + vat;
  const total = Math.ceil(raw / 100) * 100;
  const out = { subSat, nets, V, N, vat, rnd: total - raw, total, comm: items.map((it, i) => commissionOf(nets[i], it.commissionType, it.commission)), fee: null };
  if (method === 'credit' || method === 'split') {
    const cardBase = total / 100 - (method === 'split' ? cashPart : 0);
    const F = cardFee(cardBase, feeRate);
    const feeVatable = rate > 0 && items.length > 0 && items.every(i => i.vatable);
    out.fee = { base: cardBase, amount: F, vatable: F > 0 ? feeVatable : false, target: total + F * 100 };
    if (F > 0) {
      // all fee nets c that keep "card price = cash price + F" exactly
      const ok = [];
      if (!feeVatable) ok.push(F * 100);
      else {
        const ideal = F * 100 * 100 / (100 + rate);
        for (let c = Math.floor(ideal) - 3; c <= Math.ceil(ideal) + 3; c++) {
          const V2 = V + c, vat2 = Math.round(V2 * rate / 100), raw2 = N + V2 + vat2;
          if (Math.ceil(raw2 / 100) * 100 === total + F * 100) ok.push(c);
        }
      }
      out.fee.okNets = ok;
      out.fee.ideal = feeVatable ? F * 100 * 100 / (100 + rate) : F * 100;
    }
  }
  return out;
}

// ── generic money equations of a stored bill (any time) ──
function billProblems(tx, staffIds) {
  const P = [];
  const p = (m) => P.push(`${tx.id}: ${m}`);
  const legacy = ['nonVatBase', 'vatableBase', 'vatAmount', 'rounding'].every(k => tx[k] === undefined || tx[k] === null);
  const sub = (tx.subtotal === undefined || tx.subtotal === null) ? sat(tx.total) : sat(tx.subtotal);
  const disc = sat(tx.discount || 0), total = sat(tx.total);
  if (legacy) { if (sub - disc !== total) p(`legacy total ${fmtB(total)} != sub-disc ${fmtB(sub - disc)}`); return P; }
  const N = sat(tx.nonVatBase), V = sat(tx.vatableBase), vat = sat(tx.vatAmount), rnd = sat(tx.rounding);
  const rate = (tx.vatRate === undefined || tx.vatRate === null) ? 7 : Number(tx.vatRate);
  if (sub - disc !== N + V) p(`sub-disc ${fmtB(sub - disc)} != N+V ${fmtB(N + V)}`);
  if (N + V + vat + rnd !== total) p(`N+V+vat+rnd ${fmtB(N + V + vat + rnd)} != total ${fmtB(total)}`);
  if (total % 100 !== 0) p(`total not whole baht ${fmtB(total)}`);
  if (rnd < 0 || rnd > 99) p(`rounding out of range ${fmtB(rnd)}`);
  if (Math.round(V * rate / 100) !== vat) p(`vat ${fmtB(vat)} != round(V*${rate}%)=${fmtB(Math.round(V * rate / 100))}`);
  if (Math.ceil((N + V + vat) / 100) * 100 !== total) p(`total not ceil(raw) ${fmtB(total)} raw ${fmtB(N + V + vat)}`);
  if (Array.isArray(tx.details) && tx.details.length) {
    let ps = 0, ns = 0, vs = 0;
    tx.details.forEach((d, i) => {
      ps += sat(d.price); ns += sat(d.netPrice);
      if (d.vatable === true) vs += sat(d.netPrice);
      if (d.kind === 'card_fee') { if (sat(d.commissionAmount || 0) !== 0) p('fee line has commission'); return; }
      const want = commissionOf(sat(d.netPrice), d.commissionType || 'percent', d.commission || 0);
      if (Number(d.commissionAmount) !== want) p(`line ${i} (${d.name}) commission ${d.commissionAmount} != ${want}`);
      if (!Number.isInteger(Number(d.commissionAmount))) p(`line ${i} commission not whole baht`);
      if (staffIds && d.staffId && !staffIds.has(d.staffId)) p(`line ${i} unknown staff ${d.staffId}`);
    });
    if (ps !== sub) p(`Σprice ${fmtB(ps)} != subtotal ${fmtB(sub)}`);
    if (ns !== sub - disc) p(`Σnet ${fmtB(ns)} != sub-disc ${fmtB(sub - disc)}`);
    if ((rate > 0 ? vs : 0) !== V) p(`Σvatable net ${fmtB(vs)} != V ${fmtB(V)}`);
  }
  if (tx.cardFee) {
    const cf = tx.cardFee;
    if (cf.amount !== cardFee(cf.base, cf.rate)) p(`card fee ${cf.amount} != ceil(${cf.base}*${cf.rate}%)`);
    if (cf.fullAmount !== cardFee(cf.base, cf.baseRate)) p(`card fee full ${cf.fullAmount} wrong`);
    const parts = tx.paymentMethod === 'split' ? tx.payments : [{ method: tx.paymentMethod, amount: tx.total }];
    const card = (parts || []).filter(x => x.method === 'credit').reduce((a, x) => a + sat(x.amount), 0);
    if (card !== sat(cf.base + cf.amount)) p(`card part ${fmtB(card)} != base+fee ${cf.base + cf.amount}`);
    const fl = (tx.details || []).filter(d => d.kind === 'card_fee');
    if (cf.amount > 0 && fl.length !== 1) p('fee line missing');
    if (fl.length === 1 && fl[0].vatable && !(sat(fl[0].netPrice) < sat(cf.amount))) p('vatable fee net not < amount');
    if (fl.length === 1 && !fl[0].vatable && sat(fl[0].netPrice) !== sat(cf.amount)) p('non-vat fee net != amount');
  }
  if (tx.paymentMethod === 'split') {
    const s = (tx.payments || []).reduce((a, x) => a + sat(x.amount), 0);
    if (s !== total) p(`split parts ${fmtB(s)} != total`);
  }
  return P;
}

// recompute discount edit independently: nets over line prices, flags & rate locked in the bill, commission per line
function expectEdit(tx, newDiscount) {
  const lines = tx.details;
  const prices = lines.map(d => sat(d.price));
  const sub = prices.reduce((a, b) => a + b, 0);
  const nets = lrSplit(sub - newDiscount * 100, prices);
  const rate = (tx.vatRate === undefined || tx.vatRate === null) ? 7 : Number(tx.vatRate);
  let V = 0, N = 0;
  lines.forEach((d, i) => { if (d.vatable === true && rate > 0) V += nets[i]; else N += nets[i]; });
  const vat = Math.round(V * rate / 100), raw = N + V + vat, total = Math.ceil(raw / 100) * 100;
  return { nets, V, N, vat, rnd: total - raw, total, comm: lines.map((d, i) => commissionOf(nets[i], d.commissionType || 'percent', d.commission || 0)) };
}

function partsOf(tx) {
  if (tx.paymentMethod === 'split') return (tx.payments || []).map(p => ({ method: p.method, amount: p.amount }));
  const m = (tx.paymentMethod === undefined || tx.paymentMethod === null || tx.paymentMethod === '') ? 'cash' : tx.paymentMethod;
  return [{ method: m, amount: tx.total }];
}
function isLegacy(tx) { return ['nonVatBase', 'vatableBase', 'vatAmount', 'rounding'].every(k => tx[k] === undefined || tx[k] === null); }
function isFrontCounter(d) { return d && d.isProduct === true && !d.staffId && Number(d.commission || 0) === 0; }

// ── independent recomputation of one summary period from the app's stored records ──
function expectPeriod(state, kind, key) {
  const inP = ts => kind === 'day' ? bizDate(ts) === key : bizMonth(ts) === key;
  const bills = state.transactions.filter(tx => tx && inP(tx.date));
  const r = { bills: bills.length, rev: 0, cash: 0, qr: 0, credit: 0, N: 0, V: 0, vat: 0, rnd: 0, exp: 0, expCount: 0,
    shifts: [], variance: 0, vatCats: new Map(), services: new Map(), staff: new Map(), ids: bills.map(b => b.id).sort() };
  const catName = id => { const c = state.categories.find(x => String(x.id) === String(id)); return c ? c.name : ((id === 'ไม่ระบุหมวด' || id === 'ค่าธรรมเนียมบัตร') ? id : 'หมวดที่ถูกลบแล้ว'); };
  bills.forEach(tx => {
    r.rev += sat(tx.total);
    partsOf(tx).forEach(p => { const s = sat(p.amount); if (p.method === 'promptpay') r.qr += s; else if (p.method === 'credit') r.credit += s; else r.cash += s; });
    const legacy = isLegacy(tx);
    if (legacy || (!sat(tx.vatAmount) && !sat(tx.vatableBase) && !sat(tx.rounding))) r.N += sat(tx.total);
    else {
      r.N += sat(tx.nonVatBase); r.V += sat(tx.vatableBase); r.vat += sat(tx.vatAmount); r.rnd += sat(tx.rounding);
      const rate = (tx.vatRate === undefined || tx.vatRate === null) ? 7 : Number(tx.vatRate);
      const parts = (tx.details || []).filter(d => d && d.vatable && sat(d.netPrice) > 0)
        .map(d => ({ cat: d.kind === 'card_fee' ? 'ค่าธรรมเนียมบัตร' : (d.category || 'ไม่ระบุหมวด'), w: sat(d.netPrice) }));
      if (!parts.length) parts.push({ cat: 'ไม่ระบุหมวด', w: sat(tx.vatableBase) || sat(tx.vatAmount) });
      const va = lrSplit(sat(tx.vatAmount), parts.map(x => x.w)), ba = lrSplit(sat(tx.vatableBase), parts.map(x => x.w));
      parts.forEach((x, i) => {
        const k = catName(x.cat) + '|' + rate;
        const e = r.vatCats.get(k) || { base: 0, vat: 0 }; e.base += ba[i]; e.vat += va[i]; r.vatCats.set(k, e);
      });
    }
    // services rows (ยอดหลังส่วนลด ก่อน VAT)
    const addSvc = (name, s) => { const e = r.services.get(name) || { count: 0, rev: 0 }; e.count++; e.rev += s; r.services.set(name, e); };
    const billNet = legacy ? sat(tx.total) : sat(tx.nonVatBase) + sat(tx.vatableBase);
    if (Array.isArray(tx.details) && tx.details.length) {
      tx.details.forEach(d => addSvc(d.kind === 'card_fee' && d.vatable && Number(tx.vatRate) > 0 ? 'ค่าธรรมเนียมบัตร (ก่อน VAT)' : d.name,
        sat(d.netPrice != null ? d.netPrice : d.price)));
    } else {
      const names = Array.isArray(tx.services) ? tx.services : [];
      if (names.length) { const sh = lrSplit(billNet, names.map(() => 1)); names.forEach((n, i) => addSvc(n, sh[i])); }
      else addSvc('ไม่ระบุรายการ', billNet);
    }
    // staff commission table
    (tx.details || []).forEach(d => {
      if (!d || d.kind === 'card_fee' || isFrontCounter(d)) return;
      const st = state.staff.find(s => s.id === d.staffId);
      const key = d.staffId;
      const e = r.staff.get(key) || { name: st ? st.name : (d.staffName || 'ไม่ระบุ'), role: st ? st.role : '-', count: 0, productCount: 0, sales: 0, comm: 0 };
      if (d.isProduct === true) e.productCount++; else e.count++;
      e.sales += sat(d.netPrice != null ? d.netPrice : d.price); e.comm += sat(d.commissionAmount || 0);
      r.staff.set(key, e);
    });
  });
  // expenses: by the expense's own time (shift anchor if missing) — closed shifts + active shift
  const take = (list, fb) => (list || []).forEach(e => { const k = e.time ? e.time : fb; if (k && inP(k)) { r.exp += sat(e.amount); r.expCount++; } });
  (state.shift.history || []).forEach(sh => take(sh.expenses, anchorOf(sh)));
  if (state.shift.active) take(state.shift.expenses, anchorOf(state.shift));
  // closed shifts by anchor
  (state.shift.history || []).filter(sh => { const a = anchorOf(sh); return a && inP(a); })
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
    .forEach(sh => { r.shifts.push({ expected: sat(sh.expectedCash), counted: sat(sh.countedCash), diff: sat(sh.difference), start: sh.startTime }); r.variance += sat(sh.difference); });
  return r;
}

// ── fake-sheet readers ──
function cellStr(v) { if (v == null) return ''; if (v instanceof Date) return v._shown || v.toISOString(); return String(v); }
function money(v) {   // "฿1,234.50" | number -> satang
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v == null ? '' : v).replace(/[฿,\s]/g, '');
  if (s === '' || s === '—') return null;
  const n = Number(s); return isFinite(n) ? Math.round(n * 100) : null;
}
function readBillTab(gas, name) {
  const sh = gas.sheet(name); if (!sh) return null;
  const g = sh._grid; if (!g.length) return { rows: [] };
  const head = g[0].map(h => String(h == null ? '' : h).trim());
  const col = h => head.indexOf(h);
  const out = [];
  for (let i = 1; i < g.length; i++) {
    const r = g[i]; if (!r || !r.some(v => v !== '' && v != null)) continue;
    const get = h => { const c = col(h); return c < 0 ? undefined : r[c]; };
    out.push({ row: i + 1, id: cellStr(get('เลขที่บิล')).trim(), when: cellStr(get('วันที่-เวลา')), customer: cellStr(get('ลูกค้า')),
      services: cellStr(get('รายการบริการ')), pay: cellStr(get('ช่องทางชำระเงิน')),
      subtotal: money(get('ราคารวม (฿)')), discount: money(get('ส่วนลด (฿)')),
      N: money(get('ไม่คิด VAT (฿)')), V: money(get('คิด VAT (฿)')), vat: money(get('VAT (฿)')), rnd: money(get('ปัดเศษ (฿)')),
      total: money(get('ยอดสุทธิ (฿)')), staff: cellStr(get('พนักงาน')), note: col('หมายเหตุ (POS)') < 0 ? undefined : cellStr(get('หมายเหตุ (POS)')),
      rev: cellStr(get('รุ่นบิล (ระบบ)')) });
  }
  return { head, rows: out };
}

// parse "สรุป-…" tab written by writeSummarySheet()
function readSummaryTab(gas, name) {
  const sh = gas.sheet(name); if (!sh) return null;
  const g = sh._grid.map(r => (r || []).map(v => v == null ? '' : v));
  const S = { kpi: null, channels: null, shifts: [], shiftTotal: null, vatRows: [], vatNonVat: null, vatTotal: null,
    services: [], svcFoot: {}, expenses: [], expTotal: null, profit: {}, staff: [], staffTotal: null, warnings: [] };
  for (let i = 0; i < g.length; i++) {
    const r = g[i], c0 = cellStr(r[0]).trim();
    if (/^⚠/.test(c0)) S.warnings.push(c0);
    if (c0 === 'รายได้รวม' && cellStr(r[1]) === 'ค่าใช้จ่ายรวม') {
      const v = g[i + 1];
      S.kpi = { rev: money(v[0]), exp: money(v[1]), net: money(v[2]), bills: parseInt(cellStr(v[3]), 10), avg: money(v[4]) };
    }
    if (c0 === 'เงินสด' && cellStr(r[1]) === 'โอน QR') { const v = g[i + 1]; S.channels = { cash: money(v[0]), qr: money(v[1]), credit: money(v[2]) }; }
    if (c0 === 'กะ' && cellStr(r[1]) === 'ผู้ปิด') {
      let j = i + 1;
      for (; j < g.length; j++) {
        const x = g[j], a = cellStr(x[0]);
        if (/^รวม · เงินตั้งต้น/.test(a)) { S.shiftTotal = { label: a, expected: money(x[2]), counted: money(x[3]), diff: money(x[4]) }; break; }
        if (/^📝/.test(a)) continue;
        S.shifts.push({ label: a, by: cellStr(x[1]), expected: money(x[2]), counted: money(x[3]), diff: money(x[4]) });
      }
    }
    if (c0 === 'กลุ่ม' && cellStr(r[1]) === 'ฐานภาษี (฿)') {
      for (let j = i + 1; j < g.length; j++) {
        const x = g[j], a = cellStr(x[0]);
        if (a === 'ยอดขายที่ไม่คิด VAT') { S.vatNonVat = money(x[1]); continue; }
        if (/^รวม · เงินปัดเศษ/.test(a)) { S.vatTotal = { label: a, base: money(x[1]), vat: money(x[3]) }; break; }
        const rr = typeof x[2] === 'number' ? Math.round(x[2] * 100) : parseInt(cellStr(x[2]), 10);
        S.vatRows.push({ name: a.replace(/^'/, ''), base: money(x[1]), rate: rr, vat: money(x[3]) });
      }
    }
    if (c0 === 'ลำดับ' && cellStr(r[1]) === 'ชื่อบริการ') {
      for (let j = i + 1; j < g.length; j++) {
        const x = g[j], b = cellStr(x[1]);
        if (b === 'รวมรายการ (ก่อน VAT)') { S.svcFoot.items = money(x[3]); S.svcFoot.count = Number(x[2]); continue; }
        if (b === 'ปัดเศษรายบรรทัด (บิลรุ่นเก่า)') { S.svcFoot.residual = money(x[3]); continue; }
        if (b === 'ภาษีมูลค่าเพิ่ม (VAT)') { S.svcFoot.vat = money(x[3]); continue; }
        if (b === 'เงินปัดเศษ (ปัดขึ้นเต็มบาท)') { S.svcFoot.rnd = money(x[3]); continue; }
        if (b === 'ยอดรับรวม') { S.svcFoot.total = money(x[3]); break; }
        S.services.push({ name: b.replace(/^'/, ''), count: Number(x[2]), rev: money(x[3]) });
      }
    }
    if (c0 === 'ลำดับ' && cellStr(r[1]) === 'รายการ') {
      for (let j = i + 1; j < g.length; j++) {
        const x = g[j], b = cellStr(x[1]);
        if (b === 'รวมค่าใช้จ่าย') { S.expTotal = money(x[3]); break; }
        if (cellStr(x[0]) === 'ไม่มีค่าใช้จ่ายในรอบนี้') { S.expTotal = 0; break; }
        if (typeof x[0] === 'number') S.expenses.push({ note: b, amount: money(x[3]) });
      }
    }
    if (c0 === 'รายได้รวม' && r[4] !== '' && typeof r[4] === 'number') S.profit.rev = money(r[4]);
    if (c0 === '(-) ค่าใช้จ่ายรวม') S.profit.exp = money(r[4]);
    if (c0 === ' = กำไรสุทธิ' || c0 === '= กำไรสุทธิ') S.profit.net = money(r[4]);
    if (c0 === 'ชื่อพนักงาน' && cellStr(r[1]) === 'ตำแหน่ง') {
      for (let j = i + 1; j < g.length; j++) {
        const x = g[j], a = cellStr(x[0]);
        if (a === 'รวมค่าคอมทั้งหมด') { S.staffTotal = money(x[4]); break; }
        const cnt = cellStr(x[2]); const m = /^(\d+) งาน · (\d+) สินค้า$/.exec(cnt);
        S.staff.push({ name: a.replace(/^'/, ''), role: cellStr(x[1]), count: m ? Number(m[1]) : Number(cnt), productCount: m ? Number(m[2]) : 0,
          sales: money(x[3]), comm: money(x[4]) });
      }
    }
  }
  return S;
}

function readMasterRow(gas, key) {
  const sh = gas.sheet('สรุปรายเดือน'); if (!sh) return null;
  const g = sh._grid; const head = g[0].map(h => String(h == null ? '' : h).trim());
  const c = h => head.indexOf(h);
  const rows = g.slice(1).filter(r => r && cellStr(r[c('ช่วงเวลา')]) === key);
  if (rows.length !== 1) return { dup: rows.length };
  const r = rows[0];
  return { type: cellStr(r[c('ประเภท')]), bills: Number(r[c('บิล')]), N: money(r[c('ไม่คิด VAT (฿)')]), V: money(r[c('คิด VAT (฿)')]),
    vat: money(r[c('VAT (฿)')]), rnd: money(r[c('ปัดเศษ (฿)')]), rev: money(r[c('รายได้รวม (฿)')]), exp: money(r[c('ค่าใช้จ่าย (฿)')]),
    net: money(r[c('กำไรสุทธิ (฿)')]), variance: r[c('เงินขาด/เกิน (฿)')] === '—' ? null : money(r[c('เงินขาด/เกิน (฿)')]) };
}

// ── compare one summary period: sheet tab + master row vs oracle ──
function comparePeriod(gas, E, kind, key) {
  const P = [];
  const p = m => P.push(`[${kind} ${key}] ${m}`);
  const S = readSummaryTab(gas, 'สรุป-' + key);
  if (!S) { p('summary tab missing'); return P; }
  const eqS = (label, got, want) => { if (got !== want) p(`${label}: sheet ${got === null || got === undefined ? got : fmtB(got)} vs expected ${fmtB(want)}`); };
  if (!S.kpi) p('KPI block missing');
  else {
    eqS('revenue', S.kpi.rev, E.rev); eqS('expenses', S.kpi.exp, E.exp); eqS('net', S.kpi.net, E.rev - E.exp);
    if (S.kpi.bills !== E.bills) p(`bill count sheet ${S.kpi.bills} vs ${E.bills}`);
    eqS('avg bill', S.kpi.avg, E.bills ? Math.round(E.rev / E.bills) : 0);
  }
  if (!S.channels) p('channel block missing');
  else { eqS('cash rev', S.channels.cash, E.cash); eqS('qr rev', S.channels.qr, E.qr); eqS('credit rev', S.channels.credit, E.credit); }
  // shifts
  if (S.shifts.length !== E.shifts.length) p(`shift rows sheet ${S.shifts.length} vs ${E.shifts.length}`);
  else E.shifts.forEach((s, i) => { const g = S.shifts[i]; eqS(`shift#${i} expected`, g.expected, s.expected); eqS(`shift#${i} counted`, g.counted, s.counted); eqS(`shift#${i} diff`, g.diff, s.diff); });
  // VAT
  const hasVat = E.V > 0 || E.vat > 0 || E.rnd > 0;
  if (hasVat !== !!S.vatTotal) p(`VAT block present=${!!S.vatTotal} expected=${hasVat}`);
  if (S.vatTotal) {
    eqS('VAT base', S.vatTotal.base, E.V); eqS('VAT amount', S.vatTotal.vat, E.vat); eqS('VAT nonVat row', S.vatNonVat, E.N);
    const m = /เงินปัดเศษ ([\d,]+\.\d\d)/.exec(S.vatTotal.label); if (!m || money(m[1]) !== E.rnd) p(`VAT block rounding label ${S.vatTotal.label} vs ${fmtB(E.rnd)}`);
    const gotCats = new Map(S.vatRows.map(r => [r.name + '|' + r.rate, r]));
    if (gotCats.size !== E.vatCats.size) p(`VAT category rows sheet ${[...gotCats.keys()].join(',')} vs ${[...E.vatCats.keys()].join(',')}`);
    E.vatCats.forEach((v, k) => { const g = gotCats.get(k); if (!g) p(`VAT category ${k} missing`); else { eqS(`VAT cat ${k} base`, g.base, v.base); eqS(`VAT cat ${k} vat`, g.vat, v.vat); } });
  }
  // services
  const gotSvc = new Map(S.services.map(s => [s.name, s]));
  if (gotSvc.size !== E.services.size) p(`service rows sheet [${[...gotSvc.keys()]}] vs [${[...E.services.keys()]}]`);
  E.services.forEach((v, k) => { const g = gotSvc.get(k); if (!g) p(`service ${k} missing`); else { if (g.count !== v.count) p(`service ${k} count ${g.count} vs ${v.count}`); eqS(`service ${k} revenue`, g.rev, v.rev); } });
  eqS('services footer items', S.svcFoot.items, [...E.services.values()].reduce((a, x) => a + x.rev, 0));
  eqS('services footer VAT', S.svcFoot.vat, E.vat); eqS('services footer rounding', S.svcFoot.rnd, E.rnd); eqS('services footer total', S.svcFoot.total, E.rev);
  // expenses + profit
  eqS('expense block total', S.expTotal, E.exp);
  if (S.expenses.length !== E.expCount) p(`expense rows sheet ${S.expenses.length} vs ${E.expCount}`);
  eqS('profit rev', S.profit.rev, E.rev); eqS('profit exp', S.profit.exp, -E.exp === 0 ? 0 : -E.exp); eqS('profit net', S.profit.net, E.rev - E.exp);
  // staff commissions
  const want = [...E.staff.values()].filter(s => s.count > 0 || s.productCount > 0);
  const gotSt = new Map(S.staff.map(s => [s.name, s]));
  if (gotSt.size !== want.length) p(`staff rows sheet [${[...gotSt.keys()]}] vs [${want.map(s => s.name)}]`);
  want.forEach(s => { const g = gotSt.get(s.name); if (!g) { p(`staff ${s.name} missing`); return; }
    if (g.count !== s.count || g.productCount !== s.productCount) p(`staff ${s.name} count ${g.count}/${g.productCount} vs ${s.count}/${s.productCount}`);
    eqS(`staff ${s.name} sales`, g.sales, s.sales); eqS(`staff ${s.name} commission`, g.comm, s.comm); });
  eqS('staff commission total', S.staffTotal, want.reduce((a, s) => a + s.comm, 0));
  if (S.warnings.length) p('warnings on sheet: ' + S.warnings.join(' | '));
  // master row
  const M = readMasterRow(gas, key);
  if (!M) p('master sheet missing');
  else if (M.dup !== undefined) p(`master rows for ${key}: ${M.dup}`);
  else {
    if (M.bills !== E.bills) p(`master bills ${M.bills} vs ${E.bills}`);
    eqS('master N', M.N, E.N); eqS('master V', M.V, E.V); eqS('master VAT', M.vat, E.vat); eqS('master rounding', M.rnd, E.rnd);
    eqS('master revenue', M.rev, E.rev); eqS('master expenses', M.exp, E.exp); eqS('master net', M.net, E.rev - E.exp);
    if (E.shifts.length === 0) { if (M.variance !== null) p(`master variance ${M.variance} but no closed shift`); }
    else eqS('master variance', M.variance, E.variance);
  }
  return P;
}

module.exports = { sat, fmtB, bizDate, bizMonth, bkkHour, anchorOf, lrSplit, commissionOf, cardFee, expectSale, billProblems, expectEdit,
  partsOf, isLegacy, isFrontCounter, expectPeriod, readBillTab, readSummaryTab, readMasterRow, comparePeriod, cellStr, money };
