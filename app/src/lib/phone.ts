/* One stored number, three renderings.
   Storage  : phone_norm is E.164  -> "+60123456789"   (dedupe key, never displayed raw)
   Dial     : tel: needs the "+"   -> "tel:+60123456789"
   WhatsApp : wa.me needs digits   -> "https://wa.me/60123456789"  (no +, no leading 0)

   Dialling from the raw `phone` column is what breaks calls: in the live data it
   arrives as "+60…", "60…" and "01…" interchangeably. Always start from phone_norm. */

export type Country = 'MY' | 'ID'

const CC: Record<Country, string> = { MY: '60', ID: '62' }

/** Mirror of the SQL m4u_norm_phone() so client-entered numbers match the DB. */
export function normalizePhone(raw: string | null | undefined, country: Country = 'MY'): string | null {
  if (!raw) return null
  const d = raw.replace(/[^0-9+]/g, '')
  if (!d) return null
  const cc = CC[country]
  if (d.startsWith('+')) return '+' + d.slice(1).replace(/\D/g, '')
  if (d.startsWith('00')) return '+' + d.slice(2)
  if (d.startsWith('60') || d.startsWith('62')) return '+' + d
  if (d.startsWith('0')) return '+' + cc + d.slice(1)
  return '+' + cc + d
}

/** Digits only — what wa.me and most click-to-chat APIs expect. */
export function toDigits(phoneNorm: string | null | undefined): string {
  return (phoneNorm ?? '').replace(/\D/g, '')
}

/** href for a phone call. Keeps the "+" so international leads dial correctly. */
export function telHref(phoneNorm: string | null | undefined, raw?: string | null, country: Country = 'MY'): string | null {
  const n = phoneNorm && phoneNorm.startsWith('+') ? phoneNorm : normalizePhone(phoneNorm ?? raw, country)
  return n ? `tel:${n}` : null
}

/** href for WhatsApp, with an optional prefilled message. */
export function waHref(
  phoneNorm: string | null | undefined,
  message?: string,
  raw?: string | null,
  country: Country = 'MY',
): string | null {
  const n = phoneNorm && phoneNorm.startsWith('+') ? phoneNorm : normalizePhone(phoneNorm ?? raw, country)
  const digits = toDigits(n)
  if (!digits) return null
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

/** Human-friendly display: "+60 12-345 6789" / "+62 812-3456-7890". */
export function displayPhone(phoneNorm: string | null | undefined): string {
  const n = phoneNorm ?? ''
  if (!n.startsWith('+')) return n || '—'
  const d = toDigits(n)
  if (d.startsWith('60') && d.length >= 10) return `+60 ${d.slice(2, 4)}-${d.slice(4, 7)} ${d.slice(7)}`
  if (d.startsWith('62') && d.length >= 11) return `+62 ${d.slice(2, 5)}-${d.slice(5, 9)}-${d.slice(9)}`
  return n
}

/** Flags numbers that will not dial — surfaced to admins, never hidden. */
export function phoneProblem(phoneNorm: string | null | undefined): string | null {
  const n = (phoneNorm ?? '').trim()
  if (!n) return 'missing'
  if (!n.startsWith('+')) return 'not international format'
  const d = toDigits(n)
  if (d.length < 9 || d.length > 15) return `wrong length (${d.length} digits)`
  if (/^(600|620)/.test(d)) return 'country code followed by 0'
  if (/^(6060|6262)/.test(d)) return 'country code twice'
  return null
}
