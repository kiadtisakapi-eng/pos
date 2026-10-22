// แก้ 22 ต.ค. 2569 — เบราว์เซอร์จริง (Chromium · จอ iPad แนวตั้ง) กดปุ่มจริง · Apps Script ตัวจริงบนชีตจำลอง · ข้อมูลสมมติทั้งหมด
//   อาการจริงที่ร้าน (iPad รุ่น 1.12.0): "ผู้จัดการ" ปิดกะ → กลับหน้าแดชบอร์ดเฉย ๆ ไม่เด้งหน้าเปิดกะ ต้องปัดแอปทิ้งแล้วเข้าใหม่
//   + สรุป Telegram ออกช้า (รอคิวหลังงานชีต/ไฟล์สำรอง)
//   [1] บัญชีที่หน้าร้านเรียก "ผู้จัดการ" แต่ตั้งสิทธิ์เป็นเจ้าของ ปิดกะ → หน้าเข้าสู่ระบบขึ้นทันที (ไม่ค้างหน้าแดชบอร์ด)
//   [2] Telegram ออกภายในไม่กี่วินาที ทั้งที่สรุปวัน/เดือนบนชีตยังไม่ตอบ
//   [3] คนถัดไปเข้าระบบ → หน้านับเงินเปิดกะเด้งเอง → เปิดกะได้ (ไม่ต้องปัดแอปทิ้ง)
//   [4] ตัวควบคุม: ผู้จัดการตัวจริงปิดกะ → หน้าเข้าสู่ระบบเหมือนเดิม
//   node tests/e2e_fix_20261022_close_shift.js
const { chromium } = require('playwright');
const { createGasEnv } = require('./gas_env.js');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' };
// POS_APP_SRC = เสิร์ฟ app.js รุ่นอื่นแทน (พิสูจน์ว่าเทสต์นี้ตกกับโค้ดก่อนแก้)
const APP_OVERRIDE = process.env.POS_APP_SRC ? path.resolve(process.env.POS_APP_SRC) : '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
  let p = path.join(ROOT, f); if (APP_OVERRIDE && f === '/app.js') p = APP_OVERRIDE;
  if ((!p.startsWith(ROOT) && p !== APP_OVERRIDE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(''); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });

