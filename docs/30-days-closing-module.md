# 30 DAYS CLOSING CHALLENGE — MODULE SPECIFICATION (SOURCE OF TRUTH)

> Pasted by Kamal 2026-08-02. Binding. Do not rebuild existing working functionality from scratch;
> audit and connect. No major coding until Kamal writes: APPROVED TO BUILD.

PROJECT: IQI AG HERO
MODULE: 30 DAYS CLOSING CHALLENGE
PRODUCTION DOMAIN: hero.iqiaggroup.com
TARGET COUNTRIES: Malaysia and Indonesia

Public-facing product name: **IQI AG Hero**. Internal platform architecture may continue using existing naming; do not rename existing technical components unnecessarily.

==================================================
## 1. PRIMARY INSTRUCTION
==================================================

Build one mobile-first, multi-country web application for Malaysia and Indonesia. Do not create separate codebases.

Use: Malaysia configuration; Indonesia configuration; Bahasa Melayu ms-MY; Bahasa Indonesia id-ID; English en; shared user identity; shared application architecture; country-specific terminology, onboarding, approved content, projects, reporting, currency display and operational configuration.

Production: hero.iqiaggroup.com
Development environments: dev-hero.iqiaggroup.com · staging-hero.iqiaggroup.com · hero.iqiaggroup.com

Use the approved existing technical stack. Do not replace unless a blocking technical reason is documented.

Before coding: (1) inspect the existing repository; (2) identify what already exists; (3) identify reusable components; (4) identify missing components; (5) identify database changes; (6) identify migration risks; (7) show the final implementation sequence; (8) wait for approval before destructive changes.

Never modify or delete the AG-BoK archive and source-reference folders. Treat archived AG-BoK documents as governance/future-reference material, not the immediate product backlog.

==================================================
## 2. PRODUCT PURPOSE
==================================================

IQI AG Hero is a development, accountability, coaching and performance platform for IQI AG Warriors in Malaysia and Indonesia.

The 30 Days Closing Challenge must move a participant through: Onboarding → personal commitment → learning → daily prospecting activity → lead management → appointments → viewings or presentations → follow-up → negotiation → closing → post-closing development → recruitment and education of new Warriors.

The product must not teach that money or a closing result is the only definition of success. The system must reinforce: character; discipline; integrity; IQI AG Group culture; approved SOP; consistent action; learning; evidence; accountability; service to customers; teamwork; coaching; leadership development; responsible recruitment; teaching and mentoring others.

The principle "closing is helping" should be represented in the learning experience.

==================================================
## 3. USER HIERARCHY
==================================================

Master Mentor → Elite Coach → Elite Warrior

Initial role model: (1) Super Admin; (2) Master Mentor; (3) Elite Coach; (4) Elite Warrior / Participant; (5) AI Assistant operating behind the scenes.

The Master Mentor role is initially associated with Kamal, but the implementation must not hardcode a personal name into permissions. Use configurable role assignments.

==================================================
## 4. ROLE RESPONSIBILITIES
==================================================

**SUPER ADMIN** can: manage countries; languages; organisations; cohorts; users; assign roles; manage curriculum; daily tasks; configure XP; badges; leaderboard rules; Mentor Points; manage projects and approved content; view programme-level reports; manage feature flags; suspend accounts; manage system settings; inspect audit records.
Cannot silently alter historical evidence, completed reviews or points history.

**MASTER MENTOR** can: view all authorised cohorts; monitor all Elite Coaches; review programme performance; publish approved guidance; review escalated coaching cases; approve Elite Coach eligibility; review Mentor Points; issue programme announcements; view country and cohort reports; review high-level closing and development outcomes; review culture and SOP adherence.
Must not be required for every routine task approval.

**ELITE COACH** can: manage assigned participants; review daily submissions; approve evidence; request revision; provide coaching feedback; create coaching reports; monitor participant pipeline; review appointments and viewings; review closing plans; recommend interventions; monitor inactivity; award only authorised coach-controlled recognition; view assigned team leaderboard and reports.
Cannot: alter another Coach's team without authority; approve their own evidence; delete audit records; change global scoring rules; create institutional authority through a system status.

