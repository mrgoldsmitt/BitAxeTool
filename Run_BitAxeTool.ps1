# PowerShell Launcher for BitAxeTool
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "    BitAxeTool - Multi-AutoTuner and Safety Governor" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Inkompatible venv bereinigen
$VenvPy = Join-Path $ScriptDir ".venv\Scripts\python.exe"
if ((Test-Path (Join-Path $ScriptDir ".venv")) -and -not (Test-Path $VenvPy)) {
    Write-Host "[*] Bereinige inkompatible .venv-Dateien..." -ForegroundColor Gray
    Remove-Item -Recurse -Force (Join-Path $ScriptDir ".venv")
}

# 2. Venv erstellen und Pakete installieren falls nötig
if (-not (Test-Path $VenvPy)) {
    Write-Host "[*] Suche Python auf dem System..." -ForegroundColor Gray
    $PythonCmd = $null
    $PythonArgs = @("-m", "venv", ".venv")
    if (Get-Command "py" -ErrorAction SilentlyContinue) {
        $PythonCmd = "py"
        $PythonArgs = @("-3", "-m", "venv", ".venv")
    } elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
        $PythonCmd = "python"
    } else {
        Write-Host ""
        Write-Host "[FEHLER] Python wurde auf deinem Computer nicht gefunden!" -ForegroundColor Red
        Write-Host "Bitte installiere Python 3.10+ von https://www.python.org/downloads/" -ForegroundColor White
        Write-Host "WICHTIG: Setze das Häkchen bei 'Add Python to PATH'!" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Druecke Enter zum Beenden"
        exit 1
    }

    Write-Host "[*] Erstelle lokale Windows-Umgebung (.venv)..." -ForegroundColor Cyan
    & $PythonCmd $PythonArgs
    if (-not (Test-Path $VenvPy)) {
        Write-Host "[FEHLER] Virtuelle Umgebung konnte nicht erstellt werden." -ForegroundColor Red
        Read-Host "Druecke Enter zum Beenden"
        exit 1
    }

    Write-Host "[*] Installiere Pakete (FastAPI, Uvicorn, WebSockets, HTTPX, Pydantic, ZeroConf)..." -ForegroundColor Cyan
    & $VenvPy -m pip install --upgrade pip
    & $VenvPy -m pip install --prefer-binary -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        & $VenvPy -m pip install --prefer-binary fastapi uvicorn websockets httpx pydantic zeroconf qrcode
    }
    Write-Host "[*] Installation erfolgreich abgeschlossen!" -ForegroundColor Green
}

Write-Host ""
Write-Host "[*] Starte BitAxeTool..." -ForegroundColor Green
Write-Host ""
& $VenvPy main.py $args

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Read-Host "BitAxeTool beendet. Druecke Enter"
}
