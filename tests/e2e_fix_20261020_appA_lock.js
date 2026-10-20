// ตรวจ 19 ต.ค. 2569 ข้อ 4 — ล็อกหน้าต่างหลักค้างในเบราว์เซอร์จริง (Chromium: Web Locks + BroadcastChannel ของจริง)
//   ก) หน้าต่างแอปสองหน้าต่างที่ยังมีชีวิต: หน้าต่างที่สองยังอ่านอย่างเดียว แม้เลยเวลา ping (~1 วิ) ไปแล้ว
//   ข) ล็อกถูกถือโดย "หน้าที่ไม่ใช่แอปที่ทำงานอยู่" (จำลองล็อกค้างของหน้าที่รีโหลดไปแล้ว — WebKit bug 283528):
//      หน้าแอปที่เปิดใหม่ไม่ได้คำตอบ ping → ขอล็อกแบบ steal → เขียนได้เอง · ผู้ถือเดิมได้ AbortError (ล็อกหลุดจริง)
// ข้อมูลสังเคราะห์ทั้งหมด · ไม่มีเน็ตออกนอกเครื่อง
//   node tests/e2e_fix_20261020_appA_lock.js
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
let PORT = 0;   // พอร์ตว่างที่ระบบให้ — ไม่ชนเทสต์อื่น
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 200) : '')); } };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
  const file = path.resolve(ROOT, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function boot(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app && app.ownerPin && app._writerDecided !== undefined && app.state);
  return page;
}
const lockHolders = (page) => page.evaluate(async () => {
  const q = await navigator.locks.query();
  return { held: q.held.filter(l => l.name === 'jahn-pos-writer').length, pending: q.pending.filter(l => l.name === 'jahn-pos-writer').length };
});

(async () => {
  await new Promise(r => server.listen(0, r));
  PORT = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  try {
    console.log('\n── ก) สองหน้าต่างแอปที่ยังมีชีวิต');
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
      const A = await boot(ctx);
      await A.waitForFunction(() => app.isReadOnlyWindow === false);
      const B = await boot(ctx);
      await B.waitForTimeout(2500);                        // เลยเวลารอ ping (1 วิ) ไปมาก
      t('หน้าต่างที่สองยังอ่านอย่างเดียว (หน้าต่างหลักตอบ ping)', await B.evaluate(() => app.isReadOnlyWindow === true));
      t('หน้าต่างหลักยังเขียนได้', await A.evaluate(() => app.isReadOnlyWindow === false));
      t('แถบแดงบอกให้ปัดปิดแอปถ้าไม่มีหน้าต่างอื่น', await B.evaluate(() => /ปัดปิดแอปแล้วเปิดใหม่/.test((document.getElementById('read-only-window-banner') || {}).innerText || '')));
      const res = await B.evaluate(() => app.retryWriterFromBanner(document.getElementById('read-only-retry-btn')));
      t('กดปุ่มแดงขณะหน้าต่างหลักยังอยู่ → ไม่ได้สิทธิ์', res === false, res);
      t('ยังอ่านอย่างเดียวหลังกดปุ่ม', await B.evaluate(() => app.isReadOnlyWindow === true));
      t('หน้าต่างหลักไม่ถูกแย่ง', await A.evaluate(() => app.isReadOnlyWindow === false));
      await A.close();
      await B.waitForFunction(() => app.isReadOnlyWindow === false, null, { timeout: 15000 }).catch(() => {});
      t('ปิดหน้าต่างหลักแล้ว หน้าต่างที่สองรับสิทธิ์ต่อ', await B.evaluate(() => app.isReadOnlyWindow === false));
      await ctx.close();
    }

    console.log('\n── ข) ล็อกค้างจากหน้าที่ไม่ได้รันแอปแล้ว (ไม่มีใครตอบ ping)');
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
      const Z = await ctx.newPage();
      await Z.goto(`http://localhost:${PORT}/__blank`);
      await Z.evaluate(() => {
        window.__lockState = 'waiting';
        navigator.locks.request('jahn-pos-writer', () => { window.__lockState = 'held'; return new Promise(() => {}); })
          .then(() => { window.__lockState = 'released'; }, (e) => { window.__lockState = 'lost:' + e.name; });
      });
      await Z.waitForFunction(() => window.__lockState === 'held');
      const N = await boot(ctx);
      await N.waitForFunction(() => app.isReadOnlyWindow === false, null, { timeout: 8000 }).catch(() => {});
      t('หน้าแอปใหม่รับสิทธิ์เองภายในไม่กี่วินาที (แย่งล็อกค้าง)', await N.evaluate(() => app.isReadOnlyWindow === false));
      t('ไม่มีแถบแดงค้าง', await N.evaluate(() => !document.getElementById('read-only-window-banner')));
      t('ผู้ถือล็อกเดิมถูกแย่งจริง (AbortError)', (await Z.evaluate(() => window.__lockState)) === 'lost:AbortError', await Z.evaluate(() => window.__lockState));
      const locks = await lockHolders(N);
      t('ล็อกมีผู้ถือหนึ่งเดียว', locks.held === 1, locks);
      t('บันทึกลงเครื่องได้', await N.evaluate(async () => (await app.saveState()) === true));
      await ctx.close();
    }
  } catch (e) { fail++; console.log('  FAIL crash', e && e.message); }
  finally { await browser.close(); server.close(); }
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
