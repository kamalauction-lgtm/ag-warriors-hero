# -*- coding: utf-8 -*-
"""Diagnose the M4U project request/approval loop.

Two reported symptoms:
  1. an admin is never shown that an agent requested a project
  2. a project the admin approved still reads "menunggu kelulusan" to the agent

Part A reads production (service key) and reports every pending request.
Part B proves, on DISPOSABLE accounts only, whether an admin's approval write
actually lands. No real grant is touched.

Usage:  SUPABASE_SECRET=... python tools/diag_m4u_grants.py
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://zlbyfgfublqlrsqohvsn.supabase.co")
SVC = os.environ.get("SUPABASE_SECRET")
ANON = os.environ.get("SUPABASE_ANON", "sb_publishable_fNAsKQFCXCDsjWJP-KnCRQ_ZYFRZQiv")
if not SVC:
    sys.exit("SUPABASE_SECRET is required")


def call(path, method="GET", body=None, headers=None, base="/rest/v1"):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-diag/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}


def g(path):
    s, d = call(path, headers=svc)
    if s != 200:
        sys.exit(f"QUERY FAILED {path}\n  HTTP {s}: {d}")
    return d


# ---------------------------------------------------------------- PART A
print("=" * 70)
print("A. PRODUCTION STATE — who is waiting, and for what")
print("=" * 70)

grants = g("/m4u_grants?select=agent_id,property_id,approved,active,requested_at")
props = {p["id"]: p for p in g("/m4u_properties?select=id,name,country,type")}
people = {p["id"]: p for p in g("/profiles?select=id,name,email,country,role,status")}

pending = [x for x in grants if not x["approved"]]
approved = [x for x in grants if x["approved"]]
print(f"m4u_grants rows: {len(grants)}   approved: {len(approved)}   PENDING: {len(pending)}")

if pending:
    print("\nPENDING REQUESTS (what the admin was never shown):")
    for x in sorted(pending, key=lambda r: r.get("requested_at") or ""):
        who = people.get(x["agent_id"], {})
        pr = props.get(x["property_id"], {})
        print(f"  · {who.get('name','?'):24s} [{who.get('country','?')} {who.get('status','?')}] "
              f"-> {pr.get('name','?'):22s}  requested {x.get('requested_at') or '(no timestamp)'}")

# is any pending request older than a day? that is the visibility failure, measured
now = datetime.datetime.now(datetime.UTC)
stale = []
for x in pending:
    ts = x.get("requested_at")
    if ts:
        age = now - datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        stale.append((people.get(x["agent_id"], {}).get("name", "?"),
                      props.get(x["property_id"], {}).get("name", "?"), age.days, age.seconds // 3600))
if stale:
    print("\nHOW LONG THEY HAVE BEEN WAITING:")
    for n, p, d, h in sorted(stale, key=lambda r: -r[2]):
        print(f"  · {n:24s} {p:22s} {d}d {h}h")

# ---------------------------------------------------------------- PART B
print()
print("=" * 70)
print("B. LIVE WRITE TEST — does an admin's approval actually persist?")
print("   (disposable accounts only; no real grant is touched)")
print("=" * 70)

TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
made = []


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Diag#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    made.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Diag#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


try:
    # a real MY project, so the country checks behave exactly as in production
    my_props = [p for p in props.values() if p["country"] == "MY"]
    prop = my_props[0]
    print(f"  using project: {prop['name']} ({prop['country']})")

    adm_id, adm_tok = mkuser(f"diag-adm-{TAG}@agtest.local", "Diag Admin", "MY", "master_admin")
    agt_id, agt_tok = mkuser(f"diag-agt-{TAG}@agtest.local", "Diag Agent", "MY", "agent")
    adm, agt = as_user(adm_tok), as_user(agt_tok)

    # 1. the agent self-requests, exactly as the Caller UI does
    s, r = call("/m4u_grants", "POST",
                {"agent_id": agt_id, "property_id": prop["id"], "approved": False,
                 "active": True, "requested_at": now.isoformat()},
                {**agt, "Prefer": "return=representation"})
    print(f"\n  1. agent self-request .................... HTTP {s}  {'OK' if s < 300 else r}")

    # 2. can the admin even SEE it?
    s, seen = call(f"/m4u_grants?agent_id=eq.{agt_id}&select=agent_id,property_id,approved", headers=adm)
    print(f"  2. admin can read the request ........... HTTP {s}  rows={len(seen) if isinstance(seen, list) else seen}")

    # 3. THE APPROVAL. return=representation tells us how many rows really changed.
    s, upd = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{prop['id']}", "PATCH",
                  {"approved": True}, {**adm, "Prefer": "return=representation"})
    n = len(upd) if isinstance(upd, list) else -1
    print(f"  3. admin PATCH approved=true ............ HTTP {s}  rows_changed={n}")
    if s < 300 and n == 0:
        print("     >>> SILENT NO-OP: PostgREST returns success having changed nothing.")
        print("     >>> The UI shows 'Access approved' and the database is unchanged.")

    # 4. the ground truth, read with the service key (bypasses RLS)
    s, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&select=approved,active", headers=svc)
    print(f"  4. truth after approval ................. {truth}")

    # 5. the other admin path: approving where NO request exists yet (insert)
    s, ins = call("/m4u_grants", "POST",
                  {"agent_id": agt_id, "property_id": my_props[1]["id"] if len(my_props) > 1 else prop["id"],
                   "approved": True, "active": True},
                  {**adm, "Prefer": "return=representation"})
    print(f"  5. admin INSERT approved=true ........... HTTP {s}  {'OK' if s < 300 else str(ins)[:120]}")

    # 6. and what the agent's own dashboard would now show
    s, mine = call(f"/m4u_grants?select=property_id,approved,active", headers=agt)
    print(f"  6. agent's Projects tab sees ............ {mine}")

finally:
    print("\n  cleaning up disposable accounts…")
    for uid in made:
        call(f"/m4u_grants?agent_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")
    s, left = call("/profiles?email=like.*agtest.local*&select=email", headers=svc)
    print(f"  residue: {left}")
