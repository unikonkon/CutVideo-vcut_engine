"""ASSEMBLE — ต่อ segment เป็นไฟล์เดียว

concat_mode = "copy" ต่อ**ภาพ**โดยไม่เข้ารหัสซ้ำ: เปลี่ยนลำดับ/ตัดชิ้นออกแล้ว
ต่อใหม่ได้ในไม่กี่วินาที คุณภาพเท่าเดิมเป๊ะ (ทำได้เพราะทุกชิ้นถูก encode ด้วย
พารามิเตอร์เดียวกันและบังคับ keyframe ทุก 1 วินาที)

**เสียงถูกเข้ารหัสใหม่ที่นี่เสมอ** เพราะ segment เก็บเสียงเป็น PCM — ต่อ AAC
ทีละชิ้นแบบ copy ทำให้เสียงเลื่อนสะสมจนไม่ตรงปาก (เหตุผลเต็มอยู่ใน render.py)
เข้ารหัสครั้งเดียวทั้งเรื่องจึงมี encoder delay ชุดเดียวที่ mp4 ตัดทิ้งให้ถูกต้อง
หนัง 21 นาทีใช้เวลาส่วนนี้ราว 15 วินาที
"""
from pathlib import Path

from .util import (c, die, hhmmss, info, measure_loudness, part_path,
                   probe_video, read_json, run as sh, warn)


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

    how = ("ภาพ stream copy · เข้ารหัสเสียงใหม่" if mode == "copy"
           else "เข้ารหัสใหม่ทั้งภาพและเสียง")
    info(f"ASSEMBLE  {len(files)} ชิ้น → {dst.name}  ({c(how, 'd')})")

    e = ctx.get("encode", {})
    # ปุ่มในหน้าเว็บกันไม่ให้สั่งงานซ้อนกันอยู่แล้ว แต่สั่งจากเทอร์มินัลตอนที่หน้าเว็บ
    # กำลังต่อไฟล์อยู่ยังทำได้ — ถ้าชื่อไฟล์ระหว่างเขียนเป็นตัวเดียวกัน ffmpeg สองตัว
    # จะเขียนทับกันแล้ว final.mp4 ที่ replace ออกมาคือไฟล์เสีย  ชื่อที่ไม่ซ้ำกัน
    # ทำให้อย่างแย่ที่สุดคือ "ใครเสร็จทีหลังชนะ" ซึ่งยังเป็นไฟล์ที่สมบูรณ์เสมอ
    tmp = part_path(dst, ".mp4")
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-f", "concat", "-safe", "0", "-i", str(lst)]
    if mode == "copy":
        cmd += ["-c:v", "copy"]
        if master >= -70.0 and master != 0.0:
            cmd += ["-af", f"loudnorm=I={master}:TP=-1.5:LRA=11"]
        cmd += ["-c:a", str(e.get("acodec", "aac")),
                "-b:a", str(e.get("abitrate", "192k")),
                "-ar", str(int(e.get("arate", 48000))),
                "-ac", str(int(e.get("achannels", 2)))]
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
    want = sum(s.get("exact_dur") or s["dur"] for s in segs)
    I, TP = measure_loudness(dst)
    drift = d["duration"] - want
    av = (d.get("adur") or 0.0) - (d.get("vdur") or 0.0)

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
    # ต้องตรวจแยกจากความยาวรวม — เสียงเลื่อนสะสมโผล่ที่นี่ที่เดียว ความยาวไฟล์
    # รวมยังตรงตาม EDL เป๊ะแม้เสียงกับภาพจะยาวไม่เท่ากันหลายวินาที
    info(f"  เสียงเทียบภาพ    ยาวต่างกัน {av * 1000:+.0f} ms"
         + ("" if abs(av) <= 0.05 else c("   ⚠ เสียงจะไม่ตรงกับปาก", "y")))
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
    if abs(av) > 0.05:
        warn(f"track เสียงยาวต่างจาก track ภาพ {av:+.2f} วิ — เสียงจะเลื่อนจากภาพ\n"
             f"   ตรวจว่า segment เป็น .mov เสียง PCM หรือไม่ (ถ้าเป็น .mp4 รุ่นเก่า "
             f"ให้ลบด้วย `vcut gc` แล้ว render ใหม่)")
    info("─" * 62)
