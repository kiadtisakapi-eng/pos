// ตรวจทั้งระบบ 19 ต.ค. 2569 ข้อ 10 — กู้ฉุกเฉินแล้วปลดพักได้ แม้บิลบนชีตที่เครื่องไม่มีเกิน 3,000 ใบ (ยอมรับเป็นรอบ)
// ชุด A: Apps Script ตัวจริง (gas_env) + ตัวเลียนแบบแอปรุ่นใหม่ / แอปรุ่นก่อน (v65) — 3,001 และ 7,000 ใบ
// ชุด B: แอปตัวจริง (Dexie จริง) + Apps Script ตัวจริง — กด "ตรวจข้อมูลครบและปลดการพัก" ครั้งเดียว ถามเป็นรอบ "รอบที่ N · เหลืออีก M ใบ"
// POS_GAS_SRC=<v65> (และ POS_APP_SRC=<v65> สำหรับชุด B) = ต้องตก · ข้อ "ควบคุม" ผ่านได้ทุกรุ่น
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const assert = require('assert/strict');
const { makeShop, createGasEnv } = require('./fixtures_db');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '->', e && e.message ? String(e.message).split('\n')[0].slice(0, 300) : e); }
}
const DEV_A = 'dev-' + 'a'.repeat(32), DEV_B = 'dev-' + 'b'.repeat(32);
const T0 = Date.parse('2026-01-03T12:00:00+07:00');
const bkkText = (ms) => { const t = new Date(ms + 7 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`; };
const monthOf = (ms) => { const t = new Date(ms + 7 * 3600e3 - 6 * 3600e3); return String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + t.getUTCFullYear(); };
function bill(i, over) {
  const date = T0 + i * 2 * 3600e3;   // 2 ชม./ใบ — 7,000 ใบ ≈ 19 เดือน
  return Object.assign({ action: 'transaction', id: 'TX-' + date + '-' + i.toString(36).toUpperCase().padStart(4, '0'), date,
    dateTimeStr: bkkText(date), monthKey: monthOf(date), customerName: 'ลูกค้า', services: ['นวด'], staffNames: ['เอ'],
    subtotal: 300, discount: 0, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 7, total: 300,
    paymentMethod: 'cash', rev: 1, revEpoch: 0, lines: [{ price: 300, netPrice: 300, vatable: false }] }, over || {});
}
// ชีตมีบิล n ใบจากเครื่องเดิม (A) → เครื่องใหม่ (B) รับช่วงฉุกเฉิน
function lostShop(n) {
  const g = createGasEnv(), key = g.setupOwnerKey(), bills = [];
  for (let i = 0; i < n; i++) {
    const b = bill(i); bills.push(b);
    const r = g.post(Object.assign({}, b, { deviceId: DEV_A }));
    if (r.status !== 'success') throw new Error('seed ' + i + ' ' + r.code);
  }
  const em = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
  assert.equal(em.status, 'success', 'emergency takeover');
  return { g, key, bills };
}
const strip = (b) => { const o = Object.assign({}, b); delete o.action; return o; };
const sheetOnlyOf = (x) => ({ id: x.id, month: x.month, version: x.version, total: x.total });
const ledgerRows = (g) => { const s = g.sheet('_POS_RECOVERY_ACCEPTED'); return s ? s._grid.length - 1 : 0; };
const listSizes = (r) => { const d = r.details || {}; return Math.max((d.missing || []).length, (d.different || []).length, (d.voided || []).length, (d.pendingVoid || []).length); };

// ตัวเลียนแบบแอปรุ่นใหม่: ยอมรับรอบละรายการที่ชีตส่งมา เก็บบิลจากชีตของรอบที่ชีตบันทึกแล้วไว้ แล้วส่งรอบถัดไป
function releaseLikeNewApp(g, key, held, opts) {
  opts = opts || {};
  let declared = [], rounds = 0, maxList = 0;
  const post = (extra) => g.post(Object.assign({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true,
    bills: held || [], voidIntents: [], sheetOnly: declared }, extra || {}));
  let r = post();
  while (r.code === 'PRIMARY_TRANSFER_INCOMPLETE' && r.details && r.details.acceptable === true && rounds < 20) {
    rounds++; maxList = Math.max(maxList, listSizes(r));
    const missing = r.details.missing.filter(x => !x.accepted), different = r.details.different || [];
    const ids = missing.concat(different).map(x => x.id).filter(id => !(opts.skip && opts.skip.includes(id)));
    const tryDeclared = declared.concat(missing.map(sheetOnlyOf));
    const prevDeclared = declared; declared = tryDeclared;
    r = post({ acceptMissing: true, acceptIds: ids });
    maxList = Math.max(maxList, listSizes(r));
    if (r.status === 'success') break;
    if (!(Number(r.details && r.details.batchAccepted) > 0)) { declared = prevDeclared; break; }
  }
  return { r, rounds, maxList, declared };
}

(async () => {
  console.log('\n--- ชุด A: Apps Script + ตัวเลียนแบบแอป ---');
  for (const N of [3001, 7000]) {
    await test(`บิลหาย ${N.toLocaleString()} ใบ → ยอมรับเป็นรอบ (${Math.ceil(N / 3000)} รอบ) แล้วปลดพักได้ · ทุกคำตอบมีรายการไม่เกิน 3,000 ใบ`, async () => {
      const { g, key } = lostShop(N);
      const first = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [], voidIntents: [], sheetOnly: [] });
      assert.equal(first.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(first.details.truncated, true);
      assert.equal(first.details.acceptable, true, 'acceptable although the list is cut at 3,000');
      assert.equal(first.details.counts.toAccept, N);
      const { r, rounds, maxList } = releaseLikeNewApp(g, key);
      assert.equal(r.status, 'success', r.code + ' ' + String(r.message).slice(0, 160));
      assert.equal(rounds, Math.ceil(N / 3000)); assert.ok(maxList <= 3000, 'largest list ' + maxList);
      assert.equal(g.ctx.readPrimaryDevice_().recovery, null, 'released');
      assert.equal(ledgerRows(g), N, 'every bill recorded once in _POS_RECOVERY_ACCEPTED');
      const b = g.post({ action: 'backup', deviceId: DEV_B, backupData: { backupSchemaVersion: 3, services: [], staff: [], transactions: [] } });
      assert.equal(b.status, 'success', 'backups resume: ' + b.code);
    });
  }
  await test('คำตอบรอบกลางทาง: ยังไม่ปลดพัก · บอก "ยอมรับรอบนี้แล้ว / เหลืออีก" · ส่งรายการรอบถัดไปมาเลย', async () => {
    const { g, key } = lostShop(3001);
    const first = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [], sheetOnly: [] });
    const listed = first.details.missing;
    const mid = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: [],
      sheetOnly: listed.map(sheetOnlyOf), acceptMissing: true, acceptIds: listed.map(x => x.id) });
    assert.equal(mid.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(mid.details.batchAccepted, 3000);
    assert.equal(mid.details.remaining, 1); assert.equal(mid.details.missing.length, 1); assert.equal(mid.details.acceptable, true);
    assert.match(mid.message, /ยอมรับข้อมูลหายรอบนี้แล้ว 3000 ใบ/); assert.match(mid.message, /เหลืออีก 1 ใบ/); assert.match(mid.message, /ยังไม่ปลดพัก/);
    assert.ok(g.ctx.readPrimaryDevice_().recovery, 'still paused');
    assert.equal(g.post({ action: 'summary_month', deviceId: DEV_B, monthKey: '01-2026' }).code, 'INCOMPLETE_RECOVERY');
  });
  await test('แอปรุ่นก่อน (v65) กับ Apps Script ใหม่: ถอนบิลจากชีตหลังรอบแรก → กดอีกครั้งนำเข้าแล้วปลดพักได้ (ไม่ค้าง)', async () => {
    const { g, key } = lostShop(3001);
    let local = [];   // บิลจากชีตในเครื่อง (ตามตรรกะแอปรุ่น v65)
    const post = (extra) => g.post(Object.assign({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true,
      bills: [], voidIntents: [], sheetOnly: local.map(sheetOnlyOf) }, extra || {}));
    const click = () => {   // _claimPrimaryDuringMaintenance ของ v65 (ส่วนปลดพัก)
      let d = post(), added = null;
      if (d.code === 'PRIMARY_TRANSFER_INCOMPLETE') {
        const prev = (d.details.missing || []).filter(x => x.accepted);
        if (prev.length && !(d.details.voided || []).length) { local = local.concat(prev); d = post(); }
      }
      if (d.code === 'PRIMARY_TRANSFER_INCOMPLETE') {
        const missing = d.details.missing.filter(x => !x.accepted), different = d.details.different || [];
        if (d.details.acceptable === true && (missing.length || different.length)) {
          added = missing; local = local.concat(missing);
          d = post({ acceptMissing: true, acceptIds: missing.concat(different).map(x => x.id) });
        }
        if (d.code === 'PRIMARY_TRANSFER_INCOMPLETE' && added) { const drop = new Set(added.map(x => x.id)); local = local.filter(x => !drop.has(x.id)); }
      }
      return d;
    };
    let d, clicks = 0;
    do { d = click(); clicks++; } while (d.status !== 'success' && clicks < 5);
    assert.equal(d.status, 'success', d.code + ' ' + String(d.message).slice(0, 120));
    assert.ok(clicks <= 2, 'clicks ' + clicks);
    assert.equal(local.length, 3001, 'the old app holds every sheet-only bill'); assert.equal(ledgerRows(g), 3001);
  });
  await test('บิลที่ถูกยกเลิกบนชีตยังต้องจัดการก่อน — รายการถูกตัดก็ไม่รับยอมรับข้อมูลหาย (ควบคุม)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey(); const bills = [];
    for (let i = 0; i < 3002; i++) { const b = bill(i); bills.push(b); g.post(Object.assign({}, b, { deviceId: DEV_A })); }
    const x = bills[3001];
    assert.equal(g.post({ action: 'void_transaction', deviceId: DEV_A, id: x.id, date: x.date, monthKey: x.monthKey, voidedAt: Date.now() }).status, 'success');
    g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, emergency: true });
    const held = [strip(x)];   // ไฟล์สำรองเก่า: เครื่องใหม่ยังมีบิล x (ก่อนถูกยกเลิก)
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: held, sheetOnly: [] });
    assert.equal(r.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(r.details.voided.length, 1); assert.equal(r.details.acceptable, false);
    const forced = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, recoveryConfirmed: true, bills: held, sheetOnly: [],
      acceptMissing: true, acceptIds: r.details.missing.map(m => m.id).concat([x.id]) });
    assert.equal(forced.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(forced.details.batchAccepted, undefined);
    assert.equal(ledgerRows(g), 0, 'nothing recorded'); assert.ok(g.ctx.readPrimaryDevice_().recovery);
  });
  await test('บิลข้อมูลต่างต้องอยู่ในรายการที่ยืนยัน (ไม่ยืนยัน = ไม่รับ) · ยืนยันแล้วรอบถัดไปไม่ถามซ้ำ', async () => {
    const { g, key, bills } = lostShop(3005);
    const y = bills[2];   // เครื่องใหม่ถือบิล y แต่ชื่อลูกค้าต่างจากชีต
    const held = [Object.assign(strip(y), { customerName: 'ชื่อใหม่ในเครื่อง' })];
    const skipped = releaseLikeNewApp(g, key, held, { skip: [y.id] });
    assert.equal(skipped.r.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(ledgerRows(g), 0, 'refused without y');
    const ok = releaseLikeNewApp(g, key, held);
    assert.equal(ok.r.status, 'success', ok.r.code + ' ' + String(ok.r.message).slice(0, 120)); assert.equal(ok.rounds, 2);
    const ledger = g.sheet('_POS_RECOVERY_ACCEPTED')._grid.slice(1);
    assert.equal(ledger.filter(r => r[0] === y.id).length, 1, 'y recorded once'); assert.match(String(ledger.find(r => r[0] === y.id)[4]), /^different/);
    assert.equal(ledger.length, 3005);
  });
  await test('ย้ายเครื่องหลักปกติ (ไม่ใช่ปลดพัก) ยังไม่ยอมรับข้อมูลหายเลย (ควบคุม)', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    for (let i = 0; i < 5; i++) g.post(Object.assign(bill(i), { deviceId: DEV_A }));
    const r = g.post({ action: 'claim_primary', deviceId: DEV_B, ownerKey: key, bills: [], acceptMissing: true, acceptIds: [0, 1, 2, 3, 4].map(i => bill(i).id) });
    assert.equal(r.code, 'PRIMARY_TRANSFER_INCOMPLETE'); assert.equal(r.details.acceptable, false); assert.equal(ledgerRows(g), 0);
  });

  console.log('\n--- ชุด B: แอปจริง + Apps Script จริง (3,001 ใบ) ---');
  await test('กด "ตรวจข้อมูลครบและปลดการพัก" ครั้งเดียว → ถาม 2 รอบ "รอบที่ N · เหลืออีก M ใบ" → ปลดพัก · บิลจากชีตครบ 3,001 ใบ', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    for (let i = 0; i < 3001; i++) g.post(Object.assign(bill(i), { deviceId: DEV_A }));
    g.fetch.fixtureDeviceId = 'dev-' + 'f'.repeat(32);   // iPad เครื่องใหม่ ไม่ใช่เครื่องเดิม
    const s = await makeShop({ gas: g, onLine: true, noInit: true });
    const app = s.app; app.scheduleCloudRetry = () => {}; app.resumePendingCloudWork = () => {};
    app.askOwnerKey = async () => key; app.askConfirm = async () => true;
    const asked = []; app.askTypedConfirm = async (m) => { asked.push(m); return true; };
    assert.equal(await app.claimPrimaryDevice(), true, 'emergency takeover'); assert.ok(app.isRecoveryIncomplete());
    const t0 = Date.now();
    const released = await app.claimPrimaryDevice();
    assert.equal(released, true, 'released with one press: ' + JSON.stringify(s.toasts.slice(-2)).slice(0, 300));
    assert.equal(g.ctx.readPrimaryDevice_().recovery, null); assert.equal(app.isRecoveryIncomplete(), false);
    assert.equal(asked.length, 2, 'asked ' + asked.length + ' times');
    assert.match(asked[0], /รอบที่ 1 · เหลืออีก 1 ใบ/); assert.match(asked[0], /ไม่มี 3000 ใบ/);
    assert.match(asked[1], /รอบที่ 2 · เหลืออีก 0 ใบ \(รอบสุดท้าย\)/);
    assert.equal(app.state.transactions.filter(t => t && t.sheetOnly).length, 3001);
    assert.match(s.toasts.at(-1).m || s.toasts.at(-1).message || JSON.stringify(s.toasts.at(-1)), /3001 ใบ/);
    assert.equal(ledgerRows(g), 3001);
    console.log(`    (ปลดพัก 3,001 ใบในตัวจำลองใช้ ${((Date.now() - t0) / 1000).toFixed(1)} วินาที)`);
    s.env.dispose && s.env.dispose();
  });
  await test('ไม่ยืนยันรอบที่ 2 → รอบแรกที่ชีตบันทึกแล้วคงบิลจากชีตไว้ · บอกว่ายังเหลือ · กดอีกครั้งถามเฉพาะที่เหลือแล้วปลดพัก', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    for (let i = 0; i < 3001; i++) g.post(Object.assign(bill(i), { deviceId: DEV_A }));
    g.fetch.fixtureDeviceId = 'dev-' + 'e'.repeat(32);
    const s = await makeShop({ gas: g, onLine: true, noInit: true });
    const app = s.app; app.scheduleCloudRetry = () => {}; app.resumePendingCloudWork = () => {};
    app.askOwnerKey = async () => key; app.askConfirm = async () => true;
    let n = 0; app.askTypedConfirm = async () => (++n === 1);
    assert.equal(await app.claimPrimaryDevice(), true);
    assert.equal(await app.claimPrimaryDevice(), false);
    assert.equal(app.state.transactions.filter(t => t && t.sheetOnly).length, 3000, 'round 1 kept');
    assert.match(JSON.stringify(s.toasts.slice(-1)), /เหลืออีก 1 ใบ/);
    const asked = []; app.askTypedConfirm = async (m) => { asked.push(m); return true; };
    assert.equal(await app.claimPrimaryDevice(), true);
    assert.equal(asked.length, 1); assert.match(asked[0], /ไม่มี 1 ใบ/);
    assert.equal(app.state.transactions.filter(t => t && t.sheetOnly).length, 3001);
    s.env.dispose && s.env.dispose();
  });

  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); console.log('\n=== ผ่าน 0 · ไม่ผ่าน 1 ==='); process.exit(1); });
