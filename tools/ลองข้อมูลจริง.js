/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ลองข้อมูลจริงของร้านกับ "ด่านตรวจรุ่นใหม่" ก่อนอัปเกรดของจริง (dry run)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ทำไมต้องมี: รุ่น 1.7 ตรวจตัวเลขเงินเข้มขึ้นมากทั้งในแอปและใน Apps Script
 *  (สมการเงินต้องลงตัวเป็นสตางค์ · สรุปต้องบวกกลับได้ · รายการบริการต้องรวมได้เท่ายอด ฯลฯ)
 *  เทสต์ทั้งชุดใช้ข้อมูลสมมติ — บิลจริงที่ออกด้วยแอปรุ่นเก่า ๆ ตั้งแต่ มิ.ย. 2569 อาจมีรูปแบบที่เทสต์ไม่ได้นึกถึง
 *  บิลที่ไม่ผ่านด่านจะ: ถูกกันออกจากสรุปบนชีต · ค้างเป็น "บิลรอตรวจ" · หรือถูกแยกไว้ตอนกู้ข้อมูล
 *
 *  ⚠️ ไม่แตะ Google Sheets / Drive / Telegram ของจริงเลย
 *     ทุกอย่างรันในเครื่องนี้: app.js ตัวจริง (ฐานข้อมูลจำลองในหน่วยความจำ)
 *     + google_apps_script.js ตัวจริง (ชีต/Drive จำลองที่แปลงชนิดข้อมูลเหมือน Google Sheets)
 *
 *  วิธีใช้:
 *    1. เอาไฟล์สำรองล่าสุดของร้าน: Google Drive → โฟลเดอร์ Erotica_POS_Backups → ไฟล์บนสุด → ดาวน์โหลด
 *       (หรือในแอป: ตั้งค่า → ส่งออกข้อมูลสำรอง (.json))
 *    2. วางไฟล์ไว้ในโฟลเดอร์ audit/ ของโปรเจกต์   ← โฟลเดอร์นี้ถูกกันไม่ให้ขึ้น repo สาธารณะ
 *    3. node tools/ลองข้อมูลจริง.js audit/<ชื่อไฟล์>.json
 *    ผลสุดท้าย "ผ่าน" = อัปเกรดได้ · "ต้องดูก่อน" = ส่งผลให้คนดูแลระบบดูก่อนอัปเกรด
 *
 *  ห้ามวางไฟล์สำรองไว้ในโฟลเดอร์ tests/ หรือ tools/ — deploy.ps1 จะ push ขึ้น repo สาธารณะ
 */
process.env.TZ = process.env.TZ || 'Asia/Bangkok';   // วันทำการตัดตี 6 ตามเวลาไทย
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { createGasEnv } = require(path.join(ROOT, 'tests', 'gas_env.js'));
const { makeShop, loginAs, settle } = require(path.join(ROOT, 'tests', 'fixtures_db.js'));

const file = process.argv[2];
if (!file) { console.log('วิธีใช้: node tools/ลองข้อมูลจริง.js audit/<ไฟล์สำรอง>.json'); process.exit(2); }
const abs = path.resolve(file);
if (/[\\/](tests|tools)[\\/]/.test(abs)) {
  console.log('⛔ ย้ายไฟล์สำรองไปไว้ใน audit/ ก่อน — tests/ และ tools/ ถูก push ขึ้น repo สาธารณะ'); process.exit(2);
}
let raw;
try { raw = JSON.parse(fs.readFileSync(abs, 'utf8')); }
catch (e) { console.log('อ่านไฟล์ไม่ได้ / ไม่ใช่ JSON: ' + e.message); process.exit(2); }
// ไฟล์จากหน้า "กู้จาก Drive" บางทีห่อไว้ใน { backupData }
const data = raw && raw.backupData && raw.backupData.transactions ? raw.backupData : raw;
const copy = () => JSON.parse(JSON.stringify(data));

