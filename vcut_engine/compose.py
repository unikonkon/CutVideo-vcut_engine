"""COMPOSE — หยิบชิ้นจากคลังมาเรียงเป็นหนัง → .vcut/edl.json

ครึ่งหลังของสิ่งที่ decide.py เคยทำรวดเดียว รับ pool.json (คลังชิ้นที่ prepare.py
ตัดไว้แล้ว) แล้วตอบคำถามเดียว: **จะเอาชิ้นไหนมาเรียงยังไง**

7 วิธีเลือก — เปลี่ยนได้ที่ [compose] mode

    all        เอาทุกชิ้นในคลัง เรียงตามลำดับที่จัดไว้ในขั้น 1
    pattern    สลับตามรูปแบบที่กำหนด เช่น พูด → วิว → วิว วนไป
    budget     กำหนดเวลารวมของแต่ละแบบ เช่น พูด 6 นาที + วิว 4 นาที
    numbers    เอาเฉพาะเลขคลิปที่ระบุ เช่น 7068-7200, 7305
    timerange  เอาเฉพาะคลิปที่ถ่ายในช่วงเวลาที่ระบุ
    manual     เลือกทีละชิ้นเอง (หน้าเว็บเขียนรายการ id มาให้)
    ai         ให้ AI เลือกจากความหมายของคลิป + โจทย์ที่สั่ง

ทุกโหมดหยิบได้เฉพาะชิ้นที่ ok — ยกเว้น manual ที่หยิบชิ้นซึ่งตัวกรองคัดออก
กลับมาได้ เพราะคนเลือกเองย่อมรู้ดีกว่าตัวกรอง

**สองแกนที่แยกกัน** — [compose] mode ตอบว่า *เอาชิ้นไหน* · [order] mode ตอบว่า
*เรียงยังไง* ใช้ข้ามกันได้ทุกคู่:

    stage1     ลำดับที่คนลากจัดไว้ในขั้น 1 ([scan] order → _seq)  ← ค่าตั้งต้น
    pick       ไม่เรียงซ้ำ — ตามที่วิธีเลือกชิ้นจัดมาให้ (หรือบทที่ AI แบ่ง)
    date       วันที่ถ่ายจริงจาก metadata
    number     เลขบนชื่อไฟล์ (IMG_7068 → 7068)
    duration   ความยาวชิ้น
    manual     ลำดับที่คนลากไว้ในไทม์ไลน์รอบก่อน (อ่านจาก edl.json)

ยกเว้นสองจุดที่ต้องรู้: **pattern** ใช้ลำดับนี้ *ข้างในคิวพูดกับคิววิว* แล้วสลับ
ประเภทตามรูปแบบ (เรียงทับผลลัพธ์รวม = การสลับหายทั้งดุ้น) ส่วน **manual/ai** ให้
ลำดับมาเป็นรายการตรง ๆ ตั้ง pick ถึงจะเก็บลำดับนั้นไว้ ไม่งั้นถูกเรียงทับ

บทที่ AI แบ่ง ([ai.apply] order) นับเป็นอีกวิธีเรียงที่ซ่อนอยู่ใต้ pick — มันจัด
ลำดับให้ก็ต่อเมื่อคนเลือก pick เท่านั้น ไม่ทับตัวเลือกอื่น และทั้งก้อนนี้อ่าน
ai.json ก็ต่อเมื่อ [ai] enabled เปิดอยู่ (หน้าเว็บปิดให้เองเมื่อเลือกโหมดกฎล้วน)
"""
import re
import time

from . import ai as ai_mod
from . import clips as clips_mod
from . import config
from .util import c, die, info, read_json, warn, write_json


MODES = ("all", "pattern", "budget", "numbers", "timerange", "manual", "ai")


# ─────────────────────────── ตัวช่วยให้คะแนน ───────────────────────────

def talk_score(text, dur):
    """คะแนนช็อตพูด = ความหลากหลายของคำ × ความเหมาะของความยาว
    ช็อตที่วนซ้ำคำเดิม ("นายนายนาย", "ขึ้นกิมมมม") จะได้คะแนนต่ำ"""
    words = [w for w in (text or "").replace("ๆ", " ").split() if w]
    if not words:
        return 0.0
    uniq = len(set(words))
    fit = min(1.0, dur / 8.0) if dur < 8 else max(0.35, 8.0 / dur)
    return round(uniq * (uniq / len(words)) * fit, 3)


