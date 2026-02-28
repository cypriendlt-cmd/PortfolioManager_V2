/**
 * DCA Engine — plan vs réel, matching, discipline score, migration legacy.
 * Fonctions pures : aucun appel réseau, aucun state React.
 */

// ─── Helpers date ─────────────────────────────────────────────────────────────

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function advancePeriod(d, cadence) {
  if (cadence === 'weekly')    d.setDate(d.getDate() + 7)
  else if (cadence === 'biweekly') d.setDate(d.getDate() + 14)
  else                         d.setMonth(d.getMonth() + 1)  // monthly (défaut)
}

function toStr(d) { return d.toISOString().slice(0, 10) }

function daysBetween(a, b) {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000)
}

// ─── Normalisation identifiants ───────────────────────────────────────────────

function normId(s) { return (s || '').toUpperCase().replace(/[-\s.]/g, '') }

function tokenize(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
}

function jaccardSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = setA.size + setB.size - inter
  return union > 0 ? inter / union : 0
}

// ─── Matching plan ↔ actif portfolio ──────────────────────────────────────────

function computeMatchScore(target, asset, accountType) {
  if (!target) return { score: 0, method: null }

  // P1: ISIN exact
  if (target.isin && asset.isin && normId(target.isin) === normId(asset.isin))
    return { score: 1.0, method: 'isin_exact' }

  // P2: CoinGecko ID (crypto)
  if (accountType === 'crypto' && target.coingecko_id) {
    const cgId = asset.coingeckoId || asset.coinId || asset.id_coingecko
    if (cgId === target.coingecko_id) return { score: 0.97, method: 'coingecko_id' }
  }

  // P3: Symbol exact
  if (target.symbol && asset.symbol && normId(target.symbol) === normId(asset.symbol))
    return { score: 0.9, method: 'symbol_exact' }

  // P4: Name Jaccard
  if (target.name && asset.name) {
    const sim = jaccardSim(tokenize(target.name), tokenize(asset.name))
    if (sim >= 0.6) return { score: sim * 0.85, method: 'name_jaccard' }
  }

  return { score: 0, method: null }
}

/**
 * Retourne le meilleur actif correspondant au plan dans le portefeuille.
 * @returns {{ asset, account_type, score, method }} | null
 */
