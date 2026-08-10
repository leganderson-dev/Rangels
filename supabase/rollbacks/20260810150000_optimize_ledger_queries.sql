drop function if exists public.canonical_category_transaction_counts();
drop function if exists public.account_balance_summary();
drop index if exists public.transactions_owner_category_idx;
drop index if exists public.transactions_owner_target_account_occurred_on_idx;
drop index if exists public.transactions_owner_account_occurred_on_idx;
drop index if exists public.transactions_owner_occurred_on_idx;
