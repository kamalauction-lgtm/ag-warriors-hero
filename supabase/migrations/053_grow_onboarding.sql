-- 053_grow_onboarding.sql — GROW → Onboarding: DB-driven learning onboarding.
--
-- Three onboarding layers exist and stay SEPARATE (spec §2):
--   A. global app onboarding  -> profiles.onboarded            (untouched)
--   B. Grow onboarding        -> THESE tables                  (this build)
--   C. 30-day challenge       -> ch_* enrolment/readiness      (untouched)
--
-- Design notes:
--   * Content is trilingual jsonb {"en","ms","id"} per text field — the app
--     maps its 'bm' locale to 'ms'.
--   * Participants NEVER select the content tables directly: onb_my_program()
--     serves the published, country-scoped programme with the quiz answer key
--     stripped, merged with their own progress. RLS on the tables is
--     admin-only, so there is no path to the answer key or draft content.
--   * All participant writes go through SECURITY DEFINER RPCs (touch/ack/quiz)
--     which enforce the completion rules server-side. Client-side timers can
--     lie; the touch RPC caps each heartbeat at 45 s so a lie is expensive.
--   * Soft archive everywhere (status), no destructive deletes once progress
--     rows exist. content_version + ack_version keep old acknowledgements
--     meaningful after material edits (spec §13).

