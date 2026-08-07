import { supabase } from './lib/supabase'
import type {
  Account,
  Budget,
  Category,
  ImportResult,
  MonthSummary,
  ScheduledTransaction,
  Transaction,
  TransactionFilter,
} from './types/finance'
import { parseBankExport } from './lib/importers'
import { normalizeDescription, suggestCategories } from './lib/matching'
import { parseDelimited } from './lib/csv'

const pickedFiles = new Map<string, { name: string; text: string }>()

async function pickCsv(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,text/csv,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const token = crypto.randomUUID()
      pickedFiles.set(token, { name: file.name, text: await file.text() })
      resolve(token)
    }
    input.click()
  })
}

async function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, text: await file.text() } : null)
    }
    input.click()
  })
}

function alzexDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!match) return value
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

async function importAlzex(): Promise<ImportResult | null> {
  const file = await pickTextFile('.csv,text/csv,text/plain')
  if (!file) return null
  const rows = parseDelimited(file.text.replace(/^\uFEFF/, ''), '\t')
  const headers = rows[0] ?? []
  const at = (name: string) => headers.indexOf(name)
  const required = ['Description', 'Date', 'Amount', 'Account', 'Category']
  if (required.some(name => at(name) < 0)) throw new Error('This is not a supported Alzex export.')
  const owner = await ownerId()
  const dataRows = rows.slice(1).filter(row => row[at('Description')]?.trim())
  const accountColumns = [at('Account'), at('Withdraw account'), at('Target account')].filter(index => index >= 0)
  const accountNames = [...new Set(dataRows.flatMap(row => accountColumns.flatMap(index => (row[index] ?? '').split(':')).map(name => name.trim()).filter(Boolean)))]
  const existingAccounts = await supabase.from('accounts').select('id,name')
  fail(existingAccounts.error)
  const existingAccountNames = new Set((existingAccounts.data ?? []).map(row => row.name))
  const missingAccounts = accountNames.filter(name => !existingAccountNames.has(name))
  if (missingAccounts.length) {
    const { error } = await supabase.from('accounts').insert(missingAccounts.map((name, index) => ({ owner_id: owner, name, institution: 'Alzex', currency: 'AUD', display_order: existingAccountNames.size + index })))
    fail(error)
  }
  const categoryPaths = [...new Set(dataRows.map(row => row[at('Category')]?.trim()).filter(Boolean))]
  const existingCategories = await supabase.from('categories').select('id,path')
  fail(existingCategories.error)
  const categoryIds = new Map((existingCategories.data ?? []).map(row => [row.path, row.id]))
  for (const path of categoryPaths) {
    let parentId: string | null = null
    const parts = path.split(':').map(part => part.trim()).filter(Boolean)
    for (let index = 0; index < parts.length; index += 1) {
      const currentPath = parts.slice(0, index + 1).join(':')
      const knownId = categoryIds.get(currentPath)
      if (knownId) {
        parentId = knownId
      } else {
        const categoryResult: { data: { id: string } | null; error: { message: string } | null } = await supabase.from('categories').insert({ owner_id: owner, parent_id: parentId, name: parts[index], path: currentPath }).select('id').single()
        fail(categoryResult.error)
        parentId = categoryResult.data?.id ?? null
        if (parentId) categoryIds.set(currentPath, parentId)
      }
    }
  }
  const [accountResult, categoryResult] = await Promise.all([supabase.from('accounts').select('id,name'), supabase.from('categories').select('id,path')])
  fail(accountResult.error); fail(categoryResult.error)
  const accounts = new Map((accountResult.data ?? []).map(row => [row.name, row.id]))
  const categories = new Map((categoryResult.data ?? []).map(row => [row.path, row.id]))
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const row of dataRows) {
    const description = row[at('Description')].trim()
    const uniqueId = at('Unique ID') >= 0 ? row[at('Unique ID')]?.trim() : ''
    const sourceName = (at('Withdraw account') >= 0 ? row[at('Withdraw account')] : '')?.trim() || row[at('Account')]?.split(':')[0]?.trim()
    const targetName = (at('Target account') >= 0 ? row[at('Target account')] : '')?.trim()
    const isTransfer = Boolean(targetName)
    const withdrawAmount = at('Withdraw amount') >= 0 ? Number(row[at('Withdraw amount')]) : 0
    const rawAmount = Number(row[at('Amount')])
    const transactionAmount = isTransfer ? Math.abs(withdrawAmount || rawAmount) : rawAmount
    const accountId = accounts.get(sourceName)
    if (!accountId) { errors.push(`Unknown account for “${description}”.`); continue }
    const { error } = await supabase.from('transactions').insert({ owner_id: owner, account_id: accountId, target_account_id: targetName ? accounts.get(targetName) ?? null : null, category_id: categories.get(row[at('Category')]?.trim()) ?? null, occurred_on: alzexDate(row[at('Date')]), description, normalized_description: normalizeDescription(description), amount: transactionAmount, comment: at('Comment') >= 0 ? row[at('Comment')] ?? '' : '', status: at('Status') >= 0 ? row[at('Status')] || 'C' : 'C', is_transfer: isTransfer, external_id: uniqueId ? `alzex:${uniqueId}` : null })
    if (!error) imported += 1
    else if (error.code === '23505') skipped += 1
    else errors.push(error.message)
  }
  return { imported, skipped, errors: errors.slice(0, 20) }
}

