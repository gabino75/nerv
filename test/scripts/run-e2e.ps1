# NERV E2E Test Runner (Windows PowerShell)
#
# Usage:
#   .\test\scripts\run-e2e.ps1                    # Fast benchmark, mock Claude (Docker)
#   .\test\scripts\run-e2e.ps1 -Record            # Record video of all tests
#   .\test\scripts\run-e2e.ps1 -Slow              # 4s delays between actions
#   .\test\scripts\run-e2e.ps1 -RealClaude        # Use real Claude API
#   .\test\scripts\run-e2e.ps1 -GradeClaude       # Run Claude scoring after tests pass
#   .\test\scripts\run-e2e.ps1 -Suite basic       # Run basic tests instead
#   .\test\scripts\run-e2e.ps1 -Shards 4          # Run in 4 parallel containers
#   .\test\scripts\run-e2e.ps1 -Record -Slow      # Combine flags
#   .\test\scripts\run-e2e.ps1 -Local             # Run locally (not in Docker)
#   .\test\scripts\run-e2e.ps1 -Local -RealClaude # Real Claude locally (no Docker skip)
#   .\test\scripts\run-e2e.ps1 -RealClaude -GradeClaude  # Full benchmark with scoring
#   .\test\scripts\run-e2e.ps1 -Suite real-claude -RealClaude  # Real Claude benchmark
#   .\test\scripts\run-e2e.ps1 -Suite demos                   # Generate demo videos

param(
    [switch]$Record,           # Record video/screenshots of all tests
    [switch]$Slow,             # Add delays between actions (4s default)
    [int]$SlowDelay = 4000,    # Delay in ms when -Slow is used
    [switch]$RealClaude,       # Use real Claude API (requires ANTHROPIC_API_KEY)
    [switch]$GradeClaude,      # Run Claude scoring after successful tests
    [switch]$RebuildImage,     # Force rebuild Docker image
    [switch]$Local,            # Run locally instead of in Docker
    [ValidateSet('benchmark', 'basic', 'workflow', 'all', 'claude', 'quality', 'real-claude', 'demos')]
    [string]$Suite = 'benchmark',
    [int]$Shards = 4           # Number of parallel shards (containers)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$script:tempClaudeDirs = @()  # Track temp directories for cleanup

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
if ($Local) {
    Write-Host "   NERV E2E Test Runner (Local)" -ForegroundColor Cyan
} else {
    Write-Host "   NERV E2E Test Runner (Docker - Sharded)" -ForegroundColor Cyan
}
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Determine test file based on suite
$testFile = switch ($Suite) {
    'benchmark'    { "test/e2e/benchmark.spec.ts" }
    'basic'        { "test/e2e/basic.spec.ts" }
    'workflow'     { "test/e2e/workflow.spec.ts" }
    'claude'       { "test/e2e/claude-integration.spec.ts" }
    'real-claude'  { "test/e2e/golden/real-claude-benchmark.spec.ts" }
    'demos'        { "test/e2e/docs-demos.spec.ts" }  # Demo video recording
    'quality'      { "__quality__" }  # Special: run code quality checks
    'all'          { "" }  # Empty means all tests
}

# ============================================================================
# QUALITY CHECK MODE (special case - runs code quality script)
# ============================================================================
if ($Suite -eq 'quality') {
    Write-Host "[MODE] Code Quality Check" -ForegroundColor Cyan
    Write-Host ""

    # Build Docker image if needed
    $imageExists = docker images -q nerv-e2e 2>$null
    if (-not $imageExists -or $RebuildImage) {
        Write-Host "[DOCKER] Building image..." -ForegroundColor Yellow
        docker build -t nerv-e2e -f test/e2e/Dockerfile .
    }

    # Run quality check in Docker (skip entrypoint, just run the script directly)
    Write-Host "[DOCKER] Running code quality checks..." -ForegroundColor Cyan
    $qualityCmd = "cd /app && rm -rf src test scripts && cp -r /app/host/src /app/host/test /app/host/scripts /app/host/package.json /app/host/tsconfig*.json /app/host/eslint.config.js /app/host/.jscpd.json . 2>/dev/null; chmod +x scripts/code-quality.sh && ./scripts/code-quality.sh"
    docker run --rm -v "${ProjectRoot}:/app/host:ro" --entrypoint bash nerv-e2e -c $qualityCmd

    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "[RESULT] Code quality checks PASSED" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[RESULT] Code quality checks FAILED" -ForegroundColor Red
    }
    exit $exitCode
}

