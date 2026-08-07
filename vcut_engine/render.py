"""RENDER — ตัดแต่ละชิ้นจากไฟล์ต้นฉบับตรง ๆ แล้วแก้ทุกอย่างในพาสเดียว

แก้ในพาสเดียว: หมุนภาพ · แนวตั้ง+พื้นหลังเบลอ · full range→tv · fps CFR ·
mono→stereo · ปรับระดับเสียง · limiter · fade

cache: ชื่อไฟล์ = sha1 ของทุกพารามิเตอร์ที่มีผลต่อภาพ/เสียงของชิ้นนั้น
→ เปลี่ยนลำดับใน EDL ไม่ต้อง render ใหม่ · เปลี่ยนความยาว B-roll render ใหม่เฉพาะวิว

**ทำไม segment ถึงเป็น .mov เสียง PCM ไม่ใช่ .mp4 เสียง AAC**

ขั้นต่อไฟล์ใช้ `concat -c copy` ซึ่งคัดลอก packet ดิบโดยไม่ถอดรหัส วิธีนั้นเร็ว
มากแต่ต่อ AAC ข้ามชิ้นแบบไร้รอยต่อไม่ได้: ตัวเข้ารหัส AAC ใส่ sample ขยะไว้
หัวไฟล์ทุกครั้ง (encoder priming ~1024 sample) ปกติ mp4 ตัดทิ้งด้วย edit list
ของไฟล์นั้น แต่พอ copy มาต่อกัน edit list หายไป ขยะจึงถูกเล่นออกมาหมด

วัดจริงกับฟุตเทจชุดนี้: 357 ชิ้น เสียงเกินภาพชิ้นละ 19.4 ms สะสมเป็น 6.9 วินาที
ตอนจบเรื่อง — เสียงไม่ตรงปากและยิ่งดูยิ่งเพี้ยน

PCM ไม่มี encoder delay ให้สะสม ต่อ -c copy ได้ตรงเป๊ะ แล้วค่อยเข้ารหัสเสียง
เป็น AAC ครั้งเดียวตอน assemble (ภาพยัง copy จึงยังเร็วเหมือนเดิม) ราคาที่จ่าย
คือ segment cache โตขึ้นราว 8% — ดู exact_dur() สำหรับอีกครึ่งของการแก้
"""
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .util import (Progress, build_lock, c, die, disk_free_gb, info, key_of,
                   measure_loudness, part_path, read_json, run as sh, warn,
                   write_json)


# ─────────────────────────── ฟิลเตอร์ภาพ ───────────────────────────

def build_vfilter(seg, ctx):
    W = int(ctx.get("video.width", 1920))
    H = int(ctx.get("video.height", 1080))
    flags = ctx.get("video.scale_flags", "lanczos")
    rng = ":in_range=full:out_range=tv" if seg.get("full_range") else ""
    pre = f"{seg['rot_override']}," if seg.get("rot_override") else ""
    tail = "setsar=1,format=yuv420p"

    if seg["orient"] == "V":
        # เลือกได้ทีละคลิปตั้งแต่ขั้น 1 — ไม่ได้ก็ตกมาใช้ค่ากลางของทั้งเรื่อง
        mode = (seg.get("vertical_mode")
                or (ctx.get("video.vertical_overrides", {}) or {}).get(seg["name"])
                or ctx.get("video.vertical_mode", "blur_pad"))
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


# ─────────────────── ความยาวชิ้นที่ภาพกับเสียงเท่ากันเป๊ะ ───────────────────

def fps_value(ctx):
    n, _, d = str(ctx.get("video.fps", "60000/1001")).partition("/")
    try:
        return float(n) / float(d or 1)
    except (ValueError, ZeroDivisionError):
        return 60000 / 1001


def exact_frames(dur, ctx):
    """ความยาวชิ้นคิดเป็นจำนวนเฟรมเต็ม — ปัดแบบใกล้ที่สุด ไม่ใช่ปัดขึ้น
    ความยาวหนังรวมจึงไม่ขยับ (ค่าคลาดเฉลี่ยเป็นศูนย์)"""
    return max(1, int(round(dur * fps_value(ctx))))


def exact_dur(dur, ctx):
    """ความยาวที่ลงตัวกับกริดเฟรม — ภาพและเสียงจะยาวเท่านี้ทั้งคู่

    นี่คืออีกครึ่งของการแก้เสียงเลื่อน (อีกครึ่งคือเสียง PCM ดู docstring บนสุด)
    ภาพ CFR ยาวเป็นจำนวนเฟรมเต็มเสมอ ปัดได้ถึง 17 ms ที่ 59.94 fps ส่วนเสียง
    ยาวตามที่สั่งเป๊ะ ๆ ความต่างชิ้นละ 13 ms สะสม 357 ชิ้นก็หลายวินาที
    """
    return exact_frames(dur, ctx) / fps_value(ctx)


