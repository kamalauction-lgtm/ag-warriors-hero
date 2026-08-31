-- ============================================================
-- 085_notification_templates.sql — controlled, versioned, country-first
-- notification content. ADDITIVE.
--
-- WHY. Every notification string in the 30 Days module is hardcoded English
-- prose inside PL/pgSQL. That is how an unapproved apology ("Maaf atas
-- keterlambatan peninjauan") reached a real warrior on 2026-08-23. Business-facing
-- wording must be managed content with an approval state, not code.
--
-- MODEL
--   ch_notification_templates              logical template + allowed variables
--   ch_notification_template_versions      versioned, published one at a time
--   ch_notification_template_translations  (country, locale) — COUNTRY FIRST
--   ch_notification_sends                  immutable snapshot of what was sent
--
-- COUNTRY FIRST, LANGUAGE SECOND. MY+en and ID+en are SEPARATE rows. Fallback
-- stays inside the country: MY en -> ms-MY, ID en -> id-ID. Never MY <-> ID.
--
-- Templates are DATA, not code: {{variable}} substitution only. Nothing is
-- evaluated. If no approved translation exists the send FAILS VISIBLY — Hero
-- never invents wording.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SCHEMA
-- ------------------------------------------------------------
create table if not exists ch_notification_templates (
  code text primary key,
  purpose text not null,
  audience text not null default 'participant'
    check (audience in ('participant','coach','admin','system')),
  country_scope text not null default 'ALL' check (country_scope in ('ALL','MY','ID')),
  notify_type text not null default 'challenge',      -- notifications.type
  variables text[] not null default '{}',             -- the ONLY allowed {{vars}}
  status text not null default 'active' check (status in ('draft','active','archived')),
  created_by uuid references profiles(id), updated_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists ch_notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_code text not null references ch_notification_templates(code) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references profiles(id), created_at timestamptz default now(),
  approved_by uuid references profiles(id), approved_at timestamptz,
  published_at timestamptz,
  unique (template_code, version)
);
-- at most one published version per template
create unique index if not exists uq_ntv_published
  on ch_notification_template_versions (template_code) where status = 'published';

create table if not exists ch_notification_template_translations (
  version_id uuid not null references ch_notification_template_versions(id) on delete cascade,
  country country_t not null,                          -- MY | ID — country first
  locale text not null check (locale in ('ms-MY','id-ID','en')),
  title text not null,
  body text not null,
  updated_by uuid references profiles(id), updated_at timestamptz default now(),
  primary key (version_id, country, locale)
);

-- immutable record of what was actually sent, so a later template edit can
-- never silently reinterpret a message a person already received
create table if not exists ch_notification_sends (
  id bigint generated always as identity primary key,
  notification_id bigint references notifications(id) on delete set null,
  template_code text, template_version int, version_id uuid,
  country country_t, locale text,
  recipient uuid references profiles(id),
  rendered_title text not null, rendered_body text not null,
  vars jsonb, link text,
  status text not null default 'created',
  sent_at timestamptz not null default now()
);
create index if not exists idx_nsends_recipient on ch_notification_sends (recipient, sent_at desc);
create index if not exists idx_nsends_template on ch_notification_sends (template_code, sent_at desc);

alter table ch_notification_templates enable row level security;
alter table ch_notification_template_versions enable row level security;
alter table ch_notification_template_translations enable row level security;
alter table ch_notification_sends enable row level security;

create policy r_ntpl  on ch_notification_templates for select using (auth.uid() is not null);
create policy r_ntv   on ch_notification_template_versions for select using (auth.uid() is not null);
create policy r_ntt   on ch_notification_template_translations for select using (auth.uid() is not null);
create policy r_nsend on ch_notification_sends for select using
  (recipient = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy w_ntpl  on ch_notification_templates for all using (has_role('super_admin'));
create policy w_ntv   on ch_notification_template_versions for all using (has_role('super_admin'));
create policy w_ntt   on ch_notification_template_translations for all using (has_role('super_admin'));
-- ch_notification_sends: no client write policy — written only by fn_notify_t

-- ------------------------------------------------------------
-- 2. RENDERING — substitution only, nothing evaluated
-- ------------------------------------------------------------
create or replace function fn_render_template(p_text text, p_vars jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare k text; out text := p_text;
begin
  if p_vars is null then return out; end if;
  for k in select jsonb_object_keys(p_vars) loop
    out := replace(out, '{{' || k || '}}', coalesce(p_vars->>k, ''));
  end loop;
  return out;
end $$;

-- which {{variables}} does a text actually use?
create or replace function fn_template_vars(p_text text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct m[1]), '{}')
  from regexp_matches(coalesce(p_text,''), '\{\{([a-z0-9_]+)\}\}', 'g') m;
$$;

-- ------------------------------------------------------------
-- 3. RESOLUTION — country first, language second, never across countries
-- ------------------------------------------------------------
create or replace function fn_resolve_notification(
  p_code text, p_country country_t, p_locale text
) returns table (version_id uuid, version int, country country_t, locale text, title text, body text)
language sql stable security definer set search_path = public as $$
  with pub as (
    select v.id, v.version from ch_notification_template_versions v
    join ch_notification_templates t on t.code = v.template_code
    where v.template_code = p_code and v.status = 'published' and t.status = 'active'
      and (t.country_scope = 'ALL' or t.country_scope = p_country::text)
  )
  select p.id, p.version, tr.country, tr.locale, tr.title, tr.body
  from pub p join ch_notification_template_translations tr on tr.version_id = p.id
  where tr.country = p_country                                   -- NEVER cross-country
    and tr.locale in (p_locale, case p_country when 'MY' then 'ms-MY' else 'id-ID' end)
  order by (tr.locale = p_locale) desc                           -- exact locale wins
  limit 1;
$$;
grant execute on function fn_resolve_notification(text,country_t,text) to authenticated;

-- ------------------------------------------------------------
-- 4. SENDING — resolve, render, record. Fails VISIBLY, never invents wording.
-- ------------------------------------------------------------
create or replace function fn_notify_t(
  p_to uuid, p_code text, p_vars jsonb, p_link text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_country country_t; v_lang text; v_locale text; r record;
  v_title text; v_body text; v_type text; v_nid bigint;
begin
  select country, coalesce(language, case when country = 'ID' then 'id' else 'en' end)
    into v_country, v_lang from profiles where id = p_to;
  if v_country is null then return false; end if;

  -- app locale -> content locale, constrained to the country's own pair
  v_locale := case
    when v_country = 'MY' then (case when v_lang = 'bm' then 'ms-MY' else 'en' end)
    else                      (case when v_lang = 'en' then 'en'    else 'id-ID' end)
  end;

  select * into r from fn_resolve_notification(p_code, v_country, v_locale);

  if r.version_id is null then
    -- fail visibly: audit it and tell leadership. Do NOT improvise a message.
    perform audit_log('notification_template_missing','notification_template', p_code,
      v_country::text || '/' || v_locale, 'not_sent',
      'No published translation. Nothing was sent — wording is never generated.');
    insert into notifications (to_agent, type, title, body, link)
    select id, 'system', 'Notification not sent — template missing',
           'Template "' || p_code || '" has no published ' || v_country::text || '/' || v_locale ||
           ' translation. A warrior did not receive a message.', '#/admin'
    from profiles where is_commander;
    return false;
  end if;

  select notify_type into v_type from ch_notification_templates where code = p_code;
  v_title := fn_render_template(r.title, p_vars);
  v_body  := fn_render_template(r.body,  p_vars);

  insert into notifications (to_agent, type, title, body, link)
  values (p_to, coalesce(v_type,'challenge'), v_title, v_body, p_link)
  returning id into v_nid;

  insert into ch_notification_sends (notification_id, template_code, template_version, version_id,
                                     country, locale, recipient, rendered_title, rendered_body, vars, link)
  values (v_nid, p_code, r.version, r.version_id, v_country, r.locale, p_to, v_title, v_body, p_vars, p_link);
  return true;
end $$;

-- same, for every reviewer of a participant (coach fallback to Commanders)
create or replace function fn_notify_reviewers_t(
  p_participant uuid, p_code text, p_vars jsonb, p_link text
) returns void language plpgsql security definer set search_path = public as $$
declare c uuid; n int := 0;
begin
  for c in select coach_id from coach_assignments where participant_id = p_participant and active loop
    if fn_notify_t(c, p_code, p_vars, p_link) then n := n + 1; end if;
  end loop;
  if n = 0 then
    for c in select id from profiles where is_commander loop
      perform fn_notify_t(c, p_code, p_vars, p_link);
    end loop;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. AUTHORING — validate variables before publishing
-- ------------------------------------------------------------
create or replace function fn_admin_publish_template(p_version uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_allowed text[]; r record; v_bad text[]; v_missing text[];
  v_country country_t; v_needed text[];
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  select template_code into v_code from ch_notification_template_versions where id = p_version;
  if v_code is null then raise exception 'version not found'; end if;
  select variables, country_scope into v_allowed, v_country
    from ch_notification_templates where code = v_code;

  -- every country in scope must carry BOTH of its own locales
  for r in select unnest(case (select country_scope from ch_notification_templates where code = v_code)
                         when 'MY' then array['MY'] when 'ID' then array['ID']
                         else array['MY','ID'] end) as cc loop
    v_needed := case r.cc when 'MY' then array['ms-MY','en'] else array['id-ID','en'] end;
    select array_agg(x) into v_missing from unnest(v_needed) x
     where not exists (select 1 from ch_notification_template_translations t
                       where t.version_id = p_version and t.country::text = r.cc and t.locale = x);
    if v_missing is not null then
      raise exception '% is missing % translation(s) for %', v_code, v_missing, r.cc;
    end if;
  end loop;

  -- no undeclared variables anywhere
  for r in select country, locale, title, body from ch_notification_template_translations
           where version_id = p_version loop
    select array_agg(v) into v_bad
      from unnest(fn_template_vars(r.title) || fn_template_vars(r.body)) v
     where not (v = any(v_allowed));
    if v_bad is not null then
      raise exception 'undeclared variable(s) % in %/% — declare them on the template first',
        v_bad, r.country, r.locale;
    end if;
  end loop;

  update ch_notification_template_versions set status = 'archived'
   where template_code = v_code and status = 'published' and id <> p_version;
  update ch_notification_template_versions
     set status = 'published', published_at = now(), approved_by = auth.uid(), approved_at = now()
   where id = p_version;
  perform audit_log('notification_template_published','notification_template_version',
                    p_version::text, 'draft', 'published', coalesce(p_note, v_code));
end $$;
grant execute on function fn_admin_publish_template(uuid,text) to authenticated;

-- what content is missing / what got sent — the Admin surface
create or replace function fn_notification_coverage()
returns table (code text, purpose text, audience text, country_scope text,
               published_version int, my_ms boolean, my_en boolean, id_id boolean, id_en boolean,
               sent_30d bigint)
language sql stable security definer set search_path = public as $$
  select t.code, t.purpose, t.audience, t.country_scope, v.version,
    exists (select 1 from ch_notification_template_translations x where x.version_id = v.id and x.country='MY' and x.locale='ms-MY'),
    exists (select 1 from ch_notification_template_translations x where x.version_id = v.id and x.country='MY' and x.locale='en'),
    exists (select 1 from ch_notification_template_translations x where x.version_id = v.id and x.country='ID' and x.locale='id-ID'),
    exists (select 1 from ch_notification_template_translations x where x.version_id = v.id and x.country='ID' and x.locale='en'),
    (select count(*) from ch_notification_sends s where s.template_code = t.code and s.sent_at > now() - interval '30 days')
  from ch_notification_templates t
  left join ch_notification_template_versions v on v.template_code = t.code and v.status = 'published'
  where auth.uid() is not null and (has_role('super_admin') or has_role('master_mentor'))
  order by t.code;
$$;
grant execute on function fn_notification_coverage() to authenticated;

-- ------------------------------------------------------------
-- 6. DUAL-ROLE SELF-REVIEW EXCLUSION (server side, in addition to the
--    existing raise in fn_review_submission_v2 / fn_review_readiness).
--    A coach must never be handed their OWN participant work as review work.
-- ------------------------------------------------------------
create or replace function fn_coach_pod()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  select coalesce(jsonb_agg(x order by x->>'urgency' desc, x->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'enrolment_id', e.id, 'participant_id', e.participant_id,
      'name', p.name, 'country', p.country, 'stage', e.status,
      'cohort', c.name, 'cohort_day', cohort_day(e.cohort_id),
      'accessible_day', participant_accessible_day(e.id),
      'days_approved', (select count(distinct day_no) from task_submissions
                        where enrolment_id = e.id and status = 'approved'),
      'pending_reviews', (select count(*) from task_submissions
                          where enrolment_id = e.id and status in ('submitted','under_review')),
      'oldest_pending_hours', (select round(extract(epoch from (now() - min(submitted_at)))/3600)
                               from task_submissions where enrolment_id = e.id
                               and status in ('submitted','under_review')),
      'readiness_pending', (select count(*) from readiness_submissions
                            where enrolment_id = e.id and status in ('submitted','under_review')),
      'days_inactive', (select coalesce(extract(day from now() - max(happened_at))::int, 999)
                        from ch_lead_activities where participant_id = e.participant_id),
      'overdue_followups', (select count(*) from ch_leads where participant_id = e.participant_id
                            and next_action_at is not null and next_action_at < current_date
                            and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')),
      'active_leads', (select count(*) from ch_leads where participant_id = e.participant_id
                       and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')),
      'bottleneck', fn_bottleneck(e.participant_id)->>'code',
      'urgency', case
        when (select count(*) from readiness_submissions where enrolment_id = e.id
              and status in ('submitted','under_review')) > 0 then '3'
        when (select count(*) from task_submissions where enrolment_id = e.id
              and status in ('submitted','under_review')) > 0 then '3'
        when (select coalesce(extract(day from now() - max(happened_at))::int, 999)
              from ch_lead_activities where participant_id = e.participant_id) >= 2 then '2'
        when (select count(*) from ch_leads where participant_id = e.participant_id
              and next_action_at is not null and next_action_at < current_date
              and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')) > 0 then '1'
        else '0' end
    ) as x
    from enrolments e
    join profiles p on p.id = e.participant_id
    join cohorts  c on c.id = e.cohort_id
    where e.status in ('invited','onboarding','ready','active','paused')
      and e.participant_id <> auth.uid()          -- never your own work as review work
      and (has_role('super_admin') or has_role('master_mentor')
           or is_my_coach_participant(e.participant_id))
  ) t;
  return v_rows;
end $$;

-- the queue reads task_submissions / readiness_submissions directly under RLS.
-- Tighten the read policies so a dual-role user's own rows are visible to them
-- as a PARTICIPANT, but never through the coach predicate.
drop policy if exists r_subs on task_submissions;
create policy r_subs on task_submissions for select using (
  exists (select 1 from enrolments e where e.id = enrolment_id and (
    e.participant_id = auth.uid()                                        -- my own work
    or (e.participant_id <> auth.uid() and (                             -- someone else's
         is_my_coach_participant(e.participant_id)
         or has_role('super_admin') or has_role('master_mentor'))))));

drop policy if exists r_ready on readiness_submissions;
create policy r_ready on readiness_submissions for select using (
  exists (select 1 from enrolments e where e.id = enrolment_id and (
    e.participant_id = auth.uid()
    or (e.participant_id <> auth.uid() and (
         is_my_coach_participant(e.participant_id)
         or has_role('super_admin') or has_role('master_mentor'))))));

-- and make the exclusion explicit for the client to query
create or replace function fn_review_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  return jsonb_build_object(
    'readiness', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'participant_id', e.participant_id,
               'name', p.name, 'goal', e.goal_30d, 'submitted_at', r.submitted_at) order by r.submitted_at)
      from readiness_submissions r join enrolments e on e.id = r.enrolment_id
      join profiles p on p.id = e.participant_id
      where r.status in ('submitted','under_review') and is_reviewer_of(e.participant_id)), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'participant_id', e.participant_id,
               'name', p.name, 'day_no', s.day_no, 'version', s.version,
               'response', s.response, 'submitted_at', s.submitted_at) order by s.submitted_at)
      from task_submissions s join enrolments e on e.id = s.enrolment_id
      join profiles p on p.id = e.participant_id
      where s.status in ('submitted','under_review') and is_reviewer_of(e.participant_id)), '[]'::jsonb));
end $$;
grant execute on function fn_review_queue() to authenticated;

-- ------------------------------------------------------------
-- 7. VERIFY
-- ------------------------------------------------------------
select 'template tables' as check,
  (select count(*) from ch_notification_templates) as templates,
  (select count(*) from ch_notification_template_versions) as versions,
  (select count(*) from ch_notification_template_translations) as translations;
