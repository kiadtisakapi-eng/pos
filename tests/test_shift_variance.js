// ทดสอบ "ส่วนต่างเงินสดตอนปิดกะ" ตั้งแต่ต้นทางถึงปลายทาง
// แอป (สร้างตัวเลข) → payload → Apps Script (เขียนลงชีต)
const path=require('path'), fs=require('fs'), vm=require('vm');
const h=require('./harness.js');
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

// ── โหลด Apps Script พร้อมของปลอม ─────────────────────────
function FakeSheet(headers,rows){
  const grid=[ (headers||[]).slice(), ...(rows||[]).map(r=>r.slice()) ];
  const api={ _grid:grid,
    getLastColumn:()=>grid[0]?grid[0].length:0,
    getLastRow:()=>grid.length,
    getRange:(r,c,nr,nc)=>{ nr=nr||1;nc=nc||1;
      const cell={ getDisplayValue:()=>String(grid[r-1]&&grid[r-1][c-1]!==undefined?grid[r-1][c-1]:''),
        getDisplayValues:()=>{const o=[];for(let i=0;i<nr;i++){const w=[];for(let j=0;j<nc;j++)w.push(String((grid[r-1+i]&&grid[r-1+i][c-1+j])??''));o.push(w)}return o},
        setValue:v=>{while(grid.length<r)grid.push([]);const row=grid[r-1];while(row.length<c)row.push('');row[c-1]=v;return cell},
        setBackground:()=>cell,setFontColor:()=>cell,setFontWeight:()=>cell,setNumberFormat:()=>cell,
        setHorizontalAlignment:()=>cell,setFontSize:()=>cell,merge:()=>cell };
      return cell; },
    insertColumnBefore:c=>grid.forEach(row=>row.splice(c-1,0,'')),
    autoResizeColumns:()=>{}, setFrozenRows:()=>{} };
  return api;
}
const g={console,Date,JSON,String,Number,Math,Array,Object,isNaN,parseInt,parseFloat,RegExp};
g.SpreadsheetApp={flush:()=>{}};
g.ContentService={createTextOutput:s=>({setMimeType:()=>s}),MimeType:{JSON:'json'}};
g.MimeType={PLAIN_TEXT:'text/plain'};
g.Session={getScriptTimeZone:()=>'Asia/Bangkok'};
g.Utilities={formatDate:(d,tz,p)=>{ // จำลอง timezone ไทย (UTC+7) แบบง่าย
  const x=new Date(d.getTime()+7*3600*1000);
  const p2=n=>String(n).padStart(2,'0');
  return p.replace('yyyy',x.getUTCFullYear()).replace('MM',p2(x.getUTCMonth()+1))
          .replace('dd',p2(x.getUTCDate())).replace('HH',p2(x.getUTCHours())).replace('mm',p2(x.getUTCMinutes()));}};
g.DriveApp={getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>null};
g.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','google_apps_script.js'),'utf8'),g,{filename:'gas.js'});

// ── สร้างประวัติกะปลอม ────────────────────────────────────
const H=(o)=>Object.assign({ startTime:Date.parse('2026-07-27T04:00:00Z'), endTime:Date.parse('2026-07-27T13:00:00Z'),
  startCash:1000, cashSales:5000, expensesTotal:200, expectedCash:5800, countedCash:5750, difference:-50,
  closedBy:'เอ' },o);

