@echo off
setlocal
cd /d %~dp0
where npm >nul 2>nul || (echo Node.js/npm is not installed. & pause & exit /b 1)
where rustc >nul 2>nul || (echo Rust is not installed. Run scripts\SETUP_WINDOWS.ps1 first. & pause & exit /b 1)
if not exist node_modules call npm install
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Check that Microsoft C++ Build Tools with Desktop development with C++ are installed.
  pause
  exit /b 1
)
echo.
echo Build complete. Check src-tauri\target\release\bundle\nsis\
pause
