#!/usr/bin/env python3
"""ด่านของฟอร์มตั้งค่า (settings.FIELDS ↔ config/default.toml)

แปดคำถามที่ด่านนี้ตอบ:

  1. **ทุกคีย์ที่เอนจินอ่านจริง มีช่องให้แก้ในหน้าเว็บไหม** — และไม่มีช่องที่ชี้ไป
     ที่คีย์ซึ่งไม่มีอยู่จริง  ข้อนี้คือเหตุผลที่ด่านนี้เกิด: ตอนเขียนมี 48 คีย์ใน
     default.toml ที่เอนจินอ่านทุกครั้งที่รัน แต่ฟอร์มไม่มีช่องให้ — ไม่มีอะไรฟ้อง
     เพราะทั้งสองฝั่งต่างก็ "ถูก" ในไฟล์ของตัวเอง
  2. stage/tier ที่ทุกช่องอ้างถึง มีอยู่ในตารางจริง — stage ที่พิมพ์ผิดเคยไปโผล่
     เป็นหัวข้อชื่อดิบในหน้าเว็บโดยไม่มีใครสังเกต
  3. ช่องแบบเลือก (select/multi) — **ค่าตั้งต้นต้องเป็นหนึ่งในตัวเลือก** ไม่งั้น
     เปิดหน้ามาช่องจะว่าง แล้วการกดบันทึกครั้งแรกจะเปลี่ยนค่าโดยที่ไม่มีใครตั้งใจ
  4. ชนิดของช่องตรงกับชนิดของค่าจริงในไฟล์ (list_str ต้องเป็นลิสต์ของ str ฯลฯ)
  5. ช่องตัวเลขที่มี min/max — ค่าตั้งต้นต้องอยู่ในช่วง ไม่งั้น slider เปิดมาก็ผิด
  6. **เขียนกลับแล้วได้ค่าเดิม** — วนทุกช่อง เขียนค่าปัจจุบันลงไฟล์โปรเจกต์ผ่าน
     ทางเดียวกับที่หน้าเว็บใช้ แล้วอ่านกลับมาเทียบ  จับ type drift (18 → 18.0),
     คีย์ที่ไปโผล่ผิดตาราง และ list ที่ถูกเขียนเป็น string
  7. **คีย์ในตารางซ้อนต้องลงตารางของตัวเอง** — video.blur.sigma ต้องไปอยู่ใต้
     [video.blur] ไม่ใช่ [video] ซึ่งเอนจินจะอ่านไม่เจอและตกไปใช้ค่าตั้งต้นเงียบ ๆ
  8. STEP_PARAMS ชี้ไปที่คีย์ที่มีจริง — ชี้ผิดแล้วขั้นนั้นจะ "ไม่เก่าเลยสักที"
     เพราะเทียบค่ากับ None ทั้งสองรอบ

รัน:  python3 scripts/check_setup.py
"""
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from vcut_engine import settings  # noqa: E402

DEFAULT = ROOT / "config" / "default.toml"
FAILED = []

# ตารางที่เป็น "แผนที่ของคลิป" ไม่ใช่กลุ่มค่าตั้ง — คีย์ในนั้นคือชื่อคลิป ซึ่ง
# เปลี่ยนทุกโปรเจกต์ จึงนับทั้งตารางเป็นค่าเดียว
MAPS = {"scan.rotation_overrides", "video.vertical_overrides"}


def leaves(node, pre=""):
    for k, v in node.items():
        p = f"{pre}{k}"
        if isinstance(v, dict) and p not in MAPS:
            yield from leaves(v, p + ".")
        else:
            yield p, v


CFG = tomllib.load(DEFAULT.open("rb"))
VALUES = dict(leaves(CFG))
BY_KEY = settings.FIELD_BY_KEY

print(f"default.toml {len(VALUES)} คีย์ · FIELDS {len(settings.FIELDS)} ช่อง\n")

# ── 1 · ครบทั้งสองทาง ────────────────────────────────
print("1. ทุกคีย์ที่เอนจินอ่าน มีช่องให้แก้")
miss = [k for k in VALUES if k not in BY_KEY]
ghost = [f["key"] for f in settings.FIELDS if f["key"] not in VALUES]
dup = [k for k in BY_KEY if sum(1 for f in settings.FIELDS if f["key"] == k) > 1]
if miss:
    FAILED.append(f"{len(miss)} คีย์ไม่มีช่องให้แก้: {', '.join(miss[:8])}"
                  + (" …" if len(miss) > 8 else ""))
if ghost:
    FAILED.append(f"{len(ghost)} ช่องชี้ไปที่คีย์ที่ไม่มีใน default.toml: "
                  + ", ".join(ghost[:8]))
if dup:
    FAILED.append(f"ช่องซ้ำคีย์: {', '.join(dup)}")
print(f"   {'ok' if not (miss or ghost or dup) else 'ไม่ผ่าน'}"
      f"  (ขาด {len(miss)} · เกิน {len(ghost)} · ซ้ำ {len(dup)})")

# ── 2 · stage / tier มีจริง ────────────────────────────────
print("2. stage/tier ที่อ้างถึงมีอยู่จริง")
bad = [f'{f["key"]} → stage={f["stage"]}' for f in settings.FIELDS
       if f["stage"] not in settings.STAGE_ORDER]
bad += [f'{f["key"]} → tier={f["tier"]}' for f in settings.FIELDS
        if f["tier"] not in settings.TIERS]
if bad:
    FAILED.append("stage/tier ไม่รู้จัก: " + ", ".join(bad[:6]))
print(f"   {len(settings.FIELDS) - len(bad)}/{len(settings.FIELDS)}")

