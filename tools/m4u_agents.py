"""Migrate the 50 Bluehost caller agents into Supabase Auth + profiles,
then backfill everything that referenced them (leads, attempts, grants).

Passwords carry over: PHP bcrypt ($2y$) hashes are imported as-is via the
Auth admin API — verified working, so agents sign in with what they already use.

Agent #1 is Kamal, who ALREADY has a profile: he is mapped to his existing
uuid, never duplicated.

Usage: SUPABASE_SECRET=... python tools/m4u_agents.py "<dump.sql>" [--dry]
"""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from m4u_parse import parse  # noqa: E402
from m4u_load import fetch_all, req, ts  # noqa: E402

BASE = "https://zlbyfgfublqlrsqohvsn.supabase.co"
SECRET = os.environ.get("SUPABASE_SECRET")
DRY = "--dry" in sys.argv

ROLE_MAP = {"admin": "country_admin", "caller": "agent", "lead": "agent"}


def auth_req(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(f"{BASE}/auth/v1{path}", data=data, method=method)
    r.add_header("apikey", SECRET)
    r.add_header("Authorization", f"Bearer {SECRET}")
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def norm_phone(raw, team, legacy_id):
    """profiles.phone is NOT NULL and unique — synthesise a flagged placeholder
    for the two agents whose phone is blank rather than dropping them."""
    cc = "62" if team == "ID" else "60"
    d = "".join(ch for ch in (raw or "") if ch.isdigit() or ch == "+")
    if d.startswith("+"):
        return d
    if d.startswith("00"):
        return "+" + d[2:]
    if d.startswith(("60", "62")):
        return "+" + d
    if d.startswith("0"):
        return "+" + cc + d[1:]
    if d:
        return "+" + cc + d
    return f"+000000{legacy_id:04d}"          # obviously invalid, unique, fixable


def main():
    if not SECRET:
        sys.exit("SUPABASE_SECRET not set")
    d = parse(sys.argv[1])
    C = lambda t, n: d[t]["cols"].index(n)   # noqa: E731

    # existing auth users by email
    _, page = auth_req("GET", "/admin/users?page=1&per_page=1000")
    existing = {u["email"].lower(): u["id"] for u in (page or {}).get("users", []) if u.get("email")}
    print(f"existing auth users: {len(existing)}")

    amap = {}          # legacy agent id -> profile uuid
    created = skipped = failed = 0

    for r in d["agents"]["rows"]:
        lid = int(r[0])
        email = (r[C("agents", "email")] or "").strip().lower()
        name = r[C("agents", "name")] or email
        team = r[C("agents", "team")] or "MY"
        status = r[C("agents", "status")] or "pending"
        role = ROLE_MAP.get(r[C("agents", "role")] or "caller", "agent")
        pw = r[C("agents", "password_hash")]
        phone = norm_phone(r[C("agents", "phone")], team, lid)

        if email in existing:                 # Kamal, and any re-run
            amap[lid] = existing[email]
            skipped += 1
            continue
        if DRY:
            print(f"  would create {email} ({team}/{role}/{status})")
            continue

        code, res = auth_req("POST", "/admin/users", {
            "email": email, "password_hash": pw, "email_confirm": True,
            "user_metadata": {"name": name, "m4u_legacy_id": lid},
        })
        if code >= 300 or not isinstance(res, dict):
            print(f"  FAIL auth {email}: {code} {res}")
            failed += 1
            continue
        uid = res["id"]

        code, body = req("POST", "/profiles?on_conflict=id", [{
            "id": uid, "name": name, "phone": phone, "email": email,
            "country": team, "role": role, "status": status, "onboarded": True,
        }], prefer="resolution=merge-duplicates,return=minimal")
        if code >= 300:
            print(f"  FAIL profile {email}: {code} {body}")
            failed += 1
            continue
        amap[lid] = uid
        existing[email] = uid
        created += 1

    print(f"\nagents -> created {created}, already existed {skipped}, failed {failed}")
    if DRY:
        return
    print(f"map covers {len(amap)}/{len(d['agents']['rows'])} legacy agents")

    # ---- backfill lead ownership / reservations ----
    leads = fetch_all("/m4u_leads?select=id,legacy_id,legacy_owner,legacy_reserved&order=id")
    lmap = {l["legacy_id"]: l["id"] for l in leads if l.get("legacy_id") is not None}
    patch = []
    for l in leads:
        upd = {}
        if l.get("legacy_owner") and amap.get(l["legacy_owner"]):
            upd["owner_agent_id"] = amap[l["legacy_owner"]]
        if l.get("legacy_reserved") and amap.get(l["legacy_reserved"]):
            upd["reserved_for"] = amap[l["legacy_reserved"]]
        if upd:
            patch.append((l["id"], upd))
    print(f"leads needing agent backfill: {len(patch)}")
    for lead_id, upd in patch:
        code, body = req("PATCH", f"/m4u_leads?id=eq.{lead_id}", upd, prefer="return=minimal")
        if code >= 300:
            print(f"  FAIL lead {lead_id}: {code} {body}")

    # ---- call history ----
    rows = []
    for r in d["call_attempts"]["rows"]:
        lid, aid = lmap.get(int(r[C("call_attempts", "lead_id")])), amap.get(int(r[C("call_attempts", "agent_id")]))
        if lid and aid:
            rows.append({
                "lead_id": lid, "agent_id": aid,
                "disposition": r[C("call_attempts", "disposition")],
                "note": r[C("call_attempts", "note")],
                "attempt_no": int(r[C("call_attempts", "attempt_no")] or 0),
                "called_at": ts(r[C("call_attempts", "called_at")]),
            })
    # m4u_attempts has no natural unique key, so a naive re-run would DOUBLE the
    # history. Only load when the table is empty; otherwise say so and skip.
    have = fetch_all("/m4u_attempts?select=id&limit=1")
    if have:
        print(f"call attempts: {len(have)}+ already present — skipping "
              f"(delete them first if you want a clean reload)")
        rows = []
    print(f"call attempts to load: {len(rows)} of {len(d['call_attempts']['rows'])}")
    for i in range(0, len(rows), 500):
        code, body = req("POST", "/m4u_attempts", rows[i:i + 500], prefer="return=minimal")
        print(f"  .. attempts {min(i+500, len(rows))}/{len(rows)}" if code < 300 else f"  FAIL {code} {body}")

    # ---- project grants ----
    props = fetch_all("/m4u_properties?select=id,legacy_id")
    pmap = {p["legacy_id"]: p["id"] for p in props if p.get("legacy_id") is not None}
    grants = []
    for r in d["agent_property"]["rows"]:
        aid, pid = amap.get(int(r[0])), pmap.get(int(r[1]))
        if aid and pid:
            grants.append({"agent_id": aid, "property_id": pid,
                           "approved": str(r[2]) == "1", "active": str(r[3]) == "1"})
    print(f"grants: {len(grants)}")
    code, body = req("POST", "/m4u_grants?on_conflict=agent_id,property_id", grants,
                     prefer="resolution=merge-duplicates,return=minimal")
    print("  grants loaded" if code < 300 else f"  FAIL {code} {body}")
    print("\nDone.")


if __name__ == "__main__":
    main()
