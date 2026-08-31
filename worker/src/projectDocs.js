/* Project Library file access (100).
 *
 *  GET /project-doc?resource=<uuid>   signed-in user → 302 to a short-lived
 *  signed URL for that resource's file, IF the DB says they may see it. The
 *  storage path never reaches the browser, so a URL can't be shared out of band
 *  the way a public link could. Same guard model as certificate PDFs.
 */
const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function rest(env, path, jwt) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: jwt ? (env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY) : env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt || env.SUPABASE_SERVICE_KEY}`, ...JSON_HEADERS,
    },
    body: '{}',
  })
  return res
}

export async function handleProjectDoc(request, env) {
  const url = new URL(request.url)
  const resource = url.searchParams.get('resource') || ''
  if (!/^[0-9a-f-]{36}$/i.test(resource)) return new Response('bad resource', { status: 400 })

  // the token can arrive as a header (fetch) or ?t= (a plain link/click)
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '') || url.searchParams.get('t')
  if (!jwt) return new Response('sign in required', { status: 401 })

  // ask the DB, AS THE USER, for the storage path — it enforces can_see_resource
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/fn_project_file_path`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}`, ...JSON_HEADERS },
    body: JSON.stringify({ p_resource: resource }),
  })
  if (!r.ok) return new Response('not authorised', { status: 403 })
  const path = await r.json().catch(() => null)
  if (!path || typeof path !== 'string') return new Response('not found', { status: 404 })

  // mint a short signed URL with the service key and redirect to it
  const sign = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/project-docs/${path}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...JSON_HEADERS },
    body: JSON.stringify({ expiresIn: 600 }),
  })
  const b = await sign.json().catch(() => null)
  if (!b?.signedURL) return new Response('could not sign', { status: 502 })
  return Response.redirect(`${env.SUPABASE_URL}/storage/v1${b.signedURL}`, 302)
}
