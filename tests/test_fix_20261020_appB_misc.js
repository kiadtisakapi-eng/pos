// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) — ข้อเล็กหลายข้อ (โค้ดจริงบน IndexedDB จริง)
//   ข้อ 22 อัปเดตแอประหว่างมีหน้าต่างงานเปิด = ไม่ได้ (หน้าต่างล็อกอินไม่นับ)
//   ข้อ 55 สลับธีม: ขึ้น "เปลี่ยนแล้ว" เฉพาะเมื่อบันทึกสำเร็จ
//   ข้อ 61 ฟอร์มค่าใช้จ่าย/แก้บิล อ่านช่องเงินผ่าน requireEl (หาไม่เจอ = ฟ้องแล้วหยุด)
//   ข้อ 64 โลโก้ใหญ่เกิน 15 MB ไม่อ่านไฟล์
//   ข้อ 65 สถานะ "ที่เก็บข้อมูลถาวร" ในหน้าตั้งค่า
//   ข้อ 67 โค้ดค้างที่ไม่มีใครเรียก (roundToTotal · กิ่ง CDN ใน sw.js · #btn-print-receipt · #btn-theme-toggle · txs/exp)
//   ข้อ 45/66 ช่อง PIN/Owner key/Telegram token ไม่ให้ Safari จำรหัส · ป้ายชื่อสำหรับโปรแกรมอ่านหน้าจอ
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<v65>/app.js node tests/test_fix_20261020_appB_misc.js → ต้องตก
//  (ไฟล์หน้าเว็บ/CSS/sw.js อ่านจากโฟลเดอร์เดียวกับ app.js ที่ทดสอบ)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, settle } = require('./fixtures_db.js');
const R = makeRunner('--- fix 20 ต.ค. (appB) ข้อ 22 · 55 · 61 · 64 · 65 · 67 · 45 · 66 ---');
const t = R.t;
const DIR = path.dirname(process.env.POS_APP_SRC || path.join(__dirname, '..', 'app.js'));
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

