# 🦅 IQI AG Warriors — Combined Super-App

### Blueprint & Single Source of Truth

> **Become Better. Build Better. Give Better.**
> One app to run the whole team and every sale — across Malaysia and Indonesia — built on the AG culture.

* **Owner:** Kamal AG
* **Created:** 1 August 2026
* **Status:** Design locked → database next
* **Stack:** Supabase (database, auth, storage) + Cloudflare (hosting + integration worker)
* **Live for now:** `ren.iqiaggroup.com` (both countries) — new domain later

---

## 1. Why this exists

Kamal runs two IQI AG Warriors PWAs:

* 🇲🇾 **Malaysia** — `ren.iqiaggroup.com` (the newer, more advanced version)
* 🇮🇩 **Indonesia** — `agen.iqiindonesia.id` (an earlier copy that fell behind)

They are ~90% the same app but have drifted apart, and each is built on a fragile PHP + JSON-file stack that is hard to change. Meanwhile the team is **missing the one thing that matters most: a real sales pipeline** to move a deal from first call to closing.

This project **combines both apps into one country-aware platform** on a proper modern stack, adds the missing Sales engine, and gives Kamal **one complete admin backend** — so he never edits a file by hand again, and one improvement reaches both countries at once.

*(This replaces a months-long ChatGPT detour that produced ~75 fake "governance documents" and zero working software. The real vision was always in the Obsidian "AG Brain" vault: the mission above + the Real Estate Playbook sales stages below.)*

---

## 2. The core idea — "One Brain, Two Doors"

**One codebase, one database, one place to improve.** The engine (all the features, all the code) is shared. Only the *content and settings* change per country. A single field on each account — `country = MY` or `country = ID` — decides everything that agent sees.

```
                 ┌─────────────────────────────┐
                 │   ONE PLATFORM (one code)   │
                 │   Supabase + Cloudflare     │
                 └──────────────┬──────────────┘
                                │  reads each agent's country + role
                ┌───────────────┴───────────────┐
        🇲🇾 Malaysia agent                 🇮🇩 Indonesia agent
        • English (BM optional)          • Indonesian (EN available)
        • RM, MY tax, MY ranks           • IDR, ID tax, ID ranks
        • MY rewards / projects          • ID rewards / projects
        • MY GHL account                 • ID GHL account
```

Both familiar web addresses stay as "front doors," but behind them is **one system**. Fix a bug once → fixed for both. Change a Malaysian reward → Indonesia untouched.

**Build strategy:** the merged app is built on the **Malaysia base** (it is the newer branch), then Indonesia's language pack and its `marketing4u` caller tool are folded in.

---

## 3. Country model

* Every account has an **editable `country` field** — this is the single source of truth (not the URL, not the phone number).
* At registration, country is **pre-filled from the phone prefix**: `+60 → Malaysia`, `+62 → Indonesia`. The agent confirms it.
* **Admin can change an agent's country to anything, anytime** — this handles real cases like *a Malaysian phone number working in Indonesia*.
* An agent **only ever sees their own country's data** — enforced by the database itself (Row Level Security), not just hidden on screen.

---

## 4. Language model

| Country | Default language | Also available |
|---|---|---|
| 🇲🇾 Malaysia | **English** | Bahasa Melayu (optional), plus personal toggle |
| 🇮🇩 Indonesia | **Bahasa Indonesia** | English |

* **English is available everywhere.**
* Every piece of text lives in language files (`en` / `id` / `bm`) so wording can be fixed or translated any time without touching code.
* Each agent can switch their own language; the country just sets the default.

---

## 5. Roles & access model

Everyone logs in and actively uses the system. Admin is **not one big switch** — it is a set of roles Kamal hands out.

| Role | Sees / controls |
|---|---|
| **Master Admin** (Kamal) | Everything, both countries. Hands out all other roles. |
| **Country Admin** | One country (🇲🇾 or 🇮🇩) — all its agents, content & settings. |
| **Module Admin** *(delegated)* | Only one area — e.g. **Caller Admin**, Rewards Admin, Content Admin. Master/Country admin chooses who. |
| **Leader** | Only **their own team's** numbers (via the existing `leaderId` link). |
| **Agent** | Their own data only. |

