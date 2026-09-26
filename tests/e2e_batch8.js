// ชุด 8 บนเบราว์เซอร์จริง (Chromium + Service Worker จริง)
//   [Q] QR พร้อมเพย์ที่วาดบน canvas ในหน้าชำระเงินจริง → ถอดรหัสจากพิกเซลได้ด้วย jsQR และได้ข้อความพร้อมเพย์ตรงยอด
//   [S1] รุ่นใหม่ที่ "กำลังติดตั้งอยู่" ตอนเปิดแอป → ติดตั้งเสร็จแล้วต้องขึ้นแถบอัปเดต (เดิมเงียบจนเปิดแอปรอบถัดไป)
//   [S2] แถบอัปเดตเปิดค้าง แล้วมีรุ่นใหม่กว่าออกมาอีก → กด "อัปเดตเลย" ต้องได้รุ่นล่าสุดจริง (เดิมกดแล้วเงียบ)
//   [K] ลบพนักงานที่ผูกกับรายการในตะกร้า → ตะกร้าขึ้น "เลือกผู้ให้บริการใหม่" และเลือกคนใหม่ได้
//
//   node tests/e2e_batch8.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 8128;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
// sw.js ถูกเสิร์ฟพร้อมเลขรุ่นที่เทสต์คุม (จำลองการ deploy รุ่นใหม่) · ฟอนต์ตัวหนึ่งหน่วงได้ (จำลองติดตั้งช้า)
let ver = 1, slowFontMs = 0;
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const srv = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
  if (f === '/sw.js') {
    s.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return s.end(SW_SRC.replace(/jahn-pos-v[\w-]+/, 'jahn-pos-vTEST' + ver));
  }
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(''); }
  const send = () => { s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); };
  if (slowFontMs && /outfit-latin-900-normal\.woff2$/.test(f)) return setTimeout(send, slowFontMs);
  send();
});

let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const swState = pg => pg.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const c = await new Promise(res => { if (!navigator.serviceWorker.controller) return res(null);
    const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data.cacheName);
    navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]); setTimeout(() => res('?'), 1500); });
  return { cache: c, installing: !!(reg && reg.installing), waiting: !!(reg && reg.waiting), banner: !!document.getElementById('app-update-bar') };
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await ready(p);

  // ── ร้านตั้งต้น ──
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('654321');
    app.state.staff = [
      { id: 'st-1', name: 'สมชาย', role: 'ช่าง', active: true, accessLevel: 'staff', pin: await app.hashPin('222222') },
      { id: 'st-2', name: 'สมหญิง', role: 'ช่าง', active: true, accessLevel: 'staff', pin: await app.hashPin('333333') }];
    app.state.services = [{ id: 's1', name: 'ตัดผมชาย', price: 350, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }];
    app.state.categories = [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active: true, startTime: Date.now() - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] };
    app.shopPromptPayId = '0812345678';
    app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
    await app.saveState();
    document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
  });

  console.log('\n[Q] หน้าชำระเงินจริง เลือก QR → ถอดรหัสจากพิกเซลบน canvas');
  await p.addScriptTag({ path: path.join(__dirname, 'vendor', 'jsqr.js') });
  await p.evaluate(() => {
    app.state.cart = [{ uniqueCartId: 'c1', id: 's1', name: 'ตัดผมชาย', price: 350, category: 'barber', staffId: 'st-1', staffName: 'สมชาย' }];
    app.renderCart(); app.openCheckoutModal(); app.selectPaymentMethod('promptpay');
  });
  await p.waitForTimeout(400);
  const qr = await p.evaluate(() => {
    const c = document.querySelector('#dynamic-qr-box canvas'); if (!c) return { err: 'no canvas' };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, c.width, c.height);
    return { data: r ? r.data : null, expect: window.PromptPayQR.buildPayload(app.shopPromptPayId, 350) };
  });
  t('อ่าน QR จาก canvas ได้ (เดิมเครื่องอ่านมาตรฐานอ่านไม่ออก)', !!qr.data, qr);
  t('ข้อความใน QR = พร้อมเพย์ของร้าน + ยอด 350', qr.data && qr.data === qr.expect, qr);
  await p.evaluate(() => { app.closeModal('modal-checkout'); app.state.cart = []; app.renderCart(); });

  console.log('\n[K] ลบพนักงานที่ผูกกับรายการในตะกร้า');
  await p.evaluate(async () => {
    app.switchTab('pos');
    app.state.cart = [{ uniqueCartId: 'c2', id: 's1', name: 'ตัดผมชาย', price: 350, category: 'barber', staffId: 'st-2', staffName: 'สมหญิง' }];
    app.renderCart();
    app.state.staff = app.state.staff.filter(s => s.id !== 'st-2'); await app.saveState();
    app.renderCart();
  });
  const sel = '#cart-items-list .cart-item-staff select';
  const k1 = await p.evaluate(s => { const e = document.querySelector(s); return e ? { v: e.value, txt: e.options[e.selectedIndex] && e.options[e.selectedIndex].textContent } : null; }, sel);
  t('ช่องผู้ให้บริการขึ้น "เลือกผู้ให้บริการใหม่" (ไม่แสร้งโชว์ชื่อคนแรก)', k1 && k1.v === '' && /เลือกผู้ให้บริการใหม่/.test(k1.txt), k1);
  await p.selectOption(sel, 'st-1');
  t('เลือกคนใหม่จากหน้าจอ → รายการผูกกับคนนั้นจริง', await p.evaluate(() => app.state.cart[0].staffId === 'st-1'));
  await p.evaluate(() => { app.state.cart = []; app.renderCart(); });

  console.log('\n[S1] รุ่นใหม่ติดตั้งช้า (ยังติดตั้งอยู่ตอนเปิดแอป) → ติดตั้งเสร็จต้องขึ้นแถบอัปเดต');
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  ver = 2; slowFontMs = 5000;
  await p.reload({ waitUntil: 'domcontentloaded' }); await ready(p);
  let s1 = null;
  for (let i = 0; i < 30; i++) { await p.waitForTimeout(500); s1 = await swState(p); if (process.env.DBG) console.log(i, JSON.stringify(s1)); if (s1.waiting && s1.banner) break; }
  t('ติดตั้งเสร็จแล้วขึ้นแถบ "มีเวอร์ชันใหม่" ทันที', s1.waiting && s1.banner, s1);
  slowFontMs = 0;

  console.log('\n[S2] แถบเปิดค้าง แล้วมีรุ่นใหม่กว่าออกมา → กดอัปเดตต้องได้รุ่นล่าสุด');
  ver = 3;
  await p.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  await p.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return r.waiting && !r.installing; }, null, { timeout: 30000, polling: 300 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__notReloaded = true; });
  await p.click('#app-update-bar button');
  await p.waitForTimeout(4000); await ready(p);
  const reloaded = await p.evaluate(() => window.__notReloaded !== true);
  const s2 = await swState(p);
  t('กดแล้วแอปรีโหลดจริง (เดิมค้าง "กำลังอัปเดต..." ตลอด)', reloaded, s2);
  t('ใช้รุ่นล่าสุด (vTEST3) ไม่ใช่รุ่นที่ถูกทิ้ง', s2.cache === 'jahn-pos-vTEST3', s2);
  t('ข้อมูลร้านยังอยู่หลังอัปเดต', await p.evaluate(() => app.state.staff.length === 1 && app.shopPromptPayId === '0812345678'));

  t('ไม่มี error ในหน้าเว็บ', errors.length === 0, errors);
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
