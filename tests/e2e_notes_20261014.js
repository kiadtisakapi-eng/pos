// หมายเหตุบิล + หมายเหตุปิดกะ (เจ้าของสั่ง 14 ต.ค. 2569) บนเบราว์เซอร์จริง — กดปุ่ม/พิมพ์ในช่องเหมือนคนใช้
//   [B] พิมพ์หมายเหตุในหน้าชำระเงิน → บิลเก็บไว้ (IndexedDB) · ช่องล้างหลังขาย · ใบเสร็จลูกค้าไม่มีหมายเหตุ
//       ช่องหมายเหตุกดถึงได้ทั้ง iPad และมือถือ · ตารางประวัติบิลเห็นหมายเหตุ · หน้าต่างแก้บิลแก้ได้ (เจ้าของ)
//   [V] ยกเลิกบิล: ไม่กรอกเหตุผล = ยกเลิกไม่ได้ · กล่องยืนยันบอกเหตุผล · ประวัติการยกเลิก (IndexedDB + ตาราง)
//   [S] ปิดกะเงินขาด: ป้ายบอก "ต้องกรอก" · ไม่กรอก = ปิดไม่ได้ · กรอกแล้วปิดได้ · ประวัติกะ (IndexedDB + ตาราง)
//
//   node tests/e2e_notes_20261014.js
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
const readKey = (pg, key) => pg.evaluate(({ db, key }) => new Promise(res => {
  const r = indexedDB.open(db);
  r.onsuccess = e => { const d = e.target.result;
    const q = d.transaction('state','readonly').objectStore('state').get(key);
    q.onsuccess = () => { res(q.result ? q.result.value : undefined); d.close(); };
    q.onerror = () => res('__error__'); };
  r.onerror = () => res('__error__');
}), { db: DB_NAME, key });
// เลื่อนช่องเข้าจอแล้วดูว่าอยู่บนสุดจริง (ไม่ถูกอะไรทับ = กดได้จริง)
const reachable = (pg, sel) => pg.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  if (r.bottom > window.innerHeight || r.top < 0 || r.right > window.innerWidth || r.left < 0) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === el || el.contains(hit);
}, sel);

async function sellOne(p, note) {
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(250);
  await p.click('.service-card:has-text("ตัดผมชาย")');
  await p.waitForTimeout(150);
  for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption({ index: 1 });
  await p.click('#btn-checkout');
  await p.waitForTimeout(250);
  await p.click('#pay-cash-btn');
  await p.fill('#cash-received', '300');
  if (note !== undefined) await p.fill('#checkout-bill-note', note);
  await p.waitForTimeout(150);
  await p.click('#btn-complete-checkout');
  await p.waitForTimeout(700);
}

