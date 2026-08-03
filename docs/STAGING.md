# Staging environment

**Production** — https://hero.iqiaggroup.com (Worker `ag-warriors-hero`, live Supabase, real warriors)
**Staging** — https://ag-warriors-hero-staging.iqiaggroup.workers.dev (Worker `ag-warriors-hero-staging`)

Staging exists so a change can be seen running before it reaches a live cohort.
It is a **separate Worker** and is never mapped to `hero.iqiaggroup.com`.

## How staging is wired today (mock mode)

`app/.env.staging` deliberately sets **empty** Supabase credentials. With no
credentials the app falls back to its built-in mock mode (`src/lib/supabase.ts`
→ `supabaseReady === false`), so staging shows the demo personas and mock data.

That means **staging cannot read or write live warrior data — at all.** It is a
zero-risk playground for layout, copy, navigation and visual checks.

Verified at setup: the staging bundle contains no reference to the production
Supabase project. Re-check any time with:

```bash
cd app && npm run build:staging && grep -c zlbyfgfublqlrsqohvsn dist/assets/*.js
```

`0` (or "no match") means staging is still safely isolated.

> Why this matters: `.env.local` holds the production credentials and Vite loads
> it in *every* mode. `.env.staging` exists to override it. Do not delete it.

## Deploying

```bash
cd app && npm run deploy:staging
```

Builds in staging mode (typecheck included) and deploys the staging Worker.
Production is untouched — it deploys only from a push to `main` via Workers Builds.

## Normal workflow

1. Make the change locally, `npm run dev`.
2. `npm run deploy:staging` → open the staging URL, click through it.
3. Happy? Commit and push to `main` → production deploys automatically.

## Upgrading staging to a full environment (optional, later)

Mock mode covers UI regressions but not database behaviour (RLS, RPCs,
migrations). To test those safely, give staging its **own** Supabase project —
never point it at production.

1. Create a second Supabase project (free tier is fine), e.g. `ag-warriors-hero-staging`.
2. In its SQL Editor run, **in this order**:
   `schema.sql` → `002_challenge.sql` → `003_challenge_rpc.sql` →
   `004_curriculum_v1.sql` → `005_notifications_editor.sql` →
   `006_coaching_reports.sql` → `007_challenge_crm.sql` →
   `008_post_closing.sql` → `009_invitations.sql` →
   `010_badges_streaks.sql` → `012_role_delegation.sql`
   (skip `011_launch_day.sql` — it is production launch-day data, not schema)
3. Put that project's URL + anon key into `app/.env.staging`.
4. `npm run deploy:staging`.

After step 3 the safety grep above will legitimately change — staging then points
at the *staging* project id, which must never be the production id
`zlbyfgfublqlrsqohvsn`.

## Rollback (production)

If a bad build reaches production: `git revert <commit> && git push` — Workers
Builds redeploys the previous state. For an instant rollback, Cloudflare
Dashboard → Workers → `ag-warriors-hero` → Deployments → roll back to a prior
version.