-- ---------- content ----------
create table if not exists onb_programs (
  id bigint generated always as identity primary key,
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  title jsonb not null,                       -- {"en","ms","id"}
  subtitle jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists onb_sections (
  id bigint generated always as identity primary key,
  program_id bigint not null references onb_programs(id) on delete cascade,
  title jsonb not null,
  sort int not null default 100,
  status text not null default 'published' check (status in ('published','archived')),
  created_at timestamptz default now()
);

create table if not exists onb_lessons (
  id bigint generated always as identity primary key,
  section_id bigint not null references onb_sections(id) on delete cascade,
  type text not null default 'article'
    check (type in ('article','video','image','carousel','slides','document','link','ack')),
  title jsonb not null,
  subtitle jsonb,
  body jsonb,                                 -- rich text per language
  media jsonb,          -- {youtube, url, images:[{path,caption}], files:[{path,name}]}
  duration_min int,                           -- estimated, shown to the user
  required boolean not null default true,
  min_seconds int not null default 0,         -- active-engagement floor
  ack_required boolean not null default false,
  quiz jsonb,           -- {question:{..}, options:[{..}..], correct:int, explanation:{..}, retry:bool}
  prerequisite_id bigint references onb_lessons(id),
  sort int not null default 100,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content_version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists onb_lessons_section on onb_lessons (section_id, sort);

-- ---------- participant state ----------
create table if not exists onb_progress (
  agent_id uuid not null references profiles(id) on delete cascade,
  lesson_id bigint not null references onb_lessons(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  first_opened_at timestamptz default now(),
  last_opened_at timestamptz default now(),
  completed_at timestamptz,
  active_seconds int not null default 0,
  pages_seen jsonb not null default '[]'::jsonb,   -- carousel page indexes
  ack_at timestamptz,
  ack_version int,
  quiz_score int,
  quiz_passed_at timestamptz,
  primary key (agent_id, lesson_id)
);

create table if not exists onb_completion (
  agent_id uuid primary key references profiles(id) on delete cascade,
  program_id bigint not null references onb_programs(id),
  completed_at timestamptz default now()
);

-- ---------- RLS: content admin-only; participant state via RPC ----------
alter table onb_programs   enable row level security;
alter table onb_sections   enable row level security;
alter table onb_lessons    enable row level security;
alter table onb_progress   enable row level security;
alter table onb_completion enable row level security;

drop policy if exists rw_onb_programs on onb_programs;
create policy rw_onb_programs on onb_programs for all
  using (is_admin()) with check (is_admin());
drop policy if exists rw_onb_sections on onb_sections;
create policy rw_onb_sections on onb_sections for all
  using (is_admin()) with check (is_admin());
drop policy if exists rw_onb_lessons on onb_lessons;
create policy rw_onb_lessons on onb_lessons for all
  using (is_admin()) with check (is_admin());

-- own progress readable; leaders/coaches/captains read their people via RPC
drop policy if exists r_onb_progress on onb_progress;
create policy r_onb_progress on onb_progress for select
  using (agent_id = auth.uid() or is_admin());
drop policy if exists r_onb_completion on onb_completion;
create policy r_onb_completion on onb_completion for select
  using (agent_id = auth.uid() or is_admin());
-- no client insert/update policies: writes go through the RPCs below

-- ---------- audit: admin content changes ----------
create or replace function onb_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform audit_log(
    tg_op || ':' || tg_table_name, 'onboarding',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    left(coalesce(new.title ->> 'en', ''), 80));
  return new;
end $$;
drop trigger if exists onb_programs_audit on onb_programs;
create trigger onb_programs_audit after insert or update on onb_programs
  for each row execute function onb_audit();
drop trigger if exists onb_lessons_audit on onb_lessons;
create trigger onb_lessons_audit after insert or update on onb_lessons
  for each row execute function onb_audit();

-- ---------- the participant read: one sanitized payload ----------
create or replace function onb_my_program()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_country text; v_prog onb_programs; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = auth.uid();

  select * into v_prog from onb_programs
   where status = 'published' and country_scope in ('ALL', v_country)
   order by created_at desc limit 1;
  if v_prog.id is null then return null; end if;

  select jsonb_build_object(
    'program', jsonb_build_object('id', v_prog.id, 'title', v_prog.title, 'subtitle', v_prog.subtitle),
    'completed_at', (select completed_at from onb_completion where agent_id = auth.uid()),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'sort', s.sort,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'type', l.type, 'title', l.title, 'subtitle', l.subtitle,
            'body', l.body, 'media', l.media,
            'duration_min', l.duration_min, 'required', l.required,
            'min_seconds', l.min_seconds, 'ack_required', l.ack_required,
            'content_version', l.content_version,
            'prerequisite_id', l.prerequisite_id, 'sort', l.sort,
            -- quiz WITHOUT the answer key — grading happens in onb_quiz()
            'quiz', case when l.quiz is null then null else jsonb_build_object(
              'question', l.quiz -> 'question', 'options', l.quiz -> 'options',
              'retry', coalesce(l.quiz -> 'retry', 'true'::jsonb)) end,
            'progress', (select jsonb_build_object(
                'status', p.status, 'active_seconds', p.active_seconds,
                'pages_seen', p.pages_seen, 'ack_at', p.ack_at,
                'ack_version', p.ack_version, 'quiz_passed_at', p.quiz_passed_at,
                'completed_at', p.completed_at)
              from onb_progress p where p.agent_id = auth.uid() and p.lesson_id = l.id)
          ) order by l.sort, l.id)
          from onb_lessons l where l.section_id = s.id and l.status = 'published'), '[]'::jsonb)
      ) order by s.sort, s.id)
      from onb_sections s where s.program_id = v_prog.id and s.status = 'published'), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- ---------- completion rule, in ONE place ----------
create or replace function onb_check_complete(p_agent uuid, p_lesson bigint)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare l onb_lessons; p onb_progress; v_pages int; v_need int; v_prog bigint; v_left int;
begin
  select * into l from onb_lessons where id = p_lesson;
  select * into p from onb_progress where agent_id = p_agent and lesson_id = p_lesson;
  if l.id is null or p.agent_id is null or p.status = 'completed' then
    return coalesce(p.status = 'completed', false);
  end if;

  if p.active_seconds < coalesce(l.min_seconds, 0) then return false; end if;
  if l.ack_required and (p.ack_at is null or coalesce(p.ack_version, 0) < l.content_version) then
    return false;
  end if;
  if l.quiz is not null and p.quiz_passed_at is null then return false; end if;
  if l.type = 'carousel' then
    v_need := coalesce(jsonb_array_length(l.media -> 'images'), 0);
    v_pages := (select count(distinct x) from jsonb_array_elements_text(p.pages_seen) x);
    if v_pages < v_need then return false; end if;
  end if;

  update onb_progress set status = 'completed', completed_at = now()
   where agent_id = p_agent and lesson_id = p_lesson;

  -- programme complete? every required published lesson in a published section
  select s.program_id into v_prog from onb_sections s where s.id = l.section_id;
  select count(*) into v_left
    from onb_lessons ll join onb_sections ss on ss.id = ll.section_id
   where ss.program_id = v_prog and ss.status = 'published'
     and ll.status = 'published' and ll.required
     and not exists (select 1 from onb_progress pp
                      where pp.agent_id = p_agent and pp.lesson_id = ll.id
                        and pp.status = 'completed');
  if v_left = 0 and not exists (select 1 from onb_completion where agent_id = p_agent) then
    insert into onb_completion (agent_id, program_id) values (p_agent, v_prog);
    insert into notifications (to_agent, type, title, body, link)
    values (p_agent, 'onboarding', '🎓 Onboarding complete!',
            'You have completed your AG foundation. Become Better. Build Better. Give Better.',
            '#/grow/onboarding');
  end if;
  return true;
