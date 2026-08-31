"""Load the myself-v1 question bank straight into Supabase over PostgREST.

    SUPABASE_SERVICE_KEY=... python tools/myself_load.py

Why this exists instead of pasting 033_myself_seed*.sql: the generated SQL is
correct (verified by tokenising it — nothing leaks outside a string literal),
but pasting ~100 KB into the dashboard editor corrupted a literal mid-word and
Postgres then read the next word as a table name:

    ERROR 42P01: relation "something" does not exist

That is the same failure mode as the earlier `relation "an" does not exist`.
These are ordinary INSERTs into ordinary tables, so the SQL editor is not needed
at all — the REST API takes the rows as JSON and no quoting is involved.

Idempotent: it clears myself-v1 questions and options first, then reloads. It
never touches v1, attempts, responses or any other version.
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from myself_emit import (SECTIONS, ITEMS, CHOICE, AGREE,  # noqa: E402
                         DEMOTIVATORS_1, DEMOTIVATORS_2, SCEN, REFLECT, T)

BASE = "https://zlbyfgfublqlrsqohvsn.supabase.co/rest/v1"
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
VER = "myself-v1"
if not KEY:
    sys.exit("set SUPABASE_SERVICE_KEY")


def call(method, path, body=None, prefer=None):
    req = urllib.request.Request(f"{BASE}/{path}", method=method)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}\n{e.read().decode('utf-8')[:600]}")


version_id = call("GET", f"talent_versions?select=id&code=eq.{VER}")
if not version_id:
    sys.exit(f"version {VER} missing — run 033 part 1 first")
version_id = version_id[0]["id"]
print(f"version {VER} = id {version_id}")

sections = call("GET", f"talent_sections?select=id,code&version_id=eq.{version_id}")
sec_id = {s["code"]: s["id"] for s in sections}
missing = [c for c, _, _ in SECTIONS if c not in sec_id]
if missing:
    sys.exit(f"sections missing: {missing} — run 033 part 1 first")
print(f"sections: {len(sec_id)} ({''.join(sorted(sec_id))})")

# ---- clear this version's questions (options cascade off question_id) --------
old = call("GET", "talent_questions?select=id&section_id=in.(%s)"
           % ",".join(str(i) for i in sec_id.values()))
if old:
    ids = ",".join(str(q["id"]) for q in old)
    call("DELETE", f"talent_options?question_id=in.({ids})")
    call("DELETE", f"talent_questions?id=in.({ids})")
    print(f"cleared {len(old)} previously loaded questions")

# ---- build every question and its options in one pass ------------------------
questions, options = [], []          # options hold a question CODE, resolved later
order = {}


def add_q(sec, code, kind, stem, dim, reverse=False, randomise=False,
          required=True, max_len=None, helper=None):
    n = order.get(sec, 0)
    order[sec] = n + 1
    questions.append({
        "section_id": sec_id[sec], "code": code, "kind": kind, "stem": stem,
        "helper": helper, "dimension": dim, "reverse_scored": reverse,
        "randomise_options": randomise, "required": required,
        "max_length": max_len, "sort_order": n,
    })


def add_o(qcode, value, label, contributes, sort_order):
    options.append({"_q": qcode, "value": value, "label": label,
                    "contributes": contributes, "sort_order": sort_order})


for sec, code, kind, stem, scale, contrib, reverse in ITEMS:
    add_q(sec, code, kind, stem, next(iter(contrib)), reverse=reverse)
    for idx, (val, lbl) in enumerate(scale):
        # 3 is neutral; a reverse item flips the sign. Same rule as the emitter.
        factor = (val - 3) / 2.0
        if reverse:
            factor = -factor
        add_o(code, val, lbl, {k: round(v * factor, 3) + 0.0 for k, v in contrib.items()}, idx)

for code, stem, opts in CHOICE:
    sec = code[0]
    add_q(sec, code, "choice", stem, "motivation" if sec == "D" else "demotivator",
          randomise=True)
    for idx, (val, lbl, contrib) in enumerate(opts):
        add_o(code, val, lbl, contrib, idx)

for code, bank in (("E1", DEMOTIVATORS_1), ("E2", DEMOTIVATORS_2)):
    stem = T("Which of these drains your motivation most? Choose up to three.",
             "Antara berikut, yang mana paling melemahkan motivasi anda? Pilih sehingga tiga.",
             "Mana yang paling menurunkan motivasi Anda? Pilih maksimal tiga.")
    add_q("E", code, "choice", stem, "demotivator", required=False)
    for idx, (key, lbl) in enumerate(bank):
        add_o(code, idx + 1, lbl, {f"demotivator.{key}": 1}, idx)

for code, stem, opts in SCEN:
    add_q("F", code, "scenario", stem, "role", randomise=True)
    for idx, (val, lbl, contrib) in enumerate(opts):
        add_o(code, val, lbl, contrib, idx)

for code, stem in REFLECT:
    add_q("G", code, "text", stem, "reflection", required=False, max_len=1500)

print(f"prepared {len(questions)} questions, {len(options)} options")

# ---- insert, then resolve option -> question ids ----------------------------
inserted = call("POST", "talent_questions", questions, prefer="return=representation")
qid = {q["code"]: q["id"] for q in inserted}
print(f"inserted {len(inserted)} questions")

rows = [{"question_id": qid[o["_q"]], "value": o["value"], "label": o["label"],
         "contributes": o["contributes"], "sort_order": o["sort_order"]}
        for o in options]
for i in range(0, len(rows), 100):                 # keep each request modest
    call("POST", "talent_options", rows[i:i + 100])
print(f"inserted {len(rows)} options")

# ---- the standing public event ----------------------------------------------
if not call("GET", "talent_events?select=id&code=eq.MYSELF"):
    call("POST", "talent_events", [{
        "code": "MYSELF", "name": "Know Yourself (public)", "version_id": version_id,
        "country_scope": "MIXED", "languages": ["en", "ms-MY", "id-ID"],
        "status": "active", "retention_days": 365, "timezone": "Asia/Kuala_Lumpur",
    }])
    print("created event MYSELF")
else:
    print("event MYSELF already present")


def count(path):
    req = urllib.request.Request(f"{BASE}/{path}", method="HEAD")
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Prefer", "count=exact")
    req.add_header("Range", "0-0")
    with urllib.request.urlopen(req) as r:
        return r.headers.get("Content-Range", "?/?").split("/")[-1]


qids = ",".join(str(i) for i in qid.values())
print("\n--- verification ---")
print("sections :", count(f"talent_sections?select=id&version_id=eq.{version_id}"))
print("questions:", count(f"talent_questions?select=id&id=in.({qids})"))
print("options  :", count(f"talent_options?select=question_id&question_id=in.({qids})"))
print("event    :", count("talent_events?select=id&code=eq.MYSELF"))
