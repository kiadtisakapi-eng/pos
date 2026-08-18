// กันบั๊ก 2 ตัวที่เคยหลุดออกไป (ส.ค. 2569) — ทั้งคู่เกิดจากของที่เพิ่งเพิ่มเข้าไปเอง
//   1) auto-logout 5 นาที ทำให้กล่องล็อกอินไปซ้อน "ใต้" หน้าต่างที่เปิดค้างอยู่ → กด PIN ไม่ได้ ค้างทั้งเครื่อง
//   2) เพดานความสูงของหน้าต่าง (ที่ใส่ไว้กันปุ่มตกขอบ) เผลอมีผลตอนพิมพ์ด้วย → ใบเสร็จยาวถูกตัดท้าย
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png'};
const srv=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f==='/')f='/index.html';
 const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
 s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(s);});
const SEED=require('./seed.js');
let pass=0,fail=0;
const check=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x?'  → '+x:''));} };

(async()=>{ await new Promise(r=>srv.listen(8088,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
 const c=await b.newContext({viewport:{width:1180,height:820},hasTouch:true}); const p=await c.newPage();
 await p.goto('http://localhost:8088/index.html',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>window.app&&app.state,null,{timeout:10000}); await p.evaluate(SEED);

 console.log('\n[1] เจ้าของถูกเตะออกตอนหน้าต่างอื่นเปิดค้าง — ต้องยังล็อกอินกลับเข้ามาได้');
 for (const [openWhat, label] of [['pay','หน้าต่างชำระเงิน'],['cash','หน้าต่างนับเงินปิดกะ'],['edit','หน้าต่างแก้ไขบิล']]) {
   const r=await p.evaluate(async(w)=>{
     document.querySelectorAll('.modal-overlay.active').forEach(e=>app.closeModal(e.id));
     app.currentRole='owner'; app.currentUser={id:'__owner__',name:'เจ้าของร้าน'};
     app.switchTab('pos');
     if(w==='pay'){ app.openCheckoutModal(); app.selectPaymentMethod('cash'); }
     if(w==='cash'){ app.openCashCounter('close'); }
     if(w==='edit'){ app.openTransactionEdit(app.state.transactions[0].id); }
     await new Promise(r=>setTimeout(r,250));
     app._lastActivityTs = Date.now() - 10*60*1000;
     app.checkIdleTimeout();
     await new Promise(r=>setTimeout(r,300));
     const pin=document.getElementById('login-pin-input');
     const rc=pin.getBoundingClientRect();
     const top=document.elementFromPoint(rc.left+rc.width/2, rc.top+rc.height/2);
     const others=[...document.querySelectorAll('.modal-overlay.active')].map(e=>e.id).filter(i=>i!=='modal-login');
     return { loginOpen: document.getElementById('modal-login').classList.contains('active'),
              reachable: !!top && top.closest('#modal-login')!==null,
              leftover: others, topEl: top? (top.id||top.className||top.tagName):'ไม่มี' };
   }, openWhat);
   check(`${label}เปิดค้าง → กดช่อง PIN ได้`, r.loginOpen && r.reachable, 'บนสุดคือ '+r.topEl);
   check(`${label}ถูกปิดทิ้ง ไม่ค้างข้ามผู้ใช้`, r.leftover.length===0, 'ค้าง: '+r.leftover.join(','));
 }

 console.log('\n[2] ห้ามเตะออกกลางการกู้ข้อมูล');
 const r2=await p.evaluate(async()=>{
   app.currentRole='owner'; app.currentUser={id:'__owner__',name:'เจ้าของร้าน'};
   app.restoreBusy=true; app._lastActivityTs=Date.now()-10*60*1000;
   app.checkIdleTimeout(); await new Promise(r=>setTimeout(r,150));
   const still = app.currentRole==='owner';
   app.restoreBusy=false;
   return {still};
 });
 check('กำลังกู้ข้อมูลอยู่ → ไม่โดนเตะออก', r2.still);

 console.log('\n[3] พิมพ์ใบเสร็จยาว ต้องไม่ถูกตัดท้าย');
 await p.evaluate(async()=>{
   document.querySelectorAll('.modal-overlay.active').forEach(e=>app.closeModal(e.id));
   const det=[]; for(let i=0;i<14;i++) det.push({name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส รายการที่ '+(i+1),
     price:1000,netPrice:1000,staffId:'st-1',staffName:'สมชาย ใจดี',commissionAmount:100});
   app.showThermalReceipt({id:'TX-LONG',date:Date.now(),customerName:'คุณทดสอบ',services:det.map(d=>d.name),
     details:det,subtotal:14000,discount:0,total:14000,paymentMethod:'cash',staffNames:['สมชาย ใจดี']});
   await new Promise(r=>setTimeout(r,400));
 });
 await p.emulateMedia({media:'print'}); await new Promise(r=>setTimeout(r,300));
 const r3=await p.evaluate(()=>{
   const pick=(sel)=>{const el=document.querySelector(sel); return el?{s:el.scrollHeight,c:el.clientHeight}:null;};
   return { card: pick('#modal-receipt .modal-card'), prev: pick('#thermal-receipt-preview') };
 });
 check('กล่องใบเสร็จไม่ถูกจำกัดความสูงตอนพิมพ์', r3.card.s <= r3.card.c+2, `เนื้อหา ${r3.card.s}px แต่แสดง ${r3.card.c}px`);
 check('พื้นที่พรีวิวไม่ถูกจำกัดตอนพิมพ์', r3.prev.s <= r3.prev.c+2, `เนื้อหา ${r3.prev.s}px แต่แสดง ${r3.prev.c}px`);
 await p.emulateMedia({media:'screen'});

 console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`);
 await b.close(); srv.close();
 process.exit(fail?1:0);
})();
