"""VARIANTS — ตัดหลายแบบจาก segment cache เดียว → .vcut/variants/<สไตล์>/<id>/

โจทย์ของหน้าเว็บ 3 ขั้น: ใส่วิดีโอ → เลือกสไตล์ → **ได้ 6 แบบให้เลือก** แล้วค่อย
แต่ง/ส่งออกแบบที่ชอบ  เอนจินเดิมมี edl.json · render.json · ไฟล์ออก ชุดเดียวต่อ
โปรเจกต์ — รันแบบที่ 2 ทับแบบที่ 1 (docs/PLAN-quick-cut.md · G3)

**หกแบบต่างกันที่ "การตัด" (EDL) ไม่ใช่ที่หน้าตา** — เพราะแบบที่ต่างกันแค่การ
เลือก/เรียงชิ้นใช้เวลา 4–30 วิต่อแบบ (segment ที่ซ้ำกันถูกตัดครั้งเดียว) ส่วนชั้น
แต่ง (ขั้น 4/5) ต้องเข้ารหัสทั้งเรื่องใหม่ทุกครั้ง จึงใส่ให้เฉพาะแบบที่คนเลือกแล้ว
ผ่าน `vcut autofx` (ดู autofx.py)

**แยกตามสไตล์ (2026-09-04 · UI v6)** — หน้า ③ มีแท็บสไตล์ A–D + กำหนดเอง ที่ตัด
แล้วอยู่พร้อมกันได้ จึงเก็บเป็น `variants/<สไตล์>/<id>/` สไตล์ = `[autofx] style`
ของโปรเจกต์ (sell · proof · teach · compare) หรือ `custom` เมื่อว่าง  แต่ละสไตล์มี
`index.json` ของตัวเอง ส่วนแบบที่ active อยู่ (ชุดไฟล์ที่นอนใน .vcut/ ตอนนี้) มี
ได้ชุดเดียวทั้งโปรเจกต์ → `variants/active.json` = {style, id}
ของเก่าที่เป็น `variants/<id>/` แบน ๆ ถูกย้ายเข้าสไตล์ของโปรเจกต์ให้เองครั้งแรกที่อ่าน

**ทำงานยังไง** — ทุกแบบคือ ctx เดียวกันทับด้วยค่าไม่กี่ตัว (CATALOG[i]["set"])
แล้วเดิน prepare → compose → render → assemble ตามปกติ ไฟล์กลางที่ขั้นพวกนั้น
เขียนลง .vcut/ ถูกคัดลอกเก็บเข้าโฟลเดอร์ของแบบทันทีที่แบบนั้นเสร็จ  ทำครบทุกแบบ
แล้ว "activate" แบบตั้งต้น (s45 หรือแบบแรกที่สำเร็จ) กลับเข้า .vcut/ ให้ขั้น 4/5
ทำต่อได้เหมือนไม่มีอะไรเปลี่ยน — ทุกคำสั่งเดิม (caption · fx · view) ยังอ่าน
edl.json/render.json ที่เดิม ไม่ต้องรู้จักคำว่า "แบบ" เลย

**activate = สลับชุดไฟล์** — ก่อนสลับ ไฟล์ที่คนแก้ได้ของแบบปัจจุบัน (edl · render ·
pool · fx.json · captions.json) ถูกเก็บกลับเข้าโฟลเดอร์ของมันก่อน สลับไปมาจึงไม่
เสียของที่แต่งไว้ในแต่ละแบบ  สลับข้ามสไตล์ได้ แต่โปรเจกต์ต้อง extends preset ของ
สไตล์นั้นอยู่ (หน้าเว็บบันทึก extends ก่อนเสมอ) ไม่งั้น autofx/เรนเดอร์ใหม่จะใช้ค่าผิดชุด
"""
import shutil
import time
from copy import deepcopy

from . import config
from .util import c, die, hhmmss, info, read_json, warn, write_json

DIR = "variants"
INDEX = "index.json"
ACTIVE = "active.json"
CUSTOM = "custom"
STYLES = ("sell", "proof", "teach", "compare", CUSTOM)

