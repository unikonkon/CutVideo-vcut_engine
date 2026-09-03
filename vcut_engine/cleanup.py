"""CLEANUP — เก็บกวาด cache ที่ EDL/fx ปัจจุบันไม่ได้ใช้แล้ว (คำสั่ง `vcut gc`)

แยกออกมาจาก cli.py เพราะหน้าเว็บ (serve.py) ต้องถามได้ว่า "ถ้าล้างจะคืนพื้นที่
เท่าไร" ก่อนกด และสั่งล้างได้โดยไม่ต้อง spawn โปรเซสใหม่ — cli.cmd_gc กับ
/api/gc จึงเดินโค้ดเดียวกันเป๊ะ ไม่มีทางที่ตัวเลขบนจอกับสิ่งที่ถูกลบจริงจะต่างกัน

preview() ไม่แตะไฟล์เลย · apply() ลบตามรายการเดียวกับที่ preview() รายงาน
"""
from pathlib import Path

from . import fx, render
from .util import read_json, sweep_dir


def wanted_segments(ctx):
    """ชื่อไฟล์ segment ที่ EDL + config ปัจจุบันต้องใช้

    คำนวณ hash ใหม่แทนที่จะเชื่อรายชื่อใน render.json เพราะไฟล์นั้นถูกเขียนไว้
    ตอน render รอบก่อน ซึ่งอาจใช้สูตรคนละแบบกับตอนนี้ — ถ้าเชื่อมัน ไฟล์สูตร
    เก่าจะถูกนับว่า "ยังใช้อยู่" ตลอดไป และ gc จะไม่ลบอะไรเลย

    ชิ้นที่ยังไม่เคยวัดความดังคำนวณ hash ไม่ได้ ถ้ามีแบบนั้นปนอยู่ก็เก็บรายชื่อ
    จาก render.json ไว้ด้วย ดีกว่าลบเกินจนต้อง render ใหม่ทั้งกองโดยไม่ตั้งใจ

    **ต้องถามความดังผ่าน render.seg_loud() ไม่ใช่เปิด loudness.json อ่านเอง**
    เปิด [audio] match_clips ไว้เมื่อไร ชิ้นจะพก loud_ref (ค่าของทั้งคลิป) มาเอง
    และ render ใช้ค่านั้นคิด gain — ส่วน loudness.json เก็บค่าที่วัดทีละท่อนซึ่ง
    อาจค้างจากรอบก่อนหน้าที่ยังไม่ได้เปิดสวิตช์ อ่านผิดตัวแล้ว gain ผิด → กุญแจ
    ผิด → ไฟล์จริงไม่อยู่ในรายการ "ยังใช้อยู่" แล้ว gc ลบชิ้นที่ยังต้องใช้ทิ้ง
    (วัดกับโปรเจกต์จริง: 174 จาก 208 ชิ้นคิด gain ออกมาไม่ตรงกับที่ render ใช้)
    """
    rman = read_json(ctx.work / "render.json", {}) or {}
    listed = {s["file"] for s in rman.get("segments", [])}
    edl = read_json(ctx.edl)
    if not edl:
        return listed
    loud = read_json(ctx.work / "loudness.json", {}) or {}
    a = ctx.get("audio", {})
    keep, unknown = set(), 0
    for raw in edl.get("timeline", []):
        seg = {**raw, "_lkey": f"{raw['name']}@{raw['start']:.3f}+{raw['dur']:.3f}"}
        if not seg.get("loud_ref") and seg["_lkey"] not in loud:
            unknown += 1
            continue
        I, TP = render.seg_loud(seg, loud)
        gain, _ = render.compute_gain(I, TP, float(seg["target_lufs"]), a)
        keep.add(f"{render.seg_key(seg, ctx, gain)}.mov")
    return keep | listed if unknown else keep


def wanted_fx(ctx):
    """ชื่อไฟล์ในโฟลเดอร์ fxseg ที่ fx.json ปัจจุบันต้องใช้

    คำนวณใหม่ด้วยเหตุผลเดียวกับ wanted_segments — เชื่อรายชื่อใน fx-render.json
    ที่เขียนไว้รอบก่อนไม่ได้ ถ้าสูตรคิดกุญแจเปลี่ยนไป ไฟล์รุ่นเก่าจะถูกนับว่า
    "ยังใช้อยู่" ตลอดกาลแล้ว gc จะไม่ลบอะไรเลย
    """
    try:
        man = fx.plan(ctx)
    except SystemExit:
        # ยังไม่มี render.json หรือ fx.json ตั้งของที่ทำไม่ได้ไว้ — ตอบไม่ได้ว่า
        # ต้องเก็บอะไร คืน None แล้วให้ผู้เรียก *ข้ามการเก็บกวาดไปเลย*
        # (คืนเซ็ตว่างไม่ได้ — มันแปลว่า "ไม่ต้องเก็บอะไรเลย" = ลบทิ้งทั้งโฟลเดอร์)
        return None
    return {s["out"] for s in man["segments"] if s["fx"]}


def _size(files):
    return sum(f.stat().st_size for f in files if f.exists())


def _dir_size(d):
    if not d.exists():
        return 0
    return sum(p.stat().st_size for p in d.rglob("*") if p.is_file())


