// ชุด H — ด่านสัญญาหน้าจอ (UI contract)
//
// เรื่องที่คุมตรงนี้: ทุกช่องกรอกที่ค่าของมันกลายเป็น "ตัวเลขเงิน"
// ถ้าหาช่องนั้นไม่เจอ ระบบต้อง "ฟ้องแล้วหยุด" ไม่ใช่เดาค่า 0 แล้วเดินต่อ
//
// เดิม (ก่อน ก.ย. 2569) ทุกจุดข้างล่างนี้เดา 0 เงียบ ๆ ผลคือ:
//   · ช่องส่วนลดหาย      -> ส่วนลดหายทั้งบิล ลูกค้าโดนเก็บเต็ม
//   · ช่องเงินที่รับมาหาย -> เงินทอนบนบิลเป็น 0 ตรวจย้อนหลังไม่ได้
//   · ช่องนับธนบัตรหาย   -> ปิดกะขึ้น "ขาด" เท่าเงินทั้งลิ้นชักทั้งที่เงินอยู่ครบ
//   · ช่องอัตรา VAT หาย  -> อัตราตกกลับไป 7% และสวิตช์ถูกปิดโดยเจ้าของไม่ได้สั่ง
// ทั้งหมดไม่มี error ให้เห็นสักตัว — นั่นคือสิ่งที่ชุดนี้กัน