**ELITE WARRIOR / PARTICIPANT** can: update profile; select language; view the 30-day roadmap; view daily tasks; submit task responses; upload evidence; update leads; add notes; record calls and follow-ups; manage appointments; record viewings/presentations; record closing progress; view Coach feedback; view coaching reports; view XP; badges; streak; leaderboard; personal performance; complete post-closing recruitment and education actions.
Cannot: approve their own evidence; alter scoring; access another participant's private evidence; change final coaching decisions; edit audit history.

**AI ASSISTANT** operates behind the scenes.
AI may: summarize participant progress; prepare draft coaching summaries; suggest possible next actions; identify incomplete fields; identify inactivity; identify possible pipeline stagnation; suggest a lead stage for human review; prepare draft reminders; prepare draft feedback; translate draft content between approved languages; identify possible duplicate records; summarize evidence for a Coach; recommend content from approved sources.
AI must never independently: approve or reject evidence; award official XP; award Mentor Points; assign a final lead outcome; declare a closing completed; discipline a participant; determine Coach eligibility; suspend an account; issue final coaching judgement; make financial, legal or institutional decisions; expose data across unauthorised teams or countries.
All material AI recommendations require human review.

==================================================
## 5. MODULE OUTCOME
==================================================

At the end, the platform should show: onboarding completion; 30-day programme completion; daily task completion; verified evidence; learning progress; prospecting activity; lead-pipeline development; appointments; viewings/presentations; follow-ups; negotiation activity; closing outcome where applicable; coaching interventions; SOP and character development; XP and badges; post-closing recruitment and education activity; next-stage development recommendation.

A participant may complete the programme without a closing. Do not label the participant a failure solely because a closing did not happen within 30 days.
Differentiate: programme completion; activity achievement; capability development; pipeline progress; verified closing; post-closing leadership development.

==================================================
## 6. MODULE LIFECYCLE
==================================================

DRAFT → INVITED → ONBOARDING → READY → ACTIVE → PAUSED → COMPLETED → GRADUATED → WITHDRAWN

Rules: INVITED = invited, onboarding incomplete. ONBOARDING = profile/country/language/setup incomplete. READY = readiness requirements complete. ACTIVE = inside the 30-day challenge. PAUSED requires authorised reason + audit record. COMPLETED = programme requirements processed. GRADUATED = completion criteria AND required Coach review satisfied. WITHDRAWN requires reason, date, authority.

Do not automatically mark GRADUATED based only on Day 30 being reached.

==================================================
## 7. PARTICIPANT ONBOARDING
==================================================

Onboarding includes: full name; preferred display name; profile photograph; mobile number; email; country; state/province/region; preferred language; timezone; assigned organisation or team; assigned Elite Coach; current experience level; current pipeline size; personal 30-day goal; personal reason/motivation; daily commitment; acknowledgement of programme rules; evidence requirements; respectful conduct; data and privacy notice.

Country defaults — Malaysia: locale ms-MY; timezone Asia/Kuala_Lumpur; currency display MYR. Indonesia: locale id-ID; timezone per participant location, Asia/Jakarta initial default; currency display IDR. English remains available in both countries.

Do not use currency or commission amount as the main leaderboard score.

==================================================
## 8. READINESS GATE
==================================================

Before Day 1 activates, verify: profile complete; country selected; language selected; team assigned; Coach assigned; programme terms acknowledged; learning access confirmed; required system setup confirmed; initial goal submitted; initial pipeline baseline submitted; readiness checklist completed.

Readiness status: NOT_STARTED · IN_PROGRESS · SUBMITTED · UNDER_REVIEW · APPROVED · REVISION_REQUIRED

Only an authorised Coach or Admin may approve readiness. All approvals must create an audit event.

==================================================
## 9. DAILY CHALLENGE EXPERIENCE
==================================================

Each challenge day contains: day number; title; objective; short learning content; approved video/media; instructions; required action; optional stretch action; evidence requirement; reflection question; Coach guidance; XP configuration; completion rules; due date; grace period; country-specific content override; language variants; unlock rules.

