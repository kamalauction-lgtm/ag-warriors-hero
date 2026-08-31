-- ============================================================
-- 094_cert_email_cancel.sql — a send that was called off is not a failure.
--
-- WHAT HAPPENED (production, 26 Aug 2026, reconstructed from the record):
--   04:29:35  AG-ID-2026-000002 issued to Rozy on UI.SALEMBA
--   04:31:28  "Send" pressed  -> delivery #5 queued
--   04:34:19  the certificate was revoked (reason: "testing")
--   ~04:35    the cron picked the queued delivery up, saw the certificate was
--             no longer valid, and REFUSED to send it
--
-- The refusal was correct — a revoked certificate must never land in someone's
-- inbox. Two things were wrong with how it was reported:
--
--   1. it was recorded as status 'failed' with the error 'certificate not
--      valid', so the console counted it under DELIVERY ISSUES. That sends the
--      admin looking for a mail problem — a bounce, a bad address, a Resend
--      outage — when nothing was wrong with the mail at all.
--   2. the reason never reached the screen. The row showed a bare red "Failed".
--
-- THE FIX: revoking a certificate now cancels any still-queued delivery for it
-- at that moment, with a reason, instead of leaving it to fail minutes later.
--
-- ROLLBACK: drop 'cancelled' from the check constraint (after moving any such
-- rows back to 'failed') and re-run 075's cert_revoke.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A FOURTH DELIVERY OUTCOME
--    queued -> sent | failed (the mail did not get through)
--                   | cancelled (we called it off; no mail was attempted)
-- ------------------------------------------------------------
alter table certificate_email_deliveries drop constraint if exists certificate_email_deliveries_status_check;
alter table certificate_email_deliveries add constraint certificate_email_deliveries_status_check
  check (status in ('queued', 'sent', 'failed', 'cancelled'));

comment on column certificate_email_deliveries.status is
  'queued = waiting for the cron. sent = accepted by the provider. '
  'failed = the send was attempted and did not get through — a real delivery '
  'issue. cancelled = the send was called off before any mail was attempted, '
  'normally because the certificate was revoked or superseded first (094).';

