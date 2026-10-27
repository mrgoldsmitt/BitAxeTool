@echo off
chcp 65001 >nul
title BitAxeTool - Windows Installer Builder
cd /d "%~dp0"

echo ========================================================
echo     BitAxeTool - Installer ^& Standalone EXE Builder
echo ========================================================
echo.

:: 1. Sicherstellen, dass die Windows-Umgebung vorhanden ist
if not exist ".venv\Scripts\python.exe" (
    echo [*] Erstelle zunaechst die Windows Python-Umgebung...
    call Run_BitAxeTool.bat
)

echo [*] Schritt 1: Erstelle Standalone Windows-Anwendung mit PyInstaller...
".venv\Scripts\python.exe" build_windows.py
if %errorlevel% neq 0 (
    echo.
    echo [FEHLER] PyInstaller-Kompilierung fehlgeschlagen.
    pause
    exit /b 1
)

echo.
echo [ERFOLG] Die eigenstaendige App wurde erstellt in: dist\BitAxeTool\BitAxeTool.exe
echo.

:: 2. Pruefen, ob Inno Setup installiert ist
echo [*] Schritt 2: Suche Inno Setup Compiler (ISCC.exe)...
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"

if defined ISCC (
    echo [*] Inno Setup gefunden: %ISCC%
    echo [*] Erstelle Setup-Installationsdatei...
    "%ISCC%" installer.iss
    if %errorlevel% equ 0 (
        echo.
        echo ========================================================
        echo [FERTIG!] Der fertige Windows-Installer liegt in:
        echo          installer_output\BitAxeTool_Setup_v2.1.0.exe
        echo ========================================================
    ) else (
        echo [WARNUNG] Inno Setup Kompilierung meldete einen Fehler.
    )
) else (
    echo.
    echo [HINWEIS] Inno Setup 6 ist noch nicht auf diesem PC installiert.
    echo - Du kannst die App bereits direkt starten unter: dist\BitAxeTool\BitAxeTool.exe
    echo - Wenn du eine fertige Setup.exe moechtest: Lade Inno Setup (kostenlos)
    echo   von https://jrsoftware.org/isdl.php herunter, oeffne installer.iss und klicke auf "Compile".
)

echo.
pause