const backupTables = ['accounts', 'categories', 'merchants', 'merchant_aliases', 'imports', 'transactions', 'scheduled_transactions', 'budgets', 'budget_groups', 'budget_group_members'] as const

async function downloadBackup(): Promise<{ ok: boolean; filePath?: string }> {
  const payload: Record<string, unknown[]> = {}
  for (const table of backupTables) {
    const { data, error } = await supabase.from(table).select('*')
    fail(error)
    payload[table] = data ?? []
  }
  const blob = new Blob([JSON.stringify({ format: 'rangels-backup-v1', createdAt: new Date().toISOString(), data: payload }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rangels-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  return { ok: true, filePath: link.download }
}

async function restoreBackup(): Promise<{ ok: boolean }> {
  const file = await pickTextFile('.json,application/json')
  if (!file) return { ok: false }
  const backup = JSON.parse(file.text) as { format?: string; data?: Record<string, Row[]> }
  if (backup.format !== 'rangels-backup-v1' || !backup.data) throw new Error('This is not a Rangels backup.')
  for (const table of backupTables) {
    const rows = backup.data[table] ?? []
    if (rows.length) {
      const { error } = await supabase.from(table).upsert(rows)
      fail(error)
    }
  }
  return { ok: true }
}

async function fileHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function bankPreview(token: string) {
  const file = pickedFiles.get(token)
  if (!file) throw new Error('Please choose the CSV again.')
  const parsed = parseBankExport(file.text)
  const [transactions, categories] = await Promise.all([listTransactions(), listCategories()])
  const history = transactions
    .filter(transaction => transaction.categoryId && transaction.categoryFullName)
    .map(transaction => ({ description: transaction.description, category: transaction.categoryFullName! }))
  const byPath = new Map(categories.map(category => [category.fullName, category]))
  return {
    format: parsed.format,
    rows: parsed.rows.map((row, index) => {
      const suggestions = suggestCategories(row.description, history)
      const best = suggestions[0]
      const category = best ? byPath.get(best.category) : undefined
      return {
        index,
        ...row,
        suggestedCategoryId: category?.id ?? null,
        suggestedCategoryName: category?.fullName ?? null,
        confidence: best?.confidence ?? 0,
        reason: best ? `Matched “${best.matchedDescription}”` : 'No previous merchant match',
      }
    }),
  }
}

async function importBank(token: string, accountId: string, assignments: Record<number, string | null>): Promise<ImportResult> {
  const file = pickedFiles.get(token)
  if (!file) throw new Error('Please choose the CSV again.')
  const parsed = parseBankExport(file.text)
  const owner = await ownerId()
  const fingerprint = await fileHash(file.text)
  const { data: importRow, error: importError } = await supabase.from('imports').insert({ owner_id: owner, account_id: accountId, file_name: file.name, bank_format: parsed.format, file_fingerprint: fingerprint, row_count: parsed.rows.length }).select('id').single()
  if (importError?.code === '23505') return { imported: 0, skipped: parsed.rows.length, errors: [] }
  fail(importError)
  if (!importRow) throw new Error('Could not create the import.')
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [index, row] of parsed.rows.entries()) {
    if (assignments[index] === '__skip__') continue
    const sourceFingerprint = await fileHash(`${accountId}|${row.date}|${row.amount}|${row.description}`)
    const { error } = await supabase.from('transactions').insert({ owner_id: owner, import_id: importRow.id, account_id: accountId, category_id: assignments[index] ?? null, occurred_on: row.date, description: row.description, normalized_description: normalizeDescription(row.description), amount: row.amount, balance: row.balance ?? null, source_fingerprint: sourceFingerprint, status: 'C' })
    if (!error) imported += 1
    else if (error.code === '23505') skipped += 1
    else errors.push(error.message)
  }
  pickedFiles.delete(token)
  return { imported, skipped, errors: errors.slice(0, 20) }
}

type Row = Record<string, any>

async function ownerId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sign in to use Rangels.')
  return data.user.id
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

function monthRange(month: number, year: number): [string, string] {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).getDate()
  return [start, `${year}-${String(month).padStart(2, '0')}-${end}`]
}

async function rawAccounts(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
    .order('name')
  fail(error)
  return data ?? []
}

async function listAccounts(): Promise<Account[]> {
  const [accounts, transactionResult] = await Promise.all([
    rawAccounts(),
    supabase
      .from('transactions')
      .select('account_id,target_account_id,amount,is_transfer'),
  ])
  fail(transactionResult.error)

  return accounts.map((account) => {
    let balance = Number(account.initial_balance)
    for (const transaction of transactionResult.data ?? []) {
      const amount = Number(transaction.amount)
      if (!transaction.is_transfer && transaction.account_id === account.id) {
        balance += amount
      } else if (transaction.is_transfer) {
        if (transaction.account_id === account.id) balance -= Math.abs(amount)
        if (transaction.target_account_id === account.id) balance += Math.abs(amount)
      }
    }
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance: Number(account.initial_balance),
      color: account.color,
      isActive: account.is_active,
      displayOrder: account.display_order,
      groupName: account.group_name,
      balance,
    }
  })
}