# ============================================================================
# LOCAL EXECUTION MODE
# ============================================================================
if ($Local) {
    Write-Host "[CONFIG] Mode: LOCAL (no Docker)" -ForegroundColor Yellow

    # Set environment variables
    $env:NERV_MOCK_CLAUDE = if ($RealClaude) { "false" } else { "true" }
    $env:NODE_ENV = "test"
    $env:NERV_TEST_MODE = "true"

    if ($Record) {
        $env:NERV_RECORD_VIDEO = "true"
        $env:NERV_RECORD_ALL = "true"
        Write-Host "[CONFIG] Video recording: ON" -ForegroundColor Yellow
    }

    if ($Slow) {
        $env:NERV_SLOW_MODE = "true"
        $env:NERV_SLOW_DELAY = $SlowDelay
        Write-Host "[CONFIG] Slow mode: ON (${SlowDelay}ms delays)" -ForegroundColor Yellow
    }

    if ($RealClaude) {
        Write-Host "[CONFIG] Claude: REAL API" -ForegroundColor Red
        Write-Host "[WARNING] Real Claude tests will use actual API tokens!" -ForegroundColor Yellow
    } else {
        Write-Host "[CONFIG] Claude: Mock" -ForegroundColor Green
    }

    Write-Host "[CONFIG] Test suite: $Suite" -ForegroundColor Cyan
    Write-Host ""

    # Ensure app is built
    if (-not (Test-Path "$ProjectRoot\out\main\index.js")) {
        Write-Host "Building app first..." -ForegroundColor Yellow
        Push-Location $ProjectRoot
        npm run build
        Pop-Location
    }

    # Run playwright directly
    $startTime = Get-Date
    Push-Location $ProjectRoot

    if ($testFile) {
        Write-Host "Running: npx playwright test --config=test/e2e/playwright.config.ts $testFile" -ForegroundColor Cyan
        npx playwright test --config=test/e2e/playwright.config.ts $testFile
    } else {
        Write-Host "Running: npx playwright test --config=test/e2e/playwright.config.ts" -ForegroundColor Cyan
        npx playwright test --config=test/e2e/playwright.config.ts
    }

    $exitCode = $LASTEXITCODE
    Pop-Location

    $duration = (Get-Date) - $startTime

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    if ($exitCode -eq 0) {
        Write-Host "   TESTS PASSED" -ForegroundColor Green
    } else {
        Write-Host "   TESTS FAILED" -ForegroundColor Red
    }
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor White
    Write-Host ""

    exit $exitCode
}

# ============================================================================
# DOCKER EXECUTION MODE (default)
# ============================================================================

# Build environment variables
# Note: Use lowercase "true"/"false" strings for Node.js compatibility
$mockClaudeValue = if ($RealClaude) { "false" } else { "true" }
$envVars = @(
    "-e", "NERV_MOCK_CLAUDE=$mockClaudeValue"
)

if ($Record) {
    $envVars += @("-e", "NERV_RECORD_VIDEO=true")
    Write-Host "[CONFIG] Video recording: ON" -ForegroundColor Yellow
}

if ($Slow) {
    $envVars += @("-e", "NERV_SLOW_MODE=true", "-e", "NERV_SLOW_DELAY=$SlowDelay")
    Write-Host "[CONFIG] Slow mode: ON (${SlowDelay}ms delays)" -ForegroundColor Yellow
}

