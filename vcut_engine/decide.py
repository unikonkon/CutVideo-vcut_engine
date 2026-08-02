"""DECIDE — เปลี่ยน manifest + transcript เป็น edl.json ตามกติกาใน config

edl.json คือ "สัญญากลาง" ของทั้งระบบ: แก้ไฟล์นี้ด้วยมือได้ แล้ว render/assemble
จะทำตามทันทีโดยไม่ต้องรัน decide ซ้ำ
"""
from .util import c, die, info, read_json, write_json


# ─────────────────────────── ช่วงพูด ───────────────────────────

def talk_ranges(segs, clip_len, cfg):
    """รวมท่อนพูดเป็นช่วง ๆ: เผื่อหัวท้าย → เชื่อมช่องเงียบสั้น → ยืดให้ถึงช็อตสั้นสุด"""
    if not segs:
        return []
    pre = float(cfg["margin_pre"])
    post = float(cfg["margin_post"])
    gap = float(cfg["gap_merge"])
    minshot = float(cfg["min_shot"])

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


def limit_runs(clips, run_max):
    """วิวติดกันเกิน run_max ชิ้น → เก็บเฉพาะตัวที่ภาพนิ่งที่สุด"""
    out, i, dropped = [], 0, []
    while i < len(clips):
        if clips[i]["kind"] != "BROLL":
            out.append(clips[i])
            i += 1
            continue
        j = i
        while j < len(clips) and clips[j]["kind"] == "BROLL":
            j += 1
        run = clips[i:j]
        if run_max > 0 and len(run) > run_max:
            keep = {x["name"] for x in
                    sorted(run, key=lambda x: x.get("motion", 99))[:run_max]}
            dropped += [x["name"] for x in run if x["name"] not in keep]
            run = [x for x in run if x["name"] in keep]
        out.extend(run)
        i = j
    return out, dropped


# ─────────────────────────── ตัดให้ถึงเป้าความยาว ───────────────────────────

def _talk_score(text, dur):
    """คะแนนช็อตพูด = ความหลากหลายของคำ × ความเหมาะของความยาว
    ช็อตที่วนซ้ำคำเดิม ("นายนายนาย", "ขึ้นกิมมมม") จะได้คะแนนต่ำ"""
    words = [w for w in text.replace("ๆ", " ").split() if w]
    if not words:
        return 0.0
    uniq = len(set(words))
    variety = uniq / len(words)
    fit = min(1.0, dur / 8.0) if dur < 8 else max(0.35, 8.0 / dur)
    return round(uniq * variety * fit, 3)


def select(timeline, cfg):
    """ตัดไทม์ไลน์ให้เหลือตามเป้าความยาว โดยคงลำดับเวลาเดิมไว้"""
    target = float(cfg.get("target_minutes", 0)) * 60.0
    if target <= 0:
        return timeline, {"enabled": True, "skipped": "target_minutes = 0"}

    total = sum(s["dur"] for s in timeline)
    if total <= target:
        return timeline, {"enabled": True, "skipped": f"ยาว {total / 60:.1f} นาที ไม่เกินเป้าอยู่แล้ว"}

    ratio = float(cfg.get("talk_ratio", 0.62))
    min_uw = int(cfg.get("min_unique_words", 2))
    avoid_adj = bool(cfg.get("avoid_adjacent", True))

    talk = [(i, s) for i, s in enumerate(timeline) if s["kind"] == "TALK"]
    broll = [(i, s) for i, s in enumerate(timeline) if s["kind"] == "BROLL"]

    # ── ช่วงพูด: เรียงตามคะแนน เก็บจนเต็มงบ ──
    for _i, s in talk:
        s["score"] = _talk_score(s.get("text", ""), s["dur"])
        s["unique_words"] = len(set(w for w in s.get("text", "").split() if w))
    budget_t = target * ratio
    keep_t, used = set(), 0.0
    ranked = sorted(talk, key=lambda p: (-p[1]["score"], p[1]["dur"]))
    for i, s in ranked:
        if s["unique_words"] < min_uw:
            continue
        if used + s["dur"] > budget_t:
            continue
        keep_t.add(i)
        used += s["dur"]

    # ── ช่วงวิว: เรียงตามความนิ่ง เลี่ยงชิ้นที่อยู่ติดกัน ──
    budget_b = max(0.0, target - used)
    by_still = sorted(broll, key=lambda p: p[1].get("motion", 99))
    keep_b, usedb = set(), 0.0
    for i, s in by_still:
        if usedb + s["dur"] > budget_b:
            continue
        if avoid_adj and any(abs(i - k) == 1 for k in keep_b):
            continue
        keep_b.add(i)
        usedb += s["dur"]

    # เงื่อนไข "ห้ามติดกัน" อาจทำให้เติมไม่เต็มเป้า — ถ้ายังขาดเกิน 10%
    # เติมรอบสองโดยยอมให้ติดกัน (แถวที่ยาวเกินจะถูกคุมด้วย run_max อีกชั้น)
    if usedb < budget_b * 0.9:
        for i, s in by_still:
            if i in keep_b or usedb + s["dur"] > budget_b:
                continue
            keep_b.add(i)
            usedb += s["dur"]

    keep = keep_t | keep_b
    out = [s for i, s in enumerate(timeline) if i in keep]
    stats = {"enabled": True, "target_minutes": target / 60,
             "before": len(timeline), "after": len(out),
             "talk_kept": len(keep_t), "talk_dropped": len(talk) - len(keep_t),
             "broll_kept": len(keep_b), "broll_dropped": len(broll) - len(keep_b),
             "duration": round(used + usedb, 1)}
    return out, stats


