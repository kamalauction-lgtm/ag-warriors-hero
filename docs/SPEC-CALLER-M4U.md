# Caller / Marketing4U — Complete Function Spec (source of truth for the merge)

*Extracted 1 Aug 2026 from the real code: `caller (2).zip` (MY, ren.iqiaggroup.com/caller) + `marketing4u (5).zip` (ID, agen.iqiindonesia.id/marketing4u). Both share ONE MySQL DB. Core engines byte-identical; drift = language, team scoping, config. ALL of this must survive in the super-app, country-aware.*

## 1. Data model (→ Supabase tables, all + `country`)
- **agents**: name, phone, email (unique, login key), password bcrypt, role `caller|admin` (`lead` unused), status `pending|active|paused`, approved_by, team MY/ID
- **properties** (projects/campaigns): name, team, ad_source (magic `__unassigned__` = triage bucket), type `property|recruitment|other` (drives disposition set), description
- **agent_property** grants: `approved` (admin, sticky) + `active` (agent toggle) + requested_at/approved_at — **leads flow only when approved=1 AND active=1**
- **leads**: ghl_contact_id (unique), ghl_opportunity_id, property_id, phone, **phone_norm (dedupe key)**, name, received_at, custom_fields JSON, current_label, **attempt_count (No-Answer only)**, status `pool|assigned|locked|dead`, owner_agent_id (forever-owner), reserved_for_agent_id + reserved_until, cooldown_until, assigned_to + assigned_until, ghl_sync_pending + ghl_pending_label, updated_at = **queue order key**
- **lead_properties** multi-interest (+ added_while_locked → "multi-booked" KPI)
- **call_attempts** append-only: lead, agent, called_at, disposition (English key), note, attempt_no
- **webhook_log**: every inbound request, result ∈ inserted|multi_interest|multi_revived|multi_locked|duplicate_ignored|unmapped_triage|rejected_auth|bad_payload|error
- **pipeline_map**: ghl_pipeline_id (unique) → property; has_called_stage flag (m4u)
- **field_settings** custom-field builder: field_key, label, visible_to_agent, aliases (comma), sort_order. Seed: usia(hidden), trigger_beli, rencana_bayar, budget_cicilan, domisili, waktu_survey
- **bop_sessions**: team, type `online|physical`, title, starts_at, link/location/map_url, notes, active, created_by
- **bop_roster**: session+lead unique, caller_id, attended `pending|attended|no_show`, joined + joined_at, confirmed_at
- **password_resets**: code_hash (6-digit OTP, 10 min, 5 attempts) + token_hash (admin magic link, 24 h)
- **lead_notes** admin↔agent threads: lead_id nullable (NULL = bucket msg), parent_id, author, target_agent_id, bucket_label, requires_response, resolved_at
- **quotes**: body, author, active, team

## 2. Agent flow
PWA + bottom tabs **Home · Follow-ups · Booked · Projects · Messages(badge) · Guide** (+Admin). Home: greeting, random team quote, stats (calls today / booked today / leads owned), held-lead restore, big **Get Next Lead**. Mascots (home/paused/call). Onboarding = printable guide (install steps, how-to-call, outcome table). Projects = self-select with Pending-approval / Active / Approved-inactive badges. Follow-ups = my reserved leads (callback 8 h / referral 72 h). Booked = my locked leads forever. Messages = admin Q&A inbox; agent reply resolves the thread.

## 3. Lead card
Server-rendered; countdown **server-computed seconds** (25 min hold, warn ≤120 s, auto-return + maybe pause at 0). Name+project+label pill (pill class from English label). Badges: `waktu_survey` contains "minggu ini" → 🔥 HOT; "lihat-lihat" → 🌱 Nurture; "Also interested: X" chips. Custom-field rows (visible_to_agent only, alias matching, empty hidden). Project description. Pinned unresolved admin notes. tel: + wa.me buttons (wa prefilled greeting). Last-3 call history. Booked reveals lock-warning confirm + referral script tip.

