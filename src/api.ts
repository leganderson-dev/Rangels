import { supabase } from './lib/supabase'
import type {
  Account,
  AccountLedgerSummary,
  AllocationPlanSummary,
  Budget,
  Category,
  ClassificationOptions,
  ImportResult,
  MerchantInsight,
  MonthSummary,
  ScheduledTransaction,
  Transaction,
  TransactionFilter,
  HouseholdMember,
  BulkTransactionChanges,
  TransferReason,
} from './types/finance'
import { parseBankExport } from './lib/importers'
import { createCategoryMatcher, normalizeDescription, relevantCategorySuggestions, transactionDuplicateKey } from './lib/matching'
import { parseDelimited } from './lib/csv'
import { merchantDisplayName, merchantKey, normalizeMerchantRulePhrase } from './lib/merchants'
import { inferTransferClassification, isJuliaTransferDescription, isTransferFromAndersonDescription } from './lib/transfers'
import { nextScheduledDate, scheduledDatesBetween } from './lib/schedule'
import { today as localToday } from './utils'

const pickedFiles = new Map<string, { name: string; text: string }>()
let classificationOptionsCache: Promise<ClassificationOptions> | null = null
let accountMetadataCache: { expiresAt: number; promise: Promise<Row[]> } | null = null
let householdMembersCache: Promise<HouseholdMember[]> | null = null
const transactionQueryCache = new Map<string, { expiresAt: number; promise: Promise<Transaction[]> }>()

function invalidateTransactionQueries() {
  transactionQueryCache.clear()
}

function invalidateAccountMetadata() {
  accountMetadataCache = null
}

function invalidatePurposeMetadata() {
  classificationOptionsCache = null
  invalidateTransactionQueries()
}

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
  const [accountResult, categoryResult, mappingResult, contextResult] = await Promise.all([supabase.from('accounts').select('id,name'), supabase.from('categories').select('id,path'), supabase.from('category_classifications').select('legacy_category_id,canonical_category_id,context_id,bucket_id,tax_treatment,migration_status'), supabase.from('contexts').select('id,name')])
  fail(accountResult.error); fail(categoryResult.error); fail(mappingResult.error); fail(contextResult.error)
  const accounts = new Map((accountResult.data ?? []).map(row => [row.name, row.id]))
  const legacyIdsByPath = new Map((categoryResult.data ?? []).map(row => [row.path, row.id]))
  const mappingsByLegacyId = new Map((mappingResult.data ?? []).map(row => [row.legacy_category_id, row]))
  const contexts = new Map((contextResult.data ?? []).map(row => [row.name, row.id]))
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
    const legacyPath = row[at('Category')]?.trim() || 'None'
    const mapping = mappingsByLegacyId.get(legacyIdsByPath.get(legacyPath) ?? '')
    const originalComment = at('Comment') >= 0 ? row[at('Comment')] ?? '' : ''
    const comment = `${originalComment ? `${originalComment.trim()}\n` : ''}Legacy classification: ${legacyPath}`
    const transferClassification = isTransfer ? inferTransferClassification(sourceName, targetName, description) : null
    payloads.push({ owner_id: owner, account_id: accountId, target_account_id: isTransfer ? accounts.get(targetName) ?? null : null, category_id: null, legacy_category_id: null, canonical_category_id: isTransfer ? null : mapping?.canonical_category_id ?? null, context_id: isTransfer ? (transferClassification?.contextName ? contexts.get(transferClassification.contextName) ?? null : null) : mapping?.context_id ?? null, bucket_id: isTransfer ? null : mapping?.bucket_id ?? null, tax_treatment: isTransfer ? 'none' : mapping?.tax_treatment ?? 'none', occurred_on: alzexDate(row[at('Date')]), description, normalized_description: normalizeDescription(description), amount: transactionAmount, comment, status, is_transfer: isTransfer, transfer_reason: transferClassification?.reason ?? null, classification_reviewed_at: isTransfer || mapping?.migration_status === 'mapped' ? new Date().toISOString() : null, external_id: externalId })
    if (externalId) knownExternalIds.add(externalId)
  }
  for (let index = 0; index < payloads.length; index += 500) {
    const batch = payloads.slice(index, index + 500)
    const { error } = await supabase.from('transactions').insert(batch)
    if (error) errors.push(error.message)
    else imported += batch.length
  }
  invalidateTransactionQueries()
  return { imported, skipped, errors: errors.slice(0, 20) }
}

const backupTables = ['household_members', 'accounts', 'categories', 'contexts', 'buckets', 'canonical_categories', 'category_classifications', 'allocation_plans', 'allocation_targets', 'merchants', 'merchant_aliases', 'imports', 'transactions', 'scheduled_transactions', 'schedule_suggestion_dismissals', 'budgets', 'budget_groups', 'budget_group_members'] as const

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
    supabase.from('merchants').select('id,normalized_name,default_category_id,default_canonical_category_id,default_context_id,default_bucket_id,default_tax_treatment').not('default_canonical_category_id', 'is', null),
    supabase.from('merchant_aliases').select('merchant_id,alias,normalized_alias'),
  ])
  fail(merchantResult.error)
  fail(aliasResult.error)
  const byMerchantId = new Map((merchantResult.data ?? []).map(merchant => [merchant.id, {
    merchantId: merchant.id,
    categoryId: merchant.default_canonical_category_id!,
    canonicalCategoryId: merchant.default_canonical_category_id,
    contextId: merchant.default_context_id,
    bucketId: merchant.default_bucket_id,
    taxTreatment: merchant.default_tax_treatment,
  }]))
  return {
    byKey: new Map((merchantResult.data ?? []).map(merchant => [merchant.normalized_name, byMerchantId.get(merchant.id)!])),
    aliases: (aliasResult.data ?? [])
      .map(alias => ({ phrase: normalizeMerchantRulePhrase(alias.alias || alias.normalized_alias), rule: byMerchantId.get(alias.merchant_id) }))
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
  const normalized = normalizeMerchantRulePhrase(description)
  return rules.aliases.find(alias =>
    normalized === alias.phrase || normalized.includes(alias.phrase) || key.includes(alias.phrase)
  )?.rule ?? null
}

