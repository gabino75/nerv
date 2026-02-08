@echo off
REM Build nerv-hook binary for all platforms
REM
REM Output follows electron-builder naming conventions:
REM - nerv-hook-windows-amd64.exe (Windows x64)
REM - nerv-hook-darwin-x64 (macOS Intel)
REM - nerv-hook-darwin-arm64 (macOS Apple Silicon)
REM - nerv-hook-linux-x64 (Linux x64)
REM - nerv-hook-linux-arm64 (Linux ARM64)

setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set HOOK_DIR=%PROJECT_ROOT%\cmd\nerv-hook
set OUT_DIR=%PROJECT_ROOT%\resources

cd /d "%HOOK_DIR%"

echo Building nerv-hook for all platforms...

echo   - windows/amd64
set GOOS=windows
set GOARCH=amd64
go build -ldflags="-s -w" -o "%OUT_DIR%\nerv-hook-windows-amd64.exe" .

echo   - darwin/amd64
set GOOS=darwin
set GOARCH=amd64
go build -ldflags="-s -w" -o "%OUT_DIR%\nerv-hook-darwin-x64" .

echo   - darwin/arm64
set GOOS=darwin
set GOARCH=arm64
go build -ldflags="-s -w" -o "%OUT_DIR%\nerv-hook-darwin-arm64" .

echo   - linux/amd64
set GOOS=linux
set GOARCH=amd64
go build -ldflags="-s -w" -o "%OUT_DIR%\nerv-hook-linux-x64" .

echo   - linux/arm64
set GOOS=linux
set GOARCH=arm64
go build -ldflags="-s -w" -o "%OUT_DIR%\nerv-hook-linux-arm64" .

echo.
echo Build complete! Binaries in %OUT_DIR%:
dir "%OUT_DIR%\nerv-hook-*"

endlocal
