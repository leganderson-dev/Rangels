-- Repair three cleared interest credits whose Alzex descriptions are blank,
-- and remove three unconfirmed projection rows from the historical ledger.
delete from public.transactions
where external_id like 'alzex:%'
  and status <> 'C';

insert into public.transactions (
  owner_id,
  account_id,
  category_id,
  occurred_on,
  description,
  normalized_description,
  amount,
  status,
  external_id
)
select
  a.owner_id,
  a.id,
  c.id,
  source.occurred_on,
  'Bank Interest',
  'bank interest',
  source.amount,
  'C',
  source.external_id
from (values
  ('ING FireExtingusher', '2021-06-30'::date, 11.22::numeric, 'alzex:16255257176555'),
  ('ING FireExtingusher', '2021-08-31'::date, 0.37::numeric, 'alzex:16321427533737'),
  ('NAB Savings', '2023-03-31'::date, 0.02::numeric, 'alzex:16842360755003')
) as source(account_name, occurred_on, amount, external_id)
join public.accounts a on a.name = source.account_name
left join public.categories c
  on c.owner_id = a.owner_id and c.path = 'Bank:Interest'
on conflict (owner_id, external_id) where external_id is not null do nothing;
