// ตรวจทั้งระบบ 19 ต.ค. 2569 — ข้อ 8 (งานต่อบิลไม่โตตามจำนวนบิลทั้งร้าน) และข้อ 9 (หัวตารางที่เขียนค้าง)
// Apps Script ตัวจริงบน gas_env · POS_GAS_SRC=<v65> = ต้องตก (ยกเว้นข้อที่ติดป้าย "ควบคุม")
// ข้อ 8 พิมพ์ตัวเลขจริง: จำนวนครั้งที่เรียก Script Properties และจำนวนช่องที่อ่าน ต่อ "บิลใหม่ 1 ใบ" ที่ทะเบียน 300 / 3,000 ใบ
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const assert = require('assert/strict');
const { createGasEnv } = require('./gas_env');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '->', e && e.message ? String(e.message).split('\n')[0].slice(0, 300) : e); }
}
const DEV_A = 'dev-' + 'a'.repeat(32);
// คำขอดิบเข้า doPost (ไม่ผ่าน env.post ที่อ่านเครื่องหลักก่อนส่ง — นับเฉพาะงานของ Apps Script เอง)
const send = (g, obj) => { const body = JSON.stringify(Object.assign({ secret: g.token, deviceId: DEV_A }, obj));
  return JSON.parse(g.ctx.doPost({ postData: { contents: body, length: Buffer.byteLength(body, 'utf8') } })); };
