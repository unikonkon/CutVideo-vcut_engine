"""CLIPS — งานของขั้น 1 ที่ทำกับคลิปเป็นราย ๆ

สี่อย่างที่ตัดสินตั้งแต่ตอนเลือกฟุตเทจ ก่อนจะรู้ด้วยซ้ำว่าหนังจะเล่าอะไร:

    เอาคลิปไหนบ้าง        [scan] exclude
    เรียงคลิปยังไง         [scan] order
    คลิปไหนต้องหมุน        [scan.rotation_overrides]
    แนวตั้งทำเป็นแนวนอนยังไง  [video.vertical_overrides]

ทั้งสามเก็บใน config ไม่ใช่ในไฟล์ cache — ลบ .vcut/ ทิ้งทั้งโฟลเดอร์แล้วรัน
ใหม่ ก็ยังได้ผลเดิม และ commit เข้า git ให้คนอื่นได้ผลเดียวกันได้

**หมุนคลิปแล้วไม่ต้อง scan ใหม่** — rot_override มีผลแค่กับ orient/dw/dh
ส่วน motion · ความสว่าง · ความดัง วัดจากไฟล์ดิบก่อนหมุนทั้งหมด (ดู scan._one)
แก้ manifest ตรงจุดจึงถูกต้องเท่ากับ scan ใหม่ทั้งกอง แต่ใช้เวลาไม่ถึงวินาที
แทนที่จะเป็น 40 นาที
"""
import os
import shutil
import time
import tomllib
from pathlib import Path

from . import config, render, scan, settings, thumbs
from .util import build_lock, key_of, part_path, read_json, run as sh, write_json

# ค่าที่ยอมให้ตั้งได้ — หน้าเว็บส่งอะไรมาก็ต้องอยู่ในนี้เท่านั้น
ROTATIONS = [
    ("", "ตามไฟล์"),
    ("transpose=1", "หมุนขวา 90°"),
    ("transpose=2", "หมุนซ้าย 90°"),
    ("transpose=1,transpose=1", "กลับหัว 180°"),
]
VMODES = [
    ("blur_pad", "เต็มความสูง ด้านข้างเบลอ",
     "ไม่ย่อภาพ เห็นรายละเอียดเต็ม ๆ ที่ว่างสองข้างเติมด้วยภาพเดียวกันที่เบลอไว้"),
    ("pillarbox", "ย่อทั้งภาพ แถบดำสองข้าง",
     "เห็นครบทั้งเฟรมเหมือนต้นฉบับ แต่ภาพเล็กลงเพราะต้องย่อให้พอดีความสูง"),
    ("crop", "ครอปเต็มจอ",
     "เต็มจอ 16:9 ไม่มีที่ว่าง แต่หัวกับเท้าโดนตัดทิ้ง"),
]
ROT_OK = {v for v, _ in ROTATIONS}
VMODE_OK = {v for v, _, _ in VMODES}

PREVIEW_SECONDS = 3.0


def _video_only(args):
    """เอาเฉพาะพารามิเตอร์ภาพออกมา — ตัวอย่างไม่มีเสียง ใส่ -c:a ไป ffmpeg ฟ้อง"""
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
        elif a in ("-c:a", "-b:a", "-ar", "-ac"):
            skip = True
        else:
            out.append(a)
    return out


# ─────────────────────────── ลำดับที่จัดเอง ───────────────────────────

def arrange(natural, order):
    """เรียงชื่อคลิปตาม [scan] order — ชื่อที่ไม่อยู่ในนั้นแทรกกลับตามธรรมชาติ

    natural = ชื่อคลิปเรียงตามเลขไฟล์ (ลำดับตั้งต้น)  order = ที่คนลากจัดไว้

    สองกรณีที่ต้องรอด: ชื่อใน order ที่ไฟล์หายไปแล้ว → ข้ามทิ้ง · คลิปที่เพิ่ง
    ก๊อปเข้าโฟลเดอร์ทีหลังจึงยังไม่มีชื่อใน order → แทรกต่อจากคลิปที่อยู่ก่อน
    หน้ามันตามเลขไฟล์ ไม่ใช่ไปกองต่อท้าย เพราะคนที่เติมคลิปเก่าเลข 7000 เข้ามา
    ย่อมคาดว่ามันจะไปโผล่ตรงที่เลขไฟล์บอก ไม่ใช่ท้ายเรื่อง
    """
    known, seen, placed = set(natural), set(), []
    for n in (order or []):
        if n in known and n not in seen:
            seen.add(n)
            placed.append(n)

    after, anchor = {}, None
    for n in natural:
        if n in seen:
            anchor = n
        else:
            after.setdefault(anchor, []).append(n)

    out = list(after.get(None, []))
    for n in placed:
        out.append(n)
        out += after.get(n, [])
    return out


