// Regression coverage for the 2026-10-06 audit. Real Dexie + mock Google services; no network.
const assert = require('assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { createEnv, failPutForKeys } = require('./harness_db');
const { seed, quiet, loginAs, readyCheckout, settle, createGasEnv } = require('./fixtures_db');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '->', e.stack); }
}
async function shop() {
  const gas = createGasEnv(), env = createEnv({ fetch: gas.fetch, onLine: false });
  const toasts = quiet(env.app);
  await seed(env, { googleSheetsApiToken: gas.token }); await env.app.loadState(); loginAs(env.app, 'owner');
  env.app.scheduleCloudRetry = () => {}; env.app.resumePendingCloudWork = () => {};
  return Object.assign(env, { gas, toasts });
}
async function sale(s) { readyCheckout(s); assert.equal(await s.app.processCheckout(), true); return s.app.state.transactions.at(-1); }
async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await settle(5); } throw Error('timed out'); }
const bill = over => Object.assign({ action: 'transaction', id: 'TX-AUDIT-20261007', date: Date.parse('2026-10-07T12:00:00+07:00'),
  monthKey: '10-2026', dateTimeStr: '2026-10-07 12:00:00', customerName: 'Walk-in', services: ['Cut'], staffNames: ['A'],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1, revEpoch: 0 }, over);
