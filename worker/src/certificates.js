/* E-Certificates (075) — the evidence layer.
 *
 *  POST /cert/render  {certificate_id}      admin JWT → renders the PDF from the frozen
 *                                           snapshot (pdf-lib), stores it in the private
 *                                           'certificates' bucket, writes pdf_path.
 *  GET  /cert/pdf?t=<access_token>          participant download → signed URL redirect
 *                                           (renders on demand if the PDF is missing).
 *  cron processCertEmails(env)              drains certificate_email_deliveries (queued →
 *                                           sent/failed) through Resend, 20 per tick.
 *
 * Nothing here decides eligibility or issuance — the DB RPCs do (attendance is the
 * source; admin authorises). This module only turns issued rows into PDFs + emails.
 */
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'

/* ---------- font presets (TTFs served from the app's /fonts, OFL-licensed) ----------
   title = certificate title · name = participant name · body = everything else.
   Files fetched once per isolate; any failure falls back to the standard fonts. */
const FONT_BASE = 'https://hero.iqiaggroup.com/fonts/'
const FONT_PRESETS = {
  classic: { label: 'Classic serif', title: null, name: null, body: null },                       // Times / Helvetica built-ins
  elegant: { label: 'Elegant (Playfair)', title: 'PlayfairDisplay-Bold.ttf', name: 'PlayfairDisplay-Bold.ttf', body: 'Lato-Regular.ttf', bodyBold: 'Lato-Bold.ttf' },
  script: { label: 'Script name (Great Vibes)', title: 'Cinzel-Bold.ttf', name: 'GreatVibes-Regular.ttf', body: 'Lato-Regular.ttf', bodyBold: 'Lato-Bold.ttf' },
  modern: { label: 'Modern (Montserrat)', title: 'Montserrat-Regular.ttf', name: 'Montserrat-Regular.ttf', body: 'Montserrat-Regular.ttf', bodyBold: 'Montserrat-Regular.ttf' },
  garamond: { label: 'Garamond', title: 'CormorantGaramond-Bold.ttf', name: 'CormorantGaramond-Bold.ttf', body: 'Lato-Regular.ttf', bodyBold: 'Lato-Bold.ttf' },
}
const fontCache = new Map()
async function fontBytes(file) {
  if (fontCache.has(file)) return fontCache.get(file)
  const res = await fetch(FONT_BASE + file)
  if (!res.ok) throw new Error(`font ${file} ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  fontCache.set(file, bytes)
  return bytes
}
async function loadFonts(pdf, presetKey) {
  const std = {
    serif: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifI: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansB: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const p = FONT_PRESETS[presetKey] || FONT_PRESETS.classic
  const out = { title: std.serif, name: std.serif, italic: std.serifI, body: std.sans, bodyB: std.sansB }
  if (!p.title) return out
  try {
    pdf.registerFontkit(fontkit)
    const [t, n, b, bb] = await Promise.all([fontBytes(p.title), fontBytes(p.name), fontBytes(p.body), fontBytes(p.bodyBold || p.body)])
    out.title = await pdf.embedFont(t, { subset: true })
    out.name = p.name === p.title ? out.title : await pdf.embedFont(n, { subset: true })
    out.body = await pdf.embedFont(b, { subset: true })
    out.bodyB = p.bodyBold && p.bodyBold !== p.body ? await pdf.embedFont(bb, { subset: true }) : out.body
  } catch { /* keep standard fonts */ }
  return out
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const APP = 'https://hero.iqiaggroup.com'
const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'

async function rest(env, path, init = {}, jwt = null) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: jwt ? env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY : env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt || env.SUPABASE_SERVICE_KEY}`,
      ...JSON_HEADERS, ...(init.headers || {}),
    },
  })
  let body = null
  try { body = await res.json() } catch { /* empty */ }
  return { ok: res.ok, status: res.status, body }
}