# ── หกแบบ (2026-09-03 · memory ui-v3-decisions ข้อ 1) ──
#
# ทุกแบบต่อยอดจากค่าของโปรเจกต์ (สไตล์ A–D คือ preset ที่ extends) แล้วทับด้วย
# `set` เท่านั้น — สไตล์ตัดสินจังหวะ/ความดัง/ผืน ส่วนแบบตัดสินแค่ "ยาวเท่าไร ·
# เลือกชิ้นยังไง"  `autofx` คือค่าที่ทับ [autofx] ตอนแบบนี้ถูก activate
CATALOG = [
    {"id": "s30", "label": "30 วิ", "note": "ย่อให้พอดี 30 วิ · ประโยคคะแนนสูงก่อน",
     "set": {"compose.mode": "fit", "compose.target_minutes": 0.5}},
    {"id": "s45", "label": "45 วิ", "note": "ย่อให้พอดี 45 วิ · ประโยคคะแนนสูงก่อน",
     "set": {"compose.mode": "fit", "compose.target_minutes": 0.75}},
    {"id": "s60", "label": "60 วิ", "note": "ย่อให้พอดี 60 วิ · ประโยคคะแนนสูงก่อน",
     "set": {"compose.mode": "fit", "compose.target_minutes": 1.0}},
    {"id": "tight", "label": "ตัดชิดทั้งคลิป", "note": "เก็บทุกประโยค ลบเฉพาะช่วงเงียบ",
     "set": {"compose.mode": "all", "compose.target_minutes": 0.0}},
    {"id": "ai45", "label": "AI ไฮไลต์ 45 วิ", "note": "AI เลือกช่วงที่ควรเก็บ แล้วย่อ 45 วิ",
     "set": {"compose.mode": "fit", "compose.target_minutes": 0.75,
             "ai.apply.enabled": True, "ai.apply.trim": True,
             # เศษครึ่งวินาทีจากขอบที่ AI ตอบเป็นวินาทีเต็มไปเฉียดรอยตัดชน
             # (PLAN-quick-cut ข้อ 5) — ทิ้งตั้งแต่ตอนเตรียม
             "prepare.min_piece": 1.0},
     "ai": True},
    # ซอยถี่เท่าที่รอยต่อประโยคยอม (whisper ให้ท่อนละ 3–7 วิ) แล้วให้ autofx ใส่
    # ซูมไล่สลับทิศ + punch กับทุกช็อตที่สั้นกว่า 6 วิ — "ยิงรัว" ของคลิปพูดคนเดียว
    # อยู่ที่จังหวะภาพ ไม่ใช่การหั่นประโยคให้สั้นกว่าที่มันเป็น
    {"id": "rapid", "label": "ยิงรัว", "note": "ช็อตสั้น · ซอยถี่ · ซูมไล่สลับทิศ + punch ทุกช็อต",
     "set": {"compose.mode": "fit", "compose.target_minutes": 0.75,
             "talk.min_shot": 0.8, "talk.gap_merge": 0.30, "talk.max_shot": 3.0,
             "jumpcut.min_piece": 0.4},
     "autofx": {"burst": True, "burst_max": 6.0}},
]
BY_ID = {v["id"]: v for v in CATALOG}
DEFAULT_ID = "s45"

# ไฟล์ที่ประกอบเป็น "แบบ" หนึ่งแบบ — สามตัวแรกคือผลของ prepare/compose/render
# สองตัวหลังคือชั้นแต่งที่คนแก้ได้ (มีก็ต่อเมื่อเคย activate แล้วแต่ง)
CUT_FILES = ("pool.json", "edl.json", "render.json")
LAYER_FILES = ("fx.json", "captions.json")
OUT = "out.mp4"


# ─────────────────────────── ที่เก็บ ───────────────────────────

def style_of(ctx):
    """สไตล์ของโปรเจกต์ตอนนี้ = [autofx] style · ว่าง = custom"""
    return str(ctx.get("autofx.style", "") or "").strip() or CUSTOM


def root(ctx):
    return ctx.work / DIR


def dir_of(ctx, vid=None, style=None):
    """โฟลเดอร์ของสไตล์ (vid=None) หรือของแบบหนึ่งในสไตล์นั้น"""
    d = root(ctx) / (style or style_of(ctx))
    return d / vid if vid else d


def active_path(ctx):
    return root(ctx) / ACTIVE


