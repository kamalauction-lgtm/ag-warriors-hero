-- 050_m4u_notes_messages.sql — Messages: the admin↔agent Q&A goes live.
--
-- The old PHP caller had this loop: admin pins a question on a lead (or a
-- disposition bucket), the agent sees it pinned on the lead card and in a
-- Messages inbox with a badge, and replying resolves the thread. The table
-- and the read policy have existed since 020 — this adds the write paths.

-- admins compose questions from Command HQ (lead-scoped or bucket-scoped)
drop policy if exists i_m4u_notes_admin on m4u_notes;
create policy i_m4u_notes_admin on m4u_notes for insert
  with check (is_admin() and author_id = auth.uid());

drop policy if exists u_m4u_notes_admin on m4u_notes;
create policy u_m4u_notes_admin on m4u_notes for update
  using (is_admin()) with check (is_admin());

-- agent reply: stores the reply AND stamps the parent resolved, atomically —
-- same behaviour as the old app's agentReply(). SECURITY DEFINER so the agent
-- needs no direct insert/update policy on the table.
create or replace function m4u_note_reply(p_note bigint, p_body text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_parent m4u_notes;
begin
  select * into v_parent from m4u_notes where id = p_note for update;
  if v_parent.id is null then raise exception 'note not found'; end if;
  if v_parent.target_agent_id is distinct from auth.uid() then
    raise exception 'not your thread';
  end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'reply required'; end if;
  insert into m4u_notes (lead_id, parent_id, author_id, author_role, target_agent_id, body)
  values (v_parent.lead_id, v_parent.id, auth.uid(), 'agent', v_parent.target_agent_id, btrim(p_body));
  update m4u_notes set resolved_at = now() where id = v_parent.id and resolved_at is null;
end $$;

revoke all on function m4u_note_reply(bigint, text) from public, anon;
grant execute on function m4u_note_reply(bigint, text) to authenticated;