def seq_index(ctx, natural):
    """{ชื่อคลิป: ตำแหน่งในลำดับเล่าเรื่อง} — ตัวเลขที่ใช้แทน num ตอนเรียง"""
    order = ctx.get("scan.order", []) or []
    return {n: i for i, n in enumerate(arrange(natural, order))}


# ─────────────────────────── อ่าน ───────────────────────────

def _base(rel):
    """config ที่ตกมาจาก preset — ใช้ดูว่าค่าที่ล้างแล้วจะกลับไปเป็นอะไร"""
    ext = ""
    if rel:
        try:
            ext = (tomllib.loads(settings.read_raw(rel)).get("extends") or "")
        except (tomllib.TOMLDecodeError, TypeError):
            ext = ""
    if ext:
        try:
            return config.load(ext, [])
        except SystemExit:
            pass
    return config.load(None, [])


def view(ctx):
    """คลิปทั้งหมดพร้อมสถานะที่ขั้น 1 ต้องใช้ — ไม่ตัดจำนวน ไม่แบ่งหน้า"""
    man = read_json(ctx.manifest, {}) or {}
    excl = set(ctx.get("scan.exclude", []) or [])
    rots = ctx.get("scan.rotation_overrides", {}) or {}
    vmodes = ctx.get("video.vertical_overrides", {}) or {}
    vdefault = str(ctx.get("video.vertical_mode", "blur_pad"))

    out = []
    for cl in man.get("clips", []):
        name = cl["name"]
        vm = str(vmodes.get(name, "") or "")
        out.append({
            "name": name, "num": cl.get("num", 0),
            "orient": cl["orient"], "dur": cl["duration"],
            "w": cl["dw"], "h": cl["dh"],
            "size": cl.get("size", 0), "codec": cl.get("codec", ""),
            "motion": cl.get("motion"), "bright": cl.get("bright"),
            "created": cl.get("created") or cl.get("mtime", 0),
            # วันที่ถ่าย (created) กับวันที่ไฟล์มาถึงคลัง (mtime) เป็นคนละเรื่อง —
            # คลิปเก่าที่เพิ่งอัปโหลดเข้ามาวันนี้ต้องเรียงมาอยู่บนสุดได้ ถ้าใช้ค่า
            # เดียวกันสองหน้าที่ "เพิ่มล่าสุด" จะกลายเป็น "ถ่ายล่าสุด" เงียบ ๆ
            "added": cl.get("mtime", 0),
            "rot": str(rots.get(name, "") or ""),
            "vmode": vm, "vmode_eff": vm or vdefault,
            "picked": name not in excl,
        })
    # ส่งไปตามลำดับที่คนจัดไว้ — หน้าเว็บวาดตามลำดับใน list นี้ตรง ๆ
    out.sort(key=lambda x: (x["num"], x["name"]))
    seq = seq_index(ctx, [x["name"] for x in out])
    out.sort(key=lambda x: seq[x["name"]])

    n_v = sum(1 for x in out if x["orient"] == "V")
    return {
        "clips": out,
        "rotations": [{"value": v, "label": t} for v, t in ROTATIONS],
        "vmodes": [{"value": v, "label": t, "help": h} for v, t, h in VMODES],
        "vertical_default": vdefault,
        "summary": {
            "total": len(out), "picked": sum(1 for x in out if x["picked"]),
            "vertical": n_v, "horizontal": len(out) - n_v,
            "duration": round(sum(x["dur"] for x in out if x["picked"]), 1),
            "custom_order": bool(ctx.get("scan.order", []) or []),
            "order_mode": str(ctx.get("order.mode", "filename")),
            "order_reverse": bool(ctx.get("order.reverse", False)),
        },
    }


# ─────────────────────────── เขียน ───────────────────────────

