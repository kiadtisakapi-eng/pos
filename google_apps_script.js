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
 * อัปเกรดเป็นรุ่น 1.7 (ก.ย. 2569) — ทำหลังอัปเดตหน้าเว็บ (app.js/index.html) แล้ว
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
//  หมายเหตุ: handleListBackups ส่งรายการกลับไม่เกิน 50 ไฟล์ล่าสุด
//  ที่ 90 วันจะมี ~180 ไฟล์ ไฟล์ที่เก่ากว่า 50 อันดับแรกจึงไม่โผล่ในหน้ากู้ข้อมูล
//  แต่ยังอยู่ใน Drive และเปิดเองได้ — ไม่ได้หาย
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
function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (err) { return json("error", "ระบบหนาแน่น กรุณาลองใหม่"); }

  try {
    if (!e || !e.postData || !e.postData.contents)
      return json("error", "ไม่พบข้อมูลที่ส่งมา");

    var data = JSON.parse(e.postData.contents);

    // ตรวจสอบรหัสเชื่อมต่อจาก Script Properties — ไม่ยอมให้ endpoint ทำงานถ้ายังไม่ได้ตั้งค่า
    var expectedToken = getPosApiToken_();
    if (!expectedToken) {
      return json("error", "ยังไม่ได้ตั้งรหัสเชื่อมต่อ POS — ให้รัน setupPosApiToken() ใน Apps Script ก่อน");
    }
    if (!constantTimeEquals_(String(data.secret || ""), expectedToken)) {
      return json("error", "ไม่ได้รับอนุญาต (unauthorized)");
    }

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
      "list_backups":     function () { return handleListBackups(); },
      "get_backup":       function () { return handleGetBackup(data); },
      "void_transaction": function () { return handleVoidTransaction(data, ss); },
      "list_bills":       function () { return handleListBills(data, ss); },
      "list_bill_months": function () { return handleListBillMonths(data, ss); },
      "primary_status":   function () { return handlePrimaryStatus(data); },
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
    return ACTION_HANDLERS[action]();

  } catch (err) {
    return json("error", "ข้อผิดพลาด: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

function doGet(e)     { return ContentService.createTextOutput("Erotica POS API v2 — active").setMimeType(ContentService.MimeType.TEXT); }

// สร้างรหัสครั้งแรก: รันจาก Apps Script editor แล้วคัดลอกค่าที่ return ไปใส่ใน POS แต่ละเครื่อง
function setupPosApiToken() {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty(POS_API_TOKEN_PROPERTY) || "");
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty(POS_API_TOKEN_PROPERTY, token);
  }
  Logger.log("POS API token: " + token);
  return token;
}

// ใช้เมื่อต้องสงสัยว่ารหัสหลุด: รันฟังก์ชันนี้ แล้วเปลี่ยนรหัสใน POS ทุกเครื่องทันที
function rotatePosApiToken() {
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(POS_API_TOKEN_PROPERTY, token);
  Logger.log("New POS API token: " + token);
  return token;
}

