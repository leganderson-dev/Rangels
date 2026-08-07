drop table if exists public.budget_group_members;
drop table if exists public.budget_groups;
drop table if exists public.budgets;
drop table if exists public.scheduled_transactions;

drop index if exists public.transactions_owner_external_id_idx;

alter table public.transactions
  drop column if exists updated_at,
  drop column if exists external_id,
  drop column if exists tags,
  drop column if exists payee,
  drop column if exists status,
  drop column if exists is_transfer,
  drop column if exists comment,
  drop column if exists target_account_id;

alter table public.categories
  drop column if exists color,
  drop column if exists type;

alter table public.accounts
  drop column if exists group_name,
  drop column if exists display_order,
  drop column if exists is_active,
  drop column if exists color,
  drop column if exists initial_balance,
  drop column if exists type;
