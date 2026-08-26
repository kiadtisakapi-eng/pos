// เทสต์แกนกลางที่ชุดเดิมไม่เคยแตะเลย (เพิ่ม ส.ค. 2569)
//
// ที่มา: วัด coverage ระดับฟังก์ชันแล้วพบว่าเทสต์ทั้งชุดเรียกเมธอดของ PosApp
// แค่ 109 จาก 185 ตัว — และที่ไม่เคยถูกเรียกเลยมีของสำคัญปนอยู่:
//   · saveState / loadState        = ชั้นเก็บข้อมูลทั้งหมดของร้าน (ถูก stub ทิ้งในทุกไฟล์เทสต์)
//   · readCashQty / updateCashSum  = การนับเงินในลิ้นชัก
//   · doLogin / tryRestoreSession  = ทางเข้าระบบทั้งหมด
//   · roundToTotal                 = ตัวเกลี่ยเศษสตางค์
// ไฟล์นี้ไล่ปิดช่องพวกนั้น
const h = require('./harness.js');
const app = h.ctx.app;
let pass = 0, fail = 0;
// t() เป็น sync — ส่งฟังก์ชัน async เข้ามาจะผ่านทันทีโดยไม่ตรวจอะไร จึงดักไว้ให้ FAIL
const t = (n, f) => { try { const r = f();
  if (r && typeof r.then === 'function') { fail++; console.log('  FAIL', n, '-> ฟังก์ชันทดสอบคืน Promise แต่ t() ไม่รอ async ให้ await ผลไว้ข้างนอกก่อน'); return; }
  pass++; console.log('  PASS', n); } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m||'') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const el = id => h.document.getElementById(id);

const toasts = [];
app.showToast = (m, ty) => toasts.push({ m, ty });
app.vibrateDevice = () => {}; app.renderAll = () => {}; app.renderEveryScreen = () => {};
app.renderDashboard = () => {}; app.renderPos = () => {}; app.renderQueueScreen = () => {};
app.renderCustomerTable = () => {}; app.renderSettingsLists = () => {}; app.renderReports = () => {};
app.filterReports = () => {}; app.openModal = () => {}; app.closeModal = () => {};
app.updateUserRoleUI = () => {}; app.renderLoginOptions = () => {}; app.afterLogin = () => {};
app.updateCartTotals = () => {}; app.checkSyncStatus = () => {}; app.updateSyncBadgeStatus = () => {};

