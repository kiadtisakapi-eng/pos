// ชุดเครื่องมือร่วมของเทสต์ deploy.ps1 / fix-push.ps1 (ผลตรวจ 19 ต.ค. 2569 ข้อ 13/14/47/70) — ไม่ใช่ไฟล์เทสต์ ไม่ต้องใส่ใน run-all
//  · appRefs(root): ไฟล์ที่ index.html (src/href) · sw.js (รายการ ..._ASSETS) · manifest.json (icons/start_url) อ้างถึง
//    กติกาเดียวกับ Get-AppFileRefs ในสคริปต์ทั้งสอง — เทสต์เทียบผลสองฝั่งให้ตรงกัน
//  · writeAppSkeleton(dir, root): วาง index.html/sw.js/manifest.json ตัวจริง + ไฟล์แทนที่ (placeholder) ของทุกไฟล์ที่แอปอ้าง
//    ให้สคริปต์ที่ถูกคัดลอกไปรันในโฟลเดอร์ชั่วคราวผ่านด่าน "ไฟล์ที่แอปต้องใช้ต้องขึ้นเว็บครบ" · คืนรายชื่อสำหรับ git ls-files จำลอง
//  · tempRepo(): Git จริงในโฟลเดอร์ชั่วคราวของระบบ (os.tmpdir) + origin เป็น bare repo ในเครื่อง — ไม่มีวัน push ไปที่จริง
//  · ทุกโฟลเดอร์ชั่วคราวถูกลบใน finally และลบเฉพาะโฟลเดอร์ที่ขึ้นต้นด้วยชื่อที่เราสร้างใต้ os.tmpdir() เท่านั้น
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP_PREFIX = 'pos-deploy-test-';

function readText(root, f) { return fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, ''); }

function normalizeRef(r) {
  let s = String(r).trim();
  if (!s || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/.test(s) || s.includes('${') || s.includes('{{')) return null;
  s = s.split(/[?#]/)[0];
  try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ }
  if (s.startsWith('/')) throw new Error('absolute path: ' + r);
  while (s.startsWith('./')) s = s.slice(2);
  if (s === '' || s.endsWith('/')) s += 'index.html';
  if (s.split('/').some(p => p === '..' || p === '.')) throw new Error('relative segment: ' + r);
  return s;
}

// คืน { all, sw } — all = ทุกไฟล์ที่แอปอ้าง (ไม่ซ้ำ) · sw = เฉพาะที่ sw.js ระบุให้แคช
function appRefs(root = ROOT) {
  const raw = [], swRaw = [];
  const html = readText(root, 'index.html').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/<[a-z][^>]*?\s(?:src|href)\s*=\s*["']([^"']*)["']/gi)) raw.push(m[1]);
  const sw = readText(root, 'sw.js').replace(/^\s*\/\/.*$/gm, '');
  const lists = [...sw.matchAll(/\bconst\s+(\w*ASSETS)\s*=\s*\[([\s\S]*?)\]/g)];
  if (!lists.some(l => l[1] === 'CORE_ASSETS')) throw new Error('CORE_ASSETS not found in sw.js');
  for (const l of lists) {
    let items = [...l[2].matchAll(/['"]([^'"]*)['"]/g)].map(m => m[1]);
    const after = sw.slice(l.index + l[0].length);
    if (/^\s*\.map\(/.test(after)) {
      const mm = /^\s*\.map\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*'([^']*)'\s*\+\s*(\w+)\s*\+\s*'([^']*)'\s*\)/.exec(after);
      if (!mm || mm[1] !== mm[3]) throw new Error('unknown .map form after ' + l[1]);
      items = items.map(n => mm[2] + n + mm[4]);
    }
    swRaw.push(...items);
  }
  raw.push(...swRaw);
  if (fs.existsSync(path.join(root, 'manifest.json'))) {
    const man = JSON.parse(readText(root, 'manifest.json'));
    if (man.start_url) raw.push(man.start_url);
    for (const k of ['icons', 'screenshots']) for (const ic of man[k] || []) if (ic && ic.src) raw.push(ic.src);
  }
  const uniq = list => [...new Set(list.map(normalizeRef).filter(Boolean))];
  return { all: uniq(raw), sw: uniq(swRaw) };
}

