const libraries = require('../libraries');

function pathGuard(req, res, next) {
  const { lib, path } = req.params;

  if (!lib || lib.includes('..') || lib.includes('/') || lib.includes('\\')) {
    return res.status(400).json({ error: 'Invalid library name' });
  }

  if (path && (path.includes('..') || path.includes('//') || path.includes('\\\\'))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  next();
}

module.exports = pathGuard;
