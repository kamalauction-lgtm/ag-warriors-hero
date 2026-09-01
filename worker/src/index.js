/* Marketing4U API Worker — the public edge of the caller.
 *
 *   POST /webhook   GHL (and Excel import) lead intake  — spec §7
 *   POST /sweep     expiry sweep + GHL writeback reconcile (also on cron)
 *   GET  /health    liveness
 *
 * Auth mirrors the PHP exactly so cutover is a URL change only: the secret
 * arrives as `X-Webhook-Secret` header OR `?key=`, compared in constant time.
 *
 * The transactional work (dedupe, row locks) stays in Postgres — this Worker
 * only authenticates, extracts fields and calls the m4u_intake RPC.
 */

import { generateReport, REPORT_VERSION } from './talentReport.js'
import { generateBrief, chooseFocus, generateAdvise, generateHelp } from './coachBrief.js'
import { generateExplain } from './acaExplain.js'
import { handleAuthEmail } from './authEmail.js'
import { handleSocialPolish } from './socialPolish.js'
import { sendPush } from './webPush.js'
import { handleEventsNotify, sweepNoShows } from './events.js'
import { handleKamalagSessions } from './kamalagSessions.js'
import { handleCertRender, handleCertPdf, handleCertPreview, handleCertSend, processCertEmails } from './certificates.js'
import { handlePosterCaption, handlePosterSend, handleTelegramChats, handleTelegramTest } from './poster.js'
import { handleProjectDoc } from './projectDocs.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/* The participant app is served from hero.iqiaggroup.com while this Worker lives
   on workers.dev, so every browser call to /talent/report is cross-origin and
   needs CORS. Restricted to our own origins — this is not a public API. */
const ALLOWED_ORIGINS = [
  'https://hero.iqiaggroup.com',
  'https://ag-warriors-hero.iqiaggroup.workers.dev',
  'https://ag-warriors-hero-staging.iqiaggroup.workers.dev',
  'http://localhost:8153',
]

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || ''
  if (!ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** constant-time compare (hash_equals equivalent) */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** accept the primary secret or the secondary (rotation / added consumers) */
function secretOk(provided, env) {
  return safeEqual(provided, env.WEBHOOK_SECRET || '') || safeEqual(provided, env.WEBHOOK_SECRET2 || '')
}

/** walk dotted candidate paths, first non-empty wins (spec §7 extraction) */
function pick(obj, paths) {
  for (const path of paths) {
    let cur = obj
    for (const part of path.split('.')) {
      if (cur == null) break
      cur = cur[part]
    }
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return String(cur).trim()
  }
  return null
}

const RESERVED = new Set([
  'contact_id', 'contactId', 'id', 'opportunity_id', 'opportunityId', 'pipeline_id', 'pipelineId',
  'pipeline', 'pipeline_name', 'name', 'full_name', 'fullName', 'first_name', 'firstName',
  'last_name', 'lastName', 'phone', 'email', 'location', 'locationId', 'workflow', 'key', 'secret',
])

/** everything else on the payload becomes a custom field (flattened, one level) */
function customFields(body) {
  const out = {}
  const add = (k, v) => {
    if (v == null) return
    const key = String(k).trim()
    if (!key || RESERVED.has(key)) return
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (val.trim() !== '') out[key] = val.trim()
  }
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'customData' || k === 'custom_fields' || k === 'customFields') {
      if (Array.isArray(v)) v.forEach((row) => add(row?.key ?? row?.id, row?.value ?? row?.field_value))
      else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(kk, vv))
    } else if (typeof v !== 'object') add(k, v)
  }
  return out
}

async function rpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      ...JSON_HEADERS,
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
}

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
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
}

