<#
.SYNOPSIS
    Start the application server.

.DESCRIPTION
    Starts the application in foreground or daemon mode.

.PARAMETER Daemon
    Run in daemon mode using PM2.

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Daemon
#>

param(
    [switch]$Daemon
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

# Navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

# Check if built
if (-not (Test-Path "dist/index.js")) {
    Write-Step "Building project..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build failed" -ForegroundColor Red
        exit 1
    }
}

if ($Daemon) {
    Write-Step "Starting in daemon mode..."
    npm run daemon:start
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Application started in daemon mode"
        Write-Host "`nUseful commands:" -ForegroundColor Yellow
        Write-Host "  npm run daemon:status  - Check status"
        Write-Host "  npm run daemon:logs    - View logs"
        Write-Host "  npm run daemon:stop    - Stop daemon"
    }
}
else {
    Write-Step "Starting application..."
    npm start
}
