"""THUMBS — ภาพนิ่งตัวอย่างต่อคลิป + contact sheet

contact sheet คือกุญแจของ Phase 4: ส่งภาพ 273 ใบให้ AI ดูทีละใบสิ้นเปลืองมาก
รวมเป็นตาราง 5×5 เหลือ 11 แผ่น ประหยัดไปกว่า 20 เท่าโดยยังดูเนื้อภาพออก
"""
from concurrent.futures import ThreadPoolExecutor

from .util import (Progress, build_lock, c, die, info, part_path, read_json,
                   run as sh, warn)

MIN_JPG = 512          # เล็กกว่านี้ไม่ใช่ภาพ — เป็นเศษไฟล์ที่ ffmpeg เขียนค้างไว้


def _grab(args):
    """ภาพตัวอย่างของคลิปหนึ่งใบ — เขียนที่อื่นก่อนแล้วค่อยย้ายมาทับเสมอ

    เมื่อก่อนเขียนลงชื่อไฟล์จริงตรง ๆ แล้วใช้แค่ `dst.exists()` เป็นตัวตรวจ cache
    ซึ่งพังสองทาง และทั้งสองทางจบที่ "ภาพเสียค้างถาวร" เพราะไม่มีใครไปตรวจซ้ำ:

      · ffmpeg ตายกลางคัน (กด "หยุด" ตอนขั้น 1 กำลังจับภาพ = โพรเซสถูกฆ่า) →
        เหลือ .jpg ที่เขียนไม่จบ  รอบหน้า exists() บอกว่ามีแล้ว จึงไม่ทำใหม่
        — ค่า returncode ก็ถูกทิ้งไปเฉย ๆ ไม่มีใครดู
      · เขียนพร้อมกันสองที่ → ffmpeg สองตัวเขียนไฟล์เดียวกันทับกัน  เกิดจริงได้
        เพราะ clips.sync_manifest() เรียกตัวนี้จากเธรดของ HTTP (กด "บันทึก" ที่
        ขั้น 1 สองครั้งรัว ๆ หรือเปิดสองแท็บ ก็สองเธรดแล้ว) คนละทางกับ
        ThreadPoolExecutor ของ thumbs.run

    ภาพที่เสียไม่ได้หยุดแค่ขั้น 1 — contact sheet ประกอบจากภาพพวกนี้ แล้วขั้น 2
    ส่ง sheet ให้ AI ดูเพื่อตัดสินว่าคลิปไหนใช้ได้ (ดูหัวไฟล์)
    """
    clip, ctx = args
    dst = ctx.thumb_dir / f"{clip['name']}.jpg"
    if dst.exists():
        return dst, True
    with build_lock(dst):
        if dst.exists():
            return dst, True
        t = min(clip["duration"] * 0.5, max(0.5, clip["duration"] - 0.2))
        w = int(ctx.get("thumbs.width", 320))
        vf = f"scale={w}:-2"
        if clip.get("rot_override"):
            vf = f"{clip['rot_override']},{vf}"
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = part_path(dst, ".jpg")
        r = sh(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
                "-ss", f"{t:.2f}", "-i", clip["src"], "-frames:v", "1",
                "-vf", vf, "-q:v", "4", str(tmp)], check=False)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < MIN_JPG:
            tmp.unlink(missing_ok=True)
            warn(f"{clip['name']}: จับภาพตัวอย่างไม่สำเร็จ — จะลองใหม่รอบหน้า")
            return dst, False
        tmp.replace(dst)
    return dst, False


