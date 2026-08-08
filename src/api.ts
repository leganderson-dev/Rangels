import { supabase } from './lib/supabase'
import type {
  Account,
  AllocationPlanSummary,
  Budget,
  Category,
  ClassificationOptions,
  LegacyCategoryMapping,
  ImportResult,
  MerchantInsight,
  MonthSummary,
  ScheduledTransaction,
  Transaction,
  TransactionFilter,
  HouseholdMember,
} from './types/finance'
import { parseBankExport } from './lib/importers'
import { createCategoryMatcher, normalizeDescription, relevantCategorySuggestions, transactionDuplicateKey } from './lib/matching'
import { parseDelimited } from './lib/csv'
import { merchantDisplayName, merchantKey } from './lib/merchants'

const pickedFiles = new Map<string, { name: string; text: string }>()

async function pickCsv(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,text/csv,text/plain'
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    let timeout: number | undefined
    const finish = (value: string | null, error?: Error) => {
      if (settled) return
      settled = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      input.remove()
      if (error) reject(error)
      else resolve(value)
    }
    input.addEventListener('cancel', () => finish(null))
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      timeout = window.setTimeout(() => finish(null, new Error('The CSV could not be read within 15 seconds. Please choose a local file and try again.')), 15000)
      const reader = new FileReader()
      reader.onerror = () => finish(null, new Error(`Could not read ${file.name}. Please copy it to a local folder and try again.`))
      reader.onload = () => {
        const token = crypto.randomUUID()
        pickedFiles.set(token, { name: file.name, text: String(reader.result ?? '') })
        finish(token)
      }
      reader.readAsText(file)
    })
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
  const { data: accountMember, error: accountMemberError } = await supabase.from('household_members').select('id').eq('workspace_owner_id', owner).eq('name', 'Anderson').single()
  fail(accountMemberError)
  if (!accountMember) throw new Error('The Anderson household member is not configured.')
  const dataRows = rows.slice(1).filter(row => row[at('Date')]?.trim())
  const accountColumns = [at('Withdraw account'), at('Target account')].filter(index => index >= 0)
  const accountNames = [...new Set(dataRows.flatMap(row => accountColumns.map(index => row[index]?.trim()).filter(Boolean)))]
  const openingBalances = new Map<string, number>()
  for (const row of dataRows.filter(row => row[at('Description')]?.trim() === 'Opening balance')) {
    const withdrawName = row[at('Withdraw account')]?.trim()
    const targetName = row[at('Target account')]?.trim()
    if (withdrawName) openingBalances.set(withdrawName, -Math.abs(Number(row[at('Withdraw amount')] || row[at('Amount')] || 0)))
    if (targetName) openingBalances.set(targetName, Math.abs(Number(row[at('Target Amount')] || row[at('Amount')] || 0)))
  }
  const accountOrder = ['CartaodeCredito', 'NAB', 'NAB Savings', 'ING Currumundi', 'ING FireExtingusher', 'Leg CW', 'Smile - YL 700', 'Julia CW', 'Staging - Hub']
  const accountProfile = (name: string, index: number) => ({
    owner_id: owner,
    name,
    institution: name.startsWith('ING ') ? 'ING' : name.startsWith('NAB') ? 'NAB' : name === 'CartaodeCredito' ? 'Credit card' : 'CommBank',
    currency: 'AUD',
    type: 'cash',
    initial_balance: openingBalances.get(name) ?? 0,
    group_name: name.startsWith('ING ') ? 'ING' : name.startsWith('NAB') ? 'NAB' : ['Leg CW', 'Smile - YL 700', 'Julia CW'].includes(name) ? 'CW Accounts' : null,
    is_active: !['Julia CW', 'Staging - Hub'].includes(name),
    display_order: accountOrder.indexOf(name) >= 0 ? accountOrder.indexOf(name) : accountOrder.length + index,
    member_id: accountMember.id,
  })
  const existingAccounts = await supabase.from('accounts').select('id,name')
  fail(existingAccounts.error)
  const existingAccountNames = new Set((existingAccounts.data ?? []).map(row => row.name))
  const missingAccounts = accountNames.filter(name => !existingAccountNames.has(name))
  if (missingAccounts.length) {
    const { error } = await supabase.from('accounts').insert(missingAccounts.map((name, index) => accountProfile(name, existingAccountNames.size + index)))
    fail(error)
  }
  for (const [index, name] of accountNames.entries()) {
    if (!existingAccountNames.has(name)) continue
    const { error } = await supabase.from('accounts').update(accountProfile(name, index)).eq('name', name)
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
  const existingExternalIds = await supabase.from('transactions').select('external_id').like('external_id', 'alzex:%')
  fail(existingExternalIds.error)
  const knownExternalIds = new Set((existingExternalIds.data ?? []).map(row => row.external_id).filter(Boolean))
  const payloads: Row[] = []
  for (const row of dataRows) {
    const description = row[at('Description')]?.trim() || (row[at('Category')]?.trim() === 'Bank:Interest' ? 'Bank Interest' : 'Unlabelled transaction')
    if (description === 'Opening balance') continue
    const status = at('Status') >= 0 ? row[at('Status')]?.trim() : ''
    if (status !== 'C') { skipped += 1; continue }
    const uniqueId = at('Unique ID') >= 0 ? row[at('Unique ID')]?.trim() : ''
    const externalId = uniqueId ? `alzex:${uniqueId}` : null
    if (externalId && knownExternalIds.has(externalId)) { skipped += 1; continue }
    const withdrawName = (at('Withdraw account') >= 0 ? row[at('Withdraw account')] : '')?.trim()
    const targetName = (at('Target account') >= 0 ? row[at('Target account')] : '')?.trim()
    const sourceName = withdrawName || row[at('Account')]?.split(':')[0]?.trim()
    const isTransfer = Boolean(withdrawName && targetName && withdrawName !== targetName)
    const withdrawAmount = at('Withdraw amount') >= 0 ? Number(row[at('Withdraw amount')]) : 0
    const targetAmount = at('Target Amount') >= 0 ? Number(row[at('Target Amount')]) : 0
    const rawAmount = Number(row[at('Amount')])
    const transactionAmount = isTransfer
      ? Math.abs(withdrawAmount || rawAmount)
      : withdrawName
        ? -Math.abs(withdrawAmount || rawAmount)
        : Math.abs(targetAmount || rawAmount)
    const accountId = accounts.get(sourceName)
    if (!accountId) { errors.push(`Unknown account for “${description}”.`); continue }
    payloads.push({ owner_id: owner, account_id: accountId, target_account_id: isTransfer ? accounts.get(targetName) ?? null : null, category_id: categories.get(row[at('Category')]?.trim()) ?? null, occurred_on: alzexDate(row[at('Date')]), description, normalized_description: normalizeDescription(description), amount: transactionAmount, comment: at('Comment') >= 0 ? row[at('Comment')] ?? '' : '', status, is_transfer: isTransfer, external_id: externalId })
    if (externalId) knownExternalIds.add(externalId)
  }
  for (let index = 0; index < payloads.length; index += 500) {
    const batch = payloads.slice(index, index + 500)
    const { error } = await supabase.from('transactions').insert(batch)
    if (error) errors.push(error.message)
    else imported += batch.length
  }
  return { imported, skipped, errors: errors.slice(0, 20) }
}

