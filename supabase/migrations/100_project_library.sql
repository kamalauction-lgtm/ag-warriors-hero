-- ============================================================
-- 100_project_library.sql — a document + instruction library per project.
-- ADDITIVE. Replaces ren's M4 "Projects" module, generalised beyond EXSIM.
--
-- Projects already exist as m4u_properties (country-scoped, admin-managed,
-- used by the Caller). This adds a RESOURCES layer keyed to a project:
-- uploaded files, external links, and written instructions. Agents browse
-- their country's projects and open the materials; admins curate them.
--
-- Two visibility levels so a sensitive doc can be limited without a new system:
--   'all'     — any active agent in the project's country
--   'granted' — only agents with an APPROVED m4u_grant for that project
--
-- Files live in a PRIVATE bucket; the app uploads them (admin-only storage
-- policy) and the worker mints short-lived signed URLs after checking access —
-- the same pattern as certificates, so a link can't be shared out of band.
--
-- ROLLBACK: drop project_resources + functions + the bucket policies.
-- ============================================================

create table if not exists project_resources (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references m4u_properties(id) on delete cascade,
  country country_t not null,
  kind text not null check (kind in ('file', 'link', 'note')),
  title text not null,
  description text,
  storage_path text,                          -- kind = file
  file_type text, file_size int,
  url text,                                   -- kind = link
  body text,                                  -- kind = note (instructions)
  visibility text not null default 'all' check (visibility in ('all', 'granted')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_res_project on project_resources (property_id, sort_order);

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-docs', 'project-docs', false, 20971520)   -- 20 MB
on conflict (id) do nothing;

alter table project_resources enable row level security;
revoke insert, update, delete on project_resources from authenticated, anon;

-- can the caller see a given resource?
create or replace function can_see_resource(r project_resources)
returns boolean language sql stable security definer set search_path = public as $$
  select r.active
     and (r.country::text = my_country()::text or my_role() = 'master_admin')
     and (r.visibility = 'all'
          or is_admin()
          or exists (select 1 from m4u_grants g
                      where g.property_id = r.property_id
                        and g.agent_id = auth.uid() and g.approved));
$$;
grant execute on function can_see_resource(project_resources) to authenticated;

drop policy if exists r_project_res on project_resources;
create policy r_project_res on project_resources for select using (can_see_resource(project_resources));

-- admins may write files into the bucket from the app; nobody else touches it
drop policy if exists w_projdocs_admin on storage.objects;
create policy w_projdocs_admin on storage.objects for all
  using (bucket_id = 'project-docs' and is_admin())
  with check (bucket_id = 'project-docs' and is_admin());

-- ------------------------------------------------------------
-- AGENT: the library — projects in my country with a resource count
-- ------------------------------------------------------------
create or replace function fn_project_library()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_country text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select country::text into v_country from profiles where id = auth.uid();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'property_id', p.id, 'name', p.name, 'type', p.type,
             'description', p.description,
             'resource_count', (select count(*) from project_resources r
                                 where r.property_id = p.id and can_see_resource(r)))
           order by p.name)
    from m4u_properties p
    where (p.country::text = v_country or my_role() = 'master_admin')
      and not p.name like '\_\_%'                     -- hide triage buckets
      and exists (select 1 from project_resources r
                   where r.property_id = p.id and can_see_resource(r))), '[]'::jsonb);
end $$;
grant execute on function fn_project_library() to authenticated;

-- AGENT: the resources for one project I may see (files carry no path — the
-- worker mints the signed URL on demand, so the storage path never leaks)
create or replace function fn_project_resources(p_property bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'kind', r.kind, 'title', r.title, 'description', r.description,
             'url', case when r.kind = 'link' then r.url end,
             'body', case when r.kind = 'note' then r.body end,
             'file_type', r.file_type, 'file_size', r.file_size,
             'visibility', r.visibility)
           order by r.sort_order, r.created_at)
    from project_resources r
    where r.property_id = p_property and can_see_resource(r)), '[]'::jsonb);
