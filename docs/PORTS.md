# Network ports

Sourcream uses one fixed application port, one local Cloudflare Tunnel monitoring port,
and Cloudflare's outbound transport port. The Tunnel does not require an inbound router
port forward.

## Port map

| Port | Direction and binding | Owner | Purpose |
| --- | --- | --- | --- |
| `25025/TCP` | Inbound on `0.0.0.0` | Sourcream (`node.exe`) | Serves the library, watch pages, API routes, artwork, subtitles, and video. The TV connects to the PC's LAN address on this port, and `cloudflared` uses it as the local origin. |
| `20241/TCP` | Inbound on `127.0.0.1` only | `cloudflared.exe` | Current Prometheus metrics and readiness endpoint. The tray monitor checks `/ready` here. This is not reachable from the LAN or Internet. |
| `20241-20245/TCP` | Loopback candidates | `cloudflared.exe` | Default metrics-port range. `cloudflared` selects the first available port; the current service is using `20241`. If the selected port changes, the tray checks the entire range. |
| `7844/UDP` or `7844/TCP` | Outbound | `cloudflared.exe` | Connects this PC to Cloudflare using QUIC over UDP or HTTP/2 over TCP. Both protocols should be allowed outbound so the Tunnel can select or fall back between them. |
| `443/TCP` | Public, terminated at Cloudflare's edge | Cloudflare | Browser-facing HTTPS. Port `443` does not terminate directly on this PC and is carried to Sourcream through the Tunnel. |

Windows also assigns temporary local source ports to the outbound Tunnel connections.
Those ephemeral ports change across service restarts and are not configuration or
firewall dependencies.

## Traffic flow

For a TV or another device on the private LAN:

```text
TV browser -> PC LAN IPv4:25025 -> Sourcream
```

For external HTTPS access:

```text
Browser -> Cloudflare:443 -> outbound Tunnel:7844 -> localhost:25025 -> Sourcream
```

The tray monitor opens no listening port. It only makes short loopback requests to
Sourcream on `25025` and to the Tunnel readiness endpoint on `20241-20245`.

## Firewall boundaries

- Allow inbound `25025/TCP` only where LAN playback requires it. The repository's run
  scripts bind Sourcream to `0.0.0.0` so the Samsung TV can connect.
- Allow outbound `7844/TCP` and `7844/UDP` for `cloudflared.exe`.
- Do not create router port forwards for `25025`, `20241-20245`, or `7844`.
- Keep the metrics endpoint bound to `127.0.0.1`; it is operational data for the local
  service and tray monitor.
- Public hostname, HTTPS, and access-control behavior are Cloudflare configuration. The
  Sourcream application itself does not add authentication.

Cloudflare documents the Tunnel transport requirements in
[Tunnel with firewall](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)
and the local metrics range in
[Tunnel observability](https://developers.cloudflare.com/tunnel/observability/).

## Verification

Check the local listeners in PowerShell:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -in 25025, 20241, 20242, 20243, 20244, 20245 |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Check readiness without downloading application or metrics content:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:25025/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:20241/ready
```

Healthy responses are `204 No Content` from Sourcream and `200 OK` from `cloudflared`.
