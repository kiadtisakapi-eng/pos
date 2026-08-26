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
        setValues:(vals)=>{ vals.forEach((rowVals,i)=>{ while(grid.length<r+i) grid.push([]); const row=grid[r-1+i];
          rowVals.forEach((v,j)=>{ while(row.length<c+j) row.push(''); row[c-1+j]=v; }); }); return cell; },
        getValues:()=>{const out=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push(grid[r-1+i]&&grid[r-1+i][c-1+j]!==undefined?grid[r-1+i][c-1+j]:'');out.push(row)}return out},
        setBackground:()=>cell,setFontColor:()=>cell,setFontWeight:()=>cell,
        setNumberFormat:()=>cell,setHorizontalAlignment:()=>cell,setFontSize:()=>cell,merge:()=>cell
      };
      return cell;
    },
    insertColumnBefore:(c)=>{pad(); grid.forEach(row=>row.splice(c-1,0,''))},
    appendRow:(r)=>{grid.push(r.slice())},
    deleteRow:(r)=>{grid.splice(r-1,1)},
    deleteColumn:(c)=>{grid.forEach(row=>row.splice(c-1,1))},
    autoResizeColumns:()=>{}, setFrozenRows:()=>{}
  };
  return api;
}
const ctx={console,Date,JSON,String,Number,Math,Array,Object,isNaN,isFinite,parseInt,parseFloat};
ctx.SpreadsheetApp={flush:()=>{}, getActiveSpreadsheet:()=>null};
ctx.ContentService={createTextOutput:(s)=>({setMimeType:()=>s}),MimeType:{JSON:'json',TEXT:'text'}};
ctx.MimeType={PLAIN_TEXT:'text/plain'};
let uuidCounter=0;
ctx.Utilities={formatDate:()=>'2026-07-31 12:00',getUuid:()=>`00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`};
ctx.Session={getScriptTimeZone:()=>'Asia/Bangkok'};
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
ctx.Logger={log:()=>{}};
const scriptProps={};
ctx.PropertiesService={getScriptProperties:()=>({
  getProperty:k=>scriptProps[k]||null,
  setProperty:(k,v)=>{scriptProps[k]=String(v);},
  deleteProperty:k=>{delete scriptProps[k];}
})};
// โฟลเดอร์ Drive ปลอมที่ "เก็บไฟล์จริง" — ใช้เทสต์ handleBackup ได้ (เดิมสร้างไฟล์แล้วทิ้งเลย)
function makeFolder(id, name, files){
  const list = files || [];
  return { _files:list, getId:()=>id, getName:()=>name,
    createFile:(fn, content, mime)=>{ const f={ _trashed:false, getId:()=>'file-'+list.length,
        getName:()=>fn, getBlob:()=>({getDataAsString:()=>content}), getSize:()=>content.length,
        getDateCreated:()=>new Date(), getMimeType:()=>mime, setTrashed:(v)=>{f._trashed=v;} };
      list.push(f); return f; },
    getFiles:()=>{ let i=0; const a=list.filter(f=>!f._trashed); return {hasNext:()=>i<a.length,next:()=>a[i++]}; },
    getFilesByType:()=>{ let i=0; const a=list.filter(f=>!f._trashed); return {hasNext:()=>i<a.length,next:()=>a[i++]}; } };
}
ctx.DriveApp={
  _folders:{}, _foldersById:{},
  getFoldersByName(n){const found=this._folders[n];const list=found?(Array.isArray(found)?found:[found]):[];let i=0;return{hasNext:()=>i<list.length,next:()=>list[i++]};},
  getFolderById(id){const f=this._foldersById[id];if(!f)throw new Error('folder not found');return f;},
  createFolder(n){const id='created-'+Object.keys(this._foldersById).length;const f=makeFolder(id,n);this._folders[n]=f;this._foldersById[id]=f;return f;}
};
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
  g.writeToMaster(sh,2,'month','07-2026',{totalRevenue:1000,totalExpenses:100,billCount:10,shiftCount:2,cashVariance:-50});
  eq(sh._grid[1][m.varCol-1],-50,'เงินขาด/เกินลงคอลัมน์ถูก');
  eq(sh._grid[1][m.tsCol-1],'2026-07-31 12:00','timestamp ลงคอลัมน์ถูก');
  eq(sh._grid[1][8],'ok','คอลัมน์ของคนอื่นต้องเลื่อนตาม ไม่ถูกทับ');
});
t('ชีตโครงสร้างแปลก -> หยุดทันทีและไม่แตะข้อมูลเดิม',()=>{
  const sh=FakeSheet(['aaa','bbb','ccc'],[['1','2','3']]);
  const before=JSON.stringify(sh._grid);
  g.migrateMasterAddVarianceColumn(sh);
  eq(g.masterColumnMap_(sh).varCol,0);
  let threw=false;
  try { g.writeToMaster(sh,2,'month','07-2026',{totalRevenue:1,totalExpenses:0,billCount:1,shiftCount:1,cashVariance:-9}); }
  catch(e) { threw=true; }
  ok(threw,'ต้องแจ้งว่าโครงสร้างชีตไม่ปลอดภัย');
  eq(JSON.stringify(sh._grid),before,'ห้ามเขียนทับคอลัมน์ใดเลย');
});
t('หัวคอลัมน์สำคัญซ้ำ -> หยุดทันทีและไม่เขียนยอด',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS],[]);
  const before=JSON.stringify(sh._grid);
  const map=g.masterColumnMap_(sh);
  ok(map.duplicates.includes('รายได้รวม (฿)'));
  let threw=false;
  try { g.writeToMaster(sh,2,'month','07-2026',{totalRevenue:1,totalExpenses:0,billCount:1,shiftCount:0,cashVariance:0}); }
  catch(e) { threw=true; }
  ok(threw); eq(JSON.stringify(sh._grid),before);
});
t('หัวคอลัมน์สำคัญซ้ำ -> migration ต้องไม่แทรกคอลัมน์เพิ่ม',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',TS],[]);
  const before=JSON.stringify(sh._grid);
  g.migrateMasterAddVarianceColumn(sh);
  g.migrateMasterAddVatColumns(sh);
  eq(JSON.stringify(sh._grid),before);
});
t('ยังไม่ปิดกะ -> โชว์ "—" ไม่ใช่ 0',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS],[]);
  g.writeToMaster(sh,2,'month','07-2026',{totalRevenue:1,totalExpenses:0,billCount:1,shiftCount:0,cashVariance:0});
  eq(sh._grid[1][6],'—');
});
t('ปิดกะแล้วตรงพอดี -> เลข 0 ไม่ใช่ "—"',()=>{
  const sh=FakeSheet(['ประเภท','ช่วงเวลา','บิล','รายได้รวม (฿)','ค่าใช้จ่าย (฿)','กำไรสุทธิ (฿)',V,TS],[]);
  g.writeToMaster(sh,2,'month','07-2026',{totalRevenue:1,totalExpenses:0,billCount:1,shiftCount:1,cashVariance:0});
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
t('พบหัว VAT แค่บางช่อง -> หยุดและไม่เขียนยอด',()=>{
  const sh=FakeSheet(OLD8.concat([g.MASTER_VAT_HEADERS[0]]),[]);
  const before=JSON.stringify(sh._grid);
  let threw=false;
  try { g.writeToMaster(sh,2,'day','2026-08-01',{billCount:1,totalRevenue:100,totalExpenses:0,shiftCount:0,cashVariance:0}); }
  catch(e) { threw=true; }
  ok(threw,'ต้องปฏิเสธโครงสร้าง VAT ที่ไม่ครบ');
  eq(JSON.stringify(sh._grid),before);
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
function clearBackupFolder(){
  delete scriptProps[g.POS_BACKUP_FOLDER_ID_PROPERTY];
  delete g.DriveApp._folders[g.BACKUP_FOLDER_NAME];
  Object.keys(g.DriveApp._foldersById).forEach(k=>delete g.DriveApp._foldersById[k]);
}
function setFolder(files, id){
  clearBackupFolder();
  const folderId=id||'folder-test';
  const folder={
    getId:()=>folderId, getName:()=>g.BACKUP_FOLDER_NAME,
    getFiles(){let i=0;return{hasNext:()=>i<files.length,next:()=>files[i++]}},
    getFilesByType(){return this.getFiles()},createFile(){}}
  g.DriveApp._folders[g.BACKUP_FOLDER_NAME]=folder;
  g.DriveApp._foldersById[folderId]=folder;
  return folder;
}
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
  clearBackupFolder();
  const r=parse(g.handleListBackups()); eq(r.status,'success'); eq(r.details.files,[]);
});
t('โฟลเดอร์สำรองชื่อซ้ำ -> ไม่เดาเลือกโฟลเดอร์',()=>{
  clearBackupFolder();
  const a=setFolder([], 'folder-a');
  const b={getId:()=> 'folder-b',getName:()=>g.BACKUP_FOLDER_NAME,getFiles:()=>({hasNext:()=>false}),getFilesByType:()=>({hasNext:()=>false})};
  g.DriveApp._folders[g.BACKUP_FOLDER_NAME]=[a,b];
  g.DriveApp._foldersById['folder-b']=b;
  let threw=false; try { g.getBackupFolder_(false); } catch(e) { threw=true; }
  ok(threw);
});
t('ตั้ง Folder ID แล้วเลือกโฟลเดอร์นั้นแม้ชื่อซ้ำ',()=>{
  clearBackupFolder();
  const a=setFolder([], 'folder-a');
  const b={getId:()=> 'folder-b',getName:()=>g.BACKUP_FOLDER_NAME,getFiles:()=>({hasNext:()=>false}),getFilesByType:()=>({hasNext:()=>false})};
  g.DriveApp._folders[g.BACKUP_FOLDER_NAME]=[a,b];
  g.DriveApp._foldersById['folder-b']=b;
  g.setPosBackupFolderId('folder-b');
  eq(g.getBackupFolder_(false).getId(),'folder-b');
});

console.log('\n--- รหัสเชื่อมต่อ Apps Script ---');
t('endpoint ที่ยังไม่ตั้งรหัส -> ปฏิเสธ',()=>{
  delete scriptProps[g.POS_API_TOKEN_PROPERTY];
  const r=parse(g.doPost({postData:{contents:JSON.stringify({action:'list_backups'})}}));
  eq(r.status,'error'); ok(/setupPosApiToken/.test(r.message));
});
t('endpoint ที่รหัสผิด -> ปฏิเสธ',()=>{
  scriptProps[g.POS_API_TOKEN_PROPERTY]='A'.repeat(24);
  const r=parse(g.doPost({postData:{contents:JSON.stringify({secret:'B'.repeat(24),action:'list_backups'})}}));
  eq(r.status,'error'); ok(/unauthorized/.test(r.message));
});
t('setupPosApiToken สร้างรหัสที่ไม่อยู่ใน source code',()=>{
  delete scriptProps[g.POS_API_TOKEN_PROPERTY];
  const token=g.setupPosApiToken();
  ok(/^[A-Za-z0-9_-]{24,200}$/.test(token));
  eq(scriptProps[g.POS_API_TOKEN_PROPERTY],token);
});

console.log('\n--- แท็บบิลรายเดือน: 4 คอลัมน์ VAT (เพิ่ม ส.ค. 2569) ---');
// เดิมแท็บนี้มี 9 คอลัมน์ ไม่มีช่อง VAT เลย — ตอน VAT ปิดอยู่ไม่มีใครเห็นปัญหา
// แต่วันไหนเปิดสวิตช์ VAT แถวจะบวกไม่ลงตัว แล้วยอดที่ยื่นสรรพากรจะไม่ตรงกับชีต
const BILL_OLD = ["เลขที่บิล","วันที่-เวลา","ลูกค้า","รายการบริการ","ช่องทางชำระเงิน",
                  "ราคารวม (฿)","ส่วนลด (฿)","ยอดสุทธิ (฿)","พนักงาน"];
const BILL_NEW = ctx.BILL_HEADERS;
const mkSS = (sheets) => ({ getSheetByName:(n)=>sheets[n]||null,
  insertSheet:(n)=>{ sheets[n]=FakeSheet([]); return sheets[n]; }, getSheets:()=>Object.values(sheets) });
const vatBill = (id) => ({ id, date:'2026-08-10T14:00:00+07:00', monthKey:'08-2026',
  dateTimeStr:'2026-08-10 14:00:00', customerName:'ลูกค้า ก', services:['ตัดผม','น้ำ'],
  paymentMethod:'cash', staffNames:['เอ'],
  subtotal:380, discount:0, nonVatBase:300, vatableBase:80, vatAmount:5.60, rounding:0.40, total:386 });

t('หัวตารางชุดใหม่มี 13 คอลัมน์ และ 4 ช่อง VAT อยู่ก่อน "ยอดสุทธิ"',()=>{
  eq(BILL_NEW.length,13);
  eq(BILL_NEW.slice(7,11),["ไม่คิด VAT (฿)","คิด VAT (฿)","VAT (฿)","ปัดเศษ (฿)"]);
  eq(BILL_NEW[11],'ยอดสุทธิ (฿)');
  eq(BILL_NEW[12],'พนักงาน');});

console.log('\n  · แท็บเก่า 9 คอลัมน์ ต้องถูกเติมให้ครบ');
let sh = FakeSheet(BILL_OLD, [['TX-OLD','2026-08-01 10:00','ก','ตัดผม','เงินสด',300,0,300,'เอ']]);
ctx.migrateBillSheetAddVatColumns_(sh);
t('แทรก 4 คอลัมน์แล้วหัวตารางตรงกับชุดใหม่ทุกช่อง',()=>eq(sh._grid[0].slice(0,13),BILL_NEW));
t('ข้อมูลเดิมไม่หายและไม่สลับช่อง (ยอดสุทธิยังอยู่ที่ 300 พนักงานยังเป็น เอ)',()=>{
  const r=sh._grid[1]; eq(r[0],'TX-OLD'); eq(r[5],300); eq(r[6],0); eq(r[11],300); eq(r[12],'เอ');});
t('แถวเก่าเว้นว่างใน 4 ช่องใหม่ ไม่เดาเติมเลขย้อนหลัง',()=>eq(sh._grid[1].slice(7,11),['','','','']));
const before = JSON.stringify(sh._grid);
ctx.migrateBillSheetAddVatColumns_(sh);
t('เรียก migrate ซ้ำ ไม่แทรกซ้ำ (idempotent)',()=>eq(JSON.stringify(sh._grid),before));

console.log('\n  · แท็บที่โครงสร้างแปลก ห้ามแตะ');
let weird = FakeSheet(["อะไรก็ไม่รู้","ยอดสุทธิ (฿)"], [['x',1]]);
ctx.migrateBillSheetAddVatColumns_(weird);
t('คอลัมน์แรกไม่ใช่ "เลขที่บิล" -> ไม่แทรกอะไรเลย',()=>eq(weird._grid[0].length,2));
let noNet = FakeSheet(["เลขที่บิล","ลูกค้า"], [['x','ก']]);
ctx.migrateBillSheetAddVatColumns_(noNet);
t('ไม่มีคอลัมน์ "ยอดสุทธิ" -> ไม่แทรกอะไรเลย',()=>eq(noNet._grid[0].length,2));
let half = FakeSheet(["เลขที่บิล","VAT (฿)","ยอดสุทธิ (฿)"], []);
ctx.migrateBillSheetAddVatColumns_(half);
t('มีหัว VAT แค่บางช่อง -> หยุด ไม่แทรกทับของเดิม',()=>eq(half._grid[0].length,3));

console.log('\n  · เขียนบิลจริงลงแท็บที่ migrate แล้ว');
scriptProps['POS_API_TOKEN']='T'.repeat(32);
let sheets={'08-2026':FakeSheet(BILL_OLD,[])};
let res = JSON.parse(ctx.handleTransaction(vatBill('TX-VAT-1'), mkSS(sheets)));
let bg = sheets['08-2026']._grid;
t('บันทึกบิลสำเร็จ',()=>eq(res.status,'success'));
t('แท็บถูกเติมคอลัมน์ VAT ให้อัตโนมัติตอนเขียนบิล',()=>eq(bg[0].slice(0,13),BILL_NEW));
t('4 ช่อง VAT ลงคอลัมน์ที่ถูก',()=>eq(bg[1].slice(7,12),[300,80,5.60,0.40,386]));
t('ราคารวม − ส่วนลด = ไม่คิด VAT + คิด VAT',()=>eq(bg[1][5]-bg[1][6], bg[1][7]+bg[1][8]));
t('ไม่คิด VAT + คิด VAT + VAT + ปัดเศษ = ยอดสุทธิ',()=>
  eq(Math.round((bg[1][7]+bg[1][8]+bg[1][9]+bg[1][10])*100)/100, bg[1][11]));
t('ชื่อพนักงานยังอยู่ช่องสุดท้าย',()=>eq(bg[1][12],'เอ'));

console.log('\n  · บิลรุ่นเก่าที่ไม่มีฟิลด์ VAT ติดมา');
sheets={'08-2026':FakeSheet(BILL_NEW,[])};
const legacy = vatBill('TX-LEGACY');
delete legacy.nonVatBase; delete legacy.vatableBase; delete legacy.vatAmount; delete legacy.rounding;
legacy.subtotal=300; legacy.discount=50; legacy.total=250;
ctx.handleTransaction(legacy, mkSS(sheets));
bg = sheets['08-2026']._grid;
t('คำนวณย้อนให้ "ไม่คิด VAT" = ยอดสุทธิ ช่องอื่นเป็น 0',()=>eq(bg[1].slice(7,12),[250,0,0,0,250]));
t('บิลรุ่นเก่าแถวก็ยังบวกลงตัว',()=>eq(bg[1][5]-bg[1][6], bg[1][7]+bg[1][8]));

console.log('\n  · บิลที่คิด VAT ทุกชิ้น (nonVatBase = 0 จริง ๆ ไม่ใช่ค่าหาย)');
sheets={'08-2026':FakeSheet(BILL_NEW,[])};
ctx.handleTransaction({ ...vatBill('TX-ALLVAT'), subtotal:100, discount:0,
  nonVatBase:0, vatableBase:100, vatAmount:7, rounding:0, total:107 }, mkSS(sheets));
bg = sheets['08-2026']._grid;
t('0 ต้องถูกเก็บเป็น 0 ไม่ใช่ถูกคำนวณย้อนทับ',()=>eq(bg[1].slice(7,12),[0,100,7,0,107]));

console.log('\n  · แท็บที่ migrate ไม่ผ่าน ต้องยังเขียนแบบเดิมได้');
sheets={'08-2026':FakeSheet(["เลขที่บิล","ลูกค้า"],[])};
res = JSON.parse(ctx.handleTransaction(vatBill('TX-ODD'), mkSS(sheets)));
t('โครงสร้างแปลก -> ยังบันทึกได้ ไม่ล้ม',()=>eq(res.status,'success'));
t('โครงสร้างแปลก -> เขียนแบบ 9 คอลัมน์เดิม ไม่ยัด 13 ช่องทับ',()=>eq(sheets['08-2026']._grid[1].length,9));

console.log('\n  · แท็บสร้างใหม่เอี่ยม');
sheets={};
ctx.handleTransaction(vatBill('TX-FRESH'), mkSS(sheets));
t('แท็บใหม่เกิดมาพร้อม 13 คอลัมน์เลย',()=>eq(sheets['08-2026']._grid[0].slice(0,13),BILL_NEW));

console.log('\n  · upsert บิลเดิมซ้ำ');
sheets={'08-2026':FakeSheet(BILL_NEW,[])};
ctx.handleTransaction(vatBill('TX-UPSERT'), mkSS(sheets));
res = JSON.parse(ctx.handleTransaction({ ...vatBill('TX-UPSERT'), customerName:'ลูกค้าแก้ชื่อ' }, mkSS(sheets)));
bg = sheets['08-2026']._grid;
t('ส่งซ้ำ = อัปเดตแถวเดิม ไม่เพิ่มแถวใหม่',()=>{eq(res.details.updated,true); eq(bg.length,2);});
t('ค่า VAT ยังอยู่ครบหลังอัปเดต',()=>eq(bg[1].slice(7,12),[300,80,5.60,0.40,386]));

console.log('\n--- ฟังก์ชันที่ coverage บอกว่าไม่เคยถูกเทสต์เลย (เพิ่ม ส.ค. 2569) ---');

console.log('\n  · doGet — ต้องไม่เผยอะไร และไม่ต้องใช้รหัส');
const getOut = ctx.doGet({});
t('doGet ตอบข้อความสั้น ๆ ไม่หลุดข้อมูลร้าน',()=>{
  const s=String(getOut);
  ok(/active/i.test(s)); ok(!/secret|token|POS_API/i.test(s), s);});

console.log('\n  · setupPosApiToken ปลอดภัย / rotatePosApiToken เปลี่ยนรหัสจริง');
delete scriptProps['POS_API_TOKEN'];
const tok1 = ctx.setupPosApiToken();
const tok2 = ctx.setupPosApiToken();
t('setupPosApiToken เรียกซ้ำได้รหัสเดิม (ปลอดภัย ใช้ดูรหัสได้)',()=>eq(tok1,tok2));
t('รหัสที่สร้างผ่านเกณฑ์ที่ระบบยอมรับ',()=>ok(/^[A-Za-z0-9_-]{24,200}$/.test(tok1)));
const tok3 = ctx.rotatePosApiToken();
t('rotatePosApiToken เปลี่ยนรหัสใหม่จริง (ทุกเครื่องที่ถือรหัสเก่าจะใช้ไม่ได้ทันที)',()=>ok(tok3!==tok1));
t('รหัสใหม่ถูกเก็บลง Script Properties แล้ว',()=>eq(ctx.getPosApiToken_(),tok3));
scriptProps['POS_API_TOKEN']='T'.repeat(32);

console.log('\n  · handleBackup — ทางสำรองข้อมูลขึ้น Drive');
delete scriptProps['POS_BACKUP_FOLDER_ID'];
ctx.DriveApp._folders={}; ctx.DriveApp._foldersById={};
const backupPayload = { services:[{id:1}], staff:[{id:1}], transactions:[{id:'TX-1',total:300}] };
let bkRes = JSON.parse(ctx.handleBackup({ backupData: backupPayload }, null));
t('สำรองสำเร็จและบอกชื่อไฟล์กลับมา',()=>{
  eq(bkRes.status,'success'); ok(/^pos_backup_/.test(bkRes.details.fileName), bkRes.details.fileName);});
const folder = ctx.DriveApp._foldersById[scriptProps['POS_BACKUP_FOLDER_ID']];
t('โฟลเดอร์สำรองถูกสร้างและจำ ID ไว้ (กันหยิบผิดโฟลเดอร์เมื่อชื่อซ้ำ)',()=>ok(!!folder));
t('ไฟล์ถูกเขียนลงโฟลเดอร์จริง 1 ไฟล์',()=>eq(folder._files.length,1));
t('เนื้อไฟล์คือข้อมูลที่ส่งมาครบ ไม่ตกหล่น',()=>{
  const back=JSON.parse(folder._files[0].getBlob().getDataAsString());
  eq(back.transactions[0].id,'TX-1'); eq(back.transactions[0].total,300);});

console.log('\n  · handleBackup ลบไฟล์เก่าเกินอายุ ไม่แตะไฟล์ใหม่');
const oldF = { _trashed:false, getName:()=>'pos_backup_2020-01-01_00-00-00.json',
  getDateCreated:()=>new Date(Date.now()-200*24*3600e3), setTrashed(v){this._trashed=v;},
  getId:()=>'old', getBlob:()=>({getDataAsString:()=>'{}'}), getSize:()=>2 };
const keepF = { _trashed:false, getName:()=>'pos_backup_2026-08-01_00-00-00.json',
  getDateCreated:()=>new Date(Date.now()-3*24*3600e3), setTrashed(v){this._trashed=v;},
  getId:()=>'keep', getBlob:()=>({getDataAsString:()=>'{}'}), getSize:()=>2 };
const otherF = { _trashed:false, getName:()=>'เอกสารสำคัญของร้าน.json',
  getDateCreated:()=>new Date(Date.now()-900*24*3600e3), setTrashed(v){this._trashed=v;},
  getId:()=>'other', getBlob:()=>({getDataAsString:()=>'{}'}), getSize:()=>2 };
folder._files.push(oldF, keepF, otherF);
ctx.handleBackup({ backupData: backupPayload }, null);
t('ไฟล์สำรองเก่าเกิน 90 วัน ถูกย้ายลงถังขยะ',()=>eq(oldF._trashed,true));
t('ไฟล์สำรองที่ยังไม่เก่า ไม่ถูกแตะ',()=>eq(keepF._trashed,false));
t('ไฟล์อื่นที่ไม่ใช่ไฟล์สำรอง ต้องไม่ถูกลบ แม้จะเก่ามาก',()=>eq(otherF._trashed,false));

console.log('\n  · handleVoidTransaction — ลบแถวบิลออกจากชีต');
let vsheets = { '08-2026': FakeSheet(ctx.BILL_HEADERS, [
  ['TX-KEEP-1','2026-08-10 10:00','ก','ตัดผม','เงินสด',300,0,300,0,0,0,300,'เอ'],
  ['TX-GONE-1','2026-08-10 11:00','ข','นวด','เงินสด',500,0,500,0,0,0,500,'บี'],
  ['TX-KEEP-2','2026-08-10 12:00','ค','ตัดผม','เงินสด',200,0,200,0,0,0,200,'ซี'] ]) };
const vSS = { getSheetByName:(n)=>vsheets[n]||null, insertSheet:()=>null, getSheets:()=>Object.values(vsheets) };
let vRes = JSON.parse(ctx.handleVoidTransaction({ id:'TX-GONE-1', monthKey:'08-2026', date:'2026-08-10T11:00:00+07:00' }, vSS));
t('ลบบิลที่ระบุออกจากชีตสำเร็จ',()=>eq(vRes.status,'success'));
t('เหลือ 2 แถว และเป็นแถวที่ต้องเหลือจริง',()=>{
  const g2=vsheets['08-2026']._grid;
  eq(g2.length,3); eq(g2[1][0],'TX-KEEP-1'); eq(g2[2][0],'TX-KEEP-2');});

vRes = JSON.parse(ctx.handleVoidTransaction({ id:'TX-GONE-1', monthKey:'08-2026', date:'2026-08-10T11:00:00+07:00' }, vSS));
t('ลบซ้ำ -> ตอบ NOT_FOUND (ฝั่งแอปถือว่าสำเร็จ ไม่วน retry ตลอดกาล)',()=>{
  eq(vRes.status,'error'); eq(vRes.code,'NOT_FOUND');});
vRes = JSON.parse(ctx.handleVoidTransaction({ id:'TX-X', monthKey:'01-2026', date:'2026-01-01T00:00:00+07:00' }, vSS));
t('ไม่มีแท็บเดือนนั้น -> ตอบ NOT_FOUND เช่นกัน',()=>eq(vRes.code,'NOT_FOUND'));
vRes = JSON.parse(ctx.handleVoidTransaction({ id:'TX-X', monthKey:'99-1970', date:'x' }, vSS));
t('เดือนเพี้ยน -> ปฏิเสธ และต้องไม่ใช่ NOT_FOUND (จะได้ลองใหม่ ไม่ใช่ทิ้งคำสั่งลบ)',()=>{
  eq(vRes.status,'error'); ok(vRes.code!=='NOT_FOUND', JSON.stringify(vRes));});

console.log('\n  · ด่านรหัสของทั้ง endpoint');
scriptProps['POS_API_TOKEN']='S'.repeat(32);
const post = (body)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}));
t('ไม่ส่งรหัส -> unauthorized',()=>eq(post({action:'backup',backupData:{}}).message,'ไม่ได้รับอนุญาต (unauthorized)'));
t('รหัสผิด -> unauthorized',()=>eq(post({secret:'X'.repeat(32),action:'backup',backupData:{}}).message,'ไม่ได้รับอนุญาต (unauthorized)'));
t('ไม่มี body เลย -> ไม่พัง และไม่หลุดข้อมูล',()=>{
  const r=JSON.parse(ctx.doPost({})); eq(r.status,'error'); ok(/ไม่พบข้อมูลที่ส่งมา/.test(r.message));});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
