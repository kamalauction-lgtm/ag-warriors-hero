-- 032_talent_admin.sql — Facilitator Dashboard (§15)
--
-- 025 left a hole it admitted to in a comment: "Consent is enforced in the read
-- RPCs, not here", but it also granted admins a plain SELECT on talent_reports.
-- Any admin screen reading the table directly would therefore see the report of
-- a participant who chose Private. This migration closes that: the table read is
-- revoked and every facilitator read goes through a function that checks consent.
--
-- Group aggregates DO cover every attempt (they are anonymous counts, which is
-- what consent 'private' does not cover) but they never touch talent_responses,
-- so written answers stay invisible to facilitators exactly as §6 requires.

-- ---------- 1. close the consent hole ----------
drop policy if exists r_talent_reports on talent_reports;
-- no replacement policy: talent_reports is now reachable only via the RPCs below.

-- ---------- 2. event list with live counts ----------
create or replace function talent_admin_events()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', e.id, 'code', e.code, 'name', e.name, 'status', e.status,
      'country_scope', e.country_scope, 'languages', e.languages,
      'version_id', e.version_id, 'version_code', ver.code,
      'max_participants', e.max_participants,
      'starts_at', e.starts_at, 'expires_at', e.expires_at,
      'created_at', e.created_at,
      'started', (select count(*) from talent_attempts a where a.event_id = e.id),
      'completed', (select count(*) from talent_attempts a
                     where a.event_id = e.id and a.status in ('submitted','scored','reported'))
    ) as x
    from talent_events e left join talent_versions ver on ver.id = e.version_id
  ) s;
  return v_out;
end $$;

-- ---------- 3. §15 aggregates for one event ----------
create or replace function talent_admin_overview(p_event bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ev talent_events; v_started int; v_done int; v_avg numeric; v_out jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select * into v_ev from talent_events where id = p_event;
  if v_ev.id is null then raise exception 'unknown event'; end if;

  select count(*),
         count(*) filter (where status in ('submitted','scored','reported')),
         round(avg(duration_seconds) filter (where duration_seconds is not null) / 60.0, 1)
    into v_started, v_done, v_avg
    from talent_attempts where event_id = p_event;

  with att as (
    select a.id, a.status, a.language
      from talent_attempts a where a.event_id = p_event
  ), done as (
    select id from att where status in ('submitted','scored','reported')
  ),
  -- one row per (attempt, score) for finished attempts only
  sc as (
    select s.* from talent_scores s join done d on d.id = s.attempt_id
  )
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_ev.id, 'code', v_ev.code, 'name', v_ev.name, 'status', v_ev.status,
      'country_scope', v_ev.country_scope, 'timezone', v_ev.timezone,
      'starts_at', v_ev.starts_at, 'expires_at', v_ev.expires_at),
    'expected',        v_ev.max_participants,
    'started',         v_started,
    'completed',       v_done,
    'incomplete',      v_started - v_done,
    'avg_minutes',     v_avg,

    'by_language',   (select coalesce(jsonb_object_agg(language, n), '{}'::jsonb)
                        from (select language, count(*) n from att group by language) t),
    'by_country',    (select coalesce(jsonb_object_agg(coalesce(p.country,'—'), n), '{}'::jsonb)
                        from (select p.country, count(*) n from talent_participants p
                               join att on att.id = p.attempt_id group by p.country) p),
    'by_experience', (select coalesce(jsonb_object_agg(coalesce(p.experience,'—'), n), '{}'::jsonb)
                        from (select p.experience, count(*) n from talent_participants p
                               join att on att.id = p.attempt_id group by p.experience) p),
    'by_sharing',    (select coalesce(jsonb_object_agg(c.sharing, n), '{}'::jsonb)
                        from (select c.sharing, count(*) n from talent_consents c
                               join att on att.id = c.attempt_id group by c.sharing) c),
    'reports',       jsonb_build_object(
                       'generated', (select count(*) from talent_reports r join done d on d.id = r.attempt_id),
                       'ai',        (select count(*) from talent_reports r join done d on d.id = r.attempt_id
                                      where r.generated_by = 'ai'),
                       'fallback',  (select count(*) from talent_reports r join done d on d.id = r.attempt_id
                                      where r.generated_by = 'fallback')),

    -- top motivation drivers / demotivators: how often each lands in a person's top 3
    'motivations',   (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'people', n, 'avg', a)
                                                order by n desc, key), '[]'::jsonb)
                        from (select key, count(*) n, round(avg(normalised),1) a from sc
                               where kind = 'motivation' and rank <= 3 group by key
                               order by count(*) desc, key limit 8) t),
    'demotivators',  (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'people', n, 'avg', a)
                                                order by n desc, key), '[]'::jsonb)
                        from (select key, count(*) n, round(avg(normalised),1) a from sc
                               where kind = 'demotivator' and rank <= 3 group by key
                               order by count(*) desc, key limit 8) t),
    -- role pathway distribution = each person's #1 pathway
    'pathways',      (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'people', n)
                                                order by n desc, key), '[]'::jsonb)
                        from (select key, count(*) n from sc
                               where kind = 'role' and rank = 1 group by key) t),
    -- dimension family averages, split the way §15 asks for them
    'entrepreneurship', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'avg', a)
                                                   order by a desc nulls last, key), '[]'::jsonb)
                        from (select key, round(avg(normalised),1) a from sc
                               where kind = 'dimension' and key like 'ent.%' group by key) t),
    'success_drive',    (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'avg', a)
                                                   order by a desc nulls last, key), '[]'::jsonb)
                        from (select key, round(avg(normalised),1) a from sc
                               where kind = 'dimension' and key like 'success.%' group by key) t),
    'working_style',    (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'avg', a)
                                                   order by a desc nulls last, key), '[]'::jsonb)
                        from (select key, round(avg(normalised),1) a from sc
                               where kind = 'dimension' and key like 'style.%' group by key) t),
    -- group development gaps = the weakest dimensions across the whole cohort
    'gaps',             (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'avg', a)
                                                   order by a asc nulls last, key), '[]'::jsonb)
                        from (select key, round(avg(normalised),1) a from sc
                               where kind = 'dimension' group by key
                               order by avg(normalised) asc nulls last limit 6) t)
  ) into v_out;

  return v_out;
