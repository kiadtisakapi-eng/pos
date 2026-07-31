/**
 * Erotica Barber & Massage POS - Google Sheets Sync API v2
 *
 * วิธีติดตั้ง:
 * 1. Extensions > Apps Script > วางโค้ดทั้งหมด > Save
 * 2. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3. คัดลอก Web App URL ไปใส่ในหน้าตั้งค่า POS
 * 4. ⚠️ สำคัญ: Project Settings (ไอคอนเฟือง) > Time zone ต้องตั้งเป็น "(GMT+07:00) Bangkok"
 *    — แอปส่ง monthKey จากเวลาหน้าร้านมาให้แล้ว (บิลลงแท็บถูกเดือนแม้ timezone ผิด)
 *    แต่ timestamp "สร้างเมื่อ" ในชีตสรุป และการลบแท็บรายวันเก่า ยังอิง timezone ของโปรเจกต์นี้
 *
 * Sheet structure:
 *   "สรุปรายเดือน"  — master monthly summary (sheet แรก)
 *   "MM-yyyy"       — transaction detail รายเดือน
 *   "สรุป-MM-yyyy"  — monthly summary snapshot
 *   "สรุป-YYYY-MM-DD" — daily summary (สร้างเมื่อปิดกะ)
 */

// ─────────────────────────────────────────────
//  ⚠️ SECRET TOKEN — เปลี่ยนเป็นรหัสลับของคุณเอง
//  ต้องตรงกับค่า API_SECRET ในไฟล์ app.js ทุกตัวอักษร
//  (ตั้งค่าเป็น "" เพื่อปิดการตรวจสอบ — ไม่แนะนำ)
// ─────────────────────────────────────────────
var API_SECRET = 'epos_8iwcISy4RSQkymn8FdGupRP';

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
//  ตั้งเป็น 0 เพื่อปิดการลบอัตโนมัติ
// ──────────────────────────────
var BACKUP_RETENTION_DAYS = 30;

// ชื่อโฟลเดอร์และคำนำหน้าไฟล์สำรองใน Google Drive
// ใช้ร่วมกันทั้งตอนสำรอง (handleBackup) และตอนกู้คืน (handleListBackups / handleGetBackup)
// แก้ที่เดียวพอ — เดิม hard-code ในฟังก์ชันเดียว พอมีหลายที่จะหลุดง่าย
var BACKUP_FOLDER_NAME = "Erotica_POS_Backups";
var BACKUP_FILE_PREFIX = "pos_backup_";

