// ตรวจ 19 ต.ค. 2569 ข้อ 4 + 58 — หน้าต่างหลักหนึ่งเดียว: ล็อกค้างหลังรีโหลด / ระบบล็อกไม่ตอบ / รับสิทธิ์ไม่สำเร็จแต่ถือล็อกค้าง
// ใช้ app.js จริง + IndexedDB จริง (harness_db) + Web Locks จำลองที่มี steal + BroadcastChannel จำลอง
//   ข้อ 4: ปุ่มแดงรอไม่เกิน 3 วิ แล้วโหลดข้อมูลล่าสุด/รับสิทธิ์ · หน้าต่างหลักตอบ ping · ไม่มีใครตอบ = แย่งล็อก (steal)
//          หน้าต่างหลักที่ยังมีชีวิตต้องยังทำให้หน้าต่างที่สองอ่านอย่างเดียวเหมือนเดิม · ไม่มี BroadcastChannel = ไม่แย่ง
//   ข้อ 58: takeOverAsWriter คืน true/false และปล่อยล็อกเมื่อรับสิทธิ์ไม่สำเร็จ
// รัน: TZ=Asia/Bangkok node tests/test_fix_20261020_appA_lock.js
process.env.TZ = 'Asia/Bangkok';
const { createEnv, makeRunner, eq, ok, fidb } = require('./harness_db.js');
const { seed, quiet, loginAs, readyCheckout, settle } = require('./fixtures_db.js');

const R = makeRunner('--- fix 20 ต.ค. 2569 (appA) ข้อ 4 + 58: ล็อกหน้าต่างหลัก ---');
const NO_CLOUD = { googleSheetsUrl: '', googleSheetsApiToken: '' };

// Web Locks จำลอง (exclusive) ที่ใช้ร่วมกันหลายหน้าต่าง — มี ifAvailable / steal / ค้างไม่ตอบ (hang)
function makeLockManager() {
  const held = new Map(), queue = new Map();
  let hang = false;
  function grant(name, req) {
    const entry = { win: req.win, done: false, reject: req.reject };
    const release = () => { if (entry.done) return; entry.done = true; if (held.get(name) === entry) held.delete(name); grantNext(name); };
    held.set(name, entry);
    let r;
    try { r = req.cb({ name, mode: 'exclusive' }); } catch (e) { release(); req.reject(e); return; }
    Promise.resolve(r).then(v => { if (entry.done) return; release(); req.resolve(v); },
      e => { if (entry.done) return; release(); req.reject(e); });
  }
  function grantNext(name) { const q = queue.get(name) || []; while (q.length && !held.has(name)) grant(name, q.shift()); }
  const mgr = {
    setHang(v) { hang = !!v; },
    forWindow(win) {
      return {
        request(name, opts, cb) {
          if (typeof opts === 'function') { cb = opts; opts = {}; }
          opts = opts || {};
          if (hang) return new Promise(() => {});
          return new Promise((resolve, reject) => {
            const req = { win, cb, resolve, reject };
            if (opts.steal) {
              const cur = held.get(name);
              if (cur) {
                cur.done = true; held.delete(name);
                const e = new Error('The lock request was aborted (stolen)'); e.name = 'AbortError';
                cur.reject(e);
              }
              grant(name, req);
              return;
            }
            if (held.has(name)) {
              if (opts.ifAvailable) { Promise.resolve().then(() => cb(null)).then(resolve, reject); return; }
              if (!queue.has(name)) queue.set(name, []);
              queue.get(name).push(req);
              return;
            }
            grant(name, req);
          });
        }
      };
    },
    // ปิดหน้าต่าง/ระบบฆ่าแอป = ปล่อยทุกล็อกของหน้าต่างนั้น
    kill(win) {
      for (const [n, q] of queue) queue.set(n, q.filter(r => r.win !== win));
      for (const [n, h] of [...held]) if (h.win === win) { h.done = true; held.delete(n); grantNext(n); }
    },
    holder(name) { const h = held.get(name || 'jahn-pos-writer'); return h ? h.win : null; }
  };
  return mgr;
}

