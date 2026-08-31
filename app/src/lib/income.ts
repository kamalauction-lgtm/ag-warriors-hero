/* Income Engine — 1:1 port of production income-calc.js (see docs/SPEC-INCOME-SUBSALE.md).
   All constants admin-editable per country. Source of truth: income_rules (061);
   localStorage is only the sync cache the hooks subscribe to. */
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import type { Country } from './types'

export interface LadderRow { name: string; target: number; addon: number }
export interface IncomeProperty { id: string; name: string; price: number; agency: number }
export interface IncomeCfg {
  currency: string
  taxName: string
  taxRate: number // 0.08 SST / 0.11 PPN
  baseRate: number // 0.40
  ladder: LadderRow[] // 8 rows, total % = baseRate + addon
  agencyDefault: number // % units
  agencyMax: number // MY 3 · ID 6 (enforced at input)
  ovMinRate: number // 0.80
  ovCap: number // 0.25
  rgrHighMin: number // 0.88
  rgrStd: number[] // [.05,.03,.02,.02]
  rgrHigh: number[] // [.03,.02,.01,.01]
  combinedCap: number // 0.97
  properties: IncomeProperty[]
  /* ID PRIMARY — pool model: every slice = % of amount received from developer.
     MY primary is LOCKED to its own model (spec §E) and never uses this. */
  primarySlices: Record<string, number>
  /* appear = where this project shows: 'income' | 'catalog' | 'elite'
     agentPct = per-project agent share override (e.g. 60) — others scale down pro-rata */
  primaryProps: { id: string; name: string; price: number; devPct: number; appear?: string[]; agentPct?: number }[]
  /* MY primary projects — §E worksheet values per project (admin/VP-set) */
  myPrimary?: {
    id: string; name: string; price: number; ren: number; vp: number; hot: number
    hotOn: boolean; tlOn: boolean; lOn: boolean
    rgrOn: boolean; rgrPct: number; rgrFrom?: string; rgrTo?: string; tnc?: string
    appear?: string[]
  }[]
}

export const ID_CHAIN = ['L', 'TL', 'HOT', 'TM', 'VP', 'GVP'] as const
const ID_SLICES: Record<string, number> = {
  AGENT: 50, L: 1.5, TL: 2, HOT: 3, TM: 2.5, VP: 4, GVP: 4.5,
  PIC: 3, PPIC: 3, MGM: 2, TRIP: 8, IQI_LOCAL: 14, IQI_HQ: 3,
}
export const SLICE_LABELS: Record<string, string> = {
  AGENT: 'Agent (no add / no OV)', L: 'L — Leader', TL: 'TL — Team Leader',
  HOT: 'HOT — Head of Team', TM: 'TM — Team Manager', VP: 'VP — Vice President',
  GVP: 'GVP — Group Vice President', PIC: 'PIC — Person In Charge',
  PPIC: 'P.PIC — Project PIC', MGM: 'MGM — Member Get Member',
  TRIP: 'Incentive Trip', IQI_LOCAL: 'IQI Indonesia — Cassaterra', IQI_HQ: 'IQI (HQ)',
}

export interface PrimaryIDRow { key: string; label: string; pct: number; amt: number; rolledFrom?: string[] }
/* unfilled chain positions roll UP to the next filled one; GVP is the last resort */
export function calcPrimaryID(
  cfg: IncomeCfg,
  price: number,
  devPct: number,
  filled: Record<string, boolean>,
  agentPctOverride?: number,
): { received: number; rows: PrimaryIDRow[]; total: number; scale: number } {
  const received = price * (devPct / 100)
  const s0 = cfg.primarySlices
  /* per-project agent share (e.g. 60%): everyone else reduces PRO-RATA so total stays 100 */
  const agentPct = agentPctOverride ?? s0.AGENT
  const scale = s0.AGENT >= 100 ? 0 : (100 - agentPct) / (100 - s0.AGENT)
  const s: Record<string, number> = { AGENT: agentPct }
  Object.keys(s0).forEach((k) => {
    if (k !== 'AGENT') s[k] = Math.round(s0[k] * scale * 1000) / 1000
  })
  const rows: PrimaryIDRow[] = [{ key: 'AGENT', label: SLICE_LABELS.AGENT, pct: s.AGENT, amt: 0 }]
  let carry = 0
  const carried: string[] = []
  const chainRows: PrimaryIDRow[] = []
  ID_CHAIN.forEach((pos, i) => {
    const isLast = i === ID_CHAIN.length - 1
    if (filled[pos] || isLast) {
      chainRows.push({
        key: pos, label: SLICE_LABELS[pos],
        pct: s[pos] + carry, amt: 0,
        rolledFrom: carried.length ? [...carried] : undefined,
      })
      carry = 0; carried.length = 0
    } else {
      carry += s[pos]; carried.push(pos)
    }
  })
  rows.push(...chainRows)
  ;(['PIC', 'PPIC', 'MGM', 'TRIP', 'IQI_LOCAL', 'IQI_HQ'] as const).forEach((k) =>
    rows.push({ key: k, label: SLICE_LABELS[k], pct: s[k], amt: 0 }),
  )
  rows.forEach((r) => { r.amt = (received * r.pct) / 100 })
  return { received, rows, total: rows.reduce((t, r) => t + r.pct, 0), scale }
}

