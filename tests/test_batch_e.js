// ─────────────────────────────────────────────────────────────────────
//  ชุด E (ก.ย. 2569) — ปิด 7 กลุ่มที่ Codex เจอหลังชุด D
//  ล็อกที่ระดับ "กฎ" เหมือนชุด D และเพิ่มกฎที่ชุด D ยังไม่มี
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

console.log('\n--- D-F01: ฟิลด์ที่ "ชื่อเหมือนตัวเลข" ก็เป็น HTML ได้ ---');
t('sanitize บังคับ visitCount / totalDuration ให้เป็นตัวเลข', () => {
  const f = { customers:[{id:'c-1',visitCount:'<img src=x onerror=alert(1)>'}],
              queue:[{id:'q-1',services:[],totalDuration:'<img src=x>',startTime:'พัง'}] };
  app.sanitizeBackupData(f);
  eq(f.customers[0].visitCount, 0);
  eq(f.queue[0].totalDuration, 0);
  eq(f.queue[0].startTime, 0);
});
t('กวาดซอร์ส: ไม่มีฟิลด์นับจำนวนเข้า HTML โดยไม่ครอบ Number()', () => {
  const bad = [];
  SRC.split('\n').forEach((l,i) => {
    if (!/<[a-z]|<td>|<span|value=|class=|style=/.test(l)) return;
    const m = l.match(/\$\{[a-zA-Z_$][\w.]*\.(visitCount|totalDuration|startTime|count|price|total|duration|amount)(\s*\|\|\s*\d+)?\}/g);
    if (m) bad.push(`${i+1}: ${m.join(',')}`);
  });
  eq(bad, []);
});

