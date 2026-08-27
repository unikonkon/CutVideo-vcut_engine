"""FINISH — ขั้น 5 · ต่อชิ้นแล้วแต่งเป็นไฟล์ตัวที่สาม (final-fx.mp4)

ไม่ตั้งอะไรเลย → ได้ไฟล์ที่เหมือนขั้น 4 ทุกประการ (ตั้งใจให้เป็นแบบนั้น และ
ตรวจได้ด้วยการเทียบไฟล์จริง) ตั้งอะไรสักอย่าง → ชั้นนั้นถูกต่อเข้าสายเดียวกัน
โดยที่ขั้น 3 กับขั้น 4 ไม่ถูกแก้แม้แต่บรรทัดเดียว

**ทำไมต้องเป็นพาสเดียว ไม่ใช่แต่งทีละชั้นทับไฟล์ไปเรื่อย ๆ**

ทุกครั้งที่เข้ารหัสภาพใหม่คือการสูญเสียคุณภาพหนึ่งรอบ ถ้าทำทีละชั้น (ต่อไฟล์ →
ใส่ข้อความ → ซ้อนภาพ → ผสมเพลง) หนังจะผ่านตัวเข้ารหัสสี่รอบและใช้เวลาสี่เท่า
ทั้งที่ ffmpeg ต่อฟิลเตอร์ทุกตัวเข้าด้วยกันในคำสั่งเดียวได้อยู่แล้ว

ลำดับของชั้นในพาสนั้นตายตัว และมีเหตุผลของมัน:

  1. ชิ้นที่แต่งแล้ว   สโลว์โม/ซูม/สี ทำตั้งแต่ตอน render รายชิ้น ไม่ใช่ที่นี่
                       — เพื่อให้ระบบ cache แบบเดียวกับขั้น 3 ใช้ได้ (fx.render)
  2. ต่อเป็นเส้นเดียว  concat
  3. ข้อความ           ต้องอยู่ *ใต้* ภาพซ้อน เพราะสติกเกอร์/การ์ดที่ตั้งใจวาง
                       ทับข้อความต้องทับได้จริง ถ้าสลับกันจะไม่มีทางวางทับเลย
  4. ภาพซ้อน           overlay.py
  5. เสียง             ผสมเพลงแล้วปรับความดังรวมทีเดียวตอนท้าย — music.py
                       (loudnorm ต้องอยู่ *หลัง* ผสมเพลง ไม่งั้นวัดความดังจาก
                       เสียงพูดอย่างเดียวแล้วหนังจริงจะดังเกินที่ตั้งไว้)
"""
from pathlib import Path

from . import caption, fx, fxtext, journey, music, overlay
from .util import c, die, info, part_path, read_json, run as sh, warn


def out_path(ctx):
    return fx.out_path(ctx)


def build_ass(ctx, W, H, data=None, man=None):
    """ไฟล์ ASS ของขั้น 5 — ข้อความ + กล่องพื้นหลัง + รูปทรงเวกเตอร์

    ทุกอย่างมาจาก fx.json ของขั้น 5 เอง **ไม่อ่าน captions.json ของขั้น 4 แล้ว**
    ขั้นนี้ต่อจากขั้น 3 อย่างเดียว (ดู fx.TEXT_ITEM สำหรับเหตุผลเต็ม)
    """
    return fxtext.build_ass(ctx, W, H, fxdata=data, man=man)


