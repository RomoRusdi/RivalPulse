$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location (Join-Path $Root "backend")
try {
    docker compose -f compose.yaml --profile frontend down
} finally { Pop-Location }
Write-Host "RivalPulse Sectors stack stopped. PostgreSQL and Redis volumes were preserved." -ForegroundColor Green
