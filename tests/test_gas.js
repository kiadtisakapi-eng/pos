const fs=require('fs'), vm=require('vm');
const SRC=require('path').join(__dirname,'..','google_apps_script.js');
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

// ── ชีตปลอม ────────────────────────────────────────────
function FakeSheet(headers, rows){
  const grid=[headers.slice(), ...(rows||[]).map(r=>r.slice())];
  const pad=()=>{const w=Math.max(...grid.map(r=>r.length)); grid.forEach(r=>{while(r.length<w) r.push('')})};
  const api={
    _grid:grid,
    getLastColumn:()=>{pad(); return grid[0].filter(c=>String(c).trim()!=='').length ? grid[0].length : 0;},
    getLastRow:()=>grid.length,
    getRange:(r,c,nr,nc)=>{
      nr=nr||1; nc=nc||1;
      const cell={
        getDisplayValue:()=>String(grid[r-1] && grid[r-1][c-1] !== undefined ? grid[r-1][c-1] : ''),
        getDisplayValues:()=>{const out=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push(String((grid[r-1+i]&&grid[r-1+i][c-1+j])??''));out.push(row)}return out},
        setValue:(v)=>{ while(grid.length<r) grid.push([]); const row=grid[r-1]; while(row.length<c) row.push(''); row[c-1]=v; return cell; },
        setBackground:()=>cell,setFontColor:()=>cell,setFontWeight:()=>cell,
        setNumberFormat:()=>cell,setHorizontalAlignment:()=>cell,setFontSize:()=>cell,merge:()=>cell
      };
      return cell;
    },
    insertColumnBefore:(c)=>{pad(); grid.forEach(row=>row.splice(c-1,0,''))},
    autoResizeColumns:()=>{}, setFrozenRows:()=>{}
  };
  return api;
}
const ctx={console,Date,JSON,String,Number,Math,Array,Object,isNaN,parseInt,parseFloat};
ctx.SpreadsheetApp={flush:()=>{}, getActiveSpreadsheet:()=>null};
ctx.ContentService={createTextOutput:(s)=>({setMimeType:()=>s}),MimeType:{JSON:'json',TEXT:'text'}};
ctx.MimeType={PLAIN_TEXT:'text/plain'};
ctx.Utilities={formatDate:()=>'2026-07-31 12:00'};
ctx.Session={getScriptTimeZone:()=>'Asia/Bangkok'};
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
ctx.DriveApp={_folders:{},getFoldersByName(n){const f=this._folders[n];let done=!f;return{hasNext:()=>!done,next:()=>{done=true;return f}}},createFolder(n){return this._folders[n]}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC,'utf8'),ctx,{filename:'gas.js'});
const g=ctx;
const V=g.MASTER_VAR_HEADER, TS=g.MASTER_TS_HEADER;

console.log('\n--- masterColumnMap_ / migrate ---');
t('ชีตเก่า 7 คอลัมน์ -> แทรกคอลัมน์ใหม่ก่อน "อัปเดตล่าสุด"',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',TS],
                     [['เดือน','07-2026',10,1000,100,900,'2026-07-01']]);
  g.migrateMasterAddVarianceColumn(sh);
  const m=g.masterColumnMap_(sh);
  eq(m.varCol,7,'varCol'); eq(m.tsCol,8,'tsCol');
  eq(sh._grid[1][7],'2026-07-01','ข้อมูลเดิมต้องเลื่อนตาม ไม่หาย');
});
t('เรียก migrate ซ้ำ ไม่แทรกซ้ำ (idempotent)',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',TS],[]);
  g.migrateMasterAddVarianceColumn(sh); g.migrateMasterAddVarianceColumn(sh); g.migrateMasterAddVarianceColumn(sh);
  eq(g.masterColumnMap_(sh).varCol,7); eq(sh._grid[0].length,8);
});
t('*** เคสที่เคยพัง: ชีต 7 คอลัมน์แต่มีคอลัมน์ค้างที่ 8 ***',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',TS,'โน้ตของเจ๊'],
                     [['เดือน','07-2026',10,1000,100,900,'2026-07-01','ok']]);
  g.migrateMasterAddVarianceColumn(sh);
  const m=g.masterColumnMap_(sh);
  ok(m.varCol>0,'ต้อง migrate ได้แม้ getLastColumn()>=8');
  g.writeToMaster(sh,2,'เดือน','07-2026',{totalRevenue:1000,totalExpenses:100,transactionCount:10,shiftCount:2,cashVariance:-50});
  eq(sh._grid[1][m.varCol-1],-50,'เงินขาด/เกินลงคอลัมน์ถูก');
  eq(sh._grid[1][m.tsCol-1],'2026-07-31 12:00','timestamp ลงคอลัมน์ถูก');
  eq(sh._grid[1][8],'ok','คอลัมน์ของคนอื่นต้องเลื่อนตาม ไม่ถูกทับ');
});
t('ชีตโครงสร้างแปลก (ไม่มีหัว "อัปเดตล่าสุด") -> ไม่แตะ ไม่ทับ',()=>{
  const sh=FakeSheet(['aaa','bbb','ccc'],[['1','2','3']]);
  g.migrateMasterAddVarianceColumn(sh);
  eq(g.masterColumnMap_(sh).varCol,0);
  g.writeToMaster(sh,2,'เดือน','07-2026',{totalRevenue:1,totalExpenses:0,transactionCount:1,shiftCount:1,cashVariance:-9});
  eq(sh._grid[1][0],'รายวัน'); // คอลัมน์ 1-6 เป็นของ writeToMaster อยู่แล้ว
  ok(!sh._grid[1].includes(-9),'ห้ามยัดเงินขาด/เกินลงคอลัมน์มั่ว');
});
t('ยังไม่ปิดกะ -> โชว์ "—" ไม่ใช่ 0',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS],[]);
  g.writeToMaster(sh,2,'เดือน','07-2026',{totalRevenue:1,totalExpenses:0,transactionCount:1,shiftCount:0,cashVariance:0});
  eq(sh._grid[1][6],'—');
});
t('ปิดกะแล้วตรงพอดี -> เลข 0 ไม่ใช่ "—"',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS],[]);
  g.writeToMaster(sh,2,'เดือน','07-2026',{totalRevenue:1,totalExpenses:0,transactionCount:1,shiftCount:1,cashVariance:0});
  eq(sh._grid[1][6],0);
});