const backupTables = ['household_members', 'accounts', 'categories', 'contexts', 'buckets', 'canonical_categories', 'category_classifications', 'allocation_plans', 'allocation_targets', 'merchants', 'merchant_aliases', 'imports', 'transactions', 'scheduled_transactions', 'budgets', 'budget_groups', 'budget_group_members'] as const

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

type MerchantRuleMatch = { merchantId: string; categoryId: string; canonicalCategoryId: string | null; contextId: string | null; bucketId: string | null; taxTreatment: string }

async function loadMerchantClassificationRules(): Promise<{
  byKey: Map<string, MerchantRuleMatch>
  aliases: Array<{ phrase: string; rule: MerchantRuleMatch }>
}> {
  const [merchantResult, aliasResult] = await Promise.all([
    supabase.from('merchants').select('id,normalized_name,default_category_id,default_canonical_category_id,default_context_id,default_bucket_id,default_tax_treatment').not('default_category_id', 'is', null),
    supabase.from('merchant_aliases').select('merchant_id,normalized_alias'),
  ])
  fail(merchantResult.error)
  fail(aliasResult.error)
  const byMerchantId = new Map((merchantResult.data ?? []).map(merchant => [merchant.id, {
    merchantId: merchant.id,
    categoryId: merchant.default_category_id!,
    canonicalCategoryId: merchant.default_canonical_category_id,
    contextId: merchant.default_context_id,
    bucketId: merchant.default_bucket_id,
    taxTreatment: merchant.default_tax_treatment,
  }]))
  return {
    byKey: new Map((merchantResult.data ?? []).map(merchant => [merchant.normalized_name, byMerchantId.get(merchant.id)!])),
    aliases: (aliasResult.data ?? [])
      .map(alias => ({ phrase: alias.normalized_alias, rule: byMerchantId.get(alias.merchant_id) }))
      .filter((item): item is { phrase: string; rule: MerchantRuleMatch } => Boolean(item.phrase && item.rule))
      .sort((left, right) => right.phrase.length - left.phrase.length),
  }
}