def active_of(ctx):
    """(สไตล์, id) ของแบบที่ชุดไฟล์นอนอยู่ใน .vcut/ ตอนนี้ — ("", "") ถ้ายังไม่มีแบบ"""
    _migrate(ctx)
    a = read_json(active_path(ctx), {}) or {}
    return str(a.get("style") or ""), str(a.get("id") or "")


def _set_active(ctx, style, vid):
    root(ctx).mkdir(parents=True, exist_ok=True)
    write_json(active_path(ctx), {"version": 2, "style": style, "id": vid,
                                  "at": int(time.time())})


def index_path(ctx, style=None):
    return dir_of(ctx, style=style) / INDEX


def load_index(ctx, style=None):
    """ดัชนีของสไตล์หนึ่ง · `active` = id ที่ active อยู่ *ถ้าเป็นของสไตล์นี้* ไม่งั้นว่าง"""
    _migrate(ctx)
    style = style or style_of(ctx)
    d = read_json(index_path(ctx, style), {}) or {}
    a_style, a_id = active_of(ctx)
    return {"version": 2, "style": style,
            "active": a_id if a_style == style else "",
            "made": d.get("made", 0), "items": dict(d.get("items") or {})}


def save_index(ctx, idx):
    style = idx.get("style") or style_of(ctx)
    dir_of(ctx, style=style).mkdir(parents=True, exist_ok=True)
    write_json(index_path(ctx, style),
               {"version": 2, "style": style, "made": idx.get("made", 0),
                "items": idx.get("items") or {}})


def styles_cut(ctx):
    """สไตล์ที่เคยตัดแล้ว (มี index.json) เรียงตาม STYLES แล้วตามด้วยที่ไม่รู้จัก"""
    base = root(ctx)
    if not base.exists():
        return []
    have = [d.name for d in base.iterdir() if d.is_dir() and (d / INDEX).exists()]
    return [s for s in STYLES if s in have] + sorted(s for s in have if s not in STYLES)


def _migrate(ctx):
    """ของรุ่นแรก (2026-09-03) เป็น variants/<id>/ + variants/index.json แบน ๆ
    → ย้ายเข้า variants/<สไตล์ของโปรเจกต์>/ ครั้งเดียว"""
    base = root(ctx)
    old = base / INDEX
    if not old.exists():
        return
    d = read_json(old, {}) or {}
    if "items" not in d:
        # ไฟล์ชื่อซ้ำที่ไม่ใช่ของเรา — ปล่อยไว้
        return
    style = style_of(ctx)
    dst = base / style
    dst.mkdir(parents=True, exist_ok=True)
    for vid in list(d.get("items") or {}):
        src = base / vid
        if src.is_dir() and not (dst / vid).exists():
            shutil.move(str(src), str(dst / vid))
    write_json(dst / INDEX, {"version": 2, "style": style, "made": d.get("made", 0),
                             "items": d.get("items") or {}})
    if d.get("active"):
        _set_active(ctx, style, str(d["active"]))
    old.unlink()
    info(f"  ย้ายแบบรุ่นเก่าเข้า variants/{style}/ ({len(d.get('items') or {})} แบบ)")


def wanted_ids(ctx, ids=None):
    """แบบที่จะตัด — จากอาร์กิวเมนต์ก่อน ไม่งั้น [variants] ids · เรียงตาม CATALOG"""
    want = [str(x) for x in (ids or ctx.get("variants.ids", []) or [])]
    if not want:
        want = [v["id"] for v in CATALOG]
    bad = [x for x in want if x not in BY_ID]
    if bad:
        die(f"ไม่รู้จักแบบ {', '.join(bad)}  (มี: {', '.join(BY_ID)})")
    return [v["id"] for v in CATALOG if v["id"] in set(want)]


def ctx_for(ctx, spec):
    """Ctx ของแบบนี้ — ค่าโปรเจกต์ทับด้วย spec["set"] · work/out ที่เดิม"""
    from . import settings
    cfg = deepcopy(ctx.cfg)
    for k, v in (spec.get("set") or {}).items():
        settings.set_at(cfg, k, v)
    config.validate(cfg)
    return config.Ctx(cfg)