if ($RealClaude) {
    # Check for API key OR Claude CLI auth
    $hasApiKey = $env:ANTHROPIC_API_KEY
    $claudeConfigPath = "$env:USERPROFILE\.claude"
    $anthropicConfigPath = "$env:USERPROFILE\.anthropic"
    $hasClaudeConfig = Test-Path $claudeConfigPath
    $hasAnthropicConfig = Test-Path $anthropicConfigPath

    if (-not $hasApiKey -and -not $hasClaudeConfig -and -not $hasAnthropicConfig) {
        Write-Host "ERROR: Real Claude requires one of:" -ForegroundColor Red
        Write-Host "  - ANTHROPIC_API_KEY environment variable" -ForegroundColor Red
        Write-Host "  - ~/.claude/ directory (Claude CLI auth)" -ForegroundColor Red
        Write-Host "  - ~/.anthropic/ directory (API credentials)" -ForegroundColor Red
        exit 1
    }

    # Pass API key if available
    if ($hasApiKey) {
        $envVars += @("-e", "ANTHROPIC_API_KEY=$env:ANTHROPIC_API_KEY")
        Write-Host "[CONFIG] API Key: Found" -ForegroundColor Green
    }

    # Mount Claude CLI config directory if it exists
    # We need read-write access because Claude CLI writes state files (todos, debug logs, etc.)
    # To avoid polluting the user's config, we copy credentials to a temp directory
    if ($hasClaudeConfig) {
        $tempClaudeDir = "$env:TEMP\nerv-test-claude-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        New-Item -ItemType Directory -Path $tempClaudeDir -Force | Out-Null

        # Copy only the credentials file (not the whole directory to keep it clean)
        if (Test-Path "$claudeConfigPath\.credentials.json") {
            Copy-Item "$claudeConfigPath\.credentials.json" "$tempClaudeDir\.credentials.json"
        }
        if (Test-Path "$claudeConfigPath\settings.json") {
            Copy-Item "$claudeConfigPath\settings.json" "$tempClaudeDir\settings.json"
        }

        # Mount the temp directory as read-write
        $envVars += @("-v", "${tempClaudeDir}:/root/.claude")
        Write-Host "[CONFIG] Claude CLI config: Copied to temp dir (read-write)" -ForegroundColor Green

        # Store temp dir path for cleanup
        $script:tempClaudeDirs += $tempClaudeDir
    }

    # Mount Anthropic credentials if they exist
    if ($hasAnthropicConfig) {
        $envVars += @("-v", "${anthropicConfigPath}:/root/.anthropic:ro")
        Write-Host "[CONFIG] Anthropic config: Mounted (~/.anthropic)" -ForegroundColor Green
    }

    # Longer timeout for real Claude
    $envVars += @("-e", "NERV_CLAUDE_TIMEOUT=3600000")
    Write-Host "[CONFIG] Claude: REAL API" -ForegroundColor Red
    Write-Host "[WARNING] Real Claude tests will use actual API tokens!" -ForegroundColor Yellow
} else {
    Write-Host "[CONFIG] Claude: Mock" -ForegroundColor Green
}

Write-Host "[CONFIG] Test suite: $Suite" -ForegroundColor Cyan
Write-Host "[CONFIG] Shards: $Shards parallel containers" -ForegroundColor Cyan
Write-Host ""

# Rebuild image if requested
if ($RebuildImage) {
    Write-Host "Rebuilding Docker image..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    docker build -t nerv-e2e -f test/e2e/Dockerfile .
    Pop-Location
    Write-Host ""
}

# Run tests in parallel shards
Write-Host "Running tests in $Shards parallel Docker containers..." -ForegroundColor Cyan
Write-Host ""

$jobs = @()
$startTime = Get-Date

