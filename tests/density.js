const { chromium } = require('playwright');
// ไฟล์นี้อยู่ในโฟลเดอร์ tests/ — ไฟล์โปรเจกต์จริงอยู่โฟลเดอร์แม่
const ROOT = require('path').resolve(__dirname, '..');

const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png'};
const srv=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f==='/')f='/index.html';
 const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
 s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(s);});
const SEED=require('./seed.js');
const EXTRA = process.env.EXTRA_CSS || '';
(async()=>{ await new Promise(r=>srv.listen(8092,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
 const sizes=[['iPad mini นอน',1024,768],['iPad 10.9 นอน',1180,820],['iPad Pro 11 นอน',1194,834],
              ['iPad Pro 12.9 ตั้ง',1024,1366],['iPad Pro 12.9 นอน',1366,1024],['โน้ตบุ๊ก 1280',1280,800],['จอ 1920',1920,1080]];
 const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-[...String(s)].length));
 console.log('\n'+pad('อุปกรณ์',20)+pad('แถบข้าง',9)+pad('ช่องบริการ',12)+pad('การ์ด/แถว',11)+pad('กว้างการ์ด',12)+pad('ตะกร้า',10)+'ชื่อบริการยาวสุด');
 console.log('─'.repeat(90));
 for (const [lbl,w,h] of sizes){
  const c=await b.newContext({viewport:{width:w,height:h},hasTouch:true}); const p=await c.newPage();
  await p.goto('http://localhost:8092/index.html',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.app&&app.state,null,{timeout:10000}); await p.evaluate(SEED);
  if (EXTRA) await p.addStyleTag({content:EXTRA});
  await p.evaluate(()=>app.switchTab('pos')); await p.waitForTimeout(300);
  const m=await p.evaluate(()=>{
    const sb=document.querySelector('.sidebar'); const grid=document.getElementById('services-grid');
    const cards=[...grid.children].filter(e=>e.classList.contains('service-card'));
    const tops=cards.map(c=>Math.round(c.getBoundingClientRect().top));
    const perRow=tops.filter(t=>t===tops[0]).length;
    const names=cards.map(c=>{const n=c.querySelector('.service-name'); return n?Math.round(n.getBoundingClientRect().height):0;});
    const lineH=parseFloat(getComputedStyle(cards[0].querySelector('.service-name')).lineHeight)||20;
    return { sb: getComputedStyle(sb).display==='none'?0:Math.round(sb.getBoundingClientRect().width),
             svcCol: Math.round(document.querySelector('.pos-services-section').getBoundingClientRect().width),
             perRow, cardW: Math.round(cards[0].getBoundingClientRect().width),
             cart: Math.round(document.getElementById('cart-panel').getBoundingClientRect().width),
             maxLines: Math.max(...names.map(n=>Math.round(n/lineH))) };});
  console.log(pad(lbl,20)+pad(m.sb+'px',9)+pad(m.svcCol+'px',12)+pad(m.perRow,11)+pad(m.cardW+'px',12)+pad(m.cart+'px',10)+m.maxLines+' บรรทัด');
  await c.close();
 }
 await b.close(); srv.close();
})();
