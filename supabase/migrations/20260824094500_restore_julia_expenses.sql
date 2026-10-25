-- Restore the original Leg CW classified rows while representing the Julia-side
-- records as expenses. The $240 cleaning expense already exists in Julia CW, so
-- its imported counterpart is intentionally not restored.

create schema backup_20260824_julia_expense_restore;
revoke all on schema backup_20260824_julia_expense_restore from public, anon, authenticated;

create table backup_20260824_julia_expense_restore.transactions
  as select * from public.transactions where false;

insert into backup_20260824_julia_expense_restore.transactions
select * from public.transactions
where id in (
  '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
  '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
  '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
  '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
  '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
  '659adca3-5e26-40f9-834e-676d817b0786', 'c867e0de-71c7-4a3a-8cf6-a0f2f7914eb6'
);

do $$
declare transfer_count integer;
begin
  select count(*) into transfer_count
  from public.transactions
  where id in (
    '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
    '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
    '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
    '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
    '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
    '659adca3-5e26-40f9-834e-676d817b0786'
  ) and is_transfer and account_id = 'b8e863d8-75a0-4cae-b574-7a69bd0ff911';
  if transfer_count <> 11 then
    raise exception 'Expected 11 current Leg CW transfers, found %', transfer_count;
  end if;
end $$;

-- Restore the complete pre-conversion financial meaning and classifications of
-- the original Leg CW rows. Their amounts do not change, preserving Leg CW.
update public.transactions current
set category_id = original.category_id,
    legacy_category_id = original.legacy_category_id,
    canonical_category_id = original.canonical_category_id,
    context_id = original.context_id,
    bucket_id = original.bucket_id,
    target_account_id = original.target_account_id,
    is_transfer = original.is_transfer,
    transfer_reason = original.transfer_reason,
    tax_treatment = original.tax_treatment,
    reimbursement_status = original.reimbursement_status,
    classification_reviewed_at = original.classification_reviewed_at,
    updated_at = now()
from backup_20260824_leg_cw_reconciliation.transactions original
where current.id = original.id
  and current.id in (
    '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
    '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
    '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
    '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
    '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
    '659adca3-5e26-40f9-834e-676d817b0786'
  );

-- Restore ten Julia-import records, excluding the $240 Cleaners counterpart.
insert into public.transactions
select *
from backup_20260824_leg_cw_reconciliation.transactions
where id in (
  'cd942060-0148-4120-841f-64280f5c328f', '0d077db8-3008-4f85-9953-00e3b9250146',
  '68b9ff76-7a0e-43d7-89ae-1fab99af69fe', 'c78d6d77-8947-4fe6-aab2-9cf8b4f36384',
  '6aeb06ec-8ac7-4fe3-8d8a-fa5df2c00c2c', '69548cce-e051-462d-9caf-9fe87d1e30cd',
  '230f2668-767c-4989-a3c5-c2b3342805e2', 'a80bc28c-1252-4739-9579-77c920ad36cb',
  '0a1a7b71-f2cb-4a63-bc86-b13aa5062348', '90e7cba8-cea3-450a-9297-42f371d8c39c'
);

update public.transactions julia
set account_id = '54d41600-1da4-4df4-82ea-f15b6b2c2a2f',
    target_account_id = null,
    amount = -abs(julia.amount),
    is_transfer = false,
    transfer_reason = null,
    category_id = original.category_id,
    legacy_category_id = original.legacy_category_id,
    canonical_category_id = original.canonical_category_id,
    context_id = original.context_id,
    bucket_id = original.bucket_id,
    tax_treatment = original.tax_treatment,
    reimbursement_status = original.reimbursement_status,
    classification_reviewed_at = original.classification_reviewed_at,
    updated_at = now()
from (values
  ('cd942060-0148-4120-841f-64280f5c328f'::uuid, '50194e69-adb9-4874-b14c-0c881b8b2a07'::uuid),
  ('0d077db8-3008-4f85-9953-00e3b9250146', '265fbac8-da4b-4f1d-9fa8-098092d6840a'),
  ('68b9ff76-7a0e-43d7-89ae-1fab99af69fe', '61ea38ac-a2b5-4f6c-af12-8e2e66494243'),
  ('c78d6d77-8947-4fe6-aab2-9cf8b4f36384', '86b544f4-e52a-450e-b5ac-2aa20e9a0267'),
  ('6aeb06ec-8ac7-4fe3-8d8a-fa5df2c00c2c', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba'),
  ('69548cce-e051-462d-9caf-9fe87d1e30cd', '1269cd55-4815-44b2-9f47-71ffde99dd0d'),
  ('230f2668-767c-4989-a3c5-c2b3342805e2', '754934a3-665e-4811-85a9-5b81a1e1a9dd'),
  ('a80bc28c-1252-4739-9579-77c920ad36cb', '4ae8ab65-c78f-4012-921e-d24f46ca2ad6'),
  ('0a1a7b71-f2cb-4a63-bc86-b13aa5062348', '261097cb-ba46-4d70-8b99-c74d890c865f'),
  ('90e7cba8-cea3-450a-9297-42f371d8c39c', '659adca3-5e26-40f9-834e-676d817b0786')
) mapping(julia_id, original_id)
join backup_20260824_leg_cw_reconciliation.transactions original
  on original.id = mapping.original_id
where julia.id = mapping.julia_id;

do $$
declare leg_balance numeric;
declare julia_expenses integer;
begin
  select account.initial_balance + coalesce(sum(
    case
      when not transaction.is_transfer and transaction.account_id = account.id then transaction.amount
      when transaction.is_transfer and transaction.account_id = account.id then -abs(transaction.amount)
      when transaction.is_transfer and transaction.target_account_id = account.id then abs(transaction.amount)
      else 0
    end), 0) into leg_balance
  from public.accounts account
  left join public.transactions transaction
    on transaction.status = 'C'
   and (transaction.account_id = account.id or transaction.target_account_id = account.id)
  where account.id = 'b8e863d8-75a0-4cae-b574-7a69bd0ff911'
  group by account.id, account.initial_balance;

  select count(*) into julia_expenses
  from public.transactions
  where id in (
    'cd942060-0148-4120-841f-64280f5c328f', '0d077db8-3008-4f85-9953-00e3b9250146',
    '68b9ff76-7a0e-43d7-89ae-1fab99af69fe', 'c78d6d77-8947-4fe6-aab2-9cf8b4f36384',
    '6aeb06ec-8ac7-4fe3-8d8a-fa5df2c00c2c', '69548cce-e051-462d-9caf-9fe87d1e30cd',
    '230f2668-767c-4989-a3c5-c2b3342805e2', 'a80bc28c-1252-4739-9579-77c920ad36cb',
    '0a1a7b71-f2cb-4a63-bc86-b13aa5062348', '90e7cba8-cea3-450a-9297-42f371d8c39c'
  ) and account_id = '54d41600-1da4-4df4-82ea-f15b6b2c2a2f'
    and not is_transfer and amount < 0 and canonical_category_id is not null;

  if leg_balance <> 7096.06 then
    raise exception 'Leg CW balance changed: expected 7096.06, got %', leg_balance;
  end if;
  if julia_expenses <> 10 then
    raise exception 'Expected 10 classified Julia expenses, found %', julia_expenses;
  end if;
end $$;

revoke all on all tables in schema backup_20260824_julia_expense_restore from public, anon, authenticated;

