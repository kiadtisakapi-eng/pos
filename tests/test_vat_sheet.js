// เดินครบเส้น: บิลในแอป → buildSummaryPayload → GAS normalize → เขียนชีตจริง → อ่านค่าที่ขึ้นชีต
//
// ทำไมต้องมีทั้งที่ test_batch_b.js ตรวจ buildVatSummary ไปแล้ว:
// เทสต์ยูนิตพิสูจน์ได้แค่ว่า "ฟังก์ชันคืนค่าถูก" แต่ไม่ได้พิสูจน์ว่า "ตัวเลขบนชีตถูก"
// ซึ่งเป็นสิ่งเดียวที่ใช้ยื่นสรรพากรจริง (ดู pos-testing-traps กับดักที่ 3)
//
// เคสที่โค้ดก่อนชุด B ทำพลาด: ชีตใบเดียวกันโชว์ภาษีขายรายหมวด 20 บาท
// แต่แถว "รวม" ข้างล่างโชว์ 17 บาท — ขัดกันเองบนกระดาษแผ่นเดียว
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const h=require(path.join(ROOT,'tests','harness.js'));
const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  ✅',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};

app.state.categories=[{id:'barber',name:'ตัดผมชาย',vat:true},{id:'massage',name:'นวดและสปา',vat:true}];
app.state.staff=[]; app.state.services=[];
const mk=(id,rate,lines)=>({id,date:'2026-09-01T14:00:00+07:00',vatRate:rate,paymentMethod:'cash',
  total:lines.reduce((s,l)=>s+l[1],0)*(1+rate/100), subtotal:lines.reduce((s,l)=>s+l[1],0), discount:0,
  nonVatBase:0, vatableBase:lines.reduce((s,l)=>s+l[1],0),
  vatAmount:Math.round(lines.reduce((s,l)=>s+l[1],0)*rate/100*100)/100, rounding:0,
  details:lines.map(l=>({category:l[0],netPrice:l[1],vatable:true,name:'x',staffId:'s',staffName:'เอ',commissionAmount:0}))});

// งวดที่มีสองอัตรา — เคสจากรายงาน
const txs=[mk('TX-1757000000000-AAAAAAAA',7,[['barber',100]]), mk('TX-1757000000000-BBBBBBBB',10,[['barber',100]])];
const payload=app.buildSummaryPayload(txs,[],'day','2026-09-01');

console.log('\n── payload ที่แอปสร้าง');
t('vatAmount รวม = 17', ()=>eq(payload.vatAmount,17));
t('vatCategories มี 2 แถว แยกตามอัตรา', ()=>eq(payload.vatCategories.length,2));
t('ผลรวม VAT รายหมวด = 17', ()=>eq(Math.round(payload.vatCategories.reduce((s,c)=>s+c.vat,0)*100)/100,17));
t('vatRate ระดับงวด = 0 (มีหลายอัตรา)', ()=>eq(payload.vatRate,0));

// ── ฝั่ง GAS ────────────────────────────────────────────────
const g={console:{log(){},warn(){},error(){}},Date,JSON,String,Number,Math,Array,Object,isNaN,isFinite,parseInt,parseFloat};
g.ContentService={createTextOutput:s=>({setMimeType:()=>s}),MimeType:{JSON:'json'}};
g.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
g.Utilities={formatDate:()=>'2026-09-01 14:00',getUuid:()=>'u'};
g.Session={getScriptTimeZone:()=>'Asia/Bangkok'}; g.Logger={log(){}};
g.PropertiesService={getScriptProperties:()=>({getProperty:()=>null,setProperty(){},deleteProperty(){}})};
g.SpreadsheetApp={flush(){},getActiveSpreadsheet:()=>null};
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(ROOT,'google_apps_script.js'),'utf8'),g,{filename:'gas.js'});

console.log('\n── GAS ตรวจ payload นี้ผ่านไหม');
t('normalizeSummaryPayload_ ไม่ปฏิเสธ payload ที่มี rate ต่อแถว', ()=>{ g.normalizeSummaryPayload_(JSON.parse(JSON.stringify(payload))); });
t('vatRate = 0 ไม่ถูกมองว่าผิด', ()=>{ const p=JSON.parse(JSON.stringify(payload)); p.vatRate=0; g.normalizeSummaryPayload_(p); });

// ── เขียนชีตจริงแล้วอ่านค่าออกมาดู ────────────────────────
function FakeSheet(){const grid=[];return{_grid:grid,
 getLastColumn:()=>grid.length?Math.max(...grid.map(r=>r.length)):0, getLastRow:()=>grid.length,
 getRange:(r,c,nr,nc)=>({getDisplayValues:()=>[['']],getValues:()=>[['']],
 setValue(v){while(grid.length<r)grid.push([]);const row=grid[r-1];while(row.length<c)row.push('');row[c-1]=v;return this},
 setValues(vals){vals.forEach((rv,i)=>{while(grid.length<r+i)grid.push([]);const row=grid[r-1+i];rv.forEach((v,j)=>{while(row.length<c+j)row.push('');row[c-1+j]=v})});return this},
 setBackground(){return this},setFontColor(){return this},setFontWeight(){return this},setNumberFormat(){return this},
 setHorizontalAlignment(){return this},setFontSize(){return this},merge(){return this},setWrap(){return this}}),
 appendRow:r=>grid.push(r.slice()),deleteRow:r=>grid.splice(r-1,1),insertColumnBefore(){},
 autoResizeColumns(){},setFrozenRows(){},setColumnWidth(){},clear(){grid.length=0},getName:()=>'สรุป-2026-09-01',
 setName(){},getSheetId:()=>1,getMaxRows:()=>1000,getMaxColumns:()=>26,deleteRows(){},deleteColumns(){}}}
const sheet=FakeSheet();
const norm=g.normalizeSummaryPayload_(JSON.parse(JSON.stringify(payload)));
g.writeSummarySheet(sheet, norm, 'รายวัน: 2026-09-01', 'day', '2026-09-01');

console.log('\n── ตัวเลขที่ขึ้นชีตจริง (บล็อกภาษีมูลค่าเพิ่ม)');
const rows=sheet._grid.map(r=>r.map(c=>c===undefined?'':c));
const start=rows.findIndex(r=>String(r[0]).indexOf('ภาษีมูลค่าเพิ่ม')===0);
const vatRows=rows.slice(start, start+7);
vatRows.forEach(r=>{ if(String(r[0]).trim()) console.log('   ', String(r[0]).slice(0,28).padEnd(30), String(r[1]).padEnd(8), String(r[2]).padEnd(8), String(r[3])); });
const catRows=vatRows.filter(r=>/ตัดผมชาย|นวดและสปา|ไม่ระบุหมวด/.test(String(r[0])));
t('ชีตแสดงอัตราของแต่ละแถวถูกต้อง (7% และ 10% ไม่ใช่ตัวเดียวกันทั้งตาราง)', ()=>
  eq(catRows.map(r=>r[2]).sort(), ['10%','7%']));
t('ภาษีขายรวมบนชีต = 17', ()=>eq(Math.round(catRows.reduce((s,r)=>s+Number(r[3]),0)*100)/100, 17));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
