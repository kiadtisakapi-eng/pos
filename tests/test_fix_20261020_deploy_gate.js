// ผลตรวจ 19 ต.ค. 2569 ข้อ 14 (ด่านกันความลับ/ข้อมูลส่วนตัวก่อน push) + ข้อ 47 (รันตรงบน Windows ไทยรหัสอักษร 874)
// สคริปต์ deploy.ps1 / fix-push.ps1 ตัวจริง + Git จริงในโฟลเดอร์ชั่วคราว (origin เป็น bare repo ในเครื่อง — ไม่มีวัน push ไปที่จริง)
// ค่าลับทุกตัวเป็นของปลอมที่ประกอบขึ้นตอนรัน (ไฟล์นี้ไม่มีข้อความหน้าตาเหมือน token/URL จริงอยู่ในตัว — ด่านจะได้ไม่หยุดไฟล์นี้เอง)
// พิสูจน์ว่าจับของจริง: POS_DEPLOY_SRC=<โฟลเดอร์ที่มีสคริปต์รุ่นก่อนแก้> → ต้องตก
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { makeRunner, eq, ok } = require('./harness_db');
const kit = require('./deploy_test_kit');
const R = makeRunner('--- ผลตรวจ 19 ต.ค. 2569 ข้อ 14/47: ด่านความลับก่อน push · รันตรงบน Windows ไทย ---');
const ROOT = kit.ROOT;
const SRC = process.env.POS_DEPLOY_SRC ? path.resolve(process.env.POS_DEPLOY_SRC) : ROOT;

// ค่าปลอม (ประกอบตอนรัน)
const TG = '1234567890' + ':' + 'Z'.repeat(35);
const DEPLOY_ID = 'AK' + 'fycb' + 'x'.repeat(40);
const HOST = 'script.google' + '.com';
const MARK = 'pos-allow-' + 'fake-secret';

