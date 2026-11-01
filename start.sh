#!/usr/bin/env bash
# Launch stor-serve (node server.js) from this script's own directory. Restarts
# the process five seconds after every exit, until it receives Ctrl+C / SIGTERM.
# This is the Linux counterpart of start.bat. The server logs to stdout/stderr;
# nothing is redirected to a file here.
#
# Two modes:
#   - SUPERVISED=1 (set by the systemd user unit that setup-startup.sh
#     installs): systemd does the restarting, so node is exec'd in place and
#     this script is gone from the process tree. Output lands in the journal:
#       journalctl --user -u <unit>
#   - Otherwise this script is the supervisor and restarts the server itself.
#
# Usage:  ./start.sh
# Override the node binary with NODE_EXE=/path/to/node.

set -u

# Resolve our own directory (following a symlinked launcher), so the script
# works from any checkout and from any working directory.
self="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
    self="$(readlink -f -- "$self" 2>/dev/null || printf '%s' "$self")"
fi
ROOT="$(cd -- "$(dirname -- "$self")" && pwd -P)" || exit 1
cd "$ROOT" || exit 1

# Per-tree environment (PORT, NODE_ENV). Gitignored; differs dev vs prod.
# Copy env.local.example.sh to start.
if [ -f "$ROOT/env.local.sh" ]; then
    set +u
    # shellcheck source=/dev/null
    . "$ROOT/env.local.sh"
    set -u
fi

ts() { date '+%Y-%m-%d %H:%M:%S'; }
die() {
    printf '%s\n' "$*" >&2
    exit 1
}

# Pick the node binary. A systemd user manager has a minimal PATH, so when node
# is not on it, pick up nvm's default (or Volta's) if installed in the usual place.
if [ -n "${NODE_EXE:-}" ]; then
    NODE="$NODE_EXE"
    [ -f "$NODE" ] && [ -x "$NODE" ] || die "NODE_EXE=$NODE is not an executable file; cannot start."
else
    if ! command -v node >/dev/null 2>&1; then
        if [ -s "${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh" ]; then
            set +u
            # shellcheck source=/dev/null
            . "${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh" >/dev/null 2>&1
            set -u
        fi
        if ! command -v node >/dev/null 2>&1 && [ -d "${HOME:-}/.volta/bin" ]; then
            PATH="$HOME/.volta/bin:$PATH"
        fi
    fi
    NODE="$(command -v node 2>/dev/null)" \
        || die "node not found on PATH; install Node.js or set NODE_EXE in env.local.sh."
fi

[ -d "$ROOT/node_modules" ] || die "node_modules is missing; run 'npm install' in $ROOT first."

if [ "${SUPERVISED:-}" = "1" ]; then
    exec "$NODE" server.js
fi

# Supervise loop. node runs in the background and is waited on so a Ctrl+C /
# SIGTERM to this script can be forwarded to it (a background job in a
# non-interactive shell ignores SIGINT, so the forward is the only way it stops).
child=""
stop() {
    trap '' INT TERM HUP
    if [ -n "$child" ]; then
        kill -TERM "$child" 2>/dev/null
        i=0
        while kill -0 "$child" 2>/dev/null && [ "$i" -lt 10 ]; do
            sleep 1
            i=$((i + 1))
        done
        kill -KILL "$child" 2>/dev/null
        wait "$child" 2>/dev/null
    fi
    printf '[%s] --- supervisor stopped ---\n' "$(ts)" >&2
    exit 0
}
trap stop INT TERM HUP

while true; do
    "$NODE" server.js &
    child=$!
    wait "$child"
    rc=$?
    child=""
    printf '[%s] --- stor-serve exited with code %s; restarting in 5s ---\n' "$(ts)" "$rc" >&2
    # Back off without blocking signal handling (a plain `sleep` would delay the trap).
    sleep 5 &
    child=$!
    wait "$child"
    child=""
done
