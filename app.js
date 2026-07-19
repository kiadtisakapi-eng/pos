/**
 * Erotica Barber & Massage POS - Application Logic
 */

// เริ่มต้นข้อมูลเริ่มต้นของระบบ (หากยังไม่มีใน Local Storage)
const DEFAULT_SERVICES = [
  { id: 's1', name: 'ตัดผมชายสไตล์วินเทจ', price: 300, duration: 45, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's2', name: 'โกนหนวดและแต่งหนวดเครา', price: 150, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's3', name: 'สระนวดและเซ็ตแต่งทรง', price: 200, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
  { id: 's4', name: 'นวดไทยเพื่อสุขภาพและผ่อนคลาย', price: 350, duration: 60, category: 'massage', commission: 10, commissionType: 'percent' },
  { id: 's5', name: 'นวดน้ำมันอโรมาอุ่นบำบัด', price: 600, duration: 90, category: 'massage', commission: 15, commissionType: 'percent' },
  { id: 's6', name: 'นวดกดจุดสะท้อนฝ่าเท้า', price: 250, duration: 60, category: 'massage', commission: 10, commissionType: 'percent' },
  { id: 's7', name: 'นวดประคบสมุนไพรไทยสด', price: 500, duration: 90, category: 'massage', commission: 15, commissionType: 'percent' },
  { id: 's8', name: 'แพ็คเกจฟูลคอร์ส (ตัดผม + นวดสปา 1 ชม.)', price: 800, duration: 105, category: 'premium', commission: 20, commissionType: 'percent' },
  { id: 's9', name: 'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส', price: 1000, duration: 120, category: 'premium', commission: 20, commissionType: 'percent' }
];

// เริ่มต้นด้วยรายชื่อว่าง — เจ้าของร้านเพิ่มพนักงานจริงเองในหน้าตั้งค่า (ไม่มีข้อมูล demo ค้างในระบบจริง)
const DEFAULT_STAFF = [];

// เริ่มต้นด้วยรายชื่อว่าง — ลูกค้าจะถูกเพิ่มเมื่อใช้งานจริง (ไม่มีข้อมูล demo ค้างในระบบจริง)
const DEFAULT_CUSTOMERS = [];

const DEFAULT_QUEUE = [];

const DEFAULT_TRANSACTIONS = [];

const DEFAULT_CATEGORIES = [
  { id: 'barber', name: 'ตัดผมชาย (Barber)', icon: 'fa-scissors' },
  { id: 'massage', name: 'นวดและสปา (Massage)', icon: 'fa-spa' },
  { id: 'premium', name: 'แพ็คเกจพรีเมียม (Premium)', icon: 'fa-gem' }
];

// ⚠️ SECRET TOKEN — ต้องตรงกับค่า API_SECRET ในไฟล์ google_apps_script.js ทุกตัวอักษร
//    เปลี่ยนเป็นรหัสลับของคุณเอง แล้ว re-deploy GAS ใหม่ด้วย
const API_SECRET = 'epos_8iwcISy4RSQkymn8FdGupRP';

// เวอร์ชันแอป — บัมพ์ทุกครั้งที่ปล่อยอัปเดต (ควรให้สอดคล้องกับ CACHE_NAME ใน sw.js)
const APP_VERSION = '1.3.2 (2026-07-19)';

// ─────────────────────────────────────────────
//  วันทำการ (Business Date) — ร้านเปิด 11:00 น. ถึงตี 3 ของวันถัดไป
//  บิล/ยอด/ค่าใช้จ่ายก่อน 06:00 เช้า นับเป็นวันทำการของ "เมื่อวาน" (มาตรฐานร้านกลางคืน)
//  เช่น บิลตี 2 ของเช้าวันที่ 19 = ยอดของคืนวันที่ 18 → ลงสรุปวันที่ 18 และแท็บเดือนตามวันที่ 18
//  ⚠️ ค่านี้ต้องอยู่ระหว่าง "เวลาปิดร้านช้าสุด" กับ "เวลาเปิดร้าน" (ปิด 03:00, เปิด 11:00 → 6 พอดี)
// ─────────────────────────────────────────────
const BUSINESS_DAY_CUTOFF_HOUR = 6;

// กัน XSS — แปลงอักขระพิเศษก่อนนำข้อความของผู้ใช้ไปแสดงผลด้วย innerHTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, function (s) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
  });
}

// เริ่มต้นฐานข้อมูล IndexedDB ด้วย Dexie.js
const SESSION_TTL_HOURS = 20; // จำการล็อกอินไว้กี่ชั่วโมงก่อนต้องใส่ PIN ใหม่
// (20 ชม. ครอบคลุมกะเต็ม 11:00 → ตี 3 + เผื่อเปิดเครื่องก่อนเปิดร้าน — เดิม 12 ชม. หมดอายุ 23:00 กลางกะ
//  ถ้า iPad รีเฟรช/อัปเดตแอปหลังจากนั้นจะเด้งหน้า login ทั้งที่กำลังขายอยู่)
const db = new Dexie('EroticaPosDatabase');
db.version(1).stores({
  state: 'key, value'
});
// v2: ตัด index 'value' ที่ไม่ได้ใช้ทิ้ง — ค่าที่เก็บเป็น object/array ซึ่ง IndexedDB ทำ index ไม่ได้อยู่แล้ว
// (Dexie อัปเกรดฐานข้อมูลเดิมจาก v1 ให้อัตโนมัติ ข้อมูลไม่หาย)
db.version(2).stores({
  state: 'key'
});

class PosApp {
  constructor() {
    this.state = {
      services: [],
      categories: [],
      staff: [],
      customers: [],
      queue: [],
      transactions: [],
      voidLog: [],
      cloudOutbox: [],
      cart: [],
      selectedCategory: 'all',
      serviceSearch: '',
      selectedPaymentMethod: null,
      selectedReportType: 'daily',
      activeScreen: 'dashboard',
      editingStaffId: null,
      editingServiceId: null,
      editingCategoryId: null,
      shift: {
        active: false,
        startTime: null,
        startCash: 0,
        startDetails: {},
        expenses: [],
        history: []
      }
    };

    this.timerInterval = null;
    this.isSyncing = false;
    this.currentRole = null;      // 'owner' | 'manager' | 'staff' | null (ยังไม่ล็อกอิน)
    this.currentUser = null;      // { id, name } ของผู้ที่ล็อกอินอยู่
    this.loginSelectedId = null;  // ผู้ใช้ที่เลือกในหน้าล็อกอิน
  }

  // ==================== TOAST NOTIFICATION ====================

