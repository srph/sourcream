$ErrorActionPreference = "Stop"

$trayRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$cargoPath = if ($null -ne $cargoCommand) {
    $cargoCommand.Source
} else {
    Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
}

if (-not (Test-Path -LiteralPath $cargoPath)) {
    $installer = Join-Path $env:TEMP "sourcream-rustup-init.exe"
    Write-Host "Rust was not found. Installing the minimal stable Rust GNU toolchain..."

    try {
        Invoke-WebRequest -UseBasicParsing -Uri "https://win.rustup.rs/x86_64" -OutFile $installer
        & $installer -y --profile minimal --default-toolchain stable-x86_64-pc-windows-gnu
        if ($LASTEXITCODE -ne 0) {
            throw "The Rust installer exited with code $LASTEXITCODE."
        }
    } finally {
        Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $cargoPath)) {
    throw "Cargo was not found after installing Rust. Open a new terminal and retry."
}

Push-Location $trayRoot
try {
    & $cargoPath fetch --locked
    if ($LASTEXITCODE -ne 0) {
        throw "Cargo could not download the tray dependencies."
    }
} finally {
    Pop-Location
}

Write-Host "Tray dependencies are ready."