let merchantRuleCache: Awaited<ReturnType<typeof loadMerchantClassificationRules>> | null = null

async function cachedMerchantClassificationRules() {
  if (!merchantRuleCache) merchantRuleCache = await loadMerchantClassificationRules()
  return merchantRuleCache
}

function matchMerchantRule(description: string, rules: Awaited<ReturnType<typeof loadMerchantClassificationRules>>): MerchantRuleMatch | null {
  const key = merchantKey(description)
  const direct = rules.byKey.get(key)
  if (direct) return direct
  const normalized = normalizeDescription(description)
  return rules.aliases.find(alias =>
    normalized === alias.phrase || normalized.includes(alias.phrase) || key.includes(alias.phrase)
  )?.rule ?? null
}

type ImportPreviewProgress = (event: { stage: 'found' | 'duplicates' | 'categorizing' | 'done'; count?: number }) => void

async function bankPreview(token: string, accountId: string, onProgress?: ImportPreviewProgress) {
  const file = pickedFiles.get(token)
  if (!file) throw new Error('Please choose the CSV again.')
  const parsed = parseBankExport(file.text)
  onProgress?.({ stage: 'found', count: parsed.rows.length })
  const [transactionRows, categoryResult, merchantRules] = await Promise.all([
    fetchAllRows(() => supabase.from('transactions')
      .select('account_id,occurred_on,amount,description,category_id,is_transfer')),
    supabase.from('categories').select('id,path,color'),
    cachedMerchantClassificationRules(),
  ])
  fail(categoryResult.error)
  const categories = categoryResult.data ?? []
  const categoryPathById = new Map(categories.map(category => [category.id, category.path]))
  const history = transactionRows
    .filter(transaction => transaction.category_id && categoryPathById.has(transaction.category_id))
    .map(transaction => ({ description: transaction.description, category: categoryPathById.get(transaction.category_id)! }))
  const matchHistory = createCategoryMatcher(history)
  const byPath = new Map(categories.map(category => [category.path, category]))
  const byId = new Map(categories.map(category => [category.id, category]))
  const existingKeys = new Set(
    transactionRows
      .filter(transaction => transaction.account_id === accountId && !transaction.is_transfer)
      .map(transaction => transactionDuplicateKey(accountId, transaction.occurred_on, Number(transaction.amount), transaction.description)),
  )
  const fileKeys = new Set<string>()
  const duplicateMetadata = parsed.rows.map(row => {
    const duplicateKey = transactionDuplicateKey(accountId, row.date, row.amount, row.description)
    const duplicate = existingKeys.has(duplicateKey) || fileKeys.has(duplicateKey)
    const duplicateReason = existingKeys.has(duplicateKey)
      ? 'Already exists in this account'
      : fileKeys.has(duplicateKey) ? 'Repeated in this CSV' : null
    fileKeys.add(duplicateKey)
    return { duplicate, duplicateReason }
  })
  onProgress?.({ stage: 'duplicates', count: duplicateMetadata.filter(item => item.duplicate).length })
  onProgress?.({ stage: 'categorizing' })
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  const rows = parsed.rows.map((row, index) => {
      const { duplicate, duplicateReason } = duplicateMetadata[index]
      // Rank every non-zero match. Even low-confidence analysis rows should
      // begin with their highest score selected and remain editable.
      const ruleCategoryId = matchMerchantRule(row.description, merchantRules)?.categoryId
      const ruleCategory = ruleCategoryId ? byId.get(ruleCategoryId) : null
      const suggestions = relevantCategorySuggestions(matchHistory(row.description, Number.EPSILON))
      const learnedSuggestions = suggestions
        .map(suggestion => {
          const category = byPath.get(suggestion.category)
          return category ? {
            categoryId: category.id,
            categoryName: category.path,
            confidence: suggestion.confidence,
            reason: `Matched “${suggestion.matchedDescription}”`,
          } : null
        })
        .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null)
        .slice(0, 3)
      const rankedSuggestions = ruleCategory ? [{
        categoryId: ruleCategory.id,
        categoryName: ruleCategory.path,
        confidence: 1,
        reason: 'Remembered merchant classification',
      }, ...learnedSuggestions.filter(suggestion => suggestion.categoryId !== ruleCategory.id)].slice(0, 3) : learnedSuggestions
      const best = rankedSuggestions[0]
      return {
        index,
        ...row,
        suggestedCategoryId: best?.categoryId ?? null,
        suggestedCategoryName: best?.categoryName ?? null,
        confidence: best?.confidence ?? 0,
        reason: best?.reason ?? 'No previous merchant match',
        suggestions: rankedSuggestions,
        duplicate,
        duplicateReason,
      }
    })
  onProgress?.({ stage: 'done' })
  return { format: parsed.format, rows }
}

