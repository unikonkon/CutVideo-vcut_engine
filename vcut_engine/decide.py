"""DECIDE — ทำขั้น "เตรียม" กับ "รวม" ต่อกันรวดเดียว (คำสั่งเดิม)

เดิมทั้งหมดอยู่ในไฟล์นี้ ตอนนี้ผ่าออกเป็นสองโมดูลเพราะเป็นงานคนละเรื่อง:

    prepare.py   ดูทีละคลิป — ตัดช่วงไหน ใช้ได้ไหม        → .vcut/pool.json
    compose.py   ดูทั้งกอง — หยิบชิ้นไหนมาเรียงยังไง       → .vcut/edl.json

ไฟล์นี้เหลือหน้าที่เดียวคือเรียกสองตัวนั้นต่อกัน ให้ preset เดิมกับสคริปต์เดิม
ยังใช้ `vcut decide` ได้เหมือนไม่มีอะไรเปลี่ยน

การแปลง [select] → [compose]
    select.enabled = false   →  mode = all      เอาทุกชิ้นในคลัง
    select.enabled = true    →  mode = budget   แบ่งเวลาตาม talk_ratio
"""
from copy import deepcopy

from . import compose, prepare
from .util import info


def _translate(ctx):
    """คืน ctx ที่มี [compose] ตั้งไว้ให้ตรงกับ [select] แบบเดิม (ไม่แตะของจริง)"""
    sel = ctx.get("select", {}) or {}
    cfg = deepcopy(ctx.cfg)
    cm = cfg.setdefault("compose", {})
    if not sel.get("enabled", False) or float(sel.get("target_minutes", 0) or 0) <= 0:
        cm["mode"] = "all"
        return cfg, None

    target = float(sel["target_minutes"])
    ratio = float(sel.get("talk_ratio", 0.62))
    cm.update({
        "mode": "budget",
        "talk_minutes": round(target * ratio, 3),
        "broll_minutes": round(target * (1 - ratio), 3),
        "avoid_adjacent": bool(sel.get("avoid_adjacent", True)),
    })
    return cfg, f"[select] {target:g} นาที × talk_ratio {ratio:g}"


def run(ctx, write=True):
    """write=False = คำนวณอย่างเดียว ไม่แตะไฟล์และไม่พิมพ์อะไร (ใช้ตอนประเมิน)"""
    pool = prepare.run(ctx, write=write)
    cfg, note = _translate(ctx)
    if write and note:
        info(f"  {'แปลงเป็น [compose] budget — ' + note}")

    from .config import Ctx
    sub = Ctx(cfg)
    sub.cfg = cfg
    if not write:
        # ตอนประเมินยังไม่ได้เขียน pool.json ลงดิสก์ — ยัดของในหน่วยความจำให้แทน
        return compose.run_with_pool(sub, pool, write=False)
    return compose.run(sub, write=True)
