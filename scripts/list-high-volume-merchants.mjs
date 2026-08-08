import fs from 'node:fs'

const filePath = process.argv[2]
const threshold = Number(process.argv[3] ?? 50)
if (!filePath) throw new Error('Usage: node scripts/list-high-volume-merchants.mjs /path/to/Alzex.csv [threshold]')

function parseDelimited(text, delimiter) {
  const rows = []; let row = []; let field = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1 } else quoted = !quoted
    } else if (character === delimiter && !quoted) { row.push(field); field = '' }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''
    } else field += character
  }
  row.push(field); if (row.some(Boolean)) rows.push(row)
  return rows
}

const noise = new Set(['australia', 'aus', 'au', 'bpay', 'card', 'debit', 'date', 'eftpos', 'netbank', 'payment', 'purchase', 'qld', 'transfer', 'value', 'visa'])
function displayName(description) {
  return description.replace(/\bvalue\s+date:\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*$/i, '').replace(/\b(?:aus\s+)?card\s+x{1,2}\d+.*$/i, '').replace(/\bnetbank\s+(?:bpay|transfer).*$/i, '').replace(/\b(?:ref|reference)[:\s-]*[a-z0-9-]{6,}.*$/i, '').replace(/\b\d{8,}\b/g, '').replace(/^([a-z][a-z&'*.-]+)\s+\d{3,6}\s+/i, '$1 ').replace(/\s+(?:AU|AUS)$/i, '').replace(/^\s*(?:EFTPOS|DEBIT CARD PURCHASE|CARD PURCHASE)\s+/i, '').replace(/\s+/g, ' ').trim()
}
function key(description) {
  return displayName(description).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(word => word.length > 1 && !noise.has(word)).join(' ').trim()
}

const rows = parseDelimited(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''), '\t')
const headers = rows[0]; const at = name => headers.indexOf(name)
const groups = new Map()
for (const row of rows.slice(1)) {
  if (row[at('Status')]?.trim() !== 'C' || row[at('Description')]?.trim() === 'Opening balance') continue
  const withdraw = row[at('Withdraw account')]?.trim(); const target = row[at('Target account')]?.trim()
  if (withdraw && target && withdraw !== target) continue
  const description = row[at('Description')]?.trim()
  if (!description) continue
  const merchantKey = key(description)
  if (!merchantKey) continue
  const current = groups.get(merchantKey) ?? { name: displayName(description), count: 0 }
  current.count += 1; current.name = displayName(description); groups.set(merchantKey, current)
}

console.log(JSON.stringify([...groups.entries()].map(([merchantKey, value]) => ({ key: merchantKey, ...value })).filter(value => value.count > threshold).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)), null, 2))