// BroadcastChannel จำลอง: ส่งถึงช่องชื่อเดียวกันของหน้าต่างอื่น (ไม่ส่งกลับหาตัวเอง) แบบ async
function makeHub() {
  const chans = new Set(); const muted = new Set();
  return {
    mute(win) { muted.add(win); },          // หน้าต่างค้าง/ถูกแช่แข็ง — ไม่ประมวลผลข้อความ
    kill(win) { for (const c of [...chans]) if (c.win === win) c.close(); },
    forWindow(win) {
      return class FakeBroadcastChannel {
        constructor(name) { this.name = String(name); this.win = win; this.onmessage = null; this.closed = false; chans.add(this); }
        postMessage(data) {
          if (this.closed) throw new Error('InvalidStateError: channel closed');
          const msg = structuredClone(data);
          for (const c of chans) {
            if (c === this || c.name !== this.name) continue;
            setTimeout(() => { if (!c.closed && !muted.has(c.win) && typeof c.onmessage === 'function') c.onmessage({ data: structuredClone(msg) }); }, 5);
          }
        }
        close() { this.closed = true; chans.delete(this); }
      };
    }
  };
}

async function boot(factory, locks, hub, win, doSeed) {
  const env = createEnv({ factory, locks });
  if (hub) env.ctx.BroadcastChannel = hub.forWindow(win);
  // แถบแดงจริง: id เหล่านี้มีเฉพาะเมื่อถูก append (harness สร้าง element ให้เองทุก id)
  const LIVE = ['read-only-window-banner', 'read-only-retry-btn'];
  const appended = {};
  const origGet = env.document.getElementById.bind(env.document);
  env.document.getElementById = (id) => LIVE.includes(id) ? (appended[id] && !appended[id]._removed ? appended[id] : null) : origGet(id);
  const origAppend = env.document.body.appendChild.bind(env.document.body);
  env.document.body.appendChild = (c) => {
    if (c && LIVE.includes(c.id)) appended[c.id] = c;
    if (c && c.id === 'read-only-window-banner') appended['read-only-retry-btn'] = { addEventListener() {}, disabled: false, innerText: '' };
    return origAppend(c);
  };
  const toasts = quiet(env.app);
  env.app.renderReadOnlyBanner = Object.getPrototypeOf(env.app).renderReadOnlyBanner.bind(env.app);
  if (doSeed) await seed(env, NO_CLOUD);
  await env.app.init();
  loginAs(env.app, 'staff');
  return { env, app: env.app, toasts, win };
}
async function sell(w, price) {
  readyCheckout(w.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price);
  const r = await w.app.processCheckout();
  await settle(30);
  return r;
}
const bills = async (w) => ((await w.env.raw('transactions')) || []).map(t => t.total);
const bannerText = (w) => { const b = w.env.document.getElementById('read-only-window-banner'); return b && !b._removed ? b.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; };
const raceMs = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('STILL-PENDING'), ms))]);

