# ============================================================
#  Erotica POS - One-command deploy
#  1) ตรวจสภาพ git ให้พร้อมก่อน (กันเคสที่เคยเจอ: index.lock ค้าง แล้วสคริปต์เดินต่อเงียบ ๆ)
#  2) รันชุดทดสอบก่อนแตะเวอร์ชันหรือ stage ไฟล์
#  3) บวกเลขเวอร์ชัน Service Worker (jahn-pos-vN -> vN+1) เฉพาะเมื่อมีของจะ deploy จริง
#  4) stage เฉพาะไฟล์โครงการ (ไม่กวาดไฟล์สำรอง/ความลับที่เพิ่งอยู่ในโฟลเดอร์)
#  5) commit + push -> GitHub Pages อัปเดตเอง
#
#  วิธีใช้:  ดับเบิลคลิก deploy.bat   (แนะนำ)
#           หรือ  powershell -ExecutionPolicy Bypass -File deploy.ps1 "ข้อความ commit"
# ============================================================
# ผลตรวจ 19 ต.ค. 2569 ข้อ 47: รันตรง ๆ ด้วย powershell -File (ไม่ผ่าน deploy.bat ที่สั่ง chcp 65001) บน Windows ภาษาไทย
# หน้าต่างใช้รหัสอักษร 874 → ชื่อไฟล์ภาษาไทยที่อ่านจาก git เพี้ยน แล้วหยุดว่า "outside allowlist" ทั้งที่ไฟล์ถูกต้อง
# ตั้งให้อ่าน/เขียนเป็น UTF-8 ก่อนเรียก git ครั้งแรก · ไม่มีหน้าต่าง console (เช่นถูกเรียกจากโปรแกรมอื่น) = ตั้งไม่ได้ ข้ามไป
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-Location -Path $PSScriptRoot

