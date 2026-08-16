// สแกนหน้าจอหลายขนาด หาจุดที่เลย์เอาต์พัง — ใช้ไฟล์จริงของโปรเจกต์
const { chromium } = require('playwright');
// ไฟล์นี้อยู่ในโฟลเดอร์ tests/ — ไฟล์โปรเจกต์จริงอยู่โฟลเดอร์แม่
const ROOT = require('path').resolve(__dirname, '..');
const SHOTDIR = require('path').join(ROOT,'shots');

const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((req,res)=>{ let f=decodeURIComponent(req.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f);
  if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(res); });

const SIZES = [
  ['iPhone 13 แนวตั้ง',            390, 844,  true],
  ['iPhone 13 แนวนอน',             844, 390,  true],
  ['iPad mini แนวตั้ง',            768, 1024, true],
  ['iPad mini แนวนอน',            1024, 768,  true],
  ['iPad 10.9" แนวตั้ง',           820, 1180, true],
  ['iPad 10.9" แนวนอน',           1180, 820,  true],
  ['iPad Pro 11" แนวตั้ง',         834, 1194, true],
  ['iPad Pro 11" แนวนอน',         1194, 834,  true],
  ['iPad Pro 12.9" แนวตั้ง',      1024, 1366, true],
  ['iPad Pro 12.9" แนวนอน',       1366, 1024, true],
  ['โน้ตบุ๊ก 1366x768',           1366, 768,  false],
  ['โน้ตบุ๊ก 1280x800',           1280, 800,  false],
  ['จอ 1920x1080',                1920, 1080, false],
];
const SCREENS = ['dashboard','pos','queue','customers','reports','settings'];

const SEED = () => {
  const now = Date.now();
  app.state.staff = [
    { id:'st-1', name:'สมชาย ใจดี', role:'ช่างตัดผมอาวุโส', active:true, accessLevel:'staff', pin:null },
    { id:'st-2', name:'มาลี รักงาม', role:'พนักงานนวดแผนไทย', active:true, accessLevel:'staff', pin:null },
    { id:'st-3', name:'ประสิทธิ์ มือทอง', role:'ช่างตัดผม', active:true, accessLevel:'manager', pin:null }
  ];
  app.state.customers = [
    { id:'c-1', name:'คุณอนันต์ วรรณกิจโสภณ', phone:'0812345678', visitCount:12, tier:'แพลทินัม (Platinum)', note:'ชอบตัดสั้นด้านข้าง' },
    { id:'c-2', name:'คุณสุดา', phone:'0898765432', visitCount:6, tier:'ทอง (Gold)', note:'ไม่มี' }
  ];
  app.state.shift = { active:true, startTime: now - 3*3600e3, startCash:3000, startDetails:{1000:3},
                      expenses:[{id:'e1',type:'supply',amount:350,note:'ซื้อของอื่นๆ: น้ำยาสระผม',time:now-3600e3}], history:[] };
  app.state.transactions = [];
  for (let i=0;i<14;i++){
    app.state.transactions.push({
      id:'TX-'+(now-i*600000)+'-DEMO'+i, date: now - i*600000,
      customerName: i%3===0?'คุณอนันต์ วรรณกิจโสภณ':'ลูกค้าทั่วไป (Walk-in)',
      services:['นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส'],
      details:[{name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส',price:1000,netPrice:1000,staffId:'st-2',staffName:'มาลี รักงาม',
                commission:20,commissionType:'percent',commissionAmount:200,category:'premium',vatable:false}],
      subtotal:1000, discount:0, vatRate:0, nonVatBase:1000, vatableBase:0, vatAmount:0, rounding:0,
      total:1000, paymentMethod: i%2?'cash':'promptpay', staffNames:['มาลี รักงาม'], syncStatus:'synced'
    });
  }
  app.state.queue = [
    { id:'q1', customerName:'คุณอนันต์ วรรณกิจโสภณ', status:'waiting',  startTime:null, totalDuration:120, totalAmount:1000,
      services:[{name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส',price:1000,staffId:'st-2',staffName:'มาลี รักงาม'}] },
    { id:'q2', customerName:'ลูกค้าทั่วไป (Walk-in)', status:'serving', startTime: now-1800e3, totalDuration:90, totalAmount:600,
      services:[{name:'นวดน้ำมันอโรมาอุ่นบำบัด',price:600,staffId:'st-1',staffName:'สมชาย ใจดี'}] }
  ];
  app.state.cart = [
    { uniqueCartId:'k1', id:'s9', name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส', price:1000, duration:120,
      commission:20, commissionType:'percent', category:'premium', staffId:'st-2', staffName:'มาลี รักงาม' },
    { uniqueCartId:'k2', id:'s1', name:'ตัดผมชายสไตล์วินเทจ', price:300, duration:45,
      commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย ใจดี' }
  ];
  app.currentRole='owner'; app.currentUser={id:'__owner__',name:'เจ้าของร้าน'};
  app.clearDateKeyCache();
  ['modal-login','modal-cash-counter'].forEach(m=>app.closeModal(m));
  app.updateUserRoleUI();
};

const AUDIT = (screenName) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { overflowX: document.documentElement.scrollWidth - vw, tooWide: [], tinyTap: [], clipped: [], tinyText: [] };
  const nameOf = el => (el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\s+/).slice(0,2).join('.') : '')).slice(0,60);
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0'; };
  const inActiveScreen = el => el.closest('.screen') ? el.closest('.screen').classList.contains('active') : true;

  document.querySelectorAll('.screen.active *').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1.5 || r.left < -1.5) out.tooWide.push({ el: nameOf(el), left: Math.round(r.left), right: Math.round(r.right) });
  });
  // ปุ่ม/ช่องกรอกที่เล็กเกินกว่านิ้วจะกดโดน (มาตรฐาน Apple = 44px)
  document.querySelectorAll('.screen.active button, .screen.active select, .screen.active input, .bottom-nav-item, .nav-item, .tab-btn, .btn-small').forEach(el => {
    if (!vis(el) || !inActiveScreen(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 32) out.tinyTap.push({ el: nameOf(el), w: Math.round(r.width), h: Math.round(r.height) });
  });
  document.querySelectorAll('.screen.active *').forEach(el => {
    if (!vis(el)) return;
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (fs < 11 && el.textContent.trim().length > 2 && el.children.length === 0) out.tinyText.push({ el: nameOf(el), size: fs.toFixed(1) });
  });
  const dedupe = a => [...new Map(a.map(x=>[x.el,x])).values()].slice(0,6);
  return { screen: screenName, vw, vh, overflowX: out.overflowX,
           tooWide: dedupe(out.tooWide), tinyTap: dedupe(out.tinyTap), tinyText: dedupe(out.tinyText),
           sidebarVisible: getComputedStyle(document.querySelector('.sidebar')).display !== 'none',
           bottomNavVisible: getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none',
           sidebarOverflows: (() => { const sb=document.querySelector('.sidebar');
             return getComputedStyle(sb).display!=='none' && sb.scrollHeight > sb.clientHeight + 2; })(),
           pageScrollH: document.documentElement.scrollHeight };
};