def _norm(vals):
    hi = max(vals) if vals else 0.0
    return (lambda x: (x / hi) if hi > 0 else 0.0)


def rank_of(pieces, ai_weight=0.0):
    """คะแนนรวม 0–1 ต่อชิ้น — ผสมคะแนนกฎกับคะแนน AI ตามน้ำหนักที่ตั้งไว้

    ช่วงพูดวัดจากเนื้อคำ ช่วงวิววัดจากความนิ่งของภาพ แล้วย่อลงมาตราเดียวกัน
    จะได้เทียบข้ามประเภทได้เวลาต้องเลือกว่าจะทิ้งอะไรก่อน
    """
    w = max(0.0, min(1.0, float(ai_weight)))
    talk = [p for p in pieces if p["kind"] == "TALK"]
    broll = [p for p in pieces if p["kind"] == "BROLL"]

    nt = _norm([talk_score(p.get("text"), p["dur"]) for p in talk])
    for p in talk:
        base = nt(talk_score(p.get("text"), p["dur"]))
        p["_rank"] = round((1 - w) * base + w * float(p.get("ai_score", base)), 4)

    nb = _norm([p.get("motion", 99) for p in broll])
    for p in broll:
        base = 1.0 - nb(p.get("motion", 99))          # นิ่งมาก = เข้าใกล้ 1
        p["_rank"] = round((1 - w) * base + w * float(p.get("ai_score", base)), 4)
    return pieces


def limit_runs(pieces, run_max):
    """วิวติดกันเกิน run_max ชิ้น → เก็บเฉพาะตัวที่คะแนนดีที่สุด"""
    out, i, dropped = [], 0, []
    while i < len(pieces):
        if pieces[i]["kind"] != "BROLL":
            out.append(pieces[i])
            i += 1
            continue
        j = i
        while j < len(pieces) and pieces[j]["kind"] == "BROLL":
            j += 1
        run = pieces[i:j]
        if run_max > 0 and len(run) > run_max:
            keep = {x["id"] for x in
                    sorted(run, key=lambda x: -x.get("_rank", 0))[:run_max]}
            dropped += [x["id"] for x in run if x["id"] not in keep]
            run = [x for x in run if x["id"] in keep]
        out.extend(run)
        i = j
    return out, dropped


# ─────────────────────────── ตัวแปลงข้อความเป็นตัวกรอง ───────────────────────────

def parse_numbers(spec):
    """"7068-7200, 7305, 7400-7450" → เซตของเลขคลิป"""
    out = set()
    for part in re.split(r"[,\s]+", str(spec or "")):
        if not part:
            continue
        m = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            out.update(range(min(a, b), max(a, b) + 1))
        elif part.isdigit():
            out.add(int(part))
    return out