// บิลที่ i — ราว 300 ใบต่อแท็บเดือน (เหมือน audit/J/proofs/p7_quota.js)
function bill(i, over) {
  const mi = Math.floor(i / 300), y = 2026 + Math.floor(mi / 12), mo = mi % 12;
  const d = Date.UTC(y, mo, 2 + (i % 300) % 27, 5, 0, 0) + (i % 300) * 1000;
  const t = new Date(d + 7 * 3600e3), p = n => String(n).padStart(2, '0');
  return Object.assign({ action: 'transaction', id: 'TX-' + (1790000000000 + i) + '-ABCDEFGH', date: d,
    monthKey: p(t.getUTCMonth() + 1) + '-' + t.getUTCFullYear(),
    dateTimeStr: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`,
    customerName: 'ลูกค้า', services: ['ตัดผม'], subtotal: 300, discount: 0, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 7,
    total: 300, paymentMethod: 'cash', staffNames: ['เอ'], rev: 1, revEpoch: 0, lines: [{ price: 300, netPrice: 300, vatable: false }] }, over || {});
}
// นับช่องที่อ่านผ่าน getValues/getDisplayValues ทุกแท็บ
function cellMeter(g) {
  const m = { cells: 0 };
  const wrap = (sh) => { if (sh._m) return; sh._m = true; const gr = sh.getRange; sh.getRange = (r, c, nr, nc) => { const cell = gr(r, c, nr, nc);
    const gv = cell.getValues, gd = cell.getDisplayValues; cell.getValues = () => { m.cells += (nr || 1) * (nc || 1); return gv(); };
    cell.getDisplayValues = () => { m.cells += (nr || 1) * (nc || 1); return gd(); }; return cell; }; };
  const ins = g.ss.insertSheet; g.ss.insertSheet = (n, p) => { const s = ins(n, p); wrap(s); return s; };
  g.ss._sheets.forEach(wrap);
  return m;
}
const dayPayload = (dateKey, gen, rev) => ({ action: 'summary_day', dateKey, generatedAt: gen, totalRevenue: rev, totalExpenses: 0, billCount: 1,
  cashRevenue: rev, qrRevenue: 0, creditRevenue: 0, nonVatBase: rev, vatableBase: 0, vatAmount: 0, rounding: 0, vatRate: 0,
  shiftCount: 0, cashVariance: 0, shiftCash: [], services: [{ name: 'ตัดผม', count: 1, revenue: rev }], expenses: [], staffCommissions: [] });
const monthPayload = (monthKey, gen, rev) => Object.assign(dayPayload('x', gen, rev), { action: 'summary_month', monthKey, dateKey: undefined });
const BILL_HEADERS = ['เลขที่บิล', 'วันที่-เวลา', 'ลูกค้า', 'รายการบริการ', 'ช่องทางชำระเงิน', 'ราคารวม (฿)', 'ส่วนลด (฿)',
  'ไม่คิด VAT (฿)', 'คิด VAT (฿)', 'VAT (฿)', 'ปัดเศษ (฿)', 'ยอดสุทธิ (฿)', 'พนักงาน'];
const MASTER_HEADERS = ['ประเภท', 'ช่วงเวลา', 'บิล', 'ไม่คิด VAT (฿)', 'คิด VAT (฿)', 'VAT (฿)', 'ปัดเศษ (฿)', 'รายได้รวม (฿)',
  'ค่าใช้จ่าย (฿)', 'กำไรสุทธิ (฿)', 'เงินขาด/เกิน (฿)', 'อัปเดตล่าสุด'];
const header = (sh) => (sh._grid[0] || []).map(v => String(v)).filter((v, i, a) => i < a.length);

(async () => {
  console.log('\n--- ข้อ 8: งานต่อบิลใหม่ไม่โตตามขนาดทะเบียน ---');
  const g8 = createGasEnv(); send(g8, { action: 'register_primary' });
  const meter = cellMeter(g8);
  const measure = (i) => {
    const p0 = g8.propCalls.total, c0 = meter.cells, k0 = Object.assign({}, g8.propCalls.keys);
    const r = send(g8, bill(i));
    const keys = {}; Object.keys(g8.propCalls.keys).forEach(k => { const d = g8.propCalls.keys[k] - (k0[k] || 0); if (d) keys[k] = d; });
    return { status: r.status, props: g8.propCalls.total - p0, cells: meter.cells - c0, keys };
  };
  let n = 0; const at = {};
  for (const target of [300, 3000]) { while (n < target) { send(g8, bill(n)); n++; } at[target] = measure(n); n++; }
  console.log(`    ทะเบียน 300 ใบ: Script Properties ${at[300].props} ครั้ง · อ่าน ${at[300].cells} ช่อง  |  ทะเบียน 3,000 ใบ: ${at[3000].props} ครั้ง · อ่าน ${at[3000].cells} ช่อง`);
  console.log('    (ตัวจำลองไม่มี getId จึงอ่าน POS_BACKEND_ID เพิ่ม 2 ครั้ง — ชีตจริงไม่อ่าน) รายละเอียด:', JSON.stringify(at[3000].keys));
  await test('บิลใหม่ที่ทะเบียน 3,000 ใบ อ่านช่องไม่เกิน 1,500 ช่อง และไม่โตตามทะเบียน (เดิมอ่านทั้งทะเบียน 15,000+ ช่อง)', async () => {
    assert.equal(at[300].status, 'success'); assert.equal(at[3000].status, 'success');
    assert.ok(at[3000].cells <= 1500, 'cells per new bill at 3,000: ' + at[3000].cells);
    assert.ok(at[3000].cells - at[300].cells <= 600, 'growth 300 → 3,000: ' + (at[3000].cells - at[300].cells));
  });
  await test('บิลใหม่ 1 ใบ: อ่านเครื่องหลักครั้งเดียว · ไม่อ่านรหัสเชื่อมต่อ (cache) · ไม่อ่านทะเบียนยกเลิกรุ่นเก่า · เครื่องหมายทะเบียนอ่านครั้งเดียว', async () => {
    const k = at[3000].keys;
    assert.equal(k.POS_PRIMARY_DEVICE, 1, 'POS_PRIMARY_DEVICE ' + k.POS_PRIMARY_DEVICE);
    assert.equal(k.POS_API_TOKEN || 0, 0, 'POS_API_TOKEN ' + k.POS_API_TOKEN);
    assert.equal(k.POS_VOIDED_BILLS || 0, 0, 'POS_VOIDED_BILLS ' + k.POS_VOIDED_BILLS);
    assert.equal(k.POS_BILL_INDEX_GLOBAL_V1, 2, 'marker get+set ' + k.POS_BILL_INDEX_GLOBAL_V1);
    assert.ok(at[3000].props <= 7, 'Script Properties calls per new bill: ' + at[3000].props);
  });
  await test('ไม่มีทะเบียนยกเลิกรุ่นเก่า → ตั้งธง POS_VOIDED_MIGRATED_V2 ตั้งแต่คำขอแรก', async () => {
    const g = createGasEnv(); assert.equal(send(g, bill(0)).status, 'success');
    assert.equal(g.props.POS_VOIDED_MIGRATED_V2, '1');
  });
  await test('มีทะเบียนรุ่นเก่า → ยังย้ายเข้าทะเบียนต่อบิลเหมือนเดิม และบิลที่ยกเลิกไม่กลับขึ้นชีต (ควบคุม)', async () => {
    const g = createGasEnv(); const b = bill(5);
    g.props.POS_VOIDED_BILLS = JSON.stringify({ [b.id]: 1790000000000 });
    const r = send(g, b);
    assert.equal(r.code, 'ALREADY_VOIDED'); assert.equal(g.props.POS_VOIDED_MIGRATED_V2, '1');
    assert.ok(g.props['POSVB_' + b.id]);
  });
  await test('หาแถวทะเบียนด้วย TextFinder: ตรงทั้งช่องและตรงตัวพิมพ์ (เลขที่ต่างแค่ตัวพิมพ์ = คนละบิล) · ส่งซ้ำยังอัปเดตแถวเดิม (ควบคุม)', async () => {
    const g = createGasEnv(); const a = bill(1, { id: 'TX-CASE-ABCDEF' }), b = bill(2, { id: 'tx-case-abcdef' });
    assert.equal(send(g, a).status, 'success'); assert.equal(send(g, b).status, 'success');
    const again = send(g, Object.assign({}, a, { rev: 2, customerName: 'แก้ชื่อ' }));
    assert.equal(again.status, 'success'); assert.equal(again.details.updated, true);
    const idx = g.sheet('_POS_BILL_INDEX')._grid.slice(1).map(r => r[0]);
    assert.deepEqual(idx.sort(), ['TX-CASE-ABCDEF', 'tx-case-abcdef'].sort());
    assert.equal(send(g, bill(3, { id: 'TX-CASE-ABC' })).status, 'success', 'a prefix of an indexed id is a different bill');
  });
  await test('ตัวจำลอง: TextFinder ค่าเริ่มต้นแบบ Sheets (ไม่สนตัวพิมพ์ · หาบางส่วน) (ควบคุม)', async () => {
    const g = createGasEnv(); const sh = g.ss.insertSheet('t'); sh.appendRow(['ABC-1']); sh.appendRow(['abc-12']);
    assert.equal(sh.getRange(1, 1, 2, 1).createTextFinder('abc-1').findAll().length, 2);
    assert.equal(sh.getRange(1, 1, 2, 1).createTextFinder('abc-1').matchCase(true).matchEntireCell(true).findAll().length, 0);
    assert.equal(sh.getRange(1, 1, 2, 1).createTextFinder('abc-12').matchCase(true).matchEntireCell(true).findAll()[0].getRow(), 2);
  });

  console.log('\n--- ข้อ 9: หัวตารางที่เขียนค้าง ---');
  await test('หัวตาราง 13 ช่องของแท็บเดือนเขียนด้วย setValues ครั้งเดียว (ไม่ใช่ทีละช่อง · คอลัมน์ระบบที่เติมทีหลังไม่นับ)', async () => {
    const g = createGasEnv(); let one = 0, many = 0;
    const ins = g.ss.insertSheet; g.ss.insertSheet = (name, pos) => { const s = ins(name, pos);
      if (/^\d\d-\d{4}$/.test(name)) { const gr = s.getRange; s.getRange = (r, c, nr, nc) => { const cell = gr(r, c, nr, nc);
        if (r === 1 && c <= 13) { const sv = cell.setValue, svs = cell.setValues; cell.setValue = (v) => { one++; return sv(v); }; cell.setValues = (v) => { many++; return svs(v); }; }
        return cell; }; }
      return s; };
    assert.equal(send(g, bill(0)).status, 'success');
    assert.equal(one, 0, 'setValue calls on the header row: ' + one); assert.equal(many, 1);
    assert.deepEqual(header(g.sheet('01-2026')).slice(0, 13), BILL_HEADERS);
  });
  await test('แท็บเดือนที่หัวเขียนค้าง (5 ช่องแรก · ยังไม่มีแถวข้อมูล) → บิลถัดไปเขียนหัวให้ครบแล้วบันทึกได้', async () => {
    const g = createGasEnv(); const sh = g.ss.insertSheet('01-2026'); sh.appendRow(BILL_HEADERS.slice(0, 5));
    const r = send(g, bill(0));
    assert.equal(r.status, 'success', r.code + ' ' + r.message);
    assert.deepEqual(header(sh).slice(0, 13), BILL_HEADERS); assert.equal(sh.getLastRow(), 2);
  });
  await test('หัวเขียนค้างแบบรุ่นเก่า 9 ช่อง (8 ช่องแรก) ไม่มีแถวข้อมูล → ซ่อมเป็นหัว 13 ช่อง', async () => {
    const g = createGasEnv(); const sh = g.ss.insertSheet('01-2026');
    sh.appendRow(['เลขที่บิล', 'วันที่-เวลา', 'ลูกค้า', 'รายการบริการ', 'ช่องทางชำระเงิน', 'ราคารวม (฿)', 'ส่วนลด (฿)', 'ยอดสุทธิ (฿)']);
    assert.equal(send(g, bill(0)).status, 'success'); assert.deepEqual(header(sh).slice(0, 13), BILL_HEADERS);
  });
  await test('ระหว่างหัวค้าง: ตรวจความตรงกัน (list_bills) เห็นเป็นแท็บว่าง · ยกเลิกบิลไม่ติด SCHEMA_MISMATCH', async () => {
    const g = createGasEnv(); const key = g.setupOwnerKey(); const sh = g.ss.insertSheet('01-2026'); sh.appendRow(BILL_HEADERS.slice(0, 3));
    const lb = send(g, { action: 'list_bills', monthKey: '01-2026', ownerKey: key });
    assert.equal(lb.status, 'success', lb.code); assert.equal(lb.details.bills.length, 0);
    const b = bill(0);
    const v = send(g, { action: 'void_transaction', id: b.id, date: b.date, monthKey: b.monthKey, voidedAt: Date.now() });
    assert.equal(v.code, 'NOT_FOUND', v.code + ' ' + v.message);
    assert.deepEqual(header(sh), BILL_HEADERS.slice(0, 3), 'read paths do not write');
  });
  await test('หัวที่คนแก้เอง / หัวไม่ครบแต่มีแถวข้อมูลแล้ว / มีคอลัมน์เติมต่อท้าย → ยังหยุด SCHEMA_MISMATCH (ควบคุม)', async () => {
    const cases = [
      [['เลขที่บิล', 'วันที่-เวลา', 'ชื่อลูกค้า']],
      [BILL_HEADERS.slice(0, 5), ['ROW-1', 'x']],
      [BILL_HEADERS.slice(0, 5).concat(['', 'โน้ตของฉัน'])]
    ];
    for (const rows of cases) {
      const g = createGasEnv(); const sh = g.ss.insertSheet('01-2026'); rows.forEach(r => sh.appendRow(r));
      const before = JSON.stringify(sh._grid);
      const r = send(g, bill(0));
      assert.equal(r.code, 'SCHEMA_MISMATCH', JSON.stringify(rows[0]) + ' → ' + r.code);
      assert.equal(JSON.stringify(sh._grid), before, 'sheet untouched');
    }
  });
  await test('แท็บ "สรุปรายเดือน" หัวเขียนค้าง (3 ช่อง) ไม่มีแถวข้อมูล → สรุปถัดไปซ่อมหัวแล้วเขียนได้', async () => {
    const g = createGasEnv(); send(g, { action: 'register_primary' });
    const m = g.ss.insertSheet('สรุปรายเดือน', 0); m.appendRow(MASTER_HEADERS.slice(0, 3));
    const r = send(g, dayPayload('2026-10-30', 1000, 300));
    assert.equal(r.status, 'success', r.code + ' ' + r.message);
    assert.deepEqual(header(m).slice(0, 12), MASTER_HEADERS); assert.equal(m.getLastRow(), 2);
  });
  await test('หัว "สรุปรายเดือน" ที่คนแก้ชื่อคอลัมน์เอง → ยังหยุด (ควบคุม)', async () => {
    const g = createGasEnv(); send(g, { action: 'register_primary' });
    const m = g.ss.insertSheet('สรุปรายเดือน', 0); m.appendRow(['ประเภท', 'ช่วงเวลา', 'จำนวนบิล']);
    const r = send(g, dayPayload('2026-10-30', 1000, 300));
    assert.equal(r.status, 'error'); assert.match(r.message, /สรุปรายเดือน/);
  });
  await test('restoreMasterRow_: ลบแท็บที่เพิ่งสร้างไม่สำเร็จ → โยน error (ไม่รายงานว่าย้อนสำเร็จ)', async () => {
    const g = createGasEnv(); g.ss.insertSheet('สรุปรายเดือน', 0); g.faults.deleteSheet = true;
    assert.throws(() => g.ctx.restoreMasterRow_(g.ss, { sheetExisted: false }), /จำลองล้มเหลว/);
  });
  for (const variant of ['kill', 'sheets-error']) {
    await test(`สร้าง "สรุปรายเดือน" ล้มตอนเขียนหัว (${variant === 'kill' ? 'execution ตายกลางทาง' : 'Sheets error + ลบแท็บไม่ได้'}) → คำขอถัดไปทุกแบบผ่าน หัวครบ`, async () => {
      const g = createGasEnv(); send(g, { action: 'register_primary' });
      let armed = false, dead = false, masterMade = false;
      const ins = g.ss.insertSheet; g.ss.insertSheet = (name, pos) => { const s = ins(name, pos); if (name === 'สรุปรายเดือน') { armed = true; masterMade = true; } return s; };
      const define = (k, fn) => Object.defineProperty(g.faults, k, { configurable: true, enumerable: true, get: fn, set() {} });
      // การเขียนหัวแถวแรกของแท็บสรุปรายเดือน (setValues หรือ setValue ช่องที่ 4 แบบรุ่นเก่า) ล้ม
      let headerWrites = 0;
      const killNow = () => { if (variant === 'kill') { dead = true; return true; } return 1; };
      define('setValues', () => { if (dead) return true; if (armed) { armed = false; return killNow(); } return undefined; });
      define('setValue', () => { if (dead) return true; if (masterMade && ++headerWrites === 4 && variant === 'kill') { dead = true; return true; } return undefined; });
      ['setName', 'insertSheet', 'setProperty', 'deleteProperty', 'flush'].forEach(k => define(k, () => (dead ? true : undefined)));
      define('deleteSheet', () => (dead || (variant !== 'kill' && masterMade) ? true : undefined));
      const r1 = send(g, dayPayload('2026-10-30', 1000, 300));
      ['setValues', 'setValue', 'setName', 'insertSheet', 'setProperty', 'deleteProperty', 'flush', 'deleteSheet'].forEach(k => { delete g.faults[k]; });
      g.ss.insertSheet = ins;
      assert.equal(r1.status, 'error', 'the first publish failed');
      const r2 = send(g, dayPayload('2026-10-31', 2000, 500));
      const r3 = send(g, dayPayload('2026-10-30', 3000, 300));
      const r4 = send(g, monthPayload('10-2026', 4000, 800));
      [r2, r3, r4].forEach((r, i) => assert.equal(r.status, 'success', 'request ' + (i + 2) + ': ' + r.code + ' ' + String(r.message).slice(0, 120)));
      const m = g.sheet('สรุปรายเดือน');
      assert.deepEqual(header(m).slice(0, 12), MASTER_HEADERS);
      assert.equal(g.props.POS_SUMMARY_PUBLISH, undefined, 'no journal left');
      const periods = m._grid.slice(1).map(r => String(r[1]));
      assert.ok(periods.includes('2026-10-30') && periods.includes('2026-10-31') && periods.includes('10-2026'), periods.join(','));
    });
  }

  console.log(`\n=== ผ่าน ${passed} · ไม่ผ่าน ${failed} ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); console.log('\n=== ผ่าน 0 · ไม่ผ่าน 1 ==='); process.exit(1); });
