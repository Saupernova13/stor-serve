const express = require('express');
const fs = require('fs');
const config = require('../config');

const router = express.Router({ mergeParams: true });

router.post('/libraries', (req, res) => {
  const { name, path } = req.body;

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
  const updated = config.addLibrary(cfg, name, path);
  res.json({ success: true, libraries: updated.libraries });
});

router.delete('/libraries/:name', (req, res) => {
  const { name } = req.params;

  const cfg = config.load();
  const updated = config.removeLibrary(cfg, name);
  res.json({ success: true, libraries: updated.libraries });
});

module.exports = router;
