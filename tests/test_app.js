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
// ข้อความจากชีตถูกแปลเป็นวิธีแก้แล้ว (explainCloudError) ไม่ใช่ส่งข้อความดิบมาโชว์
t('ขึ้น toast แจ้ง error ที่บอกว่าต้องทำอะไรต่อ',()=>ok(
  toasts.some(x=>x.ty==='error' && /ไม่อยู่ใน Drive แล้ว/.test(x.m) && /โหลดรายการใหม่/.test(x.m)),
  JSON.stringify(toasts)));

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

console.log('\n--- แปลข้อความผิดพลาดจากชีตให้อ่านรู้เรื่อง (เพิ่ม ส.ค. 2569) ---');
// 26 ส.ค. 2569 หน้ากู้ข้อมูลขึ้น "ไม่ได้รับอนุญาต (unauthorized)" ดิบ ๆ
// ซึ่งบอกแค่ว่าพัง ไม่ได้บอกว่าต้องทำอะไร — เสียเวลาไปกับการไล่หาสาเหตุจริง
const ex = (m) => app.explainCloudError(m);

t('unauthorized -> บอกว่าไปตั้งรหัสใหม่ที่ไหน และให้รันฟังก์ชันอะไร', () => {
  const m = ex('ไม่ได้รับอนุญาต (unauthorized)');
  ok(/ตั้งค่า/.test(m) && /setupPosApiToken/.test(m), m);});
t('unauthorized -> เตือนห้ามรัน rotatePosApiToken ด้วย', () =>
  ok(/ห้ามรัน rotatePosApiToken/.test(ex('ไม่ได้รับอนุญาต (unauthorized)'))));
t('ฝั่งชีตยังไม่ได้ตั้งรหัส -> บอกให้ไปรัน setupPosApiToken', () =>
  ok(/setupPosApiToken/.test(ex('ยังไม่ได้ตั้งรหัสเชื่อมต่อ POS — ให้รัน setupPosApiToken() ใน Apps Script ก่อน'))));

// เคสที่เดาเองไม่มีทางออก: Deploy เป็น "Only myself" -> Google ส่งหน้า HTML กลับมา
// แล้ว res.json() พังเป็น "Unexpected token '<'" ซึ่งไม่มีอะไรบอกใบ้เลยว่าเกี่ยวกับการ Deploy
t('JSON พัง (ได้หน้า HTML กลับมา) -> บอกว่าต้องตั้ง Who has access = Anyone', () =>
  ok(/Anyone/.test(ex(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`))));
t('HTTP 403 -> บอกว่าต้องตั้ง Who has access = Anyone', () => ok(/Anyone/.test(ex('HTTP 403'))));
t('HTTP 401 -> บอกเรื่องสิทธิ์เข้าถึงเหมือนกัน', () => ok(/Anyone/.test(ex('HTTP 401'))));
t('HTTP 404 -> บอกว่า URL อาจเปลี่ยนหลัง Deploy ใหม่', () => ok(/URL/.test(ex('HTTP 404'))));
t('HTTP 500 -> บอกว่าเป็นฝั่ง Google และข้อมูลยังอยู่ครบ', () => {
  const m = ex('HTTP 500'); ok(/Google/.test(m) && /ยังอยู่ครบ/.test(m), m);});
t('ระบบหนาแน่น -> บอกให้รอแล้วลองใหม่', () => ok(/ลองใหม่/.test(ex('ระบบหนาแน่น กรุณาลองใหม่'))));
t('หมดเวลารอ -> คงข้อความเดิมไว้ แล้วต่อท้ายว่าให้เช็คเน็ต', () => {
  const m = ex('หมดเวลารอ 20 วินาที (เครือข่ายช้าหรือค้าง)');
  ok(/หมดเวลารอ 20 วินาที/.test(m) && /เน็ต/.test(m), m);});
t('ไม่พบไฟล์สำรอง -> บอกให้กดโหลดรายการใหม่', () =>
  ok(/โหลดรายการใหม่/.test(ex('ไม่พบไฟล์นี้ในโฟลเดอร์สำรอง (อาจถูกลบไปแล้ว)'))));
t('ยังไม่มีโฟลเดอร์สำรอง -> อธิบายว่าจะถูกสร้างเองหลังปิดกะ', () =>
  ok(/ปิดกะ/.test(ex('ไม่พบโฟลเดอร์ Erotica_POS_Backups ใน Google Drive'))));

// ข้อสำคัญที่สุด: ห้ามกลืนข้อความที่ไม่รู้จัก ไม่งั้นเวลาเจอปัญหาใหม่จะไม่เหลือเบาะแสอะไรเลย
t('ข้อความที่ไม่รู้จัก -> ส่งกลับเหมือนเดิม ไม่กลืนหาย', () =>
  eq(ex('อะไรบางอย่างที่ยังไม่เคยเจอ'), 'อะไรบางอย่างที่ยังไม่เคยเจอ'));
t('รับ Error object ได้ ไม่ใช่แค่ string', () =>
  ok(/setupPosApiToken/.test(ex(new Error('ไม่ได้รับอนุญาต (unauthorized)')))));
t('ค่าว่าง -> ยังคืนข้อความที่อ่านรู้เรื่อง ไม่ใช่ค่าว่าง', () => ok(ex('').length > 10));
t('null -> ไม่พัง', () => ok(ex(null).length > 10));

console.log('\n--- ข้อความต้องถูกแปล "ตอนถึงหน้าจอจริง" ไม่ใช่แค่ตอนเรียกฟังก์ชันตรง ๆ ---');
// เทสต์ชุดก่อนหน้าเรียก explainCloudError ตรง ๆ ซึ่งผ่านหมด
// แต่ทางที่ error เดินจริงตอน fetch ล้มเอง (หมดเวลา / เน็ตหลุด / ได้ HTML กลับมา)
// ไม่ได้วิ่งผ่านตัวแปลเลย — เทสต์เขียว แต่ผู้ใช้ยังเห็นข้อความดิบอยู่ดี
// ชุดนี้จึงยิงผ่าน loadDriveBackups ของจริง แล้วอ่านสิ่งที่ขึ้นบนหน้าจอ
app.currentRole='owner'; app.loadFailed=false;
app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='A'.repeat(24);
const listEl = h.document.getElementById('restore-list');
// ต้องดึงตัวจริงจาก prototype — ตัวบน instance ถูก stub ทิ้งไปตอนเทสต์ด่านสิทธิ์ด้านบน
const realLoadDriveBackups = Object.getPrototypeOf(app).loadDriveBackups.bind(app);
const shownOnScreen = async (fakeFetch) => { app.fetchWithTimeout = fakeFetch;
  listEl.innerHTML=''; await realLoadDriveBackups(); return listEl.innerHTML; };

const outTimeout = await shownOnScreen(async()=>{ throw new Error('หมดเวลารอ 20 วินาที (เครือข่ายช้าหรือค้าง)'); });
t('หน้ากู้ข้อมูล + หมดเวลารอ -> บอกให้เช็คเน็ต และบอกว่าข้อมูลยังอยู่ครบ',()=>
  ok(/เน็ต/.test(outTimeout) && /ยังอยู่ครบ/.test(outTimeout), outTimeout));

const outHtml = await shownOnScreen(async()=>({ ok:true,
  json:async()=>{ throw new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`); } }));
