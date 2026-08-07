update public.transactions
set
  is_transfer = false,
  target_account_id = null,
  updated_at = now()
where external_id like 'alzex:%'
  and is_transfer = true
  and target_account_id = account_id;
