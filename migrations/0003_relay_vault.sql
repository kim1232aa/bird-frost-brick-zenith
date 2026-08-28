-- Studio-wide relay wiring (API keys live here, not only in the browser).
-- One row for the whole studio so admin-wired keys work on every device.
create table if not exists studio_relay_vault (
  id text primary key,
  relays_json text not null default '[]',
  hidden_json text not null default '[]',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
