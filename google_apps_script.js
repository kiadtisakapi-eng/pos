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
      "list_bills":       function () { return handleListBills(data, ss); }
    };
    if (!Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, action)) {
      return json("error",
        "คำสั่งที่ไม่รู้จัก (" + action + ") — ตรวจว่าแอปกับ Apps Script เป็นรุ่นเดียวกัน",
        null, "INVALID_ACTION");
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
//  BACKUP — สำรองข้อมูลเข้าระบบ Google Drive
// ─────────────────────────────────────────────
function handleBackup(data, ss) {
  try {
    var folderName = BACKUP_FOLDER_NAME;
    var folder = getBackupFolder_(true);

    var timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    var fileName = BACKUP_FILE_PREFIX + timeStamp + ".json";
    var fileContent = JSON.stringify(data.backupData, null, 2);
    var file = folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);

    // ลบไฟล์สำรองที่เก่ากว่า BACKUP_RETENTION_DAYS วัน (กันไฟล์สะสมไม่จำกัดใน Drive)
    if (BACKUP_RETENTION_DAYS > 0) {
      var cutoffMs = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      var files = folder.getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var f = files.next();
        if (f.getName().indexOf(BACKUP_FILE_PREFIX) === 0 && f.getDateCreated().getTime() < cutoffMs) {
          try { f.setTrashed(true); } catch (e2) {}
        }
      }
    }

    return json("success", "สำรองข้อมูลเรียบร้อยแล้วที่ Google Drive", {
      fileId: file.getId(),
      fileName: fileName,
      folderName: folderName
    });
  } catch (err) {
    return json("error", "การสำรองข้อมูลล้มเหลว: " + err.toString());
  }
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
      if (f.getId() === fileId) { file = f; break; }
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

