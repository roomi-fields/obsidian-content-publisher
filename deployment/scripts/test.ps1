<#
.SYNOPSIS
    Test the application endpoints.

.DESCRIPTION
    Runs basic tests against the running application.

.PARAMETER BaseUrl
    Base URL of the application. Default: http://localhost:3000

.EXAMPLE
    .\test.ps1
    .\test.ps1 -BaseUrl "http://localhost:8080"
#>

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [string]$Body = $null,
        [int]$ExpectedStatus = 200
    )

    Write-Host "  Testing: $Name... " -NoNewline

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            ContentType = "application/json"
            UseBasicParsing = $true
        }

        if ($Body) {
            $params.Body = $Body
        }

        $response = Invoke-WebRequest @params
        $status = $response.StatusCode

        if ($status -eq $ExpectedStatus) {
            Write-Host "[PASS]" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "[FAIL] Expected $ExpectedStatus, got $status" -ForegroundColor Red
            return $false
        }
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq $ExpectedStatus) {
            Write-Host "[PASS]" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }
}

Write-Host "API Endpoint Tests" -ForegroundColor Magenta
Write-Host "==================" -ForegroundColor Magenta
Write-Host "Base URL: $BaseUrl"

$passed = 0
$failed = 0

# Health Check
Write-Step "Health Check"
if (Test-Endpoint -Name "GET /health" -Method "GET" -Url "$BaseUrl/health") {
    $passed++
}
else {
    $failed++
}

# Add more tests as needed
# Write-Step "API Endpoints"
# if (Test-Endpoint -Name "GET /api/resources" -Method "GET" -Url "$BaseUrl/api/resources") {
#     $passed++
# } else {
#     $failed++
# }

# Summary
Write-Host "`n" -NoNewline
Write-Host "Results" -ForegroundColor Magenta
Write-Host "=======" -ForegroundColor Magenta
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -gt 0) {
    exit 1
}
