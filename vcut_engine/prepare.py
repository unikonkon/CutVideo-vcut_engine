"""PREPARE — เตรียมวิดีโอทีละคลิป → .vcut/pool.json

นี่คือครึ่งแรกของสิ่งที่ decide.py เคยทำรวดเดียว ผ่าออกมาเพราะการตัดต่อจริง
เป็นสองงานคนละเรื่อง:

    เตรียม (ไฟล์นี้)   ดูทีละคลิป — คลิปนี้มีคนพูดไหม ควรตัดเอาช่วงไหน ใช้ได้หรือเปล่า
    รวม (compose.py)   ดูทั้งกอง — จะหยิบชิ้นไหนมาเรียงเป็นหนัง

พอมีไฟล์คั่นกลาง ขั้น "รวม" ถึงจะมีคลังให้เลือกจริง ๆ และเห็นได้ว่าชิ้นไหน
อยู่ในคลังแต่ไม่ได้ถูกใช้ — เดิมชิ้นที่ไม่ถูกเลือกหายไปเลย ไม่เหลือร่องรอย

pool.json เก็บ **ทุกชิ้น** รวมทั้งชิ้นที่ตัวกรองคัดออก (ติดธง ok=false พร้อม
เหตุผล) เพื่อให้หน้าเว็บหยิบกลับมาใส่เองได้ถ้าไม่เห็นด้วยกับตัวกรอง
"""
from . import ai as ai_mod
from .util import c, die, info, read_json, warn, write_json


# ─────────────────────────── ช่วงพูด ───────────────────────────

def talk_ranges(segs, clip_len, cfg):
    """รวมท่อนพูดเป็นช่วง ๆ: เผื่อหัวท้าย → เชื่อมช่องเงียบสั้น → ยืดให้ถึงช็อตสั้นสุด"""
    if not segs:
        return []
    pre = float(cfg.get("margin_pre", 0.4))
    post = float(cfg.get("margin_post", 0.7))
    gap = float(cfg.get("gap_merge", 1.5))
    minshot = float(cfg.get("min_shot", 3.0))

    r = []
    for a, b, _t in segs:
        s = max(0.0, a - pre)
        e = min(clip_len, b + post)
        if r and s - r[-1][1] < gap:
            r[-1][1] = max(r[-1][1], e)
        else:
            r.append([s, e])

    out = []
    for s, e in r:
        if e - s < minshot:
            e2 = min(clip_len, s + minshot)
            s = max(0.0, e2 - minshot)
            e = e2
        out.append([s, e])

    merged = []
    for s, e in out:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [[round(s, 3), round(e, 3)] for s, e in merged if e - s > 0.05]


def text_in(segs, a, b):
    return " ".join(t for s, e, t in segs if e > a and s < b).strip()


def intersect(ranges, keeps, floor=1.0):
    """ตัดช่วงที่กฎคำนวณไว้ ให้เหลือเฉพาะส่วนที่ทับกับช่วงที่ AI แนะนำ

    floor กันเศษสั้น ๆ ที่เกิดจากขอบสองชุดเฉียดกัน — ชิ้นหนึ่งวินาทีดูเป็น
    ความผิดพลาดในการตัดต่อ ไม่ใช่การตัดสินใจ
    """
    out = []
    for a, b in ranges:
        for ka, kb in keeps:
            s, e = max(a, ka), min(b, kb)
            if e - s >= floor:
                out.append([round(s, 3), round(e, 3)])
    return out


# ─────────────────────────── ช่วงวิว ───────────────────────────

def broll_duration(motion, bands, durs):
    for i, edge in enumerate(bands):
        if motion < edge:
            return float(durs[i])
    return float(durs[-1])


def broll_window(clip_dur, length, mode):
    length = min(length, clip_dur)
    if mode == "head":
        st = 0.0
    elif mode == "tail":
        st = max(0.0, clip_dur - length)
    else:
        st = max(0.0, (clip_dur - length) / 2.0)
    return round(st, 3), round(st + length, 3)


