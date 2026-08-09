do $$
declare
  changed_legacy_references integer;
  incomplete_transactions integer;
  legacy_trigger_count integer;
  legacy_function_count integer;
  reset_feature_rows integer;
begin
  select count(*) into changed_legacy_references
  from public.transactions current
  join backup_20260809_v09_legacy_retirement.transactions prior on prior.id = current.id
  where current.category_id is distinct from prior.category_id
     or current.legacy_category_id is distinct from prior.legacy_category_id;

  select count(*) into incomplete_transactions
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
      ))
    );

  select count(*) into legacy_trigger_count
  from pg_trigger
  where tgname = 'transactions_apply_category_classification'
    and not tgisinternal;

  select count(*) into legacy_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'apply_category_classification';

  select
    (select count(*) from public.budgets)
    + (select count(*) from public.budget_groups)
    + (select count(*) from public.budget_group_members)
    + (select count(*) from public.scheduled_transactions)
  into reset_feature_rows;

  if changed_legacy_references <> 0 then
    raise exception 'V0.9 validation failed: % dormant legacy references changed', changed_legacy_references;
  end if;
  if incomplete_transactions <> 0 then
    raise exception 'V0.9 validation failed: % completed transactions lack canonical classification', incomplete_transactions;
  end if;
  if legacy_trigger_count <> 0 or legacy_function_count <> 0 then
    raise exception 'V0.9 validation failed: legacy automation remains (% triggers, % functions)', legacy_trigger_count, legacy_function_count;
  end if;
  if reset_feature_rows <> 0 then
    raise exception 'V0.9 validation failed: reset feature tables contain % rows', reset_feature_rows;
  end if;

  raise notice 'Rangels V0.9 legacy retirement validated: canonical transactions complete; legacy references preserved and dormant.';
end $$;
