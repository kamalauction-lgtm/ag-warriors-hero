/* A4 print document — TWO pages by design.
     Sheet 1: the visual profile (coloured bars + pie charts).
     Sheet 2: the written explanation, signing block and disclaimer.

   The one-page version had to truncate real content to fit, which is worse than
   an extra sheet. Splitting it means nothing is clipped: prose runs in full and
   the score lists are no longer capped at four or five rows.

   Each sheet is a fixed 210x297mm box with its own padding, so placement is
   exact and one sheet cannot bleed into the next. Colours are inline hex — the
   app's theme variables resolve to a dark palette that would print as black
   boxes — and print-color-adjust in index.css stops the browser stripping them
   to save ink. */
import type { Report } from './TalentReport'

export interface PrintScores {
  participant?: { preferred_name?: string | null; full_name?: string | null }
  dimensions: Record<string, { score: number | null; band: string | null }>
  roles: { key: string; score: number | null; band: string | null }[]
  motivations: { key: string; score: number | null }[]
  demotivators: { key: string; score: number | null }[]
}

const GOLD = '#a8842a'
const INK = '#15171c'
const MUTED = '#5f646d'          // 4.9:1 on white
const RULE = '#e2ddd0'

/* Print palette: saturated enough to stay distinct on paper and after a
   greyscale photocopy, and none of them vibrate against the gold. */
const PAL = ['#b8912f', '#2f6f9f', '#3f9e7c', '#c2603c', '#6f5aa8',
             '#d3a52f', '#4a90c2', '#5cae8c', '#dc8b6b', '#9683c9', '#8a9099']

const P: Record<string, Record<string, string>> = {
  en: {
    programme: 'AG LEADERSHIP PROGRAMME', doc: 'Personal Talent Profile',
    compass: 'Hero Talent Compass', preparedFor: 'Prepared for', issued: 'Issued',
    page2: 'What it means',
    profile: 'Summary of your profile', explain: 'What each pathway means',
    strengths: 'Natural strengths', pathways: 'Pathway fit',
    style: 'Working style', ent: 'Entrepreneurial readiness', success: 'Success drive',
    motivates: 'What drives you', drains: 'What drains you', next: 'Things to test next',
    dev: 'Development opportunities', blind: 'Possible blind spots',
    coach: 'Questions for your coach',
    verified: 'Issued and verified by', signatory: 'PMgr Ts Kamal AG',
    role: 'AG Leadership Programme', signature: 'KamalAbdGhafur',
    scale: 'Every figure is scored 0–100 from your own answers',
    confidential: 'Private and confidential', important: 'Important',
    sheet: 'Page', of: 'of',
  },
  'ms-MY': {
    programme: 'AG LEADERSHIP PROGRAMME', doc: 'Profil Bakat Peribadi',
    compass: 'Hero Talent Compass', preparedFor: 'Disediakan untuk', issued: 'Dikeluarkan',
    page2: 'Apa maksudnya',
    profile: 'Rumusan profil anda', explain: 'Penjelasan setiap laluan',
    strengths: 'Kekuatan semula jadi', pathways: 'Kesesuaian laluan',
    style: 'Gaya kerja', ent: 'Kesediaan keusahawanan', success: 'Dorongan kejayaan',
    motivates: 'Apa yang mendorong anda', drains: 'Apa yang melemahkan anda',
    next: 'Perkara untuk dicuba seterusnya',
    dev: 'Peluang pembangunan', blind: 'Kemungkinan titik buta',
    coach: 'Soalan untuk coach anda',
    verified: 'Dikeluarkan dan disahkan oleh', signatory: 'PMgr Ts Kamal AG',
    role: 'AG Leadership Programme', signature: 'KamalAbdGhafur',
    scale: 'Setiap angka dinilai 0–100 daripada jawapan anda sendiri',
    confidential: 'Peribadi dan sulit', important: 'Penting',
    sheet: 'Muka surat', of: 'daripada',
  },
  'id-ID': {
    programme: 'AG LEADERSHIP PROGRAMME', doc: 'Profil Talenta Pribadi',
    compass: 'Hero Talent Compass', preparedFor: 'Disiapkan untuk', issued: 'Diterbitkan',
    page2: 'Apa artinya',
    profile: 'Ringkasan profil Anda', explain: 'Penjelasan setiap jalur',
    strengths: 'Kekuatan alami', pathways: 'Kecocokan jalur',
    style: 'Gaya kerja', ent: 'Kesiapan kewirausahaan', success: 'Dorongan kesuksesan',
    motivates: 'Apa yang mendorong Anda', drains: 'Apa yang menurunkan semangat Anda',
    next: 'Hal untuk dicoba berikutnya',
    dev: 'Peluang pengembangan', blind: 'Kemungkinan titik buta',
    coach: 'Pertanyaan untuk coach Anda',
    verified: 'Diterbitkan dan disahkan oleh', signatory: 'PMgr Ts Kamal AG',
    role: 'AG Leadership Programme', signature: 'KamalAbdGhafur',
    scale: 'Setiap angka dinilai 0–100 dari jawaban Anda sendiri',
    confidential: 'Pribadi dan rahasia', important: 'Penting',
    sheet: 'Halaman', of: 'dari',
  },
}