def ai_broll_window(clip_dur, length, mode, keeps):
    """AI เลือก "ตรงไหนของคลิป" · กฎยังเป็นคนกำหนด "ยาวเท่าไร"

    แยกหน้าที่แบบนี้เพื่อให้จังหวะหนัง (pacing) ยังคุมได้จาก config เหมือนเดิม
    ถ้าช่วงที่ AI ชี้สั้นกว่าที่กฎกำหนด แปลว่าดีอยู่แค่นั้นจริง ๆ ก็ใช้ตามนั้น
    """
    if not keeps:
        return broll_window(clip_dur, length, mode)
    a, b = max(keeps, key=lambda r: r[1] - r[0])
    a, b = max(0.0, a), min(clip_dur, b)
    if b - a <= length:
        return round(a, 3), round(b, 3)
    st = a + (b - a - length) / 2.0
    return round(st, 3), round(st + length, 3)


# ─────────────────────────── main ───────────────────────────

def run(ctx, write=True):
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — ทำขั้นที่ 1 (อ่านคลิป) ก่อน")
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})

    adv = ai_mod.load(ctx) if ctx.get("ai.enabled", False) else None
    ai_clips = (adv or {}).get("clips", {})
    apply = ctx.get("ai.apply", {})
    ai_trim = bool(adv and apply.get("trim", False))
    ai_drop = bool(adv and apply.get("drop", False))

    tcfg = ctx.get("talk", {})
    bcfg = ctx.get("broll", {})
    bands = bcfg.get("motion_bands", [8.0, 15.0])
    durs = bcfg.get("durations", [4.0, 3.0, 1.5])
    pick = bcfg.get("pick", "center")
    lufs_t = float(ctx.get("audio.target_lufs_talk", -19.0))
    lufs_b = float(ctx.get("audio.target_lufs_broll", -26.0))

    thr = float(ctx.get("classify.min_speech_total", 1.0))
    drop_m = float(bcfg.get("drop_above_motion", 0) or 0)
    drop_b = float(bcfg.get("drop_below_bright", 0) or 0)
    min_dur = float(bcfg.get("min_source_duration", 0) or 0)
    drop_silent = bool(ctx.get("prepare.drop_silent", False))

    # คลิปที่ผู้ใช้เอาออกตั้งแต่ขั้น 1 — ไม่เข้าคลังเลย ไม่ใช่เข้ามาแล้วติดป้าย
    # เพราะมันคือ "ไม่เอา" ไม่ใช่ "ตัวกรองคัดออก" ที่ยังหยิบกลับได้ในขั้น 3
    excl = set(ctx.get("scan.exclude", []) or [])

    ch_title = {ch["id"]: ch["title"] for ch in (adv or {}).get("chapters", [])}
    pieces, trim_empty = [], []

    for cl in sorted(man["clips"], key=lambda x: (x.get("num", 0), x["name"])):
        if cl["name"] in excl:
            continue
        segs = tr.get(cl["name"], [])
        speech = round(sum(b - a for a, b, _ in segs), 2)
        kind = "TALK" if (segs and speech >= thr) else "BROLL"
        hint = ai_clips.get(cl["name"], {})

        # ── ใช้คลิปนี้ได้ไหม — เก็บเหตุผลไว้ ไม่ทิ้งชิ้นหาย ──
        why = None
        if ai_drop and hint.get("drop"):
            why = "AI บอกว่าใช้ไม่ได้"
        elif kind == "BROLL":
            if drop_silent:
                why = "ไม่มีเสียงพูด"
            elif drop_m > 0 and cl["motion"] >= drop_m:
                why = f"ภาพสั่น (motion {cl['motion']} ≥ {drop_m:g})"
            elif drop_b > 0 and cl["bright"] < drop_b:
                why = f"ภาพมืด (สว่าง {cl['bright']} < {drop_b:g})"
            elif min_dur > 0 and cl["duration"] < min_dur:
                why = f"คลิปสั้นกว่า {min_dur:g} วิ"

        base = {
            "name": cl["name"], "num": cl.get("num", 0), "src": cl["src"],
            "orient": cl["orient"], "rot_override": cl["rot_override"],
            "full_range": cl["full_range"], "achannels": cl["achannels"],
            "mtime": cl.get("created") or cl.get("mtime", 0),
            "clip_duration": cl["duration"],
            "kind": kind, "ok": why is None,
        }
        if why:
            base["why"] = why
        if adv:
            if hint.get("chapter"):
                base["chapter"] = hint["chapter"]
                base["chapter_title"] = ch_title.get(hint["chapter"], hint["chapter"])
            if "score" in hint:
                base["ai_score"] = hint["score"]
            if hint.get("meaning"):
                base["meaning"] = hint["meaning"]
            if hint.get("tags"):
                base["tags"] = hint["tags"]

        keeps = hint.get("keep") if ai_trim else None
        if kind == "TALK":
            ranges = talk_ranges(segs, cl["duration"], tcfg)
            if keeps:
                cut = intersect(ranges, keeps)
                # ถ้าตัดแล้วไม่เหลืออะไรเลย แปลว่า AI กับ VAD มองคนละจุด
                # เชื่อ VAD ไว้ก่อน ดีกว่าทำให้คลิปหายทั้งอันโดยไม่ตั้งใจ
                if cut:
                    ranges = cut
                else:
                    trim_empty.append(cl["name"])
            for i, (a, b) in enumerate(ranges):
                pieces.append({**base, "id": f"{cl['name']}#{i}",
                               "start": a, "end": b, "dur": round(b - a, 3),
                               "target_lufs": lufs_t,
                               "text": text_in(segs, a, b)[:400]})
        else:
            ln = broll_duration(cl["motion"], bands, durs)
            a, b = ai_broll_window(cl["duration"], ln, pick, keeps)
            pieces.append({**base, "id": f"{cl['name']}#0",
                           "start": a, "end": b, "dur": round(b - a, 3),
                           "target_lufs": lufs_b,
                           "motion": cl["motion"], "bright": cl["bright"]})

    if trim_empty and write:
        warn(f"ช่วงที่ AI แนะนำไม่ทับกับช่วงที่พูดจริงใน {len(trim_empty)} คลิป "
             f"— ใช้ช่วงจาก VAD ตามเดิม")

    ok = [p for p in pieces if p["ok"]]
    from .settings import params_of
    pool = {
        "version": 1,
        "params": params_of(ctx.cfg, "prepare"),
        "ai": {"used": bool(adv), "goal": (adv or {}).get("goal", "")},
        "summary": {
            "clips": len(man["clips"]),
            "deselected": sum(1 for cl in man["clips"] if cl["name"] in excl),
            "pieces": len(pieces),
            "usable": len(ok),
            "excluded": len(pieces) - len(ok),
            "talk": sum(1 for p in ok if p["kind"] == "TALK"),
            "broll": sum(1 for p in ok if p["kind"] == "BROLL"),
            "duration_talk": round(sum(p["dur"] for p in ok if p["kind"] == "TALK"), 1),
            "duration_broll": round(sum(p["dur"] for p in ok if p["kind"] == "BROLL"), 1),
            "duration_total": round(sum(p["dur"] for p in ok), 1),
        },
        "pieces": pieces,
    }
    if write:
        write_json(ctx.work / "pool.json", pool)
        report(pool)
    return pool