> **Example:** Kamal can make one person the **Caller Admin for Malaysia** — able to manage the caller/lead system and nothing else — completely separate from the main system admins.

---

## 6. The app — 5 zones

The old app was a flat list of numbered modules. The new app groups everything into **5 clear zones**. Every existing feature lands in one.

### 🌅 Zone 1 — My Day
*The screen an agent opens every morning.*
* Morning planning / time-boxing (old **M5**)
* Today's tasks + check-ins + streak
* My dashboard: completion ring, points, level, 7-day chart
* Notifications
* **Onboarding gate** (old **M1**) for new agents before the rest unlocks

### 💰 Zone 2 — Sales ⭐ *(the new heart)*
*Follows the real AG Real Estate Playbook.*
* **Pipeline:** `Calling → Follow-Up → Appointment → Booking → Loan Approval → Closed` — every deal, what's stuck, what's closing
* Caller: phonebook, cold/warm/hot scripts, call logging (old **M6**)
* Projects + EXSIM document generator (old **M4**)
* Commission / income calculator (old **M11**) — **currency & tax now per country**
* Capture leads on the go

### 🎯 Zone 3 — Leads
* Leads flow in (GHL, the **marketing4u** caller engine, buyer masterlist)
* Auto-assigned / routed to agents
* Disposition tracking feeds the Sales pipeline
* Booth / roadshow lead capture (old **M7**)

### 👥 Zone 4 — Team
* Leaderboards & points
* **Elite team → "Captain" title** (see §8)
* Career path ladder REN→L→TL→HOT→TM→VP (old **M8**)
* Project Support Teams (old **M10**)
* Directory (old **Directory**)
* Win Poster studio — leadership (old **Win Poster**)
* Announcements & push / komunikasi
* Leader Mode (a leader sees only their own team)

### 🌱 Zone 5 — Grow
* AG Academy — playbook, training, the **30-Day Closing Challenge** (from AG Brain)
* Social media coaching & captions (old **M2**)
* ATLAS resource library (old **M3**)
* Rewards "Ganjaran 2026" (old **M9**) — **country-scoped**

---

## 7. The complete admin backend

One console replaces every scattered admin control and all hand-editing of files. Access is governed by the roles in §5.

| Section | What Kamal (or a delegated admin) manages |
|---|---|
| **People** | Add / approve agents & leaders, assign teams, set roles, **set country**, reset logins |
| **Sales oversight** | Every deal across every agent, full pipeline board, closings, commission totals, targets |
| **Leads / Caller** | Import & route leads, watch dispositions, **caller-admin can be delegated to different people** |
| **Activity monitor** | Every agent's daily planning & completion, live |
| **Content** | Projects, ATLAS, directory, announcements, quotes, social templates, academy content, win-poster brands |
| **Rewards** | Campaigns + qualifying projects, per country |
| **Elite / Captain** | Select agents into the Elite team, set the "Captain" title |
| **Career & Teams** | Career ladder thresholds, support-team approvals |
| **Country Settings** | **Currency, tax rate, number format, default language, GHL account** — per country |
| **Reports & export** | Leaderboards, team & sales performance, CSV / Excel export |

---

## 8. Elite / Captain model

* Career ranks are a real ladder: **REN → L → TL → HOT → TM → VP**.
* **Elite is a separate selection** — Kamal can pick *anyone* (REN/L/TL/HOT) into the Elite team.
* Once selected, that agent's name displays as **"Captain [Name]."**
* So *Captain* is a **title the app adds automatically** when someone is flagged Elite — not a rank they climb to.
* **Pay model:** one unified Malaysian model (revised & improved) for both countries — replacing Indonesia's older simpler model.

---

## 9. Country-scoped settings (fixes a live bug)

These become **admin settings per country**, not hard-coded:

* **Currency** — RM (Malaysia) / Rp·IDR (Indonesia)
* **Tax** — e.g. Malaysian SST 8% / Indonesian rate
* **Number & date format**
* **Default language**
* **GHL account** (each country its own location/token)
* **Career-ladder thresholds** (RM scale vs IDR scale)
* **Rewards & projects** content

