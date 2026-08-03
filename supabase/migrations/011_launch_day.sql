-- ============================================================
-- 011_launch_day.sql — LAUNCH: 8 August 2026
-- Part A: purge test data so real warriors see a clean platform
-- Part B: set both cohorts' official start to 2026-08-08
-- Part C: verification (read the output of the final SELECTs)
--
-- NOT deleted on purpose: audit_events (immutable by design, §29) and the
-- Test Warrior ACCOUNT itself (kept so you can re-test after launch —
-- its challenge data is wiped, so it appears nowhere).
-- ============================================================

begin;

-- ---------- PART A: purge test data ----------
-- Test Warrior: 1ed8053a-7bb5-4063-bf49-6b8d5b629403 (test.warrior@demo.my)

-- ORDER MATTERS: pcj_progress.closing_id references ch_closings, and deleting
-- leads cascades into closings — so the journey rows must go first.
delete from pcj_progress         where participant_id = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';

-- CRM: deleting leads cascades to activities, appointments and closings
delete from ch_leads where participant_id = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';

-- gamification + coaching
delete from points_ledger        where user_id        = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';
delete from mentor_points_ledger where user_id        = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';
delete from user_badges          where user_id        = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';
delete from coaching_reports     where participant_id = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';

-- enrolment cascades to readiness_submissions + task_submissions -> evidence_assets
delete from enrolments where participant_id = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';

-- any uploaded evidence files for the test warrior
delete from storage.objects
where bucket_id = 'evidence'
  and name like '1ed8053a-7bb5-4063-bf49-6b8d5b629403/%';

-- test notifications (both the warrior's and the ones our tests sent you)
delete from notifications
where to_agent = '1ed8053a-7bb5-4063-bf49-6b8d5b629403'
   or title in ('🏁 Closing submitted for verification','🎓 Post-closing step submitted',
                '✅ Report acknowledged','🎉 Invitation accepted','🎓 Graduation review required');

-- test invitations
delete from invitations where status = 'accepted' or name ilike '%test%';

-- ---------- PART B: launch date ----------
update cohorts set official_start_date = date '2026-08-08', status = 'open'
where id in ('6a20ea0c-1a54-4b2f-b17d-e89e4ebf692f',   -- MY Cohort 1 — August (06:00 Asia/Kuala_Lumpur)
             '62892f0c-8cab-4416-845b-b13db84dedce');  -- ID Cohort 1 — Agustus (06:00 Asia/Jakarta)

commit;

-- ---------- PART C: verification ----------
select 'cohorts' as check, name, country, official_start_date, official_timezone,
       daily_unlock_time, status from cohorts order by country;

select 'leftovers (all must be 0)' as check,
 (select count(*) from enrolments)                                                as enrolments,
 (select count(*) from task_submissions)                                          as submissions,
 (select count(*) from points_ledger)                                             as xp_rows,
 (select count(*) from mentor_points_ledger)                                      as mentor_points,
 (select count(*) from user_badges)                                               as badges,
 (select count(*) from ch_leads)                                                  as leads,
 (select count(*) from ch_closings)                                               as closings,
 (select count(*) from pcj_progress)                                              as journey_steps,
 (select count(*) from coaching_reports)                                          as coaching_reports,
 (select count(*) from invitations where status = 'pending')                      as pending_invites;

select 'content kept (must be > 0)' as check,
 (select count(*) from curriculum_days)   as curriculum_days,   -- expect 30
 (select count(*) from pcj_steps)         as journey_steps,     -- expect 9
 (select count(*) from xp_rules)          as xp_rules,          -- expect 5
 (select count(*) from ch_badges)         as badges,            -- expect 5
 (select count(*) from audit_events)      as audit_events;      -- history preserved
