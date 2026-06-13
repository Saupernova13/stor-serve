const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Stream a directory as a ZIP file without storing it locally.
// Uses archiver to build the ZIP on-the-fly, piping directly to the response.
//   dirPath: absolute path to the directory to zip
//   dirName: name of the directory (used for the ZIP filename)
function serveDirectory(req, res, dirPath, dirName) {
  const safeName = dirName.replace(/[^a-z0-9._\- ]/gi, '_').replace(/\s+/g, '_');
  const zipName = `${safeName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

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

  // Recursively add directory contents
  const addToArchive = (currentPath, arcPath) => {
    if (!fs.existsSync(currentPath)) return;
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      entries.forEach((entry) => {
        const fullPath = path.join(currentPath, entry.name);
        const nextArcPath = arcPath ? path.join(arcPath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          addToArchive(fullPath, nextArcPath);
        } else {
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
  const safeName = fileMeta.name.replace(/"/g, '');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition',
    `${dispositionType}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileMeta.name)}`);
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
      return fs.createReadStream(fileMeta.path, { start, end }).pipe(res);
    }
  }

  res.setHeader('Content-Length', fileMeta.size);
  return fs.createReadStream(fileMeta.path).pipe(res);
}

module.exports = { serveFile, serveDirectory };
