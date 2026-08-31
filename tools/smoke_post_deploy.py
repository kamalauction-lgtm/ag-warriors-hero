# -*- coding: utf-8 -*-
"""Post-deploy smoke test.

tary is a REAL user. Her state is verified read-only; we never authenticate as her.
UI behaviour is verified with a MIRROR warrior in a cohort shaped identically to
hers (ID, started 2026-08-08, Asia/Jakarta, 06:00 unlock, same curriculum version),
so the accessible-day arithmetic under test is the same arithmetic.

  python tools/smoke_post_deploy.py setup     -> create the mirror, print credentials
  python tools/smoke_post_deploy.py verify    -> server-side assertions
  python tools/smoke_post_deploy.py teardown  -> remove the mirror
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

TARY = "479e41a0-affc-4078-b161-cf562c38b34a"
TARY_ENROL = "e2d3b2c2-3ec9-4064-9338-b57abf2bd415"
ID_COHORT = "62892f0c-8cab-4416-845b-b13db84dedce"
STATE = os.path.join(os.path.dirname(__file__), ".smoke_state.json")
MIRROR_PW = "Mirror#Smoke2026"

PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1"):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-smoke/1.0", **(headers or {})})
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


def token(email, pw=MIRROR_PW):
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": pw},
                {"apikey": ANON}, base="/auth/v1")
    return t["access_token"] if isinstance(t, dict) else None


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST", {"email": email, "password": MIRROR_PW, "email_confirm": True},
                svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"create {email}: {u}")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+62811{abs(hash(email)) % 1000000:06d}",
          "email": email, "country": country, "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    return uid, token(email)


def setup():
    tag = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
    s, coh = call(f"/cohorts?id=eq.{ID_COHORT}&select=official_start_date,official_timezone,daily_unlock_time,curriculum_version_id", headers=svc)
    src = coh[0]
    print(f"mirroring ID Cohort 1: start={src['official_start_date']} tz={src['official_timezone']}")

    adm_id, adm_tok = mkuser(f"smoke-adm-{tag}@agtest.local", "Smoke Admin", "ID", "master_admin")
    war_id, war_tok = mkuser(f"smoke-war-{tag}@agtest.local", "Smoke Warrior", "ID", "agent")
    cch_id, cch_tok = mkuser(f"smoke-coach-{tag}@agtest.local", "Smoke Coach", "ID", "agent")
    oth_id, oth_tok = mkuser(f"smoke-other-{tag}@agtest.local", "Smoke OtherCoach", "ID", "agent")
    adm = as_user(adm_tok)

    s, cid = rpc("fn_admin_create_cohort", {
        "p_name": f"SMOKE MIRROR {tag}", "p_country": "ID",
        "p_start": src["official_start_date"], "p_timezone": src["official_timezone"],
        "p_unlock": src["daily_unlock_time"], "p_version": src["curriculum_version_id"],
        "p_status": "open"}, adm)
    for c in (cch_id, oth_id):
        rpc("fn_set_challenge_role", {"p_user": c, "p_role": "elite_coach", "p_grant": True}, adm)
    s, res = rpc("fn_admin_enrol", {"p_cohort": cid, "p_participants": [war_id],
                                    "p_coach": cch_id, "p_note": "post-deploy smoke"}, adm)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {"smoke": True}}, as_user(war_tok))
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "smoke"}, as_user(cch_tok))

    st = {"tag": tag, "cohort": cid, "enrol": enrol,
          "admin": [adm_id, f"smoke-adm-{tag}@agtest.local"],
          "warrior": [war_id, f"smoke-war-{tag}@agtest.local"],
          "coach": [cch_id, f"smoke-coach-{tag}@agtest.local"],
          "other": [oth_id, f"smoke-other-{tag}@agtest.local"]}
    json.dump(st, open(STATE, "w"))
    print("\n  MIRROR READY — sign in at https://hero.iqiaggroup.com")
    print(f"    warrior : smoke-war-{tag}@agtest.local  /  {MIRROR_PW}")
    print(f"    coach   : smoke-coach-{tag}@agtest.local  /  {MIRROR_PW}")
    print(f"    admin   : smoke-adm-{tag}@agtest.local  /  {MIRROR_PW}")


def verify():
    st = json.load(open(STATE))
    war_tok = token(st["warrior"][1]); cch_tok = token(st["coach"][1])
    oth_tok = token(st["other"][1]);   adm_tok = token(st["admin"][1])
    war, cch, oth, adm = as_user(war_tok), as_user(cch_tok), as_user(oth_tok), as_user(adm_tok)

    print("\n=== TARY (read-only, never authenticated as her) ===")
    s, cd = rpc("cohort_day", {"p_cohort": ID_COHORT}, svc)
    s, ad = rpc("participant_accessible_day", {"p_enrolment": TARY_ENROL}, svc)
    s, en = call(f"/enrolments?id=eq.{TARY_ENROL}&select=status,activated_at", headers=svc)
    check("tary cohort day = 16", cd == 16, f"got {cd}")
    check("tary participant stage = active", en[0]["status"] == "active", str(en))
    check("tary accessible day = 1", ad == 1, f"got {ad}")
    s, subs = call(f"/task_submissions?enrolment_id=eq.{TARY_ENROL}&select=day_no", headers=svc)
    check("tary has completed no days (roadmap must not imply Day 16 reached)",
          isinstance(subs, list) and len(subs) == 0, str(subs))

    print("\n=== MIRROR WARRIOR — identical cohort shape ===")
    s, m = rpc("my_challenge_clock", {}, war)
    check("clock: cohort_day 16 vs accessible_day 1 are separate values",
          m.get("cohort_day") == 16 and m.get("accessible_day") == 1, str(m))
    check("clock reports stage ACTIVE", m.get("participant_stage") == "active", str(m.get("participant_stage")))

    s, mis = rpc("fn_daily_mission", {"p_enrolment": st["enrol"]}, war)
    check("Today recommends Day 1",
          mis.get("curriculum", {}).get("day_no") == 1, str(mis.get("curriculum"))[:120])
    check("Today reports accessible_day 1, not 16", mis.get("accessible_day") == 1, str(mis.get("accessible_day")))

    s, sub1 = rpc("fn_submit_task", {"p_enrolment": st["enrol"], "p_day": 1,
                                     "p_response": "smoke day 1", "p_reflection": "ok"}, war)
    check("Day 1 opens and accepts a submission", s == 200 and sub1, f"{s} {sub1}")
    s, _ = rpc("fn_submit_task", {"p_enrolment": st["enrol"], "p_day": 2,
                                  "p_response": "should fail", "p_reflection": ""}, war)
    denied("Day 2 submit rejected server-side", s, str(_)[:110])
    s, _ = rpc("fn_submit_task", {"p_enrolment": st["enrol"], "p_day": 16,
                                  "p_response": "should fail", "p_reflection": ""}, war)
    denied("Day 16 (cohort day) submit rejected server-side", s, str(_)[:110])
    s, _ = call("/task_submissions", "POST",
                {"enrolment_id": st["enrol"], "day_no": 16, "status": "submitted", "response": "forged"},
                {**war, "Prefer": "return=representation"})
    denied("direct table insert for Day 16 rejected", s, str(_)[:90])

    print("\n=== COACH SCOPING ===")
    s, pod = rpc("fn_coach_pod", {}, cch)
    mine = [p for p in (pod or []) if p["participant_id"] == st["warrior"][0]] if isinstance(pod, list) else []
    check("assigned coach sees the warrior", len(mine) == 1, str(pod)[:120])
    check("pod separates cohort day 16 from their day 1",
          mine and mine[0]["cohort_day"] == 16 and mine[0]["accessible_day"] == 1, str(mine)[:160])
    s, pod2 = rpc("fn_coach_pod", {}, oth)
    theirs = [p for p in (pod2 or []) if p["participant_id"] == st["warrior"][0]] if isinstance(pod2, list) else []
    check("UNRELATED coach cannot see the warrior", len(theirs) == 0, str(pod2)[:120])
    s, _ = rpc("fn_review_detail", {"p_submission": sub1}, oth)
    denied("unrelated coach cannot open the evidence", s, str(_)[:90])
    s, det = rpc("fn_review_detail", {"p_submission": sub1}, cch)
    check("assigned coach can open the evidence", isinstance(det, dict) and det.get("day"), str(det)[:110])
    s, ev = call(f"/evidence_assets?submission_id=eq.{sub1}&select=id", headers=oth)
    check("unrelated coach reads zero evidence rows", ev == [], str(ev)[:90])

    print("\n=== ADMIN SURFACES ===")
    s, h = rpc("fn_programme_health", {"p_country": "ID"}, adm)
    check("Command HQ health loads and counts real warriors",
          isinstance(h, dict) and h.get("warriors", 0) >= 2, str(h)[:140])
    s, cand = rpc("fn_admin_enrolable", {"p_country": "ID"}, adm)
    check("Enrolment picker loads candidates", isinstance(cand, list) and len(cand) > 0, str(cand)[:90])
    check("already-enrolled warriors are flagged, not offered twice",
          isinstance(cand, list) and any(c["id"] == TARY and c["live_enrolment"] for c in cand),
          "tary not flagged as live_enrolment")

    print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
    for f in FAIL:
        print("  FAILED: " + f)
    return 1 if FAIL else 0


def teardown():
    st = json.load(open(STATE))
    call(f"/points_ledger?cohort_id=eq.{st['cohort']}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    call(f"/cohorts?id=eq.{st['cohort']}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    ids = [st[k][0] for k in ("admin", "warrior", "coach", "other")]
    # PASS 1 — drop every dependent row for ALL users before deleting any profile.
    # Deleting per-user in a loop fails: the admin granted roles to the coach, so
    # user_roles.granted_by still points at the admin when its turn comes.
    for uid in ids:
        for tbl in ("ch_notification_sends?recipient", "points_ledger?user_id", "user_badges?user_id",
                    "ch_lead_activities?participant_id",
                    "ch_closings?participant_id", "ch_appointments?participant_id", "ch_leads?participant_id",
                    "coach_assignments?participant_id", "coach_assignments?coach_id",
                    "user_roles?user_id", "notifications?to_agent"):
            call(f"/{tbl}=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    # PASS 2 — release soft references these accounts hold on rows that survive
    for uid in ids:
        call(f"/user_roles?granted_by=eq.{uid}", "PATCH", {"granted_by": None}, {**svc, "Prefer": "return=minimal"})
        call(f"/coach_assignments?assigned_by=eq.{uid}", "PATCH", {"assigned_by": None}, {**svc, "Prefer": "return=minimal"})
    # PASS 3 — now the profiles can go
    for uid in ids:
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]} not deleted: {r}")
        s2, r2 = call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
        if s2 >= 400:
            print(f"  WARN auth user {uid[:8]} not deleted: {r2}")
    left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)[1]
    print(f"  agtest profiles remaining: {left}")
    os.remove(STATE)
    print("  mirror removed")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "verify"
    sys.exit({"setup": setup, "verify": verify, "teardown": teardown}[cmd]() or 0)
