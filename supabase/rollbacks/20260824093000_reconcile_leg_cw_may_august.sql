delete from public.transactions
where source_fingerprint in (
  'reconcile:leg-cw:2026-08-19:pub-pool:12202.78',
  'reconcile:leg-cw:2026-08-19:pub-pool:12206.08'
);

delete from public.transactions
where id in (
  select id from backup_20260824_leg_cw_reconciliation.transactions
  where id <> 'a31f312e-f25f-408c-9a81-1f0bd8c88f0b'
);

insert into public.transactions
select * from backup_20260824_leg_cw_reconciliation.transactions
where id <> 'a31f312e-f25f-408c-9a81-1f0bd8c88f0b';

drop schema backup_20260824_leg_cw_reconciliation cascade;