(async () => {
  await R.t('หน้าต่างหลักยังมีชีวิต: หน้าต่างที่สองยังอ่านอย่างเดียว (ไม่แย่ง) · ปุ่มแดงตอบ false · ปิดหน้าต่างหลักแล้วรับสิทธิ์ต่อได้', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    const A = await boot(factory, mgr.forWindow('A'), hub, 'A', true);
    const B = await boot(factory, mgr.forWindow('B'), hub, 'B', false);
    try {
      eq(!!A.app.isReadOnlyWindow, false); eq(!!B.app.isReadOnlyWindow, true, 'B ต้องอ่านอย่างเดียว');
      await settle(1500);                                   // เลยเวลารอคำตอบ ping ตอนเปิดแอป
      eq(!!B.app.isReadOnlyWindow, true, 'A ตอบ ping แล้ว B ต้องไม่แย่งสิทธิ์');
      eq(mgr.holder(), 'A');
      ok(/ปัดปิดแอปแล้วเปิดใหม่/.test(bannerText(B)), 'แถบแดงต้องบอกทางออก: ' + bannerText(B));
      eq(await sell(B, 500), false, 'B ขายไม่ได้');
      const btn = { disabled: false, innerText: '' };
      eq(await raceMs(B.app.retryWriterFromBanner(btn), 6000), false, 'ปุ่มแดงต้องตอบ false');
      eq(btn.disabled, false, 'ปุ่มกดใหม่ได้'); eq(!!B.app.isReadOnlyWindow, true); eq(mgr.holder(), 'A');
      eq(await sell(A, 300), true);
      mgr.kill('A'); hub.kill('A'); await settle(300);
      eq(!!B.app.isReadOnlyWindow, false, 'A ปิดแล้ว B ต้องรับสิทธิ์'); eq(mgr.holder(), 'B');
      eq(await sell(B, 200), true); eq(await bills(B), [300, 200]);
    } finally { A.env.dispose(); B.env.dispose(); }
  });

  await R.t('S2 ระบบล็อกไม่ตอบเลย: ปุ่มแดงไม่ค้าง "กำลังตรวจสอบ..." — เกิน 3 วิ โหลดข้อมูลล่าสุดแล้วรับสิทธิ์ → ขายได้', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    mgr.setHang(true);
    const A = await boot(factory, mgr.forWindow('A'), hub, 'A', true);
    try {
      eq(!!A.app.isReadOnlyWindow, true, 'เปิดแบบอ่านอย่างเดียวไปก่อน');
      const btn = { disabled: false, innerText: 'x' };
      const t0 = Date.now();
      eq(await raceMs(A.app.retryWriterFromBanner(btn), 8000), true, 'ปุ่มต้องให้ผลภายในเวลา');
      ok(Date.now() - t0 < 6000, 'ต้องไม่รอเกิน ~3 วิ + โหลดข้อมูล');
      eq(!!A.app.isReadOnlyWindow, false);
      eq(await sell(A, 300), true, 'ขายได้');
      eq(await bills(A), [300]);
    } finally { A.env.dispose(); }
  });

  await R.t('S6 รีโหลดแล้วล็อกของหน้าเดิมค้าง (WebKit 283528): หน้าใหม่ไม่มีใครตอบ ping → แย่งล็อกเองตอนเปิด → ขายได้ ข้อมูลครบ', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    const OLD = await boot(factory, mgr.forWindow('old'), hub, 'old', true);
    eq(await sell(OLD, 300), true);
    OLD.env.dispose(); hub.kill('old');                    // เอกสารเดิมหายไปแล้ว แต่ล็อกไม่ถูกปล่อย
    const NEW = await boot(factory, mgr.forWindow('new'), hub, 'new', false);
    try {
      eq(!!NEW.app.isReadOnlyWindow, true, 'ตอนเปิดยังอ่านอย่างเดียว (ล็อกเป็นของหน้าเดิม)');
      await settle(1600);
      eq(!!NEW.app.isReadOnlyWindow, false, 'หน้าใหม่ต้องรับสิทธิ์เองภายใน ~1 วิ');
      eq(mgr.holder(), 'new', 'ล็อกต้องเป็นของหน้าใหม่');
      eq(NEW.app.state.transactions.map(t => t.total), [300], 'ต้องโหลดบิลล่าสุดก่อนรับสิทธิ์');
      eq(await sell(NEW, 200), true);
      eq(await bills(NEW), [300, 200]);
    } finally { NEW.env.dispose(); }
  });

  await R.t('S6 ปุ่มแดง: ถ้ายังอ่านอย่างเดียวอยู่ (กดก่อนตรวจตอนเปิดเสร็จ) ปุ่มก็แย่งล็อกค้างได้ → true', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    const OLD = await boot(factory, mgr.forWindow('old'), hub, 'old', true);
    eq(await sell(OLD, 300), true);
    OLD.env.dispose(); hub.kill('old');
    const NEW = await boot(factory, mgr.forWindow('new'), hub, 'new', false);
    try {
      eq(!!NEW.app.isReadOnlyWindow, true);
      const btn = { disabled: false, innerText: '' };
      const res = await raceMs(NEW.app.retryWriterFromBanner(btn), 6000);
      await settle(1600);
      eq(res === true || !NEW.app.isReadOnlyWindow, true, 'ปุ่มต้องจบที่เขียนได้: ' + res);
      eq(!!NEW.app.isReadOnlyWindow, false); eq(mgr.holder(), 'new');
      eq(await sell(NEW, 200), true); eq(await bills(NEW), [300, 200]);
    } finally { NEW.env.dispose(); }
  });

  await R.t('ไม่มี BroadcastChannel: ไม่แย่งล็อก (ทำแบบเดิม) — ยังอ่านอย่างเดียว ปุ่มบอกให้ปิดหน้าต่างอื่น/ปัดปิดแอป', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager();
    const OLD = await boot(factory, mgr.forWindow('old'), null, 'old', true);
    OLD.env.dispose();
    const NEW = await boot(factory, mgr.forWindow('new'), null, 'new', false);
    try {
      await settle(1500);
      eq(!!NEW.app.isReadOnlyWindow, true); eq(mgr.holder(), 'old');
      const btn = { disabled: false, innerText: '' };
      eq(await raceMs(NEW.app.retryWriterFromBanner(btn), 6000), false);
      eq(btn.disabled, false); eq(mgr.holder(), 'old');
      ok(/ปัดปิดแอป/.test(NEW.toasts.slice(-1).map(t => t.m).join('')), 'toast ต้องบอกทางออก');
    } finally { NEW.env.dispose(); }
  });

  await R.t('หน้าต่างหลักค้าง/ไม่ตอบ ping แล้วถูกแย่ง: หน้าต่างเดิมกลายเป็นอ่านอย่างเดียวทันที · ไม่มีสองหน้าต่างเขียนพร้อมกัน · ด่านรุ่นข้อมูลยังกัน', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    const A = await boot(factory, mgr.forWindow('A'), hub, 'A', true);
    eq(await sell(A, 300), true);
    hub.mute('A');                                         // A ค้าง (ไม่ประมวลผลข้อความ) แต่ยังถือล็อก
    const B = await boot(factory, mgr.forWindow('B'), hub, 'B', false);
    try {
      await settle(1600);
      eq(!!B.app.isReadOnlyWindow, false, 'B แย่งสิทธิ์ได้'); eq(mgr.holder(), 'B');
      eq(!!A.app.isReadOnlyWindow, true, 'A ถูกแย่งล็อกแล้วต้องพักเป็นอ่านอย่างเดียว');
      eq(await sell(B, 200), true);
      eq(await sell(A, 999), false, 'A ขายไม่ได้แล้ว');
      eq(await bills(B), [300, 200], 'บิลของ B ไม่ถูกทับ');
    } finally { A.env.dispose(); B.env.dispose(); }
  });

  await R.t('ข้อ 58: ได้ล็อกแต่รับสิทธิ์ไม่สำเร็จ (อ่านข้อมูลพลาดชั่วคราว) → takeOverAsWriter คืน false และปล่อยล็อก · กดปุ่มแดงแล้วรับสิทธิ์ได้', async () => {
    const factory = new fidb.IDBFactory(); const mgr = makeLockManager(); const hub = makeHub();
    const A = await boot(factory, mgr.forWindow('A'), hub, 'A', true);
    const B = await boot(factory, mgr.forWindow('B'), hub, 'B', false);
    try {
      eq(await sell(A, 300), true);
      await settle(1500);
      const realBulkGet = B.env.db.state.bulkGet.bind(B.env.db.state);
      let fail = 1;
      B.env.db.state.bulkGet = async (...a) => { if (fail-- > 0) throw new Error('synthetic transient read error'); return realBulkGet(...a); };
      mgr.kill('A'); hub.kill('A'); await settle(300);
      eq(!!B.app.isReadOnlyWindow, true, 'รับสิทธิ์ไม่สำเร็จ = ยังอ่านอย่างเดียว');
      eq(mgr.holder(), null, 'ต้องปล่อยล็อกคืน (เดิมถือค้าง)');
      eq(!!B.app._writerLockHeld, false);
      const btn = { disabled: false, innerText: '' };
      eq(await raceMs(B.app.retryWriterFromBanner(btn), 6000), true, 'กดปุ่มแดงแล้วรับสิทธิ์ได้');
      eq(mgr.holder(), 'B'); eq(!!B.app.isReadOnlyWindow, false);
      loginAs(B.app, 'staff');      // ตอนโหลดพลาด แอปให้ออกจากระบบ (ข้อมูลชุดค่าว่างไม่มีบัญชีนี้) — เข้าใหม่แล้วขายต่อ
      eq(await sell(B, 200), true); eq(await bills(B), [300, 200]);
    } finally { A.env.dispose(); B.env.dispose(); }
  });

  await R.t('ข้อ 58: takeOverAsWriter คืน true เมื่อสำเร็จ / false เมื่อโหลดไม่สำเร็จ', async () => {
    const factory = new fidb.IDBFactory();
    const A = await boot(factory, undefined, null, 'A', true);
    try {
      eq(await A.app.takeOverAsWriter(), true);
      const P = Object.getPrototypeOf(A.app);
      A.app.loadState = async function () { this.loadFailed = true; };
      eq(await A.app.takeOverAsWriter(), false);
      A.app.loadState = P.loadState;
    } finally { A.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
