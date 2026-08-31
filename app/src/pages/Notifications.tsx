/* In-app notifications (§25) — live DB; mark-read; tap to follow link.
   Device push (064): enable/disable + test, delivered by the worker cron. */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, BellRing, Check, Smartphone } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { disablePush, enablePush, getPushState, sendTestPush } from '../lib/push'
import { Card, Chip } from '../components/ui'

interface Notif { id: number; type: string; title: string; body: string; link: string | null; read: boolean; created_at: string }

export default function Notifications() {
  const navigate = useNavigate()
  const { user, t } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [rows, setRows] = useState<Notif[]>([])
  const [push, setPush] = useState<'on' | 'off' | 'denied' | 'unsupported' | 'busy'>('unsupported')
  const [pushMsg, setPushMsg] = useState('')

  useEffect(() => { getPushState().then(setPush) }, [])
  const togglePush = async () => {
    if (!user || push === 'busy') return
    const was = push
    setPush('busy'); setPushMsg('')
    const err = was === 'on' ? await disablePush() : await enablePush(user.id)
    setPush(await getPushState())
    setPushMsg(err ? `⚠ ${err}` : was === 'on' ? 'Push disabled on this device.' : 'Push enabled ✓')
  }
  const testPush = async () => {
    setPushMsg('Sending test…')
    const err = await sendTestPush()
    setPushMsg(err ? `⚠ ${err}` : 'Test sent — it should appear on this device now.')
  }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data } = await supabase.from('notifications').select('*')
      .eq('to_agent', user!.id).order('created_at', { ascending: false }).limit(50)
    setRows((data as Notif[]) ?? [])
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const open = async (n: Notif) => {
    if (supabase && !n.read) await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    // links were stored as '#/challenge' when the app used hash routing
    if (n.link) navigate(n.link.replace(/^#/, ''))
    else load()
  }
  const markAll = async () => {
    if (!supabase) return
    await supabase.from('notifications').update({ read: true }).eq('to_agent', user!.id).eq('read', false)
    load()
  }

  if (!user) return null
  const unread = rows.filter((r) => !r.read).length
  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">{t('nt.title')}</h1>
          <p className="text-xs text-muted">{unread} {t('nt.unread')}</p>
        </div>
        {unread > 0 && (
          <button type="button" onClick={markAll} className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink">
            <Check size={12} /> {t('nt.markAll')}
          </button>
        )}
      </header>
      {isReal && push !== 'unsupported' && (
        <Card className="mb-3 p-3.5">
          <div className="flex items-center gap-3">
            <Smartphone size={18} className={clsx(push === 'on' ? 'text-accent' : 'text-muted')} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('nt.push')}</p>
              <p className="text-[11px] text-muted">
                {push === 'on' ? t('nt.pushOn') : push === 'denied' ? t('nt.pushDenied') : t('nt.pushOff')}
              </p>
            </div>
            {push !== 'denied' && (
              <button type="button" onClick={togglePush} disabled={push === 'busy'}
                className={clsx('cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold',
                  push === 'on' ? 'border border-border text-muted hover:text-ink' : 'bg-accent text-on-accent hover:opacity-90')}>
                {push === 'busy' ? '…' : push === 'on' ? t('nt.disable') : t('nt.enable')}
              </button>
            )}
            {push === 'on' && (
              <button type="button" onClick={testPush}
                className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">
                {t('nt.test')}
              </button>
            )}
          </div>
          {pushMsg && <p className="mt-2 text-[11px] font-semibold text-muted">{pushMsg}</p>}
        </Card>
      )}
      {!isReal ? (
        <Card className="p-6 text-center text-sm text-muted">Sign in with a real account to see live notifications.</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <BellRing size={28} className="mx-auto mb-2 text-muted" />
          <p className="text-sm text-muted">{t('nt.none')}</p>
        </Card>
      ) : (
        <div className="space-y-2 pb-4">
          {rows.map((n) => (
            <Card key={n.id} onClick={() => open(n)} className={clsx('p-3.5', !n.read && 'border-accent/50 bg-accent-soft/30')}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold">{n.title}</p>
                {!n.read && <Chip tone="accent">new</Chip>}
              </div>
              {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
              <p className="mt-1 text-[10px] text-muted">{new Date(n.created_at).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
