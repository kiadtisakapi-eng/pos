// ช่วงบูตแอปและปุ่มที่เหลือ — ดักเมธอดตั้งแต่ก่อนแอปเริ่มทำงาน
//
// สองชุดก่อนหน้าติดตัวนับ "หลัง" แอปบูตเสร็จแล้ว จึงพิสูจน์ไม่ได้ว่า init/initEventListeners
// ทำงานจริงหรือแค่ไม่มีใครเรียก ชุดนี้แทรกตัวนับก่อน app.js จะรัน แล้วดูว่าอะไรถูกเรียกตอนเปิดแอป
//
//   node tests/e2e_boot.js
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
  await new Promise(r=>srv.listen(8112,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1280,height:960}, hasTouch:true });

  // ดักตั้งแต่ก่อนสคริปต์ของแอปจะรัน: รอให้ window.app ถูกเซ็ต แล้วห่อ prototype ทันที
  // ใช้ setter บน window.app เพราะ app.js เขียน window.app ก่อน DOMContentLoaded → init()
  await c.addInitScript(() => {
    window.__hit = new Set();
    let _app;
    Object.defineProperty(window, 'app', {
      configurable: true,
      get(){ return _app; },
      set(v){
        _app = v;
        try {
          const proto = Object.getPrototypeOf(v);
          Object.getOwnPropertyNames(proto).forEach(n => {
            if (n === 'constructor' || typeof proto[n] !== 'function') return;
            const fn = proto[n];
            Object.defineProperty(proto, n, { configurable:true, writable:true,
              value: function(...a){ window.__hit.add(n); return fn.apply(this, a); } });
          });
        } catch(e){ window.__wrapErr = String(e); }
      }
    });
  });

  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8112/index.html', { waitUntil:'networkidle' });
  await p.waitForFunction(()=>window.app && app.state, null, {timeout:15000});
  await p.waitForTimeout(1200);   // ให้ init() เดินจนจบ

  console.log('\n[1] ตอนเปิดแอป อะไรทำงานบ้างจริง ๆ');
  const boot = await p.evaluate(()=>[...window.__hit]);
  t('ตัวห่อทำงานได้ ไม่พังตอนบูต', !(await p.evaluate(()=>window.__wrapErr)),
    await p.evaluate(()=>window.__wrapErr));
  ['init','initEventListeners','loadState','applyTheme','startIdleWatch',
   'registerServiceWorker','requestPersistentStorage','showAppVersion']
    .forEach(n => t(`${n}() ถูกเรียกตอนเปิดแอปจริง`, boot.includes(n), boot.length+' เมธอดถูกเรียก'));

  console.log('\n[2] ปุ่มที่เหลือบนหน้าจอ');
  await p.evaluate(async () => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [];
    app.state.categories = [{id:'barber',name:'ตัดผม',icon:'fa-scissors',vat:false},
                            {id:'massage',name:'นวด',icon:'fa-spa',vat:false}];
    app.state.services = [
      {id:'s1',name:'ตัดผมชาย',price:300,duration:30,category:'barber',commission:10,commissionType:'percent'},
      {id:'s2',name:'นวดไทย',price:500,duration:60,category:'massage',commission:10,commissionType:'percent'}];
    app.state.transactions=[]; app.state.cart=[]; app.state.queue=[];
    app.state.voidLog=[]; app.state.expenseLog=[]; app.state.customers=[];
    app.state.shift={active:true,startTime:new Date().toISOString(),startCash:0,startDetails:{},expenses:[],history:[]};
    app.googleSheetsUrl=''; app.googleSheetsApiToken='';
    app.telegramBotToken=''; app.telegramChatId='';
    await app.saveState();
    app.currentRole=null; app.currentUser=null; app.requireLogin();
  });
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input','111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(400);

  // แท็บหมวดบนหน้าขาย
  await p.evaluate(()=>app.switchTab('pos'));
  await p.waitForTimeout(250);
  const tabs = await p.evaluate(()=>[...document.querySelectorAll('#category-tabs .tab-btn')].map(e=>e.innerText.trim()));
  t('แท็บหมวดถูกสร้างจากหมวดจริงของร้าน', tabs.length>=3, JSON.stringify(tabs));
  await p.click('#category-tabs .tab-btn:nth-child(3)');   // หมวดที่สอง (ตัวแรกคือ "ทั้งหมด")
  await p.waitForTimeout(250);
  const filtered = await p.evaluate(()=>({
    sel: app.state.selectedCategory,
    txt: document.getElementById('services-grid').innerText }));
  t('กดแท็บหมวดแล้วกรองบริการจริง',
    filtered.txt.includes('นวดไทย') && !filtered.txt.includes('ตัดผมชาย'),
    JSON.stringify(filtered));

  // แจ้งเตือน Telegram — ดักไม่ให้ยิงเน็ตจริง
  await p.evaluate(()=>{
    window.__tg = [];
    window.fetch = async (url, opt) => { window.__tg.push({url:String(url), opt});
      return { ok:true, status:200, json: async()=>({ok:true}), text: async()=>'{"ok":true}' }; };
    app.telegramToken='111:AAA'; app.telegramChatId='-100123';
  });
  await p.evaluate(()=>app.switchTab('settings'));
  await p.waitForTimeout(200);
  await p.fill('#shop-telegram-token','111:AAA');
  await p.fill('#shop-telegram-chatid','-100123');
  await p.click('button[onclick="app.testTelegramNotification()"]');
  await p.waitForTimeout(600);
  const tg = await p.evaluate(()=>window.__tg);
  t('กดปุ่มทดสอบ Telegram แล้วยิงคำขอออกไปจริง', tg.length>0, JSON.stringify(tg).slice(0,120));
  t('ยิงไปที่ api.telegram.org และแนบ chat id ที่ตั้งไว้',
    tg.length>0 && /api\.telegram\.org/.test(tg[0].url) &&
    JSON.stringify(tg[0]).includes('-100123'), tg.length? tg[0].url : '');

  // ซิงก์สรุปยอด — ยังไม่ตั้ง URL ต้องไม่ยิงมั่ว
  const syncNoUrl = await p.evaluate(async ()=>{
    window.__tg = []; app.googleSheetsUrl=''; 
    await app.syncSummaryNow(); await new Promise(r=>setTimeout(r,200));
    return window.__tg.length; });
  t('ยังไม่ตั้ง URL ชีต → กดซิงก์แล้วไม่ยิงคำขอออกไป', syncNoUrl===0, syncNoUrl);

  // ป้ายอัปเดตแอป — และปุ่ม "อัปเดตเลย" ต้องสั่ง SW ข้ามคิวจริง
  const upd = await p.evaluate(()=> new Promise(res=>{
    app._updateBannerShown = false;
    app.promptAppUpdate({ postMessage: m => res({ shown:true, msg:m }) });
    setTimeout(()=>{
      const bar = document.getElementById('app-update-bar');
      if (!bar) return res({ shown:false });
      bar.querySelector('button').click();
    }, 60);
  }));
  t('ป้ายแจ้งอัปเดตแอปขึ้นบนจอได้', upd.shown===true, JSON.stringify(upd));
  t('กด "อัปเดตเลย" แล้วสั่ง Service Worker ข้ามคิวจริง',
    upd.msg && upd.msg.type==='SKIP_WAITING', JSON.stringify(upd.msg));
  t('เรียกซ้ำไม่ทำให้ป้ายซ้อนกันหลายอัน',
    await p.evaluate(()=>{ app.promptAppUpdate({postMessage(){}});
      return document.querySelectorAll('#app-update-bar').length<=1; }));
  await p.evaluate(()=>{ const e=document.getElementById('app-update-bar'); if(e) e.remove(); });

  // แจ้งเตือนอัตโนมัติ (ใช้ค่าที่บันทึกไว้ ไม่ใช่ค่าในช่องกรอก)
  const auto = await p.evaluate(async ()=>{
    window.__tg = [];
    app.telegramToken=''; app.telegramChatId='';
    app.sendTelegramText('ไม่ควรส่ง');
    await new Promise(r=>setTimeout(r,120));
    const silent = window.__tg.length;
    app.telegramToken='222:BBB'; app.telegramChatId='-100999';
    app.sendTelegramText('ทดสอบส่งอัตโนมัติ');
    await new Promise(r=>setTimeout(r,200));
    return { silent, sent: window.__tg.length, body: window.__tg[0] && window.__tg[0].opt && window.__tg[0].opt.body };
  });
  t('ยังไม่ตั้ง Telegram → แจ้งเตือนอัตโนมัติเงียบ ไม่ยิงมั่ว', auto.silent===0, auto.silent);
  t('ตั้งแล้ว → ส่งข้อความออกไปพร้อม chat id ที่บันทึกไว้',
    auto.sent===1 && String(auto.body).includes('-100999'), JSON.stringify(auto).slice(0,160));

  // แก้ไขหมวดหมู่ผ่านปุ่มจริง
  await p.evaluate(()=>app.switchTab('settings'));
  await p.waitForTimeout(200);
  await p.click('#settings-categories-list button.secondary');
  await p.waitForTimeout(200);
  t('กดแก้ไขหมวดแล้วฟอร์มเติมชื่อเดิมมาให้',
    await p.evaluate(()=>document.getElementById('modal-category').classList.contains('active') &&
                          document.getElementById('cat-name').value==='ตัดผม'),
    await p.evaluate(()=>document.getElementById('cat-name').value));
  await p.fill('#cat-name','ตัดผมชาย');
  await p.click('#form-category button[type="submit"]');
  await p.waitForTimeout(250);
  t('แก้ชื่อหมวดแล้วไม่กลายเป็นหมวดใหม่',
    await p.evaluate(()=>app.state.categories.length===2 && app.state.categories[0].name==='ตัดผมชาย'),
    await p.evaluate(()=>JSON.stringify(app.state.categories.map(c=>c.name))));
  t('บริการเดิมยังผูกกับหมวดเดิมอยู่ ไม่กลายเป็นหมวดผี',
    await p.evaluate(()=>app.state.services.every(sv=>app.state.categories.some(c=>c.id===sv.category))));

  // ปุ่มล็อก/สลับผู้ใช้
  await p.click('#btn-lock-sidebar');
  await p.waitForTimeout(400);
  t('กดปุ่มล็อกแล้วออกจากระบบจริง',
    await p.evaluate(()=>!app.currentRole && !app.currentUser),
    await p.evaluate(()=>String(app.currentRole)));
  t('กดล็อกแล้วเด้งหน้าเข้าสู่ระบบขึ้นมาทันที',
    await p.evaluate(()=>document.getElementById('modal-login').classList.contains('active')));

  // หน้าจอแจ้งโหลดข้อมูลไม่สำเร็จ — ทำท้ายสุดเพราะมันยึดหน้าจอทั้งหน้า
  const fatal = await p.evaluate(()=>{
    app.showFatalLoadError(new Error('ทดสอบข้อความ'));
    return document.body.innerText;
  });
  t('หน้าจอเตือน "โหลดข้อมูลไม่สำเร็จ" แสดงข้อความจริงให้คนหน้าร้านอ่านออก',
    /ไม่สำเร็จ|ไม่ได้|ผิดพลาด/.test(fatal), fatal.slice(0,120).replace(/\n/g,' | '));
  t('บอกสาเหตุจริงไว้ด้วย ไม่ใช่ข้อความลอย ๆ', fatal.includes('ทดสอบข้อความ'), fatal.slice(0,200).replace(/\n/g,' | '));

  console.log('\n[3] ไม่มี error หลุด');
  t('ไม่มี JavaScript error ตลอดการบูตและกดปุ่ม', errors.length===0, errors.join(' | '));

  const hits = await p.evaluate(()=>[...window.__hit]);
  fs.writeFileSync(path.join(TMP, '_uihit3.json'), JSON.stringify(hits));
  console.log(`\n(ชุดนี้แตะเมธอดไปทั้งหมด ${hits.length} ตัว)`);
  console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
