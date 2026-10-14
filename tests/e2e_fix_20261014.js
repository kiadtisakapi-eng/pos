// ตรวจ 14 ต.ค. 2569 ข้อ 7 — ปุ่ม "เพิ่มลูกค้าด่วน" ในตะกร้าต้องอยู่ในการ์ดตะกร้าทั้งปุ่ม และแตะด้วยนิ้วได้จริง
//   เดิม: ช่องเลือกลูกค้ากว้างตามชื่อลูกค้าที่ยาวสุด ดันปุ่มออกนอก .pos-cart-panel (overflow:hidden)
//   iPad แนวนอน 1024/1180 มองไม่เห็นปุ่มเลย · 1366 เห็นครึ่งปุ่ม
//   ⚠️ ห้ามใช้ scrollIntoView/page.click(selector) วัด — มันเลื่อนกล่อง overflow:hidden ให้เองได้ แต่นิ้วผู้ใช้เลื่อนไม่ได้
//
//   node tests/e2e_fix_20261014.js
const { chromium } = require('playwright');
const ROOT = require('path').resolve(__dirname, '..');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
               '.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png' };
const srv = http.createServer((q,s)=>{ let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(ROOT,f); if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('');}
  s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(s); });

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==undefined?'  → '+JSON.stringify(x).slice(0,300):''));} };

const SIZES = [[768,1024],[820,1180],[1024,768],[1180,820],[1194,834],[1024,1366],[1366,1024]];

(async () => {
  await new Promise(r=>srv.listen(8151,r));
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
  console.log('\n[7] ปุ่มเพิ่มลูกค้าด่วนอยู่ในการ์ดตะกร้า · ลูกค้าชื่อยาว · iPad ทุกขนาด');
  for (const [w,h] of SIZES) {
    const c = await b.newContext({ viewport:{width:w,height:h}, hasTouch:true, serviceWorkers:'block' });
    const p = await c.newPage();
    await p.goto('http://localhost:8151/index.html', { waitUntil:'networkidle' });
    await p.waitForFunction(()=>window.app && app.state, null, {timeout:20000});
    await p.evaluate(async () => {
      app.state.staff = [{ id:'st-1', name:'มาลี รักงาม', role:'พนักงานนวด', active:true, accessLevel:'staff', pin:null }];
      app.state.categories = [{ id:'massage', name:'นวด', icon:'fa-spa', vat:false }];
      app.state.services = [{ id:'s1', name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส', price:1000, duration:120, category:'massage', commission:20, commissionType:'percent' }];
      // ลูกค้าจริงของร้านมีชื่อ + หมายเหตุยาว — ตัวเลือกยาวสุดเป็นตัวกำหนดความกว้างเดิมของช่อง
      app.state.customers = [
        { id:'c-1', name:'คุณอนันต์ วรรณกิจโสภณ', phone:'0812345678', visitCount:3 },
        { id:'c-2', name:'คุณประเสริฐศักดิ์ ธนวัฒน์ไพบูลย์กิจ (สมาชิก VIP ระดับแพลทินัม)', phone:'0811111111', visitCount:1 }];
      app.state.shift = { active:true, startTime:Date.now()-3600e3, startCash:0, startDetails:{}, expenses:[], history:[] };
      app.state.transactions = []; app.state.queue = []; app.state.cart = [];
      app.currentRole = 'owner'; app.currentUser = { id:'__owner__', name:'เจ้าของร้าน' };
      ['modal-login','modal-cash-counter'].forEach(m => app.closeModal(m));
      app.updateUserRoleUI();
      app.switchTab('pos');
      app.addToCart('s1');
    });
    await p.waitForTimeout(400);
    // เลื่อนหน้า (ที่นิ้วเลื่อนได้) ให้ปุ่มอยู่กลางจอ — ไม่แตะ scroll ของกล่องข้างใน
    const g = await p.evaluate(() => {
      const btn = document.getElementById('btn-add-customer-quick');
      const sel = document.getElementById('cart-customer-select');
      const panel = btn.closest('.pos-cart-panel');
      const r0 = btn.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r0.top - innerHeight / 2, behavior: 'instant' });
      const R = e => { const x = e.getBoundingClientRect(); return { l:Math.round(x.left), r:Math.round(x.right), t:Math.round(x.top), b:Math.round(x.bottom) }; };
      const br = R(btn), pr = R(panel), sr = R(sel);
      const cx = (br.l + br.r) / 2, cy = (br.t + br.b) / 2;
      const hit = (cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
      let scrolled = false; for (let e = btn.parentElement; e; e = e.parentElement) if (e.scrollLeft) scrolled = true;
      return { btn:br, panel:pr, sel:sr, cx, cy, onTop: !!hit && (hit === btn || btn.contains(hit)), scrolled };
    });
    const tag = `${w}×${h}`;
    t(`${tag}: ปุ่มเพิ่มลูกค้าด่วนอยู่ในการ์ดตะกร้าทั้งปุ่ม`, g.btn.l >= g.panel.l - 1 && g.btn.r <= g.panel.r + 1 && !g.scrolled, g);
    t(`${tag}: ช่องเลือกลูกค้าไม่ล้นการ์ดตะกร้า`, g.sel.r <= g.panel.r + 1, { sel:g.sel, panel:g.panel });
    t(`${tag}: ตรงกลางปุ่มไม่มีอะไรบัง`, g.onTop, g);
    if (g.onTop) {
      await p.mouse.click(g.cx, g.cy);   // แตะตรงพิกัดบนจอ — แบบนิ้ว ไม่ให้ playwright เลื่อนกล่องให้
      await p.waitForTimeout(300);
      t(`${tag}: แตะปุ่มแล้วหน้าต่างลงทะเบียนลูกค้าด่วนเปิด`,
        await p.evaluate(() => document.getElementById('modal-customer').classList.contains('active')));
    }
    await c.close();
  }
  await b.close(); srv.close();
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('❌ เทสต์ล้มกลางทาง: ' + (e && e.stack || e)); process.exit(1); });
