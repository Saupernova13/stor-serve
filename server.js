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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:']
    }
  }
}));

const sessionMiddleware = session({
  secret: cfg.settings.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
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
const adminRouter = require('./src/routes/admin');

app.use('/api/auth', authRouter);

app.get('/s/:token/*', require('./src/routes/shares'));

app.use('/api', requireAuth);
app.use('/api/browse', browseRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/admin', adminRouter);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`stor-serve listening on http://localhost:${PORT}`);
  console.log(`config initialized with ${cfg.libraries.length} libraries`);
});
