update public.transactions t
set comment = case
  when t.comment = 'Legacy classification: ' || coalesce(c.path, 'None') then ''
  else replace(t.comment, E'\nLegacy classification: ' || coalesce(c.path, 'None'), '')
end,
updated_at = now()
from (select id, path from public.categories) c
where c.id = t.category_id
  and t.comment like '%Legacy classification:%';

update public.transactions t
set comment = case
  when t.comment = 'Legacy classification: None' then ''
  else replace(t.comment, E'\nLegacy classification: None', '')
end,
updated_at = now()
where t.category_id is null
  and t.comment like '%Legacy classification:%';
