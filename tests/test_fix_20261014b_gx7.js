// แก้ตามรายงานตรวจ 14 ต.ค. 2569 (รอบแก้ 2 · gx7): ทางย้ายเครื่องหลัก/ปลดพัก เมื่อทะเบียนยกเลิกบนชีตเสีย
//   เดิม: validatePrimaryTransfer_ ตอบ PRIMARY_TRANSFER_INCOMPLETE "อ่านทะเบียนยกเลิกของบิล X ไม่ได้" ไม่บอกสาเหตุ
//         → แอปเสนอ "รับช่วงฉุกเฉิน" (เครื่องหลักค้างโหมดพักทั้งที่ข้อมูลครบ) · ปลดพักก็ไม่รู้ว่าต้องแก้อะไร
//   ตอนนี้: REGISTRY_CORRUPT พร้อมสาเหตุ (แบบเดียวกับทางขาย/ยกเลิก) ก่อนแตะชีตหรือเครื่องหลัก · บริการล่ม = แบบเดิม
// แอป/Dexie ตัวจริง + Apps Script ตัวจริงบนชีตจำลอง (ผ่าน claimPrimaryDevice ที่เจ้าของกดจริง)
const { makeShop, createGasEnv, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- รอบแก้ 2 · 14 ต.ค. 2569 · ย้ายเครื่องหลักเมื่อทะเบียนยกเลิกเสีย (gx7) ---');
const t = R.t;
const clone = o => JSON.parse(JSON.stringify(o));
async function shop(gas) {
  const s = await makeShop({ gas, onLine: true, noInit: true });
  Object.assign(s, s.env); s.app.scheduleCloudRetry = () => {}; s.app.resumePendingCloudWork = () => {};
  return s;
}
async function sale(s) { readyCheckout(s); ok(await s.app.processCheckout(), 'sale failed'); await s.app._cloudChain; return s.app.state.transactions.at(-1); }
async function voidBill(s, tx) {
  s.document.getElementById('edit-tx-id').value = tx.id; s.document.getElementById('void-money-outcome').value = 'refunded';
  await s.app.voidTransaction(); await s.app._confirmP; await settle(30);
}
const onSheet = (g, month, id) => { const sh = g.sheet(month); return !!sh && sh._grid.some(r => String(r[0]).trim() === id); };
// เครื่อง A ขายขึ้นชีต → เน็ตหลุด ยกเลิกบิล x (คำสั่งลบค้าง) → ไฟล์สำรอง · เครื่อง B กู้ไฟล์นั้น (มีคำสั่งยกเลิก x ค้างมาด้วย)
async function transferSetup() {
  const g = createGasEnv(), key = g.setupOwnerKey();
  const A = await shop(g); const x = await sale(A); await sale(A); await A.app.syncPendingTransactions(true);
  const month = A.app.getBusinessMonthKey(x.date);
  g.networkDown = true; await voidBill(A, x); g.networkDown = false;
  const file = clone(A.app.buildBackupPayload());
  const B = await shop(g); let keyAsks = 0;
  B.app.askOwnerKey = async () => { keyAsks++; return key; };
  const asks = []; B.app.askConfirm = async m => { asks.push(m); return !/ฉุกเฉิน/.test(m); };
  await B.app.applyBackupData(file); await settle(30);
  return { g, A, B, x, month, asks, keyAsks: () => keyAsks };
}

(async () => {
  await t('[1] ค่าทะเบียนของบิลที่ค้างคำสั่งยกเลิกเสีย → ย้ายไม่ได้ บอกสาเหตุจริง ไม่เสนอรับช่วงฉุกเฉิน · เครื่องหลัก/แถวบนชีตไม่ถูกแตะ', async () => {
    const { g, A, B, x, month, asks, keyAsks } = await transferSetup();
    try {
      ok(B.app.pendingVoidIntents().some(v => v.id === x.id), 'control: void intent carried by the backup');
      const primaryBefore = g.ctx.readPrimaryDevice_().id;
      g.props['POSVB_' + x.id] = '{เสีย';
      B.toasts.length = 0;
      eq(await B.app.claimPrimaryDevice(), false, 'claim succeeded with a corrupt registry');
      const resp = g.requests.filter(q => q && q.action === 'claim_primary').length;
      ok(resp >= 1, 'claim not sent');
      ok(!asks.some(m => /ฉุกเฉิน/.test(m)), 'emergency takeover was offered: ' + asks.join(' || '));
      const toast = B.toasts.map(m => m.m).join(' || ');
      ok(/ทะเบียนบิลที่ยกเลิกบนชีตเสีย/.test(toast) && toast.includes('POSVB_' + x.id) && /กดปุ่มเดิม/.test(toast), toast);
      eq(g.ctx.readPrimaryDevice_().id, primaryBefore, 'primary device changed');
      eq(g.ctx.readPrimaryDevice_().recovery || null, null, 'left in emergency mode');
      eq(onSheet(g, month, x.id), true, 'row was touched');
      // ผู้ดูแลแก้ทะเบียนแล้วกดใหม่ → ย้ายได้ · ไม่ต้องพิมพ์รหัสเจ้าของซ้ำ
      delete g.props['POSVB_' + x.id];
      eq(await B.app.claimPrimaryDevice(), true, 'claim after repair');
      eq(g.ctx.readPrimaryDevice_().id, B.app.deviceId);
      eq(onSheet(g, month, x.id), false, 'pending void not applied on transfer');
      eq(keyAsks(), 1, 'owner key asked again after REGISTRY_CORRUPT');
    } finally { B.dispose(); A.dispose(); }
  });

  await t('[2] ชีต: claim_primary กับแท็บ _POS_VOID_ARCHIVE หัวเพี้ยน → REGISTRY_CORRUPT scope=all · บริการล่ม → ข้อความเดิม (PRIMARY_TRANSFER_INCOMPLETE)', async () => {
    const { g, A, B, x, month } = await transferSetup();
    try {
      const body = (extra) => Object.assign({ action: 'claim_primary', ownerKey: undefined, deviceId: B.app.deviceId, deviceLabel: 'B',
        bills: B.app.transferBillsPayload(), voidIntents: B.app.pendingVoidIntents(), sheetOnly: [] }, extra || {});
      const key = g.ctx.rotatePosOwnerKey();
      const arch = g.ss.insertSheet('_POS_VOID_ARCHIVE'); arch.appendRow(['id', 'voidedAt', 'restoredAt ']);
      const r1 = g.post(body({ ownerKey: key }));
      eq([r1.code, r1.details && r1.details.scope], ['REGISTRY_CORRUPT', 'all'], JSON.stringify(r1));
      ok(/_POS_VOID_ARCHIVE/.test(r1.message) && /ยังไม่ย้ายเครื่องหลัก/.test(r1.message), r1.message);
      eq(onSheet(g, month, x.id), true, 'row deleted');
      g.ss.deleteSheet(arch);
      g.faults.getProperties = 1;   // บริการ Script Properties ล่มชั่วคราว (ตอนอ่านทะเบียนทั้งชุด)
      const r2 = g.post(body({ ownerKey: key }));
      eq(r2.code, 'PRIMARY_TRANSFER_INCOMPLETE', JSON.stringify(r2));
      ok(/อ่านทะเบียนยกเลิกของบิล/.test(r2.message), r2.message);
    } finally { B.dispose(); A.dispose(); }
  });

  await t('[3] applyTransferVoid_: ทะเบียนเสีย → REGISTRY_CORRUPT (ไม่ลงทะเบียน/ไม่ลบแถว) · บริการล่ม → REGISTRY_UNAVAILABLE เดิม', async () => {
    const { g, A, B, x, month } = await transferSetup();
    try {
      g.props['POSVB_' + x.id] = JSON.stringify({ v: 5, r: 5 });
      const res = g.ctx.applyTransferVoid_(g.ss, { id: x.id, month, voidedAt: Date.now() - 1000 });
      const out = res.response ? JSON.parse(String(res.response)) : res;
      eq([res.ok, out.code, out.details && out.details.scope], [false, 'REGISTRY_CORRUPT', 'bill'], JSON.stringify(out));
      eq(onSheet(g, month, x.id), true);
      delete g.props['POSVB_' + x.id];
      g.faults['getProperty:POSVB_' + x.id] = 1;
      const res2 = g.ctx.applyTransferVoid_(g.ss, { id: x.id, month, voidedAt: Date.now() - 1000 });
      eq([res2.ok, res2.code], [false, 'REGISTRY_UNAVAILABLE'], JSON.stringify(res2));
      eq(onSheet(g, month, x.id), true);
    } finally { B.dispose(); A.dispose(); }
  });

  await t('[4] ปลดพักฉุกเฉินตอนทะเบียนเสีย → "ยังปลดพักไม่ได้" พร้อมสาเหตุ · ยังอยู่โหมดพักทั้งชีตและเครื่อง', async () => {
    const g = createGasEnv(), key = g.setupOwnerKey();
    const A = await shop(g); for (let i = 0; i < 3; i++) await sale(A); await A.app.syncPendingTransactions(true);
    const partial = clone(A.app.buildBackupPayload()); partial.transactions = partial.transactions.slice(0, 1);
    const B = await shop(g); B.app.askOwnerKey = async () => key; B.app.askConfirm = async () => true; B.app.askTypedConfirm = async () => false;
    try {
      await B.app.applyBackupData(partial);
      eq(await B.app.claimPrimaryDevice(), true, 'control: emergency takeover'); ok(B.app.isRecoveryIncomplete(), 'control: recovery mode');
      g.networkDown = true; await sale(B); g.networkDown = false;   // บิลใหม่ที่ยังไม่ขึ้นชีต (ชีตต้องดูทะเบียนของมัน)
      const arch = g.ss.insertSheet('_POS_VOID_ARCHIVE'); arch.appendRow(['id', 'voidedAt']);
      B.toasts.length = 0;
      eq(await B.app.claimPrimaryDevice(), false, 'released with corrupt registry');
      const toast = B.toasts.map(m => m.m).join(' || ');
      ok(/ทะเบียนบิลที่ยกเลิกบนชีตเสีย/.test(toast) && /_POS_VOID_ARCHIVE/.test(toast) && /ยังไม่ปลดการพัก/.test(toast), toast);
      ok(g.ctx.readPrimaryDevice_().recovery, 'server left recovery mode');
      ok(B.app.isRecoveryIncomplete(), 'app left recovery mode');
    } finally { B.dispose(); A.dispose(); }
  });

  await t('[5] ข้อความทางย้ายเครื่องหลักบอกให้กดปุ่มเดิม · ข้อความทางขาย/ยกเลิกยังเป็นแบบเดิม', async () => {
    const g = createGasEnv(); const s = await shop(g);
    try {
      const m1 = s.app.explainCloudError('ทะเบียนบิลที่ยกเลิกบนชีตเสีย (เฉพาะบิล X) จึงยังไม่บันทึกบิลใบนี้ — ส่งซ้ำก็ไม่หาย');
      ok(/ระบบจะส่งขึ้นชีตเองหลังแก้เสร็จ/.test(m1), m1);
      const m2 = s.app.explainCloudError('ทะเบียนบิลที่ยกเลิกบนชีตเสีย (ทั้งทะเบียน) จึงยังไม่ย้ายเครื่องหลัก (เครื่องหลักยังเป็นเครื่องเดิม) — ส่งซ้ำก็ไม่หาย');
      ok(/กดปุ่มเดิม/.test(m2) && !/ระบบจะส่งขึ้นชีตเอง/.test(m2), m2);
    } finally { s.dispose(); }
  });

  R.done();
})().catch(e => { console.error(e); process.exit(1); });