def write_keys(rel, values):
    """เขียนคีย์ลงไฟล์โปรเจกต์ โดยไม่ทิ้งขยะไว้

    ค่าว่างที่ preset ก็ว่างอยู่แล้ว = ลบบรรทัดทิ้งแทนที่จะเขียน `x = ""` หรือ
    `x = []` ค้างไว้ ถ้าไม่แยกกรณีนี้ ไฟล์โปรเจกต์จะบวมด้วยบรรทัดที่ไม่ได้ทำ
    อะไรเลยนับร้อย — แต่ถ้า preset ตั้งค่าไว้จริง ต้องเขียนค่าว่างทับ ไม่งั้น
    ลบบรรทัดออกแล้วค่าเดิมจาก preset จะไหลกลับมา
    """
    base = _base(rel)
    changes, drop = {}, []
    for dotted, v in values.items():
        if not v and not settings.get_at(base, dotted):
            drop.append(dotted)
        else:
            changes[dotted] = v
    body = settings.patch_toml(settings.read_raw(rel), changes, drop=drop)
    return settings.save_project(rel, {}, raw=body)


def save(ctx, rel, payload):
    """เขียนสิ่งที่ผู้ใช้เลือกในขั้น 1 ลงไฟล์โปรเจกต์

    ไม่แตะ manifest ที่นี่ — ให้ sync_manifest() ทำหลังโหลด config ใหม่แล้ว
    จะได้ไม่มีทางที่ไฟล์ cache ไปล่วงหน้า config
    """
    if not rel:
        return None, "ยังไม่มีไฟล์โปรเจกต์ให้บันทึก"
    man = read_json(ctx.manifest, {}) or {}
    known = {c_["name"] for c_ in man.get("clips", [])}
    if not known:
        return None, "ยังไม่มี manifest — อ่านคลิปทั้งโฟลเดอร์ก่อน"

    excl = sorted(n for n in (payload.get("exclude") or []) if n in known)
    rots = {k: str(v or "") for k, v in (payload.get("rotations") or {}).items()
            if k in known}
    vmodes = {k: str(v or "") for k, v in (payload.get("vmodes") or {}).items()
              if k in known}
    bad_r = sorted(set(rots.values()) - ROT_OK)
    bad_v = sorted(set(vmodes.values()) - VMODE_OK - {""})
    if bad_r:
        return None, f"ค่าการหมุนไม่ถูกต้อง: {', '.join(bad_r)}"
    if bad_v:
        return None, f"โหมดแนวตั้งไม่ถูกต้อง: {', '.join(bad_v)}"

    values = {"scan.exclude": excl}
    for tbl, vals in (("scan.rotation_overrides", rots),
                      ("video.vertical_overrides", vmodes)):
        for name, v in vals.items():
            values[f"{tbl}.{name}"] = v

    # ลำดับ: เขียนเต็มรายการเสมอ แต่ถ้าจัดจนกลับไปเท่าเลขไฟล์ก็เขียนว่าง
    # (write_keys จะลบบรรทัดทิ้งให้เอง) — ไม่เก็บรายชื่อ 300 ตัวที่ไม่ได้ทำอะไร
    if payload.get("order") is not None:
        natural = sorted(known, key=scan.sort_key)
        ordered = arrange(natural, [n for n in payload["order"] if n in known])
        values["scan.order"] = [] if ordered == natural else ordered

    path, err = write_keys(rel, values)
    if err:
        return None, err
    return {"path": path, "excluded": len(excl),
            "rotated": sum(1 for v in rots.values() if v),
            "vmodes": sum(1 for v in vmodes.values() if v),
            "reordered": bool(values.get("scan.order"))}, None


# ─────────────────────────── ถังขยะ ───────────────────────────
#
# ลบคลิปแล้วไฟล์ไปนอนที่ .vcut/trash/ ไม่ได้หายจากดิสก์ทันที — ฟุตเทจดิบเป็นของ
# ที่ถ่ายใหม่ไม่ได้ กดพลาดทีเดียวแล้วจบเลยนั้นแพงเกินไป  แลกกับดิสก์ที่ยังไม่คืน
# จนกว่าจะเทถัง ซึ่งเป็นราคาที่ผู้ใช้เห็นและกดคืนเองได้

def trash_dir(ctx):
    return ctx.work / "trash"


def _index_path(ctx):
    return trash_dir(ctx) / "index.json"


