# Crea un acceso directo "Saturno" en el Escritorio con el icono de la app.
# Al abrirlo arranca el servidor (ventana minimizada) y abre el navegador.
# Si Saturno ya esta en marcha, solo abre el navegador.
param([string]$Destination = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if (-not $python) {
    Write-Host 'No se encontro python.exe en el PATH. Instala Python 3.9+ desde https://www.python.org/downloads/'
    exit 1
}

$link = Join-Path $Destination 'Saturno.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $python
$shortcut.Arguments = '"' + (Join-Path $root 'server.py') + '" --open'
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = (Join-Path $root 'public\icons\saturno.ico') + ',0'
$shortcut.WindowStyle = 7
$shortcut.Description = 'Saturno - negocios sin web y seguimiento de llamadas'
$shortcut.Save()

Write-Host "Acceso directo creado: $link"
