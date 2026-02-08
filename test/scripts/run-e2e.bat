@echo off
REM NERV E2E Test Runner for Windows
REM Runs E2E tests locally or in Docker

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..
set TEST_DIR=%PROJECT_ROOT%\test

echo === NERV E2E Test Runner ===
echo Project root: %PROJECT_ROOT%
echo Test directory: %TEST_DIR%

REM Check if build exists
if not exist "%PROJECT_ROOT%\out\main\index.js" (
    echo ERROR: Built app not found. Run 'npm run build' first.
    exit /b 1
)

REM Create test results directory
if not exist "%TEST_DIR%\test-results" mkdir "%TEST_DIR%\test-results"

REM Set environment
set NERV_TEST_MODE=true
set NERV_MOCK_CLAUDE=true

REM Check for arguments
set USE_DOCKER=false
:parse_args
if "%1"=="" goto run_tests
if "%1"=="--docker" (
    set USE_DOCKER=true
    shift
    goto parse_args
)
if "%1"=="--real-claude" (
    set NERV_MOCK_CLAUDE=false
    shift
    goto parse_args
)
shift
goto parse_args

:run_tests
if "%USE_DOCKER%"=="true" (
    echo Running tests in Docker...
    cd /d "%TEST_DIR%"
    docker-compose up --build --abort-on-container-exit
) else (
    echo Running tests locally...
    cd /d "%PROJECT_ROOT%"
    npx playwright test --config=test/e2e/playwright.config.ts
)

set EXIT_CODE=%ERRORLEVEL%

echo === Test Results ===
echo Exit code: %EXIT_CODE%
echo Results saved to: %TEST_DIR%\test-results\

exit /b %EXIT_CODE%
