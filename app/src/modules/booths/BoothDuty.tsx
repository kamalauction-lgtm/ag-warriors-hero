/* Booth duty signup (old M7) — mounted on the Team page.
   Upcoming booths for the agent's country; per day × shift (AM/PM/FULL) the
   warrior signs themselves up or withdraws. The roster is open — everyone sees
   who is standing duty, because a booth is a team commitment. RLS from 043:
   self-manage own rows, admins manage anyone's. */
import { useCallback, useEffect, useState } from 'react'
import { Tent, MapPin, Check } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'
import { useL } from '../learn/LessonEngine'

interface Booth {
  id: string; title: string; location: string | null
  date_start: string | null; date_end: string | null; country: string
}
interface Signup { booth_id: string; agent_id: string; on_date: string; shift: string }

const SHIFTS = ['AM', 'PM', 'FULL'] as const

const dayList = (b: Booth): string[] => {
  if (!b.date_start) return []
  const out: string[] = []
  const d = new Date(b.date_start + 'T00:00:00')
  const end = new Date((b.date_end ?? b.date_start) + 'T00:00:00')
  while (d <= end && out.length < 7) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export default function BoothDuty() {
  const { user, locale } = useApp()
  const L = useL()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [booths, setBooths] = useState<Booth[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const today = new Date().toISOString().slice(0, 10)
    const { data: b } = await supabase.from('booths')
      .select('id,title,location,date_start,date_end,country')
      .eq('country', user.country).gte('date_end', today).order('date_start')
    const rows = (b as Booth[]) ?? []
    setBooths(rows)
    if (!rows.length) return
    const { data: s } = await supabase.from('booth_signups')
      .select('booth_id,agent_id,on_date,shift')
      .in('booth_id', rows.map((x) => x.id))
    const su = (s as Signup[]) ?? []
    setSignups(su)
    const ids = [...new Set(su.map((x) => x.agent_id))]
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id,name').in('id', ids)
      setNames(Object.fromEntries(((p ?? []) as { id: string; name: string }[])
        .map((x) => [x.id, x.name.split(' ')[0]])))
    }
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const toggle = async (booth: Booth, date: string, shift: string) => {
    if (!supabase || !user) return
    const key = `${booth.id}|${date}|${shift}`
    setBusy(key)
    const mine = signups.some((s) =>
      s.booth_id === booth.id && s.on_date === date && s.shift === shift && s.agent_id === user.id)
    if (mine) {
      await supabase.from('booth_signups').delete()
        .eq('booth_id', booth.id).eq('agent_id', user.id).eq('on_date', date).eq('shift', shift)
    } else {
      await supabase.from('booth_signups').insert({
        booth_id: booth.id, agent_id: user.id, on_date: date, shift,
      })
    }
    setBusy('')
    load()
  }

  if (!isReal || booths.length === 0) return null

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(locale === 'id' ? 'id-ID' : locale === 'bm' ? 'ms-MY' : 'en-MY',
      { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <>
      <SectionTitle>
        <Tent size={13} className="mr-1 inline text-accent" />
        {L('Booth duty — sign up', 'Tugas booth — daftar diri', 'Tugas booth — daftar diri')}
      </SectionTitle>
      {booths.map((b) => (
        <Card key={b.id} className="mb-3 p-4">
          <div className="mb-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-extrabold">{b.title}</p>
            {b.date_start && (
              <Chip tone="accent">
                {fmtDate(b.date_start)}{b.date_end && b.date_end !== b.date_start ? ` – ${fmtDate(b.date_end)}` : ''}
              </Chip>
            )}
          </div>
          {b.location && (
            <p className="mb-2 flex items-center gap-1 text-[11px] text-muted">
              <MapPin size={11} /> {b.location}
            </p>
          )}
          {dayList(b).map((date) => (
            <div key={date} className="border-t border-border py-2">
              <p className="mb-1.5 text-[11px] font-bold text-muted">{fmtDate(date)}</p>
              <div className="flex gap-1.5">
                {SHIFTS.map((shift) => {
                  const here = signups.filter((s) =>
                    s.booth_id === b.id && s.on_date === date && s.shift === shift)
                  const mine = !!user && here.some((s) => s.agent_id === user.id)
                  const key = `${b.id}|${date}|${shift}`
                  return (
                    <button key={shift} type="button" disabled={busy === key}
                      onClick={() => toggle(b, date, shift)}
                      className={clsx('flex-1 cursor-pointer rounded-xl border p-2 text-center transition-colors disabled:opacity-50',
                        mine ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50')}>
                      <span className={clsx('block text-xs font-extrabold', mine && 'text-accent')}>
                        {mine && <Check size={11} className="mr-0.5 inline" />}{shift}
                      </span>
                      <span className="block truncate text-[9px] text-muted">
                        {here.length === 0
                          ? L('empty', 'kosong', 'kosong')
                          : here.slice(0, 3).map((s) => names[s.agent_id] ?? '·').join(', ')
                            + (here.length > 3 ? ` +${here.length - 3}` : '')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </Card>
      ))}
    </>
  )
}