# ─────────────────────────── main ───────────────────────────

def run(ctx):
    man = read_json(ctx.manifest)
    if not man:
        die("ยังไม่มี manifest — รัน `vcut scan` ก่อน")
    tr = (read_json(ctx.transcript, {}) or {}).get("clips", {})
    clips = [dict(x) for x in man["clips"]]

    # ── จัดประเภท ──
    thr = float(ctx.get("classify.min_speech_total", 1.0))
    for cl in clips:
        segs = tr.get(cl["name"], [])
        cl["_segs"] = segs
        cl["speech"] = round(sum(b - a for a, b, _ in segs), 2)
        cl["kind"] = "TALK" if (segs and cl["speech"] >= thr) else "BROLL"

    # ── เรียงลำดับ ──
    mode = ctx.get("order.mode", "filename")
    keyf = {"filename": lambda x: (x["num"], x["name"]),
            "mtime": lambda x: x["mtime"],
            "duration": lambda x: x["duration"]}[mode]
    clips.sort(key=keyf, reverse=bool(ctx.get("order.reverse", False)))

    # ── กรอง B-roll ที่ไม่เอา ──
    bcfg = ctx.get("broll", {})
    drop_m = float(bcfg.get("drop_above_motion", 0) or 0)
    drop_b = float(bcfg.get("drop_below_bright", 0) or 0)
    min_dur = float(bcfg.get("min_source_duration", 0) or 0)
    pre_drop = []
    kept = []
    for cl in clips:
        if cl["kind"] == "BROLL":
            if drop_m > 0 and cl["motion"] >= drop_m:
                pre_drop.append((cl["name"], "สั่น"))
                continue
            if drop_b > 0 and cl["bright"] < drop_b:
                pre_drop.append((cl["name"], "มืด"))
                continue
            if min_dur > 0 and cl["duration"] < min_dur:
                pre_drop.append((cl["name"], "สั้น"))
                continue
        kept.append(cl)

    # ── จำกัดแถววิวติดกัน ──
    kept, run_dropped = limit_runs(kept, int(bcfg.get("run_max", 0)))

    # ── สร้างไทม์ไลน์ ──
    tcfg = ctx.get("talk", {})
    bands = bcfg.get("motion_bands", [8.0, 15.0])
    durs = bcfg.get("durations", [4.0, 3.0, 1.5])
    pick = bcfg.get("pick", "center")
    lufs_t = float(ctx.get("audio.target_lufs_talk", -19.0))
    lufs_b = float(ctx.get("audio.target_lufs_broll", -26.0))

    timeline = []
    for cl in kept:
        base = {"name": cl["name"], "src": cl["src"], "orient": cl["orient"],
                "rot_override": cl["rot_override"], "full_range": cl["full_range"],
                "achannels": cl["achannels"]}
        if cl["kind"] == "TALK":
            for a, b in talk_ranges(cl["_segs"], cl["duration"], tcfg):
                timeline.append({**base, "kind": "TALK", "start": a, "end": b,
                                 "dur": round(b - a, 3), "target_lufs": lufs_t,
                                 "text": text_in(cl["_segs"], a, b)[:400]})
        else:
            ln = broll_duration(cl["motion"], bands, durs)
            a, b = broll_window(cl["duration"], ln, pick)
            timeline.append({**base, "kind": "BROLL", "start": a, "end": b,
                             "dur": round(b - a, 3), "target_lufs": lufs_b,
                             "motion": cl["motion"], "bright": cl["bright"]})

    # ── ตัดให้ถึงเป้าความยาว (ถ้าเปิด) ──
    scfg = ctx.get("select", {})
    sel_stats = {"enabled": False}
    if scfg.get("enabled", False):
        timeline, sel_stats = select(timeline, scfg)
        # select ตัดช็อตพูดออก ทำให้ช่วงวิวที่เคยถูกคั่นมาชนกันเป็นแถวยาว
        # ต้องคุมความยาวแถวอีกรอบ ไม่งั้น run_max ที่ตั้งไว้จะไม่มีผลจริง
        timeline, post_run = limit_runs(timeline, int(bcfg.get("run_max", 0)))
        run_dropped += post_run
        sel_stats["post_run_dropped"] = len(post_run)
        sel_stats["duration"] = round(sum(x["dur"] for x in timeline), 1)
        sel_stats["after"] = len(timeline)

    d_t = sum(s["dur"] for s in timeline if s["kind"] == "TALK")
    d_b = sum(s["dur"] for s in timeline if s["kind"] == "BROLL")
    edl = {
        "config": ctx.cfg.get("_meta", {}).get("config_files", []),
        "params": {"talk": tcfg, "broll": bcfg, "order": ctx.get("order", {}),
                   "select": scfg, "audio": ctx.get("audio", {}),
                   "video": ctx.get("video", {}), "encode": ctx.get("encode", {})},
        "summary": {
            "segments": len(timeline),
            "segments_talk": sum(1 for s in timeline if s["kind"] == "TALK"),
            "segments_broll": sum(1 for s in timeline if s["kind"] == "BROLL"),
            "segments_vertical": sum(1 for s in timeline if s["orient"] == "V"),
            "duration_talk": round(d_t, 1),
            "duration_broll": round(d_b, 1),
            "duration_total": round(d_t + d_b, 1),
            "clips_dropped_filter": len(pre_drop),
            "clips_dropped_run": len(run_dropped),
            "select": sel_stats,
        },
        "timeline": timeline,
    }
    write_json(ctx.edl, edl)
    report(edl, pre_drop, run_dropped)
    return edl


