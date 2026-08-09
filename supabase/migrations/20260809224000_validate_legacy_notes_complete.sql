do $$
declare
  missing_expenses integer;
  missing_credits integer;
  missing_transfers integer;
begin
  select
    count(*) filter (where not t.is_transfer and t.amount < 0),
    count(*) filter (where not t.is_transfer and t.amount >= 0),
    count(*) filter (where t.is_transfer)
  into missing_expenses, missing_credits, missing_transfers
  from public.transactions t
  left join public.categories legacy on legacy.id = t.category_id
  where position(
    'Legacy classification: ' || coalesce(legacy.path, 'None')
    in coalesce(t.comment, '')
  ) = 0;

  raise notice 'Missing legacy note — expenses: %, credits: %, transfers: %',
    missing_expenses, missing_credits, missing_transfers;

  if missing_expenses <> 0 or missing_credits <> 0 or missing_transfers <> 0 then
    raise exception 'Legacy-note validation failed — expenses: %, credits: %, transfers: %',
      missing_expenses, missing_credits, missing_transfers;
  end if;
end $$;
