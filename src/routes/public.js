const express = require('express');
const config = require('../config');
const libraries = require('../libraries');
const { serveFile, serveDirectory } = require('../download');

const router = express.Router({ mergeParams: true });

// Reject library ids / paths that try to escape. Library ids are hex tokens, so
// a strict character check is safe and cheap.
function badId(id) {
  return !id || !/^[a-f0-9]+$/i.test(id);
}

function badPath(p) {
  return p.includes('..') || p.includes('\\');
}

// List only the libraries the owner has marked public.
router.get('/libraries', (req, res) => {
  const cfg = config.load();
  const libs = config.getPublicLibraries(cfg || {});
  res.json(libs.map(lib => ({ id: lib.id, name: lib.name })));
});

// Browse a directory or download/preview a file within a public library.
// ?inline=1 serves previewable files in the browser instead of downloading.
router.get('/browse/:lib', handleBrowse);
router.get('/browse/:lib/*', handleBrowse);

function handleBrowse(req, res) {
  const { lib } = req.params;
  const relPath = req.params[0] || '';

  if (badId(lib)) {
    return res.status(400).json({ error: 'Invalid library' });
  }
  if (badPath(relPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const cfg = config.load();
  const libConfig = config.getPublicLibrary(cfg || {}, lib);
  if (!libConfig) {
    return res.status(404).json({ error: 'Not found' });
  }

  const fileInfo = libraries.getFileInfo(libConfig.path, relPath);
  if (!fileInfo) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (fileInfo.type === 'directory') {
    // Check for zip download request
    if (req.query.download === 'zip') {
      const fullPath = libraries.resolveLibraryPath(libConfig.path, relPath);
      if (!fullPath) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      return serveDirectory(req, res, fullPath, fileInfo.name);
    }

    const items = libraries.listDirectory(libConfig.path, relPath);
    if (items === null) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ type: 'directory', name: fileInfo.name, items });
  }

  const fileMeta = libraries.readFile(libConfig.path, relPath);
  if (!fileMeta) {
    return res.status(404).json({ error: 'Not found' });
  }

  const inline = req.query.inline === '1' && fileMeta.previewable;
  return serveFile(req, res, fileMeta, { inline });
}

module.exports = router;
