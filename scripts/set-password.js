// Set the admin password. Reads it from STOR_SERVE_NEW_PASSWORD, else stdin.
// Never from argv (it would leak into process listings and shell history).
const fs = require('fs');
const config = require('../src/config');

const MIN_LENGTH = 4;

function readPassword() {
  if (process.env.STOR_SERVE_NEW_PASSWORD !== undefined) {
    return process.env.STOR_SERVE_NEW_PASSWORD;
  }
  return fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
}

let plain;
try {
  plain = readPassword();
} catch (e) {
  console.error('could not read the new password');
  process.exit(1);
}

if (!plain || plain.length < MIN_LENGTH) {
  console.error(`password must be at least ${MIN_LENGTH} characters`);
  process.exit(1);
}

const cfg = config.load();
if (!cfg) {
  config.create(plain);
} else {
  config.setPassword(cfg, plain);
}
console.log('passwordHash updated');
