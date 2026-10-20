// VAT-ON end-to-end fuzzer — environment + "button" drivers (ย้ายจากผู้ตรวจ M รอบตรวจ 19 ต.ค. 2569 เข้าชุดเทสต์ · ข้อ 69)
// ใช้กับ tests/fuzz_vat_e2e.js และ tests/test_fix_20261020_vat_smoke.js · POS_APP_SRC / POS_GAS_SRC ชี้รุ่นอื่นได้ (ผ่าน harness_db/gas_env)
// Real app.js (harness_db: real Dexie on fake-indexeddb) wired to the real google_apps_script.js (gas_env: fetch -> doPost).
// Time is simulated: both the app vm and the GAS vm see the same controllable clock.
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const T = __dirname;
const WORK = path.join(__dirname, '..');   // โฟลเดอร์โปรเจกต์ (promptpay-qr.js)
const { createEnv } = require(path.join(T, 'harness_db.js'));
const { createGasEnv } = require(path.join(T, 'gas_env.js'));
const { quiet } = require(path.join(T, 'fixtures_db.js'));

const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const H = 3600e3, MIN = 60e3;
const settle = (ms) => new Promise(r => setTimeout(r, ms == null ? 8 : ms));

// Bangkok wall clock -> UTC ms
const bkk = (y, mo, d, hh, mm, ss) => Date.UTC(y, mo - 1, d, hh || 0, mm || 0, ss || 0) - 7 * H;

function installAppClock(ctx, clock) {
  ctx.__clock = clock;
  vm.runInContext(`(() => { const RD = Date; class FD extends RD {
      constructor(...a) { if (a.length === 0) super(globalThis.__clock.now); else super(...a); }
      static now() { return globalThis.__clock.now; } } globalThis.Date = FD; })();`, ctx);
}
function gasDateCtor(clock) {
  return class GD extends Date {
    constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); }
    static now() { return clock.now; }
  };
}

const CATS = [
  { id: 'barber', name: 'ตัดผมชาย', icon: 'fa-scissors', vat: false },
  { id: 'massage', name: 'นวดและสปา', icon: 'fa-spa', vat: false },
  { id: 'spa', name: 'สปาพรีเมียม', icon: 'fa-gem', vat: true },
  { id: 'drinks', name: 'เครื่องดื่ม', icon: 'fa-mug-hot', vat: true },
  { id: 'retail', name: 'ของขาย', icon: 'fa-store', vat: true }
];
const SERVICES = [
  { id: 's1', type: 'service', name: 'ตัดผม', price: 300, duration: 45, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's2', type: 'service', name: 'นวดไทย', price: 500, duration: 60, category: 'massage', commission: 40, commissionType: 'percent' },
  { id: 's3', type: 'service', name: 'สปาอโรมา', price: 1290, duration: 90, category: 'spa', commission: 15, commissionType: 'percent' },
  { id: 's4', type: 'service', name: 'โกนหนวด', price: 150, duration: 30, category: 'barber', commission: 30, commissionType: 'fixed' },
  { id: 's5', type: 'service', name: 'นวดเท้า', price: 333, duration: 45, category: 'massage', commission: 33, commissionType: 'percent' },
  { id: 'p1', type: 'product', name: 'น้ำเปล่า', price: 20, duration: 0, category: 'drinks', commission: 0, commissionType: 'percent', cost: 8 },
  { id: 'p2', type: 'product', name: 'เบียร์', price: 99, duration: 0, category: 'drinks', commission: 10, commissionType: 'fixed', cost: 40 },
  { id: 'p3', type: 'product', name: 'ครีมนวด', price: 459, duration: 0, category: 'retail', commission: 5, commissionType: 'percent', cost: 200 },
  { id: 'p4', type: 'product', name: 'ขนม', price: 35, duration: 0, category: 'retail', commission: 0, commissionType: 'percent' },
  { id: 'p5', type: 'product', name: 'หมวก', price: 250, duration: 0, category: 'barber', commission: 0, commissionType: 'percent', cost: 100 }
];
const STAFF_DEF = [
  { id: 'st-1', name: 'เอ', role: 'ช่าง', accessLevel: 'staff', pin: '111111' },
  { id: 'st-2', name: 'ซี', role: 'หมอนวด', accessLevel: 'staff', pin: '333333' },
  { id: 'mg-1', name: 'บี', role: 'ผู้จัดการ', accessLevel: 'manager', pin: '222222' }
];
const USERS = { owner: { id: '__owner__', name: 'เจ้าของร้าน' }, manager: { id: 'mg-1', name: 'บี' }, staff: { id: 'st-1', name: 'เอ' }, staff2: { id: 'st-2', name: 'ซี' } };
const ROLE_OF = { owner: 'owner', manager: 'manager', staff: 'staff', staff2: 'staff' };

