alter table public.transactions
  drop constraint if exists transactions_transfer_reason_check;

alter table public.transactions
  add constraint transactions_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.scheduled_transactions
  drop constraint if exists scheduled_transactions_transfer_reason_check;

alter table public.scheduled_transactions
  add constraint scheduled_transactions_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.category_classifications
  drop constraint if exists category_classifications_transfer_reason_check;

alter table public.category_classifications
  add constraint category_classifications_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'household_funding', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

comment on column public.transactions.transfer_reason is
  'Analytical reason for a ledger-neutral transfer, including household funding. Transfers never use bucket_id.';