// วางโครงแอปขั้นต่ำให้สคริปต์ deploy ที่คัดลอกไปผ่านด่านไฟล์ของแอป · ไม่ทับไฟล์ที่มีอยู่แล้ว (เช่น app.js/sw.js ที่เทสต์คัดลอกเอง)
function writeAppSkeleton(dir, root = ROOT) {
  for (const f of ['index.html', 'sw.js', 'manifest.json']) {
    if (!fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  }
  const files = new Set(['index.html', 'sw.js', 'manifest.json']);
  for (const f of appRefs(root).all) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '/* placeholder for deploy tests */\n'); }
    files.add(f);
  }
  return [...files];
}

// โฟลเดอร์ชั่วคราวใต้ os.tmpdir() + ลบแบบมีด่าน (ลบได้เฉพาะโฟลเดอร์ที่เราสร้าง)
function makeTempDir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX + (tag || 'x') + '-')); }
function removeTempDir(dir) {
  const resolved = path.resolve(dir);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith(TMP_PREFIX)) throw new Error('Unsafe temp directory: ' + resolved);
  fs.rmSync(resolved, { recursive: true, force: true });
}

// PowerShell ที่มีในเครื่อง (Windows: 5.1 ที่ deploy.bat ใช้ + 7 ถ้ามี)
function psShells() {
  const cands = process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh', 'powershell'];
  return cands.filter(sh => { const r = spawnSync(sh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8', timeout: 30000, windowsHide: true }); return !r.error && r.status === 0; });
}
function gitAvailable() { return !spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).error; }

// PowerShell ที่ถูกเรียกจากเทสต์อ่านชื่อไฟล์ภาษาไทยจาก git ได้ถูกไหม (หลังตั้ง UTF-8 แบบเดียวกับหัวสคริปต์)
// บน Windows โปรเซสที่ Node เรียกแบบไม่มีหน้าต่าง (เช่นตอน run-all ใน deploy.bat) ไม่มี console → ตั้งรหัสอักษรไม่ได้
// ชื่อไทยจะเพี้ยนในเทสต์เท่านั้น (deploy จริงรันในหน้าต่างที่มี console) → เทสต์ที่พึ่งชื่อไทยต้องข้ามพร้อมบอกเหตุผล
const thaiCache = {};
function psReadsThaiGitPaths(shell) {
  if (shell in thaiCache) return thaiCache[shell];
  const dir = makeTempDir('thai');
  try {
    const run = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, env: cleanEnv() });
    run(['init', '-q']); fs.writeFileSync(path.join(dir, 'ทดสอบ.md'), 'x');
    const out = path.join(dir, 'out.txt');
    fs.writeFileSync(path.join(dir, 'p.ps1'), '﻿try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }\n' +
      "$s = @(git -c core.quotepath=false status --porcelain --untracked-files=all) -join \"`n\"\n[IO.File]::WriteAllText('" + out.replace(/'/g, "''") + "', $s, [Text.UTF8Encoding]::new($false))\n");
    spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'p.ps1')], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 60000, env: cleanEnv() });
    thaiCache[shell] = fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes('?? ทดสอบ.md');
  } finally { removeTempDir(dir); }
  return thaiCache[shell];
}

// env ของโปรเซสลูก: ตัดตัวแปร GIT_* ที่อาจชี้ไป repo จริง (เช่นตอนรันจาก hook)
function cleanEnv(extra) {
  const env = Object.assign({}, process.env, extra || {});
  for (const k of Object.keys(env)) if (/^GIT_/.test(k)) delete env[k];
  return env;
}

