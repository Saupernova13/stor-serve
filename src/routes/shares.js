const express = require('express');
const shares = require('../shares');
const config = require('../config');
const libraries = require('../libraries');
const pathGuard = require('../middleware/pathGuard');

const router = express.Router({ mergeParams: true });

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
  const list = shares.listShares();
  res.json(list);
});

router.delete('/:token', (req, res) => {
  const { token } = req.params;
  shares.deleteShare(token);
  res.json({ success: true });
});

router.get('/:token/*', (req, res) => {
  const { token } = req.params;
  const relPath = req.params[0] || '';

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

  const fileStream = libraries.readFile(libConfig.path, targetPath);
  if (!fileStream) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', fileStream.size);
  res.setHeader('Content-Disposition', `attachment; filename="${fileStream.name}"`);
  fileStream.stream.pipe(res);
});

module.exports = router;
