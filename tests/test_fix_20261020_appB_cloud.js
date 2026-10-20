// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) — ป้ายสถานะคลาวด์
//   ข้อ 19 ป้ายขึ้น "คลาวด์ออนไลน์ (ตรงกัน)" ทั้งที่มีงานรอส่ง (ยกเลิก/ปิดกะตอนออฟไลน์ · ล้ม 2 ครั้งแรก)
//          → "รอส่งขึ้นคลาวด์ N งาน" · ออฟไลน์ → "ออฟไลน์ — รอส่ง N" · ฟัง event offline · ไม่นับงานสำรองที่ตั้งเวลาไว้
//   ข้อ 20 กดป้ายตอนไม่มีบิลค้าง: ข้อความตามสถานะเดียวกับป้าย + ส่งงานในคิวทันที · ไม่แตะงานที่หยุดส่งแล้ว
//   ข้อ 68 ชีตตอบ REGISTRY_CORRUPT (เฉพาะบิล) → บิลรอตรวจ (ไม่ลองซ้ำตลอดไป)
//  โค้ดจริง (app.js บน IndexedDB จริง + Apps Script จริงในชีตจำลอง) · ป้ายใช้ updateSyncBadgeStatus ตัวจริง
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<v65>/app.js node tests/test_fix_20261020_appB_cloud.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const vm = require('vm');
const { createEnv, makeRunner, eq, ok } = require('./harness_db.js');
const { createGasEnv } = require('./gas_env.js');
const { seed, quiet, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- fix 20 ต.ค. (appB) ข้อ 19 · 20 · 68: ป้ายคลาวด์บอกความจริง · กดป้ายแล้วส่งงานในคิว · ทะเบียนเสียเฉพาะบิล ---');
const t = R.t;
const CUT = [{ id: 's1', name: 'ตัดผม', price: 300 }];
const bkk = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);

function installClock(ctx, startMs) {
  vm.runInContext(`(() => {
    const RealDate = Date; let base = ${Number(startMs)}, anchor = RealDate.now();
    const cur = () => base + (RealDate.now() - anchor);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(cur()); else super(...a); } static now() { return cur(); } }
    globalThis.Date = FakeDate;
    globalThis.__setNow = (ms) => { base = ms; anchor = RealDate.now(); };
  })()`, ctx);
}

async function shopAt(o) {
  o = o || {};
  const gas = createGasEnv();
  const tg = { sent: [], down: false };
  const listeners = {};
  const cash = { 1000: 1 };
  const fetch = async (url, init) => {
    if (/api\.telegram\.org/.test(String(url))) {
      if (tg.down) throw new TypeError('Failed to fetch');
      tg.sent.push(init && init.body);
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
    }
    if (o.intercept) { const r = o.intercept(url, init); if (r) return r; }
    return gas.fetch(url, init);
  };
  const env = createEnv({ fetch, querySelectorAll: (q) => (/cash-qty-input/.test(String(q))
    ? Object.keys(cash).map(d => ({ value: String(cash[d]), getAttribute: (k) => (k === 'data-denom' ? d : null) })) : []) });
  env.ctx.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  installClock(env.ctx, o.now || bkk(2026, 10, 10, 9, 55));
  const toasts = quiet(env.app);
  const app = env.app;
  app.updateSyncBadgeStatus = Object.getPrototypeOf(app).updateSyncBadgeStatus.bind(app);   // ป้ายตัวจริง
  await seed(env, Object.assign({ googleSheetsApiToken: gas.token, telegramToken: '1:a', telegramChatId: '-1',
    shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } }, o.rows || {}));
  await app.init();
  loginAs(app, 'owner');
  const st = await app.cloudPost('register_primary', {}, 15000);
  if (st.status === 'success') await app.notePrimaryStatus(true, st.details && st.details.primary);
  const s = {
    env, app, gas, tg, toasts, listeners, cash,
    setNow: (ms) => vm.runInContext(`__setNow(${Math.round(ms)})`, env.ctx),
    badge: () => { app.checkSyncStatus(); return env.document.getElementById('mobile-sync-text').innerText; },
    details: () => env.document.getElementById('sync-status-details').innerText,
    async open() { app.cashCounterMode = 'open'; await app.confirmCashCount(); await settle(20); },
    async close(amount) { for (const k of Object.keys(cash)) delete cash[k]; cash[1000] = Math.floor(amount / 1000); cash[1] = amount % 1000;
      app.cashCounterMode = 'close'; await app.confirmCashCount(); await settle(40); },
    async sell() { readyCheckout(env, CUT, 'cash', 1000); await app.processCheckout(); await settle(20);
      return app.state.transactions[app.state.transactions.length - 1]; },
    async voidBill(id) { app.openTransactionEdit(id); env.document.getElementById('void-money-outcome').value = 'refunded';
      await app.voidTransaction(); if (app._confirmP) await app._confirmP; await settle(30); },
    async flush() { await app.syncPendingTransactions(true); await app.flushCloudOutbox(); await settle(30); }
  };
  return s;
}
async function onlineShop(o) {
  const s = await shopAt(o);
  s.setNow(bkk(2026, 10, 10, 10, 0)); await s.open();
  s.billA = await s.sell(); s.billB = await s.sell();
  await s.flush();
  return s;
}
const rowsOnSheet = (gas, id) => { const sh = gas.ss.getSheetByName ? gas.ss.getSheetByName('10-2026') : null;
  return sh && sh._grid ? sh._grid.filter(r => r[0] === id).length : -1; };

