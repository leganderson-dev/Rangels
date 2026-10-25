-- Property is a reporting Context, not an exception to Bucket reporting.
-- Backfill every property expense to Daily Expenses without changing its
-- amount, account, date, Purpose, Context, status, or ledger meaning.

create schema backup_20260828_property_expense_buckets;
revoke all on schema backup_20260828_property_expense_buckets from public, anon, authenticated;

create table backup_20260828_property_expense_buckets.transactions as
select transaction.id, transaction.bucket_id, transaction.updated_at
from public.transactions transaction
join public.contexts context on context.id = transaction.context_id
where context.kind = 'property'
  and not transaction.is_transfer
  and transaction.amount < 0;

do $$
declare
  property_expense_count integer;
  property_expense_amount numeric;
  owner_without_daily_bucket_count integer;
begin
  select count(*), coalesce(sum(abs(transaction.amount)), 0)
  into property_expense_count, property_expense_amount
  from public.transactions transaction
  join public.contexts context on context.id = transaction.context_id
  where context.kind = 'property'
    and not transaction.is_transfer
    and transaction.amount < 0;

  select count(*) into owner_without_daily_bucket_count
  from (
    select distinct transaction.owner_id
    from public.transactions transaction
    join public.contexts context on context.id = transaction.context_id
    where context.kind = 'property'
      and not transaction.is_transfer
      and transaction.amount < 0
  ) affected_owner
  where not exists (
    select 1 from public.buckets bucket
    where bucket.owner_id = affected_owner.owner_id
      and bucket.name = 'Daily Expenses'
  );

  if owner_without_daily_bucket_count <> 0 then
    raise exception '% affected owner(s) have no Daily Expenses bucket', owner_without_daily_bucket_count;
  end if;

  raise notice 'Backfilling % property expenses totalling % to Daily Expenses',
    property_expense_count, property_expense_amount;
end $$;

update public.transactions transaction
set bucket_id = bucket.id,
    updated_at = now()
from public.contexts context
join public.buckets bucket
  on bucket.owner_id = context.owner_id
 and bucket.name = 'Daily Expenses'
where transaction.context_id = context.id
  and context.kind = 'property'
  and transaction.owner_id = context.owner_id
  and not transaction.is_transfer
  and transaction.amount < 0
  and transaction.bucket_id is distinct from bucket.id;

-- Keep future imported/API-created property expenses complete even when an
-- older merchant rule still supplies no bucket. Explicit bucket selections
-- remain untouched.
create or replace function public.default_property_expense_bucket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount < 0 and not new.is_transfer and new.bucket_id is null
     and exists (
       select 1 from public.contexts context
       where context.id = new.context_id
         and context.owner_id = new.owner_id
         and context.kind = 'property'
     ) then
    select bucket.id into new.bucket_id
    from public.buckets bucket
    where bucket.owner_id = new.owner_id
      and bucket.name = 'Daily Expenses';

    if new.bucket_id is null then
      raise exception 'Property expenses require a Daily Expenses bucket';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_default_property_expense_bucket on public.transactions;
create trigger transactions_default_property_expense_bucket
before insert or update of amount, is_transfer, context_id, bucket_id
on public.transactions
for each row execute function public.default_property_expense_bucket();

do $$
declare
  backup_count integer;
  correctly_bucketed_count integer;
  changed_financial_fields_count integer;
begin
  select count(*) into backup_count
  from backup_20260828_property_expense_buckets.transactions;

  select count(*) into correctly_bucketed_count
  from public.transactions transaction
  join public.contexts context on context.id = transaction.context_id
  join public.buckets bucket on bucket.id = transaction.bucket_id
  where context.kind = 'property'
    and not transaction.is_transfer
    and transaction.amount < 0
    and bucket.owner_id = transaction.owner_id
    and bucket.name = 'Daily Expenses';

  select count(*) into changed_financial_fields_count
  from backup_20260828_property_expense_buckets.transactions backup
  join public.transactions transaction on transaction.id = backup.id
  join public.contexts context on context.id = transaction.context_id
  where context.kind <> 'property'
     or transaction.is_transfer
     or transaction.amount >= 0;

  if correctly_bucketed_count <> backup_count then
    raise exception 'Expected % property expenses in Daily Expenses, found %', backup_count, correctly_bucketed_count;
  end if;
  if changed_financial_fields_count <> 0 then
    raise exception 'Financial meaning changed for % affected rows', changed_financial_fields_count;
  end if;
end $$;

revoke all on all tables in schema backup_20260828_property_expense_buckets from public, anon, authenticated;