def trash_view(ctx):
    """ของในถังที่ยังกู้ได้จริง — รายการที่ไฟล์หายไปแล้ว (คนลบเองนอกโปรแกรม)
    ถูกคัดออกตรงนี้ ไม่ใช่ปล่อยให้ไปพังตอนกดกู้"""
    idx = read_json(_index_path(ctx), {}) or {}
    out = []
    for it in idx.get("items", []):
        if it.get("kind") == "link" or (trash_dir(ctx) / it.get("file", "")).is_file():
            out.append(it)
    out.sort(key=lambda x: x.get("at", 0), reverse=True)
    return {"items": out, "dir": str(trash_dir(ctx))}


def _write_index(ctx, items):
    write_json(_index_path(ctx), {"items": items})


def _in_source(ctx, path):
    """ไฟล์นี้นอนอยู่ในโฟลเดอร์ฟุตเทจของโปรเจกต์นี้ไหม

    resolve() ที่ตัว *พ่อ* ไม่ใช่ที่ตัวไฟล์ — คลิปที่เพิ่มแบบอ้างอิง (symlink)
    resolve แล้วจะพุ่งไปโผล่ที่โฟลเดอร์ต้นทางเดิม แล้วด่านนี้จะไล่มันออกทั้งที่
    ตัวลิงก์เองอยู่ในคลังเรานี่แหละ
    """
    try:
        return path.parent.resolve() == ctx.source.resolve()
    except OSError:
        return False


def delete(ctx, rel, name):
    """เอาคลิปออกจากคลัง — ย้ายไฟล์เข้าถังขยะ ไม่ได้ลบทิ้งเลย

    ต่างจาก [scan] exclude ตรงที่อันนั้นแค่ "ไม่เอาเข้าหนัง" คลิปยังอยู่ในคลังและ
    กดกลับมาใช้ได้ ทางนี้คือเอาออกจากคลัง (กู้ได้ผ่านถังขยะ)

    คลิปที่เพิ่มแบบอ้างอิงจะถอดแค่ตัวลิงก์ **ไม่แตะไฟล์ต้นทาง** — ของคนอื่นที่เรา
    แค่ชี้ไปหา ไม่ใช่ของที่เราจะเอาไปทิ้งได้

    ไม่แตะ edl.json ที่นี่ — ฝั่งเรียกใช้ (serve) เป็นคนตัดชิ้นของคลิปนี้ออกจาก
    ไทม์ไลน์ผ่านทางเดิมที่คิดสรุป/บทให้ครบ จะได้ไม่มีสองสูตรที่เขียนไฟล์เดียวกัน
    """
    if not rel:
        return None, "ยังไม่มีไฟล์โปรเจกต์ให้บันทึก"
    man = read_json(ctx.manifest, {}) or {}
    cl = next((c_ for c_ in man.get("clips", []) if c_["name"] == name), None)
    if not cl:
        return None, f"ไม่พบคลิป '{name}' ในคลัง"

    src = Path(cl["src"])
    if not _in_source(ctx, src):
        return None, (f"'{name}' ไม่ได้อยู่ในโฟลเดอร์ฟุตเทจของโปรเจกต์นี้ "
                      "— เอาออกให้ไม่ได้")

    tdir = trash_dir(ctx)
    item = {"name": name, "at": int(time.time()), "kind": "file",
            "orig": src.name, "file": "", "thumb": "",
            "size": cl.get("size", 0), "dur": cl.get("duration", 0)}
    try:
        tdir.mkdir(parents=True, exist_ok=True)
        if src.is_symlink():
            item.update(kind="link", link_to=os.readlink(src))
            src.unlink()
        elif src.exists():
            keep = tdir / src.name
            if keep.exists():
                keep = tdir / f"{src.stem}-{item['at']}{src.suffix}"
            shutil.move(str(src), str(keep))
            item["file"] = keep.name
        thumb = ctx.thumb_dir / f"{name}.jpg"
        if thumb.exists():
            (tdir / "thumbs").mkdir(exist_ok=True)
            shutil.move(str(thumb), str(tdir / "thumbs" / f"{name}.jpg"))
            item["thumb"] = f"{name}.jpg"
    except OSError as e:
        return None, f"ย้ายเข้าถังขยะไม่ได้: {e}"

    idx = read_json(_index_path(ctx), {}) or {}
    _write_index(ctx, [x for x in idx.get("items", []) if x["name"] != name] + [item])

    man["clips"] = [c_ for c_ in man.get("clips", []) if c_["name"] != name]
    write_json(ctx.manifest, man)

    # ค่ารายคลิปที่ชี้มาที่ชื่อนี้ไม่มีความหมายอีกต่อไป — เก็บไว้ก็เป็นบรรทัดขยะ
    # ในไฟล์โปรเจกต์ที่ค่อย ๆ พอกขึ้นทุกครั้งที่ลบคลิป
    values = {
        "scan.exclude": sorted(n for n in (ctx.get("scan.exclude", []) or [])
                               if n != name),
        f"scan.rotation_overrides.{name}": "",
        f"video.vertical_overrides.{name}": "",
    }
    order = [n for n in (ctx.get("scan.order", []) or []) if n != name]
    natural = sorted((c_["name"] for c_ in man["clips"]), key=scan.sort_key)
    values["scan.order"] = [] if arrange(natural, order) == natural else order

    path, err = write_keys(rel, values)
    if err:
        return None, err
    return {"path": path, "deleted": name, "kind": item["kind"]}, None


