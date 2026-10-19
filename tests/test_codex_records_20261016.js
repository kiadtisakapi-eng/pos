const {makeShop,readyCheckout,quiet,loginAs,settle}=require('./fixtures_db');
const {makeRunner,eq,ok,createEnv}=require('./harness_db');
const R=makeRunner('--- แก้ตามผลตรวจ 16 ต.ค. 2569 (Codex): ข้อมูล/ชีต ---');
const only=(process.argv.find(a=>a.startsWith('--section='))||'').split('=')[1];
const run=(section,name,fn)=>!only||only===section?R.t(section+': '+name,fn):Promise.resolve();
const copy=x=>JSON.parse(JSON.stringify(x));
async function shop(fn,o){const s=await makeShop(o);try{await fn(s);}finally{s.env.dispose();}}
async function sale(s,note=''){s.app.vatEnabled=false;readyCheckout(s.env,undefined,'cash',300);s.env.document.getElementById('checkout-bill-note').value=note;ok(await s.app.processCheckout(),'sale');return s.app.state.transactions.at(-1);}
const rows=g=>g.sheetNames().filter(n=>/^\d{2}-\d{4}$/.test(n)).flatMap(n=>g.sheet(n)._grid.slice(1));
(async()=>{
  for(const lines of [[null],['x'],[5],[[]],[{}],[{price:999,netPrice:999,vatable:false},null]])await run('backend','reject malformed lines '+JSON.stringify(lines),()=>shop(async s=>{
    const tx=await sale(s);await s.app.syncPendingTransactions(true);const p=copy(s.app.buildBillPayload(tx));p.id+='-BAD';p.lines=lines;
    const count=rows(s.gas).length,v=s.gas.ctx.validateBillPayload_(p),r=s.gas.post(p);
    ok(!v.ok,'validator accepted');eq(r.status,'error','POST accepted');eq(rows(s.gas).length,count,'bad request wrote row');
  }));
  await run('backend','ordinary app bill and date-converted index remain valid',()=>shop(async s=>{
    const tx=await sale(s);await s.app.syncPendingTransactions(true);eq(tx.syncStatus,'synced');
    const index=s.gas.sheet('_POS_BILL_INDEX')._grid.find(r=>r[0]===tx.id);const[m,y]=String(index[1]).split('-').map(Number);index[1]=new Date(Date.UTC(y,m-1,1)-7*3600e3);
    tx.syncStatus='pending';await s.app.saveState();await s.app.syncPendingTransactions(true);eq(tx.syncStatus,'synced','month fix lost');
  }));
  for(const source of ['drawer','other'])for(const amount of [10000000,10000001])await run('limits',`expense ${source} ${amount}`,()=>shop(async s=>{
    for(const[id,v]of Object.entries({'expense-type':'supply','expense-source':source,'expense-amount':String(amount),'expense-note':'synthetic limit test'}))s.env.document.getElementById(id).value=v;
    await s.app.addExpense();eq(s.app.state.shift.expenses.length,amount===10000000?1:0,'expense boundary');
    if(amount>10000000)eq(s.env.document.getElementById('expense-amount').value,String(amount),'rejected form cleared');
  }));
  for(const mode of ['open','close'])for(const count of [10000,10001])await run('limits',`cash ${mode} 1000 x ${count}`,()=>shop(async s=>{
    if(mode==='open')s.app.state.shift.active=false;
    s.app.cashCounterMode=mode;const before=copy(s.app.state.shift);await s.app.confirmCashCount();
    if(count===10001)eq(JSON.stringify(s.app.state.shift),JSON.stringify(before),'over-limit count saved');
    else eq(s.app.state.shift.active,mode==='open','valid count refused');
  },{cash:{1000:count},rows:{googleSheetsUrl:'',googleSheetsApiToken:''}}));
  await run('limits','restore keeps rejecting oversized expense instead of raising its limit',()=>shop(async s=>{
    const b=copy(s.app.buildBackupPayload());b.shift.expenses=[{id:'exp-large',amount:10000001,type:'other',date:Date.now(),note:'synthetic',paidFrom:'other'}];
    s.app.sanitizeBackupData(b);eq(b.shift.expenses.length,0);ok((s.app._lastSanitizeQuarantine||[]).length>0,'oversized backup accepted');
  }));
  for(const via of ['list','claim'])for(const note of ['', 'ย'.repeat(205), 'หนึ่ง\nสอง', '<b>internal-note-marker</b>'])await run('notes',`${via} ${note?note.includes('<')?'HTML':note.includes('\n')?'newline':'long':'empty'} survives reload/backup`,()=>shop(async s=>{
    const tx=await sale(s,'initial');await s.app.syncPendingTransactions(true);const month=s.app.getBusinessMonthKey(tx.date),tab=s.gas.sheet(month),col=s.gas.ctx.billNoteColumn_(tab);
    tab._grid.find(r=>r[0]===tx.id)[col-1]=note;
    const key=s.gas.setupOwnerKey();let got;
    if(via==='list'){const r=s.gas.post({action:'list_bills',monthKey:month,ownerKey:key});eq(r.status,'success');got=r.details.bills.map(r=>({...r,month}));}
    else{const r=s.gas.post({action:'claim_primary',deviceId:'dev-'+'b'.repeat(32),ownerKey:key,bills:[]});eq(r.code,'PRIMARY_TRANSFER_INCOMPLETE','claim must report missing');got=r.details.missing;}
    const wanted=s.app.normalizeNote(note);if(wanted)eq(got[0].billNote,note,'backend transfer dropped raw note');
    s.app.state.transactions=[];await s.app.saveState();const ids=await s.app.addSheetOnlyBills(got);eq(ids.length,1,'add sheet bill');
    const fresh=createEnv({factory:s.env.factory});try{quiet(fresh.app);await fresh.app.loadState();loginAs(fresh.app,'owner');const t=fresh.app.state.transactions[0];eq(t.billNote||'',wanted,'reload lost note');eq(fresh.app.buildBackupPayload().transactions[0].billNote||'',wanted,'backup lost note');
      Object.getPrototypeOf(fresh.app).showThermalReceipt.call(fresh.app,t);ok(!fresh.document.getElementById('thermal-receipt-preview').innerHTML.includes('internal-note-marker'),'internal note printed');
    }finally{fresh.dispose();}
    await s.app.syncPendingTransactions(true);await s.app.flushCloudOutbox();
    const after=s.gas.post({action:'list_bills',monthKey:month,ownerKey:key});eq(after.details.bills[0].billNote||'',note,'sheet note changed');
  }));
  for(const id of ['bad id','เลขบิล123','bad.id','short','x'.repeat(65),' KEEP-00001','KEEP-00001 ',"BAD'ID",'KEEP-00001'])await run('ids',`restore ID ${JSON.stringify(id)}`,()=>shop(async s=>{
    await sale(s);const b=copy(s.app.buildBackupPayload());b.transactions[0].id=id;
    const valid=id==='KEEP-00001',problems=s.app.validateBillRecord(b.transactions[0]);eq(problems.some(p=>p.code==='bad-id'&&p.fatal),!valid,'bad-id fatal rule');
    s.gas.requests.length=0;await s.app.applyBackupData(b,{acceptUnsynced:true});await s.app.syncPendingTransactions(true);
    eq(s.app.state.transactions.some(t=>t.id===id),valid,'wrong restore inclusion');if(!valid){ok(s.app.state.quarantine.some(q=>q.id===id),'no quarantine');ok(!s.gas.requests.some(p=>p.id===id&&p.action==='transaction'),'invalid bill posted');}
  }));
  await run('ids','snapshot restore with checkIds:false remains available',()=>shop(async s=>{
    await sale(s);const before=copy(s.app.buildBackupPayload());await s.app.applyBackupData(copy(before),{checkIds:false,acceptUnsynced:true});eq(s.app.state.transactions.length,1);eq(s.app.state.transactions[0].id,before.transactions[0].id);
  }));
  await run('ids','existing INVALID_BILL_ID conflict stays intact on load; no automatic repair',()=>shop(async s=>{
    const tx=await sale(s);await s.app.syncPendingTransactions(true);await settle(40);
    s.app.syncPendingTransactions=async()=>{};s.app.resumePendingCloudWork=()=>{};
    tx.id='old bad id';tx.syncStatus='conflict';tx.syncIssue={code:'INVALID_BILL_ID',message:'synthetic existing conflict'};await s.app.saveState();
    eq((await s.env.db.state.get('transactions')).value[0].syncIssue.code,'INVALID_BILL_ID','control: conflict not persisted');
    const fresh=createEnv({factory:s.env.factory});try{quiet(fresh.app);await fresh.app.loadState();const old=fresh.app.state.transactions.find(t=>t.id==='old bad id');ok(old,'existing conflict removed');eq(old.syncIssue.code,'INVALID_BILL_ID');eq((fresh.app.state.quarantine||[]).length,0,'existing conflict automatically quarantined');}finally{fresh.dispose();}
  }));
  R.done();
})();
