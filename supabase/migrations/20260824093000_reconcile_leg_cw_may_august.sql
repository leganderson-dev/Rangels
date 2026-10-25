-- Reconcile Leg CW against the authoritative CommBank export through 2026-08-23.
--
-- 1. Eleven Julia-side import counterparts were added as new Leg CW -> Julia CW
--    transfers even though the original Leg CW debits already existed. Merge each
--    pair into the original row so both accounts are affected exactly once.
-- 2. Restore two of three identical $3.30 charges on 2026-08-19 that the import
--    duplicate key collapsed. Their distinct bank running balances prove all three.

create schema backup_20260824_leg_cw_reconciliation;
revoke all on schema backup_20260824_leg_cw_reconciliation from public, anon, authenticated;

create table backup_20260824_leg_cw_reconciliation.transactions
  as select * from public.transactions where false;

insert into backup_20260824_leg_cw_reconciliation.transactions
select *
from public.transactions
where id in (
  'cd942060-0148-4120-841f-64280f5c328f', '0d077db8-3008-4f85-9953-00e3b9250146',
  'b10da3e8-0ce2-4883-b080-ed37747d01b0', '68b9ff76-7a0e-43d7-89ae-1fab99af69fe',
  'c78d6d77-8947-4fe6-aab2-9cf8b4f36384', '6aeb06ec-8ac7-4fe3-8d8a-fa5df2c00c2c',
  '69548cce-e051-462d-9caf-9fe87d1e30cd', '230f2668-767c-4989-a3c5-c2b3342805e2',
  'a80bc28c-1252-4739-9579-77c920ad36cb', '0a1a7b71-f2cb-4a63-bc86-b13aa5062348',
  '90e7cba8-cea3-450a-9297-42f371d8c39c',
  '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
  '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
  '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
  '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
  '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
  '659adca3-5e26-40f9-834e-676d817b0786', 'a31f312e-f25f-408c-9a81-1f0bd8c88f0b'
);

do $$
declare
  suspect_count integer;
  suspect_total numeric;
  original_count integer;
  original_total numeric;
begin
  select count(*), sum(abs(amount)) into suspect_count, suspect_total
  from public.transactions
  where import_id = 'aa9d6848-0830-4825-9ee4-029810e28ecd'
    and account_id = 'b8e863d8-75a0-4cae-b574-7a69bd0ff911'
    and target_account_id = '54d41600-1da4-4df4-82ea-f15b6b2c2a2f'
    and is_transfer;
  if suspect_count <> 11 or suspect_total <> 2330.00 then
    raise exception 'Unexpected Julia counterpart set: % rows, % total', suspect_count, suspect_total;
  end if;

  select count(*), sum(abs(amount)) into original_count, original_total
  from public.transactions
  where id in (
    '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
    '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
    '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
    '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
    '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
    '659adca3-5e26-40f9-834e-676d817b0786'
  ) and not is_transfer;
  if original_count <> 11 or original_total <> 2330.00 then
    raise exception 'Unexpected original Leg CW set: % rows, % total', original_count, original_total;
  end if;
end $$;

update public.transactions
set is_transfer = true,
    target_account_id = '54d41600-1da4-4df4-82ea-f15b6b2c2a2f',
    transfer_reason = 'joint_contribution',
    canonical_category_id = null,
    context_id = null,
    bucket_id = null,
    tax_treatment = 'none',
    reimbursement_status = 'none',
    classification_reviewed_at = now(),
    updated_at = now()
where id in (
  '50194e69-adb9-4874-b14c-0c881b8b2a07', '265fbac8-da4b-4f1d-9fa8-098092d6840a',
  '63de27c7-3103-4a9b-b5c8-c3396afda98b', '61ea38ac-a2b5-4f6c-af12-8e2e66494243',
  '86b544f4-e52a-450e-b5ac-2aa20e9a0267', '0ea557ed-b79c-4db6-ba5e-ec21f1ff45ba',
  '1269cd55-4815-44b2-9f47-71ffde99dd0d', '754934a3-665e-4811-85a9-5b81a1e1a9dd',
  '4ae8ab65-c78f-4012-921e-d24f46ca2ad6', '261097cb-ba46-4d70-8b99-c74d890c865f',
  '659adca3-5e26-40f9-834e-676d817b0786'
);

delete from public.transactions
where import_id = 'aa9d6848-0830-4825-9ee4-029810e28ecd'
  and account_id = 'b8e863d8-75a0-4cae-b574-7a69bd0ff911'
  and target_account_id = '54d41600-1da4-4df4-82ea-f15b6b2c2a2f'
  and is_transfer;

insert into public.transactions (
  owner_id, import_id, account_id, merchant_id, category_id, occurred_on,
  description, normalized_description, amount, balance, source_fingerprint,
  target_account_id, comment, is_transfer, status, payee, tags, external_id,
  legacy_category_id, canonical_category_id, context_id, bucket_id,
  reimbursement_status, tax_treatment, transfer_reason, classification_reviewed_at
)
select
  owner_id, import_id, account_id, merchant_id, category_id, occurred_on,
  description, normalized_description, amount, missing_balance,
  'reconcile:leg-cw:2026-08-19:pub-pool:' || missing_balance::text,
  target_account_id, comment, is_transfer, status, payee, tags, external_id,
  legacy_category_id, canonical_category_id, context_id, bucket_id,
  reimbursement_status, tax_treatment, transfer_reason, classification_reviewed_at
from public.transactions
cross join (values (12202.78::numeric), (12206.08::numeric)) as missing(missing_balance)
where id = 'a31f312e-f25f-408c-9a81-1f0bd8c88f0b';

do $$
declare reconciled_balance numeric;
begin
  select account.initial_balance + coalesce(sum(
    case
      when not transaction.is_transfer and transaction.account_id = account.id then transaction.amount
      when transaction.is_transfer and transaction.account_id = account.id then -abs(transaction.amount)
      when transaction.is_transfer and transaction.target_account_id = account.id then abs(transaction.amount)
      else 0
    end
  ), 0) into reconciled_balance
  from public.accounts account
  left join public.transactions transaction
    on transaction.status = 'C'
   and transaction.occurred_on <= date '2026-08-23'
   and (transaction.account_id = account.id or transaction.target_account_id = account.id)
  where account.id = 'b8e863d8-75a0-4cae-b574-7a69bd0ff911'
  group by account.id, account.initial_balance;

  if reconciled_balance <> 7704.13 then
    raise exception 'Leg CW reconciliation failed: expected 7704.13, got %', reconciled_balance;
  end if;
end $$;

revoke all on all tables in schema backup_20260824_leg_cw_reconciliation from public, anon, authenticated;

comment on schema backup_20260824_leg_cw_reconciliation is
  'Rows captured before reconciling Leg CW to the CommBank export through 2026-08-23.';
