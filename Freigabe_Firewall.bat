@echo off
chcp 65001 >nul
title BitAxeTool - Windows Firewall Freigabe
echo ====================================================================
echo   BitAxeTool - Windows Firewall Freigabe für lokales Netzwerk
echo ====================================================================
echo.
echo Dieses Skript richtet eine Firewall-Ausnahmeregel für Port 21420 ein,
echo damit du vom Smartphone, Tablet oder anderen PCs im WLAN auf das
echo BitAxeTool Dashboard zugreifen kannst.
echo.

net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administratorrechte vorhanden. Richte Regel ein...
    netsh advfirewall firewall delete rule name="BitAxeTool LAN (Port 21420)" >nul 2>&1
    netsh advfirewall firewall add rule name="BitAxeTool LAN (Port 21420)" dir=in action=allow protocol=TCP localport=21420 profile=any
    echo.
    echo [ERFOLG] Port 21420 wurde in der Windows Defender Firewall freigegeben!
    echo Du kannst nun im Browser deines Smartphones aufrufen:
    echo http://192.168.188.194:21420
    echo.
) else (
    echo Fordere Administratorrechte (UAC) an...
    powershell -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

pause
