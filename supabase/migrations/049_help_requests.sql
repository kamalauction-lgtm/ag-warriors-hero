-- 049_help_requests.sql — "Minta Bantuan": an agent can raise their hand.
--
-- The mission of this app is to help agents become their best. Everything so
-- far pushes insight TO the agent; this is the channel back: the agent asks
-- for help, the AI packs their full in-app context (calls, leads, plan, talent
-- profile) into the request, gives the agent immediate first-aid steps, and
-- notifies the right human — Coach, Leader or admin — with a suggested support
-- plan. Humans help; the AI makes sure the help arrives informed.

create table if not exists help_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id) on delete cascade,
  topic text not null check (topic in ('closing','leads','motivation','technical','other')),
  message text not null,
  to_role text not null default 'coach' check (to_role in ('coach','leader','admin')),
  ai_plan jsonb,                                -- {for_agent:{steps[]}, for_helper:{situation, support[]}}
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references profiles(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists help_requests_agent on help_requests (agent_id, created_at desc);
create index if not exists help_requests_open on help_requests (status, created_at desc);

alter table help_requests enable row level security;

-- the agent sees their own requests; writes go through the worker so the AI
-- context pack is always attached (no direct client insert)
drop policy if exists r_help_own on help_requests;
create policy r_help_own on help_requests for select using (agent_id = auth.uid());

-- helpers see requests addressed to a role they hold for THIS agent:
--   coach  -> assigned via coach_assignments
--   leader -> the agent's profiles.leader_id
--   admin  -> country-scoped admins (master sees all)
drop policy if exists r_help_helper on help_requests;
create policy r_help_helper on help_requests for select using (
  exists (select 1 from coach_assignments ca
           where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active)
  or exists (select 1 from profiles p
              where p.id = agent_id and p.leader_id = auth.uid())
  or (is_admin() and exists (select 1 from profiles p
                              where p.id = agent_id
                                and (p.country::text = my_country()::text
                                     or my_role() = 'master_admin')))
);

-- the same helpers may mark a request resolved
drop policy if exists w_help_resolve on help_requests;
create policy w_help_resolve on help_requests for update using (
  exists (select 1 from coach_assignments ca
           where ca.coach_id = auth.uid() and ca.participant_id = agent_id and ca.active)
  or exists (select 1 from profiles p
              where p.id = agent_id and p.leader_id = auth.uid())
  or (is_admin() and exists (select 1 from profiles p
                              where p.id = agent_id
                                and (p.country::text = my_country()::text
                                     or my_role() = 'master_admin')))
);
