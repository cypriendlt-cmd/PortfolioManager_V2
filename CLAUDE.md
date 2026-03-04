# Portfolio Manager V2

## Overview
Application de gestion de patrimoine personnel (crypto, PEA, livrets, fundraising, objectifs). Interface en français, données stockées sur Google Drive, déployée sur GitHub Pages (frontend) avec backend Express.

## Tech Stack
- **Frontend**: React 18 + Vite (port 3000), React Router v6, Recharts, Axios, Lucide React, CSS Variables (themes)
- **Backend**: Node.js + Express (port 3001), Passport Google OAuth 2.0, Google Drive API, yahoo-finance2, @anthropic-ai/sdk
- **Déploiement**: GitHub Pages (frontend via `deploy.yml`), backend hébergé séparément
- **PWA**: Service Worker, manifest.json, push notifications

## Architecture

### Structure des dossiers
```
frontend/
  src/
    components/    # Layout, Sidebar, BetaSidebar, Header, BankImportModal, InstallPrompt
    context/       # AuthContext, BankContext, BetaContext, PortfolioContext, PrivacyContext, ThemeContext
    hooks/         # usePriceRefresh, usePrivacyMask, useWindowSize
    pages/         # Dashboard, Banking, Crypto, PEA, Livrets, DCA, Fundraising, Objectives, Insights, Login, Settings
    pages/beta/    # BetaDashboard, BetaBudget, BetaFreedom, BetaInvestments, BetaOnboarding, BetaSecurity
    services/      # api, auth, bankAI, bankEngine, bankParser, bankTaxonomy, bankWorkerBridge, binanceService, crypto, emailService, googleDrive, insights, interestEngine, livrets, market, notifications, portfolio, priceService, pushNotifications, rateProvider, stocks
    workers/       # bankWorker.js (catégorisation lourde en Web Worker)
    styles/        # app.css (fichier CSS unique pour toute l'application)
backend/
  src/
    config/        # index.js (env vars centralisées)
    middleware/    # auth.js (requireAuth, optionalAuth via JWT/session)
    routes/        # auth, categorize, coach, crypto, insights, livrets, market, portfolio, stocks
    services/      # ai/ (groq, together, huggingface + orchestrateur fallback), crypto, googleDrive, insights, insightsCache, livrets, market, stocks, stockScreener
    utils/         # calculations.js (PRU, gains, intérêts, total portfolio)
cors-proxy/        # worker.js (Cloudflare Worker CORS proxy)
scripts/           # update-rates.mjs (scraping taux livrets)
.github/workflows/ # deploy.yml (GitHub Pages), update-rates.yml (cron taux livrets)
```

### Persistance des données
- **Google Drive** : Chaque utilisateur a un dossier `PortfolioManager_V2` sur son Drive
  - `portfolio.json` : crypto, PEA, livrets, fundraising, objectives, preferences
  - `bank_history.json` : transactions, rules, learnedRules, aiCache
  - `user-profile.json` : profil financier beta (income, expenses, cash, horizon, risk)
  - `secrets.json` : clés API Binance + Anthropic (stockées sur Drive utilisateur)
- **localStorage** : theme, darkMode, hideValues, DCA reminders, guest data, screener_profile
- **sessionStorage** : access token Google

### Authentification
- Google OAuth 2.0 (redirect-based) → JWT token (7j) + session fallback
- Mode guest disponible (données en localStorage uniquement)
- Middleware : `requireAuth` (401 si non connecté), `optionalAuth` (passe si anonyme)

### State Management (Contexts React)
| Context | Rôle |
|---------|------|
| `AuthContext` | Login Google/guest, tokens, gapi init |
| `PortfolioContext` | CRUD crypto/PEA/livrets/fundraising/objectives, prix, totaux, DCA config, sauvegarde Drive |
| `BankContext` | Import Excel, catégorisation (rules + AI), profil financier, health score |
| `BetaContext` | Mode coaching beta, profil utilisateur, onboarding |
| `PrivacyContext` | Masquage des montants (hideValues) |
| `ThemeContext` | 5 thèmes (crimson, ocean, slate, amethyst, teal) + dark/light mode |

### Prix & Refresh
- Auto-refresh 60s via `usePriceRefresh` hook
- Crypto : CoinGecko API (client-side, CORS-friendly) + cache 5min
- Stocks/ETF : Yahoo Finance via CORS proxy (3 fallbacks : Cloudflare Worker → allorigins → direct)
- Backend aussi expose `/api/crypto/prices` et `/api/stocks/:isin`

