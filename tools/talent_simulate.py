"""Drive a fictional participant end to end, exactly as a phone would.

    SUPABASE_SECRET=... python tools/talent_simulate.py [persona]

Uses the ANON key for every participant call — the same path a real person
takes — so this also proves the anon RLS and token gating actually work.
Personas pick deliberately different answers so the scoring can be judged.
"""
import json
import os
import sys
import urllib.request

URL = "https://zlbyfgfublqlrsqohvsn.supabase.co/rest/v1"
ANON = "sb_publishable_fNAsKQFCXCDsjWJP-KnCRQ_ZYFRZQiv"
SECRET = os.environ.get("SUPABASE_SECRET")


def rpc(fn, args, key=ANON):
    data = json.dumps(args, ensure_ascii=False).encode("utf-8")
    r = urllib.request.Request(f"{URL}/rpc/{fn}", data=data, method="POST")
    r.add_header("apikey", key)
    r.add_header("Authorization", f"Bearer {key}")
    r.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{fn} failed: {e.code} {e.read().decode()[:300]}")


PERSONAS = {
    # a people-first agent: warm, consistent, not a self-promoter
    "relationship": {"scale_bias": 4, "prefers": [1], "text": (
        "Success means my family is secure and I am respected for doing honest work.",
        "I will call ten people every working day and follow up every lead within 24 hours.",
        "I lose confidence when someone rejects me twice in a row and I have no one to talk to.")},
    # a visible, fast-moving closer
    "closer": {"scale_bias": 5, "prefers": [3], "text": (
        "Success is hitting a number I set for myself and beating it.",
        "Daily prospecting, weekly targets, and asking for the decision every time.",
        "I slow down when the paperwork drags on and nothing seems to move.")},
    # someone early in their journey, unsure
    "emerging": {"scale_bias": 3, "prefers": [1, 2], "text": (
        "Being able to support my parents.", "Learn and try.", "Not knowing enough yet.")},
    # the straight-liner: every answer identical (should trip the flags)
    "uniform": {"scale_bias": 5, "prefers": [1], "text": ("", "", "")},
}


def main():
    persona = sys.argv[1] if len(sys.argv) > 1 else "relationship"
    cfg = PERSONAS[persona]
    print(f"persona: {persona}\n")

    start = rpc("talent_start", {"p_code": "AGLEADERSHIP", "p_language": "en"})
    token = start["token"]
    print(f"started attempt {start['attempt_id'][:8]}…  event: {start['event_name']}")

    rpc("talent_save_details", {
        "p_token": token, "p_full_name": f"Test {persona.title()}", "p_preferred": "Test",
        "p_country": "MY", "p_contact": "test@example.com",
        "p_experience": "1-3 years", "p_leadership": "None",
        "p_developmental": True, "p_not_clinical": True, "p_self_reported": True,
        "p_data_use": True, "p_sharing": "summary"})
    print("details + consent saved")

    form = rpc("talent_form", {"p_token": token})
    answered = 0
    for sec in form["sections"]:
        for q in sec["questions"]:
            if q["kind"] == "text":
                idx = min(answered % 3, 2)
                rpc("talent_answer", {"p_token": token, "p_question": q["id"],
                                      "p_text": cfg["text"][idx]})
            elif q["options"]:
                vals = [o["value"] for o in q["options"]]
                if len(vals) == 5:                      # scale / frequency
                    pick = min(cfg["scale_bias"], max(vals))
                else:                                   # choice / scenario
                    pick = next((v for v in cfg["prefers"] if v in vals), vals[0])
                rpc("talent_answer", {"p_token": token, "p_question": q["id"], "p_value": pick})
            answered += 1
    print(f"answered {answered} items")

    # prove resume works before submitting
    prog = rpc("talent_progress", {"p_token": token})
    print(f"resume check: {len(prog['answers'])} answers stored, sharing={prog['sharing']}")

    sub = rpc("talent_submit", {"p_token": token, "p_seconds": 1500})
    print(f"submitted (unanswered required items: {sub['unanswered']})")

    res = rpc("talent_score_mine", {"p_token": token})

    print("\n--- ROLE PATHWAYS (top 5) ---")
    for r in res["roles"][:5]:
        print(f"  {r['key']:24} {str(r['score']):>6}  {r['band']}")
    print("\n--- TOP MOTIVATIONS ---")
    for m in res["motivations"][:4]:
        print(f"  {m['key']:24} {m['score']}")
    print("\n--- LIKELY DEMOTIVATORS ---")
    for d in res["demotivators"][:4]:
        print(f"  {d['key']:24} {d['score']}")
    print("\n--- DIMENSIONS ---")
    for k, v in sorted(res["dimensions"].items(), key=lambda x: -(x[1]["score"] or 0))[:8]:
        print(f"  {k:28} {str(v['score']):>6}  {v['band']}")
    print("\n--- REVIEW FLAGS ---")
    print("  none" if not res["flags"] else "")
    for f in res["flags"]:
        print(f"  {f['flag']}: {f['detail']}")

    if SECRET:                                          # tidy up after ourselves
        r = urllib.request.Request(
            f"{URL}/talent_attempts?id=eq.{start['attempt_id']}", method="DELETE")
        r.add_header("apikey", SECRET)
        r.add_header("Authorization", f"Bearer {SECRET}")
        urllib.request.urlopen(r)
        print("\ntest attempt deleted")


if __name__ == "__main__":
    main()