type BankImportAssignment = { categoryId: string | null; canonicalCategoryId?: string | null; contextId?: string | null; bucketId?: string | null; taxTreatment?: string; reimbursementStatus?: string; tags?: string[] }

async function importBank(token: string, accountId: string, assignments: Record<number, BankImportAssignment | '__skip__'>): Promise<ImportResult> {
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
  const existingTransactions = await fetchAllRows(() => supabase.from('transactions')
    .select('occurred_on,amount,description,is_transfer')
    .eq('account_id', accountId))
  const merchantRules = await cachedMerchantClassificationRules()
  const duplicateKeys = new Set(
    existingTransactions
      .filter(transaction => !transaction.is_transfer)
      .map(transaction => transactionDuplicateKey(accountId, transaction.occurred_on, Number(transaction.amount), transaction.description)),
  )
  const payloads: Row[] = []
  for (const [index, row] of parsed.rows.entries()) {
    const assignment = assignments[index]
    if (assignment === '__skip__') continue
    const duplicateKey = transactionDuplicateKey(accountId, row.date, row.amount, row.description)
    if (duplicateKeys.has(duplicateKey)) { skipped += 1; continue }
    duplicateKeys.add(duplicateKey)
    const merchantRule = matchMerchantRule(row.description, merchantRules)
    payloads.push({ owner_id: owner, import_id: importRow.id, account_id: accountId, merchant_id: merchantRule?.merchantId ?? null, category_id: assignment?.categoryId ?? null, canonical_category_id: assignment?.canonicalCategoryId ?? merchantRule?.canonicalCategoryId ?? null, context_id: assignment?.contextId ?? merchantRule?.contextId ?? null, bucket_id: assignment?.bucketId ?? merchantRule?.bucketId ?? null, tax_treatment: assignment?.taxTreatment ?? merchantRule?.taxTreatment ?? 'none', reimbursement_status: assignment?.reimbursementStatus ?? 'none', tags: assignment?.tags ?? [], occurred_on: row.date, description: row.description, normalized_description: normalizeDescription(row.description), amount: row.amount, balance: row.balance ?? null, source_fingerprint: await fileHash(duplicateKey), status: 'C' })
  }
  for (let index = 0; index < payloads.length; index += 500) {
    const batch = payloads.slice(index, index + 500)
    const { error } = await supabase.from('transactions').insert(batch)
    if (!error) imported += batch.length
    else if (error.code === '23505') skipped += batch.length
    else errors.push(error.message)
  }
  pickedFiles.delete(token)
  return { imported, skipped, errors: errors.slice(0, 20) }
}

type Row = Record<string, any>

const DATABASE_PAGE_SIZE = 1000

