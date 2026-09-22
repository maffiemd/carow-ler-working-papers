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

-- Editorial dashboard: tracks submissions from intake through publication.
-- Only the two invited editors ever have Supabase Auth accounts (sign-up is
-- disabled), so a blanket "authenticated" check is sufficient - there's no
-- need for per-row ownership checks. The anon (public) key gets no policy
-- at all here, so the dashboard's data is invisible to the public site.
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Each entry: {name, affiliation, email}. Email is kept here (not in the
  -- published _papers front matter) purely so scripts/notify-author-accepted.js
  -- knows where to send the acceptance email.
  authors jsonb not null default '[]'::jsonb,
  abstract text,
  assigned_to text,
  received_date date not null default current_date,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'accepted', 'rejected', 'published')),
  decision_notes text,
  wp_number text,
  manuscript_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table submissions enable row level security;

create policy "editors can manage submissions" on submissions
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Manuscript PDFs. Uploaded and read only by signed-in editors; never
-- exposed to the public site (the publish pipeline reads them via a
-- short-lived signed URL generated server-side by the publish-submission
-- Edge Function, not through this bucket's own access policy).
insert into storage.buckets (id, name, public)
values ('manuscripts', 'manuscripts', false)
on conflict (id) do nothing;

create policy "editors can manage manuscript files" on storage.objects
  for all
  using (bucket_id = 'manuscripts' and auth.role() = 'authenticated')
  with check (bucket_id = 'manuscripts' and auth.role() = 'authenticated');
