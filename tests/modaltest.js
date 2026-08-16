const { chromium } = require('playwright');
// ไฟล์นี้อยู่ในโฟลเดอร์ tests/ — ไฟล์โปรเจกต์จริงอยู่โฟลเดอร์แม่
const ROOT = require('path').resolve(__dirname, '..');

const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png'};
const srv=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f==='/')f='/index.html';
 const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
 s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(s);});
const SEED=require('./seed.js');
const MODALS=[['modal-cash-counter','นับเงินเปิด/ปิดกะ'],['modal-payment','ชำระเงิน'],['modal-receipt','ใบเสร็จ'],
              ['modal-staff','เพิ่มพนักงาน'],['modal-service','เพิ่มบริการ'],['modal-edit-transaction','แก้ไขบิล'],['modal-login','เข้าสู่ระบบ']];
(async()=>{ await new Promise(r=>srv.listen(8090,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
 const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-[...String(s)].length));
 const sizes=[['iPhone ตั้ง',390,844],['iPhone นอน',844,390],['iPad mini ตั้ง',768,1024],['iPad mini นอน',1024,768],['iPad 10.9 นอน',1180,820],['โน้ตบุ๊ก',1280,800]];
 console.log('\n'+pad('หน้าต่าง',24)+sizes.map(s=>pad(s[0],15)).join(''));
 console.log('─'.repeat(24+15*sizes.length));
 const grid={};
 for (const [lbl,w,h] of sizes){
  const c=await b.newContext({viewport:{width:w,height:h},hasTouch:true}); const p=await c.newPage();
  await p.goto('http://localhost:8090/index.html',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.app&&app.state,null,{timeout:10000}); await p.evaluate(SEED);
  for (const [id,name] of MODALS){
    const r=await p.evaluate(async(id)=>{
      if(id==='modal-cash-counter'){app.cashCounterMode='close';app.openCashCounter('close');}
      else if(id==='modal-receipt'){app.showThermalReceipt(app.state.transactions[0]);}
      else if(id==='modal-edit-transaction'){app.openTransactionEdit(app.state.transactions[0].id);}
      else if(id==='modal-payment'){app.openCheckoutModal(); app.selectPaymentMethod('cash');}
      else app.openModal(id);
      await new Promise(r=>setTimeout(r,250));
      const ov=document.getElementById(id); const card=ov.querySelector('.modal-card');
      if(!card) return {err:1};
      const cb=card.getBoundingClientRect();
      const scrollable = card.scrollHeight>card.clientHeight+2 || [...card.querySelectorAll('*')].some(e=>e.scrollHeight>e.clientHeight+2&&getComputedStyle(e).overflowY!=='visible');
      // ปุ่มยืนยันของหน้าต่างนี้ กดถึงจริงไหม (เลื่อนลงสุดแล้วยังอยู่ในจอ)
      card.scrollTop = card.scrollHeight; await new Promise(r=>setTimeout(r,120));
      const btns=[...card.querySelectorAll('button')].filter(x=>x.offsetParent!==null);
      const last=btns[btns.length-1];
      const reach = last ? (()=>{const r=last.getBoundingClientRect(); return r.top>=-1 && r.bottom<=innerHeight+1;})() : true;
      const res={ tooTall: cb.height>innerHeight+1, top:Math.round(cb.top), bottom:Math.round(cb.bottom), vh:innerHeight,
                  cutTop: cb.top<-1, cutBottom: cb.bottom>innerHeight+1, scrollable, reach,
                  wide: cb.right>innerWidth+1||cb.left<-1 };
      app.closeModal(id); return res;
    },id);
    const bad = r.err? 'n/a' : (!r.reach ? '❌กดปุ่มไม่ถึง' : ((r.cutTop||r.cutBottom||r.wide) ? '⚠️ตกขอบ' : '✅'));
    grid[name]=grid[name]||{}; grid[name][lbl]=bad;
  }
  await c.close();
 }
 MODALS.forEach(([id,name])=>console.log(pad(name,24)+sizes.map(s=>pad(grid[name][s[0]]||'-',15)).join('')));
 await b.close(); srv.close();
})();
