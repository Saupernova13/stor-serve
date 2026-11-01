const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isWindows = process.platform === 'win32';
const warned = new Set();

function warnOnce(key, message) {
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(message);
  }
}

// Some mounts (vfat, ntfs, certain bind mounts) refuse chmod. Saving the
// config matters more than the mode, so a refusal only warns, once per file.
function chmodBestEffort(filePath, fn) {
  try {
    fn();
  } catch (e) {
    warnOnce(filePath, `Could not restrict ${filePath} to owner-only: ${e.message}`);
  }
}

// rename can fail transiently on Windows (EPERM/EBUSY/EACCES) while an
// antivirus scan or a reader briefly holds the target; retry a few times.
function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const transient = isWindows && ['EPERM', 'EBUSY', 'EACCES'].includes(e.code);
      if (!transient || attempt >= 5) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
}

// Flush the directory entry so the rename itself survives a power loss. Not
// possible on Windows (a directory cannot be opened), and best effort elsewhere.
function fsyncDir(dir) {
  if (isWindows) return;
  let fd;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch (e) {
    // Some filesystems refuse fsync on a directory; the rename already happened.
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (e) { /* nothing to do */ }
    }
  }
}

// Write a file that holds secrets (the bcrypt hash and session secret in
// config.json, the share tokens in shares.json). The write is atomic: the new
// contents go to a temp file in the same directory (exclusive create, 0600 on
// unix), are fsynced, and the temp file is renamed over the target. A crash,
// power loss or ENOSPC at any point leaves the old file whole, instead of the
// empty or partial file an in-place truncate-and-write would leave (which
// config.load() reads as "no config" and resets the admin password).
//
// Because the temp file is created fresh, the result is 0600 even when the
// file it replaces was looser (fs `mode` only applies at creation). The rename
// swaps the directory entry, so a symlink at the target is replaced rather than
// followed, and a reader still holding a handle on the old file keeps the old
// contents. Windows has no unix modes, so it skips the chmod and the directory
// fsync, but the temp-file-and-rename write is the same.
function writeSecretFile(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);

  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    if (!isWindows) {
      // The creation mode is cut by the umask; make sure it is exactly 0600.
      chmodBestEffort(filePath, () => fs.fchmodSync(fd, 0o600));
    }
    fs.writeFileSync(fd, data, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    renameWithRetry(tmp, filePath);
  } catch (e) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (closeErr) { /* keep the original error */ }
    }
    try { fs.unlinkSync(tmp); } catch (unlinkErr) { /* never created, or already gone */ }
    throw e;
  }

  fsyncDir(dir);
}

// Tighten an existing secrets file to 0600 if it is looser, so an install
// upgraded from the old writer (which left 0644) is not exposed until its next
// write. Does nothing on Windows or when the file does not exist yet.
function tightenSecretFile(filePath) {
  if (isWindows) return;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return;
  }
  if (stat.isFile() && (stat.mode & 0o077) !== 0) {
    chmodBestEffort(filePath, () => fs.chmodSync(filePath, 0o600));
  }
}

module.exports = { writeSecretFile, tightenSecretFile };