end $$;

-- ---------- participant writes ----------
-- heartbeat: called every ~20 s of ACTIVE time; p_page marks a carousel page seen
create or replace function onb_touch(p_lesson bigint, p_seconds int default 0, p_page int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_secs int; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  if not exists (select 1 from onb_lessons where id = p_lesson and status = 'published') then
    raise exception 'lesson not available';
  end if;
  v_secs := greatest(0, least(coalesce(p_seconds, 0), 45));   -- a lying client gains little
  insert into onb_progress (agent_id, lesson_id, active_seconds, pages_seen)
  values (auth.uid(), p_lesson, v_secs,
          case when p_page is null then '[]'::jsonb else jsonb_build_array(p_page::text) end)
  on conflict (agent_id, lesson_id) do update set
    active_seconds = onb_progress.active_seconds + v_secs,
    last_opened_at = now(),
    pages_seen = case when p_page is null then onb_progress.pages_seen
      when onb_progress.pages_seen @> jsonb_build_array(p_page::text) then onb_progress.pages_seen
      else onb_progress.pages_seen || jsonb_build_array(p_page::text) end;
  v_done := onb_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('completed', v_done,
    'active_seconds', (select active_seconds from onb_progress
                        where agent_id = auth.uid() and lesson_id = p_lesson));
end $$;

create or replace function onb_ack(p_lesson bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ver int; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select content_version into v_ver from onb_lessons where id = p_lesson and status = 'published';
  if v_ver is null then raise exception 'lesson not available'; end if;
  insert into onb_progress (agent_id, lesson_id, ack_at, ack_version)
  values (auth.uid(), p_lesson, now(), v_ver)
  on conflict (agent_id, lesson_id) do update set
    ack_at = now(), ack_version = v_ver, last_opened_at = now();
  v_done := onb_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('completed', v_done);
end $$;

-- grade server-side; the answer key never leaves the database
create or replace function onb_quiz(p_lesson bigint, p_answer int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare l onb_lessons; v_ok boolean; v_retry boolean; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select * into l from onb_lessons where id = p_lesson and status = 'published';
  if l.id is null or l.quiz is null then raise exception 'no quiz on this lesson'; end if;
  v_ok := (l.quiz ->> 'correct')::int = p_answer;
  v_retry := coalesce((l.quiz ->> 'retry')::boolean, true);
  if not v_retry and exists (select 1 from onb_progress
      where agent_id = auth.uid() and lesson_id = p_lesson and quiz_score is not null) then
    raise exception 'no retries allowed on this check';
  end if;
  insert into onb_progress (agent_id, lesson_id, quiz_score, quiz_passed_at)
  values (auth.uid(), p_lesson, case when v_ok then 100 else 0 end,
          case when v_ok then now() else null end)
  on conflict (agent_id, lesson_id) do update set
    quiz_score = case when v_ok then 100 else 0 end,
    quiz_passed_at = case when v_ok then now() else onb_progress.quiz_passed_at end,
    last_opened_at = now();
  v_done := onb_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('correct', v_ok, 'completed', v_done,
    'explanation', case when v_ok then l.quiz -> 'explanation' else null end);
end $$;

-- ---------- leadership visibility: admin (country), leader, coach, captain ----------
create or replace function onb_team_progress()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_out jsonb;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select jsonb_agg(row_out order by row_out ->> 'name') into v_out from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'country', p.country::text,
      'required_total', t.total, 'required_done', coalesce(d.done, 0),
      'pct', case when t.total = 0 then 0
                  else round(100.0 * coalesce(d.done, 0) / t.total) end,
      'last_activity', (select max(last_opened_at) from onb_progress where agent_id = p.id),
      'completed_at', (select completed_at from onb_completion where agent_id = p.id)
    ) as row_out
    from profiles p
    cross join lateral (
      select count(*)::int as total
        from onb_lessons l join onb_sections s on s.id = l.section_id
        join onb_programs pr on pr.id = s.program_id
       where pr.status = 'published' and s.status = 'published'
         and l.status = 'published' and l.required
         and pr.country_scope in ('ALL', p.country::text)) t
    left join lateral (
      select count(*)::int as done
        from onb_progress pp join onb_lessons l on l.id = pp.lesson_id
       where pp.agent_id = p.id and pp.status = 'completed' and l.required) d on true
    where p.status = 'active'
      and (
        (is_admin() and (p.country::text = my_country()::text or my_role() = 'master_admin'))
        or p.leader_id = v_me
        or exists (select 1 from coach_assignments ca
                    where ca.coach_id = v_me and ca.participant_id = p.id and ca.active)
        or exists (select 1 from pod_members pm join pods pd on pd.id = pm.pod_id
                    where pd.captain_id = v_me and pm.agent_id = p.id)
      )
  ) rows;
  return coalesce(v_out, '[]'::jsonb);
end $$;

-- per-lesson completion counts, for "most frequently incomplete"
create or replace function onb_admin_lesson_stats()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'lesson_id', l.id, 'title', l.title, 'required', l.required,
      'completed', (select count(*) from onb_progress p
                     where p.lesson_id = l.id and p.status = 'completed'),
      'started', (select count(*) from onb_progress p where p.lesson_id = l.id),
      'avg_seconds', (select round(avg(active_seconds)) from onb_progress p where p.lesson_id = l.id))
      order by l.sort)
    from onb_lessons l join onb_sections s on s.id = l.section_id
    join onb_programs pr on pr.id = s.program_id
    where pr.status = 'published' and l.status = 'published'), '[]'::jsonb);
