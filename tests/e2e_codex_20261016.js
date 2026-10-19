const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/codex-review-20261016');
fs.mkdirSync(out,{recursive:true});
let pass=0,fail=0;const t=(n,c)=>{console.log(`  ${c?'PASS':'FAIL'} ${n}`);c?pass++:fail++;};
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
async function shop(browser,port){
  const c=await browser.newContext({viewport:{width:1180,height:900},hasTouch:true});
  await c.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});await p.waitForFunction(()=>window.app&&app.ownerPin&&app._writerDecided);
  await p.evaluate(async()=>{
    app.ownerPin=await app.hashPin('246810');app.googleSheetsUrl='';app.googleSheetsApiToken='';app.telegramToken='';app.telegramChatId='';app.vatEnabled=false;
    app.state.staff=[{id:'audit-staff',name:'Synthetic staff',role:'ช่างตัดผม',active:true,accessLevel:'staff'}];
    app.state.categories=[{id:'barber',name:'บริการ',icon:'fa-scissors',vat:false}];
    app.state.services=[{id:'audit-service',name:'Synthetic service',price:300,duration:30,category:'barber',commission:10,commissionType:'percent'}];
    app.state.transactions=[];app.state.cart=[];app.state.queue=[];app.state.voidLog=[];app.state.editLog=[];app.state.cloudOutbox=[];
    app.state.shift={active:true,startTime:Date.now()-60000,startCash:1000,startDetails:{1000:1},expenses:[],history:[]};
    await app.saveState();app.renderAll();app.requireLogin();
  });
  await login(p);return{c,p,errors};
}
async function login(p){await p.click('#login-user-list [data-uid="__owner__"]');await p.fill('#login-pin-input','246810');await p.click('#modal-login button.primary');await p.waitForFunction(()=>app.currentRole==='owner'&&!document.getElementById('modal-login').classList.contains('active'));}
async function sale(p,note='',received=300){
  await p.evaluate(()=>app.switchTab('pos'));await p.click('.service-card');await p.selectOption('.cart-item-staff select','audit-staff');await p.click('#btn-checkout');await p.click('#pay-cash-btn');await p.fill('#cash-received',String(received));await p.fill('#checkout-bill-note',note);await p.click('#btn-complete-checkout');await p.waitForSelector('#modal-receipt.active');
  t('receipt excludes internal note',!(await p.locator('#thermal-receipt-preview').innerText()).includes('PRIVATE_NOTE'));
  await p.click('#modal-receipt .modal-close');
}
async function edit(p,discount){
  await p.evaluate(()=>app.switchTab('reports'));await p.click('#report-transactions-body button[onclick*="openTransactionEdit"]');await p.fill('#edit-tx-discount',String(discount));await p.click('#btn-save-tx-edit');await p.waitForFunction(d=>app.state.transactions[0].discount===d,discount);
  if(!(await p.locator('#modal-edit-transaction').evaluate(el=>el.classList.contains('active'))))await p.click('#report-transactions-body button[onclick*="openTransactionEdit"]');
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const candidates=[process.env.POS_BROWSER_EXE,'C:/Program Files/Google/Chrome/Application/chrome.exe','/opt/pw-browsers/chromium'];
  const executablePath=candidates.find(p=>p&&fs.existsSync(p));const b=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
    for(const name of ['report','fuzz']){
      const{c,p,errors}=await shop(b,port);
      try{
        await sale(p,'PRIVATE_NOTE <b>internal</b>');
        const seq=name==='report'?[[200,'promptpay'],[0,'cash'],[200,'promptpay']]:[[200,'promptpay'],[0,'cash'],[100,'waive'],[200,'waive']];
        for(const[discount,via]of seq){await edit(p,discount);await p.click(`[data-settle="${via==='waive'?'waive':'moved-'+via}"]`);await p.click('#btn-confirm-yes');await p.waitForFunction(()=>app.billMoneyStatus(app.state.transactions[0]).settled,null,{timeout:3000}).catch(()=>{});
          t(`${name}: discount ${discount} stays valid and settled`,await p.evaluate(()=>app.billMoneyStatus(app.state.transactions[0]).settled&&!app.billMoneyStatus(app.state.transactions[0]).invalid));await p.click('#btn-close-tx-edit');}
        await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>window.app&&app.ownerPin);await login(p);
        t(`${name}: reload keeps history valid`,await p.evaluate(()=>app.billMoneyStatus(app.state.transactions[0]).settled));
        await p.evaluate(()=>app.switchTab('reports'));await p.click('#report-transactions-body button[onclick*="openTransactionEdit"]');
        await p.waitForFunction(()=>!document.querySelector('#toast-container > *'));await p.locator('#edit-tx-money-box').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`money-fixed-${name}.png`)});
        await p.selectOption('#void-money-outcome','refunded');await p.fill('#void-note','Synthetic void test');
        await p.click('#modal-edit-transaction button[onclick="app.voidTransaction()"]');await p.click('#btn-confirm-yes');await p.waitForFunction(()=>app.state.transactions.length===0);
        const expected=name==='report'?1400:1200;t(`${name}: refund drawer matches physical cash ${expected}`,await p.evaluate(want=>app.computeShiftDrawer(app.state.shift).expected===want,expected));
        t(`${name}: no page errors`,errors.length===0);
      }finally{await c.close();}
    }
    const{c,p}=await shop(b,port);try{
      await p.evaluate(()=>app.switchTab('dashboard'));
      for(const source of ['drawer','other']){await p.selectOption('#expense-type','supply');await p.selectOption('#expense-source',source);await p.fill('#expense-amount','10000001');await p.fill('#expense-note','Synthetic limit');await p.click('#form-add-expense button[type="submit"]');
        t(`expense ${source}: oversized entry refused and form preserved`,await p.evaluate(()=>app.state.shift.expenses.length===0&&document.getElementById('expense-amount').value==='10000001'));}
      await p.evaluate(()=>{app.state.services[0].name='constructor';});await sale(p);
      await p.evaluate(()=>app.switchTab('dashboard'));
      t('constructor: actual dashboard count and chart remain correct',await p.locator('#dashboard-popular-services').evaluate(el=>el.innerText.includes('1 ครั้ง')&&!el.innerHTML.includes('NaN')));
      await p.evaluate(()=>app.switchTab('reports'));await p.selectOption('#report-staff-filter','audit-staff');
      t('constructor: actual staff report keeps sales',await p.locator('#report-kpi-total').innerText()==='฿300.00');
      await p.evaluate(()=>{app.state.services[0].name='__proto__';});await sale(p);await p.evaluate(()=>app.switchTab('dashboard'));
      t('__proto__: actual dashboard retains service without prototype pollution',await p.locator('#dashboard-popular-services').evaluate(el=>el.innerText.includes('__proto__')&&!el.innerHTML.includes('NaN')&&Object.prototype.count===undefined));
      await p.evaluate(()=>{app.vatEnabled=true;app.vatRate=7;app.state.categories[0].vat=true;});await sale(p,'',321);
      const vatTxId=await p.evaluate(async()=>{const tx=app.state.transactions.at(-1);delete tx.vatRate;await app.saveState();app.switchTab('reports');return tx.id;});
      await p.selectOption('#report-staff-filter','all');await p.locator(`#report-transactions-body button[onclick="app.viewHistoricalReceipt('${vatTxId}')"]`).click();
      const receiptText=await p.locator('#thermal-receipt-preview').innerText();
      t('historical receipt without rate still shows VAT 7%',receiptText.includes(vatTxId)&&receiptText.includes('VAT 7%'));
      await p.click('#modal-receipt .modal-close');
      await p.waitForFunction(()=>!document.querySelector('#toast-container > *'),null,{timeout:15000});
      await p.evaluate(()=>{app.switchTab('settings');app.openCategoryModal();});await p.fill('#cat-name','Synthetic draft');const focus=[];
      for(let i=0;i<30;i++){await p.keyboard.press('Tab');focus.push(await p.evaluate(()=>({id:document.activeElement.id,inModal:!!document.activeElement.closest('#modal-category')})));if(focus.at(-1).id==='btn-lock-sidebar')break;}
      let lockedByBackgroundButton=false;if(focus.at(-1).id==='btn-lock-sidebar'){await p.keyboard.press('Enter');lockedByBackgroundButton=await p.evaluate(()=>document.getElementById('modal-login').classList.contains('active')&&!document.getElementById('modal-category').classList.contains('active'));}
      fs.writeFileSync(path.join(out,'deferred-focus.json'),JSON.stringify({deferred:true,focusEscaped:focus.some(x=>!x.inModal),lockedByBackgroundButton,focus},null,2)+'\n');
    }finally{await c.close();}
  }finally{await b.close();await new Promise(r=>server.close(r));}
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
