alter table public.transactions
  add column transfer_reason text
    check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

alter table public.category_classifications
  add column transfer_reason text
    check (transfer_reason in ('account_movement', 'joint_contribution', 'property_funding', 'business_funding', 'savings', 'debt_reduction', 'investment_contribution', 'other'));

update public.transactions
set transfer_reason = 'account_movement'
where is_transfer = true and transfer_reason is null;

comment on column public.transactions.transfer_reason is
  'Analytical reason for a ledger-neutral transfer. Funding context uses context_id; transfers never use bucket_id.';
