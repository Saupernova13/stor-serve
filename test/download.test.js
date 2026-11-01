const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const libraries = require('../src/libraries');
const { serveFile, contentDisposition } = require('../src/download');

test('contentDisposition: plain ASCII names pass through', () => {
  assert.strictEqual(
    contentDisposition('attachment', 'report.pdf'),
    "attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf"
  );
});

test('contentDisposition: non-ASCII names get an ASCII fallback and an encoded filename*', () => {
  const value = contentDisposition('inline', '日本語.txt');
  assert.match(value, /^inline; filename="___\.txt"; filename\*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E\.txt$/);
  // Must be a legal header value for Node.
  const res = new http.ServerResponse({ method: 'GET' });
  assert.doesNotThrow(() => res.setHeader('Content-Disposition', value));
});

test('contentDisposition: quotes, backslashes and control characters cannot break out', () => {
  const value = contentDisposition('attachment', 'a"b\\c\r\nSet-Cookie: x=1.txt');
  assert.ok(!/[\r\n]/.test(value));
  assert.match(value, /^attachment; filename="a_b_c__Set-Cookie: x=1\.txt";/);
  assert.match(value, /filename\*=UTF-8''a%22b%5Cc%0D%0ASet-Cookie%3A%20x%3D1\.txt$/);
});

test('contentDisposition: quote-like characters are percent-encoded in filename*', () => {
  assert.match(contentDisposition('attachment', "it's (1)*.txt"), /filename\*=UTF-8''it%27s%20%281%29%2A\.txt$/);
});

// --- serveFile over a real HTTP round trip ---

let dir;
let server;
let base;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stor-serve-dl-'));
  fs.writeFileSync(path.join(dir, 'hello.txt'), '0123456789');
  fs.writeFileSync(path.join(dir, '日本語.txt'), 'konnichiwa');

  const app = express();
  app.get('/f/*', (req, res) => {
    const meta = libraries.readFile(dir, req.params[0]);
    if (!meta) return res.status(404).json({ error: 'Not found' });
    return serveFile(req, res, meta, { inline: req.query.inline === '1' });
  });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('serveFile: downloads a file as an attachment', async () => {
  const res = await fetch(`${base}/f/hello.txt`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="hello\.txt"/);
  assert.strictEqual(await res.text(), '0123456789');
});

test('serveFile: honours a Range request', async () => {
  const res = await fetch(`${base}/f/hello.txt`, { headers: { Range: 'bytes=2-5' } });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(res.headers.get('content-range'), 'bytes 2-5/10');
  assert.strictEqual(await res.text(), '2345');
});

test('serveFile: a non-ASCII file name downloads instead of failing the request', async () => {
  const res = await fetch(`${base}/f/${encodeURIComponent('日本語.txt')}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /filename\*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E\.txt$/);
  assert.strictEqual(await res.text(), 'konnichiwa');
});

test('serveFile: an unreadable file answers 403 and the server stays up', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    return t.skip('permission bits are not enforced here (windows, or running as root)');
  }
  return (async () => {
    const locked = path.join(dir, 'locked.txt');
    fs.writeFileSync(locked, 'secret');
    fs.chmodSync(locked, 0o000);
    try {
      const res = await fetch(`${base}/f/locked.txt`);
      assert.strictEqual(res.status, 403);
      assert.deepStrictEqual(await res.json(), { error: 'Permission denied' });
      // Still serving afterwards.
      const again = await fetch(`${base}/f/hello.txt`);
      assert.strictEqual(again.status, 200);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  })();
});
