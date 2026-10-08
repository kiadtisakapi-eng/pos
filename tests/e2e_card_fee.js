// แบ่งจ่าย + ค่าธรรมเนียมบัตร บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง + Apps Script ตัวจริงบนชีตจำลอง) — 6 ต.ค. 2569
//   [A] หน้าชำระเงิน (iPad + มือถือ): ปุ่ม "แบ่งจ่าย" → กรอกเงินสด 400 → จอบอกยอดรูด 660 → กด 5% → 630
//       ปุ่มยืนยันกดถึง ไม่ล้นจอ → บันทึก → ใบเสร็จแจกแจงก้อนเงิน/ค่าธรรมเนียม → อ่าน IndexedDB หลังรีโหลด → แถวบนชีต
//   [B] จ่ายบัตรทั้งบิล + กรอก % เอง (3) → ยอดรูด 1,030 · กรอกผิด (2.5) → ปุ่มยืนยันกดไม่ได้
//   [C] หน้าแก้บิล: บิลแบ่งจ่าย → ช่องทาง/ส่วนลดถูกล็อก · แสดง "แบ่งจ่าย" · ชื่อลูกค้าแก้ได้
//   [D] หน้าตั้งค่า (เจ้าของ): ช่องอัตราค่าธรรมเนียม → บันทึก 8% → จ่ายบัตร 1,000 = 1,080
//   [E] VAT 7%: บัตร 1,177 / แบ่งจ่าย 470+660 = 1,130 / 5% = 1,124 · ใบเสร็จฐาน 56.07/F 60 รวม VAT
//
//   node tests/e2e_card_fee.js        (ภาพหน้าจอ: SHOT=1 → โฟลเดอร์ shots/)
//   พิสูจน์ว่าจับของจริง: รันไฟล์นี้กับโปรเจกต์ก่อนแก้ (6 ต.ค. 2569) → ต้องตก
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
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const PORT = 8133;
const shot = async (pg, name) => { if (!process.env.SHOT) return; fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); await pg.screenshot({ path: path.join(ROOT, 'shots', name + '.png') }); };
const settle = (pg, ms) => pg.waitForTimeout(ms == null ? 400 : ms);
const txt = (pg, sel) => pg.evaluate(sel => { const e = document.querySelector(sel); return e ? e.innerText.trim() : null; }, sel);
// ปุ่ม/ช่องอยู่ชั้นบนสุดของจอจริง (ไม่โดนอะไรบัง) และไม่ล้นจอแนวนอน
const onTop = (pg, sel) => pg.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return (hit === el || el.contains(hit)) && r.left >= 0 && r.right <= window.innerWidth + 0.5;
}, sel);
const noHScroll = pg => pg.evaluate(() => {
  const m = document.querySelector('#modal-payment .modal-card');
  return !!m && m.scrollWidth <= m.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
});
const EXPECTED_CONSOLE = /favicon|Failed to load resource/i;

async function newShop(b, holder, viewport) {
  const c = await b.newContext({ viewport: viewport || { width:1180, height:820 }, hasTouch:true });
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
async function seedShop(p, gas) {
  await p.evaluate(async ({ url, token }) => {
    try { localStorage.removeItem('epos_login_guard'); } catch (e) {}
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('1111') },
      { id:'mg-1', name:'สมหญิง', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'นวดไทย', price:1000, duration:60, category:'massage', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'massage', name:'นวด', icon:'fa-spa', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = false; app.shopPromptPayId = '0812345678';
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
  await settle(p, 500);
}
// ใส่บริการลงตะกร้า (เลือกผู้ให้บริการแล้ว) แล้วกดปุ่ม "ไปที่หน้าชำระเงิน" บนจอจริง
async function openPayment(p) {
  await p.evaluate(() => {
    app.switchTab('pos');
    app.state.cart = [{ uniqueCartId:'u' + Date.now(), id:'s1', name:'นวดไทย', price:1000, duration:60, commission:10, commissionType:'percent', category:'massage', staffId:'st-1', staffName:'สมชาย' }];
    document.getElementById('cart-discount').value = '0';
    app.renderCart();
  });
  await settle(p, 200);
  await p.evaluate(() => app.openCheckoutModal());
  await p.waitForSelector('#modal-payment.active', { timeout: 5000 });
}
const monthRows = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => gas.sheet(n)._grid.slice(1));
// แถวบิลบนชีตเป็นอ็อบเจกต์ตามหัวตาราง — ห้ามอ้างเลขคอลัมน์ตายตัว (ชีตมี 13 คอลัมน์: ยอดสุทธิอยู่ช่อง 11 · ช่อง 12 คือพนักงาน)
const monthBills = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n)).flatMap(n => {
  const g = gas.sheet(n)._grid, head = g[0].map(h => String(h).trim());
  return g.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
});

