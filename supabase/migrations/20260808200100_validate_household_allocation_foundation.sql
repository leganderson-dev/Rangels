do $$
declare
  account_count integer;
  attributed_count integer;
  plan_total numeric;
begin
  select count(*) into account_count from public.accounts;
  select count(*) into attributed_count
  from public.accounts account
  join public.household_members member on member.id = account.member_id
  where member.name = 'Anderson';

  if account_count <> attributed_count then
    raise exception 'Expected all existing accounts to be attributed to Anderson; found % of %', attributed_count, account_count;
  end if;

  if not exists (select 1 from public.household_members where name = 'Julia') then
    raise exception 'Julia household member was not created';
  end if;

  if not exists (select 1 from public.contexts where name = 'Household' and kind = 'personal') then
    raise exception 'Household context was not created from Personal';
  end if;

  if exists (select 1 from public.contexts where name = 'Personal') then
    raise exception 'Legacy Personal context still exists';
  end if;

  if not exists (select 1 from public.contexts where name = 'Business — Folium Studio' and kind = 'business') then
    raise exception 'Folium Studio context was not created';
  end if;

  select sum(target.target_percentage) into plan_total
  from public.allocation_targets target
  join public.allocation_plans plan on plan.id = target.allocation_plan_id
  where plan.name = 'Shared household plan' and plan.is_active;

  if plan_total is distinct from 100.00 then
    raise exception 'Shared household allocation must total 100%%; found %', plan_total;
  end if;
end $$;
