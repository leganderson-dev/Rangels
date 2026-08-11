-- Keep Allianz policies separate by their stable Direct Debit identifiers.
with owners as (
  select distinct owner_id
  from public.transactions
  where description ilike '%ALLIANZ INSURE%'
), rules(name, normalized_name, purpose_name, context_name, bucket_name) as (
  values
    ('Allianz Car Insurance', 'allianz car insurance 181547', 'Vehicle insurance', 'Household', 'Daily Expenses'),
    ('Allianz Everton Park Home Insurance', 'allianz home insurance 377946', 'Home insurance', 'Property — Everton Park', null::text)
)
insert into public.merchants (
  owner_id, name, normalized_name, default_category_id,
  default_canonical_category_id, default_context_id, default_bucket_id,
  default_tax_treatment
)
select
  owners.owner_id,
  rules.name,
  rules.normalized_name,
  null,
  purpose.id,
  context.id,
  bucket.id,
  'none'
from owners
cross join rules
join public.canonical_categories purpose
  on purpose.owner_id = owners.owner_id and purpose.name = rules.purpose_name
join public.contexts context
  on context.owner_id = owners.owner_id and context.name = rules.context_name
left join public.buckets bucket
  on bucket.owner_id = owners.owner_id and bucket.name = rules.bucket_name
on conflict (owner_id, normalized_name) do update
set name = excluded.name,
    default_canonical_category_id = excluded.default_canonical_category_id,
    default_context_id = excluded.default_context_id,
    default_bucket_id = excluded.default_bucket_id,
    default_tax_treatment = excluded.default_tax_treatment;

with aliases(alias, normalized_alias, merchant_key) as (
  values
    ('Direct Debit 181547 ALLIANZ INSURE', 'direct debit 181547 allianz insure', 'allianz car insurance 181547'),
    ('Direct Debit 377946 ALLIANZ INSURE', 'direct debit 377946 allianz insure', 'allianz home insurance 377946')
)
insert into public.merchant_aliases (owner_id, merchant_id, alias, normalized_alias)
select merchant.owner_id, merchant.id, aliases.alias, aliases.normalized_alias
from aliases
join public.merchants merchant on merchant.normalized_name = aliases.merchant_key
on conflict (owner_id, normalized_alias) do update
set merchant_id = excluded.merchant_id,
    alias = excluded.alias;
