import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { PERSONAS, useApp } from '../lib/store'
import { useBrand } from '../lib/brand'
import { COUNTRY_CFG } from '../lib/format'
import { Avatar, Chip } from '../components/ui'
import type { User } from '../lib/types'

const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin',
  country_admin: 'Country Admin',
  leader: 'Leader',
  agent: 'Agent',
}

export default function Login() {
  const { login } = useApp()
  const [phone, setPhone] = useState('')
  const shield = useBrand('GLOBAL', 'shield')

  // country pre-fill from phone prefix (the real registration flow)
  const detected = phone.replace(/\s/g, '').startsWith('+62')
    ? 'ID'
    : phone.replace(/\s/g, '').startsWith('+60')
      ? 'MY'
      : null

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-10">
      <div className="animate-rise">
        {/* Brand — hero splash */}
        <div className="hero-user mb-8 flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <img
            src={shield ?? '/brand/ag-shield.png'}
            alt="AG shield"
            className="relative mb-3 h-20 w-20 object-contain drop-shadow-[0_6px_16px_rgba(212,172,74,0.35)]"
          />
          <h1 className="relative font-display text-2xl font-extrabold tracking-tight">
            IQI <span className="gold-text">AG Warriors</span>
          </h1>
          <p className="relative mt-1 text-xs tracking-wide text-[#c9c2a8]">
            Become Better · Build Better · Give Better
          </p>
        </div>

        {/* Phone entry with country auto-detect */}
        <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold text-muted">
          Phone number
        </label>
        <div className="relative mb-2">
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="+60 12-345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none transition-colors duration-200 focus:border-accent"
          />
          {detected && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Chip tone="accent">
                {COUNTRY_CFG[detected].flag} {COUNTRY_CFG[detected].name}
              </Chip>
            </span>
          )}
        </div>
        <p className="mb-8 text-[11px] leading-relaxed text-muted">
          Your country is detected from your number — you can confirm it, and
          admin can change it anytime.
        </p>

        {/* Demo personas */}
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Quick login (demo)
        </p>
        <div className="space-y-2.5">
          {PERSONAS.map((p: User) => (
            <button
              key={p.id}
              type="button"
              onClick={() => login(p)}
              className="lift flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left hover:border-accent/60"
            >
              <Avatar name={p.name} color={p.avatarColor} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {p.isElite && p.captainName ? p.captainName : p.name}
                </span>
                <span className="block text-xs text-muted">
                  {COUNTRY_CFG[p.country].flag} {ROLE_LABEL[p.role]} ·{' '}
                  {p.careerRank}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
