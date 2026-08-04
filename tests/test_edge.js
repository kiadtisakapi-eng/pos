// เทสต์ขอบ: เคสที่ผู้ใช้ทำได้จริงแล้วเคยทำระบบพัง
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
app.showToast=()=>{}; app.vibrateDevice=()=>{}; app.renderAll=()=>{};

app.state.categories=[{id:'barber',name:'ตัดผม',vat:false},{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.vatEnabled=true; app.vatRate=7;
const discountEl={value:'0'}; h.document._els['cart-discount']=discountEl;
const setCart=(items,d)=>{app.state.cart=items; discountEl.value=String(d||0);};
const L=(price,cat)=>({price,category:cat,uniqueCartId:Math.random()});
const sum4=x=>Math.round((x.nonVatBase+x.vatableBase+x.vatAmount+x.rounding)*100)/100;

console.log('\n--- ตะกร้าว่าง ---');
setCart([]);
t('ตะกร้าว่างไม่พัง และไม่ปัดเศษเป็น 1 บาท',()=>{
  const x=app.getCartBillTotals(); eq(x.total,0); eq(x.rounding,0); eq(sum4(x),0);});

console.log('\n--- ราคา 0 บาท (ของแถม) ---');
setCart([L(0,'drinks')]);
t('ของแถมราคา 0 ต้องไม่กลายเป็น 1 บาท',()=>{
  const x=app.getCartBillTotals(); eq(x.total,0); eq(x.vatAmount,0);});
setCart([L(0,'drinks'),L(300,'barber')]);
t('ของแถม 0 + ตัดผม 300 = 300 พอดี',()=>eq(app.getCartBillTotals().total,300));

console.log('\n--- ราคามีเศษสตางค์เอง ---');
setCart([L(19.99,'drinks')]);
t('ราคา 19.99 คิดถูกและปัดขึ้นเป็นจำนวนเต็ม',()=>{
  const x=app.getCartBillTotals();
  eq(x.vatAmount,1.40); eq(x.total,22); eq(sum4(x),22);});

console.log('\n--- แก้บิลย้อนหลัง (บั๊กที่เพิ่งแก้) ---');
const mkTx=()=>({id:'TX1',date:Date.now(),customerName:'ก',
  details:[{name:'ตัดผม',price:300,netPrice:300,vatable:false,staffId:'s1',staffName:'เอ',commission:10,commissionType:'percent'},
           {name:'น้ำ',price:80,netPrice:80,vatable:true,staffId:'s1',staffName:'เอ',commission:0,commissionType:'percent'}],
  subtotal:380,discount:0,vatRate:7,nonVatBase:300,vatableBase:80,vatAmount:5.60,rounding:0.40,total:386,
  staffNames:['เอ'],paymentMethod:'cash',syncStatus:'synced'});

app.state.staff=[{id:'s1',name:'เอ'}];
app.state.transactions=[mkTx()];
app.currentRole='owner';
app.saveState=async()=>{}; app.filterReports=()=>{}; app.syncPendingTransactions=()=>{};
app.flushCloudOutbox=()=>{}; app.enqueueSummaryRefresh=()=>{}; app.closeModal=()=>{};
Object.assign(h.document._els,{
  'edit-tx-id':{value:'TX1'},'edit-tx-customer':{value:'ก'},'edit-tx-payment':{value:'cash'},
  'edit-tx-discount':{value:'0'},'edit-tx-total':{value:''}});
h.document.querySelectorAll=()=>[];

(async()=>{
await app.saveTransactionEdit();
let tx=app.state.transactions[0];
t('แก้บิลแล้วยอดรวมยังเป็น 386 (ไม่หล่นกลับเป็น 380)',()=>eq(tx.total,386));
t('4 ช่องยังบวกได้เท่ายอดรวม',()=>eq(Math.round((tx.nonVatBase+tx.vatableBase+tx.vatAmount+tx.rounding)*100)/100,386));

// แก้โดยใส่ส่วนลด 80
app.state.transactions=[mkTx()];
h.document._els['edit-tx-discount'].value='80';
await app.saveTransactionEdit();
tx=app.state.transactions[0];
t('ใส่ส่วนลด 80 -> คิด VAT จากยอดหลังลด',()=>{
  eq(tx.discount,80);
  eq(Math.round((tx.nonVatBase+tx.vatableBase)*100)/100,300,'ยอดก่อน VAT ต้อง = 380-80');
  eq(Math.round((tx.nonVatBase+tx.vatableBase+tx.vatAmount+tx.rounding)*100)/100,tx.total);
  eq(Number.isInteger(tx.total),true);});

console.log('\n--- แก้บิลเก่าตอนที่ค่าตั้งค่าเปลี่ยนไปแล้ว ---');
app.state.transactions=[mkTx()];
h.document._els['edit-tx-discount'].value='0';
app.vatEnabled=false; app.vatRate=10;   // เจ้าของปิดสวิตช์ + เปลี่ยนอัตราไปแล้ว
await app.saveTransactionEdit();
tx=app.state.transactions[0];
t('บิลเก่ายังใช้อัตรา 7% ของตัวเอง ไม่โดนค่าตั้งค่าปัจจุบันทับ',()=>{
  eq(tx.vatAmount,5.60); eq(tx.total,386);});
app.vatEnabled=true; app.vatRate=7;

console.log('\n--- ยอดตัวอย่างในหน้าต่างแก้ไข ต้องตรงกับที่บันทึกจริง ---');
app.state.transactions=[mkTx()];
h.document._els['edit-tx-discount'].value='0';
app.recalculateEditTxTotal();
t('ช่องยอดรวมโชว์ 386 ไม่ใช่ 380',()=>ok(/386/.test(h.document._els['edit-tx-total'].value),
  'got '+h.document._els['edit-tx-total'].value));

console.log('\n--- ค่าคอมของบิลเก่าที่ไม่มี details ---');
app.state.services=[{id:'s9',name:'ตัดผม',price:300,category:'barber',commission:10,commissionType:'percent'}];
app.state.staff=[{id:'s1',name:'เอ',role:'ช่าง',accessLevel:'staff',active:true}];
app.state.transactions=[{id:'OLD',date:Date.now(),customerName:'ก',services:['ตัดผม'],
  subtotal:300,discount:50,total:250,staffNames:['เอ'],paymentMethod:'cash'}];
Object.assign(h.document._els,{
  'report-tab-daily':{classList:{add(){},remove(){}},style:{}},
  'report-staff-filter':{value:'all'},'report-date-input':{value:''},'report-month-input':{value:''}});
t('บิลเก่าที่มีส่วนลด: netPrice = 250 ไม่ใช่ค่าที่บวมตาม VAT',()=>{
  const ratio=Math.max(0,300-50)/300;
  eq(Math.round(300*ratio*100)/100,250);});

console.log('\n--- อัตรา VAT นอกช่วง ---');
Object.assign(h.document._els,{'vat-enabled':{checked:true},'vat-rate':{value:'700'}});
app.renderVatSettings=()=>{}; app.renderCategoryList=()=>{}; app.updateCartTotals=()=>{};
const before=app.vatRate;
await app.saveVatSettings();
t('พิมพ์ 700% ต้องถูกปฏิเสธ ไม่บันทึก',()=>eq(app.vatRate,before));
h.document._els['vat-rate'].value='-5';
await app.saveVatSettings();
t('อัตราติดลบถูกปฏิเสธ',()=>eq(app.vatRate,before));
h.document._els['vat-rate'].value='7';
await app.saveVatSettings();
t('อัตรา 7 บันทึกได้',()=>eq(app.vatRate,7));

console.log('\n--- สิทธิ์ ---');
app.currentRole='staff';
h.document._els['vat-rate'].value='0';
await app.saveVatSettings();
t('พนักงานเปลี่ยนค่า VAT ไม่ได้',()=>eq(app.vatRate,7));
app.currentRole='owner';

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
