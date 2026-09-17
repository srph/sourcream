$ErrorActionPreference = "Stop"

$trayRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$executable = Join-Path $trayRoot "dist\sourcream-tray.exe"
if (-not (Test-Path -LiteralPath $executable)) {
    throw "Build the tray app first with .\build.ps1."
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Sourcream Monitor.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = $trayRoot
$shortcut.Description = "Monitor and start the Sourcream server"
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
