# NERV Benchmark Iteration Loop (PowerShell)
#
# Runs the benchmark pipeline, scores the result, and if the score is below
# target, spawns Claude to diagnose and fix issues in NERV's code. Repeats
# until the target score is reached or max iterations are exhausted.
#
# Usage:
#   .\scripts\benchmark-iterate.ps1 [-Spec "specs/todo-app.md"] [-Target 7] [-MaxIters 10]

param(
    [string]$Spec = "specs\todo-app.md",
    [int]$Target = 7,
    [int]$MaxIters = 10,
    [int]$Budget = 5,
    [int]$FixBudget = 3,
    [switch]$SkipBenchmark,
    [switch]$NoFix,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $ScriptRoot "benchmark-iterate.log"

# Colors
function Write-Status { param($msg) Write-Host "[BENCH-ITER] $msg" -ForegroundColor Cyan; "[BENCH-ITER] $msg" | Add-Content $LogFile }
function Write-Ok { param($msg) Write-Host "[BENCH-ITER] $msg" -ForegroundColor Green; "[BENCH-ITER] $msg" | Add-Content $LogFile }
function Write-Warn { param($msg) Write-Host "[BENCH-ITER] $msg" -ForegroundColor Yellow; "[BENCH-ITER] $msg" | Add-Content $LogFile }
function Write-Err { param($msg) Write-Host "[BENCH-ITER] $msg" -ForegroundColor Red; "[BENCH-ITER] $msg" | Add-Content $LogFile }

if ($Help) {
    Write-Host @"
NERV Benchmark Iteration Loop

Usage: .\scripts\benchmark-iterate.ps1 [options]

Options:
  -Spec <file>       Spec file (default: specs\todo-app.md)
  -Target <score>    Target overall score, 1-10 (default: 7)
  -MaxIters <n>      Maximum iterations (default: 10)
  -Budget <usd>      Claude budget per benchmark run (default: 5)
  -FixBudget <usd>   Claude budget per fix iteration (default: 3)
  -SkipBenchmark     Skip benchmark, score latest existing results
  -NoFix             Score only, don't run fix iterations
  -Help              Show this help
"@
    exit 0
}

# Resolve spec file
$SpecFile = Join-Path $ScriptRoot $Spec
if (-not (Test-Path $SpecFile)) {
    # Try as absolute path
    $SpecFile = $Spec
}
if (-not (Test-Path $SpecFile)) {
    Write-Err "Spec file not found: $Spec"
    exit 1
}

# Initialize log
@"
============================================================
  NERV Benchmark Iteration Loop - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
============================================================
"@ | Out-File $LogFile -Encoding utf8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  NERV Benchmark Iteration Loop" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Status "Spec file:      $SpecFile"
Write-Status "Target score:   $Target/10"
Write-Status "Max iterations: $MaxIters"
Write-Status "Budget/run:     `$$Budget"
Write-Status "Fix budget:     `$$FixBudget"
Write-Host ""
Write-Host "Tail live output: Get-Content '$LogFile' -Wait -Tail 50" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# Prerequisites
# ============================================================================

Write-Status "Verifying prerequisites..."

Push-Location $ScriptRoot
try {
    # Typecheck
    $tcOutput = npm run typecheck 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Typecheck failed!"
        $tcOutput | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
        exit 1
    }
    Write-Ok "Typecheck: clean"

    # Unit tests
    $testOutput = npx vitest run 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Unit tests failed!"
        $testOutput | Select-Object -Last 30 | ForEach-Object { Write-Host $_ }
        exit 1
    }
    $testCount = ($testOutput | Select-String -Pattern '\d+ passed' | Select-Object -First 1).Matches.Value
    Write-Ok "Unit tests: $testCount"

    # Claude CLI
    $claudeCheck = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $claudeCheck) {
        Write-Err "Claude Code CLI not found."
        exit 1
    }
    Write-Ok "Claude CLI: available"
} finally {
    Pop-Location
}

Write-Host ""

# ============================================================================
# Helper: find latest benchmark dir
# ============================================================================

function Find-LatestBenchmarkDir {
    $dirs = Get-ChildItem -Path "$ScriptRoot\test-results" -Directory -Filter "benchmark-*" -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "summary.json") } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($dirs) { return $dirs.FullName }
    return $null
}

