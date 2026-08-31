-- 065_timebox_reminders.sql — TimeBox reminders become real.
--
-- "Enable reminders" was a 6-second browser demo. Now the worker cron scans
-- pending tasks whose slot falls inside the next 15 minutes (per-country
-- timezone), writes a notifications row, and the web-push dispatcher (064)
-- delivers it to the agent's devices. reminded stops double-sends.

alter table time_tasks add column if not exists reminded boolean not null default false;
create index if not exists time_tasks_remind
  on time_tasks (on_date, status) where reminded = false and slot is not null;
