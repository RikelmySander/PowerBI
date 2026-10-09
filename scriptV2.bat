@echo off
rem Compatibilidade: o fluxo antigo agora inicia o dashboard completo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_dashboard.ps1"