end $$;

revoke all on function onb_my_program() from public, anon;
revoke all on function onb_touch(bigint, int, int) from public, anon;
revoke all on function onb_ack(bigint) from public, anon;
revoke all on function onb_quiz(bigint, int) from public, anon;
revoke all on function onb_team_progress() from public, anon;
revoke all on function onb_admin_lesson_stats() from public, anon;
revoke all on function onb_check_complete(uuid, bigint) from public, anon, authenticated;
grant execute on function onb_my_program() to authenticated;
grant execute on function onb_touch(bigint, int, int) to authenticated;
grant execute on function onb_ack(bigint) to authenticated;
grant execute on function onb_quiz(bigint, int) to authenticated;
grant execute on function onb_team_progress() to authenticated;
grant execute on function onb_admin_lesson_stats() to authenticated;

-- ---------- storage: private onboarding bucket ----------
-- (bucket 'onboarding' itself is created via the Storage API — private)
drop policy if exists onb_assets_read on storage.objects;
create policy onb_assets_read on storage.objects for select
  using (bucket_id = 'onboarding' and auth.uid() is not null);
drop policy if exists onb_assets_admin_write on storage.objects;
create policy onb_assets_admin_write on storage.objects for insert
  with check (bucket_id = 'onboarding' and is_admin());
drop policy if exists onb_assets_admin_del on storage.objects;
create policy onb_assets_admin_del on storage.objects for delete
  using (bucket_id = 'onboarding' and is_admin());

