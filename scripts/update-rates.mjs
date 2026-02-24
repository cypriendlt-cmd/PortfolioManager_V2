#!/usr/bin/env node
/**
 * update-rates.mjs
 * Scrapes official French government pages (service-public.gouv.fr) to get
 * current regulated savings account rates, then updates rateProvider.js.
 *
 * Run manually: node scripts/update-rates.mjs
 * Or via GitHub Action on Feb 1 and Aug 1.
 */

import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RATE_PROVIDER_PATH = path.join(__dirname, '..', 'frontend', 'src', 'services', 'rateProvider.js')

// service-public.gouv.fr pages with rates
const SOURCES = {
  'livret-a': 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2365',
  'ldds': 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2368',
  'lep': 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2367',
  'cel': 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16136',
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioManager-RateBot/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve, reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

/**
 * Extract rate from page HTML.
 * Uses type-specific patterns first, then generic ones.
 * Avoids false positives (loan rates, prime rates, etc.)
 */
function extractRate(html, type) {
  // Clean HTML tags for easier regex
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

  // Type-specific primary patterns (most reliable)
  const typePatterns = {
    'livret-a': [
      /taux\s+d['']int[eé]r[eê]t\s+annuel\s+du\s+livret\s*A[^%]*?(\d+[,.]?\d*)\s*%/i,
    ],
    'ldds': [
      /taux\s+d['']int[eé]r[eê]t\s+(?:annuel\s+)?du\s+LDDS[^%]*?(\d+[,.]?\d*)\s*%/i,
    ],
    'lep': [
      /taux\s+d['']int[eé]r[eê]t\s+(?:annuel\s+)?du\s+LEP[^%]*?(\d+[,.]?\d*)\s*%/i,
      /taux\s+du\s+LEP[^%]*?(\d+[,.]?\d*)\s*%/i,
    ],
    'cel': [
      /taux\s+d['']int[eé]r[eê]t\s+du\s+CEL[^%]*?est\s+de\s+(\d+[,.]?\d*)\s*%/i,
      /taux\s+d['']int[eé]r[eê]t\s+du\s+CEL,?\s*(?:hors\s+prime[^,]*,?\s*)?est\s+de\s+(\d+[,.]?\d*)\s*%/i,
    ],
  }

  // Try type-specific patterns first
  const specific = typePatterns[type] || []
  for (const pat of specific) {
    const m = text.match(pat)
    if (m) {
      const rate = parseFloat(m[1].replace(',', '.'))
      if (rate > 0 && rate < 20) return rate
    }
  }

  // Generic patterns (ordered from most specific to least)
  const genericPatterns = [
    /taux\s+d['']int[eé]r[eê]t\s+annuel[^%]{0,40}?est\s+de\s+(\d+[,.]?\d*)\s*%/i,
    /r[eé]mun[eé]r[eé]\s+au\s+taux\s+de\s+(\d+[,.]?\d*)\s*%/i,
    /taux\s+de\s+r[eé]mun[eé]ration[^%]{0,40}?(\d+[,.]?\d*)\s*%/i,
    /taux\s+d['']int[eé]r[eê]t[^%]{0,30}?est\s+de\s+(\d+[,.]?\d*)\s*%/i,
  ]

  for (const pat of genericPatterns) {
    const m = text.match(pat)
    if (m) {
      const rate = parseFloat(m[1].replace(',', '.'))
      if (rate > 0 && rate < 20) return rate
    }
  }
  return null
}

function getEffectiveDate() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  // Rates change on Feb 1 and Aug 1
  if (month >= 8) return `${year}-08-01`
  if (month >= 2) return `${year}-02-01`
  return `${year - 1}-08-01`
}

function readCurrentRateProvider() {
  return fs.readFileSync(RATE_PROVIDER_PATH, 'utf8')
}

