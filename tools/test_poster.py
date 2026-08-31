# -*- coding: utf-8 -*-
"""Tests for Win Poster publishing (migration 095 + worker /poster/*).

What matters here is that a poster announcing someone's closing cannot reach the
wrong country's team, cannot be sent by someone without leadership authority,
and cannot carry a number the model invented.

Usage:  SUPABASE_SECRET=... python tools/test_poster.py
Requires 095 applied and the worker deployed.
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://zlbyfgfublqlrsqohvsn.supabase.co")
WORKER = os.environ.get("WORKER_URL", "https://m4u-api.iqiaggroup.workers.dev")
SVC = os.environ.get("SUPABASE_SECRET")
ANON = os.environ.get("SUPABASE_ANON", "sb_publishable_fNAsKQFCXCDsjWJP-KnCRQ_ZYFRZQiv")
if not SVC:
    sys.exit("SUPABASE_SECRET is required")

# Two different agents on purpose. Cloudflare rejects urllib's default in front
# of the worker, while Supabase REFUSES a secret key from anything that looks
# like a browser ("Forbidden use of secret API key in browser") — so the browser
# agent is used only for worker calls.
UA_API = "ag-poster-test/1.0"
UA_WORKER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
PASS, FAIL = [], []


def call(path, method="GET", body=None, headers=None, base="/rest/v1", root=None, _try=0):
    ua = UA_WORKER if root else UA_API
    req = urllib.request.Request(
        (root or URL) + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": ua, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw[:300]
    except urllib.error.URLError:
        if _try < 3:
            time.sleep(1.5 * (_try + 1))
            return call(path, method, body, headers, base, root, _try + 1)
        raise


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
svc_r = {**svc, "Prefer": "return=representation"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)
work = lambda path, body, tok: call(path, "POST", body, {"Authorization": f"Bearer {tok}"}, base="", root=WORKER)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))


def denied(name, status, detail=""):
    check(name + "  (expected-denied)", isinstance(status, int) and status >= 400, f"HTTP {status} {detail}")


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users, channels = [], []


def mkuser(email, name, country, role, rank="REN", elite=False):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Post#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]
    users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active",
          "onboarded": True, "career_rank": rank, "is_elite": elite},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Post#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


try:
    print("\n=== who may publish ===")
    adm_id, adm_tok = mkuser(f"po-adm-{TAG}@agtest.local", "Poster Master", "MY", "master_admin")
    my_id, my_tok = mkuser(f"po-my-{TAG}@agtest.local", "MY Leader", "MY", "leader")
    id_id, id_tok = mkuser(f"po-id-{TAG}@agtest.local", "ID Leader", "ID", "leader")
    ren_id, ren_tok = mkuser(f"po-ren-{TAG}@agtest.local", "Plain Warrior", "MY", "agent")
    adm, myl, idl, ren = as_user(adm_tok), as_user(my_tok), as_user(id_tok), as_user(ren_tok)

    for label, hdr, want in (("master admin", adm, True), ("leader", myl, True), ("plain REN agent", ren, False)):
        s, v = rpc("can_publish_poster", {}, hdr)
        check(f"{label} may publish: {want}", v is want, f"got {v}")

    print("\n=== destinations are admin-managed and validated ===")
    s, r = rpc("fn_admin_set_poster_channel",
               {"p_country": "MY", "p_label": f"TEST MY {TAG}", "p_chat_id": "-1001111111111",
                "p_active": True, "p_id": None}, adm)
    check("admin can add a destination", isinstance(r, dict) and r.get("ok"), str(r)[:140])
    channels.append(r["id"])
    s, r2 = rpc("fn_admin_set_poster_channel",
                {"p_country": "ID", "p_label": f"TEST ID {TAG}", "p_chat_id": "-1002222222222",
                 "p_active": True, "p_id": None}, adm)
    channels.append(r2["id"])

    s, _ = rpc("fn_admin_set_poster_channel",
               {"p_country": "MY", "p_label": "bad", "p_chat_id": "not-a-chat-id",
                "p_active": True, "p_id": None}, adm)
    denied("a malformed chat id is refused at save time, not at send time", s)
    s, _ = rpc("fn_admin_set_poster_channel",
               {"p_country": "MY", "p_label": "sneaky", "p_chat_id": "-1003333333333",
                "p_active": True, "p_id": None}, myl)
    denied("a leader cannot add destinations", s)

    print("\n=== a leader sees ONLY their own country's group ===")
    s, ctx = rpc("fn_poster_context", {}, myl)
    labels = [c["label"] for c in (ctx or {}).get("channels", [])] if isinstance(ctx, dict) else []
    check("MY leader sees the MY group", any(f"TEST MY {TAG}" == l for l in labels), str(labels))
    check("MY leader does NOT see the ID group", not any(f"TEST ID {TAG}" == l for l in labels), str(labels))

    s, ctx_id = rpc("fn_poster_context", {}, idl)
    labels_id = [c["label"] for c in (ctx_id or {}).get("channels", [])] if isinstance(ctx_id, dict) else []
    check("ID leader sees only the ID group",
          any(f"TEST ID {TAG}" == l for l in labels_id) and not any(f"TEST MY {TAG}" == l for l in labels_id),
          str(labels_id))

    s, ctx_a = rpc("fn_poster_context", {}, adm)
    labels_a = [c["label"] for c in (ctx_a or {}).get("channels", [])] if isinstance(ctx_a, dict) else []
    check("master admin sees both", f"TEST MY {TAG}" in labels_a and f"TEST ID {TAG}" in labels_a, str(labels_a))

    s, _ = rpc("fn_poster_context", {}, ren)
    denied("a plain agent cannot read the publishing context", s)

    s, rows = call(f"/poster_channels?id=eq.{channels[1]}&select=id,chat_id", headers=myl)
    check("a MY leader cannot read the ID group's row directly either",
          rows == [] or (isinstance(rows, dict) and "code" in rows), str(rows)[:140])

    print("\n=== the client cannot write the tables ===")
    s, _ = call("/poster_channels", "POST",
                {"country": "MY", "label": "self-added", "chat_id": "-1004444444444"}, myl)
    denied("a leader cannot INSERT a destination directly", s)
    s, _ = call("/poster_posts", "POST",
                {"country": "MY", "caption": "fake log row"}, myl)
    denied("a leader cannot forge a send record", s)

    print("\n=== AI captions ===")
    s, cap = work("/poster/caption",
                  {"deal": "EXSIM", "lang": "EN", "agent": "Nury Rahman",
                   "pod": "ALPHA", "project": "EXSIM Residensi"}, my_tok)
    ok = isinstance(cap, dict) and len(cap.get("captions", [])) == 3
    check("a leader gets three captions", ok, str(cap)[:200])
    if ok:
        print(f"        source = {cap.get('generated_by')}")
        for c in cap["captions"]:
            # console here is cp1252; caption emoji would raise mid-suite
            print("        - " + c.encode("ascii", "replace").decode())
        joined = " ".join(cap["captions"])
        check("the agent's name is used", "Nury" in joined, joined[:160])
        check("no banned promise language",
              not re.search(r"guarantee|dijamin|pasti untung|100%|risk[- ]free", joined, re.I), joined[:160])

    s, cap2 = work("/poster/caption",
                   {"deal": "SALE", "lang": "EN", "agent": "Test Agent", "pod": "BRAVO",
                    "project": "Sunway Velocity", "price": "RM 1,250,000"}, my_tok)
    if isinstance(cap2, dict) and cap2.get("captions"):
        joined2 = " ".join(cap2["captions"])
        check("a price passed in is NOT printed into the caption",
              "1,250,000" not in joined2 and "1250000" not in joined2, joined2[:200])

    s, _ = work("/poster/caption", {"deal": "EXSIM", "lang": "EN", "agent": "X"}, ren_tok)
    denied("a plain agent cannot generate captions", s)

    print("\n=== sending ===")
    png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
           "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    s, out = work("/poster/send",
                  {"channel_id": channels[1], "caption": "cross-country attempt",
                   "image": png, "meta": {"nation": "MY"}}, my_tok)
    check("a MY leader cannot send into the ID group",
          s >= 400, f"HTTP {s} {str(out)[:120]}")

    s, out = work("/poster/send",
                  {"channel_id": channels[0], "caption": "", "image": png, "meta": {}}, my_tok)
    denied("an empty caption is refused", s)

    s, out = work("/poster/send",
                  {"channel_id": channels[0], "caption": "no image", "image": "not-a-data-url", "meta": {}}, my_tok)
    denied("a malformed image is refused", s)

    s, out = work("/poster/send",
                  {"channel_id": channels[0], "caption": "authorised attempt",
                   "image": png, "meta": {"nation": "MY", "deal": "EXSIM", "agent": "Nury"}}, ren_tok)
    denied("a plain agent cannot send at all", s)

    s, out = work("/poster/send",
                  {"channel_id": channels[0], "caption": "real attempt to a fake group",
                   "image": png, "meta": {"nation": "MY", "deal": "EXSIM", "agent": "Nury",
                                          "caption_source": "ai"}}, my_tok)
    if s == 503:
        check("without a bot token the worker says so plainly, and sends nothing",
              isinstance(out, dict) and "not connected" in str(out.get("error", "")).lower(), str(out)[:160])
        print("        (TELEGRAM_BOT_TOKEN is not set yet — this is the expected state)")
    else:
        check("a send to a non-existent group fails and is recorded, not silently dropped",
              s >= 400, f"HTTP {s} {str(out)[:140]}")
        s2, logged = call(f"/poster_posts?channel_id=eq.{channels[0]}&select=status,error,nation,caption_source",
                          headers=svc)
        check("the failed send is written to poster_posts with a reason",
              isinstance(logged, list) and logged and logged[0]["status"] == "failed" and logged[0]["error"],
              str(logged)[:200])
        check("the poster's branded nation is recorded alongside the channel",
              logged and logged[0]["nation"] == "MY", str(logged)[:160])

finally:
    print("\n=== teardown ===")
    for ch in channels:
        call(f"/poster_posts?channel_id=eq.{ch}", "DELETE", headers=svc)
        call(f"/poster_channels?id=eq.{ch}", "DELETE", headers=svc)
    for uid in users:
        call(f"/poster_posts?sent_by=eq.{uid}", "DELETE", headers=svc)
        call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
    # profiles are referenced by audit_events.actor and poster_*.created_by /
    # sent_by, so dependents must all be gone before the profile row will drop.
    # Two passes, then verify — an earlier run left four accounts behind because
    # it deleted once and trusted it.
    for _ in range(2):
        for uid in users:
            call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")
    s, left = call("/poster_channels?label=like.TEST%20*&select=label", headers=svc)
    check("no test destination residue", left == [], str(left))
    s, lu = call("/profiles?email=like.po-*agtest.local*&select=email", headers=svc)
    check("no test account residue", lu == [], str(lu))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
