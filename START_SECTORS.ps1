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

$TokenLine = Get-Content $BackendEnv | Where-Object { $_ -match '^DEMO_ACCESS_TOKEN=' } | Select-Object -First 1
$DemoToken = ($TokenLine -replace '^DEMO_ACCESS_TOKEN=', '').Trim()
if ($DemoToken.Length -lt 16 -or $DemoToken -match '^replace-with-') {
    throw "Set a random 16+ character DEMO_ACCESS_TOKEN in backend/.env before starting."
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
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
"@ | Set-Content $FrontendEnv
}
$FrontendSettings = Get-Content $FrontendEnv
if (-not ($FrontendSettings -match '^NEXT_PUBLIC_USE_MOCKS=false$') -or
    -not ($FrontendSettings -match '^NEXT_PUBLIC_API_BASE=http://localhost:8080/backend$')) {
    throw "Set NEXT_PUBLIC_USE_MOCKS=false and NEXT_PUBLIC_API_BASE=http://localhost:8080/backend in frontend/.env.local, then rerun."
}

docker info *> $null
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
        try { npm ci } finally { Pop-Location }
    }
    $Command = "Set-Location -LiteralPath '$Frontend'; npm run dev"
    Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $Command)
    Write-Host "Started the frontend in a separate PowerShell window."
}

Push-Location $Backend
try {
    docker compose -f compose.yaml --profile frontend up --build -d
    docker compose -f compose.yaml --profile frontend restart frontend-proxy
} finally { Pop-Location }

$Ready = $null
# Initial Docker Desktop/migration startup can exceed two minutes on Windows.
for ($Attempt = 0; $Attempt -lt 180; $Attempt++) {
    try {
        $Ready = Invoke-RestMethod "http://localhost:8000/api/v1/health/ready" -TimeoutSec 4
        if ($Ready.status -eq "ready" -and $Ready.mode -eq "live") { break }
    } catch {}
    Start-Sleep -Seconds 2
}
if ($Ready.status -ne "ready" -or $Ready.mode -ne "live") { throw "Sectors-mode API did not become ready. Check Docker logs and backend/.env." }

Write-Host "Sectors-mode stack ready; API key presence checked but live authorization NOT verified." -ForegroundColor Green
Write-Host "A Sectors research run may use credits. Obtain/verify your key before investigating."
Write-Host "1. Login: http://localhost:8080/login"
Write-Host "2. App:   http://localhost:8080"
Write-Host "3. Token: Get-Content '$BackendEnv' | Select-String '^DEMO_ACCESS_TOKEN='"
