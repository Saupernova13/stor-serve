const fs = require('fs');

const warned = new Set();

// Write a file that holds secrets (the bcrypt hash and session secret in
// config.json, the share tokens in shares.json). On unix it is created 0600,
// and an existing looser file is tightened to 0600 before the new contents are
// written into it: the fs `mode` option only applies at creation, so a file
// made earlier under a looser umask would otherwise stay readable by others.
// Windows has no unix modes, so it is a plain write there.
function writeSecretFile(filePath, data) {
  if (process.platform === 'win32') {
    fs.writeFileSync(filePath, data, 'utf-8');
    return;
  }

  const fd = fs.openSync(filePath, 'w', 0o600);
  try {
    try {
      fs.fchmodSync(fd, 0o600);
    } catch (e) {
      // Some mounts (vfat, ntfs, certain bind mounts) refuse chmod. Saving the
      // config matters more than the mode, so warn once and carry on.
      if (!warned.has(filePath)) {
        warned.add(filePath);
        console.warn(`Could not restrict ${filePath} to owner-only: ${e.message}`);
      }
    }
    fs.writeFileSync(fd, data, 'utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { writeSecretFile };
