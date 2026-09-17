$ErrorActionPreference = "Stop"

$trayRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $trayRoot "dist"
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if ($null -eq $cargo) {
    $cargoPath = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
    if (-not (Test-Path -LiteralPath $cargoPath)) {
        throw "Cargo was not found. Install the stable Rust toolchain first."
    }
} else {
    $cargoPath = $cargo.Source
}

Push-Location $trayRoot
try {
    & $cargoPath build --release
    New-Item -ItemType Directory -Force -Path $dist | Out-Null
    Copy-Item -Force (Join-Path $trayRoot "target\release\sourcream-tray.exe") (Join-Path $dist "sourcream-tray.exe")
} finally {
    Pop-Location
}

Write-Host "Built $dist\sourcream-tray.exe"