def segment_vfilter(seg, ctx, frames):
    """ฟิลเตอร์ภาพของชิ้นที่จะ render — ออกมาเป็น `frames` เฟรมพอดีเสมอ

    tpad โคลนเฟรมสุดท้ายเผื่อไว้ ทำให้ภาพยาวถึงเป้าแน่ ๆ แม้ต้นฉบับหมดพอดี
    แล้ว trim=end_frame ตัดให้เหลือจำนวนที่ต้องการ

    ตัดด้วย **จำนวนเฟรม** ไม่ใช่ `-t` ตามเวลา เพราะเวลาสิ้นสุดของชิ้นคือ
    N/59.94 พอดี ซึ่งตรงกับ pts ของเฟรมที่ N พอดีเป๊ะ แล้ว -t เก็บเฟรมนั้น
    เข้ามาด้วย ได้ภาพยาวเกินเสียงไป 1 เฟรม (16.7 ms) — วัดจริงเจอ 6 ใน 40 ชิ้น
    จำนวนเฟรมเป็นจำนวนเต็ม จึงไม่มีปัญหาเส้นแบ่งแบบนี้
    """
    return (build_vfilter(seg, ctx)[:-3]
            + f",tpad=stop_mode=clone:stop_duration=0.5"
            + f",fps={ctx.get('video.fps', '60000/1001')}"
            + f",trim=end_frame={int(frames)},setpts=PTS-STARTPTS[v]")


def segment_afilter(seg, ctx, gain, dur):
    """ฟิลเตอร์เสียงของชิ้นที่จะ render + บังคับความยาวให้เท่ากับภาพ

    apad เติมความเงียบให้ยาวพอ · atrim ตัดที่วินาทีเดียวกับที่ภาพถูกตัด
    ใช้ atrim แทน -t เพราะ -t ตัดเป็นก้อน packet ส่วน atrim ตัดตรง sample
    """
    return (build_afilter({**seg, "dur": dur}, gain, ctx)
            + f",apad,atrim=end={dur:.6f}")


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


def seg_loud(seg, loud):
    """ค่าความดัง/พีคที่ใช้คิด gain ของชิ้นนี้

    ปกติเป็นของท่อนนี้เอง แต่ถ้าขั้นเตรียมวัดทั้งคลิปมาให้ (loud_ref) ใช้ของ
    ทั้งคลิปแทน — ทุกท่อนในคลิปเดียวกันจึงได้ gain เท่ากันเป๊ะ ซึ่งคือทั้งหมด
    ของโหมดนั้น · ต้องเอาพีคของทั้งคลิปมาด้วย ไม่ใช่แค่ LUFS ไม่งั้นเพดานพีค
    จะบีบแต่ละท่อนคนละค่าแล้ว gain กลับมาไม่เท่ากันอีก
    """
    ref = seg.get("loud_ref")
    if ref and len(ref) == 2:
        return float(ref[0]), float(ref[1])
    return loud.get(seg.get("_lkey"), [-70.0, -70.0])


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

def encode_args(ctx, audio=True):
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
             f"expr:gte(t,n_forced*{float(e.get('keyframe_sec', 1.0))})"]
    if audio:
        args += ["-c:a", str(e.get("acodec", "aac")),
                 "-b:a", str(e.get("abitrate", "192k")),
                 "-ar", str(int(e.get("arate", 48000))),
                 "-ac", str(int(e.get("achannels", 2)))]
    return args


def seg_audio_args(ctx):
    """เสียงของ segment เก็บเป็น PCM — ไม่มี encoder delay ให้สะสมตอนต่อไฟล์"""
    e = ctx.get("encode", {})
    return ["-c:a", "pcm_s16le",
            "-ar", str(int(e.get("arate", 48000))),
            "-ac", str(int(e.get("achannels", 2)))]


# ─────────────────────────── loudness cache ───────────────────────────

def _loud_cache_path(ctx):
    return ctx.work / "loudness.json"


