// เทสต์ต้นทางถึงปลายทาง: กดขายจริง -> บันทึกบิล -> ส่งขึ้นชีต -> ตัวเลขต้องกระทบยอดกันได้ทุกชั้น
const path=require('path'), fs=require('fs'), vm=require('vm');
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

// ── โหลด Apps Script พร้อมชีตปลอม ─────────────────────────
function FakeSheet(headers,rows){
  const grid=[(headers||[]).slice(),...(rows||[]).map(r=>r.slice())];
  const api={_grid:grid,
    getLastColumn:()=>grid[0]?grid[0].length:0, getLastRow:()=>grid.length,
    getRange:(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;const cell={
      getDisplayValue:()=>String(grid[r-1]&&grid[r-1][c-1]!==undefined?grid[r-1][c-1]:''),
      getDisplayValues:()=>{const o=[];for(let i=0;i<nr;i++){const w=[];for(let j=0;j<nc;j++)w.push(String((grid[r-1+i]&&grid[r-1+i][c-1+j])??''));o.push(w)}return o},
      setValue:v=>{while(grid.length<r)grid.push([]);const row=grid[r-1];while(row.length<c)row.push('');row[c-1]=v;return cell},
      setBackground:()=>cell,setFontColor:()=>cell,setFontWeight:()=>cell,setNumberFormat:()=>cell,
      setHorizontalAlignment:()=>cell,setFontSize:()=>cell,merge:()=>cell};return cell},
    insertColumnBefore:c=>grid.forEach(row=>row.splice(c-1,0,'')),
    autoResizeColumns:()=>{},setFrozenRows:()=>{}};
  return api;
}
const g={console,Date,JSON,String,Number,Math,Array,Object,isNaN,parseInt,parseFloat,RegExp};
g.SpreadsheetApp={flush:()=>{}};
g.ContentService={createTextOutput:s=>({setMimeType:()=>s}),MimeType:{JSON:'json'}};
g.MimeType={PLAIN_TEXT:'text/plain'}; g.Session={getScriptTimeZone:()=>'Asia/Bangkok'};
g.Utilities={formatDate:()=>'2026-08-03 12:00'};
g.DriveApp={getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>null};
g.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','google_apps_script.js'),'utf8'),g,{filename:'gas.js'});

// ── ตั้งร้าน ────────────────────────────────────────────
app.showToast=()=>{}; app.vibrateDevice=()=>{}; app.renderAll=()=>{}; app.renderPos=()=>{};
app.renderQueueScreen=()=>{}; app.renderCart=()=>{}; app.updateCartTotals=()=>{};
app.closeModal=()=>{}; app.openModal=()=>{}; app.showThermalReceipt=()=>{};
app.saveState=async()=>{}; app.syncPendingTransactions=()=>{}; app.flushCloudOutbox=()=>{};
app.enqueueSummaryRefresh=()=>{}; app.enqueueCloudOps=()=>{};

