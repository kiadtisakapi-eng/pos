// ทดสอบกลไก "อัปเวอร์ชัน" ของแอป: Service Worker install / activate / message
const path=require('path'), fs=require('fs'), vm=require('vm');
let pass=0,fail=0;
const t=(n,f)=>{const r=()=>{pass++;console.log('  PASS',n)},b=e=>{fail++;console.log('  FAIL',n,'->',e.message)};
  try{const x=f(); return x&&x.then?x.then(r,b):(r(),null)}catch(e){b(e)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m||'expected truthy')};

function loadSW(opts){
  opts=opts||{};
  const caches={_store:{}, _opened:[],
    open:async(n)=>{caches._opened.push(n); const box=caches._store[n]=caches._store[n]||{};
      return { put:async(k,v)=>{box[String(k)]=v}, add:async(k)=>{box[String(k)]='added'},
               addAll:async(ks)=>{ks.forEach(k=>box[String(k)]='added')}, match:async(k)=>box[String(k)] };},
    keys:async()=>Object.keys(caches._store),
    delete:async(n)=>{delete caches._store[n]; caches._deleted=(caches._deleted||[]).concat(n); return true},
    match:async(req)=>opts.cacheHit? 'CACHED:'+String(req):undefined };
  const fetched=[];
  const g={console,Promise,Object,Array,String,Number,Date,Error,setTimeout,
    caches, fetched,
    Request:class{constructor(u,o){this.url=String(u);this.cache=(o||{}).cache;this.method=(o||{}).method||'GET'}
      toString(){return this.url}},
    Response:class{constructor(b,i){this.body=b;Object.assign(this,i||{})}},
    fetch:async(req)=>{ const url=String(req&&req.url||req); fetched.push({url,cache:req&&req.cache});
      if((opts.fail||[]).includes(url)) throw new Error('404 '+url);
      return { status:200, type:'basic', ok:true, clone(){return this} }; },
  };
  const listeners={};
  g.self={ addEventListener:(k,fn)=>{(listeners[k]=listeners[k]||[]).push(fn)},
    skipWaiting:()=>{g.self._skipped=true}, clients:{claim:()=>{g.self._claimed=true}} };
  g.self.addEventListener=g.self.addEventListener;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8'),g,{filename:'sw.js'});
  const fire=(k,ev)=>{const out=[];(listeners[k]||[]).forEach(fn=>fn(ev));return out};
  return {g,caches,fetched,listeners,fire};
}
const SW_SRC=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const CACHE_NAME=SW_SRC.match(/CACHE_NAME\s*=\s*'([^']+)'/)[1];

const mkEvent=()=>{const e={_waits:[],waitUntil(p){e._waits.push(p)},respondWith(p){e._resp=p}};return e};

