-- 068_register.sql — self-registration with admin approval (Kamal, 2026-08-11).
--
-- The login page had no registration at all, so recruits could not present
-- themselves (with a visible phone number) for approval. Flow: /register signs
-- the user up in auth, then this RPC creates their profile as status='pending'
-- (role locked to 'agent'); they cannot use the app until an admin approves
-- them in Command HQ → People & Roles (the pending queue that already exists).

create or replace function register_profile(
  p_name text,
  p_phone text,
  p_country text                    -- 'MY' | 'ID'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from profiles where id = v_uid) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if btrim(coalesce(p_phone, '')) = '' then raise exception 'phone required'; end if;
  if p_country not in ('MY', 'ID') then raise exception 'country must be MY or ID'; end if;

  select email into v_email from auth.users where id = v_uid;

  insert into profiles (id, name, phone, email, country, role, status, career_rank, language)
  values (v_uid, btrim(p_name), btrim(p_phone), v_email, p_country::country_t,
          'agent', 'pending', 'REN',
          case when p_country = 'ID' then 'id' else 'en' end);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function register_profile(text, text, text) from public, anon;
grant execute on function register_profile(text, text, text) to authenticated;
