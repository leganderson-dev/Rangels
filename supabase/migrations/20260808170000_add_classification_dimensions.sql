create table public.contexts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('personal', 'property', 'business', 'review')),
  display_order integer not null default 0,
  unique (owner_id, name)
);

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  unique (owner_id, name)
);

create table public.canonical_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  family text not null,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  display_order integer not null default 0,
  unique (owner_id, family, name)
);

create table public.category_classifications (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_category_id uuid primary key references public.categories(id) on delete cascade,
  canonical_category_id uuid references public.canonical_categories(id) on delete restrict,
  context_id uuid references public.contexts(id) on delete restrict,
  bucket_id uuid references public.buckets(id) on delete restrict,
  tax_treatment text not null default 'none' check (tax_treatment in ('none', 'deductible', 'review')),
  migration_status text not null default 'mapped' check (migration_status in ('mapped', 'review', 'preserved')),
  notes text not null default ''
);

alter table public.transactions
  add column legacy_category_id uuid references public.categories(id) on delete set null,
  add column canonical_category_id uuid references public.canonical_categories(id) on delete restrict,
  add column context_id uuid references public.contexts(id) on delete restrict,
  add column bucket_id uuid references public.buckets(id) on delete restrict,
  add column reimbursement_status text not null default 'none'
    check (reimbursement_status in ('none', 'to_be_reimbursed', 'reimbursed')),
  add column tax_treatment text not null default 'none'
    check (tax_treatment in ('none', 'deductible', 'review'));

update public.transactions set legacy_category_id = category_id where category_id is not null;

alter table public.contexts enable row level security;
alter table public.buckets enable row level security;
alter table public.canonical_categories enable row level security;
alter table public.category_classifications enable row level security;

create policy "Owners manage contexts" on public.contexts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage buckets" on public.buckets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage canonical categories" on public.canonical_categories for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage category classifications" on public.category_classifications for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.contexts, public.buckets,
  public.canonical_categories, public.category_classifications to authenticated;

insert into public.contexts (owner_id, name, kind, display_order)
select owner_id, item.name, item.kind, item.ord
from (select distinct owner_id from public.categories) owners
cross join (values
  ('Personal', 'personal', 1),
  ('Property — Currumundi', 'property', 2),
  ('Property — Everton Park', 'property', 3),
  ('Property — Toogoom', 'property', 4),
  ('Business — ASA', 'business', 5),
  ('Review required', 'review', 99)
) item(name, kind, ord)
on conflict (owner_id, name) do nothing;

insert into public.buckets (owner_id, name, display_order)
select owner_id, item.name, item.ord
from (select distinct owner_id from public.categories) owners
cross join (values ('Daily Expenses', 1), ('Splurge', 2), ('Smile', 3)) item(name, ord)
on conflict (owner_id, name) do nothing;

