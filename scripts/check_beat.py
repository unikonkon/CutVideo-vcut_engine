#!/usr/bin/env python3
"""ด่านของชั้นจังหวะเพลง — ตัวหา BPM + ปุ่มดูดรอยตัด

**เฉลยของด่านนี้เป็นของจริง ไม่ใช่ค่าที่ผมพิมพ์เอง** — เพลงคลอ 53 ลูปใน
`vcut-ui/public/bgm/` ถูกสังเคราะห์โดย `gen_bgm.py` ซึ่งเป็นคนกำหนด BPM เอง
ด่านนี้อ่าน BPM ออกมาจากซอร์สของตัวสังเคราะห์แล้วเทียบกับที่ตัวตรวจจับได้

สี่คำถามที่ด่านนี้ตอบ:

  1. ตัวหา BPM ยังแม่นเท่าเดิมไหม (เกณฑ์ตั้งจากที่วัดได้จริง ไม่ใช่ที่หวังไว้)
  2. ค่าที่ปรับละเอียดแล้วยังละเอียดพอที่กริดจะไม่เลื่อนในหนังยาว ๆ ไหม
  3. กริดบนไทม์ไลน์เดินถูกจังหวะ ถูกช่วง และเคารพค่าที่คนพิมพ์ทับ
  4. **ปุ่มดูดรอยตัดต้องไม่ทำให้หนังพัง** — ไม่ยืดเกินคลิป ไม่หดจนช็อตหาย
     ไม่แตะช็อตสุดท้าย และรอยที่เอื้อมไม่ถึงต้องถูกปล่อยไว้เฉย ๆ

รัน:  python3 scripts/check_beat.py       (ข้อ 1–2 ใช้เวลา ~8 วิ · อ่านไฟล์เสียง 53 ไฟล์)
      python3 scripts/check_beat.py --fast  (ข้ามข้อ 1–2)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import beat  # noqa: E402

BGM = ROOT / "vcut-ui" / "public" / "bgm"
GEN = ROOT / "vcut-ui" / "scripts" / "gen_bgm.py"
FAILED = []


def check(name, got, want):
    if got != want:
        FAILED.append(f"{name}\n     ได้  {got!r}\n     ควร {want!r}")
    return got == want


def truth():
    """BPM ที่ถูกต้องของทุกลูป — อ่านจากตัวสังเคราะห์ ไม่ใช่จากตารางที่คัดลอกมา"""
    src = GEN.read_text(encoding="utf-8")
    out = {}
    for name, body in re.findall(r"^def (\w+)\(\):\n((?:(?!^def ).*\n)*)", src, re.M):
        m = re.search(r"Song\(\s*([\d.]+)\s*,\s*(\d+)", body)
        if m:
            out[name.replace("_", "-")] = float(m.group(1))
    return out


# ─── 1–2 · ความแม่นกับเพลงจริง 53 ลูป ───────────────────────────────────────
if "--fast" in sys.argv:
    print("1–2 · ข้าม (--fast)")
elif not BGM.is_dir() or not GEN.exists():
    print("1–2 · ข้าม — ไม่มีคลังเพลงคลอในเครื่องนี้")
else:
    print("1 · ความแม่นของ BPM (เทียบกับที่ gen_bgm.py กำหนดไว้)")
    T = truth()
    exact, octv, wrong, errs = 0, 0, [], []
    for f in sorted(BGM.glob("*.m4a")):
        key = f.stem[4:]
        if key not in T:
            continue
        d = beat.detect(f)
        r = d["bpm"] / T[key]
        if abs(r - 1) < 0.03:
            exact += 1
            errs.append(abs(d["bpm"] - T[key]))
        elif min(abs(r - x) for x in (0.25, 0.5, 2, 4)) < 0.04:
            # ทวีคูณ = กริดยังใช้ได้ จังหวะจริงเป็นสมาชิกของกริดที่ละเอียดกว่า
            octv += 1
        else:
            wrong.append((key, T[key], round(d["bpm"], 1)))
    n = exact + octv + len(wrong)
    print(f"   ตรงเป๊ะ {exact} · เป็นทวีคูณ {octv} · เพี้ยน {len(wrong)}  จาก {n} เพลง")
    # เกณฑ์ตั้งจากผลที่วัดได้ตอนทำ (46/2/5) เผื่อไว้หนึ่งเพลงกันความต่างของ
    # เครื่อง — ต่ำกว่านี้แปลว่ามีคนไปแตะสูตรแล้วแย่ลงจริง
    n1 = 0
    n1 += check("จำนวนที่ตรงเป๊ะต้องไม่ต่ำกว่า 45", exact >= 45, True)
    n1 += check("กริดที่ใช้ได้ (ตรง+ทวีคูณ) ต้องไม่ต่ำกว่า 47", exact + octv >= 47, True)
    if wrong:
        print(f"   ที่เพี้ยน: {wrong}")
    print(f"   {n1}/2")

    print("2 · ความละเอียดหลังปรับ (กริดต้องไม่เลื่อนในหนังยาว)")
    n2 = 0
    avg = sum(errs) / len(errs)
    worst = max(errs)
    # 0.1 BPM ที่ 120 BPM = เลื่อน 0.15 วิ ในหนัง 3 นาที ซึ่งตาเริ่มจับได้
    n2 += check("คลาดเฉลี่ยต้องต่ำกว่า 0.1 BPM", avg < 0.1, True)
    n2 += check("แย่สุดต้องต่ำกว่า 0.5 BPM", worst < 0.5, True)
    print(f"   คลาดเฉลี่ย {avg:.4f} BPM · แย่สุด {worst:.3f} BPM  →  "
          f"หนัง 3 นาทีเลื่อน {avg / 120 * 180 * 1000:.0f} ms")
    print(f"   {n2}/2")

# ─── 3 · กริดบนไทม์ไลน์ ────────────────────────────────────────────────────
print("3 · กริดเดินถูกจังหวะและถูกช่วง")
n3 = 0
INFO = {"a.mp3": {"bpm": 120.0, "offset": 0.25, "dur": 8.0}}


def gridof(track, total=20.0, info=None):
    return beat.grid({"music": [track]}, info if info is not None else INFO, total)


base = {"file": "a.mp3", "at": 0.0, "dur": 0.0, "loop": True,
        "bpm": 0.0, "beat_offset": 0.0, "id": "m0"}
g = gridof(base)
n3 += check("ระยะห่างทุกช่วงเท่ากับ 60/BPM",
            sorted({round(b - a, 6) for a, b in zip(g, g[1:])}), [0.5])
n3 += check("เส้นแรกอยู่ที่เฟสที่ตรวจได้", g[0], 0.25)
n3 += check("ไม่มีเส้นเลยความยาวหนัง", max(g) < 20.0, True)

# ค่าที่คนพิมพ์ทับต้องชนะค่าที่ตรวจได้ — ทั้ง BPM และเฟส
g2 = gridof({**base, "bpm": 90.0, "beat_offset": 0.1})
# กริดปัดเป็นทศนิยม 4 ตำแหน่งตอนเก็บ (0.1 ms ซึ่งละเอียดกว่าหนึ่งเฟรม 400 เท่า)
n3 += check("BPM ที่พิมพ์เองชนะ", round(g2[1] - g2[0], 4), round(60 / 90, 4))
n3 += check("เฟสที่พิมพ์เองชนะ", g2[0], 0.1)

# แทร็กที่เริ่มกลางเรื่องและมีความยาวจำกัด
g3 = gridof({**base, "at": 5.0, "dur": 3.0})
n3 += check("เริ่มไม่ก่อนเวลาที่แทร็กเริ่ม", min(g3) >= 5.0 - 1e-9, True)
n3 += check("จบไม่เกินความยาวแทร็ก", max(g3) < 8.0, True)

# แทร็กที่ไม่วนซ้ำต้องหยุดที่ความยาวไฟล์ ไม่ใช่ยาวไปจนจบเรื่อง
g4 = gridof({**base, "loop": False})
n3 += check("ไม่วนซ้ำ = หยุดที่ความยาวไฟล์ (8 วิ)", max(g4) < 8.0, True)
n3 += check("วนซ้ำ = เดินต่อจนจบเรื่อง", max(g) > 19.0, True)

# เพลงที่ยังไม่รู้ BPM ต้องไม่มีเส้นเลย ไม่ใช่เส้นมั่ว ๆ
n3 += check("ไม่รู้ BPM = ไม่มีเส้น", gridof(base, info={}), [])

# เส้นจากสองแทร็กที่ทับกันต้องถูกยุบ ไม่ใช่วาดซ้อนกันสองเส้น
two = beat.grid({"music": [base, {**base, "id": "m1"}]}, INFO, 20.0)
n3 += check("สองแทร็กเหมือนกันได้เส้นชุดเดียว", two, g)
print(f"   {n3}/11")

# ─── 4 · ปุ่มดูดรอยตัด ─────────────────────────────────────────────────────
print("4 · ดูดรอยตัดแล้วหนังต้องไม่พัง")
n4 = 0
G = [round(i * 0.5, 4) for i in range(200)]      # 120 BPM ตรง ๆ


def run(shots, **kw):
    rows, rep = beat.snap(shots, G, **kw)
    ends, t = [], 0.0
    for s, r in zip(shots, rows):
        t += r["end"] - r["start"]
        ends.append(round(t, 4))
    return rows, rep, ends


shots = [
    {"kind": "TALK", "start": 0.0, "end": 2.30, "clip_dur": 10.0},
    {"kind": "BROLL", "start": 0.0, "end": 1.80, "clip_dur": 3.0},
    {"kind": "TALK", "start": 0.0, "end": 3.10, "clip_dur": 3.15},
    {"kind": "BROLL", "start": 0.0, "end": 2.00, "clip_dur": 2.01},
]
rows, rep, ends = run(shots)
n4 += check("รอยตัดทุกจุด (ยกเว้นจุดจบ) ไปอยู่บนจังหวะ",
            [e for e in ends[:-1] if min(abs(e - b) for b in G) > 1e-6], [])
n4 += check("ช็อตสุดท้ายไม่ถูกแตะ", rows[-1]["end"], shots[-1]["end"])
n4 += check("start ไม่ถูกแตะสักช็อต",
            [r["start"] for r in rows], [s["start"] for s in shots])

# ยืดเกินคลิปไม่ได้ — คลิปหมดพอดีที่ end
tight = [{"kind": "BROLL", "start": 0, "end": 2.3, "clip_dur": 2.3},
         {"kind": "BROLL", "start": 0, "end": 1.0, "clip_dur": 5}]
rows, rep, _ = run(tight)
n4 += check("ไม่ยืดเกินความยาวคลิปต้นทาง", rows[0]["end"], 2.3)
n4 += check("และบอกเหตุผลด้วย", bool(rep) and "ยืด" in rep[0]["why"], True)

# หดจนต่ำกว่าความยาวขั้นต่ำไม่ได้
short = [{"kind": "BROLL", "start": 0, "end": 0.35, "clip_dur": 0.35},
         {"kind": "BROLL", "start": 0, "end": 1.0, "clip_dur": 5}]
rows, rep, _ = run(short)
n4 += check("ไม่หดจนช็อตสั้นกว่าขั้นต่ำ", rows[0]["end"], 0.35)

# รอยที่ไกลเกินขีดจำกัดต้องถูก *ปล่อยไว้เฉย ๆ* ไม่ใช่ขยับไปครึ่งทาง
slow = [round(i * 1.0, 4) for i in range(40)]
rows, rep = beat.snap([{"kind": "TALK", "start": 0, "end": 2.5, "clip_dur": 9},
                       {"kind": "TALK", "start": 0, "end": 1.0, "clip_dur": 5}], slow)
n4 += check("ไกลเกินขีดจำกัด = ไม่ขยับเลย", rows[0]["end"], 2.5)
n4 += check("ไม่ใช่ขยับไปจนสุดขีดจำกัด", "moved" in rows[0], False)

# ช็อตพูดขยับได้น้อยกว่าช็อตวิว
mid = [round(i * 0.9, 4) for i in range(40)]     # ห่างจังหวะ 0.45 วิ
for kind, want in (("TALK", False), ("BROLL", True)):
    rows, _ = beat.snap([{"kind": kind, "start": 0, "end": 0.5, "clip_dur": 9},
                         {"kind": "BROLL", "start": 0, "end": 1.0, "clip_dur": 5}], mid)
    n4 += check(f"ระยะ 0.4 วิ: {kind} {'ขยับ' if want else 'ไม่ขยับ'}",
                "moved" in rows[0], want)

# รอยที่ตรงจังหวะอยู่แล้วต้องไม่ถูกนับว่า "ขยับ" (ไม่งั้นไป render ใหม่ฟรี ๆ)
onbeat = [{"kind": "TALK", "start": 0, "end": 1.0, "clip_dur": 9},
          {"kind": "TALK", "start": 0, "end": 1.0, "clip_dur": 9}]
rows, _ = beat.snap(onbeat, G)
n4 += check("รอยที่ตรงอยู่แล้วไม่นับว่าขยับ", [r for r in rows if "moved" in r], [])

# ไม่มีเพลง = ไม่มีกริด → ต้องไม่แตะอะไรเลย และบอกว่าทำไม
rows, rep = beat.snap(shots, [])
n4 += check("ไม่มีจังหวะ = ไม่แตะอะไรเลย",
            [r["end"] for r in rows], [s["end"] for s in shots])
n4 += check("และบอกเหตุผล", all("ไม่มีจังหวะ" in r["why"] for r in rep), True)
print(f"   {n4}/13")

print()
if FAILED:
    print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
    for f in FAILED:
        print(f"   · {f}")
    sys.exit(1)
print("ผ่านหมด")
