# Kamal AG Sessions — Hero administers kamalag.com/sesi

Hero can create / edit / archive the career-conversation sessions shown on
**kamalag.com/sesi**. Those sessions live in **kamalag.com's own Supabase
project** (`onmfdbalkmcovkwtmanv`), not Hero's — so Hero reaches them through
the worker, which holds the kamalag service key. Every query is hard-scoped to
`captain_id = 'kamalag.com'`; this feature can never touch another captain.

## Pieces
- **Worker:** `worker/src/kamalagSessions.js` → route `POST /kamalag/sessions`
  (registered in `worker/src/index.js`). Actions: `list`, `create`, `update`,
  `archive`, `delete`, `registrations`, `regen_code`. Admin-only (verifies the
  caller's Hero JWT → `profiles.role` in `master_admin` / `country_admin`).
- **Frontend:** `app/src/modules/events/KamalagSessions.tsx`, mounted in the
  Admin hub (`app/src/pages/Admin.tsx`) as **Team → Kamal AG Sessions**.
- **kamalag side:** `kamalag.com/sesi` reads its own project (unchanged);
  `kamalag.com/sesi-admin` now shows a "manage in Hero" hand-off (with
  `?legacy=1` fallback to the classic manager).

## Config — ONE secret to set before it works
```
# worker vars (already committed in wrangler.jsonc):
KAMALAG_SUPABASE_URL = https://onmfdbalkmcovkwtmanv.supabase.co

# secret — set once (kamalag project service_role key,
# from Supabase dashboard → onmfdbalkmcovkwtmanv → Settings → API):
cd worker
npx wrangler secret put KAMALAG_SERVICE_KEY
```
Until the secret is set, the endpoint replies `501 not configured` and the
screen shows the error — nothing else breaks.

## Deploy
```
cd worker && npx wrangler deploy         # ship the worker route
cd ../app && npm run build               # then deploy the app the usual way
```
The endpoint returns `403 admin only` for non-admins and `501` if the secret is
missing — safe to deploy before the secret is set.