Daily status: LOCKED · AVAILABLE · IN_PROGRESS · SUBMITTED · UNDER_REVIEW · APPROVED · REVISION_REQUIRED · MISSED · EXCUSED

Rules: daily curriculum content must be database-driven; do not hardcode the 30-day content into page components; Admin edits future curriculum versions; started cohorts remain attached to their curriculum version; historical submissions preserve the original task version; Coach approval may be required for selected tasks; XP requiring evidence remains provisional until approval; revision does not erase the original submission; all resubmissions remain traceable.

==================================================
## 10. RECOMMENDED SEED CURRICULUM V1 (editable seed — never hardcoded)
==================================================

**PHASE 1: FOUNDATION AND READINESS**
- DAY 1 — Hero Commitment. Purpose: introduce IQI AG Hero; programme purpose; confirm commitment; culture, integrity, "closing is helping". Evidence: personal commitment statement; 30-day goal; daily available time.
- DAY 2 — Professional Identity and Character. Purpose: professional identity; strengths/improvement areas; conduct and responsibility. Evidence: completed professional profile; character reflection; personal improvement commitment.
- DAY 3 — System and Work Setup. Purpose: approved account/social/project/work-system setup; tool access. Evidence: readiness checklist; approved screenshots or confirmation; no passwords or secret information.
- DAY 4 — Market, Customer and Project Focus. Purpose: choose approved initial market/project focus; intended customer profile; approved value propositions. Evidence: selected focus; customer profile; approved project-learning completion.
- DAY 5 — Build the First Lead List. Purpose: initial contact and lead list; classify contacts; ethical outreach plan. Evidence: lead records created; no unnecessary personal information; planned first actions.

**PHASE 2: PROSPECTING AND ENGAGEMENT**
- DAY 6 — Cold, Warm and Hot Leads. Learning themes: Hook; Trust; Closing or next action. Evidence: classified lead sample; explanation.
- DAY 7 — Daily Prospecting Rhythm. Evidence: daily prospecting plan; completed activity records.
- DAY 8 — First Message and Hook. Avoid spam/misleading claims. Evidence: draft and approved message examples; outreach activity.
- DAY 9 — Needs Discovery. Avoid pushing unsuitable solutions. Evidence: discovery-question checklist; lead notes.
- DAY 10 — Building Trust. Evidence: follow-up example; reflection on trust-building.
- DAY 11 — Follow-Up Discipline. Helpful vs excessive contact. Evidence: follow-up tasks created; updated lead activity.
- DAY 12 — Appointment Setting. Evidence: appointment record or simulated approved practice; preparation notes.

**PHASE 3: PRESENTATION AND CONVERSION**
- DAY 13 — Project and Product Mastery. What may and may not be claimed. Evidence: knowledge check; approved project summary.
- DAY 14 — Value Proposition. Benefits without exaggeration. Evidence: customer-specific value statement; Coach review where required.
- DAY 15 — Presentation Structure. Opening, discovery, recommendation, next action. Evidence: presentation outline; practice recording or approved observation.
- DAY 16 — Country-Specific Customer Process. Approved journey MY/ID; internal escalation route. Evidence: country-specific checklist; knowledge confirmation. Do not hardcode legal or financing advice; country content maintained by authorised content owners.
- DAY 17 — Viewing or Presentation Preparation. Evidence: viewing/presentation plan.
- DAY 18 — Conducting the Viewing or Presentation. Avoid unsupported promises. Evidence: record; customer questions; next-step status.
- DAY 19 — Post-Viewing Follow-Up. Evidence: follow-up record; updated pipeline status.
- DAY 20 — Objection Handling. Question vs concern vs timing vs mismatch; respond honestly. Evidence: objection log; response plan; Coach feedback.
- DAY 21 — Negotiation and Decision Support. Approved information only; no pressure or unauthorised promises. Evidence: negotiation notes; next-action plan.

