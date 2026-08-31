# -*- coding: utf-8 -*-
"""Automated P0 policy/behaviour tests for the 30 Days Closing Challenge.

Runs against the LIVE project with throwaway accounts and a throwaway cohort,
then cleans everything up. Nothing pre-existing is touched: no existing cohort,
enrolment, submission, ledger row or audit row is read-modify-written.

Usage:  SUPABASE_SECRET=... python tools/test_challenge_p0.py
Requires migration 079_challenge_p0.sql to have been applied.

Every test asserts a security or correctness property named in
docs/AUDIT-30-DAYS-2026-08-23.md. A test that PASSES by getting an error is
marked "expected-denied" — those are the RLS/authorisation tests.
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
    sys.exit("SUPABASE_SECRET is required (never hardcode it)")

PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1"):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-p0-test/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}


def as_user(tok):
    return {"apikey": ANON, "Authorization": f"Bearer {tok}"}


def rpc(fn, args, hdr):
    return call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    """Passes only when the operation was actually refused."""
    ok = status in (401, 403, 404) or (isinstance(status, int) and status >= 400)
    check(name + "  (expected-denied)", ok, f"got HTTP {status} {detail}")


def mkuser(email, pw, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": pw, "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": pw},
                {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
made_users, made_cohort = [], None
try:
    print("\n=== setup ===")
    admin_id, admin_tok = mkuser(f"p0-admin-{TAG}@agtest.local", "P0#Test2026", "P0 Admin", "MY", "master_admin")
    coach_id, coach_tok = mkuser(f"p0-coach-{TAG}@agtest.local", "P0#Test2026", "P0 Coach", "MY", "agent")
    war_id,   war_tok   = mkuser(f"p0-war-{TAG}@agtest.local",   "P0#Test2026", "P0 Warrior", "MY", "agent")
    other_id, other_tok = mkuser(f"p0-other-{TAG}@agtest.local", "P0#Test2026", "P0 Outsider", "MY", "agent")
    made_users = [admin_id, coach_id, war_id, other_id]
    admin, coach, war, other = as_user(admin_tok), as_user(coach_tok), as_user(war_tok), as_user(other_tok)
    print(f"  users: admin={admin_id[:8]} coach={coach_id[:8]} warrior={war_id[:8]} outsider={other_id[:8]}")

    # ---- P0.7 role reconciliation -------------------------------------------------
    print("\n=== P0.7 role reconciliation ===")
    s, r = rpc("my_challenge_roles", {}, admin)
    check("master_admin profile resolves to super_admin", isinstance(r, list) and "super_admin" in r, str(r))
    # grant the coach an explicit elite_coach role while profiles.role stays 'agent'
    rpc("fn_set_challenge_role", {"p_user": coach_id, "p_role": "elite_coach", "p_grant": True}, admin)
    s, r = rpc("my_challenge_roles", {}, coach)
    check("elite_coach with profiles.role='agent' still resolves (the /coach bug)",
          isinstance(r, list) and "elite_coach" in r, str(r))
    s, r = rpc("has_coach_surface", {}, coach)
    check("that coach can reach the /coach surface", r is True, str(r))
    s, r = rpc("has_coach_surface", {}, war)
    check("a plain warrior cannot reach the /coach surface", r is False, str(r))

    # ---- P0.1 admin enrolment -----------------------------------------------------
    print("\n=== P0.1 admin enrolment ===")
    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, made_cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"P0 TEST COHORT {TAG}", "p_country": "MY", "p_start": start,
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, admin)
    check("admin can create a cohort", s == 200 and isinstance(made_cohort, str), f"{s} {made_cohort}")
    s, cday = rpc("cohort_day", {"p_cohort": made_cohort}, admin)
    check("cohort clock runs (started 15 days ago -> day 16)", cday == 16, f"cohort_day={cday}")

    s, res = rpc("fn_admin_enrol", {"p_cohort": made_cohort, "p_participants": [war_id],
                                    "p_coach": coach_id, "p_note": "p0 test"}, admin)
    check("admin can enrol a warrior into a cohort", s == 200 and res and res.get("enrolled_count") == 1, f"{s} {res}")
    enrol_id = res["enrolled"][0]["enrolment_id"] if res and res.get("enrolled") else None

    s, res2 = rpc("fn_admin_enrol", {"p_cohort": made_cohort, "p_participants": [war_id],
                                     "p_coach": None, "p_note": "dup"}, admin)
    check("duplicate live enrolment is refused", res2 and res2.get("skipped_count") == 1, str(res2))

    s, _ = rpc("fn_admin_enrol", {"p_cohort": made_cohort, "p_participants": [other_id],
                                  "p_coach": None, "p_note": "x"}, war)
    denied("a warrior cannot enrol other people", s)

    # ---- P0.2 accessible day ------------------------------------------------------
    print("\n=== P0.2 participant accessible day ===")
    s, acc = rpc("participant_accessible_day", {"p_enrolment": enrol_id}, admin)
    check("not-yet-active warrior has accessible day 0 (cohort is on 16)", acc == 0, f"accessible={acc}")

    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol_id, "p_checklist": {"profile": True}}, war)
    check("warrior can submit readiness", s == 200 and rid, f"{s} {rid}")

    s, _ = rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "ok"}, war)
    denied("warrior cannot approve their own readiness", s)

    s, _ = rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "ok"}, coach)
    # returns void -> PostgREST answers 204 No Content
    check("assigned coach can approve readiness", s in (200, 204), f"HTTP {s} {_}")

    s, acc = rpc("participant_accessible_day", {"p_enrolment": enrol_id}, admin)
    check("newly ACTIVE warrior gets day 1, NOT the cohort's day 16", acc == 1, f"accessible={acc}")

    # ---- P0.3 RLS insert holes ----------------------------------------------------
    print("\n=== P0.3 RLS insert holes ===")
    s, _ = call("/task_submissions", "POST",
                {"enrolment_id": enrol_id, "day_no": 16, "status": "submitted", "response": "forged"},
                {**war, "Prefer": "return=representation"})
    denied("direct INSERT into task_submissions is refused", s, str(_)[:80])
    s, _ = call("/readiness_submissions", "POST",
                {"enrolment_id": enrol_id, "status": "approved"},
                {**war, "Prefer": "return=representation"})
    denied("direct INSERT into readiness_submissions is refused", s, str(_)[:80])
    s, _ = call("/task_submissions", "POST",
                {"enrolment_id": enrol_id, "day_no": 3, "status": "submitted", "response": "x"},
                {**other, "Prefer": "return=representation"})
    denied("an outsider cannot forge a submission on someone else's enrolment", s, str(_)[:80])

    s, _ = rpc("fn_submit_task", {"p_enrolment": enrol_id, "p_day": 5,
                                  "p_response": "too far", "p_reflection": ""}, war)
    denied("cannot submit a day beyond the accessible day", s, str(_)[:80])

    # ---- P0.4 badge lockdown ------------------------------------------------------
    print("\n=== P0.4 badge lockdown ===")
    s, _ = rpc("award_badge", {"p_user": war_id, "p_code": "graduate", "p_by": None}, war)
    denied("warrior cannot self-award a badge", s, str(_)[:80])
    s, _ = rpc("fn_admin_award_badge", {"p_user": war_id, "p_code": "graduate", "p_reason": "self"}, war)
    denied("warrior cannot use the admin badge RPC on themselves", s, str(_)[:80])

    # ---- P0.5 XP idempotency + reversal -------------------------------------------
    print("\n=== P0.5 XP idempotency and reversal ===")

    def xp_of(uid):
        s, rows = call(f"/points_ledger?user_id=eq.{uid}&status=eq.verified&select=amount", headers=svc)
        return sum(r["amount"] for r in rows) if isinstance(rows, list) else -1

    s, sub1 = rpc("fn_submit_task", {"p_enrolment": enrol_id, "p_day": 1,
                                     "p_response": "day 1 done", "p_reflection": "learned"}, war)
    check("warrior can submit their accessible day", s == 200 and sub1, f"{s} {sub1}")

    s, _ = rpc("fn_review_submission_v2", {"p_submission": sub1, "p_decision": "approve",
                                           "p_note": "good", "p_rubric": None}, war)
    denied("warrior cannot approve their own evidence", s, str(_)[:80])

    rpc("fn_review_submission_v2", {"p_submission": sub1, "p_decision": "approve",
                                    "p_note": "good", "p_rubric": {"action_done": True}}, coach)
    first = xp_of(war_id)
    check("approval writes XP once", first > 0, f"xp={first}")

    rpc("fn_review_submission_v2", {"p_submission": sub1, "p_decision": "approve",
                                    "p_note": "again", "p_rubric": None}, coach)
    check("re-approving the SAME submission does not double-award", xp_of(war_id) == first, f"xp={xp_of(war_id)}")

    rpc("fn_review_submission_v2", {"p_submission": sub1, "p_decision": "revision",
                                    "p_note": "please add the lead records", "p_rubric": None}, coach)
    after_rev = xp_of(war_id)
    check("withdrawing an approval reverses the XP", after_rev == 0, f"xp={after_rev}")
    s, rows = call(f"/points_ledger?user_id=eq.{war_id}&select=amount,status,award_key,reversal_of", headers=svc)
    check("the original award is preserved, not deleted",
          isinstance(rows, list) and len(rows) >= 2 and any(r["status"] == "reversed" for r in rows), str(rows)[:120])

    s, sub2 = rpc("fn_submit_task", {"p_enrolment": enrol_id, "p_day": 1,
                                     "p_response": "day 1 v2", "p_reflection": "better"}, war)
    check("resubmission creates a NEW version row", s == 200 and sub2 and sub2 != sub1, f"{s} {sub2}")
    rpc("fn_review_submission_v2", {"p_submission": sub2, "p_decision": "approve",
                                    "p_note": "now good", "p_rubric": None}, coach)
    final = xp_of(war_id)
    check("approve -> revision -> resubmit -> approve awards exactly once in total",
          final == first, f"xp={final}, expected {first}")

    s, _ = rpc("fn_submit_task", {"p_enrolment": enrol_id, "p_day": 1,
                                  "p_response": "again", "p_reflection": ""}, war)
    denied("an already-approved day cannot be resubmitted", s, str(_)[:80])

    # ---- P0.6 evidence review -----------------------------------------------------
    print("\n=== P0.6 evidence review ===")
    s, det = rpc("fn_review_detail", {"p_submission": sub2}, coach)
    ok = isinstance(det, dict) and det.get("day") and det.get("history")
    check("reviewer sees the requirement, the answer and the history", ok, str(det)[:120])
    check("reviewer sees system evidence Hero already owns",
          isinstance(det, dict) and isinstance(det.get("system_evidence"), dict), "")
    check("review detail separates cohort day from the warrior's day",
          isinstance(det, dict) and det["enrolment"]["cohort_day"] != det["enrolment"]["accessible_day"],
          str(det.get("enrolment")) if isinstance(det, dict) else "")
    s, _ = rpc("fn_review_detail", {"p_submission": sub2}, other)
    denied("an outsider cannot read someone else's evidence", s, str(_)[:80])

    # ---- P1-4 down-payment: participant cannot self-declare a closing --------------
    print("\n=== closing integrity ===")
    s, lead = call("/ch_leads", "POST",
                   {"enrolment_id": enrol_id, "participant_id": war_id, "country": "MY",
                    "name": "P0 Test Lead", "stage": "NEW"},
                   {**war, "Prefer": "return=representation"})
    check("warrior can create their own lead", s in (200, 201) and lead, f"{s} {str(lead)[:80]}")
    lead_id = lead[0]["id"] if isinstance(lead, list) and lead else None
    if lead_id:
        s, _ = call(f"/ch_leads?id=eq.{lead_id}", "PATCH", {"stage": "CLOSED_WON"},
                    {**war, "Prefer": "return=representation"})
        s2, rows = call(f"/ch_leads?id=eq.{lead_id}&select=stage", headers=svc)
        check("warrior cannot self-declare CLOSED_WON",
              isinstance(rows, list) and rows and rows[0]["stage"] != "CLOSED_WON",
              f"stage={rows[0]['stage'] if isinstance(rows, list) and rows else '?'}")

    # ---- ledger hygiene -----------------------------------------------------------
    print("\n=== ledger hygiene ===")
    s, _ = call("/points_ledger", "POST",
                {"user_id": war_id, "source": "day_complete", "amount": 9999, "status": "verified"},
                {**war, "Prefer": "return=representation"})
    denied("warrior cannot write their own XP ledger row", s, str(_)[:80])

finally:
    print("\n=== cleanup ===")
    if made_cohort:
        # cascades: enrolments -> readiness/task submissions -> evidence
        call(f"/points_ledger?cohort_id=eq.{made_cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?id=eq.{made_cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    # 3 passes. Deleting profiles inside the per-user loop fails: the admin granted
    # roles to the coach, so user_roles.granted_by still points at the admin.
    for uid in made_users:
        for tbl in ("ch_notification_sends?recipient", "points_ledger?user_id", "user_badges?user_id",
                    "ch_lead_activities?participant_id", "ch_closings?participant_id",
                    "ch_appointments?participant_id", "ch_leads?participant_id",
                    "coach_assignments?participant_id", "coach_assignments?coach_id",
                    "user_roles?user_id", "notifications?to_agent"):
            call(f"/{tbl}=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in made_users:
        call(f"/user_roles?granted_by=eq.{uid}", "PATCH", {"granted_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/coach_assignments?assigned_by=eq.{uid}", "PATCH", {"assigned_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/enrolments?status_by=eq.{uid}", "PATCH", {"status_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?created_by=eq.{uid}", "PATCH", {"created_by": None}, {**svc, "Prefer": "return=minimal"})
    for uid in made_users:
        st, rr = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if st >= 400:
            print(f"  WARN profile {uid[:8]} not deleted: {rr}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    st, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  removed {len(made_users)} users and the test cohort · agtest remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