// Git จริงในโฟลเดอร์ชั่วคราว: origin.git (bare) + work (clone) · base commit = สคริปต์ deploy จาก src + โครงแอป + เทสต์จำลอง
function tempRepo({ src = ROOT, tag = 'repo', root = ROOT, extraFiles = {} } = {}) {
  const base = makeTempDir(tag);
  const origin = path.join(base, 'origin.git'), work = path.join(base, 'work');
  const run = (cwd, args, allowFail) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0 && !allowFail) throw new Error('git ' + args.join(' ') + ' failed: ' + (r.stderr || r.stdout));
    return r;
  };
  try {
    fs.mkdirSync(origin); run(origin, ['init', '-q', '--bare']); run(origin, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    fs.mkdirSync(work); run(work, ['init', '-q']);
    for (const [k, v] of [['user.name', 'Synthetic'], ['user.email', 's@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'], ['core.hooksPath', '.no-hooks']]) run(work, ['config', k, v]);
    run(work, ['checkout', '-q', '-b', 'main']);
    for (const f of ['deploy.ps1', 'fix-push.ps1']) fs.copyFileSync(path.join(src, f), path.join(work, f));
    for (const f of ['.gitignore', '.gitattributes']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(work, f));
    fs.writeFileSync(path.join(work, 'app.js'), "const APP_VERSION = '9.9.9 (2026-01-01)';\n");
    fs.writeFileSync(path.join(work, 'README.md'), '# synthetic repo for deploy tests\n');
    writeAppSkeleton(work, root);
    fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(work, 'tests', 'run-all.js'), "console.log('=== ผ่าน 1 · ไม่ผ่าน 0 ===');\n");
    for (const [f, t] of Object.entries(extraFiles)) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), t); }
    run(work, ['add', '-A']); run(work, ['commit', '-q', '-m', 'base']);
    run(work, ['remote', 'add', 'origin', origin]); run(work, ['push', '-q', '-u', 'origin', 'main']);
  } catch (e) { removeTempDir(base); throw e; }
  const git = (args, allowFail) => run(work, args, allowFail);
  return {
    base, work, origin, git,
    write(f, t) { const p = path.join(work, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); },
    read(f) { return fs.readFileSync(path.join(work, f), 'utf8'); },
    originHead() { return run(origin, ['rev-parse', 'refs/heads/main']).stdout.trim(); },
    originFiles() { return run(origin, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', 'refs/heads/main']).stdout.split('\n').filter(Boolean); },
    originShow(f) { return run(origin, ['show', 'refs/heads/main:' + f], true).stdout; },
    staged() { return git(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean); },
    // รันสคริปต์จริงด้วย PowerShell · prelude = คำสั่ง PowerShell ก่อนเรียกสคริปต์ (เช่นตั้งรหัสอักษรหน้าต่าง / ตอบ Read-Host)
    ps(shell, script, { args = [], prelude = '' } = {}) {
      const inv = path.join(base, 'invoke-' + Math.random().toString(36).slice(2) + '.ps1');
      fs.writeFileSync(inv, '﻿' + prelude + "\n& (Join-Path '" + work.replace(/'/g, "''") + "' '" + script + "')" +
        (args.length ? ' ' + args.map(a => "'" + String(a).replace(/'/g, "''") + "'").join(' ') : '') + '\nexit $LASTEXITCODE\n');
      try {
        const r = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', inv], { cwd: work, encoding: 'utf8', windowsHide: true, timeout: 180000, env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 });
        if (r.error) throw r.error;
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
      } finally { fs.rmSync(inv, { force: true }); }
    },
    cleanup() { removeTempDir(base); }
  };
}

module.exports = { ROOT, appRefs, normalizeRef, writeAppSkeleton, makeTempDir, removeTempDir, psShells, gitAvailable, psReadsThaiGitPaths, cleanEnv, tempRepo, TMP_PREFIX };