def report(edl, pre_drop, run_dropped):
    s = edl["summary"]
    tl = edl["timeline"]
    info("─" * 62)
    info(f"  ชิ้นทั้งหมด        {s['segments']:>4}   "
         f"({s['segments_talk']} พูด + {s['segments_broll']} วิว)")
    info(f"  คลิปแนวตั้ง         {s['segments_vertical']:>4} ชิ้น")
    info(f"  ช่วงพูด           {s['duration_talk'] / 60:>6.1f} นาที")
    info(f"  ช่วงวิว            {s['duration_broll'] / 60:>6.1f} นาที")
    total_min = f"{s['duration_total'] / 60:>6.1f} นาที"
    info(f"  {c('รวม', 'g')}               {c(total_min, 'g')}")
    info("─" * 62)
    if pre_drop:
        why = {}
        for _n, r in pre_drop:
            why[r] = why.get(r, 0) + 1
        info(f"  ตัดออกก่อนเรียง      {len(pre_drop):>3} คลิป  "
             f"({', '.join(f'{k} {v}' for k, v in why.items())})")
    if run_dropped:
        info(f"  ตัดเพราะวิวติดกันเกิน  {len(run_dropped):>3} คลิป")

    seq = "".join("T" if x["kind"] == "TALK" else "B" for x in tl)
    longest = max((len(r) for r in seq.split("T")), default=0)
    info(f"  แถววิวติดกันยาวสุด    {longest:>3} ชิ้น")

    sel = s.get("select", {})
    if sel.get("enabled") and "after" in sel:
        info(f"  {c('SELECT', 'b')}  {sel['before']} → {sel['after']} ชิ้น "
             f"(พูด −{sel['talk_dropped']}, วิว −{sel['broll_dropped']})")
    elif sel.get("skipped"):
        info(f"  {c('SELECT', 'b')}  ข้าม — {sel['skipped']}")
    info("─" * 62)
    for i in range(0, min(len(seq), 300), 60):
        info(f"  {c(seq[i:i + 60], 'd')}")
    if len(seq) > 300:
        info(f"  {c('… (' + str(len(seq)) + ' ชิ้น)', 'd')}")
    info(f"  {c('T = ช่วงพูด   B = ช่วงวิว', 'd')}")
