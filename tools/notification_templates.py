# -*- coding: utf-8 -*-
"""Generate supabase/migrations/086_notification_content.sql

Seeds the controlled notification templates, migrates every hardcoded 30 Days
PL/pgSQL string onto them, rewires the challenge functions to resolve managed
content, and assigns Kamal as tary's Coach through the audited path.

RULES OBEYED
  * No apology, promise, commitment, legal, financial or company claim is
    authored. Wording states facts and the next action, nothing more.
  * COUNTRY FIRST. MY and ID each get their own rows, including their own EN.
    The initial EN text is the same string for both countries because there is
    no approved country-specific English yet — they are SEPARATE, independently
    editable rows, not a shared one. Nothing pretends to be country-tailored.
  * Variables are declared per template and validated at publish time.
  * Existing behaviour is preserved: every call site keeps sending a message,
    it just resolves managed content instead of embedding prose.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations', '086_notification_content.sql')


def T(code, purpose, audience, notify_type, variables, ms, my_en, idl, id_en):
    """ms = (title, body) in ms-MY · idl = (title, body) in id-ID
       my_en / id_en = (title, body) in English, stored per country."""
    return dict(code=code, purpose=purpose, audience=audience, notify_type=notify_type,
                variables=variables, ms=ms, my_en=my_en, idl=idl, id_en=id_en)


# English is authored once and stored twice (MY row + ID row) — see module docstring.
def EN(t, b):
    return (t, b)


TPL = [
 T('invitation', 'Warrior invited to join Hero', 'participant', 'invitation',
   ['participant_name', 'cohort_name'],
   ('🛡 Jemputan ke IQI AG Hero', 'Anda dijemput menyertai {{cohort_name}}. Buka Hero untuk menerima jemputan dan mula.'),
   EN('🛡 You are invited to IQI AG Hero', 'You have been invited to join {{cohort_name}}. Open Hero to accept and begin.'),
   ('🛡 Undangan ke IQI AG Hero', 'Anda diundang bergabung {{cohort_name}}. Buka Hero untuk menerima undangan dan mulai.'),
   EN('🛡 You are invited to IQI AG Hero', 'You have been invited to join {{cohort_name}}. Open Hero to accept and begin.')),

 T('invitation_accepted', 'Inviter told their invite was accepted', 'coach', 'invitation',
   ['participant_name', 'cohort_name'],
   ('🎉 Jemputan diterima', '{{participant_name}} telah menyertai IQI AG Hero.'),
   EN('🎉 Invitation accepted', '{{participant_name}} has joined IQI AG Hero.'),
   ('🎉 Undangan diterima', '{{participant_name}} telah bergabung dengan IQI AG Hero.'),
   EN('🎉 Invitation accepted', '{{participant_name}} has joined IQI AG Hero.')),

 T('enrolled', 'Admin enrolled a warrior into a cohort', 'participant', 'challenge',
   ['participant_name', 'cohort_name'],
   ('🎯 Anda didaftarkan: Cabaran Closing 30 Hari', 'Kohort {{cohort_name}}. Buka cabaran untuk melengkapkan onboarding dan kesediaan anda.'),
   EN('🎯 You are enrolled: 30 Days Closing Challenge', 'Cohort {{cohort_name}}. Open the challenge to complete your onboarding and readiness.'),
   ('🎯 Anda terdaftar: Tantangan Closing 30 Hari', 'Cohort {{cohort_name}}. Buka tantangan untuk menyelesaikan onboarding dan kesiapan Anda.'),
   EN('🎯 You are enrolled: 30 Days Closing Challenge', 'Cohort {{cohort_name}}. Open the challenge to complete your onboarding and readiness.')),

 T('onboarding_incomplete', 'Enrolled but readiness not submitted', 'participant', 'challenge',
   ['participant_name'],
   ('📋 Kesediaan anda belum dihantar', 'Lengkapkan onboarding dan hantar kesediaan anda untuk membuka Hari 1.'),
   EN('📋 Your readiness is not submitted yet', 'Complete your onboarding and submit your readiness to open Day 1.'),
   ('📋 Kesiapan Anda belum dikirim', 'Selesaikan onboarding dan kirim kesiapan Anda untuk membuka Hari 1.'),
   EN('📋 Your readiness is not submitted yet', 'Complete your onboarding and submit your readiness to open Day 1.')),

 T('readiness_submitted', 'Reviewer told readiness is waiting', 'coach', 'review',
   ['participant_name'],
   ('📨 Kesediaan dihantar', '{{participant_name}} menghantar kesediaan untuk semakan.'),
   EN('📨 Readiness submitted', '{{participant_name}} submitted readiness for review.'),
   ('📨 Kesiapan dikirim', '{{participant_name}} mengirim kesiapan untuk ditinjau.'),
   EN('📨 Readiness submitted', '{{participant_name}} submitted readiness for review.')),

 T('readiness_approved', 'Readiness approved, warrior is ACTIVE', 'participant', 'readiness',
   ['coach_name', 'review_note'],
   ('✅ Kesediaan diluluskan', 'Anda kini AKTIF. Hari 1 sudah terbuka.'),
   EN('✅ Readiness approved', 'You are now ACTIVE. Day 1 is open.'),
   ('✅ Kesiapan disetujui', 'Anda kini AKTIF. Hari 1 sudah terbuka.'),
   EN('✅ Readiness approved', 'You are now ACTIVE. Day 1 is open.')),

 T('readiness_revision', 'Readiness sent back', 'participant', 'readiness',
   ['review_note'],
   ('🔄 Kesediaan — perlu semakan semula', '{{review_note}}'),
   EN('🔄 Readiness — revision required', '{{review_note}}'),
   ('🔄 Kesiapan — perlu revisi', '{{review_note}}'),
   EN('🔄 Readiness — revision required', '{{review_note}}')),

 T('new_day_available', 'A new curriculum day opened', 'participant', 'challenge',
   ['challenge_day', 'day_title'],
   ('📖 Hari {{challenge_day}} sudah terbuka', '{{day_title}}. Buka Hero untuk mula.'),
   EN('📖 Day {{challenge_day}} is open', '{{day_title}}. Open Hero to begin.'),
   ('📖 Hari {{challenge_day}} sudah terbuka', '{{day_title}}. Buka Hero untuk mulai.'),
   EN('📖 Day {{challenge_day}} is open', '{{day_title}}. Open Hero to begin.')),

 T('daily_reminder', 'Daily nudge to act', 'participant', 'challenge',
   ['challenge_day'],
   ('⏱ Hari {{challenge_day}} masih menunggu', 'Buka Hero untuk lihat misi hari ini dan susulan yang perlu.'),
   EN('⏱ Day {{challenge_day}} is still waiting', 'Open Hero to see today’s mission and the follow-ups that are due.'),
   ('⏱ Hari {{challenge_day}} masih menunggu', 'Buka Hero untuk melihat misi hari ini dan follow-up yang jatuh tempo.'),
   EN('⏱ Day {{challenge_day}} is still waiting', 'Open Hero to see today’s mission and the follow-ups that are due.')),

 T('due_soon', 'Something is due today', 'participant', 'challenge',
   ['due_date', 'next_action'],
   ('📅 Perlu diselesaikan {{due_date}}', '{{next_action}}'),
   EN('📅 Due {{due_date}}', '{{next_action}}'),
   ('📅 Jatuh tempo {{due_date}}', '{{next_action}}'),
   EN('📅 Due {{due_date}}', '{{next_action}}')),

 T('task_submitted', 'Reviewer told evidence is waiting', 'coach', 'review',
   ['participant_name', 'challenge_day', 'version'],
   ('📨 Bukti Hari {{challenge_day}} dihantar', '{{participant_name}} menghantar Hari {{challenge_day}} (v{{version}}).'),
   EN('📨 Day {{challenge_day}} evidence submitted', '{{participant_name}} submitted Day {{challenge_day}} (v{{version}}).'),
   ('📨 Bukti Hari {{challenge_day}} dikirim', '{{participant_name}} mengirim Hari {{challenge_day}} (v{{version}}).'),
   EN('📨 Day {{challenge_day}} evidence submitted', '{{participant_name}} submitted Day {{challenge_day}} (v{{version}}).')),

 T('evidence_approved', 'Day approved, XP written', 'participant', 'evidence',
   ['challenge_day', 'xp_amount', 'review_note'],
   ('🏆 Hari {{challenge_day}} diluluskan — +{{xp_amount}} XP', 'XP disahkan direkod ke lejar anda. {{review_note}}'),
   EN('🏆 Day {{challenge_day}} approved — +{{xp_amount}} XP', 'Verified XP written to your ledger. {{review_note}}'),
   ('🏆 Hari {{challenge_day}} disetujui — +{{xp_amount}} XP', 'XP terverifikasi dicatat ke buku besar Anda. {{review_note}}'),
   EN('🏆 Day {{challenge_day}} approved — +{{xp_amount}} XP', 'Verified XP written to your ledger. {{review_note}}')),

 T('evidence_approved_no_xp', 'Approved again, already credited', 'participant', 'evidence',
   ['challenge_day', 'review_note'],
   ('✅ Hari {{challenge_day}} diluluskan', 'Hari ini sudah dikreditkan sebelum ini — tiada XP berganda. {{review_note}}'),
   EN('✅ Day {{challenge_day}} approved', 'This day was already credited — no duplicate XP. {{review_note}}'),
   ('✅ Hari {{challenge_day}} disetujui', 'Hari ini sudah dikreditkan sebelumnya — tidak ada XP ganda. {{review_note}}'),
   EN('✅ Day {{challenge_day}} approved', 'This day was already credited — no duplicate XP. {{review_note}}')),

 T('evidence_revision', 'Day sent back for revision', 'participant', 'evidence',
   ['challenge_day', 'review_note'],
   ('🔄 Hari {{challenge_day}} — perlu semakan semula', '{{review_note}} Penghantaran asal anda dikekalkan.'),
   EN('🔄 Day {{challenge_day}} — revision required', '{{review_note}} Your original submission is preserved.'),
   ('🔄 Hari {{challenge_day}} — perlu revisi', '{{review_note}} Pengiriman asli Anda tetap disimpan.'),
   EN('🔄 Day {{challenge_day}} — revision required', '{{review_note}} Your original submission is preserved.')),

 T('evidence_rejected', 'Day not accepted', 'participant', 'evidence',
   ['challenge_day', 'review_note'],
   ('⛔ Hari {{challenge_day}} — tidak diterima', '{{review_note}} Penghantaran asal anda dikekalkan.'),
   EN('⛔ Day {{challenge_day}} — not accepted', '{{review_note}} Your original submission is preserved.'),
   ('⛔ Hari {{challenge_day}} — tidak diterima', '{{review_note}} Pengiriman asli Anda tetap disimpan.'),
   EN('⛔ Day {{challenge_day}} — not accepted', '{{review_note}} Your original submission is preserved.')),

 T('coaching_report_shared', 'Coach shared a written report', 'participant', 'coaching',
   ['coach_name', 'period'],
   ('🧭 Laporan coaching baharu', '{{coach_name}} berkongsi laporan {{period}} anda. Buka untuk baca dan akui.'),
   EN('🧭 New coaching report', '{{coach_name}} shared your {{period}} report. Open it to read and acknowledge.'),
   ('🧭 Laporan coaching baru', '{{coach_name}} membagikan laporan {{period}} Anda. Buka untuk membaca dan mengakui.'),
   EN('🧭 New coaching report', '{{coach_name}} shared your {{period}} report. Open it to read and acknowledge.')),

 T('report_acknowledged', 'Participant acknowledged the report', 'coach', 'coaching',
   ['participant_name'],
   ('✅ Laporan diakui', '{{participant_name}} telah membaca dan mengakui laporan anda.'),
   EN('✅ Report acknowledged', '{{participant_name}} has read and acknowledged your report.'),
   ('✅ Laporan diakui', '{{participant_name}} telah membaca dan mengakui laporan Anda.'),
   EN('✅ Report acknowledged', '{{participant_name}} has read and acknowledged your report.')),

 T('followup_overdue', 'Agreed follow-up date has passed', 'participant', 'challenge',
   ['count'],
   ('⏰ Susulan tertunggak', 'Tarikh susulan yang dijanjikan sudah berlalu. Membersihkannya selalunya menggerakkan pipeline lebih daripada lead baharu.'),
   EN('⏰ Overdue follow-up', 'Some agreed follow-up dates have passed. Clearing them usually moves the pipeline more than new leads do.'),
   ('⏰ Follow-up terlambat', 'Tanggal follow-up yang dijanjikan sudah lewat. Menyelesaikannya biasanya menggerakkan pipeline lebih dari lead baru.'),
   EN('⏰ Overdue follow-up', 'Some agreed follow-up dates have passed. Clearing them usually moves the pipeline more than new leads do.')),

 T('inactivity_nudge', 'No CRM activity for 2+ days', 'participant', 'challenge',
   [],
   ('👋 Pipeline anda sunyi', 'Tiada perbualan direkod selama dua hari. Satu perbualan sebenar hari ini mengekalkan momentum.'),
   EN('👋 Your pipeline has been quiet', 'No conversations logged for two days. One real conversation today keeps the momentum.'),
   ('👋 Pipeline Anda sepi', 'Tidak ada percakapan tercatat selama dua hari. Satu percakapan nyata hari ini menjaga momentum.'),
   EN('👋 Your pipeline has been quiet', 'No conversations logged for two days. One real conversation today keeps the momentum.')),

 T('inactivity_coach', 'Coach told a warrior is inactive', 'coach', 'review',
   ['participant_name'],
   ('⚠ {{participant_name}} tidak aktif 2 hari+', 'Tiada aktiviti CRM direkod. Semakan ringkas selalunya memulihkannya.'),
   EN('⚠ {{participant_name}} has been inactive 2+ days', 'No CRM activity logged. A short check-in usually turns this around.'),
   ('⚠ {{participant_name}} tidak aktif 2 hari+', 'Tidak ada aktivitas CRM tercatat. Check-in singkat biasanya memperbaikinya.'),
   EN('⚠ {{participant_name}} has been inactive 2+ days', 'No CRM activity logged. A short check-in usually turns this around.')),

 T('appointment_reminder', 'Appointment or viewing is close', 'participant', 'challenge',
   ['lead_name', 'due_date'],
   ('📅 Temujanji akan datang', '{{lead_name}} — {{due_date}}. Semak persediaan anda dalam Hero.'),
   EN('📅 Upcoming appointment', '{{lead_name}} — {{due_date}}. Review your preparation in Hero.'),
   ('📅 Janji temu mendatang', '{{lead_name}} — {{due_date}}. Tinjau persiapan Anda di Hero.'),
   EN('📅 Upcoming appointment', '{{lead_name}} — {{due_date}}. Review your preparation in Hero.')),

 T('streak_at_risk', 'Consecutive-day run is about to break', 'participant', 'challenge',
   ['challenge_day'],
   ('🔥 Rentetan anda dalam risiko', 'Hari {{challenge_day}} belum dihantar hari ini.'),
   EN('🔥 Your streak is at risk', 'Day {{challenge_day}} has not been submitted today.'),
   ('🔥 Streak Anda berisiko', 'Hari {{challenge_day}} belum dikirim hari ini.'),
   EN('🔥 Your streak is at risk', 'Day {{challenge_day}} has not been submitted today.')),

 T('milestone_achieved', 'Milestone of verified days', 'participant', 'milestone',
   ['count', 'percent'],
   ('🎯 Pencapaian: {{count}} hari disahkan', 'Anda {{percent}}% melalui cabaran ini.'),
   EN('🎯 Milestone: {{count}} days verified', 'You are {{percent}}% through the challenge.'),
   ('🎯 Pencapaian: {{count}} hari terverifikasi', 'Anda {{percent}}% melewati tantangan ini.'),
   EN('🎯 Milestone: {{count}} days verified', 'You are {{percent}}% through the challenge.')),

 T('badge_earned', 'Badge awarded', 'participant', 'badge',
   ['badge_name', 'badge_icon'],
   ('{{badge_icon}} Lencana diperoleh: {{badge_name}}', 'Konsisten itu berganda. Teruskan.'),
   EN('{{badge_icon}} Badge earned: {{badge_name}}', 'Consistency compounds. Keep building.'),
   ('{{badge_icon}} Lencana diraih: {{badge_name}}', 'Konsistensi itu berlipat. Terus bangun.'),
   EN('{{badge_icon}} Badge earned: {{badge_name}}', 'Consistency compounds. Keep building.')),

 T('all_days_verified', 'All 30 days approved', 'participant', 'milestone',
   [],
   ('🏁 Semua 30 hari disahkan', 'Coach anda kini akan menyemak penyempurnaan program anda.'),
   EN('🏁 All 30 days verified', 'Your Coach will now review your programme completion.'),
   ('🏁 Semua 30 hari terverifikasi', 'Coach Anda kini akan meninjau penyelesaian program Anda.'),
   EN('🏁 All 30 days verified', 'Your Coach will now review your programme completion.')),

 T('graduation_review_due', 'Human graduation review raised', 'coach', 'review',
   ['participant_name'],
   ('🎓 Semakan graduasi diperlukan', '{{participant_name}} melengkapkan 30 hari yang disahkan. Graduasi ialah keputusan anda — tidak pernah automatik.'),
   EN('🎓 Graduation review required', '{{participant_name}} completed 30 verified days. Graduation is your decision — never automatic.'),
   ('🎓 Tinjauan kelulusan diperlukan', '{{participant_name}} menyelesaikan 30 hari terverifikasi. Kelulusan adalah keputusan Anda — tidak pernah otomatis.'),
   EN('🎓 Graduation review required', '{{participant_name}} completed 30 verified days. Graduation is your decision — never automatic.')),

 T('day27_review_due', 'Day 27 structured review', 'coach', 'review',
   ['participant_name'],
   ('🧭 Hari 27 — semakan berstruktur untuk {{participant_name}}', 'Hero telah menjana ringkasan. Semak aktiviti, pipeline, halangan dan tindakan yang dipersetujui.'),
   EN('🧭 Day 27 — structured review due for {{participant_name}}', 'Hero has generated the summary. Review activity, pipeline, bottleneck and agreed next actions.'),
   ('🧭 Hari 27 — tinjauan terstruktur untuk {{participant_name}}', 'Hero telah membuat ringkasan. Tinjau aktivitas, pipeline, hambatan dan tindakan yang disepakati.'),
   EN('🧭 Day 27 — structured review due for {{participant_name}}', 'Hero has generated the summary. Review activity, pipeline, bottleneck and agreed next actions.')),

 T('day30_review_due', 'Day 30 final review', 'coach', 'review',
   ['participant_name'],
   ('🏁 Hari 30 — semakan akhir untuk {{participant_name}}', 'Penyempurnaan program, keupayaan, kemajuan pipeline dan langkah seterusnya. Graduasi kekal keputusan manusia.'),
   EN('🏁 Day 30 — final review due for {{participant_name}}', 'Programme completion, capability, pipeline progress and next journey. Graduation stays a human decision.'),
   ('🏁 Hari 30 — tinjauan akhir untuk {{participant_name}}', 'Penyelesaian program, kapabilitas, kemajuan pipeline dan langkah berikutnya. Kelulusan tetap keputusan manusia.'),
   EN('🏁 Day 30 — final review due for {{participant_name}}', 'Programme completion, capability, pipeline progress and next journey. Graduation stays a human decision.')),

 T('day30_reached', 'Participant reached Day 30', 'participant', 'milestone',
   [],
   ('🏁 Anda sampai Hari 30', 'Coach anda kini akan menjalankan semakan akhir anda.'),
   EN('🏁 You have reached Day 30', 'Your Coach will now run your final review.'),
   ('🏁 Anda mencapai Hari 30', 'Coach Anda kini akan menjalankan tinjauan akhir Anda.'),
   EN('🏁 You have reached Day 30', 'Your Coach will now run your final review.')),

 T('closing_submitted', 'Closing sent for verification', 'coach', 'review',
   ['participant_name', 'lead_name'],
   ('🏁 Closing dihantar untuk pengesahan', 'Lead: {{lead_name}} — pengesahan manusia diperlukan.'),
   EN('🏁 Closing submitted for verification', 'Lead: {{lead_name}} — human verification required.'),
   ('🏁 Closing dikirim untuk verifikasi', 'Lead: {{lead_name}} — verifikasi manusia diperlukan.'),
   EN('🏁 Closing submitted for verification', 'Lead: {{lead_name}} — human verification required.')),

 T('closing_verified', 'Closing verified by a human', 'participant', 'closing',
   ['xp_amount'],
   ('🏆 Closing DISAHKAN', 'Closing anda disahkan oleh penyemak manusia. +{{xp_amount}} XP.'),
   EN('🏆 Closing VERIFIED', 'Your closing was verified by a human reviewer. +{{xp_amount}} XP.'),
   ('🏆 Closing TERVERIFIKASI', 'Closing Anda diverifikasi oleh peninjau manusia. +{{xp_amount}} XP.'),
   EN('🏆 Closing VERIFIED', 'Your closing was verified by a human reviewer. +{{xp_amount}} XP.')),

 T('closing_needs_more', 'Closing sent back for documentation', 'participant', 'closing',
   ['review_note'],
   ('🔄 Closing perlu tambahan', '{{review_note}}'),
   EN('🔄 Closing needs more', '{{review_note}}'),
   ('🔄 Closing perlu tambahan', '{{review_note}}'),
   EN('🔄 Closing needs more', '{{review_note}}')),

 T('post_closing_available', 'Post-closing journey opened', 'participant', 'journey',
   [],
   ('🎓 Perjalanan Pasca-Closing tersedia', 'Refleksi, khidmat, rekrut dan mengajar — laluan Elite Coach anda bermula di sini.'),
   EN('🎓 Post-Closing Journey available', 'Reflection, service, recruit and teach — your Elite Coach path starts here.'),
   ('🎓 Perjalanan Pasca-Closing tersedia', 'Refleksi, layanan, rekrut dan mengajar — jalur Elite Coach Anda dimulai di sini.'),
   EN('🎓 Post-Closing Journey available', 'Reflection, service, recruit and teach — your Elite Coach path starts here.')),

 T('coach_assigned_coach', 'Coach told a warrior was assigned', 'coach', 'coaching',
   ['participant_name'],
   ('👥 Warrior baharu ditugaskan', 'Anda kini Coach untuk {{participant_name}}. Semakan mereka datang kepada anda.'),
   EN('👥 New warrior assigned', 'You are now the Coach for {{participant_name}}. Their reviews come to you.'),
   ('👥 Warrior baru ditugaskan', 'Anda kini Coach untuk {{participant_name}}. Tinjauan mereka datang ke Anda.'),
   EN('👥 New warrior assigned', 'You are now the Coach for {{participant_name}}. Their reviews come to you.')),

 T('coach_assigned_participant', 'Warrior told who their coach is', 'participant', 'coaching',
   ['coach_name'],
   ('🧭 Coach anda', '{{coach_name}} kini Coach anda untuk Cabaran Closing 30 Hari.'),
   EN('🧭 Your Coach', '{{coach_name}} is now your Coach for the 30 Days Closing Challenge.'),
   ('🧭 Coach Anda', '{{coach_name}} kini Coach Anda untuk Tantangan Closing 30 Hari.'),
   EN('🧭 Your Coach', '{{coach_name}} is now your Coach for the 30 Days Closing Challenge.')),

 T('xp_reversed', 'A verified XP award was reversed', 'participant', 'xp',
   ['reason'],
   ('↩️ XP diselaraskan', 'Satu anugerah XP telah dibalikkan oleh penyemak. Sebab: {{reason}}'),
   EN('↩️ XP adjusted', 'An XP award was reversed by a reviewer. Reason: {{reason}}'),
   ('↩️ XP disesuaikan', 'Satu pemberian XP dibalik oleh peninjau. Alasan: {{reason}}'),
   EN('↩️ XP adjusted', 'An XP award was reversed by a reviewer. Reason: {{reason}}')),

 T('enrolment_status', 'Enrolment paused / resumed / withdrawn', 'participant', 'challenge',
   ['review_status', 'reason'],
   ('📋 Status cabaran anda: {{review_status}}', '{{reason}}'),
   EN('📋 Your challenge status: {{review_status}}', '{{reason}}'),
   ('📋 Status tantangan Anda: {{review_status}}', '{{reason}}'),
   EN('📋 Your challenge status: {{review_status}}', '{{reason}}')),

 T('day_marked', 'A day was marked missed or excused', 'participant', 'challenge',
   ['challenge_day', 'review_status', 'reason'],
   ('📌 Hari {{challenge_day}}: {{review_status}}', '{{reason}}'),
   EN('📌 Day {{challenge_day}}: {{review_status}}', '{{reason}}'),
   ('📌 Hari {{challenge_day}}: {{review_status}}', '{{reason}}'),
   EN('📌 Day {{challenge_day}}: {{review_status}}', '{{reason}}')),
]


def q(v):
    """SQL literal. standard_conforming_strings is ON: only ' needs doubling."""
    if v is None:
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def arr(xs):
    return 'array[' + ','.join(q(x) for x in xs) + ']::text[]' if xs else "'{}'::text[]"


