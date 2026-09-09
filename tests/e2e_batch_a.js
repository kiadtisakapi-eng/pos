// เทสต์เบราว์เซอร์จริงของ "รอบแก้ชุด A" (ก.ย. 2569)
//
// ทำไมต้องมีไฟล์นี้ทั้งที่ test_batch_a.js ตรวจไปแล้ว:
// เทสต์ฝั่ง node ใช้ innerHTML ที่เป็นแค่ "สตริง" ไม่มีเบราว์เซอร์มา parse และไม่มีการกดปุ่มจริง
// จึงพิสูจน์ไม่ได้เลยว่าโค้ดที่แนบมากับข้อมูล "รันหรือไม่รัน" ตอนผู้ใช้กดปุ่มนั้นจริง ๆ
// ไฟล์นี้เปิดเบราว์เซอร์จริง กดปุ่มจริง แล้วดูว่า marker ถูกเซ็ตไหม (ดู pos-testing-traps กับดักที่ 3)
//
//   node tests/e2e_batch_a.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra!==undefined?'  → '+JSON.stringify(extra).slice(0,300):''));} };

// สตริงโจมตีจริงจากรายงานผลตรวจ ก.ย. 2569 — ปิดสตริงของ onclick แล้วต่อโค้ดของตัวเอง
const EVIL_ID = "x');window.__auditMarker=1;//";

(async () => {
  await new Promise(r=>srv.listen(8113,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const page = await (await b.newContext({ viewport:{width:1280,height:960}, hasTouch:true })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://localhost:8113/index.html', { waitUntil:'networkidle' });
  await page.waitForFunction(() => window.app && window.app.state, null, { timeout:20000 });

  console.log('\n── รหัสอันตรายต้องไม่กลายเป็นโค้ดตอนกดปุ่มจริง');
  const evil = await page.evaluate((EVIL) => {
    window.__auditMarker = 0;
    app.state.categories = [{ id: EVIL, name:'หมวดปลอม', icon:'fa-tag' }];
    app.state.services = []; app.state.selectedCategory = 'all';
    app.renderPos();
    const btns = [...document.querySelectorAll('#category-tabs .tab-btn')];
    btns.forEach(x => { try { x.click(); } catch(e){} });
    return { marker: window.__auditMarker, html: document.getElementById('category-tabs').innerHTML, n: btns.length };
  }, EVIL_ID);
  t('กดปุ่มทุกอันแล้วโค้ดที่แนบมายังไม่รัน (__auditMarker = 0)', evil.marker === 0, evil.marker);
  t('HTML ที่เบราว์เซอร์ parse จริงไม่มีเพย์โหลด', !evil.html.includes('__auditMarker'), evil.html.slice(0,150));
  t('ปุ่มยังถูกวาดครบ ไม่ได้หายไปทั้งแถว', evil.n === 2, evil.n);

  console.log('\n── หมวดปกติต้องกดได้เหมือนเดิม (safeId ต้องไม่ทำให้ปุ่มตาย)');
  const good = await page.evaluate(() => {
    app.state.categories = [{ id:'barber', name:'ตัดผมชาย', icon:'fa-scissors' }];
    app.state.services = [{ id:'s1', name:'ตัดผม', price:300, category:'barber', commission:10, commissionType:'percent' }];
    app.state.selectedCategory = 'all'; app.renderPos();
    [...document.querySelectorAll('#category-tabs .tab-btn')].find(x=>x.textContent.includes('ตัดผมชาย')).click();
    return app.state.selectedCategory;
  });
  t('กดปุ่มหมวดจริง -> เปลี่ยนหมวดได้', good === 'barber', good);

  console.log('\n── ราคาที่เป็นข้อความ: กดการ์ดบริการจริงสองครั้ง');
  const cart = await page.evaluate(() => {
    app.state.staff = [{ id:'st-1', name:'เอ' }];
    app.state.services = [{ id:'s1', name:'ตัดผม', price:'300', duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.cart = []; app.renderPos();
    const card = document.querySelector('#services-grid .service-card');
    card.click(); card.click();
    return { n: app.state.cart.length, sub: app.getCartSubtotal(), type: typeof app.getCartSubtotal() };
  });
  t('กดสองครั้ง -> ตะกร้ามี 2 รายการ', cart.n === 2, cart.n);
  t('ยอดรวม = 600 และเป็นตัวเลข ไม่ใช่ "0300300"', cart.sub === 600 && cart.type === 'number', cart);

  console.log('\n── ราคาที่คิดเงินไม่ได้ ห้ามเข้าตะกร้า');
  const bad = await page.evaluate(() => {
    app.state.services = [{ id:'s-bad', name:'บริการพัง', price:'ไม่ใช่ตัวเลข', duration:30, category:'barber' }];
    app.state.cart = []; app.renderPos();
    document.querySelector('#services-grid .service-card').click();
    return app.state.cart.length;
  });
  t('กดการ์ดที่ราคาพัง -> ไม่เข้าตะกร้า', bad === 0, bad);

  console.log('\n── ปุ่มลบในตะกร้า (safeId ครอบ uniqueCartId ด้วย)');
  const rm = await page.evaluate(() => {
    app.state.services = [{ id:'s1', name:'ตัดผม', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.cart = []; app.renderPos();
    document.querySelector('#services-grid .service-card').click();
    const before = app.state.cart.length;
    const btn = document.querySelector('.remove-item-btn');
    if (btn) btn.click();
    return { before, after: app.state.cart.length, had: !!btn };
  });
  t('ปุ่มลบมีอยู่จริงและกดแล้วรายการหายจริง', rm.had && rm.before === 1 && rm.after === 0, rm);

  t('ไม่มี JS error ตลอดทั้งชุด', errors.length === 0, errors);

  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
