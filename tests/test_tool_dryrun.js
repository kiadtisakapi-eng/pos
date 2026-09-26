// ─────────────────────────────────────────────────────────────────────────────
//  เครื่องมือ tools/ลองข้อมูลจริง.js — ต้องจับบิลเสียได้จริง และต้องไม่ตีข้อมูลดีว่าเสีย
//  สร้างไฟล์สำรองจำลองที่มีบิลทุกรุ่นตั้งแต่ มิ.ย. 2569 (ไม่มีช่องทางจ่าย · ส่วนลดเกินราคา · ปัดทีละบรรทัด ·
//  รุ่น VAT · ชื่อลูกค้าเป็นเบอร์โทร · บันทึกค่าใช้จ่าย "12/9") แล้วรันเครื่องมือเป็นโปรแกรมแยก
// ─────────────────────────────────────────────────────────────────────────────
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- เครื่องมือ "ลองข้อมูลจริง" (dry run ก่อนอัปเกรด) ---');
const t = R.t;
const TOOL = path.join(__dirname, '..', 'tools', 'ลองข้อมูลจริง.js');
const H = (d) => new Date(d).getTime();

async function synth(broken) {
  const { env, app } = await makeShop();
  await settle(40);
  app.resumePendingCloudWork = () => {}; app.flushCloudOutbox = async () => {};
  for (let i = 0; i < 4; i++) {
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300 }, { id: 'd1', name: 'น้ำ', price: 20, category: 'drinks' }], ['cash', 'promptpay', 'credit'][i % 3], 1000);
    env.document.getElementById('cart-discount').value = String([0, 15, 7.5, 33][i]);
    app.beginCheckoutAttempt(); await app.processCheckout(); await settle(20);
  }
  env.document.getElementById('expense-type').value = 'other';
  env.document.getElementById('expense-amount').value = '120';
  env.document.getElementById('expense-note').value = '12/9';
  await app.addExpense(null); await settle(20);
  const old = [
    { id: 'TX-1749900000000-AAAA0001', date: H('2026-06-14T20:15:00+07:00'), customerName: 'ลูกค้าทั่วไป (Walk-in)', services: ['นวดไทย'], total: 400, staffNames: ['เอ'], syncStatus: 'synced' },
    { id: 'TX-1749990000000-AAAA0002', date: H('2026-06-15T02:30:00+07:00'), customerName: '0812345678', services: ['ตัดผม'], subtotal: 300, discount: 500, total: 0, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' },
    { id: 'TX-1751400000000-AAAA0003', date: H('2026-07-02T21:00:00+07:00'), customerName: 'x', services: ['ตัดผม', 'สระ'], subtotal: 350, discount: 35, total: 315, paymentMethod: 'promptpay', staffNames: ['เอ'],
      details: [{ name: 'ตัดผม', price: 300, netPrice: 270, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 27 },
                { name: 'สระ', price: 50, netPrice: 45, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 4.5 }], syncStatus: 'synced' },
    { id: 'TX-1755000000000-AAAA0004', date: H('2026-08-12T23:40:00+07:00'), customerName: 'y', services: ['ตัดผม'], subtotal: 300, discount: 0, vatRate: 7, nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 300,
      paymentMethod: 'credit', staffNames: ['เอ'], details: [{ name: 'ตัดผม', price: 300, netPrice: 300, vatable: false, staffId: 'st-1', staffName: 'เอ', commission: 10, commissionType: 'percent', commissionAmount: 30 }], syncStatus: 'synced' }
  ];
  if (broken) old.push({ id: 'TX-1756000000000-BROKEN01', date: H('2026-08-24T22:00:00+07:00'), customerName: 'z', services: ['ตัดผม'], subtotal: 300, discount: 0, vatRate: 7,
    nonVatBase: 300, vatableBase: 0, vatAmount: 0, rounding: 0, total: 310, paymentMethod: 'cash', staffNames: ['เอ'], syncStatus: 'synced' });
  app.state.transactions.unshift(...old);
  const p = app.buildBackupPayload();
  env.dispose();
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pos-dry-')), broken ? 'broken.json' : 'ok.json');
  fs.writeFileSync(f, JSON.stringify(p, null, 2));
  return f;
}
const runTool = (f) => { try { return { code: 0, out: execFileSync(process.execPath, [TOOL, f], { encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Asia/Bangkok' }) }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };

(async () => {
  const good = await synth(false), bad = await synth(true);
  const g = runTool(good);
  await t('ข้อมูลดีทุกรุ่นบิล → "ผ่าน" (exit 0) · ไม่มีบิลถูกปฏิเสธ · ตรวจชีตไม่ฟ้องปลอม', () => {
    eq(g.code, 0, g.out); ok(/✅ ผ่าน/.test(g.out)); ok(/บิลรอตรวจ 0 ใบ/.test(g.out)); ok(/ช่องไม่ตรง 0 ใบ/.test(g.out), g.out); });
  const b = runTool(bad);
  await t('มีบิลเงินไม่ลงตัว 1 ใบ → "ต้องดูก่อนอัปเกรด" (exit 1) พร้อมเลขที่บิลและเหตุผล', () => {
    eq(b.code, 1, b.out); ok(/ต้องดูก่อนอัปเกรด/.test(b.out)); ok(/TX-1756000000000-BROKEN01/.test(b.out)); ok(/ไม่เท่ากับยอดสุทธิ/.test(b.out)); });
  const oldGas = (() => { const p = path.join(__dirname, '..', 'audit', 'pre-fix5', 'google_apps_script.js'); return fs.existsSync(p) ? p : null; })();
  if (oldGas) {
    let o;
    try { o = { code: 0, out: execFileSync(process.execPath, [TOOL, good], { encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Asia/Bangkok', POS_GAS_SRC: oldGas }) }) }; }
    catch (e) { o = { code: e.status, out: String(e.stdout || '') }; }
    await t('(พิสูจน์) Apps Script ก่อนแก้ → เครื่องมือจับได้ว่าหน้าตรวจชีตฟ้อง "วันเวลา" ปลอม', () => { eq(o.code, 1); ok(/วันเวลา/.test(o.out)); });
  }
  const guard = runTool(path.join(__dirname, 'x.json'));
  await t('ไม่ยอมอ่านไฟล์ที่วางใน tests/ หรือ tools/ (โฟลเดอร์ที่ขึ้น repo สาธารณะ)', () => { eq(guard.code, 2); ok(/audit/.test(guard.out)); });
  R.done();
})();
