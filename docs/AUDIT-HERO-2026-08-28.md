# Hero Platform Audit — 28 August 2026

Full-platform review of hero.iqiaggroup.com. Every number was probed live
against production on 28 Aug 2026 (fail-loud reads); the web-property scan ran
`security-incident-2026-08-26/scan_sites.py` the same day. Shareable version:
the "Hero Platform Audit" artifact (same content, designed).

Scoreboard: **1 critical · 6 high · 6 medium · 6 low · 350+ automated tests green.**

## P0 — act today

1. **The old apps are still serving malware.** ren.iqiaggroup.com and
   agen.iqiindonesia.id still carry the injected Monetag script (re-verified
   today). The cleaned index.html files (26 Aug) were never uploaded and the
   hosting credentials were not rotated — the attacker still has write access.
   Since ren is being retired, the best fix is a redirect page to Hero
   (kills malware + migrates users in one step). Team phone-cleanup
   instructions also still need distributing.

## P1 — this week (30 Days flagship is stalled)

2. **Pilot silently failed.** tary: active 23 Aug, 7/7 days auto-marked
   MISSED, 0 submissions, 1 lead. Needs a human decision (outreach / pause /
   restart). Root gap: the pilot observability view was never built.
3. **Zero closing-verification authority.** ch_permissions is empty — nobody
   holds closing.verify for MY or ID, so no closing can ever be verified and
   first_closing can never be awarded. Authority-assignment UI + verifier
   queue (Phase 3 spec) remain unbuilt.
4. **16 CONTENT_REQUIRED curriculum rows** (days 3,4,8,13,16,21,22,24 × MY/ID)
   still empty; content workflow view unbuilt; content.own/review unassigned.
5. **All AI features degraded** — live check: model http 503/quota. Poster
   captions, AG AI Coach, coach briefs, talent reports, social polish all fall
   back. Fix = enable Gemini billing (guide already provided to Kamal).
6. **Poster channels point at the 2-member test groups** — swap chat IDs to
   the real team groups in Command HQ → Poster channels, then Send test.
7. **MY has no invite links** (feature adopted fast: 59 invites day one, but
   ID-only, WhatsApp-only). MY events show no Invite button; no Telegram
   links configured for either country.

## P2 — next sprint

8. **Poster photo**: Hero claims "production removes the background
   automatically" — false in Hero (that was ren). Port the @imgly remover
   (fix its fragility) or re-word + support transparent uploads.
9. **5 pending M4U project requests** await decisions (Pohar/VIVIDZ, Kamal ×2
   from 7 Aug, 2 legacy ID).
10. **11 orphan legacy event sessions** still without an event page.
11. **Events list race**: intermittently renders all events as "no dates yet"
    (misfiles Past as Upcoming); self-corrects on reload — meta query racing
    the events query.
12. **ren→Hero migration for MY agents** now urgent (their daily tools still
    run on the infected app). Needs a planning session: module map + comms.
13. **WhatsApp beyond invites** stays manual-first (GHL is UI-only). The
    tag-on-Joined → approved-template flow is designed, ready to wire on
    request.

## P3 — when quiet

14. Income.tsx:375 rules-of-hooks (crash vector on logout, deferred twice) ·
    probe-mail@agtest.local cleanup · /deletebot the orphaned
    @ag_hero_post_bot · ~2 weeks of shipped work uncommitted in git ·
    1.46 MB single JS chunk (code-split) · Telegram token exposure accepted
    by Kamal (noted, not forgotten).

## Verified healthy

Hero CSP/HSTS (malware script proven blocked) · 30 Days engine (254 tests) ·
M4U approvals (40) · Certificates incl. revoke→replace (39; 0 delivery
failures) · Win Poster publishing (26; 3 real posts; render 1.9 s) · Group
invites (20; 59 sent) · Events/check-in (284 registrations) · Notification
queue (0 failures across 152 templates).
