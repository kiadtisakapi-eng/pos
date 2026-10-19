const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const {makeRunner,eq,ok}=require('./harness_db');
const R=makeRunner('--- แก้ตามผลตรวจ 16 ต.ค. 2569 (Codex): deploy/fuzz ---');
const root=path.resolve(__dirname,'..');
(async()=>{
  for(const name of ['deploy.bat','fix-push.bat','fix-push.ps1'])await R.t(`${name}: present, not ignored, included in both allowlists`,()=>{
    ok(fs.existsSync(path.join(root,name)),'required launcher absent');
    const gitContext=process.env.POS_GIT_DIR?['--git-dir',process.env.POS_GIT_DIR,'--work-tree',root]:[];
    const r=spawnSync('git',[...gitContext,'check-ignore','--no-index','-q','--',name],{cwd:root,windowsHide:true});eq(r.status,1,'launcher ignored');
    for(const tool of ['deploy.ps1','fix-push.ps1'])ok(fs.readFileSync(path.join(root,tool),'utf8').includes("'"+name+"'"),'allowlist missing '+tool);
  });
  await R.t('README provides direct PowerShell command and both scripts keep BOM',()=>{
    ok(fs.readFileSync(path.join(root,'README.md'),'utf8').includes('powershell -ExecutionPolicy Bypass -File deploy.ps1'),'direct command absent');
    for(const f of ['deploy.ps1','fix-push.ps1'])ok(fs.readFileSync(path.join(root,f)).subarray(0,3).equals(Buffer.from([239,187,191])),'BOM lost '+f);
  });
  for(const [name,args,fault]of [['fuzz_partial.js',['15102046','1','3'],'drawer'],['fuzz_money.js',['15102046','1','3'],'drawer'],['fuzz_checkout_a3.js',['2','15102046'],'checkout']])await R.t(`${name}: observable money mismatch exits nonzero`,()=>{
    const r=spawnSync(process.execPath,['--require',path.join(__dirname,'codex_fuzz_fault_20261016.cjs'),path.join(__dirname,name),...args],{cwd:root,env:{...process.env,TZ:'Asia/Bangkok',POS_FUZZ_FAULT:fault},windowsHide:true,encoding:'utf8',timeout:25000});
    eq(r.status,1,'false success / failed to run: '+String(r.stdout+r.stderr).slice(-450));
    ok(!r.error,'child did not finish');ok(!/MODULE_NOT_FOUND|SyntaxError/.test(r.stderr),'environment failure');
    ok(fault==='checkout'?/FAILURES [1-9]/.test(r.stdout):/1 runs, 1 with problems/.test(r.stdout),'runner did not report an observed invariant failure');
  });
  R.done();
})();
