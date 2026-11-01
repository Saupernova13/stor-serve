const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Build a Content-Disposition value for any file name. Node rejects header
// values holding characters above U+00FF (the request would 500), and a name
// can carry quotes, backslashes or control characters on unix, so filename=
// gets a printable-ASCII fallback and the real name travels percent-encoded in
// filename*= (RFC 6266 / 5987).
function contentDisposition(type, name) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// Pipe a file stream to the response. Without an 'error' listener an unreadable
// file (EACCES is common on unix when the service user cannot read it) is an
// unhandled stream error that takes the whole server down, and without the
// 'close' hook an aborted download (a seek in a video, a closed tab) leaves the
// file descriptor open.
function pipeFile(res, stream) {
  stream.on('error', (err) => {
    console.error('File stream error:', err.message);
    if (res.headersSent) {
      return res.destroy();
    }
    for (const header of ['Content-Disposition', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
      res.removeHeader(header);
    }
    const denied = err.code === 'EACCES' || err.code === 'EPERM';
    res.status(denied ? 403 : 500).json({ error: denied ? 'Permission denied' : 'Failed to read file' });
  });
  res.on('close', () => stream.destroy());
  return stream.pipe(res);
}

// One file the service user cannot read (permission bits on unix) would make
// archiver error out and cut the whole ZIP short, so unreadable files and
// folders are left out and logged instead.
function isReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch (e) {
    console.warn('Skipping unreadable file in ZIP:', filePath);
    return false;
  }
}

// Stream a directory as a ZIP file without storing it locally.
// Uses archiver to build the ZIP on-the-fly, piping directly to the response.
//   dirPath: absolute path to the directory to zip
//   dirName: name of the directory (used for the ZIP filename)
function serveDirectory(req, res, dirPath, dirName) {
  const safeName = dirName.replace(/[^a-z0-9._\- ]/gi, '_').replace(/\s+/g, '_');
  const zipName = `${safeName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition('attachment', zipName));

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Pipe archive directly to response
  archive.pipe(res);

  // Handle errors
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    } else {
      res.end();
    }
  });

  res.on('error', (err) => {
    console.error('Response error:', err);
    archive.abort();
  });

  // Client went away mid-ZIP: stop reading files instead of leaving them open.
  res.on('close', () => {
    if (!res.writableFinished) archive.abort();
  });

  // Recursively add directory contents
  const addToArchive = (currentPath, arcPath) => {
    if (!fs.existsSync(currentPath)) return;
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (e) {
        console.warn('Skipping unreadable folder in ZIP:', currentPath);
        return;
      }
      entries.forEach((entry) => {
        const fullPath = path.join(currentPath, entry.name);
        const nextArcPath = arcPath ? path.posix.join(arcPath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          addToArchive(fullPath, nextArcPath);
        } else if (!entry.isFile() || isReadable(fullPath)) {
          archive.file(fullPath, { name: nextArcPath });
        }
      });
    } else {
      archive.file(currentPath, { name: arcPath || path.basename(currentPath) });
    }
  };

  addToArchive(dirPath, '');
  archive.finalize();
}

// Stream a resolved file to the response. Supports HTTP Range requests so that
// media (video/audio) can be seeked and previewed inline in the browser.
//   fileMeta: { path, size, name, mime } from libraries.readFile()
//   opts.inline: true -> view in browser; false/omitted -> force download
function serveFile(req, res, fileMeta, opts = {}) {
  const inline = !!opts.inline;
  const contentType = inline ? fileMeta.mime : 'application/octet-stream';
  const dispositionType = inline ? 'inline' : 'attachment';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDisposition(dispositionType, fileMeta.name));
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = match[1] === '' ? null : parseInt(match[1], 10);
      let end = match[2] === '' ? null : parseInt(match[2], 10);

      if (start === null && end !== null) {
        // suffix range: last N bytes
        start = Math.max(0, fileMeta.size - end);
        end = fileMeta.size - 1;
      } else {
        if (start === null) start = 0;
        if (end === null) end = fileMeta.size - 1;
      }

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileMeta.size) {
        res.status(416).setHeader('Content-Range', `bytes */${fileMeta.size}`);
        return res.end();
      }

      end = Math.min(end, fileMeta.size - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileMeta.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return pipeFile(res, fs.createReadStream(fileMeta.path, { start, end }));
    }
  }

  res.setHeader('Content-Length', fileMeta.size);
  return pipeFile(res, fs.createReadStream(fileMeta.path));
}

module.exports = { serveFile, serveDirectory, contentDisposition };
