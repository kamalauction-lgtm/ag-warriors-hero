# -*- coding: utf-8 -*-
"""Tests for group invite links + invite log (migration 096).

What matters: only admins touch links, garbage links are refused before they
can be mass-sent, country scope holds, the invite log actually remembers, and
a plain agent can see none of it. Disposable data only.

Usage:  SUPABASE_SECRET=... python tools/test_invites.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-inv-test/1.0", **(headers or {})})
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
users, link_ids, lead_id = [], [], None


def mkuser(email, name, country, role):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Inv#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Inv#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


try:
    print("\n=== fixture ===")
    adm_id, adm_tok = mkuser(f"inv-adm-{TAG}@agtest.local", "Inv Master", "MY", "master_admin")
    cadm_id, cadm_tok = mkuser(f"inv-cadm-{TAG}@agtest.local", "Inv ID Admin", "ID", "country_admin")
    agt_id, agt_tok = mkuser(f"inv-agt-{TAG}@agtest.local", "Inv Agent", "MY", "agent")
    adm, cadm, agt = as_user(adm_tok), as_user(cadm_tok), as_user(agt_tok)
    s, ld = call("/m4u_leads", "POST",
                 {"country": "MY", "name": "Invite Testee", "phone_norm": f"+60111{TAG}"}, svc_r)
    lead_id = ld[0]["id"]
    print(f"  3 disposable accounts + lead {lead_id}")

    print("\n=== link management ===")
    s, r = rpc("fn_admin_set_invite_link",
               {"p_country": "MY", "p_kind": "whatsapp", "p_label": f"TEST WA MY {TAG}",
                "p_url": "https://chat.whatsapp.com/AbCdEf12345", "p_active": True, "p_id": None}, adm)
    check("master admin adds a WhatsApp link", isinstance(r, dict) and r.get("ok"), str(r)[:140])
    link_ids.append(r["id"])
    s, r2 = rpc("fn_admin_set_invite_link",
                {"p_country": "MY", "p_kind": "telegram", "p_label": f"TEST TG MY {TAG}",
                 "p_url": "https://t.me/+Ab-Cd_Ef12345", "p_active": True, "p_id": None}, adm)
    check("master admin adds a Telegram link", isinstance(r2, dict) and r2.get("ok"), str(r2)[:140])
    link_ids.append(r2["id"])

    s, _ = rpc("fn_admin_set_invite_link",
               {"p_country": "MY", "p_kind": "whatsapp", "p_label": "bad",
                "p_url": "https://example.com/not-an-invite", "p_active": True, "p_id": None}, adm)
    denied("a non-WhatsApp URL is refused for a WhatsApp link", s)
    s, _ = rpc("fn_admin_set_invite_link",
               {"p_country": "MY", "p_kind": "telegram", "p_label": "bad",
                "p_url": "https://telegram-scam.example/x", "p_active": True, "p_id": None}, adm)
    denied("a non-t.me URL is refused for a Telegram link", s)
    s, _ = rpc("fn_admin_set_invite_link",
               {"p_country": "MY", "p_kind": "whatsapp", "p_label": "sneaky",
                "p_url": "https://chat.whatsapp.com/Zz999", "p_active": True, "p_id": None}, agt)
    denied("a plain agent cannot add links", s)
    s, _ = rpc("fn_admin_set_invite_link",
               {"p_country": "MY", "p_kind": "whatsapp", "p_label": "cross",
                "p_url": "https://chat.whatsapp.com/Yy888", "p_active": True, "p_id": None}, cadm)
    denied("an ID country admin cannot manage MY links", s)

    print("\n=== reading the context ===")
    s, ctx = rpc("fn_invite_context", {"p_country": "MY", "p_leads": [lead_id]}, adm)
    links = (ctx or {}).get("links", []) if isinstance(ctx, dict) else []
    check("context returns both links", len([l for l in links if str(TAG) in l["label"]]) == 2, str(links)[:200])
    check("nobody is marked invited yet", (ctx or {}).get("invited") == [], str(ctx)[:140])
    s, _ = rpc("fn_invite_context", {"p_country": "MY", "p_leads": []}, agt)
    denied("a plain agent cannot read the invite context", s)
    s, _ = rpc("fn_invite_context", {"p_country": "MY", "p_leads": []}, cadm)
    denied("an ID country admin cannot read MY context", s)
    s, _ = call(f"/invite_links?select=url", "GET", None, agt)
    sread, direct = call("/invite_links?select=url", headers=agt)
    check("the table itself is invisible to clients",
          direct == [] or (isinstance(direct, dict) and "code" in direct), str(direct)[:120])

    print("\n=== the invite log ===")
    s, r = rpc("fn_log_group_invite", {"p_lead": lead_id, "p_country": "MY"}, adm)
    check("an invite is recorded", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    s, ctx = rpc("fn_invite_context", {"p_country": "MY", "p_leads": [lead_id]}, adm)
    inv = (ctx or {}).get("invited", [])
    check("the context now says this lead was invited",
          any(x["lead_id"] == lead_id for x in inv), str(inv)[:140])
    s, r = rpc("fn_log_group_invite", {"p_lead": lead_id, "p_country": "MY"}, adm)
    check("inviting again refreshes rather than erroring", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    s, logrow = call(f"/group_invite_log?lead_id=eq.{lead_id}&select=links_sent,invited_by", headers=svc)
    check("the exact links sent are kept on the record",
          logrow and len(logrow[0]["links_sent"]) == 2 and logrow[0]["invited_by"] == adm_id, str(logrow)[:180])
    s, _ = rpc("fn_log_group_invite", {"p_lead": lead_id, "p_country": "MY"}, agt)
    denied("a plain agent cannot log invites", s)
    s, _ = rpc("fn_log_group_invite", {"p_lead": 99999999, "p_country": "MY"}, adm)
    denied("an unknown lead is refused", s)

    # switching links off empties the message source, and logging then refuses
    for lid in link_ids:
        rpc("fn_admin_set_invite_link",
            {"p_country": "MY", "p_kind": "whatsapp", "p_label": "off", "p_url": "https://chat.whatsapp.com/AbCdEf12345",
             "p_active": False, "p_id": lid}, adm)
    s, ld2 = call("/m4u_leads", "POST",
                  {"country": "MY", "name": "Second Testee", "phone_norm": f"+60112{TAG}"}, svc_r)
    lead2 = ld2[0]["id"]
    s, _ = rpc("fn_log_group_invite", {"p_lead": lead2, "p_country": "MY"}, adm)
    denied("with every link switched off, an invite cannot be logged", s)
    call(f"/m4u_leads?id=eq.{lead2}", "DELETE", headers=svc)

finally:
    print("\n=== teardown ===")
    if lead_id:
        call(f"/group_invite_log?lead_id=eq.{lead_id}", "DELETE", headers=svc)
        call(f"/m4u_leads?id=eq.{lead_id}", "DELETE", headers=svc)
    for lid in link_ids:
        call(f"/invite_links?id=eq.{lid}", "DELETE", headers=svc)
    for _ in range(2):
        for uid in users:
            call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
            call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")
    s, l1 = call("/invite_links?label=like.TEST%20*&select=label", headers=svc)
    check("no test link residue", l1 == [], str(l1))
    s, l2 = call("/profiles?email=like.inv-*agtest.local*&select=email", headers=svc)
    check("no test account residue", l2 == [], str(l2))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
