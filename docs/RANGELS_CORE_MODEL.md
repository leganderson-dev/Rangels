# Rangels — core model

Last updated: 2026-08-24

## One sentence

Rangels is import-first, merchant-first, and classifies every posted transaction by Purpose and Context, with exactly one Bucket for every expense.

## Dimensions

### Purpose

The active classification replacing the old Alzex/legacy category. It answers: what financial purpose did this serve?

Purpose has parent families, for example:

- Income
- Housing and utilities
- Food and dining
- Transport
- Health
- Children
- Lifestyle
- Financial
- Property
- Business
- Pets

Purpose picker/search must search parent names and child names. If a parent matches, show its children.

### Context

The financial world the transaction belongs to.

Current known contexts:

- Household
- Property — Everton Park
- Property — Currumundi
- Property — Toogoom
- Business — ASA
- Business — Folium Studio
- Review required

### Bucket

The allocation source used to fund an expense. Every expense has exactly one Bucket so Bucket-only reporting reconciles to total expenses.

Known buckets:

- Allocation source
- Daily Expenses
- Splurge
- Smile
- Fire Extinguisher
- Not applicable

Rules:

- Household income can be Bucket = Allocation source.
- Every expense, including Property and Business Context expenses, uses Daily Expenses, Splurge, Smile, or Fire Extinguisher.
- Transfers never use a bucket.
- Property Context preserves property attribution while Bucket records how the expense was funded; these dimensions are complementary.

## Transaction type rules

### Income

Positive account transaction. Has Purpose and Context. Household income can feed the allocation plan through Bucket = Allocation source.

### Expense

Negative account transaction. Has Purpose, Context, and exactly one Bucket.

### Transfer

Ledger-neutral for reporting. Never counts as income, expense, tax, or Household Bucket.

Transfer has:

- from_account
- to_account
- transfer_reason
- optional funding_context

Transfers still affect account running balances:

- money into selected account = positive
- money out of selected account = negative

Known transfer reasons:

- Account movement
- Joint-account contribution
- Household funding
- Property funding
- Business funding
- Savings movement
- Debt reduction
- Investment contribution
- Other

Important transfer patterns:

- `Transfer To Julia Meyer Pflug` from Anderson side => transfer to Julia CW, reason Household funding, context Household, no bucket.
- Julia import counterpart can appear as `Fast Transfer From LEGNAR RANGEL ...`; matching/consolidation should avoid double-counting but still allow reporting “how much Anderson transferred to Julia”.
- Transfers to credit card/cartão de crédito => Debt reduction, no funding context.
- Transfers to NAB mortgage/savings for Everton Park => Property funding, funding context Property — Everton Park.
- Transfers from Leg CW to ING Currumundi => Property funding, funding context Property — Currumundi when identifiable.
- Transfers from ING Currumundi to ING Fire Extinguisher => Savings movement, no funding context.

## Reimbursement

Reimbursement is a transaction flag/status, not a purpose/category.

`ToBeRefunded` and reimbursement/reimbursed decisions should not be converted blindly from legacy category.

## Known classification rules

### Allianz car insurance

`Direct Debit 181547 ALLIANZ INSURE 154874011012126176`

- Purpose: Vehicle insurance
- Context: Household
- Bucket: Daily Expenses

### Allianz home/content insurance

`Direct Debit 377946 ALLIANZ INSURE 60107HCHK019326180`

- Meaning: home/content insurance for principal home Everton Park
- Purpose: Home insurance
- Context: Property — Everton Park
- Bucket: Daily Expenses unless explicitly funded from another Bucket.

## Allocation and planning

Household has one shared allocation plan:

- Daily Expenses 60%
- Splurge 10%
- Smile 10%
- Fire Extinguisher 20%

This is not a transaction category and not a bank-account balance. It is a plan for eligible household income.

Current Plan page shows allocation target versus classified actual use. It is not yet an authoritative allowance ledger.

Future authoritative balance formula:

```text
Opening balance + new allocation - classified use ± approved movements = available balance
```

To answer “how much does Anderson/Julia/shared have available in Splurge/Smile/Fire Extinguisher”, the app still needs:

- immutable allocation ledger
- opening balances
- monthly allocation credits
- audited allowance movements
- explicit Anderson/Julia/shared split rules

## Account ownership and attribution

Account owner determines default attribution:

- Anderson account => Anderson
- Julia account => Julia
- Joint account => Shared/target

This is for “who paid / who contributed”, not necessarily who benefited.

An income or expense may optionally set a transaction-level Reporting Owner override. This never changes the originating account, ledger balance, or who physically paid. Reporting pages expose an explicit **Apply ownership overrides** toggle:

- off: attribution follows the originating account owner;
- on: attribution follows the Reporting Owner override, falling back to the account owner;
- All totals are unchanged in either mode.

Transfers cannot carry a Reporting Owner override; their contribution attribution follows the source account and the applicable transfer funding rule.

## Transaction timing

A completed transaction dated after the current Brisbane date is future-dated:

- it remains stored, visible and editable;
- it is excluded from today's actual account balance and actual reporting totals;
- Transactions shows it separately from actual posted activity;
- Calendar includes it on its effective date and carries its movement through the projected running balance;
- when that date arrives, it becomes actual automatically without changing its status or data.

Inactive accounts:

- move to bottom
- strikethrough
- excluded from overall total
- excluded from active import/source/target pickers

## Import and merchant intelligence

Import suggestions come from:

- exact merchant/import rules
- historical transaction matches
- description patterns
- purpose/context/bucket/tax/reimbursement defaults
- confidence score

If user overrides an import suggestion and selects “remember”, update the merchant/import rule so the next import is faster.

Rules are stored in Supabase. Exact table/column names should be inspected from code/migrations before editing directly.

## Reports

Spending reports should show stacked attribution:

- Anderson = source account owner Anderson
- Julia = source account owner Julia

Trends can show:

- Total line
- Anderson line
- Julia line
- median
- projection

Projection behavior is still undecided and should be brainstormed before changing it further.
