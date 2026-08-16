// เปิดหน้าแอปจริงในเบราว์เซอร์ ตรวจว่าไม่มีไฟล์โหลดไม่ติด และไอคอนขึ้นจริง
const { chromium } = require('playwright');
// ไฟล์นี้อยู่ในโฟลเดอร์ tests/ — ไฟล์โปรเจกต์จริงอยู่โฟลเดอร์แม่
const ROOT = require('path').resolve(__dirname, '..');

const http = require('http'), fs = require('fs'), path = require('path');

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.woff2':'font/woff2', '.ttf':'font/ttf', '.png':'image/png' };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { console.log('   [server 404]', f); res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(8099, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ offline: false });
  const page = await ctx.newPage();

  const failures = [], errors = [], external = [];
  page.on('requestfailed', r => failures.push(r.url() + ' :: ' + (r.failure()||{}).errorText));
  page.on('response', r => { if (r.status() >= 400) failures.push(r.status() + ' ' + r.url()); });
  page.on('requestfinished', () => {});
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost:8099') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  ctx.on('response', r => { if (r.status() >= 400) failures.push('[ctx] ' + r.status() + ' ' + r.url()); });
  ctx.on('requestfailed', r => failures.push('[ctx-fail] ' + r.url()));

  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ไอคอนขึ้นจริงไหม — วัดความกว้างของ glyph ที่ font-family เป็น Font Awesome
  const iconOk = await page.evaluate(() => {
    const el = document.querySelector('i.fa-solid');
    if (!el) return { found: false };
    const cs = getComputedStyle(el, '::before');
    return { found: true, family: getComputedStyle(el).fontFamily, content: cs.content, w: el.getBoundingClientRect().width };
  });
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(f => f.family + ' ' + f.status);
  });

  console.log('\n=== คำขอที่วิ่งออกนอกเครื่อง (ควรว่าง) ===');
  console.log(external.length ? external : '  ✅ ไม่มีเลย — ไม่ต้องพึ่งเน็ตนอก');
  console.log('\n=== ไฟล์ที่โหลดไม่ติด / 404 (ควรว่าง) ===');
  console.log(failures.length ? failures : '  ✅ ไม่มี');
  console.log('\n=== error ในหน้า ===');
  console.log(errors.length ? errors : '  ✅ ไม่มี');
  console.log('\n=== ฟอนต์ที่โหลดสำเร็จ ===');
  console.log(fontsLoaded.filter(f => /Awesome/i.test(f)).map(f => '  ' + f).join('\n') || '  (ไม่พบ)');
  console.log('\n=== ไอคอนตัวอย่าง ===');
  console.log('  font-family:', iconOk.family, '· content:', iconOk.content, '· กว้าง', Math.round(iconOk.w || 0), 'px');

  const iconRendered = iconOk.found && /Awesome/i.test(iconOk.family || '') && (iconOk.w || 0) > 3;
  console.log('\n' + '─'.repeat(50));
  console.log('ไอคอนแสดงผลจริง:', iconRendered ? '✅ ใช่' : '❌ ไม่');
  await browser.close(); srv.close();
  process.exit((!external.length && !failures.length && !errors.length && iconRendered) ? 0 : 1);
})();
