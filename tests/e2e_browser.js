// เดินทั้งวันของร้านผ่านการ "กดจริง" บนเบราว์เซอร์จริง — ตั้งแต่ล็อกอินถึงปิดกะ
//
// ต่างจากเทสต์ตรรกะ: ชุดนี้ไม่เรียกฟังก์ชันตรง ๆ แต่คลิกปุ่มและพิมพ์ในช่องเหมือนคนใช้จริง
// จึงจับบั๊กที่เทสต์ตรรกะจับไม่ได้ เช่นปุ่มไม่ผูก event, ฟังก์ชันถูกเรียกด้วยพารามิเตอร์ผิด,
// หรือหน้าจอกับข้อมูลไม่ตรงกัน
//
//   npm i -D playwright  แล้ว  node tests/e2e_browser.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
// โฟลเดอร์ชั่วคราวของเครื่องที่รันจริง — เดิมเคยฝัง /tmp/... ไว้ ซึ่งใช้ได้เฉพาะ Linux
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-e2e-'));
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra?'  → '+extra:''));} };

(async () => {
  await new Promise(r=>srv.listen(8110,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8110/index.html', { waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state, null, {timeout:15000});

  // ── ติดตั้งตัวนับว่าเมธอดไหนถูกเรียกจริงระหว่างเดินทั้งวัน ──
  await p.evaluate(() => {
    const proto = Object.getPrototypeOf(window.app);
    window.__hit = new Set();
    Object.getOwnPropertyNames(proto).forEach(n => {
      if (n === 'constructor' || typeof proto[n] !== 'function') return;
      const fn = proto[n];
      Object.defineProperty(proto, n, { configurable:true, writable:true,
        value: function(...a){ window.__hit.add(n); return fn.apply(this, a); } });
    });
  });

  // ── ตั้งร้าน: เจ้าของ + พนักงาน + บริการ แล้วออกจากระบบ ──
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [{ id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true,
                         accessLevel:'staff', pin: await app.hashPin('222222') }];
    app.state.services = [
      { id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' },
      { id:'s2', name:'นวดไทย',  price:500, duration:60, category:'massage', commission:15, commissionType:'percent' }
    ];
    app.state.categories = [{id:'barber',name:'ตัดผม',icon:'fa-scissors',vat:false},
                            {id:'massage',name:'นวด',icon:'fa-spa',vat:false}];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.voidLog = []; app.state.expenseLog = [];
    app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
    app.vatEnabled = false;
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';   // ออฟไลน์ล้วน ไม่ยิงเน็ตออกไป
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[1] เข้าสู่ระบบด้วยการกดจริง');
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
  t('ล็อกอินเป็นเจ้าของสำเร็จ', await p.evaluate(()=>app.currentRole==='owner'));
  t('ถูกพาไปหน้านับเงินเปิดกะทันที (ยังไม่เปิดกะ)',
    await p.evaluate(()=>document.getElementById('modal-cash-counter').classList.contains('active')));

  console.log('\n[2] เปิดกะด้วยการพิมพ์จำนวนธนบัตรจริง');
  await p.fill('#form-cash-counter input[data-denom="1000"]', '2');
  await p.fill('#form-cash-counter input[data-denom="100"]', '5');
  await p.waitForTimeout(200);
  const shown = await p.textContent('#cash-counter-total');
  t('ยอดรวมบนจอคิดถูก (1000x2 + 100x5 = 2,500)', /2,500/.test(shown), shown);
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(500);
  t('กะเปิดแล้วและจำเงินตั้งต้นไว้ 2,500',
    await p.evaluate(()=>app.state.shift.active===true && app.state.shift.startCash===2500));

  console.log('\n[3] ขายจริง: กดการ์ดบริการ → เก็บเงินสด');
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(300);
  await p.click('.service-card:has-text("ตัดผมชาย")');
  await p.click('.service-card:has-text("นวดไทย")');
  await p.waitForTimeout(300);
  t('ตะกร้ามี 2 รายการ', await p.evaluate(()=>app.state.cart.length===2));
  const sub = await p.textContent('#summary-subtotal');
  t('ยอดก่อนส่วนลดบนจอ = 800', /800/.test(sub), sub);
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  await p.click('#pay-cash-btn');
  await p.waitForTimeout(200);
  t('เลือกเงินสดแล้ว ปุ่มยืนยันยังปิดอยู่จนกว่าจะใส่เงิน',
    await p.evaluate(()=>document.getElementById('btn-complete-checkout').disabled===true));
  await p.fill('#cash-received', '1000');
  await p.waitForTimeout(200);
  const chg = await p.textContent('#cash-change');
  t('เงินทอนคิดถูก (1000 - 800 = 200)', /200/.test(chg), chg);
  await p.click('#btn-complete-checkout');
  await p.waitForTimeout(700);
  const bill = await p.evaluate(()=>{ const tx=app.state.transactions[0]; return tx && {
    total:tx.total, sub:tx.subtotal, cash:tx.cashReceived, chg:tx.cashChange,
    n:app.state.transactions.length, cart:app.state.cart.length, q:app.state.queue.length }; });
  t('บันทึกบิล 1 ใบ ยอด 800 รับ 1000 ทอน 200',
    bill && bill.n===1 && bill.total===800 && bill.cash===1000 && bill.chg===200, JSON.stringify(bill));
  t('ตะกร้าถูกล้างหลังจบบิล', bill && bill.cart===0);
  t('คิวงานถูกสร้างให้อัตโนมัติ', bill && bill.q===1);
  t('ใบเสร็จเด้งขึ้นมา',
    await p.evaluate(()=>document.getElementById('modal-receipt').classList.contains('active')));
  await p.evaluate(()=>app.closeModal('modal-receipt'));

  console.log('\n[4] ค่าใช้จ่ายในกะ — เพิ่มแล้วลบ ต้องมีชื่อติดทุกครั้ง');
  await p.evaluate(()=>app.switchTab('dashboard'));
  await p.waitForTimeout(300);
  await p.selectOption('#expense-type', 'supply');
  await p.fill('#expense-amount', '250');
  await p.fill('#expense-note', 'น้ำยาสระผม');
  await p.click('#form-add-expense button[type="submit"]');
  await p.waitForTimeout(500);
  const exp = await p.evaluate(()=>{ const e=app.state.shift.expenses[0]; return e && {amount:e.amount, by:e.by, n:app.state.shift.expenses.length}; });
  t('ค่าใช้จ่ายถูกบันทึกพร้อมชื่อคนเพิ่ม', exp && exp.n===1 && exp.amount===250 && exp.by==='เจ้าของร้าน', JSON.stringify(exp));
  const expHtml = await p.innerHTML('#expense-list');
  t('ชื่อคนเพิ่มขึ้นบนหน้าจอจริง', /เจ้าของร้าน/.test(expHtml));
  await p.evaluate(()=>{ app.showConfirm=(m,cb)=>cb(); });
  await p.click('#expense-list button.btn-icon');
  await p.waitForTimeout(500);
  const del = await p.evaluate(()=>({ left:app.state.shift.expenses.length, log:app.state.expenseLog.length,
    by:(app.state.expenseLog[0]||{}).by, addedBy:(app.state.expenseLog[0]||{}).addedBy }));
  t('ลบแล้วรายการหายจากกะ', del.left===0, JSON.stringify(del));
  t('การลบถูกบันทึกไว้พร้อมชื่อคนลบและคนเพิ่มเดิม',
    del.log===1 && del.by==='เจ้าของร้าน' && del.addedBy==='เจ้าของร้าน', JSON.stringify(del));

  console.log('\n[5] หน้ารายงาน — ตารางประวัติต้องโชว์ของจริง');
  await p.evaluate(()=>{ const d=new Date(); const pad=n=>String(n).padStart(2,'0');
    document.getElementById('report-date-input').value =
      app.getBusinessISODate(Date.now());
    app.switchTab('reports'); });
  await p.waitForTimeout(600);
  const auditHtml = await p.innerHTML('#report-expense-deletions-body');
  t('ตาราง "ค่าใช้จ่ายที่ถูกลบ" โชว์รายการที่เพิ่งลบ', /น้ำยาสระผม/.test(auditHtml), auditHtml.slice(0,160));
  const voidHtml = await p.innerHTML('#report-voids-body');
  t('ตาราง "บิลที่ถูกยกเลิก" ว่างเพราะยังไม่มีการยกเลิก', /ไม่มีการยกเลิกบิล/.test(voidHtml));
  t('เจ้าของเห็นแท็บรายเดือน',
    await p.evaluate(()=>getComputedStyle(document.getElementById('report-tab-monthly')).display!=='none'));

  console.log('\n[6] ยกเลิกบิลจริงจากหน้ารายงาน');
  await p.evaluate(async ()=>{ app.showConfirm=(m,cb)=>cb();
    const id=app.state.transactions[0].id; app.openTransactionEdit(id); });
  await p.waitForTimeout(300);
  await p.evaluate(async ()=>{ await app.voidTransaction(); });
  await p.waitForTimeout(600);
  const voided = await p.evaluate(()=>({ tx:app.state.transactions.length, vl:app.state.voidLog.length,
    by:(app.state.voidLog[0]||{}).by, amount:(app.state.voidLog[0]||{}).amount }));
  t('บิลถูกลบออกจากระบบ', voided.tx===0, JSON.stringify(voided));
  t('ประวัติการยกเลิกถูกบันทึกพร้อมชื่อและยอด',
    voided.vl===1 && voided.by==='เจ้าของร้าน' && voided.amount===800, JSON.stringify(voided));
  await p.evaluate(()=>app.filterReports());
  await p.waitForTimeout(300);
  const voidHtml2 = await p.innerHTML('#report-voids-body');
  t('บิลที่ยกเลิกโผล่ในตารางประวัติทันที', /800/.test(voidHtml2) && /เจ้าของร้าน/.test(voidHtml2), voidHtml2.slice(0,200));

  console.log('\n[7] สลับเป็นพนักงาน — ด่านสิทธิ์ต้องทำงาน');
  await p.evaluate(()=>app.requireLogin());
  await p.click('#login-user-list .login-user-btn[data-uid="st-1"]');
  await p.fill('#login-pin-input', '222222');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
  t('พนักงานล็อกอินได้', await p.evaluate(()=>app.currentRole==='staff'));
  t('ถูกพากลับหน้าขายเสมอ ไม่ค้างที่หน้ารายงานของเจ้าของ',
    await p.evaluate(()=>app.state.activeScreen==='pos'));
  t('เมนูตั้งค่าและรายงานถูกซ่อน', await p.evaluate(()=>
    [...document.querySelectorAll('.nav-item[data-screen="settings"], .nav-item[data-screen="reports"]')]
      .every(e=>getComputedStyle(e).display==='none')));
  t('ปุ่มปิดร้านถูกซ่อนจากพนักงาน', await p.evaluate(()=>
    getComputedStyle(document.getElementById('btn-close-store')).display==='none'));

  console.log('\n[8] กลับเป็นเจ้าของแล้วปิดกะ');
  await p.evaluate(()=>app.requireLogin());
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
  await p.evaluate(()=>{ app.switchTab('dashboard'); });
  await p.waitForTimeout(300);
  await p.click('#btn-close-store');
  await p.waitForTimeout(400);
  // ขายไป 800 เงินสด เปิดกะ 2,500 ไม่มีค่าใช้จ่าย (ลบไปแล้ว) แต่บิลถูกยกเลิก -> เงินสดที่ควรมี = 2,500
  await p.fill('#form-cash-counter input[data-denom="1000"]', '2');
  await p.fill('#form-cash-counter input[data-denom="100"]', '5');
  await p.waitForTimeout(300);
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(900);
  const sh = await p.evaluate(()=>{ const s=app.state.shift; const last=(s.history||[])[0]; return {
    active:s.active, n:(s.history||[]).length, counted:last&&last.countedCash,
    expected:last&&last.expectedCash, diff:last&&last.difference, by:last&&last.closedBy }; });
  t('กะถูกปิดและบันทึกลงประวัติ', sh.active===false && sh.n===1, JSON.stringify(sh));
  t('บันทึกชื่อคนปิดกะ', sh.by==='เจ้าของร้าน', JSON.stringify(sh));
  t('เงินที่นับได้ = 2,500 ตามที่พิมพ์', sh.counted===2500, JSON.stringify(sh));
  t('บิลที่ถูกยกเลิกไม่ถูกนับเป็นยอดขายเงินสด (ขาด/เกิน = 0)', sh.diff===0, JSON.stringify(sh));

  console.log('\n[9] ไม่มี error หลุดออกมาระหว่างเดินทั้งวัน');
  t('ไม่มี JavaScript error เลย', errors.length===0, errors.slice(0,3).join(' | '));

  // ── เมธอดที่ถูกเรียกจริงระหว่างเดินทั้งวัน ──
  const hit = await p.evaluate(()=>[...window.__hit]);
  fs.writeFileSync(path.join(TMP, '_uihit.json'), JSON.stringify(hit));
  console.log(`\n(ระหว่างเดินทั้งวันนี้ แตะเมธอดไปทั้งหมด ${hit.length} ตัว)`);

  await b.close(); srv.close();
  console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
  process.exit(fail ? 1 : 0);
})();