function Fail($msg) {
    Write-Host ""
    Write-Host "DEPLOY STOPPED: $msg" -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Run-ProjectTests {
    $node = Get-Command node -ErrorAction SilentlyContinue
    $nodePath = if ($node) { $node.Source } else { $null }
    # Node ที่เพิ่งติดตั้งอาจยังไม่อยู่ใน PATH ของหน้าต่าง PowerShell เก่า
    # จึงตรวจตำแหน่งมาตรฐานเพิ่ม เพื่อไม่ให้ deploy หยุดทั้งที่ Node ติดตั้งแล้วจริง
    if (-not $nodePath) {
        $standardNodePath = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'nodejs\node.exe'
        if (Test-Path -LiteralPath $standardNodePath) { $nodePath = $standardNodePath }
    }
    if (-not $nodePath) { Fail "node not found. Install Node.js LTS, then reopen this window before deploy." }
    $tests = Join-Path $PSScriptRoot 'tests\run-all.js'
    if (-not (Test-Path $tests)) { Fail "tests/run-all.js not found" }
    Write-Host "[2/6] running tests ..." -ForegroundColor Cyan
    & $nodePath $tests
    if ($LASTEXITCODE -ne 0) { Fail "tests failed - fix them before deploy" }
}

# --- 0) git ใช้งานได้ไหม -------------------------------------------------
# เดิมไม่ได้เช็ค ถ้า git หายไปจาก PATH สคริปต์จะเดินจนจบแล้วบอกว่าสำเร็จ
$null = (Get-Command git -ErrorAction SilentlyContinue)
if (-not $?) { Fail "git not found in PATH. Install Git for Windows, then reopen this window." }

$swPath = Join-Path $PSScriptRoot 'sw.js'
if (-not (Test-Path $swPath)) { Fail "sw.js not found" }

# --- 0.1) ล้าง index.lock ที่ค้าง ---------------------------------------
# สาเหตุจริงที่ deploy ไม่ขึ้นเมื่อ 27 ก.ค. — ไฟล์ล็อกค้างจาก git ที่ถูกขัดจังหวะ
# ทำให้ git add ล้มทุกครั้ง แต่สคริปต์เดิมไม่เช็ค exit code เลยเดินต่อจนพิมพ์ DEPLOYED
$lock = Join-Path $PSScriptRoot '.git\index.lock'
if (Test-Path $lock) {
    Fail "Git index.lock exists. Stop other Git operations and verify the lock owner before manual recovery. The script never removes a Git lock."
}

# --- รายการไฟล์ใหม่ (untracked) ที่อนุญาตให้ขึ้น repo ------------------------
$safeNewPaths = @(
    '.nojekyll', '.gitattributes', '.gitignore',
    'index.html', 'app.js', 'style_v2.css', 'sw.js', 'manifest.json',
    'promptpay-qr.js', 'dexie.min.js', 'google_apps_script.js', 'README.md',
    'SYSTEM_OVERVIEW.md', 'deploy.ps1', 'deploy.bat', 'fix-push.ps1', 'fix-push.bat', 'tests', 'apple-touch-icon.png', 'คู่มือเริ่มใช้งาน.html', 'วิธีกู้ข้อมูล_อ่านตอนฉุกเฉิน.md',
    # Font Awesome ที่ย้ายมาเก็บเอง — ถ้าลืมบรรทัดนี้ ไฟล์จะไม่ถูก push
    # แล้วไอคอนทั้งแอปบนเว็บจริงจะหายหมดทันทีโดยสคริปต์ไม่เตือนอะไรเลย
    'vendor',
    # เครื่องมือวัดผล/สคริปต์ช่วยงานของโปรเจกต์ — ไม่มีความลับอยู่ในนั้น
    # ถ้าไม่ใส่ชื่อไว้ที่นี่ โฟลเดอร์จะค้างเป็น untracked ตลอด แล้ว git status ไม่มีวันว่าง
    # ทำให้สคริปต์นี้คิดว่า 'มีของจะ deploy' ทุกครั้ง แล้ว push เวอร์ชันเปล่าขึ้นเว็บ
    'tools'
)

# path จาก git status อยู่ในรายการอนุญาตไหม (ชื่อไฟล์ตรง หรืออยู่ใต้โฟลเดอร์ที่อนุญาต)
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

function Test-SafeNewPath($p) {
    $p = $p.Trim().Trim('"').TrimEnd('/')
    if (Test-UnapprovedDataFile $p) { return $false }
    foreach ($s in $safeNewPaths) { if ($p -eq $s -or $p.StartsWith($s + '/')) { return $true } }
    return $false
}

# Include both sides of renames and deleted files. Never reset the user's index.
function Assert-SafeIndex {
    $raw = @(git -c core.quotepath=false diff --cached --name-only --no-renames -z)
    if ($LASTEXITCODE -ne 0) { Fail "cannot inspect staged paths" }
    $paths = ([string]::Join("`n", $raw)).Split([char]0) | Where-Object { $_ }
    foreach ($p in $paths) {
        if (-not (Test-SafeNewPath $p)) { Fail "staged path outside project allowlist: $p (index preserved)" }
    }
}
# ตรวจ 18 ต.ค. 2569 (F04): ตรวจ "ทุก commit ที่กำลังจะ push" ก่อน push ทุกครั้ง
# เดิมตรวจเฉพาะไฟล์ที่ stage/แก้อยู่ — commit ที่ค้างอยู่ก่อน (จาก VS Code / commit มือ) ซึ่งมีไฟล์ส่วนตัว push ขึ้น repo สาธารณะได้
# ต้องดูทีละ commit ไม่ใช่แค่ผลต่างสุทธิ: เพิ่มไฟล์ส่วนตัวแล้วลบใน commit ถัดไป ไฟล์ยังอยู่ใน history ให้ทุกคนเปิดได้
# รอบ 2 (C02): ใช้ -m ทั้งรายชื่อไฟล์และ patch — ไม่มี -m git ไม่แสดง diff ของ merge commit เลย
#   token ที่ใส่ตอนแก้ conflict จึงหลุดผ่าน (ทดสอบกับ Git จริงแล้ว)
# และตรวจบรรทัดที่เพิ่มว่ามี Telegram bot token / URL deployment ของ Apps Script หรือไม่ (ความลับที่ไม่ควรอยู่ในไฟล์ใดเลย)
#
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
        if (-not (Test-SafeNewPath $p)) {
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
# เดิม: เพิ่มไฟล์ใหม่ที่ราก (เช่น extra.js) แล้วใส่ <script src> ใน index.html แต่ลืมเติมชื่อใน $safeNewPaths
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
            if (Test-SafeNewPath $p) { continue }
            $problems += "   $p  (new file NOT in the allowlist `$safeNewPaths)"; continue
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

Assert-SafeIndex
# F04: commit ที่ค้างอยู่ก่อนแล้วต้องสะอาดตั้งแต่ก่อนเริ่ม — ไม่ stage/commit อะไรเพิ่มถ้าของเก่ามีไฟล์ส่วนตัว
$null = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
if ($LASTEXITCODE -eq 0) { Assert-SafeOutgoing '@{u}..HEAD' }

# --- 1) มีอะไรให้ deploy ไหม --------------------------------------------
# นับเฉพาะของที่ขั้นที่ 4 จะ stage จริง: ไฟล์ที่ติดตามอยู่ + ไฟล์ใหม่ในรายการอนุญาต
# เดิมนับทุกบรรทัดของ git status → มีไฟล์ส่วนตัวที่ไม่ถูกกันวางไว้ในโฟลเดอร์ (ไม่ได้ถูก stage อยู่แล้ว)
# สคริปต์ก็คิดว่ามีของเปลี่ยน แล้วบวกเลขแคช + push รุ่นเปล่า (iPad ขึ้นว่ามีอัปเดตทั้งที่โค้ดเหมือนเดิม)
# รอบ 2 (C04): --untracked-files=all ให้เห็นไฟล์ใหม่ทีละไฟล์ (ไม่ยุบเป็นชื่อโฟลเดอร์) และหยุดก่อน stage ถ้ามีไฟล์ข้อมูลที่ไม่ได้อนุมัติ
$dirtyAll = @(git -c core.quotepath=false status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { Fail "git status failed - is this folder a git repo?" }
foreach ($line in $dirtyAll) {
    if ($line -and $line.StartsWith('?? ') -and (Test-UnapprovedDataFile $line.Substring(3))) {
        Fail "new file under tests/tools/vendor is not code/font/image ($($codeFileExts -join ' ')) and not in the approved fixture list: $($line.Substring(3)) - nothing staged. Move it out of the project, or if it is synthetic test data add it to `$approvedDataFiles in deploy.ps1 and fix-push.ps1"
    }
}
# ข้อ 13: ไฟล์ที่แอปเรียกใช้ต้องขึ้นเว็บไปด้วยครบ — ตรวจก่อนทั้งทาง push commit ค้างและทาง stage ไฟล์
Assert-AppFilesDeployable $dirtyAll
$changedRaw = @(git -c core.quotepath=false diff HEAD --name-only --no-renames -z)
if ($LASTEXITCODE -ne 0) { Fail "cannot inspect changed paths" }
$changedPaths = @(([string]::Join("`n", $changedRaw)).Split([char]0) | Where-Object { $_ })
foreach ($p in $changedPaths) {
    if (-not (Test-SafeNewPath $p)) { Fail "tracked change outside project allowlist: $p (no files staged)" }
}
$dirty = @($dirtyAll | Where-Object { $_ -and ((-not $_.StartsWith('?? ')) -or (Test-SafeNewPath $_.Substring(3))) })
$skipped = @($dirtyAll | Where-Object { $_ -and $_.StartsWith('?? ') -and -not (Test-SafeNewPath $_.Substring(3)) })
if ($skipped.Count -gt 0) {
    Write-Host "note: these new files are NOT in the allowlist and will not be deployed:" -ForegroundColor DarkYellow
    $skipped | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkYellow }
}
if ($dirty.Count -eq 0) {
    $ahead = git rev-list --count '@{u}..HEAD' 2>$null
    if ($LASTEXITCODE -eq 0 -and [int]$ahead -gt 0) {
        Write-Host "[1/6] no file changes, but $ahead commit(s) not pushed yet" -ForegroundColor Yellow
        Run-ProjectTests
        # ตรวจ 13 ต.ค. 2569 ข้อ 12: commit ที่ค้าง push (เช่น commit จาก VS Code / fix-push) แตะไฟล์ของแอปแต่ไม่ได้บวกเลขแคช
        # = iPad ไม่รู้ว่ามีรุ่นใหม่ ใช้ app.js เก่าไปเรื่อย ๆ → บวกเลขแคชให้ใน commit เพิ่ม 1 ตัวก่อน push
        # (ถอยรุ่นด้วย git revert ทั้ง commit ตามคู่มือ = sw.js เปลี่ยนอยู่แล้ว ไม่บวกซ้ำ)
        $aheadRaw = @(git -c core.quotepath=false diff --name-only --no-renames -z '@{u}..HEAD')
        if ($LASTEXITCODE -ne 0) { Fail "cannot inspect unpushed commits" }
        $aheadPaths = @(([string]::Join("`n", $aheadRaw)).Split([char]0) | Where-Object { $_ })
        $aheadApp = @($aheadPaths | Where-Object { @('index.html', 'app.js', 'style_v2.css', 'manifest.json', 'promptpay-qr.js', 'dexie.min.js', 'apple-touch-icon.png') -contains $_ -or $_.StartsWith('vendor/') -or $script:appFileRefs -ccontains $_ })
        if ($aheadApp.Count -gt 0 -and -not ($aheadPaths -contains 'sw.js')) {
            $swTxt = [System.IO.File]::ReadAllText($swPath)
            $swM = [regex]::Match($swTxt, "jahn-pos-v(\d+)")
            if (-not $swM.Success) { Fail "pattern jahn-pos-vN not found in sw.js - users would NOT receive the update" }
            $swOld = [int]$swM.Groups[1].Value
            $swNew = $swOld + 1
            $swTxt = (New-Object System.Text.RegularExpressions.Regex("jahn-pos-v\d+")).Replace($swTxt, "jahn-pos-v$swNew", 1)
            [System.IO.File]::WriteAllText($swPath, $swTxt, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "[3/6] unpushed commits change app files without a cache bump - Service Worker cache: v$swOld -> v$swNew" -ForegroundColor Green
            git add -- sw.js
            if ($LASTEXITCODE -ne 0) { Fail "git add sw.js failed" }
            Assert-SafeIndex
            git commit -m "deploy v$swNew (cache bump for unpushed commits) $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
            if ($LASTEXITCODE -ne 0) { Fail "git commit (cache bump) failed" }
        }
        Assert-SafeOutgoing '@{u}..HEAD'
        git push
        if ($LASTEXITCODE -ne 0) { Fail "git push failed - check login, or run fix-push.bat" }
        Write-Host "PUSHED -> https://kiadtisakapi-eng.github.io/pos/" -ForegroundColor Green
        exit 0
    }
    Write-Host "[1/6] nothing changed - nothing to deploy" -ForegroundColor Yellow
    exit 0
}
Write-Host "[1/6] changes found:" -ForegroundColor Cyan
git status --short

# --- 2) tests -------------------------------------------------------------
# ห้าม bump cache ก่อน test ผ่าน ไม่อย่างนั้นการทดสอบพังจะทำให้เลขเวอร์ชันวิ่งโดยไม่มี deploy
Run-ProjectTests

# --- 3) bump เลขเวอร์ชัน ------------------------------------------------
# ทำหลังจากรู้แล้วว่ามีของจะ deploy จริง — เดิมบวกก่อนเสมอ พอ git ล้ม
# เลขเลยวิ่งขึ้นเรื่อย ๆ ทั้งที่ไม่มีอะไรถูกส่งขึ้นเว็บ
#
# รอบตรวจ 5 ข้อ 9 (2 ต.ค. 2569): บวกเลขเฉพาะเมื่อ "ไฟล์ที่แอปใช้จริง" เปลี่ยน
#   เดิมแก้แค่เอกสาร/เทสต์/เครื่องมือ ก็บวกเลข → iPad ขึ้น "มีเวอร์ชันใหม่" ให้พนักงานกดอัปเดตทั้งที่แอปเหมือนเดิม
#   เอกสาร (README / คู่มือ) ไม่ได้อยู่ในแคชของแอป เปิดจากเว็บได้ของใหม่เองอยู่แล้ว ไม่ต้องบวกเลขแคช
#   ไฟล์ใหม่ที่แอปโหลดผ่านแคชเมื่อไหร่ ต้องเติมชื่อใน $appPaths ด้วย (เหมือนกติกาของ $safeNewPaths)
#   และบวกเฉพาะ "ชื่อแคชบรรทัดแรก" — เดิมแทนทุกที่ในไฟล์ รวมคอมเมนต์ประวัติที่อ้างชื่อแคชรุ่นเก่า (ประวัติเพี้ยนทุกรอบ)
$appPaths = @(
    'index.html', 'app.js', 'style_v2.css', 'sw.js', 'manifest.json',
    'promptpay-qr.js', 'dexie.min.js', 'apple-touch-icon.png', 'vendor'
)
function Test-AppPath($p) {
    $p = $p.Trim().Trim('"')
    # rename ใน git status = "old -> new" ใช้ชื่อใหม่
    $arrow = $p.IndexOf(' -> ')
    if ($arrow -ge 0) { $p = $p.Substring($arrow + 4).Trim().Trim('"') }
    $p = $p.TrimEnd('/')
    foreach ($s in $appPaths) { if ($p -eq $s -or $p.StartsWith($s + '/')) { return $true } }
    # ข้อ 13: ไฟล์ที่ index.html / sw.js / manifest.json เรียกใช้ = ไฟล์ของแอปด้วย (เช่นไฟล์ใหม่ที่เพิ่งเติมใน $safeNewPaths)
    return ($script:appFileRefs -ccontains $p)
}
$appChanged = @($dirty | Where-Object { Test-AppPath $_.Substring(3) })
# ตรวจ 13 ต.ค. 2569 ข้อ 12 (ผู้ตรวจอิสระ): มีไฟล์แก้ (เช่นเอกสาร) + commit ค้าง push ที่แตะไฟล์แอปแต่ไม่ได้บวกเลขแคช
# เดิมดูแค่ไฟล์ที่แก้ → ขึ้น "only docs changed - cache version kept" แล้ว push app.js ขึ้นไปโดย iPad ไม่รู้ว่ามีรุ่นใหม่
if ($appChanged.Count -eq 0) {
    $aheadRaw2 = @(git -c core.quotepath=false diff --name-only --no-renames -z '@{u}..HEAD' 2>$null)
    if ($LASTEXITCODE -eq 0) {
        $aheadPaths2 = @(([string]::Join("`n", $aheadRaw2)).Split([char]0) | Where-Object { $_ })
        if (-not ($aheadPaths2 -contains 'sw.js')) {
            $appChanged = @($aheadPaths2 | Where-Object { Test-AppPath $_ } | ForEach-Object { '   ' + $_ })
        }
    }
}
$new = $null
if ($appChanged.Count -gt 0) {
    $content = [System.IO.File]::ReadAllText($swPath)
    $m = [regex]::Match($content, "jahn-pos-v(\d+)")
    if (-not $m.Success) { Fail "pattern jahn-pos-vN not found in sw.js - users would NOT receive the update" }
    $old = [int]$m.Groups[1].Value
    $new = $old + 1
    $firstOnly = New-Object System.Text.RegularExpressions.Regex("jahn-pos-v\d+")
    $content = $firstOnly.Replace($content, "jahn-pos-v$new", 1)
    [System.IO.File]::WriteAllText($swPath, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[3/6] Service Worker cache: v$old -> v$new" -ForegroundColor Green
} else {
    Write-Host "[3/6] only docs/tests/tools changed - cache version kept (iPad will NOT show an update)" -ForegroundColor Yellow
}

# --- 3.1) ประทับวันที่ลงเลขเวอร์ชันแอป ----------------------------------
# ป้ายเวอร์ชันในหน้าตั้งค่าเคยค้างที่ 1.5.6 (2026-08-27) ทั้งที่แก้ไปแล้วสองพันบรรทัด
# เวลามีปัญหาแล้วถามว่า "ตอนนี้เครื่องใช้รุ่นไหน" จะได้คำตอบผิด
# เลข x.y.z ยังตั้งเองตามความหมายของการเปลี่ยนแปลง แต่ "วันที่" ให้สคริปต์ประทับให้ทุกครั้งที่ปล่อยของจริง
# หา pattern ไม่เจอ = เตือนอย่างเดียว ไม่ล้ม deploy (ป้ายผิดไม่ใช่เหตุผลที่ควรบล็อกการปล่อยของ)
# ประทับเฉพาะรอบที่แอปเปลี่ยนจริง (รอบที่แก้แค่เอกสาร app.js ต้องไม่เปลี่ยน)
$appPath = Join-Path $PSScriptRoot 'app.js'
if ($new -and (Test-Path $appPath)) {
    $appTxt = [System.IO.File]::ReadAllText($appPath)
    $releaseNow = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time'))
    $today = $releaseNow.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $verRe  = "const APP_VERSION = '([0-9]+\.[0-9]+\.[0-9]+) \(\d{4}-\d{2}-\d{2}\)';"
    $vm = [regex]::Match($appTxt, $verRe)
    if ($vm.Success) {
        $newLine = "const APP_VERSION = '" + $vm.Groups[1].Value + " ($today)';"
        if ($vm.Value -ne $newLine) {
            $appTxt = [regex]::Replace($appTxt, $verRe, $newLine)
            [System.IO.File]::WriteAllText($appPath, $appTxt, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "[3/6] app version stamp -> $($vm.Groups[1].Value) ($today)" -ForegroundColor Green
        }
    } else {
        Write-Host "[3/6] WARNING: APP_VERSION pattern not found in app.js - the version label on screen may be stale" -ForegroundColor Yellow
    }
}

# --- 4) add ------------------------------------------------------------
# git add -A เคยกวาดไฟล์ backup/secret ที่เผลอวางไว้ในโฟลเดอร์ไปด้วย
# ขั้นแรกเก็บเฉพาะไฟล์ที่ git ติดตามอยู่ แล้วอนุญาต untracked เฉพาะ source/test ที่ระบุชัดเจน
Write-Host "[4/6] staging project files ..." -ForegroundColor Cyan
# ⚠️ ไฟล์ใหม่ที่ไม่อยู่ใน $safeNewPaths จะไม่ถูก commit — สคริปต์พิมพ์รายชื่อเตือนสีเหลืองไว้ที่ขั้น [1/6]
#    และถ้า index.html / sw.js / manifest.json เรียกใช้ไฟล์นั้น สคริปต์หยุดตั้งแต่ก่อน stage (ผลตรวจ 19 ต.ค. 2569 ข้อ 13)
#    เพิ่มไฟล์ใหม่ของแอปเมื่อไหร่ ต้องเติมชื่อใน $safeNewPaths ด้านบน และ $safePaths ใน fix-push.ps1 ด้วยทุกครั้ง
# (รายการนี้ประกาศไว้ด้านบน ก่อนขั้นที่ 1 — ใช้ทั้งตอนตัดสินว่ามีของจะ deploy และตอน stage)
$stagePaths = @($safeNewPaths | Where-Object { (Test-Path -LiteralPath $_) -or ($changedPaths -contains $_) })
git add -A -- $stagePaths
if ($LASTEXITCODE -ne 0) { Fail "git add project files failed" }
Assert-SafeIndex

$staged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($staged)) { Fail "nothing was staged - check .gitignore" }

# --- 5) commit ---------------------------------------------------------
$verLabel = if ($new) { "v$new" } else { "docs" }
if ($args.Count -gt 0) { $msg = ($args -join ' ') } else { $msg = "deploy $verLabel $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
Write-Host "[5/6] git commit ..." -ForegroundColor Cyan
git commit -m $msg
if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }

# --- 6) push -----------------------------------------------------------
Write-Host "[6/6] git push ..." -ForegroundColor Cyan
Assert-SafeOutgoing '@{u}..HEAD'
git push
if ($LASTEXITCODE -ne 0) { Fail "git push failed - check login/remote, or run fix-push.bat" }

Write-Host ""
Write-Host "DEPLOYED -> https://kiadtisakapi-eng.github.io/pos/" -ForegroundColor Green
if ($new) {
    Write-Host "cache version now: jahn-pos-v$new" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: on iPad open the app while online -> tap the update button." -ForegroundColor Cyan
    Write-Host "      Settings screen should then show: cache jahn-pos-v$new" -ForegroundColor Cyan
} else {
    Write-Host "cache version unchanged - app files did not change, iPad needs no update" -ForegroundColor Green
}
Write-Host "Note: Apps Script is NOT updated by this script - paste it manually." -ForegroundColor Yellow
