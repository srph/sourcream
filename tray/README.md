# Sourcream tray monitor

A native Windows notification-area monitor for Sourcream. It uses a Win32 message loop,
performs one short localhost health check every ten seconds, and has no GUI framework or
async runtime.

## Install dependencies

From the repository root:

```powershell
make install:tray
```

This installs the minimal stable Rust toolchain when Cargo is missing and downloads the
locked Cargo dependencies. It does not build, install, or launch the tray monitor.

## Build and install

```powershell
make build:tray
```

This runs `install:tray`, creates an optimized release build, safely replaces a running
monitor, writes `tray/dist/sourcream-tray.exe`, installs or refreshes the current user's
Startup shortcut, and launches the new build. Run `uninstall-startup.ps1` to remove the
Startup shortcut.

The monitor does not start Sourcream automatically. Its menu shows independent Sourcream
and Cloudflare Tunnel status sections, can pause or restart Sourcream, and can request an
elevated restart of the Windows `Cloudflared` service. Server output is written to
`tray/sourcream-server.log` and replaced on each server start.
