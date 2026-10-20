// ตรวจซ้ำรอบ 2 (18 ต.ค. 2569) — 5 ช่องที่ Codex เจอหลังงานแก้ F01–F11 ของ Claude (C01–C05)
// ทุกข้อรันกับโค้ดก่อนแก้รอบ 2 แล้วตก (ยกเว้นกรณีควบคุมที่ต้องผ่านทั้งก่อน/หลัง) · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ
// C02/C04 ใช้ Git จริงใน temp directory (ไม่มี remote ไม่ push) + Git จำลองสำหรับสคริปต์เต็ม · ข้ามเมื่อไม่มี PowerShell/Git
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { makeShop, readyCheckout, quiet, loginAs } = require('./fixtures_db');
const { makeRunner, eq, ok, createEnv, failPutForKeys } = require('./harness_db');
const { createGasEnv } = require('./gas_env');
const { writeAppSkeleton } = require('./deploy_test_kit');
const R = makeRunner('--- Claude ตรวจซ้ำรอบ 2: C01–C05 (18 ต.ค. 2569) ---');
const ROOT = path.resolve(__dirname, '..');
const NO_CLOUD = { googleSheetsUrl: '', googleSheetsApiToken: '' };

async function sell(s, price) {
  s.app.vatEnabled = false;
  readyCheckout(s.env, [{ id: 's1', name: 'Synthetic', price }], 'cash', price);
  return s.app.processCheckout();
}
// หน้าต่างที่สองบนเครื่องเดียวกัน (IndexedDB เดียวกัน) — locks ไม่ส่ง = เบราว์เซอร์ไม่มี Web Locks
async function secondWindow(A, locks) {
  const env = createEnv({ factory: A.env.factory, locks });
  quiet(env.app); await env.app.loadState(); loginAs(env.app, 'owner');
  return { env, app: env.app };
}
async function changePin(app, cur, next) {
  const answers = [cur, next, next];
  app.askSecret = async () => answers.shift();
  return app.changeOwnerPin();
}

