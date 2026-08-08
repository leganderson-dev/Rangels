insert into public.household_members (workspace_owner_id, name, display_order)
select owner_id, 'Joint', 3
from (select distinct owner_id from public.accounts) owners
on conflict (workspace_owner_id, name) do nothing;

do $$
begin
  if exists (
    select 1
    from (select distinct owner_id from public.accounts) owner
    where not exists (
      select 1 from public.household_members member
      where member.workspace_owner_id = owner.owner_id and member.name = 'Joint'
    )
  ) then
    raise exception 'Joint household member was not created for every workspace';
  end if;
end $$;
