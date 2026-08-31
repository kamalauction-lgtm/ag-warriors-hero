# -*- coding: utf-8 -*-
"""Automated P1 tests for the 30 Days daily operating system (migration 080).

Walks one throwaway warrior through a realistic pipeline progression and asserts
the bottleneck engine names the right stage at each step, that the daily mission
counts real records, that fast CRM entry writes once and updates everything, and
that coach/mentor views are scoped and authorised. Cleans up after itself.

Usage:  SUPABASE_SECRET=... python tools/test_challenge_p1.py
Requires 079 and 080 to have been applied.
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

PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1"):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-p1-test/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    check(name + "  (expected-denied)", isinstance(status, int) and status >= 400, f"HTTP {status} {detail}")


def mkuser(email, name, role):
    s, u = call("/admin/users", "POST", {"email": email, "password": "P1#Test2026", "email_confirm": True},
                svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": "MY", "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": "P1#Test2026"},
                {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


def bn(hdr, uid):
    s, r = rpc("fn_bottleneck", {"p_participant": uid}, hdr)
    return (r or {}).get("code") if isinstance(r, dict) else f"ERR {s} {r}"


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohort = [], None
try:
    print("\n=== setup ===")
    admin_id, admin_tok = mkuser(f"p1-admin-{TAG}@agtest.local", "P1 Admin", "master_admin")
    coach_id, coach_tok = mkuser(f"p1-coach-{TAG}@agtest.local", "P1 Coach", "agent")
    war_id,   war_tok   = mkuser(f"p1-war-{TAG}@agtest.local",   "P1 Warrior", "agent")
    out_id,   out_tok   = mkuser(f"p1-out-{TAG}@agtest.local",   "P1 Outsider", "agent")
    users = [admin_id, coach_id, war_id, out_id]
    admin, coach, war, out = as_user(admin_tok), as_user(coach_tok), as_user(war_tok), as_user(out_tok)

    rpc("fn_set_challenge_role", {"p_user": coach_id, "p_role": "elite_coach", "p_grant": True}, admin)
    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"P1 TEST COHORT {TAG}", "p_country": "MY", "p_start": start,
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, admin)
    s, res = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [war_id],
                                    "p_coach": coach_id, "p_note": "p1"}, admin)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, war)
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "go"}, coach)
    print(f"  warrior enrolled and ACTIVE, enrolment={enrol[:8]}")

    # ---- targets stay DRAFT ---------------------------------------------------------
    print("\n=== configurable targets (must stay DRAFT) ===")
    s, t = rpc("fn_target", {"p_cohort": cohort, "p_code": "new_conversations"}, admin)
    check("no ACTIVE target exists -> fn_target returns null (Hero never claims 'on track')", t is None, f"got {t}")
    s, rows = call("/ch_targets?select=code,target,active", headers=svc)
    check("all seeded targets are inactive drafts",
          isinstance(rows, list) and rows and not any(r["active"] for r in rows), str(rows)[:120])

    # ---- open decision register -----------------------------------------------------
    # Governance v1 (089) resolved every Open Decision into a versioned policy.
    # The register is preserved and each row now carries its resolving policy code.
    s, rows = call("/ch_open_decisions?select=code,decided,decision", headers=svc)
    check("every open decision is now resolved by a Governance policy",
          isinstance(rows, list) and len(rows) >= 9
          and all(r["decided"] and r["decision"] for r in rows), str(rows)[:140])

    # ---- daily mission --------------------------------------------------------------
    print("\n=== daily mission ===")
    s, m = rpc("fn_daily_mission", {"p_enrolment": enrol}, war)
    ok = isinstance(m, dict) and m.get("accessible_day") == 1 and m.get("cohort_day") == 16
    check("mission separates cohort day (16) from the warrior's day (1)", ok, str(m)[:160])
    check("mission carries today's curriculum day",
          isinstance(m, dict) and m.get("curriculum") and m["curriculum"]["day_no"] == 1, str(m)[:160])
    check("mission business counts start at zero",
          isinstance(m, dict) and m["business"]["active_leads"] == 0, str(m.get("business")))
    check("no targets are published, so 'targets' is empty",
          isinstance(m, dict) and m.get("targets") in ({}, None), str(m.get("targets")))
    s, _ = rpc("fn_daily_mission", {"p_enrolment": enrol}, out)
    denied("an outsider cannot read someone else's mission", s)

    # ---- bottleneck engine: a realistic progression ---------------------------------
    print("\n=== bottleneck engine (funnel order, structural facts only) ===")
    check("no pipeline at all -> PROSPECTING_GAP", bn(war, war_id) == "PROSPECTING_GAP", bn(war, war_id))

    s, lead = call("/ch_leads", "POST",
                   {"enrolment_id": enrol, "participant_id": war_id, "country": "MY",
                    "name": "P1 Buyer", "stage": "NEW"},
                   {**war, "Prefer": "return=representation"})
    lead_id = lead[0]["id"]
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

    s, r = rpc("fn_log_touch", {"p_lead": lead_id, "p_type": "call", "p_outcome": "no_reply",
                                "p_notes": None, "p_next_action": "try again",
                                "p_next_date": tomorrow, "p_stage": "CONTACTED"}, war)
    check("fast CRM entry writes the touch in one call", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    check("reached out but nobody engaged -> OPENING_GAP", bn(war, war_id) == "OPENING_GAP", bn(war, war_id))

    rpc("fn_log_touch", {"p_lead": lead_id, "p_type": "message", "p_outcome": "engaged",
                         "p_notes": None, "p_next_action": None, "p_next_date": tomorrow, "p_stage": "ENGAGED"}, war)
    check("engaged but nothing qualified -> DISCOVERY_GAP", bn(war, war_id) == "DISCOVERY_GAP", bn(war, war_id))

    rpc("fn_log_touch", {"p_lead": lead_id, "p_type": "call", "p_outcome": "qualified",
                         "p_notes": None, "p_next_action": None, "p_next_date": tomorrow, "p_stage": "QUALIFIED"}, war)
    check("qualified with no appointment -> NEXT_STEP_GAP", bn(war, war_id) == "NEXT_STEP_GAP", bn(war, war_id))

    call("/ch_appointments", "POST",
         {"lead_id": lead_id, "participant_id": war_id, "kind": "appointment", "status": "SCHEDULED",
          "starts_at": (datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=2)).isoformat()},
         {**war, "Prefer": "return=minimal"})
    check("appointment set -> no bottleneck", bn(war, war_id) is None, bn(war, war_id))

    yesterday = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    call(f"/ch_leads?id=eq.{lead_id}", "PATCH", {"next_action_at": yesterday},
         {**war, "Prefer": "return=minimal"})
    check("agreed follow-up date passed -> FOLLOW_UP_GAP", bn(war, war_id) == "FOLLOW_UP_GAP", bn(war, war_id))

    s, b = rpc("fn_bottleneck", {"p_participant": war_id}, war)
    check("diagnosis shows its evidence, not a verdict",
          isinstance(b, dict) and isinstance(b.get("evidence"), dict) and b.get("rule_version"), str(b)[:140])
    s, _ = rpc("fn_bottleneck", {"p_participant": war_id}, out)
    denied("an outsider cannot diagnose someone else", s)

    # ---- mission reflects the real records now --------------------------------------
    print("\n=== mission and funnel now read the real records ===")
    s, m = rpc("fn_daily_mission", {"p_enrolment": enrol}, war)
    check("mission picks up the overdue follow-up as the priority",
          isinstance(m, dict) and m.get("priority") and m["priority"]["code"] in ("VIEWING_PREP", "FOLLOW_UPS_DUE"),
          str(m.get("priority")))
    check("mission counts the active lead", isinstance(m, dict) and m["business"]["active_leads"] == 1, str(m.get("business")))
    s, f = rpc("fn_funnel", {"p_participant": war_id}, war)
    check("funnel counts come from actual records",
          isinstance(f, dict) and f["qualified"] == 1 and f["appointments"] == 1 and f["verified_closings"] == 0, str(f)[:160])

    # ---- closing integrity through the fast path ------------------------------------
    s, _ = rpc("fn_log_touch", {"p_lead": lead_id, "p_type": "call", "p_outcome": "won",
                                "p_notes": None, "p_next_action": None, "p_next_date": None,
                                "p_stage": "CLOSED_WON"}, war)
    denied("fast CRM entry cannot self-declare CLOSED_WON", s, str(_)[:80])

    # ---- day summary and weekly review ----------------------------------------------
    print("\n=== generated reports ===")
    s, d = rpc("fn_day_summary", {"p_enrolment": enrol, "p_date": None}, war)
    check("end-of-day report is generated from records",
          isinstance(d, dict) and d.get("touches", 0) >= 3 and d.get("new_conversations", 0) >= 1, str(d)[:160])
    s, w = rpc("fn_weekly_review", {"p_enrolment": enrol, "p_weeks_back": 0}, war)
    check("weekly review includes funnel and bottleneck",
          isinstance(w, dict) and w.get("funnel") and w.get("bottleneck"), str(w)[:140])

    # ---- coach and mentor views ------------------------------------------------------
    print("\n=== coach and mentor views ===")
    s, pod = rpc("fn_coach_pod", {}, coach)
    mine = [p for p in (pod or []) if p["participant_id"] == war_id] if isinstance(pod, list) else []
    check("coach sees their assigned warrior", len(mine) == 1, str(pod)[:140])
    check("pod row separates cohort day from the warrior's day",
          mine and mine[0]["cohort_day"] == 16 and mine[0]["accessible_day"] == 1, str(mine)[:160])
    check("pod row carries the bottleneck", mine and mine[0]["bottleneck"] == "FOLLOW_UP_GAP", str(mine)[:160])
    s, _ = rpc("fn_coach_pod", {}, war)
    denied("a plain warrior cannot open the coach pod", s)

    s, h = rpc("fn_programme_health", {"p_country": "MY"}, admin)
    check("programme health counts the warrior",
          isinstance(h, dict) and h.get("warriors", 0) >= 1 and h.get("leads", 0) >= 1, str(h)[:160])
    check("programme health aggregates bottlenecks",
          isinstance(h, dict) and isinstance(h.get("bottlenecks"), list), str(h.get("bottlenecks"))[:120])
    s, _ = rpc("fn_programme_health", {"p_country": "MY"}, war)
    denied("a plain warrior cannot open programme health", s)

    # ---- excused day gives time back --------------------------------------------------
    print("\n=== missed / excused day ===")
    s, before = rpc("participant_accessible_day", {"p_enrolment": enrol}, admin)
    s, _ = rpc("fn_admin_mark_day", {"p_enrolment": enrol, "p_day": 1,
                                     "p_state": "excused", "p_reason": "family emergency"}, coach)
    s, after = rpc("participant_accessible_day", {"p_enrolment": enrol}, admin)
    check("an excused day gives the warrior time back, it does not punish them",
          after == max(before - 1, 0), f"before={before} after={after}")
    s, _ = rpc("fn_admin_mark_day", {"p_enrolment": enrol, "p_day": 2,
                                     "p_state": "excused", "p_reason": "self"}, war)
    denied("a warrior cannot excuse their own day", s)

    # ---- sweep -------------------------------------------------------------------------
    print("\n=== automation sweep ===")
    s, sw = rpc("fn_challenge_sweep", {"p_force": True}, svc)
    check("sweep runs and reports what it did", isinstance(sw, dict) and "day27_raised" in sw, str(sw)[:160])
    # Governance v1 Decision 4 approved a 24h grace window, so the sweep now
    # AUTO-MARKS days past grace instead of merely flagging them.
    check("sweep now enforces the approved grace policy",
          isinstance(sw, dict) and "days_marked_missed" in sw and sw.get("governance") == "v1", str(sw)[:180])
    s, sw2 = rpc("fn_challenge_sweep", {"p_force": False}, svc)
    check("sweep self-guards to once per 12h", isinstance(sw2, dict) and sw2.get("skipped"), str(sw2)[:120])
    s, _ = rpc("fn_challenge_sweep", {"p_force": True}, war)
    denied("a warrior cannot run the sweep", s)

finally:
    print("\n=== cleanup ===")
    if cohort:
        call(f"/points_ledger?cohort_id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    # 3 passes. Deleting profiles inside the per-user loop fails: the admin granted
    # roles to the coach, so user_roles.granted_by still points at the admin.
    for uid in users:
        for tbl in ("ch_notification_sends?recipient", "points_ledger?user_id", "user_badges?user_id",
                    "ch_lead_activities?participant_id", "ch_closings?participant_id",
                    "ch_appointments?participant_id", "ch_leads?participant_id",
                    "coach_assignments?participant_id", "coach_assignments?coach_id",
                    "user_roles?user_id", "notifications?to_agent"):
            call(f"/{tbl}=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        call(f"/user_roles?granted_by=eq.{uid}", "PATCH", {"granted_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/coach_assignments?assigned_by=eq.{uid}", "PATCH", {"assigned_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/enrolments?status_by=eq.{uid}", "PATCH", {"status_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?created_by=eq.{uid}", "PATCH", {"created_by": None}, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]} not deleted: {r}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    # the sweep's own guard row would block the next run within 12h
    call("/audit_events?action=eq.challenge_sweep", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    print(f"  removed {len(users)} users and the test cohort")

    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
