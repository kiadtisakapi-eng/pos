// ทะเบียนบิลที่ถูกยกเลิก (tombstone) ฝั่ง Apps Script
//
// ทำไมต้องมีฝั่ง backend: คำขอ "บันทึกบิล" ที่แอปหมดเวลารอไปแล้ว ยังเดินทางถึง Google
// และถูกประมวลผลได้ การเรียงคิวในเบราว์เซอร์คุมได้แค่ "ลำดับที่เรายิงออกไป"
// ไม่ใช่ "ลำดับที่เซิร์ฟเวอร์ทำจริง" ปลายทางจึงต้องเป็นคนตัดสินใจสุดท้าย
//
// ⚠️ harness ของ Codex (audit/recheck-d-edge.cjs) ไม่ได้ให้ PropertiesService
// ทะเบียนจึงเขียนไม่ลงในนั้น ทำให้ D02 ยัง FAIL ที่ฝั่งเขา
// จะแก้ให้ผ่าน harness นั้นได้ต้องเก็บทะเบียนไว้ในตัวแปรของสคริปต์ ซึ่ง **ผิดบนของจริง**
// เพราะ Apps Script รันสคริปต์ใหม่ทุกคำขอ ตัวแปรจึงหายทุกครั้ง
// ไฟล์นี้จึงพิสูจน์ด้วย harness เดียวกันแต่เติม PropertiesService ที่ของจริงมีเสมอ
// พิสูจน์ D02 ด้วย harness เดียวกับ Codex แต่เติม PropertiesService ซึ่งของจริงมีเสมอ
// (Apps Script รันใหม่ทุกคำขอ ทะเบียนจึงต้องอยู่นอกหน่วยความจำ — ใช้ Script Properties เหมือนที่เก็บ token)
const fs=require('fs'), vm=require('vm'), path=require('path'), assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..');
function sheet(headers, rows){const grid=[headers.slice(),...(rows||[]).map(r=>r.slice())];return{grid,
 getLastColumn:()=>grid[0].length,getLastRow:()=>grid.length,
 getRange:(r,c,nr,nc)=>({getDisplayValues:()=>{const o=[];for(let i=0;i<(nr||1);i++){const row=[];for(let j=0;j<(nc||1);j++)row.push(String((grid[r-1+i]||[])[c-1+j]??''));o.push(row)}return o},
 getValues:()=>{const o=[];for(let i=0;i<(nr||1);i++){const row=[];for(let j=0;j<(nc||1);j++)row.push((grid[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
 setValue(){return this},setValues(){return this},setBackground(){return this},setFontColor(){return this},
 setFontWeight(){return this},setNumberFormat(){return this},setHorizontalAlignment(){return this}}),
 appendRow:r=>grid.push(r.slice()),deleteRow:r=>grid.splice(r-1,1),insertColumnBefore(){},autoResizeColumns(){},setFrozenRows(){}}}
function gas(store){
  const g={console:{log(){},warn(){},error(){}},Date,JSON,String,Number,Math,Array,Object,isNaN,isFinite,parseInt,parseFloat,
    Logger:{log(){}},Session:{getScriptTimeZone:()=>'Asia/Bangkok'},
    Utilities:{formatDate:()=>'2026-09-06 12:00:00'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType:()=>t})},
    // ← สิ่งเดียวที่ต่างจาก harness ของ Codex: ของจริงมี PropertiesService เสมอ (โค้ดเก็บ token ที่นี่อยู่แล้ว)
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]??null,setProperty:(k,v)=>{store[k]=String(v)},deleteProperty:k=>{delete store[k]}})}};
  vm.createContext(g); vm.runInContext(fs.readFileSync(path.join(root,'google_apps_script.js'),'utf8'),g); return g;
}
const tx = over => ({ id:'TX-AUDIT-0001', date:Date.parse('2026-09-06T12:00:00+07:00'), monthKey:'09-2026',
  subtotal:300, discount:0, total:300, paymentMethod:'cash', services:['Cut'], staffNames:['A'], ...over });

// อ่านทะเบียนยกเลิก/กู้คืนของบิลหนึ่งใบ เป็นค่าแบบเดิม (บวก = ยกเลิกเมื่อ · ลบ = กู้คืนเมื่อ · 0 = ไม่มี)
// ⚠️ ก.ย. 2569 ทะเบียนย้ายจาก property ค่าเดียว (POS_VOIDED_BILLS) ไปเป็นบิลละ property (POSVB_<id>)
// เพื่อไม่ต้องตัดหลักฐานทิ้งตอนใกล้เต็ม 9 KB — เทสต์จึงอ่านผ่านตัวนี้แทนการแกะ JSON ก้อนเดิม
const reg = (store, id) => {
  const raw = store['POSVB_' + id];
  if (!raw) { const legacy = store.POS_VOIDED_BILLS ? JSON.parse(store.POS_VOIDED_BILLS) : {}; return Number(legacy[id]) || 0; }
  const o = JSON.parse(raw); return o.v > o.r ? o.v : (o.r > o.v ? -o.r : 0);
};
const store={};           // Script Properties จำลอง — อยู่ข้ามการรัน เหมือนของจริง
let pass=0, fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};

