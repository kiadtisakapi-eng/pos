// เปิดแอปสองแท็บบนเบราว์เซอร์จริง แล้วดูว่ายอดขายรอดไหม
//
// ทำไมต้องเป็นเบราว์เซอร์จริง: เทสต์ฝั่ง node พิสูจน์ได้แค่ว่าธง isReadOnlyWindow ทำงาน
// แต่พิสูจน์ไม่ได้ว่า Web Locks แจกสิทธิ์ข้ามแท็บได้จริง และพิสูจน์ไม่ได้ว่า
// "บิลที่ขายไปแล้วยังอยู่ใน IndexedDB จริง" ซึ่งเป็นสิ่งเดียวที่มีความหมาย
//
// รันกับโค้ดก่อนแก้ชุด C: บิลที่แท็บ A ขาย หายเกลี้ยงจากฐานข้อมูล (billsInDb = 0)
//
//   node tests/e2e_two_windows.js
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
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+JSON.stringify(x).slice(0,200):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
// อ่านจำนวนบิลจาก IndexedDB ตรง ๆ ไม่ผ่าน state ในหน่วยความจำ
const readBills = pg => pg.evaluate(({ db }) => new Promise(res => {
  const r = indexedDB.open(db);
  r.onsuccess = e => { const d = e.target.result;
    const q = d.transaction('state','readonly').objectStore('state').get('transactions');
    q.onsuccess = () => res(q.result && q.result.value ? q.result.value.length : -1);
    q.onerror = () => res(-2); };
  r.onerror = () => res(-3);
}), { db: DB_NAME });

(async () => {
  await new Promise(r=>srv.listen(8114,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const ctx = await b.newContext({ viewport:{width:1280,height:960} });   // ทุกแท็บใช้ storage ก้อนเดียวกัน

  console.log('\n── แท็บ A เปิดคนเดียว');
  const A = await ctx.newPage();
  await A.goto('http://localhost:8114/index.html',{waitUntil:'networkidle'}); await ready(A);
  await A.waitForTimeout(400);
  t('แท็บ A เป็นหน้าต่างหลัก (เขียนได้)', await A.evaluate(()=>app.isReadOnlyWindow===false));
  t('แท็บ A ไม่มีแถบเตือน', await A.evaluate(()=>!document.getElementById('read-only-window-banner')));

  console.log('\n── แท็บ B เปิดตามมา');
  const B = await ctx.newPage();
  await B.goto('http://localhost:8114/index.html',{waitUntil:'networkidle'}); await ready(B);
  await B.waitForTimeout(600);
  t('แท็บ B กลายเป็นอ่านอย่างเดียว', await B.evaluate(()=>app.isReadOnlyWindow===true));
  t('แท็บ B ขึ้นแถบเตือนให้เห็น', await B.evaluate(()=>!!document.getElementById('read-only-window-banner')));
  t('แท็บ A ยังเป็นหน้าต่างหลักอยู่', await A.evaluate(()=>app.isReadOnlyWindow===false));

  console.log('\n── เคสที่ทำให้ยอดขายหาย');
  await A.evaluate(async()=>{
    app.state.transactions=[{id:'TX-1757000000000-AAAAAAAA',date:new Date().toISOString(),total:300,syncStatus:'pending'}];
    window.__aSaved = await app.saveState();
  });
  t('แท็บ A บันทึกบิลลงเครื่องสำเร็จ', await A.evaluate(()=>window.__aSaved===true));

  // B ยังถือ snapshot ตอนเปิด (ไม่มีบิลใบนั้น) แล้วพยายามเซฟ = จุดที่เคยทับข้อมูลหาย
  const bSaved = await B.evaluate(async()=>{
    app.state.customers=[{id:'c-1',name:'ลูกค้าใหม่'}];
    return await app.saveState();
  });
  t('แท็บ B บันทึกไม่ได้ (ถูกปฏิเสธ)', bSaved===false, bSaved);
  t('*** บิลที่แท็บ A ขายยังอยู่ในฐานข้อมูล ไม่ถูกทับหาย ***', (await readBills(A))===1, {billsInDb: await readBills(A)});

  console.log('\n── ปิดแท็บ A แล้วแท็บ B ต้องรับสิทธิ์ต่อ');
  await A.close();
  await B.waitForFunction(()=>app.isReadOnlyWindow===false,null,{timeout:15000}).catch(()=>{});
  t('แท็บ B รับสิทธิ์เป็นหน้าต่างหลักแทน', await B.evaluate(()=>app.isReadOnlyWindow===false));
  t('แถบเตือนหายไปแล้ว', await B.evaluate(()=>!document.getElementById('read-only-window-banner')));
  t('*** แท็บ B โหลดข้อมูลล่าสุดก่อนรับสิทธิ์ (เห็นบิลที่ A ขาย) ***',
     await B.evaluate(()=>app.state.transactions.length===1), await B.evaluate(()=>app.state.transactions.length));
  t('แท็บ B บันทึกได้แล้ว', (await B.evaluate(async()=>await app.saveState()))===true);
  t('*** บิลยังอยู่หลังแท็บ B เขียนทับ (พิสูจน์ว่าโหลดใหม่ก่อนจริง) ***', (await readBills(B))===1, {billsInDb: await readBills(B)});

  console.log('\n── รีโหลดแอป (เส้นที่ผู้ใช้เดินทุกครั้งที่กด "อัปเดตเลย")');
  // ถ้าล็อกของเอกสารเก่ายังไม่ถูกปล่อยตอนเอกสารใหม่ขอ แอปจะค้างโหมดอ่านอย่างเดียว
  // = ร้านขายไม่ได้ทุกครั้งที่อัปเดตแอป ซึ่งร้ายแรงกว่าบั๊กที่กำลังแก้อยู่
  let stuck = 0;
  for (let i = 1; i <= 3; i++) {
    await B.reload({ waitUntil:'networkidle' });
    await ready(B); await B.waitForTimeout(350);
    if (await B.evaluate(()=>app.isReadOnlyWindow!==false || !!document.getElementById('read-only-window-banner'))) stuck++;
  }
  t('รีโหลด 3 รอบแล้วยังเขียนได้ ไม่ค้างโหมดอ่านอย่างเดียว', stuck===0, {ค้าง: stuck});
  t('บันทึกได้จริงหลังรีโหลด', (await B.evaluate(async()=>await app.saveState()))===true);

  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
