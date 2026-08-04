// กันวันที่เพี้ยนไม่ให้สร้างแท็บ/แถวขยะในชีต — ตรวจทั้ง 3 ด่าน
const path=require('path'),fs=require('fs'),vm=require('vm');
const h=require('./harness.js'); const app=h.ctx.app;
let pass=0,fail=0;
const t=(n,f)=>{const r=()=>{pass++;console.log('  PASS',n)},b=e=>{fail++;console.log('  FAIL',n,'->',e.message)};
  try{const x=f(); return x&&x.then?x.then(r,b):(r(),null)}catch(e){b(e)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
app.showToast=()=>{}; app.saveState=async()=>{};

console.log('\n--- ด่าน 1: แปลงวันที่ ---');
[null,undefined,'','ขยะ',NaN,{},[]].forEach(v=>{
  t(`วันที่แบบ ${JSON.stringify(v)} -> ค่าว่าง ไม่ใช่ปี 1970`,()=>{
    eq(app.getBusinessISODate(v),''); eq(app.getBusinessMonthKey(v),'');});
});
t('วันที่ปกติยังทำงานได้',()=>{
  ok(/^\d{4}-\d{2}-\d{2}$/.test(app.getBusinessISODate(new Date(2026,7,3,12,0).getTime())));});

console.log('\n--- ด่าน 2: ตัวตรวจรูปแบบคีย์ ---');
[['2026-08-03',true],['1970-01-01',false],['2019-12-31',false],['2101-01-01',false],
 ['',false],['ขยะ',false],['2026-8-3',false],['2026-13-01',false],[null,false]].forEach(([k,exp])=>{
  t(`คีย์วัน "${k}" -> ${exp?'ผ่าน':'ปฏิเสธ'}`,()=>eq(app.isValidDateKey(k),exp));});
[['08-2026',true],['01-1970',false],['13-2026',false],['8-2026',false],['',false],[null,false]].forEach(([k,exp])=>{
  t(`คีย์เดือน "${k}" -> ${exp?'ผ่าน':'ปฏิเสธ'}`,()=>eq(app.isValidMonthKey(k),exp));});

console.log('\n--- ด่าน 2: ไม่คิวงานที่คีย์เพี้ยน ---');
app.googleSheetsUrl='https://gas/exec'; app.state.cloudOutbox=[];
app.enqueueSummaryRefresh(null);
app.enqueueSummaryRefresh('ขยะ');
t('บิลไม่มีวันที่ -> ไม่คิวสรุปเลย',()=>eq(app.state.cloudOutbox.length,0));
app.enqueueSummaryRefresh(new Date(2026,7,3,12,0).getTime());
t('บิลปกติ -> คิวได้ตามเดิม',()=>eq(app.state.cloudOutbox.length,1));

app.state.cloudOutbox=[]; app.telegramToken=''; app.telegramChatId='';
app.enqueueShiftCloseCloudOps({startTime:null,endTime:null,difference:0});
t('ปิดกะที่ไม่มีเวลาเลย -> ไม่คิวสรุป',()=>eq(app.state.cloudOutbox.length,0));

app.state.cloudOutbox=[]; app.currentUser={name:'เอ'};
app.enqueueVoidCloudOps({id:'TX',date:null,total:100},{by:'เอ'});
t('ยกเลิกบิลที่วันที่หาย -> ไม่สั่งสร้างแท็บสรุปของวันขยะ',()=>{
  const it=app.state.cloudOutbox[0];
  if(it){ eq(it.dateKeys,[]); eq(it.monthKeys,[]); eq(it.needSummary,false); }
  else ok(true);});

console.log('\n--- ด่าน 3: ปฏิเสธก่อนยิงขึ้นคลาวด์ ---');
let sent=0; app.fetchWithTimeout=async()=>{sent++; return {ok:true,json:async()=>({status:'success'})};};
(async()=>{
sent=0; await app.syncDailySummary('1970-01-01',[],[],true);
t('สรุปรายวันของปี 1970 -> ไม่ยิงออกไปเลย',()=>eq(sent,0));
sent=0; await app.syncMonthlySummary('01-1970',true);
t('สรุปรายเดือนของปี 1970 -> ไม่ยิงออกไปเลย',()=>eq(sent,0));
sent=0; await app.syncDailySummary('',[],[],true);
t('คีย์ว่าง -> ไม่ยิง',()=>eq(sent,0));

console.log('\n--- ด่าน 4: Apps Script ปฏิเสธเองด้วย ---');
const g={console,Date,JSON,String,Number,Math,Array,Object,isNaN,parseInt,parseFloat,RegExp};
g.SpreadsheetApp={flush:()=>{}}; g.MimeType={PLAIN_TEXT:'text/plain'};
g.ContentService={createTextOutput:s=>({setMimeType:()=>s}),MimeType:{JSON:'json'}};
g.Session={getScriptTimeZone:()=>'Asia/Bangkok'}; g.Utilities={formatDate:()=>'2026-08-03 12:00'};
g.DriveApp={getFoldersByName:()=>({hasNext:()=>false})}; g.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','google_apps_script.js'),'utf8'),g,{filename:'gas.js'});
let created=[];
const ss={getSheetByName:()=>null, insertSheet:(n)=>{created.push(n); return null;}, deleteSheet:()=>{}};

created=[]; let r=JSON.parse(g.handleDailySummary({dateKey:'1970-01-01'},ss));
t('GAS ไม่สร้างแท็บ "สรุป-1970-01-01"',()=>{eq(r.status,'error'); eq(created,[]);});
created=[]; r=JSON.parse(g.handleMonthlySummary({monthKey:'01-1970'},ss));
t('GAS ไม่สร้างแท็บ "สรุป-01-1970"',()=>{eq(r.status,'error'); eq(created,[]);});
created=[]; r=JSON.parse(g.handleDailySummary({dateKey:''},ss));
t('GAS ไม่สร้างแท็บ "สรุป-" จากคีย์ว่าง',()=>{eq(r.status,'error'); eq(created,[]);});
created=[]; r=JSON.parse(g.handleTransaction({date:0,monthKey:'01-1970'},ss));
t('GAS ไม่สร้างแท็บบิล "01-1970"',()=>{eq(r.status,'error'); eq(created,[]);});
t('ข้อความ error บอกสาเหตุให้คนอ่านรู้เรื่อง',()=>ok(/ไม่ถูกต้อง/.test(r.message),r.message));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
