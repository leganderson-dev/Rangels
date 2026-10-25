# Rangels — session handoff

Last updated: 2026-08-24

## Start here

App folder: `/Users/arangel/Documents/ChatGPT/Rangels/Rangels`

Run:

```bash
npm run dev
```

Local URL: `http://localhost:5176`

If Chrome says “localhost refused to connect”, the dev server is not running.

## Project principles

- Extremely simple.
- Cross-platform macOS/Windows.
- React + TypeScript + Vite.
- Supabase backend.
- No backend server for V1.
- Merchant-first architecture.
- Import-first workflow.
- No unnecessary abstractions.
- Every feature must earn its place.
- Version changes must be explicit; tell Anderson whenever version changes.

## Current app state

Rangels is a personal/household finance app ported from an earlier `finance-app` UX onto the agreed Rangels architecture.

Active top-level areas:

- Overview
- Transactions
- Calendar
- Merchants
- Purposes
- Reports
- Plan
- Budget
- Scheduled
- Help

Navigation grouping:

- Overview
- Transactions + Calendar
- Merchants + Purposes
- Reports + Plan + Budget + Scheduled

Core model:

- Purpose replaced the old legacy category as the active classification.
- Context explains which financial world a transaction belongs to.
- Household Bucket explains allocation/use of household money.
- Transfers are ledger-neutral for income/expense/tax/bucket reporting.
- Transfers still affect individual account running balances.
- Legacy category is historical evidence only: notes plus dormant fields for rollback/snapshot comparison.

## Current urgent thread

Anderson confirmed balances on 17 Aug 2026, imported bank transactions since then, and now the 17 Aug running balance is wrong.

See `docs/RUNNING_BALANCE_DEBUG.md`.

## User style/preferences

Anderson wants practical progress, clear evidence, no unnecessary abstractions, and to be consulted before assumptions that change financial meaning. If something is broken, prove the cause before changing data.

## Data safety rules

- Preserve user data.
- Do not destroy legacy fields yet; leave legacy category IDs dormant on transactions for rollback/snapshot comparison.
- Existing transactions should keep `Legacy classification: ...` in notes.
- Reports, plans, budgets, and schedules can be rebuilt more freely than core transactions/accounts/import data.
- Do not change financial meaning silently.
