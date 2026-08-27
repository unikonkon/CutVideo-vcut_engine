#!/usr/bin/env python3
"""เทียบสูตรรูปทรงของหน้าเว็บกับของเอนจิน — ต้องตรงกันทีละตัวอักษร

lib/shapes.ts มีสูตรรูปชุดที่สองเพราะพรีวิวต้องขยับตามตอนลากแถบขนาด ซึ่งเป็น
สิ่งที่ fxtext.shape_cues เตือนไว้ว่าวันหนึ่งสองชุดจะเพี้ยนจากกัน  สคริปต์นี้คือ
ตัวที่ทำให้ "วันหนึ่ง" นั้นถูกจับได้ทันที ไม่ใช่ตอนที่มีคน render แล้วเห็นลูกศร
คนละทรงกับที่พรีวิววาดไว้

    python3 scripts/check_shape_parity.py

ออก 0 = ตรงกันหมด · ออก 1 = ต่างกัน แล้วพิมพ์คู่ที่ต่างให้ดู
"""
import json
import subprocess
import sys
from pathlib import Path

UI = Path(__file__).resolve().parent.parent
ENGINE = UI.parent
sys.path.insert(0, str(ENGINE))

from vcut_engine import fxtext, journey  # noqa: E402

# ค่าที่กวาด — คลุมค่าตั้งต้น (160 / 0.28) ขอบบน-ล่างของ LIMITS และค่าที่ตกครึ่ง
# พิกเซลพอดี ซึ่งเป็นจุดเดียวที่การปัดของสองภาษาต่างกัน
KINDS = ("arrow", "bar", "dot", "rrect")
SIZES = (4, 5, 7, 10, 33, 100, 160, 161, 250, 333, 1000, 2000)
THICKS = (0.03, 0.1, 0.25, 0.28, 0.5, 0.5523, 0.75, 0.9)


# ความแรงของแสงฟุ้ง + ขนาดจอที่กวาด — ตัวคูณอยู่คนละภาษาสองชุด จึงต้องเทียบ
# ด้วย เพดานคิดจากด้านสั้นของจอ จอแนวตั้ง/แนวนอนจึงต้องมีทั้งคู่
GLOWS = (0.0, 0.005, 0.01, 0.011, 0.35, 0.6, 1.0, 1.4, -0.2)
FRAMES = ((1080, 1920), (1920, 1080), (3840, 2160), (640, 640))


def main():
    cases = [{"kind": k, "size": s, "thick": t}
             for k in KINDS for s in SIZES for t in THICKS]

    node = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_SRC],
        input=json.dumps(cases), capture_output=True, text=True, cwd=UI)
    if node.returncode != 0:
        print("รัน node ไม่สำเร็จ:\n" + node.stderr[-2000:])
        return 1
    theirs = json.loads(node.stdout)

    bad = []
    for c, got in zip(cases, theirs):
        want = fxtext.path_of(c["kind"], c["size"], c["thick"])
        if want != got:
            bad.append((c, want, got))

    # ── แสงฟุ้ง ──
    gcases = [{"kind": k, "size": s, "thick": t, "glow": g, "w": w, "h": h}
              for k in ("dot", "rrect") for s in (60, 161, 600) for t in (0.06, 0.28, 0.9)
              for g in GLOWS for (w, h) in FRAMES]
    gnode = subprocess.run(
        ["node", "--input-type=module", "-e", GLOW_SRC],
        input=json.dumps(gcases), capture_output=True, text=True, cwd=UI)
    if gnode.returncode != 0:
        print("รัน node (แสงฟุ้ง) ไม่สำเร็จ:\n" + gnode.stderr[-2000:])
        return 1
    for c, got in zip(gcases, json.loads(gnode.stdout)):
        thick = c["size"] * (0.5 if c["kind"] == "dot" else c["thick"])
        unit = journey.glow_unit(thick, c["w"], c["h"])
        want = [{"bord": round(unit * bo * max(0.0, min(1.0, c["glow"])), 6),
                 "blur": round(unit * bl * max(0.0, min(1.0, c["glow"])), 6),
                 "op": op}
                for bo, bl, op in journey.GLOW] \
            if max(0.0, min(1.0, c["glow"])) > 0.01 else []
        got = [{k: round(v, 6) if k != "op" else v for k, v in g.items()} for g in got]
        if want != got:
            bad.append((c, want, got))

    if bad:
        print(f"ต่างกัน {len(bad)}/{len(cases) + len(gcases)} กรณี "
              "— สูตรสองชุดเพี้ยนจากกันแล้ว\n")
        for c, want, got in bad[:8]:
            print(f"  {c}")
            print(f"    เอนจิน  {want}")
            print(f"    หน้าเว็บ {got}\n")
        if len(bad) > 8:
            print(f"  … อีก {len(bad) - 8} กรณี")
        return 1

    print(f"ตรงกันครบ {len(cases)} กรณี "
          f"({len(KINDS)} ทรง × {len(SIZES)} ขนาด × {len(THICKS)} ความหนา)"
          f" + แสงฟุ้ง {len(gcases)} กรณี")
    return 0


# แปลง lib/shapes.ts เป็น JS ด้วย tsc ที่โปรเจกต์ใช้อยู่แล้ว ไม่ใช่ regex ถอด
# type เอง — ตัวถอดเองพังทันทีที่มี type ที่ซับซ้อนกว่าที่มันรู้จัก (เจอมาแล้วกับ
# `nd: 0 | 1`) แล้วข้อความผิดพลาดจะชี้ไปที่ data: URL ยาวสามหน้า อ่านไม่ออกเลย
NODE_SRC = r"""
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync("lib/shapes.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const cases = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(
  JSON.stringify(cases.map((c) => mod.shapePath(c.kind, c.size, c.thick))),
);
"""


GLOW_SRC = r"""
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync("lib/shapes.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const cases = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(cases.map((c) =>
  mod.glowLayers(c.kind, c.size, c.thick, c.glow, c.w, c.h))));
"""


if __name__ == "__main__":
    raise SystemExit(main())
