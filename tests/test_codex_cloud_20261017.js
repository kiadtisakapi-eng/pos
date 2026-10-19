// Synthetic records only. No Google/Drive network; the real app and GAS run on local services.
const vm = require('vm');
const {makeShop, readyCheckout, settle, createGasEnv} = require('./fixtures_db');
const {makeRunner, eq, ok} = require('./harness_db');
const R = makeRunner('--- แก้ตามผลตรวจ 17 ต.ค. 2569: เดือน / outbox / Drive ---');
const real = (app, name) => Object.getPrototypeOf(app)[name].bind(app);
const rows = (g, m, id) => (g.sheet(m)?._grid || []).filter((r,i)=>i && r[0]===id);
async function legacyShop(date = '2026-07-01T01:30:00+07:00', dest = '07-2026') {
  const s = await makeShop(); await settle();
  s.env.ctx.__auditNow = Date.parse(date);
  vm.runInContext('Date = class extends Date { constructor(...a) { super(...(a.length ? a : [__auditNow])); } static now() { return __auditNow; } }', s.env.ctx);
  s.app.state.shift.startTime=Date.parse(date)-3600000;
  readyCheckout(s.env, [{id:'s1',name:'Service',price:500}], 'cash', 500);
  await s.app.processCheckout(); await s.app.syncPendingTransactions(true); await settle(25);
  const tx = s.app.state.transactions.at(-1);ok(tx,JSON.stringify(s.toasts.slice(-2)));
  const month = s.app.getBusinessMonthKey(tx.date);
  eq(rows(s.gas, month, tx.id).length, 1, 'sale uploaded');
  if (dest !== month) {
    const src=s.gas.sheet(month); let dst=s.gas.sheet(dest);
    if (!dst) { dst=s.gas.ss.insertSheet(dest); dst.appendRow(src._grid[0].slice()); }
    dst._grid.push(src._grid.splice(src._grid.findIndex(r=>r[0]===tx.id),1)[0]);
    s.gas.sheet('_POS_BILL_INDEX')._grid.find(r=>r[0]===tx.id)[1]=dest;
  }
  return Object.assign(s,{tx,month,dest});
}
function claim(s, extra={}) {
  return s.gas.post({action:'claim_primary',deviceId:'dev-'+'b'.repeat(32),ownerKey:s.gas.setupOwnerKey(),
    bills:s.app.transferBillsPayload(),voidIntents:s.app.pendingVoidIntents(),sheetOnly:s.app.transferSheetOnlyPayload(),...extra});
}
(async()=>{
  for (const [label,date,dest] of [
    ['normal','2026-07-01T01:30:00+07:00','06-2026'],
    ['legacy','2026-07-01T01:30:00+07:00','07-2026'],
    ['year boundary','2027-01-01T05:59:00+07:00','01-2027']]) {
    await R.t('3 claim '+label,async()=>{const s=await legacyShop(date,dest);try{eq(claim(s).status,'success');}finally{s.env.dispose();}});
  }
  await R.t('3 emergency release with legacy row',async()=>{
    const s=await legacyShop(); try {
      eq(claim(s,{emergency:true}).status,'success');
      eq(claim(s,{recoveryConfirmed:true}).status,'success');
      eq(s.gas.ctx.readPrimaryDevice_().recovery?.incomplete || false,false);
    } finally {s.env.dispose();}
  });
  await R.t('3 edit legacy row in place, then retry without duplicate',async()=>{
    const s=await legacyShop();try{
      s.app.openTransactionEdit(s.tx.id); s.env.document.getElementById('edit-tx-discount').value='100';
      await s.app.saveTransactionEdit(); await s.app.recordBillSettlement(s.tx.id,'waive');
      await s.app.syncPendingTransactions(true); await settle(30);
      eq(s.tx.syncStatus,'synced'); eq(rows(s.gas,s.dest,s.tx.id)[0][11],400);
      eq(rows(s.gas,s.month,s.tx.id).length,0);
      eq(s.gas.sheet('_POS_BILL_INDEX')._grid.find(r=>r[0]===s.tx.id)[1],s.dest,'index keeps physical tab');
      eq(s.gas.post(s.app.buildBillPayload(s.tx)).status,'success'); eq(rows(s.gas,s.dest,s.tx.id).length,1);
    }finally{s.env.dispose();}
  });
  for (const [date,dest] of [['2026-06-20T12:00:00+07:00','07-2026'],['2026-07-01T06:00:00+07:00','08-2026']]) {
    await R.t('3 reject unrelated wrong month '+date,async()=>{const s=await legacyShop(date,dest);try{
      eq(claim(s).code,'PRIMARY_TRANSFER_INCOMPLETE');
      eq(s.gas.post(s.app.buildBillPayload(s.tx)).code,'CROSS_MONTH_BILL_ID');
    }finally{s.env.dispose();}});
  }
  await R.t('3 duplicate across two tabs is rejected',async()=>{const s=await legacyShop();try{
    s.gas.sheet(s.month)._grid.push(rows(s.gas,s.dest,s.tx.id)[0].slice());
    eq(s.gas.post(s.app.buildBillPayload(s.tx)).code,'DUPLICATE_BILL_ID');
    eq(rows(s.gas,s.month,s.tx.id).length+rows(s.gas,s.dest,s.tx.id).length,2);
  }finally{s.env.dispose();}});
  await R.t('3 accepted-loss ledger normalizes Date month',async()=>{const s=await legacyShop('2026-07-02T12:00:00+07:00','07-2026');try{
    const g=s.gas, b=g.post({action:'list_bills',monthKey:s.month,ownerKey:g.setupOwnerKey()}).details.bills[0];
    const sh=g.ctx.ledgerSheet_(g.ctx.RECOVERY_ACCEPTED_NAME_,g.ctx.RECOVERY_ACCEPTED_HEADERS_,g.ss);
    sh.appendRow([s.tx.id,new Date('2026-07-01T00:00:00+07:00'),b.version,b.total,'missing',Date.now(),s.app.deviceId]);
    eq(g.ctx.readRecoveryAccepted_(g.ss)[s.tx.id].month,s.month);
    eq(g.post({action:'list_bills',monthKey:s.month,ownerKey:g.setupOwnerKey()}).details.bills[0].acceptedLoss,true);
  }finally{s.env.dispose();}});
  await R.t('6 one failure plus eight days still sends void on reopen',async()=>{
    const s=await makeShop();try{
      await settle();readyCheckout(s.env,[{id:'s1',name:'Service',price:300}],'cash',300);
      await s.app.processCheckout();await s.app.syncPendingTransactions(true);await settle(20);
      const tx=s.app.state.transactions.at(-1);s.gas.networkDown=true;
      s.app.openTransactionEdit(tx.id);s.env.document.getElementById('void-money-outcome').value='refunded';
      await s.app.voidTransaction();await s.app._confirmP;await s.app.flushCloudOutbox();
      const j=s.app.state.cloudOutbox.find(x=>x.needVoidDelete),r=j.retry.voidDelete;
      r.tries=1;r.firstFailAt=Date.now()-8*86400000;r.nextAt=0;await s.app.saveState();
      s.gas.networkDown=false;await s.app.resumePendingCloudWork();await settle(40);
      eq(rows(s.gas,s.app.getBusinessMonthKey(tx.date),tx.id).length,0);ok(!s.app.state.cloudOutbox.some(x=>x.needVoidDelete));
    }finally{s.env.dispose();}
  });
  await R.t('6 expiry requires ten failures AND seven days; stopped stays stopped',async()=>{const s=await makeShop();try{
    const now=Date.now(),expired=(tries,days,extra={})=>s.app.isCloudJobExpired({retry:{backup:{tries,firstFailAt:now-days*86400000,...extra}}},'backup',now);
    eq([expired(9,8),expired(10,6),expired(10,7),expired(10,8)],[false,false,false,true]);
    eq(expired(1,0,{stopped:'INVALID_SUMMARY'}),true);
    const job={id:'expired-test',needBackup:true,retry:{backup:{tries:10,firstFailAt:now-8*86400000}}};
    s.app.state.cloudOutbox=[job]; await s.app.saveState();
    await s.app.loadState();eq(s.app.expiredCloudJobs().length,1);
    await s.app.retryExpiredCloudJob(job.id);ok(!s.app.isCloudJobExpired(s.app.state.cloudOutbox[0],'backup'));
    ok(s.app.buildPendingCloudWorkSnapshot(),'snapshot still builds');
  }finally{s.env.dispose();}});
  await R.t('7 Drive pagination reaches every file in descending order',async()=>{
    let now=Date.now();const g=createGasEnv({now:()=>now}),folder=g.ctx.getBackupFolder_(true);
    const ids=[];for(let i=0;i<225;i++){now+=1000;ids.unshift(folder.createFile(g.ctx.BACKUP_FILE_PREFIX+i+'.json','{}','application/json').getId());}
    const first=g.post({action:'list_backups',ownerKey:g.setupOwnerKey()});eq(first.details.files.length,200);
    eq(first.details.nextOffset,200);eq(first.details.total,225);
    const last=g.post({action:'list_backups',ownerKey:g.setupOwnerKey(),offset:first.details.nextOffset});
    eq(last.details.nextOffset,null);eq([...first.details.files,...last.details.files].map(f=>f.id),ids);
  });
  await R.t('7 real restore-list method keeps older pages and retry after failure',async()=>{
    const s=await makeShop();try{
      const pages=[{files:[{id:'new',name:'new.json',created:new Date().toISOString()}],nextOffset:1,total:2},
        {files:[{id:'old',name:'old.json',created:new Date(Date.now()-86400000).toISOString()}],nextOffset:null,total:2}];
      const offsets=[];let fail=false;
      s.app.cloudPost=async(action,payload)=>{offsets.push(payload.offset||0);if(fail)throw Error('offline');return{status:'success',details:pages[payload.offset||0]};};
      await real(s.app,'loadDriveBackups')();let html=s.env.document.getElementById('restore-list').innerHTML;ok(html.includes('โหลดไฟล์เก่าเพิ่ม'));
      fail=true;await real(s.app,'loadDriveBackups')(true);html=s.env.document.getElementById('restore-list').innerHTML;ok(html.includes('new.json')&&html.includes('โหลดไฟล์เก่าเพิ่ม'));
      fail=false;await real(s.app,'loadDriveBackups')(true);html=s.env.document.getElementById('restore-list').innerHTML;
      ok(html.indexOf('new.json')<html.indexOf('old.json'));ok(!html.includes('โหลดไฟล์เก่าเพิ่ม'));eq(offsets,[0,1,1]);
    }finally{s.env.dispose();}
  });
  R.done();
})().catch(e=>{console.error(e);process.exit(1);});
