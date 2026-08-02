"""THUMBS — ภาพนิ่งตัวอย่างต่อคลิป + contact sheet

contact sheet คือกุญแจของ Phase 4: ส่งภาพ 273 ใบให้ AI ดูทีละใบสิ้นเปลืองมาก
รวมเป็นตาราง 5×5 เหลือ 11 แผ่น ประหยัดไปกว่า 20 เท่าโดยยังดูเนื้อภาพออก
"""
from concurrent.futures import ThreadPoolExecutor

from .util import Progress, c, die, info, read_json, run as sh


def _grab(args):
    clip, ctx = args
    dst = ctx.thumb_dir / f"{clip['name']}.jpg"
    if dst.exists():
        return dst, True
    t = min(clip["duration"] * 0.5, max(0.5, clip["duration"] - 0.2))
    w = int(ctx.get("thumbs.width", 320))
    vf = f"scale={w}:-2"
    if clip.get("rot_override"):
        vf = f"{clip['rot_override']},{vf}"
    sh(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
        "-ss", f"{t:.2f}", "-i", clip["src"], "-frames:v", "1",
        "-vf", vf, "-q:v", "4", str(dst)], check=False)
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
    for f in sheets.glob("*.jpg"):
        f.unlink()

    made = 0
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
        r = sh(cmd + ["-filter_complex", fc, "-map", "[o]", "-q:v", "4", str(dst)],
               check=False)
        if r.returncode == 0:
            made += 1

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