def run(ctx, out=None):
    from . import render as rmod

    exe = caption.text_ffmpeg(ctx)
    if not exe:
        die("ยังเขียนตัวหนังสือลงภาพไม่ได้ — ติดตั้ง ffmpeg-full ก่อน\n"
            "   brew install ffmpeg-full")

    # ขั้น 5 ต่อจาก render.json ของขั้น 3 และคิดเวลาข้อความจาก edl.json — ถ้าสอง
    # อย่างไม่ตรงกัน ข้อความจะถูกเผาลงภาพผิดช่วงแบบกู้ไม่ได้ ด่านนี้จึงต้องมี
    #
    # ยืมตัวตรวจของ caption.py มาใช้ ไม่ได้แปลว่าขั้น 5 พึ่งขั้น 4: มันอ่านแค่
    # edl.json กับ render.json ซึ่งเป็นของขั้น 3 ทั้งคู่ ไม่ได้แตะ captions.json
    # (เนื้อข้อความของขั้น 5 มาจาก fx.json ล้วน ๆ — ดู build_ass ข้างบน)
    why = caption.stale(ctx)
    if why:
        die(why)
    data = fx.load(ctx)
    man = fx.plan(ctx, data)
    segs = man["segments"]
    if not segs:
        die("ไม่มีชิ้นให้ต่อเลย — สั่ง 'สร้างไฟล์' ที่ขั้น 3 ก่อน")
    src_missing = [s["file"] for s in segs if not (ctx.seg_dir / s["file"]).exists()]
    if src_missing:
        die(f"ไม่พบ segment ของขั้น 3 {len(src_missing)} ชิ้น "
            f"(เช่น {src_missing[0]}) — สั่ง 'สร้างไฟล์' ที่ขั้น 3 ใหม่")

    # ชิ้นที่ถูกแต่งต้องถูกตัดใหม่ก่อน — มี cache ของตัวเอง ชิ้นที่ค่าไม่เปลี่ยน
    # จึงไม่ถูกทำซ้ำ (หลักการเดียวกับขั้น 3)
    fx.render(ctx, man)
    files = [fx.seg_file(ctx, s) for s in segs]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        die(f"ไม่พบชิ้นที่จะต่อ {len(missing)} ชิ้น (เช่น {missing[0]})")

    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    text, n = build_ass(ctx, W, H, data=data, man=man)
    if not n:
        warn("ไม่มีข้อความสักชิ้นที่จะเขียนลงไป — ได้ไฟล์ที่หน้าตาเหมือนของขั้น 3")
    lost = [s for s in fxtext.shape_cues(ctx, data, man) if s.get("orphan")]
    if lost:
        warn(f"รูปทรง {len(lost)} ชิ้นเกาะอยู่กับช่วงที่ไม่มีในหนังแล้ว — จะไม่โผล่")
    ass = ctx.work / "fx-captions.ass"
    ass.write_text(text, encoding="utf-8")

    dst = Path(out).expanduser() if out else out_path(ctx)
    dst.parent.mkdir(parents=True, exist_ok=True)
    lst = ctx.work / "concat_fx.txt"
    lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in files), encoding="utf-8")

    e = ctx.get("encode", {})
    master = float(ctx.get("audio.master_lufs", 0.0) or 0.0)
    total = float(man["total"])
    ov_in, ov_chain, vlabel = overlay.build(ctx, data, man, total)
    n_ov = ov_chain.count("overlay=")
    # เพลงต่อคิว input ถัดจากภาพซ้อน — input 0 คือรายการ concat เสมอ
    mu_in, mu_chain, alabel = music.build(ctx, data, total, master,
                                          idx=1 + n_ov)

    nsh = sum(1 for s in fxtext.shape_cues(ctx, data, man) if not s.get("orphan"))
    how = f"ข้อความ {n - nsh} ชิ้น" + (f" · รูปทรง {nsh} ชิ้น" if nsh else "")
    if man.get("touched"):
        how += f" · แต่งชิ้น {man['touched']} ชิ้น"
    if n_ov:
        how += f" · ภาพซ้อน {n_ov} ชิ้น"
    if alabel:
        mus = music.spans(data, total)
        n_duck = sum(1 for m, _, _ in mus if m.get("duck"))
        how += f" · เพลง {len(mus)} แทร็ก" + (f" (หลบเสียงพูด {n_duck})" if n_duck else "")
    info(f"FINISH  {len(files)} ชิ้น · {how} → {dst.name}  "
         f"{c('(เข้ารหัสภาพใหม่หนึ่งรอบ)', 'd')}")

    tmp = part_path(dst, ".mp4")     # ชื่อไม่ซ้ำกัน — ดูเหตุผลที่ assemble.run
    fpath = str(ass).replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")
    cmd = [exe, "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-f", "concat", "-safe", "0", "-i", str(lst)] + ov_in + mu_in

    # ไม่มีภาพซ้อน/เพลง = ใช้ -vf กับ -af เส้นเดิม ไม่ใช่ filter_complex ที่ให้ผล
    # เท่ากัน — เพื่อให้ "ไม่ตั้งอะไรเลย → ได้ไฟล์เหมือนขั้น 4 เป๊ะ" ยังเป็นจริง
    # และตรวจสอบได้ด้วยการเทียบไฟล์ ไม่ใช่ด้วยการเชื่อ
    if ov_chain or mu_chain:
        fc = [f"[0:v]ass='{fpath}'[v0]"]
        if ov_chain:
            fc.append(ov_chain)
        if mu_chain:
            fc.append(mu_chain)
        cmd += ["-filter_complex", ";".join(fc), "-map", f"[{vlabel}]"]
        cmd += ["-map", f"[{alabel}]"] if alabel else ["-map", "0:a"]
        if not alabel and master >= -70.0 and master != 0.0:
            cmd += ["-af", f"loudnorm=I={master}:TP=-1.5:LRA=11"]
    else:
        cmd += ["-vf", f"ass='{fpath}'"]
        if master >= -70.0 and master != 0.0:
            cmd += ["-af", f"loudnorm=I={master}:TP=-1.5:LRA=11"]
    cmd += rmod.encode_args(ctx, audio=False)
    cmd += ["-c:a", str(e.get("acodec", "aac")),
            "-b:a", str(e.get("abitrate", "192k")),
            "-ar", str(int(e.get("arate", 48000))),
            "-ac", str(int(e.get("achannels", 2)))]
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        die(f"แต่งหนังไม่สำเร็จ\n{r.stderr[-700:]}")
    tmp.replace(dst)

    # ตัวตรวจตัวเดียวกับขั้น 3/4 — แต่ความยาวที่คาดต้องเป็นของ *หลัง* ใส่เอฟเฟกต์
    # ไม่ใช่ของขั้น 3 ไม่งั้นพอมีสโลว์โมมันจะเตือนว่าความยาวเพี้ยนทุกครั้ง
    from .assemble import verify
    verify(ctx, dst, [{**s, "exact_dur": s["len"]} for s in segs])
    return dst


