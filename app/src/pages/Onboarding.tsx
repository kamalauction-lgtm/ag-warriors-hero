/* Onboarding gate — production M1 reborn:
   pending-approval → Academy lessons (all must be marked understood) →
   setup checklist → graduation 🎉 unlocks the app.
   Lessons are admin-managed content in the full build (per country/language). */
import { useCallback, useMemo, useState } from 'react'
import {
  PlayCircle,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  Circle,
  Smartphone,
  BellRing,
  Camera,
  MessagesSquare,
  PartyPopper,
  ShieldCheck,
  Hourglass,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { useBrand } from '../lib/brand'
import { Card, Chip, ProgressRing } from '../components/ui'

type Tri = [string, string, string] // [en, bm, id]

const LESSONS: { id: string; type: string; title: Tri; sub: Tri; min: number }[] = [
  {
    id: 'l1', type: 'video', min: 3,
    title: ['Welcome to AG Warriors', 'Selamat datang ke AG Warriors', 'Selamat datang di AG Warriors'],
    sub: ['Who we are · Become Better, Build Better, Give Better', 'Siapa kami · Become Better, Build Better, Give Better', 'Siapa kami · Become Better, Build Better, Give Better'],
  },
  {
    id: 'l2', type: 'video', min: 5,
    title: ['The AG Way — how we sell', 'Cara AG — bagaimana kami menjual', 'Cara AG — bagaimana kami menjual'],
    sub: ['Calling → Follow-Up → Appointment → Booking → Loan → Closing', 'Panggilan → Follow-Up → Temu Janji → Booking → Pinjaman → Closing', 'Telepon → Follow-Up → Janji Temu → Booking → Pinjaman → Closing'],
  },
  {
    id: 'l3', type: 'text', min: 4,
    title: ['Your tools — the app in 5 minutes', 'Alat anda — aplikasi dalam 5 minit', 'Alat kamu — aplikasi dalam 5 menit'],
    sub: ['My Day · Sales · Leads · Team · Grow', 'Hari Ini · Jualan · Prospek · Pasukan · Berkembang', 'Hari Ini · Penjualan · Prospek · Tim · Kembang'],
  },
  {
    id: 'l4', type: 'image', min: 3,
    title: ['Commission & career', 'Komisen & kerjaya', 'Komisi & karier'],
    sub: ['How you earn · the ladder REN → VP', 'Cara anda dibayar · tangga REN → VP', 'Cara kamu dibayar · jenjang REN → VP'],
  },
  {
    id: 'l5', type: 'text', min: 2,
    title: ['Rules of the house', 'Peraturan rumah', 'Aturan rumah'],
    sub: ['Ethics, WhatsApp discipline, speed-to-lead', 'Etika, disiplin WhatsApp, kelajuan respons lead', 'Etika, disiplin WhatsApp, kecepatan respons lead'],
  },
]
const CHECKLIST: { id: string; icon: typeof Smartphone; title: Tri; sub: Tri }[] = [
  {
    id: 'c1', icon: Smartphone,
    title: ['Install the app', 'Pasang aplikasi', 'Pasang aplikasi'],
    sub: ['Add to Home Screen — works like a real app', 'Tambah ke Skrin Utama — berfungsi seperti aplikasi sebenar', 'Tambahkan ke Layar Utama — berfungsi seperti aplikasi asli'],
  },
  {
    id: 'c2', icon: BellRing,
    title: ['Enable notifications', 'Aktifkan notifikasi', 'Aktifkan notifikasi'],
    sub: ['Lead alerts + task reminders', 'Makluman lead + peringatan tugasan', 'Notifikasi lead + pengingat tugas'],
  },
  {
    id: 'c3', icon: Camera,
    title: ['Profile photo', 'Foto profil', 'Foto profil'],
    sub: ['Used on posters & leaderboard', 'Digunakan pada poster & papan pendahulu', 'Dipakai di poster & papan peringkat'],
  },
  {
    id: 'c4', icon: MessagesSquare,
    title: ['Join the team WhatsApp', 'Sertai WhatsApp pasukan', 'Gabung WhatsApp tim'],
    sub: ["Your leader's group link", 'Pautan kumpulan leader anda', 'Tautan grup leader kamu'],
  },
]

export default function Onboarding() {
  const { user, locale, completeOnboarding, approveDemo, logout } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const shield = useBrand('GLOBAL', 'shield')
  const [openLesson, setOpenLesson] = useState<string | null>(null)
  const [doneLessons, setDoneLessons] = useState<Record<string, boolean>>({})
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [graduated, setGraduated] = useState(false)
  /* These five derive only from local state — no `user` involved — so they sit
     ABOVE the early return. They used to sit below it, which meant the hook count
     changed when `user` went null (e.g. on logout from this page) and React threw
     "Rendered more hooks than during the previous render". */
  const lessonsDone = LESSONS.filter((l) => doneLessons[l.id]).length
  const allLessons = lessonsDone === LESSONS.length
  const checksDone = CHECKLIST.filter((c) => checks[c.id]).length
  const allChecks = checksDone === CHECKLIST.length
  const pct = useMemo(
    () => Math.round(((lessonsDone + checksDone) / (LESSONS.length + CHECKLIST.length)) * 100),
    [lessonsDone, checksDone],
  )

  if (!user) return null
  const phase: 'pending' | 'course' | 'checklist' | 'graduate' = user.pendingApproval
    ? 'pending'
    : !allLessons
      ? 'course'
      : !allChecks
        ? 'checklist'
        : 'graduate'

  const Icon = (t: string) => (t === 'video' ? PlayCircle : t === 'image' ? ImageIcon : FileText)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-6">
      {/* header */}
      <div className="hero-user mb-5 flex items-center gap-3 p-4">
        <img src={shield ?? '/brand/ag-shield.png'} alt="" className="h-12 w-12 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9c2a8]">{L('Warrior Onboarding', 'Onboarding Warrior', 'Onboarding Warrior')}</p>
          <p className="gold-text font-display text-lg font-extrabold">{L('Welcome', 'Selamat datang', 'Selamat datang')}, {user.name.split(' ')[0]}!</p>
        </div>
        <ProgressRing pct={pct} size={54} />
      </div>

      {/* ---- PENDING APPROVAL ---- */}
      {phase === 'pending' && (
        <Card className="p-6 text-center">
          <Hourglass size={36} className="mx-auto mb-3 animate-pulse text-warning" />
          <p className="font-display text-lg font-extrabold">{L('Waiting for approval', 'Menunggu kelulusan', 'Menunggu persetujuan')}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
            {L('Your leader has been notified', 'Leader anda telah dimaklumkan', 'Leader kamu sudah diberi tahu')} {user.country === 'MY' ? '🇲🇾' : '🇮🇩'}. {L(
              "While waiting, you can already start the Academy below — smart warriors don't wait. 🔥",
              'Sementara menunggu, anda boleh mulakan Academy di bawah — warrior bijak tidak menunggu. 🔥',
              'Sambil menunggu, kamu sudah bisa mulai Academy di bawah — warrior cerdas tidak menunggu. 🔥',
            )}
          </p>
          <button type="button" onClick={approveDemo}
            className="mt-4 cursor-pointer rounded-xl bg-accent px-5 py-3 text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90">
            {L('✅ Simulate admin approval (demo)', '✅ Simulasi kelulusan admin (demo)', '✅ Simulasi persetujuan admin (demo)')}
          </button>
          <p className="mt-3 text-[10px] text-muted">{L('In the live build this happens in Admin → People.', 'Dalam versi sebenar, ini berlaku di Admin → People.', 'Di versi live, ini terjadi di Admin → People.')}</p>
        </Card>
      )}

      {/* ---- ACADEMY COURSE (M1 gate) ---- */}
      {phase !== 'pending' && !graduated && (
        <>
          <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
            <ShieldCheck size={15} className="text-accent" /> Academy — {lessonsDone}/{LESSONS.length} {L('lessons', 'pelajaran', 'pelajaran')}
            {allLessons && <Chip tone="success">{L('complete', 'selesai', 'selesai')} ✓</Chip>}
          </p>
          <div className="mb-5 space-y-2">
            {LESSONS.map((l, i) => {
              const done = !!doneLessons[l.id]
              const locked = i > 0 && !doneLessons[LESSONS[i - 1].id]
              const open = openLesson === l.id
              const LIcon = Icon(l.type)
              return (
                <Card key={l.id} className={clsx('overflow-hidden', locked && 'opacity-50')}>
                  <button type="button" disabled={locked}
                    onClick={() => setOpenLesson(open ? null : l.id)}
                    className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left disabled:cursor-not-allowed">
                    {done ? <CheckCircle2 size={20} className="shrink-0 text-success" /> : <Circle size={20} className="shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-sm font-bold', done && 'text-muted line-through')}>{L(...l.title)}</span>
                      <span className="block truncate text-[11px] text-muted">{L(...l.sub)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted">
                      <LIcon size={14} /> {l.min} min{locked ? ' · 🔒' : ''}
                    </span>
                  </button>
                  {open && !locked && (
                    <div className="animate-rise border-t border-border bg-surface2/40 p-4">
                      <div className="mb-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-muted">
                        <LIcon size={30} />
                        <span className="ml-2 text-xs">{L(
                          `Lesson ${l.type} — admin uploads content per country`,
                          `Pelajaran ${l.type} — admin memuat naik kandungan mengikut negara`,
                          `Pelajaran ${l.type} — admin mengunggah konten per negara`,
                        )}</span>
                      </div>
                      <button type="button"
                        onClick={() => { setDoneLessons((d) => ({ ...d, [l.id]: true })); setOpenLesson(null) }}
                        className="w-full cursor-pointer rounded-xl bg-accent py-3 text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90">
                        {L('✓ I understand — mark complete', '✓ Saya faham — tanda selesai', '✓ Saya paham — tandai selesai')}
                      </button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* ---- SETUP CHECKLIST ---- */}
          <p className={clsx('mb-2 flex items-center gap-2 text-sm font-extrabold', !allLessons && 'opacity-40')}>
            🎒 {L('Setup', 'Persediaan', 'Persiapan')} — {checksDone}/{CHECKLIST.length}
            {allChecks && <Chip tone="success">{L('ready', 'sedia', 'siap')} ✓</Chip>}
          </p>
          <div className={clsx('mb-5 space-y-2', !allLessons && 'pointer-events-none opacity-40')}>
            {CHECKLIST.map((c) => {
              const done = !!checks[c.id]
              return (
                <Card key={c.id} onClick={() => setChecks((x) => ({ ...x, [c.id]: !x[c.id] }))}
                  className="flex cursor-pointer items-center gap-3 p-3.5">
                  <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', done ? 'bg-success/15 text-success' : 'bg-accent-soft text-accent')}>
                    <c.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm font-bold', done && 'text-muted line-through')}>{L(...c.title)}</span>
                    <span className="block text-[11px] text-muted">{L(...c.sub)}</span>
                  </span>
                  {done ? <CheckCircle2 size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                </Card>
              )
            })}
          </div>

          {/* ---- GRADUATE ---- */}
          <button type="button" disabled={phase !== 'graduate'}
            onClick={() => setGraduated(true)}
            className="mb-3 h-13 w-full cursor-pointer rounded-2xl bg-accent py-4 font-display text-base font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {L('🎓 Graduate & enter the app', '🎓 Tamat & masuk aplikasi', '🎓 Lulus & masuk aplikasi')}
          </button>
        </>
      )}

      {/* ---- GRADUATION ---- */}
      {graduated && (
        <Card className="border-accent p-8 text-center">
          <PartyPopper size={44} className="mx-auto mb-3 text-accent" />
          <p className="gold-text font-display text-2xl font-extrabold">{L('Warrior activated!', 'Warrior diaktifkan!', 'Warrior aktif!')}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
            {L('+50 bonus points 🏆 · Your leader has been notified.', '+50 mata bonus 🏆 · Leader anda telah dimaklumkan.', '+50 poin bonus 🏆 · Leader kamu sudah diberi tahu.')}{' '}
            <b>{L('Your 30-Day Closing Challenge', 'Cabaran Closing 30 Hari anda', 'Tantangan Closing 30 Hari kamu')}</b>{' '}
            {L('starts tomorrow — Day 1: your first morning plan.', 'bermula esok — Hari 1: rancangan pagi pertama anda.', 'mulai besok — Hari 1: rencana pagi pertamamu.')}
          </p>
          <button type="button" onClick={completeOnboarding}
            className="mt-5 w-full cursor-pointer rounded-2xl bg-accent py-4 font-display text-base font-extrabold text-on-accent transition-opacity hover:opacity-90">
            {L('🦅 Enter AG Warriors', '🦅 Masuk AG Warriors', '🦅 Masuk AG Warriors')}
          </button>
        </Card>
      )}

      <button type="button" onClick={logout} className="mt-auto cursor-pointer py-3 text-center text-xs font-semibold text-muted">
        {L('Sign out', 'Log keluar', 'Keluar')}
      </button>
    </div>
  )
}
