// ─────────────────────────────────────────────────────────────────────────────
//  แก้ตามผลตรวจทั้งระบบ 19 ต.ค. 2569 (ชุด appB) — หน้ารายงาน
//   ข้อ 32 ตารางพนักงาน: บิลรุ่นเก่า/บิลจากชีตที่ไม่มีรายการรายคน ไม่ยกให้ชื่อแรก — ตาราง = buildSummaryPayload().staffCommissions
//          + บอก "บิลรุ่นเก่า/บิลจากชีต N ใบไม่มีรายการรายคน — ไม่นับในตารางนี้" · ตัวเลขสรุปด้านบนไม่เปลี่ยน
//   ข้อ 37 ตัวเลขเงินในรายงานทศนิยม 2 ตำแหน่งเหมือนกันทุกช่อง (เดิม "฿287.5" "฿1,146.3")
//   ข้อ 28 ตารางบิลที่ถูกยกเลิก: บอกผลทางเงิน · ผลต่อลิ้นชัก · เงินคืนตอนไม่มีกะเปิด (cashRefundUnattributed)
//  โค้ดจริง (app.js บน IndexedDB จริง + Apps Script จริงในชีตจำลอง) · filterReports ตัวจริง
//  พิสูจน์ว่าจับของจริง: POS_APP_SRC=<v65>/app.js node tests/test_fix_20261020_appB_reports.js → ต้องตก
// ─────────────────────────────────────────────────────────────────────────────
const { makeRunner, eq, ok } = require('./harness_db.js');
const { makeShop, loginAs, readyCheckout, settle } = require('./fixtures_db.js');
const R = makeRunner('--- fix 20 ต.ค. (appB) ข้อ 32 · 37 · 28: ตารางพนักงาน = ชีต · ทศนิยมเงิน · ผลทางเงินของบิลที่ยกเลิก ---');
const t = R.t;
const strip = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function report(s, staff) {
  const { env, app } = s, d = env.document, P = Object.getPrototypeOf(app);
  app.state.selectedReportType = 'daily';
  d.getElementById('report-date-input').value = app.currentBusinessDateKey();
  d.getElementById('report-staff-filter').value = staff || 'all';
  P.filterReports.call(app);
  const cb = String(d.getElementById('report-commission-body').innerHTML || '');
  const rows = [...cb.matchAll(/<td><strong>([^<]*)<\/strong><\/td>\s*<td>[^<]*<\/td>\s*<td>(\d+) งาน(?: · (\d+) สินค้า)?<\/td>\s*<td>฿([^<]+)<\/td>\s*<td[^>]*>฿([^<]+)<\/td>/g)]
    .map(m => ({ name: m[1], count: Number(m[2]), productCount: Number(m[3] || 0), sales: m[4], commission: m[5] }));
  return { rows, commissionHtml: cb, kpiTotal: d.getElementById('report-kpi-total').innerText, kpiCount: d.getElementById('report-kpi-count').innerText,
    txBody: String(d.getElementById('report-transactions-body').innerHTML || ''), chart: String(d.getElementById('css-bar-chart').innerHTML || ''),
    voids: String(d.getElementById('report-voids-body').innerHTML || '') };
}
const fmt2 = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function sell(s, items, pay) {
  loginAs(s.app, 'staff');
  readyCheckout(s.env, items, pay || 'cash', 100000);
  await s.app.processCheckout(); await settle(30);
  return s.app.state.transactions[s.app.state.transactions.length - 1];
}