## API Routes Backend

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/google` | Initier OAuth |
| GET | `/auth/google/callback` | Callback OAuth → JWT |
| GET | `/auth/me` | User courant |
| POST | `/auth/logout` | Déconnexion |
| GET/PUT | `/api/portfolio` | Charger/sauvegarder portfolio (Drive) |
| GET/PUT | `/api/portfolio/preferences` | Préférences utilisateur |
| GET | `/api/crypto/prices?ids=...&currency=eur` | Prix crypto (CoinGecko) |
| GET | `/api/crypto/search?query=...` | Recherche crypto |
| GET | `/api/crypto/top?limit=100` | Top cryptos |
| GET | `/api/crypto/:id` | Détail crypto |
| GET | `/api/crypto/binance/sync` | Sync Binance (HMAC-SHA256) |
| GET | `/api/stocks/search/:query` | Recherche actions |
| GET | `/api/stocks/symbol/:symbol` | Prix par ticker |
| GET | `/api/stocks/:isin` | Prix par ISIN |
| GET | `/api/stocks/history/:symbol` | Historique OHLCV |
| GET | `/api/livrets/rates` | Taux livrets réglementés |
| POST | `/api/livrets/calculate` | Calcul intérêts |
| GET | `/api/market/fear-greed` | Indices Fear & Greed (crypto + stock) |
| GET | `/api/insights` | Insights AI (cache 24h) |
| POST | `/api/insights/analyze` | Analyse portfolio AI |
| POST | `/api/insights/dashboard-summary` | Résumé dashboard AI |
| POST | `/api/insights/stocks` | **Stock Screener (Claude AI)** — analyse actions selon profil investisseur |
| POST | `/api/bank/categorize` | Catégorisation AI transactions |
| POST | `/api/bank/coach` | Coach budgétaire AI |

## AI Integration
- **Orchestrateur multi-provider** avec fallback : Groq (llama-3.3-70b) → Together (llama-3.1-8b) → HuggingFace (Mixtral-8x7B)
- Fallback vers données mock si aucun provider disponible
- Cache fichier 24h pour insights (`backend/data/insights-cache.json`)
- Cron daily 8h00 pour refresh insights
- Catégorisation transactions : batch de 20 merchants max, 3 requêtes max

### Invest LAB — Stock Screener (Claude AI)
- **Page** : Section "Invest LAB" dans Insights.jsx
- **Backend** : `POST /api/insights/stocks` → proxy vers Anthropic API (`@anthropic-ai/sdk`, modèle `claude-sonnet-4-20250514`)
- **Service** : `backend/src/services/stockScreener.js` (validation profil, construction prompt, appel Claude, parsing JSON)
- **Clé API** : Fournie par l'utilisateur via Settings → stockée dans `secrets.json` sur Drive (comme Binance). Fallback sur `ANTHROPIC_API_KEY` env var backend.
- **Profil investisseur** : Formulaire UI avec riskTolerance, investmentAmount, horizon, preferredSectors (multiselect chips), geography, style, esg
- **Prompt** : Injecte dynamiquement les valeurs du profil, demande un JSON structuré (meta, summary, top10, table, reportMarkdown)
- **Sécurité** : Rate limit 30s/IP, validation stricte des inputs, clé jamais exposée côté frontend statique
- **Affichage** : Cards résumé, tableau récapitulatif, fiches détaillées expandables, rapport markdown complet

## Banking (Transactions)
- **Import** : Excel (.xlsx), format sheet `ACC__TYPE__ALIAS` (ex: `ACC__COURANT__BoursoBank`)
- **Parsing** : Détection auto header (date + débit/crédit/montant), tolérance accents
- **Catégorisation** : 3 niveaux de priorité :
  1. Rules utilisateur (manuelles)
  2. Learned rules (corrections passées)
  3. AI (backend, batch)
- **18 catégories** : revenus, loyer, alimentation, transport, abonnements, achats, restauration, sante, loisirs, frais_bancaires, epargne, impots, virement, autre...
- **Web Worker** : Calculs lourds déportés (`bankWorker.js` via `bankWorkerBridge.js`)

## Livrets (Épargne réglementée)
- Types : Livret A, LDDS, LEP, CEL, PEL
- Taux officiels hardcodés avec historique depuis 2020 (`rateProvider.js`)
- Calcul par quinzaine (méthode française)
- Workflow auto-update : cron GitHub Actions (1er fév + 1er août) scrape service-public.gouv.fr → PR auto

## Beta Mode (Coaching financier)
- Mode alternatif avec layout dédié (BetaLayout + BetaSidebar)
- Pages : Dashboard (score santé), Budget, Matelas sécurité, Allocation, Liberté financière
- Profil : revenus, dépenses, cash, horizon, tolérance risque
- Calculs : score santé, taux épargne, nombre FIRE, projection 50 ans, allocation suggérée

## Thèmes
5 thèmes (crimson, ocean, slate, amethyst, teal) × 2 modes (light/dark) via CSS variables sur `document.documentElement`.

## CSS
**Fichier unique** : `frontend/src/styles/app.css` — contient tout le CSS de l'application (pas de fichiers CSS par page).

## Scripts & CI/CD
- `npm run dev` (frontend) : Vite dev server port 3000, proxy `/api` et `/auth` vers localhost:3001
- `npm run dev` (backend) : nodemon sur port 3001
- **deploy.yml** : Push master → build frontend → deploy GitHub Pages
- **update-rates.yml** : Cron fév/août → scrape taux → PR auto

## Conventions
- Langue UI : français
- Devise par défaut : EUR
- UUIDs pour les IDs d'assets
- Debounce 1.5s sur saves Drive
- Pas de base de données — tout sur Google Drive (JSON)
- CORS proxy Cloudflare Worker pour APIs bloquées (Yahoo Finance, Binance)
