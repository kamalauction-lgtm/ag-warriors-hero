/* Brand Studio — uploadable logo/mascot slots.
   Prototype: stored in localStorage as data-URLs + change events.
   Real build: Supabase Storage bucket per country with version history. */
import { useSyncExternalStore } from 'react'

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

const key = (c: BrandCountry, s: BrandSlot) => `agw.brand.${c}.${s}`

export function getBrand(c: BrandCountry, s: BrandSlot): string | null {
  try {
    return localStorage.getItem(key(c, s)) ?? DEFAULTS[`${c}.${s}`] ?? null
  } catch {
    return DEFAULTS[`${c}.${s}`] ?? null
  }
}

export function setBrand(c: BrandCountry, s: BrandSlot, dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(key(c, s), dataUrl)
    else localStorage.removeItem(key(c, s))
  } catch {
    /* storage full — ignore in prototype */
  }
  window.dispatchEvent(new Event('agw-brand'))
}

const subscribe = (cb: () => void) => {
  window.addEventListener('agw-brand', cb)
  return () => window.removeEventListener('agw-brand', cb)
}

export function useBrand(c: BrandCountry, s: BrandSlot): string | null {
  return useSyncExternalStore(subscribe, () => getBrand(c, s))
}