## 4. DispositionEngine — THE CORE (config values)
EXPIRY_MINUTES=25 · NO_ANSWER_CAP=10 · AUTO_REACTIVATE=true

**Property projects:** Booked→LOCK forever (owner). No Answer→pool, attempt+1, cooldown **20 min**; cap 10 → dead `Unreachable`. Call Back Later→pool, **reserve to me 8 h** (NO cooldown — reserve wins over cooldown). Interested Not Ready→`Warm`, cooldown **48 h**. Not Interested→cooldown **48 h**. Wrong Number→cooldown **72 h**.

**Recruitment projects:** Attend Online/Physical BOP→LOCK + label BOP Online/Physical + roster upsert + outbound BOP webhook (region, lead, session, caller). Link Referral Sent→**reserve 72 h**. Call Back Later→reserve 8 h. Working Full-Time→cooldown **30 days**. Wrong Number / Not a Real Number→**dead immediately**.

Apply = row-lock transaction; ownership gate (assigned_to=me AND status=assigned else **409 conflict** → UI auto-fetches next); reset all pointers then apply rule; append call_attempts; updated_at=NOW() (back of queue). GHL writeback AFTER commit, failure → ghl_sync_pending flag (never blocks).

## 5. Assignment — pull-based queue
Not round-robin, no caps/fairness. Active agents only; **one live lead at a time** (re-serves held lead, `resumed`). Selector: status=pool, cooldown passed, (unreserved OR mine OR reservation lapsed), agent has approved+active grant on primary OR any multi-interest project, team-scoped, **ORDER BY updated_at ASC LIMIT 1 FOR UPDATE** (→ Postgres: SKIP LOCKED). HOT badge does NOT jump queue (hook: priority column). Assign 25-min hold.

## 6. Time rules / cron
- **Expiry sweep** (cron */5 min + every page load): lapsed holds → back to pool unchanged; holder → **status=paused** (admins exempt). Paused screen + "Request to Continue" → instant reactivate (AUTO_REACTIVATE).
- **sync_ghl** (*/10 min): PULL contacts (paged ≤50×100) upsert by contact id, property via tags/utmCampaign vs ad_source else triage; RECONCILE: retry pending GHL writebacks (≤500).
- **selftest.php**: full regression suite (cap, races, dedupe, gates) — port as tests.

## 7. Webhook intake (leads IN)
POST only; secret via `X-Webhook-Secret` OR `?key=` (hash_equals); every request logged. m4u extra: URL query params merged as fallback payload keys (per-pipeline `?pipeline_id=` pinning). Extraction: dotted-path candidates for contact/opportunity/pipeline/name/phone. **normalize_phone**: keep `+`/`00`→`+`; bare 60/62→`+`; leading 0→`+CC` (CC=60 MY / 62 ID); else `+CC`+digits. Pipeline→property via pipeline_map (id then name) else triage. **Dedupe by phone_norm** (row-locked): new→insert (`New`, pool, attempt 0); same property→duplicate_ignored; new property + locked→multi_locked (keep owner); + dead→**multi_revived** (revive to pool, KEEP attempt_count); + pool/assigned→multi_interest. Custom fields: collect from customData/custom_fields/… object or rows + flattened keys, reserved keys excluded; merge = new non-empty wins, never drop.

## 8. GHL writeback
v2 LeadConnector, Private Integration token, stub mode when GHL_LIVE=false. **Every disposition → contact tag `M4U: <label>`**. Stage moves only for: Booked→'Appointment Booked', BOP Online→'Online BOP', BOP Physical→'Physical BOP' (stage NAME resolved case-insensitively across pipelines, cached; unresolvable → skip move, tag still lands). Reads: contact, pipelines (admin screen), contacts list (sync). Outbound: postWebhook to GHL workflow inbound-webhook URL for BOP confirmations (GHL_BOP_WEBHOOK, per region).

