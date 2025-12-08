<#
.SYNOPSIS
    Stop the application server.

.DESCRIPTION
    Stops the application running in daemon mode.

.EXAMPLE
    .\stop.ps1
#>

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

Write-Step "Stopping application..."
npm run daemon:stop

if ($LASTEXITCODE -eq 0) {
    Write-Success "Application stopped"
}
else {
    Write-Host "[WARN] Application may not have been running" -ForegroundColor Yellow
}