function getLastRateEntry(content, type) {
  // Find the last { rate: X.X, from: 'YYYY-MM-DD' } for this type
  const typeRegex = new RegExp(`'${type}':\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const match = content.match(typeRegex)
  if (!match) return null
  const entries = [...match[1].matchAll(/\{\s*rate:\s*([\d.]+),\s*from:\s*'([\d-]+)'\s*\}/g)]
  if (entries.length === 0) return null
  const last = entries[entries.length - 1]
  return { rate: parseFloat(last[1]), from: last[2] }
}

function addRateEntry(content, type, rate, effectiveDate) {
  const typeRegex = new RegExp(`('${type}':\\s*\\[)([\\s\\S]*?)(\\s*\\])`, 'm')
  const match = content.match(typeRegex)
  if (!match) return content

  const newEntry = `    { rate: ${rate}, from: '${effectiveDate}' },`
  const existingEntries = match[2].trimEnd()
  const updated = `${match[1]}${existingEntries}\n${newEntry}${match[3]}`
  return content.replace(typeRegex, updated)
}

async function main() {
  console.log('=== Livret Rate Updater ===')
  console.log(`Effective date: ${getEffectiveDate()}\n`)

  let content = readCurrentRateProvider()
  const effectiveDate = getEffectiveDate()
  const updates = []

  for (const [type, url] of Object.entries(SOURCES)) {
    process.stdout.write(`Fetching ${type}... `)
    try {
      const html = await fetchPage(url)
      const rate = extractRate(html, type)
      if (rate === null) {
        console.log('SKIP (could not extract rate)')
        continue
      }

      const lastEntry = getLastRateEntry(content, type)
      console.log(`scraped=${rate}% | current=${lastEntry?.rate}% (${lastEntry?.from})`)

      if (lastEntry && lastEntry.from === effectiveDate) {
        if (lastEntry.rate === rate) {
          console.log(`  → Already up to date`)
        } else {
          console.log(`  → RATE CHANGED: ${lastEntry.rate}% → ${rate}%`)
          // Replace existing entry for this date
          content = content.replace(
            new RegExp(`(\\{\\s*rate:\\s*)${lastEntry.rate}(,\\s*from:\\s*'${effectiveDate}'\\s*\\})`),
            `$1${rate}$2`
          )
          updates.push({ type, oldRate: lastEntry.rate, newRate: rate, from: effectiveDate })
        }
      } else if (!lastEntry || lastEntry.rate !== rate) {
        console.log(`  → NEW RATE: ${rate}% from ${effectiveDate}`)
        content = addRateEntry(content, type, rate, effectiveDate)
        updates.push({ type, oldRate: lastEntry?.rate, newRate: rate, from: effectiveDate })
      } else {
        console.log(`  → Same rate, no new period needed`)
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
  }

  // LDDS always follows Livret A
  const livretALast = getLastRateEntry(content, 'livret-a')
  const lddsLast = getLastRateEntry(content, 'ldds')
  if (livretALast && lddsLast && (lddsLast.from !== livretALast.from || lddsLast.rate !== livretALast.rate)) {
    console.log(`\nSyncing LDDS with Livret A: ${livretALast.rate}% from ${livretALast.from}`)
    if (lddsLast.from === livretALast.from) {
      content = content.replace(
        new RegExp(`('ldds'[\\s\\S]*?\\{\\s*rate:\\s*)${lddsLast.rate}(,\\s*from:\\s*'${livretALast.from}'\\s*\\})`),
        `$1${livretALast.rate}$2`
      )
    } else {
      content = addRateEntry(content, 'ldds', livretALast.rate, livretALast.from)
    }
    updates.push({ type: 'ldds', oldRate: lddsLast.rate, newRate: livretALast.rate, from: livretALast.from })
  }

  if (updates.length > 0) {
    fs.writeFileSync(RATE_PROVIDER_PATH, content)
    console.log(`\n✅ Updated rateProvider.js with ${updates.length} rate change(s)`)
    console.log(JSON.stringify(updates, null, 2))
  } else {
    console.log('\n✅ All rates are up to date, no changes needed')
  }

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const hasUpdates = updates.length > 0 ? 'true' : 'false'
    const summary = updates.map(u => `${u.type}: ${u.oldRate || '?'}% → ${u.newRate}%`).join(', ')
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_updates=${hasUpdates}\n`)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
