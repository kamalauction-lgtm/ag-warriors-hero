"""Bulk-load the Bluehost caller data into Supabase via the REST API.

Usage:  SUPABASE_SECRET=... python tools/m4u_load.py "<dump.sql>" [--phase leads|props|attempts|all]

Idempotent: every batch uses on_conflict so re-running is safe.
Requires 015 + 016 to have been applied (legacy_id columns must exist).
The secret is read from the environment — never hardcode it.
"""
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from m4u_parse import parse  # noqa: E402

URL = "https://zlbyfgfublqlrsqohvsn.supabase.co/rest/v1"
SECRET = os.environ.get("SUPABASE_SECRET")
BATCH = 500


def req(method, path, payload=None, prefer=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("apikey", SECRET)
    r.add_header("Authorization", f"Bearer {SECRET}")
    r.add_header("Content-Type", "application/json")
    if prefer:
        r.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]


def ts(v):
    """MySQL datetime -> ISO8601 with the source timezone (Asia/Kuala_Lumpur = +08).

    The live data contains junk values ('0', '0000-00-00 …') — treat anything that
    is not a full YYYY-MM-DD HH:MM:SS as missing rather than letting Postgres choke.
    """
    s = str(v or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}", s) or s.startswith("0000"):
        return None
    return s.replace(" ", "T") + "+08:00"


def fetch_all(path_no_range, page=1000):
    """PostgREST caps rows per response; page through with Range headers."""
    out, start = [], 0
    while True:
        r = urllib.request.Request(f"{URL}{path_no_range}", method="GET")
        r.add_header("apikey", SECRET)
        r.add_header("Authorization", f"Bearer {SECRET}")
        r.add_header("Range-Unit", "items")
        r.add_header("Range", f"{start}-{start + page - 1}")
        with urllib.request.urlopen(r) as resp:
            batch = json.loads(resp.read().decode() or "[]")
        out.extend(batch)
        if len(batch) < page:
            return out
        start += page


def jparse(v):
    if not v:
        return None
    try:
        return json.loads(v)
    except Exception:
        return None


def country_of(row, C, prop_team):
    team = prop_team.get(row[C("leads", "property_id")])
    if team in ("MY", "ID"):
        return team
    pn = row[C("leads", "phone_norm")] or ""
    return "ID" if pn.startswith("+62") else "MY"


def push(table, rows, conflict):
    done = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        code, body = req("POST", f"/{table}?on_conflict={conflict}", chunk,
                         prefer="resolution=merge-duplicates,return=minimal")
        if code >= 300:
            print(f"  FAIL {table} batch {i//BATCH+1}: HTTP {code} {body}")
            return done
        done += len(chunk)
        print(f"  .. {table}: {done}/{len(rows)}")
    return done


def main():
    if not SECRET:
        sys.exit("SUPABASE_SECRET not set")
    dump, phase = sys.argv[1], (sys.argv[3] if len(sys.argv) > 3 else "all")
    d = parse(dump)

    def C(t, n):
        return d[t]['cols'].index(n)

    prop_team = {r[0]: r[C("properties", "team")] for r in d["properties"]["rows"]}

    # legacy property id -> new id
    code, props = req("GET", "/m4u_properties?select=id,legacy_id")
    if code >= 300:
        sys.exit(f"cannot read properties: {props}  (did 015 run?)")
    pmap = {p["legacy_id"]: p["id"] for p in props if p.get("legacy_id") is not None}
    print(f"property map: {len(pmap)} entries")

    if phase in ("leads", "all"):
        rows = []
        for r in d["leads"]["rows"]:
            pid = r[C("leads", "property_id")]
            rows.append({
                "legacy_id": int(r[0]),
                "country": country_of(r, C, prop_team),
                "ghl_contact_id": r[C("leads", "ghl_contact_id")],
                "ghl_opportunity_id": r[C("leads", "ghl_opportunity_id")],
                "property_id": pmap.get(int(pid)) if pid else None,
                "phone": r[C("leads", "phone")],
                # phone_norm is NOT NULL and uniquely indexed. A lead with no usable
                # number still carries real history, so keep it with an obviously
                # invalid, unique marker — the UI flags it for an admin to correct.
                "phone_norm": (r[C("leads", "phone_norm")] or r[C("leads", "phone")]
                               or f"invalid:{r[0]}"),
                "name": r[C("leads", "name")],
                "custom_fields": jparse(r[C("leads", "custom_fields")]),
                "current_label": r[C("leads", "current_label")] or "New",
                "attempt_count": int(r[C("leads", "attempt_count")] or 0),
                "status": r[C("leads", "status")],
                "cooldown_until": ts(r[C("leads", "cooldown_until")]),
                "reserved_until": ts(r[C("leads", "reserved_until")]),
                "legacy_owner": int(r[C("leads", "owner_agent_id")]) if r[C("leads", "owner_agent_id")] else None,
                "legacy_reserved": int(r[C("leads", "reserved_for_agent_id")]) if r[C("leads", "reserved_for_agent_id")] else None,
                "received_at": ts(r[C("leads", "received_at")]),
                "created_at": ts(r[C("leads", "created_at")]),
                "updated_at": ts(r[C("leads", "updated_at")]),
            })
        print(f"leads: {len(rows)}")
        push("m4u_leads", rows, "legacy_id")

    if phase in ("props", "all"):
        leads = fetch_all("/m4u_leads?select=id,legacy_id&order=id")
        lmap = {l["legacy_id"]: l["id"] for l in leads if l.get("legacy_id") is not None}
        print(f"lead map: {len(lmap)} entries")
        rows = []
        for r in d["lead_properties"]["rows"]:
            lid, pid = lmap.get(int(r[0])), pmap.get(int(r[1]))
            if lid and pid:
                rows.append({"lead_id": lid, "property_id": pid,
                             "added_while_locked": str(r[2]) == "1",
                             "added_at": ts(r[3])})
        print(f"lead_props: {len(rows)} (of {len(d['lead_properties']['rows'])})")
        push("m4u_lead_props", rows, "lead_id,property_id")

    print("\nDone.")


if __name__ == "__main__":
    main()
