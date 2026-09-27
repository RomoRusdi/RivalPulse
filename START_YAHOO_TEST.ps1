$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

Write-Host "RivalPulse Yahoo testing startup" -ForegroundColor Cyan

# Create local-only configuration on a fresh checkout.
$BackendEnv = Join-Path $Backend ".env"
if (-not (Test-Path $BackendEnv)) {
    Copy-Item (Join-Path $Backend ".env.example") $BackendEnv
    $Bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
    $Token = [Convert]::ToBase64String($Bytes)
    (Get-Content $BackendEnv) -replace '^DEMO_ACCESS_TOKEN=.*$', "DEMO_ACCESS_TOKEN=$Token" | Set-Content $BackendEnv
    Write-Host "Created backend/.env with a private local access token."
}

$FrontendEnv = Join-Path $Frontend ".env.local"
if (-not (Test-Path $FrontendEnv)) {
    @"
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
"@ | Set-Content $FrontendEnv
    Write-Host "Created frontend/.env.local for the backend API."
}

# Fail early with a useful message instead of opening a half-working UI.
docker info *> $null
try {
    $Tags = Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 5
} catch {
    throw "Ollama is not reachable on port 11434. Start Ollama, then run this script again."
}
if (-not ($Tags.models.name -contains "qwen3.8:27b")) {
    throw "Ollama model qwen3.8:27b is missing. Run: ollama pull qwen3.8:27b"
}

# Start Next.js only when another process is not already listening on port 3000.
$FrontendReady = Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $FrontendReady) {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
        Push-Location $Frontend
        npm ci
        Pop-Location
    }
    $Command = "Set-Location -LiteralPath '$Frontend'; npm run dev"
    Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $Command)
    Write-Host "Started the frontend in a separate PowerShell window."
}

Push-Location $Backend
docker compose -f compose.yaml -f compose.yahoo.yaml --profile frontend up --build -d
# Reload the mounted proxy configuration and its dynamic Docker DNS settings.
docker compose -f compose.yaml -f compose.yahoo.yaml --profile frontend restart frontend-proxy
Pop-Location

for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    try {
        $Ready = Invoke-RestMethod "http://localhost:8000/api/v1/health/ready" -TimeoutSec 2
        if ($Ready.status -eq "ready") { break }
    } catch {}
    Start-Sleep -Seconds 2
}
if ($Ready.status -ne "ready") { throw "The RivalPulse API did not become ready." }

Write-Host ""
Write-Host "Testing API is ready in explicit Yahoo mode." -ForegroundColor Green
Write-Host "1. Login: http://localhost:8080/backend/demo/login"
Write-Host "2. App:   http://localhost:8080"
Write-Host "3. Token: Get-Content '$BackendEnv' | Select-String '^DEMO_ACCESS_TOKEN='"
