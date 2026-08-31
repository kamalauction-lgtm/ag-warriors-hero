# -*- coding: utf-8 -*-
"""Migrate ren PWA agents into Hero so they NEVER have to register again.

Kamal's rule for the ren retirement (28 Aug 2026): modules are compared and the
better version kept — the ONLY data that must move is the agents themselves,
with working logins.

HOW LOGINS SURVIVE: ren stored PHP bcrypt hashes ($2y$...). Supabase GoTrue's
admin API accepts a bcrypt `password_hash` at user creation, so each migrated
agent signs into Hero with the SAME email + SAME password they used on ren.
No reset, no re-register. (This only works at CREATE time — an agent whose
email already exists in Hero keeps their Hero credentials and is skipped.)

Matching: an agent already in Hero by email OR by phone (last 9 digits) is
skipped — no duplicates. Agents with no email cannot have a Supabase login and
are reported for manual handling, never silently dropped.

What carries over per agent: name, email, phone, careerRank (only onto a Hero
profile field that is empty — never downgrading a rank Hero already assigned),
language 'bm' with language_source 'explicit' is NOT set — country default BM
applies naturally (056 rule).

Usage:
  python tools/migrate_ren_agents.py --dry            # report only
  SUPABASE_SECRET=... python tools/migrate_ren_agents.py --agents path/to/agents.json
Default agents file: ../ren-warriors/data/agents.json (the local copy).
RUN AGAIN on the fresh cPanel backup before hosting deletion — the local copy
may be behind the server.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://zlbyfgfublqlrsqohvsn.supabase.co")
SVC = os.environ.get("SUPABASE_SECRET")

ap = argparse.ArgumentParser()
ap.add_argument("--agents", default=os.path.join(os.path.dirname(__file__), "..", "..", "ren-warriors", "data", "agents.json"))
ap.add_argument("--dry", action="store_true")
args = ap.parse_args()
if not SVC and not args.dry:
    sys.exit("SUPABASE_SECRET is required (or use --dry)")

H = {"apikey": SVC or "x", "Authorization": f"Bearer {SVC}", "Content-Type": "application/json",
     "User-Agent": "ren-migrate/1.0"}


def req(path, method="GET", body=None, base="/rest/v1"):
    r = urllib.request.Request(URL + base + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None, headers=H)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]


def digits9(p):
    d = "".join(c for c in (p or "") if c.isdigit())
    return d[-9:] if len(d) >= 9 else d


ren = json.load(open(args.agents, encoding="utf-8"))
if not isinstance(ren, list):
    sys.exit(f"unexpected agents.json shape: {type(ren)}")
print(f"ren agents in file: {len(ren)}")

s, hero = req("/profiles?select=id,email,phone,career_rank&limit=2000")
if s != 200:
    sys.exit(f"could not read Hero profiles: {s} {hero}")
by_email = {(p["email"] or "").lower(): p for p in hero if p.get("email")}
by_phone = {digits9(p.get("phone")): p for p in hero if digits9(p.get("phone"))}

migrated, skipped, manual, failed = [], [], [], []
for a in ren:
    name = (a.get("name") or "").strip()
    email = (a.get("email") or "").strip().lower()
    phone = (a.get("phone") or "").strip()
    rank = a.get("careerRank") or None
    pw = a.get("passHash")

    if name.upper() == "TEST":
        skipped.append((name, "test account — not migrated"))
        continue
    hit = by_email.get(email) if email else None
    hit = hit or (by_phone.get(digits9(phone)) if digits9(phone) else None)
    if hit:
        # already in Hero — the only thing worth carrying is a rank Hero lacks
        if rank and not hit.get("career_rank") and not args.dry:
            req(f"/profiles?id=eq.{hit['id']}", "PATCH", {"career_rank": rank})
        skipped.append((name, "already in Hero"))
        continue
    if not email:
        manual.append((name, phone, "no email — Supabase login needs one; collect it, then re-run"))
        continue
    if not (pw or "").startswith(("$2y$", "$2a$", "$2b$")):
        manual.append((name, email, "no usable bcrypt hash — will need Forgot Password"))
        continue

    if args.dry:
        migrated.append((name, email, "WOULD migrate with original password"))
        continue

    # bcrypt hash import: same password as ren, email pre-confirmed
    code, res = req("/admin/users", "POST", {
        "email": email, "password_hash": pw, "email_confirm": True,
        "user_metadata": {"name": name, "migrated_from": "ren.iqiaggroup.com"},
    }, base="/auth/v1")
    if code >= 300 or not isinstance(res, dict):
        failed.append((name, email, f"auth {code}: {res}"))
        continue
    uid = res["id"]
    code, body = req("/profiles", "POST", {
        "id": uid, "name": name, "email": email,
        "phone": phone or f"+600000{len(migrated):04d}",
        "country": "MY", "role": "agent", "status": "active",
        "onboarded": True,                      # existing working agents, like the 3 Aug import
        "career_rank": rank or "REN",
    })
    if code >= 300:
        failed.append((name, email, f"profile {code}: {body}"))
        req(f"/admin/users/{uid}", "DELETE", base="/auth/v1")   # no half-migrated ghosts
        continue
    migrated.append((name, email, f"rank {rank or 'REN'} · old password works"))

print(f"\nMIGRATED ({len(migrated)}):")
for n, e, note in migrated:
    print(f"  + {n:32s} {e:34s} {note}")
print(f"\nSKIPPED ({len(skipped)}):")
for n, why in skipped:
    print(f"  = {n:32s} {why}")
print(f"\nNEEDS MANUAL HANDLING ({len(manual)}):")
for row in manual:
    print("  ! " + " · ".join(str(x) for x in row))
if failed:
    print(f"\nFAILED ({len(failed)}):")
    for n, e, why in failed:
        print(f"  x {n} {e}: {why}")
    sys.exit(1)
