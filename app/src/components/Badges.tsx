/* Rank & position badges — the game-style identity row beside a warrior's name.
   Career ranks render as metallic gradient pills (the ladder's own metal
   colours, silver REN → red VP, like game league badges); positions render as
   small circular tokens that stack with a slight overlap, each with its own
   ring colour. Pure CSS — no image assets, so they render instantly anywhere:
   People & Roles today, Team/leaderboards later. */

const METALS: Record<string, { bg: string; fg: string; edge: string; star?: boolean }> = {
  REN: { bg: 'linear-gradient(160deg,#eceef2 10%,#9ba0ab 90%)', fg: '#1a1d24', edge: '#f6f7f9' },
  L:   { bg: 'linear-gradient(160deg,#e2a660 10%,#8c5a2b 90%)', fg: '#241304', edge: '#f0c894' },
  TL:  { bg: 'linear-gradient(160deg,#7cc0e8 10%,#2b6f9e 90%)', fg: '#06202f', edge: '#b8e0f5' },
  HOT: { bg: 'linear-gradient(160deg,#f5d76e 10%,#b8892a 90%)', fg: '#2a1d02', edge: '#fbe9a8' },
  TM:  { bg: 'linear-gradient(160deg,#c49ae8 10%,#6d3fa8 90%)', fg: '#ffffff', edge: '#dcc2f2', star: true },
  VP:  { bg: 'linear-gradient(160deg,#f0525e 10%,#a00d1e 90%)', fg: '#ffffff', edge: '#f7949c', star: true },
}

export function RankBadge({ rank }: { rank: string | null }) {
  const r = rank ?? 'REN'
  const m = METALS[r] ?? METALS.REN
  return (
    <span title={`Career rank: ${r}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        padding: '1px 7px', borderRadius: 7,
        background: m.bg, color: m.fg,
        fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
        border: '1px solid rgba(0,0,0,.35)',
        boxShadow: `inset 0 1px 0 ${m.edge}, 0 1px 2px rgba(0,0,0,.45)`,
        textShadow: m.fg === '#ffffff' ? '0 1px 1px rgba(0,0,0,.4)' : 'none',
        lineHeight: '14px', verticalAlign: 'middle',
      }}>
      {m.star && <span style={{ fontSize: 8 }}>★</span>}{r}
    </span>
  )
}

/* position tokens: small circles that stack like a team-avatar row */
const TOKENS: Record<string, { icon: string; ring: string; bg: string; label: string }> = {
  captain:       { icon: '👑', ring: '#f5c542', bg: 'rgba(245,197,66,.16)', label: 'Captain — Tim Elit pod leader' },
  elite:         { icon: '⚔️', ring: '#8a9a4a', bg: 'rgba(138,154,74,.18)', label: 'Tim Elit member' },
  elite_coach:   { icon: '🛡️', ring: '#22c55e', bg: 'rgba(34,197,94,.15)', label: 'Elite Coach — approves evidence' },
  master_mentor: { icon: '🎓', ring: '#d4ac4a', bg: 'rgba(212,172,74,.16)', label: 'Master Mentor' },
  super_admin:   { icon: '🔑', ring: '#ef4444', bg: 'rgba(239,68,68,.15)', label: 'Super Admin' },
}

export function PosToken({ kind, first }: { kind: keyof typeof TOKENS; first?: boolean }) {
  const t = TOKENS[kind]
  if (!t) return null
  return (
    <span title={t.label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 19, height: 19, borderRadius: '50%',
        background: t.bg, border: `1.5px solid ${t.ring}`,
        fontSize: 10, lineHeight: 1,
        marginLeft: first ? 0 : -5,           // the overlapping-stack look
        boxShadow: kind === 'captain' ? `0 0 6px ${t.ring}88` : '0 1px 2px rgba(0,0,0,.4)',
        verticalAlign: 'middle',
      }}>
      {t.icon}
    </span>
  )
}

/* the full identity row — rank pill + every held position, ready anywhere */
export function BadgeRow({ rank, captain, elite, positions }: {
  rank: string | null; captain?: boolean; elite?: boolean; positions?: string[]
}) {
  const tokens: (keyof typeof TOKENS)[] = []
  if (captain) tokens.push('captain')
  else if (elite) tokens.push('elite')
  for (const p of positions ?? []) if (p in TOKENS) tokens.push(p as keyof typeof TOKENS)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <RankBadge rank={rank} />
      {tokens.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {tokens.map((t, i) => <PosToken key={t} kind={t} first={i === 0} />)}
        </span>
      )}
    </span>
  )
}