(async () => {

// ═══════════════════════════════════════════════════════════════
// 1. ชั้นเก็บข้อมูล — saveState / loadState
//    ทุกไฟล์เทสต์เดิม stub saveState ทิ้งหมด ตัวจริงจึงไม่เคยรันเลยสักครั้ง
//    ทั้งที่มันคือฟังก์ชันที่เขียนข้อมูลทั้งร้านลงเครื่อง
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ชั้นเก็บข้อมูล: เขียนลงเครื่องแล้วอ่านกลับต้องได้ของเดิม ---');
await app.loadState();
t('เปิดแอปครั้งแรก (ฐานข้อมูลว่าง) -> ได้ข้อมูลตั้งต้นมา ไม่ใช่ค่าว่าง', () => {
  ok(Array.isArray(app.state.services) && app.state.services.length > 0);
  ok(Array.isArray(app.state.staff));
  eq(app.loadFailed, false);});

// ใส่ข้อมูลชุดหนึ่งเข้าไป แล้วบังคับให้ลืม แล้วอ่านกลับ
const stamp = 1786000000000;
app.state.transactions = [{ id:'TX-ROUNDTRIP-1', date:stamp, customerName:'ลูกค้าทดสอบ',
  services:['ตัดผม'], details:[{name:'ตัดผม',price:300,netPrice:300,staffId:'st-1',staffName:'เอ',
  commission:10,commissionType:'percent',commissionAmount:30,category:'barber',vatable:false}],
  subtotal:300, discount:0, nonVatBase:300, vatableBase:0, vatAmount:0, rounding:0, total:300,
  paymentMethod:'cash', staffNames:['เอ'], syncStatus:'synced' }];
app.state.voidLog = [{ billId:'TX-V', date:stamp, by:'เจ้าของร้าน', amount:100, customer:'ก', services:[] }];
app.state.expenseLog = [{ expenseId:'e9', amount:50, note:'ทดสอบ', addedBy:'เอ', addedAt:stamp, by:'บี', date:stamp }];
app.state.shift = { active:true, startTime:stamp, startCash:2000, startDetails:{1000:2},
  expenses:[{ id:'exp_1', type:'supply', amount:120, note:'ซื้อของ', time:stamp, by:'เอ' }], history:[] };
app.state.customers = [{ id:'c-9', name:'คุณทดสอบ', phone:'0800000000', visitCount:3, tier:'ทั่วไป (General)', note:'' }];
app.shopPromptPayId = '0812345678';
app.shopName = 'ร้านทดสอบ';
app.vatEnabled = true; app.vatRate = 7;
app.telegramChatId = '-100123';
const saved = await app.saveState();
t('saveState คืน true เมื่อเขียนสำเร็จ', () => eq(saved, true));

const snapshot = JSON.stringify({ tx: app.state.transactions, vl: app.state.voidLog,
  el: app.state.expenseLog, sh: app.state.shift, cu: app.state.customers,
  pp: app.shopPromptPayId, nm: app.shopName, ve: app.vatEnabled, vr: app.vatRate, tg: app.telegramChatId });

// ทำลายทุกอย่างในหน่วยความจำ แล้วอ่านกลับจากเครื่อง
app.state.transactions = []; app.state.voidLog = []; app.state.expenseLog = [];
app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
app.state.customers = []; app.shopPromptPayId = ''; app.shopName = '';
app.vatEnabled = false; app.vatRate = 0; app.telegramChatId = '';
await app.loadState();
const after = JSON.stringify({ tx: app.state.transactions, vl: app.state.voidLog,
  el: app.state.expenseLog, sh: app.state.shift, cu: app.state.customers,
  pp: app.shopPromptPayId, nm: app.shopName, ve: app.vatEnabled, vr: app.vatRate, tg: app.telegramChatId });
t('อ่านกลับมาแล้วได้ข้อมูลเดิมครบทุกช่อง (บิล · ประวัติ void · ประวัติลบค่าใช้จ่าย · กะ · ลูกค้า · ตั้งค่า)',
  () => eq(after, snapshot));
t('บิลที่อ่านกลับมามีช่อง VAT ครบ ไม่หายระหว่างเขียน-อ่าน', () => {
  const tx = app.state.transactions[0];
  eq([tx.nonVatBase, tx.vatableBase, tx.vatAmount, tx.rounding, tx.total], [300,0,0,0,300]);});
t('ชื่อคนเพิ่มค่าใช้จ่ายรอดจากการเขียน-อ่าน', () => eq(app.state.shift.expenses[0].by, 'เอ'));

console.log('\n--- ด่านกันข้อมูลหาย: โหลดไม่สำเร็จ = ห้ามเขียนทับ ---');
app.loadFailed = true;
const blocked = await app.saveState();
t('loadFailed = true -> saveState ปฏิเสธ คืน false', () => eq(blocked, false));
let threw = null;
try { await app.saveStateOrThrow('ทดสอบ'); } catch (e) { threw = e; }
t('saveStateOrThrow ต้องโยน error ไม่ใช่เงียบ', () => ok(threw && /ทดสอบ/.test(threw.message)));
app.loadFailed = false;

// ═══════════════════════════════════════════════════════════════
// 2. การนับเงินในลิ้นชัก — ตัวเลขนี้กลายเป็น "เงินที่นับได้จริง" ตอนปิดกะ
// ═══════════════════════════════════════════════════════════════
console.log('\n--- นับเงิน: readCashQty ---');
const mkInput = (v) => ({ value: String(v) });
t('ช่องว่าง -> 0', () => eq(app.readCashQty(mkInput('')), 0));
t('ตัวอักษร -> 0', () => eq(app.readCashQty(mkInput('abc')), 0));
t('ติดลบ -> 0 และแก้ค่าในช่องให้ตรงกับที่นับจริง', () => {
  const i = mkInput('-5'); eq(app.readCashQty(i), 0); eq(i.value, '0');});
t('ทศนิยม -> ปัดลงเป็นจำนวนเต็ม', () => {
  const i = mkInput('3.9'); eq(app.readCashQty(i), 3); eq(i.value, '3');});
t('เกินเพดาน 99999 -> ตัดที่ 99999', () => {
  const i = mkInput('1000000'); eq(app.readCashQty(i), 99999); eq(i.value, '99999');});
t('ค่าปกติ -> คืนตามเดิม ไม่ไปแก้ช่อง', () => {
  const i = mkInput('12'); eq(app.readCashQty(i), 12); eq(i.value, '12');});

console.log('\n--- นับเงิน: รวมยอดจากธนบัตรแต่ละใบ ---');
const denomInputs = [[1000,2],[500,1],[100,3],[20,0],[1,7]].map(([d,q]) => ({
  value:String(q), getAttribute:(k)=> k==='data-denom' ? String(d) : null }));
h.document.querySelectorAll = (sel) => sel.includes('cash-qty-input') ? denomInputs : [];
app.cashCounterMode = 'open';
app.updateCashSum();
t('รวมยอดถูกต้อง (1000x2 + 500 + 100x3 + 1x7 = 2807)',
  () => ok(/2,807/.test(el('cash-counter-total').innerText), el('cash-counter-total').innerText));

console.log('\n--- นับเงิน: เงินทอนตอนเก็บเงินสด ---');
app.state.cart = [{ uniqueCartId:'k1', id:'s1', name:'ตัดผม', price:300, duration:30,
  commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'เอ' }];
el('cart-discount').value = '0';
app.vatEnabled = false;
const total = app.getCartTotal();
t('ยอดที่ต้องเก็บ = 300', () => eq(total, 300));
el('cash-received').value = '500';
app.recalcCashChange();
t('รับ 500 -> ทอน 200 และปุ่มยืนยันเปิด', () => {
  ok(/200/.test(el('cash-change').innerText), el('cash-change').innerText);
  eq(el('btn-complete-checkout').disabled, false);});
el('cash-received').value = '100';
app.recalcCashChange();
t('รับ 100 (ไม่พอ) -> แจ้งเงินไม่พอ และปิดปุ่มยืนยัน', () => {
  ok(/ไม่เพียงพอ/.test(el('cash-change').innerText));
  eq(el('btn-complete-checkout').disabled, true);});
el('cash-received').value = '0';
app.recalcCashChange();
t('รับ 0 -> ปิดปุ่มยืนยัน', () => eq(el('btn-complete-checkout').disabled, true));
app.quickCash('exact');
t('ปุ่ม "พอดี" -> เติมยอดเท่าที่ต้องเก็บเป๊ะ และเปิดปุ่มยืนยัน', () => {
  eq(el('cash-received').value, 300); eq(el('btn-complete-checkout').disabled, false);});
app.quickCash(1000);
t('ปุ่มเงินด่วน 1000 -> เติม 1000 ทอน 700', () => {
  eq(el('cash-received').value, 1000); ok(/700/.test(el('cash-change').innerText));});

// ═══════════════════════════════════════════════════════════════
// 3. roundToTotal — ตัวเกลี่ยเศษสตางค์ ผลรวมต้องเท่าเป้าเป๊ะเสมอ
// ═══════════════════════════════════════════════════════════════
console.log('\n--- roundToTotal: ผลรวมต้องเท่าเป้าเป๊ะ ---');
const r2 = v => Math.round(v * 100) / 100;
t('อาเรย์ว่าง -> ว่าง ไม่พัง', () => eq(app.roundToTotal([], 100), []));
t('ผลรวมตรงอยู่แล้ว -> ไม่แตะ', () => eq(app.roundToTotal([100, 200], 300), [100, 200]));
t('ขาดไป -> เติมที่รายการที่มากที่สุด', () => {
  const out = app.roundToTotal([100, 200], 301); eq(r2(out[0] + out[1]), 301); eq(out[1], 201);});
t('เกินไป -> หักที่รายการที่มากที่สุด', () => {
  const out = app.roundToTotal([100, 200], 299); eq(r2(out[0] + out[1]), 299);});
t('เป้าเป็น 0 -> ไม่มีค่าติดลบ', () => {
  const out = app.roundToTotal([100, 200], 0); ok(out.every(v => v >= 0));});
// ยิงสุ่มแบบเดียวกับการใช้งานจริง: แตกยอดบิลตามสัดส่วนราคาแล้วเกลี่ยเศษกลับ
// (ผู้เรียกตัวเดียวคือ buildEditableDetails ซึ่งส่งค่าที่รวมแล้วใกล้เคียง subtotal อยู่แล้ว)
let bad = 0, neg = 0, worst = 0;
for (let n = 0; n < 300000; n++) {
  const k = 1 + Math.floor(Math.random() * 6);
  const subtotal = Math.round(Math.random() * 500000) / 100;      // 0 - 5,000 บาท
  const weights = Array.from({ length: k }, () => Math.random() * 1000);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => subtotal * w / wSum);              // มีเศษทศนิยมยาว ๆ ติดมาเสมอ
  const out = app.roundToTotal(raw, subtotal);
  const sum = r2(out.reduce((s, v) => s + v, 0));
  const gap = Math.abs(sum - r2(subtotal));
  if (gap > worst) worst = gap;
  if (gap > 0.0001) bad++;
  if (out.some(v => v < 0)) neg++;
}
t(`สุ่ม 300,000 เคสแบบใช้งานจริง: ผลรวมเท่ายอดบิลเป๊ะทุกเคส (คลาดสูงสุด ${worst})`, () => eq(bad, 0));
t('สุ่ม 300,000 เคส: ไม่มีราคาชิ้นไหนติดลบ', () => eq(neg, 0));

// เคสสุดโต่งที่โค้ดจงใจ clamp ไว้ที่ 0 — ต้องไม่ติดลบ แม้ผลรวมจะไม่เท่าเป้า
const clamped = app.roundToTotal([10, 5], -1000);
t('เป้าติดลบมาก -> ยอมให้ผลรวมไม่ตรง แต่ห้ามมีค่าติดลบ (clamp ที่ 0 ตามที่โค้ดตั้งใจ)',
  () => ok(clamped.every(v => v >= 0), JSON.stringify(clamped)));

// ═══════════════════════════════════════════════════════════════
// 4. PIN และการย้ายข้อมูลบัญชี
// ═══════════════════════════════════════════════════════════════
console.log('\n--- PIN ---');
const hA = await app.hashPin('123456');
const hB = await app.hashPin('123456');
const hC = await app.hashPin('123457');
t('PIN เดียวกันได้ค่าเดิมเสมอ', () => eq(hA, hB));
t('PIN ต่างกันได้ค่าต่างกัน', () => ok(hA !== hC));
t('ได้ค่าความยาว 64 ตัวเป็นเลขฐานสิบหก', () => ok(/^[a-f0-9]{64}$/.test(hA)));
t('isHashed แยกออกระหว่างค่าที่แปลงแล้วกับ PIN ดิบ', () => {
  ok(app.isHashed(hA)); ok(!app.isHashed('123456')); ok(!app.isHashed('')); ok(!app.isHashed(null));});

app.ownerPin = '123456';                  // จำลองเครื่องที่ยังเก็บ PIN แบบดิบ
await app.migratePinIfNeeded();
t('PIN ดิบถูกแปลงให้ตอนเปิดแอป', () => ok(app.isHashed(app.ownerPin)));
const pinAfter = app.ownerPin;
await app.migratePinIfNeeded();
t('เรียกซ้ำไม่แปลงซ้ำ (ไม่งั้นล็อกอินไม่ได้ตลอดกาล)', () => eq(app.ownerPin, pinAfter));

app.state.staff = [{ id:'st-1', name:'เอ', role:'ช่าง', active:true },
                   { id:'st-2', name:'บี', role:'ช่าง', active:true, accessLevel:'manager', pin:'x' }];
await app.migrateStaffAccountsIfNeeded();
t('พนักงานเดิมที่ไม่มีฟิลด์บัญชี ถูกเติมเป็น staff และยังไม่มี PIN', () => {
  eq(app.state.staff[0].accessLevel, 'staff'); eq(app.state.staff[0].pin, null);});
t('พนักงานที่ตั้งค่าไว้แล้วต้องไม่ถูกลดสิทธิ์', () => eq(app.state.staff[1].accessLevel, 'manager'));

// ═══════════════════════════════════════════════════════════════
// 5. ทางเข้าระบบ — ทั้งชุดนี้ไม่เคยถูกเทสต์มาก่อนเลย
// ═══════════════════════════════════════════════════════════════
console.log('\n--- เข้าสู่ระบบ ---');
app.ownerPin = await app.hashPin('111111');
app.state.staff = [
  { id:'st-1', name:'เอ',  role:'ช่าง', active:true, accessLevel:'staff',   pin: await app.hashPin('222222') },
  { id:'st-3', name:'ซี',  role:'ช่าง', active:true, accessLevel:'manager', pin: await app.hashPin('333333') },
  { id:'st-4', name:'ดี',  role:'ช่าง', active:true, accessLevel:'staff',   pin: null }
];
h.ctx.localStorage.clear();
app._loginGuardLoaded = false; app._loginFails = 0; app._loginLockUntil = 0;
const login = async (uid, pin) => { app.loginSelectedId = uid; el('login-pin-input').value = pin;
  app.currentRole = null; app.currentUser = null; await app.doLogin(); return app.currentRole; };

const rOwner = await login('__owner__', '111111');
t('เจ้าของ PIN ถูก -> ได้สิทธิ์ owner', () => eq(rOwner, 'owner'));
const rWrong = await login('__owner__', '999999');
t('เจ้าของ PIN ผิด -> ไม่ได้สิทธิ์อะไรเลย', () => eq(rWrong, null));
const rStaff = await login('st-1', '222222');
t('พนักงาน PIN ถูก -> ได้สิทธิ์ staff ตาม accessLevel', () => eq(rStaff, 'staff'));
const rMgr = await login('st-3', '333333');
t('ผู้จัดการ PIN ถูก -> ได้สิทธิ์ manager', () => eq(rMgr, 'manager'));
const rNoPin = await login('st-4', '123456');
t('พนักงานที่ยังไม่ตั้ง PIN -> เข้าไม่ได้', () => eq(rNoPin, null));
const rCross = await login('st-1', '333333');
t('เอา PIN ของคนอื่นมาใช้ -> เข้าไม่ได้', () => eq(rCross, null));

console.log('\n--- ล็อกกันเดา PIN ---');
app._loginGuardLoaded = false; app._loginFails = 0; app._loginLockUntil = 0;
h.ctx.localStorage.clear();
for (let i = 0; i < 5; i++) await login('__owner__', '000000');
toasts.length = 0;
const rLocked = await login('__owner__', '111111');   // PIN ถูก แต่ควรถูกล็อกอยู่
t('ผิดครบ 5 ครั้ง -> ล็อกไว้ แม้ใส่ PIN ถูกก็ยังเข้าไม่ได้', () => eq(rLocked, null));
t('บอกผู้ใช้ว่าต้องรอกี่วินาที', () => ok(toasts.some(x => /รออีก/.test(x.m)), JSON.stringify(toasts)));
t('สถานะล็อกถูกเก็บลงเครื่อง (รีเฟรชหน้าแล้วยังล็อกอยู่)',
  () => ok(/lockUntil/.test(h.ctx.localStorage.getItem('epos_login_guard') || '')));
app._loginLockUntil = 0; app._loginFails = 0;
const rAfter = await login('__owner__', '111111');
t('พ้นเวลาล็อกแล้วเข้าได้ตามปกติ', () => eq(rAfter, 'owner'));
t('เข้าสำเร็จแล้วสถานะล็อกถูกล้างทิ้ง',
  () => eq(h.ctx.localStorage.getItem('epos_login_guard'), null));

console.log('\n--- จำการล็อกอิน / ออกจากระบบ ---');
await login('st-3', '333333');
app.saveSession();
await new Promise(r => setTimeout(r, 5));
let restored = await app.tryRestoreSession();
t('เปิดแอปใหม่ -> จำผู้จัดการไว้ได้', () => { ok(restored); eq(app.currentRole, 'manager'); });

// ปลอมสิทธิ์ในตัวเซสชันแล้วต้องไม่ได้ผล — role ต้องมาจากทะเบียนพนักงานเสมอ
app.state.staff[1].accessLevel = 'staff';
restored = await app.tryRestoreSession();
t('ลดสิทธิ์ในทะเบียนพนักงาน -> เซสชันเก่าต้องได้สิทธิ์ใหม่ ไม่ใช่สิทธิ์ที่ค้างในเซสชัน',
  () => eq(app.currentRole, 'staff'));
app.state.staff[1].accessLevel = 'manager';

app.state.staff[1].pin = null;
restored = await app.tryRestoreSession();
t('พนักงานถูกถอด PIN -> เซสชันเก่าใช้ไม่ได้', () => eq(restored, false));
app.state.staff[1].pin = await app.hashPin('333333');

await login('st-3', '333333'); app.saveSession();
app.logout('ทดสอบออกจากระบบ');
restored = await app.tryRestoreSession();
t('ออกจากระบบแล้ว เซสชันถูกลบจริง เปิดใหม่ต้องใส่ PIN', () => eq(restored, false));

console.log('\n--- อายุเซสชันตามตำแหน่ง ---');
const putSession = async (role, uid, ageMs) => {
  app.currentUser = { id: uid, name: 'x' }; app.currentRole = role; app.saveSession();
  await new Promise(r => setTimeout(r, 3));
  const rec = await h.ctx.app.readSessionForTest ? null : null;   // ไม่มี API ตรง จึงใช้ทางอ้อมด้านล่าง
};
// เขียนเซสชันเก่าเข้าไปตรง ๆ ผ่าน saveSession แล้วถอยเวลาโดยล็อกอินใหม่ไม่ได้
// จึงทดสอบผ่านเส้นทางจริง: ตั้ง currentRole แล้วเรียก saveSession จะได้ ts = ตอนนี้
app.currentUser = { id:'__owner__', name:'เจ้าของร้าน' }; app.currentRole = 'owner'; app.saveSession();
await new Promise(r => setTimeout(r, 3));
restored = await app.tryRestoreSession();
t('เจ้าของเพิ่งใช้งาน -> เซสชันยังใช้ได้', () => { ok(restored); eq(app.currentRole, 'owner'); });

console.log('\n--- เตะออกอัตโนมัติเมื่อไม่ได้ใช้งาน (เฉพาะเจ้าของ) ---');
app.currentUser = { id:'__owner__', name:'เจ้าของร้าน' }; app.currentRole = 'owner';
app._lastActivityTs = Date.now() - (60 * 60 * 1000);   // ทิ้งไว้ 1 ชั่วโมง
app.restoreBusy = false;
app.checkIdleTimeout();
t('เจ้าของทิ้งจอไว้นาน -> ถูกเตะออก', () => eq(app.currentRole, null));

app.currentUser = { id:'st-1', name:'เอ' }; app.currentRole = 'staff';
app._lastActivityTs = Date.now() - (60 * 60 * 1000);
app.checkIdleTimeout();
t('พนักงานทิ้งจอไว้นาน -> ไม่ถูกเตะ (ต้องขายต่อได้ทั้งกะ)', () => eq(app.currentRole, 'staff'));

app.currentUser = { id:'__owner__', name:'เจ้าของร้าน' }; app.currentRole = 'owner';
app._lastActivityTs = Date.now() - (60 * 60 * 1000);
app.restoreBusy = true;                                 // กำลังกู้ข้อมูลอยู่
app.checkIdleTimeout();
t('กำลังกู้ข้อมูลอยู่ -> ห้ามเตะออกกลางคัน', () => eq(app.currentRole, 'owner'));
app.restoreBusy = false;

app.currentRole = 'owner'; app.currentUser = { id:'__owner__', name:'เจ้าของร้าน' };
app._lastActivityTs = 0; app._lastSessionSaveTs = 0;
app.markActivity();
t('แตะจอ -> นาฬิกาไม่ใช้งานถูกรีเซ็ต', () => ok(Date.now() - app._lastActivityTs < 1000));

// ═══════════════════════════════════════════════════════════════
// 6. ด่านเปิด/ปิดกะ
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ด่านหน้าต่างนับเงิน ---');
app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
app.currentRole = 'owner';
app.cashCounterMode = null; toasts.length = 0;
app.openCashCounter('close');
t('ยังไม่เปิดกะ -> เปิดหน้าปิดกะไม่ได้', () => { eq(app.cashCounterMode, null);
  ok(toasts.some(x => /ต้องเปิดกะก่อน/.test(x.m)), JSON.stringify(toasts)); });

app.state.shift.active = true; app.state.shift.startTime = Date.now();
app.currentRole = 'staff'; app.cashCounterMode = null; toasts.length = 0;
app.openCashCounter('close');
t('พนักงานปิดกะไม่ได้', () => { eq(app.cashCounterMode, null);
  ok(toasts.some(x => /ผู้จัดการขึ้นไป/.test(x.m)), JSON.stringify(toasts)); });

app.cashCounterMode = null;
app.openCashCounter('open');
t('พนักงานเปิดกะได้', () => eq(app.cashCounterMode, 'open'));
app.currentRole = 'manager'; app.cashCounterMode = null;
app.openCashCounter('close');
t('ผู้จัดการปิดกะได้', () => eq(app.cashCounterMode, 'close'));

// ═══════════════════════════════════════════════════════════════
// 7. ลบของออกจากตะกร้า / คิว / ทะเบียน
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ตะกร้าและคิว ---');
app.currentRole = 'owner';
app.state.cart = [
  { uniqueCartId:'k1', id:'s1', name:'ตัดผม', price:300, duration:30, commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'เอ' },
  { uniqueCartId:'k2', id:'s2', name:'นวด',  price:500, duration:60, commission:15, commissionType:'percent', category:'massage', staffId:'st-1', staffName:'เอ' }
];
app.removeFromCart('k1');
t('ลบออกจากตะกร้าได้ตรงชิ้น', () => { eq(app.state.cart.length, 1); eq(app.state.cart[0].uniqueCartId, 'k2'); });
app.removeFromCart('ไม่มีจริง');
t('ลบชิ้นที่ไม่มีอยู่ -> ตะกร้าไม่เปลี่ยน ไม่พัง', () => eq(app.state.cart.length, 1));
app.changeItemStaff('k2', 'st-3');
t('เปลี่ยนพนักงานของรายการในตะกร้าได้', () => {
  eq(app.state.cart[0].staffId, 'st-3'); eq(app.state.cart[0].staffName, 'ซี'); });

app.showConfirm = (m, cb) => { app._p = cb(); };
app.state.queue = [{ id:'q1', customerName:'ก', status:'waiting', startTime:null, totalDuration:30, totalAmount:300, services:[] }];
await app.removeQueue('q1'); await app._p;
t('ยกเลิกคิวได้', () => eq(app.state.queue.length, 0));

app.state.customers = [{ id:'c-1', name:'ก', phone:'08', visitCount:1, tier:'ทั่วไป (General)', note:'' }];
await app.deleteCustomer('c-1'); await app._p;
t('ลบลูกค้าได้', () => eq(app.state.customers.length, 0));

app.state.services = [{ id:'s-1', name:'ตัดผม', price:300, duration:30, category:'barber', commission:10, commissionType:'percent' }];
await app.deleteService('s-1'); await app._p;
t('ลบบริการได้', () => eq(app.state.services.length, 0));

// ═══════════════════════════════════════════════════════════════
// 8. ข้อความที่ใช้เตือน/รายงาน
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ข้อความเตือน ---');
t('ไฟล์สำรองสะอาด -> ไม่ต้องเตือนอะไร', () => eq(app.describeBackupAudit({ clean:true }), ''));
const warn = app.describeBackupAudit({ clean:false, txTotal:100, badMoney:2, badDate:1, noId:3, dupId:1, badExpenses:4 });
t('ไฟล์สำรองมีปัญหา -> บอกครบทุกแบบพร้อมจำนวน', () =>
  ok(/2 บิล/.test(warn) && /1 บิล/.test(warn) && /3 บิล/.test(warn) && /4 รายการ/.test(warn) && /100 ใบ/.test(warn), warn));

const vmsg = app.buildVoidAlertMessage({ billId:'TX-1', date:stamp, by:'เจ้าของ<b>', amount:1234, customer:'ลูกค้า & หุ้นส่วน' });
t('ข้อความแจ้งยกเลิกบิลมีข้อมูลครบ', () => ok(/TX-1/.test(vmsg) && /1,234/.test(vmsg)));
t('ชื่อที่มีอักขระพิเศษถูกกรองก่อนส่ง Telegram (ไม่งั้นข้อความส่งไม่ออก)',
  () => ok(/&lt;b&gt;/.test(vmsg) && /&amp;/.test(vmsg), vmsg));


// ═══════════════════════════════════════════════════════════════
// 9. ตัวหุ้ม fetch ที่มีเวลาจำกัด — ทุกการคุยกับชีตวิ่งผ่านตัวนี้
// ═══════════════════════════════════════════════════════════════
console.log('\n--- fetch แบบมีเวลาจำกัด ---');
h.ctx.fetch = async () => ({ ok:true, status:200 });
const okRes = await app.fetchWithTimeout('https://x/', {}, 50);
t('ปลายทางตอบทัน -> คืน response ตามปกติ', () => eq(okRes.status, 200));

h.ctx.fetch = (url, opt) => new Promise((_, rej) => {
  opt.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
});
let timeoutErr = null;
try { await app.fetchWithTimeout('https://x/', {}, 30); } catch (e) { timeoutErr = e; }
t('ปลายทางค้าง -> ตัดที่เวลาที่กำหนด ไม่ค้างตลอดไป', () => ok(timeoutErr));
t('ข้อความบอกจำนวนวินาทีที่รอ ไม่ใช่คำว่า AbortError', () =>
  ok(/หมดเวลารอ/.test(timeoutErr.message) && !/Abort/i.test(timeoutErr.message), timeoutErr.message));

h.ctx.fetch = async () => { throw new Error('เน็ตหลุด'); };
let netErr = null;
try { await app.fetchWithTimeout('https://x/', {}, 50); } catch (e) { netErr = e; }
t('เน็ตหลุด -> ส่ง error เดิมต่อ ไม่กลืนเป็นข้อความหมดเวลา', () => eq(netErr.message, 'เน็ตหลุด'));

// ═══════════════════════════════════════════════════════════════
// 10. เครื่องยนต์ซิงก์บิลขึ้นชีต
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ส่งบิลขึ้นชีต ---');
app.googleSheetsUrl = 'https://gas/exec';
app.googleSheetsApiToken = 'A'.repeat(30);
app.loadFailed = false;
let lastBody = null;
app.fetchWithTimeout = async (url, opt) => { lastBody = JSON.parse(opt.body);
  return { ok:true, json: async () => ({ status:'success' }) }; };

const mkTx = (id, over) => Object.assign({ id, date: stamp, customerName:'ลูกค้า ก',
  services:['ตัดผม','น้ำ'], subtotal:380, discount:0,
  nonVatBase:300, vatableBase:80, vatAmount:5.60, rounding:0.40, total:386,
  paymentMethod:'cash', staffNames:['เอ'], syncStatus:'pending' }, over || {});

await app.syncSingleTransaction(mkTx('TX-SYNC-1'));
t('ส่งรหัสเชื่อมต่อไปด้วยทุกครั้ง', () => ok(!!lastBody.secret));
t('ส่งเลขที่บิล ยอด และช่องทางจ่ายครบ', () => {
  eq(lastBody.id, 'TX-SYNC-1'); eq(lastBody.total, 386); eq(lastBody.paymentMethod, 'cash'); });
t('ส่ง 4 ช่อง VAT ไปด้วย (ไม่งั้นคอลัมน์บนชีตจะว่าง)', () =>
  eq([lastBody.nonVatBase, lastBody.vatableBase, lastBody.vatAmount, lastBody.rounding], [300, 80, 5.60, 0.40]));
t('ส่งเดือนทำการที่คำนวณจากเครื่องหน้าร้าน ไม่ปล่อยให้ชีตเดาเอง', () =>
  ok(/^\d{2}-\d{4}$/.test(lastBody.monthKey), lastBody.monthKey));
t('ส่งเวลาจริงของบิลในรูปแบบที่ชีตยอมรับ', () =>
  ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(lastBody.dateTimeStr), lastBody.dateTimeStr));