(async () => {
  await new Promise(r=>srv.listen(PORT,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  for (const [label, vp] of [['iPad', { width: 1180, height: 820 }], ['มือถือ', { width: 390, height: 844 }]]) {
    // แต่ละขนาดจอเป็นร้านทดสอบคนละชุด: เครื่องขายหลักหนึ่งเครื่องต่อ backend
    const gas = createGasEnv();
    const holder = { gas };
    const A = await newShop(b, holder, vp);
    const p = A.p;
    await seedShop(p, gas);
    await login(p, 'mg-1', '222222');
    t(`(${label}) ผู้จัดการล็อกอินได้`, await p.evaluate(() => app.currentRole === 'manager'));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[A/${label}] แบ่งจ่าย: เงินสด 400 → รูด 660 → กด 5% → รูด 630 → บันทึก`);
    await openPayment(p);
    t(`(${label}) ปุ่ม "แบ่งจ่าย" อยู่บนจอ กดถึง`, await onTop(p, '#pay-split-btn'));
    await p.click('#pay-split-btn');
    await settle(p, 200);
    t(`(${label}) ยังไม่กรอกเงินสด → ปุ่มยืนยันกดไม่ได้`, await p.evaluate(() => document.getElementById('btn-complete-checkout').disabled));
    await p.fill('#split-cash-amount', '400');
    await settle(p, 200);
    t(`(${label}) กรอก 400 → ยอดรูด ฿660.00 · รวมบิล ฿1,060.00 · ค่าธรรมเนียม ฿60.00 (10%)`,
      (await txt(p, '#card-swipe-total-label')) === '฿660.00' && (await txt(p, '#split-bill-total-label')) === '฿1,060.00' &&
      /฿60\.00 \(10%\)/.test(await txt(p, '#card-fee-amount-label')),
      [await txt(p, '#card-swipe-total-label'), await txt(p, '#split-bill-total-label'), await txt(p, '#card-fee-amount-label')]);
    t(`(${label}) ปุ่มลดค่าธรรมเนียม 5% อยู่บนจอ กดถึง`, await onTop(p, '#card-fee-options .card-fee-opt[data-rate="5"]'));
    await p.click('#card-fee-options .card-fee-opt[data-rate="5"]');
    await settle(p, 200);
    t(`(${label}) กด 5% → ยอดรูด ฿630.00 · บอกว่าลดจาก 10%`,
      (await txt(p, '#card-swipe-total-label')) === '฿630.00' && /ลดจาก 10% เหลือ 5%/.test(await txt(p, '#card-fee-amount-label')),
      [await txt(p, '#card-swipe-total-label'), await txt(p, '#card-fee-amount-label')]);
    t(`(${label}) หน้าต่างไม่ล้นแนวนอน · ปุ่มยืนยันกดถึง`, await noHScroll(p) && await onTop(p, '#btn-complete-checkout'));
    await shot(p, `cardfee-split-${label}`);
    await p.click('#btn-complete-checkout');
    await p.waitForSelector('#modal-receipt.active', { timeout: 6000 });
    const rc = await txt(p, '#thermal-receipt-preview');
    t(`(${label}) ใบเสร็จ: ค่าธรรมเนียมบัตร 5% ฿30.00 · แบ่งจ่าย เงินสด ฿400.00 · Credit Card ฿630.00 · รวม 1,030`,
      /ค่าธรรมเนียมบัตร 5% \(คิดจากส่วนที่จ่ายบัตร ฿600\.00\):\s*฿30\.00/.test(rc) && /แบ่งจ่าย/.test(rc) && /• เงินสด:\s*฿400\.00/.test(rc) &&
      /• Credit Card:\s*฿630\.00/.test(rc) && /รวมทั้งสิ้น:\s*฿1,030/.test(rc), rc);
    await shot(p, `cardfee-receipt-${label}`);
    await p.evaluate(() => app.closeModal('modal-receipt'));
    await settle(p, 800);
    await p.reload({ waitUntil:'networkidle' }); await ready(p);
    const saved = await p.evaluate(async () => {
      const tx = app.state.transactions[app.state.transactions.length - 1];
      return { pm: tx.paymentMethod, payments: tx.payments, total: tx.total, fee: tx.cardFee, sync: tx.syncStatus,
        drawer: app.computeShiftDrawer(app.state.shift).cashSales };
    });
    t(`(${label}) รีโหลดแล้วอ่านจาก IndexedDB: แบ่งจ่าย 400 + 630 · ลดเหลือ 5% โดยสมหญิง · ลิ้นชักนับ 400`,
      saved.pm === 'split' && JSON.stringify(saved.payments) === JSON.stringify([{ method:'cash', amount:400 }, { method:'credit', amount:630 }]) &&
      saved.total === 1030 && saved.fee.rate === 5 && saved.fee.reducedBy === 'สมหญิง' && saved.drawer === 400, saved);
    await p.evaluate(async () => { await app.syncPendingTransactions(true); });
    await settle(p, 600);
    t(`(${label}) แถวบนชีต: "เงินสด 400 + Credit Card 630" · รายการ "นวดไทย, ค่าธรรมเนียมบัตร 5%"`,
      monthRows(gas).some(r => r[4] === 'เงินสด 400 + Credit Card 630' && r[3] === 'นวดไทย, ค่าธรรมเนียมบัตร 5%'),
      monthRows(gas).map(r => [r[3], r[4]]));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[B/${label}] จ่ายบัตรทั้งบิล: กรอก % เอง`);
    await openPayment(p);
    await p.click('#pay-credit-btn');
    await settle(p, 200);
    t(`(${label}) บัตร: ยอดรูด ฿1,100.00 (รวมค่าธรรมเนียม 10%)`, (await txt(p, '#credit-total-label')) === '฿1,100.00', await txt(p, '#credit-total-label'));
    await p.fill('#card-fee-custom', '2.5');
    await settle(p, 200);
    t(`(${label}) กรอก 2.5 → ปุ่มยืนยันกดไม่ได้ + บอกว่าต้องเป็นจำนวนเต็ม`,
      await p.evaluate(() => document.getElementById('btn-complete-checkout').disabled) && /จำนวนเต็ม/.test(await txt(p, '#card-fee-error')));
    await p.fill('#card-fee-custom', '3');
    await settle(p, 200);
    t(`(${label}) กรอก 3 → ยอดรูด ฿1,030.00`, (await txt(p, '#credit-total-label')) === '฿1,030.00', await txt(p, '#credit-total-label'));
    t(`(${label}) ปุ่มยืนยันกดถึง`, await onTop(p, '#btn-complete-checkout'));
    await p.click('#btn-complete-checkout');
    await p.waitForSelector('#modal-receipt.active', { timeout: 6000 });
    const c = await p.evaluate(() => { const tx = app.state.transactions[app.state.transactions.length - 1]; return [tx.paymentMethod, tx.total, tx.cardFee.rate]; });
    t(`(${label}) บันทึกบิลบัตร 1,030 (3%)`, JSON.stringify(c) === JSON.stringify(['credit', 1030, 3]), c);
    await p.evaluate(() => app.closeModal('modal-receipt'));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[C/${label}] หน้าแก้บิล (เจ้าของ): บิลแบ่งจ่ายล็อกยอด/ช่องทาง`);
    await login(p, '__owner__', '246810');
    const sid = await p.evaluate(() => app.state.transactions.find(x => x.paymentMethod === 'split').id);
    await p.evaluate((id) => app.openTransactionEdit(id), sid);
    await p.waitForSelector('#modal-edit-transaction.active', { timeout: 5000 });
    const ed = await p.evaluate(() => {
      const sel = document.getElementById('edit-tx-payment');
      return { pay: sel.disabled, val: sel.value, shown: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '',
        disc: document.getElementById('edit-tx-discount').disabled, cust: document.getElementById('edit-tx-customer').disabled,
        note: document.getElementById('edit-tx-services-list').innerText };
    });
    t(`(${label}) ช่องทางแสดง "แบ่งจ่าย" และถูกล็อก · ส่วนลดถูกล็อก · ชื่อลูกค้าแก้ได้ · มีคำอธิบาย`,
      ed.pay && ed.val === 'split' && /แบ่งจ่าย/.test(ed.shown) && ed.disc && !ed.cust && /ยกเลิกบิลแล้วออกใหม่/.test(ed.note), ed);
    await shot(p, `cardfee-edit-${label}`);
    await p.evaluate(() => app.closeModal('modal-edit-transaction'));

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[D/${label}] หน้าตั้งค่า: อัตราค่าธรรมเนียมบัตร`);
    await p.evaluate(() => app.switchTab('settings'));
    await settle(p, 300);
    t(`(${label}) ช่องอัตราแสดง 10 · ปุ่มบันทึกกดถึง`, await p.evaluate(() => document.getElementById('card-fee-rate').value === '10') && await onTop(p, '#btn-save-card-fee'));
    await p.fill('#card-fee-rate', '8');
    await p.click('#btn-save-card-fee');
    await settle(p, 400);
    t(`(${label}) บันทึก 8% แล้ว`, await p.evaluate(() => app.cardFeeRate === 8));
    await openPayment(p);
    await p.click('#pay-credit-btn'); await settle(p, 200);
    t(`(${label}) จ่ายบัตร 1,000 ตอนนี้รูด ฿1,080.00 · ปุ่มด่วนเป็น 8% / 5% / ไม่คิด`,
      (await txt(p, '#credit-total-label')) === '฿1,080.00' &&
      JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#card-fee-options .card-fee-opt')].map(b => b.innerText.trim()))) === JSON.stringify(['8%', '5%', 'ไม่คิด']));
    await p.evaluate(() => app.closeModal('modal-payment'));
    await p.fill('#card-fee-rate', '10').catch(() => {});
    await p.evaluate(() => app.switchTab('settings'));
    await p.fill('#card-fee-rate', '10'); await p.click('#btn-save-card-fee'); await settle(p, 300);

    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n[E/${label}] ค่าธรรมเนียมรวม VAT ในตัว`);
    await p.evaluate(() => {
      app.vatEnabled = true; app.vatRate = 7; app.state.categories[0].vat = true;
    });
    await openPayment(p); await p.click('#pay-credit-btn'); await settle(p, 200);
    t(`(${label}) VAT: ราคาเงินสด 1,070 · F 107 รวม VAT · รูด 1,177`,
      (await txt(p, '#card-fee-service-label')) === '฿1,070.00' &&
      (await txt(p, '#card-fee-amount-label')) === '฿107.00 (10%) รวม VAT' && (await txt(p, '#credit-total-label')) === '฿1,177.00');
    await p.click('#card-fee-options .card-fee-opt[data-rate="5"]'); await settle(p, 200);
    t(`(${label}) VAT ลดเหลือ 5%: F 54 · รูด 1,124`,
      (await txt(p, '#credit-total-label')) === '฿1,124.00' && /฿54\.00.*รวม VAT/.test(await txt(p, '#card-fee-amount-label')));
    await p.click('#card-fee-options .card-fee-opt[data-rate="10"]'); await p.click('#pay-split-btn');
    await p.fill('#split-cash-amount', '470'); await settle(p, 200);
    t(`(${label}) VAT แบ่งจ่าย: เงินสด 470 · F 60 · รูด 660 · รวมบิล 1,130 · ไม่ล้นและยืนยันกดถึง`,
      (await txt(p, '#card-swipe-total-label')) === '฿660.00' && (await txt(p, '#split-bill-total-label')) === '฿1,130.00' &&
      /฿60\.00.*รวม VAT/.test(await txt(p, '#card-fee-amount-label')) && await noHScroll(p) && await onTop(p, '#btn-complete-checkout'));
    await p.click('#btn-complete-checkout'); await p.waitForSelector('#modal-receipt.active', { timeout: 6000 });
    const vatReceipt = await txt(p, '#thermal-receipt-preview');
    t(`(${label}) ใบเสร็จ VAT: net 56.07 · F 60 รวม VAT · คิดจากส่วนบัตร 600 · ฐาน 1,056.07/VAT 73.92/ปัดเศษ .01`,
      /ค่าธรรมเนียมบัตร 10% ก่อน VAT:\s*฿56\.07/.test(vatReceipt) &&
      /ค่าธรรมเนียมที่ชำระ ฿60\.00 รวม VAT.*คิดจากส่วนที่จ่ายบัตร ฿600\.00/.test(vatReceipt) &&
      /ยอดคิด VAT:\s*฿1,056\.07/.test(vatReceipt) && /VAT 7%:\s*฿73\.92/.test(vatReceipt) &&
      /ปัดเศษ:\s*฿0\.01/.test(vatReceipt) && /รวมทั้งสิ้น:\s*฿1,130/.test(vatReceipt), vatReceipt);
    await shot(p, `cardfee-vat-receipt-${label}`);
    await p.evaluate(async () => { await app.syncPendingTransactions(true); }); await settle(p, 600);
    const vatBill = await p.evaluate(async () => {
      const tx = (await db.state.get('transactions')).value.at(-1);
      return { total: tx.total, fee: tx.cardFee, payments: tx.payments, sync: tx.syncStatus };
    });
    const vatRows = monthBills(gas).filter(r => r['ช่องทางชำระเงิน'] === 'เงินสด 470 + Credit Card 660');
    t(`(${label}) VAT ลงฐานข้อมูลและชีตได้ ไม่ค้างรอตรวจ · แถวชีต ยอดสุทธิ 1,130 · คิด VAT 1,056.07 · VAT 73.92 · ปัดเศษ .01`,
      vatBill.total === 1130 && vatBill.fee.amount === 60 && vatBill.fee.net === 56.07 && vatBill.sync === 'synced' &&
      vatRows.some(r => r['ยอดสุทธิ (฿)'] === 1130 && r['คิด VAT (฿)'] === 1056.07 && r['VAT (฿)'] === 73.92 && r['ปัดเศษ (฿)'] === 0.01),
      { vatBill, vatRows });

    t(`(${label}) ไม่มี JavaScript error ตลอดชุด`, A.errors.length === 0, A.errors);
    await A.c.close();
  }

  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
