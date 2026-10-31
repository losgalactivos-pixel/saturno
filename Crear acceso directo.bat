@echo off
rem Crea el acceso directo "Saturno" (con su icono) en el Escritorio.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\crear-acceso-directo.ps1"
pause
