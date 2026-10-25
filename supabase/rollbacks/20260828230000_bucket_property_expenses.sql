drop trigger if exists transactions_default_property_expense_bucket on public.transactions;
drop function if exists public.default_property_expense_bucket();

update public.transactions transaction
set bucket_id = backup.bucket_id,
    updated_at = backup.updated_at
from backup_20260828_property_expense_buckets.transactions backup
where transaction.id = backup.id;

drop schema backup_20260828_property_expense_buckets cascade;
