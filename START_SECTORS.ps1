$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$BackendEnv = Join-Path $Backend ".env"
$FrontendEnv = Join-Path $Frontend ".env.local"

function Invoke-ComposeStartup {
    param(
        [string[]]$ComposeArguments,
        [int]$MaxAttempts = 3,
        [int]$RetryDelaySeconds = 5
    )

    for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
        # Windows PowerShell treats native stderr as ErrorRecords. Capture it
        # without terminating before we can inspect Docker's actual exit code.
        $PreviousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $Output = @(& docker compose --ansi never -f compose.yaml --profile frontend --parallel 1 @ComposeArguments 2>&1)
            $ExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $PreviousPreference
        }
        $Output | ForEach-Object { Write-Host "$_" }
        if ($ExitCode -eq 0) { return }

        $Transient = ($Output -join "`n") -match '(?i)context deadline exceeded|i/o timeout|TLS handshake timeout|unexpected EOF|the pipe has been ended'
        if (-not $Transient -or $Attempt -eq $MaxAttempts) {
            throw "Docker Compose $($ComposeArguments -join ' ') failed (exit $ExitCode). Inspect: docker compose -f backend/compose.yaml --profile frontend ps -a and logs --tail 60. If Docker still reports a timeout, restart Docker Desktop and rerun this script. Existing volumes are retained."
        }
        Write-Host "Docker engine timed out. Retrying startup ($($Attempt + 1)/$MaxAttempts); existing containers and data will be reused." -ForegroundColor Yellow
        Start-Sleep -Seconds ($RetryDelaySeconds * $Attempt)
    }
}

Write-Host "RivalPulse Sectors v2 startup" -ForegroundColor Cyan

if (-not (Test-Path $BackendEnv)) {
    Copy-Item (Join-Path $Backend ".env.example") $BackendEnv
    $Bytes = New-Object byte[] 24
    $Random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Random.GetBytes($Bytes) } finally { $Random.Dispose() }
    $Token = [Convert]::ToBase64String($Bytes)
    (Get-Content $BackendEnv) -replace '^DEMO_ACCESS_TOKEN=.*$', "DEMO_ACCESS_TOKEN=$Token" | Set-Content $BackendEnv
    Write-Host "Created backend/.env. Configure verification SMTP and your data connection before investigating."
}

$BackendSettings = Get-Content $BackendEnv
if (-not ($BackendSettings -match '^AUTH_MODE=accounts$')) {
    throw "Set AUTH_MODE=accounts in backend/.env to enable account login and workspace isolation."
}
if (-not ($BackendSettings -match '^MODE=live$')) {
    throw "Set MODE=live in backend/.env. Sectors v2 is the only supported live data provider."
}

# Never echo, send to the browser, or commit the server-only API key.
$KeyLine = Get-Content $BackendEnv | Where-Object { $_ -match '^SECTORS_API_KEY=' } | Select-Object -First 1
$KeyValue = ($KeyLine -replace '^SECTORS_API_KEY=', '').Trim()
if (-not $KeyValue -or $KeyValue -match '^(replace|your|test-only)') {
    Write-Warning 'No shared Sectors key is configured. Sign in and add your workspace key in Settings before starting research.'
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
        Write-Warning 'Local Ollama is unavailable. Local AI will need Ollama; configured cloud workspaces can still operate.'
    }
    if ($Tags -and -not ($Tags.models.name -contains "qwen3.8:27b")) {
        Write-Warning 'Default local model qwen3.8:27b is missing. Install it, choose another installed model, or configure a cloud provider in Settings.'
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
    $EscapedFrontend = $Frontend.Replace("'", "''")
    $Command = "Set-Location -LiteralPath '$EscapedFrontend'; npm run dev -- --hostname 0.0.0.0 --port 3000"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @("-NoExit", "-Command", $Command)
    Write-Host "Started the frontend in the background."
}

# Create the private LLM encryption key once, outside Git and outside images.
# Never replace it: existing workspace credentials depend on this exact key.
$LlmKeyFile = Join-Path $Backend '.env.llm-encryption'
if (-not (Test-Path $LlmKeyFile)) {
    $LlmBytes = New-Object byte[] 32
    $LlmRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $LlmRandom.GetBytes($LlmBytes) } finally { $LlmRandom.Dispose() }
    $LlmKey = [Convert]::ToBase64String($LlmBytes).Replace('+', '-').Replace('/', '_')
    [IO.File]::WriteAllText($LlmKeyFile, $LlmKey, (New-Object Text.UTF8Encoding($false)))
    $LlmAcl = Get-Acl -LiteralPath $LlmKeyFile
    $LlmAcl.SetAccessRuleProtection($true, $false)
    $LlmOwner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $LlmAcl.SetOwner($LlmOwner)
    $LlmAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($LlmOwner, 'FullControl', 'Allow')))
    $LlmAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), 'ReadAndExecute', 'Allow')))
    $LlmAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')), 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $LlmKeyFile -AclObject $LlmAcl
    Write-Host 'Created private LLM key storage; no API requests were sent.'
}

Push-Location $Backend
try {
    # Build once, then resume partial startup on transient Docker Desktop errors.
    # Limit concurrent engine operations, which can time out on Windows startup.
    Invoke-ComposeStartup -ComposeArguments @("build") -MaxAttempts 1
    Invoke-ComposeStartup -ComposeArguments @("up", "--no-build", "-d")
    Invoke-ComposeStartup -ComposeArguments @("restart", "frontend-proxy")
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

$FrontendReady = $false
Write-Host "Backend ready. Checking the frontend and API through the gateway..." -ForegroundColor Cyan
for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    try {
        $Login = Invoke-WebRequest "http://localhost:8080/login" -UseBasicParsing -TimeoutSec 5
        $GatewayReady = Invoke-RestMethod "http://localhost:8080/backend/api/v1/health/ready" -TimeoutSec 5
        if ($Login.StatusCode -eq 200 -and $Login.Content -match 'name="email"' -and
            $GatewayReady.status -eq "ready" -and $GatewayReady.mode -eq "live") {
            $FrontendReady = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $FrontendReady) {
    throw "Backend is ready, but the frontend gateway is not. Check the frontend on port 3000 and docker compose -f backend/compose.yaml logs --tail 60 frontend-proxy."
}

Write-Host "Sectors-mode stack ready; provider authorization and balances have not been tested." -ForegroundColor Green
Write-Host "Configure your data/AI connection in Settings. Research may use Sectors credits and separate cloud-model charges."
Write-Host "1. Login: http://localhost:8080/login"
Write-Host "2. App:   http://localhost:8080"
Write-Host "3. New account: http://localhost:8080/signup"
Write-Host "4. Profile: http://localhost:8080/profile"
