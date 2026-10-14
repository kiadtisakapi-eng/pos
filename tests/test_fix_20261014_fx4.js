// ตรวจ 14 ต.ค. 2569 (fx4) — ข้อ 5 นาฬิกาย้อนแต่เปิดกะได้ · ข้อ 9 rollback ปิดกะทำ Telegram ซ้ำ
// · ข้อ 14 ป้าย "ค่าใช้จ่ายเกินลิ้นชัก" ทั้งที่ต้นเหตุคือเงินคืน · ข้อ 15 รายงานรายเดือนไม่มีวันที่
// ใช้แอปจริง + Dexie จริงบน fake-indexeddb (เดินทางเดียวกับผู้ใช้: confirmCashCount / voidTransaction / filterReports)
const vm = require('vm');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- fx4: fixes 14 Oct 2026 (clock/open shift · close rollback · overspend cause · monthly dates) ---');

async function sale(env, amount, pay) {
  readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: amount }], pay || 'cash', amount);
  const n = env.app.state.transactions.length;
  await env.app.processCheckout();
  await settle(30);
  ok(env.app.state.transactions.length === n + 1, 'ขายไม่สำเร็จ');
  return env.app.state.transactions.at(-1);
}
const setCash = (cash, amt) => { for (const k in cash) delete cash[k]; cash[1000] = Math.floor(amt / 1000); cash[1] = amt % 1000; };
async function closeShift(app) { app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(30); }
async function openShift(app) { app.cashCounterMode = 'open'; await app.confirmCashCount(); await settle(30); }
// ตั้งนาฬิกาของเครื่อง (ในแอป) ให้ช้ากว่าจริง ms
const shiftClock = (env, ms) => vm.runInContext(`(() => { const o = Date.__origNow || Date.now; Date.__origNow = o; Date.now = () => o() + (${-ms}); })()`, env.ctx);
const textOf = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  // ═══ ข้อ 5: นาฬิกาเครื่องย้อนไปก่อนรายการล่าสุด ห้ามเปิดกะ (บิลวันนี้จะไปลงวันในอดีต) ═══
  await R.t('ข้อ 5: พนักงานเปิดกะไม่ได้เมื่อนาฬิกาเครื่องย้อนไป 2 วัน (ไม่มีบิลลงวันในอดีต)', async () => {
    const cash = { 1000: 1 };
    const { env, app, toasts } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300);
      await closeShift(app);
      ok(!app.state.shift.active, 'ปิดกะไม่สำเร็จ');
      shiftClock(env, 2 * 86400e3);
      loginAs(app, 'staff');
      await openShift(app);
      ok(!app.state.shift.active, 'เปิดกะได้ทั้งที่นาฬิกาย้อนหลัง 2 วัน');
      ok(toasts.some(x => /เปิดกะไม่ได้[\s\S]*เวลาของเครื่องย้อน/.test(x.m)), 'ไม่บอกเหตุผลเรื่องเวลาเครื่อง');
      const n = app.state.transactions.length;
      readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      await app.processCheckout(); await settle(30);
      eq(app.state.transactions.length, n, 'ขายได้โดยไม่มีกะ/บิลลงวันในอดีต');
    } finally { env.dispose && env.dispose(); }
  });

  await R.t('ข้อ 5: เจ้าของยืนยันเวลาเครื่อง (acknowledgeClock) แล้วเปิดกะต่อได้', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300);
      await closeShift(app);
      shiftClock(env, 2 * 86400e3);
      loginAs(app, 'owner');
      app._lastAskMsg = '';
      await openShift(app);   // askConfirm ของเทสต์ = กดยืนยัน
      ok(app.state.shift.active, 'เจ้าของยืนยันเวลาแล้วยังเปิดกะไม่ได้');
      ok(/ตั้งค่าอัตโนมัติ|ถูกแล้ว/.test(app._lastAskMsg || ''), 'ไม่ได้ถามเจ้าของให้ยืนยันเวลาเครื่อง');
      ok(app.clockAck && Number(app.clockAck.at) > 0, 'ไม่ได้บันทึกการยืนยันเวลา');
      ok(!app.clockBehindProblem(), 'ยืนยันแล้วยังถือว่านาฬิกาย้อน');
      await sale(env, 300);
    } finally { env.dispose && env.dispose(); }
  });

  await R.t('ข้อ 5: เจ้าของไม่ยืนยันเวลา = ไม่เปิดกะ', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300);
      await closeShift(app);
      shiftClock(env, 2 * 86400e3);
      loginAs(app, 'owner');
      app.askConfirm = async (msg) => { app._lastAskMsg = msg; return false; };
      await openShift(app);
      ok(!app.state.shift.active, 'เปิดกะได้ทั้งที่เจ้าของไม่ยืนยันเวลา');
    } finally { env.dispose && env.dispose(); }
  });

  await R.t('ข้อ 5 (ควบคุม): นาฬิกาปกติ พนักงานเปิดกะได้ตามเดิม', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      await sale(env, 300);
      await closeShift(app);
      loginAs(app, 'staff');
      await openShift(app);
      ok(app.state.shift.active, 'เปิดกะไม่ได้ทั้งที่นาฬิกาปกติ');
    } finally { env.dispose && env.dispose(); }
  });

  // ═══ ข้อ 9: ปิดกะแล้วบันทึกไม่สำเร็จ ระหว่างที่ Telegram ของงานเดิมกำลังส่ง → ห้ามส่งซ้ำ ═══
  await R.t('ข้อ 9: ปิดกะบันทึกล้มระหว่าง Telegram งานเดิมกำลังส่ง — ข้อความเดิมไม่ถูกส่งซ้ำ', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash, rows: { telegramToken: '123:abc', telegramChatId: '-100', googleSheetsUrl: '', googleSheetsApiToken: '' } });
    try {
      await settle();
      app.state.cloudOutbox = [{ id: 'cob-old-telegram', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'OLD-SHIFT', tries: 0 }];
      await app.saveState(); await settle();
      const sent = [];
      let release; const gate = new Promise(r => { release = r; });
      app.postTelegram = async (m) => { sent.push(m); if (m === 'OLD-SHIFT' && sent.filter(x => x === 'OLD-SHIFT').length === 1) await gate; return true; };
      const flushP = app.flushCloudOutbox();       // Telegram ของงานเดิมค้างรอคำตอบ
      await settle(20);
      eq(sent, ['OLD-SHIFT'], 'ยังไม่ได้เริ่มส่งงานเดิม');
      const realSave = app.saveState.bind(app);
      let failNext = true;
      app.saveState = async (o) => {
        if (failNext) {                              // บันทึกปิดกะ: ระหว่างเขียน คำตอบ Telegram กลับมา แล้วการเขียนล้ม
          failNext = false;
          release(); await settle(40);
          return false;
        }
        return realSave(o);
      };
      await closeShift(app);
      ok(app.state.shift.active, 'ปิดกะสำเร็จทั้งที่บันทึกล้ม (เทสต์ตั้งไม่ถูก)');
      await flushP; await settle(40);
      app.saveState = realSave;
      await app.flushCloudOutbox(); await settle(40);
      eq(sent.filter(x => x === 'OLD-SHIFT').length, 1, 'Telegram ของกะเดิมถูกส่งซ้ำ');
      ok(!app.state.cloudOutbox.some(j => j && j.needTelegram), 'ยังมีงาน Telegram ค้าง');
    } finally { env.dispose && env.dispose(); }
  });

  await R.t('ข้อ 9 (ควบคุม): ปิดกะบันทึกล้ม งานสำรองที่ค้างกลับเป็นรุ่น/เวลาเดิม และไม่มีงานใหม่ค้าง', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const nextAt = Date.now() + 9e5;
      app.state.cloudOutbox = [{ id: 'cob-change', createdAt: Date.now(), dateKeys: [], monthKeys: [], needSummary: false,
        needTelegram: false, needBackup: true, quiet: true, reason: 'change', changeKinds: ['void'], backupRev: 2,
        retry: { backup: { tries: 0, nextAt } }, tries: 0 }];
      const realSave = app.saveState.bind(app);
      app.saveState = async () => false;
      await closeShift(app);
      app.saveState = realSave;
      ok(app.state.shift.active, 'ปิดกะสำเร็จทั้งที่บันทึกล้ม');
      eq(app.state.cloudOutbox.length, 1, 'งานของการปิดกะที่ไม่เกิดยังค้างอยู่');
      eq(app.state.cloudOutbox[0].backupRev, 2, 'รุ่นงานสำรองไม่ถูกคืน');
      eq(app.state.cloudOutbox[0].retry.backup.nextAt, nextAt, 'เวลาส่งงานสำรองไม่ถูกคืน');
    } finally { env.dispose && env.dispose(); }
  });

  // ═══ ข้อ 14: เงินคืนลูกค้าเกินเงินในลิ้นชัก ห้ามขึ้นว่า "ค่าใช้จ่าย" ═══
  await R.t('ข้อ 14: ยกเลิกบิลกะก่อน (คืนเงิน) จนเกินลิ้นชัก — หน้าปิดกะ/ประวัติกะ/Telegram บอกว่าเป็นเงินคืน ไม่ใช่ค่าใช้จ่าย', async () => {
    const cash = { 1000: 1 };
    const { env, app } = await makeShop({ cash });
    try {
      await settle();
      const a = await sale(env, 800);
      setCash(cash, 1800); await closeShift(app);
      for (const k in cash) delete cash[k]; cash[100] = 3; await openShift(app);
      app.openTransactionEdit(a.id);
      env.document.getElementById('void-money-outcome').value = 'refunded';
      env.document.getElementById('edit-tx-id').value = a.id;
      await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle(30);
      const calc = app.computeShiftDrawer(app.state.shift);
      eq([calc.expensesTotal, calc.expected, calc.overspend], [0, 0, 500], 'ตัวเลขลิ้นชักเปลี่ยน');
      app.openCashCounter('close');
      const notes = textOf(env.document.getElementById('closing-money-notes').innerHTML);
      ok(!/ค่าใช้จ่าย/.test(notes), 'หน้าปิดกะยังบอกว่าเป็นค่าใช้จ่าย: ' + notes);
      ok(/คืน/.test(notes), 'หน้าปิดกะไม่บอกว่าเป็นเงินคืน: ' + notes);
      const lbl = env.document.getElementById('closing-overspend-label').innerText || '';
      ok(/คืน/.test(lbl) && !/ค่าใช้จ่าย/.test(lbl), 'ป้ายแถวยอดเกินในหน้าปิดกะผิด: ' + lbl);
      for (const k in cash) delete cash[k]; cash[1] = 0;
      await closeShift(app);
      const h = app.state.shift.history.at(-1);
      eq(h.overspend, 500, 'ประวัติกะไม่เก็บยอดเกิน');
      const msg = app.buildShiftReportMessage(h);
      ok(!/ค่าใช้จ่ายจากลิ้นชักเกิน/.test(msg) && /คืน[^\n]*เกิน/.test(msg), 'Telegram ยังบอกว่าค่าใช้จ่ายเกิน');
      app.state.selectedReportType = 'daily';
      env.document.getElementById('report-date-input').value = app.getBusinessISODate(app.shiftAnchorTime(h));
      Object.getPrototypeOf(app).filterReports.call(app);
      const row = textOf(env.document.getElementById('report-shifts-body').innerHTML);
      ok(!/ค่าใช้จ่ายเกินลิ้นชัก/.test(row) && /คืน[^฿]*เกิน/.test(row), 'ตารางประวัติกะยังบอกว่าค่าใช้จ่ายเกิน: ' + row);
    } finally { env.dispose && env.dispose(); }
  });

  await R.t('ข้อ 14 (ควบคุม): ค่าใช้จ่ายจากลิ้นชักเกินจริง ยังบอกว่าเป็นค่าใช้จ่าย', async () => {
    const cash = { 100: 3 };
    const { env, app } = await makeShop({ cash, rows: { shift: { active: true, startTime: Date.now() - 3600e3, startCash: 300, startDetails: {}, expenses: [], history: [] } } });
    try {
      await settle();
      const d = env.document;
      d.getElementById('expense-type').value = 'other'; d.getElementById('expense-amount').value = '500';
      d.getElementById('expense-source').value = 'drawer'; d.getElementById('expense-note').value = 'x';
      await app.addExpense(); await settle(20);
      app.openCashCounter('close');
      const notes = textOf(d.getElementById('closing-money-notes').innerHTML);
      ok(/ค่าใช้จ่าย/.test(notes), 'ค่าใช้จ่ายเกินจริงแต่ไม่บอกว่าเป็นค่าใช้จ่าย: ' + notes);
    } finally { env.dispose && env.dispose(); }
  });

  // ═══ ข้อ 15: ตารางบิลของรายงานรายเดือนต้องมีวันที่ ═══
  await R.t('ข้อ 15: ตารางบิลรายเดือนแสดงวันที่ (บิลต่างวันแยกออก) · รายวันยังแสดงแค่เวลา', async () => {
    const { env, app } = await makeShop({});
    try {
      await settle();
      const P = Object.getPrototypeOf(app);
      const d = env.document;
      const a = await sale(env, 500), b = await sale(env, 700);
      // ย้ายบิลแรกไปอีกวัน (เวลาเดียวกัน) ในเดือนทำการเดียวกันกับบิลที่สอง
      const sameMonthDay = [1, 2, 3, -1, -2, -3].map(k => new Date(b.date).getTime() + k * 86400e3)
        .find(t => app.getBusinessISOMonth(t) === app.getBusinessISOMonth(b.date));
      a.date = new Date(sameMonthDay).toISOString(); if (a.tender) a.tender.at = a.date;
      loginAs(app, 'owner');
      app.state.selectedReportType = 'monthly';
      d.getElementById('report-month-input').value = app.getBusinessISOMonth(b.date);
      P.filterReports.call(app);
      const html = d.getElementById('report-transactions-body').innerHTML;
      const cellOf = tx => { const i = html.indexOf(tx.id); const m = /<td>([^<]*)น\.<\/td>/.exec(html.slice(i)); return m ? m[1].trim() : ''; };
      const ca = cellOf(a), cb = cellOf(b);
      ok(ca && cb && ca !== cb, `บิลต่างวันแยกไม่ออก: "${ca}" / "${cb}"`);
      const dayA = String(new Date(new Date(a.date).getTime() + 7 * 3600e3).getUTCDate());
      ok(new RegExp('(^|\\D)' + dayA + '(\\D|$)').test(ca), `ไม่มีวันที่ของบิล (${dayA}) ในช่อง: "${ca}"`);
      app.state.selectedReportType = 'daily';
      d.getElementById('report-date-input').value = app.getBusinessISODate(b.date);
      P.filterReports.call(app);
      const html2 = d.getElementById('report-transactions-body').innerHTML;
      const m2 = /<td>([^<]*)น\.<\/td>/.exec(html2.slice(html2.indexOf(b.id)));
      ok(m2 && /^\d{1,2}:\d{2}$/.test(m2[1].trim()), 'รายวันไม่ได้แสดงแค่เวลา: ' + (m2 && m2[1]));
    } finally { env.dispose && env.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