type ImportPreviewProgress = (event: { stage: 'found' | 'duplicates' | 'categorizing' | 'done'; count?: number }) => void

async function requireActiveImportAccount(accountId: string): Promise<{ name: string; is_active: boolean }> {
  const { data, error } = await supabase.from('accounts').select('name,is_active').eq('id', accountId).single()
  fail(error)
  if (!data?.is_active) throw new Error('This account is inactive and cannot receive imports.')
  return data
}

async function bankPreview(token: string, accountId: string, onProgress?: ImportPreviewProgress) {
  await requireActiveImportAccount(accountId)
  const file = pickedFiles.get(token)
  if (!file) throw new Error('Please choose the CSV again.')
  const parsed = parseBankExport(file.text)
  onProgress?.({ stage: 'found', count: parsed.rows.length })
  const [transactionRows, categoryResult, merchantRules, accountResult] = await Promise.all([
    fetchAllRows(() => supabase.from('transactions')
      .select('account_id,target_account_id,occurred_on,amount,description,canonical_category_id,is_transfer')),
    supabase.from('canonical_categories').select('id,name,family,type'),
    cachedMerchantClassificationRules(),
    supabase.from('accounts').select('id,name,is_active'),
  ])
  fail(categoryResult.error)
  fail(accountResult.error)
  const categories = categoryResult.data ?? []
  const categoryPathById = new Map(categories.map(category => [category.id, `${category.family}: ${category.name}`]))
  const history = transactionRows
    .filter(transaction => transaction.canonical_category_id && categoryPathById.has(transaction.canonical_category_id))
    .map(transaction => ({ description: transaction.description, category: transaction.canonical_category_id }))
  const matchHistory = createCategoryMatcher(history)
  const byPath = new Map(categories.map(category => [category.id, category]))
  const byId = new Map(categories.map(category => [category.id, category]))
  const juliaAccount = (accountResult.data ?? []).find(account => account.is_active && normalizeDescription(account.name) === 'julia cw')
  const andersonAccount = (accountResult.data ?? []).find(account => account.is_active && normalizeDescription(account.name) === 'leg cw')
  const existingKeys = new Set(
    transactionRows
      .filter(transaction => transaction.account_id === accountId)
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
      const baseDuplicate = duplicateMetadata[index]
      const isOutgoingJuliaTransfer = Boolean(
        juliaAccount &&
        juliaAccount.id !== accountId &&
        isJuliaTransferDescription(row.description),
      )
      const isIncomingJuliaTransfer = Boolean(
        juliaAccount &&
        andersonAccount &&
        accountId === juliaAccount.id &&
        isTransferFromAndersonDescription(row.description),
      )
      const isJuliaTransfer = isOutgoingJuliaTransfer || isIncomingJuliaTransfer
      const sourceAccount = isIncomingJuliaTransfer ? andersonAccount! : (accountResult.data ?? []).find(account => account.id === accountId)
      const targetAccount = isJuliaTransfer ? juliaAccount! : null
      const matchedExistingTransfer = isIncomingJuliaTransfer
        ? transactionRows.find(transaction =>
            transaction.is_transfer &&
            transaction.account_id === sourceAccount?.id &&
            transaction.target_account_id === targetAccount?.id &&
            Math.abs(Date.parse(transaction.occurred_on) - Date.parse(row.date)) <= 2 * 24 * 60 * 60 * 1000 &&
            Math.abs(Number(transaction.amount)) === Math.abs(row.amount),
          )
        : null
      const duplicate = baseDuplicate.duplicate || Boolean(matchedExistingTransfer)
      const duplicateReason = matchedExistingTransfer
        ? `Matches existing transfer from ${sourceAccount?.name ?? 'Anderson'} to ${targetAccount?.name ?? 'Julia'}`
        : baseDuplicate.duplicateReason
      // Rank every non-zero match. Even low-confidence analysis rows should
      // begin with their highest score selected and remain editable.
      const matchedRule = isJuliaTransfer ? null : matchMerchantRule(row.description, merchantRules)
      const ruleCategoryId = matchedRule?.categoryId
      const ruleCategory = ruleCategoryId ? byId.get(ruleCategoryId) : null
      const suggestions = relevantCategorySuggestions(matchHistory(row.description, Number.EPSILON))
      const learnedSuggestions = suggestions
        .map(suggestion => {
          const category = byPath.get(suggestion.category)
          return category ? {
            categoryId: category.id,
            categoryName: `${category.family}: ${category.name}`,
            confidence: suggestion.confidence,
            reason: `Matched “${suggestion.matchedDescription}”`,
          } : null
        })
        .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null)
        .slice(0, 3)
      const rankedSuggestions = ruleCategory ? [{
        categoryId: ruleCategory.id,
        categoryName: `${ruleCategory.family}: ${ruleCategory.name}`,
        confidence: 1,
        reason: 'Remembered merchant classification',
      }, ...learnedSuggestions.filter(suggestion => suggestion.categoryId !== ruleCategory.id)].slice(0, 3) : learnedSuggestions
      const best = rankedSuggestions[0]
      return {
        index,
        ...row,
        suggestedCategoryId: isJuliaTransfer ? null : best?.categoryId ?? null,
        suggestedCategoryName: isJuliaTransfer ? null : best?.categoryName ?? null,
        confidence: isJuliaTransfer ? 1 : best?.confidence ?? 0,
        reason: isJuliaTransfer ? 'Matched transfer trigger “Transfer To Julia Meyer Pflug”' : best?.reason ?? 'No previous merchant match',
        suggestions: isJuliaTransfer ? [] : rankedSuggestions,
        suggestedTransfer: isJuliaTransfer ? {
          sourceAccountId: sourceAccount!.id,
          sourceAccountName: sourceAccount!.name,
          targetAccountId: targetAccount!.id,
          targetAccountName: targetAccount!.name,
          transferReason: 'joint_contribution' as const,
          amount: isIncomingJuliaTransfer ? -Math.abs(row.amount) : row.amount,
        } : null,
        rememberedClassification: matchedRule ? {
          canonicalCategoryId: matchedRule.canonicalCategoryId,
          contextId: matchedRule.contextId,
          bucketId: matchedRule.bucketId,
          taxTreatment: matchedRule.taxTreatment,
        } : null,
        duplicate,
        duplicateReason,
      }
    })
  onProgress?.({ stage: 'done' })
  return { format: parsed.format, rows }
}