def measure_all(ctx, timeline, force=False):
    cache = {} if force else (read_json(_loud_cache_path(ctx), {}) or {})
    todo = []
    for s in timeline:
        k = f"{s['name']}@{s['start']:.3f}+{s['dur']:.3f}"
        s["_lkey"] = k
        # ชิ้นที่มีค่าของทั้งคลิปติดมาแล้วไม่ต้องวัดซ้ำ — ค่าที่วัดได้จะไม่ถูกใช้
        if s.get("loud_ref"):
            continue
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
    n = exact_frames(seg["dur"], ctx)
    dur = n / fps_value(ctx)
    return key_of({
        "src": seg["src"], "sig": sig,
        "start": round(seg["start"], 3), "dur": round(dur, 6),
        "vf": segment_vfilter(seg, ctx, n),
        "af": segment_afilter(seg, ctx, gain, dur),
        "enc": encode_args(ctx, audio=False) + seg_audio_args(ctx),
        "fps": ctx.get("video.fps"),
        "silent": seg.get("achannels", 2) == 0,
    })


def render_one(seg, ctx, gain, dst):
    if dst.exists() and dst.stat().st_size > 1024:
        return True, "cache"
    tmp = part_path(dst, ".mov")
    silent = seg.get("achannels", 2) == 0
    e = ctx.get("encode", {})
    n = exact_frames(seg["dur"], ctx)
    dur = n / fps_value(ctx)
    # อ่านต้นฉบับเผื่อไว้ครึ่งวินาที ให้ tpad/apad มีของพอจะยืดถึงเวลาเป้าหมาย
    read = dur + 0.5

    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-ss", f"{seg['start']:.3f}", "-t", f"{read:.3f}", "-i", seg["src"]]
    if silent:
        cmd += ["-f", "lavfi", "-t", f"{read:.3f}",
                "-i", f"anullsrc=r={int(e.get('arate', 48000))}"
                      f":cl={'stereo' if int(e.get('achannels', 2)) == 2 else 'mono'}"]
    cmd += ["-filter_complex", segment_vfilter(seg, ctx, n), "-map", "[v]"]
    cmd += ["-map", "1:a:0"] if silent else ["-map", "0:a:0"]
    cmd += ["-af", segment_afilter(seg, ctx, gain, dur)]
    cmd += ["-fps_mode", "cfr", "-r", str(ctx.get("video.fps", "60000/1001")),
            "-t", f"{dur:.6f}",
            "-color_range", "tv", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709"]
    cmd += encode_args(ctx, audio=False) + seg_audio_args(ctx)
    cmd += ["-movflags", "+faststart", str(tmp)]

    r = sh(cmd, check=False)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        return False, r.stderr[-400:]
    tmp.replace(dst)
    return True, "new"


def _dedup(plan):
    """ชิ้นที่กุญแจซ้ำกันต้องเหลือคิวเดียว — ไม่ใช่หลายคิวที่ตัดไฟล์เดียวกันพร้อมกัน

    ไทม์ไลน์มีชิ้นที่เหมือนกันเป๊ะสองชิ้นได้ (ซอยแล้วลากขอบกลับมาเท่ากัน หรือ
    หยิบช็อตเดิมมาใช้ซ้ำ) — กุญแจไม่มีคำว่า "ลำดับ" อยู่ในนั้น ทั้งคู่จึงชี้ไปที่
    ไฟล์ปลายทางชื่อเดียวกัน ปล่อยเข้า ThreadPoolExecutor พร้อมกันแล้ว ffmpeg
    สองตัวจะตัดทับกัน ได้ segment ที่พังแล้วมันจะถูกต่อเข้าหนังจริงทั้งขั้น 3, 4
    และ 5 (ทุกขั้นใช้ segment ชุดเดียวกัน) โดยไม่มีอะไรเตือน เพราะตัวตรวจ cache
    ดูแค่ว่ามีไฟล์และใหญ่กว่า 1 KB
    """
    seen, out = set(), []
    for p in plan:
        k = str(p["path"])
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out


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
        I, TP = seg_loud(seg, loud)
        gain, limited = compute_gain(I, TP, float(seg["target_lufs"]), a)
        n_lim += limited
        k = seg_key(seg, ctx, gain)
        plan.append({"i": i, "seg": seg, "gain": gain, "limited": limited,
                     "src_lufs": I, "src_peak": TP,
                     "key": k, "path": ctx.seg_dir / f"{k}.mov"})

    todo = _dedup(p for p in plan
                  if not (p["path"].exists() and p["path"].stat().st_size > 1024))
    info(f"RENDER  {len(plan)} ชิ้น  ({c(f'cache {len(plan) - len(todo)}', 'd')}, "
         f"ใหม่ {len(todo)})  ·  limiter แตะจริง {n_lim} ชิ้น")

    if force:
        for p in plan:
            p["path"].unlink(missing_ok=True)
        todo = _dedup(plan)

    failed = []
    t0 = time.time()
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
        # dur = ความยาวตาม EDL (หน้าเว็บใช้จับคู่ชิ้น) · exact_dur = ความยาวจริง
        # ของไฟล์ที่ปัดลงกริดเฟรมแล้ว ซึ่ง assemble ใช้ตรวจว่าต่อไฟล์ครบไหม
        "segments": [{"i": p["i"], "name": p["seg"]["name"], "kind": p["seg"]["kind"],
                      "start": p["seg"]["start"], "dur": p["seg"]["dur"], "key": p["key"],
                      "exact_dur": round(exact_dur(p["seg"]["dur"], ctx), 6),
                      "file": p["path"].name, "gain": p["gain"],
                      "src_lufs": p["src_lufs"], "src_peak": p["src_peak"],
                      "target_lufs": p["seg"]["target_lufs"],
                      "limiter": p["limited"]} for p in plan],
        "limiter_engaged": n_lim,
    }
    # เก็บอัตราเร็วจริงไว้ให้หน้า setup ประเมินเวลาได้แม่นขึ้นทุกครั้งที่ render
    prev = read_json(ctx.work / "render.json", {}) or {}
    manifest["sec_per_segment"] = (
        round((time.time() - t0) / len(todo), 2) if todo
        else prev.get("sec_per_segment"))
    write_json(ctx.work / "render.json", manifest)

    used = sum(p["path"].stat().st_size for p in plan if p["path"].exists()) / 1e9
    orphan = len([f for f in seg_files(ctx)
                  if f.name not in {p["path"].name for p in plan}])
    info(f"  segment cache {used:.2f} GB" +
         (f"  ·  {c(f'ไฟล์เก่าไม่ได้ใช้ {orphan} ชิ้น (ล้างด้วย vcut gc)', 'd')}"
          if orphan else ""))
    return manifest