end $$;
grant execute on function fn_project_resources(bigint) to authenticated;

-- ------------------------------------------------------------
-- ADMIN: create / edit a resource. The file itself is uploaded to the bucket
-- by the app first (admin storage policy); this registers it.
-- ------------------------------------------------------------
create or replace function fn_admin_set_project_resource(
  p_id uuid, p_property bigint, p_kind text, p_title text,
  p_description text, p_storage_path text, p_file_type text, p_file_size int,
  p_url text, p_body text, p_visibility text, p_sort int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_country text; v_prop_country text; v_id uuid;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select country::text into v_prop_country from m4u_properties where id = p_property;
  if v_prop_country is null then raise exception 'unknown project'; end if;
  select country::text into v_country from profiles where id = auth.uid();
  if my_role() <> 'master_admin' and v_prop_country <> v_country then
    raise exception 'that project is outside your country';
  end if;
  if p_kind not in ('file', 'link', 'note') then raise exception 'kind must be file, link or note'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'title required'; end if;
  if p_kind = 'link' and coalesce(p_url, '') !~ '^https?://' then raise exception 'a link needs an http(s) URL'; end if;
  if p_kind = 'note' and btrim(coalesce(p_body, '')) = '' then raise exception 'a note needs instruction text'; end if;
  if p_kind = 'file' and btrim(coalesce(p_storage_path, '')) = '' then raise exception 'a file needs an uploaded path'; end if;

  if p_id is null then
    insert into project_resources (property_id, country, kind, title, description,
      storage_path, file_type, file_size, url, body, visibility, sort_order, created_by)
    values (p_property, v_prop_country::country_t, p_kind, btrim(p_title), p_description,
      p_storage_path, p_file_type, p_file_size, p_url, p_body,
      coalesce(p_visibility, 'all'), coalesce(p_sort, 0), auth.uid())
    returning id into v_id;
  else
    update project_resources set title = btrim(p_title), description = p_description,
      url = p_url, body = p_body, visibility = coalesce(p_visibility, visibility),
      sort_order = coalesce(p_sort, sort_order), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'unknown resource'; end if;
  end if;
  perform audit_log('project_resource_saved', 'project_resource', v_id::text, null,
                    p_kind || ' · ' || btrim(p_title), null);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
grant execute on function fn_admin_set_project_resource(uuid,bigint,text,text,text,text,text,int,text,text,text,int) to authenticated;

create or replace function fn_admin_delete_project_resource(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_country text; v_res project_resources;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select * into v_res from project_resources where id = p_id;
  if v_res.id is null then raise exception 'unknown resource'; end if;
  select country::text into v_country from profiles where id = auth.uid();
  if my_role() <> 'master_admin' and v_res.country::text <> v_country then
    raise exception 'outside your country';
  end if;
  -- the storage object is removed by the app (admin storage policy); we drop the row
  delete from project_resources where id = p_id;
  perform audit_log('project_resource_deleted', 'project_resource', p_id::text,
                    v_res.title, 'deleted', v_res.storage_path);
  return jsonb_build_object('ok', true, 'storage_path', v_res.storage_path);
end $$;
grant execute on function fn_admin_delete_project_resource(uuid) to authenticated;

-- the caller may fetch a file resource's storage path ONLY if they can see it —
-- the worker calls this before minting a signed URL.
create or replace function fn_project_file_path(p_resource uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_res project_resources;
begin
  select * into v_res from project_resources where id = p_resource and kind = 'file';
  if v_res.id is null then raise exception 'not a file resource'; end if;
  if not can_see_resource(v_res) then raise exception 'not authorised'; end if;
  return v_res.storage_path;
end $$;
grant execute on function fn_project_file_path(uuid) to authenticated;

-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
select 'project library' as check, count(*) as resources from project_resources;
select 'bucket' as check, id, public from storage.buckets where id = 'project-docs';