// หัวคอลัมน์ของชีต "สรุปรายเดือน" — ใช้ค้นหาจากหัวตาราง แทนการอ้างเลขคอลัมน์ตายตัว
var MASTER_VAR_HEADER = "เงินขาด/เกิน (฿)";
var MASTER_TS_HEADER  = "อัปเดตล่าสุด";

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

    // ตรวจสอบรหัสลับ — กันคนอื่นที่ได้ URL ไปยิง API เข้ามา
    if (API_SECRET && data.secret !== API_SECRET) {
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


// หาโฟลเดอร์สำรองใน Drive
// หมายเหตุ: Google Drive ยอมให้มีโฟลเดอร์ชื่อซ้ำกันได้ — ที่นี่หยิบตัวแรกที่เจอเสมอ
// ทั้งตอนเขียนและตอนอ่าน จึงชี้ไปที่โฟลเดอร์เดียวกันตลอด ไม่สลับไปมา
function getBackupFolder_(createIfMissing) {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return createIfMissing ? DriveApp.createFolder(BACKUP_FOLDER_NAME) : null;
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
  var txDate = (data.date) ? new Date(data.date) : new Date();
  if (isNaN(txDate.getTime())) {
    txDate = new Date();
  }
  // ใช้ monthKey ที่ client คำนวณจากเวลาท้องถิ่นหน้าร้านเป็นหลัก — กันบิลช่วงเที่ยงคืน/ปลายเดือน
  // ลงแท็บผิดเดือนเมื่อ timezone ของโปรเจกต์ Apps Script ไม่ตรงกับหน้าร้าน (fallback: timezone ฝั่งสคริปต์)
  var monthYear = /^(0[1-9]|1[0-2])-\d{4}$/.test(data.monthKey || "") ? data.monthKey : fmt(txDate, "MM-yyyy");
  var sheet     = getOrCreateSheet(ss, monthYear, [
    "เลขที่บิล","วันที่-เวลา","ลูกค้า","รายการบริการ",
    "ช่องทางชำระเงิน","ราคารวม (฿)","ส่วนลด (฿)","ยอดสุทธิ (฿)","พนักงาน"
  ], "#1e293b");

  var payText = payLabel(data.paymentMethod);
  var row = [
    safeCell(data.id),
    // เวลาบนบิลใช้ค่าจากเครื่องหน้าร้านถ้าส่งมา (รูปแบบถูกต้อง) — ตรงกับเวลาที่ลูกค้าเห็นบนใบเสร็จจริง
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.dateTimeStr || "") ? data.dateTimeStr : fmt(txDate, "yyyy-MM-dd HH:mm:ss"),
    safeCell(data.customerName),
    safeCell((data.services||[]).join(", ")),
    payText,
    (data.subtotal != null ? data.subtotal : data.total),
    data.discount || 0,
    data.total,
    safeCell((data.staffNames||[]).join(", "))
  ];

  // ค้นหาบิลเก่าที่มี ID เดียวกันเพื่อแก้ไข (Upsert)
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
    // อัปเดตแถวเดิม
    sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(foundRow, 6, 1, 3).setNumberFormat("#,##0.00");
    return json("success", "อัปเดตข้อมูลบิลแล้ว", { billId: data.id, sheet: monthYear, updated: true });
  } else {
    // เพิ่มแถวใหม่
    sheet.appendRow(row);
    var lr = sheet.getLastRow();
    sheet.getRange(lr, 6, 1, 3).setNumberFormat("#,##0.00");
    return json("success", "บันทึกบิลแล้ว", { billId: data.id, sheet: monthYear, updated: false });
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
function handleDailySummary(data, ss) {
  var dateKey   = data.dateKey;          // "2026-06-06"
  var sheetName = "สรุป-" + dateKey;
  var sheet     = ss.getSheetByName(sheetName);
  if (sheet) ss.deleteSheet(sheet);      // สร้างใหม่ทุกครั้ง (overwrite)
  sheet = ss.insertSheet(sheetName);

  writeSummarySheet(sheet, data, "รายวัน: " + dateKey);
  updateMasterSummarySheet(ss, data, "day", dateKey);
  pruneOldDailySheets(ss, DAILY_SHEET_RETENTION_DAYS);

  return json("success", "บันทึกสรุปรายวันแล้ว", { sheet: sheetName });
}

// ─────────────────────────────────────────────
//  3. MONTHLY SUMMARY — สรุปรายเดือน
// ─────────────────────────────────────────────
function handleMonthlySummary(data, ss) {
  var monthKey  = data.monthKey;         // "06-2026"
  var sheetName = "สรุป-" + monthKey;
  var sheet     = ss.getSheetByName(sheetName);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(sheetName);

  writeSummarySheet(sheet, data, "รายเดือน: " + monthKey);
  updateMasterSummarySheet(ss, data, "month", monthKey);

  return json("success", "บันทึกสรุปรายเดือนแล้ว", { sheet: sheetName });
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
      sheet.getRange(r,1).setValue(i+1).setBackground(bg).setHorizontalAlignment("center");
      sheet.getRange(r,2,1,2).merge().setValue(safeCell(exp.note)).setBackground(bg);       // col 2-3
      sheet.getRange(r,4,1,2).merge().setValue(exp.amount).setBackground(bg).setNumberFormat("#,##0.00").setHorizontalAlignment("right"); // col 4-5
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
    var mh = ["ประเภท","ช่วงเวลา","บิล","รายได้รวม (฿)","ค่าใช้จ่าย (฿)","กำไรสุทธิ (฿)", MASTER_VAR_HEADER, MASTER_TS_HEADER];
    styleHeaderRow(master, 1, mh, "#1e293b", "#e2e8f0");
    master.setFrozenRows(1);
  } else {
    // ต้อง flush ให้การแทรกคอลัมน์มีผลจริงก่อน — writeToMaster ด้านล่างอ่านหัวตารางซ้ำ
    // ถ้าอ่านก่อนที่ Sheets จะ apply การแทรก จะหาคอลัมน์ใหม่ไม่เจอแล้วข้ามการเขียนเงินขาด/เกินไปทั้งรอบ
    migrateMasterAddVarianceColumn(master);
    SpreadsheetApp.flush();
  }
  var lastRow = master.getLastRow();
  var found   = false;
  // อ่านคอลัมน์ "ช่วงเวลา" ทั้งหมดครั้งเดียว (เดิมอ่านทีละเซลล์ใน loop — ช้าลงเรื่อยๆ เมื่อแถวสะสมเป็นร้อย)
  if (lastRow > 1) {
    var keys = master.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(periodKey)) {
        writeToMaster(master, i + 2, periodType, periodKey, data);
        found = true;
        break;
      }
    }
  }
  if (!found) writeToMaster(master, lastRow + 1, periodType, periodKey, data);
  master.autoResizeColumns(1, Math.max(master.getLastColumn(), 1));
}

