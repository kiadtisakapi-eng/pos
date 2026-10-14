// ระบบขายสินค้า (8–9 ต.ค. 2569) — กดจริงบนเบราว์เซอร์จริง
//
//   ฟอร์มตั้งค่า: เลือกชนิด "สินค้า" → ช่องระยะเวลาหาย ช่องต้นทุนโผล่ → บันทึก
//   หน้าขาย: สินค้าค่าคอม 0 ขึ้น "ขายหน้าร้าน" ไม่มีช่องเลือกพนักงาน · สินค้ามีคอมต้องเลือกคนขาย
//   ชำระเงินด้วยปุ่มจริง → คิวมีเฉพาะบริการ → ใบเสร็จไม่มี "ผู้ดูแล" ของสินค้าขายหน้าร้าน
//   หน้ารายงาน: ตารางสินค้า (เจ้าของเห็นต้นทุน/กำไร · ผู้จัดการไม่เห็น) ไม่ล้นจอมือถือ
//   รีโหลดแล้วอ่านจาก IndexedDB: บรรทัดบิลยังจด isProduct/unitCost
//
//   node tests/e2e_products.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra!==undefined?'  → '+extra:''));} };
const PORT = 8131;

(async () => {
  await new Promise(r=>srv.listen(PORT,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  try {
  const c = await b.newContext({ viewport:{width:1280,height:960}, hasTouch:true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state, null, {timeout:15000});

  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [
      { id:'st-1', name:'สมชาย', role:'ช่าง', active:true, accessLevel:'staff', pin: await app.hashPin('222222') },
      { id:'mg-1', name:'มานี', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('333333') }];
    app.state.services = [{ id:'s1', type:'service', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{id:'barber',name:'ตัดผม',icon:'fa-scissors',vat:false},{id:'shop',name:'สินค้า',icon:'fa-bag-shopping',vat:false}];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.customers = []; app.state.voidLog = []; app.state.expenseLog = [];
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{}, expenses:[], history:[] };
    app.vatEnabled = false; app.shopPromptPayId = '';
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';   // ออฟไลน์ล้วน ไม่ยิงเน็ตออกไป
    app.telegramBotToken = ''; app.telegramChatId = '';
    await app.saveState();
    app.currentRole = null; app.currentUser = null;
    app.requireLogin();
  });
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input','111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(400);
  t('ล็อกอินเป็นเจ้าของ', await p.evaluate(()=>app.currentRole==='owner'));
  await p.evaluate(()=>app.switchTab('pos')); await p.waitForTimeout(150);
  t('ร้านที่ยังไม่มีสินค้า: หน้าขายไม่มีแถบ บริการ/สินค้า (เหมือนเดิม)', await p.evaluate(()=>getComputedStyle(document.getElementById('pos-kind-tabs')).display==='none'));

  console.log('\n[1] ฟอร์มตั้งค่า: เลือกชนิดสินค้า');
  await p.evaluate(()=>app.switchTab('settings'));
  await p.waitForTimeout(200);
  await p.click('#btn-add-service-modal');
  await p.waitForTimeout(150);
  const vis = () => p.evaluate(()=>({ dur: getComputedStyle(document.getElementById('serv-duration-group')).display !== 'none',
    cost: getComputedStyle(document.getElementById('serv-cost-group')).display !== 'none',
    name: document.getElementById('serv-name-label').innerText, title: document.getElementById('service-modal-title').innerText }));
  const v0 = await vis();
  t('เปิดฟอร์มใหม่ = ชนิดบริการ: มีช่องระยะเวลา ไม่มีช่องต้นทุน', v0.dur && !v0.cost, JSON.stringify(v0));
  await p.selectOption('#serv-type', 'product');
  await p.waitForTimeout(100);
  const v1 = await vis();
  t('เลือก "สินค้า" → ช่องระยะเวลาหาย ช่องต้นทุนโผล่ ป้ายเปลี่ยนเป็นสินค้า',
    !v1.dur && v1.cost && /ชื่อสินค้า/.test(v1.name) && /สินค้า/.test(v1.title), JSON.stringify(v1));
  t('เลือก "สินค้า" ตอนเพิ่มใหม่ → ค่าคอม 0 แบบบาทต่อชิ้น · หมวดว่าง "— เลือกหมวดของสินค้า —" (ไม่ติดหมวดแรกที่ไม่คิด VAT)',
    await p.evaluate(()=>document.getElementById('serv-commission').value==='0' && document.getElementById('serv-commission-type').value==='fixed' &&
      document.getElementById('serv-category').value==='' && /เลือกหมวดของสินค้า/.test(document.getElementById('serv-category').options[0].text)));
  await p.selectOption('#serv-type', 'service'); await p.waitForTimeout(60);
  t('สลับกลับเป็นบริการ → ค่าคอมกลับเป็น 10 % · หมวดแรกแบบเดิม', await p.evaluate(()=>document.getElementById('serv-commission').value==='10' &&
    document.getElementById('serv-commission-type').value==='percent' && document.getElementById('serv-category').value==='barber'));
  // เจ้าของพิมพ์ค่าคอมเอง (event จริงจากการพิมพ์) → สลับชนิดแล้วระบบห้ามเปลี่ยนเลขทับ
  await p.fill('#serv-commission', '15'); await p.selectOption('#serv-type', 'product'); await p.waitForTimeout(60);
  t('พิมพ์ค่าคอม 15 เองแล้วเลือกสินค้า → ยัง 15 (ไม่ถูกเปลี่ยนเป็น 0 เงียบ ๆ)', await p.evaluate(()=>document.getElementById('serv-commission').value==='15'));
  // สินค้าไม่เลือกหมวด → กดบันทึกแล้วไม่บันทึก (หน้าต่างยังเปิด)
  await p.fill('#serv-name', 'ไม่เลือกหมวด'); await p.fill('#serv-price', '30'); await p.fill('#serv-commission', '0');
  await p.click('#form-service button[type="submit"]'); await p.waitForTimeout(250);
  t('สินค้าไม่ได้เลือกหมวด → กดบันทึกไม่ผ่าน · หน้าต่างยังเปิด · ไม่มีรายการใหม่ · เบราว์เซอร์บอกเป็นภาษาไทยว่าหมวดกำหนด VAT',
    await p.evaluate(()=>!app.state.services.some(s=>s.name==='ไม่เลือกหมวด') && document.getElementById('modal-service').classList.contains('active') &&
      /เลือกหมวดของสินค้าก่อน/.test(document.getElementById('serv-category').validationMessage)));
  await p.selectOption('#serv-category', 'shop'); await p.waitForTimeout(60);
  t('เลือกหมวดแล้ว → ช่องหมวดผ่านการตรวจของเบราว์เซอร์', await p.evaluate(()=>document.getElementById('serv-category').checkValidity()));
  await p.evaluate(()=>app.closeModal('modal-service'));
  await p.click('#btn-add-service-modal'); await p.waitForTimeout(150);
  await p.selectOption('#serv-type', 'product'); await p.waitForTimeout(60);
  await p.fill('#serv-name', 'น้ำเปล่า');
  await p.fill('#serv-price', '20');
  await p.fill('#serv-cost', '8');
  await p.fill('#serv-commission', '0');
  await p.selectOption('#serv-category', 'shop');
  await p.click('#form-service button[type="submit"]');
  await p.waitForTimeout(300);
  const water = await p.evaluate(()=>app.state.services.find(s=>s.name==='น้ำเปล่า'));
  t('บันทึกสินค้าด้วยปุ่มจริง: type product · ต้นทุน 8 · ระยะเวลา 0', water && water.type==='product' && water.cost===8 && water.duration===0, JSON.stringify(water));
  t('หน้าต่างปิดเอง + รายการขึ้น "สินค้า • ต้นทุน ฿8"',
    await p.evaluate(()=>!document.getElementById('modal-service').classList.contains('active') &&
      /ต้นทุน ฿8/.test(document.getElementById('settings-services-list').innerText)));
  await p.click('#btn-add-service-modal');
  await p.waitForTimeout(150);
  const v2 = await vis();
  t('เปิดฟอร์มใหม่อีกครั้ง → กลับเป็นชนิดบริการ (ไม่ค้างจากครั้งก่อน)', v2.dur && !v2.cost && await p.evaluate(()=>document.getElementById('serv-type').value==='service'), JSON.stringify(v2));
  await p.selectOption('#serv-type', 'product');
  await p.fill('#serv-name', 'เบียร์');
  await p.fill('#serv-price', '100');
  await p.fill('#serv-cost', '40');
  await p.fill('#serv-commission', '10');
  await p.selectOption('#serv-commission-type', 'fixed');
  await p.selectOption('#serv-category', 'shop');
  await p.click('#form-service button[type="submit"]');
  await p.waitForTimeout(300);
  t('บันทึกสินค้ามีค่าคอม ฿10/ชิ้น', await p.evaluate(()=>{ const s=app.state.services.find(x=>x.name==='เบียร์'); return !!s && s.commission===10 && s.commissionType==='fixed' && s.cost===40; }));
  // ค่าผิดรูปที่ค้างในช่องที่ถูกซ่อน ต้องไม่ขวางการบันทึกแบบเงียบ ๆ (ผู้ตรวจแยก 9 ต.ค. 2569)
  await p.click('#btn-add-service-modal'); await p.waitForTimeout(120);
  await p.selectOption('#serv-type', 'product'); await p.fill('#serv-cost', '7.5');
  await p.selectOption('#serv-type', 'service');
  await p.fill('#serv-name', 'นวดสลับชนิด'); await p.fill('#serv-price', '400'); await p.fill('#serv-duration', '60'); await p.fill('#serv-commission', '10');
  await p.selectOption('#serv-category', 'barber');
  await p.click('#form-service button[type="submit"]'); await p.waitForTimeout(300);
  t('พิมพ์ต้นทุน 7.5 แล้วสลับกลับเป็นบริการ → บันทึกบริการได้ (ช่องที่ซ่อนไม่ขวาง) · ไม่มีต้นทุนติดไป',
    await p.evaluate(()=>{ const s=app.state.services.find(x=>x.name==='นวดสลับชนิด'); return !!s && s.type==='service' && !('cost' in s) && !document.getElementById('modal-service').classList.contains('active'); }));
  await p.click('#btn-add-service-modal'); await p.waitForTimeout(120);
  await p.fill('#serv-duration', '5.5'); await p.selectOption('#serv-type', 'product');
  await p.fill('#serv-name', 'ถุงผ้า'); await p.fill('#serv-price', '50'); await p.fill('#serv-cost', '20'); await p.fill('#serv-commission', '0');
  await p.selectOption('#serv-category', 'shop');
  await p.click('#form-service button[type="submit"]'); await p.waitForTimeout(300);
  t('พิมพ์ระยะเวลา 5.5 แล้วสลับเป็นสินค้า → บันทึกสินค้าได้ · ระยะเวลา 0',
    await p.evaluate(()=>{ const s=app.state.services.find(x=>x.name==='ถุงผ้า'); return !!s && s.type==='product' && s.duration===0 && s.cost===20; }));
  await p.evaluate(async ()=>{ app.state.services = app.state.services.filter(x=>!['นวดสลับชนิด','ถุงผ้า'].includes(x.name)); await app.saveState(); app.renderSettingsLists(); app.renderPos(); });
  // จอเล็ก (iPhone SE) ฟอร์มชนิดสินค้ายาวขึ้น (มีหมายเหตุต้นทุน) — ทุกช่อง + ปุ่มบันทึกต้องกดถึง
  await p.setViewportSize({ width: 375, height: 667 });
  await p.click('#btn-add-service-modal');
  await p.waitForTimeout(150);
  await p.selectOption('#serv-type', 'product');
  let reach = true;
  for (const sel of ['#serv-name', '#serv-price', '#serv-cost', '#serv-commission', '#serv-category', '#form-service button[type="submit"]']) {
    try { await p.click(sel, { trial: true, timeout: 2000 }); } catch (e) { reach = false; console.log('     กดไม่ถึง: ' + sel); }
  }
  t('จอ 375×667: ฟอร์มชนิดสินค้ากดถึงทุกช่องและปุ่มบันทึก', reach);
  await p.evaluate(()=>app.closeModal('modal-service'));
  await p.setViewportSize({ width: 1280, height: 960 });

  console.log('\n[2] หน้าขาย: ขายหน้าร้าน vs คนขาย');
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(250);
  const posView = () => p.evaluate(()=>({ kind: [...document.querySelectorAll('#pos-kind-tabs .pos-kind-btn')].map(b=>b.innerText.replace(/\s+/g,' ').trim()),
    active: (document.querySelector('#pos-kind-tabs .pos-kind-btn.active')||{}).innerText,
    cards: [...document.querySelectorAll('#services-grid .service-card .service-name')].map(e=>e.innerText),
    tabs: [...document.querySelectorAll('#category-tabs .tab-btn')].map(e=>e.innerText.replace(/\s+/g,' ').trim()) }));
  const v1p = await posView();
  t('มีสินค้าแล้ว → แถบ "บริการ 1 | สินค้า 2" · เริ่มที่ฝั่งบริการ เห็นแต่ตัดผม',
    JSON.stringify(v1p.kind)==='["บริการ 1","สินค้า 2"]' && /บริการ/.test(v1p.active) && JSON.stringify(v1p.cards)==='["ตัดผมชาย"]' && /บริการทั้งหมด/.test(v1p.tabs[0]), JSON.stringify(v1p));
  await p.click('.service-card:has-text("ตัดผมชาย")');
  await p.click('#pos-kind-tabs .pos-kind-btn:has-text("สินค้า")');
  await p.waitForTimeout(150);
  const v2p = await posView();
  t('กด "สินค้า" → เห็นแต่สินค้า · แท็บหมวดเหลือ "สินค้าทั้งหมด" + หมวดสินค้า · ตะกร้าเดิมยังอยู่',
    JSON.stringify(v2p.cards.slice().sort())===JSON.stringify(['น้ำเปล่า','เบียร์'].sort()) && JSON.stringify(v2p.tabs.map(x=>x.replace(/ \d+$/,'')))==='["สินค้าทั้งหมด","สินค้า"]' &&
    await p.evaluate(()=>app.state.cart.length===1), JSON.stringify(v2p));
  t('การ์ดสินค้าบนหน้าขายขึ้นป้าย "สินค้า"', /สินค้า/.test(await p.textContent('.service-card:has-text("น้ำเปล่า")')));
  await p.click('.service-card:has-text("น้ำเปล่า")');
  await p.click('.service-card:has-text("เบียร์")');
  await p.waitForTimeout(250);
  const cart = await p.evaluate(()=>[...document.querySelectorAll('#cart-items-list .cart-item')].map(el=>({
    txt: el.querySelector('.cart-item-staff').innerText, sel: !!el.querySelector('.cart-item-staff select') })));
  t('น้ำเปล่า: "ขายหน้าร้าน · ไม่มีค่าคอม" ไม่มีช่องเลือก', cart[1] && /ขายหน้าร้าน/.test(cart[1].txt) && !cart[1].sel, JSON.stringify(cart));
  // แถวขายหน้าร้านต้องเตี้ยกว่าแถวที่มีช่องเลือกคนขาย (ตะกร้า iPad แนวนอนเห็นได้หลายแถวขึ้น)
  const rowH = await p.evaluate(()=>[...document.querySelectorAll('#cart-items-list .cart-item')].map(el=>Math.round(el.getBoundingClientRect().height)));
  t('ตะกร้า: แถวน้ำเปล่า (ขายหน้าร้าน) เตี้ยกว่าแถวเบียร์ (มีช่องคนขาย) อย่างน้อย 30px · ไม่เกิน 100px', rowH[1] + 30 <= rowH[2] && rowH[1] <= 100, JSON.stringify(rowH)); console.log('     ความสูงแถวตะกร้า: ' + JSON.stringify(rowH));
  t('เบียร์: ช่อง "คนขาย" + ตัวเลือกบอกว่ามีค่าคอม · ตัดผม: ช่องผู้ให้บริการเหมือนเดิม',
    cart[2] && cart[2].sel && /คนขาย/.test(cart[2].txt) && /มีค่าคอม/.test(cart[2].txt) && cart[0].sel && /ผู้ให้บริการ/.test(cart[0].txt), JSON.stringify(cart));
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  t('ยังไม่เลือกคนขายเบียร์/ผู้ให้บริการตัดผม → หน้าชำระเงินไม่เปิด', !(await p.isVisible('#pay-cash-btn')));
  for (const sel of await p.$$('.cart-item-staff select')) await sel.selectOption('st-1');
  await p.click('#btn-checkout');
  await p.waitForTimeout(300);
  await p.click('#pay-cash-btn');
  await p.fill('#cash-received', '500');
  await p.waitForTimeout(150);
  await p.click('#btn-complete-checkout');
  await p.waitForTimeout(700);
  const bill = await p.evaluate(()=>{ const tx=app.state.transactions[0]; const q=app.state.queue[0]; return tx && {
    total: tx.total, lines: tx.details.map(l=>[l.name, l.isProduct, l.unitCost===undefined?null:l.unitCost, l.staffId, l.commissionAmount]),
    staffNames: tx.staffNames, q: app.state.queue.length, qNames: q ? q.services.map(s=>s.name) : null }; });
  t('บิล 420 · บรรทัดจดสินค้า/ต้นทุน · น้ำไม่มีพนักงาน · เบียร์คอม 10 เข้าสมชาย',
    bill && bill.total===420 && JSON.stringify(bill.lines)===JSON.stringify([['ตัดผมชาย',false,null,'st-1',30],['น้ำเปล่า',true,8,'',0],['เบียร์',true,40,'st-1',10]]), JSON.stringify(bill));
  t('คิวมีเฉพาะตัดผม (สินค้าส่งได้ทันที)', bill && bill.q===1 && JSON.stringify(bill.qNames)==='["ตัดผมชาย"]', JSON.stringify(bill));
  const rc = await p.evaluate(()=>[...document.querySelectorAll('#modal-receipt .receipt-item-row')].map(r=>r.innerText.replace(/\s+/g,' ')));
  // ตรวจ 11 ต.ค. 2569 ข้อ 6: สินค้าที่มีคนขายขึ้น "คนขาย:" (บริการยังเป็น "ผู้ดูแล:")
  t('ใบเสร็จ: น้ำเปล่าไม่มีบรรทัดคนทำ · ตัดผม "ผู้ดูแล" · เบียร์ "คนขาย"', rc.length===3 && !/ผู้ดูแล|คนขาย/.test(rc[1]) && /ผู้ดูแล/.test(rc[0]) && /คนขาย/.test(rc[2]), JSON.stringify(rc));
  await p.evaluate(()=>app.closeModal('modal-receipt'));
  // บิลสินค้าล้วน: ไม่มีพนักงาน ไม่เข้าคิว
  await p.click('.service-card:has-text("น้ำเปล่า")');
  await p.click('.service-card:has-text("น้ำเปล่า")');
  await p.click('#btn-checkout'); await p.waitForTimeout(300);
  await p.click('#pay-cash-btn'); await p.fill('#cash-received', '40'); await p.waitForTimeout(150);
  await p.click('#btn-complete-checkout'); await p.waitForTimeout(700);
  t('บิลน้ำ 2 ขวด: ไม่ต้องเลือกใครเลย · ไม่เพิ่มคิว · ช่องพนักงานว่าง',
    await p.evaluate(()=>app.state.transactions.length===2 && app.state.queue.length===1 && app.state.transactions[1].staffNames.length===0));
  await p.evaluate(()=>app.closeModal('modal-receipt'));

  await p.click('#pos-kind-tabs .pos-kind-btn:has-text("บริการ")'); await p.waitForTimeout(120);
  await p.fill('#pos-service-search', 'เบียร์'); await p.waitForTimeout(200);
  const vs = await posView();
  t('ค้นหา "เบียร์" ขณะอยู่ฝั่งบริการ → เจอสินค้า (ค้นทุกหมวด) + บอกว่าค้นจากทุกหมวด',
    JSON.stringify(vs.cards)==='["เบียร์"]' && /จากทุกหมวด/.test(await p.textContent('#services-grid')), JSON.stringify(vs));
  await p.click('#category-tabs .tab-btn:has-text("ตัดผม")'); await p.waitForTimeout(150);
  const vt = await posView();
  t('ค้นหาค้างอยู่แล้วกดแท็บหมวด "ตัดผม" → ช่องค้นหาถูกล้าง · เห็นรายการของหมวดนั้น (ไม่ค้างผลค้นหา)',
    await p.inputValue('#pos-service-search')==='' && vt.cards.includes('ตัดผมชาย') && !vt.cards.includes('เบียร์'), JSON.stringify(vt));
  await p.fill('#pos-service-search', 'ไม่มีของนี้'); await p.waitForTimeout(150);
  t('ค้นหาไม่เจอ → "ไม่พบ … ในบริการและสินค้าทุกหมวด" + ปุ่มล้างค้นหาใช้ได้',
    /ไม่พบ "ไม่มีของนี้" ในบริการและสินค้าทุกหมวด/.test(await p.textContent('#services-grid')));
  await p.click('.pos-search-clear'); await p.waitForTimeout(150);
  t('กด "ล้างค้นหา" → ช่องว่าง · การ์ดกลับมา', await p.inputValue('#pos-service-search')==='' && (await posView()).cards.length > 0);
  await p.fill('#pos-service-search', ''); await p.waitForTimeout(120);

  console.log('\n[3] หน้ารายงาน: ตารางสินค้า');
  await p.evaluate(()=>app.switchTab('reports'));
  await p.waitForTimeout(400);
  const rep = await p.evaluate(()=>({ shown: getComputedStyle(document.getElementById('report-products-card')).display !== 'none',
    head: document.getElementById('report-products-head').innerText, body: document.getElementById('report-products-body').innerText }));
  t('เจ้าของ: การ์ดสินค้าแสดง · มีต้นทุน/กำไร', rep.shown && /ต้นทุน/.test(rep.head) && /กำไร/.test(rep.head), JSON.stringify(rep.head));
  t('น้ำเปล่า 3 ชิ้น กำไร 36 · เบียร์ 1 ชิ้น กำไร 50', /น้ำเปล่า\s+3 ชิ้น[\s\S]*36\.00/.test(rep.body) && /เบียร์\s+1 ชิ้น[\s\S]*50\.00/.test(rep.body), rep.body);
  const comm = await p.evaluate(()=>document.getElementById('report-commission-body').innerText);
  t('ตารางค่าคอมพนักงานไม่มีแถว "ไม่ได้ระบุ" จากสินค้าขายหน้าร้าน · สมชายได้ 40', !/ไม่ได้ระบุ/.test(comm) && /40/.test(comm), comm);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(250);
  t('มือถือ 390px: หน้ารายงานไม่ล้นจอแนวนอน', await p.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),
    await p.evaluate(()=>document.documentElement.scrollWidth));
  await p.setViewportSize({ width: 1280, height: 960 });

  // ผู้จัดการ: เห็นจำนวน/ยอด แต่ไม่เห็นต้นทุน/กำไร
  await p.evaluate(()=>{ app.currentRole='manager'; app.currentUser={ id:'mg-1', name:'มานี' }; app.filterReports(); });
  await p.waitForTimeout(200);
  const repM = await p.evaluate(()=>({ head: document.getElementById('report-products-head').innerText, body: document.getElementById('report-products-body').innerText,
    note: document.getElementById('report-products-note').innerText }));
  t('ผู้จัดการ: ไม่มีคอลัมน์/หมายเหตุต้นทุน-กำไร แต่ยังเห็นจำนวนชิ้น', !/ต้นทุน|กำไร/.test(repM.head + repM.note) && /3 ชิ้น/.test(repM.body), JSON.stringify(repM));
  await p.evaluate(()=>{ app.currentRole='owner'; app.currentUser={ id:'__owner__', name:'เจ้าของร้าน' }; });

  console.log('\n[4] รีโหลดแล้วอ่านจากฐานข้อมูลจริง');
  await p.reload({ waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state && app.state.transactions, null, {timeout:15000});
  await p.waitForTimeout(500);
  const persisted = await p.evaluate(()=>({ n: app.state.transactions.length,
    line: app.state.transactions[0] && app.state.transactions[0].details[1],
    svc: app.state.services.find(s=>s.name==='น้ำเปล่า') }));
  t('IndexedDB: บิล 2 ใบ · บรรทัดน้ำเปล่ายังจด isProduct/unitCost/serviceId · สินค้ายังมีต้นทุน',
    persisted.n===2 && persisted.line && persisted.line.isProduct===true && persisted.line.unitCost===8 && !!persisted.line.serviceId &&
    persisted.svc && persisted.svc.type==='product' && persisted.svc.cost===8, JSON.stringify(persisted));

  t('ไม่มี error บนหน้าเว็บตลอดการทดสอบ', errors.length===0, errors.slice(0,3).join(' | '));
  } finally { await b.close(); srv.close(); }
  console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL', e && e.stack || e); process.exit(1); });