**PHASE 4: CLOSING, CONTINUITY AND MULTIPLICATION**
- DAY 22 — Closing Readiness. Evidence: closing-readiness checklist; missing items and owner.
- DAY 23 — Closing Is Helping. Evidence: ethical closing reflection; customer-value statement.
- DAY 24 — Documentation and Approved Process. Evidence: process checklist; no protected document exposed unnecessarily.
- DAY 25 — Pipeline Rescue. Follow up / nurture / requalify / close responsibly. Evidence: pipeline review; actions for selected leads.
- DAY 26 — Personal Closing Plan. Actions, owners, dependencies, dates. Evidence: personal closing plan; Coach review.
- DAY 27 — Mentor Review. Evidence: coaching report; participant acknowledgement; action plan.
- DAY 28 — Recruit and Educate Responsibly. No points for spam recruitment or unsuitable pressure. Evidence: potential recruitment or teaching plan.
- DAY 29 — My Hero Playbook. Evidence: personal Hero playbook; continuation schedule.
- DAY 30 — Final Review and Next Journey. Evidence: final reflection; Coach evaluation; continuation plan; post-programme pathway.

==================================================
## 11. TASK AND EVIDENCE MODEL
==================================================

Task types: learning; reflection; checklist; outreach; lead update; appointment; viewing/presentation; follow-up; Coach meeting; role-play; knowledge check; document submission; closing-plan action; recruitment action; teaching action.

Evidence types: text response; checklist; URL; image; document; audio; video; activity record; lead record; appointment record; Coach observation; system-generated evidence.

Evidence statuses: DRAFT · SUBMITTED · UNDER_REVIEW · APPROVED · REVISION_REQUIRED · REJECTED · WITHDRAWN

Requirements: preserve submission history; record submitter/reviewer/time/task version/comments/revision reason; secure object storage; signed temporary URLs; no public evidence URLs; soft deletion only where authorised; preserve audit metadata.

==================================================
## 12. LEAD AND PIPELINE MODULE
==================================================

Lightweight CRM pipeline within the challenge.

Lead stages: NEW · CONTACTED · ENGAGED · QUALIFIED · APPOINTMENT_SET · PRESENTATION_OR_VIEWING · FOLLOW_UP · NEGOTIATION · CLOSING_PROCESS · CLOSED_WON · CLOSED_LOST · NURTURE · DISQUALIFIED

Lead fields: lead ID; participant owner; country; source; lead category; name or approved identifier; contact information; preferred contact method; project or interest; customer need; budget range where legitimately collected; intended timeframe; current stage; next action; next action date; last contact date; notes; assigned Coach visibility; closing outcome; loss reason; consent/contact-status indicators where required; created date; updated date.

Do not expose one participant's private leads to other participants. Coach visibility limited to authorised assigned participants.

==================================================
## 13. LEAD ACTIVITY
==================================================

Activities: call; message; email; meeting; appointment; presentation; viewing; follow-up; document request; Coach consultation; negotiation; closing update; nurture action.

Each activity supports: date/time; participant; lead; activity type; outcome; notes; next action; next action date; attachment where appropriate; audit metadata.

==================================================
## 14. APPOINTMENT AND VIEWING
==================================================

Appointment status: DRAFT · SCHEDULED · CONFIRMED · COMPLETED · CANCELLED · NO_SHOW · RESCHEDULED
Viewing/presentation status: PLANNED · CONFIRMED · IN_PROGRESS · COMPLETED · FOLLOW_UP_REQUIRED · CANCELLED

Support: date; time; timezone; location or virtual method; linked lead; linked project; preparation checklist; outcome; objections; next action; Coach notes where authorised.

==================================================
## 15. CLOSING RECORD
==================================================

Closing status: NOT_STARTED · PREPARING · DOCUMENTATION · INTERNAL_REVIEW · CUSTOMER_DECISION · COMPLETED · DELAYED · CANCELLED · UNSUCCESSFUL

Closing record contains: linked lead; participant; Coach; country; project/service; start date; current status; required steps; missing items; action owners; expected review date; verified completion date; Coach verification; authorised operational verification where required; notes; audit history.