(async () => {
  // ── C01: เขียนบางคีย์ (PIN) ต้องร่วมด่านรุ่นข้อมูล ──
  await R.t('C01 B เปลี่ยน PIN เจ้าของ → A (ข้อมูลเก่า) ขาย: PIN ใหม่ไม่ถูกเขียนกลับ · A ถูกปฏิเสธและพัก · บิลไม่ลงครึ่ง ๆ', async () => {
    const A = await makeShop({ rows: NO_CLOUD }); const B = await secondWindow(A);
    try {
      const oldPin = await A.env.raw('ownerPin');
      eq(await changePin(B.app, '246810', '975310'), true);
      const newPin = await A.env.raw('ownerPin');
      ok(newPin !== oldPin, 'PIN ต้องเปลี่ยนในเครื่องก่อน');
      const r = await sell(A, 300);
      eq(await A.env.raw('ownerPin'), newPin, 'PIN เก่าถูกเขียนกลับทับ');
      ok(r !== true, 'A ต้องไม่ขึ้นขายสำเร็จ');
      eq(!!A.app.isReadOnlyWindow, true);
      eq((await A.env.raw('transactions')).length, 0);
      eq(A.app.state.transactions.length, 0, 'A ต้อง rollback ในหน่วยความจำ');
      // A โหลดใหม่แล้วขายได้ ไม่ทับ PIN
      await A.app.takeOverAsWriter();
      eq(A.app.ownerPin, newPin);
      await sell(A, 300);
      eq((await A.env.raw('transactions')).map(t => t.total), [300]);
      eq(await A.env.raw('ownerPin'), newPin);
    } finally { B.env.dispose(); A.env.dispose(); }
  });
  await R.t('C01 สองหน้าต่างเปลี่ยน PIN ทับกัน: ครั้งที่สองถูกปฏิเสธ ไม่เงียบ · PIN ในเครื่อง = ของคนแรก', async () => {
    const A = await makeShop({ rows: NO_CLOUD }); const B = await secondWindow(A);
    try {
      eq(await changePin(B.app, '246810', '975310'), true);
      const first = await A.env.raw('ownerPin');
      eq(await changePin(A.app, '246810', '864200'), false);
      eq(await A.env.raw('ownerPin'), first);
      eq(!!A.app.isReadOnlyWindow, true);
      ok(A.toasts.some(t => /อ่านอย่างเดียว/.test(t.m)), 'ต้องบอกผู้ใช้');
    } finally { B.env.dispose(); A.env.dispose(); }
  });
  await R.t('C01 เปลี่ยน PIN แล้ว IndexedDB เขียนไม่ผ่าน: PIN/เลขรุ่นไม่เปลี่ยนครึ่งชุด · ไม่แจ้งสำเร็จ · บันทึกครั้งต่อไปได้', () => (async () => {
    const s = await makeShop({ rows: NO_CLOUD });
    try {
      await s.app.saveState();
      const pin0 = await s.env.raw('ownerPin'), rev0 = await s.env.raw('stateRevision'), mem0 = s.app.ownerPin;
      const restore = failPutForKeys(['ownerPin']);
      let r; try { r = await changePin(s.app, '246810', '975310'); } finally { restore(); }
      eq(r, false);
      eq(await s.env.raw('ownerPin'), pin0); eq(await s.env.raw('stateRevision'), rev0); eq(s.app.ownerPin, mem0);
      ok(!s.toasts.some(t => /สำเร็จ|เปลี่ยน PIN.*แล้ว/.test(t.m) && t.ty === 'success'), 'ห้ามแจ้งสำเร็จ');
      await sell(s, 200);
      eq((await s.env.raw('transactions')).map(t => t.total), [200]);
      eq(!!s.app.isReadOnlyWindow, false);
    } finally { s.env.dispose(); }
  })());
  await R.t('C01 หน้าต่างเดียว: เปลี่ยน PIN → ขาย → เปลี่ยนธีม → ขาย ต่อเนื่อง ไม่ถูกปฏิเสธผิด ๆ · บิล/กะ/outbox ครบ', () => (async () => {
    const s = await makeShop({ rows: NO_CLOUD });
    try {
      eq(await changePin(s.app, '246810', '975310'), true);
      await sell(s, 100);
      const P = Object.getPrototypeOf(s.app);
      if (typeof P.setTheme === 'function') await P.setTheme.call(s.app, 'dark');
      else eq(await s.app.saveKeys([{ key: 'theme', value: 'dark' }]), true);
      await s.app._mutationChain;
      await sell(s, 200);
      eq(!!s.app.isReadOnlyWindow, false);
      eq((await s.env.raw('transactions')).map(t => t.total), [100, 200]);
      eq(await s.env.raw('ownerPin'), await s.app.hashPin('975310'));
      eq((await s.env.raw('shift')).active, true);
    } finally { s.env.dispose(); }
  })());

  // ── C03: shiftCash ว่าง / ผิดชนิด ──
  const base = () => ({ action: 'summary_day', dateKey: '2026-10-18', generatedAt: Date.now(), totalRevenue: 100, totalExpenses: 0, billCount: 1,
    cashRevenue: 100, qrRevenue: 0, creditRevenue: 0, nonVatBase: 100, vatableBase: 0, vatAmount: 0, rounding: 0 });
  await R.t('C03 shiftCash ว่างแต่ยอดกะขัดกัน / ผิดชนิด → INVALID_SUMMARY ก่อนเขียนชีต', () => {
    for (const extra of [{ shiftCount: 1, cashVariance: -999, shiftCash: [] }, { shiftCount: 2, cashVariance: 0, shiftCash: [] },
      { shiftCount: 1, cashVariance: 0, shiftCash: 'not-an-array' }, { shiftCount: 0, cashVariance: 5, shiftCash: [] }]) {
      const g = createGasEnv(); const r = g.post(Object.assign(base(), extra));
      eq([JSON.stringify(extra), r.status, r.code], [JSON.stringify(extra), 'error', 'INVALID_SUMMARY'], r.message);
      ok(!g.sheet('สรุปรายเดือน') || g.sheet('สรุปรายเดือน').getLastRow() <= 1, 'ห้ามเขียนแถว master');
    }
  });
  await R.t('C03 control: 0 กะ variance 0 · payload รุ่นก่อนมีตารางกะ (ไม่ส่งช่อง) · overspend ที่รวมตรง → ผ่าน', () => {
    eq(createGasEnv().post(Object.assign(base(), { shiftCount: 0, cashVariance: 0, shiftCash: [] })).status, 'success');
    eq(createGasEnv().post(Object.assign(base(), { shiftCount: 1, cashVariance: 0 })).status, 'success');
    eq(createGasEnv().post(base()).status, 'success');
    const over = { startTime: Date.now() - 1e4, endTime: Date.now(), expected: 0, counted: 0, difference: -50, overspend: 50, startCash: 0, cashSales: 0, expenses: 50 };
    eq(createGasEnv().post(Object.assign(base(), { shiftCount: 1, cashVariance: -50, shiftCash: [over] })).status, 'success');
  });

  // ── C05: ปุ่มรับสิทธิ์หน้าต่างเมื่อ Web Locks ใช้ไม่ได้ ──
  const lockModes = {
    absent: undefined,
    throws: { request() { throw new Error('SecurityError (synthetic)'); } },
    rejects: { request() { return Promise.reject(new Error('AbortError (synthetic)')); } },
    granted: { request(name, opts, cb) { return Promise.resolve(cb({ name })); } },
  };
  for (const mode of Object.keys(lockModes)) {
    await R.t(`C05 Web Locks ${mode}: B ถูกพักแล้วกดปุ่ม → โหลดบิลล่าสุดก่อน · ปลดอ่านอย่างเดียว · ขายต่อไม่ทับ · ไม่มี error ค้าง`, async () => {
      const A = await makeShop({ rows: NO_CLOUD }); const B = await secondWindow(A, lockModes[mode]);
      try {
        await sell(A, 300);
        await sell(B, 500);
        eq(!!B.app.isReadOnlyWindow, true, 'B ต้องถูกพักก่อน');
        const btn = { disabled: false, innerText: '' };
        const res = await Promise.race([B.app.retryWriterFromBanner(btn), new Promise(r => setTimeout(() => r('HANG'), 5000))]);
        eq(res, true, 'ปุ่มต้องให้ผลภายในเวลา');
        eq(!!B.app.isReadOnlyWindow, false);
        eq(B.app.state.transactions.map(t => t.total), [300], 'ต้องโหลดบิลล่าสุดก่อนรับสิทธิ์');
        await sell(B, 500);
        eq((await A.env.raw('transactions')).map(t => t.total), [300, 500]);
        // หน้าต่าง A ที่ยังเปิดค้าง (ข้อมูลเก่ากว่าแล้ว) เขียนทับไม่ได้
        await sell(A, 700);
        eq((await A.env.raw('transactions')).map(t => t.total), [300, 500]);
      } finally { B.env.dispose(); A.env.dispose(); }
    });
  }
  await R.t('C05 ล็อกยังถูกถือโดยอีกหน้าต่าง: คืนปุ่มให้กดใหม่ได้ · ยังอ่านอย่างเดียว', async () => {
    const A = await makeShop({ rows: NO_CLOUD });
    const B = await secondWindow(A, { request(name, opts, cb) { return Promise.resolve(cb(null)); } });
    try {
      await sell(A, 300); await sell(B, 500);
      const btn = { disabled: false, innerText: '' };
      eq(await B.app.retryWriterFromBanner(btn), false);
      eq(btn.disabled, false); eq(!!B.app.isReadOnlyWindow, true);
    } finally { B.env.dispose(); A.env.dispose(); }
  });
  await R.t('C05 โหลดข้อมูลใหม่ไม่สำเร็จ: ปุ่มกลับมากดได้ · ยังอ่านอย่างเดียว (ไม่ปลดด้วยข้อมูลเก่า)', async () => {
    const A = await makeShop({ rows: NO_CLOUD }); const B = await secondWindow(A);
    try {
      await sell(A, 300); await sell(B, 500);
      const P = Object.getPrototypeOf(B.app);
      B.app.loadState = async function () { this.loadFailed = true; };
      const btn = { disabled: false, innerText: '' };
      eq(await B.app.retryWriterFromBanner(btn), false);
      eq(btn.disabled, false); eq(!!B.app.isReadOnlyWindow, true);
      B.app.loadState = P.loadState;
    } finally { B.env.dispose(); A.env.dispose(); }
  });

  // ── C02 / C04: Git จริง ──
  const gitOk = !spawnSync('git', ['--version'], { encoding: 'utf8' }).error;
  const shells = (process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh'])
    .filter(sh => !spawnSync(sh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8', timeout: 30000, windowsHide: true }).error);
  if (!gitOk || !shells.length) console.log('  SKIP C02/C04 Git จริง: ไม่มี git หรือ PowerShell');
  const fnOf = (src, name) => { const m = src.match(new RegExp('^function ' + name + '[^\\n]*\\r?\\n[\\s\\S]*?^\\}', 'm')); if (!m) throw new Error('missing ' + name); return m[0]; };
  const lineOf = (src, varName) => { const m = src.match(new RegExp('^\\' + varName + ' = @\\([^\\n]*\\)\\s*$', 'm')); if (!m) throw new Error('missing ' + varName); return m[0]; };
  const allowOf = (src, isDeploy) => { const m = src.match(isDeploy ? /^\$safeNewPaths = @\([\s\S]*?^\)/m : /^\$safePaths = @\([\s\S]*?\)\s*$/m); if (!m) throw new Error('missing allowlist'); return m[0]; };
  function probe(script, range) {
    const src = fs.readFileSync(path.join(ROOT, script), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const isDeploy = script === 'deploy.ps1';
    return '﻿$ErrorActionPreference = "Stop"\nfunction Fail($msg) { Write-Output $msg; exit 1 }\n' + allowOf(src, isDeploy) + '\n' +
      // ตัวตรวจไฟล์ข้อมูล (C04) ใส่เมื่อมี — โค้ดก่อนแก้ไม่มี probe ต้องยังรันได้ เพื่อให้เห็นพฤติกรรมเดิมจริง ไม่ใช่ล้มเพราะหาฟังก์ชันไม่เจอ
      // ผลตรวจ 19 ต.ค. 2569 ข้อ 14: $dataFileExts → $codeFileExts และ Assert-SafeOutgoing เรียก Find-PushSecret — ใส่เฉพาะตัวที่สคริปต์รุ่นนั้นมี
      (/^function Test-UnapprovedDataFile/m.test(src) ? ['$approvedDataFiles', '$dataFileDirs', '$dataFileExts', '$codeFileExts']
        .filter(v => new RegExp('^\\' + v + ' = @\\(', 'm').test(src)).map(v => lineOf(src, v)).join('\n') + '\n' +
        fnOf(src, 'Test-UnapprovedDataFile') + '\n' : '') + fnOf(src, isDeploy ? 'Test-SafeNewPath' : 'Is-Safe') + '\n' +
      (/^function Find-PushSecret/m.test(src) ? fnOf(src, 'Find-PushSecret') + '\n' : '') + fnOf(src, 'Assert-SafeOutgoing') +
      `\nAssert-SafeOutgoing "${range}"\nWrite-Output "ALLOWED"\nexit 0\n`;
  }
  const fake = '1234567890' + ':' + 'Z'.repeat(35);
  function realRepo(scenario) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-c02-'));
    const git = (args, allowFail) => { const r = spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=s@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' }); if (r.status && !allowFail) throw new Error(r.stderr || r.stdout); return r; };
    const write = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
    const commit = m => { git(['add', '-A']); git(['commit', '-qm', m]); };
    git(['init', '-q']); git(['checkout', '-q', '-b', 'main']);
    write('README.md', 'base\n'); commit('base'); git(['branch', 'audit-base']);
    if (scenario === 'merge-secret' || scenario === 'merge-clean') {
      git(['checkout', '-q', '-b', 'feature']); write('README.md', 'feature\n'); commit('feature');
      git(['checkout', '-q', 'main']); write('README.md', 'main\n'); commit('main');
      git(['merge', '--no-ff', 'feature', '-m', 'merge'], true);
      write('README.md', scenario === 'merge-secret' ? 'merged ' + fake + '\n' : 'merged\n'); commit('merge resolution');
    }
    if (scenario === 'token-added-then-removed') { write('tests/a.js', 'const t = "' + fake + '";\n'); commit('add'); write('tests/a.js', 'const t = 1;\n'); commit('remove'); }
    if (scenario === 'business-json') write('tests/synthetic-export.json', JSON.stringify({ transactions: [{ id: 'S', total: 1 }], customers: [], staff: [], shift: {} })), commit('export');
    if (scenario === 'business-json-added-then-removed') { write('tools/dump.csv', 'id,total\nS,1\n'); commit('add'); fs.unlinkSync(path.join(dir, 'tools/dump.csv')); commit('remove'); }
    if (scenario === 'approved-fixture-and-source') { write('tests/fixtures_codex_money_20261016.json', '[]\n'); write('tests/new_test.js', 'x\n'); write('vendor/f.woff2', 'x'); commit('ok'); }
    return { dir, git };
  }
  const expectBlocked = { 'merge-secret': true, 'merge-clean': false, 'token-added-then-removed': true, 'business-json': true,
    'business-json-added-then-removed': true, 'approved-fixture-and-source': false };
  if (gitOk) for (const shell of shells) for (const script of ['deploy.ps1', 'fix-push.ps1']) for (const scenario of Object.keys(expectBlocked)) {
    await R.t(`C02/C04 Git จริง ${shell} ${script} ${scenario}: ${expectBlocked[scenario] ? 'ต้องถูกบล็อก' : 'ต้องผ่าน'}`, () => {
      const { dir } = realRepo(scenario);
      try {
        const pf = path.join(dir, '..', path.basename(dir) + '-probe.ps1');
        fs.writeFileSync(pf, probe(script, 'audit-base..HEAD'));
        const p = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', pf], { cwd: dir, encoding: 'utf8', timeout: 60000, windowsHide: true });
        fs.rmSync(pf, { force: true });
        eq(p.status !== 0, expectBlocked[scenario], ((p.stdout || '') + (p.stderr || '')).slice(-500));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  }

  // ── C04: สคริปต์เต็ม (Git จำลอง) — ไฟล์ข้อมูลใหม่ที่ไม่ได้อนุมัติต้องหยุดก่อน stage ──
  const runPs = (shell, script, status) => {
    const dir = fs.mkdtempSync(path.join(__dirname, 'codex-ps-'));
    try {
      fs.mkdirSync(path.join(dir, 'tests')); fs.mkdirSync(path.join(dir, '.git'));
      for (const f of [script, 'sw.js', 'app.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
      fs.writeFileSync(path.join(dir, 'tests/run-all.js'), 'process.exit(0)\n');
      // ผลตรวจ 19 ต.ค. 2569 ข้อ 13: สคริปต์ตรวจไฟล์ที่แอปอ้างก่อน stage → วางโครงแอป + git ls-files จำลองตอบรายชื่อนี้
      const tracked = writeAppSkeleton(dir, ROOT).concat([script, 'app.js']);
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ status, tracked }));
      fs.writeFileSync(path.join(dir, 'invoke.ps1'), `
$ErrorActionPreference = 'Stop'
$global:cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
function git {
  $a = @($args | ForEach-Object { [string]$_ })
  $global:LASTEXITCODE = 0
  if ($a[0] -eq '-c') { $a = @($a | Select-Object -Skip 2) }
  switch ($a[0]) {
    'status' { return @($global:cfg.status) }
    'diff' { if ($a -contains '--stat') { return '' }; return [string][char]0 }
    'log' { return }
    'rev-list' { return '0' }
    'ls-files' { return ((@($global:cfg.tracked) | Where-Object { $_ }) -join [char]0) + [char]0 }
    'symbolic-ref' { return 'main' }
    'rev-parse' { return 'origin/main' }
    'fetch' { return }
    'branch' { return }
    'add' { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'added.txt') -Value ($a -join ' '); return }
    'commit' { return }
    'rebase' { return }
    'push' { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'pushed.txt') -Value 'pushed'; return }
    default { throw ('Unmocked: ' + ($a -join ' ')) }
  }
}
function Read-Host { return 'y' }
& (Join-Path $PSScriptRoot '${script}')
exit $LASTEXITCODE
`);
      const proc = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'invoke.ps1')], { encoding: 'utf8', timeout: 90000, windowsHide: true });
      return { status: proc.status, out: (proc.stdout || '') + (proc.stderr || ''), added: fs.existsSync(path.join(dir, 'added.txt')), pushed: fs.existsSync(path.join(dir, 'pushed.txt')) };
    } finally {
      const resolved = path.resolve(dir);
      if (path.dirname(resolved) === path.resolve(__dirname) && path.basename(resolved).startsWith('codex-ps-')) fs.rmSync(resolved, { recursive: true, force: true });
    }
  };
  for (const shell of shells) for (const script of ['deploy.ps1', 'fix-push.ps1']) {
    await R.t(`C04 ${shell} ${script}: ไฟล์ข้อมูลใหม่ชื่อทั่วไปใต้ tests/ → หยุดก่อน git add (index ไม่ถูกแตะ)`, () => {
      const r = runPs(shell, script, [' M README.md', '?? tests/synthetic-export.json']);
      eq([r.status !== 0, r.added, r.pushed], [true, false, false], r.out.slice(-500));
    });
    await R.t(`C04 ${shell} ${script}: control — เทสต์ .js ใหม่ + fixture ที่อนุมัติ ยัง deploy ได้`, () => {
      const r = runPs(shell, script, [' M README.md', '?? tests/new_test.js', '?? tests/fixtures_codex_money_20261016.json']);
      eq([r.status, r.added, r.pushed], [0, true, true], r.out.slice(-500));
    });
  }

  R.done();
})();
