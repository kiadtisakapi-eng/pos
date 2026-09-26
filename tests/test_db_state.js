// ─────────────────────────────────────────────────────────────────────────────
//  ชั้นเก็บข้อมูลบนฐานข้อมูลจริง (Dexie ของแอป + IndexedDB ที่มี transaction จริง)
//  ข้อ 1: loadState ต้องโหลดค่าตั้งค่าครบก่อนซ่อม/บันทึก
//  ข้อ 2: saveState ต้อง atomic + งานบันทึกต้องไม่ทำงานซ้อนจน rollback ทับงานอื่น
//  ข้อ 3: processCheckout ต้องตรวจเงื่อนไขในตัวเอง + กันเรียกซ้อน
//
//  ทุกเทสต์สร้าง "เครื่องใหม่" ของตัวเอง (createEnv) — ไม่มี stub รั่วข้ามเทสต์
//  และตรวจผลจาก "ของที่ลงฐานข้อมูลจริง" (env.raw) ไม่ใช่แค่ในหน่วยความจำ
// ─────────────────────────────────────────────────────────────────────────────
const { createEnv, failPutForKeys, makeRunner, eq, ok } = require('./harness_db.js');
const R = makeRunner('--- ชั้นเก็บข้อมูล (ฐานข้อมูลจริง) ---');
const t = R.t;

const HASH_123456 = null; // คำนวณจริงจากแอปด้านล่าง

// เตรียมเครื่องที่มีข้อมูลร้านครบ (เหมือน iPad ที่ใช้งานมาแล้ว)
async function seed(env, extra) {
  const pinHash = await env.app.hashPin('246810');
  const rows = Object.assign({
    db_migrated: true,
    services: [{ id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }],
    categories: [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }],
    staff: [{ id: 'st-1', name: 'เอ', role: 'ช่าง', accessLevel: 'staff', pin: await env.app.hashPin('111111') }],
    customers: [], queue: [], transactions: [], voidLog: [], expenseLog: [], editLog: [], cloudOutbox: [],
    shift: { active: true, startTime: Date.now() - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] },
    shopPromptPayId: '0812345678', shopName: 'ร้านจริง', shopTagline: 'TAG', shopAddress: 'ที่อยู่', shopPhone: '021234567',
    shopLogo: '', theme: 'light', ownerPin: pinHash,
    googleSheetsUrl: 'https://script.google.com/macros/s/REAL/exec',
    googleSheetsApiToken: 'T'.repeat(40),
    telegramToken: '123:ABC', telegramChatId: '-100999',
    vatEnabled: true, vatRate: 7
  }, extra || {});
  await env.db.state.bulkPut(Object.keys(rows).map(k => ({ key: k, value: rows[k] })));
  return rows;
}

const SETTINGS_KEYS = ['shopPromptPayId', 'shopName', 'shopTagline', 'shopAddress', 'shopPhone', 'theme',
  'googleSheetsUrl', 'googleSheetsApiToken', 'telegramToken', 'telegramChatId', 'vatEnabled', 'vatRate', 'ownerPin'];

function quiet(app) {
  const toasts = [];
  app.showToast = (m, ty) => toasts.push({ m: String(m), ty });
  ['renderAll', 'renderEveryScreen', 'renderDashboard', 'renderPos', 'renderQueueScreen', 'renderCustomerTable',
   'renderReports', 'renderSettingsLists', 'filterReports', 'renderCart', 'updateCartTotals', 'showThermalReceipt',
   'vibrateDevice', 'openModal', 'closeModal', 'updateUserRoleUI', 'applyShopName', 'applyTheme',
   'renderLoginOptions', 'checkSyncStatus', 'updateSyncBadgeStatus', 'renderReadOnlyBanner'].forEach(k => { app[k] = () => {}; });
  return toasts;
}