def listed_segments(ctx):
    """ชื่อไฟล์ segment ที่แบบทุกแบบ (ทุกสไตล์) ยังอ้างอยู่ — gc ต้องไม่ลบ"""
    out = set()
    base = root(ctx)
    if not base.exists():
        return out
    for d in base.iterdir():
        if not d.is_dir():
            continue
        # รุ่นใหม่: <style>/<id>/render.json · รุ่นเก่าที่ยังไม่ย้าย: <id>/render.json
        cands = [x for x in d.iterdir() if x.is_dir()] + [d]
        for v in cands:
            rman = read_json(v / "render.json", {}) or {}
            out |= {s["file"] for s in rman.get("segments", []) if s.get("file")}
    return out


# ─────────────────────────── ตัด ───────────────────────────

def _need_ai(ctx, write=True):
    """ai.json มีคำตอบ trim_suggest ไหม — ไม่มีก็ถามให้ถ้า [variants] ai เปิดอยู่
    คืน (พร้อมไหม, เหตุผลที่ไม่พร้อม)"""
    from . import ai as ai_mod
    adv = read_json(ctx.work / "ai.json", {}) or {}
    if "trim_suggest" in (adv.get("tasks") or {}):
        return True, ""
    if not ctx.get("variants.ai", False):
        return False, "ยังไม่มีคำตอบ AI (trim_suggest) และ [variants] ai ปิดอยู่"
    goal = str(ctx.get("ai.goal", "") or "") or \
        "ตัดเหลือ 40–45 วินาที เอา hook เปิดเรื่อง จุดสำคัญ 3–4 จุด และประโยคปิด"
    try:
        ai_mod.run(ctx, tasks=["trim_suggest"], goal=goal)
    except SystemExit as e:
        return False, f"ถาม AI ไม่สำเร็จ ({e})"
    return True, ""


def _one(ctx, spec, style, force=False):
    """เตรียม → รวม → ตัดชิ้น → ต่อไฟล์ ของแบบเดียว แล้วเก็บผลเข้าโฟลเดอร์ของมัน"""
    from . import assemble, compose, prepare, render
    vid = spec["id"]
    vdir = dir_of(ctx, vid, style)
    vdir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    meta = {"id": vid, "label": spec["label"], "note": spec["note"],
            "set": spec.get("set") or {}, "ai": bool(spec.get("ai")),
            "autofx": spec.get("autofx") or {},
            "ok": False, "error": "", "made": int(time.time())}

    if spec.get("ai"):
        ready, why = _need_ai(ctx)
        if not ready:
            meta["error"] = why
            return meta

    ctx2 = ctx_for(ctx, spec)
    try:
        prepare.run(ctx2)
        edl = compose.run(ctx2)
        if not edl["timeline"]:
            raise SystemExit("ได้หนังเปล่า — ไม่มีชิ้นไหนใส่ลงในเป้านี้ได้")
        render.run(ctx2, force=force)
        assemble.run(ctx2, out=vdir / OUT)
    except SystemExit as e:
        meta["error"] = str(e) or "ล้มเหลว"
        return meta

    for f in CUT_FILES:
        src = ctx.work / f
        if src.exists():
            shutil.copy2(src, vdir / f)
    s = edl["summary"]
    meta.update({"ok": True, "dur": s["duration_total"], "shots": s["segments"],
                 "talk": s["segments_talk"], "broll": s["segments_broll"],
                 "took": round(time.time() - t0, 1),
                 "first": edl["timeline"][0]["name"],
                 "first_start": edl["timeline"][0]["start"],
                 "text": (edl["timeline"][0].get("text") or "")[:120]})
    return meta


