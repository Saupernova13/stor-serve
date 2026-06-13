const express = require('express');
const config = require('../config');

const router = express.Router();

router.post('/login', (req, res) => {
  const password = req.body.password;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const cfg = config.load();
  if (!cfg) {
    return res.status(500).json({ error: 'Server not initialized' });
  }

  if (!config.verifyPassword(password, cfg)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  req.session.authenticated = true;
  res.json({ success: true });
});

router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

module.exports = router;
