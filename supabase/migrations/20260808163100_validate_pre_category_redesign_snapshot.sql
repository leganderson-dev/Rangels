do $$
declare
  item record;
  snapshot_count bigint;
  live_count bigint;
begin
  for item in
    select table_name, row_count
    from backup_20260808_pre_category_redesign.manifest
  loop
    execute format('select count(*) from backup_20260808_pre_category_redesign.%I', item.table_name)
      into snapshot_count;
    execute format('select count(*) from public.%I', item.table_name)
      into live_count;

    if snapshot_count <> item.row_count or live_count <> item.row_count then
      raise exception 'Snapshot validation failed for %: manifest %, snapshot %, live %',
        item.table_name, item.row_count, snapshot_count, live_count;
    end if;
  end loop;

  if (select count(*) from backup_20260808_pre_category_redesign.accounts) = 0
    or (select count(*) from backup_20260808_pre_category_redesign.categories) = 0
    or (select count(*) from backup_20260808_pre_category_redesign.transactions) = 0 then
    raise exception 'Snapshot validation failed: essential Rangels tables must not be empty';
  end if;
end
$$;