function getPosApiToken_() {
  var token = String(PropertiesService.getScriptProperties().getProperty(POS_API_TOKEN_PROPERTY) || "");
  return /^[A-Za-z0-9_-]{24,200}$/.test(token) ? token : "";
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
//   · บิลรายใบ/ยกเลิกบิล ส่งได้ทุกเครื่องตามเดิม (แถวบิลแยกกันต่อใบ มีรุ่นกันทับ)
//     — แต่ยอดของเครื่องรองจะ "ไม่อยู่ในแท็บสรุป" เพราะสรุปมาจากข้อมูลของเครื่องหลักเท่านั้น
//   · ยังไม่มีเครื่องหลัก → เครื่องแรกที่ส่งสรุป/สำรองพร้อมรหัสเครื่อง ได้เป็นเครื่องหลัก
//   · แอปรุ่นเก่าที่ไม่ส่งรหัสเครื่อง → ยอมตามเดิมเฉพาะตอนที่ยังไม่มีเครื่องหลัก (ช่วงอัปเกรด)
//   · ย้ายเครื่องหลัก (เปลี่ยน iPad/ล้างเครื่อง) → เจ้าของสั่งจากเครื่องใหม่ด้วยรหัสเจ้าของ (claim_primary)
var POS_PRIMARY_DEVICE_PROPERTY = "POS_PRIMARY_DEVICE";
var PRIMARY_ONLY_ACTIONS = { "summary_day": true, "summary_month": true, "backup": true };
var DEVICE_ID_RE_ = /^[A-Za-z0-9_-]{16,64}$/;

// คืน null = ยังไม่มีเครื่องหลัก · ค่าเสีย = โยน error (ปิดไว้ก่อน ไม่เดาว่าใครเป็นเครื่องหลัก)
function readPrimaryDevice_() {
  var raw = PropertiesService.getScriptProperties().getProperty(POS_PRIMARY_DEVICE_PROPERTY);
  if (!raw) return null;
  var o = null;
  try { o = JSON.parse(raw); } catch (e) { o = null; }
  if (!o || typeof o !== "object" || !DEVICE_ID_RE_.test(String(o.id || ""))) {
    throw new Error("ข้อมูลเครื่องหลัก (POS_PRIMARY_DEVICE) ใน Script Properties เสีย — " +
      "ให้เจ้าของตั้งเครื่องหลักใหม่จากหน้าตั้งค่าของเครื่องที่ใช้ขาย (ต้องใช้รหัสเจ้าของ)");
  }
  return o;
}

function cleanDeviceLabel_(v) {
  return safeCell(String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim()).slice(0, 40);
}

function devicePublic_(o) {
  return o ? { label: cleanDeviceLabel_(o.label), claimedAt: Number(o.claimedAt) || 0, how: String(o.how || "").slice(0, 40) } : null;
}

function writePrimaryDevice_(o) {
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
    if (!DEVICE_ID_RE_.test(dev)) return null;   // แอปรุ่นเก่า + ยังไม่มีเครื่องหลัก = ยอมตามเดิม
    writePrimaryDevice_({ id: dev, label: cleanDeviceLabel_(data.deviceLabel), claimedAt: Date.now(), how: "auto:" + action });
    return null;
  }
  if (DEVICE_ID_RE_.test(dev) && dev === cur.id) return null;
  return json("error",
    "เครื่องนี้ไม่ใช่เครื่องหลักของร้าน — สรุปบนชีตและไฟล์สำรองรับจากเครื่องหลักเครื่องเดียว" +
    (cur.label ? " (" + cleanDeviceLabel_(cur.label) + ")" : "") +
    " · ถ้าจะย้ายเครื่องหลักมาเครื่องนี้ ให้เจ้าของกด \"ตั้งเครื่องนี้เป็นเครื่องหลัก\" ในหน้าตั้งค่า",
    { primary: devicePublic_(cur) }, "NOT_PRIMARY_DEVICE");
}

function handlePrimaryStatus(data) {
  var dev = String(data.deviceId == null ? "" : data.deviceId);
  var cur = readPrimaryDevice_();
  return json("success", cur ? "มีเครื่องหลักแล้ว" : "ยังไม่มีเครื่องหลัก", {
    registered: !!cur,
    isThisDevice: !!cur && DEVICE_ID_RE_.test(dev) && dev === cur.id,
    primary: devicePublic_(cur)
  });
}

