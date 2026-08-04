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

import { generateReport } from './talentReport.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** constant-time compare (hash_equals equivalent) */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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
  if (!safeEqual(provided, env.WEBHOOK_SECRET || '')) {
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
async function handleTalentReport(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: JSON_HEADERS })
  }
  let body
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400, headers: JSON_HEADERS })
  }
  const token = body?.token
  if (!token || typeof token !== 'string') {
    return new Response(JSON.stringify({ error: 'token required' }), { status: 401, headers: JSON_HEADERS })
  }

  // resolve the attempt from the token (service role, server side only)
  const who = await rpc(env, 'talent_attempt_of', { p_token: token })
  const attemptId = who.body
  if (!who.ok || !attemptId) {
    return new Response(JSON.stringify({ error: 'invalid session' }), { status: 401, headers: JSON_HEADERS })
  }

  // already generated? return it rather than paying for another call
  const existing = await rest(env, `/talent_reports?select=content,generated_by&attempt_id=eq.${attemptId}`)
  if (existing.ok && Array.isArray(existing.body) && existing.body.length && !body.regenerate) {
    return new Response(JSON.stringify(existing.body[0].content), { headers: JSON_HEADERS })
  }

  const result = await rpc(env, 'talent_result', { p_attempt: attemptId })
  if (!result.ok || !result.body) {
    return new Response(JSON.stringify({ error: 'no result yet' }), { status: 409, headers: JSON_HEADERS })
  }

  const report = await generateReport(env, result.body)

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

  return new Response(JSON.stringify(report), { headers: JSON_HEADERS })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'm4u-api' }), { headers: JSON_HEADERS })
    }
    if (url.pathname === '/webhook') return handleWebhook(request, env, url)
    if (url.pathname === '/talent/report') return handleTalentReport(request, env)
    if (url.pathname === '/sweep') {
      const provided = request.headers.get('X-Webhook-Secret') || url.searchParams.get('key') || ''
      if (!safeEqual(provided, env.WEBHOOK_SECRET || '')) {
        return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: JSON_HEADERS })
      }
      return new Response(JSON.stringify(await sweep(env)), { headers: JSON_HEADERS })
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_HEADERS })
  },

  // every 5 minutes: return lapsed holds, pause offenders, retry GHL writebacks
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sweep(env))
  },
}
