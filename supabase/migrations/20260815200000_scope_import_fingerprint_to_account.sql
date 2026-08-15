alter table public.imports
  drop constraint if exists imports_owner_id_file_fingerprint_key;

alter table public.imports
  add constraint imports_owner_account_file_fingerprint_key
  unique (owner_id, account_id, file_fingerprint);