def run(ctx):
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — รัน `vcut scan` ก่อน")
    clips = man["clips"]
    ctx.thumb_dir.mkdir(parents=True, exist_ok=True)

    todo = [cl for cl in clips if not (ctx.thumb_dir / f"{cl['name']}.jpg").exists()]
    info(f"THUMBS  {len(clips)} คลิป  ({c(f'cache {len(clips) - len(todo)}', 'd')}, "
         f"ใหม่ {len(todo)})")
    if todo:
        pr = Progress(len(todo), "จับภาพ")
        with ThreadPoolExecutor(max_workers=int(ctx.get("scan.workers", 6))) as ex:
            for dst, _cached in ex.map(_grab, [(cl, ctx) for cl in todo]):
                pr.step(dst.stem)
        pr.done()

    cols = int(ctx.get("thumbs.sheet_cols", 5))
    rows = int(ctx.get("thumbs.sheet_rows", 5))
    per = cols * rows
    sheets = ctx.thumb_dir / "sheets"
    sheets.mkdir(exist_ok=True)

    # ล้างแผ่นเก่า *หลัง* ทำแผ่นใหม่ครบ ไม่ใช่ก่อน — ของเดิมล้างทิ้งตั้งแต่ต้น
    # แล้วค่อยทยอยสร้างใหม่ พอรอบนั้นถูกกด "หยุด" หรือ ffmpeg พังกลางทาง
    # โฟลเดอร์จะเหลือแผ่นไม่ครบหรือไม่เหลือเลย โดยที่ไม่มีอะไรบอก แล้วขั้น 2
    # ก็ส่งเท่าที่มีให้ AI ตัดสินคลิปทั้งกอง — เห็นไม่ครบแต่ตอบเหมือนเห็นครบ
    made, kept = 0, set()
    for i in range(0, len(clips), per):
        batch = [ctx.thumb_dir / f"{cl['name']}.jpg" for cl in clips[i:i + per]]
        batch = [b for b in batch if b.exists()]
        if not batch:
            continue
        cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y"]
        for b in batch:
            cmd += ["-i", str(b)]
        n = len(batch)
        # บังคับทุกช่องให้ขนาดเท่ากันก่อน ไม่งั้นภาพแนวตั้งจะดันแถวเหลื่อม
        cw = int(ctx.get("thumbs.width", 320))
        ch = int(cw * 9 / 16)
        norm = "".join(
            f"[{k}:v]scale={cw}:{ch}:force_original_aspect_ratio=decrease,"
            f"pad={cw}:{ch}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[t{k}];"
            for k in range(n))
        fc = (norm + "".join(f"[t{k}]" for k in range(n)) +
              f"xstack=inputs={n}:layout={_layout(n, cols)}:fill=black[o]")
        if n == 1:
            fc = norm + "[t0]copy[o]"
        dst = sheets / f"sheet_{i // per + 1:02d}.jpg"
        tmp = part_path(dst, ".jpg")
        r = sh(cmd + ["-filter_complex", fc, "-map", "[o]", "-q:v", "4", str(tmp)],
               check=False)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < MIN_JPG:
            tmp.unlink(missing_ok=True)
            warn(f"ทำ {dst.name} ไม่สำเร็จ — แผ่นเดิม (ถ้ามี) ยังอยู่")
            kept.add(dst.name)          # ของเดิมยังใช้ได้อยู่ ห้ามไปลบทิ้งข้างล่าง
            continue
        tmp.replace(dst)
        kept.add(dst.name)
        made += 1

    # แผ่นที่เหลือจากรอบก่อนซึ่งรอบนี้ไม่มีแล้ว (คลิปน้อยลง = แผ่นน้อยลง)
    for f in sheets.glob("sheet_*.jpg"):
        if f.name not in kept:
            f.unlink(missing_ok=True)

    from .settings import params_of
    from .util import write_json
    write_json(ctx.thumb_dir / "params.json", {"params": params_of(ctx.cfg, "thumbs")})

    info(f"  {c('✓', 'g')} contact sheet {made} แผ่น ({per} ภาพ/แผ่น) → "
         f"{sheets.relative_to(ctx.work.parent) if sheets.is_relative_to(ctx.work.parent) else sheets}")
    return sheets


def _layout(n, cols):
    """สร้าง layout ของ xstack แบบ w0_0|w0_h0|... โดยอิงช่องซ้าย/บน"""
    cells = []
    for k in range(n):
        r, cc = divmod(k, cols)
        x = "0" if cc == 0 else "+".join(f"w{j}" for j in range(cc))
        y = "0" if r == 0 else "+".join(f"h{j * cols}" for j in range(r))
        cells.append(f"{x}_{y}")
    return "|".join(cells)
