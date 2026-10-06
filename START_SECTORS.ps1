$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$BackendEnv = Join-Path $Backend ".env"
$FrontendEnv = Join-Path $Frontend ".env.local"

Write-Host "RivalPulse Sectors v2 startup" -ForegroundColor Cyan

if (-not (Test-Path $BackendEnv)) {
    Copy-Item (Join-Path $Backend ".env.example") $BackendEnv
    $Bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
    $Token = [Convert]::ToBase64String($Bytes)
    (Get-Content $BackendEnv) -replace '^DEMO_ACCESS_TOKEN=.*$', "DEMO_ACCESS_TOKEN=$Token" | Set-Content $BackendEnv
    Write-Host "Created backend/.env. Add SECTORS_API_KEY before continuing."
}

$BackendSettings = Get-Content $BackendEnv
if (-not ($BackendSettings -match '^AUTH_MODE=accounts$')) {
    throw "Set AUTH_MODE=accounts in backend/.env to enable account login and workspace isolation."
}
if (-not ($BackendSettings -match '^MODE=live$')) {
    throw "Set MODE=live in backend/.env. Yahoo mode is unsupported by the current agent."
}

# Never echo, send to the browser, or commit the server-only API key.
$KeyLine = Get-Content $BackendEnv | Where-Object { $_ -match '^SECTORS_API_KEY=' } | Select-Object -First 1
$KeyValue = ($KeyLine -replace '^SECTORS_API_KEY=', '').Trim()
if (-not $KeyValue -or $KeyValue -match '^(replace|your|test-only)') {
    throw "Set a valid SECTORS_API_KEY in backend/.env. This script will not start research without a configured key."
}

if (-not (Test-Path $FrontendEnv)) {
    @"
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=/backend
NEXT_PUBLIC_AUTH_MODE=accounts
"@ | Set-Content $FrontendEnv
}
$FrontendSettings = Get-Content $FrontendEnv
if (-not ($FrontendSettings -match '^NEXT_PUBLIC_USE_MOCKS=false$') -or
    -not ($FrontendSettings -match '^NEXT_PUBLIC_API_BASE=/backend$') -or
    -not ($FrontendSettings -match '^NEXT_PUBLIC_AUTH_MODE=accounts$')) {
    throw "Set NEXT_PUBLIC_USE_MOCKS=false, NEXT_PUBLIC_AUTH_MODE=accounts and NEXT_PUBLIC_API_BASE=/backend in frontend/.env.local, then rerun."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop's Linux engine is not running. Start Docker Desktop, wait until ready, then rerun."
}
$OllamaEnabled = Get-Content $BackendEnv | Where-Object { $_ -match '^LLM_ENABLED=true$' }
if ($OllamaEnabled) {
    try {
        $Tags = Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 5
    } catch {
        throw "Ollama is not reachable on port 11434. Start Ollama and run this script again."
    }
    if (-not ($Tags.models.name -contains "qwen3.8:27b")) {
        throw "Ollama model qwen3.8:27b is missing. Run: ollama pull qwen3.8:27b"
    }
}

$FrontendReady = Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $FrontendReady) {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
        Push-Location $Frontend
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed. Check npm output and retry." }
        } finally { Pop-Location }
    }
    $Command = "Set-Location -LiteralPath '$Frontend'; npm run dev -- --hostname 0.0.0.0 --port 3000"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @("-NoExit", "-Command", $Command)
    Write-Host "Started the frontend in the background."
}

Push-Location $Backend
try {
    docker compose -f compose.yaml --profile frontend up --build -d
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose startup failed. Check the error above before retrying." }
    docker compose -f compose.yaml --profile frontend restart frontend-proxy
    if ($LASTEXITCODE -ne 0) { throw "Frontend proxy restart failed. Check Docker Compose logs." }
} finally { Pop-Location }

$Ready = $null
Write-Host "Proxy restart complete. Waiting for the backend readiness check..." -ForegroundColor Cyan
# Initial Docker Desktop/migration startup can exceed two minutes on Windows.
for ($Attempt = 0; $Attempt -lt 180; $Attempt++) {
    try {
        $Ready = Invoke-RestMethod "http://localhost:8000/api/v1/health/ready" -TimeoutSec 4
        if ($Ready.status -eq "ready" -and $Ready.mode -eq "live") { break }
    } catch {}
    if ($Attempt -gt 0 -and $Attempt % 15 -eq 0) {
        Write-Host "Backend is not ready yet. Inspect it with: docker compose -f compose.yaml logs --tail 60 api (from backend/)."
    }
    Start-Sleep -Seconds 2
}
if ($Ready.status -ne "ready" -or $Ready.mode -ne "live") { throw "Sectors-mode API did not become ready. Check Docker logs and backend/.env." }

Write-Host "Sectors-mode stack ready; API key presence checked but live authorization NOT verified." -ForegroundColor Green
Write-Host "A Sectors research run may use credits. Obtain/verify your key before investigating."
Write-Host "1. Login: http://localhost:8080/login"
Write-Host "2. App:   http://localhost:8080"
Write-Host "3. New account: http://localhost:8080/signup"
Write-Host "4. Profile: http://localhost:8080/profile"
