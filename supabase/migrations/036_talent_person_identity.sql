-- 036_talent_person_identity.sql — email becomes the person's identity.
--
-- Why: someone fills in /myself before the programme, then /testme mid-class.
-- Until now those were two unrelated rows, so the one thing the programme most
-- wants to see — who this person was coming in, and what task suited them once
-- they were in — could not be assembled at all.
--
-- Email is the key because it is the one identifier a person reliably repeats.
-- It is stored NORMALISED (lowercased, trimmed) in its own column so matching
-- does not depend on how they typed it the second time.
--
-- DELIBERATELY NOT BUILT: an email lookup on the public form. /myself is open to
-- anyone, so a "type your email and we'll fill in your details" feature would let
-- a stranger retrieve a real person's name, country and experience by guessing
-- addresses. Linking therefore happens on the FACILITATOR side, behind is_admin(),
-- and never hands data back to the public page.

-- ---------- 1. the column ----------
alter table talent_participants add column if not exists email text;

-- matching is always on the normalised form
create index if not exists talent_participant_email
  on talent_participants (lower(btrim(email)));

-- Backfill: `contact` was free text (phone OR email, participant's choice).
-- Anything that looks like an address becomes the identity; phones stay put.
update talent_participants
   set email = lower(btrim(contact))
 where email is null
   and contact is not null
   and contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

-- ---------- 2. capture it on the way in ----------
create or replace function talent_save_details(
  p_token text, p_full_name text, p_preferred text, p_country text,
  p_contact text, p_experience text, p_leadership text,
  p_developmental boolean, p_not_clinical boolean, p_self_reported boolean,
  p_data_use boolean, p_sharing text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_email text;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  if not (p_developmental and p_not_clinical and p_self_reported and p_data_use) then
    raise exception 'all acknowledgements are required';
  end if;
  if p_sharing not in ('private','summary','full') then
    raise exception 'invalid sharing choice';
  end if;

  v_email := lower(btrim(coalesce(p_contact, '')));
  if v_email = '' then
    raise exception 'an email address is required';
  end if;
  -- deliberately permissive: enough to catch a typo or a phone number, not so
  -- strict that a valid but unusual address is refused
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'please enter a valid email address';
  end if;

  insert into talent_participants (attempt_id, full_name, preferred_name, country,
    contact, email, experience, leadership)
  values (v_id, btrim(p_full_name), nullif(btrim(coalesce(p_preferred,'')),''), p_country,
    v_email, v_email, p_experience, p_leadership)
  on conflict (attempt_id) do update set
    full_name = excluded.full_name, preferred_name = excluded.preferred_name,
    country = excluded.country, contact = excluded.contact, email = excluded.email,
    experience = excluded.experience, leadership = excluded.leadership;

  insert into talent_consents (attempt_id, developmental_ack, not_clinical_ack,
    self_reported_ack, data_use_ack, sharing)
  values (v_id, true, true, true, true, p_sharing)
  on conflict (attempt_id) do update set sharing = excluded.sharing, agreed_at = now();

  insert into talent_audit (attempt_id, action, detail) values (v_id, 'details_saved', p_sharing);
end $$;

-- ---------- 3. the facilitator view: one person, every sitting ----------
-- Consent still governs what is released per attempt: a sitting the participant
-- marked private contributes its attendance facts and nothing else.
create or replace function talent_admin_person(p_email text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb; v_key text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  v_key := lower(btrim(coalesce(p_email, '')));
  if v_key = '' then raise exception 'email required'; end if;

  select jsonb_build_object(
    'email', v_key,
    'name', (select p.full_name from talent_participants p
              where lower(btrim(p.email)) = v_key
              order by p.created_at desc limit 1),
    'sittings', coalesce(jsonb_agg(x order by x->>'started_at'), '[]'::jsonb)
  ) into v_out
  from (
    select jsonb_build_object(
      'attempt_id', a.id,
      'event', e.name, 'event_code', e.code,
      'version', v.code,
      'purpose', case when v.code like 'myself%' then 'person' else 'position' end,
      'status', a.status,
      'language', a.language,
      'started_at', a.started_at,
      'submitted_at', a.submitted_at,
      'minutes', round(a.duration_seconds / 60.0, 1),
      'sharing', coalesce(c.sharing, 'private'),
      'flags', (select count(*) from talent_flags f where f.attempt_id = a.id),
      'top_pathway', case when coalesce(c.sharing,'private') = 'private'
                            or v.code like 'myself%' then null else
        (select s.key from talent_scores s
          where s.attempt_id = a.id and s.kind = 'role' and s.rank = 1) end,
      'top_motivation', case when coalesce(c.sharing,'private') = 'private' then null else
        (select s.key from talent_scores s
          where s.attempt_id = a.id and s.kind = 'motivation' and s.rank = 1) end
    ) as x
    from talent_participants p
    join talent_attempts a on a.id = p.attempt_id
    join talent_events e on e.id = a.event_id
    join talent_versions v on v.id = a.version_id
    left join talent_consents c on c.attempt_id = a.id
    where lower(btrim(p.email)) = v_key
  ) s;

  return v_out;
end $$;

revoke all on function talent_admin_person(text) from anon;
grant execute on function talent_admin_person(text) to authenticated;

-- ---------- 4. show the link in the roster ----------
-- Adds `email` and `sittings` so the participant list can say "3rd sitting"
-- without a second round trip.
create or replace function talent_admin_roster(p_event bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'attempt_id', a.id,
      'full_name',  p.full_name,
      'preferred',  p.preferred_name,
      'contact',    p.contact,
      'email',      lower(btrim(p.email)),
      'sittings',   (select count(*) from talent_participants p2
                      where p2.email is not null
                        and lower(btrim(p2.email)) = lower(btrim(p.email))),
      'country',    p.country,
      'experience', p.experience,
      'leadership', p.leadership,
      'language',   a.language,
      'status',     a.status,
      'started_at', a.started_at,
      'submitted_at', a.submitted_at,
      'minutes',    round(a.duration_seconds / 60.0, 1),
      'sharing',    coalesce(c.sharing, 'private'),
      'has_report', exists (select 1 from talent_reports r where r.attempt_id = a.id),
      'flags',      (select count(*) from talent_flags f where f.attempt_id = a.id),
      'top_pathway', case when coalesce(c.sharing,'private') = 'private' then null else
        (select s.key from talent_scores s
          where s.attempt_id = a.id and s.kind = 'role' and s.rank = 1) end,
      'headline',   case when coalesce(c.sharing,'private') = 'private' then null else
        (select jsonb_agg(jsonb_build_object('key', s.key, 'band', s.band, 'score', s.normalised)
                order by s.normalised desc nulls last)
           from (select key, band, normalised from talent_scores
                  where attempt_id = a.id and kind = 'dimension'
                  order by normalised desc nulls last limit 3) s) end
    ) as x
    from talent_attempts a
    left join talent_participants p on p.attempt_id = a.id
    left join talent_consents c on c.attempt_id = a.id
    where a.event_id = p_event
  ) s;
  return v_out;
end $$;
