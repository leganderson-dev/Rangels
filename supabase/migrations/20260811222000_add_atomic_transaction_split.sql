create or replace function public.split_transaction(p_id uuid, p_parts integer default 2)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  source public.transactions%rowtype;
  total_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  part_cents bigint;
  created_ids uuid[] := '{}';
  created_id uuid;
  part_number integer;
begin
  if p_parts < 2 or p_parts > 100 then
    raise exception 'A transaction can be split into between 2 and 100 parts';
  end if;

  select * into source
  from public.transactions
  where id = p_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  total_cents := round(source.amount * 100)::bigint;
  base_cents := trunc(total_cents::numeric / p_parts)::bigint;
  remainder_cents := total_cents - (base_cents * p_parts);

  for part_number in 1..p_parts loop
    part_cents := base_cents + case
      when part_number <= abs(remainder_cents) then sign(remainder_cents)::bigint
      else 0
    end;

    insert into public.transactions (
      owner_id, import_id, account_id, merchant_id, category_id,
      occurred_on, description, normalized_description, amount, balance,
      source_fingerprint, target_account_id, comment, is_transfer, status,
      payee, tags, external_id, legacy_category_id, canonical_category_id,
      context_id, bucket_id, reimbursement_status, tax_treatment,
      transfer_reason, classification_reviewed_at, updated_at
    ) values (
      source.owner_id, source.import_id, source.account_id, source.merchant_id, source.category_id,
      source.occurred_on, source.description, source.normalized_description, part_cents::numeric / 100, null,
      case when part_number = 1 then source.source_fingerprint else null end,
      source.target_account_id, source.comment, source.is_transfer, source.status,
      source.payee, source.tags, case when part_number = 1 then source.external_id else null end,
      source.legacy_category_id, source.canonical_category_id,
      source.context_id, source.bucket_id, source.reimbursement_status, source.tax_treatment,
      source.transfer_reason, source.classification_reviewed_at, now()
    ) returning id into created_id;

    created_ids := array_append(created_ids, created_id);
  end loop;

  delete from public.transactions where id = source.id and owner_id = auth.uid();
  return created_ids;
end;
$$;

grant execute on function public.split_transaction(uuid, integer) to authenticated;

comment on function public.split_transaction(uuid, integer) is
  'Atomically replaces one owned transaction with evenly divided copies, preserving classification and metadata.';
