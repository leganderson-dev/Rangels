update public.transactions t
set reimbursement_status = 'to_be_reimbursed',
    updated_at = now()
from public.categories c
where t.category_id = c.id
  and c.path = 'ToBeRefunded'
  and t.reimbursement_status = 'none';

comment on column public.transactions.reimbursement_status is
  'Transaction-level reimbursement lifecycle; independent from Purpose, Context, Bucket and legacy category.';