// ต้องใช้รหัสเจ้าของ (ดู OWNER_KEY_ACTIONS) — ย้ายสิทธิ์ส่งสรุป/สำรองมาที่เครื่องที่ส่งคำขอนี้
function handleClaimPrimary(data) {
  var dev = String(data.deviceId == null ? "" : data.deviceId);
  if (!DEVICE_ID_RE_.test(dev)) return json("error", "รหัสเครื่องไม่ถูกต้อง", null, "INVALID_DEVICE_ID");
  var prev = null;
  try { prev = readPrimaryDevice_(); } catch (e) { prev = null; }   // ค่าเดิมเสีย = เจ้าของกำลังตั้งใหม่ทับ
  var saved = writePrimaryDevice_({ id: dev, label: cleanDeviceLabel_(data.deviceLabel), claimedAt: Date.now(), how: "owner",
    previous: prev && prev.id !== dev ? devicePublic_(prev) : null });
  return json("success", "ตั้งเครื่องนี้เป็นเครื่องหลักแล้ว", { primary: devicePublic_(saved), previous: prev && prev.id !== dev ? devicePublic_(prev) : null });
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

function handleBackup(data, ss) {
  var backup = data ? data.backupData : undefined;
  var why = validateBackupStructure_(backup);
  if (why) {
    return json("error", "ไม่รับไฟล์สำรองนี้ เพราะกู้กลับไม่ได้: " + why, null, "BACKUP_INVALID");
  }
  var folder, file, fileName;
  var expectedCompact = JSON.stringify(backup);
  try {
    folder = getBackupFolder_(true);
    var timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    fileName = BACKUP_FILE_PREFIX + timeStamp + ".json";
    file = folder.createFile(fileName, JSON.stringify(backup, null, 2), MimeType.PLAIN_TEXT);
  } catch (err) {
    return json("error", "การสำรองข้อมูลล้มเหลว: " + err.toString(), null, "BACKUP_WRITE_FAILED");
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
    cleanupError: cleanupError
  });
}


// หาโฟลเดอร์สำรองใน Drive โดยจำ Folder ID ไว้ใน Script Properties
// Google Drive อนุญาตชื่อซ้ำ จึงห้ามหยิบ "ตัวแรก" แบบเดา เพราะอาจอ่าน/เขียนคนละโฟลเดอร์
function getBackupFolder_(createIfMissing) {
  var props = PropertiesService.getScriptProperties();
  var savedId = String(props.getProperty(POS_BACKUP_FOLDER_ID_PROPERTY) || "");
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (err) {
      // โฟลเดอร์ถูกลบหรือเจ้าของสิทธิ์เปลี่ยน: ล้าง ID เก่า แล้วตรวจชื่ออย่างเข้มงวดด้านล่าง
      props.deleteProperty(POS_BACKUP_FOLDER_ID_PROPERTY);
    }
  }

  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  var matches = [];
  while (folders.hasNext()) matches.push(folders.next());
  if (matches.length > 1) {
    throw new Error("พบโฟลเดอร์สำรองชื่อ " + BACKUP_FOLDER_NAME + " มากกว่า 1 โฟลเดอร์ — กรุณาตั้งค่า Folder ID ที่ถูกต้องใน Script Properties ชื่อ " + POS_BACKUP_FOLDER_ID_PROPERTY);
  }

  var folder = matches.length === 1 ? matches[0] : null;
  if (!folder && createIfMissing) folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  if (folder) props.setProperty(POS_BACKUP_FOLDER_ID_PROPERTY, folder.getId());
  return folder;
}

// ใช้เฉพาะตอนมีโฟลเดอร์ชื่อซ้ำ: คัดลอก Folder ID จาก URL ของโฟลเดอร์ที่ถูกต้อง แล้วรันฟังก์ชันนี้ 1 ครั้ง
function setPosBackupFolderId(folderId) {
  var id = String(folderId || "").trim();
  if (!id) throw new Error("กรุณาระบุ Folder ID");
  var folder = DriveApp.getFolderById(id); // ตรวจสิทธิ์และความมีอยู่ก่อนบันทึก
  PropertiesService.getScriptProperties().setProperty(POS_BACKUP_FOLDER_ID_PROPERTY, folder.getId());
  return "ตั้งค่าโฟลเดอร์สำรองแล้ว: " + folder.getName();
}

