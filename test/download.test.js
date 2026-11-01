const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const libraries = require('../src/libraries');
const { serveFile, serveDirectory, contentDisposition, zipEntryName, INLINE_CSP, INLINE_PDF_CSP, INLINE_MEDIA_CSP } = require('../src/download');

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
  fs.writeFileSync(path.join(dir, 'evil.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');
  fs.writeFileSync(path.join(dir, 'doc.pdf'), '%PDF-1.4' + String.fromCharCode(10) + '%%EOF');
  fs.writeFileSync(path.join(dir, 'pic.png'), 'not really a png');
  fs.writeFileSync(path.join(dir, 'clip.mp4'), 'not really a video');
  fs.writeFileSync(path.join(dir, 'song.mp3'), 'not really audio');
  fs.mkdirSync(path.join(dir, 'tree', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tree', 'top.txt'), 'top');
  fs.writeFileSync(path.join(dir, 'tree', 'sub', 'inner.txt'), 'inner');

  const app = express();
  app.get('/f/*', (req, res) => {
    const meta = libraries.readFile(dir, req.params[0]);
    if (!meta) return res.status(404).json({ error: 'Not found' });
    return serveFile(req, res, meta, { inline: req.query.inline === '1' });
  });
  app.get('/zip/*', (req, res) => {
    const full = libraries.resolveLibraryPath(dir, req.params[0]);
    return serveDirectory(req, res, full, path.basename(full));
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

test('serveDirectory: ZIP entries use forward slashes', async () => {
  const res = await fetch(`${base}/zip/tree`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/zip');
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.includes('sub/inner.txt'));
  assert.ok(body.includes('top.txt'));
  assert.ok(!body.includes('sub\\inner.txt'));
});

test('serveDirectory: an unreadable file is left out instead of breaking the ZIP', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    return t.skip('permission bits are not enforced here (windows, or running as root)');
  }
  return (async () => {
    const locked = path.join(dir, 'tree', 'locked.txt');
    fs.writeFileSync(locked, 'secret');
    fs.chmodSync(locked, 0o000);
    try {
      const res = await fetch(`${base}/zip/tree`);
      const body = Buffer.from(await res.arrayBuffer());
      assert.ok(body.includes('top.txt'));
      assert.ok(!body.includes('locked.txt'));
      // A complete archive ends with the end-of-central-directory record.
      assert.ok(body.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])));
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  })();
});

// Names of the entries in a ZIP, read from its central directory (the local
// headers are streamed before the sizes are known, the central directory is not).
function zipEntryNames(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'no end-of-central-directory record: not a complete ZIP');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    assert.strictEqual(buf.readUInt32LE(offset), 0x02014b50, 'bad central directory entry');
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

test('zipEntryName: backslashes are replaced and . / .. never come out', () => {
  assert.strictEqual(zipEntryName('plain.txt'), 'plain.txt');
  assert.strictEqual(zipEntryName('..\\..\\evil.bat'), '.._.._evil.bat');
  assert.strictEqual(zipEntryName('a\\b'), 'a_b');
  assert.strictEqual(zipEntryName('.'), '_');
  assert.strictEqual(zipEntryName('..'), '_');
  assert.strictEqual(zipEntryName('...'), '...');
});

test('serveDirectory: a name with backslashes cannot become a zip-slip entry', { skip: process.platform === 'win32' }, async () => {
  // Legal on unix: a file whose name is a Windows-style traversal, and a folder with a backslash.
  const slip = path.join(dir, 'slip');
  fs.mkdirSync(path.join(slip, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(slip, 'sub', '..\\..\\..\\evil.bat'), 'echo pwned');
  fs.mkdirSync(path.join(slip, 'dir\\..\\..'));
  fs.writeFileSync(path.join(slip, 'dir\\..\\..', 'inside.txt'), 'x');
  fs.writeFileSync(path.join(slip, 'ok.txt'), 'ok');

  const res = await fetch(`${base}/zip/slip`);
  assert.strictEqual(res.status, 200);
  const names = zipEntryNames(Buffer.from(await res.arrayBuffer()));

  assert.deepStrictEqual(names.slice().sort(), [
    'dir_.._../inside.txt',
    'ok.txt',
    'sub/.._.._.._evil.bat'
  ]);
  for (const name of names) {
    assert.ok(!name.includes('\\'), `backslash left in ${name}`);
    assert.ok(!name.startsWith('/'), `absolute entry ${name}`);
    assert.ok(!name.split('/').some((part) => part === '.' || part === '..'), `traversal component in ${name}`);
  }
});

test('serveDirectory: an archive error after the headers went out drops the connection', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    return t.skip('permission bits are not enforced here (windows, or running as root)');
  }
  return (async () => {
    const failing = path.join(dir, 'failing');
    fs.mkdirSync(failing);
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      fs.writeFileSync(path.join(failing, name), name.repeat(1000));
    }
    // The last entry archiver is handed cannot be opened, so it errors after
    // the earlier entries have already been written to the response.
    const last = fs.readdirSync(failing).pop();
    const locked = path.join(failing, last);
    fs.chmodSync(locked, 0o000);
    // Skip the up-front readability check so the failure happens inside archiver.
    t.mock.method(fs, 'accessSync', () => undefined);
    try {
      await assert.rejects(async () => {
        const res = await fetch(`${base}/zip/failing`);
        // A clean end would resolve here with a ZIP that has no central directory.
        await res.arrayBuffer();
      });
      // The server survives it.
      const again = await fetch(`${base}/f/hello.txt`);
      assert.strictEqual(again.status, 200);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  })();
});

