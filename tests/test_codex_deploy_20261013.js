// Execute the real scripts in both Windows PowerShell 5.1 and PowerShell 7.
// Git is a PowerShell function mock: no Git process or network operation runs.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { makeRunner, ok, eq } = require('./harness_db');
const { writeAppSkeleton } = require('./deploy_test_kit');
const R = makeRunner('--- Codex deploy compatibility ---');
const ROOT = path.resolve(__dirname, '..');
function run(shell, script, cfg) {
  const dir = fs.mkdtempSync(path.join(__dirname, 'codex-ps-'));
  try {
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.mkdirSync(path.join(dir, '.git'));
    for (const f of [script, 'sw.js', 'app.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    // ผลตรวจ 19 ต.ค. 2569 ข้อ 13: สคริปต์ตรวจไฟล์ที่แอปอ้างก่อน stage → วางโครงแอป + git ls-files จำลองตอบรายชื่อนี้
    cfg = Object.assign({ tracked: writeAppSkeleton(dir, ROOT).concat([script, 'app.js']) }, cfg);
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(cfg));
    fs.writeFileSync(path.join(dir, 'tests/run-all.js'), `
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
const countFile = path.join(dir, 'test-count.txt');
const n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0) + 1;
fs.writeFileSync(countFile, String(n));
fs.appendFileSync(path.join(dir, 'tests-trace.txt'), 'test ' + n + '\\n');
process.exit(cfg.failTest === n ? 1 : 0);
`);
    fs.writeFileSync(path.join(dir, 'invoke.ps1'), `
$ErrorActionPreference = 'Stop'
$global:cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
$global:trace = Join-Path $PSScriptRoot 'trace.jsonl'
$global:staged = @()
function git {
  $a = @($args | ForEach-Object { [string]$_ })
  Add-Content -LiteralPath $global:trace -Value (ConvertTo-Json -Compress -InputObject $a)
  $global:LASTEXITCODE = 0
  if ($a[0] -eq '-c') { $a = @($a | Select-Object -Skip 2) }
  switch ($a[0]) {
    'status' { return $global:cfg.status }
    'diff' {
      if ($a -contains '--stat') { return '' }
      if ($a -contains '--cached') { return ($global:staged -join [char]0) + [char]0 }
      if (($a | Where-Object { $_ -like '*..HEAD' }).Count -gt 0) { return ($global:cfg.ahead -join [char]0) + [char]0 }
      return [string][char]0
    }
    'rev-list' { return '2' }
    'ls-files' { return ((@($global:cfg.tracked) | Where-Object { $_ }) -join [char]0) + [char]0 }
    'symbolic-ref' { return 'main' }
    'rev-parse' { return 'origin/main' }
    'fetch' { return }
    'log' { return }
    'branch' { return }
    'add' { $global:staged = @('sw.js'); return }
    'commit' { return }
    'push' { return }
    'rebase' { return }
    default { throw ('Unmocked command: ' + ($a -join ' ')) }
  }
}
function Read-Host { return 'y' }
& (Join-Path $PSScriptRoot '${script}')
exit $LASTEXITCODE
`);
    const proc = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'invoke.ps1')],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    if (proc.error) throw proc.error;
    const trace = fs.existsSync(path.join(dir, 'trace.jsonl')) ? fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l.replace(/^\uFEFF/, ''))) : [];
    const ver = txt => Number(/jahn-pos-v(\d+)/.exec(txt)[1]);
    return { status: proc.status, output: proc.stdout + proc.stderr, trace,
      bumped: ver(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')) - ver(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')),
      tests: fs.existsSync(path.join(dir, 'test-count.txt')) ? Number(fs.readFileSync(path.join(dir, 'test-count.txt'), 'utf8')) : 0 };
  } finally {
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) !== path.resolve(__dirname) || !path.basename(resolved).startsWith('codex-ps-')) throw new Error('Unsafe temp directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
(async () => {
  const available = [];
  for (const shell of process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['powershell', 'pwsh']) {
    const probe = spawnSync(shell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (probe.error && probe.error.code === 'ENOENT') { console.log(`  SKIP ${shell}: not installed`); continue; }
    if (probe.error || probe.status !== 0) throw probe.error || new Error(probe.stderr);
    console.log(`  ${shell}: ${probe.stdout.trim()}`);
    available.push(shell);
  }
  if (!available.length) throw new Error('PowerShell is required for deploy verification');
  for (const shell of available) {
    for (const dirty of [[], [' M README.md'], [' M app.js']]) await R.t(`${shell}: deploy bumps pending app commit + dirty ${dirty.length ? dirty[0] : 'none'}`, () => {
      const r = run(shell, 'deploy.ps1', { status: dirty, ahead: ['app.js'] });
      eq(r.status, 0, r.output); eq(r.bumped, 1); eq(r.tests, 1);
      ok(r.trace.some(a => a[0] === 'push'));
    });
    await R.t(`${shell}: existing SW revision is retained`, () => {
      const r = run(shell, 'deploy.ps1', { status: [], ahead: ['app.js', 'sw.js'] });
      eq(r.status, 0, r.output); eq(r.bumped, 0);
    });
    await R.t(`${shell}: fix-push tests before commit and after rebase`, () => {
      const r = run(shell, 'fix-push.ps1', { status: [], ahead: ['app.js'] });
      eq(r.status, 0, r.output); eq(r.bumped, 1); eq(r.tests, 2);
      ok(r.trace.some(a => a[0] === 'push'));
    });
    for (const script of ['deploy.ps1', 'fix-push.ps1']) await R.t(`${shell}: ${script} stops before staging on failed tests`, () => {
      const r = run(shell, script, { status: [' M app.js'], ahead: ['app.js'], failTest: 1 });
      ok(r.status !== 0, r.output); eq(r.bumped, 0);
      ok(!r.trace.some(a => ['add', 'commit', 'push', 'rebase'].includes(a[0])));
    });
    await R.t(`${shell}: failed post-rebase tests prevent push`, () => {
      const r = run(shell, 'fix-push.ps1', { status: [], ahead: ['app.js'], failTest: 2 });
      ok(r.status !== 0, r.output); eq(r.tests, 2);
      ok(r.trace.some(a => a[0] === 'rebase') && !r.trace.some(a => a[0] === 'push'));
    });
  }
  R.done();
})().catch(e => { console.error(e); process.exit(1); });
