// ─────────────────────────────────────────────────────────────────────
//  ชุดทดสอบ "รอบแก้ชุด B" (ก.ย. 2569) — งานที่ต้องเสร็จก่อนเปิดสวิตช์ VAT
//    ข้อ 6  Apps Script ต้องหยุดเขียนเมื่อหัวคอลัมน์แท็บบิลไม่ตรง (อยู่ใน test_gas.js)
//    ข้อ 10 VAT รายหมวดต้องคิดจากภาษีของแต่ละบิล ไม่ใช่คูณอัตราของบิลใบสุดท้าย
//
//  ⚠️ ทุกข้อต้อง "ไม่ผ่าน" เมื่อรันกับโค้ดก่อนแก้ (ดู pos-testing-traps)
// ─────────────────────────────────────────────────────────────────────
const h = require('./harness.js');
const app = h.ctx.app;
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS', n); } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const r2 = v => Math.round(v * 100) / 100;

app.state.categories = [
  { id: 'barber',  name: 'ตัดผมชาย', vat: true },
  { id: 'massage', name: 'นวดและสปา', vat: true },
  { id: 'drink',   name: 'เครื่องดื่ม', vat: true }
];

// บิลหนึ่งใบ: ฐาน VAT ตามหมวดที่ระบุ + อัตราของบิลใบนั้น
const bill = (id, rate, lines, extra) => Object.assign({
  id, date: '2026-09-01T14:00:00+07:00', vatRate: rate,
  nonVatBase: 0,
  vatableBase: r2(lines.reduce((s, l) => s + l[1], 0)),
  vatAmount: r2(lines.reduce((s, l) => s + l[1], 0) * rate / 100),
  rounding: 0,
  details: lines.map(l => ({ category: l[0], netPrice: l[1], vatable: true })),
}, extra || {});
const sumCatVat  = c => r2(c.reduce((s, x) => s + x.vat, 0));
const sumCatBase = c => r2(c.reduce((s, x) => s + x.base, 0));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- เคสจากรายงานผลตรวจ: ฐานใบละ 100 อัตรา 7% กับ 10% ---');
// ══════════════════════════════════════════════════════════════════
{
  const txs = [bill('TX-A', 7, [['barber', 100]]), bill('TX-B', 10, [['barber', 100]])];
  const v = app.buildVatSummary(txs);
  t('VAT รวมของงวด = 17 บาท (7 + 10)', () => eq(v.vatAmount, 17));
  t('VAT รายหมวดรวมต้องได้ 17 ไม่ใช่ 20', () => eq(sumCatVat(v.categories), 17));
  t('แยกเป็น 2 แถวตามอัตรา ไม่ยุบเป็นแถวเดียว', () => eq(v.categories.length, 2));
  t('แต่ละแถวติดอัตราของตัวเอง', () => eq(v.categories.map(c => c.rate).sort((a, b) => a - b), [7, 10]));
  t('งวดที่มีหลายอัตรา -> ไม่แสดงอัตราเดียวครอบทั้งงวด', () => eq(v.vatRate, 0));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n--- อัตราเดียวทั้งงวด ยังต้องทำงานเหมือนเดิม ---');
// ══════════════════════════════════════════════════════════════════
{
  const txs = [bill('TX-A', 7, [['barber', 100]]), bill('TX-B', 7, [['massage', 200]])];
  const v = app.buildVatSummary(txs);
  t('อัตราเดียว -> รายงานอัตราของงวดได้ตามปกติ', () => eq(v.vatRate, 7));
  t('VAT รายหมวดรวม = VAT ของบิล', () => eq(sumCatVat(v.categories), v.vatAmount));
  t('ฐานรายหมวดรวม = ฐาน VAT ของงวด', () => eq(sumCatBase(v.categories), v.vatableBase));
  t('ชื่อหมวดแปลจาก id เป็นชื่อจริง', () => ok(v.categories.every(c => /ตัดผมชาย|นวดและสปา/.test(c.name)), JSON.stringify(v.categories)));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n--- เศษสตางค์: ผลรวมรายหมวดต้องตรงกับบิลเป๊ะเสมอ ---');
// ══════════════════════════════════════════════════════════════════
{
  // ฐาน 3 หมวดที่หารด้วย 3 ไม่ลงตัว — จุดที่การปัดทีละก้อนจะทำให้ผลรวมเพี้ยน
  const txs = [bill('TX-C', 7, [['barber', 33.33], ['massage', 33.33], ['drink', 33.34]])];
  const v = app.buildVatSummary(txs);
  t('เศษสตางค์: VAT รายหมวดรวม = VAT ของบิล', () => eq(sumCatVat(v.categories), v.vatAmount));
  t('เศษสตางค์: ฐานรายหมวดรวม = ฐานของบิล', () => eq(sumCatBase(v.categories), v.vatableBase));
}
{
  // สุ่มหลายรอบ — invariant ต้องเป็นจริงทุกครั้ง ไม่ใช่บังเอิญตรงเฉพาะเคสที่เลือกมา
  let worst = null;
  for (let n = 0; n < 400; n++) {
    const cats = ['barber', 'massage', 'drink'];
    const lines = cats.map(c => [c, Math.round(Math.random() * 100000) / 100]).filter(l => l[1] > 0);
    if (!lines.length) continue;
    const rate = [7, 10, 3.5][n % 3];
    const v = app.buildVatSummary([bill('TX-R' + n, rate, lines)]);
    if (sumCatVat(v.categories) !== v.vatAmount || sumCatBase(v.categories) !== v.vatableBase) {
      worst = { lines, rate, got: sumCatVat(v.categories), want: v.vatAmount, base: [sumCatBase(v.categories), v.vatableBase] };
      break;
    }
  }
  t('สุ่ม 400 บิล: ผลรวมรายหมวดตรงกับบิลทุกครั้ง', () => eq(worst, null));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n--- บิลเก่า / บิลที่ไม่มีรายการย่อย ---');
// ══════════════════════════════════════════════════════════════════
{
  const legacy = { id: 'TX-OLD', date: '2026-09-01T14:00:00+07:00', total: 500 };  // ก่อนมีระบบ VAT
  const v = app.buildVatSummary([legacy]);
  t('บิลก่อนมีระบบ VAT -> ทั้งใบเป็น "ไม่คิด VAT"', () => { eq(v.nonVatBase, 500); eq(v.vatAmount, 0); });
  t('บิลก่อนมีระบบ VAT -> ไม่สร้างแถวหมวดขึ้นมาเอง', () => eq(v.categories.length, 0));
}
{
  // มี VAT แต่ไม่มี details — เกิดกับบิลเก่าที่รายการย่อยหาย ต้องไม่ทำให้ผลรวมขาด
  const v = app.buildVatSummary([{ id: 'TX-NODETAIL', date: '2026-09-01T14:00:00+07:00',
    vatRate: 7, nonVatBase: 0, vatableBase: 100, vatAmount: 7, rounding: 0 }]);
  t('บิลที่ไม่มีรายการย่อย -> VAT ไม่หายไปจากตารางหมวด', () => eq(sumCatVat(v.categories), 7));
  t('บิลที่ไม่มีรายการย่อย -> กองไว้ที่ "ไม่ระบุหมวด" ไม่เดาหมวดเอง', () => eq(v.categories[0].name, 'ไม่ระบุหมวด'));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n--- allocateSatang: ตัวแบ่งเศษ ---');
// ══════════════════════════════════════════════════════════════════
t('แบ่ง 100 สตางค์ให้ 3 ก้อนเท่ากัน -> รวมได้ 100', () => {
  const a = app.allocateSatang(100, [1, 1, 1]);
  eq(a.reduce((s, x) => s + x, 0), 100); eq(a.sort((x, y) => y - x), [34, 33, 33]);
});
t('น้ำหนักเป็นศูนย์ทั้งหมด -> ไม่ทำเงินหาย', () => {
  const a = app.allocateSatang(700, [0, 0]);
  eq(a.reduce((s, x) => s + x, 0), 700);
});
t('ยอดเป็น 0 -> ได้ศูนย์ทุกก้อน', () => eq(app.allocateSatang(0, [5, 5]), [0, 0]));
t('ก้อนเดียว -> ได้ทั้งหมด', () => eq(app.allocateSatang(1234, [9]), [1234]));
t('น้ำหนักติดลบ -> ไม่ได้ส่วนแบ่งติดลบ และผลรวมยังตรง', () => {
  const a = app.allocateSatang(100, [3, -1]);
  ok(a.every(x => x >= 0), JSON.stringify(a));
  eq(a.reduce((s, x) => s + x, 0), 100);
});
t('น้ำหนักเป็น NaN/Infinity -> ไม่ทำผลรวมพัง', () => {
  const a = app.allocateSatang(100, [NaN, 5, Infinity]);
  ok(a.every(x => Number.isFinite(x) && x >= 0), JSON.stringify(a));
  eq(a.reduce((s, x) => s + x, 0), 100);
});
t('ยอดติดลบ -> ได้ศูนย์ทุกก้อน ไม่แจกเงินติดลบ', () => eq(app.allocateSatang(-100, [1, 1]), [0, 0]));
t('1 สตางค์ 3 ก้อน -> รวมยังได้ 1', () => eq(app.allocateSatang(1, [1, 1, 1]).reduce((s, x) => s + x, 0), 1));

// ══════════════════════════════════════════════════════════════════
console.log('\n--- payload ที่ส่งขึ้นชีตต้องพา rate ไปด้วย ---');
// ══════════════════════════════════════════════════════════════════
{
  const v = app.buildVatSummary([bill('TX-A', 7, [['barber', 100]])]);
  t('ทุกแถวหมวดมีฟิลด์ rate ติดไป (ชีตใช้ตัวนี้แทนอัตราระดับงวด)', () =>
    ok(v.categories.every(c => typeof c.rate === 'number'), JSON.stringify(v.categories)));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n--- หัวคอลัมน์ชีตเพี้ยน: เจ้าของต้องได้รู้ ไม่ใช่เห็นแค่ตัวเลขค้าง ---');
// ══════════════════════════════════════════════════════════════════
const toasts = [];
app.showToast = (m, ty) => toasts.push({ m, ty });
t('explainCloudError แปล SCHEMA_MISMATCH เป็นวิธีแก้ที่ทำตามได้', () => {
  const out = app.explainCloudError(new Error('โครงสร้างคอลัมน์ของแท็บ 09-2026 ไม่ตรงกับที่ระบบรู้จัก'));
  ok(/หัวตาราง/.test(out), out);
  ok(/ยังอยู่ในเครื่อง/.test(out), out);
});
t('แปลซ้ำแล้วได้ผลเดิม ไม่ต่อหางซ้อน', () => {
  const once = app.explainCloudError(new Error('โครงสร้างคอลัมน์ของแท็บ 09-2026 ไม่ตรงกับที่ระบบรู้จัก'));
  eq(app.explainCloudError(once), once);
});

const runSync = async () => {
  app.googleSheetsUrl = 'https://gas/exec';
  app.googleSheetsApiToken = 'A'.repeat(24);
  app.state.transactions = [{ id: 'TX-1757000000000-AAAAAAAA', date: '2026-09-01T14:00:00+07:00', total: 386, syncStatus: 'pending' }];
  app.saveState = async () => true;
  app.checkSyncStatus = () => {};
  app.updateSyncBadgeStatus = () => {};
  app.syncSingleTransaction = async () => { throw new Error('โครงสร้างคอลัมน์ของแท็บ 09-2026 ไม่ตรงกับที่ระบบรู้จัก'); };
  app.isSyncing = false;
  toasts.length = 0;
  await app.syncPendingTransactions(true);   // เบื้องหลัง (isSilent) — เดิมเงียบสนิท
};

(async () => {
  await runSync();
  t('ซิงก์เบื้องหลังเจอหัวคอลัมน์เพี้ยน -> เตือนเจ้าของ ไม่เงียบ', () =>
    ok(toasts.some(x => x.ty === 'error' && /หัวตาราง/.test(x.m)), JSON.stringify(toasts)));
  t('บิลยังอยู่ในเครื่องและถูกทำเครื่องหมายว่ายังไม่ซิงก์', () => {
    eq(app.state.transactions.length, 1);
    eq(app.state.transactions[0].syncStatus, 'pending');
  });

  await runSync();
  t('รอบถัดไปไม่เตือนซ้ำ (ไม่รบกวนตอนขายของ)', () => eq(toasts.length, 0));

  // แก้ชีตแล้วซิงก์ผ่าน -> ต้องพร้อมเตือนใหม่ถ้าพังอีก
  app.state.transactions = [{ id: 'TX-1757000000000-BBBBBBBB', date: '2026-09-01T14:00:00+07:00', total: 100, syncStatus: 'pending' }];
  app.syncSingleTransaction = async () => {};
  app.isSyncing = false;
  await app.syncPendingTransactions(true);
  await runSync();
  t('แก้ชีตเสร็จแล้วพังอีก -> เตือนใหม่ได้', () =>
    ok(toasts.some(x => x.ty === 'error' && /หัวตาราง/.test(x.m)), JSON.stringify(toasts)));

  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
