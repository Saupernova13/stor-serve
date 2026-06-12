const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const DATA_DIR = path.dirname(CONFIG_PATH);

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

function getOrCreate(passwordPlain) {
  let config = load();
  if (!config) {
    config = create(passwordPlain);
  }
  return config;
}

function addLibrary(config, name, dirPath) {
  if (!config.libraries) {
    config.libraries = [];
  }
  config.libraries = config.libraries.filter(lib => lib.name !== name);
  config.libraries.push({ name, path: dirPath });
  save(config);
  return config;
}

function removeLibrary(config, name) {
  if (!config.libraries) {
    config.libraries = [];
  }
  config.libraries = config.libraries.filter(lib => lib.name !== name);
  save(config);
  return config;
}

function getLibrary(config, name) {
  if (!config.libraries) {
    return null;
  }
  return config.libraries.find(lib => lib.name === name);
}

module.exports = {
  load,
  save,
  create,
  verifyPassword,
  getOrCreate,
  addLibrary,
  removeLibrary,
  getLibrary,
  ensureDataDir
};
