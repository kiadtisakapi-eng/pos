// ตรวจ 14 ต.ค. 2569 ข้อ 4 (fx3) — ค่าคอมที่ใช้คิดเงินไม่ได้ ต้องไม่ออกบิลที่ระบบเองตีว่า "ข้อมูลเสีย"
//   [1] ตะกร้ามีรายการค่าคอม 150% → ชำระเงินไม่ผ่าน · ไม่มีบิลลงเครื่อง (เดิม: ออกบิลค่าคอม 450 บนบิล 300 → รอตรวจ · ยอดหายจากสรุป)
//   [2] ค่าคอมทศนิยม → ชำระเงินไม่ผ่าน
//   [3] ด่านสุดท้าย: บิลที่ตัวตรวจบิลตีว่าเสีย → ไม่บันทึก (ไม่ว่าต้นเหตุมาจากไหน)
//   [4] นำเข้าไฟล์ที่มีค่าคอม % > 100 / ทศนิยม → รายการถูกติดธง ใส่ตะกร้าไม่ได้ · แยกไว้ตรวจ · ค่าปกติ (รวมบาทเกินราคา) ไม่โดน
//   [5] เจ้าของแก้ค่าคอมในหน้าตั้งค่า → ขายได้อีกครั้ง
//   [6] บิลปกติทุกช่องทางยังขายได้ (สุ่ม 120 บิล)
const { makeShop, readyCheckout, settle } = require('./fixtures_db');
const { makeRunner, eq, ok } = require('./harness_db');
const R = makeRunner('--- ตรวจ 14 ต.ค. 2569 ข้อ 4 (fx3): ด่านค่าคอม ---');
const t = R.t;
const clone = x => JSON.parse(JSON.stringify(x));

