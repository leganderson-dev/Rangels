create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_owner_id, name)
);

alter table public.household_members enable row level security;
create policy "Owners manage household members" on public.household_members for all
  using (workspace_owner_id = auth.uid()) with check (workspace_owner_id = auth.uid());
grant select, insert, update, delete on public.household_members to authenticated;

insert into public.household_members (workspace_owner_id, name, display_order)
select owner_id, member.name, member.ord
from (select distinct owner_id from public.accounts) owners
cross join (values ('Anderson', 1), ('Julia', 2)) member(name, ord)
on conflict (workspace_owner_id, name) do nothing;

alter table public.accounts
  add column member_id uuid references public.household_members(id) on delete restrict;

update public.accounts account
set member_id = member.id
from public.household_members member
where member.workspace_owner_id = account.owner_id and member.name = 'Anderson';

alter table public.accounts alter column member_id set not null;
create index accounts_member_idx on public.accounts(owner_id, member_id);

-- The single shared personal context is now named for what it represents.
update public.contexts set name = 'Household' where name = 'Personal' and kind = 'personal';

insert into public.contexts (owner_id, name, kind, display_order)
select owner_id, 'Business — Folium Studio', 'business', 6
from (select distinct owner_id from public.contexts) owners
on conflict (owner_id, name) do nothing;

insert into public.buckets (owner_id, name, display_order)
select owner_id, 'Fire Extinguisher', 4
from (select distinct owner_id from public.buckets) owners
on conflict (owner_id, name) do nothing;

create table public.allocation_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_id uuid not null references public.contexts(id) on delete restrict,
  name text not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, name, effective_from)
);

create table public.allocation_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  allocation_plan_id uuid not null references public.allocation_plans(id) on delete cascade,
  bucket_id uuid not null references public.buckets(id) on delete restrict,
  target_percentage numeric(5,2) not null check (target_percentage >= 0 and target_percentage <= 100),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (allocation_plan_id, bucket_id)
);

alter table public.allocation_plans enable row level security;
alter table public.allocation_targets enable row level security;
create policy "Owners manage allocation plans" on public.allocation_plans for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage allocation targets" on public.allocation_targets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.allocation_plans, public.allocation_targets to authenticated;

insert into public.allocation_plans (owner_id, context_id, name, effective_from)
select context.owner_id, context.id, 'Shared household plan', date '2026-01-01'
from public.contexts context
where context.name = 'Household'
on conflict (owner_id, name, effective_from) do nothing;

insert into public.allocation_targets (owner_id, allocation_plan_id, bucket_id, target_percentage, display_order)
select plan.owner_id, plan.id, bucket.id, target.percentage, target.ord
from public.allocation_plans plan
join public.contexts context on context.id = plan.context_id and context.name = 'Household'
cross join (values
  ('Daily Expenses', 60.00::numeric, 1),
  ('Splurge', 10.00::numeric, 2),
  ('Smile', 10.00::numeric, 3),
  ('Fire Extinguisher', 20.00::numeric, 4)
) target(name, percentage, ord)
join public.buckets bucket on bucket.owner_id = plan.owner_id and bucket.name = target.name
on conflict (allocation_plan_id, bucket_id) do nothing;
