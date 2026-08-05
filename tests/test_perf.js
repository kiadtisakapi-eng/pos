// วัดผลการแก้ความหน่วง + กันของพังจากการจำผลวันที่
const h=require('./harness.js'); const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
app.showToast=()=>{};
const ms=f=>{const s=process.hrtime.bigint(); f(); return Number(process.hrtime.bigint()-s)/1e6;};

console.log('\n--- ผลลัพธ์ต้องเหมือนเดิมทุกประการ ---');
const D=(y,m,d,hh,mm)=>new Date(y,m-1,d,hh,mm,0).getTime();
t('วันทำการยังถูกต้องหลังเปิดระบบจำผล',()=>{
  eq(app.getBusinessISODate(D(2026,7,19,2,0)),'2026-07-18');
  eq(app.getBusinessISODate(D(2026,7,19,6,0)),'2026-07-19');
  eq(app.getBusinessMonthKey(D(2026,8,1,3,0)),'07-2026');});
t('เรียกซ้ำได้ค่าเดิมเสมอ (ไม่เพี้ยนเพราะจำผล)',()=>{
  const x=D(2026,7,19,2,0);
  for(let i=0;i<50;i++) eq(app.getBusinessISODate(x),'2026-07-18');});
t('บิลคนละใบที่เวลาต่างกัน ได้วันคนละวันถูกต้อง (ไม่จำสลับกัน)',()=>{
  app.clearDateKeyCache();
  const a=D(2026,7,18,23,0), b=D(2026,7,19,7,0);
  eq(app.getBusinessISODate(a),'2026-07-18');
  eq(app.getBusinessISODate(b),'2026-07-19');
  eq(app.getBusinessISODate(a),'2026-07-18');
  eq(app.getBusinessMonthKey(a),'07-2026');
  eq(app.getBusinessISOMonth(a),'2026-07');});
t('ตารางจำผลของวัน/เดือน/คีย์เดือน ไม่ปนกัน',()=>{
  app.clearDateKeyCache();
  const x=D(2026,7,19,2,0);
  eq(app.getBusinessISODate(x),'2026-07-18');
  eq(app.getBusinessISOMonth(x),'2026-07');
  eq(app.getBusinessMonthKey(x),'07-2026');});
t('ค่าพังยังคืนค่าว่าง ไม่ถูกจำผิด ๆ',()=>{
  [null,undefined,'','ขยะ',NaN].forEach(v=>{
    eq(app.getBusinessISODate(v),''); eq(app.getBusinessMonthKey(v),'');});});
t('ล้างตารางแล้วยังคำนวณถูก',()=>{
  app.clearDateKeyCache();
  eq(app.getBusinessISODate(D(2026,7,19,2,0)),'2026-07-18');});

console.log('\n--- เร็วขึ้นจริงไหม ---');
const mk=i=>({id:'TX-'+i,date:Date.now()-Math.floor(i/15)*86400000,
  details:[{name:'บริการ',price:300,netPrice:300,staffId:'st0',staffName:'ช่าง',commissionAmount:120,category:'barber',vatable:false}],
  services:['บริการ'],subtotal:300,discount:0,total:300,paymentMethod:'cash',staffNames:['ช่าง'],syncStatus:'synced'});
[2000,5000].forEach(N=>{
  app.state.transactions=Array.from({length:N},(_,i)=>mk(i));
  app.clearDateKeyCache();
  const key=app.getBusinessISODate(Date.now());
  const first=ms(()=>app.state.transactions.filter(tx=>app.getBusinessISODate(tx.date)===key));
  const after=ms(()=>{for(let r=0;r<5;r++) app.state.transactions.filter(tx=>app.getBusinessISODate(tx.date)===key);})/5;
  console.log(`  ${N} บิล: รอบแรก ${first.toFixed(1)} ms -> รอบถัดไป ${after.toFixed(2)} ms (เร็วขึ้น ${(first/after).toFixed(0)} เท่า)`);
  // ไม่ตั้งเป็นเงื่อนไขผ่าน/ไม่ผ่าน — เวลาที่วัดได้แกว่งตามเครื่องและภาระงานขณะนั้น
  // เทสต์ที่ผูกกับเวลาจะไม่ผ่านแบบสุ่มแล้วทำให้คนเลิกเชื่อชุดเทสต์ทั้งชุด
});

console.log('\n--- วาดเฉพาะหน้าที่เปิดอยู่ ---');
const drawn=[];
['renderDashboard','renderPos','renderQueueScreen','renderCustomerTable','renderReports','renderSettingsLists']
  .forEach(k=>{app[k]=()=>drawn.push(k)});
const check=(screen,expect)=>{
  drawn.length=0; app.state.activeScreen=screen; app.renderAll();
  t(`อยู่หน้า "${screen}" -> วาด ${expect.join(', ')}`,()=>eq(drawn.sort(),expect.slice().sort()));};
check('pos',['renderPos','renderQueueScreen']);
check('dashboard',['renderDashboard']);
check('reports',['renderReports']);
check('settings',['renderSettingsLists']);
check('customers',['renderCustomerTable']);
check('queue',['renderQueueScreen']);
t('หน้ารายงานไม่ถูกวาดตอนอยู่หน้าขาย (ตัวที่หนักที่สุด)',()=>{
  drawn.length=0; app.state.activeScreen='pos'; app.renderAll();
  ok(!drawn.includes('renderReports'));});
t('renderEveryScreen ยังวาดครบทั้ง 6 หน้า (ใช้ตอนกู้ข้อมูล)',()=>{
  drawn.length=0; app.renderEveryScreen(); eq(drawn.length,6);});
t('ไม่มี activeScreen -> ไม่พัง วาดหน้าแรกให้',()=>{
  drawn.length=0; app.state.activeScreen=undefined; app.renderAll(); eq(drawn,['renderDashboard']);});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
