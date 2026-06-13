const express = require('express');
const shares = require('../shares');
const config = require('../config');
const libraries = require('../libraries');
const { serveFile } = require('../download');

const router = express.Router({ mergeParams: true });

// --- Authenticated management endpoints (mounted under /api/shares) ---

router.post('/', (req, res) => {
  const { library, relPath, type, label, expiresAt } = req.body;

  if (!library || relPath === undefined || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cfg = config.load();
  const libConfig = config.getLibrary(cfg, library);
  if (!libConfig) {
    return res.status(404).json({ error: 'Library not found' });
  }

  const share = shares.create(library, relPath, type, label || 'Share', expiresAt);
  res.json(share);
});

router.get('/', (req, res) => {
  res.json(shares.listShares());
});

router.delete('/:token', (req, res) => {
  shares.deleteShare(req.params.token);
  res.json({ success: true });
});

module.exports = router;

// --- Public share-link handler (mounted directly on the app at /s) ---
// Exported separately so server.js can wire it before auth middleware.
function publicShareHandler(req, res) {
  const { token } = req.params;
  const relPath = req.params[0] || '';

  if (relPath.includes('..') || relPath.includes('\\')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const share = shares.getShare(token);
  if (!share) {
    return res.status(404).json({ error: 'Share not found or expired' });
  }

  const cfg = config.load();
  const libConfig = config.getLibrary(cfg, share.library);
  if (!libConfig) {
    return res.status(404).json({ error: 'Library not found' });
  }

  const targetPath = relPath ? `${share.relPath}/${relPath}` : share.relPath;
  const fileInfo = libraries.getFileInfo(libConfig.path, targetPath);
  if (!fileInfo) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (fileInfo.type === 'directory') {
    const items = libraries.listDirectory(libConfig.path, targetPath);
    if (items === null) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    return res.json({ type: 'directory', items, name: fileInfo.name });
  }

  const fileMeta = libraries.readFile(libConfig.path, targetPath);
  if (!fileMeta) {
    return res.status(404).json({ error: 'File not found' });
  }

  const inline = req.query.inline === '1' && fileMeta.previewable;
  return serveFile(req, res, fileMeta, { inline });
}

module.exports.publicShareHandler = publicShareHandler;
