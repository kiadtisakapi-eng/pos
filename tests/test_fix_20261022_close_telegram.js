// แก้ 22 ต.ค. 2569 — ปัญหาจากการใช้งานจริง 2 ข้อ (iPad รุ่น 1.12.0)
//   [A] ปิดกะแล้ว "กลับหน้าแดชบอร์ดเฉย ๆ ไม่เด้งหน้าเปิดกะ ต้องปัดแอปทิ้งแล้วเข้าใหม่"
//       → ทุกบทบาทออกจากระบบทันทีหลังปิดกะ (รวมบัญชีสิทธิ์เจ้าของ) · ออกจากระบบ "ก่อน" งานวาดจอ (งานวาดพังต้องไม่ข้ามการออก)
//         · หน้าเข้าสู่ระบบขึ้นเสมอแม้งานวาดป้ายสิทธิ์/รายชื่อพัง · คนถัดไปเข้าระบบ → ระบบเด้งหน้านับเงินเปิดกะ
//   [B] "ส่งสรุป Telegram ล่าช้า" — เดิมข้อความรอคิวหลังบิลค้าง/ไฟล์สำรอง/สรุปวัน-เดือนบนชีต (~1 นาที)
//       → Telegram ส่งเส้นของตัวเองทันทีหลังปิดกะ/เปิดแอป ไม่รองานชีต · ไม่ส่งซ้ำ · ล้มแล้วตัวนับลองใหม่ลงเครื่อง
//         · เหตุผลที่ล้มของ Telegram กับของชีตไม่ปนกัน (สองเส้นวิ่งพร้อมกันได้แล้ว)
// ใช้แอปจริง + Dexie จริง + Apps Script จริงในชีต/Drive จำลอง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ
// พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> node tests/test_fix_20261022_close_telegram.js → ต้องตก
process.env.TZ = 'Asia/Bangkok';
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- แก้ 22 ต.ค. 2569: ปิดกะแล้วค้าง · Telegram ล่าช้า ---');

const TG_ROWS = { telegramToken: '123456789:' + 'A'.repeat(35), telegramChatId: '-1001234567' };
// Telegram ปลอม — เก็บข้อความที่ส่งออกไป (คำขออื่นไปถึง Apps Script จำลองตามเดิม) · ตั้งคำตอบ/ความหน่วงได้
function tgCapture(s, opt) {
  opt = opt || {};
  const sent = []; const gasFetch = s.env.ctx.fetch;
  s.env.ctx.fetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body).text);
      if (opt.delayMs) await new Promise(r => setTimeout(r, opt.delayMs));
      if (opt.reject) throw new TypeError('Failed to fetch');
      const body = opt.reply || { ok: true, result: {} };
      const status = opt.status || 200;
      return { ok: status === 200, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
    }
    return gasFetch(url, init);
  };
  return sent;
}
const sell = async (s, price) => { readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price); await s.app.processCheckout(); await settle(15); };
const closeShift = async (s) => { s.app.cashCounterMode = 'close'; await s.app.confirmCashCount(); };
const waitFor = async (pred, ms) => { for (let i = 0; i < (ms || 2000) / 10; i++) { if (pred()) return true; await settle(10); } return pred(); };
const shiftJob = (app) => (app.state.cloudOutbox || []).find(j => j && /รายงานสรุปปิดกะ/.test(String(j.telegramMessage || '')));
const actionOf = (b) => b && b.action;

