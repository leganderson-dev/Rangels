alter table public.budgets drop constraint if exists budgets_owner_purpose_month_year_key;
alter table public.budget_group_members drop constraint if exists budget_group_members_group_purpose_key;

truncate public.budget_group_members, public.budgets, public.budget_groups, public.scheduled_transactions;
insert into public.budget_groups (id,owner_id,name,month,year,amount,created_at)
select id,owner_id,name,month,year,amount,created_at from backup_20260809_v09_legacy_retirement.budget_groups;
insert into public.budgets (id,owner_id,category_id,month,year,amount,created_at)
select id,owner_id,category_id,month,year,amount,created_at from backup_20260809_v09_legacy_retirement.budgets;
insert into public.budget_group_members (id,owner_id,group_id,category_id,include_children)
select id,owner_id,group_id,category_id,include_children from backup_20260809_v09_legacy_retirement.budget_group_members;
insert into public.scheduled_transactions (id,owner_id,description,amount,account_id,target_account_id,category_id,is_transfer,frequency,start_date,next_date,end_date,is_active,created_at)
select id,owner_id,description,amount,account_id,target_account_id,category_id,is_transfer,frequency,start_date,next_date,end_date,is_active,created_at from backup_20260809_v09_legacy_retirement.scheduled_transactions;

alter table public.budgets alter column category_id set not null;
alter table public.budget_group_members alter column category_id set not null;

alter table public.budgets drop column canonical_category_id;
alter table public.budget_group_members drop column canonical_category_id;
alter table public.scheduled_transactions
  drop column canonical_category_id,
  drop column context_id,
  drop column bucket_id,
  drop column tax_treatment,
  drop column transfer_reason;

create or replace function public.apply_category_classification()
returns trigger language plpgsql security invoker as $$
declare defaults public.category_classifications%rowtype;
begin
  select * into defaults from public.category_classifications where legacy_category_id = new.category_id;
  if tg_op = 'INSERT' then
    new.legacy_category_id := new.category_id;
    if found then
      new.canonical_category_id := coalesce(new.canonical_category_id, defaults.canonical_category_id);
      new.context_id := coalesce(new.context_id, defaults.context_id);
      new.bucket_id := coalesce(new.bucket_id, defaults.bucket_id);
      if new.tax_treatment = 'none' then new.tax_treatment := defaults.tax_treatment; end if;
    end if;
  elsif new.category_id is distinct from old.category_id then
    new.legacy_category_id := new.category_id;
    if found then
      if new.canonical_category_id is not distinct from old.canonical_category_id then new.canonical_category_id := defaults.canonical_category_id; end if;
      if new.context_id is not distinct from old.context_id then new.context_id := defaults.context_id; end if;
      if new.bucket_id is not distinct from old.bucket_id then new.bucket_id := defaults.bucket_id; end if;
      if new.tax_treatment is not distinct from old.tax_treatment then new.tax_treatment := defaults.tax_treatment; end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_apply_category_classification
before insert or update of category_id on public.transactions
for each row execute function public.apply_category_classification();

drop schema backup_20260809_v09_legacy_retirement cascade;
