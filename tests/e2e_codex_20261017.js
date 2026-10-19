// Real forms and password dialogs, synthetic accounts only; every external request is blocked.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let pass=0,fail=0;
const t=(name,yes)=>{console.log(`  ${yes?'PASS':'FAIL'} ${name}`);yes?pass++:fail++;};
const srv=http.createServer((q,r)=>{
  const f=path.resolve(root,'.'+decodeURIComponent(new URL(q.url,'http://localhost').pathname==='/'?'/index.html':new URL(q.url,'http://localhost').pathname));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){r.writeHead(404);return r.end();}
  r.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(r);
});
async function answer(p,pin){await p.waitForSelector('#modal-prompt.active');await p.fill('#prompt-modal-input',pin);await p.click('#btn-prompt-submit');}
async function pinFlow(p,method,duplicate,unique){
  await p.evaluate(async()=>{app.ownerPin=await app.hashPin('246810');app.state.staff[0].pin=await app.hashPin('111111');app.state.staff[1].pin=await app.hashPin('222222');});
  await p.evaluate(method=>{window.__pinDone=false;window.__pinResult=null;app[method](app.state.staff[1]).then(x=>{window.__pinDone=true;window.__pinResult=x;});},method);
  if(method==='changeOwnerPin')await answer(p,'246810');
  await answer(p,duplicate);await answer(p,duplicate);
  await p.waitForFunction(()=>window.__pinDone||document.getElementById('prompt-modal-title').textContent.includes('PIN นี้มีผู้ใช้แล้ว'));
  const refused=await p.evaluate(()=>!window.__pinDone&&document.getElementById('prompt-modal-title').textContent.includes('PIN นี้มีผู้ใช้แล้ว'));
  t(method+' refuses duplicate in password dialog',refused);
  if(refused){
    await answer(p,unique);await answer(p,unique);await p.waitForFunction(()=>window.__pinDone);
    t(method+' accepts unique PIN',await p.evaluate(()=>window.__pinResult===true));
  }
}
(async()=>{
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
  const executablePath=[process.env.POS_BROWSER_EXE,'C:/Program Files/Google/Chrome/Application/chrome.exe','/opt/pw-browsers/chromium'].find(p=>p&&fs.existsSync(p));
  const b=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
    const c=await b.newContext({viewport:{width:1180,height:820},hasTouch:true,serviceWorkers:'block'});
    await c.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});await p.waitForFunction(()=>window.app&&app.ownerPin&&app._writerDecided);
    await p.evaluate(async()=>{
      app.ownerPin=await app.hashPin('246810');app.googleSheetsUrl='';app.googleSheetsApiToken='';app.telegramToken='';
      app.state.staff=[{id:'s1',name:'Synthetic A',role:'Role',active:true,accessLevel:'staff',pin:await app.hashPin('111111')},
        {id:'s2',name:'Synthetic B',role:'Role',active:true,accessLevel:'manager',pin:await app.hashPin('222222')}];
      app.state.shift={active:true,startTime:Date.now()-60000,startCash:1000,startDetails:{1000:1},expenses:[],history:[]};
      await app.saveState();app.renderAll();app.requireLogin();
    });
    await p.click('#login-user-list [data-uid="__owner__"]');await p.fill('#login-pin-input','246810');await p.click('#modal-login button.primary');
    await p.waitForFunction(()=>app.currentRole==='owner');await p.click('.nav-item[data-screen="settings"]');
    for(const [name,pin,level]of [['Synthetic C','246810','manager'],['Synthetic D','222222','staff'],['Synthetic E','654321','manager']]){
      await p.click('#btn-add-staff');await p.fill('#staff-name',name);await p.fill('#staff-pin',pin);await p.selectOption('#staff-access-level',level);
      await p.click('#form-staff button[type="submit"]');await p.waitForTimeout(200);
      const saved=await p.evaluate(name=>app.state.staff.some(s=>s.name===name),name);
      t('staff form '+(pin==='654321'?'saves unique PIN':'refuses duplicate PIN '+level),saved===(pin==='654321'));
      await p.evaluate(()=>app.closeModal('modal-staff'));
    }
    await pinFlow(p,'changeOwnerPin','222222','345678');
    await pinFlow(p,'forceOwnerPinChange','222222','345678');
    await pinFlow(p,'forceStaffPinUpgrade','246810','456789');
    await p.evaluate(()=>{
      window.__pageOffsets=[];window.__failOlder=true;
      app.cloudPost=async(action,data)=>{
        if(action!=='list_backups')throw Error('unexpected action');
        window.__pageOffsets.push(data.offset||0);
        if(data.offset&&window.__failOlder)throw Error('offline');
        const offset=data.offset||0;
        return{status:'success',details:{total:225,nextOffset:offset===0?200:null,
          files:Array.from({length:offset===0?200:25},(_,i)=>({id:'file-'+(offset+i),name:'pos_backup_synthetic_'+(offset+i)+'.json',created:new Date(Date.now()-(offset+i)*60000).toISOString(),sizeKB:1}))}};
      };
      app.restoreFromDriveBackup=(id)=>{window.__selectedBackup=id;};
      app.openModal('modal-restore');
    });
    await p.evaluate(()=>app.loadDriveBackups());
    if(await p.locator('#restore-load-more').count()){
    t('pagination exposes older-page button',true);
    await p.locator('#restore-load-more').scrollIntoViewIfNeeded();await p.click('#restore-load-more');
    await p.waitForSelector('#restore-list [role="alert"]');
    t('older-page failure preserves 200 choices and retry button',await p.locator('#restore-list .restore-item').count()===200&&await p.locator('#restore-load-more').count()===1);
    await p.evaluate(()=>window.__failOlder=false);await p.click('#restore-load-more');await p.waitForFunction(()=>document.querySelectorAll('#restore-list .restore-item').length===225);
    t('pagination loads every file in order',await p.evaluate(()=>JSON.stringify([...document.querySelectorAll('#restore-list .restore-item')].map(x=>x.dataset.id))===JSON.stringify(Array.from({length:225},(_,i)=>'file-'+i))));
    for(const vp of [{width:1180,height:820},{width:768,height:1024},{width:390,height:844}]){
      await p.setViewportSize(vp);const last=p.locator('#restore-list .restore-item').last();await last.scrollIntoViewIfNeeded();
      t('restore list has no horizontal overflow '+vp.width,await p.evaluate(()=>{const e=document.querySelector('#modal-restore .modal-card');return e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;}));
      await last.click();t('oldest choice is clickable '+vp.width,await p.evaluate(()=>window.__selectedBackup==='file-224'));
      if(process.env.SHOT)await p.screenshot({path:'codex-20261017-restore-'+vp.width+'.png'});
    }
    }else t('pagination exposes older-page button',false);
    t('no browser exceptions',errors.length===0);await c.close();
  }finally{await b.close();await new Promise(r=>srv.close(r));}
  console.log(`\n=== ผ่าน ${pass} · ไม่ผ่าน ${fail} ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);srv.close();process.exit(1);});
