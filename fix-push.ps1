# Preview before committing, rebasing or pushing the current branch.
$ErrorActionPreference = 'Stop'
# ผลตรวจ 19 ต.ค. 2569 ข้อ 47: รันตรง ๆ ด้วย powershell -File บน Windows ภาษาไทย (หน้าต่างรหัสอักษร 874) ชื่อไฟล์ภาษาไทยจาก git เพี้ยน
# ตั้งให้อ่าน/เขียนเป็น UTF-8 ก่อนเรียก git ครั้งแรก · ไม่มีหน้าต่าง console = ตั้งไม่ได้ ข้ามไป
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
$OutputEncoding = [Text.UTF8Encoding]::new($false)
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
# ผลตรวจ 19 ต.ค. 2569 ข้อ 14: เดิมกันเฉพาะ "นามสกุลข้อมูลที่รู้จัก" → .jsonl / .html / .pdf ที่มีข้อมูลลูกค้าหลุดได้
#   ตอนนี้กลับด้าน: ใต้ 3 โฟลเดอร์นี้ผ่านเองได้เฉพาะชนิดโค้ด/ฟอนต์/รูป/เอกสาร ($codeFileExts — ครบทุกชนิดที่มีใน repo วันนี้)
#   ชนิดอื่นทุกชนิด (.json .jsonl .csv .html .txt .pdf .zip ...) ต้องมีชื่ออยู่ใน $approvedDataFiles
# เพิ่ม fixture ใหม่: ตรวจว่าเป็นข้อมูลสมมติล้วนแล้วเติมชื่อใน $approvedDataFiles (ทั้ง deploy.ps1 และ fix-push.ps1)
$approvedDataFiles = @('tests/codex-responsive-result.json', 'tests/fixtures_codex_money_20261016.json', 'vendor/fontawesome/LICENSE.txt')
$dataFileDirs = @('tests', 'tools', 'vendor')
$codeFileExts = @('.js', '.cjs', '.mjs', '.css', '.woff2', '.woff', '.ttf', '.png', '.md', '.license')
function Test-UnapprovedDataFile($p) {
    $p = ([string]$p).Trim().Trim('"').TrimEnd('/')
    $inDir = $false
    foreach ($d in $dataFileDirs) { if ($p.StartsWith($d + '/')) { $inDir = $true } }
    if (-not $inDir) { return $false }
    if ($approvedDataFiles -contains $p) { return $false }
    $ext = [System.IO.Path]::GetExtension($p).ToLowerInvariant()
    return -not ($codeFileExts -contains $ext)
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
# ผลตรวจ 19 ต.ค. 2569 ข้อ 14 — ช่องที่ปิดเพิ่ม:
#   · --text: เนื้อไฟล์ไบนารี (.png ฯลฯ) ถูกตรวจด้วย (เดิม git ขึ้นแค่ "Binary files differ" ไม่ได้ตรวจเลย)
#     --no-textconv / --no-ext-diff = ตรวจเนื้อจริง ไม่ใช่ผลแปลงจากโปรแกรมอื่นที่ตั้งไว้ในเครื่อง
#   · ดูว่าบรรทัดไหนเป็น "บรรทัดที่เพิ่ม" จากตำแหน่งใน hunk (เดิมข้ามทุกบรรทัดที่ขึ้นต้น +++ → บรรทัดโค้ด "++x" หลุดการตรวจ)
#   · token ที่ถูกหั่นหลายบรรทัด ('12345678:' +<ขึ้นบรรทัด> 'AAAA...') — ต่อบรรทัดที่เพิ่มติดกัน ตัดช่องว่าง/เครื่องหมายคำพูด/+ แล้วตรวจซ้ำ
#   · ข้อความ commit (เดิม --format= ไม่ได้ตรวจ — token ที่พิมพ์ในข้อความ commit ขึ้น GitHub ได้)
#   · แบบที่ตรวจเพิ่มอยู่ใน Find-PushSecret ด้านล่าง
# Find-PushSecret: คืนคำอธิบายสิ่งที่เจอ หรือ $null
#   2 แบบเดิม (Telegram bot token · URL deployment ของ Apps Script) ตรวจเสมอ ยกเว้นไม่ได้
#   แบบที่เพิ่มรอบนี้: รหัส deployment เปล่า ๆ (AKfyc...) · แบบที่ถูก %-encode หรือ \/ · แบบที่เข้ารหัส base64
#   บรรทัดที่ตั้งใจใส่ค่าปลอมในเทสต์ ให้มีคำ pos-allow-fake-secret ในบรรทัดเดียวกัน → ข้ามเฉพาะแบบที่เพิ่มรอบนี้
#   ไม่ตรวจเบอร์มือถือ/เลขบัตรประชาชน: ลองกับทุกไฟล์ใน repo แล้วชนเบอร์สมมติในเทสต์ (0812345678 ฯลฯ) 53 จุด
#   และเลขเวลา 13 หลักที่ checksum บังเอิญถูก 40 จุด — ด่านที่หยุดผิดบ่อยจะถูกหาทางเลี่ยงจนไม่มีใครเชื่อ
function Find-PushSecret([string]$text, [switch]$NoDecode) {
    if ([string]::IsNullOrEmpty($text)) { return $null }
    $tg = '[0-9]{8,10}:[A-Za-z0-9_-]{35}'
    $url = 'script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}'
    $id = 'AKfyc[A-Za-z0-9_-]{20,}'
    if ($text -match $tg) { return 'something that looks like a Telegram bot token' }
    if ($text -match $url) { return 'an Apps Script deployment URL' }
    if ($text.Contains('pos-allow-fake-secret')) { return $null }
    if ($text -cmatch $id) { return 'an Apps Script deployment ID (AKfyc...)' }
    if ($NoDecode) { return $null }
    $dec = $text.Replace('\/', '/')
    if ($dec.Contains('%')) { try { $dec = [Uri]::UnescapeDataString($dec) } catch { } }
    if ($dec -cne $text) {
        if ($dec -match $tg) { return 'something that looks like a Telegram bot token (URL-encoded)' }
        if (($dec -match $url) -or ($dec -cmatch $id)) { return 'an Apps Script deployment URL/ID (URL-encoded)' }
    }
    foreach ($m in [regex]::Matches($text, '[A-Za-z0-9+/]{40,}')) {
        for ($off = 0; $off -lt 4; $off++) {
            $b64 = $m.Value.Substring($off)
            if ($b64.Length % 4 -eq 1) { $b64 = $b64.Substring(0, $b64.Length - 1) }
            $b64 = $b64 + ('=' * ((4 - $b64.Length % 4) % 4))   # เติม = ท้ายให้ครบ (ตัดทิ้งจะเสียตัวอักษรท้าย token)
            try { $plain = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) } catch { continue }
            if ($plain -match $tg) { return 'something that looks like a Telegram bot token (base64)' }
            if (($plain -match $url) -or ($plain -cmatch $id)) { return 'an Apps Script deployment URL/ID (base64)' }
        }
    }
    return $null
}
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
    $patch = @(git -c core.quotepath=false log -m -p --text --no-textconv --no-ext-diff --no-color --format= $range)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect commits to push ($range) - nothing pushed" }
    $inHunk = $false
    $run = New-Object System.Text.StringBuilder
    foreach ($line in (@($patch) + @(''))) {
        $l = [string]$line
        # ใน hunk ทุกบรรทัดที่ขึ้นต้น + คือเนื้อไฟล์ (รวม "+++x" ที่มาจากโค้ด "++x") · นอก hunk ข้ามเฉพาะหัวไฟล์ "+++ b/..."
        $added = $l.StartsWith('+') -and ($inHunk -or -not $l.StartsWith('+++'))
        if ($added) {
            $body = $l.Substring(1)
            $why = Find-PushSecret $body
            if ($why) { Fail "a commit waiting to be pushed contains $why - nothing pushed" }
            if (-not $body.Contains('pos-allow-fake-secret')) { [void]$run.Append([regex]::Replace($body, '[\s''"`+\\]', '')); continue }
        }
        if ($run.Length -gt 0) {
            $why = Find-PushSecret $run.ToString() -NoDecode
            if ($why) { Fail "a commit waiting to be pushed contains $why (split across lines) - nothing pushed" }
            [void]$run.Clear()
        }
        if ($l.StartsWith('diff ')) { $inHunk = $false } elseif ($l.StartsWith('@@')) { $inHunk = $true }
    }
    $msgRaw = @(git -c core.quotepath=false log --format=%B%x00 $range)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect commit messages ($range) - nothing pushed" }
    foreach ($msg in ([string]::Join("`n", $msgRaw)).Split([char]0)) {
        $why = Find-PushSecret $msg
        if (-not $why) { $why = Find-PushSecret ([regex]::Replace($msg, '[\s''"`+\\]', '')) -NoDecode }
        if ($why) { Fail "a commit message waiting to be pushed contains $why - nothing pushed. Reword that commit message first" }
    }
}