def run(ctx, ids=None, force=False, activate=None):
    """ตัดทุกแบบที่ขอในสไตล์ของโปรเจกต์ แล้ว activate แบบตั้งต้นกลับเข้า .vcut/ — คืน view()"""
    from . import silence
    if not ctx.manifest.exists():
        die("ยังไม่มี manifest — รัน `vcut scan` ก่อน")
    if not ctx.transcript.exists():
        warn("ยังไม่มี transcript — ทุกแบบจะเห็นคลิปเป็นวิวล้วน (รัน `vcut listen` ก่อนดีกว่า)")
    if ctx.get("jumpcut.enabled", False) and not (ctx.work / "silence.json").exists():
        silence.run(ctx)

    style = style_of(ctx)
    want = wanted_ids(ctx, ids)
    idx = load_index(ctx, style)
    a_style, a_id = active_of(ctx)
    # ไฟล์ที่ activate ไว้อยู่ตอนนี้ (สไตล์ไหนก็ตาม) จะถูกเขียนทับระหว่างวน — เก็บ
    # กลับเข้าโฟลเดอร์ของมันก่อน ไม่งั้นของที่แต่งไว้ในแบบนั้นหาย
    if a_id and dir_of(ctx, a_id, a_style).exists():
        _stash(ctx, a_id, a_style)

    info(f"VARIANTS  {style} · {len(want)} แบบ  ·  " + " · ".join(BY_ID[v]["label"] for v in want))
    t0 = time.time()
    for vid in want:
        spec = BY_ID[vid]
        info(f"\n{c('▶ ' + spec['label'], 'b')}  {c(spec['note'], 'd')}")
        meta = _one(ctx, spec, style, force=force)
        idx["items"][vid] = meta
        if meta["ok"]:
            info(f"  {c('✓', 'g')} {meta['shots']} ชิ้น · {meta['dur']:.1f} วิ · "
                 f"{hhmmss(meta['took'])}")
        else:
            warn(f"  ข้าม {spec['label']}: {meta['error']}")
        idx["made"] = int(time.time())
        save_index(ctx, idx)

    ok_ids = [v for v in want if idx["items"].get(v, {}).get("ok")]
    prev = a_id if a_style == style else ""
    pick = activate or (prev if prev in ok_ids else "") \
        or (DEFAULT_ID if DEFAULT_ID in ok_ids else (ok_ids[0] if ok_ids else ""))
    if pick:
        _switch(ctx, pick, style)
    save_index(ctx, idx)

    a_style, a_id = active_of(ctx)
    info("─" * 62)
    for vid in want:
        m = idx["items"].get(vid, {})
        on = a_style == style and vid == a_id
        mark = c("●", "g") if on else (c("✓", "g") if m.get("ok") else c("×", "r"))
        tail = (f"{m['shots']:>3} ชิ้น  {m['dur']:>6.1f} วิ  {hhmmss(m['took'])}"
                if m.get("ok") else c(m.get("error", ""), "d"))
        info(f"  {mark} {vid:<6} {BY_ID[vid]['label']:<16} {tail}")
    info(f"  รวม {hhmmss(time.time() - t0)}  ·  {dir_of(ctx, style=style)}")
    info("─" * 62)
    return view(ctx, style)


# ─────────────────────────── สลับแบบ ───────────────────────────

def _stash(ctx, vid, style):
    """เก็บไฟล์ที่แก้ได้ของแบบที่ active อยู่ กลับเข้าโฟลเดอร์ของมัน"""
    vdir = dir_of(ctx, vid, style)
    if not vdir.exists():
        return
    for f in CUT_FILES + LAYER_FILES:
        src = ctx.work / f
        if src.exists():
            shutil.copy2(src, vdir / f)


def _switch(ctx, vid, style):
    vdir = dir_of(ctx, vid, style)
    for f in ("edl.json", "render.json"):
        if not (vdir / f).exists():
            die(f"แบบ {style}/{vid} ยังไม่มี {f} — สั่ง `vcut variants` ก่อน")
    a_style, a_id = active_of(ctx)
    if a_id and (a_id, a_style) != (vid, style):
        _stash(ctx, a_id, a_style)
    elif not a_id:
        # ครั้งแรกที่มีแบบ: ชั้นแต่งที่โปรเจกต์มีอยู่ก่อน (ถ้ามี) ถือเป็นของแบบแรก
        # ที่เลือก — ไม่ทิ้ง ไม่ปล่อยให้ค้างข้ามแบบ
        for f in LAYER_FILES:
            src = ctx.work / f
            if src.exists() and not (vdir / f).exists():
                shutil.copy2(src, vdir / f)
    for f in CUT_FILES:
        if (vdir / f).exists():
            shutil.copy2(vdir / f, ctx.work / f)
    for f in LAYER_FILES:
        dst = ctx.work / f
        if (vdir / f).exists():
            shutil.copy2(vdir / f, dst)
        else:
            # ชั้นแต่งของแบบก่อนถูกเก็บเข้าโฟลเดอร์ของมันแล้ว (ดู _stash) — ที่เหลือ
            # ตรงนี้คือของแบบอื่น ไม่ใช่ของแบบนี้
            dst.unlink(missing_ok=True)
    # แบบที่ต่างกันมีชิ้นคนละชุด — แผนของขั้น 5 ที่คำนวณไว้ใช้ต่อไม่ได้
    (ctx.work / "fx-render.json").unlink(missing_ok=True)
    _set_active(ctx, style, vid)