async function rememberBankClassificationRule(description: string, classification: {
  canonicalCategoryId: string
  contextId: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
}): Promise<void> {
  const name = merchantDisplayName(description)
  await saveMerchantRule({
    merchantId: null,
    key: merchantKey(description),
    name,
    phrases: [...new Set([name, description])],
    categoryId: classification.canonicalCategoryId,
    canonicalCategoryId: classification.canonicalCategoryId,
    contextId: classification.contextId,
    bucketId: classification.bucketId,
    taxTreatment: classification.taxTreatment,
    transactionIds: [],
  })
}

type BankImportAssignment = { categoryId: string | null; canonicalCategoryId?: string | null; contextId?: string | null; bucketId?: string | null; taxTreatment?: string; reimbursementStatus?: string; tags?: string[]; isTransfer?: boolean; sourceAccountId?: string | null; targetAccountId?: string | null; transferReason?: TransferReason | null; amount?: number }

async function importBank(token: string, accountId: string, assignments: Record<number, BankImportAssignment | '__skip__'>): Promise<ImportResult> {
  const account = await requireActiveImportAccount(accountId)
  const file = pickedFiles.get(token)
  if (!file) throw new Error('Please choose the CSV again.')
  const parsed = parseBankExport(file.text)
  const owner = await ownerId()
  const fingerprint = await fileHash(file.text)
  const dates = parsed.rows.map(row => row.date).sort()
  const diagnosticBase = {
    accountName: account.name,
    fileName: file.name,
    rowCount: parsed.rows.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  }
  const { data: previousImport, error: previousImportError } = await supabase.from('imports')
    .select('id,created_at')
    .eq('owner_id', owner)
    .eq('account_id', accountId)
    .eq('file_fingerprint', fingerprint)
    .maybeSingle()
  fail(previousImportError)
  let importRow = previousImport
  let recovered = false
  if (previousImport) {
    const rowsStillRequested = parsed.rows.reduce(
      (count, _row, index) => count + (assignments[index] === '__skip__' ? 0 : 1),
      0,
    )
    const { count, error: countError } = await supabase.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('import_id', previousImport.id)
    fail(countError)
    // The preview marks rows already present in the account as skipped. Only call
    // the file complete when it has no rows left to submit. A partially completed
    // import must resume even when one or more rows were saved previously.
    if (rowsStillRequested === 0) {
      pickedFiles.delete(token)
      return {
        imported: 0,
        skipped: parsed.rows.length,
        errors: [],
        diagnostics: {
          outcome: 'already_imported',
          ...diagnosticBase,
          previousAttemptAt: previousImport.created_at,
          linkedTransactions: count ?? 0,
        },
      }
    }
    recovered = true
  } else {
    const { data, error: importError } = await supabase.from('imports').insert({ owner_id: owner, account_id: accountId, file_name: file.name, bank_format: parsed.format, file_fingerprint: fingerprint, row_count: parsed.rows.length }).select('id,created_at').single()
    fail(importError)
    importRow = data
  }
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
      .map(transaction => transactionDuplicateKey(accountId, transaction.occurred_on, Number(transaction.amount), transaction.description)),
  )
  const payloads: Row[] = []
  for (const [index, row] of parsed.rows.entries()) {
    const assignment = assignments[index]
    if (assignment === '__skip__') { skipped += 1; continue }
    const duplicateKey = transactionDuplicateKey(accountId, row.date, row.amount, row.description)
    if (duplicateKeys.has(duplicateKey)) { skipped += 1; continue }
    duplicateKeys.add(duplicateKey)
    const sourceAccountId = assignment?.sourceAccountId ?? accountId
    const isTransfer = Boolean(assignment?.isTransfer && assignment.targetAccountId && assignment.targetAccountId !== sourceAccountId)
    const merchantRule = isTransfer ? null : matchMerchantRule(row.description, merchantRules)
    payloads.push({ owner_id: owner, import_id: importRow.id, account_id: isTransfer ? sourceAccountId : accountId, target_account_id: isTransfer ? assignment?.targetAccountId : null, merchant_id: merchantRule?.merchantId ?? null, category_id: null, legacy_category_id: null, canonical_category_id: isTransfer ? null : assignment?.canonicalCategoryId ?? assignment?.categoryId ?? merchantRule?.canonicalCategoryId ?? null, context_id: isTransfer ? null : assignment?.contextId ?? merchantRule?.contextId ?? null, bucket_id: isTransfer ? null : assignment?.bucketId ?? merchantRule?.bucketId ?? null, tax_treatment: isTransfer ? 'none' : assignment?.taxTreatment ?? merchantRule?.taxTreatment ?? 'none', reimbursement_status: isTransfer ? 'none' : assignment?.reimbursementStatus ?? 'none', tags: assignment?.tags ?? [], occurred_on: row.date, description: row.description, normalized_description: normalizeDescription(row.description), amount: isTransfer ? assignment?.amount ?? row.amount : row.amount, balance: isTransfer ? null : row.balance ?? null, source_fingerprint: await fileHash(duplicateKey), status: 'C', is_transfer: isTransfer, transfer_reason: isTransfer ? assignment?.transferReason ?? 'account_movement' : null, classification_reviewed_at: isTransfer || assignment?.canonicalCategoryId || assignment?.categoryId || merchantRule?.canonicalCategoryId ? new Date().toISOString() : null })
  }
  for (let index = 0; index < payloads.length; index += 500) {
    const batch = payloads.slice(index, index + 500)
    const { data, error } = await supabase.from('transactions')
      .upsert(batch, { onConflict: 'owner_id,source_fingerprint', ignoreDuplicates: true })
      .select('id')
    if (!error) {
      imported += data?.length ?? 0
      skipped += batch.length - (data?.length ?? 0)
      continue
    }
    // A single invalid row must not discard the whole import. Retry individually
    // so valid rows are retained and the user gets the actual failing reason.
    for (const payload of batch) {
      const { data: inserted, error: rowError } = await supabase.from('transactions')
        .upsert(payload, { onConflict: 'owner_id,source_fingerprint', ignoreDuplicates: true })
        .select('id')
      if (!rowError) {
        if ((inserted?.length ?? 0) > 0) imported += 1
        else skipped += 1
      } else {
        errors.push(`${payload.occurred_on} · ${payload.description}: ${rowError.message}`)
      }
    }
  }
  const { count: linkedTransactions, error: linkedError } = await supabase.from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', importRow.id)
  fail(linkedError)
  pickedFiles.delete(token)
  invalidateTransactionQueries()
  return {
    imported,
    skipped,
    errors: errors.slice(0, 20),
    diagnostics: {
      outcome: errors.length > 0 && imported === 0 ? 'failed' : recovered ? 'recovered' : 'imported',
      ...diagnosticBase,
      previousAttemptAt: previousImport?.created_at ?? null,
      linkedTransactions: linkedTransactions ?? 0,
    },
  }
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
  if (accountMetadataCache && accountMetadataCache.expiresAt > Date.now()) return accountMetadataCache.promise
  const promise = (async () => {
    try {
      const { data, error } = await supabase.from('accounts').select('*').order('display_order').order('name')
      fail(error)
      return data ?? []
    } catch (error) {
      accountMetadataCache = null
      throw error
    }
  })()
  accountMetadataCache = { expiresAt: Date.now() + 30_000, promise }
  return promise
}

