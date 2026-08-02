"""SILENCE — หาช่วงที่ไม่มีเสียงพูดจริง ๆ ในคลิปพูด → .vcut/silence.json

ทำไมต้องมีขั้นนี้ทั้งที่มี transcript อยู่แล้ว: whisper คืนช่วงมาหยาบมาก
ฟุตเทจชุดนี้ 109 จาก 116 คลิปพูดได้ช่วงเดียวยาว ๆ ทั้งคลิป — ช่วงที่คนหยุด
คิด หายใจ หรือเดินเงียบ ๆ อยู่ในนั้นหมด ตัดตาม transcript อย่างเดียวจึงตัด
อะไรออกไม่ได้เลย

ที่นี่วัดจากคลื่นเสียงตรง ๆ ด้วย ffmpeg silencedetect แล้วเก็บเป็นช่วงเงียบ
ให้ prepare.py เอาไปคว้านออกจากช่วงพูด ผลคือ **cut ชน** — ประโยคต่อประโยค
ติดกันโดยไม่มีช่องว่างคั่น

วิเคราะห์เสียงอย่างเดียว ไม่แตะภาพ (-vn) จึงเร็วกว่า scan มาก และ cache ไว้
รันซ้ำไม่เสียเวลา ตราบใดที่ค่าใน [jumpcut] ยังเท่าเดิม
"""
import re
from concurrent.futures import ThreadPoolExecutor

from .util import (Progress, c, die, info, read_json, run as sh, warn,
                   write_json)

_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
_END = re.compile(r"silence_end:\s*(-?[\d.]+)")

# ค่าที่มีผลต่อ "ช่วงเงียบอยู่ตรงไหน" — เปลี่ยนแล้วต้องฟังใหม่
DETECT_KEYS = ("noise_db", "min_silence")


def params_of(ctx):
    j = ctx.get("jumpcut", {}) or {}
    return {k: j.get(k) for k in DETECT_KEYS}


def detect(path, noise_db, min_silence, clip_len):
    """คืนช่วงเงียบ [[a, b], ...] — ช่วงที่เงียบยาวถึงเกณฑ์เท่านั้น"""
    r = sh(["ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-v", "info",
            "-i", str(path), "-map", "0:a:0",
            "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
            "-f", "null", "-"], check=False)
    out, open_at = [], None
    for line in (r.stderr or "").splitlines():
        m = _START.search(line)
        if m:
            open_at = max(0.0, float(m.group(1)))
            continue
        m = _END.search(line)
        if m and open_at is not None:
            out.append([round(open_at, 3), round(min(float(m.group(1)), clip_len), 3)])
            open_at = None
    if open_at is not None and clip_len - open_at > 0:
        out.append([round(open_at, 3), round(clip_len, 3)])   # เงียบยาวไปจนจบคลิป
    return [x for x in out if x[1] - x[0] > 0]


def run(ctx, force=False):
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — ทำขั้นที่ 1 (อ่านคลิป) ก่อน")
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})

    j = ctx.get("jumpcut", {}) or {}
    noise = float(j.get("noise_db", -32.0))
    minsil = float(j.get("min_silence", 0.45))
    params = params_of(ctx)

    # หาเฉพาะคลิปที่มีคนพูด — คลิปวิวถูกตัดด้วยกฎความยาวอยู่แล้ว ไม่ได้ตัดตามเสียง
    todo_all = [cl for cl in man["clips"]
                if tr.get(cl["name"]) and cl.get("achannels", 0) > 0]
    if not todo_all:
        warn("ยังไม่มีคลิปไหนที่มีคำพูด — ทำขั้น 'ดึงบทพูด' ก่อน")
        write_json(ctx.work / "silence.json", {"params": params, "clips": {}})
        return {"clips": {}}

    old = read_json(ctx.work / "silence.json", {}) or {}
    cached = old.get("clips", {}) if (not force and old.get("params") == params) else {}
    todo = [cl for cl in todo_all if cl["name"] not in cached]

    info(f"SILENCE  {len(todo_all)} คลิปพูด  ({c(f'cache {len(todo_all) - len(todo)}', 'd')}"
         f", ใหม่ {len(todo)})  ·  เงียบกว่า {noise:g} dB นานเกิน {minsil:g} วิ")

    found = dict(cached)
    if todo:
        pr = Progress(len(todo), "ฟัง")

        def one(cl):
            return cl["name"], detect(cl["src"], noise, minsil, cl["duration"])

        with ThreadPoolExecutor(max_workers=int(ctx.get("scan.workers", 6))) as ex:
            for name, gaps in ex.map(one, todo):
                found[name] = gaps
                pr.step(name)
        pr.done()

    keep = {cl["name"]: found.get(cl["name"], []) for cl in todo_all}
    data = {"params": params, "clips": keep}
    write_json(ctx.work / "silence.json", data)

    quiet = sum(b - a for v in keep.values() for a, b in v)
    talk_len = sum(cl["duration"] for cl in todo_all)
    n_gap = sum(len(v) for v in keep.values())
    info("─" * 62)
    info(f"  ช่วงเงียบที่เจอ     {n_gap:>4} ช่วง   รวม {quiet / 60:.1f} นาที "
         f"จากคลิปพูด {talk_len / 60:.1f} นาที ({quiet / max(talk_len, 1) * 100:.0f}%)")
    info(f"  {c('ตัดออกจริงเท่าไรขึ้นกับ [jumpcut] pad / min_piece ตอนเตรียมวิดีโอ', 'd')}")
    info("─" * 62)
    return data