# --- ไฟล์ที่หน้าแอปเรียกใช้ต้องขึ้นเว็บไปด้วยครบ (ผลตรวจ 19 ต.ค. 2569 ข้อ 13) ------------------------
# เดิม: เพิ่มไฟล์ใหม่ที่ราก (เช่น extra.js) แล้วใส่ <script src> ใน index.html แต่ลืมเติมชื่อใน $safePaths (ไฟล์นี้) / $safeNewPaths (deploy.ps1)
#   → สคริปต์แค่พิมพ์ "note" สีเหลือง แล้วขึ้น DEPLOYED · เว็บเรียกไฟล์ที่ไม่มีอยู่จริง เครื่องที่โหลดใหม่เปิดแอปไม่ขึ้น
#   หรือ Service Worker ติดตั้งไม่ผ่าน iPad ไม่อัปเดตเลยโดยไม่มีข้อความอะไร
# ตอนนี้: ไล่ไฟล์ที่ index.html (src/href) · sw.js (ทุกรายการ ..._ASSETS) · manifest.json (icons · start_url) อ้างถึง
#   ทุกไฟล์ต้องมีอยู่จริง และ (git ติดตามอยู่แล้ว หรือเป็นไฟล์ใหม่ในรายการอนุญาตที่จะถูก stage รอบนี้) — ไม่ครบ = หยุดก่อนแตะ index
#   เทียบชื่อแบบตัวเล็ก/ใหญ่ตรงกันเป๊ะ: GitHub Pages แยกตัวพิมพ์ แต่ Windows ไม่แยก (App.js เปิดได้ในเครื่อง แต่บนเว็บหาไม่เจอ)
#   ไฟล์พวกนี้ถูกนับเป็น "ไฟล์ของแอป" ตอนตัดสินว่าจะบวกเลขแคชไหมด้วย (ไฟล์ใหม่ที่แอปเรียก แก้แล้ว iPad ต้องได้รุ่นใหม่)
function Get-AppFileRefs {
    $raw = New-Object System.Collections.Generic.List[string]
    $indexPath = Join-Path $PSScriptRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) { Fail "index.html not found - cannot check which files the app needs" }
    $html = [regex]::Replace([System.IO.File]::ReadAllText($indexPath), '(?s)<!--.*?-->', '')
    foreach ($m in [regex]::Matches($html, '(?i)<[a-z][^>]*?\s(?:src|href)\s*=\s*["'']([^"'']*)["'']')) { $raw.Add($m.Groups[1].Value) }
    $swText = [regex]::Replace([System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'sw.js')), '(?m)^\s*//.*$', '')
    $lists = @([regex]::Matches($swText, '(?s)\bconst\s+(\w*ASSETS)\s*=\s*\[(.*?)\]'))
    if (-not ($lists | Where-Object { $_.Groups[1].Value -eq 'CORE_ASSETS' })) { Fail "cannot find CORE_ASSETS in sw.js - cannot check which files the app needs" }
    foreach ($l in $lists) {
        $items = @([regex]::Matches($l.Groups[2].Value, '[''"]([^''"]*)[''"]') | ForEach-Object { $_.Groups[1].Value })
        $after = $swText.Substring($l.Index + $l.Length)
        if ($after -match '^\s*\.map\(') {
            $mm = [regex]::Match($after, '^\s*\.map\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*''([^'']*)''\s*\+\s*(\w+)\s*\+\s*''([^'']*)''\s*\)')
            if (-not $mm.Success -or $mm.Groups[1].Value -ne $mm.Groups[3].Value) { Fail "cannot read the file list $($l.Groups[1].Value) in sw.js (unknown .map form) - update Get-AppFileRefs in deploy.ps1 and fix-push.ps1" }
            $items = @($items | ForEach-Object { $mm.Groups[2].Value + $_ + $mm.Groups[4].Value })
        }
        foreach ($i in $items) { $raw.Add($i) }
    }
    $manifestPath = Join-Path $PSScriptRoot 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath) {
        try { $man = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json } catch { Fail "manifest.json is not valid JSON - the app could not be installed: $($_.Exception.Message)" }
        if ($man.start_url) { $raw.Add([string]$man.start_url) }
        foreach ($k in @('icons', 'screenshots')) { foreach ($ic in @($man.$k)) { if ($ic -and $ic.src) { $raw.Add([string]$ic.src) } } }
    }
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($r in $raw) {
        $s = ([string]$r).Trim()
        if (-not $s) { continue }
        if ($s -match '^(?:[A-Za-z][A-Za-z0-9+.-]*:|//|#)') { continue }   # https: data: mailto: tel: javascript: · //เว็บอื่น · #จุดในหน้า
        if ($s.Contains('${') -or $s.Contains('{{')) { continue }          # ค่าที่สคริปต์เติมตอนรัน
        $s = ($s -split '[?#]', 2)[0]
        try { $s = [Uri]::UnescapeDataString($s) } catch { }
        if ($s.StartsWith('/')) { Fail "index.html/sw.js/manifest.json refers to '$r' with a leading / - on GitHub Pages that points outside the app folder. Use a relative path like ./name" }
        while ($s.StartsWith('./')) { $s = $s.Substring(2) }
        if ($s -eq '' -or $s.EndsWith('/')) { $s = $s + 'index.html' }
        $parts = $s.Split('/')
        if (($parts -contains '..') -or ($parts -contains '.')) { Fail "index.html/sw.js/manifest.json refers to '$r' - use a plain relative path without ./ or ../ in the middle" }
        if (-not $out.Contains($s)) { $out.Add($s) }
    }
    return $out.ToArray()
}
$script:appFileRefs = @()
function Assert-AppFilesDeployable($statusLines) {
    $refs = @(Get-AppFileRefs)
    $trackedRaw = @(git -c core.quotepath=false ls-files -z)
    if ($LASTEXITCODE -ne 0) { Fail "cannot list tracked files (git ls-files) - nothing staged" }
    $tracked = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($t in ([string]::Join("`n", $trackedRaw)).Split([char]0)) { if ($t) { [void]$tracked.Add($t) } }
    $untracked = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($line in $statusLines) {
        if (-not $line -or -not ([string]$line).StartsWith('?? ')) { continue }
        $u = ([string]$line).Substring(3).Trim()
        if ($u.Length -ge 2 -and $u.StartsWith('"') -and $u.EndsWith('"')) { $u = $u.Substring(1, $u.Length - 2).Replace('\"', '"').Replace('\\', '\') }
        [void]$untracked.Add($u)
    }
    $problems = @()
    foreach ($p in $refs) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $p) -PathType Leaf)) { $problems += "   $p  (file does not exist)"; continue }
        if ($tracked.Contains($p)) { continue }
        if ($untracked.Contains($p)) {
            if (Is-Safe $p) { continue }
            $problems += "   $p  (new file NOT in the allowlist `$safePaths)"; continue
        }
        $problems += "   $p  (not tracked by git: ignored by .gitignore, or the upper/lower case differs from the real file name)"
    }
    if ($problems.Count -gt 0) {
        Write-Host ""
        Write-Host "The app (index.html / sw.js / manifest.json) uses these files, but they would NOT reach the website:" -ForegroundColor Red
        $problems | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        Fail "files the app needs are missing from the deploy - nothing staged. Add a new app file to `$safeNewPaths in deploy.ps1 and `$safePaths in fix-push.ps1, or fix the name in index.html / sw.js / manifest.json"
    }
    $script:appFileRefs = $refs
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
        Fail "new file under tests/tools/vendor is not code/font/image ($($codeFileExts -join ' ')) and not in the approved fixture list: $($line.Substring(3)) - nothing staged. Move it out, or if it is synthetic test data add it to `$approvedDataFiles in deploy.ps1 and fix-push.ps1"
    }
}
# ข้อ 13: ไฟล์ที่แอปเรียกใช้ต้องขึ้นเว็บไปด้วยครบ — หยุดก่อนถาม ก่อนแตะ index/HEAD
Assert-AppFilesDeployable $untrackedAll
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
$aheadApp = @($aheadPaths | Where-Object { @('index.html', 'app.js', 'style_v2.css', 'manifest.json', 'promptpay-qr.js', 'dexie.min.js', 'apple-touch-icon.png') -contains $_ -or $_.StartsWith('vendor/') -or $script:appFileRefs -ccontains $_ })
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