/* ---------- language defaults (managed template text wins when present) ---------- */
const DEFAULT_TEXT = {
  en: { title: 'Certificate of Attendance', heading: 'This is to certify that', attendance: 'attended',
    issued: 'Issued on', number: 'Certificate No.', verify: 'Verify this certificate', organiser: 'IQI AG Group' },
  'ms-MY': { title: 'Sijil Kehadiran', heading: 'Dengan ini disahkan bahawa', attendance: 'telah menghadiri',
    issued: 'Dikeluarkan pada', number: 'No. Sijil', verify: 'Sahkan sijil ini', organiser: 'IQI AG Group Malaysia' },
  'id-ID': { title: 'Sertifikat Kehadiran', heading: 'Dengan ini menyatakan bahwa', attendance: 'telah menghadiri',
    issued: 'Diterbitkan pada', number: 'No. Sertifikat', verify: 'Verifikasi sertifikat ini', organiser: 'IQI AG Group Indonesia' },
}
const LOCALE = { en: 'en-GB', 'ms-MY': 'ms-MY', 'id-ID': 'id-ID' }

function textFor(snapshot, lang) {
  const managed = (snapshot.text && (snapshot.text[lang] || snapshot.text.en)) || {}
  return { ...DEFAULT_TEXT[lang] || DEFAULT_TEXT.en, ...Object.fromEntries(Object.entries(managed).filter(([, v]) => v)) }
}
const fmtDate = (iso, lang, country) => new Date(iso).toLocaleDateString(LOCALE[lang] || 'en-GB',
  { timeZone: country === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur', day: 'numeric', month: 'long', year: 'numeric' })

/* ---------- asset fetch from the private bucket (service key) ---------- */
async function fetchAsset(env, path) {
  if (!path) return null
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/certificate-assets/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  })
  if (!res.ok) return null
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || '' }
}
async function embedImage(pdf, asset) {
  if (!asset) return null
  try {
    if (/png/i.test(asset.type)) return await pdf.embedPng(asset.bytes)
    return await pdf.embedJpg(asset.bytes)
  } catch { return null }
}

/* ---------- QR as vector squares ---------- */
function drawQr(page, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size, cell = size / n
  page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) })
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell, height: cell, color: rgb(0, 0, 0) })
  }
}

