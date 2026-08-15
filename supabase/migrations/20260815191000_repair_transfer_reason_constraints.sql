do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname, cls.relname
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname in ('transactions', 'scheduled_transactions', 'category_classifications')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%transfer_reason%'
  loop
    execute format('alter table public.%I drop constraint %I', constraint_row.relname, constraint_row.conname);
  end loop;
end;
$$;

alter table public.transactions
  add constraint transactions_transfer_reason_check
  check (transfer_reason is null or transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.scheduled_transactions
  add constraint scheduled_transactions_transfer_reason_check
  check (transfer_reason is null or transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.category_classifications
  add constraint category_classifications_transfer_reason_check
  check (transfer_reason is null or transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

notify pgrst, 'reload schema';