// ── ลำดับของ D02: บันทึกถูกส่งไปแล้ว → void ไปถึงก่อน → คำขอบันทึกเดิมมาถึงทีหลัง ──
const g1 = gas(store);
const s = sheet(Array.from(g1.BILL_HEADERS));
const ss = { getSheetByName: () => s };
const late = tx();                                   // คำขอที่ค้างอยู่ในเน็ต

// 1) void มาถึงก่อน (คนละ execution กับข้างล่าง — ของจริงเป็นคนละครั้งเสมอ)
const g2 = gas(store);
const v = JSON.parse(g2.handleVoidTransaction({ id: late.id, monthKey:'09-2026', date: late.date }, ss));
t('void ตอบ NOT_FOUND เพราะยังไม่มีแถว (แอปถือว่าลบแล้ว)', () => assert.equal(v.code,'NOT_FOUND'));
t('แต่ต้องลงทะเบียนไว้แล้วว่าบิลนี้ถูกยกเลิก', () => assert.ok(reg(store, late.id) > 0));

// 2) คำขอบันทึกเดิมมาถึงทีหลัง — คนละ execution
const g3 = gas(store);
const r = JSON.parse(g3.handleTransaction(late, ss));
t('คำขอบันทึกที่มาถึงทีหลังถูกปฏิเสธ', () => { assert.equal(r.status,'error'); assert.equal(r.code,'ALREADY_VOIDED'); });
t('*** ชีตต้องไม่มีบิลผี ***', () => assert.equal(s.grid.length - 1, 0));

// 3) คืนบิลโดยตั้งใจ (กู้ข้อมูล) ต้องยังทำได้ — แต่ต้องพิสูจน์ได้ว่าเจตนาเกิด "หลัง" การยกเลิก
// ⚠️ ธง allowVoidedRestore เปล่า ๆ ไม่พออีกต่อไป (E-F01): ธงนั้นติดกับบิลถาวรฝั่งแอป
// คำขอเก่าที่ค้างในเน็ตตั้งแต่ก่อน void ก็พกธงมาด้วย ปลายทางจึงต้องเทียบเวลาเอง
const voidedAtStored = reg(store, late.id);
const gStale = gas(store);
const rStale = JSON.parse(gStale.handleTransaction({ ...late, allowVoidedRestore: true, restoredAt: voidedAtStored - 1000 }, ss));
t('ธงคืนบิลที่เก่ากว่าเวลายกเลิก ต้องถูกปฏิเสธ', () => { assert.equal(rStale.code,'ALREADY_VOIDED'); assert.equal(s.grid.length-1, 0); });

const g4 = gas(store);
const r2 = JSON.parse(g4.handleTransaction({ ...late, allowVoidedRestore: true, restoredAt: voidedAtStored + 1000 }, ss));
t('กู้ข้อมูลคืนบิลโดยตั้งใจ (restoredAt ใหม่กว่า) ยังทำได้', () => { assert.equal(r2.status,'success'); assert.equal(s.grid.length-1, 1); });
// ชุด FG: ไม่ "ลบทะเบียนทิ้ง" อีกต่อไป แต่บันทึกว่ากู้คืนเมื่อไหร่ (ค่าติดลบ)
// เพราะการลบทิ้งทำให้คำสั่งยกเลิกเก่าที่มาถึงทีหลังลบบิลที่เพิ่งกู้ได้
t('คืนบิลสำเร็จแล้วทะเบียนต้องบันทึกว่า "กู้คืน" ไม่ใช่ค้างสถานะยกเลิก', () =>
  assert.ok(reg(store, late.id) < 0));
t('สิ่งที่ต้องเป็นจริง: แก้บิลใบนี้ครั้งถัดไป (ไม่มี restoredAt) ต้องไม่ค้าง', () => {
  const r4 = JSON.parse(gas(store).handleTransaction({ ...late, total: 350, subtotal: 350 }, ss));
  assert.equal(r4.status, 'success');
  assert.equal(s.grid.length - 1, 1);
});

// 4) บิลอื่นต้องไม่โดนหางเลข
const g5 = gas(store);
const r3 = JSON.parse(g5.handleTransaction(tx({ id:'TX-AUDIT-0002' }), ss));
t('บิลใบอื่นบันทึกได้ตามปกติ', () => assert.equal(r3.status,'success'));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