for ($i = 1; $i -le $Shards; $i++) {
    $shardIndex = $i
    $shardSpec = "$shardIndex/$Shards"

    # Build the test command with shard
    if ($testFile) {
        $testCmd = "npx playwright test --config=test/e2e/playwright.config.ts $testFile --shard=$shardSpec"
    } else {
        $testCmd = "npx playwright test --config=test/e2e/playwright.config.ts --shard=$shardSpec"
    }

    Write-Host "[SHARD $shardIndex/$Shards] Starting..." -ForegroundColor Yellow

    # Start each shard as a background job
    $job = Start-Job -ScriptBlock {
        param($ProjectRoot, $envVars, $testCmd, $shardIndex, $Shards)

        $dockerArgs = @(
            "run", "--rm",
            "--shm-size=2gb",
            "-v", "${ProjectRoot}:/app/host"
        ) + $envVars + @("nerv-e2e", $testCmd)

        $output = & docker @dockerArgs 2>&1

        @{
            Shard = $shardIndex
            ExitCode = $LASTEXITCODE
            Output = $output
        }
    } -ArgumentList $ProjectRoot, $envVars, $testCmd, $shardIndex, $Shards

    $jobs += $job
}

Write-Host ""
Write-Host "Waiting for all shards to complete..." -ForegroundColor Cyan
Write-Host ""

# Wait for all jobs and collect results
$results = @()
$totalFailed = 0
$totalPassed = 0

foreach ($job in $jobs) {
    $result = Receive-Job -Job $job -Wait
    $results += $result

    $statusColor = if ($result.ExitCode -eq 0) { "Green" } else { "Red" }
    $statusText = if ($result.ExitCode -eq 0) { "PASSED" } else { "FAILED" }

    Write-Host "[SHARD $($result.Shard)/$Shards] $statusText" -ForegroundColor $statusColor

    # Parse output for test counts
    $output = $result.Output -join "`n"
    if ($output -match "(\d+) passed") {
        $totalPassed += [int]$Matches[1]
    }
    if ($output -match "(\d+) failed") {
        $totalFailed += [int]$Matches[1]
    }

    if ($result.ExitCode -ne 0) {
        Write-Host "--- Shard $($result.Shard) Output ---" -ForegroundColor DarkGray
        Write-Host ($result.Output | Select-Object -Last 30) -ForegroundColor DarkGray
        Write-Host "--- End Shard $($result.Shard) ---" -ForegroundColor DarkGray
    }
}

# Cleanup jobs
$jobs | Remove-Job

$duration = (Get-Date) - $startTime
$anyFailed = ($results | Where-Object { $_.ExitCode -ne 0 }).Count -gt 0

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