app.googleSheetsApiToken = '';
let cfgErr = null;
try { await app.syncSingleTransaction(mkTx('TX-SYNC-2')); } catch (e) { cfgErr = e; }
t('ยังไม่ตั้งรหัสเชื่อมต่อ -> ไม่ยิงออกไปเลย และบอกให้ไปตั้งค่า', () =>
  ok(cfgErr && /รหัสเชื่อมต่อ/.test(cfgErr.message), cfgErr && cfgErr.message));
app.googleSheetsApiToken = 'A'.repeat(30);

console.log('\n--- ส่งบิลค้างทั้งคิว ---');
app.state.transactions = [mkTx('TX-Q-1'), mkTx('TX-Q-2'), mkTx('TX-Q-3', { syncStatus:'synced' })];
app.saveState = async () => true;
let sentIds = [];
app.fetchWithTimeout = async (url, opt) => { sentIds.push(JSON.parse(opt.body).id);
  return { ok:true, json: async () => ({ status:'success' }) }; };
await app.syncPendingTransactions(true);
t('ส่งเฉพาะบิลที่ยังค้าง ไม่ส่งซ้ำบิลที่ขึ้นชีตแล้ว', () => eq(sentIds.sort(), ['TX-Q-1','TX-Q-2']));
t('บิลที่ส่งสำเร็จถูกทำเครื่องหมายว่าขึ้นชีตแล้ว', () =>
  eq(app.state.transactions.filter(x => x.syncStatus === 'synced').length, 3));

