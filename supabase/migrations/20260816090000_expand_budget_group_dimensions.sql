alter table public.budget_group_members
  add column member_type text not null default 'purpose',
  add column purpose_family text,
  add column bucket_id uuid references public.buckets(id) on delete cascade,
  add column context_id uuid references public.contexts(id) on delete cascade;

alter table public.budget_group_members
  alter column canonical_category_id drop not null;

alter table public.budget_group_members
  add constraint budget_group_members_type_check
    check (member_type in ('purpose', 'purpose_family', 'bucket', 'context')),
  add constraint budget_group_members_target_check
    check (
      (member_type = 'purpose' and canonical_category_id is not null and purpose_family is null and bucket_id is null and context_id is null)
      or (member_type = 'purpose_family' and canonical_category_id is null and purpose_family is not null and bucket_id is null and context_id is null)
      or (member_type = 'bucket' and canonical_category_id is null and purpose_family is null and bucket_id is not null and context_id is null)
      or (member_type = 'context' and canonical_category_id is null and purpose_family is null and bucket_id is null and context_id is not null)
    );

create unique index budget_group_members_purpose_unique
  on public.budget_group_members(group_id, canonical_category_id)
  where member_type = 'purpose';

create unique index budget_group_members_family_unique
  on public.budget_group_members(group_id, purpose_family)
  where member_type = 'purpose_family';

create unique index budget_group_members_bucket_unique
  on public.budget_group_members(group_id, bucket_id)
  where member_type = 'bucket';

create unique index budget_group_members_context_unique
  on public.budget_group_members(group_id, context_id)
  where member_type = 'context';