/* ---------------- webhook intake ---------------- */
async function handleWebhook(request, env, url) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: JSON_HEADERS })
  }
  const provided = request.headers.get('X-Webhook-Secret') || url.searchParams.get('key') || ''
  if (!secretOk(provided, env)) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: JSON_HEADERS })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400, headers: JSON_HEADERS })
  }

  // URL query params act as fallback payload keys (the m4u behaviour)
  const qp = Object.fromEntries(url.searchParams.entries())
  const merged = { ...qp, ...body }

  const first = pick(merged, ['first_name', 'firstName', 'contact.firstName'])
  const last = pick(merged, ['last_name', 'lastName', 'contact.lastName'])
  const name = pick(merged, ['name', 'full_name', 'fullName', 'contact.name'])
    || [first, last].filter(Boolean).join(' ') || null
  const phone = pick(merged, ['phone', 'contact.phone', 'contact_phone', 'Phone'])
  const country = (pick(merged, ['country', 'team', 'region']) || env.DEFAULT_COUNTRY || 'MY').toUpperCase()

  const args = {
    p_country: country === 'ID' ? 'ID' : 'MY',
    p_name: name,
    p_phone: phone,
    p_pipeline_id: pick(merged, ['pipeline_id', 'pipelineId', 'opportunity.pipelineId', 'pipeline.id']),
    p_pipeline_name: pick(merged, ['pipeline_name', 'pipelineName', 'pipeline', 'opportunity.pipelineName']),
    p_contact_id: pick(merged, ['contact_id', 'contactId', 'contact.id', 'id']),
    p_opportunity_id: pick(merged, ['opportunity_id', 'opportunityId', 'opportunity.id']),
    p_custom: customFields(merged),
    p_source: pick(merged, ['source']) || 'webhook',
    p_raw: merged,
  }

  const out = await rpc(env, 'm4u_intake', args)
  if (!out.ok) {
    return new Response(JSON.stringify({ error: 'intake failed', detail: out.body }), { status: 500, headers: JSON_HEADERS })
  }
  return new Response(JSON.stringify(out.body), { status: 200, headers: JSON_HEADERS })
}

/* ---------------- session-registered kill (leads OUT of the pool) ----------
 * GHL REC 07 fires on every kamalag.com/sesi registration (web + walk-in)
 * and POSTs here. The lead — matched by phone, any country — is marked
 * dead/'Registered' via the m4u_mark_registered RPC so no caller can ever
 * pull them again; the reconcile cron then tags the GHL contact
 * `M4U: Registered`. Same auth as /webhook (header or ?key=). */
async function handleRegistered(request, env, url) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: JSON_HEADERS })
  }
  const provided = request.headers.get('X-Webhook-Secret') || url.searchParams.get('key') || ''
  if (!secretOk(provided, env)) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: JSON_HEADERS })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400, headers: JSON_HEADERS })
  }
  const qp = Object.fromEntries(url.searchParams.entries())
  const merged = { ...qp, ...body }

  const phone = pick(merged, ['phone', 'contact.phone', 'contact_phone', 'Phone', 'phone_number'])
  const name = pick(merged, ['name', 'full_name', 'fullName', 'contact.name', 'first_name', 'firstName'])
  if (!phone) {
    return new Response(JSON.stringify({ error: 'phone required' }), { status: 400, headers: JSON_HEADERS })
  }

  const out = await rpc(env, 'm4u_mark_registered', { p_phone: phone, p_name: name })
  if (!out.ok) {
    return new Response(JSON.stringify({ error: 'kill failed', detail: out.body }), { status: 500, headers: JSON_HEADERS })
  }
  return new Response(JSON.stringify(out.body), { status: 200, headers: JSON_HEADERS })
}

