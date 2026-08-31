# -*- coding: utf-8 -*-
"""Tests for the M4U project request/approval loop (migration 092).

Covers the three defects 092 repairs:
  1. an admin's approval silently changed nothing
  2. an admin could not grant access to an agent who had not asked
  3. an agent could approve their own access through the REST API

Disposable accounts only. Real grants are counted before and after and must be
identical at the end.

Usage:  SUPABASE_SECRET=... python tools/test_m4u_grants.py
Requires 092 to have been applied.
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://zlbyfgfublqlrsqohvsn.supabase.co")
SVC = os.environ.get("SUPABASE_SECRET")
ANON = os.environ.get("SUPABASE_ANON", "sb_publishable_fNAsKQFCXCDsjWJP-KnCRQ_ZYFRZQiv")
if not SVC:
    sys.exit("SUPABASE_SECRET is required")

PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1", _try=0):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-m4u-test/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]
    except urllib.error.URLError:
        if _try < 3:
            time.sleep(1.5 * (_try + 1))
            return call(path, method, body, headers, base, _try + 1)
        raise


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    check(name + "  (expected-denied)", isinstance(status, int) and status >= 400, f"HTTP {status} {detail}")


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
made = []


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "M4U#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    made.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "M4U#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


s, before = call("/m4u_grants?select=agent_id", headers=svc)
REAL_BEFORE = len(before)
s, pend_before = call("/m4u_grants?approved=is.false&select=agent_id", headers=svc)
PEND_BEFORE = len(pend_before)
print(f"\nproduction before: {REAL_BEFORE} grants, {PEND_BEFORE} pending")

try:
    s, my_props = call("/m4u_properties?country=eq.MY&select=id,name&order=id&limit=2", headers=svc)
    s, id_props = call("/m4u_properties?country=eq.ID&select=id,name&order=id&limit=1", headers=svc)
    MY_A, MY_B, ID_A = my_props[0]["id"], my_props[1]["id"], id_props[0]["id"]

    print("\n=== setup ===")
    adm_id, adm_tok = mkuser(f"m4u-adm-{TAG}@agtest.local", "M4U Master", "MY", "master_admin")
    cadm_id, cadm_tok = mkuser(f"m4u-cadm-{TAG}@agtest.local", "M4U ID Admin", "ID", "country_admin")
    agt_id, agt_tok = mkuser(f"m4u-agt-{TAG}@agtest.local", "M4U Agent", "MY", "agent")
    oth_id, oth_tok = mkuser(f"m4u-oth-{TAG}@agtest.local", "M4U Other", "MY", "agent")
    adm, cadm, agt, oth = as_user(adm_tok), as_user(cadm_tok), as_user(agt_tok), as_user(oth_tok)
    print("  4 disposable accounts created")

    # ---------------------------------------------------------------- privileges
    print("\n=== defect 3: the client can no longer write m4u_grants ===")
    s, _ = call("/m4u_grants", "POST",
                {"agent_id": agt_id, "property_id": MY_A, "approved": True, "active": True}, agt)
    denied("agent cannot INSERT a grant directly", s)
    s, _ = call("/m4u_grants", "POST",
                {"agent_id": agt_id, "property_id": MY_A, "approved": False, "active": True}, agt)
    denied("agent cannot INSERT even an unapproved grant directly", s)

    # ---------------------------------------------------------------- request
    print("\n=== agent requests a project ===")
    s, r = rpc("fn_m4u_request_project", {"p_property": MY_A}, agt)
    check("request succeeds through the RPC", isinstance(r, dict) and r.get("ok") and not r.get("already"), str(r)[:120])
    s, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&select=approved,active,requested_at", headers=svc)
    check("the row is pending, not approved", truth and truth[0]["approved"] is False, str(truth))
    check("requested_at is stamped", truth and truth[0]["requested_at"], str(truth))

    s, r2 = rpc("fn_m4u_request_project", {"p_property": MY_A}, agt)
    check("asking twice is idempotent, not an error", isinstance(r2, dict) and r2.get("already") is True, str(r2)[:120])

    s, r3 = rpc("fn_m4u_request_project", {"p_property": ID_A}, agt)
    denied("a MY agent cannot request an ID project", s)

    print("\n=== defect 3 continued: self-approval ===")
    s, upd = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{MY_A}", "PATCH",
                  {"approved": True}, {**agt, "Prefer": "return=representation"})
    s2, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&select=approved", headers=svc)
    check("agent PATCH of approved is refused AND does not persist",
          (isinstance(s, int) and s >= 400) and truth and truth[0]["approved"] is False,
          f"HTTP {s}, truth {truth}")

    # ---------------------------------------------------------------- the queue
    print("\n=== defect 1: the request is now visible to an admin ===")
    s, q = rpc("fn_m4u_pending_requests", {}, adm)
    mine = [x for x in (q or []) if x["agent_id"] == agt_id] if isinstance(q, list) else []
    check("the pending queue lists the request", len(mine) == 1, str(q)[:200])
    check("the queue names the agent and the project",
          mine and mine[0]["agent_name"] == "M4U Agent" and mine[0]["property_id"] == MY_A, str(mine)[:180])
    check("the queue reports how long they have waited",
          mine and mine[0]["waiting_hours"] is not None, str(mine)[:180])

    s, _ = rpc("fn_m4u_pending_requests", {}, agt)
    denied("a plain agent cannot read the approval queue", s)

    s, qc = rpc("fn_m4u_pending_requests", {}, cadm)
    check("an ID country admin does not see the MY request",
          isinstance(qc, list) and not any(x["agent_id"] == agt_id for x in qc), str(qc)[:160])

    # ---------------------------------------------------------------- approval
    print("\n=== defect 1: approval actually persists ===")
    s, r = rpc("fn_m4u_set_project_access",
               {"p_agent": agt_id, "p_property": MY_A, "p_approved": True, "p_reason": None}, adm)
    check("admin approve returns ok", isinstance(r, dict) and r.get("approved") is True, str(r)[:140])
    s, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{MY_A}"
                    "&select=approved,approved_at,approved_by", headers=svc)
    check("the database now says approved", truth and truth[0]["approved"] is True, str(truth))
    check("who approved it, and when, is recorded",
          truth and truth[0]["approved_by"] == adm_id and truth[0]["approved_at"], str(truth))

    s, seen = call(f"/m4u_grants?select=property_id,approved,declined_at", headers=agt)
    check("the agent's own Projects tab now reads approved",
          any(x["property_id"] == MY_A and x["approved"] for x in seen), str(seen))

    s, notes = call(f"/m4u_notes?target_agent_id=eq.{agt_id}&select=body,bucket_label", headers=svc)
    check("the agent was told, in a message thread",
          notes and any(n["bucket_label"] == "project_access" for n in notes), str(notes)[:160])

    s, q = rpc("fn_m4u_pending_requests", {}, adm)
    check("the request leaves the queue once decided",
          isinstance(q, list) and not any(x["agent_id"] == agt_id for x in q), str(q)[:140])

    # ---------------------------------------------------------------- toggle
    print("\n=== agent controls only `active` ===")
    s, r = rpc("fn_m4u_toggle_project", {"p_property": MY_A, "p_active": False}, agt)
    s2, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{MY_A}&select=approved,active", headers=svc)
    check("agent can turn an approved project off",
          truth and truth[0]["active"] is False and truth[0]["approved"] is True, str(truth))
    rpc("fn_m4u_toggle_project", {"p_property": MY_A, "p_active": True}, agt)

    s, _ = rpc("fn_m4u_toggle_project", {"p_property": MY_B, "p_active": True}, agt)
    denied("agent cannot toggle a project they were never granted", s)

    rpc("fn_m4u_request_project", {"p_property": MY_B}, agt)
    s, _ = rpc("fn_m4u_toggle_project", {"p_property": MY_B, "p_active": True}, agt)
    denied("agent cannot turn on a project still awaiting approval", s)

    # ---------------------------------------------------------------- defect 2
    print("\n=== defect 2: admin may grant without a prior request ===")
    s, r = rpc("fn_m4u_set_project_access",
               {"p_agent": oth_id, "p_property": MY_A, "p_approved": True, "p_reason": "direct assignment"}, adm)
    s2, truth = call(f"/m4u_grants?agent_id=eq.{oth_id}&select=approved", headers=svc)
    check("admin can grant a project nobody requested",
          isinstance(r, dict) and r.get("ok") and truth and truth[0]["approved"] is True, f"{r} / {truth}")

    # ---------------------------------------------------------------- scope
    print("\n=== authority scope ===")
    s, _ = rpc("fn_m4u_set_project_access",
               {"p_agent": agt_id, "p_property": MY_B, "p_approved": True, "p_reason": None}, agt)
    denied("an agent cannot approve anyone, including themselves", s)

    s, _ = rpc("fn_m4u_set_project_access",
               {"p_agent": agt_id, "p_property": MY_A, "p_approved": True, "p_reason": None}, cadm)
    denied("an ID country admin cannot decide a MY agent's access", s)

    s, _ = rpc("fn_m4u_set_project_access",
               {"p_agent": agt_id, "p_property": ID_A, "p_approved": True, "p_reason": None}, adm)
    denied("even a master admin cannot cross a MY agent with an ID project", s)

    # ---------------------------------------------------------------- decline
    print("\n=== decline and ask again ===")
    s, r = rpc("fn_m4u_decline_request",
               {"p_agent": agt_id, "p_property": MY_B, "p_reason": "finish the current project first"}, adm)
    check("admin can decline with a reason", isinstance(r, dict) and r.get("declined"), str(r)[:140])
    s, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{MY_B}"
                    "&select=declined_at,decline_reason,approved", headers=svc)
    check("the decline is recorded, the row is not deleted",
          truth and truth[0]["declined_at"] and truth[0]["decline_reason"], str(truth))
    s, notes = call(f"/m4u_notes?target_agent_id=eq.{agt_id}&bucket_label=eq.project_access&select=body", headers=svc)
    check("the agent was told why",
          any("finish the current project first" in (n["body"] or "") for n in notes), str(notes)[:200])
    s, q = rpc("fn_m4u_pending_requests", {}, adm)
    check("a declined request is not left sitting in the queue",
          isinstance(q, list) and not any(x["agent_id"] == agt_id and x["property_id"] == MY_B for x in q), str(q)[:140])

    s, r = rpc("fn_m4u_reopen_request", {"p_property": MY_B}, agt)
    check("the agent may ask again", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    s, q = rpc("fn_m4u_pending_requests", {}, adm)
    check("asking again puts it back in front of the admin",
          isinstance(q, list) and any(x["agent_id"] == agt_id and x["property_id"] == MY_B for x in q), str(q)[:160])

    # ---------------------------------------------------------------- removal
    print("\n=== removing access ===")
    rpc("fn_m4u_set_project_access",
        {"p_agent": agt_id, "p_property": MY_A, "p_approved": False, "p_reason": "moved to another team"}, adm)
    s, truth = call(f"/m4u_grants?agent_id=eq.{agt_id}&property_id=eq.{MY_A}&select=approved", headers=svc)
    check("removal persists too", truth and truth[0]["approved"] is False, str(truth))

    # ---------------------------------------------------------------- audit
    print("\n=== audit trail ===")
    s, au = call(f"/audit_events?entity_type=eq.m4u_grant&select=action,entity_id"
                 f"&entity_id=like.{agt_id}*&order=at.desc&limit=20", headers=svc)
    actions = [a["action"] for a in au] if isinstance(au, list) else []
    for want in ("m4u_project_requested", "m4u_access_approved", "m4u_access_declined", "m4u_access_removed"):
        check(f"audit records {want}", want in actions, str(actions))

finally:
    print("\n=== teardown ===")
    for uid in made:
        call(f"/m4u_notes?target_agent_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/m4u_notes?author_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/m4u_grants?agent_id=eq.{uid}", "DELETE", headers=svc)
    for uid in made:
        call(f"/audit_events?entity_id=like.{uid}*", "DELETE", headers=svc)
        call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in made:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")

    s, after = call("/m4u_grants?select=agent_id", headers=svc)
    s, pend_after = call("/m4u_grants?approved=is.false&select=agent_id", headers=svc)
    check(f"real grants untouched ({REAL_BEFORE} before, {len(after)} after)", len(after) == REAL_BEFORE)
    check(f"real pending requests untouched ({PEND_BEFORE} before, {len(pend_after)} after)",
          len(pend_after) == PEND_BEFORE)
    s, left = call("/profiles?email=like.*m4u-*agtest.local*&select=email", headers=svc)
    check("no disposable profile residue", left == [], str(left))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
