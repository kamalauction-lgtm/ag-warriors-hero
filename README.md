# AG Warriors Super-App

**Combining the Malaysia (`ren.iqiaggroup.com`) and Indonesia (`agen.iqiindonesia.id`) IQI AG Warriors PWAs into ONE country-aware platform** to manage team + sales, on **Supabase + Cloudflare**.

* **Status:** Design locked (1 Aug 2026) → database schema next
* **Build strategy:** built on the Malaysia app (newer branch); Indonesia language + marketing4u folded in
* **Live for now:** `ren.iqiaggroup.com` (serves both countries); new domain later

## Read this first
📘 **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)** — the single source of truth: vision, the "One Brain, Two Doors" architecture, country & language model, roles, the 5 zones, the complete admin backend, tech stack, data migration, and the build roadmap.

## The idea in one line
One app, one database. A `country` field on each account decides language, currency, ranks, rewards and data. Fix once → both countries get it.

## Key facts
* **Stack:** Supabase (Postgres + Auth + RLS + Storage) + Cloudflare (Pages + a Worker replacing the PHP `ghl-proxy.php`)
* **Roles:** master admin (Kamal) · country admin · delegated module admins (e.g. Caller Admin) · leader (own team) · agent
* **5 zones:** My Day · Sales · Leads · Team · Grow + one complete admin backend
* **Country:** editable account field; phone prefix `+60`/`+62` only pre-fills; admin can override
* **Language:** MY→English (BM optional), ID→Indonesian, English everywhere
* **Elite:** any REN/L/TL/HOT agent selected into Elite → shown as "Captain [Name]"; unified MY pay model

## Source material (this session)
* Malaysia + Indonesia app zips extracted and fully mapped (module inventory, ~113 proxy actions, JSON data shapes, MY-vs-ID differences). Originals: `Downloads/ren.iqiaggroup.zip`, `Downloads/agen.iqiindonesia.zip`.
* Real vision source: Obsidian "AG Brain" vault — `Documents/jar jar binks/20 AG Brain`.

## Next steps
1. Supabase schema (country-aware, RLS by country + role)
2. Cloudflare project setup
3. Auth & People (migrate existing agents)
4. Rebuild zones → add Sales engine → Leads → full admin backend → go live

_See BLUEPRINT.md §13 for the full phased roadmap._
