#!/usr/bin/env python3
"""ด่านของชั้นเรืองแสง (รอบ 4) — เส้นนีออนของแผนที่ + รูปทรงที่เปิด glow

สี่คำถามที่ด่านนี้ตอบ:

  1. เปิดฟีเจอร์แล้ว *ของเดิมยังเหมือนเดิมทุกตัวอักษร* ไหม
  2. ฮาโลมีเพดานไหม — บั๊กที่เจอตอนทำ: ชิปหนา 57 พิกเซลได้ฮาโล 148 พิกเซล
     ท่วมทั้งเฟรม เพราะ unit โตตามความหนาแบบไม่มีเพดาน
  3. เรนเดอร์ผ่าน libass จริงแล้ว **แสงฟุ้งออกนอกรูปจริงไหม และแกนยังคมไหม**
     — สองอย่างนี้ต้องจริงพร้อมกัน ถ้าฟุ้งอย่างเดียวคือภาพเบลอ ไม่ใช่นีออน
  4. รูปทรงที่เปิดเรืองแสงถูกนับเป็น *หนึ่งชิ้น* ไม่ใช่สามบรรทัด — ตัวเลขนี้ไป
     โผล่เป็น "ข้อความ N ชิ้น" ที่ finish.run พิมพ์ (n − จำนวนรูปทรง)

รัน:  python3 scripts/check_glow.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import fxtext, journey  # noqa: E402

W, H = 1080, 1920

SHAPE = {"kind": "rrect", "x": 0.5, "y": 0.4, "size": 260, "thick": 0.22,
         "angle": 0.0, "color": "#00E5FF", "outline": "#000000", "border": 0.0,
         "anim": "none", "in": 0.0, "out": 0.0, "behind": False,
         "a": 0.0, "b": 2.0, "path": "m 0 0 l 10 0 l 10 4 l 0 4 "}

# ค่าทองของรูปทรง — ปิดเรืองแสงต้องได้บรรทัดเดียวและเป็นบรรทัดเดิมของก่อนรอบ 4
FLAT = (r"{\an7\pos(540,768)\c&H00FFE500&\3c&H00000000&\bord0\shad0\p1}"
        r"m 0 0 l 10 0 l 10 4 l 0 4 {\p0}")

# เปิดแล้วได้สามบรรทัด — ฮาโลกว้าง · ฮาโลแคบ · แล้วรูปจริงซึ่งต้องเท่ากับ FLAT เป๊ะ
GLOWING = [
    (r"{\an7\pos(540,768)\c&H00FFE500&\3c&H00FFE500&\shad0"
     r"\bord33.70\blur25.92\alpha&H66&\p1}m 0 0 l 10 0 l 10 4 l 0 4 {\p0}"),
    (r"{\an7\pos(540,768)\c&H00FFE500&\3c&H00FFE500&\shad0"
     r"\bord14.26\blur10.37\alpha&HA6&\p1}m 0 0 l 10 0 l 10 4 l 0 4 {\p0}"),
    FLAT,
]

FAILED = []


def check(name, got, want):
    ok = got == want
    if not ok:
        FAILED.append(f"{name}\n     ได้  {got!r}\n     ควร {want!r}")
    return ok


def head(res_x, res_y):
    return ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {res_x}",
            f"PlayResY: {res_y}", "WrapStyle: 2", "ScaledBorderAndShadow: yes",
            "", "[V4+ Styles]",
            ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
             "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
             "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
             "Alignment, MarginL, MarginR, MarginV, Encoding"),
            ("Style: sub,Arial,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,"
             "0,0,0,0,100,100,0,0,1,3,0,5,60,60,60,1"), "",
            "[Events]", ("Format: Layer, Start, End, Style, Name, MarginL, "
                         "MarginR, MarginV, Effect, Text")]


# ─── 1 · ค่าเดิมได้บรรทัดเดิม ───────────────────────────────────────────────
print("1 · ปิดเรืองแสง = บรรทัดเดิม")
n1 = 0
flat = fxtext._shape_lines({**SHAPE, "glow": 0.0}, W, H)
n1 += check("รูปทรง glow=0 ต้องได้บรรทัดเดียว", len(flat), 1)
n1 += check("รูปทรง glow=0 ต้องเป็นบรรทัดเดิม", flat[0], FLAT)

lit = fxtext._shape_lines({**SHAPE, "glow": 1.0}, W, H)
n1 += check("รูปทรง glow=1 ต้องได้สามบรรทัด", len(lit), 3)
n1 += check("ฮาโลกว้าง", lit[0] if len(lit) > 0 else "", GLOWING[0])
n1 += check("ฮาโลแคบ", lit[1] if len(lit) > 1 else "", GLOWING[1])
# รูปจริงต้องไม่ถูกแตะเลย — ชั้นฟุ้งเป็นบรรทัดที่ *เพิ่มเข้ามาข้างหน้า*
n1 += check("บรรทัดสุดท้ายยังเป็นรูปจริงตัวเดิม", lit[-1] if lit else "", FLAT)

# แผนที่ลุคแบนต้องไม่มีแท็กเรืองแสงโผล่มาแม้แต่ตัวเดียว
D = "M 40 400 C 200 380 260 200 420 210 L 960 100"
STOPS = [{"label": "ก", "dist": 0, "color": "#E65100", "px": 40, "py": 400,
          "lx": 90, "ly": 350, "name": "A.mp4", "at": 0.4, "id": "j0"},
         {"label": "ข", "dist": 900, "color": "#00E5FF", "px": 420, "py": 210,
          "lx": 430, "ly": 160, "name": "A.mp4", "at": 2.2, "id": "j1"}]
MAN = {"total": 12.0, "segments": [
    {"name": "A.mp4", "start": 0.0, "dur": 6.0, "at": 0.0, "speed": 1.0}]}


def events(look, **over):
    j = dict(journey.JOURNEY)
    j.update({"enabled": True, "d": D, "stops": STOPS, "look": look, **over})
    return journey.ass_events({"journey": j}, W, H, MAN)


flat_ev = events("map")
n1 += check("ลุคแบนต้องไม่มี \\blur เลย",
            sum(1 for e in flat_ev if r"\blur" in e), 0)
neon_ev = events("neon")
n1 += check("ลุคนีออนต้องมีบรรทัดมากกว่าลุคแบน", len(neon_ev) > len(flat_ev), True)
# glow = 0 บนลุคนีออน = สั่งปิดแสง ต้องได้ไฟล์เท่ากับลุคแบนเป๊ะ ไม่ใช่ "เกือบ"
n1 += check("นีออนที่ glow=0 ต้องเท่ากับลุคแบน", events("neon", glow=0.0), flat_ev)
print(f"   {n1}/9")

# ─── 2 · เพดานของฮาโล ──────────────────────────────────────────────────────
print("2 · ฮาโลมีเพดาน (บั๊กที่เจอตอนทำ)")
n2 = 0
cap = min(W, H) * 0.012
n2 += check("เส้นบางกว่าเพดาน → ใช้ความหนาตรง ๆ",
            round(journey.glow_unit(3.5, W, H), 3), 3.5)
n2 += check("ชิปหนา 57 px ต้องถูกตัดที่เพดาน",
            round(journey.glow_unit(57, W, H), 3), round(cap, 3))
# เพดานคิดจากด้านสั้นของจอ — ไม่งั้นแสงที่พอดีบน 1080 จะจางหายบน 4K
n2 += check("เพดานโตตามความละเอียด",
            journey.glow_unit(57, 3840, 2160) > journey.glow_unit(57, W, H), True)
n2 += check("ของเล็กมากยังได้พื้นขั้นต่ำ", journey.glow_unit(0.2, W, H), 3.0)
print(f"   {n2}/4")

# ─── 3 · เรนเดอร์จริงแล้วฟุ้งจริงไหม ────────────────────────────────────────
print("3 · เรนเดอร์ผ่าน libass จริง")
n3 = 0
EXE = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
if not Path(EXE).exists():
    print("   ข้าม — ไม่มี ffmpeg-full ในเครื่องนี้")
else:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)

        def frame(glow):
            sh = {**SHAPE, "kind": "bar", "size": 200, "thick": 0.30,
                  "x": 0.5, "y": 0.5, "path": None, "glow": glow}
            ev = [f"Dialogue: 3,0:00:00.00,0:00:02.00,sub,,0,0,0,,{ln}"
                  for ln in fxtext._shape_lines(sh, 600, 600)]
            ass = td / f"g{glow}.ass"
            ass.write_text("\n".join(head(600, 600) + ev) + "\n", encoding="utf-8")
            png = td / f"g{glow}.png"
            subprocess.run(
                [EXE, "-nostdin", "-v", "error", "-f", "lavfi",
                 "-i", "color=c=black:s=600x600:d=0.1:r=1",
                 "-vf", f"ass={ass}", "-frames:v", "1", "-y", str(png)],
                check=True)
            out = subprocess.run(
                [EXE, "-nostdin", "-v", "error", "-i", str(png),
                 "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                check=True, capture_output=True).stdout
            return out

        # แถบสูง 200*0.30 = 60 px จัดกลางที่ y=300 → ขอบบนอยู่ที่ y=270
        # วัดคอลัมน์กลาง: ในตัวแถบ · เหนือขอบ 14 px (ควรมีแสง) · ไกลออกไป 90 px
        def col(buf, y):
            return buf[y * 600 + 300]

        off, on = frame(0.0), frame(1.0)
        n3 += check("ปิดแสง — เหนือขอบ 14 px ต้องมืดสนิท", col(off, 256), 0)
        n3 += check("เปิดแสง — เหนือขอบ 14 px ต้องสว่างขึ้น",
                    col(on, 256) > 20, True)
        n3 += check("เปิดแสง — ไกล 90 px ต้องกลับมามืด", col(on, 180) < 6, True)
        # **แกนต้องไม่ถูกฟุ้งไปด้วย** — ถ้าเบลอทั้งรูปก็คือภาพเบลอ ไม่ใช่นีออน
        # วัดที่ข้างในรูป ชิดขอบ 2 px: ต้องสว่างเท่ากับตอนปิดแสงเป๊ะ ถ้าแกนถูก
        # เบลอด้วย ค่าตรงนี้จะตกลงมาต่ำกว่าเสมอ
        n3 += check("แกนยังทึบ — ข้างในชิดขอบเท่ากับตอนปิดแสงเป๊ะ",
                    (col(on, 272), col(on, 300)), (col(off, 272), col(off, 300)))
    print(f"   {n3}/4")

# ─── 4 · นับชิ้น ไม่ใช่นับบรรทัด ────────────────────────────────────────────
print("4 · รูปที่เรืองแสงนับเป็นหนึ่งชิ้น")
n4 = 0
n4 += check("สามบรรทัดของรูปเดียวต้องมาจากรูปเดียวกัน",
            len({ln.split(r"\p1}")[-1] for ln in lit}), 1)
n4 += check("ชั้นฟุ้งใช้สตริงรูปเดิมซ้ำ ไม่ได้สร้างเรขาคณิตใหม่",
            all(ln.endswith(r"m 0 0 l 10 0 l 10 4 l 0 4 {\p0}") for ln in lit), True)
print(f"   {n4}/2")

print()
if FAILED:
    print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
    for f in FAILED:
        print(f"   · {f}")
    sys.exit(1)
print("ผ่านหมด")
