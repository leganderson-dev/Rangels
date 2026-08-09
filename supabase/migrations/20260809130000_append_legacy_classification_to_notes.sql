update public.transactions t
set comment = case
  when nullif(btrim(coalesce(t.comment, '')), '') is null then
    'Legacy classification: ' || coalesce(c.path, 'None')
  else
    rtrim(t.comment) || E'\nLegacy classification: ' || coalesce(c.path, 'None')
end,
updated_at = now()
from (select id, path from public.categories) c
where c.id = t.category_id
  and coalesce(t.comment, '') not like '%Legacy classification:%';

update public.transactions t
set comment = case
  when nullif(btrim(coalesce(t.comment, '')), '') is null then 'Legacy classification: None'
  else rtrim(t.comment) || E'\nLegacy classification: None'
end,
updated_at = now()
where t.category_id is null
  and coalesce(t.comment, '') not like '%Legacy classification:%';

comment on column public.transactions.comment is
  'Owner note. During legacy retirement, the original category is retained as a Legacy classification audit line.';