t('หน้ากู้ข้อมูล + ได้หน้า HTML กลับมา -> บอกว่าต้องตั้ง Who has access = Anyone',()=>
  ok(/Anyone/.test(outHtml), outHtml));

// เคสจริงที่เจอ 26 ส.ค. 2569
const outUnauth = await shownOnScreen(async()=>({ ok:true,
  json:async()=>({status:'error',message:'ไม่ได้รับอนุญาต (unauthorized)'}) }));
t('หน้ากู้ข้อมูล + unauthorized -> บอกวิธีแก้ ไม่ใช่โยนคำว่า unauthorized ให้อ่านเอง',()=>
  ok(/setupPosApiToken/.test(outUnauth) && /ตั้งค่า/.test(outUnauth), outUnauth));
t('หน้ากู้ข้อมูล + unauthorized -> ต้องไม่เหลือคำดิบ "unauthorized" ให้เห็น',()=>
  ok(!/unauthorized/i.test(outUnauth), outUnauth));

const outHttp = await shownOnScreen(async()=>({ ok:false, status:403 }));
t('หน้ากู้ข้อมูล + HTTP 403 -> บอกเรื่องสิทธิ์ตอน Deploy',()=>ok(/Anyone/.test(outHttp), outHttp));

console.log('\n  · ทางสำรองข้อมูลตอนปิดกะ');
toasts.length=0;
app.fetchWithTimeout=async()=>{ throw new Error('หมดเวลารอ 30 วินาที (เครือข่ายช้าหรือค้าง)'); };
await app.autoBackupToGoogleDrive();
t('สำรองขึ้น Drive ล้มเหลว -> ข้อความบอกให้เช็คเน็ต ไม่ใช่ข้อความดิบ',()=>
  ok(toasts.some(x=>x.ty==='error' && /เน็ต/.test(x.m)), JSON.stringify(toasts)));

console.log('\n  · แปลซ้ำแล้วต้องได้ผลเดิม (ข้อความเดินผ่านตัวแปล 2 รอบ)');
const once = app.explainCloudError('หมดเวลารอ 20 วินาที (เครือข่ายช้าหรือค้าง)');
t('แปลรอบสองไม่ต่อหางซ้อน',()=>eq(app.explainCloudError(once), once));
const onceU = app.explainCloudError('ไม่ได้รับอนุญาต (unauthorized)');
t('unauthorized แปลซ้ำก็ได้ผลเดิม',()=>eq(app.explainCloudError(onceU), onceU));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