// ─────────────────────────────────────────────
//  LIST BACKUPS — รายชื่อไฟล์สำรองใน Drive (ใหม่สุดอยู่บน)
//  ส่งกลับแค่ metadata ไม่ส่งเนื้อไฟล์ เพื่อให้หน้ารายการโหลดเร็วแม้มีไฟล์เยอะ
// ─────────────────────────────────────────────
function handleListBackups() {
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
    arr.sort(function (a, b) { return a.created < b.created ? 1 : (a.created > b.created ? -1 : 0); });
    // จำกัด 50 ไฟล์ กัน payload บวมถ้ามีคนตั้ง BACKUP_RETENTION_DAYS = 0 (ไม่ลบเก่าเลย)
    if (arr.length > 50) arr = arr.slice(0, 50);

    return json("success", "พบไฟล์สำรอง " + arr.length + " ไฟล์", { files: arr });
  } catch (err) {
    return json("error", "อ่านรายการไฟล์สำรองไม่สำเร็จ: " + err.toString());
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
    return json("error", "กู้คืนข้อมูลไม่สำเร็จ: " + err.toString());
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

function billSheetHasVatColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < BILL_HEADERS.length) return false;
  var h = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  for (var i = 0; i < BILL_HEADERS.length; i++) {
    if (String(h[i] || "").trim() !== BILL_HEADERS[i]) return false;
  }
  return true;
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
  if (!isKnownPayment_(pm)) fail("INVALID_PAYMENT", "ช่องทางชำระเงินไม่ถูกต้อง (" + String(pm) + ")");

  var out = { legacy: legacy, subtotal: subtotal, discount: discount, total: total,
              nonVatBase: total, vatableBase: 0, vatAmount: 0, rounding: 0 };
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
        if (!ln || typeof ln !== "object") { bad = true; continue; }
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
          var rateOn = (typeof data.vatRate === "number" && data.vatRate > 0);
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
  var regEntry;
  try {
    regEntry = readBillRegistryStrict_(billId);
  } catch (regErr) {
    // ⚠️ อ่านทะเบียนไม่ได้ = "ไม่รู้" ว่าบิลนี้ถูกยกเลิกไปแล้วหรือยัง → ปฏิเสธไว้ก่อน (แอปลองใหม่เอง)
    Logger.log("readBillRegistry failed: " + regErr);
    return json("error",
      "ตรวจทะเบียนบิลที่ยกเลิกไม่ได้ชั่วคราว จึงยังไม่บันทึกบิลใบนี้ — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "REGISTRY_UNAVAILABLE");
  }
  // ── เจตนา "คืนบิล" ต้องพิสูจน์ได้ว่าเกิด **หลัง** การยกเลิก ────────────
  // restoredAt กับ voidedAt มาจากนาฬิกาเครื่องขายเครื่องเดียวกัน เทียบกันได้ตรง ๆ
  var lastEvent = billEventOf_(regEntry);
  if (lastEvent && lastEvent.type === "voided") {
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
    if (!markBillRestored_(billId, restoredAt, regEntry)) {
      return json("error",
        "บันทึกสถานะกู้คืนบิลไม่สำเร็จ จึงยังไม่เขียนแถว — ระบบจะลองใหม่ให้เอง",
        { billId: billId }, "RESTORE_REGISTRY_FAILED");
    }
  }

  var payText = payLabel(data.paymentMethod);

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
    return json("success", "อัปเดตข้อมูลบิลแล้ว", { billId: billId, sheet: monthYear, updated: true, version: incoming });
  } else {
    // แถวใหม่: ใส่รุ่นไปใน appendRow ครั้งเดียวกัน (ช่องระหว่างทางของแถวใหม่ว่างอยู่แล้ว ไม่ทับอะไร)
    var full = row.slice();
    if (incoming.present) {
      revCol = ensureBillRevColumn_(sheet);
      while (full.length < revCol - 1) full.push("");
      full[revCol - 1] = verCell;
    }
    sheet.appendRow(full);
    var lr = sheet.getLastRow();
    sheet.getRange(lr, 6, 1, moneyCols).setNumberFormat("#,##0.00");
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
    if (billSheetIsBlank_(sheet))
      return json("success", "แท็บเดือนนี้ยังว่าง", { sheet: monthYear, exists: true, bills: [], truncated: false, rowsTotal: 0 });
    return json("error",
      "โครงสร้างคอลัมน์ของแท็บ " + monthYear + " ไม่ตรงกับที่ระบบรู้จัก จึงอ่านรายการไม่ได้",
      null, "SCHEMA_MISMATCH");
  }

  var vat = (schema === "vat");
  var width = vat ? BILL_HEADERS.length : BILL_LEGACY_HEADERS.length;
  var revCol = billRevColumn_(sheet);
  var lastRow = sheet.getLastRow();
  var bills = [], truncated = false, rowsTotal = 0;
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    var revs = revCol > 0 ? sheet.getRange(2, revCol, lastRow - 1, 1).getDisplayValues() : null;
    // ⚠️ ช่อง "วันที่-เวลา" ถูก Sheets แปลงเป็นค่าวันที่ตั้งแต่ตอนเขียน — อ่านด้วย str() ตรง ๆ จะได้
    // "Thu Sep 10 2026 21:30:00 GMT+0700" แล้วหน้าตรวจความตรงกันฟ้องว่า "วันเวลาไม่ตรง" ทุกบิล
    var tz = spreadsheetTz_(ss);
    var str = function (v) { return cellText_(v, tz); };
    var num = function (v) { var n = Number(v); return (v === "" || v === null || !isFinite(n)) ? null : n; };
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
        subtotal: num(r[5]), discount: num(r[6])
      };
      if (vat) {
        b.nonVatBase = num(r[7]); b.vatableBase = num(r[8]); b.vatAmount = num(r[9]); b.rounding = num(r[10]);
        b.total = num(r[11]); b.staff = str(r[12]);
      } else {
        b.total = num(r[7]); b.staff = str(r[8]);
      }
      if (revs) b.version = str(revs[i][0]);
      bills.push(b);
    }
  }
  return json("success", "อ่านรายการบิลแล้ว",
    { sheet: monthYear, exists: true, schema: schema, bills: bills, truncated: truncated, rowsTotal: rowsTotal, max: LIST_BILLS_MAX });
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
  if (!raw) return;   // ไม่มีทะเบียนรุ่นเก่า = ไม่มีอะไรต้องย้าย (ไม่ต้องเขียนอะไรเลย)
  {
    var legacy = JSON.parse(raw);
    if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) throw new Error("ทะเบียนบิลที่ยกเลิก (รุ่นเก่า) อ่านไม่ได้");
    var ids = Object.keys(legacy);
    for (var i = 0; i < ids.length; i++) {
      var n = Number(legacy[ids[i]]);
      if (!isFinite(n) || n === 0 || !BILL_ID_RE.test(ids[i])) continue;
      if (props.getProperty(VOID_REG_PREFIX + ids[i]) !== null) continue;   // มีข้อมูลรูปแบบใหม่อยู่แล้ว
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
  if (raw === null || raw === undefined || raw === "") return { v: 0, r: 0 };
  var o = JSON.parse(raw);
  if (!o || typeof o !== "object") throw new Error("ทะเบียนของบิล " + billId + " อ่านไม่ได้");
  var v = Number(o.v), r = Number(o.r);
  return { v: (isFinite(v) && v > 0) ? v : 0, r: (isFinite(r) && r > 0) ? r : 0 };
}

