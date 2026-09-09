// ─────────────────────────────────────────────────────────────────────
//  ชุด D (ก.ย. 2569) — ปิดสิ่งที่ Codex ตรวจเจอหลังชุด A/B/C
//
//  บทเรียนของรอบนี้: รอบก่อนแก้ "เคสที่รายงานยกตัวอย่าง" ไม่ได้แก้ "ทั้งชนิดของปัญหา"
//  เทสต์ชุดนี้จึงล็อกที่ระดับกฎ ไม่ใช่ระดับเคส
// ─────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const h = require('./harness.js');
const app = h.ctx.app;
let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r instanceof Promise) return r.then(()=>{pass++;console.log('  PASS',n)},e=>{fail++;console.log('  FAIL',n,'->',e.message)}); pass++; console.log('  PASS', n); } catch (e) { fail++; console.log('  FAIL', n, '->', e.message); } };
const eq = (a,b,m) => { if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c,m) => { if (!c) throw new Error(m||'expected truthy'); };
const SRC = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const toasts = []; app.showToast = (m,ty) => toasts.push({m,ty}); app.vibrateDevice = ()=>{};

(async () => {

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 1: ห้ามมีค่าจากข้อมูลเข้า HTML โดยไม่ผ่านตัวกรอง ---');
// ══════════════════════════════════════════════════════════════════
t('safeIcon รับเฉพาะรูปแบบ fa-xxx — ค่าอื่นตกเป็นค่าตั้งต้น', () => {
  eq(h.ctx.safeIcon('fa-scissors'), 'fa-scissors');
  eq(h.ctx.safeIcon('fa-scissors" onload="x=1', 'fa-tag'), 'fa-tag');
  eq(h.ctx.safeIcon('<img src=x>', 'fa-tag'), 'fa-tag');
  eq(h.ctx.safeIcon(null, 'fa-tag'), 'fa-tag');
});
t('ไม่มี ${cat.icon} / ${typeText} ดิบหลงเหลือในซอร์ส', () => {
  ok(!/\$\{iconClass\}/.test(SRC) || /safeIcon\(/.test(SRC), 'iconClass ยังไม่ผ่าน safeIcon');
  ok(!SRC.includes('${typeText}'), 'ชื่อหมวดยังต่อเข้า HTML ดิบ');
});
t('กวาดทั้งไฟล์: ไม่มี ${x.name} / ${x.icon} ที่ไม่ผ่าน escape', () => {
  const bad = [];
  SRC.split('\n').forEach((l, i) => {
    if (!/<[a-z]|value=|class=|id="/.test(l)) return;
    // `tone` คือชุดสีคงที่ของ toast ในไฟล์นี้เอง ไม่ใช่ข้อมูลจากผู้ใช้ (ตั้งชื่อให้แยกออกโดยตั้งใจ)
    const m = l.match(/\$\{(?!tone\.)[a-z]+\.(name|icon|label|message|customerName|staffName|phone|role)\}/g);
    if (m) bad.push(`${i+1}: ${m.join(',')}`);
  });
  eq(bad, [], 'ยังมีค่าดิบเข้า HTML');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 2: เส้นที่เปลี่ยนข้อมูลต้องเช็คผลบันทึกทุกเส้น ---');
// ══════════════════════════════════════════════════════════════════
t('ไม่มี saveState() เปล่าหลงเหลือบนเส้นที่ผู้ใช้กด', () => {
  // อนุญาตเฉพาะงาน migration ตอนบูต · ตัว wrapper เอง · งานซิงก์ที่ retry ได้
  const allowed = ['migratePinIfNeeded','loadState','saveStateOrThrow',
                   '_doSyncPendingTransactions','migrateStaffAccountsIfNeeded','_doFlushCloudOutbox'];
  const lines = SRC.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/await this\.saveState\(\);/.test(l)) return;
    let fn = '?';
    for (let k = i; k >= 0; k--) {
      const m = lines[k].match(/^  (?:async )?([a-zA-Z_]\w*)\s*\(/);
      if (m) { fn = m[1]; break; }
    }
    if (!allowed.includes(fn)) bad.push(`${i+1}:${fn}`);
  });
  eq(bad, [], 'ยังมีเส้นที่บันทึกแล้วไม่ดูผล');
});
await t('persistOrRollback มีอยู่จริงและคืน false เมื่อบันทึกไม่ผ่าน', async () => {
  app.loadFailed = false; app.isReadOnlyWindow = false;
  app.saveState = async () => false;
  let restored = false;
  eq(await app.persistOrRollback('ทดสอบ', () => { restored = true; }), false);
  ok(restored, 'ไม่ได้เรียก rollback');
});
await t('บันทึกผ่าน -> คืน true และไม่เรียก rollback', async () => {
  app.saveState = async () => true;
  let restored = false;
  eq(await app.persistOrRollback('ทดสอบ', () => { restored = true; }), true);
  eq(restored, false);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 3: ด่านหน้าต่างหลักต้องครอบทุกทางเขียน ---');
// ══════════════════════════════════════════════════════════════════
t('canWriteData ปฏิเสธเมื่อเป็นหน้าต่างรอง', () => {
  app.isReadOnlyWindow = true;  eq(app.canWriteData(), false);
  app.isReadOnlyWindow = false; eq(app.canWriteData(), true);
});
t('ทุกทางเขียนที่ไม่ผ่าน saveState ต้องเรียก canWriteData', () => {
  const need = ['resetData','savePreRestoreSnapshot','autoBackupToGoogleDrive',
                '_doSyncPendingTransactions','_doFlushCloudOutbox','resumePendingCloudWork'];
  // ต้องหาจาก "จุดประกาศเมธอด" ไม่ใช่การกล่าวถึงครั้งแรก (ชื่อเดียวกันโผล่ในคอมเมนต์/ผู้เรียกได้)
  const missing = need.filter(fn => {
    const m = SRC.match(new RegExp(`\\n  (?:async )?${fn}\\(`));
    if (!m) return true;
    return !SRC.slice(m.index, m.index + 2000).includes('canWriteData');
  });
  eq(missing, [], 'ยังมีทางเขียนที่ไม่มีด่าน');
});
await t('หน้าต่างรองส่งงานคลาวด์ไม่ได้', async () => {
  app.isReadOnlyWindow = true;
  app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='A'.repeat(24);
  app.state.transactions=[{id:'TX-1757000000000-AAAAAAAA',date:'2026-09-01T14:00:00+07:00',total:300,syncStatus:'pending'}];
  const posted=[]; app.fetchWithTimeout=async()=>{posted.push(1);return {ok:true,json:async()=>({status:'success'})};};
  app.checkSyncStatus=()=>{}; app.updateSyncBadgeStatus=()=>{}; app.isSyncing=false;
  await app.syncPendingTransactions(true);
  eq(posted.length, 0);
  app.isReadOnlyWindow = false;
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 4: ข้อมูลนำเข้าต้องไม่ทำให้ร้านเปิดไม่ได้ ---');
// ══════════════════════════════════════════════════════════════════
t('sanitize ซ่อมรายการย่อยที่ไม่ใช่อาเรย์', () => {
  const f = { queue:[{id:'q-1',services:null}], transactions:[{id:'t1',total:1,services:null,staffNames:null}],
              shift:{expenses:null,history:null} };
  app.sanitizeBackupData(f);
  eq(Array.isArray(f.queue[0].services), true);
  eq(Array.isArray(f.transactions[0].services), true);
  eq(Array.isArray(f.shift.expenses), true);
});
t('auditBackupData นับความเสียหายเชิงโครงสร้าง และไม่บอกว่า clean', () => {
  const a = app.auditBackupData({ transactions:[], queue:[{id:'q-1',services:null}] });
  eq(a.badLists, 1); eq(a.clean, false);
  ok(/รายการย่อยเสีย/.test(app.describeBackupAudit(a)), app.describeBackupAudit(a));
});
t('ไฟล์ปกติยังนับว่า clean', () => {
  const a = app.auditBackupData({ transactions:[], queue:[{id:'q-1',services:[]}], services:[] });
  eq(a.badLists, 0); eq(a.clean, true);
});
t('safeRender ไม่ปล่อยให้ error ลามออกไปบล็อกหน้าล็อกอิน', () => {
  app._renderFailures = [];
  eq(app.safeRender('ทดสอบ', () => { throw new Error('พัง'); }), false);
  eq(app.safeRender('ทดสอบ2', () => {}), true);
  eq(app._renderFailures, ['ทดสอบ']);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 5: ชนิด ID ต้องเป็นสตริงเสมอ ---');
// ══════════════════════════════════════════════════════════════════
t('sanitize แปลง id ตัวเลขเป็นสตริง รวม foreign key', () => {
  const f = { services:[{id:123,category:7,price:300}], categories:[{id:7}], staff:[{id:9}],
              customers:[{id:5}], queue:[{id:3,customerId:5}],
              transactions:[{id:11,total:1,customerId:5,details:[{staffId:9}]}] };
  app.sanitizeBackupData(f);
  eq(typeof f.services[0].id, 'string'); eq(f.services[0].category, '7');
  eq(typeof f.categories[0].id, 'string'); eq(typeof f.staff[0].id, 'string');
  eq(typeof f.queue[0].customerId, 'string'); eq(typeof f.transactions[0].details[0].staffId, 'string');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 6: งานคลาวด์ต้องต่อคิวเส้นเดียว ---');
// ══════════════════════════════════════════════════════════════════
await t('runCloudTask ทำงานทีละงานตามลำดับ ไม่วิ่งพร้อมกัน', async () => {
  const order = [];
  const mk = (n, ms) => () => new Promise(r => setTimeout(() => { order.push(n); r(); }, ms));
  const a = app.runCloudTask(mk('a', 20));
  const b = app.runCloudTask(mk('b', 1));
  const c = app.runCloudTask(mk('c', 1));
  await Promise.all([a, b, c]);
  eq(order, ['a', 'b', 'c']);
});
await t('งานที่ล้มไม่ทำให้คิวตันถาวร', async () => {
  await app.runCloudTask(() => Promise.reject(new Error('พัง'))).catch(() => {});
  let ran = false;
  await app.runCloudTask(async () => { ran = true; });
  ok(ran, 'คิวตันหลังงานล้ม');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 7: รายงานย้อนหลังห้ามขยับตามราคาวันนี้ ---');
// ══════════════════════════════════════════════════════════════════
t('บิลเก่าไม่มี details -> รายได้บริการเท่ากับยอดของบิลเอง', () => {
  app.state.services = [{ id:'s1', name:'ตัดผม', price:500, commission:20, commissionType:'percent' }];
  app.state.categories = [];
  const tx = { id:'TX-1757000000000-AAAAAAAA', date:'2026-09-01T14:00:00+07:00',
               subtotal:300, discount:50, total:250, services:['ตัดผม'], paymentMethod:'cash' };
  const p = app.buildSummaryPayload([tx], [], 'day', '2026-09-01');
  eq(p.totalRevenue, 250);
  eq(p.services.reduce((s,x)=>s+x.revenue,0), 250, 'รายได้บริการต้องเท่ายอดบิล ไม่ใช่ราคาวันนี้');
});
t('ขึ้นราคาวันนี้แล้วรายงานย้อนหลังต้องไม่ขยับ', () => {
  const tx = { id:'TX-1757000000000-BBBBBBBB', date:'2026-09-01T14:00:00+07:00',
               subtotal:300, discount:50, total:250, services:['ตัดผม'], paymentMethod:'cash' };
  const before = app.buildSummaryPayload([tx], [], 'day', '2026-09-01').services[0].revenue;
  app.state.services[0].price = 9999;
  const after = app.buildSummaryPayload([tx], [], 'day', '2026-09-01').services[0].revenue;
  eq(after, before);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n--- กฎที่ 8: กู้ข้อมูลแล้วต้องกระทบยอดกับชีตใหม่ ---');
// ══════════════════════════════════════════════════════════════════
await t('หลังกู้ บิลทุกใบถูกตั้งเป็นรอส่ง ไม่เชื่อ syncStatus จากไฟล์', async () => {
  app.isReadOnlyWindow = false; app.loadFailed = false;
  app.saveState = async () => true; app.renderEveryScreen = () => {};
  const f = { backupSchemaVersion:3, services:[{id:'s1',name:'ตัดผม',price:300}], staff:[{id:'st-1',name:'เอ'}],
    categories:[{id:'barber',name:'ตัดผมชาย'}], customers:[], queue:[], voidLog:[], expenseLog:[],
    transactions:[{id:'TX-1757000000000-CCCCCCCC',date:'2026-09-01T14:00:00+07:00',total:300,syncStatus:'synced'}],
    shift:{active:false,startTime:null,startCash:0,startDetails:{},expenses:[],history:[]} };
  await app.applyBackupData(f);
  eq(app.state.transactions[0].syncStatus, 'pending');
});

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
