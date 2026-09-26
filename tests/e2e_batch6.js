// ชุด 6 บนเบราว์เซอร์จริง (Chromium + IndexedDB จริง + Apps Script ตัวจริงบนชีตจำลอง) — กดปุ่มเหมือนคนใช้
//   เครื่องที่ไม่ใช่เครื่องหลัก: เปิดแอปแล้วป้ายมุมบนต้องฟ้องทันที (จอคอม + จอมือถือ ไม่ล้นจอ)
//   → เจ้าของกด "ตั้งเครื่องนี้เป็นเครื่องหลัก" + กรอกรหัสเจ้าของในหน้าต่างของแอป → คำเตือนหาย
//   คำขอที่แอปยิงไป script.google.com ถูกส่งเข้า google_apps_script.js ตัวจริง (tests/gas_env.js) ไม่ใช่คำตอบปลอม
//
//   node tests/e2e_batch6.js        (ภาพหน้าจอ: SHOT=1 → โฟลเดอร์ shots/)
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
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+String(typeof x==='string'?x:JSON.stringify(x)).slice(0,300):''));} };
const ready = pg => pg.waitForFunction(() => window.app && window.app.state, null, { timeout: 20000 });
const SHEETS_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const shot = async (pg, name) => { if (!process.env.SHOT) return; fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true }); await pg.screenshot({ path: path.join(ROOT, 'shots', name + '.png') }); };
const badgeText = (pg) => pg.evaluate(() => {
  const vis = (id) => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return { text: el.innerText, shown: r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none', right: r.right,
      warn: (el.closest('.sync-badge-container') || el).classList.contains('sync-warning') }; };
  return { side: vis('sidebar-sync-text'), mobile: vis('mobile-sync-text'), vw: window.innerWidth, sw: document.documentElement.scrollWidth };
});

async function loginOwner(p) {
  if (await p.evaluate(()=>app.currentRole==='owner')) return;
  await p.evaluate(()=>app.requireLogin());
  await p.click('#login-user-list .login-user-btn[data-uid="__owner__"]');
  await p.fill('#login-pin-input', '111111');
  await p.click('#modal-login button.primary');
  await p.waitForTimeout(500);
}

