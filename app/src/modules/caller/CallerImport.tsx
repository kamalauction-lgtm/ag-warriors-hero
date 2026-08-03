/* Bulk lead import (spec §9 Import).
   Rows go through m4u_import_row -> m4u_intake, the SAME path as the GHL
   webhook, so dedupe / multi-interest / revival behave identically.
   Header matching accepts English, Malay and Indonesian column names. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload, FileDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../lib/store'
import { normalizePhone, phoneProblem, type Country } from '../../lib/phone'
import { Card, Chip } from '../../components/ui'

const MAX_ROWS = 5000

/* header synonyms — first match wins, compared lowercased & stripped */
const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'nama', 'full name', 'fullname', 'nama lengkap', 'nama penuh', 'contact name', 'lead name'],
  phone: ['phone', 'phone number', 'telefon', 'no telefon', 'no. telefon', 'telepon', 'no telepon',
    'nohp', 'no hp', 'no. hp', 'hp', 'mobile', 'whatsapp', 'wa', 'contact', 'nombor'],
}

const clean = (s: string) => s.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')

/** minimal RFC4180-ish CSV parser: quotes, escaped quotes, newlines in fields */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  const src = text.replace(/^﻿/, '')          // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',' || c === ';' || c === '\t') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

interface Result { inserted: number; duplicate: number; multi: number; revived: number; triage: number; skipped: number; failed: number }