def report(pool):
    s = pool["summary"]
    info("─" * 62)
    info(f"  คลิปทั้งหมด        {s['clips']:>4}"
         + (c(f"   (ไม่ได้เลือกไว้ในขั้น 1 · {s['deselected']} คลิป)", "d")
            if s.get("deselected") else ""))
    info(f"  ชิ้นที่เตรียมได้     {s['usable']:>4}   "
         f"({s['talk']} พูด + {s['broll']} วิว)")
    info(f"  ช่วงพูด           {s['duration_talk'] / 60:>6.1f} นาที")
    info(f"  ช่วงวิว            {s['duration_broll'] / 60:>6.1f} นาที")
    total = c(f"{s['duration_total'] / 60:>6.1f} นาที", "g")
    info(f"  {c('รวมในคลัง', 'g')}         {total}")
    if s["excluded"]:
        why = {}
        for p in pool["pieces"]:
            if not p["ok"]:
                k = p["why"].split(" (")[0]
                why[k] = why.get(k, 0) + 1
        info("─" * 62)
        info(f"  ตัวกรองคัดออก       {s['excluded']:>4} ชิ้น  "
             f"({', '.join(f'{k} {v}' for k, v in why.items())})")
        info(f"  {c('ยังอยู่ในคลัง หยิบกลับมาใส่เองได้ที่ขั้นรวมคลิป', 'd')}")
    info("─" * 62)
