-- Run this once in the Supabase SQL editor for your project
-- (Project -> SQL Editor -> New query -> paste -> Run).

create extension if not exists pgcrypto;

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- The notification send only ever queries `where subscribed = true` (see
-- scripts/send-paper-notification.js), so a partial index keeps that lookup
-- fast without paying to index the (much less common) unsubscribed rows.
create index if not exists subscribers_subscribed_idx on subscribers (subscribed) where subscribed = true;

alter table subscribers enable row level security;

-- The public (anon) key may insert new subscribers...
create policy "public can subscribe" on subscribers
  for insert
  with check (true);

-- ...but there is no select/update/delete policy for anon, so the
-- subscriber list can never be read or modified directly through the
-- public key. The only other public-facing operation is the narrow
-- unsubscribe() function below.

create or replace function unsubscribe(token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update subscribers set subscribed = false where unsubscribe_token = token;
$$;

grant execute on function unsubscribe(uuid) to anon;
