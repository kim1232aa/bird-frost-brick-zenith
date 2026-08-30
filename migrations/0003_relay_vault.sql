-- Per-user relay wiring (API keys live here, not only in the browser).
-- The id column stores the server-verified user id as the row key. The former
-- global row id='studio' is intentionally not read as a fallback.
create table if not exists studio_relay_vault (
  id text primary key,
  relays_json text not null default '[]',
  hidden_json text not null default '[]',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
