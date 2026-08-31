/* Hero Talent Compass — participant journey (spec §2).
   Public route: no login. Access is an event code, and the returned token is
   kept in localStorage so a refresh never loses progress.
   The same journey serves /myself, which passes a fixed code so the public
   pre-programme link opens straight into a welcome screen instead of a keypad.
   Mobile-first: one question per card, thumb-reachable options. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TL, type TLang } from './talentText'
import TalentReport from './TalentReport'

/* Storage is namespaced per assessment. Both routes render this same component,
   so a single shared key meant that finishing /myself and then opening /testme
   resumed the /myself attempt and showed its report — the two assessments were
   standing on each other's session. /testme keeps the original key so existing
   sessions survive; /myself gets its own. */
const keysFor = (code?: string) => {
  // /testme moves to its own namespace too: leaving it on the legacy key meant it
  // still adopted /myself sittings, which is the bug this is meant to end.
  const ns = code ? code.toLowerCase() : 'testme-v1'
  return { token: `hero-${ns}-token`, report: `hero-${ns}-report` }
}
const LEGACY = { token: 'hero-testme-token', report: 'hero-testme-report' }

interface Option { value: number; label: string }
interface Question {
  id: number; code: string; kind: string; stem: string; helper: string | null
  required: boolean; max_length: number | null; randomise: boolean; options: Option[]
}
interface Section { code: string; title: string; intro: string | null; questions: Question[] }

type Stage = 'code' | 'details' | 'assessment' | 'review' | 'done'

/* stable shuffle so options don't re-order on every keystroke */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* Defined at module scope on purpose. A component declared INSIDE TestMe gets a
   new identity on every render, so React unmounts and remounts the whole tree
   each keystroke — which is what made the text cursor jump out of the field. */
function Shell({ eventName, children, brandTitle, brandSub }: {
  eventName: string; children: React.ReactNode
  brandTitle?: React.ReactNode; brandSub?: string
}) {
  return (
    <div className="min-h-dvh bg-bg px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-5 text-center">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            {brandTitle ?? <>Hero <span className="gold-text">Talent Compass</span></>}
          </h1>
          <p className="text-[11px] text-muted">{brandSub ?? eventName ?? 'IQI AG Hero'}</p>
        </header>
        {children}
      </div>
    </div>
  )
}

/* fixedCode: skip the event-code keypad and start that event directly.
   brandTitle/brandSub: /myself is a different front door to the same journey. */