def _pending_labels(data, segs):
    """ของที่ตั้งไว้แต่ยังไม่มีใครทำ → [{key, n, owner}] ให้หน้าเว็บบอกล่วงหน้า

    เรียก fx.pending() ตัวเดียวกับที่ fx.plan() ใช้ เพราะเป็นคำถามเดียวกันเป๊ะ
    ตัดสินใจหยุด — ถ้าคำนวณคนละที่ วันหนึ่งหน้าเว็บจะบอกว่าพร้อมแล้วปุ่มกดไม่ได้
    """
    return [{"key": k, "n": n, "owner": fx.OWNER.get(k, "")}
            for k, n in sorted(fx.pending(data, segs).items())]


def _text_view(ctx, data):
    """ชั้นข้อความ+รูปทรงที่คำนวณเวลาแล้ว — ยอมให้พังแบบเงียบได้ที่นี่ที่เดียว

    หน้าเว็บเรียกตัวนี้ทุกครั้งที่เปิดขั้น 5 ถ้าอะไรสักอย่างในไทม์ไลน์ยังไม่พร้อม
    (เช่นเพิ่งกดจัดใหม่แต่ยังไม่ได้ render) การ์ดทั้งใบไม่ควรหายไปทั้งใบ ปุ่มกับ
    คำอธิบายยังต้องอ่านได้ — ส่วนตอนกดสร้างไฟล์จริงยังหยุดพร้อมบอกเหตุผลตามเดิม
    """
    try:
        return fxtext.summary(ctx, data)
    except SystemExit:
        raise
    except Exception:
        return {"ready": False, "cues": [], "shapes": [], "boxes": []}


