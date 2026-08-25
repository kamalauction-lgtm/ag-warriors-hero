/* ============================================================
   kamalagSessions.js — Hero administers kamalag.com's /sesi sessions
   ------------------------------------------------------------
   kamalag.com/sesi has its OWN Supabase project (the source of
   truth). This lets a Hero admin create / edit / archive those
   sessions from inside the super app, WITHOUT giving the browser
   the kamalag service key — the key lives only here, in the worker.

   Hard rules:
   - EVERY query is scoped to captain_id = 'kamalag.com'. This endpoint
     can never touch another captain's data.
   - Caller must be a Hero admin (master_admin / country_admin),
     verified against Hero's own project via their JWT.
   - Reachable only over POST (Hero's CORS allows POST + OPTIONS).

   Config (worker):
     vars.KAMALAG_SUPABASE_URL   = https://onmfdbalkmcovkwtmanv.supabase.co
     secret KAMALAG_SERVICE_KEY  = <kamalag project service_role key>
   ============================================================ */

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const CAPTAIN = 'kamalag.com'

/* columns a Hero admin may write (captain_id / id are never accepted) */
const WRITABLE = [
  'session_date', 'start_time', 'end_time', 'title', 'note',
  'meeting_type', 'meet_link', 'location_name', 'address', 'map_link',
]

/* ---- kamalag project REST (service key — server side only) ---- */
async function kam(env, path, init = {}) {
  const res = await fetch(`${env.KAMALAG_SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.KAMALAG_SERVICE_KEY,
      Authorization: `Bearer ${env.KAMALAG_SERVICE_KEY}`,
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
}

/* ---- verify the caller is a Hero admin (Hero's own project) ---- */
async function verifyAdmin(env, jwt) {
  if (!jwt) return { ok: false }
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return { ok: false }
  const id = (await who.json())?.id
  if (!id) return { ok: false }
  const prof = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?select=role,country&id=eq.${id}`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  )
  const row = prof.ok ? (await prof.json())?.[0] : null
  const role = row?.role
  const isAdmin = role === 'master_admin' || role === 'country_admin'
  return { ok: isAdmin, role, country: row?.country }
}

/* keep only writable fields; trim strings; empty → null */
function clean(body) {
  const out = {}
  for (const k of WRITABLE) {
    if (body[k] === undefined) continue
    let v = body[k]
    if (typeof v === 'string') { v = v.trim(); if (v === '') v = null }
    out[k] = v
  }
  return out
}

function code4() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]
  return s
}

export async function handleKamalagSessions(request, env, cors = {}) {
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })

  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  if (!env.KAMALAG_SUPABASE_URL || !env.KAMALAG_SERVICE_KEY)
    return reply({ error: 'kamalag project not configured (KAMALAG_SUPABASE_URL / KAMALAG_SERVICE_KEY)' }, 501)

  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  const gate = await verifyAdmin(env, jwt)
  if (!gate.ok) return reply({ error: 'admin only' }, 403)

  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const action = String(body?.action || '')
  const scope = `captain_id=eq.${encodeURIComponent(CAPTAIN)}`

  try {
    /* ---- list every session + its sign-up count ---- */
    if (action === 'list') {
      const s = await kam(env, `/ag_sessions?${scope}&order=session_date.asc,start_time.asc`)
      if (!s.ok) return reply({ error: 'load failed', detail: s.body }, 502)
      const r = await kam(env, `/ag_session_registrations?${scope}&select=session_id`)
      const counts = {}
      ;(r.body || []).forEach((x) => { counts[x.session_id] = (counts[x.session_id] || 0) + 1 })
      return reply({ sessions: s.body || [], counts })
    }

    /* ---- attendees for one session ---- */
    if (action === 'registrations') {
      const id = parseInt(body.id, 10)
      if (!id) return reply({ error: 'id required' }, 400)
      const r = await kam(env, `/ag_session_registrations?${scope}&session_id=eq.${id}&order=created_at.desc`)
      if (!r.ok) return reply({ error: 'load failed', detail: r.body }, 502)
      return reply({ registrations: r.body || [] })
    }

    /* ---- create a new session ---- */
    if (action === 'create') {
      const row = clean(body)
      if (!row.session_date || !row.start_time) return reply({ error: 'date and start time required' }, 400)
      row.captain_id = CAPTAIN
      row.is_active = true
      if (!row.title) row.title = 'Career Conversation'
      const ins = await kam(env, `/ag_sessions`, {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
      })
      if (!ins.ok) return reply({ error: 'create failed', detail: ins.body }, 502)
      return reply({ session: ins.body?.[0] || null })
    }

    /* ---- edit an existing session ---- */
    if (action === 'update') {
      const id = parseInt(body.id, 10)
      if (!id) return reply({ error: 'id required' }, 400)
      const row = clean(body)
      const up = await kam(env, `/ag_sessions?id=eq.${id}&${scope}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
      })
      if (!up.ok) return reply({ error: 'update failed', detail: up.body }, 502)
      if (!up.body?.length) return reply({ error: 'not found' }, 404)
      return reply({ session: up.body[0] })
    }

    /* ---- archive (soft delete — keeps sign-ups) ---- */
    if (action === 'archive') {
      const id = parseInt(body.id, 10)
      if (!id) return reply({ error: 'id required' }, 400)
      const up = await kam(env, `/ag_sessions?id=eq.${id}&${scope}`, {
        method: 'PATCH', body: JSON.stringify({ is_active: false }),
      })
      if (!up.ok) return reply({ error: 'archive failed', detail: up.body }, 502)
      return reply({ ok: true })
    }

    /* ---- hard delete (only works if no sign-ups) ---- */
    if (action === 'delete') {
      const id = parseInt(body.id, 10)
      if (!id) return reply({ error: 'id required' }, 400)
      const del = await kam(env, `/ag_sessions?id=eq.${id}&${scope}`, { method: 'DELETE' })
      if (!del.ok) return reply({ error: 'delete failed (has sign-ups? archive instead)', detail: del.body }, 409)
      return reply({ ok: true })
    }

    /* ---- (re)generate the venue check-in QR code ---- */
    if (action === 'regen_code') {
      const id = parseInt(body.id, 10)
      if (!id) return reply({ error: 'id required' }, 400)
      const c = code4()
      const up = await kam(env, `/ag_sessions?id=eq.${id}&${scope}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ checkin_code: c }),
      })
      if (!up.ok || !up.body?.length) return reply({ error: 'code update failed', detail: up.body }, 502)
      return reply({ checkin_code: c })
    }

    return reply({ error: 'unknown action' }, 400)
  } catch (e) {
    return reply({ error: 'server error', detail: String(e) }, 500)
  }
}
