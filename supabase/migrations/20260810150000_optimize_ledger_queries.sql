create index if not exists transactions_owner_occurred_on_idx
  on public.transactions (owner_id, occurred_on desc);

create index if not exists transactions_owner_account_occurred_on_idx
  on public.transactions (owner_id, account_id, occurred_on desc);

create index if not exists transactions_owner_target_account_occurred_on_idx
  on public.transactions (owner_id, target_account_id, occurred_on desc)
  where target_account_id is not null;

create index if not exists transactions_owner_category_idx
  on public.transactions (owner_id, canonical_category_id)
  where canonical_category_id is not null;

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
   and (transaction.account_id = account.id or transaction.target_account_id = account.id)
  where account.owner_id = auth.uid()
  group by account.id, account.initial_balance;
$$;

create or replace function public.canonical_category_transaction_counts()
returns table (category_id uuid, transaction_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    category.id as category_id,
    count(transaction.id) as transaction_count
  from public.canonical_categories category
  left join public.transactions transaction
    on transaction.canonical_category_id = category.id
   and transaction.owner_id = auth.uid()
  where category.owner_id = auth.uid()
  group by category.id;
$$;

grant execute on function public.account_balance_summary() to authenticated;
grant execute on function public.canonical_category_transaction_counts() to authenticated;