async function listAccounts(): Promise<Account[]> {
  const [accounts, balanceResult, members] = await Promise.all([
    rawAccounts(),
    supabase.rpc('account_balance_summary'),
    listHouseholdMembers(),
  ])
  fail(balanceResult.error)
  const memberMap = new Map(members.map(member => [member.id, member.name]))
  const balances = new Map<string, number>((balanceResult.data ?? []).map((row: Row) => [String(row.account_id), Number(row.balance)]))

  return accounts.map((account) => {
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
      balance: balances.get(account.id) ?? Number(account.initial_balance),
    }
  })
}

async function listCategories(): Promise<Category[]> {
  const [categoryResult, countResult] = await Promise.all([
    supabase.from('canonical_categories').select('id,name,family,type,display_order').order('family').order('display_order'),
    supabase.rpc('canonical_category_transaction_counts'),
  ])
  fail(categoryResult.error); fail(countResult.error)
  const rows = categoryResult.data ?? []
  const counts = new Map<string, number>((countResult.data ?? []).map((row: Row) => [String(row.category_id), Number(row.transaction_count)]))

  const palette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#64748b']
  const families = [...new Set(rows.map(row => row.family))]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: null,
    parentName: row.family,
    type: row.type,
    color: palette[Math.max(0, families.indexOf(row.family)) % palette.length],
    fullName: `${row.family}: ${row.name}`,
    txCount: counts.get(row.id) ?? 0,
  }))
}

