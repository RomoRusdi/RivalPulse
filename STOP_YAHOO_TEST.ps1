$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $Root "backend")

docker compose -f compose.yaml -f compose.yahoo.yaml --profile frontend down

Write-Host "RivalPulse Yahoo testing stack stopped. PostgreSQL and Redis volumes were preserved." -ForegroundColor Green
Write-Host "Close the separate frontend PowerShell window, or press Ctrl+C there, to stop Next.js."
