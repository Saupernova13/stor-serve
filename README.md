# stor-serve

Professional file storage and sharing web app. Serve large files from your PC without uploading to cloud providers. Share files via public links that expire optionally.

**Live at:** `https://storage.raavivi.co.za`

## Features

- **Browser-based file browsing** — navigate your local file system through an intuitive web UI
- **Multi-library support** — organize files into named libraries (e.g., Movies, Games, Documents)
- **Share links** — generate token-based public links for any file or folder
- **Optional expiry** — shares can expire on a specified date
- **Session auth** — password-protected admin panel
- **Responsive design** — works on desktop and mobile
- **No database** — lightweight JSON-based config and token storage
- **Path security** — automatic protection against directory traversal attacks
- **Rate limiting** — built-in login and general request rate limiting

## Quick Start

### Prerequisites

- Node.js 16+

### Installation

```bash
cd C:\utils\stor-serve
npm install
```

### Running

#### Development

```bash
npm start
```

Server will start on `http://localhost:3444`

#### Windows Startup (Automatic)

Run as Administrator once:

```powershell
cd C:\utils\stor-serve
.\setup-startup.ps1
```

Service will then start automatically on next logon.

### First Run

1. Navigate to `http://localhost:3444`
2. Log in with password: `default`
3. Go to **Libraries** tab
4. Add your first library (name + full folder path)
5. Click Browse and navigate files
6. Share files by clicking the 🔗 icon on any file/folder

## Configuration

All configuration is stored in `data/config.json` and `data/shares.json`. Edit via the web UI.

**config.json** structure:
```json
{
  "passwordHash": "bcrypt hash of password",
  "libraries": [
    { "name": "Movies", "path": "D:\\Movies" }
  ],
  "settings": {
    "sessionSecret": "random 64-char hex",
    "maxSharesPerToken": 1000
  }
}
```

## Project Structure

```
src/
  config.js           - Configuration loader/saver
  shares.js           - Share token system
  libraries.js        - Safe file system access
  middleware/
    requireAuth.js    - Session auth middleware
    pathGuard.js      - Path validation middleware
  routes/
    auth.js           - Login/logout endpoints
    browse.js         - File browsing endpoints
    shares.js         - Share link endpoints (public + private)
    admin.js          - Library management endpoints
public/
  index.html          - SPA shell
  app.js              - Vanilla JS client-side app
  style.css           - Responsive CSS (mobile-first, dark theme)
data/
  config.json         - Libraries and password hash (auto-created)
  shares.json         - Active share tokens (auto-created)
server.js             - Express app entry point
package.json          - Dependencies
start.bat             - Windows restart-loop launcher
setup-startup.ps1     - Scheduled task installer
```

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Log in (sets session cookie) |
| POST | `/api/auth/logout` | Session | Log out |
| GET | `/api/libraries` | Session | List all libraries |
| GET | `/api/browse/:lib/:path*` | Session | Browse/download authenticated |
| POST | `/api/shares` | Session | Create share link |
| GET | `/api/shares` | Session | List active shares |
| DELETE | `/api/shares/:token` | Session | Revoke share link |
| GET | `/s/:token/:path*` | Public | Browse/download via share |
| POST | `/api/admin/libraries` | Session | Add library |
| DELETE | `/api/admin/libraries/:name` | Session | Remove library |

## Security

- **Helmet.js** — CSP, HSTS, X-Frame-Options, etc.
- **Path validation** — all paths normalized and verified to stay within library root
- **Rate limiting** — 10 login attempts/15 min; 500 general requests/15 min
- **Session cookies** — `httpOnly`, `secure` (production), `sameSite: strict`
- **Share tokens** — 256-bit random (64-char hex)
- **Password hashing** — bcryptjs with salt rounds 12

## Cloud Deployment

Exposed via Cloudflare Tunnel to `https://storage.raavivi.co.za`

Tunnel config in `C:\Users\RaaViVi\.cloudflared\config.yml`:

```yaml
- hostname: storage.raavivi.co.za
  service: http://localhost:3444
```

After editing, deploy with:

```powershell
C:\Users\RaaViVi\.ecosystem\cloudflare\deploy-tunnel-config.ps1
```

## Troubleshooting

**Port 3444 already in use:**

```powershell
netstat -ano | findstr 3444
taskkill /PID <PID> /F
```

**App won't start:**

- Check Node.js is installed: `node --version`
- Check npm packages: `npm install` (in project root)
- Check logs in PowerShell window where you ran `npm start`

**Can't access libraries:**

- Verify folder path exists and is readable by your user
- Check path in `data/config.json` matches exactly

**Share links 404:**

- Check share token in `data/shares.json`
- Verify shared folder/file still exists
- Check if token has expired

## Development

### Code Style

- Vanilla JavaScript (no build step, no frameworks)
- Modular structure — each concern in its own file
- No comments except for non-obvious logic

### Adding a Route

1. Create a new file in `src/routes/`
2. Use `router.get/post/delete` from Express
3. Apply `requireAuth` middleware if needed
4. Mount in `server.js` with `app.use()`

### Testing API Locally

```bash
curl -X POST http://localhost:3444/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"default"}'

curl -X GET http://localhost:3444/api/libraries
```

## License

MIT

## Contributing

Contributions welcome. Please:

1. Create a branch
2. Make focused changes
3. Test locally
4. Commit with conventional messages (`feat:`, `fix:`, `docs:`, etc.)
5. Open a pull request

## Support

For issues or questions:

- Check logs in the PowerShell window running `node server.js`
- Review `data/config.json` and `data/shares.json`
- Verify Cloudflare tunnel is running: `cloudflared.exe` process should be active