def restore(ctx, name):
    """เอาคลิปกลับจากถังขยะไปที่โฟลเดอร์ฟุตเทจ — ต้อง scan อีกทีถึงจะเข้าคลัง"""
    idx = read_json(_index_path(ctx), {}) or {}
    it = next((x for x in idx.get("items", []) if x["name"] == name), None)
    if not it:
        return None, f"ไม่มี '{name}' ในถังขยะ"
    dst = ctx.source / it["orig"]
    if dst.exists() or dst.is_symlink():
        return None, f"มีไฟล์ชื่อ {it['orig']} อยู่ในโฟลเดอร์ฟุตเทจแล้ว"
    try:
        ctx.source.mkdir(parents=True, exist_ok=True)
        if it["kind"] == "link":
            if not Path(it.get("link_to", "")).exists():
                return None, f"ไฟล์ต้นทาง {it.get('link_to')} หายไปแล้ว กู้ไม่ได้"
            os.symlink(it["link_to"], dst)
        else:
            keep = trash_dir(ctx) / it["file"]
            if not keep.is_file():
                return None, "ไฟล์ในถังขยะหายไปแล้ว"
            shutil.move(str(keep), str(dst))
        if it.get("thumb"):
            t = trash_dir(ctx) / "thumbs" / it["thumb"]
            if t.is_file():
                ctx.thumb_dir.mkdir(parents=True, exist_ok=True)
                shutil.move(str(t), str(ctx.thumb_dir / it["thumb"]))
    except OSError as e:
        return None, f"กู้คืนไม่ได้: {e}"
    _write_index(ctx, [x for x in idx.get("items", []) if x["name"] != name])
    return {"restored": name, "file": str(dst)}, None


def purge(ctx, name=None):
    """เทถังขยะ — ระบุชื่อ = ทิ้งอันเดียว ไม่ระบุ = ทิ้งทั้งถัง (ถาวรจริง ๆ)"""
    idx = read_json(_index_path(ctx), {}) or {}
    items = idx.get("items", [])
    gone, keep = [], []
    for it in items:
        if name and it["name"] != name:
            keep.append(it)
            continue
        if it.get("file"):
            (trash_dir(ctx) / it["file"]).unlink(missing_ok=True)
        if it.get("thumb"):
            (trash_dir(ctx) / "thumbs" / it["thumb"]).unlink(missing_ok=True)
        gone.append(it["name"])
    if name and not gone:
        return None, f"ไม่มี '{name}' ในถังขยะ"
    _write_index(ctx, keep)
    return {"purged": gone}, None


# ─────────────────────── เพิ่มคลิปแบบอ้างอิงไฟล์เดิม ───────────────────────

def _free_name(folder, stem, ext, limit=999):
    """ชื่อแรกที่ยังว่างในโฟลเดอร์นี้ — ชนแล้วต่อท้ายด้วย -2 -3 ไปเรื่อย ๆ

    คู่แฝดของ serve.free_name() ฝั่งอัปโหลด แยกกันอยู่เพราะโมดูลนี้ไม่ import serve
    (serve เป็นฝ่าย import clips)  ที่นี่ต้องนับ symlink ที่ห้อยอยู่ด้วย ซึ่ง
    exists() ตอบ False ให้ถ้าปลายทางหายไปแล้ว
    """
    def taken(n):
        p = folder / n
        return p.exists() or p.is_symlink()

    if not taken(f"{stem}{ext}"):
        return f"{stem}{ext}"
    for n in range(2, limit + 1):
        if not taken(f"{stem}-{n}{ext}"):
            return f"{stem}-{n}{ext}"
    return f"{stem}-{limit}{ext}"


