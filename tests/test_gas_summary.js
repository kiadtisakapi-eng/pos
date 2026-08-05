// ปิดช่องว่างของ test_gas.js: FakeSheet เดิมไม่รองรับ insertSheet/deleteSheet/setName
// ทำให้ replaceSummarySheet_, normalizeSummaryPayload_ และ handleTransaction ไม่เคยถูกทดสอบเลย
const fs=require('fs'), vm=require('vm');
const SRC=require('path').join(__dirname,'..','google_apps_script.js');
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};

// ── fake spreadsheet ที่รองรับ insertSheet/deleteSheet/setName จริง ──
function FakeSheet(name){
  const grid=[];
  let _name=name;
  const api={
    _grid:grid,
    getName:()=>_name, setName:(n)=>{ if(api._ss && api._ss._sheets.some(s=>s!==api && s.getName()===n)) throw new Error('duplicate name'); _name=n; return api; },
    getLastColumn:()=>grid[0]?grid[0].length:0,
    getLastRow:()=>grid.length,
    getRange:(r,c,nr,nc)=>{ nr=nr||1;nc=nc||1;
      const cell={
        getDisplayValue:()=>String((grid[r-1]&&grid[r-1][c-1])??''),
        getDisplayValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push(String((grid[r-1+i]&&grid[r-1+i][c-1+j])??''));o.push(row)}return o},
        getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((grid[r-1+i]&&grid[r-1+i][c-1+j])??'');o.push(row)}return o},
        setValue:(v)=>{while(grid.length<r)grid.push([]);const row=grid[r-1];while(row.length<c)row.push('');row[c-1]=v;return cell},
        setValues:(vals)=>{vals.forEach((rv,i)=>{while(grid.length<r+i)grid.push([]);const row=grid[r-1+i];rv.forEach((v,j)=>{while(row.length<c+j)row.push('');row[c-1+j]=v})});return cell},
        setBackground:()=>cell,setFontColor:()=>cell,setFontWeight:()=>cell,setNumberFormat:()=>cell,
        setHorizontalAlignment:()=>cell,setFontSize:()=>cell,merge:()=>cell,setWrap:()=>cell,setBorder:()=>cell,setFontFamily:()=>cell,setVerticalAlignment:()=>cell
      };
      return cell;},
    insertColumnBefore:(c)=>{grid.forEach(row=>row.splice(c-1,0,''))},
    autoResizeColumns:()=>{},setFrozenRows:()=>{},setColumnWidth:()=>{},
    appendRow:(r)=>{grid.push(r.slice())},
    getMaxColumns:()=>Math.max(10,grid[0]?grid[0].length:0),
    deleteColumns:()=>{}, clear:()=>{grid.length=0}, getCharts:()=>[], setTabColor:()=>{}
  };
  return api;
}
function FakeSS(){
  const ss={ _sheets:[],
    getSheets:()=>ss._sheets.slice(),
    getSheetByName:(n)=>ss._sheets.find(s=>s.getName()===n)||null,
    insertSheet:(n,pos)=>{const s=FakeSheet(n);s._ss=ss;if(pos===0)ss._sheets.unshift(s);else ss._sheets.push(s);return s},
    deleteSheet:(s)=>{const i=ss._sheets.indexOf(s);if(i<0)throw new Error('not found');ss._sheets.splice(i,1)}
  };
  return ss;
}
const ctx={console,Date,JSON,String,Number,Math,Array,Object,isNaN,isFinite,parseInt,parseFloat,RegExp,Error};
ctx.SpreadsheetApp={flush:()=>{},getActiveSpreadsheet:()=>null};
ctx.ContentService={createTextOutput:(s)=>({setMimeType:()=>s}),MimeType:{JSON:'json',TEXT:'text'}};
let uc=0;
ctx.Utilities={formatDate:()=>'2026-08-05 12:00',getUuid:()=>`0000-${++uc}`};
ctx.Session={getScriptTimeZone:()=>'Asia/Bangkok'};
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
ctx.Logger={log:()=>{}};
const sp={}; ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>sp[k]||null,setProperty:(k,v)=>{sp[k]=String(v)},deleteProperty:k=>{delete sp[k]}})};
ctx.DriveApp={getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({getId:()=>'x'}),getFolderById:()=>{throw new Error('nf')}};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(SRC,'utf8'),ctx,{filename:'gas.js'});
const g=ctx;

// payload สรุปรายวันแบบที่ app.js ส่งจริง
function daySummary(over){
  return Object.assign({
    action:'summary_day', dateKey:'2026-08-05',
    totalRevenue:5000, cashRevenue:3000, qrRevenue:2000, creditRevenue:0,
    billCount:12, avgBill:416.67, totalExpenses:500, netIncome:4500,
    cashVariance:0, shiftCount:1, shiftCash:[{}],
    nonVatBase:5000, vatableBase:0, vatAmount:0, rounding:0, vatRate:0,
    vatCategories:[], services:[{name:'ตัดผม',count:5,revenue:2500}],
    expenses:[{note:'ค่าน้ำ',amount:200}], staffCommissions:[{name:'A',count:5,commission:300}]
  }, over||{});
}

