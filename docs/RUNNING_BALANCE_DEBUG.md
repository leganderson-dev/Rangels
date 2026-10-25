# Running balance debug — 17 Aug 2026

Last updated: 2026-08-24

## Problem

Anderson confirmed balances on 17 Aug 2026 against the bank. Later he imported transactions downloaded since 17 Aug. Now the app shows the 17 Aug running balance incorrectly.

Do not change data until the cause is proven.

## Bank evidence from screenshot

For the Leg CW account around 16–17 Aug 2026:

Sun 16 Aug 2026:

- Transfer To Julia Meyer Pflug CommBank App I love you: -AUD200.00, balance AUD2,525.58
- SQ EMILY FOORD: -AUD7.00, balance AUD2,725.58
- BUNNINGS STAFFORD: -AUD79.41, balance AUD2,732.58

Mon 17 Aug 2026:

- Wdl ATM CBA ATM BROOKSIDE: -AUD250.00, balance AUD2,275.58
- Salary SFDC AUSTRALIA P 20260817: +AUD11,695.87, balance AUD13,971.45
- MILLIORE KOREAN RES SYDNEY AU: -AUD30.60, balance AUD13,940.85

Expected closing balance for Mon 17 Aug 2026: AUD13,940.85.

## App evidence from screenshot

Calendar for Aug 2026, selected Leg CW:

- App movement on 17 Aug: +AUD11,415.27
- App running/closing balance on 17 Aug: AUD11,610.85

The movement appears correct:

```text
AUD11,695.87 - AUD250.00 - AUD30.60 = AUD11,415.27
```

Therefore the app’s implied opening balance for 17 Aug is:

```text
AUD11,610.85 - AUD11,415.27 = AUD195.58
```

Expected opening balance is:

```text
AUD2,525.58
```

Difference:

```text
AUD2,525.58 - AUD195.58 = AUD2,330.00
```

## Current hypothesis

The 17 Aug daily movement is correct. The error is likely in the balance brought forward into 17 Aug, not in the three transactions on 17 Aug.

Likely causes:

1. A missing/extra posted transaction before 17 Aug for Leg CW, totaling AUD2,330.00.
2. A scheduled transaction materialized/backdated before or on 17 Aug.
3. Transfer handling/sign error before 17 Aug.
4. Duplicate/skipped import around 16–17 Aug.
5. Running balance anchored to the wrong account/date/opening checkpoint.
6. Inactive-account exclusion changed account totals incorrectly.
7. Future scheduled preview transactions included in historical running balance.

## Next-session investigation checklist

- Identify the selected Leg CW account id.
- Query all posted transactions for Leg CW with date <= 2026-08-17.
- Separately query 2026-08-14 through 2026-08-17.
- Search all Leg CW transactions for amount 2330 or combinations summing to 2330.
- Inspect scheduled-generated transactions and any `scheduled_transaction_id`/status/source fields.
- Confirm scheduled preview/future rows are not included in historical running balances.
- Confirm transfers are included in account balance only when the selected account is source or destination, with correct sign.
- Confirm inactive accounts are excluded from overall totals but do not affect Leg CW running balance.
- Check whether an account balance checkpoint exists for 17 Aug and whether calendar uses it.
- Compare database against bank order around 16–17 Aug.

## Rule of thumb

For a selected account, running balance should be:

```text
account opening/checkpoint + all posted account-affecting movements up to the day
```

Transfers affect a selected account:

- money into selected account = positive
- money out of selected account = negative

Transfers remain ledger-neutral only for income/expense reporting; they are not neutral for individual account balances.