def link(ctx, path):
    """ชี้ไปที่ไฟล์ที่มีอยู่แล้วบนเครื่อง แทนที่จะก๊อปสำเนาเข้ามา

    ทำเป็น symlink ในโฟลเดอร์ฟุตเทจ — scan.list_sources() เดินดูไฟล์ในโฟลเดอร์
    นั้นด้วย is_file() ซึ่งลิงก์ที่ชี้ไปหาไฟล์จริงก็ผ่าน ทั้งไปป์ไลน์จึงไม่ต้อง
    รู้เลยว่ามันเป็นลิงก์ ต่างจากการเก็บ path ไว้ใน manifest ที่ต้องไล่แก้ทุกที่
    ที่สมมติว่าคลิปอยู่ในโฟลเดอร์เดียว

    ส่งโฟลเดอร์มาก็ได้ — ลิงก์ทุกไฟล์ที่นามสกุลตรงกับ [scan] extensions ในนั้น
    """
    p = Path(str(path or "").strip()).expanduser()
    if not str(path or "").strip():
        return None, "ยังไม่ได้ใส่ที่อยู่ไฟล์"
    if not p.exists():
        return None, f"ไม่พบ {p}"
    exts = {e.lower() for e in ctx.get("scan.extensions", [".MOV"])}
    if p.is_dir():
        files = sorted(f for f in p.iterdir()
                       if f.is_file() and f.suffix.lower() in exts
                       and not f.name.startswith("."))
        if not files:
            return None, f"ไม่พบไฟล์วิดีโอใน {p}"
    else:
        files = [p]

    try:
        ctx.source.mkdir(parents=True, exist_ok=True)
        root = ctx.source.resolve()
    except OSError as e:
        return None, f"เปิดโฟลเดอร์ฟุตเทจไม่ได้: {e}"

    linked, skipped = [], []
    for f in files:
        if f.suffix.lower() not in exts:
            skipped.append({"path": f.name, "why": f"นามสกุล {f.suffix} ไม่อยู่ใน [scan] extensions"})
            continue
        if f.resolve().parent == root:
            skipped.append({"path": f.name, "why": "อยู่ในคลังอยู่แล้ว"})
            continue
        # ชื่อชนของเดิมก็อ้างอิงซ้ำได้ — ตั้งชื่อใหม่ให้ (ลิงก์ไม่กินดิสก์อยู่แล้ว)
        dst = ctx.source / f.name
        if dst.exists() or dst.is_symlink():
            dst = ctx.source / _free_name(ctx.source, f.stem, f.suffix)
        try:
            os.symlink(f.resolve(), dst)
            linked.append(dst.name)
        except OSError as e:
            skipped.append({"path": f.name, "why": str(e)})
    if not linked and skipped:
        first = f"{skipped[0]['path']}: {skipped[0]['why']}"
        if len(skipped) == 1:
            return None, first
        return None, f"ไม่ได้เพิ่มสักไฟล์ — ข้าม {len(skipped)} ไฟล์ (เช่น {first})"
    return {"linked": linked, "skipped": skipped}, None


def sync_manifest(ctx):
    """ทำให้ orient/dw/dh ใน manifest ตรงกับ scan.rotation_overrides ปัจจุบัน

    เรียกได้ซ้ำกี่ครั้งก็ได้ ผลเหมือนเดิม — และมันซ่อมความเพี้ยนที่อาจเกิดจาก
    การแก้ไฟล์ config ด้วยมือให้ด้วย โดยไม่ต้องอ่านไฟล์วิดีโอสักไฟล์
    """
    man = read_json(ctx.manifest, {}) or {}
    if not man.get("clips"):
        return []
    over = ctx.get("scan.rotation_overrides", {}) or {}
    changed = []
    for cl in man["clips"]:
        new = str(over.get(cl["name"], "") or "")
        old = str(cl.get("rot_override", "") or "")
        if new == old:
            continue
        dw, dh = cl["dw"], cl["dh"]
        if scan.swaps_wh(old):          # ถอดของเดิมออกก่อน
            dw, dh = dh, dw
        if scan.swaps_wh(new):          # แล้วค่อยใส่ของใหม่
            dw, dh = dh, dw
        cl.update({"rot_override": new, "dw": dw, "dh": dh,
                   "orient": "V" if dh > dw else "H"})
        changed.append(cl["name"])

    man["params"] = settings.params_of(ctx.cfg, "scan")
    write_json(ctx.manifest, man)

    # ภาพตัวอย่างถูกจับด้วยมุมเดิม — ทำใหม่เลยทีละใบ (ใบละ ~0.2 วิ)
    for cl in man["clips"]:
        if cl["name"] in changed:
            (ctx.thumb_dir / f"{cl['name']}.jpg").unlink(missing_ok=True)
            thumbs._grab((cl, ctx))
    return changed


