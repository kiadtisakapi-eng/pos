// ตรวจ 13 ต.ค. 2569 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง · ขนาด iPad 1024×768 แบบสัมผัส)
//   [1]  กด Enter ในช่องนับธนบัตร = ไปช่องถัดไป (เดิมเปิด/ปิดกะทันทีด้วยยอดที่นับไม่ครบ)
//        กด Enter ในช่องยอดค่าใช้จ่ายโดยยังไม่เลือกพนักงาน = ไม่บันทึก
//   [4]  ผู้จัดการปิดกะ → ออกจากระบบ · หน้าเปิดกะมีปุ่ม "เปลี่ยนผู้ใช้" + "ดูรายงานก่อน" ที่กดได้จริง
//   [11] ตัวเลขยอดขายบนการ์ดไม่ล้น/ไม่ถูกตัด (รายงานรายวัน/รายเดือน · แดชบอร์ด)
//   [21] ตัวเลือก "คืนเงิน" ของบิลบัตรบอกว่าไม่กระทบลิ้นชัก · หน้าเงินสดบอกยอดที่ต้องชำระ
//
//   node tests/e2e_audit_20261013.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const DB_NAME = 'EroticaPosDatabase';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,300):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const readKey = (pg, key) => pg.evaluate(({ db, key }) => new Promise(res => {
  const r = indexedDB.open(db);
  r.onsuccess = e => { const d = e.target.result;
    const q = d.transaction('state','readonly').objectStore('state').get(key);
    q.onsuccess = () => { res(q.result ? q.result.value : undefined); d.close(); };
    q.onerror = () => res('__error__'); };
  r.onerror = () => res('__error__');
}), { db: DB_NAME, key });
const onTop = (pg, sel) => pg.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return false;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === el || el.contains(hit);
}, sel);
async function typePrompt(p, value) {
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 });
  await p.fill('#prompt-modal-input', value);
  await p.click('#btn-prompt-submit');
  await p.waitForTimeout(250);
}
async function login(p, uid, pin) {
  await p.evaluate(() => { if (app.currentRole) app.logout(); });
  await p.waitForTimeout(300);
  await p.click(`#login-user-list .login-user-btn[data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
}
// ตัวเลขในการ์ดล้นกรอบไหม — ข้อความต้องอยู่ในการ์ดทั้งหมด (ไม่ถูกตัด)
const clipped = (pg, id) => pg.evaluate(id => {
  const el = document.getElementById(id); if (!el) return 'missing';
  const card = el.closest('.kpi-card'); const r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || (parseFloat(getComputedStyle(el).fontSize) * 1.2);
  const lines = Math.round(el.getBoundingClientRect().height / lh);
  return { text: el.innerText, over: Math.round(tr.right - c.right), scroll: el.scrollWidth - el.clientWidth, lines,
    ok: tr.right <= c.right + 1 && el.scrollWidth <= el.clientWidth + 1 && lines === 1 };
}, id);

(async () => {
  await new Promise(r=>srv.listen(8140,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1024,height:768}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8140/index.html', { waitUntil:'networkidle' });
  await ready(p);
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('1111') },
      { id:'mg-1', name:'สมหญิง', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:true, startTime:Date.now()-3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    app.state.cloudOutbox = [];
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[1] Enter ในช่องนับธนบัตร');
  await login(p, '__owner__', '246810');
  await p.evaluate(() => app.openCashCounter('close'));
  await p.waitForSelector('#modal-cash-counter.active');
  await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '3');
  await p.press('#form-cash-counter .cash-qty-input[data-denom="1000"]', 'Enter');
  await p.waitForTimeout(500);
  const afterEnter = await p.evaluate(() => ({ active: app.state.shift.active, open: document.getElementById('modal-cash-counter').classList.contains('active'),
    focus: document.activeElement && document.activeElement.getAttribute('data-denom') }));
  t('กด Enter หลังพิมพ์แบงก์ 1000 → กะยังเปิด · หน้าต่างนับเงินยังอยู่ · เลื่อนไปช่อง 500', afterEnter.active && afterEnter.open && afterEnter.focus === '500', afterEnter);
  const sh0 = await readKey(p, 'shift');
  t('IndexedDB: ยังไม่มีประวัติปิดกะ', sh0 && sh0.active === true && (sh0.history || []).length === 0, sh0 && sh0.history);
  await p.evaluate(() => app.closeModal('modal-cash-counter'));

  console.log('\n[1] Enter ในช่องยอดค่าใช้จ่าย');
  await p.evaluate(() => app.switchTab('dashboard'));
  await p.waitForTimeout(300);
  await p.selectOption('#expense-type', 'staff');
  await p.fill('#expense-amount', '200');
  await p.press('#expense-amount', 'Enter');
  await p.waitForTimeout(500);
  t('Enter ตอนยังไม่เลือกพนักงาน → ไม่บันทึกค่าใช้จ่าย', await p.evaluate(() => app.state.shift.expenses.length === 0));
  await p.selectOption('#expense-staff-id', 'st-1');
  await p.press('#expense-amount', 'Enter');
  await p.waitForTimeout(600);
  t('เลือกพนักงานแล้วกด Enter → บันทึกในชื่อสมชาย', await p.evaluate(() => app.state.shift.expenses.length === 1 && /สมชาย/.test(app.state.shift.expenses[0].note)));
  await p.evaluate(async () => { app.state.shift.expenses = []; await app.saveState(); });

  console.log('\n[21] หน้าเงินสดบอกยอด · ป้ายยกเลิกบิลบัตร');
  await p.evaluate(() => app.switchTab('pos'));
  await p.waitForTimeout(300);
  await p.click('.service-card:has-text("ตัดผมชาย")');
  for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption({ index: 1 });
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  await p.click('#pay-cash-btn');
  await p.waitForTimeout(200);
  await p.fill('#cash-received', '500');
  await p.dispatchEvent('#cash-received', 'input');
  await p.waitForTimeout(200);
  t('หน้าเงินสดแสดง "ยอดที่ต้องชำระ ฿300.00"', (await p.textContent('#cash-amount-due')) === '฿300.00', await p.textContent('#cash-amount-due'));
  await p.evaluate(() => app.closeModal('modal-payment'));
  await p.evaluate(async () => {
    const now = Date.now();
    const mk = (id, method, total) => ({ id, date: now - 600000, customerName: 'x', services: ['ตัดผมชาย'],
      details: [{ name: 'ตัดผมชาย', price: total, netPrice: total, staffId: 'st-1', staffName: 'สมชาย', commission: 10, commissionType: 'percent', commissionAmount: Math.round(total / 10), category: 'barber', vatable: false }],
      subtotal: total, discount: 0, vatRate: 0, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total, paymentMethod: method,
      tender: { method, amount: total, shiftStart: app.state.shift.startTime }, staffNames: ['สมชาย'], rev: 1, syncStatus: 'pending' });
    app.state.cart = [];
    app.state.transactions = [mk('TX-1790000000001-CARDBILL', 'credit', 512345), mk('TX-1790000000002-CASHBILL', 'cash', 27465)];
    await app.saveState();
  });
  await p.evaluate(() => app.openTransactionEdit('TX-1790000000001-CARDBILL'));
  await p.waitForTimeout(300);
  const optCard = await p.evaluate(() => document.querySelector('#void-money-outcome option[value="refunded"]').textContent);
  t('บิลบัตร: ตัวเลือกคืนเงินบอกว่าไม่กระทบลิ้นชัก', /ไม่กระทบลิ้นชัก/.test(optCard) && !/ออกจากลิ้นชัก/.test(optCard), optCard);
  await p.evaluate(() => app.closeModal('modal-edit-transaction'));
  await p.evaluate(() => app.openTransactionEdit('TX-1790000000002-CASHBILL'));
  await p.waitForTimeout(300);
  const optCash = await p.evaluate(() => document.querySelector('#void-money-outcome option[value="refunded"]').textContent);
  // ตรวจ 19 ต.ค. 2569 ข้อ 1: ป้ายใหม่ถามว่า "เอาเงินของบิลนี้ออกจากยอดที่ควรมี" (เดิม "คืนเงินให้ลูกค้าแล้ว (เงินออกจากลิ้นชัก)")
  t('บิลเงินสด: ตัวเลือกข้อแรก "เอาเงินของบิลนี้ออกจากยอดที่ควรมี"', /ออกจากยอดที่ควรมี/.test(optCash), optCash);
  await p.evaluate(() => app.closeModal('modal-edit-transaction'));

  console.log('\n[11] ตัวเลขบนการ์ดไม่ถูกตัด (iPad 1024×768)');
  await p.evaluate(() => app.switchTab('reports'));
  await p.waitForTimeout(500);
  for (const id of ['report-kpi-total', 'report-kpi-average']) {
    const r = await clipped(p, id);
    t(`รายงาน: ${id} "${r.text}" อยู่ในการ์ดครบ`, r.ok, r);
  }
  await p.evaluate(() => app.switchTab('dashboard'));
  await p.waitForTimeout(500);
  const kd = await clipped(p, 'kpi-revenue');
  t(`แดชบอร์ด: ยอดขายวันนี้ "${kd.text}" อยู่ในการ์ดครบ`, kd.ok, kd);
  for (const [w, h] of [[820, 1180], [1180, 820], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(400);
    const kd2 = await clipped(p, 'kpi-revenue');
    t(`แดชบอร์ด (${w}×${h}): "${kd2.text}" อยู่ในการ์ดครบ บรรทัดเดียว`, kd2.ok, kd2);
  }
  await p.setViewportSize({ width: 1024, height: 768 });

  console.log('\n[4] ผู้จัดการปิดกะ → ออกจากระบบ');
  await p.evaluate(async () => { app.state.transactions = []; await app.saveState(); });
  await login(p, 'mg-1', '222222');
  t('ล็อกอินผู้จัดการ', await p.evaluate(() => app.currentRole === 'manager'));
  await p.evaluate(() => app.openCashCounter('close'));
  await p.waitForTimeout(300);
  await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '1');
  await p.dispatchEvent('#form-cash-counter .cash-qty-input[data-denom="1000"]', 'input');
  await p.click('#btn-confirm-cash-counter');
  await typePrompt(p, '222222');
  await p.waitForTimeout(900);
  const st = await p.evaluate(() => ({ role: app.currentRole, login: document.getElementById('modal-login').classList.contains('active') }));
  const sess = await readKey(p, 'session');
  t('ปิดกะแล้ว → ออกจากระบบ · หน้าล็อกอินขึ้น', st.role === null && st.login, st);
  t('IndexedDB: ไม่มีเซสชันค้าง (เปิดแอปตอนเช้าต้องใส่ PIN)', !sess, sess);
  await p.reload({ waitUntil: 'networkidle' });
  await ready(p);
  await p.waitForTimeout(500);
  t('รีโหลดแอป → ยังต้องล็อกอิน (ไม่มีใครค้างอยู่)', await p.evaluate(() => app.currentRole === null && document.getElementById('modal-login').classList.contains('active')));
  await p.click('#login-user-list .login-user-btn[data-uid="mg-1"]');
  await p.fill('#login-pin-input', '222222');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(600);
  t('ล็อกอินอีกครั้ง → หน้าเปิดกะ', await p.evaluate(() => document.getElementById('modal-cash-counter').classList.contains('active')));
  t('ปุ่ม "เปลี่ยนผู้ใช้" กดได้จริง', await onTop(p, '#btn-switch-user-cash-counter'));
  t('ปุ่ม "ดูรายงานก่อน" กดได้จริง', await onTop(p, '#btn-cancel-cash-counter'));
  await p.click('#btn-cancel-cash-counter');
  await p.waitForTimeout(400);
  t('กด "ดูรายงานก่อน" → อยู่หน้ารายงาน (ไม่ต้องเปิดกะปลอม)', await p.evaluate(() => app.state.activeScreen === 'reports' && !app.state.shift.active &&
    !document.getElementById('modal-cash-counter').classList.contains('active')));
  await p.evaluate(() => app.openCashCounter('open'));
  await p.waitForTimeout(300);
  await p.click('#btn-switch-user-cash-counter');
  await p.waitForTimeout(400);
  t('กด "เปลี่ยนผู้ใช้" → ออกจากระบบ', await p.evaluate(() => app.currentRole === null && document.getElementById('modal-login').classList.contains('active')));

  t('ไม่มี error ในหน้าเว็บ', errors.length === 0, errors);
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
