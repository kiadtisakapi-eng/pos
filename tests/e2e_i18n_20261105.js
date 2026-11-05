// ภาษาหน้าจอ ไทย/อังกฤษ บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง + Apps Script ตัวจริงบนชีตจำลอง) — 5 พ.ย. 2569
//   4 ขนาดจอ (iPad แนวนอน/แนวตั้ง · มือถือ · มือถือจอเล็ก) — ทุกขนาด:
//   [A] พนักงานล็อกอิน → กดปุ่มภาษาที่เห็นบนจอ → เมนู · หน้าขาย · ตะกร้า · คิว · หน้าชำระเงินทุกช่องทาง
//       ไม่มีตัวอักษรไทยเหลือ (ข้อมูลร้านในเทสต์ตั้งชื่อเป็นอังกฤษ — ไทยที่เหลือ = ข้อความที่ลืมแปล) · ไม่ล้นจอแนวนอน
//   [B] ขายเงินสดตอนเป็น EN → ใบเสร็จยังเป็นไทย · บิลใน IndexedDB + แถวบนชีต เป็นไทยเหมือนเดิม
//   [C] รีโหลดหน้า (กู้เซสชัน) → ยังเป็น EN · ออกจากระบบ → ผู้จัดการล็อกอิน = ไทย · พนักงานกลับมา = EN
//   [D] กลับเป็นไทย → ข้อความทุกจุดคืนเป็นไทยตรงตามเดิม (เทียบกับตอนเปิดแอปครั้งแรก)
//   + เจ้าของบนจอเตี้ย (แถบข้าง): ปุ่มธีม/ภาษาแถวเดียว เมนูล่างสุดไม่ตกขอบ
//
//   node tests/e2e_i18n_20261105.js        (ภาพหน้าจอ: SHOT=1 → โฟลเดอร์ shots/)
//   พิสูจน์ว่าจับของจริง: รันไฟล์นี้กับโปรเจกต์ก่อนเพิ่มระบบภาษา → ต้องตก
const { chromium } = require('playwright');
const { createGasEnv } = require('./gas_env.js');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,700):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const PORT = 8147;
const shot = async (pg, name) => { if (!process.env.SHOT) return; fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); await pg.screenshot({ path: path.join(ROOT, 'shots', name + '.png') }); };
const settle = (pg, ms) => pg.waitForTimeout(ms == null ? 300 : ms);
const EXPECTED_CONSOLE = /favicon|Failed to load resource/i;
// ตัวอักษรไทยที่ "มองเห็นได้" ในส่วนที่เลือก (ไม่นับ ฿) — คืนรายการข้อความที่ยังเป็นไทย
const thaiLeft = (pg, sel) => pg.evaluate(sel => {
  const TH = /[ก-ฺเ-๛]/;
  const out = [];
  document.querySelectorAll(sel).forEach(root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (!TH.test(n.data)) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || (!r.width && !r.height) || el.closest('[style*="display: none"]')) continue;
      if (el.closest('[id^="btn-lang-toggle"]')) continue;   // ปุ่มภาษาตั้งใจเขียน "ไทย" เป็นภาษาไทย
      out.push(n.data.trim().slice(0, 60));
    }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      if (!el.getClientRects().length || el.closest('[id^="btn-lang-toggle"]')) return;
      ['placeholder', 'title', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v && TH.test(v)) out.push('@' + a + ': ' + v.slice(0, 60)); });
    });
  });
  return out;
}, sel);
const noHScroll = (pg, modalSel) => pg.evaluate(sel => {
  const m = sel ? document.querySelector(sel) : null;
  return (!m || m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= window.innerWidth + 1;
}, modalSel || null);
const onTop = (pg, sel) => pg.evaluate(sel => {
  const el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length); if (!el) return false;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return (hit === el || el.contains(hit)) && r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5;
}, sel);
// ปุ่มภาษาที่มองเห็นในขนาดจอนี้ (แถบข้าง หรือ หัวจอมือถือ)
const langBtn = pg => pg.evaluate(() => ['#btn-lang-toggle-side', '#btn-lang-toggle-mobile', '#btn-lang-toggle-pos']
  .find(s => { const e = document.querySelector(s); return e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'; }) || null);
// ข้อความของจุดที่แปลได้ทั้งหมด (ใช้เทียบว่ากลับเป็นไทยแล้วตรงเดิม)
const i18nSnapshot = pg => pg.evaluate(() => [...document.querySelectorAll('[data-i18n],[data-i18n-attr]')].map(el =>
  (el.hasAttribute('data-i18n') ? [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('|') : '') + '§' +
  (el.getAttribute('data-i18n-attr') || '').split(',').filter(Boolean).map(a => el.getAttribute(a.trim()) || '').join('|')));
// ข้อความแจ้งเตือนลอยมุมบน (เช่น "ยินดีต้อนรับ") บังปุ่มชั่วคราว — ปิดก่อนวัดว่าปุ่มกดถึง
const clearToasts = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); if (c) c.innerHTML = ''; });

async function newShop(b, holder, viewport) {
  const c = await b.newContext({ viewport, hasTouch: true });
  await c.route('https://script.google.com/**', async route => {
    const body = route.request().postData() || '';
    const out = holder.gas.ctx.doPost({ postData: { contents: body } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: String(out) });
  });
  await c.route(u => !new RegExp('^http://localhost:' + PORT + '/').test(String(u)) && !/^https:\/\/script\.google\.com\//.test(String(u)), r => r.abort());
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !EXPECTED_CONSOLE.test(m.text())) errors.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:' + PORT + '/index.html', { waitUntil:'networkidle' });
  await ready(p);
  return { c, p, errors };
}
// ข้อมูลร้านตั้งชื่อเป็นภาษาอังกฤษทั้งหมด — ไทยที่เหลือบนจอตอนเลือก EN จึงเป็น "ข้อความของแอปที่ลืมแปล" เท่านั้น
async function seedShop(p, gas) {
  await p.evaluate(async ({ url, token }) => {
    try { localStorage.removeItem('epos_login_guard'); localStorage.removeItem('pos_ui_lang_by_user'); } catch (e) {}
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id:'st-1', name:'Mint', role:'Therapist', active:true, accessLevel:'staff', pin: await app.hashPin('1111') },
      { id:'mg-1', name:'Ploy', role:'Manager', active:true, accessLevel:'manager', pin: await app.hashPin('222222') }];
    app.state.services = [
      { id:'s1', name:'Thai massage', price:1000, duration:60, category:'massage', commission:10, commissionType:'percent' },
      { id:'p1', name:'Water', price:20, duration:0, category:'drinks', commission:0, commissionType:'percent', type:'product' }];
    app.state.categories = [{ id:'massage', name:'Massage', icon:'fa-spa', vat:false }, { id:'drinks', name:'Drinks', icon:'fa-mug-hot', vat:true }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = []; app.state.customers = [];
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = true; app.vatRate = 7; app.shopPromptPayId = '0812345678';
    app.googleSheetsUrl = url; app.googleSheetsApiToken = token;
    await app.saveState();
    await app.saveKeys([{ key: 'googleSheetsUrl', value: url }, { key: 'googleSheetsApiToken', value: token }]);
  }, { url: SHEETS_URL, token: gas.token });
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
}
async function login(p, uid, pin) {
  await p.evaluate(() => { if (app.currentRole && app.logout) app.logout(); });
  await settle(p, 300);
  if (!(await p.evaluate(() => document.getElementById('modal-login').classList.contains('active')))) {
    await p.evaluate(() => app.requireLogin()); await settle(p, 300);
  }
  await p.click(`#login-user-list .login-user-btn[data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await settle(p, 600);
}
const monthBills = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => {
  const g = gas.sheet(n)._grid, head = g[0].map(h => String(h).trim());
  return g.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
});
const NAV = '.sidebar .nav-menu, .bottom-nav';

(async () => {
  await new Promise(r=>srv.listen(PORT,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const sizes = [['iPad แนวนอน', { width: 1180, height: 820 }], ['iPad แนวตั้ง', { width: 820, height: 1180 }],
                 ['มือถือ', { width: 390, height: 844 }], ['มือถือจอเล็ก', { width: 360, height: 740 }]];
  for (const [label, vp] of sizes) {
    const gas = createGasEnv(), holder = { gas };
    const A = await newShop(b, holder, vp), p = A.p;
    await seedShop(p, gas);
    const thaiSnap = await i18nSnapshot(p);   // ข้อความไทยตั้งต้นของทุกจุดที่แปลได้
    await login(p, 'st-1', '1111');
    t(`(${label}) พนักงานล็อกอินได้ · เริ่มที่หน้าขาย · ภาษาไทย`, await p.evaluate(() => app.currentRole === 'staff' && app.state.activeScreen === 'pos' && app.uiLang === 'th'));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[A/${label}] กดปุ่มภาษา → 4 หน้าเป็นภาษาอังกฤษ`);
    await clearToasts(p);
    const btn = await langBtn(p);
    t(`(${label}) มีปุ่มภาษาให้เห็นบนจอ และกดถึง (ไม่โดนอะไรบัง)`, !!btn && await onTop(p, btn), btn);
    if (!btn) { await A.c.close(); continue; }
    t(`(${label}) ปุ่มภาษาตอนเป็นไทยบอก "EN/English"`, /EN|English/.test(await p.innerText(btn)));
    await p.click(btn); await settle(p, 400);
    t(`(${label}) กดแล้วเป็นภาษาอังกฤษ · ปุ่มเปลี่ยนเป็น "ไทย"`, await p.evaluate(() => app.uiLang === 'en') && /ไทย/.test(await p.innerText(btn)));
    const navLeft = await thaiLeft(p, NAV);
    t(`(${label}) เมนูนำทางไม่มีภาษาไทยเหลือ`, navLeft.length === 0, navLeft);
    t(`(${label}) หน้าขาย: หัวข้อ "Sales / Checkout"`, (await p.innerText('#screen-pos .screen-title h1')).trim() === 'Sales / Checkout');
    // ใส่บริการลงตะกร้าด้วยการกดการ์ดจริง แล้วเลือกผู้ให้บริการ
    await p.click('#services-grid .service-card');
    await settle(p, 300);
    await p.evaluate(() => { const s = document.querySelector('#cart-items-list select'); if (s) { s.value = 'st-1'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
    await settle(p, 300);
    t(`(${label}) ใส่ตะกร้าแล้ว ผู้ให้บริการถูกเลือก`, await p.evaluate(() => app.state.cart.length === 1 && app.state.cart[0].staffId === 'st-1'));
    const posLeft = await thaiLeft(p, '#screen-pos');
    t(`(${label}) หน้าขาย + ตะกร้า ไม่มีภาษาไทยเหลือ`, posLeft.length === 0, posLeft);
    t(`(${label}) หน้าขาย EN ไม่ล้นจอแนวนอน`, await noHScroll(p));
    await shot(p, `i18n-pos-${label}`);

    // หน้าชำระเงิน — ทุกช่องทาง
    await p.evaluate(() => app.openCheckoutModal());
    await p.waitForSelector('#modal-payment.active', { timeout: 5000 });
    t(`(${label}) หน้าชำระเงิน: หัวข้อ "Payment"`, (await p.innerText('#modal-payment .modal-title')).trim() === 'Payment');
    for (const [m, sel] of [['credit', '#pay-credit-btn'], ['split', '#pay-split-btn'], ['promptpay', '#pay-qr-btn'], ['cash', '#pay-cash-btn']]) {
      await p.click(sel); await settle(p, 300);
      const left = await thaiLeft(p, '#modal-payment .modal-card');
      t(`(${label}) หน้าชำระเงิน [${m}] ไม่มีภาษาไทยเหลือ · ไม่ล้นจอ`, left.length === 0 && await noHScroll(p, '#modal-payment .modal-card'), { left });
      await shot(p, `i18n-pay-${m}-${label}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[B/${label}] ขายเงินสดตอนเป็น EN → ใบเสร็จ/ข้อมูล/ชีต เป็นไทย`);
    // พิมพ์รับเงินไม่ครบ → ช่องเงินทอนต้องบอกเป็นภาษาอังกฤษ (ป้ายสถานะที่ขึ้นทุกครั้งที่พิมพ์เงิน)
    await p.fill('#cash-received', '500'); await settle(p, 200);
    t(`(${label}) พิมพ์รับ 500 ของบิล 1,000 → "Not enough cash" · ปุ่มยืนยันกดไม่ได้`, (await p.innerText('#cash-change')).trim() === 'Not enough cash' &&
      await p.evaluate(() => document.getElementById('btn-complete-checkout').disabled), await p.innerText('#cash-change'));
    await p.click('#modal-payment .quick-cash-btn.exact'); await settle(p, 200);
    t(`(${label}) ปุ่ม "Exact" ใส่ยอดพอดี · ปุ่มยืนยันกดถึง`, !(await p.evaluate(() => document.getElementById('btn-complete-checkout').disabled)) && await onTop(p, '#btn-complete-checkout'));
    await p.click('#btn-complete-checkout');
    await p.waitForSelector('#modal-receipt.active', { timeout: 6000 });
    const receipt = await p.innerText('#thermal-receipt-preview');
    t(`(${label}) ใบเสร็จยังเป็นภาษาไทย (ไม่แปล)`, /รวมทั้งสิ้น/.test(receipt) && /เงินสด/.test(receipt) && !/Walk-in customer|Total due/.test(receipt), receipt);
    await p.evaluate(async () => { await app.syncPendingTransactions(true); }); await settle(p, 600);
    const tx = await p.evaluate(async () => { const x = (await db.state.get('transactions')).value.at(-1); return { c: x.customerName, m: x.paymentMethod, sync: x.syncStatus }; });
    t(`(${label}) บิลใน IndexedDB: ลูกค้า "ลูกค้าทั่วไป (Walk-in)" · ช่องทาง cash · ส่งขึ้นชีตแล้ว`, tx.c === 'ลูกค้าทั่วไป (Walk-in)' && tx.m === 'cash' && tx.sync === 'synced', tx);
    const rows = monthBills(gas);
    t(`(${label}) แถวบนชีต: ช่องทาง "เงินสด" · ไม่มีคำอังกฤษจากหน้าจอหลุดขึ้นไป`, rows.length === 1 && rows[0]['ช่องทางชำระเงิน'] === 'เงินสด' &&
      !/Walk-in customer|Cash\b|Staff:/.test(JSON.stringify(rows)), rows);
    await p.evaluate(() => app.closeModal('modal-receipt')); await settle(p, 300);

    // คิว
    await p.evaluate(() => app.switchTab('queue')); await settle(p, 300);
    const qLeft = await thaiLeft(p, '#screen-queue');
    t(`(${label}) หน้าคิว (มีคิวจากบิลที่ขาย) ไม่มีภาษาไทยเหลือ · ไม่ล้นจอ`, await p.evaluate(() => app.state.queue.length >= 1) && qLeft.length === 0 && await noHScroll(p), qLeft);
    t(`(${label}) การ์ดคิว: ชื่อลูกค้าแสดง "Walk-in customer" · ปุ่ม "Start"`, /Walk-in customer/.test(await p.innerText('#queue-waiting-list')) && /Start/.test(await p.innerText('#queue-waiting-list')));
    await shot(p, `i18n-queue-${label}`);

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[C/${label}] จำแยกตามบัญชี`);
    await p.reload({ waitUntil: 'networkidle' }); await ready(p); await settle(p, 800);
    t(`(${label}) รีโหลด (กู้เซสชัน) → ยังเป็นพนักงานคนเดิม และยังเป็น EN`, await p.evaluate(() => app.currentUser && app.currentUser.id === 'st-1' && app.uiLang === 'en') &&
      (await thaiLeft(p, NAV)).length === 0);
    await login(p, 'mg-1', '222222');
    t(`(${label}) ผู้จัดการล็อกอินต่อ → ภาษาไทย (เมนู/หน้าขายเป็นไทย)`, await p.evaluate(() => app.uiLang === 'th') &&
      (await p.innerText('#screen-pos .screen-title h1')).trim() === 'หน้าขาย / ชำระเงิน');
    await login(p, 'st-1', '1111');
    t(`(${label}) พนักงานคนเดิมกลับมา → EN อัตโนมัติ`, await p.evaluate(() => app.uiLang === 'en') && (await p.innerText('#screen-pos .screen-title h1')).trim() === 'Sales / Checkout');
    t(`(${label}) ค่าภาษาอยู่ใน localStorage เท่านั้น — ไม่มีใน IndexedDB`, await p.evaluate(async () =>
      JSON.parse(localStorage.getItem('pos_ui_lang_by_user')).hasOwnProperty('st-1') && !(await db.state.toArray()).some(r => /lang/i.test(r.key))));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[D/${label}] กลับเป็นไทย → ตรงตามเดิม`);
    await clearToasts(p); await p.click(await langBtn(p)); await settle(p, 400);
    const backSnap = await i18nSnapshot(p);
    const diff = thaiSnap.map((x, i) => x === backSnap[i] ? null : [x, backSnap[i]]).filter(Boolean);
    t(`(${label}) ทุกจุดที่แปลได้คืนเป็นข้อความไทยเดิมทุกตัวอักษร`, thaiSnap.length > 40 && thaiSnap.length === backSnap.length && diff.length === 0, diff.slice(0, 5));
    t(`(${label}) ไม่มี JavaScript error ตลอดชุด`, A.errors.length === 0, A.errors);
    await A.c.close();
  }

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[E] เจ้าของบนจอเตี้ย (แถบข้าง) — ปุ่มธีม/ภาษาแถวเดียว เมนูล่างสุดไม่ตกขอบ');
  for (const vp of [{ width: 1024, height: 600 }, { width: 1180, height: 820 }, { width: 1366, height: 768 }]) {
    const gas = createGasEnv(), holder = { gas };
    const A = await newShop(b, holder, vp), p = A.p;
    await seedShop(p, gas);
    await login(p, '__owner__', '246810');
    const geo = await p.evaluate(() => {
      const th = document.getElementById('btn-theme-toggle-side').getBoundingClientRect();
      const la = document.getElementById('btn-lang-toggle-side').getBoundingClientRect();
      const items = [...document.querySelectorAll('.sidebar .nav-item')].filter(e => e.getClientRects().length);
      const last = items.at(-1).getBoundingClientRect();
      return { sameRow: Math.abs(th.top - la.top) < 2, lastBottom: last.bottom, h: innerHeight, n: items.length };
    });
    t(`(${vp.width}x${vp.height}) ปุ่มธีมกับปุ่มภาษาอยู่แถวเดียวกัน`, geo.sameRow, geo);
    for (const [L, theme] of [['th', 'dark'], ['en', 'dark'], ['th', 'light'], ['en', 'light']]) {
      if ((await p.evaluate(() => app.uiLang)) !== L) { await clearToasts(p); await p.click('#btn-lang-toggle-side'); await settle(p, 300); }
      await p.evaluate(t => { app.theme = t; app.applyTheme(); }, theme); await settle(p, 100);
      const g = await p.evaluate(() => { const items = [...document.querySelectorAll('.sidebar .nav-item')].filter(e => e.getClientRects().length);
        const r = items.at(-1).getBoundingClientRect(); const s = document.querySelector('.side-toggle-row');
        // ล้น = ความกว้างตามข้อความจริง (ไม่ถูกบีบ) มากกว่าความกว้างที่ได้ — scrollWidth ของปุ่มที่ overflow:hidden เชื่อไม่ได้
        const over = [...s.querySelectorAll('button')].some(b => { const cl = b.cloneNode(true); cl.removeAttribute('id');
          cl.style.cssText = 'position:absolute;visibility:hidden;flex:none;width:auto'; s.appendChild(cl);
          const need = cl.getBoundingClientRect().width; cl.remove(); return need > b.getBoundingClientRect().width + 0.5; });
        return { bottom: r.bottom, h: innerHeight, n: items.length, over }; });
      t(`(${vp.width}x${vp.height}/${L}/${theme}) เมนูครบ 6 ข้อ · ข้อสุดท้ายอยู่ในจอ · ข้อความในปุ่มไม่ล้น`, g.n === 6 && g.bottom <= g.h && !g.over, g);
      await shot(p, `i18n-sidebar-${vp.width}x${vp.height}-${L}-${theme}`);
    }
    t(`(${vp.width}x${vp.height}) ไม่มี JavaScript error`, A.errors.length === 0, A.errors);
    await A.c.close();
  }

  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
