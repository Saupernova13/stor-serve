# Per-tree environment for stor-serve on Linux: the counterpart of env.local.bat.
# Copy this file to env.local.sh (gitignored) and edit it; start.sh sources it
# before launching the server. It differs per tree, e.g. prod 3444, dev 3445.

# TCP port the server listens on (default 3444).
export PORT=3444

export NODE_ENV=production

# Only needed when node is not on PATH (a systemd user service has a minimal
# PATH, and start.sh already looks for nvm and Volta installs by itself).
# export NODE_EXE=/usr/local/bin/node
