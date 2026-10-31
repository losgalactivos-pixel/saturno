@echo off
rem Arranca Saturno y abre el navegador. Cierra esta ventana para detenerlo.
title Saturno
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python. Instala Python 3.9 o superior desde https://www.python.org/downloads/
  echo y marca la opcion "Add python.exe to PATH" durante la instalacion.
  pause
  exit /b 1
)
python server.py --open
if errorlevel 1 pause