async function fetchTransactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
  const makeQuery = () => {
    let query = supabase.from('transactions').select('id,description,comment,occurred_on,amount,account_id,target_account_id,canonical_category_id,is_transfer,transfer_reason,status,payee,tags,external_id,context_id,bucket_id,reimbursement_status,tax_treatment,created_at')
    if (filter.transactionId) query = query.eq('id', filter.transactionId)
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
    if (filter.categoryId) query = query.eq('canonical_category_id', filter.categoryId)
    if (filter.search) query = query.ilike('description', `%${filter.search}%`)
    return query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
  }

  const [transactionRows, accounts, members, classification] = await Promise.all([
    fetchAllRows(makeQuery),
    rawAccounts(),
    listHouseholdMembers(),
    listClassificationOptions(),
  ])
  const memberMap = new Map(members.map(member => [member.id, member.name]))
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const contextMap = new Map(classification.contexts.map(item => [item.id, item.name]))
  const bucketMap = new Map(classification.buckets.map(item => [item.id, item.name]))
  const canonicalMap = new Map(classification.categories.map(item => [item.id, item]))
  const palette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#64748b']
  const families = [...new Set(classification.categories.map(item => item.family))].sort()
  const familyColors = new Map(families.map((family, index) => [family, palette[index % palette.length]]))

  return transactionRows.map((row) => {
    const category = row.canonical_category_id ? canonicalMap.get(row.canonical_category_id) : undefined
    const account = accountMap.get(row.account_id)
    const family = category?.family ?? null
    const categoryName = category?.name ?? null
    return {
      id: row.id,
      description: row.description,
      comment: row.comment ?? '',
      date: row.occurred_on,
      amount: Number(row.amount),
      accountId: row.account_id,
      accountName: account?.name ?? '',
      memberId: account?.member_id ?? '',
      memberName: memberMap.get(account?.member_id) ?? 'Unknown',
      targetAccountId: row.target_account_id,
      targetAccountName: row.target_account_id
        ? accountMap.get(row.target_account_id)?.name ?? null
        : null,
      categoryId: row.canonical_category_id,
      categoryName,
      categoryFullName: categoryName && family ? `${family}: ${categoryName}` : categoryName,
      categoryColor: family ? familyColors.get(family) ?? null : null,
      isTransfer: row.is_transfer,
      transferReason: row.transfer_reason ?? null,
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

function listTransactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
  const key = JSON.stringify(filter, Object.keys(filter).sort())
  const cached = transactionQueryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = fetchTransactions(filter).catch(error => {
    transactionQueryCache.delete(key)
    throw error
  })
  transactionQueryCache.set(key, { expiresAt: Date.now() + 30_000, promise })
  return promise
}

async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  if (!householdMembersCache) {
    householdMembersCache = (async () => {
      try {
        const { data, error } = await supabase.from('household_members').select('id,name').order('display_order')
        fail(error)
        return data ?? []
      } catch (error) {
        householdMembersCache = null
        throw error
      }
    })()
  }
  return householdMembersCache!
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
  if (!classificationOptionsCache) {
    classificationOptionsCache = Promise.all([
      supabase.from('contexts').select('id,name').order('display_order'),
      supabase.from('buckets').select('id,name').order('display_order'),
      supabase.from('canonical_categories').select('id,name,family,type').order('display_order'),
    ]).then(([contexts, buckets, categories]) => {
      fail(contexts.error); fail(buckets.error); fail(categories.error)
      return { contexts: contexts.data ?? [], buckets: buckets.data ?? [], categories: (categories.data ?? []) as ClassificationOptions['categories'] }
    }).catch(error => {
      classificationOptionsCache = null
      throw error
    })
  }
  return classificationOptionsCache
}

function transactionPayload(data: Record<string, any>): Row {
  const map: Record<string, string> = {
    description: 'description',
    comment: 'comment',
    date: 'occurred_on',
    amount: 'amount',
    accountId: 'account_id',
    targetAccountId: 'target_account_id',
    categoryId: 'canonical_category_id',
    isTransfer: 'is_transfer',
    transferReason: 'transfer_reason',
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
  if (['canonicalCategoryId', 'contextId', 'bucketId', 'taxTreatment', 'transferReason'].some(key => key in data)) {
    payload.classification_reviewed_at = new Date().toISOString()
  }
  if (data.isTransfer && !('transferReason' in data)) payload.transfer_reason = 'account_movement'
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
  payload.category_id = null
  payload.legacy_category_id = null
  payload.normalized_description = String(data.description ?? '').toLowerCase().trim()
  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select('id')
    .single()
  fail(error)
  if (!inserted) throw new Error('Could not create the transaction.')
  invalidateTransactionQueries()
  return (await listTransactions({ transactionId: inserted.id }))[0]
}

async function updateTransaction(
  id: string,
  data: Record<string, any>,
): Promise<Transaction> {
  const payload = transactionPayload(data)
  payload.updated_at = new Date().toISOString()
  if (['canonicalCategoryId', 'contextId', 'bucketId', 'taxTreatment', 'transferReason'].some(key => key in data)) {
    payload.classification_reviewed_at = new Date().toISOString()
  }
  if (data.description) {
    payload.normalized_description = String(data.description).toLowerCase().trim()
  }
  const { error } = await supabase.from('transactions').update(payload).eq('id', id)
  fail(error)
  invalidateTransactionQueries()
  return (await listTransactions({ transactionId: id }))[0]
}

async function monthSummary(
  month: number,
  year: number,
  accountId?: string | null,
): Promise<MonthSummary> {
  const transactions = await listTransactions({ month, year, accountId })
  const classification = await listClassificationOptions()
  const palette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#64748b']
  const families = [...new Set(classification.categories.map(category => category.family))].sort()
  const familyColors = new Map(families.map((family, index) => [family, palette[index % palette.length]]))
  const categoryMap = new Map(classification.categories.map(category => [category.id, category]))
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
        categoryFullName: categoryMap.has(categoryId) ? `${categoryMap.get(categoryId)!.family}: ${categoryMap.get(categoryId)!.name}` : 'Uncategorised',
        categoryColor: familyColors.get(categoryMap.get(categoryId)?.family ?? '') ?? '#9ca3af',
        total,
      }))
      .sort((left, right) => left.total - right.total),
  }
}