/* ---------------- GHL writeback ---------------- */
async function ghlTag(env, contactId, label) {
  if (!env.GHL_TOKEN || !contactId) return false
  const res = await fetch(`${env.GHL_API_BASE || 'https://services.leadconnectorhq.com'}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: env.GHL_API_VERSION || '2021-07-28',
      ...JSON_HEADERS,
    },
    body: JSON.stringify({ tags: [`M4U: ${label}`] }),
  })
  return res.ok
}

/* Stage moves happen for these labels only (spec §8). The tag always lands;
   a stage move is best-effort and never blocks the writeback. */
const STAGE_FOR_LABEL = {
  'Booked': 'Appointment Booked',
  'BOP Online': 'Online BOP',
  'BOP Physical': 'Physical BOP',
}

let stageCache = null   // { 'lowercased stage name': { pipelineId, stageId } }

/** Resolve stage names across every pipeline, case-insensitively. Cached per isolate. */
async function loadStages(env) {
  if (stageCache) return stageCache
  if (!env.GHL_TOKEN || !env.GHL_LOCATION_ID) return (stageCache = {})
  const res = await fetch(
    `${env.GHL_API_BASE || 'https://services.leadconnectorhq.com'}/opportunities/pipelines?locationId=${env.GHL_LOCATION_ID}`,
    { headers: { Authorization: `Bearer ${env.GHL_TOKEN}`, Version: env.GHL_API_VERSION || '2021-07-28' } },
  )
  if (!res.ok) return (stageCache = {})
  const body = await res.json().catch(() => ({}))
  const map = {}
  for (const p of body.pipelines || []) {
    for (const s of p.stages || []) {
      const key = String(s.name || '').trim().toLowerCase()
      if (key && !map[key]) map[key] = { pipelineId: p.id, stageId: s.id }
    }
  }
  return (stageCache = map)
}

async function ghlMoveStage(env, opportunityId, label) {
  const wanted = STAGE_FOR_LABEL[label]
  if (!wanted || !opportunityId) return 'not-applicable'
  const stages = await loadStages(env)
  const hit = stages[wanted.toLowerCase()]
  if (!hit) return 'stage-not-found'          // skip the move, keep the tag
  const res = await fetch(
    `${env.GHL_API_BASE || 'https://services.leadconnectorhq.com'}/opportunities/${opportunityId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GHL_TOKEN}`,
        Version: env.GHL_API_VERSION || '2021-07-28',
        ...JSON_HEADERS,
      },
      body: JSON.stringify({ pipelineId: hit.pipelineId, pipelineStageId: hit.stageId }),
    },
  )
  return res.ok ? 'moved' : 'move-failed'
}

/** retry the writebacks the engine flagged; never blocks a disposition */
async function reconcile(env, limit = 100) {
  const pending = await rest(env, `/m4u_leads?select=id,ghl_contact_id,ghl_opportunity_id,ghl_pending_label&ghl_sync_pending=is.true&ghl_contact_id=not.is.null&limit=${limit}`)
  if (!pending.ok || !Array.isArray(pending.body)) return { synced: 0, failed: 0, moved: 0 }
  let synced = 0, failed = 0, moved = 0
  for (const lead of pending.body) {
    const label = lead.ghl_pending_label || 'Updated'
    const ok = await ghlTag(env, lead.ghl_contact_id, label)
    // stage move is best-effort: a failure here must not hold back the tag
    if (STAGE_FOR_LABEL[label]) {
      const outcome = await ghlMoveStage(env, lead.ghl_opportunity_id, label)
      if (outcome === 'moved') moved++
    }
    if (ok) {
      await rest(env, `/m4u_leads?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ ghl_sync_pending: false, ghl_pending_label: null }),
      })
      synced++
    } else failed++
  }
  return { synced, failed, moved }
}

async function sweep(env) {
  const expired = await rpc(env, 'm4u_expire_holds', {})
  const sync = await reconcile(env)
  return { expired: expired.body ?? 0, ...sync }
}

/* ---------------- Hero Talent Compass report ----------------
 * The participant's own token is the only credential. We never trust a client
 * to tell us who they are: the token is resolved server-side, and the scores
 * come from the database, not from the request body.
 */
/* AG AI Coach — POST /coach/analyse with the agent's own Supabase access token.
   The token is verified against Supabase Auth, so the worker never trusts a
   client-supplied user id: you can only analyse yourself. One brief per day is
   stored; pressing the button again returns it instead of paying for another
   generation (pass regenerate: true to force). */
/* Leadership advisory — POST /coach/advise { agent_id }.
   The caller's own JWT decides authority: an admin (country-scoped) or the
   agent's assigned Coach may ask how to help; nobody else. Stateless — the
   advisory is fresh each call and stores nothing. */