> 🐞 **Live bug this fixes:** the Indonesia app's income/commission calculator currently still shows **Malaysian Ringgit and 8% Malaysian tax** (the currency was never fully converted). Making currency & tax a country setting fixes this permanently.

---

## 10. Technology

| Old (both apps) | New |
|---|---|
| `ghl-proxy.php` / `proxy.php` (~113 actions) | **Cloudflare Worker** — the bridge to GHL / WhatsApp |
| JSON files in `data/` | **Supabase Postgres** — a real database |
| Phone + password in `agents.json` | **Supabase Auth** — secure, with reset |
| Manual JSON file editing | **The admin backend** |
| PHP hosting (Bluehost/FastComet) | **Cloudflare Pages** — fast, global, free-tier friendly |
| Country by separate deployment | **One deployment, country as a data field** |

* **Security by design:** the database enforces that agents see only their country + their own data (and leaders only their team). The GHL token is **kept the same** but stored in a locked server setting, never in a readable file.
* **PWA stays:** still installable on phones, still works offline where it does today.

---

## 11. Data migration

The old JSON stores map cleanly to Postgres tables, all tagged by `country`:

`agents.json` → **users** (with `country`, `role`, `leader_id`, `career_rank`, `is_elite`, `captain_name`)
day-plan files → **daily_plans / tasks** · `points`/`lead_points` → **points** · `booths`/`booth_leads` → **booths / booth_leads** · `rewards`/`reward_*` → **rewards / reward_projects / reward_targets** (country-scoped) · `career_ladder` → **career_ranks** (country thresholds) · `support_teams` → **support_teams** · `directory` → **directory** · `notifications` → **notifications** · `content/*` → **content** · `income` → **income_saves** · **+ NEW: `deals` (the sales pipeline)**.

Existing agents keep their accounts (migrated with their country set); their history carries over.

---

## 12. Known issues to clean up during the merge

* 🇮🇩 Income calculator shows RM + Malaysian tax → fixed by country settings (§9).
* 🇮🇩 Rewards currently show Malaysia's campaigns (leftover test) → set Indonesia's own from admin.
* Elite pay model & rank set differ between countries → unify to the Malaysian model.
* Hard-coded domains (`ren.iqiaggroup.com` / `agen.iqiindonesia.id`) scattered in code → replaced by one country-derived setting.
* Stale `ren-warriors/ghl-proxy.php` holds the GHL token in plain text → remove the file (token itself is kept, just stored safely).

---

## 13. Build roadmap (phases)

1. **Phase 0 — Foundation:** Supabase project + database schema (country-aware, RLS by country & role) + Cloudflare setup.
2. **Phase 1 — Auth & People:** login/register (phone or email, country pre-fill), migrate existing agents, roles, admin People section.
3. **Phase 2 — Rebuild core zones on the new stack:** My Day, Team, Grow (port existing modules).
4. **Phase 3 — Sales engine (new):** the pipeline + caller + commission.
5. **Phase 4 — Leads engine:** marketing4u / GHL lead routing.
6. **Phase 5 — Complete admin backend + Country Settings.**
7. **Phase 6 — Go live** on `ren.iqiaggroup.com`, migrate both countries; new domain later.

---

## 14. Locked decisions (quick reference)

1. One codebase + one database; built on the **Malaysia base**.
2. Both countries under **ren.iqiaggroup.com** for now; new domain later.
3. **Country = editable account field**; phone prefix only pre-fills it.
4. Language: MY→English (BM optional), ID→Indonesian; English everywhere; personal toggle.
5. Everyone logs in: agent · leader (own team) · country admin · master admin — **with delegable module-admin roles** (e.g. Caller Admin).
6. **5 zones** + **one complete admin backend** (absorbs all old admin + caller).
7. **Currency / tax / formats = per-country admin settings.**
8. **Rewards = country-scoped, admin-managed.**
9. **Elite = overlay → "Captain [Name]"**, unified Malaysian pay model.
10. **GHL token kept the same**, stored safely.

---

*This document is the single source of truth. Update it as decisions change.*
