<#
.SYNOPSIS
    Automated release and publish script for npm packages.

.DESCRIPTION
    This script automates the complete release workflow:
    - Version validation
    - Build verification
    - Git operations (commit, tag, push)
    - npm publication
    - GitHub release creation

.PARAMETER Version
    The version to release (e.g., "1.2.3" or "patch", "minor", "major")

.PARAMETER SkipNpm
    Skip npm publish step

.PARAMETER SkipGitHub
    Skip GitHub release creation

.PARAMETER DryRun
    Show what would be done without making changes

.EXAMPLE
    .\publish.ps1 -Version patch
    .\publish.ps1 -Version 1.2.3
    .\publish.ps1 -Version minor -SkipNpm
    .\publish.ps1 -Version major -DryRun
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [switch]$SkipNpm,
    [switch]$SkipGitHub,
    [switch]$DryRun
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

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..\..")
Set-Location $ProjectRoot

Write-Host "Release Script" -ForegroundColor Magenta
Write-Host "==============" -ForegroundColor Magenta

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No changes will be made"
}

# Step 1: Validate git status
Write-Step "Checking git status..."
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Error "Working directory is not clean. Commit or stash changes first."
    exit 1
}
Write-Success "Working directory is clean"

# Step 2: Ensure on main branch
$currentBranch = git branch --show-current
if ($currentBranch -ne "main" -and $currentBranch -ne "master") {
    Write-Warning "Not on main/master branch (currently on: $currentBranch)"
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Step 3: Update version
Write-Step "Updating version..."
if ($Version -match "^(patch|minor|major)$") {
    if (-not $DryRun) {
        npm version $Version --no-git-tag-version | Out-Null
    }
    $NewVersion = (Get-Content package.json | ConvertFrom-Json).version
} else {
    $NewVersion = $Version
    if (-not $DryRun) {
        npm version $Version --no-git-tag-version --allow-same-version | Out-Null
    }
}
Write-Success "Version: $NewVersion"

# Step 4: Run version update script
Write-Step "Updating version references..."
if (-not $DryRun) {
    node .claude/skills/release/scripts/update-version.cjs
}

# Step 5: Build
Write-Step "Building..."
if (-not $DryRun) {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
}
Write-Success "Build successful"

# Step 6: Run tests
Write-Step "Running tests..."
if (-not $DryRun) {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed"
        exit 1
    }
}
Write-Success "Tests passed"

# Step 7: Git commit and tag
Write-Step "Creating git commit and tag..."
if (-not $DryRun) {
    git add -A
    git commit -m "chore: release v$NewVersion"
    git tag -a "v$NewVersion" -m "Release v$NewVersion"
}
Write-Success "Created commit and tag v$NewVersion"

# Step 8: Push to GitHub
Write-Step "Pushing to GitHub..."
if (-not $DryRun) {
    git push origin $currentBranch
    git push origin "v$NewVersion"
}
Write-Success "Pushed to GitHub"

# Step 9: Publish to npm
if (-not $SkipNpm) {
    Write-Step "Publishing to npm..."
    if (-not $DryRun) {
        npm publish --access public
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm publish failed"
            exit 1
        }
    }
    Write-Success "Published to npm"
} else {
    Write-Warning "Skipping npm publish"
}

# Step 10: Create GitHub release
if (-not $SkipGitHub) {
    Write-Step "Creating GitHub release..."
    if (-not $DryRun) {
        gh release create "v$NewVersion" --title "v$NewVersion" --generate-notes
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "GitHub release creation failed (gh CLI may not be installed)"
        } else {
            Write-Success "GitHub release created"
        }
    }
} else {
    Write-Warning "Skipping GitHub release"
}

Write-Host "`n" -NoNewline
Write-Host "Release v$NewVersion complete!" -ForegroundColor Green
