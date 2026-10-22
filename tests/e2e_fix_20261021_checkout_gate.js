// แก้ตามผลตรวจซ้ำ 20–21 ต.ค. 2569 (F01) — เบราว์เซอร์จริง สองหน้าต่าง
//   1) หน้าต่างอ่านอย่างเดียวกด "ไปที่หน้าชำระเงิน" → ไม่เปิดหน้าชำระเงิน ไม่มี QR · บอกเหตุ · ตะกร้ายังอยู่ · ไม่มีบิลเพิ่ม
//   2) หน้าต่างหลักยังเปิดหน้าชำระเงินและขายเงินสดได้
//   4) R1 (Codex 21 ต.ค.): ร้านที่ต่อชีตแล้วแต่เครื่องยังไม่เคยยืนยันเครื่องหลัก — กดปุ่มจริงแล้วหน้ารับเงินต้องยังไม่เปิดระหว่างยืนยัน
//      เซิร์ฟเวอร์ตอบว่าเป็นเครื่องรอง → ไม่เปิดเลย · ตอบว่าเป็นเครื่องหลัก → เปิดหลังยืนยัน (จำลองคำตอบชีตในหน้า ไม่ออกเน็ต)
//   3) แถบแดงอ่านอย่างเดียวต้องไม่บังปุ่มท้ายกล่อง (เดิม iPad แนวนอน: เลื่อนกล่องสุดแล้วปุ่มยืนยันยังอยู่ใต้แถบ)
//      วัดที่ 5 ขนาดจอ · หน้าชำระเงิน (เปิดด้วย openModal ตรง ๆ เพื่อวัดเลย์เอาต์อย่างเดียว) + หน้าล็อกอิน
//      ตัดสินด้วย elementFromPoint ที่จุดกลางปุ่มหลังเลื่อนกล่องจนสุด — ต้องเป็นตัวปุ่ม ไม่ใช่แถบแดง
//
//   node tests/e2e_fix_20261021_checkout_gate.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+JSON.stringify(x).slice(0,300):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const PORT = 8131, URL = `http://localhost:${PORT}/index.html`;
const OWNER_PIN = '246810';
const dbBills = pg => pg.evaluate(() => new Promise(res => {
  const r = indexedDB.open('EroticaPosDatabase');
  r.onsuccess = e => { const q = e.target.result.transaction('state','readonly').objectStore('state').get('transactions');
    q.onsuccess = () => res(q.result && Array.isArray(q.result.value) ? q.result.value.length : -1); };
  r.onerror = () => res(-2);
}));
const modalActive = (pg, id) => pg.evaluate(i => { const e = document.getElementById(i); return !!(e && e.classList.contains('active')); }, id);
async function login(pg) {
  await pg.waitForSelector('#login-user-list .login-user-btn[data-uid="__owner__"]', { timeout: 10000 });
  await pg.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await pg.fill('#login-pin-input', OWNER_PIN);
  await pg.click('#modal-login button.primary');
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { try { app.closeModal('modal-cash-counter'); } catch (e) {} });
}
async function addToCart(pg) {
  await pg.evaluate(() => app.switchTab('pos')); await pg.waitForTimeout(300);
  await pg.click('#services-grid .service-card >> nth=0'); await pg.waitForTimeout(200);
  const sel = pg.locator('#cart-items-list .cart-item-staff select').last();
  if (await sel.count()) { await sel.selectOption({ index: 1 }).catch(() => sel.selectOption({ index: 0 })); await pg.waitForTimeout(200); }
}
// เลื่อนกล่องจนสุด แล้วดูว่าจุดกลางปุ่มเป็นตัวปุ่มเอง (ไม่ใช่แถบแดงที่ลอยทับ)
const footerHit = (pg, modalId, btnSel) => pg.evaluate(({ modalId, btnSel }) => {
  const card = document.querySelector(`#${modalId} .modal-card`);
  if (card) card.scrollTop = card.scrollHeight;
  const ov = document.getElementById(modalId); if (ov) ov.scrollTop = ov.scrollHeight;
  const btn = document.querySelector(btnSel), ban = document.getElementById('read-only-window-banner');
  if (!btn || !ban) return { error: 'ไม่พบปุ่มหรือแถบ', btn: !!btn, ban: !!ban };
  const r = btn.getBoundingClientRect(), b = ban.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { onButton: !!(hit && (hit === btn || btn.contains(hit))), onBanner: !!(hit && ban.contains(hit)),
    button: [Math.round(r.top), Math.round(r.bottom)], banner: [Math.round(b.top), Math.round(b.bottom)], vh: innerHeight };
}, { modalId, btnSel });

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  console.log('\n── ตั้งร้าน (หน้าต่าง A)');
  const A = await ctx.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' }); await ready(A); await A.waitForTimeout(500);
  await A.evaluate(async (pin) => {
    app.ownerPin = await app.hashPin(pin);
    app.state.staff = [{ id: 'st-1', name: 'ช่างบอย', role: 'ช่าง', accessLevel: 'staff', pin: await app.hashPin('1111') }];
    app.state.transactions = []; app.state.cart = []; app.state.queue = [];
    app.state.shift = { active: true, startTime: Date.now() - 600000, startCash: 1000, startDetails: {}, expenses: [], history: [] };
    app.shopPromptPayId = '0812345678';
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    await app.saveState();
    app.currentRole = null; app.currentUser = null; app.requireLogin();
  }, OWNER_PIN);
  await login(A);
  t('A เป็นหน้าต่างหลัก', await A.evaluate(() => app.isReadOnlyWindow === false));

  console.log('\n── หน้าต่าง B (อ่านอย่างเดียว) กดไปหน้าชำระเงิน');
  const B = await ctx.newPage();
  await B.goto(URL, { waitUntil: 'networkidle' }); await ready(B); await B.waitForTimeout(800);
  t('B เป็นอ่านอย่างเดียว + มีแถบแดง', await B.evaluate(() => app.isReadOnlyWindow === true && !!document.getElementById('read-only-window-banner')));
  await login(B);
  await addToCart(B);
  const billsBefore = await dbBills(A);
  await B.evaluate(() => document.getElementById('btn-checkout').click()); await B.waitForTimeout(500);
  const bState = await B.evaluate(() => ({
    payOpen: document.getElementById('modal-payment').classList.contains('active'),
    qrShown: (() => { const p = document.getElementById('payment-qr-panel'); return !!p && getComputedStyle(p).display !== 'none'; })(),
    cart: app.state.cart.length,
    toasts: [...document.querySelectorAll('#toast-container .pos-toast')].map(x => x.innerText.replace(/\s+/g, ' '))
  }));
  t('*** B: หน้าชำระเงินไม่เปิด และไม่มี QR ***', !bState.payOpen && !bState.qrShown, bState);
  t('B: บอกเหตุว่าหน้าต่างนี้เปิดซ้ำ', bState.toasts.some(x => /เปิดซ้ำ/.test(x)), bState.toasts);
  t('B: ตะกร้ายังอยู่', bState.cart === 1, bState.cart);
  t('ไม่มีบิลเพิ่ม', (await dbBills(A)) === billsBefore, { before: billsBefore, after: await dbBills(A) });

  console.log('\n── แถบแดงต้องไม่บังปุ่มท้ายกล่อง (หน้าต่าง B)');
  for (const [w, h] of [[1180, 820], [820, 1180], [1024, 768], [768, 1024], [390, 844]]) {
    await B.setViewportSize({ width: w, height: h }); await B.waitForTimeout(400);
    // วัดเลย์เอาต์อย่างเดียว: เปิดหน้าชำระเงินตรง ๆ (ด่าน F01 ปิดทางปกติไว้แล้ว — ข้อ 1)
    // กางช่อง QR ให้กล่องสูงเท่าตอนลูกค้าสแกนจริง (เคสที่ปุ่มเคยจมใต้แถบ) — เรียกตัววาด QR ตรง ๆ ไม่ผ่าน selectPaymentMethod
    await B.evaluate(() => { app.beginCheckoutAttempt(); app.openModal('modal-payment');
      const p = document.getElementById('payment-qr-panel'); if (p) p.style.display = 'block'; app.generatePromptPayQR(); });
    await B.waitForTimeout(350);
    const pay = await footerHit(B, 'modal-payment', '#btn-complete-checkout');
    t(`${w}×${h} หน้าชำระเงิน: เลื่อนสุดแล้วปุ่มยืนยันไม่อยู่ใต้แถบแดง`, pay.onButton && !pay.onBanner, pay);
    await B.evaluate(() => app.closeModal('modal-payment')); await B.waitForTimeout(150);
    await B.evaluate(() => { app.openModal('modal-login'); }); await B.waitForTimeout(300);
    const lg = await footerHit(B, 'modal-login', '#modal-login button.primary');
    t(`${w}×${h} หน้าล็อกอิน: ปุ่มเข้าสู่ระบบไม่อยู่ใต้แถบแดง`, lg.onButton && !lg.onBanner, lg);
    await B.evaluate(() => app.closeModal('modal-login')); await B.waitForTimeout(150);
  }
  t('ตัวแปรความสูงแถบถูกตั้ง (body.ro-banner-on + --ro-banner-h)', await B.evaluate(() =>
    document.body.classList.contains('ro-banner-on') && parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ro-banner-h')) > 0));

  console.log('\n── หน้าต่างหลัก A ยังขายได้');
  await A.bringToFront();
  await addToCart(A);
  await A.evaluate(() => document.getElementById('btn-checkout').click()); await A.waitForTimeout(500);
  t('A: หน้าชำระเงินเปิด', await modalActive(A, 'modal-payment'));
  t('A: ไม่มีแถบแดง/ไม่หักพื้นที่', await A.evaluate(() => !document.getElementById('read-only-window-banner') && !document.body.classList.contains('ro-banner-on')));
  await A.click('#pay-cash-btn'); await A.waitForTimeout(200);
  const total = await A.evaluate(() => app.getCartTotal());
  await A.fill('#cash-received', String(Math.ceil(total))); await A.dispatchEvent('#cash-received', 'input'); await A.waitForTimeout(200);
  await A.click('#btn-complete-checkout'); await A.waitForTimeout(1200);
  t('A: ขายเงินสดได้ (บิลลงเครื่อง)', (await dbBills(A)) === billsBefore + 1, { after: await dbBills(A) });

  console.log('\n── ปิดหน้าต่าง A → B รับสิทธิ์ แถบหาย พื้นที่กลับปกติ');
  await A.close();
  await B.waitForFunction(() => app.isReadOnlyWindow === false, null, { timeout: 15000 }).catch(() => {});
  t('B รับสิทธิ์ · แถบหาย · ไม่หักพื้นที่', await B.evaluate(() => app.isReadOnlyWindow === false &&
    !document.getElementById('read-only-window-banner') && !document.body.classList.contains('ro-banner-on')));

  console.log('\n── R1: ต่อชีตแล้วแต่ยังไม่ยืนยันเครื่องหลัก (หน้าต่าง B ที่รับสิทธิ์แล้ว)');
  await B.setViewportSize({ width: 1180, height: 820 }); await B.waitForTimeout(200);
  // QR "เห็นได้จริง" = ถูกวาดบนจอ (getClientRects) — ช่อง QR ถูกกางค้างไว้จากส่วนวัดเลย์เอาต์ด้านบน แต่ซ่อนอยู่ในกล่องที่ปิด
  const r1State = () => B.evaluate(() => ({
    payOpen: document.getElementById('modal-payment').classList.contains('active'),
    qrShown: (() => { const p = document.getElementById('payment-qr-panel'); return !!p && getComputedStyle(p).display !== 'none' && p.getClientRects().length > 0; })(),
    cart: app.state.cart.length, primary: app.primaryStatus,
    calls: (window.__r1calls || []).slice(),
    toasts: [...document.querySelectorAll('#toast-container .pos-toast')].map(x => x.innerText.replace(/\s+/g, ' '))
  }));
  // จำลองชีต: register_primary ตอบตามโหมดหลังหน่วง 600ms · คำสั่งอื่นตอบ error (ไม่ออกเน็ตจริง)
  await B.evaluate(() => {
    window.__r1calls = []; window.__r1mode = 'secondary';
    app.cloudPost = (action) => { window.__r1calls.push(action);
      if (action !== 'register_primary') return Promise.resolve({ status: 'error', message: 'stub' });
      return new Promise(r => setTimeout(() => r(window.__r1mode === 'secondary'
        ? { status: 'error', code: 'NOT_PRIMARY_DEVICE', message: 'not primary', details: { primary: { label: 'POS-อื่น' } } }
        : { status: 'success', details: { primary: { label: 'POS-นี้', claimedAt: Date.now() } } }), 600)); };
    app.googleSheetsUrl = 'https://script.google.com/macros/s/r1-e2e-stub/exec';
    app.googleSheetsApiToken = 'r1e2e-' + 'x'.repeat(40);
    app.primaryStatus = null; app.state.cart = []; app.renderCart && app.renderCart();
  });
  t('(เงื่อนไข) ต่อชีตแล้ว + ยังไม่รู้สถานะเครื่องหลัก', await B.evaluate(() => app.hasCloudSyncConfig() && app.primaryStatus === null));
  await addToCart(B);
  await B.evaluate(() => document.getElementById('btn-checkout').click()); await B.waitForTimeout(150);
  const r1a = await r1State();
  t('*** R1 ระหว่างยืนยัน: หน้ารับเงินยังไม่เปิด ไม่มี QR ***', !r1a.payOpen && !r1a.qrShown, r1a);
  t('R1 ระหว่างยืนยัน: บอกว่ากำลังยืนยันเครื่องหลัก', r1a.toasts.some(x => /กำลังยืนยันเครื่องขายหลัก/.test(x)), r1a.toasts);
  await B.waitForTimeout(1000);
  const r1b = await r1State();
  t('*** R1 เซิร์ฟเวอร์ตอบว่าเครื่องรอง: หน้ารับเงินไม่เปิด · รู้ว่าเป็นเครื่องรอง · ตะกร้ายังอยู่ ***',
    !r1b.payOpen && !r1b.qrShown && r1b.primary && r1b.primary.isPrimary === false && r1b.cart === 1, r1b);
  t('R1 บอกเหตุว่าเป็นเครื่องรอง', r1b.toasts.some(x => /เครื่องรอง/.test(x)), r1b.toasts);
  await B.evaluate(() => { window.__r1mode = 'primary'; app.primaryStatus = null; });
  await B.evaluate(() => document.getElementById('btn-checkout').click()); await B.waitForTimeout(1000);
  const r1c = await r1State();
  t('R1 เซิร์ฟเวอร์ตอบว่าเครื่องหลัก: เปิดหน้ารับเงินหลังยืนยัน · สถานะเป็นเครื่องหลัก',
    r1c.payOpen && r1c.primary && r1c.primary.isPrimary === true, r1c);
  t('R1 เรียกยืนยันกับชีตครั้งละหนึ่งครั้ง', r1c.calls.filter(a => a === 'register_primary').length === 2, r1c.calls);

  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
