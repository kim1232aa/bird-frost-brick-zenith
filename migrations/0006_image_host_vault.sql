-- Keep the image-host credential in the server-side vault instead of browser request headers.
alter table studio_relay_vault add column if not exists image_host_json text not null default '';
