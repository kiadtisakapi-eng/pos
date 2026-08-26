// เทสต์ขอบ: เคสที่ผู้ใช้ทำได้จริงแล้วเคยทำระบบพัง
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
// t() เป็นแบบ sync ตั้งใจ — ถ้าเผลอส่งฟังก์ชัน async เข้ามา มันจะ "ผ่าน" ทันทีโดยไม่ได้ตรวจอะไรเลย
// (เคยเขียนพลาดมาแล้ว เทสต์ขึ้น PASS ทั้งที่ยังไม่ได้รันจริง) จึงดักไว้ให้ FAIL เสียงดังแทน
// วิธีที่ถูก: await ผลไว้ข้างนอกก่อน แล้วค่อยส่งค่าที่ได้เข้า t()
const t=(n,f)=>{try{const r=f();
  if(r&&typeof r.then==='function'){fail++;console.log('  FAIL',n,'-> ฟังก์ชันทดสอบคืน Promise แต่ t() ไม่รอ async ให้ await ผลไว้ข้างนอกก่อน');return;}
  pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
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
// v1.5.1+ หน้าต่างแก้บิลทำงานบน "ร่าง" (_editTxDraft) ที่สร้างตอนเปิดหน้าต่าง
// เดิมเทสต์ลัดเรียก saveTransactionEdit() ตรง ๆ ซึ่งเป็นเส้นทางที่ผู้ใช้ทำไม่ได้
// (ปุ่มบันทึกอยู่ในหน้าต่าง ต้องเปิดก่อนเสมอ) — เรียก openTransactionEdit ก่อนให้ตรงกับของจริง
app.openTransactionEdit('TX1');
await app.saveTransactionEdit();
let tx=app.state.transactions[0];
t('แก้บิลแล้วยอดรวมยังเป็น 386 (ไม่หล่นกลับเป็น 380)',()=>eq(tx.total,386));
t('4 ช่องยังบวกได้เท่ายอดรวม',()=>eq(Math.round((tx.nonVatBase+tx.vatableBase+tx.vatAmount+tx.rounding)*100)/100,386));

// แก้โดยใส่ส่วนลด 80
app.state.transactions=[mkTx()];
app.openTransactionEdit('TX1');
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
app.openTransactionEdit('TX1');
h.document._els['edit-tx-discount'].value='0';
app.vatEnabled=false; app.vatRate=10;   // เจ้าของปิดสวิตช์ + เปลี่ยนอัตราไปแล้ว
await app.saveTransactionEdit();
tx=app.state.transactions[0];
t('บิลเก่ายังใช้อัตรา 7% ของตัวเอง ไม่โดนค่าตั้งค่าปัจจุบันทับ',()=>{
  eq(tx.vatAmount,5.60); eq(tx.total,386);});
app.vatEnabled=true; app.vatRate=7;

console.log('\n--- ยอดตัวอย่างในหน้าต่างแก้ไข ต้องตรงกับที่บันทึกจริง ---');
app.state.transactions=[mkTx()];
app.openTransactionEdit('TX1');
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

console.log('\n--- ยกเลิกบิลตอนเครื่องเขียนข้อมูลไม่ได้ (บั๊กที่เพิ่งแก้) ---');
// เคสที่แย่ที่สุดของระบบนี้: ถ้า IndexedDB เขียนไม่สำเร็จแล้วระบบยังเดินต่อ
// บิลจะหายจากชีตถาวรแต่ยังอยู่ใน iPad และไม่มีอะไรเตือนว่าสองที่ไม่ตรงกัน
// (บิลที่ syncStatus='synced' จะไม่ถูกส่งขึ้นชีตใหม่อีกเลย)
app.currentRole='owner';
app.currentUser={id:'__owner__',name:'เจ้าของร้าน'};
app.googleSheetsUrl='https://script.google.com/macros/s/TESTONLY/exec';
app.googleSheetsApiToken='T'.repeat(40);
app.telegramToken=''; app.telegramChatId='';
app.closeModal=()=>{}; app.filterReports=()=>{};

let flushCount=0;
// ต้องดึงจาก prototype — ตัวบน instance ถูก stub ทิ้งไปตั้งแต่ต้นไฟล์แล้ว
const realFlushCloudOutbox=Object.getPrototypeOf(app).flushCloudOutbox.bind(app);
app.flushCloudOutbox=async()=>{ flushCount++; };
let pendingConfirm=null;
app.showConfirm=(msg,cb)=>{ pendingConfirm=cb(); };

const mkVoidTx=()=>({id:'TXV',date:Date.now(),customerName:'ลูกค้า',customerId:'c1',
  services:['ตัดผม'],details:[],subtotal:300,discount:0,total:300,
  paymentMethod:'cash',staffNames:['เอ'],syncStatus:'synced'});
const resetVoidCase=()=>{
  app.state.transactions=[mkVoidTx()];
  app.state.customers=[{id:'c1',name:'ลูกค้า',visitCount:5,tier:'ทอง (Gold)'}];
  app.state.voidLog=[]; app.state.cloudOutbox=[];
  flushCount=0; pendingConfirm=null;
  h.document.getElementById('edit-tx-id').value='TXV';
};

// ── เขียนลงเครื่องไม่สำเร็จ → ต้องคืนทุกอย่างกลับ และห้ามแตะชีต ──
resetVoidCase();
app.saveState=async()=>false;
await app.voidTransaction(); await pendingConfirm;
t('เขียนไม่สำเร็จ: บิลต้องยังอยู่ในเครื่อง',()=>ok(app.state.transactions.some(x=>x.id==='TXV')));
t('เขียนไม่สำเร็จ: ห้ามมีประวัติ void ค้าง',()=>eq(app.state.voidLog.length,0));
t('เขียนไม่สำเร็จ: ห้ามคิวคำสั่งลบแถวในชีต',()=>eq(app.state.cloudOutbox.length,0));
t('เขียนไม่สำเร็จ: ห้ามยิง outbox ไปแตะชีตเลย',()=>eq(flushCount,0));
t('เขียนไม่สำเร็จ: จำนวนครั้งของลูกค้าต้องกลับเป็น 5',()=>eq(app.state.customers[0].visitCount,5));
t('เขียนไม่สำเร็จ: ระดับสมาชิกต้องกลับเป็นทอง',()=>eq(app.state.customers[0].tier,'ทอง (Gold)'));

// ── เขียนสำเร็จ → ต้องทำงานครบตามปกติ ──
resetVoidCase();
app.saveState=async()=>true;
await app.voidTransaction(); await pendingConfirm;
t('เขียนสำเร็จ: บิลถูกลบออกจริง',()=>ok(!app.state.transactions.some(x=>x.id==='TXV')));
t('เขียนสำเร็จ: มีประวัติ void 1 รายการ',()=>eq(app.state.voidLog.length,1));
t('เขียนสำเร็จ: มีคำสั่งลบแถวในชีตรออยู่',()=>ok(app.state.cloudOutbox.some(i=>i.needVoidDelete)));
t('เขียนสำเร็จ: ยิง outbox 1 ครั้ง',()=>eq(flushCount,1));
t('เขียนสำเร็จ: จำนวนครั้งของลูกค้าลดเหลือ 4',()=>eq(app.state.customers[0].visitCount,4));

console.log('\n--- เกณฑ์ "ลบแถวในชีตสำเร็จ" ต้องดูที่รหัส ไม่ใช่ข้อความไทย ---');
// ถ้าเกณฑ์นี้ผิดทาง "ตอบ true ทั้งที่ยังไม่ได้ลบ" = แถวผีค้างในชีตถาวร
// ถ้าผิดอีกทาง "ตอบ false ทั้งที่ลบไปแล้ว" = งานค้างในคิว ยิงซ้ำตลอดกาล (คิวไม่มีวันหมดอายุ)
const voidArgs = { id:'TX-1', date:Date.now(), monthKey:'08-2026', voidedBy:'เจ้าของร้าน' };
const replyWith = (obj) => { app.fetchWithTimeout = async () => ({ ok:true, json: async()=>obj }); };
const askDelete = async (obj) => { replyWith(obj); return await app.postVoidDelete(voidArgs); };

const rOk       = await askDelete({status:'success'});
const rCode     = await askDelete({status:'error',code:'NOT_FOUND',message:'row already gone'});
const rOldBill  = await askDelete({status:'error',message:'ไม่พบบิลเลขที่ TX-1 ใน Sheets'});
const rOldSheet = await askDelete({status:'error',message:'ไม่พบแผ่นงานของเดือนนี้'});
const rNoBody   = await askDelete({status:'error',message:'ไม่พบข้อมูลที่ส่งมา'});
const rDenied   = await askDelete({status:'error',message:'ไม่ได้รับอนุญาต (unauthorized)'});
t('ชีตตอบ success = สำเร็จ',()=>ok(rOk));
t('ชีตรุ่นใหม่ตอบ code NOT_FOUND = ถือว่าลบแล้ว (แม้ข้อความจะถูกแก้คำไปแล้ว)',()=>ok(rCode));
t('ชีตรุ่นเก่าตอบ "ไม่พบบิลเลขที่..." = ยังต้องอ่านออก (ทางถอยตอนยังไม่ได้วางโค้ด GAS ใหม่)',()=>ok(rOldBill));
t('ชีตรุ่นเก่าตอบ "ไม่พบแผ่นงานของเดือนนี้" = ถือว่าลบแล้ว',()=>ok(rOldSheet));
t('"ไม่พบข้อมูลที่ส่งมา" ต้อง NOT ถือว่าสำเร็จ — คำขอไปถึงแบบตัวเปล่า ต้องลองใหม่',()=>ok(!rNoBody));
t('unauthorized ต้องลองใหม่ ไม่ใช่ทิ้งคำสั่งลบ',()=>ok(!rDenied));

console.log('\n--- คิวงานคลาวด์: ตัวนับ backoff ต้องถูกบันทึกลงเครื่อง ---');
// เดิมบันทึกเฉพาะตอนมีงานสำเร็จอย่างน้อย 1 ชิ้น — กรอก URL ผิดแล้วล้มหมด
// ตัวนับจะอยู่แค่ในหน่วยความจำ ปิดแอปแล้วหาย เปิดใหม่ยิงรัวตั้งแต่ต้นทุกครั้ง
app.state.cloudOutbox=[{ id:'cob-1', createdAt:Date.now(), dateKeys:['2026-08-26'], monthKeys:['08-2026'],
  needSummary:true, needTelegram:false, telegramMessage:'', tries:0 }];
app._flushingOutbox=false;
let savesDuringFlush=0;
app.saveState=async()=>{ savesDuringFlush++; return true; };
app.syncDailySummary=async()=>false;    // ยิงไม่ผ่านทั้งคู่
app.syncMonthlySummary=async()=>false;
await realFlushCloudOutbox();
t('ล้มเหลวทั้งหมด: ยังต้องเซฟตัวนับลงเครื่อง',()=>ok(savesDuringFlush>=1));
t('ล้มเหลวทั้งหมด: tries ต้องขึ้นเป็น 1',()=>eq(app.state.cloudOutbox[0].tries,1));
t('ล้มเหลวทั้งหมด: งานยังต้องค้างในคิว ไม่ถูกทิ้ง',()=>ok(app.state.cloudOutbox[0].needSummary));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
