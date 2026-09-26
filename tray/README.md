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

The tooltip shows the private LAN IPv4 URL and the menu shows its IP and port.
Use **Copy LAN URL** to paste it into a TV or another device on the same network. The
address is checked at startup and whenever you open the tray menu. If no suitable
address is available, the menu shows that the IP is unavailable.

The monitor manages the production server on port `10010` and checks for its build in
`.next-prod`. Development on port `10023` is independent. Rebuild the monitor after changing
its source so the installed executable uses the new port.

The tray mark is a white IBM Plex Mono `S` inside a status circle:

- Green: Sourcream and the tunnel are ready.
- Amber: an action is in progress.
- Gray: Sourcream is paused and the tunnel is ready.
- Red: the Cloudflare Tunnel is not ready.

The production `.ico` files are generated from the SVG masters under `tray/assets` and are
copied beside the executable during `make build:tray`. IBM Plex Mono is bundled under the
SIL Open Font License in `tray/assets/fonts/OFL.txt`.
