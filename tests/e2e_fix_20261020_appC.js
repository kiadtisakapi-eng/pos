// ตรวจ 19 ต.ค. 2569 ข้อ 3 + 39 ใน Chromium จริง: นำเข้าไฟล์ผ่านช่องเลือกไฟล์จริง แล้วกดปุ่มในกล่องยืนยัน/กล่องพิมพ์จริงทีละขั้น
//   ก) กดยืนยันตามปกติทุกขั้น → คงตั้งค่าเงินของเครื่อง (VAT เปิด · ค่าธรรมเนียมบัตร 8% · พร้อมเพย์เดิม)
//   ข) กดยกเลิกที่คำถามตั้งค่าเงิน + พิมพ์ "ใช้ค่าในไฟล์" → ได้ค่าในไฟล์
//   ค) ไฟล์จากเครื่องฉุกเฉินที่ไม่ครบ: กล่องแรกมีคำเตือน ⛔ · กดยกเลิกในกล่องพิมพ์ยืนยัน = ไม่แตะข้อมูล
// ข้อมูลสมมติทั้งหมด · ไม่ออกเน็ตจริง (บล็อกทุกคำขอที่ไม่ใช่ localhost)
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  PASS', name); }
  catch (e) { fail++; console.log('  FAIL', name, '->', (e && e.message || String(e)).split('\n')[0]); }
};
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(ROOT, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function boot(context, url) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app && app.ownerPin && app._writerDecided);
  await page.evaluate(async () => {
    app.ownerPin = await app.hashPin('246810');
    app.googleSheetsUrl = ''; app.googleSheetsApiToken = ''; app.telegramToken = ''; app.telegramChatId = '';
    app.vatEnabled = true; app.vatRate = 7; app.cardFeeRate = 8; app.shopPromptPayId = '0899999999';
    app.state.categories = [{ id: 'barber', name: 'บริการ', icon: 'fa-scissors', vat: true }];
    app.state.staff = [{ id: 'synthetic-staff', name: 'Synthetic staff', role: 'ช่าง', active: true, accessLevel: 'staff' }];
    app.state.services = [{ id: 'synthetic-service', name: 'Synthetic service', price: 300, duration: 30,
      category: 'barber', commission: 10, commissionType: 'percent' }];
    app.state.transactions = [{ id: 'TX-1790000000000-SYNTH01', date: Date.now() - 3600e3, subtotal: 300, discount: 0, total: 300,
      paymentMethod: 'cash', services: ['Synthetic service'], staffNames: ['Synthetic staff'], syncStatus: 'synced', rev: 1, revEpoch: 0,
      nonVatBase: 0, vatableBase: 280.37, vatAmount: 19.63, rounding: 0, vatRate: 7 }];
    app.state.cart = []; app.state.queue = []; app.state.voidLog = []; app.state.editLog = []; app.state.cloudOutbox = [];
    app.state.shift = { active: true, startTime: Date.now() - 7200e3, startCash: 1000, startDetails: { 1000: 1 }, expenses: [], history: [] };
    if (!await app.saveState()) throw new Error('Cannot seed isolated database');
    app.renderAll(); app.requireLogin();
  });
  await page.click('#login-user-list [data-uid="__owner__"]');
  await page.fill('#login-pin-input', '246810');
  await page.click('#modal-login button.primary');
  await page.waitForFunction(() => app.currentRole === 'owner' && !document.getElementById('modal-login').classList.contains('active'));
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.active').forEach(m => app.closeModal(m.id));
    window.__toasts = []; const orig = app.showToast.bind(app);
    app.showToast = (m, ...a) => { window.__toasts.push(String(m)); return orig(m, ...a); };
  });
  return page;
}
const fileFrom = (page, patch) => page.evaluate((patch) => {
  const f = JSON.parse(JSON.stringify(app.buildBackupPayload()));
  return JSON.stringify(Object.assign(f, patch));
}, patch);
const pick = (page, text) => page.setInputFiles('#import-file-input', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
const confirmText = page => page.evaluate(() => document.getElementById('confirm-modal-msg').innerText);
const promptText = page => page.evaluate(() => document.getElementById('prompt-modal-title').innerText);
const active = (page, id) => page.waitForSelector(`#${id}.active`);

(async () => {
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const executablePath = [process.env.POS_BROWSER_EXE, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium']
      .find(p => p && fs.existsSync(p));
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const fresh = async () => {
      const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
      await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      return { context, page: await boot(context, url), errors };
    };
    const OLD = { vatEnabled: false, cardFeeRate: 10, shopPromptPayId: '0812345678' };

    await t('ก) กดยืนยันทุกขั้น → กล่องแรกบอกรายการที่ต่าง · คำถามตั้งค่าเงินขึ้นจริง · คงค่าของเครื่อง', async () => {
      const { context, page, errors } = await fresh();
      try {
        await pick(page, await fileFrom(page, OLD));
        await active(page, 'modal-confirm');
        const first = await confirmText(page);
        assert.match(first, /ตั้งค่าเงินในไฟล์ต่างจากเครื่องนี้/);
        assert.match(first, /VAT: เครื่องนี้ เปิด → ในไฟล์ ปิด/);
        await page.click('#btn-confirm-yes');
        await page.waitForFunction(() => /กด "ยืนยัน" = นำเข้าข้อมูลต่อ/.test(document.getElementById('confirm-modal-msg').innerText) &&
          document.getElementById('modal-confirm').classList.contains('active'));
        await page.click('#btn-confirm-yes');
        await page.waitForFunction(() => (window.__toasts || []).some(m => /นำเข้าข้อมูล(และรีเฟรชหน้าจอสำเร็จ|ไม่สำเร็จ)/.test(m)));
        assert.ok((await page.evaluate(() => window.__toasts)).some(m => /นำเข้าข้อมูลและรีเฟรชหน้าจอสำเร็จ/.test(m)), 'นำเข้าไม่สำเร็จ');
        assert.ok((await page.evaluate(() => window.__toasts)).some(m => /คงตั้งค่าเงินของเครื่องนี้ไว้/.test(m)));
        const st = await page.evaluate(() => ({ v: app.vatEnabled, f: app.cardFeeRate, p: app.shopPromptPayId }));
        assert.deepEqual(st, { v: true, f: 8, p: '0899999999' });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });

    await t('ข) กดยกเลิกที่คำถามตั้งค่าเงิน → กล่องพิมพ์ยืนยัน → พิมพ์ "ใช้ค่าในไฟล์" → ได้ค่าในไฟล์', async () => {
      const { context, page, errors } = await fresh();
      try {
        await pick(page, await fileFrom(page, OLD));
        await active(page, 'modal-confirm');
        await page.click('#btn-confirm-yes');
        await page.waitForFunction(() => /กด "ยกเลิก" = ไม่คงค่าของเครื่องนี้/.test(document.getElementById('confirm-modal-msg').innerText) &&
          document.getElementById('modal-confirm').classList.contains('active'));
        await page.click('#btn-confirm-cancel');
        await active(page, 'modal-prompt');
        assert.match(await promptText(page), /ใช้ค่าในไฟล์/);
        await page.fill('#prompt-modal-input', 'ใช้ค่าในไฟล์');
        await page.click('#btn-prompt-submit');
        await page.waitForFunction(() => !app.restoreBusy && app.vatEnabled === false);
        const st = await page.evaluate(() => ({ v: app.vatEnabled, f: app.cardFeeRate, p: app.shopPromptPayId }));
        assert.deepEqual(st, { v: false, f: 10, p: '0812345678' });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });

    await t('ค) ไฟล์จากเครื่องฉุกเฉินที่ไม่ครบ → คำเตือน ⛔ ในกล่องแรก · กดยกเลิกในกล่องพิมพ์ = ไม่แตะข้อมูล', async () => {
      const { context, page, errors } = await fresh();
      try {
        await pick(page, await fileFrom(page, { recoveryStatus: { incomplete: true, startedAt: Date.now() - 3600e3 }, transactions: [] }));
        await active(page, 'modal-confirm');
        assert.match(await confirmText(page), /⛔/);
        await page.click('#btn-confirm-yes');
        await active(page, 'modal-prompt');
        assert.match(await promptText(page), /ไฟล์ไม่ครบ/);
        await page.click('#modal-prompt button.secondary');
        await page.waitForFunction(() => !app.restoreBusy);
        assert.equal(await page.evaluate(() => app.state.transactions.length), 1);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } catch (e) {
    fail++; console.log('  FAIL (ตั้งค่าเทสต์)', e && e.message);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
    process.exit(fail ? 1 : 0);
  }
})();