/* ---------- the certificate PDF ---------- */
export async function renderCertificatePdf(env, cert) {
  const s = cert.snapshot_json || {}
  const lang = cert.language || 'en'
  const t = textFor(s, lang)
  const portrait = s.orientation === 'portrait'
  const W = portrait ? 595.28 : 841.89, H = portrait ? 841.89 : 595.28
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${t.title} — ${cert.recipient_name}`)
  pdf.setAuthor(t.organiser)
  const page = pdf.addPage([W, H])
  const layout = s.layout || {}
  const F = await loadFonts(pdf, layout.font)
  const serif = F.title, serifI = F.italic, sans = F.body, sansB = F.bodyB, nameFont = F.name
  const gold = rgb(0.69, 0.54, 0.23), ink = rgb(0.10, 0.10, 0.12), muted = rgb(0.40, 0.40, 0.45)
  const accent = layout.accent ? hex(layout.accent) : gold

  // background: image if provided, else cream paper with gold frame
  const bg = await embedImage(pdf, await fetchAsset(env, s.assets?.background))
  if (bg) page.drawImage(bg, { x: 0, y: 0, width: W, height: H })
  else {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.99, 0.98, 0.95) })
    page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: accent, borderWidth: 3 })
    page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: accent, borderWidth: 0.8 })
  }
  const center = (txt, y, font, size, color = ink) => {
    const w = font.widthOfTextAtSize(txt, size)
    page.drawText(txt, { x: (W - w) / 2, y, size, font, color })
  }
  // word-wrap centred text into ≤ maxLines lines within maxW; returns the y after the block
  const wrapCenter = (txt, y, font, size, color, maxW, maxLines = 3, lineGap = 1.25) => {
    const words = String(txt || '').split(/\s+/).filter(Boolean)
    const lines = []; let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t
      else { lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…') }
    for (const ln of lines) { center(ln, y, font, size, color); y -= size * lineGap }
    return y
  }
  // logos
  const logoL = await embedImage(pdf, await fetchAsset(env, s.assets?.logo_left))
  const logoR = await embedImage(pdf, await fetchAsset(env, s.assets?.logo_right))
  if (logoL) { const d = logoL.scale(60 / logoL.height); page.drawImage(logoL, { x: 48, y: H - 48 - d.height, width: d.width, height: d.height }) }
  if (logoR) { const d = logoR.scale(60 / logoR.height); page.drawImage(logoR, { x: W - 48 - d.width, y: H - 48 - d.height, width: d.width, height: d.height }) }

  let y = H - 120
  center(t.organiser.toUpperCase(), y, sansB, 10, muted); y -= 40
  center(s.certificate_title || t.title, y, serif, portrait ? 30 : 36, accent); y -= 40
  center(t.heading, y, serifI, 13, muted); y -= 46
  const isScript = layout.font === 'script'
  const nameSize = (cert.recipient_name.length > 30 ? 26 : 34) * (isScript ? 1.35 : 1)
  center(cert.recipient_name, y, nameFont, nameSize, ink); y -= 10
  const nw = Math.min(W - 160, nameFont.widthOfTextAtSize(cert.recipient_name, nameSize) + 60)
  page.drawLine({ start: { x: (W - nw) / 2, y }, end: { x: (W + nw) / 2, y }, thickness: 1, color: accent }); y -= 30
  center(t.attendance, y, serifI, 13, muted); y -= 30
  // line 1: event config override → template wording → the event's title (wraps, ≤2 lines)
  const eventLine = s.event_title_override || t.event_line || s.event_title || ''
  const evSize = eventLine.length > 70 ? 13 : 16
  y = wrapCenter(eventLine, y, sansB, evSize, ink, W - 160, 2, 1.3) - 4
  // line 2: event config override → template wording → auto (session · mode · date · venue)
  const modeWord = s.mode === 'online' ? 'Online' : (lang === 'ms-MY' ? 'Fizikal' : lang === 'id-ID' ? 'Fisik' : 'Physical')
  const when = s.details_line || t.details_line || [s.session_title && s.session_title !== s.event_title ? s.session_title : null,
    s.mode ? modeWord : null, s.event_date ? fmtDate(s.event_date, lang, s.country) : null, s.venue].filter(Boolean).join(' · ')
  y = wrapCenter(when, y, sans, 11, muted, W - 160, 2) - 2
  if (t.body) { y = wrapCenter(t.body, y, sans, 10, muted, W - 160, 2) }

  // signatories (up to 3 across the bottom)
  const sigs = Array.isArray(s.signatories) ? s.signatories.slice(0, 4) : []
  const baseY = 118
  if (sigs.length) {
    // the QR + number block owns the bottom-left column (x < 130) — keep signatures clear of it
    const left = 140, right = W - 48
    const slot = (right - left) / sigs.length
    const half = Math.min(90, slot / 2 - 10)            // signature line half-width, shrinks for 4-up
    for (let i = 0; i < sigs.length; i++) {
      const cx = left + slot * i + slot / 2
      const sig = await embedImage(pdf, await fetchAsset(env, sigs[i].signature_path))
      if (sig) {
        const scale = Math.min(2.5, Math.max(0.5, Number(sigs[i].scale) || 1))
        const d = sig.scale((44 * scale) / sig.height)
        page.drawImage(sig, { x: cx - d.width / 2, y: baseY + 12, width: d.width, height: d.height })
      }
      page.drawLine({ start: { x: cx - half, y: baseY + 10 }, end: { x: cx + half, y: baseY + 10 }, thickness: 0.8, color: muted })
      const nm = sigs[i].name || ''; const ti = sigs[i].title || ''
      const nmSize = sansB.widthOfTextAtSize(nm, 10) > half * 2 ? 8.5 : 10
      const tiSize = sans.widthOfTextAtSize(ti, 8.5) > half * 2 ? 7 : 8.5
      page.drawText(nm, { x: cx - sansB.widthOfTextAtSize(nm, nmSize) / 2, y: baseY - 4, size: nmSize, font: sansB, color: ink })
      page.drawText(ti, { x: cx - sans.widthOfTextAtSize(ti, tiSize) / 2, y: baseY - 16, size: tiSize, font: sans, color: muted })
    }
  }

  // QR + number + issued (bottom-left / bottom-right)
  // QR carries the full tokenised URL; the printed text stays short and human:
  // scan the QR, or enter the certificate number at the verify page.
  const verifyUrl = `${APP}/certificate/verify/${cert.verification_token}`
  drawQr(page, verifyUrl, 48, 44, 64)
  page.drawText(t.verify, { x: 120, y: 88, size: 8, font: sansB, color: muted })
  page.drawText('hero.iqiaggroup.com/certificate/verify', { x: 120, y: 76, size: 7.5, font: sans, color: muted })
  page.drawText(`${t.number} ${cert.certificate_number}`, { x: 120, y: 60, size: 8.5, font: sansB, color: ink })
  page.drawText(`${t.issued} ${fmtDate(cert.issued_at, lang, s.country)}`, { x: 120, y: 48, size: 8, font: sans, color: muted })
  if (t.footer) { const fw = sans.widthOfTextAtSize(t.footer, 7.5); page.drawText(t.footer, { x: W - 48 - fw, y: 48, size: 7.5, font: sans, color: muted }) }
  if (cert.status === 'revoked') {
    page.drawText('REVOKED', { x: W / 2 - 140, y: H / 2 - 30, size: 72, font: sansB, color: rgb(0.85, 0.2, 0.2), opacity: 0.25, rotate: degrees(20) })
  }
  return await pdf.save()
}
function hex(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return rgb(0.69, 0.54, 0.23); const n = parseInt(m[1], 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }

async function storePdf(env, cert, bytes) {
  const path = `${cert.country}/${new Date(cert.issued_at).getFullYear()}/${cert.certificate_number}.pdf`
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/certificates/${path}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes,
  })
  if (!res.ok) throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 120)}`)
  await rest(env, `/issued_certificates?id=eq.${cert.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ pdf_path: path, pdf_error: null, updated_at: new Date().toISOString() }) })
  return path
}
async function signedUrl(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/certificates/${path}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...JSON_HEADERS },
    body: JSON.stringify({ expiresIn: 3600 }),
  })
  const b = await res.json().catch(() => null)
  return b?.signedURL ? `${env.SUPABASE_URL}/storage/v1${b.signedURL}` : null
}
async function ensurePdf(env, cert) {
  if (cert.pdf_path) return cert.pdf_path
  try {
    const bytes = await renderCertificatePdf(env, cert)
    return await storePdf(env, cert, bytes)
  } catch (e) {
    await rest(env, `/issued_certificates?id=eq.${cert.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ pdf_error: String(e).slice(0, 300) }) })
    throw e
  }
}

