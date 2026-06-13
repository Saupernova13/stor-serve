const express = require('express');
const fs = require('fs');
const config = require('../config');

const router = express.Router({ mergeParams: true });

router.post('/libraries', (req, res) => {
  const { name, path, public: isPublic } = req.body;

  if (!name || !path) {
    return res.status(400).json({ error: 'Name and path required' });
  }

  if (!fs.existsSync(path)) {
    return res.status(400).json({ error: 'Path does not exist' });
  }

  const stat = fs.statSync(path);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  const cfg = config.load();
  const lib = config.addLibrary(cfg, name, path, !!isPublic);
  res.json({ success: true, library: lib });
});

router.delete('/libraries/:id', (req, res) => {
  const cfg = config.load();
  const updated = config.removeLibrary(cfg, req.params.id);
  res.json({ success: true, libraries: updated.libraries });
});

// Toggle (or set) a library's public visibility.
router.patch('/libraries/:id', (req, res) => {
  const cfg = config.load();
  const lib = config.setLibraryPublic(cfg, req.params.id, !!req.body.public);
  if (!lib) {
    return res.status(404).json({ error: 'Library not found' });
  }
  res.json({ success: true, library: lib });
});

// Surface the default public drop folder so the dashboard can tell the user
// where to drop files.
router.get('/public-dir', (req, res) => {
  res.json({ path: config.DEFAULT_PUBLIC_DIR });
});

router.post('/password', (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (String(next).length < 4) {
    return res.status(400).json({ error: 'New password too short' });
  }
  const cfg = config.load();
  if (!config.verifyPassword(current, cfg)) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }
  config.setPassword(cfg, next);
  res.json({ success: true });
});

module.exports = router;
