#!/usr/bin/env bash
# Install (or update, or remove) the systemd USER service that starts stor-serve.
# The Linux counterpart of setup-startup.ps1.
#
# Run as the normal user that should own the service (NOT root, NOT sudo):
#   ./setup-startup.sh --name stor-serve-prod --linger
#   ./setup-startup.sh --name stor-serve-dev --on-demand
#   ./setup-startup.sh --name stor-serve-prod --uninstall
#   ./setup-startup.sh --print        # show the unit, install nothing
#
# Paths are derived from the script's own location, so it works from any
# checkout: install one unit per tree (e.g. stor-serve-dev in the dev checkout,
# stor-serve-prod in the prod one). The unit runs start.sh with SUPERVISED=1,
# which sources env.local.sh and execs `node server.js`; systemd does the
# restarting.
#
# It is a USER service on purpose, the counterpart of the Windows task running
# as the current user: the data/ and shared/ folders and the library folders
# are the user's own, and nothing here needs root. Consequences:
#   - A user service normally starts at your first login and stops at your last
#     logout. --linger (loginctl enable-linger) starts it at boot without a
#     login.
#   - A user manager has a minimal PATH, so start.sh looks for node itself
#     (PATH, then nvm, then Volta); set NODE_EXE in env.local.sh for anything else.
#   - --on-demand installs the unit but does not enable it: the counterpart of
#     the dev scheduled task with no trigger. It never starts by itself; start
#     it for a testing session and stop it afterwards:
#       systemctl --user start|stop <unit>

set -euo pipefail

NAME="stor-serve-prod"
ON_DEMAND=0
LINGER=0
UNINSTALL=0
PRINT=0

usage() {
    cat <<'EOF'
Usage: setup-startup.sh [options]

Install a systemd user service that runs stor-serve from this checkout.

Options:
  --name <unit>   unit name, without .service (default: stor-serve-prod). Use
                  one name per checkout, e.g. stor-serve-dev and stor-serve-prod.
  --on-demand     install the unit but do not enable it, so it never starts by
                  itself (the dev instance); start it with
                  `systemctl --user start <unit>`
  --linger        also run `loginctl enable-linger $USER`, so the service starts
                  at boot without a login (not with --on-demand)
  --uninstall     stop, disable and remove the unit (linger is left as it is)
  --print         print the unit file to stdout and exit; installs nothing
  -h, --help      show this help

Run as the normal user that should own the service, not as root.
EOF
}

ok() { printf '[OK] %s\n' "$*"; }
note() { printf '[NOTE] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fail() {
    printf '[FAIL] %s\n' "$*" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --name)
            [ $# -ge 2 ] || fail "--name needs a value"
            NAME="$2"
            shift 2
            ;;
        --name=*)
            NAME="${1#--name=}"
            shift
            ;;
        --on-demand)
            ON_DEMAND=1
            shift
            ;;
        --linger)
            LINGER=1
            shift
            ;;
        --uninstall)
            UNINSTALL=1
            shift
            ;;
        --print)
            PRINT=1
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            printf '[FAIL] unknown option: %s\n\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

NAME="${NAME%.service}"
if ! [[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    fail "invalid unit name '$NAME' (letters, digits, '_', '.', '-'; must start with a letter or digit)"
fi
if [ "$UNINSTALL" -eq 1 ] && [ "$PRINT" -eq 1 ]; then
    fail "--uninstall and --print cannot be combined"
fi
if [ "$UNINSTALL" -eq 1 ] && { [ "$ON_DEMAND" -eq 1 ] || [ "$LINGER" -eq 1 ]; }; then
    fail "--uninstall cannot be combined with --on-demand or --linger"
fi
if [ "$ON_DEMAND" -eq 1 ] && [ "$LINGER" -eq 1 ]; then
    fail "--on-demand and --linger cannot be combined: an on-demand unit never starts by itself, so there is nothing for linger to start at boot"
fi

# Resolve our own directory (following a symlinked script).
self="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
    self="$(readlink -f -- "$self" 2>/dev/null || printf '%s' "$self")"
fi
REPO="$(cd -- "$(dirname -- "$self")" && pwd -P)"
START="$REPO/start.sh"
UNIT="$NAME.service"
UNIT_DIR="${XDG_CONFIG_HOME:-${HOME:?HOME is not set}/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/$UNIT"

# systemd unit syntax: '%' starts a specifier everywhere, and '$' / quotes /
# backslashes are interpreted in Exec lines. Escape so odd checkout paths work.
escape_pct() { printf '%s' "${1//%/%%}"; }
exec_arg() {
    local p="$1"
    case "$p" in
        *[!A-Za-z0-9_./+:@,-]*)
            p="${p//\\/\\\\}"
            p="${p//\"/\\\"}"
            p="${p//%/%%}"
            p="${p//\$/\$\$}"
            printf '"%s"' "$p"
            ;;
        *) printf '%s' "$p" ;;
    esac
}

render_unit() {
    cat <<EOF
[Unit]
Description=stor-serve file storage ($(escape_pct "$REPO"))

[Service]
Type=simple
WorkingDirectory=$(escape_pct "$REPO")
Environment=SUPERVISED=1
ExecStart=$(exec_arg "$START")
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
}

