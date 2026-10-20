// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) บนเบราว์เซอร์จริง (Chromium + Service Worker จริง)
//   [U1] ข้อ 22 แถบ "อัปเดตเลย" ระหว่างนับเงินปิดกะ → ไม่รีโหลด · บอก "ปิดหน้าต่างที่เปิดอยู่ก่อน…" · ตัวเลขที่พิมพ์ยังอยู่
//        ปิดหน้าต่างแล้วกดใหม่ → อัปเดตได้จริง
//   [U2] ข้อ 63 ครั้งแรกหลังติดตั้งแอป (ยังไม่มี SW ตัวเดิมตอนเปิดหน้า) กด "อัปเดตเลย" → รีโหลดจริง (เดิมกดแล้วเงียบ)
//   [E]  ข้อ 61 งาน async ที่ล้มโดยไม่มีใครดัก → ขึ้นข้อความภาษาไทย
//   [T]  ข้อ 44 ปุ่มเล็กบน iPad (จอสัมผัส) ≥ 44px · [A] ข้อ 66 ป้ายชื่อช่องกรอก · [C] ข้อ 43 สีธีมสว่าง/ข้อความแจ้งเตือนทึบ
//
//   node tests/e2e_fix_20261020_appB.js   (พอร์ตตายตัว — รันผ่าน isorun เมื่อมีงานอื่นรันพร้อมกัน)
// ─────────────────────────────────────────────────────────────────────────────
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 8193;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' };
let ver = 1;
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const srv = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
  if (f === '/sw.js') {
    s.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return s.end(SW_SRC.replace(/jahn-pos-v[\w-]+/, 'jahn-pos-vAPPB' + ver));
  }
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(''); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
});

let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const toastText = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); return c ? c.innerText : ''; });
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = s => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

