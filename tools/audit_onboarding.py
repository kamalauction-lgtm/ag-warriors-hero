# -*- coding: utf-8 -*-
"""Read-only production audit of the three onboarding layers.

Every request FAILS LOUDLY. An earlier version of this audit swallowed HTTP errors
and rendered them as empty results, which is how "0 enrolments" and "0 Grow rows"
were both reported wrongly. Never let a read helper turn an error into an empty
result.

Usage:  SUPABASE_SECRET=... python tools/audit_onboarding.py
"""
import collections
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://zlbyfgfublqlrsqohvsn.supabase.co")
SVC = os.environ.get("SUPABASE_SECRET")
if not SVC:
    sys.exit("SUPABASE_SECRET is required")
H = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}


def g(path):
    """Raises on any non-200. Silence is never mistaken for emptiness."""
    req = urllib.request.Request(URL + "/rest/v1" + path, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"QUERY FAILED {path}\n  HTTP {e.code}: {e.read().decode()[:250]}")


profiles = g("/profiles?select=id,name,email,country,role,status,onboarded,created_at,language_source")
print(f"TOTAL PROFILES: {len(profiles)}")
print("  onboarded:", dict(collections.Counter(
    "true" if p["onboarded"] else "false" for p in profiles)))
print("  status   :", dict(collections.Counter(p["status"] for p in profiles)))
print("  country  :", dict(collections.Counter(p["country"] for p in profiles)))
print("  created  :", dict(collections.Counter(p["created_at"][:10] for p in profiles)))

print("\nLAYER 1 — GLOBAL APP ONBOARDING (profiles.onboarded)")
not_onb = [p for p in profiles if not p["onboarded"]]
print(f"  not onboarded: {len(not_onb)}")
for p in not_onb:
    print(f"    - {p['name']} | {p['status']} | {p['email']}")
print(f"  ACTIVE and not onboarded: {sum(1 for p in not_onb if p['status'] == 'active')}")

print("\nLAYER 2 — GROW ONBOARDING (onb_progress.agent_id)")
grow = g("/onb_progress?select=agent_id,lesson_id,status")
gagents = {r["agent_id"] for r in grow}
print(f"  progress rows: {len(grow)} across {len(gagents)} distinct agents")
print("  by status   :", dict(collections.Counter(r["status"] for r in grow)))
gdone = {a for a in gagents
         if all(r["status"] == "completed" for r in grow if r["agent_id"] == a)}
print(f"  agents with every started lesson completed: {len(gdone)}")

print("\nLAYER 3 — 30 DAYS READINESS / ACTIVATION")
enr = g("/enrolments?select=participant_id,status")
print(f"  enrolments: {len(enr)} ", dict(collections.Counter(e["status"] for e in enr)))
rd = g("/readiness_submissions?select=enrolment_id,status")
print(f"  readiness submissions: {len(rd)} ", dict(collections.Counter(r["status"] for r in rd)))

print("\nCROSS-LAYER: do the layers actually disagree for anyone?")
byid = {p["id"]: p for p in profiles}
enrolled = {e["participant_id"] for e in enr}
rows = []
for uid in sorted(gagents | enrolled):
    p = byid.get(uid)
    if not p:
        continue
    rows.append((p["name"], p["onboarded"], uid in gagents, uid in enrolled))
for name, o, grw, en in rows:
    print(f"    {name:28s} global={str(o):5s} grow={str(grw):5s} 30days={str(en):5s}")
if not rows:
    print("    (nobody has Grow progress or a 30 Days enrolment)")

print("\nREAL PRODUCTION ACTIVITY (migration safety signal only)")
sig = {}
for label, path, key in (
    ("ch_leads", "/ch_leads?select=participant_id", "participant_id"),
    ("time_tasks", "/time_tasks?select=user_id&limit=5000", "user_id"),
    ("m4u_attempts", "/m4u_attempts?select=agent_id&limit=5000", "agent_id"),
):
    ids = {r[key] for r in g(path)}
    sig[label] = ids
    print(f"  {label:14s} {len(ids)} distinct users")
active = set().union(*sig.values()) | gagents | enrolled
print(f"  ANY activity: {len(active)} distinct users")
gated_with_activity = [byid[u]["name"] for u in active
                       if u in byid and not byid[u]["onboarded"]]
print(f"\nWOULD BE GATED **AND** HAS ACTIVITY: {len(gated_with_activity)} {gated_with_activity}")
