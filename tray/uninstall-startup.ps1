$ErrorActionPreference = "Stop"

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPaths = @(
    (Join-Path $startup "Sourcream.lnk"),
    (Join-Path $startup "Sourcream Monitor.lnk")
)
$removed = $false
foreach ($shortcutPath in $shortcutPaths) {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath
        Write-Host "Removed startup shortcut: $shortcutPath"
        $removed = $true
    }
}
if (-not $removed) {
    Write-Host "The Sourcream startup shortcut is not installed."
}