end $$;

-- ---------- 4. roster, consent-aware ----------
-- private  → attendance facts only, no scores, no report
-- summary  → attendance + top pathway + band headlines
-- full     → the above, and talent_admin_report will open the whole report
create or replace function talent_admin_roster(p_event bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'attempt_id', a.id,
      'full_name',  p.full_name,
      'preferred',  p.preferred_name,
      'contact',    p.contact,
      'country',    p.country,
      'experience', p.experience,
      'leadership', p.leadership,
      'language',   a.language,
      'status',     a.status,
      'started_at', a.started_at,
      'submitted_at', a.submitted_at,
      'minutes',    round(a.duration_seconds / 60.0, 1),
      'sharing',    coalesce(c.sharing, 'private'),
      'has_report', exists (select 1 from talent_reports r where r.attempt_id = a.id),
      'flags',      (select count(*) from talent_flags f where f.attempt_id = a.id),
      -- scores only leave the database when the participant allowed it
      'top_pathway', case when coalesce(c.sharing,'private') = 'private' then null else
        (select s.key from talent_scores s
          where s.attempt_id = a.id and s.kind = 'role' and s.rank = 1) end,
      'headline',   case when coalesce(c.sharing,'private') = 'private' then null else
        (select jsonb_agg(jsonb_build_object('key', s.key, 'band', s.band, 'score', s.normalised)
                order by s.normalised desc nulls last)
           from (select key, band, normalised from talent_scores
                  where attempt_id = a.id and kind = 'dimension'
                  order by normalised desc nulls last limit 3) s) end
    ) as x
    from talent_attempts a
    left join talent_participants p on p.attempt_id = a.id
    left join talent_consents c on c.attempt_id = a.id
    where a.event_id = p_event
  ) s;
  return v_out;
end $$;

-- ---------- 5. one individual report, gated on consent ----------
create or replace function talent_admin_report(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_sharing text; v_rep talent_reports; v_name text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select coalesce(c.sharing,'private'), p.full_name into v_sharing, v_name
    from talent_attempts a
    left join talent_consents c on c.attempt_id = a.id
    left join talent_participants p on p.attempt_id = a.id
   where a.id = p_attempt;
  if v_sharing is null then raise exception 'unknown attempt'; end if;

  if v_sharing = 'private' then
    -- not an error the facilitator can work around; it is the participant's choice
    return jsonb_build_object('sharing','private','full_name',v_name,'content',null);
  end if;

  select * into v_rep from talent_reports where attempt_id = p_attempt;
  if v_rep.attempt_id is null then
    return jsonb_build_object('sharing',v_sharing,'full_name',v_name,'content',null,'pending',true);
  end if;

  -- who looked, not just that someone looked
  insert into talent_audit (attempt_id, action, actor, detail)
  values (p_attempt, 'facilitator_viewed_report', auth.uid(), v_sharing);

  if v_sharing = 'summary' then
    -- summary consent = the overview block only, never the full narrative
    return jsonb_build_object(
      'sharing','summary','full_name',v_name,'language',v_rep.language,
      'generated_by',v_rep.generated_by,
      'content', jsonb_build_object(
        'profile',      v_rep.content->'profile',
        'strengths',    v_rep.content->'strengths',
        'roles',        v_rep.content->'roles',
        'motivations',  v_rep.content->'motivations',
        'low_confidence', v_rep.content->'low_confidence'));
    -- deliberately withheld at 'summary': development, blind_spots, demotivators,
    -- coach_questions. Those are the coaching-sensitive parts and need full consent.
  end if;

  return jsonb_build_object(
    'sharing','full','full_name',v_name,'language',v_rep.language,
    'generated_by',v_rep.generated_by,'content',v_rep.content);
end $$;

revoke all on function talent_admin_events()             from anon;
revoke all on function talent_admin_overview(bigint)     from anon;
revoke all on function talent_admin_roster(bigint)       from anon;
revoke all on function talent_admin_report(uuid)         from anon;
grant execute on function talent_admin_events()          to authenticated;
grant execute on function talent_admin_overview(bigint)  to authenticated;
grant execute on function talent_admin_roster(bigint)    to authenticated;
grant execute on function talent_admin_report(uuid)      to authenticated;
