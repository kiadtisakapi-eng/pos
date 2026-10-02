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

// PIN เจ้าของค่าเริ่มต้นของเครื่องใหม่/เครื่องที่เพิ่งกู้ข้อมูล (PIN เจ้าของไม่อยู่ในไฟล์สำรองโดยตั้งใจ)
// ⚠️ ค่านี้เขียนไว้ในคู่มือกู้ข้อมูลที่เปิดสาธารณะ — ใครล็อกอินเจ้าของด้วยค่านี้ต้องตั้ง PIN ใหม่ก่อนใช้งาน
//    (ดู forceOwnerPinChange · เจ้าของสั่ง 24 ก.ย. 2569) และห้ามตั้งกลับมาเป็นค่านี้จากหน้าตั้งค่า
const DEFAULT_OWNER_PIN = '123456';

// เลขประจำตัว 13 หลัก (บัตรประชาชน/นิติบุคคล) — ตรวจหลักสุดท้าย (mod 11) ตามกติกากรมการปกครอง/สรรพากร
function isValidThaiId13(id) {
  if (!/^\d{13}$/.test(String(id))) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return ((11 - (sum % 11)) % 10) === Number(id[12]);
}

// เวอร์ชันรูปแบบไฟล์สำรอง ใช้ตรวจว่าไฟล์มาจากระบบรุ่นที่รองรับจริง
// v3 (ก.ย. 2569): เพิ่ม pendingCloudWork — งานคลาวด์ที่ยังค้างตอนสำรอง
// ไฟล์รุ่นเก่า (v1/v2) ยังกู้ได้ปกติ แค่ไม่มีงานค้างให้สร้างคืน
const BACKUP_SCHEMA_VERSION = 3;

// เวอร์ชันแอป — บัมพ์ทุกครั้งที่ปล่อยอัปเดต (ควรให้สอดคล้องกับ CACHE_NAME ใน sw.js)
const APP_VERSION = '1.8.2 (2026-10-03)';

// ═══ กติกาตัวเลข (เจ้าของสั่ง 26 ก.ย. 2569 — ห้ามแก้กลับ) ═══════════════════════════
// ตัวเลขทุกตัวที่ "คนกรอก" ต้องเป็นจำนวนเต็มเท่านั้น ห้ามทศนิยมเด็ดขาด:
//   ราคาบริการ · ส่วนลด (ตอนขาย/ตอนแก้บิล) · เงินที่รับจากลูกค้า · ค่าใช้จ่าย · ค่าคอม (% และบาท) ·
//   อัตรา VAT · ระยะเวลาบริการ · จำนวนธนบัตร
// ค่าคอมที่ระบบคิดจาก % ปัดเป็นบาทเต็ม (ปัดปกติ .50 ขึ้น) — ดู commissionAmountFor()
// ยกเว้นตัวเดียว: VAT ที่ระบบคำนวณยังคิดเป็นสตางค์ตามกฎหมาย แล้วยอดบิลปัดขึ้นเป็นบาทเต็มเสมอ
// เหตุผล: ส่วนลด 33.333 เคยทำให้บิลขายสำเร็จแต่หายจากยอดขาย/สรุป/ชีตเงียบ ๆ (ตรวจ 26 ก.ย. 2569 ข้อ 2)
const WHOLE_NUMBER_RE = /^\d+$/;
function isWholeNumberText(v) {
  return WHOLE_NUMBER_RE.test(String(v == null ? '' : v).trim());
}
function isWholeNumber(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
// อ่านช่องกรอกตัวเลขตามกติกาข้างบน: ว่าง = emptyValue · จำนวนเต็มไม่ติดลบ = ตัวเลข · อย่างอื่น = null
function parseWholeNumberInput(raw, emptyValue) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return emptyValue === undefined ? null : emptyValue;
  if (!WHOLE_NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
// ค่าคอมของรายการหนึ่ง — ปัดเป็นบาทเต็ม (ปัดปกติ) · netPrice คือยอดหลังส่วนลดก่อน VAT
// คิดจากสตางค์จำนวนเต็ม กันเลขทศนิยมของคอมพิวเตอร์ทำให้ .50 ปัดผิดทาง
function commissionAmountFor(netPrice, type, rate) {
  const r = Number(rate) || 0;
  if (type === 'fixed') return r;
  const sat = Math.round((Number(netPrice) || 0) * 100);
  return Math.round(sat * r / 10000);
}

// ─────────────────────────────────────────────
//  วันทำการ (Business Date) — ร้านเปิด 10:00 น. ถึงตี 3 ของวันถัดไป
//  บิล/ยอด/ค่าใช้จ่ายก่อน 06:00 เช้า นับเป็นวันทำการของ "เมื่อวาน" (มาตรฐานร้านกลางคืน)
//  เช่น บิลตี 2 ของเช้าวันที่ 19 = ยอดของคืนวันที่ 18 → ลงสรุปวันที่ 18 และแท็บเดือนตามวันที่ 18
//  ⚠️ ค่านี้ต้องอยู่ระหว่าง "เวลาปิดร้านช้าสุด" กับ "เวลาเปิดร้าน" (ปิด 03:00, เปิด 10:00 → 6 อยู่ระหว่างกลาง)
// ─────────────────────────────────────────────
const BUSINESS_DAY_CUTOFF_HOUR = 6;
// เวลาร้าน (เจ้าของยืนยัน 26 ก.ย. 2569): เปิดขาย 10:00 · ปิด 03:00 · เปิดกะ 10:00 · ปิดกะ 03:00
// กะที่ "เปิด" ตั้งแต่ 03:00 ถึงก่อน 06:00 = ร้านปิดแล้ว → เป็นกะของวันทำการใหม่ (วันที่บนปฏิทิน)
// ส่วนกะที่เปิด 00:00–02:59 ยังอยู่ในเวลาขายของคืนนั้น → นับเป็นวันทำการเมื่อวานตามปกติ
// (บิล/ค่าใช้จ่ายรายใบยังใช้เวลาตัดวัน 06:00 เหมือนเดิม — กติกานี้ใช้กับ "กะ" เท่านั้น)
const SHOP_CLOSE_HOUR = 3;
// สำรองขึ้น Drive ระหว่างกะ ทุก ๆ N บิลนับจากสำรองสำเร็จครั้งล่าสุด (ข้อ 4 รอบตรวจ 26 ก.ย. 2569)
// เดิมสำรองเฉพาะตอนปิดกะ → iPad พังกลางวัน บิลช่วงนั้นไม่อยู่ในไฟล์สำรอง
const MIDSHIFT_BACKUP_EVERY_BILLS = 5;
// ยกเลิกบิล / แก้บิล / บันทึกเงินส่วนต่าง → สำรองขึ้น Drive ตามหลัง (รอบตรวจ 5 ข้อ 1 · 2 ต.ค. 2569)
// เดิมเหตุการณ์พวกนี้ไม่ทำให้เกิดไฟล์สำรอง — เครื่องพังก่อนรอบสำรองถัดไป แล้วกู้ไฟล์ล่าสุด
// = บิลที่ยกเลิก/คืนเงินไปแล้วกลับมาเป็นยอดขาย · รอรวมรอบ 2 นาที (แก้หลายใบติดกันได้ไฟล์เดียว ไม่เปลือง Drive)
const CHANGE_BACKUP_DELAY_MS = 2 * 60 * 1000;
// สรุปรายวันที่ "ส่งใหม่หลังกู้ข้อมูล" ย้อนหลังได้กี่วัน (รอบตรวจ 6 ข้อ 2 · 2 ต.ค. 2569)
// = DAILY_SHEET_RETENTION_DAYS ของ Apps Script (62 — แท็บสรุปรายวันที่เก่ากว่านี้ถูกลบทิ้งทันทีหลังเขียน) + เผื่อขอบ 2 วัน
// วันที่เก่ากว่านี้ส่งแค่สรุปเดือน (ยอดรวมยังครบในแท็บสรุปเดือน/สรุปรายเดือน) · ถ้าแก้ค่าใน Apps Script ให้แก้ตามกัน
const RESTORE_DAILY_SUMMARY_DAYS = 64;
// จำนวนไฟล์สูงสุดที่ Apps Script ส่งรายชื่อมาให้หน้ากู้ข้อมูล (handleListBackups ตัดที่ 50 ไฟล์ล่าสุด)
// ร้านออกไฟล์ราววันละ 3 ไฟล์ = ย้อนได้ราว 2 สัปดาห์ · ไฟล์ที่เก่ากว่านั้นยังอยู่บน Drive 90 วัน (รอบตรวจ 6 ข้อ 5)
const DRIVE_BACKUP_LIST_MAX = 50;
// บิลที่ส่งขึ้นชีตไม่ผ่าน "ทั้งรอบ" — เว้นระยะลองใหม่เพิ่มขึ้นเรื่อย ๆ (รอบตรวจ 5 ข้อ 2)
// เดิมลองทุก 1 นาทีตายตัว รหัสเชื่อมต่อผิดค้างข้ามวัน = ยิงซ้ำทุกบิลทั้งวัน
const BILL_RETRY_STEPS_MS = [60e3, 120e3, 300e3, 600e3, 1800e3];
// error จากชีตที่ "ไม่ใช่ความผิดของบิลใบนั้น" (รหัสจาก doPost ของ Apps Script)
//   ตั้งค่าผิด = หยุดรอบทันที แล้วบอกเจ้าของ · ชั่วคราว = นับเหมือนเน็ตสะดุด (ติดกัน 3 ใบแล้วหยุดรอบ)
const CLOUD_CONFIG_ERROR_CODES = ['UNAUTHORIZED', 'TOKEN_NOT_SET'];
// ⚠️ SERVER_ERROR (ข้อผิดพลาดระหว่างทำงานฝั่งชีต) ไม่อยู่ในรายการนี้ — อาจเป็นเรื่องของแท็บเดือนเดียว
//    (เช่นแท็บนั้นถูกล็อก/ถูกแก้โครง) ถ้านับเป็นชั่วคราว บิลเดือนนั้นที่เรียงติดกันจะหยุดรอบทุกรอบ
//    แล้วบิลเดือนอื่นที่อยู่ถัดไปไม่มีวันได้ส่ง — ให้นับเป็นเรื่องเฉพาะใบเหมือนเดิม (รอบยังเว้นระยะเมื่อไม่ผ่านเลยสักใบ)
const CLOUD_TRANSIENT_ERROR_CODES = ['BUSY', 'REGISTRY_UNAVAILABLE'];
// งานคลาวด์ที่ล้มเหลวติดต่อกันนานเกินนี้ = หยุดยิงเอง รอเจ้าของกด "ลองใหม่" หรือ "ทิ้งงานนี้" (ข้อ 16)
const CLOUD_JOB_MAX_FAIL_DAYS = 7;
// ไฟล์สำรองใหญ่เกินนี้ = เตือนในหน้าตั้งค่าและข้อความปิดกะ (ข้อ 17)
const BACKUP_SIZE_WARN_BYTES = 5 * 1024 * 1024;
// ขนาดจริงเป็น "ไบต์" ของข้อความเมื่อส่งออกไป (UTF-8) — ไม่ใช่จำนวนตัวอักษร
// ภาษาไทย 1 ตัว = 3 ไบต์ · เดิมใช้ .length ตัวเลขในหน้าตั้งค่า เกณฑ์เตือน 5 MB และเวลารอส่งจึงต่ำกว่าจริงเกือบ 3 เท่า (รอบตรวจ 4 ข้อ A8)
// นับเองแทน new Blob([s]).size — ผลตรงกัน (ตัวอักษรครึ่งคู่ที่เสียนับ 3 ไบต์ เท่ากับที่เบราว์เซอร์แทนด้วย U+FFFD) และไม่ต้องจองหน่วยความจำอีกก้อน
function utf8ByteLength(str) {
  const s = String(str == null ? '' : str);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

// ชื่อล็อก "หน้าต่างหลัก" — ต้องไม่ซ้ำกับอย่างอื่นใน origin เดียวกัน (ดู claimWriterLock)
const WRITER_LOCK_NAME = 'jahn-pos-writer';

// รอผลว่า "หน้าต่างนี้ได้สิทธิ์เขียนไหม" ได้นานสุดเท่าไรตอนเปิดแอป
// ปกติเบราว์เซอร์ตอบภายในไม่กี่มิลลิวินาที — ถ้าเกินนี้ให้เปิดแอปแบบอ่านอย่างเดียวไปก่อน
// (ห้ามเดาว่าเขียนได้ เพราะถ้ามีอีกหน้าต่างถือสิทธิ์อยู่ การเขียนตอนโหลดจะทับยอดขายของมัน)
const WRITER_DECISION_TIMEOUT_MS = 3000;

// ═══ สิทธิ์ตามตำแหน่ง (ด่านกลางของทุกคำสั่งที่เปลี่ยนข้อมูล) ═════════════════
// เดิมสิทธิ์ถูกบังคับที่หน้าจอ (ซ่อนปุ่ม/ห้ามเข้าแท็บ) — ใครเรียกฟังก์ชันตรง ๆ ก็ข้ามได้หมด
// ตารางนี้คือ "กฎเดียว" ที่ทุกฟังก์ชันบันทึกต้องถามก่อนแตะข้อมูล (ดู authorize())
// เขียนแบบ allowlist เสมอ: การกระทำที่ไม่อยู่ในตาราง = ไม่มีใครทำได้
// ⚠️ ค่าในตารางนี้คัดลอกจากสิ่งที่หน้าจอเปิดให้ทำอยู่แล้ว ไม่ได้เปลี่ยนกฎธุรกิจ
//    ถ้าจะเปลี่ยนว่าใครทำอะไรได้ ให้แก้ที่นี่ที่เดียว แล้วรัน tests/run-all.js
const ROLE_PERMISSIONS = Object.freeze({
  'sale.checkout':  ['owner', 'manager', 'staff'],   // ออกบิล
  'shift.open':     ['owner', 'manager', 'staff'],   // เปิดกะ (นับเงินตั้งต้น)
  'shift.close':    ['owner', 'manager'],            // ปิดกะ/ปิดร้าน
  'expense.add':    ['owner', 'manager', 'staff'],   // เพิ่มค่าใช้จ่ายในกะ
  'expense.delete': ['owner', 'manager', 'staff'],   // ลบค่าใช้จ่ายในกะ (มีประวัติใน expenseLog)
  'queue.update':   ['owner', 'manager', 'staff'],   // เริ่ม/จบ/ยกเลิกคิว
  'customer.write': ['owner', 'manager', 'staff'],   // เพิ่ม/แก้โน้ต/ลบลูกค้า
  'bill.void':      ['owner', 'manager'],            // ยกเลิกบิล
  'bill.edit':      ['owner'],                       // แก้บิลย้อนหลัง
  // บันทึกว่าเงินส่วนต่างของบิลที่ถูกแก้ "เกิดอะไรขึ้นจริง" (คืน/เก็บเพิ่ม/แก้บันทึกรับเงินผิด/ไม่มีเงินเคลื่อนไหว)
  // เจ้าของสั่งไว้ (23 ก.ย. 2569): ผู้จัดการทำได้ด้วย เพราะผู้จัดการยกเลิกบิลได้อยู่แล้ว (แตะเงินหนักกว่า)
  // และถ้ารอเจ้าของอย่างเดียว ส่วนต่างจะค้างจนหน้าปิดกะเตือนทุกคืน — ทุกการบันทึกมีชื่อคนทำ+เวลาเสมอ
  'bill.settle':    ['owner', 'manager'],
  'summary.send':   ['owner', 'manager'],            // กดส่งสรุปขึ้นชีตเอง (หน้ารายงาน)
  'settings.write': ['owner'],                       // ตั้งค่าร้าน/VAT/พนักงาน/บริการ/หมวด/โลโก้
  'data.admin':     ['owner']                        // ส่งออก/นำเข้า/กู้/ย้อนกู้/ล้าง/ตรวจกับชีต/แก้งานคลาวด์ที่ขัดแย้ง
});

// ── เครื่องหลัก (ข้อ 19) ─────────────────────────────────────────────────
// สรุปวัน/เดือน + ไฟล์สำรองบน Drive คำนวณจากข้อมูลทั้งก้อนของ "เครื่องที่ส่ง" ไม่ได้รวมจากหลายเครื่อง
// Apps Script จึงรับงานสองอย่างนี้จากเครื่องหลักเครื่องเดียว (ตัดสินที่ฝั่งเซิร์ฟเวอร์ ด้วยรหัสเครื่อง)
// รหัสเครื่องเป็นของ "เครื่อง" ไม่ใช่ของร้าน: ไม่อยู่ในไฟล์สำรอง และไม่ถูกกู้ข้อมูลทับ
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const PRIMARY_ONLY_ACTIONS = Object.freeze(['summary_day', 'summary_month', 'backup']);
// ไฟล์สำรองบน Drive สำเร็จล่าสุดเก่ากว่านี้ = เตือนในข้อความปิดกะ (Telegram) แม้ไม่มี error ให้เห็น
// ร้านเปิดทุกวันและสำรองทุกครั้งที่ปิดกะ — ห่างเกิน 7 วันแปลว่ามีอะไรผิดปกติแน่ ไม่ใช่แค่วันหยุด
const BACKUP_STALE_WARN_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_AWARE_ACTIONS = Object.freeze(['summary_day', 'summary_month', 'backup', 'primary_status', 'claim_primary']);

// ช่องทางรับเงินที่ระบบรู้จัก (ตรงกับตัวเลือกหน้าชำระเงิน/หน้าแก้บิล และ Apps Script)
const PAYMENT_METHODS = Object.freeze(['cash', 'promptpay', 'credit']);
const PAYMENT_LABELS = Object.freeze({ cash: 'เงินสด', promptpay: 'โอน/QR', credit: 'บัตร' });
// ชนิดของรายการเงินส่วนต่างหลังแก้บิล (ข้อ 16) — ดู recordBillSettlement
//   refund/collect = คืนเงิน/เก็บเงินเพิ่ม "จริง" ตอนบันทึก · correction = ตอนขายบันทึกรับเงินผิด
//   waive = ไม่มีเงินเคลื่อนไหว (ไม่ได้คืน/ไม่ได้เก็บเพิ่ม) — เก็บไว้เป็นหลักฐาน ไม่กระทบลิ้นชัก
const SETTLEMENT_KINDS = Object.freeze(['refund', 'collect', 'correction', 'waive']);

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
// (20 ชม. ครอบคลุมกะเต็ม 10:00 → ตี 3 + เผื่อเปิดเครื่องก่อนเปิดร้าน — เดิม 12 ชม. หมดอายุ 23:00 กลางกะ
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
// ── PIN (ข้อ 7 รอบตรวจ 26 ก.ย. 2569) ──
// บัญชีสิทธิ์เจ้าของ/ผู้จัดการ = PIN 6 หลักเท่านั้น · พนักงานทั่วไป 4–6 หลัก
const PRIVILEGED_LEVELS = Object.freeze(['owner', 'manager']);
// ── เพดานค่าใช้จ่ายจากลิ้นชัก (รอบตรวจ 4 ข้อ A5 · เจ้าของเลือก 26 ก.ย. 2569) ─────────────────────
// ค่าใช้จ่าย "จ่ายจากลิ้นชัก" ที่คนหนึ่งลงเองในกะเดียว รวมกันเกินเพดานนี้ = ต้องมีผู้จัดการ/เจ้าของใส่ PIN อนุมัติ
// นับ "ยอดรวมทั้งกะของคนนั้น" ไม่ใช่ทีละรายการ — ถ้านับทีละรายการ แบ่งลงครั้งละ 299 กี่ครั้งก็ผ่าน
// ทำไมต้องมี: หยิบเงินสดออกแล้วลงเป็นค่าใช้จ่ายเท่ากัน ยอดปิดกะยังตรงพอดี ไม่มีอะไรผิดปกติให้เห็น
const EXPENSE_DRAWER_FREE_LIMIT = 300;
// ตัวนับ PIN ผิดของ "การอนุมัติ" — แยกจากบัญชีจริง พนักงานกดมั่วไม่ทำให้บัญชีผู้จัดการ/เจ้าของถูกล็อก
const APPROVAL_GUARD_KEY = '__approval__';
const STRONG_PIN_RE = /^[0-9]{6}$/;
const LOGIN_LOCK_AFTER_FAILS = 5;       // ผิดครบกี่ครั้งเริ่มล็อก
const LOGIN_LOCK_BASE_SEC = 30;         // ล็อกครั้งแรก
const LOGIN_LOCK_MAX_SEC = 15 * 60;     // ล็อกนานสุดต่อครั้ง
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
      // รายการที่ "แยกไว้ตรวจสอบ" ตอนกู้/นำเข้าข้อมูล (บิล/ค่าใช้จ่าย/ราคาที่ตัวเลขเงินเชื่อไม่ได้)
      // เก็บค่าต้นฉบับไว้ครบ — ไม่นับในยอด ไม่ส่งขึ้นชีต จนกว่าเจ้าของจะตรวจ (ดู sanitizeBackupData)
      quarantine: [],
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
    this.backupStatus = null;     // ผลการสำรองขึ้น Drive ครั้งล่าสุด (ดู recordBackupStatus)
    this.deviceId = null;         // รหัสเครื่องนี้ (ข้อ 19) — สร้างครั้งแรกที่เปิดแอป ไม่อยู่ในไฟล์สำรอง
    this.primaryStatus = null;    // เครื่องนี้เป็นเครื่องหลักที่ส่งสรุป/สำรองได้ไหม (ตามคำตอบล่าสุดของ Apps Script)
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

    // ── คิวงานบันทึก (ดู withMutation) ─────────────────────────────────
    this._mutationChain = Promise.resolve();
    this._mutationActive = null;   // ชื่องานที่กำลังถือคิวอยู่ (ไว้ดูตอนไล่ปัญหา)
    // เลขรุ่นของ "ชุดข้อมูลทั้งร้าน" — เพิ่มทุกครั้งที่ข้อมูลถูกแทนที่ทั้งชุด (กู้/นำเข้า/ย้อน/ล้าง/รับสิทธิ์)
    // งานคลาวด์ที่เริ่มก่อนหน้านั้นใช้ตัวนี้รู้ตัวว่าผลที่ได้เป็นของข้อมูลชุดเก่า ห้ามนำมาเขียนทับ
    this._dataGeneration = 0;
    // สิ่งที่ loadState ซ่อมไว้ในหน่วยความจำแต่ยังไม่ได้บันทึก (ดู persistLoadRepairs)
    this._loadRepairs = [];
    // รอบชำระเงินที่เปิดอยู่ (ดู beginCheckoutAttempt) — กันออกบิลซ้ำจากการกดซ้ำ
    this._checkoutAttempt = null;
    this._checkoutBusy = false;
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

    // หน้าต่างยืนยันรอบก่อนที่ยังค้าง = ถือว่ายกเลิก (มีได้ทีละหน้าต่าง)
    // เดิมเขียนทับปุ่มเฉย ๆ → โค้ดที่ await คำตอบรอบก่อนค้างตลอดไป
    if (this._confirmCancel) { const c = this._confirmCancel; this._confirmCancel = null; try { c(); } catch (e) {} }

    msgEl.innerText = message;
    modal.classList.add('active');

    const cancel = () => {
      this._confirmCancel = null;
      modal.classList.remove('active');
      if (onCancel) onCancel();
    };
    this._confirmCancel = cancel;
    btnCancel.onclick = cancel;

    btnYes.onclick = () => {
      this._confirmCancel = null;
      modal.classList.remove('active');
      if (callback) callback();
    };
  }

  // มีหน้าต่างยืนยัน/ถามค่ารอคำตอบจากคนอยู่ไหม
  isAwaitingUserAnswer() {
    return !!this._confirmCancel || !!this._promptPending;
  }

  // ยกเลิกหน้าต่างยืนยัน/ถามค่าที่ค้างอยู่ทั้งหมด (ใช้ตอนเจ้าของถูกออกจากระบบอัตโนมัติ)
  // ไม่งั้นคนที่มาเจอเครื่องทีหลังกด "ยืนยัน" งานที่เจ้าของเปิดค้างไว้ได้
  cancelPendingDialogs() {
    if (this._confirmCancel) { const c = this._confirmCancel; this._confirmCancel = null; try { c(); } catch (e) {} }
    if (this._promptPending) {
      this._promptPending = false;
      const el = document.getElementById('modal-prompt');
      if (el) el.classList.remove('active');
      if (this._promptCancel) { const c = this._promptCancel; this._promptCancel = null; try { c(); } catch (e) {} }
    }
  }

  // เวอร์ชันที่ await ได้ — true = กดยืนยัน, false = กดยกเลิก
  askConfirm(message) {
    return new Promise(resolve => this.showConfirm(message, () => resolve(true), () => resolve(false)));
  }

  // onCancel: ให้โค้ดที่ await รอคำตอบรู้ว่าผู้ใช้ปิดหน้าต่าง (กากบาท/ยกเลิก) — ไม่งั้นจะรอตลอดไป
  showPromptModal(message, defaultValue, callback, onCancel) {
    const modal = document.getElementById('modal-prompt');
    const titleEl = document.getElementById('prompt-modal-title');
    const inputEl = document.getElementById('prompt-modal-input');
    const formEl = document.getElementById('form-prompt');

    if (!modal || !titleEl || !inputEl || !formEl) {
      const result = prompt(message, defaultValue);
      if (result !== null && callback) {
        callback(result);
      } else if (result === null && onCancel) {
        onCancel();
      }
      return;
    }

    // หน้าต่างถามค่ารอบก่อนที่ยังค้างอยู่ = ถือว่ายกเลิก (มีได้ทีละหน้าต่าง)
    if (this._promptCancel) { const c = this._promptCancel; this._promptCancel = null; try { c(); } catch (e) {} }
    this._promptCancel = onCancel || null;
    this._promptPending = true;

    titleEl.innerText = message;
    inputEl.value = defaultValue || '';
    modal.classList.add('active');
    
    setTimeout(() => {
      inputEl.focus();
      if (inputEl.value) inputEl.select();
    }, 100);

    formEl.onsubmit = (e) => {
      e.preventDefault();
      this._promptCancel = null;
      this._promptPending = false;
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

  // เวลาที่ใช้ "จัดกะเข้าวันทำการ" (ข้อ 3 รอบตรวจ 26 ก.ย. 2569)
  // ปกติ = เวลาเปิดกะ · แต่กะที่เปิด 03:00–05:59 (หลังร้านปิด) ถูกดันไปเที่ยงวันของวันเดียวกัน
  // → ได้วันทำการ "วันใหม่" แทนที่จะตกไปเป็นเมื่อวาน (เดิมเงินขาด/เกินของทั้งวันไปลงผิดวัน/ผิดเดือน)
  // ทุกที่ที่จัดกะเข้าวัน/เดือนต้องใช้ตัวนี้ตัวเดียว: สรุปบนชีต · หน้ารายงาน · ค่าใช้จ่ายที่ไม่มีเวลา · คิวสรุปตอนปิดกะ
  shiftAnchorTime(sh) {
    if (!sh || typeof sh !== 'object') return null;
    const start = Number(sh.startTime);
    if (Number.isFinite(start) && start > 0) {
      const d = new Date(start);
      const h = d.getHours();
      if (h >= SHOP_CLOSE_HOUR && h < BUSINESS_DAY_CUTOFF_HOUR) {
        const noon = new Date(d); noon.setHours(12, 0, 0, 0);
        return noon.getTime();
      }
      return start;
    }
    const end = Number(sh.endTime);
    return (Number.isFinite(end) && end > 0) ? end : null;
  }

  // ── ตรวจรูปแบบคีย์วัน/เดือน ก่อนส่งขึ้นชีต ────────────────────────
  // ด่านสุดท้ายก่อนสร้างแท็บใหม่บน Google Sheets — คีย์เพี้ยนแม้ตัวเดียวจะได้แท็บขยะ
  // ที่ลบเองไม่ได้จากในแอป และไปโผล่ปนในชีตสรุปรายเดือน ทำให้รายงานอ่านไม่รู้เรื่อง
  // จำกัดช่วงปี 2020-2100 ด้วย เพราะปี 1970 คือค่าที่ได้เมื่อวันที่หายไป ไม่ใช่วันที่จริง
  isValidDateKey(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || ''))) return false;
    const [y, m, d] = String(k).split('-').map(Number);
    if (!(y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
    // ต้องเป็นวันที่มีอยู่จริง (เดิมรับ 2026-02-31) — กติกาเดียวกับ isValidDateKey_ ฝั่ง Apps Script
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
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
  async fetchWithTimeout(url, options = {}, timeoutMs) {
    if (!(Number(timeoutMs) > 0)) timeoutMs = Number(this.cloudTimeoutMs) > 0 ? Number(this.cloudTimeoutMs) : 20000;
    // ⚠️ เส้นตายต้องครอบ "จนอ่านเนื้อคำตอบเสร็จ" ไม่ใช่แค่ได้ headers
    // เดิมล้างตัวจับเวลาทันทีที่ fetch คืน headers แล้วผู้เรียกไป await response.json() ต่อเอง
    // ถ้าเนื้อคำตอบค้าง (เน็ตหลุดกลางทาง/พร็อกซีค้าง) งานนั้นค้างตลอดไป และคิวคลาวด์ทั้งระบบ
    // (runCloudTask) ถูกบล็อกตามจนกว่าจะปิดแอป — บิลใหม่ไม่ขึ้นชีตโดยไม่มีอะไรเตือน
    // ตอนนี้คืนออบเจกต์ที่ .json()/.text() ใช้เส้นตายเดียวกัน และหมดเวลาเมื่อไหร่ก็โยน error ทันที
    // (ไม่รอให้เบราว์เซอร์ยอมหยุดอ่านเอง — บางรุ่นไม่หยุดอ่าน body แม้สั่ง abort แล้ว)
    const ctrl = new AbortController();
    const seconds = Math.round(timeoutMs / 1000);
    const timeoutErr = () => new Error(`หมดเวลารอ ${seconds} วินาที (เครือข่ายช้าหรือค้าง)`);
    let rejectTimeout = null;
    const timeoutPromise = new Promise((_, rej) => { rejectTimeout = rej; });
    timeoutPromise.catch(() => {});   // กัน unhandled rejection ตอนไม่มีใครรออยู่แล้ว
    let timer = setTimeout(() => {
      timer = null;
      try { ctrl.abort(); } catch (e) { /* ไม่เป็นไร */ }
      rejectTimeout(timeoutErr());
    }, timeoutMs);
    const finish = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const translate = (err) => (err && err.name === 'AbortError') ? timeoutErr() : err;

    let res;
    try {
      res = await Promise.race([fetch(url, { ...options, signal: ctrl.signal }), timeoutPromise]);
    } catch (err) {
      finish();
      throw translate(err);
    }
    const readBody = async (kind) => {
      try {
        return await Promise.race([kind === 'json' ? res.json() : res.text(), timeoutPromise]);
      } catch (err) {
        throw translate(err);
      } finally {
        finish();
      }
    };
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      json: () => readBody('json'),
      text: () => readBody('text'),
      // ผู้เรียกที่ไม่อ่านเนื้อคำตอบ ใช้ตัวนี้ปล่อยตัวจับเวลา
      release: finish
    };
  }

  // ═══ ทางเดียวที่แอปคุยกับ Apps Script ═══════════════════════════════════════
  // ส่งคำขอ → ตรวจ HTTP → อ่าน/parse เนื้อคำตอบ ภายใต้เส้นตายเดียว (fetchWithTimeout)
  // คืนผลที่ parse แล้วเสมอ (รวมกรณี status: 'error' ของชีต — ผู้เรียกตัดสินเองจาก code)
  // โยน error เฉพาะเมื่อ "ไม่รู้ผล": เน็ตหลุด / หมดเวลา / HTTP ผิดปกติ / คำตอบไม่ใช่ JSON
  //
  // opts.owner = คำสั่งที่เซิร์ฟเวอร์อาจขอ "รหัสเจ้าของ" (ดูเอกสารใน google_apps_script.js)
  //   ส่งรหัสที่เจ้าของกรอกไว้ในรอบล็อกอินนี้ไปด้วย ถ้าเซิร์ฟเวอร์ตอบว่าต้องใช้/รหัสผิด จะถามรหัสแล้วลองใหม่ 1 ครั้ง
  async cloudPost(action, data, timeoutMs, opts) {
    if (!this.hasCloudSyncConfig()) throw new Error(this.getCloudSetupMessage());
    const wantOwner = !!(opts && opts.owner);
    const send = async (ownerKey) => {
      const body = this.buildCloudRequest(action, Object.assign({}, data || {}, ownerKey ? { ownerKey } : {}));
      let res;
      try {
        res = await this.fetchWithTimeout(this.googleSheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },   // GAS ต้องการ text/plain เพื่อข้าม CORS preflight
          body: JSON.stringify(body)
        }, timeoutMs || 20000);
      } catch (networkErr) {
        throw new Error(this.explainCloudError(networkErr));
      }
      if (!res.ok) {
        if (typeof res.release === 'function') res.release();
        throw new Error(this.explainCloudError(`HTTP ${res.status}`));
      }
      let d;
      try { d = await res.json(); }
      catch (parseErr) { throw new Error(this.explainCloudError(parseErr)); }
      if (!d || typeof d !== 'object') throw new Error('ชีตตอบกลับมาไม่ใช่ข้อมูล');
      return d;
    };
    let d = await send(wantOwner ? this._ownerKey : null);
    if (wantOwner && d && (d.code === 'OWNER_KEY_REQUIRED' || d.code === 'OWNER_KEY_INVALID')) {
      this._ownerKey = null;
      const key = await this.askOwnerKey(d.code === 'OWNER_KEY_INVALID');
      if (!key) throw new Error('ยกเลิก — ต้องใช้รหัสเจ้าของร้าน (Owner key) สำหรับคำสั่งนี้');
      d = await send(key);
      if (d && d.status === 'success') this._ownerKey = key;   // จำไว้เฉพาะในหน่วยความจำ รอบล็อกอินนี้
    }
    return d;
  }

  // ถามรหัสเจ้าของ (ไม่เก็บลงเครื่อง ไม่อยู่ในไฟล์สำรอง — หายเมื่อออกจากระบบ/ปิดแอป)
  askOwnerKey(wasWrong) {
    return new Promise(resolve => {
      const input = document.getElementById('prompt-modal-input');
      const prevType = input ? input.type : null;
      if (input) input.type = 'password';
      let settled = false;
      const done = (v) => {
        if (settled) return; settled = true;
        if (input) { input.type = prevType || 'text'; input.value = ''; }
        resolve(v);
      };
      const msg = (wasWrong ? 'รหัสเจ้าของไม่ถูกต้อง — ' : '') +
        'คำสั่งนี้เปิดข้อมูลทั้งร้านบน Google — กรอกรหัสเจ้าของร้าน (Owner key จาก Apps Script)';
      this.showPromptModal(msg, '', (v) => done(String(v || '').trim() || null), () => done(null));
    });
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
      // หน้าต่างรอง/โหลดไม่สำเร็จ: เก็บไว้ในหน่วยความจำ บันทึกทีหลังตอนได้สิทธิ์เขียน
      if (this.loadFailed || this.isReadOnlyWindow) return;
      await this.withMutation('ย้าย PIN เจ้าของ', async () => {
        await this.saveState();
      });
    }
  }

  async init() {
    // ขอสิทธิ์ "หน้าต่างหลัก" ก่อนโหลดข้อมูล — และ "รอผล" ก่อนเขียนอะไรทั้งสิ้น
    // (เดิมไม่รอ: หน้าต่างที่สองบันทึกการซ่อมข้อมูลตอนเปิดแอปทับยอดของหน้าต่างหลักได้
    //  ในช่วงไม่กี่มิลลิวินาทีก่อนรู้ตัวว่าเป็นหน้าต่างรอง)
    this.claimWriterLock();
    await this.awaitWriterDecision();
    await this.loadState();
    // บันทึกสิ่งที่ซ่อมตอนโหลด (ID ซ้ำ/PIN แบบเก่า) — หลังโหลดครบทุกคีย์แล้วเท่านั้น
    await this.persistLoadRepairs();
    await this.ensureDeviceIdPersisted();   // เครื่องใหม่: จำรหัสเครื่องไว้ (ข้อ 19)
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
      this._loadRepairs = [];

      // 1. ตรวจสอบการย้ายข้อมูล (Migration) จาก LocalStorage ไป IndexedDB
      const migrationCheck = await db.state.get('db_migrated');
      const isMigrated = migrationCheck ? migrationCheck.value : false;

      if (!isMigrated && !this.isReadOnlyWindow) {
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
        const oldPin = localStorage.getItem('jahn_pos_shop_owner_pin') || DEFAULT_OWNER_PIN;
        const oldSheetsUrl = localStorage.getItem('jahn_pos_google_sheets_url') || '';
        const oldSheetsApiToken = localStorage.getItem('jahn_pos_google_sheets_api_token') || '';
        const oldTelegramToken = localStorage.getItem('jahn_pos_telegram_token') || '';
        const oldTelegramChatId = localStorage.getItem('jahn_pos_telegram_chatid') || '';

        // บันทึกทั้งหมดลงใน Dexie IndexedDB — ใน transaction เดียว และตรวจธงซ้ำข้างใน
        // (สองหน้าต่างเปิดพร้อมกันครั้งแรก ต้องไม่ย้ายซ้ำทับกัน · ย้ายครึ่งเดียวต้องไม่เกิด)
        let didMigrate = false;
        await db.transaction('rw', db.state, async () => {
          const again = await db.state.get('db_migrated');
          if (again && again.value) return;
          // ⚠️ ในฐานมีข้อมูลร้านอยู่แล้ว (แค่ธงหาย) = ห้ามย้ายทับเด็ดขาด — ตั้งธงอย่างเดียวพอ
          // เดิมย้ายทับทุกครั้งที่ธงไม่มี: เครื่องที่เปิดครั้งแรกแบบอ่านอย่างเดียวแล้วรับสิทธิ์ทีหลัง
          // ไม่เคยได้ตั้งธง → เปิดแอปรอบถัดไปบิล/พนักงาน/ตั้งค่าถูกค่าเริ่มต้นทับหมด และ PIN กลับเป็น 123456
          const existing = await db.state.bulkGet(['transactions', 'staff', 'services', 'shift', 'ownerPin']);
          if (existing.some(r => !!r)) {
            await db.state.put({ key: 'db_migrated', value: true });
            return;
          }
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
          didMigrate = true;
        });

        // ลบข้อมูลเก่าออกจาก LocalStorage เฉพาะเมื่อย้ายลงฐานข้อมูลสำเร็จแล้วเท่านั้น
        if (didMigrate) {
          Object.values(storageKeys).forEach(k => localStorage.removeItem(k));
          localStorage.removeItem('jahn_pos_shop_promptpay');
          localStorage.removeItem('jahn_pos_shop_owner_pin');
          localStorage.removeItem('jahn_pos_google_sheets_url');
          localStorage.removeItem('jahn_pos_google_sheets_api_token');
          localStorage.removeItem('jahn_pos_telegram_token');
          localStorage.removeItem('jahn_pos_telegram_chatid');
          console.log('[Migration] ย้ายข้อมูลไปยัง IndexedDB เรียบร้อยเสร็จสมบูรณ์!');
        }
      }

      // 2. อ่าน "ทุกคีย์" ในรอบเดียว (transaction อ่านอย่างเดียว = เห็นข้อมูลชุดเดียวกันทั้งหมด)
      // ⚠️ เดิมอ่านทีละคีย์แล้ว "บันทึกกลางทาง" ตอนซ่อม ID ซ้ำ/ย้าย PIN
      // ตอนนั้นค่าตั้งค่า (URL/รหัสเชื่อมต่อ/Telegram/VAT) ยังไม่ถูกโหลด saveState จึงเขียน
      // ค่าว่าง/ค่าเริ่มต้นทับของจริงในเครื่อง และสวิตช์ VAT ที่อ่านทีหลังได้ค่า false ที่เพิ่งเขียนทับ
      // ตอนนี้: อ่านครบก่อน → ประกอบในหน่วยความจำให้ครบ → ซ่อมในหน่วยความจำ → บันทึกทีหลัง (persistLoadRepairs)
      const KEYS = ['services', 'categories', 'staff', 'customers', 'queue', 'transactions', 'voidLog',
        'expenseLog', 'editLog', 'quarantine', 'cloudOutbox', 'shift', 'shopPromptPayId', 'shopName', 'shopTagline',
        'shopAddress', 'shopPhone', 'shopLogo', 'theme', 'ownerPin', 'googleSheetsUrl', 'googleSheetsApiToken',
        'telegramToken', 'telegramChatId', 'vatEnabled', 'vatRate', 'backupStatus', 'deviceId', 'primaryStatus'];
      const rec = {};
      await db.transaction('r', db.state, async () => {
        const rows = await db.state.bulkGet(KEYS);
        rows.forEach((r, i) => { rec[KEYS[i]] = r; });
      });
      const has = k => !!rec[k];
      const val = k => (rec[k] ? rec[k].value : undefined);

      this.state.services = has('services') ? val('services') : [...DEFAULT_SERVICES];
      this.state.categories = (Array.isArray(val('categories')) && val('categories').length) ? val('categories') : [...DEFAULT_CATEGORIES];
      this.state.staff = has('staff') ? val('staff') : [...DEFAULT_STAFF];
      this.state.customers = has('customers') ? val('customers') : [...DEFAULT_CUSTOMERS];
      this.state.queue = has('queue') ? val('queue') : [...DEFAULT_QUEUE];
      this.state.transactions = has('transactions') ? val('transactions') : [...DEFAULT_TRANSACTIONS];
      this.state.voidLog = Array.isArray(val('voidLog')) ? val('voidLog') : [];
      this.state.expenseLog = Array.isArray(val('expenseLog')) ? val('expenseLog') : [];
      this.state.editLog = Array.isArray(val('editLog')) ? val('editLog') : [];
      this.state.quarantine = Array.isArray(val('quarantine')) ? val('quarantine') : [];
      this.state.cloudOutbox = Array.isArray(val('cloudOutbox')) ? val('cloudOutbox') : [];
      this.state.shift = has('shift') ? val('shift') : {
        active: false,
        startTime: null,
        startCash: 0,
        startDetails: {},
        expenses: [],
        history: []
      };

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

      // ── ค่าตั้งค่าทั้งหมด — ต้องครบก่อนมีการบันทึกใด ๆ ─────────────────────
      this.shopPromptPayId = has('shopPromptPayId') ? val('shopPromptPayId') : '';
      this.shopName = has('shopName') ? val('shopName') : 'Erotica Barber & Massage';
      this.shopTagline = has('shopTagline') ? val('shopTagline') : 'BARBER & MASSAGE';
      this.shopAddress = has('shopAddress') ? val('shopAddress') : '';
      this.shopPhone = has('shopPhone') ? val('shopPhone') : '';
      this.shopLogo = has('shopLogo') ? val('shopLogo') : '';
      this.theme = has('theme') ? val('theme') : 'dark';
      this.googleSheetsUrl = has('googleSheetsUrl') ? val('googleSheetsUrl') : '';
      this.googleSheetsApiToken = has('googleSheetsApiToken') ? String(val('googleSheetsApiToken') || '').trim() : '';
      this.telegramToken = has('telegramToken') ? val('telegramToken') : '';
      this.telegramChatId = has('telegramChatId') ? val('telegramChatId') : '';
      this.vatEnabled = has('vatEnabled') ? !!val('vatEnabled') : false;
      this.vatRate = (has('vatRate') && Number.isFinite(Number(val('vatRate')))) ? Number(val('vatRate')) : 7;
      const bs = val('backupStatus');
      this.backupStatus = (bs && typeof bs === 'object' && !Array.isArray(bs)) ? bs : null;
      // รหัสเครื่อง (ข้อ 19) — ไม่มี/เสีย = เครื่องใหม่ (สร้างใหม่ แล้วบันทึกหลังรู้ว่าเป็นหน้าต่างหลัก: ensureDeviceIdPersisted)
      const did = val('deviceId');
      if (typeof did === 'string' && DEVICE_ID_RE.test(did)) {
        this.deviceId = did; this._deviceIdUnsaved = false;
      } else {
        this.deviceId = this.generateDeviceId(); this._deviceIdUnsaved = true;
      }
      const ps = val('primaryStatus');
      this.primaryStatus = (!this._deviceIdUnsaved && ps && typeof ps === 'object' && !Array.isArray(ps)) ? ps : null;

      // ── ซ่อมในหน่วยความจำ (ยังไม่บันทึก) ─────────────────────────────────
      // ซ่อมแซมและตรวจสอบความซ้ำซ้อนของ ID
      const repairs = [];
      const dedupeIds = (list, prefix, label) => {
        const seen = new Set();
        let fixed = false;
        (Array.isArray(list) ? list : []).forEach(item => {
          if (!item || typeof item !== 'object') return;
          if (!item.id || seen.has(item.id)) {
            let maxNum = 0;
            list.forEach(x => {
              const match = String((x && x.id) || '').match(new RegExp('^' + prefix + '(\\d+)$'));
              if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
            });
            item.id = `${prefix}${maxNum + 1}`;
            fixed = true;
          }
          seen.add(item.id);
        });
        if (fixed) repairs.push(label);
      };
      dedupeIds(this.state.staff, 'st', 'รหัสพนักงานซ้ำ');
      dedupeIds(this.state.customers, 'c', 'รหัสลูกค้าซ้ำ');
      dedupeIds(this.state.services, 's', 'รหัสบริการซ้ำ');

      this.ownerPin = has('ownerPin') ? val('ownerPin') : '';
      if (!has('ownerPin') || this.ownerPin === '' || this.ownerPin === null || this.ownerPin === undefined) {
        // เครื่องใหม่ / หลังล้างข้อมูล / กู้จากไฟล์สำรอง (ไฟล์สำรองไม่มี PIN เจ้าของ) — "ยังไม่ได้ตั้ง" ไม่ใช่ "ชำรุด"
        // ⚠️ เดิมใช้ข้อความ "PIN ชำรุด" และไม่บันทึกค่าเริ่มต้น → ขึ้นเตือนน่าตกใจซ้ำทุกครั้งที่เปิดแอป (รอบตรวจ 4 ข้อ A9)
        // บันทึกค่าเริ่มต้นผ่านกลไกซ่อมตอนโหลด (persistLoadRepairs) → เตือนครั้งเดียว
        // ล็อกอินด้วย 123456 ครั้งแรก ระบบบังคับตั้ง PIN ใหม่ทันที (forceOwnerPinChange) ความปลอดภัยเท่าเดิม
        this.ownerPin = await this.hashPin(DEFAULT_OWNER_PIN);
        repairs.push('ตั้ง PIN เจ้าของเริ่มต้น (เครื่องใหม่)');
        setTimeout(() => this.showToast('เครื่องนี้ยังไม่ได้ตั้ง PIN เจ้าของร้าน — เข้าครั้งแรกด้วย PIN เริ่มต้น แล้วระบบจะให้ตั้ง PIN ใหม่ทันที', 'info', 7000), 500);
      } else if (typeof this.ownerPin !== 'string' || (this.ownerPin.length !== 64 && this.ownerPin.length !== 6)) {
        // มีค่าอยู่แต่ใช้ตรวจ PIN ไม่ได้จริง — ไม่บันทึกทับ (เก็บของเดิมไว้ให้ตรวจได้) · หายเองเมื่อเจ้าของเข้าแล้วตั้ง PIN ใหม่
        this.ownerPin = await this.hashPin(DEFAULT_OWNER_PIN);
        setTimeout(() => this.showToast('รหัส PIN ของเจ้าของร้านชำรุดหรือรูปแบบไม่ถูกต้อง ระบบได้รีเซ็ตกลับเป็น "123456" ชั่วคราว กรุณาเปลี่ยนเพื่อความปลอดภัยในหน้าตั้งค่า', 'warning', 6000), 500);
      } else if (this.ownerPin.length === 6) {
        // Plain text migration to hash
        this.ownerPin = await this.hashPin(this.ownerPin);
        repairs.push('ย้าย PIN เจ้าของเป็นแบบเข้ารหัส');
      }
      this._loadRepairs = repairs;

    } catch (err) {
      console.error('Error loading IndexedDB', err);

      // ⚠️ จุดวิกฤต — อ่านฐานข้อมูลไม่สำเร็จ ไม่ได้แปลว่า "ไม่มีข้อมูล"
      // ข้อมูลจริงอาจยังอยู่ครบใน IndexedDB แค่อ่านไม่ได้ชั่วคราว (DB ถูกล็อกจากอีกแท็บ,
      // iOS ล้าง storage, เขียนค้างตอนแบตหมด) ค่าด้านล่างเป็นแค่ค่าว่างให้ UI เรนเดอร์ได้
      // ห้ามให้ค่าว่างชุดนี้ถูกเขียนกลับลง DB เด็ดขาด — จะทับข้อมูลจริงหายถาวร
      this.loadFailed = true;
      this._loadRepairs = [];

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
      this.ownerPin = await this.hashPin(DEFAULT_OWNER_PIN);
      this.googleSheetsUrl = '';
      this.googleSheetsApiToken = '';
      this.telegramToken = '';
      this.telegramChatId = '';
      this.vatEnabled = false;
      this.vatRate = 7;

      // จอทึบเต็มหน้า ปิดไม่ได้ — toast เตือน 6 วิ ไม่พอ เพราะพนักงานกดปิดแล้วขายต่อ
      // แล้ว saveState() รอบแรกจะทับข้อมูลจริงทันที
      this.showFatalLoadError(err);
    }
  }

  // ── บันทึกสิ่งที่ loadState ซ่อมไว้ในหน่วยความจำ ─────────────────────────
  // แยกออกจาก loadState โดยตั้งใจ: การซ่อมต้องบันทึก "หลังจาก" รู้แน่แล้วว่า
  //   1) ค่าทุกคีย์ถูกโหลดครบแล้ว (ไม่งั้นเขียนค่าเริ่มต้นทับของจริง)
  //   2) หน้าต่างนี้เป็นหน้าต่างหลักจริง (ไม่งั้นเขียนทับยอดที่หน้าต่างหลักเพิ่งขาย)
  // หน้าต่างรอง/โหลดไม่สำเร็จ = ไม่บันทึก และไม่เตือนเรื่อง "หน้าต่างซ้ำ" ให้สับสน
  // (ของที่ซ่อมยังอยู่ในหน่วยความจำ จะถูกบันทึกเองตอนหน้าต่างนี้ได้สิทธิ์เขียน)
  async persistLoadRepairs() {
    if (!Array.isArray(this._loadRepairs) || this._loadRepairs.length === 0) return true;
    if (this.loadFailed || this.isReadOnlyWindow) return false;
    const reasons = this._loadRepairs.slice();
    const saved = await this.withMutation('บันทึกการซ่อมข้อมูลตอนเปิดแอป', () => this.saveState());
    if (saved) {
      this._loadRepairs = [];
      console.warn('[Load] บันทึกการซ่อมข้อมูลตอนเปิดแอปแล้ว:', reasons.join(' · '));
    }
    return saved === true;
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
  async saveState(opts) {
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

    const rows = this.buildStateRows();
    // คีย์เสริมที่ต้อง "ลงพร้อมกัน" กับข้อมูลร้าน (เช่นสำเนาก่อนกู้ข้อมูล) — สำเร็จพร้อมกันหรือไม่สำเร็จเลย
    if (opts && Array.isArray(opts.extraRows)) opts.extraRows.forEach(r => rows.push(r));

    try {
      // ⚠️ ต้องอยู่ใน transaction ที่เราคุมเอง — เดิมเรียก bulkPut ลอย ๆ
      // Dexie จะกลืน error ของคำขอที่ล้มแล้วปล่อยคำขอที่เหลือ commit ต่อ
      // ผลคือ "บิลลงเครื่อง แต่กะ/ลูกค้า/คิวงานคลาวด์ไม่ลง" แล้วผู้เรียกคืนค่าในหน่วยความจำ
      // ทั้งที่ในเครื่องมีของครึ่งเดียวค้างอยู่ — เปิดแอปใหม่ได้ข้อมูลที่ไม่เคยมีอยู่จริง
      // ห่อด้วย transaction แล้วปล่อย error ทะลุออกมา = IndexedDB ยกเลิกทั้งชุดให้เอง
      await db.transaction('rw', db.state, async () => {
        await db.state.bulkPut(rows);
      });
      return true;
    } catch (e) {
      console.error('IndexedDB save failure!', e);
      this.showToast('บันทึกข้อมูลหน้าร้านล้มเหลว!', 'error');
      return false;
    }
  }

  // ทุกคีย์ของข้อมูลร้านที่ saveState เขียน — แยกออกมาให้ทุกทางใช้ชุดเดียวกัน
  buildStateRows() {
    return [
      { key: 'services', value: this.state.services },
      { key: 'categories', value: this.state.categories },
      { key: 'staff', value: this.state.staff },
      { key: 'customers', value: this.state.customers },
      { key: 'queue', value: this.state.queue },
      { key: 'transactions', value: this.state.transactions },
      { key: 'voidLog', value: this.state.voidLog },
      { key: 'expenseLog', value: this.state.expenseLog },
      { key: 'editLog', value: this.state.editLog },
      { key: 'quarantine', value: this.state.quarantine || [] },
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
      { key: 'vatRate', value: Number(this.vatRate) || 0 },
      // สถานะการสำรองล่าสุดของเครื่องนี้ (ไม่ติดไปกับไฟล์สำรอง — เป็นเรื่องของเครื่อง ไม่ใช่ของร้าน)
      { key: 'backupStatus', value: (this.backupStatus && typeof this.backupStatus === 'object') ? this.backupStatus : null },
      // รหัสเครื่อง + สถานะเครื่องหลัก (ข้อ 19) — ของเครื่อง ไม่ใช่ของร้าน (ไม่อยู่ใน buildBackupPayload)
      { key: 'deviceId', value: this.deviceId },
      { key: 'primaryStatus', value: (this.primaryStatus && typeof this.primaryStatus === 'object') ? this.primaryStatus : null },
      // ธง "ย้ายจาก localStorage แล้ว" — ลงพร้อมข้อมูลร้านทุกครั้ง กันการย้ายทับข้อมูลจริงรอบถัดไป
      { key: 'db_migrated', value: true }
    ];
  }

  // เขียนเฉพาะบางคีย์แบบ atomic — ใช้กับค่าที่ไม่ใช่ข้อมูลร้าน (ธีม) หรือคีย์เดี่ยว
  // ด่านเดียวกับ saveState ทุกข้อ (loadFailed / หน้าต่างรอง)
  async saveKeys(rows) {
    if (this.loadFailed || this.isReadOnlyWindow) return false;
    try {
      await db.transaction('rw', db.state, async () => { await db.state.bulkPut(rows); });
      return true;
    } catch (e) {
      console.error('IndexedDB partial save failure', e);
      return false;
    }
  }
  // งานที่กระทบยอดขาย/ข้อมูลสำรองต้องไม่เดินหน้าต่อถ้า IndexedDB เขียนไม่สำเร็จ
  // เช็คเฉพาะ false เพื่อให้ test/method เก่าที่ไม่ได้คืนค่า ยังทำงานร่วมกันได้
  async saveStateOrThrow(actionLabel, opts) {
    const saved = await this.saveState(opts);
    if (saved === false) {
      throw new Error(`ไม่สามารถบันทึก${actionLabel || 'ข้อมูล'}ลงในเครื่องได้ — ระบบยกเลิกเพื่อป้องกันข้อมูลหาย`);
    }
    return true;
  }


  // ═══ คิวงานบันทึก — งานที่เปลี่ยนข้อมูลในเครื่องต้องเดินทีละงาน ═════════════
  //
  // ปัญหาที่แก้: ทุกงาน (ขาย/ยกเลิก/ปิดกะ/ค่าใช้จ่าย ฯลฯ) ทำแบบ "แก้ในหน่วยความจำ → บันทึก → ถ้าพังให้คืนค่า"
  // ถ้าสองงานซ้อนกัน งาน A ที่บันทึกพังจะ "คืนค่า" ด้วยสำเนาที่ถ่ายไว้ก่อนงาน B เริ่ม
  // = งาน B ที่บันทึกลงเครื่องสำเร็จแล้วหายจากหน้าจอ (หรือกลับกัน: การบันทึกของ B พาของครึ่งทางของ A ลงเครื่อง)
  // หน้าจอกับเครื่องจึงไม่ตรงกันโดยไม่มีอะไรเตือน
  //
  // กติกา: ช่วง "แก้ข้อมูล → บันทึก → คืนค่า" ของทุกงานต้องอยู่ในนี้ทั้งช่วง
  //   · งานถัดไปรอจนงานก่อนหน้าจบจริง (สำเร็จหรือคืนค่าเสร็จแล้ว) — ไม่ใช่แค่รอ saveState
  //   · งานเน็ต (fetch) ห้ามอยู่ในนี้ — ทำข้างนอกแล้วค่อยเข้าคิวสั้น ๆ เพื่อบันทึกผล
  //   · ⚠️ ฟังก์ชันที่ส่งเข้ามาห้าม await withMutation ซ้อนอีกชั้น (จะรอตัวเองตลอดไป)
  // งานที่ล้มจะโยน error ต่อให้ผู้เรียก แต่ไม่ทำให้คิวตัน
  withMutation(label, fn) {
    const run = async () => {
      this._mutationActive = label || 'งานบันทึก';
      try { return await fn(); }
      finally { this._mutationActive = null; }
    };
    const p = this._mutationChain.then(run, run);
    this._mutationChain = p.then(() => {}, () => {});
    return p;
  }

  // ═══ ด่านสิทธิ์กลาง ═════════════════════════════════════════════════════
  // ทุกฟังก์ชันที่เปลี่ยนข้อมูลต้องถามที่นี่ก่อน — ไม่ใช่พึ่งการซ่อนปุ่ม
  // ตรวจครบ 3 ชั้น: โหลดข้อมูลสำเร็จ · มีคนล็อกอินอยู่จริง · ตำแหน่งอยู่ในรายการที่อนุญาต
  // opts.quiet = ไม่แสดงข้อความ (ผู้เรียกจะรายงานเอง)
  authorize(action, label, opts) {
    const quiet = !!(opts && opts.quiet);
    const say = (msg, tone) => { if (!quiet) this.showToast(msg, tone || 'warning'); };
    const allowed = ROLE_PERMISSIONS[action];
    if (!allowed) {
      // การกระทำที่ไม่มีในตาราง = ปิดไว้ก่อน (allowlist) ไม่ใช่ปล่อยผ่าน
      console.error('[Auth] ไม่รู้จักสิทธิ์', action);
      say('ระบบไม่รู้จักคำสั่งนี้ — ไม่อนุญาตไว้ก่อน', 'error');
      return false;
    }
    if (this.loadFailed) {
      say(`โหลดข้อมูลไม่สำเร็จ — ปิด${label || 'คำสั่งนี้'}ไว้เพื่อความปลอดภัย`, 'error');
      return false;
    }
    if (!this.currentRole || !this.currentUser) {
      say(`ต้องเข้าสู่ระบบก่อนจึงจะ${label || 'ทำรายการนี้'}ได้`);
      return false;
    }
    if (!allowed.includes(this.currentRole)) {
      const who = allowed.includes('manager') ? 'ผู้จัดการขึ้นไป' : 'เจ้าของร้าน';
      say(`${label || 'รายการนี้'} ทำได้เฉพาะ${who}`);
      return false;
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
    // คืน Promise ที่ resolve เมื่อรู้ผลแล้วว่าหน้าต่างนี้เขียนได้ไหม (true = หน้าต่างหลัก)
    // init() ต้องรอผลนี้ก่อนโหลด/ซ่อม/บันทึกอะไรทั้งสิ้น — เดิมไม่รอ ทำให้หน้าต่างที่สอง
    // บันทึกการซ่อมข้อมูลตอนเปิดแอปลงเครื่องได้ก่อนจะรู้ตัวว่าเป็นหน้าต่างรอง
    this.isReadOnlyWindow = false;
    this._writerDecided = false;
    const decided = (isWriter) => {
      if (this._writerDecided) return;
      this._writerDecided = true;
      if (this._resolveWriterDecision) this._resolveWriterDecision(isWriter);
    };
    this._writerDecision = new Promise(res => { this._resolveWriterDecision = res; });
    const locks = (typeof navigator !== 'undefined' && navigator) ? navigator.locks : null;
    if (!locks || typeof locks.request !== 'function') {
      console.warn('[Writer] เบราว์เซอร์นี้ไม่รองรับ Web Locks — ข้ามการกันหน้าต่างซ้ำ');
      decided(true);
      return this._writerDecision;
    }
    try {
      // ifAvailable: รู้ผลทันทีว่ามีหน้าต่างอื่นถืออยู่ไหม (callback ถูกเรียกเสมอ ได้ lock หรือ null)
      locks.request(WRITER_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          this.setReadOnlyWindow(true);
          decided(false);
          this.waitForWriterLock();     // เข้าคิวรอ ถ้าหน้าต่างหลักปิดเมื่อไหร่จะได้สิทธิ์ต่อ
          return;
        }
        // ตอบช้าจนแอปเปิดแบบอ่านอย่างเดียวไปก่อนแล้ว — ได้สิทธิ์ทีหลังต้องรับสิทธิ์แบบโหลดข้อมูลใหม่
        if (this._writerDecisionTimedOut) {
          this.takeOverAsWriter();
        } else {
          this.setReadOnlyWindow(false);
          decided(true);
        }
        return new Promise(() => {});   // ถือล็อกไว้จนหน้าต่างนี้ปิด (เบราว์เซอร์ปล่อยให้เอง)
      }).catch(err => {
        // ขอล็อกไม่สำเร็จด้วยเหตุอื่น — ห้ามล็อกร้านออกจากระบบเพราะเรื่องนี้
        console.warn('[Writer] ขอสิทธิ์เขียนไม่สำเร็จ ใช้งานต่อแบบเดิม', err);
        this.setReadOnlyWindow(false);
        decided(true);
      });
    } catch (err) {
      console.warn('[Writer] Web Locks ใช้งานไม่ได้ ใช้งานต่อแบบเดิม', err);
      this.isReadOnlyWindow = false;
      decided(true);
    }
    return this._writerDecision;
  }

  // รอผลสิทธิ์เขียนตอนเปิดแอป — ไม่เกิน WRITER_DECISION_TIMEOUT_MS
  // เกินเวลา = เปิดแบบอ่านอย่างเดียวไปก่อน (ขายไม่ได้แต่ร้านไม่ค้างหน้าขาว) แล้วรับสิทธิ์เองเมื่อได้ผล
  async awaitWriterDecision(timeoutMs) {
    if (!this._writerDecision) return !this.isReadOnlyWindow;
    let timer = null;
    const timeout = new Promise(res => { timer = setTimeout(() => res('timeout'), timeoutMs || WRITER_DECISION_TIMEOUT_MS); });
    const r = await Promise.race([this._writerDecision, timeout]);
    clearTimeout(timer);
    if (r === 'timeout') {
      console.warn('[Writer] ยังไม่รู้ผลสิทธิ์เขียน — เปิดแบบอ่านอย่างเดียวไปก่อน');
      this._writerDecisionTimedOut = true;
      this.setReadOnlyWindow(true);
      return false;
    }
    return r === true;
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
    //
    // ทำในคิวงานบันทึก — งานที่ค้างอยู่ในหน้าต่างนี้ (ซึ่งบันทึกไม่ได้อยู่แล้ว) ต้องจบก่อน
    // ไม่งั้นการ "คืนค่า" ของงานนั้นจะไปทับข้อมูลชุดใหม่ที่เพิ่งโหลดมา
    const tookOver = await this.withMutation('รับสิทธิ์หน้าต่างหลัก', async () => {
      try {
        await this.loadState();
        if (this.loadFailed) {
          console.error('[Writer] โหลดข้อมูลใหม่ไม่สำเร็จ — คงโหมดอ่านอย่างเดียวไว้');
          return false;   // ไม่ปลดล็อกโหมดอ่านอย่างเดียว ดีกว่าเขียนทับด้วยข้อมูลที่อ่านไม่ได้
        }
      } catch (err) {
        console.error('[Writer] โหลดข้อมูลใหม่ไม่สำเร็จ', err);
        return false;
      }
      this._dataGeneration++;
      this.clearDateKeyCache();
      this.setReadOnlyWindow(false);
      this._writerDecisionTimedOut = false;
      if (!this._writerDecided) {
        this._writerDecided = true;
        if (this._resolveWriterDecision) this._resolveWriterDecision(true);
      }
      return true;
    });
    if (!tookOver) return;
    // สิ่งที่ loadState ซ่อมไว้ (ID ซ้ำ/PIN แบบเก่า) — ตอนนี้เป็นหน้าต่างหลักแล้วจึงบันทึกได้
    await this.persistLoadRepairs();
    // ข้อมูลเปลี่ยนทั้งชุด — ผู้ใช้ที่ล็อกอินค้างอยู่อาจถูกลบ/เปลี่ยนสิทธิ์จากอีกหน้าต่างแล้ว
    this.revalidateSession();
    // ⚠️ เพิ่งโหลดข้อมูลชุดใหม่เข้ามา — ผลตรวจความตรงกันที่ทำไว้ตอนยังเป็นหน้าต่างรอง
    // อ้างอิงข้อมูลเก่าทั้งหมด ถ้าไม่ทิ้ง ปุ่มลบจากผลตรวจนั้นจะลบบิลจริงได้
    this.invalidateReconcile('รับสิทธิ์เป็นหน้าต่างหลักและโหลดข้อมูลใหม่');
    try { this.renderEveryScreen(); } catch (e) { console.warn('render after takeover failed', e); }
    this.showToast('หน้าต่างนี้กลายเป็นหน้าต่างหลักแล้ว (โหลดข้อมูลล่าสุดให้แล้ว) — ขายต่อได้', 'success', 8000);
    // งานคลาวด์ที่ค้าง (บิล/Telegram/สรุป/สำรอง) เคยมีตัวตั้งเวลาอยู่ในหน้าต่างที่เพิ่งปิดไป — ต้องเริ่มส่งต่อที่นี่
    // ไม่งั้นค้างรอจนกว่าจะมีการขาย/เน็ตกลับ/สลับแอป
    try { Promise.resolve(this.resumePendingCloudWork()).catch(e => console.warn('[Writer] resume cloud work failed', e)); }
    catch (e) { console.warn('[Writer] resume cloud work failed', e); }
  }

  // ── ตรวจผู้ใช้ที่ล็อกอินค้างอยู่กับข้อมูลชุดปัจจุบัน ─────────────────────────
  // ใช้หลังข้อมูลถูกแทนที่ทั้งชุด: สิทธิ์ต้องมาจากบัญชีในข้อมูลจริง ไม่ใช่ค่าที่ค้างในหน่วยความจำ
  revalidateSession() {
    if (!this.currentUser || !this.currentRole) return;
    if (this.currentUser.id === '__owner__') { this.currentRole = 'owner'; return; }
    const st = (this.state.staff || []).find(s => s && s.id === this.currentUser.id);
    if (!st || !st.pin) {
      this.logout('บัญชีที่ล็อกอินอยู่ไม่มีในข้อมูลชุดนี้แล้ว — กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    const role = st.accessLevel || 'staff';
    if (role !== this.currentRole) {
      this.currentRole = role;
      this.currentUser = { id: st.id, name: st.name };
      try { this.updateUserRoleUI(); } catch (e) { /* หน้าจอยังไม่พร้อม */ }
    }
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

  // ── ด่านสัญญาหน้าจอ (UI contract) ─────────────────────────────────────
  // ทุกช่องกรอกที่ค่าของมัน "กลายเป็นตัวเลขเงิน" ต้องอ่านผ่าน requireEl / readCashDrawer เท่านั้น
  //
  // ⚠️ เดิมเขียนกันไว้ว่า "ถ้าหาช่องไม่เจอ ให้ใช้ 0" — กันแอปค้างได้จริง
  // แต่แลกด้วยความผิดพลาดที่ไม่มีใครเห็น: ส่วนลดหายทั้งบิล / เงินทอนเป็น 0 /
  // ปิดกะนับเงินได้ 0 แล้วขึ้น "ขาด" เท่าเงินทั้งลิ้นชัก โดยไม่มี error ให้เห็นสักตัว
  // ช่องพวกนี้หายได้ทางเดียวคือโครงหน้าจอเพี้ยน (แก้ HTML ผิด / เรนเดอร์ไม่ครบ / แคชค้างครึ่งรุ่น)
  // ซึ่งเป็นบั๊กที่ต้อง "ดัง" ไม่ใช่เดาค่าแทนแล้วเดินต่อ
  //
  // หน้าที่ของด่านนี้คือ "หยุดก่อนตัวเลขเงินผิด" ไม่ใช่ซ่อมหน้าจอให้
  uiContractFail(what) {
    const msg = `หน้าจอผิดพลาด: หา${what} ไม่เจอ — หยุดไว้ก่อนเพื่อกันตัวเลขเงินผิด`;
    console.error('[UI-CONTRACT] ' + msg);
    this._uiContractBroken = this._uiContractBroken || [];
    if (!this._uiContractBroken.includes(what)) this._uiContractBroken.push(what);

    // ช่องเดิมหายอยู่แล้ว — toast ทุกครั้งที่พิมพ์จะท่วมจอจนอ่านอะไรไม่ออก
    const now = Date.now();
    if (!this._uiContractToastAt || now - this._uiContractToastAt > 4000) {
      this._uiContractToastAt = now;
      try { this.showToast(msg, 'error', 8000); } catch (e) { /* toast ยังไม่พร้อม ไม่เป็นไร */ }
    }
    // toast หายไปใน 8 วิ แต่หน้าจอยังพังอยู่ — ต้องมีป้ายค้างไว้ให้เห็นตลอด
    try { this.renderUiContractBanner(); } catch (e) { /* ห้ามให้ป้ายเตือนกลบ error ต้นทาง */ }

    const err = new Error(msg);
    err.uiContract = true;
    return err;
  }

  // อ่าน element ที่ "ต้องมีจริง" — ไม่มี = โยน ไม่ใช่คืน null ให้ผู้เรียกเดาค่าต่อเอง
  requireEl(id, what) {
    const el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
    if (!el) throw this.uiContractFail(`${what} (#${id})`);
    return el;
  }

  // ป้ายแดงค้างบนจอ — เจ้าของร้านต้องเห็นว่า "อย่าเพิ่งเก็บเงิน/ปิดกะ" แม้ toast หายไปแล้ว
  renderUiContractBanner() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!this._uiContractBroken || !this._uiContractBroken.length) return;
    let el = document.getElementById('ui-contract-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-contract-banner';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#7f1d1d;color:#fff;' +
        'padding:12px 16px;text-align:center;font-family:system-ui,-apple-system,sans-serif;font-size:0.95rem;' +
        'line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,0.4)';
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<b>หน้าจอไม่ครบ — ตัวเลขเงินอาจผิด</b><br>' +
      '<span style="opacity:0.9;font-size:0.86rem">หาไม่เจอ: ' + escapeHtml(this._uiContractBroken.join(' · ')) + '</span><br>' +
      '<span style="opacity:0.85;font-size:0.84rem">อย่าเพิ่งเก็บเงินหรือปิดกะ — ปิดแล้วเปิดแอปใหม่ ถ้ายังขึ้นอยู่ให้แจ้งคนดูแลระบบ</span>';
  }

  // ── อ่านเงินในลิ้นชักจากช่องนับธนบัตร ─────────────────────────────────
  // ใช้ตัวเดียวกันทั้งตอนแสดงผล (updateCashSum) และตอนบันทึกจริง (confirmCashCount)
  // ยอดที่เห็นบนจอกับยอดที่ลงประวัติกะจึงมาจากการนับชุดเดียวกันเสมอ
  //
  // ⚠️ เดิมถ้าหาช่องไม่เจอเลย จะได้ total = 0 เงียบ ๆ แล้วปิดกะขึ้น "ขาด" เท่าเงินทั้งลิ้นชัก
  // และถ้า data-denom หายไปบางช่อง จะนับตกเฉพาะใบนั้นโดยไม่มีสัญญาณอะไรเลย
  readCashDrawer() {
    const inputs = (typeof document !== 'undefined')
      ? document.querySelectorAll('#form-cash-counter .cash-qty-input') : null;
    if (!inputs || inputs.length === 0) {
      throw this.uiContractFail('ช่องนับธนบัตรในหน้าต่างนับเงิน (.cash-qty-input)');
    }
    let total = 0;
    const details = {};
    const bad = [];
    inputs.forEach((input, i) => {
      const denom = parseInt(input.getAttribute('data-denom'), 10);
      if (!Number.isFinite(denom) || denom <= 0) { bad.push(i + 1); return; }
      const qty = this.readCashQty(input);
      total += denom * qty;
      details[denom] = qty;
    });
    if (bad.length) {
      throw this.uiContractFail(`ชนิดธนบัตร (data-denom) ของช่องที่ ${bad.join(', ')} ในหน้าต่างนับเงิน`);
    }
    return { total, details };
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
    // ต้องเป็นเจ้าของที่ "ล็อกอินอยู่จริง" — ตำแหน่งที่ค้างในหน่วยความจำโดยไม่มีผู้ใช้ ไม่นับ
    if (this.currentRole !== 'owner' || !this.currentUser) {
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

  // ── ผู้จัดการดูได้เฉพาะยอดของ "วันทำการนี้" (เจ้าของสั่ง 26 ก.ย. 2569) ─────────────────
  // ดูย้อนหลังได้เฉพาะเจ้าของร้าน · ผู้จัดการเห็นเฉพาะบิล/กะ/ประวัติของวันทำการปัจจุบัน
  // (วันทำการตัดที่ 06:00 — หลังเที่ยงคืนถึงตี 6 ยังเป็นคืนเดิม ผู้จัดการปิดกะตี 3 ยังเห็นยอดคืนนั้นครบ)
  // ข้อยกเว้นเดียว (เจ้าของเลือก): บิลของวันก่อนที่เจ้าของแก้ยอดแล้ว "ยังค้างบันทึกคืน/เก็บเงิน"
  //   ผู้จัดการเปิดได้เพื่อบันทึกเงินส่วนนั้นเท่านั้น — ยกเลิกบิล/ดูใบเสร็จ/แก้อย่างอื่นไม่ได้
  // เขียนแบบอนุญาตเฉพาะ (=== 'owner') — ตำแหน่งที่ระบบไม่รู้จักจะถูกจำกัดไว้ก่อนเสมอ
  canViewPastSales() {
    return this.currentRole === 'owner';
  }

  currentBusinessDateKey() {
    return this.getBusinessISODate(Date.now());
  }

  isCurrentBusinessDayBill(tx) {
    return !!tx && this.getBusinessISODate(tx.date) === this.currentBusinessDateKey();
  }

  // บิลที่เจ้าของแก้ยอด/ช่องทางหลังรับเงินแล้ว และยังไม่มีใครบันทึกว่าคืน/เก็บเงินจริงหรือไม่
  // (ข้อมูลรับเงินเสีย = ไม่นับ เพราะบันทึกให้ไม่ได้อยู่แล้ว ต้องให้เจ้าของตรวจเอง)
  isPendingSettlementBill(tx) {
    if (!tx || typeof tx !== 'object') return false;
    if ((tx.tender === undefined || tx.tender === null) && (tx.settlements === undefined || tx.settlements === null)) return false;
    const st = this.billMoneyStatus(tx);
    return !st.invalid && !st.settled;
  }

  // สิทธิ์ของผู้ใช้ปัจจุบันต่อ "บิลหนึ่งใบ": 'full' เปิด/ดูได้ตามสิทธิ์เดิม · 'settle-only' บันทึกเงินส่วนต่างได้อย่างเดียว · 'none'
  billAccessFor(tx) {
    if (!tx) return 'none';
    if (this.canViewPastSales()) return 'full';
    if (this.isCurrentBusinessDayBill(tx)) return 'full';
    if (this.currentRole === 'manager' && this.isPendingSettlementBill(tx)) return 'settle-only';
    return 'none';
  }

  // วันที่หน้ารายงานใช้จริง — ผู้จัดการได้วันทำการนี้เสมอ ไม่ว่าในช่องจะเป็นค่าอะไร
  reportDateValue() {
    if (!this.canViewPastSales()) return this.currentBusinessDateKey();
    const di = typeof document !== 'undefined' ? document.getElementById('report-date-input') : null;
    return di ? di.value : '';
  }

  // ช่องเลือกวันในหน้ารายงาน: ผู้จัดการถูกล็อกไว้ที่วันทำการนี้ (เปลี่ยนไม่ได้) · เจ้าของเลือกได้อิสระ
  applyReportDateLock() {
    if (typeof document === 'undefined') return;
    const di = document.getElementById('report-date-input');
    const label = document.getElementById('report-date-label');
    const locked = !this.canViewPastSales();
    if (di) {
      if (locked) {
        const today = this.currentBusinessDateKey();
        if (di.value !== today) di.value = today;
        di.min = today; di.max = today;
        di.disabled = true;
        di.title = 'ผู้จัดการดูได้เฉพาะยอดของวันนี้';
      } else {
        di.disabled = false; di.min = ''; di.max = ''; di.title = '';
      }
    }
    if (label && this.state.selectedReportType !== 'monthly') {
      label.innerText = locked ? 'วันนี้ (ดูย้อนหลังได้เฉพาะเจ้าของ):' : 'ระบุวันที่:';
    }
  }

  // กล่อง "บิลของวันก่อนที่ค้างบันทึกคืน/เก็บเงิน" ในหน้ารายงาน — ทางเดียวที่ผู้จัดการเข้าถึงบิลเก่าได้
  renderPendingSettleBox() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('report-pending-settle-box');
    if (!box) return;
    const canSettle = this.currentRole === 'owner' || this.currentRole === 'manager';
    const list = canSettle
      ? (Array.isArray(this.state.transactions) ? this.state.transactions : [])
          .filter(tx => tx && !this.isCurrentBusinessDayBill(tx) && this.isPendingSettlementBill(tx))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      : [];
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    const rows = list.slice(0, 30).map(tx => {
      const st = this.billMoneyStatus(tx);
      const when = new Date(tx.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border-color);padding:8px 0;">
        <div style="font-size:0.8rem;min-width:0;"><b>${escapeHtml(tx.id)}</b> · ขายวันที่ ${escapeHtml(when)}<br>
          <span style="color:var(--accent-premium);">${escapeHtml(this.describeMoneyDiffs(st.diffs))}</span></div>
        <button class="btn-small secondary" onclick="app.openTransactionEdit('${safeId(tx.id)}')">บันทึกเงินส่วนต่าง</button></div>`;
    }).join('');
    box.innerHTML = `<p style="font-size:0.85rem;margin:0 0 6px;"><b><i class="fa-solid fa-hand-holding-dollar"></i> บิลของวันก่อนที่ค้างบันทึกคืน/เก็บเงิน ${list.length} ใบ</b></p>` +
      `<p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 6px;">เจ้าของแก้ยอด/ช่องทางของบิลเหล่านี้แล้ว — เมื่อคืน/เก็บเงินกับลูกค้าจริง ให้กดบันทึกที่นี่` +
      `${this.canViewPastSales() ? '' : ' (ผู้จัดการเปิดได้เฉพาะเพื่อบันทึกเงินส่วนนี้)'}</p>${rows}` +
      (list.length > 30 ? `<p style="font-size:0.75rem;color:var(--text-muted);">แสดง 30 จาก ${list.length} ใบ</p>` : '');
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
    const req = { secret: this.googleSheetsApiToken, action, ...data };
    // ข้อ 19: งานที่ Apps Script รับจากเครื่องหลักเท่านั้น ต้องบอกว่ามาจากเครื่องไหน (ฝั่งนั้นเป็นคนตัดสิน)
    if (DEVICE_AWARE_ACTIONS.includes(action) && this.deviceId) {
      req.deviceId = this.deviceId;
      req.deviceLabel = this.deviceLabel();
    }
    return req;
  }

  // ── ก้อนข้อมูลสำรองมาตรฐาน — ใช้ร่วมกันทุกทาง (Drive / ไฟล์ .json / สำเนาก่อนกู้) ──
  // ต้องเป็นตัวเดียวกันทั้งหมด ไม่งั้นแก้ที่หนึ่งแล้วลืมอีกที่เมื่อไหร่ ไฟล์สำรองจะมีข้อมูลไม่ครบเท่ากัน
  backupSafeStaff(list) {
    return (Array.isArray(list) ? list : []).map(st => {
      if (!st || typeof st !== 'object') return st;
      if (!PRIVILEGED_LEVELS.includes(st.accessLevel)) return st;
      return Object.assign({}, st, { pin: null });
    });
  }

  buildBackupPayload() {
    return {
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      services: this.state.services,
      categories: this.state.categories,
      // ข้อ 9: PIN ของบัญชีสิทธิ์เจ้าของ/ผู้จัดการไม่ติดไปกับไฟล์สำรอง (ถอดกลับได้ในไม่ถึงวินาที)
      // กู้ลงเครื่องใหม่แล้วเจ้าของต้องตั้ง PIN ให้บัญชีเหล่านี้ใหม่ — แบบเดียวกับ PIN เจ้าของหลัก
      staff: this.backupSafeStaff(this.state.staff),
      customers: this.state.customers,
      queue: this.state.queue,
      transactions: this.state.transactions,
      voidLog: this.state.voidLog || [], // ประวัติการยกเลิกบิล — audit trail ต้องติดไปกับไฟล์สำรองด้วย
      expenseLog: this.state.expenseLog || [], // ประวัติการลบค่าใช้จ่าย — เหตุผลเดียวกัน
      editLog: this.state.editLog || [], // ประวัติการแก้บิลย้อนหลัง — เหตุผลเดียวกัน
      // รายการที่แยกไว้ตรวจสอบ (พร้อมค่าต้นฉบับ) — ต้องติดไปกับไฟล์สำรอง ไม่งั้นกู้ทีไรหลักฐานหายทีนั้น
      quarantine: this.state.quarantine || [],
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

  // ── งานรีเฟรชสรุปหลังกู้ข้อมูล: แยกเป็นรายเดือน (รอบตรวจ 6 ข้อ 2 · 2 ต.ค. 2569) ─────────────────
  // ⚠️ เดิมเป็นงานเดียวที่มี "ทุกวันตั้งแต่เปิดร้าน" (ข้อมูลจริง 95 วัน + 4 เดือน = 99 คำขอ และเพิ่มวันละ 1)
  //    · วันเดียวส่งไม่ผ่าน = ส่งใหม่ทั้ง 99 คำขอทุกรอบลองใหม่ (ทุก 30 นาที ได้นานถึง 7 วัน)
  //    · ระหว่างส่ง บิลใหม่/ไฟล์สำรองต้องรอคิวจนครบทุกวัน (งานคลาวด์ทั้งหมดต่อคิวเส้นเดียว)
  //    · สรุปรายวันที่เก่ากว่าที่ Apps Script เก็บ (62 วัน) ถูกสร้างแล้วลบทิ้งทันที = งานเปล่า
  // ตอนนี้: งานละ 1 เดือน (วันของเดือนนั้น + สรุปเดือน) เรียงเดือนล่าสุดก่อน
  //        วันที่เก่ากว่า RESTORE_DAILY_SUMMARY_DAYS ส่งแค่สรุปเดือน (เดือนของวันนั้นยังถูกส่งเสมอ)
  //        ตัวส่งงานคลาวด์ส่งงาน reason:'restore' ทีละเดือนต่อรอบ แล้วปล่อยคิวให้บิลใหม่ส่งก่อน (ดู _doFlushCloudOutbox)
  buildRestoreSummaryJobs(dateKeys, monthKeys, now) {
    const t = Number(now) || Date.now();
    // 'YYYY-MM-DD' เทียบแบบข้อความได้ตรง ๆ · คำนวณไม่ได้ (คืน '') = ไม่ตัดวันไหนทิ้ง (กติกาเดิม)
    const cutKey = this.getBusinessISODate(t - RESTORE_DAILY_SUMMARY_DAYS * 86400000);
    const monthOf = dk => dk.slice(5, 7) + '-' + dk.slice(0, 4);   // วันทำการ → เดือนของวันทำการนั้น (MM-yyyy)
    const byMonth = new Map();   // monthKey → Set(dateKey)
    (Array.isArray(monthKeys) ? monthKeys : []).forEach(mk => {
      if (this.isValidMonthKey(mk) && !byMonth.has(mk)) byMonth.set(mk, new Set());
    });
    (Array.isArray(dateKeys) ? dateKeys : []).forEach(dk => {
      if (!this.isValidDateKey(dk)) return;
      const mk = monthOf(dk);
      if (!this.isValidMonthKey(mk)) return;
      if (!byMonth.has(mk)) byMonth.set(mk, new Set());
      if (!cutKey || dk >= cutKey) byMonth.get(mk).add(dk);
    });
    const ord = mk => mk.slice(3) + mk.slice(0, 2);
    return [...byMonth.keys()].sort((a, b) => ord(b).localeCompare(ord(a))).map((mk, i) => ({
      id: `cob-${t}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: t,
      dateKeys: [...byMonth.get(mk)].sort(), monthKeys: [mk],
      needVoidDelete: false, voidDelete: null,
      needSummary: true, needTelegram: false, telegramMessage: '', tries: 0, rev: 0,
      reason: 'restore',
      quiet: true   // ส่งทีละเดือน — ไม่ขึ้นข้อความ "ส่งสำเร็จ" ทุกเดือน (เดือนไหนส่งไม่ผ่านซ้ำ 3 ครั้ง ป้าย "งานคลาวด์ค้าง" ขึ้นเอง)
    }));
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
  // opts.silent = งานเบื้องหลังจากคิวคลาวด์ (ลองใหม่เป็นระยะ) — ไม่ขึ้นข้อความรบกวนทุกรอบ
  // ผลลัพธ์ทุกครั้งบันทึกไว้ใน backupStatus (หน้าตั้งค่าแสดงสถานะล่าสุดตามจริง)
  async autoBackupToGoogleDrive(opts) {
    const silent = !!(opts && opts.silent);
    if (!this.canWriteData(silent ? '' : 'สำรองข้อมูลขึ้น Drive')) return false;   // snapshot เก่าจะไปทับไฟล์สำรองที่ดีอยู่
    if (!this.hasCloudSyncConfig()) return false;
    if (this.loadFailed) return false; // state เป็นค่าว่าง — สำรองไปก็ได้ไฟล์เปล่าไปทับของดีบน Drive

    const backupData = this.buildBackupPayload();
    // ── ไฟล์ที่กู้กลับไม่ได้ ห้ามส่งขึ้นไปนับเป็น "มีไฟล์สำรอง" ──────────────────
    // ใช้ด่านตัวเดียวกับตอนกู้จริง ถ้าไม่ผ่านตอนนี้ วันที่ต้องกู้ก็ไม่ผ่านเหมือนกัน
    if (!this.isValidBackupObject(backupData)) {
      const why = this._lastBackupRejectReason || 'โครงข้อมูลในเครื่องไม่ผ่านด่านตรวจไฟล์สำรอง';
      this._cloudFailReason = 'ไม่ได้ส่งไฟล์สำรอง เพราะไฟล์ที่ได้จะกู้กลับไม่ได้: ' + why;   // รอบตรวจ 5 ข้อ 3
      await this.recordBackupStatus({ ok: false, message: 'ไม่ได้ส่งไฟล์สำรอง เพราะไฟล์ที่ได้จะกู้กลับไม่ได้: ' + why });
      if (!silent) this.showToast('สำรองข้อมูลไม่ได้: ข้อมูลในเครื่องสร้างไฟล์สำรองที่กู้กลับได้ไม่ได้ — ' + why, 'error', 10000);
      return false;
    }

    const payload = this.buildCloudRequest('backup', { backupData });
    const body = JSON.stringify(payload);
    // ข้อ 17: ไฟล์สำรองโตตามอายุร้าน — วัดขนาดทุกครั้ง (โชว์ในหน้าตั้งค่า + เตือนเมื่อเกิน BACKUP_SIZE_WARN_BYTES)
    // และให้เวลาส่งเพิ่มตามขนาด (30 วิ + 15 วิ ต่อ MB · สูงสุด 2 นาที) ไม่ให้ไฟล์ใหญ่หมดเวลาเงียบ ๆ
    const sizeBytes = utf8ByteLength(body);
    const timeoutMs = Math.min(120000, 30000 + Math.ceil(sizeBytes / 1048576) * 15000);

    if (!silent) this.showToast('กำลังสำรองข้อมูลไป Google Drive...', 'info');

    try {
      const response = await this.fetchWithTimeout(this.googleSheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body
      }, timeoutMs);

      if (!response.ok) {
        if (response.release) response.release();
        throw new Error(this.explainCloudError(`HTTP ${response.status}`));
      }

      const result = await response.json();
      if (result && result.code === 'NOT_PRIMARY_DEVICE') {
        // ข้อ 19: ไฟล์สำรองบน Drive รับจากเครื่องหลักเท่านั้น (กันเครื่องรองไล่ลบไฟล์ของเครื่องหลัก)
        await this.notePrimaryStatus(false, result.details && result.details.primary);
        throw new Error(String(result.message || 'เครื่องนี้ไม่ใช่เครื่องหลัก — ไม่ได้สำรองขึ้น Drive'));
      }
      if (result && result.status === 'success') {
        if (!this.primaryStatus || !this.primaryStatus.isPrimary) await this.notePrimaryStatus(true, null);
        const d = (result.details && typeof result.details === 'object') ? result.details : {};
        // Apps Script รุ่นใหม่อ่านไฟล์กลับมาตรวจก่อนตอบ — ถ้าบอกว่าตรวจไม่ผ่านต้องถือว่าล้มเหลว
        if (d.verified === false) throw new Error('Apps Script ตรวจไฟล์สำรองที่เพิ่งเขียนไม่ผ่าน');
        const verified = d.verified === true;   // ไม่มีฟิลด์นี้ = Apps Script รุ่นเก่า (ไม่ได้อ่านกลับตรวจ)
        await this.recordBackupStatus({
          ok: true, verified, fileName: String(d.fileName || ''), sizeBytes,
          txCount: Array.isArray(backupData.transactions) ? backupData.transactions.length : 0,
          message: verified ? '' : 'Apps Script รุ่นเก่า — ยังไม่ได้อ่านไฟล์กลับตรวจ'
        });
        if (verified) { if (!silent) this.showToast('สำรองข้อมูลขึ้น Google Drive สำเร็จ (ตรวจอ่านกลับแล้ว)', 'success'); }
        else this.showToast('สำรองข้อมูลขึ้น Google Drive แล้ว แต่ Apps Script รุ่นเก่ายังไม่ได้ตรวจอ่านไฟล์กลับ — ควรอัปเกรด', 'warning', 8000);
        console.log('Google Drive Backup success:', d);
        return true;
      } else {
        throw new Error(this.explainCloudError(result && result.message) || 'คลาวด์แจ้งเตือนข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Auto backup failed:', err);
      this._cloudFailReason = this.explainCloudError(err);   // รอบตรวจ 5 ข้อ 3 — ตั้งก่อน await (กันถูกล้างระหว่างรอ)
      const failMsg = this._cloudFailReason;
      await this.recordBackupStatus({ ok: false, message: this.explainCloudError(err), sizeBytes });
      this._cloudFailReason = failMsg;
      if (!silent) this.showToast('สำรองข้อมูลขึ้น Google Drive ล้มเหลว: ' + this.explainCloudError(err), 'error', 8000);
      return false;
    }
  }

  // ── สถานะการสำรองล่าสุด "ตามจริง" — เก็บในเครื่อง (ไม่ติดไปกับไฟล์สำรอง) ─────────
  // ⚠️ ห้ามเรียกจากในงานที่ถือคิวบันทึก (withMutation) อยู่ — ฟังก์ชันนี้เข้าคิวเอง
  async recordBackupStatus(st) {
    const prev = (this.backupStatus && typeof this.backupStatus === 'object') ? this.backupStatus : {};
    const now = Date.now();
    const next = Object.assign({}, prev, { lastAttemptAt: now, lastOk: !!st.ok, lastMessage: String(st.message || '') });
    if (Number(st.sizeBytes) > 0) next.lastSizeBytes = Number(st.sizeBytes);
    if (st.ok) {
      Object.assign(next, { lastSuccessAt: now, lastVerified: !!st.verified,
        lastFileName: st.fileName || '', lastTxCount: Number(st.txCount) || 0 });
    }
    this.backupStatus = next;
    try {
      await this.withMutation('สถานะการสำรองข้อมูล', () => this.saveKeys([{ key: 'backupStatus', value: next }]));
    } catch (e) { console.warn('[Backup] บันทึกสถานะการสำรองไม่สำเร็จ', e); }
    this.renderBackupStatus();
    return next;
  }

  renderBackupStatus() {
    const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('backup-status-label') : null;
    if (!el) return;
    const st = this.backupStatus;
    const when = ts => (Number(ts) > 0 ? new Date(Number(ts)).toLocaleString('th-TH') : '-');
    let text;
    if (!st || !st.lastAttemptAt) {
      text = 'สถานะสำรองข้อมูล: ยังไม่เคยสำรองขึ้น Drive จากเครื่องนี้';
    } else if (st.lastOk) {
      text = `สำรองล่าสุด: ${when(st.lastSuccessAt)} · ` +
        (st.lastVerified ? `ตรวจอ่านกลับแล้ว ✓ (บิล ${st.lastTxCount || 0} ใบ)` : 'ยังไม่ได้ตรวจอ่านกลับ (Apps Script รุ่นเก่า)');
    } else {
      text = `⚠️ สำรองครั้งล่าสุดล้มเหลว (${when(st.lastAttemptAt)}): ${st.lastMessage || 'ไม่ทราบสาเหตุ'} · ` +
        `สำเร็จครั้งล่าสุด: ${st.lastSuccessAt ? when(st.lastSuccessAt) : 'ยังไม่เคย'}`;
    }
    // ข้อ 17: ขนาดไฟล์สำรอง — เกินเกณฑ์ต้องเริ่มวางแผน (ส่งช้า/หมดเวลา)
    const sz = Number(st && st.lastSizeBytes) || 0;
    const big = sz > BACKUP_SIZE_WARN_BYTES;
    if (sz > 0) text += ` · ขนาดไฟล์ ${(sz / 1048576).toFixed(sz < 1048576 ? 2 : 1)} MB` + (big ? ' ⚠️ ใหญ่เกินเกณฑ์ ควรเก็บบิลเก่าออก (ปรึกษาผู้ดูแลระบบ)' : '');
    // เครื่องถูกพักงานสำรอง: บรรทัดนี้ต้องไม่โชว์ "สำรองล่าสุด ✓" เฉย ๆ เพราะจะไม่มีครั้งถัดไปจนกว่าจะตั้งเครื่องหลัก
    const paused = this.hasCloudSyncConfig() && this.isPrimaryBlocked();
    if (paused) text = '⏸ พักการสำรองขึ้น Drive — เครื่องนี้ไม่ใช่เครื่องหลัก · ' + text;
    el.innerText = text;
    if (el.style) el.style.color = (paused || big || (st && st.lastAttemptAt && !st.lastOk)) ? 'var(--accent-danger, #ef4444)' : '';
  }

  // ═══ เครื่องหลัก (ข้อ 19) ═══════════════════════════════════════════════════
  generateDeviceId() {
    let hex = '';
    try {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
    }
    return 'dev-' + hex;
  }

  // ชื่อสั้นที่คนอ่านเข้าใจ (ไม่ใช่ความลับ) — ใช้บอกว่า "เครื่องหลักคือเครื่องไหน"
  deviceLabel() {
    const id = String(this.deviceId || '');
    return id ? 'POS-' + id.slice(-4).toUpperCase() : '';
  }

  async ensureDeviceIdPersisted() {
    if (!this._deviceIdUnsaved) return true;
    if (this.loadFailed || this.isReadOnlyWindow) return false;   // หน้าต่างรอง: ใช้รหัสชั่วคราว (ส่งงานเครื่องหลักไม่ได้อยู่แล้ว)
    const ok = await this.withMutation('บันทึกรหัสเครื่อง', () => this.saveKeys([
      { key: 'deviceId', value: this.deviceId }, { key: 'primaryStatus', value: null }]));
    if (ok) this._deviceIdUnsaved = false;
    return !!ok;
  }

  // Apps Script บอกแล้วว่าเครื่องนี้ไม่ใช่เครื่องหลัก → งานสรุป/สำรองของเครื่องนี้พักไว้ (ไม่ยิงซ้ำเปล่า ๆ)
  // งานยังอยู่ในคิว — ถ้าเจ้าของย้ายเครื่องหลักมาที่นี่ งานที่ค้างจะถูกส่งต่อทันที
  isPrimaryBlocked() {
    return !!(this.primaryStatus && this.primaryStatus.isPrimary === false);
  }

  // งานสรุป/สำรองที่ค้างอยู่ในคิวระหว่างที่เครื่องนี้ถูกพัก (ใช้บอกจำนวนบนป้ายสถานะ)
  countPrimaryPausedJobs() {
    return (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : [])
      .filter(it => it && (it.needSummary || it.needBackup)).length;
  }

  // ข้อความเดียวที่ใช้ทุกที่ (ป้ายหน้าตั้งค่า · toast · Telegram) — บอกทั้ง "เกิดอะไร" และ "ต้องทำอะไร"
  primaryPausedMessage() {
    const who = (this.primaryStatus && this.primaryStatus.primaryLabel) ? this.primaryStatus.primaryLabel : 'เครื่องอื่น';
    return `เครื่องนี้ (${this.deviceLabel() || 'ไม่ทราบรหัส'}) ไม่ใช่เครื่องหลักของร้าน (เครื่องหลักตอนนี้คือ ${who}) — ` +
      'ไฟล์สำรองขึ้น Drive และสรุปบนชีตจากเครื่องนี้ถูกพักไว้ ถ้านี่คือเครื่องที่ใช้ขายจริง ' +
      'ให้เจ้าของกด "ตั้งเครื่องนี้เป็นเครื่องหลัก" ในหน้าตั้งค่า';
  }

  // ── คำเตือนเรื่องไฟล์สำรอง ที่ต้องถึงเจ้าของแม้เขาไม่เคยเปิดหน้าตั้งค่า (ใส่ในข้อความปิดกะ) ──
  // ⚠️ เดิมเมื่อเครื่องถูกพักงานสรุป/สำรอง (ไม่ใช่เครื่องหลัก) งานจะถูกพักเงียบ ๆ ไม่นับเป็น "งานค้าง"
  // ป้ายหน้าหลักจึงขึ้น "ตรงกัน ✓" และไม่มีไฟล์สำรองขึ้น Drive อีกเลย — เกิดได้ตอนเพิ่งกู้ข้อมูลลงเครื่องใหม่
  // ซึ่งเป็นช่วงที่ต้องพึ่งไฟล์สำรองที่สุด · คืน '' = ไม่มีอะไรต้องเตือน
  backupHealthWarning(now) {
    if (!this.hasCloudSyncConfig()) return '';   // ร้านที่ไม่ได้ตั้ง Google Sheets ไม่มีไฟล์สำรองบน Drive อยู่แล้ว
    if (this.isPrimaryBlocked()) return this.primaryPausedMessage();
    const st = this.backupStatus;
    if (!st || !st.lastAttemptAt) return '';
    const t = Number(now) || Date.now();
    const when = ts => new Date(Number(ts)).toLocaleString('th-TH');
    if (!st.lastOk) {
      return `สำรองข้อมูลขึ้น Drive ครั้งล่าสุดล้มเหลว (${when(st.lastAttemptAt)}) — ` +
        `สำเร็จครั้งล่าสุด: ${st.lastSuccessAt ? when(st.lastSuccessAt) : 'ยังไม่เคย'}`;
    }
    if (Number(st.lastSuccessAt) > 0 && t - Number(st.lastSuccessAt) > BACKUP_STALE_WARN_MS) {
      return `ไม่ได้สำรองข้อมูลขึ้น Drive มา ${Math.floor((t - Number(st.lastSuccessAt)) / 86400000)} วัน ` +
        `(สำเร็จครั้งล่าสุด ${when(st.lastSuccessAt)})`;
    }
    if (Number(st.lastSizeBytes) > BACKUP_SIZE_WARN_BYTES) {
      return `ไฟล์สำรองใหญ่ ${(Number(st.lastSizeBytes) / 1048576).toFixed(1)} MB — เกินเกณฑ์ ${BACKUP_SIZE_WARN_BYTES / 1048576} MB ` +
        `เสี่ยงส่งไม่ทันเวลา ควรวางแผนเก็บบิลเก่าออก`;
    }
    return '';
  }

  // ⚠️ ห้ามเรียกจากในงานที่ถือคิวบันทึก (withMutation) อยู่ — ฟังก์ชันนี้เข้าคิวเอง
  async notePrimaryStatus(isPrimary, primary) {
    const p = (primary && typeof primary === 'object') ? primary : {};
    const next = {
      isPrimary: !!isPrimary, checkedAt: Date.now(),
      primaryLabel: String(p.label || '').slice(0, 40), primaryClaimedAt: Number(p.claimedAt) || 0
    };
    const changed = !this.primaryStatus || this.primaryStatus.isPrimary !== next.isPrimary ||
      this.primaryStatus.primaryLabel !== next.primaryLabel;
    this.primaryStatus = next;
    if (changed && !this.loadFailed && !this.isReadOnlyWindow) {
      try { await this.withMutation('สถานะเครื่องหลัก', () => this.saveKeys([{ key: 'primaryStatus', value: next }])); }
      catch (e) { console.warn('[Primary] บันทึกสถานะเครื่องหลักไม่สำเร็จ', e); }
    }
    this.renderPrimaryStatus();
    // ป้ายสถานะหน้าหลัก + สถานะสำรองต้องเปลี่ยนตามทันที ไม่ใช่รอรอบวาดหน้าจอถัดไป
    // (เดิมเปลี่ยนแค่กล่องในหน้าตั้งค่า — หน้าหลักยังขึ้น "ตรงกัน ✓" ทั้งที่งานสำรองถูกพัก)
    this.safeRender('สถานะสำรองข้อมูล', () => this.renderBackupStatus());
    this.safeRender('สถานะซิงก์', () => this.checkSyncStatus());
    return next;
  }

  // ถาม Apps Script ว่าใครเป็นเครื่องหลักตอนนี้ (ครั้งเดียวต่อการเปิดแอป + หลังตั้งเครื่องหลัก)
  // ยังไม่มีเครื่องหลัก = ปลดการพักงาน (เครื่องนี้จะได้เป็นเครื่องหลักเองตอนส่งสรุปครั้งถัดไป)
  async refreshPrimaryStatus() {
    if (!this.hasCloudSyncConfig() || !this.canWriteData()) return null;
    try {
      const d = await this.cloudPost('primary_status', {}, 15000);
      if (d.status !== 'success' || !d.details) return null;   // Apps Script รุ่นเก่า = ไม่รู้จักคำสั่งนี้ → ไม่เปลี่ยนอะไร
      const wasBlocked = this.isPrimaryBlocked();
      if (!d.details.registered) {
        if (this.primaryStatus) await this.notePrimaryStatus(true, null);
      } else {
        await this.notePrimaryStatus(!!d.details.isThisDevice, d.details.primary);
      }
      if (wasBlocked && !this.isPrimaryBlocked()) await this.releasePrimaryPausedJobs();
      return d.details.registered ? d.details : { registered: false };
    } catch (e) {
      console.warn('[Primary] ถามสถานะเครื่องหลักไม่สำเร็จ', e && e.message);
      return null;
    }
  }

  // งานสรุป/สำรองที่พักไว้ตอนเครื่องนี้ไม่ใช่เครื่องหลัก — ล้างตัวนับหน่วงเวลาให้ส่งได้ทันทีเมื่อปลดการพัก
  // ⚠️ ห้ามเรียกจากในงานที่ถือคิวบันทึกอยู่ — เข้าคิวเอง
  async releasePrimaryPausedJobs() {
    if (this.loadFailed || this.isReadOnlyWindow) return;
    await this.withMutation('ปลดงานสรุปที่พักไว้', async () => {
      let touched = false;
      (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : []).forEach(it => {
        if (it && it.retry && (it.retry.summary || it.retry.backup)) { delete it.retry.summary; delete it.retry.backup; touched = true; }
      });
      if (!touched) return;
      // ตัวนับหน่วงเวลาเป็นแค่จังหวะการลองใหม่ ไม่ใช่ข้อมูลร้าน — บันทึกไม่ได้ก็ส่งต่อได้ (รอบส่งจะบันทึกคิวเองอีกที)
      try { await this.saveStateOrThrow('ปลดงานสรุปที่พักไว้'); }
      catch (e) { console.warn('[Primary] บันทึกคิวงานหลังปลดการพักไม่สำเร็จ', e); }
    });
  }

  // เจ้าของย้ายสิทธิ์ส่งสรุป/สำรองมาที่เครื่องนี้ (ต้องใช้รหัสเจ้าของ — ตัดสินที่ Apps Script)
  async claimPrimaryDevice() {
    if (!this.authorize('data.admin', 'การตั้งเครื่องหลัก')) return false;
    if (!this.canWriteData('ตั้งเครื่องหลัก')) return false;
    if (!this.hasCloudSyncConfig()) { this.showToast(this.getCloudSetupMessage(), 'warning'); return false; }
    const yes = await this.askConfirm(
      `ตั้งเครื่องนี้ (${this.deviceLabel()}) เป็นเครื่องหลักของร้าน?\n\n` +
      'สรุปวัน/เดือนบนชีตและไฟล์สำรองบน Drive จะมาจากข้อมูลในเครื่องนี้เท่านั้น ' +
      'เครื่องอื่นยังส่งบิลรายใบได้ตามปกติ แต่ส่งสรุป/สำรองไม่ได้ — และยอดขายของเครื่องอื่นจะไม่ถูกรวมในแท็บสรุป');
    if (!yes) return false;
    let d;
    try { d = await this.cloudPost('claim_primary', {}, 20000, { owner: true }); }
    catch (e) { this.showToast('ตั้งเครื่องหลักไม่สำเร็จ: ' + this.explainCloudError(e), 'error', 8000); return false; }
    if (!d || d.status !== 'success') {
      this.showToast('ตั้งเครื่องหลักไม่สำเร็จ: ' + this.explainCloudError(d && d.message), 'error', 8000);
      return false;
    }
    await this.notePrimaryStatus(true, d.details && d.details.primary);
    await this.releasePrimaryPausedJobs();
    this.showToast('ตั้งเครื่องนี้เป็นเครื่องหลักแล้ว — กำลังส่งสรุป/สำรองที่ค้างอยู่', 'success', 6000);
    this.flushCloudOutbox();
    return true;
  }

  renderPrimaryStatus() {
    const box = typeof document !== 'undefined' && document.getElementById ? document.getElementById('primary-device-box') : null;
    if (!box) return;
    const st = this.primaryStatus;
    const label = escapeHtml(this.deviceLabel());
    let text;
    if (!this.hasCloudSyncConfig()) text = `เครื่องนี้: ${label} · ยังไม่ได้ตั้งค่า Google Sheets`;
    else if (!st) text = `เครื่องนี้: ${label} · ยังไม่รู้สถานะเครื่องหลัก (จะรู้หลังส่งสรุป/สำรองครั้งแรก)`;
    else if (st.isPrimary) text = `เครื่องนี้: ${label} · <b>เครื่องหลัก</b> — ส่งสรุปวัน/เดือนและไฟล์สำรองจากเครื่องนี้ ✓`;
    else text = `⚠️ เครื่องนี้ (${label}) ไม่ใช่เครื่องหลัก — เครื่องหลักคือ ${escapeHtml(st.primaryLabel || 'เครื่องอื่น')} · ` +
      'สรุปบนชีต/ไฟล์สำรองของเครื่องนี้ถูกพักไว้ และยอดขายของเครื่องนี้ไม่ถูกรวมในแท็บสรุป (บิลรายใบยังขึ้นชีตตามปกติ)';
    const btn = (this.currentRole === 'owner' && this.hasCloudSyncConfig() && !(st && st.isPrimary))
      ? ` <button class="btn-small secondary" onclick="app.claimPrimaryDevice()" style="padding:6px 10px;margin-left:4px;">ตั้งเครื่องนี้เป็นเครื่องหลัก</button>` : '';
    box.innerHTML = text + btn;
    if (box.style) box.style.color = (st && st.isPrimary === false) ? 'var(--accent-premium)' : '';
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

    // ล้างฐานข้อมูลในคิวงานบันทึก — งานที่ค้างอยู่ต้องจบก่อน และห้ามมีงานใหม่แทรกระหว่างล้างกับโหลดใหม่
    await this.withMutation('ล้างข้อมูลทั้งหมด', async () => {
      if (!this.requireOwnerForDataAction('รีเซ็ตข้อมูลทั้งหมด')) return;
      if (!this.canWriteData('ล้างข้อมูลทั้งหมด')) return;
      // ข้อ 13: รหัสเครื่องกับสถานะเครื่องหลักเป็นของ "เครื่อง" ไม่ใช่ของข้อมูลร้าน — ล้างข้อมูลแล้วต้องคงไว้
      // เดิมล้างทิ้งด้วย → ได้รหัสเครื่องใหม่ → Apps Script ปฏิเสธสรุป/สำรอง (NOT_PRIMARY) จนเจ้าของตั้งเครื่องหลักใหม่
      const keepDevice = [];
      try {
        for (const k of ['deviceId', 'primaryStatus']) {
          const rec = await db.state.get(k);
          if (rec && rec.value !== undefined && rec.value !== null) keepDevice.push({ key: k, value: rec.value });
        }
      } catch (e) { console.warn('[Reset] อ่านรหัสเครื่องก่อนล้างไม่สำเร็จ', e); }
      try {
        await db.state.clear();
        if (keepDevice.length) await db.state.bulkPut(keepDevice);
      } catch (e) { console.error(e); }
      localStorage.clear();
      this.clearDateKeyCache();
      this._dataGeneration++;
      await this.loadState();
      // สิ่งที่ loadState ซ่อมไว้ (เช่น PIN ตั้งต้นที่ต้องเข้ารหัส) — อยู่ในคิวงานนี้แล้ว บันทึกตรงนี้เลย
      // (ห้ามเรียก persistLoadRepairs ซึ่งจะเข้าคิวซ้อนตัวเองแล้วค้าง)
      if (this._loadRepairs && this._loadRepairs.length) {
        try { await this.saveStateOrThrow('ค่าเริ่มต้นหลังล้างข้อมูล'); this._loadRepairs = []; }
        catch (e) { console.warn('[Reset] บันทึกค่าเริ่มต้นหลังล้างข้อมูลไม่สำเร็จ', e); }
      }
    });
    this.renderEveryScreen();
    this.showToast('คืนค่าเริ่มต้นข้อมูลเรียบร้อยแล้ว!', 'info');
  }

  // ล้างยอดขายทั้งร้าน (เก็บบริการ/พนักงาน/ลูกค้า/การตั้งค่าไว้)
  // ⚠️ รอบตรวจ 6 ข้อ 1 (2 ต.ค. 2569 · เจ้าของเลือก "ถอดปุ่มออก"):
  //    เดิมมีปุ่มอยู่ใต้ "ล้างข้อมูลทั้งหมด" และกดยืนยันในกล่องธรรมดาครั้งเดียวก็ลบยอดขายทั้งร้าน
  //    — ไม่สำรองก่อน ไม่มีทางย้อน และบิลที่ยังไม่ขึ้นชีตตอนกดหายถาวร (มีอยู่ในเครื่องที่เดียว)
  //    ร้านใช้งานจริงแล้วจึงถอดปุ่มออกจากหน้าจอ · คำสั่งยังอยู่แต่ต้องผ่านด่านเดียวกับ resetData:
  //    เจ้าของ → ไม่มีบิลที่ยังไม่ขึ้นชีต → พิมพ์คำยืนยัน → สำรองขึ้น Drive สำเร็จ (ไม่ได้ต่อชีต = ถามยืนยันอีกชั้น)
  // คืน true เมื่อล้างจริง · false = ไม่ได้ล้าง (ด่านใดด่านหนึ่งไม่ผ่าน/ผู้ใช้ยกเลิก)
  async clearSalesData() {
    if (!this.requireOwnerForDataAction('ล้างยอดขาย')) return false;
    if (!this.canWriteData('ล้างยอดขาย')) return false;
    const notOnSheet = () => (Array.isArray(this.state.transactions) ? this.state.transactions : [])
      .filter(tx => tx && tx.syncStatus !== 'synced').length;
    const pendingWarn = (n) => this.showToast(
      `ยังมีบิล ${n} ใบที่ยังไม่ขึ้นชีต (ค้างส่ง/รอตรวจ) — ล้างแล้วบิลพวกนี้จะหายถาวร จึงยังไม่ล้าง · ซิงก์ให้ครบก่อน`, 'error', 8000);
    if (this.googleSheetsUrl) {
      const n = notOnSheet();
      if (n > 0) { pendingWarn(n); return false; }
    }

    const KEYWORD = 'ล้างยอดขาย';
    const txCount = Array.isArray(this.state.transactions) ? this.state.transactions.length : 0;
    const shiftCount = (this.state.shift && Array.isArray(this.state.shift.history)) ? this.state.shift.history.length : 0;
    const typed = window.prompt(
      'คำเตือน: จะล้างยอดขายทั้งร้านออกจากเครื่องนี้\n' +
      `(บิล ${txCount} รายการ · ประวัติกะ ${shiftCount} กะ · ประวัติยกเลิก/แก้บิล/ลบค่าใช้จ่าย · กะที่เปิดอยู่)\n` +
      'รายการบริการ พนักงาน ลูกค้า และการตั้งค่ายังอยู่ · แถวบิลบน Google Sheets ไม่ถูกลบ\n\n' +
      `ถ้าแน่ใจจริง ให้พิมพ์คำว่า  ${KEYWORD}  แล้วกดตกลง`
    );
    if (typed === null || typed === undefined) return false;   // กดยกเลิก
    if (String(typed).trim() !== KEYWORD) {
      this.showToast('ข้อความยืนยันไม่ตรง — ยกเลิกการล้างยอดขายแล้ว', 'info');
      return false;
    }

    // ด่านสุดท้าย: ต้องมีสำเนาบน Drive ก่อน (กู้กลับได้ด้วยปุ่มกู้ข้อมูล) — แบบเดียวกับ resetData
    if (this.googleSheetsUrl) {
      this.showToast('กำลังสำรองข้อมูลก่อนล้างยอดขาย...', 'info');
      const backedUp = await this.autoBackupToGoogleDrive();
      if (!backedUp) {
        this.showToast('สำรองข้อมูลไม่สำเร็จ — ยกเลิกการล้างยอดขายเพื่อความปลอดภัย ลองใหม่เมื่อเน็ตพร้อม', 'error', 6000);
        return false;
      }
    } else {
      const sure = window.confirm(
        'ยังไม่ได้ตั้งค่า Google Sheets — ระบบสำรองข้อมูลก่อนล้างไม่ได้\n' +
        'ถ้าล้างตอนนี้ ยอดขายจะหายถาวรโดยไม่มีสำเนาที่ไหนเลย\n\nยืนยันจะล้างทั้งที่ไม่มีสำเนา?'
      );
      if (!sure) return false;
    }

    return this.withMutation('การล้างยอดขาย', async () => {
      if (!this.requireOwnerForDataAction('ล้างยอดขาย')) return false;
      // ระหว่างรอสำรองขึ้น Drive อาจมีบิลใหม่ที่ยังไม่ขึ้นชีต — ตรวจซ้ำ ณ จุดล้างจริง
      if (this.googleSheetsUrl) {
        const n = notOnSheet();
        if (n > 0) { pendingWarn(n); return false; }
      }
      // ล้างยอดขาย = ลบเงินทั้งชุดออกจากระบบ ถ้าเขียนเครื่องไม่สำเร็จแล้วปล่อยผ่าน
      // หน้าจอจะว่างเปล่าเหมือนล้างสำเร็จ แต่เปิดแอปใหม่ยอดกลับมาทั้งหมด — สองสถานะที่ไม่ตรงกัน
      const prevAll = this.cloneForRollback({
        transactions: this.state.transactions, queue: this.state.queue, cart: this.state.cart,
        voidLog: this.state.voidLog, expenseLog: this.state.expenseLog, editLog: this.state.editLog,
        quarantine: this.state.quarantine,
        cloudOutbox: this.state.cloudOutbox, shift: this.state.shift
      });
      this.state.transactions = [];
      this.state.queue = [];
      this.state.cart = [];
      this.state.voidLog = [];     // ล้างประวัติ void ของยอดเก่าไปพร้อมกัน
      this.state.expenseLog = [];  // ประวัติการลบค่าใช้จ่ายก็เป็นของยอดเก่า ล้างไปด้วยกัน
      this.state.editLog = [];     // ประวัติการแก้บิลของยอดเก่า ล้างไปด้วยกัน
      this.state.quarantine = [];  // รายการที่แยกตรวจสอบก็เป็นของยอดชุดเก่า (เจ้าของสั่งล้างยอดเองแล้ว)

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
      })) { this.renderEveryScreen(); return false; }
      // ข้อมูลชุดใหม่ — งานคลาวด์ที่กำลังส่งของชุดเก่าอยู่ห้ามนำผลกลับมาเขียนทับ
      this._dataGeneration++;
      this.renderEveryScreen();
      this.vibrateDevice(100);
      this.showToast('ล้างประวัติยอดขายและคิวงานทั้งหมดเรียบร้อยแล้ว' +
        (this.googleSheetsUrl ? ' (มีสำเนาก่อนล้างบน Google Drive — กู้กลับได้ด้วยปุ่มกู้ข้อมูล)' : ''), 'info', 6000);
      this.openCashCounter('open');
      return true;
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
    const todayAll = this.state.transactions.filter(tx => {
      return this.getBusinessISODate(tx.date) === todayStr;
    });
    // ข้อ 14: ใช้ตัวกรองเดียวกับหน้ารายงาน/ชีต — บิลรอตรวจ (ตัวเลขเงินเชื่อไม่ได้) ไม่นับในยอด แต่บอกจำนวนแยก
    const todaySplit = this.summaryBillsOf(todayAll);
    const todayTxs = todaySplit.bills;

    // 2. คำนวณ KPI
    const todayRevenue = todayTxs.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0);
    const waitingQueue = this.state.queue.filter(q => q.status === 'waiting').length;
    const servingQueue = this.state.queue.filter(q => q.status === 'serving').length;
    const completedQueue = todayTxs.reduce((sum, tx) => sum + (Array.isArray(tx.services) ? tx.services.length : 0), 0);

    document.getElementById('kpi-revenue').innerText = `฿${todayRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` +
      (todaySplit.excluded ? ` (+รอตรวจ ${todaySplit.excluded})` : '');
    // เทรนด์เทียบยอดขายเมื่อวาน (วันทำการก่อนหน้า)
    const _ydayStr = this.getBusinessISODate(Date.now() - 86400000);
    const _ydayRevenue = this.summaryBillsOf(this.state.transactions.filter(tx => this.getBusinessISODate(tx.date) === _ydayStr))
      .bills.reduce((s, tx) => s + (Number(tx.total) || 0), 0);
    const _trendEl = document.getElementById('kpi-revenue-trend');
    if (_trendEl && !this.canViewPastSales()) {
      // "เทียบเมื่อวาน" คือยอดของวันก่อน — ดูย้อนหลังได้เฉพาะเจ้าของ (เจ้าของสั่ง 26 ก.ย. 2569)
      _trendEl.className = 'kpi-trend';
      _trendEl.innerHTML = '';
    } else if (_trendEl) {
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
                <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr} น.${e.by ? ' • โดย ' + escapeHtml(e.by) : ''}${e.approvedBy ? ' • อนุมัติโดย ' + escapeHtml(e.approvedBy) : ''}${this.isExpenseOutsideDrawer(e) ? ' • จ่ายทางอื่น (ไม่หักลิ้นชัก)' : ''}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--accent-premium);">฿${e.amount.toLocaleString('th-TH')}</span>
                ${this.expenseDeleteRule(e) === 'deny' ? '' : `<button type="button" class="btn-icon" onclick="app.deleteExpense('${safeId(e.id)}')" style="background: none; border: none; color: var(--accent-premium); cursor: pointer; padding: 4px;" aria-label="ลบค่าใช้จ่าย">
                  <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i>
                </button>`}
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
    if (!this.authorize('settings.write', 'ตั้งค่า VAT')) return;
    // ⚠️ เดิมช่องหาย = อัตราตกกลับไป 7% และสวิตช์ถูกปิดเงียบ ๆ ทั้งที่เจ้าของไม่ได้สั่ง
    let chk, rate;
    try {
      chk  = this.requireEl('vat-enabled', 'สวิตช์เปิด-ปิด VAT');
      rate = this.requireEl('vat-rate', 'ช่องอัตรา VAT');
    } catch (err) {
      return; // ฟ้องไปแล้วใน uiContractFail (toast + ป้ายแดง) — ห้ามแตะค่า VAT ต่อ
    }
    // กติกาตัวเลข: อัตรา VAT เป็นจำนวนเต็มเปอร์เซ็นต์เท่านั้น
    const raw  = parseWholeNumberInput(rate.value);
    // อัตราต้องอยู่ในช่วงที่เป็นไปได้ — พิมพ์ 700 แล้วบิลจะบวมแบบไม่มีใครทันสังเกต
    if (raw === null || raw < 0 || raw > 30) {
      this.showToast('อัตรา VAT ต้องเป็นจำนวนเต็ม 0 ถึง 30 เปอร์เซ็นต์ (ไม่มีทศนิยม)', 'warning');
      return;
    }
    const wantEnabled = !!chk.checked;
    const wantRate = raw;
    return this.withMutation('การตั้งค่า VAT', async () => {
      // เก็บค่าเดิมไว้ก่อนแตะ — อัตรา VAT ผิดแปลว่ายอดที่ยื่นสรรพากรผิด
      const prevVat = { enabled: this.vatEnabled, rate: this.vatRate };
      this.vatEnabled = wantEnabled;
      this.vatRate = wantRate;
      if (!await this.persistOrRollback('การตั้งค่า VAT', () => {
        this.vatEnabled = prevVat.enabled; this.vatRate = prevVat.rate;
      })) { this.renderVatSettings(); this.updateCartTotals(); return; }
      this.renderVatSettings();
      this.renderCategoryList();
      this.updateCartTotals(); // ตะกร้าที่ค้างอยู่ต้องเปลี่ยนยอดทันที
      this.showToast(this.vatEnabled
        ? `เปิดเก็บ VAT ${this.vatRate}% แล้ว — มีผลกับบิลใหม่เท่านั้น บิลเก่าไม่เปลี่ยน`
        : 'ปิดการเก็บ VAT แล้ว — บิลเก่าที่เคยเก็บ VAT ยังคงตัวเลขเดิมไว้', 'success', 5000);
    });
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
    if (!this.authorize('settings.write', 'จัดการหมวดหมู่')) return;
    const nameInput = document.getElementById('cat-name');
    const iconSel = document.getElementById('cat-icon');
    const name = (nameInput ? nameInput.value : '').trim();
    const icon = (iconSel ? iconSel.value : 'fa-tag') || 'fa-tag';
    const vatChk = document.getElementById('cat-vat');
    const vat = !!(vatChk && vatChk.checked);
    if (!name) { this.showToast('กรุณากรอกชื่อหมวดหมู่', 'warning'); if (nameInput) nameInput.focus(); return; }
    const editingId = this.state.editingCategoryId;
    return this.withMutation('หมวดหมู่', async () => {
      const dup = this.state.categories.find(c => c.name.trim() === name && c.id !== editingId);
      if (dup) { this.showToast('มีหมวดหมู่ชื่อนี้อยู่แล้ว', 'warning'); return; }
      const prevCats = this.cloneForRollback(this.state.categories);
      if (editingId) {
        const c = this.state.categories.find(x => x.id === editingId);
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
    });
  }
  deleteCategory(catId) {
    if (!this.authorize('settings.write', 'ลบหมวดหมู่')) return;
    const inUse = this.state.services.filter(s => s.category === catId).length;
    if (inUse > 0) {
      this.showToast(`ลบไม่ได้ — ยังมี ${inUse} บริการในหมวดนี้ กรุณาย้ายหรือลบบริการในหมวดนี้ก่อน`, 'warning');
      return;
    }
    // บิลที่ขายไปแล้วอ้างหมวดนี้อยู่ → ลบไม่ได้ (สรุป VAT/ภ.พ.30 ต้องใช้ชื่อหมวด ลบแล้วจะเหลือแต่รหัส)
    const billsUsing = this.billsUsingCategory(catId);
    if (billsUsing > 0) {
      this.showToast(`ลบไม่ได้ — มีบิลที่ขายไปแล้ว ${billsUsing} ใบใช้หมวดนี้ (สรุป VAT ต้องใช้ชื่อหมวด) · เปลี่ยนชื่อหมวดแทนได้`, 'warning', 7000);
      return;
    }
    this.showConfirm('ยืนยันลบหมวดหมู่นี้ใช่หรือไม่?', () => this.withMutation('การลบหมวดหมู่', async () => {
      // ระหว่างรอกดยืนยัน สิทธิ์/ข้อมูลเปลี่ยนได้ (ออกจากระบบ · มีบริการย้ายเข้าหมวดนี้) — ตรวจซ้ำ ณ จุดเขียนจริง
      if (!this.authorize('settings.write', 'ลบหมวดหมู่')) return;
      if (this.state.services.some(s => s.category === catId)) {
        this.showToast('ลบไม่ได้ — มีบริการอยู่ในหมวดนี้แล้ว', 'warning'); return;
      }
      if (this.billsUsingCategory(catId) > 0) {
        this.showToast('ลบไม่ได้ — มีบิลที่ใช้หมวดนี้แล้ว', 'warning'); return;
      }
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
    }));
  }
  // จำนวนบิล (ทุกใบในเครื่อง) ที่มีรายการในหมวดนี้
  billsUsingCategory(catId) {
    return (this.state.transactions || []).filter(tx =>
      tx && Array.isArray(tx.details) && tx.details.some(d => d && d.category === catId)).length;
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
    this.refreshQuarantineUI();
    this.renderBackupStatus();
    this.renderPrimaryStatus();
    this.renderSyncConflicts();
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
    // priceInvalid = ราคาในไฟล์ที่กู้มาใช้ไม่ได้ ระบบแสดงเป็น 0 แต่ "ไม่ใช่ราคาจริง" — ห้ามขายเป็นของฟรี
    if (service.priceInvalid === true || svcPrice === null || svcPrice < 0) {
      this.showToast(`บริการ "${service.name}" มีราคาที่ใช้คิดเงินไม่ได้ — แก้ราคาในหน้าตั้งค่าก่อนขาย`, 'error', 6000);
      console.error('[Guard] ราคาบริการใช้ไม่ได้:', service.id, service.price);
      return;
    }
    // กติกาตัวเลข: ราคาต้องเป็นจำนวนเต็มบาท — ราคาเก่าที่มีทศนิยมต้องแก้ก่อนขาย
    if (!isWholeNumber(svcPrice)) {
      this.showToast(`บริการ "${service.name}" ราคามีทศนิยม (${svcPrice}) — แก้ราคาเป็นจำนวนเต็มบาทในหน้าตั้งค่าก่อนขาย`, 'error', 6000);
      console.error('[Guard] ราคาบริการใช้ไม่ได้:', service.id, service.price);
      return;
    }
    const svcDuration   = this.toFiniteNumber(service.duration);
    const svcCommission = this.toFiniteNumber(service.commission);

    // ไม่ใส่ผู้ให้บริการให้เอง (ข้อ 5 รอบตรวจ 26 ก.ย. 2569) — เดิมใส่คนแรกในรายชื่อ
    // ลืมเปลี่ยน = ค่าคอมไปผิดคนเงียบ ๆ · ด่านชำระเงินไม่ยอมผ่านจนเลือกครบ

    this.state.cart.push({
      uniqueCartId: Date.now() + Math.random().toString(36).substr(2, 5), // รหัสจำลองไอเท็มในคาร์ท
      id: service.id,
      name: service.name,
      price: svcPrice,
      duration: (svcDuration === null || svcDuration < 0) ? 0 : svcDuration,
      commission: (svcCommission === null || svcCommission < 0) ? 0 : svcCommission,
      commissionType: service.commissionType === 'fixed' ? 'fixed' : 'percent',
      category: service.category || '',   // ใช้ตัดสินว่าต้องบวก VAT ไหม
      staffId: '',
      staffName: ''
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
              ${this.state.staff.some(st => st.id === item.staffId) ? '' :
                // ผู้ให้บริการของรายการนี้ถูกลบไปแล้ว — ต้องมีตัวเลือกว่างให้เห็นชัดและเลือกคนใหม่ได้ทุกคน
                // (เดิมจอโชว์ชื่อคนแรกแต่รายการยังผูกคนที่ถูกลบ เลือกชื่อเดิมซ้ำไม่เกิด change → ชำระเงินไม่ได้)
                `<option value="" selected disabled>${item.staffId ? '— เลือกผู้ให้บริการใหม่ —' : '— เลือกผู้ให้บริการ —'}</option>`}
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
    // ⚠️ ห้ามใช้ค่าสำรอง 0 เมื่อหาช่องไม่เจอ — ส่วนลดจะหายทั้งบิลโดยไม่มีใครรู้
    const discountInput = this.requireEl('cart-discount', 'ช่องส่วนลดในตะกร้า');
    // กติกาตัวเลข: ส่วนลดต้องเป็นจำนวนเต็มบาท (ว่าง = 0) — ทศนิยม/ติดลบ/ตัวอักษร = หยุด ไม่เดาค่า
    const raw = parseWholeNumberInput(discountInput.value, 0);
    if (raw === null) {
      const err = new Error('ส่วนลดต้องเป็นจำนวนเต็มบาท (ไม่มีทศนิยม) — แก้ช่องส่วนลดก่อน');
      err.badDiscount = true;
      throw err;
    }
    return Math.min(raw, subtotal);
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
    let t;
    try {
      t = this.getCartBillTotals();
    } catch (err) {
      // ส่วนลดผิดกติกา (ทศนิยม) — ห้ามโชว์ยอดที่เดาเอง บอกให้แก้ แล้วปุ่มชำระเงินจะไม่ผ่านจนแก้
      if (!err || !err.badDiscount) throw err;
      const totalEl = document.getElementById('summary-total');
      if (totalEl) totalEl.innerText = 'ส่วนลดต้องเป็นจำนวนเต็ม';
      const now = Date.now();
      if (!this._badDiscountToastAt || now - this._badDiscountToastAt > 4000) {
        this._badDiscountToastAt = now;
        this.showToast(err.message, 'warning', 5000);
      }
      return;
    }
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
    // ผู้ให้บริการต้องถูก "เลือก" ครบทุกรายการ — ระบบไม่ใส่ให้เอง (ค่าคอมต้องเข้าคนที่ทำจริง)
    const noStaff = this.state.cart.filter(i => !this.state.staff.some(st => st.id === i.staffId));
    if (noStaff.length) {
      this.showToast(`เลือกผู้ให้บริการให้ครบก่อนชำระเงิน (ยังไม่ได้เลือก: ${noStaff.map(i => i.name).slice(0, 3).join(', ')})`, 'warning', 6000);
      return;
    }
    // ส่วนลดผิดกติกา = ไม่เปิดหน้าชำระเงิน (ยอดใน QR/ที่บอกลูกค้าต้องเป็นยอดจริงเท่านั้น)
    try { this.getCartTotal(); }
    catch (err) {
      if (err && err.badDiscount) { this.showToast(err.message, 'warning', 6000); return; }
      throw err;
    }

    // ตั้งค่าบิลเริ่มต้นในป๊อปอัป
    this.selectPaymentMethod(null); // ยกเลิกการเลือกช่องทางจ่ายเงินเดิมก่อน
    // เปิดรอบชำระเงินใหม่ — ผูกกับตะกร้าและยอดที่ลูกค้าเห็นตอนนี้ (ดู beginCheckoutAttempt)
    this.beginCheckoutAttempt();
    
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
      // สำหรับเงินสด ปุ่มจะใช้งานได้ต่อเมื่อกรอกเงินครบ (บิล 0 บาทเปิดปุ่มได้เลย — ดู recalcCashChange)
      try { this.recalcCashChange(); } catch (e) { console.warn('recalcCashChange failed', e); }
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
      // ปุ่มยืนยันรับเงินเปิดได้ "เฉพาะเมื่อ QR ขึ้นจอสำเร็จ" (รอบตรวจ 4 ข้อ A6)
      // เดิมเปิดปุ่มไว้ก่อนแล้วค่อยสร้าง QR — สร้างไม่สำเร็จ ปุ่มก็ยังกดได้ = บันทึกว่าได้รับโอน
      // ทั้งที่ลูกค้าไม่มี QR ให้สแกน
      completeBtn.disabled = !this.generatePromptPayQR();
    }
  }

  // สร้าง QR Code PromptPay มาตรฐาน EMVCo จากเลขพร้อมเพย์ของร้าน (สแกนจ่ายได้จริง + ฝังยอดเงิน)
  // คืน true เมื่อ QR ขึ้นจอแล้วเท่านั้น · false = ไม่มี QR ให้สแกน (ปุ่มยืนยันรับเงินถูกปิด)
  // ผลล่าสุดถูกจำไว้ในรอบชำระเงิน (qrFailed) — ตัวบันทึกบิลใช้ปฏิเสธการรับเงินผ่าน QR ที่ไม่เคยขึ้นจอ
  generatePromptPayQR() {
    const markQr = (ok) => { if (this._checkoutAttempt) this._checkoutAttempt.qrFailed = !ok; return ok; };
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
      return markQr(false);
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
      return markQr(true);
    } catch (err) {
      console.error('PromptPay QR generation failed:', err);
      if (qrBox) qrBox.innerHTML = `<div style="padding:24px 12px;text-align:center;color:#b91c1c;font-size:0.8rem;line-height:1.5;">⚠️ สร้าง QR ไม่สำเร็จ<br>${escapeHtml(err && err.message)}<br><span style="color:#64748b;">ลองรีเฟรชแอป หรือเช็คเลขพร้อมเพย์ในตั้งค่า · ระหว่างนี้รับเป็นเงินสด/บัตรแทน</span></div>`;
      // ⚠️ ไม่มี QR ให้ลูกค้าสแกน = ห้ามกดยืนยันว่าได้รับโอนแล้ว (รอบตรวจ 4 ข้อ A6)
      if (ppCompleteBtn) ppCompleteBtn.disabled = true;
      return markQr(false);
    }
  }

  // ดำเนินการชำระเงินเรียบร้อย
  // คำนวณเงินทอน + เปิด/ปิดปุ่มยืนยัน (ใช้ร่วมกับช่องกรอกและปุ่มเงินด่วน)
  recalcCashChange() {
    // ช่องเงินที่รับมาหาย = เงินทอนที่โชว์บนจอผิด และปุ่มจบบิลอาจถูกปลดล็อกทั้งที่ยังไม่รับเงิน
    const input = this.requireEl('cash-received', 'ช่องเงินที่รับมา');
    // กติกาตัวเลข: เงินที่รับต้องเป็นจำนวนเต็มบาท
    const parsed = parseWholeNumberInput(input.value);
    const received = parsed === null ? 0 : parsed;
    const total = this.getCartTotal();
    const change = received - total;
    const changeEl = document.getElementById('cash-change');
    const checkoutCompleteBtn = document.getElementById('btn-complete-checkout');
    if (!changeEl || !checkoutCompleteBtn) return;
    if (String(input.value == null ? '' : input.value).trim() !== '' && parsed === null) {
      changeEl.innerText = 'ใส่จำนวนเต็มบาท (ไม่มีทศนิยม)';
      changeEl.style.color = 'var(--color-danger)';
      checkoutCompleteBtn.disabled = true;
    } else if (total === 0) {
      // บิล 0 บาท (ลด 100%) — ไม่ต้องรับเงิน ยืนยันได้เลย (เดิมปุ่มไม่เปิด ต้องไปเลือกโอน/บัตรแทน = ช่องทางผิด)
      changeEl.innerText = `฿${received.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      changeEl.style.color = 'var(--accent-massage)';
      checkoutCompleteBtn.disabled = false;
    } else if (received <= 0) {
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
    // เดิม return เงียบ ๆ — พนักงานกดปุ่มแล้วไม่มีอะไรเกิดขึ้น แล้วเดาว่ากดไม่โดน
    const input = this.requireEl('cash-received', 'ช่องเงินที่รับมา');
    input.value = (amount === 'exact') ? this.getCartTotal() : amount;
    this.recalcCashChange();
    input.focus();
  }

  async processCheckout() {
    // ── ด่านกันเรียกซ้อน ────────────────────────────────────────────────
    // ⚠️ เดิมพึ่ง "ปุ่มถูก disable" อย่างเดียว — กดรัว/เน็ตหน่วง/เรียกจากโค้ดตรง ๆ
    // ทำให้สองคำสั่งวิ่งเข้าไปพร้อมกันและออกบิลซ้ำได้ (ลูกค้าจ่ายครั้งเดียว ระบบบันทึกสองใบ)
    // ตอนนี้กันสามชั้น: ธงงานชำระเงิน · คิวงานบันทึก (withMutation) · รอบชำระเงินที่ใช้ได้ครั้งเดียว
    if (this._checkoutBusy) {
      console.warn('[Checkout] กำลังบันทึกบิลก่อนหน้าอยู่ — ไม่รับคำสั่งซ้อน');
      return false;
    }
    this._checkoutBusy = true;
    const btn = document.getElementById('btn-complete-checkout');
    if (btn) btn.disabled = true;
    let done = false;
    try {
      done = await this.withMutation('การขาย', () => this._processCheckoutLocked());
      return done;
    } catch (err) {
      console.error('Checkout error:', err);
      this.showToast('การชำระเงินล้มเหลว: ' + err.message, 'error');
      return false;
    } finally {
      this._checkoutBusy = false;
      if (!done && btn) btn.disabled = false;
    }
  }

  // ── เปิดรอบชำระเงิน (เรียกตอนเปิดหน้าต่างชำระเงิน) ─────────────────────────
  // หนึ่งรอบ = ออกบิลได้หนึ่งใบเท่านั้น และผูกกับ "ตะกร้าและยอด" ที่ลูกค้าเห็นตอนเปิด
  // กันสองกรณี: กดยืนยันซ้ำหลังบันทึกไปแล้ว · ยอดเปลี่ยนหลังสร้าง QR/บอกยอดลูกค้าไปแล้ว
  beginCheckoutAttempt() {
    const cart = Array.isArray(this.state.cart) ? this.state.cart : [];
    let total = null;
    try { total = this.getCartTotal(); } catch (e) { total = null; }
    this._checkoutAttempt = {
      id: `CO-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      cartKey: this.checkoutCartKey(cart),
      total: total,
      openedAt: Date.now()
    };
    return this._checkoutAttempt;
  }

  checkoutCartKey(cart) {
    return (Array.isArray(cart) ? cart : []).map(i => i && [i.uniqueCartId, i.id, i.price, i.staffId].join('|')).join('~');
  }

  // ตัวบันทึกบิลจริง — เรียกผ่าน processCheckout เท่านั้น (อยู่ในคิวงานบันทึกแล้ว)
  // ทุกเงื่อนไขตรวจที่นี่ ไม่ใช่ที่ปุ่ม: ปุ่มเป็นแค่ความสะดวกของหน้าจอ ไม่ใช่ด่าน
  async _processCheckoutLocked() {
    const fail = (msg) => { throw new Error(msg); };

    // 1) สภาพเครื่อง
    if (this.loadFailed) fail('โหลดข้อมูลร้านไม่สำเร็จ — ห้ามออกบิลเพื่อกันข้อมูลเดิมถูกทับ');
    if (this.isReadOnlyWindow) fail('หน้าต่างนี้เปิดซ้ำอยู่ จึงออกบิลไม่ได้ — ให้ใช้หน้าต่างเดิม');

    // 2) คนออกบิล
    if (!this.authorize('sale.checkout', 'ออกบิล', { quiet: true })) {
      fail('ยังไม่ได้เข้าสู่ระบบ (หรือบัญชีนี้ออกบิลไม่ได้) — ล็อกอินก่อนเก็บเงิน');
    }

    // 3) กะ — ยอดเงินสดต้องเข้าการนับลิ้นชักของกะที่เปิดอยู่เสมอ
    const shift = this.state.shift;
    if (!shift || shift.active !== true || !Number.isFinite(Number(shift.startTime)) || !(Number(shift.startTime) > 0)) {
      fail('ยังไม่ได้เปิดกะ — นับเงินตั้งต้นเปิดกะก่อนออกบิล');
    }

    // 4) ตะกร้า
    const cart = Array.isArray(this.state.cart) ? this.state.cart : [];
    if (cart.length === 0) fail('ไม่มีรายการในตะกร้า');
    if (!Array.isArray(this.state.staff) || this.state.staff.length === 0) fail('ยังไม่มีพนักงานในระบบ');
    const staffIds = new Set(this.state.staff.map(s => s && s.id));
    cart.forEach(item => {
      if (!item || typeof item !== 'object') fail('ตะกร้ามีรายการที่เสีย — ล้างตะกร้าแล้วเลือกใหม่');
      const p = this.toFiniteNumber(item.price);
      if (p === null || p < 0 || typeof item.price !== 'number') fail(`ราคาของ "${item.name || '-'}" ใช้คิดเงินไม่ได้ — ล้างตะกร้าแล้วเลือกใหม่`);
      if (!isWholeNumber(item.price)) fail(`ราคาของ "${item.name || '-'}" ต้องเป็นจำนวนเต็มบาท — แก้ราคาในหน้าตั้งค่าก่อนขาย`);
      if (!item.staffId) fail(`ยังไม่ได้เลือกผู้ให้บริการของ "${item.name || '-'}"`);
      if (!staffIds.has(item.staffId)) fail(`ผู้ให้บริการของ "${item.name || '-'}" ไม่มีในระบบแล้ว — เลือกผู้ให้บริการใหม่`);
    });

    // 5) รอบชำระเงิน — ใช้ได้ครั้งเดียว และต้องเป็นตะกร้าเดียวกับที่เปิดหน้าชำระเงิน
    const attempt = this._checkoutAttempt;
    if (!attempt) fail('รอบชำระเงินนี้ถูกใช้ไปแล้วหรือยังไม่ได้เปิด — เปิดหน้าชำระเงินใหม่อีกครั้ง');
    if (attempt.cartKey !== this.checkoutCartKey(cart)) fail('ตะกร้าเปลี่ยนหลังเปิดหน้าชำระเงิน — เปิดหน้าชำระเงินใหม่อีกครั้ง');
    if ((this.state.transactions || []).some(tx => tx && tx.checkoutAttemptId === attempt.id)) {
      this._checkoutAttempt = null;
      fail('บิลของรอบชำระเงินนี้ถูกบันทึกไปแล้ว — ไม่ออกซ้ำ');
    }

    // 6) ช่องทางชำระเงิน
    const method = this.state.selectedPaymentMethod;
    if (!['cash', 'promptpay', 'credit'].includes(method)) fail('ยังไม่ได้เลือกช่องทางชำระเงิน (หรือช่องทางไม่ถูกต้อง)');
    if (method === 'promptpay') {
      const pp = String(this.shopPromptPayId || '').replace(/[^0-9]/g, '');
      if (!/^(0\d{9}|\d{13}|\d{15})$/.test(pp)) fail('ยังไม่ได้ตั้งเลขพร้อมเพย์ของร้าน — รับเงินผ่าน QR ไม่ได้');
      // QR ของรอบชำระเงินนี้สร้างไม่สำเร็จ — ลูกค้าไม่มีอะไรให้สแกน ห้ามบันทึกว่าได้รับโอน
      if (attempt.qrFailed === true) fail('QR พร้อมเพย์ของบิลนี้สร้างไม่สำเร็จ — ลูกค้ายังไม่ได้สแกนจ่าย รับเป็นเงินสด/บัตรแทน หรือรีเฟรชแอปแล้วลองใหม่');
    }

    const subtotal = this.getCartSubtotal();
    const discount = this.getCartDiscount(subtotal); // clamp [0, subtotal] แล้ว
    // ⚠️ ล็อกตัวเลข VAT ณ วินาทีที่จบบิล แล้วเก็บติดไปกับบิลเลย
    // ห้ามคำนวณสดจากค่าตั้งค่าตอนแสดงผล ไม่งั้นวันที่เปลี่ยนอัตรา VAT หรือปิดสวิตช์
    // บิลเก่าทั้งหมดจะเปลี่ยนตัวเลขตามไปด้วย และยอดที่ยื่นสรรพากรไปแล้วจะไม่ตรงกับระบบ
    const vatCalc = this.getCartBillTotals();
    const total = vatCalc.total;
    if (!Number.isFinite(total) || total < 0) fail('คำนวณยอดบิลไม่ได้');
    // ยอดที่ลูกค้าเห็นตอนเปิดหน้าชำระเงิน (รวมยอดใน QR) ต้องเท่ากับยอดที่จะบันทึก
    if (attempt.total !== null && Math.round(attempt.total * 100) !== Math.round(total * 100)) {
      fail(`ยอดเปลี่ยนจาก ฿${attempt.total} เป็น ฿${total} หลังเปิดหน้าชำระเงิน — เปิดหน้าชำระเงินใหม่อีกครั้ง`);
    }

    // 7) เงินสด: ต้องรับครบ — ตรวจเป็นสตางค์จำนวนเต็ม ไม่เทียบทศนิยมตรง ๆ
    let cashReceived = null, cashChange = null;
    if (method === 'cash') {
      const recEl = this.requireEl('cash-received', 'ช่องเงินที่รับมา');
      const rawRec = String(recEl.value == null ? '' : recEl.value).trim();
      // บิล 0 บาท (ลด 100%) ไม่ต้องรับเงิน — ช่องว่าง = รับ 0
      if (rawRec === '' && Math.round(total * 100) === 0) recEl.value = '0';
      const rec = parseWholeNumberInput(rawRec === '' && Math.round(total * 100) === 0 ? '0' : rawRec);
      if (rawRec !== '' && rec === null) fail('จำนวนเงินที่รับมาต้องเป็นจำนวนเต็มบาท (ไม่มีทศนิยม)');
      if (rec === null) fail('กรอกจำนวนเงินสดที่รับมาก่อน');
      if (rec > 10000000) fail('จำนวนเงินที่รับมาผิดปกติ — ตรวจตัวเลขอีกครั้ง');
      const recSat = Math.round(rec * 100), totalSat = Math.round(total * 100);
      if (recSat < totalSat) fail(`รับเงินสดไม่พอ (รับ ฿${rec} · ยอด ฿${total})`);
      cashReceived = recSat / 100;
      cashChange = (recSat - totalSat) / 100;
    }

    const customerSelect = this.requireEl('cart-customer-select', 'ช่องเลือกลูกค้า');
    const selectedCustId = customerSelect.value;
    
    let customerName = 'ลูกค้าทั่วไป (Walk-in)';
    let updatedCustomer = null;
    let customerBeforeCheckout = null;
    let customerIdForBill = null;
    if (selectedCustId === 'google') {
      customerName = 'ลูกค้าทั่วไป (Google)';
    } else if (selectedCustId === 'returning') {
      customerName = 'ลูกค้าเก่า';
    } else if (selectedCustId) {
      const customer = this.state.customers.find(c => c.id === selectedCustId);
      if (customer) {
        customerName = customer.name;
        customerIdForBill = customer.id;
        updatedCustomer = customer;
        customerBeforeCheckout = {
          visitCount: customer.visitCount,
          tier: customer.tier
        };
        customer.visitCount = (Number(customer.visitCount) || 0) + 1; // เพิ่มประวัติการเข้าใช้งาน
        // อัปเกรดระดับสมาชิกอัตโนมัติ
        if (customer.visitCount >= 10) {
          customer.tier = 'แพลทินัม (Platinum)';
        } else if (customer.visitCount >= 5) {
          customer.tier = 'ทอง (Gold)';
        }
      }
    }

    const billTime = Date.now();
    const txId = `TX-${billTime}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // 1. สร้างประวัติธุรกรรมเก็บไว้
    const transaction = {
      id: txId,
      date: billTime,
      customerName: customerName,
      customerId: customerIdForBill,
      services: cart.map(item => item.name),
      details: (() => {
        // กระจายส่วนลดตามสัดส่วน + เกลี่ยเศษสตางค์ให้ผลรวม netPrice = total เป๊ะ
        const netPrices = this.distributeDiscount(cart.map(i => i.price), subtotal, discount);
        return cart.map((item, i) => {
        const netPrice = netPrices[i];
        const isVatable = this.isVatableCategory(item.category);
        const commType = item.commissionType || 'percent';
        const commVal = item.commission || 0;
        // ค่าคอมแบบ % คิดบน netPrice แล้วปัดเป็นบาทเต็ม (กติกาตัวเลข); แบบ fixed เป็นจำนวนคงที่ไม่ขึ้นกับส่วนลด
        const commissionAmount = commissionAmountFor(netPrice, commType, commVal);
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
      paymentMethod: method,
      // เงินที่รับจริง ณ ตอนขาย (ข้อ 16) — บันทึกครั้งเดียว ห้ามเปลี่ยนตามการแก้บิลภายหลัง
      // ยอด/ช่องทางของบิลแก้ได้ แต่เงินที่เข้าลิ้นชักไปแล้วไม่ได้เปลี่ยนตาม — ส่วนต่างต้องมีคนบันทึกเอง
      tender: { method, amount: total, received: cashReceived, change: cashChange, at: billTime, shiftStart: Number(shift.startTime) },
      staffNames: [...new Set(cart.map(item => item.staffName))],
      soldBy: this.currentUser ? this.currentUser.name : '',
      // รุ่นของบิล — ชีตใช้ปฏิเสธคำขอเก่าที่มาถึงทีหลัง (ดู syncSingleTransaction)
      rev: 1,
      checkoutAttemptId: attempt.id,
      syncStatus: 'pending' // สถานะเริ่มต้นของการซิงก์ออนไลน์
    };

    this.state.transactions.push(transaction);

    // 2. สร้างคิวงานของวันนี้ส่งไปที่รอให้บริการ
    const newQueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      customerName: customerName,
      services: cart.map(item => ({
        name: item.name,
        price: item.price,
        staffId: item.staffId,
        staffName: item.staffName
      })),
      status: 'waiting', // คิวงานเริ่มต้นด้วยสถานะรอเรียก (Waiting)
      startTime: null,
      totalDuration: cart.reduce((sum, item) => sum + (Number(item.duration) || 0), 0),
      totalAmount: total,
      txId: txId   // ผูกคิวกับบิล — ยกเลิกบิลแล้วต้องเอาคิวที่ยังไม่เสร็จออกด้วย (ข้อ 11)
    };

    this.state.queue.push(newQueueItem);

    // สำรองขึ้น Drive ระหว่างกะ (ข้อ 4) — คิวลงพร้อมบิลใน save เดียวกัน · บันทึกไม่สำเร็จ = เอาออกด้วย
    const midBackupJob = this.planMidShiftBackup(txId);

    // ต้องบันทึกยอดขาย/คิว/จำนวนครั้งลูกค้าในเครื่องให้สำเร็จก่อน
    // ถ้า IndexedDB มีปัญหา ห้ามแสดงใบเสร็จหรือส่งขึ้นคลาวด์ เพราะผู้ใช้จะเข้าใจว่าบิลถูกเก็บแล้ว
    try {
      await this.saveStateOrThrow('รายการขาย');
    } catch (saveErr) {
      this.state.transactions = this.state.transactions.filter(tx => tx.id !== txId);
      this.state.queue = this.state.queue.filter(item => item.id !== newQueueItem.id);
      if (midBackupJob && Array.isArray(this.state.cloudOutbox)) {
        this.state.cloudOutbox = this.state.cloudOutbox.filter(it => it !== midBackupJob);
      }
      if (updatedCustomer && customerBeforeCheckout) {
        updatedCustomer.visitCount = customerBeforeCheckout.visitCount;
        updatedCustomer.tier = customerBeforeCheckout.tier;
      }
      this.clearDateKeyCache();
      throw saveErr;
    }
    // รอบชำระเงินนี้ใช้ไปแล้ว — กดยืนยันซ้ำต้องไม่ได้บิลที่สอง
    this._checkoutAttempt = null;

    // เรียกซิงก์ข้อมูลอัตโนมัติขึ้น Google Sheets (แบบเบื้องหลังไม่กวนใจผู้ใช้)
    this.syncPendingTransactions(true);
    if (midBackupJob) this.flushCloudOutbox();   // สำรองระหว่างกะ — เบื้องหลัง ไม่ขึ้นข้อความรบกวน

    // ── ถึงตรงนี้ "บิลลงเครื่องแล้ว" — ส่วนที่เหลือเป็นงานหน้าจอล้วน (รอบตรวจ 5 ข้อ 6) ──────────────
    // ⚠️ เดิมอยู่ใน try เดียวกับการบันทึก: วาดหน้าจอพังตรงไหนก็ตาม พนักงานเห็น "❌ การชำระเงินล้มเหลว"
    //    ทั้งที่บิลบันทึกแล้ว → เก็บเงินลูกค้าซ้ำ = บิลซ้ำ · ตอนนี้แยกออกมา พังแล้วบอกตามจริงว่าบิลบันทึกแล้ว
    try {
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
    } catch (uiErr) {
      console.error('[Checkout] บันทึกบิลแล้ว แต่หน้าจอแสดงผลไม่ครบ', uiErr);
      // ตะกร้าต้องว่างเสมอหลังบิลลงเครื่อง — ไม่งั้นเปิดหน้าชำระเงินใหม่ได้รอบชำระเงินใหม่ = บิลที่สองของของชุดเดิม
      if (Array.isArray(this.state.cart) && this.state.cart.length) this.state.cart = [];
      try { this.closeModal('modal-payment'); } catch (e) { /* หน้าจอพังอยู่แล้ว */ }
      this.showToast(`บันทึกบิล ${txId} แล้ว (ยอด ฿${Number(total).toLocaleString('th-TH')}) แต่หน้าจอแสดงผลไม่ครบ — ` +
        'ห้ามเก็บเงินลูกค้าซ้ำ · ดูบิล/พิมพ์ใบเสร็จได้ที่หน้ารายงาน', 'warning', 15000);
    }
    return true;
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
    // บิลเก่าที่ไม่มีรายการย่อย: ยอดรวมค่าบริการใช้กติกาเดียวกับรายงาน (ไม่มี subtotal = ใช้ total)
    // และเกลี่ยราคาต่อรายการเป็นสตางค์ให้รวมกันได้ยอดพอดี — เดิมปัดเป็นบาทต่อรายการ (100/3 → 33×3 = 99)
    // และบิลที่มีแต่ total พิมพ์ราคาต่อรายการ 0 กับรวมค่าบริการ 0 แต่ยอดสุทธิ 500
    const hasDetails = Array.isArray(tx.details) && tx.details.length > 0;
    const legacySub = hasDetails ? null : this.legacySubtotalOf(tx);
    const receiptSubtotal = hasDetails ? (Number(tx.subtotal) || 0) : (legacySub === null ? (Number(tx.subtotal) || 0) : legacySub);
    let legacyLines = [];
    if (!hasDetails) {
      const names = Array.isArray(tx.services) ? tx.services : [];
      const shares = this.allocateSatang(Math.round(receiptSubtotal * 100), names.map(() => 1));
      legacyLines = names.map((name, i) => ({
        name,
        price: shares[i] / 100,
        staffName: Array.isArray(tx.staffNames) ? (tx.staffNames[i] || tx.staffNames[0]) : 'ไม่ระบุ'
      }));
    }
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
    
    // ── เงินที่รับจริง (ข้อ 16) ─────────────────────────────────────────────
    // เงินรับมา/เงินทอน เป็นของ "ตอนชำระ" เสมอ — บิลที่ถูกแก้ยอด/ช่องทางทีหลังต้องไม่โชว์เหมือนรับ/ทอนตามยอดใหม่
    // ส่วนต่างหลังแก้บิลแสดงตามที่บันทึกจริงเท่านั้น (คืน/เก็บเพิ่ม/แก้บันทึก/ไม่ได้คืน) หรือบอกว่ายังค้าง
    const payLabelR = m => m === 'promptpay' ? 'Scan (QR)' : m === 'credit' ? 'Credit Card' : 'เงินสด';
    const rrow = (a, b, style) => `<div class="receipt-row"${style ? ` style="${style}"` : ''}><span>${a}</span><span>${b}</span></div>`;
    const tnd = this.tenderOf(tx);
    const hasMoneyRecord = (tx.tender !== undefined && tx.tender !== null) || (tx.settlements !== undefined && tx.settlements !== null);
    const mst = hasMoneyRecord ? this.billMoneyStatus(tx) : null;
    const tenderDiffers = !!(mst && tnd.valid && (tnd.method !== this.paymentMethodOf(tx) ||
      Math.round(tnd.amount * 100) !== Math.round((Number(tx.total) || 0) * 100)));
    let payBlock = '';
    if (tenderDiffers) payBlock += rrow('ชำระตอนขาย:', `${payLabelR(tnd.method)} ฿${money(tnd.amount)}`);
    if (tnd.valid && tnd.method === 'cash' && tnd.received !== null) {
      payBlock += rrow(tenderDiffers ? 'เงินรับมา (ตอนขาย):' : 'เงินรับมา:', `฿${money(tnd.received)}`);
      payBlock += rrow(tenderDiffers ? 'เงินทอน (ตอนขาย):' : 'เงินทอน:', `฿${money(tnd.change)}`);
    }
    if (mst) {
      mst.settlements.forEach(x => {
        const a = Number(x.amount) || 0;
        if (x.kind === 'waive') {
          payBlock += rrow(a < 0 ? 'ส่วนต่างที่ไม่ได้คืน:' : 'ส่วนต่างที่ไม่ได้เก็บเพิ่ม:', `฿${money(Math.abs(a))}`);
        } else {
          const label = x.kind === 'refund' ? 'คืนเงิน' : x.kind === 'collect' ? 'รับเงินเพิ่ม' : 'แก้บันทึกรับเงิน';
          payBlock += rrow(`${label} (${payLabelR(x.method)}):`, `${a < 0 ? '-' : '+'}฿${money(Math.abs(a))}`);
        }
      });
      if (mst.invalid) payBlock += rrow('หมายเหตุ:', 'ข้อมูลรับเงินของบิลนี้ต้องตรวจสอบ', 'font-size:0.7rem;');
      else if (!mst.settled) payBlock += rrow('ส่วนต่างที่ยังไม่ได้คืน/เก็บ:', escapeHtml(this.describeMoneyDiffs(mst.diffs)), 'font-size:0.7rem;');
    } else if (tnd.valid && tnd.method === 'cash' && tnd.received !== null && tnd.change !== null &&
               Math.round((tnd.received - tnd.change) * 100) !== Math.round(tnd.amount * 100)) {
      // บิลที่ถูกแก้ยอดด้วยระบบรุ่นก่อน: เงินรับ−ทอนไม่เท่ายอดบิล และไม่มีบันทึกว่าคืน/เก็บส่วนต่าง — บอกตามจริง ไม่เดา
      payBlock += rrow('หมายเหตุ:', 'ยอดบิลถูกแก้หลังรับเงิน (ไม่มีบันทึกคืน/เก็บส่วนต่าง)', 'font-size:0.7rem;');
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
          ${(tx.details && tx.details.length > 0 ? tx.details : legacyLines).map(item => `
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
          <span>฿${(receiptSubtotal || 0).toLocaleString('th-TH')}</span>
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
          <span>${payLabelR(this.paymentMethodOf(tx))}</span>
        </div>
        ${payBlock}

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
    if (!this.authorize('queue.update', 'จัดการคิว')) return;
    return this.withMutation('การเริ่มคิว', async () => {
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
    });
  }
  // ยกเลิกคิวงาน
  removeQueue(queueId) {
    if (!this.authorize('queue.update', 'ยกเลิกคิว')) return;
    this.showConfirm('คุณต้องการยกเลิกคิวงานนี้ใช่หรือไม่?', () => this.withMutation('การยกเลิกคิว', async () => {
      if (!this.authorize('queue.update', 'ยกเลิกคิว')) return;
      const prevQueue = this.state.queue;
      this.state.queue = this.state.queue.filter(q => q.id !== queueId);
      if (!await this.persistOrRollback('การยกเลิกคิว', () => { this.state.queue = prevQueue; })) {
        this.renderQueueScreen(); return;
      }
      this.renderQueueScreen();
      this.renderDashboard();
    }));
  }
  // ทำคิวนี้เสร็จสิ้น
  async completeQueue(queueId) {
    if (!this.authorize('queue.update', 'ปิดคิว')) return;
    return this.withMutation('การปิดคิว', async () => {
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
    });
  }
  // ==================== CLIENT / STAFF / SERVICE ADDERS ====================

  async addCustomer() {
    if (!this.authorize('customer.write', 'เพิ่มลูกค้า')) return;
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
    const note = noteInput.value.trim() || 'ไม่มี';

    return this.withMutation('ข้อมูลลูกค้า', async () => {
      // ── Duplicate check (ในคิว — กันกดเพิ่มซ้อนกันแล้วได้เบอร์ซ้ำสองแถว) ──
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
        note: note
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
      const sel = document.getElementById('cart-customer-select');
      if (sel) sel.value = newCustomer.id;
    });
  }
  editCustomerNote(custId) {
    if (!this.authorize('customer.write', 'แก้โน้ตลูกค้า')) return;
    const customer = this.state.customers.find(c => c.id === custId);
    if (customer) {
      this.showPromptModal(`แก้ไขข้อมูลบันทึกพิเศษสำหรับคุณ ${customer.name}:`, customer.note, (newNote) => {
        if (newNote === null) return;
        return this.withMutation('โน้ตลูกค้า', async () => {
          if (!this.authorize('customer.write', 'แก้โน้ตลูกค้า')) return;
          // หาใหม่ในคิว — ข้อมูลอาจถูกแทนทั้งชุด (กู้ข้อมูล) ระหว่างที่หน้าต่างพิมพ์ค้างอยู่
          const cur = this.state.customers.find(c => c.id === custId);
          if (!cur) { this.showToast('ไม่พบลูกค้ารายนี้แล้ว', 'warning'); return; }
          const prevNote = cur.note;
          cur.note = newNote;
          if (!await this.persistOrRollback('โน้ตลูกค้า', () => { cur.note = prevNote; })) {
            this.renderCustomerTable(); return;
          }
          this.renderCustomerTable();
        });
      });
    }
  }
  deleteCustomer(custId) {
    if (!this.authorize('customer.write', 'ลบลูกค้า')) return;
    this.showConfirm('คุณต้องการลบรายชื่อลูกค้านี้ใช่หรือไม่? (ประวัติการสะสมยอดจะไม่ย้อนกลับ)', () => this.withMutation('การลบลูกค้า', async () => {
      if (!this.authorize('customer.write', 'ลบลูกค้า')) return;
      const prevCustomers = this.state.customers;
      this.state.customers = this.state.customers.filter(c => c.id !== custId);
      if (!await this.persistOrRollback('การลบลูกค้า', () => { this.state.customers = prevCustomers; })) {
        this.renderCustomerTable(); this.renderPos(); return;
      }
      this.renderCustomerTable();
      this.renderPos();
    }));
  }
  async addStaff() {
    if (!this.authorize('settings.write', 'จัดการพนักงาน')) return;
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
    // ตำแหน่งต้องเป็นค่าที่ระบบรู้จักเท่านั้น — ค่าอื่นจะไปหลุดด่านสิทธิ์ที่เขียนแบบ allowlist
    if (!['owner', 'manager', 'staff'].includes(accessLevel)) {
      this.showToast('ระดับสิทธิ์ไม่ถูกต้อง', 'warning');
      return;
    }
    const pinRaw = pinInput ? pinInput.value.trim() : '';
    const privileged = PRIVILEGED_LEVELS.includes(accessLevel);
    const editingId = this.state.editingStaffId;
    const existing = editingId ? (this.state.staff || []).find(s => s.id === editingId) : null;
    let pinHash = null;
    if (pinRaw) {
      // ข้อ 7: สิทธิ์เจ้าของ/ผู้จัดการ = 6 หลักเท่านั้น (เดิม 4 หลักได้ → เดาครบทุกค่าได้ในไม่กี่ชั่วโมง)
      if (privileged ? !STRONG_PIN_RE.test(pinRaw) : !/^[0-9]{4,6}$/.test(pinRaw)) {
        this.showToast(privileged ? 'บัญชีสิทธิ์เจ้าของ/ผู้จัดการต้องใช้ PIN ตัวเลข 6 หลัก' : 'PIN ต้องเป็นตัวเลข 4-6 หลัก', 'warning');
        if (pinInput) pinInput.focus();
        return;
      }
      if (privileged && pinRaw === DEFAULT_OWNER_PIN) {
        this.showToast('ห้ามใช้ 123456 เป็น PIN — ใครก็รู้', 'warning');
        if (pinInput) pinInput.focus();
        return;
      }
      pinHash = await this.hashPin(pinRaw);
    } else if (privileged && existing && existing.pin && !PRIVILEGED_LEVELS.includes(existing.accessLevel)) {
      // เลื่อนพนักงานขึ้นเป็นเจ้าของ/ผู้จัดการ — PIN เดิมอาจสั้น ต้องตั้ง 6 หลักใหม่ตอนนี้เลย
      this.showToast('เลื่อนเป็นสิทธิ์เจ้าของ/ผู้จัดการ ต้องตั้ง PIN ใหม่ 6 หลักด้วย', 'warning', 6000);
      if (pinInput) pinInput.focus();
      return;
    }
    const roleText = roleSelect.value;

    return this.withMutation('ข้อมูลพนักงาน', async () => {
      // สแนปช็อตทั้งชุด — การแก้พนักงานแตะทั้งชื่อ บทบาท สิทธิ์ และ PIN พร้อมกัน
      const prevStaff = this.cloneForRollback(this.state.staff);
      if (editingId) {
        const staffMember = this.state.staff.find(s => s.id === editingId);
        if (staffMember) {
          staffMember.name = name;
          staffMember.role = roleText;
          staffMember.accessLevel = accessLevel;
          if (pinRaw) staffMember.pin = pinHash; // เปลี่ยน PIN เฉพาะเมื่อกรอกใหม่
        }
        // ห้ามล้างตรงนี้ — ถ้า save ล้มเหลวแล้วผู้ใช้กดซ้ำ จะกลายเป็นเพิ่มพนักงานใหม่แทนการแก้
      } else {
        // ใช้ ID แบบไม่ซ้ำถาวร (กันการนำ ID เก่ากลับมาใช้หลังลบพนักงาน)
        const newStaff = {
          id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name: name,
          role: roleText,
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
    });
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
    if (!this.authorize('settings.write', 'ลบพนักงาน')) return;
    if (this.state.staff.length <= 1) {
      this.showToast('ไม่สามารถลบพนักงานทั้งหมดได้ ต้องมีพนักงานอย่างน้อย 1 คนในระบบเพื่อให้บริการ', 'info');
      return;
    }
    this.showConfirm('ยืนยันลบพนักงานคนนี้ออกจากระบบใช่หรือไม่?', () => this.withMutation('การลบพนักงาน', async () => {
      if (!this.authorize('settings.write', 'ลบพนักงาน')) return;
      if (this.state.staff.length <= 1) {
        this.showToast('ต้องมีพนักงานอย่างน้อย 1 คนในระบบ', 'info'); return;
      }
      const prevStaffList = this.state.staff;
      this.state.staff = this.state.staff.filter(s => s.id !== staffId);
      if (!await this.persistOrRollback('การลบพนักงาน', () => { this.state.staff = prevStaffList; })) {
        this.renderSettingsLists(); this.renderPos(); return;
      }
      this.renderSettingsLists();
      this.renderPos();
      this.renderCart();   // รายการในตะกร้าที่ผูกคนนี้ต้องขึ้น "เลือกผู้ให้บริการใหม่" ทันที
    }));
  }
  async addService() {
    if (!this.authorize('settings.write', 'จัดการบริการ')) return;
    const nameInput           = document.getElementById('serv-name');
    const priceInput          = document.getElementById('serv-price');
    const durationInput       = document.getElementById('serv-duration');
    const catSelect           = document.getElementById('serv-category');
    const commissionInput     = document.getElementById('serv-commission');
    const commissionTypeSelect= document.getElementById('serv-commission-type');

    // ── Validation ──────────────────────────────
    const svcName = nameInput.value.trim();
    // กติกาตัวเลข: ราคา · ระยะเวลา · ค่าคอม ต้องเป็นจำนวนเต็ม (ไม่มีทศนิยม)
    const price   = parseWholeNumberInput(priceInput.value);
    const dur     = parseWholeNumberInput(durationInput.value);

    if (!svcName) { this.showToast('กรุณากรอกชื่อบริการ','warning'); nameInput.focus(); return; }
    if (price === null || price <= 0) { this.showToast('ราคาต้องเป็นจำนวนเต็มบาทมากกว่า 0 (ไม่มีทศนิยม)','warning'); priceInput.focus(); return; }
    // ระยะเวลา 0 = สินค้าที่ขายทันที (เครื่องดื่ม/ของทานเล่น) ไม่ใช่บริการที่ต้องจับเวลา
    // เดิมบังคับ > 0 ทำให้เพิ่มเครื่องดื่มเข้าระบบไม่ได้เลย ต้องใส่เวลาปลอมซึ่งไปโผล่ในหน้าคิวงาน
    if (dur === null)      { this.showToast('ระยะเวลาต้องเป็นจำนวนเต็มนาที ไม่ติดลบ (ใส่ 0 ได้ถ้าเป็นสินค้าขายทันที)','warning'); durationInput.focus(); return; }
    // ค่าคอมแบบ % ต้องอยู่ใน 0–100 — เกิน 100% = จ่ายคอมมากกว่ายอดขาย และบิลที่ขายไปจะแก้ส่วนลดย้อนหลังไม่ได้
    // (ตัวแก้บิลถือว่าอัตราเกิน 100% คือ "ไม่ทราบอัตรา" — ดู lineCommissionRule)
    const commRaw = parseWholeNumberInput(commissionInput.value);
    if (commRaw === null) { this.showToast('ค่าคอมมิชชั่นต้องเป็นจำนวนเต็ม ไม่ติดลบ (ไม่มีทศนิยม)','warning'); commissionInput.focus(); return; }
    if (commissionTypeSelect.value !== 'fixed' && commRaw > 100) { this.showToast('ค่าคอมแบบเปอร์เซ็นต์ต้องไม่เกิน 100%','warning'); commissionInput.focus(); return; }

    const fields = {
      name: svcName,
      price: price,
      duration: dur,
      category: catSelect.value,
      commission: commRaw,
      commissionType: commissionTypeSelect.value
    };
    const editingId = this.state.editingServiceId;

    return this.withMutation('ข้อมูลบริการ', async () => {
      const prevServices = this.cloneForRollback(this.state.services);
      if (editingId) {
        const service = this.state.services.find(s => s.id === editingId);
        if (service) {
          Object.assign(service, fields);
          // เจ้าของแก้ราคาแล้ว = ราคาที่เคยเสียจากไฟล์นำเข้าได้รับการตรวจแล้ว ขายได้อีกครั้ง
          delete service.priceInvalid;
        }
        // ห้ามล้างตรงนี้ (เหตุผลเดียวกับพนักงาน) — กดซ้ำหลัง save ล้มเหลวจะได้บริการซ้ำ
      } else {
        // ใช้ ID แบบไม่ซ้ำถาวร (กันการนำ ID เก่ากลับมาใช้หลังลบบริการ)
        const newService = Object.assign({ id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 6)}` }, fields);
        this.state.services.push(newService);
      }

      if (!await this.persistOrRollback('ข้อมูลบริการ', () => { this.state.services = prevServices; })) {
        this.renderSettingsLists(); this.renderPos(); return;   // คง editingServiceId ไว้ให้กดซ้ำได้
      }
      this.state.editingServiceId = null;   // ล้างเมื่อบันทึกลงเครื่องสำเร็จแล้วเท่านั้น
      this.closeModal('modal-service');
      this.renderSettingsLists();
      this.renderPos();
    });
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
    if (!this.authorize('settings.write', 'ลบบริการ')) return;
    this.showConfirm('ยืนยันการลบบริการนี้ออกจากระบบใช่หรือไม่?', () => this.withMutation('การลบบริการ', async () => {
      if (!this.authorize('settings.write', 'ลบบริการ')) return;
      const prevSvcList = this.state.services;
      this.state.services = this.state.services.filter(s => s.id !== serviceId);
      if (!await this.persistOrRollback('การลบบริการ', () => { this.state.services = prevSvcList; })) {
        this.renderSettingsLists(); this.renderPos(); return;
      }
      this.renderSettingsLists();
      this.renderPos();
    }));
  }
  // ==================== MODALS HELPERS ====================

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
    if (modalId === 'modal-prompt') this._promptPending = false;
    // ปิดหน้าต่างยืนยันจากทางอื่น (เช่นถูกออกจากระบบ) = ยกเลิก — คนที่ await คำตอบจะได้ไม่ค้าง
    if (modalId === 'modal-confirm' && this._confirmCancel) {
      const c = this._confirmCancel; this._confirmCancel = null;
      try { c(); } catch (e) { console.warn('confirm cancel failed', e); }
    }
    // ปิดหน้าต่างถามค่าโดยไม่กดตกลง = ยกเลิก (แจ้งคนที่รอคำตอบอยู่)
    if (modalId === 'modal-prompt' && this._promptCancel) {
      const c = this._promptCancel; this._promptCancel = null;
      try { c(); } catch (e) { console.warn('prompt cancel failed', e); }
    }
    // ปิดหน้าต่างแก้ไขบิลเมื่อไหร่ = ทิ้งร่างที่ยังไม่ได้กดบันทึกทันที
    // (กดกากบาท/กดยกเลิก/void ก็ผ่านทางนี้ทั้งหมด)
    if (modalId === 'modal-edit-transaction') this._editTxDraft = null;
  }

  // ==================== GOOGLE SHEETS SYNC ====================

  // ─── รวมค่าใช้จ่ายของงวดหนึ่ง (วันทำการ หรือเดือนทำการ) ───────────────────
  // ⚠️ ยึด "เวลาที่จ่ายเงินออกจากลิ้นชักจริง" ของแต่ละรายการ — เกณฑ์เดียวกับบิลขายเป๊ะ ๆ
  //
  // เดิมยึด "เวลาปิดกะ" แล้วเหมาค่าใช้จ่ายทั้งกะไปเป็นของวันนั้นทั้งก้อน
  // กะปกติ 10:00 → ตี 3 ไม่มีปัญหาเพราะวันทำการเดียวกันหมด
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
    history.forEach(sh => take(sh.expenses, this.shiftAnchorTime(sh)));

    // ต้องรวมกะที่ยังเปิดอยู่ด้วย ไม่งั้นสรุปที่ส่งกลางกะ (กดส่งเอง / refresh หลัง void หรือแก้บิล)
    // จะโชว์กำไรสูงเกินจริงจนกว่าจะปิดกะ
    if (this.state.shift && this.state.shift.active) {
      take(this.state.shift.expenses, this.shiftAnchorTime(this.state.shift));
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
  // ทำไมไม่ใช้เวลาปิด: ร้านเปิด 10:00 ปิดตี 3 ปกติแล้วได้วันเดียวกันทั้งคู่
  // แต่คืนไหนปิดช้าเลย 06:00 (เวลาตัดวัน) เวลาปิดจะข้ามไปเป็นวันถัดไป
  // แถวกะเลยไปโผล่ในสรุปวันที่ไม่มีบิลขายสักใบ ส่วนวันที่ขายจริงกลับไม่มีแถวกะ
  // คืนสิ้นเดือนที่ปิดสายยิ่งหนัก — กะกระโดดข้ามไปอยู่สรุปเดือนถัดไปทั้งที่ยอดขายอยู่เดือนเดิม
  // เวลาเปิดร้านอยู่ช่วง 10:00 เสมอ จึงไม่มีทางคาบเกี่ยวเวลาตัดวัน = จัดกลุ่มได้นิ่งกว่า
  //
  // ใช้เกณฑ์นี้แล้วทั้ง 3 บล็อกในสรุปวัน (บิลขาย / ค่าใช้จ่าย / ตารางนับเงิน) ตรงกันหมด
  // กะที่ยังเปิดอยู่ไม่นับ — ยังไม่มีการนับเงินปิดกะ จึงยังไม่มีตัวเลขขาด/เกิน
  getClosedShiftsForPeriod(periodType, periodKey) {
    const history = (this.state.shift && Array.isArray(this.state.shift.history)) ? this.state.shift.history : [];
    return history.filter(sh => {
      const ts = this.shiftAnchorTime(sh);   // กะเปิดหลังร้านปิด (03:00–06:00) = วันใหม่
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
      // ข้อ 16: เงินคืน/เก็บเพิ่มจากบิลที่ถูกแก้ ที่เกิดจริงในกะนี้ (ช่องเพิ่มใหม่ — Apps Script รุ่นเก่าไม่อ่าน ไม่เสียหาย)
      cashAdjust: num(sh.cashAdjustTotal),
      // ค่าใช้จ่ายในตารางนับเงิน = เฉพาะที่จ่ายจากลิ้นชัก (กะที่ปิดก่อนมีช่อง "จ่ายจาก" = ทุกรายการจ่ายจากลิ้นชัก)
      expenses:   (typeof sh.drawerExpensesTotal === 'number' && isFinite(sh.drawerExpensesTotal)) ? sh.drawerExpensesTotal : num(sh.expensesTotal),
      expensesOther: num(sh.otherExpensesTotal),   // จ่ายทางอื่น — ไม่กระทบลิ้นชัก (Apps Script รุ่นเก่าไม่อ่าน ไม่เสียหาย)
      overspend:  num(sh.overspend),               // ค่าใช้จ่ายเกินเงินในลิ้นชัก — รวมอยู่ในผลต่างแล้ว
      // กะเก่าที่บันทึกก่อนมีฟิลด์ expectedCash — คำนวณย้อนให้ ไม่ปล่อยเป็น 0 จนดูเหมือนเงินหายทั้งกะ
      expected:   (typeof sh.expectedCash === 'number' && isFinite(sh.expectedCash))
                    ? sh.expectedCash
                    : num(sh.startCash) + num(sh.cashSales) + num(sh.cashAdjustTotal) - num(sh.expensesTotal),
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
      if (c) return c.name;
      // หมวดที่ไม่มีในระบบแล้ว (ข้อมูลเก่าก่อนมีการกันลบ) — ห้ามส่งรหัสภายในไปโผล่ในชีตภาษี
      return (id === 'ไม่ระบุหมวด') ? id : 'หมวดที่ถูกลบแล้ว';
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

  // ── ช่องทางจ่ายตามกติกาบิลรุ่นเก่า: ไม่มีช่องทาง = เงินสด (ตรงกับ isKnownPayment_/payLabel ฝั่ง Apps Script) ──
  // ⚠️ เดิมสรุปนับเฉพาะ === 'cash' บิลรุ่นเก่าที่ไม่มีช่องทางจึงอยู่ในรายได้รวมแต่ไม่อยู่ในช่องทางไหนเลย
  //    เงินสด + โอน + บัตร จึงไม่เท่ารายได้รวม (และลิ้นชักขาดยอดของบิลพวกนั้น)
  paymentMethodOf(tx) {
    const pm = tx && tx.paymentMethod;
    return (pm === undefined || pm === null || pm === '') ? 'cash' : pm;
  }


  // ═══ เงินที่รับจริงของบิล กับส่วนต่างหลังแก้บิล (ข้อ 16) ══════════════════════════
  // tender      = เงินที่รับจริงตอนขาย (ช่องทาง + ยอด + รับมา/ทอน) — ไม่เปลี่ยนตามการแก้บิล
  // settlements = ส่วนต่างที่ "มีคนยืนยันแล้ว" ว่าเกิดอะไรขึ้นจริง (ดู recordBillSettlement)
  // ยอดบิลปัจจุบัน (total + paymentMethod) = สิ่งที่บิลบอกว่าลูกค้าจ่าย
  // ⚠️ ระบบไม่เคยถือเองว่ามีการคืน/เก็บเงิน — ส่วนต่างค้างอยู่จนกว่าคนจะบันทึก
  //
  // บิลที่ไม่มี tender = ยังไม่เคยถูกแก้ยอด/ช่องทางหลังอัปเกรด → ยอดและช่องทางของบิลคือเงินที่รับจริง
  // (กติกาเดิมของระบบ — การนับลิ้นชักรุ่นก่อนก็ใช้ยอดบิลแบบนี้ จึงไม่ตีความประวัติเก่าใหม่)
  tenderOf(tx) {
    const bad = (explicit) => ({ valid: false, explicit, method: null, amount: null });
    if (!tx || typeof tx !== 'object') return bad(false);
    if (tx.tender !== undefined && tx.tender !== null) {
      const t = tx.tender;
      if (typeof t !== 'object' || Array.isArray(t) || !PAYMENT_METHODS.includes(t.method)) return bad(true);
      const amt = this.toFiniteNumber(t.amount);
      if (amt === null || amt < 0) return bad(true);
      return { valid: true, explicit: true, method: t.method, amount: amt,
        received: this.toFiniteNumber(t.received), change: this.toFiniteNumber(t.change),
        at: t.at, shiftStart: t.shiftStart, inferred: !!t.inferred };
    }
    const amt = this.toFiniteNumber(tx.total);
    const method = this.paymentMethodOf(tx);
    if (amt === null || amt < 0 || !PAYMENT_METHODS.includes(method)) return bad(false);
    return { valid: true, explicit: false, method, amount: amt,
      received: this.toFiniteNumber(tx.cashReceived), change: this.toFiniteNumber(tx.cashChange), at: tx.date };
  }

  // สถานะเงินของบิล: "บิลบอกว่าควรได้" เทียบ "รับตอนขาย + ส่วนต่างที่บันทึกแล้ว" แยกตามช่องทาง
  // diffs[].amount > 0 = ลูกค้าต้องจ่ายเพิ่ม (ร้านยังไม่ได้รับ) · < 0 = ร้านถือเงินเกินบิล (ต้องคืน หรือยืนยันว่าไม่คืน)
  // invalid = ข้อมูลรับเงิน/ส่วนต่างของบิลเสีย → ห้ามคิดต่อเอง ต้องให้คนตรวจ
  billMoneyStatus(tx) {
    const sat = v => Math.round(v * 100);
    const tender = this.tenderOf(tx);
    const out = { tender, settlements: [], invalid: false, diffs: [], settled: false };
    if (!tender.valid) { out.invalid = true; return out; }
    const acc = { cash: 0, promptpay: 0, credit: 0 };
    acc[tender.method] += sat(tender.amount);
    const list = tx.settlements;
    if (list !== undefined && list !== null && !Array.isArray(list)) { out.invalid = true; return out; }
    (list || []).forEach(s => {
      const amt = (s && typeof s === 'object') ? this.toFiniteNumber(s.amount) : null;
      if (amt === null || !PAYMENT_METHODS.includes(s.method) || !SETTLEMENT_KINDS.includes(s.kind)) { out.invalid = true; return; }
      acc[s.method] += sat(amt);
      out.settlements.push(s);
    });
    const dueMethod = this.paymentMethodOf(tx);
    const total = this.toFiniteNumber(tx.total);
    if (!PAYMENT_METHODS.includes(dueMethod) || total === null || total < 0) { out.invalid = true; return out; }
    if (out.invalid) return out;
    const due = { cash: 0, promptpay: 0, credit: 0 };
    due[dueMethod] = sat(total);
    PAYMENT_METHODS.forEach(m => { const d = due[m] - acc[m]; if (d !== 0) out.diffs.push({ method: m, amount: d / 100 }); });
    out.settled = out.diffs.length === 0;
    return out;
  }

  // บิลที่ยังมีส่วนต่างรอบันทึก (หรือข้อมูลรับเงินเสีย) — ดูเฉพาะบิลที่เคยถูกแก้ยอด/ช่องทางหลังรับเงิน
  listUnsettledBills() {
    const out = [];
    (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
      if (!tx || typeof tx !== 'object') return;
      if ((tx.tender === undefined || tx.tender === null) && (tx.settlements === undefined || tx.settlements === null)) return;
      const st = this.billMoneyStatus(tx);
      if (st.settled) return;
      out.push({ billId: tx.id, date: tx.date, customer: tx.customerName || '', invalid: st.invalid, diffs: st.diffs });
    });
    return out;
  }

  describeMoneyDiffs(diffs) {
    const baht = v => '฿' + Math.abs(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (diffs || []).map(d => d.amount < 0
      ? `ร้านถือเงินเกินบิล ${baht(d.amount)} (${PAYMENT_LABELS[d.method] || d.method})`
      : `ลูกค้ายังต้องจ่ายเพิ่ม ${baht(d.amount)} (${PAYMENT_LABELS[d.method] || d.method})`).join(' · ');
  }

  // กติกาค่าคอมที่ "บิลใบนั้นล็อกไว้" ของรายการหนึ่ง — ไม่รู้ = null (ห้ามเดา ห้ามใช้อัตราปัจจุบัน) (ข้อ 17)
  // ไม่มีชนิดค่าคอม = เปอร์เซ็นต์ (ค่าตั้งต้นของตอนขายทุกรุ่นตั้งแต่ติดตั้งครั้งแรก)
  lineCommissionRule(d) {
    if (!d || typeof d !== 'object') return null;
    const type = (d.commissionType === undefined || d.commissionType === null || d.commissionType === '') ? 'percent' : d.commissionType;
    if (type !== 'percent' && type !== 'fixed') return null;
    const rate = this.toFiniteNumber(d.commission);
    if (rate === null || rate < 0 || (type === 'percent' && rate > 100)) return null;
    return { type, rate };
  }

  // ราคารวมของบิลไม่มีรายการย่อยตามกติกาบิลรุ่นเก่า (ดู validateBillRecord) — อ่านไม่ได้ = null
  legacySubtotalOf(tx) {
    const noSub = tx.subtotal === undefined || tx.subtotal === null;
    const noDisc = tx.discount === undefined || tx.discount === null;
    const v = noSub ? (noDisc ? this.toFiniteNumber(tx.total) : null) : this.toFiniteNumber(tx.subtotal);
    return (v === null || v < 0) ? null : v;
  }
  // บิลใบนี้ใช้คิดเงินได้ไหม (ผลตรวจจำไว้ต่อบิล — หน้ารายงานเรียกซ้ำหลายพันครั้ง)
  // ⚠️ จำคู่กับ "ลายนิ้วมือ" ของตัวเลขเงินในบิล: บิลที่ถูกแก้ (อ็อบเจกต์เดิม) ต้องตรวจใหม่เสมอ
  isBillUsable(tx) {
    if (!tx || typeof tx !== 'object') return false;
    if (!this._usableCache) this._usableCache = new WeakMap();
    const d = Array.isArray(tx.details) ? tx.details : null;
    const sig = [tx.id, tx.date, tx.total, tx.subtotal, tx.discount, tx.nonVatBase, tx.vatableBase, tx.vatAmount,
      tx.rounding, tx.vatRate, tx.paymentMethod, tx.rev, d ? d.length : -1,
      d ? d.map(x => x && (String(x.price) + '/' + String(x.netPrice) + '/' + String(x.vatable))).join(',') : ''].join('|');
    const hit = this._usableCache.get(tx);
    if (hit && hit.sig === sig) return hit.ok;
    const ok = !this.validateBillRecord(tx).some(p => p.fatal);
    this._usableCache.set(tx, { sig, ok });
    return ok;
  }

  // บิลที่ใช้สรุปยอดได้ (ตัวเลขเป็น number จริงทุกช่อง) + จำนวนบิลที่ถูกกันออกเพราะข้อมูลเงินเชื่อไม่ได้
  // ⚠️ สรุปบนชีตต้องไม่รวมบิลที่เชื่อไม่ได้ (ไม่งั้นชีตปฏิเสธทั้งงวด หรือแย่กว่านั้นคือรับยอดผิดไว้)
  //    ชีตจะแสดงจำนวนที่ถูกกันออกไว้ให้เห็นเสมอ ไม่ใช่หายเงียบ ๆ
  summaryBillsOf(transactions) {
    const n = (v) => { const x = this.toFiniteNumber(v); return x === null ? v : x; };
    const bills = [];
    let excluded = 0;
    (Array.isArray(transactions) ? transactions : []).forEach(tx => {
      if (!this.isBillUsable(tx)) { excluded++; return; }
      const c = Object.assign({}, tx);
      ['total', 'subtotal', 'discount', 'nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'vatRate']
        .forEach(k => { if (c[k] !== undefined && c[k] !== null) c[k] = n(c[k]); });
      if (Array.isArray(tx.details)) {
        c.details = tx.details.map(dl => Object.assign({}, dl, {
          price: n(dl.price), netPrice: (dl.netPrice === undefined || dl.netPrice === null) ? dl.netPrice : n(dl.netPrice),
          commissionAmount: (dl.commissionAmount === undefined || dl.commissionAmount === null) ? dl.commissionAmount : n(dl.commissionAmount)
        }));
      }
      bills.push(c);
    });
    return { bills, excluded };
  }

  // ── ยอดขายรายบริการ "ฐานเดียวกันทั้งแอปและชีต" (ข้อ 18) ─────────────────────────
  // รายการ = ยอดหลังหักส่วนลด "ก่อน VAT" · ผลรวมรายการ + ปัดเศษรายบรรทัด (บิลรุ่นเก่า) + VAT + เงินปัดเศษ = ยอดรับรวม
  // บิลไม่มีรายละเอียด: เกลี่ยยอดของบิลตามชื่อบริการด้วยสตางค์จำนวนเต็ม (ไม่ใช้ราคาปัจจุบัน)
  // บิลไม่มีทั้งรายละเอียดและชื่อบริการ: ลง "ไม่ระบุรายการ" — ทุกบาทของรายได้ต้องมีที่อยู่ในตาราง
  buildServiceBreakdown(bills) {
    const sat = (v) => Math.round((Number(v) || 0) * 100);
    const map = new Map();
    const add = (name, s) => {
      const key = String(name == null || name === '' ? 'ไม่ระบุรายการ' : name);
      if (!map.has(key)) map.set(key, { name: key, count: 0, sat: 0 });
      const e = map.get(key); e.count++; e.sat += s;
    };
    let netSat = 0, vatSat = 0, rndSat = 0, totalSat = 0;
    (bills || []).forEach(tx => {
      const legacy = [tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding].every(v => v === undefined || v === null);
      const billNetSat = legacy ? sat(tx.total) : sat(tx.nonVatBase) + sat(tx.vatableBase);
      netSat += billNetSat; totalSat += sat(tx.total);
      if (!legacy) { vatSat += sat(tx.vatAmount); rndSat += sat(tx.rounding); }
      if (Array.isArray(tx.details) && tx.details.length) {
        tx.details.forEach(dl => add(dl && dl.name, sat(dl && (dl.netPrice != null ? dl.netPrice : dl.price))));
      } else {
        const names = Array.isArray(tx.services) ? tx.services.filter(x => typeof x === 'string' || typeof x === 'number') : [];
        if (names.length) {
          const share = this.allocateSatang(billNetSat, names.map(() => 1));
          names.forEach((nm, i) => add(nm, share[i]));
        } else {
          add('ไม่ระบุรายการ', billNetSat);
        }
      }
    });
    const rows = [...map.values()].map(e => ({ name: e.name, count: e.count, revenue: e.sat / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
    const servicesSat = [...map.values()].reduce((a, e) => a + e.sat, 0);
    return {
      rows,
      servicesTotal: servicesSat / 100,
      residual: (netSat - servicesSat) / 100,   // เศษจากบิลรุ่นแรกที่ปัดราคาหลังส่วนลดทีละบรรทัด
      vatAmount: vatSat / 100,
      rounding: rndSat / 100,
      grandTotal: totalSat / 100
    };
  }

  // ─── สร้าง payload สรุป (ใช้ร่วมกันทั้ง daily / monthly) ───────────────
  buildSummaryPayload(transactions, expenses, periodType, periodKey) {
    // บิลที่ข้อมูลเงินเชื่อไม่ได้ ไม่เข้าสรุป (ดู summaryBillsOf) — ชีตแสดงจำนวนที่ถูกกันออกไว้
    const { bills, excluded } = this.summaryBillsOf(transactions);
    const sat = (v) => Math.round((Number(v) || 0) * 100);

    // 1. รายได้แยกช่องทาง — คิดเป็นสตางค์จำนวนเต็ม · บิลรุ่นเก่าที่ไม่มีช่องทาง = เงินสด
    let totalSat = 0, cashSat = 0, qrSat = 0, creditSat = 0;
    bills.forEach(tx => {
      const s = sat(tx.total);
      totalSat += s;
      const pm = this.paymentMethodOf(tx);
      if (pm === 'promptpay') qrSat += s; else if (pm === 'credit') creditSat += s; else cashSat += s;
    });
    const totalRevenue = totalSat / 100;
    const billCount = bills.length;
    const avgBill = billCount > 0 ? Math.round(totalSat / billCount) / 100 : 0;

    // 2. รายการบริการ — ฐานเดียวกับหน้ารายงานในแอป (ยอดหลังหักส่วนลด ก่อน VAT)
    const breakdown = this.buildServiceBreakdown(bills);

    // 3. ค่าใช้จ่าย
    // รายการที่จ่ายทางอื่นยังเป็นค่าใช้จ่ายของร้าน (นับในกำไร) — ต่อท้ายชื่อให้คนอ่านชีตรู้ว่าไม่ได้ออกจากลิ้นชัก
    const expList = (expenses || []).map(e => ({ note: this.isExpenseOutsideDrawer(e) ? `${e.note || ''} (จ่ายทางอื่น)` : e.note,
      amount: Math.round(sat(e.amount)) / 100 }));
    const totalExpenses = expList.reduce((s, e) => s + sat(e.amount), 0) / 100;
    const netIncome = (totalSat - sat(totalExpenses)) / 100;

    // 4. ค่าคอมมิชชั่นรายบุคคล
    const staffMap = {};
    this.state.staff.forEach(st => {
      staffMap[st.id] = { name: st.name, role: st.role, count: 0, salesSum: 0, commission: 0 };
    });
    bills.forEach(tx => {
      if (tx.details && Array.isArray(tx.details)) {
        tx.details.forEach(item => {
          if (!staffMap[item.staffId]) {
            staffMap[item.staffId] = { name: item.staffName || 'ไม่ระบุ', role: '-', count: 0, salesSum: 0, commission: 0 };
          }
          staffMap[item.staffId].count++;
          staffMap[item.staffId].salesSum   += sat(item.netPrice != null ? item.netPrice : item.price); // ยอดขายหลังหักส่วนลด
          staffMap[item.staffId].commission += sat(item.commissionAmount || 0);
        });
      }
    });
    const staffCommissions = Object.values(staffMap).filter(st => st.count > 0)
      .map(st => Object.assign({}, st, { salesSum: st.salesSum / 100, commission: st.commission / 100 }));

    // 5. การนับเงินสดปิดกะ — recompute จาก shift.history ทุกครั้งที่ส่ง (idempotent: ชีตเขียนทับอยู่แล้ว)
    const cash = this.buildShiftCashSummary(periodType, periodKey);

    // 6. ภาษีมูลค่าเพิ่ม — อ่านจาก "ตัวเลขที่เก็บไว้ในบิล" เท่านั้น ไม่คำนวณใหม่จากค่าตั้งค่าปัจจุบัน
    // ถ้าคำนวณใหม่ พอกดส่งสรุปเดือนเก่าซ้ำ ระบบจะยัด VAT ลงบิลที่ไม่เคยเก็บ VAT
    // แล้วยอดที่เคยยื่นสรรพากรไปแล้วจะไม่ตรงกับชีต โดยไม่มีร่องรอยว่าเปลี่ยนตอนไหน
    const vat = this.buildVatSummary(bills);

    const payload = this.buildCloudRequest(periodType === 'day' ? 'summary_day' : 'summary_month', {
      dateKey:         periodType === 'day'   ? periodKey : undefined,
      monthKey:        periodType === 'month' ? periodKey : undefined,
      totalRevenue,
      cashRevenue: cashSat / 100, qrRevenue: qrSat / 100, creditRevenue: creditSat / 100,
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
      services:         breakdown.rows,
      servicesResidual: breakdown.residual, // เศษปัดรายบรรทัดของบิลรุ่นแรก (ปกติ 0)
      excludedInvalid:  excluded,           // บิลที่ไม่ได้รวม เพราะข้อมูลเงินเชื่อไม่ได้ (รอเจ้าของตรวจ)
      expenses:         expList,
      staffCommissions,
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
      this._cloudFailReason = this.getCloudSetupMessage();
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
      if (!response.ok) { if (response.release) response.release(); throw new Error(this.explainCloudError(`HTTP ${response.status}`)); }

      const result = await response.json();
      if (result.status === 'success') {
        if (!this.primaryStatus || !this.primaryStatus.isPrimary) await this.notePrimaryStatus(true, null);
        if (!isSilent) this.showToast('ส่งสรุปรายวันขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else if (result.code === 'NOT_PRIMARY_DEVICE') {
        // ข้อ 19: ชีตรับสรุปจากเครื่องหลักเท่านั้น — พักงานสรุปของเครื่องนี้ (ไม่ยิงซ้ำ) และบอกให้เห็น
        await this.notePrimaryStatus(false, result.details && result.details.primary);
        this._cloudFailReason = String(result.message || 'เครื่องนี้ไม่ใช่เครื่องหลัก');
        if (!isSilent) this.showToast(String(result.message || 'เครื่องนี้ไม่ใช่เครื่องหลัก'), 'warning', 10000);
        return false;
      } else if (result.code === 'STALE_SUMMARY') {
        // ชีตมีรุ่นที่ใหม่กว่าอยู่แล้ว — ยกพื้นรุ่นแล้วให้ลองใหม่ (รอบหน้าชนะแน่นอน)
        // งานใน outbox วนเองอยู่แล้ว ส่วนการกดปุ่มเองต้องบอกให้กดซ้ำ ไม่งั้นกดแล้วเงียบ
        this.noteSummaryStampFloor(result.details);
        console.warn('[Summary] ปลายทางมีข้อมูลรุ่นใหม่กว่า จะส่งใหม่ด้วยรุ่นที่สูงขึ้น');
        this._cloudFailReason = 'บนชีตมีสรุปรุ่นใหม่กว่า — ระบบจะส่งใหม่ด้วยรุ่นที่สูงขึ้นเอง';
        if (!isSilent) this.showToast('บนชีตมีข้อมูลรุ่นใหม่กว่าอยู่ จึงยังไม่เขียนทับ — กดส่งอีกครั้งได้เลย', 'warning', 7000);
        return false;
      } else {
        throw new Error(this.explainCloudError(result.message) || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Daily summary sync error:', err);
      this._cloudFailReason = 'สรุปวัน ' + dateStr + ': ' + this.explainCloudError(err);   // รอบตรวจ 5 ข้อ 3
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
      this._cloudFailReason = this.getCloudSetupMessage();
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
      if (!response.ok) { if (response.release) response.release(); throw new Error(this.explainCloudError(`HTTP ${response.status}`)); }
      
      const result = await response.json();
      if (result.status === 'success') {
        if (!this.primaryStatus || !this.primaryStatus.isPrimary) await this.notePrimaryStatus(true, null);
        if (!isSilent) this.showToast('ส่งสรุปรายเดือนขึ้น Sheets สำเร็จ', 'success');
        return true;
      } else if (result.code === 'NOT_PRIMARY_DEVICE') {
        await this.notePrimaryStatus(false, result.details && result.details.primary);
        this._cloudFailReason = String(result.message || 'เครื่องนี้ไม่ใช่เครื่องหลัก');
        if (!isSilent) this.showToast(String(result.message || 'เครื่องนี้ไม่ใช่เครื่องหลัก'), 'warning', 10000);
        return false;
      } else if (result.code === 'STALE_SUMMARY') {
        this.noteSummaryStampFloor(result.details);
        console.warn('[Summary] ปลายทางมีข้อมูลรุ่นใหม่กว่า จะส่งใหม่ด้วยรุ่นที่สูงขึ้น');
        this._cloudFailReason = 'บนชีตมีสรุปรุ่นใหม่กว่า — ระบบจะส่งใหม่ด้วยรุ่นที่สูงขึ้นเอง';
        if (!isSilent) this.showToast('บนชีตมีข้อมูลรุ่นใหม่กว่าอยู่ จึงยังไม่เขียนทับ — กดส่งอีกครั้งได้เลย', 'warning', 7000);
        return false;
      } else {
        throw new Error(this.explainCloudError(result.message) || 'เซิร์ฟเวอร์รายงานข้อผิดพลาด');
      }
    } catch (err) {
      console.error('Monthly summary sync error:', err);
      this._cloudFailReason = 'สรุปเดือน ' + monthStr + ': ' + this.explainCloudError(err);   // รอบตรวจ 5 ข้อ 3
      if (!isSilent) this.showToast('ส่งสรุปรายเดือนล้มเหลว: ' + this.explainCloudError(err), 'error', 8000);
      return false;
    }
  }

  // ตรวจสอบและอัปเดตสถานะของไอคอนคลาวด์บนหน้าจอ
  // ── สถานะซิงก์ของบิล ────────────────────────────────────────────────────
  //   'pending'  = รอส่ง / ส่งไม่สำเร็จชั่วคราว → ระบบส่งซ้ำเองเมื่อมีเน็ต
  //   'synced'   = ชีตยืนยันแล้ว
  //   'conflict' = ส่งซ้ำไปกี่รอบก็ได้คำตอบเดิม (ข้อมูลในบิลเชื่อไม่ได้ / ชีตปฏิเสธถาวร / ชนกับสถานะบนชีต)
  //                ต้องให้คนตัดสิน — ระบบไม่ส่งซ้ำเอง และไม่ลบ/ไม่คืนบิลเองเด็ดขาด (รายละเอียดใน tx.syncIssue)
  isBillAwaitingSync(tx) {
    return !!tx && tx.syncStatus !== 'synced' && tx.syncStatus !== 'conflict';
  }

  markBillSyncIssue(tx, issue) {
    tx.syncStatus = 'conflict';
    tx.syncIssue = Object.assign({ at: Date.now() }, issue || {});
  }


  // ── บิลที่ขัดแย้งกับชีต: ทางแก้ที่ "เจ้าของเลือกเอง" เท่านั้น (ข้อ 8) ─────────────────
  //   restore-cloud : (ALREADY_VOIDED) ยืนยันคืนบิลขึ้นชีต ด้วยเวลาที่ใหม่กว่าการยกเลิกบนชีต
  //   void-local    : (ALREADY_VOIDED) ยกเลิกบิลในเครื่องตามชีต (ลงประวัติการยกเลิกพร้อมเหตุผล)
  //   push-local    : (STALE_REVISION) ให้ข้อมูลในเครื่องทับชีต — ยกยุคของบิลเป็นเวลาปัจจุบัน
  //   retry         : (DUPLICATE_BILL_ID หลังลบแถวซ้ำในชีตแล้ว / ข้อมูลเสียหลังแก้บิลแล้ว) ส่งใหม่
  // ระบบไม่เลือกทางใดทางหนึ่งเอง: ลบบิลในเครื่องเอง = ยอดขายหายโดยไม่มีคนรู้ · คืนบิลบนชีตเอง = อาจล้มการยกเลิกจริง
  conflictActionsFor(tx) {
    const issue = tx && tx.syncIssue;
    if (!issue || tx.syncStatus !== 'conflict') return [];
    if (issue.kind === 'invalid' || issue.kind === 'rejected') return ['edit', 'retry'];
    if (issue.code === 'ALREADY_VOIDED') return ['restore-cloud', 'void-local'];
    // ชีตถูกแก้หลังไฟล์สำรองที่กู้มา (รอบตรวจ 5 ข้อ 1): เจ้าของเลือกได้ว่าจะ "แก้บิลในเครื่องให้ตรงกับชีต"
    // (แก้แล้วยอด/ช่องทาง/พนักงานตรงกัน ระบบส่งขึ้นชีตได้เอง) หรือ "ใช้ข้อมูลในเครื่องทับชีต"
    if (issue.code === 'STALE_REVISION') return issue.fromRestore ? ['edit', 'push-local'] : ['push-local'];
    return ['retry'];
  }

  async resolveBillConflict(txId, action) {
    if (!this.authorize('data.admin', 'การแก้บิลที่ขัดแย้งกับชีต')) return false;
    if (!this.canWriteData('แก้บิลที่ขัดแย้งกับชีต')) return false;
    const done = await this.withMutation('การแก้บิลที่ขัดแย้งกับชีต', async () => {
      if (!this.authorize('data.admin', 'การแก้บิลที่ขัดแย้งกับชีต')) return false;
      const tx = this.state.transactions.find(t => t && t.id === txId);
      if (!tx || tx.syncStatus !== 'conflict' || !tx.syncIssue) {
        this.showToast('บิลใบนี้ไม่ได้อยู่ในสถานะรอตรวจแล้ว', 'info');
        return false;
      }
      const allowed = this.conflictActionsFor(tx);
      if (!allowed.includes(action) || action === 'edit') {
        this.showToast('ทางแก้นี้ใช้กับปัญหาของบิลใบนี้ไม่ได้', 'warning');
        return false;
      }
      const issue = tx.syncIssue;
      if (action === 'retry' && (issue.kind === 'invalid' || issue.kind === 'rejected') && !this.isBillUsable(tx)) {
        this.showToast('ข้อมูลเงินของบิลยังใช้ไม่ได้ — แก้บิลให้ถูกก่อน แล้วค่อยส่งใหม่', 'warning', 7000);
        return false;
      }
      if (action === 'void-local') {
        return this._voidBillLocked(tx, { reason: 'ยกเลิกตามสถานะบนชีต (บิลถูกยกเลิกบนชีตไปแล้ว)' });
      }
      const keys = ['syncStatus', 'syncIssue', 'revEpoch', 'restoredAt', 'restoreBase'];
      const prev = {};
      keys.forEach(k => { prev[k] = Object.prototype.hasOwnProperty.call(tx, k) ? tx[k] : undefined; });
      if (action === 'restore-cloud') {
        // ต้องใหม่กว่าเวลายกเลิกบนชีตเสมอ (นาฬิกาเครื่องอาจช้ากว่า) — เจ้าของยืนยันเจตนาแล้ว
        tx.restoredAt = Math.max(Date.now(), (Number(issue.voidedAt) || 0) + 1);
        delete tx.restoreBase;   // เจ้าของเลือกข้อมูลในเครื่องแล้ว — ไม่ต้องให้ชีตถามซ้ำ (รอบตรวจ 5 ข้อ 1)
      } else if (action === 'push-local') {
        const storedEpoch = issue.stored ? Number(issue.stored.epoch) || 0 : 0;
        tx.revEpoch = Math.max(Date.now(), storedEpoch + 1);
        delete tx.restoreBase;   // "ใช้ข้อมูลในเครื่องทับชีต" = ไม่ต้องเทียบกับไฟล์สำรองอีก
      }
      tx.syncStatus = 'pending';
      delete tx.syncIssue;
      try {
        await this.saveStateOrThrow('การแก้บิลที่ขัดแย้งกับชีต');
      } catch (err) {
        keys.forEach(k => { if (prev[k] === undefined) delete tx[k]; else tx[k] = prev[k]; });
        this.showToast('บันทึกไม่สำเร็จ — ยังไม่ได้เปลี่ยนอะไร: ' + (err.message || err), 'error', 8000);
        return false;
      }
      return true;
    });
    this.renderSyncConflicts();
    this.checkSyncStatus();
    if (done) {
      if (action === 'void-local') this.flushCloudOutbox();
      else this.syncPendingTransactions(true);
    }
    return !!done;
  }

  // รายการบิลรอตรวจในหน้าตั้งค่า — ปุ่มตามชนิดปัญหา (เห็นเฉพาะเจ้าของ เพราะทางแก้ทุกทางเป็นของเจ้าของ)
  renderSyncConflicts() {
    this.renderExpiredCloudJobs();   // กล่องงานคลาวด์ที่หยุดส่งแล้ว (ข้อ 16) อยู่ติดกัน
    const box = typeof document !== 'undefined' && document.getElementById ? document.getElementById('sync-conflicts-box') : null;
    if (!box) return;
    const list = (Array.isArray(this.state.transactions) ? this.state.transactions : []).filter(t => t && t.syncStatus === 'conflict');
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    const LABEL = {
      'restore-cloud': 'คืนบิลนี้ขึ้นชีต', 'void-local': 'ยกเลิกในเครื่องตามชีต',
      'push-local': 'ใช้ข้อมูลในเครื่องทับชีต', 'retry': 'ส่งใหม่', 'edit': 'แก้บิล'
    };
    const owner = this.currentRole === 'owner';
    const rows = list.slice(0, 50).map(tx => {
      const iss = tx.syncIssue || {};
      const when = new Date(tx.date).toLocaleString('th-TH');
      const btns = owner ? this.conflictActionsFor(tx).map(a => a === 'edit'
        ? `<button class="btn-small secondary" onclick="app.openTransactionEdit('${safeId(tx.id)}')">${LABEL[a]}</button>`
        : `<button class="btn-small secondary" onclick="app.resolveBillConflict('${safeId(tx.id)}','${a}')">${LABEL[a]}</button>`).join(' ') : '';
      return `<div style="border-top:1px solid var(--border-color);padding:8px 0;">
        <div style="font-size:0.8rem;"><b>${escapeHtml(tx.id)}</b> · ${escapeHtml(when)} · ฿${escapeHtml((Number(tx.total) || 0).toLocaleString('th-TH'))}</div>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin:2px 0 6px;">${escapeHtml(iss.message || iss.code || '')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${btns}</div></div>`;
    }).join('');
    box.innerHTML = `<p style="font-size:0.82rem;margin:0 0 6px;"><b>บิลรอตรวจ ${list.length} ใบ</b> — ระบบไม่ส่งซ้ำเอง และไม่ลบ/ไม่คืนบิลเอง ` +
      `ต้องให้เจ้าของเลือกทางแก้ทีละใบ${owner ? '' : ' (เข้าสู่ระบบด้วยบัญชีเจ้าของเพื่อแก้)'}</p>${rows}` +
      (list.length > 50 ? `<p style="font-size:0.75rem;color:var(--text-muted);">แสดง 50 จาก ${list.length} ใบ</p>` : '');
  }
  checkSyncStatus() {
    const pendingTxs = this.state.transactions.filter(tx => this.isBillAwaitingSync(tx));
    const conflictTxs = this.state.transactions.filter(tx => tx && tx.syncStatus === 'conflict');
    // งานคลาวด์ที่ลองครบ 3 ครั้งแล้วยังไม่สำเร็จ = ไม่ใช่แค่ "เน็ตสะดุด" อีกต่อไป
    const stuckJobs = (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : [])
      .filter(it => it && ((it.tries || 0) >= 3 ||
        (it.retry && Object.values(it.retry).some(r => r && (r.tries || 0) >= 3)))).length;
    if (!this.googleSheetsUrl) {
      // ยังไม่ตั้งค่า URL — ไม่ใช่สถานะ "ค้างซิงก์" (ไม่มีปลายทางให้ส่ง) แสดงเป็นออฟไลน์พร้อมจำนวนบิลในเครื่องแทน
      // เดิมโชว์ "ค้างซิงก์ ⚠️" ถาวรสำหรับร้านที่ตั้งใจใช้ออฟไลน์ล้วน ทำให้เข้าใจผิดว่าระบบมีปัญหา
      this.updateSyncBadgeStatus('offline', pendingTxs.length);
    } else if (!this.isValidCloudApiToken(this.googleSheetsApiToken || '')) {
      this.updateSyncBadgeStatus('setup', pendingTxs.length);
    } else if (pendingTxs.length > 0) {
      this.updateSyncBadgeStatus('warning', pendingTxs.length);
    } else if (this.isPrimaryBlocked()) {
      // ⚠️ เครื่องนี้ไม่ใช่เครื่องหลัก = งานสรุป/สำรองถูกพัก "โดยตั้งใจ" จึงไม่เคยนับเป็นงานค้าง
      // เดิมเคสนี้ตกไปขึ้น "ตรงกัน ✓" ทั้งที่ไม่มีไฟล์สำรองขึ้น Drive อีกเลย — ต้องฟ้องบนหน้าหลักเสมอ
      // (อยู่หลัง "บิลค้างซิงก์" เพราะบิลค้างหายเองได้ ส่วนเคสนี้ไม่หายจนกว่าเจ้าของจะตั้งเครื่องหลัก)
      this.updateSyncBadgeStatus('paused', this.countPrimaryPausedJobs());
    } else if (conflictTxs.length > 0) {
      // บิลที่ต้องให้คนตัดสิน — ห้ามขึ้นว่า "ตรงกัน ✓" ทั้งที่ยอดในเครื่องกับชีตยังไม่ตรงกัน
      this.updateSyncBadgeStatus('conflict', conflictTxs.length);
    } else if (stuckJobs > 0) {
      // ⚠️ ไม่มีบิลค้าง แต่มีงานคลาวด์ที่ลองแล้วลองอีกไม่สำเร็จ (ลบแถวบิลที่ยกเลิก / รีเฟรชสรุป / แจ้งเตือน)
      // เดิมเคสนี้ขึ้นว่า "ตรงกัน ✓" ทั้งที่แถวบิลที่สั่งลบยังค้างอยู่บนชีต
      // = ยอดบนชีตมากกว่าความจริงโดยไม่มีอะไรฟ้องเจ้าของเลย
      this.updateSyncBadgeStatus('stuck', stuckJobs);
    } else {
      this.updateSyncBadgeStatus('synced', 0);
    }
  }

  // ── คำตอบ error จากชีตเป็น "ระดับทั้งระบบ" หรือไม่ (รอบตรวจ 5 ข้อ 2) ───────────────────────
  // คืน 'config' (ตั้งค่าผิด — หยุดรอบทันที) · 'transient' (ชั่วคราว — นับเหมือนเน็ตสะดุด) · '' (เรื่องของบิลใบนั้น)
  // ตัดสินจาก code เป็นหลัก · Apps Script รุ่นก่อน (ยังไม่ได้วางโค้ดใหม่) ไม่มี code → ดูจากต้นข้อความที่รู้จักเท่านั้น
  cloudErrorLevel(result) {
    const code = result && result.code;
    const msg = String((result && result.message) || '');
    if (CLOUD_CONFIG_ERROR_CODES.includes(code)) return 'config';
    if (CLOUD_TRANSIENT_ERROR_CODES.includes(code)) return 'transient';
    if (code) return '';
    if (/unauthorized|ไม่ได้รับอนุญาต|ยังไม่ได้ตั้งรหัสเชื่อมต่อ/i.test(msg)) return 'config';
    if (/^ระบบหนาแน่น/.test(msg)) return 'transient';
    return '';
  }

  // รุ่นของบิล "ตามที่ไฟล์สำรองที่กู้มารู้จัก" (รอบตรวจ 5 ข้อ 1) — null = ไม่ใช่บิลจากการกู้ / ค่าเสีย
  billRestoreBase(tx) {
    const b = tx && tx.restoreBase;
    if (!b || typeof b !== 'object') return null;
    const epoch = Number(b.epoch), rev = Number(b.rev);
    if (!(Number.isInteger(epoch) && epoch >= 0) || !(Number.isInteger(rev) && rev >= 0)) return null;
    return { epoch, rev };
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
    const num = (v) => (v === undefined || v === null) ? undefined : this.toFiniteNumber(v);
    const payload = this.buildCloudRequest('transaction', {
      // บิลที่มาจากการกู้ข้อมูลคือ "เจตนาคืนบิลใหม่" ไม่ใช่คำขอเก่าที่หลงมาถึงทีหลัง
      // ปลายทางจะยอมข้ามทะเบียนบิลที่ยกเลิกก็ต่อเมื่อ restoredAt ใหม่กว่าเวลาที่ยกเลิกจริง ๆ
      // (ดู tombstone ใน google_apps_script.js) — ธงเปล่า ๆ ไม่พออีกต่อไป
      allowVoidedRestore: Number(tx.restoredAt) > 0,
      restoredAt: Number(tx.restoredAt) || 0,
      // รุ่นของบิล (ข้อ 7) — ชีตปฏิเสธคำขอที่รุ่นต่ำกว่าของที่มีอยู่ (คำขอเก่าที่มาถึงทีหลัง)
      // rev บวกทุกครั้งที่แก้บิล · revEpoch = เวลาที่กู้ข้อมูลชุดที่บิลนี้มาจาก (การกู้ = เจตนาให้เครื่องชนะ)
      rev: Number(tx.rev) >= 0 ? Number(tx.rev) : 0,
      revEpoch: Number(tx.revEpoch) >= 0 ? Number(tx.revEpoch) : 0,
      // รุ่นของบิลตามที่ "ไฟล์สำรองที่กู้มา" รู้จัก (รอบตรวจ 5 ข้อ 1) — ชีตใช้ตรวจว่ามีคนแก้บิลใบนี้หลังไฟล์นั้นไหม
      // ถ้ามีและยอด/ช่องทาง/พนักงานต่างกัน ชีตจะไม่เขียนทับ แต่ให้เจ้าของเลือก · ไม่ใช่บิลที่กู้มา = ไม่ส่ง
      restoreBase: this.billRestoreBase(tx) || undefined,
      id: tx.id,
      date: tx.date,
      monthKey: this.getBusinessMonthKey(tx.date),
      dateTimeStr: `${txD.getFullYear()}-${pad2(txD.getMonth() + 1)}-${pad2(txD.getDate())} ${pad2(txD.getHours())}:${pad2(txD.getMinutes())}:${pad2(txD.getSeconds())}`,
      customerName: tx.customerName,
      services: tx.services,
      // ช่องเงินส่งเป็น "ตัวเลข" เสมอ (ฝั่งชีตไม่รับข้อความ) — ข้อความตัวเลขแบบ "600" แปลงได้ไม่เสียข้อมูล
      // ค่าที่แปลงไม่ได้จะไม่มาถึงตรงนี้ เพราะด่าน validateBillRecord กันไว้ก่อนส่งแล้ว
      subtotal: num(tx.subtotal),
      discount: num(tx.discount),
      // 4 ช่อง VAT ที่ล็อกไว้ตอนออกบิล — ชีตเอาไปลงคอลัมน์ให้แถวบวกลงตัว
      // (ราคารวม − ส่วนลด = ไม่คิด VAT + คิด VAT · แล้ว + VAT + ปัดเศษ = ยอดสุทธิ)
      // บิลรุ่นก่อนมี VAT ไม่มีฟิลด์พวกนี้ → JSON.stringify ตัดทิ้งเอง แล้วฝั่งชีตคำนวณย้อนให้
      nonVatBase: num(tx.nonVatBase),
      vatableBase: num(tx.vatableBase),
      vatAmount: num(tx.vatAmount),
      rounding: num(tx.rounding),
      vatRate: num(tx.vatRate),
      total: num(tx.total),
      paymentMethod: tx.paymentMethod,
      staffNames: tx.staffNames,
      // รายการย่อยเฉพาะตัวเลข — ให้ชีตตรวจว่ารายละเอียดบวกกลับได้เท่ายอดของบิล (ไม่ได้เขียนลงชีต)
      lines: Array.isArray(tx.details) && tx.details.length
        ? tx.details.map(dl => ({ price: num(dl && dl.price), netPrice: num(dl && dl.netPrice),
            vatable: (dl && typeof dl.vatable === 'boolean') ? dl.vatable : undefined }))
        : undefined
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
      // connectionLevel = ความล้มเหลวระดับการเชื่อมต่อ (ใบถัดไปก็จะล้มแบบเดียวกัน) — ให้รอบส่งหยุดก่อน (ดู _doSyncPendingTransactions)
      throw Object.assign(new Error('เครือข่ายขัดข้อง: ' + this.explainCloudError(networkErr)), { connectionLevel: true });
    }

    if (!response.ok) {
      if (response.release) response.release();   // ไม่อ่านเนื้อคำตอบ — ปล่อยตัวจับเวลา
      throw Object.assign(new Error(this.explainCloudError(`HTTP ${response.status}`)), { connectionLevel: true });
    }

    // ── ตีความคำตอบ: สำเร็จ / ลองใหม่ได้ (throw) / ขัดแย้งถาวร (คืน conflict ให้คนตัดสิน) ──
    // ⚠️ เดิม ALREADY_VOIDED คืน true = ถูกนับว่า "synced" ทั้งที่ชีตไม่มีบิลนี้ แต่ในเครื่องยังนับในยอดขาย
    // และบิลที่กู้มาจะถูก "ยืนยันคืนบิลเอง" อัตโนมัติ ซึ่งอาจล้มการยกเลิกที่เกิดทีหลังจริง ๆ
    // ตอนนี้: สถานะที่ส่งซ้ำกี่ครั้งก็ได้คำตอบเดิม → เก็บเป็น conflict ถาวรพร้อมเหตุผล ให้เจ้าของเลือกทางแก้เอง
    let result;
    try {
      result = await response.json();
    } catch (parseErr) {
      throw Object.assign(new Error(this.explainCloudError(parseErr)), { connectionLevel: true });
    }
    if (result && result.status === 'success') return { status: 'synced' };
    const code = result && result.code;
    const d = (result && result.details && typeof result.details === 'object') ? result.details : {};
    const msg = String((result && result.message) || '');
    if (code === 'ALREADY_VOIDED') {
      const voidedAt = Number(d.voidedAt) || 0;
      // บิลที่มาจากการกู้ข้อมูล (รอบตรวจ 5 ข้อ 1): ชีตยกเลิกบิลนี้ "หลังไฟล์สำรองถูกสร้าง"
      // ข้อความเดิม ("คำขอนี้น่าจะค้างมาจากก่อนการยกเลิก") พาให้เข้าใจผิด — บอกให้ตรงกับเหตุการณ์จริง
      const fromRestore = Number(tx.restoredAt) > 0;
      const when = voidedAt > 0 ? new Date(voidedAt).toLocaleString('th-TH') : 'ไม่ทราบเวลา';
      return { status: 'conflict', issue: { kind: 'conflict', code, voidedAt, fromRestore,
        message: fromRestore
          ? `บิลนี้ถูกยกเลิกบนชีตหลังไฟล์สำรองที่กู้มา (ยกเลิกเมื่อ ${when}) — ถ้าคืนเงินลูกค้าไปแล้ว/ยกเลิกจริง ให้กด "ยกเลิกในเครื่องตามชีต" · ถ้ายกเลิกผิด ให้กด "คืนบิลนี้ขึ้นชีต"`
          : (msg || 'บิลนี้ถูกยกเลิกไปแล้วบนชีต') } };
    }
    if (code === 'STALE_REVISION') {
      // d.base มีค่า = ชีตปฏิเสธเพราะ "บิลถูกแก้บนชีตหลังไฟล์สำรองที่กู้มา" (รอบตรวจ 5 ข้อ 1)
      const fromRestore = !!(d.base && typeof d.base === 'object');
      return { status: 'conflict', issue: { kind: 'conflict', code,
        message: fromRestore
          ? (msg || 'บิลนี้บนชีตถูกแก้หลังไฟล์สำรองที่กู้มา') +
            ' · ต้องการค่าบนชีต: กด "แก้บิล" แล้วแก้ให้ตรงกับชีต (ระบบส่งขึ้นเอง) · ต้องการค่าในไฟล์ที่กู้: กด "ใช้ข้อมูลในเครื่องทับชีต"'
          : (msg || 'บนชีตมีบิลรุ่นใหม่กว่า'),
        stored: d.stored || null, got: d.got || null, fromRestore,
        changes: Array.isArray(d.changes) ? d.changes.slice(0, 10) : undefined } };
    }
    if (code === 'DUPLICATE_BILL_ID') {
      return { status: 'conflict', issue: { kind: 'conflict', code, message: msg || 'บนชีตมีเลขที่บิลนี้ซ้ำหลายแถว',
        rows: Array.isArray(d.rows) ? d.rows : [] } };
    }
    if (['INVALID_AMOUNT', 'INVALID_PAYMENT', 'INVALID_DATE', 'INVALID_BILL_ID', 'INVALID_REVISION'].includes(code)) {
      // ชีตตรวจแล้วว่าข้อมูลบิลใช้ไม่ได้ — ส่งซ้ำก็ได้คำตอบเดิม ต้องแก้บิลก่อน
      return { status: 'conflict', issue: { kind: 'rejected', code, message: msg || 'ชีตปฏิเสธข้อมูลบิลนี้' } };
    }
    // ── error ระดับทั้งระบบ (รอบตรวจ 5 ข้อ 2) — ไม่ใช่ความผิดของบิลใบนี้ ส่งใบถัดไปก็ได้คำตอบเดิม ──
    // ตั้งค่าผิด (รหัสเชื่อมต่อไม่ตรง/ยังไม่ตั้ง) = หยุดทั้งรอบทันที · ชั่วคราว = นับเหมือนเน็ตสะดุด
    // ⚠️ เดิมทุกอย่างตกไปเป็น "บิลใบนั้นล้ม" → รอบส่งไล่ยิงครบทุกใบ แล้วตั้งปลุกซ้ำทุกนาที
    const level = this.cloudErrorLevel(result);
    if (level === 'config') {
      throw Object.assign(new Error(this.explainCloudError(msg) || 'ชีตไม่รับคำขอจากเครื่องนี้'), { serverLevel: true, code: code || '' });
    }
    if (level === 'transient') {
      throw Object.assign(new Error(this.explainCloudError(msg) || 'ชีตขัดข้องชั่วคราว'), { connectionLevel: true, code: code || '' });
    }
    // ที่เหลือ (หัวตารางเพี้ยนรอแก้ / ข้อผิดพลาดเฉพาะบิล) → ลองใหม่รอบหน้า
    throw new Error(this.explainCloudError(msg) || 'GAS รายงานข้อผิดพลาด');
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
      // ⚠️ ข้อ 14: ร้านที่ตั้งเฉพาะ Telegram (ยังไม่ตั้ง Google Sheets) เดิมออกตรงนี้เลย
      // ข้อความปิดกะที่ค้างจึงไม่ถูกส่งซ้ำอีกเลย — คิวงานส่งเฉพาะบริการที่ตั้งค่าไว้ได้อยู่แล้ว
      if (!(this.telegramToken && this.telegramChatId)) return;
      return Promise.resolve(this.flushCloudOutbox())
        .catch(err => { console.error('flushCloudOutbox failed', err); });
    }
    // ⚠️ ต้อง await ให้บิลค้างส่งจบก่อน ค่อยยิง outbox
    // เดิมเรียกสองตัวติดกันโดยไม่รอ → คำขอ "บันทึกบิล" กับคำขอ "ลบบิลที่ยกเลิก" วิ่งพร้อมกัน
    // ถ้าคำขอลบไปถึงก่อน ปลายทางจะตอบ NOT_FOUND (ถือว่าลบแล้ว ทิ้งงาน) แล้วคำขอบันทึกที่ตามมาทีหลัง
    // จะสร้างแถวบิลที่ถูกยกเลิกไปแล้วขึ้นมาใหม่บนชีต — ยอดบนชีตเกินจริงโดยไม่มีอะไรเตือน
    // เรียงลำดับให้ชัดตรงนี้ปิดหน้าต่างนั้นได้เกือบหมด (ที่เหลือคือคำขอที่ timeout ฝั่งเราแต่เซิร์ฟเวอร์ยังทำต่อ)
    // Promise.resolve() ครอบไว้เพราะเทสต์ (และโค้ดเก่า) อาจแทน syncPendingTransactions ด้วยฟังก์ชันธรรมดา
    return Promise.resolve(this.syncPendingTransactions(true))
      .catch(err => { console.error('syncPendingTransactions failed', err); })
      // ข้อ 19: เครื่องที่ถูกพักงานสรุปไว้ — ถามสถานะเครื่องหลักใหม่ครั้งเดียวต่อการเปิดแอป
      // (เจ้าของอาจย้ายเครื่องหลักกลับมา หรือล้างการตั้งค่าเครื่องหลักบน Apps Script ไปแล้ว)
      // และเครื่องที่ "ยังไม่รู้สถานะ" (เพิ่งติดตั้ง/เพิ่งกู้ข้อมูลลงเครื่องใหม่ = ได้รหัสเครื่องใหม่)
      // ต้องถามด้วย — เดิมรู้ตัวก็ต่อเมื่อปิดกะแล้วส่งไฟล์สำรองไม่ผ่าน ซึ่งอาจเป็นอีกหลายชั่วโมงหรือหลายวัน
      .then(() => {
        if ((this.isPrimaryBlocked() || !this.primaryStatus) && !this._primaryRefreshed) {
          this._primaryRefreshed = true;
          return this.refreshPrimaryStatus();
        }
      })
      .catch(err => { console.error('refreshPrimaryStatus failed', err); })
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
    // ชุดข้อมูลที่รอบนี้เริ่มทำงาน — ถ้าถูกแทนทั้งชุดระหว่างส่ง (กู้/นำเข้า/ย้อน/ล้าง) ต้องหยุดรอบนี้
    // แล้วปล่อยให้รอบใหม่จัดการข้อมูลชุดใหม่เอง ห้ามเอาผลของชุดเก่ามาเขียนทับ (ดู _dataGeneration)
    const gen = this._dataGeneration;
    
    try {
      const pendingTxs = this.state.transactions.filter(tx => this.isBillAwaitingSync(tx));
    
      if (pendingTxs.length === 0) {
        this.checkSyncStatus();
        if (!isSilent) {
          if (this.hasCloudSyncConfig() && this.isPrimaryBlocked()) {
            this.showToast('บิลขึ้นชีตครบแล้ว แต่' + this.primaryPausedMessage(), 'warning', 12000);
          } else {
            this.showToast('ข้อมูลธุรกรรมทั้งหมดตรงกันกับ Google Sheets แล้ว (ไม่มีบิลค้างซิงก์)', 'info');
          }
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
      let issueCount = 0;   // บิลที่ถูกกันไว้ให้คนตรวจในรอบนี้ (ต้องบันทึกสถานะลงเครื่องด้วย)
      let lastErr = null;   // เก็บไว้ตัดสินว่าต้องเตือนเจ้าของไหม (ดูท้ายลูป)
      // ── รอบที่มีบิลค้างเยอะ (เช่นหลังกู้ข้อมูล ต้องส่งใหม่ทุกใบ — ร้านนี้ 700+ ใบ) ──────────────
      // 1) บันทึกความคืบหน้าลงเครื่องทุก SYNC_SAVE_EVERY ใบ — เดิมบันทึกตอนจบรอบครั้งเดียว
      //    แอปถูกปิด/ถูก iOS ฆ่ากลางทาง = รอบหน้าต้องเริ่มส่งตั้งแต่ใบแรกใหม่ทั้งหมด
      // 2) ล้มระดับการเชื่อมต่อติดกัน SYNC_CONN_FAIL_STOP ใบ (เน็ตหลุด/หมดเวลา/URL ผิด) = หยุดรอบนี้
      //    เดิมไล่ส่งต่อทุกใบ ใบละ 20 วินาที — คิวคลาวด์ (สรุป/สำรอง/Telegram) ถูกขวางเป็นชั่วโมง
      //    บิลที่ยังไม่ได้ส่งยังค้าง pending ครบ ตัวปลุกจะลองรอบใหม่เอง (ไม่มีอะไรหาย)
      //    ความล้มเหลวเฉพาะใบ (ชีตปฏิเสธ/หัวตารางของเดือนนั้นเพี้ยน) ไม่นับ — ไม่งั้นเดือนที่เสียเดือนเดียวจะขวางทุกเดือน
      const SYNC_SAVE_EVERY = 25, SYNC_CONN_FAIL_STOP = 3;
      let unsaved = 0, connFails = 0, stoppedEarly = false;

      for (let tx of pendingTxs) {
        if (gen !== this._dataGeneration) break;   // ข้อมูลถูกแทนทั้งชุดระหว่างรอบนี้
        if (unsaved >= SYNC_SAVE_EVERY) {
          unsaved = 0;
          await this.withMutation('บันทึกผลซิงก์บิล (ระหว่างทาง)', () => (gen === this._dataGeneration ? this.saveState() : false));
        }
        // กัน race: ถ้าบิลถูก void ระหว่างรอคิว sync (ไม่อยู่ใน state แล้ว) ห้ามส่งขึ้นชีต — ไม่งั้นเกิดแถวผีหลังลบ
        if (!this.state.transactions.includes(tx)) continue;
        // ── ด่านข้อมูลเสีย: บิลที่ตัวเลขเงินเชื่อไม่ได้ ห้ามส่งขึ้นคลาวด์อัตโนมัติ ─────────
        // (ชีตจะปฏิเสธอยู่ดี และถ้าชีตรุ่นเก่ารับไว้ ยอดบนชีตจะผิดโดยไม่มีใครรู้)
        const fatalProblems = this.validateBillRecord(tx).filter(p => p.fatal);
        if (fatalProblems.length) {
          this.markBillSyncIssue(tx, {
            kind: 'invalid', code: 'LOCAL_INVALID',
            message: 'ข้อมูลเงินในบิลเชื่อไม่ได้: ' + fatalProblems.map(p => p.msg).join(' / ')
          });
          issueCount++;
          continue;
        }
        const revBeforeSend = tx.rev || 0; // จำเวอร์ชันแก้ไขก่อนส่ง — ใช้ตรวจ race ด้านล่าง
        const epochBeforeSend = tx.revEpoch || 0;
        try {
          const res = await this.syncSingleTransaction(tx);
          // เช็คซ้ำหลัง await: บิลอาจถูก void ระหว่าง fetch — ถ้าหายไปแล้วไม่ต้อง mark (outbox ของ void จะลบแถวให้เอง)
          if (!this.state.transactions.includes(tx)) continue;
          // กัน race: บิลถูก "แก้ไข" ระหว่าง fetch (rev เปลี่ยน) — ห้ามทับเป็น synced
          // ไม่งั้นข้อมูลที่เพิ่งแก้จะไม่ถูกส่งขึ้นชีตอีกเลย ปล่อยค้าง pending ให้รอบถัดไปส่งเวอร์ชันใหม่ทับ
          if ((tx.rev || 0) !== revBeforeSend || (tx.revEpoch || 0) !== epochBeforeSend) continue;
          connFails = 0;   // ชีตตอบกลับมาแล้ว = การเชื่อมต่อใช้ได้
          if (res && res.status === 'conflict') {
            // ขัดแย้งถาวร — ไม่นับว่าสำเร็จ ไม่ส่งซ้ำเอง ไม่ลบ/ไม่คืนบิลเอง (ดู resolveBillConflict)
            this.markBillSyncIssue(tx, res.issue);
            issueCount++;
            unsaved++;
            continue;
          }
          tx.syncStatus = 'synced';
          delete tx.syncIssue;
          // สิทธิ์คืนบิลเป็น "ครั้งเดียวจบ" — ขึ้นชีตแล้วต้องปลดทิ้ง
          // ไม่งั้นบิลใบนี้จะพกสิทธิ์ข้ามทะเบียนติดตัวไปตลอดอายุการใช้งาน
          if (tx.restoredAt) delete tx.restoredAt;
          // ธงยืนยันคืนบิลก็เป็นของ "การกู้ครั้งนั้น" เหมือนกัน ขึ้นชีตแล้วต้องล้าง
          // ไม่งั้นมันจะติดไปกับไฟล์สำรองที่สร้างหลังจากนี้ แล้วไปปิดทางออกฉุกเฉินของการกู้รอบหน้า
          if (tx._restoreConfirmed) delete tx._restoreConfirmed;
          // รุ่นตามไฟล์สำรอง (รอบตรวจ 5 ข้อ 1) ใช้ตรวจครั้งเดียวตอนกู้ — ขึ้นชีตแล้วไม่เกี่ยวกับการแก้บิลครั้งต่อไป
          if (tx.restoreBase) delete tx.restoreBase;
          successCount++;
          unsaved++;
        } catch (err) {
          console.error(`Failed to sync transaction ${tx.id}:`, err);
          tx.syncStatus = 'pending';
          failCount++;
          lastErr = err;
          // ตั้งค่าผิด (รหัสเชื่อมต่อไม่ตรง/ยังไม่ตั้ง) — ใบถัดไปก็ได้คำตอบเดิม หยุดรอบทันที (รอบตรวจ 5 ข้อ 2)
          if (err && err.serverLevel) { stoppedEarly = true; break; }
          if (err && err.connectionLevel) {
            if (++connFails >= SYNC_CONN_FAIL_STOP) { stoppedEarly = true; break; }
          } else connFails = 0;
        }
      }
      if (stoppedEarly) {
        console.warn(lastErr && lastErr.serverLevel
          ? '[Sync] ชีตไม่รับคำขอจากเครื่องนี้ (ตั้งค่าไม่ตรง) — หยุดรอบนี้ทันที บิลที่เหลือยังค้างรอส่ง'
          : `[Sync] เชื่อมต่อชีตไม่ได้ติดกัน ${SYNC_CONN_FAIL_STOP} ใบ — หยุดรอบนี้ไว้ก่อน บิลที่เหลือยังค้างรอส่ง (ลองใหม่อัตโนมัติ)`);
      }

      // ── จำสาเหตุล่าสุด + จังหวะลองใหม่ (รอบตรวจ 5 ข้อ 2) ────────────────────────────────
      // เดิมสาเหตุลงแค่ console — กดซิงก์เองก็เห็นแค่ "ล้มเหลว N รายการ" ไม่รู้ว่าต้องไปแก้อะไร
      if (failCount > 0 && lastErr) {
        this._lastSyncError = { message: this.explainCloudError(lastErr), at: Date.now(), config: !!lastErr.serverLevel };
      } else if (successCount > 0) {
        this._lastSyncError = null;
      }
      // ส่งไม่ผ่านทั้งรอบ = เว้นระยะรอบถัดไปให้ห่างขึ้น · มีใบที่ผ่าน = เริ่มนับใหม่ (ดู billRetryDelayMs)
      if (failCount > 0 && successCount === 0) this._billRetryStreak = (Number(this._billRetryStreak) || 0) + 1;
      else if (successCount > 0) this._billRetryStreak = 0;
      if (successCount > 0) this._configWarnShown = false;

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
      // บันทึกในคิวงานบันทึก — ห้ามแทรกกลางงานขาย/ยกเลิกที่กำลังบันทึกหรือคืนค่าอยู่
      if ((successCount > 0 || issueCount > 0) && gen === this._dataGeneration) {
        await this.withMutation('บันทึกผลซิงก์บิล', () => (gen === this._dataGeneration ? this.saveState() : false));
      }
      if (issueCount > 0) {
        this.showToast(`มีบิล ${issueCount} ใบที่ต้องให้เจ้าของตัดสินใจ (ข้อมูลไม่ตรงกับชีต/ข้อมูลเงินเชื่อไม่ได้) — ระบบไม่ส่งซ้ำเอง ดูที่หน้าตั้งค่า > บิลรอตรวจ`, 'error', 9000);
        this.renderSyncConflicts();
      }

      this.checkSyncStatus();

      if (failCount > 0) {
        const why = this._lastSyncError && this._lastSyncError.message ? ` — สาเหตุ: ${this._lastSyncError.message}` : '';
        if (!isSilent) {
          const left = this.state.transactions.filter(t => this.isBillAwaitingSync(t)).length;
          this.showToast(`ซิงก์สำเร็จ ${successCount} รายการ, ล้มเหลว ${failCount} รายการ` +
            (stoppedEarly ? ` (หยุดรอบนี้ไว้ก่อน · ยังค้าง ${left} ใบ)` : '') + why, 'warning', why ? 15000 : 4000);
        } else if (lastErr && lastErr.serverLevel && !this._configWarnShown) {
          // ซิงก์เบื้องหลังก็ต้องบอกเมื่อเป็นเรื่องตั้งค่า — รอเฉย ๆ ไม่มีวันหาย (เตือนครั้งเดียวจนกว่าจะส่งผ่าน)
          this._configWarnShown = true;
          this.showToast('ส่งบิลขึ้นชีตไม่ได้' + why, 'error', 15000);
        }
      } else {
        if (!isSilent) {
          this.showToast(`ซิงก์ขึ้น Google Sheets สำเร็จ ${successCount} รายการ`, 'success');
        }
      }
    } finally {
      this.isSyncing = false;
      this.scheduleCloudRetry();   // บิลที่ส่งไม่สำเร็จ → ตั้งเวลาปลุกลองใหม่ (ข้อ 14)
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
    } else if (status === 'conflict') {
      textStr = `บิลรอตรวจ ${count} ใบ ⚠️`;
      iconClass = 'fa-triangle-exclamation';
      statusClass = 'sync-warning';
    } else if (status === 'stuck') {
      textStr = `งานคลาวด์ค้าง ${count} รายการ ⚠️`;
      iconClass = 'fa-cloud-arrow-up';
      statusClass = 'sync-warning';
    } else if (status === 'paused') {
      textStr = 'ไม่ได้สำรอง: ไม่ใช่เครื่องหลัก ⚠️';
      iconClass = 'fa-circle-pause';
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
      } else if (status === 'paused') {
        settingsDetailsEl.innerText = this.primaryPausedMessage() +
          (count > 0 ? ` · งานที่พักไว้ ${count} รายการ (จะส่งต่อทันทีเมื่อตั้งเป็นเครื่องหลัก)` : '');
        settingsDetailsEl.style.color = 'var(--accent-premium)';
      } else if (status === 'stuck') {
        // รอบตรวจ 5 ข้อ 3: บอกสาเหตุล่าสุดด้วย (เดิมบอกแค่จำนวน — Telegram/ชีตปฏิเสธเพราะอะไรไม่มีใครรู้)
        const je = this.latestCloudJobError();
        settingsDetailsEl.innerText =
          `มีงานคลาวด์ค้าง ${count} รายการ (เช่นคำสั่งลบแถวบิลที่ยกเลิก รีเฟรชสรุป หรือข้อความ Telegram) — ` +
          `บิลในเครื่องขึ้นชีตครบแล้ว แต่ชีตอาจยังไม่ตรง ใช้ปุ่ม "ตรวจความตรงกันกับชีต" ดูได้` +
          (je ? `\nสาเหตุล่าสุด (${je.label}): ${je.message}` : '');
        settingsDetailsEl.style.color = 'var(--accent-premium)';
      } else if (count > 0) {
        // รอบตรวจ 5 ข้อ 2: บอกสาเหตุที่ส่งไม่ผ่านล่าสุด — ไม่ต้องรอกดซิงก์เองถึงจะรู้
        const se = this._lastSyncError;
        settingsDetailsEl.innerText = `มี ${count} รายการบิลค้างส่งขึ้นคลาวด์` +
          (se && se.message ? `\nสาเหตุล่าสุด: ${se.message}` : '');
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
    // ⚠️ เดิมเขียนแบบ denylist (ห้ามเฉพาะ 'staff') — ไม่ได้ล็อกอิน/ตำแหน่งแปลกจึงหลุดผ่านได้
    // ตอนนี้ใช้ตารางสิทธิ์กลาง (allowlist) ตัวเดียวกับที่ confirmCashCount ตรวจซ้ำตอนบันทึกจริง
    if (mode === 'close' && !this.authorize('shift.close', 'การปิดร้าน/สรุปยอดวัน')) {
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
      
      // คำนวณยอดเงินสะสม — ตัวคำนวณเดียวกับตอนบันทึกปิดกะจริง (computeShiftDrawer)
      const drawerCalc = this.computeShiftDrawer(this.state.shift);
      const startCash = drawerCalc.startCash;
      const cashSales = drawerCalc.cashSales;
      const expensesTotal = drawerCalc.drawerExpensesTotal;   // เฉพาะที่จ่ายจากลิ้นชัก
      const expectedTotal = drawerCalc.expected;
      const money = v => `฿${(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      const otherRow = document.getElementById('closing-other-expenses-row');
      if (otherRow) otherRow.style.display = drawerCalc.otherExpensesTotal > 0 ? 'flex' : 'none';
      const otherEl = document.getElementById('closing-other-expenses');
      if (otherEl) otherEl.innerText = money(drawerCalc.otherExpensesTotal);
      const overRow = document.getElementById('closing-overspend-row');
      if (overRow) overRow.style.display = drawerCalc.overspend > 0 ? 'flex' : 'none';
      const overEl = document.getElementById('closing-overspend');
      if (overEl) overEl.innerText = '-' + money(drawerCalc.overspend);
      
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
      this.renderClosingMoneyNotes(drawerCalc);
      
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
    // หาช่องนับไม่เจอ / ชนิดธนบัตรหาย = โยนออกไปพร้อมป้ายเตือน ไม่เดาว่านับได้ 0
    const drawer = this.readCashDrawer();
    const total = drawer.total;

    Object.keys(drawer.details).forEach(denom => {
      const label = document.getElementById(`denom-total-${denom}`);
      if (label) {
        label.innerText = `฿${(denom * drawer.details[denom]).toLocaleString('th-TH')}`;
      }
    });

    const totalEl = document.getElementById('cash-counter-total');
    if (totalEl) {
      totalEl.innerText = `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    }
    
    // ถ้าอยู่ในโหมดปิดกะ ให้แสดงผลต่างเงินขาด/เกินด้วย
    if (this.cashCounterMode === 'close') {
      // ตัวคำนวณเดียวกับตอนบันทึกปิดกะ (drawerDifference) — รวมกติกา "ค่าใช้จ่ายเกินลิ้นชัก = เงินขาด"
      const diff = this.drawerDifference(this.computeShiftDrawer(this.state.shift), total);
      
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

  // ── เงินที่ "ควรมี" ในลิ้นชักของกะหนึ่ง ────────────────────────────────────
  // ตัวคำนวณเดียวที่ใช้ทั้งตอนแสดงหน้าปิดกะ (openCashCounter/updateCashSum) และตอนบันทึกปิดกะจริง
  // (confirmCashCount) — เดิมเขียนซ้ำสามที่ แก้ที่หนึ่งแล้วลืมอีกที่เมื่อไหร่ ตัวเลขบนจอกับที่บันทึกจะไม่ตรงกัน
  computeShiftDrawer(shift) {
    const sh = shift || {};
    const sat = v => Math.round(v * 100);
    const startCash = Number(sh.startCash) || 0;
    const startTime = Number(sh.startTime) || 0;
    // ⚠️ ข้อ 16: เงินสดจากการขาย = "เงินที่รับจริงตอนขาย" ไม่ใช่ยอดบิลหลังแก้
    // เดิมใช้ยอดบิลปัจจุบัน — แก้ส่วนลดบิลจาก 500 เป็น 400 แล้วเงินที่ควรมีลดลง 100 ทันที
    // เท่ากับระบบถือเองว่าคืนเงินลูกค้าไปแล้ว ทั้งที่ไม่มีใครบอก (ถ้าไม่ได้คืนจริง ลิ้นชักจะ "เกิน" โดยหาที่มาไม่ได้)
    // การคืน/เก็บเงินเพิ่มจริงถูกบันทึกแยกเป็น cashAdjustments ของกะที่เงินเคลื่อนไหว (recordBillSettlement)
    let cashSalesSat = 0;
    const invalidBills = [];
    (this.state.transactions || []).forEach(tx => {
      if (!tx || typeof tx !== 'object') return;
      const txTime = new Date(tx.date).getTime();
      if (!(txTime >= startTime)) return;
      const t = this.tenderOf(tx);   // บิลไม่มีช่องทาง = เงินสด (บิลรุ่นเก่า) — อยู่ใน paymentMethodOf แล้ว
      // ข้อมูลรับเงินเสีย = ไม่รู้ว่าเงินเข้าลิ้นชักเท่าไร → ไม่นับ และแจ้งให้เห็น (ไม่ใช่นับเป็น 0 เงียบ ๆ)
      if (!t.valid) { invalidBills.push(tx.id); return; }
      if (t.method === 'cash') cashSalesSat += sat(t.amount);
    });
    let adjSat = 0, invalidAdjustments = 0;
    const cashAdjustments = [];
    const adjList = (sh.cashAdjustments === undefined || sh.cashAdjustments === null) ? [] : sh.cashAdjustments;
    if (!Array.isArray(adjList)) invalidAdjustments++;
    else adjList.forEach(a => {
      const n = (a && typeof a === 'object') ? this.toFiniteNumber(a.amount) : null;
      if (n === null) { invalidAdjustments++; return; }
      // ถูกกลับรายการเพราะบิลถูกยกเลิกในกะเดียวกัน (ดู _voidBillLocked) — เก็บไว้เป็นหลักฐาน แต่ไม่นับเงิน
      if (!a.reversedByVoid) adjSat += sat(n);
      cashAdjustments.push(Object.assign({}, a, { amount: n }));
    });
    // ค่าใช้จ่าย: หักจากลิ้นชักเฉพาะรายการที่ "จ่ายจากลิ้นชัก" (แก้ 24 ก.ย. 2569 ตามที่เจ้าของเลือก)
    // รายการที่จ่ายทางอื่น (โอน/เงินเจ้าของ) ยังเป็นค่าใช้จ่ายของร้านในสรุป/กำไรตามเดิม แต่ไม่ใช่เงินที่ออกจากลิ้นชัก
    // เดิมหักทุกรายการ — ข้อมูลจริงมีกะที่ "ควรมี" ติดลบ (−300 · −550) เพราะค่าใช้จ่ายที่จ่ายทางอื่นถูกหักจากลิ้นชัก
    // รายการเก่าที่ไม่มีฟิลด์ paidFrom = จ่ายจากลิ้นชัก (กติกาเดิมของระบบ ไม่ตีความประวัติใหม่)
    let expSat = 0, drawerExpSat = 0, invalidExpenses = 0;
    (Array.isArray(sh.expenses) ? sh.expenses : []).forEach(e => {
      const n = (e && typeof e === 'object') ? this.toFiniteNumber(e.amount) : null;
      if (n === null) { invalidExpenses++; return; }
      expSat += sat(n);
      if (!this.isExpenseOutsideDrawer(e)) drawerExpSat += sat(n);
    });
    // เงินที่ควรมีในลิ้นชักติดลบไม่ได้ในความจริง — ส่วนที่ค่าใช้จ่ายเกินเงินในลิ้นชัก "นับเป็นเงินขาด" (เจ้าของสั่ง 24 ก.ย. 2569)
    // เดิม: ควรมี −550 นับได้ 0 → ระบบขึ้น "เงินเกิน 550" ซึ่งกลับด้านกับความจริง
    const rawSat = sat(startCash) + cashSalesSat + adjSat - drawerExpSat;
    return {
      startCash,
      cashSales: cashSalesSat / 100,
      cashAdjustTotal: adjSat / 100,
      expensesTotal: expSat / 100,                       // ค่าใช้จ่ายทั้งหมดของกะ (ทุกช่องทาง)
      drawerExpensesTotal: drawerExpSat / 100,           // เฉพาะที่จ่ายจากลิ้นชัก
      otherExpensesTotal: (expSat - drawerExpSat) / 100, // จ่ายทางอื่น — ไม่กระทบลิ้นชัก
      expected: Math.max(0, rawSat) / 100,
      overspend: Math.max(0, -rawSat) / 100,             // ค่าใช้จ่ายจากลิ้นชักที่เกินเงินในลิ้นชัก → นับเป็นเงินขาด
      cashAdjustments,
      unsettledAdjustments: this.listUnsettledBills(),
      invalidBills, invalidAdjustments, invalidExpenses
    };
  }

  // ผลต่างตอนปิดกะ = นับได้ − ควรมี − ส่วนที่ค่าใช้จ่ายเกินเงินในลิ้นชัก (ตัวเดียวใช้ทั้งหน้าจอและตอนบันทึก)
  drawerDifference(calc, counted) {
    const sat = v => Math.round((Number(v) || 0) * 100);
    return (sat(counted) - sat(calc.expected) - sat(calc.overspend)) / 100;
  }

  // ค่าใช้จ่ายรายการนี้จ่ายทางอื่น (ไม่ได้หยิบจากลิ้นชัก) หรือไม่ — ไม่มีฟิลด์/ค่าอื่น = จ่ายจากลิ้นชัก
  isExpenseOutsideDrawer(e) {
    return !!e && e.paidFrom === 'other';
  }

  // ── หน้าปิดกะ: เงินส่วนต่างของบิลที่ถูกแก้ + ข้อมูลที่นับไม่ได้ (ข้อ 16) ─────────────────
  // ไม่บล็อกการปิดกะ (ร้านต้องปิดได้เสมอ) แต่ต้องเห็นก่อนกดยืนยัน และติดไปกับประวัติกะ
  renderClosingMoneyNotes(calc) {
    const baht = v => `฿${Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    const adjRow = document.getElementById('closing-expected-adjust-row');
    const adjEl = document.getElementById('closing-expected-adjust');
    const adj = Number(calc.cashAdjustTotal) || 0;
    if (adjRow) adjRow.style.display = (calc.cashAdjustments.length || adj !== 0) ? 'flex' : 'none';
    if (adjEl) adjEl.innerText = `${adj < 0 ? '-' : '+'}${baht(adj)}`;
    const box = document.getElementById('closing-money-notes');
    if (!box) return;
    const lines = [];
    const un = calc.unsettledAdjustments || [];
    if (un.length) {
      lines.push(`<b>บิลที่แก้ยอด/ช่องทางหลังรับเงิน แต่ยังไม่บันทึกว่าคืน/เก็บเงินจริงหรือไม่: ${un.length} ใบ</b> ` +
        '— ยอดที่ควรมีด้านบนนับตามเงินที่รับจริงตอนขาย (ยังไม่ได้หักคืน/บวกเก็บเพิ่มให้เอง)');
      un.slice(0, 5).forEach(u => lines.push(`• ${escapeHtml(u.billId)}: ` +
        (u.invalid ? 'ข้อมูลรับเงินของบิลเสีย — ต้องตรวจเอง' : escapeHtml(this.describeMoneyDiffs(u.diffs)))));
      if (un.length > 5) lines.push(`• และอีก ${un.length - 5} ใบ (ดูที่หน้ารายงาน → แก้ไขบิล)`);
      lines.push('เจ้าของร้านหรือผู้จัดการบันทึกได้ที่หน้ารายงาน → แก้ไขบิล → ส่วน "เงินที่รับจริงของบิลนี้"');
    }
    if (calc.invalidBills && calc.invalidBills.length) {
      lines.push(`<b>⚠️ บิล ${calc.invalidBills.length} ใบในกะนี้ข้อมูลรับเงินเสีย — ไม่ได้นับในยอดที่ควรมี</b> (${escapeHtml(calc.invalidBills.slice(0, 3).join(', '))}${calc.invalidBills.length > 3 ? ', …' : ''})`);
    }
    const unknownVoids = (calc.cashAdjustments || []).filter(a => a && a.kind === 'void-unknown' && !a.reversedByVoid);
    if (unknownVoids.length) {
      lines.push(`<b>บิลที่ยกเลิกตามสถานะบนชีต ${unknownVoids.length} ใบ — ยังไม่ระบุว่าคืนเงินหรือไม่</b> ` +
        '(เงินสดของบิลเหล่านี้ยังนับอยู่ในยอดที่ควรมี — ถ้าคืนเงินไปแล้วจริง ลิ้นชักจะขาดเท่ายอดนั้น)');
    }
    if (Number(calc.overspend) > 0) {
      lines.push(`<b>ค่าใช้จ่ายที่จ่ายจากลิ้นชักมากกว่าเงินในลิ้นชัก ${baht(calc.overspend)} — ระบบนับเป็นเงินขาด</b> ` +
        '(ถ้ารายการไหนจ่ายด้วยเงินโอน/เงินเจ้าของจริง ให้ลบรายการนั้นแล้วลงใหม่เป็น "จ่ายทางอื่น" ก่อนปิดกะ)');
    }
    if (calc.invalidAdjustments) lines.push(`<b>⚠️ รายการคืน/เก็บเงินของกะนี้เสีย ${calc.invalidAdjustments} รายการ — ไม่ได้นับ</b>`);
    if (calc.invalidExpenses) lines.push(`<b>⚠️ ค่าใช้จ่ายของกะนี้จำนวนเงินเสีย ${calc.invalidExpenses} รายการ — ไม่ได้นับ</b>`);
    box.style.display = lines.length ? 'block' : 'none';
    box.innerHTML = lines.map(l => `<div style="margin:2px 0;">${l}</div>`).join('');
  }
  async confirmCashCount() {
    const btnConfirm = document.getElementById('btn-confirm-cash-counter');
    if (btnConfirm) btnConfirm.disabled = true;

    try {
      // clamp ชุดเดียวกับตอนแสดงผล — ยอดที่เห็นกับที่บันทึกตรงกันเสมอ
      // ⚠️ หาช่องนับไม่เจอ = โยนให้ catch ข้างล่างแจ้งเตือน ห้ามบันทึกกะด้วยยอด 0 เด็ดขาด
      const drawer = this.readCashDrawer();
      const total = drawer.total;
      const details = drawer.details;
      const mode = this.cashCounterMode;
      
      if (mode === 'open') {
        // ด่านสิทธิ์อยู่ที่ตัวบันทึก ไม่ใช่แค่ที่ปุ่ม
        if (!this.authorize('shift.open', 'เปิดกะ')) { if (btnConfirm) btnConfirm.disabled = false; return; }
        const opened = await this.withMutation('การเปิดกะ', async () => {
          // ⚠️ มีกะเปิดอยู่แล้ว = ห้ามเปิดทับ (กดยืนยันซ้ำ/สองหน้าต่าง) — เดิมเปิดทับได้
          // แล้วค่าใช้จ่ายของกะเดิมหาย + เวลาเริ่มกะเลื่อน ทำให้ยอดเงินสดก่อนหน้านั้นหลุดจากการนับลิ้นชัก
          if (this.state.shift && this.state.shift.active) {
            this.showToast('มีกะที่เปิดอยู่แล้ว — ไม่เปิดซ้ำ', 'warning');
            return false;
          }
          // เปิดกะใหม่
          const previousShift = this.cloneForRollback(this.state.shift);
          this.state.shift = {
            active: true,
            startTime: Date.now(),
            startCash: total,
            startDetails: details,
            expenses: [],
            history: (this.state.shift && this.state.shift.history) || [],
            openedBy: this.currentUser ? this.currentUser.name : ''
          };
          
          try {
            await this.saveStateOrThrow('การเปิดกะ');
          } catch (saveErr) {
            this.state.shift = previousShift;
            throw saveErr;
          }
          return true;
        });
        if (!opened) { if (btnConfirm) btnConfirm.disabled = false; return; }
        this.closeModal('modal-cash-counter');
        this.renderAll();
        this.vibrateDevice(100);
        
        // บอกด้วยว่ากะนี้นับเป็นยอดของวันไหน — กะที่เปิดหลังร้านปิด (03:00–06:00) = วันใหม่
        let dayNote = '';
        try {
          const anchor = this.shiftAnchorTime(this.state.shift);
          if (anchor) dayNote = ` · นับเป็นยอดของวันที่ ${new Date(this.getBusinessTime(anchor)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } catch (e) { dayNote = ''; }
        this.showToast(`เปิดกะเรียบร้อยแล้วด้วยเงินสดเริ่มต้น ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}${dayNote}`, 'info', 5000);
      } else if (mode === 'close') {
        if (!this.authorize('shift.close', 'ปิดกะ/ปิดร้าน')) { if (btnConfirm) btnConfirm.disabled = false; return; }
        if (!await this.confirmPinStepUp('การปิดกะ')) { if (btnConfirm) btnConfirm.disabled = false; return; }   // ข้อ 8
        const closedLog = await this.withMutation('การปิดกะ', async () => {
          // ปิดกะ
          const startTime = this.state.shift.startTime;
          // Guard ชั้นสุดท้าย — ถ้าหลุดมาถึงตรงนี้โดยไม่มีกะเปิดอยู่ ห้ามบันทึกประวัติกะปลอมเด็ดขาด
          if (!this.state.shift.active || !startTime) {
            this.showToast('ไม่พบข้อมูลกะที่เปิดอยู่ — ยกเลิกการปิดกะ', 'error');
            this.closeModal('modal-cash-counter');
            return null;
          }
          const startCash = this.state.shift.startCash || 0;
          const drawerCalc = this.computeShiftDrawer(this.state.shift);
          const cashSales = drawerCalc.cashSales;
          const expensesTotal = drawerCalc.expensesTotal;
          const expectedTotal = drawerCalc.expected;
          const diff = this.drawerDifference(drawerCalc, total);
          
          // เก็บสถานะเดิมไว้ก่อน เพราะการปิดกะเปลี่ยนหลายส่วนพร้อมกัน
          // หากเขียน IndexedDB ไม่สำเร็จ ต้องกลับมาเป็น "กะยังเปิด" ทั้งก้อน
          const closeRollback = {
            shift: this.cloneForRollback(this.state.shift),
            cart: this.cloneForRollback(this.state.cart),
            queue: this.cloneForRollback(this.state.queue),
            cloudOutbox: this.cloneForRollback(this.state.cloudOutbox || [])
          };

          let shiftLog;
          try {
          // บันทึกประวัติกะ
          shiftLog = {
            startTime: startTime,
            endTime: Date.now(),
            startCash: startCash,
            startDetails: this.state.shift.startDetails,
            countedCash: total,
            countedDetails: details,
            expectedCash: expectedTotal,
            cashSales: cashSales,
            expenses: this.state.shift.expenses || [],
            expensesTotal: expensesTotal,             // ค่าใช้จ่ายทั้งหมดของกะ (ทุกช่องทาง)
            drawerExpensesTotal: drawerCalc.drawerExpensesTotal,   // เฉพาะที่จ่ายจากลิ้นชัก (ใช้คิดยอดที่ควรมี)
            difference: diff,
            closedBy: this.currentUser ? this.currentUser.name : ''
          };
          if (drawerCalc.otherExpensesTotal > 0) shiftLog.otherExpensesTotal = drawerCalc.otherExpensesTotal;
          // ค่าใช้จ่ายจากลิ้นชักเกินเงินที่มี — นับรวมในผลต่างเป็นเงินขาดแล้ว เก็บตัวเลขแยกไว้ให้ตรวจย้อนหลังได้
          if (drawerCalc.overspend > 0) shiftLog.overspend = drawerCalc.overspend;
          // ข้อ 16: เงินคืน/เก็บเพิ่มที่เกิดจริงในกะนี้ + บิลที่ยังค้างส่วนต่าง ติดไปกับประวัติกะ (ตรวจย้อนหลังได้)
          if (drawerCalc.cashAdjustments.length) {
            shiftLog.cashAdjustments = drawerCalc.cashAdjustments;
            shiftLog.cashAdjustTotal = drawerCalc.cashAdjustTotal;
          }
          if (drawerCalc.unsettledAdjustments.length) {
            shiftLog.unsettledCount = drawerCalc.unsettledAdjustments.length;
            shiftLog.unsettledAdjustments = drawerCalc.unsettledAdjustments.slice(0, 50);
          }
          if (drawerCalc.invalidBills.length) shiftLog.invalidBills = drawerCalc.invalidBills.slice(0, 50);
          if (drawerCalc.invalidAdjustments) shiftLog.invalidAdjustments = drawerCalc.invalidAdjustments;
          if (drawerCalc.invalidExpenses) shiftLog.invalidExpenses = drawerCalc.invalidExpenses;
          
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
          delete this.state.shift.cashAdjustments;
          delete this.state.shift.openedBy;
          
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
          return shiftLog;
        });
        if (!closedLog) { if (btnConfirm) btnConfirm.disabled = false; return; }

        // ── งานเน็ตทั้งหมดอยู่นอกคิวงานบันทึก (ขายต่อได้ระหว่างรอ) ────────────
        // สรุป/Telegram/สำรองข้อมูลขึ้น Drive อยู่ในคิวงานคลาวด์ที่บันทึกพร้อมการปิดกะแล้ว
        // ออนไลน์อยู่ก็ส่งทันที · ล้มเหลว/ออฟไลน์ = ค้างในคิวแล้วลองใหม่เอง (มีตัวปลุก)
        this.flushCloudOutbox();

        this.closeModal('modal-cash-counter');
        this.renderAll();
        this.vibrateDevice(150);
        
        this.showToast('ปิดร้านเรียบร้อยแล้ว! ข้อมูลคิวงานและตะกร้าของกะที่ผ่านมาได้รับการรีเซ็ตเพื่อเตรียมพร้อมสำหรับกะใหม่', 'info');
        // ไฟล์สำรอง/สรุปของกะนี้จะไม่ถูกส่ง (เครื่องไม่ใช่เครื่องหลัก) — ต้องบอกคนที่ปิดกะตอนนี้เลย
        if (this.hasCloudSyncConfig() && this.isPrimaryBlocked()) {
          this.showToast('ปิดกะแล้ว แต่' + this.primaryPausedMessage(), 'warning', 15000);
        }
        
        // ⚠️ ไม่เด้งหน้าต่างเปิดกะใหม่ทันทีแล้ว (ข้อ 3 รอบตรวจ 26 ก.ย. 2569)
        // เดิมปิดกะตี 3 แล้วหน้าต่างเปิดกะเด้งค้าง → คนนับเงินเปิดกะตอนนั้นเลย กะของพรุ่งนี้ทั้งวันไปลงวันเมื่อวาน
        // ตอนนี้เปิดกะเมื่อมีคนจะขายครั้งแรก (ล็อกอิน / กดชำระเงิน / เข้าหน้าขาย) — ร้านเปิดกะ 10:00
        setTimeout(() => {
          this.showToast('ปิดกะแล้ว — เปิดกะใหม่ตอนเริ่มขายรอบถัดไป (ระบบจะให้นับเงินตั้งต้นตอนนั้น)', 'info', 6000);
        }, 600);
      } else {
        this.showToast('ไม่รู้ว่ากำลังเปิดหรือปิดกะ — ปิดหน้าต่างแล้วเปิดใหม่', 'warning');
        if (btnConfirm) btnConfirm.disabled = false;
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

  // ── กันกดบันทึกซ้ำ (รอบตรวจ 5 ข้อ 4 · 2 ต.ค. 2569) ─────────────────────────────────────
  // เดิมไม่มีด่าน — แตะปุ่มสองทีเร็ว ๆ ตอนเครื่องบันทึกช้า (ข้อมูลร้านใหญ่ขึ้นทุกเดือน) ได้ค่าใช้จ่ายสองรายการ
  // = ยอดที่ควรมีในลิ้นชักลดสองเท่า → ปิดกะขึ้น "เงินเกิน" หาที่มาไม่ได้ · กำไรในสรุปต่ำกว่าจริง
  // กันเฉพาะ "รายการหน้าตาเดียวกันที่ยังบันทึกไม่จบ" — ฟอร์มไม่ถูกล้างจนกว่าจะบันทึกเสร็จ แตะซ้ำจึงได้ค่าเดิมทุกช่อง
  // ⚠️ ห้ามกันทุกคำสั่งที่ซ้อน: ระหว่างรายการแรกรอคิวบันทึก ผู้ใช้พิมพ์รายการถัดไป (คนละยอด/คนละรายละเอียด)
  //    แล้วกดบันทึกได้ตามเดิม (ดูคอมเมนต์ "อ่านค่าจากหน้าจอตอนกด" ข้างล่าง) — กันเหมารวม = รายการที่สองหายเงียบ ๆ
  async addExpense(event) {
    if (event) event.preventDefault();
    const sig = this.expenseFormSignature();
    if (!this._expenseInFlight) this._expenseInFlight = new Set();
    if (sig && this._expenseInFlight.has(sig)) {
      this.showToast('รายการนี้กำลังบันทึกอยู่ — ไม่ต้องกดซ้ำ', 'info');
      return;
    }
    if (sig) this._expenseInFlight.add(sig);
    try {
      return await this._addExpenseUnguarded();
    } finally {
      if (sig) this._expenseInFlight.delete(sig);
    }
  }

  // ค่าทุกช่องในฟอร์มค่าใช้จ่าย "ตอนกด" — ค่าเดียวกันทุกช่อง = กดซ้ำรายการเดิม
  expenseFormSignature() {
    if (typeof document === 'undefined' || !document.getElementById) return '';
    const v = id => {
      const el = document.getElementById(id);
      return el && el.value !== undefined && el.value !== null ? String(el.value).trim() : '';
    };
    return [v('expense-type'), v('expense-amount'), v('expense-source') || 'drawer', v('expense-staff-id'), v('expense-note')].join('\u0001');
  }

  async _addExpenseUnguarded() {
    if (!this.authorize('expense.add', 'บันทึกค่าใช้จ่าย')) return;
    if (!this.state.shift.active) {
      this.showToast('กรุณาเปิดกะลิ้นชักเงินสดก่อนบันทึกค่าใช้จ่าย!', 'info');
      return;
    }
    
    // อ่านค่าจากหน้าจอ "ตอนกด" — งานบันทึกอาจต้องรอคิว ห้ามไปอ่านช่องกรอกทีหลัง
    // (ระหว่างรอ ผู้ใช้อาจพิมพ์รายการถัดไปแล้ว จะได้ยอดของอีกรายการมาบันทึกแทน)
    const type = document.getElementById('expense-type').value;
    const amountInput = document.getElementById('expense-amount');
    // ค่าดิบในช่องตอนกด — ตอนบันทึกเสร็จใช้ตัดสินว่าฟอร์มยังเป็นรายการนี้อยู่ไหม (ดูการล้างฟอร์มท้ายฟังก์ชัน)
    const noteElAtClick = document.getElementById('expense-note');
    const rawAtClick = { amount: String(amountInput.value), note: noteElAtClick ? String(noteElAtClick.value) : '' };
    // กติกาตัวเลข: ค่าใช้จ่ายเป็นจำนวนเต็มบาทเท่านั้น
    const amount = parseWholeNumberInput(amountInput.value, 0);
    if (amount === null) {
      this.showToast('ค่าใช้จ่ายต้องเป็นจำนวนเต็มบาท (ไม่มีทศนิยม)', 'warning');
      return;
    }
    if (amount <= 0) {
      this.showToast('กรุณาระบุจำนวนเงินที่ถูกต้อง!', 'info');
      return;
    }
    
    // จ่ายจากไหน (เจ้าของสั่ง 24 ก.ย. 2569) — ค่าเริ่มต้น = ลิ้นชัก · หาช่องไม่เจอ = ลิ้นชัก (กติกาเดิมของระบบ)
    const sourceEl = document.getElementById('expense-source');
    const sourceRaw = sourceEl ? String(sourceEl.value || 'drawer') : 'drawer';
    if (!['drawer', 'other'].includes(sourceRaw)) {
      this.showToast('เลือกให้ถูกว่าค่าใช้จ่ายนี้จ่ายจากลิ้นชักหรือจ่ายทางอื่น', 'warning');
      return;
    }
    const paidFrom = sourceRaw;

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
    
    // เพดานค่าใช้จ่ายจากลิ้นชัก — ถามก่อนเข้าคิวงานบันทึก (การรอคนใส่ PIN ต้องไม่ขวางงานอื่น)
    let approval = null;
    if (paidFrom === 'drawer') {
      const need = this.expenseApprovalNeeded(amount);
      if (need) {
        approval = await this.approveDrawerExpense(amount, need);
        if (!approval) return;
      }
    }

    const expenseItem = {
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: type,
      amount: amount,
      note: note,
      time: Date.now(),
      // ⚠️ ต้องรู้ว่าใครเพิ่ม — ค่าใช้จ่ายทุกบาททำให้ "เงินที่ควรมีในลิ้นชัก" ลดลงหนึ่งบาท
      // ใครหยิบเงินออกแล้วกดเพิ่มค่าใช้จ่ายเท่ากัน ลิ้นชักจะลงตัวพอดีโดยไม่มีอะไรผิดปกติให้เห็น
      // การปิดกะเก็บ closedBy · การยกเลิกบิลเก็บ by · ตรงนี้เดิมไม่เก็บอะไรเลย
      by: this.currentUser ? this.currentUser.name : '',
      // รหัสบัญชีของคนลง — ชื่อซ้ำกันได้ จึงใช้รหัสตัดสินว่า "เป็นรายการของตัวเอง" (สิทธิ์ลบ · รอบตรวจ 4 ข้อ A5)
      byId: this.currentUser && this.currentUser.id ? String(this.currentUser.id) : '',
      // 'drawer' = หยิบเงินจากลิ้นชัก (หักจากยอดที่ควรมีตอนปิดกะ) · 'other' = โอน/เงินเจ้าของ (ไม่หักลิ้นชัก)
      paidFrom
    };
    if (approval) { expenseItem.approvedBy = approval.name; expenseItem.approvedById = approval.id; }

    const saved = await this.withMutation('ค่าใช้จ่าย', async () => {
      // กะอาจถูกปิดระหว่างรอคิว — ค่าใช้จ่ายต้องลงกะที่เปิดอยู่จริงเท่านั้น
      if (!this.state.shift || !this.state.shift.active) {
        this.showToast('กะถูกปิดไปแล้ว — ค่าใช้จ่ายรายการนี้ยังไม่ถูกบันทึก', 'warning', 6000);
        return false;
      }
      if (!this.state.shift.expenses) {
        this.state.shift.expenses = [];
      }
      // ── ตรวจเพดานซ้ำ ณ จุดบันทึกจริง (รอบตรวจ 6 ข้อ 4 · 2 ต.ค. 2569) ──────────────────────
      // ⚠️ ด่านข้างบนตรวจ "ก่อนเข้าคิว" — ถ้าคิวงานบันทึกติดงานอื่นอยู่ (เช่นผลซิงก์หลังขายบนเครื่องที่ข้อมูลเยอะ)
      //    แล้วกดบันทึกสองรายการ (คนละยอด) ติดกัน รายการที่สองตรวจกับยอดที่ยังไม่มีรายการแรก (ยังรอคิวอยู่)
      //    ทั้งสองรายการจึงผ่านโดยไม่มีใครอนุมัติ (250 → +40 +45 = 335)
      // ในคิวถามอนุมัติไม่ได้ (การรอคนใส่ PIN ห้ามขวางงานอื่น) → ไม่บันทึก · ค่าในฟอร์มยังอยู่
      // กดบันทึกอีกครั้ง ด่านข้างบนจะเห็นยอดล่าสุดแล้วถามอนุมัติเองตามปกติ
      if (paidFrom === 'drawer' && !approval && this.expenseApprovalNeeded(amount)) {
        this.showToast('ยอดค่าใช้จ่ายจากลิ้นชักของคุณในกะนี้เกินเพดานแล้ว (รวมรายการที่เพิ่งบันทึก) — ' +
          'รายการนี้ยังไม่ถูกบันทึก กดบันทึกอีกครั้งเพื่อขออนุมัติ', 'warning', 7000);
        return false;
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
        return false;
      }
      return true;
    });
    if (!saved) return;

    // ล้างฟอร์มเฉพาะเมื่อบันทึกลงเครื่องสำเร็จแล้วเท่านั้น
    // และเฉพาะถ้ายอด "และ" รายละเอียดยังเป็นค่าที่บันทึกไป — ผู้ใช้อาจเริ่มพิมพ์/กดรายการถัดไปแล้วระหว่างรอ
    // (รอบตรวจ 6 ข้อ 4: เดิมเทียบแค่ยอดแล้วล้างช่องรายละเอียดทิ้งเสมอ — รายการถัดไปที่ถูกปฏิเสธเพราะเกินเพดาน
    //  เหลือแต่ยอด พอกดบันทึกอีกครั้งตามที่ข้อความบอก รายละเอียดที่พิมพ์ไว้หาย กลายเป็น "ค่าใช้จ่ายอื่นๆ")
    const noteInput = document.getElementById('expense-note');
    const noteNow = noteInput ? String(noteInput.value) : '';
    if (amountInput && String(amountInput.value) === rawAtClick.amount && noteNow === rawAtClick.note) {
      amountInput.value = '';
      if (noteInput) noteInput.value = '';
    }
    // กลับไปค่าเริ่มต้นทุกครั้ง — กัน "จ่ายทางอื่น" ค้างไปติดรายการถัดไปที่จ่ายจากลิ้นชักจริง
    if (sourceEl) sourceEl.value = 'drawer';
    if (approval) this.showToast(`บันทึกค่าใช้จ่าย ฿${amount.toLocaleString('th-TH')} แล้ว — อนุมัติโดย ${approval.name}`, 'success', 5000);

    this.renderDashboard();
    this.vibrateDevice(50);
  }

  // ── เพดานค่าใช้จ่ายจากลิ้นชัก (รอบตรวจ 4 ข้อ A5) ─────────────────────────────────
  // รายการนี้ "เป็นของคนที่ล็อกอินอยู่" ไหม — ตัดสินด้วยรหัสบัญชี (byId)
  // loose = ยอมเทียบชื่อสำหรับรายการเก่าที่ไม่มี byId (ใช้นับเพดานเท่านั้น — ห้ามใช้ให้สิทธิ์ลบ เพราะชื่อซ้ำกันได้)
  isExpenseMine(e, loose) {
    const me = this.currentUser;
    if (!e || !me) return false;
    if (e.byId) return !!me.id && String(e.byId) === String(me.id);
    return !!loose && !!e.by && e.by === me.name;
  }
  // ต้องขออนุมัติไหม — คืน null = ไม่ต้อง · { mine, total } = ยอดเดิมของคนนี้ในกะ / ยอดรวมเมื่อเพิ่มรายการนี้
  // เจ้าของไม่ต้อง (ถูกตัดออกจากระบบเมื่อไม่แตะจอ 5 นาทีอยู่แล้ว) · รายการที่มีคนอนุมัติแล้วไม่นับซ้ำ
  expenseApprovalNeeded(amount) {
    if (this.currentRole === 'owner') return null;
    const list = (this.state.shift && Array.isArray(this.state.shift.expenses)) ? this.state.shift.expenses : [];
    const mine = list
      .filter(e => e && !this.isExpenseOutsideDrawer(e) && !e.approvedBy && this.isExpenseMine(e, true))
      .reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const total = mine + (Number(amount) || 0);
    return total > EXPENSE_DRAWER_FREE_LIMIT ? { mine, total } : null;
  }
  // ขออนุมัติ — ผู้จัดการ: ใส่ PIN ตัวเองซ้ำ · พนักงาน: ผู้จัดการ/เจ้าของใส่ PIN ให้
  // คืน { id, name } ของผู้อนุมัติ หรือ null (ไม่อนุมัติ = ไม่บันทึก)
  async approveDrawerExpense(amount, need) {
    const baht = v => '฿' + (Number(v) || 0).toLocaleString('th-TH');
    const why = `ค่าใช้จ่ายจากลิ้นชัก ${baht(amount)} (รวมที่ลงในกะนี้ ${baht(need.total)} เกินเพดาน ${baht(EXPENSE_DRAWER_FREE_LIMIT)})`;
    if (this.currentRole === 'manager') {
      if (!await this.confirmPinStepUp(why)) return null;
      return this.currentUser ? { id: String(this.currentUser.id || ''), name: this.currentUser.name || '' } : null;
    }
    return this.requestManagerApproval(why);
  }
  // ให้ผู้จัดการ/เจ้าของ "อนุมัติ" รายการของคนที่ล็อกอินอยู่ ด้วย PIN ของตัวเอง
  // PIN ที่ใส่ถูกเทียบกับทุกบัญชีสิทธิ์ผู้จัดการขึ้นไป (ไม่ต้องเลือกชื่อก่อน — หน้างานเร็วกว่า)
  // ⚠️ ไม่ยอม: PIN เจ้าของที่ยังเป็นค่าเริ่มต้น (อยู่ในคู่มือสาธารณะ) · PIN ผู้จัดการที่ยังไม่ถึง 6 หลัก · อนุมัติตัวเอง
  // ตัวนับ PIN ผิดอยู่ช่องแยก (APPROVAL_GUARD_KEY) — กดผิดครบแล้วล็อกเฉพาะการอนุมัติ ไม่ล็อกบัญชีใคร
  async requestManagerApproval(why) {
    const waitSec = this.loginGuardWaitSec(APPROVAL_GUARD_KEY);
    if (waitSec > 0) {
      this.showToast(`ใส่ PIN อนุมัติผิดหลายครั้ง — รออีก ${this.formatWait(waitSec)} แล้วลองใหม่ (รายการนี้ยังไม่ถูกบันทึก)`, 'error', 6000);
      return null;
    }
    const pin = await this.askSecret(`${why} — ให้ผู้จัดการหรือเจ้าของร้านใส่ PIN เพื่ออนุมัติ`);
    if (pin === null || pin === '') {
      this.showToast('ยังไม่ได้อนุมัติ — ค่าใช้จ่ายรายการนี้ยังไม่ถูกบันทึก', 'warning', 5000);
      return null;
    }
    const hash = await this.hashPin(pin);
    const meId = this.currentUser ? this.currentUser.id : null;
    let who = null;
    if (hash === this.ownerPin && meId !== '__owner__' && !(await this.isDefaultOwnerPin())) {
      who = { id: '__owner__', name: 'เจ้าของร้าน' };
    } else {
      const st = (this.state.staff || []).find(s => s && s.pin && s.pin === hash &&
        PRIVILEGED_LEVELS.includes(s.accessLevel) && s.id !== meId);
      if (st) who = { id: String(st.id), name: st.name || '' };
    }
    if (who && !STRONG_PIN_RE.test(pin)) {
      this.showToast(`PIN ของ ${who.name} ยังไม่ถึง 6 หลัก — ต้องเข้าสู่ระบบเพื่อตั้ง PIN ใหม่ก่อน จึงจะอนุมัติได้`, 'warning', 7000);
      return null;
    }
    if (!who) {
      const lockSec = this.loginGuardFail(APPROVAL_GUARD_KEY);
      this.showToast(lockSec > 0
        ? `PIN อนุมัติไม่ถูกต้อง — พักการอนุมัติ ${this.formatWait(lockSec)} (รายการนี้ยังไม่ถูกบันทึก)`
        : 'PIN อนุมัติไม่ถูกต้อง — ค่าใช้จ่ายรายการนี้ยังไม่ถูกบันทึก', 'error', 6000);
      return null;
    }
    this.loginGuardReset(APPROVAL_GUARD_KEY);
    return who;
  }
  // ใครลบค่าใช้จ่ายรายการนี้ได้ (เจ้าของเลือก 26 ก.ย. 2569)
  //   เจ้าของ → ทุกรายการ · ผู้จัดการ → ทุกรายการ (ของคนอื่นต้องใส่ PIN ตัวเองซ้ำ)
  //   พนักงาน → เฉพาะรายการที่ตัวเองลง (ดูจากรหัสบัญชี) · รายการเก่าที่ไม่มีรหัสบัญชี = ลบไม่ได้
  // คืน 'ok' · 'stepup' (ผู้จัดการลบของคนอื่น) · 'deny'
  expenseDeleteRule(e) {
    if (!e) return 'deny';
    const own = this.isExpenseMine(e, false);
    if (this.currentRole === 'owner') return 'ok';
    if (this.currentRole === 'manager') return own ? 'ok' : 'stepup';
    if (this.currentRole === 'staff') return own ? 'ok' : 'deny';
    return 'deny';
  }
  deleteExpense(expenseId) {
    if (!this.authorize('expense.delete', 'ลบค่าใช้จ่าย')) return;
    const denyMsg = 'พนักงานลบได้เฉพาะค่าใช้จ่ายที่ตัวเองลง — ให้ผู้จัดการหรือเจ้าของร้านเป็นคนลบ';
    const found = (this.state.shift && Array.isArray(this.state.shift.expenses))
      ? this.state.shift.expenses.find(e => e && e.id === expenseId) : null;
    const rule = found ? this.expenseDeleteRule(found) : 'ok';   // หาไม่เจอ = ปล่อยให้ตัวลบจริงจบเงียบตามเดิม
    if (rule === 'deny') { this.showToast(denyMsg, 'warning', 6000); return; }
    const go = () => this.showConfirm('คุณต้องการลบรายการค่าใช้จ่ายนี้ใช่หรือไม่?', () => this.withMutation('การลบค่าใช้จ่าย', async () => {
      if (!this.authorize('expense.delete', 'ลบค่าใช้จ่าย')) return;
      if (!this.state.shift || !this.state.shift.expenses) return;
      const target = this.state.shift.expenses.find(e => e.id === expenseId);
      if (!target) return;
      // ระหว่างกล่องยืนยันค้างอยู่ อาจสลับผู้ใช้ — ตรวจซ้ำ ณ จุดเขียนจริง (ผู้จัดการผ่านการใส่ PIN มาแล้วด้านนอก)
      if (this.expenseDeleteRule(target) === 'deny') { this.showToast(denyMsg, 'warning', 6000); return; }

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
        paidFrom: this.isExpenseOutsideDrawer(target) ? 'other' : 'drawer',
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
    }));
    // ผู้จัดการลบรายการของคนอื่น = ใส่ PIN ตัวเองซ้ำก่อน (แบบเดียวกับยกเลิกบิล)
    if (rule === 'stepup') {
      return this.confirmPinStepUp('การลบค่าใช้จ่ายที่คนอื่นลง').then(ok => (ok ? go() : undefined));
    }
    return go();
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
    // ธีมเป็นค่าของเครื่อง ไม่ใช่ข้อมูลร้าน — เขียนเฉพาะคีย์นี้ ผ่านคิวงานบันทึก
    // (เดิมเรียก saveState() เปล่า ๆ แบบไม่รอ = เขียนข้อมูลทั้งร้านแทรกกลางงานอื่นที่กำลังบันทึกอยู่)
    const theme = this.theme;
    this.withMutation('ธีม', () => this.saveKeys([{ key: 'theme', value: theme }]))
      .catch(err => console.warn('save theme failed', err));
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
    if (!this.authorize('settings.write', 'เปลี่ยนโลโก้ร้าน')) return;
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
          const dataUrl = canvas.toDataURL('image/png');
          await this.withMutation('โลโก้ร้าน', async () => {
            if (!this.authorize('settings.write', 'เปลี่ยนโลโก้ร้าน')) return;
            const prevLogo = this.shopLogo;
            this.shopLogo = dataUrl;
            if (!await this.persistOrRollback('โลโก้ร้าน', () => { this.shopLogo = prevLogo; })) {
              this.applyShopName(); this.updateLogoPreview(); return;
            }
            this.applyShopName();
            this.updateLogoPreview();
            this.showToast('อัปเดตโลโก้ร้านเรียบร้อยแล้ว', 'success');
          });
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
    if (!this.authorize('settings.write', 'ลบโลโก้ร้าน')) return;
    return this.withMutation('การลบโลโก้', async () => {
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
    });
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
            this._swReg = reg;
            // ถ้ามีเวอร์ชันใหม่ "รอ" อยู่แล้วตั้งแต่เปิดแอป (ติดตั้งไว้รอบก่อนแต่ยังไม่กดอัปเดต) → แจ้งเลย
            if (reg.waiting && navigator.serviceWorker.controller) {
              this.promptAppUpdate(reg.waiting);
            }
            // ตรวจเจอเวอร์ชันใหม่ระหว่างใช้งาน → โชว์ปุ่ม "อัปเดตเลย"
            const watchInstall = (newWorker) => {
              if (!newWorker) return;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  this.promptAppUpdate(newWorker);
                }
              });
            };
            reg.addEventListener('updatefound', () => watchInstall(reg.installing));
            // ตัวใหม่ที่ "กำลังติดตั้งอยู่แล้ว" ตั้งแต่ก่อนเราผูก updatefound (เช็คอัปเดตตอนเปิดแอปแล้วดาวน์โหลดช้า)
            // เดิมไม่มีใครฟัง → ติดตั้งเสร็จแล้วแต่ไม่ขึ้นแถบอัปเดตจนกว่าจะปิด-เปิดแอปอีกรอบ
            if (reg.installing) watchInstall(reg.installing);
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
    // จำตัวใหม่ล่าสุดเสมอ — ถ้ามีรุ่นใหม่กว่าออกมาระหว่างแถบเปิดค้าง ตัวที่จำไว้ก่อนหน้าจะถูกทิ้ง (redundant)
    // เดิมปุ่มยิงไปหาตัวเก่าที่ถูกทิ้งแล้ว → กดแล้วเงียบ ค้างรุ่นเก่าจนกว่าจะปิดแอปทิ้ง
    this._pendingWorker = worker;
    const existing = document.getElementById('app-update-bar');
    if (existing) {
      const b = existing.querySelector('button');
      if (b) { b.disabled = false; b.textContent = 'อัปเดตเลย'; }
      return;
    }
    this._updateBannerShown = true;
    const bar = document.createElement('div');
    bar.id = 'app-update-bar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#fff;border:1px solid #334155;border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,.45);max-width:92vw;font-size:0.85rem;';
    const label = document.createElement('span');
    label.textContent = '🔄 มีเวอร์ชันใหม่ของแอป';
    const btn = document.createElement('button');
    btn.textContent = 'อัปเดตเลย';
    btn.style.cssText = 'background:#fbbf24;color:#1e293b;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;white-space:nowrap;';
    // ยิงไปหาตัวที่ "รออยู่จริงตอนนี้" (reg.waiting) ก่อนเสมอ
    const target = () => (this._swReg && this._swReg.waiting) || this._pendingWorker;
    btn.onclick = () => {
      btn.disabled = true; btn.textContent = 'กำลังอัปเดต...';
      const w = target();
      if (w) w.postMessage({ type: 'SKIP_WAITING' }); // → SW activate → controllerchange → reload เอง
      // กันเงียบ: 5 วิแล้วยังไม่รีโหลด → ตัวที่รออยู่อาจเปลี่ยนไปแล้ว ลองยิงซ้ำ แล้วเปิดปุ่มให้กดใหม่ได้
      setTimeout(() => {
        if (!document.body.contains(bar)) return;
        const again = target();
        if (again && again !== w) again.postMessage({ type: 'SKIP_WAITING' });
        btn.disabled = false; btn.textContent = 'อัปเดตเลย';
      }, 5000);
    };
    const later = document.createElement('button');
    later.textContent = 'ภายหลัง';
    later.style.cssText = 'background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:0.8rem;';
    // กดภายหลัง = ซ่อนแถบนี้ แต่รุ่นใหม่ที่ติดตั้งเสร็จรอบถัดไปต้องแจ้งได้อีก (เดิมเงียบไปทั้งรอบการใช้งาน)
    later.onclick = () => { bar.remove(); this._updateBannerShown = false; };
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
    // ผู้จัดการดูได้เฉพาะวันทำการนี้ — ล็อกช่องวันและบังคับค่าเป็นวันนี้เสมอ
    // (ค่าอาจค้างจากตอนเจ้าของใช้เครื่อง หรือถูกแก้ผ่านทางอื่นที่ไม่ใช่ปุ่ม)
    this.applyReportDateLock();
    this.renderPendingSettleBox();
    const type = this.state.selectedReportType;
    const dateVal = this.reportDateValue();
    const monthVal = document.getElementById('report-month-input').value;

    let filtered = [];

    if (type === 'daily') {
      if (!dateVal) return;
      // กรองตาม "วันทำการ" — เลือกวันที่ 18 ได้ยอดทั้งคืน 10:00 → ตี 3 ของเช้าวันที่ 19
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

    // ── ตัวเลขทุกตัวคิดจาก "บิลที่ข้อมูลเงินเชื่อได้" เท่านั้น — ฐานเดียวกับสรุปที่ส่งขึ้นชีต ──
    // บิลรอตรวจ (ข้อมูลเงินเสีย) ยังโชว์ในตารางรายการ แต่ไม่ถูกนับในยอด และบอกจำนวนไว้ที่ป้าย KPI
    const allInPeriod = filtered;
    const periodSplit = this.summaryBillsOf(allInPeriod);
    filtered = periodSplit.bills;
    const invalidInPeriod = periodSplit.excluded;

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
      totalSales = filtered.reduce((sum, tx) => sum + Math.round((Number(tx.total) || 0) * 100), 0) / 100;
      billCount = filtered.length;
      averageBill = billCount > 0 ? (totalSales / billCount) : 0;
      
      if (labelTotal) labelTotal.innerText = invalidInPeriod > 0 ? `ยอดขายรวม (ไม่รวมบิลรอตรวจ ${invalidInPeriod} ใบ)` : 'ยอดขายรวม';
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
    // ตารางรายการ: ทั้งร้าน = ทุกบิลในงวด (รวมบิลรอตรวจ ให้หาเจอและแก้ได้) · รายพนักงาน = บิลที่มีงานของคนนั้น
    const filteredTransactionsForTable = selectedStaffId === 'all'
      ? allInPeriod.slice()
      : allInPeriod.filter(tx => allowedTxIds.has(tx.id));

    // 2. เรนเดอร์แผนภูมิ CSS Bar Chart
    // กราฟต้องใช้ชุดตัวเลขเดียวกับตัวเลขสรุปด้านบนเสมอ
    //   ทั้งร้าน = บิลที่ใช้ได้ (ไม่รวมบิลรอตรวจ) · รายพนักงาน = ยอดงานของคนนั้น (ไม่ใช่ยอดทั้งบิล)
    // เดิมส่งบิลทั้งใบของตาราง → กราฟพนักงานโชว์ยอดทั้งบิล และนับบิลรอตรวจรวมเข้าไป
    const chartPoints = selectedStaffId === 'all'
      ? filtered.map(tx => ({ date: tx.date, total: Number(tx.total) || 0 }))
      : displayItems.map(it => ({ date: it.txDate, total: Number(it.netPrice) || 0 }));
    this.renderReportsChart(chartPoints, type, dateVal, monthVal);

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
      const money2 = v => (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      // ทั้งร้าน: ใช้ตัวคำนวณเดียวกับสรุปบนชีต (buildServiceBreakdown) — ยอดรายการ "ก่อน VAT" แล้วแยก VAT/ปัดเศษก่อนยอดรับรวม
      // รายพนักงาน: ยอดงานของคนนั้น (ก่อน VAT) — VAT เป็นของทั้งบิล จึงไม่แยกให้รายคน
      const bd = selectedStaffId === 'all' ? this.buildServiceBreakdown(filtered) : null;
      const rowsOut = bd
        ? bd.rows.map(r => Object.assign({}, serviceSales[r.name] || { name: r.name, category: 'ทั่วไป', price: null }, { count: r.count, totalRevenue: r.revenue }))
        : sortedServices;
      if (rowsOut.length === 0) {
        breakdownTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state" style="text-align: center;">
              <i class="fa-solid fa-list-check" style="display:block; margin: 10px 0;"></i> ไม่มีรายการขายในรอบการค้นหา
            </td>
          </tr>`;
      } else {
        const body = rowsOut.map(item => {
          const categoryText = catMap[item.category] || item.category || 'ทั่วไป';
          return `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td><span class="service-category-badge badge-${escapeHtml(item.category || 'general')}">${escapeHtml(categoryText)}</span></td>
              <td>${Number(item.count) || 0} ครั้ง</td>
              <td>${item.price == null ? '—' : '฿' + (Number(item.price) || 0).toLocaleString('th-TH')}</td>
              <td style="font-weight:700; color: var(--accent-massage);">฿${money2(item.totalRevenue)}</td>
            </tr>
          `;
        }).join('');
        const foot = (label, val, strong) => `<tr style="background: rgba(255,255,255,0.03);">
            <td colspan="4" style="text-align:right;${strong ? 'font-weight:700;' : ''}">${label}</td>
            <td style="${strong ? 'font-weight:700;' : ''}">฿${money2(val)}</td></tr>`;
        let footer;
        if (bd) {
          footer = foot('รวมรายการ (ก่อน VAT)', bd.servicesTotal, true) +
            (Math.round(bd.residual * 100) !== 0 ? foot('ปัดเศษรายบรรทัด (บิลรุ่นเก่า)', bd.residual) : '') +
            foot('ภาษีมูลค่าเพิ่ม (VAT)', bd.vatAmount) + foot('เงินปัดเศษ (ปัดขึ้นเต็มบาท)', bd.rounding) +
            foot('ยอดรับรวม', bd.grandTotal, true);
        } else {
          const sumSat = rowsOut.reduce((a, r) => a + Math.round((Number(r.totalRevenue) || 0) * 100), 0);
          footer = foot('รวมงานของพนักงานคนนี้ (ก่อน VAT)', sumSat / 100, true);
        }
        breakdownTableBody.innerHTML = body + footer;
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
        // ข้อ 16: บิลที่ถูกแก้ยอด/ช่องทางหลังรับเงิน และยังไม่มีใครบันทึกว่าคืน/เก็บเงินจริงหรือไม่
        if ((tx.tender !== undefined && tx.tender !== null) || (tx.settlements !== undefined && tx.settlements !== null)) {
          const ms = this.billMoneyStatus(tx);
          if (!ms.settled) {
            displayTotalHTML += `<br><span style="font-size:0.68rem; color:var(--accent-premium); font-weight:normal;">` +
              `${ms.invalid ? 'ข้อมูลรับเงินต้องตรวจ' : 'ส่วนต่างรอบันทึก'}</span>`;
          }
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
            const shDateStr = this.getBusinessISODate(this.shiftAnchorTime(sh));
            return shDateStr === dateVal;
          });
        } else {
          filteredShifts = this.state.shift.history.filter(sh => {
            const shMonthStr = this.getBusinessISOMonth(this.shiftAnchorTime(sh));
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
              <td>฿${(sh.cashSales || 0).toLocaleString('th-TH')}${(Number(sh.cashAdjustTotal) || 0) !== 0
                ? `<br><span style="font-size:0.7rem;color:var(--text-muted);">คืน/เก็บส่วนต่าง ${Number(sh.cashAdjustTotal) > 0 ? '+' : '-'}฿${Math.abs(Number(sh.cashAdjustTotal)).toLocaleString('th-TH')}</span>` : ''}${(Number(sh.unsettledCount) || 0) > 0
                ? `<br><span style="font-size:0.7rem;color:var(--accent-premium);">ค้างบันทึกส่วนต่าง ${Number(sh.unsettledCount)} ใบ</span>` : ''}</td>
              <td style="color: var(--accent-premium);">฿${(expensesTotal || 0).toLocaleString('th-TH')}${(Number(sh.otherExpensesTotal) || 0) > 0
                ? `<br><span style="font-size:0.7rem;color:var(--text-muted);">จ่ายทางอื่น ฿${Number(sh.otherExpensesTotal).toLocaleString('th-TH')} (ไม่หักจากลิ้นชัก)</span>` : ''}</td>
              <td>฿${(sh.expectedCash || 0).toLocaleString('th-TH')}${(Number(sh.overspend) || 0) > 0
                ? `<br><span style="font-size:0.7rem;color:var(--accent-premium);">ค่าใช้จ่ายเกินลิ้นชัก ฿${Number(sh.overspend).toLocaleString('th-TH')} (นับเป็นเงินขาด)</span>` : ''}</td>
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
                           customer: 'ลูกค้า', payment: 'ช่องทางจ่าย', staffNames: 'พนักงาน',
                           settlement: 'บันทึกเงินส่วนต่าง (คืน/เก็บ/แก้บันทึก)' };
      // ข้อ 16: การบันทึกเงินส่วนต่างหลังแก้บิล — คืนเงินจากลิ้นชักคือเงินออกจากร้าน ต้องเห็นว่าใครทำ เท่าไร
      const KIND = { refund: 'คืนเงิน', collect: 'เก็บเพิ่ม', correction: 'แก้บันทึกตอนขาย', waive: 'ไม่มีเงินเคลื่อนไหว' };
      const settleText = (e) => (Array.isArray(e.settlements) ? e.settlements : []).map(x =>
        `${KIND[x.kind] || x.kind} ${PAYMENT_LABELS[x.method] || x.method} ${Number(x.amount) < 0 ? '-' : '+'}${baht(Math.abs(Number(x.amount) || 0))}`).join(' · ');
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
                ${e.kind === 'settlement' ? `<span style="font-weight:normal;color:var(--text-primary);">${escapeHtml(settleText(e))}</span>`
                  : (moneyChanged ? `${baht(b.total)} → ${baht(a2.total)}` : '<span style="font-weight:normal;">ยอดไม่เปลี่ยน</span>')}
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
      // รายวัน: แสดงตามช่วงเวลา 3 ชม. เรียงตาม "วันทำการ" ของร้าน (เปิด 10:00 → ปิดตี 3 · เจ้าของยืนยัน 26 ก.ย. 2569)
      // ช่วงหลังเที่ยงคืนต่อท้ายกราฟ ไม่ใช่ขึ้นต้น · "นอกเวลา" (03:00–09:59) แสดงเฉพาะเมื่อมียอดจริง
      // ⚠️ เดิมถือว่าเปิด 11:00 — ยอด 10:00–10:59 ไปตกแท่ง "ก่อนเปิด" (รอบตรวจ 4 ข้อ A7)
      const hourlyBlocks = this.dailyChartBlocks(transactions);
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
    if (!tx) return;
    if (this.billAccessFor(tx) !== 'full') {
      this.showToast('บิลของวันก่อน — ดูย้อนหลังได้เฉพาะเจ้าของร้าน', 'warning');
      return;
    }
    this.showThermalReceipt(tx);
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
  // ⚠️ ข้อ 17: บิลเก่าที่ไม่มีรายการย่อย "ไม่รู้" ราคารายบรรทัด ผู้ให้บริการรายบรรทัด และค่าคอม
  // เดิมสร้างรายการขึ้นเองจากราคาวันนี้ (ใช้เป็นสัดส่วน) + อัตราค่าคอมวันนี้ (ไม่เจอบริการ = เดา 10%)
  // แล้วบันทึกลงบิลตอนกดบันทึก แม้แค่แก้ชื่อลูกค้า — ค่าคอมในอดีตจึงถูกสร้างจากกติกาปัจจุบันเงียบ ๆ
  // ตอนนี้: คืนรายการ "ไว้แสดงเท่านั้น" (_synthetic) ที่บอกตรง ๆ ว่าไม่ทราบราคา/ค่าคอม และห้ามถูกบันทึกลงบิล
  // (การแก้ส่วนลดของบิลแบบนี้คิดที่ระดับบิลตามสูตรเดิม ราคารวม − ส่วนลด ดู computeEditTotals)
  buildEditableDetails(tx) {
    if (Array.isArray(tx.details) && tx.details.length > 0) {
      return tx.details.map(d => ({ ...d }));   // สำเนาตื้นพอ — ทุกฟิลด์เป็นค่าพื้นฐาน
    }
    const names = Array.isArray(tx.services) ? tx.services.filter(n => typeof n === 'string' || typeof n === 'number') : [];
    const staffNames = Array.isArray(tx.staffNames) ? tx.staffNames.filter(n => typeof n === 'string' && n) : [];
    return names.map(n => ({
      name: String(n),
      price: null, netPrice: null,                       // ไม่ทราบราคารายบรรทัด — บิลเก็บไว้แค่ยอดรวม
      staffId: null,
      staffName: staffNames.length ? staffNames.join(', ') : 'ไม่ระบุ',   // ผู้ให้บริการของทั้งบิล (ไม่รู้ว่าใครทำรายการไหน)
      commission: null, commissionType: null, commissionAmount: null,
      commissionUnknown: true,
      vatable: false,                                    // บิลรุ่นเก่าออกก่อนระบบ VAT — ห้ามติ๊กย้อนหลัง
      _synthetic: true
    }));
  }
  // ── คิดยอดของบิลที่กำลังแก้ไข ────────────────────────────────────────────
  // ใช้ตัวเดียวกันทั้งตอนพรีวิวสด ๆ และตอนกดบันทึก ตัวเลขบนจอกับที่บันทึกจริงจึงตรงกันเสมอ
  computeEditTotals(tx, details, rawDiscount) {
    const sat = v => Math.round(v * 100);
    // ⚠️ เดิม parseFloat(...) || 0 แล้ว clamp ไว้ในช่วง 0..ราคารวมเงียบ ๆ — พิมพ์ผิด/ติดลบ/เกินยอด
    // กลายเป็นส่วนลด 0 หรือเต็มจำนวนโดยไม่มีใครเห็น ตอนนี้ค่าที่ใช้ไม่ได้ = ไม่คิดต่อ และบอกเหตุผล
    // ข้อความจากช่องกรอกต้องเป็นตัวเลขล้วน — กัน "1e2" / "50.0" / " 5 0" ที่ Number() ยอมแปลง
    if (typeof rawDiscount === 'string' && rawDiscount.trim() !== '' && !isWholeNumberText(rawDiscount)) {
      return { ok: false, error: 'ส่วนลดต้องเป็นจำนวนเต็มบาท (ไม่มีทศนิยม)' };
    }
    const disc = this.toFiniteNumber(rawDiscount);
    if (disc === null || disc < 0) return { ok: false, error: 'ส่วนลดต้องเป็นตัวเลขไม่ติดลบ' };
    // กติกาตัวเลข: ส่วนลดต้องเป็นจำนวนเต็มบาท (เดิมยอมถึงสตางค์)
    if (!Number.isInteger(disc)) return { ok: false, error: 'ส่วนลดต้องเป็นจำนวนเต็มบาท (ไม่มีทศนิยม)' };
    const list = (Array.isArray(details) ? details : []).filter(d => d && !d._synthetic);

    if (list.length === 0) {
      // ข้อ 17: บิลไม่มีรายการย่อย — คิดที่ระดับบิลจากราคารวมที่บิลล็อกไว้ ไม่สร้างราคารายบรรทัดขึ้นเอง
      // ทำได้เฉพาะบิลรุ่นก่อน VAT (สูตรเดิม ยอด = ราคารวม − ส่วนลด) — บิลรุ่น VAT ต้องมีรายการเพื่อคิดฐานภาษี
      if (!this.isLegacyBill(tx)) return { ok: false, error: 'บิลนี้ไม่มีรายการย่อยแต่เป็นบิลรุ่นที่มี VAT — คิดฐานภาษีใหม่ไม่ได้ จึงแก้ส่วนลดไม่ได้' };
      const sub = this.legacySubtotalOf(tx);
      if (sub === null) return { ok: false, error: 'ราคารวมของบิลนี้อ่านไม่ได้ — คิดยอดใหม่ไม่ได้' };
      if (sat(disc) > sat(sub)) return { ok: false, error: `ส่วนลดมากกว่าราคารวมของบิล (฿${sub.toLocaleString('th-TH')})` };
      const plain = (sat(sub) - sat(disc)) / 100;
      return {
        ok: true, subtotal: sub, discount: disc, nets: [], legacy: true, noDetails: true,
        totals: { vatRate: 0, nonVatBase: plain, vatableBase: 0, vatAmount: 0, rounding: 0, total: plain }
      };
    }

    // ราคาทุกบรรทัดต้องเป็นยอดเงินจริง — ห้ามแปลงค่าที่อ่านไม่ได้เป็น 0 แล้วคิดยอดทั้งบิลใหม่ต่อ
    const prices = list.map(d => this.toFiniteNumber(d.price));
    if (prices.some(p => p === null || p < 0)) return { ok: false, error: 'ราคารายการในบิลนี้อ่านไม่ได้ — คิดยอดใหม่ไม่ได้' };
    const subtotal = prices.reduce((a, p) => a + sat(p), 0) / 100;
    if (sat(disc) > sat(subtotal)) return { ok: false, error: `ส่วนลดมากกว่าราคารวม (฿${subtotal.toLocaleString('th-TH')})` };
    const discount = disc;
    const nets = this.distributeDiscount(prices, subtotal, discount);

    if (this.isLegacyBill(tx)) {
      // บิลรุ่นเก่า: คิดแบบเดิมเป๊ะ ๆ (ยอด = รวม − ส่วนลด) ไม่ปัดขึ้นเต็มบาท ไม่มี VAT
      const plain = (sat(subtotal) - sat(discount)) / 100;
      return {
        ok: true, subtotal, discount, nets, legacy: true,
        totals: { vatRate: 0, nonVatBase: plain, vatableBase: 0, vatAmount: 0, rounding: 0, total: plain }
      };
    }

    // บิลรุ่นใหม่: คิด VAT ด้วย "อัตราและธง vatable ที่ล็อกไว้ในบิลใบนี้" ไม่ใช่ค่าตั้งค่าปัจจุบัน
    return {
      ok: true, subtotal, discount, nets, legacy: false,
      totals: this.computeTotalsAtRate(
        list.map((d, i) => ({ netPrice: nets[i], vatable: !!d.vatable })),
        Number(tx.vatRate) || 0
      )
    };
  }
  // แบ่งยอดของวันทำการเป็นช่วงเวลาสำหรับกราฟรายวัน — แยกออกมาให้เทสต์ได้โดยไม่ต้องวาดกราฟ
  // ร้านเปิดขาย 10:00–03:00 · 01:00–02:59 เป็นช่วงสุดท้าย (2 ชม.) · 03:00–09:59 = นอกเวลา
  dailyChartBlocks(transactions) {
    const blocks = [
      { label: '10:00-13:00', sum: 0 },
      { label: '13:00-16:00', sum: 0 },
      { label: '16:00-19:00', sum: 0 },
      { label: '19:00-22:00', sum: 0 },
      { label: '22:00-01:00', sum: 0 },
      { label: '01:00-03:00', sum: 0 },
      { label: 'นอกเวลา (03-10)', sum: 0, edge: true }
    ];
    (Array.isArray(transactions) ? transactions : []).forEach(tx => {
      const hour = new Date(tx.date).getHours();
      const amt = Number(tx.total) || 0;
      let i;
      if (hour >= 10 && hour < 13) i = 0;
      else if (hour >= 13 && hour < 16) i = 1;
      else if (hour >= 16 && hour < 19) i = 2;
      else if (hour >= 19 && hour < 22) i = 3;
      else if (hour >= 22 || hour < 1) i = 4;
      else if (hour < 3) i = 5;          // 01:00-02:59
      else i = 6;                        // 03:00-09:59
      blocks[i].sum += amt;
    });
    return blocks;
  }

  // เปิดโมเดลแก้ไขรายการขายย้อนหลัง
  openTransactionEdit(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    const access = this.billAccessFor(tx);
    if (access === 'none') {
      this.showToast('บิลของวันก่อน — ดูย้อนหลังได้เฉพาะเจ้าของร้าน', 'warning');
      return;
    }

    // สร้างร่างแยกจากบิลจริง — ตั้งแต่จุดนี้จนถึงกดบันทึก ห้ามแตะ tx เลย
    const draftDetails = this.buildEditableDetails(tx);
    this._editTxDraft = { txId: tx.id, details: draftDetails };

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-id-display').value = tx.id;
    document.getElementById('edit-tx-customer').value = tx.customerName || '';
    document.getElementById('edit-tx-payment').value = this.paymentMethodOf(tx);
    document.getElementById('edit-tx-discount').value = Number(tx.discount) || 0;
    document.getElementById('edit-tx-total').value = `฿${(Number(tx.total) || 0).toLocaleString('th-TH')}`;
    const hint = document.getElementById('edit-tx-hint');
    if (hint) { hint.innerText = ''; hint.style.display = 'none'; }
    // ช่อง "เงินของบิลนี้" ของการยกเลิกบิล — ต้องเริ่มที่ยังไม่เลือกทุกครั้ง (ห้ามค้างค่าจากบิลใบก่อน)
    const voidSel = document.getElementById('void-money-outcome');
    if (voidSel) voidSel.value = '';
    const voidHint = document.getElementById('void-money-hint');
    if (voidHint) {
      // แยกบิลของกะนี้/กะก่อนด้วยตัวคำนวณเดียวกับตอนยกเลิกจริง (planVoidCash)
      const p = this.planVoidCash(tx, 'none');
      const baht = v => '฿' + Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      voidHint.innerText = p.inShift
        ? (Math.round(p.held * 100) !== 0 ? `บิลนี้มีเงินสด ${baht(p.held)} นับอยู่ในลิ้นชักของกะที่เปิดอยู่` : 'บิลนี้ไม่ได้รับเป็นเงินสด')
        : (Math.round(p.paid * 100) > 0 ? `บิลนี้ขายในกะก่อน · รับเงินสดสุทธิ ${baht(p.paid)}` : 'บิลนี้ขายในกะก่อน · ไม่ได้รับเงินสดสุทธิ');
    }

    const servicesContainer = document.getElementById('edit-tx-services-list');
    const money2 = v => (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const synthetic = draftDetails.length > 0 && draftDetails.every(d => d._synthetic);
    const unknownRate = !synthetic && draftDetails.some(d => !this.lineCommissionRule(d));
    // ข้อ 17: บอกให้ชัดว่าบิลนี้แก้อะไรได้/ไม่ได้ เพราะอะไร — ไม่ให้เจ้าของเข้าใจว่าตัวเลขที่ไม่มีอยู่จริงเป็นข้อมูลจริง
    const note = synthetic
      ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:4px;">บิลรุ่นเก่านี้ไม่มีรายละเอียดรายบรรทัด — ` +
        `ไม่ทราบราคาแยกรายการ ผู้ให้บริการรายบรรทัด และค่าคอม (ระบบไม่คิดให้จากราคา/อัตราปัจจุบัน) · ` +
        `แก้ได้: ชื่อลูกค้า ช่องทางชำระ` + (this.isLegacyBill(tx) ? ' และส่วนลด (คิดจากราคารวมของบิล)' : '') + `</div>`
      : (unknownRate
        ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:4px;">บิลนี้มีรายการที่ไม่ทราบอัตราค่าคอม — ` +
          `แก้ส่วนลดไม่ได้ (ต้องคิดค่าคอมใหม่ซึ่งระบบจะต้องเดา) · เปลี่ยนผู้ให้บริการได้ ค่าคอมของรายการย้ายตามไปทั้งจำนวน</div>`
        : '');
    servicesContainer.innerHTML = note + draftDetails.map((item, idx) => {
      if (item._synthetic) {
        return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px dashed var(--border-color);">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary);">${escapeHtml(item.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">ราคา/ค่าคอมรายบรรทัด: ไม่ทราบ</div>
          </div>
          <div style="width: 150px; font-size: 0.8rem; color: var(--text-secondary); text-align: right;">${escapeHtml(item.staffName || 'ไม่ระบุ')}</div>
        </div>`;
      }
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

    this.renderEditMoneyBox(tx);
    this.applyEditTxAccess(access);
    this.openModal('modal-edit-transaction');
  }

  // หน้าต่างแก้บิลมี 3 แบบ ตามสิทธิ์ของคนที่เปิด
  //   แก้ได้        เจ้าของ — แก้ได้ทุกช่อง + ยกเลิกบิล
  //   ดูอย่างเดียว   ผู้จัดการเปิดบิลของวันนี้ — แก้บิลเป็นสิทธิ์เจ้าของ ('bill.edit') จึงล็อกทุกช่องและซ่อนปุ่มบันทึก
  //                 ส่วน "ยกเลิกบิล" และ "บันทึกเงินส่วนต่าง" ยังอยู่ตามสิทธิ์เดิม
  //   settle-only   ผู้จัดการเปิดบิลของวันก่อนที่ค้างคืน/เก็บเงิน — บันทึกเงินส่วนต่างอย่างเดียว
  // ⚠️ เดิมผู้จัดการเห็นทุกช่องแก้ได้ + ปุ่ม "บันทึกการแก้ไข" แต่กดแล้วถูกปฏิเสธทุกครั้ง (รอบตรวจ 4 ข้อ A3)
  //    ถามสิทธิ์จากตารางเดียวกับตัวบันทึก (authorize) — ด่านจริงยังอยู่ที่ saveTransactionEdit/voidTransaction
  applyEditTxAccess(access) {
    if (typeof document === 'undefined') return;
    const settleOnly = access === 'settle-only';
    const canEdit = !settleOnly && this.authorize('bill.edit', '', { quiet: true });
    const canVoid = !settleOnly && this.authorize('bill.void', '', { quiet: true });
    const viewOnly = !settleOnly && !canEdit;
    const show = (id, on) => { const el = document.getElementById(id); if (el && el.style) el.style.display = on ? '' : 'none'; };
    show('edit-tx-void-section', canVoid);
    show('btn-save-tx-edit', canEdit);
    ['edit-tx-customer', 'edit-tx-payment', 'edit-tx-discount'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = !canEdit;
    });
    document.querySelectorAll('.edit-tx-service-staff-select').forEach(el => { el.disabled = !canEdit; });
    const note = document.getElementById('edit-tx-access-note');
    if (note) {
      note.style.display = (settleOnly || viewOnly) ? 'block' : 'none';
      note.innerHTML = settleOnly
        ? '<b>บิลของวันก่อน</b> — ผู้จัดการบันทึกได้เฉพาะ "คืน/เก็บเงินส่วนต่าง" ในกล่องด้านล่าง (ยกเลิกบิลหรือแก้อย่างอื่นได้เฉพาะเจ้าของร้าน)'
        : viewOnly
          ? '<b>ดูอย่างเดียว</b> — แก้บิลได้เฉพาะเจ้าของร้าน · ถ้าบิลผิด ให้แจ้งเจ้าของแก้' +
            (canVoid ? ' หรือยกเลิกบิลในส่วนด้านล่างแล้วออกบิลใหม่' : '')
          : '';
    }
    const title = document.getElementById('edit-tx-modal-title');
    if (title) title.innerText = settleOnly ? 'บันทึกเงินส่วนต่างของบิล' : (viewOnly ? 'รายละเอียดบิล' : 'แก้ไขรายการขาย');
    // ปุ่มล่างซ้าย: "ยกเลิก" ในหน้าที่ไม่มีอะไรให้ยกเลิก ชวนสับสนกับ "ยกเลิกบิล" — ใช้คำว่า "ปิด"
    const closeBtn = document.getElementById('btn-close-tx-edit');
    if (closeBtn) closeBtn.innerText = canEdit ? 'ยกเลิก' : 'ปิด';
  }
  // คำนวณยอดรวมสุทธิระหว่างแก้ไขแบบเรียลไทม์ (อ่านจาก "ร่าง" ไม่ใช่บิลจริง)
  recalculateEditTxTotal() {
    const draft = this._editTxDraft;
    if (!draft) return;
    const tx = this.state.transactions.find(t => t.id === draft.txId);
    if (!tx) return;

    // ต้องโชว์ยอดให้ตรงกับที่จะบันทึกจริง (รวม VAT + ปัดเศษ ถ้าบิลใบนี้มี)
    // ไม่งั้นเจ้าของร้านเห็น 380 ในหน้าต่างแก้ไข แต่กดบันทึกแล้วได้ 386
    const discEl = this.requireEl('edit-tx-discount', 'ช่องส่วนลดในหน้าต่างแก้บิล');
    const raw = String(discEl.value == null ? '' : discEl.value).trim();
    const hint = document.getElementById('edit-tx-hint');
    const showHint = (text) => { if (hint) { hint.innerText = text || ''; hint.style.display = text ? 'block' : 'none'; } };
    // ส่วนลดเท่าเดิม = ยังไม่ได้แก้เรื่องเงิน → ยอดคงเดิมตามบิล (ไม่คิดใหม่ให้เลขขยับเอง)
    const same = Math.round((Number(raw === '' ? 0 : raw)) * 100) === Math.round((this.toFiniteNumber(tx.discount) || 0) * 100);
    if (same) {
      document.getElementById('edit-tx-total').value = `฿${(Number(tx.total) || 0).toLocaleString('th-TH')}`;
      showHint('');
      return;
    }
    const calc = this.computeEditTotals(tx, draft.details, raw === '' ? 0 : raw);
    if (!calc.ok) {
      document.getElementById('edit-tx-total').value = '—';
      showHint(calc.error);
      return;
    }
    const blocked = !calc.noDetails && draft.details.some(d => !d._synthetic && !this.lineCommissionRule(d));
    document.getElementById('edit-tx-total').value = `฿${calc.totals.total.toLocaleString('th-TH')}`;
    showHint(blocked ? 'บิลนี้มีรายการที่ไม่ทราบอัตราค่าคอม — บันทึกการแก้ส่วนลดไม่ได้' : '');
  }
  // บันทึกการแก้ไขธุรกรรมย้อนหลัง
  // ⚠️ จุดเดียวในระบบที่ได้รับอนุญาตให้เขียนทับข้อมูลบิลที่ออกไปแล้ว
  // ทุกอย่างก่อนหน้านี้ทำงานบน "ร่าง" (this._editTxDraft) เท่านั้น
  async saveTransactionEdit() {
    if (!this.authorize('bill.edit', 'การแก้ไขบิล')) return;
    // ทั้งช่วง "เขียนลงบิล → บันทึก → คืนค่าถ้าพัง" ต้องไม่ซ้อนกับงานบันทึกอื่น (ดู withMutation)
    return this.withMutation('การแก้ไขบิล', () => this._saveTransactionEditLocked());
  }

  async _saveTransactionEditLocked() {
    if (!this.authorize('bill.edit', 'การแก้ไขบิล')) return;
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

    // ── 0. อ่านค่าจากฟอร์ม ────────────────────────────────────────────────
    let discountEl;
    try {
      discountEl = this.requireEl('edit-tx-discount', 'ช่องส่วนลดในหน้าต่างแก้บิล');
    } catch (err) {
      return; // ฟ้องไปแล้ว — ห้ามเขียนทับบิลที่ออกไปแล้วด้วยส่วนลดที่เดาเอง
    }
    const sat = v => Math.round(v * 100);
    const newCustomer = String(document.getElementById('edit-tx-customer').value || '').trim() || 'ลูกค้าทั่วไป';
    const newPayment = document.getElementById('edit-tx-payment').value;
    if (!PAYMENT_METHODS.includes(newPayment)) {
      this.showToast('ช่องทางชำระเงินไม่ถูกต้อง — เลือกใหม่อีกครั้ง', 'warning');
      return;
    }
    const rawStr = String(discountEl.value == null ? '' : discountEl.value).trim();
    const rawDiscount = rawStr === '' ? 0 : Number(rawStr);

    // ── 1. แยก "ข้อมูลทั่วไป" ออกจาก "รายละเอียดการเงิน" (ข้อ 17) ─────────────────
    // เดิมกดบันทึกทีไรก็คิดราคาหลังส่วนลด/ค่าคอม/VAT ของทั้งบิลใหม่ทุกครั้ง แม้แค่แก้ชื่อลูกค้า
    // (และบิลเก่าที่ไม่มีรายการย่อยถูกยัดรายการที่สร้างจากราคา/อัตราปัจจุบันลงไป)
    // ตอนนี้: คิดเงินใหม่เฉพาะเมื่อ "ส่วนลดเปลี่ยน" · เปลี่ยนผู้ให้บริการ = ย้ายรายการ (ยอด/ค่าคอมเดิม) ไปหาคนใหม่
    const discountChanged = !Number.isFinite(rawDiscount) || sat(rawDiscount) !== sat(this.toFiniteNumber(tx.discount) || 0);
    const hasDetails = Array.isArray(tx.details) && tx.details.length > 0;
    const staffUpdates = [];
    if (hasDetails) {
      document.querySelectorAll('.edit-tx-service-staff-select').forEach(select => {
        const idx = parseInt(select.getAttribute('data-index'), 10);
        if (!Number.isInteger(idx) || !tx.details[idx] || !draft.details[idx]) return;
        if (select.value === '__keep__') return;   // พนักงานเดิมถูกลบไปแล้ว — คงชื่อเดิมไว้ ไม่โยนค่าคอมให้คนอื่น
        const staffMember = this.state.staff.find(st => st.id === select.value);
        if (staffMember && staffMember.id !== tx.details[idx].staffId) {
          staffUpdates.push({ idx, staffId: staffMember.id, staffName: staffMember.name });
        }
      });
    }
    const customerChanged = newCustomer !== (tx.customerName || '');
    const paymentChanged = newPayment !== this.paymentMethodOf(tx);
    const staffChanged = staffUpdates.length > 0;
    if (!customerChanged && !paymentChanged && !staffChanged && !discountChanged) {
      this.closeModal('modal-edit-transaction');
      this.showToast('ไม่มีข้อมูลเปลี่ยน — ไม่ได้แก้บิล', 'info');
      return;
    }

    const withStaff = (d, i) => {
      const u = staffUpdates.find(x => x.idx === i);
      return u ? { ...d, staffId: u.staffId, staffName: u.staffName } : d;
    };
    let calc = null, finalDetails = null;
    if (discountChanged) {
      if (hasDetails) {
        // ค่าคอมต้องคิดใหม่ตามราคาหลังส่วนลดใหม่ — ทำได้เฉพาะเมื่อรู้อัตราที่บิลใบนั้นใช้จริงทุกบรรทัด
        const unknown = tx.details.map((d, i) => this.lineCommissionRule(d) ? null : String((d && d.name) || `รายการที่ ${i + 1}`)).filter(Boolean);
        if (unknown.length) {
          this.showToast(`แก้ส่วนลดไม่ได้: ไม่ทราบอัตราค่าคอมที่บิลนี้ใช้กับ "${unknown.slice(0, 3).join('", "')}" ` +
            '— ถ้าคิดใหม่ระบบต้องเดา (แก้ได้เฉพาะชื่อลูกค้า/ช่องทาง/ผู้ให้บริการ)', 'warning', 9000);
          return;
        }
      }
      const work = hasDetails ? tx.details.map((d, i) => ({ ...withStaff(d, i) })) : [];
      calc = this.computeEditTotals(tx, hasDetails ? work : draft.details, rawStr === '' ? 0 : rawStr);
      if (!calc.ok) {
        this.showToast('บันทึกไม่ได้: ' + calc.error, 'warning', 8000);
        return;
      }
      if (hasDetails) {
        // คำนวณราคาหลังส่วนลด + ค่าคอมใหม่ต่อรายการ (สูตรเดียวกับตอนขาย รวมเกลี่ยเศษสตางค์) ด้วยอัตราที่ล็อกไว้ในบิล
        finalDetails = work.map((d, i) => {
          const rule = this.lineCommissionRule(d);
          const netPrice = calc.nets[i];
          return {
            ...d,
            netPrice: netPrice,
            // ค่าคอมคิดจาก netPrice ซึ่งเป็นยอด "ก่อน VAT" เสมอ
            commissionAmount: commissionAmountFor(netPrice, rule.type, rule.rate)   // ปัดเป็นบาทเต็ม (กติกาตัวเลข)
          };
        });
      }
    } else if (staffChanged) {
      // ยอด/ราคาหลังส่วนลด/ค่าคอมของแต่ละรายการคงเดิม — แค่ย้ายรายการไปเป็นของผู้ให้บริการคนใหม่
      finalDetails = tx.details.map((d, i) => withStaff(d, i) === d ? d : { ...withStaff(d, i) });
    }

    // ── 2. เงินที่รับจริงตอนขาย (ข้อ 16) — เก็บไว้ก่อนยอด/ช่องทางของบิลจะเปลี่ยนครั้งแรก ───────────
    // บิลที่ขายก่อนมีระบบนี้: ยอด/ช่องทางก่อนแก้ครั้งแรก คือสิ่งที่ระบบเดิมถือว่ารับเงินมา (ลิ้นชักนับตามนี้มาตลอด)
    // ข้อมูลเดิมอ่านไม่ได้ = การแก้ครั้งนี้คือ "ซ่อมบันทึก" → ไม่สร้างเงินรับจริงจากค่าที่เสีย
    const curTotal = this.toFiniteNumber(tx.total);
    const totalChanged = !!calc && (curTotal === null || sat(calc.totals.total) !== sat(curTotal));
    let capturedTender = null;
    if ((paymentChanged || totalChanged) && (tx.tender === undefined || tx.tender === null)) {
      const pre = this.tenderOf(tx);
      if (pre.valid) {
        capturedTender = { method: pre.method, amount: pre.amount, received: pre.received, change: pre.change,
          at: tx.date, inferred: true, capturedAt: Date.now() };
      }
    }

    // ── 3. เก็บค่าเดิมไว้ย้อนกลับ ถ้าเขียนลงเครื่องไม่สำเร็จ ────────────────
    // การแก้บิลกระทบยอดขาย/ค่าคอม/ชีต ถ้า IndexedDB เขียนพลาดแล้วปล่อยค่าใหม่ค้างในหน่วยความจำ
    // หน้าจอจะโชว์ยอดใหม่ทั้งที่ในเครื่องยังเป็นยอดเก่า — คนละชุดกันแบบไม่มีใครรู้
    const prevEditLog = Array.isArray(this.state.editLog) ? this.state.editLog.slice() : [];
    const KEYS = ['customerName', 'paymentMethod', 'details', 'staffNames', 'subtotal', 'discount',
      'nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'vatRate', 'total', 'rev', 'syncStatus', 'syncIssue', 'tender'];
    const had = {};
    KEYS.forEach(k => { had[k] = Object.prototype.hasOwnProperty.call(tx, k); });
    const rollback = this.cloneForRollback(Object.assign(
      KEYS.reduce((o, k) => { o[k] = tx[k]; return o; }, {}),
      { cloudOutbox: this.state.cloudOutbox || [] }));

    try {
      // ── 4. เขียนลงบิลจริง (ถึงบรรทัดนี้เท่านั้น) ────────────────────────
      tx.customerName = newCustomer;
      if (paymentChanged) tx.paymentMethod = newPayment;
      if (capturedTender) tx.tender = capturedTender;
      if (finalDetails) {
        tx.details = finalDetails;
        tx.staffNames = [...new Set(finalDetails.map(d => d.staffName))];
      }
      if (calc) {
        tx.subtotal = calc.subtotal;
        tx.discount = calc.discount;
        tx.total    = calc.totals.total;
        if (!calc.legacy) {
          // บิลรุ่นใหม่: อัปเดต 4 ช่อง VAT ให้บวกกันแล้วเท่ายอดรวมเสมอ
          tx.nonVatBase  = calc.totals.nonVatBase;
          tx.vatableBase = calc.totals.vatableBase;
          tx.vatAmount   = calc.totals.vatAmount;
          tx.rounding    = calc.totals.rounding;
        }
        // บิลรุ่นเก่า: ไม่เติมฟิลด์ VAT เข้าไป — ปล่อยให้ยังเป็นบิลรุ่นเก่าเหมือนเดิม
      }
      tx.rev = (tx.rev || 0) + 1; // เวอร์ชันการแก้ไข — ให้รอบ sync ที่กำลังส่งข้อมูลเก่าอยู่รู้ว่าห้าม mark synced ทับ
      tx.syncStatus = 'pending';  // ตั้งค่าเป็น pending เพื่อให้ระบบซิงก์ใหม่
      delete tx.syncIssue;        // แก้บิลแล้ว = เจ้าของตัดสินใจใหม่ ให้ชีตตรวจรุ่นใหม่นี้อีกครั้ง

      // ── ร่องรอยว่าใครแก้บิลใบนี้ เมื่อไหร่ จากเท่าไรเป็นเท่าไร ──────────────
      // เก็บเฉพาะค่าที่เปลี่ยน ไม่เก็บทั้งบิล — ไฟล์สำรองจะได้ไม่บวมเป็นสองเท่า
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
      // (ชื่อลูกค้าไม่อยู่ในสรุป — แก้แค่ชื่อไม่ต้องส่งสรุปใหม่)
      if (paymentChanged || staffChanged || calc) this.enqueueSummaryRefresh(tx.date);
      // รอบตรวจ 5 ข้อ 1: ไฟล์สำรองต้องมีบิลที่แก้แล้ว (เดิมกู้ไฟล์ก่อนแก้ = ชีตกลับเป็นยอดเดิมเงียบ ๆ)
      this.planChangeBackup('edit');

      await this.saveStateOrThrow('การแก้ไขบิล');
    } catch (saveErr) {
      KEYS.forEach(k => { if (had[k]) tx[k] = rollback[k]; else delete tx[k]; });
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
    // ข้อ 16: ยอด/ช่องทางใหม่ต่างจากเงินที่รับจริง → ระบบไม่ถือเองว่าคืน/เก็บเงินแล้ว ให้คนบันทึกสิ่งที่เกิดขึ้นจริง
    const money = (tx.tender !== undefined && tx.tender !== null) ? this.billMoneyStatus(tx) : null;
    if (money && !money.settled) {
      this.showToast('บันทึกการแก้ไขแล้ว — ยอด/ช่องทางใหม่ต่างจากเงินที่รับจริงตอนขาย: ' +
        (money.invalid ? 'ข้อมูลรับเงินของบิลเสีย' : this.describeMoneyDiffs(money.diffs)) +
        ' · ระบบยังไม่ได้ถือว่าคืน/เก็บเงินแล้ว ให้บันทึกในส่วน "เงินที่รับจริงของบิลนี้"', 'warning', 10000);
      this.openTransactionEdit(tx.id);
    } else {
      this.showToast('แก้ไขข้อมูลธุรกรรมเรียบร้อยแล้ว', 'info');
    }
  }

  // ── ส่วน "เงินที่รับจริงของบิลนี้" ในหน้าต่างแก้บิล (ข้อ 16) ─────────────────────────
  // แสดงเฉพาะบิลที่เคยถูกแก้ยอด/ช่องทางหลังรับเงิน — บิลปกติไม่มีอะไรต่างให้ดู
  renderEditMoneyBox(tx) {
    const box = document.getElementById('edit-tx-money-box');
    if (!box) return;
    const explicit = (tx.tender !== undefined && tx.tender !== null) || (tx.settlements !== undefined && tx.settlements !== null);
    if (!explicit) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const baht = v => '฿' + Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const when = ts => (Number(ts) > 0 ? new Date(Number(ts)).toLocaleString('th-TH') : '-');
    const KIND = { refund: 'คืนเงิน', collect: 'เก็บเงินเพิ่ม', correction: 'แก้บันทึกรับเงินตอนขาย', waive: 'ไม่มีเงินเคลื่อนไหว (ยอมรับส่วนต่าง)' };
    const t = this.tenderOf(tx);
    const st = this.billMoneyStatus(tx);
    const lines = [];
    if (t.valid) {
      lines.push(`รับตอนขาย: <b>${escapeHtml(PAYMENT_LABELS[t.method] || t.method)} ${baht(t.amount)}</b>` +
        (t.method === 'cash' && t.received !== null ? ` (รับมา ${baht(t.received)} · ทอน ${baht(t.change)})` : '') +
        (t.inferred ? ' <span style="color:var(--text-muted);">— จากยอดของบิลก่อนแก้ครั้งแรก</span>' : ''));
    } else {
      lines.push('<b>ข้อมูลเงินที่รับจริงตอนขายของบิลนี้เสีย</b> — ระบบไม่คิดส่วนต่างให้เอง ต้องตรวจจากหลักฐานจริง');
    }
    st.settlements.forEach(x => {
      lines.push(`• ${KIND[x.kind] || escapeHtml(x.kind)} · ${escapeHtml(PAYMENT_LABELS[x.method] || x.method)} ` +
        `${Number(x.amount) < 0 ? '-' : '+'}${baht(x.amount)} · ${escapeHtml(when(x.at))}${x.by ? ' · โดย ' + escapeHtml(x.by) : ''}`);
    });
    let actions = '';
    if (st.invalid) {
      if (t.valid) lines.push('<b>ประวัติคืน/เก็บเงินของบิลนี้เสีย</b> — ระบบไม่คิดส่วนต่างต่อเอง');
    } else if (!st.settled) {
      lines.push(`<b style="color:var(--accent-premium);">ส่วนต่างที่ยังไม่ได้บันทึก: ${escapeHtml(this.describeMoneyDiffs(st.diffs))}</b>`);
      lines.push('<span style="color:var(--text-muted);">ระบบไม่ถือเองว่าคืน/เก็บเงินแล้ว — เลือกสิ่งที่เกิดขึ้นจริง:</span>');
      // ใครกดได้ = ตารางสิทธิ์กลาง (bill.settle) ตัวเดียวกับที่ตัวบันทึกตรวจ — เดิมเขียนตายตัวว่าเจ้าของเท่านั้น
      // ผู้จัดการ (ที่ปิดกะเกือบทุกคืน) จึงเห็นแค่ข้อความ ทั้งที่เจ้าของสั่งเปิดสิทธิ์นี้ไว้แล้ว (23 ก.ย. 2569)
      if (this.authorize('bill.settle', '', { quiet: true })) {
        const btn = (mode, label) => `<button type="button" class="btn-small secondary" onclick="app.recordBillSettlement('${safeId(tx.id)}','${mode}')">${label}</button>`;
        actions = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">` +
          btn('moved', 'คืน/เก็บเงินจริงตอนนี้') +
          btn('correction', 'ตอนขายบันทึกรับเงินผิด') +
          btn('waive', 'ไม่มีเงินเคลื่อนไหว') + `</div>`;
      } else {
        lines.push('<span style="color:var(--text-muted);">(เจ้าของร้านหรือผู้จัดการเป็นคนบันทึก)</span>');
      }
    } else if (st.settlements.length) {
      lines.push('<span style="color:var(--color-success);">ส่วนต่างบันทึกครบแล้ว ✓</span>');
    }
    box.style.display = 'block';
    box.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">เงินที่รับจริงของบิลนี้</div>` +
      lines.map(l => `<div style="margin:2px 0;">${l}</div>`).join('') + actions;
  }

  describeSettlementPlan(tx, st, mode) {
    const baht = v => '฿' + Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const shift = this.state.shift;
    const active = !!(shift && shift.active === true && Number(shift.startTime) > 0);
    const inActive = active && new Date(tx.date).getTime() >= Number(shift.startTime);
    const hasCash = st.diffs.some(d => d.method === 'cash');
    const parts = st.diffs.map(d => {
      const m = PAYMENT_LABELS[d.method] || d.method;
      if (mode === 'moved') return d.amount < 0 ? `คืนเงินให้ลูกค้าแล้ว ${baht(d.amount)} (${m})` : `เก็บเงินเพิ่มจากลูกค้าแล้ว ${baht(d.amount)} (${m})`;
      if (mode === 'correction') return d.amount < 0 ? `ตอนขายไม่ได้รับ${m} ${baht(d.amount)} ตามที่บันทึกไว้` : `ตอนขายได้รับ${m}จริง ${baht(d.amount)}`;
      return d.amount < 0 ? `ไม่ได้คืน ${baht(d.amount)} (${m}) — ร้านเก็บไว้` : `ไม่ได้เก็บเพิ่ม ${baht(d.amount)} (${m})`;
    });
    let effect;
    if (mode === 'moved') effect = hasCash ? 'เงินสดส่วนนี้จะนับเข้า/ออกลิ้นชักของกะที่เปิดอยู่ตอนนี้' : 'ไม่กระทบลิ้นชักเงินสด';
    else if (mode === 'correction') effect = !hasCash ? 'ไม่กระทบลิ้นชักเงินสด'
      : (inActive ? 'ปรับยอดที่ควรมีในลิ้นชักของกะนี้ (กะเดียวกับที่ขายบิล)' : 'กะที่ขายบิลปิดไปแล้ว — ไม่กระทบลิ้นชักกะนี้ (ผลต่างของกะนั้นบันทึกไปแล้ว)');
    else effect = 'ไม่กระทบลิ้นชัก — เก็บไว้เป็นหลักฐานว่าไม่มีเงินเคลื่อนไหว';
    return `บิล ${tx.id}\n${parts.join('\n')}\n\n${effect}\nยืนยันว่าเป็นสิ่งที่เกิดขึ้นจริง?`;
  }

  // บันทึกว่า "เกิดอะไรขึ้นจริง" กับเงินส่วนต่างของบิลที่ถูกแก้ยอด/ช่องทางหลังรับเงิน (ข้อ 16)
  //   moved      = คืน/เก็บเงินเพิ่มจริงตอนนี้ → เงินสดเข้า/ออกลิ้นชักของ "กะที่เปิดอยู่" (ต้องเปิดกะ)
  //   correction = ตอนขายบันทึกรับเงินผิด (เช่นกดเงินสดแต่ลูกค้าสแกนจ่าย) → กระทบลิ้นชักของกะที่ขายบิล ถ้ายังเปิดอยู่
  //   waive      = ไม่มีเงินเคลื่อนไหว (ไม่ได้คืน/ไม่ได้เก็บเพิ่ม) → ไม่กระทบลิ้นชัก เก็บส่วนต่างไว้เป็นหลักฐาน
  // ระบบไม่เลือกให้เอง และไม่มีทางเลือกไหนที่ "ถือว่าคืนแล้ว" โดยไม่มีคนยืนยัน
  async recordBillSettlement(txId, mode) {
    if (!['moved', 'correction', 'waive'].includes(mode)) return false;
    if (!this.authorize('bill.settle', 'การบันทึกเงินส่วนต่างของบิล')) return false;
    if (!this.canWriteData('บันทึกเงินส่วนต่างของบิล')) return false;
    const tx = (this.state.transactions || []).find(t => t && t.id === txId);
    if (!tx) { this.showToast('ไม่พบบิลใบนี้แล้ว (อาจถูกยกเลิกไปก่อนหน้า)', 'warning'); return false; }
    if (this.billAccessFor(tx) === 'none') {
      this.showToast('บิลของวันก่อน — ดูย้อนหลังได้เฉพาะเจ้าของร้าน', 'warning');
      return false;
    }
    const st = this.billMoneyStatus(tx);
    if (st.invalid) {
      this.showToast('ข้อมูลเงินที่รับจริงของบิลนี้เสีย — ระบบไม่บันทึกส่วนต่างให้ (ต้องตรวจจากหลักฐานจริงก่อน)', 'error', 8000);
      return false;
    }
    if (st.settled) { this.showToast('บิลนี้ไม่มีส่วนต่างค้าง', 'info'); return false; }
    const shift = this.state.shift;
    const active = !!(shift && shift.active === true && Number(shift.startTime) > 0);
    if (mode === 'moved' && st.diffs.some(d => d.method === 'cash') && !active) {
      this.showToast('ต้องเปิดกะก่อน — เงินสดที่คืน/เก็บเพิ่มต้องเข้า/ออกลิ้นชักของกะที่เปิดอยู่', 'warning', 7000);
      return false;
    }
    const expect = JSON.stringify(st.diffs);
    const yes = await this.askConfirm(this.describeSettlementPlan(tx, st, mode));
    if (!yes) return false;
    if (!await this.confirmPinStepUp('การบันทึกเงินส่วนต่างของบิล')) return false;   // ข้อ 8
    const done = await this.withMutation('การบันทึกเงินส่วนต่างของบิล', () => this._recordBillSettlementLocked(txId, mode, expect));
    if (done) {
      this.showToast('บันทึกเงินส่วนต่างของบิลแล้ว', 'success');
      const idEl = document.getElementById('edit-tx-id');
      if (idEl && idEl.value === txId) this.renderEditMoneyBox(tx);
      this.filterReports();
    }
    return !!done;
  }

  async _recordBillSettlementLocked(txId, mode, expectDiffs) {
    if (!this.authorize('bill.settle', 'การบันทึกเงินส่วนต่างของบิล')) return false;
    const tx = (this.state.transactions || []).find(t => t && t.id === txId);
    if (!tx) { this.showToast('บิลใบนี้ไม่อยู่ในข้อมูลปัจจุบันแล้ว', 'warning'); return false; }
    if (this.billAccessFor(tx) === 'none') { this.showToast('บิลของวันก่อน — ดูย้อนหลังได้เฉพาะเจ้าของร้าน', 'warning'); return false; }
    const st = this.billMoneyStatus(tx);
    // ระหว่างกล่องยืนยันค้างอยู่ บิลอาจถูกแก้/บันทึกส่วนต่างไปแล้วจากทางอื่น — ต้องเป็นตัวเลขชุดเดียวกับที่คนยืนยัน
    if (st.invalid || st.settled || JSON.stringify(st.diffs) !== expectDiffs) {
      this.showToast('ส่วนต่างของบิลเปลี่ยนระหว่างรอยืนยัน — ยังไม่ได้บันทึก เปิดบิลใหม่แล้วตรวจอีกครั้ง', 'warning', 7000);
      return false;
    }
    const shift = this.state.shift;
    const active = !!(shift && shift.active === true && Number(shift.startTime) > 0);
    if (mode === 'moved' && st.diffs.some(d => d.method === 'cash') && !active) {
      this.showToast('ต้องเปิดกะก่อน — เงินสดที่คืน/เก็บเพิ่มต้องเข้า/ออกลิ้นชักของกะที่เปิดอยู่', 'warning', 7000);
      return false;
    }
    if (shift && shift.cashAdjustments !== undefined && shift.cashAdjustments !== null && !Array.isArray(shift.cashAdjustments)) {
      this.showToast('รายการคืน/เก็บเงินของกะนี้เสีย — บันทึกเพิ่มไม่ได้ (ตรวจไฟล์สำรองก่อน)', 'error', 8000);
      return false;
    }
    const startTime = active ? Number(shift.startTime) : null;
    const billInActiveShift = active && new Date(tx.date).getTime() >= startTime;
    const now = Date.now();
    const by = this.currentUser ? this.currentUser.name : '';
    const entries = st.diffs.map((d, i) => {
      const kind = mode === 'moved' ? (d.amount < 0 ? 'refund' : 'collect') : mode;
      // กะที่ "เงินเคลื่อนไหว": คืน/เก็บตอนนี้ = กะที่เปิดอยู่ · แก้บันทึกตอนขาย = กะที่ขายบิล (ถ้ายังเปิดอยู่)
      let shiftStart = null;
      if (mode === 'moved' && active) shiftStart = startTime;
      if (mode === 'correction' && billInActiveShift) shiftStart = startTime;
      return { id: `stl-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`, kind, method: d.method,
        amount: d.amount, at: now, by, shiftStart };
    });
    const drawer = entries.filter(e => e.method === 'cash' && e.kind !== 'waive' && e.shiftStart !== null && e.shiftStart === startTime);

    const hadSettlements = Object.prototype.hasOwnProperty.call(tx, 'settlements');
    const prevSettlements = hadSettlements ? this.cloneForRollback(tx.settlements) : undefined;
    const hadAdj = !!shift && Object.prototype.hasOwnProperty.call(shift, 'cashAdjustments');
    const prevAdj = hadAdj ? this.cloneForRollback(shift.cashAdjustments) : undefined;
    const prevEditLog = Array.isArray(this.state.editLog) ? this.state.editLog.slice() : this.state.editLog;
    const prevOutbox = this.cloneForRollback(this.state.cloudOutbox || []);
    try {
      // รอบตรวจ 5 ข้อ 1: บันทึกคืน/เก็บเงินส่วนต่างอยู่ในเครื่องที่เดียว — ไฟล์สำรองต้องตามให้ทัน
      this.planChangeBackup('settlement');
      tx.settlements = (Array.isArray(tx.settlements) ? tx.settlements : []).concat(entries);
      if (drawer.length) {
        shift.cashAdjustments = (Array.isArray(shift.cashAdjustments) ? shift.cashAdjustments : [])
          .concat(drawer.map(e => ({ id: e.id, billId: tx.id, kind: e.kind, amount: e.amount, at: now, by })));
      }
      if (!Array.isArray(this.state.editLog)) this.state.editLog = [];
      this.state.editLog.push({
        billId: tx.id, date: now, billDate: tx.date, by, fields: ['settlement'], kind: 'settlement', mode,
        settlements: entries.map(e => ({ kind: e.kind, method: e.method, amount: e.amount, shiftStart: e.shiftStart }))
      });
      await this.saveStateOrThrow('การบันทึกเงินส่วนต่างของบิล');
    } catch (err) {
      if (hadSettlements) tx.settlements = prevSettlements; else delete tx.settlements;
      if (shift) { if (hadAdj) shift.cashAdjustments = prevAdj; else delete shift.cashAdjustments; }
      this.state.editLog = prevEditLog;
      this.state.cloudOutbox = prevOutbox;
      console.error('recordBillSettlement failed:', err);
      this.showToast('บันทึกไม่สำเร็จ — ยังไม่ได้เปลี่ยนอะไร: ' + (err.message || err), 'error', 8000);
      return false;
    }
    return true;
  }
  // ลบรายการธุรกรรมย้อนหลัง (Void)
  // เงินสดของบิลใบนี้ที่ "ยังนับอยู่ในลิ้นชักของกะที่เปิดอยู่" ตอนนี้ (ข้อ 16)
  //   = เงินที่รับตอนขาย (ถ้าขายในกะนี้และรับเป็นเงินสด) + รายการคืน/เก็บเพิ่มของบิลนี้ที่บันทึกในกะนี้
  // ใช้ตอนยกเลิกบิล: การเอาบิลออกจากรายการทำให้ยอดนี้หลุดจากการนับเอง — ถ้าไม่ได้คืนเงินจริงต้องบวกกลับ
  billCashHeldInShift(tx) {
    const sh = this.state.shift;
    if (!sh || sh.active !== true || !(Number(sh.startTime) > 0)) return 0;
    const sat = v => Math.round(v * 100);
    let held = 0;
    const t = this.tenderOf(tx);
    if (t.valid && t.method === 'cash' && new Date(tx.date).getTime() >= Number(sh.startTime)) held += sat(t.amount);
    (Array.isArray(sh.cashAdjustments) ? sh.cashAdjustments : []).forEach(a => {
      if (!a || typeof a !== 'object' || a.billId !== tx.id || a.reversedByVoid) return;
      const n = this.toFiniteNumber(a.amount);
      if (n !== null) held += sat(n);
    });
    return held / 100;
  }

  // เงินสดสุทธิที่ลูกค้าจ่ายมาสำหรับบิลใบนี้ (ไม่ว่ารับในกะไหน) — ใช้เป็นยอดคืนตั้งต้นตอนยกเลิกบิลข้ามกะ
  billCashPaidTotal(tx) {
    const sat = v => Math.round(v * 100);
    const t = this.tenderOf(tx);
    let paid = (t.valid && t.method === 'cash') ? sat(t.amount) : 0;
    (Array.isArray(tx.settlements) ? tx.settlements : []).forEach(x => {
      if (!x || typeof x !== 'object' || x.method !== 'cash' || x.kind === 'waive') return;
      const n = this.toFiniteNumber(x.amount);
      if (n !== null) paid += sat(n);
    });
    return paid / 100;
  }

  // ── ผลต่อลิ้นชักของการยกเลิกบิล — ตัวคำนวณเดียว ใช้ทั้งกล่องยืนยันและตอนบันทึกจริง ─────────────
  // ⚠️ แก้ 24 ก.ย. 2569: เดิมตัดสินจาก "มีเงินของบิลนี้ค้างในกะนี้ไหม" (held) อย่างเดียว
  // แต่บิลของ "กะก่อน" ที่ถูกบันทึกคืน/เก็บส่วนต่างไว้ใน "กะนี้" ก็มี held ≠ 0 ได้ (เช่น −100)
  // → ระบบเข้าใจผิดว่าเป็นบิลของกะนี้: เลือก "คืนเงินแล้ว" ไม่หักเงินที่คืนจริง (ปิดกะขาด)
  //   เลือก "ไม่มีเงินเคลื่อนไหว" หักรายการคืนเดิมซ้ำอีกรอบ (ปิดกะเกิน) และกล่องยืนยันบอกตัวเลขผิด
  // ตอนนี้แยกให้ชัดด้วย "บิลขายในกะที่เปิดอยู่หรือไม่" ก่อน แล้วค่อยคิดเงิน:
  //   บิลของกะนี้  : เอาบิลออก + กลับรายการคืน/เก็บของบิลนี้ในกะนี้ = เงินของบิลนี้ (held) หลุดจากการนับเอง
  //                 refunded = ปล่อยให้หลุด (เงินออกจริง) · none/unknown = บวก held กลับเข้าไป
  //   บิลของกะก่อน : ไม่มีอะไรหลุดจากลิ้นชักกะนี้ (รายการคืน/เก็บที่ทำในกะนี้เกิดขึ้นจริง ห้ามกลับรายการ)
  //                 refunded = หักเงินสดสุทธิที่ลูกค้าจ่ายมา (paid) เป็นเงินออกของกะนี้ · none/unknown = ไม่แตะ
  // คืน { shiftOpen, inShift, held, paid, cashEffect, push, unattributed, reverseAdjustments, text }
  planVoidCash(tx, outcome) {
    const sh = this.state.shift;
    const shiftOpen = !!(sh && sh.active === true && Number(sh.startTime) > 0);
    const inShift = shiftOpen && new Date(tx.date).getTime() >= Number(sh.startTime);
    const held = inShift ? this.billCashHeldInShift(tx) : 0;
    const paid = this.billCashPaidTotal(tx);
    const heldSat = Math.round(held * 100), paidSat = Math.round(paid * 100);
    const baht = v => '฿' + Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const plan = { shiftOpen, inShift, held, paid, cashEffect: 0, push: null, unattributed: 0, reverseAdjustments: inShift, text: '' };
    if (inShift) {
      if (outcome === 'refunded') {
        plan.cashEffect = heldSat === 0 ? 0 : -held;
        plan.text = heldSat === 0
          ? 'บิลนี้ไม่ได้รับเป็นเงินสด — ไม่กระทบลิ้นชัก (คืนผ่านช่องทางเดิม)'
          : `เงินสด ${baht(held)} ${heldSat > 0 ? 'ออกจาก' : 'กลับเข้า'}ลิ้นชักของกะที่เปิดอยู่`;
      } else {
        if (heldSat !== 0) {
          plan.push = { amount: held, kind: outcome === 'none' ? 'void-keep' : 'void-unknown',
            note: outcome === 'none' ? 'ยกเลิกบิลโดยไม่มีเงินเคลื่อนไหว' : 'ยกเลิกตามสถานะบนชีต — ยังไม่ระบุว่าคืนเงินหรือไม่' };
        }
        plan.text = heldSat !== 0 ? `เงินสด ${baht(held)} ของบิลนี้ยังนับอยู่ในลิ้นชักของกะที่เปิดอยู่ตามเดิม` : 'ไม่กระทบลิ้นชัก';
      }
      return plan;
    }
    // บิลของกะก่อน (หรือยังไม่มีกะเปิด)
    if (outcome === 'refunded') {
      if (paidSat > 0 && shiftOpen) {
        plan.push = { amount: -paid, kind: 'void-refund', note: 'คืนเงินบิลที่ยกเลิก (บิลนี้ขายในกะก่อน)' };
        plan.cashEffect = -paid;
        plan.text = `บันทึกเงินสดคืน ${baht(paid)} เป็นเงินออกของกะที่เปิดอยู่ (บิลนี้ขายในกะก่อน)`;
      } else if (paidSat > 0) {
        plan.unattributed = paid;
        plan.text = `ยังไม่มีกะเปิดอยู่ — เงินคืน ${baht(paid)} จะไม่ถูกนับในลิ้นชักกะไหน (บันทึกไว้ในประวัติการยกเลิก)`;
      } else {
        plan.text = 'บิลนี้ไม่ได้รับเงินสดสุทธิ — ไม่กระทบลิ้นชัก (คืนผ่านช่องทางเดิม)';
      }
    } else {
      plan.text = 'บิลนี้ขายในกะก่อน — ไม่กระทบลิ้นชักของกะที่เปิดอยู่';
    }
    return plan;
  }

  // ยกเลิกบิล: ต้องบอกก่อนว่า "เงินเคลื่อนไหวจริงหรือเปล่า" (ข้อ 16 — เจ้าของสั่งไว้ 23 ก.ย. 2569)
  //   refunded = คืนเงินให้ลูกค้าแล้ว → เงินสดออกจากลิ้นชักของกะที่เปิดอยู่
  //   none     = ไม่มีเงินเคลื่อนไหว (บิลออกผิด/ซ้ำ หรือไม่ได้คืนเงิน) → เงินยังอยู่ในลิ้นชักตามเดิม
  // เดิมยกเลิกแล้วหักลิ้นชักให้ทันทีเสมอ = ถือเองว่าคืนเงินเต็มจำนวนทุกครั้ง
  async voidTransaction() {
    const txId = document.getElementById('edit-tx-id').value;
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    if (!this.authorize('bill.void', 'การยกเลิกบิล')) return;
    if (this.billAccessFor(tx) !== 'full') {
      this.showToast('บิลของวันก่อน — ยกเลิกได้เฉพาะเจ้าของร้าน', 'warning', 6000);
      return;
    }

    const sel = document.getElementById('void-money-outcome');
    const outcome = sel ? String(sel.value || '') : 'refunded';   // ไม่มีช่องเลือก (หน้าเก่า) = กติกาเดิม
    if (!['refunded', 'none'].includes(outcome)) {
      this.showToast('เลือกก่อนว่าเงินของบิลนี้เคลื่อนไหวจริงหรือไม่ (คืนเงินแล้ว / ไม่มีเงินเคลื่อนไหว)', 'warning', 7000);
      return;
    }
    const baht = v => '฿' + Math.abs(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // ตัวคำนวณเดียวกับที่ _voidBillLocked ใช้บันทึกจริง — ข้อความที่คนยืนยัน = สิ่งที่ระบบจะทำ
    const effect = this.planVoidCash(tx, outcome).text;
    const msg = `ยกเลิกบิล ${tx.id} ยอด ${baht(tx.total)}\n` +
      (outcome === 'refunded' ? 'เงิน: คืนให้ลูกค้าแล้ว\n' : 'เงิน: ไม่มีเงินเคลื่อนไหว\n') +
      `${effect}\n\nยกเลิกแล้วกู้กลับไม่ได้ ยืนยันไหม?`;

    if (!await this.confirmPinStepUp('การยกเลิกบิล')) return;   // ข้อ 8: ผู้จัดการใส่ PIN ซ้ำ

    this.showConfirm(msg, () => this.withMutation('การยกเลิกบิล', async () => {
      // (การลบแถวบิลในชีต Google ย้ายไปทำผ่าน outbox ด้านล่าง เพื่อ retry ได้เมื่อ void ตอนออฟไลน์)
      // ระหว่างกล่องยืนยันค้างอยู่ อาจมีคนออกจากระบบ/ข้อมูลถูกแทนทั้งชุด — ตรวจซ้ำ ณ จุดเขียนจริง
      if (!this.authorize('bill.void', 'การยกเลิกบิล')) return;
      // ระหว่างกล่องยืนยันค้างอยู่ อาจสลับผู้ใช้ หรือเลย 06:00 จนบิลกลายเป็นของวันก่อน — ตรวจซ้ำ ณ จุดเขียนจริง
      if (this.billAccessFor(tx) !== 'full') {
        this.showToast('บิลของวันก่อน — ยกเลิกได้เฉพาะเจ้าของร้าน', 'warning', 6000);
        return;
      }
      if (!this.state.transactions.includes(tx)) {
        this.showToast('บิลใบนี้ไม่อยู่ในข้อมูลปัจจุบันแล้ว (อาจถูกยกเลิก/กู้ข้อมูลไปก่อนหน้า)', 'warning', 6000);
        return;
      }
      if (!await this._voidBillLocked(tx, { moneyOutcome: outcome })) return;

      // ออนไลน์อยู่แล้วก็ส่ง outbox ทันที (ออฟไลน์จะค้างไว้ retry เอง)
      this.flushCloudOutbox();

      this.closeModal('modal-edit-transaction');
      this.filterReports(); // โหลดตารางใหม่
      try { this.renderQueueScreen(); this.renderDashboard(); } catch (e) { console.warn('[Void] วาดคิว/แดชบอร์ดใหม่ไม่สำเร็จ', e); }
      this.showToast('ลบรายการขายเรียบร้อยแล้ว', 'info');
    }));
  }
  // ยกเลิกบิลหนึ่งใบ "ในคิวงานบันทึก" (ผู้เรียกต้องถือคิวอยู่ และตรวจสิทธิ์มาแล้ว)
  // opts.reason = เหตุผลที่บันทึกลงประวัติการยกเลิก (เช่น ยกเลิกตามสถานะบนชีต)
  // คืน true เมื่อบันทึกลงเครื่องสำเร็จ · false เมื่อบันทึกไม่ได้ (คืนทุกอย่างกลับแล้ว)
  async _voidBillLocked(tx, opts) {
    const txId = tx.id;
    // ⚠️ เก็บสถานะเดิมไว้ก่อนแตะอะไรทั้งสิ้น — การยกเลิกบิลเปลี่ยน 4 อย่างพร้อมกัน
    // (รายการบิล · ประวัติ void · จำนวนครั้งของลูกค้า · คิวงานคลาวด์)
    //
    // ถ้าเขียนลงเครื่องไม่สำเร็จแล้วปล่อยค่าใหม่ค้างไว้ จะเกิดเคสที่แย่ที่สุดของระบบนี้:
    // บิลหายจากหน้าจอ → outbox สั่งลบแถวในชีตจริง → แต่ในเครื่องยังเป็นข้อมูลเก่า
    // เปิดแอปใหม่บิลกลับมาบน iPad แต่หายจากชีตถาวร เพราะ syncStatus ยังเป็น 'synced'
    // จึงไม่มีวันถูกส่งขึ้นชีตใหม่อีกเลย และไม่มีอะไรเตือนว่าสองที่ไม่ตรงกัน
    let voidRecordUnattributedCash = 0;   // เงินคืนที่ไม่มีกะเปิดให้ผูก (บันทึกไว้เป็นหลักฐาน)
    const prevTransactions = this.state.transactions;   // filter สร้างอาเรย์ใหม่ ตัวเดิมจึงยังครบทุกใบ
    const prevVoidLog = Array.isArray(this.state.voidLog) ? this.state.voidLog.slice() : this.state.voidLog;
    // slice ก็พอ ไม่ต้อง deep clone — ตรงนี้แค่ย้อน "การ push" ไม่มีใครไปแก้ข้างในรายการเดิม
    const prevOutbox = Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox.slice() : this.state.cloudOutbox;
    let custBefore = null;
    // ── เงินของบิลที่ยกเลิก "เกิดอะไรขึ้นจริง" (ข้อ 16) ────────────────────────────
    //   refunded = คืนเงินแล้ว · none = ไม่มีเงินเคลื่อนไหว · unknown = ยกเลิกตามสถานะบนชีต (ยังไม่มีใครบอก)
    // ผลต่อลิ้นชักคิดที่ planVoidCash ตัวเดียว (ตัวเดียวกับกล่องยืนยัน) — ต้องคิด "ก่อน" กลับรายการใด ๆ
    // บิลของกะนี้: กลับรายการคืน/เก็บของบิลนี้ในกะนี้ (ติดธง reversedByVoid ไว้เป็นหลักฐาน ไม่ลบทิ้ง)
    //   ไม่งั้นนับคืนซ้ำ (คืนไปแล้ว 100 + ยกเลิกหักอีก 300 = หักเกินเงินที่ลูกค้าจ่ายจริง)
    // บิลของกะก่อน: ห้ามกลับรายการ — เงินที่คืน/เก็บในกะนี้เคลื่อนไหวจริงแล้ว (ดูหมายเหตุที่ planVoidCash)
    const outcome = (opts && opts.moneyOutcome) || 'unknown';
    const plan = this.planVoidCash(tx, outcome);
    const shNow = this.state.shift;
    const hadAdjKey = !!shNow && Object.prototype.hasOwnProperty.call(shNow, 'cashAdjustments');
    const prevAdj = hadAdjKey ? (Array.isArray(shNow.cashAdjustments) ? shNow.cashAdjustments.slice() : shNow.cashAdjustments) : null;
    const at = Date.now();
    if (plan.reverseAdjustments && Array.isArray(shNow.cashAdjustments)) {
      shNow.cashAdjustments = shNow.cashAdjustments.map(a =>
        (a && typeof a === 'object' && a.billId === txId && !a.reversedByVoid) ? Object.assign({}, a, { reversedByVoid: at }) : a);
    }
    if (plan.push && plan.shiftOpen && Math.round(plan.push.amount * 100) !== 0) {
      const entry = { id: `vad-${at}-${Math.random().toString(36).slice(2, 7)}`, billId: txId, kind: plan.push.kind,
        amount: plan.push.amount, at, by: this.currentUser ? this.currentUser.name : '', voided: true };
      if (plan.push.note) entry.note = plan.push.note;
      shNow.cashAdjustments = (Array.isArray(shNow.cashAdjustments) ? shNow.cashAdjustments : []).concat([entry]);
    }
    const cashEffect = plan.cashEffect;               // ผลต่อลิ้นชักของกะที่เปิดอยู่ (บันทึกไว้ในประวัติการยกเลิกด้วย)
    voidRecordUnattributedCash = plan.unattributed;   // เงินคืนที่ไม่มีกะเปิดให้ผูก

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

    // คิวงานของบิลนี้ที่ยังไม่เสร็จ ต้องออกจากคิวด้วย (ข้อ 11) — เดิมค้างเป็นงานผีให้ช่างเห็น
    // ผูกด้วยเลขบิล (txId) เท่านั้น — คิวรุ่นเก่าที่ไม่มีเลขบิล ไม่เดาจากชื่อลูกค้า/ยอด
    const prevQueue = Array.isArray(this.state.queue) ? this.state.queue : this.state.queue;
    if (Array.isArray(this.state.queue)) {
      this.state.queue = this.state.queue.filter(q => !(q && q.txId === txId && q.status !== 'completed'));
    }

    // บันทึกประวัติการยกเลิกบิล (ใครยกเลิก / เมื่อไหร่ / ยอดเท่าไร)
    const voidRecord = {
      billId: tx.id, date: Date.now(),
      // ⚠️ date ข้างบนคือ "เวลาที่กดยกเลิก" ไม่ใช่วันของบิล — สองอย่างนี้คนละวันได้
      // ต้องเก็บวัน/เดือนทำการเดิมของบิลไว้ด้วย ไม่งั้นย้อนกลับไปหาแท็บเดือนที่บิลอยู่ไม่ได้
      billDate: tx.date,
      billMonthKey: this.getBusinessMonthKey(tx.date),
      by: this.currentUser ? this.currentUser.name : '',
      amount: tx.total, customer: tx.customerName || '', services: tx.services || [],
      // ข้อ 16: เงินของบิลนี้เกิดอะไรขึ้นจริง + กระทบลิ้นชักกะที่เปิดอยู่เท่าไร (ตรวจย้อนหลังได้)
      moneyOutcome: outcome, cashEffect: Math.round(cashEffect * 100) / 100
    };
    if (voidRecordUnattributedCash) voidRecord.cashRefundUnattributed = voidRecordUnattributedCash;
    if (opts && opts.reason) voidRecord.reason = String(opts.reason);
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
      this.state.queue        = prevQueue;
      if (shNow) { if (hadAdjKey) shNow.cashAdjustments = prevAdj; else delete shNow.cashAdjustments; }
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
      return false;
    }

    return true;
  }

  // ผู้ให้บริการที่ไม่อยู่ในรายชื่อพนักงานแล้ว แต่ยังมีงานในบิล — { id, name } ชื่อจากบิลใบล่าสุดของคนนั้น
  deletedStaffInBills() {
    const current = new Set((Array.isArray(this.state.staff) ? this.state.staff : []).map(st => st && st.id));
    const found = new Map();   // id → { name, at }
    (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
      if (!tx || !Array.isArray(tx.details)) return;
      const at = new Date(tx.date).getTime() || 0;
      tx.details.forEach(d => {
        if (!d || d.staffId === undefined || d.staffId === null || d.staffId === '' || current.has(d.staffId)) return;
        const prev = found.get(d.staffId);
        if (!prev || at >= prev.at) found.set(d.staffId, { name: String(d.staffName || 'ไม่ระบุชื่อ'), at });
      });
    });
    return [...found.entries()].map(([id, v]) => ({ id: String(id), name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
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
      // พนักงานที่ถูกลบไปแล้วแต่ยังมีงานอยู่ในบิล (รอบตรวจ 5 ข้อ 8) — เดิมไม่อยู่ในตัวเลือก
      // ลาออกกลางเดือนแล้วลบชื่อ = ดูยอด/ค่าคอม "รายคน" ของเดือนนั้นในแอปไม่ได้ (ตารางรวมกับชีตยังมีอยู่)
      this.deletedStaffInBills().forEach(st => {
        optionsHtml += `<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (ลบแล้ว)</option>`;
      });
      staffFilter.innerHTML = optionsHtml;
      staffFilter.value = currentSelected;
      if (staffFilter.value !== currentSelected) staffFilter.value = 'all';   // ตัวเลือกเดิมหายไปแล้ว
    }
    
    this.filterReports();
  }

  // ─── ส่งสรุปไป Sheets แบบ manual จากหน้ารายงาน ──────────────────────────
  async syncSummaryNow() {
    if (!this.authorize('summary.send', 'ส่งสรุปขึ้นชีต')) return;
    if (this.state.selectedReportType === 'monthly' && !this.canViewMonthlyReport()) {
      this.showToast('สรุปรายเดือนส่งได้เฉพาะเจ้าของร้าน', 'warning'); return;
    }
    if (!this.canWriteData('ส่งสรุปขึ้นชีต')) return;   // ให้ผู้ใช้ได้ข้อความ ไม่ใช่กดแล้วเงียบ
    if (!this.hasCloudSyncConfig()) {
      this.showToast(this.getCloudSetupMessage(), 'info');
      return;
    }

    const type    = this.state.selectedReportType; // 'daily' | 'monthly'
    const dateVal = this.reportDateValue();   // ผู้จัดการ = วันนี้เท่านั้น
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
    // ⚠️ เดิมไม่มีด่านสิทธิ์ในตัว — พนักงานเรียกฟังก์ชันนี้ตรง ๆ แล้วเปลี่ยนเลขพร้อมเพย์/PIN เจ้าของได้
    if (!this.authorize('settings.write', 'แก้การตั้งค่าร้าน')) return false;
    return this.withMutation('การตั้งค่า', () => this._saveShopSettingsLocked());
  }

  async _saveShopSettingsLocked() {
    if (!this.authorize('settings.write', 'แก้การตั้งค่าร้าน')) return false;
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
      } else if (/^\d{13}$/.test(ppVal) && !isValidThaiId13(ppVal)) {
        // เลข 13 หลักมีหลักตรวจสอบ (หลักสุดท้าย) — พิมพ์ผิดหลักเดียว QR จะชี้ไปเลขอื่น/เลขที่ไม่มีจริง
        this.showToast('เลขประจำตัว 13 หลักไม่ถูกต้อง (หลักตรวจสอบไม่ตรง — น่าจะพิมพ์ผิด) จึงยังไม่บันทึกเลขพร้อมเพย์', 'warning', 6000);
        promptPayInput.value = this.shopPromptPayId || '';
      } else if (/^(0\d{9}|\d{13}|\d{15})$/.test(ppVal)) {
        this.shopPromptPayId = ppVal;
      } else {
        // ผิดรูปแบบ — เตือนและคงค่าเดิมไว้ (ไม่ทับด้วยค่าที่ผิด) แต่ยังบันทึกการตั้งค่าอื่นต่อไป
        this.showToast('เลขพร้อมเพย์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet 15 หลัก จึงยังไม่บันทึกเลขพร้อมเพย์', 'warning', 5000);
        promptPayInput.value = this.shopPromptPayId || '';
      }
    }
    // ข้อ 10: PIN เจ้าของไม่ได้เปลี่ยนจากหน้านี้แล้ว (เดิมพิมพ์ครั้งเดียว ออกจากช่องแล้วบันทึกทันที
    // พิมพ์ผิดหลักเดียว = เข้าสิทธิ์เจ้าของไม่ได้อีกเลย) — ใช้ปุ่ม "เปลี่ยน PIN เจ้าของ" (changeOwnerPin)
    if (pinInput) pinInput.value = '';
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
      if (!s || typeof s !== 'object') return;
      if (s.accessLevel === undefined) { s.accessLevel = 'staff'; changed = true; }
      if (s.pin === undefined) { s.pin = null; changed = true; }
    });
    // หน้าต่างรองห้ามเขียน (จะเขียนทับยอดของหน้าต่างหลัก) — ค่าที่เติมอยู่ในหน่วยความจำก็พอใช้งาน
    if (!changed || this.loadFailed || this.isReadOnlyWindow) return;
    await this.withMutation('เติมข้อมูลบัญชีพนักงาน', async () => {
      await this.saveState();
    });
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
    // ⚠️ ยกเว้นช่วงที่ "รอคนตอบ" (ถามรหัสเจ้าของ / ถามว่าจะกู้ไฟล์ที่เสียต่อไหม) — เดิมเลื่อนนาฬิกาตลอด
    // เจ้าของทิ้งเครื่องไว้ตรงนั้นก็ไม่ถูกเตะออกเลย ใครมากดยกเลิกทีหลังได้สิทธิ์เจ้าของเต็ม ๆ
    if (this.restoreBusy && !this.isAwaitingUserAnswer()) { this._lastActivityTs = Date.now(); return; }
    if (Date.now() - this._lastActivityTs < OWNER_IDLE_TIMEOUT_MS) return;
    const who = this.currentUser ? this.currentUser.id : null;
    this.cancelPendingDialogs();
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
    // รหัสเจ้าของ (Owner key) จำไว้แค่ในหน่วยความจำของ "รอบล็อกอินนี้" — ออกจากระบบ = ลืมทันที
    // ไม่งั้นพนักงานที่ล็อกอินต่อจะเปิดไฟล์สำรอง/บิลทั้งเดือนได้ด้วยรหัสที่เจ้าของกรอกค้างไว้
    this._ownerKey = null;
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
    // ล็อกเฉพาะบัญชีที่ถูกเดา — บัญชีอื่นเข้าได้ตามปกติ (รอบตรวจ 4 ข้อ A2)
    const waitSec = this.loginGuardWaitSec(uid);
    if (waitSec > 0) {
      this.showToast(`บัญชีนี้ใส่ PIN ผิดหลายครั้ง — รออีก ${this.formatWait(waitSec)} แล้วลองใหม่ (บัญชีอื่นยังเข้าได้ตามปกติ)`, 'error', 6000);
      return;
    }
    const hash = await this.hashPin(pin);
    if (uid === '__owner__') {
      if (hash === this.ownerPin) {
        // PIN ยังเป็นค่าเริ่มต้น (อยู่ในคู่มือสาธารณะ) → ต้องตั้ง PIN ใหม่ก่อน ถึงจะได้สิทธิ์เจ้าของ
        if (pin === DEFAULT_OWNER_PIN) {
          if (pinEl) pinEl.value = '';
          const changed = await this.forceOwnerPinChange();
          if (!changed) return;
        }
        this.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
        this.currentRole = 'owner';
        return this.completeLogin();
      }
    } else {
      const st = (this.state.staff || []).find(s => s.id === uid);
      if (st && st.pin && hash === st.pin) {
        // ข้อ 7: บัญชีสิทธิ์เจ้าของ/ผู้จัดการต้องใช้ PIN 6 หลัก — PIN เดิมที่สั้นกว่า ต้องตั้งใหม่ก่อนเข้า
        // (ใส่ PIN เดิมถูกแล้ว = พิสูจน์ตัวตนแล้ว จึงให้ตั้งใหม่ได้เลย ไม่ต้องรอเจ้าของ)
        if (PRIVILEGED_LEVELS.includes(st.accessLevel) && !STRONG_PIN_RE.test(pin)) {
          if (pinEl) pinEl.value = '';
          this.loginGuardReset(st.id);
          const changed = await this.forceStaffPinUpgrade(st);
          if (!changed) return;
        }
        this.currentUser = { id: st.id, name: st.name };
        this.currentRole = st.accessLevel || 'staff';
        return this.completeLogin();
      }
    }
    this.vibrateDevice(200);
    const lockSec = this.loginGuardFail(uid);
    if (lockSec > 0) this.showToast(`ใส่ PIN ผิดหลายครั้ง — บัญชีนี้ล็อกชั่วคราว ${this.formatWait(lockSec)} (บัญชีอื่นยังเข้าได้)`, 'error', 6000);
    else this.showToast('PIN ไม่ถูกต้อง', 'error');
    if (pinEl) { pinEl.value = ''; pinEl.focus(); }
  }

  // ── ด่านกันเดา PIN (ข้อ 7 รอบตรวจ 26 ก.ย. 2569 · แยกรายบัญชีตามรอบตรวจ 4 ข้อ A2) ──────────
  // ผิดครบ 5 ครั้ง → รอ 30 วิ · ผิดต่อจากนั้นทุกครั้ง รอเพิ่มเป็นเท่าตัว (1 นาที · 2 · 4 · 8 · สูงสุด 15 นาที)
  // ตัวนับไม่รีเซ็ตตอนพ้นช่วงรอ — รีเซ็ตเมื่อใส่ PIN ถูกเท่านั้น
  // เดิม: ผิด 5 รอ 30 วิ แล้วเริ่มนับใหม่ → เดา PIN 4 หลักครบทุกค่าได้ในราว 17 ชม.
  // ⚠️ นับ "แยกรายบัญชี" — เดิมเป็นตัวนับก้อนเดียวทั้งเครื่อง: พนักงานกด PIN ตัวเองผิด 5 ครั้ง
  //    เจ้าของก็เข้าไม่ได้ และผู้จัดการที่ล็อกอินค้างอยู่ยกเลิกบิล/ปิดกะไม่ได้ไปด้วย (iPad เครื่องเดียว = ร้านหยุด)
  //    ตอนนี้ล็อกเฉพาะบัญชีที่ถูกเดา · การถาม PIN ซ้ำของผู้จัดการนับในบัญชีของผู้จัดการคนนั้น
  //    การอนุมัติด้วย PIN ผู้จัดการ (ค่าใช้จ่ายเกินเพดาน) นับในช่องแยก APPROVAL_GUARD_KEY — ไม่ทำให้บัญชีใครถูกล็อก
  // เก็บใน localStorage 'epos_login_guard' = { v: 2, accounts: { <รหัสบัญชี>: { fails, lockUntil } } } (refresh ไม่หลุด)
  // รูปแบบเดิม (ก้อนเดียว ไม่รู้ว่าเป็นของบัญชีไหน) ถูกทิ้งแล้วเริ่มนับใหม่รายบัญชี — เกิดครั้งเดียวตอนอัปเดต
  _guardKey(uid) {
    return (typeof uid === 'string' && uid) ? uid.slice(0, 128) : '__none__';
  }
  _loadLoginGuard() {
    if (this._loginGuardLoaded && this._loginGuard) return;
    const map = Object.create(null);   // ไม่มี prototype — รหัสบัญชีแปลก ๆ อย่าง "__proto__" ใช้เป็นคีย์ได้ปลอดภัย
    try {
      const g = JSON.parse(localStorage.getItem('epos_login_guard') || '{}');
      const acc = (g && g.v === 2 && g.accounts && typeof g.accounts === 'object') ? g.accounts : {};
      Object.keys(acc).forEach(k => {
        const r = acc[k];
        if (!r || typeof r !== 'object') return;
        const fails = Math.max(0, Math.floor(Number(r.fails) || 0));
        const lockUntil = Number(r.lockUntil) || 0;
        if (fails > 0) map[this._guardKey(k)] = { fails, lockUntil };
      });
    } catch (e) { /* ค่าใน storage เสีย — เริ่มนับใหม่ */ }
    this._loginGuard = map;
    this._loginGuardLoaded = true;
  }
  _saveLoginGuard() {
    const accounts = Object.create(null);
    const map = this._loginGuard || {};
    Object.keys(map).forEach(k => {
      const r = map[k];
      if (r && r.fails > 0) accounts[k] = { fails: r.fails, lockUntil: r.lockUntil || 0 };
    });
    try {
      if (Object.keys(accounts).length === 0) localStorage.removeItem('epos_login_guard');
      else localStorage.setItem('epos_login_guard', JSON.stringify({ v: 2, accounts }));
    } catch (e) {}
  }
  // วินาทีที่บัญชีนี้ยังต้องรอ (0 = ใส่ PIN ได้)
  loginGuardWaitSec(uid) {
    this._loadLoginGuard();
    const r = this._loginGuard[this._guardKey(uid)];
    const left = (r ? (r.lockUntil || 0) : 0) - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }
  // นับว่าบัญชีนี้ใส่ผิดอีกหนึ่งครั้ง — คืนจำนวนวินาทีที่ถูกล็อก (0 = ยังไม่ล็อก)
  loginGuardFail(uid) {
    this._loadLoginGuard();
    const k = this._guardKey(uid);
    const r = this._loginGuard[k] || (this._loginGuard[k] = { fails: 0, lockUntil: 0 });
    r.fails += 1;
    let lockSec = 0;
    if (r.fails >= LOGIN_LOCK_AFTER_FAILS) {
      const steps = r.fails - LOGIN_LOCK_AFTER_FAILS;   // 0,1,2,...
      lockSec = Math.min(LOGIN_LOCK_BASE_SEC * Math.pow(2, steps), LOGIN_LOCK_MAX_SEC);
      r.lockUntil = Date.now() + lockSec * 1000;
    }
    this._saveLoginGuard();
    return lockSec;
  }
  // ใส่ PIN ถูก — ล้างตัวนับของบัญชีนี้บัญชีเดียว (ตัวนับของบัญชีอื่นยังอยู่)
  loginGuardReset(uid) {
    this._loadLoginGuard();
    delete this._loginGuard[this._guardKey(uid)];
    this._saveLoginGuard();
  }
  formatWait(sec) {
    return sec >= 60 ? `${Math.ceil(sec / 60)} นาที` : `${sec} วินาที`;
  }

  // กล่องถามรหัสแบบซ่อนตัวอักษร (ใช้หน้าต่าง prompt เดิม) — คืนข้อความที่พิมพ์ หรือ null เมื่อกดยกเลิก
  askSecret(msg) {
    return new Promise(resolve => {
      const input = document.getElementById('prompt-modal-input');
      const attrs = !!(input && typeof input.getAttribute === 'function' && typeof input.setAttribute === 'function' && typeof input.removeAttribute === 'function');
      const prevType = input ? input.type : null;
      const prevMode = attrs ? input.getAttribute('inputmode') : null;
      if (input) { input.type = 'password'; if (attrs) input.setAttribute('inputmode', 'numeric'); }
      let settled = false;
      const done = (v) => {
        if (settled) return; settled = true;
        if (input) {
          input.type = prevType || 'text'; input.value = '';
          if (attrs) { if (prevMode === null) input.removeAttribute('inputmode'); else input.setAttribute('inputmode', prevMode); }
        }
        resolve(v);
      };
      this.showPromptModal(msg, '', (v) => done(String(v == null ? '' : v).trim()), () => done(null));
    });
  }

  // ── ข้อ 8: ถาม PIN ซ้ำก่อนทำรายการเสี่ยง (ยกเลิกบิล · ปิดกะ · บันทึกเงินส่วนต่าง) ─────────
  // ผู้จัดการไม่ถูกตัดตอนไม่แตะจอ (อยู่ได้ทั้งกะ) — ใครหยิบเครื่องที่ค้างล็อกอินผู้จัดการไว้
  // จะยกเลิกบิลแบบ "คืนเงินแล้ว" แล้วเอาเงินสดออกได้ ต้องใส่ PIN ของคนที่ล็อกอินอยู่ทุกครั้ง
  // เจ้าของ (รวมบัญชีสิทธิ์เจ้าของ) ถูกตัดเมื่อไม่แตะจอ 5 นาทีอยู่แล้ว จึงไม่ถามซ้ำ
  async confirmPinStepUp(actionLabel) {
    if (this.currentRole !== 'manager') return true;
    const st = (this.state.staff || []).find(s => this.currentUser && s.id === this.currentUser.id);
    if (!st || !st.pin) { this.showToast('ไม่พบ PIN ของบัญชีที่ล็อกอินอยู่ — ออกจากระบบแล้วเข้าใหม่', 'error'); return false; }
    // นับในบัญชีของผู้จัดการคนนี้ — PIN ที่พนักงานคนอื่นกดผิดไม่ทำให้ผู้จัดการยกเลิกบิล/ปิดกะไม่ได้
    const waitSec = this.loginGuardWaitSec(st.id);
    if (waitSec > 0) { this.showToast(`ใส่ PIN ของ ${st.name} ผิดหลายครั้ง — รออีก ${this.formatWait(waitSec)} แล้วลองใหม่`, 'error'); return false; }
    const pin = await this.askSecret(`ใส่ PIN ของ ${st.name} เพื่อยืนยัน${actionLabel}`);
    if (pin === null || pin === '') return false;
    const hash = await this.hashPin(pin);
    if (hash === st.pin) { this.loginGuardReset(st.id); return true; }
    const lockSec = this.loginGuardFail(st.id);
    this.showToast(lockSec > 0 ? `PIN ไม่ถูกต้อง — ล็อกชั่วคราว ${this.formatWait(lockSec)}` : `PIN ไม่ถูกต้อง — ยังไม่ได้${actionLabel}`, 'error', 5000);
    return false;
  }

  // ── ข้อ 7: บัญชีสิทธิ์เจ้าของ/ผู้จัดการที่ PIN ยังไม่ถึง 6 หลัก — ตั้งใหม่ตอนล็อกอิน ─────────────
  async forceStaffPinUpgrade(st) {
    if (this.loadFailed || this.isReadOnlyWindow) {
      this.showToast('บัญชีนี้ต้องตั้ง PIN 6 หลักก่อนใช้งาน แต่หน้าต่างนี้บันทึกข้อมูลไม่ได้ — ปิดหน้าต่างที่เปิดซ้ำแล้วใช้หน้าต่างเดิม', 'error', 9000);
      return false;
    }
    let why = '';
    for (let round = 0; round < 3; round++) {
      const p1 = await this.askSecret((why ? why + ' — ' : '') +
        `บัญชีสิทธิ์${st.accessLevel === 'owner' ? 'เจ้าของ' : 'ผู้จัดการ'}ต้องใช้ PIN 6 หลัก — ตั้ง PIN ใหม่ของ ${st.name}`);
      if (p1 === null) break;
      if (!STRONG_PIN_RE.test(p1)) { why = 'PIN ต้องเป็นตัวเลข 6 หลัก'; continue; }
      if (p1 === DEFAULT_OWNER_PIN) { why = 'ห้ามใช้ 123456'; continue; }
      const p2 = await this.askSecret('ใส่ PIN ใหม่อีกครั้งเพื่อยืนยัน');
      if (p2 === null) break;
      if (p2 !== p1) { why = 'PIN สองครั้งไม่ตรงกัน'; continue; }
      const hash = await this.hashPin(p1);
      let saved = false;
      try {
        saved = await this.withMutation('ตั้ง PIN ใหม่', async () => {
          const cur = (this.state.staff || []).find(s => s.id === st.id);
          if (!cur) return false;
          const prevPin = cur.pin;
          cur.pin = hash;
          return this.persistOrRollback('ตั้ง PIN ใหม่', () => { cur.pin = prevPin; });
        });
      } catch (e) { saved = false; }
      if (!saved) {
        this.showToast('บันทึก PIN ใหม่ไม่สำเร็จ — ยังเข้าสู่ระบบไม่ได้ ลองใหม่อีกครั้ง', 'error', 8000);
        return false;
      }
      this.showToast('ตั้ง PIN ใหม่แล้ว — ใช้ PIN นี้ในการเข้าสู่ระบบครั้งต่อไป', 'success', 6000);
      return true;
    }
    this.showToast((why ? why + ' — ' : '') + 'ต้องตั้ง PIN 6 หลักก่อน จึงจะเข้าสู่ระบบบัญชีนี้ได้', 'warning', 7000);
    return false;
  }

  // PIN เจ้าของยังเป็นค่าเริ่มต้นหรือไม่ (เครื่องใหม่ · เพิ่งกู้ข้อมูลลงเครื่องใหม่ · PIN เสียแล้วถูกรีเซ็ต)
  async isDefaultOwnerPin() {
    if (!this._defaultPinHash) this._defaultPinHash = await this.hashPin(DEFAULT_OWNER_PIN);
    return this.ownerPin === this._defaultPinHash;
  }

  // ── ข้อ 10: เปลี่ยน PIN เจ้าของจากหน้าตั้งค่า — ถาม PIN เดิม แล้ว PIN ใหม่ 2 รอบ ─────────────
  async changeOwnerPin() {
    if (!this.authorize('settings.write', 'เปลี่ยน PIN เจ้าของ')) return false;
    if (this.currentUser && this.currentUser.id !== '__owner__') {
      this.showToast('เปลี่ยน PIN เจ้าของหลักได้เฉพาะตอนเข้าสู่ระบบด้วยบัญชี "เจ้าของร้าน" (บัญชีเจ้าของสำรองเปลี่ยน PIN ตัวเองที่หน้าพนักงาน)', 'warning', 7000);
      return false;
    }
    if (!this.canWriteData('เปลี่ยน PIN เจ้าของ')) return false;
    const waitSec = this.loginGuardWaitSec('__owner__');
    if (waitSec > 0) { this.showToast(`ใส่ PIN เจ้าของผิดหลายครั้ง — รออีก ${this.formatWait(waitSec)} แล้วลองใหม่`, 'error'); return false; }
    const cur = await this.askSecret('ใส่ PIN เจ้าของปัจจุบัน');
    if (cur === null || cur === '') return false;
    if (await this.hashPin(cur) !== this.ownerPin) {
      const lockSec = this.loginGuardFail('__owner__');
      this.showToast(lockSec > 0 ? `PIN ปัจจุบันไม่ถูกต้อง — ล็อกชั่วคราว ${this.formatWait(lockSec)}` : 'PIN ปัจจุบันไม่ถูกต้อง — ยังไม่ได้เปลี่ยน', 'error', 5000);
      return false;
    }
    this.loginGuardReset('__owner__');
    let why = '';
    for (let round = 0; round < 3; round++) {
      const p1 = await this.askSecret((why ? why + ' — ' : '') + 'PIN เจ้าของใหม่ (ตัวเลข 6 หลัก)');
      if (p1 === null) return false;
      if (!STRONG_PIN_RE.test(p1)) { why = 'PIN ต้องเป็นตัวเลข 6 หลัก'; continue; }
      if (p1 === DEFAULT_OWNER_PIN) { why = 'ห้ามใช้ 123456'; continue; }
      const p2 = await this.askSecret('ใส่ PIN ใหม่อีกครั้งเพื่อยืนยัน');
      if (p2 === null) return false;
      if (p2 !== p1) { why = 'PIN สองครั้งไม่ตรงกัน'; continue; }
      const hash = await this.hashPin(p1);
      let saved = false;
      try {
        saved = await this.withMutation('เปลี่ยน PIN เจ้าของ', async () => {
          const ok = await this.saveKeys([{ key: 'ownerPin', value: hash }]);
          if (ok) this.ownerPin = hash;   // เปลี่ยนในหน่วยความจำเฉพาะเมื่อลงเครื่องสำเร็จแล้ว
          return ok;
        });
      } catch (e) { saved = false; }
      if (!saved) { this.showToast('บันทึก PIN ใหม่ไม่สำเร็จ — PIN เดิมยังใช้ได้', 'error', 8000); return false; }
      this.showToast('เปลี่ยน PIN เจ้าของแล้ว — จด PIN ใหม่เก็บไว้ ถ้าลืมต้องกู้ข้อมูลลงเครื่องใหม่', 'success', 7000);
      return true;
    }
    this.showToast((why ? why + ' — ' : '') + 'ยังไม่ได้เปลี่ยน PIN', 'warning', 6000);
    return false;
  }

  // ── บังคับตั้ง PIN เจ้าของใหม่ (เจ้าของสั่ง 24 ก.ย. 2569) ──────────────────────────
  // ค่าเริ่มต้น 123456 เขียนไว้ในคู่มือกู้ข้อมูลที่เปิดสาธารณะ — ถ้าลืมเปลี่ยนหลังกู้ข้อมูล ใครก็เข้าสิทธิ์เจ้าของได้
  // ถาม PIN ใหม่ 2 รอบ (ต้องเป็นตัวเลข 6 หลัก และไม่ใช่ค่าเริ่มต้น) แล้วบันทึกลงเครื่องให้สำเร็จก่อนเท่านั้น
  // คืน true เมื่อบันทึก PIN ใหม่ลงเครื่องแล้ว · false = ยกเลิก/บันทึกไม่ได้ (ยังไม่ได้สิทธิ์เจ้าของ)
  async forceOwnerPinChange() {
    if (this.loadFailed || this.isReadOnlyWindow) {
      this.showToast('ต้องตั้ง PIN เจ้าของใหม่ก่อนใช้งาน แต่หน้าต่างนี้บันทึกข้อมูลไม่ได้ — ปิดหน้าต่างที่เปิดซ้ำแล้วใช้หน้าต่างเดิม', 'error', 9000);
      return false;
    }
    const ask = (msg) => this.askSecret(msg);
    let why = '';
    for (let round = 0; round < 3; round++) {
      const p1 = await ask((why ? why + ' — ' : '') +
        'PIN เจ้าของยังเป็นค่าเริ่มต้น (123456) ซึ่งใครก็รู้ — ตั้ง PIN ใหม่เป็นตัวเลข 6 หลักก่อนใช้งาน');
      if (p1 === null) break;
      if (!/^\d{6}$/.test(p1)) { why = 'PIN ต้องเป็นตัวเลข 6 หลัก'; continue; }
      if (p1 === DEFAULT_OWNER_PIN) { why = 'ห้ามใช้ 123456'; continue; }
      const p2 = await ask('ใส่ PIN ใหม่อีกครั้งเพื่อยืนยัน');
      if (p2 === null) break;
      if (p2 !== p1) { why = 'PIN สองครั้งไม่ตรงกัน'; continue; }
      const hash = await this.hashPin(p1);
      let saved = false;
      try {
        saved = await this.withMutation('ตั้ง PIN เจ้าของใหม่', async () => {
          const ok = await this.saveKeys([{ key: 'ownerPin', value: hash }]);
          if (ok) this.ownerPin = hash;   // เปลี่ยนในหน่วยความจำเฉพาะเมื่อลงเครื่องสำเร็จแล้ว
          return ok;
        });
      } catch (e) { saved = false; }
      if (!saved) {
        this.showToast('บันทึก PIN ใหม่ไม่สำเร็จ — ยังเข้าสิทธิ์เจ้าของไม่ได้ ลองใหม่อีกครั้ง', 'error', 8000);
        return false;
      }
      this.showToast('ตั้ง PIN เจ้าของใหม่แล้ว — ใช้ PIN นี้ในการเข้าสู่ระบบครั้งต่อไป', 'success', 6000);
      return true;
    }
    this.showToast((why ? why + ' — ' : '') + 'ต้องตั้ง PIN เจ้าของใหม่ก่อน จึงจะเข้าสู่ระบบเจ้าของได้', 'warning', 7000);
    return false;
  }

  completeLogin() {
    this.loginGuardReset(this.currentUser ? this.currentUser.id : null);
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
      if (Date.now() - sess.ts > ttlMs) { await this.clearSavedSession(); return false; }
      if (sess.uid === '__owner__') {
        // เซสชันเจ้าของที่ค้างจากก่อนมีกติกาบังคับเปลี่ยน PIN — ต้องผ่านหน้าล็อกอิน (ซึ่งจะบังคับตั้ง PIN ใหม่)
        if (await this.isDefaultOwnerPin()) { await this.clearSavedSession(); return false; }
        this.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
        this.currentRole = 'owner';
      } else {
        const st = (this.state.staff || []).find(s => s.id === sess.uid);
        if (!st || !st.pin) { await this.clearSavedSession(); return false; }
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
  // ลบการล็อกอินที่จำไว้ในเครื่อง — ทำได้เฉพาะหน้าต่างหลัก
  // (หน้าต่างรองที่เปิดค้าง/ถูกเตะออกเพราะไม่ได้ใช้ ต้องไม่ลบ session ของหน้าต่างหลักที่กำลังขายอยู่)
  async clearSavedSession() {
    if (this.isReadOnlyWindow) return;
    try { await db.state.delete('session'); } catch (e) {}
  }

  logout(reason, preselectUid) {
    this.clearSavedSession();
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
    // 6.2 ช่องเลือกวัน — ผู้จัดการถูกล็อกไว้ที่วันนี้ · เจ้าของปลดล็อก (ต้องทำทุกครั้งที่สลับผู้ใช้)
    this.applyReportDateLock();

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
  //
  // ⚠️ รอบตรวจ 4 ข้อ A10: บน iPad แบบแอปหน้าจอโฮม การดาวน์โหลดอาจไม่เกิดขึ้นเลยโดยไม่มีอะไรแจ้ง
  // แล้วเจ้าของคิดว่ามีไฟล์สำรองแล้ว — ตอนนี้:
  //   1) เครื่องที่รองรับ "เมนูแชร์" พร้อมไฟล์ (iPad/iPhone) → เปิดเมนูแชร์ ให้เลือก "บันทึกไปยังไฟล์" ได้ตรง ๆ
  //      และรู้ผลจริง (บันทึก/กดยกเลิก) · เมนูแชร์ใช้ไม่ได้ → ถอยไปดาวน์โหลดแบบเดิม
  //   2) ทุกทางขึ้นข้อความบอกผล และบอกให้ไปตรวจไฟล์ในแอป "ไฟล์"
  // คืน true เมื่อ "เริ่ม" ส่งออกได้ (ผลของเมนูแชร์มาทีหลัง — เก็บ promise ไว้ที่ this._exportP)
  // opts.downloadOnly — ไม่เปิดเมนูแชร์ (ใช้ตอนเก็บสำเนาก่อนกู้ข้อมูล ซึ่งอยู่กลางงานอื่น)
  // opts.quiet — ไม่ขึ้นข้อความสำเร็จ (ผู้เรียกบอกผลเอง) · ข้อความผิดพลาดยังขึ้นเสมอ
  exportData(opts) {
    if (!this.requireOwnerForDataAction('ส่งออกไฟล์สำรอง')) return false;
    const downloadOnly = !!(opts && opts.downloadOnly);
    const quietOk = !!(opts && opts.quiet);
    this._exportP = null;
    try {
      const json = JSON.stringify(this.buildBackupPayload(), null, 2);
      const fileName = `erotica_pos_backup_${this.getLocalISODate(new Date())}.json`;
      // สร้างไฟล์และเรียกเมนูแชร์ "ทันที" ในจังหวะที่ผู้ใช้กดปุ่ม — ถ้ารอก่อน Safari จะไม่ยอมเปิดเมนูแชร์
      const file = downloadOnly ? null : this.makeShareableFile(json, fileName);
      if (file) {
        let sharing;
        try { sharing = navigator.share({ files: [file], title: fileName }); } catch (e) { sharing = Promise.reject(e); }
        this._exportP = Promise.resolve(sharing).then(() => {
          if (!quietOk) this.showToast(`ส่งไฟล์สำรองแล้ว — ถ้าเลือก "บันทึกไปยังไฟล์" ให้เปิดแอป "ไฟล์" ตรวจว่ามี ${fileName} อยู่จริง`, 'success', 9000);
          return true;
        }, (err) => {
          if (err && err.name === 'AbortError') {
            this.showToast('ยกเลิกการส่งออกแล้ว — ยังไม่ได้บันทึกไฟล์สำรอง', 'warning', 6000);
            return false;
          }
          console.warn('share failed -> download', err);
          return this.downloadExportFile(json, fileName, quietOk);
        });
        this.vibrateDevice(50);
        return true;
      }
      return this.downloadExportFile(json, fileName, quietOk);
    } catch (err) {
      console.error('export failed', err);
      this.showToast('ส่งออกไฟล์สำรองไม่สำเร็จ: ' + (err.message || err), 'error', 7000);
      return false;
    }
  }
  // ไฟล์สำหรับเมนูแชร์ — คืน null เมื่อเครื่องนี้แชร์ไฟล์ชนิดนี้ไม่ได้ (คอม/Android ส่วนใหญ่ไม่รับ .json)
  makeShareableFile(text, fileName) {
    try {
      if (typeof navigator === 'undefined' || !navigator || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
      if (typeof File !== 'function') return null;
      const file = new File([text], fileName, { type: 'application/json' });
      return navigator.canShare({ files: [file] }) ? file : null;
    } catch (e) { return null; }
  }
  // ดาวน์โหลดแบบลิงก์ — รู้ไม่ได้ว่าไฟล์ลงเครื่องจริงไหม จึงบอกให้ผู้ใช้ไปตรวจเอง
  downloadExportFile(text, fileName, quietOk) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a); // Safari/Firefox ต้องให้ปุ่มอยู่ในหน้าจริงก่อนถึงจะกดได้
      a.click();
      // อย่าเพิ่งคืนหน่วยความจำทันที — บาง Safari ยังอ่านไฟล์ไม่เสร็จแล้วดาวน์โหลดจะพัง
      setTimeout(() => {
        try { a.remove(); URL.revokeObjectURL(url); } catch (e) { /* ปล่อยได้ */ }
      }, 60000);
      this.vibrateDevice(50);
      if (!quietOk) {
        this.showToast(`สั่งดาวน์โหลด ${fileName} แล้ว — เปิดแอป "ไฟล์" (โฟลเดอร์ ดาวน์โหลด) ตรวจว่ามีไฟล์จริง ` +
          'ถ้าไม่มี แปลว่าเครื่องนี้บล็อกการดาวน์โหลด ให้ใช้สำรองขึ้น Google Drive แทน', 'info', 10000);
      }
      return true;
    } catch (err) {
      console.error('download export failed', err);
      this.showToast('ส่งออกไฟล์สำรองไม่สำเร็จ: ' + (err.message || err), 'error', 7000);
      return false;
    }
  }

  // ── สำเนา "ก่อนกู้ข้อมูล" ที่เก็บไว้ในเครื่อง ──────────────────────────────
  // ทำไมไม่พึ่งไฟล์ดาวน์โหลดอย่างเดียว: บน iPad ที่ติดตั้งเป็นแอป การดาวน์โหลดอาจถูกบล็อกเงียบ ๆ
  // และเราไม่มีทางรู้ว่าไฟล์ลงเครื่องจริงหรือเปล่า ถ้าเลือกไฟล์กู้ผิดใบ = ยอดของวันนี้หายโดยไม่มีทางกลับ
  // สำเนานี้เขียนลงฐานข้อมูลของแอปโดยตรง จึงยืนยันผลได้ (สำเร็จ = สำเร็จจริง)
  // เขียน db.state.put() ตรง — ต้องมีด่านเดียวกัน ไม่งั้นหน้าต่างรองเอา snapshot เก่าไปทับสำเนาที่ดี
  // สำเนาของ "ตอนนี้" สำหรับปุ่มย้อนกลับ — สร้างในคิวงานบันทึกเท่านั้น (ดูผู้เรียก)
  buildPreRestoreSnapshot() {
    return { savedAt: Date.now(), appVersion: APP_VERSION, data: this.buildBackupPayload() };
  }

  // เก็บสำเนาก่อนกู้แบบเดี่ยว ๆ (ไม่ได้แทนข้อมูล) — ทางกู้/นำเข้า/ย้อนจริงไม่ใช้ตัวนี้แล้ว
  // เพราะต้องเก็บสำเนา "พร้อมกับ" การแทนข้อมูลใน transaction เดียว (ดู _applyBackupDataLocked)
  async savePreRestoreSnapshot() {
    if (!this.canWriteData('เก็บสำเนาก่อนกู้ข้อมูล')) {
      throw new Error('หน้าต่างนี้เปิดซ้ำอยู่ จึงเก็บสำเนาก่อนกู้ไม่ได้ — ให้ใช้หน้าต่างเดิม');
    }
    return this.withMutation('สำเนาก่อนกู้ข้อมูล', async () => {
      if (!this.canWriteData('เก็บสำเนาก่อนกู้ข้อมูล')) {
        throw new Error('หน้าต่างนี้เปิดซ้ำอยู่ จึงเก็บสำเนาก่อนกู้ไม่ได้ — ให้ใช้หน้าต่างเดิม');
      }
      const snap = this.buildPreRestoreSnapshot();
      await db.state.put({ key: 'preRestoreSnapshot', value: snap });
      return snap;
    });
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


  // ── รายการที่แยกไว้ตรวจสอบ (ดู sanitizeBackupData) — แสดงเฉพาะเมื่อมีจริง ──
  refreshQuarantineUI() {
    const box = document.getElementById('quarantine-box');
    if (!box) return;
    const list = Array.isArray(this.state.quarantine) ? this.state.quarantine : [];
    if (!list.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const label = document.getElementById('quarantine-label');
    if (label) {
      const n = k => list.filter(r => r && r.kind === k).length;
      const bits = [];
      if (n('transaction')) bits.push(`บิล ${n('transaction')} ใบ`);
      if (n('expense'))     bits.push(`ค่าใช้จ่าย ${n('expense')} รายการ`);
      if (n('service'))     bits.push(`ราคาบริการ ${n('service')} รายการ`);
      if (n('shift'))       bits.push(`ตัวเลขกะ ${n('shift')} จุด`);
      label.innerText = `มีรายการที่แยกไว้ตรวจสอบ: ${bits.join(' · ') || (list.length + ' รายการ')}`;
    }
  }

  // ดาวน์โหลดรายการที่แยกไว้ (พร้อมค่าต้นฉบับ) ไปตรวจเทียบกับหลักฐานจริง — อ่านอย่างเดียว ไม่แก้ข้อมูลในเครื่อง
  exportQuarantine() {
    if (!this.requireOwnerForDataAction('ดาวน์โหลดรายการที่แยกไว้ตรวจสอบ')) return false;
    const list = Array.isArray(this.state.quarantine) ? this.state.quarantine : [];
    if (!list.length) { this.showToast('ไม่มีรายการที่แยกไว้ตรวจสอบ', 'info'); return false; }
    try {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: APP_VERSION, items: list }, null, 2)],
        { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erotica_pos_quarantine_${this.getLocalISODate(new Date())}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (e) { /* ปล่อยได้ */ } }, 60000);
      return true;
    } catch (err) {
      this.showToast('ดาวน์โหลดรายการไม่สำเร็จ: ' + (err.message || err), 'error', 7000);
      return false;
    }
  }
  // ย้อนกลับไปใช้สำเนาก่อนกู้ข้อมูล — ใช้เมื่อกู้ผิดไฟล์
  // สลับไป-กลับได้: ก่อนย้อน จะเซฟสถานะปัจจุบันทับสำเนาเก่า กดอีกทีก็กลับมาที่เดิม
  async undoLastRestore() {
    if (!this.requireOwnerForDataAction('ย้อนข้อมูล')) return;
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
          // สลับที่กัน "ในงานเดียว": สำเนาของตอนนี้กับข้อมูลที่ย้อนกลับ ลงเครื่องพร้อมกันหรือไม่ลงเลย
          // ⚠️ เดิมเซฟสำเนาก่อน (งานหนึ่ง) แล้วค่อยแทนข้อมูล (อีกงาน) — ระหว่างนั้นขายได้
          // บิลที่ขายในช่วงนั้นจะไม่อยู่ทั้งในสำเนาและในข้อมูลที่ย้อน = หายถาวร
          await this.withMutation('ย้อนข้อมูล', async () => {
            if (!this.requireOwnerForDataAction('ย้อนข้อมูล')) throw new Error('สิทธิ์ไม่พอ');
            if (!this.canWriteData('ย้อนข้อมูล')) throw new Error('หน้าต่างนี้เปิดซ้ำอยู่');
            // อ่านสำเนาใหม่ในคิว — ระหว่างรอกดยืนยัน สำเนาอาจถูกเปลี่ยนไปแล้ว
            const cur = await this.readPreRestoreSnapshot();
            if (!cur) throw new Error('ไม่พบสำเนาก่อนกู้ข้อมูลแล้ว');
            const nowSnap = this.buildPreRestoreSnapshot();
            // สำเนาของแอปเอง — ข้ามกฎรูปแบบ ID เพื่อไม่ให้เส้นทางย้อนกลับตัน
            // forceWin: ย้อนกลับ = "เอาแบบเดิมทั้งชุด" (ไม่ถามรายบิลแม้ชีตจะถูกเขียนโดยการกู้รอบที่เพิ่งย้อน — รอบตรวจ 5 ข้อ 1)
            await this._applyBackupDataLocked(cur.data, { checkIds: false, exactSettings: true, forceWin: true }, { preRestoreSnapshot: nowSnap });
          });
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
            if (this.restoreBusy) return;
            this.restoreBusy = true;
            try {
              // สำเนาของ "ตอนนี้" ถูกถ่าย ณ วินาทีที่แทนข้อมูลจริง (ในคิวงานบันทึก) — ไม่ใช่ตอนเปิดไฟล์
              // และลงเครื่องพร้อมข้อมูลใหม่ใน transaction เดียว (สำเร็จทั้งคู่หรือไม่เปลี่ยนอะไรเลย)
              await this.withMutation('นำเข้าข้อมูล', async () => {
                if (!this.requireOwnerForDataAction('นำเข้าข้อมูล')) throw new Error('สิทธิ์ไม่พอ');
                if (!this.canWriteData('นำเข้าข้อมูล')) throw new Error('หน้าต่างนี้เปิดซ้ำอยู่ — เก็บสำเนาก่อนนำเข้าไม่ได้');
                const snap = this.buildPreRestoreSnapshot();
                await this._applyBackupDataLocked(parsed, undefined, { preRestoreSnapshot: snap });
              });
              await this.refreshPreRestoreUI();
              this.showToast('นำเข้าข้อมูลและรีเฟรชหน้าจอสำเร็จ!', 'info');
              this.suggestReconcileAfterRestore();
            } catch (e2) {
              console.error('import failed', e2);
              this.showToast('นำเข้าข้อมูลไม่สำเร็จ: ' + (e2.message || e2) + ' (ข้อมูลเดิมในเครื่องยังอยู่ครบ)', 'error', 7000);
            } finally {
              this.restoreBusy = false;
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
    // ⚠️ ทุกทางที่ปฏิเสธต้องมีเหตุผล (รอบตรวจ 5 ข้อ 7) — เดิมหลายทางคืน false เปล่า ๆ
    //    หน้ากู้จาก Drive จึงเติมเองว่า "ไม่พบรายการบริการ/พนักงาน/บิล — ลองเลือกไฟล์วันอื่น"
    //    แม้สาเหตุจริงคือ "ไฟล์มาจากแอปรุ่นใหม่กว่า" (ลองกี่ไฟล์ก็ไม่ผ่าน ต้องอัปเดตแอปก่อน)
    this._lastBackupRejectNewer = false;
    if (!isObject(parsed)) return reject('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้ (โครงข้อมูลไม่ถูกต้อง)');

    // รองรับไฟล์เก่าที่ไม่มี version แต่ไม่รับไฟล์จากรุ่นใหม่กว่าที่แอปนี้ยังอ่านไม่เข้าใจ
    if (parsed.backupSchemaVersion !== undefined) {
      const v = parsed.backupSchemaVersion;
      if (Number.isInteger(v) && v > BACKUP_SCHEMA_VERSION) {
        this._lastBackupRejectNewer = true;
        return reject(`ไฟล์นี้มาจากแอปรุ่นใหม่กว่า (รูปแบบไฟล์รุ่น ${v} · แอปในเครื่องนี้อ่านได้ถึงรุ่น ${BACKUP_SCHEMA_VERSION}) — ` +
          'อัปเดตแอปก่อน (เปิดแอปตอนมีเน็ต แล้วกด "อัปเดตเลย") แล้วค่อยกู้ไฟล์นี้');
      }
      if (!Number.isInteger(v) || v < 1) return reject('รุ่นของไฟล์สำรองอ่านไม่ได้ — ไฟล์อาจเสียหรือถูกแก้');
    }

    const required = [['services', 10000, 'รายการบริการ'], ['staff', 2000, 'รายชื่อพนักงาน'], ['transactions', 200000, 'รายการบิล']];
    for (const [key, max, label] of required) {
      if (!objectArray(parsed[key], max)) {
        return reject(!Array.isArray(parsed[key]) ? `ไม่พบ${label}ในไฟล์` : `${label}ในไฟล์มีรูปแบบไม่ถูกต้องหรือมากผิดปกติ`);
      }
    }

    const optionalArrays = [
      ['categories', 10000], ['customers', 100000], ['queue', 10000],
      ['voidLog', 100000], ['expenseLog', 100000], ['editLog', 100000], ['quarantine', 100000]
    ];
    for (const [key, max] of optionalArrays) {
      if (parsed[key] !== undefined && !objectArray(parsed[key], max)) return reject(`รายการ "${key}" ในไฟล์มีรูปแบบไม่ถูกต้อง`);
    }
    if (parsed.shift !== undefined && !isObject(parsed.shift)) return reject('ข้อมูลกะในไฟล์มีรูปแบบไม่ถูกต้อง');

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

  // ── ตรวจบิลหนึ่งใบแบบละเอียด: ชนิดข้อมูล · ช่วงค่า · สมการเงิน (เป็นสตางค์จำนวนเต็ม) ──
  // คืนรายการปัญหา [{ code, msg, fatal }]
  //   fatal = ตัวเลขเงินของบิลใบนี้เชื่อไม่ได้ → ห้ามนับในยอด ห้ามส่งขึ้นชีต ต้องแยกไว้ให้คนตรวจ
  //   ไม่ fatal = ข้อสังเกต (เช่นบิลรุ่นเก่ามากที่ไม่มีช่องทางจ่าย = ถือเป็นเงินสดตามกติกาเดิม)
  //
  // ⚠️ กติกาบิลรุ่นเก่า (ก่อนมี VAT — ไม่มีฟิลด์ VAT สักตัว) ที่ใช้ตรงกันทั้งแอปและ Apps Script
  //    (ไล่จากโค้ดจริงของรุ่น 21 มิ.ย. – ส.ค. 2569 ใน git ไม่ได้ตั้งขึ้นเอง):
  //   · ยอดสุทธิ = max(0, ราคารวม − ส่วนลด) เป๊ะเป็นสตางค์ — รุ่นนั้นไม่มีการปัดเศษ/VAT
  //   · รุ่นแรก (ก่อน 3 ก.ค.) ไม่จำกัดส่วนลด: ส่วนลดเกินราคาได้ถ้ายอดสุทธิเป็น 0 (ข้อสังเกต ไม่ใช่ข้อมูลเสีย)
  //   · รุ่นแรกปัดราคาหลังส่วนลดทีละบรรทัด: ผลรวมรายบรรทัดคลาดได้ไม่เกินครึ่งสตางค์ต่อบรรทัด
  //   · ไม่มีช่องทางจ่าย = เงินสด (ค่าตั้งต้นของระบบรุ่นนั้น — Apps Script ใช้กติกาเดียวกัน)
  //   · ไม่มีราคารวมและส่วนลดเลยทั้งคู่ = ราคารวมเท่ายอดสุทธิ ส่วนลด 0 (อ่านตามสมการ ไม่ใช่เดา)
  // บิลที่มีฟิลด์ VAT ต้องมีครบทั้ง 4 ช่อง ส่วนลดต้องอยู่ในช่วง 0..ราคารวม และทุกสมการต้องลงตัวเป๊ะ
  validateBillRecord(tx) {
    const P = [];
    const fatal = (code, msg) => P.push({ code, msg, fatal: true });
    const note = (code, msg) => P.push({ code, msg, fatal: false });
    if (!tx || typeof tx !== 'object' || Array.isArray(tx)) { fatal('not-object', 'ไม่ใช่ข้อมูลบิล'); return P; }
    const MAX = 10000000;   // บาทต่อบิล — เกินนี้ถือว่าตัวเลขพัง ไม่ใช่ยอดขายจริงของร้านนี้ (Apps Script ใช้ค่าเดียวกัน)
    const sat = v => Math.round(v * 100);
    const money = (v) => {
      const n = this.toFiniteNumber(v);
      if (n === null || n < 0 || n > MAX) return null;
      if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;   // ละเอียดเกินสตางค์ = ไม่ใช่ยอดเงินจริง
      return n;
    };
    if (typeof tx.id !== 'string' || !tx.id.trim()) fatal('no-id', 'ไม่มีเลขที่บิล');
    if (!this.isValidDateKey(this.getBusinessISODate(tx.date))) fatal('bad-date', 'วันที่ของบิลใช้ไม่ได้');

    const VK = ['nonVatBase', 'vatableBase', 'vatAmount', 'rounding'];
    const present = VK.filter(k => tx[k] !== undefined && tx[k] !== null);
    const legacy = present.length === 0;   // บิลก่อนมีระบบ VAT (ก่อน ส.ค. 2569)

    const total = money(tx.total);
    if (total === null) fatal('bad-total', 'ยอดสุทธิหาย/ไม่ใช่ตัวเลข/ติดลบ');
    const noSub = (tx.subtotal === undefined || tx.subtotal === null);
    const noDisc = (tx.discount === undefined || tx.discount === null);
    const subtotal = noSub ? (noDisc ? total : null) : money(tx.subtotal);
    const discount = noDisc ? 0 : money(tx.discount);
    if (subtotal === null) fatal('bad-subtotal', 'ราคารวมหาย/ไม่ใช่ตัวเลข/ติดลบ');
    if (discount === null) fatal('bad-discount', 'ส่วนลดไม่ใช่ตัวเลข/ติดลบ');
    const moneyOk = subtotal !== null && discount !== null && total !== null;
    // ยอดหลังหักส่วนลด (สตางค์) — บิลรุ่นแรกไม่ได้จำกัดส่วนลดไม่ให้เกินราคา จึงใช้ max(0, …) ตามสูตรเดิมของมัน
    const netSat = moneyOk ? Math.max(0, sat(subtotal) - sat(discount)) : null;
    if (moneyOk && sat(discount) > sat(subtotal)) {
      if (legacy && total === 0) note('legacy-discount-over', 'บิลรุ่นแรก: ส่วนลดเกินราคา (ยอด 0 ตามสูตรเดิม)');
      else fatal('discount-over', 'ส่วนลดมากกว่าราคารวม');
    }

    const pm = tx.paymentMethod;
    if (pm === undefined || pm === null || pm === '') note('legacy-payment', 'ไม่มีช่องทางจ่าย (บิลรุ่นเก่า = เงินสด)');
    else if (!['cash', 'promptpay', 'credit'].includes(pm)) fatal('bad-payment', `ช่องทางจ่ายที่ระบบไม่รู้จัก (${String(pm).slice(0, 20)})`);

    if (!legacy && present.length < VK.length) {
      fatal('vat-partial', 'ฟิลด์ VAT มีไม่ครบ 4 ช่อง');
    } else if (!legacy) {
      const v = {};
      VK.forEach(k => { v[k] = money(tx[k]); if (v[k] === null) fatal('bad-vat', `ช่อง ${k} ไม่ใช่ตัวเลข/ติดลบ`); });
      if (tx.vatRate !== undefined && tx.vatRate !== null) {
        const r = this.toFiniteNumber(tx.vatRate);
        if (r === null || r < 0 || r > 100) fatal('bad-vat-rate', 'อัตรา VAT ใช้ไม่ได้');
      }
      if (VK.every(k => v[k] !== null) && moneyOk) {
        if (sat(subtotal) - sat(discount) !== sat(v.nonVatBase) + sat(v.vatableBase)) {
          fatal('vat-base-mismatch', 'ราคารวม − ส่วนลด ไม่เท่ากับ ไม่คิดVAT + คิดVAT');
        }
        if (sat(v.nonVatBase) + sat(v.vatableBase) + sat(v.vatAmount) + sat(v.rounding) !== sat(total)) {
          fatal('vat-total-mismatch', 'ผลรวม 4 ช่อง VAT ไม่เท่ากับยอดสุทธิ');
        }
        // ทุกรุ่นที่มี VAT (ตั้งแต่ 4 ส.ค. 2569) ปัดยอดขึ้นเต็มบาทเสมอ — ดู computeTotalsAtRate
        if (sat(total) % 100 !== 0) fatal('vat-total-not-baht', 'บิลรุ่น VAT ยอดสุทธิต้องเป็นบาทเต็ม');
        if (sat(v.rounding) >= 100) fatal('bad-rounding', 'เงินปัดเศษต้องน้อยกว่า 1 บาท');
        const vr = this.toFiniteNumber(tx.vatRate);
        if (vr !== null && vr >= 0 && vr <= 100 && Math.round(sat(v.vatableBase) * vr / 100) !== sat(v.vatAmount)) {
          fatal('vat-amount-mismatch', 'ภาษีขายไม่ตรงกับ ฐานภาษี × อัตรา');
        }
      }
    } else if (moneyOk && netSat !== sat(total)) {
      fatal('legacy-mismatch', 'บิลรุ่นเก่า: ราคารวม − ส่วนลด ไม่เท่ากับยอดสุทธิ');
    }

    // รายการย่อยต้องบวกกลับได้เท่ายอดของบิล — กันบิลที่ยอดรวมถูกแก้แต่รายละเอียดไม่ตาม (หรือกลับกัน)
    if (tx.details !== undefined && tx.details !== null && !Array.isArray(tx.details)) {
      fatal('bad-details', 'รายการย่อยของบิลไม่ใช่รายการ');
    } else if (Array.isArray(tx.details) && tx.details.length) {
      let priceSat = 0, lineNetSat = 0, vatNetSat = 0, allNet = true, allFlag = true, bad = false;
      tx.details.forEach(d => {
        if (!d || typeof d !== 'object') { bad = true; return; }
        const p = money(d.price);
        if (p === null) { bad = true; return; }
        priceSat += sat(p);
        if (d.commissionAmount !== undefined && d.commissionAmount !== null && this.toFiniteNumber(d.commissionAmount) === null) bad = true;
        if (d.netPrice === undefined || d.netPrice === null) { allNet = false; return; }
        const n = money(d.netPrice);
        if (n === null) { bad = true; return; }
        lineNetSat += sat(n);
        if (typeof d.vatable !== 'boolean') allFlag = false;
        else if (d.vatable) vatNetSat += sat(n);
      });
      if (bad) fatal('bad-details', 'รายการย่อยมีราคา/ค่าคอมที่ไม่ใช่ตัวเลข');
      else if (moneyOk) {
        if (priceSat !== sat(subtotal)) fatal('details-subtotal', 'ผลรวมราคารายการ ไม่เท่ากับราคารวมของบิล');
        if (allNet && lineNetSat !== netSat) {
          // บิลรุ่นก่อน 3 ก.ค. 2569 ปัดราคาหลังส่วนลด "ทีละบรรทัด" โดยไม่เกลี่ยเศษ
          // ผลรวมจึงคลาดได้ไม่เกินครึ่งสตางค์ต่อบรรทัด — เป็นพฤติกรรมจริงของรุ่นนั้น ไม่ใช่ข้อมูลเสีย
          // (ยอดเงินของบิลยังถูกต้อง เศษนี้กระทบแค่ฐานคิดค่าคอม)
          const tol = legacy ? Math.ceil(tx.details.length / 2) : 0;
          if (Math.abs(lineNetSat - netSat) <= tol) note('legacy-details-rounding', 'บิลรุ่นเก่า: ราคาหลังส่วนลดรายบรรทัดปัดเศษทีละบรรทัด');
          else fatal('details-net', 'ผลรวมราคาหลังส่วนลด ไม่เท่ากับ ราคารวม − ส่วนลด');
        }
        // รายการที่ติดธง "คิด VAT" ต้องรวมได้เท่าฐานภาษีของบิล (อัตรา 0 = ไม่มีรายการไหนคิด VAT)
        if (!legacy && allNet && allFlag && present.length === VK.length) {
          const vb = money(tx.vatableBase), vr = this.toFiniteNumber(tx.vatRate);
          const expect = (vr !== null && vr > 0) ? vatNetSat : 0;
          if (vb !== null && expect !== sat(vb)) fatal('details-vat', 'ผลรวมรายการที่คิด VAT ไม่เท่ากับฐานภาษีของบิล');
        }
      }
    }

    // ข้อมูลรับเงิน/เงินทอน — เป็นหลักฐานประกอบ ไม่ใช่ยอดขาย (ผิดแค่เตือน ไม่แยกบิลออก)
    ['cashReceived', 'cashChange'].forEach(k => {
      if (tx[k] !== undefined && tx[k] !== null && money(tx[k]) === null) note('bad-' + k, `${k} ไม่ใช่ตัวเลข`);
    });
    const rec = money(tx.cashReceived);
    // บิลที่ถูกแก้ยอดขึ้นหลังรับเงิน (ข้อ 16) รับเงินสดน้อยกว่ายอดใหม่ได้ตามจริง — ส่วนต่างอยู่ใน tender/settlements
    if (pm === 'cash' && rec !== null && total !== null && sat(rec) < sat(total) && (tx.tender === undefined || tx.tender === null)) {
      note('cash-underpaid', 'บันทึกรับเงินสดน้อยกว่ายอดบิล');
    }
    // ข้อมูลรับเงินจริง/ส่วนต่างหลังแก้บิล — เป็นหลักฐานการเงินของลิ้นชัก ไม่ใช่ยอดขาย
    // ผิดรูป = เตือน (ยอดขายของบิลยังเชื่อได้) แต่ตัวนับลิ้นชักจะไม่นับและแจ้งให้เห็นแทน (ดู computeShiftDrawer)
    if (tx.tender !== undefined && tx.tender !== null && !this.tenderOf(tx).valid) note('bad-tender', 'ข้อมูลเงินที่รับจริงตอนขายของบิลเสีย');
    if (tx.settlements !== undefined && tx.settlements !== null) {
      const okList = Array.isArray(tx.settlements) && tx.settlements.every(x => x && typeof x === 'object' &&
        PAYMENT_METHODS.includes(x.method) && SETTLEMENT_KINDS.includes(x.kind) && this.toFiniteNumber(x.amount) !== null);
      if (!okList) note('bad-settlement', 'ประวัติคืน/เก็บเงินส่วนต่างของบิลเสีย');
    }
    return P;
  }

  // ── ตรวจสุขภาพไฟล์สำรองแบบละเอียด (อ่านอย่างเดียว ไม่แก้อะไร) ──────────
  // ด่าน isValidBackupObject ข้างบนดูแค่ "โครงร่างใช่ไหม" — ไฟล์ที่บิลยอดเงินหาย
  // หรือวันที่พังจะผ่านเข้ามาได้สบาย แล้วไปโผล่เป็น NaN ในรายงานทีหลัง
  // ซึ่งอันตรายมาก เพราะบิลเสียใบเดียวทำให้ยอด "ทั้งวัน" กลายเป็น NaN บังบิลดีทุกใบ
  auditBackupData(parsed) {
    const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];

    // ── บิล/ค่าใช้จ่าย/ราคาบริการ: "ซ้อมซ่อม" บนสำเนา แล้วนับจากผลจริงของ sanitizeBackupData ──
    // ⚠️ เดิมตรวจด้วยกฎชุดหนึ่ง แต่ตอนซ่อมใช้อีกชุด (เช่นตรวจแค่ "total เป็นตัวเลขไหม")
    // บิลยอดติดลบ/ช่องทางจ่ายมั่ว/ยอดบวกไม่ลงตัวจึงได้ผลว่า "สะอาด" แล้วถูกนำไปซิงก์
    // ตอนนี้ใช้ตัวตัดสินตัวเดียวกันเป๊ะ — สิ่งที่รายงานก่อนกดยืนยัน = สิ่งที่จะเกิดขึ้นจริง
    const saved = this._lastSanitizeQuarantine;
    let records = [];
    try {
      const dry = JSON.parse(JSON.stringify({
        transactions: parsed.transactions, services: parsed.services, shift: parsed.shift, vatRate: parsed.vatRate
      }));
      this.sanitizeBackupData(dry);
      records = Array.isArray(this._lastSanitizeQuarantine) ? this._lastSanitizeQuarantine : [];
    } catch (e) {
      // สำเนาไม่ได้ (ข้อมูลวนอ้างอิงกันเอง) = ตรวจไม่ได้ → ห้ามตอบว่าสะอาด
      records = [{ kind: 'transaction', id: '', reasons: ['unreadable'], message: 'อ่านข้อมูลบิลเพื่อตรวจไม่ได้' }];
    } finally {
      this._lastSanitizeQuarantine = saved;
    }

    const bad = { noId: [], badDate: [], badMoney: [], dupId: [] };
    let badExpenses = 0, badServices = 0, badShifts = 0, badActiveShift = 0, badSettings = 0;
    const problemSamples = [];
    records.forEach(r => {
      const reasons = Array.isArray(r.reasons) ? r.reasons : [];
      if (r.kind === 'transaction') {
        const label = r.id || '(ไม่มีเลขที่บิล)';
        if (reasons.includes('dup-id')) bad.dupId.push(label);
        if (reasons.includes('not-object') || reasons.includes('no-id')) bad.noId.push(label);
        if (reasons.includes('bad-date')) bad.badDate.push(label);
        if (reasons.some(c => !['dup-id', 'not-object', 'no-id', 'bad-date'].includes(c))) bad.badMoney.push(label);
        if (problemSamples.length < 20) problemSamples.push(`${label}: ${r.message || reasons.join(', ')}`);
      } else if (r.kind === 'expense') badExpenses++;
      else if (r.kind === 'service') badServices++;
      else if (r.kind === 'shift' && reasons.includes('bad-startTime')) badActiveShift++;
      else if (r.kind === 'shift') badShifts++;
      else if (r.kind === 'setting') badSettings++;
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
      if (!tx || typeof tx !== 'object') return;   // นับเป็นบิลเสียแล้วด้านบน
      needArray(tx, 'services'); needArray(tx, 'staffNames'); needArray(tx, 'details');
      if (Array.isArray(tx.details))    badLists += tx.details.filter(x => !x || typeof x !== 'object').length;
      if (Array.isArray(tx.services))   badLists += tx.services.filter(x => typeof x !== 'string' && typeof x !== 'number').length;
      if (Array.isArray(tx.staffNames)) badLists += tx.staffNames.filter(x => typeof x !== 'string' && typeof x !== 'number').length;
    });
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

    (Array.isArray(parsed.editLog) ? parsed.editLog : []).forEach(e => {
      if (!e || typeof e !== 'object') return;
      if (e.settlements !== undefined && e.settlements !== null) {
        if (!Array.isArray(e.settlements)) badLists++;
        else badLists += e.settlements.filter(x => !x || typeof x !== 'object').length;
      }
      if (e.fields !== undefined && e.fields !== null && !Array.isArray(e.fields)) badLists++;
      ['before', 'after'].forEach(k => { if (e[k] !== undefined && e[k] !== null && typeof e[k] !== 'object') badLists++; });
    });

    const damagedIds = [...new Set([...bad.noId, ...bad.badMoney, ...bad.badDate])];
    const quarantine = records.length;
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
      badActiveShift,
      badSettings,
      damagedIds,
      quarantine,
      problemSamples,
      clean: quarantine === 0 && badLists === 0
    };
  }
  // สรุปผลตรวจเป็นข้อความที่คนอ่านรู้เรื่อง (ใช้ในกล่องยืนยันก่อนเขียนทับ)
  describeBackupAudit(a) {
    if (a.clean) return '';
    const lines = [];
    const QN = '→ แยกไว้ตรวจสอบ (ไม่นับในยอด ไม่ส่งขึ้นชีต) โดยเก็บข้อมูลต้นฉบับไว้ครบ';
    if (a.badMoney)    lines.push(`• ${a.badMoney} บิลที่ยอดเงินหาย/ติดลบ/บวกไม่ลงตัว/ช่องทางจ่ายผิด ${QN}`);
    if (a.badDate)     lines.push(`• ${a.badDate} บิลที่วันที่ใช้ไม่ได้ ${QN}`);
    if (a.noId)        lines.push(`• ${a.noId} บิลที่ไม่มีเลขที่บิล ${QN}`);
    if (a.dupId)       lines.push(`• ${a.dupId} บิลที่เลขที่ซ้ำกับใบก่อนหน้า ${QN}`);
    if (a.badExpenses) lines.push(`• ${a.badExpenses} รายการค่าใช้จ่ายที่จำนวนเงินหาย/ติดลบ ${QN}`);
    if (a.badServices) lines.push(`• ${a.badServices} รายการบริการที่ราคาใช้ไม่ได้ → ขายไม่ได้จนกว่าจะแก้ราคาที่หน้าตั้งค่า (ไม่ตั้งเป็นขายฟรี)`);
    if (a.badLists)    lines.push(`• ${a.badLists} จุดที่รายการย่อยเสีย (เช่นรายการบริการในคิว) → จะถูกล้างเป็นรายการว่าง ข้อมูลส่วนนั้นหายไป`);
    if (a.badActiveShift) lines.push(`• กะที่เปิดอยู่ในไฟล์ไม่มีเวลาเริ่มที่ใช้ได้ → กะนี้จะถูกปิดไว้ ต้องนับเงินเปิดกะใหม่ (ค่าเดิมเก็บไว้ตรวจสอบ)`);
    if (a.badSettings) lines.push(`• ${a.badSettings} ค่าตั้งค่าที่ผิดช่วง (เช่นอัตรา VAT) → คงค่าเดิมของเครื่องไว้`);
    if (a.badShifts)   lines.push(`• ${a.badShifts} รอบกะที่ "เงินเปิดร้าน" หายไป → แสดงเป็น 0 บาท (ไม่ใช่ยอดจริง — ค่าเดิมเก็บไว้ในรายการที่แยกตรวจสอบ)`);
    const sample = (a.problemSamples && a.problemSamples.length)
      ? `\n\nตัวอย่าง:\n${a.problemSamples.slice(0, 5).join('\n')}` : '';
    return `⚠️ ไฟล์นี้มีข้อมูลเสียบางส่วน (จากบิลทั้งหมด ${a.txTotal} ใบ)\n\n${lines.join('\n')}${sample}\n\n` +
           `ส่วนที่ดีจะถูกกู้ครบ ส่วนที่เสียไม่ถูกแก้เป็นศูนย์และไม่ถูกเดายอด — ดูรายการที่แยกไว้ได้ในหน้าตั้งค่า`;
  }
  // ── ซ่อมตัวเลขในไฟล์สำรองเท่าที่ซ่อมได้อย่างปลอดภัย ────────────────────
  // เป้าหมายเดียว: กัน NaN หลุดเข้าไปในการรวมยอด
  // "400" (ข้อความ) → 400 ถือว่าซ่อมได้ปลอดภัย เพราะค่าเดิมยังอยู่ครบ
  // ส่วนค่าที่พังจริง ๆ ตั้งเป็น 0 — เสียเฉพาะใบนั้น ดีกว่าปล่อยให้ยอดทั้งวันเป็น NaN
  // แล้วบิลดีอีกร้อยใบหายไปจากรายงานพร้อมกัน (ผู้ใช้ได้รับคำเตือนก่อนแล้วจาก audit)
  sanitizeBackupData(parsed) {
    let fixed = 0;
    // รายการที่ถูกแยกไว้ตรวจสอบในรอบนี้ (ผู้เรียกเอาไปต่อท้าย state.quarantine)
    const quarantined = [];
    this._lastSanitizeQuarantine = quarantined;
    const stamp = Date.now();
    const copy = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return String(v); } };
    // ⚠️ ถ่ายสำเนาต้นฉบับของบิลทุกใบ "ก่อน" แตะอะไร — ถ้าบิลใบไหนต้องแยกไปตรวจ ต้องเก็บของเดิมเป๊ะ
    // ไม่ใช่เก็บของที่ผ่านการซ่อมไปครึ่งทางแล้ว (ตรวจย้อนกลับไม่ได้ว่าค่าเดิมคืออะไร)
    const txOriginals = new Map();
    (Array.isArray(parsed.transactions) ? parsed.transactions : []).forEach(tx => txOriginals.set(tx, copy(tx)));

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

    // ── ฟิลด์ที่ไม่ใช่ยอดเงิน (จำนวนครั้ง/ระยะเวลา) — ค่าที่ใช้ไม่ได้ตั้งเป็น 0 ได้ ─────────
    // ตัวเลขพวกนี้ไม่ใช่เงิน และค่าที่เป็นสตริง HTML จะไหลไปโผล่ในหน้าจอได้ทุกจุดที่เผลอไม่ครอบ Number()
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

    // แปลง "ข้อความตัวเลข" เป็นตัวเลข (ไม่เสียข้อมูล — "400" คือ 400) — ค่าที่แปลงไม่ได้ปล่อยไว้ตามเดิม
    // ⚠️ ยอดเงินห้ามถูกแทนด้วย 0 เด็ดขาด — เดิมทำแบบนั้นแล้วบิลยอด 0 ถูกส่งขึ้นชีตเหมือนเป็นบิลจริง
    const convert = (obj, key) => {
      if (!obj || obj[key] === undefined || obj[key] === null) return;
      const n = this.toFiniteNumber(obj[key]);
      if (n !== null && n !== obj[key]) { obj[key] = n; fixed++; }
    };

    // ── บิล: แยกใบที่ตัวเลขเงินเชื่อไม่ได้ออกไปตรวจสอบ (เก็บต้นฉบับ) ─────────────
    if (Array.isArray(parsed.transactions)) {
      const keep = [];
      const seenIds = new Set();
      parsed.transactions.forEach(tx => {
        if (tx && typeof tx === 'object') {
          ['total', 'subtotal', 'discount', 'nonVatBase', 'vatableBase', 'vatAmount', 'rounding', 'vatRate',
           'cashReceived', 'cashChange'].forEach(k => convert(tx, k));
          (Array.isArray(tx.details) ? tx.details : []).forEach(d => {
            ['price', 'netPrice', 'commission', 'commissionAmount'].forEach(k => convert(d, k));
          });
          // ข้อ 16: เงินรับจริงตอนขาย + ส่วนต่างที่บันทึกแล้ว (ข้อความตัวเลข → ตัวเลข · ค่าที่แปลงไม่ได้ปล่อยไว้ให้ตัวตรวจเตือน)
          if (tx.tender && typeof tx.tender === 'object') ['amount', 'received', 'change'].forEach(k => convert(tx.tender, k));
          (Array.isArray(tx.settlements) ? tx.settlements : []).forEach(x => { if (x && typeof x === 'object') convert(x, 'amount'); });
          // บิลรุ่นเก่ามากที่ไม่มีทั้งราคารวมและส่วนลด: อ่านตามสมการ "ราคารวม − ส่วนลด = ยอด" ได้ค่าเดียว
          // (ไม่ใช่การเดา — และเป็นกติกาเดียวกับที่ Apps Script ใช้กับคำขอจากแอปรุ่นเก่าอยู่แล้ว)
          const noSub = tx.subtotal === undefined || tx.subtotal === null;
          const noDisc = tx.discount === undefined || tx.discount === null;
          if (noSub && noDisc && typeof tx.total === 'number' && Number.isFinite(tx.total) && tx.total >= 0) {
            tx.subtotal = tx.total; tx.discount = 0; fixed++;
          } else if (!noSub && noDisc) {
            tx.discount = 0; fixed++;
          }
        }
        const problems = this.validateBillRecord(tx).filter(p => p.fatal);
        const dup = !!(tx && typeof tx === 'object' && typeof tx.id === 'string' && tx.id && seenIds.has(tx.id));
        if (problems.length || dup) {
          quarantined.push({
            kind: 'transaction',
            id: (tx && typeof tx.id === 'string') ? tx.id : '',
            reasons: dup ? ['dup-id'] : problems.map(p => p.code),
            message: dup ? 'เลขที่บิลซ้ำกับบิลใบก่อนหน้าในไฟล์เดียวกัน' : problems.map(p => p.msg).join(' / '),
            original: txOriginals.has(tx) ? txOriginals.get(tx) : copy(tx),
            quarantinedAt: stamp
          });
          return;
        }
        if (tx && typeof tx.id === 'string') seenIds.add(tx.id);
        keep.push(tx);
      });
      if (keep.length !== parsed.transactions.length) {
        console.warn(`[Import] แยกบิลที่ตัวเลขเงินเชื่อไม่ได้ออกไปตรวจสอบ ${parsed.transactions.length - keep.length} ใบ`);
      }
      parsed.transactions = keep;
    }

    // ── บริการ: ราคาที่ใช้ไม่ได้ = ขายไม่ได้จนกว่าเจ้าของจะแก้ ไม่ใช่ "ขายฟรี" ─────────
    // (ราคา 0 ยังต้องมีเพื่อไม่ให้หน้าจอพัง แต่ธง priceInvalid ทำให้กดใส่ตะกร้าไม่ได้)
    (Array.isArray(parsed.services) ? parsed.services : []).forEach(svc => {
      if (!svc || typeof svc !== 'object') return;
      const orig = { price: svc.price, commission: svc.commission };
      let invalid = false;
      ['price', 'duration', 'commission'].forEach(k => {
        const cur = svc[k];
        // ไม่มีช่องค่าคอม/ระยะเวลา = ไม่ได้ตั้งไว้ (บริการรุ่นเก่า) → 0 ได้ตามความหมายเดิม
        // แต่ "ไม่มีราคา" ไม่ใช่ของฟรี — ขายไม่ได้จนกว่าเจ้าของจะใส่ราคา
        if ((cur === undefined || cur === null) && k !== 'price') { svc[k] = 0; fixed++; return; }
        const n = this.toFiniteNumber(cur);
        if (n === null || n < 0) {
          if (k !== 'duration') invalid = true;
          if (cur !== 0) { svc[k] = 0; fixed++; }
        } else if (n !== cur) { svc[k] = n; fixed++; }
      });
      if (invalid) {
        svc.priceInvalid = true;
        quarantined.push({ kind: 'service', id: String(svc.id || ''), reasons: ['bad-price'],
          message: `ราคา/ค่าคอมของบริการ "${String(svc.name || '').slice(0, 40)}" ใช้ไม่ได้ — ห้ามขายจนกว่าจะแก้`,
          original: copy(orig), quarantinedAt: stamp });
      }
      // ชนิดค่าคอมที่ไม่รู้จักทำให้คิดค่าคอมผิดแบบเงียบ ๆ — บังคับกลับเป็นค่าตั้งต้น
      if (svc.commissionType !== 'fixed' && svc.commissionType !== 'percent') {
        svc.commissionType = 'percent'; fixed++;
      }
    });

    const shift = (parsed.shift && typeof parsed.shift === 'object') ? parsed.shift : null;
    if (shift) {
      // ── ค่าใช้จ่าย: จำนวนเงินที่ใช้ไม่ได้ = แยกไปตรวจสอบ (เดิมตั้งเป็น 0 ทำให้กำไรสูงเกินจริงเงียบ ๆ) ──
      const pickExpenses = (list, where) => (Array.isArray(list) ? list : []).filter(e => {
        if (!e || typeof e !== 'object') return false;
        convert(e, 'amount');
        const a = e.amount;
        if (typeof a === 'number' && Number.isFinite(a) && a >= 0) return true;
        quarantined.push({ kind: 'expense', id: String(e.id || ''), reasons: ['bad-amount'],
          message: `ค่าใช้จ่าย "${String(e.note || '').slice(0, 40)}" จำนวนเงินใช้ไม่ได้ (${where})`,
          original: copy(e), quarantinedAt: stamp });
        return false;
      });
      if (Array.isArray(shift.expenses)) shift.expenses = pickExpenses(shift.expenses, 'กะที่เปิดอยู่');
      // ข้อ 16: เงินคืน/เก็บเพิ่มที่บันทึกในกะที่เปิดอยู่ — จำนวนเงินใช้ไม่ได้ = แยกไปตรวจ (ไม่ใช่นับเป็น 0)
      if (shift.cashAdjustments !== undefined && shift.cashAdjustments !== null) {
        if (!Array.isArray(shift.cashAdjustments)) {
          quarantined.push({ kind: 'shift', id: 'active', reasons: ['bad-cashAdjustments'],
            message: 'รายการคืน/เก็บเงินส่วนต่างของกะที่เปิดอยู่ไม่ใช่รายการ — แยกไว้ตรวจ',
            original: copy({ cashAdjustments: shift.cashAdjustments }), quarantinedAt: stamp });
          delete shift.cashAdjustments; fixed++;
        } else {
          shift.cashAdjustments = shift.cashAdjustments.filter(a => {
            if (a && typeof a === 'object') {
              convert(a, 'amount');
              if (typeof a.amount === 'number' && Number.isFinite(a.amount)) return true;
            }
            quarantined.push({ kind: 'shift', id: 'active', reasons: ['bad-cashAdjustment'],
              message: `รายการคืน/เก็บเงินส่วนต่าง (บิล ${String((a && a.billId) || '-').slice(0, 40)}) จำนวนเงินใช้ไม่ได้`,
              original: copy(a), quarantinedAt: stamp });
            return false;
          });
        }
      }
      (Array.isArray(shift.history) ? shift.history : []).forEach(h => {
        if (!h || typeof h !== 'object') return;
        if (Array.isArray(h.expenses)) h.expenses = pickExpenses(h.expenses, `กะเริ่ม ${h.startTime || '-'}`);
        // ⚠️ startCash คือค่าเดียวในแถวประวัติกะที่หน้ารายงานเรียก .toLocaleString() ตรง ๆ
        // entry ที่ขาดฟิลด์นี้เคยผ่านด่านตรวจว่า "ไฟล์สะอาด" แล้วไปพังตอน render หลังบันทึกลงเครื่อง
        // จึงบังคับให้มีเสมอ — แต่ค่า 0 ที่เติมไม่ใช่เงินจริง: เก็บค่าเดิมไว้ในรายการตรวจสอบ + ติดธงไว้
        const sc = this.toFiniteNumber(h.startCash);
        if (sc === null) {
          quarantined.push({ kind: 'shift', id: String(h.startTime || ''), reasons: ['bad-startCash'],
            message: 'เงินเปิดร้านของกะนี้หาย/ใช้ไม่ได้ — แสดงเป็น 0 ซึ่งไม่ใช่ยอดจริง',
            original: copy({ startCash: h.startCash, startTime: h.startTime, endTime: h.endTime }), quarantinedAt: stamp });
          h.startCash = 0; h.startCashInvalid = true; fixed++;
        } else if (sc !== h.startCash) { h.startCash = sc; fixed++; }
        ['countedCash', 'expectedCash', 'cashSales', 'expensesTotal', 'difference'].forEach(k => {
          if (h[k] === undefined || h[k] === null) return;
          const n = this.toFiniteNumber(h[k]);
          if (n === null) {
            quarantined.push({ kind: 'shift', id: String(h.startTime || ''), reasons: ['bad-' + k],
              message: `ตัวเลข ${k} ของกะนี้ใช้ไม่ได้ — ตัดทิ้ง (ไม่แสดงเป็น 0)`,
              original: copy({ [k]: h[k], startTime: h.startTime }), quarantinedAt: stamp });
            delete h[k]; fixed++;
          } else if (n !== h[k]) { h[k] = n; fixed++; }
        });
      });
      const sc0 = this.toFiniteNumber(shift.startCash);
      if (shift.startCash === undefined || shift.startCash === null) { shift.startCash = 0; }
      else if (sc0 === null) {
        quarantined.push({ kind: 'shift', id: 'active', reasons: ['bad-startCash'],
          message: 'เงินเปิดร้านของกะที่เปิดอยู่ใช้ไม่ได้ — แสดงเป็น 0 ซึ่งไม่ใช่ยอดจริง',
          original: copy({ startCash: shift.startCash }), quarantinedAt: stamp });
        shift.startCash = 0; shift.startCashInvalid = true; fixed++;
      } else if (sc0 !== shift.startCash) { shift.startCash = sc0; fixed++; }
      // กะที่ "เปิดอยู่" ต้องมีเวลาเริ่มที่ใช้ได้ — เดิมไม่มีเวลาเริ่มก็ผ่าน แล้วสูตรลิ้นชักถือเวลาเริ่ม = 0
      // → บิลเงินสดย้อนหลังทั้งหมดถูกนับเป็นยอดของกะนี้ ปิดกะแล้วขึ้นเงินขาดก้อนมหึมา
      if (shift.active === true) {
        const st = this.toFiniteNumber(shift.startTime);
        if (st === null || st <= 0 || st > stamp + 24 * 3600 * 1000) {
          quarantined.push({ kind: 'shift', id: 'active', reasons: ['bad-startTime'],
            message: 'กะที่เปิดอยู่ในไฟล์ไม่มีเวลาเริ่มที่ใช้ได้ — ปิดกะนี้ไว้ (ต้องเปิดกะใหม่) ค่าเดิมเก็บไว้ตรวจสอบ',
            original: copy({ startTime: shift.startTime, startCash: shift.startCash, expenses: shift.expenses }), quarantinedAt: stamp });
          shift.active = false; fixed++;
        } else if (st !== shift.startTime) { shift.startTime = st; fixed++; }
      }
    }

    // อัตรา VAT จากไฟล์ — ช่วงเดียวกับหน้าตั้งค่า (0–30%) · เดิมรับทุกค่า ไฟล์ที่เขียนว่า 700 ทำให้คิด VAT 7 เท่า
    if (parsed.vatRate !== undefined && parsed.vatRate !== null) {
      const vr = this.toFiniteNumber(parsed.vatRate);
      if (vr === null || vr < 0 || vr > 30) {
        quarantined.push({ kind: 'setting', id: 'vatRate', reasons: ['bad-vatRate'],
          message: 'อัตรา VAT ในไฟล์ใช้ไม่ได้ (ต้องอยู่ระหว่าง 0–30%) — คงอัตราเดิมของเครื่องไว้',
          original: copy({ vatRate: parsed.vatRate }), quarantinedAt: stamp });
        delete parsed.vatRate; fixed++;
      } else if (Math.round(vr * 100) / 100 !== parsed.vatRate) { parsed.vatRate = Math.round(vr * 100) / 100; fixed++; }
    }

    // ประวัติแก้บิล — รายการย่อยที่หน้ารายงานวนอ่าน (เดิมตรวจแค่ชั้นบน: settlements:[null] ผ่านแล้วหน้ารายงานพัง)
    (Array.isArray(parsed.editLog) ? parsed.editLog : []).forEach(e => {
      if (!e || typeof e !== 'object') return;
      if (e.settlements !== undefined && e.settlements !== null) {
        if (!Array.isArray(e.settlements)) { delete e.settlements; fixed++; }
        else {
          const b = e.settlements.length;
          e.settlements = e.settlements.filter(x => x && typeof x === 'object');
          fixed += b - e.settlements.length;
        }
      }
      if (e.fields !== undefined && e.fields !== null && !Array.isArray(e.fields)) { delete e.fields; fixed++; }
      ['before', 'after'].forEach(k => {
        if (e[k] !== undefined && e[k] !== null && typeof e[k] !== 'object') { delete e[k]; fixed++; }
      });
    });

    if (quarantined.length) fixed += quarantined.length;
    if (fixed > 0) console.warn(`[Import] ซ่อมตัวเลขที่ใช้งานไม่ได้ ${fixed} จุด · แยกไว้ตรวจสอบ ${quarantined.length} รายการ`);
    return fixed;
  }
  // เขียนข้อมูลจากไฟล์สำรองลง state + IndexedDB
  // ใช้ร่วมกัน 2 ทาง: นำเข้าไฟล์ .json จากเครื่อง และกู้จาก Google Drive
  // ต้องเป็นโค้ดชุดเดียวกัน — ถ้าแยกกัน แก้ทางหนึ่งแล้วลืมอีกทางเมื่อไหร่ ข้อมูลจะเข้าไม่เหมือนกัน
  // ⚠️ ผู้เรียกต้องตรวจ isValidBackupObject() มาก่อนแล้ว
  async applyBackupData(parsed, opts) {
    // ทางเข้าสาธารณะ — แทนข้อมูลในคิวงานบันทึก (รองานขาย/ยกเลิก/ปิดกะที่ค้างอยู่ให้จบก่อน)
    // ทางกู้/นำเข้า/ย้อนจากหน้าจอเรียก _applyBackupDataLocked เองพร้อมสำเนาก่อนกู้ (ในคิวเดียวกัน)
    return this.withMutation('แทนข้อมูลจากไฟล์สำรอง', () => this._applyBackupDataLocked(parsed, opts));
  }

  // ⚠️ เรียกได้เฉพาะจากในคิวงานบันทึก (withMutation) เท่านั้น
  // extra.preRestoreSnapshot = สำเนาของ "ตอนนี้" ที่ต้องลงเครื่องพร้อมข้อมูลใหม่ใน transaction เดียว
  async _applyBackupDataLocked(parsed, opts, extra) {
    // ด่านสิทธิ์กลาง — ทุกทางที่แทนข้อมูลทั้งร้าน (นำเข้า/กู้จาก Drive/ย้อนสำเนา/เรียกตรง) ต้องผ่านตรงนี้
    // ผู้เรียกจากหน้าจอตรวจไปแล้วรอบหนึ่ง แต่ด่านจริงต้องอยู่ที่ตัวทำงาน ไม่ใช่ที่ปุ่ม
    if (!this.authorize('data.admin', 'การแทนข้อมูลทั้งร้าน')) {
      throw new Error('การแทนข้อมูลทั้งร้านทำได้เฉพาะเจ้าของร้านที่ล็อกอินอยู่');
    }
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
    // ข้อ 9: ไฟล์สำรองไม่มี PIN ของบัญชีเจ้าของ/ผู้จัดการ — ถ้าเครื่องนี้มีบัญชีเดียวกัน (รหัสเดียวกัน
    // และยังเป็นสิทธิ์เดียวกัน) อยู่แล้ว ให้ใช้ PIN เดิมในเครื่อง ไม่ต้องตั้งใหม่ (กู้ย้อนบนเครื่องเดิม)
    const localPins = new Map((Array.isArray(rollback.state && rollback.state.staff) ? rollback.state.staff : [])
      .filter(st => st && st.id && st.pin && PRIVILEGED_LEVELS.includes(st.accessLevel))
      .map(st => [st.id, st]));
    this.state.staff = (Array.isArray(parsed.staff) ? parsed.staff : []).map(st => {
      if (!st || typeof st !== 'object' || st.pin || !PRIVILEGED_LEVELS.includes(st.accessLevel)) return st;
      const loc = localPins.get(st.id);
      return (loc && loc.accessLevel === st.accessLevel) ? Object.assign({}, st, { pin: loc.pin }) : st;
    });
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
    // ── "ไฟล์นี้รู้เรื่องถึงเมื่อไร" (รอบตรวจ 5 ข้อ 1 · เจ้าของเลือก 2 ต.ค. 2569: ชีตใหม่กว่าไฟล์ = ถามก่อน) ──────
    // ⚠️ เดิมทุกบิลได้ "เวลาที่กดกู้" ซึ่งใหม่กว่าทุกเหตุการณ์บนชีตเสมอ → บิลที่ยกเลิก/คืนเงินหลังไฟล์สำรองถูกสร้าง
    //    กลับขึ้นชีตเงียบ ๆ และการแก้บิลหลังไฟล์นั้นถูกเขียนทับ (ตรวจความตรงกันก็จับไม่ได้ เพราะเครื่องกับชีตตรงกันแล้ว)
    // ตอนนี้: restoredAt = เวลาที่สร้างไฟล์สำรอง → ชีตยกเลิกบิลนี้หลังไฟล์นั้น = ALREADY_VOIDED (กล่องบิลรอตรวจ เจ้าของเลือก)
    //        restoreBase = รุ่นของบิลตามไฟล์ → ชีตแก้บิลนี้หลังไฟล์นั้น (ยอด/ช่องทาง/พนักงานต่าง) = STALE_REVISION (เจ้าของเลือก)
    //        ยังยกยุค (revEpoch) เป็นเวลาที่กู้เหมือนเดิม — คำขอเก่าที่ค้างในเน็ตจากก่อนกู้ยังแพ้เสมอ
    // forceWin (ปุ่มย้อนกลับไปก่อนกู้) = เจตนา "กลับไปเป็นแบบเดิมทั้งชุด" → กติกาเดิม (ใช้เวลาที่กดกู้ ไม่ส่งรุ่นตามไฟล์)
    // ไฟล์ที่ไม่มีเวลาสร้าง/เวลาเพี้ยน (ไฟล์รุ่นเก่ามาก) = ไม่รู้ว่าไฟล์รู้เรื่องถึงเมื่อไร → ใช้กติกาเดิมเช่นกัน
    const forceWin = !!(opts && opts.forceWin);
    const createdMs = Date.parse(parsed && parsed.createdAt);
    const fileTimeOk = Number.isFinite(createdMs) && createdMs > 0 && createdMs <= restoreStamp;
    const askWhenSheetNewer = !forceWin && fileTimeOk;
    const knownAt = askWhenSheetNewer ? createdMs : restoreStamp;
    let resyncCount = 0;
    (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
      if (tx && typeof tx === 'object') {
        // ⚠️ เดิมเป็นธง boolean ที่ติดกับบิลถาวร = ข้อยกเว้น "ข้ามทะเบียนบิลที่ยกเลิก" แบบไม่มีวันหมดอายุ
        // คำขอเก่าที่ค้างในเน็ตตั้งแต่ก่อน void ก็พกธงนี้ไปด้วย ปลายทางจึงแยกไม่ออกว่า
        // "ตั้งใจคืนบิลหลังยกเลิก" หรือ "คำขอเก่าที่หลงมาถึงทีหลัง" — ยอมรับทั้งคู่
        // ตอนนี้เก็บเวลาไว้แทน ปลายทางเทียบกับเวลาที่ยกเลิกแล้วยอมเฉพาะที่ใหม่กว่า
        // (เวลาทั้งสองฝั่งมาจากนาฬิกาเครื่องขาย จึงเทียบกันได้ตรง ๆ ไม่ต้องพึ่งนาฬิกา Google)
        tx.restoredAt = knownAt;
        // รุ่นตามไฟล์ — ต้องจำ "ก่อน" ยกยุค (ค่าเสีย = 0 เหมือนที่ส่งขึ้นชีตมาตลอด)
        if (askWhenSheetNewer) {
          const r0 = Number(tx.rev), e0 = Number(tx.revEpoch);
          tx.restoreBase = { epoch: Number.isInteger(e0) && e0 >= 0 ? e0 : 0, rev: Number.isInteger(r0) && r0 >= 0 ? r0 : 0 };
        } else {
          delete tx.restoreBase;
        }
        // รุ่นของบิล: การกู้ = เจตนาให้ข้อมูลชุดนี้ชนะของบนชีต → ยกยุค (epoch) ของทุกบิลเป็นเวลาที่กู้
        // คำขอเก่าที่ค้างในเน็ตจากก่อนกู้จะแพ้เสมอ (ดู STALE_REVISION ฝั่ง Apps Script)
        // — ยกเว้นชีตมีการแก้ที่ "ใหม่กว่าไฟล์" ซึ่งตรวจด้วย restoreBase ข้างบน (รอบตรวจ 5 ข้อ 1)
        tx.revEpoch = restoreStamp;
        if (!(Number(tx.rev) >= 0)) tx.rev = 0;
        delete tx.syncIssue;            // ความขัดแย้งเก่าเป็นของความสัมพันธ์ชุดเดิม — ส่งใหม่แล้วค่อยตัดสินใหม่
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
        take(sh.expenses, this.shiftAnchorTime(sh));
        addPeriod(this.shiftAnchorTime(sh));   // แถวนับเงินปิดกะอยู่ในสรุปของวันนี้ด้วย
      });
      // กะที่ยังเปิดอยู่: เก็บด้วยเสมอ เก็บเกินแค่ทำให้รีเฟรชสรุปงวดนั้นซ้ำ ซึ่งไม่มีผลเสีย
      take(shift.expenses, this.shiftAnchorTime(shift));
    };
    collectPeriods(rollback.state && rollback.state.transactions);   // บิลของเดิมก่อนกู้
    collectPeriods(this.state.transactions);                         // บิลที่กู้มา
    // บิลที่ถูกแยกไปตรวจสอบ: งวดของมันต้องคำนวณสรุปใหม่ด้วย (ยอดบนชีตต้องไม่รวมบิลที่ยังเชื่อไม่ได้)
    collectPeriods((this._lastSanitizeQuarantine || [])
      .filter(r => r && r.kind === 'transaction' && r.original && typeof r.original === 'object')
      .map(r => r.original));
    collectExpensePeriods(rollback.state && rollback.state.shift);   // ค่าใช้จ่ายของเดิมก่อนกู้
    collectExpensePeriods(parsed.shift);                             // ค่าใช้จ่ายที่กู้มา
    this.state.voidLog = Array.isArray(parsed.voidLog) ? parsed.voidLog : [];
    // ไฟล์สำรองรุ่นก่อนไม่มี expenseLog — ให้เป็นอาเรย์ว่างแทนที่จะเป็น undefined
    this.state.expenseLog = Array.isArray(parsed.expenseLog) ? parsed.expenseLog : [];
    this.state.editLog = Array.isArray(parsed.editLog) ? parsed.editLog : [];
    // รายการแยกตรวจสอบ = ของที่ติดมากับไฟล์ + ที่เพิ่งแยกออกในรอบนี้ (เก็บค่าต้นฉบับครบทั้งคู่)
    this.state.quarantine = (Array.isArray(parsed.quarantine) ? parsed.quarantine : [])
      .filter(r => r && typeof r === 'object')
      .concat(Array.isArray(this._lastSanitizeQuarantine) ? this._lastSanitizeQuarantine : []);
    // งานคลาวด์ค้าง: เดิมล้างทิ้งทั้งก้อน ทำให้คำสั่ง "ลบแถวบิลที่ยกเลิก" ที่ยังส่งไม่สำเร็จหายถาวร
    // แล้วแถวผีค้างบนชีตตลอดกาล — ตอนนี้สร้างคืนจากเจตนาที่ติดมากับไฟล์สำรองแทน
    // (งานของข้อมูลชุดเก่าในเครื่องนี้ถูกทิ้งเหมือนเดิม เพราะกำลังจะถูกเขียนทับทั้งชุด)
    this.state.cloudOutbox = this.rebuildCloudOutboxFromBackup(parsed);

    // เติมงานรีเฟรชสรุปของทุกงวดที่ได้รับผลจากการกู้ (ดู _restoreSummaryPeriods)
    // รอบตรวจ 6 ข้อ 2: รวมกับงวดสรุปที่ค้างมากับไฟล์ แล้วแยกเป็น "งานละ 1 เดือน" (ดู buildRestoreSummaryJobs)
    // — งานสรุปที่ค้างมากับไฟล์อาจเป็นงานก้อนใหญ่ของการกู้รอบก่อน ถ้าปล่อยไว้ก้อนเดียวจะกลับไปเป็นปัญหาเดิม
    const rp = this._restoreSummaryPeriods || { dateKeys: new Set(), monthKeys: new Set() };
    const allDates = new Set(rp.dateKeys), allMonths = new Set(rp.monthKeys);
    const carried = this.state.cloudOutbox.filter(j => j && j.needSummary &&
      !j.needVoidDelete && !j.needTelegram && !j.needBackup);
    carried.forEach(j => {
      (Array.isArray(j.dateKeys) ? j.dateKeys : []).forEach(k => allDates.add(k));
      (Array.isArray(j.monthKeys) ? j.monthKeys : []).forEach(k => allMonths.add(k));
    });
    if (carried.length) this.state.cloudOutbox = this.state.cloudOutbox.filter(j => !carried.includes(j));
    this.buildRestoreSummaryJobs([...allDates], [...allMonths], Date.now())
      .forEach(job => this.state.cloudOutbox.push(job));
    this.state.cart = [];

    this.state.shift = (parsed.shift && typeof parsed.shift === 'object' && !Array.isArray(parsed.shift))
      ? parsed.shift
      : { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
    // ซ่อมโครงสร้างกะจากไฟล์เก่า/ไฟล์ที่ field หาย
    if (!Array.isArray(this.state.shift.history)) this.state.shift.history = [];
    if (!Array.isArray(this.state.shift.expenses)) this.state.shift.expenses = [];
    if (typeof this.state.shift.active !== 'boolean') this.state.shift.active = false;

    // exactSettings (ใช้ตอน "ย้อนกลับไปก่อนกู้ข้อมูล"): ค่าว่างในสำเนาคือค่าจริงของเครื่องตอนนั้น ต้องคืนเป็นค่าว่างด้วย
    // เดิมข้ามค่าว่าง → พร้อมเพย์/แชท Telegram ของไฟล์ที่กู้ผิดค้างอยู่หลังย้อน (QR ชี้ไปบัญชีคนอื่น)
    const exactSettings = !!(opts && opts.exactSettings);
    if (exactSettings ? typeof parsed.shopPromptPayId === 'string' : parsed.shopPromptPayId) this.shopPromptPayId = parsed.shopPromptPayId;
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
    if (parsed.vatRate !== undefined && parsed.vatRate !== null && Number.isFinite(Number(parsed.vatRate))) this.vatRate = Number(parsed.vatRate);
    // ไม่รับ ownerPin / telegramToken / googleSheetsApiToken จากไฟล์สำรอง
    // เพราะไฟล์ที่ถูกแก้หรือหลุดออกไปต้องไม่มีสิทธิ์เปลี่ยนบัญชีหรือเข้าถึงคลาวด์ของเครื่องนี้

    // ⚠️ URL คลาวด์: ถ้าเครื่องนี้ตั้งค่าไว้แล้ว ให้ยึดของเครื่องเป็นหลัก
    // ไฟล์สำรองเก่าอาจเก็บ URL ของ deployment รุ่นก่อน — ถ้าทับลงไป แอปจะยิงไป URL ที่ตายแล้ว
    // แบบเงียบ ๆ (ไม่มี error ให้เห็นทันที) แล้วยอดขายจะไม่ขึ้นชีตโดยไม่มีใครรู้
    // แชท Telegram ใช้หลักเดียวกับ URL: เครื่องตั้งไว้แล้วยึดของเครื่อง (ไฟล์เก่าอาจเป็นแชทของผู้จัดการคนก่อน)
    if (exactSettings) {
      if (typeof parsed.googleSheetsUrl === 'string') this.googleSheetsUrl = parsed.googleSheetsUrl;
      if (typeof parsed.telegramChatId === 'string') this.telegramChatId = parsed.telegramChatId;
    } else {
      if (parsed.googleSheetsUrl && !this.googleSheetsUrl) this.googleSheetsUrl = parsed.googleSheetsUrl;
      if (parsed.telegramChatId && !this.telegramChatId) this.telegramChatId = parsed.telegramChatId;
    }

    this.clearDateKeyCache();   // ข้อมูลชุดใหม่ทั้งก้อน — ผลที่จำไว้ใช้ไม่ได้แล้ว
    this.invalidateReconcile('กู้/นำเข้าข้อมูลชุดใหม่');
    // สำเนาก่อนกู้ (ถ้ามี) ลงเครื่อง "พร้อมกัน" กับข้อมูลใหม่ — สำเร็จทั้งคู่หรือไม่เปลี่ยนอะไรเลย
    const extraRows = (extra && extra.preRestoreSnapshot)
      ? [{ key: 'preRestoreSnapshot', value: extra.preRestoreSnapshot }] : null;
    await this.saveStateOrThrow('ข้อมูลที่กู้คืน', extraRows ? { extraRows } : undefined);
    persisted = true;
    // ข้อมูลชุดใหม่ — งานคลาวด์ที่เริ่มกับข้อมูลชุดเก่าห้ามนำผลกลับมาเขียนทับ (ดู _dataGeneration)
    this._dataGeneration++;
    this._checkoutAttempt = null;
    // เริ่มส่งงานคลาวด์ของข้อมูลชุดใหม่ (บิลที่ต้องส่งใหม่/งานลบที่กู้คืนมา/รีเฟรชสรุป) หลังคิวงานบันทึกนี้จบ
    // — ห้าม await ตรงนี้ เพราะงานคลาวด์จะเข้าคิวงานบันทึกตอนเซฟผล ซึ่งเรากำลังถืออยู่
    setTimeout(() => { try { this.resumePendingCloudWork(); } catch (e) { console.warn('[Restore] resume failed', e); } }, 0);
    // ⚠️ ข้อมูลลงเครื่องแล้ว — error ตอนวาดหน้าจอห้ามไหลออกไปเป็น "กู้ไม่สำเร็จ ข้อมูลเดิมอยู่ครบ" (ซึ่งไม่จริง)
    try { this.renderEveryScreen(); } catch (e) {
      console.error('[Restore] render after save failed', e);
      this.showToast('กู้ข้อมูลลงเครื่องแล้ว แต่บางหน้าจอแสดงผลไม่ได้ — ปิดแล้วเปิดแอปใหม่', 'warning', 9000);
    }
    // ชื่อร้าน/โลโก้/คำโปรย/ธีม อยู่นอก renderEveryScreen — เดิมแถบข้างยังเป็นค่าเก่าจนกว่าจะปิดเปิดแอป
    // (ดูเหมือนกู้ไม่ครบ ชวนให้กู้ซ้ำ) · รอบตรวจ 5 ข้อ 5
    this.safeRender('ชื่อร้าน', () => this.applyShopName());
    this.safeRender('ธีม', () => this.applyTheme());
    this.safeRender('โลโก้', () => this.updateLogoPreview());
    this.vibrateDevice(100);

    // บัญชีเจ้าของสำรอง/ผู้จัดการที่ยังไม่มี PIN ในเครื่องนี้ (ไฟล์สำรองตัด PIN ของบัญชีเหล่านี้ออกโดยตั้งใจ)
    // เดิมไม่บอก — ชื่อหายจากหน้าล็อกอินเงียบ ๆ ผู้จัดการที่ต้องปิดกะคืนนั้นเข้าระบบไม่ได้ (รอบตรวจ 5 ข้อ 5)
    const needPin = (Array.isArray(this.state.staff) ? this.state.staff : [])
      .filter(st => st && PRIVILEGED_LEVELS.includes(st.accessLevel) && !st.pin);
    if (needPin.length) {
      const names = needPin.slice(0, 4).map(st => `${st.name || '-'} (${st.accessLevel === 'owner' ? 'เจ้าของ' : 'ผู้จัดการ'})`).join(', ') +
        (needPin.length > 4 ? ` และอีก ${needPin.length - 4} คน` : '');
      this.showToast(`บัญชี ${names} ยังไม่มี PIN ในเครื่องนี้ (ไฟล์สำรองไม่เก็บ PIN ของบัญชีสิทธิ์สูง) — ` +
        'ตั้ง PIN ใหม่ 6 หลักที่ ตั้งค่า → พนักงาน → แก้ไข ก่อน บัญชีนี้จึงจะเข้าระบบได้', 'warning', 15000);
    }

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
      const qTx = audit.badMoney + audit.badDate + audit.noId + audit.dupId;
      if (qTx)               parts.push(`บิล ${qTx} ใบถูกแยกไว้ตรวจสอบ (ไม่นับในยอด ไม่ส่งขึ้นชีต)`);
      if (audit.badExpenses) parts.push(`ค่าใช้จ่าย ${audit.badExpenses} รายการถูกแยกไว้ตรวจสอบ`);
      if (audit.badServices) parts.push(`บริการ ${audit.badServices} รายการราคาใช้ไม่ได้ — ปิดการขายไว้จนกว่าจะแก้ราคา`);
      if (audit.badShifts)   parts.push(`ตัวเลขกะ ${audit.badShifts} จุดใช้ไม่ได้`);
      if (audit.badLists)    parts.push(`รายการย่อยเสีย ${audit.badLists} จุด (ถูกล้างเป็นว่าง)`);
      this.showToast(
        `กู้ข้อมูลแล้ว แต่ไฟล์นี้มีส่วนที่เสีย: ${parts.join(' · ')} — ` +
        `ค่าต้นฉบับเก็บไว้ครบ ดู/ดาวน์โหลดได้ที่หน้าตั้งค่า > รายการที่แยกไว้ตรวจสอบ`,
        'warning', 12000);
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
      // รายการไฟล์สำรอง = ทางเข้าสู่ข้อมูลทั้งร้าน — Apps Script ขอรหัสเจ้าของ (ดู cloudPost)
      const d = await this.cloudPost('list_backups', {}, 20000, { owner: true });
      if (d.status !== 'success') throw new Error(this.explainCloudError(d.message) || 'คลาวด์แจ้งข้อผิดพลาด');

      const files = (d.details && Array.isArray(d.details.files)) ? d.details.files : [];
      if (!files.length) {
        list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted);">' +
          'ยังไม่มีไฟล์สำรองใน Google Drive<br>' +
          '<span style="font-size:0.8rem;">ไฟล์จะถูกสร้างอัตโนมัติทุกครั้งที่ปิดกะ</span></div>';
        return;
      }

      // รายชื่อถูกตัดที่ไฟล์ล่าสุด DRIVE_BACKUP_LIST_MAX ไฟล์ (ราว 2 สัปดาห์) — บอกตรง ๆ ว่าไฟล์เก่ากว่านั้นอยู่ที่ไหน (รอบตรวจ 6 ข้อ 5)
      const capNote = files.length >= DRIVE_BACKUP_LIST_MAX
        ? `<p style="font-size:0.74rem;color:var(--text-muted);margin:6px 2px 0;line-height:1.5;">แสดงไฟล์ล่าสุด ${files.length} ไฟล์ (ราว 2 สัปดาห์) — ` +
          'ไฟล์ที่เก่ากว่านี้ยังอยู่ในโฟลเดอร์ Erotica_POS_Backups บน Google Drive (เก็บ 90 วัน): ดาวน์โหลดไฟล์ที่ต้องการ ' +
          'แล้วใช้ปุ่ม "นำเข้าข้อมูลสำรอง (.json)" ในหน้าตั้งค่า</p>'
        : '';
      list.innerHTML = capNote + files.map((f, idx) => {
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
          // 1) ดึงเนื้อไฟล์ — ก้อนใหญ่กว่างานปกติมาก ให้เวลา 60 วิ
          //    ⚠️ ไม่ถ่ายสำเนาก่อนดาวน์โหลดแล้ว: ระหว่างรอไฟล์ร้านยังขายได้
          //    สำเนาที่ถ่ายไว้ก่อนหน้าจะไม่มีบิลที่ขายช่วงนั้น แล้วบิลพวกนั้นหายทั้งจากเครื่องและจากสำเนา
          //    สำเนาจะถูกถ่ายในขั้นที่ 3 ณ วินาทีที่แทนข้อมูลจริง
          this.showToast('กำลังดึงไฟล์สำรองจาก Google Drive...', 'info');
          const d = await this.cloudPost('get_backup', { fileId }, 60000, { owner: true });
          if (d.status !== 'success') throw new Error(this.explainCloudError(d.message) || 'คลาวด์แจ้งข้อผิดพลาด');

          const parsed = d.details && d.details.backupData;
          if (!this.isValidBackupObject(parsed)) {
            // ไฟล์จากแอปรุ่นใหม่กว่า: ลองไฟล์วันอื่นก็ไม่ผ่าน (มาจากแอปรุ่นเดียวกันหมด) — ต้องอัปเดตแอป (รอบตรวจ 5 ข้อ 7)
            throw new Error('ไฟล์สำรองใช้ไม่ได้' +
              (this._lastBackupRejectReason ? `: ${this._lastBackupRejectReason}` : '') +
              (this._lastBackupRejectNewer ? '' : ' — ลองเลือกไฟล์วันอื่น'));
          }

          // 2) ตรวจสุขภาพไฟล์ — ตรวจได้หลังดาวน์โหลดเท่านั้น (ตอนกดเลือกยังไม่เห็นเนื้อไฟล์)
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

          // 3) แทนข้อมูล — ในคิวงานบันทึก: รอการขาย/ยกเลิก/ปิดกะที่ค้างอยู่ให้จบก่อน
          //    แล้วถ่ายสำเนา "ตอนนี้" + เขียนข้อมูลใหม่ ลงเครื่องใน transaction เดียว
          await this.withMutation('กู้ข้อมูล', async () => {
            if (!this.requireOwnerForDataAction('กู้ข้อมูล')) throw new Error('สิทธิ์ไม่พอ');
            if (!this.canWriteData('กู้ข้อมูล')) throw new Error('หน้าต่างนี้เปิดซ้ำอยู่ — เก็บสำเนาก่อนกู้ไม่ได้');
            const snap = this.buildPreRestoreSnapshot();
            // เพิ่มอีกชั้น: พยายามโหลดเป็นไฟล์ .json ติดเครื่องไว้ด้วย (ล้มเหลวได้ ไม่หยุดงาน)
            // ทำตรงนี้ (ไม่ใช่ก่อนดาวน์โหลด) เพื่อให้ไฟล์มีบิลที่ขายระหว่างรอด้วย
            try { this.exportData({ downloadOnly: true, quiet: true }); } catch (e) { console.warn('export before restore failed', e); }
            await this._applyBackupDataLocked(parsed, undefined, { preRestoreSnapshot: snap });
          });
          await this.refreshPreRestoreUI();
          this.closeModal('modal-restore');
          this.showToast(`กู้ข้อมูลจากไฟล์วันที่ ${label} สำเร็จแล้ว — ถ้าผิดไฟล์ ย้อนกลับได้ที่หน้าตั้งค่า`, 'success', 8000);
          this.suggestReconcileAfterRestore();
        } catch (err) {
          console.error('restore failed', err);
          // ข้อมูลเดิมยังอยู่ครบ — การแทนข้อมูลเป็น all-or-nothing และคืนค่าในหน่วยความจำให้แล้ว
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
    // บิลทั้งเดือนบนชีต (ชื่อลูกค้า/ยอด/พนักงาน) — Apps Script ขอรหัสเจ้าของ (ดู cloudPost)
    const d = await this.cloudPost('list_bills', { monthKey }, 20000, { owner: true });
    if (!d || d.status !== 'success') {
      throw new Error(this.explainCloudError(d && d.message) || 'อ่านรายการบิลจากชีตไม่สำเร็จ');
    }
    return d.details || { bills: [], exists: false, truncated: false };
  }

  // เลขที่บิลที่อยู่ในรายการ "แยกไว้ตรวจสอบ" (ดู sanitizeBackupData)
  quarantinedBillIds() {
    return new Set((Array.isArray(this.state.quarantine) ? this.state.quarantine : [])
      .filter(r => r && typeof r === 'object' && r.kind === 'transaction' && r.id)
      .map(r => String(r.id)));
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
    const MONTH_CAP = 36;
    try {
      const result = { months: [], extra: [], quarantined: [], missing: [], mismatch: [], wrongTab: [], duplicates: [], conflicts: [],
        errors: [], truncated: false, scope: [], cloudOnlyMonths: [], skippedMonths: [], cloudMonthsSupported: true, at: Date.now() };
      // ⚠️ ชุด ID ของบิลในเครื่อง "ทุกเดือน" — กันเคสที่อันตรายที่สุดของเครื่องมือนี้:
      // บิลที่ยังมีชีวิตอยู่ในเครื่อง แต่แถวของมันไปอยู่ผิดแท็บเดือนบนชีต (ห้ามเสนอให้ลบ)
      const localMonthOf = new Map();
      (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
        if (tx && tx.id != null) localMonthOf.set(String(tx.id), tx.date ? this.getBusinessMonthKey(tx.date) : '');
      });
      // บิลที่ถูก "แยกไว้ตรวจสอบ" ตอนกู้ข้อมูล (ตัวเลขเงินเชื่อไม่ได้) ไม่อยู่ในรายการบิล แต่ยังเป็นยอดขายจริงที่รอคนตรวจ
      // แถวของมันบนชีตห้ามถูกเสนอปุ่มลบ (เดิมไปโผล่ในกลุ่ม "มีบนชีตแต่ไม่มีในเครื่อง" พร้อมปุ่มลบ)
      const quarantinedIds = this.quarantinedBillIds();
      // ใช้คิวคลาวด์เดียวกับงานอื่น — ไม่ให้อ่านคร่อมจังหวะที่กำลังเขียนอยู่
      await this.runCloudTask(async () => {
        // ── ขอบเขต: เดือนที่มีในเครื่อง + เดือนที่มี "เฉพาะบนชีต" (ข้อ 15) ──────────────
        const localMonths = this.reconcileMonthsToCheck();
        let cloudMonths = [];
        // รอบตรวจ 5 ข้อ 7: "Apps Script รุ่นเก่า" เฉพาะเมื่อชีตบอกว่าไม่รู้จักคำสั่งนี้จริง ๆ
        // เดิมเหมารวมทุกความล้มเหลว (ยังไม่ตั้งรหัสเจ้าของ / กดยกเลิกช่องรหัส / เน็ตสะดุด) ว่าเป็นรุ่นเก่า = ไล่แก้ผิดที่
        try {
          const cm = await this.cloudPost('list_bill_months', {}, 20000, { owner: true });
          if (cm && cm.status === 'success' && cm.details && Array.isArray(cm.details.months)) {
            cloudMonths = cm.details.months.map(m => m && m.monthKey).filter(mk => this.isValidMonthKey(mk));
          } else if (cm && cm.code === 'INVALID_ACTION') {
            result.cloudMonthsSupported = false;
          } else {
            result.cloudMonthsError = this.explainCloudError(cm && cm.message) || 'ชีตไม่ตอบรายชื่อเดือน';
          }
        } catch (e) {
          result.cloudMonthsError = this.explainCloudError(e);
          // เจ้าของกดยกเลิกช่องรหัสเจ้าของ — ไม่ถามซ้ำทีละเดือนอีก (ทุกเดือนต้องใช้รหัสเดียวกัน)
          if (/^ยกเลิก — ต้องใช้รหัสเจ้าของ/.test(String((e && e.message) || ''))) result.ownerKeyCancelled = true;
        }
        const ord = mk => mk.slice(3) + mk.slice(0, 2);
        const all = [...new Set(localMonths.concat(cloudMonths))].sort((a, b) => ord(b).localeCompare(ord(a)));
        const months = all.slice(0, MONTH_CAP);
        result.skippedMonths = all.slice(MONTH_CAP);
        result.cloudOnlyMonths = cloudMonths.filter(mk => !localMonths.includes(mk) && ![...localMonthOf.values()].includes(mk));

        for (const mk of months) {
          // เจ้าของกดยกเลิกช่องรหัสไปแล้ว — ไม่เด้งถามซ้ำทุกเดือน (รอบตรวจ 5 ข้อ 7)
          if (result.ownerKeyCancelled) {
            result.errors.push({ monthKey: mk, message: 'ไม่ได้ตรวจ — ต้องใส่รหัสเจ้าของร้าน (Owner key) ก่อน' });
            continue;
          }
          let info;
          try {
            info = await this.fetchCloudBills(mk);
          } catch (e) {
            const em = (e && e.message) || String(e);
            if (/^ยกเลิก — ต้องใช้รหัสเจ้าของ/.test(em)) result.ownerKeyCancelled = true;
            result.errors.push({ monthKey: mk, message: em });
            continue;
          }
          result.months.push(mk);
          const rows = Array.isArray(info.bills) ? info.bills : [];
          if (info.truncated) result.truncated = true;
          result.scope.push({ monthKey: mk, read: rows.length, total: Number(info.rowsTotal) || rows.length, truncated: !!info.truncated });

          // ⚠️ เดิมเก็บลง Map ตามเลขที่บิล — แถวซ้ำถูกกลบเหลือแถวเดียว ตอนนี้จัดกลุ่มทุกแถว
          const byId = new Map();
          rows.forEach(b => { if (b && b.id) { const k = String(b.id); if (!byId.has(k)) byId.set(k, []); byId.get(k).push(b); } });
          const localMap = new Map();
          (Array.isArray(this.state.transactions) ? this.state.transactions : []).forEach(tx => {
            if (tx && tx.date && this.getBusinessMonthKey(tx.date) === mk) localMap.set(String(tx.id), tx);
          });

          byId.forEach((list, id) => {
            if (list.length > 1) {
              // ไม่รู้ว่าแถวไหนคือของจริง — แจ้งทุกแถว ไม่เปรียบเทียบ/ไม่ให้ปุ่มลบ (เจ้าของต้องตรวจในชีตเอง)
              result.duplicates.push({ monthKey: mk, id, rows: list.map(b => b.row).filter(Boolean),
                totals: list.map(b => Number(b.total) || 0), local: localMap.has(id) });
              return;
            }
            const b = list[0];
            const tx = localMap.get(id);
            if (!tx) {
              const bucket = localMonthOf.has(id) ? result.wrongTab : (quarantinedIds.has(id) ? result.quarantined : result.extra);
              bucket.push({ monthKey: mk, id, when: b.when || '', customer: b.customer || '',
                            total: Number(b.total) || 0, idOk: b.idOk !== false, row: b.row,
                            localMonthKey: localMonthOf.get(id) || '' });
              return;
            }
            const diffs = this.reconcileFieldDiffs(tx, b);
            if (diffs.length) {
              result.mismatch.push({ monthKey: mk, id, when: b.when || '', fields: diffs,
                localTotal: Math.round((Number(tx.total) || 0) * 100) / 100, cloudTotal: Math.round((Number(b.total) || 0) * 100) / 100 });
            }
          });
          localMap.forEach((tx, id) => {
            if (byId.has(id)) return;
            if (tx.syncStatus === 'conflict') { result.conflicts.push({ monthKey: mk, id }); return; }
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

  // ── เทียบบิลในเครื่องกับแถวบนชีต "ทุกช่องที่สำคัญ" (ข้อ 15) ─────────────────────
  // เทียบเฉพาะช่องที่ชีตส่งมา (Apps Script รุ่นเก่าส่งแค่ เลขที่/เวลา/ลูกค้า/ยอด) · เงินเทียบเป็นสตางค์
  // ค่าที่คาดบนชีตคำนวณด้วยกติกาเดียวกับตอนเขียนแถว (handleTransaction): ช่องทางจ่าย = ป้ายภาษาไทย,
  // บิลรุ่นเก่าไม่มี VAT → ช่อง "ไม่คิด VAT" = ยอดสุทธิ และช่องอื่นเป็น 0
  reconcileFieldDiffs(tx, b) {
    const LABEL = { cash: 'เงินสด', promptpay: 'Scan (QR)', credit: 'Credit Card' };
    const txt = v => String(v == null ? '' : v).replace(/^'/, '').trim();
    const sat = v => Math.round((Number(v) || 0) * 100);
    const legacy = [tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding].every(v => v === undefined || v === null);
    const txD = new Date(tx.date);
    const p2 = n => String(n).padStart(2, '0');
    const when = `${txD.getFullYear()}-${p2(txD.getMonth() + 1)}-${p2(txD.getDate())} ${p2(txD.getHours())}:${p2(txD.getMinutes())}:${p2(txD.getSeconds())}`;
    const expect = {
      total: ['ยอดสุทธิ', 'money', tx.total],
      subtotal: ['ราคารวม', 'money', tx.subtotal != null ? tx.subtotal : tx.total],
      discount: ['ส่วนลด', 'money', tx.discount != null ? tx.discount : 0],
      nonVatBase: ['ไม่คิด VAT', 'money', legacy ? tx.total : tx.nonVatBase],
      vatableBase: ['คิด VAT', 'money', legacy ? 0 : tx.vatableBase],
      vatAmount: ['VAT', 'money', legacy ? 0 : tx.vatAmount],
      rounding: ['ปัดเศษ', 'money', legacy ? 0 : tx.rounding],
      payment: ['ช่องทางจ่าย', 'text', LABEL[this.paymentMethodOf(tx)] || LABEL.cash],
      customer: ['ลูกค้า', 'text', tx.customerName],
      services: ['รายการบริการ', 'text', (Array.isArray(tx.services) ? tx.services : []).join(', ')],
      staff: ['พนักงาน', 'text', (Array.isArray(tx.staffNames) ? tx.staffNames : []).join(', ')],
      when: ['วันเวลา', 'text', when]
    };
    const out = [];
    Object.keys(expect).forEach(k => {
      if (b[k] === undefined || b[k] === null) return;          // ชีตไม่ได้ส่งช่องนี้มา — ไม่เดา
      if (k === 'when' && txt(b[k]) === '') return;
      const [label, kind, local] = expect[k];
      const same = kind === 'money' ? sat(local) === sat(b[k]) : txt(local) === txt(b[k]);
      if (!same) out.push({ field: k, label, local: kind === 'money' ? sat(local) / 100 : txt(local), cloud: kind === 'money' ? sat(b[k]) / 100 : txt(b[k]) });
    });
    // รุ่นของบิล: ชีตใหม่กว่าเครื่อง = มีการแก้จากที่อื่น/เครื่องกู้ข้อมูลเก่ามา (ส่งทับได้ต้องตั้งใจเท่านั้น)
    const m = /^v1:(\d+):(\d+)$/.exec(txt(b.version));
    if (m) {
      const le = Number(tx.revEpoch) || 0, lr = Number(tx.rev) || 0, ce = Number(m[1]), cr = Number(m[2]);
      if (ce > le || (ce === le && cr > lr)) out.push({ field: 'version', label: 'รุ่นของบิล', local: `${le}:${lr}`, cloud: `${ce}:${cr} (ชีตใหม่กว่า)` });
    }
    return out;
  }
  renderReconcileResult() {
    const body = document.getElementById('reconcile-body');
    const r = this._reconcile;
    if (!body || !r) return;
    const baht = v => `฿${(Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    const notSynced = r.missing.filter(m => m.pending);
    const trulyMissing = r.missing.filter(m => !m.pending);
    const parts = [];

    // ── ขอบเขตการตรวจ "ตามจริง" (ข้อ 15): เดือนไหนอ่านได้กี่แถวจากทั้งหมดเท่าไร · เดือนที่ข้าม · เดือนที่มีเฉพาะบนชีต ──
    const scope = Array.isArray(r.scope) ? r.scope : [];
    const scopeTxt = scope.length
      ? scope.map(x => `${escapeHtml(x.monthKey)} (${x.truncated ? `อ่าน ${x.read} จาก ${x.total} แถว` : `${x.read} แถว`})`).join(', ')
      : (r.months.map(m => escapeHtml(m)).join(', ') || '-');
    parts.push(`<p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 10px;">
      ตรวจแล้ว ${r.months.length} เดือน: ${scopeTxt}
      ${r.truncated ? '<br><b style="color:var(--accent-premium);">บางเดือนมีบิลมากเกินกว่าจะอ่านครบในรอบเดียว — แถวที่ไม่ได้อ่านยังไม่ถูกตรวจ</b>' : ''}
      ${(r.cloudOnlyMonths && r.cloudOnlyMonths.length) ? `<br>เดือนที่มีเฉพาะบนชีต (ไม่มีบิลในเครื่อง): ${r.cloudOnlyMonths.map(m => escapeHtml(m)).join(', ')}` : ''}
      ${(r.skippedMonths && r.skippedMonths.length) ? `<br><b style="color:var(--accent-premium);">ยังไม่ได้ตรวจ ${r.skippedMonths.length} เดือนที่เก่ากว่า (${r.skippedMonths.slice(0, 6).map(m => escapeHtml(m)).join(', ')}${r.skippedMonths.length > 6 ? ' …' : ''})</b>` : ''}
      ${r.cloudMonthsSupported === false ? '<br>ตรวจหาเดือนที่มีเฉพาะบนชีตไม่ได้ (Apps Script รุ่นเก่า) — ตรวจเฉพาะเดือนที่มีในเครื่อง' : ''}
      ${r.cloudMonthsError ? '<br>ตรวจหาเดือนที่มีเฉพาะบนชีตไม่ได้: ' + escapeHtml(r.cloudMonthsError) + ' — ตรวจเฉพาะเดือนที่มีในเครื่อง' : ''}
    </p>`);
    const dups = Array.isArray(r.duplicates) ? r.duplicates : [];
    const conflicts = Array.isArray(r.conflicts) ? r.conflicts : [];
    if (conflicts.length) {
      parts.push(`<p style="font-size:0.8rem;color:var(--accent-premium);">มีบิลรอตรวจ ${conflicts.length} ใบที่ยังไม่ได้ส่งขึ้นชีต (ข้อมูลขัดแย้ง/ข้อมูลเงินเชื่อไม่ได้) — จัดการได้ที่หน้าตั้งค่า &gt; บิลรอตรวจ</p>`);
    }

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
    const scanComplete = r.errors.length === 0 && r.months.length > 0 && !r.truncated && !(r.skippedMonths && r.skippedMonths.length);
    const quarantinedRows = Array.isArray(r.quarantined) ? r.quarantined : [];
    if (!r.extra.length && !quarantinedRows.length && !trulyMissing.length && !r.mismatch.length && !r.wrongTab.length && !dups.length && !scanComplete) {
      parts.push(`<div style="border:1px solid var(--accent-premium);border-radius:8px;padding:12px;">
        <b style="color:var(--accent-premium);"><i class="fa-solid fa-triangle-exclamation"></i> ยังสรุปไม่ได้ว่าตรงกัน</b>
        <p style="font-size:0.8rem;margin:6px 0 0;color:var(--text-secondary);">
          ${r.months.length === 0 ? 'อ่านรายการบิลจากชีตไม่สำเร็จเลยสักเดือน' :
            (r.errors.length ? `อ่านไม่สำเร็จ ${r.errors.length} เดือน` :
              (r.truncated ? 'บางเดือนมีบิลมากเกินกว่าจะอ่านครบในรอบเดียว' : 'ยังมีเดือนเก่าที่ไม่ได้ตรวจ'))}
          — ในส่วนที่อ่านได้ยังไม่พบความต่าง แต่ยังไม่ครบทุกเดือน แก้ปัญหาด้านบนแล้วกดตรวจใหม่</p>
      </div>`);
      body.innerHTML = parts.join('');
      this.setReconcileStatus(`ตรวจไม่ครบ เมื่อ ${new Date(r.at).toLocaleTimeString('th-TH')}`, 'error');
      return;
    }

    if (!r.extra.length && !quarantinedRows.length && !trulyMissing.length && !r.mismatch.length && !r.wrongTab.length && !dups.length) {
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

    if (dups.length) {
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--color-danger);">เลขที่บิลซ้ำหลายแถวบนชีต — ${dups.length} เลขที่</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          ระบบไม่รู้ว่าแถวไหนคือของจริง จึงไม่เทียบยอดและไม่ให้ปุ่มลบ — เปิดชีตแล้วตรวจแถวตามเลขแถวที่บอก ลบแถวที่ซ้ำเอง แล้วกดตรวจใหม่</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>แท็บ</th><th>แถวที่ซ้ำ</th><th>ยอดแต่ละแถว</th><th>ในเครื่อง</th></tr></thead>
          <tbody>${dups.slice(0, CAP).map(x => `<tr><td><strong>${escapeHtml(x.id)}</strong></td><td>${escapeHtml(x.monthKey)}</td>` +
            `<td>${escapeHtml((x.rows || []).join(', '))}</td><td>${(x.totals || []).map(v => baht(v)).join(' / ')}</td>` +
            `<td>${x.local ? 'มี' : 'ไม่มี'}</td></tr>`).join('')}</tbody></table></div>${more(dups)}</div>`);
    }

    if (r.extra.length) {
      const sum = r.extra.reduce((s, x) => s + (Number(x.total) || 0), 0);
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-premium);">มีบนชีตแต่ไม่มีในเครื่องนี้ — ${r.extra.length} ใบ · รวม ${baht(sum)}</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          ส่วนใหญ่คือ <b>ยอดขายจริง</b> ที่ขายหลังไฟล์สำรองล่าสุด (เช่นกู้ข้อมูลลงเครื่องใหม่หลังเครื่องเดิมพัง) — แถวบนชีตคือหลักฐานเดียวของบิลพวกนี้<br>
          <b>ปกติไม่ต้องลบ</b> · ลบเฉพาะแถวที่ตรวจกับใบเสร็จจริงแล้วว่าเป็นบิลทดสอบ/บิลผิด — ลบแล้วกู้แถวคืนจากที่นี่ไม่ได้<br>
          ⚠️ บิลกลุ่มนี้ไม่อยู่ในเครื่อง จึง<b>ไม่ถูกนับ</b>ในสรุปที่เครื่องนี้ส่งขึ้นชีต — ยอดของวันนั้นให้ดูจากแท็บบิลบนชีต
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

    if (quarantinedRows.length) {
      parts.push(`<div style="margin-bottom:14px;">
        <b style="color:var(--accent-premium);">บิลที่แยกไว้ตรวจสอบในเครื่อง แต่ยังมีแถวบนชีต — ${quarantinedRows.length} ใบ</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          บิลเหล่านี้ถูกแยกออกตอนกู้ข้อมูลเพราะตัวเลขเงินเชื่อไม่ได้ (ไม่ใช่บิลที่ไม่มีอยู่จริง) ระบบจึงไม่ให้ปุ่มลบ<br>
          ตรวจเทียบกับใบเสร็จจริงก่อน (ดาวน์โหลดรายการได้ที่หน้าตั้งค่า &gt; รายการที่แยกไว้ตรวจสอบ) แล้วค่อยแก้/ลบในชีตเอง</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>เวลา</th><th>ลูกค้า</th><th>ยอดบนชีต</th><th></th></tr></thead>
          <tbody>${quarantinedRows.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td><td>${escapeHtml(x.when)}</td>` +
            `<td>${escapeHtml(x.customer || '-')}</td><td>${baht(x.total)}</td>`,
            '<span style="font-size:0.75rem;color:var(--text-muted);">รอตรวจกับใบเสร็จ</span>'
          )).join('')}</tbody></table></div>${more(quarantinedRows)}</div>`);
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
        <b style="color:var(--accent-premium);">ข้อมูลไม่ตรงกัน — ${r.mismatch.length} ใบ</b>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 6px;">
          เทียบทุกช่องสำคัญ (ยอด · ราคารวม · ส่วนลด · VAT · ช่องทางจ่าย · พนักงาน · ลูกค้า · รายการ · เวลา) —
          ข้อมูลในเครื่องคือข้อมูลที่ระบบใช้คิดรายงาน กดส่งทับเพื่อให้ชีตตรงกับเครื่อง (ถ้าชีตถูกกว่า ให้แก้บิลในเครื่องก่อน)</p>
        <div style="overflow-x:auto;"><table class="customer-table" style="font-size:0.8rem;">
          <thead><tr><th>เลขที่บิล</th><th>ต่างกันที่</th><th>ในเครื่อง</th><th>บนชีต</th><th></th></tr></thead>
          <tbody>${r.mismatch.slice(0, CAP).map(x => row(
            `<td><strong>${escapeHtml(x.id)}</strong></td>` +
            `<td>${escapeHtml((Array.isArray(x.fields) && x.fields.length ? x.fields : [{ label: 'ยอดสุทธิ' }]).map(f => f.label).join(', '))}</td>` +
            `<td>${Array.isArray(x.fields) && x.fields.length ? x.fields.map(f => escapeHtml(String(f.local))).join('<br>') : baht(x.localTotal)}</td>` +
            `<td>${Array.isArray(x.fields) && x.fields.length ? x.fields.map(f => escapeHtml(String(f.cloud))).join('<br>') : baht(x.cloudTotal)}</td>`,
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
    // บิลที่แยกไว้ตรวจสอบ = ยอดขายจริงที่รอคนตรวจ — ด่านซ้ำตรงตัวลบ (ไม่พึ่งแค่การไม่แสดงปุ่ม)
    if (this.quarantinedBillIds().has(id)) {
      this.showToast(`บิล ${id.slice(0, 24)} อยู่ในรายการที่แยกไว้ตรวจสอบ — ไม่ลบให้ ตรวจกับใบเสร็จจริงแล้วแก้ในชีตเอง`, 'warning', 9000);
      return;
    }
    this.showConfirm(
      `ลบแถวบิล ${id} ออกจากชีตเดือน ${item.monthKey}?\n\n` +
      `ยอด ${(Number(item.total) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท · ${item.when || '-'}\n\n` +
      'แถวบนชีตจะถูกลบถาวรและกู้กลับจากที่นี่ไม่ได้ — ระบบจะบันทึกไว้ในประวัติการแก้ไขย้อนหลังให้',
      async () => {
        const queued = await this.withMutation('การลบแถวบนชีต', async () => {
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
        return true;
        });
        if (!queued) return;
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
    const marked = await this.withMutation('การสั่งส่งบิลขึ้นชีตใหม่', async () => {
      if (!this.state.transactions.includes(tx)) return false;   // ข้อมูลถูกแทนทั้งชุดระหว่างรอ
      const prev = tx.syncStatus;
      const prevEpoch = tx.revEpoch, prevIssue = tx.syncIssue;
      tx.syncStatus = 'pending';
      // เจ้าของสั่ง "ส่งบิลในเครื่องขึ้นชีต" จากหน้าเทียบความต่าง = เจตนาให้เครื่องชนะ → ยกยุคของบิล
      // (ไม่งั้นถ้าบนชีตเป็นรุ่นใหม่กว่า คำสั่งนี้จะถูกปฏิเสธ STALE_REVISION ทั้งที่เจ้าของตั้งใจ)
      tx.revEpoch = Math.max(Date.now(), (Number(tx.revEpoch) || 0) + 1);
      delete tx.syncIssue;
      try {
        await this.saveStateOrThrow('การสั่งส่งบิลขึ้นชีตใหม่');
      } catch (err) {
        tx.syncStatus = prev;
        if (prevEpoch === undefined) delete tx.revEpoch; else tx.revEpoch = prevEpoch;
        if (prevIssue !== undefined) tx.syncIssue = prevIssue;
        this.showToast('บันทึกไม่สำเร็จ — ยังไม่ได้ส่งอะไรขึ้นชีต: ' + (err.message || err), 'error', 8000);
        return false;
      }
      return true;
    });
    if (!marked) return;
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
    const shiftAll  = this.state.transactions.filter(tx => {
      const txTime = new Date(tx.date).getTime();
      return txTime >= startTime && txTime <= endTime;
    });
    // ข้อ 14: ยอดขายใช้ตัวกรองเดียวกับรายงาน/ชีต — บิลรอตรวจไม่นับ แต่บอกจำนวนแยก
    const shiftSplit = this.summaryBillsOf(shiftAll);
    const shiftTxs  = shiftSplit.bills;
    const totalSales    = shiftTxs.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0);
    const totalCourses  = shiftTxs.reduce((sum, tx) => sum + (tx.services ? tx.services.length : 0), 0);
    const cashSales     = shiftTxs.filter(tx => this.paymentMethodOf(tx) === 'cash').reduce((sum, tx) => sum + tx.total, 0);
    const transferSales = shiftTxs.filter(tx => this.paymentMethodOf(tx) === 'promptpay').reduce((sum, tx) => sum + tx.total, 0);
    const creditSales   = shiftTxs.filter(tx => this.paymentMethodOf(tx) === 'credit').reduce((sum, tx) => sum + tx.total, 0);
    const expensesTotal = shiftLog.expensesTotal || 0;
    const expectedCash  = shiftLog.expectedCash || 0;
    const otherExp      = Number(shiftLog.otherExpensesTotal) || 0;
    const drawerExp     = (typeof shiftLog.drawerExpensesTotal === 'number') ? shiftLog.drawerExpensesTotal : expensesTotal;
    const overspend     = Number(shiftLog.overspend) || 0;
    const countedCash   = shiftLog.countedCash || 0;
    const diff          = shiftLog.difference || 0;
    const adjustTotal   = Number(shiftLog.cashAdjustTotal) || 0;
    const adjustCount   = Array.isArray(shiftLog.cashAdjustments) ? shiftLog.cashAdjustments.length : 0;
    const unsettled     = Number(shiftLog.unsettledCount) || (Array.isArray(shiftLog.unsettledAdjustments) ? shiftLog.unsettledAdjustments.length : 0);
    const invalidBills  = Array.isArray(shiftLog.invalidBills) ? shiftLog.invalidBills.length : 0;
    // คำเตือนไฟล์สำรอง (เครื่องถูกพัก / สำรองล้มเหลว / ขาดช่วงนาน) — Telegram คือช่องทางเดียวที่ถึงเจ้าของแน่ ๆ
    const backupWarn    = this.backupHealthWarning(endTime);
    const timeStartStr  = new Date(startTime).toLocaleString('th-TH');
    const timeEndStr    = new Date(endTime).toLocaleString('th-TH');
    // ข้อ 15: แจกแจงค่าใช้จ่าย (ยอด · รายการ · คนลง · จ่ายจากไหน) + บิลที่ยกเลิก/ค่าใช้จ่ายที่ถูกลบในกะ
    // พนักงานทุกระดับลงค่าใช้จ่าย "จ่ายจากลิ้นชัก" ได้ — เจ้าของต้องเห็นว่าใครลงอะไร ไม่ใช่แค่ยอดรวม
    const baht0 = v => '฿' + (Number(v) || 0).toLocaleString('th-TH');
    const short = (t, n) => { const x = String(t == null ? '' : t); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
    const expList = (Array.isArray(shiftLog.expenses) ? shiftLog.expenses : []).filter(e => e && typeof e === 'object');
    const EXP_CAP = 15;
    const expLines = expList.slice(0, EXP_CAP).map(e =>
      `  - ${baht0(e.amount)} · ${escapeTelegram(short(e.note || e.type || '-', 60))} · ลงโดย ${escapeTelegram(e.by || '-')}` +
      `${e.approvedBy ? ' · อนุมัติ ' + escapeTelegram(short(e.approvedBy, 30)) : ''}` +
      `${this.isExpenseOutsideDrawer(e) ? ' · จ่ายทางอื่น' : ''}\n`).join('') +
      (expList.length > EXP_CAP ? `  - …และอีก ${expList.length - EXP_CAP} รายการ (ดูในหน้ารายงาน)\n` : '');
    const inShift = t => { const x = Number(t); return x >= startTime && x <= endTime; };
    const voids = (Array.isArray(this.state.voidLog) ? this.state.voidLog : []).filter(v => v && inShift(v.date));
    const voidSum = voids.reduce((a, v) => a + (Number(v.amount) || 0), 0);
    const delExp = (Array.isArray(this.state.expenseLog) ? this.state.expenseLog : []).filter(x => x && inShift(x.date));
    const delExpSum = delExp.reduce((a, x) => a + (Number(x.amount) || 0), 0);

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
      `• รวมค่าใช้จ่าย: ฿${expensesTotal.toLocaleString('th-TH')}${expList.length ? ` (${expList.length} รายการ)` : ''}\n` +
      (otherExp > 0 ? `  - จ่ายจากลิ้นชัก: ฿${drawerExp.toLocaleString('th-TH')}\n  - จ่ายทางอื่น (ไม่หักจากลิ้นชัก): ฿${otherExp.toLocaleString('th-TH')}\n` : '') +
      expLines +
      (delExp.length ? `🗑 ค่าใช้จ่ายที่ถูกลบในกะ: ${delExp.length} รายการ (${baht0(delExpSum)})\n` : '') +
      (voids.length ? `🧾 บิลที่ถูกยกเลิกในกะ: ${voids.length} ใบ (${baht0(voidSum)}) — โดย ${escapeTelegram([...new Set(voids.map(v => v.by || '-'))].join(', '))}\n` : '') +
      (shiftSplit.excluded ? `⚠️ บิลรอตรวจ (ไม่นับในยอดขายด้านบน): ${shiftSplit.excluded} ใบ\n` : '') +
      `\n` +
      `📊 <b>สรุปกระแสเงินสดและลิ้นชัก:</b>\n` +
      `• เงินสดทอนเปิดกะ: ฿${(shiftLog.startCash || 0).toLocaleString('th-TH')}\n` +
      // ตัวเลขลิ้นชักใช้ค่าที่ล็อกไว้ตอนปิดกะ (ไม่คำนวณใหม่จากบิลตอนส่ง — ส่งช้า/แก้บิลทีหลังตัวเลขต้องไม่เปลี่ยน)
      `• เงินสดที่รับจากการขาย (ตอนชำระ): ฿${(Number(shiftLog.cashSales) || 0).toLocaleString('th-TH')}\n` +
      (adjustTotal !== 0 || adjustCount
        ? `• คืน/เก็บเงินส่วนต่างที่บันทึกในกะ: ${adjustTotal >= 0 ? '+' : '-'}฿${Math.abs(adjustTotal).toLocaleString('th-TH')} (${adjustCount} รายการ)\n` : '') +
      `• รายได้สุทธิหลังหักค่าใช้จ่าย: ฿${(totalSales - expensesTotal).toLocaleString('th-TH')}\n` +
      `• เงินสดที่ควรมีในลิ้นชัก: ฿${expectedCash.toLocaleString('th-TH')}\n` +
      (overspend > 0 ? `⚠️ ค่าใช้จ่ายจากลิ้นชักเกินเงินในลิ้นชัก: ฿${overspend.toLocaleString('th-TH')} (นับเป็นเงินขาด)\n` : '') +
      `• เงินสดที่นับได้จริง: ฿${countedCash.toLocaleString('th-TH')}\n` +
      `• ส่วนต่าง (ขาด/เกิน): ${diff >= 0 ? '+' : ''}฿${diff.toLocaleString('th-TH')}\n` +
      (unsettled ? `⚠️ บิลที่แก้ยอด/ช่องทางแล้วยังไม่บันทึกคืน/เก็บเงิน: ${unsettled} ใบ\n` : '') +
      (invalidBills ? `⚠️ บิลข้อมูลรับเงินเสีย (ไม่ได้นับในยอดที่ควรมี): ${invalidBills} ใบ\n` : '') +
      (backupWarn ? `⚠️ <b>ไฟล์สำรอง:</b> ${escapeTelegram(backupWarn)}\n` : '') +
      `━━━━━━━━━━━━━━━━`;
  }

  // ส่งข้อความ Telegram แล้วคืน true/false ว่าส่งถึงไหม (ใช้กับ outbox retry)
  async postTelegram(message) {
    if (!this.telegramToken || !this.telegramChatId) {
      this._cloudFailReason = 'ยังไม่ได้ตั้ง Telegram Token / Chat ID ในหน้าตั้งค่า';
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
      const r = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.telegramChatId, text: message, parse_mode: 'HTML' })
      }, 15000);
      let d = null;
      try { d = await r.json(); } catch (e) { d = null; }
      if (d && d.ok) return true;
      // รอบตรวจ 5 ข้อ 3: เก็บเหตุผลที่ Telegram ปฏิเสธไว้ให้เจ้าของเห็น (เดิมทิ้ง description ไปเลย)
      this._cloudFailReason = this.explainTelegramError(d, r && r.status);
      console.error('Telegram rejected:', d && d.description, r && r.status);
      return false;
    } catch (err) {
      console.error('Telegram post failed:', err);
      this._cloudFailReason = 'ส่ง Telegram ไม่ได้: ' + this.explainCloudError(err);
      return false;
    }
  }

  // แปลคำตอบ error ของ Telegram เป็นวิธีแก้ (รอบตรวจ 5 ข้อ 3) — ข้อความที่ไม่รู้จักคืนตามที่ Telegram บอก
  explainTelegramError(d, status) {
    const desc = String((d && d.description) || '').trim();
    const newChat = d && d.parameters && d.parameters.migrate_to_chat_id;
    if (newChat) {
      return `กลุ่ม Telegram ถูกอัปเกรดเป็น supergroup — Chat ID เปลี่ยนเป็น ${newChat} ให้แก้ที่ ตั้งค่า → Telegram Chat ID`;
    }
    if (/unauthorized/i.test(desc) || status === 401) {
      return 'Telegram Token ใช้ไม่ได้ (ผิด/ถูกยกเลิก) — วาง Token ใหม่ที่หน้าตั้งค่า';
    }
    if (/chat not found/i.test(desc)) {
      return 'Telegram หาแชทไม่เจอ — Chat ID ผิด หรือบอทยังไม่ได้อยู่ในกลุ่ม/ถูกเอาออกจากกลุ่ม';
    }
    if (/bot was kicked|bot is not a member|have no rights|not enough rights/i.test(desc)) {
      return 'บอท Telegram ถูกเอาออกจากกลุ่มหรือไม่มีสิทธิ์ส่งข้อความ — เพิ่มบอทกลับเข้ากลุ่ม';
    }
    if (/blocked by the user/i.test(desc)) {
      return 'ผู้รับบล็อกบอท Telegram ไว้ — ให้ปลดบล็อกหรือเปลี่ยน Chat ID';
    }
    return 'Telegram ปฏิเสธข้อความ' + (desc ? ': ' + desc : (status ? ` (HTTP ${status})` : ''));
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
  // ── สำรองระหว่างกะ (ข้อ 4 รอบตรวจ 26 ก.ย. 2569) ─────────────────────────────
  // นับบิลที่ขาย "หลังสำรองสำเร็จครั้งล่าสุด" ครบ MIDSHIFT_BACKUP_EVERY_BILLS ใบ → คิวงานสำรอง 1 งาน
  // มีงานสำรองค้างอยู่แล้ว = ไม่คิวเพิ่ม (งานสำรองใช้ข้อมูลล่าสุดตอนส่งอยู่แล้ว)
  // ต้องเรียกในคิวงานบันทึก (ก่อน saveState ของบิล) — คืนงานที่เพิ่มไว้ให้ผู้เรียกถอนออกได้ถ้าบันทึกล้ม
  planMidShiftBackup() {
    if (!this.hasCloudSetupStarted()) return null;
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    if (this.state.cloudOutbox.some(it => it && it.needBackup)) return null;
    const since = Number(this.backupStatus && this.backupStatus.lastSuccessAt) || 0;
    const fresh = (Array.isArray(this.state.transactions) ? this.state.transactions : [])
      .filter(tx => tx && new Date(tx.date).getTime() > since).length;
    if (fresh < MIDSHIFT_BACKUP_EVERY_BILLS) return null;
    const job = {
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys: [], monthKeys: [],
      needSummary: false, needTelegram: false, needBackup: true,
      quiet: true,          // งานเบื้องหลัง — สำเร็จแล้วไม่ต้องขึ้นข้อความ
      reason: 'midshift',
      tries: 0
    };
    this.state.cloudOutbox.push(job);
    return job;
  }

  // ── สำรองหลัง "เงินของบิลที่ขายไปแล้วเปลี่ยน" (รอบตรวจ 5 ข้อ 1 · 2 ต.ค. 2569) ─────────────────
  // ยกเลิกบิล / แก้บิล / บันทึกเงินส่วนต่าง — ข้อมูลพวกนี้อยู่ในเครื่องที่เดียว (ประวัติยกเลิก/แก้/คืนเงิน)
  // เดิมไม่มีอะไรสั่งสำรอง: เครื่องพังก่อนรอบสำรองถัดไป → กู้ไฟล์ล่าสุด → บิลที่คืนเงินไปแล้วกลับมาเป็นยอดขาย
  // รอรวมรอบ CHANGE_BACKUP_DELAY_MS (แก้หลายใบติดกัน = ไฟล์เดียว) · มีงานสำรองค้างอยู่แล้ว = บวกรุ่นให้ส่งรอบใหม่
  // ต้องเรียกในคิวงานบันทึก ก่อน saveState ของงานนั้น (ผู้เรียกคืน cloudOutbox เดิมเองถ้าบันทึกล้ม)
  planChangeBackup(kind) {
    if (!this.hasCloudSetupStarted()) return null;
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    const now = Date.now();
    const pending = this.state.cloudOutbox.find(it => it && it.needBackup);
    if (pending) {
      // งานที่กำลังอัปโหลดอยู่จะไม่ถูกนับว่าเสร็จ ถ้ารุ่นเปลี่ยนระหว่างนั้น (ดู _doFlushCloudOutbox)
      pending.backupRev = (Number(pending.backupRev) || 0) + 1;
      // งานสำรองของการเปลี่ยนแปลงที่ยังไม่ถึงเวลาส่ง → เลื่อนออกไปรวมรอบ (ยังไม่เคยล้ม = ไม่ใช่ backoff)
      const r = pending.retry && pending.retry.backup;
      if (pending.reason === 'change' && r && !(r.tries > 0)) r.nextAt = now + CHANGE_BACKUP_DELAY_MS;
      if (kind && Array.isArray(pending.changeKinds) && !pending.changeKinds.includes(kind)) pending.changeKinds.push(kind);
      this.scheduleCloudRetry();
      return pending;
    }
    const job = {
      id: `cob-${now}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: now,
      dateKeys: [], monthKeys: [],
      needSummary: false, needTelegram: false, needBackup: true,
      quiet: true,            // งานเบื้องหลัง — สำเร็จแล้วไม่ต้องขึ้นข้อความ
      reason: 'change',
      changeKinds: kind ? [kind] : [],
      backupRev: 0,
      // ยังไม่ใช่ความล้มเหลว (tries 0) — แค่ "ยังไม่ถึงเวลา" ตัวปลุกงานคลาวด์ใช้ nextAt นี้ปลุกเอง
      retry: { backup: { tries: 0, nextAt: now + CHANGE_BACKUP_DELAY_MS } },
      tries: 0
    };
    this.state.cloudOutbox.push(job);
    // ตั้งตัวปลุกไว้เลย — บางทาง (บันทึกเงินส่วนต่าง) ไม่ได้สั่งส่งงานคลาวด์ต่อท้าย งานจะรอจนมีเหตุการณ์อื่นมาปลุก
    this.scheduleCloudRetry();
    return job;
  }

  enqueueShiftCloseCloudOps(shiftLog) {
    // ใช้ "วันทำการ" — กะปกติ 10:00 → ตี 3 เปิด/ปิดเป็นวันทำการเดียวกัน จึงได้วันเดียว
    // ถ้ากะลากยาวข้ามวัน จะได้ทุกวันระหว่างนั้น ไม่ใช่แค่หัวกับท้าย (ดู businessPeriodKeysBetween)
    const openTs  = shiftLog.startTime || shiftLog.endTime;
    const closeTs = shiftLog.endTime;
    const { dateKeys, monthKeys } = this.businessPeriodKeysBetween(openTs, closeTs);
    // วันทำการที่ "กะนี้ถูกจัดเข้า" ต้องอยู่ในคิวเสมอ — กะที่เปิดหลังร้านปิด (03:00–06:00)
    // ถูกจัดเป็นวันใหม่ ซึ่งอาจไม่อยู่ในช่วงเวลาเปิด–ปิดที่คำนวณด้านบน
    const anchor = this.shiftAnchorTime(shiftLog);
    if (anchor) {
      const adk = this.getBusinessISODate(anchor), amk = this.getBusinessMonthKey(anchor);
      if (this.isValidDateKey(adk) && !dateKeys.includes(adk)) dateKeys.push(adk);
      if (this.isValidMonthKey(amk) && !monthKeys.includes(amk)) monthKeys.push(amk);
    }
    // กะที่ไม่มีเวลาเปิด/ปิดที่ใช้ได้เลย — ส่งสรุปไม่ได้ แต่ยังส่ง Telegram ได้
    // ถ้าร้านตั้ง URL/token ไว้เพียงบางส่วน (เช่นเพิ่งอัปเดต Apps Script แต่ยังไม่วาง token)
    // ต้องคิวสรุปไว้ก่อน มิฉะนั้นการปิดกะระหว่างนั้นจะหายจาก Sheets แบบถาวร
    const needSummary  = this.hasCloudSetupStarted() && (dateKeys.length > 0 || monthKeys.length > 0);
    const needTelegram = !!(this.telegramToken && this.telegramChatId);
    if (!Array.isArray(this.state.cloudOutbox)) this.state.cloudOutbox = [];
    // สำรองข้อมูลหลังปิดกะเป็น "งานในคิว" ที่ลองใหม่ได้ (ข้อ 14) — ใช้ข้อมูลล่าสุดตอนส่ง จึงมีค้างได้งานเดียวพอ
    const pendingBackup = this.state.cloudOutbox.find(it => it && it.needBackup);
    if (pendingBackup) {
      // มีงานสำรองค้างอยู่ (เช่นของการยกเลิกบิลที่รอรวมรอบ) — ปิดกะแล้วต้องส่งทันที ไม่รอรวมรอบ
      // (ปิดกะตีสามแล้วปิดแอป งานที่ตั้งเวลาไว้จะไม่ได้ส่งจนเปิดร้านพรุ่งนี้) · บวกรุ่นให้รวมการปิดกะนี้ด้วย
      pendingBackup.backupRev = (Number(pendingBackup.backupRev) || 0) + 1;
      const pr = pendingBackup.retry && pendingBackup.retry.backup;
      if (pr && !(pr.tries > 0)) pr.nextAt = Date.now();
    }
    const needBackup = this.hasCloudSetupStarted() && !pendingBackup;
    if (!needSummary && !needTelegram && !needBackup) return; // ไม่ได้ตั้งค่าอะไรเลย ไม่ต้องคิว
    this.state.cloudOutbox.push({
      id: `cob-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      dateKeys, monthKeys,
      needSummary, needTelegram, needBackup,
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
    if (!Array.isArray(this.state.cloudOutbox) || this.state.cloudOutbox.length === 0) { this.scheduleCloudRetry(); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // ออฟไลน์ — ไว้ค่อยส่ง (ตัวปลุก 'online' ทำงานต่อเอง)
    this._flushingOutbox = true;
    let delivered = 0;
    let attempted = false; // มีการลองยิงจริงไหม — ใช้ตัดสินว่าต้องเซฟตัวนับ backoff ลงเครื่องหรือเปล่า
    let anyOk = false;     // รวมงานเงียบ (สำรองระหว่างกะ) — ใช้ตัดสินการเซฟ ไม่ใช่การขึ้นข้อความ
    const gen = this._dataGeneration;   // ดูเหตุผลที่ _doSyncPendingTransactions
    const now = Date.now();
    // ⚠️ ข้อ 14: ตัวนับลองใหม่แยก "ต่อบริการ" — เดิมใช้ตัวนับเดียวทั้งงาน Telegram ที่ token ผิด
    // จึงหน่วงงานสรุป/ลบแถว/สำรองข้อมูลที่อยู่ในงานเดียวกันไปด้วย (และกลับกัน)
    const run = async (item, svc, fn) => {
      if (!this.cloudServiceReady(item, svc, now)) return false;
      attempted = true;
      let ok = false, errMsg = '';
      // ตัวส่งแต่ละบริการ "คืน false" เมื่อล้ม (ไม่ throw) แล้วฝากสาเหตุไว้ที่ _cloudFailReason (รอบตรวจ 5 ข้อ 3)
      // เดิมเก็บสาเหตุได้เฉพาะตอน throw — Telegram ตอบ "chat not found" / ชีตตอบรหัสไม่ตรง จึงไม่มีสาเหตุเหลือให้เห็น
      // (งานคลาวด์วิ่งทีละงานในคิวเดียว จึงฝากผ่านตัวแปรนี้ได้โดยไม่ปนกัน)
      this._cloudFailReason = '';
      try { ok = await fn(); } catch (e) { ok = false; errMsg = (e && e.message) || String(e); }
      if (!ok && !errMsg) errMsg = this._cloudFailReason || '';
      this._cloudFailReason = '';
      this.noteCloudServiceResult(item, svc, ok, errMsg);
      if (ok && !item.quiet) delivered++;
      if (ok) anyOk = true;
      return ok;
    };
    let restoreJobSent = false;   // รอบตรวจ 6 ข้อ 2 — ส่งงานสรุปหลังกู้ได้รอบละ 1 เดือน
    try {
      for (const item of this.state.cloudOutbox.slice()) {
        // ข้อมูลถูกแทนทั้งชุดระหว่างรอบนี้ — งานของชุดเก่าห้ามยิงต่อ (เช่นคำสั่งลบแถวบิลที่ชุดใหม่ยังใช้อยู่)
        if (gen !== this._dataGeneration) break;

        // รองรับทั้งรูปแบบใหม่ (dateKeys/monthKeys เป็น array) และรายการเก่าที่ค้างใน outbox (dateKey เดี่ยว)
        const dateKeys  = Array.isArray(item.dateKeys)  ? item.dateKeys  : (item.dateKey  ? [item.dateKey]  : []);
        const monthKeys = Array.isArray(item.monthKeys) ? item.monthKeys : (item.monthKey ? [item.monthKey] : []);

        // 0) ลบแถวบิลที่ void ในชีต (ทำก่อนรีเฟรชสรุป) — idempotent: ไม่พบแถว = ถือว่าลบแล้ว
        if (item.needVoidDelete && this.hasCloudSyncConfig()) {
          if (await run(item, 'voidDelete', () => this.postVoidDelete(item.voidDelete))) item.needVoidDelete = false;
        }

        // 1) สรุปวัน + เดือน — recompute จาก state ปัจจุบัน (ครบ + idempotent: GAS เขียนทับชีต)
        // รอบตรวจ 6 ข้อ 2: งานสรุปหลังกู้ข้อมูล (reason 'restore' — งานละ 1 เดือน) ส่งได้รอบละ 1 งาน
        // เดือนที่เหลือรอรอบถัดไป (ตัวปลุกงานคลาวด์มาเองในไม่ถึงนาที และส่งบิลที่ค้างก่อนทุกครั้ง)
        // บิลที่ขายระหว่างนี้จึงรอแค่สรุปของเดือนเดียว ไม่ใช่ทุกวันตั้งแต่เปิดร้าน
        const deferRestoreJob = item.reason === 'restore' && restoreJobSent &&
          this.cloudServiceReady(item, 'summary', now);
        if (item.needSummary && this.hasCloudSyncConfig() && !(item.needVoidDelete && this.hasCloudSyncConfig()) && !deferRestoreJob) {
          if (item.reason === 'restore' && this.cloudServiceReady(item, 'summary', now)) restoreJobSent = true;
          const revAtSend = item.rev || 0;   // จำรุ่นก่อนส่ง (ดู enqueueSummaryRefresh)
          await run(item, 'summary', async () => {
            let allOk = true;
            for (const dk of dateKeys) {
              const dayTxs = this.state.transactions.filter(tx => this.getBusinessISODate(tx.date) === dk);
              // รวมกะปิดแล้ว + กะที่ยังเปิดอยู่ — กันสรุปที่ refresh หลัง void/แก้บิลกลางกะขาดยอดค่าใช้จ่าย
              const dayExp = this.getExpensesForDate(dk);
              if (!await this.syncDailySummary(dk, dayTxs, dayExp, true)) allOk = false;
            }
            for (const mk of monthKeys) {
              if (!await this.syncMonthlySummary(mk, true)) allOk = false;
            }
            // เคลียร์ได้เฉพาะเมื่อ "ข้อมูลไม่ถูกแก้ระหว่างที่กำลังส่ง"
            // ถ้ารุ่นเปลี่ยนระหว่าง await แปลว่ามีการแก้บิลของงวดนี้ ต้องเหลืองานไว้ส่งรุ่นใหม่
            if (allOk && (item.rev || 0) === revAtSend) { item.needSummary = false; return true; }
            if (allOk) console.warn('[Outbox] ข้อมูลถูกแก้ระหว่างส่งสรุป — คงงานไว้ส่งรุ่นใหม่', dateKeys);
            return allOk;
          });
        }

        // 2) Telegram — ส่งข้อความที่ snapshot ไว้ตอนปิดกะ (ไม่ขึ้นกับการตั้งค่า Google Sheets)
        if (item.needTelegram) {
          if (await run(item, 'telegram', () => this.postTelegram(item.telegramMessage))) item.needTelegram = false;
        }

        // 3) สำรองข้อมูลขึ้น Drive (หลังปิดกะ) — ใช้ข้อมูล "ล่าสุด" ตอนส่ง จึงมีงานสำรองค้างได้ทีละงานเดียวพอ
        //    ⚠️ เดิมลองครั้งเดียวตอนปิดกะ ล้มแล้วไม่มีงานค้างให้ลองใหม่ = คืนนั้นไม่มีไฟล์สำรองโดยไม่มีใครรู้
        if (item.needBackup && this.hasCloudSyncConfig()) {
          // ข้อมูลเปลี่ยนระหว่างกำลังอัปโหลด (ยกเลิก/แก้บิลตอนไฟล์กำลังขึ้น) = ไฟล์ที่เพิ่งขึ้นไม่มีการเปลี่ยนแปลงนั้น
          // → เก็บงานไว้ส่งอีกรอบ (backupRev ถูกบวกโดย planChangeBackup) ไม่งั้นไฟล์ล่าสุดตกหล่นเงียบ ๆ (รอบตรวจ 5 ข้อ 1)
          const backupRevAtSend = Number(item.backupRev) || 0;
          if (await run(item, 'backup', () => this.autoBackupToGoogleDrive({ silent: true }))) {
            if ((Number(item.backupRev) || 0) === backupRevAtSend) item.needBackup = false;
          }
        }
      }

      // เก็บเฉพาะรายการที่ยังค้าง ที่เสร็จแล้วทิ้งออก — ทำ "ในคิวงานบันทึก"
      // ไม่งั้นอาจไปตัด outbox ระหว่างที่งานขาย/ยกเลิกกำลังรอเซฟอยู่ แล้วงานนั้นคืนค่าทับผลของเรา
      // ต้องเซฟเมื่อ "มีการลองยิง" ด้วย ไม่ใช่เฉพาะตอนมีงานสำเร็จ
      // เดิมถ้าล้มเหลวหมด (เช่นกรอก URL ผิด) ตัวนับ tries/lastTry จะอยู่แค่ในหน่วยความจำ
      // ปิดแอปแล้วหาย เปิดใหม่ก็ยิงรัวตั้งแต่ต้นทุกครั้ง ระบบเว้นระยะเลยไม่เคยได้ทำงานจริง
      await this.withMutation('บันทึกผลงานคลาวด์', async () => {
        if (gen !== this._dataGeneration) return;   // ชุดข้อมูลเปลี่ยนแล้ว — ผลของรอบนี้ไม่เกี่ยวกับชุดใหม่
        const before = this.state.cloudOutbox.length;
        this.state.cloudOutbox = this.state.cloudOutbox.filter(it => it.needVoidDelete || it.needSummary || it.needTelegram || it.needBackup);
        if (attempted || anyOk || this.state.cloudOutbox.length !== before) await this.saveState();
      });
      if (delivered > 0) this.showToast(`ส่งสรุป/แจ้งเตือนที่ค้างไว้สำเร็จแล้ว (${delivered} รายการ)`, 'success');
    } finally {
      this._flushingOutbox = false;
      this.scheduleCloudRetry();
      try { this.renderExpiredCloudJobs(); } catch (e) { /* หน้าจอไม่พร้อม — ไม่กระทบงานส่ง */ }
    }
  }

  // ── ตัวนับลองใหม่ต่อบริการ (ข้อ 14) ─────────────────────────────────────────
  // เว้นระยะ: ลองครั้งแรกทันที → 30 วิ → 1 → 2 → 5 → 10 → 30 นาที (สูงสุด) — ปลุกเองด้วย scheduleCloudRetry
  cloudRetryDelayMs(tries) {
    const steps = [0, 30e3, 60e3, 120e3, 300e3, 600e3, 1800e3];
    return steps[Math.min(Math.max(0, tries | 0), steps.length - 1)];
  }

  cloudServiceReady(item, svc, now) {
    // ข้อ 19: เครื่องที่ไม่ใช่เครื่องหลัก — งานสรุป/สำรองพักไว้ในคิว (ไม่ยิงซ้ำให้ถูกปฏิเสธเปล่า ๆ)
    if ((svc === 'summary' || svc === 'backup') && this.isPrimaryBlocked()) return false;
    if (this.isCloudJobExpired(item, svc, now)) return false;   // ข้อ 16: ล้มนานเกิน 7 วัน — รอเจ้าของตัดสิน
    const r = item && item.retry && item.retry[svc];
    if (r && r.nextAt) return (now || Date.now()) >= r.nextAt;
    // งานรุ่นเก่า (ไม่มีตัวนับต่อบริการ) — ใช้กติกาเดิม: ล้มครบ 3 ครั้งแล้วเว้น 5 นาที
    if (!r && (item.tries || 0) >= 3 && item.lastTry && ((now || Date.now()) - item.lastTry) < 5 * 60 * 1000) return false;
    return true;
  }

  // ── ข้อ 16: งานที่ล้มเหลวติดต่อกันนานเกิน CLOUD_JOB_MAX_FAIL_DAYS วัน ─────────────
  // เดิมยิงซ้ำทุก 30 นาทีตลอดไป (เช่น Telegram token ผิด/ถูกลบ) และป้าย "งานคลาวด์ค้าง" ไม่มีวันหาย
  // ตอนนี้หยุดยิงเอง แล้วโชว์ในหน้าตั้งค่าให้เจ้าของกด "ลองใหม่" หรือ "ทิ้งงานนี้" — ห้ามลบเงียบ
  isCloudJobExpired(item, svc, now) {
    const r = item && item.retry && item.retry[svc];
    if (!r || !(r.tries > 0)) return false;   // ยังไม่เคยล้ม = ยังไม่หมดอายุ (เช่นพักเพราะไม่ใช่เครื่องหลัก)
    // นับจาก "ครั้งแรกที่ล้ม" เท่านั้น — ไม่ใช้เวลาสร้างงาน เพราะงานที่ถูกพักไว้นาน (เช่นไม่ใช่เครื่องหลัก)
    // แล้วเพิ่งล้มครั้งแรก ต้องได้ลองครบ 7 วันเหมือนกัน · งานรุ่นก่อนไม่มีค่านี้ = เริ่มนับตอนล้มครั้งถัดไป
    const since = Number(r.firstFailAt) || 0;
    if (!since) return false;
    return ((now || Date.now()) - since) > CLOUD_JOB_MAX_FAIL_DAYS * 86400000;
  }

  expiredCloudJobs() {
    const FLAGS = { voidDelete: 'needVoidDelete', summary: 'needSummary', telegram: 'needTelegram', backup: 'needBackup' };
    const now = Date.now();
    const out = [];
    (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : []).forEach(it => {
      if (!it) return;
      const svcs = Object.keys(FLAGS).filter(svc => it[FLAGS[svc]] && this.isCloudJobExpired(it, svc, now));
      if (svcs.length) out.push({ item: it, svcs });
    });
    return out;
  }

  renderExpiredCloudJobs() {
    const box = typeof document !== 'undefined' && document.getElementById ? document.getElementById('cloud-expired-jobs-box') : null;
    if (!box) return;
    const list = this.expiredCloudJobs();
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    const NAME = { voidDelete: 'ลบแถวบิลที่ยกเลิกบนชีต', summary: 'สรุปวัน/เดือนบนชีต', telegram: 'ข้อความ Telegram', backup: 'ไฟล์สำรองขึ้น Drive' };
    const owner = this.currentRole === 'owner';
    const rows = list.slice(0, 30).map(({ item, svcs }) => {
      const errs = svcs.map(svc => (item.retry[svc] && item.retry[svc].lastError) || '').filter(Boolean);
      const when = Number(item.createdAt) > 0 ? new Date(Number(item.createdAt)).toLocaleString('th-TH') : '-';
      const btns = owner
        ? `<button class="btn-small secondary" onclick="app.retryExpiredCloudJob('${safeId(item.id)}')">ลองใหม่</button> ` +
          `<button class="btn-small secondary" onclick="app.discardExpiredCloudJob('${safeId(item.id)}')">ทิ้งงานนี้</button>`
        : '';
      return `<div style="border-top:1px solid var(--border-color);padding:8px 0;">
        <div style="font-size:0.8rem;"><b>${escapeHtml(svcs.map(s => NAME[s] || s).join(' · '))}</b> · สร้างเมื่อ ${escapeHtml(when)}</div>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin:2px 0 6px;">${escapeHtml(errs.join(' / ') || 'ส่งไม่สำเร็จติดต่อกันเกิน ' + CLOUD_JOB_MAX_FAIL_DAYS + ' วัน')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${btns}</div></div>`;
    }).join('');
    box.innerHTML = `<p style="font-size:0.82rem;margin:0 0 6px;"><b>งานคลาวด์ที่หยุดส่งแล้ว ${list.length} งาน</b> — ส่งไม่สำเร็จติดต่อกันเกิน ${CLOUD_JOB_MAX_FAIL_DAYS} วัน ` +
      `ระบบหยุดลองเอง ตรวจการตั้งค่า (เช่น Telegram / Apps Script) แล้วกด "ลองใหม่" หรือ "ทิ้งงานนี้"${owner ? '' : ' (เข้าสู่ระบบด้วยบัญชีเจ้าของเพื่อจัดการ)'}</p>${rows}`;
  }

  async retryExpiredCloudJob(jobId) {
    if (!this.requireOwnerForDataAction('ลองส่งงานคลาวด์ใหม่')) return;
    const ok = await this.withMutation('ลองส่งงานคลาวด์ใหม่', async () => {
      const it = (this.state.cloudOutbox || []).find(x => x && x.id === jobId);
      if (!it) return false;
      const prev = this.cloneForRollback(it.retry || {});
      const prevTries = it.tries, prevLast = it.lastTry;
      it.retry = {};   // เริ่มนับใหม่ทุกบริการของงานนี้ (ถ้าล้มอีกจะเริ่มนับ 7 วันใหม่)
      it.tries = 0; delete it.lastTry;
      if (!await this.persistOrRollback('ลองส่งงานคลาวด์ใหม่', () => { it.retry = prev; it.tries = prevTries; it.lastTry = prevLast; })) return false;
      return true;
    });
    this.renderExpiredCloudJobs();
    if (!ok) return;
    this.showToast('ลองส่งงานนี้ใหม่แล้ว — ถ้ายังไม่สำเร็จ ระบบจะลองซ้ำเป็นระยะอีกครั้ง', 'info', 5000);
    this.flushCloudOutbox();
  }

  async discardExpiredCloudJob(jobId) {
    if (!this.requireOwnerForDataAction('ทิ้งงานคลาวด์ที่ค้าง')) return;
    const found = this.expiredCloudJobs().find(x => x.item.id === jobId);
    if (!found) { this.renderExpiredCloudJobs(); return; }
    const sure = await this.askConfirm('ทิ้งงานคลาวด์นี้ถาวร? ระบบจะไม่ส่งงานนี้อีก — ถ้าเป็นสรุป/ไฟล์สำรอง ครั้งถัดไปที่ส่งสำเร็จจะใช้ข้อมูลล่าสุดแทน · ถ้าเป็นคำสั่งลบแถวบิลที่ยกเลิก ต้องไปลบแถวนั้นบนชีตเอง');
    if (!sure) return;
    const FLAGS = { voidDelete: 'needVoidDelete', summary: 'needSummary', telegram: 'needTelegram', backup: 'needBackup' };
    await this.withMutation('ทิ้งงานคลาวด์ที่ค้าง', async () => {
      const it = (this.state.cloudOutbox || []).find(x => x && x.id === jobId);
      if (!it) return;
      const prevOutbox = this.cloneForRollback(this.state.cloudOutbox);
      // ทิ้งเฉพาะบริการที่หมดอายุ — บริการอื่นในงานเดียวกันที่ยังส่งได้ ปล่อยไว้ตามเดิม
      found.svcs.forEach(svc => { it[FLAGS[svc]] = false; });
      this.state.cloudOutbox = this.state.cloudOutbox.filter(x => x.needVoidDelete || x.needSummary || x.needTelegram || x.needBackup);
      if (await this.persistOrRollback('ทิ้งงานคลาวด์ที่ค้าง', () => { this.state.cloudOutbox = prevOutbox; })) {
        console.warn('[Outbox] เจ้าของทิ้งงานคลาวด์ที่หมดอายุ', jobId, found.svcs);
        this.showToast('ทิ้งงานนี้แล้ว', 'info');
      }
    });
    this.renderExpiredCloudJobs();
    this.checkSyncStatus();
  }

  noteCloudServiceResult(item, svc, ok, errMsg) {
    if (!item.retry || typeof item.retry !== 'object') item.retry = {};
    if (ok) delete item.retry[svc];
    else {
      const r = item.retry[svc] || { tries: 0 };
      r.tries = (r.tries || 0) + 1;
      r.lastTry = Date.now();
      if (!r.firstFailAt) r.firstFailAt = r.lastTry;   // ข้อ 16: เริ่มนับอายุงานที่ล้มเหลว
      r.nextAt = r.lastTry + this.cloudRetryDelayMs(r.tries);
      if (errMsg) r.lastError = String(errMsg).slice(0, 200);
      item.retry[svc] = r;
    }
    // ตัวนับรวมรุ่นเดิม (หน้าจอเตือน "งานคลาวด์ค้าง") = ตัวที่ล้มบ่อยที่สุดในงานนี้
    const all = Object.values(item.retry).map(x => x.tries || 0);
    item.tries = all.length ? Math.max(...all) : 0;
    item.lastTry = Date.now();
  }

  // เว้นระยะลองส่งบิลใหม่ตามจำนวนรอบที่ "ไม่ผ่านเลยสักใบ" ติดกัน (รอบตรวจ 5 ข้อ 2)
  // รอบแรกที่ล้มยังลองใหม่ใน 1 นาทีเท่าเดิม (เน็ตสะดุดสั้น ๆ ต้องตามทันเร็ว) · ขายบิลใหม่/เน็ตกลับ/เปิดแอป ยังส่งทันทีเหมือนเดิม
  billRetryDelayMs() {
    const n = Math.max(0, (Number(this._billRetryStreak) || 0) - 1);
    return BILL_RETRY_STEPS_MS[Math.min(n, BILL_RETRY_STEPS_MS.length - 1)];
  }

  // สาเหตุล่าสุดของงานคลาวด์ที่ส่งไม่ผ่าน (รอบตรวจ 5 ข้อ 3) — ใช้บอกเจ้าของในหน้าตั้งค่า ไม่ต้องรอครบ 7 วัน
  // คืน { label, message, at } ของรายการที่ล้มล่าสุด · ไม่มี = null
  latestCloudJobError() {
    const NAME = { voidDelete: 'ลบแถวบิลที่ยกเลิกบนชีต', summary: 'สรุปวัน/เดือนบนชีต', telegram: 'ข้อความ Telegram', backup: 'ไฟล์สำรองขึ้น Drive' };
    let best = null;
    (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : []).forEach(it => {
      if (!it || !it.retry || typeof it.retry !== 'object') return;
      Object.keys(it.retry).forEach(svc => {
        const r = it.retry[svc];
        if (!r || !r.lastError || !(r.tries > 0)) return;
        const at = Number(r.lastTry) || 0;
        if (!best || at > best.at) best = { label: NAME[svc] || svc, message: String(r.lastError), at };
      });
    });
    return best;
  }

  // ── ตัวปลุกงานคลาวด์ที่ค้าง (ข้อ 14): เดิมพอครบเวลาเว้นระยะแล้วไม่มีอะไรปลุก ────────────
  // งานจะค้างจนกว่าจะมีเหตุการณ์อื่น (เปิดแอป/เน็ตกลับ/ขายบิลใหม่) — ปิดกะตอนตีสามแล้วเน็ตหลุด
  // ไฟล์สำรองและสรุปของคืนนั้นจะไม่ถูกส่งจนเปิดร้านวันรุ่งขึ้น
  // ตอนนี้: หลังทุกรอบส่ง ตั้งเวลาปลุกตามงานที่ถึงคิวเร็วที่สุด (ทำงานเฉพาะตอนแอปเปิดอยู่)
  scheduleCloudRetry() {
    if (this._cloudRetryTimer) { clearTimeout(this._cloudRetryTimer); this._cloudRetryTimer = null; }
    if (this.loadFailed || this.isReadOnlyWindow) return;
    const now = Date.now();
    let next = Infinity;
    (Array.isArray(this.state.cloudOutbox) ? this.state.cloudOutbox : []).forEach(it => {
      ['voidDelete', 'summary', 'telegram', 'backup'].forEach(svc => {
        const flag = { voidDelete: 'needVoidDelete', summary: 'needSummary', telegram: 'needTelegram', backup: 'needBackup' }[svc];
        if (!it || !it[flag]) return;
        if ((svc === 'summary' || svc === 'backup') && this.isPrimaryBlocked()) return;   // พักไว้ — ไม่ต้องปลุก
        // ยังตั้งค่าไม่ครบ = ส่งไม่ได้อยู่แล้ว ไม่ต้องปลุก (กันตัวปลุกวนทุกวินาทีกับงานที่ถึงเวลาแล้วแต่ส่งไม่ได้)
        // ตั้งค่าเสร็จเมื่อไหร่ การบันทึกตั้งค่า/เปิดแอป/เน็ตกลับ จะสั่งส่งเอง
        if (svc === 'telegram' ? !(this.telegramToken && this.telegramChatId) : !this.hasCloudSyncConfig()) return;
        if (this.isCloudJobExpired(it, svc, now)) return;   // ข้อ 16: หยุดแล้ว รอเจ้าของ — ไม่ต้องปลุก
        const r = it.retry && it.retry[svc];
        const at = r && r.nextAt ? r.nextAt : ((it.tries || 0) >= 3 && it.lastTry ? it.lastTry + 5 * 60 * 1000 : now + 30e3);
        next = Math.min(next, at);
      });
    });
    // บิลที่ส่งไม่สำเร็จ (ไม่ใช่รอตรวจ) — ลองใหม่ขณะแอปเปิดอยู่
    // รอบตรวจ 5 ข้อ 2: ส่งไม่ผ่านทั้งรอบติดกัน = เว้นห่างขึ้น 1 → 2 → 5 → 10 → 30 นาที (เดิมทุก 1 นาทีตายตัว)
    if ((Array.isArray(this.state.transactions) ? this.state.transactions : []).some(tx => this.isBillAwaitingSync(tx)) &&
        this.hasCloudSyncConfig()) next = Math.min(next, now + this.billRetryDelayMs());
    if (!isFinite(next)) return;
    const delay = Math.min(Math.max(next - now, 1000), 30 * 60 * 1000);
    this._cloudRetryTimer = setTimeout(() => { this._cloudRetryTimer = null; this.resumePendingCloudWork(); }, delay);
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
      `💵 เงิน: ${v.moneyOutcome === 'refunded' ? 'คืนให้ลูกค้าแล้ว'
        : v.moneyOutcome === 'none' ? 'ไม่มีเงินเคลื่อนไหว'
        : 'ยังไม่ระบุ (ยกเลิกตามสถานะบนชีต)'}` +
      `${Number(v.cashEffect) ? ` · ลิ้นชักกะนี้ ${Number(v.cashEffect) < 0 ? '-' : '+'}฿${Math.abs(Number(v.cashEffect)).toLocaleString('th-TH')}` : ''}\n` +
      `🕒 เวลา: ${when}\n` +
      `━━━━━━━━━━━━━━━━`;
  }

  // หมายเหตุ: sendVoidAlert() ถูกลบออกในเวอร์ชัน 1.5.2 — ไม่มีที่ไหนเรียกแล้ว
  // การแจ้งเตือน void เดินผ่าน cloudOutbox (enqueueVoidCloudOps) เช่นเดียวกับรายงานปิดกะ

  // ส่งคำขอลบแถวบิลใน Sheets แล้วคืน true/false — idempotent: "ไม่พบแถว" = ถือว่าลบแล้ว
  async postVoidDelete(v) {
    if (!this.hasCloudSyncConfig()) { this._cloudFailReason = this.getCloudSetupMessage(); return false; }
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
      // โครงตารางเพี้ยน / เลขที่บิลซ้ำหลายแถว: ปลายทาง "ไม่ลบแถวใด" จนกว่าคนจะแก้ชีต (ทะเบียนยกเลิกบันทึกแล้ว)
      // เก็บงานไว้ลองใหม่ แต่ต้องบอกเจ้าของ (ครั้งเดียวต่อรอบเปิดแอป) ไม่งั้นจะวนเงียบ ๆ
      if (d && (d.code === 'SCHEMA_MISMATCH' || d.code === 'DUPLICATE_BILL_ID')) {
        const key = d.code + ':' + (v && v.id);
        if (!this._voidWarned) this._voidWarned = new Set();
        if (!this._voidWarned.has(key)) {
          this._voidWarned.add(key);
          this.showToast(`ลบบิล ${String((v && v.id) || '').slice(0, 24)} บนชีตไม่ได้: ${this.explainCloudError(d.message)} — ` +
            'แก้ในชีตแล้วระบบจะลองใหม่เอง', 'warning', 12000);
        }
        this._cloudFailReason = this.explainCloudError(d.message) || d.code;
        return false;
      }
      const gone = !!d && (d.code === 'NOT_FOUND' ||
        (d.status === 'error' && /^ไม่พบ(บิลเลขที่|แผ่นงาน)/.test(String(d.message || ''))));
      if (d && (d.status === 'success' || gone)) return true;
      // error อื่น (เช่น รหัสเชื่อมต่อไม่ตรง) → retry รอบหน้า · เก็บสาเหตุไว้ให้เห็น (รอบตรวจ 5 ข้อ 3)
      this._cloudFailReason = this.explainCloudError(d && d.message) || 'ชีตตอบกลับมาไม่ถูกต้อง';
      return false;
    } catch (err) {
      console.error('Void delete failed:', err);
      this._cloudFailReason = this.explainCloudError(err);
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
    // รอบตรวจ 5 ข้อ 1: ไฟล์สำรองต้องรู้ว่าบิลนี้ถูกยกเลิกแล้ว (ประวัติยกเลิก/เงินคืนมีอยู่ในเครื่องที่เดียว)
    if (cloudSetupStarted) this.planChangeBackup('void');
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