sentIds = [];
app.state.transactions = [mkTx('TX-F-1')];
app.fetchWithTimeout = async () => ({ ok:true, json: async () => ({ status:'error', message:'ไม่ได้รับอนุญาต (unauthorized)' }) });
await app.syncPendingTransactions(true);
t('ชีตปฏิเสธ -> บิลยังค้างอยู่ ไม่ถูกทำเครื่องหมายว่าส่งแล้ว', () =>
  eq(app.state.transactions[0].syncStatus, 'pending'));

// กันบิลถูกแก้ระหว่างที่กำลังส่งของเก่าอยู่
app.state.transactions = [mkTx('TX-R-1', { rev: 1 })];
app.fetchWithTimeout = async () => { app.state.transactions[0].rev = 2;   // มีคนแก้บิลกลางคัน
  return { ok:true, json: async () => ({ status:'success' }) }; };
await app.syncPendingTransactions(true);
t('บิลถูกแก้ระหว่างส่ง -> ยังค้างไว้ให้ส่งเวอร์ชันใหม่ ไม่ทับเป็นส่งแล้ว', () =>
  eq(app.state.transactions[0].syncStatus, 'pending'));

// ═══════════════════════════════════════════════════════════════
// 11. ส่งออก / นำเข้า / ย้อนกลับ
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ส่งออกไฟล์สำรอง ---');
let downloaded = null;
h.ctx.Blob = class { constructor(parts){ this.parts = parts; } };
h.ctx.URL = { createObjectURL: (b) => { downloaded = b.parts.join(''); return 'blob:x'; }, revokeObjectURL: () => {} };
app.currentRole = 'staff';
t('พนักงานส่งออกไฟล์สำรองไม่ได้', () => eq(app.exportData(), false));
app.currentRole = 'owner'; app.loadFailed = true;
t('โหลดข้อมูลไม่สำเร็จ -> ห้ามส่งออก (ไม่งั้นได้ไฟล์เปล่าที่ดูเหมือนใช้ได้)', () => eq(app.exportData(), false));
app.loadFailed = false;
app.state.transactions = [mkTx('TX-EXPORT-1')];
t('เจ้าของส่งออกได้', () => eq(app.exportData(), true));
t('ไฟล์ที่ได้มีบิลครบ', () => {
  const d = JSON.parse(downloaded); eq(d.transactions[0].id, 'TX-EXPORT-1'); });
