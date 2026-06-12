const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHARES_PATH = path.join(__dirname, '..', 'data', 'shares.json');
const DATA_DIR = path.dirname(SHARES_PATH);

function load() {
  if (!fs.existsSync(SHARES_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SHARES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading shares:', e);
    return {};
  }
}

function save(shares) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SHARES_PATH, JSON.stringify(shares, null, 2), 'utf-8');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function create(library, relPath, type, label, expiresAt = null) {
  const shares = load();
  const token = generateToken();
  shares[token] = {
    library,
    relPath,
    type,
    label,
    createdAt: new Date().toISOString(),
    expiresAt
  };
  save(shares);
  return { token, ...shares[token] };
}

function getShare(token) {
  const shares = load();
  const share = shares[token];

  if (!share) {
    return null;
  }

  if (share.expiresAt) {
    const expiresAt = new Date(share.expiresAt);
    if (expiresAt < new Date()) {
      delete shares[token];
      save(shares);
      return null;
    }
  }

  return share;
}

function deleteShare(token) {
  const shares = load();
  delete shares[token];
  save(shares);
}

function listShares() {
  const shares = load();
  const now = new Date();
  const active = {};

  for (const [token, share] of Object.entries(shares)) {
    if (share.expiresAt) {
      const expiresAt = new Date(share.expiresAt);
      if (expiresAt < now) {
        continue;
      }
    }
    active[token] = share;
  }

  return active;
}

function cleanup() {
  const shares = load();
  const now = new Date();
  let changed = false;

  for (const [token, share] of Object.entries(shares)) {
    if (share.expiresAt) {
      const expiresAt = new Date(share.expiresAt);
      if (expiresAt < now) {
        delete shares[token];
        changed = true;
      }
    }
  }

  if (changed) {
    save(shares);
  }
}

module.exports = {
  load,
  save,
  generateToken,
  create,
  getShare,
  deleteShare,
  listShares,
  cleanup
};
