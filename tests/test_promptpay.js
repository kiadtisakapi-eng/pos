// ตรวจ QR พร้อมเพย์ — ถ้าผิด เงินลูกค้าเข้าบัญชีผิดหรือยอดผิด กู้คืนยาก
const fs=require('fs'),vm=require('vm'),path=require('path');
const ctx={console,Math,String,Number,Array,Object,JSON,parseInt,parseFloat,isNaN,
  document:{createElement:()=>({getContext:()=>null,style:{}})}};
ctx.window=ctx; ctx.globalThis=ctx; ctx.self=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','promptpay-qr.js'),'utf8'),ctx,{filename:'pp.js'});
const PP=ctx.PromptPayQR;
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(String(a)!==String(b))throw new Error((m||'')+` expected ${b} got ${a}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

// CRC16-CCITT-FALSE เขียนใหม่แบบอิสระ ไม่ใช้โค้ดของแอป
function crcRef(s){
  let crc=0xFFFF;
  for(let i=0;i<s.length;i++){
    crc^=s.charCodeAt(i)<<8;
    for(let b=0;b<8;b++) crc = (crc&0x8000) ? ((crc<<1)^0x1021)&0xFFFF : (crc<<1)&0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
// แยก TLV
function parseTLV(s){
  const out={}; let i=0;
  while(i<s.length-1){
    const tag=s.substr(i,2), len=parseInt(s.substr(i+2,2),10);
    if(!Number.isFinite(len)) break;
    out[tag]=s.substr(i+4,len); i+=4+len;
  }
  return out;
}

console.log('\n--- โครงสร้าง payload ---');
const p=PP.buildPayload('0812345678', 386);
const f=parseTLV(p);
t('มี Payload Format Indicator = 01',()=>eq(f['00'],'01'));
t('เป็น QR ใช้ครั้งเดียว (12) เพราะฝังยอดเงิน',()=>eq(f['01'],'12'));
t('สกุลเงินบาท (764)',()=>eq(f['53'],'764'));
t('ประเทศไทย (TH)',()=>eq(f['58'],'TH'));
t('ยอดเงิน 386 ส่งเป็น 386.00',()=>eq(f['54'],'386.00'));

console.log('\n--- เบอร์โทรถูกแปลงเป็นรูปแบบสากล ---');
const acct=parseTLV(f['29']);
t('AID พร้อมเพย์ถูกต้อง',()=>eq(acct['00'],'A000000677010111'));
t('0812345678 -> 0066812345678 (ตัด 0 หน้า เติม 0066)',()=>eq(acct['01'],'0066812345678'));

console.log('\n--- เลขบัตรประชาชน 13 หลัก ---');
const p13=PP.buildPayload('1234567890123', 100);
const a13=parseTLV(parseTLV(p13)['29']);
t('เลข 13 หลักลง tag 02 ไม่ใช่ tag 01',()=>{ok(a13['02']==='1234567890123','got '+JSON.stringify(a13));});

console.log('\n--- CRC ---');
t('CRC ท้าย payload ตรงกับที่คำนวณอิสระ',()=>{
  const body=p.slice(0,-4), given=p.slice(-4);
  eq(given, crcRef(body));});
t('crc16 ของไลบรารีตรงกับสูตรมาตรฐาน',()=>{
  ['','123456789','ABC','00020101021229'].forEach(s=>eq(PP.crc16(s),crcRef(s),'input='+s));});
t('ค่ามาตรฐาน CRC16-CCITT-FALSE ของ "123456789" = 29B1',()=>eq(crcRef('123456789'),'29B1'));

console.log('\n--- ยอดเงินรูปแบบต่าง ๆ ---');
[[20,'20.00'],[386,'386.00'],[1234.5,'1234.50'],[0.07,'0.07'],[100000,'100000.00']].forEach(([amt,exp])=>{
  t(`ยอด ${amt} -> "${exp}"`,()=>eq(parseTLV(PP.buildPayload('0812345678',amt))['54'],exp));
});

console.log('\n--- ความยาว TLV ต้องตรงกับเนื้อจริงทุกช่อง ---');
t('ทุก tag ประกาศความยาวถูกต้อง (ธนาคารอ่านไม่ออกถ้าผิด)',()=>{
  let i=0,n=0;
  while(i<p.length-1){
    const len=parseInt(p.substr(i+2,2),10);
    ok(Number.isFinite(len)&&len>0,'ความยาวเพี้ยนที่ตำแหน่ง '+i);
    i+=4+len; n++;
  }
  eq(i,p.length,'ความยาวรวมไม่ลงตัวพอดี');
  ok(n>=6,'มี tag น้อยเกินไป: '+n);
});

console.log('\n--- ยอดที่ปัดขึ้นแล้วต้องเข้า QR ตรง ๆ ---');
t('บิล VAT 22 บาท -> QR ฝัง 22.00 ไม่ใช่ 21.40',()=>
  eq(parseTLV(PP.buildPayload('0812345678',22))['54'],'22.00'));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
