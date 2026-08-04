// ทดสอบระบบ VAT: คิดเฉพาะกลุ่มที่เปิด · ปัดขึ้นเต็มบาท · บิลเก่าไม่กระทบ
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

app.showToast=()=>{}; app.vibrateDevice=()=>{}; app.renderAll=()=>{};
app.state.categories=[
  {id:'barber',name:'ตัดผมชาย',vat:false},
  {id:'massage',name:'นวดและสปา',vat:false},
  {id:'drinks',name:'เครื่องดื่ม',vat:true},
];
app.vatEnabled=true; app.vatRate=7;

// ตะกร้าปลอม + ช่องส่วนลดปลอม
const discountEl={value:'0'};
h.document._els['cart-discount']=discountEl;
const setCart=(items,discount)=>{ app.state.cart=items; discountEl.value=String(discount||0); };
const L=(price,cat)=>({price,category:cat,uniqueCartId:Math.random()});
const sum4=t=>Math.round((t.nonVatBase+t.vatableBase+t.vatAmount+t.rounding)*100)/100;

console.log('\n--- ตัวอย่างที่คุยกันไว้ ---');
setCart([L(300,'barber'),L(30,'drinks'),L(50,'drinks')]);
let r=app.getCartBillTotals();
t('ตัดผม 300 + เครื่องดื่ม 80 -> จ่าย 386',()=>{
  eq(r.nonVatBase,300); eq(r.vatableBase,80); eq(r.vatAmount,5.60); eq(r.rounding,0.40); eq(r.total,386);});
t('4 ช่องบวกกันได้ = ยอดรวม',()=>eq(sum4(r),r.total));

setCart([L(20,'drinks')]);
r=app.getCartBillTotals();
t('น้ำเปล่า 20 -> จ่าย 22 (VAT 1.40 + ปัดเศษ 0.60)',()=>{
  eq(r.vatableBase,20); eq(r.vatAmount,1.40); eq(r.rounding,0.60); eq(r.total,22);});

console.log('\n--- กลุ่มที่ไม่เปิด VAT ---');
setCart([L(300,'barber'),L(500,'massage')]);
r=app.getCartBillTotals();
t('บริการล้วน ไม่มี VAT ไม่มีปัดเศษ',()=>{
  eq(r.vatableBase,0); eq(r.vatAmount,0); eq(r.rounding,0); eq(r.total,800);});

console.log('\n--- สวิตช์ใหญ่ปิด ---');
app.vatEnabled=false;
setCart([L(20,'drinks')]);
r=app.getCartBillTotals();
t('ปิดสวิตช์ = ไม่คิด VAT แม้หมวดติ๊กไว้',()=>{eq(r.vatAmount,0);eq(r.total,20);});
app.vatEnabled=true;

console.log('\n--- หมวดที่ไม่มีฟิลด์ vat (ข้อมูลเก่า) ---');
app.state.categories.push({id:'old',name:'หมวดเก่าไม่มีฟิลด์'});
setCart([L(100,'old')]);
r=app.getCartBillTotals();
t('ไม่มีฟิลด์ vat = ไม่คิด (ไม่เดาเป็นเก็บ)',()=>{eq(r.vatAmount,0);eq(r.total,100);});
setCart([L(100,'ไม่มีหมวดนี้จริง')]);
r=app.getCartBillTotals();
t('หาหมวดไม่เจอ = ไม่คิด',()=>eq(app.getCartBillTotals().vatAmount,0));

console.log('\n--- ส่วนลด ---');
setCart([L(300,'barber'),L(100,'drinks')],80);
r=app.getCartBillTotals();
t('คิด VAT จากยอดหลังหักส่วนลด ไม่ใช่ราคาเต็ม',()=>{
  // ส่วนลด 80 กระจายตามสัดส่วน: ตัดผมโดน 60 -> 240, เครื่องดื่มโดน 20 -> 80
  eq(r.nonVatBase,240); eq(r.vatableBase,80); eq(r.vatAmount,5.60);});
t('ยอดก่อน VAT รวม = ราคารวม - ส่วนลด เป๊ะ',()=>eq(Math.round((r.nonVatBase+r.vatableBase)*100)/100,320));
t('4 ช่องยังบวกลงตัว',()=>eq(sum4(r),r.total));

setCart([L(300,'barber'),L(100,'drinks')],400);
r=app.getCartBillTotals();
t('ส่วนลดเกินยอด ถูก clamp ไม่ติดลบ',()=>{ok(r.total>=0);eq(r.nonVatBase,0);eq(r.vatableBase,0);eq(r.total,0);});

console.log('\n--- เศษสตางค์ / ปัดขึ้น ---');
const cases=[
  {price:20,   exp:{vat:1.40, rnd:0.60, total:22}},
  {price:50,   exp:{vat:3.50, rnd:0.50, total:54}},
  {price:60,   exp:{vat:4.20, rnd:0.80, total:65}},
  {price:100,  exp:{vat:7.00, rnd:0,    total:107}},
  {price:1,    exp:{vat:0.07, rnd:0.93, total:2}},
];
cases.forEach(c=>{
  setCart([L(c.price,'drinks')]);
  const x=app.getCartBillTotals();
  t(`เครื่องดื่ม ${c.price} -> VAT ${c.exp.vat} ปัด ${c.exp.rnd} รวม ${c.exp.total}`,()=>{
    eq(x.vatAmount,c.exp.vat); eq(x.rounding,c.exp.rnd); eq(x.total,c.exp.total);
    eq(sum4(x),x.total);
    eq(Number.isInteger(x.total),true,'ยอดรวมต้องเป็นจำนวนเต็มบาทเสมอ');});
});

