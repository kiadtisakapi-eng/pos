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

// vat: true = สินค้าในหมวดนี้ต้องบวก VAT ตอนคิดเงิน
// หมวดที่ไม่มีฟิลด์นี้ (ข้อมูลเก่าก่อนมีระบบ VAT) ถือว่า false เสมอ — ห้ามเดาเป็น true
const DEFAULT_CATEGORIES = [
  { id: 'barber', name: 'ตัดผมชาย (Barber)', icon: 'fa-scissors', vat: false },
  { id: 'massage', name: 'นวดและสปา (Massage)', icon: 'fa-spa', vat: false },
  { id: 'premium', name: 'แพ็คเกจพรีเมียม (Premium)', icon: 'fa-gem', vat: false },
  { id: 'drinks', name: 'เครื่องดื่ม (Drinks)', icon: 'fa-mug-hot', vat: true }
];

// รหัสเชื่อมต่อ Google Apps Script ต้องไม่ฝังอยู่ใน source code เพราะไฟล์ JavaScript
// ถูกส่งไปให้ทุก browser อ่านได้เสมอ รหัสถูกเก็บเฉพาะใน IndexedDB ของ iPad แต่ละเครื่อง
// และต้องสร้างไว้ใน Script Properties ของ Apps Script ให้ตรงกัน
const CLOUD_API_TOKEN_MIN_LENGTH = 24;

// เวอร์ชันรูปแบบไฟล์สำรอง ใช้ตรวจว่าไฟล์มาจากระบบรุ่นที่รองรับจริง
// v3 (ก.ย. 2569): เพิ่ม pendingCloudWork — งานคลาวด์ที่ยังค้างตอนสำรอง
// ไฟล์รุ่นเก่า (v1/v2) ยังกู้ได้ปกติ แค่ไม่มีงานค้างให้สร้างคืน
const BACKUP_SCHEMA_VERSION = 3;

// เวอร์ชันแอป — บัมพ์ทุกครั้งที่ปล่อยอัปเดต (ควรให้สอดคล้องกับ CACHE_NAME ใน sw.js)
const APP_VERSION = '1.6.0 (2026-09-09)';

// ─────────────────────────────────────────────
//  วันทำการ (Business Date) — ร้านเปิด 11:00 น. ถึงตี 3 ของวันถัดไป
//  บิล/ยอด/ค่าใช้จ่ายก่อน 06:00 เช้า นับเป็นวันทำการของ "เมื่อวาน" (มาตรฐานร้านกลางคืน)
//  เช่น บิลตี 2 ของเช้าวันที่ 19 = ยอดของคืนวันที่ 18 → ลงสรุปวันที่ 18 และแท็บเดือนตามวันที่ 18
//  ⚠️ ค่านี้ต้องอยู่ระหว่าง "เวลาปิดร้านช้าสุด" กับ "เวลาเปิดร้าน" (ปิด 03:00, เปิด 11:00 → 6 พอดี)
// ─────────────────────────────────────────────
const BUSINESS_DAY_CUTOFF_HOUR = 6;

// ชื่อล็อก "หน้าต่างหลัก" — ต้องไม่ซ้ำกับอย่างอื่นใน origin เดียวกัน (ดู claimWriterLock)
const WRITER_LOCK_NAME = 'jahn-pos-writer';

// กัน XSS — แปลงอักขระพิเศษก่อนนำข้อความของผู้ใช้ไปแสดงผลด้วย innerHTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, function (s) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
  });
}

// ── ข้อความที่ส่งเข้า Telegram ต้องใช้ตัวแปลงคนละตัวกับหน้าเว็บ ──────────
// Telegram (parse_mode HTML) รู้จักแค่ &lt; &gt; &amp; เท่านั้น
// เอนทิตีอื่นอย่าง &#39; (จาก escapeHtml) ทำให้ Telegram ปฏิเสธทั้งข้อความ
// ผลคือ postTelegram คืน false แล้วงานค้างในคิว ยิงซ้ำทุก 5 นาทีตลอดไป
// (ชื่อคนที่มีเครื่องหมาย ' เช่น O'Brien พอแล้วที่จะทำให้เกิด)
// ⚠️ ห้ามใช้ escapeHtml() กับข้อความ Telegram
function escapeTelegram(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>]/g, function (s) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s];
  });
}

// ── รหัส (ID) ที่ปลอดภัยพอจะต่อเข้า onclick ได้ ─────────────────────────
// ทุก ID ที่ระบบสร้างเองอยู่ในชุด [A-Za-z0-9_-] ทั้งหมด:
//   หมวด cat-<เวลา>-<สุ่ม> · บริการ s-… · พนักงาน st-… · ลูกค้า c-… · คิว q-… ·
//   บิล TX-… · ค่าใช้จ่าย exp_… · งานคลาวด์ cob-… และของเริ่มต้น s1..s9 / barber / massage / premium
// ค่าที่หลุดรูปแบบนี้เข้ามาได้มีทางเดียวคือไฟล์นำเข้าที่ถูกดัดแปลง
//
// ⚠️ escapeHtml() ไม่ช่วยตรงนี้ เพราะ ID ไม่ได้อยู่ในเนื้อ HTML แต่อยู่ใน "สตริงของ JavaScript"
// ที่ฝังใน onclick — เครื่องหมาย ' ที่กลายเป็น &#39; เบราว์เซอร์จะถอดกลับเป็น ' ให้ก่อนรันโค้ด
// แล้วสตริงก็ยังหลุดออกมาเป็นโค้ดได้อยู่ดี ต้องกันด้วยการ "ไม่ยอมรับรูปแบบ" เท่านั้น
//
// คืนค่าว่างเมื่อรูปแบบผิด = ปุ่มนั้นกดแล้วไม่เกิดอะไร (หาไม่เจอ) ซึ่งปลอดภัยกว่าปล่อยให้รันโค้ด
// ด่านนี้เป็นชั้นที่สอง — ชั้นแรกคือ isValidBackupObject() ที่ไม่ยอมให้ไฟล์แบบนั้นเข้ามาตั้งแต่ต้น
const SAFE_ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function isSafeEntityId(v) {
  // ไฟล์สำรองรุ่นเก่าบางชุดเก็บ id เป็นตัวเลข — ตัวเลขไม่มีทางพา ' หรือโค้ดเข้ามาได้ จึงยอมรับ
  // แต่ต้องผ่าน regex ตัวเดียวกับ safeId() ด้วย ไม่ใช่แค่ "เป็นตัวเลขจำกัด"
  // ไม่งั้นจะเกิดกรณีที่ด่านนำเข้าปล่อยผ่าน แต่ safeId() ตัดทิ้งตอนแสดงผล = ปุ่มตายโดยไม่มีใครรู้สาเหตุ
  // (เช่น 1.5 -> "1.5" มีจุด · 1e21 -> "1e+21" มีเครื่องหมายบวก)
  // กฎที่ต้องเป็นจริงเสมอ: isSafeEntityId(x) === true  =>  safeId(x) !== ''
  if (typeof v === 'number') return Number.isFinite(v) && SAFE_ENTITY_ID_RE.test(String(v));
  return typeof v === 'string' && SAFE_ENTITY_ID_RE.test(v);
}
// ── ไอคอน: ถูกยัดเข้า class= ตรง ๆ ─────────────────────────────────────
// ค่าดิบจากไฟล์นำเข้าอย่าง  fa-scissors" onload="โค้ด  จะแตกออกจาก attribute
// แล้วกลายเป็นแอตทริบิวต์ใหม่ของแท็กนั้น (พิสูจน์ในเบราว์เซอร์แล้วว่าเกิดจริง)
//
// escape อย่างเดียวก็พอกันได้ แต่การจำกัดรูปแบบดีกว่า เพราะทำให้ค่าที่ผิดรูป
// "เป็นไปไม่ได้" ตั้งแต่ต้น ไม่ต้องหวังว่าทุกจุดที่ใช้จะจำ escape ครบ
const FA_ICON_RE = /^fa-[a-z0-9-]{1,40}$/;
function safeIcon(v, fallback) {
  const s = String(v == null ? '' : v).trim();
  if (FA_ICON_RE.test(s)) return s;
  if (s) console.warn('[Guard] ชื่อไอคอนผิดรูปแบบ ใช้ค่าตั้งต้นแทน:', s.slice(0, 60));
  return fallback || 'fa-tag';
}

function safeId(v) {
  const s = (v == null) ? '' : String(v);
  if (SAFE_ENTITY_ID_RE.test(s)) return s;
  console.warn('[Guard] รหัสรูปแบบผิด ไม่ผูกเข้ากับปุ่ม:', s.slice(0, 80));
  return '';
}

// เริ่มต้นฐานข้อมูล IndexedDB ด้วย Dexie.js
const SESSION_TTL_HOURS = 20; // จำการล็อกอินไว้กี่ชั่วโมงก่อนต้องใส่ PIN ใหม่ (พนักงาน/ผู้จัดการ)
// (20 ชม. ครอบคลุมกะเต็ม 11:00 → ตี 3 + เผื่อเปิดเครื่องก่อนเปิดร้าน — เดิม 12 ชม. หมดอายุ 23:00 กลางกะ
//  ถ้า iPad รีเฟรช/อัปเดตแอปหลังจากนั้นจะเด้งหน้า login ทั้งที่กำลังขายอยู่)

// ─────────────────────────────────────────────
//  เจ้าของร้าน: ออกจากระบบอัตโนมัติเมื่อไม่มีการแตะหน้าจอครบ 5 นาที
//
//  ทำไมต้องสั้นกว่าคนอื่นมาก: สิทธิ์เจ้าของเปิดได้ทุกอย่าง — หน้าตั้งค่า, รายงานยอดทั้งร้าน,
//  ลบบิล, รีเซ็ตข้อมูล, กู้ข้อมูลทับ ถ้าค้างไว้ 20 ชม. เหมือนคนอื่น ใครหยิบ iPad ที่ปลดล็อกไป
//  ในช่วงนั้นก็ได้สิทธิ์เต็มไปด้วย
//
//  ⚠️ ตั้งใจนับจาก "การแตะครั้งสุดท้าย" ไม่ใช่นับตั้งแต่ตอนล็อกอิน
//  ถ้านับตั้งแต่ล็อกอิน เจ้าของที่นั่งทำบัญชียาว ๆ จะโดนเตะออกกลางคันทุก 5 นาที
//  แบบนี้วาง iPad ทิ้งไว้ 5 นาทีเมื่อไหร่ถึงหลุด ระหว่างที่มือยังทำงานอยู่ไม่โดนรบกวน
// ─────────────────────────────────────────────
const OWNER_IDLE_TIMEOUT_MINUTES = 5;
const OWNER_IDLE_TIMEOUT_MS = OWNER_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;   // ความละเอียดในการเช็ค — คลาดได้ไม่เกิน 15 วิ
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
      // ประวัติการลบรายการค่าใช้จ่าย — ตัวรายการหายไปแล้ว ถ้าไม่บันทึกไว้จะไม่เหลือร่องรอยเลย
      // (ค่าใช้จ่าย 1 บาท = เงินที่ควรมีในลิ้นชักลด 1 บาท จึงต้องรู้ว่าใครเพิ่มและใครลบ)
      expenseLog: [],
      // ประวัติการแก้บิลย้อนหลัง — ทางเดียวในระบบที่ "ยอดเงินเปลี่ยน" ได้โดยของเดิมหายไปเลย
      // (ยกเลิกบิลยังเหลือ voidLog ให้ดูว่ายอดเดิมเท่าไร แต่การแก้ทับไม่เหลืออะไรเลยถ้าไม่บันทึก)
      editLog: [],
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
    this.loadFailed = false;      // true = โหลดข้อมูลจาก IndexedDB ไม่สำเร็จ → ห้ามเขียนทับ DB ทุกกรณี
    this.restoreBusy = false;     // true = กำลังกู้ข้อมูลจาก Drive อยู่ ห้ามเริ่มรอบใหม่ซ้อน
    this.vatEnabled = false;      // สวิตช์ใหญ่ — ปิดไว้ก่อนเสมอ ต้องเปิดเองในหน้าตั้งค่า
    this.vatRate = 7;             // อัตรา VAT (%) เก็บติดบิลทุกใบ เผื่ออนาคตอัตราเปลี่ยน
    this.currentRole = null;      // 'owner' | 'manager' | 'staff' | null (ยังไม่ล็อกอิน)
    this.currentUser = null;      // { id, name } ของผู้ที่ล็อกอินอยู่
    this.loginSelectedId = null;  // ผู้ใช้ที่เลือกในหน้าล็อกอิน
    this.googleSheetsApiToken = ''; // รหัสต่อเครื่องสำหรับ Apps Script — ไม่ใส่ใน backup/export
    this._lastActivityTs = Date.now();  // เวลาที่แตะหน้าจอครั้งล่าสุด (ใช้กับ auto-logout ของเจ้าของร้าน)
    this._lastSessionSaveTs = 0;        // กันเขียนเซสชันลง IndexedDB รัวเกินไปตอนกดขายเร็ว ๆ
    this._idleInterval = null;
    // ร่างรายการของหน้าต่าง "แก้ไขบิล" — เป็นสำเนาแยก ห้ามผูกกับบิลจริง
    // เดิมหน้าต่างนี้เขียนทับ tx.details ทันทีที่เปิดดู ทำให้แค่กดดูบิลเก่าแล้วกดยกเลิก
    // ยอดของบิลใบนั้นก็เปลี่ยนไปแล้ว (ดูคอมเมนต์ที่ buildEditableDetails)
    this._editTxDraft = null;
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
    const tone = colors[type] || colors.success;   // ค่าคงที่ในไฟล์นี้ ไม่ใช่ข้อมูลจากผู้ใช้
    const toast = document.createElement('div');
    toast.style.cssText = `background:${tone.bg};border:1px solid ${tone.border};border-radius:12px;padding:12px 16px;font-family:var(--font-family);font-size:0.88rem;color:var(--text-primary);display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:toastIn 0.25s ease;backdrop-filter:blur(10px);`;
    toast.innerHTML = `<span style="font-size:1.1rem">${tone.icon}</span><span style="flex:1;line-height:1.4">${escapeHtml(message)}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0 4px;flex-shrink:0">×</button>`;
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

  // onCancel เพิ่มเข้ามาเพื่อให้เขียนแบบ await ได้ (ดู askConfirm ด้านล่าง)
  // ถ้าไม่มีทางรู้ว่าผู้ใช้กด "ยกเลิก" โค้ดที่รออยู่จะค้างตลอดไป เช่นธง restoreBusy ที่ไม่มีวันคืนค่า
  showConfirm(message, callback, onCancel) {
    const modal = document.getElementById('modal-confirm');
    const msgEl = document.getElementById('confirm-modal-msg');
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnCancel = document.getElementById('btn-confirm-cancel');

    if (!modal || !msgEl || !btnYes || !btnCancel) {
      if (confirm(message)) {
        if (callback) callback();
      } else if (onCancel) {
        onCancel();
      }
      return;
    }

    msgEl.innerText = message;
    modal.classList.add('active');

    btnCancel.onclick = () => {
      modal.classList.remove('active');
      if (onCancel) onCancel();
    };

    btnYes.onclick = () => {
      modal.classList.remove('active');
      if (callback) callback();
    };
  }

  // เวอร์ชันที่ await ได้ — true = กดยืนยัน, false = กดยกเลิก
  askConfirm(message) {
    return new Promise(resolve => this.showConfirm(message, () => resolve(true), () => resolve(false)));
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
  // ตารางจำผลการแปลงวันที่ (timestamp -> "2026-08-03")
  // ทุกครั้งที่จบบิล ระบบวนอ่านบิลทั้งหมดหลายรอบเพื่อกรองวัน/เดือน แต่ละรอบสร้างอ็อบเจกต์วันที่ใหม่ทีละใบ
  // พอบิลสะสมหลักพัน งานนี้กินเวลาจนรู้สึกหน่วง — วันที่ของบิลไม่มีวันเปลี่ยน จำไว้ครั้งเดียวใช้ซ้ำได้ตลอด
  // ต้องล้างทุกครั้งที่ข้อมูลถูกแทนที่ทั้งชุด (นำเข้าไฟล์ / กู้ข้อมูล / ล้างข้อมูล)
  clearDateKeyCache() {
    this._dkCache = { day: new Map(), month: new Map(), mkey: new Map() };
  }

  getBusinessTime(dateVal) {
    // ⚠️ ต้องกัน null/undefined/'' ก่อน — new Date(null) ไม่ใช่ Invalid Date แต่เป็น 1 ม.ค. 1970
    // ถ้าปล่อยผ่าน บิลที่ไม่มีวันที่ (เช่นมาจากไฟล์สำรองที่เสียหาย) จะถูกจัดเข้าเดือน "01-1970"
    // แล้วระบบจะสร้างแท็บ "สรุป-01-1970" กับแถวขยะในชีตสรุปรายเดือนขึ้นมาเอง
    if (dateVal === null || dateVal === undefined || dateVal === '') return NaN;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return NaN;
    return d.getTime() - BUSINESS_DAY_CUTOFF_HOUR * 3600 * 1000;
  }

  // ── ตรวจรูปแบบคีย์วัน/เดือน ก่อนส่งขึ้นชีต ────────────────────────
  // ด่านสุดท้ายก่อนสร้างแท็บใหม่บน Google Sheets — คีย์เพี้ยนแม้ตัวเดียวจะได้แท็บขยะ
  // ที่ลบเองไม่ได้จากในแอป และไปโผล่ปนในชีตสรุปรายเดือน ทำให้รายงานอ่านไม่รู้เรื่อง
  // จำกัดช่วงปี 2020-2100 ด้วย เพราะปี 1970 คือค่าที่ได้เมื่อวันที่หายไป ไม่ใช่วันที่จริง
  isValidDateKey(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || ''))) return false;
    const [y, m, d] = String(k).split('-').map(Number);
    return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  isValidMonthKey(k) {
    if (!/^\d{2}-\d{4}$/.test(String(k || ''))) return false;
    const [m, y] = String(k).split('-').map(Number);
    return y >= 2020 && y <= 2100 && m >= 1 && m <= 12;
  }

  // วันทำการแบบ "2026-07-18" (บิลตี 2 ของวันที่ 19 → "2026-07-18")
  getBusinessISODate(dateVal) {
    // เขียนยาวหน่อยแต่ตั้งใจ — ไม่ใช้ callback เพราะการสร้างฟังก์ชันใหม่ทุกครั้งที่เรียก
    // กินเวลาพอ ๆ กับงานที่พยายามจะประหยัด (วนอ่านบิลหลักพันคือเรียกหลักพันครั้ง)
    if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
      if (!this._dkCache) this.clearDateKeyCache();
      const box = this._dkCache.day;
      const hit = box.get(dateVal);
      if (hit !== undefined) return hit;
      const tc = this.getBusinessTime(dateVal);
      const out = isNaN(tc) ? '' : this.getLocalISODate(tc);
      if (box.size > 50000) box.clear();
      box.set(dateVal, out);
      return out;
    }
    const t = this.getBusinessTime(dateVal);
    return isNaN(t) ? '' : this.getLocalISODate(t);
  }

  // เดือนทำการแบบ "2026-07"
  getBusinessISOMonth(dateVal) {
    if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
      if (!this._dkCache) this.clearDateKeyCache();
      const box = this._dkCache.month;
      const hit = box.get(dateVal);
      if (hit !== undefined) return hit;
      const tc = this.getBusinessTime(dateVal);
      const out = isNaN(tc) ? '' : this.getLocalISOMonth(tc);
      if (box.size > 50000) box.clear();
      box.set(dateVal, out);
      return out;
    }
    const t = this.getBusinessTime(dateVal);
    return isNaN(t) ? '' : this.getLocalISOMonth(t);
  }

  // เดือนทำการรูปแบบแท็บชีต "07-2026"
  getBusinessMonthKey(dateVal) {
    if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
      if (!this._dkCache) this.clearDateKeyCache();
      const box = this._dkCache.mkey;
      const hit = box.get(dateVal);
      if (hit !== undefined) return hit;
      const out = this._monthKeyFrom(dateVal);
      if (box.size > 50000) box.clear();
      box.set(dateVal, out);
      return out;
    }
    return this._monthKeyFrom(dateVal);
  }

  _monthKeyFrom(dateVal) {
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
    // ขอสิทธิ์ "หน้าต่างหลัก" ก่อนโหลดข้อมูล — ต้องรู้ให้เร็วที่สุดว่าหน้าต่างนี้เขียนได้ไหม
    this.claimWriterLock();
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

    // ห่อทุกงานวาดตอนบูต — งานใดพังต้องไม่ลามไปบล็อกหน้าล็อกอินที่อยู่ข้างล่าง
    this.safeRender('หน้าจอหลัก', () => this.renderAll());
    this.safeRender('ชื่อร้าน', () => this.applyShopName());
    this.safeRender('ธีม', () => this.applyTheme());
    this.safeRender('สิทธิ์ผู้ใช้', () => this.updateUserRoleUI());
    this.safeRender('สถานะซิงก์', () => this.checkSyncStatus());
    this.resumePendingCloudWork(); // ส่งทั้งบิลและงานสรุปที่ค้างเมื่อเปิดแอปตอนมีเน็ตแล้ว
    
    // ตั้งเวลาสำหรับอัปเดตแถบเวลาของคิวงาน (คิวที่กำลังรับบริการอยู่)
    this.timerInterval = setInterval(() => this.updateQueueProgress(), 1000);
    
    // เริ่มจับเวลาไม่ใช้งาน — เจ้าของร้านจะถูกออกจากระบบอัตโนมัติเมื่อวางเครื่องทิ้งไว้
    this.startIdleWatch();

    // จำการล็อกอินเดิมถ้ายังไม่หมดอายุ ไม่งั้นแสดงหน้าเข้าสู่ระบบ
    // ⚠️ ต้องทำให้ถึงตรงนี้เสมอ — ถ้าไม่มีปุ่มล็อกอิน ร้านเปิดไม่ได้เลย
    try {
      if (await this.tryRestoreSession()) this.afterLogin();
      else this.requireLogin();
    } catch (err) {
      console.error('[Boot] ทางล็อกอินล้มเหลว บังคับแสดงหน้าล็อกอิน', err);
      try { this.requireLogin(); } catch (e) { console.error('[Boot] requireLogin ล้มเหลวด้วย', e); }
    }

    // มีบางส่วนของหน้าจอวาดไม่ขึ้นเพราะข้อมูลเสีย — บอกให้เจ้าของรู้ ไม่ใช่ปล่อยให้งง
    if (this._renderFailures && this._renderFailures.length) {
      const parts = [...new Set(this._renderFailures)].join(' · ');
      this.showToast(`บางส่วนของหน้าจอแสดงไม่ได้ (${parts}) — ข้อมูลบางรายการน่าจะเสีย ` +
        `ยังใช้งานส่วนอื่นได้ ให้แจ้งผู้ดูแลระบบ`, 'warning', 12000);
    }

    // ลงทะเบียน Service Worker สำหรับ PWA
    this.registerServiceWorker();

    // เน็ตกลับมา / สลับกลับมาที่แอป → ดันบิลที่ค้าง sync ขึ้นทันที (กันบิลที่ขายตอนออฟไลน์ค้าง)
    window.addEventListener('online', () => this.resumePendingCloudWork());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) this.resumePendingCloudWork();
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
      // เคลียร์ธงทุกครั้งที่เริ่มโหลด — ถ้ารอบนี้สำเร็จต้องกลับมาบันทึกได้ตามปกติ
      // (resetData() เรียก loadState() ซ้ำหลังล้าง DB จึงต้องมีทางกลับ ไม่ใช่ธงค้างตลอดชีวิตแอป)
      this.loadFailed = false;

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
        const oldSheetsApiToken = localStorage.getItem('jahn_pos_google_sheets_api_token') || '';
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
          { key: 'googleSheetsApiToken', value: oldSheetsApiToken },
          { key: 'telegramToken', value: oldTelegramToken },
          { key: 'telegramChatId', value: oldTelegramChatId },
          { key: 'db_migrated', value: true }
        ]);

        // ลบข้อมูลเก่าออกจาก LocalStorage เพื่อเคลียร์พื้นที่
        Object.values(storageKeys).forEach(k => localStorage.removeItem(k));
        localStorage.removeItem('jahn_pos_shop_promptpay');
        localStorage.removeItem('jahn_pos_shop_owner_pin');
        localStorage.removeItem('jahn_pos_google_sheets_url');
        localStorage.removeItem('jahn_pos_google_sheets_api_token');
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
      const expenseLogVal = await db.state.get('expenseLog');
      const editLogVal = await db.state.get('editLog');
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
      const sheetsApiTokenVal = await db.state.get('googleSheetsApiToken');
      const telegramTokenVal = await db.state.get('telegramToken');
      const telegramChatIdVal = await db.state.get('telegramChatId');

      this.state.services = servicesVal ? servicesVal.value : [...DEFAULT_SERVICES];
      this.state.categories = (categoriesVal && Array.isArray(categoriesVal.value) && categoriesVal.value.length) ? categoriesVal.value : [...DEFAULT_CATEGORIES];
      this.state.staff = staffVal ? staffVal.value : [...DEFAULT_STAFF];
      this.state.customers = customersVal ? customersVal.value : [...DEFAULT_CUSTOMERS];
      this.state.queue = queueVal ? queueVal.value : [...DEFAULT_QUEUE];
      this.state.transactions = transactionsVal ? transactionsVal.value : [...DEFAULT_TRANSACTIONS];
      this.state.voidLog = (voidLogVal && Array.isArray(voidLogVal.value)) ? voidLogVal.value : [];
      this.state.expenseLog = (expenseLogVal && Array.isArray(expenseLogVal.value)) ? expenseLogVal.value : [];
      this.state.editLog = (editLogVal && Array.isArray(editLogVal.value)) ? editLogVal.value : [];
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
      this.googleSheetsApiToken = sheetsApiTokenVal ? String(sheetsApiTokenVal.value || '').trim() : '';
      this.telegramToken = telegramTokenVal ? telegramTokenVal.value : '';
      this.telegramChatId = telegramChatIdVal ? telegramChatIdVal.value : '';
      this.currentRole = 'staff';

      const vatEnabledVal = await db.state.get('vatEnabled');
      const vatRateVal    = await db.state.get('vatRate');
      this.vatEnabled = vatEnabledVal ? !!vatEnabledVal.value : false;
      this.vatRate    = (vatRateVal && Number.isFinite(Number(vatRateVal.value))) ? Number(vatRateVal.value) : 7;

    } catch (err) {
      console.error('Error loading IndexedDB', err);

      // ⚠️ จุดวิกฤต — อ่านฐานข้อมูลไม่สำเร็จ ไม่ได้แปลว่า "ไม่มีข้อมูล"
      // ข้อมูลจริงอาจยังอยู่ครบใน IndexedDB แค่อ่านไม่ได้ชั่วคราว (DB ถูกล็อกจากอีกแท็บ,
      // iOS ล้าง storage, เขียนค้างตอนแบตหมด) ค่าด้านล่างเป็นแค่ค่าว่างให้ UI เรนเดอร์ได้
      // ห้ามให้ค่าว่างชุดนี้ถูกเขียนกลับลง DB เด็ดขาด — จะทับข้อมูลจริงหายถาวร
      this.loadFailed = true;

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
      this.googleSheetsApiToken = '';
      this.telegramToken = '';
      this.telegramChatId = '';
      this.currentRole = 'staff';
      this.vatEnabled = false;
      this.vatRate = 7;

      // จอทึบเต็มหน้า ปิดไม่ได้ — toast เตือน 6 วิ ไม่พอ เพราะพนักงานกดปิดแล้วขายต่อ
      // แล้ว saveState() รอบแรกจะทับข้อมูลจริงทันที
      this.showFatalLoadError(err);
    }
  }

  // ─── จอเตือนวิกฤต: โหลดฐานข้อมูลไม่สำเร็จ ห้ามใช้งานต่อ ───────────────
  // ตั้งใจให้ปิดไม่ได้และไม่มีปุ่ม "ใช้งานต่อ" — การขายต่อในสถานะนี้ทำลายข้อมูลเก่า
  // หยุดขาย 5 นาทีเสียหายน้อยกว่าเสียประวัติทั้งร้าน
  showFatalLoadError(err) {
    const build = () => {
      if (document.getElementById('fatal-load-error')) return;
      const el = document.createElement('div');
      el.id = 'fatal-load-error';
      el.setAttribute('role', 'alertdialog');
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#450a0a;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;' +
        'font-family:system-ui,-apple-system,sans-serif;overflow:auto;';
      el.innerHTML =
        '<div style="max-width:520px;line-height:1.7">' +
          '<div style="font-size:3rem;margin-bottom:8px">⚠️</div>' +
          '<h1 style="font-size:1.5rem;margin:0 0 16px;font-weight:700">โหลดข้อมูลร้านไม่สำเร็จ</h1>' +
          '<p style="font-size:1.05rem;margin:0 0 20px">' +
            '<b>ห้ามขายต่อด้วยเครื่องนี้</b><br>' +
            'ข้อมูลจริงน่าจะยังอยู่ครบ แต่แอปอ่านไม่ได้ตอนนี้<br>' +
            'ถ้าขายต่อ ข้อมูลเก่าทั้งหมดจะถูกเขียนทับหายถาวร' +
          '</p>' +
          '<div style="background:rgba(0,0,0,0.35);border-radius:10px;padding:16px;text-align:left;font-size:0.95rem;margin-bottom:16px">' +
            '<b>ให้ทำตามลำดับนี้</b>' +
            '<ol style="margin:8px 0 0;padding-left:20px">' +
              '<li>ปิดแอปนี้ให้สนิท (ปัดขึ้นออกจากมัลติทาสก์)</li>' +
              '<li>ปิดแท็บ/หน้าต่างอื่นที่เปิดแอปนี้ค้างไว้ให้หมด</li>' +
              '<li>เปิดแอปใหม่</li>' +
              '<li>ถ้ายังขึ้นจอนี้อีก <b>อย่าลบแอป อย่าล้างข้อมูล</b> — ให้แจ้งผู้ดูแลระบบ</li>' +
            '</ol>' +
          '</div>' +
          '<p style="font-size:0.85rem;opacity:0.75;margin:0">ระบบได้ปิดการบันทึกข้อมูลทั้งหมดไว้แล้วเพื่อป้องกันข้อมูลเสียหาย</p>' +
          '<p style="font-size:0.75rem;opacity:0.5;margin:12px 0 0;word-break:break-word">' + escapeHtml(String((err && err.message) || err || '')) + '</p>' +
        '</div>';
      document.body.appendChild(el);
    };
    // loadState ถูกเรียกได้ก่อน DOM พร้อม — ถ้ายังไม่มี body ให้รอ
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build, { once: true });
  }

  // ⚠️ archiveOldData() ถูกลบออกในเวอร์ชัน 1.5.2
  // เคยเป็นตัวลบประวัติเก่าอัตโนมัติ แต่ถูกปิดการเรียกใช้ไปนานแล้ว (กันบิลเก่าหายหลังกู้ข้อมูล)
  // เหลือไว้เฉย ๆ ทำให้คนอ่านโค้ดเข้าใจผิดว่าระบบยังลบข้อมูลเก่าให้เอง จึงลบทิ้ง
  // ถ้าวันหนึ่งต้องจัดการข้อมูลที่บวม ให้ทำเป็นฟีเจอร์ "ส่งออกแล้วเก็บถาวร" ที่มีปุ่มให้เจ้าของกดเอง
  // ไม่ใช่ลบเงียบ ๆ เบื้องหลัง
  // เซฟข้อมูลลงใน IndexedDB
  async saveState() {
    // 🛑 กันข้อมูลหายถาวร — ถ้า loadState() ล้มเหลว state ในหน่วยความจำเป็นค่าว่าง
    // ไม่ใช่ข้อมูลจริง การเขียนลง DB ตอนนี้คือการทับข้อมูลจริงทิ้ง
    if (this.loadFailed) {
      console.error('[GUARD] ปฏิเสธการบันทึก — โหลดข้อมูลไม่สำเร็จตอนเปิดแอป');
      return false;
    }

    // 🛑 กันยอดขายหาย — เปิดแอปสองหน้าต่างบนเครื่องเดียว
    // saveState() เขียนข้อมูล "ทั้งร้าน" ทับทุกครั้ง ไม่ได้เขียนเฉพาะส่วนที่เปลี่ยน
    // หน้าต่าง A ขายบิลใหม่ → หน้าต่าง B ที่ยังถือ snapshot ตั้งแต่ตอนเปิด กดอะไรสักอย่างแล้วเซฟ
    // = บิลที่ A เพิ่งขายหายจากฐานข้อมูลทันที โดยที่ A ยังเห็นบิลนั้นบนจอตัวเอง
    // ให้มีหน้าต่างเดียวที่เขียนได้ ที่เหลืออ่านอย่างเดียว (ดู claimWriterLock)
    if (this.isReadOnlyWindow) {
      console.error('[GUARD] ปฏิเสธการบันทึก — หน้าต่างนี้ไม่ใช่หน้าต่างหลัก');
      this.warnReadOnlyWindow();
      return false;
    }

    try {
      await db.state.bulkPut([
        { key: 'services', value: this.state.services },
        { key: 'categories', value: this.state.categories },
        { key: 'staff', value: this.state.staff },
        { key: 'customers', value: this.state.customers },
        { key: 'queue', value: this.state.queue },
        { key: 'transactions', value: this.state.transactions },
        { key: 'voidLog', value: this.state.voidLog },
        { key: 'expenseLog', value: this.state.expenseLog },
        { key: 'editLog', value: this.state.editLog },
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
        { key: 'googleSheetsApiToken', value: this.googleSheetsApiToken || '' },
        { key: 'telegramToken', value: this.telegramToken },
        { key: 'telegramChatId', value: this.telegramChatId },
        { key: 'vatEnabled', value: !!this.vatEnabled },
        { key: 'vatRate', value: Number(this.vatRate) || 0 }
      ]);
      return true;
    } catch (e) {
      console.error('IndexedDB save failure!', e);
      this.showToast('บันทึกข้อมูลหน้าร้านล้มเหลว!', 'error');
      return false;
    }
  }

  // งานที่กระทบยอดขาย/ข้อมูลสำรองต้องไม่เดินหน้าต่อถ้า IndexedDB เขียนไม่สำเร็จ
  // เช็คเฉพาะ false เพื่อให้ test/method เก่าที่ไม่ได้คืนค่า ยังทำงานร่วมกันได้
  async saveStateOrThrow(actionLabel) {
    const saved = await this.saveState();
    if (saved === false) {
      throw new Error(`ไม่สามารถบันทึก${actionLabel || 'ข้อมูล'}ลงในเครื่องได้ — ระบบยกเลิกเพื่อป้องกันข้อมูลหาย`);
    }
    return true;
  }

  // ═══ หน้าต่างหลักหนึ่งเดียว (Writer lock) ═══════════════════════════
  //
  // ปัญหาที่แก้: เปิดแอปค้างไว้สองหน้าต่าง/สองแท็บบนเครื่องเดียว แล้วยอดขายหายเงียบ ๆ
  // เพราะ saveState() เขียนข้อมูลทั้งร้านทับ ไม่ใช่เขียนเฉพาะส่วนที่เปลี่ยน
  //
  // ทำไมใช้ Web Locks: เบราว์เซอร์ปล่อยล็อกให้เองเมื่อหน้าต่างปิด/ถูกระบบฆ่า
  // ไม่ต้องมีตัวจับเวลา ไม่มีล็อกค้างที่ต้องมาเก็บกวาดทีหลัง (ซึ่งจะกลายเป็นบั๊กที่แย่กว่าเดิม)
  //
  // ⚠️ เบราว์เซอร์ที่ไม่รองรับ ให้เขียนได้ตามเดิม — ยอมรับความเสี่ยงเดิมดีกว่าล็อกร้านออกจากระบบ
  claimWriterLock() {
    this.isReadOnlyWindow = false;
    const locks = (typeof navigator !== 'undefined' && navigator) ? navigator.locks : null;
    if (!locks || typeof locks.request !== 'function') {
      console.warn('[Writer] เบราว์เซอร์นี้ไม่รองรับ Web Locks — ข้ามการกันหน้าต่างซ้ำ');
      return;
    }
    try {
      // ifAvailable: รู้ผลทันทีว่ามีหน้าต่างอื่นถืออยู่ไหม (callback ถูกเรียกเสมอ ได้ lock หรือ null)
      locks.request(WRITER_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          this.setReadOnlyWindow(true);
          this.waitForWriterLock();     // เข้าคิวรอ ถ้าหน้าต่างหลักปิดเมื่อไหร่จะได้สิทธิ์ต่อ
          return;
        }
        this.setReadOnlyWindow(false);
        return new Promise(() => {});   // ถือล็อกไว้จนหน้าต่างนี้ปิด (เบราว์เซอร์ปล่อยให้เอง)
      }).catch(err => {
        // ขอล็อกไม่สำเร็จด้วยเหตุอื่น — ห้ามล็อกร้านออกจากระบบเพราะเรื่องนี้
        console.warn('[Writer] ขอสิทธิ์เขียนไม่สำเร็จ ใช้งานต่อแบบเดิม', err);
        this.setReadOnlyWindow(false);
      });
    } catch (err) {
      console.warn('[Writer] Web Locks ใช้งานไม่ได้ ใช้งานต่อแบบเดิม', err);
      this.isReadOnlyWindow = false;
    }
  }

  // เข้าคิวรอสิทธิ์เขียน — resolve เมื่อหน้าต่างหลักปิดลง
  waitForWriterLock() {
    const locks = (typeof navigator !== 'undefined' && navigator) ? navigator.locks : null;
    if (!locks || typeof locks.request !== 'function') return;
    locks.request(WRITER_LOCK_NAME, async (lock) => {
      if (!lock) return;
      await this.takeOverAsWriter();
      return new Promise(() => {});   // ถือต่อจนหน้าต่างนี้ปิด
    }).catch(err => console.warn('[Writer] รอสิทธิ์เขียนไม่สำเร็จ', err));
  }

  // รับสิทธิ์เขียนต่อจากหน้าต่างที่เพิ่งปิดไป
  async takeOverAsWriter() {
    // ⚠️ ต้องโหลดข้อมูลล่าสุดจากเครื่องก่อน "เสมอ" ห้ามข้าม
    // ระหว่างที่หน้าต่างนี้อ่านอย่างเดียว หน้าต่างหลักอาจขายไปแล้วหลายบิล
    // ข้อมูลในหน่วยความจำของหน้าต่างนี้คือ snapshot ตอนเปิด = เก่ากว่าความจริง
    // ถ้ารับสิทธิ์แล้วเขียนเลย บิลที่เพิ่งขายจะถูกทับหายทันที ซึ่งคือบั๊กเดิมที่กำลังแก้อยู่
    try {
      await this.loadState();
      if (this.loadFailed) {
        console.error('[Writer] โหลดข้อมูลใหม่ไม่สำเร็จ — คงโหมดอ่านอย่างเดียวไว้');
        return;   // ไม่ปลดล็อกโหมดอ่านอย่างเดียว ดีกว่าเขียนทับด้วยข้อมูลที่อ่านไม่ได้
      }
    } catch (err) {
      console.error('[Writer] โหลดข้อมูลใหม่ไม่สำเร็จ', err);
      return;
    }
    this.setReadOnlyWindow(false);
    // ⚠️ เพิ่งโหลดข้อมูลชุดใหม่เข้ามา — ผลตรวจความตรงกันที่ทำไว้ตอนยังเป็นหน้าต่างรอง
    // อ้างอิงข้อมูลเก่าทั้งหมด ถ้าไม่ทิ้ง ปุ่มลบจากผลตรวจนั้นจะลบบิลจริงได้
    this.invalidateReconcile('รับสิทธิ์เป็นหน้าต่างหลักและโหลดข้อมูลใหม่');
    try { this.renderEveryScreen(); } catch (e) { console.warn('render after takeover failed', e); }
    this.showToast('หน้าต่างนี้กลายเป็นหน้าต่างหลักแล้ว (โหลดข้อมูลล่าสุดให้แล้ว) — ขายต่อได้', 'success', 8000);
  }

  // ── ด่านกลาง: หน้าต่างนี้มีสิทธิ์เปลี่ยนข้อมูลของร้านไหม ─────────────
  // ⚠️ เดิมด่านอยู่ที่ saveState() จุดเดียว ซึ่ง "ไม่ใช่ด่าน" จริง เพราะมีทางเขียนอื่นที่เดินอ้อมได้:
  //   · ยิงบิล/สรุปขึ้น Google Sheets — ออกไปก่อนถึง saveState เลย
  //   · resetData() เรียก db.state.clear() ตรง ๆ ไม่ผ่าน saveState
  //   · สำรองขึ้น Drive — เอา snapshot เก่าไปทับไฟล์สำรองที่ดีอยู่
  // หน้าต่างรองถือข้อมูลตั้งแต่ตอนเปิด = เก่ากว่าความจริงเสมอ ทุกทางข้างบนจึงส่งของเก่าออกไปได้
  //
  // reason ใช้เพื่อบอกผู้ใช้ว่าอะไรถูกกัน — ไม่ใส่ = ไม่เตือน (ใช้กับงานเบื้องหลัง)
  canWriteData(reason) {
    if (!this.isReadOnlyWindow) return true;
    if (reason) {
      console.warn('[Guard] หน้าต่างอ่านอย่างเดียว — ปฏิเสธ:', reason);
      this.warnReadOnlyWindow();
    }
    return false;
  }

  setReadOnlyWindow(on) {
    this.isReadOnlyWindow = !!on;
    this.renderReadOnlyBanner();
  }

  // เตือนเมื่อมีคนพยายามบันทึกจากหน้าต่างอ่านอย่างเดียว — เว้นระยะ ไม่ให้ขึ้นรัว
  warnReadOnlyWindow() {
    const now = Date.now();
    if (this._roWarnAt && (now - this._roWarnAt) < 8000) return;
    this._roWarnAt = now;
    this.showToast('หน้าต่างนี้เปิดซ้ำอยู่ จึงบันทึกอะไรไม่ได้ — ให้ใช้หน้าต่างเดิมที่เปิดไว้ก่อน', 'error', 8000);
  }

  renderReadOnlyBanner() {
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.getElementById('read-only-window-banner');
    if (!this.isReadOnlyWindow) { if (existing) existing.remove(); return; }
    if (existing) return;

    const el = document.createElement('div');
    el.id = 'read-only-window-banner';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#7f1d1d;color:#fff;' +
      'padding:14px 16px;text-align:center;font-family:system-ui,-apple-system,sans-serif;font-size:0.95rem;line-height:1.6;' +
      'box-shadow:0 -4px 16px rgba(0,0,0,0.4)';
    el.innerHTML =
      '<b>แอปนี้เปิดอยู่อีกหน้าต่างหนึ่งแล้ว</b><br>' +
      'หน้าต่างนี้<b>บันทึกอะไรไม่ได้</b> เพื่อกันยอดขายที่อีกหน้าต่างเพิ่งขายถูกเขียนทับหาย<br>' +
      '<span style="opacity:0.85;font-size:0.88rem">ให้กลับไปใช้หน้าต่างเดิม หรือปิดหน้าต่างเดิมแล้วกดปุ่มข้างล่าง</span><br>' +
      '<button type="button" id="read-only-retry-btn" style="margin-top:10px;padding:8px 18px;border-radius:8px;border:none;' +
      'background:#fff;color:#7f1d1d;font-weight:700;cursor:pointer">ปิดหน้าต่างอื่นแล้ว — ใช้หน้าต่างนี้</button>';
    document.body.appendChild(el);

    const btn = document.getElementById('read-only-retry-btn');
    if (btn) btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.innerText = 'กำลังตรวจสอบ...';
      const locks = (typeof navigator !== 'undefined' && navigator) ? navigator.locks : null;
      if (!locks || typeof locks.request !== 'function') { this.setReadOnlyWindow(false); return; }
      locks.request(WRITER_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          btn.disabled = false;
          btn.innerText = 'ยังเปิดอยู่อีกหน้าต่าง — ลองใหม่';
          this.showToast('ยังมีอีกหน้าต่างเปิดแอปนี้อยู่ — ปิดให้หมดก่อนแล้วกดใหม่', 'warning', 6000);
          return;
        }
        await this.takeOverAsWriter();
        return new Promise(() => {});
      }).catch(err => {
        console.warn('[Writer] ลองขอสิทธิ์ใหม่ไม่สำเร็จ', err);
        btn.disabled = false;
        btn.innerText = 'ลองใหม่อีกครั้ง';
      });
    });
  }

  // ── บันทึกแบบมี rollback สำหรับงานที่แก้ข้อมูลหลัก ──────────────────────
  // ⚠️ กฎของโปรเจกต์: ห้ามเรียก saveState() เปล่า ๆ แล้วเดินต่อบนเส้นที่เปลี่ยนข้อมูล
  // เพราะถ้า IndexedDB เขียนไม่ผ่าน (เครื่องเต็ม/โควตาหมด/หน้าต่างซ้ำ) ผู้ใช้จะเห็นหน้าจอ
  // เปลี่ยนไปแล้วและได้ข้อความ "สำเร็จ" ทั้งที่ในเครื่องยังเป็นค่าเดิม — พอเปิดแอปใหม่ค่ากลับ
  //
  // รอบ ก.ย. 2569 เจอว่าเคยแก้เฉพาะ addExpense จุดเดียว ทั้งที่มีอีกสิบกว่าจุดที่ผิดกฎเดียวกัน
  // ตัวนี้จึงทำให้ทุกจุดใช้รูปแบบเดียวกันได้โดยไม่ต้องเขียน try/catch ซ้ำสิบกว่ารอบ
  //
  //   restore = ฟังก์ชันคืนค่าเดิม (ต้องเก็บค่าก่อนเปลี่ยนไว้เอง)
  //   คืน true เมื่อลงเครื่องจริงแล้วเท่านั้น — ผู้เรียกต้องแจ้งสำเร็จหลังจากนี้
  // ── เรียกงานวาดหน้าจอแบบไม่ให้ล้มทั้งแอป ────────────────────────────
  // ⚠️ ตอนเปิดแอป ถ้า renderAll() โยน error ทุกอย่างที่อยู่ถัดจากมันจะไม่ทำงาน
  // รวมถึง requireLogin() ที่สร้างปุ่มล็อกอิน → หน้าจอค้างว่าง เปิดร้านไม่ได้
  // เคสจริงที่เจอ: กู้ไฟล์ที่มี queue[].services = null แล้วเปิดแอปใหม่
  //
  // ข้อมูลเสียหนึ่งรายการต้องไม่แลกกับการที่ร้านเปิดไม่ได้ทั้งวัน
  safeRender(label, fn) {
    try { fn(); return true; }
    catch (err) {
      console.error(`[Render] ${label} ล้มเหลว`, err);
      this._renderFailures = (this._renderFailures || []).concat(label);
      return false;
    }
  }

  async persistOrRollback(actionLabel, restore) {
    try {
      await this.saveStateOrThrow(actionLabel);
      return true;
    } catch (err) {
      try { if (typeof restore === 'function') restore(); }
      catch (e) { console.error('[Rollback] คืนค่าเดิมไม่สำเร็จ', e); }
      console.error(`[Persist] ${actionLabel} ล้มเหลว`, err);
      this.showToast(err.message || `บันทึก${actionLabel}ไม่สำเร็จ — ค่าเดิมถูกคืนให้แล้ว`, 'error', 7000);
      return false;
    }
  }

  // ── ด่านร่วมของงานที่ "แตะข้อมูลทั้งชุด" ──────────────────────────────
  // ส่งออก / นำเข้า / ล้างยอดขาย / กู้ข้อมูล — ทุกตัวเขียนทับหรือคัดลอกข้อมูลทั้งร้านออกไป
  // เดิมพึ่งด่านเดียวคือ switchTab ไม่ให้คนที่ไม่ใช่เจ้าของเข้าหน้าตั้งค่า
  // ด่านชั้นเดียวแปลว่าถ้าวันหนึ่งมีปุ่มลัด/ลิงก์/โค้ดเรียกฟังก์ชันตรง ๆ มันจะถูกข้ามไปเงียบ ๆ
  //
  // ต้องกัน loadFailed ด้วย ไม่ใช่แค่เรื่องสิทธิ์: ตอนโหลดข้อมูลไม่สำเร็จ
  // state ในหน่วยความจำเป็นค่าว่าง ไม่ใช่ข้อมูลจริง — กด "ส่งออก" ตอนนั้นจะได้ไฟล์สำรองเปล่า
  // ที่หน้าตาเหมือนใช้ได้ทุกอย่าง ซึ่งอันตรายกว่าการไม่มีไฟล์สำรองเลย
  requireOwnerForDataAction(actionLabel) {
    if (this.loadFailed) {
      this.showToast(`โหลดข้อมูลไม่สำเร็จ — ปิด${actionLabel}ไว้เพื่อความปลอดภัย`, 'error');
      return false;
    }
    if (this.currentRole !== 'owner') {
      this.showToast(`เฉพาะเจ้าของร้านเท่านั้นที่${actionLabel}ได้`, 'warning');
      return false;
    }
    return true;
  }

  // ── ใครดูสรุป "รายเดือน" ได้ ────────────────────────────────────────────
  // เฉพาะเจ้าของร้าน · ผู้จัดการดูได้แค่สรุปรายวัน
  // เหตุผล: ยอดรวมทั้งเดือนคือตัวเลขระดับกิจการ (รายได้รวม กำไร แนวโน้ม)
  // ส่วนสรุปรายวันคือข้อมูลที่ผู้จัดการต้องใช้คุมหน้างานจริง — คนละระดับกัน
  //
  // เขียนแบบ "อนุญาตเฉพาะ" ไม่ใช่ "ห้ามพนักงาน" — วันไหนเพิ่มตำแหน่งใหม่
  // หรือมีจังหวะที่ระบบยังไม่รู้ว่าใครล็อกอินอยู่ ด่านนี้จะปิดไว้ก่อนเสมอ
  canViewMonthlyReport() {
    return this.currentRole === 'owner';
  }

  // สำเนาสำหรับย้อนสถานะในหน่วยความจำเมื่อการเขียน IndexedDB ล้มเหลว
  // ข้อมูล POS เป็น JSON-compatible ทั้งหมด จึงใช้ structuredClone เมื่อมี และมี fallback สำหรับ Safari รุ่นเก่า
  cloneForRollback(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  isValidCloudApiToken(token) {
    // ใช้ token แบบสุ่มที่คัดลอกมาจาก Apps Script เท่านั้น; ไม่รับช่องว่างหรืออักขระแปลก
    return typeof token === 'string' &&
      new RegExp(`^[A-Za-z0-9_-]{${CLOUD_API_TOKEN_MIN_LENGTH},200}$`).test(token);
  }

  hasCloudSyncConfig() {
    return !!this.googleSheetsUrl && this.isValidCloudApiToken(this.googleSheetsApiToken || '');
  }

  // ตั้งค่า URL หรือ token ไว้แล้ว แต่ยังไม่ครบ ก็ถือว่า "กำลังเริ่มเชื่อมคลาวด์"
  // ใช้เก็บงานสรุปไว้ก่อนระหว่างอัปเดต Apps Script / วาง token เพื่อไม่ให้ปิดกะช่วงนั้นแล้วสรุปหาย
  hasCloudSetupStarted() {
    return !!this.googleSheetsUrl || !!this.googleSheetsApiToken;
  }

  getCloudSetupMessage() {
    if (!this.googleSheetsUrl) return 'กรุณากรอก URL ของ Google Sheets Web App ก่อน';
    if (!this.isValidCloudApiToken(this.googleSheetsApiToken || '')) {
      return 'กรุณากรอกรหัสเชื่อมต่อ Apps Script ที่หน้า ตั้งค่า → Google Sheets';
    }
    return '';
  }

  // ── แปลข้อความผิดพลาดจากฝั่งชีตให้คนหน้าร้านอ่านแล้วรู้ว่าต้องทำอะไร ──────
  // เดิมเอาข้อความดิบจากเซิร์ฟเวอร์มาโชว์ตรง ๆ เช่น "ไม่ได้รับอนุญาต (unauthorized)"
  // ซึ่งบอกแค่ว่า "พัง" ไม่ได้บอกว่าพังตรงไหนหรือแก้ยังไง — 26 ส.ค. 2569 เสียเวลาไปกับเรื่องนี้จริง
  //
  // กฎ: ข้อความที่รู้จักให้แปลเป็นวิธีแก้ · ข้อความที่ไม่รู้จักส่งกลับตามเดิม ห้ามกลืนหาย
  // (ข้อความเต็มยังถูก console.error ไว้ทุกจุดอยู่แล้ว สำหรับตอนต้องไล่ปัญหาจริง)
  explainCloudError(raw) {
    const msg = String((raw && raw.message) || raw || '').trim();
    if (!msg) return this._rememberExplained('เชื่อมต่อ Google Sheets ไม่สำเร็จ (ไม่มีรายละเอียดเพิ่มเติม)');
    // ต้องแปลซ้ำแล้วได้ผลเดิม — ข้อความเดียวกันเดินผ่านตัวนี้ได้ 2 รอบ
    // (รอบแรกตอนโยน error รอบสองตอนเอาไปแสดงบนหน้าจอ) ถ้าไม่กัน จะได้หางต่อท้ายซ้อนกัน
    if (this._cloudErrorExplained && this._cloudErrorExplained.has(msg)) return msg;

    // ── รหัสเชื่อมต่อ ──────────────────────────────────────────────
    if (/unauthorized|ไม่ได้รับอนุญาต/i.test(msg)) {
      return this._rememberExplained('รหัสเชื่อมต่อไม่ตรงกับ Apps Script — ไปตั้งใหม่ที่ ตั้งค่า → Google Sheets ' +
             '(เปิด Apps Script รันฟังก์ชัน setupPosApiToken เพื่อดูรหัสที่ถูกต้อง · ห้ามรัน rotatePosApiToken)');
    }
    if (/ยังไม่ได้ตั้งรหัสเชื่อมต่อ/.test(msg)) {
      return this._rememberExplained('ฝั่ง Apps Script ยังไม่ได้ตั้งรหัสเชื่อมต่อ — เปิด Apps Script รันฟังก์ชัน setupPosApiToken หนึ่งครั้ง แล้วเอารหัสที่ได้มาใส่ในหน้าตั้งค่า');
    }

    // ── Deploy ผิด (เจอบ่อยสุดตอนตั้งค่าครั้งแรก) ─────────────────────
    // ตั้ง Who has access เป็น "Only myself" → Google ส่งหน้าล็อกอิน HTML กลับมา
    // แล้ว res.json() พังเป็น "Unexpected token '<'" ซึ่งไม่มีทางเดาได้เลยว่าหมายถึงอะไร
    if (/unexpected token|is not valid json|json\.parse|<!doctype|<html/i.test(msg)) {
      return this._rememberExplained('ชีตตอบกลับมาไม่ใช่ข้อมูล (น่าจะเป็นหน้าล็อกอินของ Google) — ตอน Deploy Apps Script ต้องตั้ง Who has access = Anyone');
    }
    if (/HTTP (401|403)/.test(msg)) {
      return this._rememberExplained('Apps Script ไม่ยอมให้เครื่องนี้เรียกใช้ — ตอน Deploy ต้องตั้ง Who has access = Anyone แล้วคัดลอก URL ใหม่มาใส่ในหน้าตั้งค่า');
    }
    if (/HTTP 404/.test(msg)) {
      return this._rememberExplained('ไม่พบ URL นี้ — URL ของ Apps Script เปลี่ยนได้เมื่อ Deploy ใหม่ ให้คัดลอก URL ล่าสุดมาใส่ที่ ตั้งค่า → Google Sheets');
    }
    if (/HTTP 5\d\d/.test(msg)) {
      return this._rememberExplained('ฝั่ง Google ขัดข้องชั่วคราว — รอสักครู่แล้วลองใหม่ ข้อมูลในเครื่องยังอยู่ครบ');
    }

    // ── ชีตทำงานไม่ทัน / เน็ต ──────────────────────────────────────
    if (/ระบบหนาแน่น/.test(msg)) {
      return this._rememberExplained('ชีตกำลังทำงานอื่นค้างอยู่ ยังรับคำขอใหม่ไม่ได้ — รอสักครู่แล้วลองใหม่');
    }
    if (/หมดเวลารอ/.test(msg)) {
      return this._rememberExplained(msg + ' — เช็คสัญญาณเน็ตของร้าน · ข้อมูลในเครื่องยังอยู่ครบ ระบบจะส่งให้เองเมื่อเน็ตกลับมา');
    }

    // ── ข้อมูลที่ส่งไปมีปัญหา ──────────────────────────────────────
    if (/ไม่พบข้อมูลที่ส่งมา/.test(msg)) {
      return this._rememberExplained('คำขอไปถึงชีตแบบไม่มีข้อมูลติดไป — เน็ตน่าจะสะดุดกลางทาง ลองใหม่อีกครั้ง');
    }
    // โครงสร้างคอลัมน์บนชีตเพี้ยน — ไม่ใช่ความผิดของบิล และรอเฉย ๆ ไม่มีวันหาย
    // ต้องบอกให้ชัดว่าต้องไปแก้ "หัวตารางบนชีต" ไม่ใช่ให้ลองใหม่หรือแก้ที่แอป
    if (/โครงสร้างคอลัมน์|SCHEMA_MISMATCH/.test(msg)) {
      return this._rememberExplained(msg.replace(/^SCHEMA_MISMATCH:?\s*/, '') +
        ' — บิลยังอยู่ในเครื่องครบและจะถูกส่งขึ้นชีตเองหลังแก้หัวตารางเสร็จ');
    }
    if (/เดือนของบิลไม่ถูกต้อง|เลขที่บิลไม่ถูกต้อง|ยอดเงินในบิล/.test(msg)) {
      return this._rememberExplained(msg + ' — บิลใบนี้ส่งขึ้นชีตไม่ได้ ให้แจ้งผู้ดูแลระบบ · ยอดในเครื่องยังอยู่ครบ');
    }

    // ── ไฟล์สำรอง ────────────────────────────────────────────────
    if (/ไม่พบโฟลเดอร์/.test(msg)) {
      return this._rememberExplained('ยังไม่มีโฟลเดอร์สำรองใน Google Drive — โฟลเดอร์จะถูกสร้างอัตโนมัติหลังปิดกะครั้งแรกที่ซิงก์สำเร็จ');
    }
    if (/ไม่พบไฟล์นี้ในโฟลเดอร์สำรอง/.test(msg)) {
      return this._rememberExplained('ไฟล์สำรองนี้ไม่อยู่ใน Drive แล้ว (อาจถูกลบไปหรือเก่าเกิน 90 วัน) — กดโหลดรายการใหม่แล้วเลือกไฟล์อื่น');
    }

    return msg; // ไม่รู้จัก — ส่งกลับตามเดิม ดีกว่าเดาแล้วบอกผิด
  }

  // จำข้อความที่แปลแล้วไว้ชุดเล็ก ๆ เพื่อกันแปลซ้ำซ้อน (ดูหมายเหตุใน explainCloudError)
  _rememberExplained(out) {
    if (!this._cloudErrorExplained) this._cloudErrorExplained = new Set();
    if (this._cloudErrorExplained.size > 50) this._cloudErrorExplained.clear();
    this._cloudErrorExplained.add(out);
    return out;
  }

  buildCloudRequest(action, data = {}) {
    return { secret: this.googleSheetsApiToken, action, ...data };
  }

  // ── ก้อนข้อมูลสำรองมาตรฐาน — ใช้ร่วมกันทุกทาง (Drive / ไฟล์ .json / สำเนาก่อนกู้) ──
  // ต้องเป็นตัวเดียวกันทั้งหมด ไม่งั้นแก้ที่หนึ่งแล้วลืมอีกที่เมื่อไหร่ ไฟล์สำรองจะมีข้อมูลไม่ครบเท่ากัน
  buildBackupPayload() {
    return {
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      services: this.state.services,
      categories: this.state.categories,
      staff: this.state.staff,
      customers: this.state.customers,
      queue: this.state.queue,
      transactions: this.state.transactions,
      voidLog: this.state.voidLog || [], // ประวัติการยกเลิกบิล — audit trail ต้องติดไปกับไฟล์สำรองด้วย
      expenseLog: this.state.expenseLog || [], // ประวัติการลบค่าใช้จ่าย — เหตุผลเดียวกัน
      editLog: this.state.editLog || [], // ประวัติการแก้บิลย้อนหลัง — เหตุผลเดียวกัน
      shift: this.state.shift,
      shopPromptPayId: this.shopPromptPayId || '',
      shopName: this.shopName || 'Erotica Barber & Massage',
      shopTagline: this.shopTagline || 'BARBER & MASSAGE',
      shopAddress: this.shopAddress || '',
      shopPhone: this.shopPhone || '',
      shopLogo: this.shopLogo || '',
      theme: this.theme || 'dark',
      vatEnabled: !!this.vatEnabled,
      vatRate: Number(this.vatRate) || 0,
      // ownerPin และ googleSheetsApiToken ไม่ส่งออกไป — ต้องตั้งใหม่บนเครื่องที่กู้คืน
      googleSheetsUrl: this.googleSheetsUrl || '',
      // telegramToken ถูกตัดออกเพื่อความปลอดภัย (ตั้งค่าใหม่หลัง restore)
      telegramChatId: this.telegramChatId || '',
      // งานคลาวด์ที่ยังค้างตอนสำรอง — ดู buildPendingCloudWorkSnapshot()
      pendingCloudWork: this.buildPendingCloudWorkSnapshot()
    };
  }

  // ── งานคลาวด์ที่ยังค้าง ณ เวลาที่สำรอง ────────────────────────────────
  // ทำไมต้องเก็บ: ยกเลิกบิลตอนออฟไลน์ → คำสั่ง "ลบแถวบนชีต" ค้างอยู่ใน outbox
  // ถ้าสำรองแล้วกู้ลงเครื่องใหม่ คำสั่งนั้นหายไปพร้อมเครื่องเก่า
  // แถวบิลที่ยกเลิกไปแล้วจะค้างบนชีต **ถาวร** ไม่มีอะไรมาลบให้อีกเลย
  // ยอดในแท็บบิลจะมากกว่าความจริง และไม่ตรงกับแท็บสรุป โดยไม่มีใครรู้
  //
  // เก็บ "เจตนา" ไม่ใช่ outbox ดิบ:
  //   · เลขที่บิลที่สั่งลบ + วัน/เดือนเดิมของบิล (ต้องใช้ชี้แท็บเดือนให้ถูก)
  //   · งวดที่ต้องรีเฟรชสรุป (ตอน flush จะคำนวณใหม่จากข้อมูลที่กู้มา ไม่ได้ใช้ตัวเลขเก่า)
  // ⚠️ ไม่เก็บข้อความ Telegram — ไม่งั้นกู้ข้อมูลทีเดียวได้แจ้งเตือนเก่าย้อนหลังทั้งกอง
  // ⚠️ ไม่เก็บ token ใด ๆ (เหตุผลเดียวกับ ownerPin/telegramToken)
  buildPendingCloudWorkSnapshot() {
    const outbox = Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : [];
    const voidDeletes = [];
    const dateKeys = new Set(), monthKeys = new Set();
    outbox.forEach(it => {
      if (!it) return;
      if (it.needVoidDelete && it.voidDelete && it.voidDelete.id) {
        voidDeletes.push({
          id: it.voidDelete.id,
          date: it.voidDelete.date,
          monthKey: it.voidDelete.monthKey,
          voidedBy: it.voidDelete.voidedBy || '',
          voidedAt: Number(it.voidDelete.voidedAt) || 0
        });
      }
      if (it.needSummary) {
        (Array.isArray(it.dateKeys) ? it.dateKeys : []).forEach(k => dateKeys.add(k));
        (Array.isArray(it.monthKeys) ? it.monthKeys : []).forEach(k => monthKeys.add(k));
      }
    });
    return {
      voidDeletes: voidDeletes,
      summaryDateKeys: [...dateKeys],
      summaryMonthKeys: [...monthKeys]
    };
  }

  // ── สร้างงานคลาวด์คืนจากไฟล์สำรอง ────────────────────────────────────
  // คืนอาเรย์เปล่าเมื่อไฟล์รุ่นเก่าไม่มีข้อมูลส่วนนี้ (ไม่ใช่ error — แค่สร้างคืนไม่ได้)
  rebuildCloudOutboxFromBackup(parsed) {
    const mkId = () => `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pending = parsed && parsed.pendingCloudWork;
    this._restoredCloudWork = { voidDeletes: 0, summaries: 0, skipped: 0, unsupported: false };

    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) {
      // ไฟล์สำรองก่อน v3 — ต้องบอกตรง ๆ ว่าสร้างงานค้างคืนไม่ได้ ไม่ใช่เงียบแล้วปล่อยแถวผีค้างบนชีต
      this._restoredCloudWork.unsupported = true;
      return [];
    }

    const out = [];
    // บิลที่ "ยังอยู่" ในข้อมูลที่กู้มา ห้ามสั่งลบเด็ดขาด
    // เกิดได้ถ้าไฟล์เป็นสถานะก่อนการยกเลิก แล้วมีคำสั่งลบของอีกชุดข้อมูลติดมา
    // ถ้าปล่อยผ่าน = ลบบิลที่ยังมีชีวิตอยู่ออกจากชีต ซึ่งกู้กลับไม่ได้
    const alive = new Set((Array.isArray(parsed.transactions) ? parsed.transactions : [])
      .map(t => t && t.id).filter(Boolean));

    (Array.isArray(pending.voidDeletes) ? pending.voidDeletes : []).forEach(v => {
      if (!v || typeof v !== 'object') return;
      if (!isSafeEntityId(v.id)) return;
      if (!this.isValidMonthKey(v.monthKey)) return;   // ไม่รู้แท็บเดือน = สั่งลบไม่ได้
      if (alive.has(v.id)) { this._restoredCloudWork.skipped++; return; }
      out.push({
        id: mkId(), createdAt: Date.now(),
        dateKeys: [], monthKeys: [],
        needVoidDelete: true,
        voidDelete: { id: v.id, date: v.date, monthKey: v.monthKey, voidedBy: v.voidedBy || '', voidedAt: Number(v.voidedAt) || 0 },
        needSummary: false, needTelegram: false, telegramMessage: '', tries: 0
      });
      this._restoredCloudWork.voidDeletes++;
    });

    // งานสรุป: เก็บแค่ "งวดไหน" — ตอน flush จะคำนวณใหม่จากข้อมูลที่กู้มาเสมอ
    // จึงไม่มีทางเอาตัวเลขเก่าไปทับชีต
    const dks = (Array.isArray(pending.summaryDateKeys) ? pending.summaryDateKeys : [])
      .filter(k => this.isValidDateKey(k));
    const mks = (Array.isArray(pending.summaryMonthKeys) ? pending.summaryMonthKeys : [])
      .filter(k => this.isValidMonthKey(k));
    if (dks.length || mks.length) {
      out.push({
        id: mkId(), createdAt: Date.now(),
        dateKeys: dks, monthKeys: mks,
        needVoidDelete: false, voidDelete: null,
        needSummary: true, needTelegram: false, telegramMessage: '', tries: 0
      });
      this._restoredCloudWork.summaries = dks.length + mks.length;
    }
    return out;
  }

  // สำรองข้อมูลขึ้น Google Drive
  // คืน true เมื่อไฟล์ขึ้น Drive สำเร็จจริง — resetData() ใช้ค่านี้ตัดสินว่าจะยอมลบข้อมูลไหม
  async autoBackupToGoogleDrive() {
    if (!this.canWriteData('สำรองข้อมูลขึ้น Drive')) return false;   // snapshot เก่าจะไปทับไฟล์สำรองที่ดีอยู่
    if (!this.hasCloudSyncConfig()) return false;
    if (this.loadFailed) return false; // state เป็นค่าว่าง — สำรองไปก็ได้ไฟล์เปล่าไปทับของดีบน Drive

    const backupData = this.buildBackupPayload();

    const payload = this.buildCloudRequest('backup', { backupData });

    this.showToast('กำลังสำรองข้อมูลไป Google Drive...', 'info');

    try {
      // backup payload ก้อนใหญ่ (ข้อมูลทั้งร้าน) — ให้เวลา 30 วิ มากกว่างานปกติ
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }, 30000);

      if (!response.ok) {
        throw new Error(this.explainCloudError(`HTTP ${response.status}`));
      }

      const result = await response.json();
      if (result.status === 'success') {
        this.showToast('สำรองข้อมูลขึ้น Google Drive สำเร็จ!', 'success');
        console.log('Google Drive Backup success:', result.details);
        return true;
      } else {
        throw new Error(this.explainCloudError(result.message) || 'คลาวด์แจ้งเตือนข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Auto backup failed:', err);
      this.showToast('สำรองข้อมูลขึ้น Google Drive ล้มเหลว: ' + this.explainCloudError(err), 'error', 8000);
      return false;
    }
  }

  // เคลียร์ข้อมูลทั้งหมดในระบบคืนสู่ค่าเดิม
  // ⚠️ ทำลายข้อมูลถาวร กู้ไม่ได้ — จึงบังคับ 3 ด่าน: สิทธิ์เจ้าของ → พิมพ์คำยืนยัน → backup สำเร็จ
  // เหตุผลที่ไม่ใช้ showConfirm ธรรมดา: คนกดยืนยัน dialog ตามความเคยชินโดยไม่อ่าน
  // การบังคับ "พิมพ์" ทำให้ต้องอ่านและตั้งใจจริง
  async resetData() {
    if (this.loadFailed) {
      this.showToast('โหลดข้อมูลไม่สำเร็จ — ปิดฟังก์ชันนี้ไว้เพื่อความปลอดภัย', 'error');
      return;
    }
    // ⚠️ ฟังก์ชันนี้เรียก db.state.clear() ตรง ๆ ไม่ผ่าน saveState() ด่านหน้าต่างหลักจึงไม่ครอบ
    // ผลคือหน้าต่างรองล้างฐานข้อมูลทิ้งได้ ทั้งที่หน้าต่างหลักยังขายอยู่และเห็นบิลบนจอครบ
    if (!this.canWriteData('ล้างข้อมูลทั้งหมด')) return;
    if (this.currentRole !== 'owner') {
      this.showToast('เฉพาะเจ้าของร้านเท่านั้นที่รีเซ็ตข้อมูลทั้งหมดได้', 'warning');
      return;
    }

    const KEYWORD = 'ลบทั้งหมด';
    const typed = window.prompt(
      'คำเตือน: การรีเซ็ตจะลบข้อมูลทั้งหมดถาวร กู้คืนไม่ได้\n' +
      `(บิล ${this.state.transactions.length} รายการ · พนักงาน ${this.state.staff.length} คน · ` +
      `ลูกค้า ${this.state.customers.length} คน · ประวัติกะ ${(this.state.shift.history || []).length} กะ)\n\n` +
      `ถ้าแน่ใจจริง ให้พิมพ์คำว่า  ${KEYWORD}  แล้วกดตกลง`
    );
    if (typed === null) return;                       // กดยกเลิก
    if (typed.trim() !== KEYWORD) {
      this.showToast('ข้อความยืนยันไม่ตรง — ยกเลิกการรีเซ็ตแล้ว', 'info');
      return;
    }

    // ด่านสุดท้าย: ต้องมีสำเนาบน Drive ก่อน ไม่งั้นไม่มีอะไรให้กู้เลย
    if (this.googleSheetsUrl) {
      this.showToast('กำลังสำรองข้อมูลก่อนรีเซ็ต...', 'info');
      const ok = await this.autoBackupToGoogleDrive();
      if (!ok) {
        this.showToast('สำรองข้อมูลไม่สำเร็จ — ยกเลิกการรีเซ็ตเพื่อความปลอดภัย ลองใหม่เมื่อเน็ตพร้อม', 'error', 6000);
        return;
      }
    } else {
      // ไม่ได้ตั้ง URL = ไม่มีสำเนาที่ไหนเลย ต้องยืนยันอีกชั้นว่ารับความเสี่ยงเอง
      const sure = window.confirm(
        'ยังไม่ได้ตั้งค่า Google Sheets — ระบบสำรองข้อมูลก่อนลบไม่ได้\n' +
        'ถ้าลบตอนนี้ ข้อมูลจะหายถาวรโดยไม่มีสำเนาที่ไหนเลย\n\nยืนยันจะลบทั้งที่ไม่มีสำเนา?'
      );
      if (!sure) return;
    }

    try {
      await db.state.clear();
    } catch (e) { console.error(e); }
    localStorage.clear();
    this.clearDateKeyCache();
    await this.loadState();
    await this.migratePinIfNeeded();
    this.renderEveryScreen();
    this.showToast('คืนค่าเริ่มต้นข้อมูลเรียบร้อยแล้ว!', 'info');
  }

  clearSalesData() {
    if (!this.requireOwnerForDataAction('ล้างยอดขาย')) return;
    this.showConfirm('คุณแน่ใจหรือไม่ว่าต้องการล้างยอดขายและคิวงานทั้งหมด? (รายการพนักงาน บริการ และค่าคอมมิชชั่นที่เพิ่งตั้งค่าจะถูกเก็บไว้)', async () => {
      // ล้างยอดขาย = ลบเงินทั้งชุดออกจากระบบ ถ้าเขียนเครื่องไม่สำเร็จแล้วปล่อยผ่าน
      // หน้าจอจะว่างเปล่าเหมือนล้างสำเร็จ แต่เปิดแอปใหม่ยอดกลับมาทั้งหมด — สองสถานะที่ไม่ตรงกัน
      const prevAll = this.cloneForRollback({
        transactions: this.state.transactions, queue: this.state.queue, cart: this.state.cart,
        voidLog: this.state.voidLog, expenseLog: this.state.expenseLog, editLog: this.state.editLog,
        cloudOutbox: this.state.cloudOutbox, shift: this.state.shift
      });
      this.state.transactions = [];
      this.state.queue = [];
      this.state.cart = [];
      this.state.voidLog = [];     // ล้างประวัติ void ของยอดเก่าไปพร้อมกัน
      this.state.expenseLog = [];  // ประวัติการลบค่าใช้จ่ายก็เป็นของยอดเก่า ล้างไปด้วยกัน
      this.state.editLog = [];     // ประวัติการแก้บิลของยอดเก่า ล้างไปด้วยกัน

      // งานคลาวด์ที่ค้าง: ต้องตัด "งานสรุป" ทิ้ง (ไม่งั้น outbox เก่าจะ flush สรุป "ศูนย์" ไปทับชีตของวันเก่า)
      // แต่ต้อง "เก็บคำสั่งลบแถวบิลไว้" — เดิมล้างทิ้งทั้งก้อน ทำให้บิลที่ยกเลิกไปแล้วแต่ยังลบในชีตไม่สำเร็จ
      // (เน็ตหลุด/GAS ล่ม) ค้างเป็นแถวผีในชีตถาวร ไม่มีอะไรมาลบให้อีกเลย → ยอดแท็บบิลไม่ตรงกับชีตสรุป
      this.state.cloudOutbox = (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : [])
        .filter(it => it.needVoidDelete && it.voidDelete)
        .map(it => ({ ...it, needSummary: false, needTelegram: false, telegramMessage: '' }));
      this.state.shift = {
        active: false,
        startTime: null,
        startCash: 0,
        startDetails: {},
        expenses: [],
        history: []
      };
      this.clearDateKeyCache();   // บิลถูกล้างทั้งชุด — ผลที่จำไว้ไม่มีความหมายแล้ว
      if (!await this.persistOrRollback('การล้างยอดขาย', () => {
        Object.assign(this.state, prevAll);
        this.clearDateKeyCache();
      })) { this.renderEveryScreen(); return; }
      this.renderEveryScreen();
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
    const btnQuote = document.getElementById('btn-print-quote');
    if (btnQuote) btnQuote.addEventListener('click', () => this.showQuotePreview());
    
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
    // ตั้งค่า VAT
    const btnSaveVat = document.getElementById('btn-save-vat');
    if (btnSaveVat) btnSaveVat.addEventListener('click', () => this.saveVatSettings());
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
  
  // วาดใหม่เฉพาะหน้าที่ผู้ใช้เปิดอยู่จริง
  // เดิมวาดใหม่ทั้ง 6 หน้าทุกครั้งที่จบบิล รวมหน้ารายงานที่ต้องวนอ่านบิลทั้งเดือน
  // ทั้งที่พนักงานยังยืนอยู่หน้าขาย ไม่ได้ดูหน้าพวกนั้นเลย
  // ปลอดภัย: switchTab() วาดหน้าปลายทางให้ทุกครั้งที่สลับแท็บอยู่แล้ว ข้อมูลจึงไม่ค้างเก่า
  renderAll() {
    const screen = (this.state && this.state.activeScreen) || 'dashboard';
    switch (screen) {
      case 'pos':
        this.renderPos();
        this.renderQueueScreen(); // หน้าขายโชว์คิวงานด้วย ต้องตรงเสมอ (ถูกกว่าวาดหน้ารายงานมาก)
        break;
      case 'queue':     this.renderQueueScreen();   break;
      case 'customers': this.renderCustomerTable(); break;
      case 'reports':   this.renderReports();       break;
      case 'settings':  this.renderSettingsLists(); break;
      default:          this.renderDashboard();     break;
    }
  }

  // วาดใหม่ทุกหน้าจริง ๆ — ใช้เฉพาะตอนข้อมูลถูกแทนที่ทั้งชุด (นำเข้าไฟล์ / กู้ข้อมูล / ล้างข้อมูล)
  renderEveryScreen() {
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
              <span class="desc">${(Array.isArray(q.services) ? q.services : []).map(s => `${escapeHtml(s.name)} (${escapeHtml(s.staffName)})`).join(', ')}</span>
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
              <span class="desc">${timeStr} น. • ${Array.isArray(tx.services) ? tx.services.length : 0} บริการ • ชำระผ่าน ${tx.paymentMethod === 'promptpay' ? 'Scan' : tx.paymentMethod === 'credit' ? 'Credit' : 'เงินสด'}</span>
            </div>
            <span class="activity-value" style="color: var(--color-success);">฿${Number(tx.total) || 0}</span>
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
                <span class="popular-service-count">${Number(item.count) || 0} ครั้ง</span>
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
      expStaffSelect.innerHTML = this.state.staff.map(st => `<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`).join('');
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
                <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr} น.${e.by ? ' • โดย ' + escapeHtml(e.by) : ''}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--accent-premium);">฿${e.amount.toLocaleString('th-TH')}</span>
                <button type="button" class="btn-icon" onclick="app.deleteExpense('${safeId(e.id)}')" style="background: none; border: none; color: var(--accent-premium); cursor: pointer; padding: 4px;">
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
        <button class="tab-btn ${activeClass} ${tabClass}" onclick="app.selectPosCategory('${safeId(cat.id)}')">
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
        const iconClass = safeIcon(cat && cat.icon, 'fa-scissors');

        return `
          <div class="service-card ${cardClass}" onclick="app.addToCart('${safeId(s.id)}')">
            <div class="service-card-icon">
              <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="service-info">
              <span class="service-name">${escapeHtml(s.name)}</span>
              <span class="service-duration">
                ${(Number(s.duration) || 0) > 0
                  ? `<i class="fa-regular fa-clock"></i> ${Number(s.duration) || 0} นาที`
                  : `<i class="fa-solid fa-bag-shopping"></i> สินค้า`}
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
      optionsHtml += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.phone)})</option>`;
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
              <span class="queue-time"><i class="fa-regular fa-clock"></i> รอประมาณ ${Number(totalMin) || 0} นาที</span>
            </div>
            <div>
              ${(Array.isArray(q.services) ? q.services : []).map(s => `
                <div style="margin-bottom: 4px;">
                  <span class="queue-service-badge"><i class="fa-solid fa-scissors" style="margin-right: 4px;"></i> ${escapeHtml(s.name)}</span>
                  <span class="queue-staff-info"><i class="fa-solid fa-user-circle"></i> พนักงาน: ${escapeHtml(s.staffName)}</span>
                </div>
              `).join('')}
            </div>
            <div class="queue-actions">
              <button class="btn-small danger" onclick="app.removeQueue('${safeId(q.id)}')">ยกเลิกคิว</button>
              <button class="btn-small primary" onclick="app.startQueue('${safeId(q.id)}')">เริ่มบริการ <i class="fa-solid fa-play"></i></button>
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
          <div class="queue-card serving" id="queue-card-${escapeHtml(q.id)}" data-start="${Number(q.startTime) || 0}" data-duration="${Number(q.totalDuration) || 0}">
            <div class="queue-card-top">
              <span class="queue-customer">${escapeHtml(q.customerName)}</span>
              <span class="queue-time" id="time-elapsed-${escapeHtml(q.id)}">ให้บริการไปแล้ว ${Number(minutesElapsed) || 0}/${Number(q.totalDuration) || 0} นาที</span>
            </div>
            <div>
              ${(Array.isArray(q.services) ? q.services : []).map(s => `
                <div style="margin-bottom: 4px;">
                  <span class="queue-service-badge"><i class="fa-solid fa-spa" style="margin-right: 4px; color: var(--accent-massage);"></i> ${escapeHtml(s.name)}</span>
                  <span class="queue-staff-info"><i class="fa-solid fa-user-circle"></i> พนักงาน: ${escapeHtml(s.staffName)}</span>
                </div>
              `).join('')}
            </div>
            <div class="queue-progress-bar">
              <div class="queue-progress" id="progress-bar-${escapeHtml(q.id)}" style="width: ${Number(percent) || 0}%;"></div>
            </div>
            <div class="queue-actions">
              <button class="btn-small secondary" onclick="app.completeQueue('${safeId(q.id)}')">เสร็จสิ้นงาน <i class="fa-solid fa-check"></i></button>
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

      // ⚠️ บิลที่มีแต่สินค้า (เครื่องดื่ม) รวมเวลาได้ 0 — หารด้วย 0 จะได้ NaN
      // แล้วแถบความคืบหน้าจะกลายเป็น width:"NaN%" และข้อความ "ให้บริการไปแล้ว 0/0 นาที"
      const hasDuration = Number.isFinite(duration) && duration > 0;
      const percent = hasDuration ? Math.min(100, Math.floor((minutesElapsed / duration) * 100)) : 100;

      const timeEl = document.getElementById(`time-elapsed-${qId}`);
      const progressEl = document.getElementById(`progress-bar-${qId}`);

      if (timeEl) {
        timeEl.innerText = hasDuration
          ? `ให้บริการไปแล้ว ${minutesElapsed}/${duration} นาที`
          : 'สินค้า — ส่งให้ลูกค้าได้เลย';
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
          <td>${Number(c.visitCount) || 0} ครั้ง</td>
          <td><span style="color: var(--accent-barber); font-weight:600;">${escapeHtml(c.tier || 'ทั่วไป (General)')}</span></td>
          <td>
            <div class="customer-actions">
              <button class="btn-small secondary" onclick="app.editCustomerNote('${safeId(c.id)}')"><i class="fa-solid fa-edit"></i> โน้ตย่อ</button>
              <button class="btn-small danger" onclick="app.deleteCustomer('${safeId(c.id)}')"><i class="fa-solid fa-trash"></i></button>
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
              <span class="title" style="font-weight: 600;">${escapeHtml(c.name)}${
                c.vat === true
                  ? ` <span style="font-size:0.68rem;padding:2px 8px;border-radius:99px;background:rgba(245,200,66,0.18);color:var(--accent-premium,#f5c842);font-weight:700;vertical-align:middle;">VAT</span>`
                  : ''
              }</span>
              <span class="desc">${count} บริการในหมวดนี้${c.vat === true && !this.vatEnabled ? ' · รอเปิดสวิตช์ VAT' : ''}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-small secondary" onclick="app.editCategory('${safeId(c.id)}')">แก้ไข</button>
            <button class="btn-small danger" onclick="app.deleteCategory('${safeId(c.id)}')">ลบ</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── หน้าตั้งค่า VAT ────────────────────────────────────────────────
  renderVatSettings() {
    const chk  = document.getElementById('vat-enabled');
    const rate = document.getElementById('vat-rate');
    const sum  = document.getElementById('vat-category-summary');
    if (chk)  chk.checked = !!this.vatEnabled;
    if (rate) rate.value = Number(this.vatRate) || 0;
    if (!sum) return;

    const cats = this.state.categories || [];
    const on  = cats.filter(c => c.vat === true);
    const off = cats.filter(c => c.vat !== true);
    if (!this.vatEnabled) {
      sum.innerHTML = `<div style="color:var(--text-muted);">ปิดอยู่ — ทุกบิลไม่มี VAT` +
        (on.length ? ` (ติ๊กหมวดไว้แล้ว ${on.length} หมวด รอเปิดสวิตช์)` : '') + `</div>`;
      return;
    }
    if (on.length === 0) {
      sum.innerHTML = `<div style="color:var(--color-danger,#f43f6a);">เปิดสวิตช์แล้วแต่ยังไม่ได้ติ๊กหมวดไหนเลย — บิลจะยังไม่มี VAT<br>
        <span style="color:var(--text-muted);">ไปที่หมวดหมู่การขาย → แก้ไข → ติ๊ก "เก็บ VAT จากหมวดนี้"</span></div>`;
      return;
    }
    sum.innerHTML =
      `<div style="margin-bottom:4px;"><b style="color:var(--accent-premium,#f5c842);">คิด ${Number(this.vatRate) || 0}%:</b> ${escapeHtml(on.map(c => c.name).join(' · '))}</div>` +
      (off.length ? `<div style="color:var(--text-muted);"><b>ไม่คิด:</b> ${escapeHtml(off.map(c => c.name).join(' · '))}</div>` : '');
  }

  async saveVatSettings() {
    if (this.currentRole !== 'owner') {
      this.showToast('เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่า VAT ได้', 'warning');
      return;
    }
    const chk  = document.getElementById('vat-enabled');
    const rate = document.getElementById('vat-rate');
    const raw  = parseFloat(rate ? rate.value : 7);
    // อัตราต้องอยู่ในช่วงที่เป็นไปได้ — พิมพ์ 700 แล้วบิลจะบวมแบบไม่มีใครทันสังเกต
    if (!Number.isFinite(raw) || raw < 0 || raw > 30) {
      this.showToast('อัตรา VAT ต้องอยู่ระหว่าง 0 ถึง 30 เปอร์เซ็นต์', 'warning');
      return;
    }
    // เก็บค่าเดิมไว้ก่อนแตะ — อัตรา VAT ผิดแปลว่ายอดที่ยื่นสรรพากรผิด
    const prevVat = { enabled: this.vatEnabled, rate: this.vatRate };
    this.vatEnabled = !!(chk && chk.checked);
    this.vatRate = Math.round(raw * 100) / 100;
    if (!await this.persistOrRollback('การตั้งค่า VAT', () => {
      this.vatEnabled = prevVat.enabled; this.vatRate = prevVat.rate;
    })) { this.renderVatSettings(); this.updateCartTotals(); return; }
    this.renderVatSettings();
    this.renderCategoryList();
    this.updateCartTotals(); // ตะกร้าที่ค้างอยู่ต้องเปลี่ยนยอดทันที
    this.showToast(this.vatEnabled
      ? `เปิดเก็บ VAT ${this.vatRate}% แล้ว — มีผลกับบิลใหม่เท่านั้น บิลเก่าไม่เปลี่ยน`
      : 'ปิดการเก็บ VAT แล้ว — บิลเก่าที่เคยเก็บ VAT ยังคงตัวเลขเดิมไว้', 'success', 5000);
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
    sel.innerHTML = (this.state.categories || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    if (cur && this.state.categories.some(c => c.id === cur)) sel.value = cur;
  }

  openCategoryModal(catId) {
    let vat = false;
    this.state.editingCategoryId = catId || null;
    const titleEl = document.getElementById('category-modal-title');
    const nameInput = document.getElementById('cat-name');
    const iconSel = document.getElementById('cat-icon');
    let selectedIcon = 'fa-tag', name = '';
    if (catId) {
      const c = this.state.categories.find(x => x.id === catId);
      if (c) { name = c.name; selectedIcon = c.icon || 'fa-tag'; vat = c.vat === true; }
      if (titleEl) titleEl.innerText = 'แก้ไขหมวดหมู่';
    } else {
      if (titleEl) titleEl.innerText = 'เพิ่มหมวดหมู่ใหม่';
    }
    if (nameInput) nameInput.value = name;
    if (iconSel) iconSel.innerHTML = this.getCategoryIconOptions(selectedIcon);
    const vatChk = document.getElementById('cat-vat');
    if (vatChk) vatChk.checked = vat;
    this.openModal('modal-category');
  }

  editCategory(catId) { this.openCategoryModal(catId); }

  async addCategory() {
    const nameInput = document.getElementById('cat-name');
    const iconSel = document.getElementById('cat-icon');
    const name = (nameInput ? nameInput.value : '').trim();
    const icon = (iconSel ? iconSel.value : 'fa-tag') || 'fa-tag';
    const vatChk = document.getElementById('cat-vat');
    const vat = !!(vatChk && vatChk.checked);
    if (!name) { this.showToast('กรุณากรอกชื่อหมวดหมู่', 'warning'); if (nameInput) nameInput.focus(); return; }
    const dup = this.state.categories.find(c => c.name.trim() === name && c.id !== this.state.editingCategoryId);
    if (dup) { this.showToast('มีหมวดหมู่ชื่อนี้อยู่แล้ว', 'warning'); return; }
    const prevCats = this.cloneForRollback(this.state.categories);
    if (this.state.editingCategoryId) {
      const c = this.state.categories.find(x => x.id === this.state.editingCategoryId);
      if (c) { c.name = name; c.icon = icon; c.vat = vat; }
      // ห้ามล้างตรงนี้ (เหตุผลเดียวกับพนักงาน/บริการ)
    } else {
      this.state.categories.push({ id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, name, icon, vat });
    }
    if (!await this.persistOrRollback('หมวดหมู่', () => { this.state.categories = prevCats; })) {
      this.renderCategoryList(); this.renderPos(); this.renderSettingsLists(); return;   // คง editingCategoryId ไว้
    }
    this.state.editingCategoryId = null;   // ล้างเมื่อบันทึกสำเร็จแล้วเท่านั้น
    this.closeModal('modal-category');
    this.renderCategoryList();
    this.renderVatSettings();
    this.renderPos();
    this.renderSettingsLists();
    this.updateCartTotals(); // ตะกร้าที่ค้างอยู่ต้องคิด VAT ใหม่ทันทีตามหมวดที่เพิ่งแก้
    this.showToast('บันทึกหมวดหมู่เรียบร้อยแล้ว', 'success');
  }

  deleteCategory(catId) {
    const inUse = this.state.services.filter(s => s.category === catId).length;
    if (inUse > 0) {
      this.showToast(`ลบไม่ได้ — ยังมี ${inUse} บริการในหมวดนี้ กรุณาย้ายหรือลบบริการในหมวดนี้ก่อน`, 'warning');
      return;
    }
    this.showConfirm('ยืนยันลบหมวดหมู่นี้ใช่หรือไม่?', async () => {
      const prevCats = this.state.categories;
      const prevSel = this.state.selectedCategory;
      this.state.categories = this.state.categories.filter(c => c.id !== catId);
      if (this.state.selectedCategory === catId) this.state.selectedCategory = 'all';
      if (!await this.persistOrRollback('การลบหมวดหมู่', () => {
        this.state.categories = prevCats; this.state.selectedCategory = prevSel;
      })) { this.renderCategoryList(); this.renderPos(); this.renderSettingsLists(); return; }
      this.renderCategoryList();
      this.renderPos();
      this.renderSettingsLists();
      this.showToast('ลบหมวดหมู่แล้ว', 'info');
    });
  }

  renderSettingsLists() {
    this.renderCategoryList();
    this.renderVatSettings();
    // 1. รายชื่อพนักงาน
    const staffList = document.getElementById('settings-staff-list');
    staffList.innerHTML = this.state.staff.map(s => `
      <div class="settings-list-item">
        <div class="settings-list-item-info">
          <span class="title">${escapeHtml(s.name)}</span>
          <span class="desc">${escapeHtml(s.role)} • ${this.roleLabel(s.accessLevel || 'staff')}${s.pin ? '' : ' (ยังไม่ตั้ง PIN)'} • ${s.active ? 'พร้อมทำงาน' : 'พักร้อน'}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-small secondary" onclick="app.editStaff('${safeId(s.id)}')">แก้ไข</button>
          <button class="btn-small danger" onclick="app.deleteStaff('${safeId(s.id)}')">ลบ</button>
        </div>
      </div>
    `).join('');

    // 2. รายการบริการ
    const servicesList = document.getElementById('settings-services-list');
    servicesList.innerHTML = this.state.services.map(s => {
      const cat = this.state.categories.find(c => c.id === s.category);
      const typeText = cat ? cat.name : (s.category || 'ไม่ระบุ');
      let iconClass = safeIcon(cat && cat.icon, 'fa-scissors');
      let badgeColorClass = s.category === 'massage' ? 'teal' : (s.category === 'premium' ? 'rose' : 'gold');
      return `
        <div class="settings-list-item">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="kpi-icon ${badgeColorClass}" style="width: 42px; height: 42px; border-radius: var(--border-radius-md); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
              <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="settings-list-item-info">
              <span class="title" style="font-weight: 600;">${escapeHtml(s.name)}</span>
              <span class="desc">หมวดหมู่: ${escapeHtml(typeText)} • ฿${Number(s.price) || 0} • ${(Number(s.duration) || 0) > 0 ? `${Number(s.duration)} นาที` : 'สินค้า'} • ค่าคอม ${Number(s.commission) || 0}${s.commissionType === 'fixed' ? '฿' : '%'}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-small secondary" onclick="app.editService('${safeId(s.id)}')">แก้ไข</button>
            <button class="btn-small danger" onclick="app.deleteService('${safeId(s.id)}')">ลบ</button>
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
    const sheetsApiTokenInput = document.getElementById('shop-sheets-api-token');
    if (sheetsApiTokenInput) {
      sheetsApiTokenInput.value = this.googleSheetsApiToken || '';
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

    // แสดงปุ่ม "ย้อนกลับไปก่อนกู้ข้อมูล" ถ้ามีสำเนาเก็บไว้ (อ่านจากฐานข้อมูล จึงเป็น async)
    this.refreshPreRestoreUI();
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

    // ── ด่านที่สอง: ตัวเลขที่คิดเงินไม่ได้ ห้ามเข้าตะกร้า ────────────────────
    // ด่านแรกอยู่ตอนนำเข้าไฟล์ แต่ห้ามให้การคิดเงินขึ้นกับความสะอาดของข้อมูลต้นทางชั้นเดียว
    // ถ้าราคาหลุดมาเป็นข้อความหรือ NaN ต้องหยุดที่นี่ ดีกว่าออกบิลผิดแล้วรู้ทีหลัง
    const svcPrice = this.toFiniteNumber(service.price);
    if (svcPrice === null || svcPrice < 0) {
      this.showToast(`บริการ "${service.name}" มีราคาที่ใช้คิดเงินไม่ได้ — แก้ราคาในหน้าตั้งค่าก่อนขาย`, 'error', 6000);
      console.error('[Guard] ราคาบริการใช้ไม่ได้:', service.id, service.price);
      return;
    }
    const svcDuration   = this.toFiniteNumber(service.duration);
    const svcCommission = this.toFiniteNumber(service.commission);

    // หาพนักงานคนแรกที่มีอยู่เป็นพนักงานตั้งต้นให้ในตะกร้า
    const defaultStaff = this.state.staff[0];

    this.state.cart.push({
      uniqueCartId: Date.now() + Math.random().toString(36).substr(2, 5), // รหัสจำลองไอเท็มในคาร์ท
      id: service.id,
      name: service.name,
      price: svcPrice,
      duration: (svcDuration === null || svcDuration < 0) ? 0 : svcDuration,
      commission: (svcCommission === null || svcCommission < 0) ? 0 : svcCommission,
      commissionType: service.commissionType === 'fixed' ? 'fixed' : 'percent',
      category: service.category || '',   // ใช้ตัดสินว่าต้องบวก VAT ไหม
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
      const bq0 = document.getElementById('btn-print-quote');
      if (bq0) bq0.disabled = true;
    } else {
      document.getElementById('btn-checkout').disabled = false;
      const bq1 = document.getElementById('btn-print-quote');
      if (bq1) bq1.disabled = false;

      // สร้างตัวเลือกรายชื่อพนักงานสำหรับใส่ในกล่อง Dropdown ของตะกร้าสินค้า
      const staffOptions = this.state.staff.map(st => 
        `<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`
      ).join('');

      cartList.innerHTML = this.state.cart.map(item => `
        <div class="cart-item">
          <div class="cart-item-header">
            <div class="cart-item-info">
              <div class="cart-item-name">${escapeHtml(item.name)}</div>
              <div class="cart-item-price">฿${Number(item.price) || 0}</div>
            </div>
            <button class="remove-item-btn" onclick="app.removeFromCart('${safeId(item.uniqueCartId)}')">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="cart-item-staff">
            <i class="fa-solid fa-user-circle"></i> ผู้ให้บริการ: 
            <select onchange="app.changeItemStaff('${safeId(item.uniqueCartId)}', this.value)">
              ${this.state.staff.map(st => `
                <option value="${escapeHtml(st.id)}" ${st.id === item.staffId ? 'selected' : ''}>${escapeHtml(st.name)}</option>
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
    // Number() ตรงนี้เป็นตาข่ายชั้นสุดท้าย — ถ้าราคาหลุดมาเป็นข้อความ การ "บวก" จะกลายเป็นการต่อสตริง
    // (0 + "300" + "300" = "0300300") แล้วยอดบิลจะผิดมหาศาลโดยไม่มี error ให้เห็นเลยสักตัว
    return this.state.cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  }

  // อ่านส่วนลดจากช่องกรอกแบบปลอดภัย — clamp ให้อยู่ใน [0, subtotal]
  // (input min="0" กันแค่ปุ่ม spinner — พิมพ์ค่าติดลบเองได้ ถ้าไม่ clamp ยอดจะบวมเกินจริง)
  getCartDiscount(subtotal) {
    const discountInput = document.getElementById('cart-discount');
    const raw = parseFloat(discountInput ? discountInput.value : 0) || 0;
    return Math.min(Math.max(0, raw), subtotal);
  }

  // ยอดที่ลูกค้าต้องจ่ายจริง = ก่อน VAT + VAT + ปัดเศษขึ้นเต็มบาท
  // ทุกที่ที่ถามว่า "ต้องเก็บเงินเท่าไร" (ช่องรับเงิน, QR, เงินทอน, บิล) ใช้ค่านี้ตัวเดียว
  getCartTotal() {
    return this.getCartBillTotals().total;
  }

  // ── หมวดนี้ต้องบวก VAT ไหม ──────────────────────────────────────────
  // หมวดที่ไม่มีฟิลด์ vat (ข้อมูลเก่า) หรือหาหมวดไม่เจอ = ไม่คิด VAT
  // ตั้งใจให้ "ไม่คิด" เป็นค่าตั้งต้น — เก็บภาษีเกินจากลูกค้าแก้ยากกว่าเก็บขาด
  isVatableCategory(categoryId) {
    if (!this.vatEnabled) return false;
    const cat = (this.state.categories || []).find(c => c.id === categoryId);
    return !!(cat && cat.vat === true);
  }

  // แตกตะกร้าเป็นบรรทัด พร้อมราคาหลังส่วนลดและธง VAT
  // ใช้ตัวเดียวกันทั้งตอนแสดงผลในตะกร้าและตอนจบบิล — ตัวเลขจึงตรงกันเป๊ะเสมอ
  getCartLines() {
    const subtotal = this.getCartSubtotal();
    const discount = this.getCartDiscount(subtotal);
    const nets = this.distributeDiscount(this.state.cart.map(i => i.price), subtotal, discount);
    return this.state.cart.map((item, i) => ({
      netPrice: nets[i],
      vatable: this.isVatableCategory(item.category)
    }));
  }

  // ── คำนวณยอดทั้งบิล ────────────────────────────────────────────────
  // คิดเป็น "สตางค์จำนวนเต็ม" ทั้งหมด ไม่ใช้ทศนิยมเลย
  // เหตุผล: 385.60 ในคอมพิวเตอร์อาจเป็น 385.60000000000002 ซึ่งปัดขึ้นได้ 386 (ถูก)
  // แต่ 386.00 ที่เพี้ยนเป็น 386.00000000000006 จะถูกปัดเป็น 387 — ลูกค้าโดนเก็บเกิน 1 บาทแบบสุ่ม
  // หาสาเหตุแทบไม่ได้เพราะเกิดเฉพาะบางยอด
  computeBillTotals(lines) {
    return this.computeTotalsAtRate(lines, this.vatEnabled ? (Number(this.vatRate) || 0) : 0);
  }

  // เวอร์ชันที่ระบุอัตราเอง — ใช้ตอนแก้บิลย้อนหลัง ต้องคิดด้วย "อัตราของบิลใบนั้น"
  // ไม่ใช่อัตราปัจจุบัน ไม่งั้นแก้ชื่อพนักงานในบิลเก่าแล้วยอดเงินเปลี่ยนตามไปด้วย
  computeTotalsAtRate(lines, rateInput) {
    const rate = Number(rateInput) || 0;
    let vatableSat = 0, nonVatSat = 0;
    (lines || []).forEach(l => {
      const sat = Math.round((Number(l.netPrice) || 0) * 100);
      if (l.vatable && rate > 0) vatableSat += sat; else nonVatSat += sat;
    });
    const vatSat = Math.round(vatableSat * rate / 100);
    const rawSat = nonVatSat + vatableSat + vatSat;
    // ปัดขึ้นเต็มบาทเสมอ — ใช้เลขจำนวนเต็มล้วน ไม่มีการหารทศนิยม
    const remainder = rawSat % 100;
    const grandSat = remainder === 0 ? rawSat : rawSat + (100 - remainder);
    return {
      vatRate:     rate,
      nonVatBase:  nonVatSat / 100,
      vatableBase: vatableSat / 100,
      vatAmount:   vatSat / 100,
      rounding:    (grandSat - rawSat) / 100,
      total:       grandSat / 100
    };
  }

  getCartBillTotals() {
    return this.computeBillTotals(this.getCartLines());
  }

  // กระจายส่วนลดตามสัดส่วนราคา + เกลี่ยเศษสตางค์ (largest remainder)
  // การันตี: ผลรวม netPrice = subtotal - discount เป๊ะ (ไม่มีเศษ ±0.01 หลุดไปรายงาน/ค่าคอม)
  //
  // ⚠️ เดิมปัดทีละบรรทัดแล้วยัดเศษที่เหลือลง "บรรทัดราคาสูงสุด" บรรทัดเดียว
  // ถ้าเศษที่ต้องหักมากกว่าค่าในบรรทัดนั้น Math.max(0, …) ตัดส่วนที่เหลือทิ้งเงียบ ๆ
  // เคสจริง: 5 รายการ × 100 ส่วนลด 499.97 → ควรเหลือ 0.03 แต่ได้ [0,.01,.01,.01,.01] = 0.04
  // แล้วบิลใบนั้น "ราคารวม−ส่วนลด ≠ ผลรวมบรรทัด" → GAS ปฏิเสธ INVALID_AMOUNT และค้าง pending ตลอดไป
  //
  // ตอนนี้แบ่ง "ยอดที่เหลือ" เป็นสตางค์จำนวนเต็มด้วย allocateSatang ตัวเดียวกับที่แบ่ง VAT/ค่าคอม
  // largest-remainder การันตีผลรวม = ยอดที่ตั้งไว้เสมอ ไม่ว่าน้ำหนักจะลงตัวหรือไม่
  distributeDiscount(prices, subtotal, discount) {
    const list = Array.isArray(prices) ? prices : [];
    const totalSat = Math.round(Math.max(0, (Number(subtotal) || 0) - (Number(discount) || 0)) * 100);
    const weights = list.map(p => Math.max(0, Number(p) || 0));
    return this.allocateSatang(totalSat, weights).map(sat => sat / 100);
  }

  updateCartTotals() {
    const subtotal = this.getCartSubtotal();
    const t = this.getCartBillTotals();
    const money = v => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('summary-subtotal').innerText = `฿${subtotal.toLocaleString('th-TH')}`;
    document.getElementById('summary-total').innerText = `฿${t.total.toLocaleString('th-TH')}`;

    // แถว VAT / ปัดเศษ — ซ่อนเมื่อไม่มีค่า ไม่ให้บิลบริการล้วนรกด้วยเลข 0
    const vatRow = document.getElementById('summary-vat-row');
    const vatLbl = document.getElementById('summary-vat-label');
    const vatVal = document.getElementById('summary-vat');
    if (vatRow) {
      if (t.vatAmount > 0) {
        vatRow.style.display = '';
        if (vatLbl) vatLbl.innerText = `VAT ${t.vatRate}% (จาก ฿${money(t.vatableBase)})`;
        if (vatVal) vatVal.innerText = `฿${money(t.vatAmount)}`;
      } else {
        vatRow.style.display = 'none';
      }
    }
    const rndRow = document.getElementById('summary-rounding-row');
    const rndVal = document.getElementById('summary-rounding');
    if (rndRow) {
      if (t.rounding > 0) {
        rndRow.style.display = '';
        if (rndVal) rndVal.innerText = `฿${money(t.rounding)}`;
      } else {
        rndRow.style.display = 'none';
      }
    }
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
      qrBox.innerHTML = `<div style="padding:24px 12px;text-align:center;color:#b91c1c;font-size:0.8rem;line-height:1.5;">⚠️ สร้าง QR ไม่สำเร็จ<br>${escapeHtml(err && err.message)}<br><span style="color:#64748b;">ลองรีเฟรชแอป หรือเช็คเลขพร้อมเพย์ในตั้งค่า</span></div>`;
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
      // ⚠️ ล็อกตัวเลข VAT ณ วินาทีที่จบบิล แล้วเก็บติดไปกับบิลเลย
      // ห้ามคำนวณสดจากค่าตั้งค่าตอนแสดงผล ไม่งั้นวันที่เปลี่ยนอัตรา VAT หรือปิดสวิตช์
      // บิลเก่าทั้งหมดจะเปลี่ยนตัวเลขตามไปด้วย และยอดที่ยื่นสรรพากรไปแล้วจะไม่ตรงกับระบบ
      const vatCalc = this.getCartBillTotals();
      const total = vatCalc.total;

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
      let updatedCustomer = null;
      let customerBeforeCheckout = null;
      if (selectedCustId === 'google') {
        customerName = 'ลูกค้าทั่วไป (Google)';
      } else if (selectedCustId === 'returning') {
        customerName = 'ลูกค้าเก่า';
      } else if (selectedCustId) {
        const customer = this.state.customers.find(c => c.id === selectedCustId);
        if (customer) {
          customerName = customer.name;
          updatedCustomer = customer;
          customerBeforeCheckout = {
            visitCount: customer.visitCount,
            tier: customer.tier
          };
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
          const isVatable = this.isVatableCategory(item.category);
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
            // ค่าคอมคิดจาก netPrice ซึ่งเป็นยอด "ก่อน VAT" เสมอ
            // ถ้าเผลอคิดจากยอดรวม VAT เท่ากับจ่ายคอมจากเงินภาษีที่ต้องส่งสรรพากร
            commissionAmount: commissionAmount,
            category: item.category || '',
            vatable: isVatable
          };
          });
        })(),
        subtotal: subtotal,
        discount: discount,
        vatRate:     vatCalc.vatRate,      // อัตราที่ใช้จริงตอนออกบิลใบนี้
        nonVatBase:  vatCalc.nonVatBase,   // ยอดที่ไม่คิด VAT
        vatableBase: vatCalc.vatableBase,  // ฐานภาษี
        vatAmount:   vatCalc.vatAmount,    // ภาษีขาย — ต้องนำส่งสรรพากร
        rounding:    vatCalc.rounding,     // เงินปัดเศษ — รายได้ร้าน ไม่ใช่ภาษี
        total: total,                      // = nonVatBase + vatableBase + vatAmount + rounding
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

      // ต้องบันทึกยอดขาย/คิว/จำนวนครั้งลูกค้าในเครื่องให้สำเร็จก่อน
      // ถ้า IndexedDB มีปัญหา ห้ามแสดงใบเสร็จหรือส่งขึ้นคลาวด์ เพราะผู้ใช้จะเข้าใจว่าบิลถูกเก็บแล้ว
      try {
        await this.saveStateOrThrow('รายการขาย');
      } catch (saveErr) {
        this.state.transactions = this.state.transactions.filter(tx => tx.id !== txId);
        this.state.queue = this.state.queue.filter(item => item.id !== newQueueItem.id);
        if (updatedCustomer && customerBeforeCheckout) {
          updatedCustomer.visitCount = customerBeforeCheckout.visitCount;
          updatedCustomer.tier = customerBeforeCheckout.tier;
        }
        this.clearDateKeyCache();
        throw saveErr;
      }
      
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

  // ==================== ใบแจ้งยอดก่อนชำระเงิน ====================
  // เอกสารนี้พิมพ์ตอนยังไม่ได้รับเงิน จึงไม่ใส่เลขที่บิล ไม่มีช่องเงินรับ/เงินทอน
  // และไม่บันทึกอะไรลงระบบเลย — พิมพ์ซ้ำกี่ครั้งก็ไม่มีผลข้างเคียง
  // (เจ้าของร้านเลือกไม่ใส่ข้อความคาดหัวว่า "ไม่ใช่ใบเสร็จ" — ตัวแยกที่เหลือคือเลขที่บิลกับช่องเงินรับ)
  showQuotePreview() {
    if (!this.state.cart || this.state.cart.length === 0) {
      this.showToast('ยังไม่มีรายการในตะกร้า', 'warning');
      return;
    }
    const container = document.getElementById('quote-preview');
    if (!container) return;

    const money = v => (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const subtotal = this.getCartSubtotal();
    const discount = this.getCartDiscount(subtotal);
    // ใช้ตัวคำนวณตัวเดียวกับตอนจบบิลเป๊ะ ๆ — ยอดบนกระดาษกับยอดที่เก็บจริงต้องไม่มีทางต่างกัน
    const t = this.getCartBillTotals();
    const lines = this.getCartLines();
    const now = new Date();

    container.innerHTML = `
      <div class="receipt-container">
        <div class="receipt-header">
          <div class="receipt-shop-name">${escapeHtml(this.shopName || 'Erotica Barber & Massage')}</div>
          ${this.shopPhone ? `<div style="font-size:0.7rem;color:#555;">โทร. ${escapeHtml(this.shopPhone)}</div>` : ''}
        </div>

        <div class="receipt-row"><span>วันที่:</span><span>${now.toLocaleString('th-TH')}</span></div>

        <div class="receipt-divider"></div>

        <div class="receipt-items">
          ${this.state.cart.map((item, i) => `
            <div class="receipt-item-row">
              <div class="receipt-item-details">
                <span>${escapeHtml(item.name)}${lines[i] && lines[i].vatable ? ' *' : ''}</span>
                <span>฿${money(item.price)}</span>
              </div>
              <div class="receipt-item-staff">ผู้ดูแล: ${escapeHtml(item.staffName || 'ไม่ระบุ')}</div>
            </div>`).join('')}
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-row"><span>รวมค่าบริการ:</span><span>฿${money(subtotal)}</span></div>
        <div class="receipt-row"><span>ส่วนลด:</span><span>-฿${money(discount)}</span></div>
        ${t.vatAmount > 0 ? `
        <div class="receipt-divider"></div>
        ${t.nonVatBase > 0 ? `<div class="receipt-row"><span>ยอดไม่คิด VAT:</span><span>฿${money(t.nonVatBase)}</span></div>` : ''}
        <div class="receipt-row"><span>ยอดคิด VAT (*):</span><span>฿${money(t.vatableBase)}</span></div>
        <div class="receipt-row"><span>VAT ${Number(t.vatRate) || 0}%:</span><span>฿${money(t.vatAmount)}</span></div>` : ''}
        ${t.rounding > 0 ? `<div class="receipt-row"><span>ปัดเศษ:</span><span>฿${money(t.rounding)}</span></div>` : ''}

        <div class="receipt-divider"></div>

        <div class="receipt-row receipt-totals">
          <span>ยอดที่ต้องชำระ:</span>
          <span>฿${t.total.toLocaleString('th-TH')}</span>
        </div>

        <div class="receipt-footer" style="margin-top:14px;font-size:0.7rem;color:#555;text-align:center;line-height:1.6;">
          ${t.vatAmount > 0 ? '* รายการที่มีเครื่องหมายนี้คิด VAT<br>' : ''}
          ยอดนี้ใช้ได้ ณ เวลาที่พิมพ์ — หากมีการเพิ่ม/ลดรายการ ยอดจะเปลี่ยน
        </div>
      </div>`;

    this.openModal('modal-quote');
  }

  // ==================== RECEIPT RENDERING ====================
  
  showThermalReceipt(tx) {
    const container = document.getElementById('thermal-receipt-preview');
    const timeStr = new Date(tx.date).toLocaleString('th-TH');

    // บล็อก VAT — แสดงเฉพาะบิลที่มี VAT จริง
    // บิลเก่าที่ออกก่อนเปิดระบบ VAT ไม่มีฟิลด์พวกนี้ จะไม่ขึ้นบล็อกนี้เลย (ถูกต้อง — ตอนนั้นไม่ได้เก็บ)
    const money = v => (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const vatAmt = Number(tx.vatAmount) || 0;
    const rnd    = Number(tx.rounding) || 0;
    let vatBlock = '';
    if (vatAmt > 0 || rnd > 0) {
      vatBlock = '<div class="receipt-divider"></div>' +
        (Number(tx.nonVatBase) > 0 ? `
        <div class="receipt-row">
          <span>ยอดไม่คิด VAT:</span>
          <span>฿${money(tx.nonVatBase)}</span>
        </div>` : '') +
        (Number(tx.vatableBase) > 0 ? `
        <div class="receipt-row">
          <span>ยอดคิด VAT:</span>
          <span>฿${money(tx.vatableBase)}</span>
        </div>` : '') +
        (vatAmt > 0 ? `
        <div class="receipt-row">
          <span>VAT ${Number(tx.vatRate) || 0}%:</span>
          <span>฿${money(vatAmt)}</span>
        </div>` : '') +
        (rnd > 0 ? `
        <div class="receipt-row">
          <span>ปัดเศษ:</span>
          <span>฿${money(rnd)}</span>
        </div>` : '');
    }
    
    // ดึงคิวอาร์สำหรับโชว์ท้ายบิล
    container.innerHTML = `
      <div class="receipt-container">
        <div class="receipt-header">
          ${this.shopLogo ? `<img src="${escapeHtml(this.shopLogo)}" alt="logo" style="max-width:90px;max-height:90px;object-fit:contain;margin:0 auto 6px;display:block;">` : ''}
          <div class="receipt-shop-name">${escapeHtml(this.shopName || 'Erotica Barber & Massage')}</div>
          ${this.shopAddress ? `<div style="font-size: 0.7rem; color: #555;">${escapeHtml(this.shopAddress)}</div>` : ''}
          ${this.shopPhone ? `<div style="font-size: 0.7rem; color: #555;">โทร. ${escapeHtml(this.shopPhone)}</div>` : ''}
        </div>
        
        <div class="receipt-row">
          <span>เลขที่ใบเสร็จ:</span>
          <span class="receipt-billid">${escapeHtml(tx.id)}</span>
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
        ${vatBlock}
        <div class="receipt-divider"></div>
        
        <div class="receipt-row receipt-totals">
          <span>รวมทั้งสิ้น:</span>
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
      const prevStatus = queueItem.status, prevStart = queueItem.startTime;
      queueItem.status = 'serving';
      queueItem.startTime = Date.now();
      if (!await this.persistOrRollback('การเริ่มคิว', () => {
        queueItem.status = prevStatus; queueItem.startTime = prevStart;
      })) { this.renderQueueScreen(); return; }
      this.renderQueueScreen();
      this.renderDashboard();
    }
  }

  // ยกเลิกคิวงาน
  removeQueue(queueId) {
    this.showConfirm('คุณต้องการยกเลิกคิวงานนี้ใช่หรือไม่?', async () => {
      const prevQueue = this.state.queue;
      this.state.queue = this.state.queue.filter(q => q.id !== queueId);
      if (!await this.persistOrRollback('การยกเลิกคิว', () => { this.state.queue = prevQueue; })) {
        this.renderQueueScreen(); return;
      }
      this.renderQueueScreen();
      this.renderDashboard();
    });
  }

  // ทำคิวนี้เสร็จสิ้น
  async completeQueue(queueId) {
    const queueIndex = this.state.queue.findIndex(q => q.id === queueId);
    if (queueIndex > -1) {
      // เอาคิวออกจากคิวแสดงผลการทำงานสด
      const removed = this.state.queue.splice(queueIndex, 1);
      if (!await this.persistOrRollback('การปิดคิว', () => {
        this.state.queue.splice(queueIndex, 0, ...removed);
      })) { this.renderQueueScreen(); this.renderDashboard(); return; }
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
    if (!await this.persistOrRollback('ข้อมูลลูกค้า', () => {
      this.state.customers = this.state.customers.filter(c => c !== newCustomer);
    })) { this.renderCustomerTable(); return; }
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
          const prevNote = customer.note;
          customer.note = newNote;
          if (!await this.persistOrRollback('โน้ตลูกค้า', () => { customer.note = prevNote; })) {
            this.renderCustomerTable(); return;
          }
          this.renderCustomerTable();
        }
      });
    }
  }

  deleteCustomer(custId) {
    this.showConfirm('คุณต้องการลบรายชื่อลูกค้านี้ใช่หรือไม่? (ประวัติการสะสมยอดจะไม่ย้อนกลับ)', async () => {
      const prevCustomers = this.state.customers;
      this.state.customers = this.state.customers.filter(c => c.id !== custId);
      if (!await this.persistOrRollback('การลบลูกค้า', () => { this.state.customers = prevCustomers; })) {
        this.renderCustomerTable(); this.renderPos(); return;
      }
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

    // สแนปช็อตทั้งชุด — การแก้พนักงานแตะทั้งชื่อ บทบาท สิทธิ์ และ PIN พร้อมกัน
    const prevStaff = this.cloneForRollback(this.state.staff);
    if (this.state.editingStaffId) {
      const staffMember = this.state.staff.find(s => s.id === this.state.editingStaffId);
      if (staffMember) {
        staffMember.name = name;
        staffMember.role = roleSelect.value;
        staffMember.accessLevel = accessLevel;
        if (pinRaw) staffMember.pin = pinHash; // เปลี่ยน PIN เฉพาะเมื่อกรอกใหม่
      }
      // ห้ามล้างตรงนี้ — ถ้า save ล้มเหลวแล้วผู้ใช้กดซ้ำ จะกลายเป็นเพิ่มพนักงานใหม่แทนการแก้
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

    if (!await this.persistOrRollback('ข้อมูลพนักงาน', () => { this.state.staff = prevStaff; })) {
      this.renderSettingsLists(); this.renderPos(); return;   // คง editingStaffId ไว้ให้กดซ้ำได้
    }
    this.state.editingStaffId = null;   // ล้างเมื่อบันทึกลงเครื่องสำเร็จแล้วเท่านั้น
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
      const prevStaffList = this.state.staff;
      this.state.staff = this.state.staff.filter(s => s.id !== staffId);
      if (!await this.persistOrRollback('การลบพนักงาน', () => { this.state.staff = prevStaffList; })) {
        this.renderSettingsLists(); this.renderPos(); return;
      }
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
    // ระยะเวลา 0 = สินค้าที่ขายทันที (เครื่องดื่ม/ของทานเล่น) ไม่ใช่บริการที่ต้องจับเวลา
    // เดิมบังคับ > 0 ทำให้เพิ่มเครื่องดื่มเข้าระบบไม่ได้เลย ต้องใส่เวลาปลอมซึ่งไปโผล่ในหน้าคิวงาน
    if (isNaN(dur) || dur < 0)      { this.showToast('ระยะเวลาต้องไม่ติดลบ (ใส่ 0 ได้ถ้าเป็นสินค้าขายทันที)','warning'); durationInput.focus(); return; }

    const prevServices = this.cloneForRollback(this.state.services);
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
      // ห้ามล้างตรงนี้ (เหตุผลเดียวกับพนักงาน) — กดซ้ำหลัง save ล้มเหลวจะได้บริการซ้ำ
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

    if (!await this.persistOrRollback('ข้อมูลบริการ', () => { this.state.services = prevServices; })) {
      this.renderSettingsLists(); this.renderPos(); return;   // คง editingServiceId ไว้ให้กดซ้ำได้
    }
    this.state.editingServiceId = null;   // ล้างเมื่อบันทึกลงเครื่องสำเร็จแล้วเท่านั้น
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
      const prevSvcList = this.state.services;
      this.state.services = this.state.services.filter(s => s.id !== serviceId);
      if (!await this.persistOrRollback('การลบบริการ', () => { this.state.services = prevSvcList; })) {
        this.renderSettingsLists(); this.renderPos(); return;
      }
      this.renderSettingsLists();
      this.renderPos();
    });
  }

  // ==================== MODALS HELPERS ====================

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
    // ปิดหน้าต่างแก้ไขบิลเมื่อไหร่ = ทิ้งร่างที่ยังไม่ได้กดบันทึกทันที
    // (กดกากบาท/กดยกเลิก/void ก็ผ่านทางนี้ทั้งหมด)
    if (modalId === 'modal-edit-transaction') this._editTxDraft = null;
  }

  // ==================== GOOGLE SHEETS SYNC ====================

  // ─── รวมค่าใช้จ่ายของงวดหนึ่ง (วันทำการ หรือเดือนทำการ) ───────────────────
  // ⚠️ ยึด "เวลาที่จ่ายเงินออกจากลิ้นชักจริง" ของแต่ละรายการ — เกณฑ์เดียวกับบิลขายเป๊ะ ๆ
  //
  // เดิมยึด "เวลาปิดกะ" แล้วเหมาค่าใช้จ่ายทั้งกะไปเป็นของวันนั้นทั้งก้อน
  // กะปกติ 11:00 → ตี 3 ไม่มีปัญหาเพราะวันทำการเดียวกันหมด
  // แต่คืนไหนลากยาวปิด 07:00 (ข้ามเวลาตัดวัน 06:00) ค่าใช้จ่ายทั้งกะจะโดดไปเป็นของวันถัดไป
  // ทั้งที่บิลขายยังนับเป็นวันเดิม → กำไรสุทธิผิดทั้งสองวัน (วันหนึ่งกำไรเกิน อีกวันขาดทุนเทียม)
  //
  // รายการเก่าที่ไม่มีเวลา (ไฟล์สำรองที่ field หาย) ให้ยึดเวลาของกะแทน — ดีกว่าหายจากรายงานเงียบ ๆ
  //
  // หมายเหตุ: ตารางนับเงินปิดกะ (buildShiftCashSummary) ยังใช้ยอดรวมทั้งกะเหมือนเดิม
  // เพราะเงินก้อนนั้นออกจากลิ้นชักของ "กะนั้น" จริง — ตัวเลขสองที่จึงอาจต่างกันได้เฉพาะกะข้ามวัน
  collectExpenses(periodType, periodKey) {
    const keyOf = ts => periodType === 'month'
      ? this.getBusinessMonthKey(ts)
      : this.getBusinessISODate(ts);

    const out = [];
    const take = (list, fallbackTs) => {
      (Array.isArray(list) ? list : []).forEach(e => {
        if (!e || typeof e !== 'object') return;
        let k = keyOf(e.time);
        if (!k && fallbackTs != null) k = keyOf(fallbackTs); // รายการไม่มีเวลา → ใช้เวลาของกะ
        if (k && k === periodKey) out.push(e);
      });
    };

    const history = (this.state.shift && Array.isArray(this.state.shift.history)) ? this.state.shift.history : [];
    history.forEach(sh => take(sh.expenses, sh.startTime || sh.endTime));

    // ต้องรวมกะที่ยังเปิดอยู่ด้วย ไม่งั้นสรุปที่ส่งกลางกะ (กดส่งเอง / refresh หลัง void หรือแก้บิล)
    // จะโชว์กำไรสูงเกินจริงจนกว่าจะปิดกะ
    if (this.state.shift && this.state.shift.active) {
      take(this.state.shift.expenses, this.state.shift.startTime);
    }
    return out;
  }

  // ทางลัดสำหรับ "วันทำการ" — ใช้กันแพร่หลายในโค้ดเดิม
  getExpensesForDate(dateKey) {
    return this.collectExpenses('day', dateKey);
  }

  // ─── กะที่ปิดแล้วของงวดหนึ่งๆ ────────────────────────────────────────────
  // ⚠️ ยึด "เวลาเปิดกะ" ไม่ใช่เวลาปิด — กะหนึ่งคือ "คืนของวันที่เปิดร้าน" เสมอ
  //
  // ทำไมไม่ใช้เวลาปิด: ร้านเปิด 11:00 ปิดตี 3 ปกติแล้วได้วันเดียวกันทั้งคู่
  // แต่คืนไหนปิดช้าเลย 06:00 (เวลาตัดวัน) เวลาปิดจะข้ามไปเป็นวันถัดไป
  // แถวกะเลยไปโผล่ในสรุปวันที่ไม่มีบิลขายสักใบ ส่วนวันที่ขายจริงกลับไม่มีแถวกะ
  // คืนสิ้นเดือนที่ปิดสายยิ่งหนัก — กะกระโดดข้ามไปอยู่สรุปเดือนถัดไปทั้งที่ยอดขายอยู่เดือนเดิม
  // เวลาเปิดร้านอยู่ช่วง 11:00 เสมอ จึงไม่มีทางคาบเกี่ยวเวลาตัดวัน = จัดกลุ่มได้นิ่งกว่า
  //
  // ใช้เกณฑ์นี้แล้วทั้ง 3 บล็อกในสรุปวัน (บิลขาย / ค่าใช้จ่าย / ตารางนับเงิน) ตรงกันหมด
  // กะที่ยังเปิดอยู่ไม่นับ — ยังไม่มีการนับเงินปิดกะ จึงยังไม่มีตัวเลขขาด/เกิน
  getClosedShiftsForPeriod(periodType, periodKey) {
    const history = (this.state.shift && Array.isArray(this.state.shift.history)) ? this.state.shift.history : [];
    return history.filter(sh => {
      const ts = sh.startTime || sh.endTime;
      if (!ts) return false;
      return periodType === 'month'
        ? this.getBusinessMonthKey(ts) === periodKey
        : this.getBusinessISODate(ts) === periodKey;
    });
  }

  // ─── สรุปการนับเงินสดปิดกะของงวด (ส่งขึ้นชีต) ─────────────────────────
  buildShiftCashSummary(periodType, periodKey) {
    const shifts = this.getClosedShiftsForPeriod(periodType, periodKey)
      .slice()
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    const rows = shifts.map(sh => ({
      startTime:  sh.startTime || null,
      endTime:    sh.endTime || null,
      closedBy:   sh.closedBy || '',
      startCash:  num(sh.startCash),
      cashSales:  num(sh.cashSales),
      expenses:   num(sh.expensesTotal),
      // กะเก่าที่บันทึกก่อนมีฟิลด์ expectedCash — คำนวณย้อนให้ ไม่ปล่อยเป็น 0 จนดูเหมือนเงินหายทั้งกะ
      expected:   (typeof sh.expectedCash === 'number' && isFinite(sh.expectedCash))
                    ? sh.expectedCash
                    : num(sh.startCash) + num(sh.cashSales) - num(sh.expensesTotal),
      counted:    num(sh.countedCash),
      difference: num(sh.difference)
    }));
    return {
      shiftCount:   rows.length,
      cashVariance: rows.reduce((s, r) => s + r.difference, 0),
      shifts:       rows
    };
  }

  // ─── สรุป VAT ของงวด — บวกจากตัวเลขที่ล็อกไว้ในบิลแต่ละใบ ──────────────
  // การันตี: nonVatBase + vatableBase + vatAmount + rounding = totalRevenue เสมอ
  // ถ้าวันไหนบวกไม่ลงตัว แปลว่ามีบั๊ก — ใช้เป็นตัวตรวจสอบตัวเองได้
  buildVatSummary(transactions) {
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    const r2  = v => Math.round(v * 100) / 100;
    const sat = v => Math.round(num(v) * 100);   // บาท → สตางค์จำนวนเต็ม (กันเศษทศนิยมสะสม)

    let nonVat = 0, base = 0, vat = 0, rnd = 0;
    const rates = new Set();
    const byKey = {};   // "หมวด||อัตรา" → { cat, rate, baseSat, vatSat }

    (transactions || []).forEach(tx => {
      const txVat = num(tx.vatAmount);
      // บิลเก่าที่ออกก่อนมีระบบ VAT ไม่มีฟิลด์พวกนี้เลย → ทั้งใบนับเป็น "ไม่คิด VAT"
      // ซึ่งเป็นความจริง ไม่ใช่การเดา
      if (!tx.vatAmount && !tx.vatableBase && !tx.rounding) {
        nonVat += num(tx.total);
        return;
      }
      nonVat += num(tx.nonVatBase);
      base   += num(tx.vatableBase);
      vat    += txVat;
      rnd    += num(tx.rounding);

      const txRate = num(tx.vatRate);
      if (txRate > 0) rates.add(txRate);

      // ── เกลี่ยภาษีของบิล "ใบนี้" ลงหมวดของมันเอง ────────────────────────
      // ⚠️ เดิมโค้ดรวมฐานของทุกบิลเข้าด้วยกันก่อน แล้วค่อยคูณด้วย "อัตราของบิลใบสุดท้าย"
      // งวดที่มีสองอัตรา (เช่นวันที่กฎหมายเปลี่ยนอัตรา) จะได้ตัวเลขที่ไม่ใช่ภาษีที่เก็บจริง
      // และต่อให้อัตราเดียว ผลรวมรายหมวดก็ไม่เท่ากับ VAT ของบิล เพราะบิลปัดเศษมาแล้วคนละชั้น
      //
      // วิธีใหม่: เอา VAT ที่ปัดแล้วของบิลใบนั้น มาแบ่งตามสัดส่วนฐานของแต่ละหมวด
      // ด้วยสตางค์จำนวนเต็ม + วิธีเศษมากได้ก่อน (largest remainder)
      // การันตี: ผลรวม VAT รายหมวด = ผลรวม VAT จากบิล เป๊ะเสมอ ไม่ว่ามีกี่อัตรา
      const billVatSat  = sat(txVat);
      const billBaseSat = sat(tx.vatableBase);
      if (billVatSat <= 0 && billBaseSat <= 0) return;

      const parts = [];
      (tx.details || []).forEach(d => {
        if (!d || !d.vatable) return;
        const w = sat(d.netPrice);
        if (w <= 0) return;
        parts.push({ cat: d.category || 'ไม่ระบุหมวด', w });
      });
      // บิลเก่าที่ไม่มีรายการย่อย แต่มี VAT — ไม่รู้ว่ามาจากหมวดไหนจริง ๆ
      // ต้องกองไว้ที่ "ไม่ระบุหมวด" ไม่ใช่ทิ้งไป ไม่งั้นผลรวมรายหมวดจะน้อยกว่าภาษีที่เก็บจริง
      if (!parts.length) parts.push({ cat: 'ไม่ระบุหมวด', w: billBaseSat || billVatSat });

      const weights  = parts.map(p => p.w);
      const vatAlloc  = this.allocateSatang(billVatSat,  weights);
      const baseAlloc = this.allocateSatang(billBaseSat, weights);

      parts.forEach((p, idx) => {
        const key = p.cat + '||' + txRate;
        if (!byKey[key]) byKey[key] = { cat: p.cat, rate: txRate, baseSat: 0, vatSat: 0 };
        byKey[key].baseSat += baseAlloc[idx];
        byKey[key].vatSat  += vatAlloc[idx];
      });
    });

    const catName = id => {
      const c = (this.state.categories || []).find(x => x.id === id);
      return c ? c.name : id;
    };
    // หนึ่งแถว = หนึ่ง (หมวด × อัตรา) — หมวดที่เจอสองอัตราในงวดเดียวจะได้สองแถว
    // ซึ่งเป็นสิ่งที่ต้องใช้ตอนยื่นภาษีจริง ไม่ใช่ยุบเป็นแถวเดียวแล้วโชว์อัตราเดียว
    const categories = Object.keys(byKey).map(k => {
      const e = byKey[k];
      return { name: catName(e.cat), rate: e.rate, base: e.baseSat / 100, vat: e.vatSat / 100 };
    }).sort((a, b) => (b.base - a.base) || (b.rate - a.rate));

    return {
      nonVatBase:  r2(nonVat),
      vatableBase: r2(base),
      vatAmount:   r2(vat),
      rounding:    r2(rnd),
      // อัตราระดับงวด: บอกได้เฉพาะตอนที่ทั้งงวดใช้อัตราเดียว
      // งวดที่มีหลายอัตราส่ง 0 ไป แล้วให้ชีตอ่านอัตราจากแต่ละแถวแทน (c.rate)
      vatRate:     rates.size === 1 ? [...rates][0] : 0,
      categories:  categories
    };
  }

  // ── แบ่งจำนวนเต็ม (สตางค์) ตามสัดส่วน โดยผลรวมต้องเท่าของเดิมเป๊ะ ──────────
  // ปัดเศษทีละก้อนแล้วเอามาบวกกันจะเกิน/ขาดได้เสมอ วิธีนี้ปัดลงก่อนทุกก้อน
  // แล้วแจกเศษที่เหลือทีละสตางค์ให้ก้อนที่เศษมากที่สุดก่อน (largest remainder)
  allocateSatang(totalSat, weights) {
    const n = weights.length;
    const out = new Array(n).fill(0);
    // ชื่อฟังก์ชันบอกว่ารับ "สตางค์จำนวนเต็ม" — ปัดให้ชัดเจนตรงนี้ กันคนเรียกส่งทศนิยมเข้ามา
    totalSat = Math.round(totalSat);
    if (!n || !(totalSat > 0)) return out;
    // น้ำหนักติดลบ/ไม่ใช่ตัวเลข ให้นับเป็น 0 — ไม่งั้นจะได้ส่วนแบ่งติดลบออกมา
    // ซึ่งผลรวมยังถูกแต่ตัวเลขในตารางกลายเป็น "ภาษีขาย -50 บาท" ที่อธิบายกับใครไม่ได้
    const w = weights.map(x => (typeof x === 'number' && isFinite(x) && x > 0) ? x : 0);
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum <= 0) { out[0] = totalSat; return out; }   // ไม่มีน้ำหนักให้แบ่ง — กองไว้ก้อนแรก

    const frac = [];
    let used = 0;
    for (let i = 0; i < n; i++) {
      const exact = totalSat * w[i] / sum;
      out[i] = Math.floor(exact);
      used += out[i];
      frac.push({ i, f: exact - out[i] });
    }
    frac.sort((a, b) => b.f - a.f || a.i - b.i);
    for (let k = 0, left = totalSat - used; left > 0; k++, left--) out[frac[k % n].i]++;
    return out;
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
        // ── บิลเก่าที่ไม่มีรายการย่อย ────────────────────────────────────
        // ⚠️ ห้ามเอา "ราคาบริการวันนี้" มาเป็นรายได้ย้อนหลังเด็ดขาด
        // ถ้าทำ พอขึ้นราคาวันนี้ รายงานของเดือนที่แล้วจะเปลี่ยนตามไปด้วย
        // ซึ่งเป็นตัวเลขที่ไม่เคยเกิดขึ้นจริงเลย และกระทบยอดกับรายได้รวมไม่ได้
        //
        // สิ่งเดียวที่รู้แน่คือ "ยอดของบิลใบนั้น" — เกลี่ยตามจำนวนรายการด้วยสตางค์จำนวนเต็ม
        // ผลรวมจึงเท่ากับยอดบิลเป๊ะเสมอ ไม่ว่าราคาปัจจุบันจะเปลี่ยนไปแค่ไหน
        const names = Array.isArray(tx.services) ? tx.services : [];
        if (names.length) {
          const billNetSat = Math.round(Math.max(0, (Number(tx.subtotal) || 0) - (Number(tx.discount) || 0)) * 100);
          const share = this.allocateSatang(billNetSat, names.map(() => 1));
          names.forEach((name, i) => {
            if (!svcMap[name]) svcMap[name] = { name, count: 0, revenue: 0 };
            svcMap[name].count++;
            svcMap[name].revenue += share[i] / 100;
          });
        }
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

    // 5. การนับเงินสดปิดกะ — recompute จาก shift.history ทุกครั้งที่ส่ง (idempotent: ชีตเขียนทับอยู่แล้ว)
    const cash = this.buildShiftCashSummary(periodType, periodKey);

    // 6. ภาษีมูลค่าเพิ่ม — อ่านจาก "ตัวเลขที่เก็บไว้ในบิล" เท่านั้น ไม่คำนวณใหม่จากค่าตั้งค่าปัจจุบัน
    // ถ้าคำนวณใหม่ พอกดส่งสรุปเดือนเก่าซ้ำ ระบบจะยัด VAT ลงบิลที่ไม่เคยเก็บ VAT
    // แล้วยอดที่เคยยื่นสรรพากรไปแล้วจะไม่ตรงกับชีต โดยไม่มีร่องรอยว่าเปลี่ยนตอนไหน
    const vat = this.buildVatSummary(transactions);

    const payload = this.buildCloudRequest(periodType === 'day' ? 'summary_day' : 'summary_month', {
      dateKey:         periodType === 'day'   ? periodKey : undefined,
      monthKey:        periodType === 'month' ? periodKey : undefined,
      totalRevenue, cashRevenue, qrRevenue, creditRevenue,
      billCount, avgBill, totalExpenses, netIncome,
      cashVariance:     cash.cashVariance,
      shiftCount:       cash.shiftCount,
      shiftCash:        cash.shifts,
      nonVatBase:       vat.nonVatBase,     // ยอดขายที่ไม่คิด VAT
      vatableBase:      vat.vatableBase,    // ฐานภาษี — ใช้กรอก ภ.พ.30
      vatAmount:        vat.vatAmount,      // ภาษีขาย — ใช้กรอก ภ.พ.30
      rounding:         vat.rounding,       // เงินปัดเศษ (ไม่ใช่ภาษี)
      vatRate:          vat.vatRate,
      vatCategories:    vat.categories,
      services:         Object.values(svcMap),
      expenses:         (expenses || []).map(e => ({ note: e.note, amount: e.amount })),
      staffCommissions: Object.values(staffMap).filter(st => st.count > 0),
      // รุ่นของชุดข้อมูล — ปลายทางใช้ปฏิเสธคำขอเก่าที่มาถึงทีหลัง (ดู checkSummaryStale_)
      // สร้างใหม่ทุกครั้งที่ประกอบ payload จริง คำขอที่ retry จึงใหม่กว่าคำขอที่ค้างอยู่เสมอ
      generatedAt:      this.nextSummaryStamp()
    });
    return payload;
  }

  // รุ่นของชุดข้อมูลสรุป — ต้องเพิ่มขึ้นเรื่อย ๆ เท่านั้น
  // ปกติใช้นาฬิกาเครื่อง แต่ถ้าเวลาเครื่องถูกตั้งย้อนหลัง (หรือ timezone เพี้ยน)
  // ชีตจะมีรุ่นใหม่กว่านาฬิกา แล้วสรุปจะส่งไม่ขึ้นตลอดไป — จึงยกพื้นตามที่ปลายทางบอกมา
  nextSummaryStamp() {
    // ต้องเพิ่มขึ้น "เข้ม" ทุกครั้ง — สองคำขอในมิลลิวินาทีเดียวกันจะได้เลขเท่ากัน
    // แล้วคำขอที่สองจะถูกปลายทางมองว่าเก่ากว่าและถูกปฏิเสธทั้งที่ข้อมูลใหม่กว่า
    const next = Math.max(
      Date.now(),
      (Number(this._summaryStampFloor) || 0),
      (Number(this._lastSummaryStamp) || 0) + 1
    );
    this._lastSummaryStamp = next;
    return next;
  }

  // ปลายทางปฏิเสธเพราะรุ่นเก่ากว่าที่ชีตมี — จำไว้แล้วรอบหน้าส่งรุ่นที่สูงกว่านั้น
  noteSummaryStampFloor(details) {
    const stored = Number(details && details.storedAt);
    if (isFinite(stored) && stored > 0) {
      this._summaryStampFloor = Math.max(Number(this._summaryStampFloor) || 0, stored + 1);
    }
  }

  // ─── ส่งสรุปรายวันไป Google Sheets ─────────────────────────────────────
  // ตัวส่งจริง — ไม่เข้าคิวเอง (ผู้เรียกเป็นคนจัดคิว) แต่ต้องมีด่านสิทธิ์เสมอ
  // ด่านอยู่ตรงนี้เพราะเป็นจุดที่ "คุยกับ Sheets" ทุกผู้เรียกจึงถูกครอบอัตโนมัติ
  async syncDailySummary(dateStr, transactions, expenses, isSilent = true) {
    if (!this.canWriteData(isSilent ? '' : 'ส่งสรุปขึ้นชีต')) return false;
    if (!this.isValidDateKey(dateStr)) {
      console.error('[Guard] ปฏิเสธการส่งสรุปรายวัน — คีย์วันที่ใช้ไม่ได้:', dateStr);
      if (!isSilent) this.showToast('วันที่ของข้อมูลใช้ไม่ได้ — ไม่ส่งขึ้นชีตเพื่อกันแท็บขยะ', 'error', 5000);
      return true; // คืน true เพื่อให้ outbox เลิกพยายาม ไม่วนลูป retry ตลอดไป
    }
    if (!this.hasCloudSyncConfig()) {
      if (!isSilent) this.showToast(this.getCloudSetupMessage(), 'warning');
      return false;
    }
    try {
      const payload = this.buildSummaryPayload(transactions, expenses, 'day', dateStr);
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(this.explainCloudError(`HTTP ${response.status}`));

      const result = await response.json();
      if (result.status === 'success') {
        if (!isSilent) this.showToast('ส่งสรุปรายวันขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else if (result.code === 'STALE_SUMMARY') {
        // ชีตมีรุ่นที่ใหม่กว่าอยู่แล้ว — ยกพื้นรุ่นแล้วให้ลองใหม่ (รอบหน้าชนะแน่นอน)
        // งานใน outbox วนเองอยู่แล้ว ส่วนการกดปุ่มเองต้องบอกให้กดซ้ำ ไม่งั้นกดแล้วเงียบ
        this.noteSummaryStampFloor(result.details);
        console.warn('[Summary] ปลายทางมีข้อมูลรุ่นใหม่กว่า จะส่งใหม่ด้วยรุ่นที่สูงขึ้น');
        if (!isSilent) this.showToast('บนชีตมีข้อมูลรุ่นใหม่กว่าอยู่ จึงยังไม่เขียนทับ — กดส่งอีกครั้งได้เลย', 'warning', 7000);
        return false;
      } else {
        throw new Error(this.explainCloudError(result.message) || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Daily summary sync error:', err);
      if (!isSilent) this.showToast('ส่งสรุปรายวันล้มเหลว: ' + this.explainCloudError(err), 'error', 8000);
      return false;
    }
  }

  // ─── ส่งสรุปรายเดือนไป Google Sheets ───────────────────────────────────
  async syncMonthlySummary(monthStr, isSilent = true) {
    if (!this.canWriteData(isSilent ? '' : 'ส่งสรุปขึ้นชีต')) return false;
    if (!this.isValidMonthKey(monthStr)) {
      console.error('[Guard] ปฏิเสธการส่งสรุปรายเดือน — คีย์เดือนใช้ไม่ได้:', monthStr);
      if (!isSilent) this.showToast('เดือนของข้อมูลใช้ไม่ได้ — ไม่ส่งขึ้นชีตเพื่อกันแท็บขยะ', 'error', 5000);
      return true;
    }
    if (!this.hasCloudSyncConfig()) {
      if (!isSilent) this.showToast(this.getCloudSetupMessage(), 'warning');
      return false;
    }
    try {
      // กรองธุรกรรมของ "เดือนทำการ" นั้น
      const txs = this.state.transactions.filter(tx => {
        return this.getBusinessISOMonth(tx.date) === monthStr.slice(3) + '-' + monthStr.slice(0, 2);
      });
      // รวมค่าใช้จ่ายของเดือนทำการนั้น — ยึดเวลาที่จ่ายเงินจริงของแต่ละรายการ
      // (เกณฑ์เดียวกับ txs ด้านบน ไม่งั้นบิลกับค่าใช้จ่ายของคืนคาบเกี่ยวสิ้นเดือนจะไปคนละเดือน)
      // ครอบคลุมทั้งกะที่ปิดแล้วและกะที่ยังเปิดอยู่ในตัว
      const expenses = this.collectExpenses('month', monthStr);

      const payload = this.buildSummaryPayload(txs, expenses, 'month', monthStr);
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(this.explainCloudError(`HTTP ${response.status}`));
      
      const result = await response.json();
      if (result.status === 'success') {
        if (!isSilent) this.showToast('ส่งสรุปรายเดือนขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else if (result.code === 'STALE_SUMMARY') {
        this.noteSummaryStampFloor(result.details);
        console.warn('[Summary] ปลายทางมีข้อมูลรุ่นใหม่กว่า จะส่งใหม่ด้วยรุ่นที่สูงขึ้น');
        if (!isSilent) this.showToast('บนชีตมีข้อมูลรุ่นใหม่กว่าอยู่ จึงยังไม่เขียนทับ — กดส่งอีกครั้งได้เลย', 'warning', 7000);
        return false;
      } else {
        throw new Error(this.explainCloudError(result.message) || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Monthly summary sync error:', err);
      if (!isSilent) this.showToast('ส่งสรุปรายเดือนล้มเหลว: ' + this.explainCloudError(err), 'error', 8000);
      return false;
    }
  }

  // ตรวจสอบและอัปเดตสถานะของไอคอนคลาวด์บนหน้าจอ
  checkSyncStatus() {
    const pendingTxs = this.state.transactions.filter(tx => tx.syncStatus !== 'synced');
    // งานคลาวด์ที่ลองครบ 3 ครั้งแล้วยังไม่สำเร็จ = ไม่ใช่แค่ "เน็ตสะดุด" อีกต่อไป
    const stuckJobs = (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : [])
      .filter(it => it && (it.tries || 0) >= 3).length;
    if (!this.googleSheetsUrl) {
      // ยังไม่ตั้งค่า URL — ไม่ใช่สถานะ "ค้างซิงก์" (ไม่มีปลายทางให้ส่ง) แสดงเป็นออฟไลน์พร้อมจำนวนบิลในเครื่องแทน
      // เดิมโชว์ "ค้างซิงก์ ⚠️" ถาวรสำหรับร้านที่ตั้งใจใช้ออฟไลน์ล้วน ทำให้เข้าใจผิดว่าระบบมีปัญหา
      this.updateSyncBadgeStatus('offline', pendingTxs.length);
    } else if (!this.isValidCloudApiToken(this.googleSheetsApiToken || '')) {
      this.updateSyncBadgeStatus('setup', pendingTxs.length);
    } else if (pendingTxs.length > 0) {
      this.updateSyncBadgeStatus('warning', pendingTxs.length);
    } else if (stuckJobs > 0) {
      // ⚠️ ไม่มีบิลค้าง แต่มีงานคลาวด์ที่ลองแล้วลองอีกไม่สำเร็จ (ลบแถวบิลที่ยกเลิก / รีเฟรชสรุป / แจ้งเตือน)
      // เดิมเคสนี้ขึ้นว่า "ตรงกัน ✓" ทั้งที่แถวบิลที่สั่งลบยังค้างอยู่บนชีต
      // = ยอดบนชีตมากกว่าความจริงโดยไม่มีอะไรฟ้องเจ้าของเลย
      this.updateSyncBadgeStatus('stuck', stuckJobs);
    } else {
      this.updateSyncBadgeStatus('synced', 0);
    }
  }

  // ส่งข้อมูลของรายการธุรกรรมเดียวไปยัง Google Sheets
  async syncSingleTransaction(tx) {
    if (!this.hasCloudSyncConfig()) {
      throw new Error(this.getCloudSetupMessage());
    }

    // monthKey = "เดือนทำการ" จากเวลาเครื่องหน้าร้าน — บิลตี 2 ของเช้าวันที่ 1 ลงแท็บเดือนของคืนสิ้นเดือน
    // และกันแท็บผิดเดือนเมื่อ timezone ของโปรเจกต์ Apps Script ตั้งไว้ผิด (ค่า default มักเป็น US)
    // dateTimeStr = เวลาจริง (สำหรับแสดงในแถวบิล ไม่ใช่การจัดกลุ่ม)
    const txD = new Date(tx.date);
    const pad2 = (n) => String(n).padStart(2, '0');
    const payload = this.buildCloudRequest('transaction', {
      // บิลที่มาจากการกู้ข้อมูลคือ "เจตนาคืนบิลใหม่" ไม่ใช่คำขอเก่าที่หลงมาถึงทีหลัง
      // ปลายทางจะยอมข้ามทะเบียนบิลที่ยกเลิกก็ต่อเมื่อ restoredAt ใหม่กว่าเวลาที่ยกเลิกจริง ๆ
      // (ดู tombstone ใน google_apps_script.js) — ธงเปล่า ๆ ไม่พออีกต่อไป
      allowVoidedRestore: Number(tx.restoredAt) > 0,
      restoredAt: Number(tx.restoredAt) || 0,
      id: tx.id,
      date: tx.date,
      monthKey: this.getBusinessMonthKey(tx.date),
      dateTimeStr: `${txD.getFullYear()}-${pad2(txD.getMonth() + 1)}-${pad2(txD.getDate())} ${pad2(txD.getHours())}:${pad2(txD.getMinutes())}:${pad2(txD.getSeconds())}`,
      customerName: tx.customerName,
      services: tx.services,
      subtotal: tx.subtotal,
      discount: tx.discount,
      // 4 ช่อง VAT ที่ล็อกไว้ตอนออกบิล — ชีตเอาไปลงคอลัมน์ให้แถวบวกลงตัว
      // (ราคารวม − ส่วนลด = ไม่คิด VAT + คิด VAT · แล้ว + VAT + ปัดเศษ = ยอดสุทธิ)
      // บิลรุ่นก่อนมี VAT ไม่มีฟิลด์พวกนี้ → JSON.stringify ตัดทิ้งเอง แล้วฝั่งชีตคำนวณย้อนให้
      nonVatBase: tx.nonVatBase,
      vatableBase: tx.vatableBase,
      vatAmount: tx.vatAmount,
      rounding: tx.rounding,
      total: tx.total,
      paymentMethod: tx.paymentMethod,
      staffNames: tx.staffNames
    });

    // ส่งแบบ simple request (text/plain) เพื่อข้าม CORS preflight แล้วอ่าน JSON ที่ตอบกลับมา
    let response;
    try {
      response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS ต้องการ text/plain เพื่อข้าม preflight
        body: JSON.stringify(payload)
      });
    } catch (networkErr) {
      throw new Error('เครือข่ายขัดข้อง: ' + this.explainCloudError(networkErr));
    }

    if (!response.ok) {
      throw new Error(this.explainCloudError(`HTTP ${response.status}`));
    }

    // ตรวจ response JSON ว่า status === 'success'
    try {
      const result = await response.json();

      // ปลายทางบอกว่าบิลนี้ถูกยกเลิกไปแล้ว จึงไม่รับบันทึกซ้ำ (ทะเบียนบิลที่ยกเลิกฝั่ง GAS)
      // นี่คือ "สถานะสุดท้าย" ไม่ใช่ข้อผิดพลาดชั่วคราว — ยิงอีกกี่ครั้งก็ได้คำตอบเดิม
      // ถ้าปล่อยให้ throw บิลจะค้าง pending แล้ววนส่งใหม่ทุกครั้งที่เปิดแอปตลอดไป
      if (result && result.code === 'ALREADY_VOIDED') {
        // ── บิลที่มาจากการกู้ข้อมูล = มีเจตนาคืนบิลชัดเจน ────────────────────
        // ถูกปฏิเสธได้ทางเดียวคือ restoredAt เก่ากว่าเวลาที่ยกเลิก ซึ่งเกิดได้เมื่อ
        // นาฬิกาเครื่องถูกตั้งย้อนหลัง/เปลี่ยน timezone ระหว่างยกเลิกกับกู้ข้อมูล
        // ถ้าไม่มีทางออก บิลใบนั้นจะขึ้นชีตไม่ได้เลยจนกว่าทะเบียนจะหมดอายุ 90 วัน
        // และข้อความที่เคยแนะนำ ("ให้กู้ข้อมูลจากไฟล์สำรอง") ก็คือสิ่งที่เพิ่งทำไป = ทางตัน
        //
        // ยืนยันเจตนาใหม่ครั้งเดียวด้วยเวลาที่ชนะทะเบียน แล้วปล่อยให้รอบ retry ส่งต่อ
        // ไม่ใช่การข้ามการป้องกัน เพราะคำขอเก่าที่ค้างในเน็ตไม่มีทางเดินเส้นนี้ได้
        // (มันไม่มีใครรอรับคำตอบเพื่อยิงซ้ำ) — ทำได้ครั้งเดียวต่อบิลต่อการเปิดแอปหนึ่งครั้ง
        const voidedAtSrv = Number(result.details && result.details.voidedAt);
        if (tx.restoredAt && !tx._restoreConfirmed && isFinite(voidedAtSrv) && voidedAtSrv > 0) {
          tx._restoreConfirmed = true;
          tx.restoredAt = voidedAtSrv + 1;
          console.warn('[Sync] ยืนยันเจตนาคืนบิลอีกครั้ง (นาฬิกาเครื่องเก่ากว่าทะเบียน):', tx.id);
          this.showToast(
            `บิล ${String(tx.id).slice(0, 24)} เคยถูกยกเลิกบนชีต — กำลังยืนยันคืนบิลตามที่กู้ข้อมูลมา`,
            'info', 6000);
          throw new Error('ยืนยันเจตนาคืนบิลใหม่ — จะส่งอีกครั้งในรอบถัดไป');
        }
        console.warn('[Sync] ปลายทางปฏิเสธเพราะบิลถูกยกเลิกไปแล้ว:', tx.id);
        this.showToast(
          `บิล ${String(tx.id).slice(0, 24)} ถูกยกเลิกไปแล้วบนชีต จึงไม่ส่งขึ้นซ้ำ — ` +
          `ถ้าต้องการให้กลับขึ้นชีตจริง ให้กู้ข้อมูลจากไฟล์สำรอง`, 'warning', 9000);
        return true;   // ถือว่าจบ ไม่วนส่งใหม่
      }

      if (result.status !== 'success') {
        throw new Error(this.explainCloudError(result.message) || 'GAS รายงานข้อผิดพลาด');
      }
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error(this.explainCloudError(parseErr));
      }
      throw parseErr;
    }

    return true;
  }

  // ลูปส่งรายการธุรกรรมที่ค้างอยู่ทั้งหมด (Sync Queue)
  // เรียกเมื่อเปิดแอป/เน็ตกลับมา/กลับเข้าหน้าแอป เพื่อไม่ให้บิลที่ขายตอนออฟไลน์ค้างจนลืม
  // ── ทุกงานที่คุยกับ Google Sheets ต้องต่อคิวเส้นเดียว ห้ามวิ่งพร้อมกัน ──
  // ⚠️ เคสที่ทำให้บิลที่ยกเลิกแล้วกลับขึ้นชีต:
  //   คำสั่ง "บันทึกบิล" ยังลอยอยู่ในเน็ต → ผู้ใช้กดยกเลิกบิล → คำสั่ง "ลบบิล" ไปถึงก่อน
  //   ปลายทางตอบ NOT_FOUND (ถือว่าลบแล้ว ทิ้งงาน) → คำสั่งบันทึกเดิมมาถึงทีหลัง → บิลผีบนชีต
  //
  // รอบก่อนแก้ด้วยการใส่ await ใน resumePendingCloudWork() ซึ่งปิดได้แค่เส้นเดียว
  // เพราะ voidTransaction() / ปิดกะ / แก้บิล ต่างก็ยิง flushCloudOutbox() ตรงของใครของมัน
  // ทำเป็นคิวที่ตัวฟังก์ชันเองจึงครอบทุกผู้เรียก รวมถึงเส้นที่จะเขียนเพิ่มในอนาคต
  runCloudTask(fn) {
    // ⚠️ ห้ามทำให้คิว "เรียกซ้อนได้" ด้วยธงตัวแปรรวม — ธงแบบนั้นแยกไม่ออกระหว่าง
    // "งานในคิวเรียกงานย่อย" กับ "อีกเส้นทางเรียกเข้ามาพร้อมกัน" ผลคือคิวเลิกทำงานทั้งระบบ
    // แทนที่จะแก้ที่คิว ให้แยกชั้นให้ชัด: คิวอยู่ที่ "ทางเข้า" · ด่านสิทธิ์อยู่ที่ "ตัวส่งจริง"
    this._cloudChain = Promise.resolve(this._cloudChain)
      .catch(() => {})                       // งานก่อนหน้าล้มต้องไม่ทำให้คิวตันถาวร
      .then(() => fn());
    return this._cloudChain;
  }

  resumePendingCloudWork() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // หน้าต่างรองห้ามส่งอะไรขึ้นคลาวด์ — ข้อมูลในมือมันเก่ากว่าที่หน้าต่างหลักเพิ่งบันทึก
    // ถ้าปล่อยไป ยอดบนชีตจะถูกเขียนทับด้วยตัวเลขเก่า ทั้งที่ในเครื่องถูกต้องแล้ว
    // หน้าต่างหลักจะส่งเองอยู่แล้ว และหน้าต่างนี้จะโหลดข้อมูลใหม่ก่อนรับสิทธิ์เสมอ
    if (!this.canWriteData()) return;
    if (!this.hasCloudSyncConfig()) {
      this.checkSyncStatus();
      return;
    }
    // ⚠️ ต้อง await ให้บิลค้างส่งจบก่อน ค่อยยิง outbox
    // เดิมเรียกสองตัวติดกันโดยไม่รอ → คำขอ "บันทึกบิล" กับคำขอ "ลบบิลที่ยกเลิก" วิ่งพร้อมกัน
    // ถ้าคำขอลบไปถึงก่อน ปลายทางจะตอบ NOT_FOUND (ถือว่าลบแล้ว ทิ้งงาน) แล้วคำขอบันทึกที่ตามมาทีหลัง
    // จะสร้างแถวบิลที่ถูกยกเลิกไปแล้วขึ้นมาใหม่บนชีต — ยอดบนชีตเกินจริงโดยไม่มีอะไรเตือน
    // เรียงลำดับให้ชัดตรงนี้ปิดหน้าต่างนั้นได้เกือบหมด (ที่เหลือคือคำขอที่ timeout ฝั่งเราแต่เซิร์ฟเวอร์ยังทำต่อ)
    // Promise.resolve() ครอบไว้เพราะเทสต์ (และโค้ดเก่า) อาจแทน syncPendingTransactions ด้วยฟังก์ชันธรรมดา
    return Promise.resolve(this.syncPendingTransactions(true))
      .catch(err => { console.error('syncPendingTransactions failed', err); })
      // งาน outbox ต้องได้ทำต่อเสมอ แม้การส่งบิลจะล้มเหลว ไม่งั้นงานลบ/สรุปจะค้างเพราะเรื่องที่ไม่เกี่ยวกัน
      .then(() => this.flushCloudOutbox())
      // ผู้เรียกทุกที่ยิงแบบ fire-and-forget — ถ้าไม่ปิดท้าย เบราว์เซอร์จะขึ้น unhandled rejection
      .catch(err => { console.error('flushCloudOutbox failed', err); });
  }

  async syncPendingTransactions(isSilent = false) {
    return this.runCloudTask(() => this._doSyncPendingTransactions(isSilent));
  }

  async _doSyncPendingTransactions(isSilent = false) {
    if (!this.canWriteData()) return;   // ดูเหตุผลที่ canWriteData()
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

      if (!this.hasCloudSyncConfig()) {
        this.checkSyncStatus();
        if (!isSilent) {
          this.showToast(this.getCloudSetupMessage(), 'info');
        }
        return;
      }

      this.updateSyncBadgeStatus('syncing', pendingTxs.length);
      
      let successCount = 0;
      let failCount = 0;
      let lastErr = null;   // เก็บไว้ตัดสินว่าต้องเตือนเจ้าของไหม (ดูท้ายลูป)

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
          // สิทธิ์คืนบิลเป็น "ครั้งเดียวจบ" — ขึ้นชีตแล้วต้องปลดทิ้ง
          // ไม่งั้นบิลใบนี้จะพกสิทธิ์ข้ามทะเบียนติดตัวไปตลอดอายุการใช้งาน
          if (tx.restoredAt) delete tx.restoredAt;
          // ธงยืนยันคืนบิลก็เป็นของ "การกู้ครั้งนั้น" เหมือนกัน ขึ้นชีตแล้วต้องล้าง
          // ไม่งั้นมันจะติดไปกับไฟล์สำรองที่สร้างหลังจากนี้ แล้วไปปิดทางออกฉุกเฉินของการกู้รอบหน้า
          if (tx._restoreConfirmed) delete tx._restoreConfirmed;
          successCount++;
        } catch (err) {
          console.error(`Failed to sync transaction ${tx.id}:`, err);
          tx.syncStatus = 'pending';
          failCount++;
          lastErr = err;
        }
      }

      // ── ปัญหาบางอย่างรอไปกี่รอบก็ไม่หายเอง ต้องบอกเจ้าของแม้เป็นการซิงก์เบื้องหลัง ──
      // หัวคอลัมน์บนชีตเพี้ยน = ยิงอีกกี่ครั้งก็ได้ SCHEMA_MISMATCH เหมือนเดิม
      // เดิมข้อความ error ลงแค่ console เจ้าของจะเห็นแค่ตัวเลข "ยังไม่ซิงก์" ค้างขึ้นเรื่อย ๆ
      // โดยไม่มีทางรู้ว่าต้องไปแก้หัวตารางบนชีต — เตือนครั้งเดียวพอ ไม่ต้องขึ้นทุกรอบ
      if (successCount > 0) this._schemaWarnShown = false;   // แก้แล้วซิงก์ผ่าน — พร้อมเตือนใหม่ถ้าพังอีก
      if (failCount > 0 && lastErr) {
        const m = String((lastErr && lastErr.message) || lastErr || '');
        if (/โครงสร้างคอลัมน์|SCHEMA_MISMATCH/.test(m) && !this._schemaWarnShown) {
          this._schemaWarnShown = true;
          this.showToast(this.explainCloudError(lastErr), 'error', 12000);
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
    } else if (status === 'stuck') {
      textStr = `งานคลาวด์ค้าง ${count} รายการ ⚠️`;
      iconClass = 'fa-cloud-arrow-up';
      statusClass = 'sync-warning';
    } else if (status === 'setup') {
      textStr = 'ตั้งค่ารหัสคลาวด์ไม่ครบ ⚠️';
      iconClass = 'fa-key';
      statusClass = 'sync-warning';
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
      } else if (status === 'setup') {
        settingsDetailsEl.innerText = count > 0
          ? `มี ${count} บิลในเครื่อง — กรอกรหัสเชื่อมต่อ Apps Script เพื่อเริ่มซิงก์`
          : 'กรอกรหัสเชื่อมต่อ Apps Script เพื่อเปิดการซิงก์อย่างปลอดภัย';
        settingsDetailsEl.style.color = 'var(--accent-premium)';
      } else if (status === 'stuck') {
        settingsDetailsEl.innerText =
          `มีงานคลาวด์ค้าง ${count} รายการ (เช่นคำสั่งลบแถวบิลที่ยกเลิก หรือรีเฟรชสรุป) — ` +
          `บิลในเครื่องขึ้นชีตครบแล้ว แต่ชีตอาจยังไม่ตรง ใช้ปุ่ม "ตรวจความตรงกันกับชีต" ดูได้`;
        settingsDetailsEl.style.color = 'var(--accent-premium)';
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

  // ── อ่านจำนวนใบ/เหรียญจากช่องกรอกแบบปลอดภัย ────────────────────────────
  // `min="0"` ใน HTML กันแค่ปุ่มลูกศร — พิมพ์ "-5" เองได้ ยอดรวมจะติดลบ
  // แล้วเงินขาด/เกินตอนปิดกะเพี้ยนทั้งกะโดยไม่มีอะไรเตือน
  // clamp ตรงนี้ที่เดียวไม่พอ ต้องเรียกจากทั้งตอนคำนวณโชว์และตอนกดยืนยัน (ใช้ตัวเดียวกัน)
  // ถ้าค่าที่กรอกอยู่นอกช่วง จะเขียนค่าที่ clamp แล้วกลับลงช่องให้เห็นทันที ไม่แก้เงียบ ๆ
  readCashQty(input) {
    const raw = parseInt(input.value, 10);
    if (!Number.isFinite(raw)) return 0;                       // ช่องว่าง/พิมพ์ค้าง
    const qty = Math.max(0, Math.min(99999, Math.floor(raw))); // ไม่ติดลบ ไม่เกินจริง ไม่มีเศษ
    // เทียบเป็นข้อความ ไม่ใช่ตัวเลข — พิมพ์ "3.9" แล้ว parseInt ได้ 3 เท่ากับ qty พอดี
    // เงื่อนไขแบบเทียบตัวเลขจึงไม่แก้ช่องให้ ผู้ใช้เห็น 3.9 ค้างอยู่ทั้งที่ระบบนับ 3
    if (String(qty) !== String(input.value).trim()) input.value = String(qty);
    return qty;
  }

  updateCashSum() {
    let total = 0;
    const inputs = document.querySelectorAll('#form-cash-counter .cash-qty-input');

    inputs.forEach(input => {
      const denom = parseInt(input.getAttribute('data-denom'), 10);
      const qty = this.readCashQty(input);
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
        const qty = this.readCashQty(input); // clamp ชุดเดียวกับตอนแสดงผล — ยอดที่เห็นกับที่บันทึกตรงกันเสมอ
        total += denom * qty;
        details[denom] = qty;
      });
      
      if (this.cashCounterMode === 'open') {
        // เปิดกะใหม่
        const previousShift = this.cloneForRollback(this.state.shift);
        this.state.shift = {
          active: true,
          startTime: Date.now(),
          startCash: total,
          startDetails: details,
          expenses: [],
          history: this.state.shift.history || []
        };
        
        try {
          await this.saveStateOrThrow('การเปิดกะ');
        } catch (saveErr) {
          this.state.shift = previousShift;
          throw saveErr;
        }
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
        
        // เก็บสถานะเดิมไว้ก่อน เพราะการปิดกะเปลี่ยนหลายส่วนพร้อมกัน
        // หากเขียน IndexedDB ไม่สำเร็จ ต้องกลับมาเป็น "กะยังเปิด" ทั้งก้อน
        const closeRollback = {
          shift: this.cloneForRollback(this.state.shift),
          cart: this.cloneForRollback(this.state.cart),
          queue: this.cloneForRollback(this.state.queue),
          cloudOutbox: this.cloneForRollback(this.state.cloudOutbox || [])
        };

        try {
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

        // สลับสถานะเป็นไม่ได้ทำงาน
        this.state.shift.active = false;
        this.state.shift.startTime = null;
        this.state.shift.startCash = 0;
        this.state.shift.startDetails = {};
        this.state.shift.expenses = [];
        
        // ล้างข้อมูลตะกร้า คิว และสถานะชั่วคราว
        this.state.cart = [];
        this.state.queue = [];
        
        // บันทึกการปิดกะในเครื่องก่อน จึงค่อยสำรอง/ส่งคลาวด์
        await this.saveStateOrThrow('การปิดกะ');
        } catch (saveErr) {
          this.state.shift = closeRollback.shift;
          this.state.cart = closeRollback.cart;
          this.state.queue = closeRollback.queue;
          this.state.cloudOutbox = closeRollback.cloudOutbox;
          throw saveErr;
        }

        // ส่งสำรองข้อมูลอัตโนมัติขึ้น Google Drive ตอนปิดกะ (best-effort ครั้งเดียว)
        // ตอนนี้ข้อมูลในเครื่องถูกบันทึกแล้ว จึงไม่มีกรณีสำรองสำเร็จแต่การปิดกะหาย
        await this.autoBackupToGoogleDrive();

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
      time: Date.now(),
      // ⚠️ ต้องรู้ว่าใครเพิ่ม — ค่าใช้จ่ายทุกบาททำให้ "เงินที่ควรมีในลิ้นชัก" ลดลงหนึ่งบาท
      // ใครหยิบเงินออกแล้วกดเพิ่มค่าใช้จ่ายเท่ากัน ลิ้นชักจะลงตัวพอดีโดยไม่มีอะไรผิดปกติให้เห็น
      // การปิดกะเก็บ closedBy · การยกเลิกบิลเก็บ by · ตรงนี้เดิมไม่เก็บอะไรเลย
      by: this.currentUser ? this.currentUser.name : ''
    };
    
    if (!this.state.shift.expenses) {
      this.state.shift.expenses = [];
    }
    this.state.shift.expenses.push(expenseItem);

    // ⚠️ ค่าใช้จ่ายคือเงินที่หายออกจากลิ้นชักจริง — ต้องใช้มาตรฐานเดียวกับ checkout/ยกเลิกบิล/ลบค่าใช้จ่าย
    // เดิมเรียก saveState() เปล่า ๆ ไม่ดูค่าที่คืนมา แล้วล้างฟอร์มเดินต่อทันที
    // ผลคือถ้า IndexedDB เขียนไม่ผ่าน (เครื่องเต็ม/โควตาหมด/ฐานข้อมูลถูกล็อกจากอีกหน้าต่าง)
    // ผู้ใช้เห็นฟอร์มว่างเปล่าเหมือนบันทึกสำเร็จ แต่พอเปิดแอปใหม่รายการหายไป
    // แล้วเงินที่หยิบออกจากลิ้นชักจริงจะไม่มีที่มา ตอนปิดกะจะกลายเป็น "เงินขาด" ที่หาสาเหตุไม่ได้
    try {
      await this.saveStateOrThrow('ค่าใช้จ่าย');
    } catch (err) {
      // ถอนรายการที่เพิ่งใส่ออกจากหน่วยความจำ ไม่งั้นหน้าจอจะโชว์รายการที่ไม่ได้ถูกบันทึกลงเครื่อง
      const idx = this.state.shift.expenses.indexOf(expenseItem);
      if (idx > -1) this.state.shift.expenses.splice(idx, 1);
      // คงค่าที่กรอกไว้ให้ครบ ผู้ใช้จะได้กดซ้ำได้เลยโดยไม่ต้องพิมพ์ใหม่ (และไม่เกิดรายการซ้ำ เพราะของเดิมถูกถอนแล้ว)
      console.error('addExpense save failed', err);
      this.showToast(err.message || 'บันทึกค่าใช้จ่ายไม่สำเร็จ', 'error', 7000);
      this.renderDashboard();
      return;
    }

    // ล้างฟอร์มเฉพาะเมื่อบันทึกลงเครื่องสำเร็จจริงแล้วเท่านั้น
    if (amountInput) amountInput.value = '';
    const noteInput = document.getElementById('expense-note');
    if (noteInput) noteInput.value = '';

    this.renderDashboard();
    this.vibrateDevice(50);
  }

  deleteExpense(expenseId) {
    this.showConfirm('คุณต้องการลบรายการค่าใช้จ่ายนี้ใช่หรือไม่?', async () => {
      if (!this.state.shift || !this.state.shift.expenses) return;
      const target = this.state.shift.expenses.find(e => e.id === expenseId);
      if (!target) return;

      // เก็บสถานะเดิมไว้ก่อน — ถ้าเขียนลงเครื่องไม่สำเร็จต้องคืนทั้งรายการและประวัติ
      const prevExpenses = this.state.shift.expenses;
      const prevLog = Array.isArray(this.state.expenseLog) ? this.state.expenseLog.slice() : [];

      // ตัวรายการถูกลบทิ้งจริง (ยอดเงินยังคิดเหมือนเดิมทุกอย่าง ไม่ต้องแก้สูตรที่ไหน)
      // แต่ต้องเหลือหลักฐานไว้ ไม่งั้นลบแล้วหายเงียบ ไม่มีใครรู้ว่าเคยมีรายการนี้
      this.state.shift.expenses = this.state.shift.expenses.filter(e => e.id !== expenseId);
      if (!Array.isArray(this.state.expenseLog)) this.state.expenseLog = [];
      this.state.expenseLog.push({
        expenseId: target.id,
        amount: Number(target.amount) || 0,
        note: target.note || '',
        addedBy: target.by || '',      // ว่าง = รายการเก่าก่อนมีการเก็บชื่อ
        addedAt: target.time || null,
        by: this.currentUser ? this.currentUser.name : '',
        date: Date.now()
      });

      try {
        await this.saveStateOrThrow('การลบค่าใช้จ่าย');
      } catch (err) {
        this.state.shift.expenses = prevExpenses;
        this.state.expenseLog = prevLog;
        console.error('deleteExpense failed:', err);
        this.showToast('ลบค่าใช้จ่ายไม่สำเร็จ — ระบบคืนรายการกลับมาให้แล้ว', 'error', 6000);
        this.renderDashboard();
        return;
      }
      this.renderDashboard();
      this.vibrateDevice(50);
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
    this.showCacheVersion();
  }

  // ถามเวอร์ชันแคชจาก Service Worker ที่ทำงานอยู่จริง แล้วต่อท้ายป้ายเวอร์ชัน
  // ทำไมต้องมี: APP_VERSION เป็นเลขที่พิมพ์มือ ลืมแก้เมื่อไหร่ป้ายก็โกหกทันที
  // ส่วนเลขแคช deploy.ps1 บวกให้เองทุกครั้งที่ deploy — ถ้าเลขนี้ยังเท่าเดิมแปลว่าเครื่องยังไม่ได้ของใหม่
  showCacheVersion() {
    const el = document.getElementById('app-version-label');
    if (!el || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      const ch = new MessageChannel();
      let answered = false;
      ch.port1.onmessage = (ev) => {
        answered = true;
        const name = ev.data && ev.data.cacheName;
        if (name) el.innerText = 'เวอร์ชัน ' + APP_VERSION + ' · แคช ' + name;
      };
      // SW รุ่นเก่ายังไม่รู้จักคำสั่งนี้ จะเงียบไปเฉยๆ — อย่าค้างรอ ปล่อยให้ป้ายเดิมอยู่ต่อ
      setTimeout(() => { if (!answered) ch.port1.close(); }, 3000);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    } catch (err) {
      console.warn('อ่านเวอร์ชันแคชไม่ได้', err);
    }
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
        brandLogo.innerHTML = `<img src="${escapeHtml(this.shopLogo)}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">`;
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
          const prevLogo = this.shopLogo;
          this.shopLogo = canvas.toDataURL('image/png');
          if (!await this.persistOrRollback('โลโก้ร้าน', () => { this.shopLogo = prevLogo; })) {
            this.applyShopName(); this.updateLogoPreview(); return;
          }
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
    const prevLogo = this.shopLogo;
    this.shopLogo = '';
    if (!await this.persistOrRollback('การลบโลโก้', () => { this.shopLogo = prevLogo; })) {
      this.applyShopName(); this.updateLogoPreview(); return;
    }
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
      preview.innerHTML = `<img src="${escapeHtml(this.shopLogo)}" alt="logo" style="width:100%;height:100%;object-fit:cover;">`;
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
        // updateViaCache:'none' — บังคับให้ตรวจ sw.js กับเซิร์ฟเวอร์จริงเสมอ ไม่หยิบจาก HTTP cache
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
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
    if (type === 'monthly' && !this.canViewMonthlyReport()) {
      this.showToast('สรุปรายเดือนดูได้เฉพาะเจ้าของร้าน — แสดงสรุปรายวันแทน', 'warning', 5000);
      type = 'daily';
    }
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
    // ด่านชั้นที่สอง — ค่า "รายเดือน" อาจค้างมาจากเซสชันของเจ้าของคนก่อน
    // หรือมีใครเรียกฟังก์ชันนี้ตรง ๆ ข้ามปุ่มบนหน้าจอ ให้ตกกลับเป็นรายวันเสมอ
    if (this.state.selectedReportType === 'monthly' && !this.canViewMonthlyReport()) {
      this.state.selectedReportType = 'daily';
    }
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
        
        // ── บิลเก่าที่ไม่มีรายการย่อย ────────────────────────────────────
        // เดิมดึง "ราคาและอัตราค่าคอมของวันนี้" มาใช้ย้อนหลัง = เปลี่ยนราคาวันนี้แล้วรายงานเก่าเปลี่ยน
        // ตอนนี้ใช้เฉพาะยอดที่บิลใบนั้นล็อกไว้ เกลี่ยเท่า ๆ กันด้วยสตางค์จำนวนเต็ม
        //
        // ค่าคอม: บิลแบบนี้ไม่ได้เก็บอัตราไว้เลย จึงไม่มีทางรู้ว่าจ่ายไปเท่าไร
        // เดา 10% จากอัตราปัจจุบันแล้วแสดงเหมือนเป็นข้อมูลจริง แย่กว่าบอกว่าไม่รู้
        // → ใส่ 0 พร้อมธง commissionUnknown ให้รายงานบอกได้ว่าตัวเลขนี้แยกไม่ได้
        const _names = Array.isArray(tx.services) ? tx.services : [];
        const _billNetSat = Math.round(Math.max(0, (Number(tx.subtotal) || 0) - (Number(tx.discount) || 0)) * 100);
        const _share = this.allocateSatang(_billNetSat, _names.map(() => 1));
        _names.forEach((sName, _i) => {
          const price = _share[_i] / 100;
          const commAmt = 0;
          allServiceItems.push({
            commissionUnknown: true,
            txId: tx.id,
            txDate: tx.date,
            customerName: tx.customerName,
            paymentMethod: tx.paymentMethod,
            name: sName,
            price: price,
            // price ถูกเกลี่ยจาก (ราคารวม − ส่วนลด) ของบิลใบนั้นมาแล้ว จึงเป็นยอดหลังหักส่วนลดในตัว
            netPrice: price,
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
            <td>${Number(sc.count) || 0} งาน</td>
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
              <td><span class="service-category-badge badge-${escapeHtml(item.category || 'general')}">${escapeHtml(categoryText)}</span></td>
              <td>${Number(item.count) || 0} ครั้ง</td>
              <td>฿${(Number(item.price) || 0).toLocaleString('th-TH')}</td>
              <td style="font-weight:700; color: var(--accent-massage);">฿${(Number(item.totalRevenue) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
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
      // ปุ่ม "แก้ไข" เปิดหน้าต่างที่มีทั้งการแก้ยอด (เจ้าของ) และการยกเลิกบิล (ผู้จัดการขึ้นไป)
      // พนักงานกดแล้วโดนปฏิเสธทุกทางอยู่แล้ว — โชว์ปุ่มที่กดแล้วไม่มีวันได้ผลไม่มีประโยชน์
      // (ด่านสิทธิ์จริงยังอยู่ครบที่ saveTransactionEdit/voidTransaction ตรงนี้แค่ไม่วาดปุ่ม)
      const canEditBill = this.currentRole === 'owner' || this.currentRole === 'manager';
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
            <td><strong>${escapeHtml(tx.id)}</strong></td>
            <td>${timeStr} น.</td>
            <td>${escapeHtml(tx.customerName)}</td>
            <td>${displayedServices.map(escapeHtml).join(', ')}</td>
            <td><span style="font-size:0.75rem; text-transform: uppercase;">${tx.paymentMethod === 'promptpay' ? 'Scan' : tx.paymentMethod === 'credit' ? 'Credit' : 'เงินสด'}</span></td>
            <td style="font-weight:700; color: var(--accent-barber); line-height: 1.2;">${displayTotalHTML}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-small secondary" onclick="app.viewHistoricalReceipt('${safeId(tx.id)}')">
                  <i class="fa-solid fa-eye"></i> บิล
                </button>
                ${canEditBill ? `<button class="btn-small primary" onclick="app.openTransactionEdit('${safeId(tx.id)}')" style="background: linear-gradient(135deg, var(--accent-barber), #e0a91f); color: var(--bg-app); border: none;">
                  <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                </button>` : ''}
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
        // ยึด "วันทำการที่เปิดกะ" ให้ตรงกับ getClosedShiftsForPeriod ที่ส่งขึ้นชีต
        // (เดิมยึดเวลาปิด → คืนที่ปิดช้าเลย 06:00 แถวกะบนหน้ารายงานกับบนชีตจะคนละวันกัน)
        if (type === 'daily') {
          filteredShifts = this.state.shift.history.filter(sh => {
            const shDateStr = this.getBusinessISODate(sh.startTime || sh.endTime);
            return shDateStr === dateVal;
          });
        } else {
          filteredShifts = this.state.shift.history.filter(sh => {
            const shMonthStr = this.getBusinessISOMonth(sh.startTime || sh.endTime);
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
              <td>฿${(Number(sh.startCash) || 0).toLocaleString('th-TH')}</td>
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

    this.renderAuditTrail(type, dateVal, monthVal);
  }

  // ── ประวัติการแก้ไขย้อนหลัง (บิลที่ถูกยกเลิก + ค่าใช้จ่ายที่ถูกลบ) ──────────
  // ข้อมูลสองชุดนี้ถูกเก็บมาตลอดอยู่แล้ว แต่เดิมไม่มีหน้าไหนแสดงมันเลย
  // ต้องกดส่งออกไฟล์สำรองแล้วเปิดไฟล์ JSON ดูเองถึงจะเห็น = ในทางปฏิบัติเท่ากับไม่มี
  //
  // ทั้งคู่คือรายการที่ "ทำให้เงินหายไปจากระบบ" โดยไม่มีบิลรองรับ
  //   ยกเลิกบิล      → ยอดขายหายไปทั้งใบ
  //   ลบค่าใช้จ่าย   → เงินที่ควรมีในลิ้นชักเพิ่มขึ้น (กลบร่องรอยการเพิ่มค่าใช้จ่ายปลอม)
  // จัดกลุ่มตาม "เวลาที่ลงมือทำ" ไม่ใช่เวลาของบิล เพราะคำถามคือ "รอบนี้มีใครทำอะไรบ้าง"
  renderAuditTrail(type, dateVal, monthVal) {
    const inPeriod = (ts) => {
      if (!ts) return false;
      return type === 'daily'
        ? this.getBusinessISODate(ts) === dateVal
        : this.getBusinessISOMonth(ts) === monthVal;
    };
    const when = (ts) => ts ? new Date(ts).toLocaleString('th-TH') : '-';
    const baht = (v) => `฿${(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    const emptyRow = (cols, text) =>
      `<tr><td colspan="${cols}" class="empty-state" style="text-align:center;">` +
      `<i class="fa-solid fa-shield-halved" style="display:block;margin:10px 0;"></i> ${text}</td></tr>`;

    // 1) บิลที่ถูกยกเลิก
    const voidBody = document.getElementById('report-voids-body');
    const voidCount = document.getElementById('report-voids-count');
    if (voidBody) {
      const rows = (Array.isArray(this.state.voidLog) ? this.state.voidLog : [])
        .filter(v => inPeriod(v.date))
        .sort((a, b) => (b.date || 0) - (a.date || 0));
      if (voidCount) {
        const sum = rows.reduce((s, v) => s + (Number(v.amount) || 0), 0);
        voidCount.innerText = rows.length ? `${rows.length} ใบ · รวม ${baht(sum)}` : '';
      }
      voidBody.innerHTML = rows.length === 0
        ? emptyRow(5, 'ไม่มีการยกเลิกบิลในรอบที่ระบุ')
        : rows.map(v => `
            <tr>
              <td>${when(v.date)}</td>
              <td><strong>${escapeHtml(v.billId || '-')}</strong></td>
              <td>${escapeHtml(v.customer || '-')}</td>
              <td style="font-weight:700;color:var(--color-danger);">${baht(v.amount)}</td>
              <td>${v.by ? escapeHtml(v.by) : '<span style="color:var(--text-muted);">ไม่ระบุ</span>'}</td>
            </tr>`).join('');
    }

    // 2) ค่าใช้จ่ายที่ถูกลบ
    const expBody = document.getElementById('report-expense-deletions-body');
    const expCount = document.getElementById('report-expense-deletions-count');
    if (expBody) {
      const rows = (Array.isArray(this.state.expenseLog) ? this.state.expenseLog : [])
        .filter(e => inPeriod(e.date))
        .sort((a, b) => (b.date || 0) - (a.date || 0));
      if (expCount) {
        const sum = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        expCount.innerText = rows.length ? `${rows.length} รายการ · รวม ${baht(sum)}` : '';
      }
      expBody.innerHTML = rows.length === 0
        ? emptyRow(5, 'ไม่มีการลบค่าใช้จ่ายในรอบที่ระบุ')
        : rows.map(e => `
            <tr>
              <td>${when(e.date)}</td>
              <td>${escapeHtml(e.note || '-')}</td>
              <td style="font-weight:700;color:var(--accent-premium);">${baht(e.amount)}</td>
              <td>${e.addedBy ? escapeHtml(e.addedBy) : '<span style="color:var(--text-muted);">ไม่ระบุ</span>'}</td>
              <td>${e.by ? escapeHtml(e.by) : '<span style="color:var(--text-muted);">ไม่ระบุ</span>'}</td>
            </tr>`).join('');
    }

    // 3) บิลที่ถูกแก้ย้อนหลัง
    // ⚠️ ต่างจากสองตารางบน: การแก้บิลไม่ได้ทำให้บิลหายไป แต่ทำให้ "ยอดเดิมหายไป"
    // ถ้าไม่มีตารางนี้ จะไม่มีทางรู้เลยว่าตัวเลขที่เคยยื่นสรรพากรถูกแก้ตอนไหนโดยใคร
    const editBody = document.getElementById('report-bill-edits-body');
    const editCount = document.getElementById('report-bill-edits-count');
    if (editBody) {
      const fieldLabel = { subtotal: 'ราคารวม', discount: 'ส่วนลด', total: 'ยอดสุทธิ',
                           customer: 'ลูกค้า', payment: 'ช่องทางจ่าย', staffNames: 'พนักงาน' };
      const rows = (Array.isArray(this.state.editLog) ? this.state.editLog : [])
        .filter(e => inPeriod(e.date))
        .sort((a, b) => (b.date || 0) - (a.date || 0));
      if (editCount) {
        // นับเฉพาะใบที่ "ยอดสุทธิ" เปลี่ยน — แก้ชื่อลูกค้าไม่ใช่เรื่องเงิน ไม่ควรทำให้ตัวเลขนี้ตกใจ
        const moneyRows = rows.filter(e => Array.isArray(e.fields) && e.fields.indexOf('total') > -1);
        const delta = moneyRows.reduce((s, e) =>
          s + ((Number(e.after && e.after.total) || 0) - (Number(e.before && e.before.total) || 0)), 0);
        editCount.innerText = rows.length
          ? `${rows.length} ครั้ง` + (moneyRows.length ? ` · ยอดเปลี่ยนสุทธิ ${delta >= 0 ? '+' : ''}${baht(delta)}` : '')
          : '';
      }
      editBody.innerHTML = rows.length === 0
        ? emptyRow(5, 'ไม่มีการแก้บิลย้อนหลังในรอบที่ระบุ')
        : rows.map(e => {
            const b = e.before || {}, a2 = e.after || {};
            const what = (Array.isArray(e.fields) ? e.fields : []).map(f => fieldLabel[f] || f).join(', ');
            const moneyChanged = Array.isArray(e.fields) && e.fields.indexOf('total') > -1;
            return `
            <tr>
              <td>${when(e.date)}</td>
              <td><strong>${escapeHtml(e.billId || '-')}</strong></td>
              <td>${escapeHtml(what || '-')}</td>
              <td style="font-weight:700;${moneyChanged ? 'color:var(--accent-barber);' : 'color:var(--text-muted);'}">
                ${moneyChanged ? `${baht(b.total)} → ${baht(a2.total)}` : '<span style="font-weight:normal;">ยอดไม่เปลี่ยน</span>'}
              </td>
              <td>${e.by ? escapeHtml(e.by) : '<span style="color:var(--text-muted);">ไม่ระบุ</span>'}</td>
            </tr>`;
          }).join('');
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
      <div style="flex:1; text-align:center;">${escapeHtml(p.label)}</div>
    `).join('');
  }

  // เปิดดูใบเสร็จย้อนหลังจากประวัติ
  viewHistoricalReceipt(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (tx) {
      this.showThermalReceipt(tx);
    }
  }

  // ── บิลใบนี้ออกก่อนระบบ VAT/ปัดเศษ (v1.5) หรือเปล่า ──────────────────────
  // บิลรุ่นใหม่จะมีฟิลด์พวกนี้เสมอ แม้ปิดสวิตช์ VAT ไว้ (ค่าเป็น 0)
  // ต้องแยกให้ออก เพราะบิลรุ่นเก่าไม่เคยถูก "ปัดขึ้นเต็มบาท" ถ้าเผลอเอากฎใหม่ไปคิดตอนแก้ไข
  // ยอดของบิลเก่าจะขยับเองเงียบ ๆ (เช่น 287.50 → 288.00) ทั้งที่ลูกค้าจ่ายไปแล้ว
  isLegacyBill(tx) {
    return tx.vatRate == null && tx.vatAmount == null &&
           tx.rounding == null && tx.nonVatBase == null && tx.vatableBase == null;
  }

  // ปัดชุดตัวเลขเป็นทศนิยม 2 ตำแหน่ง แล้วเกลี่ยเศษให้ผลรวมเท่ากับ target เป๊ะ
  // (หลักการเดียวกับ distributeDiscount — ยัดเศษที่เหลือลงรายการที่ใหญ่ที่สุด)
  roundToTotal(values, target) {
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const out = (values || []).map(r2);
    if (out.length === 0) return out;
    const goal = r2(target);
    const sum = r2(out.reduce((s, n) => s + n, 0));
    const diff = r2(goal - sum);
    if (diff !== 0) {
      let idx = 0;
      for (let i = 1; i < out.length; i++) if (out[i] > out[idx]) idx = i;
      out[idx] = r2(Math.max(0, out[idx] + diff));
    }
    return out;
  }

  // ── สร้าง "ร่าง" รายการในบิล สำหรับหน้าต่างแก้ไขเท่านั้น ────────────────────
  // ⚠️ ต้องคืนสำเนาใหม่เสมอ ห้ามคืนอ็อบเจกต์ตัวเดียวกับในบิลจริง
  // เดิมฟังก์ชันนี้เขียนผลลัพธ์ลง tx.details ทันทีที่เปิดหน้าต่าง แปลว่าแค่ "กดดู"
  // บิลเก่าแล้วกดยกเลิก บิลใบนั้นก็ถูกแก้ไปแล้ว และจะถูกบันทึกลงเครื่องตอนเซฟครั้งถัดไป
  //
  // บิลเก่าไม่ได้เก็บราคาต่อรายการไว้ จึงต้องเดา — แต่ห้ามเดาแล้วทำให้ "ยอดรวมของบิล" เปลี่ยน
  // เพราะตอนกดบันทึก ระบบจะคิด subtotal ใหม่จากผลรวมราคารายชิ้น ถ้าเดาด้วยราคาวันนี้
  // บิลปีที่แล้วจะถูกเขียนทับด้วยราคาปัจจุบันทันที (ขึ้นราคา 20% = ยอดบิลเก่าขึ้นตาม)
  // วิธีที่ใช้: เอาราคาปัจจุบันมาเป็นแค่ "สัดส่วน" แล้วย่อ/ขยายให้ผลรวมเท่ากับ subtotal เดิมเป๊ะ
  // ถ้าเทียบชื่อบริการไม่เจอสักตัว (ถูกลบไปแล้ว) → หารเท่ากันทุกรายการ
  buildEditableDetails(tx) {
    if (Array.isArray(tx.details) && tx.details.length > 0) {
      return tx.details.map(d => ({ ...d }));   // สำเนาตื้นพอ — ทุกฟิลด์เป็นค่าพื้นฐาน
    }

    const names = Array.isArray(tx.services) ? tx.services.slice() : [];
    if (names.length === 0) return [];

    const subtotal = (typeof tx.subtotal === 'number' && isFinite(tx.subtotal) && tx.subtotal >= 0)
      ? tx.subtotal : 0;
    const matched = names.map(n => this.state.services.find(s => s.name === n) || null);
    const weights = matched.map(s => (s && Number(s.price) > 0) ? Number(s.price) : 0);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const raw = names.map((n, i) => wSum > 0
      ? (subtotal * weights[i] / wSum)
      : (subtotal / names.length));
    const prices = this.roundToTotal(raw, subtotal);

    const fallbackStaffName = (tx.staffNames && tx.staffNames[0]) ? tx.staffNames[0] : 'ไม่ระบุ';
    const matchedStaff = this.state.staff.find(st => st.name === fallbackStaffName);
    const fallbackStaffId = matchedStaff ? matchedStaff.id : 'unknown';

    // ราคาหลังหักส่วนลด — ต้องมีติดไปด้วย ไม่งั้นรายงานกับสรุปที่ส่งขึ้นชีตจะใช้ราคาเต็ม
    // แล้วยอดขายกับค่าคอมจะโป่งเกินจริงในบิลที่มีส่วนลด
    const nets = this.distributeDiscount(prices, subtotal, Math.min(Math.max(0, Number(tx.discount) || 0), subtotal));

    return names.map((sName, i) => {
      const svc = matched[i];
      const commVal  = svc ? (Number(svc.commission) || 0) : 10;
      const commType = svc ? (svc.commissionType || 'percent') : 'percent';
      const netPrice = nets[i];
      return {
        name: sName,
        price: prices[i],
        netPrice: netPrice,
        staffId: fallbackStaffId,
        staffName: fallbackStaffName,
        commission: commVal,
        commissionType: commType,
        commissionAmount: commType === 'fixed' ? commVal : Math.round(netPrice * commVal) / 100,
        category: svc ? (svc.category || '') : '',
        // บิลรุ่นเก่าออกก่อนมีระบบ VAT — ห้ามติ๊ก vatable ย้อนหลังเด็ดขาด
        // ไม่งั้นแก้ชื่อลูกค้าในบิลปีที่แล้วแล้วระบบจะยัด VAT เข้าไป ทำให้ยอดที่ยื่นสรรพากรไม่ตรง
        vatable: false
      };
    });
  }

  // ── คิดยอดของบิลที่กำลังแก้ไข ────────────────────────────────────────────
  // ใช้ตัวเดียวกันทั้งตอนพรีวิวสด ๆ และตอนกดบันทึก ตัวเลขบนจอกับที่บันทึกจริงจึงตรงกันเสมอ
  computeEditTotals(tx, details, rawDiscount) {
    const list = Array.isArray(details) ? details : [];
    const subtotal = Math.round(list.reduce((s, d) => s + (Number(d.price) || 0), 0) * 100) / 100;
    const discount = Math.min(Math.max(0, Number(rawDiscount) || 0), subtotal); // clamp กันพิมพ์ติดลบ/เกินยอด
    const nets = this.distributeDiscount(list.map(d => Number(d.price) || 0), subtotal, discount);

    if (this.isLegacyBill(tx)) {
      // บิลรุ่นเก่า: คิดแบบเดิมเป๊ะ ๆ (ยอด = รวม − ส่วนลด) ไม่ปัดขึ้นเต็มบาท ไม่มี VAT
      const plain = Math.round(Math.max(0, subtotal - discount) * 100) / 100;
      return {
        subtotal, discount, nets, legacy: true,
        totals: { vatRate: 0, nonVatBase: plain, vatableBase: 0, vatAmount: 0, rounding: 0, total: plain }
      };
    }

    // บิลรุ่นใหม่: คิด VAT ด้วย "อัตราและธง vatable ที่ล็อกไว้ในบิลใบนี้" ไม่ใช่ค่าตั้งค่าปัจจุบัน
    return {
      subtotal, discount, nets, legacy: false,
      totals: this.computeTotalsAtRate(
        list.map((d, i) => ({ netPrice: nets[i], vatable: !!d.vatable })),
        Number(tx.vatRate) || 0
      )
    };
  }

  // เปิดโมเดลแก้ไขรายการขายย้อนหลัง
  openTransactionEdit(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    // สร้างร่างแยกจากบิลจริง — ตั้งแต่จุดนี้จนถึงกดบันทึก ห้ามแตะ tx เลย
    const draftDetails = this.buildEditableDetails(tx);
    this._editTxDraft = { txId: tx.id, details: draftDetails };

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-id-display').value = tx.id;
    document.getElementById('edit-tx-customer').value = tx.customerName || '';
    document.getElementById('edit-tx-payment').value = tx.paymentMethod || 'cash';
    document.getElementById('edit-tx-discount').value = Number(tx.discount) || 0;
    document.getElementById('edit-tx-total').value = `฿${(Number(tx.total) || 0).toLocaleString('th-TH')}`;

    const servicesContainer = document.getElementById('edit-tx-services-list');
    const money2 = v => (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    servicesContainer.innerHTML = draftDetails.map((item, idx) => {
      // พนักงานคนเดิมอาจถูกลบออกจากระบบไปแล้ว — ต้องมีตัวเลือก "คงไว้ตามเดิม" ให้เลือกอยู่
      // ไม่งั้น dropdown จะเด้งไปเลือกพนักงานคนแรกให้เอง แล้วพอกดบันทึก ค่าคอมของบิลนี้
      // จะย้ายไปเข้ากระเป๋าคนอื่นโดยไม่มีใครสั่ง
      const staffExists = this.state.staff.some(st => st.id === item.staffId);
      const keepOption = staffExists ? '' :
        `<option value="__keep__" selected>${escapeHtml(item.staffName || 'ไม่ระบุ')} (ไม่อยู่ในระบบแล้ว)</option>`;
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary);">${escapeHtml(item.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">฿${money2(item.price)}</div>
          </div>
          <div style="width: 150px;">
            <select class="form-input edit-tx-service-staff-select" data-index="${idx}" style="font-size: 0.85rem; padding: 4px 8px; height: 34px; background: var(--bg-surface-solid); border-radius: var(--border-radius-sm);">
              ${keepOption}
              ${this.state.staff.map(st => `<option value="${escapeHtml(st.id)}" ${st.id === item.staffId ? 'selected' : ''}>${escapeHtml(st.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    }).join('');

    this.openModal('modal-edit-transaction');
  }

  // คำนวณยอดรวมสุทธิระหว่างแก้ไขแบบเรียลไทม์ (อ่านจาก "ร่าง" ไม่ใช่บิลจริง)
  recalculateEditTxTotal() {
    const draft = this._editTxDraft;
    if (!draft) return;
    const tx = this.state.transactions.find(t => t.id === draft.txId);
    if (!tx) return;

    // ต้องโชว์ยอดให้ตรงกับที่จะบันทึกจริง (รวม VAT + ปัดเศษ ถ้าบิลใบนี้มี)
    // ไม่งั้นเจ้าของร้านเห็น 380 ในหน้าต่างแก้ไข แต่กดบันทึกแล้วได้ 386
    const rawDiscount = parseFloat(document.getElementById('edit-tx-discount').value) || 0;
    const calc = this.computeEditTotals(tx, draft.details, rawDiscount);

    document.getElementById('edit-tx-total').value = `฿${calc.totals.total.toLocaleString('th-TH')}`;
  }

  // บันทึกการแก้ไขธุรกรรมย้อนหลัง
  // ⚠️ จุดเดียวในระบบที่ได้รับอนุญาตให้เขียนทับข้อมูลบิลที่ออกไปแล้ว
  // ทุกอย่างก่อนหน้านี้ทำงานบน "ร่าง" (this._editTxDraft) เท่านั้น
  async saveTransactionEdit() {
    if (this.currentRole !== 'owner') {
      this.showToast('การแก้ไขบิลทำได้เฉพาะเจ้าของร้าน', 'warning');
      return;
    }
    const draft = this._editTxDraft;
    const txId = document.getElementById('edit-tx-id').value;
    // ร่างต้องตรงกับบิลที่เปิดอยู่ — กันกรณีหน้าต่างค้างจากบิลใบก่อน
    if (!draft || draft.txId !== txId) {
      this.showToast('หน้าต่างแก้ไขไม่ตรงกับบิลที่เลือก — ปิดแล้วเปิดใหม่อีกครั้ง', 'warning', 5000);
      return;
    }
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) {
      this.showToast('ไม่พบบิลใบนี้แล้ว (อาจถูกยกเลิกไปก่อนหน้า)', 'warning');
      this.closeModal('modal-edit-transaction');
      return;
    }

    // ── 1. อัปเดตพนักงานลง "ร่าง" ก่อน ──────────────────────────────────
    document.querySelectorAll('.edit-tx-service-staff-select').forEach(select => {
      const idx = parseInt(select.getAttribute('data-index'), 10);
      if (!draft.details[idx]) return;
      if (select.value === '__keep__') return;   // พนักงานเดิมถูกลบไปแล้ว — คงชื่อเดิมไว้ ไม่โยนค่าคอมให้คนอื่น
      const staffMember = this.state.staff.find(st => st.id === select.value);
      if (staffMember) {
        draft.details[idx].staffId = staffMember.id;
        draft.details[idx].staffName = staffMember.name;
      }
    });

    // ── 2. คิดยอดใหม่จากร่าง (ตัวคำนวณเดียวกับที่ใช้พรีวิว) ────────────────
    const rawDiscount = parseFloat(document.getElementById('edit-tx-discount').value) || 0;
    const calc = this.computeEditTotals(tx, draft.details, rawDiscount);

    // คำนวณราคาหลังหักส่วนลด + ค่าคอมใหม่ต่อรายการ (สูตรเดียวกับตอนขาย รวมเกลี่ยเศษสตางค์)
    const finalDetails = draft.details.map((d, i) => {
      const commType = d.commissionType || 'percent';
      const commVal  = Number(d.commission) || 0;
      const netPrice = calc.nets[i];
      return {
        ...d,
        netPrice: netPrice,
        // ค่าคอมคิดจาก netPrice ซึ่งเป็นยอด "ก่อน VAT" เสมอ
        commissionAmount: commType === 'fixed' ? commVal : Math.round(netPrice * commVal) / 100
      };
    });

    // ── 3. เก็บค่าเดิมไว้ย้อนกลับ ถ้าเขียนลงเครื่องไม่สำเร็จ ────────────────
    // การแก้บิลกระทบยอดขาย/ค่าคอม/ชีต ถ้า IndexedDB เขียนพลาดแล้วปล่อยค่าใหม่ค้างในหน่วยความจำ
    // หน้าจอจะโชว์ยอดใหม่ทั้งที่ในเครื่องยังเป็นยอดเก่า — คนละชุดกันแบบไม่มีใครรู้
    // ทะเบียนการแก้บิลย้อนกลับได้ด้วย — slice พอ เพราะเราแค่ push ต่อท้าย ไม่ได้แก้ของเดิม
    const prevEditLog = Array.isArray(this.state.editLog) ? this.state.editLog.slice() : [];
    const rollback = this.cloneForRollback({
      customerName: tx.customerName, paymentMethod: tx.paymentMethod,
      details: tx.details, staffNames: tx.staffNames,
      subtotal: tx.subtotal, discount: tx.discount,
      nonVatBase: tx.nonVatBase, vatableBase: tx.vatableBase,
      vatAmount: tx.vatAmount, rounding: tx.rounding, vatRate: tx.vatRate,
      total: tx.total, rev: tx.rev, syncStatus: tx.syncStatus,
      cloudOutbox: this.state.cloudOutbox || []
    });

    try {
      // ── 4. เขียนลงบิลจริง (ถึงบรรทัดนี้เท่านั้น) ────────────────────────
      tx.customerName  = document.getElementById('edit-tx-customer').value.trim() || 'ลูกค้าทั่วไป';
      tx.paymentMethod = document.getElementById('edit-tx-payment').value;
      tx.details       = finalDetails;
      tx.staffNames    = [...new Set(finalDetails.map(d => d.staffName))];
      tx.subtotal      = calc.subtotal;
      tx.discount      = calc.discount;
      tx.total         = calc.totals.total;
      if (!calc.legacy) {
        // บิลรุ่นใหม่: อัปเดต 4 ช่อง VAT ให้บวกกันแล้วเท่ายอดรวมเสมอ
        tx.nonVatBase  = calc.totals.nonVatBase;
        tx.vatableBase = calc.totals.vatableBase;
        tx.vatAmount   = calc.totals.vatAmount;
        tx.rounding    = calc.totals.rounding;
      }
      // บิลรุ่นเก่า: ไม่เติมฟิลด์ VAT เข้าไป — ปล่อยให้ยังเป็นบิลรุ่นเก่าเหมือนเดิม
      tx.rev = (tx.rev || 0) + 1; // เวอร์ชันการแก้ไข — ให้รอบ sync ที่กำลังส่งข้อมูลเก่าอยู่รู้ว่าห้าม mark synced ทับ
      tx.syncStatus = 'pending';  // ตั้งค่าเป็น pending เพื่อให้ระบบซิงก์ใหม่

      // ── ร่องรอยว่าใครแก้บิลใบนี้ เมื่อไหร่ จากเท่าไรเป็นเท่าไร ──────────────
      // ทุกทางที่ทำให้เงินหายจากระบบมีชื่อคนทำครบแล้ว (ปิดกะ closedBy · ยกเลิกบิล voidLog.by ·
      // เพิ่มค่าใช้จ่าย expense.by · ลบค่าใช้จ่าย expenseLog) เหลือทางนี้ทางเดียวที่ยังไม่มี
      // และเป็นทางที่ "ของเดิมหายไปเลย" ไม่เหมือนการยกเลิกที่ยังเหลือยอดเดิมใน voidLog
      //
      // เก็บเฉพาะค่าที่เปลี่ยน ไม่เก็บทั้งบิล — ไฟล์สำรองจะได้ไม่บวมเป็นสองเท่า
      // และบันทึกเฉพาะตอนที่มีอะไรเปลี่ยนจริง กดเปิดดูแล้วกดบันทึกเฉย ๆ ไม่ต้องมีแถว
      const beforeSnap = {
        subtotal: rollback.subtotal, discount: rollback.discount, total: rollback.total,
        customer: rollback.customerName || '', payment: rollback.paymentMethod || '',
        staffNames: Array.isArray(rollback.staffNames) ? rollback.staffNames.join(', ') : ''
      };
      const afterSnap = {
        subtotal: tx.subtotal, discount: tx.discount, total: tx.total,
        customer: tx.customerName || '', payment: tx.paymentMethod || '',
        staffNames: Array.isArray(tx.staffNames) ? tx.staffNames.join(', ') : ''
      };
      const changedFields = Object.keys(afterSnap).filter(k => beforeSnap[k] !== afterSnap[k]);
      if (changedFields.length) {
        if (!Array.isArray(this.state.editLog)) this.state.editLog = [];
        this.state.editLog.push({
          billId: tx.id,
          date: Date.now(),                       // เวลาที่กดแก้ (คนละเรื่องกับวันของบิล)
          billDate: tx.date,                      // วันของบิล — ใช้ย้อนกลับไปหางวดที่กระทบ
          by: this.currentUser ? this.currentUser.name : '',
          fields: changedFields,
          before: beforeSnap,
          after: afterSnap
        });
      }

      // รีเฟรชชีตสรุปวัน/เดือนของวันที่บิลนั้น (ผ่าน outbox — retry เองถ้าออฟไลน์) ให้ KPI บนชีตตรงกับบิลที่แก้
      this.enqueueSummaryRefresh(tx.date);

      await this.saveStateOrThrow('การแก้ไขบิล');
    } catch (saveErr) {
      Object.assign(tx, {
        customerName: rollback.customerName, paymentMethod: rollback.paymentMethod,
        staffNames: rollback.staffNames, subtotal: rollback.subtotal, discount: rollback.discount,
        total: rollback.total, rev: rollback.rev, syncStatus: rollback.syncStatus
      });
      // details/ฟิลด์ VAT อาจไม่เคยมีมาก่อน — ต้องลบทิ้ง ไม่ใช่ตั้งเป็น undefined ค้างไว้
      if (rollback.details === undefined) delete tx.details; else tx.details = rollback.details;
      ['nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'vatRate'].forEach(k => {
        if (rollback[k] === undefined) delete tx[k]; else tx[k] = rollback[k];
      });
      this.state.cloudOutbox = rollback.cloudOutbox;
      this.state.editLog = prevEditLog;   // ไม่งั้นจะเหลือแถว "มีคนแก้บิล" ของการแก้ที่ไม่เคยถูกบันทึก
      console.error('saveTransactionEdit failed:', saveErr);
      this.showToast('บันทึกการแก้ไขไม่สำเร็จ — ระบบคืนค่าเดิมของบิลแล้ว: ' + (saveErr.message || saveErr), 'error', 7000);
      return;
    }

    this.closeModal('modal-edit-transaction'); // เคลียร์ร่างให้ด้วยในตัว
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

      // ⚠️ เก็บสถานะเดิมไว้ก่อนแตะอะไรทั้งสิ้น — การยกเลิกบิลเปลี่ยน 4 อย่างพร้อมกัน
      // (รายการบิล · ประวัติ void · จำนวนครั้งของลูกค้า · คิวงานคลาวด์)
      //
      // ถ้าเขียนลงเครื่องไม่สำเร็จแล้วปล่อยค่าใหม่ค้างไว้ จะเกิดเคสที่แย่ที่สุดของระบบนี้:
      // บิลหายจากหน้าจอ → outbox สั่งลบแถวในชีตจริง → แต่ในเครื่องยังเป็นข้อมูลเก่า
      // เปิดแอปใหม่บิลกลับมาบน iPad แต่หายจากชีตถาวร เพราะ syncStatus ยังเป็น 'synced'
      // จึงไม่มีวันถูกส่งขึ้นชีตใหม่อีกเลย และไม่มีอะไรเตือนว่าสองที่ไม่ตรงกัน
      const prevTransactions = this.state.transactions;   // filter สร้างอาเรย์ใหม่ ตัวเดิมจึงยังครบทุกใบ
      const prevVoidLog = Array.isArray(this.state.voidLog) ? this.state.voidLog.slice() : this.state.voidLog;
      // slice ก็พอ ไม่ต้อง deep clone — ตรงนี้แค่ย้อน "การ push" ไม่มีใครไปแก้ข้างในรายการเดิม
      const prevOutbox = Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox.slice() : this.state.cloudOutbox;
      let custBefore = null;

      // คืนค่าจำนวนครั้งที่มาใช้บริการของลูกค้า (ถ้าบิลผูกกับลูกค้าที่ลงทะเบียนไว้)
      if (tx.customerId) {
        const cust = this.state.customers.find(c => c.id === tx.customerId);
        if (cust && cust.visitCount > 0) {
          custBefore = { ref: cust, visitCount: cust.visitCount, tier: cust.tier };
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
        // ⚠️ date ข้างบนคือ "เวลาที่กดยกเลิก" ไม่ใช่วันของบิล — สองอย่างนี้คนละวันได้
        // ต้องเก็บวัน/เดือนทำการเดิมของบิลไว้ด้วย ไม่งั้นย้อนกลับไปหาแท็บเดือนที่บิลอยู่ไม่ได้
        billDate: tx.date,
        billMonthKey: this.getBusinessMonthKey(tx.date),
        by: this.currentUser ? this.currentUser.name : '',
        amount: tx.total, customer: tx.customerName || '', services: tx.services || []
      };
      if (!Array.isArray(this.state.voidLog)) this.state.voidLog = [];
      this.state.voidLog.push(voidRecord);

      // คิวงานคลาวด์ของการ void (ลบแถวในชีต + รีเฟรชสรุป + Telegram) ลง outbox "ก่อน" save
      // → การันตีส่งแม้ void ตอนออฟไลน์ แล้ว retry เองเมื่อเน็ตกลับ (กันบิลที่ยกเลิกค้างในชีต)
      this.enqueueVoidCloudOps(tx, voidRecord);

      // ต้องบันทึกลงเครื่องให้สำเร็จก่อนเท่านั้น จึงจะยอมให้ flushCloudOutbox ไปแตะชีตได้
      try {
        await this.saveStateOrThrow('การยกเลิกบิล');
      } catch (saveErr) {
        this.state.transactions = prevTransactions;
        this.state.voidLog      = prevVoidLog;
        this.state.cloudOutbox  = prevOutbox;
        if (custBefore) {
          custBefore.ref.visitCount = custBefore.visitCount;
          custBefore.ref.tier       = custBefore.tier;
        }
        this.clearDateKeyCache();
        console.error('voidTransaction failed:', saveErr);
        this.filterReports(); // วาดตารางใหม่ให้เห็นว่าบิลกลับมาแล้ว
        this.showToast(
          'ยกเลิกบิลไม่สำเร็จ — ระบบคืนบิลกลับมาให้แล้ว ยังไม่มีอะไรถูกลบทั้งในเครื่องและในชีต: ' +
          (saveErr.message || saveErr), 'error', 8000);
        return;
      }

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
        optionsHtml += `<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (${escapeHtml(st.role)})</option>`;
      });
      staffFilter.innerHTML = optionsHtml;
      staffFilter.value = currentSelected;
    }
    
    this.filterReports();
  }

  // ─── ส่งสรุปไป Sheets แบบ manual จากหน้ารายงาน ──────────────────────────
  async syncSummaryNow() {
    // ปุ่มนี้เรียก syncDailySummary/syncMonthlySummary ซึ่งมีด่านในตัวแล้ว
    // แต่เช็คตรงนี้ด้วยเพื่อให้ผู้ใช้ได้ข้อความอธิบาย แทนที่จะกดแล้วเงียบ
    if (!this.canWriteData('ส่งสรุปขึ้นชีต')) return;
    if (!this.hasCloudSyncConfig()) {
      this.showToast(this.getCloudSetupMessage(), 'info');
      return;
    }

    const type    = this.state.selectedReportType; // 'daily' | 'monthly'
    const dateVal = document.getElementById('report-date-input')?.value;
    const monVal  = document.getElementById('report-month-input')?.value;

    // ปุ่มนี้เป็นทางเข้าอิสระ ต้องเข้าคิวเดียวกับงานอัตโนมัติ ไม่งั้นคำขอเก่าที่ค้าง
    // จะมาถึงทีหลังแล้วเขียนทับสรุปที่เพิ่งส่งไปด้วยตัวเลขเก่า
    return this.runCloudTask(async () => {
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
    });
  }

  async saveShopSettings() {
    // การตั้งค่าบางส่วน (โดยเฉพาะ URL/token) เป็นเส้นทางกู้ข้อมูลและซิงก์ยอดขาย
    // ถ้า IndexedDB เขียนไม่สำเร็จ ต้องคืนค่าเดิมในหน่วยความจำด้วย ไม่อย่างนั้นผู้ใช้จะเข้าใจว่าบันทึกแล้ว
    const previous = {
      shopPromptPayId: this.shopPromptPayId,
      shopName: this.shopName,
      shopTagline: this.shopTagline,
      shopAddress: this.shopAddress,
      shopPhone: this.shopPhone,
      ownerPin: this.ownerPin,
      googleSheetsUrl: this.googleSheetsUrl,
      googleSheetsApiToken: this.googleSheetsApiToken,
      telegramToken: this.telegramToken,
      telegramChatId: this.telegramChatId
    };
    const promptPayInput = document.getElementById('shop-promptpay-id');
    const pinInput = document.getElementById('shop-owner-pin');
    const sheetsUrlInput = document.getElementById('shop-sheets-sync-url');
    const sheetsApiTokenInput = document.getElementById('shop-sheets-api-token');
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
    }
    if (sheetsApiTokenInput) {
      const token = sheetsApiTokenInput.value.trim();
      if (token === '' || this.isValidCloudApiToken(token)) {
        this.googleSheetsApiToken = token;
      } else {
        this.showToast(`รหัสเชื่อมต่อ Apps Script ต้องยาวอย่างน้อย ${CLOUD_API_TOKEN_MIN_LENGTH} ตัว และใช้ได้เฉพาะ a-z, A-Z, 0-9, _ หรือ -`, 'warning', 6000);
        sheetsApiTokenInput.value = this.googleSheetsApiToken || '';
      }
    }
    if (telegramTokenInput) {
      this.telegramToken = telegramTokenInput.value.trim();
    }
    if (telegramChatIdInput) {
      this.telegramChatId = telegramChatIdInput.value.trim();
    }

    try {
      await this.saveStateOrThrow('การตั้งค่า');
    } catch (err) {
      Object.assign(this, previous);
      // คืนค่าที่เห็นบนจอให้ตรงกับค่าที่บันทึกอยู่จริง ไม่ปล่อยให้หน้าจอกับฐานข้อมูลคนละชุด
      if (shopNameInput) shopNameInput.value = previous.shopName || 'Erotica Barber & Massage';
      if (shopTaglineInput) shopTaglineInput.value = previous.shopTagline || 'BARBER & MASSAGE';
      if (shopAddressInput) shopAddressInput.value = previous.shopAddress || '';
      if (shopPhoneInput) shopPhoneInput.value = previous.shopPhone || '';
      if (promptPayInput) promptPayInput.value = previous.shopPromptPayId || '';
      if (sheetsUrlInput) sheetsUrlInput.value = previous.googleSheetsUrl || '';
      if (sheetsApiTokenInput) sheetsApiTokenInput.value = previous.googleSheetsApiToken || '';
      if (telegramTokenInput) telegramTokenInput.value = previous.telegramToken || '';
      if (telegramChatIdInput) telegramChatIdInput.value = previous.telegramChatId || '';
      this.checkSyncStatus();
      this.updateUserRoleUI();
      this.applyShopName();
      this.showToast('บันทึกการตั้งค่าไม่สำเร็จ — ระบบคืนค่าเดิมแล้ว', 'error');
      return false;
    }
    this.checkSyncStatus();
    // ถ้าเพิ่งวาง token หลังอัปเดต ให้ดันบิล/สรุปที่ค้างอยู่ทันที ไม่ต้องรอเปิดแอปใหม่
    this.resumePendingCloudWork();
    this.updateUserRoleUI();
    this.applyShopName();
    return true;
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

  // ── นาฬิกาจับเวลาไม่ใช้งาน (เฉพาะเจ้าของร้าน) ───────────────────────────
  // ใช้ interval ตัวเดียวเช็คเป็นระยะ แทนการตั้ง timer ใหม่ทุกครั้งที่แตะจอ
  // (แตะจอทีนึงตั้ง timer ใหม่ที = ตอนกดขายรัว ๆ จะสร้าง-ทิ้ง timer เป็นร้อยครั้งต่อนาที)
  startIdleWatch() {
    if (this._idleInterval) return;
    const bump = () => this.markActivity();
    // capture:true เพื่อให้จับได้แม้อีเวนต์ถูกหยุดกลางทาง · passive:true เพื่อไม่หน่วงการเลื่อนจอ
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev =>
      document.addEventListener(ev, bump, { passive: true, capture: true }));
    // กลับมาที่แอปหลังสลับไปทำอย่างอื่น: ต้องเช็คทันที ไม่ใช่รอ interval รอบถัดไป
    // (เบราว์เซอร์หน่วง timer ของแท็บที่ไม่ได้อยู่หน้าจอ จะเช็คช้ากว่าที่ควร)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.checkIdleTimeout();
    });
    this._idleInterval = setInterval(() => this.checkIdleTimeout(), IDLE_CHECK_INTERVAL_MS);
  }

  markActivity() {
    this._lastActivityTs = Date.now();
    if (!this.currentRole) return;
    // ต่ออายุเซสชันที่เก็บไว้ด้วย ไม่งั้นเจ้าของทำงานยาว ๆ แล้วแอปรีเฟรช (SW อัปเดต)
    // จะเด้งหน้าล็อกอินทั้งที่เพิ่งแตะจอไปเมื่อกี้
    if (Date.now() - this._lastSessionSaveTs > 30000) {
      this._lastSessionSaveTs = Date.now();
      this.saveSession();
    }
  }

  checkIdleTimeout() {
    if (this.currentRole !== 'owner') return;   // พนักงาน/ผู้จัดการใช้ TTL 20 ชม. ตามเดิม
    // ห้ามเตะออกกลางการกู้ข้อมูล — งานนี้ใช้เวลานาน (ดาวน์โหลดไฟล์ทั้งร้าน) และเขียนทับข้อมูล
    // ถ้าหลุดกลางคันแล้วหน้าต่างถูกปิดไป เจ้าของจะไม่รู้ว่ากู้สำเร็จหรือค้างอยู่ตรงไหน
    // เลื่อนนาฬิกาออกไปแทน พอกู้เสร็จค่อยเริ่มนับใหม่
    if (this.restoreBusy) { this._lastActivityTs = Date.now(); return; }
    if (Date.now() - this._lastActivityTs < OWNER_IDLE_TIMEOUT_MS) return;
    const who = this.currentUser ? this.currentUser.id : null;
    this.logout(
      `ไม่มีการใช้งานเกิน ${OWNER_IDLE_TIMEOUT_MINUTES} นาที — ออกจากระบบเจ้าของร้านอัตโนมัติ กรุณาใส่ PIN ใหม่`,
      who
    );
  }

  // แสดงหน้าเข้าสู่ระบบ (ล็อกเอาต์สถานะปัจจุบัน)
  // preselectUid: เลือกผู้ใช้คนเดิมไว้ให้เลย — คนที่เพิ่งโดนเตะออกจะได้แค่พิมพ์ PIN ต่อ ไม่ต้องเลือกใหม่
  requireLogin(preselectUid) {
    this.currentRole = null;
    this.currentUser = null;
    this.loginSelectedId = null;
    // ปิดหน้าต่างอื่นที่ค้างอยู่ก่อนเสมอ — ตั้งแต่มี auto-logout 5 นาที การเตะออก
    // เกิดขึ้นได้ทุกวินาที รวมถึงตอนที่หน้าต่างชำระเงิน/นับเงินปิดกะเปิดค้างอยู่
    // ถ้าปล่อยค้างไว้ ผู้ใช้คนถัดไปจะเห็นงานที่ค้างของคนก่อน และกล่องล็อกอินจะไปซ้อนใต้หน้าต่างนั้น
    // (มี z-index กันไว้อีกชั้นใน CSS แต่ปิดทิ้งตรงนี้ตรงกว่า — งานที่ค้างไม่ควรข้ามผู้ใช้)
    document.querySelectorAll('.modal-overlay.active').forEach(el => {
      if (el.id !== 'modal-login') this.closeModal(el.id);
    });
    this.updateUserRoleUI();
    this.renderLoginOptions();
    const pinEl = document.getElementById('login-pin-input');
    if (pinEl) pinEl.value = '';
    this.openModal('modal-login');
    if (preselectUid) this.selectLoginUser(preselectUid);
  }

  // สร้างรายชื่อผู้ใช้ให้เลือก (เจ้าของร้าน + พนักงานที่ตั้ง PIN ไว้)
  renderLoginOptions() {
    const container = document.getElementById('login-user-list');
    if (!container) return;
    const badge = (lvl) => `<span class="login-role-badge ${escapeHtml(lvl)}">${escapeHtml(this.roleLabel(lvl))}</span>`;
    let html = `<button type="button" class="login-user-btn" data-uid="__owner__" onclick="app.selectLoginUser('__owner__')">
        <span><i class="fa-solid fa-crown"></i> เจ้าของร้าน</span> ${badge('owner')}
      </button>`;
    (this.state.staff || []).filter(s => s.pin).forEach(s => {
      html += `<button type="button" class="login-user-btn" data-uid="${escapeHtml(s.id)}" onclick="app.selectLoginUser('${safeId(s.id)}')">
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
    // เริ่มนับเวลาไม่ใช้งานใหม่ตั้งแต่วินาทีที่ล็อกอินสำเร็จ
    this._lastActivityTs = Date.now();
    this._lastSessionSaveTs = Date.now();
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
      // เขียนลงฐานข้อมูลตรง ๆ ไม่ผ่าน saveState() ด่านหน้าต่างหลักจึงไม่ครอบ ต้องกันเอง
      // ไม่งั้นหน้าต่างรอง (ที่ล็อกอินเป็นคนละคน) จะเขียนทับเซสชันของหน้าต่างหลักได้
      if (this.isReadOnlyWindow) return;
      db.state.put({ key: 'session', value: { uid: this.currentUser.id, name: this.currentUser.name, role: this.currentRole, ts: Date.now() } });
    } catch (e) { console.warn('saveSession failed', e); }
  }

  async tryRestoreSession() {
    try {
      const rec = await db.state.get('session');
      const sess = rec ? rec.value : null;
      if (!sess || !sess.ts) return false;
      // อายุเซสชันขึ้นกับสิทธิ์: เจ้าของร้าน 5 นาทีนับจากแตะจอครั้งสุดท้าย (markActivity ต่ออายุ ts ให้)
      // ที่เหลือ 20 ชม. ตามเดิม — ไม่งั้นพนักงานจะโดนถาม PIN ทุกครั้งที่แอปอัปเดตกลางกะ
      const ttlMs = (sess.role === 'owner')
        ? OWNER_IDLE_TIMEOUT_MS
        : SESSION_TTL_HOURS * 3600 * 1000;
      if (Date.now() - sess.ts > ttlMs) { await db.state.delete('session'); return false; }
      if (sess.uid === '__owner__') {
        this.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
        this.currentRole = 'owner';
      } else {
        const st = (this.state.staff || []).find(s => s.id === sess.uid);
        if (!st || !st.pin) { await db.state.delete('session'); return false; }
        this.currentUser = { id: st.id, name: st.name };
        this.currentRole = st.accessLevel || 'staff';
      }
      // กู้เซสชันสำเร็จ = ถือว่าเพิ่งมีการใช้งาน เริ่มนับเวลาไม่ใช้งานใหม่
      this._lastActivityTs = Date.now();
      this._lastSessionSaveTs = Date.now();
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
  logout(reason, preselectUid) {
    try { db.state.delete('session'); } catch (e) {}
    this.requireLogin(preselectUid);
    this.vibrateDevice(50);
    this.showToast(reason || 'ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่', reason ? 'warning' : 'info', reason ? 8000 : 3000);
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

    // 5.1 การ์ดตั้งค่า VAT — เฉพาะ owner (กระทบยอดเงินและภาษี พนักงานไม่ควรแตะ)
    const vatCard = document.getElementById('settings-vat-card');
    if (vatCard) vatCard.style.display = isOwner ? 'block' : 'none';

    // 6. ซ่อนเมนูตามสิทธิ์: ตั้งค่า=owner เท่านั้น, รายงาน=manager ขึ้นไป
    document.querySelectorAll('.nav-item[data-screen="settings"], .bottom-nav-item[data-screen="settings"]')
      .forEach(el => el.style.display = isOwner ? '' : 'none');
    document.querySelectorAll('.nav-item[data-screen="reports"], .bottom-nav-item[data-screen="reports"]')
      .forEach(el => el.style.display = canReports ? '' : 'none');

    // 6.1 แท็บ "รายเดือน" ในหน้ารายงาน — เฉพาะเจ้าของร้าน
    //     ผู้จัดการเห็นเมนูรายงานได้ แต่ดูได้เฉพาะสรุปรายวัน
    const monthlyTab = document.getElementById('report-tab-monthly');
    if (monthlyTab) monthlyTab.style.display = isOwner ? '' : 'none';
    // ค่าที่ค้างอยู่อาจเป็น "รายเดือน" จากตอนที่เจ้าของใช้เครื่องอยู่ — สลับกลับให้ทันที
    // ต้องเรียก selectReportType เพราะมันสลับช่องเลือกวัน/เดือนบนหน้าจอให้ด้วย ไม่ใช่แค่เปลี่ยนค่า
    if (!isOwner && this.state.selectedReportType === 'monthly') {
      this.selectReportType('daily');
    }

    // 7. ปุ่มปิดร้าน/สรุปยอด — เฉพาะ manager ขึ้นไป (staff เปิดร้านได้ แต่ปิดไม่ได้)
    const closeStoreBtn = document.getElementById('btn-close-store');
    if (closeStoreBtn) closeStoreBtn.style.display = (role === 'owner' || role === 'manager') ? 'flex' : 'none';
  }

  // ส่งออกข้อมูลเป็นไฟล์ JSON — คืน true เมื่อสั่งดาวน์โหลดได้สำเร็จ
  //
  // ⚠️ เดิมยัดข้อมูลทั้งก้อนลงใน "ลิงก์" อันเดียว (data: URL) ซึ่งเบราว์เซอร์จำกัดความยาวไว้ราว 2 MB
  // พอบิลสะสมเกินนั้น (ประมาณ 1 ปี) ปุ่มจะกดแล้วเงียบ ไม่มีไฟล์ ไม่มี error ให้เห็น
  // ที่อันตรายกว่าคือหน้ากู้ข้อมูลเรียกฟังก์ชันนี้เป็น "สำเนาก่อนกู้" — เงียบ = ไม่มีอะไรให้ย้อนกลับ
  // Blob ไม่มีเพดานแบบนั้น และถ้าสร้างไม่สำเร็จจะโยน error ออกมาให้จับได้จริง
  exportData() {
    if (!this.requireOwnerForDataAction('ส่งออกไฟล์สำรอง')) return false;
    try {
      const data = this.buildBackupPayload();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erotica_pos_backup_${this.getLocalISODate(new Date())}.json`;
      a.style.display = 'none';
      document.body.appendChild(a); // Safari/Firefox ต้องให้ปุ่มอยู่ในหน้าจริงก่อนถึงจะกดได้
      a.click();
      // อย่าเพิ่งคืนหน่วยความจำทันที — บาง Safari ยังอ่านไฟล์ไม่เสร็จแล้วดาวน์โหลดจะพัง
      setTimeout(() => {
        try { a.remove(); URL.revokeObjectURL(url); } catch (e) { /* ปล่อยได้ */ }
      }, 60000);
      this.vibrateDevice(50);
      return true;
    } catch (err) {
      console.error('export failed', err);
      this.showToast('ส่งออกไฟล์สำรองไม่สำเร็จ: ' + (err.message || err), 'error', 7000);
      return false;
    }
  }

  // ── สำเนา "ก่อนกู้ข้อมูล" ที่เก็บไว้ในเครื่อง ──────────────────────────────
  // ทำไมไม่พึ่งไฟล์ดาวน์โหลดอย่างเดียว: บน iPad ที่ติดตั้งเป็นแอป การดาวน์โหลดอาจถูกบล็อกเงียบ ๆ
  // และเราไม่มีทางรู้ว่าไฟล์ลงเครื่องจริงหรือเปล่า ถ้าเลือกไฟล์กู้ผิดใบ = ยอดของวันนี้หายโดยไม่มีทางกลับ
  // สำเนานี้เขียนลงฐานข้อมูลของแอปโดยตรง จึงยืนยันผลได้ (สำเร็จ = สำเร็จจริง)
  // เขียน db.state.put() ตรง — ต้องมีด่านเดียวกัน ไม่งั้นหน้าต่างรองเอา snapshot เก่าไปทับสำเนาที่ดี
  async savePreRestoreSnapshot() {
    if (!this.canWriteData('เก็บสำเนาก่อนกู้ข้อมูล')) {
      throw new Error('หน้าต่างนี้เปิดซ้ำอยู่ จึงเก็บสำเนาก่อนกู้ไม่ได้ — ให้ใช้หน้าต่างเดิม');
    }
    const snap = { savedAt: Date.now(), appVersion: APP_VERSION, data: this.buildBackupPayload() };
    await db.state.put({ key: 'preRestoreSnapshot', value: snap });
    return snap;
  }

  // อ่านสำเนาก่อนกู้ (ถ้ามี) — คืน null เมื่อไม่มีหรือเสียหาย
  async readPreRestoreSnapshot() {
    try {
      const rec = await db.state.get('preRestoreSnapshot');
      const snap = rec ? rec.value : null;
      // ไม่ตรวจ ID ที่นี่ — นี่คือข้อมูลที่แอปเขียนเอง ไม่ใช่ไฟล์จากภายนอก (ดูเหตุผลที่ isValidBackupObject)
      if (!snap || !snap.data || !this.isValidBackupObject(snap.data, { checkIds: false })) return null;
      return snap;
    } catch (e) {
      console.warn('read pre-restore snapshot failed', e);
      return null;
    }
  }

  // แสดง/ซ่อนปุ่ม "ย้อนกลับไปก่อนกู้ข้อมูล" ตามว่ามีสำเนาอยู่จริงไหม
  async refreshPreRestoreUI() {
    const box = document.getElementById('pre-restore-box');
    const label = document.getElementById('pre-restore-label');
    if (!box) return;
    const snap = await this.readPreRestoreSnapshot();
    if (!snap) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (label) {
      const when = new Date(snap.savedAt).toLocaleString('th-TH');
      const bills = Array.isArray(snap.data.transactions) ? snap.data.transactions.length : 0;
      label.innerText = `มีสำเนาก่อนกู้ข้อมูลเก็บไว้ในเครื่อง (บันทึกเมื่อ ${when} · บิล ${bills} รายการ)`;
    }
  }

  // ย้อนกลับไปใช้สำเนาก่อนกู้ข้อมูล — ใช้เมื่อกู้ผิดไฟล์
  // สลับไป-กลับได้: ก่อนย้อน จะเซฟสถานะปัจจุบันทับสำเนาเก่า กดอีกทีก็กลับมาที่เดิม
  async undoLastRestore() {
    if (this.loadFailed) {
      this.showToast('โหลดข้อมูลไม่สำเร็จ — ปิดฟังก์ชันนี้ไว้เพื่อความปลอดภัย', 'error');
      return;
    }
    if (this.currentRole !== 'owner') {
      this.showToast('เฉพาะเจ้าของร้านเท่านั้นที่ย้อนข้อมูลได้', 'warning');
      return;
    }
    const snap = await this.readPreRestoreSnapshot();
    if (!snap) {
      this.showToast('ไม่พบสำเนาก่อนกู้ข้อมูลในเครื่องนี้', 'info');
      await this.refreshPreRestoreUI();
      return;
    }
    const when = new Date(snap.savedAt).toLocaleString('th-TH');
    const bills = Array.isArray(snap.data.transactions) ? snap.data.transactions.length : 0;
    this.showConfirm(
      `ย้อนกลับไปใช้สำเนาก่อนกู้ข้อมูล (บันทึกเมื่อ ${when} · บิล ${bills} รายการ) ใช่ไหม?\n\n` +
      `ข้อมูลที่อยู่ในเครื่องตอนนี้ (บิล ${this.state.transactions.length} รายการ) จะถูกเขียนทับ\n` +
      `แต่ระบบจะเก็บสำเนาของ "ตอนนี้" ไว้แทนที่ กดปุ่มนี้อีกครั้งก็กลับมาได้`,
      async () => {
        if (this.restoreBusy) return;
        this.restoreBusy = true;
        try {
          // สลับที่กัน: เก็บสถานะปัจจุบันไว้ก่อน แล้วค่อยเอาสำเนาเก่ามาใช้
          await this.savePreRestoreSnapshot();
          // สำเนาของแอปเอง — ข้ามกฎรูปแบบ ID เพื่อไม่ให้เส้นทางย้อนกลับตัน
          await this.applyBackupData(snap.data, { checkIds: false });
          await this.refreshPreRestoreUI();
          this.showToast('ย้อนกลับไปเป็นข้อมูลก่อนกู้เรียบร้อยแล้ว', 'success', 6000);
          this.suggestReconcileAfterRestore();
        } catch (err) {
          console.error('undo restore failed', err);
          this.showToast('ย้อนข้อมูลไม่สำเร็จ: ' + (err.message || err) + ' (ข้อมูลเดิมในเครื่องยังอยู่ครบ)', 'error', 7000);
        } finally {
          this.restoreBusy = false;
        }
      }
    );
  }

  // นำเข้าข้อมูลจากไฟล์ JSON
  importData(event) {
    const input = event.target;
    if (!this.requireOwnerForDataAction('นำเข้าข้อมูล')) { input.value = ''; return; }
    const file = input.files && input.files[0];
    // ล้างค่า input ทันที — ไม่งั้นเลือก "ไฟล์ชื่อเดิม" ซ้ำครั้งที่สอง onchange จะไม่ยิงเลย
    // (ปลอดภัย: FileReader ถือ object ไฟล์ไว้แล้ว การล้าง value ไม่กระทบการอ่าน)
    input.value = '';
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!this.isValidBackupObject(parsed)) {
          this.showToast('รูปแบบไฟล์ข้อมูลสำรองไม่ถูกต้อง!' +
            (this._lastBackupRejectReason ? ` (${this._lastBackupRejectReason})` : ''), 'error', 9000);
          return;
        }
        // ตรวจสุขภาพไฟล์ก่อนถาม — ถ้ามีบิลเสีย ต้องให้เจ้าของเห็นก่อนตัดสินใจ ไม่ใช่รู้ทีหลัง
        const audit = this.auditBackupData(parsed);
        const warn = this.describeBackupAudit(audit);
        if (!audit.clean) console.warn('[Import] ผลตรวจไฟล์:', audit, audit.damagedIds);
        this.showConfirm(
          (warn ? warn + '\n\n──────────\n\n' : '') +
          `นำเข้าข้อมูลจากไฟล์นี้และเขียนทับข้อมูลในเครื่องทั้งหมดใช่ไหม? (ไฟล์มีบิล ${audit.txTotal} ใบ)\n\n` +
          `ตอนนี้ในเครื่องมีบิล ${this.state.transactions.length} รายการ\n` +
          'ระบบจะเก็บสำเนาของ "ตอนนี้" ไว้ในเครื่องให้ก่อน (ย้อนกลับได้ที่ปุ่มในหน้าตั้งค่า)',
          async () => {
            try {
              // เซฟสำเนาก่อนเสมอ — ถ้าเซฟไม่ได้ ห้ามเขียนทับ ไม่งั้นนำเข้าไฟล์ผิดแล้วไม่มีทางกลับ
              await this.savePreRestoreSnapshot();
            } catch (snapErr) {
              console.error('pre-import snapshot failed', snapErr);
              this.showToast('เก็บสำเนาก่อนนำเข้าไม่สำเร็จ — ยกเลิกการนำเข้าเพื่อความปลอดภัย', 'error', 7000);
              return;
            }
            try {
              await this.applyBackupData(parsed);
              await this.refreshPreRestoreUI();
              this.showToast('นำเข้าข้อมูลและรีเฟรชหน้าจอสำเร็จ!', 'info');
              this.suggestReconcileAfterRestore();
            } catch (e2) {
              console.error('import failed', e2);
              this.showToast('นำเข้าข้อมูลไม่สำเร็จ: ' + (e2.message || e2), 'error', 6000);
            }
          });
      } catch (err) {
        this.showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON!', 'info');
        console.error(err);
      }
    };
    fileReader.readAsText(file);
  }

  // ตรวจว่าอ็อบเจกต์นี้หน้าตาเหมือนไฟล์สำรองจริงไหม
  // ตรวจชนิด, ขนาด และรายการย่อยก่อนเขียนทับ IndexedDB — ไฟล์เพี้ยนหรือไฟล์ที่ถูกแก้
  // ต้องถูกปฏิเสธก่อน ไม่ใช่รอให้หน้า report พังหลังจากบันทึกลงเครื่องแล้ว
  // opts.checkIds = false สำหรับ "ข้อมูลที่แอปเขียนเอง" (สำเนาก่อนกู้)
  // ⚠️ กฎเรื่องรูปแบบ ID มีไว้กันไฟล์จากภายนอก ไม่ได้มีไว้กันข้อมูลของตัวเอง
  // ถ้าเอาไปใช้กับสำเนาก่อนกู้ด้วย จะเกิดกรณีที่แย่มาก: ข้อมูลในเครื่องมี ID แปลกอยู่แล้ว
  // (เช่นเคยนำเข้าไฟล์ก่อนมีด่านนี้) → ปุ่ม "ย้อนกลับไปก่อนกู้ข้อมูล" จะหายไปเงียบ ๆ
  // ตอนที่ผู้ใช้ต้องการมันที่สุด คือทันทีหลังกู้ผิดไฟล์
  // การย้อนกลับปลอดภัยอยู่แล้ว เพราะ safeId() กันตอนแสดงผลให้อีกชั้น
  isValidBackupObject(parsed, opts) {
    const checkIds = !(opts && opts.checkIds === false);
    // เก็บเหตุผลไว้ให้ผู้ใช้เห็น — การกู้ข้อมูลมักเกิดตอนฉุกเฉิน
    // ข้อความ "ไฟล์ไม่ถูกต้อง" เฉย ๆ ทำให้เจ้าของไม่รู้ว่าควรลองไฟล์อื่นหรือควรโทรหาคนดูแล
    this._lastBackupRejectReason = '';
    const reject = (why) => { this._lastBackupRejectReason = why; console.warn('[Import] ปฏิเสธไฟล์:', why); return false; };
    const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const objectArray = (arr, max) => Array.isArray(arr) && arr.length <= max && arr.every(isObject);
    if (!isObject(parsed)) return false;

    // รองรับไฟล์เก่าที่ไม่มี version แต่ไม่รับไฟล์จากรุ่นใหม่กว่าที่แอปนี้ยังอ่านไม่เข้าใจ
    if (parsed.backupSchemaVersion !== undefined &&
        (!Number.isInteger(parsed.backupSchemaVersion) || parsed.backupSchemaVersion < 1 || parsed.backupSchemaVersion > BACKUP_SCHEMA_VERSION)) {
      return false;
    }

    if (!objectArray(parsed.services, 10000) ||
        !objectArray(parsed.staff, 2000) ||
        !objectArray(parsed.transactions, 200000)) return false;

    const optionalArrays = [
      ['categories', 10000], ['customers', 100000], ['queue', 10000],
      ['voidLog', 100000], ['expenseLog', 100000], ['editLog', 100000]
    ];
    for (const [key, max] of optionalArrays) {
      if (parsed[key] !== undefined && !objectArray(parsed[key], max)) return false;
    }
    if (parsed.shift !== undefined && !isObject(parsed.shift)) return false;

    // งานคลาวด์ค้าง (v3+) — ถ้ามีต้องเป็นรูปแบบที่อ่านได้ ไม่งั้นจะไปพังตอนสร้างงานคืน
    // ตรวจแค่โครง ส่วนความถูกต้องของแต่ละรายการกรองอีกชั้นใน rebuildCloudOutboxFromBackup()
    if (parsed.pendingCloudWork !== undefined) {
      const pcw = parsed.pendingCloudWork;
      if (!isObject(pcw)) return reject('งานคลาวด์ค้างในไฟล์มีรูปแบบไม่ถูกต้อง');
      const listKeys = [['voidDeletes', 100000], ['summaryDateKeys', 10000], ['summaryMonthKeys', 1000]];
      for (const [key, max] of listKeys) {
        if (pcw[key] === undefined) continue;
        if (!Array.isArray(pcw[key]) || pcw[key].length > max) {
          return reject(`งานคลาวด์ค้าง "${key}" ในไฟล์มีรูปแบบไม่ถูกต้อง`);
        }
      }
      if (Array.isArray(pcw.voidDeletes) && !pcw.voidDeletes.every(isObject)) {
        return reject('รายการบิลที่รอลบในไฟล์มีรูปแบบไม่ถูกต้อง');
      }
    }

    // ── รหัสของรายการที่ถูกนำไปต่อกับ onclick ต้องอยู่ในรูปแบบที่ระบบสร้างเองเท่านั้น ──
    // ไฟล์ที่ถูกดัดแปลงให้ id เป็นเช่น  x');โค้ดอะไรสักอย่าง//  จะหลุดออกจากสตริงใน onclick
    // แล้วกลายเป็นโค้ดที่รันในบริบทของ POS (ซึ่งมีข้อมูลร้านและรหัสเชื่อมต่อคลาวด์อยู่)
    // ตรวจโครงสร้างอย่างเดียวไม่พอ เพราะ id แบบนั้นก็ยังเป็น "สตริง" ที่ถูกต้องตามชนิด
    //
    // ตั้งใจไม่ตรวจ transactions ที่นี่ — ประวัติบิลมีได้เป็นหมื่นใบและเป็นของจริงที่กู้กลับไม่ได้ถ้าถูกปฏิเสธทั้งไฟล์
    // บิลที่ id แปลกจะถูกกันที่ชั้น safeId() ตอนแสดงผลแทน (ปุ่มกดแล้วไม่ทำอะไร) และขึ้นในผลตรวจไฟล์
    // ส่วน 5 รายการนี้เป็นบัญชีตั้งค่าที่มีไม่กี่สิบรายการ — id แปลกที่นี่แปลว่าไฟล์ถูกแก้ ไม่ใช่ข้อมูลเก่า
    const idLists = checkIds ? [
      ['categories', parsed.categories],
      ['services',   parsed.services],
      ['staff',      parsed.staff],
      ['customers',  parsed.customers],
      ['queue',      parsed.queue]
    ] : [];
    for (const [key, list] of idLists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!isSafeEntityId(item.id)) {
          return reject(`รายการ "${key}" มีรหัส (ID) ผิดรูปแบบ: ${String(item && item.id).slice(0, 40)}`);
        }
      }
    }
    // หมวดของบริการก็เป็นรหัสที่ถูกนำไปเทียบและแสดงผลเหมือนกัน (ว่างได้ = บริการที่ยังไม่จัดหมวด)
    for (const svc of (checkIds && Array.isArray(parsed.services) ? parsed.services : [])) {
      if (svc.category !== undefined && svc.category !== null && svc.category !== '' && !isSafeEntityId(svc.category)) {
        return reject(`หมวดของบริการมีรหัส (ID) ผิดรูปแบบ: ${String(svc.category).slice(0, 40)}`);
      }
    }
    return true;
  }

  // ── แปลงเป็นตัวเลขที่ใช้งานได้จริง ─────────────────────────────────────
  // คืน null เมื่อแปลงไม่ได้ — ตั้งใจไม่คืน 0 เพราะผู้เรียกต้องแยกให้ออกระหว่าง
  // "ยอดศูนย์บาท" กับ "ยอดหายไป" สองอย่างนี้ความหมายต่างกันคนละเรื่อง
  toFiniteNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // ── ตรวจสุขภาพไฟล์สำรองแบบละเอียด (อ่านอย่างเดียว ไม่แก้อะไร) ──────────
  // ด่าน isValidBackupObject ข้างบนดูแค่ "โครงร่างใช่ไหม" — ไฟล์ที่บิลยอดเงินหาย
  // หรือวันที่พังจะผ่านเข้ามาได้สบาย แล้วไปโผล่เป็น NaN ในรายงานทีหลัง
  // ซึ่งอันตรายมาก เพราะบิลเสียใบเดียวทำให้ยอด "ทั้งวัน" กลายเป็น NaN บังบิลดีทุกใบ
  auditBackupData(parsed) {
    const bad = { noId: [], badDate: [], badMoney: [], dupId: [] };
    const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const seen = new Set();

    txs.forEach((tx, i) => {
      const label = (tx && typeof tx.id === 'string' && tx.id) ? tx.id : `(ลำดับที่ ${i + 1})`;
      if (!tx || typeof tx !== 'object') { bad.noId.push(label); return; }
      if (typeof tx.id !== 'string' || !tx.id.trim()) bad.noId.push(label);
      else if (seen.has(tx.id)) bad.dupId.push(tx.id);
      else seen.add(tx.id);

      if (!this.isValidDateKey(this.getBusinessISODate(tx.date))) bad.badDate.push(label);

      // total คือตัวที่ใช้รวมยอดขายทุกที่ — พังตัวนี้ตัวเดียวคือยอดทั้งวันพัง
      if (this.toFiniteNumber(tx.total) === null) bad.badMoney.push(label);
    });

    // ค่าใช้จ่าย: amount พังก็ทำให้กำไรทั้งวันกลายเป็น NaN เหมือนกัน
    let badExpenses = 0;
    const shift = (parsed.shift && typeof parsed.shift === 'object') ? parsed.shift : {};
    const buckets = [shift.expenses].concat(Array.isArray(shift.history) ? shift.history.map(h => h && h.expenses) : []);
    buckets.forEach(list => (Array.isArray(list) ? list : []).forEach(e => {
      if (!e || typeof e !== 'object' || this.toFiniteNumber(e.amount) === null) badExpenses++;
    }));

    // ราคาบริการ: sanitizeBackupData จะปัดค่าที่ใช้ไม่ได้เป็น 0 ให้ ซึ่งแปลว่า "ขายฟรี"
    // ต้องบอกเจ้าของก่อนกดยืนยัน ไม่ใช่ให้ไปเจอเอาตอนลูกค้ายืนอยู่หน้าเคาน์เตอร์
    let badServices = 0;
    (Array.isArray(parsed.services) ? parsed.services : []).forEach(svc => {
      if (!svc || typeof svc !== 'object') { badServices++; return; }
      const price = this.toFiniteNumber(svc.price);
      if (price === null || price < 0) badServices++;
    });

    // ── โครงสร้างซ้อนชั้นที่หน้าจอวนลูปใช้ ────────────────────────────────
    // ⚠️ เดิมไฟล์ที่มี queue[].services = null ได้ผลตรวจว่า "clean" เพราะตรวจแค่ชั้นบน
    // เจ้าของจึงกดยืนยันโดยไม่รู้ว่ามีอะไรเสีย แล้วไปเจอตอนหน้าจอวาดไม่ขึ้น
    // sanitize ซ่อมให้ได้ (ดีกว่าปฏิเสธทั้งไฟล์ตอนกู้ฉุกเฉิน) แต่ต้องนับมาบอกก่อนเสมอ
    let badLists = 0;
    const needArray = (o, k) => { if (o && typeof o === 'object' && o[k] !== undefined && !Array.isArray(o[k])) badLists++; };
    (Array.isArray(parsed.queue) ? parsed.queue : []).forEach(q => {
      if (!q || typeof q !== 'object') { badLists++; return; }
      if (!Array.isArray(q.services)) { badLists++; return; }
      // สมาชิกที่ใช้ไม่ได้ก็ต้องนับ — เดิมตรวจแค่ตัวห่อจึงตอบ clean ให้ไฟล์ที่ render ไม่ได้
      badLists += q.services.filter(x => !x || typeof x !== 'object').length;
    });
    txs.forEach(tx => {
      needArray(tx, 'services'); needArray(tx, 'staffNames'); needArray(tx, 'details');
      if (Array.isArray(tx.details))    badLists += tx.details.filter(x => !x || typeof x !== 'object').length;
      if (Array.isArray(tx.services))   badLists += tx.services.filter(x => typeof x !== 'string' && typeof x !== 'number').length;
      if (Array.isArray(tx.staffNames)) badLists += tx.staffNames.filter(x => typeof x !== 'string' && typeof x !== 'number').length;
    });
    // ── ประวัติกะ: ฟิลด์ที่หน้ารายงานเรียกใช้ตรง ๆ ต้องมีจริง ─────────────────
    // ⚠️ entry ที่เป็นอ็อบเจกต์ถูกชนิดครบแต่ "ขาด startCash" เคยได้ผลตรวจว่า clean
    //    sanitize จะเติม 0 ให้ (ซ่อมได้) แต่ 0 ที่ไม่ใช่เงินจริงต้องบอกเจ้าของก่อนกดยืนยัน
    //    ไม่ใช่ปล่อยให้เห็นเลข 0 ในรายงานแล้วเข้าใจว่าวันนั้นเปิดร้านโดยไม่มีเงินทอน
    let badShifts = 0;
    if (parsed.shift && typeof parsed.shift === 'object') {
      (Array.isArray(parsed.shift.history) ? parsed.shift.history : []).forEach(h => {
        if (!h || typeof h !== 'object') return;   // สมาชิกที่ไม่ใช่อ็อบเจกต์นับใน badLists อยู่แล้ว
        if (this.toFiniteNumber(h.startCash) === null) badShifts++;
      });
    }

    if (parsed.shift && typeof parsed.shift === 'object') {
      needArray(parsed.shift, 'expenses'); needArray(parsed.shift, 'history');
      [parsed.shift.expenses, parsed.shift.history].forEach(list => {
        if (Array.isArray(list)) badLists += list.filter(x => !x || typeof x !== 'object').length;
      });
      (Array.isArray(parsed.shift.history) ? parsed.shift.history : []).forEach(hh => {
        needArray(hh, 'expenses');
        if (hh && Array.isArray(hh.expenses)) badLists += hh.expenses.filter(x => !x || typeof x !== 'object').length;
      });
    }

    const damagedIds = [...new Set([...bad.noId, ...bad.badMoney, ...bad.badDate])];
    return {
      txTotal: txs.length,
      noId: bad.noId.length,
      dupId: bad.dupId.length,
      badDate: bad.badDate.length,
      badMoney: bad.badMoney.length,
      badExpenses,
      badServices,
      badLists,
      badShifts,
      damagedIds,
      clean: damagedIds.length === 0 && bad.dupId.length === 0 && badExpenses === 0
             && badServices === 0 && badLists === 0 && badShifts === 0
    };
  }

  // สรุปผลตรวจเป็นข้อความที่คนอ่านรู้เรื่อง (ใช้ในกล่องยืนยันก่อนเขียนทับ)
  describeBackupAudit(a) {
    if (a.clean) return '';
    const lines = [];
    if (a.badMoney)    lines.push(`• ${a.badMoney} บิลที่ยอดเงินหายหรือไม่ใช่ตัวเลข → จะถูกนับเป็น 0 บาท`);
    if (a.badDate)     lines.push(`• ${a.badDate} บิลที่วันที่ใช้ไม่ได้ → จะไม่โผล่ในรายงานวันหรือเดือนไหนเลย`);
    if (a.noId)        lines.push(`• ${a.noId} บิลที่ไม่มีเลขที่บิล → แก้ไข/ยกเลิกทีหลังไม่ได้`);
    if (a.dupId)       lines.push(`• ${a.dupId} บิลที่เลขที่ซ้ำกัน → บนชีตจะทับกันเหลือใบเดียว`);
    if (a.badExpenses) lines.push(`• ${a.badExpenses} รายการค่าใช้จ่ายที่จำนวนเงินหาย → จะถูกนับเป็น 0 บาท`);
    if (a.badServices) lines.push(`• ${a.badServices} รายการบริการที่ราคาใช้ไม่ได้ → จะถูกตั้งเป็น 0 บาท ต้องไปแก้ราคาที่หน้าตั้งค่าก่อนขาย`);
    if (a.badLists)    lines.push(`• ${a.badLists} จุดที่รายการย่อยเสีย (เช่นรายการบริการในคิว) → จะถูกล้างเป็นรายการว่าง ข้อมูลส่วนนั้นหายไป`);
    if (a.badShifts)   lines.push(`• ${a.badShifts} รอบกะที่ "เงินเปิดร้าน" หายไป → จะถูกตั้งเป็น 0 บาท (ไม่ใช่ยอดจริง) ต้องเทียบกับสมุดเองถ้าจะใช้ตัวเลขนี้`);
    return `⚠️ ไฟล์นี้มีข้อมูลเสียบางส่วน (จากบิลทั้งหมด ${a.txTotal} ใบ)\n\n${lines.join('\n')}\n\n` +
           `ระบบจะกู้ส่วนที่ดีให้ครบ ส่วนที่เสียจะไม่ทำให้ยอดทั้งวันพัง (แต่ยอดของใบนั้นจะไม่ตรง)\n` +
           `เลขที่บิลที่มีปัญหาดูได้ใน Console ของเบราว์เซอร์`;
  }

  // ── ซ่อมตัวเลขในไฟล์สำรองเท่าที่ซ่อมได้อย่างปลอดภัย ────────────────────
  // เป้าหมายเดียว: กัน NaN หลุดเข้าไปในการรวมยอด
  // "400" (ข้อความ) → 400 ถือว่าซ่อมได้ปลอดภัย เพราะค่าเดิมยังอยู่ครบ
  // ส่วนค่าที่พังจริง ๆ ตั้งเป็น 0 — เสียเฉพาะใบนั้น ดีกว่าปล่อยให้ยอดทั้งวันเป็น NaN
  // แล้วบิลดีอีกร้อยใบหายไปจากรายงานพร้อมกัน (ผู้ใช้ได้รับคำเตือนก่อนแล้วจาก audit)
  sanitizeBackupData(parsed) {
    let fixed = 0;

    // ── ชนิดของ ID ต้องเป็นสตริงเสมอ ───────────────────────────────────
    // ไฟล์เก่าบางชุดเก็บ id เป็นตัวเลข · ปุ่มบนหน้าจอส่งกลับมาเป็น "สตริง" เสมอ
    // (HTML attribute ไม่มีชนิดข้อมูล) แล้ว find() ใช้ === จึงหาไม่เจอ = ปุ่มกดแล้วเงียบ
    // ต้องแปลงตั้งแต่ตอนนำเข้า ไม่ใช่ไปแก้ทุก find() ให้เทียบหลวม ๆ ซึ่งจะพลาดที่ใดที่หนึ่งแน่
    // ⚠️ ต้องแปลง foreign key ที่ชี้ไปหา id พวกนี้ด้วย ไม่งั้นความสัมพันธ์ขาด
    const asId = (v) => (typeof v === 'number' && Number.isFinite(v)) ? String(v) : v;
    let idsFixed = 0;
    const fixIds = (list, keys) => (Array.isArray(list) ? list : []).forEach(o => {
      if (!o || typeof o !== 'object') return;
      keys.forEach(k => { const n = asId(o[k]); if (n !== o[k]) { o[k] = n; idsFixed++; } });
    });
    fixIds(parsed.categories, ['id']);
    fixIds(parsed.services,   ['id', 'category']);
    fixIds(parsed.staff,      ['id']);
    fixIds(parsed.customers,  ['id']);
    fixIds(parsed.queue,      ['id', 'customerId']);
    fixIds(parsed.transactions, ['id', 'customerId']);
    (Array.isArray(parsed.transactions) ? parsed.transactions : []).forEach(tx => {
      if (tx && typeof tx === 'object') fixIds(tx.details, ['staffId', 'category']);
    });
    (Array.isArray(parsed.queue) ? parsed.queue : []).forEach(q => {
      if (q && typeof q === 'object') fixIds(q.services, ['staffId', 'id']);
    });
    if (idsFixed) { fixed += idsFixed; console.warn(`[Import] แปลงชนิดรหัสเป็นข้อความ ${idsFixed} จุด`); }

    // ── ฟิลด์ซ้อนชั้นที่หน้าจอวนลูปใช้ ต้องเป็นอาเรย์เสมอ ────────────────
    // `queue[].services = null` ผ่านการตรวจโครงสร้างเดิมได้ (queue เป็นอาเรย์ของอ็อบเจกต์จริง)
    // แต่พอ render เรียก q.services.map() จะโยน TypeError **หลังจากบันทึกลงเครื่องไปแล้ว**
    // ผลคือเปิดแอปใหม่ก็พังซ้ำที่เดิม จนสร้างปุ่มล็อกอินไม่ทัน = เปิดร้านไม่ได้
    let listsFixed = 0;
    const ensureArray = (o, k) => {
      if (!o || typeof o !== 'object') return;
      if (!Array.isArray(o[k])) { o[k] = []; listsFixed++; }
    };
    (Array.isArray(parsed.queue) ? parsed.queue : []).forEach(q => {
      ensureArray(q, 'services');
      // ⚠️ เป็นอาเรย์แล้วยังไม่พอ — สมาชิกที่เป็น null/ไม่ใช่อ็อบเจกต์ ทำให้ s.name พังตอน render
      // รอบก่อนตรวจแค่ "ตัวห่อ" จึงยังเหลือช่องนี้ไว้ ตอนนี้กรองสมาชิกที่ใช้ไม่ได้ทิ้ง
      if (q && Array.isArray(q.services)) {
        const before = q.services.length;
        q.services = q.services.filter(x => x && typeof x === 'object');
        if (q.services.length !== before) listsFixed += (before - q.services.length);
      }
    });
    (Array.isArray(parsed.transactions) ? parsed.transactions : []).forEach(tx => {
      ensureArray(tx, 'services'); ensureArray(tx, 'staffNames');
      if (tx && tx.details !== undefined && !Array.isArray(tx.details)) { tx.details = []; listsFixed++; }
      if (tx && Array.isArray(tx.details)) {
        const b0 = tx.details.length;
        tx.details = tx.details.filter(x => x && typeof x === 'object');
        if (tx.details.length !== b0) listsFixed += (b0 - tx.details.length);
      }
      // รายชื่อบริการ/พนักงานในบิลถูกนำไปแสดงตรง ๆ — ต้องเป็นข้อความเท่านั้น
      ['services', 'staffNames'].forEach(k => {
        if (tx && Array.isArray(tx[k])) {
          const b1 = tx[k].length;
          tx[k] = tx[k].filter(x => typeof x === 'string' || typeof x === 'number').map(String);
          if (tx[k].length !== b1) listsFixed += (b1 - tx[k].length);
        }
      });
    });
    if (parsed.shift && typeof parsed.shift === 'object') {
      ensureArray(parsed.shift, 'expenses'); ensureArray(parsed.shift, 'history');
      (Array.isArray(parsed.shift.history) ? parsed.shift.history : []).forEach(hh => ensureArray(hh, 'expenses'));
      [parsed.shift.expenses, parsed.shift.history].forEach(list => {
        if (!Array.isArray(list)) return;
        for (let i = list.length - 1; i >= 0; i--) {
          if (!list[i] || typeof list[i] !== 'object') { list.splice(i, 1); listsFixed++; }
        }
      });
      (Array.isArray(parsed.shift.history) ? parsed.shift.history : []).forEach(hh => {
        if (hh && Array.isArray(hh.expenses)) {
          const b2 = hh.expenses.length;
          hh.expenses = hh.expenses.filter(x => x && typeof x === 'object');
          if (hh.expenses.length !== b2) listsFixed += (b2 - hh.expenses.length);
        }
      });
    }
    if (listsFixed) { fixed += listsFixed; console.warn(`[Import] ซ่อมรายการย่อยที่ไม่ใช่อาเรย์ ${listsFixed} จุด`); }

    // ── ฟิลด์ที่ต้องเป็นตัวเลข ต้องถูกบังคับตั้งแต่ขอบเขต ────────────────
    // ชื่อฟิลด์เป็น "จำนวน" ไม่ได้แปลว่าค่าที่มาใน JSON เป็นตัวเลข
    // ค่าที่เป็นสตริง HTML จะไหลไปโผล่ในหน้าจอได้ทุกจุดที่เผลอไม่ครอบ Number()
    let numsFixed = 0;
    const fixNums = (list, keys) => (Array.isArray(list) ? list : []).forEach(o => {
      if (!o || typeof o !== 'object') return;
      keys.forEach(k => {
        if (o[k] === undefined || o[k] === null) return;
        const n = this.toFiniteNumber(o[k]);
        const v = (n === null || n < 0) ? 0 : n;
        if (v !== o[k]) { o[k] = v; numsFixed++; }
      });
    });
    fixNums(parsed.customers, ['visitCount']);
    fixNums(parsed.queue, ['totalDuration', 'startTime']);
    (Array.isArray(parsed.queue) ? parsed.queue : []).forEach(q => {
      if (q && typeof q === 'object') fixNums(q.services, ['price', 'netPrice', 'duration', 'commission', 'commissionAmount']);
    });
    (Array.isArray(parsed.transactions) ? parsed.transactions : []).forEach(tx => {
      if (tx && typeof tx === 'object') fixNums(tx.details, ['duration']);
    });
    if (numsFixed) { fixed += numsFixed; console.warn(`[Import] แปลงฟิลด์ตัวเลขที่ไม่ใช่ตัวเลข ${numsFixed} จุด`); }

    const fix = (obj, key, { required = false } = {}) => {
      if (!obj) return;
      const cur = obj[key];
      if (cur === undefined || cur === null) { if (required) { obj[key] = 0; fixed++; } return; }
      const n = this.toFiniteNumber(cur);
      if (n === null) { obj[key] = 0; fixed++; return; }
      if (n !== cur) { obj[key] = n; fixed++; }        // เคยเป็นข้อความตัวเลข
    };

    (Array.isArray(parsed.transactions) ? parsed.transactions : []).forEach(tx => {
      if (!tx || typeof tx !== 'object') return;
      ['total', 'subtotal', 'discount'].forEach(k => fix(tx, k, { required: true }));
      // ฟิลด์ VAT/เงินสด: มีเฉพาะบางบิล ห้ามเติมให้บิลที่ไม่เคยมี
      // โดยเฉพาะ cashReceived/cashChange ที่ใบเสร็จเช็คด้วย != null (เติม 0 = บิลโอนจะโชว์ช่องเงินทอน)
      ['nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'vatRate', 'cashReceived', 'cashChange']
        .forEach(k => { if (tx[k] !== undefined && tx[k] !== null) fix(tx, k); });
      (Array.isArray(tx.details) ? tx.details : []).forEach(d => {
        if (!d || typeof d !== 'object') return;
        ['price', 'netPrice', 'commission', 'commissionAmount']
          .forEach(k => { if (d[k] !== undefined && d[k] !== null) fix(d, k); });
      });
    });

    // ── บริการ: ราคาที่เป็น "ข้อความ" ทำให้ยอดตะกร้าต่อสตริงแทนการบวก ──────────
    // 0 + "300" + "300" ได้ "0300300" ไม่ใช่ 600 — บิลผิดโดยไม่มีอะไรฟ้องสักตัว
    // ด่านนี้เดิมตรวจเฉพาะบิลกับค่าใช้จ่าย ไม่เคยแตะรายการบริการเลย ทั้งที่บริการคือต้นทางของราคา
    (Array.isArray(parsed.services) ? parsed.services : []).forEach(svc => {
      if (!svc || typeof svc !== 'object') return;
      ['price', 'duration', 'commission'].forEach(k => {
        fix(svc, k, { required: true });
        // ติดลบใช้คิดเงินไม่ได้ (ราคาติดลบ = แจกเงิน) — ปัดเป็น 0 ให้เจ้าของเห็นแล้วไปแก้เอง
        // ไม่ปฏิเสธทั้งไฟล์ เพราะการกู้ข้อมูลมักเกิดตอนฉุกเฉิน ปฏิเสธไฟล์ = ร้านเปิดไม่ได้
        if (svc[k] < 0) { svc[k] = 0; fixed++; }
      });
      // ชนิดค่าคอมที่ไม่รู้จักทำให้คิดค่าคอมผิดแบบเงียบ ๆ — บังคับกลับเป็นค่าตั้งต้น
      if (svc.commissionType !== 'fixed' && svc.commissionType !== 'percent') {
        svc.commissionType = 'percent'; fixed++;
      }
    });

    const shift = (parsed.shift && typeof parsed.shift === 'object') ? parsed.shift : null;
    if (shift) {
      const lists = [shift.expenses].concat(Array.isArray(shift.history) ? shift.history.map(h => h && h.expenses) : []);
      lists.forEach(list => (Array.isArray(list) ? list : []).forEach(e => {
        if (e && typeof e === 'object') fix(e, 'amount', { required: true });
      }));
      (Array.isArray(shift.history) ? shift.history : []).forEach(h => {
        if (!h || typeof h !== 'object') return;
        // ⚠️ startCash คือค่าเดียวในแถวประวัติกะที่หน้ารายงานเรียก .toLocaleString() ตรง ๆ
        // (ช่องอื่นมี || 0 คุมไว้หมด) entry ที่ขาดฟิลด์นี้เคยผ่านด่านตรวจว่า "ไฟล์สะอาด"
        // แล้วไปพังตอน render **หลังบันทึกลงเครื่องแล้ว** = เปิดแอปใหม่ก็พังซ้ำที่เดิม
        // จึงบังคับให้มีเสมอ (required → เติม 0 + นับเป็นจุดที่ซ่อม → audit ตอบ clean=false)
        fix(h, 'startCash', { required: true });
        ['countedCash', 'expectedCash', 'cashSales', 'expensesTotal', 'difference']
          .forEach(k => { if (h[k] !== undefined && h[k] !== null) fix(h, k); });
      });
      fix(shift, 'startCash', { required: true });
    }

    if (fixed > 0) console.warn(`[Import] ซ่อมตัวเลขที่ใช้งานไม่ได้ ${fixed} จุด`);
    return fixed;
  }

  // เขียนข้อมูลจากไฟล์สำรองลง state + IndexedDB
  // ใช้ร่วมกัน 2 ทาง: นำเข้าไฟล์ .json จากเครื่อง และกู้จาก Google Drive
  // ต้องเป็นโค้ดชุดเดียวกัน — ถ้าแยกกัน แก้ทางหนึ่งแล้วลืมอีกทางเมื่อไหร่ ข้อมูลจะเข้าไม่เหมือนกัน
  // ⚠️ ผู้เรียกต้องตรวจ isValidBackupObject() มาก่อนแล้ว
  async applyBackupData(parsed, opts) {
    // ถ้าโหลดข้อมูลตอนเปิดแอปไม่สำเร็จ saveState() จะถูกบล็อกไว้ (กันเขียนทับข้อมูลจริง)
    // ถ้าปล่อยให้ทำต่อ ผู้ใช้จะเห็นหน้าจอเปลี่ยนเหมือนกู้สำเร็จ แต่ไม่มีอะไรถูกบันทึกลงเครื่องเลย
    // — พอปิดแอปแล้วเปิดใหม่ข้อมูลหายอีกรอบ ต้องหยุดตรงนี้แล้วบอกตรง ๆ ดีกว่า
    if (this.loadFailed) {
      throw new Error('โหลดข้อมูลเดิมไม่สำเร็จ ระบบล็อกการบันทึกไว้ — ปิดแอปแล้วเปิดใหม่ก่อน');
    }
    if (!this.isValidBackupObject(parsed, opts)) {
      throw new Error('ไฟล์สำรองมีโครงสร้างไม่ถูกต้องหรือมีข้อมูลมากผิดปกติ' +
        (this._lastBackupRejectReason ? ` — ${this._lastBackupRejectReason}` : ''));
    }

    // ⚠️ ด่านสุดท้ายก่อนข้อมูลนอกเข้าสู่ระบบ — ทุกเส้นทางการกู้ต้องผ่านตรงนี้
    // (นำเข้าไฟล์ / กู้จาก Drive / ย้อนกลับสำเนา) กัน NaN หลุดเข้าไปในการรวมยอด
    // ผู้เรียกได้เตือนผู้ใช้ด้วย auditBackupData ไปแล้วก่อนถึงจุดนี้
    const audit = this.auditBackupData(parsed);
    if (!audit.clean) {
      console.warn('[Import] ผลตรวจไฟล์สำรอง:', audit);
      if (audit.damagedIds.length) console.warn('[Import] บิลที่มีปัญหา:', audit.damagedIds);
    }
    this.sanitizeBackupData(parsed);

    // เปลี่ยนข้อมูลทั้งก้อน: หากเขียน IndexedDB ไม่สำเร็จ ต้องกลับสู่ข้อมูลเดิมในหน่วยความจำด้วย
    const rollback = {
      state: this.cloneForRollback(this.state),
      shopPromptPayId: this.shopPromptPayId,
      shopName: this.shopName,
      shopTagline: this.shopTagline,
      shopAddress: this.shopAddress,
      shopPhone: this.shopPhone,
      shopLogo: this.shopLogo,
      theme: this.theme,
      ownerPin: this.ownerPin,
      googleSheetsUrl: this.googleSheetsUrl,
      googleSheetsApiToken: this.googleSheetsApiToken,
      telegramToken: this.telegramToken,
      telegramChatId: this.telegramChatId,
      vatEnabled: this.vatEnabled,
      vatRate: this.vatRate
    };

    let persisted = false;
    try {
    this.state.services = parsed.services;
    this.state.staff = parsed.staff;
    if (Array.isArray(parsed.categories) && parsed.categories.length) this.state.categories = parsed.categories;
    this.state.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
    this.state.queue = Array.isArray(parsed.queue) ? parsed.queue : [];
    // ── syncStatus จากไฟล์ใช้เป็นหลักฐานไม่ได้ ────────────────────────────
    // 'synced' แปลว่า "ตอนที่สำรอง บิลใบนี้อยู่บนชีตแล้ว" ไม่ได้แปลว่า "ตอนนี้ยังอยู่"
    // เคสจริง: สำรอง → ยกเลิกบิล (แถวถูกลบจากชีตสำเร็จ) → กู้ไฟล์ก่อนยกเลิก
    //          บิลกลับมาในเครื่องพร้อมสถานะ synced จึงไม่มีอะไรส่งขึ้นชีตอีกเลย
    //          → เครื่องมีบิล ชีตไม่มี ต่างกันถาวรโดยไม่มีใครรู้
    //
    // หลังกู้ข้อมูล ความสัมพันธ์ระหว่างเครื่องกับชีต "ไม่รู้" ทั้งหมด จึงต้องส่งใหม่ทุกใบ
    // ปลอดภัยเพราะฝั่งชีตเป็น upsert ตามเลขที่บิล ส่งซ้ำไม่เกิดแถวซ้ำ
    this.state.transactions = parsed.transactions;
    const restoreStamp = Date.now();   // เวลาเดียวของการกู้รอบนี้ ใช้ร่วมกันทุกบิล
    let resyncCount = 0;
    (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
      if (tx && typeof tx === 'object') {
        // ⚠️ เดิมเป็นธง boolean ที่ติดกับบิลถาวร = ข้อยกเว้น "ข้ามทะเบียนบิลที่ยกเลิก" แบบไม่มีวันหมดอายุ
        // คำขอเก่าที่ค้างในเน็ตตั้งแต่ก่อน void ก็พกธงนี้ไปด้วย ปลายทางจึงแยกไม่ออกว่า
        // "ตั้งใจคืนบิลหลังยกเลิก" หรือ "คำขอเก่าที่หลงมาถึงทีหลัง" — ยอมรับทั้งคู่
        // ตอนนี้เก็บ "เวลาที่กดกู้" ไว้แทน ปลายทางเทียบกับเวลาที่ยกเลิกแล้วยอมเฉพาะที่ใหม่กว่า
        // (เวลาทั้งสองฝั่งมาจากนาฬิกาเครื่องเดียวกัน จึงเทียบกันได้ตรง ๆ ไม่ต้องพึ่งนาฬิกา Google)
        tx.restoredAt = restoreStamp;
        delete tx.restoredFromBackup;   // ธงรุ่นเก่าที่อาจติดมากับไฟล์สำรอง — ไม่ให้ค้างในระบบ
        // ⚠️ ธง "ยืนยันคืนบิลไปแล้วครั้งหนึ่ง" ต้องล้างทุกครั้งที่กู้ข้อมูลรอบใหม่
        // มันติดตัวบิลลงเครื่องและติดไปกับไฟล์สำรองด้วย ถ้าไม่ล้าง การกู้รอบนี้จะใช้ทางออก
        // ฉุกเฉิน (ตอนนาฬิกาเครื่องถูกตั้งย้อนหลัง) ไม่ได้ เพราะระบบคิดว่าใช้ไปแล้ว
        // แล้วบิลใบนั้นจะขึ้นชีตไม่ได้เลยจนกว่าทะเบียนฝั่งชีตจะหมดอายุ 90 วัน
        // — การกู้ข้อมูลครั้งใหม่ = เจตนาใหม่ ต้องได้สิทธิ์ยืนยันใหม่เสมอ
        delete tx._restoreConfirmed;
        if (tx.syncStatus !== 'pending') { tx.syncStatus = 'pending'; resyncCount++; }
      }
    });
    this._restoreResyncCount = resyncCount;

    // งวดทั้งหมดที่ข้อมูลชุดใหม่แตะ — ต้องถูกคำนวณสรุปใหม่ทั้งหมด
    // ใช้ทั้งบิลที่กู้มา และบิลที่ "เคยมีอยู่ก่อนกู้" เพราะงวดที่บิลหายไปก็ต้องอัปเดตเหมือนกัน
    this._restoreSummaryPeriods = { dateKeys: new Set(), monthKeys: new Set() };
    const addPeriod = (ts) => {
      if (ts === undefined || ts === null || ts === '') return;
      const dk = this.getBusinessISODate(ts), mk = this.getBusinessMonthKey(ts);
      if (this.isValidDateKey(dk))  this._restoreSummaryPeriods.dateKeys.add(dk);
      if (this.isValidMonthKey(mk)) this._restoreSummaryPeriods.monthKeys.add(mk);
    };
    const collectPeriods = (list) => (Array.isArray(list) ? list : []).forEach(tx => {
      if (!tx || !tx.date) return;
      addPeriod(tx.date);
    });
    // ⚠️ ยอดบนชีตสรุปไม่ได้มาจากบิลอย่างเดียว — ค่าใช้จ่ายเข้าไปในบรรทัด "ค่าใช้จ่ายรวม/กำไรสุทธิ" ด้วย
    // งวดที่ "มีแต่ค่าใช้จ่าย ไม่มีบิลสักใบ" จึงเคยถูกข้ามทั้งงวด แล้วสรุปเดิมบนชีตค้างเป็นตัวเลขเก่าถาวร
    // เกณฑ์เวลาต้องตรงกับ collectExpenses เป๊ะ (e.time → ถ้าไม่มีใช้เวลาของกะ)
    // ไม่งั้นจะเก็บคนละงวดกับงวดที่ตัวส่งสรุปใช้จริง แล้วรีเฟรชผิดงวด
    const collectExpensePeriods = (shift) => {
      if (!shift || typeof shift !== 'object') return;
      const take = (list, fallbackTs) => (Array.isArray(list) ? list : []).forEach(e => {
        if (!e || typeof e !== 'object') return;
        addPeriod((e.time !== undefined && e.time !== null && e.time !== '') ? e.time : fallbackTs);
      });
      (Array.isArray(shift.history) ? shift.history : []).forEach(sh => {
        if (!sh || typeof sh !== 'object') return;
        take(sh.expenses, sh.startTime || sh.endTime);
      });
      // กะที่ยังเปิดอยู่: เก็บด้วยเสมอ เก็บเกินแค่ทำให้รีเฟรชสรุปงวดนั้นซ้ำ ซึ่งไม่มีผลเสีย
      take(shift.expenses, shift.startTime);
    };
    collectPeriods(rollback.state && rollback.state.transactions);   // บิลของเดิมก่อนกู้
    collectPeriods(this.state.transactions);                         // บิลที่กู้มา
    collectExpensePeriods(rollback.state && rollback.state.shift);   // ค่าใช้จ่ายของเดิมก่อนกู้
    collectExpensePeriods(parsed.shift);                             // ค่าใช้จ่ายที่กู้มา
    this.state.voidLog = Array.isArray(parsed.voidLog) ? parsed.voidLog : [];
    // ไฟล์สำรองรุ่นก่อนไม่มี expenseLog — ให้เป็นอาเรย์ว่างแทนที่จะเป็น undefined
    this.state.expenseLog = Array.isArray(parsed.expenseLog) ? parsed.expenseLog : [];
    this.state.editLog = Array.isArray(parsed.editLog) ? parsed.editLog : [];
    // งานคลาวด์ค้าง: เดิมล้างทิ้งทั้งก้อน ทำให้คำสั่ง "ลบแถวบิลที่ยกเลิก" ที่ยังส่งไม่สำเร็จหายถาวร
    // แล้วแถวผีค้างบนชีตตลอดกาล — ตอนนี้สร้างคืนจากเจตนาที่ติดมากับไฟล์สำรองแทน
    // (งานของข้อมูลชุดเก่าในเครื่องนี้ถูกทิ้งเหมือนเดิม เพราะกำลังจะถูกเขียนทับทั้งชุด)
    this.state.cloudOutbox = this.rebuildCloudOutboxFromBackup(parsed);

    // เติมงานรีเฟรชสรุปของทุกงวดที่ได้รับผลจากการกู้ (ดู _restoreSummaryPeriods)
    const rp = this._restoreSummaryPeriods || { dateKeys: new Set(), monthKeys: new Set() };
    const rpDates = [...rp.dateKeys], rpMonths = [...rp.monthKeys];
    if (rpDates.length || rpMonths.length) {
      this.state.cloudOutbox.push({
        id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        createdAt: Date.now(),
        dateKeys: rpDates, monthKeys: rpMonths,
        needVoidDelete: false, voidDelete: null,
        needSummary: true, needTelegram: false, telegramMessage: '', tries: 0, rev: 0
      });
    }
    this.state.cart = [];

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
    if (typeof parsed.vatEnabled === 'boolean') this.vatEnabled = parsed.vatEnabled;
    if (Number.isFinite(Number(parsed.vatRate))) this.vatRate = Number(parsed.vatRate);
    // ไม่รับ ownerPin / telegramToken / googleSheetsApiToken จากไฟล์สำรอง
    // เพราะไฟล์ที่ถูกแก้หรือหลุดออกไปต้องไม่มีสิทธิ์เปลี่ยนบัญชีหรือเข้าถึงคลาวด์ของเครื่องนี้

    // ⚠️ URL คลาวด์: ถ้าเครื่องนี้ตั้งค่าไว้แล้ว ให้ยึดของเครื่องเป็นหลัก
    // ไฟล์สำรองเก่าอาจเก็บ URL ของ deployment รุ่นก่อน — ถ้าทับลงไป แอปจะยิงไป URL ที่ตายแล้ว
    // แบบเงียบ ๆ (ไม่มี error ให้เห็นทันที) แล้วยอดขายจะไม่ขึ้นชีตโดยไม่มีใครรู้
    if (parsed.googleSheetsUrl && !this.googleSheetsUrl) this.googleSheetsUrl = parsed.googleSheetsUrl;
    if (parsed.telegramChatId) this.telegramChatId = parsed.telegramChatId;

    this.clearDateKeyCache();   // ข้อมูลชุดใหม่ทั้งก้อน — ผลที่จำไว้ใช้ไม่ได้แล้ว
    this.invalidateReconcile('กู้/นำเข้าข้อมูลชุดใหม่');
    await this.saveStateOrThrow('ข้อมูลที่กู้คืน');
    persisted = true;
    this.renderEveryScreen();
    this.vibrateDevice(100);

    // ── บอกผลของ "งานคลาวด์ค้าง" ให้เจ้าของรู้เสมอ ──────────────────────
    // เรื่องนี้เงียบไม่ได้: ถ้าสร้างงานลบคืนไม่ได้ แถวบิลที่ยกเลิกจะค้างบนชีตถาวร
    // เจ้าของต้องรู้ว่าต้องไปลบเองหรือไม่ ก่อนจะเอาตัวเลขบนชีตไปใช้
    // บอกจำนวนบิลที่จะถูกส่งขึ้นชีตใหม่ — ถ้าเยอะจะใช้เวลาสักพัก ต้องไม่ให้ตกใจว่าแอปค้าง
    if (this._restoreResyncCount > 0) {
      this.showToast(
        `จะส่งบิล ${this._restoreResyncCount} ใบขึ้นชีตใหม่เพื่อให้ตรงกับข้อมูลที่กู้มา — ` +
        `ระบบทำให้เองเมื่อมีเน็ต (ส่งซ้ำไม่ทำให้เกิดแถวซ้ำ)`, 'info', 9000);
    }

    const cw = this._restoredCloudWork || {};
    if (cw.unsupported) {
      const hadVoids = Array.isArray(parsed.voidLog) && parsed.voidLog.length > 0;
      if (hadVoids) {
        this.showToast(
          'ไฟล์สำรองนี้เป็นรุ่นเก่า จึงไม่ได้เก็บ "งานที่ค้างส่งขึ้นชีต" มาด้วย — ' +
          'ถ้าเคยยกเลิกบิลตอนไม่มีเน็ต แถวบิลนั้นอาจยังค้างอยู่บนชีต ต้องเข้าไปลบเอง',
          'warning', 12000);
      }
    } else if (cw.voidDeletes || cw.summaries || cw.skipped) {
      const bits = [];
      if (cw.voidDeletes) bits.push(`คำสั่งลบบิลบนชีต ${cw.voidDeletes} รายการ`);
      if (cw.summaries)   bits.push(`งานรีเฟรชสรุป ${cw.summaries} งวด`);
      if (bits.length) this.showToast(`กู้งานที่ค้างส่งขึ้นชีตคืนมาด้วย: ${bits.join(' · ')} — ระบบจะส่งให้เองเมื่อมีเน็ต`, 'info', 9000);
      if (cw.skipped) {
        this.showToast(`ข้ามคำสั่งลบบิล ${cw.skipped} รายการ เพราะบิลใบนั้นยังอยู่ในข้อมูลที่กู้มา (กันลบบิลที่ยังใช้งานอยู่)`, 'warning', 10000);
      }
    }

    // เตือนซ้ำอีกครั้งหลังกู้เสร็จ ว่ามีอะไรเสียบ้าง — คนกดยืนยันตอนแรกอาจอ่านผ่าน
    if (!audit.clean) {
      const parts = [];
      if (audit.badMoney)    parts.push(`ยอดเงินหาย ${audit.badMoney} ใบ`);
      if (audit.badDate)     parts.push(`วันที่ใช้ไม่ได้ ${audit.badDate} ใบ`);
      if (audit.noId)        parts.push(`ไม่มีเลขที่บิล ${audit.noId} ใบ`);
      if (audit.dupId)       parts.push(`เลขที่ซ้ำ ${audit.dupId} ใบ`);
      if (audit.badExpenses) parts.push(`ค่าใช้จ่ายเสีย ${audit.badExpenses} รายการ`);
      if (audit.badServices) parts.push(`ราคาบริการเสีย ${audit.badServices} รายการ (ตั้งเป็น 0 บาท)`);
      if (audit.badLists)    parts.push(`รายการย่อยเสีย ${audit.badLists} จุด (ถูกล้างเป็นว่าง)`);
      this.showToast(
        `กู้ข้อมูลแล้ว แต่ไฟล์นี้มีส่วนที่เสีย: ${parts.join(' · ')} — ` +
        `รายการที่เหลือกู้ครบ ดูเลขที่บิลที่มีปัญหาได้ใน Console`,
        'warning', 10000);
    }
    } catch (err) {
      if (!persisted) {
      this.state = rollback.state;
      this.shopPromptPayId = rollback.shopPromptPayId;
      this.shopName = rollback.shopName;
      this.shopTagline = rollback.shopTagline;
      this.shopAddress = rollback.shopAddress;
      this.shopPhone = rollback.shopPhone;
      this.shopLogo = rollback.shopLogo;
      this.theme = rollback.theme;
      this.ownerPin = rollback.ownerPin;
      this.googleSheetsUrl = rollback.googleSheetsUrl;
      this.googleSheetsApiToken = rollback.googleSheetsApiToken;
      this.telegramToken = rollback.telegramToken;
      this.telegramChatId = rollback.telegramChatId;
      this.vatEnabled = rollback.vatEnabled;
      this.vatRate = rollback.vatRate;
      this.clearDateKeyCache();
      }
      throw err;
    }
  }

  // ==================== กู้ข้อมูลจาก GOOGLE DRIVE ====================

  // เปิดหน้าเลือกไฟล์สำรองที่อยู่บน Drive
  async openRestoreModal() {
    if (this.loadFailed) {
      this.showToast('โหลดข้อมูลไม่สำเร็จ — ปิดฟังก์ชันนี้ไว้เพื่อความปลอดภัย', 'error');
      return;
    }
    if (this.currentRole !== 'owner') {
      this.showToast('เฉพาะเจ้าของร้านเท่านั้นที่กู้ข้อมูลได้', 'warning');
      return;
    }
    if (!this.hasCloudSyncConfig()) {
      this.showToast(this.getCloudSetupMessage() + ' — กู้ข้อมูลจาก Drive ไม่ได้', 'warning', 5000);
      return;
    }
    this.openModal('modal-restore');
    await this.loadDriveBackups();
  }

  // แปลงเวลาไฟล์เป็นข้อความที่คนอ่านออก (วัน/เดือน/ปี พ.ศ. เวลา)
  formatBackupLabel(f) {
    const d = new Date(f && f.created);
    if (!f || isNaN(d.getTime())) return (f && f.name) || 'ไฟล์สำรอง';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
  }

  // ดึงรายชื่อไฟล์สำรองจาก Drive มาแสดง (ยังไม่ดาวน์โหลดเนื้อไฟล์ — เร็วแม้ไฟล์เยอะ)
  async loadDriveBackups() {
    const list = document.getElementById('restore-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted);">กำลังโหลดรายการไฟล์สำรอง...</div>';

    try {
      const res = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(this.buildCloudRequest('list_backups'))
      }, 20000);
      if (!res.ok) throw new Error(this.explainCloudError(`HTTP ${res.status}`));
      const d = await res.json();
      if (d.status !== 'success') throw new Error(this.explainCloudError(d.message) || 'คลาวด์แจ้งข้อผิดพลาด');

      const files = (d.details && Array.isArray(d.details.files)) ? d.details.files : [];
      if (!files.length) {
        list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted);">' +
          'ยังไม่มีไฟล์สำรองใน Google Drive<br>' +
          '<span style="font-size:0.8rem;">ไฟล์จะถูกสร้างอัตโนมัติทุกครั้งที่ปิดกะ</span></div>';
        return;
      }

      list.innerHTML = files.map((f, idx) => {
        const label = this.formatBackupLabel(f);
        const tag = idx === 0 ? '<span style="font-size:0.7rem;padding:2px 8px;border-radius:99px;background:var(--accent-premium,#f5c842);color:#1a1a1a;font-weight:700;">ล่าสุด</span>' : '';
        return '<button type="button" class="btn-small secondary restore-item"' +
          ` data-id="${escapeHtml(f.id)}" data-label="${escapeHtml(label)}"` +
          ' style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:12px 14px;text-align:left;min-height:52px;">' +
            `<span style="display:flex;flex-direction:column;gap:2px;"><b>${escapeHtml(label)}</b>` +
            `<span style="font-size:0.72rem;opacity:0.65;">${escapeHtml(f.name || '')} · ${Number(f.sizeKB) || 0} KB</span></span>` +
            tag +
          '</button>';
      }).join('');

      // ผูก event ทีหลัง ไม่ใช้ onclick ใน HTML — กันชื่อไฟล์ที่มีอัญประกาศไปทำ markup พัง
      list.querySelectorAll('.restore-item').forEach((btn) => {
        btn.onclick = () => this.restoreFromDriveBackup(btn.dataset.id, btn.dataset.label);
      });
    } catch (err) {
      console.error('list backups failed', err);
      list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--danger,#f43f6a);">' +
        'โหลดรายการไม่สำเร็จ<br><span style="font-size:0.8rem;line-height:1.5;">' +
        escapeHtml(this.explainCloudError(err)) + '</span></div>';
    }
  }

  // กู้ข้อมูลจากไฟล์ที่เลือก
  restoreFromDriveBackup(fileId, label) {
    if (!fileId) return;
    if (!this.requireOwnerForDataAction('กู้ข้อมูล')) return;
    const cur = `บิล ${this.state.transactions.length} รายการ · ลูกค้า ${this.state.customers.length} คน · ` +
                `ประวัติกะ ${(this.state.shift.history || []).length} กะ`;

    this.showConfirm(
      `กู้ข้อมูลจากไฟล์สำรองของวันที่ ${label} ใช่ไหม?\n\n` +
      `ข้อมูลในเครื่องนี้จะถูกเขียนทับทั้งหมด (ตอนนี้มี ${cur})\n\n` +
      `ระบบจะเก็บสำเนาข้อมูลปัจจุบันไว้ในเครื่องให้ก่อนเสมอ — ถ้ากู้ผิดไฟล์ กดปุ่ม "ย้อนกลับไปก่อนกู้ข้อมูล" ในหน้าตั้งค่าได้ทันที`,
      async () => {
        // กันกดรัวจนกู้ซ้อนกัน 2 รอบ (รอบหลังจะทับผลของรอบแรกกลางคัน)
        if (this.restoreBusy) return;
        this.restoreBusy = true;
        try {
          // 1) เซฟสำเนาของ "ตอนนี้" ลงเครื่องก่อนเสมอ — นี่คือทางกลับทางเดียวถ้าเลือกไฟล์ผิด
          //    ต้องทำก่อนดึงไฟล์ และต้องหยุดทั้งหมดถ้าเซฟไม่สำเร็จ
          try {
            await this.savePreRestoreSnapshot();
          } catch (snapErr) {
            console.error('pre-restore snapshot failed', snapErr);
            this.showToast('เก็บสำเนาก่อนกู้ข้อมูลไม่สำเร็จ — ยกเลิกการกู้เพื่อความปลอดภัย', 'error', 8000);
            return;
          }
          // เพิ่มอีกชั้น: พยายามโหลดเป็นไฟล์ .json ติดเครื่องไว้ด้วย (ล้มเหลวได้ ไม่หยุดงาน)
          this.exportData();

          // 2) ดึงเนื้อไฟล์ — ก้อนใหญ่กว่างานปกติมาก ให้เวลา 60 วิ
          this.showToast('กำลังดึงไฟล์สำรองจาก Google Drive...', 'info');
          const res = await this.fetchWithTimeout(this.googleSheetsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(this.buildCloudRequest('get_backup', { fileId }))
          }, 60000);
          if (!res.ok) throw new Error(this.explainCloudError(`HTTP ${res.status}`));
          const d = await res.json();
          if (d.status !== 'success') throw new Error(this.explainCloudError(d.message) || 'คลาวด์แจ้งข้อผิดพลาด');

          const parsed = d.details && d.details.backupData;
          if (!this.isValidBackupObject(parsed)) {
            throw new Error('ไฟล์สำรองใช้ไม่ได้' +
              (this._lastBackupRejectReason ? `: ${this._lastBackupRejectReason}` : ' (ไม่พบรายการบริการ/พนักงาน/บิล)') +
              ' — ลองเลือกไฟล์วันอื่น');
          }

          // 3) ตรวจสุขภาพไฟล์ — ตรวจได้หลังดาวน์โหลดเท่านั้น (ตอนกดเลือกยังไม่เห็นเนื้อไฟล์)
          //    ถ้าเสีย ต้องถามซ้ำอีกรอบ ไม่ใช่กู้ทับไปเลยแล้วค่อยบอกทีหลัง
          const audit = this.auditBackupData(parsed);
          if (!audit.clean) {
            console.warn('[Restore] ผลตรวจไฟล์:', audit, audit.damagedIds);
            const goOn = await this.askConfirm(
              this.describeBackupAudit(audit) + '\n\n──────────\n\nยังต้องการกู้จากไฟล์นี้ต่อไหม?\n' +
              '(ถ้าไม่แน่ใจ กดยกเลิกแล้วลองเลือกไฟล์วันอื่นดูก่อน — ข้อมูลในเครื่องยังไม่ถูกแตะ)'
            );
            if (!goOn) { this.showToast('ยกเลิกการกู้ข้อมูลแล้ว — ข้อมูลในเครื่องยังอยู่ครบ', 'info', 5000); return; }
          }

          // 4) เขียนลงเครื่อง (ใช้เส้นทางเดียวกับการนำเข้าไฟล์)
          await this.applyBackupData(parsed);
          await this.refreshPreRestoreUI();
          this.closeModal('modal-restore');
          this.showToast(`กู้ข้อมูลจากไฟล์วันที่ ${label} สำเร็จแล้ว — ถ้าผิดไฟล์ ย้อนกลับได้ที่หน้าตั้งค่า`, 'success', 8000);
          this.suggestReconcileAfterRestore();
        } catch (err) {
          console.error('restore failed', err);
          // ข้อมูลเดิมยังอยู่ครบ — applyBackupData ยังไม่ถูกเรียกถ้าพังก่อนถึงขั้นนั้น
          this.showToast('กู้ข้อมูลไม่สำเร็จ: ' + this.explainCloudError(err) + ' (ข้อมูลเดิมในเครื่องยังอยู่ครบ)', 'error', 9000);
        } finally {
          this.restoreBusy = false;
        }
      }
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ตรวจความตรงกันระหว่างเครื่องกับชีต (reconcile)
  // ══════════════════════════════════════════════════════════════════════
  // ⚠️ ทำไมต้องมี: การกู้ข้อมูลเปลี่ยน "ในเครื่อง" ทั้งก้อน แต่สิ่งที่ส่งขึ้นชีตได้คือ
  // upsert ของบิลที่อยู่ในไฟล์สำรองเท่านั้น บิลที่ขายหลังวันสำรองจึงยังอยู่บนชีต
  // ทั้งที่ในเครื่องไม่มีแล้ว → แท็บบิลรวม 500 แต่แท็บสรุปรวม 300 โดยไม่มีอะไรฟ้อง
  //
  // ระบบ "ไม่ลบให้เอง" โดยตั้งใจ — ประวัติบนคลาวด์คือของจริงที่เคยเกิดขึ้น
  // การให้ไฟล์สำรองเก่าลบมันทิ้งอัตโนมัติคือการทำลายหลักฐานที่กู้กลับไม่ได้
  // หน้าที่ของเครื่องมือนี้คือ "แสดงความต่าง" แล้วให้เจ้าของตัดสินใจทีละรายการ
  reconcileMonthsToCheck() {
    const set = new Set();
    (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
      if (!tx || !tx.date) return;
      const mk = this.getBusinessMonthKey(tx.date);
      if (this.isValidMonthKey(mk)) set.add(mk);
    });
    // งวดที่เพิ่งได้รับผลจากการกู้ข้อมูล — สำคัญที่สุด เพราะเป็นงวดที่ข้อมูลเพิ่งถูกสลับทั้งก้อน
    const rp = this._restoreSummaryPeriods;
    if (rp && rp.monthKeys) rp.monthKeys.forEach(mk => { if (this.isValidMonthKey(mk)) set.add(mk); });
    const nowKey = this.getBusinessMonthKey(Date.now());
    if (this.isValidMonthKey(nowKey)) set.add(nowKey);
    // ใหม่ → เก่า และจำกัดจำนวนเดือน ไม่งั้นกดครั้งเดียวยิงคำขอเป็นสิบ ๆ ครั้งจนโดนโควตา
    const ord = mk => mk.slice(3) + mk.slice(0, 2);
    return [...set].sort((a, b) => ord(b).localeCompare(ord(a))).slice(0, 24);
  }

  async fetchCloudBills(monthKey) {
    const r = await this.fetchWithTimeout(this.googleSheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(this.buildCloudRequest('list_bills', { monthKey }))
    });
    if (!r.ok) throw new Error(this.explainCloudError(`HTTP ${r.status}`));
    const d = await r.json();
    if (!d || d.status !== 'success') {
      throw new Error(this.explainCloudError(d && d.message) || 'อ่านรายการบิลจากชีตไม่สำเร็จ');
    }
    return d.details || { bills: [], exists: false, truncated: false };
  }

  // บิลใบนี้ยังมีอยู่ในเครื่องไหม (ทุกเดือน ไม่ใช่เฉพาะเดือนที่ตรวจ)
  reconcileBillExistsLocally(id) {
    const key = String(id);
    return (Array.isArray(this.state.transactions) ? this.state.transactions : [])
      .some(tx => tx && String(tx.id) === key);
  }

  // ผลตรวจใช้ไม่ได้แล้ว — ต้องล้างหน้าจอด้วย ไม่ใช่ปล่อยปุ่มเดิมค้างให้กดได้
  renderReconcileStale() {
    const body = document.getElementById('reconcile-body');
    if (body) {
      body.innerHTML = '<p style="color:var(--accent-premium);font-size:0.85rem;">' +
        'ข้อมูลในเครื่องเปลี่ยนไปหลังจากตรวจรอบที่แล้ว ผลตรวจชุดนี้จึงใช้ไม่ได้<br>' +
        'กด "เริ่มตรวจ" อีกครั้งเพื่อดูสถานะล่าสุด</p>';
    }
    this.setReconcileStatus('');
  }

  // ข้อมูลในเครื่องถูกเปลี่ยนทั้งชุด → ผลตรวจที่ค้างอยู่กลายเป็นของเก่าทันที
  invalidateReconcile(reason) {
    if (!this._reconcile) return;
    console.warn('[Reconcile] ทิ้งผลตรวจเดิม:', reason || '');
    this._reconcile = null;
    this.renderReconcileStale();
  }

  openReconcileModal() {
    // ⚠️ เครื่องมือนี้ "อ่านบิลย้อนหลังได้ 24 เดือน" และ "สั่งลบแถวบนชีตได้"
    // ซึ่งแรงกว่าสิ่งที่พนักงานทำได้ทุกอย่างในแอป (ยกเลิกบิลยังต้องเป็นผู้จัดการขึ้นไป)
    // จึงต้องเป็นสิทธิ์เจ้าของเท่านั้น เท่ากับปุ่มสำรอง/กู้ข้อมูลที่อยู่ในกล่องเดียวกัน
    if (!this.requireOwnerForDataAction('ตรวจความตรงกันกับชีต')) return;
    this._reconcile = null;
    this.openModal('modal-reconcile');
    const el = document.getElementById('reconcile-body');
    if (el) {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;">' +
        'กด "เริ่มตรวจ" เพื่ออ่านรายการบิลบนชีตแล้วเทียบกับข้อมูลในเครื่องนี้<br>' +
        'ระบบจะไม่แก้อะไรบนชีตจนกว่าคุณจะกดเลือกเอง</p>';
    }
  }

  setReconcileStatus(text, tone) {
    const el = document.getElementById('reconcile-status');
    if (!el) return;
    el.style.color = tone === 'error' ? 'var(--color-danger)' : 'var(--text-secondary)';
    el.innerText = text || '';
  }

  async runCloudReconcile() {
    if (!this.requireOwnerForDataAction('ตรวจความตรงกันกับชีต')) return;
    if (this._reconcileBusy) return;
    if (!this.hasCloudSyncConfig()) { this.showToast(this.getCloudSetupMessage(), 'info'); return; }
    this._reconcileBusy = true;
    this.setReconcileStatus('กำลังอ่านรายการบิลจากชีต…');
    try {
      const months = this.reconcileMonthsToCheck();
      const result = { months: [], extra: [], missing: [], mismatch: [], wrongTab: [], errors: [], truncated: false, at: Date.now() };
      // ⚠️ ชุด ID ของบิลในเครื่อง "ทุกเดือน" — ใช้กันเคสที่อันตรายที่สุดของเครื่องมือนี้:
      // บิลที่ยังมีชีวิตอยู่ในเครื่อง แต่แถวของมันไปอยู่ผิดแท็บเดือนบนชีต
      // ถ้าไม่กัน มันจะถูกจัดเป็น "มีบนชีตแต่ไม่มีในเครื่อง" แล้วเจ้าของกดลบแถวของบิลจริงทิ้ง
      const localMonthOf = new Map();
      (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
        if (tx && tx.id != null) localMonthOf.set(String(tx.id), tx.date ? this.getBusinessMonthKey(tx.date) : '');
      });
      // ใช้คิวคลาวด์เดียวกับงานอื่น — ไม่ให้อ่านคร่อมจังหวะที่กำลังเขียนอยู่
      await this.runCloudTask(async () => {
        for (const mk of months) {
          let info;
          try {
            info = await this.fetchCloudBills(mk);
          } catch (e) {
            result.errors.push({ monthKey: mk, message: (e && e.message) || String(e) });
            continue;
          }
          result.months.push(mk);
          if (info.truncated) result.truncated = true;

          const sheetMap = new Map();
          (Array.isArray(info.bills) ? info.bills : []).forEach(b => {
            if (b && b.id) sheetMap.set(String(b.id), b);   // b.idOk ติดมาด้วย (ดู actionFor)
          });
          const localMap = new Map();
          (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
            if (tx && tx.date && this.getBusinessMonthKey(tx.date) === mk) localMap.set(String(tx.id), tx);
          });

          sheetMap.forEach((b, id) => {
            const tx = localMap.get(id);
            if (!tx) {
              const bucket = localMonthOf.has(id) ? result.wrongTab : result.extra;
              bucket.push({ monthKey: mk, id, when: b.when || '', customer: b.customer || '',
                            total: Number(b.total) || 0, idOk: b.idOk !== false,
                            localMonthKey: localMonthOf.get(id) || '' });
              return;
            }
            // เทียบเป็นสตางค์จำนวนเต็ม — เทียบทศนิยมตรง ๆ จะเจอ 0.1+0.2 ไม่เท่ากับ 0.3
            const localSat = Math.round((Number(tx.total) || 0) * 100);
            const cloudSat = Math.round((Number(b.total) || 0) * 100);
            if (localSat !== cloudSat) {
              result.mismatch.push({ monthKey: mk, id, localTotal: localSat / 100, cloudTotal: cloudSat / 100, when: b.when || '' });
            }
          });
          localMap.forEach((tx, id) => {
            if (sheetMap.has(id)) return;
            result.missing.push({
              monthKey: mk, id, total: Number(tx.total) || 0,
              customer: tx.customerName || '',
              // บิลที่ยังไม่ได้ซิงก์ไม่ใช่ "ข้อมูลหาย" — แค่ยังไม่ถึงคิว ต้องแยกให้เจ้าของเห็น
              pending: tx.syncStatus !== 'synced'
            });
          });
        }
      });
      this._reconcile = result;
      this.renderReconcileResult();
    } catch (err) {
      console.error('reconcile failed', err);
      this.setReconcileStatus('ตรวจไม่สำเร็จ: ' + this.explainCloudError(err), 'error');
    } finally {
      this._reconcileBusy = false;
    }
  }

  renderReconcileResult() {
    const body = document.getElementById('reconcile-body');
    const r = this._reconcile;
    if (!body || !r) return;
    const baht = v => `฿${(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    const notSynced = r.missing.filter(m => m.pending);
    const trulyMissing = r.missing.filter(m => !m.pending);
    const parts = [];

    parts.push(`<p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 10px;">
      ตรวจแล้ว ${r.months.length} เดือน (${r.months.map(m => escapeHtml(m)).join(', ') || '-'})
      ${r.truncated ? '<br><b style="color:var(--accent-premium);">บางเดือนมีบิลมากเกินกว่าจะอ่านครบในรอบเดียว</b>' : ''}
    </p>`);

    if (r.errors.length) {
      parts.push(`<div style="border:1px solid var(--color-danger);border-radius:8px;padding:10px;margin-bottom:10px;">
        <b style="color:var(--color-danger);">อ่านไม่สำเร็จ ${r.errors.length} เดือน</b>
        <ul style="margin:6px 0 0 16px;font-size:0.8rem;">${r.errors.map(e =>
          `<li>${escapeHtml(e.monthKey)} — ${escapeHtml(e.message)}</li>`).join('')}</ul></div>`);
    }

    // ⚠️ "ไม่พบความต่าง" กับ "ตรวจไม่สำเร็จ" ไม่ใช่เรื่องเดียวกัน
    // ถ้าอ่านชีตไม่ได้บางเดือน (หรือทุกเดือน) แล้วยังขึ้นเครื่องหมายถูกสีเขียว
    // เจ้าของจะเข้าใจว่ายอดตรงกันแล้วทั้งที่ระบบไม่เคยเห็นข้อมูลเดือนนั้นเลย
    // — เป็นความผิดพลาดชนิดเดียวกับ "บันทึกไม่สำเร็จแต่แจ้งว่าสำเร็จ" ที่ไล่แก้มาทั้งโปรเจกต์
    const scanComplete = r.errors.length === 0 && r.months.length > 0 && !r.truncated;
    if (!r.extra.length && !trulyMissing.length && !r.mismatch.length && !r.wrongTab.length && !scanComplete) {
      parts.push(`<div style="border:1px solid var(--accent-premium);border-radius:8px;padding:12px;">
        <b style="color:var(--accent-premium);"><i class="fa-solid fa-triangle-exclamation"></i> ยังสรุปไม่ได้ว่าตรงกัน</b>
        <p style="font-size:0.8rem;margin:6px 0 0;color:var(--text-secondary);">
          ${r.months.length === 0 ? 'อ่านรายการบิลจากชีตไม่สำเร็จเลยสักเดือน' :
            (r.errors.length ? `อ่านไม่สำเร็จ ${r.errors.length} เดือน` : 'บางเดือนมีบิลมากเกินกว่าจะอ่านครบในรอบเดียว')}
          — ในส่วนที่อ่านได้ยังไม่พบความต่าง แต่ยังไม่ครบทุกเดือน แก้ปัญหาด้านบนแล้วกดตรวจใหม่</p>
      </div>`);
      body.innerHTML = parts.join('');
      this.setReconcileStatus(`ตรวจไม่ครบ เมื่อ ${new Date(r.at).toLocaleTimeString('th-TH')}`, 'error');
      return;
    }

    if (!r.extra.length && !trulyMissing.length && !r.mismatch.length && !r.wrongTab.length) {
      parts.push(`<div style="border:1px solid var(--color-success);border-radius:8px;padding:12px;">
        <b style="color:var(--color-success);"><i class="fa-solid fa-circle-check"></i> ข้อมูลในเครื่องกับบนชีตตรงกัน</b>
        ${notSynced.length ? `<p style="font-size:0.8rem;margin:6px 0 0;color:var(--text-secondary);">
          มีบิล ${notSynced.length} ใบที่ยังรอส่งขึ้นชีตตามปกติ (ไอคอนคลาวด์จะจัดการให้เอง)</p>` : ''}
      </div>`);
      body.innerHTML = parts.join('');
      this.setReconcileStatus(`ตรวจเสร็จเมื่อ ${new Date(r.at).toLocaleTimeString('th-TH')}`);
      return;
    }

    const row = (cells, actions) => `<tr>${cells}<td style="white-space:nowrap;">${actions}</td></tr>`;
    // วาดมากสุด 200 แถวต่อกลุ่ม — เคสกู้ไฟล์เก่ามาก ๆ อาจต่างกันเป็นพันใบ
    // ถ้าวาดหมดหน้าจะค้างบน iPad จนกดอะไรไม่ได้เลย
    const CAP = 200;
    const more = (list) => list.length > CAP
      ? `<p style="font-size:0.78rem;color:var(--text-muted);margin:6px 0 0;">
           แสดง ${CAP} รายการแรกจากทั้งหมด ${list.length} รายการ — จัดการชุดนี้ก่อนแล้วกดตรวจใหม่</p>` : '';
    // ⚠️ เลขที่บิลตรงนี้มาจาก "แถวบนชีต" ซึ่งคนแก้ด้วยมือได้ ไม่ใช่ ID ที่ระบบสร้างเอง
    // ID ที่ต่อเข้า onclick ต้องผ่าน safeId() เท่านั้น — escapeHtml() กันตรงนี้ไม่ได้
    // (&#39; ถูกถอดกลับเป็น ' ก่อนเบราว์เซอร์รันโค้ด · เหตุผลเต็มอยู่ที่นิยามของ safeId)
    // รูปแบบผิด = ไม่ให้ปุ่ม แต่ยังต้องแสดงแถวนั้นให้เห็น ไม่งั้นเจ้าของไม่รู้ว่ามีของแปลกบนชีต
    // idOk = ผลตรวจรูปแบบจากฝั่งชีต (BILL_ID_RE) ต้องเช็คด้วย ไม่ใช่แค่ safeId
    // ไม่งั้นจะขึ้นปุ่มให้กด แล้วปลายทางปฏิเสธ INVALID_BILL_ID = เจ้าของกดแล้วงง
    const actionFor = (id, fn, label, style, idOk) => {
      if (idOk === false || !safeId(id)) return '<span style="font-size:0.75rem;color:var(--text-muted);">เลขที่บิลผิดรูปแบบ — ต้องแก้ในชีตเอง</span>';
      return `<button class="btn-small ${style ? 'secondary' : 'primary'}" style="${style}" onclick="${fn}('${safeId(id)}')">${label}</button>`;
    };

    if (r.extra.length) {
      const sum = r.extra.reduce((s, x) => s + (Number(x.total) || 0), 0);
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-premium);">มีบนชีตแต่ไม่มีในเครื่องนี้ — ${r.extra.length} ใบ · รวม ${baht(sum)}</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          มักเกิดจากการกู้ไฟล์สำรองเก่า (บิลที่ขายหลังวันสำรอง) หรือเครื่องอื่นเคยส่งขึ้นไป<br>
          <b>ตรวจกับใบเสร็จจริงก่อนลบเสมอ — ลบแล้วกู้แถวคืนจากที่นี่ไม่ได้</b>
        </p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>เวลา</th><th>ลูกค้า</th><th>ยอด</th><th></th></tr></thead>
          <tbody>${r.extra.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td><td>${escapeHtml(x.when)}</td>` +
            `<td>${escapeHtml(x.customer || '-')}</td><td>${baht(x.total)}</td>`,
            actionFor(x.id, 'app.reconcileDeleteSheetBill', 'ลบแถวบนชีต',
                      'border-color:var(--color-danger);color:var(--color-danger);', x.idOk)
          )).join('')}</tbody></table></div>${more(r.extra)}</div>`);
    }

    if (r.wrongTab.length) {
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-premium);">อยู่คนละแท็บเดือนกับในเครื่อง — ${r.wrongTab.length} ใบ</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          บิลเหล่านี้ <b>ยังมีอยู่ในเครื่อง</b> แต่แถวบนชีตไปอยู่ผิดแท็บเดือน ระบบจึงไม่เสนอปุ่มลบให้
          เพราะการลบอาจทำให้บิลที่ยังใช้งานอยู่หายจากชีต<br>
          วิธีจัดการ: กด "ส่งขึ้นชีตใหม่" ในกลุ่มด้านล่างให้แถวไปลงแท็บที่ถูกต้องก่อน แล้วค่อยลบแถวนี้ในชีตด้วยมือ</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>แท็บที่พบ</th><th>เดือนจริงของบิล</th><th>ยอดบนชีต</th><th></th></tr></thead>
          <tbody>${r.wrongTab.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td><td>${escapeHtml(x.monthKey)}</td>` +
            `<td>${escapeHtml(x.localMonthKey || 'ไม่ทราบ')}</td><td>${baht(x.total)}</td>`,
            '<span style="font-size:0.75rem;color:var(--text-muted);">ลบในชีตเอง</span>'
          )).join('')}</tbody></table></div>${more(r.wrongTab)}</div>`);
    }

    if (trulyMissing.length) {
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-massage);">มีในเครื่องแต่ไม่มีบนชีต — ${trulyMissing.length} ใบ</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          บิลเหล่านี้ระบบถือว่าส่งขึ้นชีตแล้ว แต่บนชีตไม่มีแถว — กดส่งใหม่ได้เลย ปลอดภัย (ชีตเขียนทับตามเลขที่บิล)</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>ลูกค้า</th><th>ยอด</th><th></th></tr></thead>
          <tbody>${trulyMissing.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td><td>${escapeHtml(x.customer || '-')}</td><td>${baht(x.total)}</td>`,
            actionFor(x.id, 'app.reconcileResendBill', 'ส่งขึ้นชีตใหม่', '')
          )).join('')}</tbody></table></div>${more(trulyMissing)}</div>`);
    }

    if (r.mismatch.length) {
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-premium);">ยอดไม่ตรงกัน — ${r.mismatch.length} ใบ</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          ยอดในเครื่องคือยอดที่ระบบใช้คิดรายงานทั้งหมด — กดส่งทับเพื่อให้ชีตตรงกับเครื่อง</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>ในเครื่อง</th><th>บนชีต</th><th></th></tr></thead>
          <tbody>${r.mismatch.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td><td>${baht(x.localTotal)}</td><td>${baht(x.cloudTotal)}</td>`,
            actionFor(x.id, 'app.reconcileResendBill', 'ส่งยอดในเครื่องทับ', '')
          )).join('')}</tbody></table></div>${more(r.mismatch)}</div>`);
    }

    if (notSynced.length) {
      parts.push(`<p style="font-size:0.78rem;color:var(--text-muted);">
        อีก ${notSynced.length} ใบยังรอคิวส่งขึ้นชีตตามปกติ ไม่ต้องทำอะไร</p>`);
    }

    body.innerHTML = parts.join('');
    this.setReconcileStatus(`ตรวจเสร็จเมื่อ ${new Date(r.at).toLocaleTimeString('th-TH')}`);
  }

  // ลบแถวบนชีตทีละใบ — ผ่านเส้นทางเดียวกับการยกเลิกบิลปกติ (มีทะเบียนกันคำขอเก่าคืนแถว)
  reconcileDeleteSheetBill(billId) {
    const id = String(billId || '');
    const r = this._reconcile;
    const item = r && r.extra.find(x => String(x.id) === id);
    if (!item) return;
    if (!this.requireOwnerForDataAction('ลบแถวบนชีต')) return;
    if (!this.canWriteData('ลบแถวบนชีต')) return;
    // ⚠️ ผลตรวจคือ "ภาพถ่าย ณ เวลาที่กดตรวจ" ไม่ใช่ความจริงปัจจุบัน
    // เคสจริงที่พิสูจน์แล้ว: หน้าต่างรองตรวจตอนข้อมูลในหน่วยความจำยังเก่า → บิลที่หน้าต่างหลัก
    // เพิ่งขายถูกจัดว่า "มีบนชีตแต่ไม่มีในเครื่อง" → ปิดหน้าต่างหลัก → หน้าต่างนี้รับสิทธิ์และ
    // โหลดข้อมูลใหม่จนมีบิลใบนั้นแล้ว → แต่ปุ่มลบจากผลตรวจเก่ายังอยู่ → กดแล้วลบบิลจริงทิ้ง
    // การเช็คว่า "หน้าต่างนี้เขียนได้" ไม่พอ ต้องเช็คว่าบิลใบนั้นยังเป็นรายการเกินอยู่จริง
    if (this.reconcileBillExistsLocally(id)) {
      this._reconcile = null;
      this.renderReconcileStale();
      this.showToast(
        `บิล ${id.slice(0, 24)} มีอยู่ในเครื่องนี้แล้ว — ไม่ลบให้ ผลตรวจชุดนี้เก่าไปแล้ว กด "เริ่มตรวจ" ใหม่`,
        'warning', 9000);
      return;
    }
    this.showConfirm(
      `ลบแถวบิล ${id} ออกจากชีตเดือน ${item.monthKey}?\n\n` +
      `ยอด ${(Number(item.total) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท · ${item.when || '-'}\n\n` +
      'แถวบนชีตจะถูกลบถาวรและกู้กลับจากที่นี่ไม่ได้ — ระบบจะบันทึกไว้ในประวัติการแก้ไขย้อนหลังให้',
      async () => {
        // ระหว่างที่กล่องยืนยันค้างอยู่ ข้อมูลในเครื่องเปลี่ยนได้ (รับสิทธิ์จากอีกหน้าต่าง /
        // กู้ข้อมูล / ซิงก์เข้ามา) จึงต้องตรวจซ้ำ "ตรงจุดที่กำลังจะเขียนคำสั่งลบ" อีกครั้ง
        if (!this.requireOwnerForDataAction('ลบแถวบนชีต')) return;
        if (!this.canWriteData('ลบแถวบนชีต')) return;
        if (this.reconcileBillExistsLocally(id)) {
          this._reconcile = null;
          this.renderReconcileStale();
          this.showToast(`บิล ${id.slice(0, 24)} มีอยู่ในเครื่องนี้แล้ว — ยกเลิกการลบ`, 'warning', 9000);
          return;
        }
        const prevOutbox = Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox.slice() : [];
        const prevVoidLog = Array.isArray(this.state.voidLog) ? this.state.voidLog.slice() : [];
        const billTs = Date.parse(item.when || '') || Date.now();
        const billDateKey = this.getBusinessISODate(billTs);
        if (!Array.isArray(this.state.voidLog)) this.state.voidLog = [];
        this.state.voidLog.push({
          billId: id, date: Date.now(), billDate: billTs, billMonthKey: item.monthKey,
          by: (this.currentUser ? this.currentUser.name : '') + ' (ตรวจความตรงกันกับชีต)',
          amount: Number(item.total) || 0, customer: item.customer || '', services: []
        });
        if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
        this.state.cloudOutbox.push({
          id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          createdAt: Date.now(),
          dateKeys: this.isValidDateKey(billDateKey) ? [billDateKey] : [], monthKeys: [item.monthKey],
          needVoidDelete: true,
          voidDelete: { id: id, date: billTs, monthKey: item.monthKey, voidedBy: this.currentUser ? this.currentUser.name : '', voidedAt: Date.now() },
          needSummary: true, needTelegram: false, telegramMessage: '', tries: 0, rev: 0
        });
        try {
          await this.saveStateOrThrow('การลบแถวบนชีต');
        } catch (err) {
          this.state.cloudOutbox = prevOutbox;
          this.state.voidLog = prevVoidLog;
          this.showToast('บันทึกคำสั่งลบไม่สำเร็จ — ยังไม่มีอะไรถูกลบบนชีต: ' + (err.message || err), 'error', 8000);
          return;
        }
        this.showToast(`สั่งลบแถวบิล ${id} แล้ว — กด "เริ่มตรวจ" อีกครั้งเพื่อยืนยันผล`, 'info', 7000);
        await this.flushCloudOutbox();
      });
  }

  // ส่งบิลในเครื่องขึ้นชีตใหม่ (ปลอดภัยเสมอ — ฝั่งชีตเป็น upsert ตามเลขที่บิล)
  async reconcileResendBill(billId) {
    const id = String(billId || '');
    const tx = (Array.isArray(this.state.transactions) ? this.state.transactions : [])
      .find(t => t && String(t.id) === id);
    if (!tx) { this.showToast('ไม่พบบิลใบนี้ในเครื่องแล้ว', 'warning'); return; }
    if (!this.requireOwnerForDataAction('ส่งบิลขึ้นชีตจากหน้าตรวจความตรงกัน')) return;
    if (!this.canWriteData('ส่งบิลขึ้นชีต')) return;
    const prev = tx.syncStatus;
    tx.syncStatus = 'pending';
    try {
      await this.saveStateOrThrow('การสั่งส่งบิลขึ้นชีตใหม่');
    } catch (err) {
      tx.syncStatus = prev;
      this.showToast('บันทึกไม่สำเร็จ — ยังไม่ได้ส่งอะไรขึ้นชีต: ' + (err.message || err), 'error', 8000);
      return;
    }
    this.checkSyncStatus();
    await this.syncPendingTransactions(true);
    this.showToast(`ส่งบิล ${id} ขึ้นชีตแล้ว — กด "เริ่มตรวจ" อีกครั้งเพื่อยืนยันผล`, 'info', 7000);
  }

  // ชวนตรวจทันทีหลังกู้/ย้อนข้อมูล — ช่วงเวลาเดียวที่ความต่างมีโอกาสเกิดมากที่สุด
  //
  // ⚠️ ตั้งใจ "เปิดหน้าให้" เฉย ๆ ไม่ยิงคำขออ่านชีตเองอัตโนมัติ
  // เหตุผลเดียวกับที่ไม่ลบแถวให้เอง: ทุกการแตะคลาวด์ต้องเกิดจากนิ้วของเจ้าของ
  // (และงานเบื้องหลังที่ยิงเองแบบไม่มีใครรอผล เป็นต้นเหตุของบั๊กที่ตามยากที่สุดในระบบนี้)
  suggestReconcileAfterRestore() {
    if (!this.hasCloudSyncConfig()) return;
    this.showConfirm(
      'กู้ข้อมูลเรียบร้อยแล้ว\n\n' +
      'ข้อมูลในเครื่องถูกแทนที่ทั้งชุด แต่บนชีตอาจยังมีบิลที่ขาย "หลัง" วันสำรองค้างอยู่ ' +
      'ซึ่งจะทำให้แท็บบิลกับแท็บสรุปไม่ตรงกัน\n\nเปิดหน้า "ตรวจความตรงกันกับชีต" เลยไหม?',
      () => { this.openReconcileModal(); }
    );
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
      `🛠️ <b>ปิดโดย:</b> ${shiftLog.closedBy ? escapeTelegram(shiftLog.closedBy) : '-'}\n\n` +
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

  // หมายเหตุ: sendTelegramReport() ถูกลบออกในเวอร์ชัน 1.5.2 — ไม่มีที่ไหนเรียกแล้ว
  // การแจ้งเตือนปิดกะเดินผ่าน cloudOutbox (enqueueShiftCloseCloudOps → flushCloudOutbox) ซึ่ง retry ได้จริง
  // ต่างจากตัวเก่าที่ยิงครั้งเดียว เน็ตสะดุดแล้วรายงานหายเลย

  // ── ไล่ "วันทำการ" ทุกวันในช่วงเวลาหนึ่ง (รวมวันหัวและวันท้าย) ────────────
  // ⚠️ ทำไมต้องไล่ทีละวัน ไม่ใช่เก็บแค่หัวกับท้าย:
  // กะปกติเปิด 20:00 ปิดตี 3 = วันทำการเดียว เก็บแค่หัวท้ายก็ครบ
  // แต่วันไหนลืมปิดกะข้ามวัน (เปิดวันที่ 1 ไปปิดวันที่ 4) การเก็บแค่หัวท้ายทำให้
  // **วันที่ 2 และ 3 ไม่มีอะไรไปสั่งอัปเดตสรุปเลย** บิลของสองวันนั้นขึ้นแท็บบิลครบ
  // (เพราะบิลส่งทีละใบของมันเอง) แต่แท็บสรุปของวันนั้นไม่เกิดขึ้นบนชีต
  // เปิดรายงานย้อนหลังแล้วจะเจอวันที่หายไปดื้อ ๆ ทั้งที่มียอดขายจริง
  //
  // เพดาน 62 วัน: กันกรณีเวลาของกะเพี้ยน (เช่น startTime หลุดเป็นปี 1970)
  // แล้วระบบสร้างคำขอเป็นร้อย ๆ ครั้งจนชนโควตาของ Apps Script
  // เกินเพดานให้ถอยกลับไปเก็บแค่หัวท้ายแบบเดิม และเขียน console ไว้ ไม่เงียบหาย
  businessPeriodKeysBetween(fromTs, toTs) {
    const dateKeys = [], monthKeys = [];
    const addKey = (dk, mk) => {
      if (this.isValidDateKey(dk) && dateKeys.indexOf(dk) === -1) dateKeys.push(dk);
      if (this.isValidMonthKey(mk) && monthKeys.indexOf(mk) === -1) monthKeys.push(mk);
    };
    const addFromTs = (ts) => addKey(this.getBusinessISODate(ts), this.getBusinessMonthKey(ts));

    const a = this.getBusinessTime(fromTs), b = this.getBusinessTime(toTs);
    if (isNaN(a) || isNaN(b)) { addFromTs(fromTs); addFromTs(toTs); return { dateKeys, monthKeys }; }

    // a และ b เลื่อนตามชั่วโมงตัดวันมาแล้ว จึงนับ "วันบนปฏิทิน" ของค่านี้ได้ตรง ๆ
    // ตั้งเวลาเป็นเที่ยงวันก่อนเดิน กันเคสที่บวกวันแล้วเวลาไปตกคาบเกี่ยวเที่ยงคืนพอดี
    const cur = new Date(Math.min(a, b)); cur.setHours(12, 0, 0, 0);
    const last = new Date(Math.max(a, b)); last.setHours(12, 0, 0, 0);
    const spanDays = Math.round((last.getTime() - cur.getTime()) / 86400000);
    if (!(spanDays >= 0) || spanDays > 62) {
      console.warn('[Shift] ช่วงเวลาของกะยาวผิดปกติ (' + spanDays + ' วัน) — คิวสรุปเฉพาะวันเปิดกับวันปิด');
      addFromTs(fromTs); addFromTs(toTs);
      return { dateKeys, monthKeys };
    }
    for (let i = 0; i <= spanDays; i++) {
      const d = new Date(cur.getTime());
      d.setDate(d.getDate() + i);
      addKey(this.getLocalISODate(d.getTime()),
             `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`);
    }
    return { dateKeys, monthKeys };
  }

  // เก็บงานคลาวด์ตอนปิดกะลง outbox (persist) — สรุปวัน/เดือน + Telegram
  // เพื่อ "การันตีส่ง" แม้ปิดกะตอนออฟไลน์ แล้ว retry เองเมื่อเน็ตกลับ
  enqueueShiftCloseCloudOps(shiftLog) {
    // ใช้ "วันทำการ" — กะปกติ 11:00 → ตี 3 เปิด/ปิดเป็นวันทำการเดียวกัน จึงได้วันเดียว
    // ถ้ากะลากยาวข้ามวัน จะได้ทุกวันระหว่างนั้น ไม่ใช่แค่หัวกับท้าย (ดู businessPeriodKeysBetween)
    const openTs  = shiftLog.startTime || shiftLog.endTime;
    const closeTs = shiftLog.endTime;
    const { dateKeys, monthKeys } = this.businessPeriodKeysBetween(openTs, closeTs);
    // กะที่ไม่มีเวลาเปิด/ปิดที่ใช้ได้เลย — ส่งสรุปไม่ได้ แต่ยังส่ง Telegram ได้
    // ถ้าร้านตั้ง URL/token ไว้เพียงบางส่วน (เช่นเพิ่งอัปเดต Apps Script แต่ยังไม่วาง token)
    // ต้องคิวสรุปไว้ก่อน มิฉะนั้นการปิดกะระหว่างนั้นจะหายจาก Sheets แบบถาวร
    const needSummary  = this.hasCloudSetupStarted() && (dateKeys.length > 0 || monthKeys.length > 0);
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
    if (!this.hasCloudSetupStarted()) return;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return;
    const dateKey  = this.getBusinessISODate(d);   // วันทำการของบิลที่ถูกแก้
    const monthKey = this.getBusinessMonthKey(d);
    if (!this.isValidDateKey(dateKey) && !this.isValidMonthKey(monthKey)) {
      console.warn('[Guard] ไม่คิวสรุป — วันที่ของบิลใช้ไม่ได้', dateVal);
      return;
    }
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    // ถ้ามีงานสรุปของวันเดียวกันค้างอยู่แล้ว ไม่ต้องคิวซ้ำ (flush จะ recompute จาก state ล่าสุดอยู่แล้ว)
    // ⚠️ เดิม "เจองานของวันเดียวกันค้างอยู่ → ทิ้งงานใหม่" ซึ่งพลาดเมื่องานเดิมกำลังส่งอยู่
    // ลำดับที่พัง: ส่งสรุปยอด 300 → ผู้ใช้แก้เป็น 400 → เห็นว่ามีงานเดิมจึงทิ้งงานใหม่
    //             → คำตอบของรุ่น 300 กลับมาว่าสำเร็จ → เคลียร์งานทิ้ง = ชีตค้างที่ 300 ถาวร
    // แก้ด้วยเลขรุ่น: บวกรุ่นแทนการทิ้ง แล้วตอน flush เคลียร์ได้เฉพาะรุ่นที่ส่งไปจริงเท่านั้น
    const existing = this.state.cloudOutbox.find(it => it.needSummary &&
      (it.dateKeys || [it.dateKey]).includes(dateKey));
    if (existing) {
      existing.rev = (existing.rev || 0) + 1;
      if (Array.isArray(existing.monthKeys) && !existing.monthKeys.includes(monthKey) && this.isValidMonthKey(monthKey)) {
        existing.monthKeys.push(monthKey);
      }
      return;
    }
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
    return this.runCloudTask(() => this._doFlushCloudOutbox());
  }

  async _doFlushCloudOutbox() {
    if (!this.canWriteData()) return;   // ดูเหตุผลที่ canWriteData()
    if (this._flushingOutbox) return;
    if (!Array.isArray(this.state.cloudOutbox) || this.state.cloudOutbox.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // ออฟไลน์ — ไว้ค่อยส่ง
    this._flushingOutbox = true;
    let delivered = 0;
    let attempted = false; // มีการลองยิงจริงไหม — ใช้ตัดสินว่าต้องเซฟตัวนับ backoff ลงเครื่องหรือเปล่า
    try {
      for (const item of this.state.cloudOutbox.slice()) {
        // Backoff: ล้มเหลวติดกัน 3 ครั้งขึ้นไป → เว้นระยะ 5 นาทีก่อนลองใหม่ (กันยิงรัวตอน URL ผิด/GAS ล่ม)
        if ((item.tries || 0) >= 3 && item.lastTry && (Date.now() - item.lastTry) < 5 * 60 * 1000) continue;
        item.tries = (item.tries || 0) + 1;
        item.lastTry = Date.now();
        attempted = true;

        // รองรับทั้งรูปแบบใหม่ (dateKeys/monthKeys เป็น array) และรายการเก่าที่ค้างใน outbox (dateKey เดี่ยว)
        const dateKeys  = Array.isArray(item.dateKeys)  ? item.dateKeys  : (item.dateKey  ? [item.dateKey]  : []);
        const monthKeys = Array.isArray(item.monthKeys) ? item.monthKeys : (item.monthKey ? [item.monthKey] : []);

        // 0) ลบแถวบิลที่ void ในชีต (ทำก่อนรีเฟรชสรุป) — idempotent: ไม่พบแถว = ถือว่าลบแล้ว
        if (item.needVoidDelete) {
          if (this.hasCloudSyncConfig()) {
            const okDel = await this.postVoidDelete(item.voidDelete);
            if (okDel) { item.needVoidDelete = false; delivered++; }
          }
        }

        // 1) สรุปวัน + เดือน — recompute จาก state ปัจจุบัน (ครบ + idempotent: GAS เขียนทับชีต)
        if (item.needSummary) {
          const revAtSend = item.rev || 0;   // จำรุ่นก่อนส่ง (ดู enqueueSummaryRefresh)
          if (this.hasCloudSyncConfig()) {
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
            // เคลียร์ได้เฉพาะเมื่อ "ข้อมูลไม่ถูกแก้ระหว่างที่กำลังส่ง"
            // ถ้ารุ่นเปลี่ยนระหว่าง await แปลว่ามีการแก้บิลของงวดนี้ ต้องเหลืองานไว้ส่งรุ่นใหม่
            if (allOk && (item.rev || 0) === revAtSend) { item.needSummary = false; delivered++; }
            else if (allOk) console.warn('[Outbox] ข้อมูลถูกแก้ระหว่างส่งสรุป — คงงานไว้ส่งรุ่นใหม่', dateKeys);
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
      // ต้องเซฟเมื่อ "มีการลองยิง" ด้วย ไม่ใช่เฉพาะตอนมีงานสำเร็จ
      // เดิมถ้าล้มเหลวหมด (เช่นกรอก URL ผิด) ตัวนับ tries/lastTry จะอยู่แค่ในหน่วยความจำ
      // ปิดแอปแล้วหาย เปิดใหม่ก็ยิงรัวตั้งแต่ต้นทุกครั้ง ระบบเว้นระยะเลยไม่เคยได้ทำงานจริง
      if (attempted || delivered > 0 || this.state.cloudOutbox.length !== before) {
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
      `🧾 เลขที่บิล: ${escapeTelegram(v.billId)}\n` +
      `💰 ยอด: ฿${(v.amount || 0).toLocaleString('th-TH')}\n` +
      `👤 ลูกค้า: ${escapeTelegram(v.customer || '-')}\n` +
      `🛠️ ยกเลิกโดย: ${escapeTelegram(v.by || '-')}\n` +
      `🕒 เวลา: ${when}\n` +
      `━━━━━━━━━━━━━━━━`;
  }

  // หมายเหตุ: sendVoidAlert() ถูกลบออกในเวอร์ชัน 1.5.2 — ไม่มีที่ไหนเรียกแล้ว
  // การแจ้งเตือน void เดินผ่าน cloudOutbox (enqueueVoidCloudOps) เช่นเดียวกับรายงานปิดกะ

  // ส่งคำขอลบแถวบิลใน Sheets แล้วคืน true/false — idempotent: "ไม่พบแถว" = ถือว่าลบแล้ว
  async postVoidDelete(v) {
    if (!this.hasCloudSyncConfig()) return false;
    try {
      const r = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(this.buildCloudRequest('void_transaction', {
          id: v.id, date: v.date,
          // monthKey (เดือนทำการ) — ชี้แท็บเดือนเดียวกับตอนบันทึกแม้ timezone ฝั่ง GAS ตั้งผิด
          // (รายการเก่าที่ค้างใน outbox ก่อนอัปเดตไม่มีฟิลด์นี้ → คำนวณจาก date แทน)
          monthKey: v.monthKey || this.getBusinessMonthKey(v.date),
          voidedBy: v.voidedBy || '',
          voidedAt: Number(v.voidedAt) || 0
        }))
      });
      const d = await r.json();
      // "ไม่พบแถวบิล" หรือ "ไม่พบแท็บเดือน" = ปลายทางไม่มีอะไรให้ลบแล้ว ถือว่าสำเร็จ (idempotent)
      //
      // เช็คจาก d.code เป็นหลัก — เดิมเช็คว่าข้อความมีคำว่า "ไม่พบ" ไหม ซึ่งเปราะ 2 ทาง:
      //   1) วันไหนแก้คำในฝั่งชีต งานลบแถวจะค้างในคิว ยิงซ้ำตลอดกาล เพราะคิวไม่มีวันหมดอายุ
      //   2) "ไม่พบข้อมูลที่ส่งมา" (คำขอไปถึงแบบตัวเปล่า) ก็เข้าเงื่อนไขเดิมด้วย
      //      กลายเป็นทิ้งคำสั่งลบทั้งที่ชีตยังไม่ได้ลบ → แถวผีค้างถาวร
      //
      // ยังเก็บการเช็คข้อความไว้เป็นทางถอย เพราะแอปอัปเดตเองผ่าน GitHub Pages
      // แต่ Apps Script ต้องวางโค้ดใหม่ด้วยมือ — ช่วงที่ยังไม่ได้วาง ฝั่งชีตจะยังตอบแบบเก่าอยู่
      // (ทางถอยจงใจผูกกับต้นข้อความ 2 แบบเท่านั้น ไม่เหมารวมทุกคำที่ขึ้นต้นด้วย "ไม่พบ")
      // เลขที่บิลผิดรูปแบบ = ยิงอีกกี่ครั้งก็ไม่มีวันสำเร็จ ต้องหยุด ไม่ใช่วน retry จนคิวตัน
      // แต่ห้ามเงียบ เพราะแถวบนชีตยังอยู่ — เจ้าของต้องรู้เพื่อไปลบแถวนั้นเอง
      if (d && d.code === 'INVALID_BILL_ID') {
        console.error('[Void] ปลายทางปฏิเสธเลขที่บิล:', v && v.id);
        this.showToast(
          `ลบบิล ${String((v && v.id) || '').slice(0, 30)} บนชีตอัตโนมัติไม่ได้ (เลขที่บิลผิดรูปแบบ) — ต้องเข้าไปลบแถวนั้นในชีตเอง`,
          'warning', 9000);
        return true;   // เลิกวนลอง แต่ไม่ได้แปลว่าชีตสะอาดแล้ว
      }

      // ปลายทางบอกว่าคำสั่งนี้พิสูจน์ไม่ได้ว่าใหม่กว่าการกู้คืนบิล → ทิ้งงานนี้ ไม่ลบแถว
      //
      // ⚠️ เคยใส่กลไก "ยืนยันเจตนาใหม่" ที่ปรับเวลาของงานให้ใหม่กว่าแล้วส่งซ้ำ — **ผิด**
      // เพราะ "งานมีเวลาของตัวเอง" ไม่ได้แปลว่า "งานเกิดขึ้นหลังการกู้คืน"
      // เคสจริง: กดยกเลิกบิลตอนออฟไลน์ (งานค้างในคิว) → กู้ข้อมูลย้อนหลัง → คิวเริ่มทำงาน
      //          งานเก่าถูกปรับเวลาแล้วลบบิลที่เพิ่งกู้กลับมา = รูเดิมที่กำลังปิดอยู่พอดี
      // ปลายทางมีเวลาทั้งสองข้างครบและตัดสินไปแล้ว — client ห้ามล้มคำตัดสินนั้น
      //
      // ถ้าเจ้าของยังต้องการลบจริง ให้กดยกเลิกบิลใบนั้นใหม่ ซึ่งได้เวลาปัจจุบันที่ใหม่กว่าเสมอ
      // "ไม่ลบ" แก้ได้ด้วยการกดใหม่ · "ลบผิด" แก้ไม่ได้ — เลือกฝั่งที่ย้อนกลับได้
      if (d && d.code === 'VOID_SUPERSEDED_BY_RESTORE') {
        console.warn('[Void] ทิ้งคำสั่งลบที่เก่ากว่าการกู้คืนบิล:', v && v.id);
        this.showToast(
          `ไม่ลบแถวบิล ${String((v && v.id) || '').slice(0, 24)} บนชีต เพราะบิลใบนี้ถูกกู้คืนหลังคำสั่งลบถูกสร้าง — ` +
          `ถ้ายังต้องการลบ ให้ยกเลิกบิลใบนั้นใหม่อีกครั้ง`, 'warning', 10000);
        return true;
      }
      const gone = !!d && (d.code === 'NOT_FOUND' ||
        (d.status === 'error' && /^ไม่พบ(บิลเลขที่|แผ่นงาน)/.test(String(d.message || ''))));
      if (d && (d.status === 'success' || gone)) return true;
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
    const okDate   = this.isValidDateKey(dateKey);
    const okMonth  = this.isValidMonthKey(monthKey);
    const cloudSetupStarted = this.hasCloudSetupStarted();
    const needTelegram = !!(this.telegramToken && this.telegramChatId);
    if (!cloudSetupStarted && !needTelegram) return;
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    // ส่งคำสั่งลบแถว "เสมอ" เมื่อมี URL — แม้บิลจะดูเป็น pending อยู่ (เช่นเพิ่งถูกแก้ไข)
    // เพราะแถวอาจขึ้นชีตไปแล้วก่อนหน้า; postVoidDelete เป็น idempotent (ไม่พบแถว = สำเร็จ) จึงส่งเกินได้ ไม่มีผลเสีย
    this.state.cloudOutbox.push({
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys: okDate ? [dateKey] : [], monthKeys: okMonth ? [monthKey] : [],
      // บิลที่วันที่เพี้ยน: ยังส่งคำสั่งลบแถวได้ (GAS ค้นจากเลขบิลได้) แต่ห้ามสั่งสร้างแท็บสรุปของวันขยะ
      needVoidDelete: cloudSetupStarted && okMonth,
      // voidedAt = เวลาตามนาฬิกาเครื่องนี้ ปลายทางเก็บไว้ใช้เทียบกับ restoredAt ของคำขอคืนบิล
      // ต้องมาจากนาฬิกาเดียวกันทั้งคู่ ถึงจะบอกได้ว่า "คืนบิลหลังยกเลิก" หรือ "คำขอเก่ามาถึงทีหลัง"
      voidDelete: (cloudSetupStarted && okMonth) ? { id: tx.id, date: tx.date, monthKey: monthKey, voidedBy: voidRecord.by || '', voidedAt: Date.now() } : null,
      needSummary: cloudSetupStarted && (okDate || okMonth),
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
