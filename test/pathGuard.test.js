const { test } = require('node:test');
const assert = require('node:assert');
const pathGuard = require('../src/middleware/pathGuard');

// Run the middleware against fake req/res objects. Returns the status code it
// rejected with, or 'next' when it let the request through.
function run(params) {
  let outcome = 'next';
  const res = {
    status(code) {
      outcome = code;
      return this;
    },
    json() {
      return this;
    }
  };
  pathGuard({ params }, res, () => {});
  return outcome;
}

test('pathGuard lets a normal library and path through', () => {
  assert.strictEqual(run({ lib: 'abc123', path: 'movies/2024/film.mkv' }), 'next');
  assert.strictEqual(run({ lib: 'abc123' }), 'next');
});

test('pathGuard rejects a bad library name', () => {
  assert.strictEqual(run({}), 400);
  assert.strictEqual(run({ lib: '' }), 400);
  assert.strictEqual(run({ lib: '..' }), 400);
  assert.strictEqual(run({ lib: 'a/b' }), 400);
  assert.strictEqual(run({ lib: 'a\\b' }), 400);
});

test('pathGuard rejects traversal and doubled separators in the path', () => {
  assert.strictEqual(run({ lib: 'abc', path: '../etc/passwd' }), 400);
  assert.strictEqual(run({ lib: 'abc', path: 'a/../../b' }), 400);
  assert.strictEqual(run({ lib: 'abc', path: 'a//b' }), 400);
  assert.strictEqual(run({ lib: 'abc', path: 'a\\\\b' }), 400);
});