(async () => {
  await test('1 same backend URL/token changes preserve acknowledgments; a new backend requeues bills', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); tx.syncStatus = 'synced'; await s.app.saveState(); await s.app.refreshPrimaryStatus();
      const id = s.app.cloudBackendId, other = createGasEnv();
      s.ctx.fetch = (url, opts) => String(url).includes('OTHER') ? other.fetch(url, opts) : s.gas.fetch(url, opts);
      s.document.getElementById('shop-sheets-sync-url').value = 'https://script.google.com/macros/s/ALIAS/exec';
      s.document.getElementById('shop-sheets-api-token').value = s.gas.token;
      assert.equal(await s.app.saveShopSettings(), true); assert.equal(s.app.cloudBackendId, id);
      assert.equal(s.app.state.transactions[0].syncStatus, 'synced');
      s.gas.props.POS_API_TOKEN = 'R'.repeat(32);
      s.document.getElementById('shop-sheets-api-token').value = 'R'.repeat(32);
      assert.equal(await s.app.saveShopSettings(), true); assert.equal(s.app.state.transactions[0].syncStatus, 'synced');
      s.document.getElementById('shop-sheets-sync-url').value = 'https://script.google.com/macros/s/OTHER/exec';
      s.document.getElementById('shop-sheets-api-token').value = other.token;
      assert.equal(await s.app.saveShopSettings(), true); assert.notEqual(s.app.cloudBackendId, id);
      assert.equal((await s.raw('transactions'))[0].syncStatus, 'pending');
      assert.ok((await s.raw('cloudOutbox')).some(x => x.needSummary && x.needBackup));
    } finally { s.dispose(); }
  });
  await test('1 old in-flight acknowledgment cannot mark a bill synced against a new connection', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); await s.app._cloudChain;
      tx.syncStatus = 'pending'; await s.app.saveState(); s.ctx.navigator.onLine = true;
      const hold = s.gas.hold(b => b.action === 'transaction');
      const sync = s.app.syncPendingTransactions(true); await until(() => hold.count);
      s.app._connectionGeneration = (s.app._connectionGeneration || 0) + 1;
      hold.releaseAll(); await sync;
      assert.equal(s.app.state.transactions[0].syncStatus, 'pending');
    } finally { s.dispose(); }
  });
  await test('2 backup waits for a failed sale to roll back; uploaded data matches durable bills', async () => {
    const s = await shop(); let reject;
    try {
      await sale(s); const original = s.db.state.bulkPut.bind(s.db.state); let blocked = false;
      s.db.state.bulkPut = rows => {
        if (!blocked && rows.some(r => r.key === 'transactions' && r.value.length === 2)) {
          blocked = true; return new Promise((resolve, no) => { reject = no; });
        }
        return original(rows);
      };
      readyCheckout(s); const checkout = s.app.processCheckout(); await until(() => blocked);
      let exports = 0, exported;
      s.app.downloadExportFile = data => { exports++; exported = JSON.parse(data); return true; };
      assert.equal(s.app.exportData({ downloadOnly: true }), false); assert.equal(exports, 0);
      const backup = s.app.autoBackupToGoogleDrive({ silent: true }); await settle(20);
      assert.equal(s.gas.requests.filter(r => r.action === 'backup').length, 0);
      reject(new Error('injected durable write failure')); assert.equal(await checkout, false); assert.equal(await backup, true);
      const uploaded = s.gas.requests.find(r => r.action === 'backup').backupData;
      assert.equal(uploaded.transactions.length, 1); assert.equal((await s.raw('transactions')).length, 1);
      assert.equal(s.app.backupStatus.lastTxCount, 1);
      assert.equal(s.app.exportData({ downloadOnly: true }), true); assert.equal(exports, 1);
      assert.equal(exported.transactions.length, 1);
    } finally { if (reject) reject(new Error('cleanup')); s.dispose(); }
  });
  await test('2 a sale during upload retains a follow-up backup; status counts the captured snapshot', async () => {
    const s = await shop();
    try {
      for (let i = 0; i < 5; i++) await sale(s);
      s.ctx.navigator.onLine = true; const hold = s.gas.hold(b => b.action === 'backup');
      const flush = s.app._doFlushCloudOutbox(); await until(() => hold.count);
      await sale(s); hold.releaseAll(); await flush;
      const uploaded = s.gas.requests.filter(r => r.action === 'backup');
      assert.equal(uploaded[0].backupData.transactions.length, 5); assert.equal(s.app.backupStatus.lastTxCount, 5);
      assert.ok(s.app.state.cloudOutbox.some(x => x.needBackup));
      await s.app._doFlushCloudOutbox();
      assert.equal(s.app.backupStatus.lastTxCount, 6); assert.equal(s.app.state.cloudOutbox.some(x => x.needBackup), false);
    } finally { s.dispose(); }
  });
  await test('3 business dates, month routing and shifts stay in Bangkok across host timezones', async () => {
    const { execFileSync } = require('child_process');
    const code = `const e=require('./tests/harness_db').createEnv(); const a=e.app;
      const t=Date.parse('2026-10-01T02:00:00+07:00');
      process.stdout.write(JSON.stringify([a.getBusinessISODate(t),a.getBusinessMonthKey(t),
      a.getBusinessISODate(a.shiftAnchorTime({startTime:Date.parse('2026-10-01T04:00:00+07:00')}))])); e.dispose();`;
    for (const TZ of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok']) {
      assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ } })),
        ['2026-09-30', '09-2026', '2026-10-01']);
    }
    const g = createGasEnv();
    assert.equal(g.post(bill({ dateTimeStr: '2026-09-30 12:00:00', monthKey: '09-2026' })).code, 'INVALID_DATE');
    assert.equal(g.post(bill()).status, 'success');
    assert.equal(g.post(bill({ date: Date.parse('2026-09-07T12:00:00+07:00'), monthKey: '09-2026', dateTimeStr: '2026-09-07 12:00:00' })).code, 'CROSS_MONTH_BILL_ID');
  });
  await test('2 overlapping manual uploads are serialized and each captures its own durable snapshot', async () => {
    const s = await shop(); let hold;
    try {
      await sale(s); hold = s.gas.hold(b => b.action === 'backup');
      const first = s.app.autoBackupToGoogleDrive({ silent: true }); await until(() => hold.count);
      await sale(s); const second = s.app.autoBackupToGoogleDrive({ silent: true }); await settle(20);
      assert.equal(hold.count, 1); hold.releaseOne(); assert.equal(await first, true);
      await until(() => hold.count); hold.releaseAll(); assert.equal(await second, true);
      assert.deepEqual(s.gas.requests.filter(r => r.action === 'backup').map(r => r.backupData.transactions.length), [1, 2]);
      assert.equal(s.app.backupStatus.lastTxCount, 2);
    } finally { if (hold) hold.releaseAll(); s.dispose(); }
  });
  await test('4 pruning hot tombstones keeps permanent replay protection', async () => {
    const g = createGasEnv(), at = Date.now() - 120 * 86400000, id = 'TX-AUDIT-OLD-VOID';
    g.props['POSVB_' + id] = JSON.stringify({ v: at, r: 0, w: at }); g.ctx.pruneBillRegistry_();
    assert.equal(g.props['POSVB_' + id], undefined); assert.ok(g.sheet('_POS_VOID_ARCHIVE'));
    assert.equal(g.post(bill({ id })).code, 'ALREADY_VOIDED');
    const state = g.ctx.readBillRegistryStrict_(id); assert.equal(state.v, at);
    const now = Date.now();
    for (let i = 0; i < 1600; i++) g.props['POSVB_TX-PRESSURE-' + String(i).padStart(5, '0') + '-' + 'A'.repeat(30)] = JSON.stringify({ v: now, r: 0, w: now });
    g.ctx.pruneBillRegistry_();
    const hot = Object.entries(g.props).filter(([k]) => k.startsWith('POSVB_'));
    assert.ok(hot.reduce((sum, [k, v]) => sum + k.length + v.length, 0) <= 128 * 1024);
    assert.equal(g.ctx.readBillRegistryStrict_('TX-PRESSURE-00000-' + 'A'.repeat(30)).v, now);
  });
  await test('5 demotion, PIN change and import deletion revoke the old authority immediately', async () => {
    const s = await shop();
    try {
      const st = s.app.state.staff[0]; st.accessLevel = 'owner'; s.app.currentUser = { id: st.id, name: st.name };
      await s.app.withMutation('demote', async () => { st.accessLevel = 'staff'; await s.app.saveStateOrThrow('staff'); });
      assert.equal(s.app.currentRole, 'staff'); assert.equal(s.app.authorize('data.admin', '', { quiet: true }), false);
      s.app.currentRole = 'owner'; st.accessLevel = 'owner';
      await s.app.withMutation('PIN change', async () => { st.pin = await s.app.hashPin('555555'); await s.app.saveStateOrThrow('staff'); });
      assert.equal(s.app.currentUser, null);
      s.app.currentRole = 'owner'; s.app.currentUser = { id: st.id, name: st.name };
      const backup = JSON.parse(JSON.stringify(s.app.buildBackupPayload())); backup.staff = backup.staff.filter(x => x.id !== st.id);
      await s.app.applyBackupData(backup); assert.equal(s.app.currentRole, null);
    } finally { s.dispose(); }
  });
  await test('6 a queued settings edit is rejected after logout', async () => {
    const s = await shop(); let release;
    try {
      const blocker = s.app.withMutation('held write', () => new Promise(ok => { release = ok; })); await until(() => release);
      const count = s.app.state.categories.length; s.document.getElementById('cat-name').value = 'must not persist';
      const pending = s.app.addCategory(); s.app.logout(); release(); await blocker; await pending;
      assert.equal(s.app.state.categories.length, count); assert.equal((await s.raw('categories')).length, count);
    } finally { if (release) release(); s.dispose(); }
  });
  await test('7 negative/fractional-cent commissions are quarantined; valid fixed commission above net is accepted', async () => {
    const s = await shop();
    try {
      const tx = await sale(s), broken = JSON.parse(JSON.stringify(tx)); broken.details[0].commissionAmount = -10;
      assert.ok(s.app.validateBillRecord(broken).some(p => p.fatal));
      broken.details[0].commissionAmount = 0.001; assert.ok(s.app.validateBillRecord(broken).some(p => p.fatal));
      broken.details[0].commissionAmount = 400; broken.details[0].commissionType = 'fixed';
      assert.equal(s.app.validateBillRecord(broken).some(p => p.fatal), false);
      const backup = JSON.parse(JSON.stringify(s.app.buildBackupPayload())); backup.transactions[0].details[0].commissionAmount = -10;
      // บิลที่เพิ่งขายยังไม่ขึ้นชีต — กู้ทับต้องยืนยันก่อน (ตรวจ 8 ต.ค. 2569 ข้อ 3) · เทสต์นี้ตั้งใจแทนข้อมูลเพื่อดูการแยกตรวจสอบ
      await s.app.applyBackupData(backup, { acceptUnsynced: true }); assert.equal(s.app.state.transactions.length, 0);
      assert.equal(s.app.state.quarantine.length, 1); assert.ok(JSON.stringify(s.app.state.quarantine[0]).includes('-10'));
    } finally { s.dispose(); }
  });
  await test('8 activating POS preserves other applications caches', async () => {
    const handlers = {}, removed = [], waits = [];
    const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    const current = /const CACHE_NAME = '([^']+)'/.exec(source)[1];
    const ctx = { self: { addEventListener: (n, fn) => { handlers[n] = fn; }, clients: { claim() {} } },
      caches: { keys: async () => ['other-app-v1', 'jahn-pos-old', current], delete: async k => { removed.push(k); } } };
    vm.runInNewContext(source, ctx);
    handlers.activate({ waitUntil: p => waits.push(p) }); await Promise.all(waits); assert.deepEqual(removed, ['jahn-pos-old']);
  });
  await test('9 equal versions require identical payloads, including line details; identical retry repairs an interrupted write', async () => {
    const g = createGasEnv(); assert.equal(g.post(bill()).status, 'success'); assert.equal(g.post(bill()).status, 'success');
    assert.equal(g.post(bill({ subtotal: 500, total: 500 })).code, 'REVISION_CONFLICT');
    assert.equal(g.post(bill({ subtotal: 500, total: 500, rev: 2 })).status, 'success');
    const interrupted = createGasEnv(); interrupted.faults.appendRow = 3;
    const first = interrupted.post(bill()); assert.equal(first.status, 'error');
    assert.equal(interrupted.post(bill()).status, 'success');
    assert.equal(interrupted.sheet('10-2026')._grid.filter(r => r[0] === bill().id).length, 1);
  });
  await test('10 only the registered selling device writes bills; an incomplete primary transfer is rejected', async () => {
    const g = createGasEnv(), a = 'dev-' + 'a'.repeat(32), b = 'dev-' + 'b'.repeat(32);
    assert.equal(g.post(bill({ deviceId: a })).status, 'success');
    assert.equal(g.post(bill({ id: 'TX-SECONDARY', deviceId: b })).code, 'NOT_PRIMARY_DEVICE');
    const key = g.setupOwnerKey();
    assert.equal(g.post({ action: 'claim_primary', deviceId: b, ownerKey: key, bills: [] }).code, 'PRIMARY_TRANSFER_INCOMPLETE');
    assert.equal(g.post({ action: 'claim_primary', deviceId: b, ownerKey: key, bills: [bill()] }).status, 'success');
    assert.equal(g.post(bill({ deviceId: a, rev: 2 })).code, 'NOT_PRIMARY_DEVICE');
  });
  await test('12 flush failure prevents acknowledgment and releases the lock afterward', async () => {
    const g = createGasEnv(), events = [];
    g.ctx.SpreadsheetApp.flush = () => { events.push('flush'); throw Error('flush failed'); };
    g.ctx.LockService.getScriptLock = () => ({ waitLock() { events.push('lock'); }, releaseLock() { events.push('release'); } });
    assert.equal(g.post({ action: 'primary_status' }).code, 'SERVER_ERROR'); assert.deepEqual(events, ['lock', 'flush', 'release']);
  });
  await test('14 missing Playwright fails the UI runner instead of reporting success', async () => {
    let code;
    const required = () => ({ execFileSync() {} }); required.resolve = () => { throw Error('missing'); };
    assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run-all-ui.js'), 'utf8'), {
      require: required, process: { execPath: 'node', env: {}, exit(n) { code = n; throw Error('exit'); } }, console: { log() {} }
    }), /exit/);
    assert.equal(code, 1);
  });
  await test('15 a pinned Drive lookup failure keeps its identity and creates no replacement folder', async () => {
    const s = await shop();
    try {
      const folder = s.gas.DriveApp.createFolder('Pinned'); s.gas.ctx.setPosBackupFolderId(folder.getId());
      const before = Object.keys(s.gas.DriveApp._folders).length;
      s.gas.DriveApp.getFolderById = () => { throw Error('temporary Drive failure'); };
      assert.equal(await s.app.autoBackupToGoogleDrive({ silent: true }), false);
      assert.equal(s.gas.props.POS_BACKUP_FOLDER_ID, folder.getId()); assert.equal(Object.keys(s.gas.DriveApp._folders).length, before);
    } finally { s.dispose(); }
  });
  await test('16 failed resend reports pending status, never a successful upload', async () => {
    const s = await shop();
    try {
      const tx = await sale(s); s.ctx.fetch = async () => { throw Error('offline'); }; s.toasts.length = 0;
      await s.app.reconcileResendBill(tx.id); assert.equal(tx.syncStatus, 'pending');
      assert.equal(s.toasts.some(t => t.m.startsWith('ส่งบิล ' + tx.id + ' ขึ้นชีตแล้ว')), false);
    } finally { s.dispose(); }
  });
  await test('17 reset blocks a new sale throughout its backup; only the captured data is cleared', async () => {
    const s = await shop();
    try {
      await sale(s); const device = s.app.deviceId, hold = s.gas.hold(b => b.action === 'backup');
      s.ctx.prompt = () => 'ลบทั้งหมด'; const reset = s.app.resetData(); await until(() => hold.count);
      readyCheckout(s); assert.equal(await s.app.processCheckout(), false); hold.releaseAll(); assert.equal(await reset, true);
      assert.equal((await s.raw('transactions')).length, 0); assert.equal(await s.raw('deviceId'), device);
      assert.equal(s.gas.requests.find(r => r.action === 'backup').backupData.transactions.length, 1);
    } finally { s.dispose(); }
  });
  await test('18 clear/default/device failure rolls back the entire reset and reports failure', async () => {
    const s = await shop(); let undo;
    try {
      await sale(s); await s.app._cloudChain; await s.app._mutationChain;
      const before = await s.rawAll(); s.app.googleSheetsUrl = ''; s.ctx.prompt = () => 'ลบทั้งหมด';
      undo = failPutForKeys(['deviceId'], 'sync'); assert.equal(await s.app.resetData(), false); undo(); undo = null;
      assert.deepEqual(await s.rawAll(), before); assert.equal(s.app.state.transactions.length, 1);
      assert.equal(s.toasts.some(t => /คืนค่าเริ่มต้นข้อมูลเรียบร้อย/.test(t.m)), false);
    } finally { if (undo) undo(); s.dispose(); }
  });
  await test('19 update waits for cart, checkout, queued writes and maintenance', async () => {
    const s = await shop(); let release;
    try {
      assert.equal(s.app.canApplyAppUpdate(), true); readyCheckout(s); assert.equal(s.app.canApplyAppUpdate(), false); s.app.state.cart = [];
      const write = s.app.withMutation('write', () => new Promise(ok => { release = ok; }));
      assert.equal(s.app.canApplyAppUpdate(), false); await until(() => release); release(); await write;
      assert.equal(s.app.canApplyAppUpdate(), true);
      await s.app.withMaintenance('maintenance', async () => assert.equal(s.app.canApplyAppUpdate(), false));
    } finally { if (release) release(); s.dispose(); }
  });
  await test('22 QR versions 7–10 and ordinary PromptPay payloads decode exactly', async () => {
    const qrCtx = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../promptpay-qr.js'), 'utf8'), qrCtx);
    const qr = qrCtx.PromptPayQR, jsQR = require('./vendor/jsqr');
    const samples = [];
    for (const level of ['L', 'M']) for (const n of [130, 150, 180, 200]) samples.push(['audit-' + 'x'.repeat(n), level]);
    samples.push([qr.buildPayload('0812345678', 300), 'M']);
    for (const [text, level] of samples) {
      const m = qr.generateMatrix(text, level), scale = 8, w = (m.size + 8) * scale, pixels = new Uint8ClampedArray(w * w * 4); pixels.fill(255);
      for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.modules[y][x])
        for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) { const i = (((y + 4) * scale + a) * w + (x + 4) * scale + b) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; }
      const decoded = jsQR(pixels, w, w); assert.ok(decoded, 'version ' + m.version); assert.equal(decoded.data, text);
    }
  });
  console.log(`=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
