#!/usr/bin/env python3
"""เทียบสูตรตัวเลขที่นับขึ้นของหน้าเว็บกับของเอนจิน — ต้องตรงกันทีละตัวอักษร

    python3 scripts/check_text_parity.py

ออก 0 = ตรงกันหมด · 1 = ต่างกัน แล้วพิมพ์คู่ที่ต่างให้ดู

lib/textfx.ts มีสูตรจัดรูปตัวเลขชุดที่สอง เพราะจอตัวอย่างต้องวาดเลขตามเส้น
หัวเล่นที่ลากอยู่ ซึ่งเป็นสถานะที่เอนจินไม่รู้จักจนกว่าจะบันทึก

**จุดที่พังง่ายที่สุดคือการปัดครึ่ง** — Python ปัดเข้าหาเลขคู่ ส่วน toFixed ของ JS
ปัดออกจากศูนย์  1250/1000 = 1.25 → Python ได้ "1.2" · toFixed ได้ "1.3"
และเลขกลม ๆ แบบ 1250 · 2350 · 12500 คือเลขที่คนตั้งเป็นเป้าจริงตลอด ไม่ใช่
กรณีมุมที่ไม่มีวันเจอ  ชุดค่าทดสอบด้านล่างจึงกวาดตัวที่ตกครึ่งพอดีเป็นพิเศษ
"""
import json
import re
import subprocess
import sys
from pathlib import Path

UI = Path(__file__).resolve().parent.parent
ENGINE = UI.parent
sys.path.insert(0, str(ENGINE))

from vcut_engine import fxtext  # noqa: E402

KINDS = ("int", "comma", "k", "pct", "1dp")

# ค่าที่กวาด — เลขกลม · เลขที่ตกครึ่งพอดีที่ทศนิยมหนึ่งตำแหน่งหลังหารพัน/ล้าน ·
# ค่าติดลบ · ค่าคาบเกี่ยวขอบ K กับ M
VALUES = [
    0, 1, 7, 9, 10, 45, 99, 100, 500, 999, 1000, 1001,
    1050, 1150, 1250, 1350, 1450, 2350, 2450,      # ตกครึ่งที่ .1f หลังหารพัน
    9950, 12500, 14600, 25500, 99950,
    145900, 255900, 999949, 999950, 1000000, 1250000, 2350000,
    -5, -1250, -255900, 0.5, 1.5, 2.5, 14.55, 14.65, 0.25, 0.35,
]


def main():
    cases = [{"v": v, "kind": k} for k in KINDS for v in VALUES]

    node = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_SRC],
        input=json.dumps(cases), capture_output=True, text=True, cwd=UI)
    if node.returncode != 0:
        print("รัน node ไม่สำเร็จ:\n" + node.stderr[-2000:])
        return 1
    theirs = json.loads(node.stdout)

    bad = []
    for c, got in zip(cases, theirs):
        want = fxtext._fmt_count(float(c["v"]), c["kind"])
        if want != got:
            bad.append((c, want, got))

    if bad:
        print(f"ต่างกัน {len(bad)}/{len(cases)} กรณี — สูตรสองชุดเพี้ยนจากกันแล้ว\n")
        for c, want, got in bad[:10]:
            print(f"  {c['kind']:6} {c['v']!r:>12}   เอนจิน {want!r:>12}   "
                  f"หน้าเว็บ {got!r}")
        if len(bad) > 10:
            print(f"  … อีก {len(bad) - 10} กรณี")
        return 1

    print(f"1 · รูปแบบตัวเลข   ตรงกันครบ {len(cases)} กรณี "
          f"({len(KINDS)} รูปแบบ × {len(VALUES)} ค่า)")

    # ── จังหวะไล่ทีละคำ ──
    #
    # เอนจินเขียนจังหวะลงแท็ก \t(t0,t1,...) ส่วนหน้าเว็บคำนวณเองเพื่อวาดตามเส้น
    # หัวเล่น  ถ้าสองฝั่งคิดคนละจังหวะ จอตัวอย่างจะโชว์คำโผล่ไม่ตรงกับไฟล์ที่ได้
    wcases = [(n, i, dur) for n in (2, 3, 5, 8)
              for i in (0.08, 0.18, 0.30, 0.5)
              for dur in (0.4, 1.0, 2.5, 6.0)]
    node = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_WORDS],
        input=json.dumps([{"n": n, "inSec": i, "dur": d, "outSec": 0.14}
                          for n, i, d in wcases]),
        capture_output=True, text=True, cwd=UI)
    if node.returncode != 0:
        print("รัน node (จังหวะคำ) ไม่สำเร็จ:\n" + node.stderr[-1500:])
        return 1
    theirs_w = json.loads(node.stdout)

    wbad = []
    for (n, i, dur), got in zip(wcases, theirs_w):
        txt = " ".join(["ก"] * n)
        line = fxtext.stagger_words(txt, "fade_words",
                                    *_engine_budget(i, dur, 0.14))
        want = [{"t0": int(a), "d": int(b) - int(a)}
                for a, b in re.findall(r"\\t\((\d+),(\d+),", line)]
        if want != got:
            wbad.append(((n, i, dur), want, got))
    if wbad:
        print(f"\n2 · จังหวะไล่ทีละคำ  ต่างกัน {len(wbad)}/{len(wcases)} กรณี\n")
        for c, want, got in wbad[:6]:
            print(f"  คำ={c[0]} in={c[1]} ยาว={c[2]}")
            print(f"    เอนจิน  {want}")
            print(f"    หน้าเว็บ {got}")
        return 1
    print(f"2 · จังหวะไล่ทีละคำ ตรงกันครบ {len(wcases)} กรณี")
    return 0


def _engine_budget(in_sec, dur, out_sec):
    """(ti, room) ที่ stagger_words ของเอนจินจะได้รับจาก build_ass"""
    ti, to = fxtext._budget(0.0, dur, {"in": in_sec, "out": out_sec})
    return (ti or 180), max(0.0, dur * 1000.0 - to)


NODE_SRC = r"""
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync("lib/textfx.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const cases = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(
  JSON.stringify(cases.map((c) => mod.formatCount(c.v, c.kind))),
);
"""


NODE_WORDS = r"""
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync("lib/textfx.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const cases = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(
  cases.map((c) => mod.wordTimings(c.n, c.inSec, c.dur, c.outSec)),
));
"""


if __name__ == "__main__":
    raise SystemExit(main())
