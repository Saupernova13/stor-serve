const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const DATA_DIR = path.dirname(CONFIG_PATH);

// Default public drop folder, created on first run. Drop files here and they
// are immediately downloadable by anyone visiting the public site.
const DEFAULT_PUBLIC_DIR = path.join(__dirname, '..', 'shared');
const DEFAULT_PUBLIC_NAME = 'Public Files';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading config:', e);
    return null;
  }
}

function save(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function create(passwordPlain) {
  const hash = bcrypt.hashSync(passwordPlain, 12);
  const secret = crypto.randomBytes(64).toString('hex');
  const config = {
    passwordHash: hash,
    libraries: [],
    settings: {
      sessionSecret: secret,
      maxSharesPerToken: 1000
    }
  };
  save(config);
  return config;
}

function verifyPassword(passwordPlain, config) {
  if (!config || !config.passwordHash) {
    return false;
  }
  return bcrypt.compareSync(passwordPlain, config.passwordHash);
}

function setPassword(config, passwordPlain) {
  config.passwordHash = bcrypt.hashSync(passwordPlain, 12);
  save(config);
  return config;
}

function getOrCreate(passwordPlain) {
  let config = load();
  if (!config) {
    config = create(passwordPlain);
  }
  return config;
}

// Stable, URL-safe identifier for a library so the public/admin URLs never
// depend on the (mutable, possibly space-containing) display name.
function makeId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeLibraries(config) {
  if (!config.libraries) {
    config.libraries = [];
  }
  let changed = false;
  for (const lib of config.libraries) {
    if (!lib.id) {
      lib.id = makeId();
      changed = true;
    }
    if (typeof lib.public !== 'boolean') {
      lib.public = false;
      changed = true;
    }
  }
  if (changed) {
    save(config);
  }
  return config;
}

// On first run (no libraries configured), create a default public drop folder
// so a visitor immediately has something to download and the owner has an
// obvious place to drop files.
function ensureDefaultLibrary(config) {
  normalizeLibraries(config);
  if (config.libraries.length > 0) {
    return config;
  }
  if (!fs.existsSync(DEFAULT_PUBLIC_DIR)) {
    fs.mkdirSync(DEFAULT_PUBLIC_DIR, { recursive: true });
  }
  config.libraries.push({
    id: makeId(),
    name: DEFAULT_PUBLIC_NAME,
    path: DEFAULT_PUBLIC_DIR,
    public: true
  });
  save(config);
  return config;
}

function addLibrary(config, name, dirPath, isPublic = false) {
  normalizeLibraries(config);
  // Replace any existing library with the same name (preserve nothing — a
  // re-add is an explicit overwrite).
  config.libraries = config.libraries.filter(lib => lib.name !== name);
  const lib = { id: makeId(), name, path: dirPath, public: !!isPublic };
  config.libraries.push(lib);
  save(config);
  return lib;
}

function removeLibrary(config, id) {
  normalizeLibraries(config);
  config.libraries = config.libraries.filter(lib => lib.id !== id);
  save(config);
  return config;
}

function setLibraryPublic(config, id, isPublic) {
  normalizeLibraries(config);
  const lib = config.libraries.find(l => l.id === id);
  if (!lib) {
    return null;
  }
  lib.public = !!isPublic;
  save(config);
  return lib;
}

function getLibrary(config, id) {
  if (!config || !config.libraries) {
    return null;
  }
  return config.libraries.find(lib => lib.id === id) || null;
}

function getPublicLibrary(config, id) {
  const lib = getLibrary(config, id);
  if (!lib || !lib.public) {
    return null;
  }
  return lib;
}

function getPublicLibraries(config) {
  if (!config || !config.libraries) {
    return [];
  }
  return config.libraries.filter(lib => lib.public);
}

module.exports = {
  load,
  save,
  create,
  verifyPassword,
  setPassword,
  getOrCreate,
  ensureDefaultLibrary,
  normalizeLibraries,
  addLibrary,
  removeLibrary,
  setLibraryPublic,
  getLibrary,
  getPublicLibrary,
  getPublicLibraries,
  ensureDataDir,
  DEFAULT_PUBLIC_DIR
};