/* Help request — POST /coach/help { topic, message, to_role }.
   The agent's JWT identifies them; the worker packs their full context, gives
   them immediate steps, stores the request, and notifies the right humans
   (assigned Coach / their Leader / country admins — with admin fallback when
   the chosen role has nobody behind it). */
async function handleCoachHelp(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt) return reply({ error: 'token required' }, 401)
  const topic = ['closing', 'leads', 'motivation', 'technical', 'other'].includes(body?.topic)
    ? body.topic : 'other'
  const toRole = ['coach', 'leader', 'admin'].includes(body?.to_role) ? body.to_role : 'coach'
  const message = String(body?.message ?? '').slice(0, 1500)
  if (!message.trim()) return reply({ error: 'message required' }, 400)

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const agentId = (await who.json())?.id
  if (!agentId) return reply({ error: 'invalid session' }, 401)

  // Facts enrich the help, but must NEVER block it. A non-enrolled agent (or a
  // slow coach_facts) previously 500'd the whole request; now we fall back to a
  // minimal profile so the message still reaches a human.
  let facts = null
  try {
    const factsR = await rpc(env, 'coach_facts', { p_agent: agentId })
    if (factsR.ok && factsR.body) facts = factsR.body
  } catch { facts = null }
  if (!facts) {
    const pr = await rest(env, `/profiles?select=name,country&id=eq.${agentId}`)
    facts = { agent: { name: pr.body?.[0]?.name ?? 'A warrior', country: pr.body?.[0]?.country ?? 'MY' } }
  }
  // country default: ID gets Bahasa Indonesia, MY (and everyone else) English;
  // the app passes its own language toggle so BM users still get BM
  const lang = ['en', 'ms', 'id'].includes(body?.lang) ? body.lang
    : (facts?.agent?.country === 'ID' ? 'id' : 'en')

  const out = await generateHelp(env, facts, topic, message, lang)

  const ins = await rest(env, '/help_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ agent_id: agentId, topic, message, to_role: toRole, ai_plan: out.plan }]),
  })
  const reqId = ins.body?.[0]?.id

  /* resolve who to notify */
  let targets = []
  if (toRole === 'coach') {
    const ca = await rest(env, `/coach_assignments?select=coach_id&participant_id=eq.${agentId}&active=eq.true`)
    targets = (ca.body ?? []).map((x) => x.coach_id)
  } else if (toRole === 'leader') {
    const pr = await rest(env, `/profiles?select=leader_id&id=eq.${agentId}`)
    if (pr.body?.[0]?.leader_id) targets = [pr.body[0].leader_id]
  }
  if (!targets.length) {          // admin choice, or the chosen role has nobody behind it
    const ad = await rest(env,
      `/profiles?select=id&status=eq.active&role=in.(master_admin,country_admin)&country=eq.${facts.agent?.country ?? 'MY'}`)
    targets = (ad.body ?? []).map((x) => x.id)
  }
  const name = facts.agent?.name ?? 'A warrior'
  if (targets.length) {
    await rest(env, '/notifications', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(targets.map((t) => ({
        to_agent: t, type: 'help',
        title: `🆘 ${name} asked for help (${topic})`,
        body: String(out.plan?.for_helper?.situation ?? message).slice(0, 240),
        link: '#/coach',
      }))),
    })
  }
  return reply({ id: reqId, for_agent: out.plan.for_agent, notified: targets.length,
                 generated_by: out.generated_by })
}

