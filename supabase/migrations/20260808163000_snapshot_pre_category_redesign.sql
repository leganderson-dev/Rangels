-- Immutable in-database snapshot taken before any category redesign work.
-- This schema is intentionally unavailable to browser roles.
create schema backup_20260808_pre_category_redesign;

revoke all on schema backup_20260808_pre_category_redesign from public, anon, authenticated;

create table backup_20260808_pre_category_redesign.accounts
  as table public.accounts;
create table backup_20260808_pre_category_redesign.categories
  as table public.categories;
create table backup_20260808_pre_category_redesign.merchants
  as table public.merchants;
create table backup_20260808_pre_category_redesign.merchant_aliases
  as table public.merchant_aliases;
create table backup_20260808_pre_category_redesign.imports
  as table public.imports;
create table backup_20260808_pre_category_redesign.transactions
  as table public.transactions;
create table backup_20260808_pre_category_redesign.scheduled_transactions
  as table public.scheduled_transactions;
create table backup_20260808_pre_category_redesign.budgets
  as table public.budgets;
create table backup_20260808_pre_category_redesign.budget_groups
  as table public.budget_groups;
create table backup_20260808_pre_category_redesign.budget_group_members
  as table public.budget_group_members;

create table backup_20260808_pre_category_redesign.manifest (
  captured_at timestamptz not null,
  source_schema text not null,
  app_version text not null,
  table_name text not null,
  row_count bigint not null
);

insert into backup_20260808_pre_category_redesign.manifest
  (captured_at, source_schema, app_version, table_name, row_count)
values
  (now(), 'public', '0.2.0', 'accounts', (select count(*) from public.accounts)),
  (now(), 'public', '0.2.0', 'categories', (select count(*) from public.categories)),
  (now(), 'public', '0.2.0', 'merchants', (select count(*) from public.merchants)),
  (now(), 'public', '0.2.0', 'merchant_aliases', (select count(*) from public.merchant_aliases)),
  (now(), 'public', '0.2.0', 'imports', (select count(*) from public.imports)),
  (now(), 'public', '0.2.0', 'transactions', (select count(*) from public.transactions)),
  (now(), 'public', '0.2.0', 'scheduled_transactions', (select count(*) from public.scheduled_transactions)),
  (now(), 'public', '0.2.0', 'budgets', (select count(*) from public.budgets)),
  (now(), 'public', '0.2.0', 'budget_groups', (select count(*) from public.budget_groups)),
  (now(), 'public', '0.2.0', 'budget_group_members', (select count(*) from public.budget_group_members));

revoke all on all tables in schema backup_20260808_pre_category_redesign from public, anon, authenticated;

comment on schema backup_20260808_pre_category_redesign is
  'Rangels V0.2 data snapshot captured before category/context/bucket redesign.';
