create or replace function public.bulk_edit_transactions(p_ids uuid[], p_changes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed integer;
  requested_type text := nullif(p_changes ->> 'transactionType', '');
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  if requested_type is not null and requested_type not in ('income', 'expense', 'transfer') then
    raise exception 'Unsupported transaction type';
  end if;
  if requested_type = 'transfer' and (
    nullif(p_changes ->> 'targetAccountId', '') is null or
    nullif(p_changes ->> 'transferReason', '') is null
  ) then
    raise exception 'Transfers require a target account and transfer reason';
  end if;

  update public.transactions t
  set occurred_on = case when p_changes ? 'date' then (p_changes ->> 'date')::date else t.occurred_on end,
      account_id = case when p_changes ? 'accountId' then (p_changes ->> 'accountId')::uuid else t.account_id end,
      amount = case requested_type
        when 'income' then abs(t.amount)
        when 'expense' then -abs(t.amount)
        when 'transfer' then -abs(t.amount)
        else t.amount end,
      is_transfer = case requested_type when 'transfer' then true when 'income' then false when 'expense' then false else t.is_transfer end,
      target_account_id = case
        when requested_type in ('income', 'expense') then null
        when p_changes ? 'targetAccountId' then nullif(p_changes ->> 'targetAccountId', '')::uuid
        else t.target_account_id end,
      canonical_category_id = case
        when requested_type = 'transfer' then null
        when p_changes ? 'canonicalCategoryId' then nullif(p_changes ->> 'canonicalCategoryId', '')::uuid
        else t.canonical_category_id end,
      context_id = case when p_changes ? 'contextId' then nullif(p_changes ->> 'contextId', '')::uuid else t.context_id end,
      bucket_id = case
        when requested_type = 'transfer' then null
        when p_changes ? 'bucketId' then nullif(p_changes ->> 'bucketId', '')::uuid
        else t.bucket_id end,
      reimbursement_status = case
        when requested_type = 'transfer' then 'none'
        when p_changes ? 'reimbursementStatus' then p_changes ->> 'reimbursementStatus'
        else t.reimbursement_status end,
      tax_treatment = case
        when requested_type = 'transfer' then 'none'
        when p_changes ? 'taxTreatment' then p_changes ->> 'taxTreatment'
        else t.tax_treatment end,
      transfer_reason = case
        when requested_type in ('income', 'expense') then null
        when p_changes ? 'transferReason' then nullif(p_changes ->> 'transferReason', '')
        else t.transfer_reason end,
      status = case when p_changes ? 'status' then p_changes ->> 'status' else t.status end,
      tags = case when p_changes ? 'tags' then array(select jsonb_array_elements_text(p_changes -> 'tags')) else t.tags end,
      comment = case when p_changes ? 'comment' then coalesce(p_changes ->> 'comment', '') else t.comment end,
      classification_reviewed_at = now(),
      updated_at = now()
  where t.owner_id = auth.uid()
    and t.id = any(p_ids)
    and not (
      coalesce(nullif(p_changes ->> 'accountId', '')::uuid, t.account_id) =
      coalesce(nullif(p_changes ->> 'targetAccountId', '')::uuid, t.target_account_id)
      and coalesce(requested_type = 'transfer', t.is_transfer)
    );

  get diagnostics changed = row_count;
  return changed;
end;
$$;

comment on function public.bulk_edit_transactions(uuid[], jsonb) is
  'Atomically changes selected transaction metadata while preserving descriptions and absolute amounts.';