// --- inline previews carry a sandboxing CSP ---

const EXPECTED_INLINE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

test('serveFile: an inline SVG is sandboxed by its response CSP', async () => {
  const res = await fetch(`${base}/f/evil.svg?inline=1`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'image/svg+xml');
  assert.strictEqual(res.headers.get('content-security-policy'), EXPECTED_INLINE_CSP);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-disposition'), /^inline;/);
  assert.match(await res.text(), /<script>/);
});

test('serveFile: the sandbox CSP replaces the helmet one instead of being added to it', async () => {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"] } } }));
  app.get('/f/*', (req, res) => serveFile(req, res, libraries.readFile(dir, req.params[0]), { inline: req.query.inline === '1' }));
  const srv = http.createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${srv.address().port}/f/evil.svg`;
    const inline = await fetch(`${url}?inline=1`);
    assert.strictEqual(inline.headers.get('content-security-policy'), EXPECTED_INLINE_CSP);
    // A plain download keeps the app-wide policy; it is an attachment, never rendered.
    const download = await fetch(url);
    assert.match(download.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
    assert.strictEqual(download.headers.get('content-type'), 'application/octet-stream');
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('serveFile: other inline types get the same sandbox, a PDF keeps scripts on an opaque origin, media is not sandboxed', async () => {
  const text = await fetch(`${base}/f/hello.txt?inline=1`);
  assert.strictEqual(text.headers.get('content-security-policy'), EXPECTED_INLINE_CSP);
  const png = await fetch(`${base}/f/pic.png?inline=1`);
  assert.strictEqual(png.headers.get('content-security-policy'), EXPECTED_INLINE_CSP);

  const pdf = await fetch(`${base}/f/doc.pdf?inline=1`);
  assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(pdf.headers.get('content-security-policy'), INLINE_PDF_CSP);
  assert.match(pdf.headers.get('content-security-policy'), /^sandbox allow-scripts;/);

  // Chromium will not load a media document's source under `sandbox`, so audio
  // and video get the same rules without it (default-src 'none' still blocks script).
  for (const [file, mime] of [['clip.mp4', 'video/mp4'], ['song.mp3', 'audio/mpeg']]) {
    const media = await fetch(`${base}/f/${file}?inline=1`);
    assert.strictEqual(media.headers.get('content-type'), mime);
    assert.strictEqual(media.headers.get('content-security-policy'), INLINE_MEDIA_CSP);
    assert.strictEqual(media.headers.get('content-security-policy'),
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    assert.strictEqual(media.headers.get('x-content-type-options'), 'nosniff');
    await media.arrayBuffer();
  }
});

test('serveFile: no inline policy ever allows the file to share this origin', () => {
  assert.strictEqual(INLINE_CSP, EXPECTED_INLINE_CSP);
  for (const csp of [INLINE_CSP, INLINE_PDF_CSP, INLINE_MEDIA_CSP]) {
    assert.ok(!csp.includes('allow-same-origin'));
    assert.ok(!csp.includes('allow-top-navigation'));
    assert.match(csp, /default-src 'none'/);
  }
});

test('serveFile: a plain download is not given the inline policy', async () => {
  const res = await fetch(`${base}/f/evil.svg`);
  assert.strictEqual(res.headers.get('content-security-policy'), null);
  assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream');
});
