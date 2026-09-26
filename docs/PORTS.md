| Port | Direction and binding | Owner | Note |
| --- | --- | --- | --- |
| `10010/TCP` | Inbound on `0.0.0.0` | Sourcream production (`node.exe`) | Production playback and Tunnel origin. |
| `10023/TCP` | Inbound on `0.0.0.0` | Sourcream development (`node.exe`) | Development server. |
| `20241/TCP` | Inbound on `127.0.0.1` only | `cloudflared.exe` | Current metrics and readiness endpoint. |
| `20241-20245/TCP` | Loopback candidates | `cloudflared.exe` | Possible metrics ports; tray checks the range. |
| `7844/UDP` or `7844/TCP` | Outbound | `cloudflared.exe` | Tunnel transport via QUIC or HTTP/2. |
| `443/TCP` | Public, terminated at Cloudflare's edge | Cloudflare | Public HTTPS; Tunnel forwards to production. |
