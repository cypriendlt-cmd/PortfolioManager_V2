/**
 * Portfolio Manager V2 - Express Server
 * Entry point for the backend API.
 *
 * Port: 3001 (configurable via PORT env var)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const passport = require('passport');

const cron = require('node-cron');
const config = require('./config');

// Route imports
const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const cryptoRoutes = require('./routes/crypto');
const stocksRoutes = require('./routes/stocks');
const livretsRoutes = require('./routes/livrets');
const marketRoutes = require('./routes/market');
const insightsRoutes = require('./routes/insights');
const bankRoutes  = require('./routes/categorize');
const coachRoutes = require('./routes/coach');

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS Configuration ───────────────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://cypriendlt-cmd.github.io',
  config.frontend.url,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Session Middleware ───────────────────────────────────────────────────────

app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: !config.server.isDev, // HTTPS only in production
    httpOnly: true,
    maxAge: config.session.maxAge,
    sameSite: config.server.isDev ? 'lax' : 'none',
  },
}));

// ─── Passport Initialization ──────────────────────────────────────────────────

app.use(passport.initialize());
app.use(passport.session());

// ─── Request Logging (dev only) ───────────────────────────────────────────────

if (config.server.isDev) {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    env: config.server.nodeEnv,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/livrets', livretsRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/bank',       bankRoutes);
app.use('/api/bank/coach', coachRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  if (config.server.isDev) {
    console.error(err.stack);
  }

  // CORS errors
  if (err.message?.includes('CORS blocked')) {
    return res.status(403).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.server.isDev && { stack: err.stack }),
  });
});

// ─── Server Start ─────────────────────────────────────────────────────────────

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`\n🚀 Portfolio Manager API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${config.server.nodeEnv}`);
  console.log(`   Frontend URL: ${config.frontend.url}`);
  console.log(`\n📍 Available routes:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /auth/google`);
  console.log(`   GET  /auth/me`);
  console.log(`   GET  /api/portfolio`);
  console.log(`   PUT  /api/portfolio`);
  console.log(`   GET  /api/crypto/prices?ids=bitcoin`);
  console.log(`   GET  /api/crypto/binance/sync`);
  console.log(`   GET  /api/stocks/:isin`);
  console.log(`   GET  /api/livrets/rates`);
  console.log(`   POST /api/livrets/calculate`);
  console.log(`   GET  /api/market/fear-greed`);
  console.log(`   GET  /api/insights`);
  console.log(`   POST /api/insights/stocks\n`);

  // Warn about missing critical env vars
  const warnings = [];
  if (!config.google.clientId) warnings.push('GOOGLE_CLIENT_ID');
  if (!config.google.clientSecret) warnings.push('GOOGLE_CLIENT_SECRET');
  if (config.session.secret.includes('fallback')) warnings.push('SESSION_SECRET (using fallback)');
  if (config.jwt.secret.includes('fallback')) warnings.push('JWT_SECRET (using fallback)');
  if (!config.ai.anthropicApiKey) warnings.push('ANTHROPIC_API_KEY (Stock Screener disabled)');

  if (warnings.length > 0) {
    console.warn('⚠️  Missing or insecure env vars:', warnings.join(', '));
    console.warn('   Copy .env.example to .env and fill in the values.\n');
  }
});

// ─── Cron: refresh insights daily at 8:00 AM ────────────────────────────────

cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] 8h00 - Refreshing daily insights...');
  try {
    const insightsService = require('./services/insights');
    const marketService = require('./services/market');
    const cryptoService = require('./services/crypto');
    const insightsCacheService = require('./services/insightsCache');

    const marketContext = {};
    try {
      const fg = await marketService.getCryptoFearGreed(1);
      marketContext.fearGreed = fg.current;
    } catch {}
    try {
      const sfg = await marketService.getStockFearGreed();
      if (sfg.current.value !== null) marketContext.stockFearGreed = sfg.current;
    } catch {}
    try {
      const prices = await cryptoService.getCryptoPrices(['bitcoin', 'ethereum'], 'eur');
      if (prices.bitcoin) marketContext.btcPrice = prices.bitcoin.eur;
      if (prices.ethereum) marketContext.ethPrice = prices.ethereum.eur;
    } catch {}

    const insights = await insightsService.getDailyInsights(marketContext);
    insightsCacheService.saveCache({
      insights,
      fearGreed: {
        crypto: marketContext.fearGreed || null,
        stock: marketContext.stockFearGreed || null,
      },
      marketContext,
      updatedAt: new Date().toISOString(),
    });
    console.log('[Cron] Daily insights refreshed successfully.');
  } catch (err) {
    console.error('[Cron] Failed to refresh insights:', err.message);
  }
});

module.exports = app;
