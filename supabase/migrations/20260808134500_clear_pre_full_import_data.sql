-- One-time V0.1 cleanup before the authoritative full Alzex import.
-- Authentication users, schema objects, and migration history are preserved.
truncate table
  public.budget_group_members,
  public.budget_groups,
  public.budgets,
  public.scheduled_transactions,
  public.transactions,
  public.imports,
  public.merchant_aliases,
  public.merchants,
  public.categories,
  public.accounts;
