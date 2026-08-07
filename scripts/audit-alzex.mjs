import fs from 'node:fs'

const filePath = process.argv[2]
if (!filePath) throw new Error('Usage: node scripts/audit-alzex.mjs /path/to/Alzex.csv')

function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === delimiter && !quoted) {
      row.push(field); field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += character
  }
  row.push(field)
  if (row.some(Boolean)) rows.push(row)
  return rows
}

const rows = parseDelimited(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''), '\t')
const headers = rows[0]
const data = rows.slice(1)
const at = (name) => headers.indexOf(name)
const required = ['Description', 'Date', 'Amount', 'Withdraw amount', 'Target Amount', 'Withdraw account', 'Target account', 'Category', 'Status', 'Unique ID']
if (required.some((name) => at(name) < 0)) throw new Error('Unsupported Alzex export headers.')

const balances = new Map()
const add = (account, amount) => balances.set(account, (balances.get(account) ?? 0) + amount)
const accounts = new Set()
let cleared = 0
let pending = 0
let transfers = 0

for (const row of data) {
  const withdrawAccount = row[at('Withdraw account')]?.trim()
  const targetAccount = row[at('Target account')]?.trim()
  if (withdrawAccount) accounts.add(withdrawAccount)
  if (targetAccount) accounts.add(targetAccount)
  if (row[at('Status')]?.trim() !== 'C') { pending += 1; continue }
  cleared += 1
  const amount = Number(row[at('Amount')])
  const withdrawAmount = Number(row[at('Withdraw amount')] || 0)
  const targetAmount = Number(row[at('Target Amount')] || 0)
  if (withdrawAccount && targetAccount && withdrawAccount !== targetAccount) {
    transfers += 1
    add(withdrawAccount, -Math.abs(withdrawAmount))
    add(targetAccount, Math.abs(targetAmount))
  } else if (withdrawAccount) add(withdrawAccount, -Math.abs(withdrawAmount || amount))
  else if (targetAccount) add(targetAccount, Math.abs(targetAmount || amount))
}

const inactive = new Set(['Julia CW', 'Staging - Hub'])
const activeTotal = [...balances.entries()]
  .filter(([account]) => !inactive.has(account))
  .reduce((sum, [, balance]) => sum + balance, 0)

console.log(JSON.stringify({
  file: filePath,
  rows: data.length,
  cleared,
  pending,
  transfers,
  accounts: [...accounts].sort(),
  clearedBalances: Object.fromEntries([...balances].sort().map(([account, balance]) => [account, Number(balance.toFixed(2))])),
  activeTotal: Number(activeTotal.toFixed(2)),
}, null, 2))
