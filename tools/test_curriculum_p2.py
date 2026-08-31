# -*- coding: utf-8 -*-
"""Automated P2 tests: curriculum versioning and country-content isolation (081 + 082).

The property that matters most: an ID warrior must NEVER be served MY content, and
a country variant that is still marked CONTENT REQUIRED must never reach a warrior —
they get the generic row instead.

Usage:  SUPABASE_SECRET=... python tools/test_curriculum_p2.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-p2-test/1.0", **(headers or {})})
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


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST", {"email": email, "password": "P2#Test2026", "email_confirm": True},
                svc, base="/auth/v1")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+60199{abs(hash(email)) % 1000000:06d}",
          "email": email, "country": country, "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": "P2#Test2026"},
                {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohorts = [], []
try:
    print("\n=== structure ===")
    s, v2 = call("/curriculum_versions?version=eq.2&select=id,status", headers=svc)
    check("curriculum v2 exists as a draft", isinstance(v2, list) and v2 and v2[0]["status"] == "draft", str(v2))
    v2id = v2[0]["id"]
    s, v1 = call("/curriculum_versions?version=eq.1&select=id,status", headers=svc)
    check("v1 is untouched and still published", isinstance(v1, list) and v1[0]["status"] == "published", str(v1))
    v1id = v1[0]["id"]

    s, gen = call(f"/curriculum_days?version_id=eq.{v2id}&country_override=is.null&select=day_no", headers=svc)
    check("v2 has exactly 30 generic days", isinstance(gen, list) and len(gen) == 30, f"got {len(gen) if isinstance(gen, list) else gen}")
    s, cv = call(f"/curriculum_days?version_id=eq.{v2id}&country_override=not.is.null&select=day_no,country_override,content_status", headers=svc)
    check("v2 has 16 country rows, all marked content_required",
          isinstance(cv, list) and len(cv) == 16 and all(r["content_status"] == "content_required" for r in cv),
          str(cv)[:140])
    check("the 8 country-sensitive days are exactly 3,4,8,13,16,21,22,24",
          isinstance(cv, list) and sorted({r["day_no"] for r in cv}) == [3, 4, 8, 13, 16, 21, 22, 24],
          str(sorted({r["day_no"] for r in cv}) if isinstance(cv, list) else cv))

    print("\n=== uniqueness that actually holds ===")
    s, _ = call("/curriculum_days", "POST",
                {"version_id": v2id, "day_no": 1, "phase": 1, "title": {"en": "duplicate generic"}},
                {**svc, "Prefer": "return=representation"})
    denied("a second GENERIC row for the same day is now rejected", s, str(_)[:90])

    print("\n=== country isolation ===")
    my_id, my_tok = mkuser(f"p2-my-{TAG}@agtest.local", "P2 MY Warrior", "MY", "agent")
    id_id, id_tok = mkuser(f"p2-id-{TAG}@agtest.local", "P2 ID Warrior", "ID", "agent")
    adm_id, adm_tok = mkuser(f"p2-adm-{TAG}@agtest.local", "P2 Admin", "MY", "master_admin")
    users = [my_id, id_id, adm_id]
    adm = as_user(adm_tok)

    s, r = rpc("fn_curriculum_day", {"p_version": v2id, "p_day": 16, "p_country": "ID"}, adm)
    check("an ID warrior gets a row on Day 16", isinstance(r, dict) and r.get("day_no") == 16, str(r)[:120])
    check("that row is the GENERIC one, not the MY variant",
          isinstance(r, dict) and r.get("country_override") is None, f"country_override={r.get('country_override') if isinstance(r, dict) else r}")
    check("and it is never a content_required placeholder",
          isinstance(r, dict) and r.get("content_status") == "ok", str(r.get("content_status") if isinstance(r, dict) else r))

    s, rmy = rpc("fn_curriculum_day", {"p_version": v2id, "p_day": 16, "p_country": "MY"}, adm)
    check("a MY warrior also gets the generic row while the MY variant is unwritten",
          isinstance(rmy, dict) and rmy.get("country_override") is None, str(rmy)[:120])

    # now author the ID variant and flip it to ok
    s, idrow = call(f"/curriculum_days?version_id=eq.{v2id}&day_no=eq.16&country_override=eq.ID&select=id", headers=svc)
    idrow_id = idrow[0]["id"]
    call(f"/curriculum_days?id=eq.{idrow_id}", "PATCH",
         {"content": {"en": "ID authorised process", "ms-MY": "ID", "id-ID": "Proses resmi ID"},
          "content_status": "ok"}, {**svc, "Prefer": "return=minimal"})
    s, r2 = rpc("fn_curriculum_day", {"p_version": v2id, "p_day": 16, "p_country": "ID"}, adm)
    check("once the ID variant is authored, the ID warrior gets IT",
          isinstance(r2, dict) and r2.get("country_override") == "ID", str(r2)[:120])
    s, r3 = rpc("fn_curriculum_day", {"p_version": v2id, "p_day": 16, "p_country": "MY"}, adm)
    check("and the MY warrior still does NOT get the ID content",
          isinstance(r3, dict) and r3.get("country_override") is None, str(r3)[:120])
    # restore
    call(f"/curriculum_days?id=eq.{idrow_id}", "PATCH", {"content_status": "content_required"},
         {**svc, "Prefer": "return=minimal"})

    print("\n=== content gap register ===")
    s, gaps = rpc("fn_content_gaps", {"p_version": v2id}, adm)
    check("content gaps are listed for admins", isinstance(gaps, list) and len(gaps) == 16, f"got {len(gaps) if isinstance(gaps, list) else gaps}")
    check("each gap names what must be authored",
          isinstance(gaps, list) and all(g.get("content_note") for g in gaps), str(gaps[:1])[:160])

    print("\n=== version lifecycle ===")
    s, _ = rpc("fn_admin_publish_version", {"p_version": v2id, "p_note": "x"}, as_user(my_tok))
    denied("a warrior cannot publish a curriculum version", s, str(_)[:80])
    s, v3 = rpc("fn_admin_new_version", {"p_from": v2id, "p_note": "p2 test copy"}, adm)
    check("admin can branch a new draft version", s == 200 and isinstance(v3, str), f"{s} {v3}")
    if isinstance(v3, str):
        s, cnt = call(f"/curriculum_days?version_id=eq.{v3}&select=id", headers=svc)
        check("the branch deep-copies every row including country variants",
              isinstance(cnt, list) and len(cnt) == 46, f"got {len(cnt) if isinstance(cnt, list) else cnt}")
        call(f"/curriculum_versions?id=eq.{v3}", "DELETE", None, {**svc, "Prefer": "return=minimal"})

    print("\n=== editing a published, already-answered day is refused ===")
    s, coh = rpc("fn_admin_create_cohort", {
        "p_name": f"P2 COHORT {TAG}", "p_country": "MY",
        "p_start": (datetime.date.today() - datetime.timedelta(days=3)).isoformat(),
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": v1id, "p_status": "open"}, adm)
    cohorts.append(coh)
    rpc("fn_set_challenge_role", {"p_user": adm_id, "p_role": "elite_coach", "p_grant": True}, adm)
    s, res = rpc("fn_admin_enrol", {"p_cohort": coh, "p_participants": [my_id], "p_coach": adm_id, "p_note": "p2"}, adm)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, as_user(my_tok))
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "ok"}, adm)
    s, sub = rpc("fn_submit_task", {"p_enrolment": enrol, "p_day": 1, "p_response": "x", "p_reflection": "y"}, as_user(my_tok))
    check("warrior submitted Day 1 on published v1", s == 200 and sub, f"{s} {sub}")
    s, d1 = call(f"/curriculum_days?version_id=eq.{v1id}&day_no=eq.1&country_override=is.null&select=id", headers=svc)
    s, _ = rpc("fn_admin_save_day", {"p_day": d1[0]["id"],
                                     "p_patch": {"required_action": {"en": "changed after the fact"}}}, adm)
    denied("rewriting the required action of an answered published day is refused", s, str(_)[:110])
    # NOTE: this writes into the PUBLISHED v1 curriculum, so it must be restored.
    # An earlier version of this test did not, and left "safe to add" sitting in
    # the live Day 1 that a real warrior was reading.
    s, before = call(f"/curriculum_days?id=eq.{d1[0]['id']}&select=coach_guidance", headers=svc)
    original = before[0]["coach_guidance"] if isinstance(before, list) and before else None
    s, _ = rpc("fn_admin_save_day", {"p_day": d1[0]["id"],
                                     "p_patch": {"coach_guidance": {"en": "P2 PROBE — will be reverted"}}}, adm)
    check("but adding coach guidance to it is allowed", s in (200, 204), f"HTTP {s} {_}")
    call(f"/curriculum_days?id=eq.{d1[0]['id']}", "PATCH", {"coach_guidance": original},
         {**svc, "Prefer": "return=minimal"})
    s, after = call(f"/curriculum_days?id=eq.{d1[0]['id']}&select=coach_guidance", headers=svc)
    check("published curriculum is restored to its pre-test value",
          isinstance(after, list) and after[0]["coach_guidance"] == original, str(after)[:110])
    s, ev = call("/audit_events?action=eq.curriculum_day_edited&select=action&limit=1", headers=svc)
    check("curriculum edits are now audited", isinstance(ev, list) and len(ev) == 1, str(ev)[:100])

finally:
    print("\n=== cleanup ===")
    for c in cohorts:
        if c:
            call(f"/points_ledger?cohort_id=eq.{c}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
            call(f"/cohorts?id=eq.{c}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
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
    call("/audit_events?action=eq.curriculum_day_edited", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    print(f"  removed {len(users)} users, {len(cohorts)} cohort(s), and the probe audit row")

    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