# ============================================================================
# Main loop
# ============================================================================

$iteration = 0
$bestScore = 0
$bestDir = ""
$startTime = Get-Date

while ($iteration -lt $MaxIters) {
    $iteration++
    $iterStart = Get-Date

    Write-Host ""
    Write-Host "==================== ITERATION $iteration/$MaxIters ====================" -ForegroundColor White
    Write-Host ""

    # ------------------------------------------------------------------
    # Phase 1: Run benchmark
    # ------------------------------------------------------------------

    $benchmarkDir = $null

    if ($SkipBenchmark -and $iteration -eq 1) {
        Write-Status "Skipping benchmark run, finding latest results..."
        $benchmarkDir = Find-LatestBenchmarkDir
        if (-not $benchmarkDir) {
            Write-Err "No existing benchmark results found."
            exit 1
        }
        Write-Status "Using: $benchmarkDir"
    } else {
        Write-Status "Running benchmark with spec: $(Split-Path $SpecFile -Leaf)"

        Push-Location $ScriptRoot
        try {
            npx tsx src/cli/index.ts benchmark $SpecFile `
                --max-cost $Budget `
                --dangerously-skip-permissions `
                2>&1 | Tee-Object -Append $LogFile
        } finally {
            Pop-Location
        }

        $benchmarkDir = Find-LatestBenchmarkDir
        if ($benchmarkDir) {
            Write-Status "Benchmark output: $benchmarkDir"
        } else {
            Write-Warn "Benchmark produced no output directory."
        }
    }

    # ------------------------------------------------------------------
    # Phase 2: Score
    # ------------------------------------------------------------------

    $score = 0
    $scoreReport = ""

    if ($benchmarkDir -and (Test-Path $benchmarkDir)) {
        Write-Status "Scoring benchmark results..."

        Push-Location $ScriptRoot
        try {
            $scoreOutput = node scripts/score-benchmark.js $benchmarkDir --spec $SpecFile --no-visual 2>&1
            $scoreOutput | ForEach-Object { Write-Host $_; $_ | Add-Content $LogFile }
        } finally {
            Pop-Location
        }

        $scoreReport = Join-Path $benchmarkDir "score-report.json"
        if (Test-Path $scoreReport) {
            $reportData = Get-Content $scoreReport -Raw | ConvertFrom-Json
            $score = if ($reportData.combined.overallScore) { $reportData.combined.overallScore } else { 0 }
        }

        Write-Status "Overall score: $score/10"

        if ($score -gt $bestScore) {
            $bestScore = $score
            $bestDir = $benchmarkDir
        }
    }

    # ------------------------------------------------------------------
    # Phase 3: Check target
    # ------------------------------------------------------------------

    if ($score -ge $Target) {
        Write-Host ""
        Write-Ok "============================================================"
        Write-Ok "TARGET REACHED! Score: $score/10 (target: $Target)"
        Write-Ok "============================================================"
        Write-Ok "Results: $benchmarkDir"
        break
    }

    Write-Status "Score $score < target $Target"

    # ------------------------------------------------------------------
    # Phase 4: Fix iteration
    # ------------------------------------------------------------------

    if ($NoFix) {
        Write-Status "No-fix mode, skipping."
        continue
    }

    if ($iteration -ge $MaxIters) {
        Write-Warn "Max iterations reached."
        break
    }

    Write-Status "Spawning Claude to diagnose and fix..."

    $reportContent = if (Test-Path $scoreReport) { Get-Content $scoreReport -Raw } else { "(no report)" }

    $fixPrompt = @"
# NERV Benchmark Fix Iteration $iteration

The NERV benchmark just ran and scored $score/10 (target: $Target/10).
The benchmark tests NERV's ability to build apps - low scores mean something
is wrong with NERV's pipeline, not the scoring system.

## Score Report
$reportContent

## What the Scores Mean

**NERV Ops (deterministic)** - How well NERV uses its own features:
- Low worktree score -> NERV isn't creating/using git worktrees properly
- Low parallelism -> NERV isn't running tasks in parallel
- Low cycle management -> NERV isn't progressing through spec cycles
- Low review process -> Review agent isn't running or producing decisions
- Low error handling -> Too many errors/loops during execution
- Low cost efficiency -> Spending too much for what was accomplished

**Code Quality (Claude-graded)** - Quality of the app NERV built:
- Low implementation -> Poor code structure, missing types, bad patterns
- Low functionality -> Features don't work, API errors, missing endpoints
- Low UX -> Bad UI, missing error states, poor user experience

## What You Should Do

1. Read the score report carefully - find the LOWEST dimension
2. Trace the problem to NERV's code (not the scoring script)
3. Fix ONE issue in NERV that will most improve that dimension
4. Run ``npm run typecheck`` and ``npx vitest run`` to verify no regressions
5. Commit your changes

## NERV Pipeline Files (what runs during benchmark)
- ``src/cli/commands/benchmark.ts`` - Main pipeline: cycles, worktrees, parallel tasks, review agents
- ``src/core/spec-parser.ts`` - Parses specs into cycles/subtasks
- ``src/core/benchmark-worktree.ts`` - Git worktree create/merge/cleanup
- ``src/core/benchmark-review.ts`` - Review agent that approves/rejects task output
- ``src/core/benchmark-scoring.ts`` - Deterministic scoring from summary.json metrics

## NERV App Files (what NERV builds/runs)
- ``src/cli/`` - CLI commands
- ``src/main/`` - Electron main process
- ``src/renderer/`` - Svelte UI components
- ``src/shared/`` - Shared types and constants

## Rules
- Fix ONE thing per iteration. The loop will continue.
- Focus on NERV's code, not the scoring system.
- Run typecheck and unit tests after your fix.
- Commit your work before finishing.
- Do NOT create .ralph-complete or any marker files.
"@

    Push-Location $ScriptRoot
    try {
        claude --model opus `
            --print `
            --dangerously-skip-permissions `
            --output-format stream-json `
            --max-budget-usd $FixBudget `
            $fixPrompt 2>&1 | ForEach-Object {
                $line = $_
                $line | Add-Content $LogFile
                try {
                    $event = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($event.type -eq "assistant" -and $event.message.content) {
                        foreach ($block in $event.message.content) {
                            if ($block.type -eq "text") { Write-Host $block.text }
                            elseif ($block.type -eq "tool_use") { Write-Host "[TOOL: $($block.name)]" -ForegroundColor Magenta }
                        }
                    }
                    elseif ($event.type -eq "result") { Write-Host "`n[RESULT: $($event.subtype)]" -ForegroundColor Green }
                } catch {
                    Write-Host $line -ForegroundColor Gray
                }
            }
    } finally {
        Pop-Location
    }

    # Verify fix
    Write-Status "Verifying fix..."
    Push-Location $ScriptRoot
    try {
        npm run typecheck 2>&1 | Out-Null
        $tcOk = $LASTEXITCODE -eq 0
        npx vitest run 2>&1 | Out-Null
        $utOk = $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }

    if (-not $tcOk) { Write-Warn "Typecheck failed after fix!" }
    elseif (-not $utOk) { Write-Warn "Unit tests failed after fix!" }
    else { Write-Ok "Fix verified: typecheck clean, tests passing" }

    $iterDuration = (Get-Date) - $iterStart
    $totalDuration = (Get-Date) - $startTime
    Write-Status "Iteration $iteration done in $($iterDuration.ToString('mm\:ss')) (total: $($totalDuration.ToString('hh\:mm\:ss')))"

    Write-Status "Pausing 3 seconds..."
    Start-Sleep -Seconds 3
}

# ============================================================================
# Final report
# ============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Benchmark Iteration Loop Complete" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Status "Iterations run:  $iteration"
Write-Status "Best score:      $bestScore/10"
Write-Status "Target score:    $Target/10"
Write-Status "Total time:      $((Get-Date) - $startTime)"
if ($bestDir) { Write-Status "Best results:    $bestDir" }
Write-Status "Log file:        $LogFile"

if ($bestScore -ge $Target) {
    Write-Ok "RESULT: TARGET MET"
    exit 0
} else {
    Write-Warn "RESULT: TARGET NOT MET (best: $bestScore, target: $Target)"
    exit 1
}
