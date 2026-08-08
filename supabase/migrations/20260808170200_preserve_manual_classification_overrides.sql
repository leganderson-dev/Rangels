create or replace function public.apply_category_classification()
returns trigger language plpgsql security invoker as $$
declare defaults public.category_classifications%rowtype;
begin
  select * into defaults from public.category_classifications
  where legacy_category_id = new.category_id;
  if tg_op = 'INSERT' then
    new.legacy_category_id := new.category_id;
    if found then
      new.canonical_category_id := coalesce(new.canonical_category_id, defaults.canonical_category_id);
      new.context_id := coalesce(new.context_id, defaults.context_id);
      new.bucket_id := coalesce(new.bucket_id, defaults.bucket_id);
      if new.tax_treatment = 'none' then new.tax_treatment := defaults.tax_treatment; end if;
    end if;
  elsif new.category_id is distinct from old.category_id then
    new.legacy_category_id := new.category_id;
    if found then
      if new.canonical_category_id is not distinct from old.canonical_category_id then
        new.canonical_category_id := defaults.canonical_category_id;
      end if;
      if new.context_id is not distinct from old.context_id then new.context_id := defaults.context_id; end if;
      if new.bucket_id is not distinct from old.bucket_id then new.bucket_id := defaults.bucket_id; end if;
      if new.tax_treatment is not distinct from old.tax_treatment then new.tax_treatment := defaults.tax_treatment; end if;
    end if;
  end if;
  return new;
end;
$$;
