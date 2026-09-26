# Setup

Run these commands from the repository root on Windows.

## Frontend

**Dependencies:** Node.js 22 or 24, npm, and GNU Make. FFmpeg and FFprobe are installed through npm; separate binaries are only needed if you set `FFMPEG_PATH` or `FFPROBE_PATH` in `.env`.

**Setup:**

```powershell
make install
```

Edit `.env` if your movies are not under the default `D:/Movies`, then run `make start`. The site is available at `http://localhost:10010`.

## Cloudflared

- **Dependencies:** A Cloudflare account and domain, plus [cloudflared for Windows](https://developers.cloudflare.com/tunnel/downloads/).
- **Tunnel:** Create one in the [Cloudflare dashboard](https://developers.cloudflare.com/tunnel/get-started/).
- **Route:** Point a published application hostname to `http://localhost:10010`.
- **Service:** In an elevated terminal, run `cloudflared.exe service install YOUR_TUNNEL_TOKEN`. Replace the placeholder with the dashboard token and keep it out of this repository. The tray monitors this service and its local readiness endpoint.
- **Access:** Configure access controls for the public hostname; Sourcream has no built-in authentication.
- **Video:** This public hostname sends movie streams through Cloudflare. On Free, Pro, and Business plans, [Cloudflare requires a specific paid service](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/) for video delivery. [Private network routes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/) are exempt.

## Tray

**Dependencies:** Windows PowerShell and GNU Make. The dependency command installs a minimal Rust toolchain if Cargo is missing.

**Setup:**

```powershell
make install:tray
make build:tray
```

The build installs and launches the tray monitor and adds it to the current user's Startup. It tracks Sourcream and Cloudflared status; it does not start the Sourcream server automatically.