async function accountLedgerSummary(
  accountId: string,
  filter: Pick<TransactionFilter, 'month' | 'year' | 'dateFrom' | 'dateTo'> = {},
): Promise<AccountLedgerSummary> {
  let dateFrom = filter.dateFrom
  let dateTo = filter.dateTo
  if (!dateFrom && filter.month && filter.year) {
    ;[dateFrom, dateTo] = monthRange(filter.month, filter.year)
  }
  const { data, error } = await supabase.rpc('account_ledger_summary', {
    p_account_id: accountId,
    p_date_from: dateFrom ?? null,
    p_date_to: dateTo ?? null,
  })
  fail(error)
  const row = data?.[0]
  if (!row) throw new Error('The selected account could not be summarized.')
  return {
    openingBalance: Number(row.opening_balance),
    income: Number(row.income),
    expenses: Number(row.expenses),
    transfersIn: Number(row.transfers_in),
    transfersOut: Number(row.transfers_out),
    netMovement: Number(row.net_movement),
    closingBalance: Number(row.closing_balance),
  }
}

async function scheduledList(): Promise<ScheduledTransaction[]> {
  const [result, accounts, categories, classification] = await Promise.all([
    supabase.from('scheduled_transactions').select('*').order('next_date'),
    listAccounts(),
    listCategories(),
    listClassificationOptions(),
  ])
  fail(result.error)
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const contextMap = new Map(classification.contexts.map(item => [item.id, item.name]))
  const bucketMap = new Map(classification.buckets.map(item => [item.id, item.name]))
  return (result.data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    accountId: row.account_id,
    accountName: accountMap.get(row.account_id)?.name ?? '',
    targetAccountId: row.target_account_id,
    categoryId: row.canonical_category_id,
    categoryName: row.canonical_category_id ? categoryMap.get(row.canonical_category_id)?.name ?? null : null,
    categoryFullName: row.canonical_category_id
      ? categoryMap.get(row.canonical_category_id)?.fullName ?? null
      : null,
    contextId: row.context_id,
    contextName: row.context_id ? contextMap.get(row.context_id) ?? null : null,
    bucketId: row.bucket_id,
    bucketName: row.bucket_id ? bucketMap.get(row.bucket_id) ?? null : null,
    taxTreatment: row.tax_treatment ?? 'none',
    transferReason: row.transfer_reason ?? null,
    isTransfer: row.is_transfer,
    frequency: row.frequency,
    interval: row.recurrence_interval ?? 1,
    weekdays: row.weekdays ?? [],
    months: row.months ?? [],
    monthDay: row.month_day ?? 1,
    startDate: row.start_date,
    nextDate: row.next_date,
    endDate: row.end_date,
    isActive: row.is_active,
    isVirtual: row.is_virtual ?? false,
  }))
}

function scheduledPayload(data: Record<string, any>): Row {
  const mapping: Record<string, string> = {
    description: 'description',
    amount: 'amount',
    accountId: 'account_id',
    targetAccountId: 'target_account_id',
    categoryId: 'canonical_category_id',
    contextId: 'context_id',
    bucketId: 'bucket_id',
    taxTreatment: 'tax_treatment',
    transferReason: 'transfer_reason',
    isTransfer: 'is_transfer',
    frequency: 'frequency',
    interval: 'recurrence_interval',
    weekdays: 'weekdays',
    months: 'months',
    monthDay: 'month_day',
    startDate: 'start_date',
    nextDate: 'next_date',
    endDate: 'end_date',
    isActive: 'is_active',
    isVirtual: 'is_virtual',
  }
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([source]) => source in data)
      .map(([source, target]) => [target, data[source]]),
  )
}

