import type { Country } from './types'

export const COUNTRY_CFG: Record<
  Country,
  { code: string; symbol: string; locale: string; tax: number; taxName: string; flag: string; name: string }
> = {
  MY: { code: 'MYR', symbol: 'RM', locale: 'en-MY', tax: 0.08, taxName: 'SST', flag: '🇲🇾', name: 'Malaysia' },
  ID: { code: 'IDR', symbol: 'Rp', locale: 'id-ID', tax: 0.11, taxName: 'PPN', flag: '🇮🇩', name: 'Indonesia' },
}

export function money(v: number, country: Country): string {
  const c = COUNTRY_CFG[country]
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency: c.code,
    maximumFractionDigits: 0,
  }).format(v)
}

export function compactMoney(v: number, country: Country): string {
  const c = COUNTRY_CFG[country]
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency: c.code,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

export function num(v: number): string {
  return new Intl.NumberFormat('en-US').format(v)
}