const H2: React.CSSProperties = {
  fontSize: '8pt', letterSpacing: '0.12em', textTransform: 'uppercase',
  color: GOLD, fontWeight: 800, margin: '0 0 5px',
  borderBottom: `1px solid ${RULE}`, paddingBottom: '3px',
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '9px' }}>
    <h2 style={H2}>{title}</h2>
    {children}
  </div>
)

/* Coloured bars — one hue per row, so a long list reads as a chart not a table. */
function Bars({ rows, offset = 0 }: { rows: { label: string; value: number }[]; offset?: number }) {
  if (!rows.length) return null
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '3px' }}>
          <span style={{ width: '46%', fontSize: '8pt', lineHeight: 1.3, color: INK,
                         textTransform: 'capitalize' }}>{r.label}</span>
          <span style={{ flex: 1, height: '9px', background: '#f0eee8', borderRadius: '5px' }}>
            <span style={{ display: 'block', height: '100%', borderRadius: '5px',
                           width: `${Math.max(0, Math.min(100, r.value))}%`,
                           background: PAL[(i + offset) % PAL.length] }} />
          </span>
          <b style={{ width: '21px', textAlign: 'right', fontSize: '7.6pt', color: INK }}>
            {Math.round(r.value)}
          </b>
        </div>
      ))}
    </div>
  )
}

/* Pie. One circle per slice using stroke-dasharray — the most reliable way to
   get an accurate pie through a print pipeline, with no library. */