def preview(ctx):
    """ของที่ gc จะลบ กับของที่ยังต้องเก็บ — ไม่แตะไฟล์

    คืน dict ที่หน้าเว็บโชว์ได้ตรง ๆ: จำนวน/ขนาดของ segment ที่ไม่ได้ใช้ ·
    ที่ยังใช้ · ชิ้นแต่ง (ขั้น 5) ที่ตกค้าง · สำเนาเว็บ · และขนาด .vcut ทั้งก้อน
    """
    out = {"has_cache": ctx.seg_dir.exists(),
           "unused": 0, "unused_bytes": 0,
           "in_use": 0, "in_use_bytes": 0,
           "need_render": 0,
           "fx_unused": 0, "fx_unused_bytes": 0, "fx_known": True,
           "web_unused_bytes": 0,
           "work_bytes": _dir_size(ctx.work)}
    if not ctx.seg_dir.exists():
        return out
    keep = wanted_segments(ctx)
    segs = render.seg_files(ctx)
    unused = [f for f in segs if f.name not in keep]
    used = [f for f in segs if f.name in keep]
    out["unused"], out["unused_bytes"] = len(unused), _size(unused)
    out["in_use"], out["in_use_bytes"] = len(used), _size(used)
    out["need_render"] = max(0, len(keep) - len(used))

    web = ctx.work / "segweb"
    if web.exists():
        stems = {Path(k).stem for k in keep}
        out["web_unused_bytes"] = _size([f for f in web.glob("*.mp4")
                                         if f.stem not in stems])

    keep_fx = wanted_fx(ctx)
    fxdir = fx.seg_dir(ctx)
    if keep_fx is None:
        out["fx_known"] = False
    elif fxdir.exists():
        junk = [f for f in fxdir.iterdir()
                if f.suffix.lower() == ".mov" and ".part." not in f.name
                and f.name not in keep_fx]
        out["fx_unused"], out["fx_unused_bytes"] = len(junk), _size(junk)
    out["total_bytes"] = (out["unused_bytes"] + out["web_unused_bytes"]
                          + out["fx_unused_bytes"])
    return out


def apply(ctx):
    """ลบตามที่ preview() รายงาน — คืนสรุปว่าลบไปกี่ไฟล์ คืนพื้นที่เท่าไร"""
    # ไฟล์ระหว่างเขียนของขั้น 1 กับขั้น 2 — ต้องกวาดก่อนเช็ค segment cache
    # เพราะตอนที่ขั้น 1/2 ถูกกดหยุดค้างไว้ ยังไม่มีโฟลเดอร์ segment ด้วยซ้ำ
    # ถ้าไปกวาดทีหลังจะเจอ return ข้างล่างตัดหน้าไปก่อนตลอด แล้วของขาด ๆ
    # (wav ของทั้งคลิปมีเป็น GB) ก็ไม่มีใครเก็บให้เลย
    n_part = sum(sweep_dir(d) for d in
                 (ctx.thumb_dir, ctx.thumb_dir / "sheets", ctx.audio_dir,
                  ctx.work / "whisper", ctx.work / "preview")
                 if d.exists())
    res = {"partial": n_part, "segments": 0, "fx": 0, "freed_bytes": 0,
           "in_use": 0, "have": 0, "need_render": 0, "has_cache": False}
    if not ctx.seg_dir.exists():
        return res
    res["has_cache"] = True
    keep = wanted_segments(ctx)
    for f in render.seg_files(ctx):
        if f.name not in keep:
            res["freed_bytes"] += f.stat().st_size
            f.unlink()
            res["segments"] += 1
    # ไฟล์ระหว่างเขียนที่ตกค้าง — เฉพาะของโพรเซสที่ตายไปแล้ว ไม่แตะของที่กำลัง
    # ตัดอยู่จริงในอีกหน้าต่าง (ดู util.sweep_dir)
    sweep_dir(ctx.seg_dir)
    # สำเนาสำหรับหน้าเว็บของชิ้นที่ไม่ได้ใช้แล้ว
    web = ctx.work / "segweb"
    if web.exists():
        stems = {Path(k).stem for k in keep}
        for f in web.glob("*.mp4"):
            if f.stem not in stems:
                res["freed_bytes"] += f.stat().st_size
                f.unlink()
    # ชิ้นที่ขั้น 5 แต่งไว้ — ทุกครั้งที่มีคนขยับความเร็ว/ซูม/โทนสี กุญแจเปลี่ยน
    # แล้วไฟล์เก่ากลายเป็นขยะทันที ถ้าไม่เก็บกวาดที่นี่ด้วยดิสก์จะโตขึ้นเงียบ ๆ
    keep_fx = wanted_fx(ctx)
    fxdir = fx.seg_dir(ctx)
    if keep_fx is not None and fxdir.exists():
        for f in fxdir.iterdir():
            if f.suffix.lower() == ".mov" and ".part." not in f.name \
                    and f.name not in keep_fx:
                res["freed_bytes"] += f.stat().st_size
                f.unlink()
                res["fx"] += 1
        sweep_dir(fxdir)
    have = len(render.seg_files(ctx))
    res["in_use"], res["have"] = len(keep), have
    res["need_render"] = max(0, len(keep) - have)
    return res
