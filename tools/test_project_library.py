# -*- coding: utf-8 -*-
"""Tests for the Project Library (migration 100).

Proves: admins curate resources; agents read only their country's projects;
a 'granted' resource is hidden until the agent has an approved m4u_grant; the
storage path never leaks to a non-member; clients cannot write the table
directly. Disposable mirror data only.

Usage:  SUPABASE_SECRET=... python tools/test_project_library.py
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
        headers={"Content-Type": "application/json", "User-Agent": "ag-lib-test/1.0", **(headers or {})})
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
users, prop_id, res_ids = [], None, []


def mkuser(email, name, country, role="agent"):
    s, u = call("/admin/users", "POST",
                {"email": email, "password": "Lib#Test2026", "email_confirm": True}, svc, base="/auth/v1")
    if not isinstance(u, dict):
        sys.exit(f"could not create {email}: {u}")
    uid = u["id"]; users.append(uid)
    call("/profiles", "POST",
         {"id": uid, "name": name, "phone": f"+6019{abs(hash(email)) % 10000000:07d}",
          "email": email, "country": country, "role": role, "status": "active", "onboarded": True},
         {**svc, "Prefer": "return=minimal"})
    s, t = call("/token?grant_type=password", "POST",
                {"email": email, "password": "Lib#Test2026"}, {"apikey": ANON}, base="/auth/v1")
    return uid, t["access_token"]


try:
    print("\n=== fixture ===")
    adm_id, adm_tok = mkuser(f"lib-adm-{TAG}@agtest.local", "Lib Admin", "MY", "master_admin")
    my_id, my_tok = mkuser(f"lib-my-{TAG}@agtest.local", "Lib MY Agent", "MY")
    gr_id, gr_tok = mkuser(f"lib-gr-{TAG}@agtest.local", "Lib Granted Agent", "MY")
    id_id, id_tok = mkuser(f"lib-id-{TAG}@agtest.local", "Lib ID Agent", "ID")
    adm, my, gr, idu = as_user(adm_tok), as_user(my_tok), as_user(gr_tok), as_user(id_tok)

    s, p = call("/m4u_properties", "POST", {"country": "MY", "name": f"LIB TEST {TAG}", "type": "property"}, svc_r)
    prop_id = p[0]["id"]
    # gr has an approved grant for the project; my does not
    call("/m4u_grants", "POST", {"agent_id": gr_id, "property_id": prop_id, "approved": True, "active": True},
         {**svc, "Prefer": "return=minimal"})
    print(f"  project {prop_id} · granted agent + ungranted agent + ID agent")

    print("\n=== admin curation ===")
    s, r = rpc("fn_admin_set_project_resource", {
        "p_id": None, "p_property": prop_id, "p_kind": "note", "p_title": "How to pitch",
        "p_description": None, "p_storage_path": None, "p_file_type": None, "p_file_size": None,
        "p_url": None, "p_body": "Lead with the location.", "p_visibility": "all", "p_sort": 0}, adm)
    check("admin adds a public instruction", isinstance(r, dict) and r.get("ok"), str(r)[:120])
    res_ids.append(r["id"])
    s, r2 = rpc("fn_admin_set_project_resource", {
        "p_id": None, "p_property": prop_id, "p_kind": "link", "p_title": "Price list",
        "p_description": None, "p_storage_path": None, "p_file_type": None, "p_file_size": None,
        "p_url": "https://example.com/prices.pdf", "p_body": None, "p_visibility": "granted", "p_sort": 1}, adm)
    check("admin adds a granted-only link", isinstance(r2, dict) and r2.get("ok"), str(r2)[:120])
    res_ids.append(r2["id"])

    s, _ = rpc("fn_admin_set_project_resource", {
        "p_id": None, "p_property": prop_id, "p_kind": "link", "p_title": "bad",
        "p_description": None, "p_storage_path": None, "p_file_type": None, "p_file_size": None,
        "p_url": "not-a-url", "p_body": None, "p_visibility": "all", "p_sort": 2}, adm)
    denied("a link without an http URL is refused", s)
    s, _ = rpc("fn_admin_set_project_resource", {
        "p_id": None, "p_property": prop_id, "p_kind": "note", "p_title": "x",
        "p_description": None, "p_storage_path": None, "p_file_type": None, "p_file_size": None,
        "p_url": None, "p_body": "y", "p_visibility": "all", "p_sort": 0}, my)
    denied("a plain agent cannot add resources", s)

    print("\n=== agent visibility ===")
    s, lib = rpc("fn_project_library", {}, my)
    mine = [x for x in (lib or []) if x["property_id"] == prop_id]
    check("the MY agent sees the project in the library", len(mine) == 1, str(lib)[:160])
    check("the ungranted agent's count EXCLUDES the granted link",
          mine and mine[0]["resource_count"] == 1, str(mine)[:140])

    s, res_my = rpc("fn_project_resources", {"p_property": prop_id}, my)
    titles_my = {x["title"] for x in (res_my or [])}
    check("ungranted agent sees the public note", "How to pitch" in titles_my, str(titles_my))
    check("ungranted agent does NOT see the granted link", "Price list" not in titles_my, str(titles_my))

    s, res_gr = rpc("fn_project_resources", {"p_property": prop_id}, gr)
    titles_gr = {x["title"] for x in (res_gr or [])}
    check("the GRANTED agent sees BOTH", {"How to pitch", "Price list"} <= titles_gr, str(titles_gr))

    s, lib_id = rpc("fn_project_library", {}, idu)
    check("the ID agent does NOT see this MY project",
          not any(x["property_id"] == prop_id for x in (lib_id or [])), str(lib_id)[:140])
    s, res_id = rpc("fn_project_resources", {"p_property": prop_id}, idu)
    check("the ID agent sees no resources for a MY project", res_id == [], str(res_id)[:120])

    print("\n=== the table itself is not client-writable ===")
    s, _ = call("/project_resources", "POST",
                {"property_id": prop_id, "country": "MY", "kind": "note", "title": "forged", "body": "x"}, my)
    denied("an agent cannot INSERT a resource directly", s)
    s, direct = call(f"/project_resources?property_id=eq.{prop_id}&select=storage_path", headers=idu)
    check("an ID agent reading the table directly gets nothing",
          direct == [] or (isinstance(direct, dict) and "code" in direct), str(direct)[:120])

    print("\n=== file-path guard (worker uses this) ===")
    # register a fake file resource, then check who may resolve its path
    s, rf = rpc("fn_admin_set_project_resource", {
        "p_id": None, "p_property": prop_id, "p_kind": "file", "p_title": "Brochure",
        "p_description": None, "p_storage_path": f"MY/{prop_id}/brochure.pdf",
        "p_file_type": "application/pdf", "p_file_size": 12345,
        "p_url": None, "p_body": None, "p_visibility": "granted", "p_sort": 3}, adm)
    fid = rf["id"]; res_ids.append(fid)
    s, path_gr = rpc("fn_project_file_path", {"p_resource": fid}, gr)
    check("a granted agent can resolve the file path", isinstance(path_gr, str) and path_gr.endswith("brochure.pdf"), str(path_gr))
    s, _ = rpc("fn_project_file_path", {"p_resource": fid}, my)
    denied("an ungranted agent cannot resolve a granted file's path", s)
    s, _ = rpc("fn_project_file_path", {"p_resource": fid}, idu)
    denied("an out-of-country agent cannot resolve the path", s)

    print("\n=== delete ===")
    s, d = rpc("fn_admin_delete_project_resource", {"p_id": res_ids[0]}, adm)
    check("admin can delete a resource", isinstance(d, dict) and d.get("ok"), str(d)[:120])
    res_ids.pop(0)
    s, _ = rpc("fn_admin_delete_project_resource", {"p_id": res_ids[0]}, my)
    denied("a plain agent cannot delete", s)

finally:
    print("\n=== teardown ===")
    for rid in res_ids:
        call(f"/project_resources?id=eq.{rid}", "DELETE", headers=svc)
    if prop_id:
        call(f"/project_resources?property_id=eq.{prop_id}", "DELETE", headers=svc)
        call(f"/m4u_grants?property_id=eq.{prop_id}", "DELETE", headers=svc)
        call(f"/m4u_properties?id=eq.{prop_id}", "DELETE", headers=svc)
    for _ in range(2):
        for uid in users:
            call(f"/audit_events?actor=eq.{uid}", "DELETE", headers=svc)
            call(f"/profiles?id=eq.{uid}", "DELETE", headers=svc)
    for uid in users:
        call(f"/admin/users/{uid}", "DELETE", headers=svc, base="/auth/v1")
    s, lu = call("/profiles?email=like.lib-*agtest.local*&select=email", headers=svc)
    check("no test account residue", lu == [], str(lu))

    print(f"\n{'=' * 60}\nPASS {len(PASS)}   FAIL {len(FAIL)}")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)
