/* Web Push from a Cloudflare Worker — no libraries, WebCrypto only.
 * VAPID (RFC 8292): ES256 JWT per push-service origin.
 * Payload (RFC 8291): aes128gcm — ECDH P-256 + HKDF + AES-128-GCM.
 * Secrets: VAPID_PUBLIC_KEY (b64url raw 65B), VAPID_PRIVATE_KEY (JWK json),
 * VAPID_SUB (mailto:). Public key is duplicated in the app for subscribe(). */

const enc = new TextEncoder()

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64uDecode = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((t, a) => t + a.length, 0))
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

/* one VAPID JWT per push-service origin per dispatch run */
async function vapidJwt(env, audience) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY)
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64u(enc.encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUB,
  })))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`))
  return `${head}.${body}.${b64u(sig)}`
}

async function hkdf(saltBytes, ikmBytes, infoBytes, len) {
  const key = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes }, key, len * 8))
}

/* RFC 8291 single-record aes128gcm (exported for the round-trip self-test) */
export async function encryptPayload(plaintext, p256dh, authSecret) {
  const clientPub = b64uDecode(p256dh)                       // 65B uncompressed point
  const auth = b64uDecode(authSecret)                        // 16B
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, eph.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), clientPub, serverPub), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const record = concat(enc.encode(plaintext), new Uint8Array([2]))   // 0x02 = last record
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record))
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([serverPub.length]), serverPub)
  return concat(header, ct)
}

/* send one push. Returns 'ok' | 'gone' (delete the sub) | 'error' */
export async function sendPush(env, sub, payloadObj) {
  try {
    const audience = new URL(sub.endpoint).origin
    const [jwt, body] = await Promise.all([
      vapidJwt(env, audience),
      encryptPayload(JSON.stringify(payloadObj), sub.p256dh, sub.auth),
    ])
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400', Urgency: 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      },
      body,
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