t('ไฟล์สำรองต้องไม่มี PIN เจ้าของ / รหัสเชื่อมต่อ / Telegram token ติดไปด้วย', () => {
  const d = JSON.parse(downloaded);
  eq(d.ownerPin, undefined); eq(d.googleSheetsApiToken, undefined); eq(d.telegramToken, undefined); });

console.log('\n--- ย้อนกลับไปก่อนกู้ข้อมูล ---');
app.currentRole = 'owner'; app.loadFailed = false; app.restoreBusy = false;
app.state.transactions = [mkTx('TX-BEFORE-1'), mkTx('TX-BEFORE-2')];
await app.savePreRestoreSnapshot();
app.state.transactions = [mkTx('TX-AFTER-1')];          // จำลองว่ากู้ผิดไฟล์ไปแล้ว
app.showConfirm = (m, cb) => { app._p = cb(); };
app.applyBackupData = async (d) => { app.state.transactions = d.transactions; };
await app.undoLastRestore(); await app._p;
t('ย้อนกลับแล้วได้บิลชุดก่อนกู้คืนมา', () =>
  eq(app.state.transactions.map(x => x.id), ['TX-BEFORE-1','TX-BEFORE-2']));
await app.undoLastRestore(); await app._p;
t('กดย้อนอีกครั้ง -> สลับกลับไปชุดหลังกู้ได้ (สลับไป-กลับได้ ไม่ใช่ทางเดียว)', () =>
  eq(app.state.transactions.map(x => x.id), ['TX-AFTER-1']));
