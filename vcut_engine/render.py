"""RENDER — ตัดแต่ละชิ้นจากไฟล์ต้นฉบับตรง ๆ แล้วแก้ทุกอย่างในพาสเดียว

แก้ในพาสเดียว: หมุนภาพ · แนวตั้ง+พื้นหลังเบลอ · full range→tv · fps CFR ·
mono→stereo · ปรับระดับเสียง · limiter · fade

cache: ชื่อไฟล์ = sha1 ของทุกพารามิเตอร์ที่มีผลต่อภาพ/เสียงของชิ้นนั้น
→ เปลี่ยนลำดับใน EDL ไม่ต้อง render ใหม่ · เปลี่ยนความยาว B-roll render ใหม่เฉพาะวิว
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .util import (Progress, c, die, disk_free_gb, info, key_of,
                   measure_loudness, read_json, run as sh, warn, write_json)


# ─────────────────────────── ฟิลเตอร์ภาพ ───────────────────────────

def build_vfilter(seg, ctx):
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    flags = ctx.get("video.scale_flags", "lanczos")
    rng = ":in_range=full:out_range=tv" if seg.get("full_range") else ""
    pre = f"{seg['rot_override']}," if seg.get("rot_override") else ""
    tail = "setsar=1,format=yuv420p"

    if seg["orient"] == "V":
        mode = ctx.get("video.vertical_mode", "blur_pad")
        if mode == "blur_pad":
            b = ctx.get("video.blur", {})
            bw, bh = str(b.get("scale", "480:270")).split(":")
            return (
                f"[0:v]{pre}split=2[bg][fg];"
                f"[bg]scale={bw}:{bh}:force_original_aspect_ratio=increase{rng},"
                f"crop={bw}:{bh},gblur=sigma={b.get('sigma', 9)},"
                f"eq=brightness={b.get('brightness', -0.10)}:"
                f"saturation={b.get('saturation', 0.85)},"
                f"scale={W}:{H}:flags=bilinear[bgb];"
                f"[fg]scale=-2:{H}:flags={flags}{rng}[fgs];"
                f"[bgb][fgs]overlay=(W-w)/2:0:shortest=1,{tail}[v]")
        if mode == "pillarbox":
            return (f"[0:v]{pre}scale=-2:{H}:flags={flags}{rng},"
                    f"pad={W}:{H}:(ow-iw)/2:0:black,{tail}[v]")
        if mode == "crop":
            return (f"[0:v]{pre}scale={W}:{H}:force_original_aspect_ratio=increase"
                    f":flags={flags}{rng},crop={W}:{H},{tail}[v]")

    return (f"[0:v]{pre}scale={W}:{H}:force_original_aspect_ratio=decrease"
            f":flags={flags}{rng},pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,{tail}[v]")


# ─────────────────────────── ฟิลเตอร์เสียง ───────────────────────────

def compute_gain(I, TP, target, a):
    """gain แบบรู้พีค: ดูทั้งความดังและยอดคลื่น เอาค่าที่น้อยกว่า

    ถ้าดูความดังอย่างเดียว คลิปที่เบามากจะถูกเร่งจนพีคทะลุ แล้วโยนภาระให้
    limiter บีบจนเสียงแบน — สูตรนี้กันไม่ให้ไปถึงจุดนั้นตั้งแต่แรก
    """
    ceiling = float(a.get("tp_ceiling", -4.0))
    allow = float(a.get("allow_limit", 12.0))
    g_loud = target - I
    g_peak = (ceiling + allow) - TP
    gain = min(g_loud, g_peak)
    gain = max(-float(a.get("cap_down", 15.0)), min(float(a.get("cap_up", 32.0)), gain))
    return round(gain, 2), (g_peak < g_loud)


def build_afilter(seg, gain, ctx):
    a = ctx.get("audio", {})
    e = ctx.get("encode", {})
    limit_lin = 10 ** (float(a.get("tp_ceiling", -4.0)) / 20.0)
    fade = float(a.get("fade", 0.02))
    parts = [f"aresample={int(e.get('arate', 48000))}"]
    if a.get("denoise", False):
        parts.append("afftdn=nf=-25")
    if a.get("compressor", False):
        parts.append("acompressor=threshold=-18dB:ratio=3:attack=20:release=250")
    parts.append(f"volume={gain:.2f}dB")
    lvl = ":level=disabled" if a.get("limiter_level_disabled", True) else ""
    parts.append(f"alimiter=limit={limit_lin:.4f}{lvl}")
    if fade > 0:
        parts.append(f"afade=t=in:st=0:d={fade}")
        parts.append(f"afade=t=out:st={max(0.0, seg['dur'] - fade):.3f}:d={fade}")
    return ",".join(parts)


# ─────────────────────────── encode args ───────────────────────────

def encode_args(ctx):
    e = ctx.get("encode", {})
    v = e.get("vcodec", "h264_videotoolbox")
    args = ["-c:v", v]
    if v in ("libx264", "libx265"):
        args += ["-crf", str(e.get("crf", 18)), "-preset", str(e.get("preset", "medium"))]
    else:
        args += ["-b:v", str(e.get("bitrate", "20M")),
                 "-maxrate", str(e.get("maxrate", "26M")),
                 "-bufsize", str(e.get("bufsize", "52M"))]
    args += ["-profile:v", str(e.get("profile", "high")),
             "-g", str(int(e.get("gop", 60))),
             "-force_key_frames",
             f"expr:gte(t,n_forced*{float(e.get('keyframe_sec', 1.0))})",
             "-c:a", str(e.get("acodec", "aac")),
             "-b:a", str(e.get("abitrate", "192k")),
             "-ar", str(int(e.get("arate", 48000))),
             "-ac", str(int(e.get("achannels", 2)))]
    return args


# ─────────────────────────── loudness cache ───────────────────────────

def _loud_cache_path(ctx):
    return ctx.work / "loudness.json"


def measure_all(ctx, timeline, force=False):
    cache = {} if force else (read_json(_loud_cache_path(ctx), {}) or {})
    todo = []
    for s in timeline:
        k = f"{s['name']}@{s['start']:.3f}+{s['dur']:.3f}"
        s["_lkey"] = k
        if k not in cache:
            todo.append(s)
    if todo:
        pr = Progress(len(todo), "วัดเสียง")

        def one(s):
            return s["_lkey"], measure_loudness(s["src"], s["start"], s["dur"])

        with ThreadPoolExecutor(max_workers=int(ctx.get("scan.workers", 6))) as ex:
            for k, (I, TP) in ex.map(one, todo):
                cache[k] = [round(I, 2), round(TP, 2)]
                pr.step(k.split("@")[0])
        pr.done()
        write_json(_loud_cache_path(ctx), cache)
    return cache


# ─────────────────────────── render ───────────────────────────

def seg_key(seg, ctx, gain):
    try:
        st = Path(seg["src"]).stat()
        sig = [st.st_size, int(st.st_mtime)]
    except OSError:
        sig = [0, 0]
    return key_of({
        "src": seg["src"], "sig": sig,
        "start": round(seg["start"], 3), "dur": round(seg["dur"], 3),
        "vf": build_vfilter(seg, ctx),
        "af": build_afilter(seg, gain, ctx),
        "enc": encode_args(ctx),
        "fps": ctx.get("video.fps"),
        "silent": seg.get("achannels", 2) == 0,
    })


def render_one(seg, ctx, gain, dst):
    if dst.exists() and dst.stat().st_size > 1024:
        return True, "cache"
    tmp = dst.with_suffix(".part.mp4")
    silent = seg.get("achannels", 2) == 0
    e = ctx.get("encode", {})

    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-ss", f"{seg['start']:.3f}", "-t", f"{seg['dur']:.3f}", "-i", seg["src"]]
    if silent:
        cmd += ["-f", "lavfi", "-t", f"{seg['dur']:.3f}",
                "-i", f"anullsrc=r={int(e.get('arate', 48000))}"
                      f":cl={'stereo' if int(e.get('achannels', 2)) == 2 else 'mono'}"]
    cmd += ["-filter_complex", build_vfilter(seg, ctx), "-map", "[v]"]
    cmd += ["-map", "1:a:0"] if silent else ["-map", "0:a:0"]
    cmd += ["-af", build_afilter(seg, gain, ctx)]
    cmd += ["-fps_mode", "cfr", "-r", str(ctx.get("video.fps", "60000/1001")),
            "-color_range", "tv", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709"]
    cmd += encode_args(ctx)
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False, r.stderr[-400:]
    tmp.replace(dst)
    return True, "new"


def run(ctx, force=False):
    edl = read_json(ctx.edl)
    if not edl:
        die("ยังไม่มี edl.json — รัน `vcut decide` ก่อน")
    tl = edl["timeline"]
    if not tl:
        die("EDL ว่างเปล่า — ตรวจเงื่อนไขใน [broll] / [select]")

    need = float(ctx.get("render.min_free_gb", 5.0))
    free = disk_free_gb(ctx.work)
    if free < need:
        die(f"ดิสก์เหลือ {free:.1f} GB น้อยกว่าเกณฑ์ {need} GB\n"
            f"   ลบ cache เก่าด้วย `vcut gc` หรือลด [render] min_free_gb")

    loud = measure_all(ctx, tl, force=force)
    a = ctx.get("audio", {})
    ctx.seg_dir.mkdir(parents=True, exist_ok=True)

    plan, n_lim = [], 0
    for i, seg in enumerate(tl):
        I, TP = loud.get(seg["_lkey"], [-70.0, -70.0])
        gain, limited = compute_gain(I, TP, float(seg["target_lufs"]), a)
        n_lim += limited
        k = seg_key(seg, ctx, gain)
        plan.append({"i": i, "seg": seg, "gain": gain, "limited": limited,
                     "src_lufs": I, "src_peak": TP,
                     "key": k, "path": ctx.seg_dir / f"{k}.mp4"})

    todo = [p for p in plan if not (p["path"].exists() and p["path"].stat().st_size > 1024)]
    info(f"RENDER  {len(plan)} ชิ้น  ({c(f'cache {len(plan) - len(todo)}', 'd')}, "
         f"ใหม่ {len(todo)})  ·  limiter แตะจริง {n_lim} ชิ้น")

    if force:
        for p in plan:
            p["path"].unlink(missing_ok=True)
        todo = plan

    failed = []
    if todo:
        pr = Progress(len(todo), "render")

        def work(p):
            ok, msg = render_one(p["seg"], ctx, p["gain"], p["path"])
            return p, ok, msg

        with ThreadPoolExecutor(max_workers=int(ctx.get("render.workers", 2))) as ex:
            for p, ok, msg in ex.map(work, todo):
                if not ok:
                    failed.append((p["seg"]["name"], msg))
                pr.step(f"{p['seg']['name']} {p['gain']:+.1f}dB")
        pr.done()

    for name, msg in failed:
        warn(f"render ล้มเหลว {name}: {msg[:200]}")
    if failed:
        die(f"มี {len(failed)} ชิ้นที่ render ไม่สำเร็จ")

    manifest = {
        # start อยู่ในนี้เพื่อให้ผูกชิ้น → ไฟล์ได้โดยไม่ต้องพึ่งลำดับ i
        # (viewer สลับลำดับแล้ว i เปลี่ยน แต่ (name, start, dur) ยังเหมือนเดิม)
        "segments": [{"i": p["i"], "name": p["seg"]["name"], "kind": p["seg"]["kind"],
                      "start": p["seg"]["start"], "dur": p["seg"]["dur"], "key": p["key"],
                      "file": p["path"].name, "gain": p["gain"],
                      "src_lufs": p["src_lufs"], "src_peak": p["src_peak"],
                      "target_lufs": p["seg"]["target_lufs"],
                      "limiter": p["limited"]} for p in plan],
        "limiter_engaged": n_lim,
    }
    write_json(ctx.work / "render.json", manifest)

    used = sum(p["path"].stat().st_size for p in plan if p["path"].exists()) / 1e9
    orphan = len([f for f in ctx.seg_dir.glob("*.mp4")
                  if f.name not in {p["path"].name for p in plan}])
    info(f"  segment cache {used:.2f} GB" +
         (f"  ·  {c(f'ไฟล์เก่าไม่ได้ใช้ {orphan} ชิ้น (ล้างด้วย vcut gc)', 'd')}"
          if orphan else ""))
    return manifest
