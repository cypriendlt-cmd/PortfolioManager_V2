// Demo portfolio data for guest/demo mode
// Represents a realistic French retail investor portfolio

export const GUEST_DEMO_PORTFOLIO = {
  crypto: [
    {
      id: 'demo_btc',
      name: 'Bitcoin',
      symbol: 'BTC',
      coingeckoId: 'bitcoin',
      quantity: 0.35,
      buyPrice: 28000,
      currentPrice: 58000,
      change24h: 2.3,
      movements: [
        { date: '2023-01-15', type: 'buy', quantity: 0.35, price: 28000, fees: 25 },
      ],
    },
    {
      id: 'demo_eth',
      name: 'Ethereum',
      symbol: 'ETH',
      coingeckoId: 'ethereum',
      quantity: 4.2,
      buyPrice: 1800,
      currentPrice: 3100,
      change24h: 1.7,
      movements: [
        { date: '2023-03-10', type: 'buy', quantity: 3.0, price: 1750, fees: 15 },
        { date: '2023-09-22', type: 'buy', quantity: 1.2, price: 1900, fees: 10 },
      ],
    },
    {
      id: 'demo_sol',
      name: 'Solana',
      symbol: 'SOL',
      coingeckoId: 'solana',
      quantity: 25,
      buyPrice: 45,
      currentPrice: 135,
      change24h: -0.8,
      movements: [
        { date: '2023-06-05', type: 'buy', quantity: 25, price: 45, fees: 5 },
      ],
    },
  ],

  pea: [
    {
      id: 'demo_lvmh',
      name: 'LVMH Moët Hennessy',
      symbol: 'MC',
      isin: 'FR0000121014',
      quantity: 3,
      buyPrice: 680,
      currentPrice: 780,
      movements: [
        { date: '2022-11-08', type: 'buy', quantity: 3, price: 680, fees: 3 },
      ],
    },
    {
      id: 'demo_totalenergies',
      name: 'TotalEnergies',
      symbol: 'TTE',
      isin: 'FR0014000MR3',
      quantity: 12,
      buyPrice: 52,
      currentPrice: 63,
      movements: [
        { date: '2022-08-15', type: 'buy', quantity: 8, price: 50, fees: 2 },
        { date: '2023-02-20', type: 'buy', quantity: 4, price: 56, fees: 2 },
      ],
    },
    {
      id: 'demo_airbus',
      name: 'Airbus',
      symbol: 'AIR',
      isin: 'NL0000235190',
      quantity: 5,
      buyPrice: 120,
      currentPrice: 165,
      movements: [
        { date: '2023-04-12', type: 'buy', quantity: 5, price: 120, fees: 3 },
      ],
    },
  ],

  livrets: [
    {
      id: 'demo_la',
      name: 'Livret A',
      type: 'livret-a',
      balance: 7500,
      openDate: '2020-03-01',
      movements: [],
    },
    {
      id: 'demo_ldds',
      name: 'LDDS',
      type: 'ldds',
      balance: 12000,
      openDate: '2019-06-15',
      movements: [],
    },
    {
      id: 'demo_lep',
      name: 'LEP',
      type: 'lep',
      balance: 10000,
      openDate: '2021-01-10',
      movements: [],
    },
  ],

  fundraising: [
    {
      id: 'demo_fintech_ai',
      name: 'FinTech AI',
      amountInvested: 5000,
      valuation: 2000000,
      equity: 0.25,
      date: '2022-05-20',
    },
    {
      id: 'demo_green_energy',
      name: 'GreenEnergy',
      amountInvested: 2500,
      valuation: 800000,
      equity: 0.3,
      date: '2023-07-14',
    },
  ],

  objectives: [
    {
      id: 'demo_obj_emergency',
      name: 'Fonds d\'urgence',
      targetAmount: 15000,
      currentAmount: 7500,
      deadline: '2025-12-31',
      type: 'emergency',
    },
    {
      id: 'demo_obj_house',
      name: 'Apport immobilier',
      targetAmount: 50000,
      currentAmount: 29500,
      deadline: '2027-06-30',
      type: 'project',
    },
    {
      id: 'demo_obj_retirement',
      name: 'Portefeuille retraite',
      targetAmount: 200000,
      currentAmount: 87000,
      deadline: '2045-01-01',
      type: 'retirement',
    },
  ],
}