export default function TestMe({ fixedCode, brandTitle, brandSub, blurb, note }: {
  fixedCode?: string; brandTitle?: React.ReactNode; brandSub?: string
  // per-language so the public front door stays trilingual like the rest
  blurb?: Partial<Record<TLang, string>>; note?: Partial<Record<TLang, string>>
} = {}) {
  const KEY = keysFor(fixedCode)
  const [lang, setLang] = useState<TLang>('en')
  const [stage, setStage] = useState<Stage>('code')
  const [token, setToken] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')
  const [code, setCode] = useState('')
  const [sections, setSections] = useState<Section[]>([])
  const [answers, setAnswers] = useState<Record<number, { value?: number; text?: string }>>({})
  const [pos, setPos] = useState(0)               // flat index across all questions
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [details, setDetails] = useState({
    full_name: '', preferred: '', country: 'MY', contact: '',
    experience: '', leadership: '', sharing: 'summary',
    ack1: false, ack2: false, ack3: false, ack4: false,
  })
  const startedAt = useRef<number>(Date.now())
  const t = TL[lang]

  const flat = useMemo(() => sections.flatMap((s) => s.questions.map((q) => ({ ...q, section: s }))),
    [sections])
  const current = flat[pos]
  const answeredCount = Object.values(answers).filter(
    (a) => a.value !== undefined || (a.text ?? '').trim() !== '').length

  /* ---------- resume an existing attempt ---------- */
  useEffect(() => {
    /* One-time rescue: sittings from before the keys were namespaced all live
       under the shared legacy key. Each route adopts it only if the bank matches
       — myself-v1 is the bank with a section G, v1 stops at F, so the form
       identifies itself. A mismatch is left alone for the other route to claim,
       and a dead token is simply cleared. */
    ;(async () => {
      if (!supabase) return
      if (localStorage.getItem(KEY.report) || localStorage.getItem(KEY.token)) return
      const legacy = localStorage.getItem(LEGACY.report) ?? localStorage.getItem(LEGACY.token)
      if (!legacy) return
      const { data } = await supabase.rpc('talent_form', { p_token: legacy })
      const f = data as { status: string; sections: { code: string }[] } | null
      if (!f) {                                   // stale token, help nobody by keeping it
        localStorage.removeItem(LEGACY.report); localStorage.removeItem(LEGACY.token); return
      }
      const isMyself = !!f.sections?.some((x) => x.code === 'G')
      if (isMyself !== !!fixedCode) return         // belongs to the other route
      localStorage.setItem(f.status === 'in_progress' ? KEY.token : KEY.report, legacy)
      localStorage.removeItem(LEGACY.report)
      localStorage.removeItem(LEGACY.token)
      if (f.status !== 'in_progress') { setToken(legacy); setStage('done') }
    })()
  }, [fixedCode, KEY.report, KEY.token])

  useEffect(() => {
    const finished = localStorage.getItem(KEY.report)
    if (finished) { setToken(finished); setStage('done'); return }
    const saved = localStorage.getItem(KEY.token)
    if (!saved || !supabase) return
    ;(async () => {
      const { data: form, error } = await supabase.rpc('talent_form', { p_token: saved })
      if (error || !form) { localStorage.removeItem(KEY.token); return }
      const f = form as { language: TLang; status: string; sections: Section[] }
      if (f.status !== 'in_progress') {
        // already submitted — show the report rather than a dead end
        localStorage.removeItem(KEY.token)
        localStorage.setItem(KEY.report, saved)
        setToken(saved); setLang(f.language); setStage('done')
        return
      }
      const { data: prog } = await supabase.rpc('talent_progress', { p_token: saved })
      const p = prog as { answers: Record<string, { value: number | null; text: string | null }>; details: Record<string, string> | null }
      const restored: Record<number, { value?: number; text?: string }> = {}
      Object.entries(p?.answers ?? {}).forEach(([qid, a]) => {
        restored[Number(qid)] = { value: a.value ?? undefined, text: a.text ?? undefined }
      })
      setToken(saved); setLang(f.language); setSections(f.sections); setAnswers(restored)
      setStage(p?.details ? 'assessment' : 'details')
      const done = Object.keys(restored).length
      setPos(Math.min(done, f.sections.flatMap((s) => s.questions).length - 1))
    })()
  }, [])

  const call = async (fn: string, args: object) => {
    if (!supabase) throw new Error('offline')
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data
  }

  /* ---------- stage 1: event code ---------- */
  const enterCode = async () => {
    setBusy(true); setErr('')
    try {
      const useCode = (fixedCode ?? code).trim()
      const res = await call('talent_start', { p_code: useCode, p_language: lang }) as
        { token: string; event_name: string }
      localStorage.setItem(KEY.token, res.token)
      setToken(res.token); setEventName(res.event_name)
      const form = await call('talent_form', { p_token: res.token }) as { sections: Section[] }
      setSections(form.sections)
      startedAt.current = Date.now()
      setStage('details')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  /* ---------- stage 2: details + consent ---------- */
  const saveDetails = async () => {
    setBusy(true); setErr('')
    try {
      await call('talent_save_details', {
        p_token: token, p_full_name: details.full_name, p_preferred: details.preferred,
        p_country: details.country, p_contact: details.contact,
        p_experience: details.experience, p_leadership: details.leadership,
        p_developmental: details.ack1, p_not_clinical: details.ack2,
        /* sharing is always 'full' — results are recorded for the facilitator
           and the AI coach reads them to advise accordingly (Kamal, 2026-08-07).
           The data-use acknowledgement above states this to the participant. */
        p_self_reported: details.ack3, p_data_use: details.ack4, p_sharing: 'full',
      })
      setStage('assessment')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  /* ---------- stage 3: answering (autosave every answer) ---------- */
  const answer = async (q: Question, value?: number, text?: string) => {
    setAnswers((a) => ({ ...a, [q.id]: { value, text } }))
    try {
      await call('talent_answer', {
        p_token: token, p_question: q.id,
        p_value: value ?? null, p_text: text ?? null,
      })
    } catch { /* keep the UI responsive; the next answer retries the connection */ }
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const secs = Math.round((Date.now() - startedAt.current) / 1000)
      await call('talent_submit', { p_token: token, p_seconds: secs })
      await call('talent_score_mine', { p_token: token })
      localStorage.removeItem(KEY.token)
      localStorage.setItem(KEY.report, token!)
      setStage('done')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  /* Switching language re-renders the SAME questions in the new wording.
     Answers are stored as question_id + option_value, both language-independent,
     so nothing is lost and nothing is re-asked. Only allowed while in progress. */
  const changeLang = async (l: TLang) => {
    if (l === lang) return
    const previous = lang
    setLang(l)
    if (!token) return                      // not started yet: nothing server-side to update
    try {
      await call('talent_set_language', { p_token: token, p_language: l })
      const form = await call('talent_form', { p_token: token }) as { sections: Section[] }
      setSections(form.sections)
      setErr('')
    } catch (e) {
      // put the chrome back rather than leave half the screen in the new
      // language and the questions still in the old one
      setLang(previous)
      setErr((e as Error).message)
    }
  }

  const langPicker = (
    <div className="mb-4 flex justify-center gap-1.5">
      {(['ms-MY', 'en', 'id-ID'] as TLang[]).map((l) => (
        <button key={l} type="button" onClick={() => changeLang(l)}
          className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold ${
            lang === l ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
          {l === 'ms-MY' ? 'Bahasa Melayu' : l === 'id-ID' ? 'Bahasa Indonesia' : 'English'}
        </button>
      ))}
    </div>
  )

  /* Compact version for the stages where a full row of names would crowd the
     card. Same behaviour, three-letter labels. */
  const langSwitch = (
    <div className="mb-3 flex justify-end gap-1">
      {(['ms-MY', 'en', 'id-ID'] as TLang[]).map((l) => (
        <button key={l} type="button" onClick={() => changeLang(l)}
          aria-label={l === 'ms-MY' ? 'Bahasa Melayu' : l === 'id-ID' ? 'Bahasa Indonesia' : 'English'}
          className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            lang === l ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
          {l === 'ms-MY' ? 'BM' : l === 'id-ID' ? 'ID' : 'EN'}
        </button>
      ))}
    </div>
  )

  /* ---------------- stage: code ---------------- */
  if (stage === 'code') return (
    <Shell eventName={eventName} brandTitle={brandTitle} brandSub={brandSub}>
      {langPicker}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-1 text-sm font-bold">{t.welcome}</p>
        <p className="mb-4 text-xs text-muted">{blurb?.[lang] ?? t.welcomeBody}</p>
        {!fixedCode && <>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">{t.eventCode}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters"
            placeholder="AGLEADERSHIP"
            className="mb-3 h-12 w-full rounded-xl border border-border bg-surface2 px-3 text-center text-base font-bold tracking-widest outline-none focus:border-accent" />
        </>}
        {err && <p className="mb-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}
        <button type="button" disabled={busy || (!fixedCode && !code.trim())} onClick={enterCode}
          className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
          {busy ? '…' : t.start}
        </button>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted">{t.timeNote}</p>
        {note?.[lang] && (
          <p className="mt-2 rounded-lg bg-surface2 p-2 text-center text-[10px] leading-relaxed text-muted">{note[lang]}</p>
        )}
      </div>
    </Shell>
  )

  /* ---------------- stage: details + consent ---------------- */
  if (stage === 'details') {
    const acksOk = details.ack1 && details.ack2 && details.ack3 && details.ack4
    // email identifies the person across sittings (pre-programme and mid-class),
    // so it is required rather than optional. Kept permissive on purpose.
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.contact.trim())
    const ready = details.full_name.trim() && emailOk && details.experience && details.leadership && acksOk
    return (
      <Shell eventName={eventName} brandTitle={brandTitle} brandSub={brandSub}>
        {langSwitch}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-3 text-sm font-bold">{t.aboutYou}</p>
          {([['full_name', t.fullName], ['preferred', t.preferredName], ['contact', t.contact]] as const).map(([k, label]) => (
            <label key={k} className="mb-2 block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
              <input value={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.value })}
                type={k === 'contact' ? 'email' : 'text'}
                autoComplete={k === 'contact' ? 'email' : undefined}
                inputMode={k === 'contact' ? 'email' : undefined}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
            </label>
          ))}
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label><span className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.country}</span>
              <select value={details.country} onChange={(e) => setDetails({ ...details, country: e.target.value })}
                className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface2 px-2 text-sm outline-none">
                <option value="MY">🇲🇾 Malaysia</option><option value="ID">🇮🇩 Indonesia</option>
              </select></label>
            <label><span className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.experience}</span>
              <select value={details.experience} onChange={(e) => setDetails({ ...details, experience: e.target.value })}
                className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface2 px-2 text-sm outline-none">
                <option value="">—</option>
                {t.expBands.map((b) => <option key={b}>{b}</option>)}
              </select></label>
          </div>
          <label className="mb-3 block"><span className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.leadership}</span>
            <select value={details.leadership} onChange={(e) => setDetails({ ...details, leadership: e.target.value })}
              className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface2 px-2 text-sm outline-none">
              <option value="">—</option>
              {t.leadBands.map((b) => <option key={b}>{b}</option>)}
            </select></label>

          <p className="mb-2 mt-4 text-sm font-bold">{t.consentTitle}</p>
          <div className="mb-3 rounded-xl border border-border bg-surface2 p-3 text-[11px] leading-relaxed text-muted">
            {t.disclaimer}
          </div>
          {([['ack1', t.ack1], ['ack2', t.ack2], ['ack3', t.ack3], ['ack4', t.ack4]] as const).map(([k, label]) => (
            <label key={k} className="mb-2 flex cursor-pointer items-start gap-2 text-xs">
              <input type="checkbox" checked={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
              <span>{label}</span>
            </label>
          ))}

          {/* no sharing choice: results go to the programme team + AI coach in
              full, and the line below says so plainly */}
          <p className="mb-1 mt-3 rounded-lg bg-surface2 p-2.5 text-[10px] leading-relaxed text-muted">
            {lang === 'ms-MY'
              ? 'Keputusan penuh anda dikongsi dengan pasukan program dan AI coach untuk bimbingan peribadi anda.'
              : lang === 'id-ID'
              ? 'Hasil lengkap Anda dibagikan kepada tim program dan AI coach untuk bimbingan pribadi Anda.'
              : 'Your full results are shared with the programme team and the AI coach for your personal guidance.'}
          </p>

          {err && <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}
          <button type="button" disabled={busy || !ready} onClick={saveDetails}
            className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
            {busy ? '…' : t.begin}
          </button>
          {!acksOk && <p className="mt-2 text-center text-[10px] text-muted">{t.allAcksNeeded}</p>}
        </div>
      </Shell>
    )
  }

  /* ---------------- stage: assessment ---------------- */
  if (stage === 'assessment' && current) {
    const a = answers[current.id] ?? {}
    const pct = Math.round((answeredCount / flat.length) * 100)
    const minsLeft = Math.max(1, Math.round((flat.length - answeredCount) * 0.4))
    const opts = current.randomise ? shuffled(current.options, current.id) : current.options
    const canNext = !current.required || a.value !== undefined || (a.text ?? '').trim() !== ''

    return (
      <Shell eventName={eventName} brandTitle={brandTitle} brandSub={brandSub}>
        {langSwitch}
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>{current.section.title}</span>
            <span>{t.about} {minsLeft} {t.minutesLeft}</span>
          </div>
          <span className="block h-1.5 overflow-hidden rounded bg-surface2">
            <span className="block h-full rounded bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </span>
          <p className="mt-1 text-right text-[10px] text-muted">{answeredCount} / {flat.length}</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent">{current.code}</p>
          <p className="mb-3 text-[15px] font-semibold leading-relaxed">{current.stem}</p>
          {current.helper && (
            <p className="mb-3 rounded-lg bg-warning/10 p-2.5 text-[11px] leading-relaxed text-warning">{current.helper}</p>
          )}

          {current.kind === 'text' ? (
            <textarea rows={5} value={a.text ?? ''} maxLength={current.max_length ?? 1500}
              onChange={(e) => setAnswers((p) => ({ ...p, [current.id]: { text: e.target.value } }))}
              onBlur={(e) => answer(current, undefined, e.target.value)}
              placeholder={t.yourAnswer}
              className="w-full rounded-xl border border-border bg-surface2 p-3 text-sm outline-none focus:border-accent" />
          ) : (
            <div className="space-y-2">
              {opts.map((o) => (
                <button key={o.value} type="button" onClick={() => answer(current, o.value)}
                  className={`w-full cursor-pointer rounded-xl border p-3 text-left text-sm transition-colors ${
                    a.value === o.value ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-border hover:border-accent/50'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={pos === 0} onClick={() => setPos((p) => p - 1)}
              className="h-11 cursor-pointer rounded-xl border border-border px-4 text-xs font-bold text-muted disabled:opacity-30">
              {t.back}
            </button>
            {pos < flat.length - 1 ? (
              <button type="button" disabled={!canNext} onClick={() => setPos((p) => p + 1)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {t.next}
              </button>
            ) : (
              <button type="button" onClick={() => setStage('review')}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent">
                {t.reviewAnswers}
              </button>
            )}
          </div>
          {!current.required && <p className="mt-2 text-center text-[10px] text-muted">{t.optional}</p>}
        </div>
      </Shell>
    )
  }

  /* ---------------- stage: review before submit ---------------- */
  if (stage === 'review') {
    const missing = flat.filter((q) => q.required && answers[q.id]?.value === undefined
      && (answers[q.id]?.text ?? '').trim() === '')
    return (
      <Shell eventName={eventName} brandTitle={brandTitle} brandSub={brandSub}>
        {langSwitch}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-2 text-sm font-bold">{t.reviewTitle}</p>
          <p className="mb-4 text-xs text-muted">
            {answeredCount} / {flat.length} {t.answered}
            {missing.length > 0 && ` · ${missing.length} ${t.stillMissing}`}
          </p>
          {missing.slice(0, 8).map((q) => (
            <button key={q.id} type="button"
              onClick={() => { setPos(flat.findIndex((x) => x.id === q.id)); setStage('assessment') }}
              className="mb-1.5 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-warning/50 p-2.5 text-left text-xs">
              <span className="font-bold text-warning">{q.code}</span>
              <span className="flex-1 truncate text-muted">{q.stem}</span>
            </button>
          ))}
          {err && <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}
          <button type="button" disabled={busy} onClick={submit}
            className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
            {busy ? t.scoring : t.submit}
          </button>
          <button type="button" onClick={() => setStage('assessment')}
            className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-border text-xs font-bold text-muted">
            {t.keepEditing}
          </button>
        </div>
      </Shell>
    )
  }

  /* ---------------- stage: done — the report itself ---------------- */
  return (
    <Shell eventName={eventName} brandTitle={brandTitle} brandSub={brandSub}>
      <TalentReport token={token ?? ''} name={details.preferred || details.full_name}
        onLangChange={setLang} />
    </Shell>
  )
}
