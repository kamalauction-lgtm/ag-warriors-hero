# Ren → Hero Migration Plan — 28 Aug 2026

Shareable version: "Ren to Hero Migration Plan" artifact. Users are already
migrated (49 agents imported 3 Aug; redirect live since 28 Aug). This plan is
module parity + data safety.

## Module map (17 ren modules)

IN HERO ALREADY (12): M1 onboarding→Grow/Onboarding · M2 social→Social
Coaching · M3 ATLAS · M5 timebox→My Day · M6 calling→Caller M4U · M7
booths→Booth Duty · M8 career→/team/career · M9 rewards · M11 income→
/sales/income · Tim Elit + Captain Pool→/team/elite · Win Poster→/team/poster
(now stronger: AI captions + Telegram) · Directory.

GAP — BUILD: **Komunikasi "Command Radio"** (DM / War Room / squads). Nothing
equivalent in Hero. Lean v1 = country War Room + pod squads (from real Elite
pods) + DMs + push on mention; full port adds requires-response threads +
chain-of-command routing.

DECIDED:
- M4 Projects library → BUILT (migration 100, live & tested 19/19). Per-project
  docs/links/instructions, country+grant scoped.
- EXSIM jsPDF doc generator → DROPPED (28 Aug, Kamal). Not ported. If a project
  needs a booking form, an admin uploads the template into the Project Library
  instead of a code generator.
- M10 Project Support → still open: does Hero's Help Request cover it?

RETIRE: old push/notifications/must-see (Hero 064 + templates supersede).

## Data safety (ren data/*.json — server-side, needs Kamal's cPanel zip)

- agents.json: safe (imported 3 Aug) — re-diff for additions since.
- careerpaths/ladder: diff rank assignments vs Hero 062 — no silent downgrades.
- reward_progress/lead_points: carry over if any 2026 campaign still live.
- call_logs/booth_leads/generated/content: archive to Drive unless reporting
  needs import.
- module_progress/notifications: superseded, let go.

## Phases

A. **Data safety** — Kamal zips data/ from BOTH sites → kamal\ren-final-backup\;
   I diff everything vs Hero and report what would be lost. Nothing deleted
   before this says CLEAR.
B. **Komunikasi in Hero** — scope decision, then build (Supabase+RLS, no PHP).
C. **The three "decide" modules** — yes/no each, build survivors.
D. **Delete hosting** — only after A CLEAR + Komunikasi live + ~30 days of
   redirect + final scan CLEAN. Rotate credentials until deletion day.

## Kamal's five decisions

1. Komunikasi: lean v1 or full port?
2. M4 Projects library: BUILT — migration 100, live.
3. EXSIM doc generator: DROPPED (Kamal, 28 Aug) — not ported.
4. M10 support: does Help Request cover it?
5. Old call logs/booth leads: import or archive-and-let-go?