def _journey_view(ctx, data):
    """หมุดของแผนที่พร้อมเวลาในหนัง — พังเงียบได้ด้วยเหตุผลเดียวกับ _text_view"""
    try:
        return journey.summary(data, fx.plan(ctx, data))
    except SystemExit:
        raise
    except Exception:
        return {"enabled": False, "stops": [], "orphans": 0,
                "points": 0, "length": 0.0}


def status(ctx):
    """สรุปสถานะขั้น 5 ให้หน้าเว็บ — ไม่คำนวณอะไรหนักและไม่เขียนไฟล์"""
    data = fx.load(ctx)
    o = out_path(ctx)
    rman = read_json(ctx.work / "render.json", {}) or {}
    segs = rman.get("segments", [])
    return {
        "fx": data,
        "defaults": {"clip": fx.CLIP, "live": sorted(fx.LIVE), "owner": fx.OWNER,
                     "text": fx.TEXT, "plate": fx.PLATE, "shape": fx.SHAPE,
                     "anim": fx.ANIM, "needs_pos": list(fx.NEEDS_POS),
                     "shape_kind": fx.SHAPE_KIND, "grade": fx.GRADE,
                     "pan": fx.PAN, "count": fx.COUNT, "split": fx.SPLIT,
                     "journey_look": journey.LOOK,
                     "word_anim": sorted(fx.WORD_ANIM),
                     "overlay": fx.OVERLAY, "overlay_anim": fx.OVERLAY_ANIM,
                     # ชั้นข้อความของขั้น 5 เอง — หน้าเว็บสร้างชิ้นใหม่จากค่าพวกนี้
                     "style": fx.STYLE, "text_item": fx.TEXT_ITEM,
                     "text_style_keys": list(fx.TEXT_STYLE_KEYS),
                     "line": fx.LINE, "line_h": fxtext.LINE_H,
                     "journey": fx.blank_journey(), "stop": journey.STOP},
        # ข้อความ/รูปทรงพร้อมเวลาที่คำนวณแล้ว — หน้าเว็บวาดพรีวิวจากตัวเลขชุด
        # เดียวกับที่จะกลายเป็นไฟล์จริง ไม่ให้เบราว์เซอร์คิดเอง
        # (ชื่อ "view" ไม่ใช่ "text" เพราะ fx["text"] คือ *ค่าที่ตั้งไว้* ส่วนนี่คือ
        #  *ผลที่คำนวณออกมาแล้ว* — สองอย่างนี้อยู่ในก้อนเดียวกันแล้วสับสนแน่)
        "view": _text_view(ctx, data),
        "overlay": overlay.summary(ctx, data),
        # แผนที่เส้นทาง — หมุดพร้อมเวลาที่คำนวณแล้ว ท่าเดียวกับ view
        "journey": _journey_view(ctx, data),
        "music": music.summary(ctx, data),
        "ready": bool(segs),
        "segments": len(segs),
        # เอฟเฟกต์ที่เกาะช่วงซึ่งไม่มีในไทม์ไลน์แล้ว — หน้าเว็บควรบอกตั้งแต่ก่อน
        # กดสร้างไฟล์ ไม่ใช่ให้ไปเจอเป็นบรรทัดเตือนกลาง log ตอนรันไปแล้วครึ่งทาง
        "orphans": fx.orphans(data, segs),
        "pending": _pending_labels(data, segs),
        "ffmpeg": {"ok": bool(caption.text_ffmpeg(ctx, quiet=True)),
                   "how": "brew install ffmpeg-full"},
        # รายชื่อฟอนต์ในเครื่อง — ขั้น 5 มีสไตล์ของตัวเองแล้ว จึงต้องมีรายการให้
        # เลือกเองด้วย (caption.fonts() แค่ไล่ฟอนต์ในระบบ ไม่ได้อ่าน captions.json)
        "fonts": caption.fonts(),
        "out": {"path": str(o), "name": o.name, "exists": o.exists(),
                "size": o.stat().st_size if o.exists() else 0,
                "mtime": int(o.stat().st_mtime) if o.exists() else 0},
    }
