// งานแก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appC · ส่วนกู้ข้อมูล/ตั้งค่า/ล็อกอิน)
// ข้อ 3 (ตั้งค่าเงินตอนกู้) · 56 (อัตรา VAT จำนวนเต็ม) · 64 (เพดานโลโก้) · 39 (ไฟล์จากเครื่องฉุกเฉินที่ไม่ครบ) · 30 (สำรองหลังกู้)
// 34 (ตะกร้าพักเก็บหมายเหตุ/ลูกค้า) · 46 (ถามก่อนเข้าคิว) · 25 (รูปแบบ Telegram) · 62 (ด่าน PIN ซ้ำ) · 67 (โค้ดค้าง)
// ใช้แอปจริง + Dexie จริง + Apps Script จริงในชีต/Drive จำลอง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ
process.env.TZ = 'Asia/Bangkok';
const fs = require('fs'), path = require('path');
const { makeShop, readyCheckout, settle, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- ตรวจ 19 ต.ค. 2569 · ชุด appC: กู้ข้อมูล / ตั้งค่า / ล็อกอิน ---');
const APP_SRC = fs.readFileSync(process.env.POS_APP_SRC || path.join(__dirname, '..', 'app.js'), 'utf8');

const DRINK = { id: 'd1', name: 'น้ำ', price: 1000, category: 'drinks', duration: 0, commission: 0 };
const sellDrink = async (s, received) => { readyCheckout(s.env, [DRINK], 'cash', received); await s.app.processCheckout(); await settle(20); return s.app.state.transactions.at(-1); };
const sellCut = async (s, price) => { readyCheckout(s.env, [{ id: 's1', name: 'ตัดผม', price }], 'cash', price); await s.app.processCheckout(); await settle(15); return s.app.state.transactions.at(-1); };
const clone = o => JSON.parse(JSON.stringify(o));
const withFileReader = (env) => { env.ctx.FileReader = class { readAsText(f) { setTimeout(() => this.onload({ target: { result: f.text } }), 0); } }; };
const importFile = async (app, obj) => {
  app.importData({ target: { files: [{ text: JSON.stringify(obj) }], value: 'x' } });
  await settle(30); await app._confirmP; await settle(80);
};
// คำตอบของกล่องถาม: ask = กล่องยืนยัน 2 ปุ่ม · typed = กล่องพิมพ์ยืนยัน (คืน true เมื่อ keyword อยู่ใน typedYes)
function answer(app, o) {
  const log = { ask: [], typed: [] };
  app.askConfirm = async (m) => { log.ask.push(String(m)); return o && o.ask ? o.ask(String(m)) : true; };
  app.askTypedConfirm = async (m, k) => { log.typed.push({ m: String(m), k }); return !!(o && o.typedYes && o.typedYes.includes(k)); };
  return log;
}
// เครื่องก่อนเปิด VAT → สำรองขึ้น Drive (ทางจริง) → เจ้าของเปิด VAT · ลดค่าธรรมเนียมบัตรเป็น 8% · ย้ายพร้อมเพย์ · ตั้งหมวดตัดผมคิด VAT
async function vatSwitchShop() {
  const s = await makeShop({ rows: { vatEnabled: false, vatRate: 7, cardFeeRate: 10 } });
  await settle();
  s.app._ownerKey = s.gas.setupOwnerKey();
  await sellDrink(s, 1000); await s.app.syncPendingTransactions(true); await settle(30);
  ok(await s.app.autoBackupToGoogleDrive({ silent: true }), 'สำรองขึ้น Drive ไม่สำเร็จ');
  const list = await s.app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true });
  s.file = list.details.files[0];
  s.app.vatEnabled = true; s.app.vatRate = 7; s.app.cardFeeRate = 8; s.app.shopPromptPayId = '0899999999';
  s.app.state.categories = s.app.state.categories.map(c => c.id === 'barber' ? Object.assign({}, c, { vat: true }) : c);
  await s.app.saveState();
  return s;
}
const restoreDrive = async (s) => { s.app.restoreFromDriveBackup(s.file.id, s.app.formatBackupLabel(s.file)); await s.app._confirmP; await settle(100); };
const barberVat = app => (app.state.categories.find(c => c.id === 'barber') || {}).vat;