# ─────────────────────────── ไฟล์ segment ───────────────────────────

def seg_files(ctx):
    """ไฟล์ segment ทั้งหมดในแคช — รวม .mp4 รุ่นเก่าไว้ด้วยเพื่อให้ gc เก็บกวาดได้"""
    if not ctx.seg_dir.exists():
        return []
    return [f for f in ctx.seg_dir.iterdir()
            if f.suffix.lower() in (".mov", ".mp4") and ".part." not in f.name]


def web_copy(ctx, name):
    """สำเนาที่เบราว์เซอร์เล่นได้ — segment จริงเก็บเสียงเป็น PCM ซึ่งเบราว์เซอร์
    ส่วนใหญ่เล่นไม่ได้ ทำสำเนาเสียง AAC ไว้ให้หน้าเว็บ ภาพ stream copy จึงเร็วมาก
    และทำครั้งเดียวต่อชิ้น (ชิ้นที่ไม่เคยกดดูก็ไม่เสียเวลาทำ)
    """
    src = ctx.seg_dir / name
    if not src.exists():
        return None
    if src.suffix.lower() == ".mp4":
        return src
    out = ctx.work / "segweb"
    dst = out / f"{src.stem}.mp4"
    if dst.exists() and dst.stat().st_size > 1024:
        return dst
    # ตัวเล่นในหน้าเว็บขอชิ้นเดียวกันพร้อมกันได้จริง: <video> สองตัวสลับกัน ตัวหนึ่ง
    # เล่นอยู่อีกตัว preload ท่อนถัดไป และในโหมด "ดูเฉพาะรอยต่อ" ท่อนที่ติดกันคือ
    # ชิ้นเดียวกัน · กดดูชิ้นในแถบข้างระหว่างที่ชิ้นนั้นกำลังเล่นก็ชนกันได้
    # ถ้าไม่ล็อก ffmpeg สองตัวจะเขียนสำเนาเดียวกันทับกัน แล้วได้ไฟล์เสียที่ค้างเป็น
    # cache ตลอดไป (เห็นเป็นภาพเละ/เล่นไม่ได้ รีเฟรชกี่ครั้งก็ไม่หาย)
    with build_lock(dst):
        if dst.exists() and dst.stat().st_size > 1024:
            return dst
        out.mkdir(parents=True, exist_ok=True)
        tmp = part_path(dst, ".mp4")
        r = sh(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y", "-i", str(src),
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", str(tmp)], check=False)
        if r.returncode != 0 or not tmp.exists():
            tmp.unlink(missing_ok=True)
            return None
        tmp.replace(dst)
        return dst