// สถานะล่าสุด = เหตุการณ์ที่ใหม่กว่า (เวลาเท่ากันเกิดไม่ได้ เพราะทั้งสองทางต้อง "ใหม่กว่าอีกฝั่งอย่างเคร่งครัด")
function billEventOf_(e) {
  if (e.v > e.r) return { type: "voided", at: e.v };
  if (e.r > e.v) return { type: "restored", at: e.r };
  return null;
}

// เขียนแล้วอ่านกลับยืนยัน — true เมื่อยืนยันได้เท่านั้น
function writeBillRegistry_(billId, e) {
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
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(VOID_REG_PREFIX) !== 0) return;
    var t = 0;
    try {
      var o = JSON.parse(all[k]);
      t = Number(o.w) > 0 ? Number(o.w) : Math.max(Number(o.v) || 0, Number(o.r) || 0);
    } catch (e) { t = 0; }
    if (t > 0 && now - t > VOIDED_RETENTION_MS) props.deleteProperty(k);
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
function exportVoidRegistryForRollback() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), list = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(VOID_REG_PREFIX) !== 0) return;
    try {
      var o = JSON.parse(all[k]); var e = { v: Number(o.v) || 0, r: Number(o.r) || 0 };
      var ev = billEventOf_(e); if (!ev) return;
      list.push({ id: k.slice(VOID_REG_PREFIX.length), n: ev.type === "voided" ? ev.at : -ev.at, at: ev.at });
    } catch (e2) {}
  });
  list.sort(function (a, b) { return b.at - a.at; });
  var map = {}, kept = 0;
  for (var i = 0; i < list.length; i++) {
    map[list[i].id] = list[i].n;
    if (JSON.stringify(map).length > 8000) { delete map[list[i].id]; break; }
    kept++;
  }
  props.setProperty(VOIDED_BILLS_PROPERTY, JSON.stringify(map));
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
  sheet.getRange(1, col).setValue(BILL_REV_HEADER)
    .setBackground("#1e293b").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  try { sheet.hideColumns(col); } catch (e) {}
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
  if (!isValidMonthKey_(monthYear))
    return json("error", "เดือนของบิลไม่ถูกต้อง (" + monthYear + ") — ตรวจสอบวันที่ของบิลใบนี้");
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
  if (!sheet) {
    // ไม่มีแท็บเดือนนี้ = ไม่เคยมีแถวให้ลบตั้งแต่แรก ปลายทางถือว่า "ลบแล้ว"
    return json("error", "ไม่พบแผ่นงานของเดือนนี้", null, "NOT_FOUND");
  }

  // ── โครงตารางต้องเป็นแบบที่รู้จัก ก่อนลบอะไรทั้งสิ้น (ฝั่งเขียนตรวจอยู่แล้ว ฝั่งลบต้องตรวจเหมือนกัน) ──
  // เดิมค้นเลขที่บิลใน "คอลัมน์แรก" ของแท็บอะไรก็ได้ แล้วลบทั้งแถวทันที
  // แท็บที่หัวตารางถูกสลับ/ลบหัวทิ้ง → คอลัมน์แรกอาจไม่ใช่เลขที่บิล = ลบแถวผิดได้
  var schema = billSheetSchema_(sheet);
  if (!schema) {
    if (billSheetIsBlank_(sheet)) return json("error", "แท็บเดือนนี้ยังว่าง", null, "NOT_FOUND");
    return json("error",
      "โครงสร้างคอลัมน์ของแท็บ " + monthYear + " ไม่ตรงกับที่ระบบรู้จัก จึงยังไม่ลบแถวใด — ตรวจหัวตารางแถวแรกก่อน " +
      "(ทะเบียนยกเลิกบันทึกแล้ว บิลนี้จะไม่ถูกเขียนกลับขึ้นมา)", { billId: billId }, "SCHEMA_MISMATCH");
  }
  var rows = findBillRows_(sheet, billId);
  if (rows.length > 1) {
    // ไม่เดาว่าแถวไหนคือบิลจริง — ลบผิดแถวย้อนกลับไม่ได้
    return json("error",
      "พบบิลเลขที่ " + billId + " ซ้ำ " + rows.length + " แถว (แถว " + rows.join(", ") + ") จึงยังไม่ลบแถวใด — ให้ตรวจแถวซ้ำในชีตก่อน",
      { billId: billId, rows: rows }, "DUPLICATE_BILL_ID");
  }
  if (rows.length === 1) {
    sheet.deleteRow(rows[0]);
    return json("success", "ลบบิลออกจาก Sheets แล้ว", { billId: billId });
  }
  // ไม่มีแถวนี้แล้ว = ลบไปก่อนหน้าแล้ว ฝั่งแอปต้องถือว่าสำเร็จ ไม่ใช่วนลองใหม่ตลอดกาล
  return json("error", "ไม่พบบิลเลขที่ " + billId + " ใน Sheets", null, "NOT_FOUND");
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
function readSummaryStamp_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return 0;
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

