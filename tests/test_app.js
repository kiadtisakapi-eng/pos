const h=require('./harness.js');
const app=h.ctx.app;
let pass=0, fail=0;
const t=(name,fn)=>{ try{ const r=fn(); if(r instanceof Promise) return r.then(()=>{pass++;console.log('  PASS',name)},e=>{fail++;console.log('  FAIL',name,'->',e.message)}); pass++; console.log('  PASS',name);}catch(e){fail++;console.log('  FAIL',name,'->',e.message);} };
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok=(c,m)=>{ if(!c) throw new Error(m||'expected truthy'); };

// เก็บ toast ที่ขึ้น
const toasts=[]; app.showToast=(m,ty)=>toasts.push({m,ty});
app.vibrateDevice=()=>{}; app.renderAll=()=>{}; app.migratePinIfNeeded=async()=>{};
let saved=0; const realSave=app.saveState.bind(app);
app.saveState=async function(){ if(this.loadFailed) return; saved++; };
// showConfirm: กด "ตกลง" ทันที
app.showConfirm=(msg,cb)=>{ app._lastConfirm=msg; app._confirmPromise=cb(); return app._confirmPromise; };
app.openModal=()=>{}; app.closeModal=(id)=>{app._closed=id;};
app.exportData=()=>{ app._exported=(app._exported||0)+1; };

const doRestore=async(...a)=>{ app.restoreFromDriveBackup(...a); await app._confirmPromise; };

const goodBackup=()=>({
  services:[{id:1,name:'ตัดผม',price:200}], staff:[{id:1,name:'เอ'}],
  transactions:[{id:'t1',date:'2026-07-01T10:00:00.000Z',total:200}],
  categories:[{id:'c1',name:'ผม'}], customers:[{id:'u1'}], queue:[],
  voidLog:[{id:'v1'}], shift:{active:false,history:'พัง',expenses:null},
  shopName:'ร้านทดสอบ', shopLogo:'javascript:alert(1)',
  googleSheetsUrl:'https://OLD-deployment/exec', telegramChatId:'999'
});

