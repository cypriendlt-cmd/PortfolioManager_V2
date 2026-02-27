/**
 * bankEngine.js — Thin facade that re-exports from bankTaxonomy.
 * ALL heavy computation (categorization, transfer detection, aggregation)
 * is now handled by the Web Worker via bankWorkerBridge.
 *
 * This file keeps backward-compatible exports for code that still imports from here.
 */

import { CATEGORIES, TAXONOMY } from './bankTaxonomy'

// ─── Backward-compatible DEFAULT_RULES (used by worker, kept here for reference) ───
const DEFAULT_RULES = [
  { id: 'r_virement', pattern: 'VIR(EMENT)?\\b|SEPA', category: 'virement', priority: 10 },
  { id: 'r_loyer', pattern: 'LOYER|BAILLEUR|FONCIER', category: 'loyer', priority: 20 },
  { id: 'r_alimentation', pattern: 'CARREFOUR|LECLERC|LIDL|ALDI|MONOPRIX|INTERMARCHE|PICARD|AUCHAN|FRANPRIX|CASINO|SUPERMARCHE|BOULANGERIE', category: 'alimentation', priority: 30 },
  { id: 'r_transport', pattern: 'SNCF|RATP|NAVIGO|UBER|BOLT|TAXI|ESSENCE|TOTAL ENERGIES|SHELL|BP\\b|PARKING|AUTOROUTE|PEAGE', category: 'transport', priority: 30 },
  { id: 'r_abonnements', pattern: 'NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL|AMAZON PRIME|APPLE\\.COM|GOOGLE STORAGE|ICLOUD|FREE MOBILE|SFR|BOUYGUES|ORANGE|SOSH', category: 'abonnements', priority: 40 },
  { id: 'r_achats', pattern: 'AMAZON|FNAC|DARTY|CDISCOUNT|ZALANDO|SHEIN|ALIEXPRESS|PAYPAL', category: 'achats', priority: 50 },
  { id: 'r_restauration', pattern: 'RESTAURANT|BRASSERIE|DELIVEROO|UBER EATS|JUST EAT|MCDO|MCDONALD|BURGER KING|KFC|DOMINO|SUSHI', category: 'restauration', priority: 30 },
  { id: 'r_frais', pattern: 'FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS|INTER[EÊ]TS D[EÉ]BITEURS', category: 'frais_bancaires', priority: 60 },
  { id: 'r_sante', pattern: 'PHARMACIE|DOCTOLIB|MEDECIN|MUTUELLE|CPAM|AMELI', category: 'sante', priority: 30 },
  { id: 'r_loisirs', pattern: 'CINEMA|THEATRE|CONCERT|SPORT|FITNESS|BASIC FIT|GYM', category: 'loisirs', priority: 30 },
  { id: 'r_epargne', pattern: 'EPARGNE|LIVRET|PLACEMENT|ASSURANCE VIE', category: 'epargne', priority: 15 },
  { id: 'r_revenus', pattern: 'SALAIRE|PAIE|REMUNERATION|CAF|ALLOCATION|POLE EMPLOI|FRANCE TRAVAIL|INDEMNIT', category: 'revenus', priority: 20 },
  { id: 'r_impots', pattern: 'IMPOT|TRESOR PUBLIC|DGFIP|TAXE|URSSAF|CSG|PRELEVEMENT.{0,5}SOURCE', category: 'impots', priority: 25 },
]

// ─── Lightweight helpers still needed on main thread ───

export function deduplicateTransactions(existing, incoming) {
  const existingHashes = new Set(existing.map(t => t.hash))
  const newTxs = incoming.filter(t => !existingHashes.has(t.hash))
  return { merged: [...existing, ...newTxs], newCount: newTxs.length, dupCount: incoming.length - newTxs.length }
}

// Simple categorize for immediate feedback (single tx) — worker handles bulk
export function categorize(tx, customRules = []) {
  if (tx.isTransfer) return 'virement'
  if (tx.amount > 0) return 'revenus'
  const allRules = [...customRules, ...DEFAULT_RULES].sort((a, b) => a.priority - b.priority)
  const normalized = tx.label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const rule of allRules) {
    try {
      if (new RegExp(rule.pattern, 'i').test(normalized)) return rule.category
    } catch { /* invalid regex */ }
  }
  return 'autre'
}

// Kept for backward compat but BankContext should use worker instead
export function categorizeAll(transactions, customRules = []) {
  return transactions.map(tx => ({ ...tx, category: categorize(tx, customRules) }))
}

// Lightweight stubs — real computation is in worker
export function detectTransfers(transactions) { return transactions }
export function computeMonthlyAggregates() { return [] }
export function computeHealthScore() { return 50 }
export function generateCoachInsights() { return null }

export { CATEGORIES, TAXONOMY, DEFAULT_RULES }
