# -*- coding: utf-8 -*-
"""Tests for the Phase-3 surfaces (migration 097).

Proves the four reads are gated and truthful: the authority board shows empty
coverage as empty, a granted permission appears and unlocks the verifier
queue, the pilot watch flags a silent warrior red, and content gaps list the
16 CONTENT_REQUIRED days. Disposable mirror data only.

Usage:  SUPABASE_SECRET=... python tools/test_phase3.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-p3-test/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw[:250]
    except urllib.error.URLError:
        if _try < 3:
            time.sleep(1.5 * (_try + 1)); return call(path, method, body, headers, base, _try + 1)
        raise


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
svc_r = {**svc, "Prefer": "return=representation"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    check(name + "  (expected-denied)", isinstance(status, int) and status >= 400, f"HTTP {status} {detail}")


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohort, lead_id, closing_id = [], None, None, None


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "P3#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]; users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "P3#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


try:
    print("\n=== fixture: admin + verifier + warrior with a closing in review ===")
    adm_id, adm_tok = mkuser(f"p3-adm-{TAG}@agtest.local", "P3 Admin", "MY", "master_admin")
    ver_id, ver_tok = mkuser(f"p3-ver-{TAG}@agtest.local", "P3 Verifier", "MY", "agent")
    war_id, war_tok = mkuser(f"p3-war-{TAG}@agtest.local", "P3 Warrior", "MY", "agent")
    adm, ver, war = as_user(adm_tok), as_user(ver_tok), as_user(war_tok)

    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"P3 TEST {TAG}", "p_country": "MY", "p_start": start,
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, adm)
    rpc("fn_set_challenge_role", {"p_user": adm_id, "p_role": "elite_coach", "p_grant": True}, adm)
    s, res = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [war_id],
                                    "p_coach": adm_id, "p_note": "p3"}, adm)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, war)
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "go"}, adm)
    # a lead + a closing pushed to INTERNAL_REVIEW = queue material
    s, ld = call("/ch_leads", "POST",
                 {"enrolment_id": enrol, "participant_id": war_id, "country": "MY",
                  "name": "P3 Buyer", "stage": "NEGOTIATION"}, {**war, "Prefer": "return=representation"})
    lead_id = ld[0]["id"]
    s, cl = call("/ch_closings", "POST",
                 {"lead_id": lead_id, "participant_id": war_id, "coach_id": adm_id, "country": "MY",
                  "project": "P3 Residence", "status": "INTERNAL_REVIEW",
                  "missing_items": "SPA copy"}, {**war, "Prefer": "return=representation"})
    if not isinstance(cl, list):
        sys.exit(f"closing insert failed: {cl}")
    closing_id = cl[0]["id"]
    print(f"  cohort {str(cohort)[:8]} · enrolment {enrol[:8]} · closing {closing_id[:8]}")

    print("\n=== authority board ===")
    s, b = rpc("fn_authority_board", {}, adm)
    check("admin reads the board", isinstance(b, dict) and "coverage" in b, str(b)[:120])
    check("coverage truthfully reports zero closing.verify for MY",
          b["coverage"].get("closing.verify.MY") == 0, str(b.get("coverage")))
    s, _ = rpc("fn_authority_board", {}, war)
    denied("a plain agent cannot read the board", s)

    print("\n=== the verifier permission unlocks the queue ===")
    s, _ = rpc("fn_verifier_queue", {}, ver)
    denied("without the permission, the queue is closed", s)
    s, r = rpc("fn_admin_grant_permission",
               {"p_user": ver_id, "p_permission": "closing.verify", "p_country": "MY",
                "p_grant": True, "p_note": "p3 test"}, adm)
    check("admin grants closing.verify", not (isinstance(r, dict) and "ERR" in str(r)), str(r)[:100])
    s, b2 = rpc("fn_authority_board", {}, adm)
    check("the grant appears on the board",
          any(g["user_id"] == ver_id for g in b2.get("grants", [])), str(b2)[:160])
    check("coverage now counts 1 for MY", b2["coverage"].get("closing.verify.MY") == 1, str(b2.get("coverage")))

    s, q = rpc("fn_verifier_queue", {}, ver)
    mine = [x for x in (q or {}).get("queue", []) if x["closing_id"] == closing_id] if isinstance(q, dict) else []
    check("the verifier now sees the waiting closing", len(mine) == 1, str(q)[:200])
    check("the queue carries the missing items", mine and mine[0]["missing_items"] == "SPA copy", str(mine)[:140])
    check("the verifier's countries are stated", (q or {}).get("can_verify_countries") == ["MY"], str(q)[:120])

    s, qa = rpc("fn_verifier_queue", {}, adm)
    check("an admin without the permission sees the queue read-only",
          isinstance(qa, dict) and qa.get("is_admin_readonly") is True, str(qa)[:140])

    print("\n=== verification itself still enforces the permission ===")
    s, _ = rpc("fn_verify_closing", {"p_closing": closing_id, "p_approve": True, "p_note": "x"}, adm)
    denied("admin WITHOUT closing.verify cannot verify", s)
    s, _ = rpc("fn_verify_closing", {"p_closing": closing_id, "p_approve": True, "p_note": "x"}, war)
    denied("the participant can never verify their own closing", s)
    s, v = rpc("fn_verify_closing", {"p_closing": closing_id, "p_approve": True, "p_note": "docs complete"}, ver)
    check("the permission holder CAN verify", not (isinstance(v, dict) and v.get("ERR")), str(v)[:120])
    s, truth = call(f"/ch_closings?id=eq.{closing_id}&select=status,verified_by", headers=svc)
    check("the closing is COMPLETED, verified by the holder",
          truth and truth[0]["status"] == "COMPLETED" and truth[0]["verified_by"] == ver_id, str(truth))
    s, badge = call(f"/user_badges?user_id=eq.{war_id}&badge_code=eq.first_closing&select=badge_code", headers=svc)
    check("first_closing badge awarded on real verification",
          isinstance(badge, list) and len(badge) == 1, str(badge))

    print("\n=== pilot watch ===")
    s, w = rpc("fn_pilot_watch", {}, adm)
    rows = w if isinstance(w, list) else []
    mine = [x for x in rows if x["enrolment_id"] == enrol]
    check("the watch lists the mirror warrior", len(mine) == 1, str(rows)[:160])
    check("a warrior activated TODAY is green, not falsely alarmed",
          mine and mine[0]["alert_level"] == "green", str(mine)[:200])
    tary = [x for x in rows if x["participant"] != "P3 Warrior"]
    check("the real stalled pilot is flagged red",
          any(x["alert_level"] == "red" and x["days_missed"] >= 3 for x in tary), str(tary)[:220])
    s, _ = rpc("fn_pilot_watch", {}, war)
    denied("a warrior cannot read the whole watch", s)

    print("\n=== content gaps ===")
    s, g = rpc("fn_content_board", {}, adm)
    check("all 16 CONTENT_REQUIRED days are listed",
          isinstance(g, dict) and len(g.get("gaps", [])) == 16, str(g)[:140])
    s, _ = rpc("fn_content_board", {}, war)
    denied("a plain agent cannot read content gaps", s)

finally:
    print("\n=== teardown ===")
    if closing_id: call(f"/ch_closings?id=eq.{closing_id}", "DELETE", headers=svc)
    if lead_id:
        call(f"/ch_lead_activities?lead_id=eq.{lead_id}", "DELETE", headers=svc)
        call(f"/ch_leads?id=eq.{lead_id}", "DELETE", headers=svc)
    for uid in users:
        call(f"/points_ledger?user_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/user_badges?user_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/notifications?to_agent=eq.{uid}", "DELETE", headers=svc)
        call(f"/ch_notification_sends?recipient=eq.{uid}", "DELETE", headers=svc)
        call(f"/ch_permissions?user_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/readiness_submissions?reviewed_by=eq.{uid}", "DELETE", headers=svc)
        call(f"/enrolments?participant_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/coach_assignments?participant_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/coach_assignments?coach_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/user_roles?user_id=eq.{uid}", "DELETE", headers=svc)
    if cohort: call(f"/cohorts?id=eq.{cohort}", "DELETE", headers=svc)
    for _ in range(3):
        for uid in users:
            call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
            call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")

    s, lg = call("/ch_permissions?select=user_id", headers=svc)
    check("no test permission residue (production grants back to what Kamal set)",
          all(u["user_id"] not in users for u in (lg or [])), str(lg))
    s, lu = call("/profiles?email=like.p3-*agtest.local*&select=email", headers=svc)
    check("no test account residue", lu == [], str(lu))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