const blocked = {
  'c1 token หั่นเป็น 2 บรรทัด (.js)': { 'tests/c1_split.js': "const T = '" + TG.slice(0, 11) + "' +\n  '" + TG.slice(11) + "';\n" },
  'c2 token เข้ารหัส base64 (.js)': { 'tests/c2_b64.js': "const T = atob('" + Buffer.from(TG).toString('base64') + "');\n" },
  'c3 รหัส deployment เปล่า ๆ AKfyc… (.js)': { 'tests/c3_id.js': "const ID = '" + DEPLOY_ID + "';\n" },
  'c4 URL Apps Script แบบ %-encode (รหัสไม่ขึ้นต้น AKfyc)': { 'tests/c4_enc.js': "const U = 'https%3A%2F%2F" + HOST + '%2Fmacros%2Fs%2F' + 'Q'.repeat(30) + "%2Fexec';\n" },
  'c4b URL Apps Script แบบ JSON \\/ (รหัสไม่ขึ้นต้น AKfyc)': { 'tests/c4b_json.js': 'const U = "https:\\/\\/' + HOST + '\\/macros\\/s\\/' + 'Q'.repeat(30) + '\\/exec";\n' },
  'c6 ไฟล์ .jsonl ใต้ tests/': { 'tests/c6_dump.jsonl': '{"id":"TX-1","customerName":"Synthetic","total":700}\n' },
  'c7 ไฟล์ .html ใต้ tests/': { 'tests/c7_dump.html': '<table><tr><td>Synthetic</td><td>700</td></tr></table>\n' },
  'c8 token ในไฟล์รูป .png (ไบนารี)': { 'tests/c8_shot.png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0]), Buffer.from(TG + '\n'), Buffer.from([0, 1, 2, 255])]) },
  'c10 บรรทัดที่เพิ่มขึ้นต้นด้วย ++ (เดิมถูกข้ามเพราะดูเหมือนหัว +++)': { 'tests/c10_inc.js': "let i = 0;\n++i; const T = '" + TG + "';\n" },
};
const messageOnly = 'c9 token ในข้อความ commit';

(async () => {
  const shells = kit.psShells();
  if (!shells.length || !kit.gitAvailable()) { console.log('  SKIP: ต้องมี PowerShell และ git'); R.done(); return; }
  const commitFiles = (repo, files, msg) => {
    for (const [f, t] of Object.entries(files)) repo.write(f, t);
    repo.git(['add', '-A', '-f']); repo.git(['commit', '-q', '-m', msg || 'synthetic case']);
  };
  for (const shell of shells) for (const script of ['deploy.ps1', 'fix-push.ps1']) {
    const yes = 'function Read-Host { return "y" }';
    // ทุกกรณีใช้ repo เดียว: เริ่มจาก origin ทุกครั้ง (reset + clean) → commit กรณีนั้น (ยังไม่ push) → รันสคริปต์
    await R.t(`${shell} ${script}: ทุกรูปแบบที่พรางความลับ/ไฟล์ข้อมูล ถูกหยุดก่อน push (${Object.keys(blocked).length + 1} กรณี)`, () => {
      const repo = kit.tempRepo({ src: SRC, tag: 'gate' });
      try {
        const start = repo.originHead(), fails = [];
        const cases = Object.entries(blocked).concat([[messageOnly, null]]);
        for (const [name, files] of cases) {
          repo.git(['reset', '-q', '--hard', 'origin/main']); repo.git(['clean', '-qfdx']);
          const before = repo.originHead();
          if (files) commitFiles(repo, files); else { repo.write('README.md', 'synthetic c9\n'); repo.git(['add', '-A']); repo.git(['commit', '-q', '-m', 'debug bot ' + TG]); }
          const r = repo.ps(shell, script, { prelude: yes });
          if (r.status === 0 || repo.originHead() !== before) fails.push(name + ' → ไม่ถูกหยุด: ' + r.out.slice(-160).replace(/\s+/g, ' '));
          else if (!/nothing pushed/.test(r.out)) fails.push(name + ' → หยุดแต่ไม่ได้บอกว่าไม่มีอะไรถูก push: ' + r.out.slice(-160));
        }
        eq(fails, []);
        eq(repo.originHead(), start, 'origin เปลี่ยน');
      } finally { repo.cleanup(); }
    });
    await R.t(`${shell} ${script}: ไฟล์ .html/.jsonl ใหม่ใต้ tests/ ที่ยังไม่ commit → หยุดก่อน git add (index ไม่ถูกแตะ)`, () => {
      const repo = kit.tempRepo({ src: SRC, tag: 'gate' });
      try {
        const before = repo.originHead();
        for (const f of ['tests/export_dump.html', 'tests/export_dump.jsonl']) {
          repo.git(['clean', '-qfdx']); repo.write('README.md', 'x ' + f + '\n'); repo.write(f, 'Synthetic\n');
          const r = repo.ps(shell, script, { prelude: yes });
          ok(r.status !== 0, f + ' ไม่ถูกหยุด: ' + r.out.slice(-300));
          ok(/not code\/font\/image/.test(r.out), f + ' ข้อความ: ' + r.out.slice(-300));
          eq(repo.staged(), []); eq(repo.originHead(), before);
          repo.git(['checkout', '-q', '--', 'README.md']);
        }
      } finally { repo.cleanup(); }
    });
    await R.t(`${shell} ${script}: control — เทสต์ใหม่แบบที่เขียนกันจริง (เบอร์สมมติ 0812345678 · เวลา 13 หลัก · URL ทดสอบสั้น · fixture ที่อนุมัติ · ค่าปลอมที่ติด ${MARK}) → push ได้`, () => {
      const repo = kit.tempRepo({ src: SRC, tag: 'gate' });
      try {
        commitFiles(repo, {
          'tests/test_new_synthetic.js': "const phone = '0812345678', id = '1790000000002', at = 1790000000020;\n" +
            "const url = 'https://" + HOST + "/macros/s/TEST-DEPLOYMENT/exec';\n" +
            "const fakeId = '" + DEPLOY_ID + "'; // " + MARK + '\n' +
            "const fakeB64 = '" + Buffer.from(TG.replace(':', '-')).toString('base64') + "';\n" +
            "for (let i = 0; i < 3; ++i) console.log('=== ผ่าน 1 · ไม่ผ่าน 0 ===');\n",
          'tests/fixtures_codex_money_20261016.json': '[]\n',
          'tests/vendor/some-lib.cjs': 'module.exports = 1;\n', 'tests/vendor/some-lib.LICENSE': 'MIT\n', 'vendor/fonts/new.woff2': 'woff2'
        }, 'add synthetic tests (ไทย)');
        const r = repo.ps(shell, script, { prelude: yes });
        eq(r.status, 0, r.out.slice(-600));
        eq(repo.originHead(), repo.git(['rev-parse', 'HEAD']).stdout.trim());
      } finally { repo.cleanup(); }
    });
  }

  // ทั้ง repo วันนี้ (ทุกไฟล์รวมรูป/ฟอนต์ ตรวจแบบ --text) ส่งขึ้นเป็น commit ใหม่ทั้งก้อน → ด่านต้องไม่หยุดผิด (กันด่านใหม่หยุดงานจริงของร้าน)
  await R.t(`${shells[0]} deploy.ps1: control — ทุกไฟล์ที่ git ติดตามวันนี้ ส่งขึ้นเป็น commit ใหม่ทั้งก้อน → ผ่าน (ไม่มีการหยุดผิด)`, () => {
    const repo = kit.tempRepo({ src: SRC, tag: 'gate-full' });
    try {
      const ls = spawnSync('git', ['-C', process.env.POS_GIT_ROOT || ROOT, '-c', 'core.quotepath=false', 'ls-files', '-z'], { encoding: 'utf8', env: kit.cleanEnv(), maxBuffer: 64 * 1024 * 1024 });
      ok(!ls.error && ls.status === 0, 'git ls-files');
      // เฉพาะไฟล์ที่ยังอยู่ในโฟลเดอร์ — ตอน deploy เทสต์รันก่อน commit: ไฟล์ที่ลบ/ย้ายออกในรอบนี้ git ยังนับว่าติดตามอยู่
      let files = ls.stdout.split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)));
      ok(files.length > 100, 'ไฟล์น้อยผิดปกติ');
      if (!kit.psReadsThaiGitPaths(shells[0])) {   // Windows: ถูกเรียกแบบไม่มีหน้าต่าง console → ข้ามเฉพาะไฟล์ชื่อไทย (ดู deploy_test_kit.js)
        files = files.filter(f => /^[\x20-\x7e]+$/.test(f));
        console.log('    (ไม่มี console ให้ตั้ง UTF-8 — ข้ามไฟล์ชื่อภาษาไทยในข้อนี้ เหลือ ' + files.length + ' ไฟล์)');
      }
      for (const f of files) { const p = path.join(repo.work, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), p); }
      for (const f of ['deploy.ps1', 'fix-push.ps1']) fs.copyFileSync(path.join(SRC, f), path.join(repo.work, f));
      repo.write('tests/run-all.js', "console.log('=== ผ่าน 1 · ไม่ผ่าน 0 ===');\n");
      repo.git(['add', '-A']); repo.git(['commit', '-q', '-m', 'whole tree as one new commit']);
      const r = repo.ps(shells[0], 'deploy.ps1');
      eq(r.status, 0, r.out.slice(-800));
      eq(repo.originHead(), repo.git(['rev-parse', 'HEAD']).stdout.trim());
    } finally { repo.cleanup(); }
  });

  // ── ข้อ 47: README เคยให้รัน powershell -File deploy.ps1 ตรง ๆ — หน้าต่าง Windows ไทยใช้รหัสอักษร 874 ──
  for (const shell of shells) await R.t(`${shell}: รัน deploy.ps1 ตรง ๆ ในหน้าต่างรหัสอักษร 874 แล้วแก้ไฟล์ชื่อภาษาไทย → deploy ได้ (เดิมหยุด "outside allowlist")`, () => {
    if (!kit.psReadsThaiGitPaths(shell)) { console.log('    (ข้าม — PowerShell ที่เทสต์เรียกไม่มีหน้าต่าง console ให้ตั้งรหัสอักษร: ตรวจข้อนี้ได้เมื่อรันในหน้าต่างจริง/บน Linux)'); return; }
    const repo = kit.tempRepo({ src: SRC, tag: 'enc', extraFiles: { 'คู่มือเริ่มใช้งาน.html': '<p>v1</p>\n', 'วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md': '# v1\n' } });
    try {
      repo.write('คู่มือเริ่มใช้งาน.html', '<p>v2</p>\n'); repo.write('วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md', '# v2\n');
      const cp874 = '$enc = [System.Text.Encoding]::GetEncoding(874)\ntry { [Console]::OutputEncoding = $enc } catch { }\n$OutputEncoding = $enc';
      const r = repo.ps(shell, 'deploy.ps1', { prelude: cp874 });
      eq(r.status, 0, r.out.slice(-500));
      ok(/v2/.test(repo.originShow('คู่มือเริ่มใช้งาน.html')) && /v2/.test(repo.originShow('วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md')), 'ไฟล์ภาษาไทยไม่ขึ้น origin');
    } finally { repo.cleanup(); }
  });
  await R.t('ทั้งสองสคริปต์ตั้ง UTF-8 ก่อนเรียก git ครั้งแรก · README แนะนำ deploy.bat', () => {
    for (const f of ['deploy.ps1', 'fix-push.ps1']) {
      const t = fs.readFileSync(path.join(SRC, f), 'utf8');
      const enc = t.indexOf('[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)'), firstGit = t.search(/^\s*(?:\$\w+\s*=\s*)?@?\(?\s*git /m);
      ok(enc > 0 && enc < firstGit, f + ': ต้องตั้งรหัสอักษรก่อน git');
      ok(t.includes('$OutputEncoding = [Text.UTF8Encoding]::new($false)'), f);
    }
    ok(/แนะนำ[^\n]*deploy\.bat|deploy\.bat[^\n]*แนะนำ/.test(fs.readFileSync(path.join(SRC === ROOT ? ROOT : SRC, 'README.md'), 'utf8')), 'README ต้องแนะนำ deploy.bat');
  });
  R.done();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
