alter table public.accounts
  add column type text not null default 'checking'
    check (type in ('checking', 'savings', 'credit', 'cash', 'investment')),
  add column initial_balance numeric(14, 2) not null default 0,
  add column color text not null default '#3b82f6',
  add column is_active boolean not null default true,
  add column display_order integer not null default 0,
  add column group_name text;

alter table public.categories
  add column type text not null default 'expense'
    check (type in ('income', 'expense', 'transfer')),
  add column color text not null default '#6b7280';

alter table public.transactions
  alter column import_id drop not null,
  alter column category_id drop not null,
  alter column normalized_description drop not null,
  alter column source_fingerprint drop not null,
  add column target_account_id uuid references public.accounts(id) on delete restrict,
  add column comment text not null default '',
  add column is_transfer boolean not null default false,
  add column status text not null default 'C',
  add column payee text not null default '',
  add column tags text[] not null default '{}',
  add column external_id text,
  add column updated_at timestamptz not null default now();

create unique index transactions_owner_external_id_idx
  on public.transactions (owner_id, external_id)
  where external_id is not null;

create table public.scheduled_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(14, 2) not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  target_account_id uuid references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  is_transfer boolean not null default false,
  frequency text not null check (frequency in ('daily', 'weekly', 'fortnightly', 'monthly', 'yearly')),
  start_date date not null,
  next_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index scheduled_transactions_owner_next_date_idx
  on public.scheduled_transactions (owner_id, next_date);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, category_id, month, year)
);

create table public.budget_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, name, month, year)
);

create table public.budget_group_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.budget_groups(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  include_children boolean not null default true,
  unique (group_id, category_id)
);

alter table public.scheduled_transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_groups enable row level security;
alter table public.budget_group_members enable row level security;

create policy "Owners manage scheduled transactions"
  on public.scheduled_transactions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage budgets"
  on public.budgets for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage budget groups"
  on public.budget_groups for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage budget group members"
  on public.budget_group_members for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on table public.scheduled_transactions to authenticated;
grant select, insert, update, delete on table public.budgets to authenticated;
grant select, insert, update, delete on table public.budget_groups to authenticated;
grant select, insert, update, delete on table public.budget_group_members to authenticated;
