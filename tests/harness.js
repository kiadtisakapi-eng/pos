const fs=require('fs'), vm=require('vm');
const SRC=require('path').join(__dirname,'..','app.js');

function makeEl(id){
  const el={ id, style:{cssText:'',display:''}, dataset:{}, children:[], value:'', innerHTML:'', innerText:'', textContent:'',
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
    setAttribute(){}, getAttribute(){return null}, appendChild(c){this.children.push(c); return c},
    reset(){}, submit(){},
    addEventListener(){}, removeEventListener(){}, remove(){}, click(){},
    querySelectorAll(){return []}, querySelector(){return null}, closest(){return null},
    scrollIntoView(){}, focus(){}, getContext(){return null} };
  return el;
}
const els={};
const document={
  _els:els,
  getElementById(id){ if(!els[id]) els[id]=makeEl(id); return els[id]; },
  createElement(t){ return makeEl('created-'+t); },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  addEventListener(){}, body:makeEl('body'), head:makeEl('head'), documentElement:makeEl('html'),
  readyState:'complete'
};
// Dexie stub — เก็บใน memory
// ⚠️ ตัวจำลองนี้ "ไม่ใช่" IndexedDB: ไม่มี transaction จริง ไม่มีคำขอที่ล้มกลางทาง
// ใช้ได้กับเทสต์ตรรกะทั่วไปเท่านั้น — เรื่อง atomic/rollback/เขียนซ้อน ต้องพิสูจน์ใน
// tests/test_db_*.js ที่ใช้ Dexie ตัวจริงบน IndexedDB ที่ทำงานจริง (harness_db.js)
// ที่ปรับให้ใกล้ของจริงขึ้น (ก.ย. 2569):
//   · คัดลอกค่าทุกครั้งที่เขียน/อ่าน (structured clone) — เดิมเก็บ "อ็อบเจกต์ตัวเดียวกับในหน่วยความจำ"
//     เทสต์จึงเห็นค่าที่แก้ทีหลังโผล่ในฐานข้อมูลเอง ทั้งที่ของจริงไม่มีทางเป็นแบบนั้น
//   · transaction(): ถ้าฟังก์ชันข้างในโยน error ให้คืนสภาพตารางทั้งก้อน (ตามสัญญาของ IndexedDB)
const clone=(v)=>v===undefined?undefined:structuredClone(v);
class Table{ constructor(){ this.m=new Map(); }
  async get(k){ return clone(this.m.get(k)); }
  async bulkGet(keys){ return keys.map(k=>clone(this.m.get(k))); }
  async bulkPut(rows){ const c=rows.map(clone); c.forEach(r=>this.m.set(r.key,r)); }
  async put(r){ this.m.set(r.key,clone(r)); }
  async delete(k){ this.m.delete(k); }
  async clear(){ this.m.clear(); }
  async toArray(){ return [...this.m.values()].map(clone); } }
function Dexie(){ this.state=new Table(); this.version=()=>({stores:()=>({upgrade:()=>{}})}); this.open=async()=>{}; }
Dexie.prototype.version=function(){ return { stores:()=>({ upgrade:()=>{} }) }; };
Dexie.prototype.transaction=async function(mode, table, fn){
  const snap=new Map(this.state.m);
  try { return await fn(); }
  catch(e){ this.state.m=snap; throw e; }
};

const storage={};
const localStorage={ getItem:k=>k in storage?storage[k]:null, setItem:(k,v)=>{storage[k]=String(v)}, removeItem:k=>{delete storage[k]}, clear:()=>{for(const k in storage) delete storage[k]} };

const ctx={
  console, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
  document, localStorage, Dexie,
  navigator:{ serviceWorker:undefined, vibrate(){}, onLine:true, userAgent:'node' },
  location:{ href:'https://example.com/', reload(){} },
  crypto:require('crypto').webcrypto,
  TextEncoder, TextDecoder, AbortController, URL, Blob:class{}, FileReader:class{},
  fetch:async()=>{ throw new Error('fetch not stubbed'); },
  alert(){}, confirm(){return true}, prompt(){return null},
  requestAnimationFrame:(f)=>setTimeout(f,0),
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true},
};
ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC,'utf8'), ctx, {filename:'app.js'});
module.exports={ctx, els, document};
