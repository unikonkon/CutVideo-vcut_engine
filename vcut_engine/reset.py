"""RESET — ล้างค่ากลับไปเป็นค่าตั้งต้น โดยเก็บของเดิมไว้ให้ดึงกลับได้

ปุ่มล้างที่ย้อนกลับไม่ได้คือปุ่มที่ไม่มีใครกล้ากด ทุกครั้งที่ล้าง โมดูลนี้จะ
ถ่ายสำเนา *ทั้งไฟล์โปรเจกต์* เก็บไว้ก่อน (ข้อความดิบ คอมเมนต์ครบทุกบรรทัด)
แล้วค่อยแก้ กู้คืนทีหลังจึงได้ของเดิมเป๊ะทุกตัวอักษร ไม่ใช่แค่ค่าที่ฟอร์มรู้จัก

"รีเซ็ตค่า" ที่นี่แปลว่า **ลบคีย์ที่โปรเจกต์ทับไว้ออก** ไม่ใช่เขียนค่าตั้งต้น
ทับลงไป ผลลัพธ์ที่เห็นเหมือนกัน แต่ความหมายต่างกันมาก: แบบแรกทำให้ค่าไหล
ลงมาจาก preset ตามปกติ วันที่ preset เปลี่ยนโปรเจกต์นี้ก็ได้ตามไปด้วย

ประวัติเก็บที่ .vcut-history/ ซึ่งอยู่ใน .gitignore — มันคือ "ที่ทำงานของ
เครื่องนี้" ไม่ใช่ "ผลงานของโปรเจกต์" จึงไม่ควรตามไปกับ repo
"""
import re
import shutil
import time
import tomllib
from pathlib import Path

from . import compare, fx, settings
from .util import read_json, write_json

HISTORY_DIR = settings.PKG_ROOT / ".vcut-history"
MAX_SNAPS = 40                       # เก็บย้อนหลังเท่านี้ เกินแล้วทิ้งอันเก่าสุด


# ─────────────────────────── ผลงานที่ล้างได้ ───────────────────────────
#
# (id, ป้าย, ไฟล์/โฟลเดอร์, ราคาของการทำใหม่, แพงจนต้องเตือน)
# "แพง" ที่นี่ไม่ได้วัดด้วยเมกะไบต์ แต่วัดด้วยเวลาและเงินที่ต้องจ่ายเพื่อให้
# มันกลับมา — ai.json ใหญ่ไม่กี่ร้อย KB แต่แพงกว่า segment cache 4 GB