(async () => {
  // ═══ ข้อ 19 ═════════════════════════════════════════════════════════════
  {
    const s = await onlineShop();
    try {
      await t('19. ส่งครบแล้ว → "คลาวด์ออนไลน์ (ตรงกัน)"', () => eq(s.badge(), 'คลาวด์ออนไลน์ (ตรงกัน)'));
      await t('19. ลงทะเบียนฟัง event "offline" (เน็ตหลุดแล้วป้ายเปลี่ยนทันที)', () => ok((s.listeners.offline || []).length >= 1, Object.keys(s.listeners).join(',')));
      s.env.ctx.navigator.onLine = false;
      await s.voidBill(s.billA.id);
      await t('19. ออฟไลน์ + ยกเลิกบิล (แถวบิลยังอยู่บนชีต) → "ออฟไลน์ — รอส่ง 1" (เดิม "ตรงกัน")', () => {
        ok(!s.app.state.transactions.some(x => x.id === s.billA.id), 'ยกเลิกไม่สำเร็จ');
        eq(s.badge(), 'ออฟไลน์ — รอส่ง 1');
        ok(/ออฟไลน์/.test(s.details()) && /1 รายการ/.test(s.details()), s.details());
      });
      (s.listeners.offline || []).forEach(fn => fn());
      await t('19. event offline → ป้ายบอกออฟไลน์', () => eq(s.env.document.getElementById('mobile-sync-text').innerText, 'ออฟไลน์ — รอส่ง 1'));
      s.env.ctx.navigator.onLine = true;
      await t('19. เน็ตกลับแต่ยังไม่ได้ส่ง → "รอส่งขึ้นคลาวด์ 1 งาน" (งานสำรองที่ตั้งเวลารวมรอบไว้ไม่นับ)', () => eq(s.badge(), 'รอส่งขึ้นคลาวด์ 1 งาน'));
      await s.app.resumePendingCloudWork(); await settle(60);
      await t('19. ส่งงานในคิวเสร็จ → ป้ายกลับเป็น "ตรงกัน" เอง (ไม่ต้องกดอะไร) · ไม่มีงานเหลือนอกจากสำรองที่ตั้งเวลาไว้', () => {
        eq(s.env.document.getElementById('mobile-sync-text').innerText, 'คลาวด์ออนไลน์ (ตรงกัน)');
        ok(s.app.state.cloudOutbox.every(j => !j.needVoidDelete && !j.needSummary && !j.needTelegram), JSON.stringify(s.app.state.cloudOutbox));
      });
    } finally { s.env.dispose(); }
  }
  {
    const s = await onlineShop();
    try {
      s.env.ctx.navigator.onLine = false;
      s.setNow(bkk(2026, 10, 11, 3, 0));
      await s.close(s.app.computeShiftDrawer(s.app.state.shift).expected);
      await t('19. ออฟไลน์ + ปิดกะ (สรุป/Telegram/สำรองยังไม่ส่ง) → "ออฟไลน์ — รอส่ง 1"', () => {
        ok(!s.app.state.shift.active, 'ปิดกะไม่สำเร็จ'); eq(s.badge(), 'ออฟไลน์ — รอส่ง 1'); eq(s.tg.sent.length, 0);
      });
    } finally { s.env.dispose(); }
  }
  {
    const s = await onlineShop();
    try {
      s.gas.faults.waitLock = true; s.tg.down = true;
      s.setNow(bkk(2026, 10, 11, 3, 0));
      await s.close(s.app.computeShiftDrawer(s.app.state.shift).expected);
      await s.flush();
      await t('19. ออนไลน์แต่ Apps Script/Telegram ล้ม (ยังไม่ครบ 3 ครั้ง) → "รอส่งขึ้นคลาวด์ 1 งาน" (เดิม "ตรงกัน")', () => eq(s.badge(), 'รอส่งขึ้นคลาวด์ 1 งาน'));
    } finally { s.env.dispose(); }
  }
  {
    const s = await onlineShop({ rows: { primaryStatus: null } });
    try {
      await s.app.notePrimaryStatus(false, { label: 'เครื่องอื่น' });
      s.setNow(bkk(2026, 10, 11, 3, 0));
      s.app.state.cloudOutbox.push({ id: 'cob-x', createdAt: Date.now(), dateKeys: ['2026-10-10'], monthKeys: [], needSummary: true, needTelegram: false, needBackup: true, tries: 0 });
      await t('19. เครื่องที่ไม่ใช่เครื่องหลัก: ป้าย "พัก" เหมือนเดิม (งานสรุป/สำรองที่ถูกพักไม่ถูกนับเป็น "รอส่ง")', () => {
        ok(/ไม่ใช่เครื่องหลัก/.test(s.badge()), s.badge()); eq(s.app.pendingCloudJobCount(), 0);
      });
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 20 ═════════════════════════════════════════════════════════════
  {
    const s = await onlineShop();
    try {
      s.tg.down = true;
      s.setNow(bkk(2026, 10, 11, 3, 0));
      await s.close(s.app.computeShiftDrawer(s.app.state.shift).expected);
      await s.flush(); s.setNow(bkk(2026, 10, 11, 3, 1)); await s.flush(); s.setNow(bkk(2026, 10, 11, 3, 3)); await s.flush();
      await t('20. Telegram ล้ม 3 ครั้ง → ป้าย "งานคลาวด์ค้าง 1 รายการ"', () => ok(/งานคลาวด์ค้าง 1/.test(s.badge()), s.badge()));
      s.tg.down = false;
      s.setNow(bkk(2026, 10, 11, 3, 4));   // ยังไม่ถึงเวลาลองรอบถัดไป (เว้น 2 นาที)
      s.toasts.length = 0;
      await s.app.syncPendingTransactions(); await settle(60);   // = กดป้าย
      await t('20. กดป้าย → ไม่บอกว่า "ตรงกัน" · บอกว่ากำลังลองส่งงานที่ค้างใหม่ พร้อมสาเหตุล่าสุด', () => {
        ok(!s.toasts.some(x => /ตรงกันกับ Google Sheets/.test(x.m)), JSON.stringify(s.toasts));
        ok(s.toasts.some(x => /กำลังลองส่งงานคลาวด์ที่ค้างใหม่/.test(x.m) && /Telegram/.test(x.m)), JSON.stringify(s.toasts));
      });
      await t('20. กดป้าย → ส่งรายงานปิดกะทาง Telegram ทันที (ไม่ต้องรอรอบถัดไป) · ป้ายกลับ "ตรงกัน"', () => {
        eq(s.tg.sent.length, 1); eq(s.env.document.getElementById('mobile-sync-text').innerText, 'คลาวด์ออนไลน์ (ตรงกัน)');
      });
      const tx = s.app.state.transactions[0];
      tx.syncStatus = 'conflict'; tx.syncIssue = { kind: 'conflict', code: 'DUPLICATE_BILL_ID', message: 'ซ้ำ' };
      s.toasts.length = 0;
      await s.app.syncPendingTransactions(); await settle(20);
      await t('20. มีบิลรอตรวจ → กดป้ายแล้วบอกให้ไปที่ ตั้งค่า → บิลรอตรวจ (ไม่ใช่ "ตรงกัน")', () =>
        ok(s.toasts.some(x => /บิลรอตรวจ 1 ใบ/.test(x.m) && /ตั้งค่า → บิลรอตรวจ/.test(x.m)), JSON.stringify(s.toasts)));
    } finally { s.env.dispose(); }
  }
  {
    const s = await onlineShop();
    try {
      // งานที่ชีตปฏิเสธถาวร (หยุดส่งแล้ว) — กดป้ายต้องไม่แตะ ต้องบอกให้เจ้าของตัดสินในหน้าตั้งค่า
      const job = { id: 'cob-stop', createdAt: Date.now(), dateKeys: [], monthKeys: [], needSummary: false, needTelegram: true,
        needBackup: false, telegramMessage: 'x', tries: 1, retry: { telegram: { tries: 1, lastTry: Date.now(), firstFailAt: Date.now(), nextAt: Date.now() + 60e3, stopped: 'TEST_STOP' } } };
      s.app.state.cloudOutbox.push(job);
      const before = JSON.stringify(job);
      s.toasts.length = 0;
      await s.app.syncPendingTransactions(); await settle(40);
      await t('20. งานที่หยุดส่งแล้ว: กดป้ายไม่แตะงาน ไม่ส่ง Telegram · บอกให้ไปกด "ลองใหม่"/"ทิ้งงานนี้"', () => {
        eq(JSON.stringify(job), before); eq(s.tg.sent.length, 0);
        ok(s.toasts.some(x => /หยุดส่งแล้ว/.test(x.m) && /ลองใหม่/.test(x.m)), JSON.stringify(s.toasts));
      });
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 68 ═════════════════════════════════════════════════════════════
  {
    let corrupt = null;
    const s = await shopAt({ intercept: (url, init) => {
      let b = null; try { b = JSON.parse(init.body); } catch (e) {}
      if (corrupt && b && b.action === 'transaction') {
        const body = { status: 'error', code: 'REGISTRY_CORRUPT', message: 'ทะเบียนบิลที่ยกเลิกบนชีตเสีย (เฉพาะบิล ' + b.id + ') จึงบันทึกไม่ได้ — ส่งซ้ำก็ไม่หาย',
          details: { billId: b.id, scope: 'bill', reason: 'bad json' } };
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
      }
      return null;
    } });
    try {
      s.setNow(bkk(2026, 10, 10, 10, 0)); await s.open();
      corrupt = true;   // ชีตตอบทะเบียนเสียเฉพาะบิลนี้ทุกครั้งที่ส่ง
      const a = await s.sell();
      await s.app.syncPendingTransactions(true); await settle(30);
      await s.app.syncPendingTransactions(true); await settle(30);
      await t('68. REGISTRY_CORRUPT (scope bill) → บิลรอตรวจพร้อมเหตุผล · ไม่อยู่ในรายการรอส่งซ้ำ', () => {
        eq(a.syncStatus, 'conflict'); eq(a.syncIssue && a.syncIssue.code, 'REGISTRY_CORRUPT');
        ok(/ส่งใหม่/.test(a.syncIssue.message), a.syncIssue.message);
        eq(s.app.isBillAwaitingSync(a), false);
      });
      await s.app.syncPendingTransactions(true); await settle(30);
      await t('68. รอบส่งถัดไปไม่ส่งบิลนี้ซ้ำอีก', () => ok(a.syncStatus === 'conflict'));
      await t('68. เจ้าของมีปุ่ม "ส่งใหม่" หลังแก้ในชีต · ป้ายขึ้น "บิลรอตรวจ 1 ใบ"', () => {
        eq(s.app.conflictActionsFor(a), ['retry']); ok(/บิลรอตรวจ 1/.test(s.badge()), s.badge());
      });
      corrupt = null;
      await s.app.resolveBillConflict(a.id, 'retry'); await settle(60);
      await t('68. แก้แล้วกด "ส่งใหม่" → ขึ้นชีตได้', () => eq(a.syncStatus, 'synced'));
    } finally { s.env.dispose(); }
  }

  R.done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
