alter table public.merchants
  drop column if exists default_tax_treatment,
  drop column if exists default_bucket_id,
  drop column if exists default_context_id,
  drop column if exists default_canonical_category_id;
