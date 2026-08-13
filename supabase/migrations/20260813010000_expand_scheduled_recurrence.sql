alter table public.scheduled_transactions
  add column if not exists recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  add column if not exists weekdays integer[] not null default '{}',
  add column if not exists months integer[] not null default '{}',
  add column if not exists month_day integer not null default 1 check (month_day between 1 and 31),
  add column if not exists is_virtual boolean not null default false;

comment on column public.scheduled_transactions.is_virtual is 'Forecast-only schedule. Advances when processed without creating ledger transactions.';
