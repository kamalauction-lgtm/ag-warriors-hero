"""Generate Postgres migration SQL from the Bluehost marketing4u MySQL dump.

Read-only against the dump; writes .sql files into supabase/migrations/.
Re-runnable: every generated file is idempotent (ON CONFLICT DO NOTHING).

Key decisions (from analysing the real 2026-08-03 export):
  * legacy integer ids are PRESERVED (leads keep their id) so GHL links,
    call history and multi-interest rows all stay joined up.
  * lead country is derived from its property's team; triage leads (no
    property) fall back to their phone prefix (+60 MY / +62 ID), else MY.
  * agent identity is handled separately (see phase C) because m4u agents
    must become Supabase auth users; leads carry legacy agent ids in
    staging columns until that backfill runs.
  * webhook_log (6.6k rows of raw request bodies) is NOT migrated — it is
    an audit log of deliveries, not business data.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from m4u_parse import parse  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')


def q(v):
    """Quote a value for SQL."""
    if v is None or v == '':
        return 'null'
    return "'" + str(v).replace('\\', '\\\\').replace("'", "''") + "'"


def qnum(v):
    return 'null' if v in (None, '') else str(v)


def qbool(v):
    return 'true' if str(v) in ('1', 'true') else 'false'


def qts(v):
    """MySQL DATETIME -> timestamptz literal (source TZ is Asia/Kuala_Lumpur)."""
    if not v or str(v).startswith('0000'):
        return 'null'
    return "'" + str(v) + " Asia/Kuala_Lumpur'::timestamptz"


def country_of_lead(row, C, prop_team):
    pid = row[C('leads', 'property_id')]
    team = prop_team.get(pid)
    if team in ('MY', 'ID'):
        return team
    pn = row[C('leads', 'phone_norm')] or ''
    if pn.startswith('+62'):
        return 'ID'
    if pn.startswith('+60'):
        return 'MY'
    return 'MY'          # dump is the MY-hosted install


def chunks(rows, n):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


def main(dump_path):
    d = parse(dump_path)

    def C(t, n):
        return d[t]['cols'].index(n)

    prop_team = {r[0]: r[C('properties', 'team')] for r in d['properties']['rows']}
    written = []

    # ---------------- 015: reference data ----------------
    L = ["-- 015_m4u_data_reference.sql — generated from the Bluehost export.",
         "-- Properties, custom fields, pipeline map, quotes, BOP sessions.",
         "-- Preserves legacy ids so leads/rosters keep pointing at the right rows.",
         "begin;", ""]

    L.append("-- production label fix: the live DB labels this outcome 'Working FT'")
    L.append("update m4u_dispositions set label = 'Working FT' where key = 'Working Full-Time';")
    L.append("")

    L.append("alter table m4u_properties add column if not exists legacy_id int;")
    L.append("create unique index if not exists m4u_prop_legacy on m4u_properties(legacy_id);")
    for r in d['properties']['rows']:
        L.append(
            "insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values "
            f"({r[0]}, {q(r[C('properties','team')])}::country_t, {q(r[C('properties','name')])}, "
            f"{q(r[C('properties','ad_source')])}, {q(r[C('properties','type')])}, "
            f"{q(r[C('properties','description')])}, {qts(r[C('properties','created_at')])}) "
            "on conflict (legacy_id) do nothing;")
    L.append("")

    for r in d['field_settings']['rows']:
        fc = d['field_settings']['cols']
        team = r[fc.index('team')] if 'team' in fc else 'MY'
        L.append(
            "insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values "
            f"({q(team)}::country_t, {q(r[C('field_settings','field_key')])}, {q(r[C('field_settings','label')])}, "
            f"{qbool(r[C('field_settings','visible_to_agent')])}, {q(r[C('field_settings','aliases')])}, "
            f"{qnum(r[C('field_settings','sort_order')])}) on conflict do nothing;")
    L.append("")

    for r in d['pipeline_map']['rows']:
        pc = d['pipeline_map']['cols']
        team = r[pc.index('team')] if 'team' in pc else 'MY'
        pid = r[C('pipeline_map', 'property_id')]
        L.append(
            "insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values "
            f"({q(r[C('pipeline_map','ghl_pipeline_id')])}, {q(r[C('pipeline_map','ghl_pipeline_name')])}, "
            f"{q(team)}::country_t, "
            f"{'(select id from m4u_properties where legacy_id=' + str(pid) + ')' if pid else 'null'}) "
            "on conflict (ghl_pipeline_id) do nothing;")
    L.append("")

    for r in d['quotes']['rows']:
        qc = d['quotes']['cols']
        team = r[qc.index('team')] if 'team' in qc else 'MY'
        L.append(
            "insert into quotes (country, body, author, active) values "
            f"({q(team)}::country_t, {q(r[C('quotes','body')])}, {q(r[C('quotes','author')])}, "
            f"{qbool(r[C('quotes','active')])}) on conflict do nothing;")
    L.append("")

    L.append("alter table bop_sessions add column if not exists legacy_id int;")
    L.append("create unique index if not exists bop_sess_legacy on bop_sessions(legacy_id);")
    for r in d['bop_sessions']['rows']:
        L.append(
            "insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values "
            f"({r[0]}, {q(r[C('bop_sessions','team')])}::country_t, {q(r[C('bop_sessions','type')])}, "
            f"{q(r[C('bop_sessions','title')])}, {qts(r[C('bop_sessions','starts_at')])}, "
            f"{q(r[C('bop_sessions','link')])}, {q(r[C('bop_sessions','location')])}, "
            f"{q(r[C('bop_sessions','map_url')])}, {q(r[C('bop_sessions','notes')])}, "
            f"{qbool(r[C('bop_sessions','active')])}) on conflict (legacy_id) do nothing;")
    L += ["", "commit;", "",
          "select 'properties' t, count(*) from m4u_properties union all",
          "select 'fields', count(*) from m4u_field_settings union all",
          "select 'pipelines', count(*) from m4u_pipeline_map union all",
          "select 'quotes', count(*) from quotes union all",
          "select 'bop_sessions', count(*) from bop_sessions;"]
    write('015_m4u_data_reference.sql', L, written)

    # ---------------- 016+: leads (chunked) ----------------
    lc = d['leads']['cols']
    prep = ["-- 016_m4u_data_leads_prep.sql — staging columns + legacy id preservation",
            "begin;",
            "alter table m4u_leads add column if not exists legacy_id int;",
            "alter table m4u_leads add column if not exists legacy_owner int;",
            "alter table m4u_leads add column if not exists legacy_reserved int;",
            "create unique index if not exists m4u_leads_legacy on m4u_leads(legacy_id);",
            "commit;"]
    write('016_m4u_data_leads_prep.sql', prep, written)

    rows = d['leads']['rows']
    for i, part in enumerate(chunks(rows, 700), start=1):
        L = [f"-- 017_{i:02d} leads chunk {i} ({len(part)} rows) — safe to re-run", "begin;"]
        for r in part:
            ctry = country_of_lead(r, C, prop_team)
            pid = r[C('leads', 'property_id')]
            L.append(
                "insert into m4u_leads (legacy_id, country, ghl_contact_id, ghl_opportunity_id, property_id, "
                "phone, phone_norm, name, custom_fields, current_label, attempt_count, status, "
                "cooldown_until, reserved_until, legacy_owner, legacy_reserved, received_at, created_at, updated_at) values ("
                f"{r[0]}, {q(ctry)}::country_t, {q(r[C('leads','ghl_contact_id')])}, "
                f"{q(r[C('leads','ghl_opportunity_id')])}, "
                f"{'(select id from m4u_properties where legacy_id=' + str(pid) + ')' if pid else 'null'}, "
                f"{q(r[C('leads','phone')])}, {q(r[C('leads','phone_norm')] or r[C('leads','phone')])}, "
                f"{q(r[C('leads','name')])}, {q(r[C('leads','custom_fields')])}::jsonb, "
                f"{q(r[C('leads','current_label')] or 'New')}, {qnum(r[C('leads','attempt_count')]) or 0}, "
                f"{q(r[C('leads','status')])}::lead_status_t, "
                f"{qts(r[C('leads','cooldown_until')])}, {qts(r[C('leads','reserved_until')])}, "
                f"{qnum(r[C('leads','owner_agent_id')])}, {qnum(r[C('leads','reserved_for_agent_id')])}, "
                f"{qts(r[C('leads','received_at')])}, {qts(r[C('leads','created_at')])}, "
                f"{qts(r[C('leads','updated_at')])}) on conflict (legacy_id) do nothing;")
        L += ["commit;", "select count(*) as leads_so_far from m4u_leads;"]
        write(f'017_{i:02d}_m4u_data_leads.sql', L, written)

    # ---------------- multi-interest ----------------
    L = ["-- 018_m4u_data_lead_props.sql — multi-interest rows", "begin;"]
    for r in d['lead_properties']['rows']:
        L.append(
            "insert into m4u_lead_props (lead_id, property_id, added_while_locked, added_at) "
            f"select l.id, p.id, {qbool(r[C('lead_properties','added_while_locked')])}, "
            f"{qts(r[C('lead_properties','added_at')])} "
            f"from m4u_leads l, m4u_properties p where l.legacy_id={r[0]} and p.legacy_id={r[1]} "
            "on conflict do nothing;")
    L += ["commit;", "select count(*) as lead_props from m4u_lead_props;"]
    write('018_m4u_data_lead_props.sql', L, written)

    print("\nGenerated:")
    for w in written:
        print("  ", w)
    print(f"\nLeads: {len(rows)} | lead_props: {len(d['lead_properties']['rows'])} | "
          f"attempts: {len(d['call_attempts']['rows'])} (phase D, needs agent map)")


def write(name, lines, written):
    path = os.path.abspath(os.path.join(OUT, name))
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    written.append(f"{name}  ({os.path.getsize(path)//1024} KB)")


if __name__ == '__main__':
    main(sys.argv[1])
