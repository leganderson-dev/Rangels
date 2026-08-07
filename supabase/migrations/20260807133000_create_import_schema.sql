create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  institution text not null,
  currency text not null default 'AUD',
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, path)
);

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  default_category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create table public.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_alias)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  file_name text not null,
  bank_format text not null,
  file_fingerprint text not null,
  row_count integer not null check (row_count > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, file_fingerprint)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id uuid not null references public.imports(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  merchant_id uuid references public.merchants(id) on delete set null,
  category_id uuid not null references public.categories(id) on delete restrict,
  occurred_on date not null,
  description text not null,
  normalized_description text not null,
  amount numeric(14, 2) not null,
  balance numeric(14, 2),
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, source_fingerprint)
);

create index transactions_owner_date_idx
  on public.transactions (owner_id, occurred_on desc);

create index transactions_merchant_idx
  on public.transactions (merchant_id);

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.merchants enable row level security;
alter table public.merchant_aliases enable row level security;
alter table public.imports enable row level security;
alter table public.transactions enable row level security;

create policy "Owners manage accounts"
  on public.accounts for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage categories"
  on public.categories for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage merchants"
  on public.merchants for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage merchant aliases"
  on public.merchant_aliases for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage imports"
  on public.imports for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage transactions"
  on public.transactions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
