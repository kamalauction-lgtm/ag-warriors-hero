# -*- coding: utf-8 -*-
"""Notification country/language resolution matrix + cross-country isolation.

The property that matters: a message resolves inside the recipient's OWN country,
in their own language, and can NEVER fall back across countries. MY English and
ID English are separate rows and must resolve independently.

Usage:  SUPABASE_SECRET=... python tools/test_notifications.py
Requires 085 + 086 + 087.
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


def call(path, method="GET", body=None, headers=None, base="/rest/v1", _try=0):
    req = urllib.request.Request(
        URL + base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "User-Agent": "ag-ntest/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")[:300]
    except urllib.error.URLError:
        # transient TLS/connection reset — retry, never silently report "empty"
        if _try < 3:
            import time
            time.sleep(1.5 * (_try + 1))
            return call(path, method, body, headers, base, _try + 1)
        raise


svc = {"apikey": SVC, "Authorization": f"Bearer {SVC}"}
as_user = lambda t: {"apikey": ANON, "Authorization": f"Bearer {t}"}
rpc = lambda fn, args, hdr: call(f"/rpc/{fn}", "POST", args, hdr)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    try:
        print(("  PASS  " if cond else "  FAIL  ") + name + (f"   [{detail}]" if detail and not cond else ""))
    except UnicodeEncodeError:
        print(("  PASS  " if cond else "  FAIL  ") + name.encode("ascii", "replace").decode())


def mkuser(email, name, country, lang, role="agent", explicit=True):
    """Governance v1: a profile insert WITHOUT language_source='explicit' takes the
    COUNTRY DEFAULT, whatever language is passed. Modelling a person who actually
    chose a language therefore means saying so — which is the real contract: only
    an explicit choice overrides the country default."""
    s, u = call("/admin/users", "POST", {"email": email, "password": "Ntest#2026", "email_confirm": True},
                svc, base="/auth/v1")
    uid = u["id"]
    body = {"id": uid, "name": name, "phone": f"+60199{abs(hash(email)) % 1000000:06d}",
            "email": email, "country": country, "language": lang, "role": role, "status": "active"}
    if explicit:
        body["language_source"] = "explicit"
    call("/profiles", "POST", body, {**svc, "Prefer": "return=minimal"})
    return uid


TAG = datetime.datetime.now(datetime.UTC).strftime("%H%M%S")
users = []
try:
    print("\n=== template inventory ===")
    s, t = call("/ch_notification_templates?select=code,variables", headers=svc)
    s, v = call("/ch_notification_template_versions?status=eq.published&select=template_code", headers=svc)
    s, tr = call("/ch_notification_template_translations?select=version_id,country,locale", headers=svc)
    check("every template has exactly one published version", len(t) == len(v), f"{len(t)} templates, {len(v)} published")
    check("every published version has all 4 country/locale rows", len(tr) == len(v) * 4, f"{len(tr)} translations")
    combos = {(x["country"], x["locale"]) for x in tr}
    check("the 4 combos are MY/ms-MY, MY/en, ID/id-ID, ID/en",
          combos == {("MY", "ms-MY"), ("MY", "en"), ("ID", "id-ID"), ("ID", "en")}, str(combos))
    check("no MY row carries an ID locale and vice versa",
          not any((c == "MY" and l == "id-ID") or (c == "ID" and l == "ms-MY") for c, l in combos), str(combos))

    print("\n=== resolution matrix (fn_resolve_notification) ===")
    CODE = "readiness_approved"
    matrix = [("MY", "ms-MY"), ("MY", "en"), ("ID", "id-ID"), ("ID", "en")]
    seen = {}
    for country, locale in matrix:
        s, r = rpc("fn_resolve_notification", {"p_code": CODE, "p_country": country, "p_locale": locale}, svc)
        row = r[0] if isinstance(r, list) and r else None
        ok = row and row["country"] == country and row["locale"] == locale
        check(f"{country} + {locale} resolves to its own row", ok, str(row)[:120])
        if row:
            seen[(country, locale)] = row["title"]

    check("MY ms-MY and ID id-ID are different content",
          seen.get(("MY", "ms-MY")) != seen.get(("ID", "id-ID")),
          f"{seen.get(('MY','ms-MY'))} vs {seen.get(('ID','id-ID'))}")
    check("MY en and ID en are SEPARATE rows (independently editable)",
          ("MY", "en") in seen and ("ID", "en") in seen, str(seen.keys()))

    print("\n=== in-country fallback ===")
    # temporarily remove ID/en for one template and confirm ID falls back to id-ID, never to MY
    s, vid = call(f"/ch_notification_template_versions?template_code=eq.{CODE}&status=eq.published&select=id", headers=svc)
    version_id = vid[0]["id"]
    s, keep = call(f"/ch_notification_template_translations?version_id=eq.{version_id}&country=eq.ID&locale=eq.en&select=*", headers=svc)
    saved = keep[0]
    call(f"/ch_notification_template_translations?version_id=eq.{version_id}&country=eq.ID&locale=eq.en",
         "DELETE", None, {**svc, "Prefer": "return=minimal"})
    s, r = rpc("fn_resolve_notification", {"p_code": CODE, "p_country": "ID", "p_locale": "en"}, svc)
    row = r[0] if isinstance(r, list) and r else None
    check("ID + en missing -> falls back to ID id-ID", row and row["country"] == "ID" and row["locale"] == "id-ID", str(row)[:120])
    check("ID + en missing -> NEVER falls back to MY", not (row and row["country"] == "MY"), str(row)[:120])
    call("/ch_notification_template_translations", "POST", saved, {**svc, "Prefer": "return=minimal"})

    s, keep2 = call(f"/ch_notification_template_translations?version_id=eq.{version_id}&country=eq.MY&locale=eq.en&select=*", headers=svc)
    saved2 = keep2[0]
    call(f"/ch_notification_template_translations?version_id=eq.{version_id}&country=eq.MY&locale=eq.en",
         "DELETE", None, {**svc, "Prefer": "return=minimal"})
    s, r = rpc("fn_resolve_notification", {"p_code": CODE, "p_country": "MY", "p_locale": "en"}, svc)
    row = r[0] if isinstance(r, list) and r else None
    check("MY + en missing -> falls back to MY ms-MY", row and row["country"] == "MY" and row["locale"] == "ms-MY", str(row)[:120])
    check("MY + en missing -> NEVER falls back to ID", not (row and row["country"] == "ID"), str(row)[:120])
    call("/ch_notification_template_translations", "POST", saved2, {**svc, "Prefer": "return=minimal"})

    print("\n=== rendering + send audit (real recipients) ===")
    combos_u = [("MY", "bm", "ms-MY"), ("MY", "en", "en"), ("ID", "id", "id-ID"), ("ID", "en", "en")]
    for country, applang, expect_locale in combos_u:
        uid = mkuser(f"ntest-{country}-{applang}-{TAG}@agtest.local", f"N {country} {applang}", country, applang)
        users.append(uid)
        s, ok = rpc("fn_notify_t", {"p_to": uid, "p_code": "evidence_approved",
                                    "p_vars": {"challenge_day": "5", "xp_amount": "15", "review_note": "good"},
                                    "p_link": "#/challenge"}, svc)
        check(f"send to {country}/{applang} succeeded", ok is True, str(ok))
        s, snd = call(f"/ch_notification_sends?recipient=eq.{uid}&select=country,locale,rendered_title,rendered_body,template_code,template_version", headers=svc)
        row = snd[0] if isinstance(snd, list) and snd else None
        check(f"{country}/{applang} recorded as {country}/{expect_locale}",
              row and row["country"] == country and row["locale"] == expect_locale, str(row)[:140])
        check(f"{country}/{applang} variables substituted (no leftover braces)",
              row and "{{" not in (row["rendered_title"] + row["rendered_body"]), str(row)[:140])
        check(f"{country}/{applang} send snapshot names template + version",
              row and row["template_code"] == "evidence_approved" and row["template_version"] == 1, str(row)[:120])

    print("\n=== country default applies when there is no explicit choice ===")
    for country, want_lang, want_locale in (("MY", "bm", "ms-MY"), ("ID", "id", "id-ID")):
        uid = mkuser(f"ndef-{country}-{TAG}@agtest.local", f"Default {country}",
                     country, "en", explicit=False)
        users.append(uid)
        s, prof = call(f"/profiles?id=eq.{uid}&select=language,language_source", headers=svc)
        check(f"a new {country} profile ignores a non-explicit 'en' and takes its country default",
              prof[0]["language"] == want_lang and prof[0]["language_source"] == "country_default",
              str(prof))
        rpc("fn_notify_t", {"p_to": uid, "p_code": "evidence_approved",
                            "p_vars": {"challenge_day": "1", "xp_amount": "10", "review_note": ""},
                            "p_link": "#/challenge"}, svc)
        s, snd = call(f"/ch_notification_sends?recipient=eq.{uid}&select=country,locale", headers=svc)
        check(f"and is notified in {country}/{want_locale}",
              snd and snd[0]["country"] == country and snd[0]["locale"] == want_locale, str(snd)[:120])

    print("\n=== fail-visibly, never invent wording ===")
    uid = mkuser(f"ntest-miss-{TAG}@agtest.local", "N Missing", "MY", "en")
    users.append(uid)
    s, ok = rpc("fn_notify_t", {"p_to": uid, "p_code": "no_such_template_code",
                                "p_vars": {}, "p_link": "#/x"}, svc)
    check("unknown template returns false, sends nothing", ok is False, str(ok))
    s, snd = call(f"/ch_notification_sends?recipient=eq.{uid}&select=id", headers=svc)
    check("no send row was written for the missing template", snd == [], str(snd))
    s, au = call("/audit_events?action=eq.notification_template_missing&select=entity_id&order=at.desc&limit=1", headers=svc)
    check("the miss is audited", isinstance(au, list) and au and au[0]["entity_id"] == "no_such_template_code", str(au)[:120])

    print("\n=== publish validation ===")
    s, r = rpc("fn_admin_publish_template", {"p_version": version_id, "p_note": "x"}, svc)
    check("publishing requires super_admin (service role is not one)", isinstance(s, int) and s >= 400, f"HTTP {s}")

finally:
    print("\n=== cleanup ===")
    for uid in users:
        call(f"/ch_notification_sends?recipient=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/notifications?to_agent=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        call(f"/user_roles?user_id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        s, r = call(f"/profiles?id=eq.{uid}", "DELETE", None, {**svc, "Prefer": "return=minimal"})
        if s >= 400:
            print(f"  WARN profile {uid[:8]}: {r}")
        call(f"/admin/users/{uid}", "DELETE", None, svc, base="/auth/v1")
    call("/audit_events?action=eq.notification_template_missing", "DELETE", None, {**svc, "Prefer": "return=minimal"})
    s, left = call("/profiles?email=like.*agtest.local&select=email", headers=svc)
    print(f"  agtest profiles remaining: {left}")

print(f"\n================ {len(PASS)} passed, {len(FAIL)} failed ================")
for f in FAIL:
    print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
