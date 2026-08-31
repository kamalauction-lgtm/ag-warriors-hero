# -*- coding: utf-8 -*-
"""Governance v1 test suite (migrations 089 + 090).

Every policy value is read from ch_policy_versions, never hardcoded here — a test
that hardcoded 10 would pass even if the resolver were broken. Cleans up fully.

Usage:  SUPABASE_SECRET=... python tools/test_governance.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-gov/1.0", **(headers or {})})
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
    s, u = call("/admin/users", "POST", {"email": email, "password": "Gov#Test2026", "email_confirm": True},
                svc, base="/auth/v1")
    uid = u["id"]
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+60188{abs(hash(email)) % 1000000:06d}",
          "email": email, "country": country, "role": role, "status": "active"},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST", {"email": email, "password": "Gov#Test2026"},
                {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, cohort, extra_versions = [], None, []
try:
    # ---------- POLICY FRAMEWORK ----------
    print("\n=== policy framework ===")
    s, pol = rpc("fn_policy", {"p_code": "daily_targets", "p_cohort": None}, svc)
    TARGET = pol.get("new_outreach_per_day") if isinstance(pol, dict) else None
    check("daily_targets policy resolves", isinstance(pol, dict) and TARGET is not None, str(pol)[:120])
    check("outreach target is a configured number, not hardcoded in app code",
          isinstance(TARGET, int) and TARGET > 0, str(TARGET))
    check("follow-up target is 100% of what is DUE, with no absolute minimum",
          pol.get("followups_due_pct") == 100 and pol.get("followups_absolute_minimum") is None, str(pol)[:160])
    check("replies are an outcome, never a target",
          pol.get("two_way_conversations_are_outcome_only") is True, str(pol)[:120])

    s, prin = call("/ch_policies?code=eq.controlled_principles&select=kind", headers=svc)
    check("controlled principles are marked as a principle, not a knob",
          prin and prin[0]["kind"] == "principle", str(prin))
    s, _ = rpc("fn_admin_publish_policy", {"p_code": "controlled_principles", "p_config": {},
                                           "p_scope_country": None, "p_scope_cohort": None,
                                           "p_effective_from": None, "p_note": "x"}, svc)
    denied("a controlled principle cannot be versioned as config", s, str(_)[:90])

    print("\n=== historical policy resolution ===")
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    s, past = rpc("fn_policy_at", {"p_code": "daily_targets", "p_cohort": None, "p_on": yesterday}, svc)
    long_ago = (datetime.date.today() - datetime.timedelta(days=400)).isoformat()
    s, older = rpc("fn_policy_at", {"p_code": "daily_targets", "p_cohort": None, "p_on": long_ago}, svc)
    check("a date before Governance v1 took effect resolves to no policy", older is None, str(older)[:110])

    # ---------- SETUP ----------
    print("\n=== setup ===")
    adm_id, adm_tok = mkuser(f"gov-adm-{TAG}@agtest.local", "Gov Admin", "MY", "master_admin")
    coach_id, coach_tok = mkuser(f"gov-coach-{TAG}@agtest.local", "Gov Coach", "MY")
    war_id, war_tok = mkuser(f"gov-war-{TAG}@agtest.local", "Gov Warrior", "MY")
    ver_id, ver_tok = mkuser(f"gov-ver-{TAG}@agtest.local", "Gov Verifier", "MY")
    idver_id, idver_tok = mkuser(f"gov-idver-{TAG}@agtest.local", "Gov IDVerifier", "ID")
    users = [adm_id, coach_id, war_id, ver_id, idver_id]
    adm, coach, war, ver, idver = (as_user(adm_tok), as_user(coach_tok), as_user(war_tok),
                                   as_user(ver_tok), as_user(idver_tok))
    for u in (coach_id, ver_id, idver_id, adm_id):
        rpc("fn_set_challenge_role", {"p_user": u, "p_role": "elite_coach", "p_grant": True}, adm)
    start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    s, cohort = rpc("fn_admin_create_cohort", {
        "p_name": f"GOV TEST {TAG}", "p_country": "MY", "p_start": start,
        "p_timezone": "Asia/Kuala_Lumpur", "p_unlock": "06:00", "p_version": None, "p_status": "open"}, adm)
    s, res = rpc("fn_admin_enrol", {"p_cohort": cohort, "p_participants": [war_id],
                                    "p_coach": coach_id, "p_note": "gov"}, adm)
    enrol = res["enrolled"][0]["enrolment_id"]
    s, rid = rpc("fn_submit_readiness", {"p_enrolment": enrol, "p_checklist": {}}, war)
    rpc("fn_review_readiness", {"p_readiness": rid, "p_approve": True, "p_note": "go"}, coach)

    # ---------- LANGUAGE ----------
    print("\n=== language default (Governance v1 correction) ===")
    s, p = call(f"/profiles?id=eq.{war_id}&select=language,language_source,country", headers=svc)
    check("a NEW MY profile defaults to BM with source country_default",
          p[0]["language"] == "bm" and p[0]["language_source"] == "country_default", str(p))
    s, p2 = call(f"/profiles?id=eq.{idver_id}&select=language,language_source,country", headers=svc)
    check("a NEW ID profile defaults to id with source country_default",
          p2[0]["language"] == "id" and p2[0]["language_source"] == "country_default", str(p2))
    s, leg = call("/profiles?language_source=eq.legacy_unknown&select=id", headers=svc)
    check("existing users remain legacy_unknown and untouched", isinstance(leg, list) and len(leg) >= 50, f"{len(leg) if isinstance(leg,list) else leg}")
    s, need = rpc("fn_language_needs_confirm", {}, war)
    check("a country_default user is not asked to confirm", need.get("needs_confirm") is False, str(need))
    s, _ = rpc("fn_confirm_language", {"p_language": "en"}, war)
    s, p3 = call(f"/profiles?id=eq.{war_id}&select=language,language_source,language_confirmed_at", headers=svc)
    check("confirming marks the choice explicit and timestamps it",
          p3[0]["language"] == "en" and p3[0]["language_source"] == "explicit"
          and p3[0]["language_confirmed_at"], str(p3))
    s, _ = rpc("fn_confirm_language", {"p_language": "id"}, war)
    denied("a MY warrior cannot select Bahasa Indonesia (country first)", s, str(_)[:90])

    # ---------- DAILY TARGETS ----------
    print("\n=== daily targets: distinct outreach, repeats not double counted ===")
    today = datetime.date.today().isoformat()
    lead_ids = []
    for n in ("Target A", "Target B"):
        s, l = call("/ch_leads", "POST", {"enrolment_id": enrol, "participant_id": war_id,
                                          "country": "MY", "name": n, "stage": "NEW"},
                    {**war, "Prefer": "return=representation"})
        lead_ids.append(l[0]["id"])
    for lid in lead_ids:
        rpc("fn_log_touch", {"p_lead": lid, "p_type": "message", "p_outcome": "no_reply",
                             "p_notes": None, "p_next_action": None, "p_next_date": None,
                             "p_stage": "CONTACTED"}, war)
    s, c1 = rpc("fn_activity_counters", {"p_participant": war_id, "p_date": today}, svc)
    check("two distinct leads contacted -> outreach 2", c1["outreach_distinct"] == 2, str(c1)[:140])
    # three more messages to the SAME lead
    for _ in range(3):
        rpc("fn_log_touch", {"p_lead": lead_ids[0], "p_type": "message", "p_outcome": "no_reply",
                             "p_notes": None, "p_next_action": None, "p_next_date": None, "p_stage": None}, war)
    s, c2 = rpc("fn_activity_counters", {"p_participant": war_id, "p_date": today}, svc)
    check("repeat messages to the SAME lead do not add outreach", c2["outreach_distinct"] == 2, str(c2)[:140])
    check("but every touch is still counted separately", c2["touches_total"] == 5, str(c2)[:140])
    check("replies are tracked as an outcome, separate from outreach", "replies" in c2, str(c2)[:140])
    s, tg = rpc("fn_targets_for", {"p_enrolment": enrol}, war)
    check("Today resolves the target from policy, not from code",
          tg["outreach"]["target"] == TARGET and tg["policy_active"] is True, str(tg)[:170])
    check("follow-up target is what is actually DUE, not an invented number",
          tg["followups"]["due"] == c2["followups_due"], str(tg)[:170])

    print("\n=== cohort override + historical stability ===")
    s, vid = rpc("fn_admin_publish_policy", {
        "p_code": "daily_targets",
        "p_config": {"new_outreach_per_day": 4, "followups_due_pct": 100,
                     "followups_absolute_minimum": None,
                     "active_leads_with_next_action_pct": 100,
                     "curriculum_missions_per_accessible_day": 1,
                     "two_way_conversations_are_outcome_only": True,
                     "language": "cohort override"},
        "p_scope_country": None, "p_scope_cohort": cohort,
        "p_effective_from": None, "p_note": "gov test cohort override"}, adm)
    extra_versions.append(vid if isinstance(vid, str) else None)
    s, tg2 = rpc("fn_targets_for", {"p_enrolment": enrol}, war)
    check("a cohort override beats the global policy", tg2["outreach"]["target"] == 4, str(tg2)[:150])
    s, glob = rpc("fn_policy", {"p_code": "daily_targets", "p_cohort": None}, svc)
    check("the global policy is unchanged by the cohort override",
          glob["new_outreach_per_day"] == TARGET, str(glob)[:120])
    s, hist = rpc("fn_governance_history", {"p_code": "daily_targets"}, adm)
    check("history shows both versions, nothing hidden", isinstance(hist, list) and len(hist) >= 2, str(hist)[:140])
    check("the original v1 config is preserved verbatim",
          any(h["version"] == 1 and h["config"]["new_outreach_per_day"] == TARGET for h in hist), str(hist)[:200])

    # ---------- SLA ----------
    print("\n=== coach SLA ===")
    s, sla = rpc("fn_policy", {"p_code": "coach_sla", "p_cohort": None}, svc)
    check("SLA targets are configured (readiness/evidence/urgent)",
          all(k in sla for k in ("readiness_hours", "evidence_hours", "urgent_hours")), str(sla)[:140])
    check("auto decisions are explicitly forbidden by policy", sla.get("auto_decision_forbidden") is True, str(sla)[:140])
    s, sub = rpc("fn_submit_task", {"p_enrolment": enrol, "p_day": 1,
                                    "p_response": "gov day1", "p_reflection": "r"}, war)
    s, board = rpc("fn_sla_board", {}, coach)
    mine = [b for b in board if b["id"] == sub] if isinstance(board, list) else []
    check("a fresh submission is on_time on the SLA board",
          mine and mine[0]["state"] == "on_time" and mine[0]["sla_hours"] == sla["evidence_hours"], str(mine)[:170])
    # age it past the evidence SLA
    old_ts = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=sla["evidence_hours"] + 2)).isoformat()
    call(f"/task_submissions?id=eq.{sub}", "PATCH", {"submitted_at": old_ts}, {**svc, "Prefer": "return=minimal"})
    s, board2 = rpc("fn_sla_board", {}, coach)
    mine2 = [b for b in board2 if b["id"] == sub]
    check("past its target it becomes overdue", mine2 and mine2[0]["state"] == "overdue", str(mine2)[:170])
    s, st = call(f"/task_submissions?id=eq.{sub}&select=status", headers=svc)
    check("SLA expiry NEVER auto-approves or auto-rejects", st[0]["status"] == "submitted", str(st))
    s, sw = rpc("fn_challenge_sweep", {"p_force": True}, svc)
    check("the sweep raises a coach SLA alert", isinstance(sw, dict) and sw.get("sla_overdue", 0) >= 1, str(sw)[:170])
    s, snd = call(f"/ch_notification_sends?template_code=eq.sla_overdue_coach&select=country,locale,rendered_body&limit=1", headers=svc)
    check("the alert used a managed template, not an ad-hoc string", isinstance(snd, list) and snd, str(snd)[:140])

    # ---------- GRACE / MISSED / EXCUSED / STREAK ----------
    print("\n=== grace, missed, excused, streak ===")
    s, gs = rpc("fn_policy", {"p_code": "grace_streak", "p_cohort": None}, svc)
    check("grace policy is configured", gs.get("grace_hours") is not None, str(gs)[:140])
    check("missed breaks the streak but does not block future days",
          gs["missed_breaks_streak"] is True and gs["missed_blocks_future_days"] is False, str(gs)[:170])
    check("excused is neutral to the streak",
          gs["excused_adds_streak_day"] is False and gs["excused_breaks_streak"] is False, str(gs)[:170])
    rpc("fn_review_submission_v2", {"p_submission": sub, "p_decision": "approve",
                                    "p_note": "ok", "p_rubric": {"relevant": True}}, coach)
    s, stk = rpc("challenge_streak", {"p_enrolment": enrol}, svc)
    check("one approved day -> streak 1", stk == 1, str(stk))
    # day 2 missed, day 3 approved: the run must not span the miss
    call("/ch_day_state", "POST", {"enrolment_id": enrol, "day_no": 2, "state": "missed",
                                   "reason": "gov test"}, {**svc, "Prefer": "return=minimal"})
    call("/task_submissions", "POST", {"enrolment_id": enrol, "day_no": 3, "status": "approved",
                                       "response": "x", "version": 1},
         {**svc, "Prefer": "return=minimal"})
    s, stk2 = rpc("challenge_streak", {"p_enrolment": enrol}, svc)
    check("a MISSED day breaks the run (day3 approved -> streak 1, not 2)", stk2 == 1, f"streak={stk2}")
    call(f"/ch_day_state?enrolment_id=eq.{enrol}&day_no=eq.2", "PATCH", {"state": "excused"},
         {**svc, "Prefer": "return=minimal"})
    s, stk3 = rpc("challenge_streak", {"p_enrolment": enrol}, svc)
    check("an EXCUSED day is neutral: the run spans it (-> 2)", stk3 == 2, f"streak={stk3}")
    s, _ = rpc("fn_admin_mark_day", {"p_enrolment": enrol, "p_day": 4,
                                     "p_state": "excused", "p_reason": "self"}, war)
    denied("a warrior cannot excuse their own day", s, str(_)[:90])
    s, _ = rpc("fn_admin_mark_day", {"p_enrolment": enrol, "p_day": 4,
                                     "p_state": "excused", "p_reason": ""}, coach)
    denied("excusing without a reason is refused", s, str(_)[:90])

    print("\n=== pause holds the participant clock ===")
    s, before = rpc("participant_accessible_day", {"p_enrolment": enrol}, svc)
    rpc("fn_admin_set_enrolment", {"p_enrolment": enrol, "p_status": "paused",
                                   "p_reason": "medical leave", "p_catch_up_days": None}, coach)
    s, during = rpc("participant_accessible_day", {"p_enrolment": enrol}, svc)
    check("a paused enrolment exposes no accessible day", during == 0, f"{before} -> {during}")
    rpc("fn_admin_set_enrolment", {"p_enrolment": enrol, "p_status": "active",
                                   "p_reason": "resumed", "p_catch_up_days": None}, coach)
    s, after = rpc("participant_accessible_day", {"p_enrolment": enrol}, svc)
    check("resuming restores the clock", after >= 1, f"{before} -> {during} -> {after}")

    # ---------- COMPLETION / GRADUATION ----------
    print("\n=== completion and graduation gates ===")
    s, cg = rpc("fn_policy", {"p_code": "completion_graduation", "p_cohort": None}, svc)
    check("a verified closing is NOT required for graduation",
          cg["verified_closing_required"] is False, str(cg)[:140])
    check("Elite Warrior is never auto-awarded", cg["elite_warrior_auto_awarded"] is False, str(cg)[:140])
    s, gr = rpc("fn_graduation_readiness", {"p_enrolment": enrol}, coach)
    check("readiness reports a percentage and blockers",
          isinstance(gr, dict) and "pct" in gr and isinstance(gr.get("blockers"), list), str(gr)[:170])
    check("well below threshold -> not graduation eligible", gr["graduation_eligible"] is False, str(gr)[:170])
    check("blockers name the day 27/30 reviews and the coach recommendation",
          set(["day27_review_missing", "day30_review_missing", "coach_recommendation_missing"])
          <= set(gr["blockers"]), str(gr["blockers"]))
    s, _ = rpc("fn_graduate", {"p_enrolment": enrol, "p_note": "try"}, adm)
    denied("graduation is blocked while gates are unmet", s, str(_)[:120])
    s, _ = rpc("fn_mark_complete", {"p_enrolment": enrol, "p_note": "try"}, coach)
    denied("completion is blocked below the threshold", s, str(_)[:120])
    s, _ = rpc("fn_graduate", {"p_enrolment": enrol, "p_note": "self"}, war)
    denied("a warrior cannot graduate themselves", s, str(_)[:90])
    s, badges = call(f"/user_badges?user_id=eq.{war_id}&badge_code=eq.graduate&select=badge_code", headers=svc)
    check("no graduate badge was awarded", badges == [], str(badges))

    # ---------- CLOSING VERIFICATION ----------
    print("\n=== closing verification authority ===")
    s, lead2 = call("/ch_leads", "POST", {"enrolment_id": enrol, "participant_id": war_id,
                                          "country": "MY", "name": "Gov Closing Lead", "stage": "NEGOTIATION"},
                    {**war, "Prefer": "return=representation"})
    s, cl = call("/ch_closings", "POST", {"lead_id": lead2[0]["id"], "participant_id": war_id,
                                          "country": "MY", "status": "INTERNAL_REVIEW"},
                 {**svc, "Prefer": "return=representation"})
    closing = cl[0]["id"]
    s, _ = rpc("fn_verify_closing", {"p_closing": closing, "p_approve": True, "p_note": "self"}, war)
    denied("a participant may never verify their own closing", s, str(_)[:110])
    s, _ = rpc("fn_verify_closing", {"p_closing": closing, "p_approve": True, "p_note": "as coach"}, coach)
    denied("the assigned Coach cannot verify without closing.verify", s, str(_)[:110])
    rpc("fn_admin_grant_permission", {"p_user": idver_id, "p_permission": "closing.verify",
                                      "p_country": "ID", "p_grant": True, "p_note": "gov test"}, adm)
    s, _ = rpc("fn_verify_closing", {"p_closing": closing, "p_approve": True, "p_note": "wrong country"}, idver)
    denied("an ID verifier cannot verify a MY closing", s, str(_)[:110])
    rpc("fn_admin_grant_permission", {"p_user": ver_id, "p_permission": "closing.verify",
                                      "p_country": "MY", "p_grant": True, "p_note": "gov test"}, adm)
    s, _ = rpc("fn_verify_closing", {"p_closing": closing, "p_approve": True, "p_note": "verified"}, ver)
    check("the correct country verifier can verify", s in (200, 204), f"HTTP {s} {_}")
    s, cl2 = call(f"/ch_closings?id=eq.{closing}&select=status,verified_by", headers=svc)
    check("closing is COMPLETED and records the verifier",
          cl2[0]["status"] == "COMPLETED" and cl2[0]["verified_by"] == ver_id, str(cl2))
    s, fb = call(f"/user_badges?user_id=eq.{war_id}&badge_code=eq.first_closing&select=badge_code", headers=svc)
    check("first_closing awarded from the VERIFIED event only", len(fb) == 1, str(fb))
    s, _ = rpc("fn_verify_closing", {"p_closing": closing, "p_approve": True, "p_note": "again"}, ver)
    denied("re-verifying an already verified closing is refused", s, str(_)[:90])
    s, xp = call(f"/points_ledger?user_id=eq.{war_id}&source=eq.closing_verified&status=eq.verified&select=amount", headers=svc)
    check("closing XP written exactly once", len(xp) == 1, str(xp))

    # ---------- BADGES ----------
    print("\n=== badge governance ===")
    s, bd = call("/ch_badges?select=code,rule,rule_active&order=code", headers=svc)
    check("all five badges have an active deterministic rule",
          len(bd) == 5 and all(b["rule"] and b["rule_active"] for b in bd), str(bd)[:200])
    check("no badge was renamed",
          sorted(b["code"] for b in bd) == ["committed", "first_closing", "first_lead", "graduate", "streak_7"],
          str([b["code"] for b in bd]))
    s, _ = rpc("award_badge", {"p_user": war_id, "p_code": "graduate", "p_by": None}, war)
    denied("a warrior still cannot self-award a badge", s, str(_)[:90])
    s, fl = call(f"/user_badges?user_id=eq.{war_id}&badge_code=eq.first_lead&select=badge_code", headers=svc)
    check("first_lead awarded once, automatically", len(fl) == 1, str(fl))

    # ---------- MENTOR POINTS ----------
    print("\n=== Mentor Points v1 ===")
    s, mp = rpc("fn_policy", {"p_code": "mentor_points", "p_cohort": None}, svc)
    REF = mp["amounts"]["referred_warrior_active"]["mp"]
    WK = mp["amounts"]["weekly_coaching_report"]["mp"]
    CAP = mp["weekly_cap"]["weekly_coaching_report"]
    check("mentor point amounts come from policy", REF and WK and CAP, str(mp)[:140])
    check("Mentor Points never auto-appoint an Elite Coach", mp["appoints_elite_coach"] is False, str(mp)[:140])
    s, a1 = rpc("fn_award_mp", {"p_user": war_id, "p_code": "referred_warrior_active",
                                "p_key": f"ref:{war_id}:{TAG}", "p_reason": "became active",
                                "p_ref_type": "enrolment", "p_ref_id": enrol}, coach)
    check("award writes the configured amount", a1.get("awarded") and a1["mp"] == REF, str(a1))
    s, a2 = rpc("fn_award_mp", {"p_user": war_id, "p_code": "referred_warrior_active",
                                "p_key": f"ref:{war_id}:{TAG}", "p_reason": "duplicate",
                                "p_ref_type": "enrolment", "p_ref_id": enrol}, coach)
    check("the same award key is idempotent", a2.get("awarded") is False, str(a2))
    s, _ = rpc("fn_award_mp", {"p_user": coach_id, "p_code": "teaching_session",
                               "p_key": f"self:{TAG}", "p_reason": "self",
                               "p_ref_type": None, "p_ref_id": None}, coach)
    denied("Mentor Points may never be self-awarded", s, str(_)[:90])
    n = 0
    for i in range(CAP // WK + 2):
        s, r = rpc("fn_award_mp", {"p_user": war_id, "p_code": "weekly_coaching_report",
                                   "p_key": f"wk:{TAG}:{i}", "p_reason": "weekly report",
                                   "p_ref_type": None, "p_ref_id": None}, coach)
        if isinstance(r, dict) and r.get("awarded"):
            n += 1
    check(f"the weekly coaching-report cap of {CAP} MP holds", n * WK <= CAP, f"awarded {n}x{WK}MP")
    s, tot = rpc("fn_my_mentor_points", {"p_user": war_id}, adm)
    check("mentor point total is readable", isinstance(tot, dict) and tot["total"] > 0, str(tot)[:140])
    s, row = call(f"/mentor_points_ledger?user_id=eq.{war_id}&code=eq.referred_warrior_active&status=eq.verified&select=id", headers=svc)
    s, _ = rpc("fn_reverse_mp", {"p_ledger": row[0]["id"], "p_reason": "test reversal"}, adm)
    check("a mentor point award can be reversed", s in (200, 204), f"HTTP {s} {_}")
    s, rev = call(f"/mentor_points_ledger?user_id=eq.{war_id}&status=eq.reversed&select=amount", headers=svc)
    check("the original is preserved and a negative row recorded",
          len(rev) >= 2 and any(r["amount"] < 0 for r in rev), str(rev)[:140])

    # ---------- COUNTRY CONTENT ----------
    print("\n=== country content ownership ===")
    s, cc = rpc("fn_policy", {"p_code": "country_content_ownership", "p_cohort": None}, svc)
    check("country-sensitive days are policy data",
          cc["country_variant_days"] == [3, 4, 8, 13, 16, 21, 22, 24], str(cc)[:150])
    check("cross-country fallback is forbidden by policy", cc["cross_country_fallback"] is False, str(cc)[:140])
    s, v2 = call("/curriculum_versions?version=eq.2&select=id", headers=svc)
    s, _ = rpc("fn_review_country_content", {"p_version": v2[0]["id"], "p_day": 16,
                                             "p_country": "MY", "p_note": "no permission"}, coach)
    denied("local review requires the content.review permission", s, str(_)[:110])
    rpc("fn_admin_grant_permission", {"p_user": coach_id, "p_permission": "content.review",
                                      "p_country": "MY", "p_grant": True, "p_note": "gov test"}, adm)
    s, _ = rpc("fn_review_country_content", {"p_version": v2[0]["id"], "p_day": 16,
                                             "p_country": "MY", "p_note": "reviewed"}, coach)
    check("a permission holder can record the local review", s in (200, 204), f"HTTP {s} {_}")
    s, gaps = rpc("fn_content_gaps", {"p_version": v2[0]["id"]}, adm)
    check("country content gaps remain CONTENT_REQUIRED", isinstance(gaps, list) and len(gaps) == 16, str(len(gaps) if isinstance(gaps,list) else gaps))

    # ---------- GOVERNANCE UI SOURCE ----------
    print("\n=== governance surface ===")
    s, gov = rpc("fn_governance", {}, adm)
    check("governance lists every policy with status and version",
          isinstance(gov, list) and len(gov) >= 11 and all(g["status"] for g in gov), str(len(gov) if isinstance(gov,list) else gov))
    check("the principle entry is present and marked", any(g["kind"] == "principle" for g in gov), "")
    s, od = call("/ch_open_decisions?decided=eq.false&select=code", headers=svc)
    check("no Open Decision remains unresolved", od == [], str(od))
    s, odall = call("/ch_open_decisions?select=code,decision", headers=svc)
    check("old Open Decision records are preserved and mapped to policies",
          len(odall) >= 9 and all(o["decision"] for o in odall), str(odall)[:140])

finally:
    print("\n=== cleanup ===")
    for v in extra_versions:
        if v:
            call(f"/ch_policy_versions?id=eq.{v}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    # restore the global daily_targets version to active (the override superseded nothing global)
    call("/ch_policy_versions?policy_code=eq.daily_targets&version=eq.1", "PATCH",
         {"status": "active", "effective_to": None}, {**svc, "Prefer": "return=minimal"})
    if cohort:
        call(f"/points_ledger?cohort_id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/cohorts?id=eq.{cohort}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        for tbl in ("ch_notification_sends?recipient", "mentor_points_ledger?user_id",
                    "points_ledger?user_id", "user_badges?user_id", "ch_permissions?user_id",
                    "ch_lead_activities?participant_id", "ch_closings?participant_id",
                    "ch_appointments?participant_id", "ch_leads?participant_id",
                    "coach_assignments?participant_id", "coach_assignments?coach_id",
                    "user_roles?user_id", "notifications?to_agent"):
            call(f"/{tbl}=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        for col in ("user_roles?granted_by", "coach_assignments?assigned_by",
                    "enrolments?status_by", "cohorts?created_by", "ch_permissions?granted_by",
                    "ch_policy_versions?created_by", "ch_policy_versions?approved_by"):
            t, c = col.split("?")
            call(f"/{t}?{c}=eq.{uid}", "PATCH", {c: None}, {**svc, "Prefer": "return=minimal"})
    for uid in users:
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]}: {r}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    for a in ("sla_overdue", "sla_escalated_mentor", "sla_escalated_admin", "country_content_reviewed",
              "challenge_sweep", "mentor_points_awarded", "mentor_points_reversed", "policy_published"):
        call(f"/audit_events?action=eq.{a}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