function setHistory(list){ app.state.shift={active:false,startTime:null,startCash:0,startDetails:{},expenses:[],history:list}; }
function newMaster(){ return FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',g.MASTER_VAR_HEADER,g.MASTER_TS_HEADER],[]); }

console.log('\n--- 1) ต้นทาง: แอปคำนวณส่วนต่างถูกไหม ---');
setHistory([H({})]);
const dayKey=app.getBusinessISODate(Date.parse('2026-07-27T13:00:00Z'));
let c=app.buildShiftCashSummary('day',dayKey);
t('นับกะได้ 1 กะ',()=>eq(c.shiftCount,1));
t('ส่วนต่างรวม = -50',()=>eq(c.cashVariance,-50));
t('ส่งฟิลด์ครบตามที่ชีตต้องใช้',()=>{
  const r=c.shifts[0];
  ['startTime','endTime','closedBy','startCash','cashSales','expenses','expected','counted','difference']
    .forEach(k=>ok(k in r,'ขาดฟิลด์ '+k));
  eq(r.expenses,200,'expensesTotal ต้อง map มาเป็น expenses');
});

console.log('\n--- 2) กะเก่าที่ยังไม่มีฟิลด์ expectedCash ---');
setHistory([H({expectedCash:undefined})]);
c=app.buildShiftCashSummary('day',dayKey);
t('คำนวณย้อนให้ = 1000+5000-200 = 5800',()=>eq(c.shifts[0].expected,5800));

console.log('\n--- 3) ค่าพัง (NaN / undefined / string) ---');
setHistory([H({startCash:NaN,cashSales:undefined,expensesTotal:'พัง',expectedCash:NaN,countedCash:null,difference:undefined})]);
c=app.buildShiftCashSummary('day',dayKey);
t('ไม่มี NaN หลุดขึ้นชีต',()=>{
  const r=c.shifts[0];
  Object.keys(r).forEach(k=>{ if(typeof r[k]==='number') ok(isFinite(r[k]),k+' เป็น NaN'); });
  eq(c.cashVariance,0);
});

console.log('\n--- 4) กะที่ยังเปิดอยู่ ต้องไม่ถูกนับ ---');
app.state.shift={active:true,startTime:Date.parse('2026-07-27T04:00:00Z'),startCash:1000,startDetails:{},expenses:[],history:[]};
c=app.buildShiftCashSummary('day',dayKey);
t('ยังไม่ปิดกะ = 0 กะ (ยังไม่มีการนับเงิน)',()=>{eq(c.shiftCount,0);eq(c.cashVariance,0);});

console.log('\n--- 5) ปลายทาง: ตัวเลขลงชีตจริงไหม ---');
setHistory([H({})]);
const payload=app.buildSummaryPayload(
  [{date:'2026-07-27T06:00:00Z',total:5000,paymentMethod:'cash',details:[]}],
  [{note:'ค่าน้ำ',amount:200}],'day',dayKey);
t('payload มี cashVariance / shiftCount / shiftCash',()=>{
  eq(payload.cashVariance,-50); eq(payload.shiftCount,1); eq(payload.shiftCash.length,1);});

const daily=FakeSheet([],[]);
g.writeSummarySheet(daily,payload,'รายวัน: '+dayKey);
const flat=daily._grid.map(r=>r.map(x=>String(x)));
t('ชีตรายวันมีบล็อก "การนับเงินสดปิดกะ"',()=>ok(flat.some(r=>r.includes('การนับเงินสดปิดกะ'))));
t('ชีตรายวันมีหัวคอลัมน์ "ขาด/เกิน (฿)"',()=>ok(flat.some(r=>r.includes('ขาด/เกิน (฿)'))));
t('ชีตรายวันมีตัวเลข -50 อยู่จริง',()=>ok(daily._grid.some(r=>r.includes(-50))));
t('ชีตรายวันมีชื่อผู้ปิดกะ',()=>ok(flat.some(r=>r.includes('เอ'))));
t('แถวรวมแสดงเงินตั้งต้น/ขายสด/ค่าใช้จ่าย',()=>ok(flat.some(r=>r.some(x=>/รวม · เงินตั้งต้น 1,000.00 · ขายสด 5,000.00 · ค่าใช้จ่าย 200.00/.test(x)))));

const master=newMaster();
g.writeToMaster(master,2,'day',dayKey,payload);
t('ชีต "สรุปรายเดือน" ลงคอลัมน์เงินขาด/เกิน = -50',()=>eq(master._grid[1][6],-50));

console.log('\n--- 6) ปิด 2 กะในวันเดียว (-100 กับ +100) ---');
setHistory([ H({difference:-100,closedBy:'เอ'}),
             H({startTime:Date.parse('2026-07-27T13:30:00Z'),endTime:Date.parse('2026-07-27T18:00:00Z'),difference:100,closedBy:'บี'}) ]);
c=app.buildShiftCashSummary('day',dayKey);
t('master จะโชว์ยอดสุทธิ = 0 (ข้อจำกัดที่ยอมรับไว้)',()=>eq(c.cashVariance,0));
const p2=app.buildSummaryPayload([],[],'day',dayKey);
const d2=FakeSheet([],[]); g.writeSummarySheet(d2,p2,'x');
t('แต่ชีตรายวันยังเห็นครบทั้ง -100 และ +100',()=>{
  ok(d2._grid.some(r=>r.includes(-100)),'ไม่เจอ -100');
  ok(d2._grid.some(r=>r.includes(100)),'ไม่เจอ +100');
  ok(d2._grid.some(r=>r.includes('บี')),'ไม่เจอชื่อกะที่สอง');
});

console.log('\n--- 7) ยังไม่มีกะปิดเลย ---');
setHistory([]);
const p3=app.buildSummaryPayload([],[],'day',dayKey);
const d3=FakeSheet([],[]); g.writeSummarySheet(d3,p3,'x');
t('ไม่โชว์ตารางเปล่า',()=>ok(!d3._grid.some(r=>r.map(String).includes('การนับเงินสดปิดกะ'))));
const m3=newMaster(); g.writeToMaster(m3,2,'day',dayKey,p3);
t('master โชว์ "—" ไม่ใช่ 0 (แยกจาก "นับเงินตรงพอดี")',()=>eq(m3._grid[1][6],'—'));

console.log('\n--- 8) กะคร่อมเที่ยงคืน + สรุปรายเดือน ---');
const lateStart=Date.parse('2026-07-27T15:00:00Z'); // 22:00 ไทย
const lateEnd  =Date.parse('2026-07-27T20:00:00Z'); // 03:00 ไทย ของวันถัดไป
setHistory([H({startTime:lateStart,endTime:lateEnd,difference:-25})]);
const bizDay=app.getBusinessISODate(lateEnd);
const monKey=app.getBusinessMonthKey(lateEnd);
t('กะตี 3 ถูกนับเป็นวันทำการเดิม',()=>eq(app.buildShiftCashSummary('day',bizDay).shiftCount,1));
t('สรุปรายเดือนก็เห็นกะนี้',()=>eq(app.buildShiftCashSummary('month',monKey).cashVariance,-25));
const pm=app.buildSummaryPayload([],[],'month',monKey);
const dm=FakeSheet([],[]); g.writeSummarySheet(dm,pm,'รายเดือน');
t('ป้ายกำกับกะในชีตรายเดือนมีวันที่ (แยกออกว่ากะไหนวันไหน)',()=>{
  const lbl=g.shiftRangeLabel({startTime:lateStart,endTime:lateEnd});
  ok(/^07-27 22:00→03:00$/.test(lbl),'got '+lbl);
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
