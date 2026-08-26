/**
 * ═══════════════════════════════════════════════════════════════════════
 *  เครื่องมือวัดความเร็วการเขียนชีตสรุป — ใช้ตัดสินใจว่าต้องรีบแก้ไหม
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ เครื่องมือนี้ไม่แก้ไขข้อมูลอะไรเลย
 *     สร้างแท็บชั่วคราวชื่อ __POS_BENCH_xxx → เขียนข้อมูลปลอมลงไป → จับเวลา → ลบแท็บทิ้ง
 *     ไม่แตะแท็บบิล ไม่แตะแท็บสรุป ไม่แตะชีต "สรุปรายเดือน"
 *
 *  วิธีใช้ (2 นาที):
 *    1. เปิด Google Sheets ของร้าน → Extensions → Apps Script
 *    2. กดปุ่ม + ข้าง "Files" → Script → ตั้งชื่อ bench (หรือวางต่อท้ายไฟล์เดิมก็ได้)
 *    3. วางโค้ดทั้งหมดนี้ลงไป → Save
 *    4. เลือกฟังก์ชัน  benchSummarySpeed  จากช่องด้านบน → กด Run
 *    5. รอสักครู่ → ดูผลที่ Execution log (กด "Execution log" ด้านล่าง)
 *    6. ส่งผลที่ได้มาให้ดู
 *
 *  เสร็จแล้วลบไฟล์นี้ทิ้งได้เลย ไม่ต้องเก็บไว้
 */

function benchSummarySpeed() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = [];
  out.push('═══ ผลวัดความเร็วเขียนชีตสรุป ═══');
  out.push('ไฟล์: ' + ss.getName());
  out.push('จำนวนแท็บทั้งหมดตอนนี้: ' + ss.getSheets().length);
  out.push('');

  var cases = [
    { name: 'เดือนเบา  (บริการ 9 · พนักงาน 3 · กะ 30 · ค่าใช้จ่าย 20)', svc: 9,  stf: 3, sh: 30, exp: 20 },
    { name: 'เดือนหนัก (บริการ 20 · พนักงาน 6 · กะ 60 · ค่าใช้จ่าย 60)', svc: 20, stf: 6, sh: 60, exp: 60 }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var data = makeBenchData_(c.svc, c.stf, c.sh, c.exp);
    var name = '__POS_BENCH_' + new Date().getTime() + '_' + i;
    var sheet = ss.insertSheet(name);
    var t0 = new Date().getTime();
    var err = '';
    try {
      writeSummarySheet(sheet, data, 'ทดสอบความเร็ว');
      SpreadsheetApp.flush();          // บังคับให้ส่งคำสั่งที่ค้างอยู่ให้หมด ก่อนหยุดจับเวลา
    } catch (e) {
      err = e.toString();
    }
    var ms = new Date().getTime() - t0;
    try { ss.deleteSheet(sheet); } catch (e2) {}

    out.push(c.name);
    if (err) {
      out.push('   ✖ เขียนไม่สำเร็จ: ' + err);
    } else {
      out.push('   ใช้เวลา ' + (ms / 1000).toFixed(1) + ' วินาที' +
               '   (ลิมิตของ Google = 360 วินาที ใช้ไป ' + Math.round(ms / 3600) + '%)');
      out.push('   ' + verdict_(ms));
    }
    out.push('');
  }

  out.push('── ปิดกะ 1 ครั้ง เรียกงานนี้กี่รอบ ──');
  out.push('   สรุปรายวัน 1 รอบ + สรุปรายเดือน 1 รอบ = 2 รอบ');
  out.push('   (ถ้ากะคร่อมวันทำการ จะเป็น 4 รอบ) แล้วยังมีสำรองข้อมูลขึ้น Drive อีก 1 รอบ');
  out.push('   ระหว่างนี้ระบบจับล็อกไว้ — บิลที่ขายพร้อมกันจะซิงก์ไม่ได้จนกว่าจะเสร็จ');
  out.push('');
  out.push('── เอาผลนี้ไปทำอะไร ──');
  out.push('   ต่ำกว่า 20 วิ/รอบ  = ยังสบาย ไม่ต้องรีบแก้');
  out.push('   20-60 วิ/รอบ       = ปิดกะจะรู้สึกรอ ควรวางแผนแก้');
  out.push('   เกิน 60 วิ/รอบ     = ใกล้ลิมิตแล้ว ควรแก้ก่อนข้อมูลโตกว่านี้');

  var text = out.join('\n');
  Logger.log(text);
  return text;
}

function verdict_(ms) {
  if (ms < 20000)  return '→ ยังสบาย';
  if (ms < 60000)  return '→ เริ่มรู้สึกรอตอนปิดกะ';
  if (ms < 150000) return '→ ช้าชัดเจน ควรแก้';
  return '→ ⚠️ ใกล้ลิมิต 6 นาทีแล้ว เสี่ยงเขียนไม่จบ';
}

// สร้างข้อมูลปลอมหน้าตาเหมือนของจริง — ไม่ได้อ่านข้อมูลร้านเลย
function makeBenchData_(nSvc, nStaff, nShift, nExp) {
  var services = [], staff = [], shiftCash = [], expenses = [];
  var rev = 0;
  for (var i = 0; i < nSvc; i++) {
    var r = 1000 + i * 137;
    rev += r;
    services.push({ name: 'บริการทดสอบรายการที่ ' + (i + 1), count: 3 + i, revenue: r });
  }
  for (var j = 0; j < nStaff; j++)
    staff.push({ name: 'พนักงานทดสอบ ' + (j + 1), role: 'ช่าง', count: 10 + j, salesSum: 5000 + j * 100, commission: 500 + j * 10 });
  for (var k = 0; k < nShift; k++)
    shiftCash.push({ startTime: new Date().getTime() - k * 86400000, endTime: new Date().getTime() - k * 86400000 + 5e7,
                     closedBy: 'ผู้ทดสอบ', startCash: 3000, cashSales: 8000, expenses: 500,
                     expected: 10500, counted: 10500, difference: 0 });
  var expTotal = 0;
  for (var m = 0; m < nExp; m++) { expTotal += 250; expenses.push({ note: 'ค่าใช้จ่ายทดสอบรายการที่ ' + (m + 1), amount: 250 }); }

  return {
    totalRevenue: rev, totalExpenses: expTotal, netIncome: rev - expTotal,
    billCount: 120, avgBill: rev / 120,
    cashRevenue: rev * 0.6, qrRevenue: rev * 0.3, creditRevenue: rev * 0.1,
    nonVatBase: rev, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0, vatCategories: [],
    cashVariance: 0, shiftCount: nShift, shiftCash: shiftCash,
    services: services, expenses: expenses, staffCommissions: staff
  };
}