/* ---------- admin: render (re-render) ---------- */
export async function handleCertRender(request, env, corsHeaders) {
  const cors = corsHeaders(request)
  const reply = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  let b; try { b = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt || !b?.certificate_id) return reply({ error: 'token + certificate_id required' }, 401)
  // authorisation = can the caller READ this certificate under RLS?
  const mine = await rest(env, `/issued_certificates?id=eq.${b.certificate_id}&select=id`, {}, jwt)
  if (!mine.ok || !mine.body?.length) return reply({ error: 'not authorised' }, 403)
  const r = await rest(env, `/issued_certificates?id=eq.${b.certificate_id}&select=*`)
  const cert = r.body?.[0]
  if (!cert) return reply({ error: 'not found' }, 404)
  try {
    const bytes = await renderCertificatePdf(env, cert)
    const path = await storePdf(env, cert, bytes)
    const url = await signedUrl(env, path)
    return reply({ ok: true, pdf_path: path, url })
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500)
  }
}

/* ---------- admin: preview a template design with sample data (no number minted) ---------- */
export async function handleCertPreview(request, env, corsHeaders) {
  const cors = corsHeaders(request)
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...JSON_HEADERS, ...cors } })
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jwt) return new Response(JSON.stringify({ error: 'token required' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } })
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` } })
  if (!who.ok) return new Response(JSON.stringify({ error: 'invalid session' }), { status: 401, headers: { ...JSON_HEADERS, ...cors } })
  const uid = (await who.json())?.id
  const me = (await rest(env, `/profiles?id=eq.${uid}&select=role,module_admin`)).body?.[0]
  const allowed = me && (['master_admin', 'country_admin'].includes(me.role) || (me.module_admin || []).includes('certificates'))
  if (!allowed) return new Response(JSON.stringify({ error: 'not authorised' }), { status: 403, headers: { ...JSON_HEADERS, ...cors } })
  let b; try { b = await request.json() } catch { return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400, headers: { ...JSON_HEADERS, ...cors } }) }
  const lang = b.language || 'en'
  const country = b.country || 'MY'
  const cert = {
    id: 'preview', country, language: lang, status: 'issued',
    recipient_name: b.sample_name || 'Nur Aisyah binti Rahman',
    certificate_number: `AG-${country}-${new Date().getFullYear()}-PREVIEW`,
    verification_token: 'preview'.padEnd(48, '0'), access_token: 'preview'.padEnd(48, '0'),
    issued_at: new Date().toISOString(),
    snapshot_json: {
      event_title: b.sample_event || 'AG Leadership Programme', session_title: b.sample_session || 'Day 1 · Physical',
      event_date: b.sample_date || new Date().toISOString(), venue: b.sample_venue || 'IQI HQ', country,
      certificate_title: b.certificate_title || null, orientation: b.orientation || 'landscape',
      layout: b.layout_json || {}, text: b.text_json || {}, assets: b.assets_json || {}, signatories: b.signatories_json || [],
    },
  }
  try {
    const bytes = await renderCertificatePdf(env, cert)
    return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="certificate-preview.pdf"', ...cors } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 200) }), { status: 500, headers: { ...JSON_HEADERS, ...cors } })
  }
}

/* ---------- participant: PDF download by access token ---------- */
export async function handleCertPdf(request, env) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t') || ''
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Not found', { status: 404 })
  const r = await rest(env, `/issued_certificates?access_token=eq.${token}&select=*`)
  const cert = r.body?.[0]
  if (!cert) return new Response('Not found', { status: 404 })
  try {
    const path = await ensurePdf(env, cert)
    const signed = await signedUrl(env, path)
    if (!signed) return new Response('PDF unavailable', { status: 500 })
    return Response.redirect(signed, 302)
  } catch (e) {
    return new Response('PDF unavailable: ' + String(e).slice(0, 120), { status: 500 })
  }
}

/* ---------- cron: send queued certificate emails through Resend ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fill = (tpl, vars) => String(tpl ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => esc(vars[k] ?? ''))

const DEFAULT_EMAIL = {
  en: { subject: 'Your Certificate of Attendance — {{event_title}}', heading: 'Certificate of Attendance',
    body: 'Hi {{participant_name}},\n\nThank you for attending {{event_title}}.\nYour Certificate of Attendance has been issued.\n\nCertificate No: {{certificate_number}}',
    cta: 'View Certificate', footer: 'Thank you for being part of the programme. — IQI AG Group' },
  'ms-MY': { subject: 'Sijil Kehadiran Anda — {{event_title}}', heading: 'Sijil Kehadiran',
    body: 'Hai {{participant_name}},\n\nTerima kasih kerana menghadiri {{event_title}}.\nSijil Kehadiran anda telah dikeluarkan.\n\nNo. Sijil: {{certificate_number}}',
    cta: 'Lihat Sijil', footer: 'Terima kasih kerana menjadi sebahagian daripada program ini. — IQI AG Group' },
  'id-ID': { subject: 'Sertifikat Kehadiran Anda — {{event_title}}', heading: 'Sertifikat Kehadiran',
    body: 'Halo {{participant_name}},\n\nTerima kasih telah menghadiri {{event_title}}.\nSertifikat Kehadiran Anda telah diterbitkan.\n\nNo. Sertifikat: {{certificate_number}}',
    cta: 'Lihat Sertifikat', footer: 'Terima kasih telah menjadi bagian dari program ini. — IQI AG Group' },
}

/* Deliver ONE queued row. Shared by the cron and by the admin's Send button so
   both take exactly the same path — the button used to only queue, leaving the
   admin watching "Queued" for up to five minutes with no way to tell whether
   anything was happening. */
async function deliverOne(env, d) {
  {
    const c = (await rest(env, `/issued_certificates?id=eq.${d.certificate_id}&select=*`)).body?.[0]
    if (!c || c.status !== 'issued') {
      /* Not a delivery failure — no mail was ever attempted. Recording these as
         'failed' sent the admin hunting for a bounce or a provider outage when
         the truth was that the certificate had been revoked or replaced between
         pressing Send and this run. See migration 094. */
      const why = !c ? 'The certificate no longer exists — nothing was emailed.'
        : c.status === 'revoked' ? 'Certificate revoked before this email was sent — nothing was emailed.'
        : c.status === 'superseded' ? 'Certificate was replaced before this email was sent — nothing was emailed. Send the replacement instead.'
        : `Certificate is ${c.status} — nothing was emailed.`
      await rest(env, `/certificate_email_deliveries?id=eq.${d.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled', error: why }) })
      return { status: 'cancelled', error: why }
    }
    const tpl = d.email_template_id
      ? (await rest(env, `/certificate_email_templates?id=eq.${d.email_template_id}&select=*`)).body?.[0] : null
    const lang = c.language || 'en'
    const base = DEFAULT_EMAIL[lang] || DEFAULT_EMAIL.en
    const s = c.snapshot_json || {}
    const vars = {
      participant_name: c.recipient_name, event_title: s.event_title, session_title: s.session_title,
      event_date: s.event_date ? fmtDate(s.event_date, lang, c.country) : '',
      certificate_title: s.certificate_title || textFor(s, lang).title, certificate_number: c.certificate_number,
      certificate_url: `${APP}/certificate/${c.access_token}`,
      pdf_url: `${WORKER}/cert/pdf?t=${c.access_token}`,
      verification_url: `${APP}/certificate/verify/${c.verification_token}`,
      country: c.country,
    }
    const subject = fill(tpl?.subject || base.subject, vars)
    const heading = fill(tpl?.heading || base.heading, vars)
    const body = fill(tpl?.body || base.body, vars).replace(/\n/g, '<br>')
    const cta = fill(tpl?.cta_label || base.cta, vars)
    const footer = fill(tpl?.footer || base.footer, vars)
    const html = `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Arial,Helvetica,sans-serif;color:#1a1a1f">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
 <div style="background:#0b0b0d;border-radius:16px 16px 0 0;padding:22px 24px;text-align:center">
  <p style="margin:0;color:#d4af37;letter-spacing:.2em;font-size:11px;font-weight:700">IQI AG HERO</p>
  <h1 style="margin:6px 0 0;color:#fff;font-size:22px">${esc(heading)}</h1>
 </div>
 <div style="background:#fff;padding:26px 24px;border-radius:0 0 16px 16px;border:1px solid #e6e1d3;border-top:0">
  <p style="font-size:15px;line-height:1.6;margin:0 0 18px">${body}</p>
  <p style="text-align:center;margin:22px 0"><a href="${vars.certificate_url}" style="background:#d4af37;color:#1a1407;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:12px;display:inline-block">${esc(cta)}</a></p>
  <p style="font-size:13px;color:#555;margin:0 0 8px"><a href="${vars.pdf_url}" style="color:#8a6d1f">⬇ PDF</a> · <a href="${vars.verification_url}" style="color:#8a6d1f">✓ ${esc(textFor(s, lang).verify)}</a></p>
  <p style="font-size:12px;color:#777;margin:18px 0 0">${esc(footer)}</p>
 </div>
 <p style="text-align:center;font-size:11px;color:#999;margin:14px 0 0">${esc(vars.certificate_number)}</p>
</div></body></html>`
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_KEY}`, ...JSON_HEADERS },
        body: JSON.stringify({ from: 'IQI AG Hero <reply@iqiaggroup.com>', to: [d.to_email], subject, html }),
      })
      const out = await res.json().catch(() => ({}))
      if (res.ok && out.id) {
        await rest(env, `/certificate_email_deliveries?id=eq.${d.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'sent', provider_id: out.id, sent_at: new Date().toISOString() }) })
        return { status: 'sent', provider_id: out.id }
      }
      const err = (out?.message || `resend ${res.status}`).slice(0, 300)
      await rest(env, `/certificate_email_deliveries?id=eq.${d.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', error: err }) })
      return { status: 'failed', error: err }
    } catch (e) {
      const err = String(e).slice(0, 300)
      await rest(env, `/certificate_email_deliveries?id=eq.${d.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', error: err }) })
      return { status: 'failed', error: err }
    }
  }
}