async function handleCoachAdvise(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt) return reply({ error: 'token required' }, 401)
  const target = body?.agent_id
  if (!target) return reply({ error: 'agent_id required' }, 400)

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const callerId = (await who.json())?.id
  if (!callerId) return reply({ error: 'invalid session' }, 401)

  const me = await rest(env, `/profiles?select=role,country&id=eq.${callerId}`)
  const my = me.body?.[0]
  const tgt = await rest(env, `/profiles?select=country&id=eq.${target}`)
  const isAdminCaller = my && ['master_admin', 'country_admin'].includes(my.role)
    && (my.role === 'master_admin' || my.country === tgt.body?.[0]?.country)
  let allowed = isAdminCaller
  if (!allowed) {
    const ca = await rest(env,
      `/coach_assignments?select=participant_id&coach_id=eq.${callerId}&participant_id=eq.${target}&active=eq.true`)
    allowed = !!ca.body?.length
  }
  if (!allowed) return reply({ error: 'not authorised' }, 403)

  const factsR = await rpc(env, 'coach_facts', { p_agent: target })
  if (!factsR.ok || !factsR.body) return reply({ error: 'facts unavailable' }, 500)
  const out = await generateAdvise(env, factsR.body)
  return reply({ ...out, facts: factsR.body })
}

async function handleCoachAnalyse(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)

  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '') || body?.token
  if (!jwt) return reply({ error: 'token required' }, 401)

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const user = await who.json()
  const agentId = user?.id
  if (!agentId) return reply({ error: 'invalid session' }, 401)

  // the app may ask for a specific language (its EN/BM/ID toggle); a cached
  // brief in another language regenerates, same pattern as the talent report
  const wantLang = ['en', 'ms', 'id'].includes(body?.lang) ? body.lang : null

  const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10) // Asia/Kuala_Lumpur
  const existing = await rest(env,
    `/coach_briefs?select=scores,facts,narrative,generated_by,on_date,language&agent_id=eq.${agentId}&on_date=eq.${today}`)
  if (existing.ok && existing.body?.length && !body.regenerate
      && (!wantLang || existing.body[0].language === wantLang)) {
    return reply(existing.body[0])
  }

  const factsR = await rpc(env, 'coach_facts', { p_agent: agentId })
  if (!factsR.ok || !factsR.body) return reply({ error: 'facts unavailable' }, 500)
  const facts = factsR.body
  const lang = wantLang ?? (facts?.agent?.country === 'ID' ? 'id' : 'en')

  /* Record the AI's weekly focus proposal so it is stable all week and a Coach
     can see and override it. A row that already exists (AI's earlier proposal or
     a coach's choice) is never replaced — merge-duplicates keeps the first. */
  const proposal = chooseFocus(facts)
  if (proposal?.isNew && facts.week_start) {
    await rest(env, '/agent_focus?on_conflict=agent_id,week_start', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{ agent_id: agentId, week_start: facts.week_start,
                              dimension_key: proposal.key, set_by: 'ai' }]),
    })
    facts.focus = { dimension_key: proposal.key, set_by: 'ai', week_start: facts.week_start }
  }

  const brief = await generateBrief(env, facts, lang)
  await rest(env, '/coach_briefs?on_conflict=agent_id,on_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      agent_id: agentId, on_date: today, language: lang,
      scores: brief.scores, facts, narrative: brief.narrative,
      generated_by: brief.generated_by,
    }]),
  })
  return reply({ scores: brief.scores, facts, narrative: brief.narrative,
                 generated_by: brief.generated_by, on_date: today, language: lang })
}

/* Diag Academy — POST /diag/explain: AI explanation of the participant's OWN
   diagnostic. Reads via aca_my under the USER's JWT (RLS-scoped, sanitized),
   so this endpoint can never see anyone else's results. Deterministic
   fallback is complete; AI only improves the prose. */
async function handleDiagExplain(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)

  let body
  try { body = await request.json() } catch { body = {} }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt) return reply({ error: 'token required' }, 401)

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const userId = (await who.json())?.id
  if (!userId) return reply({ error: 'invalid session' }, 401)

  // the participant's own view, under their own JWT
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/aca_my`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}`,
               'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) return reply({ error: 'results unavailable' }, 500)
  const data = await r.json()
  if (!data?.diag_completed) return reply({ error: 'diagnostic not completed yet' }, 400)

  // country first, language second: default MY→ms, ID→id
  let lang = ['en', 'ms', 'id'].includes(body?.lang) ? body.lang : null
  if (!lang) {
    const p = await rest(env, `/profiles?select=country&id=eq.${userId}`)
    lang = (p.body?.[0]?.country === 'ID') ? 'id' : 'ms'
  }

  const out = await generateExplain(env, data, lang)
  return reply({ ...out, language: lang })
}

