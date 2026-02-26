import * as XLSX from 'xlsx'

/**
 * Parse sheet name convention: ACC__TYPE__ALIAS
 * e.g. "ACC__COURANT__BoursoBank" or "ACC__LIVRET__LivretA"
 */
export function parseSheetName(name) {
  const parts = name.split('__')
  if (parts.length !== 3 || parts[0].toUpperCase() !== 'ACC') {
    return { valid: false, error: `Format invalide: "${name}". Attendu: ACC__TYPE__ALIAS` }
  }
  return { valid: true, type: parts[1].toLowerCase(), alias: parts[2] }
}

/**
 * Detect the header row containing Date + Débit/Crédit or Montant columns.
 * Scans rows 0-20, case-insensitive, accent-tolerant.
 */
export function detectHeaderRow(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const maxRow = Math.min(range.e.r, 20)

  for (let r = range.s.r; r <= maxRow; r++) {
    const cells = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      cells.push(cell ? String(cell.v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
    }
    const row = cells.join(' ')
    const hasDate = /\bdate\b/.test(row)
    const hasAmount = /\bdebit\b/.test(row) || /\bcredit\b/.test(row) || /\bmontant\b/.test(row)
    if (hasDate && hasAmount) return r
  }
  return -1
}

/**
 * Normalize transactions from a sheet starting at headerRow.
 */
export function normalizeTransactions(sheet, headerRow, accountId) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = rows[headerRow].map(h =>
    String(h).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  )

  const dateCol = headers.findIndex(h => /\bdate\b/.test(h))
  const labelCol = headers.findIndex(h => /\blibelle\b|\blabel\b|\bdescription\b|\bintitule\b/.test(h))
  const debitCol = headers.findIndex(h => /\bdebit\b/.test(h))
  const creditCol = headers.findIndex(h => /\bcredit\b/.test(h))
  const amountCol = headers.findIndex(h => /\bmontant\b|\bamount\b/.test(h))

  const transactions = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[dateCol]) continue

    const rawDate = row[dateCol]
    const date = parseDate(rawDate)
    if (!date) continue

    const label = String(row[labelCol >= 0 ? labelCol : dateCol + 1] || '').trim()
    if (!label) continue

    let amount = 0
    if (amountCol >= 0) {
      amount = parseNumber(row[amountCol])
    } else {
      const debit = debitCol >= 0 ? parseNumber(row[debitCol]) : 0
      const credit = creditCol >= 0 ? parseNumber(row[creditCol]) : 0
      amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : 0
    }
    if (amount === 0) continue

    transactions.push({ accountId, date, label, amount })
  }
  return transactions
}

function parseDate(raw) {
  if (typeof raw === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  return null
}

function parseNumber(val) {
  if (typeof val === 'number') return val
  const s = String(val).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/**
 * Compute SHA-256 hash for deduplication.
 */
export async function computeHash(date, amount, label, accountId) {
  const data = `${date}|${amount.toFixed(2)}|${label}|${accountId}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Parse an entire Excel ArrayBuffer into accounts and transactions.
 */
export async function parseExcelBuffer(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const accounts = []
  const transactions = []
  const errors = []

  for (const name of wb.SheetNames) {
    const parsed = parseSheetName(name)
    if (!parsed.valid) {
      errors.push(parsed.error)
      continue
    }

    const accountId = `${parsed.type}__${parsed.alias}`
    accounts.push({ id: accountId, type: parsed.type, alias: parsed.alias, initialBalance: 0, lastBalanceDate: null })

    const sheet = wb.Sheets[name]
    const headerRow = detectHeaderRow(sheet)
    if (headerRow < 0) {
      errors.push(`Feuille "${name}": impossible de détecter les en-têtes (Date + Débit/Crédit)`)
      continue
    }

    const txs = normalizeTransactions(sheet, headerRow, accountId)
    for (const tx of txs) {
      const hash = await computeHash(tx.date, tx.amount, tx.label, tx.accountId)
      transactions.push({
        hash,
        accountId: tx.accountId,
        date: tx.date,
        label: tx.label,
        amount: tx.amount,
        category: 'autre',
        isTransfer: false,
        transferPairHash: null,
        importedAt: new Date().toISOString(),
      })
    }
  }

  return { accounts, transactions, errors }
}
