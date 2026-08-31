/* Supabase Auth "Send Email" hook → Resend REST API.
   Why: the SMTP path (both Bluehost and smtp.resend.com) proved fragile at
   launch; Resend's REST API is verified working. This hook takes over ALL auth
   emails (recovery, invite, confirmation, magic link) with AG-branded HTML.
   Security: Standard-Webhooks HMAC signature verified with the hook secret —
   nobody can make us send email except Supabase itself. */

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))

async function verifySignature(secret, msgId, timestamp, payload, sigHeader) {
  const key = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  const cryptoKey = await crypto.subtle.importKey(
    'raw', b64ToBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign(
    'HMAC', cryptoKey, new TextEncoder().encode(`${msgId}.${timestamp}.${payload}`))
  const expected = bytesToB64(signed)
  return (sigHeader || '').split(' ').some((s) => s.replace(/^v1,/, '') === expected)
}

const SUBJECT = {
  recovery: 'Reset Kata Laluan — IQI AG Hero',
  invite: 'Jemputan anda — IQI AG Hero',
  signup: 'Sahkan emel anda — IQI AG Hero',
  magiclink: 'Pautan log masuk — IQI AG Hero',
  email_change: 'Sahkan emel baharu — IQI AG Hero',
  email_change_current: 'Sahkan pertukaran emel — IQI AG Hero',
  reauthentication: 'Kod pengesahan — IQI AG Hero',
}
const HEADING = {
  recovery: 'Reset Kata Laluan',
  invite: 'Selamat Datang, Warrior',
  signup: 'Sahkan Emel Anda',
  magiclink: 'Log Masuk Hero',
  email_change: 'Sahkan Emel Baharu',
  email_change_current: 'Sahkan Pertukaran Emel',
  reauthentication: 'Kod Pengesahan',
}
const CTA = {
  recovery: 'Tetapkan Kata Laluan Baharu',
  invite: 'Terima Jemputan',
  signup: 'Sahkan Emel',
  magiclink: 'Log Masuk',
  email_change: 'Sahkan',
  email_change_current: 'Sahkan',
}
const BODYTEXT = {
  recovery: 'Anda meminta untuk menetapkan semula kata laluan Hero anda. Tekan butang di bawah — pautan ini sah untuk satu kali guna sahaja.',
  invite: 'Anda dijemput menyertai IQI AG Hero. Tekan butang di bawah untuk mula.',
  signup: 'Satu langkah lagi — sahkan alamat emel anda untuk mengaktifkan akaun Hero.',
  magiclink: 'Tekan butang di bawah untuk log masuk ke Hero. Pautan sah sekali guna.',
  email_change: 'Sahkan alamat emel baharu anda untuk akaun Hero.',
  email_change_current: 'Sahkan bahawa anda mahu menukar emel akaun Hero anda.',
}

function emailHtml(type, url, otp) {
  const heading = HEADING[type] ?? 'IQI AG Hero'
  const body = BODYTEXT[type] ?? 'Tindakan diperlukan untuk akaun Hero anda.'
  const cta = CTA[type]
  const button = url && cta ? `
      <a href="${url}"
         style="display:inline-block;background:#d4ac4a;color:#151821;font-weight:bold;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none">
        ${cta}
      </a>` : otp ? `
      <p style="color:#f5f0e1;font-size:28px;letter-spacing:8px;font-weight:bold;margin:0">${otp}</p>` : ''
  return `
<div style="background:#0d0f14;padding:32px 16px;font-family:Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#151821;border:1px solid #2a2e3a;border-radius:16px;padding:32px;text-align:center">
    <p style="color:#d4ac4a;font-size:11px;letter-spacing:3px;margin:0 0 4px">IQI AG WARRIORS</p>
    <h1 style="color:#f5f0e1;font-size:20px;margin:0 0 16px">${heading}</h1>
    <p style="color:#9aa0ae;font-size:13px;line-height:1.6;margin:0 0 24px">${body}</p>
    ${button}
    <p style="color:#5f6470;font-size:11px;line-height:1.6;margin:24px 0 0">
      Tidak meminta emel ini? Abaikan sahaja — akaun anda kekal selamat.<br>
      Become Better · Build Better · Give Better
    </p>
  </div>
</div>`
}

export async function handleAuthEmail(request, env) {
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)

  const payload = await request.text()
  const ok = await verifySignature(
    env.SEND_EMAIL_HOOK_SECRET || '',
    request.headers.get('webhook-id') || '',
    request.headers.get('webhook-timestamp') || '',
    payload,
    request.headers.get('webhook-signature') || '',
  )
  if (!ok) return reply({ error: 'invalid signature' }, 401)

  let data
  try { data = JSON.parse(payload) } catch { return reply({ error: 'bad payload' }, 400) }
  const email = data?.user?.email
  const d = data?.email_data ?? {}
  const type = d.email_action_type || 'recovery'
  if (!email) return reply({ error: 'no recipient' }, 400)

  // recovery must ALWAYS land on the /reset form — regardless of whether the
  // reset was requested from the app, the API or the dashboard
  const redirect = type === 'recovery'
    ? 'https://hero.iqiaggroup.com/reset'
    : (d.redirect_to || 'https://hero.iqiaggroup.com')
  const url = d.token_hash
    ? `${env.SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}` +
      `&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirect)}`
    : null

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'IQI AG Hero <reply@iqiaggroup.com>',
      to: [email],
      subject: SUBJECT[type] ?? 'IQI AG Hero',
      html: emailHtml(type, url, d.token),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    // a non-2xx tells GoTrue the send failed, so the API returns a real error
    return reply({ error: `resend: ${err.slice(0, 160)}` }, 500)
  }
  // `link` is diagnostic — visible only to the signed caller (Supabase / ops),
  // and Supabase already knows the token it just gave us
  return reply({ link: url })
}
