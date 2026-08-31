-- 064_web_push.sql — real web push (audit fix #6).
--
-- push_subs stores each device's push subscription (endpoint + client keys).
-- Own rows only — the worker (service key) reads them all when the cron
-- dispatches. notifications.pushed marks rows already sent to devices so the
-- 5-minute sweep never double-sends.

create table if not exists push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on push_subs (user_id);

alter table push_subs enable row level security;
drop policy if exists rw_push_own on push_subs;
create policy rw_push_own on push_subs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notifications add column if not exists pushed boolean not null default false;
-- rows that predate push never need a device ping
update notifications set pushed = true where pushed = false;
