/* Career Path — ladder rows come from career_ladder (admin-editable, seeded 1:1
   from production career_ladder.json; the hardcoded copy below is the offline
   fallback). Progress is REAL: career_progress() (062) sums closed deals this
   year — personal, whole leader_id tree for group, direct downline by rank. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Lock, Users2, User, Wallet, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { compactMoney } from '../lib/format'
import { Bar, Card, Chip } from '../components/ui'

interface Rank {
  code: string; name: string; color: string; personal: number | null; group: number | null
  dn: string | null; focus: string; approval?: boolean; note?: string
}
const COMMON: [string, string, string][] = [
  [
    'Personal & group sales must be converted by 15 January of the subsequent year.',
    'Jualan peribadi & kumpulan mesti ditukar (converted) sebelum 15 Januari tahun berikutnya.',
    'Penjualan pribadi & grup harus dikonversi sebelum 15 Januari tahun berikutnya.',
  ],
  [
    'TM and VP ranks require an interview with management and are subject to management approval.',
    'Pangkat TM dan VP memerlukan temu duga dengan pihak pengurusan dan tertakluk kepada kelulusan pengurusan.',
    'Peringkat TM dan VP memerlukan wawancara dengan manajemen dan tunduk pada persetujuan manajemen.',
  ],
  [
    'Maintenance: each rank must sustain 50% of its eligibility criteria to hold the rank.',
    'Penyelenggaraan: setiap pangkat mesti mengekalkan 50% syarat kelayakannya untuk kekal di pangkat itu.',
    'Pemeliharaan: setiap peringkat harus mempertahankan 50% syarat kelayakannya untuk menjaga peringkat.',
  ],
]
/* client-side focus translations keyed by rank code — the ladder rows come from
   the DB (English focus); when locale !== 'en' we overlay [bm, id] here and
   fall back to the DB focus for unknown codes. */
const FOCUS_L: Record<string, [string, string]> = {
  VP: [
    'Puncak tangga — pimpin rangkaian pengurus. Perlu temu duga & kelulusan pihak pengurusan.',
    'Puncak jenjang — pimpin jaringan manajer. Perlu wawancara & persetujuan manajemen.',
  ],
  TM: [
    'Pangkat pembina — anda kini membangunkan pemimpin, bukan sekadar jualan peribadi. Perlu temu duga & kelulusan pihak pengurusan.',
    'Peringkat pembangun — kamu kini menumbuhkan pemimpin, bukan cuma penjualan pribadi. Perlu wawancara & persetujuan manajemen.',
  ],
  HOT: [
    'Kemuncak jualan peribadi — jualan peribadi yang kukuh serta kumpulan yang besar.',
    'Puncak produksi pribadi — penjualan pribadi yang kuat plus grup yang besar.',
  ],
  TL: [
    'Tingkatkan jualan kumpulan dan besarkan pasukan terus anda.',
    'Tingkatkan penjualan grup dan perluas tim langsungmu.',
  ],
  L: [
    'Anak tangga kepimpinan pertama anda — capai jualan peribadi dan mulakan pasukan kecil.',
    'Anak tangga kepemimpinan pertamamu — capai penjualan pribadi dan mulai tim kecil.',
  ],
  REN: [
    'Mula di sini. Bina jualan pertama anda dan pelajari perjalanannya.',
    'Mulai di sini. Bangun penjualan pertamamu dan pelajari perjalanannya.',
  ],
}
const LADDERS: Record<'MY' | 'ID', Rank[]> = {
  MY: [
    { code: 'VP', name: 'Vice President (VP)', color: '#C8102E', personal: null, group: 250000000, dn: '5 TM', focus: 'Top of the ladder — lead a network of managers. Requires management interview + approval.', approval: true, note: 'KL' },
    { code: 'TM', name: 'Team Manager (TM)', color: '#8C5BB0', personal: null, group: 120000000, dn: '3 HOT', focus: 'Builder rank — you now grow leaders, not just personal sales. Requires management interview + approval.', approval: true },
    { code: 'HOT', name: 'Head of Team (HOT)', color: '#C8A064', personal: 10000000, group: 50000000, dn: '6 REN', focus: 'Peak personal producer — strong personal sales plus a sizeable group.' },
    { code: 'TL', name: 'Team Leader (TL)', color: '#4FA3D1', personal: 5000000, group: 25000000, dn: '3 REN', focus: 'Grow your group sales and expand your direct team.' },
    { code: 'L', name: 'Leader (L)', color: '#CD7F32', personal: 3000000, group: 15000000, dn: '2 REN', focus: 'Your first leadership rung — hit personal sales and start a small team.' },
    { code: 'REN', name: 'REN — Real Estate Negotiator', color: '#C0C0C0', personal: null, group: null, dn: null, focus: 'Start here. Build your first sales and learn the journey.' },
  ],
  ID: [
    { code: 'VP', name: 'Vice President (VP)', color: '#C8102E', personal: null, group: 850000000000, dn: '5 TM', focus: 'Top of the ladder — lead a network of managers. Requires management interview + approval.', approval: true },
    { code: 'TM', name: 'Team Manager (TM)', color: '#8C5BB0', personal: null, group: 400000000000, dn: '3 HOT', focus: 'Builder rank — you now grow leaders, not just personal sales. Requires management interview + approval.', approval: true },
    { code: 'HOT', name: 'Head of Team (HOT)', color: '#C8A064', personal: 30000000000, group: 150000000000, dn: '6 REN', focus: 'Peak personal producer — strong personal sales plus a sizeable group.' },
    { code: 'TL', name: 'Team Leader (TL)', color: '#4FA3D1', personal: 15000000000, group: 60000000000, dn: '3 REN', focus: 'Grow your group sales and expand your direct team.' },
    { code: 'L', name: 'Leader (L)', color: '#CD7F32', personal: 8000000000, group: 30000000000, dn: '2 REN', focus: 'Your first leadership rung — hit personal sales and start a small team.' },
    { code: 'REN', name: 'REN — Real Estate Negotiator', color: '#C0C0C0', personal: null, group: null, dn: null, focus: 'Start here. Build your first sales and learn the journey.' },
  ],
}