async function fetchAllRows(makeQuery: () => any): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + DATABASE_PAGE_SIZE - 1)
    fail(error)
    const page = data ?? []
    rows.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) return rows
  }
}

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
  const [accounts, transactions, members] = await Promise.all([
    rawAccounts(),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('account_id,target_account_id,amount,is_transfer,status')
      .eq('status', 'C')),
    listHouseholdMembers(),
  ])
  const memberMap = new Map(members.map(member => [member.id, member.name]))

  return accounts.map((account) => {
    let balance = Number(account.initial_balance)
    for (const transaction of transactions) {
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
      lastUpdatedOn: account.last_updated_on,
      memberId: account.member_id,
      memberName: memberMap.get(account.member_id) ?? 'Unknown',
      balance,
    }
  })
}

async function listCategories(): Promise<Category[]> {
  const [categoryResult, transactions] = await Promise.all([
    supabase.from('categories').select('*').order('path'),
    fetchAllRows(() => supabase.from('transactions').select('category_id')),
  ])
  fail(categoryResult.error)
  const rows = categoryResult.data ?? []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const counts = new Map<string, number>()
  for (const transaction of transactions) {
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
  const makeQuery = () => {
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
    return query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
  }

  const [transactionRows, accounts, categories, classification] = await Promise.all([
    fetchAllRows(makeQuery),
    listAccounts(),
    listCategories(),
    listClassificationOptions(),
  ])
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const contextMap = new Map(classification.contexts.map(item => [item.id, item.name]))
  const bucketMap = new Map(classification.buckets.map(item => [item.id, item.name]))
  const canonicalMap = new Map(classification.categories.map(item => [item.id, item]))

  return transactionRows.map((row) => {
    const category = row.category_id ? categoryMap.get(row.category_id) : undefined
    return {
      id: row.id,
      description: row.description,
      comment: row.comment ?? '',
      date: row.occurred_on,
      amount: Number(row.amount),
      accountId: row.account_id,
      accountName: accountMap.get(row.account_id)?.name ?? '',
      memberId: accountMap.get(row.account_id)?.memberId ?? '',
      memberName: accountMap.get(row.account_id)?.memberName ?? 'Unknown',
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
      canonicalCategoryId: row.canonical_category_id,
      canonicalCategoryName: row.canonical_category_id ? canonicalMap.get(row.canonical_category_id)?.name ?? null : null,
      canonicalCategoryFamily: row.canonical_category_id ? canonicalMap.get(row.canonical_category_id)?.family ?? null : null,
      contextId: row.context_id,
      contextName: row.context_id ? contextMap.get(row.context_id) ?? null : null,
      bucketId: row.bucket_id,
      bucketName: row.bucket_id ? bucketMap.get(row.bucket_id) ?? null : null,
      reimbursementStatus: row.reimbursement_status ?? 'none',
      taxTreatment: row.tax_treatment ?? 'none',
    }
  })
}

async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  const { data, error } = await supabase.from('household_members').select('id,name').order('display_order')
  fail(error)
  return data ?? []
}

async function getAllocationPlan(): Promise<AllocationPlanSummary | null> {
  const { data: plans, error: planError } = await supabase
    .from('allocation_plans')
    .select('id,name,context_id')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
  fail(planError)
  const plan = plans?.[0]
  if (!plan) return null
  const [contextResult, targetResult, bucketResult] = await Promise.all([
    supabase.from('contexts').select('name').eq('id', plan.context_id).single(),
    supabase.from('allocation_targets').select('id,bucket_id,target_percentage,display_order').eq('allocation_plan_id', plan.id).order('display_order'),
    supabase.from('buckets').select('id,name'),
  ])
  fail(contextResult.error); fail(targetResult.error); fail(bucketResult.error)
  const bucketNames = new Map((bucketResult.data ?? []).map(bucket => [bucket.id, bucket.name]))
  return {
    id: plan.id,
    name: plan.name,
    contextName: contextResult.data?.name ?? 'Household',
    targets: (targetResult.data ?? []).map(target => ({
      id: target.id,
      bucketId: target.bucket_id,
      name: bucketNames.get(target.bucket_id) ?? 'Unknown',
      targetPercentage: Number(target.target_percentage),
    })),
  }
}

async function listClassificationOptions(): Promise<ClassificationOptions> {
  const [contexts, buckets, categories] = await Promise.all([
    supabase.from('contexts').select('id,name').order('display_order'),
    supabase.from('buckets').select('id,name').order('display_order'),
    supabase.from('canonical_categories').select('id,name,family,type').order('display_order'),
  ])
  fail(contexts.error); fail(buckets.error); fail(categories.error)
  return {
    contexts: contexts.data ?? [],
    buckets: buckets.data ?? [],
    categories: (categories.data ?? []) as ClassificationOptions['categories'],
  }
}

