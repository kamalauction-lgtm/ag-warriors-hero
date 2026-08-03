-- ============================================================
-- 013_clear_rehearsal.sql — remove the launch rehearsal data.
-- Run this BEFORE 8 August so real MY Cohort 1 starts empty.
--
-- Deletes Test Warrior's enrolment (cascades to his readiness submission)
-- and the notifications that rehearsal generated. His ACCOUNT stays, so you
-- still have a test warrior for after launch.
-- ============================================================

begin;

delete from enrolments where participant_id = '1ed8053a-7bb5-4063-bf49-6b8d5b629403';

delete from notifications
where to_agent = '1ed8053a-7bb5-4063-bf49-6b8d5b629403'
   or title in ('📨 Readiness submitted', '✅ Readiness approved — you are ACTIVE');

commit;

-- verification: enrolments must be 0, profiles must be 2
select 'enrolments (must be 0)' as check, count(*) from enrolments
union all
select 'profiles (must be 2)', count(*) from profiles
union all
select 'cohort start date', official_start_date::text from cohorts where country = 'MY';
