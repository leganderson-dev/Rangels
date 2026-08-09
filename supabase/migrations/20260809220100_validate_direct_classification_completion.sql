do $$
declare
  applied_count integer;
  remaining_count integer;
begin
  select count(*) into applied_count
  from backup_20260809_direct_suggestions.transactions;

  select count(*) into remaining_count
  from public.transactions t
  left join public.contexts ctx on ctx.id = t.context_id
  left join public.canonical_categories purpose on purpose.id = t.canonical_category_id
  where t.status = 'C'
    and (
      (t.is_transfer and (
        t.transfer_reason is null
        or (t.transfer_reason in ('property_funding', 'business_funding') and t.context_id is null)
      ))
      or
      (not t.is_transfer and (
        t.canonical_category_id is null
        or t.context_id is null
        or ctx.name = 'Review required'
        or (purpose.type = 'expense' and ctx.name = 'Household' and t.bucket_id is null)
        or t.tax_treatment = 'review'
        or t.classification_reviewed_at is null
      ))
    );

  raise notice 'Direct suggestion batch updated % transactions; % completed transactions remain incomplete.', applied_count, remaining_count;

  if remaining_count <> 0 then
    raise exception 'Database-wide classification validation failed: % completed transactions remain incomplete', remaining_count;
  end if;
end $$;