Do not automatically verify a closing based on participant self-report. Closing verification by an authorised role per configured business rules. Do not display sensitive financial or personal information unnecessarily.

==================================================
## 16. COACHING MODULE
==================================================

Participants access their coaching reports. Fields: participant; Coach; cohort; reporting period; strengths; progress; barriers; pipeline observations; skill observations; culture and SOP observations; agreed actions; due dates; support required; participant acknowledgement; next review date; status.

Lifecycle: DRAFT · SHARED · ACKNOWLEDGED · ACTION_IN_PROGRESS · FOLLOW_UP_REQUIRED · CLOSED

Coach comments professional, specific, linked to observable evidence. No hidden disciplinary scoring.

==================================================
## 17. GAMIFICATION
==================================================

Implement: XP; levels; streaks; badges; milestones; verified leaderboard; team leaderboard; country filters; cohort filters; Mentor Points; recognition events.

Reward: consistency; verified task completion; evidence quality; learning; prospecting; follow-up discipline; coaching participation; SOP and culture behaviour; teamwork; responsible recruitment; teaching and mentoring. Closing may earn recognition, but closing and money must not dominate all scores.

XP uses an append-only points ledger — not only a mutable total. Each transaction: transaction ID; user; source event; points type; amount; reason; status; awarded by; task/object reference; created date; reversal reference where applicable.

Points status: PROVISIONAL · VERIFIED · REVERSED · EXPIRED

Configuration tables for points rules. No hardcoded points in UI components.

==================================================
## 18. LEADERBOARD
==================================================

Show: personal rank; cohort rank; team rank; country rank where enabled; XP; streak; completed days; verified tasks; approved milestones; badges.

Rules: verified XP only; no private customer information; not ranked primarily by commission; no sensitive financial values; weekly/monthly/cohort periods; support ties; leaderboard snapshots; visible scoring rules; authorised suspension of manipulated scores; audit history preserved.

==================================================
## 19. MENTOR POINTS
==================================================

Support the path toward Elite Coach eligibility. Awarded for verified events: introducing a suitable new Warrior; helping a new Warrior complete onboarding; delivering an approved teaching session; supporting a participant milestone; supporting a verified closing; maintaining active coaching records; completing approved Coach development; demonstrating culture, integrity and SOP.

Must not reward: spam recruitment; fake accounts; unsuitable pressure; unverified claims; self-awarded activity; duplicate evidence.

Separate append-only ledger. Elite Coach eligibility requires human review by authorised leadership. The system may calculate eligibility indicators but may not automatically appoint an Elite Coach.

==================================================
## 20. POST-CLOSING JOURNEY
==================================================

CLOSING VERIFIED → reflection → customer-service follow-up → personal playbook update → recruit responsibly → educate a new Warrior → earn verified Mentor Points → prepare for Elite Coach development

Post-closing tasks: closing reflection; lessons learned; customer follow-up; documentation completion; contribution to approved knowledge; recruitment plan; new-Warrior onboarding support; teaching or sharing session; Mentor review.

A participant who has not closed may still begin selected leadership-development activities where authorised.

==================================================
## 21. CORE APPLICATION PAGES
==================================================

PUBLIC: landing page; programme explanation; country selection; language selection; login; invitation acceptance; privacy and programme notices.

PARTICIPANT: Home dashboard; Today; 30-Day Roadmap; Daily Task; Evidence Submission; My Leads; Lead Details; Activity Log; Appointments; Viewings or Presentations; Closing Plan; Coaching Reports; My XP; My Badges; Leaderboard; My Profile; Notifications; Post-Closing Journey; Help and SOP.

ELITE COACH: Coach Dashboard; Assigned Participants; Participant Detail; Submission Review Queue; Evidence Review; Pipeline Overview; Coaching Reports; Appointments and Viewings Overview; Closing Readiness; Inactivity and Risk Flags; Team Leaderboard; Team Reports; Coach Notifications.

MASTER MENTOR: Master Dashboard; Cohort Overview; Coach Performance; Escalated Cases; Country Overview; Programme Progress; Culture and SOP Indicators; Mentor Points Review; Elite Coach Eligibility Review; Programme Announcements; Programme Reports.

