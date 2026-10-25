-- A completed transaction with a future effective date is projected, not yet
-- part of today's actual account balance.
create or replace function public.account_balance_summary()
returns table (account_id uuid, balance numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    account.id as account_id,
    account.initial_balance + coalesce(sum(
      case
        when not transaction.is_transfer and transaction.account_id = account.id then transaction.amount
        when transaction.is_transfer and transaction.account_id = account.id then -abs(transaction.amount)
        when transaction.is_transfer and transaction.target_account_id = account.id then abs(transaction.amount)
        else 0
      end
    ), 0) as balance
  from public.accounts account
  left join public.transactions transaction
    on transaction.status = 'C'
   and transaction.occurred_on <= (current_timestamp at time zone 'Australia/Brisbane')::date
   and (transaction.account_id = account.id or transaction.target_account_id = account.id)
  where account.owner_id = auth.uid()
  group by account.id, account.initial_balance;
$$;

create or replace function public.account_ledger_summary(
  p_account_id uuid,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  opening_balance numeric,
  income numeric,
  expenses numeric,
  transfers_in numeric,
  transfers_out numeric,
  net_movement numeric,
  closing_balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with selected_account as (
    select id, initial_balance from public.accounts
    where id = p_account_id and owner_id = auth.uid()
  ), relevant as (
    select transaction.occurred_on, transaction.amount, transaction.is_transfer,
      transaction.account_id, transaction.target_account_id,
      case
        when not transaction.is_transfer and transaction.account_id = p_account_id then transaction.amount
        when transaction.is_transfer and transaction.account_id = p_account_id then -abs(transaction.amount)
        when transaction.is_transfer and transaction.target_account_id = p_account_id then abs(transaction.amount)
        else 0
      end as account_effect
    from public.transactions transaction
    where transaction.owner_id = auth.uid()
      and transaction.status = 'C'
      and transaction.occurred_on <= (current_timestamp at time zone 'Australia/Brisbane')::date
      and (transaction.account_id = p_account_id or transaction.target_account_id = p_account_id)
  ), totals as (
    select
      account.initial_balance + coalesce(sum(relevant.account_effect) filter (where p_date_from is not null and relevant.occurred_on < p_date_from), 0) as opening_balance,
      coalesce(sum(relevant.amount) filter (where not relevant.is_transfer and relevant.account_id = p_account_id and relevant.amount > 0 and (p_date_from is null or relevant.occurred_on >= p_date_from) and (p_date_to is null or relevant.occurred_on <= p_date_to)), 0) as income,
      coalesce(sum(relevant.amount) filter (where not relevant.is_transfer and relevant.account_id = p_account_id and relevant.amount < 0 and (p_date_from is null or relevant.occurred_on >= p_date_from) and (p_date_to is null or relevant.occurred_on <= p_date_to)), 0) as expenses,
      coalesce(sum(abs(relevant.amount)) filter (where relevant.is_transfer and relevant.target_account_id = p_account_id and (p_date_from is null or relevant.occurred_on >= p_date_from) and (p_date_to is null or relevant.occurred_on <= p_date_to)), 0) as transfers_in,
      coalesce(sum(abs(relevant.amount)) filter (where relevant.is_transfer and relevant.account_id = p_account_id and (p_date_from is null or relevant.occurred_on >= p_date_from) and (p_date_to is null or relevant.occurred_on <= p_date_to)), 0) as transfers_out
    from selected_account account left join relevant on true
    group by account.initial_balance
  )
  select totals.opening_balance, totals.income, totals.expenses, totals.transfers_in, totals.transfers_out,
    totals.income + totals.expenses + totals.transfers_in - totals.transfers_out,
    totals.opening_balance + totals.income + totals.expenses + totals.transfers_in - totals.transfers_out
  from totals;
$$;
