-- Server-authoritative canvas and personal asset metadata.
create table if not exists studio_canvases (
  id text primary key,
  owner text not null default 'studio',
  title text not null default '',
  data_json text not null,
  updated_at timestamptz not null default now()
);

create index if not exists studio_canvases_owner_idx on studio_canvases (owner, updated_at desc);

create table if not exists studio_assets (
  id text primary key,
  owner text not null default 'studio',
  kind text not null,
  title text not null default '',
  cover_url text not null default '',
  tags_json text not null default '[]',
  source text not null default '',
  note text not null default '',
  data_json text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_assets_owner_idx on studio_assets (owner, updated_at desc);
