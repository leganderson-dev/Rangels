-- Julia CW was still assigned to Anderson, causing owner-attributed Budget and
-- reporting filters to include Julia's transactions under Anderson.

create schema backup_20260824_julia_cw_owner;
revoke all on schema backup_20260824_julia_cw_owner from public, anon, authenticated;

create table backup_20260824_julia_cw_owner.accounts
  as select * from public.accounts where name = 'Julia CW';

do $$
declare current_owner text;
declare julia_member_count integer;
begin
  select member.name into current_owner
  from public.accounts account
  join public.household_members member on member.id = account.member_id
  where account.name = 'Julia CW';

  select count(*) into julia_member_count
  from public.household_members
  where name = 'Julia';

  if current_owner <> 'Anderson' then
    raise exception 'Expected Julia CW to be assigned to Anderson before repair, found %', current_owner;
  end if;
  if julia_member_count <> 1 then
    raise exception 'Expected exactly one Julia household member, found %', julia_member_count;
  end if;
end $$;

update public.accounts
set member_id = (select id from public.household_members where name = 'Julia')
where name = 'Julia CW';

do $$
declare repaired_owner text;
begin
  select member.name into repaired_owner
  from public.accounts account
  join public.household_members member on member.id = account.member_id
  where account.name = 'Julia CW';

  if repaired_owner <> 'Julia' then
    raise exception 'Julia CW owner repair failed: found %', repaired_owner;
  end if;
end $$;

revoke all on all tables in schema backup_20260824_julia_cw_owner from public, anon, authenticated;

