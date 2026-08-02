-- ============================================================
-- 008_post_closing.sql — Post-Closing Journey (§20) + Mentor Points wiring (§19). ADDITIVE.
-- Steps are DB-driven (no hardcoded content in components).
-- Every step is HUMAN-reviewed; approved steps may write verified Mentor Points.
-- The system may indicate Elite Coach eligibility but NEVER appoints (§19).
-- ============================================================

create table pcj_steps (
  code text primary key,
  step_no int not null,
  title jsonb not null,                -- {"en":…,"ms-MY":…,"id-ID":…}
  description jsonb not null,
  mentor_points int not null default 0,
  open_without_closing boolean not null default false,  -- §20: selected activities where authorised
  active boolean not null default true
);

create table pcj_progress (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references profiles(id),
  closing_id uuid references ch_closings(id),
  step_code text not null references pcj_steps(code),
  response text,
  status text not null default 'submitted' check (status in ('submitted','approved','revision_required')),
  review_note text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (participant_id, step_code)
);

alter table pcj_steps enable row level security;
alter table pcj_progress enable row level security;

create policy r_pcj_steps on pcj_steps for select using (true);
create policy w_pcj_steps on pcj_steps for all
  using (has_role('super_admin')) with check (has_role('super_admin'));
create policy r_pcj_prog on pcj_progress for select using (
  participant_id = auth.uid() or is_my_coach_participant(participant_id)
  or has_role('super_admin') or has_role('master_mentor'));
-- writes via RPCs only

-- Participant submits a journey step
create or replace function fn_submit_pcj(p_step text, p_response text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_closing uuid; v_open boolean;
begin
  select open_without_closing into v_open from pcj_steps where code = p_step and active;
  if v_open is null then raise exception 'unknown step'; end if;
  select id into v_closing from ch_closings
  where participant_id = auth.uid() and status = 'COMPLETED' limit 1;
  if v_closing is null and not v_open then
    raise exception 'this step unlocks after a verified closing';
  end if;
  insert into pcj_progress (participant_id, closing_id, step_code, response, status)
  values (auth.uid(), v_closing, p_step, p_response, 'submitted')
  on conflict (participant_id, step_code) do update
    set response = excluded.response, status = 'submitted',
        review_note = null, updated_at = now()
  returning id into v_id;
  perform audit_log('pcj_submitted','pcj_progress', v_id::text, null, 'submitted', p_step);
  perform notify_reviewers(auth.uid(), '🎓 Post-closing step submitted',
    'Step "' || p_step || '" awaits human review.', '#/coach');
  return v_id;
end $$;

-- Human review — approve may award verified Mentor Points (§19; no self-review)
create or replace function fn_review_pcj(p_progress uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v pcj_progress; v_mp int;
begin
  select * into v from pcj_progress where id = p_progress;
  if v.id is null then raise exception 'not found'; end if;
  if v.participant_id = auth.uid() then raise exception 'cannot review your own step'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(v.participant_id))) then
    raise exception 'not authorised';
  end if;
  if p_approve then
    update pcj_progress set status = 'approved', review_note = p_note,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_progress;
    select mentor_points into v_mp from pcj_steps where code = v.step_code;
    if coalesce(v_mp, 0) > 0 then
      insert into mentor_points_ledger (user_id, source, amount, status, reason, awarded_by)
      values (v.participant_id, 'pcj_' || v.step_code, v_mp, 'verified',
              'Post-closing step approved: ' || v.step_code, auth.uid());
    end if;
    perform audit_log('pcj_approved','pcj_progress', p_progress::text, v.status, 'approved', p_note);
    perform fn_notify(v.participant_id, 'journey', '🎓 Step approved',
      'Post-closing step approved' || case when coalesce(v_mp,0) > 0
        then ' — +' || v_mp || ' Mentor Points' else '' end, '#/journey');
  else
    update pcj_progress set status = 'revision_required', review_note = p_note,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_progress;
    perform audit_log('pcj_revision','pcj_progress', p_progress::text, v.status, 'revision_required', p_note);
    perform fn_notify(v.participant_id, 'journey', '🔄 Step needs revision',
      coalesce(p_note, 'Reviewer requested changes.'), '#/journey');
  end if;
end $$;

grant execute on function fn_submit_pcj(text,text) to authenticated;
grant execute on function fn_review_pcj(uuid,boolean,text) to authenticated;