if [ "$PRINT" -eq 1 ]; then
    render_unit
    exit 0
fi

if [ "$(id -u)" -eq 0 ]; then
    fail "do not run this as root. It installs a systemd USER service for the account that runs it; as root it would land in root's user manager and stor-serve would run as root with no login session. Run it as the normal user that should own the service, without sudo."
fi

command -v systemctl >/dev/null 2>&1 || fail "systemctl not found; this script needs systemd."
if ! systemctl --user show-environment >/dev/null 2>&1; then
    fail "cannot reach your systemd user manager. Log in with a full session (not a bare su/sudo shell), or enable lingering for this account first (as root: loginctl enable-linger $(id -un)) and retry."
fi

if [ "$UNINSTALL" -eq 1 ]; then
    if [ -f "$UNIT_PATH" ]; then
        systemctl --user disable --now "$UNIT" 2>/dev/null || true
        rm -f "$UNIT_PATH"
        systemctl --user daemon-reload
        systemctl --user reset-failed "$UNIT" 2>/dev/null || true
        ok "removed unit '$UNIT' ($UNIT_PATH)"
    else
        note "unit '$UNIT' is not installed ($UNIT_PATH does not exist); nothing to remove"
    fi
    note "linger is left as it was; to turn it off: loginctl disable-linger $(id -un)"
    exit 0
fi

[ -f "$START" ] || fail "start.sh not found next to this script."
[ -x "$START" ] || fail "start.sh is not executable. Fix with: chmod +x \"$START\""

[ -d "$REPO/node_modules" ] || warn "node_modules is missing. Run 'npm install' in $REPO first, or the service will fail to start."
if ! command -v node >/dev/null 2>&1 && ! grep -qs '^[[:space:]]*export[[:space:]]\{1,\}NODE_EXE=' "$REPO/env.local.sh"; then
    note "node is not on this shell's PATH; start.sh will look for nvm and Volta installs, otherwise set NODE_EXE in env.local.sh."
fi
[ -f "$REPO/env.local.sh" ] || note "no env.local.sh yet, so the server uses its defaults (port 3444). Copy env.local.example.sh to env.local.sh to set PORT."

echo "Installing systemd user service '$UNIT' for $REPO ..."

mkdir -p "$UNIT_DIR"
tmp="$(mktemp "$UNIT_DIR/.$UNIT.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
render_unit > "$tmp"
chmod 644 "$tmp"

changed=1
if [ -f "$UNIT_PATH" ] && cmp -s "$tmp" "$UNIT_PATH"; then
    changed=0
fi
if [ "$changed" -eq 1 ]; then
    mv -f "$tmp" "$UNIT_PATH"
    ok "wrote $UNIT_PATH"
else
    ok "$UNIT_PATH already up to date"
fi

was_active=0
if systemctl --user is-active --quiet "$UNIT"; then
    was_active=1
fi

systemctl --user daemon-reload

if [ "$ON_DEMAND" -eq 1 ]; then
    # Make sure it does not start by itself, but leave a running instance alone.
    systemctl --user disable "$UNIT" 2>/dev/null || true
    if [ "$was_active" -eq 1 ] && [ "$changed" -eq 1 ]; then
        systemctl --user restart "$UNIT"
        ok "unit '$UNIT' installed, not enabled; the running instance was restarted to pick up the new unit file"
    else
        ok "unit '$UNIT' installed, not enabled: it never starts by itself"
    fi
else
    systemctl --user enable --now "$UNIT"
    if [ "$was_active" -eq 1 ] && [ "$changed" -eq 1 ]; then
        systemctl --user restart "$UNIT"
        ok "unit '$UNIT' enabled; restarted to pick up the new unit file"
    else
        ok "unit '$UNIT' enabled and running"
    fi

    user="$(id -un)"
    if [ "$LINGER" -eq 1 ]; then
        command -v loginctl >/dev/null 2>&1 || fail "loginctl not found; cannot enable linger."
        loginctl enable-linger "$user"
        ok "linger enabled for $user (starts at boot, no login needed)"
    else
        linger_state="$(loginctl show-user "$user" --property=Linger --value 2>/dev/null || true)"
        if [ "$linger_state" != "yes" ]; then
            note "it will start at your first login and stop at your last logout. For boot without a login, re-run with --linger."
        fi
    fi

    echo
    echo "=== Verification ==="
    systemctl --user --no-pager --lines=5 status "$UNIT" || true
fi

echo
if [ "$ON_DEMAND" -eq 1 ]; then
    ok "stor-serve is on demand; start it for a testing session and stop it after:"
    echo "     systemctl --user start $UNIT"
    echo "     systemctl --user stop $UNIT"
else
    ok "stor-serve will start automatically; manage it with:"
    echo "     systemctl --user status|restart|stop $UNIT"
fi
echo "     journalctl --user -u $UNIT -f      (server output, exit status)"
echo "     $REPO/setup-startup.sh --name $NAME --uninstall"
