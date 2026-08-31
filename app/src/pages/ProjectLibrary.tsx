/* Project Library (100) — replaces ren's M4 Projects module, for any project.
   Agents browse their country's projects and open each project's documents,
   links and written instructions. Files download through the worker, which
   signs a short-lived URL only if the DB confirms access. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileText, LinkIcon, StickyNote, Search, FolderOpen, Download, ChevronRight } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { Card, Chip } from '../components/ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'

interface Project { property_id: number; name: string; type: string; description: string | null; resource_count: number }
interface Resource {
  id: string; kind: 'file' | 'link' | 'note'; title: string; description: string | null
  url: string | null; body: string | null; file_type: string | null; file_size: number | null; visibility: string
}

const fmtSize = (b: number | null) => !b ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export default function ProjectLibrary() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')

  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<Project | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [q, setQ] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isReal || !supabase) { setState('ready'); return }
    supabase.rpc('fn_project_library').then(({ data, error }) => {
      if (error) { setErr(error.message); setState('error'); return }
      setProjects((data as unknown as Project[]) ?? []); setState('ready')
    })
  }, [isReal])

  const open = useCallback(async (p: Project) => {
    if (!supabase) return
    setActive(p); setResources([])
    const { data } = await supabase.rpc('fn_project_resources', { p_property: p.property_id })
    setResources((data as unknown as Resource[]) ?? [])
  }, [])

  const openFile = async (r: Resource) => {
    if (!supabase) return
    const { data: s } = await supabase.auth.getSession()
    // the worker verifies access then redirects to a signed URL
    window.open(`${WORKER}/project-doc?resource=${r.id}&t=${s?.session?.access_token ?? ''}`, '_blank', 'noopener')
  }

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? projects.filter((p) => p.name.toLowerCase().includes(n)) : projects
  }, [q, projects])

  if (!isReal) return (
    <div className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl">
      <Card className="p-6 text-center text-sm text-muted">
        {L('Sign in with your real account to open the Project Library.',
           'Log masuk dengan akaun sebenar untuk buka Perpustakaan Projek.',
           'Masuk dengan akun asli untuk membuka Perpustakaan Proyek.')}
      </Card>
    </div>
  )

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-5 md:max-w-3xl">
      <header className="mb-4 flex items-center gap-3">
        {active ? (
          <button type="button" onClick={() => setActive(null)} aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted"><ArrowLeft size={18} /></button>
        ) : (
          <Link to="/leads" aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted"><ArrowLeft size={18} /></Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">
            {active ? active.name : L('Project Library', 'Perpustakaan Projek', 'Perpustakaan Proyek')}
          </p>
          <p className="truncate text-[11px] text-muted">
            {active ? L('Documents, links and instructions', 'Dokumen, pautan dan arahan', 'Dokumen, tautan dan instruksi')
                    : L('Everything you need for each project', 'Semua yang anda perlukan untuk setiap projek', 'Semua yang Anda butuhkan untuk tiap proyek')}
          </p>
        </div>
      </header>

      {state === 'error' && <Card className="p-4 text-center text-sm text-danger">⚠ {err}</Card>}

      {/* ---- PROJECT LIST ---- */}
      {!active && state === 'ready' && (
        <>
          {projects.length > 6 && (
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search projects…', 'Cari projek…', 'Cari proyek…')}
                className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
            </div>
          )}
          {projects.length === 0 && (
            <Card className="p-6 text-center text-xs text-muted">
              {L('No project materials yet. Your admin adds them in Command HQ → Caller · M4U → a project.',
                 'Belum ada bahan projek. Admin anda tambah di Command HQ → Caller · M4U → sesuatu projek.',
                 'Belum ada materi proyek. Admin Anda menambahkannya di Command HQ → Caller · M4U → sebuah proyek.')}
            </Card>
          )}
          <div className="space-y-2">
            {shown.map((p) => (
              <button key={p.property_id} type="button" onClick={() => open(p)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left hover:border-accent/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><FolderOpen size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="text-[11px] text-muted">{p.resource_count} {L('items', 'item', 'item')} · {p.type}</p>
                </div>
                <ChevronRight size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- ONE PROJECT'S RESOURCES ---- */}
      {active && (
        <div className="space-y-2">
          {active.description && <p className="mb-1 text-sm text-muted">{active.description}</p>}
          {resources.length === 0 && <Card className="p-6 text-center text-xs text-muted">{L('No materials in this project yet.', 'Belum ada bahan dalam projek ini.', 'Belum ada materi di proyek ini.')}</Card>}
          {resources.map((r) => {
            if (r.kind === 'note') return (
              <Card key={r.id} className="p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <StickyNote size={15} className="text-accent" />
                  <p className="text-sm font-bold">{r.title}</p>
                  {r.visibility === 'granted' && <Chip tone="warning">{L('approved agents', 'ejen lulus', 'agen disetujui')}</Chip>}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.body}</p>
              </Card>
            )
            const Icon = r.kind === 'file' ? FileText : LinkIcon
            const onClick = r.kind === 'file'
              ? () => openFile(r)
              : () => window.open(r.url!, '_blank', 'noopener')
            return (
              <button key={r.id} type="button" onClick={onClick}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left hover:border-accent/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent"><Icon size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.title}</p>
                  <p className="truncate text-[11px] text-muted">
                    {r.description ?? (r.kind === 'file' ? `${(r.file_type ?? 'file').split('/').pop()} · ${fmtSize(r.file_size)}` : r.url)}
                  </p>
                </div>
                {r.kind === 'file' ? <Download size={16} className="text-muted" /> : <LinkIcon size={16} className="text-muted" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
