do $$
declare
  live_count bigint;
  snapshot_count bigint;
  changed_ledger_rows bigint;
  preserved_auto_classified bigint;
  mapped_transactions bigint;
  review_transactions bigint;
begin
  select count(*) into live_count from public.transactions;
  select count(*) into snapshot_count from backup_20260808_pre_category_redesign.transactions;
  if live_count <> snapshot_count then
    raise exception 'Ledger row count changed: live %, snapshot %', live_count, snapshot_count;
  end if;

  select count(*) into changed_ledger_rows
  from public.transactions live
  full join backup_20260808_pre_category_redesign.transactions snap using (id)
  where live.id is null or snap.id is null
     or live.account_id is distinct from snap.account_id
     or live.target_account_id is distinct from snap.target_account_id
     or live.occurred_on is distinct from snap.occurred_on
     or live.amount is distinct from snap.amount
     or live.category_id is distinct from snap.category_id
     or live.is_transfer is distinct from snap.is_transfer
     or live.external_id is distinct from snap.external_id;
  if changed_ledger_rows <> 0 then
    raise exception 'Classification redesign changed % protected ledger rows', changed_ledger_rows;
  end if;

  select count(*) into preserved_auto_classified
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where c.path in ('ToBeRefunded', 'Reibursment')
    and (t.canonical_category_id is not null or t.context_id is not null
      or t.bucket_id is not null or t.tax_treatment <> 'none');
  if preserved_auto_classified <> 0 then
    raise exception 'Preserved reimbursement categories were automatically classified';
  end if;

  select count(*) into mapped_transactions
  from public.transactions where canonical_category_id is not null;
  select count(*) into review_transactions
  from public.transactions t join public.contexts c on c.id = t.context_id
  where c.kind = 'review';

  raise notice 'Classification validation passed: % ledger rows unchanged, % purpose-mapped, % marked for review',
    live_count, mapped_transactions, review_transactions;
end $$;
