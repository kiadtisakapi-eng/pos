// จำลองหน้าร้าน: เปิดแอปตอนมีเน็ต → ตัดเน็ต → เปิดใหม่ → ต้องใช้งานได้ครบ
const { chromium } = require('playwright');
// ไฟล์นี้อยู่ในโฟลเดอร์ tests/ — ไฟล์โปรเจกต์จริงอยู่โฟลเดอร์แม่
const ROOT = require('path').resolve(__dirname, '..');

const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.woff2':'font/woff2', '.ttf':'font/ttf', '.png':'image/png' };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const probe = async (page) => page.evaluate(async () => {
  await document.fonts.ready;
  const icon = document.querySelector('i.fa-solid');
  const iconW = icon ? icon.getBoundingClientRect().width : 0;
  const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight);
  // วัดความกว้างข้อความไทยด้วย Sarabun เทียบกับ sans-serif — ต่างกัน = ฟอนต์จริงถูกใช้
  const mk = (fam) => { const s = document.createElement('span');
    s.style.cssText = `position:absolute;visibility:hidden;font:700 40px ${fam};white-space:nowrap`;
    s.textContent = 'ยอดขายวันนี้ ค่าคอมมิชชั่น'; document.body.appendChild(s);
    const w = s.getBoundingClientRect().width; s.remove(); return w; };
  return { iconW, loaded, sarabunW: mk("'Sarabun',sans-serif"), plainW: mk('sans-serif'),
           bodyFont: getComputedStyle(document.body).fontFamily };
});
(async () => {
  await new Promise(r => srv.listen(8098, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log('\n[1] เปิดแอปครั้งแรก (มีเน็ต) — ให้ Service Worker แคชไฟล์');
  await page.goto('http://localhost:8098/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null || performance.now() > 8000, null, { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(3000);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return { cacheName: keys[0], count: (await c.keys()).length };
  });
  console.log(`  แคชชื่อ ${cached.cacheName} · เก็บไว้ ${cached.count} ไฟล์`);
  const online = await probe(page);
  console.log(`  ไอคอนกว้าง ${Math.round(online.iconW)}px · ฟอนต์ที่โหลดจริง ${online.loaded.length} ตัว`);

  console.log('\n[2] ตัดเน็ต แล้วเปิดแอปใหม่');
  await ctx.setOffline(true);
  const failures = [];
  page.on('requestfailed', r => failures.push(r.url().replace('http://localhost:8098', '')));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const off = await probe(page);

  const sarabunUsed = Math.abs(off.sarabunW - off.plainW) > 1;
  const iconOk = off.iconW > 3;
  const faLoaded = off.loaded.some(f => /Awesome/i.test(f));
  const sarabunLoaded = off.loaded.some(f => /Sarabun/i.test(f));

  console.log(`  ไฟล์ที่โหลดไม่ติดตอนออฟไลน์: ${failures.length ? failures.join(', ') : 'ไม่มี'}`);
  console.log(`  ฟอนต์ที่โหลดสำเร็จตอนออฟไลน์: ${off.loaded.join(' | ') || '(ไม่มี)'}`);
  console.log(`  ความกว้างข้อความไทย: Sarabun=${Math.round(off.sarabunW)}px vs ฟอนต์ระบบ=${Math.round(off.plainW)}px`);
  console.log('\n' + '─'.repeat(52));
  console.log('  ' + (iconOk ? '✅' : '❌') + ' ไอคอนยังขึ้นตอนออฟไลน์');
  console.log('  ' + (faLoaded ? '✅' : '❌') + ' Font Awesome โหลดจากแคชได้');
  console.log('  ' + (sarabunLoaded ? '✅' : '❌') + ' ฟอนต์ไทย Sarabun โหลดจากแคชได้');
  console.log('  ' + (sarabunUsed ? '✅' : '❌') + ' ข้อความไทยใช้ Sarabun จริง ไม่ใช่ฟอนต์ระบบ');
  console.log('  ' + (!failures.length ? '✅' : '❌') + ' ไม่มีไฟล์ไหนโหลดไม่ติด');
  await browser.close(); srv.close();
  process.exit((iconOk && faLoaded && sarabunLoaded && sarabunUsed && !failures.length) ? 0 : 1);
})();
