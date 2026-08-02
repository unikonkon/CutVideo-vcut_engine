"""LISTEN — แยกเสียง + ถอดเสียงด้วย whisper.cpp

ผลลัพธ์: transcript.json — { clip: [ [start, end, text], ... ] }
cache รายคลิป: ถอดแล้วไม่ถอดซ้ำ
import_dir: ถ้ามีผล whisper จากรอบก่อน ดึงมาใช้ได้เลย ไม่ต้องรันใหม่
"""
import re
import shutil
from pathlib import Path

from .util import (Progress, c, die, info, read_json, run as sh, warn,
                   write_json)


def _patterns(ctx):
    return [re.compile(p) for p in ctx.get("listen.filter.hallucination", [])]


def parse_whisper_json(path, pats, min_chars=1):
    """อ่าน output ของ whisper.cpp -oj → [[start, end, text], ...]"""
    data = read_json(path)
    if not data:
        return []
    out = []
    for s in data.get("transcription", []):
        off = s.get("offsets") or {}
        a = off.get("from", 0) / 1000.0
        b = off.get("to", 0) / 1000.0
        t = (s.get("text") or "").strip()
        if b <= a or len(t) < min_chars:
            continue
        if any(p.match(t) for p in pats):
            continue
        out.append([round(a, 3), round(b, 3), t])
    return out


def _find_import(import_dir, name):
    if not import_dir:
        return None
    d = Path(import_dir).expanduser()
    for cand in (d / f"{name}.wav.json", d / f"{name}.json", d / f"{name}.mp3.json"):
        if cand.exists():
            return cand
    return None


def _extract_wav(src, dst):
    """16 kHz mono PCM — รูปแบบที่ whisper ต้องการ"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = sh(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
            "-i", str(src), "-vn", "-ar", "16000", "-ac", "1",
            "-c:a", "pcm_s16le", str(dst)], check=False)
    return dst.exists() and r.returncode == 0


def _whisper(ctx, wav, out_base):
    model = Path(ctx.get("listen.model", "")).expanduser()
    if not model.exists():
        die(f"ไม่พบโมเดล whisper: {model}\n"
            f"   แก้ที่ [listen] model ใน config หรือดาวน์โหลดโมเดลก่อน")
    r = sh([ctx.get("listen.binary", "whisper-cli"),
            "-m", str(model), "-f", str(wav),
            "-l", ctx.get("listen.language", "th"),
            "-t", str(int(ctx.get("listen.threads", 6))),
            "-oj", "-of", str(out_base), "-np"], check=False)
    return Path(f"{out_base}.json").exists(), r.stderr


def run(ctx, force=False):
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — รัน `vcut scan` ก่อน")
    clips = man["clips"]

    if not ctx.get("listen.enabled", True):
        info("LISTEN  ปิดอยู่ ([listen] enabled = false) — ทุกคลิปจะถูกจัดเป็น BROLL")
        write_json(ctx.transcript, {"clips": {}})
        return {"clips": {}}

    pats = _patterns(ctx)
    min_chars = int(ctx.get("listen.filter.min_chars", 1))
    prev = (read_json(ctx.transcript, {}) or {}).get("clips", {}) if not force else {}
    import_dir = ctx.get("listen.import_dir", "")
    keep_wav = bool(ctx.get("listen.keep_wav", False))
    raw_dir = ctx.work / "whisper"
    raw_dir.mkdir(parents=True, exist_ok=True)

    result, todo, n_import, n_cache = dict(prev), [], 0, 0
    for cl in clips:
        name = cl["name"]
        if name in result:
            n_cache += 1
            continue
        raw = raw_dir / f"{name}.json"
        if not raw.exists():
            src = _find_import(import_dir, name)
            if src:
                shutil.copyfile(src, raw)
                n_import += 1
        if raw.exists():
            result[name] = parse_whisper_json(raw, pats, min_chars)
        else:
            todo.append(cl)

    info(f"LISTEN  {len(clips)} คลิป  ("
         f"{c(f'cache {n_cache}', 'd')}, นำเข้า {n_import}, ถอดใหม่ {len(todo)})")
    if todo and not shutil.which(ctx.get("listen.binary", "whisper-cli")):
        die(f"ไม่พบ {ctx.get('listen.binary')} — ติดตั้ง whisper.cpp ก่อน "
            f"(brew install whisper-cpp) หรือชี้ [listen] import_dir ไปที่ transcript เดิม")

    if todo:
        pr = Progress(len(todo), "ถอดเสียง")
        for cl in todo:
            name = cl["name"]
            wav = ctx.audio_dir / f"{name}.wav"
            if not wav.exists() and not _extract_wav(Path(cl["src"]), wav):
                warn(f"{name}: แยกเสียงไม่สำเร็จ")
                result[name] = []
                pr.step(name)
                continue
            ok, err = _whisper(ctx, wav, raw_dir / name)
            if not ok:
                warn(f"{name}: whisper ล้มเหลว {err[-160:]}")
                result[name] = []
            else:
                result[name] = parse_whisper_json(raw_dir / f"{name}.json", pats, min_chars)
            if not keep_wav:
                wav.unlink(missing_ok=True)
            pr.step(f"{name}  {len(result[name])} ท่อน")
        pr.done()

    if not keep_wav and ctx.audio_dir.exists() and not any(ctx.audio_dir.iterdir()):
        ctx.audio_dir.rmdir()

    data = {"clips": result}
    write_json(ctx.transcript, data)
    report(clips, result, ctx)
    return data


def report(clips, tr, ctx):
    thr = float(ctx.get("classify.min_speech_total", 1.0))
    talk = [cl for cl in clips
            if sum(b - a for a, b, _ in tr.get(cl["name"], [])) >= thr]
    broll = [cl for cl in clips if cl not in talk]
    speech = sum(b - a for segs in tr.values() for a, b, _ in segs)
    info("─" * 62)
    info(f"  มีคนพูด (TALK)   {len(talk):>4} คลิป   "
         f"{sum(x['duration'] for x in talk) / 60:>6.1f} นาที")
    info(f"  ไม่มีเสียงพูด    {len(broll):>4} คลิป   "
         f"{sum(x['duration'] for x in broll) / 60:>6.1f} นาที")
    info(f"  เวลาที่มีเสียงพูดจริง         {speech / 60:>6.1f} นาที")
    info("─" * 62)
