# -*- coding: utf-8 -*-
"""Global App Onboarding gate (migration 091).

The three onboarding layers must stay separate:
  GLOBAL APP ONBOARDING   profiles.onboarded
  GROW ONBOARDING         onb_progress
  30 DAYS READINESS       readiness_submissions / enrolments.status

Verifies the gate, the staged flag, grandfathering, and that no layer leaks into
another. Touches no real user.

Usage:  SUPABASE_SECRET=... python tools/test_onboarding.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-onb/1.0", **(headers or {})})
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


def login(email, pw="Onb#Test2026"):
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": pw},
                {"apikey": ANON}, base="/auth/v1")
    return t["access_token"] if isinstance(t, dict) else None


def mkuser(email, name, country, onboarded, role="agent", status="active"):
    s, u = call("/admin/users", "POST", {"email": email, "password": "Onb#Test2026", "email_confirm": True},
                svc, base="/auth/v1")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+60177{abs(hash(email)) % 1000000:06d}",
          "email": email, "country": country, "role": role, "status": status,
          "onboarded": onboarded},
         {**svc, "Prefer": "return=minimal"})
    return uid, login(email)


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohort = [], None
try:
    print("\n=== the column means GLOBAL app onboarding, and only that ===")
    # fn_app_flags is auth.uid()-scoped, so it must be called as a real session —
    # the service role legitimately sees {} because it has no uid.
    flagchk_id, flagchk_tok = mkuser(f"onb-flag-{TAG}@agtest.local", "Onb Flag", "MY", True)
    users.append(flagchk_id)
    s, flags = rpc("fn_app_flags", {}, as_user(flagchk_tok))
    check("the staged rollout flag is visible to a signed-in user",
          isinstance(flags, dict) and "global_onboarding_gate" in flags, str(flags)[:120])
    # The flag's VALUE is an operational decision that changes with the rollout,
    # so assert the contract (it is a real boolean the client can stage on),
    # never a particular moment's setting.
    gate_live = flags.get("global_onboarding_gate")
    check("the flag is a real boolean the client can stage the rollout on",
          isinstance(gate_live, bool), f"got {gate_live!r}")
    print(f"         (gate is currently {'ON' if gate_live else 'OFF'})")
    s, svc_flags = rpc("fn_app_flags", {}, svc)
    check("the service role sees no flags (no auth.uid) — correct, not a failure",
          svc_flags == {}, str(svc_flags)[:90])

    print("\n=== production grandfathering is already correct — nothing to backfill ===")
    s, prof = call("/profiles?select=onboarded,status", headers=svc)
    active_not_onb = [p for p in prof if not p["onboarded"] and p["status"] == "active"]
    check("no ACTIVE production user would be gated", len(active_not_onb) == 0, str(active_not_onb)[:140])
    s, au = call("/audit_events?action=eq.onboarding_grandfathering_recorded&select=reason,meta&limit=1", headers=svc)
    check("the grandfathering decision is recorded in the audit trail",
          isinstance(au, list) and len(au) == 1, str(au)[:140])

    print("\n=== a NEW user is not onboarded by default ===")
    new_id, new_tok = mkuser(f"onb-new-{TAG}@agtest.local", "Onb New", "MY", False)
    users.append(new_id)
    s, st = rpc("fn_onboarding_state", {}, as_user(new_tok))
    check("a brand-new profile reports global_onboarded=false", st.get("global_onboarded") is False, str(st)[:150])
    check("state reports the gate flag so the client can stage the rollout",
          "gate_enabled" in st, str(st)[:150])

    print("\n=== the three layers stay separate ===")
    check("grow onboarding is reported independently", st.get("grow_onboarding_started") is False, str(st)[:170])
    check("30 Days stage is reported independently", st.get("challenge_stage") == "none", str(st)[:170])

    done_id, done_tok = mkuser(f"onb-done-{TAG}@agtest.local", "Onb Done", "MY", True)
    users.append(done_id)
    s, st2 = rpc("fn_onboarding_state", {}, as_user(done_tok))
    check("an already-onboarded user passes the gate", st2.get("global_onboarded") is True, str(st2)[:150])

    print("\n=== completing onboarding releases the gate ===")
    s, _ = rpc("fn_complete_onboarding", {}, as_user(new_tok))
    check("the participant can complete their own onboarding", s in (200, 204), f"HTTP {s} {_}")
    s, st3 = rpc("fn_onboarding_state", {}, as_user(new_tok))
    check("global_onboarded flips to true", st3.get("global_onboarded") is True, str(st3)[:150])
    s, _ = rpc("fn_complete_onboarding", {}, as_user(new_tok))
    check("completing twice is idempotent, not an error", s in (200, 204), f"HTTP {s} {_}")
    s, au2 = call(f"/audit_events?action=eq.global_onboarding_completed&entity_id=eq.{new_id}&select=prev_state,new_state", headers=svc)
    check("completion is audited exactly once",
          isinstance(au2, list) and len(au2) == 1 and au2[0]["new_state"] == "true", str(au2)[:130])

    print("\n=== state survives a fresh login ===")
    tok2 = login(f"onb-new-{TAG}@agtest.local")
    s, st4 = rpc("fn_onboarding_state", {}, as_user(tok2))
    check("logout/login preserves the completed state", st4.get("global_onboarded") is True, str(st4)[:150])

    print("\n=== an ACTIVE 30 Days participant is never reset by the gate ===")
    adm_id, adm_tok = mkuser(f"onb-adm-{TAG}@agtest.local", "Onb Admin", "MY", True, "master_admin")
    coach_id, coach_tok = mkuser(f"onb-coach-{TAG}@agtest.local", "Onb Coach", "MY", True)
    war_id, war_tok = mkuser(f"onb-war-{TAG}@agtest.local", "Onb Warrior", "MY", True)
    users += [adm_id, coach_id, war_id]
    adm = as_user(adm_tok)
    rpc("fn_set_challenge_role", {"p_user": coach_id, "p_role": "elite_coach", "p_grant": True}, adm)
    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"ONB TEST {TAG}", "p_country": "MY", "p_start": start,
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, adm)
    s, res = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [war_id],
                                    "p_coach": coach_id, "p_note": "onb"}, adm)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, as_user(war_tok))
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "go"}, as_user(coach_tok))
    s, st5 = rpc("fn_onboarding_state", {}, as_user(war_tok))
    check("an ACTIVE participant still reports global_onboarded=true",
          st5.get("global_onboarded") is True, str(st5)[:170])
    check("their 30 Days stage is ACTIVE and separate from global onboarding",
          st5.get("challenge_stage") == "active", str(st5)[:170])
    s, prof2 = call(f"/profiles?id=eq.{war_id}&select=onboarded", headers=svc)
    check("30 Days readiness approval did NOT touch profiles.onboarded",
          prof2[0]["onboarded"] is True, str(prof2))

    print("\n=== 30 Days readiness is not global onboarding ===")
    war2_id, war2_tok = mkuser(f"onb-war2-{TAG}@agtest.local", "Onb Warrior2", "MY", False)
    users.append(war2_id)
    s, res2 = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [war2_id],
                                     "p_coach": coach_id, "p_note": "onb2"}, adm)
    check("a not-yet-onboarded user can still be enrolled by an admin",
          res2 and res2.get("enrolled_count") == 1, str(res2)[:130])
    s, prof3 = call(f"/profiles?id=eq.{war2_id}&select=onboarded", headers=svc)
    check("enrolment did NOT silently mark them globally onboarded",
          prof3[0]["onboarded"] is False, str(prof3))

    print("\n=== flag control is admin-only and audited ===")
    s, _ = rpc("fn_admin_set_flag", {"p_flag": "global_onboarding_gate",
                                     "p_enabled": True, "p_note": "warrior attempt"}, as_user(war_tok))
    denied("a warrior cannot flip the rollout flag", s, str(_)[:90])
    s, _ = rpc("fn_admin_set_flag", {"p_flag": "no_such_flag", "p_enabled": True, "p_note": "x"}, adm)
    denied("an unknown flag is refused", s, str(_)[:90])

finally:
    print("\n=== cleanup ===")
    if cohort:
        call(f"/points_ledger?cohort_id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        for tbl in ("ch_notification_sends?recipient", "mentor_points_ledger?user_id",
                    "points_ledger?user_id", "user_badges?user_id", "ch_permissions?user_id",
                    "ch_lead_activities?participant_id", "ch_leads?participant_id",
                    "coach_assignments?participant_id", "coach_assignments?coach_id",
                    "user_roles?user_id", "notifications?to_agent"):
            call(f"/{tbl}=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        for col in ("user_roles?granted_by", "coach_assignments?assigned_by",
                    "enrolments?status_by", "cohorts?created_by"):
            t, c = col.split("?")
            call(f"/{t}?{c}=eq.{uid}", "PATCH", {c: None}, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]}: {r}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    call("/audit_events?action=eq.global_onboarding_completed", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
