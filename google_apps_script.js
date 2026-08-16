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

    // action: "transaction" (default) | "summary_day" | "summary_month" | "void_transaction"
    var action = data.action || "transaction";

    if (action === "summary_day")   return handleDailySummary(data, ss);
    if (action === "summary_month") return handleMonthlySummary(data, ss);
    if (action === "backup")        return handleBackup(data, ss);
    if (action === "list_backups")  return handleListBackups();
    if (action === "get_backup")    return handleGetBackup(data);
    if (action === "void_transaction") return handleVoidTransaction(data, ss);
    return handleTransaction(data, ss);

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
function handleTransaction(data, ss) {
  var billId = String(data.id || "").trim();
  if (!/^[A-Za-z0-9_-]{6,160}$/.test(billId)) {
    return json("error", "เลขที่บิลไม่ถูกต้อง");
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
    return json("error", "ยอดเงินในบิลอยู่นอกช่วงที่ยอมรับได้");
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
  var sheet     = getOrCreateSheet(ss, monthYear, [
    "เลขที่บิล","วันที่-เวลา","ลูกค้า","รายการบริการ",
    "ช่องทางชำระเงิน","ราคารวม (฿)","ส่วนลด (฿)","ยอดสุทธิ (฿)","พนักงาน"
  ], "#1e293b");

  var payText = payLabel(data.paymentMethod);
  var row = [
    safeCell(billId),
    // เวลาบนบิลใช้ค่าจากเครื่องหน้าร้านถ้าส่งมา (รูปแบบถูกต้อง) — ตรงกับเวลาที่ลูกค้าเห็นบนใบเสร็จจริง
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.dateTimeStr || "") ? data.dateTimeStr : fmt(txDate, "yyyy-MM-dd HH:mm:ss"),
    safeCell(data.customerName),
    safeCell((Array.isArray(data.services) ? data.services : []).join(", ")),
    payText,
    subtotal,
    discount,
    total,
    safeCell((Array.isArray(data.staffNames) ? data.staffNames : []).join(", "))
  ];

  // ค้นหาบิลเก่าที่มี ID เดียวกันเพื่อแก้ไข (Upsert)
  var lastRow = sheet.getLastRow();
  var foundRow = -1;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === billId) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (foundRow > -1) {
    // อัปเดตแถวเดิม
    sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(foundRow, 6, 1, 3).setNumberFormat("#,##0.00");
    return json("success", "อัปเดตข้อมูลบิลแล้ว", { billId: billId, sheet: monthYear, updated: true });
  } else {
    // เพิ่มแถวใหม่
    sheet.appendRow(row);
    var lr = sheet.getLastRow();
    sheet.getRange(lr, 6, 1, 3).setNumberFormat("#,##0.00");
    return json("success", "บันทึกบิลแล้ว", { billId: billId, sheet: monthYear, updated: false });
  }
}

// ─────────────────────────────────────────────
//  VOID TRANSACTION — ลบบิลรายการ
// ─────────────────────────────────────────────
function handleVoidTransaction(data, ss) {
  var txDate = (data.date) ? new Date(data.date) : new Date();
  if (isNaN(txDate.getTime())) {
    txDate = new Date();
  }
  // ใช้ monthKey จาก client เป็นหลัก (เหตุผลเดียวกับ handleTransaction) — ต้องชี้แท็บเดือนเดียวกับตอนบันทึกบิล
  var monthYear = /^(0[1-9]|1[0-2])-\d{4}$/.test(data.monthKey || "") ? data.monthKey : fmt(txDate, "MM-yyyy");
  // กันบิลที่วันที่หายไปแล้วกลายเป็นปี 1970 — จะได้แท็บ "01-1970" ค้างอยู่ในไฟล์ถาวร
  if (!isValidMonthKey_(monthYear))
    return json("error", "เดือนของบิลไม่ถูกต้อง (" + monthYear + ") — ตรวจสอบวันที่ของบิลใบนี้");
  var sheet = ss.getSheetByName(monthYear);
  if (!sheet) {
    return json("error", "ไม่พบแผ่นงานของเดือนนี้");
  }

  var lastRow = sheet.getLastRow();
  var foundRow = -1;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === data.id) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (foundRow > -1) {
    sheet.deleteRow(foundRow);
    return json("success", "ลบบิลออกจาก Sheets แล้ว", { billId: data.id });
  } else {
    return json("error", "ไม่พบบิลเลขที่ " + data.id + " ใน Sheets");
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
      sheet.getRange(r,3).setValue((Number(data.vatRate)||0) + "%").setBackground("#FAEEDA").setFontColor("#412402").setHorizontalAlignment("center");
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

function payLabel(method) {
  if (method === "promptpay") return "Scan (QR)";
  if (method === "credit")    return "Credit Card";
  return "เงินสด";
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

function json(status, message, details) {
  var r = { status: status, message: message };
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
