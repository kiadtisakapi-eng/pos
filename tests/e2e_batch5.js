// ชุด 5 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง) — กดปุ่ม/พิมพ์ในช่องเหมือนคนใช้
//   ข้อ 16: ขายเงินสด → แก้ส่วนลดย้อนหลัง → ระบบไม่ถือเองว่าคืนเงิน → เจ้าของกด "คืนเงินจริง" → ปิดกะ
//   ข้อ 17: บิลเก่าไม่มีรายการย่อย แก้ชื่อลูกค้าแล้วต้องไม่มีรายการ/ค่าคอมที่สร้างเองถูกบันทึก
// ทุกข้อยืนยันด้วยการอ่าน IndexedDB ตรง ๆ หลัง "รีโหลดหน้า" (ไม่ใช่ดูแค่ค่าในหน่วยความจำ)
//
//   node tests/e2e_batch5.js
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
// อ่านค่าจาก IndexedDB ตรง ๆ ไม่ผ่านแอป
const readKey = (pg, key) => pg.evaluate(({ db, key }) => new Promise(res => {
  const r = indexedDB.open(db);
  r.onsuccess = e => { const d = e.target.result;
    const q = d.transaction('state','readonly').objectStore('state').get(key);
    q.onsuccess = () => { res(q.result ? q.result.value : undefined); d.close(); };
    q.onerror = () => res('__error__'); };
  r.onerror = () => res('__error__');
}), { db: DB_NAME, key });

async function loginOwner(p) {
  if (await p.evaluate(()=>app.currentRole==='owner')) return;
  await p.evaluate(()=>app.requireLogin());
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
}

