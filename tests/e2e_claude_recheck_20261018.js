// C05 in real Chrome/Chromium with shared IndexedDB, actual button clicks and sales.
// Synthetic data only. Each scenario has isolated storage and blocks external requests.
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(ROOT, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end();
  }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function boot(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app && app.ownerPin && app._writerDecided);
  return page;
}
async function login(page) {
  await page.click('#login-user-list [data-uid="__owner__"]');
  await page.fill('#login-pin-input', '246810');
  await page.click('#modal-login button.primary');
  await page.waitForFunction(() => app.currentRole === 'owner' && !document.getElementById('modal-login').classList.contains('active'));
}
async function seed(page) {
  await page.evaluate(async () => {
    app.ownerPin = await app.hashPin('246810');
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = ''; app.telegramToken = ''; app.telegramChatId = '';
    app.vatEnabled = false;
    app.state.staff = [{ id: 'synthetic-staff', name: 'Synthetic staff', role: 'ช่าง', active: true, accessLevel: 'staff' }];
    app.state.categories = [{ id: 'barber', name: 'บริการ', icon: 'fa-scissors', vat: false }];
    app.state.services = [{ id: 'synthetic-service', name: 'Synthetic service', price: 300, duration: 30,
      category: 'barber', commission: 10, commissionType: 'percent' }];
    app.state.transactions = []; app.state.cart = []; app.state.queue = [];
    app.state.voidLog = []; app.state.editLog = []; app.state.cloudOutbox = [];
    app.state.shift = { active: true, startTime: Date.now() - 60000, startCash: 1000,
      startDetails: { 1000: 1 }, expenses: [], history: [] };
    if (!await app.saveState()) throw new Error('Cannot seed isolated database');
    app.renderAll(); app.requireLogin();
  });
}
async function sell(page, amount, denied = false) {
  await page.evaluate(amount => {
    app.closeModal('modal-payment');
    // A rejected sale deliberately retains its cart. Start a distinct sale here.
    app.resetCartState();
    app.state.services[0].price = amount;
    app.switchTab('pos');
  }, amount);
  await page.click('.service-card');
  await page.selectOption('.cart-item-staff select', 'synthetic-staff');
  await page.click('#btn-checkout');
  assert.equal(await page.evaluate(() => document.getElementById('modal-payment').classList.contains('active')), true,
    'checkout did not open: ' + JSON.stringify(await page.evaluate(() => ({
      cart: app.state.cart, shift: app.state.shift, role: app.currentRole, readOnly: app.isReadOnlyWindow,
      modals: Array.from(document.querySelectorAll('.modal-overlay.active')).map(e => e.id),
      messages: Array.from(document.querySelectorAll('.toast')).map(e => e.textContent),
    }))));
  await page.click('#pay-cash-btn');
  await page.fill('#cash-received', String(amount));
  await page.click('#btn-complete-checkout');
  if (denied) {
    await page.waitForFunction(() => app.isReadOnlyWindow && !app._mutationPending);
  } else {
    await page.waitForSelector('#modal-receipt.active');
    await page.click('#modal-receipt .modal-close');
  }
}
const totals = page => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('EroticaPosDatabase');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result, tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('transactions');
    request.onsuccess = () => resolve(request.result.value.map(t => t.total));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  };
}));

(async () => {
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const executablePath = [process.env.POS_BROWSER_EXE, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/opt/pw-browsers/chromium'].find(p => p && fs.existsSync(p));
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    for (const mode of ['normal', 'absent', 'throw', 'reject']) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 900 },
        hasTouch: true, serviceWorkers: 'block' });
      const errors = [];
      context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      try {
        await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.continue() : route.abort());
        if (mode !== 'normal') await context.addInitScript(mode => Object.defineProperty(navigator, 'locks', {
          configurable: true,
          value: mode === 'absent' ? undefined : { request() {
            if (mode === 'throw') throw Error('Synthetic Web Locks failure');
            return Promise.reject(Error('Synthetic Web Locks failure'));
          } },
        }), mode);
        const a = await boot(context, url); await seed(a); await login(a);
        const b = await boot(context, url); await login(b);
        // A may need startup repairs written by B in an API fallback browser.
        await a.evaluate(async () => { await app.loadState(); app.renderAll(); });
        await sell(a, 300);
        if (mode === 'normal') {
          assert.equal(await b.evaluate(() => app.isReadOnlyWindow), true);
          await b.click('#read-only-retry-btn');
          await b.waitForFunction(() => !document.getElementById('read-only-retry-btn').disabled);
          assert.equal(await b.evaluate(() => app.isReadOnlyWindow), true, 'busy lock must keep B read-only');
          assert.deepEqual(await totals(b), [300]);
          await a.close();
          await b.waitForFunction(() => !app.isReadOnlyWindow);
        } else {
          await sell(b, 500, true);
          assert.deepEqual(await totals(b), [300], 'stale sale must not overwrite A');
          if (mode === 'absent') {
            // A failed reload must reset the real button and keep writes blocked.
            await b.evaluate(() => {
              window.__originalLoadState = app.loadState;
              app.loadState = async () => { throw Error('Synthetic reload failure'); };
            });
            await b.click('#read-only-retry-btn');
            await b.waitForFunction(() => !document.getElementById('read-only-retry-btn').disabled);
            assert.equal(await b.evaluate(() => app.isReadOnlyWindow), true);
            assert.deepEqual(await totals(b), [300]);
            await b.evaluate(() => { app.loadState = window.__originalLoadState; });
          }
          // The stale checkout modal remains open: the banner button must still work by touch.
          await b.locator('#read-only-retry-btn').tap();
          await b.waitForFunction(() => !app.isReadOnlyWindow && !document.getElementById('read-only-window-banner'));
        }
        assert.deepEqual(await b.evaluate(() => app.state.transactions.map(t => t.total)), [300], 'takeover must reload first');
        await sell(b, 500);
        assert.deepEqual(await totals(b), [300, 500], 'B must be able to sell after takeover');
        if (mode !== 'normal') {
          await sell(a, 700, true);
          assert.deepEqual(await totals(a), [300, 500], 'old A must not overwrite B after takeover');
        }
        assert.deepEqual(errors, [], 'no unhandled browser errors');
        pass++; console.log(`  PASS C05 ${mode}: takeover, persisted sales and stale window protection`);
      } catch (e) {
        fail++; console.error(`  FAIL C05 ${mode}: ${e.stack}`);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