async function listCategories(): Promise<Category[]> {
  const [categoryResult, transactionResult] = await Promise.all([
    supabase.from('categories').select('*').order('path'),
    supabase.from('transactions').select('category_id'),
  ])
  fail(categoryResult.error)
  fail(transactionResult.error)
  const rows = categoryResult.data ?? []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const counts = new Map<string, number>()
  for (const transaction of transactionResult.data ?? []) {
    if (transaction.category_id) {
      counts.set(
        transaction.category_id,
        (counts.get(transaction.category_id) ?? 0) + 1,
      )
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    parentName: row.parent_id ? byId.get(row.parent_id)?.name ?? null : null,
    type: row.type,
    color: row.color,
    fullName: row.path,
    txCount: counts.get(row.id) ?? 0,
  }))
}

async function listTransactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
  let query = supabase.from('transactions').select('*')
  if (filter.dateFrom) query = query.gte('occurred_on', filter.dateFrom)
  if (filter.dateTo) query = query.lte('occurred_on', filter.dateTo)
  if (!filter.dateFrom && filter.month && filter.year) {
    const [start, end] = monthRange(filter.month, filter.year)
    query = query.gte('occurred_on', start).lte('occurred_on', end)
  }
  if (filter.accountId) {
    query = query.or(
      `account_id.eq.${filter.accountId},target_account_id.eq.${filter.accountId}`,
    )
  }
  if (filter.categoryId) query = query.eq('category_id', filter.categoryId)
  if (filter.search) query = query.ilike('description', `%${filter.search}%`)

  const [transactionResult, accounts, categories] = await Promise.all([
    query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    listAccounts(),
    listCategories(),
  ])
  fail(transactionResult.error)
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))

  return (transactionResult.data ?? []).map((row) => {
    const category = row.category_id ? categoryMap.get(row.category_id) : undefined
    return {
      id: row.id,
      description: row.description,
      comment: row.comment ?? '',
      date: row.occurred_on,
      amount: Number(row.amount),
      accountId: row.account_id,
      accountName: accountMap.get(row.account_id)?.name ?? '',
      targetAccountId: row.target_account_id,
      targetAccountName: row.target_account_id
        ? accountMap.get(row.target_account_id)?.name ?? null
        : null,
      categoryId: row.category_id,
      categoryName: category?.name ?? null,
      categoryFullName: category?.fullName ?? null,
      categoryColor: category?.color ?? null,
      isTransfer: row.is_transfer,
      status: row.status,
      payee: row.payee ?? '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : row.tags ?? '',
      externalId: row.external_id ?? '',
    }
  })
}