app.currentRole = 'manager'; toasts.length = 0;
await app.undoLastRestore();
t('ผู้จัดการย้อนข้อมูลไม่ได้', () => ok(toasts.some(x => /เจ้าของร้าน/.test(x.m)), JSON.stringify(toasts)));
app.currentRole = 'owner';

// ═══════════════════════════════════════════════════════════════
// 12. ด่านสลับหน้าจอ (ตรวจในระดับตรรกะ ไม่ต้องเปิดเบราว์เซอร์)
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ด่านสลับหน้าจอ ---');
app.state.shift = { active:true, startTime:Date.now(), startCash:0, startDetails:{}, expenses:[], history:[] };
const tryTab = (role, screen) => { app.currentRole = role; app.state.activeScreen = 'pos';
  app.switchTab(screen); return app.state.activeScreen; };
t('พนักงานเข้าหน้าตั้งค่าไม่ได้', () => eq(tryTab('staff','settings'), 'pos'));
t('พนักงานเข้าหน้ารายงานไม่ได้', () => eq(tryTab('staff','reports'), 'pos'));
t('ผู้จัดการเข้าหน้ารายงานได้', () => eq(tryTab('manager','reports'), 'reports'));
t('ผู้จัดการเข้าหน้าตั้งค่าไม่ได้', () => eq(tryTab('manager','settings'), 'pos'));
t('เจ้าของเข้าได้ทั้งสองหน้า', () => {
  eq(tryTab('owner','settings'), 'settings'); eq(tryTab('owner','reports'), 'reports'); });
