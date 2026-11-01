const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const libraries = require('../src/libraries');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stor-serve-lib-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('resolveLibraryPath: the root and paths beneath it resolve', () => {
  const dir = tmpDir();
  try {
    const root = path.resolve(dir);
    assert.strictEqual(libraries.resolveLibraryPath(dir, ''), root);
    assert.strictEqual(libraries.resolveLibraryPath(dir, undefined), root);
    assert.strictEqual(libraries.resolveLibraryPath(dir, 'a/b.txt'), path.join(root, 'a', 'b.txt'));
    assert.strictEqual(libraries.resolveLibraryPath(dir, 'a/../b.txt'), path.join(root, 'b.txt'));
  } finally {
    cleanup(dir);
  }
});

test('resolveLibraryPath: traversal out of the root is refused', () => {
  const dir = tmpDir();
  try {
    assert.strictEqual(libraries.resolveLibraryPath(dir, '..'), null);
    assert.strictEqual(libraries.resolveLibraryPath(dir, '../x'), null);
    assert.strictEqual(libraries.resolveLibraryPath(dir, 'a/../../x'), null);
    assert.strictEqual(libraries.resolveLibraryPath(dir, '../../../../../../etc/passwd'), null);
    // An absolute relPath must not replace the root.
    assert.strictEqual(libraries.resolveLibraryPath(dir, path.resolve(os.tmpdir())), null);
    assert.strictEqual(libraries.resolveLibraryPath(dir, '/etc/passwd'), null);
  } finally {
    cleanup(dir);
  }
});

test('resolveLibraryPath: a sibling that shares the root as a name prefix is refused', () => {
  const dir = tmpDir();
  const sibling = dir + '-evil';
  try {
    fs.mkdirSync(sibling);
    assert.strictEqual(libraries.resolveLibraryPath(dir, '../' + path.basename(sibling)), null);
    assert.strictEqual(libraries.resolveLibraryPath(dir, '../' + path.basename(sibling) + '/secret'), null);
  } finally {
    cleanup(dir);
    cleanup(sibling);
  }
});

test('resolveLibraryPath: a different-case spelling of the root is not the root', () => {
  // The check is a plain string comparison against the configured root, so on
  // a case-sensitive filesystem a differently-cased sibling stays outside.
  const dir = tmpDir();
  try {
    const upper = path.join(path.dirname(dir), path.basename(dir).toUpperCase());
    assert.strictEqual(libraries.resolveLibraryPath(dir, '../' + path.basename(upper) + '/x'), null);
  } finally {
    cleanup(dir);
  }
});

test('resolveLibraryPath: a filesystem root as library root still serves its children', () => {
  const fsRoot = path.parse(process.cwd()).root;
  assert.strictEqual(libraries.resolveLibraryPath(fsRoot, ''), fsRoot);
  assert.strictEqual(libraries.resolveLibraryPath(fsRoot, 'some-dir'), path.join(fsRoot, 'some-dir'));
  // Climbing above the root just lands on the root: still inside it.
  assert.strictEqual(libraries.resolveLibraryPath(fsRoot, '../x'), path.join(fsRoot, 'x'));
});

test('getFileInfo / readFile / listDirectory refuse an escaping path', () => {
  const dir = tmpDir();
  const outside = dir + '-outside';
  try {
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope');
    const rel = '../' + path.basename(outside);
    assert.strictEqual(libraries.getFileInfo(dir, rel), null);
    assert.strictEqual(libraries.readFile(dir, rel + '/secret.txt'), null);
    assert.strictEqual(libraries.listDirectory(dir, rel), null);
  } finally {
    cleanup(dir);
    cleanup(outside);
  }
});

test('a NUL byte in the path does not throw and finds nothing', () => {
  const dir = tmpDir();
  try {
    assert.strictEqual(libraries.getFileInfo(dir, 'a\0b'), null);
    assert.strictEqual(libraries.readFile(dir, 'a\0b'), null);
    assert.strictEqual(libraries.listDirectory(dir, 'a\0b'), null);
  } finally {
    cleanup(dir);
  }
});

test('listDirectory: sorts folders first, reports sizes and previewability', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'zdir'));
    fs.writeFileSync(path.join(dir, 'b.txt'), 'hello');
    fs.writeFileSync(path.join(dir, 'a.bin'), 'x');
    const items = libraries.listDirectory(dir, '');
    assert.deepStrictEqual(items.map(i => [i.name, i.type]), [
      ['zdir', 'directory'],
      ['a.bin', 'file'],
      ['b.txt', 'file']
    ]);
    const txt = items.find(i => i.name === 'b.txt');
    assert.strictEqual(txt.size, 5);
    assert.strictEqual(txt.previewable, true);
    assert.strictEqual(items.find(i => i.name === 'a.bin').previewable, false);
    assert.strictEqual(items.find(i => i.name === 'zdir').size, null);
  } finally {
    cleanup(dir);
  }
});

// Symlinks need privileges on Windows, so these skip themselves when the OS
// refuses to make one.
function trySymlink(target, linkPath, type) {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch (e) {
    return false;
  }
}

test('listDirectory: a dangling symlink is skipped, not fatal', (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'real.txt'), 'x');
    if (!trySymlink(path.join(dir, 'gone'), path.join(dir, 'dangling'))) {
      return t.skip('cannot create symlinks here');
    }
    const items = libraries.listDirectory(dir, '');
    assert.deepStrictEqual(items.map(i => i.name), ['real.txt']);
  } finally {
    cleanup(dir);
  }
});

test('listDirectory: symlinks to files and folders list with their target type', (t) => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'realdir'));
    fs.writeFileSync(path.join(dir, 'real.txt'), 'abc');
    if (!trySymlink(path.join(dir, 'real.txt'), path.join(dir, 'filelink'))
      || !trySymlink(path.join(dir, 'realdir'), path.join(dir, 'dirlink'), 'dir')) {
      return t.skip('cannot create symlinks here');
    }
    const items = libraries.listDirectory(dir, '');
    const dirlink = items.find(i => i.name === 'dirlink');
    const filelink = items.find(i => i.name === 'filelink');
    assert.strictEqual(dirlink.type, 'directory');
    assert.strictEqual(dirlink.size, null);
    assert.strictEqual(filelink.type, 'file');
    assert.strictEqual(filelink.size, 3);
  } finally {
    cleanup(dir);
  }
});

test('listDirectory: an unreadable folder returns null instead of throwing', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    return t.skip('permission bits are not enforced here (windows, or running as root)');
  }
  const dir = tmpDir();
  const locked = path.join(dir, 'locked');
  try {
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o000);
    assert.strictEqual(libraries.listDirectory(dir, 'locked'), null);
  } finally {
    fs.chmodSync(locked, 0o755);
    cleanup(dir);
  }
});