def _entries(ctx):
    return {
        "source": [
            ("manifest", "รายการคลิปที่อ่านไว้", [ctx.manifest],
             "ต้องอ่านคลิปใหม่ทั้งโฟลเดอร์ (~40 นาที)", True),
            ("thumbs", "ภาพตัวอย่าง + contact sheet + คลิปตัวอย่าง",
             [ctx.thumb_dir, ctx.work / "preview"],
             "ทำภาพใหม่ (~2 นาที)", False),
        ],
        "prepare": [
            ("transcript", "บทพูดที่ถอดไว้", [ctx.transcript],
             "ต้องถอดเสียงใหม่ทุกคลิป (~30 นาที)", True),
            ("ai", "ความเห็น AI — บท · คะแนน · ความหมาย",
             [ctx.work / "ai.json", ctx.work / "ai"],
             "ต้องถาม AI ใหม่ — เสียโควตา subscription", True),
            ("pool", "คลังชิ้นที่เตรียมไว้", [ctx.work / "pool.json"],
             "ตัดทีละคลิปใหม่ (ไม่ถึงนาที)", False),
        ],
        "compose": [
            ("edl", "EDL — ลำดับช็อตที่เลือกไว้",
             [ctx.edl, ctx.work / "edl.prev.json", ctx.work / "compose.json"],
             "รวมใหม่ (ไม่ถึงนาที)", False),
            ("review", "ข้อเสนอของ AI ที่ดูหนังแล้ว", [ctx.work / "review.json"],
             "ให้ AI ดูใหม่ — เสียโควตา subscription", False),
            ("measure", "ผลวัดความดัง + รายการ segment",
             [ctx.work / "render.json", ctx.work / "loudness.json"],
             "วัดความดังใหม่ทุกชิ้น (~5 นาที)", False),
            ("segments", "ชิ้นที่ตัดแล้ว (segment cache)",
             [ctx.seg_dir, ctx.work / "segweb"],
             "ต้อง render ใหม่ทุกชิ้น (~40 นาที)", True),
            ("out", "ไฟล์หนังที่ต่อเสร็จแล้ว", [ctx.out],
             "ต่อไฟล์ใหม่ (~1 นาที)", False),
        ],
        "fx": [
            # ชั้นเอฟเฟกต์เป็น *เอกสารที่คนเขียน* เหมือนชั้นข้อความ ไม่ใช่ผลคำนวณ
            # ที่ทำใหม่ได้ฟรี — ลบแล้วต้องมานั่งตั้งใหม่เอง จึงติดธงอันตรายไว้
            ("fx", "ชั้นเอฟเฟกต์ที่ตั้งไว้", [ctx.work / "fx.json"],
             "ต้องตั้งเอฟเฟกต์ใหม่เองทั้งหมด", True),
            ("fxplan", "รายการชิ้นของขั้น 5", [ctx.work / "fx-render.json",
                                              ctx.work / "fx-captions.ass",
                                              ctx.work / "concat_fx.txt"],
             "คำนวณใหม่เองตอนกดสร้างไฟล์ (ทันที)", False),
            ("fxseg", "ชิ้นที่แต่งแล้ว (cache ของขั้น 5)", [ctx.work / "fxseg"],
             "ตัดชิ้นที่ใส่เอฟเฟกต์ใหม่ทุกชิ้น", False),
            # ไฟล์ที่คนอัปโหลดเข้ามาเอง — ไม่มีที่ไหนสร้างใหม่ให้ได้ ต้องหามาใส่
            # เองทั้งหมด จึงอันตรายกว่า cache ทุกตัวในตาราง
            ("assets", "ไฟล์ภาพซ้อนกับเพลงที่อัปโหลดไว้", [ctx.work / "assets"],
             "ต้องหาไฟล์มาใส่ใหม่เองทั้งหมด", True),
            ("fxout", "ไฟล์หนังที่แต่งแล้ว", [fx.out_path(ctx)],
             "แต่งใหม่ — เข้ารหัสภาพหนึ่งรอบ (~5 นาที)", False),
        ],
        "compare": [
            ("cmpout", "ไฟล์เทียบก่อน-หลัง",
             [compare.out_path(ctx, quiet=True), ctx.work / "compare.ass"],
             "ประกอบใหม่ — เข้ารหัสภาพหนึ่งรอบ (~3 นาที)", False),
        ],
    }


def _du(p):
    if p.is_dir():
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    return p.stat().st_size if p.is_file() else 0


def artifacts(ctx, scope="all"):
    """ผลงานที่ขั้นนี้ทำไว้ + ขนาด + ราคาของการทำใหม่ (ยังไม่ลบอะไรทั้งนั้น)"""
    tbl = _entries(ctx)
    groups = settings.PHASE_STAGES.keys() if scope in (None, "", "all") else [scope]
    out = []
    for g in groups:
        for aid, label, paths, cost, danger in tbl.get(g, []):
            live = [p for p in paths if p.exists()]
            out.append({
                "id": aid, "scope": g, "label": label, "cost": cost,
                "danger": danger, "exists": bool(live),
                "bytes": sum(_du(p) for p in live),
                "paths": [str(p) for p in paths],
            })
    return out


def _safe_targets(ctx, paths):
    """กันลบพลาด — โฟลเดอร์ cache ทั้งก้อนกับโฟลเดอร์ฟุตเทจต้นฉบับห้ามแตะ"""
    forbid = {ctx.work.resolve(), ctx.source.resolve(), settings.PKG_ROOT.resolve()}
    keep = []
    for s in paths:
        p = Path(s)
        if not p.exists() or p.resolve() in forbid:
            continue
        keep.append(p)
    return keep


def delete_artifacts(ctx, scope, ids):
    """ลบเฉพาะรายการที่ติ๊กมา — คืนรายการที่ลบจริงพร้อมขนาดที่คืนมา"""
    want = set(ids or ())
    done = []
    for a in artifacts(ctx, scope):
        if a["id"] not in want or not a["exists"]:
            continue
        freed = 0
        for p in _safe_targets(ctx, a["paths"]):
            freed += _du(p)
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
        done.append({"id": a["id"], "label": a["label"], "bytes": freed})
    return done


