-- 046_grooming.sql — the grooming engine: both assessments, weekly focus.
--
-- Locked with Kamal (2026-08-05):
--   * The coach reads BOTH banks, each for its purpose: /myself (who they are:
--     dimensions, motivations, demotivators) shapes HOW to coach; /testme (task
--     fit: ranked pathways) shapes WHAT to point them at.
--   * One development focus per week. The AI proposes the weakest dimension;
--     a human Coach may override, and the AI never overwrites a coach's choice.
--   * Low-confidence sittings (straight-lining, 58-second rushes) are returned
--     flagged but MUST NOT drive grooming.
--   * Consent still rules: private profiles stay out entirely, because the
--     human Coach reads the same brief.

-- ---------- weekly development focus ----------
create table if not exists agent_focus (
  agent_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,                     -- Monday, Asia/Kuala_Lumpur
  dimension_key text not null,                  -- e.g. 'success.consistency'
  set_by text not null default 'ai' check (set_by in ('ai','coach')),
  coach_id uuid references profiles(id),
  created_at timestamptz default now(),
  primary key (agent_id, week_start)
);

alter table agent_focus enable row level security;

drop policy if exists r_agent_focus on agent_focus;
create policy r_agent_focus on agent_focus for select
  using (agent_id = auth.uid()
         or exists (select 1 from coach_assignments ca
                     where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active));

-- a Coach sets or replaces the focus for their own participants only
drop policy if exists w_agent_focus_coach on agent_focus;
create policy w_agent_focus_coach on agent_focus for all
  using (exists (select 1 from coach_assignments ca
                  where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active))
  with check (exists (select 1 from coach_assignments ca
                  where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active)
              and set_by = 'coach' and coach_id = auth.uid());

