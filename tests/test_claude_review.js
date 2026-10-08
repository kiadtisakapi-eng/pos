// Regression ของรอบตรวจ Claude (7 ต.ค. 2569) หลัง Codex แก้ 24 ข้อ — ปัญหาที่เกิดจาก "การแก้ข้อหนึ่งไปกระทบอีกข้อ"
// ฐานข้อมูลจริง (Dexie + fake-indexeddb) + Apps Script ตัวจริงบน Google จำลอง · ไม่มีเครือข่ายจริง
// ทุกข้อพิสูจน์แล้วว่า "ตก" เมื่อรันกับโค้ดก่อนแก้รอบนี้ (ดู audit/fixes-20261007/CLAUDE_REVIEW.md)
const assert = require('assert/strict');
const path = require('path');
const { createEnv } = require('./harness_db');
const { seed, quiet, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '->', e.stack); }
}
async function shop(gas) {
  gas = gas || createGasEnv();
  const env = createEnv({ fetch: gas.fetch, onLine: false });
  const toasts = quiet(env.app);
  await seed(env, { googleSheetsApiToken: gas.token }); await env.app.loadState(); loginAs(env.app, 'owner');
  env.app.scheduleCloudRetry = () => {}; env.app.resumePendingCloudWork = () => {};
  return Object.assign(env, { gas, toasts });
}
async function sale(s) { readyCheckout(s); assert.equal(await s.app.processCheckout(), true); return s.app.state.transactions.at(-1); }
const DEV_B = 'dev-' + 'b'.repeat(32);
const bill = over => Object.assign({ action: 'transaction', id: 'TX-CLAUDE-20261007', date: Date.parse('2026-10-07T12:00:00+07:00'),
  monthKey: '10-2026', dateTimeStr: '2026-10-07 12:00:00', customerName: 'Walk-in', services: ['Cut'], staffNames: ['A'],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0 }, over);

