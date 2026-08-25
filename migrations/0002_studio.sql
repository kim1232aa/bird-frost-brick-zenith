create table if not exists studio_profiles (
  user_id text primary key,
  role text not null default 'user',
  plan text not null default 'studio',
  created_at timestamptz not null default now()
);

create table if not exists studio_credits (
  user_id text not null,
  kind text not null,
  balance integer not null default 0,
  primary key (user_id, kind)
);

create table if not exists studio_ledger (
  id text primary key,
  user_id text not null,
  kind text not null,
  delta integer not null,
  reason text not null,
  model text not null default '',
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists studio_audit (
  id text primary key,
  user_id text not null,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists studio_ledger_user_idx on studio_ledger (user_id, created_at desc);
create index if not exists studio_audit_user_idx on studio_audit (user_id, created_at desc);