SUPER ADMIN: Users; Roles; Countries; Languages; Teams; Cohorts; Curriculum Versions; Challenge Days; Tasks; Evidence Rules; XP Rules; Badges; Mentor Points Rules; Projects; Approved Content; Notifications; Reports; Feature Flags; Audit Events; System Settings.

==================================================
## 22. PARTICIPANT DASHBOARD
==================================================

Show: current challenge day; current phase; today's required action; pending revisions; next follow-up; upcoming appointment; pipeline summary; unread Coach feedback; current XP; streak; badges; leaderboard position; programme progress; next milestone.

Mobile-first, action-oriented. Primary action: **Continue Today's Challenge**.

==================================================
## 23. COACH DASHBOARD
==================================================

Show: assigned participants; readiness approvals; submissions awaiting review; revisions awaiting resubmission; inactive participants; overdue follow-ups; pipeline-stage summary; appointments; viewings; closing-readiness items; coaching reports due; participant milestones; team leaderboard.

Filters: cohort; country; programme day; participant status; activity status; pipeline stage; review status.

==================================================
## 24. REPORTING
==================================================

Participant reports: completion progress; verified activity; learning progress; pipeline progress; appointments; viewings; closing outcome; coaching actions; XP; badges; post-closing development.

Coach reports: participant activation; daily completion; submission review time; pipeline movement; appointment creation; viewing completion; closing progress; inactive participants; coaching follow-up; evidence revision rate.

Programme reports: invitations; onboarding completion; readiness approval; active participation; completion; graduation; withdrawal; daily drop-off; evidence approval; average Coach response; lead creation; stage conversion; appointments; viewings; verified closings; post-closing recruitment; teaching actions; Mentor Points; Malaysia–Indonesia comparison; language usage; culture and SOP indicators.

Print-friendly pages + Markdown/CSV export for MVP. No complex PDF generation in MVP.

==================================================
## 25. NOTIFICATIONS
==================================================

MVP: in-app only. Support: invitation; onboarding incomplete; readiness submitted/approved/revision required; new day unlocked; daily reminder; due soon; task submitted; evidence approved; revision requested; Coach feedback; coaching report shared; appointment reminder; follow-up overdue; streak at risk; badge earned; milestone achieved; closing verification update; post-closing task unlocked; announcement.

Email, WhatsApp and push integrations belong in the future backlog unless an existing approved integration already exists.

==================================================
## 26. LOCALISATION
==================================================

All user-facing strings localisable. Locales: ms-MY · id-ID · en. No user-facing text directly in components without translation keys. Country-specific content via configuration and content versions.

Support: translated navigation; curriculum content; notifications; validation messages; country terminology; timezone-aware dates; locale-aware numbers; currency display where required.

Do not machine-translate approved policy, SOP or regulated content without human approval.

==================================================
## 27. DATABASE MODEL
==================================================

IDENTITY AND ORGANISATION: users; user_profiles; organisations; countries; regions; teams; roles; permissions; user_roles; team_memberships; mentor_relationships.
PROGRAMME: challenge_programs; curriculum_versions; curriculum_phases; curriculum_days; task_definitions; task_requirements; cohorts; cohort_members; enrolments; readiness_checklists; readiness_submissions.
TASK AND EVIDENCE: task_assignments; task_submissions; submission_versions; evidence_assets; evidence_reviews; coach_feedback.
CRM: leads; lead_activities; lead_stage_history; appointments; viewings_presentations; closing_records; closing_steps; closing_verifications.
COACHING: coaching_reports; coaching_actions; participant_acknowledgements; coach_assignments.
GAMIFICATION: xp_rules; points_ledger; levels; badges; user_badges; streaks; leaderboard_snapshots; mentor_point_rules; mentor_points_ledger; coach_eligibility_reviews.
SYSTEM: notifications; notification_preferences; content_translations; country_configurations; feature_flags; audit_events; file_assets; system_settings.

UUIDs unless existing repository standard differs. created_at/updated_at + actor fields. Soft deletion only where appropriate. Never hard-delete audit events or verified points transactions.

