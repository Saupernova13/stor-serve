# stor-serve

Personal file storage and sharing web app. Serves large files straight from
this PC — no cloud uploads — with a public storefront for anyone with the link
and a password-protected admin dashboard.

**Live at:** `https://storage.raavivi.co.za` (TLS terminates at Cloudflare; the
Node origin speaks plain HTTP)

## Two surfaces

| URL | Page | Audience |
|-----|------|----------|
| `/` | Public storefront (`public/index.html` + `public.js`) | Anyone — browses libraries marked **public**, downloads files, ZIPs folders |
| `/admin` | Admin dashboard (`public/admin.html` + `app.js`) | Password login — manage libraries, browse everything, create share links |

## Features

- **Multi-library** — named libraries pointing at any local folder, each with a
  stable URL-safe `id` and a **public/private** toggle
- **Public storefront** — public libraries are browsable/downloadable with no
  login; a default public drop folder is created on first run
- **ZIP downloads** — any folder streams as a ZIP on the fly (`archiver`, no
  temp files) via `?download=zip`
- **Share links** — 256-bit token links (`/s/:token/...`) for private files or
  folders, with optional expiry
- **Session auth** — bcrypt password (changeable from the admin UI), rate-limited
  login
- **No database** — `data/config.json` + `data/shares.json`
- **Path security** — all paths normalized and confined to their library root

## Dev / prod

| Instance | Tree | Port | Host | State |
|---|---|---|---|---|
| prod | `C:\prod\stor-serve` (git-free artifact dir) | 3444 | storage.raavivi.co.za | always on |
| dev | `C:\Users\RaaViVi\Documents\github\stor-serve` | 3445 | storage-dev.raavivi.co.za | **off by default** |

**The dev instance is on demand.** Its scheduled task (`stor-serve-dev`) has no trigger, so it never
starts by itself and costs nothing while idle. Start it for a testing session and stop it after:

```powershell
$rel = "C:\Users\RaaViVi\Documents\github\ecosystem-deploy\release.ps1"
powershell -File $rel stor-serve -Up      # starts dev, waits until it serves, prints the URL
powershell -File $rel stor-serve -Down    # shuts it down completely - always do this when done
```

`storage-dev.raavivi.co.za` stays in the Cloudflare tunnel permanently; a 502 there just means dev is
off, so spin it up rather than debugging the tunnel. A dev instance that is down is **not a fault**.

- Port comes from `PORT` (via `env.local.bat` per tree, `env.local.sh` on Linux; default 3444).
- Deploys are **artifact** deploys via `release.ps1 stor-serve` (ecosystem-deploy):
  the built product ships to prod, and prod's `data/` and 18 GB `shared/` are
  never touched. See `.ecosystem/deploy/deploy.md`.
- Prod is not a git checkout — do all code work in the dev tree.

## Quick start (dev)

```powershell
cd C:\Users\RaaViVi\Documents\github\stor-serve
npm install
npm start          # http://localhost:3444 (or PORT from env.local.bat)
```

First run auto-creates `data/config.json`, a session secret, the default
public drop folder, and the admin password `default` — change it from the
admin UI (`/admin` → password section).

`npm test` runs the unit tests (`node --test`, under `test/`): the path guard,
the owner-only writer and the download headers.

## Linux

The app is plain Node and runs unchanged; only the launchers differ. You need
Node.js (a current LTS) and, for the service, systemd.

```bash
cd ~/stor-serve
npm install
cp env.local.example.sh env.local.sh   # optional: set PORT (default 3444)
./start.sh                             # http://localhost:3444; Ctrl+C stops it
```

`start.sh` is the counterpart of `start.bat`: it sources `env.local.sh`
(gitignored, per tree, like `env.local.bat`) and runs `node server.js` in a
restart loop with a 5 s back-off. `node` is taken from `PATH`, then nvm, then
Volta; set `NODE_EXE` in `env.local.sh` for anything else.

**Start at login** with `setup-startup.sh`, the counterpart of
`setup-startup.ps1`. It installs a systemd *user* service (run it as your normal
user — it refuses to run as root) that runs `start.sh` with `SUPERVISED=1`, so
systemd does the restarting:

