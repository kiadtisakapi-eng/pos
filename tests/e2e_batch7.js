// ชุด 7 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง) — กดปุ่ม/พิมพ์ในช่องเหมือนคนใช้
//   [P] ล็อกอินเจ้าของด้วย PIN ค่าเริ่มต้น 123456 → หน้าต่างตั้ง PIN ใหม่ต้องขึ้น "บน" หน้าล็อกอินและกดได้จริง
//   [E] ลงค่าใช้จ่าย "จ่ายทางอื่น" / "จ่ายจากลิ้นชัก" ผ่านฟอร์มจริง → หน้าปิดกะแยกบรรทัด
//       และค่าใช้จ่ายจากลิ้นชักที่เกินเงินในลิ้นชัก = เงินขาด (ยืนยันจาก IndexedDB หลังปิดกะ)
//
//   node tests/e2e_batch7.js
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

// ช่องที่อยู่บนสุด ณ จุดกึ่งกลางของมันจริงไหม (ไม่ได้ถูกหน้าต่างอื่นทับ = กดได้จริง)
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

(async () => {
  await new Promise(r=>srv.listen(8127,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8127/index.html', { waitUntil:'networkidle' });
  await ready(p);
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('123456');   // เครื่องใหม่/เพิ่งกู้ข้อมูล
    app.state.staff = [{ id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
    app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[P1] ล็อกอินเจ้าของด้วย 123456 → ต้องตั้ง PIN ใหม่ก่อน');
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '123456');
  await p.click('#modal-login button.primary');
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 }).catch(() => {});
  t('หน้าต่างตั้ง PIN ใหม่ขึ้นมา', await p.evaluate(() => document.getElementById('modal-prompt').classList.contains('active')));
  t('ช่องกรอก PIN อยู่บนสุด (ไม่ถูกหน้าล็อกอินทับ — กดได้จริง)', await onTop(p, '#prompt-modal-input'));
  t('ช่องกรอกเป็นแบบรหัสผ่าน (ไม่โชว์ตัวเลข)', await p.evaluate(() => document.getElementById('prompt-modal-input').type === 'password'));
  t('ยังไม่ได้สิทธิ์เจ้าของระหว่างรอตั้ง PIN', await p.evaluate(() => app.currentRole === null));
  await typePrompt(p, '654321');
  await typePrompt(p, '654321');
  await p.waitForTimeout(500);
  t('ตั้ง PIN ใหม่สำเร็จ → เข้าสู่ระบบเจ้าของ', await p.evaluate(() => app.currentRole === 'owner'));
  const savedPin = await readKey(p, 'ownerPin');
  t('PIN ใหม่ลงเครื่องจริง (IndexedDB)', savedPin === await p.evaluate(() => app.hashPin('654321')), savedPin);
  t('ช่องกรอกกลับเป็นแบบปกติหลังใช้ (ไม่ค้างเป็นรหัสผ่านไปกระทบหน้าต่างอื่น)', await p.evaluate(() => document.getElementById('prompt-modal-input').type === 'text'));

  console.log('\n[P2] รีโหลด → ล็อกอินด้วย PIN ใหม่ ไม่ถูกถามอีก');
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
  await p.waitForTimeout(400);
  await p.evaluate(() => app.requireLogin());
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '654321');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(600);
  t('เข้าสู่ระบบเจ้าของ โดยไม่มีหน้าต่างตั้ง PIN', await p.evaluate(() => app.currentRole === 'owner' && !document.getElementById('modal-prompt').classList.contains('active')));

  console.log('\n[E1] เปิดกะ 1,000 → ลงค่าใช้จ่ายผ่านฟอร์มจริง: ค่าเช่า 2,000 จ่ายทางอื่น · น้ำแข็ง 100 จากลิ้นชัก');
  await p.fill('#form-cash-counter input[data-denom="1000"]', '1');
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(500);
  await p.evaluate(() => app.switchTab('dashboard'));
  await p.waitForTimeout(300);
  const addExp = async (amount, note, source) => {
    await p.selectOption('#expense-type', 'other');
    await p.waitForTimeout(100);
    await p.fill('#expense-amount', String(amount));
    await p.fill('#expense-note', note);
    await p.selectOption('#expense-source', source);
    await p.click('#form-add-expense button[type="submit"]');
    await p.waitForTimeout(400);
  };
  t('ฟอร์มมีช่อง "จ่ายจาก" ค่าเริ่มต้นเป็นลิ้นชัก', await p.evaluate(() => document.getElementById('expense-source').value === 'drawer'));
  await addExp(2000, 'ค่าเช่า', 'other');
  t('ช่อง "จ่ายจาก" กลับเป็นลิ้นชักหลังบันทึก', await p.evaluate(() => document.getElementById('expense-source').value === 'drawer'));
  await addExp(100, 'น้ำแข็ง', 'drawer');
  const listText = await p.evaluate(() => document.getElementById('expense-list').innerText);
  t('รายการวันนี้บอกว่ารายการไหนจ่ายทางอื่น', /จ่ายทางอื่น/.test(listText), listText);
  await p.evaluate(() => app.openCashCounter('close'));
  await p.waitForTimeout(300);
  const panel = await p.evaluate(() => ({
    other: getComputedStyle(document.getElementById('closing-other-expenses-row')).display, otherAmt: document.getElementById('closing-other-expenses').innerText,
    drawer: document.getElementById('closing-expected-expenses').innerText, expected: document.getElementById('closing-expected-total').innerText }));
  t('หน้าปิดกะ: ค่าใช้จ่ายจากลิ้นชัก ฿100 · จ่ายทางอื่น ฿2,000 แยกบรรทัด · ควรมี ฿900',
    panel.other !== 'none' && /2,000/.test(panel.otherAmt) && /100\.00/.test(panel.drawer) && /900\.00/.test(panel.expected), panel);
  await p.evaluate(() => app.closeModal('modal-cash-counter'));

  console.log('\n[E2] ลงค่าใช้จ่ายจากลิ้นชักอีก 1,500 (เกินเงินในลิ้นชัก 600) → ปิดกะนับได้ 0');
  await addExp(1500, 'ซ่อมแอร์', 'drawer');
  await p.evaluate(() => app.openCashCounter('close'));
  await p.waitForTimeout(300);
  await p.fill('#form-cash-counter input[data-denom="1000"]', '0');
  await p.waitForTimeout(200);
  const panel2 = await p.evaluate(() => ({
    over: getComputedStyle(document.getElementById('closing-overspend-row')).display, overAmt: document.getElementById('closing-overspend').innerText,
    expected: document.getElementById('closing-expected-total').innerText, diff: document.getElementById('closing-diff-amount').innerText,
    notes: document.getElementById('closing-money-notes').innerText }));
  t('หน้าปิดกะ: ควรมี ฿0 · บรรทัด "ค่าใช้จ่ายเกินเงินในลิ้นชัก" ฿600', panel2.over !== 'none' && /600/.test(panel2.overAmt) && /฿0\.00/.test(panel2.expected), panel2);
  t('ผลต่างขึ้น "เงินขาด" 600 (เดิมขึ้น "เงินเกิน")', /-600.*เงินขาด/.test(panel2.diff), panel2.diff);
  t('มีคำอธิบายให้แก้รายการที่จ่ายด้วยเงินอื่นก่อนปิดกะ', /จ่ายทางอื่น/.test(panel2.notes), panel2.notes);
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(800);
  const sh = await readKey(p, 'shift');
  const log = sh && sh.history && sh.history[sh.history.length - 1];
  t('ประวัติกะใน IndexedDB: ควรมี 0 · ผลต่าง −600 · ค่าใช้จ่ายเกินลิ้นชัก 600 · จ่ายทางอื่น 2,000',
    log && log.expectedCash === 0 && log.difference === -600 && log.overspend === 600 && log.otherExpensesTotal === 2000, log);

  t('ไม่มี error ในหน้าเว็บ', errors.length === 0, errors);
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