console.log('\n--- handleTransaction: บิลจริงจาก app.js ---');
t('บิลปกติผ่าน', ()=>{
  const ss=FakeSS(); const sh=ss.insertSheet('บิล-08-2026');
  const r=g.handleTransaction({id:'TX-1754400000000-AB12CD34',monthKey:'08-2026',date:Date.now(),
    dateTimeStr:'2026-08-05 12:00:00',customerName:'ลูกค้าทั่วไป (Walk-in)',services:['ตัดผม'],
    subtotal:300,discount:0,total:300,paymentMethod:'cash',staffNames:['A']}, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('บิล id สั้นสุด (Math.random ให้สตริงว่าง) ยังผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleTransaction({id:'TX-1754400000000-',monthKey:'08-2026',date:Date.now(),
    subtotal:300,discount:0,total:300,services:[],staffNames:[]}, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('บิลส่วนลดเต็มยอด (total=0) ยังผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleTransaction({id:'TX-1754400000001-XY',monthKey:'08-2026',date:Date.now(),
    subtotal:300,discount:300,total:0,services:[],staffNames:[]}, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('บิล VAT: total > subtotal (ปัดขึ้น) ยังผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleTransaction({id:'TX-1754400000002-Z',monthKey:'08-2026',date:Date.now(),
    subtotal:300,discount:0,total:321,services:[],staffNames:[]}, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('บิลไม่มี discount (undefined) ยังผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleTransaction({id:'TX-1754400000003-Q',monthKey:'08-2026',date:Date.now(),
    subtotal:300,total:300,services:[],staffNames:[]}, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});

console.log('\n--- normalizeSummaryPayload_ + replaceSummarySheet_ ---');
t('สรุปวันปกติ -> เขียนแท็บใหม่', ()=>{
  const ss=FakeSS();
  const r=g.handleDailySummary(daySummary(), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
  if(!ss.getSheetByName('สรุป-2026-08-05')) throw new Error('ไม่มีแท็บสรุป');
  if(!ss.getSheetByName('สรุปรายเดือน')) throw new Error('ไม่มี master');
});
t('ส่งซ้ำวันเดิม -> ทับได้ ไม่เหลือแท็บขยะ', ()=>{
  const ss=FakeSS();
  g.handleDailySummary(daySummary(), ss);
  g.handleDailySummary(daySummary({totalRevenue:6000}), ss);
  const junk=ss.getSheets().map(s=>s.getName()).filter(n=>/^__POS_/.test(n));
  if(junk.length) throw new Error('เหลือแท็บขยะ: '+junk.join(','));
  const names=ss.getSheets().map(s=>s.getName());
  if(names.filter(n=>n==='สรุป-2026-08-05').length!==1) throw new Error('แท็บซ้ำ: '+names.join(','));
});
t('วันที่ไม่มีบิลเลย (0 ทุกช่อง)', ()=>{
  const ss=FakeSS();
  const r=g.handleDailySummary(daySummary({totalRevenue:0,cashRevenue:0,qrRevenue:0,billCount:0,avgBill:0,totalExpenses:0,netIncome:0,nonVatBase:0,shiftCount:0,shiftCash:[],services:[],expenses:[],staffCommissions:[]}), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('เงินสดขาด (cashVariance ติดลบ) ต้องผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleDailySummary(daySummary({cashVariance:-150}), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('กำไรติดลบ (ค่าใช้จ่าย > รายได้) ต้องผ่าน', ()=>{
  const ss=FakeSS();
  const r=g.handleDailySummary(daySummary({totalExpenses:9000,netIncome:-4000}), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('เปิด VAT 7% ครบทุกช่อง', ()=>{
  const ss=FakeSS();
  const r=g.handleDailySummary(daySummary({vatRate:7,nonVatBase:1000,vatableBase:3738,vatAmount:261.66,rounding:0.34,totalRevenue:5000}), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('สรุปเดือน', ()=>{
  const ss=FakeSS();
  const d=daySummary(); delete d.dateKey; d.monthKey='08-2026'; d.action='summary_month';
  const r=g.handleMonthlySummary(d, ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
});
t('วัน+เดือน อยู่ใน master คนละแถว', ()=>{
  const ss=FakeSS();
  g.handleDailySummary(daySummary(), ss);
  const d=daySummary(); delete d.dateKey; d.monthKey='08-2026';
  g.handleMonthlySummary(d, ss);
  const m=ss.getSheetByName('สรุปรายเดือน');
  if(m.getLastRow()!==3) throw new Error('แถว master = '+m.getLastRow()+' (คาด 3)');
});
t('master เก่า 7 คอลัมน์ -> migrate แล้วเขียนได้', ()=>{
  const ss=FakeSS(); const m=ss.insertSheet('สรุปรายเดือน');
  m._grid.push(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)','อัปเดตล่าสุด']);
  m._grid.push(['รายวัน','2026-07-01',5,1000,100,900,'2026-07-01 12:00']);
  const r=g.handleDailySummary(daySummary(), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
  if(m._grid[1][1]!=='2026-07-01') throw new Error('ข้อมูลเก่าเลื่อน: '+JSON.stringify(m._grid[1]));
});
t('payload ที่ค่าเสียหาย -> ปฏิเสธ + ไม่ลบแท็บเดิม', ()=>{
  const ss=FakeSS();
  g.handleDailySummary(daySummary(), ss);
  const before=ss.getSheetByName('สรุป-2026-08-05')._grid.length;
  const r=g.handleDailySummary(daySummary({totalRevenue:'ห้าพัน'}), ss);
  if(!/error/.test(JSON.stringify(r))) throw new Error('ควรปฏิเสธ');
  if(!ss.getSheetByName('สรุป-2026-08-05')) throw new Error('แท็บเดิมหาย!');
  const junk=ss.getSheets().map(s=>s.getName()).filter(n=>/^__POS_/.test(n));
  if(junk.length) throw new Error('เหลือแท็บขยะ: '+junk.join(','));
});
console.log('\n--- pruneOrphanSwapSheets_ (เก็บกวาดแท็บค้าง) ---');
const HOUR=3600e3, DAY=24*HOUR;
function ssWith(names){ const ss=FakeSS(); ss.insertSheet('สรุปรายเดือน'); names.forEach(n=>ss.insertSheet(n)); return ss; }
const left=(ss)=>ss.getSheets().map(s=>s.getName()).filter(n=>/^__POS_/.test(n));
t('TMP เก่ากว่า 1 ชม. -> ลบ', ()=>{
  const ss=ssWith([`__POS_TMP_${Date.now()-2*HOUR}_123`]);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length) throw new Error('ยังเหลือ: '+left(ss));
});
t('TMP ที่เพิ่งสร้าง -> ห้ามลบ (อาจเป็นของ execution ที่กำลังทำงาน)', ()=>{
  const ss=ssWith([`__POS_TMP_${Date.now()-60e3}_123`]);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length!==1) throw new Error('ลบทั้งที่ยังใหม่');
});
t('OLD อายุ 2 วัน -> ยังเก็บไว้ให้เทียบย้อนหลัง', ()=>{
  const ss=ssWith([`__POS_OLD_${Date.now()-2*DAY}_9`]);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length!==1) throw new Error('ลบเร็วเกินไป');
});
t('OLD อายุ 8 วัน -> ลบ', ()=>{
  const ss=ssWith([`__POS_OLD_${Date.now()-8*DAY}_9`]);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length) throw new Error('ยังเหลือ: '+left(ss));
});
t('แท็บสรุปจริงและแท็บบิล ต้องไม่โดนลูกหลง', ()=>{
  const ss=ssWith(['สรุป-2026-08-05','08-2026',`__POS_TMP_${Date.now()-5*HOUR}_1`]);
  g.pruneOrphanSwapSheets_(ss);
  const n=ss.getSheets().map(s=>s.getName());
  if(!n.includes('สรุป-2026-08-05')||!n.includes('08-2026')||!n.includes('สรุปรายเดือน')) throw new Error('ลบแท็บจริง: '+n.join(','));
  if(left(ss).length) throw new Error('ไม่ได้ลบของค้าง');
});
t('ชื่อคล้ายแต่ไม่ตรงรูปแบบ -> ไม่แตะ', ()=>{
  const ss=ssWith(['__POS_TMP_ข้อมูลสำคัญ','__POS_OLD_','__POS_ARCHIVE_123456789012_1']);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length!==3) throw new Error('ลบของที่ไม่ควรลบ: เหลือ '+left(ss).join(','));
});
t('เวลาเครื่องเพี้ยน (stamp อนาคต) -> ไม่ลบ', ()=>{
  const ss=ssWith([`__POS_TMP_${Date.now()+10*DAY}_1`]);
  g.pruneOrphanSwapSheets_(ss);
  if(left(ss).length!==1) throw new Error('ลบทั้งที่อายุติดลบ');
});
t('ห้ามลบจนชีตเหลือ 0 แท็บ', ()=>{
  const ss=FakeSS(); ss.insertSheet(`__POS_TMP_${Date.now()-5*HOUR}_1`);
  g.pruneOrphanSwapSheets_(ss);
  if(ss.getSheets().length<1) throw new Error('ลบจนไม่เหลือแท็บ');
});
t('สรุปรายวันเรียก prune แล้วไม่พังงานหลัก', ()=>{
  const ss=FakeSS(); ss.insertSheet(`__POS_OLD_${Date.now()-9*DAY}_1`);
  const r=g.handleDailySummary(daySummary(), ss);
  if(!/success/.test(JSON.stringify(r))) throw new Error(JSON.stringify(r));
  if(left(ss).length) throw new Error('ไม่ได้กวาด: '+left(ss));
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
