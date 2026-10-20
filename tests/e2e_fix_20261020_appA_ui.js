// ตรวจ 19 ต.ค. 2569 ข้อ 12 · 36 · 44 · 18 — เบราว์เซอร์จริง (Chromium) กดปุ่มจริงบนหน้าจอ · ข้อมูลสังเคราะห์ทั้งหมด
//   ข้อ 12: เลือกลูกค้าสมาชิก → "ล้างตะกร้า" / "สลับผู้ใช้" → บิล walk-in ถัดไปไม่ลงชื่อสมาชิก (บิล · ใบเสร็จ · จำนวนครั้ง)
//           เพิ่มลูกค้าจากหน้าลูกค้า → ไม่ถูกเลือกในตะกร้า · ปุ่มลงทะเบียนด่วนในตะกร้า → ถูกเลือก
//   ข้อ 36: ช่องค้นหาลูกค้ากรองเมื่อ "วาง/พิมพ์ด้วยการบอก" (event input — ไม่มี keyup)
//   ข้อ 44: ปุ่มเลือกอัตราค่าธรรมเนียมบัตรสูง ≥ 44px
//   ข้อ 18: ตั้งนาฬิกาเครื่องย้อนหลัง → แดชบอร์ดของผู้จัดการยังเป็นวันทำการจริง
//   node tests/e2e_fix_20261020_appA_ui.js
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
let PORT = 0;
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 240) : '')); } };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(ROOT, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function login(p, uid, pin) {
  await p.click(`#login-user-list [data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await p.waitForFunction(() => app.currentUser && !document.getElementById('modal-login').classList.contains('active'));
}
async function addHaircut(p) {
  await p.evaluate(() => app.switchTab('pos'));
  await p.click('.service-card:has-text("ตัดผมชาย")');
  for (const s of await p.$$('.cart-item-staff select')) await s.selectOption('st-1');
}
async function payCash(p) {
  await p.click('#btn-checkout');
  await p.waitForFunction(() => document.getElementById('modal-payment').classList.contains('active'));
  await p.click('#pay-cash-btn'); await p.fill('#cash-received', '300');
  await p.click('#btn-complete-checkout');
  await p.waitForFunction(() => !document.getElementById('modal-payment').classList.contains('active'));
  await p.evaluate(() => app.closeModal('modal-receipt'));
}
const lastBill = (p) => p.evaluate(() => { const tx = app.state.transactions.at(-1); return { name: tx.customerName, visit: app.state.customers.find(c => c.id === 'c-1').visitCount }; });

(async () => {
  await new Promise(r => server.listen(0, r));
  PORT = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  try {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    const errors = []; p.on('pageerror', e => errors.push(String(e.message)));
    await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.app && app.state && app._writerDecided);
    await p.evaluate(async () => {
      app.ownerPin = await app.hashPin('246810');
      app.state.staff = [
        { id: 'st-1', name: 'เอ', role: 'ช่างตัดผม', active: true, accessLevel: 'staff', pin: await app.hashPin('222222') },
        { id: 'st-2', name: 'บี', role: 'ผู้จัดการ', active: true, accessLevel: 'manager', pin: await app.hashPin('333333') }];
      app.state.services = [{ id: 's1', name: 'ตัดผมชาย', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }];
      app.state.categories = [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }];
      app.state.customers = [{ id: 'c-1', name: 'คุณสมชาย', phone: '0811111111', visitCount: 4, tier: 'ทั่วไป (General)', note: '' },
        { id: 'c-2', name: 'คุณวิภา', phone: '0899999999', visitCount: 1, tier: 'ทั่วไป (General)', note: '' }];
      app.state.transactions = []; app.state.queue = []; app.state.cart = [];
      app.state.shift = { active: true, startTime: Date.now() - 60000, startCash: 1000, startDetails: { 1000: 1 }, expenses: [], history: [] };
      app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = ''; app.cardFeeRate = 10;
      if (!await app.saveState()) throw new Error('seed failed');
      app.renderAll(); app.requireLogin();
    });
    await login(p, 'st-1', '222222');

    console.log('\n── ข้อ 12: ล้างตะกร้า');
    await addHaircut(p);
    await p.selectOption('#cart-customer-select', 'c-1');
    await p.click('#btn-clear-cart');
    t('หลังล้างตะกร้า ช่องลูกค้ากลับเป็น Walk-in', (await p.inputValue('#cart-customer-select')) === '');
    await addHaircut(p); await payCash(p);
    let b = await lastBill(p);
    t('บิล walk-in ถัดไปไม่ลงชื่อสมาชิก และจำนวนครั้งไม่เพิ่ม', b.name === 'ลูกค้าทั่วไป (Walk-in)' && b.visit === 4, b);

    console.log('\n── ข้อ 12: สลับผู้ใช้');
    await addHaircut(p);
    await p.selectOption('#cart-customer-select', 'c-1');
    await p.evaluate(() => app.logout());
    await login(p, 'st-2', '333333');
    t('หลังสลับผู้ใช้ ช่องลูกค้ากลับเป็น Walk-in', (await p.inputValue('#cart-customer-select')) === '');
    await addHaircut(p); await payCash(p);
    b = await lastBill(p);
    t('บิลของคนถัดไปไม่ลงชื่อสมาชิกของคนก่อน', b.name === 'ลูกค้าทั่วไป (Walk-in)' && b.visit === 4, b);

    console.log('\n── ข้อ 12: เพิ่มลูกค้า');
    await p.evaluate(() => app.switchTab('customers'));
    await p.click('#btn-add-customer');
    await p.fill('#cust-name', 'คุณหน้าลูกค้า'); await p.fill('#cust-phone', '0822222222');
    await p.click('#form-customer button[type="submit"]');
    await p.waitForFunction(() => app.state.customers.some(c => c.name === 'คุณหน้าลูกค้า') && !document.getElementById('modal-customer').classList.contains('active'));
    await p.evaluate(() => app._mutationChain); await p.waitForTimeout(100);
    t('เพิ่มจากหน้าลูกค้า → ไม่ถูกเลือกในตะกร้า', (await p.inputValue('#cart-customer-select')) === '');
    await p.evaluate(() => app.switchTab('pos'));
    await p.click('#btn-add-customer-quick');
    await p.fill('#cust-name', 'คุณด่วน'); await p.fill('#cust-phone', '0833333333');
    await p.click('#form-customer button[type="submit"]');
    await p.waitForFunction(() => app.state.customers.some(c => c.name === 'คุณด่วน') && !document.getElementById('modal-customer').classList.contains('active'));
    await p.evaluate(() => app._mutationChain); await p.waitForTimeout(100);
    const quickId = await p.evaluate(() => app.state.customers.find(c => c.name === 'คุณด่วน').id);
    t('ลงทะเบียนด่วนในตะกร้า → ถูกเลือกให้เลย', (await p.inputValue('#cart-customer-select')) === quickId);
    await p.selectOption('#cart-customer-select', '');

    console.log('\n── ข้อ 36: ค้นหาลูกค้าด้วยการวางข้อความ');
    await p.evaluate(() => app.switchTab('customers'));
    await p.fill('#search-customer', '0899999999');      // fill = เหมือนวาง/บอกด้วยเสียง (ไม่มี keyup)
    await p.waitForTimeout(150);
    const rows = await p.evaluate(() => document.getElementById('customer-table-body') ? document.getElementById('customer-table-body').innerText : document.body.innerText);
    t('วางเบอร์แล้วตารางกรองเหลือลูกค้าคนนั้น', /คุณวิภา/.test(rows) && !/คุณสมชาย/.test(rows), rows.slice(0, 160));
    await p.fill('#search-customer', '');

    console.log('\n── ข้อ 44: ปุ่มอัตราค่าธรรมเนียมบัตร');
    await addHaircut(p);
    await p.click('#btn-checkout');
    await p.waitForFunction(() => document.getElementById('modal-payment').classList.contains('active'));
    await p.click('#pay-credit-btn');
    await p.waitForSelector('.card-fee-opt');
    const hs = await p.$$eval('.card-fee-opt', els => els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
    t('ปุ่มอัตราค่าธรรมเนียมสูงอย่างน้อย 44px', hs.length > 0 && hs.every(h => h >= 44), hs);
    await p.evaluate(() => { app.closeModal('modal-payment'); app.clearCart(); });

    console.log('\n── ข้อ 18: นาฬิกาเครื่องถูกตั้งย้อนหลัง (ผู้จัดการ)');
    const before = await p.evaluate(() => document.getElementById('kpi-revenue').innerText);
    await p.evaluate(() => {
      const realNow = Date.now.bind(Date);
      app.state.transactions.unshift({ id: 'TX-OLDDAY-0001', date: realNow() - 3 * 86400e3, total: 777, subtotal: 777, discount: 0,
        customerName: 'ลูกค้าวันเก่า', services: ['ตัดผมชาย'], details: [{ name: 'ตัดผมชาย', price: 777, netPrice: 777, staffId: 'st-1', staffName: 'เอ',
        commission: 0, commissionType: 'percent', commissionAmount: 0, category: 'barber', vatable: false }], paymentMethod: 'cash', staffNames: ['เอ'],
        syncStatus: 'synced', vatRate: 0, nonVatBase: 777, vatableBase: 0, vatAmount: 0, rounding: 0 });
      Date.now = () => realNow() - 3 * 86400e3 + 3600e3;      // iPad ถูกตั้งวันที่ย้อนไป ~3 วัน
      app._clockFloorCache = null;
      app.switchTab('dashboard');
    });
    const dash = await p.evaluate(() => ({ rev: document.getElementById('kpi-revenue').innerText, recent: document.getElementById('recent-sales-list').innerText }));
    t('แดชบอร์ดยังเป็นยอดวันนี้ (ไม่ใช่ ฿777 ของวันเก่า)', !/777/.test(dash.rev) && dash.rev === before, { dash, before });
    t('ไม่โชว์ชื่อลูกค้าของวันเก่า', !/ลูกค้าวันเก่า/.test(dash.recent), dash.recent.slice(0, 120));
    t('ไม่มี error บนหน้า', errors.length === 0, errors);
    await ctx.close();
  } catch (e) { fail++; console.log('  FAIL crash', e && e.message); }
  finally { await browser.close(); server.close(); }
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
