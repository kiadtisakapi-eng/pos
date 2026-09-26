// ของใช้ร่วมของเทสต์ "ฐานข้อมูลจริง" — ข้อมูลร้านตั้งต้น · ปิดงานวาดหน้าจอ · ล็อกอิน · ต่อกับ Apps Script จำลอง
// (แยกออกมาเพื่อไม่ให้แต่ละไฟล์เทสต์เขียน seed ของตัวเองจนค่าไม่ตรงกัน)
const { createEnv } = require('./harness_db.js');
const { createGasEnv } = require('./gas_env.js');

const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';

async function seed(env, extra) {
  const rows = Object.assign({
    db_migrated: true,
    services: [
      { id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
      { id: 'd1', name: 'น้ำ', price: 20, duration: 0, category: 'drinks', commission: 0, commissionType: 'percent' }
    ],
    categories: [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }, { id: 'drinks', name: 'เครื่องดื่ม', icon: 'fa-mug-hot', vat: true }],
    staff: [
      { id: 'st-1', name: 'เอ', role: 'ช่าง', accessLevel: 'staff', pin: await env.app.hashPin('111111') },
      { id: 'mg-1', name: 'บี', role: 'ผู้จัดการ', accessLevel: 'manager', pin: await env.app.hashPin('222222') }
    ],
    customers: [], queue: [], transactions: [], voidLog: [], expenseLog: [], editLog: [], cloudOutbox: [],
    // คีย์ที่แอปรุ่นใหม่เขียนทุกครั้งที่บันทึก — ใส่ไว้ตั้งแต่ต้น เพื่อให้ "ข้อมูลเปลี่ยน" ในเทสต์หมายถึงงานจริง ไม่ใช่แค่คีย์ใหม่
    quarantine: [], backupStatus: null,
    // รหัสเครื่อง (ข้อ 19) — เครื่องจำลองแต่ละเครื่องได้รหัสของตัวเอง (สุ่มต่อการสร้าง) · สถานะเครื่องหลักยังไม่รู้
    deviceId: 'dev-' + require('crypto').randomBytes(16).toString('hex'), primaryStatus: null,
    shift: { active: true, startTime: Date.now() - 3600e3, startCash: 1000, startDetails: {}, expenses: [], history: [] },
    shopPromptPayId: '0812345678', shopName: 'ร้านจริง', shopTagline: 'TAG', shopAddress: 'ที่อยู่', shopPhone: '021234567',
    shopLogo: '', theme: 'light', ownerPin: await env.app.hashPin('246810'),
    googleSheetsUrl: SHEETS_URL, googleSheetsApiToken: 'T'.repeat(40),
    telegramToken: '', telegramChatId: '',
    vatEnabled: true, vatRate: 7
  }, extra || {});
  await env.db.state.bulkPut(Object.keys(rows).map(k => ({ key: k, value: rows[k] })));
  return rows;
}

function quiet(app) {
  const toasts = [];
  app.showToast = (m, ty) => toasts.push({ m: String(m), ty });
  ['renderAll', 'renderEveryScreen', 'renderDashboard', 'renderPos', 'renderQueueScreen', 'renderCustomerTable',
   'renderReports', 'renderSettingsLists', 'filterReports', 'renderCart', 'updateCartTotals', 'showThermalReceipt',
   'vibrateDevice', 'openModal', 'closeModal', 'updateUserRoleUI', 'applyShopName', 'applyTheme',
   'renderLoginOptions', 'updateSyncBadgeStatus', 'renderReadOnlyBanner', 'registerServiceWorker',
   'requestPersistentStorage', 'showAppVersion', 'startIdleWatch'].forEach(k => { app[k] = () => {}; });
  // หน้าต่างยืนยันของ UI: กด "ตกลง" ทันที และเก็บ promise ของงานไว้ให้เทสต์รอ
  app.showConfirm = (msg, cb) => { app._lastConfirmMsg = msg; app._confirmP = Promise.resolve().then(() => cb()); return app._confirmP; };
  app.askConfirm = async (msg) => { app._lastAskMsg = msg; return true; };
  // ถาม PIN ซ้ำก่อนทำรายการเสี่ยง (ข้อ 8) — เทสต์ทั่วไปถือว่าใส่ PIN ถูก · เทสต์ของด่านนี้เองใช้ตัวจริง (unquietStepUp)
  app._realConfirmPinStepUp = app.confirmPinStepUp;
  app.confirmPinStepUp = async (label) => { (app._stepUps = app._stepUps || []).push(label); return true; };
  return toasts;
}

const USERS = {
  owner:   { id: '__owner__', name: 'เจ้าของร้าน' },
  manager: { id: 'mg-1', name: 'บี' },
  staff:   { id: 'st-1', name: 'เอ' }
};
function loginAs(app, role) {
  app.currentRole = role || null;
  app.currentUser = role ? Object.assign({}, USERS[role]) : null;
}

// ช่องนับธนบัตรในหน้าต่างนับเงิน (ปิด/เปิดกะ) — { ชนิดธนบัตร: จำนวน }
function cashInputs(counts) {
  return Object.keys(counts).map(denom => ({ value: String(counts[denom]),
    getAttribute: (k) => (k === 'data-denom' ? String(denom) : null) }));
}

// เครื่อง POS 1 เครื่อง (ฐานข้อมูลจริง) ต่อกับ Apps Script จำลอง 1 ชุด
async function makeShop(o) {
  o = o || {};
  const gas = o.gas || createGasEnv();
  const env = createEnv({ fetch: gas.fetch, factory: o.factory, onLine: o.onLine,
    querySelectorAll: (sel) => (/cash-qty-input/.test(String(sel)) ? cashInputs(o.cash || { 1000: 1 }) : []) });
  const toasts = quiet(env.app);
  const rows = await seed(env, Object.assign({ googleSheetsApiToken: gas.token }, o.rows || {}));
  if (o.noInit) await env.app.loadState(); else await env.app.init();
  loginAs(env.app, o.role === undefined ? 'owner' : o.role);
  return { env, app: env.app, gas, toasts, rows };
}

// เตรียมตะกร้า + หน้าต่างชำระเงิน (เหมือนกดเปิดหน้าชำระ)
function readyCheckout(env, items, pay, received) {
  const app = env.app;
  app.state.cart = (items || [{ id: 's1', name: 'ตัดผม', price: 300 }]).map((it, i) => Object.assign({
    uniqueCartId: 'u' + i, duration: 30, commission: 10, commissionType: 'percent', category: 'barber',
    staffId: 'st-1', staffName: 'เอ' }, it));
  app.state.selectedPaymentMethod = pay || 'cash';
  env.document.getElementById('cash-received').value = String(received == null ? 100000 : received);
  env.document.getElementById('cart-discount').value = '0';
  env.document.getElementById('cart-customer-select').value = '';
  if (app.beginCheckoutAttempt) app.beginCheckoutAttempt();
}

// ปล่อยงาน async ที่ค้าง (IndexedDB ปลอมใช้ setImmediate) ให้จบ
const settle = (ms) => new Promise(r => setTimeout(r, ms == null ? 20 : ms));

module.exports = { seed, quiet, loginAs, makeShop, readyCheckout, settle, SHEETS_URL, USERS, createGasEnv };
