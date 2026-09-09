# LAN address and local DNS setup

Saved on 2026-09-09. These are instructions for later; no router, DNS, DHCP, firewall, or Windows service settings were changed during the investigation.

## Goal

Give the Sourcream PC a stable LAN address and let devices on the home network open:

```text
http://sourcream.home.arpa:3000
```

No domain purchase or static public IP is required. `home.arpa` is reserved for residential network names. DNS maps the name to an IP; removing `:3000` would require a separate web-server/reverse-proxy setup.

## Verified connection details

| Item | Observed value |
| --- | --- |
| Router | Huawei HG8145X6-10 |
| Router configuration variant | PLDT firmware (`PLDT2`) |
| Router administration | https://192.168.1.1 |
| Plain HTTP administration | Connection refused |
| PC hostname | DESKTOP-COR0VL6 |
| Active connection | Ethernet — Realtek Gaming 2.5GbE Family Controller |
| PC IPv4 address | 192.168.1.5 |
| Subnet mask | 255.255.255.0 |
| Default gateway and DHCP server | 192.168.1.1 |
| PC Ethernet MAC | D8:5E:D3:5B:79:E0 |
| Address assignment | DHCP enabled; observed lease approximately one day |
| Ethernet DNS servers | 192.168.1.1 and the router's IPv6 link-local address, fe80::1 |
| sourcream.home.arpa | Router returned “DNS name does not exist” |

The router model and PLDT variant came from its unauthenticated HTTPS login page. No login was attempted. The exact settings and permissions available to the user's PLDT account remain unverified. DHCP being enabled does not prove that a reservation is absent; check the router's reservation list before adding one.

Addresses and service state may change after this snapshot. Use `ipconfig /all` to recheck the active Ethernet adapter before configuring anything.

## Preferred approach: router reservation and local DNS

1. Open https://192.168.1.1 and log in using existing router credentials. A local certificate warning may appear. Confirm the address is the router before proceeding.
2. Look for **Advanced Configuration → LAN Configuration → DHCP Static IP Configuration**, or **DHCP Reservation / Address Reservation**. This menu is documented for related Huawei ONTs; PLDT may rename, hide, or restrict it.
3. Check for an existing reservation for the PC. Create or update the intended entry with:

   ```text
   MAC address: D8:5E:D3:5B:79:E0
   IP address:  192.168.1.5
   ```

   This is the wired Ethernet adapter. Switching the PC to Wi-Fi uses a different MAC and would need separate handling. Leave the router's own LAN address at 192.168.1.1.
4. Look for **Local DNS**, **Static DNS Records**, or **Hostname/Host Mapping**. Availability on this particular PLDT firmware has not been confirmed. If supported, add:

   ```text
   Record type: A
   Name:        sourcream.home.arpa
   Address:     192.168.1.5
   ```

   A field for upstream DNS servers does not create a local record. **DDNS** also serves a different purpose and is not the setting needed here.
5. Keep LAN clients using the router for DNS. Confirm the record resolves when querying the router over both advertised DNS paths; an IPv4 A record can also be returned by a DNS server reached over IPv6.
6. Reconnect the TV to the network if needed and open `http://sourcream.home.arpa:3000`.

If the local-record menu is missing or disabled, do not assume the router supports this method. Check the alternative below and whether LAN DHCP DNS settings are editable. No firmware changes or WAN changes are needed for the intended local name.

## Alternative: a dedicated local DNS server

AdGuard Home can provide the local record while the router continues assigning IP addresses. A separate always-on device avoids the existing Windows port conflict described below.

1. Install AdGuard Home using its official setup guide on the chosen host, and give that host its own stable LAN address. Keep the existing router as the DHCP server for this approach.
2. Ensure the DNS service is reachable from the LAN on port 53, including UDP and TCP, and configure upstream resolvers for ordinary internet names. Avoid a forwarding loop between AdGuard and the router.
3. In **Filters → DNS rewrites**, add:

   ```text
   Domain: sourcream.home.arpa
   Answer: 192.168.1.5
   ```

