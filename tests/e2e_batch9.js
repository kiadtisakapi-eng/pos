// ชุด 9 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง) — รอบตรวจ 3 (26 ก.ย. 2569)
//   [N] ช่องตัวเลขเงินเปิดแป้นตัวเลข · ส่วนลดมีทศนิยม → ยอดขึ้นว่าต้องเป็นจำนวนเต็ม และชำระไม่ได้
//   [O] เปลี่ยน PIN เจ้าของจากหน้าตั้งค่า: ไม่มีช่องที่บันทึกเองแล้ว · ปุ่ม → ถาม PIN เดิม + ใหม่ 2 รอบ (หน้าต่างอยู่บนสุด)
//   [M] ผู้จัดการปิดกะ → ต้องใส่ PIN ซ้ำ (หน้าต่างอยู่บนหน้าต่างนับเงิน) · ผิด = ไม่ปิด · ปิดแล้วไม่เด้งเปิดกะใหม่
//   [J] งานคลาวด์ที่ล้มเกิน 7 วันโผล่ในหน้าตั้งค่าพร้อมปุ่ม ลองใหม่/ทิ้งงานนี้
//
//   node tests/e2e_batch9.js
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
  await p.evaluate(() => { app.logout && app.logout(); });
  await p.waitForTimeout(300);
  await p.click(`#login-user-list .login-user-btn[data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
}

(async () => {
  await new Promise(r=>srv.listen(8129,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8129/index.html', { waitUntil:'networkidle' });
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
    app.state.cloudOutbox = [{ id:'cob-old', createdAt: Date.now()-20*86400e3, dateKeys:[], monthKeys:[], needTelegram:true, telegramMessage:'x', tries:40,
      retry:{ telegram:{ tries:40, lastTry:Date.now()-3600e3, nextAt:Date.now()+3600e3, firstFailAt:Date.now()-9*86400e3, lastError:'chat not found' } } }];
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[N] ช่องตัวเลขเงิน');
  await login(p, '__owner__', '246810');
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(300);
  const modes = await p.evaluate(() => ['cart-discount','cash-received','expense-amount','serv-price','serv-commission','edit-tx-discount','vat-rate']
    .map(id => { const el = document.getElementById(id); return el ? `${id}:${el.type}:${el.getAttribute('inputmode')}` : id + ':missing'; }));
  t('ช่องเงินทุกช่องเป็นข้อความ + แป้นตัวเลข (ไม่ใช่ type=number ที่ค่าผิดกลายเป็นว่าง = 0)', modes.every(m => /:text:numeric$/.test(m)), modes);
  await p.click('.service-card:has-text("ตัดผมชาย")');
  for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption({ index: 1 });
  await p.fill('#cart-discount', '10.5');
  await p.dispatchEvent('#cart-discount', 'input');
  await p.waitForTimeout(200);
  const totalTxt = await p.textContent('#summary-total');
  t('ส่วนลด 10.5 → ยอดบนจอบอกว่าต้องเป็นจำนวนเต็ม', /จำนวนเต็ม/.test(totalTxt), totalTxt);
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  t('ส่วนลดมีทศนิยม → หน้าชำระเงินไม่เปิด', !(await p.isVisible('#pay-cash-btn')));
  await p.fill('#cart-discount', '0');
  await p.dispatchEvent('#cart-discount', 'input');
  await p.evaluate(()=>app.clearCart());

  console.log('\n[O] เปลี่ยน PIN เจ้าของจากหน้าตั้งค่า');
  await p.evaluate(()=>app.switchTab('settings'));
  await p.waitForTimeout(300);
  t('ไม่มีช่อง PIN ที่บันทึกเองตอนออกจากช่องแล้ว · มีปุ่ม "เปลี่ยน PIN เจ้าของ"',
    await p.evaluate(()=>!document.getElementById('shop-owner-pin') && !!document.getElementById('btn-change-owner-pin')));
  await p.click('#btn-change-owner-pin');
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 });
  t('หน้าต่างถาม PIN อยู่บนสุด กดได้จริง', await onTop(p, '#prompt-modal-input'));
  t('ช่องถาม PIN ซ่อนตัวเลข', await p.evaluate(()=>document.getElementById('prompt-modal-input').type === 'password'));
  await typePrompt(p, '246810');
  await typePrompt(p, '135790');
  await typePrompt(p, '135799');   // ไม่ตรง → ถามใหม่
  await typePrompt(p, '135790');
  await typePrompt(p, '135790');
  await p.waitForTimeout(400);
  const stored = await readKey(p, 'ownerPin');
  t('PIN ใหม่ลง IndexedDB (ครั้งที่พิมพ์ไม่ตรงไม่ถูกบันทึก)', stored === await p.evaluate(()=>app.hashPin('135790')));
  t('ช่องถามกลับเป็นช่องปกติหลังใช้', await p.evaluate(()=>document.getElementById('prompt-modal-input').type !== 'password'));

  console.log('\n[J] งานคลาวด์ที่หยุดส่งแล้ว');
  await p.evaluate(()=>app.renderSyncConflicts());
  const jbox = await p.evaluate(()=>{ const el = document.getElementById('cloud-expired-jobs-box'); return el ? { vis: getComputedStyle(el).display !== 'none', html: el.innerText } : null; });
  t('กล่องงานที่หยุดส่งแล้วโชว์ พร้อมสาเหตุและปุ่ม', jbox && jbox.vis && /หยุดส่งแล้ว 1 งาน/.test(jbox.html) && /chat not found/.test(jbox.html) && /ลองใหม่/.test(jbox.html) && /ทิ้งงานนี้/.test(jbox.html), jbox);

  console.log('\n[M] ผู้จัดการปิดกะ → ถาม PIN ซ้ำ');
  await login(p, 'mg-1', '222222');
  t('ล็อกอินผู้จัดการได้', await p.evaluate(()=>app.currentRole === 'manager'));
  await p.evaluate(() => app.openCashCounter('close'));
  await p.waitForTimeout(300);
  await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '1');
  await p.dispatchEvent('#form-cash-counter .cash-qty-input[data-denom="1000"]', 'input');
  await p.click('#btn-confirm-cash-counter');
  await p.waitForSelector('#modal-prompt.active', { timeout: 5000 });
  t('หน้าต่างถาม PIN ขึ้นบนหน้าต่างนับเงิน กดได้จริง', await onTop(p, '#prompt-modal-input'));
  await typePrompt(p, '000000');
  await p.waitForTimeout(300);
  t('PIN ผิด → กะยังเปิด', await p.evaluate(()=>app.state.shift.active === true));
  await p.click('#btn-confirm-cash-counter');
  await typePrompt(p, '222222');
  await p.waitForTimeout(800);
  const sh = await readKey(p, 'shift');
  t('PIN ถูก → ปิดกะ ลง IndexedDB พร้อมชื่อคนปิด', sh && sh.active === false && sh.history.length === 1 && sh.history[0].closedBy === 'สมหญิง', sh && sh.history);
  await p.waitForTimeout(800);
  t('ปิดกะแล้วไม่เด้งหน้าต่างเปิดกะใหม่', await p.evaluate(()=>!document.getElementById('modal-cash-counter').classList.contains('active')));

  console.log('\n[V] ผู้จัดการดูรายงานได้เฉพาะวันนี้');
  await p.evaluate(async () => {
    const mk = (id, daysAgo, total, tenderAmt) => ({ id, date: new Date(Date.now() - daysAgo * 86400e3).toISOString(), customerName: 'ลูกค้า ' + id.slice(-4),
      services: ['ตัดผมชาย'], details: [{ name:'ตัดผมชาย', price:300, netPrice: total, staffId:'st-1', staffName:'สมชาย', commission:10, commissionType:'percent', commissionAmount: Math.round(total/10), category:'barber', vatable:false }],
      subtotal: 300, discount: 300 - total, vatRate: 0, nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0, total, paymentMethod: 'cash',
      tender: { method:'cash', amount: tenderAmt, received: tenderAmt, change: 0, at: Date.now() - daysAgo * 86400e3 }, staffNames:['สมชาย'], syncStatus:'synced', rev: 1 });
    app.state.transactions = [mk('TX-1790000000001-TODAYAAA', 0, 300, 300), mk('TX-1790000000002-OLDPLAIN', 3, 300, 300), mk('TX-1790000000003-OLDPENDG', 3, 200, 300)];
    await app.saveState();
  });
  await p.evaluate(()=>app.switchTab('reports'));
  await p.waitForTimeout(400);
  const rep = await p.evaluate(() => ({ disabled: document.getElementById('report-date-input').disabled,
    table: document.getElementById('report-transactions-body').innerText, box: document.getElementById('report-pending-settle-box').innerText,
    boxVis: getComputedStyle(document.getElementById('report-pending-settle-box')).display !== 'none' }));
  t('ช่องเลือกวันถูกล็อก', rep.disabled === true, rep);
  t('ตารางเห็นเฉพาะบิลวันนี้', /TODAYAAA/.test(rep.table) && !/OLDPLAIN|OLDPENDG/.test(rep.table), rep.table);
  t('กล่องบิลวันก่อนที่ค้างคืนเงินโชว์ใบที่ค้างใบเดียว', rep.boxVis && /OLDPENDG/.test(rep.box) && !/OLDPLAIN/.test(rep.box), rep.box);
  await p.click('#report-pending-settle-box button');
  await p.waitForSelector('#modal-edit-transaction.active', { timeout: 5000 });
  const m = await p.evaluate(() => ({ voidVis: document.getElementById('edit-tx-void-section').offsetParent !== null,
    saveVis: document.getElementById('btn-save-tx-edit').offsetParent !== null, cust: document.getElementById('edit-tx-customer').disabled }));
  t('เปิดบิลที่ค้างคืนเงิน: ไม่มีส่วนยกเลิกบิล/ปุ่มบันทึก · ช่องอื่นแก้ไม่ได้', !m.voidVis && !m.saveVis && m.cust, m);
  await p.evaluate(() => document.querySelector('#edit-tx-money-box button').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(150);
  t('ปุ่มบันทึกเงินส่วนต่างกดได้จริง (อยู่บนสุด)', await onTop(p, '#edit-tx-money-box button'));
  await p.click('#edit-tx-money-box button:has-text("ไม่มีเงินเคลื่อนไหว")');
  await p.waitForTimeout(300);
  await p.waitForSelector('#btn-confirm-yes', { state: 'visible', timeout: 5000 });
  await p.click('#btn-confirm-yes');
  await typePrompt(p, '222222');   // ผู้จัดการใส่ PIN ซ้ำก่อนบันทึกเงินส่วนต่าง
  await p.waitForTimeout(500);
  const settled = await p.evaluate(() => app.billMoneyStatus(app.state.transactions.find(x => x.id.endsWith('OLDPENDG'))).settled);
  t('ผู้จัดการกดบันทึก "ไม่มีเงินเคลื่อนไหว" ของบิลเก่าที่ค้างได้จริง', settled === true);
  await p.evaluate(()=>app.closeModal('modal-edit-transaction'));

  t('ไม่มี error ในหน้าเว็บ', errors.length === 0, errors);
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
