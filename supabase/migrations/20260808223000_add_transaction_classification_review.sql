alter table public.transactions
  add column if not exists classification_reviewed_at timestamptz;

-- Existing owner-approved category mappings are already reviewed. Conservative
-- transfer backfills and unresolved/protected mappings deliberately remain queued.
update public.transactions t
set classification_reviewed_at = coalesce(t.updated_at, now())
from public.category_classifications cc
where cc.legacy_category_id = t.category_id
  and cc.migration_status = 'mapped'
  and not t.is_transfer
  and t.classification_reviewed_at is null;

comment on column public.transactions.classification_reviewed_at is
  'Set when an owner explicitly approves this transaction classification or an approved legacy mapping applies it.';
