// งานแก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appC · ส่วนงานคลาวด์/Telegram/หน้าตรวจความตรงกัน)
// ข้อ 6 (อ่านคิวงานผ่านคิวบันทึก) · 26 (Telegram ส่งซ้ำ) · 2 (งานสำรองที่หยุดแล้วกลืนงานใหม่) · 27/28 (ข้อความ Telegram)
// 29 (ผลตรวจเขียวทั้งที่อ่านรายชื่อเดือนไม่ได้) · 7 (แถวรุ่นแรกตามเดือนปฏิทิน) · 31 (ส่งทับต้องถาม) · H-10 (เหตุผลในประวัติยกเลิก)
// ใช้แอปจริง + Dexie จริง + Apps Script จริงในชีต/Drive จำลอง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ
process.env.TZ = 'Asia/Bangkok';
const vm = require('vm');
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok, fidb } = require('./harness_db');
const R = makeRunner('--- ตรวจ 19 ต.ค. 2569 · ชุด appC: งานคลาวด์ / Telegram / ตรวจความตรงกัน ---');

const rowsOf = (gas, mk, id) => ((gas.sheet(mk) || {})._grid || []).filter((r, i) => i && r[0] === id);
const sellCut = async (s, price) => { readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price); await s.app.processCheckout(); await settle(15); return s.app.state.transactions.at(-1); };
// Telegram ปลอม — เก็บข้อความที่ส่งออกไป (ที่เหลือไปถึง Apps Script จำลองตามเดิม)
function tgCapture(s) {
  const sent = []; const gasFetch = s.env.ctx.fetch;
  s.env.ctx.fetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
    }
    return gasFetch(url, init);
  };
  return sent;
}
// เขียน IndexedDB ของคีย์นี้ล้ม "ครั้งเดียว" (แบบ request error จริง)
function failNextPut(key) {
  const store = fidb.IDBObjectStore.prototype, orig = store.put; let armed = true;
  store.put = function (value, k) {
    if (armed && value && value.key === key) { armed = false; return this.add(value, k); }
    return orig.apply(this, arguments);
  };
  return () => { store.put = orig; };
}
// จังหวะที่งานถูกเพิ่มลงคิวแล้วแต่ยังบันทึกไม่เสร็จ → ตัวปลุกงานคลาวด์ตื่นพอดี
async function flushWhenQueued(app, pred) {
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setImmediate(r));
    if ((app.state.cloudOutbox || []).some(pred)) return { p: app.flushCloudOutbox() };   // ห่อไว้ — ห้าม await งานส่งตรงนี้
  }
  return null;
}
const TG_ROWS = { telegramToken: '123:abc', telegramChatId: '-100' };
async function tgShop() {
  const s = await makeShop({ rows: TG_ROWS }); await settle(40);
  s.app.state.cloudOutbox = [{ id: 'cob-shift', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
    needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'SHIFT-REPORT', tries: 0 }];
  await s.app.saveState(); await settle();
  s.sent = []; let release; const gate = new Promise(r => { release = r; });
  s.app.postTelegram = async (m) => { s.sent.push(m); if (s.sent.length === 1) await gate; return true; };
  s.release = () => release();
  s.count = () => s.sent.filter(x => x === 'SHIFT-REPORT').length;
  return s;
}
const expiredBackupJob = () => ({ id: 'cob-old-backup', createdAt: Date.now() - 9 * 86400000, dateKeys: [], monthKeys: [], needSummary: false,
  needTelegram: false, needBackup: true, quiet: true, reason: 'midshift', tries: 12,
  retry: { backup: { tries: 12, firstFailAt: Date.now() - 8 * 86400000, lastTry: Date.now() - 3600e3, nextAt: Date.now() - 1, lastError: 'Drive เต็ม' } } });

