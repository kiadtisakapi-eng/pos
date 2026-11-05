// ─────────────────────────────────────────────────────────────────────────────
//  ภาษาหน้าจอ ไทย / อังกฤษ (เจ้าของสั่ง 5 พ.ย. 2569)
//   [1] ค่าเริ่มต้นเป็นภาษาไทย · ทุกข้อความที่ส่งเข้า uiText() และทุกจุด data-i18n ใน index.html มีคำแปลครบ
//   [2] uiText ใช้ได้เฉพาะในฟังก์ชันวาดหน้าจอที่อนุญาต — กันคนมาเผลอใช้กับป้ายชีต / ใบเสร็จ / Telegram ทีหลัง
//   [3] หน้าขาย · ตะกร้า · คิว · หน้าชำระเงิน เป็นอังกฤษจริงเมื่อเลือก EN และกลับเป็นไทยได้ · ชื่อคนยัง escape
//   [4] จำภาษาแยกตามบัญชี (localStorage) — ไม่เข้าข้อมูลร้าน / ไฟล์สำรอง / IndexedDB
//   [5] ขายจริงตอนหน้าจอเป็น EN (เงินสด / บัตร / แบ่งจ่าย) → บิล · ป้ายชีต · แถวบนชีต เป็นภาษาไทยเหมือนเดิมทุกตัวอักษร
//   [6] ข้อความเตือน/ผิดพลาดยังเป็นภาษาไทย (ตามที่ตกลง)
//   พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนเพิ่มระบบภาษา> node tests/test_i18n_20261105.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db.js');
const ROOT = path.resolve(__dirname, '..');
const APP_SRC = fs.readFileSync(process.env.POS_APP_SRC || path.join(ROOT, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const R = makeRunner('--- ภาษาหน้าจอ ไทย/อังกฤษ (5 พ.ย. 2569) ---');
const t = R.t;
const THAI = /[฀-๿]/;
const THAI_LETTERS = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;   // ตัวอักษรไทย ไม่นับ ฿ (U+0E3F ใช้ในภาษาอังกฤษได้)
const proto = app => Object.getPrototypeOf(app);
const dict = env => vm.runInContext('I18N_EN', env.ctx);
const lang = env => vm.runInContext('UI_LANG', env.ctx);
const hasKey = (d, key, ctx) => Object.prototype.hasOwnProperty.call(d, key) || (!!ctx && Object.prototype.hasOwnProperty.call(d, ctx + '|' + key));

// ── ตัวช่วยอ่านซอร์ส: ช่วงของการเรียก uiText( … ) ทั้งก้อน (นับวงเล็บ ข้ามข้อความในเครื่องหมายคำพูด)
function uiTextCalls(src) {
  const out = [];
  const re = /\buiText\(/g; let m;
  while ((m = re.exec(src))) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;   // ตัวประกาศฟังก์ชันเอง
    { const ls = src.lastIndexOf('\n', m.index) + 1; if (/\/\//.test(src.slice(ls, m.index))) continue; }   // อยู่ในคอมเมนต์
    let i = m.index + m[0].length, depth = 1, q = null;
    const lits = []; let cur = '';
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (q) {
        if (c === '\\') { cur += c + src[++i]; continue; }
        if (c === q) { lits.push(cur); q = null; cur = ''; continue; }
        cur += c; continue;
      }
      if (c === "'" || c === '"') { q = c; cur = ''; continue; }
      if (c === '`') { throw new Error('ห้ามส่ง template literal เข้า uiText() — ใช้ {ชื่อ} + params แทน (บรรทัด ' + src.slice(0, m.index).split('\n').length + ')'); }
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const span = src.slice(m.index, i);
    const ctxM = /,\s*(?:null|\{[^}]*\}|undefined)\s*,\s*'([a-z]+)'\s*\)$/.exec(span);
    out.push({ line: src.slice(0, m.index).split('\n').length, lits, ctx: ctxM ? ctxM[1] : '' });
  }
  return out;
}
// ── ตัวช่วยอ่าน index.html: ข้อความ "ตรง" ของ element ที่ติด data-i18n (ไม่รวมข้อความของลูก) + ค่า attribute ที่ขอแปล
const VOID = new Set(['br', 'input', 'img', 'hr', 'meta', 'link', 'source', 'wbr']);
function htmlI18nTargets(html) {
  const out = [];
  const openRe = /<([a-zA-Z][\w-]*)(\s[^>]*?)?>/g; let m;
  while ((m = openRe.exec(html))) {
    const tag = m[1].toLowerCase(), attrs = m[2] || '';
    const ctxM = /\sdata-i18n(?:="([^"]*)")?(?=[\s>]|$)/.exec(attrs + ' ');
    const attrM = /\sdata-i18n-attr="([^"]*)"/.exec(attrs);
    const line = html.slice(0, m.index).split('\n').length;
    if (attrM) attrM[1].split(',').map(s => s.trim()).filter(Boolean).forEach(a => {
      const v = new RegExp('\\s' + a + '="([^"]*)"').exec(attrs);
      out.push({ line, kind: 'attr:' + a, text: v ? v[1] : null, ctx: ctxM ? (ctxM[1] || '') : '' });
    });
    if (!ctxM || VOID.has(tag)) continue;
    // เดินไปจนปิด element นี้ เก็บเฉพาะข้อความที่ระดับลึก 0
    let i = openRe.lastIndex, depth = 0; const texts = []; let buf = '';
    while (i < html.length) {
      if (html[i] === '<') {
        if (depth === 0 && buf.trim()) texts.push(buf); buf = '';
        if (html.startsWith('<!--', i)) { i = html.indexOf('-->', i) + 3; continue; }
        const tm = /^<\/?([a-zA-Z][\w-]*)[^>]*>/.exec(html.slice(i, i + 2000));
        if (!tm) { i++; continue; }
        const name = tm[1].toLowerCase(), closing = tm[0][1] === '/';
        if (closing) { if (depth === 0) break; depth--; }
        else if (!VOID.has(name) && !/\/>$/.test(tm[0])) depth++;
        i += tm[0].length; continue;
      }
      if (depth === 0) buf += html[i];
      i++;
    }
    texts.forEach(x => out.push({ line, kind: 'text', text: x.trim().replace(/\s+/g, ' '), ctx: ctxM[1] || '' }));
  }
  return out;
}
// ── ตัวช่วย: ชื่อเมธอดของคลาสที่ครอบบรรทัดนั้น
const KEYWORDS = new Set(['for', 'if', 'while', 'switch', 'catch', 'function', 'return', 'else']);
function methodAt(src, line) {
  const lines = src.split('\n');
  for (let i = line - 1; i >= 0; i--) {
    const top = /^(?:async )?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (top) return 'function ' + top[1];
    const mm = /^  (?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/.exec(lines[i]);
    if (mm && !KEYWORDS.has(mm[1])) return mm[1];
    if (/^class PosApp \{/.test(lines[i])) return '(class)';
  }
  return '(top-level)';
}

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[1] ค่าเริ่มต้นไทย + คำแปลครบ');
  const base = await makeShop({ role: 'staff' });
  const env0 = base.env, app0 = base.app;
  await t('ค่าเริ่มต้นเป็นภาษาไทย — uiText คืนข้อความไทยเดิมทุกตัวอักษร', () => {
    eq(lang(env0), 'th'); eq(app0.uiLang, 'th');
    eq(env0.ctx.uiText('ล้างตะกร้า'), 'ล้างตะกร้า');
    eq(env0.ctx.uiText('รอประมาณ {n} นาที', { n: 5 }), 'รอประมาณ 5 นาที');
  });
  await t('ทุกข้อความไทยที่ส่งเข้า uiText() ใน app.js มีคำแปลภาษาอังกฤษ', () => {
    const d = dict(env0), calls = uiTextCalls(APP_SRC), miss = [];
    ok(calls.length >= 30, 'พบการเรียก uiText น้อยผิดปกติ: ' + calls.length);
    calls.forEach(c => c.lits.filter(s => THAI.test(s)).forEach(s => { if (!hasKey(d, s, c.ctx)) miss.push(c.line + ': ' + s); }));
    ok(miss.length === 0, 'ไม่มีคำแปล:\n' + miss.join('\n'));
  });
  await t('ทุกจุด data-i18n / data-i18n-attr ใน index.html มีคำแปล (อยู่ในพจนานุกรม)', () => {
    const d = dict(env0), targets = htmlI18nTargets(HTML), miss = [];
    ok(targets.length >= 50, 'พบจุดแปลใน index.html น้อยผิดปกติ: ' + targets.length);
    targets.forEach(x => { if (x.text && THAI.test(x.text) && !hasKey(d, x.text, x.ctx)) miss.push(x.line + ' ' + x.kind + ': ' + x.text); });
    ok(miss.length === 0, 'ไม่มีคำแปล:\n' + miss.join('\n'));
  });
  await t('คำแปลภาษาอังกฤษไม่มีตัวอักษรไทยหลุด และไม่มีแท็ก HTML (วางลง innerHTML ตรง ๆ)', () => {
    const d = dict(env0), bad = Object.keys(d).filter(k => THAI_LETTERS.test(d[k]) || /[<>]/.test(d[k]));
    ok(bad.length === 0, bad.join(', '));
  });
  await t('ตัวแปร {ชื่อ} ในคำแปลตรงกับต้นฉบับไทยทุกคู่', () => {
    const d = dict(env0), bad = [];
    const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
    Object.keys(d).forEach(k => { const th = k.replace(/^[a-z]+\|/, ''); if (vars(th) !== vars(d[k])) bad.push(k); });
    ok(bad.length === 0, bad.join(', '));
  });
  await t('uiText: แทน {ชื่อ} รอบเดียว (ค่าที่มี {n} ไม่ถูกแทนซ้ำ) · ค่าไม่ใช่ข้อความคืนตามเดิม · บริบทหาไม่เจอใช้คีย์ปกติ', () => {
    const u = env0.ctx.uiText;
    eq(u('พนักงาน: {name}', { name: '{name}' }), 'พนักงาน: {name}');
    eq(u(undefined), undefined); eq(u(null), null); eq(u(5), 5);
    eq(u('ข้อความที่ไม่มีในพจนานุกรม'), 'ข้อความที่ไม่มีในพจนานุกรม');
    app0.applyUiLang('en', { render: false });
    try {
      eq(u('สินค้า', null, 'card'), 'Product'); eq(u('สินค้า'), 'Products'); eq(u('ลูกค้า', null, 'nav'), 'Customers');
      eq(u('ลูกค้า'), 'Customer'); eq(u('ล้างตะกร้า', null, 'nav'), 'Clear cart');
      eq(u('ข้อความที่ไม่มีในพจนานุกรม'), 'ข้อความที่ไม่มีในพจนานุกรม');   // หาไม่เจอ = ไทย ไม่ใช่ช่องว่าง
    } finally { app0.applyUiLang('th', { render: false }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[2] uiText อยู่ได้เฉพาะในงานวาดหน้าจอ');
  await t('uiText() ถูกเรียกเฉพาะในฟังก์ชันวาดหน้าจอที่อนุญาต (ไม่มีในป้ายชีต / ใบเสร็จ / Telegram / toast)', () => {
    const allowed = new Set(['renderPos', 'renderQueueScreen', 'updateQueueProgress', 'renderCart', 'updateCartTotals',
      'renderCardPaymentPanel', 'generatePromptPayQR', 'recalcCashChange', 'applyTheme', 'function applyI18nDom']);
    const bad = uiTextCalls(APP_SRC).map(c => ({ line: c.line, fn: methodAt(APP_SRC, c.line) })).filter(c => !allowed.has(c.fn));
    ok(bad.length === 0, bad.map(b => b.line + ' ใน ' + b.fn).join('\n'));
  });
  await t('ฟังก์ชันที่สร้างข้อมูลออกนอกหน้าจอไม่แตะ uiText / UI_LANG เลย', () => {
    const body = name => { const m = new RegExp('\\n  (?:async )?' + name + '\\(').exec(APP_SRC); ok(m, 'หา ' + name + ' ไม่เจอ'); const b = APP_SRC.indexOf('\n  }\n', m.index); return APP_SRC.slice(m.index, b); };
    ['sheetPaymentLabel', 'sheetServicesOf', 'paymentLabelOf', 'buildBillPayload', 'buildBackupPayload', 'saveState', 'buildCloudRequest']
      .forEach(n => { const s = body(n); ok(!/uiText|UI_LANG|I18N_EN/.test(s), n + ' ใช้ระบบภาษา'); });
    ok(!/uiText\(\s*CARD_FEE_LINE_NAME/.test(APP_SRC), 'ห้ามแปลชื่อบรรทัดค่าธรรมเนียม (ข้อมูลบนชีต)');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[3] หน้าจอ 4 หน้าเปลี่ยนเป็นอังกฤษจริง + กลับเป็นไทยได้');
  const P = proto(app0), E = id => env0.document.getElementById(id);
  const staffHtml = '<img src=x onerror=alert(1)>';
  app0.state.queue = [
    { id: 'q1', status: 'waiting', customerName: 'ลูกค้าทั่วไป (Walk-in)', totalDuration: 30, services: [{ name: 'ตัดผม', staffName: staffHtml }] },
    { id: 'q2', status: 'serving', customerName: '<b>คุณเอ</b>', startTime: Date.now() - 5 * 60000, totalDuration: 60, services: [{ name: 'นวด', staffName: 'บี' }] }];
  await t('คิว (ไทย): ข้อความเดิมครบ ไม่มีภาษาอังกฤษปน', () => {
    P.renderQueueScreen.call(app0);
    const w = E('queue-waiting-list').innerHTML, s = E('queue-serving-list').innerHTML;
    ok(/เริ่มบริการ/.test(w) && /ยกเลิกคิว/.test(w) && /รอประมาณ 30 นาที/.test(w) && /พนักงาน: /.test(w) && /ลูกค้าทั่วไป \(Walk-in\)/.test(w), w);
    ok(/เสร็จสิ้นงาน/.test(s) && /ให้บริการไปแล้ว 5\/60 นาที/.test(s), s);
    ok(!/Start|Staff:|Done/.test(w + s));
  });
  await t('คิว (EN): ปุ่ม/ป้ายเป็นอังกฤษ · ชื่อลูกค้าแบบ Walk-in แปลตอนแสดง · ชื่อคนยัง escape ไม่กลายเป็นแท็ก', () => {
    app0.applyUiLang('en', { render: false });
    try {
      P.renderQueueScreen.call(app0);
      const w = E('queue-waiting-list').innerHTML, s = E('queue-serving-list').innerHTML;
      ok(/>Start </.test(w) && />Cancel</.test(w) && /About 30 min/.test(w) && /Staff: /.test(w) && /Walk-in customer/.test(w), w);
      ok(/>Done </.test(s) && /In service 5\/60 min/.test(s), s);
      ok(!/<img src=x/.test(w) && /&lt;img src=x/.test(w), 'ชื่อพนักงานไม่ถูก escape: ' + w);
      ok(!/<b>คุณเอ/.test(s) && /&lt;b&gt;คุณเอ/.test(s), 'ชื่อลูกค้าไม่ถูก escape: ' + s);
      eq(app0.state.queue[0].customerName, 'ลูกค้าทั่วไป (Walk-in)', 'ข้อมูลคิวต้องไม่ถูกแก้');
    } finally { app0.applyUiLang('th', { render: false }); }
  });
  await t('ตะกร้า + หน้าขาย (EN): ป้ายผู้ให้บริการ/ตัวเลือก/การ์ดบริการ/ตัวเลือกลูกค้า/ช่องค้นหา เป็นอังกฤษ · ค่า value เดิม', () => {
    app0.applyUiLang('en', { render: false });
    try {
      app0.state.cart = [{ uniqueCartId: 'u1', id: 's1', name: 'ตัดผม', price: 300, staffId: 'gone' },
                         { uniqueCartId: 'u2', id: 'p1', name: 'แชมพู', price: 200, isProduct: true, commission: 10, staffId: '' }];
      P.renderCart.call(app0);
      const c = E('cart-items-list').innerHTML;
      ok(/Staff:/.test(c) && /Seller:/.test(c) && /— Choose new staff —/.test(c) && /— Choose seller \(gets commission\) —/.test(c), c);
      ok(!/ผู้ให้บริการ|คนขาย|เลือก/.test(c.replace(/ตัดผม|แชมพู|เอ|บี/g, '')), 'ยังมีไทยในตะกร้า: ' + c);
      app0.state.cart = [];
      P.renderPos.call(app0);
      const g = E('services-grid').innerHTML, sel = E('cart-customer-select').innerHTML;
      ok(/30 min/.test(g) && !/นาที/.test(g), g);
      ok(/value="">Walk-in customer</.test(sel) && /value="google">Walk-in \(Google\)</.test(sel) && /value="returning">Returning customer</.test(sel), sel);
      ok(/All/.test(E('category-tabs').innerHTML), E('category-tabs').innerHTML);
      const ph = E('pos-service-search')._attrs.placeholder;
      ok(/^Search services/.test(ph) && !THAI.test(ph), ph);
    } finally { app0.applyUiLang('th', { render: false }); }
    P.renderPos.call(app0);
    ok(/ลูกค้าทั่วไป \(Walk-in\)/.test(E('cart-customer-select').innerHTML), 'กลับไทยแล้วตัวเลือกลูกค้าต้องเป็นไทย');
    ok(/^ค้นหาบริการ/.test(E('pos-service-search')._attrs.placeholder), E('pos-service-search')._attrs.placeholder);
  });
  await t('ยอด VAT ในตะกร้า (EN): "VAT 7% (on ฿…)" · ตัวเลขไม่เปลี่ยน', () => {
    app0.state.cart = [{ uniqueCartId: 'u3', id: 'd1', name: 'น้ำ', price: 107, category: 'drinks', staffId: 'st-1' }];
    E('cart-discount').value = '0';
    P.updateCartTotals.call(app0);
    const th = E('summary-vat-label').innerText, totalTh = E('summary-total').innerText;
    app0.applyUiLang('en', { render: false });
    try {
      P.updateCartTotals.call(app0);
      ok(/^VAT 7% \(จาก ฿/.test(th), th);
      eq(E('summary-vat-label').innerText, th.replace('จาก', 'on'));
      eq(E('summary-total').innerText, totalTh);
    } finally { app0.applyUiLang('th', { render: false }); app0.state.cart = []; }
  });
  await t('หน้าชำระเงิน (EN): ปุ่ม "None" · "reduced from 10% to 5%" · คำแนะนำแบ่งจ่ายเป็นอังกฤษ · QR "Shop PromptPay"', () => {
    app0.applyUiLang('en', { render: false });
    try {
      readyCheckout(env0, [{ id: 's1', name: 'ตัดผม', price: 1000 }], 'credit');
      app0.renderCardPaymentPanel();
      ok(/>None</.test(E('card-fee-options').innerHTML), E('card-fee-options').innerHTML);
      app0.selectCardFeeRate(5);
      ok(/\(reduced from 10% to 5%\)/.test(E('card-fee-amount-label').innerText), E('card-fee-amount-label').innerText);
      app0.state.selectedPaymentMethod = 'split'; E('split-cash-amount').value = '';
      app0.renderCardPaymentPanel();
      eq(E('card-fee-error').innerText, 'Enter the cash paid and the card amount will show here');
      E('split-cash-amount').value = '1.5';
      const plan = app0.renderCardPaymentPanel();
      ok(THAI.test(E('card-fee-error').innerText), 'ข้อผิดพลาดจริงต้องยังเป็นไทย: ' + E('card-fee-error').innerText);
      ok(THAI.test(plan.error), 'plan.error ที่คืนออกไปต้องเป็นไทยเหมือนเดิม');
      app0.generatePromptPayQR();
      ok(/Shop PromptPay: 081-234-5678/.test(E('qr-total-label').innerHTML), E('qr-total-label').innerHTML);
    } finally { app0.applyUiLang('th', { render: false }); }
    app0.generatePromptPayQR();
    ok(/พร้อมเพย์ร้าน: 081-234-5678/.test(E('qr-total-label').innerHTML), 'กลับไทยแล้ว QR ต้องเป็นไทย');
  });
  await t('ช่องเงินทอน (EN): รับไม่ครบ = "Not enough cash" · ทศนิยม = "Whole baht only" · ครบ = ตัวเลขเหมือนเดิม · ปุ่มยืนยันเหมือนเดิม', () => {
    readyCheckout(env0, [{ id: 's1', name: 'ตัดผม', price: 1000 }], 'cash');
    const run = v => { E('cash-received').value = v; app0.recalcCashChange(); return [E('cash-change').innerText, E('btn-complete-checkout').disabled]; };
    const th = ['500', '5.5', '1000', '1500'].map(run);
    app0.applyUiLang('en', { render: false });
    let en;
    try { en = ['500', '5.5', '1000', '1500'].map(run); } finally { app0.applyUiLang('th', { render: false }); }
    eq(th.map(x => x[0]), ['ยอดเงินสดไม่เพียงพอ', 'ใส่จำนวนเต็มบาท (ไม่มีทศนิยม)', '฿0.00', '฿500.00']);
    eq(en.map(x => x[0]), ['Not enough cash', 'Whole baht only (no decimals)', '฿0.00', '฿500.00']);
    eq(en.map(x => x[1]), th.map(x => x[1]), 'ปุ่มยืนยันต้องเปิด/ปิดเหมือนเดิมทุกกรณี');
  });
  await t('เปลี่ยนภาษา: วาดใหม่เฉพาะตอนอยู่หน้าขาย/คิว (ไม่ไปวาดรายงาน/ตั้งค่า/แดชบอร์ดใหม่)', () => {
    const orig = app0.renderAll; let n = 0; app0.renderAll = () => { n++; };
    const prev = app0.state.activeScreen, got = {};
    try {
      ['reports', 'settings', 'dashboard', 'customers', 'pos', 'queue'].forEach(scr => {
        app0.state.activeScreen = scr; n = 0; app0.applyUiLang('en'); app0.applyUiLang('th'); got[scr] = n; });
    } finally { app0.renderAll = orig; app0.state.activeScreen = prev; }
    eq(got, { reports: 0, settings: 0, dashboard: 0, customers: 0, pos: 2, queue: 2 });
  });
  await t('ปุ่มธีม/ปุ่มภาษาเปลี่ยนตาม · ปุ่มภาษาบอก "ภาษาที่จะเปลี่ยนไป"', () => {
    app0.theme = 'dark';
    P.applyTheme.call(app0); ok(/โหมดมืด/.test(E('btn-theme-toggle-side').innerHTML));
    app0.applyUiLang('en', { render: false });
    try {
      P.applyTheme.call(app0); ok(/Dark/.test(E('btn-theme-toggle-side').innerHTML) && !/โหมด/.test(E('btn-theme-toggle-side').innerHTML));
      ok(/<span>ไทย<\/span>/.test(E('btn-lang-toggle-side').innerHTML)); eq(E('btn-lang-toggle-mobile').textContent, 'ไทย');
      ok(/<span>ไทย<\/span>/.test(E('btn-lang-toggle-pos').innerHTML), 'ปุ่มภาษาบนหัวหน้าขาย (มือถือจอแคบ)');
      eq(E('btn-lang-toggle-side')._attrs['aria-pressed'], 'true');
    } finally { app0.applyUiLang('th', { render: false }); }
    ok(/English/.test(E('btn-lang-toggle-side').innerHTML) && /English/.test(E('btn-lang-toggle-pos').innerHTML)); eq(E('btn-lang-toggle-mobile').textContent, 'EN');
  });
  base.env.dispose();

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[4] จำแยกตามบัญชี — ไม่เข้าข้อมูลร้าน');
  {
    const s = await makeShop({ role: 'staff' }); const app = s.app, env = s.env;
    const roleUI = proto(app).updateUserRoleUI.bind(app);
    let renders = 0; app.renderAll = () => { renders++; };
    await t('พนักงานกด EN → จำให้คนนี้ · ผู้จัดการล็อกอินต่อ = ไทย · พนักงานกลับมา = EN · ออกจากระบบ = ไทย', () => {
      app.state.activeScreen = 'pos';
      loginAs(app, 'staff'); roleUI(); eq(lang(env), 'th');
      eq(app.toggleUiLang(), 'en'); eq(lang(env), 'en'); ok(renders >= 1, 'เปลี่ยนภาษาแล้วต้องวาดหน้าจอใหม่');
      eq(JSON.parse(env.storage.pos_ui_lang_by_user), { 'st-1': 'en' });
      loginAs(app, 'manager'); roleUI(); eq(lang(env), 'th');
      loginAs(app, 'staff'); roleUI(); eq(lang(env), 'en');
      loginAs(app, 'owner'); roleUI(); eq(lang(env), 'th');
      loginAs(app, 'staff'); roleUI(); eq(lang(env), 'en');
      loginAs(app, null); roleUI(); eq(lang(env), 'th');
    });
    await t('กดกลับเป็นไทย = ลบค่าของคนนั้นออก (ไม่เหลือขยะ) · ค่าเสีย/อ่านไม่ได้ = ไทย ไม่พัง', () => {
      loginAs(app, 'staff'); roleUI(); eq(app.toggleUiLang(), 'th');
      eq(JSON.parse(env.storage.pos_ui_lang_by_user), {});
      env.storage.pos_ui_lang_by_user = '{เสีย'; roleUI(); eq(lang(env), 'th');
      env.storage.pos_ui_lang_by_user = JSON.stringify({ 'st-1': 'fr' }); roleUI(); eq(lang(env), 'th');
      env.storage.pos_ui_lang_by_user = JSON.stringify(['en']); roleUI(); eq(lang(env), 'th');
      delete env.storage.pos_ui_lang_by_user;
    });
    await t('ยังไม่มีคนล็อกอิน: กดได้ (เปลี่ยนเฉพาะรอบนี้) แต่ไม่จำ', () => {
      loginAs(app, null); roleUI(); eq(app.toggleUiLang(), 'en'); ok(!('pos_ui_lang_by_user' in env.storage));
      app.applyUiLang('th', { render: false });
    });
    await t('ภาษาไม่เข้าข้อมูลร้าน: saveState / ไฟล์สำรอง / IndexedDB ไม่มีค่าภาษา', async () => {
      loginAs(app, 'staff'); roleUI(); app.toggleUiLang(); eq(lang(env), 'en');
      await app.saveState();
      const raw = await env.rawAll();
      ok(!Object.keys(raw).some(k => /lang/i.test(k)), Object.keys(raw).join(','));
      const backup = JSON.stringify(app.buildBackupPayload());
      ok(!/pos_ui_lang|uiLang|"en"/.test(backup), 'ไฟล์สำรองมีค่าภาษา');
      app.toggleUiLang();
    });
    s.env.dispose();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[5] ขายจริงตอนหน้าจอเป็น EN → ข้อมูล/ชีตเป็นไทยเหมือนเดิม');
  {
    const s = await makeShop({ role: 'staff' }); const app = s.app, env = s.env, gas = s.gas;
    app.applyUiLang('en', { render: false });
    const sell = async (method, o) => {
      readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 1000 }], method);
      if (o && o.cash !== undefined) env.document.getElementById('split-cash-amount').value = String(o.cash);
      ok(await app.processCheckout(), 'ขายไม่ผ่าน: ' + method + ' ' + JSON.stringify(s.toasts.slice(-2)));
      await settle(40);
      return app.state.transactions.at(-1);
    };
    const cash = await sell('cash'), card = await sell('credit'), split = await sell('split', { cash: 400 });
    await t('บิลที่เก็บลงเครื่อง: ชื่อลูกค้า / ช่องทาง / บรรทัดค่าธรรมเนียม เป็นไทยและรหัสเดิม', () => {
      [cash, card, split].forEach(tx => eq(tx.customerName, 'ลูกค้าทั่วไป (Walk-in)'));
      eq([cash.paymentMethod, card.paymentMethod, split.paymentMethod], ['cash', 'credit', 'split']);
      ok(card.details.some(d => d.kind === 'card_fee' && d.name === 'ค่าธรรมเนียมบัตร'), JSON.stringify(card.details));
    });
    await t('ป้ายบนชีต / ใบเสร็จ / ประวัติ ยังเป็นภาษาไทยตอนหน้าจอเป็น EN', () => {
      eq(app.sheetPaymentLabel(cash), 'เงินสด'); eq(app.sheetPaymentLabel(card), 'Credit Card');
      ok(/^เงินสด 400 \+ Credit Card /.test(app.sheetPaymentLabel(split)), app.sheetPaymentLabel(split));
      ok(app.sheetServicesOf(card).includes('ค่าธรรมเนียมบัตร 10%'), JSON.stringify(app.sheetServicesOf(card)));
      eq(app.paymentLabelOf(card, 'short'), 'บัตร'); eq(app.paymentLabelOf(cash, 'long'), 'เงินสด');
    });
    await t('ข้อมูลที่ส่งขึ้นชีตเหมือนกันทุกตัวอักษรไม่ว่าหน้าจอภาษาอะไร', () => {
      const en = [cash, card, split].map(tx => JSON.stringify(app.buildBillPayload(tx)));
      app.applyUiLang('th', { render: false });
      const th = [cash, card, split].map(tx => JSON.stringify(app.buildBillPayload(tx)));
      app.applyUiLang('en', { render: false });
      eq(en, th);
    });
    await t('แถวบนชีตจริง (Apps Script ตัวจริง) เป็นภาษาไทยครบ', async () => {
      await app.syncPendingTransactions(true); await settle(60);
      const rows = gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => {
        const g = gas.sheet(n)._grid, head = g[0].map(h => String(h).trim());
        return g.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
      });
      eq(rows.length, 3, 'ต้องมี 3 บิลบนชีต');
      const pay = rows.map(r => r['ช่องทางชำระเงิน']);
      ok(pay.includes('เงินสด') && pay.includes('Credit Card') && pay.some(p => /^เงินสด 400 \+ Credit Card /.test(p)), JSON.stringify(pay));
      ok(rows.every(r => !/Walk-in customer|Card fee|Cash\b/.test(JSON.stringify(r))), 'มีคำอังกฤษจากหน้าจอหลุดขึ้นชีต: ' + JSON.stringify(rows));
    });

    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[6] ข้อความเตือน/ผิดพลาดยังเป็นไทย');
    await t('พนักงานกดหน้าตั้งค่าตอน EN → คำเตือนเป็นไทย (ตามที่ตกลงไว้)', () => {
      const before = s.toasts.length;
      app.switchTab('settings');
      const msg = s.toasts.slice(before).map(x => x.m).join(' | ');
      ok(/หน้าตั้งค่าเข้าถึงได้เฉพาะเจ้าของร้าน/.test(msg), msg);
    });
    app.applyUiLang('th', { render: false });
    s.env.dispose();
  }

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
