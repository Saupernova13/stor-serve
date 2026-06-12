# Cloudflare Tunnel Setup

stor-serve is exposed via Cloudflare Tunnel to `https://storage.raavivi.co.za`

## Configuration

The tunnel entry was added to `C:\Users\RaaViVi\.cloudflared\config.yml`:

```yaml
- hostname: storage.raavivi.co.za
  service: http://localhost:3444
```

## Deployment

After initializing this project, the tunnel was configured with:

```powershell
# Register the DNS record
cloudflared tunnel route dns aafaca80-4139-4b36-bb3f-b81e382d98f8 storage.raavivi.co.za

# Deploy the updated config to Windows system profile
C:\Users\RaaViVi\.ecosystem\cloudflare\deploy-tunnel-config.ps1
```

## Accessing

- **Locally:** `http://localhost:3444`
- **Remotely:** `https://storage.raavivi.co.za`

The Cloudflare tunnel runs as a Windows service named `Cloudflared` and handles:
- HTTPS termination at the Cloudflare edge
- Tunneling traffic through your ISP's CGNAT
- DNS routing to your PC via the tunnel

## Troubleshooting

**Storage domain not resolving:**

Check that `storage.raavivi.co.za` is in the Cloudflare DNS records and the tunnel config.

**Port 3444 not responding through tunnel:**

Verify the local server is running: `curl http://localhost:3444`

**Connection refused:**

Check the Cloudflared service is running:

```powershell
Get-Service Cloudflared | Select-Object Status
```

If not running, restart it:

```powershell
Restart-Service Cloudflared
```