function handleDailySummary(data, ss) {
  var dateKey   = data.dateKey;          // "2026-06-06"
  if (!isValidDateKey_(dateKey))
    return json("error", "วันที่ไม่ถูกต้อง (" + dateKey + ") — ไม่สร้างแท็บสรุปเพื่อกันข้อมูลขยะในรายงาน");
  try {
    normalizeSummaryPayload_(data);
  } catch (err) {
    return json("error", "ข้อมูลสรุปรายวันไม่ถูกต้อง: " + err.toString());
  }
  var sheetName = "สรุป-" + dateKey;
  // กู้งานสลับแท็บที่ค้างจากรอบก่อน "ก่อน" ตรวจรุ่น — ไม่งั้นช่วงที่แท็บจริงหายชื่อไป
  // การตรวจอ่านรุ่นได้ 0 แล้วปล่อยข้อมูลเก่ากว่าเขียนทับของใหม่
  recoverSummaryPublish_(ss);
  var staleDay = checkSummaryStale_(ss, sheetName, data);
  if (staleDay) return staleDay;
  replaceSummarySheet_(ss, sheetName, data, "รายวัน: " + dateKey, "day", dateKey);
  pruneOldDailySheets(ss, DAILY_SHEET_RETENTION_DAYS);
  pruneOrphanSwapSheets_(ss);

  return json("success", "บันทึกสรุปรายวันแล้ว", { sheet: sheetName });
}