4. Test the record directly against the DNS host before changing the router's advertised DNS settings:

   ```powershell
   # Replace the placeholder with the DNS host's actual reserved IP.
   nslookup sourcream.home.arpa <DNS-host-IP>
   nslookup example.com <DNS-host-IP>
   ```

5. In the router's **LAN DHCP/DNS settings**, advertise the DNS host's IP to clients. Changing only a WAN upstream-DNS field may not accomplish this. If these settings are locked, network-wide deployment through the current router remains unresolved; per-device DNS configuration would be a limited workaround.
6. Handle IPv6 DNS advertisements as well. Clients should receive a resolver that knows the local record, either the dedicated server or a router relay configured to forward appropriately. Leaving the existing IPv6 resolver unchanged may cause inconsistent results.
7. Reconnect clients or renew their DHCP leases, then verify the default DNS lookup and the TV browser.

Do not add an unrelated public resolver as a secondary client DNS server: it will not know `sourcream.home.arpa`, and clients may query it even while the local resolver is available. A second local resolver with the same record is a suitable redundancy option.

Devices using custom DNS, encrypted DNS, VPN DNS, or an isolated guest network may bypass the intended setup. Local DNS works across Wi-Fi and Ethernet when they share the relevant LAN and resolver configuration.

## Findings affecting hosting DNS on this Windows PC

- **UDP 0.0.0.0:53 was already occupied by Internet Connection Sharing**, Windows service `SharedAccess`, hosted by `svchost.exe`. A DNS server on the PC would require investigating and resolving that binding conflict. The service was not stopped or reconfigured.
- **Sourcream uses TCP port 3000.** AdGuard Home's default first-run setup also uses port 3000, so its setup interface would need a different port if installed here.
- The PC has Hyper-V/WSL and other virtual adapters. Do not assume Internet Connection Sharing is unused or disable it without checking those dependencies.
- Household DNS hosted only on this PC would depend on the PC remaining awake and available, even when nobody is watching a movie.
- Tailscale is installed. The observed effective DNS rules covered Tailscale-related namespaces; no `home.arpa` rule was observed. Tailscale names alone do not provide a local name to every router-connected device, including the TV.

## Verification after setup

For the router-only approach:

```powershell
# Ask the router directly.
nslookup sourcream.home.arpa 192.168.1.1

# Then check the resolver Windows actually selects.
nslookup sourcream.home.arpa
```

Both should return `192.168.1.5`. For a dedicated DNS server, use its actual IP in the first command instead.

Then verify:

1. `http://192.168.1.5:3000` still works.
2. `http://sourcream.home.arpa:3000` works on the PC and TV.
3. Ordinary internet names still resolve.
4. After a PC restart or DHCP renewal, the PC still gets its reserved address.

Sourcream must be running, the movie drive connected, and the PC awake. DNS does not change application or firewall availability. The `:3000` suffix remains required with the current server configuration.

Before making changes, record the original reservation and DNS values. If a later DNS change breaks resolution, restore the original advertised DNS settings and reconnect affected clients.

## Remaining questions

- Does the PLDT login expose DHCP reservations?
- Does it expose custom local DNS records?
- If not, can its LAN DHCP DNS and IPv6 DNS advertisements be changed?
- If dedicated DNS is needed, which always-on host should run it?

The next step is to inspect those router menus after logging in. Exact click-by-click instructions depend on what this firmware and account expose.

## References

- [IETF RFC 8375: home.arpa](https://www.rfc-editor.org/info/rfc8375/)
- [Huawei HG8145v5 web guide — related model, DHCP reservation menu](https://www.telekom.mk/content/upatstva/Huawei%20HG8145v5%2C%20web%20page%20guide.pdf)
- [HG8145X6 guide from 3BB — different ISP firmware](https://www.3bb.co.th/supportcenter/uploads/manual_update/HuaweiFTTx/OptiXstarHG8145X6GPONTerminal.pdf)
- [AdGuard Home setup and router configuration](https://adguard-dns.io/kb/adguard-home/getting-started/)
- [AdGuard Home configuration and DNS rewrites](https://github.com/AdguardTeam/AdGuardHome/wiki/Configuration)
