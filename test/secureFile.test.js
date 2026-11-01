const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeSecretFile } = require('../src/secureFile');

const isWindows = process.platform === 'win32';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stor-serve-secure-'));
}

function mode(file) {
  return fs.statSync(file).mode & 0o777;
}

test('writes the given contents', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'config.json');
    writeSecretFile(file, '{"a":1}');
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), '{"a":1}');
    writeSecretFile(file, '{"b":2}');
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), '{"b":2}');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('creates the file owner-only (0600) on unix', { skip: isWindows }, () => {
  const dir = tmpDir();
  const oldUmask = process.umask(0o000);
  try {
    const file = path.join(dir, 'shares.json');
    writeSecretFile(file, '{}');
    assert.strictEqual(mode(file), 0o600);
  } finally {
    process.umask(oldUmask);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tightens an existing looser file on the next write', { skip: isWindows }, () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, 'old');
    fs.chmodSync(file, 0o644);
    assert.strictEqual(mode(file), 0o644);

    writeSecretFile(file, 'new');

    assert.strictEqual(mode(file), 0o600);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), 'new');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
