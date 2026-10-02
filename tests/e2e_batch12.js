// ชุด 12 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง + Apps Script ตัวจริงบนชีตจำลอง) — รอบตรวจ 6 (2 ต.ค. 2569)
//   [A] หน้าตั้งค่าไม่มีปุ่ม "ล้างประวัติยอดขาย" · ปุ่ม "ล้างข้อมูลทั้งหมด" (3 ด่าน) ยังอยู่และกดถึง (iPad + มือถือ)
//   [B] พิมพ์ใบเสร็จ/ใบแจ้งยอด ตอนบนจอมีปุ่มตะกร้าลอย + แถบ "มีเวอร์ชันใหม่" + ข้อความแจ้งเตือน
//       → บนกระดาษเหลือแค่ใบเสร็จ (จอกว้างเท่ากระดาษ 80 มม. / มือถือ / iPad)
//       · ทุกคำสั่งในบล็อกพิมพ์ เบราว์เซอร์รับจริง (เดิม size: 80mm auto ถูกทิ้งเงียบ ๆ แต่เทสต์เดิมบังคับให้มีบรรทัดนั้น)
//   [C] พนักงานลงค่าใช้จ่ายจากลิ้นชักสองรายการติดกันขณะคิวงานบันทึกติดงานอื่น (เช่นผลซิงก์หลังขาย)
//       → รายการที่ทำให้เกิน 300 ไม่ถูกบันทึก
//       ฟอร์มยังมีค่าครบ → กดบันทึกอีกครั้ง → ขอ PIN ผู้จัดการ → บันทึกพร้อมรายละเอียด (อ่าน IndexedDB หลังรีโหลด)
//   [D] หน้ากู้จาก Drive (Apps Script ตัวจริง): ไฟล์เกิน 50 → บอกว่าแสดงไฟล์ล่าสุด 50 ไฟล์ + ไฟล์เก่าอยู่ที่ไหน
//       (iPad + มือถือ ไม่ล้นจอ ปุ่มไฟล์ยังกดได้) · ไฟล์น้อยกว่า 50 → ไม่มีข้อความนี้
//   [E] คำสั่งล้างยอดขาย (ถอดปุ่มแล้ว แต่คำสั่งยังอยู่): มีบิลค้างนอกชีต → ไม่ถามต่อ · พิมพ์คำยืนยันผิด → ไม่ล้าง
//       ผ่านทุกด่าน → สำรองขึ้น Drive ก่อนแล้วค่อยล้างในเครื่อง · แถวบิลบนชีตยังอยู่
//
//   node tests/e2e_batch12.js        (ภาพหน้าจอ + PDF: SHOT=1 → โฟลเดอร์ shots/)
//   พิสูจน์ว่าจับของจริง: รันไฟล์นี้กับโปรเจกต์ก่อนแก้ (รอบตรวจ 6) → ต้องตก
const { chromium } = require('playwright');
const { createGasEnv } = require('./gas_env.js');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const PORT = 8132;
const shot = async (pg, name) => { if (!process.env.SHOT) return; fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); await pg.screenshot({ path: path.join(ROOT, 'shots', name + '.png') }); };
const toastText = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); return c ? c.innerText : ''; });
const clearToasts = pg => pg.evaluate(() => { const c = document.getElementById('toast-container'); if (c) c.innerHTML = ''; });
const settle = (pg, ms) => pg.waitForTimeout(ms == null ? 400 : ms);
const syncNow = pg => pg.evaluate(async () => { await app.syncPendingTransactions(true); await app.flushCloudOutbox(); });
const onTop = (pg, sel) => pg.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return (hit === el || el.contains(hit)) && r.left >= 0 && r.right <= window.innerWidth + 0.5;
}, sel);
// ข้อความ error ที่ตั้งใจให้เกิดในชุดนี้ (ตัดเน็ตตอนขาย) ไม่นับ
const EXPECTED_CONSOLE = /favicon|Failed to load resource|Failed to sync transaction|Void delete|Daily summary|Monthly summary|Auto backup/i;

