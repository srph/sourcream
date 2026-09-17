$ErrorActionPreference = "Stop"

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Sourcream Monitor.lnk"
if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath
    Write-Host "Removed startup shortcut: $shortcutPath"
} else {
    Write-Host "The Sourcream startup shortcut is not installed."
}