(async()=>{
console.log('\n--- ติดตั้ง SW ใหม่ (install) ---');
{
  const sw=loadSW(); const e=mkEvent();
  sw.listeners.install[0](e); await Promise.all(sw._waits||e._waits);
  t('ดึงไฟล์ด้วย cache:"reload" ทุกไฟล์ (ห้ามหยิบของเก่าจาก HTTP cache)',()=>{
    ok(sw.fetched.length>=7,'ดึงไฟล์แค่ '+sw.fetched.length+' ไฟล์');
    sw.fetched.forEach(f=>eq(f.cache,'reload',f.url));
  });
  t('แคชไฟล์หลักครบ (index.html / app.js / style / dexie / promptpay / manifest)',()=>{
    const box=sw.caches._store[Object.keys(sw.caches._store)[0]];
    ['./index.html','./app.js','./style_v2.css','./dexie.min.js','./promptpay-qr.js','./manifest.json']
      .forEach(k=>ok(k in box,'ขาด '+k));
  });
}

console.log('\n--- ไฟล์หลักโหลดไม่ได้ ---');
{
  const sw=loadSW({fail:['./app.js']}); const e=mkEvent();
  sw.listeners.install[0](e);
  let rejected=false;
  await Promise.all(e._waits).catch(()=>{rejected=true});
  t('ต้องล้มการติดตั้ง ไม่ปล่อย SW ครึ่ง ๆ กลาง ๆ ไปแทนตัวเก่า',()=>ok(rejected));
}

console.log('\n--- ไฟล์เสริม (ไอคอน) โหลดไม่ได้ ---');
{
  const sw=loadSW({fail:['./apple-touch-icon.png']}); const e=mkEvent();
  sw.listeners.install[0](e);
  let rejected=false;
  await Promise.all(e._waits).catch(()=>{rejected=true});
  t('ติดตั้งผ่านได้ ไม่ล้มทั้งยวงเพราะไอคอน',()=>ok(!rejected));
}

console.log('\n--- เปลี่ยนเวอร์ชัน (activate) ---');
{
  const sw=loadSW();
  sw.caches._store['jahn-pos-v45-old']={}; sw.caches._store['jahn-pos-v46-audit-fixes']={};
  sw.caches._store[CACHE_NAME]={};
  const e=mkEvent(); sw.listeners.activate[0](e); await Promise.all(e._waits);
  t('ลบแคชเวอร์ชันเก่าทิ้งหมด',()=>{
    eq(sw.caches._deleted.sort(),['jahn-pos-v45-old','jahn-pos-v46-audit-fixes']);});
  t('เก็บแคชเวอร์ชันปัจจุบันไว้',()=>ok(CACHE_NAME in sw.caches._store));
  t('เข้าควบคุมแท็บที่เปิดอยู่ทันที (clients.claim)',()=>ok(sw.g.self._claimed));
}

console.log('\n--- ปุ่ม "อัปเดตเลย" ---');
{
  const sw=loadSW();
  sw.listeners.message[0]({data:{type:'SKIP_WAITING'}});
  t('สั่ง skipWaiting -> SW ใหม่เริ่มทำงาน',()=>ok(sw.g.self._skipped));
}
{
  const sw=loadSW();
  sw.listeners.message[0]({data:{type:'ขยะ'}});
  t('ข้อความแปลกปลอมไม่ทำให้ SW สลับเวอร์ชันเอง',()=>ok(!sw.g.self._skipped));
  sw.listeners.message[0]({data:null});
  t('data ว่าง ไม่พัง',()=>ok(true));
}

console.log('\n--- ถามเวอร์ชันแคชจาก SW ---');
{
  const sw=loadSW(); let got=null;
  sw.listeners.message[0]({data:{type:'GET_VERSION'},ports:[{postMessage:m=>{got=m}}]});
  t('ตอบชื่อแคชกลับมาให้หน้าแอปโชว์ได้',()=>eq(got,{cacheName:CACHE_NAME}));
  t('ชื่อแคชเข้ารูปแบบที่ deploy.ps1 บวกเลขได้',()=>ok(/^jahn-pos-v\d+/.test(CACHE_NAME),'got '+CACHE_NAME));
}

console.log('\n--- การเสิร์ฟไฟล์ (fetch) ---');
{
  const sw=loadSW({cacheHit:true}); const e=mkEvent();
  sw.listeners.fetch[0](Object.assign(e,{request:{method:'POST',url:'https://script.google.com/x'}}));
  t('คำสั่ง POST ขึ้นคลาวด์ไม่ถูกดักแคช',()=>ok(!e._resp));
}
{
  const sw=loadSW({cacheHit:true}); const e=mkEvent();
  sw.listeners.fetch[0](Object.assign(e,{request:{method:'GET',url:'./app.js'}}));
  const r=await e._resp;
  t('ไฟล์ที่มีในแคช เสิร์ฟจากแคช (ใช้ออฟไลน์ได้)',()=>ok(String(r).startsWith('CACHED:')));
}

console.log('\n--- deploy.ps1 บวกเลขเวอร์ชันให้เองไหม ---');
{
  const ps=fs.readFileSync(path.join(__dirname,'..','deploy.ps1'),'utf8');
  t('deploy.ps1 มีขั้นตอน bump เวอร์ชัน',()=>ok(/jahn-pos-v/.test(ps)));
  const cur=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  const m=cur.match(/jahn-pos-v(\d+)/);
  t('ชื่อแคชปัจจุบันเข้ารูปแบบที่สคริปต์รู้จัก',()=>ok(m,'regex ไม่ match — deploy.ps1 จะข้ามการบวกเลขเงียบ ๆ'));
  t('จำลองการ deploy: v'+m[1]+' -> v'+(+m[1]+1),()=>{
    const suffix=CACHE_NAME.replace(/^jahn-pos-v\d+/,'');
    const next=cur.replace(/jahn-pos-v\d+/g,'jahn-pos-v'+(+m[1]+1));
    ok(next.includes('jahn-pos-v'+(+m[1]+1)+suffix),'ส่วนคำอธิบายท้ายชื่อต้องคงอยู่');
    eq((next.match(/jahn-pos-v/g)||[]).length,(cur.match(/jahn-pos-v/g)||[]).length);
  });
}

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail?1:0);
})();