def parse_when(s):
    """รับ "2026-05-01" หรือ "2026-05-01 08:30" → epoch (None ถ้าเว้นว่าง)"""
    s = str(s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return time.mktime(time.strptime(s, fmt))
        except ValueError:
            continue
    die(f"[compose] อ่านเวลา '{s}' ไม่ออก — ใช้รูปแบบ 2026-05-01 หรือ 2026-05-01 08:30")


# ─────────────────────────── 7 วิธีเลือก ───────────────────────────

def apply_order(pieces, ctx):
    """ติดเลขลำดับ _seq ให้ทุกชิ้นตามที่คนลากจัดไว้ในขั้น 1

    ไม่ไปทับ num — num คือเลขบนชื่อไฟล์ ซึ่ง "ตามเลขคลิป" กับ "ห้ามเอาวิวจาก
    คลิปที่อยู่ติดกัน" ยังต้องใช้ตามความหมายเดิม _seq เป็นคนละเรื่อง: ตำแหน่ง
    ในลำดับเล่าเรื่อง ไม่มี order ที่จัดเองก็เท่ากับเรียงตามเลขไฟล์พอดี ผลจึง
    เหมือนเดิมเป๊ะ
    """
    natural = [n for _, n in sorted({(p["num"], p["name"]) for p in pieces})]
    seq = clips_mod.seq_index(ctx, natural)
    for p in pieces:
        p["_seq"] = seq.get(p["name"], p["num"])


def _by_seq(p):
    """ชิ้นจากคลิปเดียวกันได้ _seq เท่ากัน — แยกกันเองด้วยเวลาในคลิปต้นทาง
    (ไม่ใช้ id เป็นตัวหลักเพราะ "#10" เรียงก่อน "#2" ตามตัวอักษร)"""
    return (p.get("_seq", p["num"]), p["start"], p["id"])


def mode_all(pool_ok, cfg, ctx):
    return sorted(pool_ok, key=_by_seq), False, {}


def mode_numbers(pool_ok, cfg, ctx):
    want = parse_numbers(cfg.get("numbers", ""))
    if not want:
        die("[compose] mode = numbers แต่ยังไม่ได้ใส่เลขคลิป เช่น numbers = \"7068-7200\"")
    got = [p for p in pool_ok if p["num"] in want]
    return sorted(got, key=_by_seq), False, {"เลขที่ระบุ": len(want), "เจอจริง": len(got)}


def mode_timerange(pool_ok, cfg, ctx):
    a, b = parse_when(cfg.get("from", "")), parse_when(cfg.get("to", ""))
    if a is None and b is None:
        die("[compose] mode = timerange แต่ยังไม่ได้ใส่ from / to")
    got = [p for p in pool_ok
           if (a is None or p.get("mtime", 0) >= a)
           and (b is None or p.get("mtime", 0) <= b)]
    return sorted(got, key=_by_seq), False, {"อยู่ในช่วง": len(got)}


def mode_manual(pool_all, cfg, ctx):
    """เลือกทีละชิ้น — หยิบชิ้นที่ตัวกรองคัดออกกลับมาได้ด้วย"""
    ids = list(cfg.get("manual", []) or [])
    if not ids:
        die("[compose] mode = manual แต่ยังไม่ได้เลือกชิ้นไหนเลย")
    by_id = {p["id"]: p for p in pool_all}
    got, missing = [], []
    for i in ids:
        if i in by_id:
            got.append(by_id[i])
        else:
            missing.append(i)
    if missing:
        warn(f"เลือกชิ้นที่ไม่มีในคลัง {len(missing)} ชิ้น (เช่น {missing[0]}) — ข้ามไป")
    rescued = sum(1 for p in got if not p["ok"])
    return got, True, {"เลือกเอง": len(got), "หยิบที่ถูกกรองกลับมา": rescued}


def mode_pattern(pool_ok, cfg, ctx):
    """สลับตามรูปแบบ เช่น พูด → วิว → วิว วนไปจนของหมดหรือถึงเป้าความยาว"""
    pat = [str(x).upper() for x in (cfg.get("pattern", []) or ["TALK", "BROLL"])]
    pat = [x for x in pat if x in ("TALK", "BROLL")]
    if not pat:
        die("[compose] pattern ต้องมีอย่างน้อยหนึ่งค่าเป็น TALK หรือ BROLL")
    target = float(cfg.get("target_minutes", 0) or 0) * 60.0

    # [order] mode มีผลกับโหมดนี้ "ข้างในคิว" ไม่ใช่กับผลลัพธ์รวม — เรียงทับทีหลัง
    # เมื่อไร การสลับพูด/วิวที่เป็นหัวใจของโหมดนี้ก็หายไปทั้งดุ้น
    keyf = sort_key(ctx) or _by_seq
    queues = {}
    for k in ("TALK", "BROLL"):
        qs = [p for p in pool_ok if p["kind"] == k]
        # เรียงตามลำดับที่เลือกไว้ แต่ถ้ามีเป้าความยาว ให้เอาชิ้นดีก่อน
        queues[k] = sorted(qs, key=(lambda p: -p.get("_rank", 0)) if target else keyf)

    out, used, i, stall = [], 0.0, 0, 0
    while stall < len(pat):
        k = pat[i % len(pat)]
        i += 1
        if not queues[k]:
            stall += 1
            continue
        stall = 0
        p = queues[k].pop(0)
        if target and used + p["dur"] > target:
            break
        out.append(p)
        used += p["dur"]
    if target:
        out.sort(key=keyf)             # คุมสัดส่วนแล้ว แต่ยังเล่าตามลำดับที่เลือกไว้
        out, _ = _reflow(out, pat)
    return out, True, {"รูปแบบ": " → ".join(pat), "ได้": len(out)}


def _reflow(pieces, pat):
    """จัดให้ใกล้เคียงรูปแบบที่สุดโดยยังคงลำดับเวลาเดิมของแต่ละประเภท"""
    q = {"TALK": [p for p in pieces if p["kind"] == "TALK"],
         "BROLL": [p for p in pieces if p["kind"] == "BROLL"]}
    out, i, stall = [], 0, 0
    while stall < len(pat):
        k = pat[i % len(pat)]
        i += 1
        if not q[k]:
            stall += 1
            continue
        stall = 0
        out.append(q[k].pop(0))
    out += q["TALK"] + q["BROLL"]
    return out, None


def mode_budget(pool_ok, cfg, ctx):
    """กำหนดเวลารวมของแต่ละแบบ — เอาชิ้นคะแนนดีก่อนจนเต็มงบ แล้วเรียงตามเวลาจริง"""
    bt = float(cfg.get("talk_minutes", 0) or 0) * 60.0
    bb = float(cfg.get("broll_minutes", 0) or 0) * 60.0
    if bt <= 0 and bb <= 0:
        die("[compose] mode = budget ต้องใส่ talk_minutes หรือ broll_minutes อย่างน้อยหนึ่งค่า")
    avoid_adj = bool(cfg.get("avoid_adjacent", True))

    out, stats = [], {}
    for kind, budget, key in (("TALK", bt, "พูด"), ("BROLL", bb, "วิว")):
        qs = sorted([p for p in pool_ok if p["kind"] == kind],
                    key=lambda p: -p.get("_rank", 0))
        used, keep = 0.0, []
        for p in qs:
            if budget <= 0 or used + p["dur"] > budget:
                continue
            if avoid_adj and kind == "BROLL" and any(abs(p["num"] - x["num"]) <= 1
                                                     for x in keep):
                continue
            keep.append(p)
            used += p["dur"]
        # เงื่อนไข "ห้ามติดกัน" อาจทำให้เติมไม่เต็ม — เติมรอบสองโดยยอมให้ติดกัน
        if budget > 0 and used < budget * 0.9:
            for p in qs:
                if p in keep or used + p["dur"] > budget:
                    continue
                keep.append(p)
                used += p["dur"]
        out += keep
        stats[key] = f"{len(keep)} ชิ้น {used / 60:.1f} นาที"
    return sorted(out, key=_by_seq), False, stats


def mode_ai(pool_ok, cfg, ctx):
    """ใช้รายการที่ AI เลือกไว้ใน .vcut/compose.json — engine ไม่ได้ถาม AI เอง"""
    d = read_json(ctx.work / "compose.json")
    if not d or not d.get("order"):
        die("mode = ai แต่ยังไม่มี .vcut/compose.json\n"
            "   สั่ง `vcut compose --ask --context \"...\"` เพื่อให้ AI เลือกให้ก่อน")
    by_id = {p["id"]: p for p in pool_ok}
    got = [by_id[i] for i in d["order"] if i in by_id]
    miss = len(d["order"]) - len(got)
    if miss:
        warn(f"AI อ้างชิ้นที่ไม่มีในคลัง {miss} ชิ้น — ข้ามไป")
    return got, True, {"AI เลือก": len(got), "โจทย์": d.get("context", "")[:40] or "—"}


PICKERS = {"all": mode_all, "pattern": mode_pattern, "budget": mode_budget,
           "numbers": mode_numbers, "timerange": mode_timerange,
           "manual": mode_manual, "ai": mode_ai}


# ─────────────────────────── ลำดับ ───────────────────────────

def order_mode(ctx):
    """[order] mode ที่แปลชื่อเก่าให้แล้ว — filename → stage1 · mtime → date"""
    m = str(ctx.get("order.mode", config.ORDER_MODES[0]) or config.ORDER_MODES[0])
    return config.ORDER_ALIAS.get(m, m)


def _timeline_rank(ctx):
    """ลำดับที่คนลากไว้ในไทม์ไลน์รอบก่อน — อ่านจาก edl.json ที่มีอยู่

    ไทม์ไลน์เขียนทับ edl.json ตรง ๆ (ดู serve.apply_edit) พอกด "จัดใหม่" ทีเดียว
    งานที่ลากไว้ก็หายหมด โหมดนี้ทำให้เก็บไว้ได้ — ชิ้นที่เพิ่งโผล่มาใหม่ต่อท้าย
    ชิ้นที่หายไปแล้วก็แค่ข้าม
    """
    edl = read_json(ctx.edl, {}) or {}
    return {s["id"]: i for i, s in enumerate(edl.get("timeline", [])) if s.get("id")}


def sort_key(ctx):
    """ฟังก์ชันคีย์สำหรับเรียงชิ้น — None = ไม่ต้องเรียงซ้ำ (โหมด pick)

    ทุกแบบมี _by_seq ต่อท้ายเป็นตัวตัดสินเสมอ ชิ้นที่ค่าเท่ากัน (ถ่ายวันเดียวกัน ·
    ยาวเท่ากัน) จึงยังเรียงตามลำดับเล่าเรื่อง ไม่ใช่ตามลำดับที่บังเอิญอยู่ใน list
    """
    m = order_mode(ctx)
    if m == "pick":
        return None
    if m == "manual":
        rank = _timeline_rank(ctx)
        tail = len(rank)
        return lambda p: (rank.get(p["id"], tail), _by_seq(p))
    return {
        "stage1": _by_seq,
        "date": lambda p: (p.get("mtime", 0), _by_seq(p)),
        "number": lambda p: (p["num"], _by_seq(p)),
        "duration": lambda p: (p["dur"], _by_seq(p)),
    }[m]


def _chapter_rank(adv):
    """ลำดับคลิปตามบทที่ AI แบ่ง — บทที่ 1 ก่อน แล้วไล่ไปตามลำดับใน chapters"""
    rank = {}
    for ch in adv.get("chapters", []):
        for n in ch.get("clips", []):
            rank.setdefault(n, len(rank))
    return rank


def order_pieces(pieces, ctx, adv):
    """เรียงชิ้นตาม [order] mode — สิ่งที่คนเลือกไว้ชนะเสมอ

    บทที่ AI แบ่งเป็น *วิธีเรียงอีกแบบหนึ่ง* ไม่ใช่ค่าที่มาทับตัวเลือกของคน เดิม
    [ai.apply] order = true (ค่าตั้งต้น) ชิงเรียงตามบทก่อนทุกครั้งที่เปิด AI ไว้
    ซึ่งเขียนไว้ตั้งแต่ขั้น 3 ยังไม่มีตัวเลือกลำดับ พอมีแล้วคนเลือก "ลำดับจากขั้น 1"
    ไว้ก็ไม่มีผลและไม่มีคำเตือนสักคำ — ตอนนี้บทของ AI จัดให้เฉพาะตอนเลือก
    "ตามที่วิธีเลือกจัดให้" (pick) เท่านั้น นอกนั้นเตือนแล้วเรียงตามที่เลือก
    """
    m = order_mode(ctx)
    use_ai = bool(adv and ctx.get("ai.apply", {}).get("order", False)
                  and adv.get("chapters"))
    if use_ai:
        if m == "pick":
            rank = _chapter_rank(adv)
            tail = len(rank)
            return sorted(pieces, key=lambda p: (rank.get(p["name"], tail + p["_seq"]),
                                                 _by_seq(p)))
        warn(f"[ai.apply] order = true แต่ [order] mode = {m} — ใช้ลำดับที่เลือกไว้ "
             f"บทที่ AI แบ่ง ({len(adv['chapters'])} บท) ไม่ได้ถูกใช้จัดลำดับ\n"
             "   อยากให้ AI จัดลำดับให้ ตั้ง [order] mode = pick (ตามที่วิธีเลือกจัดให้)")
    keyf = sort_key(ctx)
    if keyf is None:
        return pieces
    return sorted(pieces, key=keyf, reverse=bool(ctx.get("order.reverse", False)))


# ─────────────────────────── main ───────────────────────────

SEG_KEYS = ("name", "src", "orient", "rot_override", "full_range", "achannels",
            "kind", "start", "end", "dur", "target_lufs", "loud_ref", "text", "motion",
            "bright", "chapter", "chapter_title", "ai_score", "id", "jump")


def keep_jump_together(pieces):
    """ชิ้นที่ถูกตัดชนมาจากประโยคเดียวกันต้องอยู่ติดกันตามลำดับเวลาเดิม

    โหมด pattern/budget เลือกทีละชิ้นโดยไม่รู้ว่าชิ้นไหนเป็นครึ่งประโยค ถ้าไม่
    รวบกลับมา มันจะเอาช่วงวิวไปแทรกกลางประโยค — นั่นไม่ใช่ cut ชน แต่คือ
    ประโยคขาด ส่วนชิ้นที่ถูกทิ้งไปแล้วไม่ดึงกลับ เพราะการตัดคำออกเป็นเจตนา
    """
    out, done = [], set()
    for p in pieces:
        g = p.get("jump")
        if not g:
            out.append(p)
        elif g not in done:
            done.add(g)
            out += sorted((x for x in pieces if x.get("jump") == g),
                          key=lambda x: x["start"])
    return out


def run(ctx, write=True):
    pool = read_json(ctx.work / "pool.json")
    if not pool:
        die("ยังไม่มี pool.json — ทำขั้นที่ 2 (เตรียมวิดีโอ) ก่อน")
    return run_with_pool(ctx, pool, write=write)


def run_with_pool(ctx, pool, write=True):
    """รับคลังมาตรง ๆ — ตอนประเมินผลยังไม่ได้เขียน pool.json ลงดิสก์"""
    cfg = ctx.get("compose", {})
    mode = str(cfg.get("mode", "all"))
    if mode not in MODES:
        die(f"[compose] mode รองรับ {' | '.join(MODES)} (ได้รับ '{mode}')")

    # [ai] enabled คือสวิตช์เดียวที่ตัดสินว่าขั้นนี้อ่าน ai.json ไหม — หน้าเว็บปิดให้
    # อัตโนมัติเมื่อคนเลือกโหมดในกลุ่ม "ไม่ใช้ AI" จะได้กฎล้วนจริงตามชื่อกลุ่ม
    # (จงใจไม่ผูกกับ mode ตรงนี้ เพราะ `vcut decide` ตั้ง mode = all/budget แต่ยัง
    # ตั้งใจใช้คะแนน AI อยู่ — ผูกแล้วเส้นทาง CLI นั้นจะเงียบหายไปทั้งเส้น)
    adv = ai_mod.load(ctx) if ctx.get("ai.enabled", False) else None
    ai_w = float(ctx.get("ai.apply.score_weight", 0.0)) if adv else 0.0
    all_pieces = [dict(p) for p in pool["pieces"]]
    apply_order(all_pieces, ctx)      # ต้องมาก่อนทุกโหมด — ทุกโหมดเรียงด้วย _seq
    rank_of(all_pieces, ai_w)
    ok = [p for p in all_pieces if p["ok"]]

    picked, keeps_order, stats = PICKERS[mode](
        all_pieces if mode == "manual" else ok, cfg, ctx)

    # สองแกนมาเจอกันตรงนี้ — "เอาชิ้นไหน" เสร็จแล้ว เหลือ "เรียงยังไง"
    #   pattern    จัดลำดับด้วยการสลับประเภท ใช้คีย์ไปแล้วข้างในคิว → ห้ามเรียงทับ
    #   manual/ai  ลำดับเป็นรายการตรง ๆ → เรียงทับได้ถ้าคนเลือกอย่างอื่นที่ไม่ใช่ pick
    #   ที่เหลือ    เรียงตามที่เลือกเสมอ
    omode = order_mode(ctx)
    if not keeps_order or (mode in config.OWN_ORDER_MODES and omode != "pick"):
        if mode in config.OWN_ORDER_MODES:
            warn(f"[order] mode = {omode} เรียงทับลำดับที่โหมด {mode} จัดมาให้ "
                 "— อยากเก็บลำดับเดิมไว้ให้ตั้งเป็น pick (ตามที่วิธีเลือกจัดให้)")
        picked = order_pieces(picked, ctx, adv)
    # manual กับ ai เลือกชิ้นและลำดับมาเองแล้ว — ไม่เอา run_max ไปทับเจตนาคน
    run_dropped = []
    if mode not in ("manual", "ai"):
        picked, run_dropped = limit_runs(picked, int(ctx.get("broll.run_max", 0)))
    picked = keep_jump_together(picked)

    timeline = [{k: p[k] for k in SEG_KEYS if k in p} for p in picked]
    d_t = sum(s["dur"] for s in timeline if s["kind"] == "TALK")
    d_b = sum(s["dur"] for s in timeline if s["kind"] == "BROLL")

    chapters = []
    if adv:
        for ch in adv.get("chapters", []):
            segs = [s for s in timeline if s.get("chapter") == ch["id"]]
            if segs:
                chapters.append({"id": ch["id"], "title": ch["title"],
                                 "segments": len(segs),
                                 "duration": round(sum(s["dur"] for s in segs), 1)})

    edl = {
        "config": ctx.cfg.get("_meta", {}).get("config_files", []),
        "compose": {"mode": mode, "stats": stats,
                    "pool": pool["summary"], "dropped_run": len(run_dropped)},
        "ai": ({"goal": adv.get("goal", ""), "apply": ctx.get("ai.apply", {}),
                "tasks": list(adv.get("tasks", {}).keys())} if adv
               else {"enabled": False}),
        "chapters": chapters,
        "params": {"talk": ctx.get("talk", {}), "broll": ctx.get("broll", {}),
                   "order": ctx.get("order", {}), "compose": cfg,
                   "audio": ctx.get("audio", {}), "video": ctx.get("video", {}),
                   "encode": ctx.get("encode", {})},
        "summary": {
            "segments": len(timeline),
            "segments_talk": sum(1 for s in timeline if s["kind"] == "TALK"),
            "segments_broll": sum(1 for s in timeline if s["kind"] == "BROLL"),
            "segments_vertical": sum(1 for s in timeline if s["orient"] == "V"),
            "duration_talk": round(d_t, 1),
            "duration_broll": round(d_b, 1),
            "duration_total": round(d_t + d_b, 1),
            "clips_dropped_run": len(run_dropped),
        },
        "timeline": timeline,
    }
    if write:
        write_json(ctx.edl, edl)
        report(edl, pool)
    return edl


def report(edl, pool):
    s, cm = edl["summary"], edl["compose"]
    info("─" * 62)
    info(f"  วิธีเลือก          {c(cm['mode'], 'b')}"
         + ("   " + " · ".join(f"{k} {v}" for k, v in cm["stats"].items())
            if cm["stats"] else ""))
    info(f"  จากคลัง            {pool['summary']['usable']} ชิ้น "
         f"→ ใช้จริง {s['segments']} ชิ้น "
         f"({s['segments_talk']} พูด + {s['segments_broll']} วิว)")
    info(f"  ช่วงพูด           {s['duration_talk'] / 60:>6.1f} นาที")
    info(f"  ช่วงวิว            {s['duration_broll'] / 60:>6.1f} นาที")
    total = c(f"{s['duration_total'] / 60:>6.1f} นาที", "g")
    info(f"  {c('รวม', 'g')}               {total}")
    if cm["dropped_run"]:
        info(f"  ตัดเพราะวิวติดกันเกิน  {cm['dropped_run']:>3} ชิ้น")
    info("─" * 62)
    for i, ch in enumerate(edl.get("chapters", []), 1):
        mins = c(f"{ch['duration'] / 60:.1f} นาที", "d")
        info(f"  {c('บท ' + str(i), 'b')} {ch['title']:<26} {ch['segments']:>3} ชิ้น  {mins}")
    if edl.get("chapters"):
        info("─" * 62)
    seq = "".join("T" if x["kind"] == "TALK" else "B" for x in edl["timeline"])
    for i in range(0, min(len(seq), 300), 60):
        info(f"  {c(seq[i:i + 60], 'd')}")
    if len(seq) > 300:
        info(f"  {c('… (' + str(len(seq)) + ' ชิ้น)', 'd')}")
    info(f"  {c('T = ช่วงพูด   B = ช่วงวิว', 'd')}")