console.log('\n--- D-F03: ทุกทางที่คุยกับ Sheets ต้องมีด่านสิทธิ์ ---');
t('ตัวส่งสรุปมีด่าน canWriteData ในตัว', () => {
  ['syncDailySummary','syncMonthlySummary'].forEach(fn => {
    const m = SRC.match(new RegExp(`\\n  async ${fn}\\(`));
    ok(m, `ไม่พบ ${fn}`);
    ok(SRC.slice(m.index, m.index + 400).includes('canWriteData'), `${fn} ไม่มีด่าน`);
  });
});
t('ปุ่มส่งสรุปด้วยมือเข้าคิวเดียวกับงานอัตโนมัติ', () => {
  const m = SRC.match(/\n  async syncSummaryNow\(/);
  ok(m); ok(SRC.slice(m.index, m.index + 900).includes('runCloudTask'), 'ปุ่มไม่ผ่านคิว');
});
await t('หน้าต่างรองส่งสรุปด้วยมือไม่ได้', async () => {
  app.isReadOnlyWindow = true; app._roWarnAt = 0;
  app.googleSheetsUrl='https://gas/exec'; app.googleSheetsApiToken='A'.repeat(24);
  const posted = []; app.fetchWithTimeout = async()=>{posted.push(1);return {ok:true,json:async()=>({status:'success'})};};
  eq(await app.syncDailySummary('2026-09-01', [], [], false), false);
  eq(posted.length, 0);
  app.isReadOnlyWindow = false;
});

console.log('\n--- D-F04: สมาชิกใน array ไม่ใช่แค่ตัวห่อ ---');
t('sanitize กรองสมาชิกที่ใช้ไม่ได้ทิ้ง', () => {
  const f = { queue:[{id:'q-1',services:[null,{name:'ตัดผม'},'ไม่ใช่อ็อบเจกต์']}],
              transactions:[{id:'t1',total:1,details:[null,{name:'x'}],services:[null,'ตัดผม'],staffNames:[{},'เอ']}],
              shift:{expenses:[null,{amount:1}],history:[null]} };
  app.sanitizeBackupData(f);
  eq(f.queue[0].services.length, 1);
  eq(f.transactions[0].details.length, 1);
  eq(f.transactions[0].services, ['ตัดผม']);
  eq(f.transactions[0].staffNames, ['เอ']);
  eq(f.shift.expenses.length, 1);
  eq(f.shift.history.length, 0);
});
t('audit นับสมาชิกเสีย -> ไม่บอกว่า clean', () => {
  const a = app.auditBackupData({ transactions:[], queue:[{id:'q-1',services:[null]}] });
  ok(a.badLists >= 1, JSON.stringify(a)); eq(a.clean, false);
});

console.log('\n--- D-F06: กู้ข้อมูลต้องรีเฟรชสรุปของงวดที่ได้รับผล ---');
await t('outbox หลังกู้มีงานสรุปของทั้งงวดเก่าและงวดใหม่', async () => {
  app.isReadOnlyWindow = false; app.loadFailed = false;
  app.saveState = async () => true; app.renderEveryScreen = () => {};
  app.state.transactions = [{ id:'TX-1757000000000-OLDOLDOL', date:'2026-08-15T14:00:00+07:00', total:1 }];
  const f = { backupSchemaVersion:3, services:[{id:'s1',name:'ตัดผม',price:300}], staff:[{id:'st-1',name:'เอ'}],
    categories:[], customers:[], queue:[], voidLog:[], expenseLog:[],
    transactions:[{id:'TX-1757000000000-NEWNEWNE',date:'2026-09-01T14:00:00+07:00',total:300,syncStatus:'synced'}],
    shift:{active:false,startTime:null,startCash:0,startDetails:{},expenses:[],history:[]} };
  await app.applyBackupData(f);
  const sum = app.state.cloudOutbox.filter(x => x.needSummary);
  eq(sum.length, 1);
  ok(sum[0].monthKeys.includes('08-2026'), 'ขาดงวดของข้อมูลเดิมก่อนกู้ ' + JSON.stringify(sum[0]));
  ok(sum[0].monthKeys.includes('09-2026'), 'ขาดงวดของข้อมูลที่กู้มา ' + JSON.stringify(sum[0]));
});
// ชุด F เปลี่ยนจากธง boolean ถาวร → เวลาที่กู้ (restoredAt) เพื่อให้ปลายทางเทียบลำดับกับ void ได้
t('บิลที่กู้มาติดเวลาที่กู้ (restoredAt) ไม่ใช่ธงถาวร', () => {
  ok(Number(app.state.transactions[0].restoredAt) > 0, 'ไม่มี restoredAt');
  eq(app.state.transactions[0].restoredFromBackup, undefined);
});

console.log('\n--- D-F07: บันทึกล้มเหลวแล้วกดซ้ำ ต้องไม่ได้ของซ้ำ ---');
t('editing ID ถูกล้างเมื่อบันทึกสำเร็จเท่านั้น', () => {
  ['editingServiceId','editingStaffId','editingCategoryId'].forEach(k => {
    // ต้องไม่มีการล้างก่อนบรรทัด persistOrRollback ในฟังก์ชันบันทึก
    const bad = SRC.split('\n').some((l, i, arr) => {
      if (!l.includes(`this.state.${k} = null;`)) return false;
      const after = arr.slice(i, i + 40).join('\n');
      const before = arr.slice(Math.max(0, i - 40), i).join('\n');
      // ล้างก่อน persist = ผิด · ล้างหลัง persist หรืออยู่ในตัวปิดหน้าต่าง = ถูก
      return after.includes('persistOrRollback') && !before.includes('persistOrRollback');
    });
    eq(bad, false, `${k} ยังถูกล้างก่อนบันทึก`);
  });
});

console.log('\n--- D-F02/D-F05: ฝั่ง Apps Script ---');
const GAS = fs.readFileSync(path.join(__dirname,'..','google_apps_script.js'),'utf8');
t('มีทะเบียนบิลที่ถูกยกเลิก และลงทะเบียนก่อนแตะชีต', () => {
  ok(/VOIDED_BILLS_PROPERTY/.test(GAS), 'ไม่มีทะเบียน');
  const m = GAS.match(/function handleVoidTransaction\(/);
  const body = GAS.slice(m.index, m.index + 4000);
  const iMark = body.indexOf('markBillVoided_'), iSheet = body.indexOf('getSheetByName');
  ok(iMark >= 0 && iSheet >= 0 && iMark < iSheet, 'ลงทะเบียนหลังแตะชีต');
});
t('handleTransaction ปฏิเสธบิลที่อยู่ในทะเบียน', () =>
  ok(/ALREADY_VOIDED/.test(GAS), 'ไม่มีการปฏิเสธ'));
t('เปิดทางคืนบิลตอนกู้ข้อมูลได้ (allowVoidedRestore)', () => {
  ok(/allowVoidedRestore/.test(GAS)); ok(/allowVoidedRestore/.test(SRC));
});
t('แอปถือ ALREADY_VOIDED เป็นสถานะสุดท้าย ไม่วน retry', () => {
  const m = SRC.match(/\n  async syncSingleTransaction\(/);
  ok(SRC.slice(m.index, m.index + 3000).includes("code === 'ALREADY_VOIDED'"));
});
t('ส่งฟิลด์ VAT มาไม่ครบ ต้องถูกปฏิเสธ', () => ok(/ส่งฟิลด์ VAT มาไม่ครบ/.test(GAS)));

console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
process.exit(fail ? 1 : 0);
})();
