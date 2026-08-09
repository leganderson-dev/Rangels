create schema if not exists backup_20260809_v09_legacy_retirement;

create table backup_20260809_v09_legacy_retirement.transactions as table public.transactions;
create table backup_20260809_v09_legacy_retirement.budgets as table public.budgets;
create table backup_20260809_v09_legacy_retirement.budget_groups as table public.budget_groups;
create table backup_20260809_v09_legacy_retirement.budget_group_members as table public.budget_group_members;
create table backup_20260809_v09_legacy_retirement.scheduled_transactions as table public.scheduled_transactions;
create table backup_20260809_v09_legacy_retirement.merchants as table public.merchants;
create table backup_20260809_v09_legacy_retirement.category_classifications as table public.category_classifications;

alter table public.budgets add column if not exists canonical_category_id uuid references public.canonical_categories(id) on delete cascade;
alter table public.budget_group_members add column if not exists canonical_category_id uuid references public.canonical_categories(id) on delete cascade;
alter table public.scheduled_transactions
  add column if not exists canonical_category_id uuid references public.canonical_categories(id) on delete restrict,
  add column if not exists context_id uuid references public.contexts(id) on delete restrict,
  add column if not exists bucket_id uuid references public.buckets(id) on delete restrict,
  add column if not exists tax_treatment text not null default 'none' check (tax_treatment in ('none', 'deductible', 'review')),
  add column if not exists transfer_reason text check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

-- These features contained only placeholder data and intentionally restart on
-- the canonical V0.9 model.
truncate table public.budget_group_members, public.budgets, public.budget_groups, public.scheduled_transactions;

alter table public.budgets alter column category_id drop not null;
alter table public.budget_group_members alter column category_id drop not null;

alter table public.budgets alter column canonical_category_id set not null;
alter table public.budget_group_members alter column canonical_category_id set not null;
alter table public.budgets add constraint budgets_owner_purpose_month_year_key unique (owner_id, canonical_category_id, month, year);
alter table public.budget_group_members add constraint budget_group_members_group_purpose_key unique (group_id, canonical_category_id);

-- Legacy IDs remain nullable and untouched as dormant audit references. They no
-- longer drive canonical classifications.
drop trigger if exists transactions_apply_category_classification on public.transactions;
drop function if exists public.apply_category_classification();

comment on column public.transactions.category_id is 'Dormant legacy category reference retained for V0.9 rollback and audit. New transactions leave this null.';
comment on column public.transactions.legacy_category_id is 'Dormant legacy category reference retained for V0.9 rollback and audit. New transactions leave this null.';
comment on table public.category_classifications is 'Read-only legacy mapping archive after Rangels V0.9 retirement.';

do $$
declare invalid_budgets integer;
declare invalid_scheduled integer;
begin
  select count(*) into invalid_budgets from public.budgets where canonical_category_id is null;
  select count(*) into invalid_scheduled from public.scheduled_transactions
    where not is_transfer and canonical_category_id is null;
  if invalid_budgets <> 0 or invalid_scheduled <> 0 then
    raise exception 'V0.9 migration blocked: % budgets and % scheduled transactions lack canonical Purposes', invalid_budgets, invalid_scheduled;
  end if;
end $$;