const h = require('./harness.js');
const app = h.ctx.app, els = h.document._els;
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); }
  catch (e) { fail++; console.log('  ❌ ' + n + '  -> ' + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b))
  throw new Error((m || '') + ` ควรได้ ${JSON.stringify(b)} แต่ได้ ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'ควรเป็นจริง'); };

// ── ตัวช่วย: ซ่อน element บางตัวให้ getElementById คืน null ────────────────
// (harness ปกติจะ "สร้างให้เอง" ทุก id ซึ่งทำให้จำลองช่องหายไม่ได้)
const origGet = h.document.getElementById.bind(h.document);
let hidden = new Set();
h.document.getElementById = (id) => hidden.has(id) ? null : origGet(id);
const hide = (...ids) => { hidden = new Set(ids); };
const el = (id) => origGet(id);   // ต้องเรียกผ่านตัวนี้ harness ถึงจะสร้าง element ให้
const unhide = () => { hidden = new Set(); };

// จับ error ที่ควรถูกโยน — คืนข้อความ ถ้าไม่โยนเลยถือว่าตก
const NO_THROW = { uiContract: false, message: 'ไม่ได้โยน error เลย — แปลว่ายังเดาค่าเงียบ ๆ อยู่' };
const mustThrow = (fn) => {
  try { fn(); } catch (e) { return e; }
  return NO_THROW;   // ไม่โยนที่นี่ ไม่งั้นรันกับโค้ดเก่าแล้วหยุดตั้งแต่ข้อแรก นับไม่ได้ว่าจับได้กี่ข้อ
};
const mustThrowAsync = async (fn) => {
  try { await fn(); } catch (e) { return e; }
  return null;
};

const toasts = [];
app.showToast = (m, ty) => toasts.push({ m, ty });
const lastToasts = (k) => toasts.slice(-k).map(x => x.m).join(' | ');

// ── ตัวช่วย: ช่องนับธนบัตรจำลอง ────────────────────────────────────────
const cashInputs = (counts) => Object.entries(counts).map(([d, q]) => ({
  value: String(q), getAttribute: (k) => k === 'data-denom' ? String(d) : null }));
let drawerInputs = [];
h.document.querySelectorAll = (sel) =>
  (sel && String(sel).includes('cash-qty-input')) ? drawerInputs : [];

['vibrateDevice','renderAll','renderPos','renderQueueScreen','renderCart','updateCartTotals','renderDashboard',
 'renderCustomerTable','renderReports','renderSettingsLists','renderCategoryList','renderVatSettings',
 'openModal','closeModal','showThermalReceipt','syncPendingTransactions','flushCloudOutbox','clearCart',
 'applyShopName','applyTheme','openCashCounter','enqueueShiftCloseCloudOps','buildShiftReportMessage'
].forEach(k => { app[k] = () => {}; });
app.saveState = async () => {};
app.autoBackupToGoogleDrive = async () => true;

app.currentRole = 'owner';
app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
app.state.categories = [{ id: 'barber', name: 'ตัดผม', vat: false }];
app.state.staff = [{ id: 'st-1', name: 'เอ' }];
app.state.customers = []; app.state.queue = []; app.state.transactions = [];
app.state.cloudOutbox = []; app.state.voidLog = [];
app.vatEnabled = false; app.vatRate = 7;
// ตั้งแต่ ก.ย. 2569 processCheckout ตรวจเองว่ากะเปิดอยู่ — ต้องมีกะ ไม่งั้นเทสต์ข้างล่าง
// จะถูกปฏิเสธด้วยเหตุผลอื่นก่อนถึงด่านสัญญาหน้าจอที่ต้องการตรวจ
app.state.shift = { active: true, startTime: Date.now() - 3600e3, startCash: 0, startDetails: {}, expenses: [], history: [] };

const freshCart = () => { app.state.cart = [{ uniqueCartId: 'h1', id: 's1', name: 'ตัดผม', price: 300,
  duration: 30, commission: 0, commissionType: 'percent', category: 'barber', staffId: 'st-1', staffName: 'เอ' }]; };

(async () => {

console.log('\n[H01] ช่องส่วนลดในตะกร้าหาย — ห้ามคิดส่วนลดเป็น 0 เงียบ ๆ');
el('cart-discount').value = '50';
t('มีช่องอยู่ -> อ่านส่วนลดได้ตามเดิม (ของเก่าต้องไม่พัง)', () => eq(app.getCartDiscount(300), 50));
hide('cart-discount');
const e01 = mustThrow(() => app.getCartDiscount(300));
unhide();
t('ช่องหาย -> โยน error ไม่ใช่คืน 0', () => ok(e01.uiContract === true, 'ไม่ใช่ error ของด่านสัญญาหน้าจอ'));
t('ข้อความอ่านรู้เรื่อง มีชื่อช่องที่หาย', () => ok(/ช่องส่วนลดในตะกร้า/.test(e01.message), e01.message));

console.log('\n[H02] เก็บเงินตอนช่องส่วนลดหาย — ห้ามออกบิลที่ไม่มีส่วนลด');
freshCart();
app.state.selectedPaymentMethod = 'cash';
el('cash-received').value = '300';
el('cart-customer-select').value = '';
app.beginCheckoutAttempt();   // = เปิดหน้าต่างชำระเงิน (ก่อนช่องหาย)
hide('cart-discount');
await app.processCheckout();
unhide();
t('ไม่มีบิลถูกบันทึก', () => eq(app.state.transactions.length, 0));
t('ไม่มีคิวงานถูกสร้าง', () => eq(app.state.queue.length, 0));
t('ผู้ใช้ได้รับข้อความฟ้อง ไม่ใช่เงียบ', () => ok(/การชำระเงินล้มเหลว/.test(lastToasts(2)), lastToasts(2)));

console.log('\n[H03] ช่องเงินที่รับมาหาย');
hide('cash-received');
const e03a = mustThrow(() => app.recalcCashChange());
const e03b = mustThrow(() => app.quickCash(500));
freshCart();
app.beginCheckoutAttempt();
await app.processCheckout();
unhide();
t('คิดเงินทอน -> โยน error', () => ok(e03a.uiContract === true));
t('ปุ่มเงินด่วน -> โยน error (เดิม return เงียบ กดแล้วไม่มีอะไรเกิดขึ้น)', () => ok(e03b.uiContract === true));
t('เก็บเงินสด -> ไม่มีบิลถูกบันทึก', () => eq(app.state.transactions.length, 0));

console.log('\n[H04] ช่องเลือกลูกค้าหาย — ข้อความต้องบอกว่าช่องไหน');
freshCart();
app.beginCheckoutAttempt();
hide('cart-customer-select');
await app.processCheckout();
unhide();
t('ไม่มีบิลถูกบันทึก', () => eq(app.state.transactions.length, 0));
t('ข้อความบอกชื่อช่อง ไม่ใช่ error ดิบของเบราว์เซอร์',
  () => ok(/ช่องเลือกลูกค้า/.test(lastToasts(2)) && !/null|undefined/.test(lastToasts(2)), lastToasts(2)));

console.log('\n[H05] นับเงินลิ้นชัก — ลิ้นชักว่างกับ "หาช่องนับไม่เจอ" ต้องไม่ใช่เรื่องเดียวกัน');
drawerInputs = cashInputs({ 1000: 2, 500: 1, 100: 3, 20: 0, 1: 7 });
t('มีช่องครบ -> นับได้ 2807 (ของเก่าต้องไม่พัง)', () => eq(app.readCashDrawer().total, 2807));
drawerInputs = cashInputs({ 1000: 0, 500: 0, 100: 0 });
t('ลิ้นชักว่างจริง (นับแล้วได้ 0) -> ยังทำงานปกติ ไม่ฟ้อง', () => eq(app.readCashDrawer().total, 0));
drawerInputs = [];
const e05 = mustThrow(() => app.readCashDrawer());
t('หาช่องนับไม่เจอ -> โยน error', () => ok(e05.uiContract === true));
t('หาช่องนับไม่เจอ -> แสดงผลก็ต้องฟ้อง', () => ok(mustThrow(() => app.updateCashSum()).uiContract === true));

drawerInputs = [{ value: '5', getAttribute: () => null }, ...cashInputs({ 100: 2 })];
const e05b = mustThrow(() => app.readCashDrawer());
t('ชนิดธนบัตรหายบางช่อง -> ฟ้อง ไม่ใช่นับตกเงียบ ๆ',
  () => ok(e05b.uiContract === true && /data-denom/.test(e05b.message), e05b.message));

console.log('\n[H06] ปิดกะตอนหาช่องนับไม่เจอ — ห้ามปิดกะด้วยยอด 0');
app.state.shift = { active: true, startTime: Date.now() - 60000, startCash: 1000,
  startDetails: {}, expenses: [], history: [] };
drawerInputs = [];
app.cashCounterMode = 'close';
await app.confirmCashCount();
t('กะยังเปิดอยู่ ไม่ถูกปิด', () => eq(app.state.shift.active, true));
t('ไม่มีประวัติกะปลอมถูกบันทึก', () => eq(app.state.shift.history.length, 0));
t('ผู้ใช้ได้รับข้อความฟ้อง', () => ok(/ยืนยันยอดเงิน/.test(lastToasts(2)), lastToasts(2)));

console.log('\n[H07] เปิดกะตอนหาช่องนับไม่เจอ — ห้ามเปิดกะด้วยเงินตั้งต้น 0');
app.state.shift = { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] };
app.cashCounterMode = 'open';
drawerInputs = [];
await app.confirmCashCount();
t('กะไม่ถูกเปิด', () => eq(app.state.shift.active, false));
t('เงินตั้งต้นไม่ถูกตั้งเป็น 0 จากการนับที่ไม่เคยเกิดขึ้น', () => eq(app.state.shift.startCash, 0));

console.log('\n[H08] ตั้งค่า VAT ตอนช่องหาย — ห้ามเปลี่ยนอัตราหรือปิดสวิตช์เอง');
app.vatEnabled = true; app.vatRate = 10;
el('vat-rate').value = '10';
el('vat-enabled').checked = true;
hide('vat-rate');
await app.saveVatSettings();
unhide();
t('อัตรา VAT ไม่ถูกเปลี่ยนกลับเป็น 7', () => eq(app.vatRate, 10));
t('สวิตช์ VAT ไม่ถูกปิดเอง', () => eq(app.vatEnabled, true));
hide('vat-enabled');
await app.saveVatSettings();
unhide();
t('ช่องสวิตช์หาย -> สวิตช์ยังเปิดอยู่เหมือนเดิม', () => eq(app.vatEnabled, true));

console.log('\n[H09] ช่องส่วนลดในหน้าต่างแก้บิลหาย');
app.state.transactions = [{ id: 'TX-H', date: Date.now(), customerName: 'ก', services: ['ตัดผม'],
  details: [{ name: 'ตัดผม', price: 300, netPrice: 300, staffId: 'st-1', staffName: 'เอ',
              commission: 0, commissionType: 'percent', commissionAmount: 0, category: 'barber', vatable: false }],
  subtotal: 300, discount: 0, total: 300, paymentMethod: 'cash', staffNames: ['เอ'] }];
app._editTxDraft = { txId: 'TX-H', details: app.cloneForRollback(app.state.transactions[0].details) };
hide('edit-tx-discount');
const e09 = mustThrow(() => app.recalculateEditTxTotal());
unhide();
t('โยน error พร้อมชื่อช่อง', () => ok(e09.uiContract === true && /หน้าต่างแก้บิล/.test(e09.message), e09.message));
app._editTxDraft = null;

console.log('\n[H10] ป้ายเตือนค้างบนจอ — toast หายแล้วต้องยังเห็นว่าอย่าเพิ่งเก็บเงิน');
const banner = origGet('ui-contract-banner');
t('มีป้ายเตือนขึ้น', () => ok(/หน้าจอไม่ครบ/.test(banner.innerHTML), banner.innerHTML.slice(0, 80)));
t('ป้ายบอกให้หยุดเก็บเงิน/ปิดกะ', () => ok(/อย่าเพิ่งเก็บเงิน/.test(banner.innerHTML)));
t('ป้ายบอกด้วยว่าช่องไหนหาย', () => ok(/cart-discount/.test(banner.innerHTML), banner.innerHTML.slice(0, 200)));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