# ── 3 · ค่าตั้งต้นของช่องแบบเลือก ต้องเป็นหนึ่งในตัวเลือก ────────────────
print("3. ค่าตั้งต้นของ select/multi อยู่ในตัวเลือก")
bad = []
for f in settings.FIELDS:
    opts, cur = f.get("options"), VALUES.get(f["key"])
    if not opts:
        continue
    if f["type"] == "select" and cur not in opts:
        bad.append(f'{f["key"]}: {cur!r} ∉ {opts}')
    if f["type"] in ("multi", "multi_order") and isinstance(cur, list):
        stray = [x for x in cur if x not in opts]
        if stray:
            bad.append(f'{f["key"]}: {stray} ∉ {opts}')
    stray = [k for k in (f.get("labels") or {}) if k not in opts]
    if stray:
        bad.append(f'{f["key"]}: labels เกินตัวเลือก {stray}')
if bad:
    FAILED.append("ค่าตั้งต้นไม่ตรงตัวเลือก: " + " · ".join(bad[:5]))
print(f"   {'ok' if not bad else f'ไม่ผ่าน {len(bad)} ช่อง'}")

# ── 4 · ชนิดของช่องตรงกับชนิดของค่าจริง ────────────────────────────────
print("4. ชนิดของช่องตรงกับค่าจริงในไฟล์")
WANT = {
    "bool": lambda v: isinstance(v, bool),
    "int": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "float": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "str": lambda v: isinstance(v, str),
    "path": lambda v: isinstance(v, str),
    "text": lambda v: isinstance(v, str),
    "select": lambda v: isinstance(v, str),
    "multi": lambda v: isinstance(v, list),
    "multi_order": lambda v: isinstance(v, list),
    "list_float": lambda v: isinstance(v, list) and all(
        isinstance(x, (int, float)) for x in v),
    "list_str": lambda v: isinstance(v, list) and all(isinstance(x, str) for x in v),
    "clips": lambda v: isinstance(v, (list, dict)),
}
bad = [f'{f["key"]}: {f["type"]} แต่ค่าเป็น {type(VALUES[f["key"]]).__name__}'
       for f in settings.FIELDS
       if f["key"] in VALUES and not WANT[f["type"]](VALUES[f["key"]])]
if bad:
    FAILED.append("ชนิดไม่ตรง: " + " · ".join(bad[:6]))
print(f"   {'ok' if not bad else f'ไม่ผ่าน {len(bad)} ช่อง'}")

# ── 5 · ค่าตั้งต้นอยู่ในช่วง min/max ────────────────────────────────
print("5. ค่าตั้งต้นอยู่ในช่วงของ slider")
bad = []
for f in settings.FIELDS:
    v = VALUES.get(f["key"])
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        continue
    lo, hi = f.get("min"), f.get("max")
    if lo is not None and v < lo:
        bad.append(f'{f["key"]}: {v} < min {lo}')
    if hi is not None and v > hi:
        bad.append(f'{f["key"]}: {v} > max {hi}')
if bad:
    FAILED.append("ค่าตั้งต้นหลุดช่วง: " + " · ".join(bad[:6]))
print(f"   {'ok' if not bad else f'ไม่ผ่าน {len(bad)} ช่อง'}")

# ── 6+7 · เขียนกลับแล้วได้ค่าเดิม และลงตารางที่ถูก ────────────────────────────────
print("6. เขียนค่าทุกช่องกลับลงไฟล์แล้วอ่านได้ค่าเดิม")
skip = {f["key"] for f in settings.FIELDS if f["type"] == "clips"}
changes = {k: v for k, v in VALUES.items() if k not in skip}
body = settings.patch_toml("", changes)
try:
    got = dict(leaves(tomllib.loads(body)))
except tomllib.TOMLDecodeError as e:
    got = {}
    FAILED.append(f"ไฟล์ที่เขียนออกมาอ่านไม่ได้: {e}")
lost = [k for k in changes if k not in got]
drift = [f"{k}: {changes[k]!r} → {got[k]!r}" for k in changes
         if k in got and got[k] != changes[k]]
if lost:
    FAILED.append(f"{len(lost)} คีย์หายไปตอนเขียน (หรือไปโผล่ผิดตาราง): "
                  + ", ".join(lost[:8]))
if drift:
    FAILED.append(f"{len(drift)} คีย์เปลี่ยนค่าตอนเขียนกลับ: " + " · ".join(drift[:5]))
print(f"   {len(changes) - len(lost) - len(drift)}/{len(changes)}")

print("7. คีย์ในตารางซ้อนลงตารางของตัวเอง")
nested = [k for k in changes if k.count(".") >= 2]
bad = []
for k in nested:
    tbl = k.rpartition(".")[0]
    if f"[{tbl}]" not in body:
        bad.append(k)
if bad:
    FAILED.append("ตารางซ้อนหาย: " + ", ".join(bad[:6]))
print(f"   {len(nested) - len(bad)}/{len(nested)}")

# ── 8 · STEP_PARAMS ชี้ไปที่ของจริง ────────────────────────────────
print("8. STEP_PARAMS ชี้ไปที่คีย์/ตารางที่มีจริง")
bad = []
for sid, keys in settings.STEP_PARAMS.items():
    for k in keys:
        if k in VALUES or any(x.startswith(k + ".") for x in VALUES) or k in MAPS:
            continue
        bad.append(f"{sid} → {k}")
if bad:
    FAILED.append("STEP_PARAMS ชี้ไปที่ของที่ไม่มี: " + ", ".join(bad))
print(f"   {'ok' if not bad else f'ไม่ผ่าน {len(bad)} รายการ'}")

print()
if FAILED:
    print(f"❌ ไม่ผ่าน {len(FAILED)} ข้อ")
    for f in FAILED:
        print(f"   · {f}")
    sys.exit(1)
print("ผ่านหมด")
