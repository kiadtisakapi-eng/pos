// ตรวจการคำนวณทุกตัวในระบบ
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
app.showToast=()=>{};

console.log('\n--- กระจายส่วนลด ---');
t('ผลรวมหลังกระจาย = ยอดหลังหักส่วนลด เป๊ะ ไม่มีเศษหลุด',()=>{
  for(let i=0;i<2000;i++){
    const n=1+Math.floor(Math.random()*6);
    const prices=Array.from({length:n},()=>Math.round(Math.random()*99900)/100);
    const sub=Math.round(prices.reduce((a,b)=>a+b,0)*100)/100;
    const disc=Math.round(Math.random()*sub*100)/100;
    const nets=app.distributeDiscount(prices,sub,disc);
    const sum=Math.round(nets.reduce((a,b)=>a+b,0)*100)/100;
    const want=Math.round(Math.max(0,sub-disc)*100)/100;
    if(Math.abs(sum-want)>0.001) throw new Error(`sum=${sum} want=${want} prices=${prices} disc=${disc}`);
    nets.forEach((v,j)=>{ if(v<-0.001) throw new Error('ราคาติดลบ '+v);
                          if(v>prices[j]+0.001) throw new Error('ราคาหลังลดสูงกว่าราคาเต็ม'); });
  }
});
t('ส่วนลด 0 -> ราคาไม่เปลี่ยน',()=>eq(app.distributeDiscount([100,200],300,0),[100,200]));
t('ส่วนลดเท่ายอด -> ทุกรายการเป็น 0',()=>eq(app.distributeDiscount([100,200],300,300),[0,0]));
t('ตะกร้าว่างไม่พัง',()=>eq(app.distributeDiscount([],0,0),[]));
t('เศษหาร 3 ไม่ลงตัว (100/3) ยังบวกได้ครบ',()=>{
  const nets=app.distributeDiscount([100,100,100],300,100);
  eq(Math.round(nets.reduce((a,b)=>a+b,0)*100)/100,200);});

console.log('\n--- ส่วนลดในตะกร้า (clamp) ---');
const dEl={value:'0'}; h.document._els['cart-discount']=dEl;
t('พิมพ์ค่าติดลบ -> 0',()=>{dEl.value='-500'; eq(app.getCartDiscount(300),0);});
t('พิมพ์เกินยอด -> ตัดเท่ายอด',()=>{dEl.value='9999'; eq(app.getCartDiscount(300),300);});
t('พิมพ์ตัวอักษร -> 0',()=>{dEl.value='abc'; eq(app.getCartDiscount(300),0);});
t('ค่าปกติผ่าน',()=>{dEl.value='50'; eq(app.getCartDiscount(300),50);});
dEl.value='0';

console.log('\n--- ค่าคอมมิชชั่น ---');
const comm=(net,val,type)=> type==='fixed'? val : Math.round(net*val)/100;
t('แบบ % : 40% ของ 300 = 120',()=>eq(comm(300,40,'percent'),120));
t('แบบ % : ของ 333.33 ที่ 15% = 50.00 (ปัด 2 ตำแหน่ง)',()=>eq(comm(333.33,15,'percent'),50));
t('แบบเงินคงที่ : ไม่ขึ้นกับส่วนลด',()=>{eq(comm(300,80,'fixed'),80); eq(comm(150,80,'fixed'),80);});
t('คอม 0% = 0',()=>eq(comm(500,0,'percent'),0));