(async () => {
  await new Promise(r=>srv.listen(8141,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:820}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8141/index.html', { waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state, null, {timeout:20000});
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
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
  await p.fill('#form-cash-counter input[data-denom="1000"]', '1');
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(500);
  t('(เงื่อนไข) เปิดกะ 1,000 แล้ว', await p.evaluate(()=>app.state.shift.active===true && app.state.shift.startCash===1000));

  console.log('\n[B] หมายเหตุบิลในหน้าชำระเงิน');
  const NOTE = 'ลูกค้าขอเปลี่ยนหมอ <b>';
  await sellOne(p, NOTE);
  const tx = await p.evaluate(()=>app.state.transactions.at(-1));
  t('บิลเก็บหมายเหตุตามที่พิมพ์', tx && tx.billNote === NOTE, tx && tx.billNote);
  const stored = await readKey(p, 'transactions');
  t('หมายเหตุอยู่ใน IndexedDB จริง', Array.isArray(stored) && stored.some(x => x.id === tx.id && x.billNote === NOTE));
  t('ช่องหมายเหตุว่างหลังขาย (ไม่ติดไปบิลถัดไป)', (await p.inputValue('#checkout-bill-note')) === '');
  const receipt = await p.textContent('#thermal-receipt-preview');
  t('ใบเสร็จลูกค้าขึ้นแล้ว และไม่มีหมายเหตุ', receipt.includes('300') && !receipt.includes('ลูกค้าขอเปลี่ยนหมอ'), receipt.slice(0, 120));
  await p.evaluate(()=>app.closeModal('modal-receipt'));

  // ช่องหมายเหตุกดถึงได้ทั้ง iPad แนวนอน/แนวตั้ง และมือถือ — และปุ่มยืนยันยังกดถึง
  for (const vp of [{ width:1180, height:820 }, { width:820, height:1180 }, { width:390, height:844 }]) {
    await p.setViewportSize(vp);
    await p.evaluate(()=>app.switchTab('pos'));
    await p.click('.service-card:has-text("ตัดผมชาย")');
    for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption({ index: 1 });
    await p.evaluate(()=>{ const btn=document.getElementById('btn-checkout'); btn.scrollIntoView({block:'center'}); btn.click(); });
    await p.waitForTimeout(250);
    await p.click('#pay-cash-btn');
    t(`${vp.width}×${vp.height}: ช่องหมายเหตุบิลกดถึง`, await reachable(p, '#checkout-bill-note'));
    t(`${vp.width}×${vp.height}: ปุ่มยืนยันรับชำระยังกดถึง`, await reachable(p, '#btn-complete-checkout'));
    await p.evaluate(()=>{ app.closeModal('modal-payment'); app.clearCart(); });
  }
  await p.setViewportSize({ width:1180, height:820 });

  console.log('\n[B] ประวัติบิล + แก้หมายเหตุ');
  await p.evaluate(()=>{ app.switchTab('reports'); app.filterReports(); });
  await p.waitForTimeout(300);
  const body = await p.innerHTML('#report-transactions-body');
  t('ตารางประวัติบิลเห็นหมายเหตุ (escape แล้ว)', body.includes('ลูกค้าขอเปลี่ยนหมอ &lt;b&gt;'), body.slice(0, 200));
  await p.evaluate(id=>app.openTransactionEdit(id), tx.id);
  await p.waitForTimeout(250);
  t('หน้าต่างแก้บิลโชว์หมายเหตุเดิม และเจ้าของแก้ได้',
    (await p.inputValue('#edit-tx-note')) === NOTE && !(await p.isDisabled('#edit-tx-note')));
  t('ช่องหมายเหตุในหน้าต่างแก้บิลกดถึง', await reachable(p, '#edit-tx-note'));
  await p.fill('#edit-tx-note', 'แก้แล้ว: ลูกค้าประจำ');
  await p.click('#btn-save-tx-edit');
  await p.waitForTimeout(600);
  const tx2 = await p.evaluate(id=>app.state.transactions.find(x=>x.id===id), tx.id);
  t('บันทึกการแก้หมายเหตุแล้ว · ยอดเท่าเดิม · รุ่นบิลขึ้น', tx2.billNote === 'แก้แล้ว: ลูกค้าประจำ' && tx2.total === 300 && tx2.rev === (tx.rev || 1) + 1, JSON.stringify({ n: tx2.billNote, t: tx2.total, r: tx2.rev }));

  console.log('\n[V] เหตุผลที่ยกเลิกบิล (บังคับทุกครั้ง)');
  await p.evaluate(()=>app.closeModal('modal-edit-transaction'));
  await sellOne(p);
  await p.evaluate(()=>app.closeModal('modal-receipt'));
  const vtx = await p.evaluate(()=>app.state.transactions.at(-1).id);
  await p.evaluate(id=>{ app.switchTab('reports'); app.openTransactionEdit(id); }, vtx);
  await p.waitForTimeout(250);
  t('ช่องเหตุผลที่ยกเลิกว่างตอนเปิดบิล และกดถึง', (await p.inputValue('#void-note')) === '' && await reachable(p, '#void-note'));
  await p.selectOption('#void-money-outcome', 'refunded');
  await p.click('#edit-tx-void-section button.danger');
  await p.waitForTimeout(400);
  t('ไม่กรอกเหตุผล = ยกเลิกไม่ได้ · ไม่มีกล่องยืนยันขึ้น',
    await p.evaluate(id=>app.state.transactions.some(x=>x.id===id) && !document.getElementById('modal-confirm').classList.contains('active'), vtx));
  await p.fill('#void-note', 'กดบริการผิด <u>');
  await p.click('#edit-tx-void-section button.danger');
  await p.waitForSelector('#modal-confirm.active', { timeout: 5000 });
  t('กล่องยืนยันบอกเหตุผล', /เหตุผล: กดบริการผิด/.test(await p.textContent('#confirm-modal-msg')));
  await p.click('#btn-confirm-yes');
  await p.waitForTimeout(800);
  const vlog = await readKey(p, 'voidLog');
  t('ยกเลิกแล้ว · เหตุผลอยู่ในประวัติการยกเลิก (IndexedDB)',
    Array.isArray(vlog) && vlog.some(v => v.billId === vtx && v.note === 'กดบริการผิด <u>') &&
    !(await p.evaluate(id=>app.state.transactions.some(x=>x.id===id), vtx)));
  await p.evaluate(()=>{ app.switchTab('reports'); app.filterReports(); });
  await p.waitForTimeout(300);
  t('ตาราง "บิลที่ถูกยกเลิก" เห็นเหตุผล (escape แล้ว)', (await p.innerHTML('#report-voids-body')).includes('กดบริการผิด &lt;u&gt;'));

  console.log('\n[S] หมายเหตุปิดกะ');
  await p.evaluate(()=>{ app.closeModal('modal-edit-transaction'); app.switchTab('dashboard'); });
  await p.waitForTimeout(300);
  await p.click('#btn-close-store');
  await p.waitForTimeout(400);
  await p.fill('#form-cash-counter input[data-denom="1000"]', '1');   // ควรมี 1,300 · นับได้ 1,000 → ขาด 300
  await p.dispatchEvent('#form-cash-counter input[data-denom="1000"]', 'input');
  await p.waitForTimeout(200);
  t('ป้ายบอกว่าต้องกรอกหมายเหตุ (เงินขาด)', /ต้องกรอก/.test(await p.textContent('#closing-note-required')));
  t('ช่องหมายเหตุปิดกะกดถึง', await reachable(p, '#closing-note'));
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(500);
  t('ไม่กรอกหมายเหตุ = ยังปิดกะไม่ได้ · หน้าต่างนับเงินยังเปิดอยู่',
    await p.evaluate(()=>app.state.shift.active===true && document.getElementById('modal-cash-counter').classList.contains('active')));
  await p.fill('#closing-note', 'ทอนเงินผิดให้ลูกค้า');
  await p.click('#btn-confirm-cash-counter');
  await p.waitForTimeout(900);
  const shift = await readKey(p, 'shift');
  const last = shift && shift.history && shift.history.at(-1);
  t('กรอกแล้วปิดกะได้ · ประวัติกะใน IndexedDB มีหมายเหตุ', shift && shift.active === false && last && last.closeNote === 'ทอนเงินผิดให้ลูกค้า' && last.difference === -300,
    JSON.stringify(last && { n: last.closeNote, d: last.difference }));
  await p.evaluate(()=>{ app.switchTab('reports'); app.filterReports(); });
  await p.waitForTimeout(300);
  t('ตารางประวัติกะเห็นหมายเหตุ', (await p.innerHTML('#report-shifts-body')).includes('ทอนเงินผิดให้ลูกค้า'));

  // เปิดหน้านับเงินเปิดกะ — ช่องหมายเหตุปิดกะต้องไม่โผล่ และต้องว่าง (ไม่ค้างจากกะก่อน)
  await p.evaluate(()=>app.openCashCounter('open'));
  await p.waitForTimeout(250);
  t('หน้าเปิดกะไม่มีช่องหมายเหตุปิดกะให้เห็น', !(await p.isVisible('#closing-note')));
  t('ช่องหมายเหตุปิดกะถูกล้าง', (await p.inputValue('#closing-note')) === '');

  t('ไม่มี JavaScript error', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
