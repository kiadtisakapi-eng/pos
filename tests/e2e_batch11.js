// ชุด 11 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง + Apps Script ตัวจริงบนชีตจำลอง) — รอบตรวจ 5 (2 ต.ค. 2569)
//   [A] รหัสเชื่อมต่อถูกเปลี่ยนที่ Apps Script → ขึ้นสาเหตุบนจอ (ข้อความ + หน้าตั้งค่า) · กดซิงก์หนึ่งครั้ง = ยิงหนึ่งคำขอ
//   [B] นำเข้าไฟล์สำรองที่เก่ากว่าการยกเลิก/แก้บิล → กล่อง "บิลรอตรวจ" ขึ้นปุ่มให้เจ้าของเลือก (iPad + มือถือ ไม่ล้นจอ)
//       → กดเลือกแล้วชีตเป็นไปตามที่เลือก · แถบข้างเปลี่ยนชื่อร้าน/ธีมตามไฟล์ทันที
//   [C] เครื่องใหม่นำเข้าไฟล์ → บอกบัญชีผู้จัดการที่ต้องตั้ง PIN ใหม่
//   [D] แตะ "บันทึก" ค่าใช้จ่ายซ้ำตอนเครื่องบันทึกช้า → ได้รายการเดียว
//   [E] บิลลงเครื่องแล้วแต่หน้าจอหลังบันทึกพัง → ข้อความบอกว่าบันทึกแล้ว (ไม่ใช่ "ชำระเงินล้มเหลว")
//
//   node tests/e2e_batch11.js        (ภาพหน้าจอ: SHOT=1 → โฟลเดอร์ shots/)
const { chromium } = require('playwright');
const { createGasEnv } = require('./gas_env.js');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,400):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const PORT = 8131;
const shot = async (pg, name) => { if (!process.env.SHOT) return; fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); await pg.screenshot({ path: path.join(ROOT, 'shots', name + '.png') }); };
const toastText = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); return c ? c.innerText : ''; });
const clearToasts = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); if (c) c.innerHTML = ''; });
const settle = (pg, ms) => pg.waitForTimeout(ms == null ? 400 : ms);
const syncNow = pg => pg.evaluate(async () => { await app.syncPendingTransactions(true); await app.flushCloudOutbox(); });