export function matchPlanToAsset(plan, portfolio) {
  const target = plan.asset_target || {}
  const candidates = []

  const check = (list, acctType) => {
    for (const asset of list || []) {
      const { score, method } = computeMatchScore(target, asset, acctType)
      if (score > 0) candidates.push({ asset, account_type: acctType, score, method })
    }
  }

  if (plan.account_type === 'crypto') {
    check(portfolio.crypto, 'crypto')
  } else {
    // pea / cto / etf / action → chercher dans pea
    check(portfolio.pea, 'pea')
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

// ─── Dates planifiées ─────────────────────────────────────────────────────────

/**
 * Génère toutes les dates passées planifiées (≤ asOfDate) + les N prochaines.
 * @returns {{ past: string[], upcoming: string[] }}
 */
export function computeScheduledDates(plan, asOfDate, futureLookAhead = 3) {
  const today  = new Date(asOfDate || new Date().toISOString().slice(0, 10))
  const start  = new Date(plan.start_date)
  const end    = plan.end_date ? new Date(plan.end_date) : null
  const dom    = plan.day_of_month || 1
  const past   = []
  const upcoming = []

  // Première occurrence dans le mois de start_date (clampé au dernier jour du mois)
  let cur = new Date(start.getFullYear(), start.getMonth(),
    Math.min(dom, getDaysInMonth(start.getFullYear(), start.getMonth())))

  // Si avant start, avancer d'une période
  if (cur < start) advancePeriod(cur, plan.cadence)

  let safety = 0
  while (safety++ < 600) {
    if (end && cur > end) break

    const dateStr = toStr(cur)
    if (cur <= today) {
      past.push(dateStr)
    } else {
      upcoming.push(dateStr)
      if (upcoming.length >= futureLookAhead) break
    }

    const next = new Date(cur)
    advancePeriod(next, plan.cadence)
    cur = next
  }

  return { past, upcoming }
}

// ─── Extraction contributions réelles ─────────────────────────────────────────

function extractContributions(plan, asset, asOfDate) {
  if (!asset) return []
  // Inclure tous les achats de l'actif jusqu'à asOfDate (pas de filtre start_date)
  return (asset.movements || [])
    .filter(m => m.type === 'buy' && m.date <= asOfDate)
    .map(m => ({
      date:   m.date,
      amount: Math.round((m.quantity * m.price + (m.fees || 0)) * 100) / 100,
      qty:    m.quantity,
      price:  m.price,
      source: 'movement',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Série mensuelle (pour graph contribution cumulées) ───────────────────────

function buildMonthlySeries(plan, contributions, asOfDate, futureLookAhead = 3) {
  const { past: pastDates, upcoming: futureDates } =
    computeScheduledDates(plan, asOfDate, futureLookAhead)

  // Contributions groupées par mois
  const contribByMonth = {}
  for (const c of contributions) {
    const m = c.date.slice(0, 7)
    contribByMonth[m] = (contribByMonth[m] || 0) + c.amount
  }

  // Contributions non encore assignées (pour matcher avec tolérance)
  const tol = plan.tolerance_days || 7
  const unmatched = [...contributions]

  const matchContrib = (dateStr) => {
    // 1) Match exact par mois
    const month = dateStr.slice(0, 7)
    if (contribByMonth[month]) return contribByMonth[month]
    // 2) Match par tolérance (jours)
    let total = 0
    for (let i = unmatched.length - 1; i >= 0; i--) {
      if (daysBetween(dateStr, unmatched[i].date) <= tol) {
        total += unmatched[i].amount
        unmatched.splice(i, 1)
      }
    }
    return total
  }

  const series = []
  let cumExpected = 0
  let cumActual   = 0

  for (const dateStr of pastDates) {
    const month = dateStr.slice(0, 7)
    const actual = matchContrib(dateStr)
    cumExpected += plan.amount_per_period
    cumActual   += actual
    series.push({
      month,
      date:           dateStr,
      expected:       plan.amount_per_period,
      actual,
      cumul_expected: Math.round(cumExpected),
      cumul_actual:   Math.round(cumActual),
      future:         false,
      on_track:       Math.abs(cumActual - cumExpected) <= plan.amount_per_period,
    })
  }

  for (const dateStr of futureDates) {
    const month = dateStr.slice(0, 7)
    // Vérifier si un versement a déjà été fait pour cette date future
    const actual = matchContrib(dateStr)
    const hasActual = actual > 0
    cumExpected += plan.amount_per_period
    if (hasActual) cumActual += actual
    series.push({
      month,
      date:           dateStr,
      expected:       plan.amount_per_period,
      actual:         hasActual ? actual : null,
      cumul_expected: Math.round(cumExpected),
      cumul_actual:   hasActual ? Math.round(cumActual) : null,
      future:         !hasActual,  // si déjà versé, ce n'est plus "futur"
      on_track:       hasActual ? Math.abs(cumActual - cumExpected) <= plan.amount_per_period : null,
    })
  }

  return series
}

// ─── Score discipline (0-100) ─────────────────────────────────────────────────

/**
 * Calcule le score de discipline d'un plan.
 * @param {Object} plan
 * @param {string[]} expectedDates — dates planifiées passées
 * @param {Array}   contributions  — contributions réelles
 * @returns {number} 0-100
 */
export function computeDisciplineScore(plan, expectedDates, contributions) {
  if (expectedDates.length === 0) return 100
  const tol = plan.tolerance_days || 7

  // 1. Régularité (40%) : % de périodes avec au moins 1 contribution dans la fenêtre
  let matched   = 0
  const usedIdx = new Set()
  for (const expDate of expectedDates) {
    for (let i = 0; i < contributions.length; i++) {
      if (usedIdx.has(i)) continue
      if (daysBetween(expDate, contributions[i].date) <= tol) {
        matched++; usedIdx.add(i); break
      }
    }
  }
  const sRegularity = (matched / expectedDates.length) * 100

  // 2. Ponctualité (30%) : délai moyen par rapport au jour prévu
  const delays = []
  const contribsCopy = [...contributions]
  for (const expDate of expectedDates) {
    const idx = contribsCopy.findIndex(c => daysBetween(expDate, c.date) <= tol)
    if (idx >= 0) {
      delays.push(daysBetween(expDate, contribsCopy[idx].date))
      contribsCopy.splice(idx, 1)
    }
  }
  const avgDelay = delays.length > 0 ? delays.reduce((s, d) => s + d, 0) / delays.length : tol
  const sPunctuality = Math.max(0, 100 - (avgDelay / tol) * 50)

  // 3. Montant (20%) : ratio réel / attendu
  const actualTotal   = contributions.reduce((s, c) => s + c.amount, 0)
  const expectedTotal = expectedDates.length * plan.amount_per_period
  const sAmount = expectedTotal > 0
    ? Math.max(0, Math.min(100, 100 - (Math.abs(actualTotal - expectedTotal) / expectedTotal) * 100))
    : 100

  // 4. Continuité (10%) : pénalité si gap > 2 périodes consécutives
  let maxGap = 0, curGap = 0
  for (const expDate of expectedDates) {
    const hasMatch = contributions.some(c => daysBetween(expDate, c.date) <= tol)
    curGap = hasMatch ? 0 : curGap + 1
    maxGap = Math.max(maxGap, curGap)
  }
  const sContinuity = maxGap >= 3 ? 0 : maxGap >= 2 ? 50 : 100

  return Math.round(sRegularity * 0.40 + sPunctuality * 0.30 + sAmount * 0.20 + sContinuity * 0.10)
}

// ─── Progression principale ───────────────────────────────────────────────────

/**
 * Calcule la progression complète d'un plan DCA.
 * @param {Object}      plan       DcaPlan
 * @param {Object|null} asset      actif portfolio (avec movements[]) ou null
 * @param {string}      [asOfDate] date de référence (défaut: aujourd'hui)
 * @returns {DcaProgress}
 */
export function computeDcaProgress(plan, asset, asOfDate) {
  const today   = asOfDate || new Date().toISOString().slice(0, 10)
  const { past: expectedDates, upcoming: upcomingDates } =
    computeScheduledDates(plan, today, 6)

  const contributions  = extractContributions(plan, asset, today)
  const tol = plan.tolerance_days || 7

  // Compter les dates passées + les dates futures déjà couvertes par un versement
  const coveredUpcoming = []
  const trueUpcoming = []
  for (const d of upcomingDates) {
    const month = d.slice(0, 7)
    const hasByMonth = contributions.some(c => c.date.startsWith(month))
    const hasByTol   = contributions.some(c => daysBetween(d, c.date) <= tol)
    if (hasByMonth || hasByTol) {
      coveredUpcoming.push(d)
    } else {
      trueUpcoming.push(d)
    }
  }

  // Dates effectives = passées + futures déjà couvertes
  const allCoveredDates = [...expectedDates, ...coveredUpcoming]
  const expected_total = allCoveredDates.length * plan.amount_per_period
  const actual_total   = contributions.reduce((s, c) => s + c.amount, 0)
  const gap            = actual_total - expected_total
  const on_track       = Math.abs(gap) <= plan.amount_per_period * 1.0

  const current_price = asset ? (asset.currentPrice ?? asset.buyPrice ?? 0) : 0
  const current_qty   = asset ? (asset.quantity ?? 0) : 0
  const current_value = current_qty * current_price
  const pnl_eur       = current_value - actual_total
  const pnl_pct       = actual_total > 0 ? (pnl_eur / actual_total) * 100 : 0

  const discipline_score = computeDisciplineScore(plan, allCoveredDates, contributions)
  const monthly_series   = buildMonthlySeries(plan, contributions, today, 3)

  // Status
  let status
  if (!plan.enabled)                    status = 'paused'
  else if (allCoveredDates.length === 0) status = 'pending'
  else if (on_track)                    status = 'on_track'
  else if (gap < 0)                     status = 'behind'
  else                             status = 'ahead'

  return {
    plan_id:              plan.plan_id,
    as_of_date:           today,
    expected_contribution: Math.round(expected_total),
    actual_contribution:   Math.round(actual_total),
    contribution_gap:      Math.round(gap),
    on_track,
    status,
    periods_expected:     allCoveredDates.length,
    periods_executed:     contributions.length,
    upcoming_dates:       trueUpcoming.slice(0, 3),
    current_value:        Math.round(current_value),
    current_qty,
    pnl_eur:              Math.round(pnl_eur),
    pnl_pct:              Math.round(pnl_pct * 10) / 10,
    discipline_score,
    contributions,
    monthly_series,
  }
}

// ─── Migration legacy dca-config.json → dca_plans.json ───────────────────────

function mapLegacyType(t) {
  if (t === 'crypto') return 'crypto'
  return 'pea'  // etf, action → pea
}

/**
 * Migre l'ancien dca-config.json vers le nouveau format.
 * Anti-doublon sur (assetName + dayOfMonth + monthlyAmount + startDate).
 * Tente un auto-link si portfolio fourni.
 *
 * @param {Object} legacy      — contenu de dca-config.json
 * @param {Object} [portfolio] — portefeuille complet pour auto-link
 * @returns {{ version: 1, plans: DcaPlan[], migrated_from_legacy: true }}
 */
export function migrateLegacyConfig(legacy, portfolio) {
  const plans = []
  const seen  = new Set()

  const makePlan = (fields) => {
    const plan = {
      plan_id:                fields.id || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label:                  fields.label || 'Plan DCA',
      enabled:                fields.enabled !== false,
      account_type:           fields.account_type || 'pea',
      asset_target: {
        isin:         fields.asset_target?.isin        || null,
        symbol:       fields.asset_target?.symbol      || null,
        name:         fields.asset_target?.name        || null,
        coingecko_id: fields.asset_target?.coingecko_id || null,
      },
      asset_link:             null,
      cadence:                fields.cadence || 'monthly',
      day_of_month:           fields.day_of_month || 1,
      amount_per_period:      fields.amount_per_period || 0,
      currency:               'EUR',
      start_date:             fields.start_date || new Date().toISOString().slice(0, 10),
      end_date:               fields.end_date || null,
      tolerance_days:         7,
      annual_return_estimate: fields.annual_return_estimate || 8,
      notes:                  '',
      created_at:             fields.created_at || new Date().toISOString(),
      migrated_from:          fields.migrated_from || null,
    }

    // Auto-link si portfolio disponible et score ≥ 0.8
    if (portfolio) {
      const match = matchPlanToAsset(plan, portfolio)
      if (match && match.score >= 0.8) {
        plan.asset_link = {
          portfolio_asset_id: match.asset.id,
          account_type:       match.account_type,
          match_method:       match.method,
          match_score:        Math.round(match.score * 100) / 100,
          auto_linked:        true,
        }
      }
    }
    return plan
  }

  // 1. Notifications (source principale — chaque notif = un plan récurrent)
  for (const n of legacy.notifications || []) {
    const key = [
      (n.assetName || '').toLowerCase().trim(),
      n.dayOfMonth, n.monthlyAmount, n.startDate,
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)

    plans.push(makePlan({
      id:                     n.id,
      label:                  n.assetName || 'Plan DCA',
      enabled:                n.active !== false,
      account_type:           mapLegacyType(n.assetType),
      asset_target:           { name: n.assetName },
      day_of_month:           n.dayOfMonth || 1,
      amount_per_period:      n.monthlyAmount || 0,
      start_date:             n.startDate,
      end_date:               n.endDate || null,
      annual_return_estimate: n.annualReturn ?? 8,
      created_at:             n.createdAt,
      migrated_from:          n.id,
    }))
  }

  // 2. Simulation principale → plan uniquement si non déjà couvert
  for (const sim of legacy.simulations || []) {
    if (!sim.assetName) continue
    const key = [
      (sim.assetName || '').toLowerCase().trim(),
      1, sim.monthlyAmount, sim.startDate,
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)

    plans.push(makePlan({
      id:                     `sim_${sim.id || Date.now()}`,
      label:                  sim.assetName,
      enabled:                true,
      account_type:           mapLegacyType(sim.assetType),
      asset_target:           { name: sim.assetName },
      day_of_month:           1,
      amount_per_period:      sim.monthlyAmount || 0,
      start_date:             sim.startDate || new Date().toISOString().slice(0, 10),
      end_date:               null,
      annual_return_estimate: sim.annualReturn ?? 8,
      created_at:             new Date().toISOString(),
      migrated_from:          `simulation_${sim.id}`,
    }))
  }

  return { version: 1, plans, migrated_from_legacy: true }
}

// ─── Résumé mensuel global ────────────────────────────────────────────────────

/**
 * Synthèse DCA pour un mois donné (ex: "2026-02").
 * Utilisé dans CoachTab / Dashboard.
 */
export function getMonthlyDcaSummary(plans, portfolio, month) {
  // Fin du mois demandé pour inclure les dates planifiées pas encore passées
  const monthEnd = month + '-31'
  let planned_total = 0, actual_total = 0
  const details = []

  for (const plan of plans) {
    if (!plan.enabled) continue

    // Vérifier si ce plan a une date planifiée dans ce mois (passée OU future)
    const { past, upcoming } = computeScheduledDates(plan, monthEnd, 3)
    const allDates = [...past, ...upcoming]
    const hasPeriod = allDates.some(d => d.startsWith(month))
    if (!hasPeriod) continue

    planned_total += plan.amount_per_period

    // Trouver l'actif lié
    const linkedAsset = getLinkedAsset(plan, portfolio)
    const contribs = linkedAsset
      ? (linkedAsset.movements || [])
          .filter(m => m.type === 'buy' && m.date.startsWith(month))
          .reduce((s, m) => s + m.quantity * m.price + (m.fees || 0), 0)
      : 0
    actual_total += contribs

    details.push({
      plan_id: plan.plan_id,
      label:   plan.label,
      planned: plan.amount_per_period,
      actual:  Math.round(contribs),
      on_track: contribs >= plan.amount_per_period * 0.9,
    })
  }

  return {
    month,
    planned_total: Math.round(planned_total),
    actual_total:  Math.round(actual_total),
    gap:           Math.round(actual_total - planned_total),
    details,
  }
}

// ─── Série étendue (pour graph avec sélecteur d'échelle) ──────────────────────

/**
 * Construit une série mensuelle complète : passé réel + N mois futurs planifiés.
 * Utilisé pour le graph avec sélecteur d'échelle temporelle.
 *
 * @param {Object}      plan
 * @param {Object|null} asset          actif portfolio (avec movements[])
 * @param {string}      asOfDate       date de référence
 * @param {number}      futureLookAhead nombre de mois futurs à projeter
 * @returns {Array} monthly_series avec cumul_expected et cumul_actual
 */
export function computeExtendedSeries(plan, asset, asOfDate, futureLookAhead = 24) {
  const today = asOfDate || new Date().toISOString().slice(0, 10)
  const contributions = extractContributions(plan, asset, today)
  return buildMonthlySeries(plan, contributions, today, futureLookAhead)
}

/**
 * Calcule le nombre de mois futurs à projeter selon le sélecteur et l'end_date du plan.
 * @param {'6M'|'1Y'|'2Y'|'5Y'|'Max'} rangeKey
 * @param {string|null} endDate  plan.end_date
 * @returns {number}
 */
export function futureLookAheadForRange(rangeKey, endDate) {
  if (rangeKey === 'Max') {
    if (endDate) {
      const ms  = new Date(endDate).getTime() - Date.now()
      const mth = Math.round(ms / (30.44 * 86_400_000))
      return Math.max(1, mth)
    }
    return 60  // 5 ans par défaut
  }
  const map = { '6M': 6, '1Y': 12, '2Y': 24, '5Y': 60 }
  return map[rangeKey] ?? 24
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Récupère l'actif portfolio lié à un plan.
 * 1) Cherche par portfolio_asset_id exact
 * 2) Fallback : match par ISIN, coingecko_id, symbol ou nom
 * Retourne { asset, needsRelink: boolean } ou null
 */
export function getLinkedAsset(plan, portfolio) {
  if (!plan.asset_link) return null
  const { portfolio_asset_id, account_type } = plan.asset_link
  const list = account_type === 'crypto' ? portfolio.crypto : portfolio.pea

  // 1) Match exact par id
  const exact = (list || []).find(a => a.id === portfolio_asset_id)
  if (exact) return exact

  // 2) Fallback : chercher par propriétés de l'asset_target
  const target = plan.asset_target
  if (!target) return null

  for (const asset of list || []) {
    if (target.isin && asset.isin && normId(target.isin) === normId(asset.isin)) return asset
    if (target.coingecko_id && (asset.coingeckoId || asset.coinId || asset.id_coingecko) === target.coingecko_id) return asset
    if (target.symbol && asset.symbol && normId(target.symbol) === normId(asset.symbol)) return asset
    if (target.name && asset.name && normId(target.name) === normId(asset.name)) return asset
  }

  return null
}

/** Formate une date YYYY-MM-DD en "5 mars 2026". */
export function fmtScheduledDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Formate une date YYYY-MM-DD en "5 mars". */
export function fmtShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short',
  })
}
