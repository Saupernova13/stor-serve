require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./src/config');
const requireAuth = require('./src/middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3444;

config.ensureDataDir();

const cfg = config.getOrCreate('default');
config.ensureDefaultLibrary(cfg);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // Served as plain HTTP on the LAN/tailnet (TLS is terminated at Cloudflare),
      // so do NOT force-upgrade subresource requests to HTTPS.
      upgradeInsecureRequests: null
    }
  },
  // Origin speaks plain HTTP; HSTS would wrongly force browsers to HTTPS.
  hsts: false
}));

const sessionMiddleware = session({
  secret: cfg.settings.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // The Node origin always speaks plain HTTP (direct on the tailnet, and
    // HTTP behind Cloudflare since TLS is terminated at the edge). A `secure`
    // cookie would never be issued, so the session could never persist.
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: (req) => req.method !== 'POST' || !req.path.includes('/login')
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500
});

app.use(loginLimiter);
app.use(generalLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const authRouter = require('./src/routes/auth');
const browseRouter = require('./src/routes/browse');
const sharesRouter = require('./src/routes/shares');
const publicRouter = require('./src/routes/public');
const adminRouter = require('./src/routes/admin');

// --- Public, no-auth surface ---
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);

// Public share links (token-based, work with or without a trailing path).
app.get('/s/:token', sharesRouter.publicShareHandler);
app.get('/s/:token/*', sharesRouter.publicShareHandler);

// --- Authenticated admin surface ---
app.use('/api', requireAuth);
app.use('/api/browse', browseRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/admin', adminRouter);

// --- Pages ---
// Public-facing storefront: browse + download public libraries, no login.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin dashboard SPA (auth handled client-side against the API).
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`stor-serve listening on http://localhost:${PORT}`);
  console.log(`config initialized with ${cfg.libraries.length} libraries`);
});
