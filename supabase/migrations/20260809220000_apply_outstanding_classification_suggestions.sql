create schema if not exists backup_20260809_direct_suggestions;

create table backup_20260809_direct_suggestions.transactions as
select
  t.id,
  t.canonical_category_id,
  t.context_id,
  t.bucket_id,
  t.tax_treatment,
  t.transfer_reason,
  t.classification_reviewed_at,
  t.updated_at
from public.transactions t
left join public.contexts ctx on ctx.id = t.context_id
left join public.canonical_categories purpose on purpose.id = t.canonical_category_id
where t.status = 'C'
  and (
    t.classification_reviewed_at is null
    or (t.is_transfer and (
      t.transfer_reason is null
      or (t.transfer_reason in ('property_funding', 'business_funding') and t.context_id is null)
    ))
    or (not t.is_transfer and (
      t.canonical_category_id is null
      or t.context_id is null
      or ctx.name = 'Review required'
      or (purpose.type = 'expense' and ctx.name = 'Household' and t.bucket_id is null)
      or t.tax_treatment = 'review'
    ))
  );

alter table backup_20260809_direct_suggestions.transactions add primary key (id);

-- First use the strongest evidence available: an identical reviewed description
-- with the same ledger direction and transaction type. Majority wins when the
-- history contains more than one classification.
with evidence as (
  select
    target.id as target_id,
    history.canonical_category_id,
    history.context_id,
    history.bucket_id,
    history.tax_treatment,
    history.transfer_reason,
    count(*) as evidence_count,
    row_number() over (
      partition by target.id
      order by count(*) desc, max(history.classification_reviewed_at) desc
    ) as preference
  from backup_20260809_direct_suggestions.transactions snapshot
  join public.transactions target on target.id = snapshot.id
  join public.transactions history
    on lower(regexp_replace(history.description, '[^a-zA-Z]+', ' ', 'g'))
       = lower(regexp_replace(target.description, '[^a-zA-Z]+', ' ', 'g'))
   and history.is_transfer = target.is_transfer
   and (history.amount >= 0) = (target.amount >= 0)
   and history.classification_reviewed_at is not null
   and history.id <> target.id
  left join public.contexts history_context on history_context.id = history.context_id
  left join public.canonical_categories history_purpose on history_purpose.id = history.canonical_category_id
  where
    (history.is_transfer and history.transfer_reason is not null
      and (history.transfer_reason not in ('property_funding', 'business_funding') or history.context_id is not null))
    or
    (not history.is_transfer and history.canonical_category_id is not null and history.context_id is not null
      and history_context.name <> 'Review required'
      and history.tax_treatment <> 'review'
      and (history_purpose.type <> 'expense' or history_context.name <> 'Household' or history.bucket_id is not null))
  group by target.id, history.canonical_category_id, history.context_id, history.bucket_id,
    history.tax_treatment, history.transfer_reason
), best as (
  select * from evidence where preference = 1
)
update public.transactions target
set canonical_category_id = best.canonical_category_id,
    context_id = best.context_id,
    bucket_id = best.bucket_id,
    tax_treatment = best.tax_treatment,
    transfer_reason = best.transfer_reason,
    classification_reviewed_at = now(),
    updated_at = now()
from best
where target.id = best.target_id;

-- Apply already approved legacy mappings where exact reviewed history was not
-- available. This preserves the owner's resolved migration decisions.
update public.transactions target
set canonical_category_id = mapping.canonical_category_id,
    context_id = mapping.context_id,
    bucket_id = mapping.bucket_id,
    tax_treatment = mapping.tax_treatment,
    transfer_reason = mapping.transfer_reason,
    classification_reviewed_at = now(),
    updated_at = now()
from backup_20260809_direct_suggestions.transactions snapshot,
     public.category_classifications mapping
where target.id = snapshot.id
  and mapping.legacy_category_id = target.category_id
  and mapping.migration_status = 'mapped'
  and target.classification_reviewed_at is null;

-- Complete the remaining non-transfer rows with the same conservative fallback
-- offered by the Migration UI. Existing valid dimensions always win.
update public.transactions target
set canonical_category_id = coalesce(target.canonical_category_id, purpose.id),
    context_id = coalesce(target.context_id, household.id),
    bucket_id = case
      when target.amount < 0 then coalesce(target.bucket_id, splurge.id)
      else null
    end,
    tax_treatment = case when target.tax_treatment = 'review' then 'none' else target.tax_treatment end,
    transfer_reason = null,
    classification_reviewed_at = now(),
    updated_at = now()
from backup_20260809_direct_suggestions.transactions snapshot
join public.contexts household on household.owner_id = (select owner_id from public.transactions where id = snapshot.id)
  and household.name = 'Household'
join public.canonical_categories purpose on purpose.owner_id = household.owner_id
  and purpose.name = case when (select amount from public.transactions where id = snapshot.id) >= 0 then 'Other income' else 'Other lifestyle' end
  and purpose.type = case when (select amount from public.transactions where id = snapshot.id) >= 0 then 'income' else 'expense' end
left join public.buckets splurge on splurge.owner_id = household.owner_id and splurge.name = 'Splurge'
where target.id = snapshot.id
  and not target.is_transfer
  and (
    target.canonical_category_id is null
    or target.context_id is null
    or target.tax_treatment = 'review'
    or target.classification_reviewed_at is null
  );

-- A transfer without stronger evidence remains a ledger-safe account movement.
update public.transactions target
set canonical_category_id = null,
    context_id = null,
    bucket_id = null,
    tax_treatment = 'none',
    transfer_reason = 'account_movement',
    classification_reviewed_at = now(),
    updated_at = now()
from backup_20260809_direct_suggestions.transactions snapshot
where target.id = snapshot.id
  and target.is_transfer
  and target.transfer_reason is null;

-- Abort atomically if any affected row still fails the application's completion
-- rules. A successful migration therefore guarantees a zero remainder for this batch.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from backup_20260809_direct_suggestions.transactions snapshot
  join public.transactions t on t.id = snapshot.id
  left join public.contexts ctx on ctx.id = t.context_id
  left join public.canonical_categories purpose on purpose.id = t.canonical_category_id
  where
    (t.is_transfer and (
      t.transfer_reason is null
      or (t.transfer_reason in ('property_funding', 'business_funding') and t.context_id is null)
    ))
    or
    (not t.is_transfer and (
      t.canonical_category_id is null
      or t.context_id is null
      or ctx.name = 'Review required'
      or (purpose.type = 'expense' and ctx.name = 'Household' and t.bucket_id is null)
      or t.tax_treatment = 'review'
      or t.classification_reviewed_at is null
    ));

  if remaining <> 0 then
    raise exception 'Direct suggestion application left % affected transactions incomplete', remaining;
  end if;
end $$;