(async () => {
  // ═══ ข้อ 32 + 37 ════════════════════════════════════════════════════════
  {
    const now = Date.now();
    const legacy = (id, total, staffName, services) => ({ id, date: now - 60e3, customerName: 'ลูกค้าเก่า', services, staffNames: [staffName],
      subtotal: total, discount: 0, total, paymentMethod: 'cash', syncStatus: 'synced', rev: 1 });
    const s = await makeShop({ role: 'owner', rows: { transactions: [
      legacy('TX-1790000000001-LEGACYA1', 287.5, 'เอ', ['ตัดผม']),          // บิลรุ่นเก่า ไม่มีรายการรายคน ยอดมีเศษ
      legacy('TX-1790000000002-LEGACYB2', 573, 'บี', ['ตัดผม', 'ตัดผม'])
    ] } });
    try {
      await sell(s, [{ id: 's1', name: 'ตัดผม', price: 300 }]);
      await sell(s, [{ id: 's1', name: 'ตัดผม', price: 300 }, { id: 's1', name: 'ตัดผม', price: 300 }]);
      // บิลจากชีต (เครื่องเดิมเสียถาวร) — ใช้ตัวแปลงของแอปเอง
      const dk = s.app.currentBusinessDateKey();
      const r = s.app.sheetOnlyBillFromRow({ id: 'TX-1790000000003-SHEET001', month: dk.slice(5, 7) + '-' + dk.slice(0, 4),
        when: dk + ' 06:05:00', customer: 'ลูกค้า', services: 'นวด', payment: 'เงินสด', subtotal: 655, discount: 0, total: 655, staff: 'เอ', version: 'v1:1:1' }, Date.now());
      ok(r && r.tx, 'สร้างบิลจากชีตไม่ได้ ' + JSON.stringify(r));
      s.app.state.transactions.push(r.tx);
      loginAs(s.app, 'owner');
      const rep = report(s);
      const bills = s.app.summaryBillsOf(s.app.state.transactions.filter(x => s.app.getBusinessISODate(x.date) === dk)).bills;
      const pl = s.app.buildSummaryPayload(bills, [], 'day', dk);
      const sheet = (pl.staffCommissions || []).map(x => ({ name: x.name, count: x.count, productCount: x.productCount || 0, sales: fmt2(x.salesSum), commission: fmt2(x.commission) }));
      const app = rep.rows.filter(x => x.count > 0 || x.productCount > 0 || x.sales !== '0.00');
      await t('32. ตารางพนักงานในแอป = staffCommissions ที่ส่งขึ้นชีต (ชื่อ · งาน · ยอด · ค่าคอม)', () =>
        eq(app.sort((a, b) => a.name.localeCompare(b.name)), sheet.sort((a, b) => a.name.localeCompare(b.name))));
      await t('32. บิลไม่มีรายการรายคนไม่ถูกยกให้ชื่อแรก ("เอ" ได้ 3 งาน ยอด 900 จากบิลใหม่เท่านั้น · "บี" ไม่มีงาน)', () => {
        const a = rep.rows.find(x => x.name === 'เอ'); const b = rep.rows.find(x => x.name === 'บี');
        eq([a.count, a.sales], [3, '900.00']); eq(b ? b.count : 0, 0);
      });
      await t('32. บอกว่า "บิลรุ่นเก่า/บิลจากชีต 3 ใบไม่มีรายการรายคน — ไม่นับในตารางนี้"', () =>
        ok(strip(rep.commissionHtml).includes('บิลรุ่นเก่า/บิลจากชีต 3 ใบไม่มีรายการรายคน — ไม่นับในตารางนี้'), strip(rep.commissionHtml).slice(0, 300)));
      await t('32. ตัวเลขสรุปด้านบนไม่เปลี่ยน (ยอดขายรวมยังนับทุกบิล 300+600+287.5+573+655 = 2,415.50 · 5 บิล)', () => {
        eq(rep.kpiTotal, '฿2,415.50'); eq(rep.kpiCount, '5 บิล');
      });
      await t('37. ตารางบิล: ยอดบิลที่มีเศษแสดง "฿287.50" (เดิม "฿287.5") · บิลเต็มบาทแสดง "฿300.00"', () => {
        ok(rep.txBody.includes('฿287.50') && !/฿287\.5</.test(rep.txBody), 'ไม่พบ ฿287.50');
        ok(rep.txBody.includes('฿300.00'), 'ไม่พบ ฿300.00');
      });
      await t('37. กราฟ: ตัวเลขบนแท่งทศนิยม 2 ตำแหน่ง', () => {
        const tips = [...rep.chart.matchAll(/chart-bar-tooltip">([^<]*)</g)].map(m => m[1]);
        ok(tips.length && tips.every(x => /^฿[\d,]+\.\d\d$/.test(x)), JSON.stringify(tips));
      });
      const repSt = report(s, 'st-1');
      await t('37. ตารางพนักงานยอดขายทศนิยม 2 ตำแหน่ง ("฿900.00") · เลือกรายคน: ยอดงาน/เต็มบิลทศนิยม 2 ตำแหน่ง', () => {
        ok(rep.commissionHtml.includes('฿900.00'), strip(rep.commissionHtml).slice(0, 300));
        ok(/฿600\.00<br>/.test(repSt.txBody) && /เต็มบิล: ฿600\.00/.test(repSt.txBody), repSt.txBody.slice(0, 600));
      });
    } finally { s.env.dispose(); }
  }

  // ═══ ข้อ 28 ═════════════════════════════════════════════════════════════
  {
    const s = await makeShop({ role: 'owner' });   // ร้านจำลองมีกะเปิดอยู่ (เงินตั้งต้น 1000)
    try {
      const a = await sell(s, [{ id: 's1', name: 'ตัดผม', price: 300 }]);
      const b = await sell(s, [{ id: 's1', name: 'ตัดผม', price: 300 }]);
      const c = await sell(s, [{ id: 's1', name: 'ตัดผม', price: 300 }]);
      loginAs(s.app, 'owner');
      const voidIt = async (id, outcome) => {
        s.app.openTransactionEdit(id);
        s.env.document.getElementById('void-money-outcome').value = outcome;
        await s.app.voidTransaction(); if (s.app._confirmP) await s.app._confirmP; await settle(30);
      };
      await voidIt(a.id, 'refunded');
      await voidIt(b.id, 'none');
      // ปิดกะ แล้วยกเลิกบิล c แบบคืนเงิน ตอนไม่มีกะเปิด → เงินคืนไม่อยู่ในลิ้นชักกะไหน
      s.app.state.shift = Object.assign({}, s.app.state.shift, { active: false, startTime: null });
      await voidIt(c.id, 'refunded');
      const vc = s.app.state.voidLog.find(v => v.billId === c.id);
      ok(vc && vc.cashRefundUnattributed === 300, 'ไม่ได้บันทึกเงินคืนนอกกะ ' + JSON.stringify(vc));
      const rep = report(s);
      const rowOf = (id) => strip((rep.voids.split('<tr>').find(x => x.includes(id)) || ''));
      await t('28. ยกเลิกแบบเอาออก (ในกะ) → ตารางบอกผลทางเงิน + ลิ้นชักกะนั้น −฿300.00', () => {
        const r = rowOf(a.id); ok(/เงิน: เอาออกจากยอดที่ควรมี/.test(r) && /ลิ้นชักกะนั้น: −฿300\.00/.test(r), r);
      });
      await t('28. ยกเลิกแบบยังอยู่ที่ร้าน → "เงิน: ยังอยู่ที่ร้าน" + ลิ้นชักไม่เปลี่ยน', () => {
        const r = rowOf(b.id); ok(/เงิน: ยังอยู่ที่ร้าน/.test(r) && /ลิ้นชักกะนั้น: ไม่เปลี่ยน/.test(r), r);
      });
      await t('28. คืนเงินตอนไม่มีกะเปิด → ตารางบอก "คืนเงินสด ฿300.00 ตอนไม่มีกะเปิด — ไม่อยู่ในลิ้นชักกะไหน"', () => {
        const r = rowOf(c.id); ok(/คืนเงินสด ฿300\.00 ตอนไม่มีกะเปิด — ไม่อยู่ในลิ้นชักกะไหน/.test(r), r);
      });
      await t('28. ประวัติรุ่นเก่า (ไม่มีช่องผลทางเงิน) แสดงตามเดิม ไม่มีบรรทัดเพิ่ม', () =>
        eq(s.app.voidMoneyLines({ billId: 'x', amount: 100, date: Date.now() }), []));
    } finally { s.env.dispose(); }
  }

  R.done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