async function createScheduledOccurrence(item: ScheduledTransaction, runDate: string): Promise<Transaction | null> {
  if (item.isVirtual) return null
  const owner = await ownerId()
  const payload = transactionPayload({
    description: item.description,
    date: runDate,
    amount: item.amount,
    accountId: item.accountId,
    targetAccountId: item.targetAccountId,
    categoryId: item.categoryId,
    contextId: item.contextId,
    bucketId: item.bucketId,
    taxTreatment: item.taxTreatment,
    transferReason: item.transferReason,
    isTransfer: item.isTransfer,
    status: 'C',
    externalId: `schedule:${item.id}:${runDate}`,
  })
  const { data: inserted, error } = await supabase.from('transactions').insert({
    owner_id: owner,
    category_id: null,
    legacy_category_id: null,
    normalized_description: item.description.toLowerCase().trim(),
    ...payload,
  }).select('id').single()
  if (error && error.code !== '23505') fail(error)
  if (!inserted?.id) return null
  return (await listTransactions({ transactionId: inserted.id }))[0]
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
    const category = categoryMap.get(row.canonical_category_id)
    const spent = Math.abs(
      transactions
        .filter(
          (transaction) =>
            transaction.categoryId === row.canonical_category_id &&
            transaction.amount < 0 &&
            transaction.status === 'C',
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    )
    return {
      id: row.id,
      categoryId: row.canonical_category_id,
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
      ids.add(member.canonical_category_id)
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
        categoryId: member.canonical_category_id,
        categoryName: categoryMap.get(member.canonical_category_id)?.name ?? '',
        categoryColor: categoryMap.get(member.canonical_category_id)?.color ?? '#9ca3af',
        categoryParentId: null,
        includeChildren: false,
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
    const rememberedCategoryId = rule?.default_canonical_category_id ?? null
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
    default_category_id: null,
    default_canonical_category_id: data.categoryId,
  }, { onConflict: 'owner_id,normalized_name' }).select('id').single()
  fail(error)
  if (!merchant) throw new Error('Could not save the merchant rule.')

  const aliases = [...new Map(data.aliases.map(alias => [normalizeMerchantRulePhrase(alias), alias])).entries()]
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
      canonical_category_id: data.categoryId,
      classification_reviewed_at: new Date().toISOString(),
      merchant_id: merchant.id,
      updated_at: new Date().toISOString(),
    }).in('id', data.transactionIds.slice(index, index + 500))
    fail(transactionError)
  }
  merchantRuleCache = null
  invalidateTransactionQueries()
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
    default_category_id: null,
    default_canonical_category_id: data.canonicalCategoryId ?? data.categoryId,
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
  const phrases = [...new Map(data.phrases.map(phrase => [normalizeMerchantRulePhrase(phrase), phrase.trim()])).entries()]
    .filter(([normalized, phrase]) => normalized.length >= 2 && phrase)
    .map(([normalized, phrase]) => ({ owner_id: owner, merchant_id: merchant.id, alias: phrase, normalized_alias: normalized }))
  if (phrases.length) {
    const { error: phraseError } = await supabase.from('merchant_aliases').upsert(phrases, { onConflict: 'owner_id,normalized_alias' })
    fail(phraseError)
  }
  for (let index = 0; index < data.transactionIds.length; index += 500) {
    const { error: transactionError } = await supabase.from('transactions').update({
      merchant_id: merchant.id,
      canonical_category_id: data.canonicalCategoryId ?? data.categoryId,
      context_id: data.contextId,
      bucket_id: data.bucketId,
      tax_treatment: data.taxTreatment,
      classification_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).in('id', data.transactionIds.slice(index, index + 500))
    fail(transactionError)
  }
  merchantRuleCache = null
  invalidateTransactionQueries()
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
      data: Pick<Account, 'name' | 'type' | 'color' | 'initialBalance' | 'isActive'> & {
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
          is_active: data.isActive,
        })
        .select('id')
        .single()
      fail(error)
      if (!row) throw new Error('Could not create the account.')
      invalidateAccountMetadata()
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
      if (data.isActive !== undefined) payload.is_active = data.isActive
      const { data: updated, error } = await supabase.from('accounts').update(payload).eq('id', id).select('id,color').single()
      fail(error)
      if (!updated) throw new Error('The account update was not persisted.')
      if (data.color !== undefined && updated.color !== data.color) throw new Error('The selected account color was not persisted.')
      invalidateAccountMetadata()
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('accounts')
        .update({ is_active: false })
        .eq('id', id)
      fail(error)
      invalidateAccountMetadata()
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
      invalidateAccountMetadata()
    },
  },
  merchants: {
    list: listMerchantInsights,
    applyCategory: applyMerchantCategory,
    saveRule: saveMerchantRule,
  },
  classification: {
    options: listClassificationOptions,
  },
  categories: {
    list: listCategories,
    create: async (data: { name: string; family: string; type: 'income' | 'expense' }): Promise<void> => {
      const owner = await ownerId()
      const family = data.family.trim()
      const name = data.name.trim()
      if (!family || !name) throw new Error('A group and Purpose name are required.')
      const { data: last } = await supabase
        .from('canonical_categories')
        .select('display_order')
        .eq('family', family)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { error } = await supabase.from('canonical_categories').insert({
        owner_id: owner,
        family,
        name,
        type: data.type,
        display_order: Number(last?.display_order ?? 0) + 1,
      })
      fail(error)
      invalidatePurposeMetadata()
    },
    update: async (id: string, data: { name: string; family: string; type: 'income' | 'expense' }): Promise<void> => {
      const name = data.name.trim()
      const family = data.family.trim()
      if (!family || !name) throw new Error('A group and Purpose name are required.')
      const { error } = await supabase
        .from('canonical_categories')
        .update({ name, family, type: data.type })
        .eq('id', id)
      fail(error)
      invalidatePurposeMetadata()
    },
    renameGroup: async (from: string, to: string): Promise<void> => {
      const family = to.trim()
      if (!family) throw new Error('A group name is required.')
      const { error } = await supabase
        .from('canonical_categories')
        .update({ family })
        .eq('family', from)
      fail(error)
      invalidatePurposeMetadata()
    },
    delete: async (id: string): Promise<void> => {
      const { count, error: countError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('canonical_category_id', id)
      fail(countError)
      if ((count ?? 0) > 0) throw new Error(`This Purpose is used by ${count} transactions. Reassign those transactions before deleting it.`)
      const { error } = await supabase.from('canonical_categories').delete().eq('id', id)
      fail(error)
      invalidatePurposeMetadata()
    },
  },
  transactions: {
    list: listTransactions,
    accountLedgerSummary,
    add: addTransaction,
    update: updateTransaction,
    split: async (id: string, parts: number): Promise<string[]> => {
      const { data, error } = await supabase.rpc('split_transaction', { p_id: id, p_parts: parts })
      fail(error)
      invalidateTransactionQueries()
      return (data ?? []) as string[]
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      fail(error)
      invalidateTransactionQueries()
    },
    bulkCategory: async (ids: string[], categoryId: string | null): Promise<void> => {
      const { error } = await supabase
        .from('transactions')
        .update({ canonical_category_id: categoryId, classification_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', ids)
      fail(error)
      invalidateTransactionQueries()
    },
    bulkEdit: async (ids: string[], changes: BulkTransactionChanges): Promise<number> => {
      const { data, error } = await supabase.rpc('bulk_edit_transactions', {
        p_ids: ids,
        p_changes: changes,
      })
      fail(error)
      invalidateTransactionQueries()
      return Number(data ?? 0)
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
        .select('description,canonical_category_id')
        .not('canonical_category_id', 'is', null)
        .order('occurred_on', { ascending: false })
        .limit(10000)
      fail(error)
      return (data ?? []).map((row) => ({
        description: row.description,
        categoryId: row.canonical_category_id!,
      }))
    },
    calendarSummary: async (month: number, year: number, accountId?: string) => {
      const [monthStart, monthEnd] = monthRange(month, year)
      const previousDay = new Date(`${monthStart}T00:00:00`)
      previousDay.setDate(previousDay.getDate() - 1)
      const previousDate = previousDay.toISOString().slice(0, 10)
      const [accounts, before, current, selectedLedger, schedules] = await Promise.all([
        listAccounts(),
        accountId ? Promise.resolve([]) : listTransactions({ dateTo: previousDate }),
        listTransactions({ month, year, accountId }),
        accountId ? accountLedgerSummary(accountId, { dateFrom: monthStart, dateTo: monthEnd }) : Promise.resolve(null),
        scheduledList(),
      ])
      const startBalance = selectedLedger
        ? selectedLedger.openingBalance
        : accounts.reduce((sum, account) => sum + account.initialBalance, 0) +
          before
            .filter((transaction) => !transaction.isTransfer && transaction.status === 'C')
            .reduce((sum, transaction) => sum + transaction.amount, 0)
      const grouped = new Map<string, Transaction[]>()
      current.forEach((transaction) => {
        const rows = grouped.get(transaction.date) ?? []
        rows.push(transaction)
        grouped.set(transaction.date, rows)
      })
      const projected = new Map<string, ScheduledTransaction[]>()
      schedules.filter(schedule => schedule.isActive && (
        !accountId || schedule.accountId === accountId || schedule.targetAccountId === accountId
      )).forEach(schedule => {
        scheduledDatesBetween(schedule, monthStart, monthEnd).forEach(date => {
          const rows = projected.get(date) ?? []
          rows.push(schedule)
          projected.set(date, rows)
        })
      })
      let running = startBalance
      const lastDate = new Date(year, month, 0).getDate()
      const days = Array.from({ length: lastDate }, (_, index) => {
          const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
          const rows = grouped.get(date) ?? []
          const projectedRows = projected.get(date) ?? []
          const normal = rows.filter((row) => !row.isTransfer && row.status === 'C')
          const projectedNormal = projectedRows.filter(row => !row.isTransfer)
          const income = normal
            .filter((row) => row.amount > 0)
            .reduce((sum, row) => sum + row.amount, 0) + projectedNormal
              .filter(row => row.amount > 0)
              .reduce((sum, row) => sum + row.amount, 0)
          const expenses = normal
            .filter((row) => row.amount < 0)
            .reduce((sum, row) => sum + row.amount, 0) + projectedNormal
              .filter(row => row.amount < 0)
              .reduce((sum, row) => sum + row.amount, 0)
          const transferMovement = accountId
            ? [...rows.filter(row => row.isTransfer && row.status === 'C'), ...projectedRows.filter(row => row.isTransfer)].reduce((sum, row) => {
                if (row.targetAccountId === accountId) return sum + Math.abs(row.amount)
                if (row.accountId === accountId) return sum - Math.abs(row.amount)
                return sum
              }, 0)
            : 0
          const total = income + expenses + transferMovement
          running += total
          return { date, total, income, expenses, balance: running, transactionCount: rows.length + projectedRows.length, projectedCount: projectedRows.length }
        })
      return { startBalance, days }
    },
  },
  scheduled: {
    list: scheduledList,
    dismissedSuggestionKeys: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('schedule_suggestion_dismissals').select('suggestion_key')
      fail(error)
      return (data ?? []).map(row => row.suggestion_key)
    },
    dismissSuggestions: async (keys: string[]): Promise<void> => {
      if (!keys.length) return
      const owner = await ownerId()
      const { error } = await supabase.from('schedule_suggestion_dismissals').upsert(keys.map(key => ({ owner_id: owner, suggestion_key: key })))
      fail(error)
    },
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
    process: async (id: string): Promise<Transaction | null> => {
      const item = (await scheduledList()).find(schedule => schedule.id === id)
      if (!item || !item.isActive) throw new Error('This scheduled transaction is no longer active.')
      if (item.endDate && item.nextDate > item.endDate) throw new Error('This scheduled transaction has passed its end date.')
      const created = await createScheduledOccurrence(item, item.nextDate)
      const following = nextScheduledDate(item.nextDate, item)
      await api.scheduled.update(item.id, {
        nextDate: following,
        isActive: !item.endDate || following <= item.endDate,
      })
      invalidateTransactionQueries()
      return created
    },
    processDue: async (): Promise<Transaction[]> => {
      const today = localToday()
      const due = (await scheduledList()).filter(
        (item) => item.isActive && item.nextDate <= today,
      )
      const created: Transaction[] = []
      for (const item of due) {
        let runDate = item.nextDate
        while (runDate <= today && (!item.endDate || runDate <= item.endDate)) {
          const transaction = await createScheduledOccurrence(item, runDate)
          if (transaction) created.push(transaction)
          const following = nextScheduledDate(runDate, item)
          const remainsActive = (!item.endDate || following <= item.endDate)
          await api.scheduled.update(item.id, { nextDate: following, isActive: remainsActive })
          runDate = following
          if (!remainsActive) break
        }
      }
      if (created.length) invalidateTransactionQueries()
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
        { owner_id: owner, canonical_category_id: categoryId, month, year, amount },
        { onConflict: 'owner_id,canonical_category_id,month,year' },
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
          canonical_category_id: member.categoryId,
          include_children: false,
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
    rememberClassificationRule: rememberBankClassificationRule,
  },
  db: {
    backup: downloadBackup,
    restore: restoreBackup,
  },
}
