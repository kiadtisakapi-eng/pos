/**
 * Erotica Barber & Massage POS - Google Sheets Sync API v2
 *
 * วิธีติดตั้ง:
 * 1. Extensions > Apps Script > วางโค้ดทั้งหมด > Save
 * 2. เลือกฟังก์ชัน setupPosApiToken > Run 1 ครั้ง > อนุญาตสิทธิ์ > คัดลอกรหัสจาก Execution log
 * 3. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. คัดลอก Web App URL + รหัสจากข้อ 2 ไปใส่ในหน้าตั้งค่า POS ทุกเครื่อง
 * 5. ⚠️ สำคัญ: Project Settings (ไอคอนเฟือง) > Time zone ต้องตั้งเป็น "(GMT+07:00) Bangkok"
 *    — แอปส่ง monthKey จากเวลาหน้าร้านมาให้แล้ว (บิลลงแท็บถูกเดือนแม้ timezone ผิด)
 *    แต่ timestamp "สร้างเมื่อ" ในชีตสรุป และการลบแท็บรายวันเก่า ยังอิง timezone ของโปรเจกต์นี้
 *
 * ─────────────────────────────────────────────
 * ⚠️ อัปเกรดจากเวอร์ชันที่ยังใช้ API_SECRET ฝังในไฟล์ — อ่านก่อนทำ
 * ─────────────────────────────────────────────
 * เวอร์ชันนี้เปลี่ยนวิธียืนยันตัวตนทั้งสองฝั่งพร้อมกัน จึงมีช่วงที่ซิงก์หยุดชั่วคราวแน่นอน
 * ทำตามลำดับนี้ ห้ามสลับ:
 *
 *   1) วางโค้ดนี้ทับใน Apps Script > Save
 *   2) Run setupPosApiToken() > คัดลอกรหัสจาก Execution log เก็บไว้
 *   3) Deploy > Manage deployments > แก้ deployment "เดิม" ให้ชี้เวอร์ชันใหม่
 *      ⚠️ ต้องทับตัวเดิม ไม่ใช่สร้าง URL ใหม่ทิ้งของเก่าไว้ —
 *      รหัสเก่า (ที่เคยฝังใน app.js) ถูก push ขึ้น GitHub ไปแล้วและลบออกจากประวัติไม่ได้
 *      ถ้าปล่อย deployment เก่าไว้ ใครที่เคยเห็นไฟล์ก็ยังยิงเข้าชีตได้เหมือนเดิม
 *   4) push frontend (app.js/index.html) ขึ้น GitHub Pages
 *   5) เปิด POS ทุกเครื่อง > ตั้งค่า > Google Sheets > วางรหัสจากข้อ 2
 *
 * ระหว่างข้อ 1-5 ขายต่อได้ตามปกติ ไม่มีอะไรหาย:
 *   บิลค้างเป็น syncStatus = pending และสรุปปิดกะค้างใน cloudOutbox
 *   ทั้งสองอย่าง retry เองอัตโนมัติทันทีที่วางรหัสเสร็จ
 *
 * ก่อนเริ่ม: เปิดแท็บ "สรุปรายเดือน" เช็คว่าหัวคอลัมน์ไม่เคยถูกแก้ด้วยมือ
 * เวอร์ชันนี้ fail-closed — หัวคอลัมน์ขาด/ซ้ำ/มีช่องว่างเกิน จะหยุดเขียนทั้งงานแทนการเดาช่อง
 *
 * ─────────────────────────────────────────────
 * ลำดับอัปเดตปกติ (ตั้งแต่ ต.ค. 2569): วางโค้ดนี้ใน Apps Script ก่อน → แล้วค่อย deploy.bat → อัปเดต iPad (ทำหลังปิดกะ)
 *   โค้ดรุ่นใหม่ต้องรับคำขอของแอปรุ่นเก่าได้เสมอ (คำสั่ง/ข้อความเดิมไม่เปลี่ยน)
 *   หัวข้อรุ่น 1.7 ข้างล่างเป็น "ประวัติ" ของการอัปเกรดครั้งนั้นเท่านั้น — ไม่ใช่ลำดับของรอบปัจจุบัน
 * ─────────────────────────────────────────────
 * (ประวัติ) อัปเกรดเป็นรุ่น 1.7 (ก.ย. 2569) — ครั้งนั้นทำหลังอัปเดตหน้าเว็บ (app.js/index.html) แล้ว
 * ─────────────────────────────────────────────
 *   1) วางโค้ดนี้ทับ > Save > Deploy > Manage deployments > แก้ deployment เดิมให้ชี้เวอร์ชันใหม่
 *      (ห้ามสร้าง URL ใหม่ · ห้ามรัน rotatePosApiToken — รหัสเชื่อมต่อเดิมใช้ต่อได้)
 *   2) Run setupPosOwnerKey() 1 ครั้ง > จดรหัสเจ้าของจาก Execution log เก็บไว้กับเจ้าของร้าน
 *      (ใช้ตอนกู้ข้อมูลจาก Drive / ตรวจความตรงกันกับชีต / ย้ายเครื่องหลัก — ไม่ต้องใส่ไว้ในเครื่องไหน)
 *   3) ทะเบียนบิลที่ยกเลิกย้ายเป็นแบบต่อบิลให้เองตอนมีคำขอแรก (ไม่ต้องรันอะไร)
 *   4) เครื่องหลัก: เครื่องแรกที่ส่งสรุป/สำรองหลังอัปเกรดจะเป็นเครื่องหลัก — ร้านที่มีหลายเครื่อง
 *      ให้เปิดหน้าตั้งค่าของเครื่องที่ใช้ปิดกะประจำ แล้วกด "ตั้งเครื่องนี้เป็นเครื่องหลัก"
 * ย้อนกลับรุ่นเดิม: รัน exportVoidRegistryForRollback() ก่อน แล้วค่อยชี้ deployment กลับไปเวอร์ชันเก่า
 *   (รุ่นเก่าอ่านทะเบียนยกเลิกแบบเดิมเท่านั้น — ถ้าไม่ export กลับ บิลที่ยกเลิกหลังอัปเกรดจะกลับมาได้)
 *
 * Sheet structure:
 *   "สรุปรายเดือน"  — master monthly summary (sheet แรก)
 *   "MM-yyyy"       — transaction detail รายเดือน
 *   "สรุป-MM-yyyy"  — monthly summary snapshot
 *   "สรุป-YYYY-MM-DD" — daily summary (สร้างเมื่อปิดกะ)
 */

// ─────────────────────────────────────────────
//  รหัสเชื่อมต่อ API เก็บใน Script Properties เท่านั้น
//  ห้ามใส่รหัสลงไฟล์นี้หรือ app.js เพราะไฟล์อาจถูก commit ขึ้น GitHub ได้
//  หลังวางโค้ด ให้รัน setupPosApiToken() 1 ครั้ง แล้วนำรหัสไปใส่ในหน้า ตั้งค่า → Google Sheets ของ POS
// ─────────────────────────────────────────────
var POS_API_TOKEN_PROPERTY = "POS_API_TOKEN";
var POS_BACKUP_FOLDER_ID_PROPERTY = "POS_BACKUP_FOLDER_ID";

// ──────────────────────────────
//  จำนวนวันที่เก็บแท็บ "สรุปรายวัน" (สรุป-YYYY-MM-DD) ไว้บน Sheets
//  แท็บที่เก่ากว่านี้จะถูกลบอัตโนมัติตอนปิดร้าน เพื่อไม่ให้จำนวนแท็บบวมจนไฟล์อืด
//  ข้อมูลถาวรยังอยู่ครบใน: แท็บรายการรายเดือน "MM-yyyy" + แท็บสรุปเดือน "สรุป-MM-yyyy" + แท็บ "สรุปรายเดือน"
//  ตั้งเป็น 0 เพื่อปิดการลบอัตโนมัติ (เก็บแท็บรายวันทุกวันถาวร)
// ──────────────────────────────
var DAILY_SHEET_RETENTION_DAYS = 62;

// ──────────────────────────────
//  จำนวนวันที่เก็บไฟล์สำรอง (pos_backup_*.json) ใน Google Drive
//  ระบบสร้างไฟล์ใหม่ทุกครั้งที่ปิดกะ — ถ้าไม่ลบเก่า ไฟล์จะสะสมไม่จำกัด
//
//  ⚠️ อย่าตั้งเป็น 0 (ไม่ลบเลย) แม้จะดูปลอดภัยกว่า เพราะไฟล์สำรองแต่ละไฟล์
//  เก็บบิล "ทั้งหมดตั้งแต่เปิดร้าน" ไม่ใช่เฉพาะกะนั้น ไฟล์เดือน 12 จึงใหญ่กว่าไฟล์เดือน 1 หลายเท่า
//  พื้นที่ที่ใช้จึงโตแบบกำลังสอง ไม่ใช่เชิงเส้น — ปิดกะวันละ 2 ครั้ง = ปีละ ~730 ไฟล์
//  พอ Drive เต็ม การสำรองจะล้มเหลวเงียบ ๆ ซึ่งอันตรายกว่าการไม่มีไฟล์เก่าให้ย้อนดู
//  90 วันครอบคลุมการกู้ข้อมูลจริงทุกกรณีที่เคยเจอ (ปกติกู้จากไฟล์ล่าสุดหรือไม่กี่วันก่อน)
//
//  หมายเหตุ: handleListBackups ส่ง metadata ครั้งละ 200 ไฟล์ กดโหลดไฟล์เก่าเพิ่มได้จนถึงไฟล์สุดท้าย
//  จำนวนไฟล์ต่อวันขึ้นกับการขาย/แก้บิล จึงแบ่งหน้าแทนการตัดจำนวนไฟล์ที่กู้ได้
//  ไม่อ่านเนื้อไฟล์ในคำสั่งแสดงรายชื่อ และไม่เปลี่ยนนโยบายลบไฟล์เก่า
// ──────────────────────────────
var BACKUP_RETENTION_DAYS = 90;

// ชื่อโฟลเดอร์และคำนำหน้าไฟล์สำรองใน Google Drive
// ใช้ร่วมกันทั้งตอนสำรอง (handleBackup) และตอนกู้คืน (handleListBackups / handleGetBackup)
// แก้ที่เดียวพอ — เดิม hard-code ในฟังก์ชันเดียว พอมีหลายที่จะหลุดง่าย
var BACKUP_FOLDER_NAME = "Erotica_POS_Backups";
var BACKUP_FILE_PREFIX = "pos_backup_";

// หัวคอลัมน์ของชีต "สรุปรายเดือน" — ใช้ค้นหาจากหัวตาราง แทนการอ้างเลขคอลัมน์ตายตัว
var MASTER_VAR_HEADER = "เงินขาด/เกิน (฿)";
var MASTER_TS_HEADER  = "อัปเดตล่าสุด";
var MASTER_REV_HEADER = "รายได้รวม (฿)";
var MASTER_EXP_HEADER = "ค่าใช้จ่าย (฿)";
var MASTER_NET_HEADER = "กำไรสุทธิ (฿)";
var MASTER_TYPE_HEADER = "ประเภท";
var MASTER_PERIOD_HEADER = "ช่วงเวลา";
var MASTER_BILL_HEADER = "บิล";
// 4 คอลัมน์ VAT แทรกก่อน "รายได้รวม" — เรียงให้บวกจากซ้ายไปขวาแล้วได้รายได้รวมพอดี
var MASTER_VAT_HEADERS = ["ไม่คิด VAT (฿)", "คิด VAT (฿)", "VAT (฿)", "ปัดเศษ (฿)"];

// ── หัวคอลัมน์ของแท็บบิลรายเดือน "MM-yyyy" ────────────────────────────
// 4 ช่อง VAT แทรกไว้ก่อน "ยอดสุทธิ" ให้บวกจากซ้ายไปขวาแล้วลงตัวพอดี:
//     ราคารวม − ส่วนลด            = ไม่คิด VAT + คิด VAT
//     ไม่คิด VAT + คิด VAT + VAT + ปัดเศษ = ยอดสุทธิ
//
// ⚠️ เดิมแท็บนี้มี 9 คอลัมน์ ไม่มีช่อง VAT เลย ตอน VAT ปิดอยู่ไม่มีใครเห็นปัญหา
// เพราะยอดสุทธิ = ราคารวม − ส่วนลด พอดี แต่วันไหนเปิดสวิตช์ VAT แถวจะบวกไม่ลงตัวทันที
// แล้วตัวเลขที่ยื่นสรรพากรจะไม่ตรงกับชีต — ต้องมีคอลัมน์พวกนี้ "ก่อน" เปิด VAT ไม่ใช่หลัง
var BILL_HEADERS = [
  "เลขที่บิล", "วันที่-เวลา", "ลูกค้า", "รายการบริการ", "ช่องทางชำระเงิน",
  "ราคารวม (฿)", "ส่วนลด (฿)",
  "ไม่คิด VAT (฿)", "คิด VAT (฿)", "VAT (฿)", "ปัดเศษ (฿)",
  "ยอดสุทธิ (฿)", "พนักงาน"
];
var BILL_VAT_HEADERS = ["ไม่คิด VAT (฿)", "คิด VAT (฿)", "VAT (฿)", "ปัดเศษ (฿)"];
var BILL_NET_HEADER  = "ยอดสุทธิ (฿)";
var BILL_ID_HEADER   = "เลขที่บิล";
var BILL_LEGACY_HEADERS = [
  "เลขที่บิล", "วันที่-เวลา", "ลูกค้า", "รายการบริการ",
  "ช่องทางชำระเงิน", "ราคารวม (฿)", "ส่วนลด (฿)", "ยอดสุทธิ (฿)", "พนักงาน"
];

// ─────────────────────────────────────────────
//  ROUTER
// ─────────────────────────────────────────────
// ── รหัส error ที่แอปใช้ตัดสินว่า "ส่งใบถัดไปต่อ" หรือ "หยุดรอบ" (รอบตรวจ 5 ข้อ 2 · 2 ต.ค. 2569) ──────
//   TOKEN_NOT_SET / UNAUTHORIZED = ตั้งค่าผิด (แอปหยุดส่งทั้งรอบทันที แล้วบอกเจ้าของว่าต้องแก้อะไร)
//   BUSY                         = รอคิวเกิน 30 วินาที (แอปนับเหมือนเน็ตสะดุด — ไม่ไล่ยิงใบละ 30 วินาทีต่อ)
//   SERVER_ERROR                 = ข้อผิดพลาดระหว่างทำงาน — อาจเป็นเรื่องของแท็บเดือนเดียว แอปจึงยังส่งใบอื่นต่อ
// ⚠️ เดิมไม่มีรหัส — แอปจึงนับเป็น "บิลใบนั้นล้ม" แล้วไล่ส่งทุกใบซ้ำทุกนาที (รหัสผิดค้างข้ามวันอาจชนโควตา
//    อ่าน Script Properties 50,000 ครั้ง/วัน ซึ่งพอชนแล้วแม้แก้รหัสถูกก็ยังใช้ไม่ได้จนโควตารีเซ็ต)
// ข้อความยังเหมือนเดิมทุกตัวอักษร — แอปรุ่นก่อนที่ดูจากข้อความยังทำงานได้ตามเดิม
//
// ── ตรวจ 19 ต.ค. 2569 ข้อ 17: อ่านคำขอ + ตรวจรหัสเชื่อมต่อ "ก่อน" รอล็อก ─────────────────────────────
// เดิมรอล็อกก่อนแล้วค่อยตรวจรหัส — ใครมี URL /exec (อยู่ในไฟล์สำรอง/ไฟล์ส่งออกทุกไฟล์) ยิงถี่ ๆ แบบไม่มีรหัส
// ก็ทำให้คำขอของร้านต้องรอคิว/ได้ BUSY และเผาโควตาอ่าน Script Properties ได้ · ตอนนี้คำขอที่ไม่มีรหัสถูกปฏิเสธ
// โดยไม่แตะล็อก และรหัสอ่านจาก CacheService (6 ชม.) — ไม่อ่าน Script Properties ทุกคำขอ
// · body เกิน MAX_POST_BYTES_ ปฏิเสธก่อนแยกอ่าน (REQUEST_TOO_LARGE)
// · ข้อความ/รหัสของ UNAUTHORIZED / TOKEN_NOT_SET / BUSY / body ว่าง / JSON เสีย เหมือนเดิมทุกตัวอักษร
var MAX_POST_BYTES_ = 30 * 1024 * 1024;
// ค่าที่ใช้ได้ "เฉพาะในคำขอนี้" (Apps Script เริ่มสคริปต์ใหม่ทุกคำขออยู่แล้ว — ล้างใน doPost กันสภาพทดสอบที่ใช้ซ้ำ)
// primary = ข้อมูลเครื่องหลักที่อ่านแล้ว (ข้อ 8: อ่าน Script Properties ครั้งเดียวต่อคำขอ)
var REQUEST_SCOPE_ = null;
function doPost(e) {
  var data;
  try {
    if (!e || !e.postData || !e.postData.contents)
      return json("error", "ไม่พบข้อมูลที่ส่งมา");
    var bodyBytes = Number(e.postData.length);
    if (!(isFinite(bodyBytes) && bodyBytes >= 0)) bodyBytes = String(e.postData.contents).length;
    if (bodyBytes > MAX_POST_BYTES_) {
      return json("error", "ข้อมูลที่ส่งมาใหญ่เกิน " + Math.round(MAX_POST_BYTES_ / 1048576) + " MB — Apps Script ไม่รับ " +
        "(ถ้าเป็นไฟล์สำรอง ให้เจ้าของวางแผนเก็บบิลเก่าออกจากเครื่อง)", { sizeBytes: bodyBytes, limitBytes: MAX_POST_BYTES_ }, "REQUEST_TOO_LARGE");
    }
    data = JSON.parse(e.postData.contents);
    var denied = checkApiToken_(String((data && typeof data === "object" && data.secret) || ""));
    if (denied) return denied;
  } catch (preErr) {
    // JSON เสีย / บริการ Script Properties ล่ม — ข้อความแบบเดิม (เดิมเกิดในช่วงถือล็อกแล้วตอบแบบนี้)
    return json("error", "ข้อผิดพลาด: " + preErr.toString(), null, "SERVER_ERROR");
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (err) { return json("error", "ระบบหนาแน่น กรุณาลองใหม่", null, "BUSY"); }

  REQUEST_SCOPE_ = {};
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();

    // ── คำสั่งต้องอยู่ในรายการที่รองรับเท่านั้น ─────────────────────────────
    // เดิมทุกค่าที่ไม่ตรงเงื่อนไขไหนเลย "ตกลงมา" เป็น handleTransaction
    // แปลว่าพิมพ์ชื่อคำสั่งผิดตัวเดียว (เช่น "summary_monthh" หรือมีช่องว่างติดท้าย)
    // แล้วถ้าข้อมูลบิลครบพอ ระบบจะบันทึกเป็นบิลจริงลงชีตให้เงียบ ๆ ทั้งที่แอปคิดว่าสั่งอย่างอื่นอยู่
    //
    // แยกสองกรณีให้ชัด:
    //   ไม่ได้ส่ง action มาเลย = client รุ่นเก่าก่อนมีระบบ action → ตั้งใจรองรับ ให้เป็น transaction
    //   ส่งค่าที่ไม่รู้จักมา     = พิมพ์ผิดหรือคนละรุ่นกัน → ปฏิเสธ ไม่แตะข้อมูลอะไรทั้งนั้น
    var action = (data.action === undefined || data.action === null || data.action === "")
      ? "transaction"
      : String(data.action);

    var ACTION_HANDLERS = {
      "transaction":      function () { return handleTransaction(data, ss); },
      "summary_day":      function () { return handleDailySummary(data, ss); },
      "summary_month":    function () { return handleMonthlySummary(data, ss); },
      "backup":           function () { return handleBackup(data, ss); },
      "list_backups":     function () { return handleListBackups(data); },
      "get_backup":       function () { return handleGetBackup(data); },
      "void_transaction": function () { return handleVoidTransaction(data, ss); },
      "list_bills":       function () { return handleListBills(data, ss); },
      "list_bill_months": function () { return handleListBillMonths(data, ss); },
      "primary_status":   function () { return handlePrimaryStatus(data); },
      "register_primary": function () { return handlePrimaryStatus(data); },
      "claim_primary":    function () { return handleClaimPrimary(data); }
    };
    if (!Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, action)) {
      return json("error",
        "คำสั่งที่ไม่รู้จัก (" + action + ") — ตรวจว่าแอปกับ Apps Script เป็นรุ่นเดียวกัน",
        null, "INVALID_ACTION");
    }
    // ── สิทธิ์ระดับคำสั่ง: ตัดสินจากความลับที่ฝั่งนี้เก็บเอง ไม่ใช่จากฟิลด์ที่ client บอกมา ──
    // (ฟิลด์อย่าง role/isOwner ในคำขอไม่ถูกอ่านเลย — ใครถือรหัสเชื่อมต่อก็ใส่ค่าอะไรมาก็ได้)
    if (OWNER_KEY_ACTIONS[action] === true) {
      var auth = checkOwnerKey_(data.ownerKey);
      if (!auth.ok) return json("error", auth.message, null, auth.code);
    }
    // ── ข้อ 19: สรุป/ไฟล์สำรองรับจาก "เครื่องหลัก" เครื่องเดียว (ดู enforcePrimaryDevice_) ──
    if (PRIMARY_ONLY_ACTIONS[action] === true) {
      var denied = enforcePrimaryDevice_(data, action);
      if (denied) return denied;
    }
    var result = ACTION_HANDLERS[action]();
    // Commit pending Sheet writes before acknowledging and releasing the script lock.
    SpreadsheetApp.flush();
    return result;

  } catch (err) {
    // เช่น โควตาของ Google หมด / บริการชีตล่มชั่วคราว (ดูรหัสที่หัวฟังก์ชัน)
    return json("error", "ข้อผิดพลาด: " + err.toString(), null, "SERVER_ERROR");
  } finally {
    REQUEST_SCOPE_ = null;
    lock.releaseLock();
  }
}

function doGet(e)     { return ContentService.createTextOutput("Erotica POS API v2 — active").setMimeType(ContentService.MimeType.TEXT); }

// สร้างรหัสครั้งแรก: รันจาก Apps Script editor แล้วคัดลอกค่าที่ return ไปใส่ใน POS แต่ละเครื่อง
function setupPosApiToken() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty(POS_API_TOKEN_PROPERTY) || "");
  // ตรวจ 26 ต.ค. 2569 ข้อ 10: ค่าที่แก้มือแล้วผิดรูปแบบ (มีช่องว่าง/สั้นกว่า 24 ตัว) เดิมถูกคืนกลับเหมือนเป็นรหัส
  // แต่ doPost ถือว่า "ยังไม่ได้ตั้ง" แล้วบอกให้รันฟังก์ชันนี้อีก → ทางตัน · ตอนนี้สร้างรหัสใหม่แทนค่าที่ใช้ไม่ได้
  if (!token || !/^[A-Za-z0-9_-]{24,200}$/.test(token)) {
    if (token) Logger.log("รหัสเดิมผิดรูปแบบ (ต้องเป็น A-Z a-z 0-9 _ - ยาว 24-200 ตัว) — สร้างรหัสใหม่แทน");
    token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty(POS_API_TOKEN_PROPERTY, token);
  }
  cacheApiToken_(getPosApiToken_());   // ข้อ 17: ให้คำขอถัดไปใช้รหัสนี้ทันที (ไม่รอ cache เดิมหมดอายุ)
  Logger.log("POS API token: " + token);
  return token;
}

// ใช้เมื่อต้องสงสัยว่ารหัสหลุด: รันฟังก์ชันนี้ แล้วเปลี่ยนรหัสใน POS ทุกเครื่องทันที
function rotatePosApiToken() {
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(POS_API_TOKEN_PROPERTY, token);
  cacheApiToken_(getPosApiToken_());   // รหัสเก่าใช้ไม่ได้ทันที — cache ต้องไม่ถือรหัสเก่าไว้อีก 6 ชม.
  Logger.log("New POS API token: " + token);
  return token;
}

function getPosApiToken_() {
  var token = String(PropertiesService.getScriptProperties().getProperty(POS_API_TOKEN_PROPERTY) || "");
  return /^[A-Za-z0-9_-]{24,200}$/.test(token) ? token : "";
}

// ── รหัสเชื่อมต่อใน CacheService (ข้อ 17) ─────────────────────────────────────────────
// เก็บ { t: รหัส, at: เวลาที่อ่านจาก Script Properties } ไว้ 6 ชม. · cache ใช้ไม่ได้/ไม่มี = อ่าน Script Properties ตามเดิม
// รหัสไม่ตรงกับ cache: ถ้า cache อายุไม่ถึง 1 นาที = ปฏิเสธเลย (ไม่อ่าน Script Properties — กันคนยิงรหัสมั่วเผาโควตา)
//   เกิน 1 นาที = อ่านซ้ำ 1 ครั้ง (เจ้าของแก้รหัสใน Script properties เองโดยไม่ได้รัน rotatePosApiToken → ใช้ได้ภายใน 1 นาที)
var API_TOKEN_CACHE_KEY_ = "POS_API_TOKEN_CACHE_V1";
var API_TOKEN_CACHE_SECONDS_ = 6 * 60 * 60;
var API_TOKEN_RECHECK_MS_ = 60 * 1000;
function apiTokenCache_() {
  try { return (typeof CacheService !== "undefined" && CacheService) ? CacheService.getScriptCache() : null; }
  catch (e) { return null; }
}
function cacheApiToken_(token) {
  var cache = apiTokenCache_();
  if (!cache) return;
  try {
    if (token) cache.put(API_TOKEN_CACHE_KEY_, JSON.stringify({ t: token, at: Date.now() }), API_TOKEN_CACHE_SECONDS_);
    else cache.remove(API_TOKEN_CACHE_KEY_);
  } catch (e) { Logger.log("token cache not updated: " + e); }
}
function cachedApiToken_() {
  var cache = apiTokenCache_();
  if (!cache) return null;
  try {
    var o = JSON.parse(cache.get(API_TOKEN_CACHE_KEY_) || "null");
    if (o && typeof o.t === "string" && /^[A-Za-z0-9_-]{24,200}$/.test(o.t) && isFinite(Number(o.at))) return { t: o.t, at: Number(o.at) };
  } catch (e) { /* cache เสีย/ล่ม = อ่าน Script Properties */ }
  return null;
}
// คืน null = รหัสถูก · ไม่ถูก = response (ข้อความ/รหัสเดิมทุกตัวอักษร)
function checkApiToken_(given) {
  var cached = cachedApiToken_();
  if (cached) {
    if (constantTimeEquals_(given, cached.t)) return null;
    if (Date.now() - cached.at < API_TOKEN_RECHECK_MS_) return json("error", "ไม่ได้รับอนุญาต (unauthorized)", null, "UNAUTHORIZED");
  }
  var expectedToken = getPosApiToken_();
  cacheApiToken_(expectedToken);
  // ตรวจสอบรหัสเชื่อมต่อจาก Script Properties — ไม่ยอมให้ endpoint ทำงานถ้ายังไม่ได้ตั้งค่า
  if (!expectedToken) {
    return json("error", "ยังไม่ได้ตั้งรหัสเชื่อมต่อ POS — ให้รัน setupPosApiToken() ใน Apps Script ก่อน", null, "TOKEN_NOT_SET");
  }
  if (!constantTimeEquals_(given, expectedToken)) {
    return json("error", "ไม่ได้รับอนุญาต (unauthorized)", null, "UNAUTHORIZED");
  }
  return null;
}

// ลดข้อมูล timing ที่ใช้เดารหัสทีละตัว (ไม่ใช่ตัวแทนระบบล็อกอินเต็มรูปแบบ)
function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  var mismatch = 0;
  for (var i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

// ─────────────────────────────────────────────
//  สิทธิ์คำสั่งสำคัญฝั่งเซิร์ฟเวอร์ — รหัสเจ้าของร้าน (Owner key)
// ─────────────────────────────────────────────
// รหัสเชื่อมต่อ (POS_API_TOKEN) อยู่ในทุกเครื่องหน้าร้าน จึงพิสูจน์ได้แค่ว่า "คำขอมาจากเครื่อง POS"
// ไม่ได้พิสูจน์ว่า "ใครเป็นคนกด" — บทบาท owner/manager/staff รู้กันแค่ในเครื่อง ส่งมาก็ปลอมได้
// ฝั่งนี้จึง "ไม่อ่าน role จากคำขอเลย" แล้วใช้ข้อมูลที่เชื่อถือได้แทน:
//   คำสั่งที่เปิดข้อมูลทั้งร้าน (รายการ/เนื้อไฟล์สำรอง · รายการบิลทั้งเดือน) และคำสั่งตั้งเครื่องหลัก
//   ต้องแนบรหัสเจ้าของที่มีแต่เจ้าของรู้ — เซิร์ฟเวอร์เก็บแค่ hash + salt ใน Script Properties
// ตั้งครั้งแรก: รัน setupPosOwnerKey() แล้วจดรหัสจาก Execution log (ไม่ต้องใส่ในเครื่องไหน กรอกตอนใช้งาน)
// ลืม/สงสัยว่าหลุด: รัน rotatePosOwnerKey() — รหัสเก่าใช้ไม่ได้ทันที
var POS_OWNER_KEY_HASH_PROPERTY = "POS_OWNER_KEY_HASH";
var POS_OWNER_KEY_SALT_PROPERTY = "POS_OWNER_KEY_SALT";
var POS_OWNER_KEY_FAILS_PROPERTY = "POS_OWNER_KEY_FAILS";
// ใส่ผิดติดกัน → "หน่วงเวลา" ทีละขั้น (ไม่ล็อกยาว) — เดิมผิด 5 ครั้งล็อก 15 นาทีทุกคน
// ใครก็ได้ที่ใช้เครื่องขายจึงพิมพ์มั่ว 5 ครั้งล็อกเจ้าของออกได้ ตอนนี้รอสูงสุดครั้งละ 1 นาทีแล้วใส่ถูกเข้าได้เสมอ
// (รหัสยาว 20 ตัวจาก 32 ตัวอักษร ≈ 100 บิต — หน่วง 1 นาทีต่อครั้งเดาไม่ได้อยู่แล้ว)
var OWNER_KEY_DELAY_AFTER = 3;                 // ผิดติดกันตั้งแต่ครั้งที่ 3 เริ่มหน่วง
var OWNER_KEY_BASE_DELAY_MS = 5 * 1000;        // 5 → 10 → 20 → 40 → 60 วินาที
var OWNER_KEY_MAX_DELAY_MS = 60 * 1000;
var OWNER_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // ตัดตัวที่อ่านสับสน (0/O, 1/I)
// คำสั่งที่ต้องใช้รหัสเจ้าของ — นอกนั้นใช้รหัสเชื่อมต่อของเครื่องอย่างเดียว
// (ขายบิล/ยกเลิก/สรุป/สำรอง ต้องทำงานได้แม้ส่งย้อนหลังตอนเจ้าของไม่อยู่ — ดูขอบเขตในรายงาน)
var OWNER_KEY_ACTIONS = { "list_backups": true, "get_backup": true, "list_bills": true, "list_bill_months": true,
  "claim_primary": true };

function setupPosOwnerKey() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(POS_OWNER_KEY_HASH_PROPERTY)) {
    Logger.log("ตั้งรหัสเจ้าของไว้แล้ว — ถ้าลืมหรือสงสัยว่าหลุด ให้รัน rotatePosOwnerKey() เพื่อออกรหัสใหม่");
    return "";
  }
  return rotatePosOwnerKey();
}

function rotatePosOwnerKey() {
  var raw = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  var key = "";
  for (var i = 0; i + 1 < raw.length && key.length < 20; i += 2) {
    key += OWNER_KEY_ALPHABET.charAt(parseInt(raw.substr(i, 2), 16) % OWNER_KEY_ALPHABET.length);
  }
  key = key.replace(/(.{4})(?=.)/g, "$1-");                // XXXX-XXXX-XXXX-XXXX-XXXX
  var salt = Utilities.getUuid().replace(/-/g, "");
  var props = PropertiesService.getScriptProperties();
  props.setProperty(POS_OWNER_KEY_SALT_PROPERTY, salt);
  props.setProperty(POS_OWNER_KEY_HASH_PROPERTY, hashOwnerKey_(salt, key));
  props.deleteProperty(POS_OWNER_KEY_FAILS_PROPERTY);
  Logger.log("Owner key (เก็บไว้กับเจ้าของร้านเท่านั้น): " + key);
  return key;
}

function hashOwnerKey_(salt, key) {
  var norm = String(key == null ? "" : key).toUpperCase().replace(/[^A-Z0-9]/g, "");
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + norm, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

// คืน { ok } หรือ { ok:false, code, message }
function checkOwnerKey_(provided) {
  var props = PropertiesService.getScriptProperties();
  var hash = String(props.getProperty(POS_OWNER_KEY_HASH_PROPERTY) || "");
  var salt = String(props.getProperty(POS_OWNER_KEY_SALT_PROPERTY) || "");
  if (!hash || !salt) {
    return { ok: false, code: "OWNER_KEY_NOT_CONFIGURED",
      message: "ยังไม่ได้ตั้งรหัสเจ้าของร้านบน Apps Script — ให้เจ้าของรัน setupPosOwnerKey() ก่อน" };
  }
  var fails = {};
  try { fails = JSON.parse(props.getProperty(POS_OWNER_KEY_FAILS_PROPERTY) || "{}") || {}; } catch (e) { fails = {}; }
  var now = Date.now();
  if (fails.until && now < Number(fails.until)) {
    // ระหว่างช่วงรอ: ไม่ตรวจรหัสและไม่นับครั้งผิดเพิ่ม (กดรัวไม่ทำให้ต้องรอนานขึ้น)
    return { ok: false, code: "OWNER_KEY_LOCKED",
      message: "ใส่รหัสเจ้าของผิดหลายครั้ง — รออีก " + Math.ceil((Number(fails.until) - now) / 1000) + " วินาทีแล้วลองใหม่" };
  }
  var given = String(provided == null ? "" : provided);
  if (!given) return { ok: false, code: "OWNER_KEY_REQUIRED", message: "คำสั่งนี้ต้องใช้รหัสเจ้าของร้าน (Owner key)" };
  if (!constantTimeEquals_(hashOwnerKey_(salt, given), hash)) {
    var count = (Number(fails.count) || 0) + 1;
    var next = { count: count };
    if (count >= OWNER_KEY_DELAY_AFTER) {
      next.until = now + Math.min(OWNER_KEY_MAX_DELAY_MS, OWNER_KEY_BASE_DELAY_MS * Math.pow(2, count - OWNER_KEY_DELAY_AFTER));
    }
    props.setProperty(POS_OWNER_KEY_FAILS_PROPERTY, JSON.stringify(next));
    return { ok: false, code: "OWNER_KEY_INVALID", message: "รหัสเจ้าของร้านไม่ถูกต้อง" };
  }
  if (fails.count || fails.until) props.deleteProperty(POS_OWNER_KEY_FAILS_PROPERTY);
  return { ok: true };
}

// ─────────────────────────────────────────────
//  เครื่องหลัก (Primary device) — ข้อ 19
// ─────────────────────────────────────────────
// สรุปวัน/เดือน และไฟล์สำรองบน Drive คำนวณจาก "ข้อมูลทั้งก้อนในเครื่องที่ส่ง" — ไม่ได้รวมยอดจากหลายเครื่อง
// ถ้าร้านใช้สองเครื่องขายพร้อมกัน แต่ละเครื่องจะส่งสรุปที่เห็นแค่บิลของตัวเองมาทับกันไปมา (คนส่งหลังชนะ)
// และไฟล์สำรองของอีกเครื่องจะไล่ลบไฟล์ของเครื่องหลักตามกติกาเก็บไฟล์ล่าสุด
// ระบบนี้จึงเป็นแบบ "เครื่องหลักเครื่องเดียว" และบังคับที่ฝั่งนี้ (ไม่เชื่อสิ่งที่ client บอกว่าตัวเองเป็น):
//   · สรุปวัน/เดือน + สำรองขึ้น Drive รับเฉพาะคำขอที่มีรหัสเครื่องตรงกับเครื่องหลักที่ลงทะเบียนไว้
//   · บิลรายใบ/ยกเลิกบิลรับเฉพาะเครื่องหลักด้วย เพื่อให้ประวัติทั้งร้านอยู่ในเครื่องเดียว
//   · รับช่วงฉุกเฉินต้องใช้ Owner key: รับบิลใหม่ แต่ server พักสรุป/Drive backup และป้องกันแก้/ยกเลิกบิล
//   · ยังไม่มีเครื่องหลัก → เครื่องแรกที่ส่งสรุป/สำรองพร้อมรหัสเครื่อง ได้เป็นเครื่องหลัก
//   · แอปรุ่นเก่าที่ไม่ส่งรหัสเครื่อง → ยอมตามเดิมเฉพาะตอนที่ยังไม่มีเครื่องหลัก (ช่วงอัปเกรด)
//   · ย้ายเครื่องหลัก (เปลี่ยน iPad/ล้างเครื่อง) → เจ้าของสั่งจากเครื่องใหม่ด้วยรหัสเจ้าของ (claim_primary)
var POS_PRIMARY_DEVICE_PROPERTY = "POS_PRIMARY_DEVICE";
var PRIMARY_ONLY_ACTIONS = { "register_primary": true, "transaction": true, "void_transaction": true, "summary_day": true, "summary_month": true, "backup": true };
var DEVICE_ID_RE_ = /^[A-Za-z0-9_-]{16,64}$/;

// คืน null = ยังไม่มีเครื่องหลัก · ค่าเสีย = โยน error (ปิดไว้ก่อน ไม่เดาว่าใครเป็นเครื่องหลัก)
// ข้อ 8 (ตรวจ 19 ต.ค. 2569): ในคำขอเดียวกัน (ถือ script lock อยู่ ไม่มีใครเขียนแทรกได้) อ่าน Script Properties ครั้งเดียว
// — เดิมบิลหนึ่งใบอ่าน 2–3 ครั้ง (ด่านเครื่องหลัก + ด่านกู้ฉุกเฉิน) · ค่าเสียไม่จำ (ทุกจุดยังโยน error เหมือนเดิม)
function readPrimaryDevice_() {
  var scope = REQUEST_SCOPE_;
  if (scope && Object.prototype.hasOwnProperty.call(scope, "primary")) return scope.primary;
  var raw = PropertiesService.getScriptProperties().getProperty(POS_PRIMARY_DEVICE_PROPERTY);
  if (!raw) { if (scope) scope.primary = null; return null; }
  var o = null;
  try { o = JSON.parse(raw); } catch (e) { o = null; }
  if (!o || typeof o !== "object" || !DEVICE_ID_RE_.test(String(o.id || ""))) {
    throw new Error("ข้อมูลเครื่องหลัก (POS_PRIMARY_DEVICE) ใน Script Properties เสีย — " +
      "ให้เจ้าของตั้งเครื่องหลักใหม่จากหน้าตั้งค่าของเครื่องที่ใช้ขาย (ต้องใช้รหัสเจ้าของ)");
  }
  if (scope) scope.primary = o;
  return o;
}

// ชื่อเครื่อง: ตัดอักขระควบคุม/ช่องว่างหัวท้าย/ยาวเกิน เท่านั้น (ตรวจ 8 ต.ค. 2569 ข้อ 16)
// ค่านี้เก็บใน Script Properties/JSON และโชว์ให้ผู้ใช้ — ไม่ใช่ช่องในชีต จึงไม่ผ่าน safeCell
// (เดิมผ่าน → ชื่อที่ขึ้นต้น + - = @ หรือตัวเลข ถูกเติม ' นำหน้าแล้วโชว์ "'+66 iPad หน้าร้าน")
// จุดที่ลงชีตจริง (แท็บ _POS_RECOVERY_ACCEPTED) เรียก safeCell เองตอนเขียน
function cleanDeviceLabel_(v) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 40);
}

function devicePublic_(o) {
  return o ? { label: cleanDeviceLabel_(o.label), claimedAt: Number(o.claimedAt) || 0, how: String(o.how || "").slice(0, 40),
    recovery: o.recovery ? { incomplete: true, startedAt: o.recovery.startedAt } : null } : null;
}

function writePrimaryDevice_(o) {
  if (REQUEST_SCOPE_) delete REQUEST_SCOPE_.primary;   // ค่าที่จำไว้ในคำขอนี้เก่าแล้ว — อ่านกลับจาก Script Properties จริง
  PropertiesService.getScriptProperties().setProperty(POS_PRIMARY_DEVICE_PROPERTY, JSON.stringify(o));
  // อ่านกลับตรวจ — ถ้าเขียนไม่ติด ห้ามตอบว่าเป็นเครื่องหลักแล้ว
  var back = readPrimaryDevice_();
  if (!back || back.id !== o.id) throw new Error("บันทึกเครื่องหลักไม่สำเร็จ (อ่านกลับไม่ตรง)");
  return back;
}

// คืน null = ผ่าน · ไม่ผ่าน = response error พร้อม code NOT_PRIMARY_DEVICE
function enforcePrimaryDevice_(data, action) {
  var dev = String(data.deviceId == null ? "" : data.deviceId);
  var cur = readPrimaryDevice_();
  if (!cur) {
    if (!DEVICE_ID_RE_.test(dev) && (action === 'transaction' || action === 'void_transaction' || action === 'register_primary')) {
      return json('error', 'ต้องใช้แอปรุ่นที่ส่งรหัสเครื่องก่อนบันทึก/ยกเลิกบิล', null, 'INVALID_DEVICE_ID');
    }
    if (!DEVICE_ID_RE_.test(dev)) return null;   // แอปรุ่นเก่า + ยังไม่มีเครื่องหลัก = ยอมตามเดิม
    writePrimaryDevice_({ id: dev, label: cleanDeviceLabel_(data.deviceLabel), claimedAt: Date.now(), how: "auto:" + action });
    return null;
  }
  if (DEVICE_ID_RE_.test(dev) && dev === cur.id) {
    if (cur.recovery && ['summary_day', 'summary_month', 'backup', 'void_transaction'].indexOf(action) >= 0) {
      return json('error', 'รับช่วงฉุกเฉิน: พักสรุป สำรอง และการแก้/ยกเลิกบิลจนกู้ข้อมูลครบ แล้วให้เจ้าของตรวจและปลดการพัก',
        { primary: devicePublic_(cur) }, 'INCOMPLETE_RECOVERY');
    }
    return null;
  }
  return json("error",
    "เครื่องนี้ไม่ใช่เครื่องหลักของร้าน — ยอดขาย การยกเลิก สรุป และไฟล์สำรองรับจากเครื่องหลักเครื่องเดียว" +
    (cur.label ? " (" + cleanDeviceLabel_(cur.label) + ")" : "") +
    " · ถ้าจะย้ายเครื่องหลักมาเครื่องนี้ ให้เจ้าของกด \"ตั้งเครื่องนี้เป็นเครื่องหลัก\" ในหน้าตั้งค่า",
    { primary: devicePublic_(cur) }, "NOT_PRIMARY_DEVICE");
}

function handlePrimaryStatus(data) {
  var dev = String(data.deviceId == null ? "" : data.deviceId);
  var cur = readPrimaryDevice_();
  return json("success", cur ? "มีเครื่องหลักแล้ว" : "ยังไม่มีเครื่องหลัก", {
    backendId: backendId_(), registered: !!cur,
    isThisDevice: !!cur && DEVICE_ID_RE_.test(dev) && dev === cur.id,
    primary: devicePublic_(cur)
  });
}

// ต้องใช้รหัสเจ้าของ (ดู OWNER_KEY_ACTIONS) — ย้ายสิทธิ์ส่งสรุป/สำรองมาที่เครื่องที่ส่งคำขอนี้
// ตรวจรอบ Claude 7 ต.ค. 2569 (รอบ 3) · เจ้าของเลือกนโยบาย:
//   · voidIntents = คำสั่งยกเลิกที่ค้างมากับไฟล์สำรอง (ยังไม่ถึงชีต) — ลบแถวให้เฉพาะคำสั่งที่เกิด "ก่อนเวลาเริ่มพัก"
//     (ย้ายปกติ = ก่อนเวลาที่ขอย้าย) แล้วจึงตรวจความครบ · เดิมย้ายไม่ได้และปลดพักไม่ได้ตลอดไป (void ถูกพัก)
//   · acceptMissing = ปลดพักแบบ "ยอมรับว่ารายละเอียดบิลหายถาวร" (เครื่องเดิมเสียถาวร) — ใช้ได้เฉพาะตอนปลดพักฉุกเฉิน
//     ต้องยืนยันครบทุกเลขที่ชีตแจ้ง · บิลที่ถูกยกเลิกบนชีตไม่รับแบบนี้ (ต้องจัดการในบิลรอตรวจก่อน)
//     เก็บรายการไว้ในแท็บ _POS_RECOVERY_ACCEPTED เป็นหลักฐาน · แถวบิลบนชีตไม่ถูกแตะ
//   · ไม่ผ่าน = ส่งรายการ missing/different/voided กลับไปให้แอปจัดการ (เดิมบอกแค่ใบแรก)
function handleClaimPrimary(data) {
  var dev = String(data.deviceId == null ? "" : data.deviceId);
  if (!DEVICE_ID_RE_.test(dev)) return json("error", "รหัสเครื่องไม่ถูกต้อง", null, "INVALID_DEVICE_ID");
  var prev = null;
  try { prev = readPrimaryDevice_(); } catch (e) { prev = null; }   // ค่าเดิมเสีย = เจ้าของกำลังตั้งใหม่ทับ
  var emergency = data.emergency === true;
  if (emergency && !prev) return json('error', 'ยังไม่มีเครื่องหลักเดิม — ใช้การตั้งเครื่องหลักตามปกติ', null, 'INVALID_EMERGENCY_TRANSFER');
  if (prev && prev.recovery && !emergency && data.recoveryConfirmed !== true) {
    return json('error', 'ต้องยืนยันว่ากู้รายละเอียดบิล ค่าใช้จ่าย และกะครบก่อนปลดการพักฉุกเฉิน',
      { primary: devicePublic_(prev) }, 'RECOVERY_CONFIRMATION_REQUIRED');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), voidPlan = [], acceptedRows = null, pendingVoidRows = [], batchAccepted = 0;
  if ((!prev || prev.id !== dev || prev.recovery) && !emergency) {
    var voidBefore = prev && prev.recovery ? (Number(prev.recovery.startedAt) || 0) : Date.now();
    var recoveryStartedAt = prev && prev.recovery ? Number(prev.recovery.startedAt) || 0 : 0;
    // ประกอบตัวตรวจใหม่ทุกครั้ง (ตัวตรวจลบรายการ sheetOnly ที่ใช้แล้วออกจากแผนที่ของมัน) — ข้อ 10 ตรวจซ้ำหลังบันทึกรอบ
    var validate = function() {
      return validatePrimaryTransfer_(data.bills, { voidIntents: transferVoidIntents_(data.voidIntents), voidBefore: voidBefore,
        sheetOnly: transferSheetOnly_(data.sheetOnly), acceptedSince: recoveryStartedAt });
    };
    var corruptOf = function(r) {
      return registryCorruptResponse_(r.registryCorrupt.error, r.registryCorrupt.id,
        prev && prev.recovery ? 'ยังไม่ปลดการพัก (เครื่องหลักยังเป็นแบบเดิม)' : 'ยังไม่ย้ายเครื่องหลัก (เครื่องหลักยังเป็นเครื่องเดิม)',
        r.registryCorrupt.what);
    };
    var held = Object.create(null);
    (Array.isArray(data.bills) ? data.bills : []).forEach(function(b) { if (b && b.id) held[String(b.id)] = true; });
    // ยอมรับข้อมูลหายได้ไหม (ไม่ดูว่ารายการถูกตัดที่ TRANSFER_LIST_MAX_ หรือเปล่า — ข้อ 10 ยอมรับเป็นรอบได้)
    // ⚠️ คำสั่งยกเลิกค้างเกินเพดาน = ไม่รับ (ด้านล่างปฏิเสธการปลดพักอยู่แล้ว ไม่ให้วนรอบที่ไม่คืบ)
    var acceptableOf = function(r) {
      return !r.structural && !r.voided.length && !r.acceptedLedgerError && !((r.counts.pendingVoid || 0) > r.pendingVoid.length) &&
        !!(prev && prev.recovery) && data.recoveryConfirmed === true && !r.missing.some(function(x) { return x.accepted; }) &&
        !r.missing.some(function(x) { return held[x.id] === true; });
    };
    var needsOf = function(r) { return r.missing.filter(function(x) { return !x.accepted; }).concat(r.different); };
    var incomplete = function(r, prefix) {
      var msg = (prefix || '') + r.message + (r.acceptedLedgerError ? ' · อ่านแท็บ _POS_RECOVERY_ACCEPTED ไม่ได้ (' + r.acceptedLedgerError +
        ') — ห้ามแก้แท็บนี้เอง ให้ผู้ดูแลคืนหัวคอลัมน์เดิมก่อน' : '');
      var det = { missing: r.missing, different: r.different, voided: r.voided,
        pendingVoid: r.pendingVoid, counts: r.counts, truncated: !!r.truncated, acceptable: acceptableOf(r),
        acceptedLedgerError: r.acceptedLedgerError || undefined, recoveryStartedAt: recoveryStartedAt };
      if (batchAccepted) { det.batchAccepted = batchAccepted; det.remaining = r.counts.toAccept || 0; }
      return json("error", msg, det, "PRIMARY_TRANSFER_INCOMPLETE");
    };
    var rowsOf = function(list) {
      var at = Date.now(), label = safeCell(cleanDeviceLabel_(data.deviceLabel));   // ลงชีต → กันชีตแปลงชนิด/สูตร
      return list.map(function(x) { return [x.id, x.month, x.version || '', x.total, x.kind, at, label]; });
    };
    var ready = validate();
    // ตรวจ 14 ต.ค. (รอบ 2): ทะเบียนยกเลิกเสีย = ตอบ REGISTRY_CORRUPT พร้อมสาเหตุ ก่อนแตะชีต/เครื่องหลัก
    // (เดิมตอบ PRIMARY_TRANSFER_INCOMPLETE "อ่านทะเบียนไม่ได้" แอปจึงเสนอ "รับช่วงฉุกเฉิน" = เครื่องหลักค้างโหมดพักโดยไม่จำเป็น)
    if (ready.registryCorrupt) return corruptOf(ready);
    if (!ready.ok) {
      // บิลที่เคยยอมรับว่าหายแล้ว (อยู่ในทะเบียน) แต่เครื่องนี้ยังไม่มี "บิลจากชีต" ของมัน → แอปนำเข้าก่อน ไม่ต้องยอมรับซ้ำ
      // ยอมรับข้อมูลหายใหม่ได้เฉพาะตอนปลดพักฉุกเฉินที่ยืนยันแล้ว และต้องระบุครบทุกเลขที่ชีตแจ้ง (รวมบิลข้อมูลต่าง)
      // บิลที่เครื่องส่งมาเป็นบิลเต็ม ห้ามถูกบันทึกว่า "หาย" ไม่ว่ากรณีใด (กันซ้ำกับการตรวจแถวซ้ำข้างบน)
      var needs = needsOf(ready);
      var wanted = Object.create(null);
      (Array.isArray(data.acceptIds) ? data.acceptIds : []).forEach(function(id) { wanted[String(id)] = true; });
      var covered = needs.length > 0 && needs.every(function(x) { return wanted[x.id] === true; });
      if (!(acceptableOf(ready) && data.acceptMissing === true && covered)) return incomplete(ready);
      if (ready.listTruncated) {
        // ── ข้อ 10 (ตรวจ 19 ต.ค. 2569): บิลที่ต้องยอมรับมีเกินเพดานรายการต่อคำตอบ (3,000) ──────────────────────
        // เดิม acceptable:false ตลอดไป = ปลดพักไม่ได้เลย (สรุป/สำรอง/ยกเลิกบิล ถูกพักถาวร)
        // ตอนนี้: บันทึกรอบนี้ (เฉพาะรายการที่ชีตแจ้งมาและเจ้าของยืนยันครบ) ลงแท็บ _POS_RECOVERY_ACCEPTED แล้วตรวจใหม่
        // แล้วตอบ "ยังไม่ครบ — เหลืออีก M ใบ" พร้อมรายการรอบถัดไป · รอบสุดท้าย (รายการไม่ถูกตัด) ปลดพักตามเดิม
        // บิลที่หาย: เครื่องประกาศว่าถือ "บิลจากชีต" ของมันแล้ว (sheetOnly) จึงถูกนับว่าครบในการตรวจรอบถัดไป
        // บิลข้อมูลต่าง: ยกเว้นเฉพาะที่ยอมรับ "ในการพักครั้งนี้" และแถวบนชีตยังตรงกับตอนยอมรับ (ดู acceptedSince)
        // แอปรุ่นก่อน: ได้คำตอบนี้แล้วถอนบิลจากชีตออก — กดอีกครั้ง แอปนำเข้าบิลที่ยอมรับแล้วเอง (ทางเดิม) แล้วถามรอบถัดไป
        var batchRows = rowsOf(needs);
        var recErr = recordRecoveryEvidence_(ss, batchRows);
        if (recErr) return recErr;
        batchAccepted = batchRows.length;
        ready = validate();
        if (ready.registryCorrupt) return corruptOf(ready);
        if (!ready.ok) {
          return incomplete(ready, 'ยอมรับข้อมูลหายรอบนี้แล้ว ' + batchAccepted + ' ใบ (บันทึกในแท็บ ' + RECOVERY_ACCEPTED_NAME_ + ') · ยังเหลืออีก ' +
            (ready.counts.toAccept || 0) + ' ใบ — ยังไม่ปลดพัก กด "ตรวจข้อมูลครบและปลดการพัก" อีกครั้งเพื่อยืนยันรอบถัดไป · ');
        }
        // ไม่เหลืออะไรแล้ว (ปกติไม่เกิด — รายการถูกตัดแปลว่ายังมีรอบถัดไป) → ปลดพักตามปกติด้านล่าง
      } else {
        acceptedRows = rowsOf(needs);
      }
    }
    voidPlan = ready.voidPlan;
    // ปลดพักฉุกเฉินขณะมีคำสั่งยกเลิกที่ยังไม่ถึงชีต (สั่งระหว่างพัก/ไม่รู้เวลา) — แถวยังอยู่บนชีตจนคำสั่งนั้นมาถึง
    // ต้องมีหลักฐานว่าปลดพักโดยมีบิลกลุ่มนี้ค้าง (เดิมปลดได้เงียบ ๆ ไม่มีบันทึก · ผู้ตรวจแยกรอบ 2 #2) · ชนิด pendingVoid ไม่ให้ข้อยกเว้นใด ๆ
    if (prev && prev.recovery && (ready.counts.pendingVoid || 0) > ready.pendingVoid.length) {
      return json('error', 'คำสั่งยกเลิกที่ค้างมีเกิน ' + TRANSFER_LIST_MAX_ + ' ใบ บันทึกหลักฐานในครั้งเดียวไม่ได้ — ยังไม่ปลดพัก ให้ผู้ดูแลตรวจคิวในเครื่องก่อน', null, 'PRIMARY_TRANSFER_INCOMPLETE');
    }
    if (prev && prev.recovery && ready.pendingVoid.length) {
      var pvAt = Date.now(), pvLabel = safeCell(cleanDeviceLabel_(data.deviceLabel)), pvHave = Object.create(null);   // ลงชีต
      (acceptedRows || []).forEach(function(r) { pvHave[r[0]] = true; });
      pendingVoidRows = ready.pendingVoid.filter(function(x) { return !pvHave[x.id]; }).map(function(x) {
        return [x.id, x.month, x.version || '', x.total, 'pendingVoid', pvAt, pvLabel];
      });
    }
  }
  if (emergency) {
    // ทะเบียนเลขบิลช่วยกันเขียนทับประวัติระหว่างพัก แต่การรับช่วงต้องไม่ล้มเพราะชีตเก่ามีแถวเพี้ยน (ตรวจรอบ Claude รอบ 3)
    try { migrateLegacyBillIndex_(ss, ledgerSheet_(BILL_INDEX_NAME_, ['id', 'month', 'version', 'hash', 'applied'], ss)); }
    catch (migrationErr) { Logger.log('emergency claim: bill index upgrade deferred — ' + migrationErr); }
  }
  for (var i = 0; i < voidPlan.length; i++) {
    var applied = applyTransferVoid_(ss, voidPlan[i]);
    if (!applied.ok) return applied.response || json('error', applied.message, { billId: voidPlan[i].id }, applied.code);
  }
  var evidenceRows = (acceptedRows || []).concat(pendingVoidRows);
  var evidenceErr = recordRecoveryEvidence_(ss, evidenceRows);
  if (evidenceErr) return evidenceErr;
  var saved = writePrimaryDevice_({ id: dev, label: cleanDeviceLabel_(data.deviceLabel), claimedAt: Date.now(), how: "owner",
    recovery: emergency ? { incomplete: true, startedAt: prev && prev.recovery ? prev.recovery.startedAt : Date.now() } : null,
    previous: prev && prev.id !== dev ? devicePublic_(prev) : null });
  return json("success", "ตั้งเครื่องนี้เป็นเครื่องหลักแล้ว", { primary: devicePublic_(saved), previous: prev && prev.id !== dev ? devicePublic_(prev) : null,
    voidedOnTransfer: voidPlan.map(function(p) { return p.id; }), accepted: acceptedRows ? acceptedRows.length : 0,
    pendingVoidRecorded: pendingVoidRows.length,
    acceptedIds: acceptedRows ? acceptedRows.map(function(r) { return r[0]; }) : [],
    batchAccepted: batchAccepted || undefined });
}

// เขียนหลักฐาน (ยอมรับข้อมูลหาย / คำสั่งยกเลิกค้าง) แล้วอ่านกลับยืนยัน — คืน null = สำเร็จ · response = ไม่สำเร็จ (ยังไม่ปลดพัก)
function recordRecoveryEvidence_(ss, rows) {
  if (!rows || !rows.length) return null;
  var acceptedSheet = ledgerSheet_(RECOVERY_ACCEPTED_NAME_, RECOVERY_ACCEPTED_HEADERS_, ss);
  ledgerAppendRows_(acceptedSheet, rows, 3);
  SpreadsheetApp.flush();
  var recorded = readRecoveryAccepted_(ss);
  for (var k = 0; k < rows.length; k++) {
    var rec = recorded[rows[k][0]];
    if (!rec || rec.kind !== rows[k][4]) return json('error', 'บันทึกหลักฐานบิลที่ยอมรับว่าหาย/คำสั่งยกเลิกค้างไม่สำเร็จ — ยังไม่ปลดพัก', null, 'RECOVERY_ACCEPT_FAILED');
  }
  return null;
}

var RECOVERY_ACCEPTED_NAME_ = '_POS_RECOVERY_ACCEPTED';
var RECOVERY_ACCEPTED_HEADERS_ = ['id', 'month', 'version', 'total', 'kind', 'acceptedAt', 'device'];
// ร้านจริงมีบิลราว 250 ใบ/เดือน — ไฟล์สำรองที่เก่าหลายเดือนก็ยังอยู่ในเพดานนี้ (เดิม 500 = ไฟล์เก่า 2 เดือนปลดพักไม่ได้เลย)
var TRANSFER_LIST_MAX_ = 3000;
// บิลจากชีตที่เครื่องประกาศว่าถืออยู่ — ไม่ใช่รายการปัญหา ต้องรับได้ครบเหมือนรายการบิลเต็ม (เดิมตัดที่ 3000 = เกินแล้วย้ายไม่ได้ตลอด)
var TRANSFER_DECLARED_MAX_ = 50000;
// ทะเบียน "ยอมรับว่ารายละเอียดหาย" — แถวล่าสุดของแต่ละเลขเป็นตัวจริง (ยอมรับซ้ำหลังแถวบนชีตเปลี่ยน = แถวใหม่)
function readRecoveryAccepted_(ss) {
  var out = Object.create(null), sheet = ss.getSheetByName(RECOVERY_ACCEPTED_NAME_);
  if (!sheet) return out;
  sheet = ledgerSheet_(RECOVERY_ACCEPTED_NAME_, RECOVERY_ACCEPTED_HEADERS_, ss);
  var n = sheet.getLastRow();
  // ช่อง 6 = เวลาที่ยอมรับ (นาฬิกาเซิร์ฟเวอร์) — ข้อ 10 ใช้แยกว่าบิลข้อมูลต่างถูกยอมรับ "ในการพักครั้งนี้" หรือครั้งก่อน
  if (n > 1) sheet.getRange(2, 1, n - 1, 6).getValues().forEach(function(r) {
    var id = String(r[0]);
    if (BILL_ID_RE.test(id)) out[id] = { month: billIndexMonth_(r[1], ss), version: String(r[2]), total: Number(r[3]), kind: String(r[4]),
      acceptedAt: Number(r[5]) || 0 };
  });
  return out;
}
// voidedAt 0 = คำสั่งยกเลิกจากไฟล์สำรองรุ่นเก่าที่ไม่รู้เวลา — ยังนับเป็น "คำสั่งค้าง" (ไม่ใช่บิลที่หาย) แต่ไม่ลบให้ตอนย้าย
function transferVoidIntents_(list) {
  var out = Object.create(null);
  (Array.isArray(list) ? list : []).slice(0, TRANSFER_LIST_MAX_).forEach(function(x) {
    var id = x && readBillId_(x.id), at = x && Number(x.voidedAt);
    if (!(isFinite(at) && at >= 0 && at % 1 === 0)) at = 0;
    if (id && BILL_ID_RE.test(id)) out[id] = Math.max(out[id] || 0, at);
  });
  return out;
}
// บิลจากชีตที่เครื่องนี้ถืออยู่ (นำเข้าตอนปลดพักแบบยอมรับข้อมูลหาย) — ประกาศมาเพื่อให้ทะเบียนยอมรับนับว่า "ครบ"
// ต้องตรงกับแถวที่ยอมรับไว้ทั้งเดือน รุ่น และยอด จึงจะใช้แทนบิลเต็มได้ (ตรวจรอบ Claude รอบ 3 · ผู้ตรวจแยก #2)
function transferSheetOnly_(list) {
  var out = Object.create(null);
  (Array.isArray(list) ? list : []).slice(0, TRANSFER_DECLARED_MAX_).forEach(function(x) {
    var id = x && readBillId_(x.id);
    if (id && BILL_ID_RE.test(id)) out[id] = { month: String(x.month || ''), version: String(x.version || '').trim(), total: Number(x.total) };
  });
  return out;
}
// อ่านทะเบียนยกเลิกครั้งเดียวต่อคำขอย้ายเครื่อง (เดิมอ่าน property + แท็บ archive ทั้งแผ่น "ต่อบิล")
function registrySnapshot_(ss) {
  migrateVoidRegistryIfNeeded_();
  var props = PropertiesService.getScriptProperties().getProperties(), archive = null;
  return function(id) {
    if (archive === null) {
      archive = Object.create(null);
      if (ss.getSheetByName(VOID_ARCHIVE_NAME_)) {
        var sheet = ledgerSheet_(VOID_ARCHIVE_NAME_, ['id', 'voidedAt', 'restoredAt'], ss), n = sheet.getLastRow();
        if (n > 1) sheet.getRange(2, 1, n - 1, 3).getValues().forEach(function(r) {
          if (archive[String(r[0])]) throw registryCorrupt_('ทะเบียนยกเลิกถาวร (' + VOID_ARCHIVE_NAME_ + ') มีเลขบิลซ้ำ: ' + r[0], 'all');
          archive[String(r[0])] = r;
        });
      }
    }
    var a = archive[id] ? strictVoidEvent_({ v: archive[id][1], r: archive[id][2] }) : { v: 0, r: 0 };
    var raw = props[VOID_REG_PREFIX + id];
    if (raw === undefined || raw === null || raw === '') return a;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (pe) { throw registryCorrupt_('ทะเบียนยกเลิกของบิลนี้ (' + VOID_REG_PREFIX + id + ') อ่านไม่ได้', 'bill'); }
    var e = strictVoidEvent_(parsed);
    return strictVoidEvent_({ v: Math.max(a.v, e.v), r: Math.max(a.r, e.r) });
  };
}
function transferRowInfo_(id, month, r, hasVat, version, tz, note) {
  var num = function(v) { var n = Number(v); return (v === '' || v === null || !isFinite(n)) ? null : n; };
  var o = { id: id, month: month, version: version, when: cellText_(r[1], tz), customer: cellText_(r[2], tz),
    services: cellText_(r[3], tz), payment: cellText_(r[4], tz), subtotal: num(r[5]), discount: num(r[6]) };
  if (hasVat) {
    o.nonVatBase = num(r[7]); o.vatableBase = num(r[8]); o.vatAmount = num(r[9]); o.rounding = num(r[10]);
    o.total = num(r[11]); o.staff = cellText_(r[12], tz);
  } else { o.total = num(r[7]); o.staff = cellText_(r[8], tz); }
  // หมายเหตุเป็นข้อมูลภายใน แต่ต้องติดไปกับบิลที่รับกลับตอนย้ายเครื่องหลักด้วย
  if (note !== undefined && note !== null && String(note) !== '') o.billNote = String(note);
  return o;
}
// ยกเลิกบิลตามคำสั่งที่ค้างมากับไฟล์สำรอง — ขั้นตอนเดียวกับ handleVoidTransaction (ลงทะเบียนก่อน แล้วค่อยลบแถว)
function applyTransferVoid_(ss, plan) {
  var reg;
  try { reg = readBillRegistryStrict_(plan.id); }
  catch (e) {
    // ตรวจ 14 ต.ค. (รอบ 2): ทะเบียนเสีย = REGISTRY_CORRUPT พร้อมสาเหตุ · บริการล่ม = REGISTRY_UNAVAILABLE ตามเดิม
    if (e && e.registryCorrupt) return { ok: false, response: registryCorruptResponse_(e, plan.id, 'ยังไม่ย้ายเครื่องหลัก (เครื่องหลักยังเป็นเครื่องเดิม)') };
    return { ok: false, code: 'REGISTRY_UNAVAILABLE', message: 'อ่านทะเบียนยกเลิกของบิล ' + plan.id + ' ไม่ได้ — ยังไม่ย้ายเครื่อง' };
  }
  var last = billEventOf_(reg);
  if (last && last.type === 'restored' && !(plan.voidedAt > last.at)) return { ok: true, skipped: true };
  if (!markBillVoided_(plan.id, plan.voidedAt, reg)) return { ok: false, code: 'VOID_REGISTRY_FAILED', message: 'บันทึกการยกเลิกบิล ' + plan.id + ' ไม่สำเร็จ — ยังไม่ย้ายเครื่อง' };
  var sheet = ss.getSheetByName(plan.month);
  if (!sheet) return { ok: true };
  var rows = findBillRows_(sheet, plan.id);
  if (rows.length > 1) return { ok: false, code: 'DUPLICATE_BILL_ID', message: 'บิล ' + plan.id + ' มีหลายแถวบนชีต — ลบแถวที่ผิดก่อนย้ายเครื่อง' };
  if (rows.length === 1) sheet.deleteRow(rows[0]);
  return { ok: true };
}

// A new primary must carry every server bill with identical financial/customer/staff data.
// Full shift history still comes from the latest Drive backup; close the old primary before transfer.
// คืนรายการปัญหาทั้งหมด (สูงสุด TRANSFER_LIST_MAX_ ต่อชนิด) ไม่ใช่แค่ใบแรก — แอปใช้ทำบิลรอตรวจ/ยอมรับข้อมูลหาย
function validatePrimaryTransfer_(bills, opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet(), local = Object.create(null), sheets = ss.getSheets(), tz = spreadsheetTz_(ss);
  var intents = opts.voidIntents || Object.create(null), voidBefore = Number(opts.voidBefore) || 0;
  var declared = opts.sheetOnly || Object.create(null);
  // acceptedSince > 0 (ปลดพักฉุกเฉิน · ข้อ 10) = บิลข้อมูลต่างที่ยอมรับไว้ "ตั้งแต่เวลานี้" (การพักครั้งนี้) และแถวยังตรงกับตอนยอมรับ ไม่ต้องยอมรับซ้ำ
  var acceptedSince = Number(opts.acceptedSince) || 0;
  // counts.toAccept = จำนวนบิลที่ยังต้องให้เจ้าของยอมรับ (หายที่ยังไม่เคยยอมรับ + ข้อมูลต่าง) ทั้งหมด ไม่ใช่แค่ที่อยู่ในรายการ
  var res = { ok: false, structural: false, message: '', missing: [], different: [], voided: [], voidPlan: [], pendingVoid: [],
    counts: { missing: 0, different: 0, voided: 0, toAccept: 0 }, truncated: false, listTruncated: false };
  var fail = function(message) { res.structural = true; res.message = message; return res; };
  (Array.isArray(bills) ? bills : []).forEach(function(b) { if (b && b.id) local[String(b.id)] = b; });
  var index = ss.getSheetByName(BILL_INDEX_NAME_), indexedBills = Object.create(null);
  if (index && index.getLastRow() > 1) {
    var indexRows = index.getRange(2, 1, index.getLastRow() - 1, 5).getValues();
    for (var ir = 0; ir < indexRows.length; ir++) {
      // ข้อ 41 (ตรวจ 19 ต.ค. 2569): แถวที่ช่องเลขบิลว่าง (คนเคลียร์แถวในแท็บซ่อน) ไม่ใช่บิล — ข้ามแบบเดียวกับตอนอัปเกรดทะเบียน
      // เดิมแถวว่างสองแถวนับเป็น "เลขซ้ำ" แล้วโยน error ที่ไม่บอกเลขบิล (ย้ายเครื่อง/ปลดพักไม่ได้)
      var indexId = String(indexRows[ir][0] == null ? '' : indexRows[ir][0]).trim();
      if (!indexId) continue;
      if (indexedBills[indexId]) {
        // ซ้ำจริง = ตอบ REGISTRY_CORRUPT พร้อมเลขบิล (ผู้เรียกใช้ registryCorruptResponse_) — ไม่แตะชีต/เครื่องหลัก
        res.registryCorrupt = { error: registryCorrupt_('ทะเบียนเลขบิลมีเลขบิลซ้ำ: ' + indexId + ' (แถว ' + (ir + 2) + ')', 'bill'), id: indexId,
          what: BILL_INDEX_LABEL_ };
        return fail('ทะเบียนเลขบิลมีเลขบิล ' + indexId + ' ซ้ำ — ตรวจแท็บ ' + BILL_INDEX_NAME_ + ' ก่อนย้ายเครื่องหลัก');
      }
      indexedBills[indexId] = indexRows[ir];
    }
  }
  // ทะเบียนยอมรับข้อมูลหายใช้ "ให้ข้อยกเว้น" อย่างเดียว — อ่านเฉพาะเมื่อมีบิลขาด และถ้าอ่านไม่ได้ถือว่าว่าง (ไม่ยกเว้นใคร)
  // เดิมอ่านทุกครั้งและ throw → แท็บนี้ถูกแก้หัวคอลัมน์ = เครื่องที่ข้อมูลครบก็ย้ายเครื่องหลักไม่ได้ (ผู้ตรวจแยกรอบ 2 #3)
  var accepted = null, registry = null, seen = Object.create(null);
  var acceptedOf = function(id) {
    if (accepted === null) {
      try { accepted = readRecoveryAccepted_(ss); }
      catch (accErr) { accepted = Object.create(null); res.acceptedLedgerError = String((accErr && accErr.message) || accErr).slice(0, 200); }
    }
    return accepted[id];
  };
  var eventOf = function(id) { if (!registry) registry = registrySnapshot_(ss); return billEventOf_(registry(id)); };
  // ตรวจ 14 ต.ค. (รอบ 2): อ่านทะเบียนไม่ได้เพราะ "ข้อมูลเสีย" → ผู้เรียกตอบ REGISTRY_CORRUPT (บริการล่ม = ข้อความเดิม)
  var registryFail = function(err, id) {
    if (err && err.registryCorrupt) res.registryCorrupt = { error: err, id: id };
    return fail('อ่านทะเบียนยกเลิกของบิล ' + id + ' ไม่ได้ — ตรวจทะเบียนก่อนย้ายเครื่องหลัก');
  };
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i], name = sheet.getName();
    if (!isValidMonthKey_(name) || sheet.getLastRow() < 2) continue;
    var schema = billSheetSchema_(sheet);
    if (!schema) return fail("โครงแท็บบิล " + name + " ไม่ถูกต้อง — ตรวจชีตก่อนย้ายเครื่องหลัก");
    var hasVat = schema === 'vat', width = hasVat ? 13 : 9, revCol = billRevColumn_(sheet);
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    var versions = revCol > 0 ? sheet.getRange(2, revCol, sheet.getLastRow() - 1, 1).getDisplayValues() : null;
    var noteCol = billNoteColumn_(sheet);
    var notes = noteCol > 0 ? sheet.getRange(2, noteCol, rows.length, 1).getDisplayValues() : null;
    for (var j = 0; j < rows.length; j++) {
      var id = readBillId_(cellText_(rows[j][0]));
      if (!id || !BILL_ID_RE.test(id)) continue;   // แถวที่เจ้าของพิมพ์เอง (รวม/หมายเหตุ) ไม่ใช่บิล
      // เลขบิลเดียวมีหลายแถว = ชีตผิด ต้องให้เจ้าของลบแถวที่ผิดก่อน — เดิมแถวที่สองถูกนับเป็น "บิลที่หาย"
      // แล้วยอมรับข้อมูลหายได้ทั้งที่เครื่องถือบิลเต็มอยู่ (หลักฐานผิด + ย้ายเครื่องปกติไม่ได้อีกเลย · ผู้ตรวจแยกรอบ 2 #1)
      if (seen[id]) return fail('บิล ' + id + ' มีหลายแถวบนชีต (' + seen[id] + (seen[id] === name ? '' : ', ' + name) +
        ') — ลบแถวที่ผิดก่อนย้ายเครื่องหลักหรือปลดพัก (ดูหน้าตรวจความตรงกันกับชีต)');
      seen[id] = name;
      var version = versions ? String(versions[j][0] || '').trim() : '';
      var sheetTotal = Number(rows[j][hasVat ? 11 : 7]);
      var b = local[id];
      // ทะเบียนยอมรับข้อมูลหาย ใช้แทนบิลเต็มได้เฉพาะ "บิลที่หาย" ที่แถวยังตรงกับตอนยอมรับ และเครื่องนี้ประกาศว่าถือบิลจากชีตของมันอยู่
      // (เดิมยกเว้นทุกเครื่อง — เครื่องที่กู้ไฟล์เก่าไม่มีบิลกลุ่มนี้ก็ย้ายผ่าน แล้วสรุปขาด · บิล "ข้อมูลต่าง" ไม่เคยยกเว้น)
      var acc = b ? null : acceptedOf(id);
      var accMatches = !!acc && acc.kind === 'missing' && acc.month === name && acc.version === version && acc.total === sheetTotal;
      var dec = declared[id];
      if (!b && accMatches && dec && dec.month === name && dec.version === version && dec.total === sheetTotal) { delete declared[id]; continue; }
      if (!b) {
        if (Object.prototype.hasOwnProperty.call(intents, id)) {
          var intentAt = intents[id];
          if (intentAt > 0 && intentAt < voidBefore) {
            var ev;
            try { ev = eventOf(id); } catch (regErr) { return registryFail(regErr, id); }
            if (!(ev && ev.type === 'restored' && ev.at >= intentAt)) { res.voidPlan.push({ id: id, month: name, voidedAt: intentAt }); continue; }
          } else {
            // คำสั่งยกเลิกที่สั่งหลังเริ่มพัก / เวลาเครื่องเดินเร็ว / ไฟล์รุ่นเก่าไม่รู้เวลา — ไม่ลบให้ตอนนี้ (นโยบาย D5)
            // แต่ก็ไม่ใช่ "บิลที่หาย" (เดิมนับเป็นหาย แล้วถูกนำเข้าเป็นบิลจากชีต ยอดเกิน) · คิวในเครื่องส่งต่อหลังย้ายสำเร็จ
            if (res.pendingVoid.length < TRANSFER_LIST_MAX_) res.pendingVoid.push({ id: id, month: name, version: version, total: sheetTotal });
            res.counts.pendingVoid = (res.counts.pendingVoid || 0) + 1;
            continue;
          }
        }
        res.counts.missing++;
        if (!accMatches) res.counts.toAccept++;
        if (res.missing.length < TRANSFER_LIST_MAX_) {
          var mi = transferRowInfo_(id, name, rows[j], hasVat, version, tz, notes ? notes[j][0] : ''); mi.kind = 'missing';
          if (accMatches) mi.accepted = true;
          res.missing.push(mi);
        }
        continue;
      }
      var v = validateBillPayload_(b);
      if (!v.ok || (v.monthKey !== name && !legacyBillMonthMatches_(name, v.monthKey, rows[j][1], tz))) return fail("ข้อมูลบิล " + id + " ในเครื่องใหม่ไม่พร้อมย้าย");
      var localNote = readBillNote_(b);
      if (localNote.given && noteCol < 0) return fail('หัวคอลัมน์ "' + BILL_NOTE_HEADER + '" ในแท็บ ' + name + ' ซ้ำกัน — ตรวจชีตก่อนย้ายเครื่องหลัก');
      var row = [safeCell(id), v.dateTimeStr, safeCell(b.customerName), safeCell((b.services || []).join(', ')), payLabelFor_(b.paymentMethod, v.payments), v.subtotal, v.discount];
      if (hasVat) row = row.concat([v.nonVatBase, v.vatableBase, v.vatAmount, v.rounding]);
      row = row.concat([v.total, safeCell((b.staffNames || []).join(', '))]);
      var indexed = indexedBills[id], reason = '';
      if (billRowChanges_(rows[j], row, hasVat).length) reason = 'row';
      else if (indexed && /^[a-f0-9]{64}$/.test(String(indexed[3])) && String(indexed[3]) !== canonicalBillHash_(b, v)) reason = 'detail';
      else if (billNoteChanges_(notes ? notes[j][0] : '', localNote).length) reason = 'note';
      if (reason && acceptedSince > 0) {
        // ข้อ 10: ยอมรับไว้แล้วในรอบก่อนของการพักครั้งนี้ (แถวบนชีตไม่เปลี่ยนตั้งแต่ตอนนั้น — ระหว่างพักแก้บิลเดิมไม่ได้อยู่แล้ว)
        var accD = acceptedOf(id);
        if (accD && /^different/.test(accD.kind) && accD.month === name && accD.version === version && accD.total === sheetTotal &&
            accD.acceptedAt >= acceptedSince) {
          res.counts.acceptedEarlier = (res.counts.acceptedEarlier || 0) + 1;
          reason = '';
        }
      }
      if (reason) {
        res.counts.different++;
        res.counts.toAccept++;
        if (res.different.length < TRANSFER_LIST_MAX_) { var di = transferRowInfo_(id, name, rows[j], hasVat, version, tz, notes ? notes[j][0] : ''); di.kind = 'different:' + reason; di.reason = reason; res.different.push(di); }
      }
      delete local[id]; // Duplicate server IDs cannot be covered by one local bill.
    }
  }
  var extras = Object.keys(local);
  for (var k = 0; k < extras.length; k++) {
    var event;
    try { event = eventOf(extras[k]); } catch (regErr2) { return registryFail(regErr2, extras[k]); }
    // เจ้าของเลือก "คืนบิลนี้ขึ้นชีต" แล้ว (restoredAt ใหม่กว่าการยกเลิก) = เจตนาคืนบิล ไม่ใช่ปัญหาของการย้าย
    // ต้องเป็นการเลือกของเจ้าของเท่านั้น (restoreConfirmed) — ไม่ใช่ทุกบิลที่มาจากการกู้ไฟล์ซึ่ง restoredAt = เวลาสร้างไฟล์
    // (ตรวจรอบ Claude รอบ 3 · ผู้ตรวจแยก #3: บิลรอตรวจที่ค้างในไฟล์สำรองกลับขึ้นชีตเองได้)
    var lb = local[extras[k]];
    if (event && event.type === 'voided' && !(lb && lb.restoreConfirmed === true && Number(lb.restoredAt) > event.at)) {
      res.counts.voided++;
      if (res.voided.length < TRANSFER_LIST_MAX_) res.voided.push({ id: extras[k], voidedAt: event.at });
    }
  }
  res.truncated = res.counts.missing > res.missing.length || res.counts.different > res.different.length || res.counts.voided > res.voided.length ||
    (res.counts.pendingVoid || 0) > res.pendingVoid.length;
  // รายการ "ที่ต้องยอมรับ" ถูกตัด (ข้อ 10) — ยอมรับเป็นรอบได้ · บิลยกเลิก/คำสั่งยกเลิกค้างที่ถูกตัด ไม่นับตรงนี้
  res.listTruncated = res.counts.missing > res.missing.length || res.counts.different > res.different.length;
  var more = function(n) { return n > 1 ? ' (รวม ' + n + ' ใบ)' : ''; };
  if (res.counts.missing) res.message = "เครื่องใหม่ขาดบิล " + res.missing[0].id + more(res.counts.missing) + " — ซิงก์และสำรองเครื่องเดิม กู้ไฟล์ล่าสุด แล้วตรวจความตรงกันก่อนย้าย";
  else if (res.counts.different) res.message = (res.different[0].reason === 'detail' ? 'รายละเอียดบิล ' + res.different[0].id + ' ต่างจากเครื่องเดิม' : "บิล " + res.different[0].id + " ต่างจากชีต") +
    more(res.counts.different) + ' — ตรวจความตรงกันและกู้ข้อมูลล่าสุดก่อนย้าย';
  else if (res.counts.voided) res.message = 'บิล ' + res.voided[0].id + more(res.counts.voided) + ' ถูกยกเลิกบนชีต — ตรวจในกล่องบิลรอตรวจก่อนย้ายหรือปลดการพัก';
  res.ok = !res.counts.missing && !res.counts.different && !res.counts.voided;
  return res;
}

// ─────────────────────────────────────────────
//  BACKUP — สำรองข้อมูลเข้าระบบ Google Drive
// ─────────────────────────────────────────────
// ── กติกาโครงไฟล์สำรอง — ต้องตรงกับ isValidBackupObject() ใน app.js ทุกข้อ ─────────
// ⚠️ เดิมฝั่งนี้รับอะไรก็ได้แล้วเขียนลง Drive ตอบ success ไป แต่ตอนกู้ แอปปฏิเสธทั้งไฟล์
// = เจ้าของคิดว่ามีไฟล์สำรอง แต่วันที่ต้องใช้จริงกลับกู้ไม่ได้ (และไฟล์ดีรุ่นก่อนถูกลบตามอายุไปแล้ว)
// ตอนนี้: ไฟล์ที่กู้กลับไม่ได้ ไม่ถูกนับว่าสำรองสำเร็จตั้งแต่ต้น
var BACKUP_SCHEMA_VERSION_MAX = 3;   // = BACKUP_SCHEMA_VERSION ใน app.js (ไฟล์รุ่นใหม่กว่านี้แอปอ่านไม่เข้าใจ)
// retention: เก็บไฟล์สำรองล่าสุดอย่างน้อยเท่านี้ไว้เสมอ แม้จะเก่ากว่า BACKUP_RETENTION_DAYS
// กันกรณีร้านหยุดยาวแล้วกลับมาสำรองจากเครื่องที่ข้อมูลเสีย — ไฟล์ดีรุ่นก่อนจะไม่ถูกลบทิ้งหมดในรอบเดียว
var BACKUP_MIN_KEEP = 10;
var SAFE_ENTITY_ID_RE_ = /^[A-Za-z0-9_-]{1,64}$/;

function isSafeEntityId_(v) {
  if (typeof v === "number") return isFinite(v) && SAFE_ENTITY_ID_RE_.test(String(v));
  return typeof v === "string" && SAFE_ENTITY_ID_RE_.test(v);
}

// คืน "" = ผ่าน · ไม่ผ่าน = เหตุผลที่อ่านรู้เรื่อง
function validateBackupStructure_(p) {
  var isObj = function (v) { return !!v && typeof v === "object" && !Array.isArray(v); };
  var objArr = function (a, max) {
    if (!Array.isArray(a) || a.length > max) return false;
    for (var i = 0; i < a.length; i++) if (!isObj(a[i])) return false;
    return true;
  };
  if (!isObj(p)) return "ไม่ใช่ข้อมูลสำรองของ POS";
  if (p.backupSchemaVersion !== undefined) {
    var v = p.backupSchemaVersion;
    if (typeof v !== "number" || v % 1 !== 0 || v < 1 || v > BACKUP_SCHEMA_VERSION_MAX)
      return "รุ่นของไฟล์สำรองไม่รองรับ (" + String(v) + ")";
  }
  if (!objArr(p.services, 10000)) return "รายการบริการในไฟล์มีรูปแบบไม่ถูกต้อง";
  if (!objArr(p.staff, 2000)) return "รายชื่อพนักงานในไฟล์มีรูปแบบไม่ถูกต้อง";
  if (!objArr(p.transactions, 200000)) return "รายการบิลในไฟล์มีรูปแบบไม่ถูกต้อง";
  var opt = [["categories", 10000], ["customers", 100000], ["queue", 10000],
             ["voidLog", 100000], ["expenseLog", 100000], ["editLog", 100000], ["quarantine", 100000]];
  for (var i = 0; i < opt.length; i++) {
    if (p[opt[i][0]] !== undefined && !objArr(p[opt[i][0]], opt[i][1])) return "ส่วน " + opt[i][0] + " ในไฟล์มีรูปแบบไม่ถูกต้อง";
  }
  if (p.shift !== undefined && !isObj(p.shift)) return "ข้อมูลกะในไฟล์มีรูปแบบไม่ถูกต้อง";
  if (p.pendingCloudWork !== undefined) {
    var pcw = p.pendingCloudWork;
    if (!isObj(pcw)) return "งานคลาวด์ค้างในไฟล์มีรูปแบบไม่ถูกต้อง";
    var lk = [["voidDeletes", 100000], ["summaryDateKeys", 10000], ["summaryMonthKeys", 1000]];
    for (var j = 0; j < lk.length; j++) {
      if (pcw[lk[j][0]] === undefined) continue;
      if (!Array.isArray(pcw[lk[j][0]]) || pcw[lk[j][0]].length > lk[j][1]) return "งานคลาวด์ค้าง \"" + lk[j][0] + "\" ในไฟล์มีรูปแบบไม่ถูกต้อง";
    }
    if (Array.isArray(pcw.voidDeletes) && !objArr(pcw.voidDeletes, 100000)) return "รายการบิลที่รอลบในไฟล์มีรูปแบบไม่ถูกต้อง";
  }
  var idLists = ["categories", "services", "staff", "customers", "queue"];
  for (var k = 0; k < idLists.length; k++) {
    var list = p[idLists[k]];
    if (!Array.isArray(list)) continue;
    for (var m = 0; m < list.length; m++) {
      if (!isSafeEntityId_(list[m].id)) return "รายการ \"" + idLists[k] + "\" มีรหัส (ID) ผิดรูปแบบ: " + String(list[m].id).slice(0, 40);
    }
  }
  for (var n = 0; n < p.services.length; n++) {
    var c = p.services[n].category;
    if (c !== undefined && c !== null && c !== "" && !isSafeEntityId_(c)) return "หมวดของบริการมีรหัส (ID) ผิดรูปแบบ: " + String(c).slice(0, 40);
  }
  return "";
}

// อ่านไฟล์ที่เพิ่งเขียนกลับมาตรวจ: อ่านได้ · เป็น JSON · โครงผ่านกติกาเดียวกับตอนกู้ · เนื้อหาตรงกับที่ส่งมาทุกตัวอักษร
// คืน "" = ผ่าน
function verifyBackupFile_(file, expectedCompact) {
  var text;
  try { text = file.getBlob().getDataAsString("UTF-8"); }
  catch (e) { return "อ่านไฟล์ที่เพิ่งเขียนกลับไม่ได้ (" + e + ")"; }
  var back;
  try { back = JSON.parse(text); }
  catch (e2) { return "ไฟล์ที่เพิ่งเขียนอ่านเป็น JSON ไม่ได้ (ไฟล์อาจถูกตัดกลางทาง)"; }
  var why = validateBackupStructure_(back);
  if (why) return why;
  if (JSON.stringify(back) !== expectedCompact) return "เนื้อไฟล์ที่อ่านกลับไม่ตรงกับข้อมูลที่ส่งมา";
  return "";
}

// Folder.getFiles() ของ Drive คืนไฟล์ที่อยู่ในถังขยะมาด้วย — ต้องกรองเองทุกจุดที่วนไฟล์สำรอง
function isTrashedFile_(f) {
  try { return typeof f.isTrashed === "function" && f.isTrashed() === true; } catch (e) { return false; }
}

// ลบไฟล์สำรองเก่าเกินอายุ — เรียกได้ "หลังจากไฟล์ใหม่ตรวจผ่านแล้ว" เท่านั้น
// และเก็บไฟล์ล่าสุด BACKUP_MIN_KEEP ไฟล์ไว้เสมอ (รวมไฟล์ที่เพิ่งสร้าง) ไม่ว่าจะเก่าแค่ไหน
function cleanupOldBackups_(folder, keepFileId) {
  var out = { trashed: 0 };
  if (!(BACKUP_RETENTION_DAYS > 0)) return out;
  var cutoffMs = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var list = [];
  var it = folder.getFilesByType(MimeType.PLAIN_TEXT);
  while (it.hasNext()) {
    var f = it.next();
    if (isTrashedFile_(f)) continue;   // ไฟล์ในถังขยะห้ามนับเป็น "ไฟล์ล่าสุดที่ต้องเก็บไว้"
    if (f.getName().indexOf(BACKUP_FILE_PREFIX) === 0) list.push(f);
  }
  list.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  for (var i = BACKUP_MIN_KEEP; i < list.length; i++) {
    if (list[i].getId() === keepFileId) continue;
    if (list[i].getDateCreated().getTime() < cutoffMs) {
      try { list[i].setTrashed(true); out.trashed++; } catch (e2) {}
    }
  }
  return out;
}

// ── เพดานขนาดไฟล์สำรอง (ข้อ 2 · ตรวจ 19 ต.ค. 2569) ─────────────────────────────────────────────
// เดิมเขียนแบบจัดหน้า (ใหญ่ขึ้น ~1.5 เท่า) ด้วย createFile(ชื่อ, ข้อความ, ชนิด) ซึ่งคู่มือ Google ระบุว่ารับไม่เกิน 10 MB
// → การสำรองล้มทุกครั้งเมื่อบิลถึงราว 5,000 ใบ · ตอนนี้เขียน JSON แบบไม่จัดหน้าผ่าน blob (Drive รับ blob ได้ 50 MB)
// ไฟล์เก่าแบบจัดหน้ายังกู้ได้ตามเดิม (ตัวอ่านใช้ JSON.parse ซึ่งไม่สนช่องว่าง) · ชนิดไฟล์ยังเป็น text/plain (ตัวลบไฟล์เก่าค้นจากชนิดนี้)
// เพดานที่ใช้จริง = ค่าที่น้อยกว่าระหว่างเพดาน blob ของ Drive กับเพดานขนาดคำขอ (MAX_POST_BYTES_) — ไฟล์สำรองมากับคำขอ
// แอปใช้ details.limitBytes เตือนเจ้าของล่วงหน้า (ไม่มีค่านี้ = Apps Script รุ่นก่อน)
var BACKUP_BLOB_LIMIT_BYTES_ = 50 * 1024 * 1024;
function backupLimitBytes_() { return Math.min(BACKUP_BLOB_LIMIT_BYTES_, MAX_POST_BYTES_); }
// จำนวนไบต์ UTF-8 ของข้อความ (ภาษาไทย 1 ตัว = 3 ไบต์) — ไม่สร้างสำเนาข้อความ/ไบต์ทั้งก้อน
function utf8ByteLength_(str) {
  var s = String(str == null ? "" : str), n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

function handleBackup(data, ss) {
  var backup = data ? data.backupData : undefined;
  var why = validateBackupStructure_(backup);
  if (why) {
    return json("error", "ไม่รับไฟล์สำรองนี้ เพราะกู้กลับไม่ได้: " + why, null, "BACKUP_INVALID");
  }
  var folder, file, fileName;
  var expectedCompact = JSON.stringify(backup);
  var sizeBytes = utf8ByteLength_(expectedCompact), limitBytes = backupLimitBytes_();
  if (sizeBytes > BACKUP_BLOB_LIMIT_BYTES_) {
    // ไม่ส่งให้ Drive โยนข้อความภาษาอังกฤษ — บอกเจ้าของตรง ๆ ว่าใหญ่เกินและต้องทำอะไร (รหัสเดิม: แอปทุกรุ่นเก็บงานไว้ลองใหม่)
    return json("error", "ไฟล์สำรองใหญ่เกินที่ Google Drive รับได้ (" + (sizeBytes / 1048576).toFixed(1) + " MB จากเพดาน " +
      Math.round(BACKUP_BLOB_LIMIT_BYTES_ / 1048576) + " MB) — การสำรองขึ้น Drive หยุดแล้ว ให้เจ้าของดาวน์โหลดไฟล์สำรองเก็บไว้ในเครื่อง " +
      "และวางแผนเก็บบิลเก่าออกจากเครื่อง", { sizeBytes: sizeBytes, limitBytes: limitBytes, tooLarge: true }, "BACKUP_WRITE_FAILED");
  }
  try {
    folder = getBackupFolder_(true);
    var timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    fileName = BACKUP_FILE_PREFIX + timeStamp + ".json";
    file = folder.createFile(Utilities.newBlob(expectedCompact, MimeType.PLAIN_TEXT, fileName));
  } catch (err) {
    var code = (err && (err.code === "BACKUP_FOLDER_TRASHED" || err.code === "BACKUP_FOLDER_MISSING")) ? err.code : "BACKUP_WRITE_FAILED";
    return json("error", "การสำรองข้อมูลล้มเหลว: " + (err && err.message ? err.message : String(err)),
      code === "BACKUP_WRITE_FAILED" ? { sizeBytes: sizeBytes, limitBytes: limitBytes } : null, code);
  }

  // ── ตรวจไฟล์ใหม่ก่อนถือว่าสำเร็จ ─────────────────────────────────────────
  var verifyWhy = verifyBackupFile_(file, expectedCompact);
  if (verifyWhy) {
    // ไฟล์ที่ตรวจไม่ผ่านห้ามค้างในโฟลเดอร์ — ไม่งั้นหน้ากู้ข้อมูลจะโชว์เป็น "ไฟล์ล่าสุด" ให้คนเลือก
    try { file.setTrashed(true); } catch (e3) {}
    return json("error", "เขียนไฟล์สำรองแล้วแต่อ่านกลับตรวจไม่ผ่าน จึงไม่นับว่าสำรองสำเร็จ: " + verifyWhy,
      null, "BACKUP_VERIFY_FAILED");
  }

  // ── ลบไฟล์เก่า "หลัง" ไฟล์ใหม่ตรวจผ่านแล้วเท่านั้น ────────────────────────
  // ลบไม่สำเร็จไม่ทำให้การสำรองล้มเหลว (ไฟล์ใหม่ปลอดภัยแล้ว) แค่รายงานกลับไป
  var cleanup = { trashed: 0 }, cleanupError = "";
  try { cleanup = cleanupOldBackups_(folder, file.getId()); }
  catch (e4) { cleanupError = e4.toString(); }

  return json("success", "สำรองข้อมูลเรียบร้อยแล้วที่ Google Drive (อ่านกลับตรวจแล้ว)", {
    fileId: file.getId(),
    fileName: fileName,
    folderName: BACKUP_FOLDER_NAME,
    verified: true,
    txCount: backup.transactions.length,
    bytes: expectedCompact.length,
    trashedOld: cleanup.trashed,
    cleanupError: cleanupError,
    sizeBytes: sizeBytes,          // ไบต์จริงของไฟล์ (UTF-8) — ข้อ 2
    limitBytes: limitBytes         // เพดานที่ใช้จริง — แอปเตือนก่อนถึง
  });
}


// หาโฟลเดอร์สำรองใน Drive โดยจำ Folder ID ไว้ใน Script Properties
// Google Drive อนุญาตชื่อซ้ำ จึงห้ามหยิบ "ตัวแรก" แบบเดา เพราะอาจอ่าน/เขียนคนละโฟลเดอร์
function getBackupFolder_(createIfMissing) {
  var props = PropertiesService.getScriptProperties();
  var savedId = String(props.getProperty(POS_BACKUP_FOLDER_ID_PROPERTY) || "");
  if (savedId) {
    var saved;
    try {
      saved = DriveApp.getFolderById(savedId);
    } catch (err) {
      // ข้อ 40 (ตรวจ 19 ต.ค. 2569): โฟลเดอร์ถูกลบถาวร (ล้างถังขยะ/ครบ 30 วัน) — Drive ตอบ "No item with the given ID could be found"
      // เดิมได้ข้อความกว้าง ๆ ทุกครั้งตลอดไป และฟังก์ชันแก้ต้องใส่ค่า (กด Run ในตัวแก้ไขไม่ได้) → บอกวิธีแก้ที่กดได้จริง
      if (/no item with the given id|not found|ไม่พบ/i.test(String(err && err.message || err))) {
        var gone = new Error("โฟลเดอร์สำรองที่ตั้งไว้ถูกลบถาวรจาก Google Drive แล้ว (หาไม่เจอ) — ให้เจ้าของเปิด Apps Script " +
          "เลือกฟังก์ชัน resetPosBackupFolder แล้วกด Run 1 ครั้ง การสำรองครั้งถัดไปจะสร้างโฟลเดอร์ใหม่ให้เอง");
        gone.code = "BACKUP_FOLDER_MISSING";
        throw gone;
      }
      // A transient Drive failure must never silently redirect the backup destination.
      throw new Error("เปิดโฟลเดอร์สำรองที่ตั้งไว้ไม่ได้ — ลองใหม่ หรือตรวจสิทธิ์/ตั้ง Folder ID โดยเจ้าของ: " + err);
    }
    return assertBackupFolderNotTrashed_(saved);
  }

  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  var matches = [], trashed = [];
  // getFoldersByName คืนโฟลเดอร์ในถังขยะมาด้วย — แยกออกก่อนนับ (ผู้ตรวจอิสระ: ทิ้งอันเก่าแล้วสร้างอันใหม่ชื่อเดิม
  // เดิมนับเป็น "มีมากกว่า 1 โฟลเดอร์" ทั้งที่เจ้าของเห็นอันเดียว) · เหลือแต่อันในถังขยะ = BACKUP_FOLDER_TRASHED (ตรวจหมวด D ข้อ 5)
  while (folders.hasNext()) { var fd = folders.next(); (isTrashedFile_(fd) ? trashed : matches).push(fd); }
  if (!matches.length && trashed.length) assertBackupFolderNotTrashed_(trashed[0]);
  if (matches.length > 1) {
    throw new Error("พบโฟลเดอร์สำรองชื่อ " + BACKUP_FOLDER_NAME + " มากกว่า 1 โฟลเดอร์ — กรุณาตั้งค่า Folder ID ที่ถูกต้องใน Script Properties ชื่อ " + POS_BACKUP_FOLDER_ID_PROPERTY);
  }

  var folder = matches.length === 1 ? matches[0] : null;
  if (!folder && createIfMissing) folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  if (folder) props.setProperty(POS_BACKUP_FOLDER_ID_PROPERTY, folder.getId());
  return folder;
}

// โฟลเดอร์สำรองอยู่ในถังขยะ = ห้ามเขียน/อ่านต่อเงียบ ๆ (เจ้าของตัดสิน 8 ต.ค. 2569 · ตรวจหมวด D ข้อ 5)
// เดิม: backup เขียนไฟล์ลงโฟลเดอร์ในถังขยะแล้วตอบ "สำเร็จ" · list_backups ว่าง (ไฟล์ข้างในนับว่าอยู่ในถังขยะ)
//       และทุกไฟล์หายถาวรเมื่อถังขยะถูกล้าง (30 วัน) — ไม่มีใครรู้จนวันที่ต้องกู้
// ตอนนี้: โยน error ที่บอกวิธีแก้ (กู้โฟลเดอร์คืนจากถังขยะ) · handleBackup ตอบ code BACKUP_FOLDER_TRASHED
//       แอปเก็บงานไว้ลองใหม่ตามปกติ — กู้โฟลเดอร์คืนแล้วรอบถัดไปผ่านเอง ไม่ต้องตั้งค่าอะไรใหม่
function assertBackupFolderNotTrashed_(folder) {
  if (folder && isTrashedFile_(folder)) {
    var e = new Error("โฟลเดอร์สำรอง \"" + folder.getName() + "\" อยู่ในถังขยะของ Google Drive — " +
      "กู้คืนโฟลเดอร์จากถังขยะก่อน แล้วสำรองใหม่ (ไฟล์สำรองในถังขยะจะหายถาวรเมื่อถังขยะถูกล้าง)");
    e.code = "BACKUP_FOLDER_TRASHED";
    throw e;
  }
  return folder;
}

// ข้อ 40: โฟลเดอร์สำรองถูกลบถาวร (การสำรองตอบ BACKUP_FOLDER_MISSING) — เลือกฟังก์ชันนี้ในตัวแก้ไขแล้วกด Run 1 ครั้ง (ไม่ต้องใส่ค่า)
// ล้าง POS_BACKUP_FOLDER_ID → การสำรองครั้งถัดไปหาโฟลเดอร์ชื่อ Erotica_POS_Backups หรือสร้างใหม่ให้เอง
// โฟลเดอร์เดิมยังเปิดได้และไม่อยู่ในถังขยะ = ไม่ล้าง (กันกดผิด — ไฟล์สำรองเดิมยังอยู่ที่นั่น)
function resetPosBackupFolder() {
  var props = PropertiesService.getScriptProperties();
  var savedId = String(props.getProperty(POS_BACKUP_FOLDER_ID_PROPERTY) || "");
  var msg;
  if (!savedId) {
    msg = "ยังไม่ได้จำโฟลเดอร์สำรองไว้ — การสำรองครั้งถัดไปจะหา/สร้างโฟลเดอร์ " + BACKUP_FOLDER_NAME + " ให้เอง";
  } else {
    var still = null;
    try { still = DriveApp.getFolderById(savedId); } catch (e) { still = null; }
    if (still && !isTrashedFile_(still)) {
      msg = "โฟลเดอร์สำรองเดิม \"" + still.getName() + "\" ยังใช้ได้ — ไม่ได้เปลี่ยนอะไร";
    } else {
      props.deleteProperty(POS_BACKUP_FOLDER_ID_PROPERTY);
      msg = still ? "ล้างค่าโฟลเดอร์สำรองแล้ว (โฟลเดอร์เดิมอยู่ในถังขยะ — ถ้ายังต้องการไฟล์เดิม ให้กู้โฟลเดอร์คืนจากถังขยะก่อนสำรองครั้งถัดไป)"
        : "ล้างค่าโฟลเดอร์สำรองแล้ว — การสำรองครั้งถัดไปจะสร้างโฟลเดอร์ " + BACKUP_FOLDER_NAME + " ใหม่ให้เอง";
    }
  }
  Logger.log(msg);
  return msg;
}

// ใช้เฉพาะตอนมีโฟลเดอร์ชื่อซ้ำ: คัดลอก Folder ID จาก URL ของโฟลเดอร์ที่ถูกต้อง แล้วรันฟังก์ชันนี้ 1 ครั้ง
function setPosBackupFolderId(folderId) {
  var id = String(folderId || "").trim();
  if (!id) throw new Error("กรุณาระบุ Folder ID");
  var folder = DriveApp.getFolderById(id); // ตรวจสิทธิ์และความมีอยู่ก่อนบันทึก
  assertBackupFolderNotTrashed_(folder);     // ห้ามตั้งโฟลเดอร์ที่อยู่ในถังขยะ (ตรวจหมวด D ข้อ 5)
  PropertiesService.getScriptProperties().setProperty(POS_BACKUP_FOLDER_ID_PROPERTY, folder.getId());
  return "ตั้งค่าโฟลเดอร์สำรองแล้ว: " + folder.getName();
}

// ─────────────────────────────────────────────
//  LIST BACKUPS — รายชื่อไฟล์สำรองใน Drive (ใหม่สุดอยู่บน)
//  ส่งกลับแค่ metadata ไม่ส่งเนื้อไฟล์ เพื่อให้หน้ารายการโหลดเร็วแม้มีไฟล์เยอะ
// ─────────────────────────────────────────────
function handleListBackups(data) {
  try {
    var folder = getBackupFolder_(false);
    if (!folder) return json("success", "ยังไม่มีโฟลเดอร์สำรองใน Google Drive", { files: [] });

    var it = folder.getFiles();
    var arr = [];
    while (it.hasNext()) {
      var f = it.next();
      if (isTrashedFile_(f)) continue;   // ไฟล์ที่ถูกทิ้ง (เช่นเขียนแล้วตรวจไม่ผ่าน) ห้ามโผล่เป็นตัวเลือกกู้
      if (f.getName().indexOf(BACKUP_FILE_PREFIX) !== 0) continue;
      arr.push({
        id: f.getId(),
        name: f.getName(),
        created: f.getDateCreated().toISOString(),
        sizeKB: Math.round(f.getSize() / 1024)
      });
    }
    // เรียงใหม่สุดขึ้นก่อน — คนกู้ข้อมูลตอนฉุกเฉินอยากได้ไฟล์ล่าสุดเป็นอันดับแรก
    arr.sort(function (a, b) { return a.created < b.created ? 1 : (a.created > b.created ? -1 : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))); });
    // ส่ง metadata ครั้งละ 200 ไฟล์ ไม่อ่าน blob; เลือกกู้ได้ครบโดยไม่ต้องส่งรายการทั้งหมดในคำตอบเดียว
    var offset = Number(data && data.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return json('error', 'ตำแหน่งรายการไฟล์ไม่ถูกต้อง', null, 'INVALID_OFFSET');
    var total = arr.length, page = arr.slice(offset, offset + 200);
    return json("success", "พบไฟล์สำรอง " + total + " ไฟล์", {
      files: page, total: total, nextOffset: offset + page.length < total ? offset + page.length : null
    });
  } catch (err) {
    return json("error", "อ่านรายการไฟล์สำรองไม่สำเร็จ: " + err.toString(), null, (err && err.code) || undefined);
  }
}

// ─────────────────────────────────────────────
//  GET BACKUP — อ่านเนื้อไฟล์สำรอง 1 ไฟล์ ส่งกลับให้แอปเขียนลงเครื่อง
// ─────────────────────────────────────────────
function handleGetBackup(data) {
  try {
    var fileId = String(data.fileId || "").trim();
    if (!fileId) return json("error", "ไม่ได้ระบุไฟล์ที่จะกู้คืน");

    var folder = getBackupFolder_(false);
    if (!folder) return json("error", "ไม่พบโฟลเดอร์ " + BACKUP_FOLDER_NAME + " ใน Google Drive");

    // ⚠️ ความปลอดภัย: ต้องยืนยันว่า fileId นี้อยู่ใน "โฟลเดอร์สำรอง" จริง
    // ถ้าเปิด DriveApp.getFileById(fileId) ตรง ๆ คนที่ได้ URL + secret ไป
    // จะอ่านไฟล์อะไรก็ได้ใน Google Drive ของเจ้าของบัญชี ไม่ใช่แค่ไฟล์ POS
    var file = null;
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getId() === fileId && !isTrashedFile_(f)) { file = f; break; }
    }
    if (!file) return json("error", "ไม่พบไฟล์นี้ในโฟลเดอร์สำรอง (อาจถูกลบไปแล้ว)");
    if (file.getName().indexOf(BACKUP_FILE_PREFIX) !== 0)
      return json("error", "ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบ POS");

    var parsed;
    try {
      parsed = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    } catch (e2) {
      return json("error", "ไฟล์สำรองเสียหาย อ่านเป็น JSON ไม่ได้ — ลองเลือกไฟล์ที่เก่ากว่านี้");
    }
    // กันไฟล์ที่ parse ผ่านแต่ไม่ใช่โครงสร้างของเรา (เช่นไฟล์ทดสอบที่คนเผลอวางไว้)
    if (!parsed || typeof parsed !== "object" || !parsed.transactions)
      return json("error", "ไฟล์นี้ไม่ใช่ข้อมูลสำรองของ POS (ไม่พบรายการบิล)");
    // ตรวจด้วยกติกาเดียวกับที่แอปใช้ตอนกู้ — บอกเหตุผลตั้งแต่ตรงนี้ ดีกว่าให้ดาวน์โหลดทั้งก้อนแล้วไปถูกปฏิเสธที่เครื่อง
    var badWhy = validateBackupStructure_(parsed);
    if (badWhy) return json("error", "ไฟล์สำรองนี้กู้ไม่ได้: " + badWhy + " — ลองเลือกไฟล์อื่น", null, "BACKUP_INVALID");

    return json("success", "อ่านไฟล์สำรองสำเร็จ", {
      fileName: file.getName(),
      created: file.getDateCreated().toISOString(),
      backupData: parsed
    });
  } catch (err) {
    return json("error", "กู้คืนข้อมูลไม่สำเร็จ: " + err.toString(), null, (err && err.code) || undefined);
  }
}

// ─────────────────────────────────────────────
//  1. TRANSACTION — บันทึกบิลรายการ
// ─────────────────────────────────────────────
// ── แท็บบิลนี้เป็นโครง 13 คอลัมน์ (มีช่อง VAT) แล้วหรือยัง ────────────────
// เทียบตำแหน่งต่อตำแหน่งกับ BILL_HEADERS ไม่ใช่แค่ "มีคำนี้อยู่ที่ไหนสักที่"
// เพราะถ้าลำดับเพี้ยน การเขียนแถว 13 ช่องลงไปจะทับข้อมูลผิดช่องทั้งแถว
// ── แท็บบิลนี้เป็นโครงสร้างอะไร: 'vat' (13 คอลัมน์) · 'legacy' (9 คอลัมน์) · null (ไม่รู้จัก) ──
//
// ⚠️ เดิมโค้ดใช้ตรรกะ "ถ้าไม่ใช่ 13 คอลัมน์ ก็เขียนแบบ 9 คอลัมน์ไปเลย"
// ซึ่งแปลว่าแท็บที่หัวตารางถูกสลับ/แทรกคอลัมน์กลางตาราง/ลบหัวทิ้ง จะถูกเขียนทับ
// ด้วยค่า 9 ช่องลงคอลัมน์ 1-9 แล้วข้อมูลไปอยู่ผิดช่องทั้งแถว (เช่น "ยอดสุทธิ" ไปลงช่อง "ไม่คิด VAT")
// แล้วยังตอบ success กลับไปให้แอปด้วย — ผิดแบบเงียบสนิท ไม่มีใครรู้จนกว่าจะไปเปิดชีตดูเอง
//
// กฎใหม่: ต้องตรงกับโครงที่รู้จัก "เป๊ะ" อย่างใดอย่างหนึ่งเท่านั้น นอกนั้นไม่แตะ
// การตรวจโครงหนึ่งไม่ผ่าน ไม่ใช่เหตุผลให้เดาว่าเป็นอีกโครงหนึ่ง
// แท็บนี้ยังว่างสนิทไหม — ว่าง = ไม่มีแถวข้อมูล และแถวหัวก็ไม่มีตัวอักษรอะไรเลย
// เกิดได้เมื่อมีคนไปสร้างแท็บชื่อเดือนไว้ล่วงหน้าเองแต่ไม่ได้ใส่หัวตาราง
// แท็บแบบนี้ไม่มีข้อมูลอะไรให้เสียหาย จึงเติมหัวตารางให้แล้วใช้ต่อได้เลย
// (ต่างจากแท็บที่มีหัวแปลก ๆ หรือ migrate ค้างกลางคัน — พวกนั้นต้องหยุดจริง ๆ)
function billSheetIsBlank_(sheet) {
  if (sheet.getLastRow() > 1) return false;   // มีแถวข้อมูลแล้ว ห้ามเขียนหัวทับ
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return true;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  for (var i = 0; i < h.length; i++) {
    if (String(h[i] || "").trim() !== "") return false;
  }
  return true;
}

// ── หัวตารางที่ "เขียนค้างครึ่งทาง" (ข้อ 9 · ตรวจ 19 ต.ค. 2569) ──────────────────────────────────────
// Google ล้ม/ตัดการทำงานระหว่างเขียนหัวตารางแท็บใหม่ (บิลแรกของเดือน / สร้างแท็บสรุปรายเดือน) → เหลือหัวไม่ครบ
// เดิมไม่มีวันซ่อมเอง: บิลทั้งเดือนถูกปฏิเสธ SCHEMA_MISMATCH หรือสรุปทุกใบล้ม จนคนไปแก้หัวตารางเอง
// ซ่อมให้เฉพาะกรณีที่ปลอดภัยแน่นอน: แท็บยังไม่มีแถวข้อมูล และแถว 1 เป็น "ส่วนต้น" ของหัวที่ถูกต้องเป๊ะ
// (ช่อง 1..k ตรงกับหัวที่รู้จักทุกตัว และหลังจากนั้นว่าง · ว่างทั้งแถวนับด้วย) — หัวที่คนแก้/สลับ/เติมเอง หรือมีแถวข้อมูลแล้ว = หยุดเหมือนเดิม
function headerIsUnfinishedPrefix_(sheet, candidates) {
  if (sheet.getLastRow() > 1) return false;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return true;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  for (var c = 0; c < candidates.length; c++) {
    var want = candidates[c];
    if (lastCol >= want.length) continue;   // ยาวเท่า/เกินหัวเต็ม = ไม่ใช่หัวที่เขียนค้าง
    var ok = true;
    for (var i = 0; i < lastCol && ok; i++) if (String(h[i] == null ? "" : h[i]).trim() !== want[i]) ok = false;
    if (ok) return true;
  }
  return false;
}
// แท็บบิลเดือนที่หัวเขียนค้าง → เขียนหัว 13 ช่องให้ครบ (ไม่มีแถวข้อมูล = ไม่มีอะไรให้เสีย) · คืน true เมื่อซ่อมแล้ว
function repairUnfinishedBillHeader_(sheet) {
  if (billSheetSchema_(sheet) || !headerIsUnfinishedPrefix_(sheet, [BILL_HEADERS, BILL_LEGACY_HEADERS])) return false;
  styleHeaderRow(sheet, 1, BILL_HEADERS, "#1e293b", "white");
  sheet.setFrozenRows(1);
  Logger.log("ซ่อมหัวตารางที่เขียนค้างของแท็บ " + sheet.getName());
  return !!billSheetSchema_(sheet);
}

function billSheetSchema_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return null;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var matches = function (headers) {
    if (lastCol < headers.length) return false;
    for (var i = 0; i < headers.length; i++) {
      if (String(h[i] || "").trim() !== headers[i]) return false;
    }
    return true;
  };
  // ตรวจโครงปัจจุบันก่อนเสมอ — สองโครงนี้ชนกันไม่ได้อยู่แล้ว (ช่องที่ 8 คนละชื่อ)
  // คอลัมน์ที่งอกต่อท้าย (เช่นคนไปเติมช่องโน้ตเอง) ไม่ถือว่าผิด เพราะเราเขียนแค่ช่อง 1-13
  if (matches(BILL_HEADERS)) return "vat";
  if (matches(BILL_LEGACY_HEADERS)) return "legacy";
  return null;
}

// ── เพิ่ม 4 คอลัมน์ VAT ให้แท็บบิลเดิมที่ยังเป็นโครง 9 คอลัมน์ ──────────────
// ปลอดภัยกับข้อมูลเก่า: insertColumnBefore ดันคอลัมน์เดิมไปขวาทั้งก้อน ค่าไม่หายและไม่สลับช่อง
// แถวบิลเก่าจะเว้นว่างใน 4 ช่องใหม่ — จงใจ ไม่เดาย้อนหลัง เพราะบิลที่ราคามีเศษสตางค์
// จะมีค่า "ปัดเศษ" ที่คำนวณกลับจากตัวเลขในชีตไม่ได้ เว้นว่างตรงกว่าเติมเลขที่อาจผิด
function migrateBillSheetAddVatColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

  // หาคอลัมน์จาก "ชื่อหัวตาราง" ไม่ใช่เลขตายตัว · เจอชื่อซ้ำ = คืน -1 (ไม่รู้จะเชื่ออันไหน)
  var colOf = function (name) {
    var at = 0, dup = false;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || "").trim() === name) { if (at) dup = true; else at = i + 1; }
    }
    return dup ? -1 : at;
  };

  var found = 0;
  for (var k = 0; k < BILL_VAT_HEADERS.length; k++) if (colOf(BILL_VAT_HEADERS[k]) > 0) found++;
  if (found === BILL_VAT_HEADERS.length) return;  // ครบแล้ว
  if (found > 0) return;                          // ครบบ้างไม่ครบบ้าง — ไม่แตะ ปล่อยให้คนมาดูเอง

  var netCol = colOf(BILL_NET_HEADER);
  if (netCol <= 0) return;                        // ไม่มี "ยอดสุทธิ" = ไม่รู้จักโครงสร้าง ไม่แตะ
  if (colOf(BILL_ID_HEADER) !== 1) return;        // คอลัมน์แรกไม่ใช่เลขที่บิล = ไม่ใช่แท็บบิล ไม่แตะ

  // แทรกไล่จากขวาไปซ้าย ตำแหน่ง netCol จึงไม่ขยับระหว่างทาง
  for (var j = BILL_VAT_HEADERS.length - 1; j >= 0; j--) {
    sheet.insertColumnBefore(netCol);
    sheet.getRange(1, netCol)
      .setValue(BILL_VAT_HEADERS[j])
      .setBackground("#1e293b").setFontColor("white")
      .setFontWeight("bold").setHorizontalAlignment("center");
  }
}

// ── กฎเลขที่บิล — ต้องใช้ตัวเดียวกันทั้งตอนบันทึกและตอนยกเลิก ──────────────
// ถ้าสองทางใช้กฎคนละชุด จะมี ID ที่ "บันทึกไม่ได้แต่สั่งลบได้" หรือกลับกัน
// ซึ่งเป็นช่องที่ทำให้คำสั่งลบไปโดนแถวที่ไม่ได้ตั้งใจ
var BILL_ID_RE = /^[A-Za-z0-9_-]{6,160}$/;
function readBillId_(v) {
  return String(v == null ? "" : v).trim();
}

// ─────────────────────────────────────────────
//  กติกาตรวจบิล — ต้องตรงกับ validateBillRecord() ใน app.js ทุกข้อ
// ─────────────────────────────────────────────
// ⚠️ เดิมตรวจแค่บางสมการ บิลรุ่นเก่า (ไม่มีช่อง VAT) ส่งราคารวม 100 แต่ยอดสุทธิ 999 ก็ผ่าน
// ตอนนี้ทุกบิลต้องผ่านกติกาชุดนี้ก่อนแตะชีต (คิดเป็นสตางค์จำนวนเต็มทั้งหมด):
//   ชนิด: ช่องเงินต้องเป็น "ตัวเลข" ใน JSON (ไม่รับข้อความ) · ไม่ติดลบ · ไม่เกิน BILL_MAX_BAHT · ละเอียดไม่เกินสตางค์
//   บิลรุ่นเก่า (ไม่มีช่อง VAT เลยสักช่อง — ไล่จากโค้ดจริงของรุ่น มิ.ย.–ส.ค. 2569):
//     · ยอดสุทธิ = max(0, ราคารวม − ส่วนลด) เป๊ะ · ไม่ส่งราคารวมและส่วนลดมาเลย = ราคารวมเท่ายอดสุทธิ
//     · ส่วนลดเกินราคาได้เฉพาะเมื่อยอดสุทธิเป็น 0 (รุ่นแรกไม่จำกัดส่วนลด)
//     · รายการย่อย: ราคาหลังส่วนลดรวมคลาดได้ไม่เกินครึ่งสตางค์ต่อบรรทัด (รุ่นแรกปัดทีละบรรทัด)
//   บิลรุ่น VAT (ส่งช่อง VAT ครบ 4 ช่อง):
//     · ส่วนลด 0..ราคารวม · ราคารวม − ส่วนลด = ไม่คิดVAT + คิดVAT · 4 ช่องรวม = ยอดสุทธิ
//     · ยอดสุทธิเป็นบาทเต็ม และเงินปัดเศษ 0.00–0.99 (ระบบปัดขึ้นเต็มบาทเสมอ)
//     · VAT = ปัด(ฐานภาษี × อัตรา / 100) เมื่อส่งอัตรามา · รายการย่อยที่คิด VAT รวมได้เท่าฐานภาษี
//   ช่องทางจ่าย: cash/promptpay/credit หรือไม่ส่งมา (บิลรุ่นเก่ามาก = เงินสด)
//     · 'split' (แบ่งจ่าย · 6 ต.ค. 2569) = payments [{method, amount}] 2–10 ก้อน · ช่องทางจริงเท่านั้น
//       ก้อนละ > 0 ไม่เกินสตางค์ · ผลรวม = ยอดสุทธิเป๊ะ — ผิด = INVALID_PAYMENT (กติกาเดียวกับ readMoneyParts ของแอป)
//   วันที่: dateTimeStr ต้องเป็นวันเวลาปฏิทินจริง และเดือนทำการ (monthKey) ต้องตรงกับวันที่ (ตัดวัน 06:00)
var BILL_MAX_BAHT = 10000000;
var BUSINESS_DAY_CUTOFF_HOUR_ = 6;   // = BUSINESS_DAY_CUTOFF_HOUR ใน app.js

function bangkokDateTimeStr_(ms) {
  var t = new Date(Number(ms) + 7 * 3600000);
  var p2 = function (n) { return ("0" + n).slice(-2); };
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate()) + " " +
    p2(t.getUTCHours()) + ":" + p2(t.getUTCMinutes()) + ":" + p2(t.getUTCSeconds());
}

function isRealCalendarDate_(y, m, d) {
  if (!(y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();   // วันสุดท้ายของเดือน m
  return d <= dim;
}

function validateBillPayload_(data) {
  var problems = [];
  var fail = function (code, msg) { problems.push({ code: code, msg: msg }); };
  var money = function (val, name, required) {
    if (val === undefined || val === null) { if (required) fail("MISSING_" + name, "ไม่มีค่า " + name); return null; }
    if (typeof val !== "number" || !isFinite(val)) { fail("TYPE_" + name, "ค่า " + name + " ต้องเป็นตัวเลข (ได้ " + typeof val + ")"); return null; }
    if (val < 0 || val > BILL_MAX_BAHT) { fail("RANGE_" + name, "ค่า " + name + " อยู่นอกช่วงที่ยอมรับได้ (" + val + ")"); return null; }
    if (Math.abs(val * 100 - Math.round(val * 100)) > 1e-6) { fail("PRECISION_" + name, "ค่า " + name + " ละเอียดเกินสตางค์ (" + val + ")"); return null; }
    return val;
  };
  var sat = function (x) { return Math.round(x * 100); };

  var VK = ["nonVatBase", "vatableBase", "vatAmount", "rounding"];
  var present = 0;
  for (var i = 0; i < VK.length; i++) if (data[VK[i]] !== undefined && data[VK[i]] !== null) present++;
  var legacy = present === 0;

  var total = money(data.total, "total", true);
  var noSub = data.subtotal === undefined || data.subtotal === null;
  var noDisc = data.discount === undefined || data.discount === null;
  var subtotal = noSub ? (noDisc ? total : null) : money(data.subtotal, "subtotal", true);
  if (noSub && !noDisc) fail("MISSING_subtotal", "ส่งส่วนลดมาแต่ไม่มีราคารวม");
  var discount = noDisc ? 0 : money(data.discount, "discount", true);
  var moneyOk = subtotal !== null && discount !== null && total !== null;
  var netSat = moneyOk ? Math.max(0, sat(subtotal) - sat(discount)) : null;
  if (moneyOk && sat(discount) > sat(subtotal) && !(legacy && total === 0)) {
    fail("DISCOUNT_OVER", "ส่วนลดมากกว่าราคารวม");
  }

  var pm = data.paymentMethod;
  var splitParts = null;
  if (pm === "split") {
    // แบ่งจ่าย: ป้ายบนชีตสร้างจากก้อนเงินที่ผ่านการตรวจแล้วเท่านั้น (ดู payLabelFor_)
    splitParts = readSplitPayments_(data.payments, total);
    if (!splitParts.ok) fail("INVALID_PAYMENT", "บิลแบ่งจ่าย: " + splitParts.msg);
  } else if (!isKnownPayment_(pm)) fail("INVALID_PAYMENT", "ช่องทางชำระเงินไม่ถูกต้อง (" + String(pm) + ")");

  var out = { legacy: legacy, subtotal: subtotal, discount: discount, total: total,
              nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0,
              payments: (splitParts && splitParts.ok) ? splitParts.list : null };
  if (!legacy && present < VK.length) {
    fail("VAT_PARTIAL", "บิลส่งฟิลด์ VAT มาไม่ครบ (" + present + " จาก " + VK.length + ") — " +
      "บิลรุ่นก่อน VAT ต้องไม่มีฟิลด์เหล่านี้เลย ส่วนบิลที่คิด VAT ต้องส่งครบทุกช่องเพื่อให้ตรวจยอดได้");
  } else if (!legacy) {
    var vv = {};
    for (var k = 0; k < VK.length; k++) vv[VK[k]] = money(data[VK[k]], VK[k], true);
    var rate = null;
    if (data.vatRate !== undefined && data.vatRate !== null) {
      if (typeof data.vatRate !== "number" || !isFinite(data.vatRate) || data.vatRate < 0 || data.vatRate > 100) fail("INVALID_VAT_RATE", "อัตรา VAT ใช้ไม่ได้");
      else rate = data.vatRate;
    }
    if (vv.nonVatBase !== null && vv.vatableBase !== null && vv.vatAmount !== null && vv.rounding !== null && moneyOk) {
      var lhs = sat(subtotal) - sat(discount), rhs = sat(vv.nonVatBase) + sat(vv.vatableBase);
      if (lhs !== rhs) fail("VAT_BASE_MISMATCH", "ยอดในบิลบวกไม่ลงตัว: ราคารวม−ส่วนลด (" + (lhs / 100) + ") ไม่เท่ากับ ไม่คิดVAT+คิดVAT (" + (rhs / 100) + ")");
      var sumAll = rhs + sat(vv.vatAmount) + sat(vv.rounding);
      if (sumAll !== sat(total)) fail("VAT_TOTAL_MISMATCH", "ยอดสุทธิไม่ตรงกับผลรวม: ได้ " + (sumAll / 100) + " แต่บิลบอก " + total);
      if (sat(total) % 100 !== 0) fail("TOTAL_NOT_BAHT", "บิลรุ่น VAT ยอดสุทธิต้องเป็นบาทเต็ม");
      if (sat(vv.rounding) >= 100) fail("INVALID_ROUNDING", "เงินปัดเศษต้องน้อยกว่า 1 บาท");
      if (rate !== null && Math.round(sat(vv.vatableBase) * rate / 100) !== sat(vv.vatAmount)) {
        fail("VAT_AMOUNT_MISMATCH", "ภาษีขาย (" + vv.vatAmount + ") ไม่ตรงกับ ฐานภาษี × อัตรา " + rate + "%");
      }
      // ตรวจ 14 ต.ค. ข้อ 12 (ตรงกับ validateBillRecord ของแอป): มีภาษีขายแต่ไม่มีอัตรา — บิลรุ่นแรกใช้ 7% จึงตรวจด้วย 7%
      if ((data.vatRate === undefined || data.vatRate === null) && sat(vv.vatAmount) > 0 &&
          Math.round(sat(vv.vatableBase) * 7 / 100) !== sat(vv.vatAmount)) {
        fail("VAT_RATE_MISSING", "บิลไม่มีอัตรา VAT และภาษีขาย (" + vv.vatAmount + ") ไม่ตรงกับ ฐานภาษี × 7%");
      }
      out.nonVatBase = vv.nonVatBase; out.vatableBase = vv.vatableBase; out.vatAmount = vv.vatAmount; out.rounding = vv.rounding;
    }
  } else if (moneyOk && netSat !== sat(total)) {
    fail("LEGACY_MISMATCH", "บิลรุ่นเก่า: ราคารวม − ส่วนลด (" + (netSat / 100) + ") ไม่เท่ากับยอดสุทธิ (" + total + ")");
  }

  // ── รายการย่อย (ส่งมาเป็น lines: [{price, netPrice, vatable}]) ต้องบวกกลับเท่ายอดของบิล ──
  if (data.lines !== undefined && data.lines !== null) {
    if (!Array.isArray(data.lines) || data.lines.length > 500) fail("INVALID_LINES", "รายการย่อยของบิลมีรูปแบบไม่ถูกต้อง");
    else if (data.lines.length && moneyOk) {
      var pSat = 0, nSat = 0, vSat = 0, allNet = true, allFlag = true, bad = false;
      for (var li = 0; li < data.lines.length; li++) {
        var ln = data.lines[li];
        if (!ln || typeof ln !== "object" || Array.isArray(ln)) {
          fail("INVALID_LINES", "รายการย่อยลำดับ " + (li + 1) + " ต้องเป็นข้อมูลรายการ ไม่ใช่ค่าว่างหรือชนิดอื่น");
          bad = true; continue;
        }
        var lp = money(ln.price, "lines.price", true);
        if (lp === null) { bad = true; continue; }
        pSat += sat(lp);
        if (ln.netPrice === undefined || ln.netPrice === null) { allNet = false; continue; }
        var lnp = money(ln.netPrice, "lines.netPrice", true);
        if (lnp === null) { bad = true; continue; }
        nSat += sat(lnp);
        if (typeof ln.vatable !== "boolean") allFlag = false;
        else if (ln.vatable) vSat += sat(lnp);
      }
      if (!bad) {
        if (pSat !== sat(subtotal)) fail("LINES_SUBTOTAL_MISMATCH", "ผลรวมราคารายการ (" + (pSat / 100) + ") ไม่เท่ากับราคารวมของบิล (" + subtotal + ")");
        if (allNet && nSat !== netSat) {
          var tol = legacy ? Math.ceil(data.lines.length / 2) : 0;
          if (Math.abs(nSat - netSat) > tol) fail("LINES_NET_MISMATCH", "ผลรวมราคาหลังส่วนลด (" + (nSat / 100) + ") ไม่เท่ากับ ราคารวม − ส่วนลด (" + (netSat / 100) + ")");
        }
        if (!legacy && allNet && allFlag && out.vatableBase !== null) {
          // บิล VAT รุ่นแรกยังไม่มี vatRate แต่ใช้ 7% เช่นเดียวกับด่าน VAT_RATE_MISSING ด้านบน
          var rateOn = data.vatRate == null || (typeof data.vatRate === "number" && data.vatRate > 0);
          if ((rateOn ? vSat : 0) !== sat(out.vatableBase)) fail("LINES_VAT_MISMATCH", "ผลรวมรายการที่คิด VAT ไม่เท่ากับฐานภาษี");
        }
      }
    }
  }

  // ── วันที่ต้องเป็นวันปฏิทินจริง และเดือนทำการต้องตรงกับวันที่ ─────────────
  var dnum = typeof data.date === "number" ? data.date : Date.parse(String(data.date || ""));
  if (!isFinite(dnum)) fail("INVALID_DATE", "เวลาของบิล (date) ใช้ไม่ได้");
  var dts = (data.dateTimeStr === undefined || data.dateTimeStr === null || data.dateTimeStr === "")
    // แอปรุ่นก่อน 19 ก.ค. 2569 ไม่ส่ง dateTimeStr/monthKey — คิดจากเวลาของบิลเป็นเวลาไทย (UTC+7 ไม่มีเวลาออมแสง)
    ? (isFinite(dnum) ? bangkokDateTimeStr_(dnum) : "")
    : String(data.dateTimeStr);
  if (isFinite(dnum) && dts !== bangkokDateTimeStr_(dnum)) fail('INVALID_DATE', 'วันเวลาที่แสดงไม่ตรงกับ timestamp ของบิลในเขตเวลา Asia/Bangkok');
  var mDt = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(dts);
  if (!mDt) fail("INVALID_DATE", "วันเวลาของบิลไม่อยู่ในรูปแบบ ปปปป-ดด-วว ชช:นน:วว");
  else {
    var yy = Number(mDt[1]), mo = Number(mDt[2]), dd = Number(mDt[3]), hh = Number(mDt[4]), mi = Number(mDt[5]), se = Number(mDt[6]);
    if (!isRealCalendarDate_(yy, mo, dd) || hh > 23 || mi > 59 || se > 59) fail("INVALID_DATE", "วันเวลาของบิลไม่มีอยู่จริงในปฏิทิน (" + dts + ")");
    else {
      var biz = new Date(Date.UTC(yy, mo - 1, dd));
      if (hh < BUSINESS_DAY_CUTOFF_HOUR_) biz = new Date(biz.getTime() - 86400000);
      var mk = ("0" + (biz.getUTCMonth() + 1)).slice(-2) + "-" + biz.getUTCFullYear();
      var wantMk = (data.monthKey === undefined || data.monthKey === null || data.monthKey === "") ? mk : data.monthKey;
      if (!isValidMonthKey_(wantMk)) fail("INVALID_MONTH", "เดือนของบิลไม่ถูกต้อง (" + String(data.monthKey) + ")");
      else if (mk !== wantMk) fail("MONTH_MISMATCH", "เดือนทำการ " + wantMk + " ไม่ตรงกับวันที่ของบิล (" + dts + " = " + mk + ")");
      else { out.monthKey = mk; out.dateTimeStr = dts; }
    }
  }

  if (problems.length) {
    var first = problems[0];
    var code = /^(TYPE|RANGE|PRECISION|MISSING)_/.test(first.code) || /MISMATCH|OVER|ROUNDING|NOT_BAHT|PARTIAL|LINES|VAT_RATE/.test(first.code)
      ? "INVALID_AMOUNT" : first.code;
    if (first.code === "INVALID_PAYMENT") code = "INVALID_PAYMENT";
    if (/^(INVALID_DATE|INVALID_MONTH|MONTH_MISMATCH)$/.test(first.code)) code = "INVALID_DATE";
    return { ok: false, code: code, message: first.msg + (problems.length > 1 ? " (และอีก " + (problems.length - 1) + " ข้อ)" : ""), problems: problems };
  }
  out.ok = true;
  return out;
}

function backendId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof ss.getId === 'function') return 'sheet:' + ss.getId();
  // Test hosts / older adapters without getId still need a stable identity.
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('POS_BACKEND_ID');
  if (!id) { id = Utilities.getUuid(); props.setProperty('POS_BACKEND_ID', id); }
  return 'backend:' + id;
}

var BILL_INDEX_NAME_ = '_POS_BILL_INDEX';
var VOID_ARCHIVE_NAME_ = '_POS_VOID_ARCHIVE';
function ledgerSheet_(name, headers, ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name); sheet.appendRow(headers);
    if (typeof sheet.hideSheet === 'function') sheet.hideSheet();
  }
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(headers)) throw registryCorrupt_('ทะเบียน ' + name + ' มีหัวคอลัมน์ผิด — หยุดเพื่อป้องกันข้อมูลเสีย', 'all');
  return sheet;
}
// ช่องข้อความของทะเบียนระบบต้องเป็น Plain text ("@") ก่อนเขียน — Sheets แปลงข้อความหน้าตาเหมือนวันที่/ตัวเลขเอง
// (เช่น "10-2026" อาจถูกอ่านเป็นวันที่ตาม locale ของไฟล์ · โค้ดเดิมจึงตั้ง "@" ให้ช่องงวดในแท็บสรุปรายเดือน)
// ถ้าช่อง "เดือน" ของ _POS_BILL_INDEX ถูกแปลง คำขอครั้งถัดไปของบิลเดียวกัน (แก้บิล/ส่งซ้ำ) จะได้ CROSS_MONTH_BILL_ID
// ทุกครั้งและแก้ไม่ได้อีกเลย — ป้องกันไว้ก่อน (ตรวจรอบ Claude 7 ต.ค. 2569 · ต้องยืนยันกับชีตจริงใน staging)
// rowNum = 0 → ต่อท้าย (ตั้งรูปแบบแถวว่างถัดไปก่อน appendRow จะเขียนลงแถวนั้น) · คืนเลขแถวที่เขียน
// ⚠️ getRange เกินจำนวนแถวของชีต (getMaxRows) = Google โยน error — ชีตที่เต็มพอดีให้ appendRow ขยายแถวเอง
//    แล้วค่อยตั้ง "@" และเขียนช่องข้อความซ้ำ (ทะเบียนเกิน 1,000 บิลต้องยังรับบิลได้)
function ledgerWriteRow_(sheet, rowNum, values, textCols) {
  if (!rowNum) {
    var next = sheet.getLastRow() + 1;
    var max = (typeof sheet.getMaxRows === "function") ? sheet.getMaxRows() : Infinity;
    if (next <= max) {
      sheet.getRange(next, 1, 1, textCols).setNumberFormat("@");
      sheet.appendRow(values);
      return sheet.getLastRow();
    }
    sheet.appendRow(values);
    rowNum = sheet.getLastRow();
  }
  sheet.getRange(rowNum, 1, 1, textCols).setNumberFormat("@");
  sheet.getRange(rowNum, 1, 1, values.length).setValues([values]);
  return rowNum;
}
// ── หาแถวของเลขบิลในทะเบียนระบบ (_POS_BILL_INDEX / _POS_VOID_ARCHIVE) ─────────────────────────────
// ข้อ 8 (ตรวจ 19 ต.ค. 2569): เดิมอ่านทั้งทะเบียน (ทุกแถว × 5 ช่อง) ทุกคำขอ — งานโตตามจำนวนบิลทั้งร้าน
// (ส่งบิลทั้งร้านใหม่หลังกู้ไฟล์ = กำลังสอง) · ตอนนี้ให้ Sheets ค้นเฉพาะคอลัมน์เลขบิลด้วย TextFinder แบบ "ตรงทั้งช่อง +
// ตรงตัวพิมพ์" แล้วอ่านเฉพาะแถวที่เจอ · ยังตรวจเลขซ้ำเหมือนเดิม (เจอเกิน 1 แถวที่ค่าตรงจริง = REGISTRY_CORRUPT ระดับบิล)
// TextFinder ค้นจาก "ค่าที่โชว์" → ยืนยันซ้ำด้วยค่าจริงของช่อง (String(ค่า) === เลขบิล) แบบเดียวกับตัวเดิม
// ตัวจำลองรุ่นเก่าที่ไม่มี createTextFinder = อ่านทั้งทะเบียนแบบเดิม
function ledgerEntry_(sheet, id, width) {
  var n = sheet.getLastRow(); if (n < 2) return null;
  var col = sheet.getRange(2, 1, n - 1, 1), found = null;
  if (typeof col.createTextFinder === 'function') {
    var hits = col.createTextFinder(String(id)).matchCase(true).matchEntireCell(true).findAll() || [];
    for (var h = 0; h < hits.length; h++) {
      var r = hits[h].getRow(), cells = sheet.getRange(r, 1, 1, width).getValues()[0];
      if (String(cells[0]) !== id) continue;
      if (found) throw registryCorrupt_('ทะเบียนมีเลขบิลซ้ำ: ' + id, 'bill');
      found = { row: r, cells: cells };
    }
    return found;
  }
  var values = sheet.getRange(2, 1, n - 1, width).getValues();
  for (var i = 0; i < values.length; i++) if (String(values[i][0]) === id) {
    if (found) throw registryCorrupt_('ทะเบียนมีเลขบิลซ้ำ: ' + id, 'bill');
    found = { row: i + 2, cells: values[i] };
  }
  return found;
}
// ── ช่อง "เดือน" ของ _POS_BILL_INDEX อ่านเป็น "MM-yyyy" เสมอ (16 ต.ค. 2569 · บิล TX-1791994173815 ค้าง CROSS_MONTH_BILL_ID) ──
// ชีตจริงแปลง "10-2026" เป็นวันที่ 1 ต.ค. 2026 แม้เขียนหลังตั้งรูปแบบ "@" แล้ว (ยืนยันจากชีตร้าน: B899 = 01/10/2026)
// getValues() จึงคืน Date → String(Date) ไม่ตรงกับ monthKey → ส่งซ้ำ/แก้บิลย้อนหลังทุกใบถูกปฏิเสธว่า "ผูกกับเดือนอื่น"
// แปลงกลับด้วยเขตเวลาของไฟล์ชีต (ตัวเดียวกับที่ Sheets ใช้ตีความตอนเขียน) — ทุกจุดที่อ่านช่องนี้ต้องผ่านฟังก์ชันนี้
function billIndexMonth_(v, ss) {
  return cellText_(v, spreadsheetTz_(ss || SpreadsheetApp.getActiveSpreadsheet()), "MM-yyyy").trim();
}
function billIndexEntry_(index, billId, ss) {
  var e = ledgerEntry_(index, billId, 5);
  if (e) e.cells[1] = billIndexMonth_(e.cells[1], ss);
  return e;
}
// ── ทะเบียนเลขบิลทั้งชีต (_POS_BILL_INDEX) สำหรับบิลที่เขียนก่อนมีทะเบียน ─────────────────────────
// อัปเกรดครั้งเดียว: อ่านเลขบิลทุกแท็บเดือน แล้วเขียนแถวทะเบียนเป็นก้อน (ไม่ใช่ทีละแถว) · hash = 'legacy'
// เพราะแถวชีต 13 ช่องสร้าง canonical hash ไม่ได้ (รับ hash จริงหลังส่งซ้ำผ่านการตรวจรุ่น/ช่องเงินตามเดิม)
// ตรวจรอบ Claude 7 ต.ค. 2569 (รอบ 3): รุ่นก่อนหน้า "ล้มทั้งชีต" เมื่อเจอแถวเดียวที่ผิด — แถว "รวม"/หมายเหตุที่เจ้าของพิมพ์เอง,
//   เลขซ้ำ หรือหัวตารางเดือนเก่าที่ถูกแก้ ทำให้บิลใหม่ทุกใบได้ BILL_INDEX_MIGRATION_REQUIRED (ขายได้แต่ไม่มีอะไรขึ้นชีต)
//   และรับช่วงฉุกเฉินไม่ได้ ตอนนี้ปิดเฉพาะส่วนที่มีปัญหา ใช้กติกาเดียวกับส่วนอื่นของระบบ:
//   · แถวที่ช่องเลขบิลไม่ใช่รูปแบบเลขบิล = ไม่ใช่บิล (เหมือน list_bills ที่ติดธง idOk:false) → ข้าม
//   · เลขซ้ำ → ลงทะเบียนเป็น 'duplicate' บิลเลขนั้นถูกปฏิเสธ (DUPLICATE_BILL_ID) จนเจ้าของลบแถวที่ผิด แล้วซ่อมทะเบียนเอง
//   · แท็บที่หัวตารางผิด → ข้ามและจดไว้ในเครื่องหมาย บิลเดือนนั้นถูกปฏิเสธ (SCHEMA_MISMATCH) ตามเดิม แก้หัวตารางแล้วอัปเกรดซ้ำเอง
// เครื่องหมายเก็บจำนวนแถวทะเบียนไว้ด้วย — แถวทะเบียนถูกลบด้วยมือ (จำนวนลดลง) = อัปเกรดซ้ำ ไม่ปล่อยให้เลขบิลหลุดการตรวจทั้งชีต
var BILL_INDEX_MARKER_ = 'POS_BILL_INDEX_GLOBAL_V1';
var BILL_INDEX_PROBLEMS_ = 'POS_BILL_INDEX_PROBLEMS';
function readBillIndexMarker_(props) {
  var raw = props.getProperty(BILL_INDEX_MARKER_);
  if (!raw) return null;
  try {
    var o = JSON.parse(raw);
    if (o && typeof o === 'object' && typeof o.b === 'string') {
      return { b: o.b, n: Number(o.n) || 0, skip: Array.isArray(o.skip) ? o.skip.map(String) : [] };
    }
  } catch (e) { /* ค่าเดี่ยวรุ่นก่อน */ }
  // ค่าเดี่ยวของรุ่นก่อน (ไม่รู้จำนวนแถว) — ถือว่าต้องมีอย่างน้อย 1 แถว: แท็บทะเบียนถูกลบ = อัปเกรดซ้ำเหมือนรุ่นก่อน
  return { b: String(raw), n: 1, skip: [] };
}
function scanLegacyBills_(ss) {
  var out = { occ: Object.create(null), badTabs: [], nonBillCount: 0, nonBillExamples: [], badVersions: [], tabs: 0, rows: 0,
    monthMismatch: [], monthMismatchCount: 0, badDates: [] }, tz = spreadsheetTz_(ss);
  ss.getSheets().forEach(function(sheet) {
    var month = sheet.getName();
    if (!isValidMonthKey_(month)) return;
    var count = sheet.getLastRow();
    if (count < 2) return;
    var schema = billSheetSchema_(sheet), revCol = schema ? billRevColumn_(sheet) : -1;
    if (!schema || revCol < 0) { out.badTabs.push(month); return; }
    out.tabs++;
    var ids = sheet.getRange(2, 1, count - 1, 2).getValues();   // ช่อง 2 = วันที่-เวลา (ตรวจ 14 ต.ค. ข้อ 6)
    var versions = revCol > 0 ? sheet.getRange(2, revCol, count - 1, 1).getDisplayValues() : null;
    for (var i = 0; i < ids.length; i++) {
      var id = readBillId_(cellText_(ids[i][0]));
      if (!id) continue;
      if (!BILL_ID_RE.test(id)) {
        out.nonBillCount++;
        if (out.nonBillExamples.length < 10) out.nonBillExamples.push(month + ' แถว ' + (i + 2) + ': ' + id.slice(0, 30));
        continue;
      }
      out.rows++;
      var bizMonth = businessMonthOfCell_(ids[i][1], tz);
      if (!bizMonth) { if (out.badDates.length < 50) out.badDates.push(month + ' แถว ' + (i + 2) + ' (' + id + ')'); }
      else if (bizMonth !== month) {
        out.monthMismatchCount++;
        if (out.monthMismatch.length < 200) out.monthMismatch.push(month + ' แถว ' + (i + 2) + ' (' + id + ') ควรเป็น ' + bizMonth);
      }
      var cell = versions ? String(versions[i][0] || '').trim() : '';
      var version = cell ? parseBillVersionCell_(cell) : { epoch: 0, rev: 0 };
      if (!version) { if (out.badVersions.length < 50) out.badVersions.push(id); version = { epoch: 0, rev: 0 }; }
      (out.occ[id] = out.occ[id] || []).push({ month: month, version: version });
    }
  });
  return out;
}
// เขียนหลายแถวต่อท้ายทะเบียนระบบในคำสั่งเดียว (ช่องข้อความตั้ง "@" ก่อน — เหตุผลเดียวกับ ledgerWriteRow_)
// เดิมเขียนทีละแถว: บิลเก่า ~750 ใบ = อ่าน/เขียนชีตหลายพันครั้งขณะถือ script lock (คำขออื่นได้ BUSY เป็นนาที)
function ledgerAppendRows_(sheet, rows, textCols) {
  for (var i = 0; i < rows.length; i += 500) {
    var chunk = rows.slice(i, i + 500), start = sheet.getLastRow() + 1;
    if (typeof sheet.getMaxRows === 'function') {
      var short = start + chunk.length - 1 - sheet.getMaxRows();
      if (short > 0) sheet.insertRowsAfter(sheet.getMaxRows(), short);
    }
    sheet.getRange(start, 1, chunk.length, textCols).setNumberFormat('@');
    sheet.getRange(start, 1, chunk.length, chunk[0].length).setValues(chunk);
  }
}
function migrateLegacyBillIndex_(ss, index) {
  var props = PropertiesService.getScriptProperties();
  var binding = backendId_(), marker = readBillIndexMarker_(props), last = index.getLastRow();
  var settled = !!marker && marker.b === binding && Math.max(0, last - 1) >= marker.n &&
    !marker.skip.some(function(month) {
      var s = ss.getSheetByName(month);   // แท็บที่เคยอ่านไม่ได้ ถูกแก้หัวตาราง/ลบไปแล้ว → อัปเกรดซ้ำ
      return !s || s.getLastRow() < 2 || (!!billSheetSchema_(s) && billRevColumn_(s) >= 0);
    });
  // ข้อ 8: คืนเครื่องหมายที่อ่านแล้วให้ผู้เรียกส่งต่อ (noteBillIndexGrowth_ ไม่ต้องอ่าน Script Properties ซ้ำในคำขอเดียวกัน)
  if (settled) return marker;
  var existing = Object.create(null), ledgerProblems = [];
  // แถวทะเบียนที่อ่านไม่ได้ (ถูกล้างด้วยมือ/พิมพ์ทับ) ปิดเฉพาะเลขนั้น ไม่ล้มทั้งชีต (ตรวจรอบ Claude รอบ 3 · ผู้ตรวจแยก #9)
  // — แถวว่างข้าม · เลขซ้ำในทะเบียน: ledgerEntry_ ปฏิเสธเฉพาะบิลเลขนั้นอยู่แล้ว
  if (last > 1) index.getRange(2, 1, last - 1, 5).getValues().forEach(function(row, i) {
    var id = String(row[0] == null ? '' : row[0]).trim();
    row[1] = billIndexMonth_(row[1], ss);   // ช่องที่ชีตแปลงเป็นวันที่ไปแล้ว ต้องนับเป็นแถวดี ไม่งั้นอัปเกรดซ้ำจะเพิ่มแถวซ้ำ
    if (!id && String(row[1] == null ? '' : row[1]).trim() === '') return;
    if (!BILL_ID_RE.test(id) || existing[id] || !isValidMonthKey_(String(row[1]))) {
      if (ledgerProblems.length < 30) ledgerProblems.push('แถว ' + (i + 2) + ': ' + id.slice(0, 30));
      return;
    }
    existing[id] = { row: i + 2, cells: row };
  });
  var scan = scanLegacyBills_(ss), add = [], problems = [];
  Object.keys(scan.occ).forEach(function(id) {
    var list = scan.occ[id], months = list.map(function(o) { return o.month; });
    if (existing[id]) {
      var cells = existing[id].cells;
      if (list.length > 1 || months[0] !== String(cells[1])) {
        problems.push(id + ' (' + months.join(', ') + ' · ทะเบียน ' + cells[1] + ')');
        // พบซ้ำทีหลัง (เช่นแก้หัวตารางแท็บเก่าแล้วอัปเกรดซ้ำ) — ปิดเลขนี้เหมือนตอนอัปเกรดครั้งแรก ไม่ใช่แค่จดไว้
        if (String(cells[3]) !== 'duplicate') {
          ledgerWriteRow_(index, existing[id].row, [id, String(cells[1]), String(cells[2]), 'duplicate', 1], 4);
        }
      }
      return;
    }
    if (list.length > 1) {
      add.push([id, list[0].month, 'v1:0:0', 'duplicate', 1]);
      problems.push(id + ' (' + months.join(', ') + ')');
      return;
    }
    add.push([id, list[0].month, 'v1:' + list[0].version.epoch + ':' + list[0].version.rev, 'legacy', 1]);
  });
  if (add.length) ledgerAppendRows_(index, add, 4);
  SpreadsheetApp.flush();
  var report = { at: Date.now(), bills: scan.rows, added: add.length, duplicateCount: problems.length, duplicates: problems.slice(0, 30),
    badTabs: scan.badTabs, nonBillRows: scan.nonBillCount, nonBillExamples: scan.nonBillExamples, badVersions: scan.badVersions,
    badLedgerRows: ledgerProblems };
  try { props.setProperty(BILL_INDEX_PROBLEMS_, JSON.stringify(report)); } catch (e) { Logger.log('bill index report not saved: ' + e); }
  var value = JSON.stringify({ b: binding, n: Math.max(0, index.getLastRow() - 1), skip: scan.badTabs });
  props.setProperty(BILL_INDEX_MARKER_, value);
  if (props.getProperty(BILL_INDEX_MARKER_) !== value) throw new Error('ยืนยันการอัปเกรดทะเบียนเลขบิลไม่ได้');
  return readBillIndexMarker_({ getProperty: function() { return value; } });
}
// จำนวนแถวทะเบียนสูงสุดที่เคยมี — แถวถูกลบด้วยมือ (จำนวนน้อยลง) = อัปเกรดซ้ำ (ตรวจรอบ Claude รอบ 3 · D8)
// เขียน property เฉพาะตอนทะเบียนได้แถวใหม่ (บิลใหม่ 1 ใบ = 1 ครั้ง) ภายใต้ script lock เดียวกับการเขียนแถว
// known = เครื่องหมายที่ migrateLegacyBillIndex_ เพิ่งอ่าน/เขียนในคำขอเดียวกัน (ถือ script lock อยู่ ค่าไม่เปลี่ยนระหว่างทาง)
function noteBillIndexGrowth_(rows, known) {
  var props = PropertiesService.getScriptProperties(), m = known || readBillIndexMarker_(props);
  if (!m || m.b !== backendId_() || !(rows > m.n)) return;
  props.setProperty(BILL_INDEX_MARKER_, JSON.stringify({ b: m.b, n: rows, skip: m.skip }));
}
// เลขบิลที่ทะเบียนจดว่า "ซ้ำบนชีต" — ตรวจใหม่เฉพาะเลขนี้ (เกิดน้อยมาก) ถ้าเจ้าของลบแถวที่ผิดแล้วให้ซ่อมทะเบียนเอง
// คืน null = ซ่อมแล้ว/ใช้ต่อได้ · คืน response = ยังซ้ำอยู่
function resolveDuplicateIndexEntry_(ss, index, indexed, billId, monthYear) {
  var places = [];
  ss.getSheets().forEach(function(s) {
    var name = s.getName();
    if (!isValidMonthKey_(name) || s.getLastRow() < 2 || !billSheetSchema_(s)) return;
    findBillRows_(s, billId).forEach(function(r) { places.push({ month: name, row: r, sheet: s }); });
  });
  if (places.length > 1) {
    return json('error', 'เลขบิล ' + billId + ' มีหลายแถวบนชีต (' + places.map(function(p) { return p.month + ' แถว ' + p.row; }).join(', ') +
      ') — ให้เจ้าของตรวจกับใบเสร็จแล้วลบแถวที่ผิดก่อน', { billId: billId, rows: places.map(function(p) { return p.row; }),
      months: places.map(function(p) { return p.month; }) }, 'DUPLICATE_BILL_ID');
  }
  var keep = places[0], version = { epoch: 0, rev: 0 };
  if (keep) {
    var rc = billRevColumn_(keep.sheet);
    var cell = rc > 0 ? String(keep.sheet.getRange(keep.row, rc).getDisplayValue() || '').trim() : '';
    version = (cell && parseBillVersionCell_(cell)) || version;
  }
  ledgerWriteRow_(index, indexed.row, [billId, keep ? keep.month : monthYear, 'v1:' + version.epoch + ':' + version.rev, 'legacy', keep ? 1 : 0], 4);
  SpreadsheetApp.flush();
  return null;
}
// รันเองใน Apps Script editor ก่อน deploy รุ่นนี้ (ไม่เขียนอะไรลงชีต) — บอกว่าชีตจริงมีแถวที่ไม่ใช่บิล เลขซ้ำ
// หรือแท็บที่หัวตารางผิดไหม เพื่อแก้ก่อนเปิดใช้ · ผลการอัปเกรดจริงครั้งล่าสุดอยู่ใน Script Properties: POS_BILL_INDEX_PROBLEMS
function checkBillIndexUpgrade() {
  var scan = scanLegacyBills_(SpreadsheetApp.getActiveSpreadsheet()), dups = [];
  Object.keys(scan.occ).forEach(function(id) {
    if (scan.occ[id].length > 1) dups.push(id + ' → ' + scan.occ[id].map(function(o) { return o.month; }).join(', '));
  });
  var lines = [
    'ตรวจก่อนอัปเกรดทะเบียนเลขบิล (อ่านอย่างเดียว ไม่เขียนอะไร)',
    'แท็บเดือนที่อ่านได้ ' + scan.tabs + ' แท็บ · บิล ' + scan.rows + ' ใบ',
    'แถวที่ไม่ใช่เลขบิล (ข้าม ไม่นับเป็นบิล): ' + scan.nonBillCount + (scan.nonBillExamples.length ? ' เช่น ' + scan.nonBillExamples.join(' | ') : ''),
    'เลขบิลซ้ำ (บิลเลขนี้จะถูกปฏิเสธจนลบแถวที่ผิด): ' + dups.length + (dups.length ? ' → ' + dups.slice(0, 30).join(' | ') : ''),
    'แท็บที่หัวตารางไม่ตรง (บิลเดือนนี้ถูกปฏิเสธจนแก้หัวตาราง): ' + (scan.badTabs.join(', ') || '-'),
    'ช่องรุ่นบิลอ่านไม่ได้: ' + scan.badVersions.length + (scan.badVersions.length ? ' → ' + scan.badVersions.slice(0, 20).join(', ') : ''),
    // ตรวจ 14 ต.ค. ข้อ 6: แถวที่อยู่คนละแท็บกับ "เดือนทำการ" (ตัดวัน 06:00) — ยกเลิกบิลพวกนี้ ระบบรุ่นนี้ไปหาแถวในแท็บที่ถูกให้เอง
    'แถวบิลที่อยู่คนละแท็บกับเดือนทำการ (ตัดวันตี 6): ' + scan.monthMismatchCount + ' แถว' +
      (scan.monthMismatch.length ? ' → ' + scan.monthMismatch.slice(0, 30).join(' | ') : ' (ไม่มี — ปกติ)'),
    'แถวบิลที่อ่านวันเวลาไม่ได้ (ตรวจเดือนไม่ได้): ' + scan.badDates.length + (scan.badDates.length ? ' → ' + scan.badDates.slice(0, 20).join(' | ') : '')
  ];
  Logger.log(lines.join('\n'));
  return { tabs: scan.tabs, bills: scan.rows, nonBillRows: scan.nonBillCount, duplicates: dups, badTabs: scan.badTabs, badVersions: scan.badVersions,
    monthMismatchCount: scan.monthMismatchCount, monthMismatch: scan.monthMismatch, badDates: scan.badDates };
}
// เดือนทำการ (MM-yyyy) จากช่อง "วันที่-เวลา" ของแถวบิล — ตัดวันที่ 06:00 เหมือน validateBillPayload_ · อ่านไม่ได้ = ""
function businessMonthOfCell_(v, tz) {
  var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(cellText_(v, tz).trim());
  if (!m || !isRealCalendarDate_(Number(m[1]), Number(m[2]), Number(m[3]))) return "";
  var biz = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number(m[4]) < BUSINESS_DAY_CUTOFF_HOUR_) biz = new Date(biz.getTime() - 86400000);
  return ("0" + (biz.getUTCMonth() + 1)).slice(-2) + "-" + biz.getUTCFullYear();
}

// ยกเว้นเฉพาะแถวเก่าที่เขียนตามเดือนปฏิทิน: วันที่ 1 ก่อน 06:00 ในแท็บเดือนถัดจากเดือนทำการ
// ห้ามใช้แค่ "แท็บติดกัน" เพราะจะยอมรับการวางแถวผิดเดือนจริงด้วย
function legacyBillMonthMatches_(tabMonth, businessMonth, cell, tz) {
  var m = /^(\d{4})-(\d{2})-01 (0[0-5]):[0-5]\d/.exec(cellText_(cell, tz).trim());
  return !!m && m[2] + '-' + m[1] === tabMonth && adjacentMonthKeys_(businessMonth)[1] === tabMonth &&
    businessMonthOfCell_(cell, tz) === businessMonth;
}

// ── ตรวจ 8 ต.ค. 2569 ข้อ 2: แถวบิลเก่าที่ช่อง VAT ว่าง (รันใน editor · อ่านอย่างเดียว ไม่เขียนอะไร) ─────────────
// แท็บเดือนที่ทำโดย Apps Script รุ่น 9 คอลัมน์ แล้วถูกเติม 4 คอลัมน์ VAT ทีหลัง (migrateBillSheetAddVatColumns_) เว้นช่อง VAT ว่างไว้
//   · ว่างครบ 4 ช่อง = แถวเก่าปกติ → รุ่นนี้ไม่นับเป็น "ข้อมูลต่าง" ตอนย้ายเครื่องหลัก · ส่งบิลนั้นซ้ำจะเติม VAT ให้เอง
//   · ว่างแค่บางช่อง = แถวถูกแก้ด้วยมือ → ยังถูกเทียบตามเดิม (ย้ายเครื่องหลักจะขึ้น different:row) ให้ตรวจ/แก้แถวนั้นก่อนย้าย
function checkLegacyBlankVatRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { tabs: 0, bills: 0, blankRows: 0, partialRows: 0, perMonth: [], partialExamples: [], notMigrated: [] };
  ss.getSheets().forEach(function(sheet) {
    var month = sheet.getName();
    if (!isValidMonthKey_(month)) return;
    var n = sheet.getLastRow();
    if (n < 2) return;
    var schema = billSheetSchema_(sheet);
    if (schema !== 'vat') { out.notMigrated.push(month + ' (' + (schema || 'หัวตารางไม่ตรง') + ')'); return; }
    out.tabs++;
    var rows = sheet.getRange(2, 1, n - 1, 13).getValues(), blank = 0;
    for (var i = 0; i < rows.length; i++) {
      var id = readBillId_(cellText_(rows[i][0]));
      if (!id || !BILL_ID_RE.test(id)) continue;
      out.bills++;
      var empty = 0;
      for (var k = 7; k <= 10; k++) if (rows[i][k] === '' || rows[i][k] == null) empty++;
      if (empty === 4) blank++;
      else if (empty > 0) {
        out.partialRows++;
        if (out.partialExamples.length < 50) out.partialExamples.push(month + ' แถว ' + (i + 2) + ' (' + id + ')');
      }
    }
    if (blank) out.perMonth.push(month + ': ' + blank + ' แถว');
    out.blankRows += blank;
  });
  Logger.log([
    'ตรวจแถวบิลเก่าที่ช่อง VAT ว่าง (อ่านอย่างเดียว ไม่เขียนอะไร)',
    'แท็บเดือนโครง 13 คอลัมน์ ' + out.tabs + ' แท็บ · บิล ' + out.bills + ' ใบ',
    'ว่างครบ 4 ช่อง (แถวเก่าปกติ — รุ่นนี้ย้ายเครื่องหลักผ่านแล้ว): ' + out.blankRows + ' แถว' + (out.perMonth.length ? ' → ' + out.perMonth.join(' | ') : ''),
    'ว่างแค่บางช่อง (ต้องตรวจ/แก้ก่อนย้ายเครื่องหลัก): ' + out.partialRows + ' แถว' + (out.partialExamples.length ? ' → ' + out.partialExamples.join(' | ') : ''),
    'แท็บเดือนที่ยังเป็นโครงเก่า/หัวตารางไม่ตรง (ไม่ได้ตรวจ): ' + (out.notMigrated.join(', ') || '-')
  ].join('\n'));
  return out;
}

// ── ชุดช่องที่ใช้คิด hash ของบิล "รุ่น 1" — ล็อกไว้ (เจ้าของตัดสิน 8 ต.ค. 2569 · ตรวจหมวด D ข้อ 7) ─────────────
// hash ถูกจดใน _POS_BILL_INDEX ตอนเขียนบิล แล้วใช้เทียบตอนส่งซ้ำ (REVISION_CONFLICT) และตอนย้ายเครื่องหลัก (different:detail)
// เดิมเอา "รายการย่อยทั้งก้อน" ที่แอปส่งมาคิด → วันไหนแอปเพิ่มช่องในรายการย่อย/ก้อนเงิน บิลเก่าทุกใบ hash ไม่ตรงทันที
// ตอนนี้หยิบเฉพาะช่องในรายการข้างล่าง — ช่องใหม่ที่แอปส่งมาเพิ่มไม่กระทบ hash · บิลที่มีแค่ช่องเหล่านี้ได้ hash เท่าเดิมทุกตัว
// ⚠️ ห้ามแก้รายการนี้ (หรือสูตรใน canonicalBillHash_) โดยไม่ทำรุ่นใหม่ที่ยังอ่าน hash รุ่นเก่าได้ — tests/test_audit_20261008_d.js เฝ้าไว้
var BILL_HASH_LINE_FIELDS_ = ['price', 'netPrice', 'vatable'];
var BILL_HASH_PAYMENT_FIELDS_ = ['method', 'amount'];
function pickHashFields_(list, fields) {
  if (!Array.isArray(list)) return list;
  return list.map(function (item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    var out = {};
    fields.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(item, k) && item[k] !== undefined) out[k] = item[k]; });
    return out;
  });
}
function canonicalBillHash_(data, validated) {
  var value = { id: String(data.id), date: Number(new Date(data.date)), customerName: data.customerName || '',
    services: data.services || [], staffNames: data.staffNames || [], lines: pickHashFields_(data.lines || [], BILL_HASH_LINE_FIELDS_),
    subtotal: validated.subtotal, discount: validated.discount, total: validated.total,
    nonVatBase: validated.nonVatBase, vatableBase: validated.vatableBase, vatAmount: validated.vatAmount,
    rounding: validated.rounding, vatRate: data.vatRate || 0,
    paymentMethod: data.paymentMethod || 'cash', payments: pickHashFields_(validated.payments || [], BILL_HASH_PAYMENT_FIELDS_) };
  function sort(o) {
    if (Array.isArray(o)) return o.map(sort);
    if (o && typeof o === 'object') { var out = {}; Object.keys(o).sort().forEach(function(k) { if (o[k] !== undefined) out[k] = sort(o[k]); }); return out; }
    return o;
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(sort(value)), Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function archiveVoidEvent_(id, event) {
  event = strictVoidEvent_(event);
  var sheet = ledgerSheet_(VOID_ARCHIVE_NAME_, ['id', 'voidedAt', 'restoredAt']);
  var found = ledgerEntry_(sheet, id, 3);
  var prev = found ? strictVoidEvent_({ v: found.cells[1], r: found.cells[2] }) : { v: 0, r: 0 };
  var combined = strictVoidEvent_({ v: Math.max(prev.v, event.v), r: Math.max(prev.r, event.r) });
  var row = [id, combined.v, combined.r];
  ledgerWriteRow_(sheet, found ? found.row : 0, row, 1);
  SpreadsheetApp.flush();
  var verified = ledgerEntry_(sheet, id, 3);
  if (!verified || JSON.stringify(verified.cells) !== JSON.stringify(row)) throw new Error('ยืนยันทะเบียนยกเลิกถาวรไม่ได้');
}
function archivedVoidEvent_(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VOID_ARCHIVE_NAME_);
  if (!sheet) return { v: 0, r: 0 };
  sheet = ledgerSheet_(VOID_ARCHIVE_NAME_, ['id', 'voidedAt', 'restoredAt']);
  var found = ledgerEntry_(sheet, id, 3);
  if (!found) return { v: 0, r: 0 };
  return strictVoidEvent_({ v: found.cells[1], r: found.cells[2] });
}

// ตรวจ 14 ต.ค. ข้อ 11: ทะเบียน "เสีย" (ส่งซ้ำก็ไม่หาย) ต้องแยกจาก "อ่านไม่ได้ชั่วคราว" — scope 'all' = ทั้งทะเบียน · 'bill' = เฉพาะบิลนั้น
function registryCorrupt_(message, scope) { var e = new Error(message); e.registryCorrupt = scope === 'all' ? 'all' : 'bill'; return e; }
// คืน response REGISTRY_CORRUPT ถ้าทะเบียนเสีย · null = ปัญหาชั่วคราว (ผู้เรียกตอบ REGISTRY_UNAVAILABLE ตามเดิม)
// ข้อความเป็นของเราเอง (ไม่ส่งข้อความ error ดิบของ JSON.parse — ตัวแปลข้อความของแอปจะเข้าใจผิดว่าเป็นหน้าล็อกอิน)
// what = ชื่อทะเบียนที่เสีย (ไม่ส่ง = ทะเบียนบิลที่ยกเลิก ตามเดิม) · ข้อ 41: ทะเบียนเลขบิล (_POS_BILL_INDEX) ใช้ BILL_INDEX_LABEL_
var BILL_INDEX_LABEL_ = "ทะเบียนเลขบิล (แท็บซ่อน " + BILL_INDEX_NAME_ + ")";
function registryCorruptResponse_(regErr, billId, notDone, what) {
  if (!regErr || !regErr.registryCorrupt) return null;
  var scope = regErr.registryCorrupt, reason = String(regErr.message || regErr).slice(0, 200);
  return json("error", (what || "ทะเบียนบิลที่ยกเลิกบนชีต") + "เสีย" + (scope === 'all' ? " (ทั้งทะเบียน)" : " (เฉพาะบิล " + billId + ")") +
    " จึง" + notDone + " — ส่งซ้ำก็ไม่หาย ให้ผู้ดูแลแก้ในชีต/Script Properties: " + reason,
    { billId: billId, scope: scope, reason: reason }, "REGISTRY_CORRUPT");
}

function strictVoidEvent_(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw registryCorrupt_('ทะเบียนยกเลิกอ่านไม่ได้', 'bill');
  function time(n) { return typeof n === 'number' && isFinite(n) && n >= 0 && n % 1 === 0 && n <= 9007199254740991; }
  if (!time(event.v) || !time(event.r) || (event.w !== undefined && !time(event.w)) ||
      (event.v > 0 && event.v === event.r)) throw registryCorrupt_('เวลาในทะเบียนยกเลิกเสีย — ต้องตรวจข้อมูลต้นทาง', 'bill');
  return { v: event.v, r: event.r };
}

function handleTransaction(data, ss) {
  var billId = readBillId_(data.id);
  if (!BILL_ID_RE.test(billId)) {
    return json("error", "เลขที่บิลไม่ถูกต้อง", null, "INVALID_BILL_ID");
  }
  // ── ยอดเงิน/ช่องทางจ่าย/วันที่ ต้องผ่านกติกาชุดเดียวกับ validateBillRecord() ของแอป ──
  // (ตรวจเป็นสตางค์จำนวนเต็ม · ชนิดต้องเป็นตัวเลขจริง · กติกาบิลรุ่นเก่าเขียนไว้ชัดใน validateBillPayload_)
  var v = validateBillPayload_(data);
  if (!v.ok) return json("error", v.message, { billId: billId, problems: v.problems }, v.code);
  var subtotal = v.subtotal, discount = v.discount, total = v.total;

  // เดือนของแท็บ = เดือนทำการที่ผ่านการตรวจแล้วว่าตรงกับวันที่ของบิล (ดู validateBillPayload_)
  // — ไม่ใช้ timezone ของโปรเจกต์ Apps Script อีกต่อไป จึงไม่ลงแท็บผิดเดือนแม้ตั้ง timezone ผิด
  var monthYear = v.monthKey;
  var priorSheet = ss.getSheetByName(monthYear);
  if (priorSheet && !billSheetSchema_(priorSheet) && !billSheetIsBlank_(priorSheet) && !repairUnfinishedBillHeader_(priorSheet)) {
    return json('error', 'โครงสร้างคอลัมน์ของแท็บ ' + monthYear + ' ไม่ตรงกับระบบ — ตรวจหัวตารางก่อนส่งบิล', null, 'SCHEMA_MISMATCH');
  }
  var index = ledgerSheet_(BILL_INDEX_NAME_, ['id', 'month', 'version', 'hash', 'applied'], ss);
  var indexMarker = null;
  try { indexMarker = migrateLegacyBillIndex_(ss, index); }
  catch (migrationErr) { return json('error', 'อัปเกรดทะเบียนเลขบิลยังไม่สำเร็จ: ' + String(migrationErr.message || migrationErr), null, 'BILL_INDEX_MIGRATION_REQUIRED'); }
  var indexed;
  // ข้อ 41 (ตรวจ 19 ต.ค. 2569): เลขบิลนี้มีหลายแถวในทะเบียน — เดิมหลุดเป็น SERVER_ERROR ที่ไม่บอกอะไร
  // ตอนนี้ตอบ REGISTRY_CORRUPT ระดับบิล (แอปส่งบิลใบอื่นต่อได้เหมือนเดิม) พร้อมเลขบิลและวิธีแก้
  try { indexed = billIndexEntry_(index, billId, ss); }
  catch (indexErr) {
    var corruptIndex = registryCorruptResponse_(indexErr, billId, "ยังไม่บันทึกบิลใบนี้", BILL_INDEX_LABEL_);
    if (corruptIndex) return corruptIndex;
    throw indexErr;
  }
  if (indexed && indexed.cells[3] === 'duplicate') {
    var stillDuplicate = resolveDuplicateIndexEntry_(ss, index, indexed, billId, monthYear);
    if (stillDuplicate) return stillDuplicate;
    indexed = billIndexEntry_(index, billId, ss);
  }
  var digest = canonicalBillHash_(data, v);
  if (indexed && String(indexed.cells[1]) !== monthYear) {
    var physicalMonth = String(indexed.cells[1]), physicalSheet = ss.getSheetByName(physicalMonth);
    var physicalRows = physicalSheet ? findBillRows_(physicalSheet, billId) : [];
    var businessRows = priorSheet ? findBillRows_(priorSheet, billId) : [];
    if (physicalRows.length + businessRows.length > 1) return json('error', 'พบเลขบิลซ้ำหลายแถว — ยังไม่เขียนทับ', { billId: billId }, 'DUPLICATE_BILL_ID');
    if (physicalRows.length !== 1 || !billSheetSchema_(physicalSheet) ||
        !legacyBillMonthMatches_(physicalMonth, monthYear, physicalSheet.getRange(physicalRows[0], 2).getValue(), ss.getSpreadsheetTimeZone())) {
      return json('error', 'เลขบิลนี้ผูกกับเดือนอื่นแล้ว', { billId: billId, month: physicalMonth }, 'CROSS_MONTH_BILL_ID');
    }
    // คงแถวและเดือนในทะเบียนไว้แท็บเดิม: การส่งซ้ำซ่อมต่อได้ตาม revision/hash เดิม ไม่เสี่ยงมีสองแถวจากการย้ายค้าง
    monthYear = physicalMonth;
  }
  if (!indexed) {
    // บิลที่ยังไม่อยู่ในทะเบียน = เขียนก่อนมีทะเบียน (หรือยังไม่เคยเขียน) — เลขเดียวกันจะไปโผล่อีกแท็บได้
    // ก็จากเขตเวลา/เส้นตัดวันเพี้ยน (ข้อ 3) ซึ่งเลื่อนได้ไม่เกินเดือนติดกัน จึงไล่ดูแค่เดือนก่อน/หลัง
    // ตรวจรอบ Claude 7 ต.ค. 2569: เดิมไล่อ่านทุกแท็บเดือนทุกบิลใหม่ (ถือ lock ไว้) — ช้าลงทุกเดือนที่ร้านเปิด
    var near = adjacentMonthKeys_(monthYear);
    for (var mi = 0; mi < near.length; mi++) {
      var other = ss.getSheetByName(near[mi]);
      if (other && findBillRows_(other, billId).length) {
        return json('error', 'พบเลขบิลนี้ในเดือนอื่น — ให้เจ้าของตรวจข้อมูลก่อน', { billId: billId, month: near[mi] }, 'CROSS_MONTH_BILL_ID');
      }
    }
  }
  var sheet = getOrCreateSheet(ss, monthYear, BILL_HEADERS, "#1e293b");
  // แท็บที่สร้างไว้ก่อนหน้านี้ยังเป็นโครง 9 คอลัมน์ — เติมช่อง VAT ให้ก่อนเขียนแถว
  migrateBillSheetAddVatColumns_(sheet);

  // ── ด่านสุดท้ายก่อนแตะข้อมูล: โครงสร้างต้องเป็นแบบที่รู้จักเท่านั้น ──────
  // ถ้าไม่รู้จัก ให้หยุดแล้วบอกตรง ๆ ดีกว่าเดาแล้วเขียนลงผิดช่อง
  // บิลไม่หาย — ฝั่งแอปเก็บไว้เป็น "ยังไม่ซิงก์" แล้วส่งใหม่เองหลังแก้หัวตารางเสร็จ
  var schema = billSheetSchema_(sheet);
  if (!schema && billSheetIsBlank_(sheet)) {
    // แท็บว่างสนิท — เติมหัวตารางให้แล้วไปต่อ ดีกว่าปฏิเสธจนบิลค้างทั้งเดือนโดยไม่มีเหตุผล
    styleHeaderRow(sheet, 1, BILL_HEADERS, "#1e293b", "white");
    sheet.setFrozenRows(1);
    schema = billSheetSchema_(sheet);
  }
  if (!schema) {
    return json("error",
      "โครงสร้างคอลัมน์ของแท็บ " + monthYear + " ไม่ตรงกับที่ระบบรู้จัก — ยังไม่ได้บันทึกบิลใบนี้ " +
      "เพื่อกันข้อมูลลงผิดช่อง ให้ตรวจหัวตารางแถวแรกของแท็บนี้ว่าถูกแก้ไข/สลับ/แทรกคอลัมน์หรือเปล่า",
      null, "SCHEMA_MISMATCH");
  }
  var hasVat = (schema === "vat");

  // ── รุ่นของบิล: ต้องอ่านได้ก่อนแตะอะไร ─────────────────────────────────
  var incoming = readBillVersion_(data);
  if (!incoming) return json("error", "รุ่นของบิลที่ส่งมาใช้ไม่ได้ (rev/revEpoch)", { billId: billId }, "INVALID_REVISION");

  if (indexed) {
    var indexedVersion = parseBillVersionCell_(indexed.cells[2]);
    if (!indexedVersion || (!/^[a-f0-9]{64}$/.test(String(indexed.cells[3])) && indexed.cells[3] !== 'legacy')) throw new Error('ทะเบียนรุ่นบิลอ่านไม่ได้');
    var indexComparison = compareBillVersion_(incoming, indexedVersion);
    if (indexComparison < 0) return json('error', 'คำขอรุ่นเก่ากว่าทะเบียนบิล', { billId: billId, stored: indexedVersion }, 'STALE_REVISION');
    if (indexComparison === 0 && indexed.cells[3] !== 'legacy' && String(indexed.cells[3]) !== digest) return json('error', 'บิลรุ่นเดียวกันมีข้อมูลต่างกัน — ไม่เขียนทับ', { billId: billId }, 'REVISION_CONFLICT');
  }
  // ── บิลเลขเดียวกันมีหลายแถว = ไม่รู้ว่าแถวไหนคือของจริง → หยุด ไม่เดาแถวแรก ─────────
  var rows = findBillRows_(sheet, billId);
  if (rows.length > 1) {
    return json("error",
      "พบบิลเลขที่ " + billId + " ซ้ำ " + rows.length + " แถวในแท็บ " + monthYear + " (แถว " + rows.join(", ") + ") — " +
      "ยังไม่ได้บันทึก ให้ตรวจแล้วลบแถวที่ซ้ำในชีตก่อน", { billId: billId, rows: rows }, "DUPLICATE_BILL_ID");
  }
  var revCol = billRevColumn_(sheet);
  if (revCol < 0) {
    return json("error", "หัวคอลัมน์ \"" + BILL_REV_HEADER + "\" ในแท็บ " + monthYear + " ซ้ำกัน — ยังไม่ได้บันทึก", null, "SCHEMA_MISMATCH");
  }
  // หมายเหตุบิล (14 ต.ค. 2569) — หัวคอลัมน์ซ้ำ = ไม่รู้จะเขียนช่องไหน → หยุดก่อนแตะอะไร (ไม่เงียบ · แก้หัวแล้วแอปส่งใหม่เอง)
  // บิลที่ไม่มีหมายเหตุไม่สนใจคอลัมน์นี้เลย จึงไม่ติดด่านนี้
  var billNote = readBillNote_(data), billNoteCol = billNote.given ? billNoteColumn_(sheet) : 0;
  if (billNoteCol < 0) {
    return json("error", "หัวคอลัมน์ \"" + BILL_NOTE_HEADER + "\" ในแท็บ " + monthYear + " ซ้ำกัน — ยังไม่ได้บันทึก", null, "SCHEMA_MISMATCH");
  }
  var foundRow = rows.length ? rows[0] : -1;
  if (foundRow > -1) {
    var stored = { epoch: 0, rev: 0 };
    if (revCol > 0) {
      var cellRaw = sheet.getRange(foundRow, revCol).getDisplayValue();
      if (String(cellRaw || "").trim() !== "") {
        stored = parseBillVersionCell_(cellRaw);
        if (!stored) {
          return json("error", "ช่องรุ่นบิลของแถว " + foundRow + " ในแท็บ " + monthYear + " อ่านไม่ได้ (" + String(cellRaw).slice(0, 40) + ") — ยังไม่ได้บันทึก",
            { billId: billId }, "SCHEMA_MISMATCH");
        }
      }
    }
    if (compareBillVersion_(incoming, stored) < 0) {
      // คำขอรุ่นเก่ากว่าที่อยู่บนชีต = มาถึงทีหลัง (หรือเครื่องที่ข้อมูลเก่ากว่า) → ห้ามทับของใหม่
      return json("error",
        "บิลเลขที่ " + billId + " บนชีตเป็นรุ่นใหม่กว่า (" + stored.epoch + ":" + stored.rev + ") ที่ส่งมา (" +
        incoming.epoch + ":" + incoming.rev + ") — ไม่เขียนทับ", { billId: billId, stored: stored, got: incoming }, "STALE_REVISION");
    }
  }

  // ⚠️ ด่านนี้ต้องอยู่ "ก่อนเขียนแถว" แต่ต้องอยู่ "หลัง" ด่านตรวจรูปแบบทุกด่าน
  // ไม่งั้นบิลที่ผิดรูปแบบอยู่แล้ว (หัวตารางเพี้ยน/ยอดไม่ลงตัว/ช่องทางจ่ายไม่รู้จัก)
  // จะได้ error เรื่องทะเบียนแทนเหตุผลจริง แล้วเจ้าของไล่ปัญหาผิดทาง
  // ── บิลที่ถูกยกเลิกไปแล้ว ห้ามกลับขึ้นชีตอีก ────────────────────────
  // คำขอที่ client หมดเวลารอไปแล้วยังเดินทางมาถึงได้ ปลายทางจึงต้องเป็นคนตัดสินใจสุดท้าย
  var regEntry, pendingRestoreMark = null;   // ข้อ 15: การกู้บิลที่ยกเลิกแล้ว จดทะเบียนหลังผ่านด่านปฏิเสธทุกด่าน
  try {
    regEntry = readBillRegistryStrict_(billId);
  } catch (regErr) {
    // ⚠️ อ่านทะเบียนไม่ได้ = "ไม่รู้" ว่าบิลนี้ถูกยกเลิกไปแล้วหรือยัง → ปฏิเสธไว้ก่อน (แอปลองใหม่เอง)
    Logger.log("readBillRegistry failed: " + regErr);
    var corruptTx = registryCorruptResponse_(regErr, billId, "ยังไม่บันทึกบิลใบนี้");   // ตรวจ 14 ต.ค. ข้อ 11
    if (corruptTx) return corruptTx;
    return json("error",
      "ตรวจทะเบียนบิลที่ยกเลิกไม่ได้ชั่วคราว จึงยังไม่บันทึกบิลใบนี้ — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "REGISTRY_UNAVAILABLE");
  }
  // ── เจตนา "คืนบิล" ต้องพิสูจน์ได้ว่าเกิด **หลัง** การยกเลิก ────────────
  // restoredAt กับ voidedAt มาจากนาฬิกาเครื่องขายเครื่องเดียวกัน เทียบกันได้ตรง ๆ
  var lastEvent = billEventOf_(regEntry);
  if (lastEvent && lastEvent.type === "voided") {
    var recoveryPrimary = readPrimaryDevice_();
    if (recoveryPrimary && recoveryPrimary.recovery) return json('error', 'รับช่วงฉุกเฉิน: ยังคืนบิลที่ยกเลิกไม่ได้จนกู้ข้อมูลครบ', { billId: billId }, 'RECOVERY_BILL_PROTECTED');
    var voidedAt = lastEvent.at;
    var restoredAt = Number(data.restoredAt);
    var intentionalRestore = (data.allowVoidedRestore === true) && isFinite(restoredAt) && restoredAt > voidedAt;
    if (!intentionalRestore) {
      // ส่ง voidedAt กลับไปด้วย — ให้เจ้าของตัดสินใจที่แอป (คืนบิลด้วยเวลาที่ใหม่กว่า หรือยกเลิกในเครื่องตาม)
      return json("error",
        "บิลเลขที่ " + billId + " ถูกยกเลิกไปแล้ว จึงไม่บันทึกซ้ำ (คำขอนี้น่าจะค้างมาจากก่อนการยกเลิก)",
        { billId: billId, voidedAt: Number(voidedAt) || 0 }, "ALREADY_VOIDED");
    }
    // ⚠️ บันทึกสถานะกู้คืน **ก่อน** เขียนแถว — ถ้าเขียนแถวก่อนแล้วบันทึกทะเบียนไม่ได้
    // จะได้ "บิลอยู่บนชีตแต่ทะเบียนบอกว่าถูกยกเลิก" ซึ่งเปิดทางให้คำสั่งยกเลิกเก่ากลับมาลบบิลนั้นได้อีก
    // ตรวจ 13 ต.ค. 2569 ข้อ 15: แต่ต้อง "หลังด่านปฏิเสธทุกด่าน" (STALE_REVISION / REVISION_CONFLICT / RECOVERY_BILL_PROTECTED)
    // เดิมบันทึกตรงนี้ก่อนด่านเหล่านั้น — คำขอที่ถูกปฏิเสธทิ้งทะเบียนว่า "กู้แล้ว" ไว้ แล้วคำสั่งยกเลิกที่ค้างได้
    // VOID_SUPERSEDED_BY_RESTORE แอปทิ้งงานลบ แถวบิลที่ยกเลิกแล้วค้างบนชีต · ย้ายไปทำก่อนจองทะเบียนบิลด้านล่าง
    pendingRestoreMark = { restoredAt: restoredAt, regEntry: regEntry };
  }

  var payText = payLabelFor_(data.paymentMethod, v.payments);

  // ── 4 ช่อง VAT ────────────────────────────────────────────────
  // บิลรุ่นก่อนมี VAT ไม่มีฟิลด์พวกนี้เลย → คำนวณย้อนให้ "ไม่คิด VAT" = ที่เหลือทั้งหมด
  // แถวจึงบวกลงตัวเสมอไม่ว่าบิลจะรุ่นไหน · ต้องเช็ค != null ไม่ใช่ความจริงเท็จ
  // เพราะบิลที่ทุกอย่างคิด VAT หมดจะส่ง nonVatBase มาเป็น 0 ซึ่งเป็นค่าที่ถูกต้อง
  // บิลรุ่นก่อนมี VAT: ไม่คิด VAT = ยอดสุทธิทั้งหมด (ค่าที่ผ่านการตรวจแล้วจาก validateBillPayload_)
  var vatableBase = v.vatableBase, vatAmount = v.vatAmount, rounding = v.rounding, nonVatBase = v.nonVatBase;

  var billIdCell = safeCell(billId);
  // วันเวลาตั้งใจ "ไม่" ผ่าน safeCell — ให้ Sheets เก็บเป็นค่าวันที่จริง (เจ้าของเรียง/กรองตามเวลาในชีตได้)
  // ฝั่งอ่านกลับ (handleListBills) แปลงค่าวันที่กลับเป็นข้อความรูปแบบเดิมด้วย cellText_()
  var timeCell = v.dateTimeStr;
  var custCell  = safeCell(data.customerName);
  var svcCell   = safeCell((Array.isArray(data.services) ? data.services : []).join(", "));
  var staffCell = safeCell((Array.isArray(data.staffNames) ? data.staffNames : []).join(", "));

  // ถึงตรงนี้ได้แปลว่าโครงสร้างถูกตรวจแล้วว่าตรงเป๊ะกับแบบใดแบบหนึ่ง
  // 'legacy' คือแท็บเก่า 9 คอลัมน์ที่ยืนยันแล้วว่าหัวตารางตรงจริง ไม่ใช่ "เดาว่าน่าจะเป็น"
  var row = hasVat
    ? [billIdCell, timeCell, custCell, svcCell, payText,
       subtotal, discount, nonVatBase, vatableBase, vatAmount, rounding, total, staffCell]
    : [billIdCell, timeCell, custCell, svcCell, payText,
       subtotal, discount, total, staffCell];
  var moneyCols = hasVat ? 7 : 3;   // ช่องเงินติดกันตั้งแต่คอลัมน์ 6

  // ── บิลที่มาจาก "การกู้ไฟล์สำรอง": ชีตถูกแก้หลังไฟล์นั้นหรือเปล่า (รอบตรวจ 5 ข้อ 1) ─────────
  // แอปส่ง restoreBase = รุ่นของบิลตามที่ไฟล์สำรองรู้จัก (ก่อนกู้จะยกยุคให้ชนะคำขอเก่าที่ค้างในเน็ต)
  // ⚠️ เดิมการกู้ "ชนะเสมอ" — เจ้าของแก้บิล 300 → 200 แล้วเครื่องพัง กู้ไฟล์ที่ทำก่อนแก้
  //    ชีตกลับเป็น 300 เงียบ ๆ และปุ่มตรวจความตรงกันก็จับไม่ได้ (เครื่องกับชีตตรงกันแล้ว ผิดทั้งคู่)
  // ชีตมีรุ่นใหม่กว่าที่ไฟล์รู้จัก และยอด/ช่องทาง/พนักงาน/หมายเหตุบิลต่างจากที่จะเขียน → ไม่เขียนทับ
  //        ตอบ STALE_REVISION ให้เจ้าของเลือกที่แอป (ใช้ข้อมูลในเครื่องทับ / แก้บิลในเครื่องให้ตรงกับชีต)
  //        ค่าเหมือนกันทุกช่อง (เช่นกู้ไฟล์เดิมซ้ำ หรือรุ่นเปลี่ยนเพราะการกู้รอบก่อน) = เขียนต่อตามปกติ
  // แอปรุ่นก่อนไม่ส่ง restoreBase = กติกาเดิมทุกอย่าง
  if (foundRow > -1) {
    var restoreBase = readRestoreBase_(data);
    if (restoreBase && compareBillVersion_(stored, restoreBase) > 0) {
      var current = sheet.getRange(foundRow, 1, 1, row.length).getValues()[0];
      var changes = billRowChanges_(current, row, hasVat);
      changes = changes.concat(billNoteChanges_(billNoteCol > 0 ? sheet.getRange(foundRow, billNoteCol).getDisplayValue() : '', billNote));
      if (changes.length) {
        var shown = changes.slice(0, 3).map(function (c) {
          return c.field + " บนชีต " + c.sheet + " · ในไฟล์ที่กู้ " + c.local;
        }).join(" / ");
        return json("error",
          "บิลเลขที่ " + billId + " บนชีตถูกแก้หลังไฟล์สำรองที่กู้มา (" + shown + ") — ยังไม่เขียนทับ ให้เจ้าของเลือกที่แอป",
          { billId: billId, stored: stored, got: incoming, base: restoreBase, changes: changes }, "STALE_REVISION");
      }
    }
  }

  // Legacy rows have no hash: compare all persisted bill fields before adopting them.
  if (foundRow > -1 && compareBillVersion_(incoming, stored) === 0 && (!indexed || indexed.cells[3] === 'legacy')) {
    var equalChanges = billRowChanges_(sheet.getRange(foundRow, 1, 1, row.length).getValues()[0], row, hasVat);
    if (equalChanges.length) return json('error', 'บิลรุ่นเดียวกันมีข้อมูลต่างกัน — ไม่เขียนทับ', { billId: billId, changes: equalChanges }, 'REVISION_CONFLICT');
  }

  // Emergency takeover accepts new sales and unchanged retries only. Protect history and
  // already uploaded new bills until the owner completes and verifies the recovery.
  // ตรวจรอบ Claude 7 ต.ค. 2569 (รอบ 3):
  //  · ปกป้องทุกบิลที่ "มีแถวบนชีต" แม้ไม่อยู่ในทะเบียน (แถวทะเบียนถูกลบด้วยมือ) — เดิมต้องมี indexed จึงเขียนทับได้
  //  · บิลใหม่ที่จองทะเบียนแล้วแต่แถวยังไม่ลง (applied = 0 · Apps Script ล้มกลางทาง) และส่งซ้ำด้วยรุ่น+ข้อมูลเดิมเป๊ะ
  //    = ซ่อมการเขียนครั้งแรก ไม่ใช่การแก้ประวัติ — เดิมถูกปฏิเสธจนปลดพัก ทั้งที่ช่วงนี้ Drive backup ก็พักอยู่
  var primary = readPrimaryDevice_();
  if (primary && primary.recovery && (indexed || foundRow > -1)) {
    var persisted = foundRow > -1 ? sheet.getRange(foundRow, 1, 1, row.length).getValues()[0] : null;
    var reservedVersion = indexed ? parseBillVersionCell_(indexed.cells[2]) : null;
    var repairingNewSale = !!indexed && !persisted && String(indexed.cells[4]) === '0' &&
      String(indexed.cells[3]) === digest && !!reservedVersion && compareBillVersion_(incoming, reservedVersion) === 0;
    if (!repairingNewSale) {
      if (!persisted || billRowChanges_(persisted, row, hasVat).length ||
          (indexed && indexed.cells[3] !== 'legacy' && String(indexed.cells[3]) !== digest) ||
          billNoteChanges_(billNoteCol > 0 ? sheet.getRange(foundRow, billNoteCol).getDisplayValue() : '', billNote).length) {
        return json('error', 'รับช่วงฉุกเฉิน: ไม่แก้หรือคืนบิลเดิมจนกู้ข้อมูลครบ', { billId: billId }, 'RECOVERY_BILL_PROTECTED');
      }
      return json('success', 'บิลเดิมบนชีตตรงกัน — คงข้อมูลไว้ระหว่างกู้ฉุกเฉิน', { billId: billId, sheet: monthYear });
    }
  }
  if (pendingRestoreMark && !markBillRestored_(billId, pendingRestoreMark.restoredAt, pendingRestoreMark.regEntry)) {
    return json("error",
      "บันทึกสถานะกู้คืนบิลไม่สำเร็จ จึงยังไม่เขียนแถว — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "RESTORE_REGISTRY_FAILED");
  }
  var indexRow = [billId, monthYear, 'v1:' + incoming.epoch + ':' + incoming.rev, digest, 0];
  if (indexed) ledgerWriteRow_(index, indexed.row, indexRow, 4);
  else { indexed = { row: ledgerWriteRow_(index, 0, indexRow, 4) }; noteBillIndexGrowth_(indexed.row - 1, indexMarker); }
  // Reserve version + payload before the row. Identical retries can repair an interrupted write.
  SpreadsheetApp.flush();
  // ── เขียน: "รุ่นก่อน แล้วค่อยแถว" ──────────────────────────────────────
  // ถ้าเขียนรุ่นสำเร็จแต่แถวล้ม → แอปได้ error แล้วส่งรุ่นเดิมซ้ำ = เท่ากัน → เขียนทับได้ (ไม่ค้าง)
  // ถ้ากลับลำดับ (แถวก่อน) แล้วเขียนรุ่นล้ม → คำขอรุ่นเก่ากว่าที่มาถึงทีหลังจะทับแถวใหม่ได้
  var verCell = incoming.present ? ("v1:" + incoming.epoch + ":" + incoming.rev) : "";
  if (foundRow > -1) {
    if (incoming.present) {
      revCol = ensureBillRevColumn_(sheet);
      sheet.getRange(foundRow, revCol).setValue(verCell);
    }
    sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(foundRow, 6, 1, moneyCols).setNumberFormat("#,##0.00");
    // หมายเหตุ: ส่งมา = เขียน/ล้างช่องของแถวนี้ · ไม่ส่ง = ไม่แตะ · ล้างหมายเหตุในเดือนที่ยังไม่มีคอลัมน์ = ไม่ต้องสร้างคอลัมน์
    if (billNote.given && (billNote.text || billNoteCol > 0)) {
      sheet.getRange(foundRow, ensureBillNoteColumn_(sheet)).setValue(safeCell(billNote.text));
    }
    index.getRange(indexed.row, 5).setValue(1);
    return json("success", "อัปเดตข้อมูลบิลแล้ว", { billId: billId, sheet: monthYear, updated: true, version: incoming });
  } else {
    // แถวใหม่: ใส่รุ่นไปใน appendRow ครั้งเดียวกัน (ช่องระหว่างทางของแถวใหม่ว่างอยู่แล้ว ไม่ทับอะไร)
    var full = row.slice();
    if (incoming.present) {
      revCol = ensureBillRevColumn_(sheet);
      while (full.length < revCol - 1) full.push("");
      full[revCol - 1] = verCell;
    }
    // หมายเหตุ: ใส่ไปใน appendRow ครั้งเดียวกัน · บิลไม่มีหมายเหตุ = ไม่สร้างคอลัมน์
    if (billNote.given && billNote.text) {
      var noteCol = ensureBillNoteColumn_(sheet);
      while (full.length < noteCol) full.push("");
      full[noteCol - 1] = safeCell(billNote.text);
    }
    sheet.appendRow(full);
    var lr = sheet.getLastRow();
    sheet.getRange(lr, 6, 1, moneyCols).setNumberFormat("#,##0.00");
    index.getRange(indexed.row, 5).setValue(1);
    return json("success", "บันทึกบิลแล้ว", { billId: billId, sheet: monthYear, updated: false, version: incoming });
  }
}

// ─────────────────────────────────────────────
//  LIST BILLS — อ่านรายการบิลของแท็บเดือนหนึ่ง (อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น)
// ─────────────────────────────────────────────
// ใช้โดยหน้า "ตรวจความตรงกันกับชีต" ฝั่งแอป
// ⚠️ จำเป็นเพราะการกู้ข้อมูลจากไฟล์เก่าเปลี่ยน "ในเครื่อง" ทั้งก้อน แต่บนชีตทำได้แค่ upsert
// ของที่อยู่ในไฟล์ บิลที่ขายหลังวันสำรองจึงยังอยู่บนชีตทั้งที่ในเครื่องไม่มีแล้ว
// เจ้าของต้องเห็นรายการต่างก่อน แล้วเป็นคนตัดสินใจเองว่าจะลบใบไหน — ระบบไม่ลบให้เอง
var LIST_BILLS_MAX = 5000;

// ⚠️ ข้อ 15: เดิมคืนแค่ เลขที่/เวลา/ลูกค้า/ยอด — ชีตที่ช่องทางจ่าย/VAT/พนักงานผิดแต่ยอดเท่าเดิม จึง "ตรงกัน"
// และฝั่งแอปเก็บลง Map ตามเลขที่บิล แถวซ้ำจึงถูกกลบเหลือแถวเดียว
// ตอนนี้คืนทุกช่องที่สำคัญ + เลขแถว (แถวซ้ำมาครบทุกแถว) + ขอบเขตที่อ่านจริง
function handleListBills(data, ss) {
  var monthYear = String(data.monthKey == null ? "" : data.monthKey);
  if (!isValidMonthKey_(monthYear))
    return json("error", "เดือนไม่ถูกต้อง (" + monthYear + ")", null, "INVALID_MONTH");

  var sheet = ss.getSheetByName(monthYear);
  if (!sheet)
    return json("success", "ยังไม่มีแท็บของเดือนนี้", { sheet: monthYear, exists: false, bills: [], truncated: false, rowsTotal: 0 });

  var schema = billSheetSchema_(sheet);
  if (!schema) {
    // หัวตารางเขียนค้าง (ข้อ 9) ไม่มีแถวข้อมูล = ยังว่าง เหมือนกัน (อ่านอย่างเดียว ไม่ซ่อมที่นี่ — บิลถัดไปซ่อมให้)
    if (billSheetIsBlank_(sheet) || headerIsUnfinishedPrefix_(sheet, [BILL_HEADERS, BILL_LEGACY_HEADERS]))
      return json("success", "แท็บเดือนนี้ยังว่าง", { sheet: monthYear, exists: true, bills: [], truncated: false, rowsTotal: 0 });
    return json("error",
      "โครงสร้างคอลัมน์ของแท็บ " + monthYear + " ไม่ตรงกับที่ระบบรู้จัก จึงอ่านรายการไม่ได้",
      null, "SCHEMA_MISMATCH");
  }

  var vat = (schema === "vat");
  var width = vat ? BILL_HEADERS.length : BILL_LEGACY_HEADERS.length;
  var revCol = billRevColumn_(sheet);
  var noteCol = billNoteColumn_(sheet);
  if (noteCol < 0) return json('error', 'หัวคอลัมน์ "' + BILL_NOTE_HEADER + '" ในแท็บ ' + monthYear + ' ซ้ำกัน จึงตรวจหมายเหตุไม่ได้', null, 'SCHEMA_MISMATCH');
  var lastRow = sheet.getLastRow();
  var bills = [], truncated = false, rowsTotal = 0, acceptedLedgerError = '';
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    var revs = revCol > 0 ? sheet.getRange(2, revCol, lastRow - 1, 1).getDisplayValues() : null;
    var notes = noteCol > 0 ? sheet.getRange(2, noteCol, lastRow - 1, 1).getDisplayValues() : null;
    // ⚠️ ช่อง "วันที่-เวลา" ถูก Sheets แปลงเป็นค่าวันที่ตั้งแต่ตอนเขียน — อ่านด้วย str() ตรง ๆ จะได้
    // "Thu Sep 10 2026 21:30:00 GMT+0700" แล้วหน้าตรวจความตรงกันฟ้องว่า "วันเวลาไม่ตรง" ทุกบิล
    var tz = spreadsheetTz_(ss);
    var str = function (v) { return cellText_(v, tz); };
    var num = function (v) { var n = Number(v); return (v === "" || v === null || !isFinite(n)) ? null : n; };
    // บิลที่เจ้าของยอมรับว่ารายละเอียดหายแล้ว (ปลดพักฉุกเฉิน) — หน้าตรวจความตรงกันต้องไม่เสนอให้ "ลบแถว" (หลักฐานเดียวของยอด)
    // ทะเบียนอ่านไม่ได้ (หัวคอลัมน์ถูกแก้) ต้องไม่ทำให้หน้าตรวจความตรงกันใช้ไม่ได้ทั้งหน้า — แจ้งแอปให้กันปุ่มลบทุกแถวแทน
    var acceptedLoss = Object.create(null);
    try { acceptedLoss = readRecoveryAccepted_(ss); }
    catch (accErr) { acceptedLedgerError = String((accErr && accErr.message) || accErr).slice(0, 200); }
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var id = readBillId_(r[0]);
      if (!id) continue;                       // แถวว่าง/แถวคั่น ไม่ใช่บิล
      rowsTotal++;
      if (bills.length >= LIST_BILLS_MAX) { truncated = true; continue; }   // นับต่อเพื่อบอกว่ามีทั้งหมดกี่แถว
      var b = {
        id: id, row: i + 2,
        // ⚠️ แถวบนชีตแก้ด้วยมือได้ เลขที่บิลจึงไม่การันตีรูปแบบเหมือน ID ที่ระบบสร้าง
        idOk: BILL_ID_RE.test(id),
        when: str(r[1]), customer: str(r[2]), services: str(r[3]), payment: str(r[4]),
        subtotal: num(r[5]), discount: num(r[6]),
        billNote: notes ? String(notes[i][0]) : ''
      };
      if (vat) {
        b.nonVatBase = num(r[7]); b.vatableBase = num(r[8]); b.vatAmount = num(r[9]); b.rounding = num(r[10]);
        b.total = num(r[11]); b.staff = str(r[12]);
      } else {
        b.total = num(r[7]); b.staff = str(r[8]);
      }
      if (revs) b.version = str(revs[i][0]);
      var al = acceptedLoss[id];
      if (al && al.kind === 'missing' && al.month === monthYear && al.version === String(b.version || '').trim() && al.total === b.total) b.acceptedLoss = true;
      bills.push(b);
    }
  }
  return json("success", "อ่านรายการบิลแล้ว",
    { sheet: monthYear, exists: true, schema: schema, bills: bills, truncated: truncated, rowsTotal: rowsTotal, max: LIST_BILLS_MAX,
      acceptedLedgerError: acceptedLedgerError || undefined });
}

// รายชื่อแท็บบิลรายเดือนทั้งหมดบนชีต (อ่านอย่างเดียว) — ให้ตรวจเดือนที่มี "เฉพาะบนคลาวด์" ได้ด้วย
function handleListBillMonths(data, ss) {
  var sheets = ss.getSheets(), out = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (!isValidMonthKey_(name)) continue;
    out.push({ monthKey: name, rows: Math.max(0, sheets[i].getLastRow() - 1) });
  }
  return json("success", "พบแท็บบิล " + out.length + " เดือน", { months: out });
}

// ─────────────────────────────────────────────
//  VOID TRANSACTION — ลบบิลรายการ
// ─────────────────────────────────────────────
// เก็บใน Script Properties — อยู่ข้ามการรันและไม่ต้องเพิ่มแท็บใหม่ในไฟล์ของร้าน
// เก็บเป็นแผนที่ billId → เวลาที่ยกเลิก และตัดตัวที่เก่ากว่า 90 วันทิ้งเพื่อไม่ให้โตไม่จำกัด
// 90 วันยาวกว่าอายุคำขอที่ค้างในเน็ตมหาศาล แต่สั้นพอให้ขนาดข้อมูลคงที่
// ⚠️ รุ่นก่อน ก.ย. 2569 เก็บทั้งทะเบียนใน property ค่าเดียว (POS_VOIDED_BILLS) แล้วต้อง "ตัดของเก่าทิ้ง"
// ให้อยู่ใต้เพดาน 9 KB — แปลว่าร้านที่ยกเลิกบิลเยอะ หลักฐานการยกเลิกหายก่อนครบ 90 วัน
// แล้วคำขอบันทึกเก่าที่มาถึงทีหลังก็สร้างแถวบิลที่ยกเลิกไปแล้วขึ้นมาใหม่ได้
// รุ่นนี้เก็บ "บิลละ 1 property" (POSVB_<เลขที่บิล>) — แต่ละค่าเล็กมาก ไม่ต้องตัดอะไรเพื่อบีบขนาด
// ลบเฉพาะที่ "หมดอายุ" (เกิน 90 วันนับจากเหตุการณ์ใหม่สุด) เท่านั้น
// และถ้าที่เก็บเต็มจริง ๆ = ปฏิเสธคำสั่ง (ให้แอปลองใหม่) ไม่ใช่ทิ้งหลักฐานเงียบ ๆ
var VOIDED_BILLS_PROPERTY = "POS_VOIDED_BILLS";            // รุ่นเก่า — อ่านเพื่อย้ายครั้งเดียว ไม่ลบทิ้ง (ย้อนรุ่นได้)
var VOID_REG_PREFIX = "POSVB_";
var VOID_REG_MIGRATED_PROPERTY = "POS_VOIDED_MIGRATED_V2";
var VOIDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// ย้ายทะเบียนรุ่นเก่าเข้ารูปแบบใหม่ (ครั้งเดียว) — อ่านไม่ได้ = throw ให้ผู้เรียกหยุด (ไม่เดาว่าไม่มีทะเบียน)
function migrateVoidRegistryIfNeeded_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(VOID_REG_MIGRATED_PROPERTY) === "1") return;
  var raw = props.getProperty(VOIDED_BILLS_PROPERTY);
  // ไม่มีทะเบียนรุ่นเก่า = ไม่มีอะไรต้องย้าย → ตั้งธงไว้เลย (ข้อ 8 · ตรวจ 19 ต.ค. 2569: เดิมไม่ตั้ง ทุกคำขออ่าน Script Properties
  // เพิ่ม 2 ครั้งตลอดไป) · ตั้งไม่ได้ (โควตาเต็ม) ไม่ใช่เหตุให้คำขอล้ม — รอบหน้าลองตั้งใหม่
  // ย้อนรุ่น: exportVoidRegistryForRollback() เขียน POS_VOIDED_BILLS ให้รุ่นเก่าอ่าน · รุ่นนี้ไม่ย้ายซ้ำเพราะธงตั้งแล้ว (ทะเบียนต่อบิลยังอยู่ครบ)
  if (!raw) {
    try { props.setProperty(VOID_REG_MIGRATED_PROPERTY, "1"); } catch (flagErr) { Logger.log("void registry flag not saved: " + flagErr); }
    return;
  }
  {
    var legacy;
    try { legacy = JSON.parse(raw); } catch (pe) { legacy = null; }
    if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) throw registryCorrupt_("ทะเบียนบิลที่ยกเลิก (รุ่นเก่า POS_VOIDED_BILLS) อ่านไม่ได้", 'all');
    var ids = Object.keys(legacy);
    for (var i = 0; i < ids.length; i++) {
      if (!BILL_ID_RE.test(ids[i])) continue;
      if (props.getProperty(VOID_REG_PREFIX + ids[i]) !== null) continue;   // มีข้อมูลรูปแบบใหม่อยู่แล้ว
      var original = legacy[ids[i]], n = Number(original);
      if ((typeof original !== 'number' && !(typeof original === 'string' && /^-?\d+$/.test(original))) ||
          !isFinite(n) || n % 1 !== 0 || Math.abs(n) > 9007199254740991) {
        props.setProperty(VOID_REG_PREFIX + ids[i], JSON.stringify({ invalidLegacy: original, v: null, r: null }));
        continue; // Preserve ambiguous legacy evidence and block only this bill.
      }
      if (n === 0) continue;
      // ค่าบวก = ยกเลิกเมื่อ n · ค่าลบ = กู้คืนเมื่อ |n| (ความหมายเดิมของรุ่นเก่า)
      props.setProperty(VOID_REG_PREFIX + ids[i], JSON.stringify(n > 0 ? { v: n, r: 0 } : { v: 0, r: -n }));
    }
  }
  props.setProperty(VOID_REG_MIGRATED_PROPERTY, "1");
}

// อ่านเหตุการณ์ของบิลหนึ่งใบแบบเข้ม — อ่านไม่ได้/ค่าเสีย = throw (ผู้เรียกต้องหยุด ห้ามถือว่าไม่มีทะเบียน)
// คืน { v: เวลายกเลิกล่าสุด, r: เวลากู้คืนล่าสุด } (0 = ไม่เคย) — เวลาทั้งหมดมาจากนาฬิกาเครื่องขาย
function readBillRegistryStrict_(billId) {
  migrateVoidRegistryIfNeeded_();
  var raw = PropertiesService.getScriptProperties().getProperty(VOID_REG_PREFIX + billId);
  var archived = archivedVoidEvent_(billId);
  if (raw === null || raw === undefined || raw === "") return archived;
  var o;
  try { o = JSON.parse(raw); } catch (pe) { throw registryCorrupt_('ทะเบียนยกเลิกของบิลนี้ (' + VOID_REG_PREFIX + billId + ') อ่านไม่ได้', 'bill'); }
  var event = strictVoidEvent_(o);
  return strictVoidEvent_({ v: Math.max(archived.v, event.v), r: Math.max(archived.r, event.r) });
}

// สถานะล่าสุด = เหตุการณ์ที่ใหม่กว่า (เวลาเท่ากันเกิดไม่ได้ เพราะทั้งสองทางต้อง "ใหม่กว่าอีกฝั่งอย่างเคร่งครัด")
function billEventOf_(e) {
  if (e.v > e.r) return { type: "voided", at: e.v };
  if (e.r > e.v) return { type: "restored", at: e.r };
  return null;
}

// เขียนแล้วอ่านกลับยืนยัน — true เมื่อยืนยันได้เท่านั้น
function writeBillRegistry_(billId, e) {
  try { e = strictVoidEvent_(e); } catch (invalid) { Logger.log('invalid registry event: ' + billId); return false; }
  // w = เวลาที่เซิร์ฟเวอร์เขียนรายการนี้ — ใช้ตัดสินอายุการเก็บ (ไม่ใช้นาฬิกาเครื่องขาย ดู pruneBillRegistry_)
  var val = JSON.stringify({ v: e.v, r: e.r, w: Date.now() });
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(VOID_REG_PREFIX + billId, val);
    if (props.getProperty(VOID_REG_PREFIX + billId) !== val) return false;
  } catch (err) {
    Logger.log("writeBillRegistry_ failed: " + err);
    return false;
  }
  // ลบรายการที่หมดอายุ — ล้มเหลวได้โดยไม่กระทบรายการที่เพิ่งเขียน (ทะเบียนยังถูกต้อง แค่ยังไม่ได้เก็บกวาด)
  try { pruneBillRegistry_(); } catch (err2) { Logger.log("pruneBillRegistry_ failed: " + err2); }
  return true;
}

// ลบรายการที่ "เซิร์ฟเวอร์เขียนครั้งล่าสุด" นานเกิน 90 วัน (นาฬิกาเซิร์ฟเวอร์เท่านั้น)
// ⚠️ เดิมวัดจากเวลาใหม่สุดในทะเบียนซึ่งมาจากนาฬิกาเครื่องขาย — เครื่องเดียวที่ตั้งเวลาเดินหน้าเกิน 90 วัน
// ยกเลิกบิลใบเดียวก็ลบทะเบียนของบิลอื่นทิ้งหมด แล้วบิลที่ยกเลิกไปแล้วกลับขึ้นชีตได้ถ้ามีคำขอส่งซ้ำมาช้า
// รายการรุ่นเก่าที่ยังไม่มี w: ใช้เวลาเหตุการณ์แทน แต่ไม่ลบถ้าเวลานั้นอยู่ในอนาคต (รอเวลาจริงผ่านไปก่อน)
function pruneBillRegistry_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now();
  var entries = [], bytes = 0;
  Object.keys(all).forEach(function(k) {
    if (k.indexOf(VOID_REG_PREFIX) !== 0) return;
    var size = k.length + all[k].length;
    bytes += size; // Invalid records remain evidence and still consume quota.
    // รายการที่อ่านไม่ได้ "ข้ามไว้" (ไม่ลบ ไม่ย้าย) — readBillRegistryStrict_ ปิดเฉพาะบิลใบนั้นเอง
    // เดิมรอบแก้ข้อ 4 ให้ JSON.parse โยนออกทั้งฟังก์ชัน: รายการเสียใบเดียวทำให้ไม่มีการย้าย/เก็บกวาดอีกเลย
    // (writeBillRegistry_ กลืน error ไว้) จน Script Properties เต็มโควตาแล้วการยกเลิกบิลทุกใบล้ม (ตรวจรอบ Claude)
    var o;
    try { o = JSON.parse(all[k]); strictVoidEvent_(o); } catch (parseErr) { Logger.log("skip unreadable registry " + k); return; }
    var t = o.w > 0 ? o.w : Math.max(o.v, o.r);
    entries.push({ key: k, event: o, at: t, size: size });
  });
  entries.sort(function(a, b) { return a.at - b.at; });
  entries.forEach(function(item) {
    // Keep hot properties below 128 KB, leaving room under the 500 KB platform quota.
    // Sheet events remain permanently, including evictions younger than 90 days.
    if ((item.at > 0 && now - item.at > VOIDED_RETENTION_MS) || bytes > 128 * 1024) {
      try {
        archiveVoidEvent_(item.key.slice(VOID_REG_PREFIX.length), item.event);
        props.deleteProperty(item.key); bytes -= item.size;
      } catch (archiveErr) { Logger.log('keep registry evidence ' + item.key + ': ' + archiveErr); }
    }
  });
}

// ลงทะเบียน "ยกเลิก" — เวลาไม่ถอยหลัง: คำสั่งยกเลิกเก่าที่มาถึงทีหลังไม่ทับเวลายกเลิกที่ใหม่กว่า
function markBillVoided_(billId, clientTs, entry) {
  var ts = Number(clientTs);
  if (!isFinite(ts) || ts <= 0) ts = Date.now();   // client รุ่นเก่าไม่ส่งเวลามา
  var e = entry || readBillRegistryStrict_(billId);
  return writeBillRegistry_(billId, { v: Math.max(e.v, ts), r: e.r });
}

// ลงทะเบียน "กู้คืน" — เวลาไม่ถอยหลังเช่นกัน (เก็บเวลาไว้ ไม่ลบทะเบียนทิ้ง: คำสั่งยกเลิกเก่าต้องแพ้การกู้)
function markBillRestored_(billId, restoredAt, entry) {
  var ts = Number(restoredAt);
  if (!isFinite(ts) || ts <= 0) ts = Date.now();
  var e = entry || readBillRegistryStrict_(billId);
  return writeBillRegistry_(billId, { v: e.v, r: Math.max(e.r, ts) });
}

// ใช้ก่อน "ย้อนกลับไปใช้ Apps Script รุ่นก่อน" เท่านั้น: เขียนทะเบียนรูปแบบใหม่กลับลง POS_VOIDED_BILLS
// (รุ่นก่อนอ่านได้แค่ค่าเดียว ≤ 8 KB — ใส่รายการใหม่สุดก่อนจนเต็มงบ แล้วบอกว่าตกหล่นกี่รายการ)
// ข้อ 68 (ตรวจ 19 ต.ค. 2569): รวมเหตุการณ์ที่ย้ายไปแท็บ _POS_VOID_ARCHIVE แล้วด้วย (เกิน 90 วัน / ทะเบียนเกินงบ)
//   เดิมส่งออกเฉพาะใน Script Properties — บิลที่ยกเลิกนานแล้วกลับขึ้นชีตได้ถ้ารุ่นเก่าได้คำขอส่งซ้ำ
// และล้างธง POS_VOIDED_MIGRATED_V2 — กลับมาใช้รุ่นนี้เมื่อไร บิลที่รุ่นเก่ายกเลิกระหว่างนั้น (อยู่ใน POS_VOIDED_BILLS) ถูกย้ายเข้าทะเบียนต่อบิลให้
function exportVoidRegistryForRollback() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), list = [], merged = Object.create(null);
  var add = function (id, v, r) {
    if (!BILL_ID_RE.test(String(id))) return;
    var cur = merged[id] || { v: 0, r: 0 };
    merged[id] = { v: Math.max(cur.v, Number(v) || 0), r: Math.max(cur.r, Number(r) || 0) };
  };
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(VOID_REG_PREFIX) !== 0) return;
    try { var o = JSON.parse(all[k]); add(k.slice(VOID_REG_PREFIX.length), o.v, o.r); } catch (e2) {}
  });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName(VOID_ARCHIVE_NAME_)) {
      var sheet = ledgerSheet_(VOID_ARCHIVE_NAME_, ['id', 'voidedAt', 'restoredAt'], ss), n = sheet.getLastRow();
      if (n > 1) sheet.getRange(2, 1, n - 1, 3).getValues().forEach(function (r) { add(String(r[0]), r[1], r[2]); });
    }
  } catch (archiveErr) { Logger.log("อ่านแท็บ " + VOID_ARCHIVE_NAME_ + " ไม่ได้ — ส่งออกเฉพาะใน Script Properties: " + archiveErr); }
  Object.keys(merged).forEach(function (id) {
    var ev = billEventOf_(merged[id]); if (!ev) return;
    list.push({ id: id, n: ev.type === "voided" ? ev.at : -ev.at, at: ev.at });
  });
  list.sort(function (a, b) { return b.at - a.at; });
  var map = {}, kept = 0;
  for (var i = 0; i < list.length; i++) {
    map[list[i].id] = list[i].n;
    if (JSON.stringify(map).length > 8000) { delete map[list[i].id]; break; }
    kept++;
  }
  props.setProperty(VOIDED_BILLS_PROPERTY, JSON.stringify(map));
  props.deleteProperty(VOID_REG_MIGRATED_PROPERTY);
  var msg = "เขียนทะเบียนสำหรับรุ่นก่อนแล้ว " + kept + " จาก " + list.length + " รายการ (ใหม่สุดก่อน)";
  Logger.log(msg);
  return msg;
}

// ── หาแถวของบิลในแท็บ "ทุกแถว" (ไม่ใช่แค่แถวแรกที่เจอ) ────────────────────
// คอลัมน์ 1 = "เลขที่บิล" ได้รับการยืนยันจาก billSheetSchema_ แล้วเท่านั้น (ผู้เรียกต้องตรวจโครงก่อน)
function findBillRows_(sheet, billId) {
  var lastRow = sheet.getLastRow(), rows = [];
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (readBillId_(ids[i][0]) === billId) rows.push(i + 2);
  }
  return rows;
}

// ── รุ่นของบิล (ข้อ 7) ─────────────────────────────────────────────────────
// เก็บในคอลัมน์ท้ายตาราง หัวชื่อ BILL_REV_HEADER (ซ่อนไว้) — ค่า "v1:<epoch>:<rev>"
//   rev   = เลขรุ่นที่แอปบวกทุกครั้งที่แก้บิล (ออกบิล = 1)
//   epoch = เวลาที่กู้ข้อมูลชุดที่บิลใบนี้มาจาก (0 = ไม่เคยผ่านการกู้) — การกู้ข้อมูลคือเจตนาให้ข้อมูลในเครื่องชนะ
// เทียบ (epoch, rev) ตามลำดับ: รุ่นที่ต่ำกว่าของที่อยู่บนชีต = คำขอเก่าที่มาถึงทีหลัง → ปฏิเสธ STALE_REVISION
// รุ่นเท่ากัน = ส่งซ้ำ (retry) → เขียนทับด้วยค่าเดิม ได้ผลเหมือนเดิม (idempotent)
var BILL_REV_HEADER = "รุ่นบิล (ระบบ)";
function readBillVersion_(data) {
  var rev = Number(data.rev), epoch = Number(data.revEpoch);
  var hasRev = data.rev !== undefined && data.rev !== null;
  if (!hasRev) return { epoch: 0, rev: 0, present: false };
  if (!(isFinite(rev) && rev >= 0 && rev % 1 === 0 && rev < 1e9)) return null;
  if (!(isFinite(epoch) && epoch >= 0 && epoch % 1 === 0 && epoch < 1e16)) epoch = (data.revEpoch === undefined || data.revEpoch === null) ? 0 : NaN;
  if (!isFinite(epoch)) return null;
  return { epoch: epoch, rev: rev, present: true };
}
function parseBillVersionCell_(v) {
  var m = /^v1:(\d{1,16}):(\d{1,9})$/.exec(String(v == null ? "" : v).trim());
  return m ? { epoch: Number(m[1]), rev: Number(m[2]) } : null;
}
function compareBillVersion_(a, b) {
  if (a.epoch !== b.epoch) return a.epoch < b.epoch ? -1 : 1;
  if (a.rev !== b.rev) return a.rev < b.rev ? -1 : 1;
  return 0;
}
// รุ่นของบิลตามที่ไฟล์สำรองรู้จัก (ส่งมาเฉพาะบิลที่มาจากการกู้ข้อมูล) — ค่าเสีย = ถือว่าไม่ได้ส่งมา (กติกาเดิม)
function readRestoreBase_(data) {
  var b = data && data.restoreBase;
  if (!b || typeof b !== "object") return null;
  var epoch = Number(b.epoch), rev = Number(b.rev);
  if (!(isFinite(epoch) && epoch >= 0 && epoch % 1 === 0 && epoch < 1e16)) return null;
  if (!(isFinite(rev) && rev >= 0 && rev % 1 === 0 && rev < 1e9)) return null;
  return { epoch: epoch, rev: rev };
}
// ช่องที่ "ค่าบนชีต" ต่างจาก "ค่าที่กำลังจะเขียน" — เทียบเฉพาะช่องที่กระทบเงิน/ค่าคอม
// (ช่องทางจ่าย · ตัวเลขเงินทุกช่องเป็นสตางค์ · พนักงาน) ตั้งใจไม่เทียบชื่อลูกค้า/รายการบริการ/เวลา:
// แก้ชื่อลูกค้าไม่กระทบยอด และแถวเก่าก่อนมี safeCell อาจถูกชีตแปลงชนิดไปแล้ว (เช่นชื่อที่เป็นตัวเลข) จะฟ้องผิด
function billRowChanges_(current, row, hasVat) {
  var out = [];
  var text = function (v) {
    var s = (v == null) ? "" : String(v);
    // ตัวกันแปลงชนิดของ safeCell ไม่ใช่ส่วนของข้อความ — ตัด ' นำหน้า "ทั้งหมด" ทั้งสองฝั่ง (ตรวจ 13 ต.ค. 2569 ข้อ 20:
    // safeCell เติม ' ให้ชื่อที่ขึ้นต้นด้วย ' เอง → ชีตเก็บ 'Jane แต่ค่าที่จะเขียนเป็น ''Jane · ตัดตัวเดียวแล้วฟ้องว่าต่างกันผิด ๆ)
    s = s.replace(/^'+/, "");
    return s.replace(/\s+/g, " ").trim();
  };
  var sat = function (v) { var n = Number(v === "" ? 0 : v); return isFinite(n) ? Math.round(n * 100) : null; };
  var moneyNames = hasVat
    ? ["ราคารวม", "ส่วนลด", "ไม่คิด VAT", "คิด VAT", "VAT", "ปัดเศษ", "ยอดสุทธิ"]
    : ["ราคารวม", "ส่วนลด", "ยอดสุทธิ"];
  var payIdx = 4, moneyFrom = 5, staffIdx = moneyFrom + moneyNames.length;
  // แถวบิลเก่าจากแท็บ 9 คอลัมน์ที่ถูกเติม 4 ช่อง VAT ทีหลัง (migrateBillSheetAddVatColumns_ ตั้งใจเว้นว่าง)
  // = ไม่มีข้อมูล VAT ให้เทียบ ไม่ใช่ "VAT 0" · ข้ามเฉพาะเมื่อว่าง "ครบทั้ง 4 ช่อง" — ว่างบางช่อง = แถวถูกแก้ด้วยมือ ต้องเทียบต่อ
  // (ตรวจ 8 ต.ค. 2569 ข้อ 2: เดิมแปลงช่องว่างเป็น 0 → ย้ายเครื่องหลักไม่ได้ตลอดกาล / ส่งบิลเก่าซ้ำได้ REVISION_CONFLICT)
  var blank = function (v) { return v === "" || v == null; };
  var legacyBlankVat = hasVat && blank(current[7]) && blank(current[8]) && blank(current[9]) && blank(current[10]);
  if (text(current[payIdx]) !== text(row[payIdx])) {
    out.push({ field: "ช่องทางชำระเงิน", sheet: text(current[payIdx]), local: text(row[payIdx]) });
  }
  for (var i = 0; i < moneyNames.length; i++) {
    if (legacyBlankVat && i >= 2 && i <= 5) continue;   // ไม่คิด VAT · คิด VAT · VAT · ปัดเศษ
    var a = sat(current[moneyFrom + i]), b = sat(row[moneyFrom + i]);
    if (a === null || b === null || a !== b) {
      out.push({ field: moneyNames[i], sheet: a === null ? String(current[moneyFrom + i]) : a / 100, local: b === null ? String(row[moneyFrom + i]) : b / 100 });
    }
  }
  if (text(current[staffIdx]) !== text(row[staffIdx])) {
    out.push({ field: "พนักงาน", sheet: text(current[staffIdx]), local: text(row[staffIdx]) });
  }
  return out;
}
// ตำแหน่งคอลัมน์รุ่นบิล: หาจากชื่อหัวตารางเท่านั้น · ซ้ำ = -1 (ผู้เรียกต้องหยุด) · ไม่มี = 0
function billRevColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return 0;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0], at = 0;
  for (var i = 0; i < h.length; i++) {
    if (String(h[i] || "").trim() === BILL_REV_HEADER) { if (at) return -1; at = i + 1; }
  }
  return at;
}
// สร้างคอลัมน์รุ่นบิลต่อท้าย "หลังคอลัมน์สุดท้ายที่มีข้อมูล" — ไม่ทับคอลัมน์ที่คนเติมเอง
function ensureBillRevColumn_(sheet) {
  var col = billRevColumn_(sheet);
  if (col !== 0) return col;
  col = sheet.getLastColumn() + 1;
  // แท็บที่คอลัมน์เต็มพอดี (ไม่มีคอลัมน์ว่างท้ายตาราง) — ชีตจริงโยน error ถ้าเขียนเกิน getMaxColumns()
  // แล้วบิลทุกใบของเดือนนั้นตอบ SERVER_ERROR จนกว่าคนจะไปเพิ่มคอลัมน์เอง → เพิ่มให้ท้ายตารางก่อน (ไม่ขยับข้อมูลเดิม)
  // (เจ้าของตัดสิน 8 ต.ค. 2569 · ตรวจหมวด D ข้อ 6)
  var maxCols = sheet.getMaxColumns();
  if (col > maxCols) sheet.insertColumnsAfter(maxCols, col - maxCols);
  sheet.getRange(1, col).setValue(BILL_REV_HEADER)
    .setBackground("#1e293b").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  try { sheet.hideColumns(col); } catch (e) {}
  return col;
}

// ── หมายเหตุบิล (เจ้าของสั่ง 14 ต.ค. 2569) ──────────────────────────────────────
// คอลัมน์ท้ายแท็บบิล หัวชื่อ BILL_NOTE_HEADER — หาจากชื่อหัวตารางเท่านั้น (แบบเดียวกับคอลัมน์รุ่นบิล)
//   · 13 คอลัมน์หลักไม่ขยับ · อ่านหมายเหตุแยกจากคอลัมน์หลักเพื่อใช้ตรวจความตรงกัน/กู้ไฟล์/ย้ายเครื่อง
//   · สร้างคอลัมน์เมื่อมีบิลที่มีหมายเหตุใบแรกของเดือนนั้นเท่านั้น — เดือนที่ไม่มีหมายเหตุ แท็บหน้าตาเหมือนเดิมทุกอย่าง
//   · ⚠️ ไม่อยู่ใน canonicalBillHash_ (ลายนิ้วมือบิล) โดยตั้งใจ — หมายเหตุไม่ใช่เงิน และถ้าใส่เข้าไป
//     บิลเก่าที่จดลายนิ้วมือไว้แล้วจะส่งซ้ำไม่ผ่าน (REVISION_CONFLICT) · แก้หมายเหตุในแอป = รุ่นบิลขึ้นอยู่แล้ว
//   · แอปไม่ส่ง billNote เลย (บิลไม่เคยมีหมายเหตุ / แอปรุ่นก่อน) = ไม่แตะช่องนี้ · ส่ง '' = ล้างช่อง (ลบหมายเหตุในแอป)
//   · ชื่อมี "(POS)" กันชนคอลัมน์ "หมายเหตุ" ที่เจ้าของอาจเติมเองแล้วพิมพ์มือ (ระบบจะเขียนทับช่องของตัวเองเท่านั้น)
var BILL_NOTE_HEADER = "หมายเหตุ (POS)";
var NOTE_MAX_CHARS_ = 500;   // แอปตัดที่ 200 อยู่แล้ว — ตรงนี้กันคำขอผิดรูปไม่ให้ยัดข้อความยาวลงชีต
// ข้อความหมายเหตุ: ไม่ใช่ข้อความ = ว่าง · อักขระควบคุม/ขึ้นบรรทัด → ช่องว่าง · ตัดตาม "ตัวอักษร" (ไม่ตัดกลางอีโมจิ)
function noteText_(v) {
  if (typeof v !== "string") return "";
  var s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  var chars = Array.from(s);
  return chars.length > NOTE_MAX_CHARS_ ? chars.slice(0, NOTE_MAX_CHARS_).join("").trim() : s;
}
// { given: แอปส่งช่องนี้มาไหม, text: ข้อความที่ทำความสะอาดแล้ว }
function readBillNote_(data) {
  var given = !!data && typeof data.billNote === "string";
  return { given: given, text: given ? noteText_(data.billNote) : "" };
}
// ไม่ส่งช่องนี้ = ไม่เขียนทับ จึงไม่สร้างข้อขัดแย้งกับแอป/ไฟล์รุ่นก่อน
// เก็บเครื่องหมาย ' จริงไว้ เพราะ safeCell ถูก Sheets ถอดตัวกันสูตรออกแล้วตอนอ่าน
function billNoteChanges_(current, note) {
  if (!note.given) return [];
  var stored = String(current == null ? '' : current).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stored === note.text ? [] : [{ field: 'หมายเหตุบิล', sheet: stored, local: note.text }];
}
// ตำแหน่งคอลัมน์หมายเหตุ: ซ้ำ = -1 (ผู้เรียกต้องหยุด) · ไม่มี = 0
function billNoteColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return 0;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0], at = 0;
  for (var i = 0; i < h.length; i++) {
    if (String(h[i] || "").trim() === BILL_NOTE_HEADER) { if (at) return -1; at = i + 1; }
  }
  return at;
}
// สร้างคอลัมน์หมายเหตุต่อท้าย "หลังคอลัมน์สุดท้ายที่มีข้อมูล" (แบบเดียวกับ ensureBillRevColumn_) — ไม่ซ่อน
function ensureBillNoteColumn_(sheet) {
  var col = billNoteColumn_(sheet);
  if (col !== 0) return col;
  col = sheet.getLastColumn() + 1;
  var maxCols = sheet.getMaxColumns();
  if (col > maxCols) sheet.insertColumnsAfter(maxCols, col - maxCols);
  sheet.getRange(1, col).setValue(BILL_NOTE_HEADER)
    .setBackground("#1e293b").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  try { sheet.setColumnWidth(col, 240); } catch (e) {}
  return col;
}

function handleVoidTransaction(data, ss) {
  // ⚠️ ตรวจเลขที่บิลให้จบก่อนแตะชีตใด ๆ
  // เดิมเทียบ ids[i][0] === data.id ตรง ๆ โดยไม่ตรวจอะไรเลย
  // ถ้า data.id เป็น "" (หรือหายไป) มันจะไป "ตรงกับ" ช่องเลขที่บิลที่ว่างของแถวไหนก็ได้
  // แล้วสั่ง deleteRow ทั้งแถวนั้นทิ้ง ทั้งที่แถวนั้นอาจมีข้อมูลบิลอื่นอยู่ครบ
  var billId = readBillId_(data.id);
  if (!BILL_ID_RE.test(billId)) {
    return json("error", "เลขที่บิลไม่ถูกต้อง — ไม่ได้ลบอะไรทั้งสิ้น", null, "INVALID_BILL_ID");
  }

  var txDate = (data.date) ? new Date(data.date) : new Date();
  if (isNaN(txDate.getTime())) {
    txDate = new Date();
  }
  // ใช้ monthKey จาก client เป็นหลัก (เหตุผลเดียวกับ handleTransaction) — ต้องชี้แท็บเดือนเดียวกับตอนบันทึกบิล
  var monthYear = /^(0[1-9]|1[0-2])-\d{4}$/.test(data.monthKey || "") ? data.monthKey : fmt(txDate, "MM-yyyy");
  // กันบิลที่วันที่หายไปแล้วกลายเป็นปี 1970 — จะได้แท็บ "01-1970" ค้างอยู่ในไฟล์ถาวร
  if (!isValidMonthKey_(monthYear))   // ข้อ 68: เดิมไม่มีรหัส — แอปรุ่นนี้นับเหมือนเดิม (เก็บงานไว้ลองใหม่) ข้อความเดิม
    return json("error", "เดือนของบิลไม่ถูกต้อง (" + monthYear + ") — ตรวจสอบวันที่ของบิลใบนี้", null, "INVALID_MONTH");
  // ⚠️ ลงทะเบียนก่อนแตะชีตเสมอ — แม้จะไม่พบแท็บหรือไม่พบแถว
  // เพราะคำขอ "บันทึกบิล" ที่ยังลอยอยู่ในเน็ตอาจมาถึงทีหลังและสร้างแถวขึ้นมาใหม่
  //
  // ⚠️ ยืนยันไม่ได้ = ห้ามลบแถวและห้ามตอบว่าสำเร็จ
  // เดิมกลืน error แล้วลบแถวต่อ ผลคือ "ลบสำเร็จแต่ไม่มีทะเบียน" ซึ่งเป็นสภาพที่แย่ที่สุด:
  // แถวหายจากชีตแล้ว และคำขอบันทึกเก่าที่มาถึงทีหลังสร้างแถวคืนได้โดยไม่มีอะไรกัน
  // คืน error ให้แอปเก็บงานไว้ retry แทน — งานลบยังอยู่ใน outbox ไม่หายไปไหน
  // ⚠️ คำสั่งยกเลิกใบเดิมที่ถูกส่งซ้ำ/มาถึงหลังการกู้คืน ต้องไม่ลบบิลที่เพิ่งกู้กลับมา
  // (พิสูจน์แล้ว: void ที่ T → กู้คืนที่ T+1000 → ส่ง void ใบเดิมซ้ำ → บิลหายจากชีต)
  // ยกเลิก "ใหม่" หลังการกู้ยังทำได้ตามปกติ เพราะเวลาของมันใหม่กว่าเวลาที่กู้
  // ⚠️ กติกาคือ "ต้องพิสูจน์ได้ว่าใหม่กว่าการกู้คืน" ไม่ใช่ "ไม่พิสูจน์ว่าเก่ากว่า"
  // งานลบที่ค้างในคิวมาตั้งแต่ก่อนอัปเดต (rebuildCloudOutboxFromBackup ใส่ voidedAt = 0)
  // ไม่มีเวลาให้เทียบเลย ถ้าปล่อยผ่านมันจะลบบิลที่เพิ่งกู้คืนได้เหมือนเดิม = รูเดิมยังเปิดอยู่
  // ปฏิเสธไว้ปลอดภัยกว่า เพราะ "ไม่ลบ" ย้อนกลับได้ด้วยการกดยกเลิกใหม่ ส่วน "ลบผิด" ย้อนไม่ได้
  var regEntry;
  try {
    regEntry = readBillRegistryStrict_(billId);
  } catch (regErr) {
    // ⚠️ เดิมใช้ตัวอ่านที่ "อ่านไม่ได้ = ถือว่าไม่มีทะเบียน" → ข้ามด่านกู้คืน แล้วลบบิลที่เพิ่งกู้คืนได้
    // อ่านไม่ได้ = ยืนยันลำดับเหตุการณ์ไม่ได้ → ไม่ลบอะไร (แอปเก็บงานไว้ลองใหม่)
    Logger.log("readBillRegistry failed: " + regErr);
    var corruptVoid = registryCorruptResponse_(regErr, billId, "ยังไม่ลบแถว");   // ตรวจ 14 ต.ค. ข้อ 11
    if (corruptVoid) return corruptVoid;
    return json("error", "ตรวจทะเบียนบิลที่ยกเลิกไม่ได้ชั่วคราว จึงยังไม่ลบแถว — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "REGISTRY_UNAVAILABLE");
  }
  var lastVoidEvent = billEventOf_(regEntry);
  var incomingVoidAt = Number(data.voidedAt);
  if (lastVoidEvent && lastVoidEvent.type === "restored" &&
      !(isFinite(incomingVoidAt) && incomingVoidAt > lastVoidEvent.at)) {
    return json("error",
      "คำสั่งยกเลิกนี้พิสูจน์ไม่ได้ว่าใหม่กว่าการกู้คืนบิล จึงไม่ลบแถว",
      { billId: billId, restoredAt: lastVoidEvent.at }, "VOID_SUPERSEDED_BY_RESTORE");
  }

  // เวลาไม่ถอยหลัง: คำสั่งยกเลิกเก่าที่มาถึงทีหลังไม่ลดเวลายกเลิกที่ใหม่กว่า (ดู markBillVoided_)
  if (!markBillVoided_(billId, data.voidedAt, regEntry)) {
    return json("error",
      "บันทึกทะเบียนบิลที่ยกเลิกไม่สำเร็จ จึงยังไม่ลบแถวใดทั้งสิ้น — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "VOID_REGISTRY_FAILED");
  }

  var sheet = ss.getSheetByName(monthYear);
  // ── ตรวจ 14 ต.ค. ข้อ 6: แถวของบิลอาจอยู่คนละแท็บกับเดือนที่แอปส่งมา ─────────────────────────
  // บิล 00:00–05:59 วันที่ 1 ที่ Apps Script รุ่นก่อน monthKey (ก่อน 19 ก.ค. 2569) เขียนลงแท็บเดือนตามปฏิทิน
  // เดิมหาเฉพาะแท็บที่แอปบอก → NOT_FOUND → แอปถือว่าลบแล้ว แถวบิลที่ยกเลิกค้างบนชีตถาวร
  // ตอนนี้ดู "เดือนที่แอปส่ง + เดือนในทะเบียนเลขบิล + เดือนก่อน/หลัง" (อ่านอย่างเดียว ไม่สร้าง/ไม่อัปเกรดทะเบียน)
  // เจอแถวมากกว่า 1 ที่ = ไม่เดา (DUPLICATE_BILL_ID) · แท็บที่แอปส่ง/แท็บตามทะเบียนหัวตารางผิด = SCHEMA_MISMATCH เหมือนเดิม
  var indexedMonth = voidIndexedMonth_(ss, billId);
  var months = [monthYear];
  if (indexedMonth && months.indexOf(indexedMonth) < 0) months.push(indexedMonth);
  adjacentMonthKeys_(monthYear).forEach(function (m) { if (months.indexOf(m) < 0) months.push(m); });
  var places = [], scanned = [];
  for (var mi = 0; mi < months.length; mi++) {
    var sh = ss.getSheetByName(months[mi]);
    if (!sh || scanned.indexOf(sh) >= 0) continue;   // แท็บเดียวกันห้ามนับแถวซ้ำ
    scanned.push(sh);
    // ── โครงตารางต้องเป็นแบบที่รู้จัก ก่อนลบอะไรทั้งสิ้น (ฝั่งเขียนตรวจอยู่แล้ว ฝั่งลบต้องตรวจเหมือนกัน) ──
    // แท็บที่หัวตารางถูกสลับ/ลบหัวทิ้ง → คอลัมน์แรกอาจไม่ใช่เลขที่บิล = ลบแถวผิดได้
    if (!billSheetSchema_(sh)) {
      // ว่าง / หัวเขียนค้างโดยยังไม่มีแถวข้อมูล (ข้อ 9) = ไม่มีแถวบิลให้ลบ
      if (billSheetIsBlank_(sh) || headerIsUnfinishedPrefix_(sh, [BILL_HEADERS, BILL_LEGACY_HEADERS])) continue;
      if (months[mi] === monthYear || months[mi] === indexedMonth) {
        return json("error",
          "โครงสร้างคอลัมน์ของแท็บ " + months[mi] + " ไม่ตรงกับที่ระบบรู้จัก จึงยังไม่ลบแถวใด — ตรวจหัวตารางแถวแรกก่อน " +
          "(ทะเบียนยกเลิกบันทึกแล้ว บิลนี้จะไม่ถูกเขียนกลับขึ้นมา)", { billId: billId }, "SCHEMA_MISMATCH");
      }
      continue;   // แท็บเดือนข้างเคียงที่อ่านไม่ได้ ไม่ใช่หลักฐานว่าบิลอยู่ที่นั่น
    }
    findBillRows_(sh, billId).forEach(function (r) { places.push({ month: months[mi], row: r, sheet: sh }); });
  }
  if (places.length > 1) {
    // ไม่เดาว่าแถวไหนคือบิลจริง — ลบผิดแถวย้อนกลับไม่ได้
    return json("error",
      "พบบิลเลขที่ " + billId + " ซ้ำ " + places.length + " แถว (" + places.map(function (p) { return p.month + " แถว " + p.row; }).join(", ") +
      ") จึงยังไม่ลบแถวใด — ให้ตรวจแถวซ้ำในชีตก่อน",
      { billId: billId, rows: places.map(function (p) { return p.row; }), months: places.map(function (p) { return p.month; }) }, "DUPLICATE_BILL_ID");
  }
  if (places.length === 1) {
    places[0].sheet.deleteRow(places[0].row);
    return json("success", "ลบบิลออกจาก Sheets แล้ว", { billId: billId, sheet: places[0].month });
  }
  if (!sheet) {
    // ไม่มีแท็บเดือนนี้ (และไม่พบในเดือนอื่นที่เป็นไปได้) = ปลายทางถือว่า "ลบแล้ว"
    return json("error", "ไม่พบแผ่นงานของเดือนนี้", null, "NOT_FOUND");
  }
  if (!billSheetSchema_(sheet)) return json("error", "แท็บเดือนนี้ยังว่าง", null, "NOT_FOUND");
  // ไม่มีแถวนี้แล้ว = ลบไปก่อนหน้าแล้ว ฝั่งแอปต้องถือว่าสำเร็จ ไม่ใช่วนลองใหม่ตลอดกาล
  return json("error", "ไม่พบบิลเลขที่ " + billId + " ใน Sheets", null, "NOT_FOUND");
}

// เดือนของบิลตามทะเบียนเลขบิล (อ่านอย่างเดียว) — ไม่มีแท็บ/ไม่มีเลขนี้/อ่านไม่ได้ = "" (ใช้วิธีไล่เดือนข้างเคียงแทน)
function voidIndexedMonth_(ss, billId) {
  try {
    if (!ss.getSheetByName(BILL_INDEX_NAME_)) return "";
    var e = billIndexEntry_(ledgerSheet_(BILL_INDEX_NAME_, ['id', 'month', 'version', 'hash', 'applied'], ss), billId, ss);
    var m = e ? String(e.cells[1]) : "";
    return isValidMonthKey_(m) ? m : "";
  } catch (err) { Logger.log("voidIndexedMonth_: " + err); return ""; }
}

// ─────────────────────────────────────────────
//  2. DAILY SUMMARY — สรุปรายวัน
// ─────────────────────────────────────────────
// ── ด่านฝั่งเซิร์ฟเวอร์: คีย์ต้องอยู่ในรูปแบบและช่วงปีที่เป็นไปได้ ──────────
// ต้องเช็คที่นี่ด้วย ไม่ใช่เช็คแค่ในแอป — เครื่องที่ยังไม่ได้อัปเดตแอปก็ยิงเข้ามาที่นี่ได้
// ปี 1970 คือค่าที่ได้เมื่อ "วันที่หายไป" ไม่ใช่วันที่จริง จึงตัดออกด้วยช่วงปี 2020-2100
function isValidDateKey_(k) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || ""))) return false;
  var p = String(k).split("-");
  // ต้องเป็นวันที่มีอยู่จริงในปฏิทิน (เดิมรับ 2026-02-31 ได้ แล้วไปสร้างแท็บสรุปของวันที่ไม่มีอยู่จริง)
  return isRealCalendarDate_(Number(p[0]), Number(p[1]), Number(p[2]));
}

// เดือนก่อนและหลังของ "MM-yyyy" (ข้ามปีได้)
function adjacentMonthKeys_(mk) {
  var p = String(mk).split("-"), m = Number(p[0]), y = Number(p[1]), out = [];
  [-1, 1].forEach(function (d) {
    var mm = m + d, yy = y;
    if (mm < 1) { mm = 12; yy--; } else if (mm > 12) { mm = 1; yy++; }
    out.push(("0" + mm).slice(-2) + "-" + yy);
  });
  return out;
}

function isValidMonthKey_(k) {
  if (!/^\d{2}-\d{4}$/.test(String(k || ""))) return false;
  var p = String(k).split("-");
  var m = Number(p[0]), y = Number(p[1]);
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12;
}

// ─────────────────────────────────────────────
//  รหัสรุ่นของชีตสรุป — กันคำขอเก่าทับข้อมูลใหม่
// ─────────────────────────────────────────────
// ⚠️ ชีตสรุปถูก "เขียนทับทั้งแท็บ" ทุกครั้ง จึงไม่มีอะไรบอกได้เลยว่าคำขอที่เพิ่งมาถึง
// เป็นของใหม่หรือเป็นคำขอเก่าที่ client หมดเวลารอไปแล้วแต่ยังเดินทางมาถึงทีหลัง
// เคสจริง: ส่งยอด 300 → แก้เป็น 400 → คำขอ 300 timeout → ส่ง 400 สำเร็จ → คำขอ 300 มาถึง
//          ชีตกลับไปเป็น 300 ทั้งที่ในเครื่องเป็น 400 และคิวว่างแล้ว ไม่มีอะไรมาแก้ให้อีก
// เก็บเวลาที่ "เครื่องขาย" สร้างชุดข้อมูลไว้ในเซลล์นอกพื้นที่รายงาน แล้วปฏิเสธคำขอที่เก่ากว่า
// เซลล์หายหรืออ่านไม่ได้ = ถือว่าไม่มีรุ่นเดิม (ปล่อยผ่าน) เพราะกันไม่ได้ดีกว่าสรุปส่งไม่ขึ้นเลย
var SUMMARY_STAMP_ROW = 1;
var SUMMARY_STAMP_COL = 26;   // Z1 — นอกพื้นที่รายงาน (รายงานใช้ A–E)

// ⚠️ เดิม "อ่านไม่ได้ = ถือว่าไม่มีรุ่นเดิม (ปล่อยผ่าน)" และตอนเขียนก็กลืน error — แท็บที่รหัสรุ่นหาย/อ่านไม่ได้
// จึงถูกคำขอเก่าเขียนทับได้เงียบ ๆ ตอนนี้แยกสองกรณีให้ชัด:
//   ไม่มีแท็บ / แท็บรุ่นเก่าที่ไม่เคยมีรหัส (ช่องว่าง) = ไม่มีรุ่นเดิม → เขียนได้
//   มีค่าแต่อ่านไม่ได้ / บริการอ่านล่ม              = ไม่รู้ → หยุด (SUMMARY_VERSION_UNAVAILABLE) แอปลองใหม่เอง
// ตรวจ 13 ต.ค. 2569 ข้อ 9: แท็บสรุปรายวันที่เก่ากว่า DAILY_SHEET_RETENTION_DAYS ถูกลบทิ้ง (pruneOldDailySheets)
// รหัสรุ่นที่อยู่ในแท็บจึงหายไปด้วย → คำขอรุ่นเก่าที่มาถึงทีหลังเขียนทับแถวของวันนั้นใน "สรุปรายเดือน" ได้
// ตอนนี้: สรุปของวันที่เลยระยะเก็บแท็บ จดรหัสรุ่นไว้ใน Script Properties ด้วย (เฉพาะวันเก่า — จำนวนจำกัดตามการแก้บิลย้อนหลัง)
function summaryStampPropKey_(sheetName) { return "POS_SUMSTAMP_" + sheetName; }
// ── ลบรหัสรุ่นที่จดไว้ใน Script Properties เมื่อเก่าเกิน 400 วัน (ข้อ 68 · ตรวจ 19 ต.ค. 2569) ──────────────────────
// เดิมไม่เคยลบ (~18 KB/ปี กินโควตา Script Properties 500 KB) · ทำไมลบได้อย่างปลอดภัย:
//   รหัสรุ่นมีไว้กัน "คำขอสรุปเก่าที่ยังเดินทางอยู่" ทับยอดใหม่ — แอปสร้าง generatedAt ใหม่ทุกครั้งที่ประกอบคำขอ (ส่งซ้ำก็ใหม่กว่าเสมอ)
//   คำขอที่ค้างในเน็ต/คิวของ Google มีอายุเป็นนาที ไม่ใช่เดือน · 400 วัน (> 13 เดือน) จึงเผื่อมากพอ
//   ลบเมื่อเก่าทั้งสองทาง: "วันของสรุป" เก่ากว่า 400 วัน และ "ค่ารหัสรุ่น" (เวลาที่เครื่องสร้างคำขอ) ก็เก่ากว่า 400 วัน
//   — แก้บิลวันเก่าเมื่อวาน รหัสรุ่นยังอยู่อีก 400 วัน · วันที่ยังไม่ถึง 400 วันไม่ลบไม่ว่าค่าเป็นอะไร
//   ค่าที่อ่านไม่ได้ไม่ลบ (เป็นหลักฐาน — readSummaryStamp_ หยุดเฉพาะวันนั้นตามเดิม)
var SUMMARY_STAMP_PROP_KEEP_MS_ = 400 * 24 * 60 * 60 * 1000;
function pruneSummaryStampProps_(keepKey) {
  try {
    var props = PropertiesService.getScriptProperties(), all = props.getProperties(), cutoff = Date.now() - SUMMARY_STAMP_PROP_KEEP_MS_, n = 0;
    Object.keys(all).forEach(function (k) {
      if (k.indexOf("POS_SUMSTAMP_") !== 0 || k === keepKey) return;
      var dm = /(\d{4})-(\d{2})-(\d{2})$/.exec(k);
      if (!dm || !(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) < cutoff)) return;
      var v = Number(all[k]);
      if (isFinite(v) && v > 0 && v < cutoff) { props.deleteProperty(k); n++; }
    });
    return n;
  } catch (e) { Logger.log("prune summary stamps failed: " + e); return 0; }
}
function isDailyKeyBeyondRetention_(dateKey, keepDays) {
  var m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !keepDays || keepDays <= 0) return false;
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - keepDays);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) < cutoff;
}
function readSummaryStamp_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    var p = PropertiesService.getScriptProperties().getProperty(summaryStampPropKey_(sheetName));
    if (p === null || p === undefined || p === "") return 0;
    var pn = Number(p);
    if (!isFinite(pn) || pn <= 0) throw new Error("รหัสรุ่นที่จดไว้ของ " + sheetName + " อ่านไม่ได้ (" + String(p).slice(0, 30) + ")");
    return pn;
  }
  var v = sh.getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL, 1, 1).getValues()[0][0];
  if (v === "" || v === null || v === undefined) return 0;
  var n = Number(v);
  if (!isFinite(n) || n <= 0) throw new Error("รหัสรุ่นของแท็บ " + sheetName + " อ่านไม่ได้ (" + String(v).slice(0, 30) + ")");
  return n;
}

function checkSummaryStale_(ss, sheetName, data) {
  var incoming = Number(data.generatedAt);
  if (!isFinite(incoming) || incoming <= 0) return null;   // client รุ่นเก่าไม่ส่งมา — พฤติกรรมเดิม
  var stored;
  try { stored = readSummaryStamp_(ss, sheetName); }
  catch (err) {
    return json("error", "อ่านรหัสรุ่นของแท็บสรุปไม่ได้ จึงยังไม่เขียนทับ (กันยอดเก่าทับยอดใหม่) — ระบบจะลองใหม่ให้เอง",
      { sheet: sheetName, reason: String(err) }, "SUMMARY_VERSION_UNAVAILABLE");
  }
  if (stored > 0 && incoming <= stored) {
    return json("error",
      "คำขอสรุปนี้เก่ากว่าข้อมูลที่อยู่บนชีตแล้ว จึงไม่เขียนทับ (กันยอดเก่าทับยอดใหม่)",
      { sheet: sheetName, storedAt: stored }, "STALE_SUMMARY");
  }
  return null;
}

// เขียนรหัสรุ่นลงแท็บ "ที่ยังไม่เผยแพร่" แล้วอ่านกลับยืนยัน — ล้มเหลว = throw (ห้ามเผยแพร่แท็บที่ไม่มีรหัสรุ่น)
function writeSummaryStamp_(sheet, data) {
  var n = Number(data.generatedAt);
  if (!isFinite(n) || n <= 0) return;   // client รุ่นเก่าไม่ส่งรหัสรุ่น — ไม่มีอะไรให้เขียน
  sheet.getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL - 1, 1, 2)
    .setValues([["รหัสรุ่นข้อมูล (ระบบใช้กันยอดเก่าทับยอดใหม่ — ห้ามแก้/ห้ามลบ)", n]]);
  var back = Number(sheet.getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL, 1, 1).getValues()[0][0]);
  if (back !== n) throw new Error("เขียนรหัสรุ่นของแท็บสรุปไม่สำเร็จ (อ่านกลับได้ " + back + ")");
  // ซ่อนไว้ไม่ให้รกสายตาเจ้าของ — ซ่อนไม่ได้ไม่ใช่ข้อผิดพลาด
  try { sheet.hideColumns(SUMMARY_STAMP_COL - 1, 2); } catch (hideErr) {}
}

// ตรวจ 8 ต.ค. 2569 ข้อ 8: สรุปที่ "ข้อมูลไม่ผ่านกติกา" (วันที่/เดือนไม่จริง · ยอดช่องทางไม่เท่ารายได้ · บริการไม่เท่ายอด ฯลฯ)
// ส่งซ้ำกี่รอบก็ไม่ผ่าน → ตอบรหัส INVALID_SUMMARY ให้แอปหยุดลองซ้ำและแจ้งเจ้าของ (เดิมไม่มีรหัส แอปแยกไม่ออกจากเน็ตสะดุด ยิงซ้ำ 7 วัน)
function handleDailySummary(data, ss) {
  var dateKey   = data.dateKey;          // "2026-06-06"
  if (!isValidDateKey_(dateKey))
    return json("error", "วันที่ไม่ถูกต้อง (" + dateKey + ") — ไม่สร้างแท็บสรุปเพื่อกันข้อมูลขยะในรายงาน", null, "INVALID_SUMMARY");
  try {
    normalizeSummaryPayload_(data);
  } catch (err) {
    return json("error", "ข้อมูลสรุปรายวันไม่ถูกต้อง: " + err.toString(), null, "INVALID_SUMMARY");
  }
  var sheetName = "สรุป-" + dateKey;
  // กู้งานสลับแท็บที่ค้างจากรอบก่อน "ก่อน" ตรวจรุ่น — ไม่งั้นช่วงที่แท็บจริงหายชื่อไป
  // การตรวจอ่านรุ่นได้ 0 แล้วปล่อยข้อมูลเก่ากว่าเขียนทับของใหม่
  recoverSummaryPublish_(ss);
  var staleDay = checkSummaryStale_(ss, sheetName, data);
  if (staleDay) return staleDay;
  replaceSummarySheet_(ss, sheetName, data, "รายวัน: " + dateKey, "day", dateKey);
  // ข้อ 9: วันที่เลยระยะเก็บแท็บ — จดรหัสรุ่นไว้ก่อนแท็บถูกลบ (กันคำขอเก่าทับ) · ไม่ลบแท็บที่เพิ่งเขียนในรอบนี้
  var beyond = isDailyKeyBeyondRetention_(dateKey, DAILY_SHEET_RETENTION_DAYS);
  var stampN = Number(data.generatedAt);
  if (beyond && isFinite(stampN) && stampN > 0) {
    // บันทึกไม่ได้ (โควตา Script Properties เต็ม) ไม่ใช่เหตุให้สรุปที่เขียนเสร็จแล้วล้ม — แท็บนี้ไม่ถูกลบในคำขอนี้ ยังกันคำขอเก่าได้
    try { PropertiesService.getScriptProperties().setProperty(summaryStampPropKey_(sheetName), String(stampN)); }
    catch (propErr) { Logger.log("save summary stamp failed: " + propErr); }
    pruneSummaryStampProps_(summaryStampPropKey_(sheetName));   // ข้อ 68 — เฉพาะตอนจดรหัสรุ่นวันเก่า (ไม่บ่อย)
  }
  pruneOldDailySheets(ss, DAILY_SHEET_RETENTION_DAYS, sheetName);
  pruneOrphanSwapSheets_(ss);

  return json("success", beyond
    ? "บันทึกสรุปรายวันแล้ว (วันนี้เก่ากว่า " + DAILY_SHEET_RETENTION_DAYS + " วัน — แท็บรายวันจะถูกลบในรอบถัดไป ยอดอยู่ในแถวของสรุปรายเดือน)"
    : "บันทึกสรุปรายวันแล้ว", { sheet: sheetName });
}

// ─────────────────────────────────────────────
//  3. MONTHLY SUMMARY — สรุปรายเดือน
// ─────────────────────────────────────────────
function handleMonthlySummary(data, ss) {
  var monthKey  = data.monthKey;         // "06-2026"
  if (!isValidMonthKey_(monthKey))
    return json("error", "เดือนไม่ถูกต้อง (" + monthKey + ") — ไม่สร้างแท็บสรุปเพื่อกันข้อมูลขยะในรายงาน", null, "INVALID_SUMMARY");
  try {
    normalizeSummaryPayload_(data);
  } catch (err) {
    return json("error", "ข้อมูลสรุปรายเดือนไม่ถูกต้อง: " + err.toString(), null, "INVALID_SUMMARY");
  }
  var sheetName = "สรุป-" + monthKey;
  recoverSummaryPublish_(ss);   // เหตุผลเดียวกับรายวัน
  var staleMonth = checkSummaryStale_(ss, sheetName, data);
  if (staleMonth) return staleMonth;
  replaceSummarySheet_(ss, sheetName, data, "รายเดือน: " + monthKey, "month", monthKey);
  pruneOrphanSwapSheets_(ss);

  return json("success", "บันทึกสรุปรายเดือนแล้ว", { sheet: sheetName });
}

// เก็บกวาดแท็บที่ค้างจากการสลับแท็บสรุป (replaceSummarySheet_)
// ปกติไม่ควรมี — จะเหลือก็ต่อเมื่อ execution ถูกตัดกลางคัน (หมดเวลา 6 นาที / quota)
// หรือ deleteSheet ของเก่าไม่สำเร็จ ถ้าไม่กวาด แท็บพวกนี้จะสะสมจนไฟล์อืดและหาแท็บจริงไม่เจอ
//
// อายุขั้นต่ำต่างกันโดยตั้งใจ:
//   __POS_TMP_ = แท็บที่เขียนไม่จบ ไม่มีค่าใด ๆ ทิ้งได้หลัง 1 ชม.
//   __POS_OLD_ = สรุปงวดเดิมที่ถูกแทนที่สำเร็จแล้ว (ข้อมูลใหม่กว่าอยู่ในแท็บจริงแล้ว)
//                เก็บ 7 วันเผื่อเจ้าของร้านอยากเทียบย้อนหลังก่อนถูกลบ
function pruneOrphanSwapSheets_(ss) {
  var now = Date.now();
  var TMP_MAX_AGE = 60 * 60 * 1000;            // 1 ชั่วโมง
  var OLD_MAX_AGE = 7 * 24 * 60 * 60 * 1000;   // 7 วัน
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var m = name.match(/^__POS_(TMP|OLD)_(\d{10,})_\d+$/);
    if (!m) continue;
    // stamp มาจาก new Date().getTime() ตอนสร้าง — ใช้ตัดสินอายุได้โดยไม่ต้องเรียก Drive API
    var age = now - Number(m[2]);
    if (age < 0) continue;                     // เวลาเครื่องเพี้ยน — ไม่เดา ปล่อยไว้ก่อน
    if (age < (m[1] === "TMP" ? TMP_MAX_AGE : OLD_MAX_AGE)) continue;
    // ห้ามลบจนเหลือ 0 แท็บ — Sheets ไม่ยอมและจะโยน error ทำให้ทั้งคำขอล้มทั้งที่สรุปเขียนสำเร็จแล้ว
    if (ss.getSheets().length <= 1) break;
    try { ss.deleteSheet(sheets[i]); }
    catch (e) { Logger.log("ลบแท็บค้าง " + name + " ไม่สำเร็จ: " + e.toString()); }
  }
}

// ─────────────────────────────────────────────
//  เผยแพร่สรุปแบบ "กู้ต่อหรือย้อนกลับได้เสมอ" (ข้อ 12)
// ─────────────────────────────────────────────
// ⚠️ เดิมอัปเดต master ก่อน แล้วค่อยสลับแท็บ — ถ้าสลับพัง master เป็นรุ่นใหม่ แต่แท็บสรุปยังเป็นรุ่นเก่า
// และถ้า execution ถูกตัดกลางทาง (หมดเวลา/quota) ไม่มีใครรู้ว่าค้างอยู่ขั้นไหน
// ลำดับใหม่:
//   1) เขียนแท็บชั่วคราว + รหัสรุ่น แล้วอ่านกลับยืนยัน (ยังไม่แตะของจริง)
//   2) จดบันทึกงาน (journal) ลง Script Properties ว่ากำลังเผยแพร่อะไร
//   3) สลับแท็บ (เดิม → __POS_OLD_ · ใหม่ → ชื่อจริง) — พัง = คืนชื่อเดิม
//   4) อัปเดต master — พัง = คืนค่าแถว master + สลับแท็บกลับ → สองที่ยังเป็นรุ่นเดียวกัน
//   5) ลบแท็บเก่า + ล้าง journal
// ถ้า execution ตายระหว่างขั้น 3–5: คำขอสรุปครั้งถัดไปอ่าน journal แล้ว "ทำต่อให้จบ" (master ใช้ตัวเลขที่จดไว้)
// หรือ "ย้อนกลับ" (ถ้ายังไม่ได้สลับแท็บ) ก่อนเริ่มงานใหม่เสมอ
var SUMMARY_JOURNAL_PROPERTY = "POS_SUMMARY_PUBLISH";
var MASTER_SHEET_NAME = "สรุปรายเดือน";

function masterFieldsOf_(data) {
  var keys = ["totalRevenue", "totalExpenses", "billCount", "shiftCount", "cashVariance", "nonVatBase", "vatableBase", "vatAmount", "rounding"];
  var out = {};
  keys.forEach(function (k) { if (data[k] !== undefined && data[k] !== null) out[k] = data[k]; });
  return out;
}
// ข้อ 21 (ตรวจ 19 ต.ค. 2569): บันทึกงานที่อ่านไม่ได้ (JSON เสีย) — เดิม throw ทุกคำขอสรุป = SERVER_ERROR วนถาวร
// (ไม่มีคำขอไหนเขียนบันทึกใหม่ทับได้เลย เพราะทุกคำขออ่านก่อน) · ตอนนี้ถือว่า "ไม่มีงานค้าง" + จดใน Logger
// แท็บชั่วคราวที่อาจค้าง (__POS_TMP_ / __POS_OLD_) ถูกกวาดตามอายุโดย pruneOrphanSwapSheets_ อยู่แล้ว · บันทึกเสียถูกเขียนทับในคำขอสรุปถัดไป
function readSummaryJournal_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SUMMARY_JOURNAL_PROPERTY);
  if (!raw) return null;
  var j;
  try { j = JSON.parse(raw); }
  catch (parseErr) { Logger.log("บันทึกงานเผยแพร่สรุป (" + SUMMARY_JOURNAL_PROPERTY + ") อ่านไม่ได้ — ข้ามไป: " + String(raw).slice(0, 120)); return null; }
  return (j && typeof j === "object" && !Array.isArray(j)) ? j : null;
}
function writeSummaryJournal_(j) {
  var val = JSON.stringify(j);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(SUMMARY_JOURNAL_PROPERTY, val);
  if (props.getProperty(SUMMARY_JOURNAL_PROPERTY) !== val) throw new Error("บันทึกงานเผยแพร่สรุปไม่สำเร็จ");
}
function clearSummaryJournal_() { PropertiesService.getScriptProperties().deleteProperty(SUMMARY_JOURNAL_PROPERTY); }

// ถ่ายค่าแถวของงวดนี้ใน master ไว้ก่อนเขียน (คืนค่าได้ถ้าเขียนพังกลางทาง)
function snapshotMasterRow_(ss, periodKey) {
  var master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) return { existed: false, sheetExisted: false };
  repairUnfinishedMasterHeader_(master);   // ข้อ 9: ซ่อมหัวที่เขียนค้าง "ก่อน" ถ่ายสำเนา (ความกว้างตอนคืนแถวต้องตรง)
  // เพิ่มคอลัมน์ให้ครบ "ก่อน" ถ่ายสำเนาแถว — เดิมถ่ายสำเนาแบบ 8 ช่องแล้ว updateMasterSummarySheet ค่อยแทรกคอลัมน์
  // ถ้าพังหลังจากนั้น การคืนแถวจะเขียนค่าลงผิดช่อง (ยอด VAT/รายได้กลายเป็นค่าของคอลัมน์อื่น)
  migrateMasterAddVarianceColumn(master);
  migrateMasterAddVatColumns(master);
  SpreadsheetApp.flush();
  var cols = masterColumnMap_(master);
  var lastRow = master.getLastRow(), lastCol = Math.max(master.getLastColumn(), 1);
  if (cols.periodCol > 0 && lastRow > 1) {
    var keys = master.getRange(2, cols.periodCol, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(periodKey)) {
        return { existed: true, sheetExisted: true, row: i + 2, width: lastCol, values: master.getRange(i + 2, 1, 1, lastCol).getValues() };
      }
    }
  }
  return { existed: false, sheetExisted: true, appendAt: lastRow + 1, width: lastCol };
}
function restoreMasterRow_(ss, snap) {
  if (!snap) return;
  var master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) return;
  // ข้อ 9: ลบแท็บที่เพิ่งสร้างไม่สำเร็จ = "คืนไม่สำเร็จ" ต้องโยนต่อ (ผู้เรียกเก็บ journal ไว้กู้ต่อรอบหน้า)
  // เดิมกลืน error แล้วรายงานว่าย้อนสำเร็จ → journal ถูกล้าง แท็บหัวครึ่งเดียวค้างโดยไม่มีใครกลับมาดู
  if (!snap.sheetExisted) { ss.deleteSheet(master); return; }
  // โครงคอลัมน์เปลี่ยนไปจากตอนถ่ายสำเนา = คืนตามตำแหน่งไม่ได้ (จะลงผิดช่อง) → แจ้งว่าคืนไม่สำเร็จแทน
  if (Math.max(master.getLastColumn(), 1) !== snap.width) throw new Error("โครงคอลัมน์ master เปลี่ยนระหว่างทาง — ไม่คืนแถวตามตำแหน่ง");
  if (snap.existed) master.getRange(snap.row, 1, 1, snap.width).setValues(snap.values);
  else if (master.getLastRow() >= snap.appendAt) master.deleteRow(snap.appendAt);
}

// งานเผยแพร่ที่ค้างจากรอบก่อน — ทำต่อให้จบ หรือย้อนกลับ ให้ข้อมูลสองที่เป็นรุ่นเดียวกัน
function recoverSummaryPublish_(ss) {
  var j = readSummaryJournal_();
  if (!j) return "";
  var cur = ss.getSheetByName(j.sheetName), staging = ss.getSheetByName(j.stagingName), old = ss.getSheetByName(j.oldName);
  if (staging) {
    // ยังไม่ได้สลับ (หรือสลับกลับแล้ว) → ย้อน: ทิ้งแท็บใหม่ คืนชื่อแท็บเดิม
    if (!cur && old) old.setName(j.sheetName);
    ss.deleteSheet(staging);
    clearSummaryJournal_();
    return "rolled-back";
  }
  var curStamp = 0;
  try { curStamp = cur ? readSummaryStamp_(ss, j.sheetName) : 0; } catch (e) { curStamp = -1; }
  if (cur && (j.stamp ? curStamp === j.stamp : !!old)) {
    // แท็บใหม่ขึ้นเป็นตัวจริงแล้ว → ทำ master ให้ตรงด้วยตัวเลขที่จดไว้ แล้วเก็บกวาด
    updateMasterSummarySheet(ss, j.master || {}, j.periodType, j.periodKey);
    if (old) { try { ss.deleteSheet(old); } catch (e2) {} }
    clearSummaryJournal_();
    return "rolled-forward";
  }
  // ไม่พบร่องรอยที่ต้องทำต่อ (เช่นล้าง journal ไม่ทันหลังทำเสร็จ) — เคลียร์บันทึกงาน
  if (!cur && old) old.setName(j.sheetName);
  clearSummaryJournal_();
  return "cleared";
}

function replaceSummarySheet_(ss, sheetName, data, periodLabel, periodType, periodKey) {
  recoverSummaryPublish_(ss);
  var stamp = new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
  var stagingName = "__POS_TMP_" + stamp;
  var oldName = "__POS_OLD_" + stamp;
  var staging = ss.insertSheet(stagingName);

  // 1) เขียนแท็บใหม่ + รหัสรุ่น (อ่านกลับยืนยันใน writeSummaryStamp_) — ยังไม่แตะของจริง
  try {
    writeSummarySheet(staging, data, periodLabel);
    writeSummaryStamp_(staging, data);
  } catch (err) {
    try { ss.deleteSheet(staging); } catch (cleanupErr) {}
    throw err;
  }

  // 2) จดบันทึกงานก่อนแตะของจริง
  var stampNum = Number(data.generatedAt);
  var journal = { v: 1, sheetName: sheetName, stagingName: stagingName, oldName: oldName, periodType: periodType,
    periodKey: periodKey, stamp: (isFinite(stampNum) && stampNum > 0) ? stampNum : 0, master: masterFieldsOf_(data) };
  try { writeSummaryJournal_(journal); }
  catch (jErr) {
    try { ss.deleteSheet(staging); } catch (cleanupErr0) {}
    throw jErr;
  }

  // 3) สลับแท็บ — พัง = คืนชื่อเดิมและทิ้งแท็บใหม่
  var previous = ss.getSheetByName(sheetName);
  try {
    if (previous) previous.setName(oldName);
    staging.setName(sheetName);
  } catch (swapErr) {
    try { if (previous && previous.getName() !== sheetName) previous.setName(sheetName); } catch (e1) {}
    try { if (staging.getName() !== stagingName && staging.getName() === sheetName) staging.setName(stagingName); } catch (e2) {}
    try { ss.deleteSheet(staging); clearSummaryJournal_(); } catch (e3) { Logger.log("ย้อนการสลับแท็บไม่ครบ — รอบหน้าจะกู้ต่อจาก journal: " + e3); }
    throw new Error("ไม่สามารถเผยแพร่แท็บสรุปใหม่ได้: " + swapErr.toString());
  }

  // 4) master หลังสลับแท็บ — พัง = คืนแถว master + สลับแท็บกลับ
  var masterSnap = null;
  try {
    masterSnap = snapshotMasterRow_(ss, periodKey);
    updateMasterSummarySheet(ss, data, periodType, periodKey);
  } catch (masterErr) {
    var undone = true;
    try { restoreMasterRow_(ss, masterSnap); } catch (r1) { undone = false; Logger.log("คืนแถว master ไม่สำเร็จ: " + r1); }
    try {
      staging.setName(stagingName);
      if (previous) previous.setName(sheetName);
      ss.deleteSheet(staging);
    } catch (r2) { undone = false; Logger.log("สลับแท็บกลับไม่สำเร็จ: " + r2); }
    if (undone) { try { clearSummaryJournal_(); } catch (r3) {} }
    throw new Error("อัปเดตแท็บ '" + MASTER_SHEET_NAME + "' ไม่สำเร็จ — " +
      (undone ? "ย้อนกลับเป็นรุ่นเดิมทั้งสองที่แล้ว" : "จะกู้ต่อให้ในการส่งสรุปครั้งถัดไป") + ": " + masterErr.toString());
  }

  // 5) เสร็จ — ล้าง journal แล้วลบแท็บเก่า (ลบไม่ได้ = เก็บเป็นสำเนา ถูกกวาดทีหลัง ไม่ทำข้อมูลหลักหาย)
  try { clearSummaryJournal_(); } catch (cErr) { Logger.log("ล้าง journal ไม่สำเร็จ (รอบหน้าเคลียร์ให้): " + cErr); }
  if (previous) {
    try { ss.deleteSheet(previous); }
    catch (deleteOldErr) { Logger.log("เก็บสำเนาสรุปเดิมไว้ที่ " + oldName + ": " + deleteOldErr.toString()); }
  }
  return staging;
}

// ทำให้ตัวเลขสรุปเป็น number จริงตั้งแต่จุดรับ API และคำนวณกำไรจากรายได้-ค่าใช้จ่ายเสมอ
function normalizeSummaryPayload_(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("payload ต้องเป็น object");
  // ⚠️ ข้อ 10: เดิมรับ "ข้อความตัวเลข" และไม่ตรวจว่าตัวเลขต่าง ๆ สอดคล้องกันเลย
  // สรุปที่บอกรายได้ 100 แต่ช่องทางจ่ายรวม 2,997 ก็ผ่านและถูกเขียนลงชีตเป็นรายงานการเงิน
  // ตอนนี้: ช่องเงินต้องเป็นตัวเลขจริง ไม่ติดลบ ละเอียดไม่เกินสตางค์ และสมการต้องลงตัวเป็นสตางค์
  var money = function (v, name, required) {
    if (v === undefined || v === null) { if (required) throw new Error("ไม่มีค่า " + name + " ในข้อมูลสรุป"); return 0; }
    if (typeof v !== "number" || !isFinite(v)) throw new Error("ค่า " + name + " ต้องเป็นตัวเลข");
    if (v < 0) throw new Error(name + " ต้องไม่ติดลบ");
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) throw new Error(name + " ละเอียดเกินสตางค์ (" + v + ")");
    return v;
  };
  var count = function (v, name, required) {
    if (v === undefined || v === null) { if (required) throw new Error("ไม่มีค่า " + name + " ในข้อมูลสรุป"); return 0; }
    if (typeof v !== "number" || !isFinite(v) || v < 0 || Math.floor(v) !== v) throw new Error(name + " ต้องเป็นจำนวนเต็มไม่ติดลบ");
    return v;
  };
  var sat = function (x) { return Math.round(x * 100); };
  data.totalRevenue = money(data.totalRevenue, "totalRevenue", true);
  data.totalExpenses = money(data.totalExpenses, "totalExpenses", true);
  data.billCount = count(data.billCount, "billCount", true);
  if (data.billCount === 0 && sat(data.totalRevenue) !== 0) throw new Error("ไม่มีบิลแต่รายได้ไม่เป็น 0");
  data.netIncome = (sat(data.totalRevenue) - sat(data.totalExpenses)) / 100;
  data.avgBill = data.billCount > 0 ? Math.round(sat(data.totalRevenue) / data.billCount) / 100 : 0;

  var hasChannels = ["cashRevenue", "qrRevenue", "creditRevenue"].some(function (k) { return data[k] !== undefined && data[k] !== null; });
  ["cashRevenue", "qrRevenue", "creditRevenue"].forEach(function (k) { data[k] = money(data[k], k, false); });
  if (hasChannels && sat(data.cashRevenue) + sat(data.qrRevenue) + sat(data.creditRevenue) !== sat(data.totalRevenue)) {
    throw new Error("ยอดแยกช่องทางจ่าย (เงินสด+โอน+บัตร = " +
      ((sat(data.cashRevenue) + sat(data.qrRevenue) + sat(data.creditRevenue)) / 100) + ") ไม่เท่ากับรายได้รวม (" + data.totalRevenue + ")");
  }
  var VK = ["nonVatBase", "vatableBase", "vatAmount", "rounding"];
  var vatPresent = VK.filter(function (k) { return data[k] !== undefined && data[k] !== null; }).length;
  // ตรวจ 18 ต.ค. 2569 (F05): เดิมตรวจสมการ VAT เฉพาะเมื่อครบ 4 ช่อง — ส่งมาแค่บางช่อง (เช่น nonVatBase 20 แต่รายได้ 100)
  // ผ่านแล้วเขียนลงชีต/แถว master เป็นตัวเลขที่ขัดกันเอง · แอปรุ่นก่อน VAT ไม่ส่งเลยสักช่อง · แอปรุ่นปัจจุบันส่งครบเสมอ
  if (vatPresent !== 0 && vatPresent !== VK.length) {
    throw new Error("ข้อมูล VAT ส่งมาไม่ครบ (" + vatPresent + " จาก " + VK.length + " ช่อง: " + VK.join(", ") +
      ") — ต้องมีครบทุกช่อง หรือไม่มีเลย");
  }
  VK.forEach(function (k) { data[k] = money(data[k], k, false); });
  if (vatPresent === VK.length &&
      sat(data.nonVatBase) + sat(data.vatableBase) + sat(data.vatAmount) + sat(data.rounding) !== sat(data.totalRevenue)) {
    throw new Error("ไม่คิดVAT + คิดVAT + VAT + ปัดเศษ ไม่เท่ากับรายได้รวม (" + data.totalRevenue + ")");
  }
  var shiftCountGiven = data.shiftCount !== undefined && data.shiftCount !== null;
  data.shiftCount = count(data.shiftCount, "shiftCount", false);
  if (data.vatRate === undefined || data.vatRate === null) data.vatRate = 0;
  if (typeof data.vatRate !== "number" || !isFinite(data.vatRate) || data.vatRate < 0 || data.vatRate > 100) throw new Error("vatRate เกินช่วงที่ยอมรับได้");
  data.cashVariance = readFiniteNumber_(data.cashVariance, "cashVariance", false);
  data.excludedInvalid = count(data.excludedInvalid, "excludedInvalid", false);
  // บิลจากชีต (ปลดพักแบบยอมรับข้อมูลหาย) ในงวดนี้ — ยอดนับแล้ว แต่ไม่มีรายละเอียดค่าคอม (ตรวจรอบ Claude รอบ 3)
  data.sheetOnlyBills = count(data.sheetOnlyBills, "sheetOnlyBills", false);

  // ตรวจ 18 ต.ค. 2569 รอบ 2 (C03): แยก "ไม่ได้ส่งช่องนี้" (แอปรุ่นก่อนมีตารางนับเงิน) ออกจาก "ส่งมาผิดชนิด"
  // เดิมแปลงทุกอย่างที่ไม่ใช่ array เป็น [] แล้วตรวจเฉพาะเมื่อมีแถว → shiftCount 1 / cashVariance −999 / shiftCash [] ผ่าน
  var shiftCashGiven = data.shiftCash !== undefined && data.shiftCash !== null;
  if (shiftCashGiven && !Array.isArray(data.shiftCash)) throw new Error("shiftCash ต้องเป็นรายการกะ (array)");
  if (!Array.isArray(data.shiftCash)) data.shiftCash = [];
  // ตรวจ 18 ต.ค. 2569 (F05): ตารางนับเงินรายกะเดิมไม่ถูกตรวจเลย — ส่งกะที่ขาด/เกิน −999 แต่ cashVariance รวม 0 ก็ผ่าน
  // ตอนนี้: ช่องตัวเลขของแต่ละกะต้องเป็นตัวเลขจริง · ผลรวม "ขาด/เกิน" ทุกกะต้องเท่า cashVariance · จำนวนกะต้องเท่า shiftCount
  // ⚠️ ไม่ตรวจ difference = counted − expected — กะที่ค่าใช้จ่าย/เงินคืนเกินเงินในลิ้นชัก (overspend) ผลต่างคิดตามกติกาของแอป
  //    ไม่ใช่ลบตรง ๆ บังคับสมการนี้ = ไฟล์/งวดเก่าที่ถูกต้องถูกปฏิเสธ
  if (shiftCashGiven) {   // C03: ส่ง array มา = ตรวจเสมอ รวม array ว่าง (0 กะต้องได้ cashVariance 0 และ shiftCount 0)
    var SHIFT_NUM = ["startCash", "cashSales", "cashAdjust", "expenses", "expensesOther", "overspend", "expected", "counted", "difference"];
    var diffSum = 0;
    for (var si = 0; si < data.shiftCash.length; si++) {
      var row = data.shiftCash[si];
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("shiftCash[" + si + "] ต้องเป็นข้อมูลกะ 1 กะ");
      for (var sk = 0; sk < SHIFT_NUM.length; sk++) {
        var fv = row[SHIFT_NUM[sk]];
        if (fv === undefined || fv === null) continue;
        if (typeof fv !== "number" || !isFinite(fv)) throw new Error("shiftCash[" + si + "]." + SHIFT_NUM[sk] + " ต้องเป็นตัวเลข");
      }
      // ไม่มีช่องนี้ = 0 (กติกาเดียวกับตอนเขียนตาราง) · บวกลำดับเดียวกับแอป (reduce จาก 0) แล้วเทียบเป็นสตางค์
      diffSum += (row.difference === undefined || row.difference === null) ? 0 : row.difference;
    }
    if (sat(diffSum) !== sat(data.cashVariance)) {
      throw new Error("ผลรวมขาด/เกินรายกะ (" + (sat(diffSum) / 100) + ") ไม่เท่ากับ cashVariance (" + data.cashVariance + ")");
    }
    if (shiftCountGiven && data.shiftCount !== data.shiftCash.length) {
      throw new Error("shiftCount (" + data.shiftCount + ") ไม่เท่ากับจำนวนกะที่ส่งมา (" + data.shiftCash.length + ")");
    }
  }
  if (!Array.isArray(data.vatCategories)) data.vatCategories = [];
  if (!Array.isArray(data.expenses)) data.expenses = [];
  // ค่าใช้จ่ายรวม = ผลรวมรายการที่ส่งมา (ถ้าส่งรายการมา) — กันรายการกับยอดรวมคนละชุด
  if (data.expenses.length) {
    var expSat = 0;
    for (var i = 0; i < data.expenses.length; i++) {
      var ex = data.expenses[i];
      if (!ex || typeof ex !== "object") throw new Error("expenses[" + i + "] ต้องเป็นรายการค่าใช้จ่าย 1 รายการ");
      expSat += sat(money(ex.amount, "expenses[" + i + "].amount", true));
    }
    if (expSat !== sat(data.totalExpenses)) throw new Error("ผลรวมรายการค่าใช้จ่าย (" + (expSat / 100) + ") ไม่เท่ากับค่าใช้จ่ายรวม (" + data.totalExpenses + ")");
  }

  // ── สองบล็อกนี้เดิมไม่ถูกตรวจเลย ทั้งที่บล็อกอื่นตรวจครบ ──────────────
  // staffCommissions: ถ้าไม่ใช่ array จะไปพังตอน writeSummarySheet เรียก .sort()
  // services: เดิมใช้ Number(x) || 0 ตอนเขียน แปลว่าค่าที่ผิดรูปจะกลายเป็น 0 เงียบ ๆ
  data.staffCommissions = normalizeStaffCommissions_(data.staffCommissions);
  data.services = normalizeServiceRows_(data.services);

  // ── รายการบริการต้องรวมได้เท่า "ยอดขายก่อน VAT" (ข้อ 18) ─────────────────────
  // เศษที่ยอมให้ต่างได้มีแหล่งเดียว: บิลรุ่นแรก (ก่อน 3 ก.ค. 2569) ปัดราคาหลังส่วนลดทีละบรรทัด
  // → ไม่เกินครึ่งสตางค์ต่อบรรทัด เกินกว่านั้น = รายการกับยอดคนละชุด ปฏิเสธ
  if (vatPresent === VK.length && data.services.length) {
    var svcSat = 0, svcCount = 0;
    data.services.forEach(function (x) { svcSat += sat(x.revenue); svcCount += x.count; });
    var netSat = sat(data.nonVatBase) + sat(data.vatableBase);
    data.servicesResidual = (netSat - svcSat) / 100;
    if (Math.abs(netSat - svcSat) > Math.ceil(svcCount / 2)) {
      throw new Error("ผลรวมรายการบริการ (" + (svcSat / 100) + ") ไม่เท่ากับยอดขายก่อน VAT (" + (netSat / 100) + ")");
    }
  } else {
    data.servicesResidual = 0;
  }
  return data;
}

// ค่าคอมพนักงาน — ต้องเป็นรายการของอ็อบเจกต์ ตัวเลขต้องเป็นตัวเลขจริงและไม่ติดลบ
function normalizeStaffCommissions_(list) {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw new Error("staffCommissions ต้องเป็นรายการ (array)");
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    if (!st || typeof st !== "object" || Array.isArray(st))
      throw new Error("staffCommissions[" + i + "] ต้องเป็นข้อมูลพนักงาน 1 คน");
    var tag = "staffCommissions[" + i + "]";
    var count = readFiniteNumber_(st.count, tag + ".count", false);
    var sales = readFiniteNumber_(st.salesSum, tag + ".salesSum", false);
    var comm  = readFiniteNumber_(st.commission, tag + ".commission", false);
    if (count < 0 || Math.floor(count) !== count)
      throw new Error(tag + ".count ต้องเป็นจำนวนเต็มไม่ติดลบ");
    if (sales < 0) throw new Error(tag + ".salesSum ต้องไม่ติดลบ");
    // ค่าคอมคำนวณจาก netPrice × อัตรา ซึ่งไม่มีทางติดลบ — ถ้าติดลบแปลว่าข้อมูลเพี้ยน
    if (comm < 0)  throw new Error(tag + ".commission ต้องไม่ติดลบ");
    // ข้อ 22 (ตรวจ 13 ต.ค. 2569): จำนวนชิ้นสินค้าที่ขาย — แอปรุ่นก่อนไม่ส่ง = 0
    var pc = (st.productCount === undefined || st.productCount === null) ? 0 : readFiniteNumber_(st.productCount, tag + ".productCount", false);
    if (pc < 0 || Math.floor(pc) !== pc) throw new Error(tag + ".productCount ต้องเป็นจำนวนเต็มไม่ติดลบ");
    out.push({
      // ข้อความดิบ — กันสูตร/แปลงชนิดตอนเขียนลงช่องที่ writeSummarySheet ที่เดียว (ผู้ตรวจอิสระ 13 ต.ค. 2569:
      // เดิมผ่าน safeCell สองรอบ พอ safeCell กัน ' นำหน้าด้วย ชื่อ "-"/"+Bob" ขึ้นบนชีตเป็น '- / '+Bob)
      name: String(st.name || "ไม่ระบุ"),
      role: String(st.role || "-"),
      count: count, productCount: pc, salesSum: sales, commission: comm
    });
  }
  return out;
}

// รายการบริการในสรุป — ชื่อ/จำนวนครั้ง/รายได้ ต้องใช้งานได้จริงก่อนเขียนลงชีต
function normalizeServiceRows_(list) {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw new Error("services ต้องเป็นรายการ (array)");
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var svc = list[i];
    if (!svc || typeof svc !== "object" || Array.isArray(svc))
      throw new Error("services[" + i + "] ต้องเป็นข้อมูลบริการ 1 รายการ");
    var tag = "services[" + i + "]";
    var count = readFiniteNumber_(svc.count, tag + ".count", false);
    var rev   = readFiniteNumber_(svc.revenue, tag + ".revenue", false);
    if ((svc.revenue !== undefined && svc.revenue !== null && typeof svc.revenue !== "number") ||
        (svc.count !== undefined && svc.count !== null && typeof svc.count !== "number")) {
      throw new Error(tag + " ตัวเลขต้องเป็นชนิดตัวเลข");
    }
    if (count < 0 || Math.floor(count) !== count)
      throw new Error(tag + ".count ต้องเป็นจำนวนเต็มไม่ติดลบ");
    if (rev < 0) throw new Error(tag + ".revenue ต้องไม่ติดลบ");
    out.push({ name: String(svc.name || "ไม่ระบุชื่อบริการ"), count: count, revenue: rev });   // safeCell ตอนเขียน (ดูข้างบน)
  }
  return out;
}

// ─────────────────────────────────────────────
//  4. WRITE SUMMARY SHEET — layout หลัก
// ─────────────────────────────────────────────
function writeSummarySheet(sheet, data, periodLabel) {
  var GOLD   = "#b8860b";
  var DARK   = "#1e293b";
  var TEAL   = "#0f766e";
  var RED    = "#9f1239";
  var GREEN  = "#14532d";
  var LGOLD  = "#fef9c3";
  var LTEAL  = "#ccfbf1";
  var LRED   = "#ffe4e6";
  var LGREEN = "#dcfce7";

  var r = 1; // row pointer

  // ── Header ──────────────────────────────────
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("สรุปผลประกอบการ — " + periodLabel)
    .setBackground(DARK).setFontColor("white")
    .setFontWeight("bold").setFontSize(13)
    .setHorizontalAlignment("center");
  r++;

  sheet.getRange(r, 1, 1, 5).merge()
    .setValue(safeCell((typeof data.shopName === "string" && data.shopName.trim() ? data.shopName.trim().slice(0, 80) : "Erotica Barber & Massage") +
      " POS  |  สร้างเมื่อ: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")))
    .setBackground("#334155").setFontColor("#94a3b8")
    .setFontSize(9).setHorizontalAlignment("center");
  r++;
  // บิลที่ข้อมูลเงินเชื่อไม่ได้ ไม่ได้รวมในสรุปนี้ — ต้องบอกบนรายงานเสมอ ไม่ใช่หายเงียบ ๆ
  if (Number(data.excludedInvalid) > 0) {
    sheet.getRange(r, 1, 1, 5).merge()
      .setValue("⚠ มีบิล " + Number(data.excludedInvalid) + " ใบในงวดนี้ที่ข้อมูลเงินเชื่อไม่ได้ จึงไม่ได้รวมในสรุปนี้ — ดู \"บิลรอตรวจ\" ในแอป")
      .setBackground("#ffe4e6").setFontColor("#9f1239").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");
    r++;
  }
  // สรุปที่ส่งหลังปลดพักแบบยอมรับข้อมูลหาย เขียนทับสรุปเดิมที่อาจมีค่าคอมครบ — ต้องบอกบนชีตว่าค่าคอมงวดนี้ขาด
  // (เดิมเตือนเฉพาะในแอป คนที่จ่ายค่าคอมจากชีตจะจ่ายขาดโดยไม่รู้ตัว · ผู้ตรวจแยก #5)
  if (Number(data.sheetOnlyBills) > 0) {
    sheet.getRange(r, 1, 1, 5).merge()
      .setValue("⚠ มีบิลจากชีต " + Number(data.sheetOnlyBills) + " ใบในงวดนี้ (เครื่องเดิมเสียถาวร รายละเอียดหาย) — ยอดขายนับแล้ว แต่ค่าคอมของบิลเหล่านี้ไม่ทราบ ตารางค่าคอมด้านล่างต่ำกว่าจริง ห้ามใช้จ่ายค่าคอม")
      .setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center");
    r++;
  }
  r++;

  // ── KPI Row ─────────────────────────────────
  var kpis = [
    ["รายได้รวม", "฿" + numFmt(data.totalRevenue)],
    ["ค่าใช้จ่ายรวม", "฿" + numFmt(data.totalExpenses)],
    ["กำไรสุทธิ", "฿" + numFmt(data.netIncome)],
    ["จำนวนบิล", data.billCount + " บิล"],
    ["ยอดเฉลี่ย/บิล", "฿" + numFmt(data.avgBill)]
  ];
  kpis.forEach(function(kpi, i) {
    var col = i + 1;
    var isProfit = i === 2;
    var profitPositive = isProfit && (data.netIncome || 0) >= 0;
    var kpiBg  = isProfit ? (profitPositive ? LGREEN : LRED)   : LGOLD;
    var kpiClr = isProfit ? (profitPositive ? "#166534" : "#9f1239") : GOLD;
    sheet.getRange(r,   col).setValue(kpi[0]).setBackground("#1e293b").setFontColor("#94a3b8").setFontSize(8).setFontWeight("bold");
    sheet.getRange(r+1, col).setValue(kpi[1]).setBackground(kpiBg).setFontColor(kpiClr).setFontWeight("bold").setFontSize(11);
  });
  r += 3;

  // ── ช่องทางชำระเงิน ────────────────────────
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("ช่องทางชำระเงิน")
    .setBackground(TEAL).setFontColor("white").setFontWeight("bold");
  r++;
  [["เงินสด","฿"+numFmt(data.cashRevenue)],["โอน QR","฿"+numFmt(data.qrRevenue)],["Credit","฿"+numFmt(data.creditRevenue)]]
    .forEach(function(row,i){
      sheet.getRange(r,i+1).setValue(row[0]).setBackground("#f0fdfa").setFontColor("#0f766e").setFontWeight("bold").setHorizontalAlignment("center");
      sheet.getRange(r+1,i+1).setValue(row[1]).setBackground(LTEAL).setFontColor("#0f766e").setFontWeight("bold").setHorizontalAlignment("center");
    });
  r += 3;

  // ── การนับเงินสดปิดกะ ───────────────────────
  // แสดงเฉพาะเมื่อมีกะปิดในงวดนี้ — งวดที่ยังไม่ปิดกะจะไม่มีบล็อกนี้เลย ดีกว่าโชว์ตารางว่าง
  var shiftRows = data.shiftCash || [];
  if (shiftRows.length > 0) {
    sheet.getRange(r, 1, 1, 5).merge()
      .setValue("การนับเงินสดปิดกะ")
      .setBackground(TEAL).setFontColor("white").setFontWeight("bold");
    r++;
    styleHeaderRow(sheet, r, ["กะ","ผู้ปิด","ควรมี (฿)","นับได้ (฿)","ขาด/เกิน (฿)"], "#134e4a", LTEAL);
    r++;

    var sumExpected = 0, sumCounted = 0, sumDiff = 0;
    var sumStart = 0, sumSales = 0, sumExp = 0, sumAdj = 0, sumOther = 0, sumOver = 0;
    // ตรวจ 14 ต.ค. ข้อ 14 (รอบ 2): ยอดเกินลิ้นชักแยกตามต้นเหตุ — แอปรุ่นเก่าไม่ส่ง overspendCause = ป้ายเดิม "ค่าใช้จ่ายเกินลิ้นชัก"
    var sumOverRefund = 0, sumOverMixed = 0;
    shiftRows.forEach(function(sh) {
      var d   = Number(sh.difference) || 0;
      var bg  = "#f0fdfa";
      var dBg  = d < 0 ? LRED : (d > 0 ? LGREEN : "#f1f5f9");
      var dClr = d < 0 ? "#9f1239" : (d > 0 ? "#166534" : "#475569");
      sheet.getRange(r,1).setValue(shiftRangeLabel(sh)).setBackground(bg).setFontColor("#0f766e").setHorizontalAlignment("center");
      sheet.getRange(r,2).setValue(safeCell(sh.closedBy || "-")).setBackground(bg).setFontColor("#0f766e").setHorizontalAlignment("center");
      sheet.getRange(r,3).setValue(Number(sh.expected) || 0).setBackground(bg).setFontColor("#0f766e").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
      sheet.getRange(r,4).setValue(Number(sh.counted) || 0).setBackground(bg).setFontColor("#0f766e").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
      sheet.getRange(r,5).setValue(d).setBackground(dBg).setFontColor(dClr).setFontWeight(d === 0 ? "normal" : "bold").setNumberFormat("+#,##0.00;-#,##0.00;0.00").setHorizontalAlignment("right");
      sumExpected += Number(sh.expected) || 0;
      sumCounted  += Number(sh.counted)  || 0;
      sumDiff     += d;
      sumStart    += Number(sh.startCash) || 0;
      sumSales    += Number(sh.cashSales) || 0;
      sumExp      += Number(sh.expenses)  || 0;
      // เงินคืน/เก็บเพิ่มจากบิลที่ถูกแก้หลังรับเงิน ที่เกิดจริงในกะ (แอปรุ่นใหม่ส่งมา · รุ่นเก่าไม่มี = 0)
      sumAdj      += Number(sh.cashAdjust) || 0;
      // ค่าใช้จ่ายที่จ่ายทางอื่น (ไม่หักลิ้นชัก) + ค่าใช้จ่ายจากลิ้นชักที่เกินเงินในลิ้นชัก (นับเป็นเงินขาดแล้ว) — แอปรุ่น 1.7.1 ขึ้นไป
      sumOther    += Number(sh.expensesOther) || 0;
      if (sh.overspendCause === "refund") sumOverRefund += Number(sh.overspend) || 0;
      else if (sh.overspendCause === "mixed") sumOverMixed += Number(sh.overspend) || 0;
      else sumOver += Number(sh.overspend) || 0;
      r++;
      // หมายเหตุปิดกะ (เจ้าของสั่ง 14 ต.ค. 2569) — แถวใต้กะนั้น กว้างเต็ม 5 คอลัมน์ · แอปรุ่นก่อน/กะที่ไม่มี = ไม่มีแถวนี้
      // ขึ้นต้นด้วย 📝 เสมอ (ป้ายห้ามขึ้นต้นด้วย = + - @) · ยังผ่าน safeCell กันไว้อีกชั้น
      var cn = noteText_(sh.closeNote);
      if (cn) {
        sheet.getRange(r, 1, 1, 5).merge()
          .setValue(safeCell("📝 หมายเหตุปิดกะ: " + cn))
          .setBackground(bg).setFontColor("#0f766e").setFontSize(9).setWrap(true).setHorizontalAlignment("left");
        r++;
      }
    });

    var tBg  = sumDiff < 0 ? LRED : (sumDiff > 0 ? LGREEN : "#f1f5f9");
    var tClr = sumDiff < 0 ? "#9f1239" : (sumDiff > 0 ? "#166534" : "#475569");
    sheet.getRange(r,1,1,2).merge()
      .setValue("รวม · เงินตั้งต้น " + numFmt(sumStart) + " · ขายสด " + numFmt(sumSales) +
        (Math.round(sumAdj * 100) !== 0 ? " · คืน/เก็บส่วนต่าง " + (sumAdj > 0 ? "+" : "-") + numFmt(Math.abs(sumAdj)) : "") +
        " · ค่าใช้จ่ายจากลิ้นชัก " + numFmt(sumExp) +
        (Math.round(sumOther * 100) !== 0 ? " · จ่ายทางอื่น " + numFmt(sumOther) + " (ไม่หักลิ้นชัก)" : "") +
        (Math.round(sumOver * 100) !== 0 ? " · ค่าใช้จ่ายเกินลิ้นชัก " + numFmt(sumOver) + " (นับเป็นเงินขาด)" : "") +
        (Math.round(sumOverRefund * 100) !== 0 ? " · เงินคืนลูกค้าเกินลิ้นชัก " + numFmt(sumOverRefund) + " (นับเป็นเงินขาด)" : "") +
        (Math.round(sumOverMixed * 100) !== 0 ? " · ค่าใช้จ่าย+เงินคืนเกินลิ้นชัก " + numFmt(sumOverMixed) + " (นับเป็นเงินขาด)" : ""))
      .setBackground(LTEAL).setFontColor("#0f766e").setFontWeight("bold").setFontSize(9);
    sheet.getRange(r,3).setValue(sumExpected).setBackground(LTEAL).setFontColor("#0f766e").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,4).setValue(sumCounted).setBackground(LTEAL).setFontColor("#0f766e").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,5).setValue(sumDiff).setBackground(tBg).setFontColor(tClr).setFontWeight("bold").setNumberFormat("+#,##0.00;-#,##0.00;0.00").setHorizontalAlignment("right");
    r += 2;
  }

  // ── ภาษีมูลค่าเพิ่ม ─────────────────────────
  // แสดงเฉพาะงวดที่มี VAT จริง — งวดก่อนเปิดระบบจะไม่มีบล็อกนี้เลย ดีกว่าโชว์ตารางศูนย์
  var vatBase = Number(data.vatableBase) || 0;
  var vatAmt  = Number(data.vatAmount)   || 0;
  var vatRnd  = Number(data.rounding)    || 0;
  if (vatBase > 0 || vatAmt > 0 || vatRnd > 0) {
    sheet.getRange(r, 1, 1, 5).merge()
      .setValue("ภาษีมูลค่าเพิ่ม").setBackground("#854F0B").setFontColor("white").setFontWeight("bold");
    r++;
    styleHeaderRow(sheet, r, ["กลุ่ม","ฐานภาษี (฿)","อัตรา","ภาษีขาย (฿)",""], "#633806", "#FAC775");
    r++;

    var vcats = data.vatCategories || [];
    vcats.forEach(function(c) {
      sheet.getRange(r,1).setValue(safeCell(c.name || "-")).setBackground("#FAEEDA").setFontColor("#412402");
      sheet.getRange(r,2).setValue(Number(c.base)||0).setBackground("#FAEEDA").setFontColor("#412402").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
      // อัตราต้องอ่านจาก "แถวนั้น" ก่อน (c.rate) — งวดที่มีหลายอัตราจะมีหลายแถว แต่ละแถวคนละอัตรา
      // เดิมพิมพ์ data.vatRate ทับทุกแถว ทำให้งวดที่อัตราเปลี่ยนกลางทางแสดงอัตราเดียวผิด ๆ ทั้งตาราง
      // payload จากแอปรุ่นเก่าไม่มี c.rate → ถอยไปใช้อัตราระดับงวดเหมือนเดิม (ถูกต้องเมื่อมีอัตราเดียว)
      var rowRate = (c.rate === undefined || c.rate === null || c.rate === "")
        ? (Number(data.vatRate) || 0)
        : (Number(c.rate) || 0);
      sheet.getRange(r,3).setValue(rowRate + "%").setBackground("#FAEEDA").setFontColor("#412402").setHorizontalAlignment("center");
      sheet.getRange(r,4).setValue(Number(c.vat)||0).setBackground("#FAEEDA").setFontColor("#412402").setNumberFormat("#,##0.00").setFontWeight("bold").setHorizontalAlignment("right");
      r++;
    });

    // แถวยอดที่ไม่คิด VAT — ให้เห็นว่าเงินที่เหลือไปอยู่ไหน ไม่ใช่หายไปเฉย ๆ
    sheet.getRange(r,1).setValue("ยอดขายที่ไม่คิด VAT").setBackground("#FAEEDA").setFontColor("#854F0B");
    sheet.getRange(r,2).setValue(Number(data.nonVatBase)||0).setBackground("#FAEEDA").setFontColor("#854F0B").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,3).setValue("ยกเว้น").setBackground("#FAEEDA").setFontColor("#854F0B").setHorizontalAlignment("center");
    sheet.getRange(r,4).setValue("—").setBackground("#FAEEDA").setFontColor("#854F0B").setHorizontalAlignment("right");
    r++;

    sheet.getRange(r,1).setValue("รวม · เงินปัดเศษ " + numFmt(vatRnd) + " (ไม่ใช่ภาษี ไม่ต้องนำส่ง)")
      .setBackground("#FAC775").setFontColor("#412402").setFontWeight("bold").setFontSize(9);
    sheet.getRange(r,2).setValue(vatBase).setBackground("#FAC775").setFontColor("#412402").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,3).setValue("").setBackground("#FAC775");
    sheet.getRange(r,4).setValue(vatAmt).setBackground("#FAC775").setFontColor("#412402").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    r += 3;
  }

  // ── รายการบริการ ────────────────────────────
  // ⚠️ ข้อ 18: เดิมรายการเป็นยอด "ก่อน VAT" แต่แถวรวมใส่ "รายได้รวม (รวม VAT)" — รายการรวม 100 แถวรวมโชว์ 107
  // ตอนนี้แถวรวมบวกจากรายการจริง แล้วแยก VAT/ปัดเศษ ก่อนถึงยอดรับรวม (ความหมายเดียวกับหน้ารายงานในแอป)
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("รายการบริการ (ยอดขายหลังส่วนลด ก่อน VAT)")
    .setBackground(GOLD).setFontColor("white").setFontWeight("bold");
  r++;
  var svcHeaders = ["ลำดับ","ชื่อบริการ","จำนวน (ครั้ง)","ยอดขายก่อน VAT (฿)","% ของยอดขายก่อน VAT"];
  styleHeaderRow(sheet, r, svcHeaders, "#854d0e", LGOLD);
  r++;
  var services = data.services || [];
  services.sort(function(a,b){return (Number(b.revenue) || 0) - (Number(a.revenue) || 0);});
  var svcSumSat = 0, svcCountSum = 0;
  services.forEach(function (x) { svcSumSat += Math.round((Number(x.revenue) || 0) * 100); svcCountSum += Number(x.count) || 0; });
  var svcSum = svcSumSat / 100;
  services.forEach(function(svc, i) {
    var revVal = Number(svc.revenue) || 0;
    var countVal = Number(svc.count) || 0;
    var pct = svcSum > 0 ? ((revVal/svcSum)*100).toFixed(1)+"%" : "0%";
    var bg  = i%2===0 ? "#fffbeb" : "white";
    sheet.getRange(r,1).setValue(i+1).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r,2).setValue(safeCell(svc.name || "ไม่ระบุชื่อบริการ")).setBackground(bg);
    sheet.getRange(r,3).setValue(countVal).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r,4).setValue(revVal).setBackground(bg).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,5).setValue(pct).setBackground(bg).setHorizontalAlignment("center");
    r++;
  });
  var footRows = [["รวมรายการ (ก่อน VAT)", svcSum, svcCountSum, true]];
  var residual = Number(data.servicesResidual) || 0;
  if (Math.round(residual * 100) !== 0) footRows.push(["ปัดเศษรายบรรทัด (บิลรุ่นเก่า)", residual, "", false]);
  footRows.push(["ภาษีมูลค่าเพิ่ม (VAT)", Number(data.vatAmount) || 0, "", false]);
  footRows.push(["เงินปัดเศษ (ปัดขึ้นเต็มบาท)", Number(data.rounding) || 0, "", false]);
  footRows.push(["ยอดรับรวม", Number(data.totalRevenue) || 0, "", true]);
  footRows.forEach(function (fr) {
    sheet.getRange(r,1).setBackground(LGOLD);
    sheet.getRange(r,2).setValue(fr[0]).setBackground(LGOLD).setFontWeight(fr[3] ? "bold" : "normal");
    sheet.getRange(r,3).setValue(fr[2]).setBackground(LGOLD).setFontWeight("bold").setHorizontalAlignment("center");
    sheet.getRange(r,4).setValue(fr[1]).setBackground(LGOLD).setFontWeight(fr[3] ? "bold" : "normal").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,5).setBackground(LGOLD);
    r++;
  });
  r++;

  // ── ค่าใช้จ่าย ───────────────────────────────
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("รายละเอียดค่าใช้จ่าย")
    .setBackground(RED).setFontColor("white").setFontWeight("bold");
  r++;
  var expHeaders = ["ลำดับ","รายการ","","จำนวน (฿)",""];
  styleHeaderRow(sheet, r, expHeaders, "#881337", "#ffe4e6");
  sheet.getRange(r, 2, 1, 2).merge();
  sheet.getRange(r, 4, 1, 2).merge();
  r++;
  var expenses = data.expenses || [];
  if (expenses.length === 0) {
    sheet.getRange(r,1,1,5).merge().setValue("ไม่มีค่าใช้จ่ายในรอบนี้")
      .setHorizontalAlignment("center").setFontColor("#9ca3af").setBackground("white");
    r++;
  } else {
    expenses.forEach(function(exp, i) {
      var bg = i%2===0 ? "#fff1f2" : "white";
      var amount = readFiniteNumber_(exp && exp.amount, "expenses[" + i + "].amount", false);
      if (amount < 0) throw new Error("expenses[" + i + "].amount ต้องไม่ติดลบ");
      sheet.getRange(r,1).setValue(i+1).setBackground(bg).setHorizontalAlignment("center");
      sheet.getRange(r,2,1,2).merge().setValue(safeCell(exp && exp.note)).setBackground(bg);       // col 2-3
      sheet.getRange(r,4,1,2).merge().setValue(amount).setBackground(bg).setNumberFormat("#,##0.00").setHorizontalAlignment("right"); // col 4-5
      r++;
    });
    sheet.getRange(r,1).setBackground(LRED); // คอลัมน์ 1
    sheet.getRange(r,2,1,2).merge().setValue("รวมค่าใช้จ่าย").setBackground(LRED).setFontWeight("bold"); // col 2-3
    sheet.getRange(r,4,1,2).merge().setValue(data.totalExpenses).setBackground(LRED).setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right"); // col 4-5
    r++;
  }
  r++;

  // ── สรุปกำไรสุทธิ ────────────────────────────
  sheet.getRange(r,1,1,5).merge()
    .setValue("สรุปกำไรสุทธิ")
    .setBackground(GREEN).setFontColor("white").setFontWeight("bold");
  r++;
  // ⚠️ ป้ายบรรทัดสุดท้ายต้องมีช่องว่างนำหน้า "=" ห้ามตัดออก
  // setValue() ของ Apps Script ตีความสตริงที่ "ขึ้นต้นด้วย =" เป็นสูตรเสมอ
  // ผลคือช่องนี้เคยขึ้น #ERROR! บนชีตสรุปทุกใบ (ทั้งรายวันและรายเดือน) ตั้งแต่วันแรก
  // ตัวเลขกำไรในคอลัมน์ขวายังถูกต้อง ผิดเฉพาะป้ายข้อความ แต่ขึ้น #ERROR! บนรายงานการเงิน
  // ทำให้คนที่เปิดดู (เช่นคนทำบัญชี) เข้าใจว่าตัวเลขเชื่อไม่ได้
  // เว้นวรรคหน้าสุดทำให้ Sheets เก็บเป็นข้อความธรรมดา หน้าตาบนจอแทบไม่ต่างจากเดิม
  // กฎเดียวกันนี้ใช้กับ + - @ ด้วย — สำรวจทั้งไฟล์แล้ว (10 ก.ย. 2569) มีจุดนี้จุดเดียว
  [
    ["รายได้รวม", data.totalRevenue, LGREEN, "#166534"],
    ["(-) ค่าใช้จ่ายรวม", -data.totalExpenses, LRED, "#9f1239"],
    [" = กำไรสุทธิ", data.netIncome, data.netIncome>=0?LGREEN:LRED, data.netIncome>=0?"#166534":"#9f1239"]
  ].forEach(function(row){
    sheet.getRange(r,1,1,4).merge().setValue(row[0]).setBackground(row[2]).setFontWeight("bold");
    sheet.getRange(r,5).setValue(row[1]).setBackground(row[2]).setFontColor(row[3]).setFontWeight("bold").setFontSize(11).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    r++;
  });
  r++;

  // ── ค่าคอมมิชชั่นรายบุคคล ───────────────────
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("ค่าคอมมิชชั่นพนักงานรายบุคคล")
    .setBackground(DARK).setFontColor("white").setFontWeight("bold");
  r++;
  var comHeaders = ["ชื่อพนักงาน","ตำแหน่ง","จำนวนงาน","ยอดขาย (฿)","ค่าคอม (฿)"];   // ยอดขายรวมสินค้า — จำนวนงานแสดง "งาน · สินค้า" เมื่อมีสินค้า
  styleHeaderRow(sheet, r, comHeaders, "#1e293b", "#e2e8f0");
  r++;
  var staff = data.staffCommissions || [];
  staff.sort(function(a,b){return (Number(b.commission)||0) - (Number(a.commission)||0);});
  var totalCom = 0;
  staff.forEach(function(st, i) {
    var bg = i%2===0 ? "#f8fafc" : "white";
    var stCount = Number(st.count) || 0;
    var stSales = Number(st.salesSum) || 0;
    var stComm  = Number(st.commission) || 0;
    sheet.getRange(r,1).setValue(safeCell(st.name || "ไม่ระบุ")).setBackground(bg).setFontWeight("bold");
    sheet.getRange(r,2).setValue(safeCell(st.role || "-")).setBackground(bg).setFontColor("#64748b");
    // ข้อ 22: คนที่ขายสินค้าด้วย แสดง "งาน · สินค้า" คู่กัน (ยอดขายรวมสินค้า — เดิมจำนวนนับแค่งานบริการ อ่านแล้วไม่ตรงกัน)
    var stProd = Number(st.productCount) || 0;
    sheet.getRange(r,3).setValue(stProd > 0 ? safeCell(stCount + " งาน · " + stProd + " สินค้า") : stCount).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r,4).setValue(stSales).setBackground(bg).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,5).setValue(stComm).setBackground(bg).setFontColor("#0f766e").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    totalCom += stComm;
    r++;
  });
  sheet.getRange(r,1,1,4).merge().setValue("รวมค่าคอมทั้งหมด").setBackground("#e2e8f0").setFontWeight("bold");
  sheet.getRange(r,5).setValue(totalCom).setBackground("#ccfbf1").setFontColor("#0f766e").setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
  r++;

  sheet.autoResizeColumns(1, 5);
  sheet.setFrozenRows(1);
}

// ── MASTER SUMMARY SHEET ──────────────────────
function masterHeaders_() {
  return [MASTER_TYPE_HEADER, MASTER_PERIOD_HEADER, MASTER_BILL_HEADER]
    .concat(MASTER_VAT_HEADERS)
    .concat([MASTER_REV_HEADER, MASTER_EXP_HEADER, MASTER_NET_HEADER, MASTER_VAR_HEADER, MASTER_TS_HEADER]);
}
// แท็บ "สรุปรายเดือน" ที่หัวเขียนค้าง/ว่างและยังไม่มีแถวข้อมูล (ข้อ 9) → เขียนหัวให้ครบ · คืน true เมื่อซ่อม
// เดิม: งานเผยแพร่ที่ค้าง (journal) "ทำต่อให้จบ" เข้าหัวครึ่งเดียวทุกคำขอ = สรุปทุกใบล้มถาวร จนคนลบแท็บเอง
function repairUnfinishedMasterHeader_(master) {
  if (!master || !headerIsUnfinishedPrefix_(master, [masterHeaders_()])) return false;
  styleHeaderRow(master, 1, masterHeaders_(), "#1e293b", "#e2e8f0");
  master.setFrozenRows(1);
  Logger.log("ซ่อมหัวตารางที่เขียนค้างของแท็บ " + MASTER_SHEET_NAME);
  return true;
}

function updateMasterSummarySheet(ss, data, periodType, periodKey) {
  var masterName = MASTER_SHEET_NAME;
  var master = ss.getSheetByName(masterName);
  if (!master) {
    master = ss.insertSheet(masterName, 0);
    styleHeaderRow(master, 1, masterHeaders_(), "#1e293b", "#e2e8f0");
    master.setFrozenRows(1);
  } else if (repairUnfinishedMasterHeader_(master)) {
    SpreadsheetApp.flush();
  } else {
    // ต้อง flush ให้การแทรกคอลัมน์มีผลจริงก่อน — writeToMaster ด้านล่างอ่านหัวตารางซ้ำ
    // ถ้าอ่านก่อนที่ Sheets จะ apply การแทรก จะหาคอลัมน์ใหม่ไม่เจอแล้วข้ามการเขียนเงินขาด/เกินไปทั้งรอบ
    migrateMasterAddVarianceColumn(master);
    migrateMasterAddVatColumns(master);
    SpreadsheetApp.flush();
  }
  var columns = masterColumnMap_(master);
  var layoutProblem = validateMasterColumnMap_(columns);
  if (layoutProblem) {
    // หยุดก่อนเขียนเสมอ: ปลอดภัยกว่าการเดาคอลัมน์แล้วทำให้ยอดไปอยู่ช่องผิดแบบเงียบ ๆ
    throw new Error("โครงสร้างชีต 'สรุปรายเดือน' ไม่ปลอดภัย: " + layoutProblem);
  }

  var lastRow = master.getLastRow();
  var found   = false;
  // อ่านคอลัมน์ "ช่วงเวลา" ทั้งหมดครั้งเดียว (เดิมอ่านทีละเซลล์ใน loop — ช้าลงเรื่อยๆ เมื่อแถวสะสมเป็นร้อย)
  if (lastRow > 1) {
    var keys = master.getRange(2, columns.periodCol, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(periodKey)) {
        writeToMaster(master, i + 2, periodType, periodKey, data, columns);
        found = true;
        break;
      }
    }
  }
  if (!found) writeToMaster(master, lastRow + 1, periodType, periodKey, data, columns);
  master.autoResizeColumns(1, Math.max(master.getLastColumn(), 1));
}

// หาตำแหน่งคอลัมน์จาก "หัวตาราง" ไม่ใช่จากเลขคอลัมน์ตายตัว
// เหตุผล: เดิมเขียนตามเลข 7/8 ตายตัว ถ้าชีตของจริงมีคอลัมน์ค้าง/ถูกแทรกเพิ่มโดยคน
// การเขียนตามเลขจะไปทับคอลัมน์ "อัปเดตล่าสุด" ด้วยตัวเลขเงิน — เพี้ยนแบบเงียบ ๆ หาสาเหตุยาก
// คืน 0 = ไม่พบคอลัมน์นั้น (ผู้เรียกต้องเช็คก่อนใช้เสมอ)
function masterColumnMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { typeCol: 0, periodCol: 0, billCol: 0, varCol: 0, tsCol: 0, revCol: 0, expCol: 0, netCol: 0, vatCols: [0, 0, 0, 0], duplicates: [] };
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var map = { typeCol: 0, periodCol: 0, billCol: 0, varCol: 0, tsCol: 0, revCol: 0, expCol: 0, netCol: 0, vatCols: [0, 0, 0, 0], duplicates: [] };
  var requiredHeaders = [
    { key: "typeCol", label: MASTER_TYPE_HEADER },
    { key: "periodCol", label: MASTER_PERIOD_HEADER },
    { key: "billCol", label: MASTER_BILL_HEADER },
    { key: "revCol", label: MASTER_REV_HEADER },
    { key: "expCol", label: MASTER_EXP_HEADER },
    { key: "netCol", label: MASTER_NET_HEADER },
    { key: "varCol", label: MASTER_VAR_HEADER },
    { key: "tsCol", label: MASTER_TS_HEADER }
  ];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    for (var j = 0; j < requiredHeaders.length; j++) {
      var spec = requiredHeaders[j];
      if (h === spec.label) {
        if (map[spec.key] > 0) map.duplicates.push(spec.label);
        else map[spec.key] = i + 1;
      }
    }
    for (var k = 0; k < MASTER_VAT_HEADERS.length; k++) {
      if (h === MASTER_VAT_HEADERS[k]) {
        if (map.vatCols[k] > 0) map.duplicates.push(MASTER_VAT_HEADERS[k]);
        else map.vatCols[k] = i + 1;
      }
    }
  }
  return map;
}

// โครงสร้างหลักต้องมีหัวครบและไม่ซ้ำ จึงจะอนุญาตให้เขียนยอด
function validateMasterColumnMap_(map) {
  var required = [
    ["typeCol", MASTER_TYPE_HEADER], ["periodCol", MASTER_PERIOD_HEADER], ["billCol", MASTER_BILL_HEADER],
    ["revCol", MASTER_REV_HEADER], ["expCol", MASTER_EXP_HEADER], ["netCol", MASTER_NET_HEADER],
    ["varCol", MASTER_VAR_HEADER], ["tsCol", MASTER_TS_HEADER]
  ];
  var missing = [];
  for (var i = 0; i < required.length; i++) {
    if (!map[required[i][0]]) missing.push(required[i][1]);
  }
  if (missing.length) return "ไม่พบหัวคอลัมน์: " + missing.join(", ");
  if (map.duplicates && map.duplicates.length) return "พบหัวคอลัมน์ซ้ำ: " + map.duplicates.join(", ");
  var vatCount = 0;
  for (var j = 0; j < map.vatCols.length; j++) if (map.vatCols[j] > 0) vatCount++;
  // VAT ต้องมีครบทั้ง 4 ช่องหรือไม่มีเลย: เจอเพียงบางช่องแปลว่า migration ค้าง/มีคนแก้หัวตาราง
  // หยุดดีกว่าเขียนยอดส่วนหนึ่งแล้วทำให้รายงาน VAT ดูเหมือนถูกต้องทั้งที่ข้อมูลขาด
  if (vatCount > 0 && vatCount < MASTER_VAT_HEADERS.length) {
    return "พบหัวคอลัมน์ VAT ไม่ครบ (ต้องมีครบ 4 ช่อง หรือไม่มีเลย)";
  }
  return "";
}

// migration ทำได้เฉพาะ master เก่าที่รู้จักโครงสร้างครบและไม่มีหัวซ้ำ
// ถ้าเป็นชีตที่คนทำเอง/เพี้ยน ให้ write หยุดด้วย error โดยไม่แทรกคอลัมน์เข้าไปเพิ่ม
function isRecognizedLegacyMasterLayout_(map) {
  if (map.duplicates && map.duplicates.length) return false;
  return !!(map.typeCol && map.periodCol && map.billCol && map.revCol && map.expCol && map.netCol && map.tsCol);
}

// แทรกคอลัมน์ "เงินขาด/เกิน" ให้ชีต master ที่สร้างไว้ก่อนเวอร์ชันนี้
// idempotent: ถ้าหาคอลัมน์นี้เจอแล้ว = เคย migrate แล้ว ไม่ทำซ้ำ
// แทรกก่อน "อัปเดตล่าสุด" เพื่อให้คอลัมน์เงินอยู่ติดกัน — ข้อมูลเดิมเลื่อนตามอัตโนมัติ ไม่หาย
// แทรก 4 คอลัมน์ VAT ให้ชีตที่สร้างไว้ก่อนเวอร์ชันนี้
// idempotent: เจอครบแล้วออกเลย · เจอบางส่วน = โครงสร้างเพี้ยน ไม่แตะดีกว่าทำข้อมูลพัง
function migrateMasterAddVatColumns(master) {
  var cols = masterColumnMap_(master);
  if (!isRecognizedLegacyMasterLayout_(cols)) return;
  var found = 0;
  for (var i = 0; i < cols.vatCols.length; i++) { if (cols.vatCols[i] > 0) found++; }
  if (found === MASTER_VAT_HEADERS.length) return;   // ครบแล้ว
  if (found > 0) return;                             // ครบบ้างไม่ครบบ้าง — ไม่แตะ
  if (cols.revCol === 0) return;                     // ไม่รู้จักโครงสร้าง — ไม่แตะ

  // แทรกทีละคอลัมน์หน้า "รายได้รวม" โดยไล่จากขวาไปซ้าย ตำแหน่งเดิมจึงไม่ขยับระหว่างทาง
  for (var j = MASTER_VAT_HEADERS.length - 1; j >= 0; j--) {
    master.insertColumnBefore(cols.revCol);
    master.getRange(1, cols.revCol)
      .setValue(MASTER_VAT_HEADERS[j])
      .setBackground("#334155").setFontColor("#e2e8f0")
      .setFontWeight("bold").setHorizontalAlignment("center");
  }
}

function migrateMasterAddVarianceColumn(master) {
  var cols = masterColumnMap_(master);
  if (cols.varCol > 0) return;   // มีแล้ว
  if (!isRecognizedLegacyMasterLayout_(cols)) return; // ไม่รู้จักโครงสร้างชีตนี้ — ไม่แตะ ดีกว่าทำข้อมูลเพี้ยน
  master.insertColumnBefore(cols.tsCol);
  master.getRange(1, cols.tsCol)
    .setValue(MASTER_VAR_HEADER)
    .setBackground("#1e293b").setFontColor("#e2e8f0")
    .setFontWeight("bold").setHorizontalAlignment("center");
}

function writeToMaster(sheet, row, type, key, data, columnMap) {
  var colsRev = columnMap || masterColumnMap_(sheet);
  var layoutProblem = validateMasterColumnMap_(colsRev);
  if (layoutProblem) throw new Error("โครงสร้างชีต 'สรุปรายเดือน' ไม่ปลอดภัย: " + layoutProblem);

  var totalRevenue = readFiniteNumber_(data.totalRevenue, "totalRevenue", true);
  var totalExpenses = readFiniteNumber_(data.totalExpenses, "totalExpenses", true);
  var billCount = readFiniteNumber_(data.billCount, "billCount", true);
  if (totalRevenue < 0 || totalExpenses < 0 || billCount < 0 || Math.floor(billCount) !== billCount) {
    throw new Error("ยอดสรุปต้องเป็นจำนวนที่ถูกต้องและจำนวนบิลต้องเป็นจำนวนเต็มไม่ติดลบ");
  }
  // กำไรสุทธิคำนวณในฝั่งเซิร์ฟเวอร์ ลดโอกาสที่ payload เก่าหรือผิดรูปแบบทำให้สรุปเพี้ยน
  var net = totalRevenue - totalExpenses;
  var netBg  = net >= 0 ? "#dcfce7" : "#ffe4e6";
  var netClr = net >= 0 ? "#166534" : "#9f1239";
  sheet.getRange(row,colsRev.typeCol).setValue(type === "month" ? "รายเดือน" : "รายวัน");
  sheet.getRange(row,colsRev.periodCol).setNumberFormat("@").setValue(key).setFontWeight("bold");
  sheet.getRange(row,colsRev.billCol).setValue(billCount).setHorizontalAlignment("center");
  // รายได้รวม — หาคอลัมน์จากหัวตาราง (ชีตเก่าอยู่ช่อง 4 ชีตใหม่ถูกดัน 4 ช่องเพราะคอลัมน์ VAT)
  sheet.getRange(row,colsRev.revCol).setValue(totalRevenue).setNumberFormat("#,##0.00").setBackground("#fef9c3").setHorizontalAlignment("right");

  // 4 ช่อง VAT — เขียนเมื่อหาคอลัมน์เจอเท่านั้น ห้ามเดาเลขคอลัมน์
  if (colsRev.vatCols[0] > 0 && colsRev.vatCols[1] > 0 && colsRev.vatCols[2] > 0 && colsRev.vatCols[3] > 0) {
    var vals = [readFiniteNumber_(data.nonVatBase, "nonVatBase", false), readFiniteNumber_(data.vatableBase, "vatableBase", false), readFiniteNumber_(data.vatAmount, "vatAmount", false), readFiniteNumber_(data.rounding, "rounding", false)];
    // งวดก่อนเปิด VAT: แอปส่ง nonVatBase = totalRevenue มาให้แล้ว ค่าที่เหลือเป็น 0 ตามจริง
    var bgs = ["#f8fafc", "#e6f1fb", "#fef3c7", "#f1f5f9"];
    var fgs = ["#475569", "#0c447c", "#854f0b", "#64748b"];
    for (var v = 0; v < 4; v++) {
      sheet.getRange(row, colsRev.vatCols[v])
        .setValue(vals[v]).setNumberFormat("#,##0.00")
        .setBackground(bgs[v]).setFontColor(fgs[v])
        .setFontWeight(v === 2 && vals[2] > 0 ? "bold" : "normal")
        .setHorizontalAlignment("right");
    }
  }
  // ⚠️ ค่าใช้จ่าย/กำไรสุทธิ ต้องหาจากหัวตารางเช่นกัน — พอแทรกคอลัมน์ VAT เข้ามา 4 ช่อง
  // สองคอลัมน์นี้เลื่อนจากช่อง 5-6 ไปเป็น 9-10 ถ้ายังเขียนตามเลขเดิมจะไปทับคอลัมน์ VAT
  sheet.getRange(row,colsRev.expCol).setValue(totalExpenses).setNumberFormat("#,##0.00").setBackground("#ffe4e6").setHorizontalAlignment("right");
  sheet.getRange(row,colsRev.netCol).setValue(net).setNumberFormat("#,##0.00").setBackground(netBg).setFontColor(netClr).setFontWeight("bold").setHorizontalAlignment("right");

  // เงินขาด/เกิน — แยกสี 3 ระดับ: ขาด(แดง) / เกิน(เขียว) / ตรงพอดีหรือยังไม่ปิดกะ(เทา)
  // ใช้ "—" เมื่อยังไม่มีกะปิดในงวดนั้น เพื่อไม่ให้ 0 (ตรงพอดี) กับ "ยังไม่ปิดกะ" ดูเหมือนกัน
  // ⚠️ หาคอลัมน์จากหัวตาราง ถ้าไม่เจอ = ข้ามไปเลย ห้ามเดาเลขคอลัมน์แล้วเขียนทับของเดิม
  var cols = colsRev;
  if (cols.varCol > 0) {
    var hasShift = readFiniteNumber_(data.shiftCount, "shiftCount", false) > 0;
    var varVal   = readFiniteNumber_(data.cashVariance, "cashVariance", false);
    var varCell  = sheet.getRange(row, cols.varCol);
    if (!hasShift) {
      varCell.setValue("—").setBackground("#f8fafc").setFontColor("#94a3b8")
             .setFontWeight("normal").setHorizontalAlignment("center");
    } else {
      var vBg  = varVal < 0 ? "#ffe4e6" : (varVal > 0 ? "#dcfce7" : "#f1f5f9");
      var vClr = varVal < 0 ? "#9f1239" : (varVal > 0 ? "#166534" : "#475569");
      varCell.setValue(varVal).setNumberFormat("+#,##0.00;-#,##0.00;0.00")
             .setBackground(vBg).setFontColor(vClr)
             .setFontWeight(varVal === 0 ? "normal" : "bold").setHorizontalAlignment("right");
    }
  }

  // timestamp ลงคอลัมน์ "อัปเดตล่าสุด" ที่หาเจอ ถ้าหาไม่เจอค่อยต่อท้ายตาราง (ไม่ทับของใคร)
  sheet.getRange(row, cols.tsCol).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
}

// ── HELPERS ───────────────────────────────────
function getOrCreateSheet(ss, name, headers, headerBg) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    styleHeaderRow(sheet, 1, headers, headerBg || "#1e293b", "white");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ข้อ 9 (ตรวจ 19 ต.ค. 2569): เขียนหัวทั้งแถวด้วย setValues ครั้งเดียว — เดิมเขียนทีละช่อง (13 ครั้ง)
// Google ล้มกลางทางได้หัวครึ่งเดียว · ตอนนี้ได้ "ครบ" หรือ "ไม่มีเลย" (ว่างทั้งแถว = ซ่อมเองได้ ดู headerIsUnfinishedPrefix_)
function styleHeaderRow(sheet, row, headers, bg, fg) {
  if (!headers || !headers.length) return;
  sheet.getRange(row, 1, 1, headers.length)
    .setValues([headers.slice()])
    .setBackground(bg || "#1e293b")
    .setFontColor(fg || "white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}

function fmt(date, pattern) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), pattern);
}

// ป้ายกำกับช่วงเวลากะ "07-26 11:02→03:14" — ใส่วันที่ด้วยเพราะกะคร่อมเที่ยงคืน
// และในชีตรายเดือนต้องแยกให้ออกว่าแถวไหนของวันไหน
function shiftRangeLabel(sh) {
  var tz = Session.getScriptTimeZone();
  var s = sh.startTime ? Utilities.formatDate(new Date(sh.startTime), tz, "MM-dd HH:mm") : "?";
  var e = sh.endTime   ? Utilities.formatDate(new Date(sh.endTime),   tz, "HH:mm")       : "?";
  return s + "→" + e;
}

function numFmt(n) {
  return (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ⚠️ เดิมช่องทางที่ไม่รู้จัก "อะไรก็ตาม" ถูกแปลงเป็น "เงินสด" เงียบ ๆ
// ผลคือบิลที่ส่งช่องทางผิดมาจะถูกบันทึกเป็นเงินสด แล้วยอดเงินสดในชีตไม่ตรงกับลิ้นชักจริง
// ตอนนี้แยกเป็นสองอย่าง: แปลงเฉพาะค่าที่รองรับ · ค่าที่ไม่รู้จักให้ผู้เรียกปฏิเสธไปเลย
var PAYMENT_LABELS = { cash: "เงินสด", promptpay: "Scan (QR)", credit: "Credit Card" };
function isKnownPayment_(method) {
  // บิลรุ่นเก่ามากที่ไม่ส่งช่องทางมาเลย ยังถือว่าเป็นเงินสดตามเดิม (ค่าตั้งต้นของระบบ)
  if (method === undefined || method === null || method === "") return true;
  return Object.prototype.hasOwnProperty.call(PAYMENT_LABELS, String(method));
}
function payLabel(method) {
  if (method === undefined || method === null || method === "") return PAYMENT_LABELS.cash;
  return PAYMENT_LABELS[String(method)] || PAYMENT_LABELS.cash;
}

// ── แบ่งจ่าย (6 ต.ค. 2569) ────────────────────────────────────────────────────
// ตรวจก้อนเงินของบิลแบ่งจ่าย: 2–10 ก้อน · ช่องทาง cash/promptpay/credit · ก้อนละ > 0 ไม่เกินสตางค์ · ผลรวม = ยอดสุทธิ
// คืน { ok, list: [{method, amount}] } หรือ { ok: false, msg }
function readSplitPayments_(list, total) {
  if (Object.prototype.toString.call(list) !== "[object Array]" || list.length < 2 || list.length > 10) {
    return { ok: false, msg: "ต้องมีก้อนเงิน 2–10 ก้อน" };
  }
  if (typeof total !== "number" || !isFinite(total)) return { ok: false, msg: "ยอดสุทธิใช้ไม่ได้" };
  var out = [], sum = 0;
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || typeof p !== "object" || !isKnownPayment_(p.method) || !p.method) {
      return { ok: false, msg: "ช่องทางของก้อนที่ " + (i + 1) + " ไม่ถูกต้อง (" + String(p && p.method) + ")" };
    }
    var a = p.amount;
    if (typeof a !== "number" || !isFinite(a) || !(a > 0) || a > BILL_MAX_BAHT || Math.abs(a * 100 - Math.round(a * 100)) > 1e-6) {
      return { ok: false, msg: "ยอดของก้อนที่ " + (i + 1) + " ใช้ไม่ได้ (" + String(a) + ")" };
    }
    sum += Math.round(a * 100);
    out.push({ method: String(p.method), amount: Math.round(a * 100) / 100 });
  }
  if (sum !== Math.round(total * 100)) {
    return { ok: false, msg: "ก้อนเงินรวม " + (sum / 100) + " ไม่เท่ากับยอดสุทธิ " + total };
  }
  return { ok: true, list: out };
}
// ตัวเลขเงินในป้ายช่องทาง — ต้องตรงกับ sheetMoneyText() ของแอปทุกตัวอักษร (หน้าตรวจความตรงกันเทียบข้อความ)
function moneyText_(n) {
  var s = Math.round((Number(n) || 0) * 100);
  return s % 100 === 0 ? String(s / 100) : (s / 100).toFixed(2);
}
// ป้ายช่องทางในช่อง "ช่องทางชำระเงิน" — บิลแบ่งจ่าย = "เงินสด 400 + Credit Card 660" (ตรงกับ sheetPaymentLabel ของแอป)
function payLabelFor_(method, parts) {
  if (method === "split" && parts && parts.length) {
    var t = [];
    for (var i = 0; i < parts.length; i++) t.push(PAYMENT_LABELS[parts[i].method] + " " + moneyText_(parts[i].amount));
    return t.join(" + ");
  }
  return payLabel(method);
}

// ── เขียน "ข้อความ" ลงชีตให้ได้ข้อความเดิมกลับมาเสมอ ────────────────────────────
// การเขียนสตริงด้วย setValue/setValues/appendRow = เหมือนคนพิมพ์ลงช่อง → Sheets "ตีความ" ให้เอง:
//   ขึ้นต้นด้วย = + - @         → กลายเป็นสูตร (Formula Injection · ป้าย "= กำไรสุทธิ" เคยขึ้น #ERROR! ทุกใบ)
//   ตัวเลขล้วน "0812345678"      → กลายเป็นตัวเลข 812345678 (เลข 0 นำหน้าหาย · ชื่อลูกค้าที่เป็นเบอร์โทรเพี้ยน)
//   หน้าตาเหมือนวันที่ "12/9"    → กลายเป็นวันที่ (บันทึกค่าใช้จ่าย "12/9" กลายเป็น 12 ก.ย.)
//   TRUE / FALSE                 → กลายเป็นค่าความจริง
// เติม ' นำหน้า = Sheets เก็บเป็นข้อความตามตัวอักษร (ไม่โชว์ ' บนจอ และอ่านกลับได้ค่าเดิมไม่มี ')
// ⚠️ ใช้กับ "ข้อความของผู้ใช้" เท่านั้น — ตัวเลขเงินต้องเขียนเป็น number ตรง ๆ (ห้ามผ่านฟังก์ชันนี้)
function safeCell(v) {
  var s = (v == null) ? "" : String(v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  // ตรวจ 13 ต.ค. 2569 ข้อ 20: ขึ้นต้นด้วย ' เอง — Sheets กิน ' ตัวแรกทิ้ง (ชื่อ 'Tom กลายเป็น Tom)
  if (s.charAt(0) === "'") return "'" + s;
  // ช่องว่าง/ขึ้นบรรทัดนำหน้าสูตร (" =1+1") — กันไว้ด้วย ไม่เสียอะไร
  if (/^\s+[=+\-@]/.test(s)) return "'" + s;
  if (looksCoercible_(s)) return "'" + s;
  return s;
}

// ข้อความนี้ Sheets จะแปลงเป็นตัวเลข/วันที่/เวลา/ค่าความจริงไหม (ตั้งใจกว้างไว้ก่อน — เติม ' เกินไม่เสียอะไร)
function looksCoercible_(s) {
  var t = String(s == null ? "" : s).trim();
  if (!t) return false;
  if (/^(true|false)$/i.test(t)) return true;                                                    // ค่าความจริง
  if (/^#/.test(t)) return true;                                                                 // "#N/A" "#REF!" — ข้อ 42: Sheets อ่านเป็นค่า error
  if (!/[0-9]/.test(t)) return false;                                                            // ไม่มีตัวเลขเลย = ข้อความแน่นอน
  // ข้อ 42 (ตรวจ 19 ต.ค. 2569): รูปแบบที่ยังหลุด — ".5" (ตัวเลข) · "10-2026" (เดือน-ปี = วันที่) · "1 1/2" (เศษส่วนคละ)
  if (/^[-+]?\.\d+%?$/.test(t)) return true;
  if (/^\d{1,2}\s*[-\/.]\s*\d{4}$/.test(t)) return true;
  if (/^\d+\s+\d+\/\d+$/.test(t)) return true;
  if (/^\(?[$฿€£]?\s*[0-9][0-9.,\s]*%?\)?$/.test(t)) return true;                              // ตัวเลข/เงิน/เปอร์เซ็นต์
  if (/^[0-9]+(\.[0-9]+)?e[+-]?[0-9]+$/i.test(t)) return true;                                    // 1e5
  if (/^[0-9]{1,4}\s*[\/.\-]\s*[0-9]{1,2}(\s*[\/.\-]\s*[0-9]{1,4})?([ T]+[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?)?$/.test(t)) return true;   // วันที่
  if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?(\s*[ap]\.?m\.?)?$/i.test(t)) return true;                // เวลา
  // วันที่ที่มีชื่อเดือนอังกฤษ: "May 5" · "5 May" · "Sep-10" · "Jan 5, 2026" (ตรวจหมวด D เรื่องเล็ก — ชื่อลูกค้า/พนักงานแบบนี้
  // ชีตแปลงเป็นวันที่ แล้วชื่อหายจากแถว) · ต้องมีแค่ชื่อเดือน + ตัวเลข + ตัวคั่น ("Mayo 5" / "May 5 ร้านกาแฟ" = ข้อความ)
  var MON = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\\.?";
  var SEP = "[\\s,\\/.\\-]*";
  if (new RegExp("^([0-9]{1,4}" + SEP + ")?" + MON + "(" + SEP + "[0-9]{1,4}){0,2}" +
      "(\\s+[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?(\\s*[ap]\\.?m\\.?)?)?$", "i").test(t)) return true;
  return false;
}

// ── อ่านช่อง "ข้อความ" กลับจากชีต ─────────────────────────────────────────────────
// ช่องที่ Sheets แปลงเป็นวันที่ไปแล้ว getValues() คืน Date — String(Date) ได้ "Thu Sep 10 2026 21:30:00 GMT+0700 ..."
// ไม่ใช่ "2026-09-10 21:30:00" ที่เขียนลงไป · แปลงกลับด้วยเขตเวลาของไฟล์ชีต (ตัวเดียวกับที่ Sheets ใช้ตีความตอนเขียน)
// จึงได้ข้อความเดิมเป๊ะไม่ว่าโปรเจกต์ Apps Script จะตั้งเขตเวลาไว้เป็นอะไร
function cellText_(v, tz, pattern) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (isNaN(v.getTime())) return "";
    return Utilities.formatDate(v, tz, pattern || "yyyy-MM-dd HH:mm:ss");
  }
  return String(v);
}

function spreadsheetTz_(ss) {
  try { var tz = ss && ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : ""; if (tz) return tz; } catch (e) {}
  return Session.getScriptTimeZone();
}

// รับเฉพาะตัวเลขจริงก่อนเขียนลงชีต ไม่แปลงค่าผิดเป็น 0 แบบเงียบ ๆ
function readFiniteNumber_(value, fieldName, required) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("ไม่มีค่า " + fieldName + " ในข้อมูลสรุป");
    return 0;
  }
  var n = Number(value);
  if (!isFinite(n)) throw new Error("ค่า " + fieldName + " ต้องเป็นตัวเลข");
  return n;
}

// code = รหัสเครื่องอ่าน ใช้แทนการให้ฝั่งแอปไปเดาจาก "ข้อความภาษาไทย"
// (ข้อความมีไว้ให้คนอ่าน วันไหนแก้คำแล้วตรรกะฝั่งแอปพังตามคือสิ่งที่ต้องกันไว้)
function json(status, message, details, code) {
  var r = { status: status, message: message };
  if (code) r.code = code;
  if (details) r.details = details;
  return ContentService.createTextOutput(JSON.stringify(r))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ลบแท็บสรุปรายวันที่เก่า (กันแท็บบวม)
function pruneOldDailySheets(ss, keepDays, keepName) {
  if (!keepDays || keepDays <= 0) return;
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - keepDays);
  var sheets = ss.getSheets(), moved = 0;
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var m = name.match(/^สรุป-(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    if (keepName && name === keepName) continue;   // ข้อ 9: แท็บที่เพิ่งเขียนในคำขอนี้ — ไม่ลบทันที
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d < cutoff) {
      // ข้อ 9 (ผู้ตรวจอิสระ): ย้ายรหัสรุ่นของแท็บไปเก็บใน Script Properties "ก่อน" ลบ — แท็บที่เขียนตอนอายุ 61–62 วันไม่มีรหัสใน properties
      // ถ้าเก็บไม่ได้ = ยังไม่ลบแท็บนี้ (กันคำขอเก่าทับยอดใหม่) — ลองใหม่รอบหน้า
      try {
        var z = sheets[i].getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL, 1, 1).getValues()[0][0];
        var zn = Number(z);
        if (z !== "" && z !== null && z !== undefined) {
          // มีรหัสรุ่นแต่อ่านไม่ได้ = ยังลบไม่ได้ มิฉะนั้นด่าน STALE_SUMMARY จะเหลือรุ่น 0
          if (!isFinite(zn) || zn <= 0) throw new Error("unreadable summary stamp: " + name);
          var props = PropertiesService.getScriptProperties(), pk = summaryStampPropKey_(name);
          var cur = Number(props.getProperty(pk));
          if (!(isFinite(cur) && cur >= zn)) { props.setProperty(pk, String(zn)); moved++; }
        }
      } catch (stampErr) { Logger.log("keep stamp before prune failed: " + stampErr); continue; }
      try { ss.deleteSheet(sheets[i]); } catch (e) {}
    }
  }
  if (moved) pruneSummaryStampProps_("");   // ข้อ 68 — วันละครั้งพร้อมการลบแท็บเก่า
}

// ── ตรวจช่อง "เดือน" ของทะเบียนเลขบิล (อ่านอย่างเดียว · รันจาก Apps Script editor) ─────────────
// นับว่ามีกี่แถวที่ชีตแปลงเป็นวันที่ และกี่แถวที่อ่านเป็นเดือนไม่ได้เลย — ไม่แก้อะไรในชีต
function checkBillIndexMonths() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(BILL_INDEX_NAME_);
  if (!sh || sh.getLastRow() < 2) { Logger.log("ไม่มีทะเบียนเลขบิล"); return; }
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues(), text = 0, date = 0, bad = [];
  rows.forEach(function(r, i) {
    if (String(r[0] || "") === "") return;
    var isDate = Object.prototype.toString.call(r[1]) === "[object Date]";
    if (isDate) date++; else text++;
    if (!isValidMonthKey_(billIndexMonth_(r[1], ss)) && bad.length < 20) bad.push("แถว " + (i + 2) + ": " + r[0] + " = " + r[1]);
  });
  Logger.log("ข้อความ: " + text + " แถว · ถูกแปลงเป็นวันที่: " + date + " แถว (อ่านได้ถูกแล้วหลังแก้)");
  Logger.log(bad.length ? "อ่านเป็นเดือนไม่ได้: " + bad.join(" | ") : "ทุกแถวอ่านเป็นเดือนได้ถูกต้อง");
}
