// Execute copies of the real PowerShell scripts with a fake Git function: never commit/push/rebase real Git.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { writeAppSkeleton } = require('./deploy_test_kit');
// ผลตรวจ 19 ต.ค. 2569 ข้อ 70: เดิมเก็บสำเนาชั่วคราว (~13.5 MB ต่อรอบ) ไว้ใน audit/ ของโปรเจกต์ทุกครั้งที่รัน ไม่เคยลบ
// ตอนนี้สร้างใต้โฟลเดอร์ชั่วคราวของระบบ และลบทิ้งใน finally (ลบได้เฉพาะโฟลเดอร์ที่เราสร้างเอง — ด่านเดียวกับ test_codex_deploy_20261013.js)
const root = path.resolve(__dirname, '..'), base = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-deploy-safety-'));
let passed = 0;
function scenario(name, script, settings) {
  const dir = fs.mkdtempSync(path.join(base, name + '-')); fs.mkdirSync(path.join(dir, 'tests')); fs.mkdirSync(path.join(dir, '.git'));
  for (const f of [script, 'app.js', 'sw.js']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  // ข้อ 13: สคริปต์ตรวจว่าไฟล์ที่ index.html/sw.js/manifest.json อ้างมีอยู่จริงและถูกติดตาม → วางโครงแอป + ตอบ git ls-files ด้วยรายชื่อนี้
  settings = Object.assign({ tracked: writeAppSkeleton(dir, root).concat([script, 'app.js']) }, settings);
  fs.writeFileSync(path.join(dir, 'tests/run-all.js'), 'process.exit(0);');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
  if (settings.lock) { fs.writeFileSync(path.join(dir, '.git/index.lock'), 'mock Git owner'); fs.utimesSync(path.join(dir, '.git/index.lock'), new Date(0), new Date(0)); }
  fs.writeFileSync(path.join(dir, 'invoke.ps1'), `
$ErrorActionPreference = 'Stop'
[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('th-TH')
$global:cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
$global:trace = Join-Path $PSScriptRoot 'trace.jsonl'
$global:staged = @($global:cfg.staged)
function git {
    $items = @($args | ForEach-Object { [string]$_ })
    Add-Content -LiteralPath $global:trace -Value (ConvertTo-Json -Compress -InputObject $items)
    $global:LASTEXITCODE = 0
    if ($items[0] -eq '-c') { $items = @($items | Select-Object -Skip 2) }
    switch ($items[0]) {
      'status' { return ' M app.js' }
      'diff' {
        if ($items -contains '--stat') { return 'app.js | 1 +' }
        if ($items -contains '--cached') { return (($global:staged | Where-Object { $_ }) -join [char]0) + [char]0 }
        return (($global:cfg.changed | Where-Object { $_ }) -join [char]0) + [char]0
      }
      'rev-list' { return '0' }
      'ls-files' { return ((@($global:cfg.tracked) | Where-Object { $_ }) -join [char]0) + [char]0 }
      'symbolic-ref' { return 'feature/review-fixes' }
      'rev-parse' { return 'origin/feature/review-fixes' }
      'fetch' { return }
      'log' { return }
      'branch' { if ($global:cfg.branchFail) { $global:LASTEXITCODE = 1 }; return }
      'add' { $global:staged = @('app.js', 'sw.js'); if ($global:cfg.injectStage) { $global:staged += 'personal.csv' }; return }
      'commit' { return }
      'push' { return }
      'rebase' { return }
      default { throw ('Unmocked Git command: ' + ($items -join ' ')) }
    }
}
function Read-Host { return $global:cfg.answer }
& (Join-Path $PSScriptRoot '${script}')
exit $LASTEXITCODE
`);
  let result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.error && result.error.code === 'ENOENT') {
    result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  }
  if (result.error) throw result.error;
  const commands = fs.existsSync(path.join(dir, 'trace.jsonl'))
    ? fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s.replace(/^\uFEFF/, ''))) : [];
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ status: result.status, commands, stdout: result.stdout, stderr: result.stderr }, null, 2));
  return { dir, ...result, commands };
}
function noMutation(r) { assert.equal(r.commands.some(a => ['add', 'commit', 'branch', 'push', 'rebase'].includes(a[0])), false); }
function check(name, fn) { fn(); passed++; console.log('PASS', name); }
// [ตรวจ 8 ต.ค. 2569 ข้อ 1] ไฟล์ที่ git ติดตามอยู่ทุกไฟล์ต้องอยู่ในรายการอนุญาตของทั้ง deploy.ps1 และ fix-push.ps1
// ไม่งั้นแก้ไฟล์นั้นเมื่อไหร่ deploy.bat หยุดที่ [1/6] "tracked change outside project allowlist" ทันที
// (เคยเกิดกับ วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md) · ไม่ต้องใช้ PowerShell — อ่านรายการจากสคริปต์ตรง ๆ แล้วใช้กติกาเดียวกับ
// Test-SafeNewPath / Is-Safe (ชื่อตรง หรืออยู่ใต้โฟลเดอร์ที่อนุญาต) · POS_GIT_ROOT ใช้ตอนพิสูจน์กับสำเนาโค้ดก่อนแก้ที่ไม่มี .git
function psAllowlist(file, varName) {
  const src = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const m = src.match(new RegExp('\\$' + varName + '\\s*=\\s*@\\(([\\s\\S]*?)\\)\\s*\\n'));
  assert.ok(m, `หา $${varName} ใน ${file} ไม่เจอ`);
  const list = [...m[1].replace(/#.*$/gm, '').matchAll(/'([^']+)'/g)].map(x => x[1]);
  assert.ok(list.length >= 10, `$${varName} ใน ${file} อ่านได้แค่ ${list.length} รายการ`);
  return list;
}
const psAllowed = (list, p) => list.some(s => p === s || p.startsWith(s + '/'));
function trackedPaths() {
  const gitRoot = process.env.POS_GIT_ROOT || root;
  const r = spawnSync('git', ['-C', gitRoot, '-c', 'core.quotepath=false', 'ls-files', '-z'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, 'git ls-files ล้มเหลว: ' + r.stderr);
  const files = r.stdout.split('\0').filter(Boolean);
  assert.ok(files.length >= 10, 'git ls-files คืนไฟล์น้อยผิดปกติ: ' + files.length);
  return files;
}
try {
  check('ข้อ1 ทุกไฟล์ที่ git ติดตาม (git ls-files) อยู่ใน $safeNewPaths ของ deploy.ps1 และ $safePaths ของ fix-push.ps1', () => {
    const deployList = psAllowlist('deploy.ps1', 'safeNewPaths'), fixList = psAllowlist('fix-push.ps1', 'safePaths');
    const files = trackedPaths();
    assert.ok(files.includes('วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md'), 'คู่มือฉุกเฉินต้องถูกติดตามอยู่ (เปิดจากเว็บได้)');
    const rootFiles = files.filter(f => !f.includes('/'));
    assert.deepEqual(rootFiles.filter(f => !psAllowed(deployList, f)), [], 'ไฟล์ที่ root ไม่อยู่ใน deploy.ps1 $safeNewPaths');
    assert.deepEqual(rootFiles.filter(f => !psAllowed(fixList, f)), [], 'ไฟล์ที่ root ไม่อยู่ใน fix-push.ps1 $safePaths');
    assert.deepEqual(files.filter(f => !psAllowed(deployList, f) || !psAllowed(fixList, f)), [], 'ไฟล์ในโฟลเดอร์ย่อยที่ไม่อยู่ในรายการ');
  });
  check('ข้อ1 คู่มือ/เอกสารไม่อยู่ใน $appPaths (ไม่บวกเลขแคชเพราะแก้เอกสาร)', () => {
    const src = fs.readFileSync(path.join(root, 'deploy.ps1'), 'utf8').replace(/\r/g, '');
    const m = src.match(/\$appPaths\s*=\s*@\(([^)]*)\)/);
    assert.ok(m, 'หา $appPaths ไม่เจอ');
    assert.equal(/วิธีกู้ข้อมูล|คู่มือ|\.md'/.test(m[1]), false, m[1]);
  });
  check('20 pre-staged private path stops before cache bump or Git mutation', () => {
    const r = scenario('pre-staged', 'deploy.ps1', { staged: ['personal-export.csv'], changed: ['app.js'] });
    assert.equal(r.status, 1); noMutation(r); assert.equal(fs.readFileSync(path.join(r.dir, 'sw.js'), 'utf8'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
  });
  check('20 rename source/delete outside allowlist is also rejected', () => {
    const r = scenario('rename', 'deploy.ps1', { staged: ['tests/safe.js', 'private/source.csv'], changed: ['app.js'] }); assert.equal(r.status, 1); noMutation(r);
  });
  check('20 tracked private changes are rejected before staging', () => {
    const r = scenario('tracked-private', 'deploy.ps1', { staged: [], changed: ['private.json'] }); assert.equal(r.status, 1); noMutation(r);
  });
  check('20 full index is validated again after staging', () => {
    const r = scenario('post-stage', 'deploy.ps1', { staged: [], changed: ['app.js'], injectStage: true });
    assert.equal(r.status, 1); assert.equal(r.commands.some(a => a[0] === 'add'), true); assert.equal(r.commands.some(a => ['commit', 'push'].includes(a[0])), false);
  });
  check('23 Thai locale emits the Gregorian Bangkok release date', () => {
    const r = scenario('thai-date', 'deploy.ps1', { staged: [], changed: ['app.js'] }); assert.equal(r.status, 0, r.stderr + r.stdout);
    const version = /const APP_VERSION = '[^']+\((\d{4}-\d{2}-\d{2})\)'/.exec(fs.readFileSync(path.join(r.dir, 'app.js'), 'utf8'))[1];
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = k => parts.find(p => p.type === k).value; assert.equal(version, `${get('year')}-${get('month')}-${get('day')}`);
  });
  check('24 even a very old Git lock is retained and blocks deploy', () => {
    const r = scenario('lock', 'deploy.ps1', { staged: [], changed: ['app.js'], lock: true }); assert.equal(r.status, 1); noMutation(r); assert.equal(fs.existsSync(path.join(r.dir, '.git/index.lock')), true);
  });
  check('21 declining repair leaves HEAD/index untouched', () => {
    const r = scenario('decline', 'fix-push.ps1', { staged: [], changed: ['app.js'], answer: 'n' }); assert.equal(r.status, 0, r.stderr); noMutation(r);
  });
  check('21 safety branch failure stops before staging/commit/rebase', () => {
    const r = scenario('branch-fail', 'fix-push.ps1', { staged: [], changed: ['app.js'], answer: 'y', branchFail: true });
    assert.equal(r.status, 1); assert.equal(r.commands.some(a => ['add', 'commit', 'rebase', 'push'].includes(a[0])), false);
  });
  check('21 repair stages allowed paths and follows the configured feature upstream', () => {
    const r = scenario('feature', 'fix-push.ps1', { staged: [], changed: ['app.js'], answer: 'y' }); assert.equal(r.status, 0, r.stderr + r.stdout);
    const add = r.commands.find(a => a[0] === 'add'); assert.equal(add[1], '-A'); assert.ok(!add.includes('.'));
    // PowerShell consumes -- when calling a function; the real native Git receives the literal separator.
    assert.ok(fs.readFileSync(path.join(root, 'fix-push.ps1'), 'utf8').includes('git add -A -- $stagePaths'));
    assert.deepEqual(r.commands.find(a => a[0] === 'rebase'), ['rebase', 'origin/feature/review-fixes']); assert.deepEqual(r.commands.find(a => a[0] === 'push'), ['push']);
    assert.ok(r.commands.findIndex(a => a[0] === 'branch') < r.commands.findIndex(a => a[0] === 'commit'));
  });
  console.log(`=== ผ่าน ${passed} · ไม่ผ่าน 0 ===`);
} catch (e) { console.error('FAIL', e.stack); process.exitCode = 1; }
finally {
  const resolved = path.resolve(base);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('pos-deploy-safety-')) throw new Error('Unsafe temp directory');
  fs.rmSync(resolved, { recursive: true, force: true });
}
