# ============================================================
#  Erotica POS - One-command deploy
#  1) ตรวจสภาพ git ให้พร้อมก่อน (กันเคสที่เคยเจอ: index.lock ค้าง แล้วสคริปต์เดินต่อเงียบ ๆ)
#  2) รันชุดทดสอบก่อนแตะเวอร์ชันหรือ stage ไฟล์
#  3) บวกเลขเวอร์ชัน Service Worker (jahn-pos-vN -> vN+1) เฉพาะเมื่อมีของจะ deploy จริง
#  4) stage เฉพาะไฟล์โครงการ (ไม่กวาดไฟล์สำรอง/ความลับที่เพิ่งอยู่ในโฟลเดอร์)
#  5) commit + push -> GitHub Pages อัปเดตเอง
#
#  วิธีใช้:  ดับเบิลคลิก deploy.bat
#           หรือ  powershell -ExecutionPolicy Bypass -File deploy.ps1 "ข้อความ commit"
# ============================================================
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
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalMinutes -gt 10) {
        Remove-Item $lock -Force
        Write-Host "[0/5] cleared stale .git/index.lock (age $([int]$age.TotalMinutes) min)" -ForegroundColor Yellow
    } else {
        Fail "another git process seems to be running (.git/index.lock is fresh). Close it and retry."
    }
}

# --- 1) มีอะไรให้ deploy ไหม --------------------------------------------
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { Fail "git status failed - is this folder a git repo?" }
if ([string]::IsNullOrWhiteSpace($dirty)) {
    $ahead = git rev-list --count '@{u}..HEAD' 2>$null
    if ($LASTEXITCODE -eq 0 -and [int]$ahead -gt 0) {
        Write-Host "[1/6] no file changes, but $ahead commit(s) not pushed yet" -ForegroundColor Yellow
        Run-ProjectTests
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
$content = [System.IO.File]::ReadAllText($swPath)
$m = [regex]::Match($content, "jahn-pos-v(\d+)")
if (-not $m.Success) { Fail "pattern jahn-pos-vN not found in sw.js - users would NOT receive the update" }
$old = [int]$m.Groups[1].Value
$new = $old + 1
$content = [regex]::Replace($content, "jahn-pos-v\d+", "jahn-pos-v$new")
[System.IO.File]::WriteAllText($swPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[3/6] Service Worker cache: v$old -> v$new" -ForegroundColor Green

# --- 4) add ------------------------------------------------------------
# git add -A เคยกวาดไฟล์ backup/secret ที่เผลอวางไว้ในโฟลเดอร์ไปด้วย
# ขั้นแรกเก็บเฉพาะไฟล์ที่ git ติดตามอยู่ แล้วอนุญาต untracked เฉพาะ source/test ที่ระบุชัดเจน
Write-Host "[4/6] staging project files ..." -ForegroundColor Cyan
git add -u -- .
if ($LASTEXITCODE -ne 0) { Fail "git add tracked changes failed" }
# ⚠️ ไฟล์ใหม่ที่ไม่อยู่ในลิสต์นี้จะไม่ถูก commit "แบบเงียบ ๆ" — สคริปต์ไม่เตือน
#    เพิ่มไฟล์ config ใหม่ในโปรเจกต์เมื่อไหร่ ต้องมาเติมชื่อที่นี่ด้วยทุกครั้ง
$safeNewPaths = @(
    '.nojekyll', '.gitattributes', '.gitignore',
    'index.html', 'app.js', 'style_v2.css', 'sw.js', 'manifest.json',
    'promptpay-qr.js', 'dexie.min.js', 'google_apps_script.js', 'README.md',
    'SYSTEM_OVERVIEW.md', 'deploy.ps1', 'tests'
)
git add -- $safeNewPaths
if ($LASTEXITCODE -ne 0) { Fail "git add project files failed" }

$staged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($staged)) { Fail "nothing was staged - check .gitignore" }

# --- 5) commit ---------------------------------------------------------
if ($args.Count -gt 0) { $msg = ($args -join ' ') } else { $msg = "deploy v$new $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
Write-Host "[5/6] git commit ..." -ForegroundColor Cyan
git commit -m $msg
if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }

# --- 6) push -----------------------------------------------------------
Write-Host "[6/6] git push ..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) { Fail "git push failed - check login/remote, or run fix-push.bat" }

Write-Host ""
Write-Host "DEPLOYED -> https://kiadtisakapi-eng.github.io/pos/" -ForegroundColor Green
Write-Host "cache version now: jahn-pos-v$new" -ForegroundColor Green
Write-Host ""
Write-Host "Next: on iPad open the app while online -> tap the update button." -ForegroundColor Cyan
Write-Host "      Settings screen should then show: cache jahn-pos-v$new" -ForegroundColor Cyan
Write-Host "Note: Apps Script is NOT updated by this script - paste it manually." -ForegroundColor Yellow
