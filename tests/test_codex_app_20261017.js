const {makeShop, readyCheckout, settle} = require('./fixtures_db');
const {makeRunner, eq, ok, createEnv} = require('./harness_db');
const R=makeRunner('--- แก้ตามผลตรวจ 17 ต.ค. 2569: waive / PIN / settings ---');
async function shop(fn){const s=await makeShop({rows:{googleSheetsUrl:'',googleSheetsApiToken:''}});try{await fn(s);}finally{s.env.dispose();}}
async function waiver(s){
  const {app:a,env:e}=s;a.vatEnabled=false;
  readyCheckout(e,[{id:'s1',name:'Service',price:1077}],'cash',500);
  e.document.getElementById('cart-discount').value='577';a.beginCheckoutAttempt();await a.processCheckout();
  const tx=a.state.transactions.at(-1);
  for(const [disc,pay] of [[677,'cash'],[0,'promptpay']]){
    a.openTransactionEdit(tx.id);e.document.getElementById('edit-tx-discount').value=String(disc);e.document.getElementById('edit-tx-payment').value=pay;
    await a.saveTransactionEdit();if(disc===677)eq(await a.recordBillSettlement(tx.id,'moved','promptpay'),true);
  }
  return tx;
}
async function staffForm(s,pin,id=null){
  const d=s.env.document;s.app.state.editingStaffId=id;
  for(const[k,v]of Object.entries({'staff-name':'Synthetic account','staff-role':'Role','staff-access-level':'manager','staff-pin':pin}))d.getElementById(k).value=v;
  return s.app.addStaff();
}
(async()=>{
  await R.t('4 refund on another channel then waive settles, reloads, and exports',()=>shop(async s=>{
    const tx=await waiver(s);eq(await s.app.recordBillSettlement(tx.id,'waive'),true);
    eq(s.app.billMoneyStatus(tx).settled,true);eq(s.app.billMoneyStatus(tx).invalid,false);
    const data=JSON.parse(JSON.stringify(s.app.buildBackupPayload()));s.app.sanitizeBackupData(data);
    eq(s.app._lastSanitizeQuarantine.length,0);eq(s.app.billSettlementsValid(data.transactions[0]),true);
    await s.app.loadState();eq(s.app.billMoneyStatus(s.app.state.transactions[0]).settled,true);
  }));
  await R.t('4 forged large waive cannot hide a difference',()=>shop(async s=>{
    const tx=await waiver(s);const forged=JSON.parse(JSON.stringify(tx));
    forged.settlements.push({kind:'waive',method:'promptpay',amount:999999,at:Date.now(),by:'__owner__'});
    eq(s.app.billSettlementsValid(forged),false);
  }));
  await R.t('5 staff form refuses owner PIN without identifying the account',()=>shop(async s=>{
    const before=JSON.stringify(s.app.state.staff);await staffForm(s,'246810');eq(JSON.stringify(s.app.state.staff),before);
    ok(s.toasts.some(x=>/PIN.*ใช้.*แล้ว|PIN.*ซ้ำ/.test(x.m)));ok(!s.toasts.at(-1).m.includes('เจ้าของ'));
  }));
  await R.t('5 staff form refuses another staff PIN, including legacy plaintext',()=>shop(async s=>{
    s.app.state.staff[0].pin='456789';const count=s.app.state.staff.length;
    await staffForm(s,'456789');eq(s.app.state.staff.length,count);
  }));
  await R.t('5 unique PIN saves; own unchanged PIN and name edit both save',()=>shop(async s=>{
    await staffForm(s,'654321');const st=s.app.state.staff.at(-1);eq(st.pin,await s.app.hashPin('654321'));
    await staffForm(s,'654321',st.id);eq(st.pin,await s.app.hashPin('654321'));
    await staffForm(s,'',st.id);eq(st.name,'Synthetic account');
  }));
  for(const method of ['changeOwnerPin','forceOwnerPinChange','forceStaffPinUpgrade']){
    await R.t('5 '+method+' refuses duplicate, then accepts unique',()=>shop(async s=>{
      const a=s.app,st=a.state.staff[1],before=method==='forceStaffPinUpgrade'?st.pin:a.ownerPin;
      const duplicate=method==='forceStaffPinUpgrade'?'246810':'222222';
      const answers=(method==='changeOwnerPin'?['246810']:[]).concat([duplicate,duplicate,null]);
      a.askSecret=async()=>answers.length?answers.shift():null;
      eq(await a[method](st),false);eq(method==='forceStaffPinUpgrade'?st.pin:a.ownerPin,before);
      const unique=(method==='changeOwnerPin'?['246810']:[]).concat(['654321','654321']);
      a.askSecret=async()=>unique.length?unique.shift():null;
      eq(await a[method](st),true);eq(method==='forceStaffPinUpgrade'?st.pin:a.ownerPin,await a.hashPin('654321'));
    }));
  }
  await R.t('5 existing duplicate PINs survive save and reopen',()=>shop(async s=>{
    s.app.state.staff[0].pin=s.app.ownerPin;await s.app.saveState();await s.app.loadState();
    eq(s.app.state.staff[0].pin,s.app.ownerPin);
  }));
  const keys=['shopName','shopTagline','shopAddress','shopPhone','shopLogo','theme','shopPromptPayId','googleSheetsUrl','telegramChatId'];
  await R.t('8 every text setting rejects numbers/objects/arrays/null and reports it',()=>shop(async s=>{
    for(const bad of [812345678,{},[],null,false]){
      const p=JSON.parse(JSON.stringify(s.app.buildBackupPayload()));keys.forEach(k=>p[k]=bad);
      const audit=s.app.auditBackupData(p);eq(audit.badSettings,keys.length,'audit must report all text settings');
      s.app.sanitizeBackupData(p);keys.forEach(k=>ok(!Object.hasOwn(p,k),k+' not removed'));
    }
  }));
  await R.t('8 malformed restored settings keep local values and QR works',()=>shop(async s=>{
    const a=s.app,p=JSON.parse(JSON.stringify(a.buildBackupPayload()));p.shopPromptPayId=812345678;p.googleSheetsUrl={};p.telegramChatId={};
    const before=a.shopPromptPayId;await a.applyBackupData(p,{acceptUnsynced:true});
    eq(a.shopPromptPayId,before);eq(typeof a.googleSheetsUrl,'string');eq(typeof a.telegramChatId,'string');
    await a.loadState();eq(a.shopPromptPayId,before);a.generatePromptPayQR();
  }));
  await R.t('8 valid text settings and empty exact settings still roundtrip',()=>shop(async s=>{
    const p=JSON.parse(JSON.stringify(s.app.buildBackupPayload()));eq(s.app.auditBackupData(p).badSettings,0);
    s.app.sanitizeBackupData(p);eq(p.shopPromptPayId,'0812345678');
    p.shopPromptPayId='';p.telegramChatId='';p.googleSheetsUrl='';
    await s.app.applyBackupData(p,{acceptUnsynced:true,exactSettings:true});eq(s.app.shopPromptPayId,'');eq(s.app.telegramChatId,'');eq(s.app.googleSheetsUrl,'');
  }));
  R.done();
})().catch(e=>{console.error(e);process.exit(1);});
