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
const components = new Map()
const add = (account, amount) => balances.set(account, (balances.get(account) ?? 0) + amount)
const addComponent = (account, component, amount) => {
  const current = components.get(account) ?? { initial: 0, normal: 0, outgoing: 0, incoming: 0 }
  current[component] += amount
  components.set(account, current)
}
const accounts = new Set()
let cleared = 0
let pending = 0
let transfers = 0
const amountMismatches = []

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
  const isOpening = row[at('Description')]?.trim() === 'Opening balance'
  if (withdrawAccount && targetAccount && withdrawAccount !== targetAccount) {
    transfers += 1
    add(withdrawAccount, -Math.abs(withdrawAmount))
    add(targetAccount, Math.abs(targetAmount))
    addComponent(withdrawAccount, 'outgoing', Math.abs(withdrawAmount))
    addComponent(targetAccount, 'incoming', Math.abs(targetAmount))
  } else if (withdrawAccount) {
    const ledgerAmount = -Math.abs(withdrawAmount || amount)
    add(withdrawAccount, ledgerAmount)
    addComponent(withdrawAccount, isOpening ? 'initial' : 'normal', ledgerAmount)
    if (!isOpening && Math.abs(ledgerAmount - amount) > 0.004) amountMismatches.push({ id: row[at('Unique ID')], account: withdrawAccount, amount, ledgerAmount })
  } else if (targetAccount) {
    const ledgerAmount = Math.abs(targetAmount || amount)
    add(targetAccount, ledgerAmount)
    addComponent(targetAccount, isOpening ? 'initial' : 'normal', ledgerAmount)
    if (!isOpening && Math.abs(ledgerAmount - amount) > 0.004) amountMismatches.push({ id: row[at('Unique ID')], account: targetAccount, amount, ledgerAmount })
  }
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
  blankDescriptions: data.filter((row) => !row[at('Description')]?.trim()).length,
  importableClearedRows: cleared - data.filter((row) => row[at('Description')]?.trim() === 'Opening balance' && row[at('Status')]?.trim() === 'C').length,
  transfers,
  directionalSignCorrections: {
    count: amountMismatches.length,
    byAccount: Object.fromEntries([...new Set(amountMismatches.map((item) => item.account))].sort().map((account) => [
      account,
      Number(amountMismatches.filter((item) => item.account === account).reduce((sum, item) => sum + item.ledgerAmount - item.amount, 0).toFixed(2)),
    ])),
  },
  accounts: [...accounts].sort(),
  clearedBalances: Object.fromEntries([...balances].sort().map(([account, balance]) => [account, Number(balance.toFixed(2))])),
  components: Object.fromEntries([...components].sort().map(([account, values]) => [account,
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value.toFixed(2))]))
  ])),
  activeTotal: Number(activeTotal.toFixed(2)),
}, null, 2))