function transactionPayload(data: Record<string, any>): Row {
  const map: Record<string, string> = {
    description: 'description',
    comment: 'comment',
    date: 'occurred_on',
    amount: 'amount',
    accountId: 'account_id',
    targetAccountId: 'target_account_id',
    categoryId: 'category_id',
    isTransfer: 'is_transfer',
    status: 'status',
    payee: 'payee',
    externalId: 'external_id',
  }
  const payload: Row = {}
  for (const [source, target] of Object.entries(map)) {
    if (source in data) payload[target] = data[source]
  }
  if ('tags' in data) {
    payload.tags = Array.isArray(data.tags)
      ? data.tags
      : String(data.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
  }
  return payload
}

async function addTransaction(data: Record<string, any>): Promise<Transaction> {
  const owner = await ownerId()
  const payload = transactionPayload(data)
  payload.owner_id = owner
  payload.normalized_description = String(data.description ?? '').toLowerCase().trim()
  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select('id')
    .single()
  fail(error)
  if (!inserted) throw new Error('Could not create the transaction.')
  return (await listTransactions()).find((transaction) => transaction.id === inserted.id)!
}

async function updateTransaction(
  id: string,
  data: Record<string, any>,
): Promise<Transaction> {
  const payload = transactionPayload(data)
  payload.updated_at = new Date().toISOString()
  if (data.description) {
    payload.normalized_description = String(data.description).toLowerCase().trim()
  }
  const { error } = await supabase.from('transactions').update(payload).eq('id', id)
  fail(error)
  return (await listTransactions()).find((transaction) => transaction.id === id)!
}

async function monthSummary(
  month: number,
  year: number,
  accountId?: string | null,
): Promise<MonthSummary> {
  const transactions = await listTransactions({ month, year, accountId })
  const categories = await listCategories()
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const included = transactions.filter((transaction) => !transaction.isTransfer)
  const income = included
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const expenses = included
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const totals = new Map<string, number>()
  included.forEach((transaction) => {
    if (transaction.categoryId) {
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
      )
    }
  })
  return {
    income,
    expenses,
    balance: income + expenses,
    byCategory: [...totals.entries()]
      .map(([categoryId, total]) => ({
        categoryId,
        categoryFullName: categoryMap.get(categoryId)?.fullName ?? 'Uncategorised',
        categoryColor: categoryMap.get(categoryId)?.color ?? '#9ca3af',
        total,
      }))
      .sort((left, right) => left.total - right.total),
  }
}

function nextDate(current: string, frequency: ScheduledTransaction['frequency']): string {
  const date = new Date(`${current}T00:00:00`)
  if (frequency === 'daily') date.setDate(date.getDate() + 1)
  if (frequency === 'weekly') date.setDate(date.getDate() + 7)
  if (frequency === 'fortnightly') date.setDate(date.getDate() + 14)
  if (frequency === 'monthly') date.setMonth(date.getMonth() + 1)
  if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

async function scheduledList(): Promise<ScheduledTransaction[]> {
  const [result, accounts, categories] = await Promise.all([
    supabase.from('scheduled_transactions').select('*').order('next_date'),
    listAccounts(),
    listCategories(),
  ])
  fail(result.error)
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  return (result.data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    accountId: row.account_id,
    accountName: accountMap.get(row.account_id)?.name ?? '',
    targetAccountId: row.target_account_id,
    categoryId: row.category_id,
    categoryName: row.category_id ? categoryMap.get(row.category_id)?.name ?? null : null,
    categoryFullName: row.category_id
      ? categoryMap.get(row.category_id)?.fullName ?? null
      : null,
    isTransfer: row.is_transfer,
    frequency: row.frequency,
    startDate: row.start_date,
    nextDate: row.next_date,
    endDate: row.end_date,
    isActive: row.is_active,
  }))
}

