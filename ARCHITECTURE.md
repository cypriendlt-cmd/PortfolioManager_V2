# Portfolio Manager V2 - Architecture

## Tech Stack

### Backend (Port 3001)
- **Runtime**: Node.js + Express
- **Auth**: Google OAuth 2.0 (passport-google-oauth20)
- **Storage**: Google Drive API (JSON files per user)
- **Session**: express-session + JWT tokens
- **APIs**:
  - Binance API (crypto prices)
  - Yahoo Finance (stocks/ETFs via yahoo-finance2)
  - Alternative.me (Fear & Greed crypto)
  - CNN Fear & Greed (markets)
  - OpenAI/Claude API (AI insights)

### Frontend (Port 3000)
- **Framework**: React 18 + Vite
- **Routing**: React Router v6
- **State**: React Context + hooks
- **Charts**: Recharts
- **Styling**: CSS Modules + CSS Variables (themes)
- **HTTP**: Axios

## Data Model (stored as JSON on Google Drive)

```json
{
  "user": {
    "email": "string",
    "preferences": {
      "theme": "ocean|sunset|forest|lavender",
      "darkMode": false,
      "currency": "EUR",
      "language": "fr"
    }
  },
  "crypto": [
    {
      "id": "uuid",
      "symbol": "BTC",
      "name": "Bitcoin",
      "quantity": 0.5,
      "buyPrice": 30000,
      "buyDate": "2024-01-15",
      "source": "binance|manual"
    }
  ],
  "pea": [
    {
      "id": "uuid",
      "isin": "FR0000120271",
      "name": "TotalEnergies",
      "quantity": 10,
      "buyPrice": 55.20,
      "buyDate": "2024-03-01"
    }
  ],
  "livrets": [
    {
      "id": "uuid",
      "type": "livret-a|ldds|lep|cel|pel",
      "bank": "Boursorama",
      "balance": 10000,
      "customRate": null
    }
  ],
  "fundraising": [
    {
      "id": "uuid",
      "projectName": "string",
      "amountInvested": 1000,
      "unitPrice": 0.50,
      "date": "2024-06-01"
    }
  ],
  "objectives": [
    {
      "id": "uuid",
      "name": "Vacances",
      "targetAmount": 5000,
      "currentAmount": 2500,
      "deadline": "2025-07-01",
      "icon": "plane"
    }
  ]
}
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | /auth/google | Start OAuth |
| GET | /auth/google/callback | OAuth callback |
| GET | /auth/me | Get current user |
| POST | /auth/logout | Logout |
| GET | /api/portfolio | Get full portfolio |
| PUT | /api/portfolio | Save full portfolio |
| GET | /api/crypto/prices | Get crypto prices |
| GET | /api/crypto/binance/sync | Sync Binance account |
| GET | /api/stocks/:isin | Get stock price by ISIN |
| GET | /api/livrets/rates | Get current livret rates |
| GET | /api/market/fear-greed | Get Fear & Greed indices |
| GET | /api/insights | Get AI market insights |
| GET | /api/preferences | Get user preferences |
| PUT | /api/preferences | Save user preferences |

## Themes
- Ocean (blue tones - default)
- Sunset (orange/amber)
- Forest (green)
- Lavender (purple)
- Each with light/dark mode variants
