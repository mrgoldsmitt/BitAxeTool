@echo off
chcp 65001 >nul
title BitAxeTool - Solo Miner Governor
cd /d "%~dp0"

echo ========================================================
echo     BitAxeTool - Multi-AutoTuner and Safety Governor
echo ========================================================
echo.

:: 1. Falls eine inkompatible macOS .venv vorhanden ist, bereinigen
if exist ".venv" if not exist ".venv\Scripts\python.exe" (
    echo [*] Entferne inkompatible .venv-Dateien...
    rmdir /s /q ".venv"
)

:: 2. Falls bereits eine funktionierende Windows-Umgebung existiert, direkt starten
if exist ".venv\Scripts\python.exe" goto :RUN_APP

:: 3. Python auf Windows suchen
echo [*] Suche Python-Installation auf Windows...
py -3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=py -3"
    goto :CREATE_VENV
)

python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python"
    goto :CREATE_VENV
)

echo.
echo ========================================================
echo [FEHLER] Python wurde auf diesem Computer nicht gefunden!
echo ========================================================
echo Bitte installiere Python 3.10 oder neuer von:
echo    https://www.python.org/downloads/
echo.
echo WICHTIG: Setze bei der Installation unbedingt das Haekchen bei:
echo    [x] "Add Python to PATH"
echo.
pause
exit /b 1

:CREATE_VENV
echo [*] Erstelle virtuelle Windows-Umgebung (.venv)...
%PYTHON_EXE% -m venv .venv
if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [FEHLER] Virtuelle Umgebung konnte nicht erstellt werden.
    pause
    exit /b 1
)

echo [*] Aktualisiere pip...
".venv\Scripts\python.exe" -m pip install --upgrade pip

echo [*] Installiere benoetigte Pakete (FastAPI, Uvicorn, WebSockets, HTTPX, Pydantic, ZeroConf)...
".venv\Scripts\python.exe" -m pip install --prefer-binary -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] Standard-Installation hatte Warnungen, installiere Kernpakete direkt ohne C++ Compiler...
    ".venv\Scripts\python.exe" -m pip install --prefer-binary fastapi uvicorn websockets httpx pydantic zeroconf qrcode
)
echo [*] Alle Kernpakete erfolgreich einsatzbereit!

:RUN_APP
echo.
echo [*] Starte BitAxeTool...
echo.
".venv\Scripts\python.exe" main.py %*

if %errorlevel% neq 0 (
    echo.
    echo [HINWEIS] BitAxeTool wurde mit Code %errorlevel% beendet.
    pause
)