function scheduledPayload(data: Record<string, any>): Row {
  const mapping: Record<string, string> = {
    description: 'description',
    amount: 'amount',
    accountId: 'account_id',
    targetAccountId: 'target_account_id',
    categoryId: 'category_id',
    isTransfer: 'is_transfer',
    frequency: 'frequency',
    startDate: 'start_date',
    nextDate: 'next_date',
    endDate: 'end_date',
    isActive: 'is_active',
  }
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([source]) => source in data)
      .map(([source, target]) => [target, data[source]]),
  )
}

async function budgetList(month: number, year: number): Promise<Budget[]> {
  const [budgetResult, categories, transactions] = await Promise.all([
    supabase.from('budgets').select('*').eq('month', month).eq('year', year),
    listCategories(),
    listTransactions({ month, year }),
  ])
  fail(budgetResult.error)
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  return (budgetResult.data ?? []).map((row) => {
    const category = categoryMap.get(row.category_id)
    const spent = Math.abs(
      transactions
        .filter(
          (transaction) =>
            transaction.categoryId === row.category_id && transaction.amount < 0,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    )
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: category?.name ?? '',
      categoryFullName: category?.fullName ?? '',
      categoryColor: category?.color ?? '#9ca3af',
      month: row.month,
      year: row.year,
      amount: Number(row.amount),
      spent,
    }
  })
}