function Pie({ rows, size = 92, offset = 0 }: {
  rows: { label: string; value: number }[]; size?: number; offset?: number
}) {
  if (!rows.length) return null
  const total = rows.reduce((t, r) => t + r.value, 0) || 1
  const R = size / 2 - 1
  const circ = Math.PI * R            // circumference of the r=R/2 circle
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
      <svg width={size} height={size} role="img" aria-label="distribution" style={{ flexShrink: 0 }}>
        {rows.map((row, i) => {
          const frac = row.value / total
          const el = (
            <circle key={row.label} cx={size / 2} cy={size / 2} r={R / 2} fill="none"
                    stroke={PAL[(i + offset) % PAL.length]} strokeWidth={R}
                    strokeDasharray={`${frac * circ} ${circ}`}
                    strokeDashoffset={-acc * circ}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
          acc += frac
          return el
        })}
      </svg>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', flex: 1 }}>
        {rows.map((row, i) => (
          <li key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '5px',
                                       fontSize: '7.4pt', marginBottom: '3px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
                           background: PAL[(i + offset) % PAL.length] }} />
            <span style={{ flex: 1, color: INK, textTransform: 'capitalize' }}>{row.label}</span>
            <b style={{ color: MUTED }}>{Math.round((row.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

const Bullets = ({ items, cap }: { items: string[]; cap?: boolean }) => (
  <ul style={{ margin: 0, paddingLeft: '13px' }}>
    {items.map((x, i) => (
      <li key={i} style={{ fontSize: '8.2pt', lineHeight: 1.45, color: INK, marginBottom: '3px',
                           textTransform: cap ? 'capitalize' : 'none' }}>{x}</li>
    ))}
  </ul>
)

function Masthead({ p, name, small }: { p: Record<string, string>; name: string; small?: boolean }) {
  return (
    <header style={{ textAlign: 'center', marginBottom: small ? '8px' : '10px' }}>
      <img src="/brand/ag-shield.png" alt="AG"
           style={{ width: small ? '11mm' : '16mm', height: small ? '11mm' : '16mm',
                    objectFit: 'contain', display: 'block', margin: '0 auto' }} />
      <p style={{ margin: '4px 0 0', fontSize: small ? '6.6pt' : '7.6pt',
                  letterSpacing: '0.3em', fontWeight: 800, color: GOLD }}>{p.programme}</p>
      {!small && (
        <>
          <h1 style={{ margin: '3px 0 0', fontSize: '17pt', fontWeight: 800 }}>{p.doc}</h1>
          <p style={{ margin: '2px 0 0', fontSize: '8pt', color: MUTED }}>{p.compass}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        margin: '10px auto 0', padding: '6px 16px', border: `1px solid ${RULE}`,
                        borderRadius: '6px', width: 'fit-content' }}>
            <span style={{ fontSize: '6.6pt', letterSpacing: '0.14em',
                           textTransform: 'uppercase', color: MUTED }}>{p.preparedFor}</span>
            <span style={{ fontSize: '12.5pt', fontWeight: 800 }}>{name}</span>
            <span style={{ width: '1px', height: '15px', background: RULE }} />
            <span style={{ fontSize: '7.2pt', color: MUTED }}>
              {p.issued} {new Date().toLocaleDateString()}
            </span>
          </div>
        </>
      )}
    </header>
  )
}

const Foot = ({ p, n, name }: { p: Record<string, string>; n: number; name: string }) => (
  <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: `1px solid ${RULE}`,
                display: 'flex', justifyContent: 'space-between', fontSize: '6.4pt', color: MUTED }}>
    <span>{p.compass} · {name}</span>
    <span>www.kamalag.com</span>
    <span>{p.sheet} {n} {p.of} 2</span>
  </div>
)

export default function TalentReportPrint({ report, scores, name, disclaimer }: {
  report: Report; scores: PrintScores | null; name: string; disclaimer: string
}) {
  const p = P[report.language] ?? P.en
  const lbl = report.labels ?? {}

  const fam = (prefix: string) =>
    Object.entries(scores?.dimensions ?? {})
      .filter(([k, v]) => k.startsWith(prefix + '.') && v.score !== null)
      .map(([k, v]) => ({ label: lbl.dimensions?.[k] ?? k.split('.')[1].replace(/_/g, ' '),
                          value: v.score as number }))
      .sort((a, b) => b.value - a.value)

  // only published when the bank is the position-fit one (see worker `purpose`)
  const roles = (report.roles?.length ? (scores?.roles ?? []) : []).filter((r) => (r.score ?? 0) > 0)
    .map((r) => ({ label: lbl.roles?.[r.key] ?? r.key, value: r.score ?? 0 }))
  const motiv = (scores?.motivations ?? []).filter((m) => (m.score ?? 0) > 0)
    .map((m) => ({ label: lbl.motivations?.[m.key] ?? m.key, value: m.score ?? 0 }))
  const drain = (scores?.demotivators ?? []).filter((d) => (d.score ?? 0) > 0)
    .map((d) => ({ label: lbl.demotivators?.[d.key] ?? d.key, value: d.score ?? 0 }))

  return (
    <div className="print-doc">

      {/* ================= SHEET 1 — the charts ================= */}
      <section className="print-sheet">
        <Masthead p={p} name={name} />

        {report.low_confidence && report.confidence_note && (
          <p style={{ margin: '0 0 10px', padding: '5px 8px', background: '#fdf8ea',
                      border: `1px solid ${GOLD}`, borderRadius: '4px',
                      fontSize: '7pt', lineHeight: 1.45, color: '#7a5d12' }}>
            {report.confidence_note}
          </p>
        )}

        {report.roles?.length > 0 && (
          <Group title={p.pathways}><Bars rows={roles} /></Group>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Group title={p.motivates}><Pie rows={motiv} offset={1} /></Group>
          <Group title={p.drains}><Pie rows={drain} offset={4} /></Group>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Group title={p.style}><Bars rows={fam('style')} offset={2} /></Group>
          <div>
            <Group title={p.ent}><Bars rows={fam('ent')} offset={5} /></Group>
            <Group title={p.success}><Bars rows={fam('success')} offset={7} /></Group>
          </div>
        </div>

        <p style={{ margin: '2px 0 0', fontSize: '6.8pt', color: MUTED, textAlign: 'center' }}>
          {p.scale} · {p.confidential}
        </p>

        <Foot p={p} n={1} name={name} />
      </section>

      {/* ================= SHEET 2 — the explanation ================= */}
      <section className="print-sheet">
        <Masthead p={p} name={name} small />
        <h2 style={{ ...H2, fontSize: '9pt', textAlign: 'center', borderBottom: 'none',
                     margin: '0 0 12px' }}>{p.page2}</h2>

        <Group title={p.profile}>
          <p style={{ margin: 0, fontSize: '9pt', lineHeight: 1.55, textAlign: 'justify' }}>
            {report.profile}
          </p>
          {(report.motivation_note || report.demotivation_note) && (
            <p style={{ margin: '5px 0 0', fontSize: '8.4pt', lineHeight: 1.55,
                        textAlign: 'justify', color: MUTED }}>
              {[report.motivation_note, report.demotivation_note].filter(Boolean).join(' ')}
            </p>
          )}
        </Group>

        {/* per-pathway explanation — the ranking on sheet 1, explained in words */}
        {(report.role_notes?.length ?? 0) > 0 && (
          <Group title={p.explain}>
            {report.role_notes!.map((n) => (
              <p key={n.key} style={{ margin: '0 0 4px', fontSize: '8.4pt', lineHeight: 1.5 }}>
                <b>{lbl.roles?.[n.key] ?? n.key.replace(/_/g, ' ')}</b>
                {n.readiness ? <span style={{ color: GOLD }}> · {n.readiness}</span> : null}
                {' — '}{n.why}
              </p>
            ))}
          </Group>
        )}

        {report.real_estate_application && (
          <Group title={p.page2}>
            <p style={{ margin: 0, fontSize: '8.4pt', lineHeight: 1.55, textAlign: 'justify' }}>
              {report.real_estate_application}
            </p>
          </Group>
        )}

        {report.strengths?.length > 0 && (
          <Group title={p.strengths}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {report.strengths.filter(Boolean).map((x, i) => (
                <span key={i} style={{ border: `1px solid ${PAL[i % PAL.length]}`,
                                       borderRadius: '999px', padding: '3px 10px',
                                       fontSize: '8pt', color: PAL[i % PAL.length],
                                       textTransform: 'capitalize' }}>{x}</span>
              ))}
            </div>
          </Group>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {report.development?.filter(Boolean).length > 0 && (
            <Group title={p.dev}><Bullets items={report.development.filter(Boolean)} cap /></Group>
          )}
          {report.blind_spots?.filter(Boolean).length > 0 && (
            <Group title={p.blind}><Bullets items={report.blind_spots.filter(Boolean)} cap /></Group>
          )}
        </div>

        {report.experiments?.filter(Boolean).length > 0 && (
          <Group title={p.next}><Bullets items={report.experiments.filter(Boolean)} /></Group>
        )}

        {report.coach_questions && report.coach_questions.filter(Boolean).length > 0 && (
          <Group title={p.coach}><Bullets items={report.coach_questions.filter(Boolean)} /></Group>
        )}

        {/* ---------- signing block: real space to sign by hand ---------- */}
        <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: `2px solid ${GOLD}`,
                      textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '6.8pt', letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: MUTED }}>{p.verified}</p>
          {/* The signature itself. Falls back through two system script faces, so
              if Great Vibes fails to load the line still reads as a signature
              rather than collapsing into the body font. */}
          <p style={{ margin: '4px 0 -4px', fontSize: '25pt', lineHeight: 1.05, color: '#1b2a5e',
                      fontFamily: "'Great Vibes', 'Segoe Script', 'Brush Script MT', cursive",
                      fontWeight: 400 }}>
            {p.signature}
          </p>
          <div style={{ width: '76mm', height: '1px', background: INK, margin: '0 auto 4px' }} />
          <p style={{ margin: 0, fontSize: '13pt', fontWeight: 800 }}>{p.signatory}</p>
          <p style={{ margin: '2px 0 0', fontSize: '7.6pt', color: MUTED }}>{p.role}</p>
          <p style={{ margin: '2px 0 0', fontSize: '8pt', fontWeight: 700, color: GOLD }}>
            www.kamalag.com
          </p>
        </div>

        <div style={{ marginTop: '12px' }}>
          <p style={{ margin: '0 0 3px', fontSize: '6.4pt', letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: MUTED }}>{p.important}</p>
          <p style={{ margin: 0, fontSize: '6.4pt', lineHeight: 1.5, color: MUTED,
                      textAlign: 'justify' }}>{disclaimer}</p>
        </div>

        <Foot p={p} n={2} name={name} />
      </section>
    </div>
  )
}
