// ชุด 10 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง) — รอบตรวจ 4 (26 ก.ย. 2569)
//   [L] พนักงานกด PIN ผิดจนล็อก → เจ้าของยังล็อกอินผ่านหน้าจอได้ (ล็อกเฉพาะบัญชี)
//   [E] ผู้จัดการกด "แก้ไข" จากตารางรายงาน → หน้าต่างดูอย่างเดียว (ไม่มีปุ่มบันทึก · ช่องล็อก · ยกเลิกบิลยังกดได้)
//   [X] พนักงานลงค่าใช้จ่ายจากลิ้นชักเกิน 300 → หน้าต่างขอ PIN ผู้จัดการอยู่บนสุด · อนุมัติแล้วชื่อขึ้นในรายการ ·
//       ปุ่มลบของรายการคนอื่นไม่ขึ้น
//   [Q] ไลบรารี QR โหลดไม่ขึ้น → ปุ่มยืนยันรับเงินกดไม่ได้
//   [C] กราฟรายวันเริ่ม 10:00
//   [F] ส่งออกไฟล์สำรอง → เมนูแชร์ (จำลอง) + ข้อความบอกผลขึ้นบนจอ
//
//   node tests/e2e_batch10.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,300):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const onTop = (pg, sel) => pg.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return false;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === el || el.contains(hit);
}, sel);
const toastText = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); return c ? c.innerText : ''; });
const clearToasts = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); if (c) c.innerHTML = ''; });
async function typePrompt(p, value) {
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 });
  await p.fill('#prompt-modal-input', value);
  await p.click('#btn-prompt-submit');
  await p.waitForTimeout(250);
}
async function login(p, uid, pin) {
  await p.evaluate(() => { app.logout && app.logout(); });
  await p.waitForTimeout(300);
  await p.click(`#login-user-list .login-user-btn[data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
}
async function addExpense(p, amount, note) {
  await p.evaluate(() => app.switchTab('dashboard'));
  await p.waitForTimeout(200);
  await p.selectOption('#expense-type', 'other');
  await p.dispatchEvent('#expense-type', 'change');
  await p.fill('#expense-amount', String(amount));
  await p.fill('#expense-note', note || 'x');
  await p.selectOption('#expense-source', 'drawer');
  await p.click('#form-add-expense button[type="submit"]');
  await p.waitForTimeout(400);
}

(async () => {
  await new Promise(r=>srv.listen(8130,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  // [Q] ตั้งใจทำให้สร้าง QR ไม่สำเร็จ — แอปพิมพ์ console.error ของกรณีนั้นเอง ไม่นับเป็นข้อผิดพลาด
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text()) && !/PromptPay QR generation failed/.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8130/index.html', { waitUntil:'networkidle' });
  await ready(p);
  await p.evaluate(async () => {
    try { localStorage.removeItem('epos_login_guard'); } catch (e) {}
    app._loginGuardLoaded = false;
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('1111') },
      { id:'mg-1', name:'สมหญิง', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:true, startTime:Date.now()-3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = ''; app.shopPromptPayId = '0812345678';
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[L] PIN ผิดล็อกเฉพาะบัญชี');
  for (let i = 0; i < 6; i++) await login(p, 'st-1', '9999');
  await login(p, 'st-1', '1111');
  t('พนักงานผิดครบ → บัญชีพนักงานคนนั้นล็อก (PIN ถูกก็ยังรอ)', await p.evaluate(() => app.currentRole === null));
  await login(p, '__owner__', '246810');
  t('เจ้าของล็อกอินผ่านหน้าจอได้ทันที (เดิมล็อกทั้งเครื่อง)', await p.evaluate(() => app.currentRole === 'owner'));

  console.log('\n[E] ผู้จัดการเปิดบิล = ดูอย่างเดียว');
  // ออกบิล 1 ใบด้วยเจ้าของ
  await p.evaluate(async () => {
    app.state.cart = [{ uniqueCartId:'u1', id:'s1', name:'ตัดผมชาย', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย' }];
    app.state.selectedPaymentMethod = 'credit';
    document.getElementById('cart-discount').value = '0';
    app.beginCheckoutAttempt();
    await app.processCheckout();
    app.closeModal('modal-receipt');
  });
  await p.waitForTimeout(300);
  await login(p, 'mg-1', '222222');
  await p.evaluate(() => app.switchTab('reports'));
  await p.waitForTimeout(400);
  await p.click('#report-transactions-body button.primary');
  await p.waitForSelector('#modal-edit-transaction.active', { timeout: 5000 });
  const m = await p.evaluate(() => ({
    saveVis: document.getElementById('btn-save-tx-edit').offsetParent !== null,
    cust: document.getElementById('edit-tx-customer').disabled, pay: document.getElementById('edit-tx-payment').disabled,
    disc: document.getElementById('edit-tx-discount').disabled,
    staffSel: [...document.querySelectorAll('.edit-tx-service-staff-select')].every(s => s.disabled),
    note: document.getElementById('edit-tx-access-note').innerText,
    title: document.getElementById('edit-tx-modal-title').innerText,
    close: document.getElementById('btn-close-tx-edit').innerText }));
  t('ไม่มีปุ่ม "บันทึกการแก้ไข" (เดิมกดได้แล้วถูกปฏิเสธ)', !m.saveVis, m);
  t('ทุกช่องล็อก (ลูกค้า/ช่องทาง/ส่วนลด/ผู้ให้บริการ)', m.cust && m.pay && m.disc && m.staffSel, m);
  t('บอกว่า "ดูอย่างเดียว" · หัวหน้าต่าง "รายละเอียดบิล" · ปุ่มล่าง "ปิด"', /ดูอย่างเดียว/.test(m.note) && m.title === 'รายละเอียดบิล' && m.close === 'ปิด', m);
  await p.evaluate(() => document.querySelector('#edit-tx-void-section button.danger').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(150);
  t('ปุ่มยกเลิกบิลยังอยู่และกดได้จริง', await onTop(p, '#edit-tx-void-section button.danger'));
  await p.click('#btn-close-tx-edit');
  await p.waitForTimeout(200);

  console.log('\n[X] ค่าใช้จ่ายจากลิ้นชักเกินเพดาน');
  await login(p, 'st-1', '1111');
  // ตัวนับของพนักงานถูกล็อกไว้จาก [L] — เข้าไม่ได้จนกว่าจะหมดเวลา · ล้างเฉพาะบัญชีนี้แทนการรอ
  if (!(await p.evaluate(() => app.currentRole === 'staff'))) {
    await p.evaluate(() => app.loginGuardReset('st-1'));
    await login(p, 'st-1', '1111');
  }
  t('พนักงานล็อกอินได้', await p.evaluate(() => app.currentRole === 'staff'));
  await addExpense(p, 250, 'น้ำแข็ง');
  t('ลง 250 → บันทึกเลย ไม่มีหน้าต่างถาม PIN', await p.evaluate(() => app.state.shift.expenses.length === 1 && !document.getElementById('modal-prompt').classList.contains('active')));
  await addExpense(p, 100, 'ของใช้');
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 });
  const promptTxt = await p.evaluate(() => document.getElementById('modal-prompt').innerText);
  t('ลงเพิ่ม 100 (รวม 350) → ขึ้นหน้าต่างขอ PIN ผู้จัดการ บอกยอดรวมและเพดาน', /ผู้จัดการ/.test(promptTxt) && /300/.test(promptTxt) && /350/.test(promptTxt), promptTxt);
  t('หน้าต่างขอ PIN อยู่บนสุด กดได้จริง', await onTop(p, '#prompt-modal-input'));
  await typePrompt(p, '222222');
  await p.waitForTimeout(300);
  const ex = await p.evaluate(() => ({ n: app.state.shift.expenses.length, last: app.state.shift.expenses[app.state.shift.expenses.length - 1],
    list: document.getElementById('expense-list').innerText }));
  t('ผู้จัดการใส่ PIN → บันทึก พร้อมชื่อผู้อนุมัติ', ex.n === 2 && ex.last.approvedBy === 'สมหญิง', ex);
  t('ชื่อผู้อนุมัติขึ้นในรายการบนจอ', /อนุมัติโดย สมหญิง/.test(ex.list), ex.list);
  // รายการของคนอื่นในกะ → ปุ่มลบไม่ขึ้นให้พนักงาน
  await p.evaluate(async () => {
    app.state.shift.expenses.push({ id:'exp_mgr_1', type:'other', amount:40, note:'ของผู้จัดการ', time:Date.now(), by:'สมหญิง', byId:'mg-1', paidFrom:'drawer' });
    await app.saveState(); app.renderDashboard();
  });
  const btns = await p.evaluate(() => [...document.querySelectorAll('#expense-list button')].map(b => b.getAttribute('onclick')));
  t('พนักงาน: ปุ่มลบขึ้นเฉพาะรายการของตัวเอง', btns.length === 2 && !btns.some(s => /exp_mgr_1/.test(s)), btns);

  console.log('\n[Q] QR สร้างไม่สำเร็จ');
  await p.evaluate(() => {
    window._ppqr = window.PromptPayQR; window.PromptPayQR = null;
    app.state.cart = [{ uniqueCartId:'u2', id:'s1', name:'ตัดผมชาย', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย' }];
    document.getElementById('cart-discount').value = '0';
    app.openPaymentModal ? app.openPaymentModal() : null;
  });
  await p.waitForTimeout(300);
  if (!(await p.isVisible('#pay-qr-btn'))) { await p.evaluate(() => { app.beginCheckoutAttempt(); app.openModal('modal-payment'); }); await p.waitForTimeout(200); }
  await p.click('#pay-qr-btn');
  await p.waitForTimeout(200);
  const q = await p.evaluate(() => ({ dis: document.getElementById('btn-complete-checkout').disabled, box: document.getElementById('dynamic-qr-box').innerText }));
  t('ไลบรารี QR หาย → จอบอกสร้างไม่สำเร็จ และปุ่มยืนยันรับเงินกดไม่ได้', q.dis === true && /สร้าง QR ไม่สำเร็จ/.test(q.box), q);
  await p.evaluate(() => { window.PromptPayQR = window._ppqr; });
  await p.click('#pay-qr-btn');
  await p.waitForTimeout(200);
  t('ไลบรารีกลับมา → QR ขึ้น ปุ่มกดได้', await p.evaluate(() => !document.getElementById('btn-complete-checkout').disabled && !!document.querySelector('#dynamic-qr-box canvas, #dynamic-qr-box svg')));
  await p.evaluate(() => { app.closeModal('modal-payment'); app.state.cart = []; });

  console.log('\n[C] กราฟรายวัน + [F] ส่งออกไฟล์สำรอง (เจ้าของ)');
  await login(p, '__owner__', '246810');
  await p.evaluate(() => {
    const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); d.setHours(10, 30, 0, 0);
    app.renderReportsChart([{ date: d.getTime(), total: 123 }], 'daily');
  });
  const firstLabel = await p.evaluate(() => (document.querySelector('#css-bar-chart-labels div') || {}).innerText || '');
  t('กราฟรายวันเริ่มช่วง 10:00-13:00', firstLabel.trim() === '10:00-13:00', firstLabel);
  await p.evaluate(() => app.switchTab('settings'));
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    window._shared = null;
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { window._shared = d.files.map(f => f.name + ':' + f.type + ':' + f.size); };
  });
  await clearToasts(p);
  await p.click('button[onclick="app.exportData()"]');
  await p.waitForTimeout(400);
  const shared = await p.evaluate(() => window._shared);
  t('กดส่งออก → เปิดเมนูแชร์พร้อมไฟล์ .json จริง (มีขนาด)', Array.isArray(shared) && /\.json:application\/json:\d{3,}/.test(shared[0]), shared);
  const tt = await toastText(p);
  t('ขึ้นข้อความบอกผลบนจอ ให้ไปตรวจในแอป "ไฟล์"', /แอป "ไฟล์"/.test(tt), tt);

  t('ไม่มี JavaScript error ตลอดการทดสอบ', errors.length === 0, errors);
  console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ทดสอบล้มกลางทาง:', e); process.exit(1); });