t('ยังไม่ล็อกอินก็เข้าหน้าตั้งค่าไม่ได้', () => eq(tryTab(null,'settings'), 'pos'));
t('พนักงานยังเข้าหน้าขาย/คิว/ลูกค้าได้ตามปกติ', () => {
  eq(tryTab('staff','queue'), 'queue'); eq(tryTab('staff','customers'), 'customers'); });

console.log('\n--- ยังไม่เปิดกะ -> เด้งไปหน้านับเงินก่อน ---');
app.state.shift = { active:false, startTime:null, startCash:0, startDetails:{}, expenses:[], history:[] };
app.cashCounterMode = null;
app.currentRole = 'staff'; app.state.activeScreen = 'pos';
app.switchTab('pos');
t('พนักงานเปิดแอปตอนยังไม่เปิดกะ -> ถูกพาไปนับเงินเปิดกะ', () => eq(app.cashCounterMode, 'open'));
app.currentRole = 'owner'; app.state.activeScreen = 'pos'; app.cashCounterMode = null;
app.switchTab('settings');
t('เจ้าของยังเข้าหน้าตั้งค่าได้แม้ยังไม่เปิดกะ (ไม่งั้นติดวนลูปตอนติดตั้งครั้งแรก)', () => {
  eq(app.state.activeScreen, 'settings'); eq(app.cashCounterMode, null); });

