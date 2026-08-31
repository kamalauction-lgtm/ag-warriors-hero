-- 044_coach_briefs.sql — AG AI Coach: facts and stored daily briefs.
--
-- Design decisions locked with Kamal (2026-08-05):
--   * A brief is visible to the AGENT and their assigned COACH, nobody else —
--     coach_assignments (012) is the source of that relationship.
--   * Scores are computed in code from these facts, never by the AI, so an agent
--     who asks "why 62?" gets a real answer.
--   * The coach only ever scores what the system can see. Facts the system does
--     not track (WhatsApp, email, social) are absent, not zero.

-- ---------- stored briefs ----------
create table if not exists coach_briefs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id) on delete cascade,
  on_date date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  language text not null default 'en',
  scores jsonb not null,                        -- computed in the worker, explainable
  facts jsonb not null,                         -- the deterministic inputs, kept for "why?"
  narrative jsonb not null,                     -- win / gaps / top5 — AI or fallback prose
  generated_by text not null check (generated_by in ('ai','fallback')),
  created_at timestamptz default now(),
  unique (agent_id, on_date)
);

alter table coach_briefs enable row level security;

-- the agent reads their own; the assigned coach reads their participants'
drop policy if exists r_coach_briefs on coach_briefs;
create policy r_coach_briefs on coach_briefs for select
  using (agent_id = auth.uid()
         or exists (select 1 from coach_assignments ca
                     where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active));
-- writes come only from the worker (service role) — no client write policy on purpose

-- ---------- the deterministic fact gatherer ----------
-- SECURITY DEFINER because it crosses tables the agent cannot read directly
-- (m4u aggregates); it therefore re-checks authorisation itself: you may pull
-- facts for yourself, or for your assigned participant, or as admin.
create or replace function coach_facts(p_agent uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_out jsonb;
begin
  if not (p_agent = auth.uid()
          or is_admin()
          or exists (select 1 from coach_assignments ca
                      where ca.coach_id = auth.uid() and ca.participant_id = p_agent and ca.active)
          -- the worker calls with the service role, where auth.uid() is null
          or auth.uid() is null) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'agent', (select jsonb_build_object('id', p.id, 'name', p.name, 'country', p.country::text)
                from profiles p where p.id = p_agent),

    'calls_today', (select count(*) from m4u_attempts a
                     where a.agent_id = p_agent and a.called_at >= v_today::timestamptz),
    'calls_30d',   (select count(*) from m4u_attempts a
                     where a.agent_id = p_agent and a.called_at > now() - interval '30 days'),
    'wins_30d',    (select count(*) from m4u_attempts a
                     join m4u_leads l on l.id = a.lead_id
                     left join m4u_dispositions d
                            on d.key = a.disposition and d.country = l.country and d.active
                     where a.agent_id = p_agent and a.called_at > now() - interval '30 days'
                       and coalesce(d.is_win, false)),

    -- callbacks this agent reserved and let lapse — the hottest neglected leads
    'expired_callbacks', (select coalesce(jsonb_agg(jsonb_build_object(
                            'name', l.name, 'phone', l.phone_norm,
                            'days', greatest(1, (now()::date - l.reserved_until::date)))
                            order by l.reserved_until), '[]'::jsonb)
                          from (select * from m4u_leads
                                 where reserved_for = p_agent and reserved_until < now()
                                   and status not in ('dead','locked')
                                 order by reserved_until limit 5) l),

    -- leads this agent holds that have sat untouched for 10+ days
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

    'bop_booked_30d', (select count(*) from bop_roster r
                        where r.caller_id = p_agent),

    -- fuel for the marketing/motivation side of the brief: the agent's own
    -- granted projects (so "study a project" names a real one) and one live
    -- motivational quote from the admin-managed pool
    'projects', (select coalesce(jsonb_agg(pr.name), '[]'::jsonb)
                 from (select p2.name from m4u_grants g
                        join m4u_properties p2 on p2.id = g.property_id
                        where g.agent_id = p_agent and g.approved and g.active
                        limit 5) pr),
    'quote', (select jsonb_build_object('body', q.body, 'author', q.author)
              from quotes q
              join profiles pr on pr.id = p_agent
              where q.active and q.country = pr.country::text
              order by random() limit 1),

    -- talent profile, only at the consent the person granted (private stays private
    -- even here — the coach reads this brief too)
    'talent', (select jsonb_build_object(
                  'pathway', (select s.key from talent_scores s
                               where s.attempt_id = a.id and s.kind = 'role' and s.rank = 1),
                  'top_motivation', (select s.key from talent_scores s
                               where s.attempt_id = a.id and s.kind = 'motivation' and s.rank = 1),
                  'top_demotivator', (select s.key from talent_scores s
                               where s.attempt_id = a.id and s.kind = 'demotivator' and s.rank = 1))
               from talent_attempts a
               join talent_participants tp on tp.attempt_id = a.id
               join talent_consents tc on tc.attempt_id = a.id
               join profiles pr on pr.id = p_agent
               where lower(btrim(tp.email)) = lower(btrim(coalesce(pr.email, '')))
                 and a.status in ('scored','reported')
                 and tc.sharing in ('summary','full')
               order by a.submitted_at desc limit 1)
  ) into v_out;

  return v_out;
end $$;

revoke all on function coach_facts(uuid) from public, anon;
grant execute on function coach_facts(uuid) to authenticated, service_role;
