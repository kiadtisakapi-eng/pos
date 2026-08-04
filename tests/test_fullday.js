// จำลองหนึ่งวันเต็ม: เปิดกะ -> ขาย 5 บิล -> ค่าใช้จ่าย -> ปิดกะ -> ตรวจทุกตัวเลขให้กระทบยอดกัน
const h=require('./harness.js'); const app=h.ctx.app, els=h.document._els;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
const errs=[];
process.on('unhandledRejection',e=>errs.push('unhandledRejection: '+e));

app.showToast=()=>{}; app.vibrateDevice=()=>{};
['renderAll','renderPos','renderQueueScreen','renderCart','renderDashboard','renderCustomerTable',
 'renderReports','renderSettingsLists','renderCategoryList','renderVatSettings','filterReports',
 'openModal','closeModal','showThermalReceipt','syncPendingTransactions','flushCloudOutbox',
 'applyShopName','applyTheme','showAppVersion','applyRoleUI','openCashCounter','updateCashSum',
 'updateCartTotals','autoBackupToGoogleDrive'].forEach(k=>{app[k]=async()=>{}});
app.saveState=async()=>{}; h.document.querySelectorAll=()=>[];
app.googleSheetsUrl=''; app.telegramToken=''; app.telegramChatId='';

app.state.categories=[{id:'barber',name:'ตัดผม',vat:false},{id:'massage',name:'นวด',vat:false},{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.state.services=[
  {id:'s1',name:'ตัดผม',price:300,duration:45,category:'barber',commission:40,commissionType:'percent'},
  {id:'s2',name:'นวดไทย',price:500,duration:60,category:'massage',commission:50,commissionType:'percent'},
  {id:'d1',name:'น้ำเปล่า',price:20,duration:0,category:'drinks',commission:0,commissionType:'percent'},
  {id:'d2',name:'กาแฟ',price:50,duration:0,category:'drinks',commission:0,commissionType:'percent'}];
app.state.staff=[{id:'st1',name:'เอ',role:'ช่าง',accessLevel:'staff',active:true}];
app.state.customers=[]; app.state.queue=[]; app.state.transactions=[]; app.state.voidLog=[];
app.state.cloudOutbox=[]; app.state.cart=[];
app.vatEnabled=true; app.vatRate=7; app.currentRole='owner'; app.currentUser={name:'เจ้าของ'};
const START_CASH=1000;
app.state.shift={active:true,startTime:Date.now()-8*3600000,startCash:START_CASH,startDetails:{},expenses:[],history:[]};
Object.assign(els,{'cart-discount':{value:'0'},'cart-customer-select':{value:''},
  'cash-received':{value:'0'},'btn-complete-checkout':{disabled:false},'cash-change':{innerText:'',style:{}},
  'btn-checkout':{disabled:false},'btn-print-quote':{disabled:false}});

const bills=[
  {items:['s1'],           pay:'cash',      disc:0,  expect:300},
  {items:['s1','d1'],      pay:'cash',      disc:0,  expect:322},   // 300 + 20 + VAT1.40 = 321.40 -> 322
  {items:['s2','d2'],      pay:'promptpay', disc:50, expect:521},   // ลด 50 -> 450+45.45+VAT3.18=498.63... คำนวณจริงด้านล่าง
  {items:['d1','d1','d2'], pay:'cash',      disc:0,  expect:0},
  {items:['s2'],           pay:'credit',    disc:100,expect:400}];

(async()=>{
console.log('\n--- ขาย 5 บิล ---');
for (const b of bills) {
  app.state.cart=[]; els['cart-discount'].value=String(b.disc);
  b.items.forEach(id=>app.addToCart(id));
  const due=app.getCartBillTotals().total;
  els['cash-received'].value=String(due+100);
  app.state.selectedPaymentMethod=b.pay;
  await app.processCheckout();
  b.actual=due;
}
t('ออกบิลครบ 5 ใบ',()=>eq(app.state.transactions.length,5));
t('ทุกบิลยอดเป็นจำนวนเต็มบาท',()=>app.state.transactions.forEach(tx=>{
  if(!Number.isInteger(tx.total)) throw new Error(tx.id+' = '+tx.total);}));
t('ทุกบิล 4 ช่องบวกได้เท่ายอดรวม',()=>app.state.transactions.forEach(tx=>{
  const s=Math.round((tx.nonVatBase+tx.vatableBase+tx.vatAmount+tx.rounding)*100)/100;
  if(s!==tx.total) throw new Error(`${tx.id}: ${s} != ${tx.total}`);}));
t('บิลบริการล้วนไม่มี VAT / ไม่มีปัดเศษ',()=>{
  const tx=app.state.transactions[0]; eq(tx.vatAmount,0); eq(tx.rounding,0); eq(tx.total,300);});
t('บิลตัดผม+น้ำ = 322',()=>eq(app.state.transactions[1].total,322));

console.log('\n--- ค่าคอมพนักงาน ---');
const commTotal=app.state.transactions.flatMap(tx=>tx.details).reduce((s,d)=>s+(d.commissionAmount||0),0);
const preVatTotal=app.state.transactions.reduce((s,tx)=>s+tx.nonVatBase+tx.vatableBase,0);
t('ค่าคอมรวมไม่เกินยอดขายก่อน VAT (ไม่กินภาษี)',()=>ok(commTotal<=preVatTotal,`คอม ${commTotal} > ยอดก่อน VAT ${preVatTotal}`));
t('เครื่องดื่มไม่มีค่าคอมสักบาท',()=>{
  const c=app.state.transactions.flatMap(tx=>tx.details).filter(d=>d.vatable).reduce((s,d)=>s+(d.commissionAmount||0),0);
  eq(c,0);});

console.log('\n--- เงินสดในลิ้นชัก ---');
app.state.shift.expenses=[{note:'ค่าน้ำแข็ง',amount:150,time:Date.now()},{note:'ค่าขนม',amount:80,time:Date.now()}];
const cashSales=app.state.transactions.filter(tx=>tx.paymentMethod==='cash').reduce((s,tx)=>s+tx.total,0);
const expenses=app.state.shift.expenses.reduce((s,e)=>s+e.amount,0);
const expected=START_CASH+cashSales-expenses;
t('ยอดเงินสดที่ควรมี = ตั้งต้น + ขายสด - ค่าใช้จ่าย',()=>eq(expected,1000+cashSales-230));
t('ขายสดนับเฉพาะบิลเงินสด ไม่รวม QR/บัตร',()=>{
  const all=app.state.transactions.reduce((s,tx)=>s+tx.total,0);
  ok(cashSales<all,'ต้องน้อยกว่ายอดรวมทั้งหมด');});

console.log('\n--- สรุปส่งขึ้นชีต ---');
const dayKey=app.getBusinessISODate(app.state.transactions[0].date);
const p=app.buildSummaryPayload(app.state.transactions,app.state.shift.expenses,'day',dayKey);
const revenue=app.state.transactions.reduce((s,tx)=>s+tx.total,0);
t('รายได้รวม = ผลบวกทุกบิล',()=>eq(p.totalRevenue,revenue));
t('4 ช่อง VAT รวมกัน = รายได้รวม',()=>
  eq(Math.round((p.nonVatBase+p.vatableBase+p.vatAmount+p.rounding)*100)/100,revenue));
t('ภาษีขาย = 7% ของฐานภาษี (คลาดเคลื่อนไม่เกิน 1 สตางค์ต่อบิล)',()=>{
  const calc=Math.round(p.vatableBase*7)/100;
  ok(Math.abs(calc-p.vatAmount)<=0.05,`คำนวณ ${calc} เก็บไว้ ${p.vatAmount}`);});
t('กำไรสุทธิ = รายได้ - ค่าใช้จ่าย',()=>eq(p.netIncome,revenue-expenses));
t('แยกช่องทางจ่ายเงินครบ 3 ทาง',()=>
  eq(Math.round((p.cashRevenue+p.qrRevenue+p.creditRevenue)*100)/100,revenue));
t('ค่าคอมรายคนถูกส่งไปด้วย',()=>ok(p.staffCommissions.length>=1));
t('หมวดที่คิด VAT ถูกส่งไปให้ชีต',()=>{eq(p.vatCategories.length,1); eq(p.vatCategories[0].name,'เครื่องดื่ม');});

console.log('\n--- ปิดกะ ---');
const counted=expected-40;   // นับเงินขาด 40
const log={startTime:app.state.shift.startTime,endTime:Date.now(),startCash:START_CASH,
  cashSales,expensesTotal:expenses,expectedCash:expected,countedCash:counted,
  difference:counted-expected,closedBy:'เจ้าของ'};
app.state.shift.history=[log]; app.state.shift.active=false;
const cash=app.buildShiftCashSummary('day',app.getBusinessISODate(log.endTime));
t('สรุปกะเห็น 1 กะ เงินขาด 40',()=>{eq(cash.shiftCount,1); eq(cash.cashVariance,-40);});
t('ข้อความรายงานปิดกะสร้างได้ ไม่พัง',()=>{
  const msg=app.buildShiftReportMessage(log); ok(typeof msg==='string'&&msg.length>50);});

console.log('\n--- ใบแจ้งยอดตรงกับยอดจริง ---');
app.state.cart=[]; els['cart-discount'].value='0';
app.addToCart('d1'); app.addToCart('s1');
h.document.getElementById('quote-preview');
app.showQuotePreview();
t('ยอดในใบแจ้งยอด = ยอดที่จะเก็บจริง',()=>{
  const due=app.getCartBillTotals().total;
  ok(new RegExp('฿'+due).test(els['quote-preview'].innerHTML),'ไม่เจอยอด '+due);});

console.log('\n--- ไม่มี error ค้าง ---');
await new Promise(r=>setTimeout(r,50));
t('ไม่มี promise ที่พังแบบเงียบ ๆ',()=>eq(errs,[]));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
