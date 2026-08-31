-- 047_announce_directory.sql — Announcements broadcast + Directory.
--
-- Announcements ride the notification system every warrior already has: one
-- broadcast fans out into per-user `notifications` rows, so the bell, the red
-- dot and tap-to-open-link all work with zero new client plumbing. The
-- `announcements` table is the admin-side history of what was sent, by whom,
-- to how many.
--
-- Directory is the leadership / hotline / PIC list agents look up mid-deal.
-- WhatsApp-first per Kamal's standing rule — the UI offers wa.me and tel:,
-- never SMS.
--
-- country columns here are plain text with a check (not country_t) because both
-- tables need an 'ALL' value the enum does not have; comparisons against
-- profiles.country still cast ::text (the 040/041/045 lesson).

-- ---------- announcements ----------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'ALL' check (country in ('MY','ID','ALL')),
  title text not null,
  body text not null,
  link text,
  recipients int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table announcements enable row level security;

drop policy if exists r_announcements on announcements;
create policy r_announcements on announcements for select using (is_admin());
-- writes go through fn_announce only — it is what does the fanout

create or replace function fn_announce(
  p_title text, p_body text, p_country text default 'ALL', p_link text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_n int;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if p_country not in ('MY','ID','ALL') then raise exception 'country must be MY, ID or ALL'; end if;
  -- a country admin broadcasts to their own country; master admin anywhere
  if not (my_role() = 'master_admin' or p_country = my_country()::text) then
    raise exception 'you can only broadcast to your own country';
  end if;
  if btrim(coalesce(p_title,'')) = '' or btrim(coalesce(p_body,'')) = '' then
    raise exception 'title and body are required';
  end if;

  insert into notifications (to_agent, type, title, body, link)
  select p.id, 'announcement', '📣 ' || btrim(p_title), btrim(p_body), p_link
  from profiles p
  where p.status = 'active'
    and (p_country = 'ALL' or p.country::text = p_country);
  get diagnostics v_n = row_count;

  insert into announcements (country, title, body, link, recipients, created_by)
  values (p_country, btrim(p_title), btrim(p_body), p_link, v_n, auth.uid())
  returning id into v_id;

  perform audit_log('announcement_sent', 'announcement', v_id::text, null,
                    p_country || ' x' || v_n, btrim(p_title));
  return jsonb_build_object('id', v_id, 'recipients', v_n);
end $$;

revoke all on function fn_announce(text,text,text,text) from public, anon;
grant execute on function fn_announce(text,text,text,text) to authenticated;

-- ---------- directory ----------
create table if not exists directory_entries (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'ALL' check (country in ('MY','ID','ALL')),
  category text not null default 'Leadership',   -- Leadership / Hotline / PIC / Support
  name text not null,
  role text,
  phone text,                                    -- E.164, the UI derives wa.me + tel:
  email text,
  note text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table directory_entries enable row level security;

-- every signed-in warrior sees the entries for their country (or ALL)
drop policy if exists r_directory on directory_entries;
create policy r_directory on directory_entries for select
  using (auth.uid() is not null
         and ((active and (country = 'ALL' or country = my_country()::text))
              or is_admin()));

drop policy if exists w_directory on directory_entries;
create policy w_directory on directory_entries for all
  using (is_admin() and (country = 'ALL' or country = my_country()::text or my_role() = 'master_admin'))
  with check (is_admin() and (country = 'ALL' or country = my_country()::text or my_role() = 'master_admin'));
