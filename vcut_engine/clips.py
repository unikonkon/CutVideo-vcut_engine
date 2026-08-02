"""CLIPS — งานของขั้น 1 ที่ทำกับคลิปเป็นราย ๆ

สามอย่างที่ตัดสินตั้งแต่ตอนเลือกฟุตเทจ ก่อนจะรู้ด้วยซ้ำว่าหนังจะเล่าอะไร:

    เอาคลิปไหนบ้าง        [scan] exclude
    คลิปไหนต้องหมุน        [scan.rotation_overrides]
    แนวตั้งทำเป็นแนวนอนยังไง  [video.vertical_overrides]

ทั้งสามเก็บใน config ไม่ใช่ในไฟล์ cache — ลบ .vcut/ ทิ้งทั้งโฟลเดอร์แล้วรัน
ใหม่ ก็ยังได้ผลเดิม และ commit เข้า git ให้คนอื่นได้ผลเดียวกันได้

**หมุนคลิปแล้วไม่ต้อง scan ใหม่** — rot_override มีผลแค่กับ orient/dw/dh
ส่วน motion · ความสว่าง · ความดัง วัดจากไฟล์ดิบก่อนหมุนทั้งหมด (ดู scan._one)
แก้ manifest ตรงจุดจึงถูกต้องเท่ากับ scan ใหม่ทั้งกอง แต่ใช้เวลาไม่ถึงวินาที
แทนที่จะเป็น 40 นาที
"""
import tomllib

from . import config, render, scan, settings, thumbs
from .util import key_of, read_json, run as sh, write_json

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
            "rot": str(rots.get(name, "") or ""),
            "vmode": vm, "vmode_eff": vm or vdefault,
            "picked": name not in excl,
        })
    out.sort(key=lambda x: (x["num"], x["name"]))
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

    path, err = write_keys(rel, values)
    if err:
        return None, err
    return {"path": path, "excluded": len(excl),
            "rotated": sum(1 for v in rots.values() if v),
            "vmodes": sum(1 for v in vmodes.values() if v)}, None


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

    out.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".part.mp4")
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
