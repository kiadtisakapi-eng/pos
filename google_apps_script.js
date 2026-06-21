/**
 * Erotica Barber & Massage POS - Google Sheets Sync API v2
 *
 * วิธีติดตั้ง:
 * 1. Extensions > Apps Script > วางโค้ดทั้งหมด > Save
 * 2. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3. คัดลอก Web App URL ไปใส่ในหน้าตั้งค่า POS
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
    var folderName = "Erotica_POS_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }

    var timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    var fileName = "pos_backup_" + timeStamp + ".json";
    var fileContent = JSON.stringify(data.backupData, null, 2);
    var file = folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);

    return json("success", "สำรองข้อมูลเรียบร้อยแล้วที่ Google Drive", {
      fileId: file.getId(),
      fileName: fileName,
      folderName: folderName
    });
  } catch (err) {
    return json("error", "การสำรองข้อมูลล้มเหลว: " + err.toString());
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
  var monthYear = fmt(txDate, "MM-yyyy");
  var sheet     = getOrCreateSheet(ss, monthYear, [
    "เลขที่บิล","วันที่-เวลา","ลูกค้า","รายการบริการ",
    "ช่องทางชำระเงิน","ราคารวม (฿)","ส่วนลด (฿)","ยอดสุทธิ (฿)","พนักงาน"
  ], "#1e293b");

  var payText = payLabel(data.paymentMethod);
  var row = [
    safeCell(data.id),
    fmt(txDate, "yyyy-MM-dd HH:mm:ss"),
    safeCell(data.customerName),
    safeCell((data.services||[]).join(", ")),
    payText,
    data.subtotal || data.total,
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
  var monthYear = fmt(txDate, "MM-yyyy");
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
    var mh = ["ประเภท","ช่วงเวลา","บิล","รายได้รวม (฿)","ค่าใช้จ่าย (฿)","กำไรสุทธิ (฿)","อัปเดตล่าสุด"];
    styleHeaderRow(master, 1, mh, "#1e293b", "#e2e8f0");
    master.setFrozenRows(1);
  }
  var lastRow = master.getLastRow();
  var found   = false;
  for (var i = 2; i <= lastRow; i++) {
    if (String(master.getRange(i, 2).getDisplayValue()) === String(periodKey)) {
      writeToMaster(master, i, periodType, periodKey, data);
      found = true;
      break;
    }
  }
  if (!found) writeToMaster(master, lastRow + 1, periodType, periodKey, data);
  master.autoResizeColumns(1, 7);
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
  sheet.getRange(row,7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
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
