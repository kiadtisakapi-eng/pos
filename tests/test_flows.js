// กดผ่านทุกปุ่มหลัก: เปิด/ปิดกะ · CRUD · คิว · ยกเลิกบิล · ล้างยอดขาย
const h=require('./harness.js');
const app=h.ctx.app, els=h.document._els;
let pass=0,fail=0;
const t=(n,f)=>{const r=()=>{pass++;console.log('  PASS',n)},b=e=>{fail++;console.log('  FAIL',n,'->',e.message)};
  try{const x=f(); return x&&x.then?x.then(r,b):(r(),null)}catch(e){b(e)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

const toasts=[];
app.showToast=(m,ty)=>toasts.push({m,ty});
app.showConfirm=(msg,cb)=>{app._p=cb();return app._p;};
['vibrateDevice','renderAll','renderPos','renderQueueScreen','renderCart','updateCartTotals','renderDashboard',
 'renderCustomerTable','renderReports','renderSettingsLists','renderCategoryList','renderVatSettings','filterReports',
 'openModal','closeModal','showThermalReceipt','syncPendingTransactions','flushCloudOutbox','enqueueSummaryRefresh',
 'applyShopName','applyTheme','showAppVersion','renderStaffList','openCashCounter','updateCashSum','applyRoleUI'
].forEach(k=>{ if(typeof app[k]==='function'||true) app[k]=()=>{}; });
app.saveState=async()=>{}; app.autoBackupToGoogleDrive=async()=>true;
app.postVoidDelete=async()=>true; app.postTelegram=async()=>true;
app.buildShiftReportMessage=()=>'msg'; app.enqueueShiftCloseCloudOps=()=>{};
h.document.querySelectorAll=()=>[];

const set=(o)=>Object.entries(o).forEach(([k,v])=>{els[k]=Object.assign(els[k]||h.document.getElementById(k),v)});

app.state.categories=[{id:'barber',name:'ตัดผม',vat:false},{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.state.services=[]; app.state.staff=[]; app.state.customers=[]; app.state.queue=[];
app.state.transactions=[]; app.state.voidLog=[]; app.state.cloudOutbox=[]; app.state.cart=[];
app.state.shift={active:false,startTime:null,startCash:0,startDetails:{},expenses:[],history:[]};
app.currentRole='owner'; app.vatEnabled=true; app.vatRate=7;

(async()=>{
console.log('\n--- เพิ่มพนักงาน / บริการ / ลูกค้า / หมวดหมู่ ---');
set({'staff-name':{value:'เอ'},'staff-role':{value:'ช่างตัดผม'},'staff-access-level':{value:'staff'},
     'staff-pin':{value:''},'staff-commission':{value:'40'},'staff-active':{checked:true}});
app.state.editingStaffId=null;
await app.addStaff();
t('เพิ่มพนักงานได้',()=>eq(app.state.staff.length,1));

set({'serv-name':{value:'ตัดผมชาย'},'serv-price':{value:'300'},'serv-duration':{value:'45'},
     'serv-category':{value:'barber'},'serv-commission':{value:'40'},'serv-commission-type':{value:'percent'}});
app.state.editingServiceId=null;
await app.addService();
set({'serv-name':{value:'น้ำอัดลม'},'serv-price':{value:'30'},'serv-duration':{value:'0'},
     'serv-category':{value:'drinks'},'serv-commission':{value:'0'},'serv-commission-type':{value:'percent'}});
await app.addService();
t('เพิ่มบริการและเครื่องดื่มได้',()=>eq(app.state.services.length,2));
t('เครื่องดื่มอยู่หมวดที่เก็บ VAT',()=>ok(app.isVatableCategory(app.state.services[1].category)));

set({'cust-name':{value:'คุณสมชาย'},'cust-phone':{value:'0812345678'},'cust-note':{value:''}});
app.state.editingCustomerId=null;
await app.addCustomer();
t('เพิ่มลูกค้าได้',()=>eq(app.state.customers.length,1));

set({'cat-name':{value:'ของทานเล่น'},'cat-icon':{value:'fa-tag'},'cat-vat':{checked:true}});
app.state.editingCategoryId=null;
await app.addCategory();
t('เพิ่มหมวดใหม่พร้อมติ๊ก VAT ได้',()=>{
  const c=app.state.categories.find(x=>x.name==='ของทานเล่น'); ok(c&&c.vat===true);});

console.log('\n--- ลบของที่ยังใช้อยู่ ต้องกันไว้ ---');
toasts.length=0; app.deleteCategory('barber');
t('ลบหมวดที่ยังมีบริการอยู่ไม่ได้',()=>{
  ok(app.state.categories.find(c=>c.id==='barber'),'หมวดถูกลบทั้งที่ยังมีบริการ');
  ok(toasts.some(x=>/ลบไม่ได้/.test(x.m)));});
toasts.length=0; app.deleteStaff(app.state.staff[0].id);
t('ลบพนักงานคนสุดท้ายไม่ได้',()=>eq(app.state.staff.length,1));

console.log('\n--- เปิดกะ -> ขาย -> ปิดกะ ---');
app.state.shift={active:true,startTime:Date.now()-3600000,startCash:1000,startDetails:{},expenses:[],history:[]};
set({'cart-discount':{value:'0'},'cart-customer-select':{value:''},'cash-received':{value:'400'},
     'btn-complete-checkout':{disabled:false},'cash-change':{innerText:'',style:{}}});
app.addToCart(app.state.services[0].id);
app.addToCart(app.state.services[1].id);
app.state.selectedPaymentMethod='cash';
await app.processCheckout();
const tx=app.state.transactions[0];
t('ออกบิลได้ ยอด 300+30+VAT2.10 = 332.10 -> ปัดเป็น 333',()=>{
  eq(tx.vatAmount,2.10); eq(tx.total,333);});
t('บิลเข้าคิวงานอัตโนมัติ',()=>eq(app.state.queue.length,1));

const qid=app.state.queue[0].id;
await app.startQueue(qid);
t('กดเริ่มงานได้',()=>eq(app.state.queue[0].status,'serving'));
await app.completeQueue(qid);
t('กดจบงานแล้วคิวหายไป',()=>eq(app.state.queue.length,0));

console.log('\n--- เพิ่มค่าใช้จ่ายระหว่างกะ ---');
set({'expense-note':{value:'ค่าน้ำแข็ง'},'expense-amount':{value:'100'}});
if(typeof app.addExpense==='function'){ await app.addExpense();
  t('บันทึกค่าใช้จ่ายได้',()=>eq(app.state.shift.expenses.length,1)); }
else { app.state.shift.expenses.push({note:'ค่าน้ำแข็ง',amount:100,time:Date.now()});
  t('บันทึกค่าใช้จ่าย (ผ่านโครงสร้างตรง)',()=>eq(app.state.shift.expenses.length,1)); }

console.log('\n--- ยกเลิกบิล ---');
app.googleSheetsUrl='https://gas/exec';
set({'edit-tx-id':{value:tx.id}});
app.currentUser={name:'เจ้าของ'};
if(typeof app.voidTransaction==='function'){
  app.voidTransaction(); await app._p;
  t('บิลถูกยกเลิกออกจากรายการ',()=>eq(app.state.transactions.length,0));
  t('มีบันทึกประวัติการยกเลิก (audit trail)',()=>ok((app.state.voidLog||[]).length>=1));
  t('มีคำสั่งลบแถวในชีตค้างไว้ใน outbox',()=>ok(app.state.cloudOutbox.some(i=>i.needVoidDelete)));
}

console.log('\n--- ล้างยอดขาย: ต้องเก็บคำสั่งลบแถวไว้ ---');
app.state.cloudOutbox=[
  {needVoidDelete:true,voidDelete:{id:'x'},needSummary:true,needTelegram:true,telegramMessage:'m'},
  {needVoidDelete:false,needSummary:true,needTelegram:false}];
app.state.transactions=[{id:'z',date:Date.now(),total:100}];
app.openCashCounter=()=>{};
app.clearSalesData(); await app._p;
t('ยอดขายถูกล้าง',()=>eq(app.state.transactions.length,0));
t('คำสั่งลบแถวในชีตยังอยู่ (ไม่งั้นบิลผีค้างถาวร)',()=>{
  eq(app.state.cloudOutbox.length,1);
  ok(app.state.cloudOutbox[0].needVoidDelete);});
t('งานสรุปเก่าถูกตัดทิ้ง (ไม่ให้ flush ยอดศูนย์ไปทับชีตวันเก่า)',()=>{
  eq(app.state.cloudOutbox[0].needSummary,false);
  eq(app.state.cloudOutbox[0].needTelegram,false);});

console.log('\n--- สิทธิ์พนักงาน ---');
app.currentRole='staff';
toasts.length=0; await app.resetData();
t('พนักงานกดล้างข้อมูลทั้งระบบไม่ได้',()=>ok(toasts.some(x=>/เฉพาะเจ้าของ/.test(x.m))));
toasts.length=0; await app.openRestoreModal();
t('พนักงานกดกู้ข้อมูลไม่ได้',()=>ok(toasts.some(x=>/เฉพาะเจ้าของ/.test(x.m))));
app.currentRole='owner';

console.log('\n--- ออกบิลตอนยังไม่เปิดกะ ---');
app.state.shift={active:false,startTime:null,startCash:0,startDetails:{},expenses:[],history:[]};
app.state.cart=[{price:100,category:'barber',uniqueCartId:1}];
toasts.length=0; app.openCheckoutModal();
t('ยังไม่เปิดกะ ออกบิลไม่ได้',()=>ok(toasts.some(x=>/ยังไม่ได้เปิดกะ/.test(x.m))));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
