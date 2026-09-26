// ─────────────────────────────────────────────────────────────────────────────
//  ชุด 10 (26 ก.ย. 2569) — แก้จากผลตรวจรอบ 4 ตามที่เจ้าของสั่ง
//   [L] ด่านกันเดา PIN แยกรายบัญชี — คนเดียวกดผิดไม่ล็อกทั้งเครื่อง (A2)
//   [E] ผู้จัดการเปิดหน้าแก้บิล = ดูอย่างเดียว · ยกเลิกบิลได้ตามเดิม (A3)
//   [X] ค่าใช้จ่ายจากลิ้นชักเกิน 300 บาท/คน/กะ ต้องมี PIN ผู้จัดการ · พนักงานลบได้แค่ของตัวเอง (A5)
//   [Q] สร้าง QR ไม่สำเร็จ = ปุ่มยืนยันรับเงินกดไม่ได้ และบันทึกบิลไม่ได้ (A6)
//   [C] กราฟรายวันเริ่ม 10:00 (A7)
//   [Z] ขนาดไฟล์สำรองนับเป็นไบต์ (A8)
//   [P] เครื่องใหม่ = "ยังไม่ได้ตั้ง PIN" ไม่ใช่ "ชำรุด" และเตือนครั้งเดียว (A9)
//   [F] ส่งออกไฟล์สำรองใช้เมนูแชร์ + บอกผลทุกทาง (A10)
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<app.js ก่อนแก้> node tests/test_batch10_real.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv, makeRunner, eq, ok } = require('./harness_db.js');
const { seed, quiet, makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- ชุด 10: ผลตรวจรอบ 4 ---');
const t = R.t;
const section = async (name, fn, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ค้างเกิน ' + ((ms || 90000) / 1000) + ' วินาที')), ms || 90000); });
  try { await Promise.race([fn(), limit]); } catch (e) { await t(`${name} — ทำงานไม่จบทั้งหัวข้อ`, () => { throw e; }); }
  finally { clearTimeout(timer); }
};
// เวลาในวันทำการนี้ (ตัด 06:00) — hh < 6 = เช้ามืดของวันถัดไป
const bkkToday = (hh, mm) => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < 6) base.setDate(base.getDate() - 1);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + (hh < 6 ? 1 : 0), hh, mm || 0).getTime();
};
// seed เดิม: st-1 เอ (staff · 111111) · mg-1 บี (manager · 222222) · เจ้าของ 246810

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[L] ด่านกันเดา PIN แยกรายบัญชี (A2)');
await section('[L]', async () => {
  const { env, app, toasts } = await makeShop({ role: null });
  await settle();
  const E = (id) => env.document.getElementById(id);
  const login = async (uid, pin) => {
    app.currentRole = null; app.currentUser = null;
    app.loginSelectedId = uid; E('login-pin-input').value = pin;
    await app.doLogin(); return app.currentRole;
  };
  for (let i = 0; i < 10; i++) await login('st-1', '999999');
  await t('พนักงานกด PIN ตัวเองผิด 10 ครั้ง → บัญชีพนักงานคนนั้นถูกล็อก (PIN ถูกก็ยังเข้าไม่ได้)', async () => eq(await login('st-1', '111111'), null));
  await t('…แต่เจ้าของยังเข้าได้ทันที (เดิมเจ้าของโดนล็อกไปด้วยทั้งเครื่อง)', async () => eq(await login('__owner__', '246810'), 'owner'));
  await t('…และผู้จัดการยังเข้าได้ทันที', async () => eq(await login('mg-1', '222222'), 'manager'));
  await t('เจ้าของเข้าสำเร็จแล้ว ตัวนับของพนักงานคนนั้นยังอยู่ (ไม่ล้างให้บัญชีอื่น)', () => ok(app.loginGuardWaitSec('st-1') > 0));
  await t('ข้อความบอกว่าเป็นการล็อกเฉพาะบัญชี', async () => {
    toasts.length = 0; await login('st-1', '111111');
    ok(toasts.some(x => /บัญชีนี้/.test(x.m) && /บัญชีอื่นยังเข้าได้/.test(x.m)), JSON.stringify(toasts));
  });

  // ผู้จัดการที่ล็อกอินค้างอยู่ — การถาม PIN ซ้ำต้องไม่ติดล็อกของคนอื่น
  await login('mg-1', '222222');
  app.confirmPinStepUp = app._realConfirmPinStepUp;
  app.askSecret = async () => '222222';
  await t('ผู้จัดการยืนยันรายการเสี่ยงได้ ทั้งที่พนักงานอีกคนถูกล็อกอยู่ (เดิมยกเลิกบิล/ปิดกะไม่ได้)', async () => {
    eq(app.currentRole, 'manager', 'ผู้จัดการต้องล็อกอินได้ก่อน');
    eq(await app.confirmPinStepUp('ทดสอบ'), true);
  });
  app.askSecret = async () => '000000';
  for (let i = 0; i < 5; i++) await app.confirmPinStepUp('ทดสอบ');
  await t('ผู้จัดการใส่ PIN ซ้ำผิด 5 ครั้ง → นับในบัญชีผู้จัดการ (บัญชีนี้ล็อก)', () => ok(app.loginGuardWaitSec('mg-1') > 0));
  await t('…เจ้าของยังเข้าได้', async () => eq(await login('__owner__', '246810'), 'owner'));

  // เก็บลงเครื่องแบบรายบัญชี — เปิดแอปใหม่ยังล็อกเฉพาะบัญชีเดิม
  const saved = JSON.parse(env.storage['epos_login_guard'] || 'null');
  await t('บันทึกลงเครื่องเป็นรายบัญชี (v2)', () => { eq(saved && saved.v, 2); ok(saved.accounts['st-1'] && saved.accounts['mg-1']); ok(!saved.accounts['__owner__']); });
  app._loginGuardLoaded = false; app._loginGuard = null;
  await t('เปิดแอปใหม่ → บัญชีที่ถูกล็อกยังล็อกอยู่', () => { ok(app.loginGuardWaitSec('st-1') > 0); eq(app.loginGuardWaitSec('__owner__'), 0); });

  // รูปแบบเก่า (ก้อนเดียว) ที่ค้างในเครื่องตอนอัปเดต → ไม่ล็อกใคร เริ่มนับใหม่รายบัญชี
  env.storage['epos_login_guard'] = JSON.stringify({ fails: 9, lockUntil: Date.now() + 10 * 60e3 });
  app._loginGuardLoaded = false; app._loginGuard = null;
  await t('ตัวนับรูปแบบเก่าที่ค้างอยู่ตอนอัปเดต → ไม่ล็อกเจ้าของ', async () => eq(await login('__owner__', '246810'), 'owner'));

  // รหัสบัญชีแปลก ๆ ต้องไม่ทำให้ตัวนับพัง
  app.loginGuardFail('__proto__'); app.loginGuardFail('constructor');
  await t('รหัสบัญชี "__proto__" / "constructor" ไม่ทำให้ตัวนับพัง', () => { eq(app.loginGuardWaitSec('__proto__'), 0); eq(typeof app._loginGuard.hasOwnProperty, 'undefined'); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[E] หน้าแก้บิลของผู้จัดการ = ดูอย่างเดียว (A3)');
await section('[E]', async () => {
  const { env, app } = await makeShop();
  await settle();
  readyCheckout(env, null, 'cash', 1000);
  await app.processCheckout(); await settle();
  const tx = app.state.transactions[app.state.transactions.length - 1];
  const E = (id) => env.document.getElementById(id);
  app.currentRole = 'manager'; app.currentUser = { id: 'mg-1', name: 'บี' };
  app.openTransactionEdit(tx.id);
  await t('ผู้จัดการ: ปุ่ม "บันทึกการแก้ไข" ถูกซ่อน (เดิมกดได้แล้วถูกปฏิเสธทุกครั้ง)', () => eq(E('btn-save-tx-edit').style.display, 'none'));
  await t('ผู้จัดการ: ช่องลูกค้า/ช่องทางจ่าย/ส่วนลด ล็อกหมด', () => { eq(E('edit-tx-customer').disabled, true); eq(E('edit-tx-payment').disabled, true); eq(E('edit-tx-discount').disabled, true); });
  await t('ผู้จัดการ: บอกชัดว่าดูอย่างเดียว + หัวหน้าต่างไม่ใช่ "แก้ไข"', () => {
    eq(E('edit-tx-access-note').style.display, 'block'); ok(/ดูอย่างเดียว/.test(E('edit-tx-access-note').innerHTML));
    eq(E('edit-tx-modal-title').innerText, 'รายละเอียดบิล'); eq(E('btn-close-tx-edit').innerText, 'ปิด');
  });
  await t('ผู้จัดการ: ส่วนยกเลิกบิลยังอยู่', () => eq(E('edit-tx-void-section').style.display, ''));
  E('void-money-outcome').value = 'none';
  await app.voidTransaction(); await (app._confirmP || Promise.resolve()); await settle(40);
  await t('ผู้จัดการ: ยกเลิกบิลได้ตามเดิม', () => ok(!app.state.transactions.some(x => x.id === tx.id)));
  // เจ้าของ: กลับมาแก้ได้ครบ
  app.currentRole = 'owner'; app.currentUser = { id: '__owner__', name: 'เจ้าของร้าน' };
  readyCheckout(env, null, 'cash', 1000);
  await app.processCheckout(); await settle();
  const tx2 = app.state.transactions[app.state.transactions.length - 1];
  app.openTransactionEdit(tx2.id);
  await t('เจ้าของ: แก้ได้ทุกช่อง ปุ่มบันทึกกลับมา หัวหน้าต่าง "แก้ไขรายการขาย"', () => {
    eq(E('btn-save-tx-edit').style.display, ''); eq(E('edit-tx-customer').disabled, false); eq(E('edit-tx-discount').disabled, false);
    eq(E('edit-tx-access-note').style.display, 'none'); eq(E('edit-tx-modal-title').innerText, 'แก้ไขรายการขาย'); eq(E('btn-close-tx-edit').innerText, 'ยกเลิก');
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[X] ค่าใช้จ่ายจากลิ้นชัก: เพดาน 300 บาท/คน/กะ · สิทธิ์ลบ (A5)');
await section('[X]', async () => {
  const { env, app, toasts } = await makeShop({ role: 'staff' });
  await settle();
  const E = (id) => env.document.getElementById(id);
  let asked = 0, answer = null;
  app.askSecret = async () => { asked++; return answer; };
  app.confirmPinStepUp = app._realConfirmPinStepUp;
  const add = async (amount, source, note) => {
    E('expense-type').value = 'other'; E('expense-amount').value = String(amount);
    E('expense-note').value = note || 'x'; E('expense-source').value = source || 'drawer';
    const n0 = app.state.shift.expenses.length;
    await app.addExpense(); await settle();
    return app.state.shift.expenses.length > n0 ? app.state.shift.expenses[app.state.shift.expenses.length - 1] : null;
  };
  const me = (role) => {
    app.currentRole = role;
    app.currentUser = role === 'owner' ? { id: '__owner__', name: 'เจ้าของร้าน' } : role === 'manager' ? { id: 'mg-1', name: 'บี' } : { id: 'st-1', name: 'เอ' };
  };

  me('staff');
  const e1 = await add(250, 'drawer', 'น้ำแข็ง');
  await t('พนักงานลง 250 (ยังไม่เกิน 300) → บันทึกเลย ไม่ถาม PIN', () => { ok(e1); eq(asked, 0); eq(e1.byId, 'st-1'); });
  answer = '000000';
  const e2 = await add(100, 'drawer', 'ของใช้');
  await t('ลงเพิ่ม 100 (รวม 350 เกินเพดาน) + PIN ผิด → ไม่บันทึก (เดิมบันทึกได้ไม่จำกัด)', () => { eq(e2, null); eq(asked, 1); });
  const savedOwner = app.ownerPin;
  app.ownerPin = await app.hashPin('123456'); answer = '123456';
  await t('PIN เจ้าของที่ยังเป็นค่าเริ่มต้น (123456 อยู่ในคู่มือสาธารณะ) อนุมัติไม่ได้', async () => eq(await add(100, 'drawer'), null));
  app.ownerPin = savedOwner;
  answer = '111111';
  await t('พนักงานใส่ PIN ตัวเอง → อนุมัติไม่ได้', async () => eq(await add(100, 'drawer'), null));
  // ผู้จัดการที่ยังไม่เคยล็อกอินหลังกติกา PIN 6 หลัก (PIN เดิม 4 หลัก) → อนุมัติไม่ได้จนกว่าจะตั้งใหม่
  app.state.staff.push({ id: 'mg-4', name: 'ดี', role: 'ผู้จัดการ', accessLevel: 'manager', pin: await app.hashPin('4444') });
  answer = '4444'; toasts.length = 0;
  await t('PIN ผู้จัดการ 4 หลัก (ยังไม่ตั้งใหม่) → อนุมัติไม่ได้ และบอกเหตุผล', async () => {
    eq(await add(100, 'drawer'), null); ok(toasts.some(x => /6 หลัก/.test(x.m)), JSON.stringify(toasts));
  });
  app.state.staff = app.state.staff.filter(s => s.id !== 'mg-4');
  app.loginGuardReset('__approval__');
  answer = '222222';
  const e4 = await add(100, 'drawer', 'ของใช้');
  await t('ผู้จัดการใส่ PIN → บันทึก พร้อมชื่อผู้อนุมัติ', () => { ok(e4); eq(e4.approvedBy, 'บี'); eq(e4.approvedById, 'mg-1'); });
  answer = '246810';
  const eO = await add(60, 'drawer', 'เจ้าของอนุมัติ');   // 250 (ยังไม่อนุมัติ) + 60 = 310 → ต้องอนุมัติ
  await t('เจ้าของใส่ PIN อนุมัติได้ด้วย', () => { ok(eO); eq(eO.approvedBy, 'เจ้าของร้าน'); });
  const asked0 = asked;
  const e5 = await add(50, 'drawer');
  await t('รายการที่อนุมัติแล้วไม่นับซ้ำ: 250 + 50 = 300 พอดี → ไม่ถาม', () => { ok(e5); eq(asked, asked0); });
  const e6 = await add(5000, 'other', 'ค่าเช่า');
  await t('จ่ายทางอื่น (ไม่หักลิ้นชัก) → ไม่มีเพดาน', () => { ok(e6); eq(asked, asked0); });
  answer = null;
  await add(1, 'drawer');
  await t('เกินแม้ 1 บาท (รวม 301) → ถาม PIN', () => eq(asked, asked0 + 1));
  // แบ่งลงทีละน้อยไม่รอด (อีกบัญชี ยอดเริ่มจาก 0)
  app.currentRole = 'staff'; app.currentUser = { id: 'st-9', name: 'ซี' };
  const s1 = await add(299, 'drawer'); const s2 = await add(299, 'drawer');
  await t('แบ่งลง 299 สองครั้ง → ครั้งที่สองต้องขออนุมัติ (นับยอดรวมทั้งกะ ไม่ใช่ทีละรายการ)', () => { ok(s1); eq(s2, null); });
  // ผู้จัดการ: ใส่ PIN ตัวเองซ้ำ
  me('manager'); answer = '222222';
  const m1 = await add(400, 'drawer');
  await t('ผู้จัดการลง 400 → ใส่ PIN ตัวเองซ้ำแล้วบันทึก (ผู้อนุมัติ = ตัวเอง)', () => { ok(m1); eq(m1.approvedBy, 'บี'); });
  answer = '000000';
  await t('ผู้จัดการลงเกินเพดาน + PIN ผิด → ไม่บันทึก', async () => eq(await add(400, 'drawer'), null));
  app.loginGuardReset('mg-1');
  me('owner'); const askedO = asked;
  const o1 = await add(5000, 'drawer');
  await t('เจ้าของลงเท่าไรก็ได้ ไม่ถาม PIN', () => { ok(o1); eq(asked, askedO); });

  // ตัวนับการอนุมัติแยกจากบัญชีจริง
  me('staff'); answer = '000000';
  for (let i = 0; i < 6; i++) await add(1000, 'drawer');
  await t('กด PIN อนุมัติผิดจนล็อก → ล็อกเฉพาะ "การอนุมัติ" บัญชีผู้จัดการ/เจ้าของยังเข้าได้', () => {
    ok(app.loginGuardWaitSec('__approval__') > 0); eq(app.loginGuardWaitSec('mg-1'), 0); eq(app.loginGuardWaitSec('__owner__'), 0);
  });

  // ── สิทธิ์ลบ ──
  const has = (id) => app.state.shift.expenses.some(x => x.id === id);
  const del = async (id) => { app._confirmP = null; await app.deleteExpense(id); await (app._confirmP || Promise.resolve()); await settle(); };
  me('staff');
  const legacy = { id: 'exp_legacy_1', type: 'other', amount: 20, note: 'เก่า', time: Date.now(), by: 'เอ' };
  app.state.shift.expenses.push(legacy);
  toasts.length = 0;
  await del(m1.id);
  await t('พนักงานลบค่าใช้จ่ายของผู้จัดการไม่ได้ (เดิมลบได้)', () => { ok(has(m1.id)); ok(toasts.some(x => /ลบได้เฉพาะ/.test(x.m)), JSON.stringify(toasts)); });
  await del(legacy.id);
  await t('รายการเก่าที่ไม่มีรหัสคนลง → พนักงานลบไม่ได้ แม้ชื่อตรงกัน', () => ok(has(legacy.id)));
  await del(e1.id);
  await t('พนักงานลบรายการของตัวเองได้', () => ok(!has(e1.id)));
  // หน้าแดชบอร์ด: ปุ่มลบโผล่เฉพาะรายการที่ลบได้
  const real = (name) => app.constructor.prototype[name].bind(app);
  real('renderDashboard')();
  const listHtml = E('expense-list').innerHTML;
  await t('แดชบอร์ด (พนักงาน): ไม่มีปุ่มลบของรายการคนอื่น · มีของตัวเอง · โชว์ผู้อนุมัติ', () => {
    ok(!listHtml.includes(`deleteExpense('${m1.id}')`), 'ต้องไม่มีปุ่มลบของผู้จัดการ');
    ok(listHtml.includes(`deleteExpense('${e4.id}')`), 'ต้องมีปุ่มลบของตัวเอง');
    ok(/อนุมัติโดย บี/.test(listHtml), 'ต้องโชว์ผู้อนุมัติ');
  });
  me('manager'); answer = '222222'; const a0 = asked;
  await del(legacy.id);
  await t('ผู้จัดการลบรายการของคนอื่นได้ โดยใส่ PIN ตัวเองซ้ำ', () => { ok(!has(legacy.id)); eq(asked, a0 + 1); });
  answer = '000000';
  await del(e4.id);
  await t('ผู้จัดการใส่ PIN ผิด → ไม่ลบ', () => ok(has(e4.id)));
  app.loginGuardReset('mg-1');
  const a1 = asked;
  await del(m1.id);
  await t('ผู้จัดการลบรายการของตัวเอง → ไม่ถาม PIN', () => { ok(!has(m1.id)); eq(asked, a1); });
  me('owner');
  await del(e4.id);
  await t('เจ้าของลบได้ทุกรายการ ไม่ถาม PIN', () => { ok(!has(e4.id)); eq(asked, a1); });
  const raw = await env.raw('shift');
  await t('ข้อมูลลงเครื่องจริง: ผู้อนุมัติ + รหัสคนลงติดไปกับรายการ', () => ok(raw.expenses.some(x => x.id === eO.id && x.approvedBy === 'เจ้าของร้าน' && x.byId === 'st-1')));
  // ข้อความปิดกะ Telegram แสดงผู้อนุมัติ
  const msg = app.buildShiftReportMessage({ startTime: Date.now() - 3600e3, endTime: Date.now(), startCash: 1000,
    countedCash: 1000, expectedCash: 1000, difference: 0, cashSales: 0, expenses: app.state.shift.expenses, closedBy: 'บี' });
  await t('ข้อความปิดกะ (Telegram) บอกว่าใครอนุมัติ', () => ok(/อนุมัติ เจ้าของร้าน/.test(msg), msg));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Q] QR พร้อมเพย์สร้างไม่สำเร็จ (A6)');
await section('[Q]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const btn = env.document.getElementById('btn-complete-checkout');
  env.ctx.PromptPayQR = null;   // ไลบรารี QR โหลดไม่ขึ้น
  readyCheckout(env, null, 'cash', 1000);
  app.selectPaymentMethod('promptpay');
  await t('สร้าง QR ไม่สำเร็จ → ปุ่มยืนยันรับเงินกดไม่ได้ (เดิมกดได้)', () => eq(btn.disabled, true));
  await t('บนจอบอกว่าสร้าง QR ไม่สำเร็จ', () => ok(/สร้าง QR ไม่สำเร็จ/.test(env.document.getElementById('dynamic-qr-box').innerHTML)));
  const n0 = app.state.transactions.length;
  await app.processCheckout(); await settle();
  await t('เรียกบันทึกบิลตรง ๆ ก็ไม่ผ่าน (ไม่บันทึกว่าได้รับโอน)', () => eq(app.state.transactions.length, n0));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'promptpay-qr.js'), 'utf8'), env.ctx);
  app.selectPaymentMethod('promptpay');
  await t('ไลบรารีกลับมา → QR ขึ้น ปุ่มกดได้', () => { eq(btn.disabled, false); ok(app.lastPromptPayPayload); });
  await app.processCheckout(); await settle();
  await t('…และบันทึกบิลโอนได้ตามปกติ', () => { eq(app.state.transactions.length, n0 + 1); eq(app.paymentMethodOf(app.state.transactions[n0]), 'promptpay'); });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[C] กราฟรายวันเริ่ม 10:00 (A7)');
await section('[C]', async () => {
  const { env, app } = await makeShop();
  await settle();
  const bills = [[10, 30, 100], [12, 59, 1], [13, 0, 20], [22, 15, 300], [0, 30, 4], [2, 30, 5000], [4, 0, 7]];
  const txs = bills.map(([h, m, total]) => ({ date: bkkToday(h, m), total }));
  app.constructor.prototype.renderReportsChart.call(app, txs, 'daily');
  const labels = (env.document.getElementById('css-bar-chart-labels').innerHTML.match(/>([^<]+)</g) || []).map(s => s.slice(1, -1).trim()).filter(Boolean);
  const tips = (env.document.getElementById('css-bar-chart').innerHTML.match(/฿[\d,]+/g) || []);
  await t('ช่วงแรกของกราฟคือ 10:00-13:00 (เดิม 11:00-14:00)', () => eq(labels[0], '10:00-13:00'));
  await t('ยอด 10:30 อยู่ในช่วงแรก ไม่ใช่ "ก่อนเปิด"', () => { eq(tips[0], '฿101'); ok(!labels.some(l => /ก่อนเปิด/.test(l)), labels.join('|')); });
  await t('ช่วงท้ายคืน 01:00-03:00 และ "นอกเวลา 03-10" แสดงเมื่อมียอด', () => {
    eq(labels, ['10:00-13:00', '13:00-16:00', '16:00-19:00', '19:00-22:00', '22:00-01:00', '01:00-03:00', 'นอกเวลา (03-10)']);
    eq(tips, ['฿101', '฿20', '฿0', '฿0', '฿304', '฿5,000', '฿7']);
  });
  app.constructor.prototype.renderReportsChart.call(app, [{ date: bkkToday(11, 0), total: 50 }], 'daily');
  await t('ไม่มียอดนอกเวลา → ไม่มีแท่งนอกเวลา', () => ok(!/นอกเวลา/.test(env.document.getElementById('css-bar-chart-labels').innerHTML)));
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Z] ขนาดไฟล์สำรองเป็นไบต์ (A8)');
await section('[Z]', async () => {
  const { env, app } = await makeShop();
  await settle();
  await t('ตัวนับไบต์: ไทย 3 · อังกฤษ 1 · อีโมจิ 4', () => {
    const f = env.ctx.utf8ByteLength;
    eq(f('ก'), 3); eq(f('abc'), 3); eq(f('😀'), 4); eq(f('é'), 2); eq(f('ทดสอบ abc'), Buffer.byteLength('ทดสอบ abc'));
  });
  // ข้อมูลภาษาไทยเยอะ ๆ — จำนวนตัวอักษรต่างจากไบต์ชัดเจน
  app.state.customers = Array.from({ length: 200 }, (_, i) => ({ id: 'c' + (i + 1), name: 'ลูกค้าทดสอบภาษาไทย' + i, phone: '', note: 'หมายเหตุยาว ๆ เป็นภาษาไทยทั้งหมด' }));
  await app.saveState();
  let body = null;
  const orig = env.ctx.fetch;
  env.ctx.fetch = (url, opts) => { try { const p = JSON.parse(opts.body); if (p.action === 'backup') body = opts.body; } catch (e) {} return orig(url, opts); };
  await app.autoBackupToGoogleDrive({ silent: true }); await settle(50);
  await t('ขนาดที่บันทึก = ไบต์จริงของไฟล์ที่ส่ง (เดิมนับตัวอักษร ต่ำกว่าจริง)', () => {
    ok(body, 'ต้องมีการส่งไฟล์สำรอง');
    ok(Buffer.byteLength(body) > body.length, 'ข้อมูลทดสอบต้องมีภาษาไทยจริง');
    eq(app.backupStatus.lastSizeBytes, Buffer.byteLength(body));
  });
  env.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[P] เครื่องใหม่: "ยังไม่ได้ตั้ง PIN" ไม่ใช่ "ชำรุด" (A9)');
await section('[P]', async () => {
  const env = createEnv(); const toasts = quiet(env.app);
  await seed(env);
  await env.db.state.delete('ownerPin');
  await env.app.init(); await settle(700);
  await t('ไม่มี PIN เจ้าของในเครื่อง → ข้อความ "ยังไม่ได้ตั้ง" ไม่ใช่ "ชำรุด"', () => {
    ok(toasts.some(x => /ยังไม่ได้ตั้ง PIN/.test(x.m)), JSON.stringify(toasts)); ok(!toasts.some(x => /ชำรุด/.test(x.m)));
  });
  await t('ค่าเริ่มต้นถูกบันทึกลงเครื่อง (เดิมไม่บันทึก จึงเตือนซ้ำทุกครั้งที่เปิดแอป)', async () => eq(await env.raw('ownerPin'), await env.app.hashPin('123456')));
  toasts.length = 0;
  await env.app.loadState(); await settle(700);
  await t('เปิดแอปครั้งถัดไป → ไม่เตือนอีก', () => ok(!toasts.some(x => /PIN/.test(x.m)), JSON.stringify(toasts)));
  env.dispose();

  const env2 = createEnv(); const toasts2 = quiet(env2.app);
  await seed(env2, { ownerPin: 'abc' });
  await env2.app.init(); await settle(700);
  await t('PIN ที่มีอยู่แต่รูปแบบเสีย → ยังเตือนว่า "ชำรุด" และไม่เขียนทับของเดิม', async () => {
    ok(toasts2.some(x => /ชำรุด/.test(x.m)), JSON.stringify(toasts2)); eq(await env2.raw('ownerPin'), 'abc');
  });
  env2.dispose();
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[F] ส่งออกไฟล์สำรอง .json (A10)');
await section('[F]', async () => {
  const { env, app, toasts } = await makeShop();
  await settle();
  // ลิงก์ดาวน์โหลด: URL.createObjectURL ของ Node รับเฉพาะ Blob จริง — จำลองแบบเบราว์เซอร์
  let downloads = 0;
  env.ctx.URL = class extends URL { static createObjectURL() { downloads++; return 'blob:test'; } static revokeObjectURL() {} };
  // เครื่องที่รองรับเมนูแชร์พร้อมไฟล์ (iPad)
  let shared = null;
  env.ctx.File = class { constructor(parts, name, o) { this.parts = parts; this.name = name; this.type = o && o.type; } };
  env.ctx.navigator.canShare = (d) => !!(d && d.files && d.files.length);
  env.ctx.navigator.share = async (d) => { shared = d; };
  toasts.length = 0;
  const r1 = app.exportData();
  const ok1 = await app._exportP;
  await t('iPad: เปิดเมนูแชร์พร้อมไฟล์ .json (ไม่ดาวน์โหลดซ้อน)', () => { eq(r1, true); ok(shared && shared.files[0].name.endsWith('.json')); eq(ok1, true); eq(downloads, 0); });
  await t('แชร์สำเร็จ → บอกให้ไปตรวจในแอป "ไฟล์" (เดิมเงียบ)', () => ok(toasts.some(x => /แอป "ไฟล์"/.test(x.m)), JSON.stringify(toasts)));
  toasts.length = 0;
  env.ctx.navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
  app.exportData(); const ok2 = await app._exportP;
  await t('กดยกเลิกเมนูแชร์ → บอกว่ายังไม่ได้บันทึกไฟล์สำรอง', () => { eq(ok2, false); ok(toasts.some(x => /ยังไม่ได้บันทึกไฟล์สำรอง/.test(x.m)), JSON.stringify(toasts)); });
  toasts.length = 0;
  env.ctx.navigator.share = async () => { const e = new Error('no'); e.name = 'NotAllowedError'; throw e; };
  app.exportData(); const ok3 = await app._exportP;
  await t('เมนูแชร์ใช้ไม่ได้ → ถอยไปดาวน์โหลด และบอกให้ตรวจไฟล์', () => { eq(ok3, true); ok(toasts.some(x => /ดาวน์โหลด/.test(x.m) && /แอป "ไฟล์"/.test(x.m)), JSON.stringify(toasts)); });
  // เครื่องที่ไม่มีเมนูแชร์ (คอม)
  delete env.ctx.navigator.share; delete env.ctx.navigator.canShare;
  toasts.length = 0;
  await t('คอม (ไม่มีเมนูแชร์) → ดาวน์โหลด + ขึ้นข้อความบอกผล', () => { eq(app.exportData(), true); ok(toasts.some(x => /ดาวน์โหลด/.test(x.m)), JSON.stringify(toasts)); });
  // สำเนาก่อนกู้: ไม่เปิดเมนูแชร์กลางงานกู้ และไม่ขึ้นข้อความซ้อน
  env.ctx.navigator.share = async () => { shared = 'SHOULD-NOT'; };
  env.ctx.navigator.canShare = () => true;
  shared = null; toasts.length = 0;
  const d0 = downloads;
  app.exportData({ downloadOnly: true, quiet: true });
  await t('สำเนาก่อนกู้ข้อมูล: ดาวน์โหลดอย่างเดียว ไม่เปิดเมนูแชร์ ไม่ขึ้นข้อความ', () => { eq(shared, null); eq(toasts.length, 0); eq(downloads, d0 + 1); });
  app.currentRole = 'staff'; app.currentUser = { id: 'st-1', name: 'เอ' };
  await t('พนักงานยังส่งออกไม่ได้ (ด่านเดิมไม่หาย)', () => eq(app.exportData(), false));
  env.dispose();
});

R.done();
})();