insert into public.canonical_categories (owner_id, family, name, type, display_order)
select owner_id, item.family, item.name, item.type, item.ord
from (select distinct owner_id from public.categories) owners
cross join (values
  ('Income','Salary','income',1), ('Income','Additional earnings','income',2),
  ('Income','Rental income','income',3), ('Income','Business income','income',4),
  ('Income','Interest','income',5), ('Income','Refund / rebate','income',6),
  ('Income','Other income','income',7),
  ('Housing and utilities','Mortgage payment','expense',10), ('Housing and utilities','Rent','expense',11),
  ('Housing and utilities','Council rates','expense',12), ('Housing and utilities','Electricity','expense',13),
  ('Housing and utilities','Gas','expense',14), ('Housing and utilities','Water','expense',15),
  ('Housing and utilities','Internet','expense',16), ('Housing and utilities','Mobile phone','expense',17),
  ('Housing and utilities','Home insurance','expense',18), ('Housing and utilities','Cleaning','expense',19),
  ('Housing and utilities','Repairs and maintenance','expense',20), ('Housing and utilities','Furniture and appliances','expense',21),
  ('Food and dining','Groceries','expense',30), ('Food and dining','Restaurants','expense',31),
  ('Food and dining','Cafes','expense',32), ('Food and dining','Work meals','expense',33),
  ('Food and dining','Tuckshop meals','expense',34), ('Food and dining','Other food','expense',35),
  ('Transport','Fuel','expense',40), ('Transport','Public transport','expense',41),
  ('Transport','Rideshare and taxi','expense',42), ('Transport','Micromobility','expense',43),
  ('Transport','Parking','expense',44), ('Transport','Tolls','expense',45),
  ('Transport','Registration','expense',46), ('Transport','Vehicle insurance','expense',47),
  ('Transport','Vehicle maintenance','expense',48), ('Transport','Fines','expense',49),
  ('Transport','Vehicle purchase','expense',50),
  ('Health','Medical care','expense',60), ('Health','Pharmacy','expense',61), ('Health','Health insurance','expense',62),
  ('Children','Activities','expense',70), ('Children','Childcare','expense',71),
  ('Children','School care','expense',72), ('Children','School fees','expense',73),
  ('Children','School supplies','expense',74), ('Children','Books and learning','expense',75),
  ('Children','Allowance','expense',76), ('Children','Clothing','expense',77),
  ('Children','Entertainment','expense',78), ('Children','Toys','expense',79),
  ('Lifestyle','Alcohol','expense',90), ('Lifestyle','Clothing','expense',91),
  ('Lifestyle','Digital purchases','expense',92), ('Lifestyle','Entertainment','expense',93),
  ('Lifestyle','Gifts','expense',94), ('Lifestyle','Hobbies and collectibles','expense',95),
  ('Lifestyle','Personal care','expense',96), ('Lifestyle','Subscriptions','expense',97),
  ('Lifestyle','Travel','expense',98), ('Lifestyle','Donations','expense',99),
  ('Lifestyle','Electronics and gadgets','expense',100), ('Lifestyle','Other lifestyle','expense',101),
  ('Pets','Food','expense',110), ('Pets','Veterinary care','expense',111),
  ('Pets','Insurance','expense',112), ('Pets','Other','expense',113),
  ('Financial','Bank fees','expense',120), ('Financial','Insurance excess','expense',121),
  ('Financial','Debt repayment','expense',122), ('Financial','Tax payment','expense',123),
  ('Property','Land loan payment','expense',130), ('Property','Pool loan payment','expense',131),
  ('Property','Insurance','expense',132), ('Property','Garden and landscaping','expense',133),
  ('Property','Pool maintenance','expense',134), ('Property','Capital improvements','expense',135),
  ('Property','Acquisition / deposit','expense',136), ('Property','Other property cost','expense',137),
  ('Business','General operating costs','expense',150), ('Business','Program / team costs','expense',151),
  ('Business','Wages and salaries','expense',152), ('Business','IT','expense',153),
  ('Business','Licences','expense',154), ('Business','Marketing','expense',155),
  ('Business','Awards and trophies','expense',156), ('Business','Staff costs','expense',157),
  ('Business','Training equipment','expense',158), ('Business','Uniforms','expense',159),
  ('Business','Business refund','income',160)
) item(family, name, type, ord)
on conflict (owner_id, family, name) do nothing;