(async () => {
  await new Promise(r=>srv.listen(8126,r));
  const gas = createGasEnv();
  const ownerKey = gas.setupOwnerKey();
  // ร้านมีเครื่องหลักอยู่แล้ว (iPad เครื่องเดิม) — เครื่องที่เปิดอยู่นี้คือเครื่องใหม่
  gas.props.POS_PRIMARY_DEVICE = JSON.stringify({ id: 'dev-' + 'a'.repeat(32), label: 'POS-AAAA', claimedAt: Date.now() - 86400e3, how: 'owner' });

  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  const c = await b.newContext({ viewport:{width:1180,height:900}, hasTouch:true });
  // คำขอไป Apps Script → google_apps_script.js ตัวจริง · ปลายทางอื่นทั้งหมดถูกบล็อก (ไม่มีเน็ตออกจริง)
  const seen = [];   // คำสั่งที่แอปยิงถึง Apps Script ตามลำดับ
  await c.route('https://script.google.com/**', async route => {
    const body = route.request().postData() || '';
    try { seen.push(JSON.parse(body).action); } catch (e) { seen.push('?'); }
    const out = gas.ctx.doPost({ postData: { contents: body } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: String(out) });
  });
  await c.route(u => !/^http:\/\/localhost:8126\//.test(String(u)) && !/^https:\/\/script\.google\.com\//.test(String(u)), r => r.abort());
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message)));
  p.on('console', m => { if (m.type()==='error' && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text()); });

  await p.goto('http://localhost:8126/index.html', { waitUntil:'networkidle' });
  await ready(p);
  await p.evaluate(async ({ url, token }) => {
    app.ownerPin = await app.hashPin('111111');
    app.state.staff = [{ id:'st-1', name:'สมชาย', role:'ช่างตัดผม', active:true, accessLevel:'staff', pin: await app.hashPin('222222') }];
    app.state.services = [{ id:'s1', name:'ตัดผมชาย', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
    app.state.categories = [{ id:'barber', name:'ตัดผม', icon:'fa-scissors', vat:false }];
    app.state.transactions = []; app.state.queue = []; app.state.cart = [];
    // กะเปิดอยู่แล้ว (ไม่งั้นล็อกอินแล้วแอปเด้งหน้าต่างเปิดกะมาบังปุ่ม)
    app.state.shift = { active:true, startTime:Date.now() - 3600e3, startCash:1000, startDetails:{}, expenses:[], history:[] };
    app.googleSheetsUrl = url; app.googleSheetsApiToken = token;
    await app.saveState();
    await app.saveKeys([{ key: 'googleSheetsUrl', value: url }, { key: 'googleSheetsApiToken', value: token }]);
  }, { url: SHEETS_URL, token: gas.token });

  console.log('\n[1] เปิดแอปบนเครื่องที่ไม่ใช่เครื่องหลัก → ป้ายมุมบนฟ้องเอง (ไม่ต้องรอปิดกะ)');
  await p.reload({ waitUntil:'networkidle' });
  await ready(p);
  await p.waitForFunction(() => /ไม่ใช่เครื่องหลัก/.test((document.getElementById('sidebar-sync-text') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  let bt = await badgeText(p);
  t('ถามสถานะเครื่องหลักกับ Apps Script ตอนเปิดแอป', seen.includes('primary_status'), seen);
  t('ป้ายแถบข้าง (จอคอม) ขึ้น "ไม่ได้สำรอง: ไม่ใช่เครื่องหลัก" และเป็นสีเตือน', bt.side && bt.side.shown && /ไม่ใช่เครื่องหลัก/.test(bt.side.text) && bt.side.warn, bt.side);
  t('ไม่มีการส่งไฟล์สำรอง/สรุปออกไปเลย', !seen.some(a => /^(backup|summary_day|summary_month)$/.test(a)), seen);
  await shot(p, 'b6-desktop-paused');

  console.log('\n[2] จอมือถือ: ป้ายต้องเห็นและไม่ล้นจอ');
  for (const [w, h] of [[390, 844], [360, 740], [320, 640]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(250);
    bt = await badgeText(p);
    t(`กว้าง ${w}px: ป้ายมือถือเห็นข้อความเตือน · หน้าไม่ล้นแนวนอน`, bt.mobile && bt.mobile.shown && /ไม่ใช่เครื่องหลัก/.test(bt.mobile.text) && bt.sw <= bt.vw && bt.mobile.right <= bt.vw + 1, bt);
    if (w === 390) await shot(p, 'b6-mobile-paused');
  }
  await p.setViewportSize({ width: 1180, height: 900 });

  console.log('\n[3] เจ้าของตั้งเครื่องหลักจากหน้าตั้งค่า (กดปุ่ม + กรอกรหัสเจ้าของในหน้าต่างของแอป)');
  await loginOwner(p);
  if (process.env.SHOT) { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300); await shot(p, 'b6-mobile-paused-loggedin'); await p.setViewportSize({ width: 1180, height: 900 }); }
  await p.evaluate(() => app.switchTab('settings'));
  await p.waitForTimeout(400);
  const boxBefore = await p.innerText('#primary-device-box');
  t('กล่องเครื่องหลักบอกว่าเครื่องหลักคือ POS-AAAA และมีปุ่มตั้งเครื่องนี้', /POS-AAAA/.test(boxBefore) && /ตั้งเครื่องนี้เป็นเครื่องหลัก/.test(boxBefore), boxBefore);
  t('สถานะสำรองบอกว่าพักการสำรองอยู่', /พักการสำรอง/.test(await p.innerText('#backup-status-label')), await p.innerText('#backup-status-label'));
  await shot(p, 'b6-settings-paused');
  await p.click('#primary-device-box button');
  await p.waitForSelector('#modal-confirm.active', { timeout: 5000 });
  await p.click('#btn-confirm-yes');
  await p.waitForSelector('#modal-prompt.active', { timeout: 8000 });
  t('หน้าต่างถามรหัสเจ้าของเป็นช่องรหัสผ่าน (ไม่โชว์ตัวอักษร)', (await p.getAttribute('#prompt-modal-input', 'type')) === 'password');
  await p.fill('#prompt-modal-input', ownerKey.toLowerCase().replace(/-/g, ''));   // พิมพ์ตัวเล็ก/ไม่ใส่ขีดก็ต้องได้
  await p.click('#btn-prompt-submit');
  await p.waitForFunction(() => !/ไม่ใช่เครื่องหลัก/.test((document.getElementById('sidebar-sync-text') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  bt = await badgeText(p);
  const devId = await p.evaluate(() => app.deviceId);
  t('Apps Script บันทึกเครื่องนี้เป็นเครื่องหลักแล้ว', JSON.parse(gas.props.POS_PRIMARY_DEVICE).id === devId);
  t('ป้ายมุมบนเลิกเตือนเรื่องเครื่องหลัก', bt.side && !/ไม่ใช่เครื่องหลัก/.test(bt.side.text), bt.side);
  const boxAfter = await p.innerText('#primary-device-box');
  t('กล่องเครื่องหลักขึ้นว่าเครื่องนี้คือเครื่องหลัก ✓', /เครื่องหลัก — ส่งสรุป/.test(boxAfter), boxAfter);
  await shot(p, 'b6-settings-primary');
  t('ไม่มี error ในหน้าเว็บตลอดการทดสอบ', errors.length === 0, errors);

  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ❌ ล้มกลางทาง: ' + (e && e.stack || e)); console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail + 1} ===`); process.exit(1); });
