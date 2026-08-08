alter table public.accounts
  add column last_updated_on date;

update public.accounts a
set last_updated_on = source.last_updated_on
from (
  select
    a2.id,
    max(t.occurred_on) filter (where t.status = 'C') as last_updated_on
  from public.accounts a2
  left join public.transactions t
    on t.account_id = a2.id or t.target_account_id = a2.id
  group by a2.id
) source
where source.id = a.id;