-- ---------- coach_facts v3: the full grooming picture ----------
create or replace function coach_facts(p_agent uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_week date := v_today - ((extract(isodow from v_today))::int - 1);
  v_out jsonb;
begin
  if not (p_agent = auth.uid()
          or is_admin()
          or exists (select 1 from coach_assignments ca
                      where ca.coach_id = auth.uid() and ca.participant_id = p_agent and ca.active)
          or auth.uid() is null) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'agent', (select jsonb_build_object('id', p.id, 'name', p.name, 'country', p.country::text)
                from profiles p where p.id = p_agent),
    'week_start', v_week,

    'calls_today', (select count(*) from m4u_attempts a
                     where a.agent_id = p_agent and a.called_at >= v_today::timestamptz),
    'calls_30d',   (select count(*) from m4u_attempts a
                     where a.agent_id = p_agent and a.called_at > now() - interval '30 days'),
    'wins_30d',    (select count(*) from m4u_attempts a
                     join m4u_leads l on l.id = a.lead_id
                     left join m4u_dispositions d
                            on d.key = a.disposition and d.country::text = l.country::text and d.active
                     where a.agent_id = p_agent and a.called_at > now() - interval '30 days'
                       and coalesce(d.is_win, false)),

    'expired_callbacks', (select coalesce(jsonb_agg(jsonb_build_object(
                            'name', l.name, 'phone', l.phone_norm,
                            'days', greatest(1, (now()::date - l.reserved_until::date)))
                            order by l.reserved_until), '[]'::jsonb)
                          from (select * from m4u_leads
                                 where reserved_for = p_agent and reserved_until < now()
                                   and status not in ('dead','locked')
                                 order by reserved_until limit 5) l),

    'neglected', (select coalesce(jsonb_agg(jsonb_build_object(
                     'name', l.name, 'phone', l.phone_norm,
                     'days', (now()::date - l.updated_at::date))
                     order by l.updated_at), '[]'::jsonb)
                  from (select * from m4u_leads
                         where (owner_agent_id = p_agent or assigned_to = p_agent)
                           and status not in ('dead')
                           and updated_at < now() - interval '10 days'
                         order by updated_at limit 5) l),

    'timebox', (select jsonb_build_object(
                   'planned', count(*),
                   'done', count(*) filter (where status = 'done'),
                   'notdone', count(*) filter (where status = 'notdone'))
                 from time_tasks where user_id = p_agent and on_date = v_today),

    'bop_booked_30d', (select count(*) from bop_roster r where r.caller_id = p_agent),

    'projects', (select coalesce(jsonb_agg(pr.name), '[]'::jsonb)
                 from (select p2.name from m4u_grants g
                        join m4u_properties p2 on p2.id = g.property_id
                        where g.agent_id = p_agent and g.approved and g.active
                        limit 5) pr),
    'quote', (select jsonb_build_object('body', q.body, 'author', q.author)
              from quotes q join profiles pr on pr.id = p_agent
              where q.active and q.country::text = pr.country::text
              order by random() limit 1),

    -- ======== BOTH assessments, kept separate by purpose ========
    -- person profile (/myself, bank myself-v1): who they are
    'talent_person', (select jsonb_build_object(
        'low_confidence', coalesce((att.flags ->> 'low'), 'false')::boolean,
        'dimensions', att.dims,
        'weakest', att.weakest,
        'motivations', att.motivs,
        'demotivators', att.demots)
      from (
        select
          (select jsonb_build_object('low',
              exists (select 1 from talent_flags f where f.attempt_id = a.id
                       and f.flag in ('uniform_responding','unrealistically_fast'))::text)) as flags,
          (select jsonb_object_agg(s.key, s.normalised) from talent_scores s
            where s.attempt_id = a.id and s.kind = 'dimension' and s.normalised is not null) as dims,
          (select jsonb_agg(jsonb_build_object('key', s.key, 'score', s.normalised)
                  order by s.normalised asc)
             from (select key, normalised from talent_scores
                    where attempt_id = a.id and kind = 'dimension' and normalised is not null
                    order by normalised asc limit 3) s) as weakest,
          (select jsonb_agg(jsonb_build_object('key', s.key, 'score', s.normalised) order by s.rank)
             from talent_scores s where s.attempt_id = a.id and s.kind = 'motivation' and s.rank <= 3) as motivs,
          (select jsonb_agg(jsonb_build_object('key', s.key, 'score', s.normalised) order by s.rank)
             from talent_scores s where s.attempt_id = a.id and s.kind = 'demotivator' and s.rank <= 3) as demots
        from talent_attempts a
        join talent_versions v on v.id = a.version_id and v.code like 'myself%'
        join talent_participants tp on tp.attempt_id = a.id
        join talent_consents tc on tc.attempt_id = a.id
        join profiles pr on pr.id = p_agent
        where lower(btrim(tp.email)) = lower(btrim(coalesce(pr.email, '')))
          and a.status in ('scored','reported')
          and tc.sharing in ('summary','full')
        order by a.submitted_at desc limit 1
      ) att),

    -- task fit (/testme, bank v1): what work suits them
    'talent_task', (select jsonb_build_object(
        'low_confidence',
          exists (select 1 from talent_flags f where f.attempt_id = a.id
                   and f.flag in ('uniform_responding','unrealistically_fast')),
        'pathways', (select jsonb_agg(jsonb_build_object('key', s.key, 'score', s.normalised)
                     order by s.rank)
                     from talent_scores s
                     where s.attempt_id = a.id and s.kind = 'role' and s.rank <= 3))
      from talent_attempts a
      join talent_versions v on v.id = a.version_id and v.code not like 'myself%'
      join talent_participants tp on tp.attempt_id = a.id
      join talent_consents tc on tc.attempt_id = a.id
      join profiles pr on pr.id = p_agent
      where lower(btrim(tp.email)) = lower(btrim(coalesce(pr.email, '')))
        and a.status in ('scored','reported')
        and tc.sharing in ('summary','full')
      order by a.submitted_at desc limit 1),

    -- this week's development focus, if one is set
    'focus', (select jsonb_build_object('dimension_key', af.dimension_key,
                                        'set_by', af.set_by, 'week_start', af.week_start)
              from agent_focus af
              where af.agent_id = p_agent and af.week_start = v_week),

    -- the last 3 briefs, for the tone-escalation signal (degil detection)
    'recent_briefs', (select coalesce(jsonb_agg(jsonb_build_object(
                        'on_date', b.on_date,
                        'overall', (b.scores ->> 'overall')::int,
                        'overdue', jsonb_array_length(coalesce(b.facts -> 'expired_callbacks', '[]'::jsonb)))
                        order by b.on_date desc), '[]'::jsonb)
                      from (select * from coach_briefs
                             where agent_id = p_agent and on_date < v_today
                             order by on_date desc limit 3) b)
  ) into v_out;

  return v_out;
end $$;

revoke all on function coach_facts(uuid) from public, anon;
grant execute on function coach_facts(uuid) to authenticated, service_role;

-- (the worker writes AI proposals with the service role, which bypasses RLS —
-- no extra policy needed, and the worker refuses to touch set_by='coach' rows)