(async () => {
  // ── C1 (ข้อ 6/17 × กู้ข้อมูล): withMutation ปฏิเสธโดยไม่รันงาน → ต้องไม่ขึ้นว่ากู้สำเร็จ ─────────────
  await test('C1 restore/undo refused by the maintenance gate report failure, never success, and keep data', async () => {
    const s = await shop();
    try {
      s.app.askTypedConfirm = async () => true;   // ตรวจ 8 ต.ค. 2569 ข้อ 3: บิลที่ขายยังไม่ขึ้นชีต → เจ้าของพิมพ์ยอมรับ (เทสต์นี้ตรวจด่านงานดูแลข้อมูล)
      await sale(s);
      const other = JSON.parse(JSON.stringify(s.app.buildBackupPayload())); other.transactions = [];
      s.app.cloudPost = async () => ({ status: 'success', details: { backupData: other } });
      s.app.downloadExportFile = () => true;
      s.app._maintenance = {};   // งานดูแลข้อมูล (รีเซ็ต/ย้ายเครื่องหลัก) กำลังทำอยู่
      s.toasts.length = 0;
      s.app.restoreFromDriveBackup('FILE-1', '7/10/2569'); await s.app._confirmP;
      assert.equal(s.app.state.transactions.length, 1); assert.equal((await s.raw('transactions')).length, 1);
      assert.equal(s.toasts.some(t => /สำเร็จแล้ว/.test(t.m)), false, JSON.stringify(s.toasts));
      assert.ok(s.toasts.some(t => t.ty === 'error' && /ระบบยังไม่ได้แทนข้อมูล/.test(t.m)), JSON.stringify(s.toasts));
      // ย้อนข้อมูล: ต้องมีสำเนาก่อนกู้ก่อน — กู้จริงหนึ่งรอบ (ไม่มีงานดูแลข้อมูล) แล้วสั่งย้อนตอนมีงานดูแลข้อมูล
      s.app._maintenance = null; s.app.restoreFromDriveBackup('FILE-1', '7/10/2569'); await s.app._confirmP;
      assert.equal(s.app.state.transactions.length, 0);
      s.app._maintenance = {}; s.toasts.length = 0;
      await s.app.undoLastRestore(); await s.app._confirmP;
      assert.equal(s.app.state.transactions.length, 0);
      assert.equal(s.toasts.some(t => /ย้อนกลับไปเป็นข้อมูลก่อนกู้เรียบร้อย/.test(t.m)), false, JSON.stringify(s.toasts));
    } finally { s.app._maintenance = null; s.dispose(); }
  });

  // ── C2 (ข้อ 10): เครื่องรองยกเลิก/แก้บิลในเครื่องไม่ได้ (ชีตไม่รับจากเครื่องรองแล้ว) ─────────────────
  await test('C2 a confirmed secondary device cannot void or edit bills locally', async () => {
    const s = await shop();
    try {
      const tx = await sale(s);
      s.app.primaryStatus = { isPrimary: false, checkedAt: Date.now(), primaryLabel: 'POS-BBBB', primaryClaimedAt: Date.now() };
      s.toasts.length = 0;
      s.document.getElementById('edit-tx-id').value = tx.id;
      s.document.getElementById('void-money-outcome').value = 'refunded';
      await s.app.voidTransaction(); await s.app._confirmP; await settle(30);
      assert.equal(s.app.state.transactions.length, 1); assert.equal((s.app.state.voidLog || []).length, 0);
      assert.equal((await s.raw('transactions')).length, 1);
      s.app.openTransactionEdit(tx.id); s.document.getElementById('edit-tx-discount').value = '50';
      await s.app.saveTransactionEdit(); await settle(30);
      assert.equal(s.app.state.transactions[0].discount || 0, 0); assert.equal((await s.raw('transactions'))[0].rev || 0, tx.rev || 0);
      assert.ok(s.toasts.some(t => /เครื่องรอง/.test(t.m)), JSON.stringify(s.toasts));
    } finally { s.dispose(); }
  });

  // ── C3 (ข้อ 10): เครื่องหลักเดิมรู้ตัวจากคำตอบของการส่งบิล แล้วหยุดรับชำระทันที ─────────────────────
  await test('C3 NOT_PRIMARY_DEVICE on a bill sync marks this device secondary and stops new sales', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); await s.app._cloudChain;
      tx.syncStatus = 'pending'; tx.rev = (tx.rev || 0) + 1; await s.app.saveState();   // บิลที่ยังค้างส่ง (เช่นแก้หลังขาย)
      s.gas.props.POS_PRIMARY_DEVICE = JSON.stringify({ id: DEV_B, label: 'POS-BBBB', claimedAt: Date.now(), how: 'owner' });
      s.ctx.navigator.onLine = true; s.toasts.length = 0;
      await s.app.syncPendingTransactions(true); await settle(30);
      assert.equal(s.app.state.transactions[0].syncStatus, 'pending');
      assert.equal(s.app.primaryStatus && s.app.primaryStatus.isPrimary, false);
      assert.equal((await s.raw('primaryStatus')).isPrimary, false);
      const before = s.app.state.transactions.length;
      readyCheckout(s); assert.equal(await s.app.processCheckout(), false);
      assert.equal(s.app.state.transactions.length, before);
    } finally { s.dispose(); }
  });

  // ── C4 (ข้อ 1/10): เปลี่ยนเฉพาะรหัสเชื่อมต่อแล้วตรวจตัวตนไม่ได้ → คงผลรับบิลเดิมและขายต่อได้ ───────────
  await test('C4 a token-only change that cannot be verified keeps acknowledgments, primary status and offline sales', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); tx.syncStatus = 'synced'; await s.app.saveState(); await s.app.refreshPrimaryStatus();
      const id = s.app.cloudBackendId; assert.ok(id.startsWith('sheet:') || id.startsWith('backend:'), id);
      assert.ok(s.app.primaryStatus && s.app.primaryStatus.isPrimary);
      s.document.getElementById('shop-sheets-sync-url').value = s.app.googleSheetsUrl;
      s.document.getElementById('shop-sheets-api-token').value = 'W'.repeat(32);   // พิมพ์ผิด → ชีตตอบ UNAUTHORIZED
      assert.equal(await s.app.saveShopSettings(), true);
      assert.equal(s.app.cloudBackendId, id);
      assert.equal((await s.raw('transactions'))[0].syncStatus, 'synced');
      assert.ok(s.app.primaryStatus && s.app.primaryStatus.isPrimary);
      assert.equal((await s.raw('cloudOutbox')).some(x => x.cause === 'backend' || String(x.id).startsWith('backend-')), false);
      s.ctx.fetch = async () => { throw new Error('offline'); };
      await sale(s);   // ยังขายออฟไลน์ได้ตามเดิม (ไม่ถูกบังคับลงทะเบียนเครื่องใหม่)
    } finally { s.dispose(); }
  });

  // ── C5 (ข้อ 4): ทะเบียนร้อนที่อ่านไม่ได้ใบเดียวต้องไม่หยุดการย้ายเข้าทะเบียนถาวรทั้งหมด ─────────────────
  await test('C5 one unreadable hot tombstone does not stop archiving the others', async () => {
    const g = createGasEnv(), at = Date.now() - 120 * 86400000, id = 'TX-CLAUDE-OLD-VOID';
    g.props['POSVB_TX-CLAUDE-BROKEN'] = '{not json';
    g.props['POSVB_' + id] = JSON.stringify({ v: at, r: 0, w: at });
    try { g.ctx.pruneBillRegistry_(); } catch (e) { /* โค้ดก่อนแก้โยนออกทั้งฟังก์ชัน */ }
    assert.equal(g.props['POSVB_' + id], undefined);
    assert.equal(g.ctx.readBillRegistryStrict_(id).v, at);
    assert.equal(g.props['POSVB_TX-CLAUDE-BROKEN'], '{not json');   // ไม่ลบ/ไม่เดา — ปิดเฉพาะบิลใบนั้น
    assert.throws(() => g.ctx.readBillRegistryStrict_('TX-CLAUDE-BROKEN'));
  });

  // ── C6 (ข้อ 9/3): ถ้า Sheets แปลง "MM-yyyy" เป็นวันที่ ทะเบียนบิลต้องยังใช้ได้ (ไม่ CROSS_MONTH ทุกคำขอ) ─────
  await test('C6 bill ledger month cells survive Sheets month-year coercion (edit and retry keep working)', async () => {
    const g = createGasEnv({ coerceMonthYear: true });
    assert.equal(g.post(bill()).status, 'success');
    assert.equal(g.post(bill()).status, 'success');                              // ส่งซ้ำรุ่นเดิม
    assert.equal(g.post(bill({ subtotal: 400, total: 400, rev: 2 })).status, 'success');   // แก้บิล
    const cells = g.sheet('_POS_BILL_INDEX')._grid[1];
    assert.equal(cells[1], '10-2026');
    assert.equal(g.sheet('10-2026')._grid.filter(r => r[0] === bill().id).length, 1);
    // ชีตทะเบียนเต็มพอดี (แถวสุดท้ายของกริด) — Google โยน error ถ้า getRange เกินจำนวนแถว ต้องยังรับบิลใหม่ได้
    const idx = g.sheet('_POS_BILL_INDEX'), realRange = idx.getRange;
    idx.getMaxRows = () => idx.getLastRow();
    idx.getRange = (r, ...rest) => {
      if (r > idx.getMaxRows()) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      return realRange(r, ...rest);
    };
    try {
      assert.equal(g.post(bill({ id: 'TX-CLAUDE-FULLSHEET' })).status, 'success');
      assert.equal(g.post(bill({ id: 'TX-CLAUDE-FULLSHEET', subtotal: 350, total: 350, rev: 2 })).status, 'success');
      assert.equal(idx._grid.find(r => r[0] === 'TX-CLAUDE-FULLSHEET')[1], '10-2026');
    } finally { delete idx.getMaxRows; idx.getRange = realRange; }
  });

  // ── C7 (ข้อ 3): หน้าตรวจความตรงกัน/กราฟรายชั่วโมงใช้เวลาไทยแม้เครื่องตั้งเขตเวลาอื่น ──────────────────
  await test('C7 reconcile time comparison and hourly blocks use Bangkok time on any host timezone', async () => {
    const { execFileSync } = require('child_process');
    const code = `const e=require('./tests/harness_db').createEnv(); const a=e.app;
      const t=Date.parse('2026-10-07T11:30:00+07:00');
      const tx={id:'TX-1',date:t,total:300,subtotal:300,discount:0,paymentMethod:'cash',customerName:'Walk-in',staffNames:['A'],details:[]};
      const diffs=a.reconcileFieldDiffs(tx,{when:'2026-10-07 11:30:00',total:300});
      const blocks=a.dailyChartBlocks([tx]);
      process.stdout.write(JSON.stringify([diffs.map(d=>d.field), blocks[0].sum])); e.dispose();`;
    for (const TZ of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok']) {
      assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ } })),
        [[], 300], TZ);
    }
  });

  // ── C8 (ข้อ 6/17 × งานระบบ): ผลซิงก์ที่จบระหว่างงานดูแลข้อมูลต้องถูกบันทึก ไม่ใช่ถูกปฏิเสธเหมือนคำสั่งผู้ใช้ ───
  await test('C8 background sync results are persisted during maintenance without user-facing refusal toasts', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); await s.app._cloudChain;
      tx.syncStatus = 'pending'; tx.rev = (tx.rev || 0) + 1; await s.app.saveState();
      s.ctx.navigator.onLine = true; s.toasts.length = 0;
      await s.app.withMaintenance('ทดสอบ', async () => { await s.app.syncPendingTransactions(true); return true; });
      assert.equal((await s.raw('transactions'))[0].syncStatus, 'synced');
      assert.equal(s.toasts.some(t => /กำลังสำรอง\/ล้างข้อมูล/.test(t.m)), false, JSON.stringify(s.toasts));
    } finally { s.dispose(); }
  });

  // ── C9 (ข้อ 10 · ชดเชยเงื่อนไขที่หายไปจากเทสต์ [19.1]): สรุปจากเครื่องอื่นที่รหัสถูกรูปแบบต้องถูกปฏิเสธที่ Apps Script ──
  await test('C9 Apps Script rejects a summary from a different valid device once a primary exists', async () => {
    const g = createGasEnv();
    assert.equal(g.post(bill({ deviceId: 'dev-' + 'a'.repeat(32) })).status, 'success');
    const r = g.post({ action: 'summary_day', deviceId: DEV_B, dateKey: '2026-10-07' });
    assert.equal(r.code, 'NOT_PRIMARY_DEVICE');
  });

  // ── C10 (ข้อ 1 × รอบตรวจ 6 ข้อ 2): เปลี่ยนไปชีตใหม่ → สรุปทั้งร้านแยกเป็นงานรายเดือน ไม่ใช่งานเดียวทุกวันตั้งแต่เปิดร้าน ──
  await test('C10 a new backend requeues summaries as one job per month (old days only as month totals) plus one backup', async () => {
    const s = await shop();
    try {
      const tx = await sale(s);
      const at = iso => Date.parse(iso);
      const copy = (id, iso) => Object.assign(JSON.parse(JSON.stringify(tx)), { id, date: at(iso), syncStatus: 'synced' });
      s.app.state.transactions = [copy('TX-1753000000000-OLDJULY1', '2026-07-20T12:00:00+07:00'),
        copy('TX-1757900000000-SEPTEMB1', '2026-09-15T12:00:00+07:00'), copy('TX-1759600000000-OCTOBER1', '2026-10-05T12:00:00+07:00')];
      s.app.state.shift.history = []; s.app.state.cloudOutbox = [];
      s.app.cloudBackendId = 'sheet:OLD';
      assert.equal(s.app.bindCloudBackend('sheet:NEW', false), true);
      const jobs = s.app.state.cloudOutbox.filter(x => x.needSummary);
      assert.equal(JSON.stringify(jobs.map(j => j.monthKeys.join(',')).sort()), JSON.stringify(['07-2026', '09-2026', '10-2026']));
      assert.ok(jobs.every(j => j.reason === 'restore'));
      assert.equal(jobs.find(j => j.monthKeys[0] === '07-2026').dateKeys.length, 0);   // เก่ากว่าที่ชีตเก็บสรุปรายวัน = ส่งแค่สรุปเดือน
      assert.equal(s.app.state.cloudOutbox.filter(x => x.needBackup).length, 1);
      assert.ok(s.app.state.transactions.every(t => t.syncStatus === 'pending'));
    } finally { s.dispose(); }
  });

  // ── C11 (ข้อ 3/9 · ความเร็ว): บิลใหม่ไม่ต้องไล่อ่านทุกแท็บเดือน — ตรวจแค่เดือนติดกัน (ยังจับเลขซ้ำข้ามเดือนได้) ──
  await test('C11 a new bill only checks adjacent month tabs for a duplicate ID, never far months', async () => {
    const g = createGasEnv();
    assert.equal(g.post(bill({ id: 'TX-CLAUDE-MARCH', date: Date.parse('2026-03-10T12:00:00+07:00'), monthKey: '03-2026', dateTimeStr: '2026-03-10 12:00:00' })).status, 'success');
    assert.equal(g.post(bill({ id: 'TX-CLAUDE-SEPT', date: Date.parse('2026-09-10T12:00:00+07:00'), monthKey: '09-2026', dateTimeStr: '2026-09-10 12:00:00' })).status, 'success');
    const far = g.sheet('03-2026'); let reads = 0;
    const lr = far.getLastRow, gr = far.getRange;
    far.getLastRow = (...a) => { reads++; return lr(...a); }; far.getRange = (...a) => { reads++; return gr(...a); };
    assert.equal(g.post(bill({ id: 'TX-CLAUDE-NEWOCT' })).status, 'success');
    assert.equal(reads, 0);
    // ตัวที่ซ้ำกับเดือนติดกันยังถูกจับ (บิลที่เขียนก่อนมีทะเบียน → ลบออกจากทะเบียนเพื่อจำลองแถวรุ่นเก่า)
    const idx = g.sheet('_POS_BILL_INDEX'); idx._grid.splice(idx._grid.findIndex(r => r[0] === 'TX-CLAUDE-SEPT'), 1);
    assert.equal(g.post(bill({ id: 'TX-CLAUDE-SEPT', date: Date.parse('2026-10-01T12:00:00+07:00'), dateTimeStr: '2026-10-01 12:00:00' })).code, 'CROSS_MONTH_BILL_ID');
  });

  // ── C12 (ข้อ 8): Service Worker อ่านไฟล์จากแคชของ POS เท่านั้น ไม่หยิบไฟล์ชื่อเดียวกันจากแคชของแอปอื่น ──
  await test('C12 the service worker serves only from its own POS cache', async () => {
    const fs = require('fs'), vm = require('vm');
    const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    const current = /const CACHE_NAME = '([^']+)'/.exec(source)[1];
    const handlers = {};
    const store = { [current]: { 'https://shop.test/app.js': 'POS', './index.html': 'POS-INDEX' },
      'other-app-v1': { 'https://shop.test/app.js': 'OTHER', './index.html': 'OTHER-INDEX' } };
    const ctx = {
      self: { addEventListener: (n, fn) => { handlers[n] = fn; }, clients: { claim() {} }, skipWaiting() {} },
      caches: {
        open: async name => ({ match: async req => (store[name] || {})[typeof req === 'string' ? req : req.url], put: async () => {} }),
        match: async req => store['other-app-v1'][typeof req === 'string' ? req : req.url], keys: async () => Object.keys(store), delete: async () => true
      },
      fetch: async () => { throw new Error('offline'); }, Response: function (b, o) { this.body = b; this.status = o && o.status; }
    };
    vm.runInNewContext(source, ctx);
    let served;
    handlers.fetch({ request: { method: 'GET', url: 'https://shop.test/app.js', mode: 'no-cors' }, respondWith: p => { served = p; } });
    assert.equal(await served, 'POS');
    // ออฟไลน์ + เปิดหน้าแอป (ไม่มีในแคช) → หน้าแรกจากแคชของ POS เท่านั้น
    handlers.fetch({ request: { method: 'GET', url: 'https://shop.test/?from=home', mode: 'navigate' }, respondWith: p => { served = p; } });
    assert.equal(await served, 'POS-INDEX');
  });

  console.log(`=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