async function newShop(b, gas, seen) {
  const c = await b.newContext({ viewport:{width:1180,height:820}, hasTouch:true });
  // คำขอไป Apps Script → google_apps_script.js ตัวจริง · ปลายทางอื่นทั้งหมดถูกบล็อก (ไม่มีเน็ตออกจริง)
  await c.route('https://script.google.com/**', async route => {
    const body = route.request().postData() || '';
    try { seen.push(JSON.parse(body).action || 'transaction'); } catch (e) { seen.push('?'); }
    const out = gas.ctx.doPost({ postData: { contents: body } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: String(out) });
  });
  await c.route(u => !new RegExp('^http://localhost:' + PORT + '/').test(String(u)) && !/^https:\/\/script\.google\.com\//.test(String(u)), r => r.abort());
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  // ข้อความ error ที่ตั้งใจให้เกิดในเทสต์นี้ (ส่งไม่ผ่าน/หน้าจอพังจำลอง) ไม่นับ
  p.on('console', m => { if (m.type()==='error' && !/favicon|Failed to load resource|Failed to sync transaction|Void delete|Daily summary|Monthly summary|Auto backup|บันทึกบิลแล้ว แต่หน้าจอ|จำลอง|addExpense save failed|export before restore/i.test(m.text())) errors.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/index.html', { waitUntil:'networkidle' });
  await ready(p);
  return { c, p, errors };
}
async function seedShop(p, gas, withManager) {
  await p.evaluate(async ({ url, token, withManager }) => {
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [{ id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('1111') }];
    if (withManager) app.state.staff.push({ id:'mg-1', name:'สมหญิง', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('222222') });
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = false; app.shopPromptPayId = '0812345678';
    app.googleSheetsUrl = url; app.googleSheetsApiToken = token;
    await app.saveState();
    await app.saveKeys([{ key: 'googleSheetsUrl', value: url }, { key: 'googleSheetsApiToken', value: token }]);
  }, { url: SHEETS_URL, token: gas.token, withManager });
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
}
async function loginOwner(p) {
  if (await p.evaluate(() => app.currentRole === 'owner')) return;
  await p.evaluate(() => app.requireLogin());
  await p.waitForSelector('#modal-login.active', { timeout: 6000 });
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '246810');
  await p.click('#modal-login button.primary');
  await settle(p, 500);
}
async function sell(p) {
  return p.evaluate(async () => {
    app.state.cart = [{ uniqueCartId:'u' + Date.now(), id:'s1', name:'ตัดผมชาย', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย' }];
    app.state.selectedPaymentMethod = 'credit';
    document.getElementById('cart-discount').value = '0';
    app.beginCheckoutAttempt();
    await app.processCheckout();
    app.closeModal('modal-receipt');
    const txs = app.state.transactions; return txs[txs.length - 1].id;
  });
}
async function confirmYes(p) { await p.waitForSelector('#modal-confirm.active', { timeout: 6000 }); await p.click('#btn-confirm-yes'); await settle(p, 300); }
async function answerDialogs(p) {
  // หน้าต่างยืนยันที่ขึ้นต่อกันระหว่างนำเข้า: ยืนยันการนำเข้า = ตกลง · ชวนเปิดหน้าตรวจความตรงกันหลังกู้ = ไว้ทีหลัง
  for (let i = 0; i < 8; i++) {
    const msg = await p.evaluate(() => document.getElementById('modal-confirm').classList.contains('active')
      ? document.getElementById('confirm-modal-msg').innerText : null);
    if (msg !== null) {
      if (/ตรวจความตรงกันกับชีต/.test(msg)) { await p.click('#btn-confirm-cancel'); await settle(p, 300); }
      else await confirmYes(p);
    }
    await settle(p, 400);
  }
}
async function importFile(p, obj) {
  const f = path.join(os.tmpdir(), `pos-e2e11-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(obj));
  await p.evaluate(() => app.switchTab('settings'));
  await p.setInputFiles('#import-file-input', f);
  await settle(p, 600);
  await answerDialogs(p);
  await settle(p, 800);
  t('(เงื่อนไข) หลังนำเข้าไม่มีหน้าต่างค้างบังจอ', await p.evaluate(() => document.querySelectorAll('.modal-overlay.active').length === 0),
    await p.evaluate(() => [...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)));
  fs.unlinkSync(f);
}
const monthTab = (gas) => gas.sheetNames().find(n => /^\d\d-\d{4}$/.test(n));
const sheetTotal = (gas, id) => {
  const sh = gas.sheet(monthTab(gas)); if (!sh) return null;
  const g = sh._grid, h = g[0]; const col = h.findIndex(x => String(x).trim() === 'ยอดสุทธิ (฿)');
  const r = g.slice(1).find(x => String(x[0]).trim() === id); return r ? r[col] : null;
};
// ปุ่มในกล่องบิลรอตรวจของบิลใบหนึ่ง: กดถึงไหม (ไม่ถูกบัง) · อยู่ในจอไหม
const conflictButtons = (p, id) => p.evaluate((id) => {
  const box = document.getElementById('sync-conflicts-box');
  if (!box) return null;
  const row = [...box.children].find(d => d.innerText && d.innerText.includes(id));
  if (!row) return { shown: box.style.display !== 'none', rows: box.children.length, found: false };
  row.scrollIntoView({ block: 'center', behavior: 'instant' });   // ไม่ใช้เลื่อนแบบนุ่ม (วัดตำแหน่งทันที)
  const btns = [...row.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.innerText.trim(), onTop: hit === b || b.contains(hit), inView: r.left >= 0 && r.right <= window.innerWidth + 0.5 };
  });
  return { shown: true, found: true, btns, msg: row.innerText, vw: window.innerWidth, sw: document.documentElement.scrollWidth };
}, id);
const clickConflict = (p, id, label) => p.evaluate(({ id, label }) => {
  const row = [...document.getElementById('sync-conflicts-box').children].find(d => d.innerText && d.innerText.includes(id));
  const b = [...row.querySelectorAll('button')].find(x => x.innerText.trim() === label);
  b.click(); return true;
}, { id, label });

(async () => {
  await new Promise(r=>srv.listen(PORT,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const gas = createGasEnv();
  gas.setupOwnerKey();
  const seen = [];
  const A = await newShop(b, gas, seen);
  const p = A.p;
  await seedShop(p, gas, true);
  await loginOwner(p);

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[A] รหัสเชื่อมต่อถูกเปลี่ยนที่ Apps Script → สาเหตุขึ้นบนจอ · หยุดยิงวน');
  const x1 = await sell(p), x2 = await sell(p), x3 = await sell(p);
  await syncNow(p); await settle(p);
  t('(เงื่อนไข) ขาย 3 บิล ขึ้นชีตครบ', [x1, x2, x3].every(id => sheetTotal(gas, id) === 300));
  gas.props.POS_API_TOKEN = 'R'.repeat(64);          // เจ้าของเผลอรัน rotatePosApiToken
  await clearToasts(p);
  const x4 = await sell(p); await settle(p, 1500);
  const bgToast = await toastText(p);
  t('ซิงก์เบื้องหลังไม่ผ่าน → ข้อความบนจอบอกสาเหตุและวิธีแก้ (เดิมเงียบ)', /ส่งบิลขึ้นชีตไม่ได้/.test(bgToast) && /รหัสเชื่อมต่อไม่ตรง/.test(bgToast), bgToast);
  await p.evaluate(() => app.switchTab('settings')); await settle(p, 300);
  const details = await p.evaluate(() => document.getElementById('sync-status-details').innerText);
  t('หน้าตั้งค่า "สถานะบิลค้างซิงก์" บอกสาเหตุล่าสุด', /สาเหตุล่าสุด/.test(details) && /รหัสเชื่อมต่อไม่ตรง/.test(details), details);
  const before = seen.filter(a => a === 'transaction').length;
  await p.click('#btn-sync-now'); await settle(p, 1500);
  t('กด "ซิงก์ข้อมูลที่ค้างอยู่ตอนนี้" หนึ่งครั้ง → ยิงหนึ่งคำขอ แล้วหยุดรอบ', seen.filter(a => a === 'transaction').length - before === 1, seen.slice(-5));
  await shot(p, 'e2e11-a-reason');
  gas.props.POS_API_TOKEN = gas.token;                 // แก้ที่ Apps Script แล้ว (รัน setupPosApiToken เดิม)
  await p.click('#btn-sync-now'); await settle(p, 1500);
  t('แก้รหัสแล้วกดซิงก์ → บิลค้างขึ้นชีต', sheetTotal(gas, x4) === 300);

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[B] นำเข้าไฟล์ที่เก่ากว่าการยกเลิก/แก้บิล → บิลรอตรวจให้เจ้าของเลือก (iPad + มือถือ)');
  await syncNow(p); await settle(p);
  const file = await p.evaluate(() => JSON.parse(JSON.stringify(app.buildBackupPayload())));
  await settle(p, 50);
  // ยกเลิก x1 (คืนเงิน) และแก้ส่วนลด x2 หลังไฟล์สำรอง
  await p.evaluate((id) => { document.getElementById('edit-tx-id').value = id; document.getElementById('void-money-outcome').value = 'refunded'; app.voidTransaction(); }, x1);
  await confirmYes(p); await settle(p, 600);
  await p.evaluate(async (id) => { app.openTransactionEdit(id); document.getElementById('edit-tx-discount').value = '50'; await app.saveTransactionEdit(); app.closeModal('modal-edit-transaction'); }, x2);
  await syncNow(p); await settle(p, 600);
  t('(เงื่อนไข) ชีต: x1 ถูกลบแถว · x2 = 250', sheetTotal(gas, x1) === null && sheetTotal(gas, x2) === 250, [sheetTotal(gas, x1), sheetTotal(gas, x2)]);
  const curTheme = await p.evaluate(() => document.documentElement.getAttribute('data-theme') || app.theme);
  file.shopName = 'ร้านจากไฟล์สำรอง'; file.theme = curTheme === 'dark' ? 'light' : 'dark';
  await clearToasts(p);
  await importFile(p, file);
  await syncNow(p); await settle(p, 800);
  const side = await p.evaluate(() => ({ name: (document.querySelector('.brand-info h2') || {}).textContent, theme: document.documentElement.getAttribute('data-theme') }));
  t('แถบข้างเปลี่ยนชื่อร้าน/ธีมตามไฟล์ทันที (เดิมต้องปิดเปิดแอป)', side.name === 'ร้านจากไฟล์สำรอง' && side.theme === file.theme, side);
  t('ชีตไม่ถูกย้อนเงียบ ๆ: x1 ไม่กลับขึ้นชีต · x2 ยังเป็น 250', sheetTotal(gas, x1) === null && sheetTotal(gas, x2) === 250, [sheetTotal(gas, x1), sheetTotal(gas, x2)]);
  await p.evaluate(() => { app.switchTab('settings'); app.renderSyncConflicts(); }); await settle(p, 300);
  let c1 = await conflictButtons(p, x1), c2 = await conflictButtons(p, x2);
  t('กล่อง "บิลรอตรวจ" มีบิลที่ยกเลิกหลังไฟล์ พร้อมปุ่ม คืนบิลนี้ขึ้นชีต / ยกเลิกในเครื่องตามชีต',
    c1 && c1.found && c1.btns.map(x => x.text).join('|') === 'คืนบิลนี้ขึ้นชีต|ยกเลิกในเครื่องตามชีต' && /หลังไฟล์สำรอง/.test(c1.msg), c1);
  t('…และบิลที่ชีตถูกแก้หลังไฟล์ พร้อมปุ่ม แก้บิล / ใช้ข้อมูลในเครื่องทับชีต',
    c2 && c2.found && c2.btns.map(x => x.text).join('|') === 'แก้บิล|ใช้ข้อมูลในเครื่องทับชีต' && /หลังไฟล์สำรอง/.test(c2.msg), c2);
  t('iPad: ทุกปุ่มกดถึง (ไม่ถูกบัง) และไม่ล้นจอ', [c1, c2].every(c => c && c.btns.every(x => x.onTop && x.inView)) && c1.sw <= c1.vw, [c1, c2]);
  await shot(p, 'e2e11-b-conflicts-ipad');
  await p.setViewportSize({ width: 390, height: 844 }); await settle(p, 400);
  c1 = await conflictButtons(p, x1); c2 = await conflictButtons(p, x2);
  t('มือถือ (390px): ทุกปุ่มกดถึงและไม่ล้นจอแนวนอน', [c1, c2].every(c => c && c.btns.every(x => x.onTop && x.inView)) && c1.sw <= c1.vw, [c1, c2]);
  await shot(p, 'e2e11-b-conflicts-phone');
  await p.setViewportSize({ width: 1180, height: 820 }); await settle(p, 300);
  await clickConflict(p, x2, 'แก้บิล'); await settle(p, 500);
  t('ปุ่ม "แก้บิล" เปิดหน้าต่างแก้บิลใบนั้น', await p.evaluate((id) => document.getElementById('modal-edit-transaction').classList.contains('active') && document.getElementById('edit-tx-id').value === id, x2));
  await p.evaluate(() => app.closeModal('modal-edit-transaction')); await settle(p, 300);
  await clickConflict(p, x1, 'ยกเลิกในเครื่องตามชีต'); await settle(p, 900);
  t('กด "ยกเลิกในเครื่องตามชีต" → บิลออกจากเครื่อง · ชีตยังไม่มีแถว', await p.evaluate((id) => !app.state.transactions.some(x => x.id === id), x1) && sheetTotal(gas, x1) === null);
  await clickConflict(p, x2, 'ใช้ข้อมูลในเครื่องทับชีต'); await settle(p, 1200); await syncNow(p); await settle(p, 600);
  t('กด "ใช้ข้อมูลในเครื่องทับชีต" → ชีตเป็นยอดของไฟล์ที่กู้ (300) · ไม่มีบิลรอตรวจเหลือ',
    sheetTotal(gas, x2) === 300 && await p.evaluate(() => !app.state.transactions.some(x => x.syncStatus === 'conflict') && document.getElementById('sync-conflicts-box').style.display === 'none'),
    sheetTotal(gas, x2));

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[C] เครื่องใหม่นำเข้าไฟล์ → บอกบัญชีผู้จัดการที่ต้องตั้ง PIN ใหม่');
  const B = await newShop(b, createGasEnv(), []);
  await seedShop(B.p, gas, false);
  await loginOwner(B.p);
  await clearToasts(B.p);
  await importFile(B.p, file);
  const tb = await toastText(B.p);
  t('ข้อความบอกชื่อบัญชีผู้จัดการ + ให้ไปตั้ง PIN ที่หน้าพนักงาน', /สมหญิง \(ผู้จัดการ\)/.test(tb) && /ตั้ง PIN ใหม่/.test(tb), tb);
  await shot(B.p, 'e2e11-c-pin-warning');
  t('ไม่มี JavaScript error (เครื่องใหม่)', B.errors.length === 0, B.errors);
  await B.c.close();

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[D] แตะ "บันทึก" ค่าใช้จ่ายซ้ำตอนเครื่องบันทึกช้า → ได้รายการเดียว');
  await p.evaluate(() => app.switchTab('dashboard')); await settle(p, 300);
  await p.selectOption('#expense-type', 'other'); await p.dispatchEvent('#expense-type', 'change');
  await p.fill('#expense-amount', '80'); await p.fill('#expense-note', 'น้ำแข็ง');
  await p.selectOption('#expense-source', 'drawer');
  const n0 = await p.evaluate(() => app.state.shift.expenses.length);
  await p.evaluate(() => { const o = app.saveStateOrThrow.bind(app); app.saveStateOrThrow = async (...a) => { await new Promise(r => setTimeout(r, 250)); return o(...a); }; });
  await clearToasts(p);
  await p.evaluate(() => { const btn = document.querySelector('#form-add-expense button[type="submit"]'); btn.click(); setTimeout(() => btn.click(), 60); });
  await settle(p, 1200);
  const exps = await p.evaluate(() => app.state.shift.expenses.map(e => e.amount));
  t('แตะซ้ำห่าง 60 ms ขณะบันทึกใช้ 250 ms → ค่าใช้จ่ายเพิ่ม 1 รายการ (เดิม 2)', exps.length - n0 === 1, exps);
  t('ขึ้นข้อความว่ากำลังบันทึกรายการนี้อยู่', /กำลังบันทึกอยู่/.test(await toastText(p)));

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[E] บิลลงเครื่องแล้วแต่หน้าจอหลังบันทึกพัง → ไม่ขึ้น "ชำระเงินล้มเหลว"');
  await clearToasts(p);
  await p.evaluate(() => { const o = app.renderDashboard.bind(app); let once = true; app.renderDashboard = (...a) => { if (once) { once = false; throw new TypeError('จำลองหน้าจอพัง'); } return o(...a); }; });
  const nBefore = await p.evaluate(() => app.state.transactions.length);
  const idE = await sell(p); await settle(p, 500);
  const te = await toastText(p);
  t('บิลลงเครื่องแล้ว 1 ใบ', await p.evaluate(() => app.state.transactions.length) === nBefore + 1);
  t('ข้อความบอกเลขบิลที่บันทึกแล้ว + ห้ามเก็บเงินซ้ำ · ไม่มีคำว่า "ชำระเงินล้มเหลว"', te.includes(idE) && /ห้ามเก็บเงินลูกค้าซ้ำ/.test(te) && !/ชำระเงินล้มเหลว/.test(te), te);
  t('ตะกร้าว่าง · หน้าต่างชำระเงินปิดแล้ว', await p.evaluate(() => app.state.cart.length === 0 && !document.getElementById('modal-payment').classList.contains('active')));
  await shot(p, 'e2e11-e-postsave');

  t('ไม่มี JavaScript error ตลอดชุด (เครื่องหลัก)', A.errors.length === 0, A.errors);
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
