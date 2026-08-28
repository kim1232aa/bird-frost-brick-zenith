-- Per-account generation library. Preview auth-off shares the dev user.
create table if not exists studio_works (
  id text primary key,
  user_id text not null,
  kind text not null,
  title text not null default '',
  prompt text not null default '',
  model text not null default '',
  urls_json text not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists studio_works_user_idx on studio_works (user_id, created_at desc);