// ── บล็อก @media print ในไฟล์ CSS → กฎตามลำดับ { prelude, decls:[{prop,value}] } (ตัดคอมเมนต์ก่อน) ──
function printBlockRules(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const i = css.indexOf('@media print');
  if (i < 0) return null;
  let k = css.indexOf('{', i) + 1; const start = k; let d = 1;
  while (d > 0 && k < css.length) { if (css[k] === '{') d++; else if (css[k] === '}') d--; k++; }
  const body = css.slice(start, k - 1);
  const rules = []; let pos = 0;
  for (;;) {
    const open = body.indexOf('{', pos); if (open < 0) break;
    const close = body.indexOf('}', open);
    const decls = body.slice(open + 1, close).split(';').map(s => s.trim()).filter(Boolean)
      .map(s => { const c = s.indexOf(':'); return { prop: s.slice(0, c).trim(), value: s.slice(c + 1).trim() }; });
    rules.push({ prelude: body.slice(pos, open).trim().replace(/\s+/g, ' '), decls });
    pos = close + 1;
  }
  return rules;
}

async function newShop(b, holder) {
  const c = await b.newContext({ viewport:{width:1180,height:820}, hasTouch:true });
  // คำขอไป Apps Script → google_apps_script.js ตัวจริง (holder.down = เน็ตหลุด) · ปลายทางอื่นทั้งหมดถูกบล็อก
  await c.route('https://script.google.com/**', async route => {
    if (holder.down) return route.abort('internetdisconnected');
    const body = route.request().postData() || '';
    const out = holder.gas.ctx.doPost({ postData: { contents: body } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: String(out) });
  });
  await c.route(u => !new RegExp('^http://localhost:' + PORT + '/').test(String(u)) && !/^https:\/\/script\.google\.com\//.test(String(u)), r => r.abort());
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !EXPECTED_CONSOLE.test(m.text())) errors.push(m.text()); });
  // กล่องของเบราว์เซอร์ (prompt/confirm) — ตอบตามที่แต่ละหัวข้อตั้งไว้ใน holder.dialog
  holder.dialogs = [];
  p.on('dialog', async dlg => {
    holder.dialogs.push({ type: dlg.type(), msg: dlg.message() });
    const ans = holder.dialog || {};
    if (dlg.type() === 'prompt') { if (ans.prompt == null) await dlg.dismiss(); else await dlg.accept(ans.prompt); }
    else if (dlg.type() === 'confirm') { if (ans.confirm) await dlg.accept(); else await dlg.dismiss(); }
    else await dlg.accept();
  });
  await p.goto('http://localhost:' + PORT + '/index.html', { waitUntil:'networkidle' });
  await ready(p);
  return { c, p, errors };
}
async function seedShop(p, gas) {
  await p.evaluate(async ({ url, token }) => {
    try { localStorage.removeItem('epos_login_guard'); } catch (e) {}
    app.ownerPin = await app.hashPin('246810');
    app.state.staff = [
      { id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('1111') },
      { id:'mg-1', name:'สมหญิง', role:'ผู้จัดการ', active:true, accessLevel:'manager', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{1000:1}, expenses:[], history:[] };
    app.vatEnabled = false; app.shopPromptPayId = '0812345678';
    app.googleSheetsUrl = url; app.googleSheetsApiToken = token;
    await app.saveState();
    await app.saveKeys([{ key: 'googleSheetsUrl', value: url }, { key: 'googleSheetsApiToken', value: token }]);
  }, { url: SHEETS_URL, token: gas.token });
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
}
async function login(p, uid, pin) {
  await p.evaluate(() => { if (app.currentRole && app.logout) app.logout(); });
  await settle(p, 300);
  if (!(await p.evaluate(() => document.getElementById('modal-login').classList.contains('active')))) {
    await p.evaluate(() => app.requireLogin()); await settle(p, 300);
  }
  await p.click(`#login-user-list .login-user-btn[data-uid="${uid}"]`);
  await p.fill('#login-pin-input', pin);
  await p.click('#modal-login button.primary');
  await settle(p, 500);
}
async function typePrompt(p, value) {
  await p.waitForSelector('#modal-prompt.active', { timeout: 6000 });
  await p.fill('#prompt-modal-input', value);
  await p.click('#btn-prompt-submit');
  await settle(p, 300);
}
async function sell(p) {
  return p.evaluate(async () => {
    app.state.cart = [{ uniqueCartId:'u' + Date.now() + Math.random(), id:'s1', name:'ตัดผมชาย', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย' }];
    app.state.selectedPaymentMethod = 'credit';
    document.getElementById('cart-discount').value = '0';
    app.beginCheckoutAttempt();
    await app.processCheckout();
    app.closeModal('modal-receipt');
    const txs = app.state.transactions; return txs[txs.length - 1].id;
  });
}
const driveFiles = (gas) => Object.values(gas.DriveApp._folders).flatMap(f => f._files.filter(x => !x._trashed));
const monthRowIds = (gas) => gas.sheetNames().filter(n => /^\d\d-\d{4}$/.test(n))
  .flatMap(n => gas.sheet(n)._grid.slice(1).map(r => String(r[0]).trim()));
// สิ่งที่ "เห็นได้" ในชั้นบนสุดของหน้า + ส่วนของใบเสร็จ (ใช้ทั้งตอนอยู่บนจอและตอนจำลองการพิมพ์)
const layerState = (p, billId) => p.evaluate((billId) => {
  const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rec = document.getElementById('modal-receipt'), quo = document.getElementById('modal-quote');
  const prev = document.getElementById('thermal-receipt-preview'), qprev = document.getElementById('quote-preview');
  return {
    shown: [...document.body.children].filter(vis).map(e => e.id || String(e.className || e.tagName)),
    cart: vis(document.getElementById('mobile-cart-trigger')),
    toast: vis(document.getElementById('toast-container')),
    bar: vis(document.getElementById('app-update-bar')),
    receipt: vis(prev), bill: !!prev && prev.innerText.includes(billId),
    quote: vis(qprev),
    chrome: [rec, quo].some(m => m && [...m.querySelectorAll('.modal-header, .modal-footer, .modal-close')].some(vis)),
    direct: !!rec && !!quo && rec.parentElement === document.body && quo.parentElement === document.body
  };
}, billId || '');
const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;

(async () => {
  await new Promise(r=>srv.listen(PORT,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const gas = createGasEnv();
  const ownerKey = gas.setupOwnerKey();
  const holder = { gas, down: false, dialog: null };
  const A = await newShop(b, holder);
  const p = A.p;
  await seedShop(p, gas);
  await login(p, '__owner__', '246810');
  t('(เงื่อนไข) เจ้าของล็อกอินได้', await p.evaluate(() => app.currentRole === 'owner'));

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[A] หน้าตั้งค่า: ไม่มีปุ่มล้างประวัติยอดขาย · ปุ่มล้างข้อมูลทั้งหมดยังอยู่');
  await p.evaluate(() => app.switchTab('settings')); await settle(p, 400);
  const a = await p.evaluate(() => ({
    byId: !!document.getElementById('btn-clear-sales'),
    byText: [...document.querySelectorAll('button')].filter(x => /ล้างประวัติยอดขาย/.test(x.innerText)).map(x => x.innerText.trim()),
    callers: [...document.querySelectorAll('[onclick]')].filter(e => /clearSalesData/.test(e.getAttribute('onclick') || '')).length
  }));
  t('ไม่มีปุ่มล้างประวัติยอดขายบนหน้าจอ (ทั้ง id/ข้อความ และไม่มีปุ่มไหนเรียกคำสั่งนี้)', !a.byId && a.byText.length === 0 && a.callers === 0, a);
  t('iPad: ปุ่ม "ล้างข้อมูลทั้งหมด" ยังอยู่และกดถึง', await onTop(p, '#btn-reset-data'));
  await shot(p, 'e2e12-a-settings-ipad');
  await p.setViewportSize({ width: 390, height: 844 }); await settle(p, 400);
  t('มือถือ: ปุ่ม "ล้างข้อมูลทั้งหมด" ยังอยู่และกดถึง · หน้าไม่ล้นจอแนวนอน',
    await onTop(p, '#btn-reset-data') && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(p, 'e2e12-a-settings-phone');

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[B] พิมพ์ใบเสร็จ: บนกระดาษเหลือแค่ใบเสร็จ แม้บนจอมีของลอยอยู่');
  await p.evaluate(() => app.switchTab('pos')); await settle(p, 300);
  const BILL = 'TX-PRINT-0001';
  await p.evaluate((id) => {
    app.showThermalReceipt({ id, date: Date.now(), customerName: 'คุณทดสอบ', services: ['ตัดผมชาย'],
      details: [{ name: 'ตัดผมชาย', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'สมชาย' }],
      subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', cashReceived: 500, cashChange: 200, staffNames: ['สมชาย'] });
    app.showToast('ส่งสรุป/แจ้งเตือนที่ค้างไว้สำเร็จแล้ว (1 รายการ)', 'success', 600000);   // ข้อความค้างบนจอตอนกดพิมพ์
    if (!document.getElementById('app-update-bar')) app.promptAppUpdate(null);                 // แถบ "มีเวอร์ชันใหม่" ค้าง
  }, BILL);
  await settle(p, 400);
  for (const v of [{ w: 302, h: 700, label: 'จอกว้างเท่ากระดาษ 80 มม.' }, { w: 390, h: 844, label: 'มือถือ' }, { w: 1180, h: 820, label: 'iPad' }]) {
    await p.setViewportSize({ width: v.w, height: v.h }); await settle(p, 300);
    const narrow = await p.evaluate(() => !matchMedia('(min-width: 1024px) and (min-height: 500px), (min-width: 768px) and (orientation: landscape) and (min-height: 500px)').matches);
    const scr = await layerState(p, BILL);
    // เงื่อนไขของเทสต์: บนจอต้องมีของลอยจริง ไม่งั้นข้อถัดไปไม่ได้พิสูจน์อะไร
    t(`(เงื่อนไข) ${v.label}: บนจอมีข้อความแจ้งเตือน + แถบอัปเดต${narrow ? ' + ปุ่มตะกร้าลอย' : ''} และใบเสร็จเปิดอยู่`,
      scr.toast && scr.bar && (!narrow || scr.cart) && scr.receipt && scr.bill, scr);
    await p.emulateMedia({ media: 'print' }); await settle(p, 200);
    const pr = await layerState(p, BILL);
    if (v.w === 302) await shot(p, 'e2e12-b-print-80mm');
    await p.emulateMedia({ media: 'screen' });
    t(`${v.label}: ตอนพิมพ์ ชั้นบนสุดของหน้าเหลือแค่หน้าต่างใบเสร็จ`, pr.shown.length === 1 && pr.shown[0] === 'modal-receipt', pr.shown);
    t(`${v.label}: ปุ่มตะกร้า/แถบอัปเดต/ข้อความแจ้งเตือน ไม่ติดไปบนกระดาษ`, !pr.cart && !pr.toast && !pr.bar, pr);
    t(`${v.label}: ใบเสร็จอยู่บนกระดาษครบ (มีเลขที่บิล) · หัว/ปุ่มของหน้าต่างไม่ติด`, pr.receipt && pr.bill && !pr.chrome, pr);
  }
  t('หน้าต่างใบเสร็จ/ใบแจ้งยอดอยู่ชั้นบนสุดของหน้า (กฎซ่อนตอนพิมพ์อาศัยข้อนี้)', (await layerState(p, BILL)).direct);
  // ⚠️ page.pdf() ใช้สื่อแบบ "จอ" ถ้าสั่ง emulateMedia screen ค้างไว้ — ต้องตั้งเป็น print ก่อนทุกครั้ง
  await p.emulateMedia({ media: 'print' });
  const pdf = await p.pdf({ width: '80mm', printBackground: true });
  await p.emulateMedia({ media: 'screen' });
  const pdfFile = path.join(require('os').tmpdir(), `e2e12-receipt-${process.pid}.pdf`);
  fs.writeFileSync(pdfFile, pdf);
  if (process.env.SHOT) fs.copyFileSync(pdfFile, path.join(ROOT, 'shots', 'e2e12-b-receipt-80mm.pdf'));
  t('PDF กว้าง 80 มม.: ใบเสร็จสั้นออกมา 1 แผ่น (ไม่มีกระดาษเปล่าตามหลัง)', pdfPages(pdf) === 1, pdfPages(pdf));
  // อ่านตัวหนังสือจาก PDF จริง (ต้องมีโปรแกรม pdftotext — เครื่องที่ไม่มีจะข้ามข้อนี้ ข้อที่วัดจากหน้าจอข้างบนยังครอบคลุม)
  let pdfText = null;
  try { pdfText = require('child_process').execFileSync('pdftotext', ['-layout', pdfFile, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { pdfText = null; }
  fs.unlinkSync(pdfFile);
  if (pdfText === null) console.log('  ⏭  ข้าม: อ่านตัวหนังสือจาก PDF (เครื่องนี้ไม่มี pdftotext)');
  else {
    const junk = ['อัปเดตเลย', 'มีเวอร์ชันใหม่', 'ส่งสรุป', 'แดชบอร์ด', 'ใบเสร็จรับเงินสำเร็จ', 'พิมพ์ใบเสร็จ'].filter(w => pdfText.includes(w));
    t('ตัวหนังสือใน PDF: มีใบเสร็จ และไม่มีแถบอัปเดต/ข้อความแจ้งเตือน/เมนู/หัวหน้าต่าง/ปุ่ม', /TX-PRINT/.test(pdfText) && /รวมทั้งสิ้น/.test(pdfText) && junk.length === 0, junk);
  }

  // ใบแจ้งยอด (ก่อนชำระเงิน) ใช้กฎเดียวกัน
  await p.evaluate(() => {
    app.closeModal('modal-receipt');
    app.state.cart = [{ uniqueCartId:'uq1', id:'s1', name:'ตัดผมชาย', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย' }];
    document.getElementById('cart-discount').value = '0';
    app.showQuotePreview();
  });
  await settle(p, 400);
  await p.setViewportSize({ width: 390, height: 844 }); await settle(p, 300);
  t('(เงื่อนไข) ใบแจ้งยอดเปิดอยู่', await p.evaluate(() => document.getElementById('modal-quote').classList.contains('active')));
  await p.emulateMedia({ media: 'print' }); await settle(p, 200);
  const q = await layerState(p, '');
  await p.emulateMedia({ media: 'screen' });
  t('ใบแจ้งยอด (มือถือ): ตอนพิมพ์เหลือแค่ใบแจ้งยอด ไม่มีปุ่มตะกร้า/แถบอัปเดต/ข้อความแจ้งเตือน',
    q.shown.length === 1 && q.shown[0] === 'modal-quote' && q.quote && !q.cart && !q.toast && !q.bar && !q.chrome, q);
  await p.evaluate(() => { app.closeModal('modal-quote'); app.state.cart = []; const u = document.getElementById('app-update-bar'); if (u) u.remove(); });
  await clearToasts(p);

  // คำสั่งในบล็อกพิมพ์ที่เบราว์เซอร์ทิ้ง = คำสั่งที่ไม่เคยทำงาน (แบบ size: 80mm auto ที่อยู่มาตั้งแต่ต้น)
  const src = printBlockRules(fs.readFileSync(path.join(ROOT, 'style_v2.css'), 'utf8'));
  const cssom = await p.evaluate((src) => {
    const sh = [...document.styleSheets].find(s => /style_v2\.css/.test(s.href || ''));
    const pr = sh && [...sh.cssRules].find(x => x.media && /\bprint\b/.test(x.media.mediaText));
    if (!src || !pr) return { err: 'ไม่พบบล็อก @media print' };
    const rules = [...pr.cssRules];
    const dropped = [], safariOnly = [];
    src.forEach((r, i) => {
      const cr = rules[i];
      if (!cr) { dropped.push(r.prelude + ' (ทั้งกฎ)'); return; }
      const has = prop => !!cr.style && cr.style.getPropertyValue(prop) !== '';
      r.decls.forEach(d => {
        if (has(d.prop)) return;
        // คำสั่ง -webkit- ที่ใส่ไว้ให้ Safari (iPad ของร้าน) คู่กับคำสั่งมาตรฐานในกฎเดียวกัน — Chromium ไม่รู้จักได้ ไม่ใช่ข้อผิดพลาด
        const std = d.prop.replace(/^-webkit-/, '');
        if (std !== d.prop && r.decls.some(x => x.prop === std) && has(std)) { safariOnly.push(d.prop); return; }
        dropped.push(`${r.prelude} → ${d.prop}: ${d.value}`);
      });
    });
    const page = rules.find(x => x.constructor && x.constructor.name === 'CSSPageRule');
    return { srcRules: src.length, domRules: rules.length, dropped, safariOnly,
      pageSize: page ? page.style.getPropertyValue('size') : null, pageMargin: page ? page.style.getPropertyValue('margin-top') : null };
  }, src);
  t('ทุกคำสั่งในบล็อกพิมพ์ เบราว์เซอร์รับจริง — ไม่มีบรรทัดที่ถูกทิ้งเงียบ ๆ (เดิม size: 80mm auto)',
    !cssom.err && cssom.srcRules === cssom.domRules && cssom.dropped.length === 0, cssom);
  t('@page: ไม่กำหนดขนาดกระดาษ (ให้เครื่องพิมพ์กำหนด) · ขอบ 3 มม.', cssom.pageSize === '' && cssom.pageMargin === '3mm', cssom);

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[C] ค่าใช้จ่ายจากลิ้นชัก: กดสองรายการติดกันขณะคิวงานบันทึกติดงานอื่น ต้องไม่หลุดเพดาน 300');
  await p.setViewportSize({ width: 1180, height: 900 }); await settle(p, 300);
  await login(p, 'st-1', '1111');
  t('(เงื่อนไข) พนักงานล็อกอินได้', await p.evaluate(() => app.currentRole === 'staff'));
  await p.evaluate(() => app.switchTab('dashboard')); await settle(p, 300);
  await p.selectOption('#expense-type', 'other'); await p.dispatchEvent('#expense-type', 'change');
  await p.fill('#expense-amount', '250'); await p.fill('#expense-note', 'น้ำแข็ง');
  await p.selectOption('#expense-source', 'drawer');
  await p.click('#form-add-expense button[type="submit"]'); await settle(p, 500);
  const mine = () => p.evaluate(() => app.state.shift.expenses.filter(e => e.byId === 'st-1').map(e => ({ amount: e.amount, note: e.note, approvedBy: e.approvedBy || '' })));
  t('(เงื่อนไข) ลง 250 → บันทึกเลย ไม่ถาม PIN', JSON.stringify((await mine()).map(e => e.amount)) === '[250]' &&
    !(await p.evaluate(() => document.getElementById('modal-prompt').classList.contains('active'))));
  // คิวงานบันทึกกำลังติดงานอื่นอยู่ (เช่นผลซิงก์หลังขายบิล บนเครื่องที่ข้อมูลเยอะ) 600 ms
  // ระหว่างนั้นพนักงานกดรายการ 40 แล้วพิมพ์รายการถัดไป 45 กดตามทันที (80 ms) — ทั้งสองรายการรอคิวอยู่
  // ด่านก่อนเข้าคิวของทั้งคู่เห็นยอดเดิม 250 (รายการแรกยังไม่ถูกบันทึก) จึงผ่านทั้งคู่ — ต้องถูกจับที่จุดบันทึกจริง
  await clearToasts(p);
  await p.evaluate(() => {
    app.withMutation('จำลองงานบันทึกเบื้องหลังที่ช้า', () => new Promise(r => setTimeout(r, 600)));
    const set = (amt, note) => { document.getElementById('expense-amount').value = String(amt); document.getElementById('expense-note').value = note; document.getElementById('expense-source').value = 'drawer'; };
    const btn = document.querySelector('#form-add-expense button[type="submit"]');
    set(40, 'ของใช้ ก'); btn.click();
    setTimeout(() => { set(45, 'ของใช้ ข'); btn.click(); }, 80);
  });
  await settle(p, 1600);
  const m1 = await mine();
  t('กดสองรายการติดกัน → บันทึกแค่รายการแรก รวม 290 ไม่เกินเพดาน (เดิมได้ 335 โดยไม่มีใครอนุมัติ)',
    JSON.stringify(m1.map(e => e.amount)) === '[250,40]', m1);
  t('รายการที่สองบอกเหตุผลบนจอ และไม่ได้เด้งหน้าต่าง PIN เอง', /เกินเพดานแล้ว/.test(await toastText(p)) &&
    !(await p.evaluate(() => document.getElementById('modal-prompt').classList.contains('active'))), await toastText(p));
  const form1 = await p.evaluate(() => ({ amount: document.getElementById('expense-amount').value, note: document.getElementById('expense-note').value }));
  t('ฟอร์มยังมีค่ารายการที่สองครบ (ยอด + รายละเอียด) ให้กดบันทึกใหม่ได้เลย', form1.amount === '45' && form1.note === 'ของใช้ ข', form1);
  await shot(p, 'e2e12-c-refused');
  // (โค้ดก่อนแก้: หน้าต่าง PIN อาจค้างจากรายการที่สอง — ปิดก่อน ไม่ให้บังปุ่ม แล้วให้ข้อถัดไปฟ้องเอง)
  await p.evaluate(() => { if (document.getElementById('modal-prompt').classList.contains('active')) app.closeModal('modal-prompt'); });
  await p.click('#form-add-expense button[type="submit"]');
  const asked = await p.waitForSelector('#modal-prompt.active', { timeout: 6000 }).then(() => true, () => false);
  const askTxt = asked ? await p.evaluate(() => document.getElementById('modal-prompt').innerText) : '(ไม่มีหน้าต่างขอ PIN)';
  t('กดบันทึกอีกครั้ง → ขอ PIN ผู้จัดการ บอกยอดรวม 335 และเพดาน 300', asked && /335/.test(askTxt) && /300/.test(askTxt), askTxt);
  t('ช่องใส่ PIN อยู่บนสุด กดได้จริง', asked && await onTop(p, '#prompt-modal-input'));
  if (asked) await typePrompt(p, '222222');
  await settle(p, 500);
  const m2 = await mine();
  const e45 = m2.find(e => e.amount === 45);
  t('ผู้จัดการใส่ PIN → บันทึก พร้อมชื่อผู้อนุมัติและรายละเอียดที่พิมพ์ไว้', !!e45 && e45.approvedBy === 'สมหญิง' && e45.note === 'ของใช้ ข', m2);
  t('บันทึกแล้วฟอร์มว่าง', await p.evaluate(() => document.getElementById('expense-amount').value === '' && document.getElementById('expense-note').value === ''));
  await p.reload({ waitUntil: 'networkidle' }); await ready(p);
  const m3 = await mine();
  t('รีโหลดแล้วอ่านจาก IndexedDB: 250 · 40 · 45 (อนุมัติโดยสมหญิง) — ไม่มีรายการเกิน/หาย',
    JSON.stringify(m3.map(e => e.amount)) === '[250,40,45]' && m3[2].approvedBy === 'สมหญิง', m3);

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[D] หน้ากู้จาก Drive: บอกว่ารายชื่อตัดที่ 50 ไฟล์ล่าสุด และไฟล์เก่าอยู่ที่ไหน');
  await login(p, '__owner__', '246810');
  const dev = await p.evaluate(() => app.deviceId);
  const payload = await p.evaluate(() => JSON.parse(JSON.stringify(app.buildBackupPayload())));
  let made = 0;
  for (let i = 0; i < 55; i++) { const r = gas.post({ action: 'backup', backupData: payload, deviceId: dev }); if (r.status === 'success') made++; }
  t('(เงื่อนไข) Drive มีไฟล์สำรองเกิน 50 ไฟล์ (ร้านสำรองวันละหลายไฟล์ ~2 สัปดาห์ก็เกิน)', made === 55 && driveFiles(gas).length > 50, { made, files: driveFiles(gas).length });
  await p.evaluate(() => { app.openRestoreModal(); });
  await typePrompt(p, ownerKey);   // คำสั่งนี้เปิดข้อมูลทั้งร้าน — Apps Script ขอรหัสเจ้าของ
  await p.waitForSelector('#restore-list .restore-item', { timeout: 8000 }).catch(() => {});
  const noteState = () => p.evaluate(() => {
    const list = document.getElementById('restore-list');
    const card = document.querySelector('#modal-restore .modal-card');
    const note = list.querySelector('p');
    const out = { items: list.querySelectorAll('.restore-item').length, text: note ? note.innerText : '' };
    if (note) {
      note.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = note.getBoundingClientRect(), cr = card.getBoundingClientRect(), cs = getComputedStyle(note);
      out.visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0 && r.width > 0;
      out.inCard = r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5;
    }
    out.hOverflow = (card && card.scrollWidth > card.clientWidth + 1) || document.documentElement.scrollWidth > window.innerWidth + 1;
    return out;
  });
  for (const v of [{ w: 1180, h: 820, label: 'iPad' }, { w: 390, h: 844, label: 'มือถือ' }]) {
    await p.setViewportSize({ width: v.w, height: v.h }); await settle(p, 400);
    const n = await noteState();
    t(`${v.label}: แสดง 50 ไฟล์ + ข้อความบอกว่าเป็นไฟล์ล่าสุด และไฟล์เก่าอยู่ในโฟลเดอร์ Drive (ใช้ปุ่มนำเข้า)`,
      n.items === 50 && /แสดงไฟล์ล่าสุด 50 ไฟล์/.test(n.text) && /Erotica_POS_Backups/.test(n.text) && /นำเข้าข้อมูลสำรอง/.test(n.text), n);
    t(`${v.label}: ข้อความอ่านได้อยู่ในกรอบหน้าต่าง ไม่ล้นจอแนวนอน`, n.visible && n.inCard && !n.hOverflow, n);
    t(`${v.label}: ปุ่มไฟล์ล่าสุดยังกดถึง (ข้อความไม่บัง)`, await onTop(p, '#restore-list .restore-item'));
    await shot(p, 'e2e12-d-restore-' + (v.w > 500 ? 'ipad' : 'phone'));
  }
  // ไฟล์น้อยกว่า 50 (ร้านเพิ่งเริ่ม/ไฟล์เก่าถูกลบตามอายุ) → แสดงครบทุกไฟล์อยู่แล้ว ไม่ต้องมีข้อความนี้
  Object.values(gas.DriveApp._folders).forEach(f => f._files.slice(3).forEach(x => { x._trashed = true; }));
  await p.evaluate(() => app.loadDriveBackups()); await settle(p, 400);
  const few = await noteState();
  t('ไฟล์ 3 ไฟล์ → แสดงครบ 3 ไฟล์ ไม่มีข้อความเรื่องไฟล์เก่า', few.items === 3 && few.text === '', few);
  await p.evaluate(() => app.closeModal('modal-restore')); await settle(p, 300);
  await p.setViewportSize({ width: 1180, height: 820 }); await settle(p, 300);

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[E] คำสั่งล้างยอดขาย (ไม่มีปุ่มแล้ว) ต้องผ่านด่าน: ไม่มีบิลค้าง → พิมพ์คำยืนยัน → สำรองขึ้น Drive ก่อน');
  const x1 = await sell(p), x2 = await sell(p);
  await syncNow(p); await settle(p, 500);
  holder.down = true;                                   // เน็ตหลุดตอนขายบิลที่ 3 — บิลนี้มีอยู่ในเครื่องที่เดียว
  const x3 = await sell(p); await settle(p, 800);
  holder.down = false;
  t('(เงื่อนไข) บิลที่ขายตอนเน็ตหลุดยังไม่ขึ้นชีต', !monthRowIds(gas).includes(x3) &&
    await p.evaluate((id) => app.state.transactions.find(x => x.id === id).syncStatus !== 'synced', x3));
  await clearToasts(p);
  holder.dialogs.length = 0; holder.dialog = { prompt: 'ล้างยอดขาย' };
  let r = await p.evaluate(() => app.clearSalesData());
  t('มีบิลที่ยังไม่ขึ้นชีต → ไม่ล้าง ไม่ถามต่อ และบอกเหตุผล (เดิมกดยืนยันครั้งเดียวบิลนี้หายถาวร)',
    r === false && holder.dialogs.length === 0 && /ยังไม่ขึ้นชีต/.test(await toastText(p)), { r, dialogs: holder.dialogs, toast: await toastText(p) });
  await syncNow(p); await settle(p, 600);
  t('(เงื่อนไข) ซิงก์ครบแล้ว', [x1, x2, x3].every(id => monthRowIds(gas).includes(id)));
  holder.dialogs.length = 0; holder.dialog = { prompt: 'ล้าง' };
  await clearToasts(p);
  r = await p.evaluate(() => app.clearSalesData());
  t('พิมพ์คำยืนยันไม่ตรง → ไม่ล้าง (ข้อมูลในเครื่องครบ)', r === false && holder.dialogs.length === 1 &&
    /ข้อความยืนยันไม่ตรง/.test(await toastText(p)) && await p.evaluate(() => app.state.transactions.length) === 3, { r, dialogs: holder.dialogs });
  t('กล่องยืนยันบอกจำนวนบิลที่จะถูกล้าง และบอกว่าแถวบนชีตไม่ถูกลบ', /บิล 3 รายการ/.test((holder.dialogs[0] || {}).msg || '') &&
    /ไม่ถูกลบ/.test((holder.dialogs[0] || {}).msg || ''), holder.dialogs[0]);
  const before = driveFiles(gas).length;
  holder.dialogs.length = 0; holder.dialog = { prompt: 'ล้างยอดขาย' };
  r = await p.evaluate(() => app.clearSalesData()); await settle(p, 600);
  const after = driveFiles(gas);
  const newest = after.length ? JSON.parse(after[after.length - 1]._content) : null;
  t('ผ่านทุกด่าน → ได้ไฟล์สำรองใหม่บน Drive ที่มีบิลครบ ก่อนล้าง (กู้กลับได้)', r === true && after.length === before + 1 &&
    !!newest && [x1, x2, x3].every(id => newest.transactions.some(x => x.id === id)), { r, before, after: after.length });
  t('แถวบิลบนชีตยังอยู่ครบ (ล้างเฉพาะในเครื่อง)', [x1, x2, x3].every(id => monthRowIds(gas).includes(id)));
  await p.reload({ waitUntil: 'networkidle' }); await ready(p);
  t('รีโหลดแล้วอ่านจาก IndexedDB: ยอดขายในเครื่องถูกล้างจริง', await p.evaluate(() => app.state.transactions.length === 0));

  t('ไม่มี JavaScript error ตลอดชุด', A.errors.length === 0, A.errors);
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
