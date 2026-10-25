update public.accounts current
set member_id = saved.member_id
from backup_20260824_julia_cw_owner.accounts saved
where current.id = saved.id;

drop schema backup_20260824_julia_cw_owner cascade;
