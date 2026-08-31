/* Events (070) — the server side of the public event pages.
 *
 *  POST /events/notify {country, slug, lead_id, session_id}
 *    called by the public page right after event_register(): verifies the
 *    roster row exists (service key), then
 *      • GHL: upsert the contact in the ONE shared location + tags
 *          country:MY|ID · event:<slug> · event-registered · mode:online|physical
 *          · ref:<agent name> — Kamal's GHL workflows trigger on these tags and
 *          reply from the right WhatsApp number (MY 019-391 8000 · ID 0852-6015-1688)
 *      • the owning agent (referrer / caller) gets an in-app notification → push
 *    idempotent: ghl_sent guards double sends.
 *
 *  sweepNoShows(env) — cron: sessions that ended >2h ago → pending registrants
 *    become no_show, tagged event-noshow in GHL (→ "pick another date" WhatsApp),
 *    and the owning agent is told to follow up. One notification per row.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function rest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  })
  let body = null
  try { body = await res.json() } catch { /* empty */ }
  return { ok: res.ok, status: res.status, body }
}

/* GHL: upsert contact by phone, then add tags. Token/location already live in
   the worker (M4U writeback) — one location serves both countries. */
async function ghlTag(env, { name, phone, email, tags }) {
  if (!env.GHL_TOKEN || !env.GHL_LOCATION_ID) return { skipped: 'no ghl token' }
  const headers = {
    Authorization: `Bearer ${env.GHL_TOKEN}`,
    Version: env.GHL_API_VERSION || '2021-07-28',
    ...JSON_HEADERS,
  }
  const up = await fetch(`${env.GHL_API_BASE || GHL_BASE}/contacts/upsert`, {
    method: 'POST', headers,
    body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID, name, phone, email: email || undefined,
      source: 'hero-event', tags,
    }),
  })
  let body = null
  try { body = await up.json() } catch { /* ignore */ }
  const contactId = body?.contact?.id
  if (!up.ok || !contactId) return { ok: false, status: up.status, body }
  // upsert merges tags in most versions, but add explicitly so it never drops
  await fetch(`${env.GHL_API_BASE || GHL_BASE}/contacts/${contactId}/tags`, {
    method: 'POST', headers, body: JSON.stringify({ tags }),
  }).catch(() => {})
  return { ok: true, contactId }
}

async function notify(env, toAgent, title, body, link) {
  if (!toAgent) return
  await rest(env, '/notifications', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ to_agent: toAgent, type: 'event', title, body, link }),
  })
}

export async function handleEventsNotify(request, env, corsHeaders) {
  const cors = corsHeaders(request)
  const reply = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  let b
  try { b = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const { country, slug, lead_id, session_id } = b || {}
  if (!country || !slug || !lead_id || !session_id) return reply({ error: 'missing fields' }, 400)

  // the roster row must exist — the public page cannot invent one
  const r = await rest(env,
    `/bop_roster?session_id=eq.${session_id}&lead_id=eq.${lead_id}&select=*,bop_sessions!inner(event_id,type,title,starts_at,country,events!inner(slug,title,country)),m4u_leads!inner(name,phone_norm,custom_fields)`)
  const row = r.body?.[0]
  if (!row) return reply({ error: 'not registered' }, 404)
  const sess = row.bop_sessions
  const ev = sess?.events
  if (!ev || ev.slug !== slug || String(ev.country) !== String(country)) return reply({ error: 'mismatch' }, 400)
  if (row.ghl_sent) return reply({ ok: true, already: true })

  const lead = row.m4u_leads
  const ownerId = row.referred_by || row.caller_id
  let ownerName = null
  if (ownerId) {
    const o = await rest(env, `/profiles?id=eq.${ownerId}&select=name`)
    ownerName = o.body?.[0]?.name || null
  }
  const tags = [
    `country:${ev.country}`, `event:${ev.slug}`, 'event-registered',
    `mode:${sess.type}`, ...(ownerName ? [`ref:${ownerName}`] : []),
  ]
  const ghl = await ghlTag(env, {
    name: lead.name, phone: lead.phone_norm, email: lead.custom_fields?.email, tags,
  })
  await rest(env, `/bop_roster?session_id=eq.${session_id}&lead_id=eq.${lead_id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ghl_sent: !!ghl.ok }),
  })
  await notify(env, ownerId,
    `🎟 ${lead.name || 'New registrant'} registered`,
    `${ev.title} · ${new Date(sess.starts_at).toLocaleString('en-GB', { timeZone: ev.country === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${sess.type}`,
    '/leads')
  return reply({ ok: true, ghl: ghl.ok ? 'tagged' : (ghl.skipped || 'failed') })
}

/* cron: close out sessions that ended >2h ago */
export async function sweepNoShows(env) {
  const cutoff = new Date(Date.now() - 2 * 3600e3).toISOString()
  const s = await rest(env,
    `/bop_sessions?event_id=not.is.null&starts_at=lt.${cutoff}&select=id,type,title,starts_at,country,events!inner(slug,title,country,status)&limit=50`)
  const sessions = (s.body || []).filter((x) => x.events?.status === 'published' || x.events?.status === 'closed')
  let flipped = 0
  for (const sess of sessions) {
    const r = await rest(env,
      `/bop_roster?session_id=eq.${sess.id}&attended=eq.pending&noshow_notified=eq.false&select=lead_id,referred_by,caller_id,m4u_leads!inner(name,phone_norm)&limit=200`)
    for (const row of r.body || []) {
      await rest(env, `/bop_roster?session_id=eq.${sess.id}&lead_id=eq.${row.lead_id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ attended: 'no_show', noshow_notified: true }),
      })
      await ghlTag(env, {
        name: row.m4u_leads?.name, phone: row.m4u_leads?.phone_norm,
        tags: [`country:${sess.events.country}`, `event:${sess.events.slug}`, 'event-noshow'],
      })
      await notify(env, row.referred_by || row.caller_id,
        `⏳ ${row.m4u_leads?.name || 'A registrant'} did not show up`,
        `${sess.events.title} · ${sess.title}. Call them and rebook onto another date.`,
        '/leads')
      flipped++
    }
  }
  return { sessions: sessions.length, noShows: flipped }
}
