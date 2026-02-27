/**
 * Extended FR taxonomy with subcategories.
 * Single source of truth for categories across the app.
 */

export const TAXONOMY = {
  revenus:        { label: 'Revenus',        color: '#22c55e', subcategories: ['salaire', 'allocations', 'remboursements', 'revenus_locatifs', 'revenus_divers'] },
  loyer:          { label: 'Loyer',          color: '#ef4444', subcategories: ['loyer', 'charges', 'assurance_habitation', 'travaux'] },
  alimentation:   { label: 'Alimentation',   color: '#f97316', subcategories: ['supermarche', 'boulangerie', 'marche', 'bio'] },
  transport:      { label: 'Transport',      color: '#3b82f6', subcategories: ['carburant', 'transport_commun', 'vtc', 'peage', 'parking', 'entretien_auto'] },
  abonnements:    { label: 'Abonnements',    color: '#8b5cf6', subcategories: ['streaming', 'telecom', 'cloud', 'presse', 'box_internet'] },
  achats:         { label: 'Achats',         color: '#ec4899', subcategories: ['ecommerce', 'electromenager', 'habillement', 'ameublement'] },
  restauration:   { label: 'Restauration',   color: '#f59e0b', subcategories: ['restaurant', 'livraison', 'fast_food'] },
  sante:          { label: 'Santé',          color: '#14b8a6', subcategories: ['pharmacie', 'medecin', 'mutuelle', 'cpam'] },
  loisirs:        { label: 'Loisirs',        color: '#eab308', subcategories: ['sport', 'culture', 'voyages', 'sorties'] },
  frais_bancaires:{ label: 'Frais bancaires',color: '#dc2626', subcategories: ['cotisation', 'agios', 'commission', 'tenue_compte'] },
  epargne:        { label: 'Épargne',        color: '#10b981', subcategories: ['livret', 'assurance_vie', 'placement'] },
  impots:         { label: 'Impôts & Taxes', color: '#7c3aed', subcategories: ['impot_revenu', 'taxe_habitation', 'taxe_fonciere', 'csg', 'urssaf'] },
  virement:       { label: 'Virement',       color: '#6b7280', subcategories: ['interne', 'externe'] },
  autre:          { label: 'Autre',          color: '#94a3b8', subcategories: [] },
}

/** Backward-compatible flat array */
export const CATEGORIES = Object.entries(TAXONOMY).map(([id, { label, color }]) => ({ id, label, color }))
