#!/usr/bin/env python3
"""ด่านของชุดสไตล์ข้อความ (fx.PRESET_KEYS)

หกคำถามที่ด่านนี้ตอบ:

  1. เพิ่มชุดสไตล์เข้าโปรเจกต์แล้ว *ไฟล์ ASS ของเดิมยังเหมือนเดิมทุกไบต์* ไหม
     ตราบใดที่ยังไม่มีข้อความชิ้นไหนผูกกับชุด
  2. ผูกแล้ว **ชุดชนะค่าของชิ้น** จริงไหม — และ *ค่าเดิมของชิ้นยังอยู่* ไหม
     (ปลดออกจากชุดต้องได้ของเดิมคืน ไม่ใช่ค่าของชุดค้างอยู่)
  3. ชุดที่อ้างถึงแต่ไม่มีอยู่แล้ว ต้องตกกลับไปใช้ค่าของชิ้นเงียบ ๆ ไม่ใช่พัง
  4. **align ต้องไม่ตามชุดไปด้วย** — จุดยึดบนจอเป็นของรายชิ้นเสมอ ข้อนี้จะดังทันที
     ถ้าวันหนึ่งมีคนเติม "align" ลง PRESET_KEYS เพราะเห็นว่ามันอยู่ใน TEXT_STYLE_KEYS
  5. ชื่อว่าง/ชื่อซ้ำถูกตัดตั้งแต่ตอนอ่าน — ชื่อคือตัวชี้ ซ้ำแล้วตอบไม่ได้ว่าชิ้นไหน
     ผูกกับชุดไหน
  6. เรนเดอร์ผ่าน libass จริงแล้วชุดสไตล์ **ไปถึงภาพ** ไหม
  7. **หน้าเว็บรวมชุดได้ผลเดียวกับเอนจินไหม** — จอตัวอย่างวาดจากร่างที่ยังไม่บันทึก
     ซึ่งเอนจินยังไม่เห็น จึงต้องมีตัวรวมชุดที่ฝั่งเบราว์เซอร์ด้วย (lib/textfx.ts)
     ถ้าสองตัวนี้เพี้ยนกัน จอจะโชว์หน้าตาหนึ่ง ไฟล์ที่ได้เป็นอีกหน้าตาหนึ่ง

รัน:  python3 scripts/check_preset.py
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import fx, fxtext  # noqa: E402

W, H = 1080, 1920

# ไทม์ไลน์จำลอง — หนึ่งชิ้น ยาว 10 วินาที ความเร็วปกติ
MAN = {"segments": [{"i": 0, "name": "a.mp4", "start": 0.0, "dur": 10.0,
                     "at": 0.0, "len": 10.0, "exact_dur": 10.0, "speed": 1.0}],
       "total": 10.0}


def data(texts, presets=None):
    """fx.json ทั้งก้อนที่ผ่านตัวดัดของเอนจินแล้ว — เหมือนที่ load() คืนเป๊ะ"""
    d = fx.blank()
    d["texts"] = [fx._text(t) for t in texts]
    if presets is not None:
        d["presets"] = fx._preset_list(presets)
    return d


def ass(d):
    """เนื้อไฟล์ ASS ทั้งไฟล์ — build_ass คืน (ข้อความ, จำนวนบรรทัดข้อความ)"""
    return fxtext.build_ass(None, W, H, d, MAN)[0]


def style_of(d, i=0):
    rows, _ = fxtext.cues(None, d, MAN)
    return rows[i]["style"]


BASE = {"text": "ภูสอยดาว", "name": "a.mp4", "at": 1.0, "dur": 3.0,
        "size": 54, "color": "#FFFFFF", "font": "Sukhumvit Set",
        "border": 3.0, "align": 2, "bold": False}

HEAD = {"name": "หัวเรื่อง", "size": 96, "color": "#FFD400", "bold": True,
        "font": "Bebas Neue", "border": 6.0}

FAILED = []


def check(name, got, want):
    ok = got == want
    if not ok:
        FAILED.append(f"{name}\n     ได้  {got!r}\n     ควร {want!r}")
    return ok


# ─── 1 · ของเดิมเหมือนเดิมทุกไบต์ ──────────────────────────────────────────
print("1 · ยังไม่มีใครผูกชุด = ไฟล์เดิมทุกไบต์")
n1 = 0
plain = ass(data([BASE]))
n1 += check("มีชุดในไฟล์แต่ไม่มีใครใช้ → ASS เท่าเดิมเป๊ะ",
            ass(data([BASE], [HEAD])), plain)
n1 += check('preset = "" → ASS เท่าเดิมเป๊ะ',
            ass(data([{**BASE, "preset": ""}], [HEAD])), plain)
n1 += check("ชื่อชุดที่ไม่มีอยู่ → ASS เท่าเดิมเป๊ะ",
            ass(data([{**BASE, "preset": "ชุดที่ลบไปแล้ว"}], [HEAD])), plain)
# ไฟล์เก่าที่เขียนก่อนมีฟีเจอร์นี้ไม่มีคีย์ presets เลย — ต้องอ่านได้เหมือนกัน
old = fx.blank()
del old["presets"]
old["texts"] = [fx._text(BASE)]
n1 += check("ไฟล์รุ่นก่อนที่ไม่มีคีย์ presets เลย → อ่านได้ ผลเท่าเดิม",
            ass(old), plain)
print(f"   {n1}/4")

# ─── 2 · ชุดชนะค่าของชิ้น แต่ค่าของชิ้นไม่หาย ──────────────────────────────
print("2 · ชุดชนะ · ค่าเดิมยังอยู่")
n2 = 0
linked = data([{**BASE, "preset": "หัวเรื่อง"}], [HEAD])
st = style_of(linked)
n2 += check("ขนาดต้องมาจากชุด", st["size"], 96)
n2 += check("สีต้องมาจากชุด", st["color"], "#FFD400")
n2 += check("ฟอนต์ต้องมาจากชุด", st["font"], "Bebas Neue")
n2 += check("ตัวหนาต้องมาจากชุด", st["bold"], True)
# ค่าที่ชุดไม่ได้พูดถึงต้องเป็นของชิ้น ไม่ใช่ของสไตล์กลาง
n2 += check("ค่าที่ชุดไม่แตะยังเป็นของชิ้น", st["align"], 2)
# ค่าเดิมของชิ้นต้องยังนอนอยู่ในไฟล์ ไม่ถูกเขียนทับตอนบันทึก
n2 += check("ค่าเดิมของชิ้นยังอยู่ในไฟล์", linked["texts"][0]["size"], 54)
n2 += check("ปลดชุดแล้วได้ค่าเดิมคืน",
            style_of(data([{**BASE, "preset": ""}], [HEAD]))["size"], 54)
n2 += check("แก้ชุดทีเดียว = ทุกชิ้นที่ผูกเปลี่ยนตาม",
            [r["style"]["size"] for r in fxtext.cues(None, data(
                [{**BASE, "preset": "หัวเรื่อง"},
                 {**BASE, "at": 5.0, "preset": "หัวเรื่อง"}],
                [{**HEAD, "size": 120}]), MAN)[0]],
            [120, 120])
n2 += check("ASS ที่ผูกชุดต้องต่างจากที่ไม่ผูก", ass(linked) != plain, True)
print(f"   {n2}/9")

# ─── 3 · align เป็นของรายชิ้นเสมอ ──────────────────────────────────────────
print("3 · align ไม่ตามชุดไปด้วย")
n3 = 0
n3 += check("align ไม่อยู่ใน PRESET_KEYS", "align" in fx.PRESET_KEYS, False)
n3 += check("align อยู่ใน TEXT_STYLE_KEYS (ของรายชิ้น)",
            "align" in fx.TEXT_STYLE_KEYS, True)
# ต่อให้มีคนพิมพ์ align ลงไปในไฟล์เอง ตัวดัดต้องทิ้ง
n3 += check("align ที่พิมพ์ใส่ชุดเองต้องถูกทิ้งตอนอ่าน",
            "align" in fx._preset({**HEAD, "align": 8}), False)
n3 += check("ชิ้นที่ผูกชุดยังใช้ align ของตัวเอง",
            style_of(data([{**BASE, "align": 8, "preset": "หัวเรื่อง"}],
                          [{**HEAD, "align": 2}]))["align"], 8)
print(f"   {n3}/4")

# ─── 4 · ชื่อว่าง/ชื่อซ้ำ ───────────────────────────────────────────────────
print("4 · ชื่อว่าง/ชื่อซ้ำถูกตัดตั้งแต่อ่าน")
n4 = 0
n4 += check("ชื่อว่างถูกตัด",
            [p["name"] for p in fx._preset_list([{"name": "  "}, HEAD])],
            ["หัวเรื่อง"])
n4 += check("ชื่อซ้ำเหลือตัวแรก",
            [p["size"] for p in fx._preset_list([HEAD, {**HEAD, "size": 30}])],
            [96])
n4 += check("ช่องว่างหัวท้ายของชื่อถูกตัด",
            fx._preset({**HEAD, "name": "  หัวเรื่อง  "})["name"], "หัวเรื่อง")
n4 += check("ของที่ไม่ใช่ dict ถูกข้าม",
            len(fx._preset_list(["x", 3, None, HEAD])), 1)
n4 += check("ค่าที่เกินช่วงถูกดัด (ขนาด 9999)",
            fx._preset({**HEAD, "size": 9999})["size"], 2000)
n4 += check("สีที่สะกดผิดตกกลับค่าตั้งต้น",
            fx._preset({**HEAD, "color": "แดง"})["color"], fx.STYLE["color"])
print(f"   {n4}/6")

# ─── 5 · ผ่าน apply() แล้วยังเป็นตัวเดิม ────────────────────────────────────
print("5 · บันทึกผ่าน merge() แล้วอ่านกลับ")
n5 = 0
saved = fx.merge(fx.blank(), {"presets": [HEAD], "texts": [BASE]})
n5 += check("merge เก็บชุดไว้", [p["name"] for p in saved["presets"]],
            ["หัวเรื่อง"])
n5 += check("รอบผ่าน JSON แล้วเท่าเดิม",
            fx._preset_list(json.loads(json.dumps(saved))["presets"]),
            saved["presets"])
n5 += check("ส่งรายการว่างมา = ลบชุดทิ้งจริง",
            fx.merge(saved, {"presets": []})["presets"], [])
n5 += check("ไม่ส่งคีย์ presets มาเลย = ไม่แตะของเดิม",
            fx.merge(saved, {"texts": []})["presets"], saved["presets"])
n5 += check("ชิ้นใหม่เกิดมาไม่ผูกชุด",
            fx.new_text(fx.STYLE, "a.mp4", 0.0, "t0")["preset"], "")
print(f"   {n5}/5")

# ─── 6 · เรนเดอร์ผ่าน libass จริง ───────────────────────────────────────────
print("6 · ชุดสไตล์ไปถึงภาพจริง")
n6 = 0
EXE = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
if not Path(EXE).exists():
    print("   ข้าม — ไม่มี ffmpeg-full ในเครื่องนี้")
else:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)

        def ink(tag, d):
            """นับพิกเซลที่ไม่ดำ — ตัวหนังสือใหญ่ขึ้นต้องได้เลขมากขึ้น

            ข้อความในด่านนี้โผล่วินาทีที่ 1 ยาว 3 วินาที จึงต้องหยิบเฟรมที่ 2
            ไม่ใช่เฟรมแรก — เฟรมแรกยังมืดสนิทและทุกเคสจะได้ 0 เท่ากันหมด
            """
            f = td / f"{tag}.ass"
            f.write_text(ass(d), encoding="utf-8")
            raw = subprocess.run(
                [EXE, "-nostdin", "-v", "error", "-f", "lavfi",
                 "-i", "color=c=black:s=540x960:d=4:r=1", "-ss", "2",
                 "-vf", f"ass={f}", "-frames:v", "1",
                 "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                check=True, capture_output=True).stdout
            return sum(1 for b in raw if b > 40)

        small = ink("small", data([BASE]))
        big = ink("big", data([{**BASE, "preset": "หัวเรื่อง"}], [HEAD]))
        n6 += check("ไม่ผูกชุดต้องมีตัวหนังสือขึ้นจอ", small > 200, True)
        # ชุดสั่งขนาด 96 จาก 54 — พื้นที่หมึกต้องโตขึ้นชัดเจน ไม่ใช่ขยับนิดเดียว
        n6 += check("ผูกชุดขนาด 96 แล้วตัวหนังสือต้องใหญ่ขึ้นจริง",
                    big > small * 1.6, True)
        n6 += check("ชุดที่ไม่มีอยู่จริงต้องให้ภาพเท่ากับไม่ผูกชุด",
                    ink("miss", data([{**BASE, "preset": "ไม่มีชุดนี้"}], [HEAD])),
                    small)
    print(f"   {n6}/3")

# ─── 7 · เทียบกับหน้าเว็บ ───────────────────────────────────────────────────
print("7 · ตัวรวมชุดของหน้าเว็บให้ผลเท่ากับเอนจิน")
n7 = 0
UI = ROOT / "vcut-ui"
CASES = []
for pres in ([], [HEAD], [HEAD, {**HEAD, "name": "ตัวเลข", "size": 140,
                                 "italic": True, "spacing": 6.0}]):
    for want in ("", "หัวเรื่อง", "  หัวเรื่อง  ", "ตัวเลข", "ไม่มีชุดนี้"):
        for item in (BASE, {**BASE, "align": 8, "bold": True, "size": 30,
                            "font": "Arial", "shadow": 2.0, "angle": -8.0}):
            CASES.append({"presets": fx._preset_list(pres),
                          "item": fx._text({**item, "preset": want})})

NODE = r"""
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync("lib/textfx.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const { cases, keys } = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(cases.map((c) => {
  const got = mod.resolveLook(c.item, c.presets, keys);
  return Object.fromEntries([...keys, "align"].map((k) => [k, got[k]]));
})));
"""

if not (UI / "node_modules" / "typescript").exists():
    print("   ข้าม — ยังไม่ได้ npm install ใน vcut-ui")
else:
    node = subprocess.run(
        ["node", "--input-type=module", "-e", NODE],
        input=json.dumps({"cases": CASES, "keys": list(fx.PRESET_KEYS)}),
        capture_output=True, text=True, cwd=UI)
    if node.returncode != 0:
        FAILED.append("รัน node ไม่สำเร็จ\n" + node.stderr[-1200:])
    else:
        theirs = json.loads(node.stdout)
        # รายงานเฉพาะ *คีย์ที่ต่าง* ไม่ใช่ทั้งก้อน — กองสไตล์เต็ม ๆ สองชุดต่อกรณี
        # อ่านไม่ออก แล้วคนจะข้ามผลด่านนี้ไปเลยซึ่งแย่กว่าไม่มีด่าน
        bad = []
        for c, got in zip(CASES, theirs):
            st = style_of(data([c["item"]], c["presets"]))
            diff = {k: (st[k], got.get(k))
                    for k in (*fx.PRESET_KEYS, "align") if st[k] != got.get(k)}
            if diff:
                bad.append((c["item"].get("preset"), diff))
        if bad:
            FAILED.append(
                f"หน้าเว็บรวมชุดไม่ตรงกับเอนจิน {len(bad)}/{len(CASES)} กรณี\n"
                + "\n".join(
                    f"     preset={p!r}  "
                    + " · ".join(f"{k}: เอนจิน {a!r} หน้าเว็บ {b!r}"
                                 for k, (a, b) in d.items())
                    for p, d in bad[:3])
                + (f"\n     … อีก {len(bad) - 3} กรณี" if len(bad) > 3 else ""))
        else:
            n7 += 1
    print(f"   {n7}/1  ({len(CASES)} กรณี)")

print()
if FAILED:
    print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
    for f in FAILED:
        print(f"   · {f}")
    sys.exit(1)
print("ผ่านหมด")