  // แทน alert() ด้วย toast ที่ไม่ blocking UI
  showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:320px;';
      document.body.appendChild(container);
    }
    const colors = {
      success: { bg: 'rgba(16,212,138,0.15)', border: 'rgba(16,212,138,0.4)', icon: '✅' },
      error:   { bg: 'rgba(244,63,106,0.15)', border: 'rgba(244,63,106,0.4)', icon: '❌' },
      warning: { bg: 'rgba(245,200,66,0.15)', border: 'rgba(245,200,66,0.4)', icon: '⚠️' },
      info:    { bg: 'rgba(45,224,201,0.15)', border: 'rgba(45,224,201,0.4)', icon: 'ℹ️' },
    };
    const c = colors[type] || colors.success;
    const toast = document.createElement('div');
    toast.style.cssText = `background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:12px 16px;font-family:var(--font-family);font-size:0.88rem;color:var(--text-primary);display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:toastIn 0.25s ease;backdrop-filter:blur(10px);`;
    toast.innerHTML = `<span style="font-size:1.1rem">${c.icon}</span><span style="flex:1;line-height:1.4">${escapeHtml(message)}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0 4px;flex-shrink:0">×</button>`;
    if (!document.getElementById('toast-style')) {
      const s = document.createElement('style');
      s.id = 'toast-style';
      s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
      document.head.appendChild(s);
    }
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, duration);
  }

  // ==================== CUSTOM MODALS ====================

  showConfirm(message, callback) {
    const modal = document.getElementById('modal-confirm');
    const msgEl = document.getElementById('confirm-modal-msg');
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnCancel = document.getElementById('btn-confirm-cancel');

    if (!modal || !msgEl || !btnYes || !btnCancel) {
      if (confirm(message)) {
        if (callback) callback();
      }
      return;
    }

    msgEl.innerText = message;
    modal.classList.add('active');

    btnCancel.onclick = () => {
      modal.classList.remove('active');
    };

    btnYes.onclick = () => {
      modal.classList.remove('active');
      if (callback) callback();
    };
  }

  showPromptModal(message, defaultValue, callback) {
    const modal = document.getElementById('modal-prompt');
    const titleEl = document.getElementById('prompt-modal-title');
    const inputEl = document.getElementById('prompt-modal-input');
    const formEl = document.getElementById('form-prompt');

    if (!modal || !titleEl || !inputEl || !formEl) {
      const result = prompt(message, defaultValue);
      if (result !== null && callback) {
        callback(result);
      }
      return;
    }

    titleEl.innerText = message;
    inputEl.value = defaultValue || '';
    modal.classList.add('active');
    
    setTimeout(() => {
      inputEl.focus();
      if (inputEl.value) inputEl.select();
    }, 100);

    formEl.onsubmit = (e) => {
      e.preventDefault();
      modal.classList.remove('active');
      if (callback) callback(inputEl.value);
    };
  }

  // ==================== TIMEZONE HELPERS ====================

  // ช่วยดึงวันที่แบบ ISO ท้องถิ่น (Local ISO Date String เช่น "2026-06-07")
  getLocalISODate(dateVal) {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  }

  // ช่วยดึงเดือนแบบ ISO ท้องถิ่น (Local ISO Month String เช่น "2026-06")
  getLocalISOMonth(dateVal) {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().slice(0, 7);
  }

  // ==================== BUSINESS DATE HELPERS (วันทำการ) ====================
  // ทุกการ "จัดกลุ่มรายวัน/รายเดือน" ในระบบต้องใช้ชุดนี้แทน getLocalISODate/getLocalISOMonth
  // (เวลาแสดงผลบนบิล/ใบเสร็จยังใช้เวลาจริง — เปลี่ยนเฉพาะการจัดกลุ่ม)

  // เลื่อน timestamp ถอยหลังตามชั่วโมงตัดวัน — ฐานของทุกฟังก์ชันด้านล่าง
  getBusinessTime(dateVal) {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return NaN;
    return d.getTime() - BUSINESS_DAY_CUTOFF_HOUR * 3600 * 1000;
  }

  // วันทำการแบบ "2026-07-18" (บิลตี 2 ของวันที่ 19 → "2026-07-18")
  getBusinessISODate(dateVal) {
    const t = this.getBusinessTime(dateVal);
    return isNaN(t) ? '' : this.getLocalISODate(t);
  }

  // เดือนทำการแบบ "2026-07"
  getBusinessISOMonth(dateVal) {
    const t = this.getBusinessTime(dateVal);
    return isNaN(t) ? '' : this.getLocalISOMonth(t);
  }

  // เดือนทำการรูปแบบแท็บชีต "07-2026"
  getBusinessMonthKey(dateVal) {
    const t = this.getBusinessTime(dateVal);
    if (isNaN(t)) return '';
    const d = new Date(t);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // ==================== NETWORK HELPER ====================

  // fetch พร้อม timeout — บน wifi ที่ "ต่อติดแต่ไม่วิ่ง" fetch เปล่าค้างได้เป็นนาที
  // ระหว่างนั้น isSyncing/_flushingOutbox ค้างเป็น true → การซิงก์ทั้งระบบถูกบล็อกจนกว่าจะปิดแอป
  async fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error(`หมดเวลารอ ${Math.round(timeoutMs / 1000)} วินาที (เครือข่ายช้าหรือค้าง)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ==================== SECURITY HELPERS ====================

  // แฮช PIN ด้วย SHA-256 ก่อนเก็บ — ใครเปิด DevTools ก็ไม่เห็น PIN จริง
  async hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode('jahn_pos_v2_' + pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ตรวจว่าเป็น hash (64 hex chars) หรือยัง — ใช้สำหรับ migration
  isHashed(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  }

  // Migration: แปลง PIN plain text เป็น hash ในครั้งแรกที่รัน
  async migratePinIfNeeded() {
    if (this.ownerPin && !this.isHashed(this.ownerPin)) {
      const hashed = await this.hashPin(this.ownerPin);
      this.ownerPin = hashed;
      await this.saveState();
    }
  }

  async init() {
    await this.loadState();
    // แปลง PIN plain text → hash ถ้ายังไม่ได้ทำ (รันครั้งเดียวตอนเริ่ม)
    await this.migratePinIfNeeded();
    await this.migrateStaffAccountsIfNeeded(); // เติมฟิลด์ accessLevel/pin ให้พนักงานเดิม
    this.initEventListeners();
    this.requestPersistentStorage(); // ขอให้เบราว์เซอร์ไม่ลบ IndexedDB ทิ้งเอง (สำคัญบน iOS)
    this.showAppVersion();           // แสดงเวอร์ชันแอปในหน้าตั้งค่า
    
    // ตั้งค่าเริ่มต้นให้กับช่องเลือกวัน/เดือนย้อนหลัง — ใช้วันทำการ
    // (เปิดแอปตอนตี 1 ค่าเริ่มต้นจะเป็น "เมื่อวาน" ซึ่งคือคืนที่กำลังขายอยู่จริง)
    const todayStr = this.getBusinessISODate(new Date());
    const monthStr = this.getBusinessISOMonth(new Date());
    
    const dateInput = document.getElementById('report-date-input');
    const monthInput = document.getElementById('report-month-input');
    if (dateInput) dateInput.value = todayStr;
    if (monthInput) monthInput.value = monthStr;

    this.renderAll();
    this.applyShopName();      // แสดงชื่อร้านบนหน้าจอตามที่ตั้งค่าไว้
    this.applyTheme();         // ใช้ธีมสว่าง/มืดตามที่บันทึกไว้
    this.updateUserRoleUI();
    this.checkSyncStatus(); // ตรวจเช็คสถานะการซิงก์ข้อมูลเมื่อเปิดแอปพลิเคชัน
    this.flushCloudOutbox(); // ส่งสรุป/Telegram ที่ค้างจากการปิดกะตอนออฟไลน์ (กรณีเปิดแอปใหม่ตอนเน็ตมาแล้ว)
    
    // ตั้งเวลาสำหรับอัปเดตแถบเวลาของคิวงาน (คิวที่กำลังรับบริการอยู่)
    this.timerInterval = setInterval(() => this.updateQueueProgress(), 1000);
    
    // จำการล็อกอินเดิมถ้ายังไม่หมดอายุ ไม่งั้นแสดงหน้าเข้าสู่ระบบ
    if (await this.tryRestoreSession()) {
      this.afterLogin();
    } else {
      this.requireLogin();
    }

    // ลงทะเบียน Service Worker สำหรับ PWA
    this.registerServiceWorker();

    // เน็ตกลับมา / สลับกลับมาที่แอป → ดันบิลที่ค้าง sync ขึ้นทันที (กันบิลที่ขายตอนออฟไลน์ค้าง)
    window.addEventListener('online', () => { this.syncPendingTransactions(true); this.flushCloudOutbox(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) { this.syncPendingTransactions(true); this.flushCloudOutbox(); }
    });
  }

  // โหลดข้อมูลจาก IndexedDB (พร้อมตรวจเช็คและย้ายข้อมูลจาก LocalStorage ครั้งแรก)
  async loadState() {
    const storageKeys = {
      services: 'jahn_pos_services',
      staff: 'jahn_pos_staff',
      customers: 'jahn_pos_customers',
      queue: 'jahn_pos_queue',
      transactions: 'jahn_pos_transactions',
      shift: 'jahn_pos_shift'
    };

    try {
      // 1. ตรวจสอบการย้ายข้อมูล (Migration) จาก LocalStorage ไป IndexedDB
      const migrationCheck = await db.state.get('db_migrated');
      const isMigrated = migrationCheck ? migrationCheck.value : false;

      if (!isMigrated) {
        console.log('[Migration] เริ่มการย้ายข้อมูลจาก LocalStorage ไปยัง IndexedDB...');
        
        // อ่านข้อมูลเก่าจาก LocalStorage (ถ้าไม่มีให้ใช้ Default)
        const oldServices = JSON.parse(localStorage.getItem(storageKeys.services)) || DEFAULT_SERVICES;
        const oldStaff = JSON.parse(localStorage.getItem(storageKeys.staff)) || DEFAULT_STAFF;
        const oldCustomers = JSON.parse(localStorage.getItem(storageKeys.customers)) || DEFAULT_CUSTOMERS;
        const oldQueue = JSON.parse(localStorage.getItem(storageKeys.queue)) || DEFAULT_QUEUE;
        const oldTransactions = JSON.parse(localStorage.getItem(storageKeys.transactions)) || DEFAULT_TRANSACTIONS;
        const oldShift = JSON.parse(localStorage.getItem(storageKeys.shift)) || {
          active: false,
          startTime: null,
          startCash: 0,
          startDetails: {},
          expenses: [],
          history: []
        };
        const oldPromptPay = localStorage.getItem('jahn_pos_shop_promptpay') || '';
        const oldPin = localStorage.getItem('jahn_pos_shop_owner_pin') || '123456';
        const oldSheetsUrl = localStorage.getItem('jahn_pos_google_sheets_url') || '';
        const oldTelegramToken = localStorage.getItem('jahn_pos_telegram_token') || '';
        const oldTelegramChatId = localStorage.getItem('jahn_pos_telegram_chatid') || '';

        // บันทึกทั้งหมดลงใน Dexie IndexedDB
        await db.state.bulkPut([
          { key: 'services', value: oldServices },
          { key: 'staff', value: oldStaff },
          { key: 'customers', value: oldCustomers },
          { key: 'queue', value: oldQueue },
          { key: 'transactions', value: oldTransactions },
          { key: 'shift', value: oldShift },
          { key: 'shopPromptPayId', value: oldPromptPay },
          { key: 'ownerPin', value: oldPin },
          { key: 'googleSheetsUrl', value: oldSheetsUrl },
          { key: 'telegramToken', value: oldTelegramToken },
          { key: 'telegramChatId', value: oldTelegramChatId },
          { key: 'db_migrated', value: true }
        ]);

        // ลบข้อมูลเก่าออกจาก LocalStorage เพื่อเคลียร์พื้นที่
        Object.values(storageKeys).forEach(k => localStorage.removeItem(k));
        localStorage.removeItem('jahn_pos_shop_promptpay');
        localStorage.removeItem('jahn_pos_shop_owner_pin');
        localStorage.removeItem('jahn_pos_google_sheets_url');
        localStorage.removeItem('jahn_pos_telegram_token');
        localStorage.removeItem('jahn_pos_telegram_chatid');
        
        console.log('[Migration] ย้ายข้อมูลไปยัง IndexedDB เรียบร้อยเสร็จสมบูรณ์!');
      }

      // 2. ดึงข้อมูลจริงจาก IndexedDB มาใส่ใน state ของแอป
      const servicesVal = await db.state.get('services');
      const categoriesVal = await db.state.get('categories');
      const staffVal = await db.state.get('staff');
      const customersVal = await db.state.get('customers');
      const queueVal = await db.state.get('queue');
      const transactionsVal = await db.state.get('transactions');
      const voidLogVal = await db.state.get('voidLog');
      const cloudOutboxVal = await db.state.get('cloudOutbox');
      const shiftVal = await db.state.get('shift');
      const promptPayVal = await db.state.get('shopPromptPayId');
      const shopNameVal = await db.state.get('shopName');
      const taglineVal = await db.state.get('shopTagline');
      const addressVal = await db.state.get('shopAddress');
      const phoneVal = await db.state.get('shopPhone');
      const logoVal = await db.state.get('shopLogo');
      const themeVal = await db.state.get('theme');
      const pinVal = await db.state.get('ownerPin');
      const sheetsUrlVal = await db.state.get('googleSheetsUrl');
      const telegramTokenVal = await db.state.get('telegramToken');
      const telegramChatIdVal = await db.state.get('telegramChatId');

      this.state.services = servicesVal ? servicesVal.value : [...DEFAULT_SERVICES];
      this.state.categories = (categoriesVal && Array.isArray(categoriesVal.value) && categoriesVal.value.length) ? categoriesVal.value : [...DEFAULT_CATEGORIES];
      this.state.staff = staffVal ? staffVal.value : [...DEFAULT_STAFF];
      this.state.customers = customersVal ? customersVal.value : [...DEFAULT_CUSTOMERS];
      this.state.queue = queueVal ? queueVal.value : [...DEFAULT_QUEUE];
      this.state.transactions = transactionsVal ? transactionsVal.value : [...DEFAULT_TRANSACTIONS];
      this.state.voidLog = (voidLogVal && Array.isArray(voidLogVal.value)) ? voidLogVal.value : [];
      this.state.cloudOutbox = (cloudOutboxVal && Array.isArray(cloudOutboxVal.value)) ? cloudOutboxVal.value : [];
      this.state.shift = shiftVal ? shiftVal.value : {
        active: false,
        startTime: null,
        startCash: 0,
        startDetails: {},
        expenses: [],
        history: []
      };

      // ซ่อมแซมและตรวจสอบความซ้ำซ้อนของ ID
      let needsSave = false;
      const staffIds = new Set();
      this.state.staff.forEach(s => {
        if (!s.id || staffIds.has(s.id)) {
          let maxNum = 0;
          this.state.staff.forEach(x => {
            const match = (x.id || '').match(/^st(\d+)$/);
            if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
          });
          s.id = `st${maxNum + 1}`;
          needsSave = true;
        }
        staffIds.add(s.id);
      });

      const customerIds = new Set();
      this.state.customers.forEach(c => {
        if (!c.id || customerIds.has(c.id)) {
          let maxNum = 0;
          this.state.customers.forEach(x => {
            const match = (x.id || '').match(/^c(\d+)$/);
            if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
          });
          c.id = `c${maxNum + 1}`;
          needsSave = true;
        }
        customerIds.add(c.id);
      });

      const serviceIds = new Set();
      this.state.services.forEach(s => {
        if (!s.id || serviceIds.has(s.id)) {
          let maxNum = 0;
          this.state.services.forEach(x => {
            const match = (x.id || '').match(/^s(\d+)$/);
            if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
          });
          s.id = `s${maxNum + 1}`;
          needsSave = true;
        }
        serviceIds.add(s.id);
      });

      if (needsSave) {
        await this.saveState();
      }

      // ตรวจสอบความสมบูรณ์ของโครงสร้างกะ
      if (!this.state.shift || typeof this.state.shift !== 'object') {
        this.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
      }
      if (!Array.isArray(this.state.shift.history)) {
        this.state.shift.history = [];
      }
      if (!Array.isArray(this.state.shift.expenses)) {
        this.state.shift.expenses = [];
      }
      if (typeof this.state.shift.active !== 'boolean') {
        this.state.shift.active = false;
      }

      this.shopPromptPayId = promptPayVal ? promptPayVal.value : '';
      this.shopName = shopNameVal ? shopNameVal.value : 'Erotica Barber & Massage';
      this.shopTagline = taglineVal ? taglineVal.value : 'BARBER & MASSAGE';
      this.shopAddress = addressVal ? addressVal.value : '';
      this.shopPhone = phoneVal ? phoneVal.value : '';
      this.shopLogo = logoVal ? logoVal.value : '';
      this.theme = themeVal ? themeVal.value : 'dark';
      this.ownerPin = pinVal ? pinVal.value : '';
      if (!this.ownerPin || (this.ownerPin.length !== 64 && this.ownerPin.length !== 6)) {
        this.ownerPin = await this.hashPin('123456');
        setTimeout(() => this.showToast('รหัส PIN ของเจ้าของร้านชำรุดหรือรูปแบบไม่ถูกต้อง ระบบได้รีเซ็ตกลับเป็น "123456" ชั่วคราว กรุณาเปลี่ยนเพื่อความปลอดภัยในหน้าตั้งค่า', 'warning', 6000), 500);
      } else if (this.ownerPin.length === 6) {
        // Plain text migration to hash
        this.ownerPin = await this.hashPin(this.ownerPin);
        await this.saveState();
      }

      this.googleSheetsUrl = sheetsUrlVal ? sheetsUrlVal.value : '';
      this.telegramToken = telegramTokenVal ? telegramTokenVal.value : '';
      this.telegramChatId = telegramChatIdVal ? telegramChatIdVal.value : '';
      this.currentRole = 'staff';

    } catch (err) {
      console.error('Error loading IndexedDB', err);
      this.state.services = [...DEFAULT_SERVICES];
      this.state.categories = [...DEFAULT_CATEGORIES];
      this.state.staff = [...DEFAULT_STAFF];
      this.state.customers = [...DEFAULT_CUSTOMERS];
      this.state.queue = [...DEFAULT_QUEUE];
      this.state.transactions = [...DEFAULT_TRANSACTIONS];
      this.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
      this.shopPromptPayId = '';
      this.shopName = 'Erotica Barber & Massage';
      this.shopTagline = 'BARBER & MASSAGE';
      this.shopAddress = '';
      this.shopPhone = '';
      this.shopLogo = '';
      this.theme = 'dark';
      this.ownerPin = await this.hashPin('123456');
      this.googleSheetsUrl = '';
      this.telegramToken = '';
      this.telegramChatId = '';
      this.currentRole = 'staff';
      setTimeout(() => this.showToast('เกิดข้อผิดพลาดในการโหลดฐานข้อมูล ระบบเปิดด้วยโหมดสำรองและตั้งค่ารหัสผ่านเป็น "123456" ชั่วคราว', 'error', 6000), 500);
    }
  }

  // Auto-archive: ลบ shift history เก่ากว่า 90 วัน + transactions เก่ากว่า 365 วันที่ synced แล้ว
  archiveOldData() {
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    // ลบ shift history เก่ากว่า 90 วัน
    if (this.state.shift && Array.isArray(this.state.shift.history)) {
      const before = this.state.shift.history.length;
      this.state.shift.history = this.state.shift.history.filter(sh => {
        const ts = sh.endTime || sh.startTime || 0;
        return (now - ts) < ninetyDaysMs;
      });
      if (this.state.shift.history.length < before) {
        console.log(`[Archive] ลบ shift history ${before - this.state.shift.history.length} รายการ (เก่ากว่า 90 วัน)`);
      }
    }

    // ลบ transactions ที่ synced แล้วและเก่ากว่า 365 วัน (ยังเก็บที่ Google Sheets อยู่)
    const beforeTx = this.state.transactions.length;
    this.state.transactions = this.state.transactions.filter(tx => {
      const age = now - (typeof tx.date === 'number' ? tx.date : new Date(tx.date).getTime());
      return tx.syncStatus !== 'synced' || age < oneYearMs;
    });
    if (this.state.transactions.length < beforeTx) {
      console.log(`[Archive] ลบ transactions ${beforeTx - this.state.transactions.length} รายการ (synced + เก่ากว่า 365 วัน)`);
    }

    // ลบประวัติการยกเลิกบิล (voidLog) ที่เก่ากว่า 1 ปี
    if (Array.isArray(this.state.voidLog)) {
      this.state.voidLog = this.state.voidLog.filter(v => (now - (v.date || 0)) < oneYearMs);
    }
  }

  // เซฟข้อมูลลงใน IndexedDB
  async saveState() {
    this.archiveOldData();

    try {
      await db.state.bulkPut([
        { key: 'services', value: this.state.services },
        { key: 'categories', value: this.state.categories },
        { key: 'staff', value: this.state.staff },
        { key: 'customers', value: this.state.customers },
        { key: 'queue', value: this.state.queue },
        { key: 'transactions', value: this.state.transactions },
        { key: 'voidLog', value: this.state.voidLog },
        { key: 'cloudOutbox', value: this.state.cloudOutbox },
        { key: 'shift', value: this.state.shift },
        { key: 'shopPromptPayId', value: this.shopPromptPayId },
        { key: 'shopName', value: this.shopName || 'Erotica Barber & Massage' },
        { key: 'shopTagline', value: this.shopTagline || 'BARBER & MASSAGE' },
        { key: 'shopAddress', value: this.shopAddress || '' },
        { key: 'shopPhone', value: this.shopPhone || '' },
        { key: 'shopLogo', value: this.shopLogo || '' },
        { key: 'theme', value: this.theme || 'dark' },
        { key: 'ownerPin', value: this.ownerPin },
        { key: 'googleSheetsUrl', value: this.googleSheetsUrl },
        { key: 'telegramToken', value: this.telegramToken },
        { key: 'telegramChatId', value: this.telegramChatId }
      ]);
    } catch (e) {
      console.error('IndexedDB save failure!', e);
      this.showToast('บันทึกข้อมูลหน้าร้านล้มเหลว!', 'error');
    }
  }

  // สำรองข้อมูลขึ้น Google Drive
  async autoBackupToGoogleDrive() {
    if (!this.googleSheetsUrl) return;

    const backupData = {
      services: this.state.services,
      categories: this.state.categories,
      staff: this.state.staff,
      customers: this.state.customers,
      queue: this.state.queue,
      transactions: this.state.transactions,
      voidLog: this.state.voidLog || [], // ประวัติการยกเลิกบิล — audit trail ต้องติดไปกับไฟล์สำรองด้วย
      shift: this.state.shift,
      shopPromptPayId: this.shopPromptPayId || '',
      shopName: this.shopName || 'Erotica Barber & Massage',
      shopTagline: this.shopTagline || 'BARBER & MASSAGE',
      shopAddress: this.shopAddress || '',
      shopPhone: this.shopPhone || '',
      shopLogo: this.shopLogo || '',
      theme: this.theme || 'dark',
      // ownerPin is omitted for security since sending it over the network to Apps Script is vulnerable
      googleSheetsUrl: this.googleSheetsUrl || '',
      // telegramToken ถูกตัดออกเพื่อความปลอดภัย (ตั้งค่าใหม่หลัง restore)
      telegramChatId: this.telegramChatId || ''
    };

    const payload = {
      secret: API_SECRET,
      action: 'backup',
      backupData: backupData
    };

    this.showToast('กำลังสำรองข้อมูลไป Google Drive...', 'info');

    try {
      // backup payload ก้อนใหญ่ (ข้อมูลทั้งร้าน) — ให้เวลา 30 วิ มากกว่างานปกติ
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }, 30000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        this.showToast('สำรองข้อมูลขึ้น Google Drive สำเร็จ!', 'success');
        console.log('Google Drive Backup success:', result.details);
      } else {
        throw new Error(result.message || 'คลาวด์แจ้งเตือนข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Auto backup failed:', err);
      this.showToast('สำรองข้อมูลขึ้น Google Drive ล้มเหลว: ' + err.message, 'error');
    }
  }

  // เคลียร์ข้อมูลทั้งหมดในระบบคืนสู่ค่าเดิม
  resetData() {
    this.showConfirm('คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตข้อมูลทั้งหมดกลับสู่ค่าตั้งต้น?', async () => {
      try {
        await db.state.clear();
      } catch (e) { console.error(e); }
      localStorage.clear();
      await this.loadState();
      await this.migratePinIfNeeded();
      this.renderAll();
      this.showToast('คืนค่าเริ่มต้นข้อมูลเรียบร้อยแล้ว!', 'info');
    });
  }

  clearSalesData() {
    this.showConfirm('คุณแน่ใจหรือไม่ว่าต้องการล้างยอดขายและคิวงานทั้งหมด? (รายการพนักงาน บริการ และค่าคอมมิชชั่นที่เพิ่งตั้งค่าจะถูกเก็บไว้)', async () => {
      this.state.transactions = [];
      this.state.queue = [];
      this.state.cart = [];
      this.state.voidLog = [];     // ล้างประวัติ void ของยอดเก่าไปพร้อมกัน
      this.state.cloudOutbox = []; // สำคัญ: ล้างงานคลาวด์ที่ค้าง — ไม่งั้น outbox เก่าจะ flush สรุป "ศูนย์" ไปทับชีตของวันเก่า
      this.state.shift = {
        active: false,
        startTime: null,
        startCash: 0,
        startDetails: {},
        expenses: [],
        history: []
      };
      await this.saveState();
      this.renderAll();
      this.vibrateDevice(100);
      this.showToast('ล้างประวัติยอดขายและคิวงานทั้งหมดเรียบร้อยแล้ว พร้อมใช้งานจริง!', 'info');
      this.openCashCounter('open');
    });
  }

  // จัดการตัวรับอีเวนต์ต่างๆ
  initEventListeners() {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const screenName = item.getAttribute('data-screen');
        this.switchTab(screenName);
      });
    });

    // POS Cart Events
    document.getElementById('btn-clear-cart').addEventListener('click', () => this.clearCart());
    document.getElementById('cart-discount').addEventListener('input', () => this.updateCartTotals());
    document.getElementById('btn-checkout').addEventListener('click', () => this.openCheckoutModal());
    
    // Floating Mobile Cart
    document.getElementById('mobile-cart-trigger').addEventListener('click', () => {
      const cartPanel = document.getElementById('cart-panel');
      cartPanel.scrollIntoView({ behavior: 'smooth' });
    });

    // Forms Submit
    document.getElementById('form-customer').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addCustomer();
    });
    
    document.getElementById('form-staff').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addStaff();
    });
    
    document.getElementById('form-service').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addService();
    });

    // Modal Trigger Buttons in Settings
    document.getElementById('btn-add-customer').addEventListener('click', () => {
      document.getElementById('customer-modal-title').innerText = 'เพิ่มลูกค้าใหม่';
      document.getElementById('form-customer').reset();
      this.openModal('modal-customer');
    });
    document.getElementById('btn-add-customer-quick').addEventListener('click', () => {
      document.getElementById('customer-modal-title').innerText = 'ลงทะเบียนลูกค้าด่วน';
      document.getElementById('form-customer').reset();
      this.openModal('modal-customer');
    });
    document.getElementById('btn-add-staff').addEventListener('click', () => {
      this.state.editingStaffId = null;
      const titleEl = document.getElementById('staff-modal-title');
      if (titleEl) titleEl.innerText = 'เพิ่มพนักงานใหม่';
      document.getElementById('form-staff').reset();
      this.openModal('modal-staff');
    });
    document.getElementById('btn-add-service-modal').addEventListener('click', () => {
      this.state.editingServiceId = null;
      const titleEl = document.getElementById('service-modal-title');
      if (titleEl) titleEl.innerText = 'เพิ่มบริการใหม่';
      document.getElementById('form-service').reset();
      this.populateServiceCategorySelect();
      this.openModal('modal-service');
    });
    // จัดการหมวดหมู่การขาย
    const btnAddCategory = document.getElementById('btn-add-category');
    if (btnAddCategory) btnAddCategory.addEventListener('click', () => this.openCategoryModal(null));
    const formCategory = document.getElementById('form-category');
    if (formCategory) formCategory.addEventListener('submit', (e) => { e.preventDefault(); this.addCategory(); });
    document.getElementById('btn-reset-data').addEventListener('click', () => this.resetData());

    // Customer search bar
    document.getElementById('search-customer').addEventListener('keyup', (e) => {
      this.renderCustomerTable(e.target.value);
    });

    // Cash received inputs
    document.getElementById('cash-received').addEventListener('input', () => this.recalcCashChange());

    // (ช่องรหัส owner-pin-input เดิมถูกถอดออกแล้ว — ใช้ระบบล็อกอินแทน)
  }

  // สลับหน้าจอทำงานหลัก
  switchTab(screenName) {
    // ดักระบบยังไม่เริ่มกะ — ยกเว้น "ตั้งค่า" (owner) และ "รายงาน" (manager ขึ้นไป)
    // เหตุผล: ติดตั้งครั้งแรกต้องเพิ่มพนักงานในหน้าตั้งค่าก่อนถึงจะขายได้
    // ถ้าบล็อกทุกหน้าจนกว่าจะเปิดกะ จะติดกับดักวนลูป (ขายไม่ได้เพราะไม่มีพนักงาน → ตั้งค่าไม่ได้เพราะยังไม่เปิดกะ)
    if (!this.state.shift || !this.state.shift.active) {
      const allowedWithoutShift =
        (screenName === 'settings' && this.currentRole === 'owner') ||
        (screenName === 'reports' && (this.currentRole === 'owner' || this.currentRole === 'manager'));
      if (!allowedWithoutShift) {
        this.openCashCounter('open');
        return;
      }
    }

    // ดักสิทธิ์เข้าถึงหน้าจอตามระดับผู้ใช้
    if (screenName === 'settings' && this.currentRole !== 'owner') {
      this.showToast('หน้าตั้งค่าเข้าถึงได้เฉพาะเจ้าของร้าน', 'warning');
      return;
    }
    if (screenName === 'reports' && !(this.currentRole === 'owner' || this.currentRole === 'manager')) {
      this.showToast('รายงานยอดขายเข้าถึงได้เฉพาะผู้จัดการขึ้นไป', 'warning');
      return;
    }

    this.state.activeScreen = screenName;
    
    // อัปเดต Sidebar active state
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-screen') === screenName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // อัปเดต Bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
      if (el.getAttribute('data-screen') === screenName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // อัปเดตการแสดงผลหน้าต่างย่อย (Screens)
    document.querySelectorAll('.screen').forEach(el => {
      if (el.id === `screen-${screenName}`) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // อัปเดต Render ข้อมูลเมื่อสลับหน้าจอ (กรณีมีการแก้ไข)
    if (screenName === 'dashboard') {
      this.renderDashboard();
    } else if (screenName === 'pos') {
      this.renderPos();
    } else if (screenName === 'queue') {
      this.renderQueueScreen();
    } else if (screenName === 'customers') {
      this.renderCustomerTable();
    } else if (screenName === 'reports') {
      this.renderReports();
    } else if (screenName === 'settings') {
      this.renderSettingsLists();
    }
  }

  // ==================== RENDERS ====================
  
  renderAll() {
    this.renderDashboard();
    this.renderPos();
    this.renderQueueScreen();
    this.renderCustomerTable();
    this.renderReports();
    this.renderSettingsLists();
  }

  renderDashboard() {
    // 1. ตั้งค่าวันที่ภาษาไทย — แสดง "วันทำการ" (หลังเที่ยงคืนก่อนตี 6 ยังนับเป็นคืนเดิม)
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const bizDateLabel = new Date(this.getBusinessTime(Date.now())).toLocaleDateString('th-TH', options);
    const afterMidnight = new Date().getHours() < BUSINESS_DAY_CUTOFF_HOUR;
    document.getElementById('dashboard-date').innerText = bizDateLabel + (afterMidnight ? ' (หลังเที่ยงคืน — ยอดยังนับเป็นคืนนี้)' : '');

    // 1.5 ตั้งค่าคำทักทายแบบพลวัตตามช่วงเวลา
    const hour = new Date().getHours();
    let greeting = 'สวัสดีครับ ยินดีต้อนรับ';
    if (hour >= 5 && hour < 12) {
      greeting = 'อรุณสวัสดิ์ ยินดีต้อนรับ';
    } else if (hour >= 12 && hour < 17) {
      greeting = 'สวัสดีตอนบ่าย ยินดีต้อนรับ';
    } else {
      greeting = 'สวัสดีตอนเย็น ยินดีต้อนรับ';
    }
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) greetingEl.innerText = greeting;

    // กรองรายการธุรกรรมเฉพาะ "วันทำการ" วันนี้ — ตี 1 ยังเห็นยอดทั้งคืนต่อเนื่อง ไม่รีเซ็ตตอนเที่ยงคืน
    const todayStr = this.getBusinessISODate(Date.now());
    const todayTxs = this.state.transactions.filter(tx => {
      return this.getBusinessISODate(tx.date) === todayStr;
    });

    // 2. คำนวณ KPI
    const todayRevenue = todayTxs.reduce((sum, tx) => sum + tx.total, 0);
    const waitingQueue = this.state.queue.filter(q => q.status === 'waiting').length;
    const servingQueue = this.state.queue.filter(q => q.status === 'serving').length;
    const completedQueue = todayTxs.reduce((sum, tx) => sum + tx.services.length, 0);

    document.getElementById('kpi-revenue').innerText = `฿${todayRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    // เทรนด์เทียบยอดขายเมื่อวาน (วันทำการก่อนหน้า)
    const _ydayStr = this.getBusinessISODate(Date.now() - 86400000);
    const _ydayRevenue = this.state.transactions.filter(tx => this.getBusinessISODate(tx.date) === _ydayStr).reduce((s, tx) => s + tx.total, 0);
    const _trendEl = document.getElementById('kpi-revenue-trend');
    if (_trendEl) {
      if (_ydayRevenue > 0) {
        const _pct = ((todayRevenue - _ydayRevenue) / _ydayRevenue) * 100;
        const _up = _pct >= 0;
        _trendEl.className = 'kpi-trend ' + (_up ? 'up' : 'down');
        _trendEl.innerHTML = `<i class="fa-solid fa-arrow-${_up ? 'up' : 'down'}"></i> ${Math.abs(_pct).toFixed(0)}% เทียบเมื่อวาน`;
      } else if (todayRevenue > 0) {
        _trendEl.className = 'kpi-trend up';
        _trendEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> เริ่มขายวันนี้`;
      } else {
        _trendEl.className = 'kpi-trend';
        _trendEl.innerHTML = '';
      }
    }
    document.getElementById('kpi-waiting').innerText = `${waitingQueue} คิว`;
    document.getElementById('kpi-serving').innerText = `${servingQueue} คิว`;
    document.getElementById('kpi-completed').innerText = `${completedQueue} งาน`;

    // 3. แสดงคิวงานปัจจุบันในแดชบอร์ด
    const dbQueueList = document.getElementById('dashboard-queue-list');
    const activeQueue = this.state.queue.filter(q => q.status !== 'completed');

    if (activeQueue.length === 0) {
      dbQueueList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-calendar-check"></i>
          <p>ไม่มีคิวงานที่กำลังรอในขณะนี้</p>
        </div>`;
    } else {
      dbQueueList.innerHTML = activeQueue.map(q => {
        const statusText = q.status === 'serving' ? 'กำลังให้บริการ' : 'รอรับบริการ';
        const badgeColor = q.status === 'serving' ? 'teal' : 'gold';
        return `
          <div class="activity-item">
            <div class="activity-details">
              <span class="title">${escapeHtml(q.customerName)}</span>
              <span class="desc">${q.services.map(s => `${escapeHtml(s.name)} (${escapeHtml(s.staffName)})`).join(', ')}</span>
            </div>
            <span class="activity-value ${badgeColor}">${statusText}</span>
          </div>`;
      }).join('');
    }

    // 4. แสดงรายการขายล่าสุด
    const salesList = document.getElementById('recent-sales-list');
    if (todayTxs.length === 0) {
      salesList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-receipt"></i>
          <p>ยังไม่มีรายการขายในวันนี้</p>
        </div>`;
    } else {
      const recentTxs = [...todayTxs].reverse().slice(0, 5); // ล่าสุด 5 รายการของวันนี้
      salesList.innerHTML = recentTxs.map(tx => {
        const timeStr = new Date(tx.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="activity-item">
            <div class="activity-details">
              <span class="title">${escapeHtml(tx.customerName)}</span>
              <span class="desc">${timeStr} น. • ${tx.services.length} บริการ • ชำระผ่าน ${tx.paymentMethod === 'promptpay' ? 'Scan' : tx.paymentMethod === 'credit' ? 'Credit' : 'เงินสด'}</span>
            </div>
            <span class="activity-value" style="color: var(--color-success);">฿${tx.total}</span>
          </div>`;
      }).join('');
    }

    // 5. แสดงอันดับบริการยอดนิยมวันนี้
    const todayServices = {};

    todayTxs.forEach(tx => {
      tx.services.forEach(name => {
        todayServices[name] = (todayServices[name] || 0) + 1;
      });
    });

    const popularList = Object.entries(todayServices).map(([name, count]) => {
      const matched = this.state.services.find(s => s.name === name);
      return {
        name,
        count,
        category: matched ? matched.category : 'ทั่วไป'
      };
    }).sort((a, b) => b.count - a.count);

    const maxCount = popularList.length > 0 ? popularList[0].count : 1;

    const popularContainer = document.getElementById('dashboard-popular-services');
    if (popularContainer) {
      if (popularList.length === 0) {
        popularContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; padding: 1.5rem 0;">
            <i class="fa-solid fa-fire-flame-simple" style="font-size: 1.8rem; color: rgba(255, 255, 255, 0.05);"></i>
            <p>ยังไม่มีข้อมูลบริการยอดนิยมสำหรับวันนี้</p>
          </div>`;
      } else {
        popularContainer.innerHTML = popularList.map(item => {
          const pct = Math.floor((item.count / maxCount) * 100);
          let barClass = 'general-bar';
          if (item.category === 'barber') barClass = 'barber-bar';
          else if (item.category === 'massage') barClass = 'massage-bar';
          else if (item.category === 'premium') barClass = 'premium-bar';

          return `
            <div class="popular-service-item">
              <div class="popular-service-info">
                <span class="popular-service-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                <span class="popular-service-count">${item.count} ครั้ง</span>
              </div>
              <div class="popular-service-bar-container">
                <div class="popular-service-bar ${barClass}" style="width: ${pct}%;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
    // 6. แสดงรายการค่าใช้จ่ายรายวัน
    const expStaffSelect = document.getElementById('expense-staff-id');
    if (expStaffSelect) {
      expStaffSelect.innerHTML = this.state.staff.map(st => `<option value="${st.id}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`).join('');
    }

    const expenseList = document.getElementById('expense-list');
    const expenseTotalLabel = document.getElementById('expense-total-label');
    const expenses = this.state.shift.expenses || [];
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    if (expenseTotalLabel) {
      expenseTotalLabel.innerText = `รวม: ฿${totalExpenses.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    }
    
    if (expenseList) {
      if (expenses.length === 0) {
        expenseList.innerHTML = `
          <div class="empty-state" style="padding: 10px 0;">
            <p style="font-size: 0.8rem; color: var(--text-muted);">ไม่มีรายการค่าใช้จ่ายวันนี้</p>
          </div>
        `;
      } else {
        expenseList.innerHTML = expenses.map(e => {
          const timeStr = new Date(e.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="activity-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 4px;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 0.85rem; font-weight: 600;">${escapeHtml(e.note)}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr} น.</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--accent-premium);">฿${e.amount.toLocaleString('th-TH')}</span>
                <button type="button" class="btn-icon" onclick="app.deleteExpense('${e.id}')" style="background: none; border: none; color: var(--accent-premium); cursor: pointer; padding: 4px;">
                  <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const expForm = document.getElementById('form-add-expense');
    if (expForm) {
      if (!this.state.shift.active) {
        expForm.style.opacity = '0.5';
        expForm.style.pointerEvents = 'none';
      } else {
        expForm.style.opacity = '1';
        expForm.style.pointerEvents = 'auto';
      }
    }

    this.checkSyncStatus(); // อัปเดตสถานะการซิงก์ข้อมูลบน Badge
  }

  renderPos() {
    // 1. Render Category Tabs
    const tabsContainer = document.getElementById('category-tabs');
    const categories = [
      { id: 'all', name: 'ทั้งหมด', icon: 'fa-cubes' },
      ...this.state.categories.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon || 'fa-tag',
        tabClass: c.id === 'barber' ? 'barber-tab' : (c.id === 'massage' ? 'massage-tab' : '')
      }))
    ];

    tabsContainer.innerHTML = categories.map(cat => {
      const activeClass = this.state.selectedCategory === cat.id ? 'active' : '';
      const tabClass = cat.tabClass || '';
      const count = cat.id === 'all'
        ? this.state.services.length
        : this.state.services.filter(s => s.category === cat.id).length;
      return `
        <button class="tab-btn ${activeClass} ${tabClass}" onclick="app.selectPosCategory('${cat.id}')">
          <i class="fa-solid ${escapeHtml(cat.icon)}"></i> ${escapeHtml(cat.name)} <span class="tab-count">${count}</span>
        </button>
      `;
    }).join('');

    // 2. Render Services Grid
    const servicesGrid = document.getElementById('services-grid');
    let filteredServices = this.state.selectedCategory === 'all' 
      ? this.state.services 
      : this.state.services.filter(s => s.category === this.state.selectedCategory);
    const _q = (this.state.serviceSearch || '').trim().toLowerCase();
    if (_q) filteredServices = filteredServices.filter(s => (s.name || '').toLowerCase().includes(_q));

    if (filteredServices.length === 0) {
      servicesGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-box-open"></i>
          <p>ไม่พบรายการบริการในหมวดหมู่นี้</p>
        </div>`;
    } else {
      servicesGrid.innerHTML = filteredServices.map(s => {
        const cat = this.state.categories.find(c => c.id === s.category);
        let cardClass = 'barber-service';
        if (s.category === 'massage') cardClass = 'massage-service';
        else if (s.category === 'premium') cardClass = 'premium-service';
        const iconClass = (cat && cat.icon) ? cat.icon : 'fa-scissors';

        return `
          <div class="service-card ${cardClass}" onclick="app.addToCart('${s.id}')">
            <div class="service-card-icon">
              <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="service-info">
              <span class="service-name">${escapeHtml(s.name)}</span>
              <span class="service-duration">
                <i class="fa-regular fa-clock"></i> ${s.duration} นาที
              </span>
            </div>
            <div class="service-price">฿${s.price.toLocaleString('th-TH')}</div>
          </div>
        `;
      }).join('');
    }

    // 3. Render Customer Select Options in Cart
    const custSelect = document.getElementById('cart-customer-select');
    // Save current selection
    const currentVal = custSelect.value;
    
    let optionsHtml = `
      <option value="">ลูกค้าทั่วไป (Walk-in)</option>
      <option value="google">ลูกค้าทั่วไป (Google)</option>
      <option value="returning">ลูกค้าเก่า</option>
    `;
    this.state.customers.forEach(c => {
      optionsHtml += `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.phone)})</option>`;
    });
    custSelect.innerHTML = optionsHtml;
    custSelect.value = currentVal;

    // 4. Update the actual Cart representation
    this.renderCart();
  }

  selectPosCategory(catId) {
    this.state.selectedCategory = catId;
    this.renderPos();
  }

  // คิวงานหน้าเต็ม
  renderQueueScreen() {
    const queueWaitingList = document.getElementById('queue-waiting-list');
    const queueServingList = document.getElementById('queue-serving-list');
    
    const waitingItems = this.state.queue.filter(q => q.status === 'waiting');
    const servingItems = this.state.queue.filter(q => q.status === 'serving');

    document.getElementById('count-waiting').innerText = waitingItems.length;
    document.getElementById('count-serving').innerText = servingItems.length;

    // Render Waiting Queue
    if (waitingItems.length === 0) {
      queueWaitingList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-bed"></i>
          <p>ไม่มีคิวรอรับบริการ</p>
        </div>`;
    } else {
      queueWaitingList.innerHTML = waitingItems.map(q => {
        const totalMin = q.totalDuration;
        return `
          <div class="queue-card waiting">
            <div class="queue-card-top">
              <span class="queue-customer">${escapeHtml(q.customerName)}</span>
              <span class="queue-time"><i class="fa-regular fa-clock"></i> รอประมาณ ${totalMin} นาที</span>
            </div>
            <div>
              ${q.services.map(s => `
                <div style="margin-bottom: 4px;">
                  <span class="queue-service-badge"><i class="fa-solid fa-scissors" style="margin-right: 4px;"></i> ${escapeHtml(s.name)}</span>
                  <span class="queue-staff-info"><i class="fa-solid fa-user-circle"></i> พนักงาน: ${escapeHtml(s.staffName)}</span>
                </div>
              `).join('')}
            </div>
            <div class="queue-actions">
              <button class="btn-small danger" onclick="app.removeQueue('${q.id}')">ยกเลิกคิว</button>
              <button class="btn-small primary" onclick="app.startQueue('${q.id}')">เริ่มบริการ <i class="fa-solid fa-play"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }

    // Render Serving Queue
    if (servingItems.length === 0) {
      queueServingList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-sparkles"></i>
          <p>ไม่มีคิวที่กำลังให้บริการอยู่ในขณะนี้</p>
        </div>`;
    } else {
      queueServingList.innerHTML = servingItems.map(q => {
        const minutesElapsed = Math.floor((Date.now() - q.startTime) / 60000);
        const percent = Math.min(100, Math.floor((minutesElapsed / q.totalDuration) * 100));
        
        return `
          <div class="queue-card serving" id="queue-card-${q.id}" data-start="${q.startTime}" data-duration="${q.totalDuration}">
            <div class="queue-card-top">
              <span class="queue-customer">${escapeHtml(q.customerName)}</span>
              <span class="queue-time" id="time-elapsed-${q.id}">ให้บริการไปแล้ว ${minutesElapsed}/${q.totalDuration} นาที</span>
            </div>
            <div>
              ${q.services.map(s => `
                <div style="margin-bottom: 4px;">
                  <span class="queue-service-badge"><i class="fa-solid fa-spa" style="margin-right: 4px; color: var(--accent-massage);"></i> ${escapeHtml(s.name)}</span>
                  <span class="queue-staff-info"><i class="fa-solid fa-user-circle"></i> พนักงาน: ${escapeHtml(s.staffName)}</span>
                </div>
              `).join('')}
            </div>
            <div class="queue-progress-bar">
              <div class="queue-progress" id="progress-bar-${q.id}" style="width: ${percent}%;"></div>
            </div>
            <div class="queue-actions">
              <button class="btn-small secondary" onclick="app.completeQueue('${q.id}')">เสร็จสิ้นงาน <i class="fa-solid fa-check"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // อัปเดตแถบความก้าวหน้าคิวงานแบบสด
  updateQueueProgress() {
    if (this.state.activeScreen !== 'queue' && this.state.activeScreen !== 'dashboard') return;

    const servingCards = document.querySelectorAll('.queue-card.serving');
    servingCards.forEach(card => {
      const qId = card.id.replace('queue-card-', '');
      const startTime = parseInt(card.getAttribute('data-start'));
      const duration = parseInt(card.getAttribute('data-duration'));
      
      const secondsElapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutesElapsed = Math.floor(secondsElapsed / 60);
      
      const percent = Math.min(100, Math.floor((minutesElapsed / duration) * 100));
      
      const timeEl = document.getElementById(`time-elapsed-${qId}`);
      const progressEl = document.getElementById(`progress-bar-${qId}`);
      
      if (timeEl) {
        timeEl.innerText = `ให้บริการไปแล้ว ${minutesElapsed}/${duration} นาที`;
      }
      if (progressEl) {
        progressEl.style.width = `${percent}%`;
      }
    });
  }

  // ตารางจัดเก็บข้อมูลลูกค้า
  renderCustomerTable(filterText = '') {
    const tableBody = document.getElementById('customer-table-body');
    // Guard ทุก field — ลูกค้าจากไฟล์ backup ที่ field หาย (เช่นไม่มีเบอร์) เคยทำ TypeError
    // แล้วตารางพังว่างเปล่าทั้งหน้า ไม่ใช่แค่แถวเดียว
    const q = (filterText || '').toLowerCase();
    const filtered = this.state.customers.filter(c => {
      return String(c.name || '').toLowerCase().includes(q) ||
             String(c.phone || '').includes(filterText || '');
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state" style="text-align: center;">
            <i class="fa-solid fa-users-slash" style="display:block; margin: 10px 0;"></i> ไม่พบข้อมูลลูกค้าที่ค้นหา
          </td>
        </tr>`;
    } else {
      tableBody.innerHTML = filtered.map(c => `
        <tr>
          <td><strong>${String(c.id || '-').toUpperCase()}</strong></td>
          <td>${escapeHtml(c.name || '-')}</td>
          <td>${escapeHtml(c.phone || '-')}</td>
          <td>${c.visitCount || 0} ครั้ง</td>
          <td><span style="color: var(--accent-barber); font-weight:600;">${escapeHtml(c.tier || 'ทั่วไป (General)')}</span></td>
          <td>
            <div class="customer-actions">
              <button class="btn-small secondary" onclick="app.editCustomerNote('${c.id}')"><i class="fa-solid fa-edit"></i> โน้ตย่อ</button>
              <button class="btn-small danger" onclick="app.deleteCustomer('${c.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  // หน้าตั้งค่าร้านค้า พนักงานและบริการ
  // ==================== CATEGORY MANAGEMENT ====================
  renderCategoryList() {
    const list = document.getElementById('settings-categories-list');
    if (!list) return;
    if (!this.state.categories || this.state.categories.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:16px;"><p>ยังไม่มีหมวดหมู่ — กดปุ่มเพิ่มหมวดหมู่</p></div>`;
      return;
    }
    list.innerHTML = this.state.categories.map(c => {
      const count = this.state.services.filter(s => s.category === c.id).length;
      return `
        <div class="settings-list-item">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="kpi-icon gold" style="width: 42px; height: 42px; border-radius: var(--border-radius-md); display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
              <i class="fa-solid ${escapeHtml(c.icon || 'fa-tag')}"></i>
            </div>
            <div class="settings-list-item-info">
              <span class="title" style="font-weight: 600;">${escapeHtml(c.name)}</span>
              <span class="desc">${count} บริการในหมวดนี้</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-small secondary" onclick="app.editCategory('${c.id}')">แก้ไข</button>
            <button class="btn-small danger" onclick="app.deleteCategory('${c.id}')">ลบ</button>
          </div>
        </div>
      `;
    }).join('');
  }

  getCategoryIconOptions(selected) {
    const icons = ['fa-tag','fa-scissors','fa-spa','fa-gem','fa-store','fa-star','fa-heart','fa-cut','fa-soap','fa-wine-glass','fa-mug-hot','fa-hand-sparkles'];
    return icons.map(ic => `<option value="${ic}" ${ic === selected ? 'selected' : ''}>${ic.replace('fa-','')}</option>`).join('');
  }

  // เติมตัวเลือกหมวดหมู่ใน dropdown ของฟอร์มบริการให้ตรงกับหมวดที่ตั้งไว้
  populateServiceCategorySelect() {
    const sel = document.getElementById('serv-category');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = (this.state.categories || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (cur && this.state.categories.some(c => c.id === cur)) sel.value = cur;
  }

  openCategoryModal(catId) {
    this.state.editingCategoryId = catId || null;
    const titleEl = document.getElementById('category-modal-title');
    const nameInput = document.getElementById('cat-name');
    const iconSel = document.getElementById('cat-icon');
    let selectedIcon = 'fa-tag', name = '';
    if (catId) {
      const c = this.state.categories.find(x => x.id === catId);
      if (c) { name = c.name; selectedIcon = c.icon || 'fa-tag'; }
      if (titleEl) titleEl.innerText = 'แก้ไขหมวดหมู่';
    } else {
      if (titleEl) titleEl.innerText = 'เพิ่มหมวดหมู่ใหม่';
    }
    if (nameInput) nameInput.value = name;
    if (iconSel) iconSel.innerHTML = this.getCategoryIconOptions(selectedIcon);
    this.openModal('modal-category');
  }

  editCategory(catId) { this.openCategoryModal(catId); }

  async addCategory() {
    const nameInput = document.getElementById('cat-name');
    const iconSel = document.getElementById('cat-icon');
    const name = (nameInput ? nameInput.value : '').trim();
    const icon = (iconSel ? iconSel.value : 'fa-tag') || 'fa-tag';
    if (!name) { this.showToast('กรุณากรอกชื่อหมวดหมู่', 'warning'); if (nameInput) nameInput.focus(); return; }
    const dup = this.state.categories.find(c => c.name.trim() === name && c.id !== this.state.editingCategoryId);
    if (dup) { this.showToast('มีหมวดหมู่ชื่อนี้อยู่แล้ว', 'warning'); return; }
    if (this.state.editingCategoryId) {
      const c = this.state.categories.find(x => x.id === this.state.editingCategoryId);
      if (c) { c.name = name; c.icon = icon; }
      this.state.editingCategoryId = null;
    } else {
      this.state.categories.push({ id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, name, icon });
    }
    await this.saveState();
    this.closeModal('modal-category');
    this.renderCategoryList();
    this.renderPos();
    this.renderSettingsLists();
    this.showToast('บันทึกหมวดหมู่เรียบร้อยแล้ว', 'success');
  }

  deleteCategory(catId) {
    const inUse = this.state.services.filter(s => s.category === catId).length;
    if (inUse > 0) {
      this.showToast(`ลบไม่ได้ — ยังมี ${inUse} บริการในหมวดนี้ กรุณาย้ายหรือลบบริการในหมวดนี้ก่อน`, 'warning');
      return;
    }
    this.showConfirm('ยืนยันลบหมวดหมู่นี้ใช่หรือไม่?', async () => {
      this.state.categories = this.state.categories.filter(c => c.id !== catId);
      if (this.state.selectedCategory === catId) this.state.selectedCategory = 'all';
      await this.saveState();
      this.renderCategoryList();
      this.renderPos();
      this.renderSettingsLists();
      this.showToast('ลบหมวดหมู่แล้ว', 'info');
    });
  }

  renderSettingsLists() {
    this.renderCategoryList();
    // 1. รายชื่อพนักงาน
    const staffList = document.getElementById('settings-staff-list');
    staffList.innerHTML = this.state.staff.map(s => `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="title">${escapeHtml(s.name)}</span>
          <span class="desc">${escapeHtml(s.role)} • ${this.roleLabel(s.accessLevel || 'staff')}${s.pin ? '' : ' (ยังไม่ตั้ง PIN)'} • ${s.active ? 'พร้อมทำงาน' : 'พักร้อน'}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-small secondary" onclick="app.editStaff('${s.id}')">แก้ไข</button>
          <button class="btn-small danger" onclick="app.deleteStaff('${s.id}')">ลบ</button>
        </div>
      </div>
    `).join('');

    // 2. รายการบริการ
    const servicesList = document.getElementById('settings-services-list');
    servicesList.innerHTML = this.state.services.map(s => {
      const cat = this.state.categories.find(c => c.id === s.category);
      const typeText = cat ? cat.name : (s.category || 'ไม่ระบุ');
      let iconClass = (cat && cat.icon) ? cat.icon : 'fa-scissors';
      let badgeColorClass = s.category === 'massage' ? 'teal' : (s.category === 'premium' ? 'rose' : 'gold');
      return `
        <div class="settings-list-item">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="kpi-icon ${badgeColorClass}" style="width: 42px; height: 42px; border-radius: var(--border-radius-md); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
              <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="settings-list-item-info">
              <span class="title" style="font-weight: 600;">${escapeHtml(s.name)}</span>
              <span class="desc">หมวดหมู่: ${typeText} • ฿${s.price} • ${s.duration} นาที • ค่าคอม ${s.commission || 0}${s.commissionType === 'fixed' ? '฿' : '%'}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-small secondary" onclick="app.editService('${s.id}')">แก้ไข</button>
            <button class="btn-small danger" onclick="app.deleteService('${s.id}')">ลบ</button>
          </div>
        </div>
      `;
    }).join('');

    // 3. แสดงหมายเลขพร้อมเพย์ปัจจุบัน
    const promptPayInput = document.getElementById('shop-promptpay-id');
    if (promptPayInput) {
      promptPayInput.value = this.shopPromptPayId || '';
    }

    // แสดงชื่อร้านปัจจุบัน
    const shopNameInput = document.getElementById('shop-name-input');
    if (shopNameInput) {
      shopNameInput.value = this.shopName || 'Erotica Barber & Massage';
    }
    const shopTaglineInput = document.getElementById('shop-tagline-input');
    if (shopTaglineInput) {
      shopTaglineInput.value = this.shopTagline || 'BARBER & MASSAGE';
    }
    const shopAddressInput = document.getElementById('shop-address-input');
    if (shopAddressInput) {
      shopAddressInput.value = this.shopAddress || '';
    }
    const shopPhoneInput = document.getElementById('shop-phone-input');
    if (shopPhoneInput) {
      shopPhoneInput.value = this.shopPhone || '';
    }
    this.updateLogoPreview();

    // 4. แสดง URL Google Sheets ปัจจุบัน
    const sheetsUrlInput = document.getElementById('shop-sheets-sync-url');
    if (sheetsUrlInput) {
      sheetsUrlInput.value = this.googleSheetsUrl || '';
    }

    // 5. แสดงโทเค็นและไอดีแชท Telegram ปัจจุบัน
    const telegramTokenInput = document.getElementById('shop-telegram-token');
    if (telegramTokenInput) {
      telegramTokenInput.value = this.telegramToken || '';
    }
    const telegramChatIdInput = document.getElementById('shop-telegram-chatid');
    if (telegramChatIdInput) {
      telegramChatIdInput.value = this.telegramChatId || '';
    }

    // อัปเดตรายละเอียดบิลค้างซิงก์ในหน้าตั้งค่า
    this.checkSyncStatus();
  }

  // ==================== CART ACTIONS ====================

  addToCart(serviceId) {
    const service = this.state.services.find(s => s.id === serviceId);
    if (!service) return;

    // ยังไม่มีพนักงานในระบบ = ออกบิลไม่ได้ (บิลจะไม่มีผู้ให้บริการ/ค่าคอมผูกไม่ได้) — บังคับตั้งค่าก่อน
    if (this.state.staff.length === 0) {
      this.showToast('ยังไม่มีพนักงานในระบบ — ไปที่ ตั้งค่า → เพิ่มพนักงาน ก่อนเริ่มขาย', 'warning', 4500);
      return;
    }

    // หาพนักงานคนแรกที่มีอยู่เป็นพนักงานตั้งต้นให้ในตะกร้า
    const defaultStaff = this.state.staff[0];

    this.state.cart.push({
      uniqueCartId: Date.now() + Math.random().toString(36).substr(2, 5), // รหัสจำลองไอเท็มในคาร์ท
      id: service.id,
      name: service.name,
      price: service.price,
      duration: service.duration,
      commission: service.commission || 0,
      commissionType: service.commissionType || 'percent',
      staffId: defaultStaff.id,
      staffName: defaultStaff.name
    });

    this.renderCart();
    this.vibrateDevice(50); // สั่นโทรศัพท์เบาๆ เมื่อใส่ของลงตะกร้า (ถ้าสั่นได้)
  }

  removeFromCart(uniqueCartId) {
    this.state.cart = this.state.cart.filter(item => item.uniqueCartId !== uniqueCartId);
    this.renderCart();
  }

  clearCart() {
    this.state.cart = [];
    // รีเซ็ตช่องส่วนลดพร้อมตะกร้า — เดิมค่าค้างใน DOM แล้วถูกอ่านไปคิดบิลถัดไป (โดนลดซ้ำโดยไม่มีใครสั่ง)
    const discountInput = document.getElementById('cart-discount');
    if (discountInput) discountInput.value = 0;
    this.renderCart();
  }

  // เลือกพนักงานสำหรับบริการในตะกร้าโดยเฉพาะ
  changeItemStaff(uniqueCartId, staffId) {
    const item = this.state.cart.find(i => i.uniqueCartId === uniqueCartId);
    const staffMember = this.state.staff.find(st => st.id === staffId);
    if (item && staffMember) {
      item.staffId = staffMember.id;
      item.staffName = staffMember.name;
    }
  }

  renderCart() {
    const cartList = document.getElementById('cart-items-list');
    const countBadge = document.getElementById('cart-count');
    const mobCountBadge = document.getElementById('mobile-cart-badge');

    countBadge.innerText = this.state.cart.length;
    mobCountBadge.innerText = this.state.cart.length;

    if (this.state.cart.length === 0) {
      cartList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-shopping-cart"></i>
          <p>เลือกบริการด้านซ้ายเพื่อเริ่มออกบิล</p>
        </div>`;
      document.getElementById('btn-checkout').disabled = true;
    } else {
      document.getElementById('btn-checkout').disabled = false;

      // สร้างตัวเลือกรายชื่อพนักงานสำหรับใส่ในกล่อง Dropdown ของตะกร้าสินค้า
      const staffOptions = this.state.staff.map(st => 
        `<option value="${st.id}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`
      ).join('');

      cartList.innerHTML = this.state.cart.map(item => `
        <div class="cart-item">
          <div class="cart-item-header">
            <div class="cart-item-info">
              <div class="cart-item-name">${escapeHtml(item.name)}</div>
              <div class="cart-item-price">฿${item.price}</div>
            </div>
            <button class="remove-item-btn" onclick="app.removeFromCart('${item.uniqueCartId}')">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="cart-item-staff">
            <i class="fa-solid fa-user-circle"></i> ผู้ให้บริการ: 
            <select onchange="app.changeItemStaff('${item.uniqueCartId}', this.value)">
              ${this.state.staff.map(st => `
                <option value="${st.id}" ${st.id === item.staffId ? 'selected' : ''}>${escapeHtml(st.name)}</option>
              `).join('')}
            </select>
          </div>
        </div>
      `).join('');
    }

    this.updateCartTotals();
  }

  // คำนวณราคาทั้งหมดในตะกร้า
  getCartSubtotal() {
    return this.state.cart.reduce((sum, item) => sum + item.price, 0);
  }

  // อ่านส่วนลดจากช่องกรอกแบบปลอดภัย — clamp ให้อยู่ใน [0, subtotal]
  // (input min="0" กันแค่ปุ่ม spinner — พิมพ์ค่าติดลบเองได้ ถ้าไม่ clamp ยอดจะบวมเกินจริง)
  getCartDiscount(subtotal) {
    const discountInput = document.getElementById('cart-discount');
    const raw = parseFloat(discountInput ? discountInput.value : 0) || 0;
    return Math.min(Math.max(0, raw), subtotal);
  }

  getCartTotal() {
    const subtotal = this.getCartSubtotal();
    return Math.max(0, subtotal - this.getCartDiscount(subtotal));
  }

  // กระจายส่วนลดตามสัดส่วนราคา + เกลี่ยเศษสตางค์ (largest remainder)
  // การันตี: ผลรวม netPrice = subtotal - discount เป๊ะ (ไม่มีเศษ ±0.01 หลุดไปรายงาน/ค่าคอม)
  distributeDiscount(prices, subtotal, discount) {
    const total = Math.round(Math.max(0, subtotal - discount) * 100) / 100;
    const nets = prices.map(p => subtotal > 0
      ? Math.round(Math.max(0, p - discount * (p / subtotal)) * 100) / 100
      : p);
    const sum = Math.round(nets.reduce((s, n) => s + n, 0) * 100) / 100;
    const diff = Math.round((total - sum) * 100) / 100;
    if (diff !== 0 && nets.length > 0) {
      // ปรับเศษที่รายการราคาสูงสุด (มีที่ว่างพอ ไม่ทำให้ติดลบ)
      let idx = 0;
      for (let i = 1; i < nets.length; i++) if (nets[i] > nets[idx]) idx = i;
      nets[idx] = Math.round(Math.max(0, nets[idx] + diff) * 100) / 100;
    }
    return nets;
  }

  updateCartTotals() {
    const subtotal = this.getCartSubtotal();
    const total = this.getCartTotal();

    document.getElementById('summary-subtotal').innerText = `฿${subtotal.toLocaleString('th-TH')}`;
    document.getElementById('summary-total').innerText = `฿${total.toLocaleString('th-TH')}`;
  }

  // ==================== CHECKOUT AND PAYMENT ====================

  openCheckoutModal() {
    if (this.state.cart.length === 0) return;
    // กันออกบิลโดยไม่เปิดกะ (ยอดเงินสดจะไม่เข้าการนับลิ้นชัก) — เผื่อหลุดมาหน้าขายทางอื่น
    if (!this.state.shift || !this.state.shift.active) {
      this.showToast('ยังไม่ได้เปิดกะ — กรุณานับเงินตั้งต้นเปิดกะก่อนออกบิล', 'warning', 4000);
      this.openCashCounter('open');
      return;
    }
    if (this.state.staff.length === 0) {
      this.showToast('ยังไม่มีพนักงานในระบบ — เพิ่มพนักงานในหน้าตั้งค่าก่อนออกบิล', 'warning', 4500);
      return;
    }

    // ตั้งค่าบิลเริ่มต้นในป๊อปอัป
    const total = this.getCartTotal();
    this.selectPaymentMethod(null); // ยกเลิกการเลือกช่องทางจ่ายเงินเดิมก่อน
    
    this.openModal('modal-payment');
  }

  selectPaymentMethod(method) {
    this.state.selectedPaymentMethod = method;
    
    const cashBtn = document.getElementById('pay-cash-btn');
    const creditBtn = document.getElementById('pay-credit-btn');
    const qrBtn = document.getElementById('pay-qr-btn');
    const cashPanel = document.getElementById('payment-cash-panel');
    const creditPanel = document.getElementById('payment-credit-panel');
    const qrPanel = document.getElementById('payment-qr-panel');
    const completeBtn = document.getElementById('btn-complete-checkout');
    
    // Reset inputs
    document.getElementById('cash-received').value = '';
    document.getElementById('cash-change').innerText = '฿0.00';
    document.getElementById('cash-change').style.color = 'var(--accent-massage)';

    // Reset styles
    cashBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    cashBtn.style.borderColor = 'var(--border-color)';
    if (creditBtn) {
      creditBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      creditBtn.style.borderColor = 'var(--border-color)';
    }
    qrBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    qrBtn.style.borderColor = 'var(--border-color)';

    cashPanel.style.display = 'none';
    if (creditPanel) creditPanel.style.display = 'none';
    qrPanel.style.display = 'none';
    completeBtn.disabled = true;

    if (method === 'cash') {
      cashBtn.style.background = 'var(--accent-barber-glow)';
      cashBtn.style.borderColor = 'var(--accent-barber)';
      cashPanel.style.display = 'block';
      // สำหรับเงินสด ปุ่มจะใช้งานได้ต่อเมื่อกรอกเงินครบ
    } else if (method === 'credit') {
      if (creditBtn) {
        creditBtn.style.background = 'var(--accent-premium-glow)';
        creditBtn.style.borderColor = 'var(--accent-premium)';
      }
      if (creditPanel) {
        creditPanel.style.display = 'block';
        const total = this.getCartTotal();
        document.getElementById('credit-total-label').innerText = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      completeBtn.disabled = false; // จำลองรูดบัตรเครดิตผ่านทันที
    } else if (method === 'promptpay') {
      qrBtn.style.background = 'var(--accent-massage-glow)';
      qrBtn.style.borderColor = 'var(--accent-massage)';
      qrPanel.style.display = 'block';
      completeBtn.disabled = false; // สแกนคิวอาร์สามารถกดผ่านได้เลยทันที (จำลอง)

      // แสดง QR Code สำหรับ PromptPay
      this.generatePromptPayQR();
    }
  }

  // สร้าง QR Code PromptPay มาตรฐาน EMVCo จากเลขพร้อมเพย์ของร้าน (สแกนจ่ายได้จริง + ฝังยอดเงิน)
  generatePromptPayQR() {
    const total = this.getCartTotal();
    const shopPP = (this.shopPromptPayId || '').replace(/[^0-9]/g, '');
    const qrBox = document.getElementById('dynamic-qr-box');
    const ppCompleteBtn = document.getElementById('btn-complete-checkout');

    // ⚠️ กันเงินวิ่งเข้าบัญชีผิด — ถ้ายังไม่ตั้งเลขพร้อมเพย์ที่ถูกต้อง ห้ามสร้าง QR เด็ดขาด
    // รูปแบบที่ยอมรับ: เบอร์มือถือ 10 หลัก (ขึ้นต้น 0), เลขบัตรประชาชน 13 หลัก, e-Wallet 15 หลัก
    if (!/^(0\d{9}|\d{13}|\d{15})$/.test(shopPP)) {
      const lbl = document.getElementById('qr-total-label');
      if (lbl) lbl.innerHTML = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      if (qrBox) qrBox.innerHTML = `<div style="padding:24px 12px;text-align:center;color:#b91c1c;font-size:0.85rem;line-height:1.6;">⚠️ ยังไม่ได้ตั้งเลขพร้อมเพย์ของร้าน<br><span style="color:#64748b;font-size:0.78rem;">ไปที่ ตั้งค่า → เลขพร้อมเพย์ ก่อนรับชำระด้วย QR<br>(กันเงินลูกค้าโอนผิดบัญชี)</span></div>`;
      if (ppCompleteBtn) ppCompleteBtn.disabled = true;
      this.showToast('ยังไม่ได้ตั้งเลขพร้อมเพย์ของร้าน — ตั้งค่าก่อนรับเงินผ่าน QR', 'warning', 4000);
      return;
    }

    // จัดรูปแบบให้สวยงาม เช่น 081-234-5678 หรือ 1-2345-67890-12-3
    let formattedPP = shopPP;
    if (shopPP.length === 10) {
      formattedPP = `${shopPP.slice(0, 3)}-${shopPP.slice(3, 6)}-${shopPP.slice(6)}`;
    } else if (shopPP.length === 13) {
      formattedPP = `${shopPP.slice(0, 1)}-${shopPP.slice(1, 5)}-${shopPP.slice(5, 10)}-${shopPP.slice(10, 12)}-${shopPP.slice(12)}`;
    }

    document.getElementById('qr-total-label').innerHTML = `
      ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}<br>
      <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); margin-top: 4px; display: inline-block;">
        พร้อมเพย์ร้าน: ${formattedPP}
      </span>
    `;

    // สร้าง QR Code PromptPay มาตรฐาน EMVCo จริง (สแกนจ่ายได้ด้วยแอปธนาคาร)
    try {
      if (!window.PromptPayQR) throw new Error('ไม่พบไลบรารีสร้าง QR (promptpay-qr.js)');
      const payload = window.PromptPayQR.buildPayload(shopPP, total > 0 ? total : null);
      this.lastPromptPayPayload = payload; // เก็บไว้เผื่อดีบัก/คัดลอก

      // สร้าง matrix (ลอง EC M ก่อน — กู้คืนดีกว่า; ถ้ามีปัญหา fallback เป็น L)
      let m;
      try { m = window.PromptPayQR.generateMatrix(payload, 'M'); }
      catch (eM) { m = window.PromptPayQR.generateMatrix(payload, 'L'); }

      // วิธีหลัก: วาดลง canvas ความละเอียดสูงแล้วย่อ (smooth) — คมชัด สแกนติดบนจอ retina/iPad
      let drawn = false;
      try {
        const quiet = 4, scale = 8;
        const dimModules = m.size + quiet * 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = dimModules * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < m.size; r++) {
          for (let c = 0; c < m.size; c++) {
            if (m.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
          }
        }
        qrBox.innerHTML = '';
        canvas.style.cssText = 'display:block;width:100%;height:100%;';
        qrBox.appendChild(canvas);
        drawn = true;
      } catch (canvasErr) {
        console.warn('canvas QR failed -> fallback to SVG:', canvasErr);
      }

      // สำรอง: ถ้า canvas ใช้ไม่ได้ (บางอุปกรณ์/เบราว์เซอร์) วาดเป็น SVG แทน
      if (!drawn) {
        qrBox.innerHTML = window.PromptPayQR.svg(payload, { ecLevel: 'M', quiet: 4, dark: '#000000', light: '#ffffff' });
        const svgEl = qrBox.querySelector('svg');
        if (svgEl) { svgEl.style.display = 'block'; svgEl.style.width = '100%'; svgEl.style.height = '100%'; }
      }
    } catch (err) {
      console.error('PromptPay QR generation failed:', err);
      qrBox.innerHTML = `<div style="padding:24px 12px;text-align:center;color:#b91c1c;font-size:0.8rem;line-height:1.5;">⚠️ สร้าง QR ไม่สำเร็จ<br>${err.message}<br><span style="color:#64748b;">ลองรีเฟรชแอป หรือเช็คเลขพร้อมเพย์ในตั้งค่า</span></div>`;
    }
  }

  // ดำเนินการชำระเงินเรียบร้อย
  // คำนวณเงินทอน + เปิด/ปิดปุ่มยืนยัน (ใช้ร่วมกับช่องกรอกและปุ่มเงินด่วน)
  recalcCashChange() {
    const input = document.getElementById('cash-received');
    const received = parseFloat(input ? input.value : 0) || 0;
    const total = this.getCartTotal();
    const change = received - total;
    const changeEl = document.getElementById('cash-change');
    const checkoutCompleteBtn = document.getElementById('btn-complete-checkout');
    if (!changeEl || !checkoutCompleteBtn) return;
    if (received <= 0) {
      changeEl.innerText = '฿0.00';
      changeEl.style.color = 'var(--accent-massage)';
      checkoutCompleteBtn.disabled = true;
    } else if (change >= 0) {
      changeEl.innerText = `฿${change.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      changeEl.style.color = 'var(--accent-massage)';
      checkoutCompleteBtn.disabled = false;
    } else {
      changeEl.innerText = 'ยอดเงินสดไม่เพียงพอ';
      changeEl.style.color = 'var(--color-danger)';
      checkoutCompleteBtn.disabled = true;
    }
  }

  // ปุ่มเงินด่วน — เติมจำนวนเงินที่รับมา (ตัวเลข หรือ 'exact' = พอดียอด)
  quickCash(amount) {
    const input = document.getElementById('cash-received');
    if (!input) return;
    input.value = (amount === 'exact') ? this.getCartTotal() : amount;
    this.recalcCashChange();
    input.focus();
  }

  async processCheckout() {
    const btn = document.getElementById('btn-complete-checkout');
    if (btn) btn.disabled = true;

    try {
      const subtotal = this.getCartSubtotal();
      const discount = this.getCartDiscount(subtotal); // clamp [0, subtotal] แล้ว
      const total = this.getCartTotal();

      // เงินรับ-เงินทอน (เฉพาะจ่ายเงินสด) เก็บลงบิลเพื่อตรวจสอบย้อนหลังได้
      let cashReceived = null, cashChange = null;
      if (this.state.selectedPaymentMethod === 'cash') {
        const recEl = document.getElementById('cash-received');
        cashReceived = parseFloat(recEl ? recEl.value : 0) || 0;
        cashChange = Math.max(0, cashReceived - total);
      }

      const customerSelect = document.getElementById('cart-customer-select');
      const selectedCustId = customerSelect.value;
      
      let customerName = 'ลูกค้าทั่วไป (Walk-in)';
      if (selectedCustId === 'google') {
        customerName = 'ลูกค้าทั่วไป (Google)';
      } else if (selectedCustId === 'returning') {
        customerName = 'ลูกค้าเก่า';
      } else if (selectedCustId) {
        const customer = this.state.customers.find(c => c.id === selectedCustId);
        if (customer) {
          customerName = customer.name;
          customer.visitCount += 1; // เพิ่มประวัติการเข้าใช้งาน
          // อัปเกรดระดับสมาชิกอัตโนมัติ
          if (customer.visitCount >= 10) {
            customer.tier = 'แพลทินัม (Platinum)';
          } else if (customer.visitCount >= 5) {
            customer.tier = 'ทอง (Gold)';
          }
        }
      }

      const txId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      // 1. สร้างประวัติธุรกรรมเก็บไว้
      const transaction = {
        id: txId,
        date: Date.now(),
        customerName: customerName,
        customerId: (selectedCustId && selectedCustId !== 'google' && selectedCustId !== 'returning') ? selectedCustId : null,
        services: this.state.cart.map(item => item.name),
        details: (() => {
          // กระจายส่วนลดตามสัดส่วน + เกลี่ยเศษสตางค์ให้ผลรวม netPrice = total เป๊ะ
          const netPrices = this.distributeDiscount(this.state.cart.map(i => i.price), subtotal, discount);
          return this.state.cart.map((item, i) => {
          const netPrice = netPrices[i];
          const commType = item.commissionType || 'percent';
          const commVal = item.commission || 0;
          // ค่าคอมแบบ % คิดบน netPrice; แบบ fixed เป็นจำนวนคงที่ไม่ขึ้นกับส่วนลด
          const commissionAmount = commType === 'fixed' ? commVal : Math.round(netPrice * commVal) / 100;
          return {
            name: item.name,
            price: item.price,          // ราคาเต็ม (แสดงบนใบเสร็จ)
            netPrice: netPrice,         // ราคาหลังหักส่วนลด (ใช้คิดค่าคอม + รายงาน)
            staffId: item.staffId,
            staffName: item.staffName,
            commission: commVal,
            commissionType: commType,
            commissionAmount: commissionAmount
          };
          });
        })(),
        subtotal: subtotal,
        discount: discount,
        total: total,
        cashReceived: cashReceived,
        cashChange: cashChange,
        paymentMethod: this.state.selectedPaymentMethod,
        staffNames: [...new Set(this.state.cart.map(item => item.staffName))],
        syncStatus: 'pending' // สถานะเริ่มต้นของการซิงก์ออนไลน์
      };

      this.state.transactions.push(transaction);

      // 2. สร้างคิวงานของวันนี้ส่งไปที่รอให้บริการ
      const newQueueItem = {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        customerName: customerName,
        services: this.state.cart.map(item => ({
          name: item.name,
          price: item.price,
          staffId: item.staffId,
          staffName: item.staffName
        })),
        status: 'waiting', // คิวงานเริ่มต้นด้วยสถานะรอเรียก (Waiting)
        startTime: null,
        totalDuration: this.state.cart.reduce((sum, item) => sum + item.duration, 0),
        totalAmount: total
      };

      this.state.queue.push(newQueueItem);

      // บันทึกความเปลี่ยนแปลง
      await this.saveState();
      
      // เรียกซิงก์ข้อมูลอัตโนมัติขึ้น Google Sheets (แบบเบื้องหลังไม่กวนใจผู้ใช้)
      this.syncPendingTransactions(true);
      
      // ปิดหน้าชำระเงิน
      this.closeModal('modal-payment');
      
      // ล้างตะกร้าสินค้า
      this.clearCart();

      // รีเซ็ตลูกค้ากลับเป็น Walk-in — กันบิลถัดไปผูกลูกค้าคนเดิมโดยไม่ตั้งใจ
      // (visitCount เฟ้อ → เลื่อนขั้น Gold/Platinum เร็วผิด + ชื่อผิดขึ้นชีต)
      // ต้องรีเซ็ตก่อน renderPos ด้านล่าง เพราะ renderPos จะจำค่าที่เลือกอยู่ไว้
      const custSel = document.getElementById('cart-customer-select');
      if (custSel) custSel.value = '';

      // แสดงบิลใบเสร็จรับเงิน
      this.showThermalReceipt(transaction);

      // Lazy render — เฉพาะหน้าที่เปลี่ยนหลัง checkout (เร็วกว่า renderAll ประมาณ 4x)
      this.renderDashboard();  // KPI + recent sales อัปเดต
      this.renderPos();        // ล้างตะกร้า + customer select
      this.renderQueueScreen(); // แสดงคิวใหม่
      // reports และ settings ไม่ต้องเรนเดอร์ตอนนี้ — จะ render เมื่อผู้ใช้เปิดหน้านั้น
    } catch (err) {
      console.error('Checkout error:', err);
      this.showToast('การชำระเงินล้มเหลว: ' + err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  // ==================== RECEIPT RENDERING ====================
  
  showThermalReceipt(tx) {
    const container = document.getElementById('thermal-receipt-preview');
    const timeStr = new Date(tx.date).toLocaleString('th-TH');
    
    // ดึงคิวอาร์สำหรับโชว์ท้ายบิล
    container.innerHTML = `
      <div class="receipt-container">
        <div class="receipt-header">
          ${this.shopLogo ? `<img src="${this.shopLogo}" alt="logo" style="max-width:90px;max-height:90px;object-fit:contain;margin:0 auto 6px;display:block;">` : ''}
          <div class="receipt-shop-name">${escapeHtml(this.shopName || 'Erotica Barber & Massage')}</div>
          ${this.shopAddress ? `<div style="font-size: 0.7rem; color: #555;">${escapeHtml(this.shopAddress)}</div>` : ''}
          ${this.shopPhone ? `<div style="font-size: 0.7rem; color: #555;">โทร. ${escapeHtml(this.shopPhone)}</div>` : ''}
        </div>
        
        <div class="receipt-row">
          <span>เลขที่ใบเสร็จ:</span>
          <span>${tx.id}</span>
        </div>
        <div class="receipt-row">
          <span>วันที่:</span>
          <span>${timeStr}</span>
        </div>
        <div class="receipt-row">
          <span>ลูกค้า:</span>
          <span>${escapeHtml(tx.customerName)}</span>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-items">
          ${(tx.details && tx.details.length > 0 ? tx.details : tx.services.map((name, i) => ({
            name,
            price: Math.round(tx.subtotal / tx.services.length),
            staffName: tx.staffNames ? (tx.staffNames[i] || tx.staffNames[0]) : 'ไม่ระบุ'
          }))).map(item => `
            <div class="receipt-item-row">
              <div class="receipt-item-details">
                <span>${escapeHtml(item.name)}</span>
                <span>฿${(item.price || 0).toLocaleString('th-TH')}</span>
              </div>
              <div class="receipt-item-staff">ผู้ดูแล: ${escapeHtml(item.staffName || 'ไม่ระบุ')}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-row">
          <span>รวมค่าบริการ:</span>
          <span>฿${(tx.subtotal || 0).toLocaleString('th-TH')}</span>
        </div>
        <div class="receipt-row">
          <span>ส่วนลดพิเศษ:</span>
          <span>-฿${(tx.discount || 0).toLocaleString('th-TH')}</span>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-row receipt-totals">
          <span>ราคาสุทธิ:</span>
          <span>฿${(tx.total || 0).toLocaleString('th-TH')}</span>
        </div>
        
        <div class="receipt-row" style="margin-top: 4px;">
          <span>ช่องทางจ่ายเงิน:</span>
          <span>${tx.paymentMethod === 'promptpay' ? 'Scan (QR)' : tx.paymentMethod === 'credit' ? 'Credit Card' : 'เงินสด'}</span>
        </div>
        ${(tx.paymentMethod === 'cash' && tx.cashReceived != null) ? `
        <div class="receipt-row">
          <span>เงินรับมา:</span>
          <span>฿${(tx.cashReceived || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="receipt-row">
          <span>เงินทอน:</span>
          <span>฿${(tx.cashChange || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        </div>` : ''}

        <div class="receipt-qr-section">
          <span class="receipt-qr-title">ขอบคุณที่ใช้บริการ</span>
        </div>

        <div class="receipt-footer">
          *** ยินดีต้อนรับสู่สัมผัสแห่งความผ่อนคลาย ***
        </div>
      </div>
    `;
    
    this.openModal('modal-receipt');
  }

  // ==================== QUEUE ACTIONS ====================

  // เริ่มต้นทำงานบริการ (ย้ายคิวไปที่กำลังทำ และนับเวลา)
  async startQueue(queueId) {
    const queueItem = this.state.queue.find(q => q.id === queueId);
    if (queueItem) {
      queueItem.status = 'serving';
      queueItem.startTime = Date.now();
      await this.saveState();
      this.renderQueueScreen();
      this.renderDashboard();
    }
  }

  // ยกเลิกคิวงาน
  removeQueue(queueId) {
    this.showConfirm('คุณต้องการยกเลิกคิวงานนี้ใช่หรือไม่?', async () => {
      this.state.queue = this.state.queue.filter(q => q.id !== queueId);
      await this.saveState();
      this.renderQueueScreen();
      this.renderDashboard();
    });
  }

  // ทำคิวนี้เสร็จสิ้น
  async completeQueue(queueId) {
    const queueIndex = this.state.queue.findIndex(q => q.id === queueId);
    if (queueIndex > -1) {
      // เอาคิวออกจากคิวแสดงผลการทำงานสด
      this.state.queue.splice(queueIndex, 1);
      await this.saveState();
      this.renderQueueScreen();
      this.renderDashboard();
      
      this.vibrateDevice(100);
      this.showToast('ให้บริการคิวงานเสร็จสิ้นแล้ว 🎉', 'success');
    }
  }

  // ==================== CLIENT / STAFF / SERVICE ADDERS ====================

  async addCustomer() {
    const nameInput  = document.getElementById('cust-name');
    const phoneInput = document.getElementById('cust-phone');
    const noteInput  = document.getElementById('cust-note');

    // ── Validation ──────────────────────────────
    const name  = nameInput.value.trim();
    const phone = phoneInput.value.trim().replace(/[-\s]/g, '');

    if (!name) {
      this.showToast('กรุณากรอกชื่อลูกค้า', 'warning');
      nameInput.focus(); return;
    }
    if (!/^0[0-9]{8,9}$/.test(phone)) {
      this.showToast('เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก (เช่น 0812345678)', 'warning');
      phoneInput.focus(); return;
    }
    // ── Duplicate check ─────────────────────────
    const dup = this.state.customers.find(c => String(c.phone || '').replace(/[-\s]/g,'') === phone);
    if (dup) {
      this.showToast(`เบอร์นี้มีอยู่แล้ว: ${dup.name}`, 'warning'); return;
    }

    // ใช้ ID แบบไม่ซ้ำถาวร (กันกรณีลบลูกค้าแล้วเพิ่มใหม่ได้ ID เดิม → void บิลเก่าผิดคน)
    const newCustomer = {
      id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name, phone,
      visitCount: 0,
      tier: 'ทั่วไป (General)',
      note: noteInput.value.trim() || 'ไม่มี'
    };

    this.state.customers.push(newCustomer);
    await this.saveState();
    this.showToast(`เพิ่มลูกค้า ${name} สำเร็จ`, 'success');
    
    this.closeModal('modal-customer');
    
    // อัปเดตการแสดงผลในตะกร้าและตาราง
    this.renderPos();
    this.renderCustomerTable();
    
    // ตั้งค่าตัวเลือกใน POS Cart เป็นลูกค้าคนนี้ให้อัตโนมัติ
    document.getElementById('cart-customer-select').value = newCustomer.id;
  }

  editCustomerNote(custId) {
    const customer = this.state.customers.find(c => c.id === custId);
    if (customer) {
      this.showPromptModal(`แก้ไขข้อมูลบันทึกพิเศษสำหรับคุณ ${customer.name}:`, customer.note, async (newNote) => {
        if (newNote !== null) {
          customer.note = newNote;
          await this.saveState();
          this.renderCustomerTable();
        }
      });
    }
  }

  deleteCustomer(custId) {
    this.showConfirm('คุณต้องการลบรายชื่อลูกค้านี้ใช่หรือไม่? (ประวัติการสะสมยอดจะไม่ย้อนกลับ)', async () => {
      this.state.customers = this.state.customers.filter(c => c.id !== custId);
      await this.saveState();
      this.renderCustomerTable();
      this.renderPos();
    });
  }

  async addStaff() {
    const nameInput = document.getElementById('staff-name');
    const roleSelect = document.getElementById('staff-role');
    const accessSelect = document.getElementById('staff-access-level');
    const pinInput = document.getElementById('staff-pin');
    const name = nameInput.value.trim();

    if (!name) {
      this.showToast('กรุณากรอกชื่อพนักงาน', 'warning');
      nameInput.focus();
      return;
    }

    const accessLevel = accessSelect ? accessSelect.value : 'staff';
    const pinRaw = pinInput ? pinInput.value.trim() : '';
    let pinHash = null;
    if (pinRaw) {
      if (!/^[0-9]{4,6}$/.test(pinRaw)) {
        this.showToast('PIN ต้องเป็นตัวเลข 4-6 หลัก', 'warning');
        if (pinInput) pinInput.focus();
        return;
      }
      pinHash = await this.hashPin(pinRaw);
    }

    if (this.state.editingStaffId) {
      const staffMember = this.state.staff.find(s => s.id === this.state.editingStaffId);
      if (staffMember) {
        staffMember.name = name;
        staffMember.role = roleSelect.value;
        staffMember.accessLevel = accessLevel;
        if (pinRaw) staffMember.pin = pinHash; // เปลี่ยน PIN เฉพาะเมื่อกรอกใหม่
      }
      this.state.editingStaffId = null;
    } else {
      // ใช้ ID แบบไม่ซ้ำถาวร (กันการนำ ID เก่ากลับมาใช้หลังลบพนักงาน)
      const newStaff = {
        id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: name,
        role: roleSelect.value,
        active: true,
        accessLevel: accessLevel,
        pin: pinHash
      };
      this.state.staff.push(newStaff);
    }

    await this.saveState();
    this.closeModal('modal-staff');
    this.renderSettingsLists();
    this.renderPos();
  }

  editStaff(staffId) {
    const staffMember = this.state.staff.find(s => s.id === staffId);
    if (staffMember) {
      this.state.editingStaffId = staffId;
      const titleEl = document.getElementById('staff-modal-title');
      if (titleEl) titleEl.innerText = 'แก้ไขข้อมูลพนักงาน';
      document.getElementById('staff-name').value = staffMember.name;
      document.getElementById('staff-role').value = staffMember.role;
      const accessSelect = document.getElementById('staff-access-level');
      if (accessSelect) accessSelect.value = staffMember.accessLevel || 'staff';
      const pinInput = document.getElementById('staff-pin');
      if (pinInput) {
        pinInput.value = '';
        pinInput.placeholder = staffMember.pin ? 'มี PIN อยู่แล้ว (เว้นว่าง = ไม่เปลี่ยน)' : 'ตั้ง PIN 4-6 หลัก (เว้นว่าง = เข้าระบบไม่ได้)';
      }
      this.openModal('modal-staff');
    }
  }

  deleteStaff(staffId) {
    if (this.state.staff.length <= 1) {
      this.showToast('ไม่สามารถลบพนักงานทั้งหมดได้ ต้องมีพนักงานอย่างน้อย 1 คนในระบบเพื่อให้บริการ', 'info');
      return;
    }
    this.showConfirm('ยืนยันลบพนักงานคนนี้ออกจากระบบใช่หรือไม่?', async () => {
      this.state.staff = this.state.staff.filter(s => s.id !== staffId);
      await this.saveState();
      this.renderSettingsLists();
      this.renderPos();
    });
  }

  async addService() {
    const nameInput           = document.getElementById('serv-name');
    const priceInput          = document.getElementById('serv-price');
    const durationInput       = document.getElementById('serv-duration');
    const catSelect           = document.getElementById('serv-category');
    const commissionInput     = document.getElementById('serv-commission');
    const commissionTypeSelect= document.getElementById('serv-commission-type');

    // ── Validation ──────────────────────────────
    const svcName = nameInput.value.trim();
    const price   = parseFloat(priceInput.value);
    const dur     = parseInt(durationInput.value);

    if (!svcName) { this.showToast('กรุณากรอกชื่อบริการ','warning'); nameInput.focus(); return; }
    if (isNaN(price) || price <= 0) { this.showToast('ราคาต้องมากกว่า 0 บาท','warning'); priceInput.focus(); return; }
    if (isNaN(dur) || dur <= 0)     { this.showToast('ระยะเวลาต้องมากกว่า 0 นาที','warning'); durationInput.focus(); return; }

    if (this.state.editingServiceId) {
      const service = this.state.services.find(s => s.id === this.state.editingServiceId);
      if (service) {
        service.name = nameInput.value;
        service.price = parseFloat(priceInput.value);
        service.duration = parseInt(durationInput.value);
        service.category = catSelect.value;
        service.commission = parseFloat(commissionInput.value) || 0;
        service.commissionType = commissionTypeSelect.value;
      }
      this.state.editingServiceId = null;
    } else {
      // ใช้ ID แบบไม่ซ้ำถาวร (กันการนำ ID เก่ากลับมาใช้หลังลบบริการ)
      const newService = {
        id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: nameInput.value,
        price: parseFloat(priceInput.value),
        duration: parseInt(durationInput.value),
        category: catSelect.value,
        commission: parseFloat(commissionInput.value) || 0,
        commissionType: commissionTypeSelect.value
      };
      this.state.services.push(newService);
    }

    await this.saveState();
    this.closeModal('modal-service');
    this.renderSettingsLists();
    this.renderPos();
  }

  editService(serviceId) {
    const service = this.state.services.find(s => s.id === serviceId);
    if (service) {
      this.state.editingServiceId = serviceId;
      const titleEl = document.getElementById('service-modal-title');
      if (titleEl) titleEl.innerText = 'แก้ไขข้อมูลบริการ';
      document.getElementById('serv-name').value = service.name;
      document.getElementById('serv-price').value = service.price;
      document.getElementById('serv-duration').value = service.duration;
      this.populateServiceCategorySelect();
      document.getElementById('serv-category').value = service.category;
      document.getElementById('serv-commission').value = service.commission || 0;
      document.getElementById('serv-commission-type').value = service.commissionType || 'percent';
      this.openModal('modal-service');
    }
  }

  deleteService(serviceId) {
    this.showConfirm('ยืนยันการลบบริการนี้ออกจากระบบใช่หรือไม่?', async () => {
      this.state.services = this.state.services.filter(s => s.id !== serviceId);
      await this.saveState();
      this.renderSettingsLists();
      this.renderPos();
    });
  }

  // ==================== MODALS HELPERS ====================

  openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  // ==================== GOOGLE SHEETS SYNC ====================

  // ─── รวมค่าใช้จ่ายของ "วันทำการ" หนึ่งๆ: กะที่ปิดแล้ว (ตามวันทำการที่ปิดกะ) + กะที่ยังเปิดอยู่ (ตามเวลาของรายการ) ───
  // กะปกติ 11:00 → ตี 3: วันทำการของเวลาปิดกะ = วันเดียวกับบิลทั้งกะ → รายได้กับค่าใช้จ่ายอยู่วันเดียวกันเสมอ
  // ถ้าไม่รวมกะที่ยังเปิด สรุปที่ส่งกลางกะ (กดส่งเอง หรือ refresh หลัง void/แก้บิล) จะโชว์กำไรสูงเกินจริงจนกว่าจะปิดกะ
  getExpensesForDate(dateKey) {
    const closed = (this.state.shift.history || [])
      .filter(sh => this.getBusinessISODate(sh.endTime || sh.startTime) === dateKey)
      .flatMap(sh => sh.expenses || []);
    const active = (this.state.shift.active && Array.isArray(this.state.shift.expenses))
      ? this.state.shift.expenses.filter(e => this.getBusinessISODate(e.time) === dateKey)
      : [];
    return closed.concat(active);
  }

  // ─── สร้าง payload สรุป (ใช้ร่วมกันทั้ง daily / monthly) ───────────────
  buildSummaryPayload(transactions, expenses, periodType, periodKey) {
    // 1. รายได้แยกช่องทาง
    const totalRevenue  = transactions.reduce((s, tx) => s + tx.total, 0);
    const cashRevenue   = transactions.filter(tx => tx.paymentMethod === 'cash').reduce((s, tx) => s + tx.total, 0);
    const qrRevenue     = transactions.filter(tx => tx.paymentMethod === 'promptpay').reduce((s, tx) => s + tx.total, 0);
    const creditRevenue = transactions.filter(tx => tx.paymentMethod === 'credit').reduce((s, tx) => s + tx.total, 0);
    const billCount     = transactions.length;
    const avgBill       = billCount > 0 ? totalRevenue / billCount : 0;

    // 2. รายการบริการ — นับครั้ง + รายได้
    const svcMap = {};
    transactions.forEach(tx => {
      if (tx.details && Array.isArray(tx.details)) {
        tx.details.forEach(item => {
          if (!svcMap[item.name]) svcMap[item.name] = { name: item.name, count: 0, revenue: 0 };
          svcMap[item.name].count++;
          svcMap[item.name].revenue += (item.netPrice != null ? item.netPrice : item.price); // ใช้ยอดหลังหักส่วนลด ให้กระทบยอดตรงกับรายได้รวม
        });
      } else {
        (tx.services || []).forEach(name => {
          if (!svcMap[name]) svcMap[name] = { name, count: 0, revenue: 0 };
          svcMap[name].count++;
          const svc = this.state.services.find(s => s.name === name);
          svcMap[name].revenue += svc ? svc.price : Math.round(tx.subtotal / (tx.services.length || 1));
        });
      }
    });

    // 3. ค่าใช้จ่าย
    const totalExpenses = (expenses || []).reduce((s, e) => s + e.amount, 0);
    const netIncome     = totalRevenue - totalExpenses;

    // 4. ค่าคอมมิชชั่นรายบุคคล
    const staffMap = {};
    this.state.staff.forEach(st => {
      staffMap[st.id] = { name: st.name, role: st.role, count: 0, salesSum: 0, commission: 0 };
    });
    transactions.forEach(tx => {
      if (tx.details && Array.isArray(tx.details)) {
        tx.details.forEach(item => {
          if (!staffMap[item.staffId]) {
            staffMap[item.staffId] = { name: item.staffName || 'ไม่ระบุ', role: '-', count: 0, salesSum: 0, commission: 0 };
          }
          staffMap[item.staffId].count++;
          staffMap[item.staffId].salesSum     += (item.netPrice != null ? item.netPrice : item.price); // ยอดขายหลังหักส่วนลด
          staffMap[item.staffId].commission   += item.commissionAmount || 0;
        });
      }
    });

    const payload = {
      secret:          API_SECRET,
      action:          periodType === 'day' ? 'summary_day' : 'summary_month',
      dateKey:         periodType === 'day'   ? periodKey : undefined,
      monthKey:        periodType === 'month' ? periodKey : undefined,
      totalRevenue, cashRevenue, qrRevenue, creditRevenue,
      billCount, avgBill, totalExpenses, netIncome,
      services:         Object.values(svcMap),
      expenses:         (expenses || []).map(e => ({ note: e.note, amount: e.amount })),
      staffCommissions: Object.values(staffMap).filter(st => st.count > 0)
    };
    return payload;
  }

  // ─── ส่งสรุปรายวันไป Google Sheets ─────────────────────────────────────
  async syncDailySummary(dateStr, transactions, expenses, isSilent = true) {
    if (!this.googleSheetsUrl) {
      if (!isSilent) this.showToast('กรุณากรอก URL ของ Google Sheets Web App ในหน้าตั้งค่าก่อน', 'warning');
      return false;
    }
    try {
      const payload = this.buildSummaryPayload(transactions, expenses, 'day', dateStr);
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      if (result.status === 'success') {
        if (!isSilent) this.showToast('ส่งสรุปรายวันขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else {
        throw new Error(result.message || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Daily summary sync error:', err);
      if (!isSilent) this.showToast('ส่งสรุปรายวันล้มเหลว: ' + err.message, 'error');
      return false;
    }
  }

  // ─── ส่งสรุปรายเดือนไป Google Sheets ───────────────────────────────────
  async syncMonthlySummary(monthStr, isSilent = true) {
    if (!this.googleSheetsUrl) {
      if (!isSilent) this.showToast('กรุณากรอก URL ของ Google Sheets Web App ในหน้าตั้งค่าก่อน', 'warning');
      return false;
    }
    try {
      // กรองธุรกรรมของ "เดือนทำการ" นั้น
      const txs = this.state.transactions.filter(tx => {
        return this.getBusinessISOMonth(tx.date) === monthStr.slice(3) + '-' + monthStr.slice(0, 2);
      });
      // รวม expenses ของทุกกะในเดือนทำการนั้น
      const expenses = (this.state.shift.history || [])
        .filter(sh => this.getBusinessMonthKey(sh.endTime || sh.startTime) === monthStr)
        .flatMap(sh => sh.expenses || []);
      // รวมค่าใช้จ่ายของกะที่ยังเปิดอยู่ในเดือนเดียวกันด้วย — ไม่งั้นสรุปเดือนที่ส่งก่อนปิดกะขาดยอดค่าใช้จ่าย
      if (this.state.shift.active && Array.isArray(this.state.shift.expenses)) {
        this.state.shift.expenses.forEach(e => {
          if (this.getBusinessMonthKey(e.time) === monthStr) expenses.push(e);
        });
      }

      const payload = this.buildSummaryPayload(txs, expenses, 'month', monthStr);
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const result = await response.json();
      if (result.status === 'success') {
        if (!isSilent) this.showToast('ส่งสรุปรายเดือนขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else {
        throw new Error(result.message || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Monthly summary sync error:', err);
      if (!isSilent) this.showToast('ส่งสรุปรายเดือนล้มเหลว: ' + err.message, 'error');
      return false;
    }
  }

  // ตรวจสอบและอัปเดตสถานะของไอคอนคลาวด์บนหน้าจอ
  checkSyncStatus() {
    const pendingTxs = this.state.transactions.filter(tx => tx.syncStatus !== 'synced');
    if (!this.googleSheetsUrl) {
      // ยังไม่ตั้งค่า URL — ไม่ใช่สถานะ "ค้างซิงก์" (ไม่มีปลายทางให้ส่ง) แสดงเป็นออฟไลน์พร้อมจำนวนบิลในเครื่องแทน
      // เดิมโชว์ "ค้างซิงก์ ⚠️" ถาวรสำหรับร้านที่ตั้งใจใช้ออฟไลน์ล้วน ทำให้เข้าใจผิดว่าระบบมีปัญหา
      this.updateSyncBadgeStatus('offline', pendingTxs.length);
    } else if (pendingTxs.length > 0) {
      this.updateSyncBadgeStatus('warning', pendingTxs.length);
    } else {
      this.updateSyncBadgeStatus('synced', 0);
    }
  }

  // ส่งข้อมูลของรายการธุรกรรมเดียวไปยัง Google Sheets
  async syncSingleTransaction(tx) {
    if (!this.googleSheetsUrl) {
      throw new Error('ยังไม่ได้ระบุ URL ของ Google Sheets');
    }

    // monthKey = "เดือนทำการ" จากเวลาเครื่องหน้าร้าน — บิลตี 2 ของเช้าวันที่ 1 ลงแท็บเดือนของคืนสิ้นเดือน
    // และกันแท็บผิดเดือนเมื่อ timezone ของโปรเจกต์ Apps Script ตั้งไว้ผิด (ค่า default มักเป็น US)
    // dateTimeStr = เวลาจริง (สำหรับแสดงในแถวบิล ไม่ใช่การจัดกลุ่ม)
    const txD = new Date(tx.date);
    const pad2 = (n) => String(n).padStart(2, '0');
    const payload = {
      secret: API_SECRET,
      id: tx.id,
      date: tx.date,
      monthKey: this.getBusinessMonthKey(tx.date),
      dateTimeStr: `${txD.getFullYear()}-${pad2(txD.getMonth() + 1)}-${pad2(txD.getDate())} ${pad2(txD.getHours())}:${pad2(txD.getMinutes())}:${pad2(txD.getSeconds())}`,
      customerName: tx.customerName,
      services: tx.services,
      subtotal: tx.subtotal,
      discount: tx.discount,
      total: tx.total,
      paymentMethod: tx.paymentMethod,
      staffNames: tx.staffNames
    };

    // ส่งแบบ simple request (text/plain) เพื่อข้าม CORS preflight แล้วอ่าน JSON ที่ตอบกลับมา
    let response;
    try {
      response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS ต้องการ text/plain เพื่อข้าม preflight
        body: JSON.stringify(payload)
      });
    } catch (networkErr) {
      throw new Error('เครือข่ายขัดข้อง: ' + networkErr.message);
    }

    if (!response.ok) {
      throw new Error(`GAS ตอบกลับ HTTP ${response.status}`);
    }

    // ตรวจ response JSON ว่า status === 'success'
    try {
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'GAS รายงานข้อผิดพลาด');
      }
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error('เซิร์ฟเวอร์ไม่ได้ตอบกลับด้วยข้อมูล JSON ที่ถูกต้อง (กรุณาตรวจสอบการตั้งค่า URL Google Sheets Web App หรือสิทธิ์การเข้าใช้งาน)');
      }
      throw parseErr;
    }

    return true;
  }

  // ลูปส่งรายการธุรกรรมที่ค้างอยู่ทั้งหมด (Sync Queue)
  async syncPendingTransactions(isSilent = false) {
    if (this.isSyncing) return; // Prevent duplicate syncs
    this.isSyncing = true;
    
    try {
      const pendingTxs = this.state.transactions.filter(tx => tx.syncStatus !== 'synced');
    
      if (pendingTxs.length === 0) {
        this.checkSyncStatus();
        if (!isSilent) {
          this.showToast('ข้อมูลธุรกรรมทั้งหมดตรงกันกับ Google Sheets แล้ว (ไม่มีบิลค้างซิงก์)', 'info');
        }
        return;
      }

      if (!this.googleSheetsUrl) {
        this.checkSyncStatus();
        if (!isSilent) {
          this.showToast('กรุณากรอก URL ของ Google Sheets Web App ในหน้าตั้งค่าก่อนเริ่มต้นซิงก์ข้อมูล', 'info');
        }
        return;
      }

      this.updateSyncBadgeStatus('syncing', pendingTxs.length);
      
      let successCount = 0;
      let failCount = 0;

      for (let tx of pendingTxs) {
        // กัน race: ถ้าบิลถูก void ระหว่างรอคิว sync (ไม่อยู่ใน state แล้ว) ห้ามส่งขึ้นชีต — ไม่งั้นเกิดแถวผีหลังลบ
        if (!this.state.transactions.includes(tx)) continue;
        const revBeforeSend = tx.rev || 0; // จำเวอร์ชันแก้ไขก่อนส่ง — ใช้ตรวจ race ด้านล่าง
        try {
          await this.syncSingleTransaction(tx);
          // เช็คซ้ำหลัง await: บิลอาจถูก void ระหว่าง fetch — ถ้าหายไปแล้วไม่ต้อง mark (outbox ของ void จะลบแถวให้เอง)
          if (!this.state.transactions.includes(tx)) continue;
          // กัน race: บิลถูก "แก้ไข" ระหว่าง fetch (rev เปลี่ยน) — ห้ามทับเป็น synced
          // ไม่งั้นข้อมูลที่เพิ่งแก้จะไม่ถูกส่งขึ้นชีตอีกเลย ปล่อยค้าง pending ให้รอบถัดไปส่งเวอร์ชันใหม่ทับ
          if ((tx.rev || 0) !== revBeforeSend) continue;
          tx.syncStatus = 'synced';
          successCount++;
        } catch (err) {
          console.error(`Failed to sync transaction ${tx.id}:`, err);
          tx.syncStatus = 'pending';
          failCount++;
        }
      }

      // เซฟครั้งเดียวหลังจบทั้งคิว — เดิมเซฟต่อบิล (เขียน state ทั้งก้อน × จำนวนบิลค้าง) แอปค้างเมื่อ backlog เยอะ
      // ถ้าแอปถูกปิดกลางคัน บิลที่ส่งแล้วแต่ยังไม่ทันเซฟจะถูกส่งซ้ำรอบหน้า — ไม่เกิดแถวซ้ำเพราะชีต upsert ตาม ID
      if (successCount > 0) await this.saveState();

      this.checkSyncStatus();
      
      if (failCount > 0) {
        if (!isSilent) {
          this.showToast(`ซิงก์สำเร็จ ${successCount} รายการ, ล้มเหลว ${failCount} รายการ`, 'warning');
        }
      } else {
        if (!isSilent) {
          this.showToast(`ซิงก์ขึ้น Google Sheets สำเร็จ ${successCount} รายการ`, 'success');
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  // ควบคุมสีและข้อความของไอคอนสถานะคลาวด์
  updateSyncBadgeStatus(status, count) {
    const mobileStatusEl = document.getElementById('mobile-sync-status');
    const mobileTextEl = document.getElementById('mobile-sync-text');
    const mobileIconEl = document.getElementById('mobile-sync-icon');
    
    const sidebarStatusEl = document.getElementById('sidebar-sync-status');
    const sidebarTextEl = document.getElementById('sidebar-sync-text');
    const sidebarIconEl = document.getElementById('sidebar-sync-icon');
    
    const settingsDetailsEl = document.getElementById('sync-status-details');

    if (!mobileStatusEl || !sidebarStatusEl) return;

    // ล้างคลาสสไตล์เดิม
    const statusClasses = ['syncing', 'sync-warning', 'synced'];
    mobileStatusEl.classList.remove(...statusClasses);
    sidebarStatusEl.classList.remove(...statusClasses);

    let textStr = '';
    let iconClass = 'fa-cloud';
    let statusClass = '';

    if (status === 'syncing') {
      textStr = `กำลังซิงก์ (${count} บิล)...`;
      iconClass = 'fa-cloud-arrow-up fa-spin';
      statusClass = 'syncing';
    } else if (status === 'warning') {
      textStr = `ค้างซิงก์ ${count} บิล ⚠️`;
      iconClass = 'fa-cloud-arrow-up';
      statusClass = 'sync-warning';
    } else if (status === 'synced') {
      textStr = 'คลาวด์ออนไลน์ (ตรงกัน)';
      iconClass = 'fa-cloud';
      statusClass = 'synced';
    } else {
      textStr = count > 0 ? `ออฟไลน์ (${count} บิลในเครื่อง)` : 'คลาวด์ออฟไลน์';
      iconClass = 'fa-cloud';
    }

    // อัปเดต Mobile Header
    if (mobileTextEl) mobileTextEl.innerText = textStr;
    if (mobileIconEl) mobileIconEl.className = `fa-solid ${iconClass}`;
    if (statusClass) mobileStatusEl.classList.add(statusClass);

    // อัปเดต Sidebar Footer
    if (sidebarTextEl) sidebarTextEl.innerText = textStr;
    if (sidebarIconEl) sidebarIconEl.className = `fa-solid ${iconClass}`;
    if (statusClass) sidebarStatusEl.classList.add(statusClass);

    // อัปเดตกล่องแสดงรายละเอียดในหน้าตั้งค่า
    if (settingsDetailsEl) {
      if (status === 'offline') {
        settingsDetailsEl.innerText = count > 0
          ? `ยังไม่ได้ตั้งค่า URL — มี ${count} บิลเก็บอยู่ในเครื่องเท่านั้น`
          : 'ยังไม่ได้เชื่อมต่อ Google Sheets (กรอก URL ด้านซ้ายเพื่อเปิดซิงก์)';
        settingsDetailsEl.style.color = 'var(--text-secondary)';
      } else if (count > 0) {
        settingsDetailsEl.innerText = `มี ${count} รายการบิลค้างส่งขึ้นคลาวด์`;
        settingsDetailsEl.style.color = 'var(--accent-premium)';
      } else {
        settingsDetailsEl.innerText = 'ข้อมูลทั้งหมดตรงกับคลาวด์แล้ว (ไม่มีบิลค้าง)';
        settingsDetailsEl.style.color = 'var(--accent-massage)';
      }
    }
  }

  // ==================== CASH SHIFT MANAGEMENT ====================

  openCashCounter(mode) {
    // กันเปิดหน้าปิดกะตอนไม่มีกะเปิดอยู่ — startTime เป็น null จะกลายเป็น 0 ในตัวกรองเวลา
    // ทำให้ "เงินที่ควรมี" นับยอดเงินสดทุกบิลตั้งแต่เปิดร้านมา (มีหน้าต่างกดโดนช่วง 500ms หลังปิดกะ)
    if (mode === 'close' && (!this.state.shift || !this.state.shift.active)) {
      this.showToast('ยังไม่มีกะที่เปิดอยู่ — ต้องเปิดกะก่อนจึงจะปิดร้าน/สรุปยอดได้', 'warning');
      return;
    }
    if (mode === 'close' && this.currentRole === 'staff') {
      this.showToast('การปิดร้าน/สรุปยอดวัน ทำได้เฉพาะผู้จัดการขึ้นไป', 'warning');
      return;
    }
    this.cashCounterMode = mode; // 'open' or 'close'
    
    // รีเซ็ตค่าฟอร์มกลับเป็น 0
    const form = document.getElementById('form-cash-counter');
    if (form) form.reset();
    
    // รีเซ็ตหน้าแสดงยอดธนบัตรย่อย
    const denoms = [1, 2, 5, 10, 20, 50, 100, 500, 1000];
    denoms.forEach(d => {
      const label = document.getElementById(`denom-total-${d}`);
      if (label) label.innerText = '฿0';
    });
    
    document.getElementById('cash-counter-total').innerText = '฿0.00';
    
    // ตั้งค่าหัวข้อ ปุ่ม และสถานะ
    const titleEl = document.getElementById('cash-counter-title');
    const subtitleEl = document.getElementById('cash-counter-subtitle');
    const btnConfirm = document.getElementById('btn-confirm-cash-counter');
    const btnClose = document.getElementById('btn-close-cash-counter');
    const btnCancel = document.getElementById('btn-cancel-cash-counter');
    const summaryPanel = document.getElementById('cash-drawer-closing-summary');
    
    if (btnConfirm) btnConfirm.disabled = false; // รีเซ็ตสถานะปุ่มยืนยันเสมอเมื่อเปิด modal

    if (mode === 'open') {
      if (titleEl) titleEl.innerText = 'นับเงินสดเริ่มต้นเปิดร้าน';
      if (subtitleEl) subtitleEl.innerText = 'กรุณากรอกจำนวนเหรียญและธนบัตรในลิ้นชักเพื่อตั้งต้นจำนวนเงินเปิดร้าน';
      if (btnConfirm) btnConfirm.innerText = 'ยืนยันยอดเงินและเปิดร้าน';
      
      // บล็อกการปิด modal (ต้องเปิดกะก่อนขาย) — ยกเว้น owner มีปุ่มออกไปหน้าตั้งค่า
      // กันติดกับดักตอนติดตั้งครั้งแรก: ยังไม่มีพนักงาน/ยังไม่ได้ตั้งค่าระบบ แต่โดนบังคับเปิดกะก่อน
      if (btnClose) btnClose.style.display = 'none';
      if (btnCancel) {
        if (this.currentRole === 'owner') {
          btnCancel.style.display = 'block';
          btnCancel.innerHTML = '<i class="fa-solid fa-sliders"></i> ไปหน้าตั้งค่าก่อน';
          btnCancel.onclick = () => {
            this.closeModal('modal-cash-counter');
            this.switchTab('settings');
          };
        } else {
          btnCancel.style.display = 'none';
        }
      }
      if (summaryPanel) summaryPanel.style.display = 'none';
    } else {
      if (titleEl) titleEl.innerText = 'ปิดร้าน / สรุปยอดวัน';
      if (subtitleEl) subtitleEl.innerText = 'กรุณากรอกจำนวนเหรียญและธนบัตรในลิ้นชักเพื่อตรวจสอบยอดเงินปลายวัน';
      if (btnConfirm) btnConfirm.innerText = 'ยืนยันปิดยอดขายและปิดร้าน';
      
      // อนุญาตให้ปิด modal ได้ — คืนข้อความ/พฤติกรรมปุ่มยกเลิกกลับเป็นค่าเดิม (โหมด open อาจแก้ไว้)
      if (btnClose) btnClose.style.display = 'block';
      if (btnCancel) {
        btnCancel.style.display = 'block';
        btnCancel.innerText = 'ยกเลิก';
        btnCancel.onclick = () => this.closeModal('modal-cash-counter');
      }
      if (summaryPanel) summaryPanel.style.display = 'flex';
      
      // คำนวณยอดเงินสะสม
      const startCash = this.state.shift.startCash || 0;
      const startTime = this.state.shift.startTime || 0;
      
      const cashSales = this.state.transactions
        .filter(tx => {
          const txTime = new Date(tx.date).getTime();
          return txTime >= startTime && tx.paymentMethod === 'cash';
        })
        .reduce((sum, tx) => sum + tx.total, 0);
        
      const expensesTotal = (this.state.shift.expenses || [])
        .reduce((sum, e) => sum + e.amount, 0);
        
      const expectedTotal = startCash + cashSales - expensesTotal;
      
      if (document.getElementById('closing-expected-start')) {
        document.getElementById('closing-expected-start').innerText = `฿${startCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      if (document.getElementById('closing-expected-sales')) {
        document.getElementById('closing-expected-sales').innerText = `+฿${cashSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      if (document.getElementById('closing-expected-expenses')) {
        document.getElementById('closing-expected-expenses').innerText = `-฿${expensesTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      if (document.getElementById('closing-expected-total')) {
        document.getElementById('closing-expected-total').innerText = `฿${expectedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      
      this.updateCashSum(); // เพื่อแสดงผลต่าง (difference) ทันที
    }
    
    this.openModal('modal-cash-counter');
  }

  updateCashSum() {
    let total = 0;
    const inputs = document.querySelectorAll('#form-cash-counter .cash-qty-input');
    
    inputs.forEach(input => {
      const denom = parseInt(input.getAttribute('data-denom'), 10);
      const qty = parseInt(input.value, 10) || 0;
      const subtotal = denom * qty;
      total += subtotal;
      
      const label = document.getElementById(`denom-total-${denom}`);
      if (label) {
        label.innerText = `฿${subtotal.toLocaleString('th-TH')}`;
      }
    });
    
    const totalEl = document.getElementById('cash-counter-total');
    if (totalEl) {
      totalEl.innerText = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    }
    
    // ถ้าอยู่ในโหมดปิดกะ ให้แสดงผลต่างเงินขาด/เกินด้วย
    if (this.cashCounterMode === 'close') {
      const startCash = this.state.shift.startCash || 0;
      const startTime = this.state.shift.startTime || 0;
      
      const cashSales = this.state.transactions
        .filter(tx => {
          const txTime = new Date(tx.date).getTime();
          return txTime >= startTime && tx.paymentMethod === 'cash';
        })
        .reduce((sum, tx) => sum + tx.total, 0);
      
      const expensesTotal = (this.state.shift.expenses || [])
        .reduce((sum, e) => sum + e.amount, 0);
        
      const expectedTotal = startCash + cashSales - expensesTotal;
      const diff = total - expectedTotal;
      
      const closingActualEl = document.getElementById('closing-actual-total');
      if (closingActualEl) {
        closingActualEl.innerText = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      
      const diffAmountEl = document.getElementById('closing-diff-amount');
      const diffBoxEl = document.getElementById('closing-diff-box');
      
      if (diffAmountEl && diffBoxEl) {
        diffBoxEl.style.background = '';
        diffBoxEl.style.color = '';
        
        let diffText = '';
        if (diff > 0) {
          diffText = `+฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (เงินเกิน)`;
          diffBoxEl.style.background = 'rgba(234, 179, 8, 0.2)'; // สีเหลืองส้ม
          diffBoxEl.style.color = 'var(--accent-massage)';
        } else if (diff < 0) {
          diffText = `฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (เงินขาด)`;
          diffBoxEl.style.background = 'rgba(244, 63, 94, 0.2)'; // สีแดง
          diffBoxEl.style.color = 'var(--accent-premium)';
        } else {
          diffText = '฿0.00 (ตรงพอดี)';
          diffBoxEl.style.background = 'rgba(34, 197, 94, 0.2)'; // สีเขียว
          diffBoxEl.style.color = 'var(--color-success)';
        }
        diffAmountEl.innerText = diffText;
      }
    }
  }

  async confirmCashCount() {
    const btnConfirm = document.getElementById('btn-confirm-cash-counter');
    if (btnConfirm) btnConfirm.disabled = true;

    try {
      let total = 0;
      const inputs = document.querySelectorAll('#form-cash-counter .cash-qty-input');
      const details = {};
      
      inputs.forEach(input => {
        const denom = parseInt(input.getAttribute('data-denom'), 10);
        const qty = parseInt(input.value, 10) || 0;
        total += denom * qty;
        details[denom] = qty;
      });
      
      if (this.cashCounterMode === 'open') {
        // เปิดกะใหม่
        this.state.shift = {
          active: true,
          startTime: Date.now(),
          startCash: total,
          startDetails: details,
          expenses: [],
          history: this.state.shift.history || []
        };
        
        await this.saveState();
        this.closeModal('modal-cash-counter');
        this.renderAll();
        this.vibrateDevice(100);
        
        this.showToast(`เปิดกะเรียบร้อยแล้วด้วยเงินสดเริ่มต้น ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, 'info');
      } else {
        // ปิดกะ
        const startTime = this.state.shift.startTime;
        // Guard ชั้นสุดท้าย — ถ้าหลุดมาถึงตรงนี้โดยไม่มีกะเปิดอยู่ ห้ามบันทึกประวัติกะปลอมเด็ดขาด
        if (!this.state.shift.active || !startTime) {
          this.showToast('ไม่พบข้อมูลกะที่เปิดอยู่ — ยกเลิกการปิดกะ', 'error');
          this.closeModal('modal-cash-counter');
          return;
        }
        const startCash = this.state.shift.startCash || 0;
        
        const cashSales = this.state.transactions
          .filter(tx => {
            const txTime = new Date(tx.date).getTime();
            return txTime >= startTime && tx.paymentMethod === 'cash';
          })
          .reduce((sum, tx) => sum + tx.total, 0);
        
        const expensesTotal = (this.state.shift.expenses || [])
          .reduce((sum, e) => sum + e.amount, 0);
          
        const expectedTotal = startCash + cashSales - expensesTotal;
        const diff = total - expectedTotal;
        
        // บันทึกประวัติกะ
        const shiftLog = {
          startTime: startTime,
          endTime: Date.now(),
          startCash: startCash,
          startDetails: this.state.shift.startDetails,
          countedCash: total,
          countedDetails: details,
          expectedCash: expectedTotal,
          cashSales: cashSales,
          expenses: this.state.shift.expenses || [],
          expensesTotal: expensesTotal,
          difference: diff,
          closedBy: this.currentUser ? this.currentUser.name : ''
        };
        
        if (!this.state.shift.history) {
          this.state.shift.history = [];
        }
        this.state.shift.history.push(shiftLog);
        
        // เก็บงานคลาวด์ (สรุปวัน/เดือน + Telegram) ลง outbox ที่ persist ไว้ก่อน
        // → "การันตีส่ง" แม้ปิดกะตอนออฟไลน์ แล้ว retry เองเมื่อเน็ตกลับ/เปิดแอปใหม่
        this.enqueueShiftCloseCloudOps(shiftLog);

        // ส่งสำรองข้อมูลอัตโนมัติขึ้น Google Drive ตอนปิดกะ (best-effort ครั้งเดียว)
        await this.autoBackupToGoogleDrive();

        // สลับสถานะเป็นไม่ได้ทำงาน
        this.state.shift.active = false;
        this.state.shift.startTime = null;
        this.state.shift.startCash = 0;
        this.state.shift.startDetails = {};
        this.state.shift.expenses = [];
        
        // ล้างข้อมูลตะกร้า คิว และสถานะชั่วคราว
        this.state.cart = [];
        this.state.queue = [];
        
        await this.saveState();

        // ออนไลน์อยู่แล้วก็ส่ง outbox ทันที (ถ้าออฟไลน์ จะค้างไว้ retry เองตอนเน็ตกลับ/เปิดแอป)
        this.flushCloudOutbox();

        this.closeModal('modal-cash-counter');
        this.renderAll();
        this.vibrateDevice(150);
        
        this.showToast('ปิดร้านเรียบร้อยแล้ว! ข้อมูลคิวงานและตะกร้าของกะที่ผ่านมาได้รับการรีเซ็ตเพื่อเตรียมพร้อมสำหรับกะใหม่', 'info');
        
        // นำพาผู้ใช้งานกลับเข้าโหมดบล็อกเพื่อเริ่มวันใหม่ (หน่วงเวลาเพื่อให้ UI เรนเดอร์และโมดัลปิดเสร็จสิ้นก่อน)
        setTimeout(() => {
          this.openCashCounter('open');
        }, 500);
      }
    } catch (err) {
      console.error('Confirm cash count failed:', err);
      this.showToast('เกิดข้อผิดพลาดในการยืนยันยอดเงิน: ' + err.message, 'error');
      if (btnConfirm) btnConfirm.disabled = false;
    }
  }

  onExpenseTypeChange() {
    const type = document.getElementById('expense-type').value;
    const staffContainer = document.getElementById('expense-staff-container');
    const noteContainer = document.getElementById('expense-note-container');
    
    if (type === 'staff') {
      if (staffContainer) staffContainer.style.display = 'block';
      if (noteContainer) noteContainer.style.display = 'none';
    } else {
      if (staffContainer) staffContainer.style.display = 'none';
      if (noteContainer) noteContainer.style.display = 'block';
    }
  }

  async addExpense(event) {
    if (event) event.preventDefault();
    if (!this.state.shift.active) {
      this.showToast('กรุณาเปิดกะลิ้นชักเงินสดก่อนบันทึกค่าใช้จ่าย!', 'info');
      return;
    }
    
    const type = document.getElementById('expense-type').value;
    const amountInput = document.getElementById('expense-amount');
    const amount = parseFloat(amountInput.value) || 0;
    
    if (amount <= 0) {
      this.showToast('กรุณาระบุจำนวนเงินที่ถูกต้อง!', 'info');
      return;
    }
    
    let note = '';
    if (type === 'staff') {
      const staffId = document.getElementById('expense-staff-id').value;
      const staff = this.state.staff.find(st => st.id === staffId);
      note = staff ? `จ่ายเงินรายวัน: ${staff.name}` : 'จ่ายเงินรายวันพนักงาน';
    } else if (type === 'supply') {
      const noteInput = document.getElementById('expense-note');
      const detail = noteInput ? noteInput.value.trim() : '';
      note = `ซื้อของอื่นๆ: ${detail || 'ไม่ได้ระบุรายละเอียด'}`;
    } else {
      const noteInput = document.getElementById('expense-note');
      const detail = noteInput ? noteInput.value.trim() : '';
      note = detail || 'ค่าใช้จ่ายอื่นๆ';
    }
    
    const expenseItem = {
      id: 'exp_' + Date.now(),
      type: type,
      amount: amount,
      note: note,
      time: Date.now()
    };
    
    if (!this.state.shift.expenses) {
      this.state.shift.expenses = [];
    }
    this.state.shift.expenses.push(expenseItem);
    
    await this.saveState();
    
    // reset inputs
    if (amountInput) amountInput.value = '';
    const noteInput = document.getElementById('expense-note');
    if (noteInput) noteInput.value = '';
    
    this.renderDashboard();
    this.vibrateDevice(50);
  }

  deleteExpense(expenseId) {
    this.showConfirm('คุณต้องการลบรายการค่าใช้จ่ายนี้ใช่หรือไม่?', async () => {
      if (this.state.shift && this.state.shift.expenses) {
        this.state.shift.expenses = this.state.shift.expenses.filter(e => e.id !== expenseId);
        await this.saveState();
        this.renderDashboard();
        this.vibrateDevice(50);
      }
    });
  }

  vibrateDevice(ms) {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  // ขอ persistent storage — กันเบราว์เซอร์ลบ IndexedDB ทิ้งตอนพื้นที่ไม่พอ (ช่วยเรื่องข้อมูลไม่หาย โดยเฉพาะ iOS)
  async requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const already = await navigator.storage.persisted();
        if (!already) {
          const granted = await navigator.storage.persist();
          console.log('[Storage] persistent storage =', granted);
        }
      }
    } catch (e) {
      console.warn('[Storage] persist check failed', e);
    }
  }

  // แสดงเวอร์ชันแอปในหน้าตั้งค่า (ถ้ามี element รองรับ)
  showAppVersion() {
    const el = document.getElementById('app-version-label');
    if (el) el.innerText = 'เวอร์ชัน ' + APP_VERSION;
    // footer แถบข้าง — เดิม hardcode "v1.0.0" ใน HTML ไม่ตรงกับเวอร์ชันจริง
    const sideEl = document.getElementById('sidebar-version-label');
    if (sideEl) sideEl.innerText = 'เวอร์ชัน ' + APP_VERSION;
  }

  // นำชื่อร้านที่ตั้งค่าไว้ไปแสดงทุกจุดบนหน้าจอ (hero แดชบอร์ด, โลโก้แถบข้าง, ชื่อแท็บ)
  applyShopName() {
    const name = (this.shopName || 'Erotica Barber & Massage').trim();
    // 1) ชื่อร้านใหญ่บนหน้าแดชบอร์ด
    const hero = document.querySelector('.hero-shop-name');
    if (hero) hero.textContent = name;
    // 2) ชื่อร้านบนโลโก้แถบข้าง + ตัวอักษรย่อในไอคอน
    const brandName = document.querySelector('.brand-info h2');
    if (brandName) brandName.textContent = name;
    const brandLogo = document.querySelector('.brand-logo');
    if (brandLogo) {
      if (this.shopLogo) {
        brandLogo.innerHTML = `<img src="${this.shopLogo}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">`;
      } else {
        brandLogo.textContent = (name.charAt(0) || 'E').toUpperCase();
      }
    }
    // 2b) คำโปรย/ชื่อรอง ใต้ชื่อร้านบนแถบข้าง
    const brandTagline = document.querySelector('.brand-info p');
    if (brandTagline) brandTagline.textContent = (this.shopTagline || 'BARBER & MASSAGE').trim();
    // 3) ชื่อบนแท็บเบราว์เซอร์
    if (typeof document !== 'undefined') document.title = name + ' - POS';
  }

  // ค้นหาบริการในหน้า POS (กรองตามชื่อ ร่วมกับหมวดที่เลือก)
  onServiceSearch(val) {
    this.state.serviceSearch = val || '';
    this.renderPos();
  }

  // สลับธีม สว่าง/มืด แล้วบันทึก
  toggleTheme() {
    this.theme = (this.theme === 'light') ? 'dark' : 'light';
    this.applyTheme();
    this.saveState();
    this.showToast(this.theme === 'light' ? 'เปลี่ยนเป็นโหมดสว่างแล้ว' : 'เปลี่ยนเป็นโหมดมืดแล้ว', 'info');
  }

  // นำธีมที่เลือกไปใช้กับทั้งหน้า + อัปเดตปุ่ม
  applyTheme() {
    const t = (this.theme === 'light') ? 'light' : 'dark';
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', t);
    }
    const iconClass = (t === 'light') ? 'fa-sun' : 'fa-moon';
    const text = (t === 'light') ? 'โหมดสว่าง' : 'โหมดมืด';
    // ปุ่มที่มีข้อความ (ใต้โลโก้ + ปุ่มอื่นถ้ามี)
    ['btn-theme-toggle', 'btn-theme-toggle-side'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${text}`;
    });
    // ปุ่มไอคอนอย่างเดียว (มือถือ/ไอแพด)
    const mb = document.getElementById('btn-theme-toggle-mobile');
    if (mb) mb.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
  }

  // อัปโหลดโลโก้ร้าน — ย่อขนาดอัตโนมัติแล้วเก็บเป็น data URL ใน IndexedDB
  handleLogoUpload(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      this.showToast('กรุณาเลือกไฟล์รูปภาพ (PNG/JPG)', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const max = 256;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const scale = Math.min(max / w, max / h);
            w = Math.round(w * scale); h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          this.shopLogo = canvas.toDataURL('image/png');
          await this.saveState();
          this.applyShopName();
          this.updateLogoPreview();
          this.showToast('อัปเดตโลโก้ร้านเรียบร้อยแล้ว', 'success');
        } catch (err) {
          console.error('Logo upload error:', err);
          this.showToast('บันทึกโลโก้ไม่สำเร็จ: ' + err.message, 'error');
        }
      };
      img.onerror = () => this.showToast('ไฟล์รูปไม่ถูกต้อง', 'error');
      img.src = e.target.result;
    };
    reader.onerror = () => this.showToast('อ่านไฟล์ไม่สำเร็จ', 'error');
    reader.readAsDataURL(file);
  }

  // ลบโลโก้ร้าน — กลับไปใช้ตัวอักษรย่อ
  async removeLogo() {
    this.shopLogo = '';
    await this.saveState();
    this.applyShopName();
    this.updateLogoPreview();
    const input = document.getElementById('shop-logo-input');
    if (input) input.value = '';
    this.showToast('ลบโลโก้ร้านแล้ว', 'info');
  }

  // อัปเดตภาพตัวอย่างโลโก้ในหน้าตั้งค่า
  updateLogoPreview() {
    const preview = document.getElementById('shop-logo-preview');
    if (!preview) return;
    if (this.shopLogo) {
      preview.innerHTML = `<img src="${this.shopLogo}" alt="logo" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      preview.innerHTML = '<span style="color:var(--text-muted);font-size:0.7rem;">ไม่มี</span>';
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      // รีโหลดครั้งเดียวเมื่อ SW ใหม่เข้าควบคุม — เฉพาะกรณี "อัปเดต" (มี controller เดิมอยู่แล้ว)
      // ไม่รีโหลดตอนติดตั้งครั้งแรก (hadController = false)
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        if (hadController) window.location.reload();
      });

      const register = () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('Service Worker Registered successfully', reg.scope);
            // ถ้ามีเวอร์ชันใหม่ "รอ" อยู่แล้วตั้งแต่เปิดแอป (ติดตั้งไว้รอบก่อนแต่ยังไม่กดอัปเดต) → แจ้งเลย
            if (reg.waiting && navigator.serviceWorker.controller) {
              this.promptAppUpdate(reg.waiting);
            }
            // ตรวจเจอเวอร์ชันใหม่ระหว่างใช้งาน → โชว์ปุ่ม "อัปเดตเลย"
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (!newWorker) return;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  this.promptAppUpdate(newWorker);
                }
              });
            });
            // เช็คอัปเดตเป็นระยะ เผื่อแอปเปิดค้างทั้งวันไม่ได้ปิด (ทุก 30 นาที)
            setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
          })
          .catch(err => console.log('Service Worker Registration failed', err));
      };

      if (document.readyState === 'complete') {
        register();
      } else {
        window.addEventListener('load', register);
      }
    }
  }

  // แถบแจ้ง "มีเวอร์ชันใหม่ — อัปเดตเลย" + ปุ่มกด → สั่ง SW ใหม่ทำงาน แล้วรีโหลดให้อัตโนมัติ
  promptAppUpdate(worker) {
    if (this._updateBannerShown) return;
    this._updateBannerShown = true;
    const bar = document.createElement('div');
    bar.id = 'app-update-bar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#fff;border:1px solid #334155;border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,.45);max-width:92vw;font-size:0.85rem;';
    const label = document.createElement('span');
    label.textContent = '🔄 มีเวอร์ชันใหม่ของแอป';
    const btn = document.createElement('button');
    btn.textContent = 'อัปเดตเลย';
    btn.style.cssText = 'background:#fbbf24;color:#1e293b;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;white-space:nowrap;';
    btn.onclick = () => {
      btn.disabled = true; btn.textContent = 'กำลังอัปเดต...';
      worker.postMessage({ type: 'SKIP_WAITING' }); // → SW activate → controllerchange → reload เอง
    };
    const later = document.createElement('button');
    later.textContent = 'ภายหลัง';
    later.style.cssText = 'background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:0.8rem;';
    later.onclick = () => bar.remove();
    bar.appendChild(label); bar.appendChild(btn); bar.appendChild(later);
    document.body.appendChild(bar);
  }

  selectReportType(type) {
    this.state.selectedReportType = type;
    
    const dailyTab = document.getElementById('report-tab-daily');
    const monthlyTab = document.getElementById('report-tab-monthly');
    const dateInput = document.getElementById('report-date-input');
    const monthInput = document.getElementById('report-month-input');
    const dateLabel = document.getElementById('report-date-label');
    
    if (type === 'daily') {
      if (dailyTab) dailyTab.classList.add('active');
      if (monthlyTab) monthlyTab.classList.remove('active');
      if (dateInput) dateInput.style.display = 'inline-block';
      if (monthInput) monthInput.style.display = 'none';
      if (dateLabel) dateLabel.innerText = 'ระบุวันที่:';
    } else {
      if (dailyTab) dailyTab.classList.remove('active');
      if (monthlyTab) monthlyTab.classList.add('active');
      if (dateInput) dateInput.style.display = 'none';
      if (monthInput) monthInput.style.display = 'inline-block';
      if (dateLabel) dateLabel.innerText = 'ระบุเดือน:';
    }
    
    this.filterReports();
  }

  filterReports() {
    const type = this.state.selectedReportType;
    const dateVal = document.getElementById('report-date-input').value;
    const monthVal = document.getElementById('report-month-input').value;

    let filtered = [];

    if (type === 'daily') {
      if (!dateVal) return;
      // กรองตาม "วันทำการ" — เลือกวันที่ 18 ได้ยอดทั้งคืน 11:00 → ตี 3 ของเช้าวันที่ 19
      filtered = this.state.transactions.filter(tx => {
        const txDateStr = this.getBusinessISODate(tx.date);
        return txDateStr === dateVal;
      });
    } else {
      if (!monthVal) return;
      // กรองตาม "เดือนทำการ" — บิลหลังเที่ยงคืนของคืนสิ้นเดือนนับเป็นเดือนเดิม
      filtered = this.state.transactions.filter(tx => {
        const txMonthStr = this.getBusinessISOMonth(tx.date);
        return txMonthStr === monthVal;
      });
    }

    // แปลงรายการบริการทั้งหมดในบิลให้อยู่ในรูปแบบอาเรย์แนวราบ (Flat array of service items) เพื่อความสะดวกในการคำนวณและกรอง
    const allServiceItems = [];
    filtered.forEach(tx => {
      if (tx.details && Array.isArray(tx.details)) {
        tx.details.forEach(item => {
          allServiceItems.push({
            txId: tx.id,
            txDate: tx.date,
            customerName: tx.customerName,
            paymentMethod: tx.paymentMethod,
            name: item.name,
            price: item.price,                                            // ราคาเต็มต่อหน่วย (แสดงคอลัมน์ "ราคา")
            netPrice: (item.netPrice != null ? item.netPrice : item.price), // ยอดหลังหักส่วนลด (ใช้รวมรายได้ให้ตรงกับ KPI/ชีต)
            staffId: item.staffId,
            staffName: item.staffName,
            commissionAmount: item.commissionAmount || 0
          });
        });
      } else {
        // Fallback สำหรับบิลเก่าหรือตัวอย่างระบบที่ไม่มีฟิลด์ details
        const fallbackStaffName = tx.staffNames && tx.staffNames[0] ? tx.staffNames[0] : 'ไม่ระบุ';
        let matchedStaff = this.state.staff.find(st => st.name === fallbackStaffName);
        let sId = matchedStaff ? matchedStaff.id : 'unknown';
        
        tx.services.forEach(sName => {
          const matchedService = this.state.services.find(s => s.name === sName);
          const price = matchedService ? matchedService.price : (tx.subtotal / tx.services.length);
          const commissionPercent = matchedService ? (matchedService.commission || 10) : 10;
          const commType = matchedService ? (matchedService.commissionType || 'percent') : 'percent';
          const commAmt = commType === 'fixed' ? commissionPercent : (price * commissionPercent) / 100;
          allServiceItems.push({
            txId: tx.id,
            txDate: tx.date,
            customerName: tx.customerName,
            paymentMethod: tx.paymentMethod,
            name: sName,
            price: price,
            // บิลเก่าไม่มี netPrice ต่อรายการ — เกลี่ยส่วนลดตามสัดส่วน (tx.total/tx.subtotal) ให้กระทบยอดได้
            netPrice: (tx.subtotal > 0 ? Math.round(price * (tx.total / tx.subtotal) * 100) / 100 : price),
            staffId: sId,
            staffName: fallbackStaffName,
            commissionAmount: commAmt
          });
        });
      }
    });

    // ดึงค่าตัวกรองพนักงาน
    const selectedStaffId = document.getElementById('report-staff-filter')?.value || 'all';
    
    // กรองบริการย่อยเฉพาะคนตามที่ต้องการ
    let displayItems = allServiceItems;
    if (selectedStaffId !== 'all') {
      displayItems = allServiceItems.filter(item => item.staffId === selectedStaffId);
    }

    // 1. คำนวณค่าทางสถิติ (KPIs)
    let totalSales = 0;
    let billCount = 0;
    let averageBill = 0;
    let popularService = '-';
    let commissionSum = 0;

    // คำนวณความถี่บริการยอดฮิต
    let serviceFreq = {};
    displayItems.forEach(item => {
      serviceFreq[item.name] = (serviceFreq[item.name] || 0) + 1;
    });

    let maxFreq = 0;
    for (const [name, freq] of Object.entries(serviceFreq)) {
      if (freq > maxFreq) {
        maxFreq = freq;
        popularService = name;
      }
    }

    const labelTotal = document.getElementById('report-label-total');
    const labelCount = document.getElementById('report-label-count');
    const labelAverage = document.getElementById('report-label-average');
    const labelPopular = document.getElementById('report-label-popular');

    if (selectedStaffId === 'all') {
      // โหมดรวมของร้านค้า: คำนวณจากยอดธุรกรรมรวมจริง
      totalSales = filtered.reduce((sum, tx) => sum + tx.total, 0);
      billCount = filtered.length;
      averageBill = billCount > 0 ? (totalSales / billCount) : 0;
      
      if (labelTotal) labelTotal.innerText = 'ยอดขายรวม';
      if (labelCount) labelCount.innerText = 'จำนวนบิลทั้งหมด';
      if (labelAverage) labelAverage.innerText = 'ยอดเฉลี่ยต่อบิล';
      if (labelPopular) labelPopular.innerText = 'บริการฮิตที่สุด';

      document.getElementById('report-kpi-total').innerText = `฿${totalSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      document.getElementById('report-kpi-count').innerText = `${billCount} บิล`;
      document.getElementById('report-kpi-average').innerText = `฿${averageBill.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      document.getElementById('report-kpi-popular').innerText = popularService;
    } else {
      // โหมดพนักงานเฉพาะบุคคล: สรุปผลงานและคอมมิชชั่นสะสม
      totalSales = displayItems.reduce((sum, item) => sum + item.netPrice, 0); // ยอดหลังหักส่วนลด
      billCount = displayItems.length;
      commissionSum = displayItems.reduce((sum, item) => sum + item.commissionAmount, 0);

      if (labelTotal) labelTotal.innerText = 'ยอดบริการพนักงาน';
      if (labelCount) labelCount.innerText = 'จำนวนงานบริการ';
      if (labelAverage) labelAverage.innerText = 'ค่าคอมมิชชั่นสะสม';
      if (labelPopular) labelPopular.innerText = 'งานที่ทำบ่อยที่สุด';

      document.getElementById('report-kpi-total').innerText = `฿${totalSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      document.getElementById('report-kpi-count').innerText = `${billCount} งาน`;
      document.getElementById('report-kpi-average').innerText = `฿${commissionSum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      document.getElementById('report-kpi-popular').innerText = popularService;
    }

    // กรองบิลธุรกรรมสำหรับวาดกราฟและตารางประวัติธุรกรรม
    const allowedTxIds = new Set(displayItems.map(item => item.txId));
    const filteredTransactionsForTable = filtered.filter(tx => allowedTxIds.has(tx.id));

    // 2. เรนเดอร์แผนภูมิ CSS Bar Chart
    this.renderReportsChart(filteredTransactionsForTable, type, dateVal, monthVal);

    // 2.5 คำนวณค่าคอมมิชชั่นพนักงาน (ของตารางเปรียบเทียบ)
    const staffCommissions = {};
    // เตรียมข้อมูลตั้งต้นสำหรับพนักงานทุกคนที่มีในระบบ
    this.state.staff.forEach(st => {
      staffCommissions[st.id] = {
        id: st.id,
        name: st.name,
        role: st.role,
        count: 0,
        salesSum: 0,
        commissionSum: 0
      };
    });

    allServiceItems.forEach(item => {
      let sId = item.staffId;
      if (!staffCommissions[sId]) {
        staffCommissions[sId] = {
          id: sId,
          name: item.staffName || 'ไม่ได้ระบุ',
          role: 'ผู้ให้บริการ',
          count: 0,
          salesSum: 0,
          commissionSum: 0
        };
      }
      staffCommissions[sId].count += 1;
      staffCommissions[sId].salesSum += item.netPrice; // ยอดขายหลังหักส่วนลด (ตรงกับชีต Google)
      staffCommissions[sId].commissionSum += item.commissionAmount;
    });

    // กรองตารางเปรียบเทียบค่าคอมพนักงานหากเลือกคนเดียว
    let displayedCommissions = Object.values(staffCommissions);
    if (selectedStaffId !== 'all') {
      displayedCommissions = displayedCommissions.filter(sc => sc.id === selectedStaffId);
    }

    // แสดงผลตารางส่วนแบ่งพนักงาน
    const commissionTableBody = document.getElementById('report-commission-body');
    if (commissionTableBody) {
      if (displayedCommissions.length === 0) {
        commissionTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state" style="text-align: center;">
              ไม่มีข้อมูลส่วนแบ่งค่าคอมมิชชั่นของพนักงานคนนี้
            </td>
          </tr>`;
      } else {
        commissionTableBody.innerHTML = displayedCommissions.map(sc => `
          <tr>
            <td><strong>${escapeHtml(sc.name)}</strong></td>
            <td>${escapeHtml(sc.role)}</td>
            <td>${sc.count} งาน</td>
            <td>฿${sc.salesSum.toLocaleString('th-TH')}</td>
            <td style="font-weight:700; color: var(--color-success);">฿${sc.commissionSum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
          </tr>
        `).join('');
      }
    }

    // คำนวณยอดขายแยกตามรายการบริการ
    const serviceSales = {};
    displayItems.forEach(item => {
      const sName = item.name;
      if (!serviceSales[sName]) {
        const matchedService = this.state.services.find(s => s.name === sName);
        const category = matchedService ? matchedService.category : 'ทั่วไป';
        serviceSales[sName] = {
          name: sName,
          category: category,
          count: 0,
          price: item.price,
          totalRevenue: 0
        };
      }
      serviceSales[sName].count += 1;
      serviceSales[sName].totalRevenue += item.netPrice; // รายได้หลังหักส่วนลด ให้รวมแล้วตรงกับ KPI ยอดรวม
    });

    const catMap = {
      'barber': 'ตัดผมชาย (Barber)',
      'massage': 'นวดผ่อนคลาย (Massage)',
      'premium': 'แพ็คเกจพรีเมียม (Premium)',
      'ทั่วไป': 'ทั่วไป'
    };

    const sortedServices = Object.values(serviceSales).sort((a, b) => b.totalRevenue - a.totalRevenue);

    const breakdownTableBody = document.getElementById('report-services-breakdown-body');
    if (breakdownTableBody) {
      if (sortedServices.length === 0) {
        breakdownTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state" style="text-align: center;">
              <i class="fa-solid fa-list-check" style="display:block; margin: 10px 0;"></i> ไม่มีรายการขายในรอบการค้นหา
            </td>
          </tr>`;
      } else {
        breakdownTableBody.innerHTML = sortedServices.map(item => {
          const categoryText = catMap[item.category] || item.category || 'ทั่วไป';
          return `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td><span class="service-category-badge badge-${item.category || 'general'}">${categoryText}</span></td>
              <td>${item.count} ครั้ง</td>
              <td>฿${item.price.toLocaleString('th-TH')}</td>
              <td style="font-weight:700; color: var(--accent-massage);">฿${item.totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // 3. แสดงผลตารางธุรกรรมย้อนหลัง
    const tableBody = document.getElementById('report-transactions-body');
    if (filteredTransactionsForTable.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state" style="text-align: center;">
            <i class="fa-solid fa-receipt" style="display:block; margin: 10px 0;"></i> ไม่มีรายการธุรกรรมในรอบที่ระบุ
          </td>
        </tr>`;
    } else {
      tableBody.innerHTML = filteredTransactionsForTable.map(tx => {
        const timeStr = new Date(tx.date).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' });
        
        // แสดงชื่อบริการของพนักงานคนนี้ หรือบริการทั้งหมดในบิล
        let displayedServices = tx.services;
        let displayTotalHTML = '';
        if (selectedStaffId !== 'all') {
          // คัดแยกเฉพาะบริการในบิลนั้นที่ทำโดยพนักงานที่เลือกจริง ๆ
          if (tx.details && Array.isArray(tx.details)) {
            const staffDetails = tx.details.filter(d => d.staffId === selectedStaffId);
            displayedServices = staffDetails.map(d => d.name);
            const staffTotal = staffDetails.reduce((sum, d) => sum + (d.netPrice != null ? d.netPrice : d.price), 0);
            displayTotalHTML = `฿${staffTotal.toLocaleString('th-TH')}<br><span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">เต็มบิล: ฿${tx.total.toLocaleString('th-TH')}</span>`;
          } else {
            displayTotalHTML = `฿${tx.total.toLocaleString('th-TH')}`;
          }
        } else {
          displayTotalHTML = `฿${tx.total.toLocaleString('th-TH')}`;
        }
        
        return `
          <tr>
            <td><strong>${tx.id}</strong></td>
            <td>${timeStr} น.</td>
            <td>${escapeHtml(tx.customerName)}</td>
            <td>${displayedServices.map(escapeHtml).join(', ')}</td>
            <td><span style="font-size:0.75rem; text-transform: uppercase;">${tx.paymentMethod === 'promptpay' ? 'Scan' : tx.paymentMethod === 'credit' ? 'Credit' : 'เงินสด'}</span></td>
            <td style="font-weight:700; color: var(--accent-barber); line-height: 1.2;">${displayTotalHTML}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-small secondary" onclick="app.viewHistoricalReceipt('${tx.id}')">
                  <i class="fa-solid fa-eye"></i> บิล
                </button>
                <button class="btn-small primary" onclick="app.openTransactionEdit('${tx.id}')" style="background: linear-gradient(135deg, var(--accent-barber), #e0a91f); color: var(--bg-app); border: none;">
                  <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // กรองประวัติการเปิด-ปิดร้าน (ลิ้นชักเงินสด)
    const shiftTableBody = document.getElementById('report-shifts-body');
    if (shiftTableBody) {
      let filteredShifts = [];
      if (this.state.shift.history && Array.isArray(this.state.shift.history)) {
        if (type === 'daily') {
          // ใช้วันทำการ — กะที่ปิดตี 3 โผล่ใต้วันที่เปิดกะ (คืนเดียวกัน)
          filteredShifts = this.state.shift.history.filter(sh => {
            const shDateStr = this.getBusinessISODate(sh.endTime || sh.startTime);
            return shDateStr === dateVal;
          });
        } else {
          filteredShifts = this.state.shift.history.filter(sh => {
            const shMonthStr = this.getBusinessISOMonth(sh.endTime || sh.startTime);
            return shMonthStr === monthVal;
          });
        }
      }

      if (filteredShifts.length === 0) {
        shiftTableBody.innerHTML = `
          <tr>
            <td colspan="8" class="empty-state" style="text-align: center;">
              <i class="fa-solid fa-calculator" style="display:block; margin: 10px 0;"></i> ไม่มีข้อมูลการเปิด-ปิดร้านในรอบที่ระบุ
            </td>
          </tr>`;
      } else {
        shiftTableBody.innerHTML = filteredShifts.map(sh => {
          const openTimeStr = new Date(sh.startTime).toLocaleString('th-TH');
          const closeTimeStr = sh.endTime ? new Date(sh.endTime).toLocaleString('th-TH') : 'กำลังทำงาน';
          const diff = sh.difference || 0;
          let diffText = `฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
          let diffColor = 'var(--text-primary)';
          if (diff > 0) {
            diffText = `+฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (เกิน)`;
            diffColor = 'var(--accent-massage)';
          } else if (diff < 0) {
            diffText = `฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (ขาด)`;
            diffColor = 'var(--accent-premium)';
          } else {
            diffText = '฿0.00 (ตรง)';
            diffColor = 'var(--color-success)';
          }

          const expensesTotal = sh.expensesTotal || (sh.expenses || []).reduce((sum, e) => sum + e.amount, 0);

          return `
            <tr>
              <td>${openTimeStr}</td>
              <td>${closeTimeStr}${sh.closedBy ? `<br><span style="font-size:0.7rem;color:var(--text-muted);">โดย ${escapeHtml(sh.closedBy)}</span>` : ''}</td>
              <td>฿${sh.startCash.toLocaleString('th-TH')}</td>
              <td>฿${(sh.cashSales || 0).toLocaleString('th-TH')}</td>
              <td style="color: var(--accent-premium);">฿${(expensesTotal || 0).toLocaleString('th-TH')}</td>
              <td>฿${(sh.expectedCash || 0).toLocaleString('th-TH')}</td>
              <td>฿${(sh.countedCash || 0).toLocaleString('th-TH')}</td>
              <td style="font-weight: 700; color: ${diffColor};">${diffText}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // เรนเดอร์แผนภูมิแบบ CSS แท้ ๆ
  renderReportsChart(transactions, type, dateVal, monthVal) {
    const chartContainer = document.getElementById('css-bar-chart');
    const labelsContainer = document.getElementById('css-bar-chart-labels');
    
    if (transactions.length === 0) {
      chartContainer.innerHTML = `<div style="width:100%; text-align:center; color: var(--text-muted); font-size:0.85rem; padding-bottom: 40px;">ไม่มีข้อมูลยอดขายเพื่อแสดงในกราฟ</div>`;
      labelsContainer.innerHTML = '';
      return;
    }

    let dataPoints = [];
    let maxVal = 100; // ค่าเริ่มต้นแกน Y เพื่อไม่ให้หารศูนย์

    if (type === 'daily') {
      // รายวัน: แสดงตามช่วงเวลา (แบ่งเป็นช่วงเช้า 08:00 - 11:00, บ่าย 11:00 - 14:00, 14:00 - 17:00, 17:00 - 20:00, 20:00 - 23:00)
      // เรียงตาม "วันทำการ" ของร้าน (เปิด 11:00 → ปิดตี 3): ช่วงหลังเที่ยงคืนต่อท้ายกราฟ ไม่ใช่ขึ้นต้น
      // ช่วงขอบ (ก่อนเปิด 06-11 / ท้ายดึก 02-06) แสดงเฉพาะเมื่อมียอดจริง
      const hourlyBlocks = [
        { label: 'ก่อนเปิด (06-11)', sum: 0, edge: true },
        { label: '11:00-14:00', sum: 0 },
        { label: '14:00-17:00', sum: 0 },
        { label: '17:00-20:00', sum: 0 },
        { label: '20:00-23:00', sum: 0 },
        { label: '23:00-02:00', sum: 0 },
        { label: '02:00-06:00', sum: 0, edge: true }
      ];

      transactions.forEach(tx => {
        const hour = new Date(tx.date).getHours();
        if (hour >= 6 && hour < 11) hourlyBlocks[0].sum += tx.total;
        else if (hour >= 11 && hour < 14) hourlyBlocks[1].sum += tx.total;
        else if (hour >= 14 && hour < 17) hourlyBlocks[2].sum += tx.total;
        else if (hour >= 17 && hour < 20) hourlyBlocks[3].sum += tx.total;
        else if (hour >= 20 && hour < 23) hourlyBlocks[4].sum += tx.total;
        else if (hour >= 23 || hour < 2) hourlyBlocks[5].sum += tx.total;
        else hourlyBlocks[6].sum += tx.total; // 02:00-05:59
      });

      dataPoints = hourlyBlocks.filter(b => !b.edge || b.sum > 0);
    } else {
      // รายเดือน: แสดงเป็น 5 สัปดาห์
      const weeklyBlocks = [
        { label: 'สัปดาห์ 1 (ว. 1-7)', sum: 0 },
        { label: 'สัปดาห์ 2 (ว. 8-14)', sum: 0 },
        { label: 'สัปดาห์ 3 (ว. 15-21)', sum: 0 },
        { label: 'สัปดาห์ 4 (ว. 22-28)', sum: 0 },
        { label: 'สัปดาห์ 5 (ว. 29-31)', sum: 0 }
      ];

      transactions.forEach(tx => {
        const day = new Date(this.getBusinessTime(tx.date)).getDate(); // วันทำการ — บิลตี 2 นับเป็นวันก่อนหน้า
        if (day >= 1 && day <= 7) weeklyBlocks[0].sum += tx.total;
        else if (day >= 8 && day <= 14) weeklyBlocks[1].sum += tx.total;
        else if (day >= 15 && day <= 21) weeklyBlocks[2].sum += tx.total;
        else if (day >= 22 && day <= 28) weeklyBlocks[3].sum += tx.total;
        else weeklyBlocks[4].sum += tx.total;
      });

      dataPoints = weeklyBlocks;
    }

    maxVal = Math.max(...dataPoints.map(p => p.sum), 100);

    // เรนเดอร์แท่งกราฟ
    chartContainer.innerHTML = dataPoints.map(p => {
      const heightPercent = Math.max(4, Math.floor((p.sum / maxVal) * 100)); // อย่างน้อย 4%
      return `
        <div class="chart-bar-wrapper">
          <div class="chart-bar-fill" style="height: ${heightPercent}%;">
            <div class="chart-bar-tooltip">฿${p.sum.toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');

    // เรนเดอร์คำอธิบาย
    labelsContainer.innerHTML = dataPoints.map(p => `
      <div style="flex:1; text-align:center;">${p.label}</div>
    `).join('');
  }

  // เปิดดูใบเสร็จย้อนหลังจากประวัติ
  viewHistoricalReceipt(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (tx) {
      this.showThermalReceipt(tx);
    }
  }

  // เปิดโมเดลแก้ไขรายการขายย้อนหลัง
  openTransactionEdit(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-id-display').value = tx.id;
    document.getElementById('edit-tx-customer').value = tx.customerName;
    document.getElementById('edit-tx-payment').value = tx.paymentMethod;
    document.getElementById('edit-tx-discount').value = tx.discount || 0;
    document.getElementById('edit-tx-total').value = `฿${tx.total.toLocaleString('th-TH')}`;

    // แปลงรายการบริการให้มีรายละเอียดหากเป็นบิลเก่าหรือบิลที่ต้องการจัดโครงสร้างใหม่
    if (!tx.details || !Array.isArray(tx.details)) {
      tx.details = tx.services.map(sName => {
        const matchedService = this.state.services.find(s => s.name === sName);
        const price = matchedService ? matchedService.price : (tx.subtotal / tx.services.length);
        const commissionPercent = matchedService ? (matchedService.commission || 10) : 10;
        const commType = matchedService ? (matchedService.commissionType || 'percent') : 'percent';
        const commAmt = commType === 'fixed' ? commissionPercent : (price * commissionPercent) / 100;
        
        const fallbackStaffName = tx.staffNames && tx.staffNames[0] ? tx.staffNames[0] : 'ไม่ระบุ';
        const matchedStaff = this.state.staff.find(st => st.name === fallbackStaffName);
        const staffId = matchedStaff ? matchedStaff.id : 'unknown';

        return {
          name: sName,
          price: price,
          staffId: staffId,
          staffName: fallbackStaffName,
          commissionAmount: commAmt,
          commission: commissionPercent,
          commissionType: commType
        };
      });
    }

    const servicesContainer = document.getElementById('edit-tx-services-list');
    servicesContainer.innerHTML = tx.details.map((item, idx) => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary);">${escapeHtml(item.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">฿${item.price}</div>
          </div>
          <div style="width: 150px;">
            <select class="form-input edit-tx-service-staff-select" data-index="${idx}" style="font-size: 0.85rem; padding: 4px 8px; height: 34px; background: var(--bg-surface-solid); border-radius: var(--border-radius-sm);">
              ${this.state.staff.map(st => `<option value="${st.id}" ${st.id === item.staffId ? 'selected' : ''}>${escapeHtml(st.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    }).join('');

    this.openModal('modal-edit-transaction');
  }

  // คำนวณยอดรวมสุทธิระหว่างแก้ไขแบบเรียลไทม์
  recalculateEditTxTotal() {
    const txId = document.getElementById('edit-tx-id').value;
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    let subtotal = 0;
    tx.details.forEach(item => {
      subtotal += item.price;
    });

    const rawDiscount = parseFloat(document.getElementById('edit-tx-discount').value) || 0;
    const discount = Math.min(Math.max(0, rawDiscount), subtotal); // clamp เหมือนตอนบันทึกจริง
    const total = Math.max(0, subtotal - discount);

    document.getElementById('edit-tx-total').value = `฿${total.toLocaleString('th-TH')}`;
  }

  // บันทึกการแก้ไขธุรกรรมย้อนหลัง
  async saveTransactionEdit() {
    if (this.currentRole !== 'owner') {
      this.showToast('การแก้ไขบิลทำได้เฉพาะเจ้าของร้าน', 'warning');
      return;
    }
    const txId = document.getElementById('edit-tx-id').value;
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    // 1. อัปเดตข้อมูลทั่วไป
    tx.customerName = document.getElementById('edit-tx-customer').value.trim() || 'ลูกค้าทั่วไป';
    tx.paymentMethod = document.getElementById('edit-tx-payment').value;

    // 2. อัปเดตพนักงานในแต่ละบริการของบิล
    const staffSelects = document.querySelectorAll('.edit-tx-service-staff-select');
    staffSelects.forEach(select => {
      const idx = parseInt(select.getAttribute('data-index'), 10);
      const staffId = select.value;
      const staffMember = this.state.staff.find(st => st.id === staffId);
      if (tx.details[idx] && staffMember) {
        tx.details[idx].staffId = staffMember.id;
        tx.details[idx].staffName = staffMember.name;
      }
    });

    // อัปเดตรายชื่อพนักงานสำหรับหน้าประวัติทั่วไป
    tx.staffNames = [...new Set(tx.details.map(d => d.staffName))];

    // 3. คำนวณยอดเงินและส่วนลดใหม่
    let subtotal = 0;
    tx.details.forEach(item => {
      subtotal += item.price;
    });
    const rawDiscount = parseFloat(document.getElementById('edit-tx-discount').value) || 0;
    const discount = Math.min(Math.max(0, rawDiscount), subtotal); // clamp — กันพิมพ์ค่าติดลบ/เกินยอด
    const total = Math.max(0, subtotal - discount);

    // คำนวณราคาหลังหักส่วนลด + ค่าคอมใหม่ต่อรายการ (สูตรเดียวกับตอนขาย รวมเกลี่ยเศษสตางค์)
    const netPrices = this.distributeDiscount(tx.details.map(d => d.price), subtotal, discount);
    tx.details.forEach((item, i) => {
      item.netPrice = netPrices[i];
      const commType = item.commissionType || 'percent';
      const commVal = item.commission || 0;
      item.commissionAmount = commType === 'fixed' ? commVal : Math.round(item.netPrice * commVal) / 100;
    });

    tx.subtotal = subtotal;
    tx.discount = discount;
    tx.total = total;
    tx.rev = (tx.rev || 0) + 1; // เวอร์ชันการแก้ไข — ให้รอบ sync ที่กำลังส่งข้อมูลเก่าอยู่รู้ว่าห้าม mark synced ทับ
    tx.syncStatus = 'pending'; // ตั้งค่าเป็น pending เพื่อให้ระบบซิงก์ใหม่

    // รีเฟรชชีตสรุปวัน/เดือนของวันที่บิลนั้น (ผ่าน outbox — retry เองถ้าออฟไลน์) ให้ KPI บนชีตตรงกับบิลที่แก้
    this.enqueueSummaryRefresh(tx.date);

    await this.saveState();
    this.closeModal('modal-edit-transaction');
    this.filterReports(); // โหลดตารางใหม่
    this.syncPendingTransactions(true); // ซิงก์ขึ้น Google Sheets อัตโนมัติ (เบื้องหลัง)
    this.flushCloudOutbox(); // ส่งสรุปที่คิวไว้ทันทีถ้าออนไลน์
    this.showToast('แก้ไขข้อมูลธุรกรรมเรียบร้อยแล้ว', 'info');
  }

  // ลบรายการธุรกรรมย้อนหลัง (Void)
  async voidTransaction() {
    const txId = document.getElementById('edit-tx-id').value;
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    if (this.currentRole !== 'owner' && this.currentRole !== 'manager') {
      this.showToast('เฉพาะผู้จัดการหรือเจ้าของร้านเท่านั้นที่ยกเลิกบิลได้', 'warning');
      return;
    }

    this.showConfirm('คุณแน่ใจหรือไม่ที่จะทำการลบรายการขายนี้? การกระทำนี้ไม่สามารถย้อนกลับได้', async () => {
      // (การลบแถวบิลในชีต Google ย้ายไปทำผ่าน outbox ด้านล่าง เพื่อ retry ได้เมื่อ void ตอนออฟไลน์)

      // คืนค่าจำนวนครั้งที่มาใช้บริการของลูกค้า (ถ้าบิลผูกกับลูกค้าที่ลงทะเบียนไว้)
      if (tx.customerId) {
        const cust = this.state.customers.find(c => c.id === tx.customerId);
        if (cust && cust.visitCount > 0) {
          cust.visitCount -= 1;
          cust.tier = cust.visitCount >= 10 ? 'แพลทินัม (Platinum)'
                    : cust.visitCount >= 5  ? 'ทอง (Gold)'
                    : 'ทั่วไป (General)';
        }
      }

      // ลบจากรายการในเครื่อง
      this.state.transactions = this.state.transactions.filter(t => t.id !== txId);

      // บันทึกประวัติการยกเลิกบิล (ใครยกเลิก / เมื่อไหร่ / ยอดเท่าไร)
      const voidRecord = {
        billId: tx.id, date: Date.now(),
        by: this.currentUser ? this.currentUser.name : '',
        amount: tx.total, customer: tx.customerName || '', services: tx.services || []
      };
      if (!Array.isArray(this.state.voidLog)) this.state.voidLog = [];
      this.state.voidLog.push(voidRecord);

      // คิวงานคลาวด์ของการ void (ลบแถวในชีต + รีเฟรชสรุป + Telegram) ลง outbox "ก่อน" save
      // → การันตีส่งแม้ void ตอนออฟไลน์ แล้ว retry เองเมื่อเน็ตกลับ (กันบิลที่ยกเลิกค้างในชีต)
      this.enqueueVoidCloudOps(tx, voidRecord);

      await this.saveState();

      // ออนไลน์อยู่แล้วก็ส่ง outbox ทันที (ออฟไลน์จะค้างไว้ retry เอง)
      this.flushCloudOutbox();

      this.closeModal('modal-edit-transaction');
      this.filterReports(); // โหลดตารางใหม่
      this.showToast('ลบรายการขายเรียบร้อยแล้ว', 'info');
    });
  }

  renderReports() {
    // โหลดรายชื่อผู้ให้บริการลงใน dropdown ตัวกรองหน้ารายงาน
    const staffFilter = document.getElementById('report-staff-filter');
    if (staffFilter) {
      const currentSelected = staffFilter.value || 'all';
      let optionsHtml = '<option value="all">พนักงานทุกคน (ทั้งหมด)</option>';
      this.state.staff.forEach(st => {
        optionsHtml += `<option value="${st.id}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`;
      });
      staffFilter.innerHTML = optionsHtml;
      staffFilter.value = currentSelected;
    }
    
    this.filterReports();
  }

  // ─── ส่งสรุปไป Sheets แบบ manual จากหน้ารายงาน ──────────────────────────
  async syncSummaryNow() {
    if (!this.googleSheetsUrl) {
      this.showToast('กรุณาตั้งค่า Google Sheets URL ก่อน', 'info');
      return;
    }

    const type    = this.state.selectedReportType; // 'daily' | 'monthly'
    const dateVal = document.getElementById('report-date-input')?.value;
    const monVal  = document.getElementById('report-month-input')?.value;

    if (type === 'daily') {
      if (!dateVal) { this.showToast('กรุณาเลือกวันที่ก่อน', 'info'); return; }
      const txs = this.state.transactions.filter(tx =>
        this.getBusinessISODate(tx.date) === dateVal
      );
      // หา expenses ของวันนั้น — รวมทั้งกะที่ปิดแล้วและกะที่ยังเปิดอยู่ (เดิมนับเฉพาะกะปิดแล้ว → ส่งกลางกะกำไรโชว์เกินจริง)
      const exp = this.getExpensesForDate(dateVal);

      this.updateSyncBadgeStatus('syncing', 1);
      await this.syncDailySummary(dateVal, txs, exp, false);
      this.checkSyncStatus();
    } else {
      if (!monVal) { this.showToast('กรุณาเลือกเดือนก่อน', 'info'); return; }
      const mm    = String(parseInt(monVal.split('-')[1])).padStart(2,'0');
      const yyyy  = monVal.split('-')[0];
      const key   = `${mm}-${yyyy}`; // "06-2026"

      this.updateSyncBadgeStatus('syncing', 1);
      await this.syncMonthlySummary(key, false);
      this.checkSyncStatus();
    }
  }

  async saveShopSettings() {
    const promptPayInput = document.getElementById('shop-promptpay-id');
    const pinInput = document.getElementById('shop-owner-pin');
    const sheetsUrlInput = document.getElementById('shop-sheets-sync-url');
    const telegramTokenInput = document.getElementById('shop-telegram-token');
    const telegramChatIdInput = document.getElementById('shop-telegram-chatid');

    const shopNameInput = document.getElementById('shop-name-input');
    if (shopNameInput) {
      this.shopName = shopNameInput.value.trim() || 'Erotica Barber & Massage';
    }
    const shopTaglineInput = document.getElementById('shop-tagline-input');
    if (shopTaglineInput) {
      this.shopTagline = shopTaglineInput.value.trim() || 'BARBER & MASSAGE';
    }
    const shopAddressInput = document.getElementById('shop-address-input');
    if (shopAddressInput) {
      this.shopAddress = shopAddressInput.value.trim();
    }
    const shopPhoneInput = document.getElementById('shop-phone-input');
    if (shopPhoneInput) {
      this.shopPhone = shopPhoneInput.value.trim();
    }
    if (promptPayInput) {
      const ppVal = promptPayInput.value.trim().replace(/[-\s]/g, '');
      if (ppVal === '') {
        this.shopPromptPayId = ''; // ปล่อยว่างได้ (จะปิดการรับเงินผ่าน QR จนกว่าจะตั้งค่า)
      } else if (/^(0\d{9}|\d{13}|\d{15})$/.test(ppVal)) {
        this.shopPromptPayId = ppVal;
      } else {
        // ผิดรูปแบบ — เตือนและคงค่าเดิมไว้ (ไม่ทับด้วยค่าที่ผิด) แต่ยังบันทึกการตั้งค่าอื่นต่อไป
        this.showToast('เลขพร้อมเพย์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet 15 หลัก จึงยังไม่บันทึกเลขพร้อมเพย์', 'warning', 5000);
        promptPayInput.value = this.shopPromptPayId || '';
      }
    }
    if (pinInput) {
      const pinVal = pinInput.value.trim();
      if (pinVal.length === 6 && /^\d{6}$/.test(pinVal)) {
        // hash ก่อนเก็บ — PIN จริงไม่ถูกเก็บในเครื่องแบบ plain text
        this.ownerPin = await this.hashPin(pinVal);
        pinInput.value = ''; // ล้างช่องหลังบันทึก
      } else if (pinVal.length > 0) {
        this.showToast('รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น!', 'info');
        pinInput.value = '';
      }
    }
    if (sheetsUrlInput) {
      this.googleSheetsUrl = sheetsUrlInput.value.trim();
      this.checkSyncStatus();
    }
    if (telegramTokenInput) {
      this.telegramToken = telegramTokenInput.value.trim();
    }
    if (telegramChatIdInput) {
      this.telegramChatId = telegramChatIdInput.value.trim();
    }
    await this.saveState();
    this.updateUserRoleUI();
    this.applyShopName();
  }

  // ==================== LOGIN / ROLES ====================
  // เติมฟิลด์บัญชีให้พนักงานเดิมที่ยังไม่มี accessLevel/pin (รันครั้งเดียวตอนเริ่ม)
  async migrateStaffAccountsIfNeeded() {
    let changed = false;
    (this.state.staff || []).forEach(s => {
      if (s.accessLevel === undefined) { s.accessLevel = 'staff'; changed = true; }
      if (s.pin === undefined) { s.pin = null; changed = true; }
    });
    if (changed) await this.saveState();
  }

  roleLabel(lvl) {
    return lvl === 'owner' ? 'เจ้าของร้าน' : (lvl === 'manager' ? 'ผู้จัดการ' : 'พนักงาน');
  }

  // แสดงหน้าเข้าสู่ระบบ (ล็อกเอาต์สถานะปัจจุบัน)
  requireLogin() {
    this.currentRole = null;
    this.currentUser = null;
    this.loginSelectedId = null;
    this.updateUserRoleUI();
    this.renderLoginOptions();
    const pinEl = document.getElementById('login-pin-input');
    if (pinEl) pinEl.value = '';
    this.openModal('modal-login');
  }

  // สร้างรายชื่อผู้ใช้ให้เลือก (เจ้าของร้าน + พนักงานที่ตั้ง PIN ไว้)
  renderLoginOptions() {
    const container = document.getElementById('login-user-list');
    if (!container) return;
    const badge = (lvl) => `<span class="login-role-badge ${lvl}">${this.roleLabel(lvl)}</span>`;
    let html = `<button type="button" class="login-user-btn" data-uid="__owner__" onclick="app.selectLoginUser('__owner__')">
        <span><i class="fa-solid fa-crown"></i> เจ้าของร้าน</span> ${badge('owner')}
      </button>`;
    (this.state.staff || []).filter(s => s.pin).forEach(s => {
      html += `<button type="button" class="login-user-btn" data-uid="${s.id}" onclick="app.selectLoginUser('${s.id}')">
        <span><i class="fa-solid fa-user"></i> ${escapeHtml(s.name)}</span>
      </button>`;
    });
    container.innerHTML = html;
  }

  // เลือกผู้ใช้ในหน้าล็อกอิน
  selectLoginUser(uid) {
    this.loginSelectedId = uid;
    document.querySelectorAll('#login-user-list .login-user-btn').forEach(b => {
      b.classList.toggle('selected', b.getAttribute('data-uid') === uid);
    });
    const pinEl = document.getElementById('login-pin-input');
    if (pinEl) { pinEl.value = ''; pinEl.focus(); }
  }

  // ตรวจ PIN แล้วเข้าสู่ระบบ
  async doLogin() {
    const uid = this.loginSelectedId;
    const pinEl = document.getElementById('login-pin-input');
    const pin = pinEl ? pinEl.value : '';
    if (!uid) { this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning'); return; }
    if (!pin) { this.showToast('กรุณากรอก PIN', 'warning'); if (pinEl) pinEl.focus(); return; }
    // Rate limit: ผิดติดกัน 5 ครั้ง → ล็อก 30 วินาที (ชะลอการเดา PIN หน้าเครื่อง)
    // เก็บสถานะลง localStorage ด้วย — เดิมอยู่ในหน่วยความจำอย่างเดียว refresh หน้าก็หลุดล็อก
    if (!this._loginGuardLoaded) {
      try {
        const g = JSON.parse(localStorage.getItem('epos_login_guard') || '{}');
        this._loginFails = g.fails || 0;
        this._loginLockUntil = g.lockUntil || 0;
      } catch (e) { /* ค่าใน storage เสีย — เริ่มนับใหม่ */ }
      this._loginGuardLoaded = true;
    }
    if (this._loginLockUntil && Date.now() < this._loginLockUntil) {
      const waitSec = Math.ceil((this._loginLockUntil - Date.now()) / 1000);
      this.showToast(`ใส่ PIN ผิดหลายครั้ง — รออีก ${waitSec} วินาทีแล้วลองใหม่`, 'error');
      return;
    }
    const hash = await this.hashPin(pin);
    if (uid === '__owner__') {
      if (hash === this.ownerPin) {
        this.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
        this.currentRole = 'owner';
        return this.completeLogin();
      }
    } else {
      const st = (this.state.staff || []).find(s => s.id === uid);
      if (st && st.pin && hash === st.pin) {
        this.currentUser = { id: st.id, name: st.name };
        this.currentRole = st.accessLevel || 'staff';
        return this.completeLogin();
      }
    }
    this.vibrateDevice(200);
    this._loginFails = (this._loginFails || 0) + 1;
    if (this._loginFails >= 5) {
      this._loginLockUntil = Date.now() + 30 * 1000;
      this._loginFails = 0;
      this.showToast('ใส่ PIN ผิดครบ 5 ครั้ง — ล็อกชั่วคราว 30 วินาที', 'error', 5000);
    } else {
      this.showToast('PIN ไม่ถูกต้อง', 'error');
    }
    try { localStorage.setItem('epos_login_guard', JSON.stringify({ fails: this._loginFails, lockUntil: this._loginLockUntil || 0 })); } catch (e) {}
    if (pinEl) { pinEl.value = ''; pinEl.focus(); }
  }

  completeLogin() {
    this._loginFails = 0;
    this._loginLockUntil = 0;
    try { localStorage.removeItem('epos_login_guard'); } catch (e) {}
    this.loginSelectedId = null;
    const pinEl = document.getElementById('login-pin-input');
    if (pinEl) pinEl.value = '';
    this.saveSession();
    this.closeModal('modal-login');
    this.updateUserRoleUI();
    this.vibrateDevice(80);
    this.showToast('ยินดีต้อนรับ ' + (this.currentUser ? this.currentUser.name : ''), 'success');
    this.afterLogin();
  }

  // จำการล็อกอินไว้ (กันใส่ PIN ใหม่ทุกครั้งที่รีเฟรช) หมดอายุใน SESSION_TTL_HOURS ชม.
  saveSession() {
    try {
      if (!this.currentUser || !this.currentRole) return;
      db.state.put({ key: 'session', value: { uid: this.currentUser.id, name: this.currentUser.name, role: this.currentRole, ts: Date.now() } });
    } catch (e) { console.warn('saveSession failed', e); }
  }

  async tryRestoreSession() {
    try {
      const rec = await db.state.get('session');
      const sess = rec ? rec.value : null;
      if (!sess || !sess.ts) return false;
      if (Date.now() - sess.ts > SESSION_TTL_HOURS * 3600 * 1000) { await db.state.delete('session'); return false; }
      if (sess.uid === '__owner__') {
        this.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
        this.currentRole = 'owner';
      } else {
        const st = (this.state.staff || []).find(s => s.id === sess.uid);
        if (!st || !st.pin) { await db.state.delete('session'); return false; }
        this.currentUser = { id: st.id, name: st.name };
        this.currentRole = st.accessLevel || 'staff';
      }
      this.updateUserRoleUI();
      return true;
    } catch (e) { console.warn('restore session failed', e); return false; }
  }

  afterLogin() {
    // บังคับไปหน้าขายเสมอหลังล็อกอิน (กันหน้าจอสิทธิ์สูงค้างให้คนสิทธิ์ต่ำเห็น)
    if (this.state.shift && this.state.shift.active) {
      this.switchTab('pos');
      return;
    }
    // ยังไม่เปิดกะ: ตั้งหน้าขายเป็นหน้าหลังโมดัล แล้วเปิดกล่องนับเงินเริ่มต้น
    this.state.activeScreen = 'pos';
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-pos'));
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => el.classList.toggle('active', el.getAttribute('data-screen') === 'pos'));
    this.openCashCounter('open');
  }

  // ออกจากระบบ / สลับผู้ใช้
  logout() {
    try { db.state.delete('session'); } catch (e) {}
    this.requireLogin();
    this.vibrateDevice(50);
    this.showToast('ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่', 'info');
  }

  lockOwnerAccess() {
    // ปุ่มเดิม "ล็อก" → ตอนนี้ทำหน้าที่ออกจากระบบ/สลับผู้ใช้
    this.logout();
  }

  updateUserRoleUI() {
    const role = this.currentRole; // 'owner'|'manager'|'staff'|null
    const isOwner = role === 'owner';
    const canReports = role === 'owner' || role === 'manager';
    const uname = this.currentUser ? this.currentUser.name : '';
    const labelText = role ? ((uname ? uname + ' • ' : '') + this.roleLabel(role)) : 'ยังไม่เข้าสู่ระบบ';
    const labelColor = isOwner ? 'var(--accent-massage)' : (role === 'manager' ? 'var(--accent-barber)' : 'var(--text-secondary)');

    // 1. ป้ายแสดงสิทธิ์ (มือถือ + sidebar)
    ['global-role-label', 'sidebar-role-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.innerText = labelText; el.style.color = labelColor; }
    });

    // 2. ปุ่มออกจากระบบ/สลับผู้ใช้ (โชว์เมื่อล็อกอินอยู่)
    ['btn-lock-global', 'btn-lock-sidebar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = role ? 'inline-flex' : 'none';
    });

    // 3. ล้างช่อง PIN ในหน้าตั้งค่าเสมอ
    const shopPinInput = document.getElementById('shop-owner-pin');
    if (shopPinInput) {
      shopPinInput.value = '';
      shopPinInput.placeholder = 'กรอก PIN ใหม่ 6 หลักเพื่อเปลี่ยน';
    }

    // 4. การ์ดส่งออก/นำเข้าข้อมูล — เฉพาะ owner
    const dataOptionsCard = document.querySelector('button[onclick="app.exportData()"]')?.closest('.glass-card');
    if (dataOptionsCard) dataOptionsCard.style.display = isOwner ? 'block' : 'none';

    // 5. การ์ดเชื่อมต่อ Google Sheets — เฉพาะ owner
    const syncSettingsCard = document.getElementById('settings-sheets-sync-card');
    if (syncSettingsCard) syncSettingsCard.style.display = isOwner ? 'block' : 'none';

    // 6. ซ่อนเมนูตามสิทธิ์: ตั้งค่า=owner เท่านั้น, รายงาน=manager ขึ้นไป
    document.querySelectorAll('.nav-item[data-screen="settings"], .bottom-nav-item[data-screen="settings"]')
      .forEach(el => el.style.display = isOwner ? '' : 'none');
    document.querySelectorAll('.nav-item[data-screen="reports"], .bottom-nav-item[data-screen="reports"]')
      .forEach(el => el.style.display = canReports ? '' : 'none');

    // 7. ปุ่มปิดร้าน/สรุปยอด — เฉพาะ manager ขึ้นไป (staff เปิดร้านได้ แต่ปิดไม่ได้)
    const closeStoreBtn = document.getElementById('btn-close-store');
    if (closeStoreBtn) closeStoreBtn.style.display = (role === 'owner' || role === 'manager') ? 'flex' : 'none';
  }

  // ส่งออกข้อมูลเป็น JSON
  exportData() {
    const data = {
      services: this.state.services,
      categories: this.state.categories,
      staff: this.state.staff,
      customers: this.state.customers,
      queue: this.state.queue,
      transactions: this.state.transactions,
      voidLog: this.state.voidLog || [], // ประวัติการยกเลิกบิล — audit trail ต้องติดไปกับไฟล์สำรองด้วย
      shift: this.state.shift,
      shopPromptPayId: this.shopPromptPayId || '',
      shopName: this.shopName || 'Erotica Barber & Massage',
      shopTagline: this.shopTagline || 'BARBER & MASSAGE',
      shopAddress: this.shopAddress || '',
      shopPhone: this.shopPhone || '',
      shopLogo: this.shopLogo || '',
      theme: this.theme || 'dark',
      googleSheetsUrl: this.googleSheetsUrl || '',
      telegramChatId: this.telegramChatId || ''
      // หมายเหตุ: ownerPin และ telegramToken ถูกตัดออกเพื่อความปลอดภัย — ตั้งค่าใหม่หลังนำเข้าข้อมูล
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `erotica_pos_backup_${this.getLocalISODate(new Date())}.json`);
    dlAnchorElem.click();
    this.vibrateDevice(50);
  }

  // นำเข้าข้อมูลจากไฟล์ JSON
  importData(event) {
    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        // ตรวจชนิดข้อมูลจริง ไม่ใช่แค่ truthy — ไฟล์เพี้ยน (field เป็น string/object) เคยทำให้
        // state พังตอน .map() แล้วพังค้างถาวรเพราะถูกบันทึกลง DB ไปแล้ว
        if (Array.isArray(parsed.services) && Array.isArray(parsed.staff) && Array.isArray(parsed.transactions)) {
          this.showConfirm('คุณแน่ใจหรือไม่ว่าต้องการนำเข้าข้อมูลและเขียนทับข้อมูลในเครื่องปัจจุบันทั้งหมด?', async () => {
            this.state.services = parsed.services;
            this.state.staff = parsed.staff;
            if (Array.isArray(parsed.categories) && parsed.categories.length) this.state.categories = parsed.categories;
            this.state.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
            this.state.queue = Array.isArray(parsed.queue) ? parsed.queue : [];
            this.state.transactions = parsed.transactions;
            this.state.voidLog = Array.isArray(parsed.voidLog) ? parsed.voidLog : [];
            // ล้างงานคลาวด์ค้างของข้อมูลชุดเก่า — กัน outbox เดิม flush สรุปที่คำนวณจากข้อมูลชุดใหม่ไปทับชีตผิดๆ
            this.state.cloudOutbox = [];

            this.state.shift = (parsed.shift && typeof parsed.shift === 'object' && !Array.isArray(parsed.shift))
              ? parsed.shift
              : { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
            // ซ่อมโครงสร้างกะจากไฟล์เก่า/ไฟล์ที่ field หาย
            if (!Array.isArray(this.state.shift.history)) this.state.shift.history = [];
            if (!Array.isArray(this.state.shift.expenses)) this.state.shift.expenses = [];
            if (typeof this.state.shift.active !== 'boolean') this.state.shift.active = false;
            if (parsed.shopPromptPayId) this.shopPromptPayId = parsed.shopPromptPayId;
            if (parsed.shopName) this.shopName = parsed.shopName;
            if (parsed.shopTagline) this.shopTagline = parsed.shopTagline;
            if (typeof parsed.shopAddress === 'string') this.shopAddress = parsed.shopAddress;
            if (typeof parsed.shopPhone === 'string') this.shopPhone = parsed.shopPhone;
            // รับเฉพาะ data URL รูปภาพ — กันไฟล์ JSON แปลกปลอมฝังสคริปต์ผ่าน img src
            if (typeof parsed.shopLogo === 'string' && (parsed.shopLogo === '' || parsed.shopLogo.startsWith('data:image/'))) {
              this.shopLogo = parsed.shopLogo;
            }
            if (parsed.theme) this.theme = parsed.theme;
            if (parsed.ownerPin) this.ownerPin = parsed.ownerPin;
            if (parsed.googleSheetsUrl) this.googleSheetsUrl = parsed.googleSheetsUrl;
            if (parsed.telegramToken) this.telegramToken = parsed.telegramToken;
            if (parsed.telegramChatId) this.telegramChatId = parsed.telegramChatId;

            await this.migratePinIfNeeded();
            await this.saveState();
            this.renderAll();
            this.vibrateDevice(100);
            this.showToast('นำเข้าข้อมูลและรีเฟรชหน้าจอสำเร็จ!', 'info');
          });
        } else {
          this.showToast('รูปแบบไฟล์ข้อมูลสำรองไม่ถูกต้อง!', 'info');
        }
      } catch (err) {
        this.showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON!', 'info');
        console.error(err);
      }
    };
    if (event.target.files[0]) fileReader.readAsText(event.target.files[0]);
  }

  // สร้างข้อความรายงานสรุปปิดกะ (แยกจากการส่ง เพื่อ snapshot เก็บลง outbox ได้)
  buildShiftReportMessage(shiftLog) {
    const startTime = shiftLog.startTime;
    const endTime   = shiftLog.endTime;
    const shiftTxs  = this.state.transactions.filter(tx => {
      const txTime = new Date(tx.date).getTime();
      return txTime >= startTime && txTime <= endTime;
    });
    const totalSales    = shiftTxs.reduce((sum, tx) => sum + tx.total, 0);
    const totalCourses  = shiftTxs.reduce((sum, tx) => sum + (tx.services ? tx.services.length : 0), 0);
    const cashSales     = shiftTxs.filter(tx => tx.paymentMethod === 'cash').reduce((sum, tx) => sum + tx.total, 0);
    const transferSales = shiftTxs.filter(tx => tx.paymentMethod === 'promptpay').reduce((sum, tx) => sum + tx.total, 0);
    const creditSales   = shiftTxs.filter(tx => tx.paymentMethod === 'credit').reduce((sum, tx) => sum + tx.total, 0);
    const expensesTotal = shiftLog.expensesTotal || 0;
    const expectedCash  = shiftLog.expectedCash || 0;
    const countedCash   = shiftLog.countedCash || 0;
    const diff          = shiftLog.difference || 0;
    const timeStartStr  = new Date(startTime).toLocaleString('th-TH');
    const timeEndStr    = new Date(endTime).toLocaleString('th-TH');

    return `🔔 <b>รายงานสรุปปิดกะ / ปิดร้าน</b>\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📅 <b>เวลาเริ่มกะ:</b> ${timeStartStr}\n` +
      `📅 <b>เวลาปิดกะ:</b> ${timeEndStr}\n` +
      `🛠️ <b>ปิดโดย:</b> ${shiftLog.closedBy ? escapeHtml(shiftLog.closedBy) : '-'}\n\n` +
      `📈 <b>ยอดขายและการบริการ:</b>\n` +
      `• จำนวนบริการทั้งหมด: ${totalCourses} รายการ\n` +
      `• ยอดขายรวม (สุทธิ): ฿${totalSales.toLocaleString('th-TH')}\n` +
      `  - 💵 เงินสด: ฿${cashSales.toLocaleString('th-TH')}\n` +
      `  - 📱 โอน (Scan QR): ฿${transferSales.toLocaleString('th-TH')}\n` +
      `  - 💳 เครดิตการ์ด: ฿${creditSales.toLocaleString('th-TH')}\n\n` +
      `💸 <b>ค่าใช้จ่ายจ่ายออกในกะ:</b>\n` +
      `• รวมค่าใช้จ่าย: ฿${expensesTotal.toLocaleString('th-TH')}\n\n` +
      `📊 <b>สรุปกระแสเงินสดและลิ้นชัก:</b>\n` +
      `• เงินสดทอนเปิดกะ: ฿${(shiftLog.startCash || 0).toLocaleString('th-TH')}\n` +
      `• รายได้สุทธิหลังหักค่าใช้จ่าย: ฿${(totalSales - expensesTotal).toLocaleString('th-TH')}\n` +
      `• เงินสดที่ควรมีในลิ้นชัก: ฿${expectedCash.toLocaleString('th-TH')}\n` +
      `• เงินสดที่นับได้จริง: ฿${countedCash.toLocaleString('th-TH')}\n` +
      `• ส่วนต่าง (ขาด/เกิน): ${diff >= 0 ? '+' : ''}฿${diff.toLocaleString('th-TH')}\n` +
      `━━━━━━━━━━━━━━━━`;
  }

  // ส่งข้อความ Telegram แล้วคืน true/false ว่าส่งถึงไหม (ใช้กับ outbox retry)
  async postTelegram(message) {
    if (!this.telegramToken || !this.telegramChatId) return false;
    try {
      const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
      const r = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.telegramChatId, text: message, parse_mode: 'HTML' })
      }, 15000);
      const d = await r.json();
      return !!(d && d.ok);
    } catch (err) {
      console.error('Telegram post failed:', err);
      return false;
    }
  }

  // ส่งรายงานปิดกะทันที (คงไว้เพื่อความเข้ากันได้ — best-effort ครั้งเดียว)
  sendTelegramReport(shiftLog) {
    if (!this.telegramToken || !this.telegramChatId) { console.log('Telegram notifications not configured.'); return; }
    this.postTelegram(this.buildShiftReportMessage(shiftLog));
  }

  // เก็บงานคลาวด์ตอนปิดกะลง outbox (persist) — สรุปวัน/เดือน + Telegram
  // เพื่อ "การันตีส่ง" แม้ปิดกะตอนออฟไลน์ แล้ว retry เองเมื่อเน็ตกลับ
  enqueueShiftCloseCloudOps(shiftLog) {
    // ใช้ "วันทำการ" — กะปกติ 11:00 → ตี 3 เปิด/ปิดเป็นวันทำการเดียวกัน จึงรีเฟรชสรุปแค่วันเดียว
    // ถ้ากะลากยาวจนคร่อมวันทำการ (ปิดหลัง 06:00 เช้า) จะรีเฟรชทั้งสองวัน/สองเดือนให้เอง
    const openTs  = shiftLog.startTime || shiftLog.endTime;
    const closeTs = shiftLog.endTime;
    const dateKeys  = [...new Set([this.getBusinessISODate(openTs), this.getBusinessISODate(closeTs)])];
    const monthKeys = [...new Set([this.getBusinessMonthKey(openTs), this.getBusinessMonthKey(closeTs)])];
    const needSummary  = !!this.googleSheetsUrl;
    const needTelegram = !!(this.telegramToken && this.telegramChatId);
    if (!needSummary && !needTelegram) return; // ไม่ได้ตั้งค่าอะไรเลย ไม่ต้องคิว
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    this.state.cloudOutbox.push({
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys, monthKeys,
      needSummary, needTelegram,
      telegramMessage: needTelegram ? this.buildShiftReportMessage(shiftLog) : '',
      tries: 0
    });
  }

  // คิวรีเฟรชสรุปวัน/เดือนอย่างเดียว (ใช้หลังแก้ไขบิลย้อนหลัง — ให้ KPI บนชีตตรงกับบิลที่แก้)
  enqueueSummaryRefresh(dateVal) {
    if (!this.googleSheetsUrl) return;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return;
    const dateKey  = this.getBusinessISODate(d);   // วันทำการของบิลที่ถูกแก้
    const monthKey = this.getBusinessMonthKey(d);
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    // ถ้ามีงานสรุปของวันเดียวกันค้างอยู่แล้ว ไม่ต้องคิวซ้ำ (flush จะ recompute จาก state ล่าสุดอยู่แล้ว)
    const dup = this.state.cloudOutbox.some(it => it.needSummary &&
      (it.dateKeys || [it.dateKey]).includes(dateKey));
    if (dup) return;
    this.state.cloudOutbox.push({
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys: [dateKey], monthKeys: [monthKey],
      needSummary: true, needTelegram: false, telegramMessage: '',
      tries: 0
    });
  }

  // ส่ง outbox ที่ค้าง (เรียกตอนปิดกะ / เน็ตกลับ / เปิดแอป) — idempotent + กันยิงซ้อน
  async flushCloudOutbox() {
    if (this._flushingOutbox) return;
    if (!Array.isArray(this.state.cloudOutbox) || this.state.cloudOutbox.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // ออฟไลน์ — ไว้ค่อยส่ง
    this._flushingOutbox = true;
    let delivered = 0;
    try {
      for (const item of this.state.cloudOutbox.slice()) {
        // Backoff: ล้มเหลวติดกัน 3 ครั้งขึ้นไป → เว้นระยะ 5 นาทีก่อนลองใหม่ (กันยิงรัวตอน URL ผิด/GAS ล่ม)
        if ((item.tries || 0) >= 3 && item.lastTry && (Date.now() - item.lastTry) < 5 * 60 * 1000) continue;
        item.tries = (item.tries || 0) + 1;
        item.lastTry = Date.now();

        // รองรับทั้งรูปแบบใหม่ (dateKeys/monthKeys เป็น array) และรายการเก่าที่ค้างใน outbox (dateKey เดี่ยว)
        const dateKeys  = Array.isArray(item.dateKeys)  ? item.dateKeys  : (item.dateKey  ? [item.dateKey]  : []);
        const monthKeys = Array.isArray(item.monthKeys) ? item.monthKeys : (item.monthKey ? [item.monthKey] : []);

        // 0) ลบแถวบิลที่ void ในชีต (ทำก่อนรีเฟรชสรุป) — idempotent: ไม่พบแถว = ถือว่าลบแล้ว
        if (item.needVoidDelete) {
          if (!this.googleSheetsUrl) {
            item.needVoidDelete = false;
          } else {
            const okDel = await this.postVoidDelete(item.voidDelete);
            if (okDel) { item.needVoidDelete = false; delivered++; }
          }
        }

        // 1) สรุปวัน + เดือน — recompute จาก state ปัจจุบัน (ครบ + idempotent: GAS เขียนทับชีต)
        if (item.needSummary) {
          if (!this.googleSheetsUrl) {
            item.needSummary = false; // ไม่มี URL แล้ว เลิกพยายาม
          } else {
            let allOk = true;
            for (const dk of dateKeys) {
              const dayTxs = this.state.transactions.filter(tx => this.getBusinessISODate(tx.date) === dk);
              // รวมกะปิดแล้ว + กะที่ยังเปิดอยู่ — กันสรุปที่ refresh หลัง void/แก้บิลกลางกะขาดยอดค่าใช้จ่าย
              const dayExp = this.getExpensesForDate(dk);
              const okDay = await this.syncDailySummary(dk, dayTxs, dayExp, true);
              if (!okDay) allOk = false;
            }
            for (const mk of monthKeys) {
              const okMonth = await this.syncMonthlySummary(mk, true);
              if (!okMonth) allOk = false;
            }
            if (allOk) { item.needSummary = false; delivered++; }
          }
        }

        // 2) Telegram — ส่งข้อความที่ snapshot ไว้ตอนปิดกะ
        if (item.needTelegram) {
          const ok = await this.postTelegram(item.telegramMessage);
          if (ok) { item.needTelegram = false; delivered++; }
        }
      }

      // เก็บเฉพาะรายการที่ยังค้าง ที่เสร็จแล้วทิ้งออก
      const before = this.state.cloudOutbox.length;
      this.state.cloudOutbox = this.state.cloudOutbox.filter(it => it.needVoidDelete || it.needSummary || it.needTelegram);
      if (delivered > 0 || this.state.cloudOutbox.length !== before) {
        await this.saveState();
        if (delivered > 0) this.showToast(`ส่งสรุป/แจ้งเตือนที่ค้างไว้สำเร็จแล้ว (${delivered} รายการ)`, 'success');
      }
    } finally {
      this._flushingOutbox = false;
    }
  }

  // ส่งข้อความ Telegram ทั่วไป (ใช้ซ้ำได้)
  sendTelegramText(message) {
    if (!this.telegramToken || !this.telegramChatId) return;
    const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
    this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: this.telegramChatId, text: message, parse_mode: 'HTML' }) }, 15000)
      .then(r => r.json())
      .then(d => { if (!d.ok) console.error('Telegram error:', d.description); })
      .catch(err => console.error('Telegram failed:', err));
  }

  // สร้างข้อความแจ้งเตือนการยกเลิกบิล (แยกเพื่อ snapshot เก็บลง outbox)
  buildVoidAlertMessage(v) {
    const when = new Date(v.date).toLocaleString('th-TH');
    return `⚠️ <b>มีการยกเลิกบิล (Void)</b>\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🧾 เลขที่บิล: ${v.billId}\n` +
      `💰 ยอด: ฿${(v.amount || 0).toLocaleString('th-TH')}\n` +
      `👤 ลูกค้า: ${escapeHtml(v.customer || '-')}\n` +
      `🛠️ ยกเลิกโดย: ${escapeHtml(v.by || '-')}\n` +
      `🕒 เวลา: ${when}\n` +
      `━━━━━━━━━━━━━━━━`;
  }

  // แจ้งเตือนการยกเลิกบิลผ่าน Telegram (best-effort ครั้งเดียว — คงไว้เพื่อความเข้ากันได้)
  sendVoidAlert(v) {
    this.sendTelegramText(this.buildVoidAlertMessage(v));
  }

  // ส่งคำขอลบแถวบิลใน Sheets แล้วคืน true/false — idempotent: "ไม่พบแถว" = ถือว่าลบแล้ว
  async postVoidDelete(v) {
    if (!this.googleSheetsUrl) return false;
    try {
      const r = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          secret: API_SECRET, action: 'void_transaction',
          id: v.id, date: v.date,
          // monthKey (เดือนทำการ) — ชี้แท็บเดือนเดียวกับตอนบันทึกแม้ timezone ฝั่ง GAS ตั้งผิด
          // (รายการเก่าที่ค้างใน outbox ก่อนอัปเดตไม่มีฟิลด์นี้ → คำนวณจาก date แทน)
          monthKey: v.monthKey || this.getBusinessMonthKey(v.date),
          voidedBy: v.voidedBy || ''
        })
      });
      const d = await r.json();
      if (d && (d.status === 'success' || (d.status === 'error' && /ไม่พบ/.test(d.message || '')))) return true;
      return false; // error อื่น (เช่น unauthorized) → retry รอบหน้า
    } catch (err) {
      console.error('Void delete failed:', err);
      return false;
    }
  }

  // เก็บงานคลาวด์ของการ void ลง outbox: ลบแถวในชีต + รีเฟรชสรุป + Telegram
  enqueueVoidCloudOps(tx, voidRecord) {
    const dateKey  = this.getBusinessISODate(tx.date);   // วันทำการของบิลที่ถูก void
    const monthKey = this.getBusinessMonthKey(tx.date);  // ต้องชี้แท็บเดือนเดียวกับตอนบันทึกบิล
    const hasUrl       = !!this.googleSheetsUrl;
    const needTelegram = !!(this.telegramToken && this.telegramChatId);
    if (!hasUrl && !needTelegram) return;
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    // ส่งคำสั่งลบแถว "เสมอ" เมื่อมี URL — แม้บิลจะดูเป็น pending อยู่ (เช่นเพิ่งถูกแก้ไข)
    // เพราะแถวอาจขึ้นชีตไปแล้วก่อนหน้า; postVoidDelete เป็น idempotent (ไม่พบแถว = สำเร็จ) จึงส่งเกินได้ ไม่มีผลเสีย
    this.state.cloudOutbox.push({
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys: [dateKey], monthKeys: [monthKey],
      needVoidDelete: hasUrl,
      voidDelete: hasUrl ? { id: tx.id, date: tx.date, monthKey: monthKey, voidedBy: voidRecord.by || '' } : null,
      needSummary: hasUrl,
      needTelegram,
      telegramMessage: needTelegram ? this.buildVoidAlertMessage(voidRecord) : '',
      tries: 0
    });
  }

  // ทดสอบ Telegram
  testTelegramNotification() {
    const token  = document.getElementById('shop-telegram-token').value.trim();
    const chatId = document.getElementById('shop-telegram-chatid').value.trim();
    if (!token || !chatId) { this.showToast('กรุณากรอก Token และ Chat ID ก่อน','warning'); return; }

    const msg = `🧪 <b>ข้อความทดสอบจากระบบ POS</b>\n━━━━━━━━━━━━━━━━\nการเชื่อมต่อ Telegram สำเร็จ!`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }) }, 15000)
      .then(r => r.json())
      .then(d => { if (d.ok) this.showToast('ส่งข้อความทดสอบสำเร็จ!','success'); else this.showToast('Telegram API error: ' + d.description,'error'); })
      .catch(err => this.showToast('ไม่สามารถเชื่อมต่อ Telegram: ' + err.message,'error'));
  }
}

// เริ่มต้นแอปพลิเคชัน
const app = new PosApp();
window.addEventListener('DOMContentLoaded', () => app.init());
window.app = app;
