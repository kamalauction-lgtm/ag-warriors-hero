"""Load the Hero Talent Compass question bank straight into Supabase via REST.

    SUPABASE_SECRET=... python tools/talent_load.py

Why not the .sql file: the seed is ~126 KB, which is awkward to paste into the
SQL editor and is where the cp1252 corruption crept in. Going over the API
sends UTF-8 JSON end to end, so the text cannot be mangled in transit.

Idempotent: v1 content is deleted and rewritten each run. Attempts and
responses are never touched.
"""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from talent_seed import (SECTIONS, ITEMS, CHOICE, C_SCALE, AGREE,  # noqa: E402
                         DEMOTIVATORS_1, DEMOTIVATORS_2, REFLECT)
from talent_scenarios import SCEN, E6_NOTE  # noqa: E402

URL = "https://zlbyfgfublqlrsqohvsn.supabase.co/rest/v1"
SECRET = os.environ.get("SUPABASE_SECRET")


def req(method, path, payload=None, prefer=None):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("apikey", SECRET)
    r.add_header("Authorization", f"Bearer {SECRET}")
    r.add_header("Content-Type", "application/json; charset=utf-8")
    if prefer:
        r.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:400]


def must(code, body, what):
    if code >= 300:
        sys.exit(f"FAILED {what}: HTTP {code} {body}")
    return body


def main():
    if not SECRET:
        sys.exit("SUPABASE_SECRET not set")

    # ---- version ----
    code, body = req("GET", "/talent_versions?select=id&code=eq.v1")
    if body:
        vid = body[0]["id"]
    else:
        vid = must(*req("POST", "/talent_versions", [{"code": "v1", "name": "Hero Talent Compass v1"}],
                        prefer="return=representation"), "create version")[0]["id"]
    print(f"version v1 = {vid}")

    # ---- clear v1 content (children first) ----
    secs = must(*req("GET", f"/talent_sections?select=id&version_id=eq.{vid}"), "read sections")
    if secs:
        ids = ",".join(str(s["id"]) for s in secs)
        qs = must(*req("GET", f"/talent_questions?select=id&section_id=in.({ids})"), "read questions")
        if qs:
            qids = ",".join(str(q["id"]) for q in qs)
            req("DELETE", f"/talent_options?question_id=in.({qids})")
            req("DELETE", f"/talent_responses?question_id=in.({qids})")
            req("DELETE", f"/talent_questions?id=in.({qids})")
        req("DELETE", f"/talent_sections?id=in.({ids})")
        print(f"cleared {len(secs)} old sections")

    # ---- sections ----
    rows = [{"version_id": vid, "code": c, "title": t, "intro": i, "sort_order": n}
            for n, (c, t, i) in enumerate(SECTIONS)]
    made = must(*req("POST", "/talent_sections", rows, prefer="return=representation"), "sections")
    sec_id = {s["code"]: s["id"] for s in made}
    print(f"sections: {len(sec_id)}")

    questions, options = [], []

    def add_q(sec, code, kind, stem, dim, reverse, order, helper=None,
              randomise=False, required=True, max_len=None):
        questions.append({"section_id": sec_id[sec], "code": code, "kind": kind, "stem": stem,
                          "helper": helper, "dimension": dim, "reverse_scored": reverse,
                          "randomise_options": randomise, "required": required,
                          "max_length": max_len, "sort_order": order})

    def add_o(qcode, value, label, contributes, order):
        options.append((qcode, {"value": value, "label": label,
                                "contributes": contributes, "sort_order": order}))

    # A / B / D scale items
    for order, (sec, code, kind, stem, scale, contrib, reverse) in enumerate(ITEMS):
        add_q(sec, code, kind, stem, next(iter(contrib)), reverse, order)
        for idx, (val, label) in enumerate(scale):
            factor = (val - 3) / 2.0
            if reverse:
                factor = -factor
            add_o(code, val, label, {k: round(v * factor, 3) + 0.0 for k, v in contrib.items()}, idx)

    # C forced choice
    for n, (code, stem, opts) in enumerate(CHOICE):
        add_q("C", code, "choice", stem, "motivation", False, n, randomise=True)
        for idx, (val, label, contrib) in enumerate(opts):
            add_o(code, val, label, contrib, idx)
    for n, (code, stem, contrib) in enumerate(C_SCALE):
        add_q("C", code, "scale5", stem, next(iter(contrib)), False, 10 + n)
        for idx, (val, label) in enumerate(AGREE):
            factor = (val - 3) / 2.0
            add_o(code, val, label, {k: round(v * factor, 3) + 0.0 for k, v in contrib.items()}, idx)
    demot_stem = {
        "en": "Which of these drains your motivation most? Choose up to three.",
        "ms-MY": "Antara berikut, yang mana paling melemahkan motivasi anda? Pilih sehingga tiga.",
        "id-ID": "Mana yang paling menurunkan motivasi Anda? Pilih maksimal tiga.",
    }
    for n, (code, bank) in enumerate((("C7", DEMOTIVATORS_1), ("C8", DEMOTIVATORS_2))):
        add_q("C", code, "choice", demot_stem, "demotivator", False, 20 + n, required=False)
        for idx, (key, label) in enumerate(bank):
            add_o(code, idx + 1, label, {f"demotivator.{key}": 1}, idx)

    # E scenarios
    for n, (code, stem, opts) in enumerate(SCEN):
        add_q("E", code, "scenario", stem, "role", False, n,
              helper=(E6_NOTE if code == "E6" else None), randomise=True)
        for idx, (val, label, contrib) in enumerate(opts):
            add_o(code, val, label, contrib, idx)

    # F written
    for n, (code, stem) in enumerate(REFLECT):
        add_q("F", code, "text", stem, "reflection", False, n, required=False, max_len=1500)

    made_q = must(*req("POST", "/talent_questions", questions, prefer="return=representation"), "questions")
    qid = {q["code"]: q["id"] for q in made_q}
    print(f"questions: {len(qid)}")

    orows = [{**o, "question_id": qid[c]} for c, o in options]
    must(*req("POST", "/talent_options", orows, prefer="return=minimal"), "options")
    print(f"options: {len(orows)}")

    # ---- event ----
    code, body = req("GET", "/talent_events?select=id&code=eq.AGLEADERSHIP")
    if not body:
        must(*req("POST", "/talent_events", [{
            "code": "AGLEADERSHIP", "name": "AG Leadership Programme", "version_id": vid,
            "country_scope": "MIXED", "languages": ["en", "ms-MY", "id-ID"],
            "status": "active", "max_participants": 200, "timezone": "Asia/Kuala_Lumpur",
        }], prefer="return=minimal"), "event")
        print("event AGLEADERSHIP created")
    else:
        req("PATCH", "/talent_events?code=eq.AGLEADERSHIP", {"version_id": vid}, prefer="return=minimal")
        print("event AGLEADERSHIP already existed (version re-pointed)")

    print("\nDone.")


if __name__ == "__main__":
    main()