==================================================
## 28. WORKFLOW CONFIGURATION
==================================================

Workflow stages and required gates as configurable JSONB where matching approved architecture. Do not spread country/role/workflow conditions across UI components.

Centralise: status definitions; transition rules; required permissions; evidence requirements; country overrides; notification triggers; XP events; approval gates.

Use a service/domain layer for state transitions. No direct arbitrary status updates from the client.

==================================================
## 29. AUDIT EVENTS
==================================================

Immutable append-only audit-event structure. Capture: event ID; timestamp; actor; actor role; country; team; action; entity type; entity ID; previous state; new state; reason; request/correlation ID; metadata; IP/session where appropriate and lawful.

Audit at least: role assignment; Coach assignment; readiness approval; task submission; evidence review; XP award; points reversal; badge award; lead-stage change; closing verification; coaching report sharing; account suspension; curriculum publication; settings change.

==================================================
## 30. SECURITY AND ACCESS
==================================================

Authenticated access; RBAC; object-level access checks; least privilege; country and team scope; secure file handling; signed file URLs; input validation; server-side permission enforcement; rate limiting where appropriate; session protection; auditability; secrets via environment variables; no secrets in source control.

Participants view only their own private evidence and authorised shared information. Coaches access only assigned participants unless broader authority explicitly assigned. Country Admin access, if later added, remains country-scoped.

==================================================
## 31. UI AND EXPERIENCE
==================================================

Modern, energetic, professional. Feel: motivating; clear; action-oriented; trustworthy; mobile-first; suitable for MY and ID; suitable for new and experienced Warriors.

Avoid: childish visual design; casino-style gamification; excessive animations; money-first messaging; confusing enterprise dashboards for participants; exposing confidential customer details.

Provide: clear progress; one primary action per screen; visible task status; clear evidence requirements; accessible contrast; keyboard support; responsive layouts; loading, empty and error states.

==================================================
## 32. MVP SCOPE
==================================================

MVP MUST INCLUDE: 1 authentication; 2 user profile; 3 country and language; 4 role assignments; 5 teams; 6 Coach assignment; 7 cohorts; 8 onboarding; 9 readiness gate; 10 30-day curriculum; 11 daily task experience; 12 evidence submission; 13 Coach review; 14 XP ledger; 15 badges; 16 leaderboard; 17 lightweight lead pipeline; 18 lead activity; 19 appointments; 20 viewing/presentation records; 21 closing record; 22 coaching reports; 23 in-app notifications; 24 post-closing journey; 25 Mentor Points ledger; 26 participant dashboard; 27 Coach dashboard; 28 basic Master Mentor dashboard; 29 admin curriculum management; 30 basic reporting; 31 audit events; 32 localisation; 33 print and Markdown/CSV export.

DEFER FROM MVP: external certification system; PIL-902–906 implementation; advanced institutional maturity scoring; complex AI automation; AI final decisions; native mobile apps; complex PDF generation; WhatsApp automation; email marketing automation; public social feed; marketplace; complex commission management; accounting; payment gateway; advanced predictive analytics; broad third-party integrations.

==================================================
## 33. FIRST WORKING VERTICAL SLICE
==================================================

1. Admin creates a cohort. 2. Admin assigns an Elite Coach. 3. Participant accepts invitation. 4. Participant completes profile. 5. Selects Malaysia or Indonesia. 6. Selects language. 7. Completes readiness. 8. Coach approves readiness. 9. Day 1 becomes available. 10. Participant views Day 1 content. 11. Completes a task. 12. Submits evidence. 13. Coach reviews. 14. Coach approves or requests revision. 15. Verified XP written to ledger. 16. Participant dashboard updates. 17. Leaderboard updates. 18. All actions appear in audit history.

After tested, expand: complete 30-day curriculum; pipeline; appointments; viewings; closing; coaching reports; post-closing recruitment and teaching; Mentor Points.

==================================================
## 34. IMPLEMENTATION PHASES
==================================================