(async () => {
  await new Promise(r=>srv.listen(8123,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8123/index.html', { waitUntil:'networkidle' });
  await ready(p);
  // ── ตั้งร้าน (ออฟไลน์ล้วน ไม่ยิงเน็ตออก) ──
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [{ id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
    app.vatEnabled = false; app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    await app.saveState();
    app.requireLogin();
  });

  console.log('\n[1] ล็อกอินเจ้าของ → เปิดกะ 1,000 → ขายเงินสด 300 (รับ 500 ทอน 200)');
  await loginOwner(p);
  await p.fill('#form-cash-counter input[data-denom="1000"]', '1');
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(500);
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(300);
  await p.click('.service-card:has-text("ตัดผมชาย")');
  // เลือกผู้ให้บริการเอง (ข้อ 5 รอบ 3 — ระบบไม่ใส่คนแรกให้แล้ว)
  for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption({ index: 1 });
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  await p.click('#pay-cash-btn');
  await p.fill('#cash-received', '500');
  await p.waitForTimeout(200);
  await p.click('#btn-complete-checkout');
  await p.waitForTimeout(700);
  await p.evaluate(()=>app.closeModal('modal-receipt'));
  const txId = await p.evaluate(()=>app.state.transactions[0] && app.state.transactions[0].id);
  const tx0 = (await readKey(p, 'transactions') || [])[0];
  t('บิลลงเครื่องพร้อม "เงินที่รับจริง" 300 (รับ 500 ทอน 200)', tx0 && tx0.tender && tx0.tender.amount===300 && tx0.tender.received===500 && tx0.tender.change===200, tx0 && tx0.tender);

  console.log('\n[2] แก้ส่วนลดย้อนหลัง 100 ผ่านหน้าต่างแก้บิล → ระบบต้องไม่ถือเองว่าคืนเงิน');
  await p.evaluate(id=>app.openTransactionEdit(id), txId);
  await p.fill('#edit-tx-discount', '100');
  await p.click('#modal-edit-transaction .modal-footer button.primary');
  await p.waitForTimeout(600);
  const box1 = await p.evaluate(()=>{ const el=document.getElementById('edit-tx-money-box'); return el ? { shown: getComputedStyle(el).display!=='none', text: el.innerText } : null; });
  t('บันทึกแล้วหน้าต่างเปิดกลับมาที่ "เงินที่รับจริงของบิลนี้" พร้อมส่วนต่างที่ต้องตัดสิน',
    box1 && box1.shown && /ส่วนต่างที่ยังไม่ได้บันทึก/.test(box1.text) && /100/.test(box1.text), box1);
  t('ยอดที่ควรมีในลิ้นชักยังเป็น 1,300 (ไม่หักเองเหมือนคืนเงินแล้ว)', await p.evaluate(()=>app.computeShiftDrawer(app.state.shift).expected===1300),
    await p.evaluate(()=>app.computeShiftDrawer(app.state.shift).expected));

  console.log('\n[3] เจ้าของกด "คืน/เก็บเงินจริงตอนนี้" → ยืนยันในกล่องยืนยันจริง');
  await p.click('#edit-tx-money-box button:has-text("คืน/เก็บเงินจริงตอนนี้")');
  await p.waitForTimeout(300);
  const confirmMsg = await p.textContent('#confirm-modal-msg');
  t('กล่องยืนยันบอกจำนวนและผลต่อลิ้นชัก', /คืนเงินให้ลูกค้าแล้ว/.test(confirmMsg) && /ลิ้นชัก/.test(confirmMsg), confirmMsg);
  await p.click('#btn-confirm-yes');
  await p.waitForTimeout(700);
  t('หน้าต่างแสดงว่าบันทึกส่วนต่างครบแล้ว', await p.evaluate(()=>/บันทึกครบแล้ว/.test(document.getElementById('edit-tx-money-box').innerText)));
  await p.evaluate(()=>app.closeModal('modal-edit-transaction'));

  console.log('\n[4] รีโหลดหน้า → อ่าน IndexedDB ตรง ๆ');
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
  await p.waitForTimeout(500);
  const txs = await readKey(p, 'transactions');
  const sh = await readKey(p, 'shift');
  const b1 = txs.find(x => x.id === txId);
  t('บิลในเครื่อง: ยอด 200 · เงินรับจริง 300 คงเดิม · มีรายการคืนเงินสด −100',
    b1 && b1.total===200 && b1.tender.amount===300 && b1.settlements && b1.settlements[0].amount===-100 && b1.settlements[0].kind==='refund', b1);
  t('กะที่เปิดอยู่มีรายการเงินออก −100 ของบิลนี้', sh && sh.cashAdjustments && sh.cashAdjustments.length===1 && sh.cashAdjustments[0].billId===txId, sh && sh.cashAdjustments);

  console.log('\n[5] ปิดกะด้วยการนับเงินจริง 1,200');
  await loginOwner(p);
  await p.evaluate(()=>{ app.closeModal('modal-cash-counter'); app.openCashCounter('close'); });
  await p.waitForTimeout(300);
  const exp = await p.textContent('#closing-expected-total');
  t('หน้าปิดกะ: ยอดที่ควรมี ฿1,200 (1,000 + รับจริง 300 − คืน 100)', /1,200/.test(exp), exp);
  t('หน้าปิดกะแสดงบรรทัดคืน/เก็บเงินส่วนต่าง', await p.evaluate(()=>getComputedStyle(document.getElementById('closing-expected-adjust-row')).display!=='none'));
  await p.fill('#form-cash-counter input[data-denom="1000"]', '1');
  await p.fill('#form-cash-counter input[data-denom="100"]', '2');
  await p.waitForTimeout(200);
  const diff = await p.textContent('#closing-diff-amount');
  t('ผลต่างบนจอ = ตรงพอดี', /ตรงพอดี/.test(diff), diff);
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(900);
  const sh2 = await readKey(p, 'shift');
  const log = sh2 && sh2.history && sh2.history[sh2.history.length - 1];
  t('ประวัติกะในเครื่อง: ควรมี 1,200 · นับได้ 1,200 · ผลต่าง 0 · คืนส่วนต่าง −100',
    log && log.expectedCash===1200 && log.countedCash===1200 && log.difference===0 && log.cashAdjustTotal===-100, log);
  t('รายการเงินออกของกะเก่าไม่ติดไปกะถัดไป', sh2 && sh2.cashAdjustments===undefined, sh2 && sh2.cashAdjustments);
  await p.evaluate(()=>app.closeModal('modal-cash-counter'));

  console.log('\n[6] บิลเก่าไม่มีรายการย่อย: แก้ชื่อลูกค้า → ไม่มีรายการ/ค่าคอมที่สร้างเองลงเครื่อง');
  const LEG = 'TX-1750000000000-LEGACYE2';
  await p.evaluate(async id => {
    app.state.transactions.push({ id, date: Date.now() - 86400000 * 60, customerName:'คุณเก่า', services:['ตัดผมชาย','นวด'],
      subtotal:800, discount:80, total:720, paymentMethod:'cash', staffNames:['สมชาย'], syncStatus:'synced' });
    await app.saveState();
  }, LEG);
  await p.evaluate(id=>app.openTransactionEdit(id), LEG);
  const note = await p.textContent('#edit-tx-services-list');
  t('หน้าต่างบอกตรง ๆ ว่าไม่ทราบราคา/ค่าคอมรายบรรทัด (ไม่โชว์ตัวเลขที่เดา)', /ไม่ทราบ/.test(note) && !/฿[0-9]/.test(note), note.slice(0, 200));
  await p.fill('#edit-tx-customer', 'คุณเก่า (แก้ชื่อ)');
  await p.click('#modal-edit-transaction .modal-footer button.primary');
  await p.waitForTimeout(600);
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
  const leg = (await readKey(p, 'transactions')).find(x => x.id === LEG);
  t('หลังรีโหลด: ชื่อเปลี่ยน · ยอดเดิม 800/80/720 · ไม่มี details งอกมา',
    leg && leg.customerName==='คุณเก่า (แก้ชื่อ)' && leg.subtotal===800 && leg.discount===80 && leg.total===720 && leg.details===undefined, leg);

  t('ไม่มี JavaScript error หลุดตลอดทั้งชุด', errors.length===0, errors.join(' | '));
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