def activate(ctx, vid, style=None):
    """สลับแบบ — style ว่าง = สไตล์ของโปรเจกต์ตอนนี้"""
    if vid not in BY_ID:
        die(f"ไม่รู้จักแบบ '{vid}'  (มี: {', '.join(BY_ID)})")
    style = style or style_of(ctx)
    if style != style_of(ctx):
        warn(f"โปรเจกต์ตั้งสไตล์ {style_of(ctx)} แต่ขอแบบของ {style} — "
             f"บันทึก extends ให้ตรงก่อน ไม่งั้น autofx/เรนเดอร์ใหม่จะใช้ค่าผิดชุด")
    a_style, a_id = active_of(ctx)
    if (a_style, a_id) == (style, vid):
        return view(ctx, style)
    _switch(ctx, vid, style)
    info(f"  {c('●', 'g')} ใช้แบบ {style}/{vid} · {BY_ID[vid]['label']}")
    return view(ctx, style)


def active_meta(ctx):
    """ข้อมูลของแบบที่ active อยู่ — {} ถ้ายังไม่มีแบบ (โปรเจกต์ธรรมดา)"""
    a_style, a_id = active_of(ctx)
    if not a_id:
        return {}
    return load_index(ctx, a_style)["items"].get(a_id, {})


# ─────────────────────────── ให้หน้าเว็บ ───────────────────────────

def view(ctx, style=None):
    style = style or style_of(ctx)
    idx = load_index(ctx, style)
    a_style, a_id = active_of(ctx)
    want = wanted_ids(ctx)
    edl_m = int(ctx.edl.stat().st_mtime) if ctx.edl.exists() else 0
    items = []
    for spec in CATALOG:
        vid = spec["id"]
        m = idx["items"].get(vid, {})
        vdir = dir_of(ctx, vid, style)
        out = vdir / OUT
        exists = out.exists()
        on = a_style == style and vid == a_id
        rec = {"id": vid, "label": spec["label"], "note": spec["note"],
               "ai": bool(spec.get("ai")), "wanted": vid in want,
               "ok": bool(m.get("ok")), "error": m.get("error", ""),
               "dur": m.get("dur", 0), "shots": m.get("shots", 0),
               "talk": m.get("talk", 0), "broll": m.get("broll", 0),
               "took": m.get("took", 0), "made": m.get("made", 0),
               "first": m.get("first", ""), "first_start": m.get("first_start", 0),
               "text": m.get("text", ""),
               "ready": exists,
               "out_size": out.stat().st_size if exists else 0,
               "out_mtime": int(out.stat().st_mtime) if exists else 0,
               "active": on,
               # เคยวางชั้นแต่ง (autofx/แก้เอง) ในแบบนี้แล้วไหม — หน้าเว็บใช้ตัดสินว่า
               # สลับมาแล้วต้องสั่ง autofx ให้เองหรือของเดิมกลับมาแล้ว
               "has_layers": (vdir / "fx.json").exists()
               or (on and (ctx.work / "fx.json").exists())}
        # แบบที่ active อยู่: EDL ใน .vcut/ ถูกแก้หลังจากตัดไฟล์ตัวอย่างไหม
        rec["stale"] = bool(on and exists and edl_m > rec["out_mtime"])
        items.append(rec)
    styles = []
    for s in styles_cut(ctx):
        d = read_json(index_path(ctx, s), {}) or {}
        its = d.get("items") or {}
        styles.append({"style": s, "made": d.get("made", 0),
                       "ok": sum(1 for m in its.values() if m.get("ok")),
                       "total": len(its), "active": s == a_style})
    return {"style": style, "project_style": style_of(ctx),
            "active": a_id if a_style == style else "",
            "active_style": a_style, "active_id": a_id,
            "made": idx["made"], "default": DEFAULT_ID,
            "items": items, "styles": styles, "dir": str(dir_of(ctx, style=style))}