export default function CallerImport({ onToast }: { onToast: (m: string) => void }) {
  const { user } = useApp()
  const country = (user?.country ?? 'MY') as Country
  const [rows, setRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<{ name: number; phone: number }>({ name: -1, phone: -1 })
  const [props, setProps] = useState<{ id: number; name: string }[]>([])
  const [propId, setPropId] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.from('m4u_properties').select('id,name').eq('country', country).order('name')
      .then(({ data }) => setProps((data as { id: number; name: string }[]) ?? []))
  }, [country])

  const onFile = useCallback(async (file: File) => {
    setResult(null); setProgress(0); setFileName(file.name)
    if (/\.xlsx?$/i.test(file.name)) {
      onToast('⚠ Please save the sheet as CSV first — .xlsx is not read directly')
      return
    }
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) { onToast('⚠ That file has no data rows'); return }
    const head = parsed[0].map((h) => h.trim())
    setHeaders(head)
    setRows(parsed.slice(1, MAX_ROWS + 1))
    const find = (key: string) => head.findIndex((h) => SYNONYMS[key].includes(clean(h)))
    setMap({ name: find('name'), phone: find('phone') })
    if (parsed.length - 1 > MAX_ROWS) onToast(`Only the first ${MAX_ROWS} rows will be imported`)
  }, [onToast])

  /* preview: what will actually happen, before anything is written */
  const preview = useMemo(() => {
    if (map.phone < 0) return null
    const seen = new Set<string>()
    let ok = 0, bad = 0, dupInFile = 0
    for (const r of rows) {
      const norm = normalizePhone(r[map.phone] ?? '', country)
      if (!norm || phoneProblem(norm)) { bad++; continue }
      if (seen.has(norm)) { dupInFile++; continue }
      seen.add(norm); ok++
    }
    return { ok, bad, dupInFile }
  }, [rows, map, country])

  const run = async () => {
    if (!supabase || map.phone < 0) return
    setBusy(true); setProgress(0)
    const tally: Result = { inserted: 0, duplicate: 0, multi: 0, revived: 0, triage: 0, skipped: 0, failed: 0 }
    const seen = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const phone = r[map.phone] ?? ''
      const norm = normalizePhone(phone, country)
      if (!norm || phoneProblem(norm) || seen.has(norm)) { tally.skipped++; setProgress(i + 1); continue }
      seen.add(norm)
      // every other column becomes a custom field, so nothing in the sheet is lost
      const custom: Record<string, string> = {}
      headers.forEach((h, idx) => {
        if (idx !== map.phone && idx !== map.name && (r[idx] ?? '').trim() !== '') custom[clean(h).replace(/ /g, '_')] = r[idx].trim()
      })
      const { data, error } = await supabase.rpc('m4u_import_row', {
        p_country: country,
        p_name: map.name >= 0 ? (r[map.name] ?? null) : null,
        p_phone: phone,
        p_property_id: propId ? Number(propId) : null,
        p_custom: custom,
      })
      if (error) tally.failed++
      else {
        const res = (data as { result?: string })?.result
        if (res === 'inserted') tally.inserted++
        else if (res === 'duplicate_ignored') tally.duplicate++
        else if (res === 'multi_interest' || res === 'multi_locked') tally.multi++
        else if (res === 'multi_revived') tally.revived++
        else if (res === 'unmapped_triage') tally.triage++
        else tally.failed++
      }
      setProgress(i + 1)
    }
    setBusy(false); setResult(tally)
    onToast(`Import finished — ${tally.inserted} new lead(s)`)
  }

  const template = () => {
    const csv = 'name,phone,domisili,waktu_survey\nAli bin Ahmad,0123456789,Kuala Lumpur,minggu ini boleh\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'm4u-import-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        Imported rows run through the same intake as the GHL webhook — existing numbers are
        recognised, not duplicated. Up to {MAX_ROWS.toLocaleString()} rows per file.
      </p>

      <Card className="mb-3 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-on-accent">
            <Upload size={15} /> Choose CSV
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button type="button" onClick={template}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-xs font-bold">
            <FileDown size={14} /> Template
          </button>
          {fileName && <Chip>{fileName}</Chip>}
        </div>

        {headers.length > 0 && (
          <>
            <div className="mb-2 grid gap-2 sm:grid-cols-3">
              {(['name', 'phone'] as const).map((k) => (
                <label key={k} className="text-[11px] font-bold uppercase tracking-wide text-muted">
                  {k}{k === 'phone' && ' *'}
                  <select value={map[k]} onChange={(e) => setMap({ ...map, [k]: Number(e.target.value) })}
                    className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink outline-none">
                    <option value={-1}>— none —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
              <label className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Project
                <select value={propId} onChange={(e) => setPropId(e.target.value)}
                  className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink outline-none">
                  <option value="">— triage —</option>
                  {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>

            {preview && (
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                <Chip tone="success">{preview.ok} importable</Chip>
                {preview.dupInFile > 0 && <Chip tone="warning">{preview.dupInFile} repeated in file</Chip>}
                {preview.bad > 0 && <Chip tone="danger">{preview.bad} unusable number</Chip>}
              </div>
            )}
            {map.phone < 0 && <p className="mb-2 text-xs text-danger">Pick the phone column to continue.</p>}

            <button type="button" disabled={busy || map.phone < 0 || rows.length === 0} onClick={run}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? `Importing… ${progress}/${rows.length}` : `Import ${rows.length} row(s)`}
            </button>
            {busy && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded bg-surface2">
                <span className="block h-full bg-accent transition-all" style={{ width: `${(progress / Math.max(rows.length, 1)) * 100}%` }} />
              </span>
            )}
          </>
        )}
      </Card>

      {result && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Import result</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([['New leads', result.inserted, '#43c59e'], ['Already had them', result.duplicate, '#94a3b8'],
               ['Added interest', result.multi, '#4f9cf9'], ['Revived', result.revived, '#a78bfa'],
               ['To triage', result.triage, '#f2b544'], ['Skipped', result.skipped, '#94a3b8'],
               ['Failed', result.failed, '#f4826d']] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-xl border border-border p-3">
                <p className="font-display text-xl font-extrabold" style={{ color: c as string }}>{v}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">{l}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            “Already had them” and “Added interest” mean the number was recognised — nothing was duplicated.
          </p>
        </Card>
      )}
    </>
  )
}
