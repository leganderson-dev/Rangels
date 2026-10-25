drop trigger if exists transactions_validate_reporting_member on public.transactions;
drop function if exists public.validate_transaction_reporting_member();
drop index if exists public.transactions_reporting_member_idx;
alter table public.transactions drop column if exists reporting_member_id;

-- Restore the previous atomic bulk-edit implementation.
\i supabase/migrations/20260810210100_make_bulk_transaction_edit_all_or_nothing.sql