const LADDER: LadderRow[] = [
  { name: 'TROOPER', target: 0, addon: 0.2 },
  { name: 'VALIANT', target: 10000, addon: 0.25 },
  { name: 'CONSTABLE', target: 20000, addon: 0.3 },
  { name: 'CORPORAL', target: 40000, addon: 0.35 },
  { name: 'SERGEANT', target: 100000, addon: 0.4 },
  { name: 'LIEUTENANT', target: 200000, addon: 0.45 },
  { name: 'COMMANDER', target: 250000, addon: 0.48 },
  { name: 'GENERAL', target: 275000, addon: 0.5 },
]
const DEFAULTS: Record<Country, IncomeCfg> = {
  MY: {
    currency: 'RM', taxName: 'SST', taxRate: 0.08, baseRate: 0.4,
    ladder: LADDER, agencyDefault: 3, agencyMax: 3,
    ovMinRate: 0.8, ovCap: 0.25, rgrHighMin: 0.88,
    rgrStd: [0.05, 0.03, 0.02, 0.02], rgrHigh: [0.03, 0.02, 0.01, 0.01],
    combinedCap: 0.97,
    properties: [
      { id: 'p1', name: 'Subsale — custom', price: 500000, agency: 3 },
      { id: 'p2', name: 'Damansara Condo', price: 650000, agency: 2.5 },
      { id: 'p3', name: 'Kelantan Terrace', price: 380000, agency: 3 },
    ],
    primarySlices: ID_SLICES, // unused — MY primary locked to its own model
    primaryProps: [],
    myPrimary: [
      { id: 'm1', name: 'Erinaz Suites', price: 350000, ren: 2, vp: 0.73, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: true, rgrPct: 1, rgrFrom: '30/05/2026', rgrTo: '31/12/2026', tnc: 'Applicable for new Recruits join in From 30.05.2026-31.12.2026 (let`s Recruit Now!!)', appear: ['income'] },
      { id: 'm2', name: 'VIVIDZ', price: 750000, ren: 4.5, vp: 0.73, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: true, rgrPct: 1, rgrFrom: '30/05/2026', rgrTo: '31/12/2026', appear: ['income'] },
      { id: 'm3', name: 'Dnuri', price: 270000, ren: 2, vp: 0.73, hot: 0.4, hotOn: false, tlOn: false, lOn: true, rgrOn: false, rgrPct: 0, appear: ['income'] },
      { id: 'm4', name: 'EXSIM JB - A/B/D', price: 1100000, ren: 4, vp: 0.73, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: true, rgrPct: 1, rgrFrom: '30/05/2026', rgrTo: '31/12/2026', appear: ['income'] },
    ],
  },
  ID: {
    currency: 'Rp', taxName: 'PPN', taxRate: 0.11, baseRate: 0.4,
    ladder: LADDER, agencyDefault: 3, agencyMax: 6,
    ovMinRate: 0.8, ovCap: 0.25, rgrHighMin: 0.88,
    rgrStd: [0.05, 0.03, 0.02, 0.02], rgrHigh: [0.03, 0.02, 0.01, 0.01],
    combinedCap: 0.97,
    properties: [
      { id: 'p1', name: 'Subsale — custom', price: 1500000000, agency: 3 },
      { id: 'p2', name: 'BSD Cluster', price: 2100000000, agency: 4 },
      { id: 'p3', name: 'Bandung Villa', price: 1200000000, agency: 5 },
    ],
    primarySlices: ID_SLICES,
    primaryProps: [
      { id: 'pp1', name: 'Indo Project (sample)', price: 500000000, devPct: 6, appear: ['income', 'catalog'] },
      { id: 'pp2', name: 'Vividz Grand', price: 2400000000, devPct: 5, appear: ['income', 'catalog', 'elite'], agentPct: 60 },
      { id: 'pp3', name: 'Podomoro Park', price: 1800000000, devPct: 4, appear: ['catalog'] },
    ],
  },
}

const key = (c: Country) => `agw.income2.${c}`
export function getIncomeCfg(c: Country): IncomeCfg {
  try {
    const raw = localStorage.getItem(key(c))
    if (raw) return { ...DEFAULTS[c], ...(JSON.parse(raw) as Partial<IncomeCfg>) }
  } catch { /* default */ }
  return DEFAULTS[c]
}

/* admin save: DB first (RLS enforces who may), cache after. Returns an error
   message or null so the editor can toast honestly instead of "live everywhere". */
