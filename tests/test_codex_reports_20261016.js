const vm=require('vm');
const {makeShop,readyCheckout}=require('./fixtures_db');
const {makeRunner,eq,ok}=require('./harness_db');
const R=makeRunner('--- แก้ตามผลตรวจ 16 ต.ค. 2569 (Codex): รายงาน ---');
async function shop(fn){const s=await makeShop({rows:{googleSheetsUrl:'',googleSheetsApiToken:''}});try{await fn(s);}finally{s.env.dispose();}}
const render=(s,name,...args)=>Object.getPrototypeOf(s.app)[name].call(s.app,...args);
function filter(s,staff='all'){s.env.document.getElementById('report-date-input').value=s.app.currentBusinessDateKey();s.env.document.getElementById('report-staff-filter').value=staff;render(s,'filterReports');}
(async()=>{
  for(const name of ['constructor','toString','__proto__','hasOwnProperty','valueOf','บริการทั่วไป'])await R.t(`service ${name}: dashboard and both report modes`,()=>shop(async s=>{
    s.app.vatEnabled=false;readyCheckout(s.env,[{id:'s1',name,price:300},{id:'s2',name,price:300},{id:'s3',name:'บริการควบคุม',price:300}],'cash',900);ok(await s.app.processCheckout(),'sale');
    render(s,'renderDashboard');const html=s.env.document.getElementById('dashboard-popular-services').innerHTML;
    ok(html.includes(name),'popular service lost');ok(html.includes('2 ครั้ง'),'wrong dashboard count');ok(!/NaN/.test(html),'NaN chart');
    filter(s);eq(s.env.document.getElementById('report-kpi-popular').innerText,name,'wrong popular service');
    ok(s.env.document.getElementById('report-services-breakdown-body').innerHTML.includes(name),'breakdown lost service');
    filter(s,'st-1');eq(s.env.document.getElementById('report-kpi-total').innerText,'฿900.00','staff total lost');
    eq(vm.runInContext('Object.prototype.count',s.env.ctx),undefined,'prototype polluted');
  }));
  await R.t('restored __proto__ staff ID keeps commission in report and cloud summary',()=>shop(async s=>{
    s.app.vatEnabled=false;s.app.state.staff[0].id='__proto__';readyCheckout(s.env,[{id:'s1',name:'บริการทดสอบ',price:300,staffId:'__proto__',staffName:'Synthetic staff'}],'cash',300);ok(await s.app.processCheckout(),'sale');
    const b=JSON.parse(JSON.stringify(s.app.buildBackupPayload()));await s.app.applyBackupData(b,{acceptUnsynced:true});
    filter(s,'__proto__');ok(s.env.document.getElementById('report-commission-body').innerHTML.includes('฿30.00'),'staff commission missing');
    const p=s.app.buildSummaryPayload(s.app.state.transactions,[],'day',s.app.currentBusinessDateKey());eq(p.staffCommissions.length,1,'summary staff disappeared');eq(p.staffCommissions[0].commission,30,'summary commission wrong');
    eq(vm.runInContext('Object.prototype.count',s.env.ctx),undefined,'prototype polluted');
  }));
  await R.t('missing historical VAT rate and modern VAT share a single 7% category row',()=>shop(async s=>{
    for(const price of [100,200]){readyCheckout(s.env,[{id:'d1',name:'สินค้า VAT',price,category:'drinks',isProduct:true,commission:0,staffId:'',staffName:''}]);ok(await s.app.processCheckout(),'sale');}
    delete s.app.state.transactions[0].vatRate;const sum=s.app.buildVatSummary(s.app.state.transactions);
    eq(sum.vatRate,7,'summary rate');eq(sum.categories.length,1,'same category split into 0% and 7%');eq(sum.categories[0].rate,7);eq(sum.vatAmount,21);
    render(s,'showThermalReceipt',s.app.state.transactions[0]);ok(s.env.document.getElementById('thermal-receipt-preview').innerHTML.includes('VAT 7%'),'reprinted receipt rate wrong');
  }));
  await R.t('non-VAT bill keeps zero tax without a rate field',()=>shop(async s=>{
    s.app.vatEnabled=false;readyCheckout(s.env);ok(await s.app.processCheckout());const tx=s.app.state.transactions[0];delete tx.vatRate;
    const sum=s.app.buildVatSummary([tx]);eq(sum.vatAmount,0);eq(sum.categories.length,0);eq(sum.nonVatBase,300);eq(sum.vatRate,0);
  }));
  R.done();
})();
