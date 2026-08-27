#!/usr/bin/env python3
"""ตรวจชั้นข้อความของขั้น 5 — ตัวเลขที่นับขึ้น กับข้อความที่โผล่ทีละคำ

    python3 scripts/check_text_fx.py

ออก 0 = ผ่านหมด · 1 = มีข้อที่ตก

ตรวจสี่เรื่องที่พังแล้วไม่มีอะไรฟ้อง:

**1 · ค่าชุดเดิมต้องได้ไฟล์ ASS เดิมทุกตัวอักษร**

ขั้น 5 สัญญาว่า "ไม่ตั้งอะไรเลย → ได้ไฟล์เหมือนขั้น 4 เป๊ะ" ซึ่งตรวจได้ด้วยการ
เทียบไฟล์จริง — บรรทัดที่เปลี่ยนไปแม้แต่ตัวอักษรเดียวทำให้คำสัญญานั้นตรวจไม่ได้
อีกต่อไป  ค่าทองด้านล่างแช่ไว้ ห้ามแก้ตามโค้ด

**2 · แท็ก ASS ต้องไม่โดนกลืน**

เขียน `\\alpha` กับ `\\t` ในสตริง Python ที่ไม่ใช่ raw แล้วมันกลายเป็นอักขระ
ควบคุม (BEL กับ TAB) เงียบ ๆ — libass เจอ `{lpha&HFF&` แล้วทิ้งทั้งบล็อกโดยไม่
บ่นอะไร ข้อความยังขึ้นครบ แค่ไม่มีแอนิเมชัน  เจอมาแล้วตอนทำ

**3 · การ์ดหลายบรรทัดต้องมี {n} ชัด ๆ ถึงจะนับ**

ไม่งั้นเลขจะไปแทนทุกบรรทัดในการ์ด — หัวเรื่องกับบรรทัดอังกฤษกลายเป็นตัวเลข
เหมือนกันหมด (เจอมาแล้วเหมือนกัน)

**4 · เลขต้องจบที่ค่าเป้าหมายเป๊ะ**

ค่าสุดท้ายคือสิ่งเดียวที่คนดูจำ ถ้าการไล่ค่าคลาดไปหนึ่งก้าวจะได้ 255.8K แทน
255.9K โดยไม่มีอะไรผิดสังเกต
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import fx, fxtext as ft  # noqa: E402


class Ctx:
    work = None
    transcript = None

    def get(self, k, d=None):
        return d


BASE = {"name": "C0", "at": 0.2, "dur": 1.4, "x": 0.5, "y": 0.4, "size": 64,
        "align": 5, "in": 0.18, "out": 0.14, "text": "สวัสดี ชาวโลก"}

GOLDEN = {
    "none": r"Dialogue: 2,0:00:00.20,0:00:01.60,sub,,0,0,0,,{\an5\pos(540,768)\fs64}สวัสดี ชาวโลก",
    "fade": r"Dialogue: 2,0:00:00.20,0:00:01.60,sub,,0,0,0,,{\an5\pos(540,768)\fs64\fad(180,140)}สวัสดี ชาวโลก",
    "pop": r"Dialogue: 2,0:00:00.20,0:00:01.60,sub,,0,0,0,,{\an5\pos(540,768)\fs64\fad(90,140)\fscx58\fscy58\t(0,111,\fscx112\fscy112)\t(111,180,\fscx100\fscy100)}สวัสดี ชาวโลก",
    "rise": r"Dialogue: 2,0:00:00.20,0:00:01.60,sub,,0,0,0,,{\an5\fs64\move(540,826,540,768,0,180)\fad(180,140)}สวัสดี ชาวโลก",
    "slide": r"Dialogue: 2,0:00:00.20,0:00:01.60,sub,,0,0,0,,{\an5\fs64\move(438,768,540,768,0,180)\fad(180,140)}สวัสดี ชาวโลก",
}
GOLDEN_PLATE = r"Dialogue: 2,0:00:00.20,0:00:01.60,subplate,,0,0,0,,{\an5\pos(540,768)\fs64\3c&H00000000&\3a&H8C&\bord14\shad0\fad(180,140)}สวัสดี ชาวโลก"


def events(item):
    d = fx.merge(fx.blank(), {"texts": [item]})
    man = {"version": 1, "total": 3.0, "touched": 0, "segments": [
        {"i": 0, "name": "C0", "kind": "TALK", "start": 0.0, "dur": 3.0,
         "file": "s0.mov", "exact_dur": 3.0, "len": 3.0, "at": 0.0,
         "speed": 1.0, "frames": 90, "fx": False, "out": "s0.mov",
         "effects": dict(fx.CLIP)}]}
    txt, _ = ft.build_ass(Ctx(), 1080, 1920, fxdata=d, man=man)
    return [ln for ln in txt.splitlines() if ln.startswith("Dialogue")]


def main():
    bad = []

    # ── 1 · ค่าชุดเดิมได้ไฟล์เดิม ──
    ok = 0
    for anim, want in GOLDEN.items():
        got = events({**BASE, "anim": anim})
        if len(got) != 1 or got[0] != want:
            bad.append(f"ASS ของ anim={anim} เปลี่ยนไป\n"
                       f"    ต้องได้ {want}\n    ได้จริง {got[0] if got else '(ว่าง)'}")
        else:
            ok += 1
    got = events({**BASE, "anim": "fade", "plate": True})
    if len(got) != 1 or got[0] != GOLDEN_PLATE:
        bad.append("ASS ของกล่องพื้นหลังเปลี่ยนไป\n"
                   f"    ต้องได้ {GOLDEN_PLATE}\n    ได้จริง {got[0] if got else '(ว่าง)'}")
    else:
        ok += 1
    print(f"1 · ค่าชุดเดิมได้ ASS เดิม        {ok}/{len(GOLDEN) + 1}")

    # ── 2 · แท็กทีละคำต้องสมบูรณ์ ──
    ok = 0
    for kind, want_tag in (("fade_words", r"\alpha"), ("pop_words", r"\fscx112")):
        line = events({**BASE, "anim": kind, "text": "หนึ่ง สอง สาม"})[0]
        ctrl = [c for c in line if ord(c) < 32 and c != "\n"]
        if ctrl:
            bad.append(f"{kind}: มีอักขระควบคุมหลุดในบรรทัด {ctrl!r} — "
                       r"เขียน \alpha / \t ในสตริงที่ไม่ใช่ raw string")
        elif want_tag not in line:
            bad.append(f"{kind}: ไม่พบแท็ก {want_tag} ในบรรทัด")
        elif line.count(r"\alpha&HFF&") != 3:
            bad.append(f"{kind}: ควรมีสามคำ แต่นับแท็กได้ "
                       f"{line.count(chr(92) + 'alpha&HFF&')}")
        else:
            # เวลาของคำสุดท้ายต้องจบก่อนชิ้นหาย
            last = max(int(m) for m in re.findall(r"\\t\((?:\d+),(\d+),", line))
            if last > BASE["dur"] * 1000:
                bad.append(f"{kind}: คำสุดท้ายจบที่ {last}ms เกินความยาวชิ้น "
                           f"{BASE['dur'] * 1000:.0f}ms")
            else:
                ok += 1
    print(f"2 · แท็กทีละคำสมบูรณ์            {ok}/2")

    # ── 3 · การ์ดต้องมี {n} ──
    ok = 0
    card_no = {**BASE, "text": "", "count": "k", "count_from": 0, "count_to": 9000,
               "lines": [{"text": "หัวเรื่อง", "size": 40},
                         {"text": "ชื่อใหญ่", "size": 90}]}
    ev = events(card_no)
    if len(ev) != 2:
        bad.append(f"การ์ดที่ไม่มี {{n}} ควรได้ 2 บรรทัด (ไม่นับให้) แต่ได้ {len(ev)}")
    elif sorted(ln.split(",,")[-1].split("}")[-1] for ln in ev) != \
            ["ชื่อใหญ่", "หัวเรื่อง"]:
        # ดูเฉพาะ *เนื้อ* หลังปีกกาปิด ไม่ใช่ทั้งบรรทัด — แท็กมีตัวเลขของมันเอง
        # (\fs90 ก็มีเลข 9) เทียบทั้งบรรทัดจะตกทั้งที่ยังถูกอยู่
        bad.append("การ์ดที่ไม่มี {n} ถูกแทนด้วยตัวเลข — บรรทัดอื่นจะกลายเป็นเลขไปด้วย\n"
                   f"    ได้ {[ln.split(',,')[-1].split('}')[-1] for ln in ev]}")
    else:
        ok += 1
    card_yes = {**card_no, "lines": [{"text": "หัวเรื่อง", "size": 40},
                                     {"text": "{n} ครั้ง", "size": 90}]}
    ev = events(card_yes)
    head = [ln for ln in ev if "หัวเรื่อง" in ln]
    if len(head) != 1:
        bad.append(f"บรรทัดที่ไม่มี {{n}} ควรออกครั้งเดียว แต่ออก {len(head)} ครั้ง")
    elif len(ev) < 5:
        bad.append(f"บรรทัดที่มี {{n}} ควรถูกซอยเป็นหลายก้าว แต่ได้ทั้งการ์ด {len(ev)} บรรทัด")
    else:
        ok += 1
    print(f"3 · การ์ดต้องมี {{n}} ถึงจะนับ     {ok}/2")

    # ── 4 · เลขจบที่ค่าเป้าหมาย ──
    ok = 0
    for kind, to, want in (("k", 255900, "255.9K"), ("comma", 1234, "1,234"),
                           ("1dp", 14.6, "14.6"), ("pct", 45, "45%"),
                           ("int", 2000, "2000")):
        ev = events({**BASE, "text": "{n}", "count": kind,
                     "count_from": 0, "count_to": to})
        tail = ev[-1].split(",,")[-1]
        body = tail.split("}")[-1]
        if body != want:
            bad.append(f"นับแบบ {kind}: ก้าวสุดท้ายได้ {body!r} ควรเป็น {want!r}")
        else:
            ok += 1
    print(f"4 · เลขจบที่ค่าเป้าหมาย          {ok}/5")

    if bad:
        print(f"\nตก {len(bad)} ข้อ\n")
        for b in bad:
            print("  · " + b)
        return 1
    print("\nผ่านหมด")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