// หาตำแหน่งคอลัมน์จาก "หัวตาราง" ไม่ใช่จากเลขคอลัมน์ตายตัว
// เหตุผล: เดิมเขียนตามเลข 7/8 ตายตัว ถ้าชีตของจริงมีคอลัมน์ค้าง/ถูกแทรกเพิ่มโดยคน
// การเขียนตามเลขจะไปทับคอลัมน์ "อัปเดตล่าสุด" ด้วยตัวเลขเงิน — เพี้ยนแบบเงียบ ๆ หาสาเหตุยาก
// คืน 0 = ไม่พบคอลัมน์นั้น (ผู้เรียกต้องเช็คก่อนใช้เสมอ)
function masterColumnMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { varCol: 0, tsCol: 0 };
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var map = { varCol: 0, tsCol: 0 };
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h === MASTER_VAR_HEADER) map.varCol = i + 1;
    if (h === MASTER_TS_HEADER)  map.tsCol  = i + 1;
  }
  return map;
}

// แทรกคอลัมน์ "เงินขาด/เกิน" ให้ชีต master ที่สร้างไว้ก่อนเวอร์ชันนี้
// idempotent: ถ้าหาคอลัมน์นี้เจอแล้ว = เคย migrate แล้ว ไม่ทำซ้ำ
// แทรกก่อน "อัปเดตล่าสุด" เพื่อให้คอลัมน์เงินอยู่ติดกัน — ข้อมูลเดิมเลื่อนตามอัตโนมัติ ไม่หาย
function migrateMasterAddVarianceColumn(master) {
  var cols = masterColumnMap_(master);
  if (cols.varCol > 0) return;   // มีแล้ว
  if (cols.tsCol === 0) return;  // ไม่รู้จักโครงสร้างชีตนี้ — ไม่แตะ ดีกว่าทำข้อมูลเพี้ยน
  master.insertColumnBefore(cols.tsCol);
  master.getRange(1, cols.tsCol)
    .setValue(MASTER_VAR_HEADER)
    .setBackground("#1e293b").setFontColor("#e2e8f0")
    .setFontWeight("bold").setHorizontalAlignment("center");
}

function writeToMaster(sheet, row, type, key, data) {
  var net    = data.netIncome;
  var netBg  = net >= 0 ? "#dcfce7" : "#ffe4e6";
  var netClr = net >= 0 ? "#166534" : "#9f1239";
  sheet.getRange(row,1).setValue(type === "month" ? "รายเดือน" : "รายวัน");
  sheet.getRange(row,2).setNumberFormat("@").setValue(key).setFontWeight("bold");
  sheet.getRange(row,3).setValue(data.billCount).setHorizontalAlignment("center");
  sheet.getRange(row,4).setValue(data.totalRevenue).setNumberFormat("#,##0.00").setBackground("#fef9c3").setHorizontalAlignment("right");
  sheet.getRange(row,5).setValue(data.totalExpenses).setNumberFormat("#,##0.00").setBackground("#ffe4e6").setHorizontalAlignment("right");
  sheet.getRange(row,6).setValue(net).setNumberFormat("#,##0.00").setBackground(netBg).setFontColor(netClr).setFontWeight("bold").setHorizontalAlignment("right");

  // เงินขาด/เกิน — แยกสี 3 ระดับ: ขาด(แดง) / เกิน(เขียว) / ตรงพอดีหรือยังไม่ปิดกะ(เทา)
  // ใช้ "—" เมื่อยังไม่มีกะปิดในงวดนั้น เพื่อไม่ให้ 0 (ตรงพอดี) กับ "ยังไม่ปิดกะ" ดูเหมือนกัน
  // ⚠️ หาคอลัมน์จากหัวตาราง ถ้าไม่เจอ = ข้ามไปเลย ห้ามเดาเลขคอลัมน์แล้วเขียนทับของเดิม
  var cols = masterColumnMap_(sheet);
  if (cols.varCol > 0) {
    var hasShift = Number(data.shiftCount || 0) > 0;
    var varVal   = Number(data.cashVariance || 0);
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
  var tsCol = cols.tsCol > 0 ? cols.tsCol : Math.max(sheet.getLastColumn() + 1, 7);
  sheet.getRange(row, tsCol).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
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