console.log('\n--- ยอดที่ลงตัวพอดี ห้ามปัดเพิ่ม ---');
setCart([L(200,'drinks')]);
r=app.getCartBillTotals();
t('200 + VAT 14 = 214 พอดี ต้องไม่กลายเป็น 215',()=>{eq(r.rounding,0);eq(r.total,214);});
setCart([L(300,'barber')]);
t('300 ไม่มี VAT ต้องไม่ปัดเป็น 301',()=>eq(app.getCartBillTotals().total,300));

console.log('\n--- ยอดรวมต้องเป็นจำนวนเต็มบาทเสมอ (สุ่ม 500 เคส) ---');
t('ไม่มีเคสไหนได้เศษสตางค์หรือปัดเกิน 1 บาท',()=>{
  for(let i=0;i<500;i++){
    const n=1+Math.floor(Math.random()*4);
    const items=[];
    for(let j=0;j<n;j++) items.push(L(Math.round(Math.random()*99900)/100, Math.random()<0.5?'drinks':'barber'));
    const disc=Math.random()<0.3?Math.round(Math.random()*5000)/100:0;
    setCart(items,disc);
    const x=app.getCartBillTotals();
    if(!Number.isInteger(x.total)) throw new Error('ยอดไม่ใช่จำนวนเต็ม: '+x.total);
    if(x.rounding<0||x.rounding>=1) throw new Error('ปัดเศษผิดช่วง: '+x.rounding);
    if(Math.abs(sum4(x)-x.total)>0.001) throw new Error('4 ช่องบวกไม่ลงตัว: '+JSON.stringify(x));
  }
});

console.log('\n--- ค่าคอมต้องคิดจากยอดก่อน VAT ---');
app.state.staff=[{id:'st1',name:'เอ',role:'ช่าง'}];
app.state.services=[{id:'d1',name:'น้ำเปล่า',price:100,category:'drinks',commission:40,commissionType:'percent'}];
setCart([{...L(100,'drinks'),id:'d1',name:'น้ำเปล่า',commission:40,commissionType:'percent',staffId:'st1',staffName:'เอ'}]);
const lines=app.getCartLines();
const bt=app.computeBillTotals(lines);
t('คอม 40% ของ 100 = 40 (ไม่ใช่ 42.80 ซึ่งคิดจากยอดรวม VAT)',()=>{
  eq(Math.round(lines[0].netPrice*40)/100,40);
  eq(bt.total,107);});

console.log('\n--- สรุปส่งขึ้นชีต ---');
const oldTx={id:'t0',date:Date.now(),total:500,details:[{netPrice:500,category:'barber'}]};
const newTx={id:'t1',date:Date.now(),total:386,nonVatBase:300,vatableBase:80,vatAmount:5.60,rounding:0.40,vatRate:7,
  details:[{netPrice:300,category:'barber',vatable:false},{netPrice:80,category:'drinks',vatable:true}]};
let v=app.buildVatSummary([oldTx,newTx]);
t('บิลเก่า (ไม่มีฟิลด์ VAT) นับเป็นยอดไม่คิด VAT ทั้งใบ',()=>eq(v.nonVatBase,800));
t('ฐานภาษีและภาษีขายมาจากบิลใหม่เท่านั้น',()=>{eq(v.vatableBase,80);eq(v.vatAmount,5.60);eq(v.rounding,0.40);});
t('4 ช่องรวมกัน = ยอดขายรวมของทั้งสองบิล',()=>
  eq(Math.round((v.nonVatBase+v.vatableBase+v.vatAmount+v.rounding)*100)/100, 500+386));
t('แยกตามหมวดให้ดูได้',()=>{eq(v.categories.length,1);eq(v.categories[0].name,'เครื่องดื่ม');eq(v.categories[0].base,80);});

v=app.buildVatSummary([oldTx]);
t('งวดที่ไม่มีบิล VAT เลย -> ทุกช่องเป็น 0',()=>{eq(v.vatableBase,0);eq(v.vatAmount,0);eq(v.rounding,0);eq(v.nonVatBase,500);});
t('งวดว่างเปล่าไม่พัง',()=>{const z=app.buildVatSummary([]);eq(z.vatAmount,0);eq(z.categories,[]);});

console.log('\n--- เปลี่ยนค่าตั้งค่าแล้วบิลเก่าต้องไม่ขยับ ---');
app.vatRate=10; app.vatEnabled=false;
v=app.buildVatSummary([newTx]);
t('ปิดสวิตช์+เปลี่ยนอัตราเป็น 10% บิลเก่ายังเป็น VAT 5.60 ที่ 7%',()=>{eq(v.vatAmount,5.60);eq(v.vatRate,7);});
app.vatRate=7; app.vatEnabled=true;

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
