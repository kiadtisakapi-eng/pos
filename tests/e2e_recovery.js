// Owner emergency takeover on real Chromium/IndexedDB and real GAS on a mock Sheet.
const assert = require('assert/strict'), { chromium } = require('playwright');
const { createGasEnv } = require('./gas_env');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = 8134;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((q, s) => {
  const file = path.resolve(ROOT, '.' + decodeURIComponent(q.url.split('?')[0] === '/' ? '/index.html' : q.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(s);
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(PORT, 'localhost', resolve));
    const gas = createGasEnv(), ownerKey = gas.setupOwnerKey();
    assert.equal(gas.post({ action: 'transaction', id: 'TX-UI-MISSING', date: Date.parse('2026-10-07T12:00:00+07:00'),
      monthKey: '10-2026', dateTimeStr: '2026-10-07 12:00:00', services: ['Cut'], staffNames: ['A'], subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', rev: 1 }).status, 'success');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, serviceWorkers: 'block' });
    await context.route('https://script.google.com/**', async route => route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: String(gas.ctx.doPost({ postData: { contents: route.request().postData() } })) }));
    await context.route(u => !String(u).startsWith('http://localhost:' + PORT + '/') && !String(u).startsWith('https://script.google.com/'), route => route.abort());
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.app && app.state && !app.loadFailed);
    await page.evaluate(async token => {
      await app._mutationChain;
      app.currentUser = { id: '__owner__', name: 'Owner' }; app.currentRole = 'owner';
      app.googleSheetsUrl = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec'; app.googleSheetsApiToken = token;
      app.state.transactions = []; app.state.cloudOutbox = [];
      app.state.services = [{ id: 's1', name: 'Cut', price: 300, commission: 10, commissionType: 'percent', category: 'barber' }];
      app.state.staff = [{ id: 'st1', name: 'A', role: 'Staff', accessLevel: 'staff' }]; app.state.categories = [{ id: 'barber', name: 'Cut', vat: false }];
      app.state.shift = { active: true, startTime: Date.now(), startCash: 0, startDetails: {}, expenses: [], history: [] };
      app.scheduleCloudRetry = () => {}; app.resumePendingCloudWork = () => {};
      await app.saveState(); await app.refreshPrimaryStatus(); app.updateUserRoleUI(); app.switchTab('settings'); app.renderPrimaryStatus();
      app.closeModal('modal-login'); app.closeModal('modal-welcome');
    }, gas.token);
    await page.locator('#primary-device-box button').click();
    await page.locator('#modal-confirm.active').waitFor(); await page.locator('#btn-confirm-yes').click();
    await page.locator('#modal-prompt.active').waitFor(); await page.locator('#prompt-modal-input').fill(ownerKey);
    await page.locator('#modal-prompt button.primary').click();
    await page.waitForFunction(() => document.getElementById('modal-confirm').classList.contains('active') && document.getElementById('confirm-modal-msg').innerText.includes('รับช่วงขายฉุกเฉิน'));
    await page.locator('#btn-confirm-yes').click();
    // ตรวจรอบ Claude รอบ 3 (D10): ชีตยอมรับรหัสแล้ว (แม้ข้อมูลไม่ครบ) จึงไม่ถามรหัสซ้ำตอนเลือกฉุกเฉิน
    try { await page.waitForFunction(() => app.primaryStatus && app.primaryStatus.recovery && !app._maintenance, null, { timeout: 5000 }); }
    catch (e) {
      console.log('Recovery state', await page.evaluate(() => ({ primary: app.primaryStatus, maintenance: app._maintenance,
        role: app.currentRole, readonly: app.isReadOnlyWindow, loadFailed: app.loadFailed, toast: document.body.innerText.slice(-1600) })));
      console.log('Server primary', gas.ctx.readPrimaryDevice_()); throw e;
    }
    assert.match(await page.locator('#primary-device-box').innerText(), /รับช่วงฉุกเฉิน/);
    assert.match(await page.locator('#primary-device-box button').innerText(), /ปลดการพัก/);
    const result = await page.evaluate(async () => {
      app.state.cart = [{ uniqueCartId: 'u1', id: 's1', name: 'Cut', price: 300, commission: 10, commissionType: 'percent', category: 'barber', staffId: 'st1', staffName: 'A' }];
      app.state.selectedPaymentMethod = 'cash'; document.getElementById('cash-received').value = '300';
      document.getElementById('cart-discount').value = '0'; document.getElementById('cart-customer-select').value = '';
      app.beginCheckoutAttempt(); const accepted = await app.processCheckout(); await app.syncPendingTransactions(true);
      const backup = await app.autoBackupToGoogleDrive({ silent: true });
      app.renderPrimaryStatus(); app.checkSyncStatus();
      return { accepted, backup, transactions: app.state.transactions.length, emergency: app.state.transactions[0].emergencySale };
    });
    assert.deepEqual(result, { accepted: true, backup: false, transactions: 1, emergency: true });
    assert.equal(gas.sheet('10-2026')._grid.length, 3); assert.ok(gas.ctx.readPrimaryDevice_().recovery);
    await page.locator('#modal-receipt .modal-close').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => app.state.transactions.length === 1 && app.primaryStatus && app.primaryStatus.recovery);
    await page.evaluate(() => { app.currentUser = { id: '__owner__', name: 'Owner' }; app.currentRole = 'owner';
      app.updateUserRoleUI(); app.closeModal('modal-login'); app.switchTab('settings'); app.renderPrimaryStatus(); });
    await page.locator('#primary-device-box button').click(); await page.locator('#modal-confirm.active').waitFor(); await page.locator('#btn-confirm-yes').click();
    await page.waitForFunction(() => document.getElementById('modal-confirm').classList.contains('active') && document.getElementById('confirm-modal-msg').innerText.includes('ปลดการพักฉุกเฉิน'));
    await page.locator('#btn-confirm-cancel').click(); await page.waitForFunction(() => !app._maintenance);
    assert.ok(await page.evaluate(() => app.primaryStatus.recovery));
    // ตรวจรอบ Claude รอบ 3 (D4 · เจ้าของเลือก): เครื่องเดิมเสียถาวร → ปลดพักแบบยอมรับข้อมูลหาย ด้วยการพิมพ์คำยืนยันจริง
    await page.locator('#primary-device-box button').click(); await page.locator('#modal-confirm.active').waitFor(); await page.locator('#btn-confirm-yes').click();
    await page.waitForFunction(() => document.getElementById('modal-confirm').classList.contains('active') && document.getElementById('confirm-modal-msg').innerText.includes('ปลดการพักฉุกเฉิน'));
    await page.locator('#btn-confirm-yes').click();
    await page.locator('#modal-prompt.active').waitFor(); await page.locator('#prompt-modal-input').fill(ownerKey);   // หลัง reload รหัสไม่อยู่ในหน่วยความจำ
    await page.locator('#btn-prompt-submit').click();
    await page.waitForFunction(() => document.getElementById('modal-prompt').classList.contains('active') &&
      document.getElementById('prompt-modal-title').innerText.includes('ยอมรับข้อมูลหาย') && document.getElementById('prompt-modal-title').innerText.includes('TX-UI-MISSING'));
    assert.equal(await page.locator('#prompt-modal-input').getAttribute('type'), 'text');
    await page.screenshot({ path: path.join(ROOT, 'audit/fixes-20261007/claude-recheck/accept-loss-ui.png') });
    await page.locator('#prompt-modal-input').fill('ยอมรับข้อมูลหาย'); await page.locator('#btn-prompt-submit').click();
    await page.waitForFunction(() => !app._maintenance && app.primaryStatus && !app.primaryStatus.recovery, null, { timeout: 8000 });
    const released = await page.evaluate(() => ({ sheetOnly: app.state.transactions.filter(t => t.sheetOnly).map(t => t.id),
      box: document.getElementById('primary-device-box').innerText }));
    assert.deepEqual(released.sheetOnly, ['TX-UI-MISSING']); assert.doesNotMatch(released.box, /รับช่วงฉุกเฉิน/);
    assert.equal(gas.ctx.readPrimaryDevice_().recovery, null); assert.ok(gas.sheet('_POS_RECOVERY_ACCEPTED'));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(ROOT, 'audit/fixes-20261007/recheck-fixes/emergency-ui.png') });
    console.log('PASS emergency owner-key dialogs, visible warnings, new sale, protected backup, IndexedDB reload, cancelled release, typed accept-loss release and no page errors');
    // บรรทัดสรุปบังคับโดย runner_judge.js (ตรวจ 8 ต.ค. 2569 ข้อ 7) — ไม่มีบรรทัดนี้ run-all-ui.js นับว่าไม่ผ่าน
    console.log('\n=== ผ่าน 1 · ไม่ผ่าน 0 ===');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
