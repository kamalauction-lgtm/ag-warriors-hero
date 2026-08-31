# -*- coding: utf-8 -*-
"""Tests for replacing a certificate after revocation (migration 093).

The rules being proved:
  * a revoked certificate STAYS revoked and stays publicly verifiable as revoked
  * a replacement can still be issued, with its own new number
  * the replacement may use a template chosen for that certificate alone
  * the event's own template setting is never touched by a per-certificate choice
  * a participant never appears twice in the eligibility list
  * numbers are never reused
  * 078's event-level wording overrides survive the rewrite of cert_issue

Builds its own event, session, template, lead and roster row, then removes all
of it. It never touches a real event.

Usage:  SUPABASE_SECRET=... python tools/test_cert_reissue.py
Requires 093 to have been applied.
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-cert-test/1.0", **(headers or {})})
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
svc_r = {**svc, "Prefer": "return=representation"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    check(name + "  (expected-denied)", isinstance(status, int) and status >= 400, f"HTTP {status} {detail}")


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, ev_id, sess_id, lead_id, tpl_ids, cert_ids = [], None, None, None, [], []


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Cert#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Cert#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


def mktemplate(country, name):
    s, t = call("/certificate_templates", "POST",
                {"country": country, "name": name, "orientation": "landscape",
                 "status": "active", "current_version": 1}, svc_r)
    if not isinstance(t, list):
        sys.exit(f"template create failed: {t}")
    tid = t[0]["id"]
    tpl_ids.append(tid)
    s, v = call("/certificate_template_versions", "POST",
                {"template_id": tid, "version": 1, "layout_json": {}, "text_json": {"body": name},
                 "assets_json": {}, "signatories_json": []}, svc_r)
    if not isinstance(v, list):
        sys.exit(f"template version create failed: {v}")
    return tid, v[0]["id"]


def cert(cid):
    s, c = call(f"/issued_certificates?id=eq.{cid}"
                "&select=id,status,certificate_number,template_version_id,superseded_by,reissue_of,"
                "revoke_reason,recipient_name,snapshot_json", headers=svc)
    return c[0] if isinstance(c, list) and c else {"err": c}


try:
    print("\n=== fixture ===")
    adm_id, adm_tok = mkuser(f"cert-adm-{TAG}@agtest.local", "Cert Admin", "ID", "master_admin")
    out_id, out_tok = mkuser(f"cert-out-{TAG}@agtest.local", "Cert Outsider", "ID", "agent")
    adm, out = as_user(adm_tok), as_user(out_tok)

    tpl_a, ver_a = mktemplate("ID", f"TEST Default {TAG}")
    tpl_b, ver_b = mktemplate("ID", f"TEST Alternate {TAG}")
    tpl_my, ver_my = mktemplate("MY", f"TEST Wrong Country {TAG}")

    s, e = call("/events", "POST",
                {"country": "ID", "slug": f"test-cert-{TAG}", "title": f"TEST CERT EVENT {TAG}",
                 "kind": "recruitment", "status": "published"}, svc_r)
    ev_id = e[0]["id"]
    s, ss = call("/bop_sessions", "POST",
                 {"event_id": ev_id, "country": "ID", "title": "Test session", "type": "online",
                  "starts_at": datetime.datetime.now(datetime.UTC).isoformat(), "active": True}, svc_r)
    sess_id = ss[0]["id"]
    s, ld = call("/m4u_leads", "POST",
                 {"country": "ID", "name": "Test Recipient", "phone_norm": f"+62999{TAG}",
                  "custom_fields": {"email": f"cert-recipient-{TAG}@agtest.local"}}, svc_r)
    lead_id = ld[0]["id"]
    call("/bop_roster", "POST",
         {"session_id": sess_id, "lead_id": lead_id, "attended": "attended"}, {**svc, "Prefer": "return=minimal"})
    call("/event_certificate_configs", "POST",
         {"event_id": ev_id, "enabled": True, "template_version_id": ver_a, "language": "id-ID",
          "overrides_json": {"event_title": "WORDING OVERRIDE TITLE", "details_line": "WORDING OVERRIDE LINE"}},
         {**svc, "Prefer": "return=minimal"})
    print(f"  event {ev_id[:8]} · session {sess_id} · lead {lead_id} · 2 ID templates + 1 MY template")

    # ---------------------------------------------------------------- issue
    print("\n=== issue the original ===")
    s, r = rpc("cert_issue", {"p_session": sess_id, "p_lead": lead_id,
                              "p_name_override": None, "p_override_reason": None}, adm)
    check("the 4-argument cert_issue still works after the rewrite",
          isinstance(r, dict) and r.get("ok") and r.get("certificate_number"), str(r)[:160])
    c1 = r["certificate_id"]; n1 = r["certificate_number"]; cert_ids.append(c1)
    row1 = cert(c1)
    check("it used the event's default template", row1["template_version_id"] == ver_a, str(row1)[:120])

    snap = row1.get("snapshot_json") or {}
    check("078's event_title override survived the cert_issue rewrite",
          snap.get("event_title_override") == "WORDING OVERRIDE TITLE", str(snap.get("event_title_override")))
    check("078's details_line override survived the cert_issue rewrite",
          snap.get("details_line") == "WORDING OVERRIDE LINE", str(snap.get("details_line")))

    s, again = rpc("cert_issue", {"p_session": sess_id, "p_lead": lead_id,
                                  "p_name_override": None, "p_override_reason": None}, adm)
    check("issuing twice returns the live certificate, it does not mint a second",
          isinstance(again, dict) and again.get("already") and again["certificate_id"] == c1, str(again)[:140])

    # ---------------------------------------------------------------- revoke
    print("\n=== revoke ===")
    s, _ = rpc("cert_revoke", {"p_cert": c1, "p_reason": "wrong name printed"}, adm)
    check("revoke succeeds", cert(c1)["status"] == "revoked", str(cert(c1))[:120])
    s, ver = rpc("certificate_verify_number", {"p_number": n1}, {"apikey": ANON})
    check("public verification of that number says revoked",
          isinstance(ver, dict) and ver.get("status") == "revoked", str(ver)[:160])

    # ---------------------------------------------------------------- THE FIX
    print("\n=== replace the revoked certificate, on a chosen template ===")
    s, rep = rpc("cert_reissue_v2", {"p_cert": c1, "p_new_name": "Corrected Recipient",
                                     "p_reason": "replacement after revocation",
                                     "p_template_version": ver_b}, adm)
    check("a revoked certificate can be replaced", isinstance(rep, dict) and rep.get("ok"), str(rep)[:200])
    c2 = rep["certificate_id"]; n2 = rep["certificate_number"]; cert_ids.append(c2)
    row1, row2 = cert(c1), cert(c2)

    check("THE OLD ONE STAYS REVOKED — it is not quietly turned into 'superseded'",
          row1["status"] == "revoked", str(row1)[:140])
    check("the revoke reason is still on record", row1["revoke_reason"] == "wrong name printed", str(row1)[:140])
    check("the replacement has a different number", n2 != n1, f"{n1} vs {n2}")
    check("the replacement is live", row2["status"] == "issued", str(row2)[:120])
    check("the replacement used the CHOSEN template, not the event default",
          row2["template_version_id"] == ver_b, str(row2)[:140])
    check("the name correction was applied", row2["recipient_name"] == "Corrected Recipient", str(row2)[:140])
    check("the old certificate points at its replacement", row1["superseded_by"] == c2, str(row1)[:140])
    check("the replacement points back at what it replaced", row2["reissue_of"] == c1, str(row2)[:140])
    check("the reported previous status is the truth", rep.get("previous_status") == "revoked", str(rep)[:160])

    s, ver = rpc("certificate_verify_number", {"p_number": n1}, {"apikey": ANON})
    check("the revoked number STILL verifies as revoked after the replacement exists",
          isinstance(ver, dict) and ver.get("status") == "revoked", str(ver)[:160])
    s, ver2 = rpc("certificate_verify_number", {"p_number": n2}, {"apikey": ANON})
    check("the replacement number verifies as valid",
          isinstance(ver2, dict) and ver2.get("status") == "issued", str(ver2)[:160])

    s, cfg = call(f"/event_certificate_configs?event_id=eq.{ev_id}&select=template_version_id", headers=svc)
    check("choosing a template for one certificate did NOT change the event's setting",
          cfg[0]["template_version_id"] == ver_a, str(cfg))

    # ---------------------------------------------------------------- the list
    print("\n=== the participant list stays one row per person ===")
    s, el = rpc("cert_eligibility", {"p_event": ev_id}, adm)
    rows = el if isinstance(el, list) else []
    mine = [x for x in rows if x["lead_id"] == lead_id]
    check("the person appears exactly once, not once per certificate", len(mine) == 1, f"{len(mine)} rows")
    check("the list shows the LIVE certificate, not the revoked one",
          mine and mine[0]["certificate_number"] == n2, str(mine)[:160])
    check("the list says what this certificate replaced",
          mine and mine[0]["replaces_number"] == n1, str(mine)[:160])
    check("the list counts the earlier revocation",
          mine and mine[0]["revoked_count"] == 1, str(mine)[:160])

    # ---------------------------------------------------------------- guards
    print("\n=== guards ===")
    s, _ = rpc("cert_reissue_v2", {"p_cert": c2, "p_new_name": None, "p_reason": "x",
                                   "p_template_version": ver_my}, adm)
    denied("a template from another country is refused", s)
    s, _ = rpc("cert_reissue_v2", {"p_cert": c2, "p_new_name": None, "p_reason": "",
                                   "p_template_version": None}, adm)
    denied("a reason is required", s)
    s, _ = rpc("cert_reissue_v2", {"p_cert": c2, "p_new_name": None, "p_reason": "no rights",
                                   "p_template_version": None}, out)
    denied("a plain agent cannot reissue anything", s)
    s, _ = rpc("cert_template_choices", {"p_event": ev_id}, out)
    denied("a plain agent cannot list template choices", s)

    s, ch = rpc("cert_template_choices", {"p_event": ev_id}, adm)
    ids = [x["template_version_id"] for x in ch] if isinstance(ch, list) else []
    check("template choices offer both ID templates", ver_a in ids and ver_b in ids, str(ids))
    check("template choices exclude the MY template", ver_my not in ids, str(ids))
    check("the event default is flagged",
          any(x["template_version_id"] == ver_a and x["is_event_default"] for x in (ch or [])), str(ch)[:200])

    # ---------------------------------------------------------------- correction path
    print("\n=== ordinary reissue of a LIVE certificate still supersedes ===")
    s, rep2 = rpc("cert_reissue_v2", {"p_cert": c2, "p_new_name": "Third Name",
                                      "p_reason": "another spelling fix", "p_template_version": None}, adm)
    c3 = rep2["certificate_id"]; n3 = rep2["certificate_number"]; cert_ids.append(c3)
    check("a live certificate becomes superseded, not revoked", cert(c2)["status"] == "superseded", str(cert(c2))[:140])
    check("the third certificate falls back to the event default template",
          cert(c3)["template_version_id"] == ver_a, str(cert(c3))[:140])
    check("three distinct numbers were minted, none reused", len({n1, n2, n3}) == 3, f"{n1} {n2} {n3}")

    s, el = rpc("cert_eligibility", {"p_event": ev_id}, adm)
    mine = [x for x in (el or []) if x["lead_id"] == lead_id]
    check("still exactly one row after a revoked + a superseded + a live certificate",
          len(mine) == 1 and mine[0]["certificate_number"] == n3, f"{len(mine)} rows {str(mine)[:120]}")

    s, dup = call("/issued_certificates?select=session_id,lead_id,status&status=neq.superseded"
                  f"&session_id=eq.{sess_id}", headers=svc)
    check("exactly one LIVE certificate exists for this attendance",
          sum(1 for x in dup if x["status"] == "issued") == 1, str(dup))

finally:
    print("\n=== teardown ===")
    for cid in cert_ids:
        call(f"/certificate_email_deliveries?certificate_id=eq.{cid}", "DELETE", headers=svc)
    call(f"/issued_certificates?event_id=eq.{ev_id}", "DELETE", headers=svc) if ev_id else None
    if sess_id:
        call(f"/bop_roster?session_id=eq.{sess_id}", "DELETE", headers=svc)
        call(f"/bop_sessions?id=eq.{sess_id}", "DELETE", headers=svc)
    if lead_id:
        call(f"/m4u_leads?id=eq.{lead_id}", "DELETE", headers=svc)
    if ev_id:
        call(f"/event_certificate_configs?event_id=eq.{ev_id}", "DELETE", headers=svc)
        call(f"/events?id=eq.{ev_id}", "DELETE", headers=svc)
    for tid in tpl_ids:
        call(f"/certificate_template_versions?template_id=eq.{tid}", "DELETE", headers=svc)
        call(f"/certificate_templates?id=eq.{tid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")

    s, left = call(f"/events?slug=like.test-cert-*&select=slug", headers=svc)
    check("no test event residue", left == [], str(left))
    s, lt = call("/certificate_templates?name=like.TEST%20*&select=name", headers=svc)
    check("no test template residue", lt == [], str(lt))
    s, lu = call("/profiles?email=like.cert-*agtest.local*&select=email", headers=svc)
    check("no test account residue", lu == [], str(lu))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
