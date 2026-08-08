# Pre-category-redesign Supabase snapshot

Snapshot schema: `backup_20260808_pre_category_redesign`

Application version: Rangels V0.2 (`0.2.0`)

The snapshot contains point-in-time copies of every Rangels table in the `public` schema:

- accounts
- categories
- merchants
- merchant_aliases
- imports
- transactions
- scheduled_transactions
- budgets
- budget_groups
- budget_group_members

The snapshot schema and every table in it revoke access from `public`, `anon`, and `authenticated`. The browser application cannot read or modify it.

The `manifest` table records the capture timestamp and exact row count of every source table. Migration `20260808163100_validate_pre_category_redesign_snapshot.sql` verifies that every copied count matches both the manifest and the live source at capture time.

## Restoration policy

Do not restore by deleting live data immediately. First restore the snapshot into temporary tables, compare row counts and identifiers, then perform a reviewed transactional replacement. Any restoration should preserve the current state in a second snapshot before it begins.

The rollback file for the snapshot drops only the backup schema. It must never be run as part of an ordinary application rollback.
