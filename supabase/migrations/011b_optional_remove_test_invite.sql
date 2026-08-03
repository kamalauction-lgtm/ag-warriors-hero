-- ============================================================
-- 011b — OPTIONAL. Run ONLY if you want the test-invite account gone.
--
-- The account created during our invitation test is:
--     name  : test invite
--     email : siti2202@gmail.com
--     phone : +60175341688
--
-- That looks like a REAL person's email and phone, so this is deliberately
-- kept out of the main launch script.
--
--  • If it was just you testing → run this; the phone becomes free to invite again.
--  • If Siti is a real prospect you want in Cohort 1 → DO NOT run this.
--    Leave the account; she simply completes onboarding and enrols like anyone else.
--    (The account holds no challenge data, so it affects nothing.)
--
-- Deleting the auth user cascades to the profile row.
-- ============================================================

delete from auth.users where email = 'siti2202@gmail.com';

select 'remaining profiles' as check, name, email, country, is_commander
from profiles order by created_at;
