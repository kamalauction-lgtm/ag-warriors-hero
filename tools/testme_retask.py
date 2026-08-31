"""Rewrite the 12 items /testme shared word-for-word with /myself.

    SUPABASE_SERVICE_KEY=... python tools/testme_retask.py

Why: the two assessments answer different questions —
    /myself  (before the class) : WHO this person is
    /testme  (mid-class)        : which TASK suits them
but 12 of 40 stems were identical, and every one of them measured general
working style. Those belong to /myself. /testme needs evidence of the actual
jobs inside a real-estate team, so each replacement below names a concrete task
and carries a stronger role signal.

Questions are UPDATED IN PLACE, not deleted and recreated: an in-progress attempt
references question ids, and recreating them would cascade its answers away.

Runs over PostgREST rather than a SQL paste — pasting large SQL has corrupted
string literals in this project twice.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://zlbyfgfublqlrsqohvsn.supabase.co/rest/v1"
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not KEY:
    sys.exit("set SUPABASE_SERVICE_KEY")

T = lambda en, ms, id_: {"en": en, "ms-MY": ms, "id-ID": id_}


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
        sys.exit(f"{method} {path} -> {e.code}\n{e.read().decode('utf-8')[:500]}")


# (code, stem, contributes-at-full-agreement, reverse)
# Reverse means "agreeing with this counts AGAINST the trait" — the option maths
# below flips the sign, so a reverse item needs no special handling elsewhere.
ITEMS = [
    ("A1", T(
        "In the last 30 days, how often did you approach someone new specifically to talk about property?",
        "Dalam 30 hari lepas, berapa kerap anda mendekati orang baharu khusus untuk bercakap tentang hartanah?",
        "Dalam 30 hari terakhir, seberapa sering Anda mendekati orang baru khusus untuk bicara tentang properti?"),
     {"role.prospector": 1, "style.social_energy": 0.5}, False),

    ("A2", T(
        "In the last 30 days, how often did you publish something about property — a post, a video, a listing write-up?",
        "Dalam 30 hari lepas, berapa kerap anda menyiarkan sesuatu tentang hartanah — siaran, video atau tulisan senarai?",
        "Dalam 30 hari terakhir, seberapa sering Anda memposting sesuatu tentang properti — postingan, video, atau tulisan listing?"),
     {"role.content_creator": 1, "role.live_host": 0.5, "style.visibility": 0.5}, False),

    ("A3", T(
        "I would rather prepare the numbers and the paperwork than be the one doing the talking.",
        "Saya lebih rela menyiapkan pengiraan dan dokumen berbanding menjadi orang yang bercakap.",
        "Saya lebih suka menyiapkan angka dan dokumen daripada menjadi orang yang berbicara."),
     {"role.financing_coordinator": 1, "style.detail": 0.6, "style.planning": 0.4}, False),

    ("A4", T(
        "When a viewing or appointment moves at the last minute, I rearrange my day and still make it work.",
        "Apabila lawatan atau temu janji berubah pada saat akhir, saya susun semula hari saya dan tetap menjayakannya.",
        "Ketika viewing atau janji temu berubah mendadak, saya menata ulang hari saya dan tetap membuatnya berhasil."),
     {"style.adaptability": 1, "role.closer": 0.4}, False),

    ("A5", T(
        "In a conversation I am comfortable asking directly for a decision, with a date attached.",
        "Dalam perbualan, saya selesa meminta keputusan secara terus, berserta tarikh.",
        "Dalam percakapan, saya nyaman meminta keputusan secara langsung, beserta tanggalnya."),
     {"role.closer": 1, "style.decision_speed": 0.6}, False),

    ("A7", T(
        "I would rather bring a newer colleague along and show them how, than do it alone and finish faster.",
        "Saya lebih rela membawa rakan yang lebih baharu dan tunjukkan caranya, berbanding buat sendiri dan siap lebih cepat.",
        "Saya lebih suka mengajak rekan yang lebih baru dan menunjukkan caranya, daripada mengerjakannya sendiri dan selesai lebih cepat."),
     {"role.coach_trainer": 1, "role.leader": 0.6, "style.collaboration": 0.5}, False),

    ("A8", T(
        "I am comfortable standing in front of a room and explaining a project in detail.",
        "Saya selesa berdiri di hadapan orang ramai dan menerangkan sesuatu projek secara terperinci.",
        "Saya nyaman berdiri di depan banyak orang dan menjelaskan sebuah proyek secara rinci."),
     {"role.presenter": 1, "style.visibility": 0.5}, False),

    ("B1", T(
        "In the last 30 days, how often did you follow up with someone after a viewing without being reminded?",
        "Dalam 30 hari lepas, berapa kerap anda menghubungi semula seseorang selepas lawatan tanpa diingatkan?",
        "Dalam 30 hari terakhir, seberapa sering Anda menindaklanjuti seseorang setelah viewing tanpa diingatkan?"),
     {"role.relationship_builder": 1, "ent.initiative": 0.6}, False),

    ("B2", T(
        "When a deal falls through, I go back through the steps to find what I could have done differently.",
        "Apabila sesuatu urusan gagal, saya teliti semula langkah-langkahnya untuk mencari apa yang saya boleh buat berbeza.",
        "Ketika sebuah transaksi gagal, saya menelusuri kembali langkahnya untuk menemukan apa yang bisa saya lakukan berbeda."),
     {"success.accountability": 1, "ent.ownership": 0.6}, False),

    ("B5", T(
        "When a lead goes quiet after a few attempts, I usually move on to a new one.",
        "Apabila sesuatu lead senyap selepas beberapa percubaan, saya biasanya beralih kepada yang baharu.",
        "Ketika sebuah lead diam setelah beberapa kali dicoba, saya biasanya beralih ke yang baru."),
     {"ent.persistence": 1, "role.relationship_builder": 0.5}, True),
]

# C8 was the same multi-select demotivator bank as /myself. For a task-fit
# assessment a straight task preference discriminates far more.
C8_STEM = T(
    "Which of these would you rather spend a whole working day doing?",
    "Antara berikut, yang mana anda lebih rela habiskan satu hari bekerja sepenuhnya?",
    "Mana dari ini yang lebih Anda pilih untuk mengisi satu hari kerja penuh?")
C8_OPTS = [
    (1, T("Calling and meeting people I have never spoken to before",
          "Menghubungi dan bertemu orang yang saya tidak pernah bercakap dengannya",
          "Menelepon dan menemui orang yang belum pernah saya ajak bicara"),
     {"role.prospector": 2, "style.social_energy": 0.5}),
    (2, T("Showing properties and explaining them to buyers",
          "Menunjukkan hartanah dan menerangkannya kepada pembeli",
          "Menunjukkan properti dan menjelaskannya kepada pembeli"),
     {"role.presenter": 2, "role.closer": 0.5}),
    (3, T("Working through documents, loans and figures until they are right",
          "Menyelesaikan dokumen, pinjaman dan angka sehingga ia betul",
          "Menyelesaikan dokumen, pinjaman, dan angka sampai benar"),
     {"role.financing_coordinator": 2, "style.detail": 0.5}),
    (4, T("Teaching a newer agent and watching them get it",
          "Mengajar agen yang lebih baharu dan melihat mereka faham",
          "Mengajari agen yang lebih baru dan melihat mereka paham"),
     {"role.coach_trainer": 2, "role.leader": 0.5}),
    (5, T("Making content — filming, writing, posting",
          "Menghasilkan kandungan — merakam, menulis, menyiarkan",
          "Membuat konten — merekam, menulis, memposting"),
     {"role.content_creator": 2, "role.live_host": 0.5}),
    (6, T("Finding and bringing in new people to join the team",
          "Mencari dan membawa masuk orang baharu untuk menyertai pasukan",
          "Mencari dan membawa orang baru untuk bergabung dengan tim"),
     {"role.recruiter": 2, "role.leader": 0.5}),
]

F3_STEM = T(
    "Which part of this work do you most want to be trusted with, and why?",
    "Bahagian mana dalam kerja ini yang paling anda mahu dipercayakan kepada anda, dan mengapa?",
    "Bagian mana dari pekerjaan ini yang paling ingin Anda dipercayakan, dan mengapa?")

# ---------------------------------------------------------------- apply
secs = call("GET", "talent_sections?select=id,code&version_id=eq.1")
sec_ids = ",".join(str(s["id"]) for s in secs)
qs = {q["code"]: q for q in call("GET", f"talent_questions?select=id,code,kind&section_id=in.({sec_ids})")}

changed = 0
for code, stem, contrib, reverse in ITEMS:
    q = qs.get(code)
    if not q:
        print(f"  ! {code} tidak dijumpai, dilangkau")
        continue
    call("PATCH", f"talent_questions?id=eq.{q['id']}",
         {"stem": stem, "dimension": next(iter(contrib)), "reverse_scored": reverse})
    opts = call("GET", f"talent_options?select=id,value&question_id=eq.{q['id']}&order=sort_order")
    for o in opts:
        # 3 is neutral on a 5-point scale; a reverse item flips the sign
        factor = (o["value"] - 3) / 2.0
        if reverse:
            factor = -factor
        call("PATCH", f"talent_options?id=eq.{o['id']}",
             {"contributes": {k: round(v * factor, 3) + 0.0 for k, v in contrib.items()}})
    changed += 1
    print(f"  {code} ditulis semula ({len(opts)} pilihan)")

# C8: stem + a completely new option set
q = qs["C8"]
call("PATCH", f"talent_questions?id=eq.{q['id']}",
     {"stem": C8_STEM, "dimension": "role", "randomise_options": True, "required": True})
old = call("GET", f"talent_options?select=id&question_id=eq.{q['id']}")
call("DELETE", f"talent_options?question_id=eq.{q['id']}")
call("POST", "talent_options",
     [{"question_id": q["id"], "value": v, "label": lbl, "contributes": c, "sort_order": i}
      for i, (v, lbl, c) in enumerate(C8_OPTS)])
print(f"  C8 ditulis semula ({len(old)} pilihan lama -> {len(C8_OPTS)} baharu)")

call("PATCH", f"talent_questions?id=eq.{qs['F3']['id']}", {"stem": F3_STEM})
print("  F3 ditulis semula")
print(f"\nselesai: {changed + 2} item dikemas kini dalam bank /testme (v1)")