// ═══════════════════════════════════════════════════════════════
// 13. แจ้งเตือน Telegram
// ═══════════════════════════════════════════════════════════════
console.log('\n--- Telegram ---');
app.telegramToken = ''; app.telegramChatId = '';
const noCfg = await app.postTelegram('ทดสอบ');
t('ยังไม่ตั้งค่า Telegram -> ไม่ส่ง และคืน false', () => eq(noCfg, false));
app.telegramToken = '123:AAA'; app.telegramChatId = '-100';
let tgUrl = null, tgBody = null;
app.fetchWithTimeout = async (url, opt) => { tgUrl = url; tgBody = JSON.parse(opt.body);
  return { json: async () => ({ ok:true }) }; };
const sentOk = await app.postTelegram('ข้อความทดสอบ');
t('ส่งสำเร็จ -> คืน true', () => eq(sentOk, true));
t('ยิงไปที่ปลายทางของ Telegram พร้อมห้องที่ตั้งไว้', () => {
  ok(/api\.telegram\.org/.test(tgUrl)); eq(tgBody.chat_id, '-100'); eq(tgBody.text, 'ข้อความทดสอบ'); });
app.fetchWithTimeout = async () => ({ json: async () => ({ ok:false, description:'chat not found' }) });
const sentBad = await app.postTelegram('x');
t('Telegram ปฏิเสธ -> คืน false เพื่อให้คิวลองใหม่', () => eq(sentBad, false));
app.fetchWithTimeout = async () => { throw new Error('เน็ตหลุด'); };
const sentErr = await app.postTelegram('x');
t('เน็ตหลุดตอนส่ง -> คืน false ไม่โยน error ออกมาทำงานอื่นพัง', () => eq(sentErr, false));

console.log('\n--- เปิดดูใบเสร็จย้อนหลัง ---');
let shown = null; app.showThermalReceipt = (tx) => { shown = tx; };
app.state.transactions = [mkTx('TX-VIEW-1')];
app.viewHistoricalReceipt('TX-VIEW-1');
t('เปิดใบเสร็จของบิลที่มีอยู่ได้', () => eq(shown && shown.id, 'TX-VIEW-1'));
shown = null;
app.viewHistoricalReceipt('ไม่มีจริง');
t('บิลที่ไม่มีอยู่ -> ไม่เปิดอะไร ไม่พัง', () => eq(shown, null));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