export async function setIncomeCfg(c: Country, cfg: IncomeCfg): Promise<string | null> {
  if (supabase) {
    const { error } = await supabase.from('income_rules')
      .upsert({ country: c, cfg, updated_at: new Date().toISOString() })
    if (error) return error.message
  }
  try { localStorage.setItem(key(c), JSON.stringify(cfg)) } catch { /* ignore */ }
  window.dispatchEvent(new Event('agw-income'))
  return null
}

/* pull the country's rules from DB into the cache — once per country per load */
const pulled: Partial<Record<Country, boolean>> = {}
async function pullIncomeCfg(c: Country) {
  if (pulled[c] || !supabase) return
  pulled[c] = true
  const { data } = await supabase.from('income_rules').select('cfg').eq('country', c).maybeSingle()
  const cfg = (data as { cfg: Partial<IncomeCfg> } | null)?.cfg
  if (!cfg) return
  try { localStorage.setItem(key(c), JSON.stringify(cfg)) } catch { /* ignore */ }
  window.dispatchEvent(new Event('agw-income'))
}

const sub = (cb: () => void) => {
  window.addEventListener('agw-income', cb)
  return () => window.removeEventListener('agw-income', cb)
}
export function useIncomeCfg(c: Country): IncomeCfg {
  useEffect(() => { pullIncomeCfg(c) }, [c])
  const raw = useSyncExternalStore(sub, () => {
    try { return localStorage.getItem(key(c)) } catch { return null }
  })
  return raw ? { ...DEFAULTS[c], ...(JSON.parse(raw) as Partial<IncomeCfg>) } : DEFAULTS[c]
}

/* ---------------- pure calc (port of income-calc.js) ---------------- */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/* SST: clientpaid → net = amount; inclusive (default) → net = amount ÷ (1+rate) */
export const applySst = (amount: number, clientPaid: boolean, rate: number) =>
  clientPaid ? amount : amount / (1 + rate)

export const totalRate = (cfg: IncomeCfg, row: LadderRow) => cfg.baseRate + row.addon

export interface ChainLayer { exists: boolean; name: string; rate: number }
export interface SubsaleRow {
  label: string; rate: number | null; ov: number; rgr: number
  ovAmt: number; rgrAmt: number; take: number
  ovSst: number; rgrSst: number; takeSst: number; toCompany: boolean
}
export interface SubsaleResult {
  grossComm: number
  selling: number; sellingSst: number; sellingRate: number
  rows: SubsaleRow[]
  companyGross: number; companySst: number
  trimmed: number
  scheme: number[]
}

export function calcSubsale(
  cfg: IncomeCfg,
  inp: { price: number; agencyPct: number; sellingRate: number; clientPaid: boolean; chain: ChainLayer[] },
): SubsaleResult {
  const grossComm = inp.price * (inp.agencyPct / 100)
  const scheme = inp.sellingRate >= cfg.rgrHighMin ? cfg.rgrHigh : cfg.rgrStd
  /* OV — L1 ONLY, needs rate ≥ ovMinRate, clamp to ovCap */
  const ov = inp.chain.map((L, i) =>
    i === 0 && L.exists && L.rate >= cfg.ovMinRate
      ? clamp(L.rate - inp.sellingRate, 0, cfg.ovCap)
      : 0,
  )
  const rgr = inp.chain.map((_, i) => scheme[i] ?? 0)
  /* combined cap: trim OV only, L1 first; RGR protected */
  let trimmed = 0
  const total = inp.sellingRate + ov.reduce((s, v, i) => s + v + rgr[i], 0)
  if (total > cfg.combinedCap) {
    let excess = total - cfg.combinedCap
    for (let i = 0; i < ov.length && excess > 1e-12; i++) {
      const cut = Math.min(ov[i], excess)
      ov[i] -= cut; excess -= cut; trimmed += cut
    }
  }
  const sst = (a: number) => applySst(a, inp.clientPaid, cfg.taxRate)
  let companyGross = 0
  const rows: SubsaleRow[] = inp.chain.map((L, i) => {
    const ovAmt = grossComm * ov[i]
    const rgrAmt = grossComm * rgr[i]
    const take = L.exists ? ovAmt + rgrAmt : 0
    if (!L.exists) companyGross += rgrAmt
    return {
      label: L.exists ? L.name : `— (L${i + 1} → Company)`,
      rate: L.exists ? L.rate : null,
      ov: ov[i], rgr: rgr[i], ovAmt, rgrAmt, take,
      ovSst: sst(ovAmt), rgrSst: sst(rgrAmt), takeSst: sst(take),
      toCompany: !L.exists,
    }
  })
  const selling = grossComm * inp.sellingRate
  return {
    grossComm, selling, sellingSst: sst(selling), sellingRate: inp.sellingRate,
    rows, companyGross, companySst: sst(companyGross), trimmed, scheme,
  }
}