PHASE 0 — REPOSITORY AUDIT: architecture summary; file tree; reusable modules; missing modules; migration risks; recommended sequence. Do not delete existing work.
PHASE 1 — FOUNDATION: auth integration; profiles; countries; languages; organisations; teams; roles; permissions; Coach assignment; localisation foundation; audit-event foundation.
PHASE 2 — CHALLENGE CORE: programmes; curriculum versions; cohorts; enrolment; onboarding; readiness; daily roadmap; tasks; evidence; Coach review; in-app notifications.
PHASE 3 — CRM AND CLOSING: leads; stages; activities; appointments; viewings; follow-up; closing records; verification.
PHASE 4 — COACHING AND GAMIFICATION: coaching reports; actions; XP ledger; levels; badges; streaks; leaderboard; Mentor Points; Elite Coach eligibility review; post-closing journey.
PHASE 5 — ADMIN, REPORTING AND RELEASE: curriculum admin; country configuration; reports; exports; feature flags; audit viewer; responsive testing; security review; seed data; deployment documentation.

==================================================
## 35. TESTING
==================================================

Unit tests; state-transition tests; permission tests; integration tests; evidence-review tests; points-ledger tests; country-scope tests; localisation tests; e2e for the first vertical slice.

Critical cases: participant cannot approve own evidence; Coach cannot access unauthorised participants; participant cannot alter verified XP; revision preserves old submission; closing cannot be self-verified; country data does not leak; AI cannot create final approval; locked day cannot be bypassed through the client; status transition requires server permission; leaderboard uses verified points; audit event created for material decisions; curriculum version remains stable after cohort starts.

==================================================
## 36. SEED DATA
==================================================

Malaysia; Indonesia; ms-MY; id-ID; en; one Super Admin; one Master Mentor; two Elite Coaches; six Participants; one Malaysia cohort; one Indonesia cohort; editable 30-Day Seed Curriculum v1; sample leads; tasks; evidence; coaching reports; XP transactions; badges; Mentor Points. Fictional data only.

==================================================
## 37. REQUIRED DELIVERABLES
==================================================

1 architecture document; 2 database schema; 3 migrations; 4 role and permission matrix; 5 workflow state-machine specification; 6 country and localisation configuration; 7 API/server-action contracts; 8 participant pages; 9 Coach pages; 10 Master Mentor pages; 11 Admin pages; 12 reusable components; 13 test suite; 14 seed data; 15 environment example file; 16 setup instructions; 17 deployment instructions; 18 module README; 19 known limitations; 20 future backlog.

==================================================
## 38. DEVELOPMENT RULES
==================================================

Reuse existing architecture. No second application for Indonesia. Do not hardcode Kamal into permission logic. Do not hardcode curriculum text into page components. Do not hardcode XP rules into UI. No unrestricted client state changes. Do not delete historical submissions. Do not delete audit records. No customer information in leaderboards. AI makes no final decisions. No deferred features during MVP. Record new ideas in the backlog. Typed, modular code. Clear error handling. Comments only for non-obvious domain logic. Migration and rollback instructions. Feature flags for incomplete modules. Preserve existing working functionality.

==================================================
## 39. DEFINITION OF DONE
==================================================

MVP ready for controlled staging when: participant can onboard; country and language work; Coach can be assigned; readiness can be approved; 30-day roadmap works; tasks submit; evidence reviewed; revisions requested; verified XP works; leaderboard works; leads managed; appointments and viewings recorded; closing submitted and verified; coaching reports shared; post-closing actions work; Mentor Points traceable; roles and permissions enforced; audit records exist; MY and ID configuration works; mobile layouts work; critical automated tests pass; no Critical security issue remains; staging deployment instructions complete.

==================================================
## 40. FIRST RESPONSE PROTOCOL
==================================================

Do not immediately generate the entire application. First respond with: 1 repository findings; 2 current stack; 3 reusable components; 4 proposed final folder structure; 5 proposed database changes; 6 state machines; 7 first vertical-slice implementation sequence; 8 files to be created; 9 files to be modified; 10 risks and assumptions; 11 genuinely blocking questions. After presenting the plan, wait for approval before major or destructive changes.