if (-not $anyFailed) {
    Write-Host "   ALL SHARDS PASSED" -ForegroundColor Green
} else {
    Write-Host "   SOME SHARDS FAILED" -ForegroundColor Red
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  - Total passed: $totalPassed" -ForegroundColor Green
Write-Host "  - Total failed: $totalFailed" -ForegroundColor $(if ($totalFailed -gt 0) { "Red" } else { "Green" })
Write-Host "  - Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor White
Write-Host "  - Shards: $Shards containers" -ForegroundColor White
Write-Host ""
Write-Host "Results available at:" -ForegroundColor Yellow
Write-Host "  - Videos/Screenshots: $ProjectRoot\test-results\docker\artifacts\" -ForegroundColor White
Write-Host "  - HTML Report:        $ProjectRoot\test-results\docker\html\index.html" -ForegroundColor White
Write-Host ""

# Cleanup temp directories
foreach ($tempDir in $script:tempClaudeDirs) {
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# DEMO VIDEO POST-PROCESSING (for -Suite demos)
# ============================================================================
if ($Suite -eq 'demos' -and -not $anyFailed) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "   POST-PROCESSING DEMO VIDEOS" -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta

    $demoSourceDir = "$ProjectRoot\test-results\docker\demos"
    $demoDestDir = "$ProjectRoot\docs\demos"

    # Create destination if it doesn't exist
    if (-not (Test-Path $demoDestDir)) {
        New-Item -ItemType Directory -Path $demoDestDir -Force | Out-Null
    }

    # Get all video files from the demo test run
    $videoFiles = Get-ChildItem -Path $demoSourceDir -Filter "*.webm" -ErrorAction SilentlyContinue | Sort-Object Length

    if ($videoFiles.Count -ge 3) {
        # Map videos to demo names based on expected content
        # Tests run in parallel so we use file size as a rough heuristic:
        # - quick-start: smallest (basic project creation)
        # - yolo-mode: medium (YOLO config and start)
        # - multi-repo: largest (3 repos, more UI interactions)
        $demoNames = @("quick-start", "yolo-mode", "multi-repo")

        for ($i = 0; $i -lt $videoFiles.Count -and $i -lt $demoNames.Count; $i++) {
            $destPath = Join-Path $demoDestDir "$($demoNames[$i]).webm"
            Copy-Item -Path $videoFiles[$i].FullName -Destination $destPath -Force
            Write-Host "  - $($demoNames[$i]).webm ($('{0:N0}' -f $videoFiles[$i].Length) bytes)" -ForegroundColor Green
        }

        Write-Host ""
        Write-Host "Demo videos saved to: $demoDestDir" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: Expected 3 demo videos, found $($videoFiles.Count)" -ForegroundColor Yellow
        if ($videoFiles.Count -gt 0) {
            Write-Host "  Videos found:" -ForegroundColor Yellow
            foreach ($video in $videoFiles) {
                Write-Host "    - $($video.Name)" -ForegroundColor Yellow
            }
        }
    }
}

# ============================================================================
# GRADING (if -GradeClaude flag is set and tests passed)
# ============================================================================
if ($GradeClaude -and -not $anyFailed -and $totalFailed -eq 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "   GRADING BENCHMARK WITH CLAUDE" -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta

    # Find most recent benchmark results directory
    $benchmarkDirs = Get-ChildItem -Path "$ProjectRoot\test-results" -Directory -Filter "benchmark-*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending

    # Also check docker benchmark directory for new format
    $dockerBenchmarkDirs = Get-ChildItem -Path "$ProjectRoot\test-results\docker" -Directory -Filter "benchmark-*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending

    # Combine and sort
    $allBenchmarkDirs = @($benchmarkDirs) + @($dockerBenchmarkDirs) | Where-Object { $_ } | Sort-Object LastWriteTime -Descending

    if ($allBenchmarkDirs.Count -gt 0) {
        $latestBenchmark = $allBenchmarkDirs[0].FullName
        Write-Host "Scoring: $latestBenchmark" -ForegroundColor Cyan

        # Check if summary.json exists (required for scoring)
        $summaryPath = Join-Path $latestBenchmark "summary.json"
        if (Test-Path $summaryPath) {
            Push-Location $ProjectRoot
            node scripts/score-benchmark.js $latestBenchmark
            $gradeExitCode = $LASTEXITCODE
            Pop-Location

            if ($gradeExitCode -ne 0) {
                Write-Host "WARNING: Grading failed (exit code $gradeExitCode)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "WARNING: summary.json not found in benchmark directory" -ForegroundColor Yellow
            Write-Host "  Expected at: $summaryPath" -ForegroundColor Yellow
            Write-Host "  Benchmark output must use BenchmarkCollector for scoring" -ForegroundColor Yellow
        }
    } else {
        Write-Host "WARNING: No benchmark results found to grade" -ForegroundColor Yellow
    }
} elseif ($GradeClaude -and ($anyFailed -or $totalFailed -gt 0)) {
    Write-Host ""
    Write-Host "[GRADE] Skipping grading - tests failed" -ForegroundColor Yellow
}

if ($anyFailed) {
    exit 1
} else {
    exit 0
}
