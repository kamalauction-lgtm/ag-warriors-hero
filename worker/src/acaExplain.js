/* Diag Academy — AI explanation of diagnostic results (spec §28-30).
   The AI ONLY explains: scores, bands, priorities and the prescription are
   deterministic and final before this file is ever called. If Gemini is down,
   the rule-based explanation below is complete on its own — the participant
   never waits on AI. Developmental language only, in the user's language. */

const DIM_NAME = {
  professional_identity: { en: 'professional identity', ms: 'identiti profesional', id: 'identitas profesional' },
  ethics_compliance: { en: 'ethics and trust', ms: 'etika dan amanah', id: 'etika dan kepercayaan' },
  process_fundamentals: { en: 'process fundamentals', ms: 'asas proses', id: 'dasar proses' },
  customer_responsibility: { en: 'customer responsibility', ms: 'tanggungjawab pelanggan', id: 'tanggung jawab pelanggan' },
  prospecting: { en: 'prospecting', ms: 'mencari prospek', id: 'mencari prospek' },
  needs_discovery: { en: 'needs discovery', ms: 'meneroka keperluan', id: 'menggali kebutuhan' },
  relationship_building: { en: 'relationship building', ms: 'membina hubungan', id: 'membangun hubungan' },
  follow_up: { en: 'follow-up discipline', ms: 'disiplin susulan', id: 'disiplin tindak lanjut' },
  appointment_setting: { en: 'appointment setting', ms: 'menetapkan janji temu', id: 'mengatur janji temu' },
  presentation: { en: 'presentation', ms: 'pembentangan', id: 'presentasi' },
  objection_handling: { en: 'objection handling', ms: 'menangani bantahan', id: 'menangani keberatan' },
  negotiation: { en: 'negotiation', ms: 'rundingan', id: 'negosiasi' },
  closing_process: { en: 'the closing process', ms: 'proses penutupan', id: 'proses closing' },
  financing_coordination: { en: 'financing coordination boundaries', ms: 'sempadan penyelarasan pembiayaan', id: 'batas koordinasi pembiayaan' },
  documentation: { en: 'documentation discipline', ms: 'disiplin dokumentasi', id: 'disiplin dokumentasi' },
  crm_pipeline: { en: 'pipeline discipline', ms: 'disiplin pipeline', id: 'disiplin pipeline' },
  content_creation: { en: 'content creation', ms: 'penciptaan kandungan', id: 'pembuatan konten' },
  live_hosting: { en: 'live hosting', ms: 'hos siaran langsung', id: 'host live' },
  advertising: { en: 'advertising fundamentals', ms: 'asas pengiklanan', id: 'dasar periklanan' },
  campaign_measurement: { en: 'campaign measurement', ms: 'pengukuran kempen', id: 'pengukuran kampanye' },
  growth_funding: { en: 'responsible growth funding', ms: 'pembiayaan pertumbuhan bertanggungjawab', id: 'pendanaan pertumbuhan yang bertanggung jawab' },
  recruitment: { en: 'recruitment', ms: 'perekrutan', id: 'rekrutmen' },
  coaching: { en: 'coaching', ms: 'bimbingan', id: 'coaching' },
  leadership: { en: 'leadership', ms: 'kepimpinan', id: 'kepemimpinan' },
  accountability: { en: 'accountability', ms: 'akauntabiliti', id: 'akuntabilitas' },
  learning_agility: { en: 'learning agility', ms: 'ketangkasan belajar', id: 'ketangkasan belajar' },
}
const ROLE_NAME = {
  content_creator: 'Content Creator', live_host: 'Live Host', advertiser: 'Advertiser',
  team_growth_funder: 'Team Growth Funder', prospector: 'Prospector',
  relationship_builder: 'Relationship Builder', presenter: 'Presenter', closer: 'Closer',
  financing_coordinator: 'Financing Coordinator', recruiter: 'Recruiter',
  coach_trainer: 'Coach / Trainer', leader: 'Leader',
}
const dname = (k, lang) => DIM_NAME[k]?.[lang] ?? DIM_NAME[k]?.en ?? String(k).replace(/_/g, ' ')

const BANNED = [/you (definitely|certainly) are/i, /you will (definitely )?succeed/i,
  /you cannot\b/i, /guarantee/i, /diagnos/i, /disorder/i]
const safe = (v) => (typeof v === 'string' && !BANNED.some((re) => re.test(v)) ? v : null)

