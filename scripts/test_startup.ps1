$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Tokens = $null
$ParseErrors = $null
$Ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $Root "START_SECTORS.ps1"), [ref]$Tokens, [ref]$ParseErrors)
if ($ParseErrors.Count) { throw ($ParseErrors -join "`n") }
# Load only the retry function; tests must never start Docker or read .env.
$Function = $Ast.Find({ param($Node)
    $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $Node.Name -eq "Invoke-ComposeStartup"
}, $true)
Invoke-Expression $Function.Extent.Text

function docker {
    $script:Calls.Add(($args -join " "))
    $Response = $script:Responses.Dequeue()
    $global:LASTEXITCODE = $Response.Code
    Write-Output $Response.Text
}
function Start-Sleep { param([int]$Seconds) }
function Test-StartupCase {
    param([string]$Name, [object[]]$Responses, [int]$ExpectedCalls, [bool]$ShouldFail)
    $script:Calls = New-Object 'System.Collections.Generic.List[string]'
    $script:Responses = New-Object 'System.Collections.Generic.Queue[object]'
    foreach ($Response in $Responses) { $script:Responses.Enqueue($Response) }
    $Failed = $false
    try { Invoke-ComposeStartup -ComposeArguments @("up", "--no-build", "-d") }
    catch { $Failed = $true }
    if ($Failed -ne $ShouldFail -or $script:Calls.Count -ne $ExpectedCalls) {
        throw "$Name failed: calls=$($script:Calls.Count), failed=$Failed"
    }
    foreach ($Call in $script:Calls) {
        if ($Call -ne "compose --ansi never -f compose.yaml --profile frontend --parallel 1 up --no-build -d") {
            throw "Unexpected Docker command: $Call"
        }
    }
    if ($ErrorActionPreference -ne "Stop") { throw "Error handling preference was not restored" }
    Write-Host "PASS: $Name"
}
$Success = @{ Code = 0; Text = "Started" }
$Timeout = @{ Code = 1; Text = "Error response from daemon: inspecting container: context deadline exceeded" }
Test-StartupCase "successful startup" @($Success) 1 $false
Test-StartupCase "partial startup recovers after timeout" @($Timeout, $Success) 2 $false
Test-StartupCase "transient retries are bounded" @($Timeout, $Timeout, $Timeout) 3 $true
Test-StartupCase "application failures are not retried" @(@{ Code = 1; Text = "migrate exited (1)" }) 1 $true
Write-Host "All 4 startup regression checks passed."