// Pre-VAT legacy bills (no VAT fields) + a first-generation VAT bill without vatRate (v51) — all in early October.
function legacyBills() {
  const mk = (id, ts, extra) => Object.assign({ id, date: ts, customerName: 'ลูกค้าเก่า', staffNames: ['เอ'], syncStatus: 'pending', rev: 1 }, extra);
  return [
    mk('TX-1759400000000-LEGACYA1', bkk(2026, 10, 2, 14, 0), { services: ['ตัดผม'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash' }),
    mk('TX-1759480000000-LEGACYB2', bkk(2026, 10, 3, 20, 30), { services: ['ตัดผม', 'นวดไทย'], subtotal: 800, discount: 50, total: 750, paymentMethod: 'promptpay',
      details: [{ name: 'ตัดผม', price: 300, netPrice: 281.25, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 28 },
                { name: 'นวดไทย', price: 500, netPrice: 468.75, staffId: 'st-2', staffName: 'ซี', commission: 40, commissionType: 'percent', commissionAmount: 188 }] }),
    mk('TX-1759560000000-LEGACYC3', bkk(2026, 10, 5, 1, 15), { services: ['โกนหนวด'], total: 150 }),   // very old: no subtotal/discount/payment
    mk('TX-1760000000000-V51FIRST', bkk(2026, 10, 9, 18, 0), { services: ['สปาอโรมา'], subtotal: 1290, discount: 0, nonVatBase: 0, vatableBase: 1290,
      vatAmount: 90.3, rounding: 0.7, total: 1381, paymentMethod: 'cash',
      details: [{ name: 'สปาอโรมา', price: 1290, netPrice: 1290, staffId: 'st-2', staffName: 'ซี', commission: 15, commissionType: 'percent', commissionAmount: 194, category: 'spa', vatable: true }] })
  ];
}

async function makeShopM(opts) {
  const o = opts || {};
  const clock = { now: o.start };
  const telegram = [];   // { at, text, ok }
  const net = { telegramFailNext: 0 };
  const gas = createGasEnv({ DateCtor: gasDateCtor(clock) });
  const ui = { cash: { 1000: 1 }, staffSelects: [] };
  const fetchWrap = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      let text = '';
      try { text = JSON.parse(init.body).text; } catch (e) { text = '?'; }
      const fail = net.telegramFailNext > 0; if (fail) net.telegramFailNext--;
      telegram.push({ at: clock.now, text, ok: !fail });
      const body = fail ? { ok: false, description: 'Too Many Requests: retry later' } : { ok: true, result: {} };
      return { ok: !fail, status: fail ? 429 : 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
    }
    return gas.fetch(url, init);
  };
  const cashInputs = () => Object.keys(ui.cash).map(denom => ({ value: String(ui.cash[denom]),
    getAttribute: (k) => (k === 'data-denom' ? String(denom) : null) }));
  const env = createEnv({ fetch: fetchWrap, querySelectorAll: (sel) => {
    const s = String(sel);
    if (/cash-qty-input/.test(s)) return cashInputs();
    if (/edit-tx-service-staff-select/.test(s)) return ui.staffSelects;
    return [];
  } });
  installAppClock(env.ctx, clock);
  vm.runInContext(fs.readFileSync(path.join(WORK, 'promptpay-qr.js'), 'utf8'), env.ctx);
  const app = env.app;
  const toasts = quiet(app);
  const staff = [];
  for (const s of STAFF_DEF) staff.push({ id: s.id, name: s.name, role: s.role, accessLevel: s.accessLevel, pin: await app.hashPin(s.pin) });
  const rows = {
    db_migrated: true,
    services: JSON.parse(JSON.stringify(SERVICES)), categories: JSON.parse(JSON.stringify(CATS)), staff,
    customers: [{ id: 'c-1', name: 'คุณประจำ', phone: '0811111111', visitCount: 3, tier: 'ทั่วไป (General)' },
                { id: 'c-2', name: 'คุณทอง', phone: '0822222222', visitCount: 9, tier: 'ทอง (Gold)' }],
    queue: [], transactions: o.legacy === false ? [] : legacyBills(), voidLog: [], expenseLog: [], editLog: [], cloudOutbox: [],
    quarantine: [], backupStatus: null,
    deviceId: 'dev-' + crypto.randomBytes(16).toString('hex'), primaryStatus: null,
    shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] },
    shopPromptPayId: '0812345678', shopName: 'ร้านทดสอบ M', shopTagline: 'TAG', shopAddress: 'ที่อยู่', shopPhone: '021234567',
    shopLogo: '', theme: 'light', ownerPin: await app.hashPin('246810'),
    googleSheetsUrl: SHEETS_URL, googleSheetsApiToken: gas.token,
    telegramToken: '123456:TESTTOKEN', telegramChatId: '-1001234',
    vatEnabled: false, vatRate: 7, cardFeeRate: 10
  };
  await env.db.state.bulkPut(Object.keys(rows).map(k => ({ key: k, value: rows[k] })));
  await app.init();
  await settle(20);
  login(app, 'owner');
  const st = await app.cloudPost('register_primary', {}, 15000);
  if (st.status === 'success') await app.notePrimaryStatus(true, st.details && st.details.primary);
  else throw new Error('register_primary failed ' + JSON.stringify(st));
  app.cloudTimeoutMs = 5000;
  return { env, app, gas, clock, telegram, net, ui, toasts, d: env.document, P: Object.getPrototypeOf(app) };
}

function login(app, who) {
  app.currentRole = ROLE_OF[who];
  app.currentUser = Object.assign({}, USERS[who]);
}

module.exports = { WORK, T, SHEETS_URL, H, MIN, settle, bkk, CATS, SERVICES, STAFF_DEF, USERS, legacyBills, makeShopM, login };