(async () => {
  // ═══════════════════════════════ [B] Telegram ไม่รอคิวชีต ═══════════════════════════════
  await R.t('[B1] ปิดกะขณะสรุปวัน/เดือนบนชีตยังไม่ตอบ → Telegram ออกทันที ไม่รอชีต', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s);
      await sell(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const held = s.gas.hold(b => /^summary_/.test(String(actionOf(b))));
      await closeShift(s);
      await waitFor(() => held.count > 0 && sent.length > 0, 1500);
      ok(held.count > 0, '(เงื่อนไข) คำขอสรุปบนชีตต้องค้างอยู่');
      eq(sent.filter(m => /รายงานสรุปปิดกะ/.test(m)).length, 1, 'Telegram ต้องออกระหว่างที่ชีตยังไม่ตอบ');
      held.releaseAll(); await settle(150);
    } finally { s.env.dispose(); }
  });

  await R.t('[B2] ไฟล์สำรองระหว่างกะกำลังอัปโหลด (ค้าง) ตอนปิดกะ → Telegram ไม่รอให้อัปโหลดจบ', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s);
      const held = s.gas.hold(b => actionOf(b) === 'backup');
      for (let i = 0; i < 5; i++) await sell(s, 300);   // ครบ 5 บิล = คิวสำรองระหว่างกะ แล้วเริ่มอัปโหลด
      await waitFor(() => held.count > 0, 1500);
      ok(held.count > 0, '(เงื่อนไข) ไฟล์สำรองระหว่างกะต้องค้างกลางทาง');
      await closeShift(s);
      await waitFor(() => sent.length > 0, 1500);
      eq(sent.filter(m => /รายงานสรุปปิดกะ/.test(m)).length, 1, 'Telegram ต้องไม่รอไฟล์สำรองที่ค้าง');
      held.releaseAll(); await settle(200);
    } finally { s.env.dispose(); }
  });

  await R.t('[B3] เปิดแอปใหม่โดยมี Telegram ค้าง + บิลยังไม่ขึ้นชีต (ชีตช้า) → Telegram ออกก่อน ไม่รอบิล', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s);
      const heldTx = s.gas.hold(b => actionOf(b) === 'transaction');
      await sell(s, 300); await settle(30);   // บิลค้างส่ง (ชีตยังไม่ตอบ)
      s.app.state.cloudOutbox.push({ id: 'cob-old-close', createdAt: Date.now() - 8 * 3600e3, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'ค้างจากปิดกะเมื่อคืน', tries: 0 });
      await s.app.saveState();
      s.app.resumePendingCloudWork();   // เหมือนเปิดแอป/กลับเข้าแอป/เน็ตกลับ
      await waitFor(() => sent.includes('ค้างจากปิดกะเมื่อคืน'), 1500);
      ok(heldTx.count > 0, '(เงื่อนไข) คำขอส่งบิลต้องค้างอยู่');
      ok(sent.includes('ค้างจากปิดกะเมื่อคืน'), 'Telegram ที่ค้างต้องออกโดยไม่รอส่งบิล');
      await waitFor(() => !s.app.state.cloudOutbox.some(j => j.id === 'cob-old-close' && j.needTelegram), 1000);
      const raw = await s.env.raw('cloudOutbox');
      ok(!(raw || []).some(j => j.id === 'cob-old-close' && j.needTelegram), 'ส่งแล้วต้องบันทึก "ส่งแล้ว" ลงเครื่องทันที (ไม่รอบิล)');
      heldTx.releaseAll(); await settle(150);
    } finally { s.env.dispose(); }
  });

  await R.t('[B4] ปิดกะแล้วมีหลายทางเรียกส่งพร้อมกัน (ปิดกะ · รอบส่งงานคลาวด์ ×2 · เปิดแอป) → ข้อความปิดกะออกครั้งเดียว', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s, { delayMs: 30 });
      await sell(s, 300); await settle(20);
      await closeShift(s);
      const ps = [s.app.flushCloudOutbox(), s.app.flushCloudOutbox()];
      s.app.resumePendingCloudWork();
      await Promise.all(ps.map(p => Promise.resolve(p).catch(() => {}))); await settle(300);
      await s.app.flushCloudOutbox(); await settle(100);
      eq(sent.filter(m => /รายงานสรุปปิดกะ/.test(m)).length, 1, 'ข้อความปิดกะต้องออกครั้งเดียว');
      const raw = await s.env.raw('cloudOutbox');
      ok(!(raw || []).some(j => j && j.needTelegram), 'ในเครื่องต้องไม่มี Telegram ค้างส่งแล้ว');
    } finally { s.env.dispose(); }
  });

  await R.t('[B5] Telegram ล้ม (token ใช้ไม่ได้) → งานยังค้าง · ตัวนับลองใหม่+เวลานัดถัดไปลงเครื่อง · สาเหตุไม่ปนกับงานชีต', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      tgCapture(s, { status: 401, reply: { ok: false, error_code: 401, description: 'Unauthorized' }, delayMs: 40 });
      await sell(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      s.gas.networkDown = true;   // ชีตล่มพร้อมกัน — งานสรุปล้มด้วยเหตุผลของชีต
      await closeShift(s);
      await settle(400);
      const job = shiftJob(s.app);
      ok(job && job.needTelegram, 'งาน Telegram ต้องยังค้าง (ล้ม)');
      const r = job.retry || {};
      ok(r.telegram && r.telegram.tries === 1 && r.telegram.nextAt > Date.now(), 'ตัวนับลองใหม่ของ Telegram: ' + JSON.stringify(r.telegram));
      ok(/Token/.test(String(r.telegram.lastError || '')), 'สาเหตุของ Telegram ต้องบอกเรื่อง Token: ' + r.telegram.lastError);
      ok(!r.summary || !/Telegram|Token/.test(String(r.summary.lastError || '')), 'สาเหตุของงานสรุปต้องไม่ใช่ของ Telegram: ' + JSON.stringify(r.summary));
      const raw = await s.env.raw('cloudOutbox');
      const rj = (raw || []).find(j => j.id === job.id);
      ok(rj && rj.retry && rj.retry.telegram && rj.retry.telegram.tries === 1, 'ตัวนับลองใหม่ต้องลงเครื่อง: ' + JSON.stringify(rj && rj.retry));
      s.gas.networkDown = false;
    } finally { s.env.dispose(); }
  });

  await R.t('[B5b] มีแต่งาน Telegram ในคิว (ไม่มีงานชีตให้ส่ง) แล้วส่งไม่ถึง → ตัวนับลองใหม่ลงเครื่องเอง ไม่พึ่งรอบส่งงานชีต', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      tgCapture(s, { reject: true });   // เน็ตไป Telegram ไม่ได้
      s.app.state.cloudOutbox = [{ id: 'cob-tg', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'ONLY-TG', tries: 0 }];
      await s.app.saveState(); await settle();
      await s.app.flushTelegramNow(); await settle(30);
      const raw = await s.env.raw('cloudOutbox');
      const rj = (raw || []).find(j => j.id === 'cob-tg');
      ok(rj && rj.needTelegram && rj.retry && rj.retry.telegram && rj.retry.telegram.tries === 1 && rj.retry.telegram.nextAt > Date.now(),
        'ตัวนับลองใหม่ต้องลงเครื่อง: ' + JSON.stringify(rj));
      ok(/Telegram/.test(String(rj.retry.telegram.lastError || '')), 'บอกสาเหตุ: ' + rj.retry.telegram.lastError);
    } finally { s.env.dispose(); }
  });

  await R.t('[B6] ส่งถึงแล้วแต่ข้อมูลถูกแทนทั้งชุดระหว่างรอคำตอบ → นับว่าส่งแล้ว ไม่ส่งซ้ำ (กติกาเดิม ข้อ 26)', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-x', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'REPORT-X', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = []; let release; const gate = new Promise(r => { release = r; });
      s.app.postTelegram = async (m) => { sent.push(m); await gate; return true; };
      const p = s.app.flushTelegramNow();
      await waitFor(() => sent.length === 1, 500);
      s.app._dataGeneration++;   // ข้อมูลถูกแทนทั้งชุดระหว่างรอคำตอบ (กู้ไฟล์/ผูกชีตใหม่)
      release(); await p; await settle(50);
      const job = s.app.state.cloudOutbox.find(j => j.id === 'cob-x');
      ok(job && job.needTelegram === false, 'ต้องนับว่าส่งแล้ว');
      await s.app.flushTelegramNow(); await settle(20);
      eq(sent.length, 1, 'ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B7] ยกเลิกบิลระหว่างไฟล์สำรองกำลังอัปโหลด (ค้าง) → Telegram แจ้งยกเลิกออกทันที ไม่รองานชีต', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s);
      await sell(s, 300); await s.app.syncPendingTransactions(true); await settle(30);
      const tx = s.app.state.transactions.at(-1);
      const held = s.gas.hold(b => actionOf(b) === 'backup');
      s.app.state.cloudOutbox.push({ id: 'cob-up', createdAt: Date.now(), dateKeys: [], monthKeys: [], needSummary: false,
        needTelegram: false, needBackup: true, quiet: true, reason: 'midshift', tries: 0 });
      await s.app.saveState();
      const pUp = s.app.flushCloudOutbox();   // ไฟล์สำรองเริ่มอัปโหลด แล้วค้าง
      await waitFor(() => held.count > 0, 1500);
      ok(held.count > 0, '(เงื่อนไข) ไฟล์สำรองต้องค้างกลางทาง');
      s.app.openTransactionEdit(tx.id);
      s.env.document.getElementById('void-money-outcome').value = 'refunded';
      await s.app.voidTransaction(); await s.app._confirmP;
      await waitFor(() => sent.length > 0, 1500);
      ok(!s.app.state.transactions.includes(tx), '(เงื่อนไข) ยกเลิกบิลสำเร็จ');
      eq(sent.length, 1, 'Telegram แจ้งยกเลิกต้องออกโดยไม่รอไฟล์สำรอง');
      held.releaseAll(); await pUp; await settle(200);
    } finally { s.env.dispose(); }
  });

  await R.t('[B8] เส้นส่ง Telegram ไม่แตะตัวแปรร่วมของรอบส่งชีต (_cloudFailReason / _cloudTerminalCode) — สองเส้นวิ่งพร้อมกันได้', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      tgCapture(s, { status: 400, reply: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } });
      s.app.state.cloudOutbox = [{ id: 'cob-tg8', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'B8', tries: 0 }];
      await s.app.saveState(); await settle();
      s.app._cloudFailReason = 'เหตุผลของงานชีตที่กำลังส่ง'; s.app._cloudTerminalCode = 'INVALID_SUMMARY';
      await s.app.flushTelegramNow(); await settle(20);
      eq(s.app._cloudFailReason, 'เหตุผลของงานชีตที่กำลังส่ง', 'ห้ามเขียนทับเหตุผลของรอบส่งชีต');
      eq(s.app._cloudTerminalCode, 'INVALID_SUMMARY', 'ห้ามแตะรหัสหยุดงานของรอบส่งชีต');
      const job = s.app.state.cloudOutbox.find(j => j.id === 'cob-tg8');
      ok(/แชท|Chat ID/.test(String(job.retry.telegram.lastError || '')), 'เหตุผลของ Telegram ต้องอยู่ที่งาน Telegram: ' + job.retry.telegram.lastError);
      // ผู้เรียกแบบเดิม (ไม่ส่งที่ฝากเหตุผล) ยังได้เหตุผลทาง _cloudFailReason เหมือนเดิม
      s.app._cloudFailReason = '';
      eq(await s.app.postTelegram('x'), false);
      ok(/แชท|Chat ID/.test(s.app._cloudFailReason), 'ทางเรียกเดิม: ' + s.app._cloudFailReason);
    } finally { s.env.dispose(); }
  });

  await R.t('[B9] ระหว่างส่งข้อความแรก งานถัดไปถูกทิ้ง/ส่งไปแล้ว → ไม่ส่งงานนั้นซ้ำ (อ่านธงล่าสุดทุกงาน)', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = ['M1', 'M2'].map((m, i) => ({ id: 'cob-' + m, createdAt: Date.now() - 60000 + i, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: m, tries: 0 }));
      await s.app.saveState(); await settle();
      const sent = []; let release; const gate = new Promise(r => { release = r; });
      s.app.postTelegram = async (m) => { sent.push(m); if (m === 'M1') await gate; return true; };
      const p = s.app.flushTelegramNow();
      await waitFor(() => sent.length === 1, 500);
      // ระหว่างรอคำตอบของ M1 เจ้าของกด "ทิ้งงานนี้" ที่งาน M2 (หรือเส้นอื่นส่ง M2 ไปแล้ว)
      await s.app.withMutation('ทดสอบ: ทิ้งงาน M2', async () => {
        s.app.state.cloudOutbox.find(j => j.id === 'cob-M2').needTelegram = false; return s.app.saveState();
      });
      release(); await p; await settle(30);
      eq(sent, ['M1'], 'งานที่ถูกทิ้งแล้วห้ามส่ง');
    } finally { s.env.dispose(); }
  });

  // ─── R1 (Codex ตรวจ 22 ต.ค. 2569): ส่งถึงแล้ว แต่บันทึก "ส่งแล้ว" ลงเครื่องล้ม → เปิดแอปใหม่ต้องไม่ส่งซ้ำ ───
  // ทำให้ IndexedDB เขียนคีย์ cloudOutbox ไม่ได้จริง (failPutForKeys) เฉพาะ n ครั้งแรกของ saveState — ครั้งถัดไปเขียนได้ตามปกติ
  const { failPutForKeys } = require('./harness_db');
  const failFirstSaves = (app, n) => {
    const real = app.saveState.bind(app); const results = [];
    app.saveState = async (...a) => {
      const undo = results.length < n ? failPutForKeys(['cloudOutbox'], 'sync') : () => {};
      try { const r = await real(...a); results.push(r); return r; } finally { undo(); }
    };
    return results;
  };
  const okTelegram = (s) => {
    const sent = []; const gasFetch = s.env.ctx.fetch;
    s.env.ctx.fetch = async (url, init) => {
      if (!String(url).includes('api.telegram.org')) return gasFetch(url, init);
      sent.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
    };
    return sent;
  };
  const rawJob = async (s, id) => ((await s.env.raw('cloudOutbox')) || []).find(j => j && j.id === id);
  // เปิดแอปใหม่ = อ่านข้อมูลจากเครื่องกลับมา แล้วส่งงานที่ค้างตามปกติ
  const reopenAndFlush = async (s) => { await s.app.loadState(); await s.app.flushCloudOutbox(); await s.app._mutationChain; await settle(20); };

  await R.t('[B10] R1: ส่งถึงแล้วแต่บันทึกล้มครั้งแรก ขณะงานสรุปชีตยังรอเวลาลองใหม่ → "ส่งแล้ว" ต้องลงเครื่อง · เปิดใหม่ไม่ส่งซ้ำ', async () => {
    const s = await makeShop({ role: 'owner', rows: TG_ROWS }); await settle(60);
    try {
      await s.app._cloudChain; await s.app._mutationChain;
      s.app.state.cloudOutbox = [{ id: 'cob-r1', createdAt: Date.now(), dateKeys: ['2026-10-22'], monthKeys: [],
        needSummary: true, needTelegram: true, needBackup: false, telegramMessage: 'R1-CLOSE', tries: 0,
        retry: { summary: { tries: 1, nextAt: Date.now() + 60000 } } }];
      await s.app.saveState();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 1);
      await s.app.flushCloudOutbox(); await s.app._mutationChain;
      eq(sent, ['R1-CLOSE'], '(เงื่อนไข) ส่งถึงครั้งเดียว');
      ok(saves[0] === false, '(เงื่อนไข) การบันทึกครั้งแรกต้องล้มจริง: ' + JSON.stringify(saves));
      const rj = await rawJob(s, 'cob-r1');
      ok(rj && rj.needTelegram === false, 'ในเครื่องต้องเป็น "ส่งแล้ว": ' + JSON.stringify(rj && { needTelegram: rj.needTelegram }));
      ok(rj && rj.needSummary === true, 'งานสรุปที่ยังรอต้องอยู่ครบ');
      await reopenAndFlush(s);
      eq(sent.length, 1, 'เปิดแอปใหม่ห้ามส่งข้อความเดิมซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B11] R1: แบบเดียวกันแต่งานสรุป/ไฟล์สำรองถูกพัก (เครื่องรอง) → ไม่ส่งซ้ำ', async () => {
    const s = await makeShop({ role: 'owner', rows: TG_ROWS }); await settle(60);
    try {
      await s.app._cloudChain; await s.app._mutationChain;
      s.app.primaryStatus = Object.assign({}, s.app.primaryStatus || {}, { isPrimary: false });
      ok(s.app.isPrimaryBlocked(), '(เงื่อนไข) เครื่องรอง — งานสรุป/สำรองพัก');
      s.app.state.cloudOutbox = [{ id: 'cob-r1b', createdAt: Date.now(), dateKeys: ['2026-10-22'], monthKeys: ['10-2026'],
        needSummary: true, needTelegram: true, needBackup: true, telegramMessage: 'R1-PAUSED', tries: 0 }];
      await s.app.saveState();
      const sent = okTelegram(s);
      failFirstSaves(s.app, 1);
      await s.app.flushCloudOutbox(); await s.app._mutationChain;
      eq(sent, ['R1-PAUSED'], '(เงื่อนไข) ส่งถึงครั้งเดียว');
      const rj = await rawJob(s, 'cob-r1b');
      ok(rj && rj.needTelegram === false && rj.needSummary && rj.needBackup, 'ในเครื่อง: ส่งแล้ว และงานที่พักยังอยู่: ' + JSON.stringify(rj && { t: rj.needTelegram, s: rj.needSummary, b: rj.needBackup }));
      await reopenAndFlush(s);
      eq(sent.length, 1, 'เปิดแอปใหม่ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B12] R1: ทางส่งเดี่ยว (ปิดกะ/ยกเลิกบิล/เปิดแอปเรียก flushTelegramNow) บันทึกล้มครั้งแรก → ลงเครื่องก่อนจบ · ไม่ส่งซ้ำ', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-r1c', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'R1-KICK', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 1);
      await s.app.flushTelegramNow(); await s.app._mutationChain;
      ok(saves[0] === false, '(เงื่อนไข) การบันทึกครั้งแรกต้องล้มจริง: ' + JSON.stringify(saves));
      const rj = await rawJob(s, 'cob-r1c');
      ok(!rj || rj.needTelegram === false, 'ในเครื่องต้องเป็น "ส่งแล้ว" ตั้งแต่จบการส่งเดี่ยว: ' + JSON.stringify(rj && { needTelegram: rj.needTelegram }));
      await reopenAndFlush(s);
      eq(sent, ['R1-KICK'], 'เปิดแอปใหม่ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B12b] R1: ทางส่งเดี่ยว ที่เก็บข้อมูลล้ม 2 ครั้งติด → ตั้งตัวปลุกมาบันทึกซ้ำ · รอบที่ปลุกมาบันทึกได้ · ไม่ส่งซ้ำ', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-r1f', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'R1-KICK2', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 2);   // บันทึกครั้งแรก + บันทึกซ้ำทันที ล้มทั้งคู่
      await s.app._cloudChain; await s.app._mutationChain;
      if (s.app._cloudRetryTimer) { clearTimeout(s.app._cloudRetryTimer); s.app._cloudRetryTimer = null; }
      await s.app.flushTelegramNow(); await s.app._mutationChain;
      ok(saves.length >= 1 && saves.every(x => x === false), '(เงื่อนไข) ที่เก็บข้อมูลล้ม: ' + JSON.stringify(saves));
      ok(!!s.app._cloudRetryTimer, 'ทางส่งเดี่ยวต้องตั้งตัวปลุกมาบันทึกซ้ำเอง');
      await s.app.flushCloudOutbox(); await s.app._mutationChain;   // ตัวปลุกทำงาน (resumePendingCloudWork → flushCloudOutbox)
      const rj = await rawJob(s, 'cob-r1f');
      ok(!rj || rj.needTelegram === false, 'ในเครื่องต้องเป็น "ส่งแล้ว": ' + JSON.stringify(rj && { needTelegram: rj.needTelegram }));
      await reopenAndFlush(s);
      eq(sent, ['R1-KICK2'], 'เปิดแอปใหม่ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B13] R1: ที่เก็บข้อมูลล้ม 2 ครั้งติด (บันทึกครั้งแรก + บันทึกซ้ำทันที) → บันทึกตอนจบรอบส่งงานคลาวด์ แม้งานสรุปยังไม่ถึงเวลา', async () => {
    const s = await makeShop({ role: 'owner', rows: TG_ROWS }); await settle(60);
    try {
      await s.app._cloudChain; await s.app._mutationChain;
      s.app.state.cloudOutbox = [{ id: 'cob-r1d', createdAt: Date.now(), dateKeys: ['2026-10-22'], monthKeys: [],
        needSummary: true, needTelegram: true, needBackup: false, telegramMessage: 'R1-TWICE', tries: 0,
        retry: { summary: { tries: 2, nextAt: Date.now() + 120000 } } }];
      await s.app.saveState();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 2);
      await s.app.flushCloudOutbox(); await s.app._mutationChain;
      ok(saves[0] === false, '(เงื่อนไข) การบันทึกครั้งแรกต้องล้มจริง: ' + JSON.stringify(saves));
      const rj = await rawJob(s, 'cob-r1d');
      ok(rj && rj.needTelegram === false, 'บันทึกตอนจบรอบต้องเก็บ "ส่งแล้ว": ' + JSON.stringify({ saves, needTelegram: rj && rj.needTelegram }));
      ok(saves.length >= 3 && saves[1] === false, '(เงื่อนไข) บันทึกซ้ำทันทีก็ล้ม — ที่ลงเครื่องได้คือการบันทึกตอนจบรอบ: ' + JSON.stringify(saves));
      eq(!!s.app._telegramSentUnsaved, false, 'บันทึกสำเร็จแล้วต้องไม่มีงานบันทึกซ้ำค้าง');
      await reopenAndFlush(s);
      eq(sent.length, 1, 'เปิดแอปใหม่ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B14] R1: มีแต่งาน Telegram และที่เก็บข้อมูลล้มนาน (งานหมดคิวในหน่วยความจำแล้ว) → ตัวปลุกยังมาบันทึกซ้ำ · กลับมาเขียนได้แล้วไม่ส่งซ้ำ', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-r1e', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'R1-LONG', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 3);   // บันทึกครั้งแรก · บันทึกซ้ำทันที · บันทึกตอนจบรอบ — ล้มหมด
      await s.app.flushCloudOutbox(); await s.app._mutationChain;
      ok(saves.length >= 1 && saves.every(x => x === false), '(เงื่อนไข) ที่เก็บข้อมูลล้มทั้งรอบ: ' + JSON.stringify(saves));
      eq((s.app.state.cloudOutbox || []).length, 0, '(เงื่อนไข) ในหน่วยความจำงานหมดคิวแล้ว');
      const before = await rawJob(s, 'cob-r1e');
      ok(before && before.needTelegram === true, '(เงื่อนไข) ในเครื่องยังเป็นรอส่ง');
      ok(!!s.app._cloudRetryTimer, 'ต้องตั้งตัวปลุกมาบันทึกซ้ำ แม้ไม่มีงานอื่นค้าง');
      // ตัวปลุกทำงาน (ที่เก็บข้อมูลกลับมาเขียนได้แล้ว) — resumePendingCloudWork → flushCloudOutbox
      await s.app.flushCloudOutbox(); await s.app._mutationChain;
      const after = await rawJob(s, 'cob-r1e');
      ok(!after || after.needTelegram === false, 'ในเครื่องต้องไม่เหลือข้อความรอส่ง: ' + JSON.stringify(after));
      eq(!!s.app._telegramSentUnsaved, false, 'บันทึกสำเร็จแล้วต้องเลิกปลุก');
      await reopenAndFlush(s);
      eq(sent, ['R1-LONG'], 'เปิดแอปใหม่ห้ามส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B16] ส่งถึงแล้วแต่ข้อมูลถูกแทนทั้งชุด และงานไม่อยู่ในชุดใหม่ → ไม่มีอะไรต้องบันทึก (ไม่เขียนชุดใหม่เพราะงานของชุดเก่า)', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-old', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'OLD-SET', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = []; let release; const gate = new Promise(r => { release = r; });
      s.app.postTelegram = async (m) => { sent.push(m); await gate; return true; };
      const p = s.app.flushTelegramNow();
      await waitFor(() => sent.length === 1, 500);
      // ระหว่างรอคำตอบ ข้อมูลถูกแทนทั้งชุด (เช่นกู้ไฟล์ที่ไม่มีงานนี้)
      await s.app.withMutation('ทดสอบ: แทนข้อมูลทั้งชุด', async () => { s.app._dataGeneration++; s.app.state.cloudOutbox = []; return s.app.saveState(); });
      const saves = failFirstSaves(s.app, 0);
      release(); await p; await s.app._mutationChain; await settle(20);
      eq(saves, [], 'งานของชุดเก่าต้องไม่ทำให้เขียนข้อมูลชุดใหม่');
      eq(!!s.app._telegramSentUnsaved, false, 'ไม่มีงานบันทึกซ้ำค้าง');
      eq(sent, ['OLD-SET']);
    } finally { s.env.dispose(); }
  });

  await R.t('[B15] ตัวควบคุม: บันทึกไม่ล้ม → บันทึก "ส่งแล้ว" ครั้งเดียว ไม่มีบันทึกซ้ำเกิน', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      s.app.state.cloudOutbox = [{ id: 'cob-ok', createdAt: Date.now() - 60000, dateKeys: [], monthKeys: [],
        needSummary: false, needTelegram: true, needBackup: false, telegramMessage: 'OK-ONCE', tries: 0 }];
      await s.app.saveState(); await settle();
      const sent = okTelegram(s);
      const saves = failFirstSaves(s.app, 0);
      await s.app.flushTelegramNow(); await s.app._mutationChain;
      eq(saves, [true], 'บันทึกครั้งเดียว');
      eq(!!s.app._telegramSentUnsaved, false, 'ไม่มีงานบันทึกซ้ำ');
      const rj = await rawJob(s, 'cob-ok');
      ok(rj && rj.needTelegram === false, 'ในเครื่อง "ส่งแล้ว"');
      eq(sent, ['OK-ONCE']);
    } finally { s.env.dispose(); }
  });

  // R1-A: คุมเฉพาะเวลา 30 วินาที แต่เรียก callback ที่ scheduleCloudRetry ตั้งจริง
  // ไม่เรียก flushCloudOutbox ข้าม resumePendingCloudWork — ต้องจับ offline/คิวคลาวด์ค้างได้
  const captureCloudWake = (s) => {
    const ctx = s.env.ctx, realSet = ctx.setTimeout, realClear = ctx.clearTimeout, timers = [];
    ctx.setTimeout = (fn, ms, ...args) => {
      if (ms !== 30000) return realSet(fn, ms, ...args);
      const timer = { active: true, fire: () => fn(...args) }; timers.push(timer); return timer;
    };
    ctx.clearTimeout = timer => {
      if (timers.includes(timer)) timer.active = false; else realClear(timer);
    };
    return {
      get pending() { return timers.filter(t => t.active).length; },
      async fire() {
        const timer = timers.find(t => t.active); ok(timer, 'ต้องมีตัวปลุก 30 วินาที');
        timer.active = false; timer.fire();
        await settle(20); await s.app._mutationChain; await settle(10);
      }
    };
  };
  const prepareUnsavedReceipt = async (failures, fullRound) => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(60);
    await s.app._cloudChain; await s.app._telegramChain; await s.app._mutationChain;
    if (s.app._cloudRetryTimer) { s.env.ctx.clearTimeout(s.app._cloudRetryTimer); s.app._cloudRetryTimer = null; }
    const wake = captureCloudWake(s);
    s.app.state.cloudOutbox = [{ id: 'cob-local-save', createdAt: Date.now(), dateKeys: [], monthKeys: [],
      needTelegram: true, needSummary: false, needBackup: false, telegramMessage: 'LOCAL-SAVE', tries: 0 }];
    await s.app.saveState();
    const sent = okTelegram(s), saves = failFirstSaves(s.app, failures);
    if (fullRound) await s.app.flushCloudOutbox(); else await s.app.flushTelegramNow();
    await s.app._mutationChain;
    ok(saves.length === failures && saves.every(v => v === false), 'ต้องเตรียมการบันทึกที่ล้มจริง: ' + JSON.stringify(saves));
    ok(s.app._telegramSentUnsaved && wake.pending === 1, 'ต้องมีสถานะส่งแล้วค้างบันทึกและตัวปลุก');
    return { s, wake, sent, saves };
  };

  await R.t('[B17] R1-A: ตัวปลุกจริงตื่นตอนออฟไลน์ → บันทึกสถานะในเครื่องได้ ไม่ยิงเครือข่าย · เปิดใหม่ไม่ส่งซ้ำ', async () => {
    const { s, wake, sent, saves } = await prepareUnsavedReceipt(2);
    try {
      const requests = s.gas.requests.length; s.env.ctx.navigator.onLine = false;
      await wake.fire();
      eq(saves, [false, false, true], 'ตัวปลุกต้องลองเขียนทั้งที่ออฟไลน์');
      eq((await rawJob(s, 'cob-local-save')).needTelegram, false, 'ในเครื่องต้องเป็นส่งแล้ว');
      eq(s.gas.requests.length, requests, 'ออฟไลน์ห้ามเริ่มงานชีต');
      eq(wake.pending, 0, 'บันทึกได้แล้วไม่ต้องปลุกซ้ำ');
      await s.app.loadState(); s.env.ctx.navigator.onLine = true;
      await s.app.flushCloudOutbox(); eq(sent.length, 1, 'เปิดใหม่ไม่ส่งซ้ำ');
    } finally { s.env.dispose(); }
  });

  await R.t('[B18] R1-A: ตัวปลุกตื่นขณะคิวคลาวด์ค้าง → สถานะส่งแล้วลงเครื่องก่อนปล่อยคิว', async () => {
    const { s, wake, sent, saves } = await prepareUnsavedReceipt(2);
    let release; const gate = new Promise(r => { release = r; });
    try {
      s.app.runCloudTask(() => gate);
      await wake.fire();
      eq(saves, [false, false, true], 'ต้องไม่รอ runCloudTask');
      eq((await rawJob(s, 'cob-local-save')).needTelegram, false, 'ต้องลงเครื่องทั้งที่คิวยังไม่ตอบ');
      eq(sent.length, 1, 'บันทึกสถานะไม่ใช่ส่งข้อความใหม่');
    } finally {
      release(); await s.app.resumePendingCloudWork(); await s.app._mutationChain; s.env.dispose();
    }
  });

  await R.t('[B19] R1-A: ตัวปลุกออฟไลน์แล้วยังเขียนไม่ได้ → ตั้งรอบถัดไป · รอบถัดไปเขียนได้โดยไม่ต้องเน็ตกลับ', async () => {
    const { s, wake, sent, saves } = await prepareUnsavedReceipt(2);
    try {
      // สองครั้งแรกผ่านไปแล้ว ทำให้การเขียนครั้งถัดไปล้มอีกหนึ่งครั้ง
      const real = s.app.saveState.bind(s.app); let failNext = true;
      s.app.saveState = async (...args) => {
        const undo = failNext ? failPutForKeys(['cloudOutbox'], 'sync') : () => {}; failNext = false;
        try { return await real(...args); } finally { undo(); }
      };
      s.env.ctx.navigator.onLine = false;
      await wake.fire();
      eq(saves, [false, false, false], 'รอบแรกของตัวปลุกต้องลองเขียนและล้มจริง');
      ok(s.app._telegramSentUnsaved && wake.pending === 1, 'ต้องนัดใหม่แม้ออฟไลน์');
      await wake.fire();
      eq(saves, [false, false, false, true], 'รอบถัดไปต้องบันทึกได้');
      eq((await rawJob(s, 'cob-local-save')).needTelegram, false);
      eq(sent.length, 1); eq(wake.pending, 0);
    } finally { s.env.dispose(); }
  });

  await R.t('[B20] R1-A: งานถูกตัดออกจากคิวในหน่วยความจำแล้ว ตัวปลุกออฟไลน์ยังบันทึกได้', async () => {
    const { s, wake, sent, saves } = await prepareUnsavedReceipt(3, true);
    try {
      eq(s.app.state.cloudOutbox.length, 0, '(เงื่อนไข) งานหมดคิวแล้วแต่ยังไม่ลงเครื่อง');
      s.env.ctx.navigator.onLine = false; await wake.fire();
      eq(saves, [false, false, false, true]);
      eq((await s.env.raw('cloudOutbox')).length, 0, 'คิวว่างต้องลงเครื่องจริง');
      eq(!!s.app._telegramSentUnsaved, false); eq(sent.length, 1);
    } finally { s.env.dispose(); }
  });

  await R.t('[B21] R1-A: หน้าต่างรอง/โหลดข้อมูลล้มไม่บันทึกซ้ำ · ได้สิทธิ์และข้อมูลพร้อมแล้วจึงบันทึกแม้ออฟไลน์', async () => {
    const { s, wake, saves } = await prepareUnsavedReceipt(2);
    try {
      s.env.ctx.navigator.onLine = false; s.app.isReadOnlyWindow = true;
      await wake.fire(); eq(saves.length, 2, 'หน้าต่างรองห้ามเขียน');
      s.app.isReadOnlyWindow = false; s.app.loadFailed = true;
      s.app.resumePendingCloudWork(); await settle(20); eq(saves.length, 2, 'โหลดล้มต้องไม่เรียกบันทึก');
      s.app.loadFailed = false; s.app.resumePendingCloudWork();
      await settle(20); await s.app._mutationChain;
      eq(saves, [false, false, true]);
      eq((await rawJob(s, 'cob-local-save')).needTelegram, false);
    } finally { s.env.dispose(); }
  });

  await R.t('[B22] R1-A: ตัวปลุก/เปิดแอปเรียกซ้อนหลังออกจากระบบ → บันทึกครั้งเดียว ไม่ต้องมีผู้ใช้ล็อกอิน', async () => {
    const { s, sent, saves } = await prepareUnsavedReceipt(2);
    try {
      s.env.ctx.navigator.onLine = false; s.app.logout();
      s.app.resumePendingCloudWork(); s.app.resumePendingCloudWork(); s.app.resumePendingCloudWork();
      await settle(20); await s.app._mutationChain;
      eq(saves, [false, false, true], 'งานซ้อนหลังเขียนสำเร็จห้ามเขียนซ้ำ');
      eq((await rawJob(s, 'cob-local-save')).needTelegram, false);
      eq(s.app.currentRole, null); eq(sent.length, 1);
    } finally { s.env.dispose(); }
  });

  // ═══════════════════════════════ [A] หลังปิดกะต้องไปต่อได้เสมอ ═══════════════════════════════
  const loginWatch = (app) => {
    const opened = [];
    app.openModal = (id) => opened.push(id);
    const counters = [];
    app.openCashCounter = (mode) => counters.push(mode);
    return { opened, counters };
  };

  // บัญชีพนักงานที่ตั้งสิทธิ์เป็นเจ้าของ (หน้าร้านเรียก "ผู้จัดการ") — ตรงกับอาการที่ร้านแจ้ง
  const asOwnerLevelStaff = async (s) => {
    s.app.state.staff.push({ id: 'ow-1', name: 'ซี', role: 'ผู้จัดการ', accessLevel: 'owner', pin: await s.app.hashPin('999999') });
    await s.app.saveState();
    s.app.currentUser = { id: 'ow-1', name: 'ซี' }; s.app.currentRole = 'owner';
    s.app.saveSession(); await settle(10);
  };

  await R.t('[A1] บัญชีพนักงานที่ตั้งสิทธิ์เป็นเจ้าของ (หน้าร้านเรียกผู้จัดการ) ปิดกะ → ออกจากระบบ หน้าเข้าสู่ระบบขึ้น (เดิมค้างหน้าแดชบอร์ด)', async () => {
    const s = await makeShop({ role: 'owner' }); await settle(30);
    try {
      await asOwnerLevelStaff(s);
      const w = loginWatch(s.app);
      await sell(s, 300);
      await closeShift(s); await settle(40);
      ok(!s.app.state.shift.active, '(เงื่อนไข) ต้องปิดกะสำเร็จ');
      eq(s.app.currentRole, null, 'ต้องออกจากระบบ');
      ok(w.opened.includes('modal-login'), 'หน้าเข้าสู่ระบบต้องขึ้น: ' + JSON.stringify(w.opened));
      ok(!w.counters.includes('open'), 'ยังไม่เด้งหน้านับเงินเปิดกะทันทีหลังปิด (ข้อ 3 รอบตรวจ 26 ก.ย.)');
      ok(!s.toasts.some(t => t.ty === 'error'), 'ไม่มีข้อความผิดพลาด: ' + JSON.stringify(s.toasts.filter(t => t.ty === 'error')));
      const rec = await s.env.db.state.get('session');
      ok(!(rec && rec.value), 'การล็อกอินที่จำไว้ต้องถูกลบ');
    } finally { s.env.dispose(); }
  });

  await R.t('[A1b] บัญชีเจ้าของร้านหลักปิดกะ → อยู่ในระบบต่อเหมือนเดิม (ทำงานหลังร้าน/กู้ข้อมูลต่อได้) + บอกขั้นต่อไป', async () => {
    const s = await makeShop({ role: 'owner' }); await settle(30);
    try {
      const w = loginWatch(s.app);
      await sell(s, 300);
      await closeShift(s); await settle(700);
      ok(!s.app.state.shift.active, '(เงื่อนไข) ต้องปิดกะสำเร็จ');
      eq(s.app.currentRole, 'owner', 'เจ้าของร้านหลักต้องยังอยู่ในระบบ');
      ok(!w.opened.includes('modal-login'), 'ไม่ขึ้นหน้าเข้าสู่ระบบ');
      ok(s.toasts.some(t => /เปิดกะใหม่ตอนเริ่มขายรอบถัดไป/.test(t.m)), 'ต้องบอกว่าเปิดกะใหม่ตอนไหน');
    } finally { s.env.dispose(); }
  });

  await R.t('[A2] ผู้จัดการปิดกะ แล้วงานวาดหน้าจอพัง → ยังออกจากระบบ หน้าเข้าสู่ระบบขึ้น ไม่มีข้อความ "เกิดข้อผิดพลาด"', async () => {
    const s = await makeShop({ role: 'manager' }); await settle(30);
    try {
      const w = loginWatch(s.app);
      await sell(s, 300);
      s.app.renderAll = () => { throw new Error('วาดหน้าแดชบอร์ดพัง (จำลอง)'); };
      await closeShift(s); await settle(40);
      ok(!s.app.state.shift.active, '(เงื่อนไข) ต้องปิดกะสำเร็จ');
      eq(s.app.currentRole, null, 'ต้องออกจากระบบแม้งานวาดจอพัง');
      ok(w.opened.includes('modal-login'), 'หน้าเข้าสู่ระบบต้องขึ้น');
      ok(!s.toasts.some(t => /เกิดข้อผิดพลาดในการยืนยันยอดเงิน/.test(t.m)), 'ปิดกะลงเครื่องแล้ว ห้ามบอกว่าผิดพลาด (คนจะกดปิดซ้ำ)');
      const rec = await s.env.db.state.get('session');
      ok(!(rec && rec.value), 'การล็อกอินที่จำไว้ต้องถูกลบ (เปิดแอปตอนเช้าต้องใส่ PIN)');
    } finally { s.env.dispose(); }
  });

  await R.t('[A3] หน้าเข้าสู่ระบบขึ้นเสมอ แม้งานวาดป้ายสิทธิ์/รายชื่อผู้ใช้พัง', async () => {
    const s = await makeShop({ role: 'manager' }); await settle(30);
    try {
      const w = loginWatch(s.app);
      s.app.updateUserRoleUI = () => { throw new Error('ป้ายสิทธิ์พัง (จำลอง)'); };
      s.app.renderLoginOptions = () => { throw new Error('รายชื่อพัง (จำลอง)'); };
      let threw = null;
      try { s.app.logout('ทดสอบ'); } catch (e) { threw = e; }
      ok(!threw, 'ออกจากระบบต้องไม่โยน error: ' + (threw && threw.message));
      eq(s.app.currentRole, null);
      ok(w.opened.includes('modal-login'), 'หน้าเข้าสู่ระบบต้องขึ้น');
    } finally { s.env.dispose(); }
  });

  await R.t('[A4] หลังปิดกะ คนถัดไปเข้าระบบ → ระบบเด้งหน้านับเงินเปิดกะเอง (ไม่ต้องปัดแอปทิ้ง)', async () => {
    const s = await makeShop({ role: 'owner' }); await settle(30);
    try {
      await asOwnerLevelStaff(s);
      const w = loginWatch(s.app);
      await sell(s, 300);
      await closeShift(s); await settle(40);
      eq(s.app.currentRole, null, '(เงื่อนไข) ออกจากระบบแล้ว');
      s.app.currentUser = { id: 'st-1', name: 'เอ' }; s.app.currentRole = 'staff';
      s.app.completeLogin();
      ok(w.counters.includes('open'), 'เข้าระบบแล้วต้องเด้งหน้านับเงินเปิดกะ: ' + JSON.stringify(w.counters));
    } finally { s.env.dispose(); }
  });

  await R.t('[A5] ปิดกะไม่สำเร็จ (บันทึกลงเครื่องล้ม) → ยังอยู่ในระบบ หน้านับเงินยังเปิด ไม่ส่ง Telegram (ตัวควบคุม)', async () => {
    const s = await makeShop({ role: 'manager', rows: TG_ROWS }); await settle(30);
    try {
      const sent = tgCapture(s);
      const w = loginWatch(s.app);
      await sell(s, 300); await settle(20);
      const real = s.app.saveState.bind(s.app);
      s.app.saveState = async () => false;   // เขียนลงเครื่องไม่สำเร็จ
      await closeShift(s); await settle(60);
      s.app.saveState = real;
      ok(s.app.state.shift.active, 'กะต้องยังเปิดอยู่');
      eq(s.app.currentRole, 'manager', 'ต้องยังอยู่ในระบบ');
      ok(!w.opened.includes('modal-login'), 'ห้ามขึ้นหน้าเข้าสู่ระบบ');
      eq(sent.filter(m => /รายงานสรุปปิดกะ/.test(m)).length, 0, 'ห้ามส่ง Telegram ของการปิดกะที่ไม่สำเร็จ');
    } finally { s.env.dispose(); }
  });

  R.done();
})();
