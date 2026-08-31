/* Web push subscribe/unsubscribe (064). The VAPID public key pairs with the
   worker's private key; the subscription lands in push_subs (RLS: own rows)
   and the worker cron delivers new notifications rows to every device. */
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY =
  'BDRgqs1P4xQwJOLSJ68-qvJ8DPxjVACkfDg4eZWNxHOSfx_n1TRQF54KjnkHMjsI-UE-FctiunR-zcD1KUfxkDY'

const toKeyBytes = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function getPushState(): Promise<'on' | 'off' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(userId: string): Promise<string | null> {
  if (!pushSupported()) return 'This browser does not support push.'
  if (!supabase) return 'offline'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Permission was not granted.'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toKeyBytes(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
  })
  const raw = sub.toJSON()
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return 'Subscription is incomplete.'
  const { error } = await supabase.from('push_subs').upsert(
    { user_id: userId, endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    { onConflict: 'endpoint' },
  )
  return error ? error.message : null
}

export async function disablePush(): Promise<string | null> {
  if (!pushSupported() || !supabase) return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
  return null
}

export async function sendTestPush(): Promise<string | null> {
  if (!supabase) return 'offline'
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) return 'not signed in'
  try {
    const res = await fetch('https://m4u-api.iqiaggroup.workers.dev/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    })
    const out = (await res.json()) as { ok?: boolean; error?: string }
    return res.ok && out.ok ? null : out.error || 'send failed'
  } catch {
    return 'network error'
  }
}