-- ---------- seed: AG Warrior Onboarding (section 1 live, rest drafts) ----------
do $$
declare v_prog bigint; v_s1 bigint; v_s2 bigint; v_s3 bigint; v_s4 bigint;
begin
  if exists (select 1 from onb_programs) then return; end if;

  insert into onb_programs (country_scope, title, subtitle, status)
  values ('ALL',
    '{"en":"AG Warrior Onboarding","ms":"Onboarding Warrior AG","id":"Onboarding Warrior AG"}',
    '{"en":"Your AG journey starts here","ms":"Perjalanan AG anda bermula di sini","id":"Perjalanan AG Anda dimulai di sini"}',
    'published') returning id into v_prog;

  insert into onb_sections (program_id, title, sort) values
    (v_prog, '{"en":"Welcome to AG","ms":"Selamat Datang ke AG","id":"Selamat Datang di AG"}', 1)
    returning id into v_s1;
  insert into onb_sections (program_id, title, sort) values
    (v_prog, '{"en":"Your Profession","ms":"Profesion Anda","id":"Profesi Anda"}', 2)
    returning id into v_s2;
  insert into onb_sections (program_id, title, sort) values
    (v_prog, '{"en":"How We Work","ms":"Cara Kami Bekerja","id":"Cara Kami Bekerja"}', 3)
    returning id into v_s3;
  insert into onb_sections (program_id, title, sort) values
    (v_prog, '{"en":"Your First Mission","ms":"Misi Pertama Anda","id":"Misi Pertama Anda"}', 4)
    returning id into v_s4;

  -- section 1: real content, published, so the flow works on day one
  insert into onb_lessons (section_id, type, title, body, duration_min, min_seconds, ack_required, sort, status) values
  (v_s1, 'article',
   '{"en":"Welcome to IQI AG","ms":"Selamat Datang ke IQI AG","id":"Selamat Datang di IQI AG"}',
   '{"en":"Welcome, Warrior. You have joined a team that believes real estate is a profession of trust, discipline and service — not luck. Over the next lessons you will learn who we are, how we work, and what is expected of you. Take your time. Everything here exists to make you better.",
     "ms":"Selamat datang, Warrior. Anda telah menyertai pasukan yang percaya hartanah ialah profesion amanah, disiplin dan khidmat — bukan nasib. Dalam pelajaran seterusnya anda akan belajar siapa kami, cara kami bekerja, dan apa yang diharapkan daripada anda. Ambil masa anda. Semua di sini wujud untuk menjadikan anda lebih baik.",
     "id":"Selamat datang, Warrior. Anda telah bergabung dengan tim yang percaya properti adalah profesi kepercayaan, disiplin, dan pelayanan — bukan keberuntungan. Dalam pelajaran berikutnya Anda akan belajar siapa kami, cara kami bekerja, dan apa yang diharapkan dari Anda. Jangan terburu-buru. Semua di sini ada untuk membuat Anda lebih baik."}',
   3, 60, true, 1, 'published'),
  (v_s1, 'article',
   '{"en":"Become Better. Build Better. Give Better.","ms":"Become Better. Build Better. Give Better.","id":"Become Better. Build Better. Give Better."}',
   '{"en":"Three promises define AG. BECOME BETTER: you improve a skill every single week — calling, presenting, closing. BUILD BETTER: you build systems and relationships that outlast one transaction. GIVE BETTER: your success lifts your family, your team and your community. Every module in this app serves one of these three.",
     "ms":"Tiga janji mentakrifkan AG. BECOME BETTER: anda menajamkan satu kemahiran setiap minggu — menelefon, membentang, menutup jualan. BUILD BETTER: anda membina sistem dan hubungan yang bertahan melangkaui satu transaksi. GIVE BETTER: kejayaan anda mengangkat keluarga, pasukan dan komuniti anda. Setiap modul dalam aplikasi ini berkhidmat untuk salah satu daripada tiga ini.",
     "id":"Tiga janji mendefinisikan AG. BECOME BETTER: Anda mengasah satu keterampilan setiap minggu — menelepon, presentasi, closing. BUILD BETTER: Anda membangun sistem dan hubungan yang bertahan melampaui satu transaksi. GIVE BETTER: kesuksesan Anda mengangkat keluarga, tim, dan komunitas Anda. Setiap modul di aplikasi ini melayani salah satu dari tiga hal ini."}',
   3, 60, true, 2, 'published'),
  (v_s1, 'article',
   '{"en":"Trust is the Currency of AG","ms":"Amanah ialah Mata Wang AG","id":"Kepercayaan adalah Mata Uang AG"}',
   '{"en":"A client trusts you with the biggest purchase of their life. That trust is our only real asset. Never promise what you have not verified. If you are unsure whether a claim about a property is correct, verify with an authorised person BEFORE communicating it. One honest \"let me confirm that for you\" builds more trust than ten confident guesses.",
     "ms":"Pelanggan mempercayakan anda dengan pembelian terbesar dalam hidup mereka. Amanah itu satu-satunya aset sebenar kita. Jangan sesekali janjikan apa yang belum anda sahkan. Jika tidak pasti sama ada sesuatu dakwaan tentang hartanah itu betul, sahkan dengan orang yang diberi kuasa SEBELUM menyampaikannya. Satu \"izinkan saya sahkan dulu\" yang jujur membina lebih banyak kepercayaan daripada sepuluh tekaan yang yakin.",
     "id":"Klien mempercayakan pembelian terbesar dalam hidupnya kepada Anda. Kepercayaan itu satu-satunya aset kita yang sesungguhnya. Jangan pernah menjanjikan apa yang belum Anda verifikasi. Jika ragu apakah suatu klaim tentang properti benar, verifikasi dengan orang yang berwenang SEBELUM menyampaikannya. Satu \"izinkan saya pastikan dulu\" yang jujur membangun lebih banyak kepercayaan daripada sepuluh tebakan yang percaya diri."}',
   4, 90, false, 3, 'published');

  -- the trust lesson carries the spec's knowledge check
  update onb_lessons set quiz =
    '{"question":{"en":"What should you do if you are unsure whether a property claim is correct?","ms":"Apa patut anda buat jika tidak pasti sama ada dakwaan tentang hartanah itu betul?","id":"Apa yang harus Anda lakukan jika ragu apakah klaim properti benar?"},
      "options":[
        {"en":"Guess","ms":"Teka sahaja","id":"Tebak saja"},
        {"en":"Ask an authorised person / verify before communicating","ms":"Tanya orang yang diberi kuasa / sahkan sebelum menyampaikan","id":"Tanya orang berwenang / verifikasi sebelum menyampaikan"},
        {"en":"Promise first and check later","ms":"Janji dulu, semak kemudian","id":"Janji dulu, cek belakangan"},
        {"en":"Ignore the question","ms":"Abaikan soalan itu","id":"Abaikan pertanyaannya"}],
      "correct":1,
      "explanation":{"en":"Verify first, always. Trust is the currency of AG.","ms":"Sahkan dahulu, selalu. Amanah ialah mata wang AG.","id":"Verifikasi dulu, selalu. Kepercayaan adalah mata uang AG."},
      "retry":true}'
  where section_id = v_s1 and sort = 3;

  -- remaining curriculum as DRAFTS — admin fills content, then publishes
  insert into onb_lessons (section_id, type, title, sort, status) values
  (v_s2, 'article', '{"en":"What Is Real Estate?","ms":"Apa Itu Hartanah?","id":"Apa Itu Properti?"}', 1, 'draft'),
  (v_s2, 'article', '{"en":"Professional Conduct","ms":"Etika Profesional","id":"Etika Profesional"}', 2, 'draft'),
  (v_s2, 'article', '{"en":"Legal & Compliance Introduction","ms":"Pengenalan Undang-undang & Pematuhan","id":"Pengantar Hukum & Kepatuhan"}', 3, 'draft'),
  (v_s2, 'article', '{"en":"NCC / REN Pathway","ms":"Laluan NCC / REN","id":"Jalur NCC / REN"}', 4, 'draft'),
  (v_s3, 'article', '{"en":"IQI AG Hero — Your System","ms":"IQI AG Hero — Sistem Anda","id":"IQI AG Hero — Sistem Anda"}', 1, 'draft'),
  (v_s3, 'article', '{"en":"Pod and Captain","ms":"Pod dan Kapten","id":"Pod dan Kapten"}', 2, 'draft'),
  (v_s3, 'article', '{"en":"Communication","ms":"Komunikasi","id":"Komunikasi"}', 3, 'draft'),
  (v_s3, 'article', '{"en":"Follow-up Discipline","ms":"Disiplin Susulan","id":"Disiplin Tindak Lanjut"}', 4, 'draft'),
  (v_s4, 'article', '{"en":"30 Days Closing — Introduction","ms":"30 Days Closing — Pengenalan","id":"30 Days Closing — Pengantar"}', 1, 'draft');
end $$;