# ─────────────────────────── ประวัติค่าเก่า ───────────────────────────

def _tree(raw):
    """TOML ดิบ → dict · คืน {} ถ้าอ่านไม่ออก (ไฟล์ว่าง / ยังไม่มีไฟล์)"""
    try:
        return tomllib.loads(raw or "")
    except (tomllib.TOMLDecodeError, TypeError):
        return {}


def _slug(rel):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", rel or "no-project").strip("_") or "x"


def _store(rel):
    return HISTORY_DIR / f"{_slug(rel)}.json"


def _read(rel):
    d = read_json(_store(rel), {}) or {}
    return {"project": rel, "snaps": d.get("snaps", [])}


def _write(rel, data):
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    data["snaps"] = data["snaps"][:MAX_SNAPS]
    write_json(_store(rel), data)


def _new_id(taken):
    base = time.strftime("%Y%m%d-%H%M%S")
    sid, n = base, 1
    while sid in taken:                # กดรัว ๆ ในวินาทีเดียวกันก็ยังแยกออก
        sid, n = f"{base}-{n}", n + 1
    return sid


def snapshot(rel, scope, label, cfg=None, deleted=None):
    """ถ่ายสำเนาไฟล์โปรเจกต์ตอนนี้เก็บไว้ แล้วคืน id ของสำเนา

    เก็บทั้ง raw (ไว้กู้) และ values (ไว้ให้คนอ่านว่าตอนนั้นค่าเป็นเท่าไร)
    ถ้าเก็บแต่ raw หน้าเว็บจะต้องมา parse TOML เอง ซึ่งไม่ใช่งานของเบราว์เซอร์
    """
    data = _read(rel)
    keys = settings.scope_keys(scope)
    snap = {
        "id": _new_id({s["id"] for s in data["snaps"]}),
        "at": int(time.time()),
        "scope": scope,
        "label": label,
        "project": rel,
        "raw": settings.read_raw(rel),
        "values": {k: settings.get_at(cfg, k) for k in keys} if cfg else {},
        "deleted": list(deleted or []),
    }
    data["snaps"].insert(0, snap)
    _write(rel, data)
    return snap


def history(rel):
    """รายการค่าเก่า — ไม่ส่ง raw กลับไป หน้าเว็บไม่ต้องใช้และมันหนัก"""
    data = _read(rel)
    return [{k: v for k, v in s.items() if k != "raw"}
            | {"bytes": len(s.get("raw", "")), "keys": len(s.get("values", {}))}
            for s in data["snaps"]]


def find(rel, sid):
    return next((s for s in _read(rel)["snaps"] if s["id"] == sid), None)


def forget(rel, sid):
    data = _read(rel)
    data["snaps"] = [s for s in data["snaps"] if s["id"] != sid]
    _write(rel, data)


def restore(rel, sid, scope=None):
    """เอาค่าจากสำเนาเก่ากลับมาใช้ — ทั้งไฟล์ หรือเฉพาะขั้นที่ระบุ

    สำเนาเก็บไฟล์ไว้ทั้งไฟล์เสมอ จึงกู้ได้ทั้งสองแบบไม่ว่าตอนถ่ายจะระบุขั้นไหน
    การกู้คืนเองก็ถูกถ่ายสำเนาไว้ก่อนด้วย — กดผิดแล้วยังกลับมาได้อีกชั้น
    """
    snap = find(rel, sid)
    if not snap:
        return None, "ไม่พบค่าเก่ารายการนี้"
    scope = scope or snap.get("scope") or "all"
    if scope != "all" and scope not in settings.PHASE_STAGES:
        return None, f"ไม่รู้จักขอบเขต '{scope}'"

    back = snapshot(rel, scope, f"ก่อนกู้คืน {sid}")
    if scope == "all":
        body = snap["raw"]
    else:
        tree = _tree(snap["raw"])
        if not tree and snap["raw"].strip():
            forget(rel, back["id"])
            return None, "สำเนาเก่ารายการนี้อ่านไม่ออก"
        changes, drop = {}, []
        for k in settings.scope_keys(scope):
            if settings.has_at(tree, k):
                changes[k] = settings.get_at(tree, k)
            else:
                drop.append(k)
        body = settings.patch_toml(settings.read_raw(rel), changes, drop=drop)

    path, err = settings.save_project(rel, {}, raw=body)
    if err:
        forget(rel, back["id"])
        return None, err
    return {"path": path, "restored": sid, "scope": scope,
            "undo": back["id"]}, None