## 9. Admin suite (all team-scoped, CSRF, flash)
- **Dashboard**: pending regs, active/paused, pool/assigned/locked/dead, calls today + alert tiles (GHL pending, Triage, Project requests, Unmapped pipelines, Multi-booked, Webhooks today); queue-by-label bars; attempt distribution; dead list w/ Revive.
- **Agents**: create/approve(+grants)/reject/pause/reactivate/edit/delete(blocked for admins); authoritative grant editor; approve/deny per-project self-requests; **reset password** = emailed 24 h magic link, fallback 8-hex temp password.
- **Leads**: search q/status/property, 30/page; per-row Manage: Revive (dead only, full reset), Release ownership, Return to pool, **Reassign = 24 h soft-reserve** (never locked leads), Set project (triage fix). No bulk.
- **lead_history**: full attempts timeline.
- **Pipelines**: fetch from GHL (upsert), add manual, map to project, delete; unmapped-first + triage pill (+CALLED-stage warning m4u).
- **Properties**: CRUD name/ad_source/type/region/description; counts.
- **Fields**: custom-field builder (key, label, aliases, sort, agent-visible) — remap FB/GHL fields without code.
- **Import**: Excel/CSV ≤5000 rows, pure-PHP xlsx/csv parser, huge header-synonym lists (BM+EN+ID), **rows funnel through the SAME webhook intake** (identical dedupe); template download; result KPIs.
- **Quotes**: team-scoped CRUD.
- **Reports (Sales)**: range, calls/bookings/conversion KPIs, outcome doughnut, top-10 agents bar, awards leaderboard 🥇, **per-agent×disposition pivot with every cell drilling into audit.php**, conversion bars, per-project stats.
- **BOP (Recruit)**: sessions CRUD (online link / physical venue+map), upcoming/past, roster w/ attended/no-show/**JOINED** marking + CSV export; report = funnel Dihubungi→Ditempah→Hadir→Sertai, show-rate, weekly trend, recruiter leaderboard with quality flag (booked≥10 & show<25%).
- **Audit**: drill-down ≤500 attempts by agent/dispo/range; bucket + per-lead admin↔agent threads with requires-response; Recall/Assign/History per row.

## 10. Auth & roles
Register (public) → status pending + project requests → admin approves. Login: pending blocked, paused allowed (paused screen). Roles effectively caller|admin only. OTP forgot-password (email 6-digit) + admin magic link. Sessions server-checked each request; CSRF everywhere. SMTP client built-in (MY configured; ID falls back to mail()).

## 11. Country model (to keep)
team on agents/properties/bop_sessions/quotes; newer team.php: MY sees team='MY', ID sees team='ID' OR NULL. Default CC 60/62. Languages: MY = EN/MS toggle (cookie, EN default) + light/dark theme; ID = Indonesian. **INVARIANT: disposition keys, labels, statuses, GHL tags stay ENGLISH in the DB — translate display only.** time_ago() is hardcoded Indonesian — fix in rebuild. APP_TZ quirk: both Asia/Jakarta; MY should become Asia/Kuala_Lumpur.

## 12. Warriors PWA bridge (keep working)
Warriors → M4U one-way via the SAME webhook endpoint: `m4u_forward_lead()` posts {name, phone, pipeline_name/id, contact_id, opportunity_id, source} with secret in header AND ?key=. Triggers: (1) cron escalate.php every minute — remind at 5 min, pool at 25 min → forward `source=warriors_pool`; (2) Warriors setLeadStatus non-new/non-booked → forward `source=warriors_disposition`, **exactly-once via m4uAt stamp**. Config lives in Warriors ghl_config (m4uUrl, m4uSecret) editable in elite admin GHL modal. Merged app: Supabase Edge Function accepting the identical payload + auth; keep `source` attribution + exactly-once guard.

## Rebuild invariants
1. Row-lock transactions on assignment/disposition/expiry/dedupe (Postgres: FOR UPDATE SKIP LOCKED).
2. English keys in DB are load-bearing (engine joins, pill CSS, GHL tags, reports pivot).
3. updated_at = queue position; any touch re-dates to back of queue.
4. Webhook and Excel import share one intake path.
5. Pull-based: no quotas, no fairness; pause-on-expiry is the only enforcement.