(async () => {

// ═══════════════════════════════════════════════════════════════════════════
// ข้อ 1 — loadState ต้องไม่เขียนค่าตั้งค่าทับด้วยค่าเริ่มต้น
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] ซ่อม ID ซ้ำตอนเปิดแอป — ค่าตั้งค่าต้องไม่ถูกเขียนทับ');
{
  const env = createEnv(); quiet(env.app);
  const rows = await seed(env, { staff: [
    { id: 'st1', name: 'เอ', accessLevel: 'staff', pin: null },
    { id: 'st1', name: 'บี', accessLevel: 'staff', pin: null } ] });   // ID ซ้ำ -> ต้องซ่อม
  await env.app.init();   // เส้นทางเปิดแอปจริง: รอสิทธิ์เขียน → โหลดครบ → ซ่อม → บันทึก
  const raw = await env.rawAll();
  await t('ID ซ้ำถูกซ่อมและบันทึกแล้ว', () => { const ids = raw.staff.map(s => s.id); ok(new Set(ids).size === 2, JSON.stringify(ids)); });
  for (const k of SETTINGS_KEYS) {
    await t(`ค่าตั้งค่า "${k}" ในเครื่องยังเป็นค่าเดิม`, () => eq(raw[k], rows[k]));
  }
  await t('สวิตช์ VAT ในหน่วยความจำยังเปิดอยู่ (เดิมอ่านกลับได้ false)', () => eq(env.app.vatEnabled, true));
  env.dispose();
}

console.log('\n[1b] ย้าย PIN เจ้าของแบบเก่า (ตัวเลข 6 หลัก) — ค่าตั้งค่าต้องไม่หาย');
{
  const env = createEnv(); quiet(env.app);
  const rows = await seed(env, { ownerPin: '246810' });
  await env.app.init();
  const raw = await env.rawAll();
  await t('PIN ถูกแปลงเป็น hash แล้ว', () => ok(/^[a-f0-9]{64}$/.test(raw.ownerPin), raw.ownerPin));
  for (const k of ['googleSheetsUrl', 'googleSheetsApiToken', 'telegramToken', 'telegramChatId', 'vatEnabled', 'vatRate']) {
    await t(`"${k}" ยังเป็นค่าเดิมหลังย้าย PIN`, () => eq(raw[k], rows[k]));
  }
  await t('สวิตช์ VAT ในหน่วยความจำยังเปิดอยู่', () => eq(env.app.vatEnabled, true));
  env.dispose();
}

console.log('\n[1c] หน้าต่างรองรับสิทธิ์เป็นหน้าต่างหลัก — ซ่อมแล้วต้องบันทึกได้ และไม่เตือนว่า "หน้าต่างซ้ำ"');
{
  const env = createEnv(); const toasts = quiet(env.app);
  const rows = await seed(env, { staff: [
    { id: 'st1', name: 'เอ', accessLevel: 'staff', pin: null },
    { id: 'st1', name: 'บี', accessLevel: 'staff', pin: null } ] });
  env.app.isReadOnlyWindow = true;          // ตอนเปิดยังเป็นหน้าต่างรอง
  await env.app.takeOverAsWriter();         // หน้าต่างหลักปิดไป -> รับสิทธิ์
  const raw = await env.rawAll();
  await t('รับสิทธิ์แล้ว เขียนได้', () => eq(env.app.isReadOnlyWindow, false));
  await t('ID ซ้ำถูกซ่อมลงเครื่องหลังรับสิทธิ์', () => { const ids = raw.staff.map(s => s.id); ok(new Set(ids).size === 2, JSON.stringify(ids)); });
  await t('ค่าตั้งค่ายังอยู่ครบ', () => { for (const k of SETTINGS_KEYS) eq(raw[k], rows[k], k); });
  await t('ไม่มีข้อความเตือน "หน้าต่างนี้เปิดซ้ำ" ระหว่างรับสิทธิ์', () =>
    ok(!toasts.some(x => /เปิดซ้ำ/.test(x.m)), toasts.map(x => x.m).join(' | ')));
  env.dispose();
}

console.log('\n[1d] หน้าต่างที่ยังไม่รู้ว่าเป็นหน้าต่างหลักหรือไม่ ห้ามเขียนตอนโหลด');
{
  // Web Locks ตอบช้า: ระหว่างโหลดข้อมูล ยังไม่รู้ว่าหน้าต่างนี้ได้สิทธิ์เขียนไหม
  let release;
  const locks = { request(name, opts, cb) {
    return new Promise(res => { release = () => res(cb(null)); });   // สุดท้าย: ไม่ได้ล็อก = หน้าต่างรอง
  } };
  const env = createEnv({ locks }); quiet(env.app);
  await seed(env, { staff: [{ id: 'st1', name: 'เอ' }, { id: 'st1', name: 'บี' }] });
  const before = JSON.stringify((await env.raw('staff')));
  const initP = env.app.init().catch(e => e);
  await new Promise(r => setTimeout(r, 50));
  const midRaw = JSON.stringify(await env.raw('staff'));
  release();
  await initP;
  await t('ระหว่างรอผล Web Locks ยังไม่มีการเขียนลงเครื่อง', () => eq(midRaw, before));
  await t('สุดท้ายเป็นหน้าต่างรอง -> ไม่เขียนทับข้อมูลของหน้าต่างหลัก', async () => eq(JSON.stringify(await env.raw('staff')), before));
  env.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════
// ข้อ 2 — saveState ต้อง all-or-nothing
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] บันทึกล้มเหลวกลางทาง -> ต้องไม่มีอะไรลงเครื่องเลย (all-or-nothing)');
for (const mode of ['async', 'sync']) {
  const env = createEnv(); quiet(env.app);
  await seed(env);
  await env.app.loadState();
  env.app.state.transactions.push({ id: 'TX-1790000000000-AAAAAAAA', date: Date.now(), total: 300 });
  env.app.state.customers.push({ id: 'c-1', name: 'ใหม่', phone: '0800000000', visitCount: 1 });
  const undo = failPutForKeys(['customers'], mode);        // ค่าหนึ่งเขียนไม่ผ่าน
  let saved;
  try { saved = await env.app.saveState(); } finally { undo(); }
  await t(`[${mode}] saveState รายงานว่าไม่สำเร็จ`, () => eq(saved, false));
  await t(`[${mode}] บิลที่อยู่ในรอบเดียวกันต้องไม่ถูกบันทึกครึ่งเดียว`, async () => eq((await env.raw('transactions')).length, 0));
  await t(`[${mode}] ค่าอื่นในรอบเดียวกัน (กะ/คิวงานคลาวด์) ต้องเป็นค่าเดิมทั้งหมด`, async () => {
    const raw = await env.rawAll();
    eq(raw.customers.length, 0); eq(raw.cloudOutbox.length, 0);
  });
  env.dispose();
}

console.log('\n[2b] สองงานพร้อมกัน งานแรกบันทึกไม่ผ่าน -> rollback ต้องไม่ทับงานที่สอง และเครื่องกับหน้าจอต้องตรงกัน');
{
  const env = createEnv(); const toasts = quiet(env.app);
  await seed(env);
  await env.app.loadState();
  const app = env.app;
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  // งาน A: เพิ่มค่าใช้จ่าย (บันทึกไม่ผ่าน) · งาน B: เพิ่มค่าใช้จ่ายอีกรายการ (บันทึกผ่าน)
  env.els['expense-type'] = Object.assign(env.document.getElementById('expense-type'), { value: 'other' });
  const amount = env.document.getElementById('expense-amount');
  const note = env.document.getElementById('expense-note');
  let failNext = 1;
  const store = require('./harness_db.js').fidb.IDBObjectStore.prototype;
  const origPut = store.put;
  store.put = function (v) { if (v && v.key === 'shift' && failNext > 0) { failNext--; const e = new Error('disk'); e.name = 'UnknownError'; throw e; } return origPut.apply(this, arguments); };
  try {
    amount.value = '100'; note.value = 'A';
    const pA = app.addExpense();
    amount.value = '200'; note.value = 'B';
    const pB = app.addExpense();
    await Promise.all([pA, pB]);
  } finally { store.put = origPut; }
  const mem = app.state.shift.expenses.map(e => e.amount).sort();
  const raw = (await env.raw('shift')).expenses.map(e => e.amount).sort();
  await t('หน้าจอกับเครื่องตรงกัน (ไม่มีรายการผีที่หน้าจอเห็นแต่เครื่องไม่มี หรือกลับกัน)', () => eq(mem, raw));
  await t('งานที่บันทึกผ่านต้องยังอยู่ (rollback ของงานที่ล้มต้องไม่ลบงานอื่น)', () => ok(raw.includes(200), JSON.stringify(raw)));
  env.dispose();
}

console.log('\n[2c] งานหลายชนิดซ้อนกัน + ฐานข้อมูลล้มแบบสุ่ม -> หน้าจอกับเครื่องต้องตรงกันทุกครั้ง');
{
  // สุ่มแบบกำหนดค่าเริ่มได้ (ผลซ้ำได้ทุกครั้งที่รัน)
  let seedN = 20260921;
  const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
  const store = require('./harness_db.js').fidb.IDBObjectStore.prototype;
  const origPut = store.put;
  let mismatch = 0, rounds = 0;
  for (let round = 0; round < 12; round++) {
    const env = createEnv(); quiet(env.app);
    await seed(env);
    await env.app.loadState();
    const app = env.app;
    app.syncPendingTransactions = () => {}; app.flushCloudOutbox = () => {};
    app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
    app.showConfirm = (m, cb) => cb();
    env.document.getElementById('expense-type').value = 'other';
    // บิลตั้งต้น 2 ใบ ไว้ให้ยกเลิก
    app.state.transactions = [
      { id: 'TX-1790000000000-AAAAAAA1', date: Date.now() - 1000, total: 100, subtotal: 100, discount: 0, paymentMethod: 'cash', services: ['a'], syncStatus: 'synced' },
      { id: 'TX-1790000000000-AAAAAAA2', date: Date.now() - 900, total: 200, subtotal: 200, discount: 0, paymentMethod: 'cash', services: ['b'], syncStatus: 'synced' }];
    await app.saveState();
    // ฐานข้อมูลล้มแบบสุ่มราว 30% ของรอบเขียน
    store.put = function (v) {
      if (v && v.key === 'shift' && rnd() < 0.3) { const e = new Error('disk'); e.name = 'UnknownError'; throw e; }
      return origPut.apply(this, arguments);
    };
    const ops = [];
    try {
      for (let i = 0; i < 6; i++) {
        const r = rnd();
        if (r < 0.4) {
          env.document.getElementById('expense-amount').value = String(10 + i);
          ops.push(app.addExpense());
        } else if (r < 0.6) {
          const ex = app.state.shift.expenses[0];
          if (ex) ops.push(app.deleteExpense(ex.id));
        } else if (r < 0.8) {
          const tx = app.state.transactions[0];
          if (tx) {
            env.document.getElementById('edit-tx-id').value = tx.id;
            env.document.getElementById('void-money-outcome').value = 'refunded';
            ops.push(app.voidTransaction());
          }
        } else {
          app.state.cart = [{ uniqueCartId: 'u' + i, id: 's1', name: 'ตัดผม', price: 300, duration: 30, commission: 10,
            commissionType: 'percent', category: 'barber', staffId: 'st-1', staffName: 'เอ' }];
          app.state.selectedPaymentMethod = 'cash';
          env.document.getElementById('cash-received').value = '300';
          if (app.beginCheckoutAttempt) app.beginCheckoutAttempt();
          ops.push(app.processCheckout());
        }
      }
      await Promise.allSettled(ops);
      if (app.withMutation) await app.withMutation('รอให้คิวว่าง', async () => {});
      else await new Promise(r => setTimeout(r, 50));
    } finally { store.put = origPut; }
    const raw = await env.rawAll();
    const sameIds = (a, b) => JSON.stringify((a || []).map(x => x.id || x.billId || x.expenseId).sort()) ===
                              JSON.stringify((b || []).map(x => x.id || x.billId || x.expenseId).sort());
    rounds++;
    if (!sameIds(app.state.transactions, raw.transactions) || !sameIds(app.state.shift.expenses, raw.shift.expenses) ||
        !sameIds(app.state.voidLog, raw.voidLog) || !sameIds(app.state.expenseLog, raw.expenseLog)) mismatch++;
    env.dispose();
  }
  await t(`สุ่ม ${rounds} รอบ: หน้าจอกับเครื่องตรงกันทุกรอบ (บิล · ค่าใช้จ่าย · ประวัติยกเลิก · ประวัติลบค่าใช้จ่าย)`, () => eq(mismatch, 0));
}

// ═══════════════════════════════════════════════════════════════════════════
// ข้อ 3 — processCheckout ตรวจเงื่อนไขเองทั้งหมด
// ═══════════════════════════════════════════════════════════════════════════
async function checkoutEnv(opts) {
  const env = createEnv(); const toasts = quiet(env.app);
  await seed(env);
  await env.app.loadState();
  const app = env.app;
  app.syncPendingTransactions = () => {};   // ไม่ใช่สิ่งที่ทดสอบในหัวข้อนี้ (งานคลาวด์)
  app.currentRole = 'staff'; app.currentUser = { id: 'st-1', name: 'เอ' };
  app.state.cart = [{ uniqueCartId: 'u1', id: 's1', name: 'ตัดผม', price: 300, duration: 30, commission: 10,
    commissionType: 'percent', category: 'barber', staffId: 'st-1', staffName: 'เอ' }];
  app.state.selectedPaymentMethod = 'cash';
  env.document.getElementById('cash-received').value = '300';
  env.document.getElementById('cart-discount').value = '0';
  env.document.getElementById('cart-customer-select').value = '';
  if (opts) opts(app, env);
  if (app.beginCheckoutAttempt) app.beginCheckoutAttempt();   // = เปิดหน้าต่างชำระเงิน (หน้าจอจริงเรียกตัวนี้ใน openCheckoutModal)
  return { env, app, toasts };
}
const billsInDb = async (env) => (await env.raw('transactions')).length;

console.log('\n[3] ออกบิลได้เฉพาะเมื่อเงื่อนไขครบ — ตรวจที่ฟังก์ชันบันทึกจริง ไม่ใช่ที่ปุ่ม');
{
  const { env, app } = await checkoutEnv();
  await app.processCheckout();
  await t('กรณีปกติ: ออกบิลได้ 1 ใบ (ของเดิมต้องไม่พัง)', async () => eq(await billsInDb(env), 1));
  env.dispose();
}
const cases = [
  ['ยังไม่ได้ล็อกอิน', (app) => { app.currentRole = null; app.currentUser = null; }],
  ['กะปิดอยู่', (app) => { app.state.shift.active = false; }],
  ['ตะกร้าว่าง', (app) => { app.state.cart = []; }],
  ['ยังไม่เลือกช่องทางชำระ', (app) => { app.state.selectedPaymentMethod = null; }],
  ['ช่องทางชำระที่ระบบไม่รู้จัก', (app) => { app.state.selectedPaymentMethod = 'bitcoin'; }],
  ['รับเงินสดไม่พอ (รับ 200 ยอด 300)', (app, env) => { env.document.getElementById('cash-received').value = '200'; }],
  ['ช่องรับเงินสดว่าง', (app, env) => { env.document.getElementById('cash-received').value = ''; }],
  ['สแกนจ่ายแต่ยังไม่ตั้งเลขพร้อมเพย์', (app) => { app.state.selectedPaymentMethod = 'promptpay'; app.shopPromptPayId = ''; }],
  ['พนักงานในตะกร้าไม่มีอยู่ในระบบแล้ว', (app) => { app.state.cart[0].staffId = 'st-deleted'; }],
  ['ราคาในตะกร้าไม่ใช่ตัวเลข', (app) => { app.state.cart[0].price = 'abc'; }],
];
for (const [label, mut] of cases) {
  const { env, app } = await checkoutEnv(mut);
  await app.processCheckout();
  await t(`${label} -> ไม่มีบิลลงเครื่อง`, async () => eq(await billsInDb(env), 0));
  await t(`${label} -> ไม่มีบิลในหน่วยความจำ`, () => eq(app.state.transactions.length, 0));
  env.dispose();
}

console.log('\n[3b] กดยืนยันซ้ำ/เรียกพร้อมกัน -> ต้องได้บิลเดียว');
{
  const { env, app } = await checkoutEnv();
  await Promise.all([app.processCheckout(), app.processCheckout(), app.processCheckout()]);
  await t('เรียกพร้อมกัน 3 ครั้ง -> บิลเดียวในเครื่อง', async () => eq(await billsInDb(env), 1));
  await t('เรียกพร้อมกัน 3 ครั้ง -> บิลเดียวในหน่วยความจำ', () => eq(app.state.transactions.length, 1));
  await t('เรียกพร้อมกัน 3 ครั้ง -> คิวงานเดียว', () => eq(app.state.queue.length, 1));
  env.dispose();
}
{
  const { env, app } = await checkoutEnv();
  await app.processCheckout();
  // ตะกร้าเดิมถูกเติมกลับเหมือนหน้าจอค้าง แล้วกดซ้ำด้วยการชำระครั้งเดิม
  app.state.cart = [{ uniqueCartId: 'u1', id: 's1', name: 'ตัดผม', price: 300, duration: 30, commission: 10,
    commissionType: 'percent', category: 'barber', staffId: 'st-1', staffName: 'เอ' }];
  await app.processCheckout();
  await t('กดยืนยันซ้ำด้วยรอบชำระเดิม (ไม่ได้เปิดหน้าชำระใหม่) -> ไม่ออกบิลซ้ำ', async () => eq(await billsInDb(env), 1));
  env.dispose();
}

R.done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