app.state.categories=[{id:'barber',name:'ตัดผมชาย',vat:false},{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.state.services=[
  {id:'s1',name:'ตัดผมชายวินเทจ',price:300,duration:45,category:'barber',commission:40,commissionType:'percent'},
  {id:'d1',name:'น้ำอัดลม',price:30,duration:0,category:'drinks',commission:0,commissionType:'percent'},
  {id:'d2',name:'กาแฟเย็น',price:50,duration:0,category:'drinks',commission:0,commissionType:'percent'}];
app.state.staff=[{id:'st1',name:'เอ',role:'ช่าง',accessLevel:'staff',active:true}];
app.state.customers=[]; app.state.queue=[]; app.state.transactions=[]; app.state.cloudOutbox=[];
app.state.shift={active:true,startTime:Date.now()-3600000,startCash:1000,startDetails:{},expenses:[],history:[]};
app.vatEnabled=true; app.vatRate=7;

const els=h.document._els;
Object.assign(els,{
  'cart-discount':{value:'0'},'cart-customer-select':{value:''},
  'cash-received':{value:'400'},'btn-complete-checkout':{disabled:false},
  'cash-change':{innerText:'',style:{}},'summary-subtotal':{},'summary-total':{}});

(async()=>{
console.log('\n--- ขายจริง: ตัดผม 300 + น้ำอัดลม 30 + กาแฟ 50 (เงินสด 400) ---');
app.addToCart('s1'); app.addToCart('d1'); app.addToCart('d2');
app.state.selectedPaymentMethod='cash';
await app.processCheckout();

const tx=app.state.transactions[0];
t('บันทึกบิล 1 ใบ',()=>eq(app.state.transactions.length,1));
t('ยอดที่ลูกค้าจ่าย = 386',()=>eq(tx.total,386));
t('4 ช่องบวกได้เท่ายอดรวม',()=>eq(Math.round((tx.nonVatBase+tx.vatableBase+tx.vatAmount+tx.rounding)*100)/100,tx.total));
t('บันทึกอัตราที่ใช้จริงติดบิล',()=>eq(tx.vatRate,7));
t('เงินทอนคิดจากยอดที่ปัดแล้ว (400-386=14)',()=>eq(tx.cashChange,14));
t('ธง vatable ติดไปกับแต่ละรายการ',()=>eq(tx.details.map(d=>d.vatable),[false,true,true]));
t('ค่าคอมช่าง 40% ของ 300 = 120 (ไม่ใช่ 154.40 ซึ่งคิดจากยอดรวม VAT)',()=>
  eq(tx.details[0].commissionAmount,120));
t('เครื่องดื่มไม่มีค่าคอม',()=>eq(tx.details[1].commissionAmount+tx.details[2].commissionAmount,0));

console.log('\n--- ส่งขึ้นชีต ---');
const dayKey=app.getBusinessISODate(tx.date);
const payload=app.buildSummaryPayload([tx],[],'day',dayKey);
t('payload: ฐานภาษี 80 · ภาษีขาย 5.60 · ปัดเศษ 0.40',()=>{
  eq(payload.vatableBase,80); eq(payload.vatAmount,5.60); eq(payload.rounding,0.40); eq(payload.nonVatBase,300);});
t('payload: รายได้รวม = ยอดที่ลูกค้าจ่าย',()=>eq(payload.totalRevenue,386));
t('payload: 4 ช่อง = รายได้รวม',()=>
  eq(Math.round((payload.nonVatBase+payload.vatableBase+payload.vatAmount+payload.rounding)*100)/100,payload.totalRevenue));
t('payload: แยกหมวดให้ชีต',()=>{eq(payload.vatCategories.length,1);eq(payload.vatCategories[0].name,'เครื่องดื่ม');});

const daily=FakeSheet([],[]);
g.writeSummarySheet(daily,payload,'รายวัน: '+dayKey);
const flat=daily._grid.map(r=>r.map(String));
t('ชีตรายวันมีบล็อก "ภาษีมูลค่าเพิ่ม"',()=>ok(flat.some(r=>r.includes('ภาษีมูลค่าเพิ่ม'))));
t('ชีตรายวันโชว์ชื่อหมวดและภาษีขาย',()=>{
  ok(flat.some(r=>r.includes('เครื่องดื่ม')),'ไม่เจอชื่อหมวด');
  ok(daily._grid.some(r=>r.includes(5.6)),'ไม่เจอภาษีขาย 5.60');});
t('ชีตรายวันบอกว่าเงินปัดเศษไม่ใช่ภาษี',()=>
  ok(flat.some(r=>r.some(x=>/ไม่ใช่ภาษี/.test(x)))));

const OLD8=['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',g.MASTER_VAR_HEADER,g.MASTER_TS_HEADER];
const master=FakeSheet(OLD8,[['เดือน','07-2026',842,468900,18240,450660,0,'2026-07-31']]);
g.migrateMasterAddVatColumns(master);
g.writeToMaster(master,3,'day',dayKey,payload);
const m=g.masterColumnMap_(master);
t('แถวเดือนเก่ายังอยู่ครบหลังแทรกคอลัมน์',()=>{
  eq(master._grid[1][m.revCol-1],468900,'รายได้เดือนเก่า');
  eq(master._grid[1][m.expCol-1],18240,'ค่าใช้จ่ายเดือนเก่า');
  eq(master._grid[1][m.netCol-1],450660,'กำไรเดือนเก่า');});
t('แถวใหม่ลงครบทุกช่องและบวกได้เท่ารายได้รวม',()=>{
  const v=[0,1,2,3].map(i=>master._grid[2][m.vatCols[i]-1]);
  eq(v,[300,80,5.6,0.4]);
  eq(Math.round((v[0]+v[1]+v[2]+v[3])*100)/100, master._grid[2][m.revCol-1]);});
t('ค่าใช้จ่าย/กำไรของแถวใหม่ไม่ไปทับช่อง VAT',()=>{
  eq(master._grid[2][m.expCol-1],0);
  eq(master._grid[2][m.netCol-1],386);});

console.log('\n--- บิลที่ 2: บริการล้วน ไม่มี VAT ---');
app.state.cart=[]; els['cart-discount'].value='0'; els['cash-received'].value='300';
app.addToCart('s1');
app.state.selectedPaymentMethod='cash';
await app.processCheckout();
const tx2=app.state.transactions[1];
t('ไม่มี VAT ไม่มีปัดเศษ ยอด 300',()=>{eq(tx2.total,300);eq(tx2.vatAmount,0);eq(tx2.rounding,0);});

const p2=app.buildSummaryPayload(app.state.transactions,[],'day',dayKey);
t('รวม 2 บิล: รายได้ 686 · ภาษียังเป็น 5.60 เท่าเดิม',()=>{
  eq(p2.totalRevenue,686); eq(p2.vatAmount,5.60); eq(p2.nonVatBase,600);});
t('4 ช่องรวม 2 บิลยังบวกลงตัว',()=>
  eq(Math.round((p2.nonVatBase+p2.vatableBase+p2.vatAmount+p2.rounding)*100)/100,686));

console.log('\n--- เงินสดในลิ้นชักต้องตรงกับยอดที่ปัดแล้ว ---');
const cashSales=app.state.transactions.filter(x=>x.paymentMethod==='cash').reduce((s,x)=>s+x.total,0);
t('ยอดขายเงินสด = 386 + 300 = 686 (ตรงกับเงินที่รับจริง)',()=>eq(cashSales,686));
t('เงินที่ควรมีในลิ้นชัก = ตั้งต้น 1000 + 686 = 1686',()=>eq(1000+cashSales,1686));

console.log('\n--- ปิดกะแล้วส่งสรุป: VAT ต้องไม่หายไป ---');
const p3=app.buildSummaryPayload(app.state.transactions,[{note:'ค่าน้ำ',amount:100}],'day',dayKey);
t('มีค่าใช้จ่ายแล้ว VAT ยังเท่าเดิม',()=>eq(p3.vatAmount,5.60));
t('กำไรสุทธิ = รายได้ - ค่าใช้จ่าย',()=>eq(p3.netIncome,686-100));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