function tally(results) {
  const t = { sent: 0, failed: 0, cancelled: 0 }
  for (const r of results) if (t[r.status] !== undefined) t[r.status]++
  return t
}

/* cron safety net — drains whatever the immediate send missed */
export async function processCertEmails(env) {
  if (!env.RESEND_KEY) return { skipped: 'no RESEND_KEY' }
  const q = await rest(env, `/certificate_email_deliveries?status=eq.queued&select=*&order=queued_at&limit=20`)
  const rows = q.body || []
  const results = []
  for (const d of rows) results.push(await deliverOne(env, d))
  return { processed: rows.length, ...tally(results) }
}

/* POST /cert/send {certificate_ids:[...]} — admin JWT. Sends NOW rather than
   leaving the row for the next cron tick. */
export async function handleCertSend(request, env, corsHeaders) {
  const cors = corsHeaders(request)
  const reply = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...JSON_HEADERS, ...cors } })
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405)
  if (!env.RESEND_KEY) return reply({ error: 'email is not configured on this worker' }, 503)
  let b; try { b = await request.json() } catch { return reply({ error: 'bad payload' }, 400) }
  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  const ids = Array.isArray(b?.certificate_ids) ? b.certificate_ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : []
  if (!jwt || !ids.length) return reply({ error: 'token + certificate_ids required' }, 401)
  if (ids.length > 50) return reply({ error: 'at most 50 at a time' }, 400)

  // authorisation = the caller must be able to READ these certificates under RLS
  const inList = `(${ids.join(',')})`
  const mine = await rest(env, `/issued_certificates?id=in.${inList}&select=id`, {}, jwt)
  if (!mine.ok) return reply({ error: 'not authorised' }, 403)
  const allowed = new Set((mine.body || []).map((x) => x.id))
  if (!allowed.size) return reply({ error: 'not authorised' }, 403)

  const q = await rest(env, `/certificate_email_deliveries?status=eq.queued&certificate_id=in.${
    `(${[...allowed].join(',')})`}&select=*&order=queued_at`)
  const rows = q.body || []
  const results = []
  for (const d of rows) results.push(await deliverOne(env, d))
  return reply({ ok: true, processed: rows.length, ...tally(results), results })
}
