param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $projectDir "logs"
$stdoutLog = Join-Path $logDir "dashboard.log"
$stderrLog = Join-Path $logDir "dashboard-error.log"
$url = "http://127.0.0.1:8000"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Test-Dashboard {
    try {
        $health = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 2
        return $health.app -eq "crypto-investments-dashboard"
    }
    catch { return $false }
}

if (-not (Test-Dashboard)) {
    $pythonCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\pythonw.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
        "pythonw.exe",
        "python.exe"
    )
    $python = $pythonCandidates | Where-Object {
        if ([IO.Path]::IsPathRooted($_)) { Test-Path $_ } else { Get-Command $_ -ErrorAction SilentlyContinue }
    } | Select-Object -First 1
    if (-not $python) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("Python não foi encontrado. Reinstale o Python 3.13 ou ajuste start_dashboard.ps1.", "Crypto Investments") | Out-Null
        exit 1
    }
    Start-Process -FilePath $python `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $projectDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-Dashboard) { $ready = $true; break }
    }
    if (-not $ready) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("O servidor não iniciou. Consulte logs\dashboard-error.log.", "Crypto Investments") | Out-Null
        exit 1
    }
}

try { Invoke-RestMethod -Method Post -Uri "$url/api/refresh" -TimeoutSec 180 | Out-Null }
catch { }
if (-not $NoBrowser) { Start-Process $url }
