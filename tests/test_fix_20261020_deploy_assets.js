// ผลตรวจ 19 ต.ค. 2569 ข้อ 13 — deploy ต้องไม่ปล่อยเว็บที่เรียกไฟล์ซึ่งไม่ได้ถูกส่งขึ้นไป
// ส่วนที่ 1 (ไม่ต้องใช้ PowerShell): ทุกไฟล์ที่ sw.js สั่งแคช + ที่ index.html / manifest.json เรียก → มีอยู่จริง · git ติดตาม (ตัวพิมพ์ตรง)
//   · ผ่านรายการอนุญาตของทั้ง deploy.ps1 และ fix-push.ps1 (อ่านรายการจากสคริปต์ตรง ๆ แบบเดียวกับ test_deploy_safety.js)
// ส่วนที่ 2 (PowerShell): Get-AppFileRefs ในสคริปต์จริงอ่านรายการได้ตรงกับส่วนที่ 1 · ทุกไฟล์ใน repo ผ่าน Test-SafeNewPath/Is-Safe จริง
// ส่วนที่ 3 (PowerShell + Git จริงในโฟลเดอร์ชั่วคราว ไม่มี remote จริง): ไฟล์ใหม่ที่ index.html เรียกแต่ไม่อยู่ในรายการ → หยุด ไม่มีอะไรถูก push
//   พิสูจน์ว่าจับของจริง: POS_DEPLOY_SRC=<โฟลเดอร์ที่มี deploy.ps1/fix-push.ps1 รุ่นก่อนแก้> → ต้องตก
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { makeRunner, eq, ok } = require('./harness_db');
const kit = require('./deploy_test_kit');
const R = makeRunner('--- ผลตรวจ 19 ต.ค. 2569 ข้อ 13: ไฟล์ที่แอปเรียกต้องขึ้นเว็บครบ ---');
const ROOT = kit.ROOT;
const SRC = process.env.POS_DEPLOY_SRC ? path.resolve(process.env.POS_DEPLOY_SRC) : ROOT;
const srcOf = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

function psList(src, varName) {
  const m = src.match(new RegExp('\\$' + varName + '\\s*=\\s*@\\(([\\s\\S]*?)\\)\\s*\\n'));
  if (!m) throw new Error('หา $' + varName + ' ไม่เจอ');
  return [...m[1].replace(/#.*$/gm, '').matchAll(/'([^']+)'/g)].map(x => x[1]);
}
const allowed = (list, p) => list.some(s => p === s || p.startsWith(s + '/'));
function tracked() {
  const r = spawnSync('git', ['-C', process.env.POS_GIT_ROOT || ROOT, '-c', 'core.quotepath=false', 'ls-files', '-z'], { encoding: 'utf8', windowsHide: true, env: kit.cleanEnv() });
  if (r.error || r.status !== 0) throw new Error('git ls-files ล้มเหลว: ' + (r.error || r.stderr));
  return r.stdout.split('\0').filter(Boolean);
}
const fnOf = (src, name) => { const m = src.match(new RegExp('^function ' + name + '\\b[^\\n]*\\n[\\s\\S]*?^\\}', 'm')); return m ? m[0] : null; };
const lineOf = (src, v) => { const m = src.match(new RegExp('^\\$' + v + ' = @\\([^\\n]*\\)\\s*$', 'm')); return m ? m[0] : null; };
const allowBlock = (src, isDeploy) => { const m = src.match(isDeploy ? /^\$safeNewPaths = @\([\s\S]*?^\)/m : /^\$safePaths = @\([\s\S]*?\)\s*$/m); if (!m) throw new Error('missing allowlist'); return m[0]; };

// รันส่วนหนึ่งของสคริปต์จริงใน PowerShell (ฟังก์ชันที่ดึงออกมา) — ผลเขียนลงไฟล์ UTF-8 (กันรหัสอักษรหน้าต่างบน Windows ไทย)
function probe(shell, body, files) {
  const dir = kit.makeTempDir('probe');
  try {
    for (const [f, t] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, f), t);
    const out = path.join(dir, 'out.txt');
    fs.writeFileSync(path.join(dir, 'probe.ps1'), '﻿$ErrorActionPreference = "Stop"\n$OUT = \'' + out.replace(/'/g, "''") + '\'\n' +
      'function Fail($msg) { [IO.File]::WriteAllText($OUT, "FAIL: " + $msg, [Text.UTF8Encoding]::new($false)); exit 3 }\n' + body + '\n');
    const r = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'probe.ps1')], { cwd: dir, encoding: 'utf8', timeout: 60000, windowsHide: true, env: kit.cleanEnv() });
    const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    return { status: r.status, text, err: (r.stdout || '') + (r.stderr || '') };
  } finally { kit.removeTempDir(dir); }
}