interface Progress { personal: number; group: number; direct: Record<string, number> }

export default function Career() {
  const { user, t, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const focusOf = (r: Rank) => {
    if (locale === 'en') return r.focus
    const o = FOCUS_L[r.code]
    return o ? (locale === 'bm' ? o[0] : o[1]) : r.focus
  }
  const [open, setOpen] = useState<string | null>(null)
  const [dbLadder, setDbLadder] = useState<Rank[] | null>(null)
  const [prog, setProg] = useState<Progress | null>(null)
  const isReal = supabaseReady && !!user && user.id.includes('-')

  useEffect(() => {
    if (!isReal || !supabase || !user) return
    supabase.from('career_ladder')
      .select('code,name,color,personal_sales,group_sales,group_note,downline_req,requires_approval,focus')
      .eq('country', user.country).order('ord', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return
        setDbLadder((data as {
          code: string; name: string; color: string; personal_sales: number | null
          group_sales: number | null; group_note: string | null; downline_req: string | null
          requires_approval: boolean; focus: string | null
        }[]).map((r) => ({
          code: r.code, name: r.name, color: r.color, personal: r.personal_sales,
          group: r.group_sales, dn: r.downline_req, focus: r.focus ?? '',
          approval: r.requires_approval, note: r.group_note ?? undefined,
        })))
      })
    supabase.rpc('career_progress').then(({ data }) => {
      if (data) setProg(data as unknown as Progress)
    })
  }, [isReal, user])

  if (!user) return null
  const ladder = dbLadder ?? LADDERS[user.country]
  const myIdx = ladder.findIndex((r) => r.code === user.careerRank)
  const next = myIdx > 0 ? ladder[myIdx - 1] : null
  const fmt = (v: number) => compactMoney(v, user.country)
  const pctOf = (have: number, need: number | null) =>
    need && need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0
  const directLine = prog && Object.keys(prog.direct).length
    ? Object.entries(prog.direct).map(([k, n]) => `${n} ${k}`).join(', ')
    : null

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/team" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">{t('car.title')}</h1>
          <p className="text-xs text-muted">{user.country === 'MY' ? '🇲🇾' : '🇮🇩'} · {t('car.sub')}</p>
        </div>
        <Chip tone="accent">{user.careerRank}</Chip>
      </header>

      {/* next-rank hero */}
      {next && (
        <div className="hero-user mb-4 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">{t('car.next')}</p>
          <p className="gold-text font-display text-2xl font-extrabold">{next.name}</p>
          <div className="mt-3 space-y-2.5 text-xs">
            {next.group != null && (
              <div>
                <div className="mb-1 flex justify-between">
                  <span>{t('car.group')} {prog ? `${fmt(prog.group)} / ` : ''}{fmt(next.group)}</span>
                  <b>{pctOf(prog?.group ?? 0, next.group)}%</b>
                </div>
                <Bar pct={pctOf(prog?.group ?? 0, next.group)} />
              </div>
            )}
            {next.personal != null && (
              <div>
                <div className="mb-1 flex justify-between">
                  <span>{t('car.personal')} {prog ? `${fmt(prog.personal)} / ` : ''}{fmt(next.personal)}</span>
                  <b>{pctOf(prog?.personal ?? 0, next.personal)}%</b>
                </div>
                <Bar pct={pctOf(prog?.personal ?? 0, next.personal)} />
              </div>
            )}
            {next.dn && (
              <p className="text-[11px] text-[#c9c2a8]">
                + {t('car.downline').toLowerCase()}: {next.dn}{directLine ? ` · ${t('car.youHave')} ${directLine} ${t('car.direct')}` : ''}
                {next.approval ? ` · ${t('car.interview')}` : ''}
              </p>
            )}
            <p className="text-[10px] text-[#9a9374]">{t('car.figuresNote')}</p>
          </div>
        </div>
      )}

      {/* ladder — clickable */}
      <div className="space-y-2.5">
        {ladder.map((r, i) => {
          const mine = r.code === user.careerRank
          const isOpen = open === r.code
          const builder = r.code === 'TM' || r.code === 'VP'
          return (
            <div key={r.code}>
              {r.code === 'TM' && (
                <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 p-2.5 text-[11px] font-semibold">
                  🧠 {t('car.builderNote')}
                </div>
              )}
              <Card
                onClick={() => setOpen(isOpen ? null : r.code)}
                className={clsx('overflow-hidden', mine && 'border-accent')}
              >
                <div className="flex items-center gap-3 p-3.5">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-xs font-extrabold text-white"
                    style={{ background: `linear-gradient(160deg, ${r.color}, ${r.color}99)` }}
                  >
                    {r.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {r.name} {mine && <Chip tone="accent">{L('you', 'anda', 'kamu')}</Chip>} {builder && <Lock size={11} className="inline text-muted" />}
                    </p>
                    <p className="text-[11px] text-muted">
                      {r.group != null ? `${t('car.group').toLowerCase()} ${fmt(r.group)}${r.note ? ` (${r.note})` : ''}` : t('car.entry')}
                      {r.dn ? ` · ${r.dn}` : ''}
                    </p>
                  </div>
                  <ChevronDown size={16} className={clsx('shrink-0 text-muted transition-transform duration-200', isOpen && 'rotate-180')} />
                </div>
                {isOpen && (
                  <div className="animate-rise border-t border-border bg-surface2/40 p-4">
                    <p className="mb-3 text-xs italic leading-relaxed text-muted">"{focusOf(r)}"</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><User size={11} /> {t('car.personal')}</p>
                        <p className="font-display text-sm font-extrabold">{r.personal != null ? fmt(r.personal) : '—'}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><Wallet size={11} /> {t('car.group')}</p>
                        <p className="font-display text-sm font-extrabold">{r.group != null ? fmt(r.group) : '—'}{r.note ? ` (${r.note})` : ''}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><Users2 size={11} /> {t('car.downline')}</p>
                        <p className="font-display text-sm font-extrabold">{r.dn ?? '—'}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><ShieldCheck size={11} /> {t('car.maintenance')}</p>
                        <p className="font-display text-sm font-extrabold">{i === ladder.length - 1 ? '—' : t('car.criteria')}</p>
                      </div>
                    </div>
                    {r.approval && (
                      <p className="mt-2.5 rounded-lg border border-warning/50 bg-warning/10 p-2 text-[11px] font-bold text-warning">
                        🔏 {t('car.needsApproval')}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      {/* common rules */}
      <Card className="mb-4 mt-4 p-4">
        <p className="mb-2 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{t('car.rules')}</p>
        {COMMON.map((c) => (
          <p key={c[0]} className="mb-1.5 text-[11px] leading-relaxed text-muted">• {L(c[0], c[1], c[2])}</p>
        ))}
      </Card>
    </div>
  )
}
