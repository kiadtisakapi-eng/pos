// ตรวจการพิมพ์ใบเสร็จ/ใบแจ้งยอด — กฎ CSS ที่ขาดไม่ได้ + เนื้อหาที่ต้องอยู่บนกระดาษ
const fs=require('fs'), path=require('path');
const h=require('./harness.js'); const app=h.ctx.app;
const css=fs.readFileSync(path.join(__dirname,'..','style_v2.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS',n)}catch(e){fail++;console.log('  FAIL',n,'->',e.message)}};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};

const i=css.indexOf('@media print');
ok(i>-1,'ไม่มีบล็อก @media print');
let d=0,j=i; while(true){ if(css[j]==='{')d++; else if(css[j]==='}'){d--; if(d===0){j++;break;}} j++; }
const P=css.slice(i,j);
const PC=P.replace(/\/\*[\s\S]*?\*\//g,''); // ตัดคอมเมนต์ออกก่อนตรวจ (คอมเมนต์อธิบายวิธีเดิมไว้)

console.log('\n--- กฎที่ขาดไม่ได้ ---');
t('ซ่อนตัวแอปด้วย display:none (กันกระดาษเปล่าตามหลัง)',()=>
  ok(/\.app-container\s*\{[^}]*display:\s*none/.test(P)));
t('ไม่ใช้ visibility:hidden แล้ว (วิธีเดิมที่ทำให้ได้กระดาษเปล่า)',()=>
  ok(!/visibility:\s*hidden/.test(PC)));
t('ซ่อนหน้าต่างอื่นทุกอัน',()=>ok(/\.modal-overlay\s*\{[^}]*display:\s*none/.test(P)));
t('ใบเสร็จและใบแจ้งยอดที่เปิดอยู่ถูกแสดง',()=>{
  ok(/#modal-receipt\.active/.test(P),'ไม่พบ modal-receipt');
  ok(/#modal-quote\.active/.test(P),'ไม่พบ modal-quote');});
t('ยกเลิก backdrop-filter ตอนพิมพ์ (ไม่งั้นตัวหนังสืออาจซีด)',()=>
  ok(/backdrop-filter:\s*none/.test(P)));
t('พื้นหลังกระดาษเป็นสีขาว',()=>ok(/background:\s*#fff/i.test(P)));
t('ปลดล็อกความสูงกล่องพรีวิว (บิลยาวไม่โดนตัดท้าย)',()=>{
  ok(/#thermal-receipt-preview/.test(P)); ok(/#quote-preview/.test(P));
  ok(/max-height:\s*none/.test(P));});
t('ซ่อนหัวหน้าต่างและปุ่ม (ไม่ให้ติดไปบนกระดาษ)',()=>{
  ['modal-header','modal-close','modal-footer','btn-print-receipt','btn-print-quote']
    .forEach(c=>ok(P.includes(c),'ไม่ซ่อน '+c));});
t('กำหนดขอบกระดาษเอง ไม่ใช้ค่าเริ่มต้นที่กว้างเกิน',()=>ok(/@page\s*\{[^}]*margin/.test(P)));
t('ตั้งกระดาษเป็นม้วน 80 มม. ความยาวไหลตามเนื้อหา',()=>{
  ok(/@page\s*\{[^}]*size:\s*80mm\s+auto/.test(P),'ไม่ได้ตั้ง size: 80mm auto');
  const m=/@page\s*\{[^}]*margin:\s*(\d+)mm/.exec(P);
  ok(m&&Number(m[1])<=4,'ขอบกว้างเกินไปสำหรับม้วน 80 มม.: '+(m&&m[1]));});
t('เลขที่ใบเสร็จตัดบรรทัดในตัวเอง ไม่ดันข้อความหลุดขอบ',()=>{
  ok(/\.receipt-billid/.test(P),'ไม่มีกฎ .receipt-billid ในบล็อกพิมพ์');
  ok(/word-break:\s*break-all/.test(P));});
t('ตัวหนังสือบนกระดาษ 80 มม. ไม่เล็กกว่า 13px',()=>{
  const m=/\.receipt-container\s*\{[^}]*font-size:\s*(\d+)px/.exec(P);
  ok(m&&Number(m[1])>=13,'font-size = '+(m&&m[1]));});
t('ตัวหนังสือบนกระดาษเป็นสีดำ',()=>ok(/color:\s*#000/i.test(P)));

console.log('\n--- ปุ่มพิมพ์ ---');
t('มีปุ่มพิมพ์ในหน้าต่างใบเสร็จ',()=>ok(/modal-receipt[\s\S]{0,1600}window\.print\(\)/.test(html)));
t('มีปุ่มพิมพ์ในหน้าต่างใบแจ้งยอด',()=>ok(/modal-quote[\s\S]{0,1200}window\.print\(\)/.test(html)));

console.log('\n--- เนื้อหาที่ต้องอยู่บนใบเสร็จ ---');
app.showToast=()=>{}; app.openModal=()=>{};
app.shopName='ร้านทดสอบ'; app.shopPhone='02-000-0000'; app.shopAddress='123 ถนนทดสอบ';
app.state.categories=[{id:'drinks',name:'เครื่องดื่ม',vat:true}];
app.vatEnabled=true; app.vatRate=7;
app.showThermalReceipt({id:'TX-123',date:Date.now(),customerName:'คุณสมชาย',
  details:[{name:'น้ำเปล่า',price:20,staffName:'เอ'}],
  subtotal:20,discount:0,nonVatBase:0,vatableBase:20,vatAmount:1.4,rounding:0.6,vatRate:7,
  total:22,cashReceived:50,cashChange:28,paymentMethod:'cash',staffNames:['เอ']});
const r=h.document._els['thermal-receipt-preview'].innerHTML;
t('เลขที่ใบเสร็จมีคลาสสำหรับตัดบรรทัด',()=>ok(/receipt-billid/.test(r)));
[['ชื่อร้าน','ร้านทดสอบ'],['ที่อยู่','123 ถนนทดสอบ'],['เบอร์โทร','02-000-0000'],
 ['เลขที่ใบเสร็จ','TX-123'],['ชื่อลูกค้า','คุณสมชาย'],['ชื่อรายการ','น้ำเปล่า'],
 ['ผู้ให้บริการ','เอ'],['VAT 7%','VAT 7%'],['ปัดเศษ','ปัดเศษ'],
 ['ยอดรวม','22'],['เงินรับมา','50'],['เงินทอน','28']].forEach(([label,needle])=>{
  t('ใบเสร็จมี '+label,()=>ok(r.includes(needle),'ไม่เจอ "'+needle+'"'));});

console.log('\n--- บิลเก่าที่ไม่มี VAT ---');
app.showThermalReceipt({id:'TX-OLD',date:Date.now(),customerName:'ก',
  services:['ตัดผม'],subtotal:300,discount:0,total:300,staffNames:['เอ'],paymentMethod:'cash'});
const r2=h.document._els['thermal-receipt-preview'].innerHTML;
t('ไม่ขึ้นบรรทัด VAT/ปัดเศษ ในบิลที่ไม่เคยเก็บ VAT',()=>{
  ok(!/VAT/.test(r2)); ok(!/ปัดเศษ/.test(r2));});
t('ยังแสดงยอดรวมได้ปกติ',()=>ok(/฿300/.test(r2)));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
