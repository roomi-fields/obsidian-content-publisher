# Deploy script for Obsidian Substack Publisher
# Usage: .\deploy.ps1 [vault_path]

param(
    [string]$VaultPath = "D:\Romain\Articles"
)

$PluginDir = "$VaultPath\.obsidian\plugins\obsidian-substack"

# Create plugin directory if it doesn't exist
if (-not (Test-Path $PluginDir)) {
    New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
    Write-Host "Created plugin directory: $PluginDir" -ForegroundColor Green
}

# Build first
Write-Host "Building plugin..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build successful" -ForegroundColor Green

# Copy files
$Files = @("main.js", "manifest.json", "styles.css")
foreach ($File in $Files) {
    Copy-Item ".\$File" -Destination $PluginDir -Force
    Write-Host "Copied $File" -ForegroundColor Cyan
}

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Reload Obsidian (Ctrl+R) to apply changes." -ForegroundColor Yellow
