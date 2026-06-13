const fs = require('fs');
const path = require('path');

// Minimal extension -> content-type map for inline preview of common types.
// Anything not listed is served as a download (application/octet-stream).
const MIME_TYPES = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
};

function mimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPreviewable(filename) {
  return Object.prototype.hasOwnProperty.call(MIME_TYPES, path.extname(filename).toLowerCase());
}

// Resolve a relative path inside a library root, refusing anything that would
// escape the root (path traversal). Requires the resolved path to be the root
// itself or sit beneath it on a real separator boundary.
function resolveLibraryPath(libraryRoot, relPath) {
  const root = path.resolve(libraryRoot);
  const resolved = path.resolve(root, path.normalize(relPath || ''));

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }

  return resolved;
}

function listDirectory(libraryRoot, relPath) {
  const fullPath = resolveLibraryPath(libraryRoot, relPath);
  if (!fullPath) {
    return null;
  }

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isDirectory()) {
    return null;
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  const items = entries.map(entry => {
    const entryStat = fs.statSync(path.join(fullPath, entry.name));
    return {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? entryStat.size : null,
      modified: entryStat.mtime.toISOString(),
      previewable: entry.isFile() ? isPreviewable(entry.name) : false
    };
  });

  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return items;
}

function getFileInfo(libraryRoot, relPath) {
  const fullPath = resolveLibraryPath(libraryRoot, relPath);
  if (!fullPath) {
    return null;
  }

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const stat = fs.statSync(fullPath);
  return {
    name: path.basename(fullPath),
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function readFile(libraryRoot, relPath) {
  const fullPath = resolveLibraryPath(libraryRoot, relPath);
  if (!fullPath) {
    return null;
  }

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return null;
  }

  return {
    path: fullPath,
    size: stat.size,
    name: path.basename(fullPath),
    mime: mimeType(fullPath),
    previewable: isPreviewable(fullPath)
  };
}

module.exports = {
  resolveLibraryPath,
  listDirectory,
  getFileInfo,
  readFile,
  mimeType,
  isPreviewable
};