/* Tim Elit — POST /elite/forward: a pod lead whose disposition is done with
   the elite flow (no answer / not interested) is handed to Marketing4U via the
   same m4u_intake used by GHL, tagged source 'tim_elit'. Authorised for the
   pod captain, the assigned member, or an admin. */
async function handleEliteForward(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)

  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt || !body?.lead_id) return reply({ error: 'token + lead_id required' }, 401)

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const userId = (await who.json())?.id

  const leadR = await rest(env, `/pod_leads?id=eq.${body.lead_id}&select=*`)
  const lead = leadR.body?.[0]
  if (!lead) return reply({ error: 'lead not found' }, 404)
  if (lead.forwarded_to_m4u) return reply({ ok: true, already: true })

  const [podR, meR] = await Promise.all([
    rest(env, `/pods?id=eq.${lead.pod_id}&select=captain_id,country`),
    rest(env, `/profiles?id=eq.${userId}&select=role,country`),
  ])
  const pod = podR.body?.[0]
  const me = meR.body?.[0]
  const isAdmin = me && ['master_admin', 'country_admin'].includes(me.role)
  if (!(pod?.captain_id === userId || lead.assigned_to === userId || isAdmin)) {
    return reply({ error: 'not authorised for this lead' }, 403)
  }

  const out = await rpc(env, 'm4u_intake', {
    p_country: lead.country === 'ID' ? 'ID' : 'MY',
    p_name: lead.name, p_phone: lead.phone,
    p_pipeline_id: null, p_pipeline_name: null,
    p_contact_id: null, p_opportunity_id: null,
    p_custom: lead.note ? { elite_note: lead.note } : null,
    p_source: 'tim_elit',
    p_raw: { pod_lead_id: lead.id, forwarded_by: userId },
  })
  if (!out.ok) return reply({ error: 'intake failed', detail: out.body }, 500)

  await rest(env, `/pod_leads?id=eq.${lead.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ forwarded_to_m4u: true, m4u_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }),
  })
  return reply({ ok: true, m4u: out.body })
}

/* ---------------- TimeBox reminders (065) ----------------
 * Every cron tick: pending tasks whose HH:MM slot falls within the next 15
 * minutes (per the agent's country timezone) get a notifications row; the
 * push dispatcher then delivers it. reminded=true stops double-sends. */
function localHM(tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date())
}
function localDate(tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return p.format(new Date()) // YYYY-MM-DD
}
const addMinutes = (hm, mins) => {
  const [h, m] = hm.split(':').map(Number)
  const t = (h * 60 + m + mins) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

async function remindTasks(env) {
  const TZ = { MY: 'Asia/Kuala_Lumpur', ID: 'Asia/Jakarta' }
  const dates = [...new Set(Object.values(TZ).map(localDate))]
  const rowsR = await rest(env,
    `/time_tasks?status=eq.pending&reminded=eq.false&slot=not.is.null&on_date=in.(${dates.join(',')})` +
    `&select=id,user_id,label,slot,on_date,profiles!time_tasks_user_id_fkey(country)&limit=300`)
  const rows = rowsR.body || []
  const due = rows.filter((r) => {
    if (!/^\d{2}:\d{2}$/.test(r.slot || '')) return false
    const tz = TZ[r.profiles?.country] || TZ.MY
    if (r.on_date !== localDate(tz)) return false
    const now = localHM(tz)
    const end = addMinutes(now, 15)
    // window never crosses midnight in practice (23:45+ edge just waits for tomorrow's row)
    return r.slot >= now && r.slot <= end && end > now
  })
  if (!due.length) return { reminded: 0 }
  await rest(env, '/notifications', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(due.map((r) => ({
      to_agent: r.user_id, type: 'timebox',
      title: `⏰ ${r.label}`, body: `Scheduled at ${r.slot} — TimeBox`, link: '/',
    }))),
  })
  await rest(env, `/time_tasks?id=in.(${due.map((r) => r.id).join(',')})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ reminded: true }),
  })
  return { reminded: due.length }
}