let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runCase(b, label, account) {
  console.log(`\n── ${label}`);
  const gas = createGasEnv();
  const c = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  // สรุปวัน/เดือนบนชีต "ยังไม่ตอบ" จนกว่าเทสต์จะปล่อย (Apps Script จริงใช้ 5–10 วินาทีต่อคำขอ)
  let releaseSummaries; const summariesGate = new Promise(r => { releaseSummaries = r; });
  await c.route('https://script.google.com/**', async route => {
    const body = route.request().postData() || '';
    let action = ''; try { action = JSON.parse(body).action; } catch (e) {}
    if (/^summary_/.test(String(action))) await summariesGate;
    const out = gas.ctx.doPost({ postData: { contents: body, length: Buffer.byteLength(body, 'utf8'), type: 'text/plain' } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: String(out) });
  });
  const tg = [];
  await c.route('https://api.telegram.org/**', async route => {
    let text = ''; try { text = JSON.parse(route.request().postData() || '{}').text || ''; } catch (e) {}
    tg.push({ at: Date.now(), text });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, result: {} }) });
  });
  const port = srv.address().port;
  await c.route(u => !String(u).startsWith(`http://localhost:${port}/`) && !/^https:\/\/(script\.google\.com|api\.telegram\.org)\//.test(String(u)), r => r.abort());
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR_FAILED/i.test(m.text())) errors.push(m.text()); });
  await p.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.app && app.state && app._writerDecided);
  await p.evaluate(async ({ url, token, account }) => {
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id: 'st-1', name: 'เอ', role: 'ช่าง', active: true, accessLevel: 'staff', pin: await app.hashPin('111111') },
      { id: 'st-9', name: 'ซี', role: 'ผู้จัดการ', active: true, accessLevel: account, pin: await app.hashPin('999999') }];
    app.state.services = [{ id: 's1', name: 'ตัดผมชาย', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' }];
    app.state.categories = [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active: true, startTime: Date.now() - 6 * 3600e3, startCash: 1000, startDetails: { 1000: 1 }, expenses: [], history: [] };
    app.vatEnabled = false; app.cardFeeRate = 10;
    app.googleSheetsUrl = url; app.googleSheetsApiToken = token;
    app.telegramToken = '123456789:' + 'A'.repeat(35); app.telegramChatId = '-1001234567';
    if (!await app.saveState()) throw new Error('seed failed');
  }, { url: SHEETS_URL, token: gas.token, account });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.app && app._writerDecided && document.getElementById('modal-login').classList.contains('active'));
  const login = async (uid, pin) => {
    await p.click(`#login-user-list [data-uid="${uid}"]`);
    await p.fill('#login-pin-input', pin);
    await p.click('#modal-login button.primary');
    await p.waitForFunction(() => app.currentUser && !document.getElementById('modal-login').classList.contains('active'));
  };
  await login('st-9', '999999');
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => app.switchTab('pos'));
    await p.click('.service-card:has-text("ตัดผมชาย")');
    for (const s of await p.$$('.cart-item-staff select')) await s.selectOption('st-1');
    await p.click('#btn-checkout');
    await p.waitForFunction(() => document.getElementById('modal-payment').classList.contains('active'));
    await p.click('#pay-cash-btn'); await p.fill('#cash-received', '300');
    await p.click('#btn-complete-checkout');
    await p.waitForFunction(() => !document.getElementById('modal-payment').classList.contains('active'));
    await p.evaluate(() => app.closeModal('modal-receipt'));
  }
  await p.evaluate(() => app._mutationChain); await sleep(300);
  // ── ปิดกะจากหน้าแดชบอร์ด (ทางเดียวกับที่ร้านกด) ──
  await p.evaluate(() => app.switchTab('dashboard'));
  await p.click('#btn-close-store');
  await p.waitForSelector('#modal-cash-counter.active');
  await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '1');
  await p.fill('#form-cash-counter .cash-qty-input[data-denom="100"]', '6');
  const tClose = Date.now();
  await p.click('#btn-confirm-cash-counter');
  if (account === 'manager') {   // ผู้จัดการใส่ PIN ซ้ำก่อนปิดกะ (ข้อ 8)
    await p.waitForSelector('#modal-prompt.active');
    await p.fill('#prompt-modal-input', '999999');
    await p.click('#btn-prompt-submit');
  }
  const loginShown = await p.waitForFunction(() => document.getElementById('modal-login').classList.contains('active'), null, { timeout: 4000 }).then(() => true, () => false);
  const st = await p.evaluate(() => ({ role: app.currentRole, shift: app.state.shift.active,
    cash: document.getElementById('modal-cash-counter').classList.contains('active'),
    loginVisible: (() => { const el = document.querySelector('#modal-login .modal-card'); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() }));
  t(`[1] ปิดกะแล้วหน้าเข้าสู่ระบบขึ้นทันที (ไม่ค้างหน้าแดชบอร์ด)`, loginShown && st.loginVisible && st.role === null && st.shift === false && !st.cash, st);
  // ── Telegram ออกทั้งที่ชีตยังไม่ตอบ ──
  for (let i = 0; i < 40 && !tg.length; i++) await sleep(100);
  const tgDelay = tg.length ? (tg[0].at - tClose) / 1000 : null;
  t(`[2] Telegram สรุปปิดกะออกภายใน 4 วินาที ทั้งที่สรุปบนชีตยังไม่ตอบ (${tgDelay === null ? 'ไม่ออก' : tgDelay.toFixed(1) + ' วิ'})`,
    tgDelay !== null && tgDelay < 4 && /รายงานสรุปปิดกะ/.test(tg[0].text), tg.map(x => x.text.slice(0, 40)));
  releaseSummaries();
  // ── คนถัดไปเข้าระบบ → หน้าเปิดกะเด้งเอง ──
  if (loginShown) {
    await login('st-1', '111111');
    const openShown = await p.waitForFunction(() => document.getElementById('modal-cash-counter').classList.contains('active') && app.cashCounterMode === 'open', null, { timeout: 4000 }).then(() => true, () => false);
    t('[3] คนถัดไปเข้าระบบ → หน้านับเงินเปิดกะเด้งเอง', openShown);
    if (openShown) {
      await p.fill('#form-cash-counter .cash-qty-input[data-denom="1000"]', '1');
      await p.click('#btn-confirm-cash-counter');
      const opened = await p.waitForFunction(() => app.state.shift.active === true, null, { timeout: 8000 }).then(() => true, () => false);
      t('[3] เปิดกะใหม่ได้ทันที (ไม่ต้องปัดแอปทิ้ง)', opened);
    }
  }
  await sleep(1500);
  t('Telegram ปิดกะออกครั้งเดียว', tg.filter(x => /รายงานสรุปปิดกะ/.test(x.text)).length === 1, tg.length);
  t('ไม่มี error ในหน้าเว็บ', errors.length === 0, errors);
  await c.close();
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  try {
    await runCase(b, 'บัญชี "ผู้จัดการ" ที่ตั้งสิทธิ์เป็นเจ้าของ (อาการที่ร้านเจอ)', 'owner');
    await runCase(b, '[4] ตัวควบคุม: ผู้จัดการตัวจริง', 'manager');
  } finally { await b.close(); srv.close(); }
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL ล้มกลางทาง: ' + (e && e.stack || e)); console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail + 1} ===`); process.exit(1); });