# ─────────────────────────── รีเซ็ต ───────────────────────────

def blocked(rel):
    """เหตุผลที่ล้างค่าในไฟล์นี้ไม่ได้ — คืน None ถ้าล้างได้"""
    if not rel:
        return "ยังไม่มีไฟล์โปรเจกต์ให้รีเซ็ต — บันทึกค่าลงไฟล์ก่อน"
    if rel.replace("\\", "/").startswith("config/"):
        # preset คือสูตรที่ใช้ร่วมกันหลายโปรเจกต์ และมันถูก commit เข้า git ด้วย
        # ล้างมันทิ้งจากปุ่มในหน้าเว็บคือลบงานของคนอื่น ไม่ใช่ล้างงานของตัวเอง
        return (f"'{rel}' เป็น preset ที่ใช้ร่วมกัน รีเซ็ตไม่ได้ — "
                "บันทึกเป็นไฟล์ใน projects/ ก่อนแล้วค่อยรีเซ็ตไฟล์นั้น")
    return None


def preview(ctx, rel, scope="all"):
    """กดแล้วจะเกิดอะไรขึ้นบ้าง — เรียกก่อนเสมอ ไม่มีอะไรเปลี่ยนแปลง"""
    from . import config
    base = config.load(None, [])
    tree = _tree(settings.read_raw(rel)) if rel else {}
    ext = tree.get("extends", "") or ""
    if ext:
        try:
            base = config.load(ext, [])
        except SystemExit:
            pass

    keys = []
    for k in settings.scope_keys(scope):
        f = settings.FIELD_BY_KEY[k]
        in_file = settings.has_at(tree, k)
        now = settings.get_at(ctx.cfg, k)
        back = settings.get_at(base, k)
        keys.append({"key": k, "label": f["label"], "tier": f["tier"],
                     "stage": f["stage"], "in_file": in_file,
                     "now": now, "back": back,
                     "changes": in_file and now != back})
    return {
        "scope": scope,
        "scope_label": settings.SCOPE_LABEL.get(scope, scope),
        "project": rel,
        "blocked": blocked(rel),
        "extends": ext,
        "keys": keys,
        "artifacts": artifacts(ctx, scope),
        "history": history(rel),
    }


def apply(ctx, rel, scope="all", keys=True, artifact_ids=()):
    """ล้างจริง — ถ่ายสำเนาก่อน แล้วค่อยแตะไฟล์

    ลำดับสำคัญ: เขียน config ก่อน ลบไฟล์ทีหลัง ถ้า config ที่ได้ใช้ไม่ได้จะ
    ถอยออกมาโดยยังไม่ได้ลบผลงานอะไรเลย
    """
    if scope != "all" and scope not in settings.PHASE_STAGES:
        return None, f"ไม่รู้จักขอบเขต '{scope}'"
    if keys and blocked(rel):
        return None, blocked(rel)

    ids = [a["id"] for a in artifacts(ctx, scope)
           if a["id"] in set(artifact_ids or ()) and a["exists"]]
    snap = snapshot(rel, scope, f"ก่อนรีเซ็ต {settings.SCOPE_LABEL.get(scope, scope)}",
                    cfg=ctx.cfg)

    dropped = []
    if keys:
        tree = _tree(snap["raw"])
        want = [k for k in settings.scope_keys(scope) if settings.has_at(tree, k)]
        _, err = settings.save_project(rel, {}, drop=settings.scope_keys(scope))
        if err:
            forget(rel, snap["id"])
            return None, err
        dropped = want

    removed = delete_artifacts(ctx, scope, ids)
    if removed:
        data = _read(rel)
        for s in data["snaps"]:
            if s["id"] == snap["id"]:
                s["deleted"] = [r["label"] for r in removed]
        _write(rel, data)
    return {"snapshot": snap["id"], "scope": scope,
            "dropped": dropped, "removed": removed}, None
