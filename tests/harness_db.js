// ─────────────────────────────────────────────────────────────────────────────
//  ชุดทดสอบ "ฐานข้อมูลจริง" — โหลด app.js ด้วย Dexie ตัวจริงของแอป (dexie.min.js)
//  บน IndexedDB แบบทำงานจริงในหน่วยความจำ (fake-indexeddb — มี transaction,
//  commit/abort, structured clone ครบตามสเปก)
//
//  ต่างจาก harness.js เดิมอย่างไร:
//    · harness.js ใช้ Dexie ปลอมที่เก็บอ็อบเจกต์ "ตัวเดียวกับในหน่วยความจำ" (ไม่คัดลอก)
//      และไม่มี transaction เลย — จึงพิสูจน์เรื่อง atomic/rollback/เขียนครึ่งเดียวไม่ได้
//    · harness.js ให้ app ตัวเดียวทั้งไฟล์ — stub ของเทสต์ข้างบนรั่วไปเทสต์ข้างล่าง
//    · ที่นี่ createEnv() สร้าง "เครื่องใหม่" ทุกครั้ง (context + DOM + ฐานข้อมูลของตัวเอง)
//      และส่ง factory ตัวเดียวกันให้สองตัวได้ = จำลองสองหน้าต่างบนเครื่องเดียว
//
//  ข้อจำกัดที่ต้องรู้: fake-indexeddb ไม่จำลองโควตาเต็ม/เบราว์เซอร์ฆ่าแท็บ
//  เคสพวกนั้นจำลองด้วยการทำให้ put() ของคีย์ที่เลือกล้มเหลวจริงระหว่าง transaction
//  (ไม่ได้ stub ฟังก์ชันของแอป — ความล้มเหลวเกิดที่ชั้นฐานข้อมูลเหมือนของจริง)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), vm = require('vm'), path = require('path');
const fidb = require('./vendor/fake-indexeddb.cjs');

const ROOT = path.join(__dirname, '..');
// POS_APP_SRC = ชี้ไป app.js รุ่นอื่น (ใช้พิสูจน์ว่าเทสต์ใหม่ "ตก" กับโค้ดก่อนแก้)
const APP_SRC = fs.readFileSync(process.env.POS_APP_SRC || path.join(ROOT, 'app.js'), 'utf8');
const DEXIE_SRC = fs.readFileSync(path.join(ROOT, 'dexie.min.js'), 'utf8');

function makeEl(id, extra) {
  const el = { id, style: { cssText: '', display: '' }, dataset: {}, children: [], value: '', innerHTML: '',
    innerText: '', textContent: '', type: 'text', checked: false, disabled: false, placeholder: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); } },
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; }, reset() {}, submit() {},
    addEventListener() {}, removeEventListener() {}, remove() { this._removed = true; }, click() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    scrollIntoView() {}, focus() {}, select() {}, getContext() { return null; } };
  return Object.assign(el, extra || {});
}

