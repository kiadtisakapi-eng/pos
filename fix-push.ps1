# Preview before committing, rebasing or pushing the current branch.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Fail($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; exit 1 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Git not found' }
if (Test-Path -LiteralPath '.git/index.lock') { Fail 'Git index.lock exists; verify its owner before manual recovery' }
$safePaths = @('.nojekyll', '.gitattributes', '.gitignore', 'index.html', 'app.js', 'style_v2.css',
    'sw.js', 'manifest.json', 'promptpay-qr.js', 'dexie.min.js', 'google_apps_script.js', 'README.md',
    'SYSTEM_OVERVIEW.md', 'deploy.ps1', 'deploy.bat', 'fix-push.ps1', 'fix-push.bat', 'tests', 'vendor', 'tools', 'apple-touch-icon.png', 'คู่มือเริ่มใช้งาน.html',
    'วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md')
# ตรวจ 18 ต.ค. 2569 รอบ 2 (C04): allowlist ทั้งโฟลเดอร์ tests/ tools/ vendor/ ยังรับ "ไฟล์ข้อมูล" ชื่อทั่วไปได้
# (เช่นคัดลอกไฟล์ส่งออกของร้านมาไล่ปัญหาแล้วตั้งชื่อ tests/export.json) — .gitignore กันได้เฉพาะชื่อที่แอปตั้งเอง
# ไฟล์โค้ด/ฟอนต์/ภาพในโฟลเดอร์พวกนี้ยังผ่านตามเดิม · ไฟล์ข้อมูล (นามสกุลด้านล่าง) ต้องอยู่ในรายชื่ออนุมัติเท่านั้น
# เพิ่ม fixture ใหม่: ตรวจว่าเป็นข้อมูลสมมติล้วนแล้วเติมชื่อใน $approvedDataFiles (ทั้ง deploy.ps1 และ fix-push.ps1)
$approvedDataFiles = @('tests/codex-responsive-result.json', 'tests/fixtures_codex_money_20261016.json', 'vendor/fontawesome/LICENSE.txt')
$dataFileDirs = @('tests', 'tools', 'vendor')
$dataFileExts = @('.json', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.xlsm', '.ods', '.zip', '.7z', '.rar', '.gz', '.tar', '.db', '.sqlite', '.sqlite3', '.bak', '.log')
function Test-UnapprovedDataFile($p) {
    $p = ([string]$p).Trim().Trim('"').TrimEnd('/')
    $inDir = $false
    foreach ($d in $dataFileDirs) { if ($p.StartsWith($d + '/')) { $inDir = $true } }
    if (-not $inDir) { return $false }
    $ext = [System.IO.Path]::GetExtension($p).ToLowerInvariant()
    if (-not ($dataFileExts -contains $ext)) { return $false }
    return -not ($approvedDataFiles -contains $p)
}
function Is-Safe($p) {
    if (Test-UnapprovedDataFile $p) { return $false }
    foreach ($s in $safePaths) { if ($p -eq $s -or $p.StartsWith($s + '/')) { return $true } }
    return $false
}
function Read-GitPaths($gitArgs) {
    $raw = @(& git @gitArgs)
    if ($LASTEXITCODE -ne 0) { Fail 'cannot inspect Git paths' }
    return @(($raw -join [Environment]::NewLine).Split([char]0) | Where-Object { $_ })
}
function Check-Index {
    foreach ($p in (Read-GitPaths @('-c','core.quotepath=false','diff','--cached','--name-only','--no-renames','-z'))) {
        if (-not (Is-Safe $p)) { Fail "staged path outside project allowlist: $p (index preserved)" }
    }
}
# ตรวจ 18 ต.ค. 2569 (F04): ตรวจ "ทุก commit ที่กำลังจะ push" ก่อน push ทุกครั้ง
# เดิมตรวจเฉพาะไฟล์ที่ stage/แก้อยู่ — commit ที่ค้างอยู่ก่อน (จาก VS Code / commit มือ) ซึ่งมีไฟล์ส่วนตัว push ขึ้น repo สาธารณะได้
# ต้องดูทีละ commit ไม่ใช่แค่ผลต่างสุทธิ: เพิ่มไฟล์ส่วนตัวแล้วลบใน commit ถัดไป ไฟล์ยังอยู่ใน history ให้ทุกคนเปิดได้
# รอบ 2 (C02): ใช้ -m ทั้งรายชื่อไฟล์และ patch — ไม่มี -m git ไม่แสดง diff ของ merge commit เลย
#   token ที่ใส่ตอนแก้ conflict จึงหลุดผ่าน (ทดสอบกับ Git จริงแล้ว)
# และตรวจบรรทัดที่เพิ่มว่ามี Telegram bot token / URL deployment ของ Apps Script หรือไม่ (ความลับที่ไม่ควรอยู่ในไฟล์ใดเลย)
function Assert-SafeOutgoing($range) {
    $net = @(git -c core.quotepath=false diff --name-only --no-renames -z $range)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect commits to push ($range) - nothing pushed" }
    $hist = @(git -c core.quotepath=false log -m --format= --name-only --no-renames -z $range)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect commits to push ($range) - nothing pushed" }
    $joined = ([string]::Join("`n", $net)) + [char]0 + ([string]::Join("`n", $hist))
    $paths = @($joined.Split([char]0) | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    foreach ($p in $paths) {
        if (-not (Is-Safe $p)) {
            Fail "a commit waiting to be pushed contains a path outside the project allowlist: $p - nothing pushed. Remove it from the unpushed commits first (deleting it in a later commit is not enough: it stays in history)"
        }
    }
    $patch = @(git -c core.quotepath=false log -m -p --no-color --format= $range)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect commits to push ($range) - nothing pushed" }
    foreach ($line in $patch) {
        if ($null -eq $line) { continue }
        $l = [string]$line
        if (-not $l.StartsWith('+') -or $l.StartsWith('+++')) { continue }
        if ($l -match '[0-9]{8,10}:[A-Za-z0-9_-]{35}') { Fail "a commit waiting to be pushed contains something that looks like a Telegram bot token - nothing pushed" }
        if ($l -match 'script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}') { Fail "a commit waiting to be pushed contains an Apps Script deployment URL - nothing pushed" }
    }
}
Check-Index
$branch = git symbolic-ref --short HEAD
if ($LASTEXITCODE -ne 0) { Fail 'detached HEAD; select a branch first' }
$upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
if ($LASTEXITCODE -ne 0 -or -not $upstream) { Fail 'this branch has no upstream; configure it explicitly first' }
$tracked = @(Read-GitPaths @('-c','core.quotepath=false','diff','HEAD','--name-only','--no-renames','-z'))
foreach ($p in $tracked) { if (-not (Is-Safe $p)) { Fail "tracked change outside allowlist: $p" } }
# รอบ 2 (C04): ไฟล์ข้อมูลใหม่ใต้ tests/tools/vendor ที่ไม่ได้อนุมัติ = หยุดก่อน stage (git add ทั้งโฟลเดอร์จะหยิบไปด้วย)
$untrackedAll = @(git -c core.quotepath=false status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { Fail 'cannot inspect untracked files' }
foreach ($line in $untrackedAll) {
    if ($line -and $line.StartsWith('?? ') -and (Test-UnapprovedDataFile $line.Substring(3))) {
        Fail "new data file under tests/tools/vendor is not in the approved fixture list: $($line.Substring(3)) - nothing staged. Move it out, or if it is synthetic test data add it to `$approvedDataFiles in deploy.ps1 and fix-push.ps1"
    }
}
Write-Host "Branch: $branch -> $upstream" -ForegroundColor Cyan
 git status --short
 git diff --stat HEAD
if ($LASTEXITCODE -ne 0) { Fail 'cannot preview changes' }
Write-Host 'Only allowlisted project changes will be committed. Other new files stay local.'
git fetch
if ($LASTEXITCODE -ne 0) { Fail 'fetch failed' }
git log --oneline "HEAD..$upstream"
git log --oneline "$upstream..HEAD"
Assert-SafeOutgoing "$upstream..HEAD"   # F04: commit ที่ค้างอยู่ก่อนต้องสะอาด ก่อนถามและก่อนแตะ index/HEAD
$answer = Read-Host 'Commit the displayed project changes, rebase and push this branch? (y/n)'
if ($answer.Trim().ToLowerInvariant() -ne 'y') { Write-Host 'Stopped. Working files, index and HEAD unchanged.'; exit 0 }
# ตรวจ 13 ต.ค. 2569 ข้อ 12: ทางนี้ commit + push ไฟล์ของแอปได้ จึงต้องรันเทสต์ก่อนเหมือน deploy.ps1
$node = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($node) { $node.Source } else { $null }
if (-not $nodePath) {
    $standardNodePath = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'nodejs\node.exe'
    if (Test-Path -LiteralPath $standardNodePath) { $nodePath = $standardNodePath }
}
if (-not $nodePath) { Fail 'node not found. Install Node.js LTS, then reopen this window.' }
$testsPath = Join-Path $PSScriptRoot 'tests\run-all.js'
if (-not (Test-Path -LiteralPath $testsPath)) { Fail 'tests/run-all.js not found' }
& $nodePath $testsPath
if ($LASTEXITCODE -ne 0) { Fail 'tests failed - fix them before pushing' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff', [Globalization.CultureInfo]::InvariantCulture)
$safety = "safety-$stamp"
git branch $safety HEAD
if ($LASTEXITCODE -ne 0) { Fail 'cannot create safety branch; no changes committed' }
$stagePaths = @($safePaths | Where-Object { (Test-Path -LiteralPath $_) -or ($tracked -contains $_) })
git add -A -- $stagePaths
if ($LASTEXITCODE -ne 0) { Fail 'staging failed; inspect the index before retrying' }
Check-Index
$staged = @(Read-GitPaths @('diff','--cached','--name-only','-z'))
if ($staged.Count -gt 0) {
    git commit -m 'chore: reviewed local project changes before upstream sync'
    if ($LASTEXITCODE -ne 0) { Fail 'commit failed' }
}
git rebase $upstream
if ($LASTEXITCODE -ne 0) {
    if ((Test-Path -LiteralPath '.git/rebase-merge') -or (Test-Path -LiteralPath '.git/rebase-apply')) {
        git rebase --abort
        if ($LASTEXITCODE -ne 0) { Fail "rebase abort failed; stop and inspect (safety branch: $safety)" }
    }
    Fail "rebase failed; local commits retained (safety branch: $safety)"
}
# ตรวจ 13 ต.ค. 2569 ข้อ 12: commit ที่จะขึ้นเว็บแตะไฟล์ของแอปแต่ไม่ได้บวกเลขแคช = iPad ค้างรุ่นเก่า → บวกให้ก่อน push
$aheadPaths = @(Read-GitPaths @('-c','core.quotepath=false','diff','--name-only','--no-renames','-z',"$upstream..HEAD"))
$aheadApp = @($aheadPaths | Where-Object { @('index.html', 'app.js', 'style_v2.css', 'manifest.json', 'promptpay-qr.js', 'dexie.min.js', 'apple-touch-icon.png') -contains $_ -or $_.StartsWith('vendor/') })
if ($aheadApp.Count -gt 0 -and -not ($aheadPaths -contains 'sw.js')) {
    $swPath = Join-Path $PSScriptRoot 'sw.js'
    $swTxt = [System.IO.File]::ReadAllText($swPath)
    $swM = [regex]::Match($swTxt, 'jahn-pos-v(\d+)')
    if (-not $swM.Success) { Fail "pattern jahn-pos-vN not found in sw.js - iPad would NOT receive the update (safety branch: $safety)" }
    $swNew = [int]$swM.Groups[1].Value + 1
    $swTxt = (New-Object System.Text.RegularExpressions.Regex('jahn-pos-v\d+')).Replace($swTxt, "jahn-pos-v$swNew", 1)
    [System.IO.File]::WriteAllText($swPath, $swTxt, (New-Object System.Text.UTF8Encoding($false)))
    git add -- sw.js
    if ($LASTEXITCODE -ne 0) { Fail "git add sw.js failed (safety branch: $safety)" }
    Check-Index
    git commit -m "deploy v$swNew (cache bump)"
    if ($LASTEXITCODE -ne 0) { Fail "commit (cache bump) failed (safety branch: $safety)" }
    Write-Host "Service Worker cache bumped to jahn-pos-v$swNew" -ForegroundColor Green
}
# ผู้ตรวจอิสระ 13 ต.ค. 2569: ของที่จะขึ้นเว็บคือ "หลัง rebase" (ของบน GitHub + commit ในเครื่อง) — ต้องผ่านเทสต์อีกรอบก่อน push
& $nodePath $testsPath
if ($LASTEXITCODE -ne 0) { Fail "tests failed after rebase - nothing pushed (safety branch: $safety)" }
Assert-SafeOutgoing "$upstream..HEAD"
git push
if ($LASTEXITCODE -ne 0) { Fail "push failed; local commits retained (safety branch: $safety)" }
Write-Host "Pushed $branch. Safety branch: $safety" -ForegroundColor Green
