#!/usr/bin/env node
/**
 * generate-manifest.mjs
 *
 * Scans a month folder in frontend/public/data/analyses/YYYY-MM/
 * and generates (or regenerates) the manifest.json from all analysis_*.json files.
 *
 * Usage:
 *   node scripts/generate-manifest.mjs 2026-03
 *   node scripts/generate-manifest.mjs              # defaults to current month
 */

import { readdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

const BASE = resolve('frontend/public/data/analyses')

const month = process.argv[2] || (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

const dir = join(BASE, month)

async function main() {
  let files
  try {
    files = (await readdir(dir)).filter(f => f.startsWith('analysis_') && f.endsWith('.json'))
  } catch {
    console.error(`Dossier introuvable : ${dir}`)
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`Aucun fichier analysis_*.json trouvé dans ${dir}`)
    process.exit(1)
  }

  console.log(`${files.length} fichier(s) trouvé(s) dans ${month}/\n`)

  const analyses = []

  for (const file of files.sort()) {
    const raw = await readFile(join(dir, file), 'utf-8')
    const data = JSON.parse(raw)

    if (!data.profile) {
      console.warn(`  ⚠ ${file} : pas de champ "profile", ignoré`)
      continue
    }

    analyses.push({
      file,
      profile: {
        riskTolerance:    data.profile.riskTolerance    || 'moderate',
        investmentAmount: data.profile.investmentAmount ?? data.profile.amount ?? 1000,
        horizon:          data.profile.horizon           || 'medium',
        style:            data.profile.style             || 'blend',
        preferredSectors: data.profile.preferredSectors ?? data.profile.sectors ?? ['diversified'],
        geography:        data.profile.geography         || 'global',
        esg:              data.profile.esg               || 'none',
      },
    })

    console.log(`  ✓ ${file}  →  ${data.profile.riskTolerance} / ${data.profile.style} / ${data.profile.investmentAmount}€`)
  }

  const manifest = {
    month,
    generatedAt: new Date().toISOString(),
    analyses,
  }

  const outPath = join(dir, 'manifest.json')
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

  console.log(`\n✅ manifest.json généré avec ${analyses.length} analyses → ${outPath}`)

  // Also update the root index.json
  const indexPath = join(BASE, 'index.json')
  let index
  try {
    index = JSON.parse(await readFile(indexPath, 'utf-8'))
  } catch {
    index = { months: [], latest: '' }
  }

  if (!index.months.includes(month)) {
    index.months.push(month)
    index.months.sort().reverse()
  }
  index.latest = index.months[0]

  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8')
  console.log(`✅ index.json mis à jour (${index.months.length} mois, latest: ${index.latest})`)
}

main().catch(err => { console.error(err); process.exit(1) })
