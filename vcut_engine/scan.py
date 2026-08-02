"""SCAN — อ่านคุณสมบัติทุกคลิปครั้งเดียว แล้ว cache ไว้

ผลลัพธ์: manifest.json — โมดูลอื่นอ่านจากนี่ ไม่ต้องแตะไฟล์วิดีโอซ้ำอีก
cache ตรวจด้วย (ขนาดไฟล์ + mtime) ถ้าไฟล์ไม่เปลี่ยน จะข้ามทันที
"""
import re
from concurrent.futures import ThreadPoolExecutor

from .util import (Progress, c, info, measure_loudness, measure_motion_bright,
                   probe_video, read_json, warn, write_json)

NUM_RE = re.compile(r"(\d+)")


def sort_key(name, mode="filename"):
    m = NUM_RE.findall(name)
    return (int(m[-1]) if m else 0, name)


def list_sources(ctx):
    exts = {e.lower() for e in ctx.get("scan.extensions", [".MOV"])}
    if not ctx.source.is_dir():
        return []
    files = [p for p in ctx.source.iterdir()
             if p.is_file() and p.suffix.lower() in exts and not p.name.startswith(".")]
    return sorted(files, key=lambda p: sort_key(p.stem))


def _orientation(info_d, rot_override):
    """ทิศทางจริงหลังใช้ rotation_overrides แล้ว

    ffmpeg autorotate ตาม metadata ไปแล้วชั้นหนึ่ง (dw/dh สลับให้แล้ว)
    ถ้ามี transpose ทับอีกที ขนาดจะสลับกลับ
    """
    dw, dh = info_d["dw"], info_d["dh"]
    if rot_override and "transpose" in rot_override:
        dw, dh = dh, dw
    return ("V" if dh > dw else "H"), dw, dh


def _one(args):
    path, ctx = args
    name = path.stem
    d = probe_video(path)
    if not d:
        return {"name": name, "error": "ffprobe อ่านไม่ได้"}

    rot_over = ctx.get("scan.rotation_overrides", {}).get(name, "")
    orient, dw, dh = _orientation(d, rot_over)

    win = float(ctx.get("scan.motion_window", 20.0))
    motion, bright = measure_motion_bright(
        path, 0.0, min(d["duration"], win),
        int(ctx.get("scan.motion_fps", 5)), int(ctx.get("scan.bright_fps", 2)))
    lufs, tp = measure_loudness(path)

    return {
        "name": name,
        "src": str(path),
        "num": sort_key(name)[0],
        "mtime": int(path.stat().st_mtime),
        "created": d.get("created", 0) or int(path.stat().st_mtime),
        "size": d["size"],
        "duration": d["duration"],
        "w": d["w"], "h": d["h"], "dw": dw, "dh": dh,
        "rot": d["rot"], "rot_override": rot_over,
        "orient": orient,
        "codec": d["codec"], "pix_fmt": d["pix_fmt"],
        "color_range": d["color_range"],
        "fps": d["fps"], "avg_fps": d["avg_fps"],
        "vfr": abs(d["fps"] - d["avg_fps"]) > 0.5,
        "acodec": d["acodec"], "achannels": d["achannels"], "arate": d["arate"],
        "full_range": name in set(ctx.get("scan.color.full_range_clips", [])),
        "motion": motion, "bright": bright,
        "lufs": round(lufs, 1), "peak": round(tp, 1),
    }


