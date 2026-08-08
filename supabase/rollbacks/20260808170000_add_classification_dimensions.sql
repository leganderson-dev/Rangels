drop trigger if exists transactions_apply_category_classification on public.transactions;
drop function if exists public.apply_category_classification();
drop index if exists public.transactions_context_idx;
drop index if exists public.transactions_bucket_idx;
drop index if exists public.transactions_canonical_category_idx;
alter table public.transactions
  drop column if exists tax_treatment,
  drop column if exists reimbursement_status,
  drop column if exists bucket_id,
  drop column if exists context_id,
  drop column if exists canonical_category_id,
  drop column if exists legacy_category_id;
drop table if exists public.category_classifications;
drop table if exists public.canonical_categories;
drop table if exists public.buckets;
drop table if exists public.contexts;
