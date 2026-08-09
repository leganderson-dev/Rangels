create schema if not exists backup_20260809_final_classification;

create table backup_20260809_final_classification.transfers as
select
  t.id,
  t.transfer_reason,
  t.context_id,
  t.canonical_category_id,
  t.bucket_id,
  t.tax_treatment,
  t.classification_reviewed_at,
  t.updated_at
from public.transactions t
where t.status = 'C' and t.is_transfer;

alter table backup_20260809_final_classification.transfers add primary key (id);

with classified as (
  select
    t.id,
    case
      when lower(t.description) like '%te amo%'
        or lower(t.description) like '%julia%'
        then 'joint_contribution'
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%cartaodecredito%'
        or regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%creditcard%'
        or lower(t.description) like '%cartão de crédito%'
        or lower(t.description) like '%cartao de credito%'
        then 'debt_reduction'
      when regexp_replace(lower(coalesce(source.name, '')), '[^a-z0-9]+', '', 'g') like '%ingcurrumundi%'
        and regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingfireextinguisher%'
        then 'savings'
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingfireextinguisher%'
        or lower(t.description) like '%fire extinguisher%'
        then 'savings'
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingcurrumundi%'
        then 'property_funding'
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like 'nab%'
        then 'property_funding'
      when lower(t.description) like '%toogoom%'
        then 'property_funding'
      when lower(t.description) like '%currumundi%'
        or lower(t.description) like '%orange ed%'
        then 'property_funding'
      when t.transfer_reason is not null and t.transfer_reason <> 'account_movement'
        then t.transfer_reason
      else 'account_movement'
    end as transfer_reason,
    case
      when lower(t.description) like '%te amo%'
        or lower(t.description) like '%julia%'
        then null
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%cartaodecredito%'
        or regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%creditcard%'
        or lower(t.description) like '%cartão de crédito%'
        or lower(t.description) like '%cartao de credito%'
        then null
      when regexp_replace(lower(coalesce(source.name, '')), '[^a-z0-9]+', '', 'g') like '%ingcurrumundi%'
        and regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingfireextinguisher%'
        then null
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingfireextinguisher%'
        or lower(t.description) like '%fire extinguisher%'
        then null
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like '%ingcurrumundi%'
        then currumundi.id
      when regexp_replace(lower(coalesce(destination.name, '')), '[^a-z0-9]+', '', 'g') like 'nab%'
        then everton.id
      when lower(t.description) like '%toogoom%'
        then toogoom.id
      when lower(t.description) like '%currumundi%'
        or lower(t.description) like '%orange ed%'
        then currumundi.id
      when t.transfer_reason in ('property_funding', 'business_funding')
        then coalesce(t.context_id, currumundi.id)
      else null
    end as context_id
  from public.transactions t
  join public.accounts source on source.id = t.account_id
  left join public.accounts destination on destination.id = t.target_account_id
  left join public.contexts currumundi on currumundi.owner_id = t.owner_id and currumundi.name = 'Property — Currumundi'
  left join public.contexts everton on everton.owner_id = t.owner_id and everton.name = 'Property — Everton Park'
  left join public.contexts toogoom on toogoom.owner_id = t.owner_id and toogoom.name = 'Property — Toogoom'
  where t.status = 'C' and t.is_transfer
)
update public.transactions t
set transfer_reason = classified.transfer_reason,
    context_id = classified.context_id,
    canonical_category_id = null,
    bucket_id = null,
    tax_treatment = 'none',
    classification_reviewed_at = now(),
    updated_at = now()
from classified
where t.id = classified.id;

-- Final ledger-wide guardrail. Every completed row must now satisfy the Rangels
-- transaction classification rules; transfers remain neither income nor expense.
do $$
declare
  incomplete_non_transfers integer;
  incomplete_transfers integer;
begin
  select count(*) into incomplete_non_transfers
  from public.transactions t
  left join public.contexts ctx on ctx.id = t.context_id
  left join public.canonical_categories purpose on purpose.id = t.canonical_category_id
  where t.status = 'C'
    and not t.is_transfer
    and (
      t.canonical_category_id is null
      or t.context_id is null
      or ctx.name = 'Review required'
      or (purpose.type = 'expense' and ctx.name = 'Household' and t.bucket_id is null)
      or t.tax_treatment = 'review'
      or t.classification_reviewed_at is null
    );

  select count(*) into incomplete_transfers
  from public.transactions t
  where t.status = 'C'
    and t.is_transfer
    and (
      t.transfer_reason is null
      or (t.transfer_reason in ('property_funding', 'business_funding') and t.context_id is null)
      or (t.transfer_reason not in ('property_funding', 'business_funding') and t.context_id is not null)
      or t.canonical_category_id is not null
      or t.bucket_id is not null
      or t.tax_treatment <> 'none'
      or t.classification_reviewed_at is null
    );

  raise notice 'Final classification: % incomplete non-transfers, % incomplete transfers.', incomplete_non_transfers, incomplete_transfers;

  if incomplete_non_transfers <> 0 or incomplete_transfers <> 0 then
    raise exception 'Final classification failed: % non-transfers and % transfers remain incomplete', incomplete_non_transfers, incomplete_transfers;
  end if;
end $$;