/* ---------------- 30 Days Closing Challenge sweep (080) ----------------
 * One daily job: inactivity nudges, overdue follow-up nudges, Day 27 structured
 * review, Day 30 final review (a HUMAN review — never a graduation), and an
 * honest count of missed days flagged and reviews aged past 48h.
 * The RPC self-guards to once per 12h, so the 5-minute cron can call it blindly. */
async function challengeSweep(env) {
  const r = await rest(env, '/rpc/fn_challenge_sweep', {
    method: 'POST', body: JSON.stringify({ p_force: false }),
  })
  return r.body || { error: r.status }
}

/* ---------------- Web push (064) ----------------
 * dispatchPush: cron sweep — send every un-pushed notification row to the
 * recipient's subscribed devices, then mark pushed (win or lose: no storms).
 * Dead subscriptions (404/410 from the push service) are deleted. */
async function dispatchPush(env) {
  if (!env.VAPID_PRIVATE_KEY) return { pushed: 0, skipped: 'no vapid' }
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const rowsR = await rest(env,
    `/notifications?pushed=eq.false&created_at=gte.${cutoff}&select=id,to_agent,title,body,link&limit=100`)
  const rows = rowsR.body || []
  if (!rows.length) return { pushed: 0 }

  const agents = [...new Set(rows.map((r) => r.to_agent))]
  const subsR = await rest(env,
    `/push_subs?user_id=in.(${agents.join(',')})&select=id,user_id,endpoint,p256dh,auth`)
  const subs = subsR.body || []
  const byAgent = {}
  for (const s of subs) (byAgent[s.user_id] ||= []).push(s)

  let sent = 0
  const dead = new Set()
  for (const n of rows) {
    for (const sub of byAgent[n.to_agent] || []) {
      const res = await sendPush(env, sub, {
        title: n.title, body: n.body || '', link: n.link || '/notifications',
      })
      if (res === 'ok') sent++
      if (res === 'gone') dead.add(sub.id)
    }
  }
  await rest(env, `/notifications?id=in.(${rows.map((r) => r.id).join(',')})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ pushed: true }),
  })
  for (const id of dead) {
    await rest(env, `/push_subs?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  return { pushed: sent, notifications: rows.length, deadSubs: dead.size }
}

/* POST /push/test — signed-in user pings their own devices ("Send test") */
async function handlePushTest(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt) return reply({ error: 'token required' }, 401)
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!who.ok) return reply({ error: 'invalid session' }, 401)
  const userId = (await who.json())?.id
  const subsR = await rest(env, `/push_subs?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`)
  const subs = subsR.body || []
  if (!subs.length) return reply({ ok: false, error: 'no subscriptions on this account' }, 404)
  let sent = 0
  for (const sub of subs) {
    if (await sendPush(env, sub, {
      title: 'IQI AG Hero 🔔', body: 'Push is working on this device.', link: '/notifications',
    }) === 'ok') sent++
  }
  return reply({ ok: sent > 0, sent, devices: subs.length })
}