```bash
./setup-startup.sh --name stor-serve-prod --linger    # enable + start; --linger also starts it at boot
./setup-startup.sh --name stor-serve-dev --on-demand  # install only; never starts by itself
systemctl --user start stor-serve-dev                 # a dev testing session ...
systemctl --user stop stor-serve-dev                  # ... and always stop it after
journalctl --user -u stor-serve-prod -f               # server output
./setup-startup.sh --name stor-serve-prod --uninstall
```

`--print` shows the unit without installing it. Re-running is safe: an
unchanged unit is left alone and a changed one restarts a running instance.

**Where things live** — the same as on Windows, relative to the tree:
`data/config.json` (password hash, session secret), `data/shares.json` (share
tokens) and the default `shared/` drop folder. On unix the two data files are
created owner-only (`0600`), and a looser existing file is tightened the next
time it is written. The service user must be able to read the library folders;
a file it cannot read answers 403 and is left out of ZIPs. Library paths are absolute paths on the
server (e.g. `/srv/media`) and are case-sensitive.

## API

Public (no auth):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/libraries` | List public libraries |
| GET | `/api/public/browse/:lib[/*]` | Browse a public library; file paths download (`?inline=1` previews, `?download=zip` zips a folder) |
| GET | `/s/:token[/*]` | Browse/download via a share link |
| POST | `/api/auth/login` | Log in (sets session cookie) |
| GET | `/api/auth/status` | Session check |
| POST | `/api/auth/logout` | Log out (destroys own session) |

Session-authed (`/api` behind `requireAuth` except `/api/auth` and `/api/public`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/browse/libraries` | List all libraries (public + private) |
| GET | `/api/browse/:lib[/*]` | Browse/download any library |
| POST / GET / DELETE | `/api/shares[/:token]` | Create / list / revoke share links |
| POST | `/api/admin/libraries` | Add library `{name, path, public}` |
| DELETE | `/api/admin/libraries/:id` | Remove library (by id) |
| GET | `/api/admin/public-dir` | Default public drop folder path |
| POST | `/api/admin/password` | Change the admin password |

## Security posture

- **Helmet** with CSP; **HSTS off** and `upgradeInsecureRequests` disabled on
  purpose — the origin is plain HTTP (TLS at Cloudflare), so forcing HTTPS at
  the origin would break LAN/tailnet access.
- **Session cookie**: `httpOnly`, `sameSite: lax`, `secure: false` — same
  reason; a secure-only cookie would never be issued over the HTTP origin.
- **Rate limiting** on login and general requests; bcrypt (12 rounds) for the
  password; share tokens are 64-char hex.

## Project structure

```
server.js             Express entry point (helmet, session, rate limits, routers)
src/
  config.js           Config load/save, library ids, default public dir
  shares.js           Share token system
  libraries.js        Safe file system access
  download.js         File serving + streaming ZIP (archiver)
  middleware/         requireAuth, pathGuard
  routes/             auth, browse, public, shares, admin
public/
  index.html/public.js/public.css    Public storefront
  admin.html/app.js/style.css        Admin dashboard
  favicon.svg, icons/
data/                 config.json + shares.json (gitignored, auto-created)
test/                 node --test suites (npm test)
start.bat             Restart-loop launcher (sources env.local.bat)
start.sh              Linux launcher (sources env.local.sh)
setup-startup.sh      Linux systemd user-service installer
env.local.example.sh  Template for env.local.sh
```

## Cloudflare

```yaml
- hostname: storage.raavivi.co.za
  service: http://localhost:3444
- hostname: storage-dev.raavivi.co.za
  service: http://localhost:3445
```

After editing `config.yml`, deploy with
`C:\Users\RaaViVi\Documents\github\ecosystem-setup\scripts\deploy-tunnel-config.ps1`.

## Troubleshooting

- **Port in use**: `netstat -ano | findstr 3444` → `taskkill /PID <pid> /F`
  (Linux: `ss -ltnp | grep 3444` → `kill <pid>`)
- **Libraries missing**: verify the path in `data/config.json` exists and is readable
- **Share link 404**: token expired/revoked in `data/shares.json`, or the target moved
- **Tunnel down**: `sc.exe query cloudflared`; see `.ecosystem/cloudflare/cloudflare.md`

## License

MIT