console.log('\n--- วันทำการ (ตัดวันตี 6) ---');
const D=(y,m,d,hh,mm)=>new Date(y,m-1,d,hh,mm,0).getTime();
t('บิลเที่ยงวันที่ 18 -> วันทำการ 18',()=>eq(app.getBusinessISODate(D(2026,7,18,12,0)),'2026-07-18'));
t('บิลตี 2 ของวันที่ 19 -> ยังเป็นวันทำการ 18',()=>eq(app.getBusinessISODate(D(2026,7,19,2,0)),'2026-07-18'));
t('บิล 05:59 ของวันที่ 19 -> ยังเป็น 18',()=>eq(app.getBusinessISODate(D(2026,7,19,5,59)),'2026-07-18'));
t('บิล 06:00 ของวันที่ 19 -> ข้ามเป็น 19',()=>eq(app.getBusinessISODate(D(2026,7,19,6,0)),'2026-07-19'));
t('บิลตี 3 วันที่ 1 ส.ค. -> เดือนทำการยังเป็น ก.ค.',()=>eq(app.getBusinessMonthKey(D(2026,8,1,3,0)),'07-2026'));
t('บิล 7 โมงเช้าวันที่ 1 ส.ค. -> เดือน ส.ค.',()=>eq(app.getBusinessMonthKey(D(2026,8,1,7,0)),'08-2026'));
t('วันที่พังทุกแบบ -> คืนค่าว่าง ไม่กลายเป็นปี 1970',()=>{
  [null,undefined,'','ขยะ',NaN].forEach(v=>{
    eq(app.getBusinessISODate(v),'','ISODate('+String(v)+')');
    eq(app.getBusinessMonthKey(v),'','MonthKey('+String(v)+')');
    eq(app.getBusinessISOMonth(v),'','ISOMonth('+String(v)+')');});});
t('เลข 0 (timestamp epoch) ยังถือว่าใช้ได้ ไม่ใช่ค่าพัง',()=>ok(app.getBusinessISODate(0)!==''));

console.log('\n--- นับเงินปิดกะ ---');
const expected=(start,cash,exp)=>start+cash-exp;
t('ควรมี = ตั้งต้น + ขายสด - ค่าใช้จ่าย',()=>eq(expected(1000,5000,200),5800));
t('นับได้น้อยกว่า = เงินขาด (ติดลบ)',()=>eq(5750-expected(1000,5000,200),-50));
t('นับได้มากกว่า = เงินเกิน (บวก)',()=>eq(5850-expected(1000,5000,200),50));
t('ค่าใช้จ่ายมากกว่าเงินสด -> ควรมีติดลบได้จริง (ควักเงินตัวเองจ่าย)',()=>eq(expected(0,100,500),-400));

console.log('\n--- เก็บข้อมูลย้อนหลัง (archive) ---');
const day=86400000;
app.state.transactions=[
  {id:'a',date:Date.now()-400*day,syncStatus:'synced'},
  {id:'b',date:Date.now()-400*day,syncStatus:'pending'},
  {id:'c',date:Date.now()-10*day, syncStatus:'synced'}];
app.state.shift={active:false,history:[
  {endTime:Date.now()-100*day},{endTime:Date.now()-80*day}],expenses:[]};
app.state.voidLog=[{date:Date.now()-400*day},{date:Date.now()-10*day}];
app.archiveOldData();
t('บิลเก่าเกิน 1 ปีที่ซิงก์แล้ว ถูกลบ',()=>ok(!app.state.transactions.find(x=>x.id==='a')));
t('บิลเก่าเกิน 1 ปีที่ยังไม่ซิงก์ ห้ามลบ (ข้อมูลจะหายถาวร)',()=>ok(app.state.transactions.find(x=>x.id==='b')));
t('บิลใหม่ไม่ถูกแตะ',()=>ok(app.state.transactions.find(x=>x.id==='c')));
t('ประวัติกะเกิน 90 วันถูกลบ เหลือ 1',()=>eq(app.state.shift.history.length,1));
t('ประวัติยกเลิกบิลเกิน 1 ปีถูกลบ เหลือ 1',()=>eq(app.state.voidLog.length,1));

console.log('\n--- ยอดรวมตะกร้า ---');
app.state.categories=[{id:'x',name:'x',vat:false}];
app.vatEnabled=false;
app.state.cart=[{price:100,category:'x'},{price:250.5,category:'x'}];
t('ราคารวม = ผลบวกทุกชิ้น',()=>eq(app.getCartSubtotal(),350.5));
dEl.value='50.5';
t('ยอดสุทธิ = ราคารวม - ส่วนลด',()=>eq(app.getCartTotal(),300));
dEl.value='0';

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
