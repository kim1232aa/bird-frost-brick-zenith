-- Preserve the public provider identity used to create each work.
-- This is never a credential or API key.
alter table studio_works add column if not exists provider_id text not null default '';
