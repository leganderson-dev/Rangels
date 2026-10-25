delete from public.transactions
where id in (
  'cd942060-0148-4120-841f-64280f5c328f', '0d077db8-3008-4f85-9953-00e3b9250146',
  '68b9ff76-7a0e-43d7-89ae-1fab99af69fe', 'c78d6d77-8947-4fe6-aab2-9cf8b4f36384',
  '6aeb06ec-8ac7-4fe3-8d8a-fa5df2c00c2c', '69548cce-e051-462d-9caf-9fe87d1e30cd',
  '230f2668-767c-4989-a3c5-c2b3342805e2', 'a80bc28c-1252-4739-9579-77c920ad36cb',
  '0a1a7b71-f2cb-4a63-bc86-b13aa5062348', '90e7cba8-cea3-450a-9297-42f371d8c39c'
);

update public.transactions current
set category_id = saved.category_id,
    legacy_category_id = saved.legacy_category_id,
    canonical_category_id = saved.canonical_category_id,
    context_id = saved.context_id,
    bucket_id = saved.bucket_id,
    target_account_id = saved.target_account_id,
    is_transfer = saved.is_transfer,
    transfer_reason = saved.transfer_reason,
    tax_treatment = saved.tax_treatment,
    reimbursement_status = saved.reimbursement_status,
    classification_reviewed_at = saved.classification_reviewed_at,
    updated_at = saved.updated_at
from backup_20260824_julia_expense_restore.transactions saved
where current.id = saved.id;

drop schema backup_20260824_julia_expense_restore cascade;