-- ------------------------------------------------------------
-- 2. REVOKING CALLS OFF ANY PENDING SEND
-- ------------------------------------------------------------
create or replace function cert_revoke(p_cert uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c issued_certificates; v_cancelled int := 0;
begin
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason required'; end if;
  select * into v_c from issued_certificates where id = p_cert;
  if v_c.id is null then raise exception 'not found'; end if;
  if not (coalesce(is_admin(), false) and (v_c.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';   -- revoke = admins only, not delegated
  end if;
  if v_c.status = 'revoked' then return jsonb_build_object('ok', true, 'already', true); end if;

  update issued_certificates set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
    revoke_reason = btrim(p_reason), updated_at = now() where id = p_cert;

  -- anything still waiting to go out is called off here, not left to fail later
  update certificate_email_deliveries
     set status = 'cancelled',
         error = 'Certificate revoked before this email was sent — nothing was emailed.'
   where certificate_id = p_cert and status = 'queued';
  get diagnostics v_cancelled = row_count;

  if v_cancelled > 0 then
    perform audit_log('certificate.email_cancelled', 'issued_certificate', p_cert::text,
                      'queued', 'cancelled',
                      'revoked before the queued email was sent: ' || btrim(p_reason));
  end if;

  return jsonb_build_object('ok', true, 'cancelled_emails', v_cancelled);
end $$;
revoke all on function cert_revoke(uuid, text) from public, anon;
grant execute on function cert_revoke(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3. RECLASSIFY THE ONE HISTORICAL ROW THIS DESCRIBES
--    This edits a delivery-log row. It is done because the row's current label
--    is factually wrong — no send was ever attempted, so it was never a
--    delivery failure — and because left alone it would be counted as an open
--    delivery issue forever. The change is audited with the original values.
-- ------------------------------------------------------------
do $fix$
declare r record; v_n int := 0;
begin
  for r in
    select d.id, d.certificate_id, d.status, d.error, c.certificate_number, c.status as cert_status
      from certificate_email_deliveries d
      join issued_certificates c on c.id = d.certificate_id
     where d.status = 'failed' and d.sent_at is null and d.provider_id is null
       and d.error = 'certificate not valid'
       and c.status in ('revoked', 'superseded')
  loop
    update certificate_email_deliveries
       set status = 'cancelled',
           error = 'Certificate was ' || r.cert_status ||
                   ' before this email was sent — nothing was emailed.'
     where id = r.id;
    insert into audit_events (actor, actor_role, action, entity_type, entity_id,
                              prev_state, new_state, reason, actor_type, execution_method)
    values (null, 'service', 'certificate.email_reclassified', 'certificate_email_delivery', r.id::text,
            r.status || ' / ' || coalesce(r.error, ''), 'cancelled',
            'Migration 094: no send was ever attempted for ' || r.certificate_number ||
            ' because the certificate was ' || r.cert_status || ' first. Recorded as a delivery ' ||
            'failure, which it was not.', 'system', 'migration');
    v_n := v_n + 1;
  end loop;
  raise notice '094 reclassified % delivery row(s) from failed to cancelled', v_n;
end $fix$;

-- ------------------------------------------------------------
-- 4. THE REASON MUST REACH THE SCREEN
--    cert_eligibility returned the delivery STATUS but never the error text, so
--    the console could only ever show a bare red "Failed" and the admin had to
--    go to the database to find out what happened. It now returns the reason.
--    Everything else in this function is unchanged from 093.
-- ------------------------------------------------------------
create or replace function cert_eligibility(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev events; v_cfg event_certificate_configs;
begin
  select * into v_ev from events where id = p_event;
  if v_ev.id is null then raise exception 'no event'; end if;
  if not (is_cert_admin() and (v_ev.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  select * into v_cfg from event_certificate_configs where event_id = p_event;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select r.session_id, s.title as session_title, s.starts_at, s.type,
           r.lead_id, l.name, l.phone_norm, l.custom_fields->>'email' as email,
           r.attended, r.attended_at, r.checkin_method, r.source,
           (r.attended = 'attended' and coalesce(v_cfg.enabled, false)) as eligible,
           c.id as certificate_id, c.certificate_number, c.status as cert_status, c.recipient_name,
           c.pdf_path is not null as has_pdf, c.issued_at,
           c.revoke_reason,
           (select p.certificate_number from issued_certificates p where p.id = c.reissue_of) as replaces_number,
           (select count(*) from issued_certificates h
             where h.session_id = r.session_id and h.lead_id = r.lead_id
               and h.status = 'revoked') as revoked_count,
           d.status as email_status,
           d.error as email_error,
           (select dd.sent_at from certificate_email_deliveries dd where dd.certificate_id = c.id
              and dd.status = 'sent' order by dd.sent_at desc limit 1) as email_sent_at,
           (select count(*) from certificate_email_deliveries dd where dd.certificate_id = c.id) as email_attempts
      from bop_roster r
      join bop_sessions s on s.id = r.session_id
      join m4u_leads l on l.id = r.lead_id
      left join lateral (
        select * from issued_certificates ic
         where ic.session_id = r.session_id and ic.lead_id = r.lead_id
           and ic.status <> 'superseded'
         order by (ic.status = 'issued') desc, ic.issued_at desc
         limit 1) c on true
      left join lateral (
        select * from certificate_email_deliveries dd
         where dd.certificate_id = c.id order by dd.queued_at desc limit 1) d on true
     where s.event_id = p_event
     order by r.attended = 'attended' desc, r.registered_at desc) x), '[]'::jsonb);
end $$;
revoke all on function cert_eligibility(uuid) from public, anon;
grant execute on function cert_eligibility(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. VERIFY
-- ------------------------------------------------------------
select 'delivery outcomes' as check, status, count(*) from certificate_email_deliveries
 group by status order by status;

select 'genuine delivery failures (a send was attempted and did not arrive)' as check,
       d.id, d.to_email, d.error, d.queued_at
  from certificate_email_deliveries d where d.status = 'failed' order by d.queued_at desc;

select 'every delivery, newest first' as check,
       d.id, c.certificate_number, c.status as cert_status, d.status, d.error, d.sent_at
  from certificate_email_deliveries d
  join issued_certificates c on c.id = d.certificate_id
 order by d.queued_at desc;