async function seedShop(p) {
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('654321');
    app.state.staff = [{ id: 'st-1', name: 'สมชาย', role: 'ช่าง', accessLevel: 'staff', pin: await app.hashPin('222222') }];
    app.state.services = [{ id: 's1', name: 'ตัดผมชาย', price: 350, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }];
    app.state.categories = [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active: true, startTime: Date.now() - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] };
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    await app.saveState();
  });
}
const loginOwner = p => p.evaluate(() => {
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
  app.updateUserRoleUI && app.updateUserRoleUI();
});
const cacheName = p => p.evaluate(() => new Promise(res => {
  if (!navigator.serviceWorker.controller) return res(null);
  const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data.cacheName);
  navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]); setTimeout(() => res('?'), 1500);
}));

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const errors = [];

  // ═══ [U1] ข้อ 22 ═══════════════════════════════════════════════════════
  console.log('\n[U1] แถบอัปเดตระหว่างนับเงินปิดกะ');
  {
    ver = 1;
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e.message)));
    await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await ready(p);
    await seedShop(p);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await p.reload({ waitUntil: 'networkidle' }); await ready(p);   // iPad ร้านปกติ: เปิดแอปมาแล้วมี SW คุมอยู่
    await loginOwner(p);
    ver = 2;
    await p.evaluate(async () => { (await navigator.serviceWorker.getRegistration()).update(); });
    await p.waitForFunction(() => !!document.getElementById('app-update-bar'), null, { timeout: 30000, polling: 300 });
    await p.evaluate(() => { app.state.cart = []; app.openCashCounter('close'); window.__alive = 1; });
    await p.waitForTimeout(300);
    await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '7');
    await p.evaluate(() => app.updateCashSum());
    t('หน้าต่างนับเงินเปิดอยู่ → canApplyAppUpdate() = false', (await p.evaluate(() => app.canApplyAppUpdate())) === false);
    await p.click('#app-update-bar button');
    await p.waitForTimeout(2500);
    const kept = await p.evaluate(() => ({ alive: window.__alive === 1,
      v: document.querySelector('#form-cash-counter .cash-qty-input[data-denom="1000"]').value,
      open: document.getElementById('modal-cash-counter').classList.contains('active') }));
    t('กดอัปเดตตอนหน้าต่างเปิด → ไม่รีโหลด · ตัวเลขที่พิมพ์ยังอยู่ · หน้าต่างยังเปิด', kept.alive && kept.v === '7' && kept.open, kept);
    t('บอกให้ปิดหน้าต่างก่อน: "ปิดหน้าต่างที่เปิดอยู่ก่อน แล้วค่อยกดอัปเดต"', /ปิดหน้าต่างที่เปิดอยู่ก่อน แล้วค่อยกดอัปเดต/.test(await toastText(p)), await toastText(p));
    await p.evaluate(() => app.closeModal('modal-cash-counter'));
    await p.waitForTimeout(300);
    await Promise.all([p.waitForNavigation({ timeout: 20000 }).catch(() => null), p.click('#app-update-bar button')]);
    await ready(p);
    t('ปิดหน้าต่างแล้วกดใหม่ → อัปเดตเป็นรุ่นใหม่จริง', (await p.evaluate(() => window.__alive !== 1)) && (await cacheName(p)) === 'jahn-pos-vAPPB2', await cacheName(p));
    await ctx.close();
  }

  // ═══ [U2] ข้อ 63 ═══════════════════════════════════════════════════════
  console.log('\n[U2] ครั้งแรกหลังติดตั้งแอป กด "อัปเดตเลย"');
  {
    ver = 10;
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e.message)));
    await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await ready(p);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await p.evaluate(() => { window.__alive = 2; });
    ver = 11;
    await p.evaluate(async () => { (await navigator.serviceWorker.getRegistration()).update(); });
    await p.waitForFunction(() => !!document.getElementById('app-update-bar'), null, { timeout: 30000, polling: 300 });
    const loginOpen = await p.evaluate(() => document.getElementById('modal-login').classList.contains('active'));
    await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => null), p.click('#app-update-bar button')]);
    await p.waitForTimeout(800);
    await ready(p);
    const reloaded = await p.evaluate(() => window.__alive !== 2);
    t('รอบแรกหลังติดตั้ง (หน้าล็อกอินเปิดอยู่' + (loginOpen ? '' : ' ?') + ') กดอัปเดต → รีโหลดเป็นรุ่นใหม่ (เดิมกดแล้วเงียบ)',
      reloaded && (await cacheName(p)) === 'jahn-pos-vAPPB11', { reloaded, cache: await cacheName(p) });
    await ctx.close();
  }

  // ═══ [E] [A] [C] [T] ═══════════════════════════════════════════════════
  for (const [w, h] of [[1024, 768], [768, 1024]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e.message)));
    await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await ready(p);
    await seedShop(p);
    await loginOwner(p);
    await p.evaluate(() => app.switchTab('pos'));
    await p.waitForTimeout(300);
    console.log(`\n[T] ${w}x${h} ปุ่มเล็กบนจอสัมผัส`);
    const sizes = await p.evaluate(() => ['#btn-lock-sidebar', '#btn-theme-toggle-mobile', '#btn-add-customer-quick', '#sidebar-sync-status', '#mobile-sync-status']
      // ขนาดตามเลย์เอาต์ (offsetWidth/Height) — ไม่ใช่ขนาดระหว่างแอนิเมชันเปิดหน้าจอ (transform: scale) ที่อาจยังไม่จบ
      .map(sel => { const e = document.querySelector(sel); const vis = e && e.getClientRects().length > 0;
        return { sel, w: vis ? e.offsetWidth : 0, h: vis ? e.offsetHeight : 0 }; }).filter(x => x.w > 0 && x.h > 0));
    sizes.forEach(x => t(`${x.sel} อย่างน้อย 44×44 (ได้ ${x.w}×${x.h})`, x.w >= 44 && x.h >= 44, x));
    if (w === 1024) {
      console.log('\n[E] งาน async ที่ล้มโดยไม่มีใครดัก');
      await p.evaluate(() => { const c = document.getElementById('toast-container'); if (c) c.innerHTML = ''; Promise.reject(new Error('boom')); });
      await p.waitForTimeout(500);
      t('ขึ้นข้อความภาษาไทยให้ลองใหม่ (ไม่ใช่เงียบ)', /มีงานบางอย่างทำไม่สำเร็จ/.test(await toastText(p)), await toastText(p));

      console.log('\n[A] ป้ายชื่อช่องกรอก');
      const a11y = await p.evaluate(() => ({
        cust: document.getElementById('cart-customer-select').getAttribute('aria-label'),
        disc: document.getElementById('cart-discount').getAttribute('aria-label'),
        qty: [...document.querySelectorAll('.cash-qty-input')].every(i => (i.getAttribute('aria-label') || '').includes(i.getAttribute('data-denom'))),
        labels: ['shop-name-input', 'vat-rate', 'shop-telegram-token', 'staff-pin', 'serv-price', 'cust-name'].every(id => document.getElementById(id).labels.length > 0),
        pin: ['autocomplete', 'autocapitalize', 'autocorrect'].every(k => document.getElementById('prompt-modal-input').getAttribute(k) === 'off')
      }));
      t('ตะกร้า: ช่องลูกค้า/ส่วนลดมีชื่อ · ช่องนับธนบัตรทุกช่องมีชื่อตามชนิด · label ผูกกับช่องในฟอร์ม · ช่อง PIN ปิดการจำค่า',
        a11y.cust && a11y.disc && a11y.qty && a11y.labels && a11y.pin, a11y);
      await p.evaluate(() => { app.state.cart = [{ uniqueCartId: 'c1', id: 's1', name: 'ตัดผมชาย', price: 350, category: 'barber', staffId: 'st-1', staffName: 'สมชาย' }]; app.renderCart(); });
      t('ตะกร้า: ช่องเลือกผู้ให้บริการมีชื่อ (aria-label)', /ตัดผมชาย/.test(await p.evaluate(() => document.querySelector('.cart-item-staff select').getAttribute('aria-label') || '')));

      console.log('\n[C] ธีมสว่าง: กล่องตัวเลขปิดกะ / ข้อความแจ้งเตือนทับหน้าต่าง');
      await p.evaluate(() => { app.theme = 'light'; app.applyTheme(); app.state.cart = []; app.openCashCounter('close'); });
      await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '0');
      await p.evaluate(() => app.updateCashSum());
      await p.waitForTimeout(200);
      const c1 = await p.evaluate(() => {
        const cs = id => getComputedStyle(document.getElementById(id));
        return { panel: cs('cash-drawer-closing-summary').backgroundColor, sales: cs('closing-expected-sales').color,
          box: cs('closing-diff-box').backgroundColor, diff: cs('closing-diff-amount').color, boxCls: document.getElementById('closing-diff-box').className };
      });
      t('กล่องตัวเลขปิดกะ: พื้นสว่างทึบ ตัวเลขเงินสดอ่านได้ ≥ 4.5:1', ratio(rgb(c1.sales), rgb(c1.panel)) >= 4.5 && !/rgba\(.*, 0\.\d+\)/.test(c1.panel), c1);
      t('กล่องผลต่าง (เงินขาด): ≥ 4.5:1', /diff-short/.test(c1.boxCls) && ratio(rgb(c1.diff), rgb(c1.box)) >= 4.5, { c1, r: ratio(rgb(c1.diff), rgb(c1.box)) });
      await p.evaluate(() => app.showToast('เงินขาด/เกิน — กรอกหมายเหตุปิดกะก่อน', 'warning', 60000));
      const c2 = await p.evaluate(() => { const el = document.querySelector('#toast-container > div:last-child');
        const cs = getComputedStyle(el); return { cls: el.className, bg: cs.backgroundColor, img: cs.backgroundImage, fg: getComputedStyle(el.querySelector('span:nth-child(2)')).color }; });
      t('ข้อความแจ้งเตือนทับหน้าต่าง: พื้นทึบตามธีม อ่านได้ ≥ 4.5:1', /pos-toast/.test(c2.cls) && !/rgba/.test(c2.bg) && ratio(rgb(c2.fg), rgb(c2.bg)) >= 4.5, c2);
    }
    await ctx.close();
  }

  // "boom" = งานที่จงใจให้ล้มใน [E] (เบราว์เซอร์ยังรายงานเหมือนเดิม — ตัวดักไม่กลืน error)
  const realErrors = errors.filter(e => e !== 'boom');
  t('ไม่มี JavaScript error ตลอดชุด (นอกจากที่จงใจให้ล้มใน [E])', realErrors.length === 0, realErrors);
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); try { srv.close(); } catch (x) {} process.exit(1); });
