const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeSecretFile, tightenSecretFile } = require('../src/secureFile');

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

test('leaves no temp file behind after a successful write', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'shares.json');
    writeSecretFile(file, '{}');
    writeSecretFile(file, '{"x":1}');
    assert.deepStrictEqual(fs.readdirSync(dir), ['shares.json']);
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

test('a failure between the write and the rename leaves the old file intact', (t) => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, 'OLD CONTENTS');

    const rename = t.mock.method(fs, 'renameSync', () => {
      throw Object.assign(new Error('simulated crash before rename'), { code: 'EIO' });
    });
    assert.throws(() => writeSecretFile(file, 'NEW CONTENTS'), /simulated crash/);
    assert.strictEqual(rename.mock.callCount() > 0, true);
    rename.mock.restore();

    assert.strictEqual(fs.readFileSync(file, 'utf-8'), 'OLD CONTENTS');
    // The temp file is cleaned up, not left holding secrets.
    assert.deepStrictEqual(fs.readdirSync(dir), ['config.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failure while writing (ENOSPC) leaves the old file intact', (t) => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'shares.json');
    fs.writeFileSync(file, '{"keep":"me"}');

    const write = t.mock.method(fs, 'writeFileSync', () => {
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    });
    assert.throws(() => writeSecretFile(file, '{"new":true}'), /no space left/);
    write.mock.restore();

    assert.strictEqual(fs.readFileSync(file, 'utf-8'), '{"keep":"me"}');
    assert.deepStrictEqual(fs.readdirSync(dir), ['shares.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('replaces a symlink at the target instead of writing through it', { skip: isWindows }, () => {
  const dir = tmpDir();
  try {
    const real = path.join(dir, 'real.json');
    const link = path.join(dir, 'config.json');
    fs.writeFileSync(real, 'REAL');
    fs.symlinkSync(real, link);

    writeSecretFile(link, 'NEW');

    assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), false);
    assert.strictEqual(fs.readFileSync(link, 'utf-8'), 'NEW');
    assert.strictEqual(fs.readFileSync(real, 'utf-8'), 'REAL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tightenSecretFile: a looser existing file goes to 0600, content untouched', { skip: isWindows }, () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, 'keep');
    fs.chmodSync(file, 0o644);

    tightenSecretFile(file);

    assert.strictEqual(mode(file), 0o600);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), 'keep');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tightenSecretFile: a missing file is a no-op', () => {
  const dir = tmpDir();
  try {
    assert.doesNotThrow(() => tightenSecretFile(path.join(dir, 'absent.json')));
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
