# Sourcream tray monitor

A native Windows notification-area monitor for Sourcream. It uses a Win32 message loop,
performs one short localhost health check every ten seconds, and has no GUI framework or
async runtime.

## Build

Install the stable Rust toolchain, then run:

```powershell
cd tray
.\build.ps1
```

The release executable is written to `tray/dist/sourcream-tray.exe`.

## Run at sign-in

```powershell
.\install-startup.ps1
```

This creates a shortcut in the current user's Startup folder. Run
`uninstall-startup.ps1` to remove it.

The monitor does not start Sourcream automatically. Use its tray menu to start the
production server. Server output is written to `tray/sourcream-server.log` and replaced
on each server start.
