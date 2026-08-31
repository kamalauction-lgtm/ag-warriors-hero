# -*- coding: utf-8 -*-
"""Tests for Command Radio (migration 099).

Proves the walls hold: you only see your country's War Room and your own pods'
squads; a DM reaches only its two people and pushes the recipient; nobody can
post to a channel they don't belong to or forge a message as someone else;
unread counts and mark-read behave. Disposable mirror data only.

Usage:  SUPABASE_SECRET=... python tools/test_komunikasi.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-comms-test/1.0", **(headers or {})})
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
users, pod_id = [], None


def mkuser(email, name, country, role="agent"):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Cm#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]; users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Cm#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


def overview(hdr):
    s, o = rpc("fn_comms_overview", {}, hdr)
    return o if isinstance(o, list) else []


try:
    print("\n=== fixture: two MY (one in a pod) + one ID ===")
    a_id, a_tok = mkuser(f"cm-a-{TAG}@agtest.local", "CM Alpha", "MY")
    b_id, b_tok = mkuser(f"cm-b-{TAG}@agtest.local", "CM Bravo", "MY")
    z_id, z_tok = mkuser(f"cm-z-{TAG}@agtest.local", "CM Zulu", "ID")
    A, B, Z = as_user(a_tok), as_user(b_tok), as_user(z_tok)
    # a pod containing A only (B is not in it)
    s, pod = call("/pods", "POST", {"country": "MY", "name": f"CM POD {TAG}", "captain_id": a_id}, svc_r)
    pod_id = pod[0]["id"]
    call("/pod_members", "POST", {"pod_id": pod_id, "agent_id": a_id, "segment": "hijau"}, {**svc, "Prefer": "return=minimal"})

    print("\n=== channel visibility ===")
    oa = overview(A)
    kinds_a = {c["kind"] for c in oa}
    check("A sees a warroom and a squad", {"warroom", "squad"} <= kinds_a, str([c["title"] for c in oa]))
    war_my = next((c for c in oa if c["kind"] == "warroom"), None)
    squad = next((c for c in oa if c["kind"] == "squad"), None)

    ob = overview(B)
    check("B (same country, no pod) sees the warroom", any(c["kind"] == "warroom" for c in ob), str(ob)[:120])
    check("B does NOT see A's squad", not any(c.get("id") == (squad or {}).get("id") for c in ob), str(ob)[:160])

    oz = overview(Z)
    check("Z (ID) sees a DIFFERENT warroom than A (MY)",
          any(c["kind"] == "warroom" for c in oz)
          and next(c["id"] for c in oz if c["kind"] == "warroom") != war_my["id"], str(oz)[:140])

    print("\n=== posting rules ===")
    s, r = rpc("fn_comms_send", {"p_channel": war_my["id"], "p_body": "MY war room hello"}, A)
    check("A can post in the MY war room", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    s, _ = rpc("fn_comms_send", {"p_channel": war_my["id"], "p_body": "intruder"}, Z)
    denied("Z (ID) cannot post in the MY war room", s)
    s, _ = rpc("fn_comms_send", {"p_channel": squad["id"], "p_body": "not my squad"}, B)
    denied("B cannot post in a squad they are not in", s)
    s, _ = rpc("fn_comms_send", {"p_channel": war_my["id"], "p_body": ""}, A)
    denied("an empty message is refused", s)

    print("\n=== reading is walled too ===")
    s, seen = call(f"/comms_messages?channel_id=eq.{war_my['id']}&select=body", headers=Z)
    check("Z cannot read the MY war room's messages",
          seen == [] or (isinstance(seen, dict) and "code" in seen), str(seen)[:140])
    s, seen = call(f"/comms_messages?channel_id=eq.{war_my['id']}&select=body", headers=A)
    check("A can read the MY war room", isinstance(seen, list) and len(seen) >= 1, str(seen)[:120])

    print("\n=== direct messages ===")
    s, dm = rpc("fn_comms_start_dm", {"p_other": b_id}, A)
    check("A can start a DM with B (same country)", isinstance(dm, dict) and dm.get("ok"), str(dm)[:120])
    dm_id = dm["channel_id"]
    s, dm2 = rpc("fn_comms_start_dm", {"p_other": b_id}, A)
    check("starting the same DM again returns the SAME channel",
          isinstance(dm2, dict) and dm2.get("channel_id") == dm_id and dm2.get("existing") is True, str(dm2)[:120])
    s, _ = rpc("fn_comms_start_dm", {"p_other": z_id}, A)
    denied("A (MY) cannot DM Z (ID) — country wall", s)

    rpc("fn_comms_send", {"p_channel": dm_id, "p_body": "hey bravo"}, A)
    s, bview = call(f"/comms_messages?channel_id=eq.{dm_id}&select=body", headers=B)
    check("B receives the DM", isinstance(bview, list) and any(x["body"] == "hey bravo" for x in bview), str(bview)[:120])
    s, zview = call(f"/comms_messages?channel_id=eq.{dm_id}&select=body", headers=Z)
    check("Z cannot see someone else's DM",
          zview == [] or (isinstance(zview, dict) and "code" in zview), str(zview)[:120])
    s, notif = call(f"/notifications?to_agent=eq.{b_id}&type=eq.comms_dm&select=title,body", headers=svc)
    check("the DM raised a push notification for B",
          isinstance(notif, list) and any("hey bravo" in (n["body"] or "") for n in notif), str(notif)[:140])

    print("\n=== unread + mark read ===")
    # A posts twice in the DM; B's unread should be 2, then 0 after mark-read
    rpc("fn_comms_send", {"p_channel": dm_id, "p_body": "second"}, A)
    ob = overview(B)
    dm_b = next((c for c in ob if c["id"] == dm_id), None)
    check("B sees unread on the DM", dm_b and dm_b["unread"] >= 2, str(dm_b))
    s, tot = rpc("fn_comms_unread_total", {}, B)
    check("B's total unread counts them", isinstance(tot, int) and tot >= 2, str(tot))
    rpc("fn_comms_mark_read", {"p_channel": dm_id}, B)
    ob = overview(B)
    dm_b = next((c for c in ob if c["id"] == dm_id), None)
    check("after mark-read, the DM shows zero unread", dm_b and dm_b["unread"] == 0, str(dm_b))
    check("the SENDER never has unread of their own message",
          next((c["unread"] for c in overview(A) if c["id"] == dm_id), None) == 0, "A")

    print("\n=== client cannot forge ===")
    s, _ = call("/comms_messages", "POST",
                {"channel_id": war_my["id"], "sender_id": b_id, "body": "forged as bravo"}, A)
    denied("A cannot insert a message signed as B", s)
    s, _ = call("/comms_channels", "POST", {"kind": "warroom", "country": "MY", "title": "fake"}, A)
    denied("a client cannot create channels directly", s)

finally:
    print("\n=== teardown ===")
    for uid in users:
        s, chans = call(f"/comms_members?user_id=eq.{uid}&select=channel_id", headers=svc)
        for row in (chans if isinstance(chans, list) else []):
            call(f"/comms_messages?channel_id=eq.{row['channel_id']}", "DELETE", headers=svc)
            call(f"/comms_members?channel_id=eq.{row['channel_id']}", "DELETE", headers=svc)
            call(f"/comms_reads?channel_id=eq.{row['channel_id']}", "DELETE", headers=svc)
            call(f"/comms_channels?id=eq.{row['channel_id']}", "DELETE", headers=svc)
    if pod_id:
        s, sc = call(f"/comms_channels?pod_id=eq.{pod_id}&select=id", headers=svc)
        for row in (sc if isinstance(sc, list) else []):
            call(f"/comms_messages?channel_id=eq.{row['id']}", "DELETE", headers=svc)
            call(f"/comms_reads?channel_id=eq.{row['id']}", "DELETE", headers=svc)
            call(f"/comms_channels?id=eq.{row['id']}", "DELETE", headers=svc)
        call(f"/pod_members?pod_id=eq.{pod_id}", "DELETE", headers=svc)
        call(f"/pods?id=eq.{pod_id}", "DELETE", headers=svc)
    for uid in users:
        call(f"/comms_reads?user_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/comms_messages?sender_id=eq.{uid}", "DELETE", headers=svc)
        call(f"/notifications?to_agent=eq.{uid}", "DELETE", headers=svc)
    for _ in range(2):
        for uid in users:
            call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
            call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")

    s, lu = call("/profiles?email=like.cm-*agtest.local*&select=email", headers=svc)
    check("no test account residue", lu == [], str(lu))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