# ─────────────────────────── ตัวอย่างของจริง ───────────────────────────

def preview(ctx, name, mode):
    """ตัด 3 วินาทีกลางคลิปด้วยฟิลเตอร์ชุดเดียวกับตอน render จริง

    ใช้ build_vfilter ตัวเดียวกับ render.py — ที่เห็นในหน้าเว็บจึงเป็นสิ่งที่
    จะได้จริง ๆ ไม่ใช่ภาพจำลองที่ใกล้เคียง เก็บ cache ด้วย hash ของฟิลเตอร์
    กดสลับโหมดไปมากี่รอบก็ render แค่รอบแรก
    """
    if mode not in VMODE_OK:
        return None, f"ไม่รู้จักโหมด '{mode}'"
    man = read_json(ctx.manifest, {}) or {}
    cl = next((c_ for c_ in man.get("clips", []) if c_["name"] == name), None)
    if not cl:
        return None, "ไม่พบคลิปนี้ใน manifest"

    dur = min(PREVIEW_SECONDS, max(0.5, cl["duration"]))
    start = max(0.0, cl["duration"] / 2 - dur / 2)
    seg = {"name": name, "src": cl["src"], "orient": cl["orient"],
           "rot_override": cl["rot_override"], "full_range": cl["full_range"],
           "vertical_mode": mode, "dur": dur}
    vf = render.build_vfilter(seg, ctx)

    out = ctx.work / "preview"
    dst = out / (key_of({"vf": vf, "src": cl["src"], "size": cl.get("size", 0),
                         "start": round(start, 2), "dur": round(dur, 2),
                         "enc": render.encode_args(ctx)}) + ".mp4")
    if dst.exists() and dst.stat().st_size > 1024:
        return dst, None

    # กดสลับโหมดกลับไปกลับมาเร็ว ๆ (หรือเปิดคลิปเดียวกันสองแท็บ) ทำให้มีคำขอเดียวกัน
    # ค้างอยู่พร้อมกันหลายคำขอ — เซิร์ฟเวอร์ตอบทีละเธรด ถ้าไม่ล็อกจะมี ffmpeg
    # หลายตัวเขียนไฟล์ตัวอย่างไฟล์เดียวกันทับกัน แล้วได้ตัวอย่างที่ดูไม่ได้ค้างเป็น
    # cache ไปตลอด (กุญแจของมันมาจากฟิลเตอร์ ไม่ได้เปลี่ยนตามเวลา)
    with build_lock(dst):
        if dst.exists() and dst.stat().st_size > 1024:
            return dst, None
        out.mkdir(parents=True, exist_ok=True)
        tmp = part_path(dst, ".mp4")
        r = sh(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
                "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", cl["src"],
                "-filter_complex", vf, "-map", "[v]", "-an",
                "-fps_mode", "cfr", "-r", str(ctx.get("video.fps", "60000/1001")),
                "-color_range", "tv", "-colorspace", "bt709",
                "-color_primaries", "bt709", "-color_trc", "bt709"]
               + _video_only(render.encode_args(ctx))
               + ["-movflags", "+faststart", str(tmp)], check=False)
        if r.returncode != 0 or not tmp.exists():
            tmp.unlink(missing_ok=True)
            return None, (r.stderr or "")[-300:] or "ffmpeg ทำตัวอย่างไม่สำเร็จ"
        tmp.replace(dst)
        return dst, None


def source_path(ctx, name):
    """ไฟล์ต้นฉบับของคลิปนี้ — ผ่านเฉพาะชื่อที่อยู่ใน manifest จริง ๆ เท่านั้น"""
    man = read_json(ctx.manifest, {}) or {}
    cl = next((c_ for c_ in man.get("clips", []) if c_["name"] == name), None)
    if not cl:
        return None
    from pathlib import Path
    p = Path(cl["src"])
    return p if p.exists() else None