(async()=>{
console.log('\n--- isValidBackupObject ---');
t('ไฟล์สำรองปกติ = ผ่าน',()=>ok(app.isValidBackupObject(goodBackup())));
t('null = ไม่ผ่าน',()=>ok(!app.isValidBackupObject(null)));
t('array = ไม่ผ่าน',()=>ok(!app.isValidBackupObject([1,2,3])));
t('services เป็น string = ไม่ผ่าน',()=>{const b=goodBackup();b.services='x';ok(!app.isValidBackupObject(b));});
t('ไม่มี transactions = ไม่ผ่าน',()=>{const b=goodBackup();delete b.transactions;ok(!app.isValidBackupObject(b));});

console.log('\n--- applyBackupData ---');
app.loadFailed=false;
app.googleSheetsUrl='https://CURRENT-deployment/exec';
app.googleSheetsApiToken='A'.repeat(24);
app.state.cloudOutbox=[{needSummary:true}];
app.shopLogo='';
await app.applyBackupData(goodBackup());
t('บันทึกลง DB 1 ครั้ง',()=>eq(saved,1));
t('cloudOutbox ถูกล้าง',()=>eq(app.state.cloudOutbox,[]));
t('voidLog เข้ามาครบ',()=>eq(app.state.voidLog.length,1));
t('shift.history ที่พังถูกซ่อมเป็น []',()=>eq(app.state.shift.history,[]));
t('shift.expenses null ถูกซ่อมเป็น []',()=>eq(app.state.shift.expenses,[]));
t('ไม่ทับ URL คลาวด์ของเครื่องนี้',()=>eq(app.googleSheetsUrl,'https://CURRENT-deployment/exec'));
t('โลโก้ที่ไม่ใช่ data:image ถูกปฏิเสธ',()=>eq(app.shopLogo,''));
t('ชื่อร้านเข้ามา',()=>eq(app.shopName,'ร้านทดสอบ'));

console.log('\n--- applyBackupData: เครื่องใหม่ยังไม่ตั้ง URL ---');
app.googleSheetsUrl='';
await app.applyBackupData(goodBackup());
t('รับ URL จากไฟล์เมื่อเครื่องยังว่าง',()=>eq(app.googleSheetsUrl,'https://OLD-deployment/exec'));

console.log('\n--- applyBackupData: โหลดข้อมูลเดิมพัง ---');
app.loadFailed=true; const before=saved;
let threw=false;
try{ await app.applyBackupData(goodBackup()); }catch(e){ threw=true; }
t('ต้อง throw ไม่ยอมเขียนทับ',()=>ok(threw));
t('ไม่มีการบันทึกลง DB',()=>eq(saved,before));
app.loadFailed=false;

console.log('\n--- formatBackupLabel ---');
t('ISO ปกติ -> พ.ศ.',()=>{const s=app.formatBackupLabel({created:'2026-07-27T14:40:05.000Z'});ok(/2569/.test(s),'got '+s);});
t('created พัง -> ใช้ชื่อไฟล์',()=>eq(app.formatBackupLabel({created:'ขยะ',name:'pos_backup_x.json'}),'pos_backup_x.json'));
t('ไม่มีอะไรเลย -> ข้อความสำรอง',()=>eq(app.formatBackupLabel(null),'ไฟล์สำรอง'));

console.log('\n--- resumePendingCloudWork ---');
let resumedTx=0,resumedOutbox=0;
app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='A'.repeat(24);
app.syncPendingTransactions=(silent)=>{if(silent)resumedTx++;};
app.flushCloudOutbox=()=>{resumedOutbox++;};
app.resumePendingCloudWork();
t('เปิดแอป/เน็ตกลับ -> ส่งบิลและ outbox ที่ค้าง',()=>{eq(resumedTx,1);eq(resumedOutbox,1);});
app.googleSheetsApiToken=''; app.resumePendingCloudWork();
t('ไม่มีรหัสคลาวด์ -> ไม่พยายามส่ง',()=>{eq(resumedTx,1);eq(resumedOutbox,1);});

console.log('\n--- คิวสรุประหว่างตั้งค่า token ---');
app.state.cloudOutbox=[];
app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='';
app.enqueueShiftCloseCloudOps({startTime:Date.now()-60000,endTime:Date.now()});
t('มี URL แล้วแต่ยังไม่มี token -> เก็บงานสรุปไว้ก่อน',()=>{
  eq(app.state.cloudOutbox.length,1);
  ok(app.state.cloudOutbox[0].needSummary);
});

console.log('\n--- ด่านสิทธิ์ restoreFromDriveBackup (เพิ่ม ส.ค. 2569) ---');
// ตัวฟังก์ชันต้องมีด่านของตัวเอง ไม่ใช่พึ่งแค่ว่า openRestoreModal เปิดให้เฉพาะเจ้าของ
// (ปุ่มกู้ข้อมูลถูกผูก onclick ไว้กับ element โดยตรง ถ้าด่านอยู่ชั้นเดียวจะข้ามได้)
app.googleSheetsUrl='https://gas/exec';
app.googleSheetsApiToken='A'.repeat(24);
let guardFetches=0;
app.fetchWithTimeout=async()=>{ guardFetches++; throw new Error('ไม่ควรถูกเรียก'); };
app.currentRole='staff'; app.loadFailed=false; app._confirmPromise=null;
await doRestore('FILEID123','x');
t('พนักงานกู้ข้อมูลไม่ได้',()=>eq(guardFetches,0));
app.currentRole='owner'; app.loadFailed=true; app._confirmPromise=null;
await doRestore('FILEID123','x');
t('โหลดข้อมูลไม่สำเร็จ ห้ามกู้ทับ',()=>eq(guardFetches,0));
app.loadFailed=false;

console.log('\n--- restoreFromDriveBackup ---');
let sentBody=null;
app.fetchWithTimeout=async(url,opt)=>{ sentBody=JSON.parse(opt.body);
  return { ok:true, json:async()=>({status:'success',details:{fileName:'pos_backup_a.json',backupData:goodBackup()}}) }; };
app._exported=0; saved=0;
await doRestore('FILEID123','27/7/2569 21:40 น.');
t('ส่ง action=get_backup + fileId',()=>{eq(sentBody.action,'get_backup');eq(sentBody.fileId,'FILEID123');});
t('ส่ง secret ไปด้วย',()=>ok(!!sentBody.secret));
t('เซฟสำเนาข้อมูลปัจจุบันก่อน 1 ครั้ง',()=>eq(app._exported,1));
t('เขียนข้อมูลใหม่ลง DB',()=>eq(saved,1));
t('ปิด modal หลังสำเร็จ',()=>eq(app._closed,'modal-restore'));

console.log('\n--- restore: คลาวด์ตอบ error ---');
app.fetchWithTimeout=async()=>({ ok:true, json:async()=>({status:'error',message:'ไม่พบไฟล์นี้ในโฟลเดอร์สำรอง'}) });
saved=0; toasts.length=0;
await doRestore('BAD','x');
t('ไม่เขียนอะไรลง DB',()=>eq(saved,0));
t('ขึ้น toast แจ้ง error',()=>ok(toasts.some(x=>x.ty==='error'&&/ไม่พบไฟล์/.test(x.m)),JSON.stringify(toasts)));

console.log('\n--- restore: ไฟล์ที่ได้มาไม่ใช่ backup ---');
app.fetchWithTimeout=async()=>({ ok:true, json:async()=>({status:'success',details:{backupData:{foo:1}}}) });
saved=0; toasts.length=0;
await doRestore('X','x');
t('ปฏิเสธ ไม่เขียน DB',()=>eq(saved,0));

console.log('\n--- restore: เน็ตหลุด ---');
app.fetchWithTimeout=async()=>{ throw new Error('หมดเวลารอ 60 วินาที'); };
saved=0; toasts.length=0;
await doRestore('X','x');
t('ไม่เขียน DB และแจ้งว่าข้อมูลเดิมยังอยู่',()=>{eq(saved,0);ok(toasts.some(x=>/ข้อมูลเดิมในเครื่องยังอยู่ครบ/.test(x.m)));});

console.log('\n--- ด่านสิทธิ์ openRestoreModal ---');
let opened=0; app.openModal=()=>{opened++}; app.loadDriveBackups=async()=>{};
app.loadFailed=false; app.currentRole='staff'; app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='A'.repeat(24);
await app.openRestoreModal(); t('staff เปิดไม่ได้',()=>eq(opened,0));
app.currentRole='owner'; app.googleSheetsUrl='';
await app.openRestoreModal(); t('ไม่มี URL เปิดไม่ได้',()=>eq(opened,0));
app.googleSheetsUrl='https://gas/exec'; app.loadFailed=true;
await app.openRestoreModal(); t('loadFailed เปิดไม่ได้',()=>eq(opened,0));
app.loadFailed=false;
await app.openRestoreModal(); t('owner + URL ครบ เปิดได้',()=>eq(opened,1));

console.log('\n--- saveShopSettings: บันทึกล้มเหลวต้องคืนค่าเดิม ---');
app.googleSheetsUrl='https://old/exec'; app.googleSheetsApiToken='B'.repeat(24);
const urlInput=h.document.getElementById('shop-sheets-sync-url');
const tokenInput=h.document.getElementById('shop-sheets-api-token');
urlInput.value='https://new/exec'; tokenInput.value='C'.repeat(24);
app.saveState=async()=>false;
await app.saveShopSettings();
t('เซฟตั้งค่าไม่สำเร็จ -> URL และ token กลับเป็นค่าเดิม',()=>{
  eq(app.googleSheetsUrl,'https://old/exec');
  eq(app.googleSheetsApiToken,'B'.repeat(24));
  eq(urlInput.value,'https://old/exec');
  eq(tokenInput.value,'B'.repeat(24));
});
app.saveState=async()=>{};

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
