# -*- coding: utf-8 -*-
"""Dual-role safety: a user who is BOTH participant and elite_coach.

This is tary's real situation (Kamal granted her elite_coach on 2026-08-11, and she
self-enrolled as a participant on 2026-08-15). Both roles are intentional and stay.

Verifies:
  * the dual-role user reaches the Coach surface
  * sees ONLY assigned OTHER warriors
  * NEVER sees their own submission as actionable review work
  * still sees their own submission as a participant
  * direct self-review is rejected server-side

Also verifies the live tary -> Kamal coach assignment, read-only.

Usage:  SUPABASE_SECRET=... python tools/test_dual_role.py
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

TARY = "479e41a0-affc-4078-b161-cf562c38b34a"
KAMAL_EMAIL = "kamal.auction@gmail.com"
PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1", _try=0):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-dual/1.0", **(headers or {})})
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


def mkuser(email, name, country, role="agent"):
    s, u = call("/admin/users", "POST", {"email": email, "password": "Dual#Test2026", "email_confirm": True},
                svc, base="/auth/v1")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+62812{abs(hash(email)) % 1000000:06d}",
          "email": email, "country": country, "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": "Dual#Test2026"},
                {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohort = [], None
try:
    print("\n=== LIVE: tary -> Kamal coach assignment (read-only) ===")
    s, k = call(f"/profiles?email=eq.{KAMAL_EMAIL}&select=id,name", headers=svc)
    kamal = k[0]["id"]
    s, ca = call(f"/coach_assignments?participant_id=eq.{TARY}&select=coach_id,active,created_at,assigned_by", headers=svc)
    check("tary has an active coach assignment", isinstance(ca, list) and len(ca) == 1 and ca[0]["active"], str(ca))
    check("her coach is Kamal, resolved from the canonical profile", ca and ca[0]["coach_id"] == kamal, str(ca))
    s, roles = call(f"/user_roles?user_id=eq.{TARY}&select=role", headers=svc)
    have = sorted(r["role"] for r in roles)
    check("tary still holds BOTH roles (nothing removed)", have == ["elite_coach", "participant"], str(have))
    s, au = call(f"/audit_events?action=eq.coach_assigned&entity_id=eq.{kamal}:{TARY}"
                 "&select=actor_type,execution_method,authorized_by_user_id,reason&order=at.desc&limit=1", headers=svc)
    check("the assignment is audited as service-executed, Kamal-authorised",
          au and au[0]["actor_type"] == "service" and au[0]["execution_method"] == "migration"
          and au[0]["authorized_by_user_id"] == kamal, str(au)[:180])
    s, snd = call(f"/ch_notification_sends?recipient=eq.{TARY}&template_code=eq.coach_assigned_participant&select=country,locale,rendered_title", headers=svc)
    check("tary was told, in ID/id-ID, through a managed template",
          snd and snd[0]["country"] == "ID" and snd[0]["locale"] == "id-ID", str(snd)[:140])

    print("\n=== MIRROR: a dual-role user (participant + elite_coach) ===")
    adm_id, adm_tok = mkuser(f"dual-adm-{TAG}@agtest.local", "Dual Admin", "ID", "master_admin")
    dual_id, dual_tok = mkuser(f"dual-both-{TAG}@agtest.local", "Dual Warrior Coach", "ID")
    mate_id, mate_tok = mkuser(f"dual-mate-{TAG}@agtest.local", "Dual Teammate", "ID")
    out_id, out_tok = mkuser(f"dual-out-{TAG}@agtest.local", "Dual Outsider", "ID")
    users = [adm_id, dual_id, mate_id, out_id]
    adm, dual, mate, out = as_user(adm_tok), as_user(dual_tok), as_user(mate_tok), as_user(out_tok)

    # fn_assign_coach requires the coach to hold an explicit reviewing role in
    # user_roles — a master_admin profile alone is not enough.
    for u in (dual_id, out_id, adm_id):
        rpc("fn_set_challenge_role", {"p_user": u, "p_role": "elite_coach", "p_grant": True}, adm)
    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"DUAL TEST {TAG}", "p_country": "ID", "p_start": start,
        "p_timezone": "Asia/Jakarta", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, adm)

    # the dual-role user is BOTH a participant and the teammate's coach
    s, r1 = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [dual_id],
                                   "p_coach": adm_id, "p_note": "dual"}, adm)
    if not isinstance(r1, dict):
        sys.exit(f"fn_admin_enrol(dual) failed: {r1}")
    dual_enrol = r1["enrolled"][0]["enrolment_id"]
    s, r2 = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [mate_id],
                                   "p_coach": dual_id, "p_note": "dual"}, adm)
    if not isinstance(r2, dict):
        sys.exit(f"fn_admin_enrol(mate) failed: {r2}")
    mate_enrol = r2["enrolled"][0]["enrolment_id"]

    for enrol, tok in ((dual_enrol, dual_tok), (mate_enrol, mate_tok)):
        s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, as_user(tok))
        rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "ok"}, adm)

    s, dual_sub = rpc("fn_submit_task", {"p_enrolment": dual_enrol, "p_day": 1,
                                         "p_response": "my own day 1", "p_reflection": "x"}, dual)
    s, mate_sub = rpc("fn_submit_task", {"p_enrolment": mate_enrol, "p_day": 1,
                                         "p_response": "teammate day 1", "p_reflection": "y"}, mate)

    print("\n=== coach surface + self-exclusion ===")
    s, hs = rpc("has_coach_surface", {}, dual)
    check("dual-role user reaches the Coach surface", hs is True, str(hs))

    s, q = rpc("fn_review_queue", {}, dual)
    ev_ids = [x["id"] for x in (q.get("evidence") or [])] if isinstance(q, dict) else []
    part_ids = [x["participant_id"] for x in (q.get("evidence") or [])] if isinstance(q, dict) else []
    check("review queue contains the teammate's submission", mate_sub in ev_ids, str(ev_ids))
    check("review queue does NOT contain their OWN submission", dual_sub not in ev_ids, str(ev_ids))
    check("review queue never lists themselves as a participant", dual_id not in part_ids, str(part_ids))

    s, pod = rpc("fn_coach_pod", {}, dual)
    pod_ids = [p["participant_id"] for p in pod] if isinstance(pod, list) else []
    check("coach pod shows the teammate", mate_id in pod_ids, str(pod_ids))
    check("coach pod excludes themselves", dual_id not in pod_ids, str(pod_ids))

    print("\n=== but they still see their own work AS A PARTICIPANT ===")
    s, mine = call(f"/task_submissions?id=eq.{dual_sub}&select=id,day_no", headers=dual)
    check("dual-role user can still read their own submission", isinstance(mine, list) and len(mine) == 1, str(mine)[:110])
    s, m = rpc("my_challenge_clock", {}, dual)
    check("their own participant clock still works", isinstance(m, dict) and m.get("accessible_day") == 1, str(m)[:120])

    print("\n=== self-review remains rejected server-side ===")
    s, _ = rpc("fn_review_submission_v2", {"p_submission": dual_sub, "p_decision": "approve",
                                           "p_note": "self", "p_rubric": None}, dual)
    denied("cannot approve own evidence", s, str(_)[:90])
    s, _ = rpc("fn_review_detail", {"p_submission": mate_sub}, out)
    denied("unrelated coach cannot open the teammate's evidence", s, str(_)[:90])
    s, det = rpc("fn_review_detail", {"p_submission": mate_sub}, dual)
    check("assigned dual-role coach CAN open the teammate's evidence",
          isinstance(det, dict) and det.get("day"), str(det)[:110])
    s, _ = rpc("award_badge", {"p_user": dual_id, "p_code": "graduate", "p_by": None}, dual)
    denied("dual-role user still cannot self-award a badge", s, str(_)[:90])

    print("\n=== approving the teammate works normally ===")
    s, _ = rpc("fn_review_submission_v2", {"p_submission": mate_sub, "p_decision": "approve",
                                           "p_note": "good", "p_rubric": {"action_done": True}}, dual)
    check("dual-role coach can approve their assigned teammate", s in (200, 204), f"HTTP {s} {_}")
    s, pl = call(f"/points_ledger?user_id=eq.{mate_id}&status=eq.verified&select=amount", headers=svc)
    check("teammate received XP exactly once", isinstance(pl, list) and len(pl) == 1, str(pl))
    # NOTE: profiles.language defaults to 'en', so a brand-new ID profile that has
    # never chosen a language resolves to ID/en — correct per the resolution rule
    # (en IS in ID's pair), but it means the DB default contradicts the product rule
    # "ID default = Bahasa Indonesia". Asserted against the profile's ACTUAL setting.
    s, prof = call(f"/profiles?id=eq.{mate_id}&select=country,language", headers=svc)
    want = "en" if prof[0]["language"] == "en" else "id-ID"
    s, snd = call(f"/ch_notification_sends?recipient=eq.{mate_id}&template_code=eq.evidence_approved&select=country,locale", headers=svc)
    check("approval message went through a managed template in the recipient's own country",
          snd and snd[0]["country"] == "ID" and snd[0]["locale"] == want,
          f"profile={prof[0]} send={snd}")
    check("and it never resolved to a MY row", snd and snd[0]["country"] != "MY", str(snd)[:120])

finally:
    print("\n=== cleanup ===")
    if cohort:
        call(f"/points_ledger?cohort_id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
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
    for uid in users:
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]}: {r}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