function handleTransaction(data, ss) {
  var billId = readBillId_(data.id);
  if (!BILL_ID_RE.test(billId)) {
    return json("error", "เลขที่บิลไม่ถูกต้อง", null, "INVALID_BILL_ID");
  }
  var subtotal, discount, total;
  try {
    subtotal = readFiniteNumber_(data.subtotal != null ? data.subtotal : data.total, "subtotal", true);
    discount = readFiniteNumber_(data.discount, "discount", false);
    total = readFiniteNumber_(data.total, "total", true);
  } catch (err) {
    return json("error", "ยอดเงินในบิลไม่ถูกต้อง: " + err.toString());
  }
  if (subtotal < 0 || discount < 0 || discount > subtotal || total < 0) {
    return json("error", "ยอดเงินในบิลอยู่นอกช่วงที่ยอมรับได้", null, "INVALID_AMOUNT");
  }

  // ── ช่องทางชำระเงินต้องเป็นค่าที่ระบบรองรับ ────────────────────────────
  if (!isKnownPayment_(data.paymentMethod)) {
    return json("error",
      "ช่องทางชำระเงินไม่ถูกต้อง (" + String(data.paymentMethod) + ") — ไม่บันทึกเพื่อกันยอดเงินสดในชีตไม่ตรงกับลิ้นชัก",
      null, "INVALID_PAYMENT");
  }

  // ── ฟิลด์ VAT: แยก "ไม่ได้ส่งมา" (บิลเก่า) ออกจาก "ส่งมาแต่ใช้ไม่ได้" ────
  // เดิมใช้ Number(v) แล้วถ้าไม่ใช่ตัวเลขก็กลายเป็น 0 เงียบ ๆ
  // บิลที่ vatAmount เสียจึงถูกบันทึกเป็น VAT 0 บาท = ยอดที่ยื่นสรรพากรขาดโดยไม่มีใครรู้
  var vatFields = ["nonVatBase", "vatableBase", "vatAmount", "rounding"];
  for (var vi = 0; vi < vatFields.length; vi++) {
    var vk = vatFields[vi], vv = data[vk];
    if (vv === undefined || vv === null) continue;            // บิลรุ่นก่อน VAT — ปกติ
    var vn = Number(vv);
    if (!isFinite(vn) || vn < 0) {
      return json("error", "ช่อง " + vk + " ในบิลใช้ไม่ได้ (" + String(vv) + ")", null, "INVALID_AMOUNT");
    }
  }

  // ── สมการยอดต้องลงตัว คิดเป็นสตางค์จำนวนเต็ม ───────────────────────────
  //   ราคารวม − ส่วนลด          = ไม่คิด VAT + คิด VAT
  //   ไม่คิด VAT + คิด VAT + VAT + ปัดเศษ = ยอดสุทธิ
  // ตรวจเฉพาะบิลที่ "ส่งฟิลด์ VAT มาครบ" — บิลเก่าที่ไม่มีฟิลด์เหล่านี้คำนวณย้อนให้ด้านล่างอยู่แล้ว
  var sat_ = function (v) { return Math.round((Number(v) || 0) * 100); };

  // ⚠️ "ส่งมาบางฟิลด์" ไม่ใช่บิลเก่า — บิลเก่าคือบิลที่ไม่มีฟิลด์ VAT เลยสักตัว
  // เดิมตรวจสมการเฉพาะตอนมีทั้ง nonVatBase และ vatableBase ครบ
  // คนที่ส่ง nonVatBase มาอย่างเดียวจึงข้ามการตรวจไปได้ทั้งที่ยอดผิดชัด ๆ
  var vatPresent = 0;
  for (var vp = 0; vp < vatFields.length; vp++) if (data[vatFields[vp]] != null) vatPresent++;
  if (vatPresent > 0 && vatPresent < vatFields.length) {
    return json("error",
      "บิลส่งฟิลด์ VAT มาไม่ครบ (" + vatPresent + " จาก " + vatFields.length + ") — " +
      "บิลรุ่นก่อน VAT ต้องไม่มีฟิลด์เหล่านี้เลย ส่วนบิลที่คิด VAT ต้องส่งครบทุกช่องเพื่อให้ตรวจยอดได้",
      null, "INVALID_AMOUNT");
  }

  if (data.nonVatBase != null && data.vatableBase != null) {
    var lhs = sat_(subtotal) - sat_(discount);
    var rhs = sat_(data.nonVatBase) + sat_(data.vatableBase);
    if (lhs !== rhs) {
      return json("error",
        "ยอดในบิลบวกไม่ลงตัว: ราคารวม−ส่วนลด (" + (lhs / 100) + ") ไม่เท่ากับ ไม่คิดVAT+คิดVAT (" + (rhs / 100) + ")",
        null, "INVALID_AMOUNT");
    }
    var sumAll = rhs + sat_(data.vatAmount) + sat_(data.rounding);
    if (sumAll !== sat_(total)) {
      return json("error",
        "ยอดสุทธิไม่ตรงกับผลรวม: ได้ " + (sumAll / 100) + " แต่บิลบอก " + total,
        null, "INVALID_AMOUNT");
    }
  }

  var txDate = (data.date) ? new Date(data.date) : new Date();
  if (isNaN(txDate.getTime())) {
    txDate = new Date();
  }
  // ใช้ monthKey ที่ client คำนวณจากเวลาท้องถิ่นหน้าร้านเป็นหลัก — กันบิลช่วงเที่ยงคืน/ปลายเดือน
  // ลงแท็บผิดเดือนเมื่อ timezone ของโปรเจกต์ Apps Script ไม่ตรงกับหน้าร้าน (fallback: timezone ฝั่งสคริปต์)
  var monthYear = /^(0[1-9]|1[0-2])-\d{4}$/.test(data.monthKey || "") ? data.monthKey : fmt(txDate, "MM-yyyy");
  // กันบิลที่วันที่หายไปแล้วกลายเป็นปี 1970 — จะได้แท็บ "01-1970" ค้างอยู่ในไฟล์ถาวร
  if (!isValidMonthKey_(monthYear))
    return json("error", "เดือนของบิลไม่ถูกต้อง (" + monthYear + ") — ตรวจสอบวันที่ของบิลใบนี้");
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

  // ⚠️ ด่านนี้ต้องอยู่ "ก่อนเขียนแถว" แต่ต้องอยู่ "หลัง" ด่านตรวจรูปแบบทุกด่าน
  // ไม่งั้นบิลที่ผิดรูปแบบอยู่แล้ว (หัวตารางเพี้ยน/ยอดไม่ลงตัว/ช่องทางจ่ายไม่รู้จัก)
  // จะได้ error เรื่องทะเบียนแทนเหตุผลจริง แล้วเจ้าของไล่ปัญหาผิดทาง
  // ── บิลที่ถูกยกเลิกไปแล้ว ห้ามกลับขึ้นชีตอีก ────────────────────────
  // คำขอที่ client หมดเวลารอไปแล้วยังเดินทางมาถึงได้ ปลายทางจึงต้องเป็นคนตัดสินใจสุดท้าย
  // ฝั่งแอปต้องถือว่านี่คือสถานะสุดท้าย ไม่ใช่ข้อผิดพลาดชั่วคราวที่ต้องลองใหม่
  var voidedRegistry;
  try {
    voidedRegistry = readVoidedBillsStrict_();
  } catch (regErr) {
    // ⚠️ อ่านทะเบียนไม่ได้ = "ไม่รู้" ว่าบิลนี้ถูกยกเลิกไปแล้วหรือยัง
    // เดิมกลืน error แล้วถือว่าไม่มีทะเบียน → บิลที่ยกเลิกแล้วกลับขึ้นชีตเงียบ ๆ
    // ปฏิเสธไว้ก่อนปลอดภัยกว่ามาก: บิลยังอยู่ในเครื่องครบ แอปวนส่งใหม่ให้เอง
    // และไอคอน "ค้างซิงก์" ฟ้องให้เจ้าของเห็น ไม่ใช่ผิดเงียบแบบเดิม
    Logger.log("readVoidedBills failed: " + regErr);
    return json("error",
      "ตรวจทะเบียนบิลที่ยกเลิกไม่ได้ชั่วคราว จึงยังไม่บันทึกบิลใบนี้ — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "REGISTRY_UNAVAILABLE");
  }
  // ── เจตนา "คืนบิล" ต้องพิสูจน์ได้ว่าเกิด **หลัง** การยกเลิก ────────────
  // ⚠️ เดิมใช้ธง allowVoidedRestore เปล่า ๆ ซึ่งติดกับบิลถาวรฝั่งแอป
  // คำขอเก่าที่ค้างในเน็ตตั้งแต่ก่อน void ก็พกธงนี้มาด้วย ปลายทางจึงแยกไม่ออก
  // restoredAt กับ voidedAt มาจากนาฬิกาเครื่องขายเครื่องเดียวกัน เทียบกันได้ตรง ๆ
  var lastEvent = billEventAt_(voidedRegistry, billId);
  var intentionalRestore = false;
  // เหตุการณ์ล่าสุดเป็น "กู้คืน" = บิลใบนี้มีชีวิตอยู่บนชีต แก้ไข/ส่งซ้ำได้ตามปกติ
  if (lastEvent && lastEvent.type === "voided") {
    var voidedAt = lastEvent.at;
    var restoredAt = Number(data.restoredAt);
    intentionalRestore = (data.allowVoidedRestore === true) && isFinite(restoredAt) &&
                         restoredAt > voidedAt;
    if (!intentionalRestore) {
      // ⚠️ ส่ง voidedAt กลับไปด้วย — ไม่ใช่การเปิดช่อง แต่เป็นทางออกจากทางตัน
      // ถ้านาฬิกาเครื่องขายถูกตั้งย้อนหลังระหว่าง "ยกเลิก" กับ "กู้ข้อมูล"
      // restoredAt จะเก่ากว่าเสมอ แล้วบิลใบนั้นจะคืนขึ้นชีตไม่ได้อีกเลยจนกว่าทะเบียนจะหมดอายุ 90 วัน
      // คำขอที่ค้างมาจากอดีต "ปรับตัวไม่ได้" อยู่แล้ว การป้องกันจึงยังอยู่ครบ
      // ส่วนแอปตัวจริงที่ได้รับคำตอบนี้ คือฝ่ายที่มีเจตนาคืนบิลจริง ๆ
      return json("error",
        "บิลเลขที่ " + billId + " ถูกยกเลิกไปแล้ว จึงไม่บันทึกซ้ำ (คำขอนี้น่าจะค้างมาจากก่อนการยกเลิก)",
        { billId: billId, voidedAt: Number(voidedAt) || 0 }, "ALREADY_VOIDED");
    }
    // ⚠️ บันทึกสถานะกู้คืน **ก่อน** เขียนแถว ด้วยเหตุผลเดียวกับที่ลงทะเบียนยกเลิกก่อนลบแถว
    // ถ้าเขียนแถวก่อนแล้วบันทึกทะเบียนไม่ได้ จะได้สภาพ "บิลอยู่บนชีตแต่ทะเบียนบอกว่าถูกยกเลิก"
    // ซึ่งเปิดทางให้คำสั่งยกเลิกเก่ากลับมาลบบิลนั้นได้อีก
    // ลำดับนี้ปลอดภัย เพราะถ้าเขียนแถวพลาดทีหลัง แอปจะส่งซ้ำแล้วรอบหน้าผ่านเป็น upsert ปกติ
    if (!markBillRestored_(billId, Number(data.restoredAt))) {
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
  var money = function (v) { var n = Number(v); return (isFinite(n) && n >= 0) ? n : 0; };
  var vatableBase = money(data.vatableBase);
  var vatAmount   = money(data.vatAmount);
  var rounding    = money(data.rounding);
  var nonVatBase  = (data.nonVatBase != null)
    ? money(data.nonVatBase)
    : Math.max(0, Math.round((total - vatableBase - vatAmount - rounding) * 100) / 100);

  var billIdCell = safeCell(billId);
  var timeCell = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.dateTimeStr || "")
    ? data.dateTimeStr : fmt(txDate, "yyyy-MM-dd HH:mm:ss");
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

  // ค้นหาบิลเก่าที่มี ID เดียวกันเพื่อแก้ไข (Upsert)
  var lastRow = sheet.getLastRow();
  var foundRow = -1;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      // ใช้กฎเทียบเดียวกับตอน void — ถ้าสองทางเทียบไม่เหมือนกัน จะมีบิลที่ "แก้ได้แต่ลบไม่ได้"
      if (readBillId_(ids[i][0]) === billId) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (foundRow > -1) {
    // อัปเดตแถวเดิม
    sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(foundRow, 6, 1, moneyCols).setNumberFormat("#,##0.00");
    // บิลกลับขึ้นชีตแล้วโดยตั้งใจ → ถอนออกจากทะเบียน ไม่งั้นการแก้บิลใบนี้ครั้งถัดไป
    // (ซึ่งไม่มี restoredAt ติดมาแล้ว) จะโดนปฏิเสธ ALREADY_VOIDED ค้างไปตลอด
    return json("success", "อัปเดตข้อมูลบิลแล้ว", { billId: billId, sheet: monthYear, updated: true });
  } else {
    // เพิ่มแถวใหม่
    sheet.appendRow(row);
    var lr = sheet.getLastRow();
    sheet.getRange(lr, 6, 1, moneyCols).setNumberFormat("#,##0.00");
    return json("success", "บันทึกบิลแล้ว", { billId: billId, sheet: monthYear, updated: false });
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

function handleListBills(data, ss) {
  var monthYear = String(data.monthKey == null ? "" : data.monthKey);
  if (!isValidMonthKey_(monthYear))
    return json("error", "เดือนไม่ถูกต้อง (" + monthYear + ")", null, "INVALID_MONTH");

  var sheet = ss.getSheetByName(monthYear);
  if (!sheet)
    return json("success", "ยังไม่มีแท็บของเดือนนี้", { sheet: monthYear, exists: false, bills: [], truncated: false });

  var schema = billSheetSchema_(sheet);
  if (!schema) {
    if (billSheetIsBlank_(sheet))
      return json("success", "แท็บเดือนนี้ยังว่าง", { sheet: monthYear, exists: true, bills: [], truncated: false });
    return json("error",
      "โครงสร้างคอลัมน์ของแท็บ " + monthYear + " ไม่ตรงกับที่ระบบรู้จัก จึงอ่านรายการไม่ได้",
      null, "SCHEMA_MISMATCH");
  }

  var width    = (schema === "vat") ? BILL_HEADERS.length : BILL_LEGACY_HEADERS.length;
  var totalCol = (schema === "vat") ? 12 : 8;    // ตำแหน่ง "ยอดสุทธิ (฿)" ของแต่ละโครงสร้าง
  var lastRow  = sheet.getLastRow();
  var bills = [], truncated = false;
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (var i = 0; i < values.length; i++) {
      var id = readBillId_(values[i][0]);
      if (!id) continue;                       // แถวว่าง/แถวคั่น ไม่ใช่บิล
      if (bills.length >= LIST_BILLS_MAX) { truncated = true; break; }
      bills.push({
        id: id,
        // ⚠️ แถวบนชีตแก้ด้วยมือได้ เลขที่บิลจึงไม่การันตีรูปแบบเหมือน ID ที่ระบบสร้าง
        // บอกฝั่งแอปไปตรง ๆ ว่าใบไหนสั่งงานต่อไม่ได้ แทนที่จะซ่อนแถวนั้นทิ้ง
        // (ซ่อน = เจ้าของไม่มีวันรู้ว่ามีแถวแปลกอยู่บนชีต)
        idOk: BILL_ID_RE.test(id),
        when: String(values[i][1] == null ? "" : values[i][1]),
        customer: String(values[i][2] == null ? "" : values[i][2]),
        total: Number(values[i][totalCol - 1]) || 0
      });
    }
  }
  return json("success", "อ่านรายการบิลแล้ว",
    { sheet: monthYear, exists: true, bills: bills, truncated: truncated });
}

// ─────────────────────────────────────────────
//  VOID TRANSACTION — ลบบิลรายการ
// ─────────────────────────────────────────────
// เก็บใน Script Properties — อยู่ข้ามการรันและไม่ต้องเพิ่มแท็บใหม่ในไฟล์ของร้าน
// เก็บเป็นแผนที่ billId → เวลาที่ยกเลิก และตัดตัวที่เก่ากว่า 90 วันทิ้งเพื่อไม่ให้โตไม่จำกัด
// 90 วันยาวกว่าอายุคำขอที่ค้างในเน็ตมหาศาล แต่สั้นพอให้ขนาดข้อมูลคงที่
var VOIDED_BILLS_PROPERTY = "POS_VOIDED_BILLS";
var VOIDED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
// ⚠️ เพดานจริงของ Apps Script คือ **9 KB ต่อค่า property หนึ่งค่า** (500 KB เป็นของทั้ง store)
// เดิมยัดทุก ID ลง JSON ค่าเดียวโดยจำกัดแค่ "อายุ 90 วัน" ไม่จำกัดจำนวน
// พอชนเพดาน setProperty จะ throw แล้วโค้ดเดิมกลืน error ทิ้ง → ตอบว่ายกเลิกสำเร็จ
// ทั้งที่การกันคำขอย้อนหลังหายไปแล้ว บิลที่ยกเลิกจึงกลับขึ้นชีตได้แบบไม่มีใครรู้
// ตอนนี้ตัดของเก่าออกให้อยู่ในงบ "ก่อน" เขียนเสมอ แล้วอ่านกลับมายืนยันว่าเขียนติดจริง
var VOIDED_BUDGET_BYTES = 8000;

// อ่านแบบไม่กลืน error — ผู้เรียกต้องตัดสินใจเองว่าจะทำอย่างไรเมื่ออ่านไม่ได้
function readVoidedBillsStrict_() {
  var raw = PropertiesService.getScriptProperties().getProperty(VOIDED_BILLS_PROPERTY);
  if (!raw) return {};
  var obj = JSON.parse(raw);
  return (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
}

function readVoidedBills_() {
  try { return readVoidedBillsStrict_(); } catch (err) { return {}; }
}

// ตัดทะเบียนให้อยู่ในงบ: หมดอายุก่อน แล้วค่อยตัด "ตัวเก่าสุด" ทีละตัวจนขนาดพอดี
// ⚠️ เทียบอายุกับรายการใหม่สุดในทะเบียน ไม่ใช่นาฬิกาของ Google
// เพราะค่าที่เก็บคือเวลาจากนาฬิกาเครื่องขาย (ต้องเทียบกับ restoredAt ที่มาจากนาฬิกาเดียวกัน)
// ถ้าเอาไปเทียบกับนาฬิกาคนละเรือน วันที่เพี้ยนนิดเดียวก็ล้างทะเบียนทิ้งทั้งชุดได้
// ค่าที่เก็บเป็นเลขมีเครื่องหมาย: **บวก = ยกเลิกเมื่อ v** · **ลบ = กู้คืนเมื่อ |v|**
// ⚠️ เดิมพอกู้บิลสำเร็จแล้ว "ลบทะเบียนทิ้ง" ซึ่งแปลว่าไม่เหลือหลักฐานว่ามีการกู้เกิดขึ้นตอนไหน
// คำสั่งยกเลิกใบเดิม (voidedAt เก่า) ที่ถูกส่งซ้ำ/มาถึงทีหลัง จึงลบบิลที่เพิ่งกู้คืนได้
// การเก็บเวลาของการกู้ไว้ด้วย ทำให้เทียบลำดับได้ทั้งสองทิศทาง โดยไม่ต้องใช้ธงถาวรที่ทำให้บิลค้าง
function billEventAt_(map, billId) {
  var raw = Number(map[billId]);
  if (!isFinite(raw) || raw === 0) return null;
  return raw > 0 ? { type: "voided", at: raw } : { type: "restored", at: -raw };
}

function trimVoidedBills_(map) {
  var keys = Object.keys(map), i, newest = 0, v;
  for (i = 0; i < keys.length; i++) { v = Math.abs(Number(map[keys[i]]) || 0); if (v > newest) newest = v; }
  for (i = 0; i < keys.length; i++) {
    if (newest - Math.abs(Number(map[keys[i]]) || 0) > VOIDED_RETENTION_MS) delete map[keys[i]];
  }
  keys = Object.keys(map);
  keys.sort(function (a, b) { return Math.abs(Number(map[a]) || 0) - Math.abs(Number(map[b]) || 0); });   // เก่า → ใหม่
  var idx = 0;
  while (idx < keys.length && JSON.stringify(map).length > VOIDED_BUDGET_BYTES) {
    delete map[keys[idx]];
    idx++;
  }
  return map;
}

// คืน true เมื่อ "ยืนยันได้ว่าทะเบียนถูกบันทึกจริง" เท่านั้น
function markBillVoided_(billId, clientTs) {
  try {
    var map = readVoidedBillsStrict_();
    var ts = Number(clientTs);
    if (!isFinite(ts) || ts <= 0) ts = Date.now();   // client รุ่นเก่าไม่ส่งเวลามา
    map[billId] = ts;
    trimVoidedBills_(map);
    if (map[billId] === undefined) return false;     // ตัวเองโดนตัด = งบเล็กเกินกว่าจะรับ
    PropertiesService.getScriptProperties().setProperty(VOIDED_BILLS_PROPERTY, JSON.stringify(map));
    return readVoidedBillsStrict_()[billId] !== undefined;   // อ่านกลับมายืนยัน
  } catch (err) {
    Logger.log("markBillVoided_ failed: " + err);
    return false;
  }
}

// ใช้ตอนกู้ข้อมูล/คืนบิลโดยตั้งใจ
// ⚠️ ห้าม "ลบทะเบียนทิ้ง" — ต้องบันทึกว่ากู้คืนเมื่อไหร่ (เก็บเป็นค่าติดลบ)
// ไม่งั้นคำสั่งยกเลิกเก่าที่มาถึงทีหลังจะลบบิลที่เพิ่งกู้คืนได้ โดยไม่มีอะไรบอกว่ามันเก่า
// คืน true เมื่อ "ยืนยันได้ว่าบันทึกสถานะกู้คืนลงทะเบียนจริง" เท่านั้น (กติกาเดียวกับ markBillVoided_)
// ⚠️ เดิมกลืน error แล้วปล่อยให้ตอบว่าบันทึกบิลสำเร็จ ผลคือแถวกลับขึ้นชีตแล้ว
// แต่ทะเบียนยังบอกว่า "ถูกยกเลิกเมื่อ T" → คำสั่งยกเลิกเก่า (voidedAt = T) ลบบิลที่เพิ่งกู้ได้อีก
// และการแก้บิลใบนี้ครั้งถัดไปจะโดน ALREADY_VOIDED ค้าง โดยแอปเข้าใจว่าซิงก์สำเร็จไปแล้ว
function markBillRestored_(billId, restoredAt) {
  try {
    var map = readVoidedBillsStrict_();
    var ts = Number(restoredAt);
    if (!isFinite(ts) || ts <= 0) ts = Date.now();
    map[billId] = -ts;
    trimVoidedBills_(map);
    if (map[billId] === undefined) return false;
    PropertiesService.getScriptProperties().setProperty(VOIDED_BILLS_PROPERTY, JSON.stringify(map));
    return Number(readVoidedBillsStrict_()[billId]) < 0;   // อ่านกลับมายืนยัน
  } catch (err) {
    Logger.log("markBillRestored_ failed: " + err);
    return false;
  }
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
  var lastVoidEvent = billEventAt_(readVoidedBills_(), billId);
  var incomingVoidAt = Number(data.voidedAt);
  if (lastVoidEvent && lastVoidEvent.type === "restored" &&
      !(isFinite(incomingVoidAt) && incomingVoidAt > lastVoidEvent.at)) {
    return json("error",
      "คำสั่งยกเลิกนี้พิสูจน์ไม่ได้ว่าใหม่กว่าการกู้คืนบิล จึงไม่ลบแถว",
      { billId: billId, restoredAt: lastVoidEvent.at }, "VOID_SUPERSEDED_BY_RESTORE");
  }

  if (!markBillVoided_(billId, data.voidedAt)) {
    return json("error",
      "บันทึกทะเบียนบิลที่ยกเลิกไม่สำเร็จ จึงยังไม่ลบแถวใดทั้งสิ้น — ระบบจะลองใหม่ให้เอง",
      { billId: billId }, "VOID_REGISTRY_FAILED");
  }

  var sheet = ss.getSheetByName(monthYear);
  if (!sheet) {
    // ไม่มีแท็บเดือนนี้ = ไม่เคยมีแถวให้ลบตั้งแต่แรก ปลายทางถือว่า "ลบแล้ว"
    return json("error", "ไม่พบแผ่นงานของเดือนนี้", null, "NOT_FOUND");
  }

  var lastRow = sheet.getLastRow();
  var foundRow = -1;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      // เทียบค่าที่ตัดช่องว่างหัวท้ายแล้วทั้งสองฝั่ง — ช่องว่างที่มองไม่เห็นในชีต
      // ไม่ควรทำให้ "ลบไม่โดน" แล้วแอปวนลองใหม่ไปเรื่อย ๆ
      if (readBillId_(ids[i][0]) === billId) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (foundRow > -1) {
    sheet.deleteRow(foundRow);
    return json("success", "ลบบิลออกจาก Sheets แล้ว", { billId: billId });
  } else {
    // ไม่มีแถวนี้แล้ว = ลบไปก่อนหน้าแล้ว ฝั่งแอปต้องถือว่าสำเร็จ ไม่ใช่วนลองใหม่ตลอดกาล
    return json("error", "ไม่พบบิลเลขที่ " + billId + " ใน Sheets", null, "NOT_FOUND");
  }
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
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
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

function readSummaryStamp_(ss, sheetName) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return 0;
    var v = sh.getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL, 1, 1).getValues()[0][0];
    var n = Number(v);
    return (isFinite(n) && n > 0) ? n : 0;
  } catch (err) { return 0; }
}

function checkSummaryStale_(ss, sheetName, data) {
  var incoming = Number(data.generatedAt);
  if (!isFinite(incoming) || incoming <= 0) return null;   // client รุ่นเก่าไม่ส่งมา — พฤติกรรมเดิม
  var stored = readSummaryStamp_(ss, sheetName);
  if (stored > 0 && incoming <= stored) {
    return json("error",
      "คำขอสรุปนี้เก่ากว่าข้อมูลที่อยู่บนชีตแล้ว จึงไม่เขียนทับ (กันยอดเก่าทับยอดใหม่)",
      { sheet: sheetName, storedAt: stored }, "STALE_SUMMARY");
  }
  return null;
}

function writeSummaryStamp_(sheet, data) {
  try {
    var n = Number(data.generatedAt);
    if (!isFinite(n) || n <= 0) return;
    sheet.getRange(SUMMARY_STAMP_ROW, SUMMARY_STAMP_COL - 1, 1, 2)
      .setValues([["รหัสรุ่นข้อมูล (ระบบใช้กันยอดเก่าทับยอดใหม่ — ห้ามแก้/ห้ามลบ)", n]]);
    // ซ่อนไว้ไม่ให้รกสายตาเจ้าของ — ถ้าเมธอดนี้ไม่มี (ชีตจำลองในเทสต์) ก็แค่ไม่ซ่อน ไม่ใช่ข้อผิดพลาด
    try { sheet.hideColumns(SUMMARY_STAMP_COL - 1, 2); } catch (hideErr) {}
  } catch (err) { Logger.log("writeSummaryStamp_ failed: " + err); }
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

// เขียนสรุปลงแท็บชั่วคราวก่อนเสมอ แล้วค่อยสลับชื่อหลังเขียนและอัปเดต master สำเร็จ
// จึงไม่ลบแท็บสรุปเดิมตั้งแต่ต้น หาก payload หรือโครงสร้างชีตมีปัญหา
function replaceSummarySheet_(ss, sheetName, data, periodLabel, periodType, periodKey) {
  var stamp = new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
  var stagingName = "__POS_TMP_" + stamp;
  var staging = ss.insertSheet(stagingName);
  var previous = ss.getSheetByName(sheetName);

  try {
    writeSummarySheet(staging, data, periodLabel);
    writeSummaryStamp_(staging, data);   // รุ่นของข้อมูลชุดนี้ ติดไปกับแท็บที่กำลังจะกลายเป็นตัวจริง
    updateMasterSummarySheet(ss, data, periodType, periodKey);
  } catch (err) {
    try { ss.deleteSheet(staging); } catch (cleanupErr) {}
    throw err;
  }

  // สลับผ่านชื่อชั่วคราว แทน delete ของเก่าก่อน: ถ้าการเปลี่ยนชื่อพัง ยังคืนชื่อแท็บเดิมได้
  var oldName = "__POS_OLD_" + stamp;
  if (previous) {
    try {
      previous.setName(oldName);
    } catch (renameOldErr) {
      try { ss.deleteSheet(staging); } catch (cleanupErr2) {}
      throw new Error("ไม่สามารถเตรียมแท็บสรุปเดิมเพื่อสลับได้: " + renameOldErr.toString());
    }
  }

  try {
    staging.setName(sheetName);
  } catch (promoteErr) {
    if (previous) {
      try { previous.setName(sheetName); } catch (restoreErr) {}
    }
    try { ss.deleteSheet(staging); } catch (cleanupErr3) {}
    throw new Error("ไม่สามารถเผยแพร่แท็บสรุปใหม่ได้: " + promoteErr.toString());
  }

  // ลบสำเนาเดิมหลังจากแท็บใหม่พร้อมใช้งานแล้วเท่านั้น; ลบไม่สำเร็จให้เก็บเป็นสำเนากู้คืน ไม่ทำข้อมูลหลักหาย
  if (previous) {
    try { ss.deleteSheet(previous); }
    catch (deleteOldErr) { Logger.log("เก็บสำเนาสรุปเดิมไว้ที่ " + oldName + ": " + deleteOldErr.toString()); }
  }
  return staging;
}

// ทำให้ตัวเลขสรุปเป็น number จริงตั้งแต่จุดรับ API และคำนวณกำไรจากรายได้-ค่าใช้จ่ายเสมอ
function normalizeSummaryPayload_(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("payload ต้องเป็น object");
  data.totalRevenue = readFiniteNumber_(data.totalRevenue, "totalRevenue", true);
  data.totalExpenses = readFiniteNumber_(data.totalExpenses, "totalExpenses", true);
  data.billCount = readFiniteNumber_(data.billCount, "billCount", true);
  if (data.totalRevenue < 0 || data.totalExpenses < 0 || data.billCount < 0 || Math.floor(data.billCount) !== data.billCount) {
    throw new Error("รายได้ ค่าใช้จ่าย และจำนวนบิลต้องเป็นค่าที่ถูกต้อง");
  }
  data.netIncome = data.totalRevenue - data.totalExpenses;
  data.avgBill = data.billCount > 0 ? data.totalRevenue / data.billCount : 0;

  var nonNegative = ["cashRevenue", "qrRevenue", "creditRevenue", "shiftCount", "nonVatBase", "vatableBase", "vatAmount", "rounding", "vatRate"];
  for (var i = 0; i < nonNegative.length; i++) {
    var key = nonNegative[i];
    data[key] = readFiniteNumber_(data[key], key, false);
    if (data[key] < 0) throw new Error(key + " ต้องไม่ติดลบ");
  }
  if (Math.floor(data.shiftCount) !== data.shiftCount) throw new Error("shiftCount ต้องเป็นจำนวนเต็ม");
  if (data.vatRate > 100) throw new Error("vatRate เกินช่วงที่ยอมรับได้");
  data.cashVariance = readFiniteNumber_(data.cashVariance, "cashVariance", false);

  if (!Array.isArray(data.shiftCash)) data.shiftCash = [];
  if (!Array.isArray(data.vatCategories)) data.vatCategories = [];
  if (!Array.isArray(data.expenses)) data.expenses = [];

  // ── สองบล็อกนี้เดิมไม่ถูกตรวจเลย ทั้งที่บล็อกอื่นตรวจครบ ──────────────
  // staffCommissions: ถ้าไม่ใช่ array จะไปพังตอน writeSummarySheet เรียก .sort()
  //   แล้วทั้งงานล้มพร้อมข้อความ error ของ JavaScript ที่คนหน้าร้านอ่านไม่รู้เรื่อง
  //   ทั้งที่สรุปส่วนอื่นเขียนได้ปกติ — ตรวจตรงนี้แล้วบอกเป็นภาษาคนดีกว่า
  // services: เดิมใช้ Number(x) || 0 ตอนเขียน แปลว่าค่าที่ผิดรูปจะกลายเป็น 0 เงียบ ๆ
  //   ยอดขายบริการหายไปจากรายงานโดยไม่มีร่องรอย — อันตรายกว่าการหยุดแล้วฟ้อง
  data.staffCommissions = normalizeStaffCommissions_(data.staffCommissions);
  data.services = normalizeServiceRows_(data.services);
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
  r += 2;

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
    var sumStart = 0, sumSales = 0, sumExp = 0;
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
      r++;
    });

    var tBg  = sumDiff < 0 ? LRED : (sumDiff > 0 ? LGREEN : "#f1f5f9");
    var tClr = sumDiff < 0 ? "#9f1239" : (sumDiff > 0 ? "#166534" : "#475569");
    sheet.getRange(r,1,1,2).merge()
      .setValue("รวม · เงินตั้งต้น " + numFmt(sumStart) + " · ขายสด " + numFmt(sumSales) + " · ค่าใช้จ่าย " + numFmt(sumExp))
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
  sheet.getRange(r, 1, 1, 5).merge()
    .setValue("รายการบริการ (จำแนกตามยอดขาย)")
    .setBackground(GOLD).setFontColor("white").setFontWeight("bold");
  r++;
  var svcHeaders = ["ลำดับ","ชื่อบริการ","จำนวน (ครั้ง)","รายได้ (฿)","% ของรายได้รวม"];
  styleHeaderRow(sheet, r, svcHeaders, "#854d0e", LGOLD);
  r++;
  var services = data.services || [];
  services.sort(function(a,b){return (Number(b.revenue) || 0) - (Number(a.revenue) || 0);});
  var totalRevVal = Number(data.totalRevenue) || 0;
  services.forEach(function(svc, i) {
    var revVal = Number(svc.revenue) || 0;
    var countVal = Number(svc.count) || 0;
    var pct = totalRevVal > 0 ? ((revVal/totalRevVal)*100).toFixed(1)+"%" : "0%";
    var bg  = i%2===0 ? "#fffbeb" : "white";
    sheet.getRange(r,1).setValue(i+1).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r,2).setValue(safeCell(svc.name || "ไม่ระบุชื่อบริการ")).setBackground(bg);
    sheet.getRange(r,3).setValue(countVal).setBackground(bg).setHorizontalAlignment("center");
    sheet.getRange(r,4).setValue(revVal).setBackground(bg).setNumberFormat("#,##0.00").setHorizontalAlignment("right");
    sheet.getRange(r,5).setValue(pct).setBackground(bg).setHorizontalAlignment("center");
    r++;
  });
  sheet.getRange(r,1).setBackground(LGOLD); // คอลัมน์ 1
  sheet.getRange(r,2).setValue("รวมทั้งหมด").setBackground(LGOLD).setFontWeight("bold");
  sheet.getRange(r,3).setValue(services.reduce(function(s,x){return s+Number(x.count || 0);},0)).setBackground(LGOLD).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(r,4).setValue(totalRevVal).setBackground(LGOLD).setFontWeight("bold").setNumberFormat("#,##0.00").setHorizontalAlignment("right");
  sheet.getRange(r,5).setBackground(LGOLD); // คอลัมน์ 5
  r += 2;

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
  [
    ["รายได้รวม", data.totalRevenue, LGREEN, "#166534"],
    ["(-) ค่าใช้จ่ายรวม", -data.totalExpenses, LRED, "#9f1239"],
    ["= กำไรสุทธิ", data.netIncome, data.netIncome>=0?LGREEN:LRED, data.netIncome>=0?"#166534":"#9f1239"]
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
  var masterName = "สรุปรายเดือน";
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

// กัน Google Sheets Formula Injection — ถ้าข้อความขึ้นต้นด้วย = + - @ ให้เติม ' นำหน้า
function safeCell(v) {
  var s = (v == null) ? "" : String(v);
  return /^[=+\-@]/.test(s) ? ("'" + s) : s;
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
