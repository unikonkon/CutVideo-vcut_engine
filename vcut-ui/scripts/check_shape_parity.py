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

from vcut_engine import fxtext  # noqa: E402

# ค่าที่กวาด — คลุมค่าตั้งต้น (160 / 0.28) ขอบบน-ล่างของ LIMITS และค่าที่ตกครึ่ง
# พิกเซลพอดี ซึ่งเป็นจุดเดียวที่การปัดของสองภาษาต่างกัน
KINDS = ("arrow", "bar", "dot", "rrect")
SIZES = (4, 5, 7, 10, 33, 100, 160, 161, 250, 333, 1000, 2000)
THICKS = (0.03, 0.1, 0.25, 0.28, 0.5, 0.5523, 0.75, 0.9)


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

    if bad:
        print(f"ต่างกัน {len(bad)}/{len(cases)} กรณี — สูตรสองชุดเพี้ยนจากกันแล้ว\n")
        for c, want, got in bad[:8]:
            print(f"  {c}")
            print(f"    เอนจิน  {want}")
            print(f"    หน้าเว็บ {got}\n")
        if len(bad) > 8:
            print(f"  … อีก {len(bad) - 8} กรณี")
        return 1

    print(f"ตรงกันครบ {len(cases)} กรณี "
          f"({len(KINDS)} ทรง × {len(SIZES)} ขนาด × {len(THICKS)} ความหนา)")
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


if __name__ == "__main__":
    raise SystemExit(main())