async function budgetGroupList(month: number, year: number): Promise<any[]> {
  const [groupResult, memberResult, categories, transactions] = await Promise.all([
    supabase.from('budget_groups').select('*').eq('month', month).eq('year', year),
    supabase.from('budget_group_members').select('*'),
    listCategories(),
    listTransactions({ month, year }),
  ])
  fail(groupResult.error)
  fail(memberResult.error)
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  return (groupResult.data ?? []).map((group) => {
    const members = (memberResult.data ?? []).filter(
      (member) => member.group_id === group.id,
    )
    const ids = new Set<string>()
    members.forEach((member) => {
      ids.add(member.category_id)
      if (member.include_children) {
        categories
          .filter((category) => category.parentId === member.category_id)
          .forEach((category) => ids.add(category.id))
      }
    })
    const spent = Math.abs(
      transactions
        .filter(
          (transaction) =>
            transaction.categoryId &&
            ids.has(transaction.categoryId) &&
            transaction.amount < 0,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    )
    return {
      id: group.id,
      name: group.name,
      month: group.month,
      year: group.year,
      amount: Number(group.amount),
      spent,
      members: members.map((member) => ({
        id: member.id,
        groupId: member.group_id,
        categoryId: member.category_id,
        categoryName: categoryMap.get(member.category_id)?.name ?? '',
        categoryColor: categoryMap.get(member.category_id)?.color ?? '#9ca3af',
        categoryParentId: categoryMap.get(member.category_id)?.parentId ?? null,
        includeChildren: member.include_children,
      })),
    }
  })
}

export const api = {
  accounts: {
    list: listAccounts,
    add: async (
      data: Pick<Account, 'name' | 'type' | 'color' | 'initialBalance'> & {
        groupName?: string | null
      },
    ): Promise<Account> => {
      const owner = await ownerId()
      const { data: row, error } = await supabase
        .from('accounts')
        .insert({
          owner_id: owner,
          name: data.name,
          institution: data.name,
          type: data.type,
          color: data.color,
          initial_balance: data.initialBalance,
          group_name: data.groupName ?? null,
        })
        .select('id')
        .single()
      fail(error)
      if (!row) throw new Error('Could not create the account.')
      return (await listAccounts()).find((account) => account.id === row.id)!
    },
    update: async (id: string, data: Partial<Account>): Promise<void> => {
      const payload: Row = {}
      if (data.name !== undefined) payload.name = data.name
      if (data.type !== undefined) payload.type = data.type
      if (data.color !== undefined) payload.color = data.color
      if (data.initialBalance !== undefined) payload.initial_balance = data.initialBalance
      if (data.groupName !== undefined) payload.group_name = data.groupName
      const { error } = await supabase.from('accounts').update(payload).eq('id', id)
      fail(error)
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('accounts')
        .update({ is_active: false })
        .eq('id', id)
      fail(error)
    },
    reorder: async (
      updates: { id: string; groupName: string | null; displayOrder: number }[],
    ): Promise<void> => {
      await Promise.all(
        updates.map(async (update) => {
          const { error } = await supabase
            .from('accounts')
            .update({
              group_name: update.groupName,
              display_order: update.displayOrder,
            })
            .eq('id', update.id)
          fail(error)
        }),
      )
    },
  },
  categories: {
    list: listCategories,
    add: async (data: {
      name: string
      parentId: string | null
      type: string
      color: string
    }): Promise<Category> => {
      const owner = await ownerId()
      const categories = await listCategories()
      const parent = data.parentId
        ? categories.find((category) => category.id === data.parentId)
        : null
      const path = parent ? `${parent.fullName}:${data.name}` : data.name
      const { data: row, error } = await supabase
        .from('categories')
        .insert({
          owner_id: owner,
          name: data.name,
          parent_id: data.parentId,
          path,
          type: data.type,
          color: data.color,
        })
        .select('id')
        .single()
      fail(error)
      if (!row) throw new Error('Could not create the category.')
      return (await listCategories()).find((category) => category.id === row.id)!
    },
    update: async (
      id: string,
      data: { name?: string; color?: string; type?: string },
    ): Promise<void> => {
      const categories = await listCategories()
      const current = categories.find((category) => category.id === id)
      if (!current) throw new Error('Category not found.')
      const parent = current.parentId
        ? categories.find((category) => category.id === current.parentId)
        : null
      const nextPath = data.name
        ? parent
          ? `${parent.fullName}:${data.name}`
          : data.name
        : current.fullName
      const { error } = await supabase
        .from('categories')
        .update({ ...data, path: nextPath })
        .eq('id', id)
      fail(error)
      if (nextPath !== current.fullName) {
        await Promise.all(
          categories
            .filter((category) => category.fullName.startsWith(`${current.fullName}:`))
            .map((category) =>
              supabase
                .from('categories')
                .update({
                  path: category.fullName.replace(current.fullName, nextPath),
                })
                .eq('id', category.id),
            ),
        )
      }
    },
    delete: async (id: string): Promise<void> => {
      await supabase.from('transactions').update({ category_id: null }).eq('category_id', id)
      const { error } = await supabase.from('categories').delete().eq('id', id)
      fail(error)
    },
    migrateColon: async () => ({ created: 0, updated: 0 }),
  },
  transactions: {
    list: listTransactions,
    add: addTransaction,
    update: updateTransaction,
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      fail(error)
    },
    bulkCategory: async (ids: string[], categoryId: string | null): Promise<void> => {
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId, updated_at: new Date().toISOString() })
        .in('id', ids)
      fail(error)
    },
    monthSummary,
    yearlySummary: async (year: number, accountId?: string | null) => {
      const rows = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          monthSummary(index + 1, year, accountId).then((summary) => ({
            month: index + 1,
            income: summary.income,
            expenses: summary.expenses,
          })),
        ),
      )
      return rows
    },
    categorizedDescriptions: async (): Promise<
      Array<{ description: string; categoryId: string }>
    > => {
      const { data, error } = await supabase
        .from('transactions')
        .select('description,category_id')
        .not('category_id', 'is', null)
        .order('occurred_on', { ascending: false })
        .limit(10000)
      fail(error)
      return (data ?? []).map((row) => ({
        description: row.description,
        categoryId: row.category_id!,
      }))
    },
    calendarSummary: async (month: number, year: number, accountId?: string) => {
      const [accounts, before, current] = await Promise.all([
        listAccounts(),
        listTransactions({ dateTo: `${year}-${String(month).padStart(2, '0')}-01`, accountId }),
        listTransactions({ month, year, accountId }),
      ])
      const initial = accountId
        ? accounts.find((account) => account.id === accountId)?.initialBalance ?? 0
        : accounts.reduce((sum, account) => sum + account.initialBalance, 0)
      const startBalance =
        initial +
        before
          .filter((transaction) => !transaction.isTransfer)
          .reduce((sum, transaction) => sum + transaction.amount, 0)
      const grouped = new Map<string, Transaction[]>()
      current.forEach((transaction) => {
        const rows = grouped.get(transaction.date) ?? []
        rows.push(transaction)
        grouped.set(transaction.date, rows)
      })
      let running = startBalance
      const days = [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, rows]) => {
          const normal = rows.filter((row) => !row.isTransfer)
          const income = normal
            .filter((row) => row.amount > 0)
            .reduce((sum, row) => sum + row.amount, 0)
          const expenses = normal
            .filter((row) => row.amount < 0)
            .reduce((sum, row) => sum + row.amount, 0)
          const total = income + expenses
          running += total
          return { date, total, income, expenses, balance: running }
        })
      return { startBalance, days }
    },
  },
  scheduled: {
    list: scheduledList,
    add: async (data: Record<string, any>): Promise<ScheduledTransaction> => {
      const owner = await ownerId()
      const { data: row, error } = await supabase
        .from('scheduled_transactions')
        .insert({ owner_id: owner, ...scheduledPayload(data) })
        .select('id')
        .single()
      fail(error)
      if (!row) throw new Error('Could not create the scheduled transaction.')
      return (await scheduledList()).find((item) => item.id === row.id)!
    },
    update: async (id: string, data: Record<string, any>): Promise<void> => {
      const { error } = await supabase
        .from('scheduled_transactions')
        .update(scheduledPayload(data))
        .eq('id', id)
      fail(error)
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('scheduled_transactions').delete().eq('id', id)
      fail(error)
    },
    processDue: async (): Promise<Transaction[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const due = (await scheduledList()).filter(
        (item) => item.isActive && item.nextDate <= today,
      )
      const created: Transaction[] = []
      for (const item of due) {
        created.push(
          await addTransaction({
            description: item.description,
            date: item.nextDate,
            amount: item.amount,
            accountId: item.accountId,
            targetAccountId: item.targetAccountId,
            categoryId: item.categoryId,
            isTransfer: item.isTransfer,
          }),
        )
        const following = nextDate(item.nextDate, item.frequency)
        await api.scheduled.update(item.id, {
          nextDate: following,
          isActive: !item.endDate || following <= item.endDate,
        })
      }
      return created
    },
  },
  budgets: {
    list: budgetList,
    set: async (
      categoryId: string,
      month: number,
      year: number,
      amount: number,
    ): Promise<void> => {
      const owner = await ownerId()
      const { error } = await supabase.from('budgets').upsert(
        { owner_id: owner, category_id: categoryId, month, year, amount },
        { onConflict: 'owner_id,category_id,month,year' },
      )
      fail(error)
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('budgets').delete().eq('id', id)
      fail(error)
    },
  },
  budgetGroups: {
    list: budgetGroupList,
    add: async (data: {
      name: string
      month: number
      year: number
      amount: number
    }): Promise<string> => {
      const owner = await ownerId()
      const { data: row, error } = await supabase
        .from('budget_groups')
        .insert({ owner_id: owner, ...data })
        .select('id')
        .single()
      fail(error)
      if (!row) throw new Error('Could not create the budget group.')
      return row.id
    },
    update: async (
      id: string,
      data: { name?: string; amount?: number },
    ): Promise<void> => {
      const { error } = await supabase.from('budget_groups').update(data).eq('id', id)
      fail(error)
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('budget_groups').delete().eq('id', id)
      fail(error)
    },
    setMembers: async (
      groupId: string,
      members: { categoryId: string; includeChildren: boolean }[],
    ): Promise<void> => {
      const owner = await ownerId()
      const { error: deleteError } = await supabase
        .from('budget_group_members')
        .delete()
        .eq('group_id', groupId)
      fail(deleteError)
      if (members.length === 0) return
      const { error } = await supabase.from('budget_group_members').insert(
        members.map((member) => ({
          owner_id: owner,
          group_id: groupId,
          category_id: member.categoryId,
          include_children: member.includeChildren,
        })),
      )
      fail(error)
    },
  },
  import: {
    alzex: async (): Promise<ImportResult | null> => {
      return importAlzex()
    },
    bankCsvPick: async (): Promise<string | null> => {
      return pickCsv()
    },
    bankCsvPreview: async (_path: string): Promise<{ format: string; rows: any[] }> => {
      return bankPreview(_path)
    },
    bankCsv: async (
      _path: string,
      _accountId: string,
      _assignments: Record<number, string | null>,
    ): Promise<ImportResult> => {
      return importBank(_path, _accountId, _assignments)
    },
  },
  db: {
    backup: downloadBackup,
    restore: restoreBackup,
  },
}
