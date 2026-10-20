// Re-run regression files against isolated code copies. Never copies audit/shop data.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-codex-review-20261014-'));
const before = path.join(root, 'backup', 'ก่อนแก้_claude_20261014b');
const assets = ['app.js', 'google_apps_script.js', 'index.html', 'style_v2.css', 'sw.js', 'dexie.min.js',
  'promptpay-qr.js', 'manifest.json', 'apple-touch-icon.png', 'vendor'];
for (const name of assets) fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
fs.mkdirSync(path.join(dir, 'tests'));
for (const name of fs.readdirSync(__dirname)) {
  if (name.endsWith('.js') || name === 'vendor') fs.cpSync(path.join(__dirname, name), path.join(dir, 'tests', name), { recursive: true });
}
const originalBackup = path.join(dir, 'backup', 'ก่อนแก้_claude_20261014b');
fs.mkdirSync(originalBackup, { recursive: true });
for (const name of ['app.js', 'google_apps_script.js', 'index.html', 'style_v2.css']) {
  fs.copyFileSync(path.join(before, name), path.join(dir, name));
  fs.copyFileSync(path.join(before, name), path.join(originalBackup, name));
}
// ไฟล์สำรองจริงใหม่สุดใน audit/ (ถ้ามี) — ไม่เขียนชื่อไฟล์จริงไว้ใน repo สาธารณะ (ผลตรวจ 19 ต.ค. 2569 ข้อ 71)
const realBackup = (() => { try { const f = fs.readdirSync(path.join(root, 'audit')).filter(n => /^pos_backup_.*\.json$/.test(n)).sort().pop(); return f ? path.join(root, 'audit', f) : ''; } catch (e) { return ''; } })();
const env = { ...process.env, TZ: 'Asia/Bangkok', POS_REAL_BACKUP: realBackup };
delete env.POS_APP_SRC; delete env.POS_GAS_SRC;
// Existing runtime restricts browser requests to localhost and directs screenshots into tests/.
if (env.NODE_OPTIONS) env.NODE_OPTIONS = '--require=' + JSON.stringify(path.join(__dirname, 'codex-browser-runtime.js'));
console.log('Isolated copy: ' + dir);
function run(round, name) {
  const r = cp.spawnSync(process.execPath, [path.join(dir, 'tests', name)], { cwd: dir, env, encoding: 'utf8', timeout: 240000, maxBuffer: 4e6 });
  const out = (r.stdout || '') + (r.stderr || '');
  const summary = [...out.matchAll(/=== ผ่าน (\d+) · ไม่ผ่าน (\d+) ===/g)].pop();
  console.log(JSON.stringify({ round, name, exit: r.status, pass: summary ? +summary[1] : null, fail: summary ? +summary[2] : null, error: r.error ? r.error.message : undefined }));
}
if (!process.argv.includes('--round2-only')) {
  for (let n = 1; n <= 7; n++) run('before-round1', `test_fix_20261014_fx${n}.js`);
  if (process.argv.includes('--ui')) run('before-round1', 'e2e_fix_20261014.js');
}
// Feed the archive through stdin: Windows tar can misdecode a Thai absolute filename.
cp.execFileSync('tar', ['-xzf', '-', '-C', dir, 'app.js', 'google_apps_script.js', 'index.html', 'style_v2.css'],
  { input: fs.readFileSync(path.join(root, 'audit', 'claude-audit-20261014', 'pos_fix_round1.tgz')) });
for (const suffix of ['gx1', 'gx3', 'gx4', 'gx7', 'iv2']) run('after-round1', `test_fix_20261014b_${suffix}.js`);
