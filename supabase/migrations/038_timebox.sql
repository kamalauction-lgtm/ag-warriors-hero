-- 038_timebox.sql — the daily planner becomes real.
--
-- TimeBox sits on the home screen and is the app's main daily habit, but it was
-- seeded with invented tasks ("Follow up Encik Lim", "Submit loan docs for
-- Sarah") shown to EVERY user including real accounts, and it had no storage at
-- all — anything an agent typed vanished on refresh. On 8 August that is the
-- first thing a new recruit would touch.
--
-- One row per task per person per day. Postponing writes tomorrow's date, which
-- is what makes carry-forward work without a second mechanism.

create table if not exists time_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  on_date date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  label text not null,
  slot text,                                   -- 'HH:MM', free text so it stays flexible
  status text not null default 'pending'
    check (status in ('pending','done','notdone','postponed')),
  reason text,                                 -- why it did not happen (§ accountability)
  carried boolean not null default false,      -- arrived here from a previous day
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists time_tasks_user_day on time_tasks (user_id, on_date);

alter table time_tasks enable row level security;

-- A planner is personal. Not even an admin reads someone's private to-do list;
-- what leadership needs is the COUNT, which the view below exposes instead.
drop policy if exists rw_time_tasks on time_tasks;
create policy rw_time_tasks on time_tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- postpone = move to tomorrow, keeping the trail ----------
create or replace function timebox_postpone(p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_row time_tasks; v_new uuid;
begin
  select * into v_row from time_tasks where id = p_id and user_id = auth.uid();
  if v_row.id is null then raise exception 'not found'; end if;

  update time_tasks
     set status = 'postponed', reason = coalesce(p_reason, reason), updated_at = now()
   where id = p_id;

  -- tomorrow's copy is a NEW row, so today's record of what happened stays intact
  insert into time_tasks (user_id, on_date, label, slot, carried, sort_order)
  values (v_row.user_id, v_row.on_date + 1, v_row.label, v_row.slot, true, v_row.sort_order)
  returning id into v_new;

  return jsonb_build_object('postponed', p_id, 'carried_to', v_new);
end $$;

grant execute on function timebox_postpone(uuid, text) to authenticated;

-- ---------- the week strip, from real rows ----------
create or replace function timebox_week()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d::date,
           'planned', (select count(*) from time_tasks t
                        where t.user_id = auth.uid() and t.on_date = d::date),
           'done', (select count(*) from time_tasks t
                     where t.user_id = auth.uid() and t.on_date = d::date and t.status = 'done')
         ) order by d), '[]'::jsonb)
  from generate_series(
    (now() at time zone 'Asia/Kuala_Lumpur')::date - 6,
    (now() at time zone 'Asia/Kuala_Lumpur')::date,
    interval '1 day') d
$$;

grant execute on function timebox_week() to authenticated;
