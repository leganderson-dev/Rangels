alter table public.merchants
  add column default_canonical_category_id uuid references public.canonical_categories(id) on delete set null,
  add column default_context_id uuid references public.contexts(id) on delete set null,
  add column default_bucket_id uuid references public.buckets(id) on delete set null,
  add column default_tax_treatment text not null default 'none'
    check (default_tax_treatment in ('none', 'deductible', 'review'));

update public.merchants m
set default_canonical_category_id = cc.canonical_category_id,
    default_context_id = cc.context_id,
    default_bucket_id = cc.bucket_id,
    default_tax_treatment = cc.tax_treatment
from public.category_classifications cc
where cc.legacy_category_id = m.default_category_id;
