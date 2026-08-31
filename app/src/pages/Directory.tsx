/* Directory — leadership, hotlines and PICs, the numbers an agent needs
   mid-deal. WhatsApp-first (Kamal's standing rule: never SMS); a plain call
   link is offered too. RLS already scopes entries to the agent's country. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, BookUser } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { telHref, waHref, displayPhone } from '../lib/phone'
import { Card, Chip, SectionTitle } from '../components/ui'

interface Entry {
  id: string; category: string; name: string; role: string | null
  phone: string | null; email: string | null; note: string | null; country: string
}

export default function Directory() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [rows, setRows] = useState<Entry[] | null>(null)

  useEffect(() => {
    if (!isReal || !supabase) { setRows([]); return }
    ;(async () => {
      const { data } = await supabase.from('directory_entries')
        .select('id,category,name,role,phone,email,note,country')
        .eq('active', true).order('category').order('sort').order('name')
      setRows((data as Entry[]) ?? [])
    })()
  }, [isReal])

  if (!user) return null
  const groups = [...new Set((rows ?? []).map((r) => r.category))]

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/grow" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">{L('Directory', 'Direktori', 'Direktori')}</h1>
          <p className="text-xs text-muted">{L('Leadership · hotlines · PICs', 'Kepimpinan · talian penting · PIC', 'Pimpinan · hotline · PIC')}</p>
        </div>
      </header>

      {rows === null && <Card className="p-6 text-center text-xs text-muted">{L('Loading…', 'Memuatkan…', 'Memuat…')}</Card>}
      {rows !== null && rows.length === 0 && (
        <Card className="p-8 text-center">
          <BookUser size={26} className="mx-auto mb-2 text-muted" />
          <p className="text-sm font-bold">{L('Directory is empty', 'Direktori kosong', 'Direktori kosong')}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            {L(
              'Contacts appear here once your admin adds them in Command HQ → App Content.',
              'Kenalan akan muncul di sini setelah admin anda menambahnya dalam Command HQ → App Content.',
              'Kontak akan muncul di sini setelah admin kamu menambahkannya di Command HQ → App Content.',
            )}
          </p>
        </Card>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-4">
          <SectionTitle>{g}</SectionTitle>
          <Card className="divide-y divide-border">
            {(rows ?? []).filter((r) => r.category === g).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{r.name}
                    {r.country !== 'ALL' && <span className="ml-1.5 text-[10px] font-normal text-muted">{r.country}</span>}
                  </p>
                  <p className="text-[11px] text-muted">
                    {[r.role, r.phone && displayPhone(r.phone), r.note].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {r.phone && (
                  <>
                    {/* WhatsApp first — the AG way */}
                    <a href={waHref(r.phone!) ?? undefined} target="_blank" rel="noreferrer"
                      className="flex h-9 items-center gap-1.5 rounded-full bg-success/15 px-3.5 text-xs font-extrabold text-success">
                      WhatsApp
                    </a>
                    <a href={telHref(r.phone!) ?? undefined} aria-label={`Call ${r.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:text-ink">
                      <Phone size={14} />
                    </a>
                  </>
                )}
                {r.email && (
                  <a href={`mailto:${r.email}`} aria-label={`Email ${r.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:text-ink">
                    <Mail size={14} />
                  </a>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}

      {!isReal && (
        <Chip className="mt-2">{L(
          "Demo preview — sign in with a real account for your country's directory",
          'Pratonton demo — log masuk dengan akaun sebenar untuk direktori negara anda',
          'Pratinjau demo — masuk dengan akun asli untuk direktori negaramu',
        )}</Chip>
      )}
    </div>
  )
}
