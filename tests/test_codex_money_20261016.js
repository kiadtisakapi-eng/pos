const {makeShop,readyCheckout,quiet,loginAs}=require('./fixtures_db');
const {createEnv,makeRunner,eq,ok}=require('./harness_db');
const R=makeRunner('--- แก้ตามผลตรวจ 16 ต.ค. 2569 (Codex): เงินส่วนต่าง ---');
const copy=x=>JSON.parse(JSON.stringify(x));
async function shop(fn){const s=await makeShop({rows:{googleSheetsUrl:'',googleSheetsApiToken:''}});try{await fn(s);}finally{s.env.dispose();}}
async function sale(s){s.app.vatEnabled=false;readyCheckout(s.env,undefined,'cash',300);ok(await s.app.processCheckout(),'sale');return s.app.state.transactions[0];}
async function edit(s,tx,d){s.app.openTransactionEdit(tx.id);s.env.document.getElementById('edit-tx-discount').value=String(d);await s.app.saveTransactionEdit();eq(tx.discount,d,'discount saved');}
const sequences={report:[[200,'promptpay'],[0,'cash'],[200,'promptpay']],fuzz:[[200,'promptpay'],[0,'cash'],[100,'waive'],[200,'waive']],small:[[100,'promptpay'],[0,'cash'],[100,'promptpay']]};
async function sequence(s,name){const tx=await sale(s);for(const[d,via]of sequences[name]){await edit(s,tx,d);ok(await s.app.recordBillSettlement(tx.id,via==='waive'?'waive':'moved',via==='waive'?undefined:via),'settlement saved');}return tx;}
async function voidBill(s,tx,outcome){
  if(outcome==='unknown')return s.app.withMutation('test unknown',()=>s.app._voidBillLocked(tx,{moneyOutcome:'unknown'}));
  s.env.document.getElementById('edit-tx-id').value=tx.id;s.env.document.getElementById('void-money-outcome').value=outcome;
  s.app._confirmP=null;await s.app.voidTransaction();if(s.app._confirmP)await s.app._confirmP;
}
(async()=>{
  if(process.argv.includes('--capture-historical')){
    const records=[];
    for(const name of ['report','fuzz'])await shop(async s=>{const tx=await sequence(s,name);records.push({name,tx:copy(tx),shift:copy(s.app.state.shift)});});
    require('fs').writeFileSync(require('path').join(__dirname,'fixtures_codex_money_20261016.json'),JSON.stringify(records,null,2)+'\n');
    return;
  }
  for(const record of require('./fixtures_codex_money_20261016.json'))await R.t(`historical v64 ${record.name}: read without rewriting existing records`,()=>shop(async s=>{
    const tx=copy(record.tx),before=JSON.stringify(tx);ok(s.app.billMoneyStatus(tx).settled,'old v64 history still invalid');
    ok(!s.app.validateBillRecord(tx).some(p=>p.code==='bad-settlement'),'validator rejects historical record');eq(JSON.stringify(tx),before,'historical record modified');
  }));
  for(const name of Object.keys(sequences))for(const outcome of ['refunded','none','unknown'])await R.t(`${name}: reload + backup/import + void ${outcome}`,()=>shop(async s=>{
    let tx=await sequence(s,name);const a=s.app;
    ok(!a.billMoneyStatus(tx).invalid,'generated history invalid');ok(a.billMoneyStatus(tx).settled,'not settled');
    ok(!a.validateBillRecord(tx).some(p=>p.code==='bad-settlement'),'validator rejects generated history');
    const history=JSON.stringify(tx.settlements);a.billMoneyStatus(tx);eq(JSON.stringify(tx.settlements),history,'reader changed old history');
    const reload=createEnv({factory:s.env.factory,storage:s.env.storage});try{quiet(reload.app);await reload.app.loadState();loginAs(reload.app,'owner');ok(!reload.app.billMoneyStatus(reload.app.state.transactions[0]).invalid,'reload invalid');}finally{reload.dispose();}
    const backup=copy(a.buildBackupPayload());ok(a.auditBackupData(backup).clean,'backup not clean');
    await a.applyBackupData(backup,{acceptUnsynced:true});tx=a.state.transactions[0];
    eq(JSON.stringify(tx.settlements),history,'restore rewrote history');ok(!a.billMoneyStatus(tx).invalid,'import invalid');
    const actual={cash:500,promptpay:name==='report'?-400:name==='small'?-200:-200,credit:0};
    if(name==='small')actual.cash=400;
    const net=Object.values(actual).reduce((a,b)=>a+b,0);eq(net,name==='small'?200:name==='fuzz'?300:100,'physical net');
    const before=1000+actual.cash;eq(a.computeShiftDrawer(a.state.shift).expected,before,'drawer before void');
    await voidBill(s,tx,outcome);eq(a.state.transactions.length,0,'void did not happen');
    if(outcome==='refunded')actual.cash-=net;
    eq(a.computeShiftDrawer(a.state.shift).expected,1000+actual.cash,'drawer vs physical cash after void');
    eq(actual.promptpay,name==='report'?-400:-200,'non-cash moved during cash void');
  }));
  for(const kind of ['refund','collect','correction','waive'])await R.t(`tampered ${kind} still rejected`,()=>shop(async s=>{
    const tx=await sale(s);tx.settlements=[{id:'bad',kind,method:'cash',amount:50000,at:Date.now(),due:[{method:'cash',amount:300}]}];
    ok(s.app.billMoneyStatus(tx).invalid,'tampered history accepted');ok(s.app.validateBillRecord(tx).some(p=>p.code==='bad-settlement'),'validator missed tamper');
  }));
  await R.t('swap must balance and stay within real movement budget, including inactive history',()=>shop(async s=>{
    const tx=await sale(s),base={kind:'waive',swap:true,via:'promptpay',at:1,due:[{method:'cash',amount:300}]};
    tx.settlements=[{...base,method:'cash',amount:-200},{...base,method:'promptpay',amount:100}];ok(s.app.billMoneyStatus(tx).invalid,'unbalanced swap accepted');
    tx.settlements=[{...base,method:'cash',amount:-500},{...base,method:'promptpay',amount:500}];ok(s.app.billMoneyStatus(tx).invalid,'oversized balanced swap accepted');
    tx.settlements.forEach(x=>x.supersededAt=2);ok(s.app.billMoneyStatus(tx).invalid,'inactive tamper ignored');
  }));
  await R.t('simulate candidate before save: invalid plan leaves all state untouched',()=>shop(async s=>{
    const tx=await sale(s);await edit(s,tx,100);const before=JSON.stringify({tx,shift:s.app.state.shift,log:s.app.state.editLog,outbox:s.app.state.cloudOutbox});
    const real=s.app.planSettlementEntries.bind(s.app);s.app.planSettlementEntries=(...args)=>{const p=real(...args);return p?{...p,entries:[{method:'cash',amount:50000}],swap:[]}:p;};
    eq(await s.app.recordBillSettlement(tx.id,'moved','cash'),false,'bad candidate saved');
    eq(JSON.stringify({tx,shift:s.app.state.shift,log:s.app.state.editLog,outbox:s.app.state.cloudOutbox}),before,'candidate mutated state');
    ok(s.toasts.some(x=>/ข้อมูลเงิน|ตรวจสอบ|ประวัติ/.test(x.m)),'no clear rejection');
  }));
  for(const outcome of ['refunded','none','unknown'])await R.t(`truly invalid bill void ${outcome}`,()=>shop(async s=>{
    const tx=await sale(s);tx.settlements=[{kind:'waive',method:'cash',amount:50000,at:Date.now()}];await s.app.saveState();
    const before=s.app.computeShiftDrawer(s.app.state.shift).expected;
    await voidBill(s,tx,outcome);
    eq(s.app.state.transactions.length,outcome==='refunded'?1:0,'invalid refund guard');eq(s.app.computeShiftDrawer(s.app.state.shift).expected,before,'invalid void changed physical drawer');
    if(outcome==='refunded'){
      eq(await s.app._voidBillLocked(tx,{moneyOutcome:'refunded'}),false,'direct invalid refund bypass');
      ok(s.toasts.some(x=>/เจ้าของ|ตรวจ/.test(x.m)),'no owner-check warning');
    }
  }));
  R.done();
})();
