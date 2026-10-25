-- Budget groups can include a broad dimension (for example a Bucket) while
-- excluding narrower Purpose, Context, or Bucket rules.

alter table public.budget_group_members
  add column is_exclusion boolean not null default false;

comment on column public.budget_group_members.is_exclusion is
  'False includes matching transactions in the group; true removes matching transactions after inclusion rules are evaluated.';

