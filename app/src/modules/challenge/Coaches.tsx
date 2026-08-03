/* Challenge roles & coach assignments (Command HQ).
   Without this, every warrior's reviews fall back to the Commander. */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

const ROLES = ['elite_coach', 'master_mentor', 'super_admin'] as const
type Role = (typeof ROLES)[number]

interface Person { id: string; name: string; country: string | null; is_commander: boolean }
interface Assignment { coach_id: string; participant_id: string; active: boolean }

export default function Coaches({ realId, onSaved }: { realId: boolean; onSaved: (m: string) => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([])
  const [assigns, setAssigns] = useState<Assignment[]>([])
  const [pick, setPick] = useState({ coach: '', participant: '' })

  const load = useCallback(async () => {
    if (!realId || !supabase) return
    const [p, r, a] = await Promise.all([
      supabase.from('profiles').select('id,name,country,is_commander').order('name'),
      supabase.from('user_roles').select('user_id,role'),
      supabase.from('coach_assignments').select('coach_id,participant_id,active'),
    ])
    if (r.error) onSaved('⚠ ' + r.error.message)
    setPeople((p.data as Person[]) ?? [])
    setRoles((r.data as { user_id: string; role: string }[]) ?? [])
    setAssigns((a.data as Assignment[]) ?? [])
  }, [realId, onSaved])
  useEffect(() => { load() }, [load])

  const rpc = async (fn: string, args: object, ok: string) => {
    if (!supabase) return
    const { error } = await supabase.rpc(fn, args)
    if (error) onSaved('⚠ ' + error.message)
    else { onSaved(ok); load() }
  }

  const has = (uid: string, role: Role) => roles.some((r) => r.user_id === uid && r.role === role)
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—'
  const coaches = people.filter((p) => ROLES.some((r) => has(p.id, r)))
  const activeAssigns = assigns.filter((a) => a.active)

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account to manage roles.</Card>

  return (
    <>
      <SectionTitle>Challenge roles</SectionTitle>
      <p className="mb-3 text-xs text-muted">
        Elite Coaches review their assigned warriors. Anyone without a Coach falls back to you — assign coaches to share the load.
      </p>
      {people.map((p) => (
        <Card key={p.id} className="mb-2 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-bold">{p.country === 'ID' ? '🇮🇩' : '🇲🇾'} {p.name}</span>
          {p.is_commander && <Chip tone="accent">👑 Commander</Chip>}
          <span className="flex-1" />
          {ROLES.map((role) => (
            <button key={role} type="button"
              onClick={() => rpc('fn_set_challenge_role', { p_user: p.id, p_role: role, p_grant: !has(p.id, role) },
                has(p.id, role) ? 'Role removed' : '🎖 Role granted')}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-extrabold transition-colors ${
                has(p.id, role) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
              {has(p.id, role) ? '✓ ' : '+ '}{role.replace('_', ' ')}
            </button>
          ))}
        </Card>
      ))}

      <SectionTitle className="mt-5">Coach assignments ({activeAssigns.length})</SectionTitle>
      <Card className="mb-3 p-3.5">
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <select value={pick.coach} onChange={(e) => setPick({ ...pick, coach: e.target.value })}
            className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
            <option value="">Choose Coach…</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={pick.participant} onChange={(e) => setPick({ ...pick, participant: e.target.value })}
            className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
            <option value="">Choose warrior…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button type="button" disabled={!pick.coach || !pick.participant}
          onClick={() => rpc('fn_assign_coach', { p_participant: pick.participant, p_coach: pick.coach, p_active: true },
            '👥 Warrior assigned — both notified')}
          className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
          Assign warrior to Coach
        </button>
      </Card>
      {activeAssigns.length === 0 && (
        <Card className="p-4 text-center text-xs text-muted">
          No assignments yet — all reviews currently come to you.
        </Card>
      )}
      {activeAssigns.map((a) => (
        <Card key={a.coach_id + a.participant_id} className="mb-2 flex items-center gap-2 p-3 text-sm">
          <span className="flex-1"><b>{nameOf(a.coach_id)}</b> coaches <b>{nameOf(a.participant_id)}</b></span>
          <button type="button"
            onClick={() => rpc('fn_assign_coach', { p_participant: a.participant_id, p_coach: a.coach_id, p_active: false }, 'Assignment removed')}
            className="cursor-pointer rounded-full border border-border px-3 py-1 text-[11px] font-extrabold text-muted hover:text-ink">
            Remove
          </button>
        </Card>
      ))}
    </>
  )
}
