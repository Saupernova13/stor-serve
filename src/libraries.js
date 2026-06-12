const fs = require('fs');
const path = require('path');

function resolveLibraryPath(libraryRoot, relPath) {
  const normalized = path.normalize(relPath || '');
  const resolved = path.resolve(libraryRoot, normalized);
  const library = path.resolve(libraryRoot);

  if (!resolved.startsWith(library)) {
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
  const items = entries.map(entry => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
    size: entry.isFile() ? fs.statSync(path.join(fullPath, entry.name)).size : null,
    modified: fs.statSync(path.join(fullPath, entry.name)).mtime.toISOString()
  }));

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

  try {
    const stream = fs.createReadStream(fullPath);
    return { stream, size: stat.size, name: path.basename(fullPath) };
  } catch (e) {
    console.error('Error reading file:', e);
    return null;
  }
}

module.exports = {
  resolveLibraryPath,
  listDirectory,
  getFileInfo,
  readFile
};
