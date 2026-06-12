const express = require('express');
const config = require('../config');
const libraries = require('../libraries');
const pathGuard = require('../middleware/pathGuard');

const router = express.Router({ mergeParams: true });

router.get('/libraries', (req, res) => {
  const cfg = config.load();
  if (!cfg || !cfg.libraries) {
    return res.json([]);
  }
  res.json(cfg.libraries.map(lib => ({ name: lib.name })));
});

router.get('/:lib/*', pathGuard, (req, res) => {
  const { lib } = req.params;
  const relPath = req.params[0] || '';

  const cfg = config.load();
  if (!cfg) {
    return res.status(500).json({ error: 'Server not initialized' });
  }

  const libConfig = config.getLibrary(cfg, lib);
  if (!libConfig) {
    return res.status(404).json({ error: 'Library not found' });
  }

  const fileInfo = libraries.getFileInfo(libConfig.path, relPath);
  if (!fileInfo) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (fileInfo.type === 'directory') {
    const items = libraries.listDirectory(libConfig.path, relPath);
    if (items === null) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    return res.json({ type: 'directory', items, name: fileInfo.name });
  }

  const fileStream = libraries.readFile(libConfig.path, relPath);
  if (!fileStream) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', fileStream.size);
  res.setHeader('Content-Disposition', `attachment; filename="${fileStream.name}"`);
  fileStream.stream.pipe(res);
});

module.exports = router;