console.log('\n--- คอลัมน์ VAT ในชีตสรุปรายเดือน ---');
const OLD8=['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS];
t('ชีตเดิม 8 คอลัมน์ -> แทรก 4 คอลัมน์ VAT หน้า "รายได้รวม"',()=>{
  const sh=FakeSheet(OLD8,[['เดือน','07-2026',10,1000,100,900,-50,'2026-07-01']]);
  g.migrateMasterAddVatColumns(sh);
  const m=g.masterColumnMap_(sh);
  eq(m.vatCols,[4,5,6,7],'คอลัมน์ VAT ต้องอยู่ช่อง 4-7');
  eq(m.revCol,8,'รายได้รวมต้องเลื่อนไปช่อง 8');
  eq(sh._grid[1][7],1000,'ยอดรายได้เดิมต้องเลื่อนตาม ไม่หาย');
  eq(sh._grid[1][10],-50,'เงินขาด/เกินเดิมต้องเลื่อนตาม');
  eq(sh._grid[1][11],'2026-07-01','timestamp เดิมต้องเลื่อนตาม');
});
t('เรียก migrate ซ้ำ ไม่แทรกซ้ำ',()=>{
  const sh=FakeSheet(OLD8,[]);
  g.migrateMasterAddVatColumns(sh); g.migrateMasterAddVatColumns(sh); g.migrateMasterAddVatColumns(sh);
  eq(sh._grid[0].length,12);
});
t('ชีตโครงสร้างแปลก (ไม่มี "รายได้รวม") -> ไม่แตะ',()=>{
  const sh=FakeSheet(['aaa','bbb'],[['1','2']]);
  g.migrateMasterAddVatColumns(sh);
  eq(sh._grid[0].length,2);
});
t('เขียน 4 ช่อง VAT ลงคอลัมน์ที่ถูก และบวกได้เท่ารายได้รวม',()=>{
  const sh=FakeSheet(OLD8,[]);
  g.migrateMasterAddVatColumns(sh);
  g.writeToMaster(sh,2,'day','2026-08-01',{
    billCount:38, totalRevenue:18420, totalExpenses:600, netIncome:17820,
    nonVatBase:17600, vatableBase:750, vatAmount:52.5, rounding:17.5,
    shiftCount:1, cashVariance:-30});
  const m=g.masterColumnMap_(sh);
  eq(sh._grid[1][m.vatCols[0]-1],17600);
  eq(sh._grid[1][m.vatCols[1]-1],750);
  eq(sh._grid[1][m.vatCols[2]-1],52.5);
  eq(sh._grid[1][m.vatCols[3]-1],17.5);
  eq(sh._grid[1][m.revCol-1],18420);
  eq(17600+750+52.5+17.5,18420,'4 ช่องต้องบวกได้เท่ารายได้รวม');
  eq(sh._grid[1][m.varCol-1],-30,'เงินขาด/เกินยังลงถูกช่องหลังแทรกคอลัมน์');
});
t('ชีตเก่าที่ยังไม่ migrate -> เขียนรายได้รวมช่อง 4 ตามเดิม ไม่ทับคอลัมน์อื่น',()=>{
  const sh=FakeSheet(OLD8,[]);
  g.writeToMaster(sh,2,'day','2026-08-01',{billCount:5,totalRevenue:999,totalExpenses:0,netIncome:999,
    nonVatBase:999,vatableBase:0,vatAmount:0,rounding:0,shiftCount:0,cashVariance:0});
  eq(sh._grid[1][3],999);
  eq(sh._grid[1][7],'2026-07-31 12:00','timestamp ยังลงช่อง 8 ตามเดิม');
});
t('ชีตใหม่เอี่ยมสร้างมาพร้อม 12 คอลัมน์',()=>{
  const mh=['ประเภท','ช่วงเวลา','บิล'].concat(g.MASTER_VAT_HEADERS).concat([g.MASTER_REV_HEADER,'ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS]);
  eq(mh.length,12);
  const sh=FakeSheet(mh,[]);
  const m=g.masterColumnMap_(sh);
  eq(m.vatCols,[4,5,6,7]); eq(m.revCol,8); eq(m.varCol,11); eq(m.tsCol,12);
});

console.log('\n--- ความปลอดภัยของ get_backup ---');
function FakeFile(id,name,content,created){return{getId:()=>id,getName:()=>name,getSize:()=>content.length,
  getDateCreated:()=>created||new Date('2026-07-27T14:40:00Z'),getBlob:()=>({getDataAsString:()=>content}),setTrashed(){}}}
const good=JSON.stringify({services:[],staff:[],transactions:[{id:1}]});
function setFolder(files){ g.DriveApp._folders[g.BACKUP_FOLDER_NAME]={
  getFiles(){let i=0;return{hasNext:()=>i<files.length,next:()=>files[i++]}},
  getFilesByType(){return this.getFiles()},createFile(){}}; }
const parse=(r)=>JSON.parse(r);

t('ไฟล์ที่อยู่นอกโฟลเดอร์สำรอง -> ปฏิเสธ',()=>{
  setFolder([FakeFile('OK1','pos_backup_a.json',good)]);
  const r=parse(g.handleGetBackup({fileId:'SECRET_DOC_ID'}));
  eq(r.status,'error'); ok(/ไม่พบไฟล์นี้ในโฟลเดอร์สำรอง/.test(r.message));
});
t('ไฟล์ในโฟลเดอร์แต่ชื่อไม่ขึ้นต้น pos_backup_ -> ปฏิเสธ',()=>{
  setFolder([FakeFile('X','ข้อมูลลูกค้าลับ.json',good)]);
  eq(parse(g.handleGetBackup({fileId:'X'})).status,'error');
});
t('ไฟล์ถูกต้อง -> คืนข้อมูล',()=>{
  setFolder([FakeFile('OK1','pos_backup_a.json',good)]);
  const r=parse(g.handleGetBackup({fileId:'OK1'}));
  eq(r.status,'success'); eq(r.details.backupData.transactions.length,1);
});
t('ไฟล์เสียหาย (ไม่ใช่ JSON) -> error ที่อ่านรู้เรื่อง',()=>{
  setFolder([FakeFile('B','pos_backup_b.json','{{{ พัง')]);
  const r=parse(g.handleGetBackup({fileId:'B'}));
  eq(r.status,'error'); ok(/เสียหาย/.test(r.message));
});
t('JSON ผ่านแต่ไม่ใช่ backup ของ POS -> ปฏิเสธ',()=>{
  setFolder([FakeFile('C','pos_backup_c.json','{"hello":1}')]);
  eq(parse(g.handleGetBackup({fileId:'C'})).status,'error');
});
t('ไม่ส่ง fileId มา -> error',()=>{ eq(parse(g.handleGetBackup({})).status,'error'); });

console.log('\n--- list_backups ---');
t('เรียงใหม่สุดขึ้นก่อน + กรองไฟล์แปลกปลอมออก',()=>{
  setFolder([
    FakeFile('a','pos_backup_2026-07-01.json',good,new Date('2026-07-01T00:00:00Z')),
    FakeFile('z','ไฟล์อื่น.txt','xx',new Date('2026-07-30T00:00:00Z')),
    FakeFile('c','pos_backup_2026-07-27.json',good,new Date('2026-07-27T00:00:00Z')),
  ]);
  const r=parse(g.handleListBackups());
  eq(r.status,'success'); eq(r.details.files.length,2);
  eq(r.details.files[0].id,'c','ไฟล์ใหม่สุดต้องอยู่บน');
});
t('ยังไม่มีโฟลเดอร์ -> คืนลิสต์ว่าง ไม่ error',()=>{
  delete g.DriveApp._folders[g.BACKUP_FOLDER_NAME];
  const r=parse(g.handleListBackups()); eq(r.status,'success'); eq(r.details.files,[]);
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