def run(ctx, force=False):
    files = list_sources(ctx)
    if not files:
        warn(f"ไม่พบไฟล์วิดีโอใน {ctx.source}")
        return {"clips": []}

    old = {c_["name"]: c_ for c_ in (read_json(ctx.manifest, {}) or {}).get("clips", [])}
    todo, reuse = [], []
    for p in files:
        prev = old.get(p.stem)
        st = p.stat()
        if (not force and prev and prev.get("size") == st.st_size
                and prev.get("mtime") == int(st.st_mtime) and "error" not in prev):
            reuse.append(prev)
        else:
            todo.append(p)

    # manifest รุ่นเก่ายังไม่มีเวลาถ่ายจริง — เติมย้อนหลังด้วย ffprobe อย่างเดียว
    # (วินาทีเดียวจบ) ดีกว่าบังคับให้ scan ใหม่ทั้งกองซึ่งต้องวิเคราะห์ motion ใหม่หมด
    stale = [r for r in reuse if not r.get("created")]
    if stale:
        info(f"  {c(f'เติมเวลาถ่ายจริงให้ {len(stale)} คลิป …', 'd')}")

        def _created(rec):
            d = probe_video(rec["src"])
            return rec, (d or {}).get("created", 0) or rec.get("mtime", 0)

        with ThreadPoolExecutor(max_workers=int(ctx.get("scan.workers", 6))) as ex:
            for rec, ts in ex.map(_created, stale):
                rec["created"] = ts

    info(f"SCAN  {len(files)} คลิป  ({c(f'cache {len(reuse)}', 'd')}, ใหม่ {len(todo)})")
    out = list(reuse)
    if todo:
        pr = Progress(len(todo), "อ่าน")
        with ThreadPoolExecutor(max_workers=int(ctx.get("scan.workers", 6))) as ex:
            for rec in ex.map(_one, [(p, ctx) for p in todo]):
                out.append(rec)
                pr.step(rec["name"])
        pr.done()

    out.sort(key=lambda x: (x.get("num", 0), x["name"]))
    bad = [x for x in out if "error" in x]
    for x in bad:
        warn(f"{x['name']}: {x['error']}")

    from .settings import params_of
    data = {"source": str(ctx.source), "params": params_of(ctx.cfg, "scan"),
            "clips": [x for x in out if "error" not in x]}
    write_json(ctx.manifest, data)
    report(data)
    return data


def report(data):
    cl = data["clips"]
    if not cl:
        return
    tot = sum(x["duration"] for x in cl)
    H = [x for x in cl if x["orient"] == "H"]
    V = [x for x in cl if x["orient"] == "V"]
    codecs, fpss = {}, {}
    for x in cl:
        codecs[x["codec"]] = codecs.get(x["codec"], 0) + 1
        fpss[round(x["fps"], 2)] = fpss.get(round(x["fps"], 2), 0) + 1

    info("─" * 62)
    info(f"  คลิปทั้งหมด     {len(cl):>4}   {tot / 60:>6.1f} นาที   "
         f"{sum(x['size'] for x in cl) / 1e9:.1f} GB")
    info(f"  แนวนอน         {len(H):>4}   {sum(x['duration'] for x in H) / 60:>6.1f} นาที")
    info(f"  แนวตั้ง         {len(V):>4}   {sum(x['duration'] for x in V) / 60:>6.1f} นาที")
    info(f"  codec          " + " · ".join(f"{k} ×{v}" for k, v in
                                           sorted(codecs.items(), key=lambda i: -i[1])))
    info(f"  fps            " + " · ".join(f"{k} ×{v}" for k, v in
                                           sorted(fpss.items(), key=lambda i: -i[1])))

    flags = [
        ("หมุนภาพเอง (metadata ผิด)", [x["name"] for x in cl if x["rot_override"]]),
        ("full range → tv", [x["name"] for x in cl if x["full_range"]]),
        ("เสียง mono", [x["name"] for x in cl if x["achannels"] == 1]),
        ("VFR (frame rate ไม่คงที่)", [x["name"] for x in cl if x["vfr"]]),
        ("ไม่มีเสียง", [x["name"] for x in cl if x["achannels"] == 0]),
    ]
    shown = [f for f in flags if f[1]]
    if shown:
        info("─" * 62)
        for label, names in shown:
            head = " ".join(names[:6]) + (f" (+{len(names) - 6})" if len(names) > 6 else "")
            info(f"  {c('!', 'y')} {label:<26} {len(names):>3}  {c(head, 'd')}")
    info("─" * 62)