// ห้องทดลอง 1 ห้อง = เครื่อง 1 หน้าต่าง
// opts.factory  — IDBFactory ที่ใช้ร่วมกันได้ (สองหน้าต่างบนเครื่องเดียว = factory เดียวกัน)
// opts.storage  — localStorage ที่ใช้ร่วมกันได้ (origin เดียวกัน)
// opts.fetch    — ฟังก์ชัน fetch ของเทสต์ (ไม่ส่ง = โยน error ถ้ามีใครเรียก)
// opts.locks    — navigator.locks จำลอง (ไม่ส่ง = เบราว์เซอร์ไม่รองรับ Web Locks)
// opts.onLine   — สถานะเน็ต
function createEnv(opts) {
  opts = opts || {};
  const factory = opts.factory || new fidb.IDBFactory();
  const els = {};
  const storage = opts.storage || {};
  const document = {
    _els: els,
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement(t) { return makeEl('created-' + t); },
    querySelector() { return null; },
    querySelectorAll(sel) { return (opts.querySelectorAll && opts.querySelectorAll(sel)) || []; },
    addEventListener() {}, removeEventListener() {},
    body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
    readyState: 'complete', hidden: false
  };
  const localStorage = {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
    clear: () => { for (const k in storage) delete storage[k]; }
  };
  const timers = new Set();
  const intervals = new Set();
  const ctx = {
    console: opts.console || { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: (f, ms, ...a) => { const t = setTimeout(() => { timers.delete(t); f(...a); }, ms); timers.add(t); return t; },
    clearTimeout: (t) => { timers.delete(t); clearTimeout(t); },
    setInterval: (f, ms, ...a) => { const t = setInterval(f, ms, ...a); intervals.add(t); return t; },
    clearInterval: (t) => { intervals.delete(t); clearInterval(t); },
    queueMicrotask, structuredClone,
    document, localStorage,
    indexedDB: factory, IDBKeyRange: fidb.IDBKeyRange,
    // ไม่มีคีย์ serviceWorker เลย (ไม่ใช่ undefined) — แอปเช็คด้วย 'serviceWorker' in navigator
    navigator: { vibrate() {}, onLine: opts.onLine !== false, userAgent: 'node',
                 locks: opts.locks, storage: undefined },
    location: { href: 'https://example.com/', reload() {} },
    crypto: require('crypto').webcrypto,
    TextEncoder, TextDecoder, AbortController, URL,
    Blob: class { constructor(parts) { this.parts = parts; } }, FileReader: class {},
    fetch: opts.fetch || (async () => { throw new Error('fetch not stubbed'); }),
    alert() {}, confirm() { return true; }, prompt() { return null; },
    requestAnimationFrame: (f) => ctx.setTimeout(f, 0),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(DEXIE_SRC, ctx, { filename: 'dexie.min.js' });
  vm.runInContext(APP_SRC, ctx, { filename: 'app.js' });
  const app = ctx.app;
  const db = vm.runInContext('db', ctx);
  const env = {
    ctx, app, db, els, document, factory, storage,
    // อ่านค่าดิบจากฐานข้อมูลตรง ๆ (ไม่ผ่านแอป) — ใช้ยืนยันว่า "ลงเครื่องจริง" หรือไม่
    async raw(key) { const r = await db.state.get(key); return r ? r.value : undefined; },
    async rawAll() { const rows = await db.state.toArray(); const o = {}; rows.forEach(r => { o[r.key] = r.value; }); return o; },
    dispose() {
      try { if (app.timerInterval) clearInterval(app.timerInterval); } catch (e) {}
      try { if (app._idleInterval) clearInterval(app._idleInterval); } catch (e) {}
      intervals.forEach(t => clearInterval(t)); intervals.clear();
      timers.forEach(t => clearTimeout(t)); timers.clear();
      try { db.close(); } catch (e) {}
    }
  };
  return env;
}

// ทำให้ put() ของคีย์ที่เลือกล้มเหลว "ระหว่าง transaction" ที่ชั้น IndexedDB
// เหมือนของจริงตอนค่าบางค่าเขียนไม่ผ่าน / ดิสก์เต็มกลางทาง — ไม่ได้แตะโค้ดของแอปเลย
//   mode 'async' (ค่าตั้งต้น) = คำขอเขียนของคีย์นั้น "ล้มทีหลัง" แบบ request error จริง
//       (ใช้ add() กับคีย์ที่มีอยู่แล้ว → ConstraintError แบบ async ตามสเปก IndexedDB)
//       เป็นแบบเดียวกับที่ Dexie กลืนไว้แล้วปล่อยคำขออื่นใน transaction เดียวกัน commit ต่อ
//       ถ้าไม่ได้ครอบด้วย transaction ที่ผู้เรียกคุมเอง — ต้องมีคีย์นั้นอยู่ในฐานข้อมูลก่อน
//   mode 'sync' = put() โยน error ทันที (เช่น DataCloneError)
// คืนฟังก์ชันสำหรับถอดการจำลองออก
function failPutForKeys(keys, mode, message) {
  const store = fidb.IDBObjectStore.prototype;
  const orig = store.put;
  const set = new Set(keys);
  store.put = function (value, key) {
    if (value && set.has(value.key)) {
      if (mode === 'sync') {
        const e = new Error(message || ('จำลองเขียนไม่สำเร็จ: ' + value.key));
        e.name = 'DataError';
        throw e;
      }
      return this.add(value, key);   // คีย์มีอยู่แล้ว -> ConstraintError แบบ async
    }
    return orig.apply(this, arguments);
  };
  return () => { store.put = orig; };
}

// ตัวทดสอบแบบ async ที่ "รอผลจริง" — กันกับดักเดิมที่ t() เป็น sync แล้วผ่านเองทันที
function makeRunner(title) {
  let pass = 0, fail = 0;
  const failures = [];
  const t = async (name, fn) => {
    try { await fn(); pass++; console.log('  PASS', name); }
    catch (e) { fail++; failures.push(name); console.log('  FAIL', name, '->', e && e.message); }
  };
  const done = () => {
    console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
    process.exit(fail ? 1 : 0);
  };
  if (title) console.log('\n' + title);
  return { t, done, get pass() { return pass; }, get fail() { return fail; } };
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

module.exports = { createEnv, failPutForKeys, makeRunner, eq, ok, fidb, makeEl };