// ─────────────────────────────────────────────
//  3. MONTHLY SUMMARY — สรุปรายเดือน
// ─────────────────────────────────────────────
function handleMonthlySummary(data, ss) {
  var monthKey  = data.monthKey;         // "06-2026"
  if (!isValidMonthKey_(monthKey))
    return json("error", "เดือนไม่ถูกต้อง (" + monthKey + ") — ไม่สร้างแท็บสรุปเพื่อกันข้อมูลขยะในรายงาน");
  try {
    normalizeSummaryPayload_(data);
  } catch (err) {
    return json("error", "ข้อมูลสรุปรายเดือนไม่ถูกต้อง: " + err.toString());
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
function readSummaryJournal_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SUMMARY_JOURNAL_PROPERTY);
  if (!raw) return null;
  var j = JSON.parse(raw);   // พัง = throw → ผู้เรียกหยุด (ไม่เดาว่าไม่มีงานค้าง)
  return (j && typeof j === "object") ? j : null;
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
  if (!snap.sheetExisted) { try { ss.deleteSheet(master); } catch (e) {} return; }
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
  VK.forEach(function (k) { data[k] = money(data[k], k, false); });
  if (vatPresent === VK.length &&
      sat(data.nonVatBase) + sat(data.vatableBase) + sat(data.vatAmount) + sat(data.rounding) !== sat(data.totalRevenue)) {
    throw new Error("ไม่คิดVAT + คิดVAT + VAT + ปัดเศษ ไม่เท่ากับรายได้รวม (" + data.totalRevenue + ")");
  }
  data.shiftCount = count(data.shiftCount, "shiftCount", false);
  if (data.vatRate === undefined || data.vatRate === null) data.vatRate = 0;
  if (typeof data.vatRate !== "number" || !isFinite(data.vatRate) || data.vatRate < 0 || data.vatRate > 100) throw new Error("vatRate เกินช่วงที่ยอมรับได้");
  data.cashVariance = readFiniteNumber_(data.cashVariance, "cashVariance", false);
  data.excludedInvalid = count(data.excludedInvalid, "excludedInvalid", false);

  if (!Array.isArray(data.shiftCash)) data.shiftCash = [];
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
    out.push({
      name: safeCell(st.name || "ไม่ระบุ"),
      role: safeCell(st.role || "-"),
      count: count, salesSum: sales, commission: comm
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
    out.push({ name: safeCell(svc.name || "ไม่ระบุชื่อบริการ"), count: count, revenue: rev });
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
    .setValue("Erotica Barber & Massage POS  |  สร้างเมื่อ: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"))
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
      sumOver     += Number(sh.overspend) || 0;
      r++;
    });

    var tBg  = sumDiff < 0 ? LRED : (sumDiff > 0 ? LGREEN : "#f1f5f9");
    var tClr = sumDiff < 0 ? "#9f1239" : (sumDiff > 0 ? "#166534" : "#475569");
    sheet.getRange(r,1,1,2).merge()
      .setValue("รวม · เงินตั้งต้น " + numFmt(sumStart) + " · ขายสด " + numFmt(sumSales) +
        (Math.round(sumAdj * 100) !== 0 ? " · คืน/เก็บส่วนต่าง " + (sumAdj > 0 ? "+" : "-") + numFmt(Math.abs(sumAdj)) : "") +
        " · ค่าใช้จ่ายจากลิ้นชัก " + numFmt(sumExp) +
        (Math.round(sumOther * 100) !== 0 ? " · จ่ายทางอื่น " + numFmt(sumOther) + " (ไม่หักลิ้นชัก)" : "") +
        (Math.round(sumOver * 100) !== 0 ? " · ค่าใช้จ่ายเกินลิ้นชัก " + numFmt(sumOver) + " (นับเป็นเงินขาด)" : ""))
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
  var comHeaders = ["ชื่อพนักงาน","ตำแหน่ง","จำนวนงาน","ยอดขาย (฿)","ค่าคอม (฿)"];
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
    sheet.getRange(r,3).setValue(stCount).setBackground(bg).setHorizontalAlignment("center");
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
function updateMasterSummarySheet(ss, data, periodType, periodKey) {
  var masterName = MASTER_SHEET_NAME;
  var master = ss.getSheetByName(masterName);
  if (!master) {
    master = ss.insertSheet(masterName, 0);
    var mh = [MASTER_TYPE_HEADER, MASTER_PERIOD_HEADER, MASTER_BILL_HEADER]
      .concat(MASTER_VAT_HEADERS)
      .concat([MASTER_REV_HEADER,"ค่าใช้จ่าย (฿)","กำไรสุทธิ (฿)", MASTER_VAR_HEADER, MASTER_TS_HEADER]);
    styleHeaderRow(master, 1, mh, "#1e293b", "#e2e8f0");
    master.setFrozenRows(1);
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

function styleHeaderRow(sheet, row, headers, bg, fg) {
  headers.forEach(function(h, i) {
    sheet.getRange(row, i+1)
      .setValue(h)
      .setBackground(bg || "#1e293b")
      .setFontColor(fg || "white")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  });
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
  if (looksCoercible_(s)) return "'" + s;
  return s;
}

// ข้อความนี้ Sheets จะแปลงเป็นตัวเลข/วันที่/เวลา/ค่าความจริงไหม (ตั้งใจกว้างไว้ก่อน — เติม ' เกินไม่เสียอะไร)
function looksCoercible_(s) {
  var t = String(s == null ? "" : s).trim();
  if (!t) return false;
  if (/^(true|false)$/i.test(t)) return true;                                                    // ค่าความจริง
  if (!/[0-9]/.test(t)) return false;                                                            // ไม่มีตัวเลขเลย = ข้อความแน่นอน
  if (/^\(?[$฿€£]?\s*[0-9][0-9.,\s]*%?\)?$/.test(t)) return true;                              // ตัวเลข/เงิน/เปอร์เซ็นต์
  if (/^[0-9]+(\.[0-9]+)?e[+-]?[0-9]+$/i.test(t)) return true;                                    // 1e5
  if (/^[0-9]{1,4}\s*[\/.\-]\s*[0-9]{1,2}(\s*[\/.\-]\s*[0-9]{1,4})?([ T]+[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?)?$/.test(t)) return true;   // วันที่
  if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?(\s*[ap]\.?m\.?)?$/i.test(t)) return true;                // เวลา
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
function pruneOldDailySheets(ss, keepDays) {
  if (!keepDays || keepDays <= 0) return;
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - keepDays);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var m = name.match(/^สรุป-(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d < cutoff) {
      try { ss.deleteSheet(sheets[i]); } catch (e) {}
    }
  }
}
