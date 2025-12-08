<#
.SYNOPSIS
    Installation script for the project.

.DESCRIPTION
    Installs dependencies, builds the project, and sets up configuration.

.EXAMPLE
    .\install.ps1
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

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

Write-Host "Project Installation" -ForegroundColor Magenta
Write-Host "====================" -ForegroundColor Magenta

# Check Node.js
Write-Step "Checking Node.js..."
try {
    $nodeVersion = node --version
    Write-Success "Node.js $nodeVersion found"
}
catch {
    Write-Error "Node.js not found. Please install Node.js 18 or higher."
    exit 1
}

# Check npm
Write-Step "Checking npm..."
try {
    $npmVersion = npm --version
    Write-Success "npm $npmVersion found"
}
catch {
    Write-Error "npm not found."
    exit 1
}

# Install dependencies
Write-Step "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies"
    exit 1
}
Write-Success "Dependencies installed"

# Build project
Write-Step "Building project..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}
Write-Success "Build successful"

# Create .env if not exists
Write-Step "Checking configuration..."
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Success "Created .env from .env.example"
        Write-Host "Please edit .env with your configuration." -ForegroundColor Yellow
    }
    else {
        Write-Host ".env.example not found, skipping .env creation" -ForegroundColor Yellow
    }
}
else {
    Write-Success ".env already exists"
}

# Create logs directory
Write-Step "Creating logs directory..."
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}
Write-Success "Logs directory ready"

Write-Host "`n" -NoNewline
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Edit .env with your configuration"
Write-Host "  2. Run 'npm start' to start the application"
Write-Host "  3. Or run 'npm run daemon:start' for background mode"