(async () => {
  const refs = kit.appRefs(ROOT);
  const files = tracked();
  const fileSet = new Set(files);

  await R.t('sw.js อ่านรายการได้ครบ: CORE_ASSETS + FONT_ASSETS (.map) + OPTIONAL_ASSETS', () => {
    ok(refs.sw.includes('app.js') && refs.sw.includes('index.html') && refs.sw.includes('vendor/fontawesome/css/all.min.css'), JSON.stringify(refs.sw));
    ok(refs.sw.filter(f => /^vendor\/fonts\/.+\.woff2$/.test(f)).length >= 19, 'FONT_ASSETS (.map) อ่านไม่ครบ');
    ok(refs.sw.includes('apple-touch-icon.png'), 'OPTIONAL_ASSETS');
    ok(refs.all.includes('style_v2.css') && refs.all.includes('manifest.json'), 'index.html refs');
  });
  await R.t('ทุกไฟล์ที่ sw.js / index.html / manifest.json อ้าง มีอยู่จริงและ git ติดตามอยู่ (ชื่อตัวพิมพ์ตรงกัน)', () => {
    eq(refs.all.filter(f => !fs.existsSync(path.join(ROOT, f))), [], 'ไฟล์ที่ไม่มีอยู่จริง');
    eq(refs.all.filter(f => !fileSet.has(f)), [], 'ไฟล์ที่ git ไม่ได้ติดตาม (หรือชื่อตัวพิมพ์ไม่ตรง)');
  });
  await R.t('ทุกไฟล์ที่แอปอ้าง อยู่ในรายการอนุญาตของ deploy.ps1 และ fix-push.ps1', () => {
    const d = psList(srcOf('deploy.ps1'), 'safeNewPaths'), f = psList(srcOf('fix-push.ps1'), 'safePaths');
    eq(refs.all.filter(p => !allowed(d, p)), [], 'นอก $safeNewPaths');
    eq(refs.all.filter(p => !allowed(f, p)), [], 'นอก $safePaths');
  });

  const shells = kit.psShells();
  if (!shells.length) console.log('  SKIP ส่วน PowerShell: ไม่มี PowerShell ในเครื่องนี้');
  for (const shell of shells) for (const script of ['deploy.ps1', 'fix-push.ps1']) {
    const src = srcOf(script), isDeploy = script === 'deploy.ps1';
    await R.t(`${shell} ${script}: Get-AppFileRefs ของสคริปต์จริงได้รายการเดียวกับที่ sw.js/index.html/manifest.json อ้าง`, () => {
      const fn = fnOf(src, 'Get-AppFileRefs');
      ok(fn, 'ไม่มี Get-AppFileRefs ในสคริปต์');
      const copies = {}; for (const f of ['index.html', 'sw.js', 'manifest.json']) copies[f] = fs.readFileSync(path.join(ROOT, f));
      const r = probe(shell, fn + '\n[IO.File]::WriteAllText($OUT, (@(Get-AppFileRefs) -join "`n"), [Text.UTF8Encoding]::new($false))', copies);
      eq(r.status, 0, r.text + r.err.slice(-300));
      eq(r.text.split('\n').filter(Boolean).sort(), refs.all.slice().sort());
    });
    await R.t(`${shell} ${script}: ทุกไฟล์ที่ git ติดตามวันนี้ (${files.length} ไฟล์) ผ่านด่านรายการอนุญาตจริงของสคริปต์ (รวมด่านชนิดไฟล์ใต้ tests/tools/vendor)`, () => {
      const parts = [allowBlock(src, isDeploy)];
      for (const v of ['approvedDataFiles', 'dataFileDirs', 'dataFileExts', 'codeFileExts']) { const l = lineOf(src, v); if (l) parts.push(l); }
      for (const n of ['Test-UnapprovedDataFile', isDeploy ? 'Test-SafeNewPath' : 'Is-Safe']) { const fn = fnOf(src, n); if (fn) parts.push(fn); }
      const r = probe(shell, parts.join('\n') + '\n$paths = @([IO.File]::ReadAllText((Join-Path $PSScriptRoot "paths.txt"), [Text.Encoding]::UTF8).Split("`n") | Where-Object { $_ })\n' +
        '$bad = @($paths | Where-Object { -not (' + (isDeploy ? 'Test-SafeNewPath' : 'Is-Safe') + ' $_) })\n[IO.File]::WriteAllText($OUT, ($bad -join "`n"), [Text.UTF8Encoding]::new($false))',
        { 'paths.txt': files.join('\n') });
      eq(r.status, 0, r.text + r.err.slice(-300));
      eq(r.text.split('\n').filter(Boolean), [], 'ไฟล์ที่ติดตามอยู่แต่สคริปต์จะไม่ยอมส่ง');
    });
  }

  // ── ส่วนที่ 3: สคริปต์เต็ม + Git จริง ──
  if (!kit.gitAvailable()) console.log('  SKIP ส่วน Git จริง: ไม่มี git');
  const swVer = repo => Number(/jahn-pos-v(\d+)/.exec(repo.read('sw.js'))[1]);
  const addRef = (repo, tag) => repo.write('index.html', repo.read('index.html').replace('<script src="app.js', tag + '\n  <script src="app.js'));
  const allowExtra = (repo, name) => {
    for (const f of ['deploy.ps1', 'fix-push.ps1']) {
      const t = fs.readFileSync(path.join(repo.work, f), 'utf8');
      const n = t.replace(f === 'deploy.ps1' ? "$safeNewPaths = @(\r\n    '.nojekyll'," : "$safePaths = @('.nojekyll',", m => m + " '" + name + "',");
      if (n === t) throw new Error('แก้รายการอนุญาตในสำเนา ' + f + ' ไม่ได้');
      fs.writeFileSync(path.join(repo.work, f), n);
    }
    repo.git(['add', '-A']); repo.git(['commit', '-q', '-m', 'allow ' + name]); repo.git(['push', '-q']);
  };
  const stopped = (repo, r, before, why) => {
    ok(r.status !== 0, 'ต้องหยุด แต่จบด้วย 0: ' + r.out.slice(-400));
    ok(/files the app needs are missing|cannot find|refers to/.test(r.out), 'ต้องบอกว่าไฟล์ที่แอปต้องใช้ขาด: ' + r.out.slice(-400));
    if (why) ok(why.test(r.out), 'ข้อความต้องบอกไฟล์/สาเหตุ: ' + r.out.slice(-400));
    eq(repo.originHead(), before, 'มีของถูก push ขึ้น origin');
    eq(repo.staged(), [], 'index ถูกแตะ');
  };
  if (kit.gitAvailable()) for (const shell of shells) {
    const yes = 'function Read-Host { return "y" }';
    const scen = async (name, fn) => R.t(`${shell} Git จริง: ${name}`, async () => {
      const repo = kit.tempRepo({ src: SRC, tag: 'assets' });
      try { await fn(repo); } finally { repo.cleanup(); }
    });
    await scen('deploy.ps1 ไฟล์ใหม่ที่ราก (ไม่อยู่ในรายการอนุญาต) ที่ index.html เรียก → หยุด · ไม่ push · ไม่บวกเลขแคช', repo => {
      const before = repo.originHead(), v = swVer(repo);
      repo.write('extra-module.js', 'window.EXTRA_OK = true;\n'); addRef(repo, '<script src="extra-module.js"></script>');
      const r = repo.ps(shell, 'deploy.ps1');
      stopped(repo, r, before, /extra-module\.js/);
      eq(swVer(repo), v, 'เลขแคชถูกบวก');
      ok(!repo.originFiles().includes('extra-module.js'));
    });
    await scen('fix-push.ps1 แบบเดียวกัน → หยุดก่อนถาม · ไม่สร้าง safety branch · ไม่ commit/push', repo => {
      const before = repo.originHead(), head = repo.git(['rev-parse', 'HEAD']).stdout;
      repo.write('extra-module.js', 'window.EXTRA_OK = true;\n'); addRef(repo, '<script src="extra-module.js"></script>');
      const r = repo.ps(shell, 'fix-push.ps1', { prelude: yes });
      stopped(repo, r, before, /extra-module\.js/);
      eq(repo.git(['rev-parse', 'HEAD']).stdout, head, 'HEAD เปลี่ยน');
      eq(repo.git(['branch', '--list', 'safety-*']).stdout.trim(), '', 'สร้าง safety branch แล้ว');
    });
    await scen('ไฟล์ที่ sw.js/index.html เรียกถูกลบ → หยุด (เดิม push การลบขึ้นไป แอปเปิดไม่ขึ้น)', repo => {
      const before = repo.originHead();
      fs.unlinkSync(path.join(repo.work, 'promptpay-qr.js'));
      const r = repo.ps(shell, 'deploy.ps1');
      stopped(repo, r, before, /promptpay-qr\.js.*does not exist/);
      ok(repo.originFiles().includes('promptpay-qr.js'));
    });
    await scen('index.html เรียกไฟล์ที่ .gitignore กันไว้ (อยู่ใต้ tests/ ที่อนุญาต) → หยุด (ไฟล์ไม่มีวันถูก stage)', repo => {
      const before = repo.originHead();
      repo.write('tests/_backup_final_qa_1.js', '// ignored by .gitignore\n'); addRef(repo, '<script src="tests/_backup_final_qa_1.js"></script>');
      const r = repo.ps(shell, 'deploy.ps1');
      stopped(repo, r, before, /_backup_final_qa_1\.js.*not tracked/);
    });
    await scen('sw.js เพิ่มไฟล์ที่ไม่มีอยู่ใน CORE_ASSETS → หยุด (Service Worker ติดตั้งไม่ผ่าน iPad ไม่อัปเดต)', repo => {
      const before = repo.originHead();
      repo.write('sw.js', repo.read('sw.js').replace("'./app.js',", "'./app.js',\n  './missing-core.js',"));
      const r = repo.ps(shell, 'deploy.ps1');
      stopped(repo, r, before, /missing-core\.js/);
    });
    await scen('control: ไฟล์ใหม่ที่เติมชื่อในรายการอนุญาตแล้ว → deploy ขึ้นครบ · แก้เฉพาะไฟล์นั้นรอบถัดไป → บวกเลขแคช (iPad ได้รุ่นใหม่)', repo => {
      allowExtra(repo, 'extra-module.js');
      const v0 = swVer(repo);
      repo.write('extra-module.js', 'window.EXTRA_OK = 1;\n'); addRef(repo, '<script src="extra-module.js"></script>');
      let r = repo.ps(shell, 'deploy.ps1');
      eq(r.status, 0, r.out.slice(-500));
      ok(repo.originFiles().includes('extra-module.js'), 'ไฟล์ใหม่ไม่ขึ้น origin');
      ok(/extra-module\.js/.test(repo.originShow('index.html')));
      eq(swVer(repo), v0 + 1);
      repo.write('extra-module.js', 'window.EXTRA_OK = 2;\n');
      r = repo.ps(shell, 'deploy.ps1');
      eq(r.status, 0, r.out.slice(-500));
      eq(swVer(repo), v0 + 2, 'แก้ไฟล์ที่แอปเรียกแต่ไม่บวกเลขแคช');
      ok(/EXTRA_OK = 2/.test(repo.originShow('extra-module.js')));
    });
    await scen('control: fix-push.ps1 กับไฟล์ใหม่ที่อนุญาตแล้ว → commit + push ได้ตามเดิม', repo => {
      allowExtra(repo, 'extra-module.js');
      repo.write('extra-module.js', 'window.EXTRA_OK = 1;\n'); addRef(repo, '<script src="extra-module.js"></script>');
      const r = repo.ps(shell, 'fix-push.ps1', { prelude: yes });
      eq(r.status, 0, r.out.slice(-500));
      ok(repo.originFiles().includes('extra-module.js'));
    });
  }
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
