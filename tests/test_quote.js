// ใบแจ้งยอดก่อนชำระเงิน — ตัวเลขต้องตรงกับตอนจบบิลเป๊ะ และห้ามดูเหมือนใบเสร็จ
const h=require('./harness.js'); const app=h.ctx.app, els=h.document._els;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
const toasts=[]; app.showToast=(m,ty)=>toasts.push({m,ty});
let opened=null; app.openModal=(id)=>{opened=id;};
app.state.categories=[{id:'barber',name:'ตัดผม',vat:false},{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.vatEnabled=true; app.vatRate=7; app.shopName='ร้านทดสอบ'; app.shopPhone='02-000-0000';
els['cart-discount']={value:'0'};
const html=()=>h.document._els['quote-preview'].innerHTML;

console.log('\n--- ตะกร้าว่าง ---');
app.state.cart=[]; toasts.length=0; opened=null;
app.showQuotePreview();
t('ตะกร้าว่างไม่เปิดหน้าต่าง และเตือน',()=>{eq(opened,null); ok(toasts.some(x=>/ยังไม่มีรายการ/.test(x.m)));});

console.log('\n--- บิลผสม ตัดผม 300 + เครื่องดื่ม 80 ---');
app.state.cart=[
  {uniqueCartId:1,name:'ตัดผมชาย',price:300,category:'barber',staffName:'เอ'},
  {uniqueCartId:2,name:'น้ำอัดลม',price:30,category:'drinks',staffName:'เอ'},
  {uniqueCartId:3,name:'กาแฟเย็น',price:50,category:'drinks',staffName:'เอ'}];
app.showQuotePreview();
const q=html();
t('เปิดหน้าต่างใบแจ้งยอด',()=>eq(opened,'modal-quote'));
t('ยอดบนกระดาษ = ยอดที่จะเก็บจริงตอนจบบิล (386)',()=>{
  eq(app.getCartBillTotals().total,386);
  ok(/฿386/.test(q),'ไม่เจอยอด 386');});
t('แสดง VAT 5.60 และปัดเศษ 0.40',()=>{ok(/5\.60/.test(q),'ไม่เจอ VAT'); ok(/0\.40/.test(q),'ไม่เจอปัดเศษ');});
t('ทำเครื่องหมาย * เฉพาะรายการที่คิด VAT',()=>{
  ok(/น้ำอัดลม \*/.test(q),'เครื่องดื่มต้องมี *');
  ok(!/ตัดผมชาย \*/.test(q),'ตัดผมต้องไม่มี *');});

console.log('\n--- ต่างจากใบเสร็จตรงไหน ---');
t('ไม่มีข้อความคาดหัวแล้ว (ตามที่เจ้าของร้านสั่ง)',()=>ok(!/ยังไม่ใช่ใบเสร็จรับเงิน/.test(q)));
t('ไม่มีเลขที่บิล',()=>ok(!/เลขที่ใบเสร็จ|เลขที่บิล/.test(q)));
t('ไม่มีข้อความขอบคุณแบบใบเสร็จ',()=>ok(!/ขอบคุณที่ใช้บริการ/.test(q)));
t('ไม่มีช่องเงินรับ/เงินทอน (ยังไม่ได้รับเงิน)',()=>ok(!/เงินรับมา|เงินทอน/.test(q)));

console.log('\n--- ไม่บันทึกอะไรลงระบบ ---');
app.state.transactions=[]; app.state.queue=[]; app.state.cloudOutbox=[];
app.showQuotePreview();
t('พิมพ์ใบแจ้งยอดแล้วไม่มีบิลเกิดขึ้น',()=>{eq(app.state.transactions.length,0); eq(app.state.queue.length,0);});
t('ไม่มีงานส่งขึ้นคลาวด์',()=>eq(app.state.cloudOutbox.length,0));
t('ตะกร้ายังอยู่ครบ ไม่ถูกล้าง',()=>eq(app.state.cart.length,3));

console.log('\n--- มีส่วนลด ---');
els['cart-discount'].value='80';
app.showQuotePreview();
const q2=html();
t('ยอดบนกระดาษยังตรงกับตัวคำนวณจริง',()=>{
  const tt=app.getCartBillTotals();
  ok(new RegExp('฿'+tt.total.toLocaleString('th-TH')).test(q2),'ยอดไม่ตรง: '+tt.total);});
t('แสดงส่วนลดที่หัก',()=>ok(/-฿80\.00/.test(q2)));
els['cart-discount'].value='0';

console.log('\n--- บริการล้วน ไม่มี VAT ---');
app.state.cart=[{uniqueCartId:1,name:'ตัดผมชาย',price:300,category:'barber',staffName:'เอ'}];
app.showQuotePreview();
const q3=html();
t('ไม่โชว์บรรทัด VAT เมื่อไม่มี VAT',()=>ok(!/VAT 7%/.test(q3)));
t('ไม่โชว์บรรทัดปัดเศษเมื่อไม่มีเศษ',()=>ok(!/ปัดเศษ/.test(q3)));
t('ยอดที่ต้องชำระ 300',()=>ok(/฿300/.test(q3)));

console.log('\n--- กัน XSS ในชื่อรายการ/ชื่อร้าน ---');
app.shopName='<script>alert(1)</script>';
app.state.cart=[{uniqueCartId:1,name:'<img onerror=alert(1)>',price:100,category:'barber',staffName:'<b>x</b>'}];
app.showQuotePreview();
const q4=html();
t('ชื่อร้าน/รายการ/พนักงาน ถูก escape ทั้งหมด',()=>{
  ok(!/<script>/.test(q4),'script หลุด');
  ok(!/<img onerror/.test(q4),'img หลุด');
  ok(q4.includes('&lt;script&gt;')&&q4.includes('&lt;img'),'ไม่พบรูปแบบที่ escape แล้ว');});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