(async () => {
  // ═══ ข้อ 3: กู้ไฟล์เก่าต้องไม่ทำให้ VAT/ค่าธรรมเนียมบัตร/พร้อมเพย์/ธง VAT ของหมวด ย้อนเงียบ ๆ ═══
  await R.t('ข้อ3 กู้ไฟล์ก่อนเปิด VAT จาก Drive (กดยืนยันตามปกติ) → คงค่าของเครื่อง · บิลถัดไป 1,070 / VAT 70 · พร้อมเพย์/อัตราบัตร/ธงหมวดคงเดิม', async () => {
    const s = await vatSwitchShop();
    try {
      const log = answer(s.app, {});
      const t0 = s.toasts.length;
      await restoreDrive(s);
      const q = log.ask.find(m => /ตั้งค่าเงินในไฟล์ต่าง/.test(m)) || '';
      ok(q, 'ต้องถามเรื่องตั้งค่าเงินที่ต่าง: ' + JSON.stringify(log.ask));
      ok(/VAT: เครื่องนี้ เปิด → ในไฟล์ ปิด/.test(q), q);
      ok(/ค่าธรรมเนียมบัตร: เครื่องนี้ 8% → ในไฟล์ 10%/.test(q), q);
      ok(/เลขพร้อมเพย์: เครื่องนี้ 0899999999 → ในไฟล์ 0812345678/.test(q), q);
      ok(/VAT ของหมวด "ตัดผม": เครื่องนี้ คิด VAT → ในไฟล์ ไม่คิด VAT/.test(q), q);
      eq([s.app.vatEnabled, await s.env.raw('vatEnabled')], [true, true]);
      eq([s.app.cardFeeRate, await s.env.raw('cardFeeRate')], [8, 8]);
      eq([s.app.shopPromptPayId, await s.env.raw('shopPromptPayId')], ['0899999999', '0899999999']);
      eq(barberVat(s.app), true); eq(((await s.env.raw('categories')).find(c => c.id === 'barber') || {}).vat, true);
      ok(s.toasts.slice(t0).some(t => /คงตั้งค่าเงินของเครื่องนี้ไว้/.test(t.m)), 'ต้องบอกหลังกู้ว่าคงค่าของเครื่อง');
      eq(s.app.state.transactions.length, 1, 'กู้ไฟล์ (บิลเดียว) ต้องสำเร็จ');
      const tx = await sellDrink(s, 1070);
      eq([tx.total, tx.vatAmount], [1070, 70]);
      readyCheckout(s.env, [DRINK], 'credit', 0);
      eq(s.app.buildCheckoutPlan('credit', {}).fee.baseRate, 8);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ3 เลือกใช้ค่าในไฟล์ (ยกเลิกขั้นแรก + พิมพ์ "ใช้ค่าในไฟล์") → ได้ค่าในไฟล์ + บอกค่าที่ได้ · ย้อนการกู้ = กลับเป็นค่าเดิมตรงทุกค่า', async () => {
    const s = await vatSwitchShop();
    try {
      const log = answer(s.app, { ask: m => !/ตั้งค่าเงินในไฟล์ต่าง/.test(m), typedYes: ['ใช้ค่าในไฟล์'] });
      const t0 = s.toasts.length;
      await restoreDrive(s);
      ok(log.typed.some(x => x.k === 'ใช้ค่าในไฟล์'), 'ต้องพิมพ์ยืนยันก่อนใช้ค่าในไฟล์');
      eq([s.app.vatEnabled, s.app.cardFeeRate, s.app.shopPromptPayId, barberVat(s.app)], [false, 10, '0812345678', false]);
      eq(await s.env.raw('vatEnabled'), false);
      ok(s.toasts.slice(t0).some(t => /ใช้ตั้งค่าเงินจากไฟล์: .*VAT ปิด.*ค่าธรรมเนียมบัตร 10%/.test(t.m)), JSON.stringify(s.toasts.slice(t0).map(t => t.m)));
      answer(s.app, {});
      await s.app.undoLastRestore(); await s.app._confirmP; await settle(80);
      eq([s.app.vatEnabled, s.app.cardFeeRate, s.app.shopPromptPayId, barberVat(s.app)], [true, 8, '0899999999', true]);
      eq([await s.env.raw('vatEnabled'), await s.env.raw('cardFeeRate'), await s.env.raw('shopPromptPayId')], [true, 8, '0899999999']);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ3 ยกเลิกขั้นพิมพ์ยืนยัน → ยกเลิกการกู้ทั้งหมด ข้อมูล/ตั้งค่าในเครื่องไม่ถูกแตะ', async () => {
    const s = await vatSwitchShop();
    try {
      answer(s.app, { ask: m => !/ตั้งค่าเงินในไฟล์ต่าง/.test(m), typedYes: [] });
      await sellDrink(s, 1070);
      const t0 = s.toasts.length;
      await restoreDrive(s);
      eq(s.app.state.transactions.length, 2); eq((await s.env.raw('transactions')).length, 2);
      eq([s.app.vatEnabled, s.app.cardFeeRate], [true, 8]);
      ok(s.toasts.slice(t0).some(t => /ยกเลิกการกู้ข้อมูลแล้ว/.test(t.m)));
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ3 เครื่องใหม่ (ไม่มีบิล/กะ/พร้อมเพย์ · ตั้งค่าเงินเป็นค่าตั้งต้น) → นำเข้าใช้ค่าในไฟล์ ไม่ถาม แล้วบอกค่าที่ได้', async () => {
    const src = await makeShop({ rows: { vatEnabled: true, vatRate: 7, cardFeeRate: 7, shopPromptPayId: '0899999999' } });
    const file = clone(src.app.buildBackupPayload()); src.env.dispose();
    const s = await makeShop({ rows: { vatEnabled: false, vatRate: 7, cardFeeRate: 10, shopPromptPayId: '',
      shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } } });
    try {
      withFileReader(s.env);
      const log = answer(s.app, {});
      const t0 = s.toasts.length;
      await importFile(s.app, file);
      eq(log.ask.filter(m => /ตั้งค่าเงินในไฟล์ต่าง/.test(m)).length, 0, 'เครื่องใหม่ไม่ต้องถาม');
      eq([s.app.vatEnabled, s.app.cardFeeRate, s.app.shopPromptPayId], [true, 7, '0899999999']);
      eq([await s.env.raw('vatEnabled'), await s.env.raw('cardFeeRate')], [true, 7]);
      ok(s.toasts.slice(t0).some(t => /ใช้ตั้งค่าเงินจากไฟล์: .*VAT เปิด/.test(t.m)), JSON.stringify(s.toasts.slice(t0).map(t => t.m)));
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ3 นำเข้าไฟล์บนเครื่องที่ใช้งานอยู่: กล่องยืนยันแรกบอกรายการที่ต่าง · หมวดที่มีทั้งสองฝั่งใช้ธงของเครื่อง หมวดใหม่ใช้ธงในไฟล์', async () => {
    const s = await makeShop();
    try {
      withFileReader(s.env);
      const file = clone(s.app.buildBackupPayload());
      file.vatEnabled = false; file.cardFeeRate = 5;
      file.categories = [{ id: 'barber', name: 'ตัดผม', icon: 'fa-scissors', vat: true }, { id: 'drinks', name: 'เครื่องดื่ม', icon: 'fa-mug-hot', vat: true },
        { id: 'spa', name: 'สปา', icon: 'fa-spa', vat: true }];
      let first = '';
      const sc = s.app.showConfirm;
      s.app.showConfirm = (m, cb, c) => { if (!first) first = String(m); return sc(m, cb, c); };
      answer(s.app, {});
      await importFile(s.app, file);
      ok(/ตั้งค่าเงินในไฟล์ต่างจากเครื่องนี้/.test(first) && /VAT: เครื่องนี้ เปิด → ในไฟล์ ปิด/.test(first) && /ค่าธรรมเนียมบัตร: เครื่องนี้ 10% → ในไฟล์ 5%/.test(first), first);
      eq([s.app.vatEnabled, s.app.cardFeeRate], [true, 10]);
      const cats = Object.fromEntries(s.app.state.categories.map(c => [c.id, c.vat]));
      eq(cats, { barber: false, drinks: true, spa: true });
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ3 (ควบคุม) ไฟล์ตั้งค่าเงินเหมือนเครื่อง → ไม่ถามเพิ่ม ไม่ขึ้นข้อความตั้งค่าเงิน', async () => {
    const s = await makeShop();
    try {
      withFileReader(s.env);
      const log = answer(s.app, {});
      const t0 = s.toasts.length;
      await importFile(s.app, clone(s.app.buildBackupPayload()));
      eq(log.ask.filter(m => /ตั้งค่าเงิน/.test(m)).length, 0);
      ok(!s.toasts.slice(t0).some(t => /ตั้งค่าเงิน/.test(t.m)));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 56: อัตรา VAT ในไฟล์ต้องเป็นจำนวนเต็ม 0–30 (กติกาเดียวกับหน้าตั้งค่า) ═══
  await R.t('ข้อ56 ไฟล์อัตรา VAT 7.5 → แยกไว้ตรวจ คงอัตราเดิม (แม้เลือกใช้ค่าในไฟล์) · "10" (ข้อความ) → 10', async () => {
    const s = await makeShop();
    try {
      const f1 = clone(s.app.buildBackupPayload()); f1.vatRate = 7.5;
      await s.app.applyBackupData(f1, { moneySettings: 'file' }); await settle(30);
      eq([s.app.vatRate, await s.env.raw('vatRate')], [7, 7]);
      ok((s.app.state.quarantine || []).some(q => q.id === 'vatRate' && (q.reasons || []).includes('bad-vatRate')));
      const f2 = clone(s.app.buildBackupPayload()); f2.vatRate = '10';
      await s.app.applyBackupData(f2, { moneySettings: 'file' }); await settle(30);
      eq(s.app.vatRate, 10);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 64: โลโก้ในไฟล์มีเพดาน ═══
  await R.t('ข้อ64 โลโก้ในไฟล์ใหญ่เกิน ~1.5 MB → ไม่รับ คงโลโก้เดิม · รายการตรวจเก็บแค่ขนาด · บอกเจ้าของ · โลโก้เล็กยังรับ', async () => {
    const s = await makeShop({ rows: { shopLogo: 'data:image/png;base64,OLD' } });
    try {
      const big = clone(s.app.buildBackupPayload()); big.shopLogo = 'data:image/png;base64,' + 'A'.repeat(1700000);
      const t0 = s.toasts.length;
      await s.app.applyBackupData(big); await settle(30);
      eq(s.app.shopLogo, 'data:image/png;base64,OLD'); eq(await s.env.raw('shopLogo'), 'data:image/png;base64,OLD');
      const q = (s.app.state.quarantine || []).find(x => x.id === 'shopLogo');
      ok(q && q.original && q.original.length > 1600000 && JSON.stringify(q).length < 2000, 'เก็บแค่ขนาด ไม่เก็บตัวรูป');
      ok(s.toasts.slice(t0).some(t => /โลโก้ในไฟล์ใหญ่เกินไป/.test(t.m)));
      const small = clone(s.app.buildBackupPayload()); small.shopLogo = 'data:image/png;base64,NEWLOGO';
      await s.app.applyBackupData(small); await settle(30);
      eq(s.app.shopLogo, 'data:image/png;base64,NEWLOGO');
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 39: ไฟล์จากเครื่องรับช่วงฉุกเฉินที่ข้อมูลไม่ครบ ═══
  const emergencyFile = async () => {
    const E = await makeShop();
    E.app.primaryStatus = { isPrimary: true, checkedAt: Date.now(), primaryLabel: 'POS-E', primaryClaimedAt: Date.now(),
      recovery: { incomplete: true, startedAt: Date.now() - 3600e3 } };
    await sellCut(E, 500);
    const f = clone(E.app.buildBackupPayload()); E.env.dispose();
    ok(f.recoveryStatus && f.recoveryStatus.incomplete === true, 'ไฟล์ต้องติดธงไม่ครบ');
    return f;
  };
  await R.t('ข้อ39 นำเข้าไฟล์ "ไม่ครบ": กล่องแรกมีคำเตือนแดง + ต้องพิมพ์ยืนยัน · ไม่พิมพ์ = ไม่แตะข้อมูล · พิมพ์แล้ว = นำเข้า', async () => {
    const f = await emergencyFile();
    const s = await makeShop();
    try {
      withFileReader(s.env);
      for (let i = 0; i < 3; i++) await sellCut(s, 300);
      let first = '';
      const sc = s.app.showConfirm;
      s.app.showConfirm = (m, cb, c) => { if (!first) first = String(m); return sc(m, cb, c); };
      let log = answer(s.app, { typedYes: [] });
      await importFile(s.app, f);
      ok(/⛔/.test(first) && /รับช่วงฉุกเฉิน/.test(first), first);
      ok(log.typed.some(x => x.k === 'ไฟล์ไม่ครบ'), 'ต้องพิมพ์ยืนยัน');
      eq(s.app.state.transactions.length, 3); eq((await s.env.raw('transactions')).length, 3);
      log = answer(s.app, { typedYes: ['ไฟล์ไม่ครบ'] });
      await importFile(s.app, f);
      eq(s.app.state.transactions.map(t => t.total), [500]);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ39 กู้จาก Drive ไฟล์ "ไม่ครบ" → พิมพ์ยืนยันก่อน · (ควบคุม) ย้อนการกู้ไม่ถาม', async () => {
    const f = await emergencyFile();
    const s = await makeShop();
    try {
      await sellCut(s, 300);
      s.app.cloudPost = async (action) => { eq(action, 'get_backup'); return { status: 'success', details: { backupData: clone(f) } }; };
      let log = answer(s.app, { typedYes: [] });
      s.app.restoreFromDriveBackup('FILE-E', 'ฉุกเฉิน'); await s.app._confirmP; await settle(80);
      ok(log.typed.some(x => x.k === 'ไฟล์ไม่ครบ' && /⛔/.test(x.m)), JSON.stringify(log.typed));
      eq(s.app.state.transactions.map(t => t.total), [300]);
      log = answer(s.app, { typedYes: ['ไฟล์ไม่ครบ'] });
      s.app.restoreFromDriveBackup('FILE-E', 'ฉุกเฉิน'); await s.app._confirmP; await settle(80);
      eq(s.app.state.transactions.map(t => t.total), [500]);
      // ย้อนการกู้ด้วยสำเนาที่ติดธงไม่ครบ (สำเนาของเครื่องเอง) — ไม่ใช่ไฟล์จากภายนอก ไม่ต้องถาม
      const snap = await s.env.raw('preRestoreSnapshot');
      snap.data.recoveryStatus = { incomplete: true, startedAt: Date.now() - 1000 };
      await s.env.db.state.put({ key: 'preRestoreSnapshot', value: snap });
      log = answer(s.app, { typedYes: [] });
      await s.app.undoLastRestore(); await s.app._confirmP; await settle(80);
      eq(log.typed.filter(x => x.k === 'ไฟล์ไม่ครบ').length, 0);
      eq(s.app.state.transactions.map(t => t.total), [300]);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 30: กู้แล้วต้องสั่งสำรองขึ้น Drive ทันที ═══
  await R.t('ข้อ30 กู้ไฟล์เก่าจาก Drive → ไฟล์ล่าสุดบน Drive = ข้อมูลที่กู้มา (ไม่ใช่ข้อมูลก่อนกู้)', async () => {
    const s = await makeShop(); await settle();
    try {
      s.app._ownerKey = s.gas.setupOwnerKey();
      answer(s.app, {});
      await sellCut(s, 300); await s.app.syncPendingTransactions(true); await settle(20);
      await s.app.autoBackupToGoogleDrive({ silent: true });
      await new Promise(r => setTimeout(r, 1100));
      await sellCut(s, 400); await sellCut(s, 500); await s.app.syncPendingTransactions(true); await settle(20);
      await s.app.autoBackupToGoogleDrive({ silent: true });
      const list = await s.app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true });
      const older = list.details.files.find(f => f !== list.details.files[0]);
      await new Promise(r => setTimeout(r, 1100));
      s.app.restoreFromDriveBackup(older.id, 'older'); await s.app._confirmP; await settle(80);
      const job = s.app.state.cloudOutbox.find(j => j && j.needBackup);
      ok(!job || (job.changeKinds || []).includes('restore'), 'งานสำรองต้องมาจากการกู้');
      await s.app.resumePendingCloudWork(); await settle(120);
      await s.app.flushCloudOutbox(); await settle(60);
      const list2 = await s.app.cloudPost('list_backups', { offset: 0 }, 20000, { owner: true });
      eq(list2.details.files.length, 3, 'ต้องมีไฟล์สำรองใหม่หลังกู้');
      const newest = await s.app.cloudPost('get_backup', { fileId: list2.details.files[0].id }, 60000, { owner: true });
      eq(newest.details.backupData.transactions.map(t => t.total), [300]);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ30 กู้แล้วมีงานสำรองในคิว (ส่งรอบถัดไป ไม่รอรวมรอบ) · ระหว่างรับช่วงฉุกเฉินที่ยังไม่ครบ ไม่สั่ง', async () => {
    const s = await makeShop({ rows: { shift: { active: false, startTime: null, startCash: 0, startDetails: {}, expenses: [], history: [] } } });
    try {
      s.app.resumePendingCloudWork = () => {};
      const f = clone(s.app.buildBackupPayload());
      await s.app.applyBackupData(clone(f)); await settle(20);
      const job = s.app.state.cloudOutbox.find(j => j && j.needBackup);
      ok(job && (job.changeKinds || []).includes('restore'), JSON.stringify(s.app.state.cloudOutbox));
      ok(job.retry && job.retry.backup && job.retry.backup.nextAt <= Date.now(), 'ต้องส่งได้ทันที');
      ok((await s.env.raw('cloudOutbox')).some(j => j.needBackup), 'งานสำรองต้องลงเครื่องพร้อมข้อมูลที่กู้');
      s.app.state.cloudOutbox = []; await s.app.saveState();
      s.app.primaryStatus = { isPrimary: true, checkedAt: Date.now(), recovery: { incomplete: true, startedAt: Date.now() - 3600e3 } };
      await s.app.applyBackupData(clone(f)); await settle(20);
      eq(s.app.state.cloudOutbox.filter(j => j && j.needBackup).length, 0);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 34: ตะกร้าที่พักไว้ตอนถูกออกจากระบบ เก็บหมายเหตุบิล + ลูกค้าด้วย (คืนเฉพาะคนเดิม) ═══
  await R.t('ข้อ34 พักตะกร้า → คนเดิมเข้าระบบ: คืนหมายเหตุบิลและลูกค้า · คนอื่นเข้าระบบ: ไม่คืน', async () => {
    const s = await makeShop({ rows: { customers: [{ id: 'c1', name: 'ลูกค้าหนึ่ง', phone: '0800000000', visitCount: 1 }] } });
    try {
      const doc = s.env.document;
      const hold = () => {
        s.app.state.cart = [{ uniqueCartId: 'u0', id: 's1', name: 'ตัดผม', price: 300, staffId: 'st-1', staffName: 'เอ', category: 'barber' }];
        doc.getElementById('cart-discount').value = '50';
        doc.getElementById('checkout-bill-note').value = 'ลูกค้าขอให้เก็บรองทรง';
        doc.getElementById('cart-customer-select').value = 'c1';
        s.app.holdCartForReturn('__owner__');
        s.app.resetCartState(); doc.getElementById('cart-customer-select').value = '';
      };
      hold();
      loginAs(s.app, 'owner');
      ok(s.app.restoreHeldCart(), 'ต้องคืนตะกร้า');
      eq([doc.getElementById('checkout-bill-note').value, doc.getElementById('cart-customer-select').value, doc.getElementById('cart-discount').value],
        ['ลูกค้าขอให้เก็บรองทรง', 'c1', '50']);
      hold();
      loginAs(s.app, 'manager');
      eq(s.app.restoreHeldCart(), false);
      eq([doc.getElementById('checkout-bill-note').value, doc.getElementById('cart-customer-select').value], ['', '']);
      ok(/ถ้าแอปไม่ได้ถูกปิด/.test(APP_SRC), 'ข้อความออกจากระบบต้องบอกว่าตะกร้าคืนได้เฉพาะเมื่อแอปไม่ถูกปิด');
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 46: ถามตัวตนชีต/กล่องยืนยันย้าย URL ก่อนเข้าคิวงานบันทึก ═══
  const settingsInputs = (s, url) => {
    const v = (id, val) => { s.env.document.getElementById(id).value = val; };
    v('shop-name-input', s.app.shopName); v('shop-tagline-input', s.app.shopTagline); v('shop-address-input', s.app.shopAddress || '');
    v('shop-phone-input', s.app.shopPhone || ''); v('shop-promptpay-id', s.app.shopPromptPayId || '');
    v('shop-sheets-api-token', s.app.googleSheetsApiToken); v('shop-telegram-token', s.app.telegramToken || '');
    v('shop-telegram-chatid', s.app.telegramChatId || ''); v('shop-sheets-sync-url', url);
  };
  const NEW_URL = 'https://script.google.com/macros/s/AKfyOTHER_deploy-2/exec';
  await R.t('ข้อ46 ระหว่างกล่องยืนยันย้าย URL ค้างอยู่ งานบันทึกอื่นไม่ต้องรอ · ยกเลิก = คง URL เดิม', async () => {
    const s = await makeShop();
    try {
      const oldUrl = s.app.googleSheetsUrl;
      const realFetch = s.env.ctx.fetch;   // URL ใหม่ยังไม่ได้ Deploy = ถามตัวตนไม่ได้
      s.env.ctx.fetch = (url, init) => String(url).includes('OTHER') ? Promise.reject(new TypeError('Failed to fetch')) : realFetch(url, init);
      let answerConfirm; const asked = [];
      s.app.askConfirm = (m) => { asked.push(m); return new Promise(r => { answerConfirm = r; }); };
      settingsInputs(s, NEW_URL);
      const p = s.app.saveShopSettings();
      for (let i = 0; i < 100 && !answerConfirm; i++) await settle(10);
      ok(answerConfirm, 'ต้องถามยืนยัน (ระบุตัวตนชีตใหม่ไม่ได้)');
      const other = await Promise.race([s.app.withMutation('งานอื่น', async () => 'done'), settle(500).then(() => 'blocked')]);
      eq(other, 'done', 'งานบันทึกอื่นถูกกล่องยืนยันขวางไว้');
      answerConfirm(false); await p; await settle(20);
      eq([s.app.googleSheetsUrl, await s.env.raw('googleSheetsUrl')], [oldUrl, oldUrl]);
    } finally { s.env.dispose(); }
  });

  await R.t('ข้อ46 ในคิวตรวจซ้ำ: ค่าในช่องไม่ตรงกับที่ถามไว้ → ไม่ย้าย URL (ไม่ยิงเน็ตในคิว) + บอกให้กดใหม่', async () => {
    const s = await makeShop();
    try {
      const oldUrl = s.app.googleSheetsUrl;
      let calls = 0; const realFetch = s.env.ctx.fetch;
      s.env.ctx.fetch = (...a) => { calls++; return realFetch(...a); };
      settingsInputs(s, NEW_URL);
      const stale = { prevUrl: oldUrl, prevToken: s.app.googleSheetsApiToken, url: 'https://script.google.com/macros/s/AKfyANOTHER/exec',
        token: s.app.googleSheetsApiToken, identified: '', useNewUrl: true };
      const t0 = s.toasts.length;
      eq(await s.app.withMutation('การตั้งค่า', () => s.app._saveShopSettingsLocked(stale)), true);
      eq(s.app.googleSheetsUrl, oldUrl);
      eq(calls, 0, 'ห้ามยิงเน็ตในคิวงานบันทึก');
      ok(s.toasts.slice(t0).some(t => /กดบันทึกอีกครั้ง/.test(t.m)));
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 25: รูปแบบ Telegram Token / Chat ID ═══
  await R.t('ข้อ25 Token/Chat ID ผิดรูปแบบ → คงค่าเดิม + เตือน · ถูกรูปแบบ (รวม @ชื่อช่อง) → บันทึก · ว่าง = ปิด', async () => {
    const goodTok = '1234567:' + 'x'.repeat(32);
    const s = await makeShop({ rows: { telegramToken: goodTok, telegramChatId: '-100123' } });
    try {
      const set = (tok, chat) => { settingsInputs(s, s.app.googleSheetsUrl); s.env.document.getElementById('shop-telegram-token').value = tok;
        s.env.document.getElementById('shop-telegram-chatid').value = chat; };
      let t0 = s.toasts.length;
      set('12345:ABC', 'กลุ่มร้าน'); await s.app.saveShopSettings();
      eq([s.app.telegramToken, s.app.telegramChatId], [goodTok, '-100123']);
      eq([await s.env.raw('telegramToken'), await s.env.raw('telegramChatId')], [goodTok, '-100123']);
      eq(s.env.document.getElementById('shop-telegram-token').value, goodTok);
      ok(s.toasts.slice(t0).some(t => /Telegram Token ไม่ถูกต้อง/.test(t.m)) && s.toasts.slice(t0).some(t => /Chat ID ไม่ถูกต้อง/.test(t.m)));
      const tok2 = '7654321:' + 'y'.repeat(33);
      set(tok2, '@erotica_shop'); await s.app.saveShopSettings();
      eq([await s.env.raw('telegramToken'), await s.env.raw('telegramChatId')], [tok2, '@erotica_shop']);
      set('', ''); await s.app.saveShopSettings();
      eq([s.app.telegramToken, s.app.telegramChatId], ['', '']);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 62: ด่าน PIN ซ้ำแบบรายการที่อนุญาต ═══
  await R.t('ข้อ62 confirmPinStepUp: เจ้าของผ่าน · ผู้จัดการถาม PIN · พนักงาน/ไม่ได้ล็อกอิน = ไม่อนุญาต (ไม่ถาม)', async () => {
    const s = await makeShop();
    try {
      const real = s.app._realConfirmPinStepUp.bind(s.app);
      let asked = 0; s.app.askSecret = async () => { asked++; return '222222'; };
      loginAs(s.app, 'owner'); eq(await real('ทดสอบ'), true); eq(asked, 0);
      loginAs(s.app, 'manager'); eq(await real('ทดสอบ'), true); eq(asked, 1);
      loginAs(s.app, 'staff'); eq(await real('ทดสอบ'), false); eq(asked, 1);
      loginAs(s.app, null); eq(await real('ทดสอบ'), false); eq(asked, 1);
    } finally { s.env.dispose(); }
  });

  // ═══ ข้อ 67: โค้ดค้าง ═══
  await R.t('ข้อ67 ไม่มี sendTelegramText (ทางส่งที่ข้ามคิว) · ไม่มีการหา #shop-owner-pin · เซสชันเจ้าของหลักยังไม่ถูกคืน', async () => {
    const s = await makeShop({ role: null, noInit: true });
    try {
      eq(typeof s.app.sendTelegramText, 'undefined');
      ok(!/getElementById\('shop-owner-pin'\)/.test(APP_SRC), 'ยังมีการหา #shop-owner-pin');
      await s.env.db.state.put({ key: 'session', value: { uid: '__owner__', name: 'เจ้าของร้าน', role: 'owner', ts: Date.now() } });
      eq(await s.app.tryRestoreSession(), false);
      eq(s.app.currentRole, null);
    } finally { s.env.dispose(); }
  });

  R.done();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