const baht = (n) => '฿' + (Math.round(Number(n) * 100) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const issues = [];      // ปัญหาที่ต้องดูก่อนอัปเกรด
const notes = [];       // ข้อสังเกต (ไม่ขวางการอัปเกรด)
const group = (list, keyOf) => { const m = new Map(); list.forEach(x => { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
const show = (m, fmt, limit) => { [...m.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, arr]) => {
  console.log(`   • ${k} — ${arr.length} รายการ`); arr.slice(0, limit || 5).forEach(x => console.log('       ' + fmt(x))); if (arr.length > (limit || 5)) console.log(`       … อีก ${arr.length - (limit || 5)} รายการ`); }); };

(async () => {
  const gas = createGasEnv();
  const shop = await makeShop({ gas });
  const app = shop.app;
  await settle(50);
  // คุมจังหวะเอง: ไม่ให้งานเบื้องหลังหลังกู้ข้อมูลวิ่งแทรกการตรวจ
  app.resumePendingCloudWork = () => {};
  app.flushCloudOutbox = async () => {};
  loginAs(app, 'owner');
  const txs = Array.isArray(data && data.transactions) ? data.transactions : [];
  const dates = txs.map(t => new Date(t && t.date).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  console.log('\n═══ ลองข้อมูลจริงกับด่านตรวจรุ่นใหม่ ═══');
  console.log(`ไฟล์: ${path.basename(abs)} · บิล ${txs.length} ใบ` + (dates.length ? ` · ${new Date(dates[0]).toLocaleDateString('th-TH')} – ${new Date(dates[dates.length - 1]).toLocaleDateString('th-TH')}` : ''));
  console.log(`แอป ${String((require('fs').readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1] || '?')}`);

  // ── 1) โครงไฟล์ ──────────────────────────────────────────────────────────
  console.log('\n[1] โครงไฟล์สำรอง (ด่านเดียวกับตอนกู้ + ด่านฝั่ง Apps Script)');
  const okApp = app.isValidBackupObject(copy());
  const whyGas = gas.ctx.validateBackupStructure_(copy());
  console.log(`   แอป: ${okApp ? 'ผ่าน' : 'ไม่ผ่าน — ' + (app._lastBackupRejectReason || '?')} · Apps Script: ${whyGas ? 'ไม่ผ่าน — ' + whyGas : 'ผ่าน'}`);
  if (!okApp || whyGas) { issues.push('ไฟล์สำรองไม่ผ่านด่านโครงไฟล์ — กู้ด้วยแอปรุ่นใหม่ไม่ได้'); }

  // ── 2) บิลรายใบกับกติกาเงินของแอป ───────────────────────────────────────────
  console.log('\n[2] บิลรายใบ — กติกาเงินของแอป (validateBillRecord)');
  const fatal = [], noteList = [];
  txs.forEach(tx => app.validateBillRecord(tx).forEach(p => (p.fatal ? fatal : noteList).push({ id: tx && tx.id, date: tx && tx.date, total: tx && tx.total, p })));
  const fatalIds = new Set(fatal.map(x => x.id));
  console.log(`   ใช้ได้ ${txs.length - fatalIds.size} ใบ · ข้อมูลเงินเชื่อไม่ได้ ${fatalIds.size} ใบ · ข้อสังเกต (ไม่ขวาง) ${noteList.length} จุด`);
  if (fatal.length) {
    show(group(fatal, x => x.p.msg), x => `${x.id} · ${new Date(x.date).toLocaleString('th-TH')} · ยอด ${baht(x.total)}`);
    issues.push(`บิล ${fatalIds.size} ใบไม่ผ่านกติกาเงินของแอปรุ่นใหม่ — จะไม่ถูกนับในสรุปบนชีต และค้างเป็น "บิลรอตรวจ" ถ้าต้องส่งขึ้นชีตใหม่`);
  }
  if (noteList.length) show(group(noteList, x => '(ข้อสังเกต) ' + x.p.msg), x => `${x.id}`, 2);

  // ── 3) ถ้าต้องกู้ไฟล์นี้ลงเครื่องใหม่ ──────────────────────────────────────────
  console.log('\n[3] ถ้าต้องกู้ไฟล์นี้ลงเครื่องใหม่ (ผลตรวจก่อนกู้ — ตัวเดียวกับกล่องเตือนในแอป)');
  const audit = app.auditBackupData(copy());
  console.log(`   ${audit.clean ? 'สะอาด — กู้แล้วได้ครบทุกรายการ' : `จะถูกแยกไว้ตรวจสอบ ${audit.quarantine} รายการ (บิลเงินเสีย ${audit.badMoney} · วันที่เสีย ${audit.badDate} · ไม่มีเลขที่ ${audit.noId} · เลขซ้ำ ${audit.dupId} · ค่าใช้จ่าย ${audit.badExpenses} · บริการ ${audit.badServices} · กะ ${audit.badShifts} · โครงรายการ ${audit.badLists})`}`);
  (audit.problemSamples || []).slice(0, 8).forEach(s => console.log('       ' + s));
  if (!audit.clean) issues.push(`กู้ไฟล์นี้แล้วจะมี ${audit.quarantine} รายการถูกแยกออกจากยอด`);

  // กู้ลงเครื่องจำลองจริง (ใช้ทำข้อ 4-7 ต่อ)
  try { await app.applyBackupData(copy()); await settle(80); }
  catch (e) { console.log('   ⛔ กู้ลงเครื่องจำลองไม่สำเร็จ: ' + e.message); issues.push('กู้ไฟล์นี้ด้วยแอปรุ่นใหม่ไม่สำเร็จ: ' + e.message); return finish(); }
  const live = app.state.transactions;
  console.log(`   กู้ลงเครื่องจำลองแล้ว: บิล ${live.length} ใบ · รายการที่แยกไว้ ${(app.state.quarantine || []).length}`);

  // ── 4) ส่งบิลทุกใบขึ้นชีตจำลอง (Apps Script ตัวจริง) ────────────────────────────
  console.log('\n[4] ส่งบิลทุกใบขึ้นชีตจำลอง — ด่านตรวจเงินฝั่ง Apps Script (validateBillPayload_)');
  for (let round = 0; round < 5 && live.some(t => app.isBillAwaitingSync(t)); round++) { await app.syncPendingTransactions(true); await settle(20); }
  const synced = live.filter(t => t.syncStatus === 'synced').length;
  const conflicts = live.filter(t => t.syncStatus === 'conflict');
  const stillPending = live.filter(t => app.isBillAwaitingSync(t));
  console.log(`   ขึ้นชีตสำเร็จ ${synced} ใบ · บิลรอตรวจ ${conflicts.length} ใบ · ยังส่งไม่ผ่าน ${stillPending.length} ใบ`);
  if (conflicts.length) {
    show(group(conflicts, t => (t.syncIssue && (t.syncIssue.code + ': ' + String(t.syncIssue.message || '').slice(0, 90))) || '?'),
      t => `${t.id} · ${new Date(t.date).toLocaleString('th-TH')} · ยอด ${baht(t.total)}`);
    issues.push(`บิล ${conflicts.length} ใบถูกชีต/แอปปฏิเสธ — จะค้างเป็น "บิลรอตรวจ" ถ้าบิลพวกนี้ต้องส่งขึ้นชีตใหม่ (เช่นหลังแก้บิล/กู้ข้อมูล)`);
  }
  if (stillPending.length) issues.push(`บิล ${stillPending.length} ใบส่งขึ้นชีตจำลองไม่ผ่าน (ลองแล้ว 5 รอบ)`);

  // ── 5) สรุปรายวัน/รายเดือนทุกงวด ─────────────────────────────────────────────
  console.log('\n[5] สรุปรายวัน/รายเดือนทุกงวด — ด่านตรวจสรุปฝั่ง Apps Script (normalizeSummaryPayload_)');
  const dayKeys = new Set(), monthKeys = new Set();
  live.forEach(t => { dayKeys.add(app.getBusinessISODate(t.date)); monthKeys.add(app.getBusinessMonthKey(t.date)); });
  ((app.state.shift && app.state.shift.history) || []).forEach(h => (h.expenses || []).forEach(e => { const d = e && (e.time || e.date || h.startTime); if (d) { dayKeys.add(app.getBusinessISODate(d)); monthKeys.add(app.getBusinessMonthKey(d)); } }));
  const bad = [], drift = [];
  let stamp = Date.now();
  const sendSummary = (payload, key) => {
    payload.generatedAt = ++stamp;                 // ข้ามกติกา "ห้ามรุ่นเก่าทับรุ่นใหม่" — เราส่งทีละงวดตามลำดับ
    const r = gas.post(payload);
    if (r.status !== 'success') bad.push({ key, code: r.code || '-', msg: String(r.message || '') });
    return r;
  };
  [...dayKeys].filter(k => app.isValidDateKey(k)).sort().forEach(dk => {
    const dayTxs = live.filter(t => app.getBusinessISODate(t.date) === dk);
    const p = app.buildSummaryPayload(dayTxs, app.getExpensesForDate(dk), 'day', dk);
    const plain = Math.round(dayTxs.reduce((s, t) => s + (Number(t.total) || 0), 0) * 100) / 100;
    if (Math.round(plain * 100) !== Math.round(Number(p.totalRevenue) * 100)) drift.push({ key: dk, plain, now: p.totalRevenue, excluded: p.excludedInvalid });
    sendSummary(p, dk);
  });
  [...monthKeys].filter(k => app.isValidMonthKey(k)).sort().forEach(mk => {
    const mTxs = live.filter(t => app.getBusinessISOMonth(t.date) === mk.slice(3) + '-' + mk.slice(0, 2));
    sendSummary(app.buildSummaryPayload(mTxs, app.collectExpenses('month', mk), 'month', mk), mk);
  });
  console.log(`   ส่ง ${dayKeys.size} วัน + ${monthKeys.size} เดือน · ถูกปฏิเสธ ${bad.length} งวด`);
  if (bad.length) { show(group(bad, x => `${x.code}: ${x.msg.slice(0, 110)}`), x => x.key, 8); issues.push(`สรุป ${bad.length} งวดถูก Apps Script ปฏิเสธ — งานสรุปของงวดนั้นจะค้างในคิวและยิงซ้ำ`); }
  if (drift.length) {
    console.log(`   ยอดสรุปรุ่นใหม่ต่างจาก "บวกยอดทุกบิล" ${drift.length} วัน (เพราะมีบิลถูกกันออก):`);
    drift.slice(0, 10).forEach(x => console.log(`       ${x.key}: เดิม ${baht(x.plain)} → ใหม่ ${baht(x.now)} (กันออก ${x.excluded} ใบ)`));
    issues.push(`ยอดบนแท็บสรุป ${drift.length} วันจะต่างจากยอดเดิม`);
  }
  const errCells = gas.ss.getSheets().reduce((n, sh) => n + sh._grid.reduce((m, r) => m + r.filter(v => v === '#ERROR!').length, 0), 0);
  if (errCells) { console.log(`   ⛔ มีช่องขึ้น #ERROR! บนชีตจำลอง ${errCells} ช่อง`); issues.push(`ชีตสรุปมีช่อง #ERROR! ${errCells} ช่อง`); }

  // ── 6) ไฟล์สำรองขึ้น Drive (Apps Script อ่านกลับตรวจ) ────────────────────────────
  console.log('\n[6] สำรองข้อมูลชุดนี้ขึ้น Drive จำลอง (อ่านไฟล์กลับตรวจ)');
  const bOk = await app.autoBackupToGoogleDrive({ silent: true });
  console.log(`   ${bOk ? 'สำเร็จ · ตรวจอ่านกลับแล้ว' : 'ไม่สำเร็จ — ' + ((app.backupStatus && app.backupStatus.lastMessage) || '?')}`);
  if (!bOk) issues.push('สำรองข้อมูลชุดนี้ขึ้น Drive ไม่ผ่าน: ' + ((app.backupStatus && app.backupStatus.lastMessage) || '?'));

  // ── 7) ตรวจความตรงกันกับชีต (ต้องตรงทุกใบ เพราะชีตจำลองสร้างจากข้อมูลชุดนี้เอง) ──────────
  console.log('\n[7] ตรวจความตรงกันกับชีต (เครื่องมือเดียวกับปุ่มในหน้าตั้งค่า)');
  const key = gas.setupOwnerKey();
  app.askOwnerKey = async () => key;
  await app.runCloudReconcile();
  const rc = app._reconcile || {};
  const mm = rc.mismatch || [];
  console.log(`   ตรวจ ${(rc.months || []).length} เดือน · ช่องไม่ตรง ${mm.length} ใบ · บิลเกินบนชีต ${(rc.extra || []).length} · หายจากชีต ${(rc.missing || []).length} · แถวซ้ำ ${(rc.duplicates || []).length}`);
  if (mm.length) {
    show(group(mm, m => 'ช่องที่ต่าง: ' + m.fields.map(f => f.label).join(', ')), m => `${m.id} · ` + m.fields.map(f => `${f.label}: เครื่อง "${f.local}" / ชีต "${f.cloud}"`).join(' · '), 5);
    issues.push(`หน้าตรวจความตรงกันฟ้อง ${mm.length} ใบทั้งที่ไม่มีใครแก้ชีต (ผลเตือนปลอม)`);
  }
  const missing = (rc.missing || []).filter(m => !m.pending).length + (rc.extra || []).length;
  if (missing) notes.push(`บิลเกิน/หายระหว่างเครื่องกับชีตจำลอง ${missing} รายการ (บิลที่ถูกแยก/รอตรวจจะไม่ขึ้นชีต)`);
  finish();

  function finish() {
    console.log('\n═══ ผล ═══');
    notes.forEach(n => console.log('ℹ️  ' + n));
    if (!issues.length) console.log('✅ ผ่าน — ข้อมูลจริงชุดนี้ผ่านด่านรุ่นใหม่ครบทุกข้อ อัปเกรดได้');
    else { console.log('⚠️  ต้องดูก่อนอัปเกรด:'); issues.forEach((s, i) => console.log(`   ${i + 1}. ${s}`)); }
    try { shop.env.dispose(); } catch (e) {}
    process.exit(issues.length ? 1 : 0);
  }
})().catch(e => { console.log('เครื่องมือล้มกลางทาง: ' + (e && e.stack || e)); process.exit(3); });
