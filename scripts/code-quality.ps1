# Code Quality CI Script for NERV
# Run this every iteration to catch code smell early

param(
    [switch]$Fix,        # Auto-fix what we can
    [switch]$Strict      # Fail on warnings too
)

$ErrorActionPreference = "Continue"
$script:exitCode = 0
$script:warnings = @()
$script:errors = @()

function Write-Check { param($msg) Write-Host "[CHECK] $msg" -ForegroundColor Cyan }
function Write-Pass { param($msg) Write-Host "[PASS]  $msg" -ForegroundColor Green }
function Write-Warn { param($msg)
    Write-Host "[WARN]  $msg" -ForegroundColor Yellow
    $script:warnings += $msg
}
function Write-Fail { param($msg)
    Write-Host "[FAIL]  $msg" -ForegroundColor Red
    $script:errors += $msg
    $script:exitCode = 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   NERV Code Quality Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. TypeScript Compilation
Write-Check "TypeScript compilation..."
$tscResult = npm run typecheck 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "TypeScript compiles without errors"
} else {
    Write-Fail "TypeScript compilation failed"
    $tscResult | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

# 2. ESLint
Write-Check "ESLint analysis..."
if ($Fix) {
    $eslintResult = npx eslint src/ --fix 2>&1
} else {
    $eslintResult = npx eslint src/ 2>&1
}

# Parse ESLint summary line: "✖ X problems (Y errors, Z warnings)"
$eslintSummary = $eslintResult | Select-String -Pattern "(\d+) error" | Select-Object -First 1
$eslintWarningSummary = $eslintResult | Select-String -Pattern "(\d+) warning" | Select-Object -First 1

$eslintErrors = 0
$eslintWarnings = 0
if ($eslintSummary -and $eslintSummary.Matches[0].Groups[1]) {
    $eslintErrors = [int]$eslintSummary.Matches[0].Groups[1].Value
}
if ($eslintWarningSummary -and $eslintWarningSummary.Matches[0].Groups[1]) {
    $eslintWarnings = [int]$eslintWarningSummary.Matches[0].Groups[1].Value
}

if ($eslintErrors -eq 0 -and $eslintWarnings -eq 0) {
    Write-Pass "No ESLint issues"
} elseif ($eslintErrors -eq 0) {
    Write-Warn "ESLint: $eslintWarnings warnings"
} else {
    Write-Fail "ESLint: $eslintErrors errors, $eslintWarnings warnings"
    $eslintResult | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" }
}

# 3. Code Duplication (jscpd)
Write-Check "Code duplication analysis..."
$jscpdResult = npx jscpd src/ --config .jscpd.json 2>&1
$duplicateMatch = $jscpdResult | Select-String -Pattern "(\d+\.?\d*)% \((\d+) lines\)"
if ($duplicateMatch) {
    $percent = $duplicateMatch.Matches[0].Groups[1].Value
    $lines = $duplicateMatch.Matches[0].Groups[2].Value
    if ([double]$percent -gt 10) {
        Write-Fail "Code duplication: $percent% ($lines lines) - should be < 10%"
    } elseif ([double]$percent -gt 5) {
        Write-Warn "Code duplication: $percent% ($lines lines) - consider refactoring"
    } else {
        Write-Pass "Code duplication: $percent% ($lines lines)"
    }
} else {
    Write-Pass "No significant code duplication detected"
}

# 4. Circular Dependencies (madge)
Write-Check "Circular dependency analysis..."
$madgeResult = npx madge --circular --extensions ts src/ 2>&1
$circularCount = ($madgeResult | Select-String -Pattern "Found \d+ circular" | ForEach-Object {
    if ($_ -match "Found (\d+)") { $matches[1] }
})
if ($circularCount -and [int]$circularCount -gt 0) {
    Write-Fail "Found $circularCount circular dependencies"
    $madgeResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
} else {
    Write-Pass "No circular dependencies"
}

# 5. File Size Limits
Write-Check "File size analysis..."
$largeTsFiles = Get-ChildItem -Path src -Recurse -Include *.ts,*.svelte |
    Where-Object { (Get-Content $_.FullName | Measure-Object -Line).Lines -gt 500 } |
    Select-Object FullName, @{N='Lines';E={(Get-Content $_.FullName | Measure-Object -Line).Lines}}

if ($largeTsFiles.Count -gt 0) {
    Write-Warn "Large files (>500 lines) - consider splitting:"
    $largeTsFiles | ForEach-Object {
        Write-Host "  $($_.FullName): $($_.Lines) lines" -ForegroundColor Yellow
    }
} else {
    Write-Pass "All files under 500 lines"
}

# 6. Directory Size (too many files = poor organization)
Write-Check "Directory organization..."
$largeDirs = Get-ChildItem -Path src -Directory -Recurse | ForEach-Object {
    $fileCount = (Get-ChildItem $_.FullName -File -Filter "*.ts" -ErrorAction SilentlyContinue | Measure-Object).Count
    $fileCount += (Get-ChildItem $_.FullName -File -Filter "*.svelte" -ErrorAction SilentlyContinue | Measure-Object).Count
    [PSCustomObject]@{ Path = $_.FullName; FileCount = $fileCount }
} | Where-Object { $_.FileCount -gt 15 }

if ($largeDirs.Count -gt 0) {
    Write-Warn "Large directories (>15 files) - consider subdirectories:"
    $largeDirs | ForEach-Object {
        Write-Host "  $($_.Path): $($_.FileCount) files" -ForegroundColor Yellow
    }
} else {
    Write-Pass "Directory organization looks good"
}

# 7. TODO/FIXME Count
Write-Check "TODO/FIXME analysis..."
$todos = Get-ChildItem -Path src -Recurse -Include *.ts,*.svelte |
    ForEach-Object { Select-String -Path $_.FullName -Pattern "TODO|FIXME|HACK|XXX" } |
    Measure-Object
if ($todos.Count -gt 20) {
    Write-Warn "$($todos.Count) TODO/FIXME comments - consider addressing some"
} else {
    Write-Pass "$($todos.Count) TODO/FIXME comments"
}

# 8. Console.log count (should use proper logging)
Write-Check "Console.log usage..."
$consoleLogs = Get-ChildItem -Path src -Recurse -Include *.ts,*.svelte |
    ForEach-Object { Select-String -Path $_.FullName -Pattern "console\.(log|warn|error)" } |
    Measure-Object
if ($consoleLogs.Count -gt 50) {
    Write-Warn "$($consoleLogs.Count) console.log statements - consider a logging utility"
} else {
    Write-Pass "$($consoleLogs.Count) console statements"
}

# 9. Any type usage
Write-Check "TypeScript 'any' usage..."
$anyUsage = Get-ChildItem -Path src -Recurse -Include *.ts |
    ForEach-Object { Select-String -Path $_.FullName -Pattern ": any\b|<any>|as any" } |
    Measure-Object
if ($anyUsage.Count -gt 10) {
    Write-Warn "$($anyUsage.Count) uses of 'any' type - prefer proper typing"
} else {
    Write-Pass "$($anyUsage.Count) uses of 'any' type"
}

# 10. Build Check
Write-Check "Production build..."
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "Production build succeeds"
} else {
    Write-Fail "Production build failed"
    $buildResult | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($script:errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRORS ($($script:errors.Count)):" -ForegroundColor Red
    $script:errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($script:warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNINGS ($($script:warnings.Count)):" -ForegroundColor Yellow
    $script:warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

if ($script:errors.Count -eq 0 -and $script:warnings.Count -eq 0) {
    Write-Host ""
    Write-Host "All checks passed!" -ForegroundColor Green
}

Write-Host ""

if ($Strict -and $script:warnings.Count -gt 0) {
    $script:exitCode = 1
}

exit $script:exitCode
