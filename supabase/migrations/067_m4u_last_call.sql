-- 067_m4u_last_call.sql — honest "Diperbarui": the LAST REAL CALL per lead.
--
-- The PHP console's Diperbarui column showed leads.updated_at, which moves on
-- ANY row touch (cron reconcile, sync flags, admin edits) — so "39 detik lalu"
-- often meant nothing about the phone. The admin list needs the actual last
-- call date+time per lead; one grouped read server-side beats paging tens of
-- thousands of attempt rows into the browser.

create or replace function m4u_last_calls()
returns table (lead_id bigint, last_called timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.lead_id, max(a.called_at)
    from m4u_attempts a
    join m4u_leads l on l.id = a.lead_id
   where is_admin()
     and (l.country::text = my_country()::text or my_role() = 'master_admin')
   group by a.lead_id
$$;

revoke all on function m4u_last_calls() from public, anon;
grant execute on function m4u_last_calls() to authenticated;
