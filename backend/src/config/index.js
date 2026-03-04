/**
 * Centralized configuration module.
 * All environment variables are read and validated here.
 */

require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-prod',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-jwt-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/google/callback',
    scopes: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/drive.file',
    ],
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    baseUrl: 'https://api.binance.com',
  },

  ai: {
    groqApiKey: process.env.GROQ_API_KEY || '',
    togetherApiKey: process.env.TOGETHER_API_KEY || '',
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  },

  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY || '',
    baseUrl: 'https://api.coingecko.com/api/v3',
  },

  alternativeMe: {
    baseUrl: 'https://api.alternative.me',
  },

  googleDrive: {
    appFolderName: 'PortfolioManagerV2',
    portfolioFileName: 'portfolio.json',
  },
};

module.exports = config;