-- §20 seed — the journey in order (admin-editable; i18n en/ms-MY/id-ID)
insert into pcj_steps (code, step_no, title, description, mentor_points, open_without_closing) values
 ('reflection', 1,
  '{"en":"Closing Reflection","ms-MY":"Refleksi Closing","id-ID":"Refleksi Closing"}',
  '{"en":"What worked, what was hard, what would you repeat? Be specific about the process, not just the result.","ms-MY":"Apa yang berjaya, apa yang sukar, apa yang anda akan ulang? Fokus pada proses, bukan hasil sahaja.","id-ID":"Apa yang berhasil, apa yang sulit, apa yang akan Anda ulangi? Fokus pada proses, bukan hanya hasil."}', 0, false),
 ('lessons_learned', 2,
  '{"en":"Lessons Learned","ms-MY":"Pengajaran","id-ID":"Pelajaran"}',
  '{"en":"3 concrete lessons from this closing that another Warrior could apply tomorrow.","ms-MY":"3 pengajaran konkrit daripada closing ini yang boleh digunakan Warrior lain esok.","id-ID":"3 pelajaran konkret dari closing ini yang bisa dipakai Warrior lain besok."}', 0, false),
 ('customer_followup', 3,
  '{"en":"Customer Follow-up","ms-MY":"Susulan Pelanggan","id-ID":"Follow-up Pelanggan"}',
  '{"en":"Describe your after-sales care plan: handover, updates, referral ask. Closing is helping — service continues.","ms-MY":"Terangkan pelan jagaan selepas jualan: serahan, kemas kini, permintaan rujukan.","id-ID":"Jelaskan rencana layanan purna jual: serah terima, update, permintaan referral."}', 0, false),
 ('documentation', 4,
  '{"en":"Documentation Completion","ms-MY":"Lengkapkan Dokumentasi","id-ID":"Penyelesaian Dokumentasi"}',
  '{"en":"Confirm all closing documents are filed and compliant. List what was completed.","ms-MY":"Sahkan semua dokumen closing difailkan dan patuh. Senaraikan yang lengkap.","id-ID":"Pastikan semua dokumen closing diarsipkan dan sesuai aturan. Daftar yang selesai."}', 0, false),
 ('knowledge_contribution', 5,
  '{"en":"Knowledge Contribution","ms-MY":"Sumbangan Ilmu","id-ID":"Kontribusi Pengetahuan"}',
  '{"en":"Contribute one approved playbook insight, script or checklist to the team knowledge base.","ms-MY":"Sumbang satu insight playbook, skrip atau senarai semak kepada pangkalan ilmu pasukan.","id-ID":"Sumbangkan satu insight playbook, skrip, atau checklist ke basis pengetahuan tim."}', 5, false),
 ('recruitment_plan', 6,
  '{"en":"Responsible Recruitment Plan","ms-MY":"Pelan Rekrut Bertanggungjawab","id-ID":"Rencana Rekrutmen Bertanggung Jawab"}',
  '{"en":"Who are 1–3 suitable people you could introduce to the team, and why are they suitable? No spam, no pressure (§19).","ms-MY":"Siapa 1–3 orang sesuai yang boleh anda perkenalkan kepada pasukan, dan mengapa mereka sesuai? Tiada spam, tiada paksaan.","id-ID":"Siapa 1–3 orang yang cocok Anda perkenalkan ke tim, dan mengapa cocok? Tanpa spam, tanpa tekanan."}', 5, true),
 ('onboarding_support', 7,
  '{"en":"New-Warrior Onboarding Support","ms-MY":"Sokongan Onboarding Warrior Baru","id-ID":"Dukungan Onboarding Warrior Baru"}',
  '{"en":"Help one new Warrior complete onboarding. Name them and describe the support given.","ms-MY":"Bantu seorang Warrior baru melengkapkan onboarding. Namakan dan terangkan sokongan.","id-ID":"Bantu satu Warrior baru menyelesaikan onboarding. Sebutkan nama dan dukungan yang diberikan."}', 10, false),
 ('teaching_session', 8,
  '{"en":"Teaching / Sharing Session","ms-MY":"Sesi Mengajar / Berkongsi","id-ID":"Sesi Mengajar / Berbagi"}',
  '{"en":"Deliver an approved sharing session to the team. State topic, date and audience.","ms-MY":"Sampaikan sesi perkongsian yang diluluskan. Nyatakan topik, tarikh dan hadirin.","id-ID":"Bawakan sesi berbagi yang disetujui. Sebutkan topik, tanggal, dan peserta."}', 15, true),
 ('mentor_review', 9,
  '{"en":"Mentor Review — Elite Coach Path","ms-MY":"Semakan Mentor — Laluan Elite Coach","id-ID":"Review Mentor — Jalur Elite Coach"}',
  '{"en":"Request a review with your Mentor on Elite Coach readiness. Eligibility is decided by leadership, never by the system.","ms-MY":"Mohon semakan bersama Mentor tentang kesediaan Elite Coach. Kelayakan diputuskan oleh kepimpinan, bukan sistem.","id-ID":"Ajukan review dengan Mentor tentang kesiapan Elite Coach. Kelayakan diputuskan pimpinan, bukan sistem."}', 0, false)
on conflict (code) do nothing;
