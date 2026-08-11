create table public.schedule_suggestion_dismissals (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  suggestion_key text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, suggestion_key)
);

alter table public.schedule_suggestion_dismissals enable row level security;

create policy "Owners manage dismissed schedule suggestions"
  on public.schedule_suggestion_dismissals for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on table public.schedule_suggestion_dismissals to authenticated;

comment on table public.schedule_suggestion_dismissals is
  'Owner-scoped recurring-pattern suggestions intentionally removed from Scheduled review.';