async function listCategoryMappings(): Promise<LegacyCategoryMapping[]> {
  const [mappingResult, categoryResult, options, transactionRows] = await Promise.all([
    supabase.from('category_classifications').select('*'),
    supabase.from('categories').select('id,path,type').order('path'),
    listClassificationOptions(),
    fetchAllRows(() => supabase.from('transactions').select('category_id')),
  ])
  fail(mappingResult.error)
  fail(categoryResult.error)
  const categories = categoryResult.data ?? []
  const rows = new Map((mappingResult.data ?? []).map(row => [row.legacy_category_id, row]))
  const canonical = new Map(options.categories.map(item => [item.id, item.name]))
  const contexts = new Map(options.contexts.map(item => [item.id, item.name]))
  const buckets = new Map(options.buckets.map(item => [item.id, item.name]))
  const transactionCounts = new Map<string, number>()
  transactionRows.forEach(transaction => {
    if (transaction.category_id) transactionCounts.set(transaction.category_id, (transactionCounts.get(transaction.category_id) ?? 0) + 1)
  })
  return categories.map(category => {
    const row = rows.get(category.id)
    const preserved = ['ToBeRefunded', 'Reibursment'].includes(category.path)
    return {
      categoryId: category.id,
      categoryPath: category.path,
      canonicalCategoryId: row?.canonical_category_id ?? null,
      canonicalCategoryName: row?.canonical_category_id ? canonical.get(row.canonical_category_id) ?? null : null,
      contextId: row?.context_id ?? null,
      contextName: row?.context_id ? contexts.get(row.context_id) ?? null : null,
      bucketId: row?.bucket_id ?? null,
      bucketName: row?.bucket_id ? buckets.get(row.bucket_id) ?? null : null,
      taxTreatment: row?.tax_treatment ?? 'none',
      status: preserved && !row ? 'preserved' : row?.migration_status ?? 'review',
      notes: preserved && !row ? 'Reserved for manual owner review' : row?.notes ?? '',
      transactionCount: transactionCounts.get(category.id) ?? 0,
      legacyCategoryType: category.type,
    }
  })
}

