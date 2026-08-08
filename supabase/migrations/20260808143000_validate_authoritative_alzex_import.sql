-- Validate the authoritative Alzex import whenever it is present. This is a
-- no-op for fresh databases that have not imported an Alzex export.
do $$
declare
  expected record;
  actual_balance numeric;
  actual_count bigint;
  active_total numeric;
  initial_component numeric;
  normal_component numeric;
  outgoing_component numeric;
  incoming_component numeric;
begin
  if not exists (
    select 1 from public.transactions where external_id like 'alzex:%'
  ) then
    return;
  end if;

  select count(*) into actual_count
  from public.transactions
  where external_id like 'alzex:%';
  if actual_count <> 12136 then
    raise exception 'Alzex transaction count mismatch: expected 12136 cleared rows, got %', actual_count;
  end if;

  select count(*) into actual_count
  from public.transactions
  where external_id like 'alzex:%' and status = 'C';
  if actual_count <> 12136 then
    raise exception 'Alzex cleared count mismatch: expected 12136, got %', actual_count;
  end if;

  select count(*) into actual_count
  from public.transactions
  where external_id like 'alzex:%' and status = 'P';
  if actual_count <> 0 then
    raise exception 'Alzex pending rows must not be posted to the historical ledger, got %', actual_count;
  end if;

  select count(*) into actual_count from public.accounts;
  if actual_count <> 9 then
    raise exception 'Alzex account count mismatch: expected 9, got %', actual_count;
  end if;

  for expected in
    select * from (values
      ('CartaodeCredito', 332.37::numeric),
      ('NAB', 7080.00::numeric),
      ('NAB Savings', 4.15::numeric),
      ('ING Currumundi', 9534.28::numeric),
      ('ING FireExtingusher', 15000.00::numeric),
      ('Leg CW', 30799.56::numeric),
      ('Smile - YL 700', 0.41::numeric),
      ('Julia CW', -4782.92::numeric),
      ('Staging - Hub', 115985.42::numeric)
    ) as targets(account_name, balance)
  loop
    select
      a.initial_balance + coalesce(sum(
        case
          when t.status <> 'C' then 0
          when not t.is_transfer and t.account_id = a.id then t.amount
          when t.is_transfer and t.account_id = a.id then -abs(t.amount)
          when t.is_transfer and t.target_account_id = a.id then abs(t.amount)
          else 0
        end
      ), 0)
    into actual_balance
    from public.accounts a
    left join public.transactions t
      on t.account_id = a.id or t.target_account_id = a.id
    where a.name = expected.account_name
    group by a.id, a.initial_balance;

    if actual_balance is null or abs(actual_balance - expected.balance) > 0.004 then
      select
        a.initial_balance,
        coalesce(sum(t.amount) filter (where t.status = 'C' and not t.is_transfer and t.account_id = a.id), 0),
        coalesce(sum(abs(t.amount)) filter (where t.status = 'C' and t.is_transfer and t.account_id = a.id), 0),
        coalesce(sum(abs(t.amount)) filter (where t.status = 'C' and t.is_transfer and t.target_account_id = a.id), 0)
      into initial_component, normal_component, outgoing_component, incoming_component
      from public.accounts a
      left join public.transactions t
        on t.account_id = a.id or t.target_account_id = a.id
      where a.name = expected.account_name
      group by a.id, a.initial_balance;
      raise exception 'Alzex balance mismatch for %: expected %, got % (initial %, normal %, outgoing %, incoming %)',
        expected.account_name, expected.balance, actual_balance,
        initial_component, normal_component, outgoing_component, incoming_component;
    end if;
  end loop;

  select sum(
    a.initial_balance + coalesce((
      select sum(
        case
          when t.status <> 'C' then 0
          when not t.is_transfer and t.account_id = a.id then t.amount
          when t.is_transfer and t.account_id = a.id then -abs(t.amount)
          when t.is_transfer and t.target_account_id = a.id then abs(t.amount)
          else 0
        end
      )
      from public.transactions t
      where t.account_id = a.id or t.target_account_id = a.id
    ), 0)
  ) into active_total
  from public.accounts a
  where a.is_active;

  if abs(active_total - 62750.77) > 0.004 then
    raise exception 'Alzex active total mismatch: expected 62750.77, got %', active_total;
  end if;
end
$$;