-- Conservative deterministic mappings only. Ambiguous legacy paths remain reviewable.
with proposed as (
  select c.id legacy_id, c.owner_id, c.path,
    case
      when c.path ~* '^House - Currumundi' then 'Property — Currumundi'
      when c.path ~* '^House - EvertonPark' then 'Property — Everton Park'
      when c.path ~* '^House - Toogoom' then 'Property — Toogoom'
      when c.path ~* '^ASA:' then 'Business — ASA'
      when c.path in ('?????', 'DEBIT', 'Sydney') then 'Review required'
      else 'Personal'
    end context_name,
    case
      when c.path ~* '^Food:(Supermarket|Grocer)' then 'Groceries'
      when c.path ~* '^Food:(Restaurante|Restaurant)' then 'Restaurants'
      when c.path ~* '^Food:Cafe' then 'Cafes'
      when c.path ~* '^Entertainment & Recreation:Trips/Holidays' then 'Travel'
      when c.path ~* '^Transportation:.*(Public|Opal)' then 'Public transport'
      when c.path ~* '^Transportation:.*(Petrol|Fuel)' then 'Fuel'
      when c.path ~* '^Pet:' then 'Other'
      when c.path ~* '^Salario' then case when c.path ~* 'Extra' then 'Additional earnings' else 'Salary' end
      when c.path = 'Bank:Interest' then 'Interest'
      when c.path ~* '^TaxDeductable:Donation' then 'Donations'
      else null
    end canonical_name,
    case
      when c.path ~* '^Food:' then 'Food and dining'
      when c.path ~* '^Entertainment & Recreation:' or c.path ~* '^TaxDeductable:Donation' then 'Lifestyle'
      when c.path ~* '^Transportation:' then 'Transport'
      when c.path ~* '^Pet:' then 'Pets'
      when c.path ~* '^Salario' or c.path = 'Bank:Interest' then 'Income'
      else null
    end canonical_family,
    case
      when c.path ~* '^Food:(Supermarket|Grocer)' or c.path ~* '^Pet:' then 'Daily Expenses'
      when c.path ~* '^Food:(Restaurante|Restaurant|Cafe)' then 'Splurge'
      when c.path ~* '^Entertainment & Recreation:Trips/Holidays' or c.path ~* '^TaxDeductable:Donation' then 'Smile'
      else null
    end bucket_name
  from public.categories c
  where c.path not in ('ToBeRefunded', 'Reibursment')
), mapped as (
  select p.*, ctx.id context_id, b.id bucket_id,
    (select cc.id from public.canonical_categories cc
      where cc.owner_id = p.owner_id and cc.name = p.canonical_name
        and cc.family = p.canonical_family limit 1) canonical_id
  from proposed p
  join public.contexts ctx on ctx.owner_id = p.owner_id and ctx.name = p.context_name
  left join public.buckets b on b.owner_id = p.owner_id and b.name = p.bucket_name
)
insert into public.category_classifications
  (owner_id, legacy_category_id, canonical_category_id, context_id, bucket_id, tax_treatment, migration_status, notes)
select owner_id, legacy_id, canonical_id, context_id, bucket_id,
  case when path ~* '^TaxDeductable:' then 'deductible' when path ~* '(^|:)Tax(:|$)' then 'review' else 'none' end,
  case when canonical_id is null or context_name = 'Review required' then 'review' else 'mapped' end,
  case when canonical_id is null then 'Canonical purpose requires review' else 'Deterministic legacy mapping' end
from mapped
on conflict (legacy_category_id) do nothing;

update public.transactions t
set canonical_category_id = cc.canonical_category_id,
    context_id = cc.context_id,
    bucket_id = cc.bucket_id,
    tax_treatment = cc.tax_treatment
from public.category_classifications cc
where cc.legacy_category_id = t.category_id
  and t.category_id is not null;

create or replace function public.apply_category_classification()
returns trigger language plpgsql security invoker as $$
declare defaults public.category_classifications%rowtype;
begin
  select * into defaults from public.category_classifications
  where legacy_category_id = new.category_id;
  if tg_op = 'INSERT' then
    new.legacy_category_id := new.category_id;
    if found then
      new.canonical_category_id := coalesce(new.canonical_category_id, defaults.canonical_category_id);
      new.context_id := coalesce(new.context_id, defaults.context_id);
      new.bucket_id := coalesce(new.bucket_id, defaults.bucket_id);
      if new.tax_treatment = 'none' then new.tax_treatment := defaults.tax_treatment; end if;
    end if;
  elsif new.category_id is distinct from old.category_id and found then
    new.legacy_category_id := new.category_id;
    new.canonical_category_id := defaults.canonical_category_id;
    new.context_id := defaults.context_id;
    new.bucket_id := defaults.bucket_id;
    new.tax_treatment := defaults.tax_treatment;
  end if;
  return new;
end;
$$;

create trigger transactions_apply_category_classification
before insert or update of category_id on public.transactions
for each row execute function public.apply_category_classification();

create index transactions_context_idx on public.transactions(owner_id, context_id);
create index transactions_bucket_idx on public.transactions(owner_id, bucket_id);
create index transactions_canonical_category_idx on public.transactions(owner_id, canonical_category_id);
