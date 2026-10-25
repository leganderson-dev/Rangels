alter table public.asset_loans
  add column repayment_type text check (repayment_type in ('interest_only', 'principal_and_interest')),
  add column remaining_term_years numeric(6,2) check (remaining_term_years > 0 and remaining_term_years <= 100);

comment on column public.asset_loans.remaining_term_years is
  'Remaining loan term from balance_on, used for repayment projection.';