async function saveCategoryMapping(categoryId: string, data: {
  canonicalCategoryId: string | null
  contextId: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
}): Promise<void> {
  const owner = await ownerId()
  const status = data.canonicalCategoryId && data.contextId ? 'mapped' : 'review'
  const { error } = await supabase.from('category_classifications').upsert({
    owner_id: owner,
    legacy_category_id: categoryId,
    canonical_category_id: data.canonicalCategoryId,
    context_id: data.contextId,
    bucket_id: data.bucketId,
    tax_treatment: data.taxTreatment,
    migration_status: status,
    notes: 'Owner-reviewed mapping',
  }, { onConflict: 'legacy_category_id' })
  fail(error)
  const { error: transactionError } = await supabase.from('transactions').update({
    canonical_category_id: data.canonicalCategoryId,
    context_id: data.contextId,
    bucket_id: data.bucketId,
    tax_treatment: data.taxTreatment,
    updated_at: new Date().toISOString(),
  }).eq('category_id', categoryId)
  fail(transactionError)
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
    canonicalCategoryId: 'canonical_category_id',
    contextId: 'context_id',
    bucketId: 'bucket_id',
    reimbursementStatus: 'reimbursement_status',
    taxTreatment: 'tax_treatment',
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
  const included = transactions.filter(
    (transaction) => !transaction.isTransfer && transaction.status === 'C',
  )
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
            transaction.categoryId === row.category_id &&
            transaction.amount < 0 &&
            transaction.status === 'C',
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

type MerchantHistoryGroup = {
  name: string
  aliases: Set<string>
  transactionIds: string[]
  totalAmount: number
  firstSeen: string
  lastSeen: string
  categoryCounts: Map<string, { name: string; color: string; count: number }>
}

async function listMerchantInsights(): Promise<MerchantInsight[]> {
  const [transactions, merchantResult, aliasResult] = await Promise.all([
    listTransactions(),
    supabase.from('merchants').select('id,name,normalized_name,default_category_id,default_canonical_category_id,default_context_id,default_bucket_id,default_tax_treatment'),
    supabase.from('merchant_aliases').select('merchant_id,alias'),
  ])
  fail(merchantResult.error)
  fail(aliasResult.error)
  const remembered = new Map((merchantResult.data ?? []).map(row => [row.normalized_name, row]))
  const aliasesByMerchant = new Map<string, string[]>()
  for (const alias of aliasResult.data ?? []) {
    aliasesByMerchant.set(alias.merchant_id, [...(aliasesByMerchant.get(alias.merchant_id) ?? []), alias.alias])
  }
  const groups = new Map<string, MerchantHistoryGroup>()

  for (const transaction of transactions) {
    if (transaction.status !== 'C' || transaction.isTransfer) continue
    const key = merchantKey(transaction.description)
    if (!key) continue
    const current: MerchantHistoryGroup = groups.get(key) ?? {
      name: merchantDisplayName(transaction.description),
      aliases: new Set<string>(),
      transactionIds: [] as string[],
      totalAmount: 0,
      firstSeen: transaction.date,
      lastSeen: transaction.date,
      categoryCounts: new Map<string, { name: string; color: string; count: number }>(),
    }
    current.aliases.add(transaction.description)
    current.transactionIds.push(transaction.id)
    current.totalAmount += Math.abs(transaction.amount)
    if (transaction.date < current.firstSeen) current.firstSeen = transaction.date
    if (transaction.date > current.lastSeen) {
      current.lastSeen = transaction.date
      current.name = merchantDisplayName(transaction.description)
    }
    if (transaction.categoryId && transaction.categoryFullName && !/^\?+$/.test(transaction.categoryFullName.trim())) {
      const category = current.categoryCounts.get(transaction.categoryId) ?? {
        name: transaction.categoryFullName,
        color: transaction.categoryColor ?? '#64748b',
        count: 0,
      }
      category.count += 1
      current.categoryCounts.set(transaction.categoryId, category)
    }
    groups.set(key, current)
  }

  return [...groups.entries()].map(([key, group]) => {
    const rule = remembered.get(key)
    const candidates = [...group.categoryCounts.entries()]
      .map(([categoryId, category]) => ({
        categoryId,
        categoryName: category.name,
        categoryColor: category.color,
        count: category.count,
        percentage: category.count / group.transactionIds.length,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 3)
    const rememberedCategoryId = rule?.default_category_id ?? null
    const top = rememberedCategoryId
      ? candidates.find(candidate => candidate.categoryId === rememberedCategoryId) ?? candidates[0]
      : candidates[0]
    return {
      merchantId: rule?.id ?? null,
      key,
      name: rule?.name ?? group.name,
      aliases: [...group.aliases].slice(0, 8),
      transactionIds: group.transactionIds,
      transactionCount: group.transactionIds.length,
      totalAmount: group.totalAmount,
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
      confidence: rule ? 1 : top?.percentage ?? 0,
      categoryId: rememberedCategoryId ?? top?.categoryId ?? null,
      remembered: Boolean(rule),
      rulePhrases: rule ? aliasesByMerchant.get(rule.id) ?? [] : [],
      candidates,
      canonicalCategoryId: rule?.default_canonical_category_id ?? null,
      contextId: rule?.default_context_id ?? null,
      bucketId: rule?.default_bucket_id ?? null,
      taxTreatment: rule?.default_tax_treatment ?? 'none',
    }
  }).sort((left, right) => right.transactionCount - left.transactionCount || left.name.localeCompare(right.name))
}

async function applyMerchantCategory(data: {
  key: string
  name: string
  aliases: string[]
  transactionIds: string[]
  categoryId: string
}): Promise<void> {
  const owner = await ownerId()
  const { data: merchant, error } = await supabase.from('merchants').upsert({
    owner_id: owner,
    name: data.name,
    normalized_name: data.key,
    default_category_id: data.categoryId,
  }, { onConflict: 'owner_id,normalized_name' }).select('id').single()
  fail(error)
  if (!merchant) throw new Error('Could not save the merchant rule.')

  const aliases = [...new Map(data.aliases.map(alias => [normalizeDescription(alias), alias])).entries()]
    .filter(([normalized]) => normalized)
    .map(([normalized, alias]) => ({
      owner_id: owner,
      merchant_id: merchant.id,
      alias,
      normalized_alias: normalized,
    }))
  if (aliases.length) {
    const { error: aliasError } = await supabase.from('merchant_aliases').upsert(aliases, { onConflict: 'owner_id,normalized_alias' })
    fail(aliasError)
  }
  for (let index = 0; index < data.transactionIds.length; index += 500) {
    const { error: transactionError } = await supabase.from('transactions').update({
      category_id: data.categoryId,
      merchant_id: merchant.id,
      updated_at: new Date().toISOString(),
    }).in('id', data.transactionIds.slice(index, index + 500))
    fail(transactionError)
  }
  merchantRuleCache = null
}

async function saveMerchantRule(data: {
  merchantId: string | null
  key: string
  name: string
  phrases: string[]
  categoryId: string
  transactionIds: string[]
  canonicalCategoryId: string | null
  contextId: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
}): Promise<void> {
  const owner = await ownerId()
  const normalizedName = data.key
  const { data: merchant, error } = await supabase.from('merchants').upsert({
    owner_id: owner,
    name: data.name.trim(),
    normalized_name: normalizedName,
    default_category_id: data.categoryId,
    default_canonical_category_id: data.canonicalCategoryId,
    default_context_id: data.contextId,
    default_bucket_id: data.bucketId,
    default_tax_treatment: data.taxTreatment,
  }, { onConflict: 'owner_id,normalized_name' }).select('id').single()
  fail(error)
  if (!merchant) throw new Error('Could not save the merchant rule.')

  if (data.merchantId) {
    const { error: deleteError } = await supabase.from('merchant_aliases').delete().eq('merchant_id', data.merchantId)
    fail(deleteError)
  }
  const phrases = [...new Map(data.phrases.map(phrase => [normalizeDescription(phrase), phrase.trim()])).entries()]
    .filter(([normalized, phrase]) => normalized.length >= 2 && phrase)
    .map(([normalized, phrase]) => ({ owner_id: owner, merchant_id: merchant.id, alias: phrase, normalized_alias: normalized }))
  if (phrases.length) {
    const { error: phraseError } = await supabase.from('merchant_aliases').upsert(phrases, { onConflict: 'owner_id,normalized_alias' })
    fail(phraseError)
  }
  for (let index = 0; index < data.transactionIds.length; index += 500) {
    const { error: transactionError } = await supabase.from('transactions').update({
      merchant_id: merchant.id,
      category_id: data.categoryId,
      canonical_category_id: data.canonicalCategoryId,
      context_id: data.contextId,
      bucket_id: data.bucketId,
      tax_treatment: data.taxTreatment,
      updated_at: new Date().toISOString(),
    }).in('id', data.transactionIds.slice(index, index + 500))
    fail(transactionError)
  }
  merchantRuleCache = null
}

export const api = {
  members: {
    list: listHouseholdMembers,
  },
  allocation: {
    plan: getAllocationPlan,
  },
  accounts: {
    list: listAccounts,
    add: async (
      data: Pick<Account, 'name' | 'type' | 'color' | 'initialBalance'> & {
        groupName?: string | null
        memberId: string
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
          member_id: data.memberId,
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
      if (data.lastUpdatedOn !== undefined) payload.last_updated_on = data.lastUpdatedOn
      if (data.memberId !== undefined) payload.member_id = data.memberId
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
  merchants: {
    list: listMerchantInsights,
    applyCategory: applyMerchantCategory,
    saveRule: saveMerchantRule,
  },
  classification: {
    options: listClassificationOptions,
    mappings: listCategoryMappings,
    saveMapping: saveCategoryMapping,
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
          .filter((transaction) => !transaction.isTransfer && transaction.status === 'C')
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
          const normal = rows.filter((row) => !row.isTransfer && row.status === 'C')
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
    bankCsvPreview: async (_path: string, _accountId: string, onProgress?: ImportPreviewProgress): Promise<{ format: string; rows: any[] }> => {
      return bankPreview(_path, _accountId, onProgress)
    },
    bankCsv: async (
      _path: string,
      _accountId: string,
      _assignments: Record<number, BankImportAssignment | '__skip__'>,
    ): Promise<ImportResult> => {
      return importBank(_path, _accountId, _assignments)
    },
  },
  db: {
    backup: downloadBackup,
    restore: restoreBackup,
  },
}
