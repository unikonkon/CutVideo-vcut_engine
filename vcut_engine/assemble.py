"""ASSEMBLE — ต่อ segment เป็นไฟล์เดียว

concat_mode = "copy" ต่อโดยไม่เข้ารหัสซ้ำ: เปลี่ยนลำดับ/ตัดชิ้นออกแล้วต่อใหม่
ได้ในไม่กี่วินาที ภาพและเสียงคุณภาพเท่าเดิมเป๊ะ (ทำได้เพราะทุกชิ้นถูก encode
ด้วยพารามิเตอร์เดียวกันและบังคับ keyframe ทุก 1 วินาที)
"""
from pathlib import Path

from .util import (c, die, hhmmss, info, measure_loudness, probe_video,
                   read_json, run as sh, warn)


def _write_concat_list(ctx, files):
    p = ctx.work / "concat.txt"
    p.write_text("".join(f"file '{f.as_posix()}'\n" for f in files), encoding="utf-8")
    return p


def run(ctx, out=None):
    rman = read_json(ctx.work / "render.json")
    if not rman:
        die("ยังไม่มี render.json — รัน `vcut render` ก่อน")
    segs = sorted(rman["segments"], key=lambda s: s["i"])
    files = [ctx.seg_dir / s["file"] for s in segs]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        die(f"ไม่พบ segment {len(missing)} ชิ้น (เช่น {missing[0]}) — รัน `vcut render` ใหม่")

    dst = Path(out).expanduser() if out else ctx.out
    dst.parent.mkdir(parents=True, exist_ok=True)
    lst = _write_concat_list(ctx, files)
    mode = ctx.get("render.concat_mode", "copy")
    master = float(ctx.get("audio.master_lufs", 0.0) or 0.0)

    info(f"ASSEMBLE  {len(files)} ชิ้น → {dst.name}  "
         f"({c('stream copy' if mode == 'copy' else 'เข้ารหัสใหม่', 'd')})")

    tmp = dst.with_suffix(".part.mp4")
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-f", "concat", "-safe", "0", "-i", str(lst)]
    if mode == "copy" and master >= -70.0 and master != 0.0:
        # ต้องเข้ารหัสเสียงใหม่เพื่อทำ loudnorm แต่ภาพยัง copy ได้
        cmd += ["-c:v", "copy", "-af", f"loudnorm=I={master}:TP=-1.5:LRA=11",
                "-c:a", "aac", "-b:a", str(ctx.get("encode.abitrate", "192k"))]
    elif mode == "copy":
        cmd += ["-c", "copy"]
    else:
        from .render import encode_args
        cmd += encode_args(ctx)
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        die(f"ต่อไฟล์ไม่สำเร็จ\n{r.stderr[-600:]}")
    tmp.replace(dst)

    verify(ctx, dst, segs)
    return dst


def verify(ctx, dst, segs):
    d = probe_video(dst)
    if not d:
        warn("ตรวจไฟล์ผลลัพธ์ไม่ได้")
        return
    want = sum(s["dur"] for s in segs)
    I, TP = measure_loudness(dst)
    drift = d["duration"] - want

    info("─" * 62)
    info(f"  {c('✓', 'g')} {dst}")
    info(f"  ความยาว        {hhmmss(d['duration'])}  "
         f"({d['duration']:.1f} วิ, ตาม EDL {want:.1f} วิ, "
         f"ต่าง {drift:+.2f} วิ)")
    info(f"  ภาพ            {d['w']}×{d['h']} · {d['codec']} · {d['pix_fmt']} · "
         f"{d['fps']}fps")
    info(f"  เสียง          {d['acodec']} · {d['arate']}Hz · {d['achannels']}ch")
    info(f"  ความดังรวม      {I:.1f} LUFS   true peak {TP:.1f} dBFS"
         + ("" if TP <= -1.0 else c("   ⚠ พีคสูง เสี่ยงเสียงแตก", "y")))
    info(f"  ขนาด           {dst.stat().st_size / 1e9:.2f} GB")

    talk = [s for s in segs if s["kind"] == "TALK"]
    broll = [s for s in segs if s["kind"] == "BROLL"]
    if talk:
        info(f"  ช่วงพูด        {len(talk)} ชิ้น · {sum(s['dur'] for s in talk) / 60:.1f} นาที")
    if broll:
        info(f"  ช่วงวิว         {len(broll)} ชิ้น · {sum(s['dur'] for s in broll) / 60:.1f} นาที")
    n_lim = sum(1 for s in segs if s.get("limiter"))
    info(f"  limiter ทำงาน   {n_lim}/{len(segs)} ชิ้น")
    if abs(drift) > 1.0:
        warn(f"ความยาวต่างจาก EDL {drift:+.2f} วิ — ปกติเกิดจาก keyframe ไม่ตรง")
    info("─" * 62)