/* ---------------- rule-based floor: always complete ---------------- */
export function fallbackExplain(d, lang) {
  const t = (en, ms, id) => (lang === 'ms' ? ms : lang === 'id' ? id : en)
  const res = d?.attempt?.results ?? []
  const strengths = res.filter((r) => ['ready', 'accelerator'].includes(r.band)).slice(0, 3)
  const prios = res.filter((r) => ['foundation', 'developing'].includes(r.band)).slice(0, 2)
  const blind = res.find((r) => r.knowledge_pct !== null && r.knowledge_pct < 60 && r.confidence_level === 3)
  const quiet = res.find((r) => r.knowledge_pct !== null && r.knowledge_pct >= 80 && r.confidence_level === 1)
  const roles = (d?.attempt?.talent?.top_roles ?? []).map((r) => ROLE_NAME[r.key] ?? r.key)
  const lowConf = d?.attempt?.talent?.low_confidence
  const names = (list) => list.map((r) => dname(r.dimension_key, lang)).join(lang === 'en' ? ' and ' : ' dan ')

  const parts = []
  if (strengths.length)
    parts.push(t(`Your responses suggest ${names(strengths)} may already be working for you — keep using ${strengths.length > 1 ? 'them' : 'it'} daily.`,
      `Jawapan anda mencadangkan ${names(strengths)} mungkin sudah menjadi kekuatan anda — terus gunakannya setiap hari.`,
      `Jawaban Anda menunjukkan ${names(strengths)} mungkin sudah menjadi kekuatan Anda — terus pakai setiap hari.`))
  if (prios.length)
    parts.push(t(`The diagnostic indicates ${names(prios)} ${prios.length > 1 ? 'are' : 'is'} the most valuable area${prios.length > 1 ? 's' : ''} to develop next — your learning path starts there.`,
      `Diagnostik menunjukkan ${names(prios)} ialah bahagian paling bernilai untuk dibangunkan seterusnya — laluan pembelajaran anda bermula di situ.`,
      `Diagnostik menunjukkan ${names(prios)} adalah area paling bernilai untuk dikembangkan berikutnya — jalur belajar Anda mulai dari sana.`))
  if (blind)
    parts.push(t(`One thing worth a careful look: your confidence in ${dname(blind.dimension_key, lang)} is high while the knowledge result is lower — that gap can hide a blind spot, and the recommended lessons close it fastest.`,
      `Satu perkara berbaloi diteliti: keyakinan anda pada ${dname(blind.dimension_key, lang)} tinggi sedangkan hasil pengetahuannya lebih rendah — jurang itu boleh menyembunyikan titik buta, dan pelajaran yang disyorkan menutupnya paling pantas.`,
      `Satu hal yang layak dicermati: keyakinan Anda pada ${dname(blind.dimension_key, lang)} tinggi sementara hasil pengetahuannya lebih rendah — celah itu bisa menyembunyikan titik buta, dan pelajaran yang direkomendasikan menutupnya paling cepat.`))
  if (quiet)
    parts.push(t(`The opposite is also here: your knowledge of ${dname(quiet.dimension_key, lang)} is stronger than your confidence in it. That usually needs practice and encouragement, not more theory.`,
      `Yang sebaliknya juga ada: pengetahuan anda tentang ${dname(quiet.dimension_key, lang)} lebih kuat daripada keyakinan anda terhadapnya. Itu biasanya perlukan latihan dan galakan, bukan lebih banyak teori.`,
      `Kebalikannya juga ada: pengetahuan Anda tentang ${dname(quiet.dimension_key, lang)} lebih kuat daripada keyakinan Anda. Itu biasanya butuh latihan dan dorongan, bukan tambahan teori.`))
  if (roles.length && !lowConf)
    parts.push(t(`Your Talent Compass responses suggest current alignment with ${roles[0]}-related work — the accelerator lessons in your path build on that natural lane.`,
      `Jawapan Talent Compass anda mencadangkan kesejajaran semasa dengan kerja berkaitan ${roles[0]} — pelajaran pemecut dalam laluan anda dibina atas lorong semula jadi itu.`,
      `Jawaban Talent Compass Anda menunjukkan keselarasan saat ini dengan pekerjaan terkait ${roles[0]} — pelajaran akselerator di jalur Anda dibangun di atas jalur alami itu.`))
  parts.push(t('Nothing here is a verdict — it is a starting picture that improves as you learn. Begin with the next lesson in your path.',
    'Tiada apa di sini yang muktamad — ia gambaran permulaan yang bertambah baik seiring anda belajar. Mulakan dengan pelajaran seterusnya dalam laluan anda.',
    'Tidak ada yang final di sini — ini gambaran awal yang membaik seiring Anda belajar. Mulailah dengan pelajaran berikutnya di jalur Anda.'))
  return { paragraphs: parts, generated_by: 'fallback' }
}

/* ---------------- AI polish, same guardrails ---------------- */
export async function generateExplain(env, data, lang) {
  const fb = fallbackExplain(data, lang)
  if (!env.GEMINI_API_KEY) return fb
  const language = { ms: 'Bahasa Melayu', id: 'Bahasa Indonesia' }[lang] ?? 'English'
  const prompt = `You are AG AI Coach explaining a DEVELOPMENT diagnostic to a real-estate agent.

WRITE IN: ${language}. 3-5 short paragraphs, plain strings.

ABSOLUTE RULES:
- The bands, percentages, priorities and prescription below are FINAL — never change, re-rank or contradict them.
- Developmental tone: "your responses suggest", "worth developing", "Hero recommends". Never "you are bad at", "you cannot", "you will succeed". No guarantees, no clinical language, no income promises.
- Knowledge and confidence are DIFFERENT things — if one is high and the other low, explain the gap carefully, never as a character flaw.
- Talent alignment is a starting lane to explore, never a permanent label.
- End by pointing them at the next lesson in their prescription.

DATA (authoritative, from the database):
${JSON.stringify({ results: data?.attempt?.results, talent: data?.attempt?.talent,
  prescription_categories: (data?.prescription?.items ?? []).map((i) => ({ category: i.category, module: i.module?.title?.en })) })}

BASELINE (keep every fact; improve warmth and flow):
${JSON.stringify(fb.paragraphs)}

Return ONLY JSON: {"paragraphs": [3-5 strings]}`
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 900, responseMimeType: 'application/json' },
  })
  const model = env.GEMINI_MODEL || 'gemini-flash-latest'
  let res = null
  for (let i = 0; i < 2; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200))
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      )
    } catch { res = null; continue }
    if (res.ok || (res.status !== 429 && res.status < 500)) break
  }
  if (!res || !res.ok) return fb
  try {
    const out = await res.json()
    const ai = JSON.parse(out?.candidates?.[0]?.content?.parts?.[0]?.text)
    const paras = Array.isArray(ai?.paragraphs) ? ai.paragraphs.map(safe).filter(Boolean) : []
    if (paras.length < 2) return fb
    return { paragraphs: paras.slice(0, 5), generated_by: 'ai' }
  } catch { return fb }
}
