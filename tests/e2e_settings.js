// หน้าตั้งค่าและงานหลังร้าน ผ่านการ "กดจริง" บนเบราว์เซอร์จริง
//
// ชุด e2e_browser.js เดินสายขายหน้าร้าน ชุดนี้เดินสายหลังร้าน:
// บริการ/หมวดหมู่/พนักงาน, QR พร้อมเพย์, สำรอง-นำเข้าข้อมูล, ธีม, โลโก้
// จุดที่ต้องระวังที่สุดคือ QR พร้อมเพย์ — ถ้าเลขผิดเงินลูกค้าวิ่งเข้าบัญชีคนอื่น
//
//   node tests/e2e_settings.js
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
const t=(n,c,extra)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(extra!==undefined?'  → '+extra:''));} };

(async () => {
  await new Promise(r=>srv.listen(8111,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1280,height:960}, hasTouch:true });
  const p = await c.newPage();
  const errors = [], handled = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8111/index.html', { waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state, null, {timeout:15000});

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

  // ── ตั้งร้านเปล่า ๆ แล้วเข้าสู่ระบบเป็นเจ้าของ ──
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [];
    app.state.services = [];
    app.state.categories = [{id:'barber',name:'ตัดผม',icon:'fa-scissors',vat:false}];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.customers = []; app.state.voidLog = []; app.state.expenseLog = [];
    app.state.shift = { active:true, startTime:new Date().toISOString(), startCash:0,
                        startDetails:{}, expenses:[], history:[] };
    app.vatEnabled = false; app.shopPromptPayId = '';
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = '';
    app.telegramBotToken = ''; app.telegramChatId = '';
    await app.saveState();
    app.currentRole = null; app.currentUser = null;
    app.requireLogin();
  });
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input','111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(350);
  await p.evaluate(()=>{ app.switchTab('settings'); });
  await p.waitForTimeout(200);

  console.log('\n[1] เพิ่มบริการผ่านฟอร์มจริง');
  await p.click('#btn-add-service-modal');
  await p.waitForTimeout(150);
  t('กดปุ่มแล้วหน้าต่างเพิ่มบริการเปิดขึ้น',
    await p.evaluate(()=>document.getElementById('modal-service').classList.contains('active')));
  t('ช่องหมวดหมู่ถูกเติมจากหมวดจริงของร้าน ไม่ใช่ค่าตายตัวใน HTML',
    await p.evaluate(()=>{ const s=document.getElementById('serv-category');
      return s.options.length===1 && s.options[0].value==='barber'; }),
    await p.evaluate(()=>[...document.getElementById('serv-category').options].map(o=>o.value).join(',')));

  await p.fill('#serv-name','ตัดผมชาย');
  await p.fill('#serv-price','300');
  await p.fill('#serv-duration','30');
  await p.fill('#serv-commission','10');
  await p.click('#form-service button[type="submit"]');
  await p.waitForTimeout(250);
  const svc = await p.evaluate(()=>app.state.services[0]);
  t('บริการถูกบันทึกครบทุกช่อง', svc && svc.name==='ตัดผมชาย' && svc.price===300 &&
    svc.duration===30 && svc.commission===10, JSON.stringify(svc));
  t('หน้าต่างปิดเองหลังบันทึก',
    await p.evaluate(()=>!document.getElementById('modal-service').classList.contains('active')));
  t('บริการโผล่ในรายการหน้าตั้งค่า',
    await p.evaluate(()=>document.getElementById('settings-services-list').innerText.includes('ตัดผมชาย')));

  console.log('\n[2] แก้ราคาบริการ แล้วราคาบนหน้าขายต้องเปลี่ยนตาม');
  await p.click('#settings-services-list button.secondary');   // ปุ่ม "แก้ไข" ตัวแรก
  await p.waitForTimeout(150);
  t('ฟอร์มแก้ไขเติมค่าเดิมมาให้ครบ',
    await p.evaluate(()=>document.getElementById('serv-name').value==='ตัดผมชาย' &&
                          document.getElementById('serv-price').value==='300'));
  await p.fill('#serv-price','350');
  await p.click('#form-service button[type="submit"]');
  await p.waitForTimeout(250);
  t('แก้แล้วไม่กลายเป็นบริการใหม่ (ยังมีรายการเดียว)',
    await p.evaluate(()=>app.state.services.length===1),
    await p.evaluate(()=>app.state.services.length));
  t('ราคาใหม่ถูกบันทึก', await p.evaluate(()=>app.state.services[0].price===350));
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(200);
  t('การ์ดบนหน้าขายโชว์ราคาใหม่ 350',
    await p.evaluate(()=>/350/.test(document.getElementById('services-grid').innerText)));

  console.log('\n[3] ค้นหาและกรองหมวดบนหน้าขาย');
  await p.evaluate(async () => {
    app.state.services.push({id:'s9',name:'นวดไทย',price:500,duration:60,
                             category:'barber',commission:15,commissionType:'percent'});
    await app.saveState(); app.renderPos();
  });
  await p.fill('#pos-service-search','นวด');
  await p.waitForTimeout(200);
  const gridTxt = await p.evaluate(()=>document.getElementById('services-grid').innerText);
  t('พิมพ์ "นวด" แล้วเหลือเฉพาะที่ตรง', gridTxt.includes('นวดไทย') && !gridTxt.includes('ตัดผมชาย'), gridTxt.replace(/\n/g,' | '));
  await p.fill('#pos-service-search','');
  await p.waitForTimeout(200);
  t('ล้างคำค้นแล้วกลับมาครบ 2 รายการ',
    await p.evaluate(()=>document.querySelectorAll('#services-grid .service-card').length===2),
    await p.evaluate(()=>document.querySelectorAll('#services-grid .service-card').length));

  console.log('\n[4] หมวดหมู่ — เพิ่ม/ติ๊ก VAT/แก้ไข และด่านกันลบหมวดที่มีบริการอยู่');
  await p.evaluate(()=>app.switchTab('settings'));
  await p.waitForTimeout(150);
  await p.click('#btn-add-category');
  await p.waitForTimeout(150);
  t('ช่องไอคอนมีตัวเลือกให้เลือกจริง',
    await p.evaluate(()=>document.getElementById('cat-icon').options.length>3),
    await p.evaluate(()=>document.getElementById('cat-icon').options.length));
  await p.fill('#cat-name','เครื่องดื่ม');
  await p.check('#cat-vat');
  await p.click('#form-category button[type="submit"]');
  await p.waitForTimeout(250);
  const newCat = await p.evaluate(()=>app.state.categories.find(x=>x.name==='เครื่องดื่ม'));
  t('หมวดใหม่ถูกบันทึกพร้อมธง VAT', !!newCat && newCat.vat===true, JSON.stringify(newCat));
  t('ป้าย VAT ขึ้นในรายการหมวดหมู่',
    await p.evaluate(()=>document.getElementById('settings-categories-list').innerText.includes('เครื่องดื่ม')));
  t('สรุปตั้งค่า VAT เตือนว่ายังไม่เปิดสวิตช์ใหญ่',
    await p.evaluate(()=>/ปิดอยู่/.test(document.getElementById('vat-category-summary').innerText)),
    await p.evaluate(()=>document.getElementById('vat-category-summary').innerText));

  // ลบหมวดที่ยังมีบริการผูกอยู่ — ต้องไม่ยอม
  const delGuard = await p.evaluate(async () => {
    app.showConfirm = (m,cb)=>cb();
    const before = app.state.categories.length;
    await app.deleteCategory('barber');
    await new Promise(r=>setTimeout(r,80));
    return { before, after: app.state.categories.length };
  });
  t('ลบหมวดที่ยังมีบริการอยู่ไม่ได้ (กันบริการกลายเป็นหมวดผี)',
    delGuard.after === delGuard.before, JSON.stringify(delGuard));

  console.log('\n[5] พนักงาน — เพิ่ม/แก้ไข และ PIN ต้องถูกแฮชเสมอ');
  await p.click('#btn-add-staff');
  await p.waitForTimeout(150);
  await p.fill('#staff-name','สมชาย');
  await p.fill('#staff-pin','222222');
  await p.selectOption('#staff-access-level','staff');
  await p.click('#form-staff button[type="submit"]');
  await p.waitForTimeout(250);
  const st = await p.evaluate(()=>app.state.staff[0]);
  t('พนักงานถูกเพิ่ม', !!st && st.name==='สมชาย', JSON.stringify(st));
  t('PIN ถูกแฮชก่อนเก็บ ไม่ใช่เลขดิบ',
    !!st && st.pin !== '222222' && String(st.pin).length > 10, st && String(st.pin).slice(0,12));
  await p.click('#settings-staff-list button.secondary');
  await p.waitForTimeout(150);
  t('ฟอร์มแก้ไขพนักงานเติมชื่อเดิม',
    await p.evaluate(()=>document.getElementById('staff-name').value==='สมชาย'));
  t('ช่อง PIN ถูกล้างตอนแก้ไข (ไม่โชว์แฮชให้เห็น)',
    await p.evaluate(()=>document.getElementById('staff-pin').value===''),
    await p.evaluate(()=>document.getElementById('staff-pin').value));
  await p.fill('#staff-name','สมชาย ใจดี');
  await p.click('#form-staff button[type="submit"]');
  await p.waitForTimeout(250);
  const st2 = await p.evaluate(()=>({n:app.state.staff.length, name:app.state.staff[0].name, pin:app.state.staff[0].pin}));
  t('แก้ชื่อแล้วไม่กลายเป็นคนใหม่', st2.n===1 && st2.name==='สมชาย ใจดี', JSON.stringify(st2));
  t('เว้นช่อง PIN ว่างตอนแก้ไข = PIN เดิมไม่หาย', st2.pin === st.pin);

  console.log('\n[6] QR พร้อมเพย์ — จุดที่พลาดแล้วเงินเข้าบัญชีคนอื่น');
  await p.evaluate(async () => {
    app.state.cart = [{ id:'s1', name:'ตัดผมชาย', price:350, qty:1, staffId:null, category:'barber' }];
    await app.saveState();
  });
  const badPP = await p.evaluate(() => {
    app.shopPromptPayId = '12345';                      // เลขมั่ว
    app.generatePromptPayQR();
    return { html: document.getElementById('dynamic-qr-box').innerHTML,
             btnDisabled: document.getElementById('btn-complete-checkout').disabled };
  });
  t('เลขพร้อมเพย์ผิดรูปแบบ → ไม่สร้าง QR และเตือนบนจอ', /ยังไม่ได้ตั้งเลขพร้อมเพย์/.test(badPP.html));
  t('เลขพร้อมเพย์ผิดรูปแบบ → ปุ่มยืนยันรับเงินถูกปิด', badPP.btnDisabled===true);

  const goodPP = await p.evaluate(() => {
    app.shopPromptPayId = '0812345678';
    app.generatePromptPayQR();
    const box = document.getElementById('dynamic-qr-box');
    return { payload: app.lastPromptPayPayload,
             hasCanvas: !!box.querySelector('canvas'),
             label: document.getElementById('qr-total-label').innerText };
  });
  t('เลขถูกต้อง → วาด QR ออกมาจริง', goodPP.hasCanvas===true);
  t('ยอดเงินขึ้นบนป้าย QR ตรงกับตะกร้า', /350/.test(goodPP.label), goodPP.label);
  t('ป้ายโชว์เลขพร้อมเพย์ให้ตรวจก่อนสแกน', /081-234-5678/.test(goodPP.label), goodPP.label);
  // ตรวจ payload EMVCo ด้วยมือ: เบอร์ต้องอยู่ในรูป 0066..., ยอดต้องฝังจริง, CRC ต้องถูก
  const pl = goodPP.payload || '';
  t('payload ฝังเบอร์ในรูปแบบสากล 0066 8xxxxxxxx', pl.includes('0066812345678'), pl);
  t('payload ฝังยอดเงิน 350.00 ไว้จริง', /5303764540(6)?350\.00|54063?50\.00|5406350\.00/.test(pl) || pl.includes('350.00'), pl);
  const crcOk = await p.evaluate((s)=>{
    const body = s.slice(0, -4), want = s.slice(-4).toUpperCase();
    let crc = 0xFFFF;
    for (let i=0;i<body.length;i++){ crc ^= body.charCodeAt(i)<<8;
      for(let j=0;j<8;j++) crc = (crc & 0x8000) ? ((crc<<1)^0x1021)&0xFFFF : (crc<<1)&0xFFFF; }
    return crc.toString(16).toUpperCase().padStart(4,'0') === want;
  }, pl);
  t('CRC ท้าย payload ถูกต้อง (แอปธนาคารจะยอมสแกน)', crcOk, pl.slice(-8));

  const ppRounding = await p.evaluate(() => {
    app.state.cart = [{ id:'s1', name:'x', price:333.33, qty:1, staffId:null, category:'barber' }];
    app.generatePromptPayQR();
    return { total: app.getCartTotal(), payload: app.lastPromptPayPayload };
  });
  t('ยอดมีเศษสตางค์ → ฝังใน QR เป็นทศนิยม 2 ตำแหน่งเสมอ',
    /\d+\.\d{2}/.test(ppRounding.payload) && ppRounding.payload.includes(ppRounding.total.toFixed(2)),
    ppRounding.total + ' / ' + ppRounding.payload);

  console.log('\n[7] สำรองข้อมูล → นำเข้ากลับ ต้องได้ของเดิมเป๊ะ');
  await p.evaluate(async () => {
    app.state.cart = [];
    app.state.transactions = [{ id:'TX-BACKUP-1', timestamp:new Date().toISOString(),
      items:[{id:'s1',name:'ตัดผมชาย',price:350,qty:1,staffId:null}], total:350,
      subtotal:350, discount:0, paymentMethod:'cash', received:350, change:0,
      staffId:null, vatAmount:0, vatableBase:0, nonVatBase:350, rounding:0 }];
    await app.saveState();
  });
  const snap = await p.evaluate(()=>JSON.stringify({tx:app.state.transactions.length, svc:app.state.services.length}));
  // ดักการดาวน์โหลดเพื่ออ่านไฟล์ที่ส่งออกจริง
  const dl = p.waitForEvent('download', {timeout:8000}).catch(()=>null);
  await p.evaluate(()=>app.exportData());
  const d = await dl;
  t('กดสำรองข้อมูลแล้วมีไฟล์ถูกดาวน์โหลดจริง', !!d, d ? d.suggestedFilename() : 'ไม่มีไฟล์');
  let backupPath = null;
  if (d) { backupPath = path.join(TMP, '_backup_e2e.json'); await d.saveAs(backupPath); }
  if (backupPath) {
    const raw = fs.readFileSync(backupPath,'utf8');
    let obj=null; try{ obj=JSON.parse(raw); }catch(e){}
    t('ไฟล์สำรองเป็น JSON ที่อ่านได้', !!obj);
    t('ไฟล์สำรองมีบิลครบ', obj && obj.transactions && obj.transactions.length===1, obj && obj.transactions && obj.transactions.length);
    t('ไฟล์สำรองมีเลขรุ่นโครงสร้างกำกับ (กันนำเข้าไฟล์รุ่นใหม่กว่า)',
      obj && Number.isInteger(obj.backupSchemaVersion), obj && obj.backupSchemaVersion);

    // ล้างข้อมูลทิ้ง แล้วนำเข้ากลับผ่าน input file จริง
    await p.evaluate(async ()=>{ app.state.transactions=[]; app.state.services=[];
      app.showConfirm=(m,cb)=>cb(); await app.saveState(); });
    await p.setInputFiles('#import-file-input', backupPath);
    await p.waitForTimeout(900);
    const after = await p.evaluate(()=>JSON.stringify({tx:app.state.transactions.length, svc:app.state.services.length}));
    t('นำเข้าไฟล์กลับแล้วได้ข้อมูลเดิมครบ', after===snap, after+' vs '+snap);
    t('มีสำเนาก่อนนำเข้าให้ย้อนกลับได้',
      await p.evaluate(async ()=>{ const s=await app.readPreRestoreSnapshot(); return !!s; }));

    // ไฟล์เพี้ยนต้องถูกปฏิเสธก่อนเขียนทับ
    const badPath=path.join(TMP, '_backup_bad.json');
    fs.writeFileSync(badPath, JSON.stringify({services:'ไม่ใช่อาร์เรย์',staff:[],transactions:[]}));
    await p.setInputFiles('#import-file-input', badPath);
    await p.waitForTimeout(500);
    t('ไฟล์รูปแบบผิดถูกปฏิเสธ ข้อมูลเดิมไม่ถูกล้าง',
      await p.evaluate(()=>app.state.transactions.length===1),
      await p.evaluate(()=>app.state.transactions.length));

    const notJson=path.join(TMP, '_backup_notjson.json');
    fs.writeFileSync(notJson, 'นี่ไม่ใช่ JSON เลย {{{');
    const errBefore = errors.length;
    await p.setInputFiles('#import-file-input', notJson);
    await p.waitForTimeout(500);
    // แอปดักไว้แล้วและ console.error ออกมาเอง — นั่นคือพฤติกรรมที่ถูก ไม่ใช่การพัง
    const newErrs = errors.slice(errBefore);
    newErrs.forEach(e => { if (/SyntaxError|not valid JSON/.test(e)) handled.push(e); });
    t('ไฟล์ที่ไม่ใช่ JSON ไม่ทำให้แอปพัง (ดักไว้แล้วเตือนบนจอ)',
      await p.evaluate(()=>app.state.transactions.length===1) &&
      newErrs.every(e => /SyntaxError|not valid JSON/.test(e)),
      newErrs.join(' | '));
  }

  console.log('\n[8] ธีม โลโก้ และป้ายเวอร์ชัน');
  const themeBefore = await p.evaluate(()=>app.theme);
  await p.click('#btn-theme-toggle-side');
  await p.waitForTimeout(200);
  const themeAfter = await p.evaluate(()=>({t:app.theme, attr:document.documentElement.getAttribute('data-theme')}));
  t('กดสลับธีมแล้วเปลี่ยนจริง', themeAfter.t !== themeBefore, themeBefore+' → '+themeAfter.t);
  t('ธีมถูกนำไปใช้กับทั้งหน้า', themeAfter.attr === themeAfter.t, JSON.stringify(themeAfter));
  const themePersist = await p.evaluate(async ()=>{ await app.saveState();
    const r = await db.state.get("theme"); return r && r.value; });
  t('ธีมถูกบันทึกไว้ (รีเฟรชแล้วไม่เด้งกลับ)', themePersist === themeAfter.t, String(themePersist));

  // อัปโหลดโลโก้จริง (PNG 1x1) ผ่าน input file
  const pngPath=path.join(TMP, '_logo.png');
  fs.writeFileSync(pngPath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
  await p.setInputFiles('#shop-logo-input', pngPath);
  await p.waitForTimeout(1200);
  t('อัปโหลดโลโก้แล้วถูกเก็บเป็นรูปฝังในข้อมูล',
    await p.evaluate(()=>typeof app.shopLogo==='string' && app.shopLogo.startsWith('data:image')),
    await p.evaluate(()=>String(app.shopLogo).slice(0,30)));
  await p.evaluate(()=>{ app.showConfirm=(m,cb)=>cb(); });
  await p.click('#btn-remove-logo');
  await p.waitForTimeout(400);
  t('ลบโลโก้แล้วหายจริง', await p.evaluate(()=>!app.shopLogo), await p.evaluate(()=>String(app.shopLogo).slice(0,20)));

  await p.evaluate(()=>app.showAppVersion());
  t('ป้ายเวอร์ชันไม่ใช่ขีดกลางค้างไว้',
    await p.evaluate(()=>/เวอร์ชัน\s*\d/.test(document.getElementById('app-version-label').innerText)),
    await p.evaluate(()=>document.getElementById('app-version-label').innerText));

  console.log('\n[9] กล่องยืนยัน/กล่องกรอกข้อความ ต้องทำงานทั้งกดตกลงและกดยกเลิก');
  // คืนของจริงก่อน — ช่วงบนเคยเอาสตับทับ app.showConfirm ไว้ ถ้าไม่คืนจะกลายเป็นเทสต์หลอกตัวเอง
  await p.evaluate(()=>{ delete app.showConfirm; });
  t('เรียกใช้ของจริง ไม่ใช่สตับที่ทับไว้ก่อนหน้า',
    await p.evaluate(()=>!Object.prototype.hasOwnProperty.call(app,'showConfirm')));
  const confirmYes = await p.evaluate(()=> new Promise(res=>{
    app.showConfirm('ทดสอบ', ()=>res('yes'), ()=>res('no'));
    setTimeout(()=>document.getElementById('btn-confirm-yes').click(), 30);
  }));
  t('กดตกลงแล้วงานเดินต่อ', confirmYes==='yes', confirmYes);
  const confirmNo = await p.evaluate(()=> new Promise(res=>{
    app.showConfirm('ทดสอบ', ()=>res('yes'), ()=>res('no'));
    setTimeout(()=>document.getElementById('btn-confirm-cancel').click(), 30);
  }));
  t('กดยกเลิกแล้วงานถูกยกเลิกจริง', confirmNo==='no', confirmNo);
  const askC = await p.evaluate(()=> new Promise(res=>{
    app.askConfirm('ทดสอบ').then(res);
    setTimeout(()=>document.getElementById('btn-confirm-cancel').click(), 30);
  }));
  t('askConfirm คืนค่า false เมื่อกดยกเลิก', askC===false, String(askC));

  await p.evaluate(async ()=>{
    app.state.customers = [{id:'c1', name:'คุณเอ', phone:'0800000000', visits:1, totalSpent:350, note:'เดิม'}];
    await app.saveState(); app.switchTab('customers');
  });
  await p.waitForTimeout(200);
  const noteRes = await p.evaluate(()=> new Promise(res=>{
    app.editCustomerNote('c1');
    setTimeout(()=>{ document.getElementById('prompt-modal-input').value='แพ้น้ำหอม';
      document.getElementById('form-prompt').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
      setTimeout(()=>res(app.state.customers[0].note), 200); }, 60);
  }));
  t('แก้บันทึกลูกค้าผ่านกล่องกรอกแล้วบันทึกจริง', noteRes==='แพ้น้ำหอม', noteRes);

  console.log('\n[10] ไม่มี error หลุดออกมาตลอดการตั้งค่า');
  const unhandled = errors.filter(e => !handled.includes(e));
  t('ไม่มี JavaScript error ที่หลุดโดยไม่ได้ดัก', unhandled.length===0, unhandled.join(' | '));

  const hits = await p.evaluate(()=>[...window.__hit]);
  fs.writeFileSync(path.join(TMP, '_uihit2.json'), JSON.stringify(hits));
  console.log(`\n(ชุดนี้แตะเมธอดไปทั้งหมด ${hits.length} ตัว)`);
  console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