(async () => {
  // ═══ ข้อ 6: งานที่ยังไม่ลงเครื่องห้ามถูกส่งออกไป ═══
  await R.t('ข้อ6 ยกเลิกบิลบันทึกล้มขณะตัวส่งงานคลาวด์ตื่นพอดี → แถวบนชีตไม่ถูกลบ · ไม่มี Telegram แจ้งยกเลิก', async () => {
    const s = await makeShop(); await settle();
    try {
      const sent = tgCapture(s);
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100'; await s.app.saveState();
      const tx = await sellCut(s, 500);
      await s.app.syncPendingTransactions(true); await settle(40); await s.app.flushCloudOutbox(); await settle(20);
      const mk = s.app.getBusinessMonthKey(tx.date);
      eq(rowsOf(s.gas, mk, tx.id).length, 1);
      const tg0 = sent.length;
      s.app.openTransactionEdit(tx.id);
      s.env.document.getElementById('void-money-outcome').value = 'refunded';
      const undo = failNextPut('transactions');
      const pVoid = s.app.voidTransaction();
      const pFlush = await flushWhenQueued(s.app, j => j && j.needVoidDelete);
      await pVoid; await s.app._confirmP; if (pFlush) await pFlush.p; await settle(80);
      undo();
      ok(pFlush, '(เงื่อนไข) ตัวส่งงานคลาวด์ต้องตื่นระหว่างบันทึก');
      ok(s.app.state.transactions.includes(tx), 'บิลต้องกลับมาในเครื่อง');
      eq(rowsOf(s.gas, mk, tx.id).length, 1, 'แถวบนชีตถูกลบทั้งที่ยกเลิกไม่สำเร็จ');
      eq(sent.length - tg0, 0, 'Telegram แจ้งยกเลิกทั้งที่ยกเลิกไม่สำเร็จ');
      eq(s.app.state.cloudOutbox.filter(j => j.needVoidDelete).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ6 ปิดกะบันทึกล้มขณะตัวส่งตื่นพอดี → ไม่มีรายงานปิดกะ · ปิดกะใหม่สำเร็จ = รายงาน 1 ฉบับพอดี', async () => {
    const s = await makeShop({ cash: { 1000: 1 } }); await settle();
    try {
      const sent = tgCapture(s);
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100'; await s.app.saveState();
      s.app.cashCounterMode = 'close';
      const undo = failNextPut('shift');
      const pClose = s.app.confirmCashCount();
      const pFlush = await flushWhenQueued(s.app, j => j && j.needTelegram);
      await pClose; if (pFlush) await pFlush.p; await settle(80); undo();
      ok(pFlush, '(เงื่อนไข) ตัวส่งงานคลาวด์ต้องตื่นระหว่างบันทึก');
      eq((await s.env.raw('shift')).active, true);
      eq(sent.filter(m => /ปิดกะ/.test(m)).length, 0);
      await s.app.confirmCashCount(); await s.app.flushCloudOutbox(); await settle(80);
      eq((await s.env.raw('shift')).active, false);
      eq(sent.filter(m => /ปิดกะ/.test(m)).length, 1);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ6 (ควบคุม) ยกเลิกบิลปกติ → แถวบนชีตถูกลบ + Telegram แจ้ง 1 ครั้ง (ไม่ติดตาย)', async () => {
    const s = await makeShop(); await settle();
    try {
      const sent = tgCapture(s);
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100'; await s.app.saveState();
      const tx = await sellCut(s, 500);
      await s.app.syncPendingTransactions(true); await settle(40);
      const mk = s.app.getBusinessMonthKey(tx.date);
      s.app.openTransactionEdit(tx.id);
      s.env.document.getElementById('void-money-outcome').value = 'refunded';
      await s.app.voidTransaction(); await s.app._confirmP; await settle(40);
      await s.app.flushCloudOutbox(); await settle(60);
      eq(rowsOf(s.gas, mk, tx.id).length, 0);
      eq(sent.filter(m => /ยกเลิกบิล/.test(m)).length, 1);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 26: Telegram ที่ส่งถึงแล้วต้องไม่ถูกส่งซ้ำ ═══
  await R.t('ข้อ26 ผูกชีตใหม่ (refreshPrimaryStatus) ระหว่างรอคำตอบ Telegram → รายงานส่ง 1 ครั้ง', async () => {
    const s = await tgShop();
    try {
      const p = s.app.flushCloudOutbox(); await settle(20);
      s.app.cloudPost = async () => ({ status: 'success', details: { backendId: 'backend-NEW', registered: false } });
      const r = s.app.refreshPrimaryStatus(); await settle(30); s.release();
      await r; await p; await settle(60);
      await s.app.flushCloudOutbox(); await settle(60);
      eq(s.count(), 1);
      eq((await s.env.raw('cloudOutbox')).filter(j => j.needTelegram).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ26 บันทึกรหัสเชื่อมต่อใหม่ระหว่างรอคำตอบ Telegram → รายงานส่ง 1 ครั้ง', async () => {
    const s = await tgShop();
    try {
      const p = s.app.flushCloudOutbox(); await settle(20);
      const v = (id, val) => { s.env.document.getElementById(id).value = val; };
      v('shop-sheets-api-token', 'N'.repeat(40)); v('shop-sheets-sync-url', s.app.googleSheetsUrl);
      v('shop-telegram-token', s.app.telegramToken); v('shop-telegram-chatid', s.app.telegramChatId);
      const sv = s.app.saveShopSettings(); await settle(30); s.release();
      await sv; await p; await settle(60);
      s.app.googleSheetsApiToken = 'N'.repeat(40);
      await s.app.flushCloudOutbox(); await settle(60);
      eq(s.count(), 1);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ26 ทิ้งงานที่หมดอายุแล้วบันทึกล้ม (คืนคิว) ระหว่างรอคำตอบ Telegram ของงานอื่น → รายงานส่ง 1 ครั้ง · งานที่จะทิ้งยังอยู่', async () => {
    const s = await tgShop();
    try {
      s.app.state.cloudOutbox.push({ id: 'cob-expired', createdAt: Date.now() - 9 * 86400e3, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'OLD-EXPIRED', tries: 0,
        retry: { telegram: { tries: 12, firstFailAt: Date.now() - 9 * 86400e3, stopped: 'TEST' } } });
      await s.app.saveState(); await settle();
      const p = s.app.flushCloudOutbox(); await settle(20);
      const realSave = s.app.saveState.bind(s.app); let failNext = true;
      s.app.saveState = async (o) => { if (failNext) { failNext = false; s.release(); await settle(40); return false; } return realSave(o); };
      await s.app.discardExpiredCloudJob('cob-expired');
      await p; await settle(60); s.app.saveState = realSave;
      eq(s.app.state.cloudOutbox.filter(j => j.needTelegram).map(j => j.id), ['cob-expired']);
      await s.app.flushCloudOutbox(); await settle(60);
      eq(s.count(), 1);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ26 กู้ไฟล์ระหว่างรอคำตอบ Telegram ปิดกะ → งานที่พกไปมี carriedFrom · ส่งถึงแล้วทิ้งสำเนา = รายงานส่ง 1 ครั้ง', async () => {
    const s = await makeShop({ cash: { 1000: 1 } }); await settle();
    try {
      const sent = []; let hold = null; const gasFetch = s.env.ctx.fetch;
      s.env.ctx.fetch = async (url, init) => {
        if (String(url).includes('api.telegram.org')) {
          sent.push(JSON.parse(init.body).text.split('\n')[0]);
          if (!hold) await new Promise(r => { hold = r; });
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
        }
        return gasFetch(url, init);
      };
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100'; await s.app.saveState();
      const file = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      s.app.cashCounterMode = 'close';
      s.app.flushCloudOutbox = async () => {};
      await s.app.confirmCashCount();
      s.app.flushCloudOutbox = Object.getPrototypeOf(s.app).flushCloudOutbox.bind(s.app);
      const orig = s.app.state.cloudOutbox.find(j => j.needTelegram);
      const pFlush = s.app.flushCloudOutbox();
      for (let i = 0; i < 200 && !hold; i++) await new Promise(r => setImmediate(r));
      ok(hold, '(เงื่อนไข) รายงานต้องกำลังส่งอยู่');
      await s.app.applyBackupData(file, { acceptUnsynced: true });
      const carried = s.app.state.cloudOutbox.find(j => j.needTelegram);
      ok(carried && carried.carriedFrom === orig.id, JSON.stringify(carried));
      hold(); await pFlush; await settle(40);
      await s.app.flushCloudOutbox(); await settle(40);
      eq(sent.filter(x => /ปิดกะ/.test(x)).length, 1);
      eq((await s.env.raw('cloudOutbox')).filter(j => j.needTelegram).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ26 (ควบคุม) รายงานที่ยังส่งไม่ออก (ออฟไลน์) แล้วกู้ไฟล์ → สำเนาที่พกไปยังส่งได้ 1 ครั้ง', async () => {
    const s = await makeShop({ cash: { 1000: 1 } }); await settle();
    try {
      const sent = tgCapture(s);
      s.app.telegramToken = '123:ABC'; s.app.telegramChatId = '-100'; await s.app.saveState();
      const file = JSON.parse(JSON.stringify(s.app.buildBackupPayload()));
      s.app.postTelegram = async () => false;
      s.app.cashCounterMode = 'close'; await s.app.confirmCashCount(); await s.app.flushCloudOutbox(); await settle(40);
      delete s.app.postTelegram;
      await s.app.applyBackupData(file, { acceptUnsynced: true });
      ok(s.app.state.cloudOutbox.some(j => j.needTelegram && j.carriedFrom), JSON.stringify(s.app.state.cloudOutbox));
      await s.app.flushCloudOutbox(); await settle(60);
      eq(sent.filter(m => /ปิดกะ/.test(m)).length, 1);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 2: งานสำรองที่หยุดส่งแล้วต้องไม่กลืนคำขอสำรองใหม่ ═══
  await R.t('ข้อ2 งานสำรองหยุดส่งแล้ว (ล้ม 8 วัน) → ขาย 6 บิล + ปิดกะ: ไฟล์สำรองขึ้น Drive · รายการ "หยุดส่ง" ไม่ค้างงานนี้', async () => {
    const s = await makeShop({ cash: { 1000: 1, 100: 15 } }); await settle();
    try {
      s.app.state.cloudOutbox = [expiredBackupJob()];
      s.app.backupStatus = { lastAttemptAt: Date.now() - 3600e3, lastOk: false, lastMessage: 'Drive เต็ม', lastSuccessAt: Date.now() - 8 * 86400000 };
      await s.app.saveState();
      eq(s.app.expiredCloudJobs().length, 1, '(เงื่อนไข) งานหมดอายุ');
      const files = () => { const f = s.gas.DriveApp._folders['Erotica_POS_Backups']; return f ? f._files.filter(x => !x.isTrashed()).length : 0; };
      for (let i = 0; i < 6; i++) await sellCut(s, 300);
      s.app.cashCounterMode = 'close'; await s.app.confirmCashCount(); await s.app.flushCloudOutbox(); await settle(60);
      await s.app.resumePendingCloudWork(); await settle(60);
      ok(files() >= 1, 'ต้องมีไฟล์สำรองขึ้น Drive');
      eq(s.app.expiredCloudJobs().filter(x => x.svcs.includes('backup')).length, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ2 แก้/ยกเลิกบิล (planChangeBackup) กับงานที่หยุดส่งแล้ว → เริ่มลองส่งใหม่ (ไม่หมดอายุ) · บริการอื่นที่หยุดยังรอเจ้าของ', async () => {
    const s = await makeShop(); await settle();
    try {
      const job = expiredBackupJob();
      job.needTelegram = true; job.telegramMessage = 'X';
      job.retry.telegram = { tries: 12, firstFailAt: Date.now() - 9 * 86400000, nextAt: Date.now() - 1 };
      s.app.state.cloudOutbox = [job];
      const r = s.app.planChangeBackup('edit');
      ok(r === job, 'ต้องรวมเข้างานเดิม (มีงานสำรองได้ทีละงาน)');
      eq(s.app.isCloudJobExpired(job, 'backup'), false);
      eq(job.retry.backup.tries, 0);
      eq(s.app.expiredCloudJobs().map(x => x.svcs), [['telegram']]);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 27: รายงานปิดกะแยก "บิลรอตรวจ (ขัดแย้งกับชีต)" กับ "บิลข้อมูลเงินเสีย" ═══
  await R.t('ข้อ27 รายงานปิดกะ: บิลขัดแย้งกับชีตบอกแยก (นับในยอดแล้ว) · บิลข้อมูลเงินเสียชื่อใหม่ · ยอดรวมไม่เปลี่ยน', async () => {
    const s = await makeShop(); await settle();
    try {
      const start = s.app.state.shift.startTime;
      const a = await sellCut(s, 300), b = await sellCut(s, 500);
      b.syncStatus = 'conflict'; b.syncIssue = { kind: 'conflict', code: 'ALREADY_VOIDED' };
      s.app.state.transactions.push(Object.assign({}, a, { id: 'TX-BAD-1', discount: 33.333, total: 266.667, date: new Date().toISOString() }));
      const msg = s.app.buildShiftReportMessage({ startTime: start, endTime: Date.now() + 1000, expenses: [], expensesTotal: 0,
        startCash: 1000, cashSales: 800, expectedCash: 1800, countedCash: 1800, difference: 0 });
      ok(/ยอดขายรวม \(สุทธิ\): ฿800\b/.test(msg), msg);
      ok(/⚠️ บิลรอตรวจ \(ขัดแย้งกับชีต · นับในยอดแล้ว\): 1 ใบ ฿500/.test(msg), msg);
      ok(/⚠️ บิลข้อมูลเงินเสีย \(ไม่นับในยอด\): 1 ใบ/.test(msg), msg);
      ok(!/ไม่นับในยอดขายด้านบน/.test(msg));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 28 + H-10: แจ้งยกเลิกบิลใน Telegram ═══
  await R.t('ข้อ28 แจ้งยกเลิก: เงินคืนนอกกะ · ป้ายผลทางเงินชุดใหม่ · ชื่อยาวถูกตัด · ไม่เกินเพดานความยาว', async () => {
    const s = await makeShop(); await settle();
    try {
      const m1 = s.app.buildVoidAlertMessage({ billId: 'TX-1', date: Date.now(), amount: 300, customer: 'ก', by: 'ข',
        moneyOutcome: 'refunded', cashEffect: 0, cashRefundUnattributed: 300 });
      ok(/คืนเงินสดนอกกะ .*: ฿300/.test(m1), m1);
      ok(/เอาเงินของบิลนี้ออกจากยอดที่ควรมี \(คืนเงินสดแล้ว · บิลซ้ำ · ออกใบใหม่แทน\)/.test(m1), m1);
      const m2 = s.app.buildVoidAlertMessage({ billId: 'TX-2', date: Date.now(), amount: 300, customer: 'ก', by: 'ข', moneyOutcome: 'none' });
      ok(/เงินของบิลนี้ยังอยู่ที่ร้าน/.test(m2) && !/คืนเงินสดนอกกะ/.test(m2), m2);
      const long = s.app.buildVoidAlertMessage({ billId: 'TX-3', date: Date.now(), amount: 300, customer: '<'.repeat(3000), by: '&'.repeat(3000),
        moneyOutcome: 'refunded', note: 'x'.repeat(5000) });
      ok(long.length <= 4000, 'ยาว ' + long.length);
      ok(/…/.test(long));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 29: ผลตรวจความตรงกัน — ห้ามขึ้นเขียวเมื่อเดือนที่มีเฉพาะบนชีตยังไม่ถูกตรวจ ═══
  const reconcileShop = async () => {
    const s = await makeShop(); await settle();
    const P = Object.getPrototypeOf(s.app);
    s.app.renderReconcileResult = P.renderReconcileResult.bind(s.app);
    s.app.setReconcileStatus = P.setReconcileStatus.bind(s.app);
    s.app._ownerKey = s.gas.setupOwnerKey();
    s.html = () => s.env.document.getElementById('reconcile-body').innerHTML;
    return s;
  };
  await R.t('ข้อ29 อ่านรายชื่อเดือนบนชีตไม่ได้ (เน็ตสะดุด) → ไม่ขึ้นเขียว "ตรงกัน" · บอกว่าตรวจได้เฉพาะเดือนที่มีในเครื่อง', async () => {
    const s = await reconcileShop();
    try {
      await sellCut(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const lost = s.gas.lose(p => p && p.action === 'list_bill_months');
      await s.app.runCloudReconcile(); lost.stop();
      ok(s.app._reconcile.cloudMonthsError, '(เงื่อนไข) อ่านรายชื่อเดือนไม่ได้');
      ok(!/ข้อมูลในเครื่องกับบนชีตตรงกัน/.test(s.html()), 'ขึ้นเขียวทั้งที่ตรวจไม่ครบ');
      ok(/ยังสรุปไม่ได้ว่าตรงกัน/.test(s.html()) && /ตรวจได้เฉพาะเดือนที่มีในเครื่อง/.test(s.html()));
      ok(/ตรวจไม่ครบ/.test(s.env.document.getElementById('reconcile-status').innerText));
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ29 Apps Script รุ่นเก่า (ไม่รู้จักคำสั่งรายชื่อเดือน) → สีเหลือง "ตรวจได้เฉพาะเดือนที่มีในเครื่อง" ไม่ใช่เขียว · (ควบคุม) ปกติ = เขียว', async () => {
    const s = await reconcileShop();
    try {
      await sellCut(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      await s.app.runCloudReconcile();
      ok(/ข้อมูลในเครื่องกับบนชีตตรงกัน/.test(s.html()), '(ควบคุม) ' + s.html().slice(0, 200));
      const real = s.app.cloudPost.bind(s.app);
      s.app.cloudPost = async (action, ...a) => action === 'list_bill_months'
        ? { status: 'error', code: 'INVALID_ACTION', message: 'ไม่รู้จักคำสั่ง' } : real(action, ...a);
      await s.app.runCloudReconcile();
      ok(!/ข้อมูลในเครื่องกับบนชีตตรงกัน/.test(s.html()), s.html().slice(0, 300));
      ok(/ตรวจได้เฉพาะเดือนที่มีในเครื่อง/.test(s.html()));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 7: แถวรุ่นแรกที่ Apps Script เขียนตามเดือนปฏิทิน ═══
  // บิลขาย 01:30 ของวันที่ 1 ก.ค. (วันทำการ = 30 มิ.ย.) · แถวอยู่แท็บ 07-2026 (ตั้งค่าแบบเดียวกับ test_codex_cloud_20261017)
  const legacyShop = async () => {
    const date = '2026-07-01T01:30:00+07:00', dest = '07-2026';
    const s = await reconcileShop();
    s.env.ctx.__fixNow = Date.parse(date);
    vm.runInContext('Date = class extends Date { constructor(...a) { super(...(a.length ? a : [__fixNow])); } static now() { return __fixNow; } }', s.env.ctx);
    s.app.state.shift.startTime = Date.parse(date) - 3600000;
    readyCheckout(s.env, [{ id: 's1', name: 'Service', price: 500 }], 'cash', 500);
    await s.app.processCheckout(); await s.app.syncPendingTransactions(true); await settle(25);
    const tx = s.app.state.transactions.at(-1), month = s.app.getBusinessMonthKey(tx.date);
    const src = s.gas.sheet(month); let dst = s.gas.sheet(dest);
    if (!dst) { dst = s.gas.ss.insertSheet(dest); dst.appendRow(src._grid[0].slice()); }
    dst._grid.push(src._grid.splice(src._grid.findIndex(r => r[0] === tx.id), 1)[0]);
    s.gas.sheet('_POS_BILL_INDEX')._grid.find(r => r[0] === tx.id)[1] = dest;
    Object.assign(s, { tx, month, dest });
    return s;
  };
  await R.t('ข้อ7 แถวรุ่นแรก (00:00–05:59 วันที่ 1 ในแท็บเดือนถัดไป) = แถวของบิลเอง: ไม่ใช่ "ผิดแท็บ" ไม่ใช่ "หาย" · ไม่มีคำแนะนำให้ลบเอง', async () => {
    const s = await legacyShop();
    try {
      eq([rowsOf(s.gas, s.month, s.tx.id).length, rowsOf(s.gas, s.dest, s.tx.id).length], [0, 1], '(เงื่อนไข)');
      await s.app.runCloudReconcile();
      const r = s.app._reconcile;
      eq(r.wrongTab.length, 0); eq(r.missing.filter(m => !m.pending).length, 0); eq(r.mismatch.length, 0);
      ok(!/ลบแถวนี้ในชีตด้วยมือ/.test(s.html()) && !/ให้แถวไปลงแท็บที่ถูกต้อง/.test(s.html()));
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ7 แถวรุ่นแรกถูกแก้บนชีต → ขึ้น "ข้อมูลไม่ตรงกัน" (เทียบกับแถวนั้น) · ส่งทับแล้วแถวเดิมถูกแก้ในที่ (Apps Script) ตรวจใหม่ตรงกัน', async () => {
    const s = await legacyShop();
    try {
      s.gas.sheet(s.dest)._grid.find(r => r[0] === s.tx.id)[2] = 'ชื่อที่แก้บนชีต';
      await s.app.runCloudReconcile();
      const mm = s.app._reconcile.mismatch.find(x => x.id === s.tx.id);
      ok(mm && mm.monthKey === s.dest, JSON.stringify(s.app._reconcile.mismatch));
      await s.app.reconcileResendBill(s.tx.id); await settle(40);
      eq(rowsOf(s.gas, s.dest, s.tx.id).length, 1); eq(rowsOf(s.gas, s.month, s.tx.id).length, 0);
      await s.app.runCloudReconcile();
      eq([s.app._reconcile.mismatch.length, s.app._reconcile.wrongTab.length, s.app._reconcile.missing.length], [0, 0, 0]);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ7 บิลมีแถวในแท็บเดือนจริงด้วย → แถวในแท็บถัดไปเป็นแถวเกินจริง: ยังอยู่กลุ่ม "คนละแท็บ" พร้อมบอกว่ามีแถวในเดือนจริงแล้ว', async () => {
    const s = await legacyShop();
    try {
      const copy = s.gas.sheet(s.dest)._grid.find(r => r[0] === s.tx.id).slice();
      s.gas.sheet(s.month)._grid.push(copy);
      await s.app.runCloudReconcile();
      const w = s.app._reconcile.wrongTab.find(x => x.id === s.tx.id);
      ok(w && w.ownRowToo === true && w.monthKey === s.dest, JSON.stringify(s.app._reconcile.wrongTab));
      ok(/มีแถวในแท็บเดือนจริงแล้ว/.test(s.html()));
      ok(!/ลบแถวนี้ในชีตด้วยมือ/.test(s.html()));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 31 + H-10: ส่งยอดในเครื่องทับ ต้องถามทีละช่อง · ลบแถวจากหน้าตรวจ มีเหตุผลในประวัติยกเลิก ═══
  await R.t('ข้อ31 "ส่งยอดในเครื่องทับ" ถามก่อน (บนชีต → ในเครื่อง ทีละช่อง) · ยกเลิก = แถวบนชีตไม่ถูกแตะ · ยืนยัน = ทับ', async () => {
    const s = await reconcileShop();
    try {
      const a = await sellCut(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const mk = s.app.getBusinessMonthKey(a.date);
      s.gas.sheet(mk)._grid.find(r => r[0] === a.id)[2] = 'ชื่อที่แก้บนชีต';
      await s.app.runCloudReconcile();
      const asked = []; s.app.askConfirm = async (m) => { asked.push(m); return false; };
      await s.app.reconcileResendBill(a.id); await settle(30);
      ok(asked.length === 1 && /ลูกค้า: บนชีต ชื่อที่แก้บนชีต → ในเครื่อง /.test(asked[0]), JSON.stringify(asked));
      eq(rowsOf(s.gas, mk, a.id)[0][2], 'ชื่อที่แก้บนชีต');
      s.app.askConfirm = async () => true;
      await s.app.reconcileResendBill(a.id); await settle(30);
      ok(rowsOf(s.gas, mk, a.id)[0][2] !== 'ชื่อที่แก้บนชีต');
    } finally { s.env.dispose(); }
  });

  await R.t('H-10 ลบแถวบนชีตจากหน้าตรวจความตรงกัน → ประวัติยกเลิกมีเหตุผล "ลบแถวจากหน้าตรวจความตรงกัน"', async () => {
    const s = await reconcileShop();
    try {
      const a = await sellCut(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const old = Object.assign(JSON.parse(JSON.stringify(a)), { id: 'TX-1786000000000-SHEETONLY' });
      eq(s.gas.post(s.app.buildBillPayload(old)).status, 'success');
      await s.app.runCloudReconcile();
      ok(s.app._reconcile.extra.some(x => x.id === old.id), '(เงื่อนไข) แถวเกินบนชีต');
      s.app.reconcileDeleteSheetBill(old.id); await s.app._confirmP; await settle(60);
      const v = (s.app.state.voidLog || []).find(x => x.billId === old.id);
      ok(v && v.reason === 'ลบแถวจากหน้าตรวจความตรงกัน', JSON.stringify(v));
      eq(s.app.voidReasonText(v), 'ลบแถวจากหน้าตรวจความตรงกัน');
    } finally { s.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