(async () => {
  if (process.env.SHOT) fs.mkdirSync(SHOTDIR,{recursive:true});
  await new Promise(r => srv.listen(8097, r));
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const results = [];
  for (const [label, w, h, touch] of SIZES) {
    const ctx = await browser.newContext({ viewport:{width:w,height:h}, hasTouch:touch, isMobile:false, deviceScaleFactor:2 });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8097/index.html', { waitUntil:'networkidle' });
    await page.waitForFunction(()=>window.app && app.state, null, {timeout:10000});
    await page.evaluate(SEED);
    await page.waitForTimeout(300);
    for (const sc of SCREENS) {
      await page.evaluate((s)=>{ app.switchTab(s); }, sc);
      await page.waitForTimeout(250);
      const a = await page.evaluate(AUDIT, sc);
      a.device = label; results.push(a);
      if (process.env.SHOT && sc === process.env.SHOT)
        await page.screenshot({ path:`shots/${label.replace(/[^\wก-๙]/g,'_')}_${sc}.png`, fullPage:false });
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(ROOT,'responsive-result.json'), JSON.stringify(results,null,1));

  const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-[...String(s)].length));
  console.log('\n' + pad('อุปกรณ์',26)+pad('ขนาด',12)+pad('แถบเมนู',10)+'ล้นแนวนอน  จุดที่ล้นจอ  ปุ่มเล็กเกิน  ตัวหนังสือจิ๋ว');
  console.log('─'.repeat(104));
  const byDev = {};
  results.forEach(r=>{ const k=r.device; byDev[k]=byDev[k]||{ov:0,tw:0,tt:0,tx:0,sb:r.sidebarVisible,bn:r.bottomNavVisible,vw:r.vw,vh:r.vh,sbo:false};
    byDev[k].ov=Math.max(byDev[k].ov,r.overflowX); byDev[k].tw+=r.tooWide.length; byDev[k].tt+=r.tinyTap.length; byDev[k].tx+=r.tinyText.length;
    byDev[k].sbo = byDev[k].sbo || r.sidebarOverflows; });
  Object.entries(byDev).forEach(([k,v])=>{
    const nav = v.sb ? (v.sbo?'ข้าง(ล้น!)':'ข้าง') : (v.bn?'ล่าง':'ไม่มี!');
    console.log(pad(k,26)+pad(v.vw+'x'+v.vh,12)+pad(nav,10)+pad(v.ov>1?('⚠️ '+v.ov+'px'):'-',11)+pad(v.tw||'-',13)+pad(v.tt||'-',14)+(v.tx||'-'));
  });
})();
