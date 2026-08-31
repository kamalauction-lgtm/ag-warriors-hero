/* Brand Studio — uploadable logo/mascot slots.
   Source of truth: 'brand' public bucket + brand_assets version registry (063).
   Every upload is a new version (v1, v2, … all kept); the active flag picks the
   live one. localStorage only caches the public URLs so useBrand stays sync. */
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type BrandSlot =
  | 'logo_iqi' // logo 1 of 2 (per country)
  | 'logo_ag' // logo 2 of 2 (per country)
  | 'mascot_home' // My Day hero
  | 'mascot_login' // login splash
  | 'shield' // global app mark

export type BrandCountry = 'MY' | 'ID' | 'GLOBAL'

const DEFAULTS: Record<string, string | null> = {
  'GLOBAL.shield': '/brand/ag-shield.png',
  'MY.logo_iqi': '/brand/iqi-my.png',
  'MY.logo_ag': '/brand/ag-my.png',
  'ID.logo_iqi': '/brand/iqi-id.png',
  'ID.logo_ag': '/brand/ag-id.png',
  'MY.mascot_home': '/brand/mascot-01.webp',
  'ID.mascot_home': '/brand/mascot-01.webp',
  'MY.mascot_login': null,
  'ID.mascot_login': null,
}

const key = (c: BrandCountry, s: BrandSlot) => `agw.brand2.${c}.${s}`

export function getBrand(c: BrandCountry, s: BrandSlot): string | null {
  try {
    return localStorage.getItem(key(c, s)) ?? DEFAULTS[`${c}.${s}`] ?? null
  } catch {
    return DEFAULTS[`${c}.${s}`] ?? null
  }
}

const setCache = (c: BrandCountry, s: BrandSlot, url: string | null) => {
  try {
    if (url) localStorage.setItem(key(c, s), url)
    else localStorage.removeItem(key(c, s))
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('agw-brand'))
}

/* pull active rows once per load so every device sees admin uploads */
let pulledBrand = false
async function pullBrand() {
  if (pulledBrand || !supabase) return
  pulledBrand = true
  const { data } = await supabase.from('brand_assets')
    .select('country,slot,storage_path').eq('active', true)
  ;((data ?? []) as { country: string; slot: string; storage_path: string }[]).forEach((r) => {
    const { data: pub } = supabase!.storage.from('brand').getPublicUrl(r.storage_path)
    setCache(r.country as BrandCountry, r.slot as BrandSlot, pub.publicUrl)
  })
}

/* admin upload: new version to storage, registry row, activate. Error or null. */
export async function setBrandFile(c: BrandCountry, s: BrandSlot, file: File): Promise<string | null> {
  if (!supabase) return 'offline'
  const { data: prev } = await supabase.from('brand_assets')
    .select('version').eq('country', c).eq('slot', s)
    .order('version', { ascending: false }).limit(1)
  const v = ((prev?.[0] as { version: number } | undefined)?.version ?? 0) + 1
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${c}/${s}/v${v}.${ext}`
  const up = await supabase.storage.from('brand').upload(path, file, { upsert: true, contentType: file.type })
  if (up.error) return up.error.message
  await supabase.from('brand_assets').update({ active: false }).eq('country', c).eq('slot', s)
  const ins = await supabase.from('brand_assets')
    .insert({ country: c, slot: s, version: v, storage_path: path, active: true })
  if (ins.error) return ins.error.message
  const { data: pub } = supabase.storage.from('brand').getPublicUrl(path)
  setCache(c, s, pub.publicUrl)
  return null
}

/* back to the built-in default (history rows stay for rollback) */
export async function resetBrand(c: BrandCountry, s: BrandSlot): Promise<string | null> {
  if (!supabase) return 'offline'
  const { error } = await supabase.from('brand_assets')
    .update({ active: false }).eq('country', c).eq('slot', s)
  if (error) return error.message
  setCache(c, s, null)
  return null
}

const subscribe = (cb: () => void) => {
  window.addEventListener('agw-brand', cb)
  return () => window.removeEventListener('agw-brand', cb)
}

export function useBrand(c: BrandCountry, s: BrandSlot): string | null {
  useEffect(() => { pullBrand() }, [])
  return useSyncExternalStore(subscribe, () => getBrand(c, s))
}