(async () => {
  // ═══ ข้อ 22 ═════════════════════════════════════════════════════════════
  {
    const s = await makeShop({ role: 'owner' });
    try {
      const open = [];
      s.env.document.querySelectorAll = (q) => (/modal-overlay\.active/.test(String(q)) ? open : []);
      s.app.state.cart = []; s.app.state.selectedQueueIds = [];
      await t('22. ไม่มีหน้าต่างเปิด → อัปเดตได้', () => eq(s.app.canApplyAppUpdate(), true));
      open.push({ id: 'modal-cash-counter' });
      await t('22. หน้าต่างนับเงินปิดกะเปิดอยู่ → อัปเดตไม่ได้ (เดิมได้ ตัวเลขที่พิมพ์หาย)', () => eq(s.app.canApplyAppUpdate(), false));
      open.length = 0; open.push({ id: 'modal-login' });
      await t('22. หน้าต่างล็อกอินอย่างเดียว → อัปเดตได้ (ยังไม่ได้พิมพ์งานอะไร)', () => eq(s.app.canApplyAppUpdate(), true));
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 55 ═════════════════════════════════════════════════════════════
  {
    const s = await makeShop({ role: 'owner' });
    try {
      s.app.isReadOnlyWindow = true;   // หน้าต่างอ่านอย่างเดียว — บันทึกถูกปฏิเสธ
      s.toasts.length = 0;
      await s.app.toggleTheme(); await settle(20);
      await t('55. บันทึกธีมถูกปฏิเสธ → ไม่ขึ้น "เปลี่ยนเป็นโหมด…แล้ว"', () =>
        ok(!s.toasts.some(x => /เปลี่ยนเป็นโหมด/.test(x.m)), JSON.stringify(s.toasts)));
      s.app.isReadOnlyWindow = false;
      s.toasts.length = 0;
      await s.app.toggleTheme(); await settle(20);
      await t('55. บันทึกสำเร็จ → ขึ้น "เปลี่ยนเป็นโหมด…แล้ว" และค่าลงเครื่องจริง', async () => {
        ok(s.toasts.some(x => /เปลี่ยนเป็นโหมด/.test(x.m)), JSON.stringify(s.toasts));
        eq(await s.env.raw('theme'), s.app.theme);
      });
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 61 ═════════════════════════════════════════════════════════════
  {
    const s = await makeShop({ role: 'manager' });
    try {
      const d = s.env.document;
      const get = d.getElementById.bind(d);
      d.getElementById('expense-type').value = 'other'; d.getElementById('expense-amount').value = '120';
      d.getElementById('expense-source').value = 'drawer'; d.getElementById('expense-note').value = 'ทดสอบ';
      d.getElementById = (id) => (id === 'expense-amount' ? null : get(id));
      const n0 = (s.app.state.shift.expenses || []).length;
      s.toasts.length = 0;
      let threw = null;
      try { await s.app.addExpense(); } catch (e) { threw = e; }   // เดิม: TypeError (null.value) หลุดออกจากปุ่ม — พังเงียบ
      await settle(20);
      await t('61. ฟอร์มค่าใช้จ่าย: ช่องจำนวนเงินหาย → ฟ้อง "หน้าจอผิดพลาด" และไม่บันทึก (ไม่พังเงียบ)', () => {
        ok(!threw, 'โยน error ออกจากปุ่ม: ' + (threw && threw.message));
        eq((s.app.state.shift.expenses || []).length, n0);
        ok(s.toasts.some(x => /หน้าจอผิดพลาด/.test(x.m) && /expense-amount/.test(x.m)), JSON.stringify(s.toasts));
      });
      d.getElementById = get;
    } finally { s.env.dispose(); }
  }
  {
    const s = await makeShop({ role: 'owner' });
    try {
      const { readyCheckout } = require('./fixtures_db.js');
      readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price: 300 }], 'cash', 300);
      await s.app.processCheckout(); await settle(30);
      const tx = s.app.state.transactions[s.app.state.transactions.length - 1];
      loginAs(s.app, 'owner');
      s.app.openTransactionEdit(tx.id);
      const d = s.env.document, get = d.getElementById.bind(d);
      d.getElementById = (id) => (id === 'edit-tx-payment' ? null : get(id));
      const before = JSON.stringify(tx);
      s.toasts.length = 0;
      let threw = null;
      try { await s.app.saveTransactionEdit(); } catch (e) { threw = e; }
      await settle(20);
      d.getElementById = get;
      await t('61. แก้บิล: ช่องช่องทางชำระหาย → ฟ้อง "หน้าจอผิดพลาด" และไม่แตะบิล', () => {
        ok(!threw, 'โยน error ออกจากปุ่ม: ' + (threw && threw.message));
        eq(JSON.stringify(tx), before);
        ok(s.toasts.some(x => /หน้าจอผิดพลาด/.test(x.m) && /edit-tx-payment/.test(x.m)), JSON.stringify(s.toasts));
      });
    } finally { s.env.dispose(); }
  }
  await t('61. มีตัวดัก unhandledrejection ทั้งแอปที่ขึ้นข้อความภาษาไทย (วางก่อน function topOpenModal)', () => {
    const src = read('app.js');
    const i = src.indexOf("addEventListener('unhandledrejection'"), j = src.indexOf('function topOpenModal');
    ok(i > 0 && i < j, 'ไม่พบตัวดัก');
    ok(/มีงานบางอย่างทำไม่สำเร็จ/.test(src.slice(i, j)), 'ไม่มีข้อความภาษาไทย');
  });

  // ═══ ข้อ 64 ═════════════════════════════════════════════════════════════
  {
    const s = await makeShop({ role: 'owner' });
    try {
      let reads = 0;
      s.env.ctx.FileReader = class { readAsDataURL() { reads++; } };
      s.toasts.length = 0;
      s.app.handleLogoUpload({ target: { files: [{ type: 'image/png', size: 16 * 1024 * 1024 }], value: 'x' } });
      await t('64. รูปใหญ่ 16 MB → ไม่อ่านไฟล์ + บอกให้เลือกรูปที่เล็กกว่า 15 MB', () => {
        eq(reads, 0); ok(s.toasts.some(x => /15 MB/.test(x.m)), JSON.stringify(s.toasts));
      });
      s.app.handleLogoUpload({ target: { files: [{ type: 'image/png', size: 2 * 1024 * 1024 }] } });
      await t('64. รูป 2 MB → อ่านไฟล์ตามปกติ', () => eq(reads, 1));
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 65 ═════════════════════════════════════════════════════════════
  for (const persisted of [false, true]) {
    const s = await makeShop({ role: 'owner' });
    try {
      s.env.ctx.navigator.storage = { persisted: async () => persisted, persist: async () => persisted };
      const P = Object.getPrototypeOf(s.app);
      await P.requestPersistentStorage.call(s.app);
      const el = s.env.document.getElementById('storage-persist-status');
      await t(`65. ที่เก็บข้อมูลถาวร = ${persisted} → หน้าตั้งค่าบอกสถานะ`, () => {
        ok(el.style.display !== 'none', 'ซ่อนอยู่');
        if (persisted) ok(/เปิดแล้ว/.test(el.innerText), el.innerText);
        else eq(el.innerText, '⚠️ iPad อาจลบข้อมูลแอปเมื่อพื้นที่เต็ม — สำรองขึ้น Drive ให้สม่ำเสมอ');
      });
    } finally { s.env.dispose(); }
  }
  await t('65. index.html มีที่แสดงสถานะ (#storage-persist-status) ในหน้าตั้งค่า', () => ok(/id="storage-persist-status"/.test(read('index.html'))));

  // ═══ ข้อ 67 (โค้ดค้าง) ════════════════════════════════════════════════════
  await t('67. app.js: ไม่มี roundToTotal · ไม่หา #btn-theme-toggle · syncSummaryNow ไม่สร้าง txs/exp ที่ไม่ใช้', () => {
    const src = read('app.js');
    ok(!/roundToTotal/.test(src), 'roundToTotal');
    ok(!/\['btn-theme-toggle',/.test(src) && !/getElementById\('btn-theme-toggle'\)/.test(src), '#btn-theme-toggle');
    const i = src.indexOf('async syncSummaryNow('); const seg = src.slice(i, i + 2500);
    ok(!/const txs = /.test(seg) && !/const exp = /.test(seg), 'txs/exp');
    ok(!/'กำลังทำงาน'/.test(src), 'กิ่งกะที่เปิดอยู่ในตารางประวัติกะ');
  });
  await t('67. sw.js ไม่มีกิ่งแคชไฟล์จาก CDN (ไม่มีวันทำงาน) · style_v2.css ไม่มี #btn-print-receipt', () => {
    ok(!/isCdn|cdnjs\.cloudflare\.com|fonts\.gstatic\.com/.test(read('sw.js')), 'sw.js');
    ok(!/#btn-print-receipt/.test(read('style_v2.css')), 'css');
  });

  // ═══ ข้อ 45 + 66 (หน้าเว็บ) ════════════════════════════════════════════════
  await t('45. ช่องถาม PIN/Owner key: autocomplete/autocapitalize/autocorrect ปิด · ช่องรหัส Telegram autocomplete="off"', () => {
    const html = read('index.html');
    const pin = (html.match(/<input[^>]*id="prompt-modal-input"[^>]*>/) || [''])[0];
    ['autocomplete="off"', 'autocapitalize="off"', 'autocorrect="off"', 'spellcheck="false"'].forEach(a => ok(pin.includes(a), a + ' · ' + pin));
    ok(/<input[^>]*id="shop-telegram-token"[^>]*autocomplete="off"/.test(html), 'telegram token');
  });
  await t('66. ป้ายชื่อสำหรับโปรแกรมอ่านหน้าจอ: ลูกค้า/ส่วนลดในตะกร้า · ช่องนับธนบัตรทุกช่อง · label for ในหน้าตั้งค่าและฟอร์ม', () => {
    const html = read('index.html');
    ok(/id="cart-customer-select"[^>]*aria-label=/.test(html), 'cart-customer-select');
    ok(/id="cart-discount"[^>]*aria-label=/.test(html), 'cart-discount');
    const qty = html.match(/<input[^>]*cash-qty-input[^>]*>/g) || [];
    ok(qty.length === 9 && qty.every(x => /aria-label="จำนวน/.test(x)), 'cash-qty-input ' + qty.length);
    ['vat-rate', 'shop-name-input', 'shop-promptpay-id', 'shop-telegram-token', 'cust-name', 'staff-pin', 'serv-price', 'cat-name']
      .forEach(id => ok(html.includes(`for="${id}"`), 'label for ' + id));
    ok(/changeItemStaff\(.*this\.value\)" aria-label=/.test(read('app.js')), 'cart staff select aria-label');
  });
  await t('66. กฎ "ปุ่มชำระเงินลอยติดล่าง" ที่ไม่เคยทำงานถูกตัดออก', () => ok(!/\.checkout-btn\s*\{[^}]*position:\s*sticky/.test(read('style_v2.css'))));

  R.done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
