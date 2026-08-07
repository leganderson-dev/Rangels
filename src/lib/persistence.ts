import { supabase } from './supabase'
import { normalizeDescription } from './matching'
import type { HistoricalTransaction, ImportedTransaction } from '../types/import'

type CommitImportInput = {
  ownerId: string
  accountName: string
  institution: string
  fileName: string
  fileFingerprint: string
  history: HistoricalTransaction[]
  transactions: ImportedTransaction[]
}

function requireData<T>(data: T | null, message: string): T {
  if (!data) throw new Error(message)
  return data
}

function allCategoryPaths(categories: string[]): string[] {
  const paths = new Set<string>()

  for (const category of categories) {
    const levels = category.split(':')
    levels.forEach((_, index) => paths.add(levels.slice(0, index + 1).join(':')))
  }

  return [...paths].sort(
    (left, right) => left.split(':').length - right.split(':').length,
  )
}

function toIsoDate(australianDate: string): string {
  const [day, month, year] = australianDate.split('/')
  return `${year}-${month}-${day}`
}

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function fingerprintFile(contents: string): Promise<string> {
  return fingerprint(contents)
}

export async function commitImport(input: CommitImportInput): Promise<number> {
  const selectedCategories = input.transactions.map(({ selectedCategory }) => {
    if (!selectedCategory) throw new Error('Every transaction needs a category.')
    return selectedCategory
  })
  const categoryPaths = allCategoryPaths([
    ...input.history.map(({ category }) => category),
    ...selectedCategories,
  ])

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .upsert(
      {
        owner_id: input.ownerId,
        name: input.accountName,
        institution: input.institution,
      },
      { onConflict: 'owner_id,name' },
    )
    .select('id')
    .single()
  if (accountError) throw accountError
  const accountId = requireData(account, 'Could not create the account.').id

  const { data: initialCategories, error: categoryError } = await supabase
    .from('categories')
    .upsert(
      categoryPaths.map((path) => ({
        owner_id: input.ownerId,
        path,
        name: path.split(':').at(-1) ?? path,
      })),
      { onConflict: 'owner_id,path' },
    )
    .select('id,path')
  if (categoryError) throw categoryError
  const categoryIds = new Map(
    requireData(initialCategories, 'Could not create categories.').map((category) => [
      category.path,
      category.id,
    ]),
  )

  const { error: hierarchyError } = await supabase.from('categories').upsert(
    categoryPaths.map((path) => {
      const levels = path.split(':')
      const parentPath = levels.slice(0, -1).join(':')
      return {
        id: categoryIds.get(path),
        owner_id: input.ownerId,
        path,
        name: levels.at(-1) ?? path,
        parent_id: parentPath ? categoryIds.get(parentPath) : null,
      }
    }),
    { onConflict: 'owner_id,path' },
  )
  if (hierarchyError) throw hierarchyError

  const merchantKnowledge = new Map<
    string,
    { name: string; categoryCounts: Map<string, number> }
  >()

  for (const transaction of input.history) {
    const normalized = normalizeDescription(transaction.description)
    if (!normalized) continue
    const current = merchantKnowledge.get(normalized) ?? {
      name: transaction.description,
      categoryCounts: new Map<string, number>(),
    }
    current.categoryCounts.set(
      transaction.category,
      (current.categoryCounts.get(transaction.category) ?? 0) + 1,
    )
    merchantKnowledge.set(normalized, current)
  }

  input.transactions.forEach((transaction, index) => {
    const normalized = normalizeDescription(transaction.description)
    if (!normalized) return
    merchantKnowledge.set(normalized, {
      name: transaction.description,
      categoryCounts: new Map([[selectedCategories[index], Number.MAX_SAFE_INTEGER]]),
    })
  })

  const merchantRows = [...merchantKnowledge.entries()].map(
    ([normalizedName, knowledge]) => {
      const defaultCategory = [...knowledge.categoryCounts.entries()].sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0]
      return {
        owner_id: input.ownerId,
        name: knowledge.name,
        normalized_name: normalizedName,
        default_category_id: defaultCategory
          ? categoryIds.get(defaultCategory)
          : null,
      }
    },
  )

  const { data: merchants, error: merchantError } = await supabase
    .from('merchants')
    .upsert(merchantRows, { onConflict: 'owner_id,normalized_name' })
    .select('id,normalized_name')
  if (merchantError) throw merchantError
  const merchantIds = new Map(
    requireData(merchants, 'Could not create merchants.').map((merchant) => [
      merchant.normalized_name,
      merchant.id,
    ]),
  )

  const aliases = new Map<string, { alias: string; merchantId: string }>()
  for (const transaction of [
    ...input.history,
    ...input.transactions.map((transaction) => ({
      description: transaction.description,
      category: transaction.selectedCategory ?? '',
    })),
  ]) {
    const normalizedAlias = normalizeDescription(transaction.description)
    const merchantId = merchantIds.get(normalizedAlias)
    if (normalizedAlias && merchantId) {
      aliases.set(normalizedAlias, {
        alias: transaction.description,
        merchantId,
      })
    }
  }

  const { error: aliasError } = await supabase.from('merchant_aliases').upsert(
    [...aliases.entries()].map(([normalizedAlias, alias]) => ({
      owner_id: input.ownerId,
      merchant_id: alias.merchantId,
      alias: alias.alias,
      normalized_alias: normalizedAlias,
    })),
    { onConflict: 'owner_id,normalized_alias' },
  )
  if (aliasError) throw aliasError

  const { data: importBatch, error: importError } = await supabase
    .from('imports')
    .insert({
      owner_id: input.ownerId,
      account_id: accountId,
      file_name: input.fileName,
      bank_format: 'four-column-v1',
      file_fingerprint: input.fileFingerprint,
      row_count: input.transactions.length,
    })
    .select('id')
    .single()
  if (importError) {
    if (importError.code === '23505') {
      throw new Error('This bank file has already been imported.')
    }
    throw importError
  }
  const importId = requireData(importBatch, 'Could not create the import.').id

  try {
    const rows = await Promise.all(
      input.transactions.map(async (transaction, index) => {
        const normalized = normalizeDescription(transaction.description)
        return {
          owner_id: input.ownerId,
          import_id: importId,
          account_id: accountId,
          merchant_id: merchantIds.get(normalized) ?? null,
          category_id: categoryIds.get(selectedCategories[index]),
          occurred_on: toIsoDate(transaction.date),
          description: transaction.description,
          normalized_description: normalized,
          amount: transaction.amount,
          balance: transaction.balance,
          source_fingerprint: await fingerprint(
            `${accountId}|${transaction.date}|${transaction.amount}|${transaction.description}|${transaction.balance}`,
          ),
        }
      }),
    )

    const { error: transactionError } = await supabase.from('transactions').insert(rows)
    if (transactionError) throw transactionError
  } catch (error) {
    await supabase.from('imports').delete().eq('id', importId)
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new Error('One or more transactions were already imported.')
    }
    throw error
  }

  return input.transactions.length
}
