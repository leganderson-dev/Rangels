update public.transactions set transfer_reason = 'other' where transfer_reason = 'household_funding';
update public.scheduled_transactions set transfer_reason = 'other' where transfer_reason = 'household_funding';
update public.category_classifications set transfer_reason = 'other' where transfer_reason = 'household_funding';

alter table public.transactions drop constraint if exists transactions_transfer_reason_check;
alter table public.transactions add constraint transactions_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.scheduled_transactions drop constraint if exists scheduled_transactions_transfer_reason_check;
alter table public.scheduled_transactions add constraint scheduled_transactions_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.category_classifications drop constraint if exists category_classifications_transfer_reason_check;
alter table public.category_classifications add constraint category_classifications_transfer_reason_check
  check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));