async function handleTalentReport(request, env) {
  const cors = corsHeaders(request)
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method !== 'POST') {
    return reply({ error: 'POST only' }, 405)
  }
  let body
  try { body = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const token = body?.token
  if (!token || typeof token !== 'string') {
    return reply({ error: 'token required' }, 401)
  }

  // resolve the attempt from the token (service role, server side only)
  const who = await rpc(env, 'talent_attempt_of', { p_token: token })
  const attemptId = who.body
  if (!who.ok || !attemptId) {
    return reply({ error: 'invalid session' }, 401)
  }

  // already generated? return it rather than paying for another call
  const existing = await rest(env, `/talent_reports?select=content,generated_by&attempt_id=eq.${attemptId}`)
  const cached = existing.ok && Array.isArray(existing.body) ? existing.body[0] : null
  const stale = cached && (cached.content?.content_version ?? 1) < REPORT_VERSION
  if (cached && !body.regenerate && !stale) {
    return reply(cached.content)
  }

  /* Which bank is this? The two assessments answer different questions:
       v1  (/testme, mid-class)  -> which TASK suits this person
       myself-v1 (/myself, pre-class) -> WHO this person is
     A public candidate who has never sold a property should not be handed a
     ranked job title, so the report shape follows the bank. */
  const att = await rest(env, `/talent_attempts?select=version_id&id=eq.${attemptId}`)
  const versionId = att.ok && att.body?.[0]?.version_id
  let purpose = 'position'
  if (versionId) {
    const ver = await rest(env, `/talent_versions?select=code&id=eq.${versionId}`)
    if (ver.ok && ver.body?.[0]?.code?.startsWith('myself')) purpose = 'person'
  }

  const result = await rpc(env, 'talent_result', { p_attempt: attemptId })
  if (!result.ok || !result.body) {
    return reply({ error: 'no result yet' }, 409)
  }

  const report = await generateReport(env, result.body, purpose)

  await rest(env, '/talent_reports?on_conflict=attempt_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      attempt_id: attemptId,
      language: result.body.language,
      generated_by: report.generated_by,
      model: report.model ?? null,
      content: report,
    }]),
  })
  await rest(env, `/talent_attempts?id=eq.${attemptId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'reported' }),
  })

  return reply(report)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'm4u-api' }), { headers: JSON_HEADERS })
    }
    if (url.pathname === '/webhook') return handleWebhook(request, env, url)
    if (url.pathname === '/registered') return handleRegistered(request, env, url)
    if (url.pathname === '/talent/report') return handleTalentReport(request, env)
    if (url.pathname === '/coach/analyse') return handleCoachAnalyse(request, env)
    if (url.pathname === '/coach/advise') return handleCoachAdvise(request, env)
    if (url.pathname === '/coach/help') return handleCoachHelp(request, env)
    if (url.pathname === '/diag/explain') return handleDiagExplain(request, env)
    if (url.pathname === '/auth/email') return handleAuthEmail(request, env)
    if (url.pathname === '/social/polish') return handleSocialPolish(request, env)
    if (url.pathname === '/elite/forward') return handleEliteForward(request, env)
    if (url.pathname === '/push/test') return handlePushTest(request, env)
    if (url.pathname === '/events/notify') return handleEventsNotify(request, env, corsHeaders)
    if (url.pathname === '/kamalag/sessions') return handleKamalagSessions(request, env, corsHeaders(request))
    if (url.pathname === '/cert/render') return handleCertRender(request, env, corsHeaders)
    if (url.pathname === '/cert/send') return handleCertSend(request, env, corsHeaders)
    if (url.pathname === '/poster/caption') return handlePosterCaption(request, env)
    if (url.pathname === '/poster/send') return handlePosterSend(request, env)
    if (url.pathname === '/poster/telegram/chats') return handleTelegramChats(request, env)
    if (url.pathname === '/poster/telegram/test') return handleTelegramTest(request, env)
    if (url.pathname === '/project-doc') return handleProjectDoc(request, env)
    if (url.pathname === '/cert/preview') return handleCertPreview(request, env, corsHeaders)
    if (url.pathname === '/cert/pdf') return handleCertPdf(request, env)
    if (url.pathname === '/sweep') {
      const provided = request.headers.get('X-Webhook-Secret') || url.searchParams.get('key') || ''
      if (!secretOk(provided, env)) {
        return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: JSON_HEADERS })
      }
      return new Response(JSON.stringify(await sweep(env)), { headers: JSON_HEADERS })
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_HEADERS })
  },

  // every 5 minutes: return lapsed holds, pause offenders, retry GHL writebacks,
  // and push fresh notifications to subscribed devices
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sweep(env))
    // reminders first so their notifications ride the same push dispatch tick
    ctx.waitUntil(
      remindTasks(env).catch(() => {})
        .then(() => sweepNoShows(env).catch(() => {}))
        .then(() => processCertEmails(env).catch(() => {}))
        .then(() => challengeSweep(env).catch(() => {}))
        .then(() => dispatchPush(env)))
  },
}