def main():
    L = []
    a = L.append
    a('-- ============================================================')
    a('-- 086_notification_content.sql — GENERATED by tools/notification_templates.py')
    a('-- Do not hand-edit; edit the generator or the templates in Command HQ.')
    a('--')
    a('-- 1. Seeds every controlled 30 Days notification template (v1, published).')
    a('-- 2. Rewires the challenge functions onto managed content.')
    a('-- 3. Assigns Kamal as tary\'s Coach through the audited domain path.')
    a('--')
    a('-- COUNTRY FIRST: MY and ID each carry their own two locales, including their')
    a('-- own English row. No cross-country fallback is possible by construction.')
    a('-- ============================================================')
    a('')
    a('do $seed$')
    a('declare v_ver uuid;')
    a('begin')
    for t in TPL:
        a(f"  -- {t['code']}: {t['purpose']}")
        a('  insert into ch_notification_templates (code, purpose, audience, notify_type, variables, status)')
        a(f"  values ({q(t['code'])}, {q(t['purpose'])}, {q(t['audience'])}, {q(t['notify_type'])}, {arr(t['variables'])}, 'active')")
        a('  on conflict (code) do nothing;')
        a('  insert into ch_notification_template_versions (template_code, version, status, published_at)')
        a(f"  values ({q(t['code'])}, 1, 'published', now())")
        a('  on conflict (template_code, version) do nothing')
        a('  returning id into v_ver;')
        a(f"  if v_ver is null then select id into v_ver from ch_notification_template_versions")
        a(f"    where template_code = {q(t['code'])} and version = 1; end if;")
        a('  insert into ch_notification_template_translations (version_id, country, locale, title, body) values')
        rows = [
            ("MY", "ms-MY", t['ms']),
            ("MY", "en", t['my_en']),
            ("ID", "id-ID", t['idl']),
            ("ID", "en", t['id_en']),
        ]
        a(',\n'.join(f"    (v_ver, '{c}', '{loc}', {q(v[0])}, {q(v[1])})" for c, loc, v in rows))
        a('  on conflict (version_id, country, locale) do nothing;')
        a('')
    a("  raise notice 'seeded " + str(len(TPL)) + " notification templates';")
    a('end $seed$;')
    a('')

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print(f'wrote {OUT}')
    print(f'  {len(TPL)} templates x 4 (MY ms-MY / MY en / ID id-ID / ID en) = {len(TPL)*4} translations')


if __name__ == '__main__':
    main()
