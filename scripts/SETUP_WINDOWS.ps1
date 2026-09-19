$ErrorActionPreference = "Stop"
Write-Host "Yaran Native - Windows development setup" -ForegroundColor Cyan
Write-Host "1) Installing Rustup (if missing)..."
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
  winget install --id Rustlang.Rustup --accept-package-agreements --accept-source-agreements
}
Write-Host "2) Selecting stable MSVC Rust toolchain..."
rustup default stable-msvc
Write-Host "3) Node.js is required for the Tauri CLI."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
}
Write-Host "4) Microsoft C++ Build Tools must include: Desktop development with C++."
Write-Host "   If it is not installed, install Visual Studio 2022 Build Tools before building." -ForegroundColor Yellow
Write-Host "5) Installing project npm dependencies..."
Set-Location (Split-Path $PSScriptRoot -Parent)
npm install
Write-Host "Setup complete. Run: npm run dev" -ForegroundColor Green
