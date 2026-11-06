const crypto = require('crypto');

// Argon2id only (OWASP minimum: 19 MiB, 2 passes, 1 lane). Params are stored
// in the PHC string, so they can be raised later without breaking old hashes.
const MEMORY_KIB = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;

const MAX_MEMORY_KIB = 1048576;
const MAX_PASSES = 10;
const MAX_PARALLELISM = 16;
const MIN_SALT_BYTES = 8;
const MIN_TAG_BYTES = 16;

const PREFIX = '$argon2id$v=19$';
const B64 = /^[A-Za-z0-9+/]+$/;

function derive(plain, salt, m, t, p, tagLength) {
  return crypto.argon2Sync('argon2id', {
    message: Buffer.from(plain, 'utf8'),
    nonce: salt,
    parallelism: p,
    tagLength,
    memory: m,
    passes: t
  });
}

function b64(buf) {
  return buf.toString('base64').replace(/=+$/, '');
}

function decodeB64(s) {
  if (typeof s !== 'string' || !B64.test(s) || s.length % 4 === 1) return null;
  return Buffer.from(s, 'base64');
}

function parseIntStrict(s, max) {
  if (!/^[0-9]{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= max ? n : null;
}

// Returns { m, t, p, salt, hash } or null when the string is not a usable
// Argon2id PHC hash.
function parse(phc) {
  if (typeof phc !== 'string' || !phc.startsWith(PREFIX)) return null;
  const parts = phc.slice(PREFIX.length).split('$');
  if (parts.length !== 3) return null;
  const params = parts[0].split(',');
  if (params.length !== 3) return null;
  const vals = {};
  for (const kv of params) {
    const x = /^([mtp])=([0-9]+)$/.exec(kv);
    if (!x || x[1] in vals) return null;
    vals[x[1]] = x[2];
  }
  const m = parseIntStrict(vals.m || '', MAX_MEMORY_KIB);
  const t = parseIntStrict(vals.t || '', MAX_PASSES);
  const p = parseIntStrict(vals.p || '', MAX_PARALLELISM);
  if (m === null || t === null || p === null || m < 8 * p) return null;
  const salt = decodeB64(parts[1]);
  const hash = decodeB64(parts[2]);
  if (!salt || salt.length < MIN_SALT_BYTES) return null;
  if (!hash || hash.length < MIN_TAG_BYTES) return null;
  return { m, t, p, salt, hash };
}

function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const tag = derive(plain, salt, MEMORY_KIB, PASSES, PARALLELISM, TAG_BYTES);
  return `${PREFIX}m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}$${b64(salt)}$${b64(tag)}`;
}

function verifyPassword(plain, phc) {
  try {
    if (typeof plain !== 'string') return false;
    const h = parse(phc);
    if (!h) return false;
    const got = derive(plain, h.salt, h.m, h.t, h.p, h.hash.length);
    return got.length === h.hash.length && crypto.timingSafeEqual(got, h.hash);
  } catch (e) {
    return false;
  }
}

function isSupportedHash(phc) {
  return parse(phc) !== null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  isSupportedHash,
  MEMORY_KIB,
  PASSES,
  PARALLELISM,
  SALT_BYTES,
  TAG_BYTES
};
