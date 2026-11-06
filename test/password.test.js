const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const pw = require('../src/password');

const b64 = (b) => b.toString('base64').replace(/=+$/, '');

function build(algo, plain, m, t, p, salt = crypto.randomBytes(16)) {
  const tag = crypto.argon2Sync(algo, {
    message: Buffer.from(plain), nonce: salt, parallelism: p, tagLength: 32, memory: m, passes: t
  });
  return `$${algo}$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(tag)}`;
}

test('round trip with expected prefix', () => {
  const h = pw.hashPassword('hunter22');
  assert.ok(h.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'));
  assert.strictEqual(pw.verifyPassword('hunter22', h), true);
  assert.strictEqual(pw.isSupportedHash(h), true);
});

test('wrong password is false', () => {
  assert.strictEqual(pw.verifyPassword('nope', pw.hashPassword('hunter22')), false);
});

test('salt makes two hashes differ', () => {
  assert.notStrictEqual(pw.hashPassword('same'), pw.hashPassword('same'));
});

test('hashPassword rejects empty input', () => {
  assert.throws(() => pw.hashPassword(''));
  assert.throws(() => pw.hashPassword(undefined));
});

test('bcrypt hash does not verify', () => {
  const bc = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW';
  assert.strictEqual(pw.verifyPassword('U*U', bc), false);
  assert.strictEqual(pw.isSupportedHash(bc), false);
});

test('argon2i and argon2d hashes do not verify', () => {
  for (const algo of ['argon2i', 'argon2d']) {
    const h = build(algo, 'secret', 8192, 2, 1);
    assert.strictEqual(pw.verifyPassword('secret', h), false);
    assert.strictEqual(pw.isSupportedHash(h), false);
  }
});

test('malformed strings are false and never throw', () => {
  const good = build('argon2id', 'x', 8192, 2, 1);
  const [, , , , salt, hash] = good.split('$');
  const bad = [
    '', '$argon2id$v=19$', '$argon2id$v=19$m=8192,t=2,p=1$' + salt,
    `$argon2id$v=19$m=8192,t=2$${salt}$${hash}`,
    `$argon2id$v=19$m=abc,t=2,p=1$${salt}$${hash}`,
    `$argon2id$v=19$m=99999999,t=2,p=1$${salt}$${hash}`,
    `$argon2id$v=19$m=8192,t=2,p=0$${salt}$${hash}`,
    `$argon2id$v=19$m=8192,t=99,p=1$${salt}$${hash}`,
    `$argon2id$v=19$m=8192,t=2,p=99$${salt}$${hash}`,
    `$argon2id$v=19$m=8192,t=2,p=1$!!!!$${hash}`,
    `$argon2id$v=19$m=8192,t=2,p=1$${salt}$!!!!`,
    `$argon2id$v=19$m=8192,t=2,p=1$AAAA$${hash}`,
    `$argon2id$v=19$m=8192,t=2,p=1$${salt}$AAAA`,
    `$argon2id$v=19$m=8192,t=2,p=1$${salt}$${hash}$extra`,
    'junk'
  ];
  for (const b of bad) {
    assert.strictEqual(pw.verifyPassword('x', b), false, b);
    assert.strictEqual(pw.isSupportedHash(b), false, b);
  }
});

test('non-string inputs are false', () => {
  const h = pw.hashPassword('x');
  for (const v of [null, undefined, 42, {}, [], Buffer.from('x')]) {
    assert.strictEqual(pw.verifyPassword(v, h), false);
    assert.strictEqual(pw.verifyPassword('x', v), false);
    assert.strictEqual(pw.isSupportedHash(v), false);
  }
});

test('params are read from the string', () => {
  const h = build('argon2id', 'custom', 8192, 3, 1);
  assert.strictEqual(pw.verifyPassword('custom', h), true);
  assert.strictEqual(pw.verifyPassword('other', h), false);
});

function runCli(cfgPath, opts) {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'set-password.js')], {
    encoding: 'utf8',
    env: { ...process.env, STOR_SERVE_CONFIG_PATH: cfgPath, ...(opts.env || {}) },
    input: opts.input
  });
}

test('set-password CLI writes a verifying hash and prints no secrets', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stor-pw-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfgPath = path.join(dir, 'config.json');

  const r = runCli(cfgPath, { input: 'brand-new-pass\r\n' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'passwordHash updated');
  assert.ok(!r.stdout.includes('brand-new-pass') && !r.stdout.includes('argon2id'));
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.strictEqual(pw.verifyPassword('brand-new-pass', cfg.passwordHash), true);

  const r2 = runCli(cfgPath, { env: { STOR_SERVE_NEW_PASSWORD: 'via-env-pass' }, input: '' });
  assert.strictEqual(r2.status, 0, r2.stderr);
  const cfg2 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.strictEqual(pw.verifyPassword('via-env-pass', cfg2.passwordHash), true);
  assert.ok(cfg2.settings.sessionSecret, 'existing settings preserved');
});

test('set-password CLI rejects short or empty passwords', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stor-pw-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfgPath = path.join(dir, 'config.json');

  for (const input of ['', '\n', 'abc\n']) {
    assert.strictEqual(runCli(cfgPath, { input }).status, 1);
  }
  assert.ok(!fs.existsSync(cfgPath));
});
