create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  asset_type text not null default 'property' check (asset_type in ('property')),
  role text not null default 'investment' check (role in ('home', 'investment', 'other')),
  context_id uuid references public.contexts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  value numeric(14,2) not null check (value >= 0),
  valued_on date not null,
  created_at timestamptz not null default now(),
  unique (asset_id, valued_on)
);

create table public.asset_loans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  balance_on date not null,
  interest_rate numeric(7,4) not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, name)
);

create index asset_valuations_latest_idx on public.asset_valuations (asset_id, valued_on desc);
create index asset_loans_asset_idx on public.asset_loans (asset_id);

alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
alter table public.asset_loans enable row level security;

create policy "Owners manage assets" on public.assets for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Owners manage asset valuations" on public.asset_valuations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Owners manage asset loans" on public.asset_loans for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.asset_valuations to authenticated;
grant select, insert, update, delete on public.asset_loans to authenticated;