(async () => {
  // ═══ [1]–[3] ด่านชำระเงิน ═══
  {
    const { env, app, toasts } = await makeShop(); await settle();
    const n0 = app.state.transactions.length;
    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300, commission: 150, commissionType: 'percent' }], 'cash', 300);
    const r = await app.processCheckout(); await settle(30);
    await t('[1.1] ค่าคอม 150% → ชำระเงินไม่ผ่าน', () => ok(r === false, String(r)));
    await t('[1.2] ไม่มีบิลในเครื่องและในฐานข้อมูล', async () => {
      eq(app.state.transactions.length, n0); eq((await env.raw('transactions')).length, n0);
    });
    await t('[1.3] ข้อความบอกชื่อรายการและเหตุผล', () => ok(toasts.some(x => /ค่าคอมของ "ตัดผม"/.test(x.m) && /ไม่เกิน 100/.test(x.m)), JSON.stringify(toasts.slice(-1))));
    await t('[1.4] ตะกร้ายังอยู่ (แก้แล้วขายต่อได้)', () => eq(app.state.cart.length, 1));

    readyCheckout(env, [{ id: 's1', name: 'ตัดผม', price: 300, commission: 12.5, commissionType: 'fixed' }], 'cash', 300);
    const r2 = await app.processCheckout(); await settle(30);
    await t('[2.1] ค่าคอมทศนิยม → ชำระเงินไม่ผ่าน · ไม่มีบิล', () => ok(r2 === false && app.state.transactions.length === n0));

    // ค่าคอมแบบบาทเกินราคา = กติกาเดิมยังรับ
    readyCheckout(env, [{ id: 'd1', name: 'น้ำ', price: 20, category: 'drinks', isProduct: true, commission: 30, commissionType: 'fixed' }], 'cash', 100);
    const r3 = await app.processCheckout(); await settle(30);
    await t('[2.2] ค่าคอมแบบบาทเกินราคา (กติกาเดิม) ยังขายได้', () => ok(r3 === true && app.state.transactions.length === n0 + 1, JSON.stringify(toasts.slice(-1))));

    // ด่านสุดท้าย: ตัวตรวจบิลตีว่าเสีย → ไม่บันทึก
    const n1 = app.state.transactions.length;
    const realValidate = app.validateBillRecord;
    app.validateBillRecord = function (tx, o) { const p = realValidate.call(this, tx, o); return tx && tx.checkoutAttemptId ? p.concat([{ code: 'x', msg: 'จำลองข้อมูลเสีย', fatal: true }]) : p; };
    readyCheckout(env, null, 'cash', 500);
    const r4 = await app.processCheckout(); await settle(30);
    app.validateBillRecord = realValidate;
    await t('[3.1] บิลที่ตัวตรวจบิลตีว่าเสีย → ไม่บันทึก', async () => {
      ok(r4 === false, String(r4)); eq(app.state.transactions.length, n1); eq((await env.raw('transactions')).length, n1);
    });
    await t('[3.2] บอกพนักงานว่ายังไม่ได้บันทึก ห้ามรับเงิน', () => ok(toasts.some(x => /จำลองข้อมูลเสีย/.test(x.m) && /ยังไม่ได้บันทึก/.test(x.m))));
    env.dispose();
  }

  // ═══ [4]–[5] นำเข้าไฟล์ → ติดธง → แก้ในหน้าตั้งค่า → ขายได้ ═══
  {
    const { env, app, toasts } = await makeShop(); await settle();
    const file = clone(app.buildBackupPayload());
    file.createdAt = new Date(Date.now() - 1000).toISOString();
    file.services = [
      { id: 's1', name: 'ตัดผม', price: 300, duration: 30, category: 'barber', commission: 10, commissionType: 'percent' },
      { id: 's2', name: 'นวดพิเศษ', price: 500, duration: 60, category: 'barber', commission: 150, commissionType: 'percent' },
      { id: 's3', name: 'สระ', price: 200, duration: 20, category: 'barber', commission: 7.5, commissionType: 'percent' },
      { id: 's4', name: 'แพ็กเกจ', price: 500, duration: 60, category: 'barber', commission: 700, commissionType: 'fixed' },
      { id: 's5', name: 'เต็มร้อย', price: 100, duration: 10, category: 'barber', commission: 100, commissionType: 'percent' }
    ];
    await app.applyBackupData(file, { acceptUnsynced: true }); await settle(30);
    const svc = id => app.state.services.find(s => s.id === id);
    await t('[4.1] ค่าคอม 150% → ติดธงขายไม่ได้', () => ok(svc('s2') && svc('s2').priceInvalid === true, JSON.stringify(svc('s2'))));
    await t('[4.2] ค่าคอมทศนิยม 7.5% → ติดธงขายไม่ได้', () => ok(svc('s3') && svc('s3').priceInvalid === true, JSON.stringify(svc('s3'))));
    await t('[4.3] ค่าปกติ (10% · 100% · บาทเกินราคา 700) ไม่โดนธง', () => ok(['s1', 's4', 's5'].every(id => svc(id) && !svc(id).priceInvalid)));
    await t('[4.4] แยกไว้ตรวจพร้อมเหตุผล', () => ok((app.state.quarantine || []).filter(q => q.kind === 'service' && (q.reasons || []).includes('bad-commission')).length === 2,
      JSON.stringify(app.state.quarantine)));
    app.state.cart = [];
    app.addToCart('s2');
    await t('[4.5] หยิบรายการที่ติดธงใส่ตะกร้าไม่ได้', () => ok(app.state.cart.length === 0 && toasts.some(x => /นวดพิเศษ/.test(x.m) && /ค่าคอม/.test(x.m))));
    // เจ้าของแก้ค่าคอมในหน้าตั้งค่า
    app.editService('s2');
    env.document.getElementById('serv-type').value = 'service';
    env.document.getElementById('serv-commission').value = '30';
    env.document.getElementById('serv-commission-type').value = 'percent';
    env.document.getElementById('serv-duration').value = '60';
    await app.addService(); await settle(30);
    await t('[5.1] แก้ค่าคอมแล้วธงหาย', () => ok(svc('s2') && !svc('s2').priceInvalid && svc('s2').commission === 30, JSON.stringify(svc('s2'))));
    app.state.cart = [];
    app.addToCart('s2');
    await t('[5.2] หยิบใส่ตะกร้าได้อีกครั้ง', () => eq(app.state.cart.length, 1));
    env.dispose();
  }

  // ═══ [6] บิลปกติทุกรูปแบบยังขายได้ ═══
  {
    const { env, app } = await makeShop(); await settle();
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    let sold = 0, tried = 0, why = '';
    for (let it = 0; it < 120; it++) {
      app.vatEnabled = rnd() < 0.6; app.vatRate = [7, 10, 3][ri(0, 2)];
      const items = [];
      for (let i = 0, n = ri(1, 4); i < n; i++) {
        const prod = rnd() < 0.4, price = ri(1, 3000);
        const ct = prod ? 'fixed' : (rnd() < 0.5 ? 'percent' : 'fixed');
        items.push({ id: 'x' + i, name: 'i' + it + '_' + i, price, category: rnd() < 0.5 ? 'drinks' : 'barber', isProduct: prod,
          commission: ct === 'percent' ? ri(0, 100) : ri(0, price), commissionType: ct, duration: prod ? 0 : 30 });
      }
      const pay = ['cash', 'promptpay', 'credit', 'split'][ri(0, 3)];
      readyCheckout(env, items, pay, 10000000);
      const sub = items.reduce((a, b) => a + b.price, 0);
      env.document.getElementById('cart-discount').value = String(rnd() < 0.5 ? 0 : ri(0, sub - 1));
      app.beginCheckoutAttempt();
      env.document.getElementById('card-fee-custom').value = rnd() < 0.3 ? String(ri(0, 10)) : '';
      const total = app.getCartTotal();
      if (pay === 'split') { if (total < 2) continue; env.document.getElementById('split-cash-amount').value = String(ri(1, total - 1)); }
      tried++;
      if (await app.processCheckout()) sold++; else why = why || JSON.stringify({ pay, items });
      await settle(3);
    }
    await t(`[6.1] บิลปกติสุ่ม ${tried} ใบ ขายได้ทุกใบ`, () => ok(sold === tried, `${sold}/${tried} ${why}`));
    await t('[6.2] ทุกบิลผ่านตัวตรวจบิล', () => ok(app.state.transactions.every(tx => !app.validateBillRecord(tx).some(p => p.fatal))));
    env.dispose();
  }
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
