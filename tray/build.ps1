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
    if ($LASTEXITCODE -ne 0) {
        throw "The tray release build failed."
    }

    $running = @(Get-Process -Name "sourcream-tray" -ErrorAction SilentlyContinue)
    foreach ($process in $running) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit(5000) | Out-Null
    }

    New-Item -ItemType Directory -Force -Path $dist | Out-Null
    $executable = Join-Path $dist "sourcream-tray.exe"
    Copy-Item -Force (Join-Path $trayRoot "target\release\sourcream-tray.exe") $executable
    $distAssets = Join-Path $dist "assets"
    New-Item -ItemType Directory -Force -Path $distAssets | Out-Null
    Copy-Item -Force (Join-Path $trayRoot "assets\status-*.ico") $distAssets

    & (Join-Path $trayRoot "install-startup.ps1")
    Start-Process -FilePath $executable -WorkingDirectory $trayRoot -WindowStyle Hidden
} finally {
    Pop-Location
}

Write-Host "Built, installed, and started $dist\sourcream-tray.exe"
